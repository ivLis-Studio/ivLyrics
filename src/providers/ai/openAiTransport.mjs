import { normalizePromptRequest } from "./aiProviderInputs.mjs";
import { createStreamingOutput } from "./aiStreamingOutput.mjs";
import { createResponsesAPIError, readChatCompletion, readOpenAiStream } from "./openAiResponseReader.mjs";
import { isSupersededAbort, throwIfAiRequestAborted, waitForAiRetry } from "./aiRequestCancellation.mjs";

export function isOpenAIReasoningModel(model) {
    const name = String(model || '').trim().toLowerCase().replace(/^.*\//, '');
    if (!name || name.includes('-chat')) return false;
    if (/^o\d/.test(name)) return true;
    const generation = /^gpt-(\d+)/.exec(name);
    // Azure names its GPT-3.5 deployments "gpt-35-turbo".
    return !!generation && generation[1] !== '35' && Number(generation[1]) >= 5;
}

export function createOpenAiTransport({
    getAiRequest, readRequestAttempts, debug, normalizeBaseUrl, defaultBaseUrl: DEFAULT_OPENAI_BASE_URL, extractJSON,
    getRequestTargets, ensureRequestTargets, getRequestBodyMergePatch, mergeRequestBody,
}) {
    function buildChatGPTRequestBody(model, prompt, { stream = false } = {}) {
        const { systemPrompt, userPrompt } = normalizePromptRequest(prompt);
        const requestBody = {
            model,
            messages: [
                ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
                { role: 'user', content: userPrompt }
            ]
        };

        const mergedBody = mergeRequestBody(requestBody, getRequestBodyMergePatch());

        // Streaming callers rely on receiving an early response byte so long
        // generations are not dropped by an upstream proxy while it waits for
        // the complete JSON document. Do not let an advanced merge patch turn
        // streaming back off for those calls.
        if (stream) mergedBody.stream = true;

        return mergedBody;
    }

    function buildResponsesRequestBody(model, prompt) {
        const { systemPrompt, userPrompt } = normalizePromptRequest(prompt);
        const patch = { ...getRequestBodyMergePatch() };

        if (patch.max_output_tokens === undefined) {
            patch.max_output_tokens = patch.max_completion_tokens ?? patch.max_tokens ?? 16000;
        }
        delete patch.max_completion_tokens;
        delete patch.max_tokens;
        delete patch.messages;
        delete patch.input;
        delete patch.instructions;
        delete patch.model;
        delete patch.stream;
        delete patch.tools;

        return mergeRequestBody({
            model,
            ...(systemPrompt ? { instructions: systemPrompt } : {}),
            input: userPrompt,
            tools: [{ type: 'web_search' }],
            // Research explicitly starts with a live search attempt. If the
            // selected model cannot call the tool, the manager retries without it.
            tool_choice: 'required',
            stream: true,
            store: false
        }, patch);
    }

    // Reasoning models (o-series, GPT-5 and later) answer HTTP 400 when a
    // request carries sampling parameters such as temperature or top_p. The
    // default patch sends temperature and the settings screen saves that
    // patch, so the keys are dropped per request for these models rather than
    // only from the default. Chat-tuned variants (gpt-5-chat-latest) keep them.
    const REASONING_UNSUPPORTED_SAMPLING_KEYS = ['temperature', 'top_p'];

    // Remember rejected optional fields per endpoint and model.
    const rejectedRequestFields = new Map();

    function getRejectedRequestFieldsKey(baseUrl, model) {
        return JSON.stringify([normalizeBaseUrl(baseUrl), String(model || '').trim()]);
    }

    function adaptRequestBodyForModel(body, baseUrl, model) {
        const rejected = rejectedRequestFields.get(getRejectedRequestFieldsKey(baseUrl, model));
        const result = { ...body };
        if (rejected?.sampling || isOpenAIReasoningModel(model)) {
            for (const key of REASONING_UNSUPPORTED_SAMPLING_KEYS) delete result[key];
        }
        if (rejected?.maxTokens && result.max_tokens !== undefined) {
            if (result.max_completion_tokens === undefined) result.max_completion_tokens = result.max_tokens;
            delete result.max_tokens;
        }
        return result;
    }

    async function readRejectedRequestError(response) {
        if (response?.status !== 400 || typeof response?.clone !== 'function') return null;
        try {
            const rawText = String(await response.clone().text() || '').trim();
            let error = null;
            try {
                const parsed = JSON.parse(rawText);
                error = parsed?.error && typeof parsed.error === 'object' ? parsed.error : parsed;
            } catch {
                // Plain-text error body.
            }
            return {
                param: String(error?.param || '').trim().toLowerCase(),
                code: String(error?.code || '').toLowerCase(),
                message: String(error?.message || (error ? '' : rawText))
            };
        } catch {
            return null;
        }
    }

    // Retry when this request still carried an unsupported field. Another
    // in-flight request may already have learned it while this one was pending.
    async function learnRejectedRequestFields(response, baseUrl, model, body) {
        const error = await readRejectedRequestError(response);
        if (!error) return false;
        const unsupported = error.code.includes('unsupported')
            || /unsupported|not supported|does not support|only the default/i.test(error.message);
        if (!unsupported) return false;
        const names = field => error.param === field || new RegExp(`\\b${field}\\b`, 'i').test(error.message);
        const key = getRejectedRequestFieldsKey(baseUrl, model);
        const rejected = { ...(rejectedRequestFields.get(key) || {}) };
        const rejectedSampling = REASONING_UNSUPPORTED_SAMPLING_KEYS.some(field => body?.[field] !== undefined && names(field));
        const rejectedMaxTokens = body?.max_tokens !== undefined && names('max_tokens');
        if (!rejectedSampling && !rejectedMaxTokens) return false;
        if (rejectedSampling) rejected.sampling = true;
        if (rejectedMaxTokens) rejected.maxTokens = true;
        rejectedRequestFields.set(key, rejected);
        return true;
    }

    // POSTs a JSON body built for this endpoint and model. When the endpoint
    // rejects a field the addon can omit (sampling parameters on reasoning
    // models, max_tokens where max_completion_tokens is required), the body is
    // rebuilt and re-sent before any response text reaches the caller.
    async function postOpenAIRequest(endpoint, apiKey, baseUrl, model, buildBody, requestTimeoutMs, signal) {
        for (let pass = 0; ; pass++) {
            throwIfAiRequestAborted(signal);
            const body = adaptRequestBodyForModel(buildBody(), baseUrl, model);
            const response = await getAiRequest()(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify(body),
                ...(signal ? { signal } : {}),
            }, requestTimeoutMs);
            if (pass >= 2 || !(await learnRejectedRequestFields(response, baseUrl, model, body))) {
                return response;
            }
            response.body?.cancel?.()?.catch(() => {});
        }
    }

    function getHttpStatusHint(status) {
        if (status === 401) return ' — invalid API key or permission denied';
        if (status === 403) return ' — check the API key and account credits/quota';
        if (status === 404) return ' — check the endpoint Base URL and Model ID (refresh the model list with ↻)';
        if (status === 410) return ' — the model appears retired; pick a current model from the refreshed list';
        if (status === 429) return ' — rate limited';
        return '';
    }

    async function buildHttpErrorDetail(response) {
        const status = response?.status;
        const hint = getHttpStatusHint(status);
        let detail = '';
        try {
            const rawText = typeof response?.clone === 'function'
                ? await response.clone().text()
                : '';
            const trimmed = String(rawText || '').trim();
            if (trimmed) {
                let parsedMessage = '';
                try {
                    const parsed = JSON.parse(trimmed);
                    parsedMessage = parsed?.error?.message || parsed?.error?.code || parsed?.message || '';
                } catch {
                    // Plain-text error body (e.g. "404 page not found").
                }
                detail = parsedMessage || trimmed.slice(0, 200);
            }
        } catch {
            // Unreadable body; fall through to the generic status below.
        }
        if (!detail) return `HTTP ${status}${hint}`;
        // A terse server body (e.g. NIM's bare "404 page not found") still
        // needs the actionable hint; descriptive messages stay untouched
        // except for statuses where the next step is always the same.
        if (status === 403 || status === 404 || status === 410) return `${detail}${hint}`;
        return detail;
    }

    function isResponsesApiUnsupported(error) {
        return error?.responsesApiUnsupported === true
            || /HTTP (404|405)\b|404 page not found/.test(String(error?.message || ''));
    }

    async function readResponsesHttpError(response) {
        let data = null;
        try { data = await response.json(); } catch { /* Non-JSON gateway response. */ }
        const unsupported = response.status === 404 || response.status === 405;
        const hint = unsupported ? ' — this endpoint does not support the Responses API' : getHttpStatusHint(response.status);
        const error = createResponsesAPIError(data, `HTTP ${response.status}${hint}`);
        if (unsupported) error.responsesApiUnsupported = true;
        return error;
    }

    async function requestFromTargets({
        prompt, maxRetries = readRequestAttempts(), transformResult, capability,
        requestTimeoutMs = getAiRequest()?.DEFAULT_TIMEOUT_MS || 90_000,
        callbacks = null, responsesApi = false, targetsOverride, signal,
    }) {
        throwIfAiRequestAborted(signal);
        const targets = ensureRequestTargets(targetsOverride || getRequestTargets(capability), capability);
        const prefix = responsesApi ? '[ChatGPT Web Search]' : '[ChatGPT]';
        const attemptLabel = responsesApi ? 'Responses API attempt' : callbacks ? 'Stream attempt' : 'Attempt';
        const resetLabel = responsesApi ? 'Responses API stream' : 'provisional stream';
        let lastError = null;

        for (const target of targets) {
            const { apiKey, baseUrl, model } = target;
            if (!model) {
                debug(`[ChatGPT Addon] Skipping ${target.label}: no model configured.`);
                continue;
            }

            const buildBody = responsesApi
                ? () => buildResponsesRequestBody(model, prompt)
                : () => buildChatGPTRequestBody(model, prompt, { stream: !!callbacks });

            for (let attempt = 0; attempt < maxRetries; attempt++) {
                const output = callbacks && createStreamingOutput({
                    ...callbacks,
                    onResetError: error => debug(`[ChatGPT Addon] Failed to reset ${resetLabel}:`, error?.message),
                });
                try {
                    const endpoint = responsesApi
                        ? `${normalizeBaseUrl(baseUrl)}/responses`
                        : `${baseUrl.replace(/\/$/, '')}/chat/completions`;
                    const response = await postOpenAIRequest(endpoint, apiKey, baseUrl, model, buildBody, requestTimeoutMs, signal);
                    if (response.status === 429 || response.status === 403) {
                        if (!responsesApi) {
                            debug(`[ChatGPT Addon] ${callbacks ? 'Stream: target' : 'Target'} ${target.label} failed (${response.status}), trying next...`);
                        }
                        lastError = new Error(`${prefix} ${target.label || 'Endpoint'} failed: HTTP ${response.status}${getHttpStatusHint(response.status)}`);
                        response.body?.cancel?.()?.catch(() => {});
                        break;
                    }
                    if (!responsesApi && response.status === 401) {
                        lastError = new Error(`[ChatGPT] ${await buildHttpErrorDetail(response)}`);
                        break;
                    }
                    if (!response.ok) {
                        if (responsesApi) throw await readResponsesHttpError(response);
                        throw new Error(`[ChatGPT] ${await buildHttpErrorDetail(response)}`);
                    }
                    if (output) {
                        return await readOpenAiStream(response, output, {
                            responsesApi, onRawChunk: callbacks.onRawChunk, transformResult,
                        });
                    }

                    const { text } = readChatCompletion(await response.json());
                    if (!text.trim()) throw new Error('[ChatGPT] Empty response from API');
                    return typeof transformResult === 'function' ? transformResult(text) : text;
                } catch (error) {
                    throwIfAiRequestAborted(signal);
                    if (isSupersededAbort(error)) throw error;
                    lastError = error;
                    debug(`[ChatGPT Addon] ${attemptLabel} ${attempt + 1} failed:`, error.message);
                    const willRetry = attempt < maxRetries - 1;
                    output?.reset(willRetry ? 'retry' : 'failed', error);
                    const credentialsRejected = responsesApi
                        ? /invalid api key|permission denied/i.test(error.message)
                        : error.message.includes('Invalid API key') || error.message.includes('permission denied');
                    if (credentialsRejected) break;
                    if (willRetry) await waitForAiRetry(1000 * (attempt + 1), signal);
                }
            }
        }

        throw lastError || new Error(`${prefix} All API keys and retries exhausted`);
    }

    function callChatGPTAPIRaw(prompt, maxRetries, transformResult, requestTimeoutMs, capability = null, signal) {
        return requestFromTargets({ prompt, maxRetries, transformResult, requestTimeoutMs, capability, signal });
    }

    function callResponsesAPIStream(
        prompt, onLine, onStreamReset, maxRetries, transformResult, requestTimeoutMs,
        onRawChunk, capability = null, targetsOverride = null, signal,
    ) {
        return requestFromTargets({
            prompt, maxRetries, transformResult, requestTimeoutMs, capability, targetsOverride, signal,
            callbacks: { onLine, onStreamReset, onRawChunk }, responsesApi: true,
        });
    }

    function callChatGPTAPIStream(
        prompt, onLine, onStreamReset, maxRetries, transformResult, requestTimeoutMs,
        onRawChunk, capability = null, targetsOverride = null, signal,
    ) {
        return requestFromTargets({
            prompt, maxRetries, transformResult, requestTimeoutMs, capability, targetsOverride, signal,
            callbacks: { onLine, onStreamReset, onRawChunk },
        });
    }

    /**
     * Call ChatGPT API and parse JSON response (for metadata, TMI, etc.)
     */
    async function callChatGPTAPI(
        prompt,
        maxRetries = readRequestAttempts(),
        requestTimeoutMs = getAiRequest()?.DEFAULT_TIMEOUT_MS || 90_000,
        capability = null,
        signal,
    ) {
        return callChatGPTAPIRaw(prompt, maxRetries, extractJSON, requestTimeoutMs, capability, signal);
    }

    /**
     * Test one endpoint target directly (used by per-endpoint Test buttons).
     */
    async function testSingleTarget(target) {
        const baseUrl = normalizeBaseUrl(target.baseUrl) || DEFAULT_OPENAI_BASE_URL;
        const apiKey = String(target.apiKey || '').trim();
        const model = String(target.model || '').trim();
        if (!apiKey) throw new Error('[ChatGPT] API key is required.');
        if (!model) throw new Error('[ChatGPT] Model is required.');
        const endpoint = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
        let patch = null;
        try {
            patch = getRequestBodyMergePatch();
        } catch {
            patch = null;
        }
        const buildBody = () => patch && typeof patch === 'object'
            ? mergeRequestBody({ model, messages: [{ role: 'user', content: 'Reply with just "OK" if you receive this.' }] }, patch)
            : { model, messages: [{ role: 'user', content: 'Reply with just "OK" if you receive this.' }] };
        const response = await postOpenAIRequest(endpoint, apiKey, baseUrl, model, buildBody);
        if (!response.ok) {
            throw new Error(`[ChatGPT] ${await buildHttpErrorDetail(response)}`);
        }
        const { text } = readChatCompletion(await response.json());
        if (!text.trim()) throw new Error('[ChatGPT] Empty response from API');
        return text;
    }

    return {
        isResponsesApiUnsupported, requestFromTargets, callChatGPTAPIRaw, callResponsesAPIStream, callChatGPTAPIStream, callChatGPTAPI, testSingleTarget,
    };
}
