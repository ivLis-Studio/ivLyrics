import { normalizePromptRequest } from "./aiProviderInputs.mjs";
import { extractJSON } from "./aiResponseParsing.mjs";
import { createStreamingOutput } from "./aiStreamingOutput.mjs";
import { consumeJsonSse, hasBufferedJsonBody } from "./aiEventStream.mjs";
import { createChatCompletionReader } from "./chatCompletionResponse.mjs";
import { isSupersededAbort, throwIfAiRequestAborted, waitForAiRetry } from "./aiRequestCancellation.mjs";

const finishReasonOf = (choice) => String(choice?.finish_reason ?? '').trim().toLowerCase();

const defaultMissingKeyMessage = streaming => streaming
    ? 'API key is required.'
    : 'API key is required. Please configure your API key in settings.';

function readTextOnlyChoice(data, streaming, error, rejectResponse) {
    const choice = data?.choices?.[0];
    const responseError = data?.error || choice?.error;
    if (responseError) {
        throw error(typeof responseError === 'string'
            ? responseError
            : responseError.message || responseError.type || data?.message || 'API response error');
    }
    const finishReason = finishReasonOf(choice);
    if (finishReason && finishReason !== 'stop') throw rejectResponse(finishReason);
    if (!streaming && finishReason !== 'stop') throw rejectResponse('');
    const part = streaming ? choice?.delta : choice?.message;
    const refusal = part?.refusal;
    if ((typeof refusal === 'string' && refusal.trim()) || (refusal && typeof refusal !== 'string')) {
        throw rejectResponse('refusal', typeof refusal === 'string' ? refusal : 'Request refused');
    }
    return { text: typeof part?.content === 'string' ? part.content : '', finishReason };
}

export function createChatCompletionsClient({
    provider, rejectionCode, endpoint, getAiRequest, debug, extraHeaders,
    logName = provider,
    missingKeyMessage = defaultMissingKeyMessage,
    streamExhaustedMessage = 'All API keys and retries exhausted',
    textOnlyResponses = false,
    preserveHttpStatus = false,
    isPermanentError = cause => cause.message.includes('Invalid API key') || cause.message.includes('permission denied'),
}) {
    const error = (message) => new Error(`[${provider}] ${message}`);

    const { readChoice: readStandardChoice, rejectResponse } = createChatCompletionReader(provider, rejectionCode);
    const readChoice = textOnlyResponses
        ? (data, streaming) => readTextOnlyChoice(data, streaming, error, rejectResponse)
        : readStandardChoice;

    async function createHttpError(response, streaming) {
        let message = response.status === 401 && !streaming && !textOnlyResponses
            ? 'Invalid API key or permission denied.'
            : `HTTP ${response.status}`;
        try {
            const data = await response.json();
            if (data.error?.message) message = data.error.message;
            else if (textOnlyResponses && data.message) message = data.message;
        } catch {
            // The HTTP status is sufficient for non-JSON errors.
        }
        const cause = error(message);
        if (preserveHttpStatus) cause.status = response.status;
        return cause;
    }

    function post(apiKey, body, timeoutMs, signal) {
        const options = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}`, ...extraHeaders },
            body: JSON.stringify(body),
            ...(signal ? { signal } : {}),
        };
        const request = getAiRequest();
        return timeoutMs === undefined ? request(endpoint, options) : request(endpoint, options, timeoutMs);
    }

    async function readStream(response, output, transformResult) {
        let finishReason = '';

        function appendChoice(data, streaming) {
            const chunk = readChoice(data, streaming);
            output.append(chunk.text);
            if (chunk.finishReason) finishReason = chunk.finishReason;
        }

        if (hasBufferedJsonBody(response)) {
            appendChoice(await response.json(), false);
        } else {
            await consumeJsonSse(response.body, {
                onEvent: data => appendChoice(data, true),
                onChunk: output.emit,
            });
        }
        if (textOnlyResponses && finishReason !== 'stop') throw rejectResponse('');
        output.emit(true);

        if (finishReason !== 'stop') throw rejectResponse(finishReason);
        if (!output.text.trim()) throw error('Empty response from streaming API');
        return output.finish(output.text, transformResult, { clearEmptyLines: textOnlyResponses });
    }

    async function request({ apiKeys, buildBody, attempts, transformResult, stream, timeoutMs, signal }) {
        throwIfAiRequestAborted(signal);
        if (!apiKeys.length) {
            throw error(missingKeyMessage(!!stream));
        }
        let lastError = null;
        for (const [keyIndex, apiKey] of apiKeys.entries()) {
            for (let attempt = 0; attempt < attempts; attempt++) {
                const output = stream && createStreamingOutput({
                    ...stream,
                    onResetError: resetError => debug(`[${logName} Addon] Failed to reset provisional stream:`, resetError?.message),
                });
                try {
                    throwIfAiRequestAborted(signal);
                    const response = await post(apiKey, buildBody(), timeoutMs, signal);
                    if (response.status === 429 || response.status === 403) {
                        if (preserveHttpStatus) lastError = await createHttpError(response, !!stream);
                        if (!stream) debug(`[${logName} Addon] API key ${keyIndex + 1} failed (${response.status}), trying next...`);
                        break;
                    }
                    if (!response.ok || (!stream && response.status === 401)) throw await createHttpError(response, !!stream);
                    if (output) return await readStream(response, output, transformResult);

                    const { text } = readChoice(await response.json(), false);
                    if (!text.trim()) throw error('Empty response from API');
                    return typeof transformResult === 'function' ? transformResult(text) : text;
                } catch (cause) {
                    throwIfAiRequestAborted(signal);
                    if (isSupersededAbort(cause)) throw cause;
                    lastError = cause;
                    const permanent = isPermanentError(cause);
                    const willRetry = attempt < attempts - 1 && !(preserveHttpStatus && permanent);
                    if (output) output.reset(willRetry ? 'retry' : 'failed', cause);
                    else debug(`[${logName} Addon] Attempt ${attempt + 1} failed:`, cause.message);
                    if (permanent) throw cause;
                    if (willRetry) await waitForAiRetry(1000 * (attempt + 1), signal);
                }
            }
        }
        throw lastError || error(stream ? streamExhaustedMessage : 'All API keys and retries exhausted');
    }

    return { request };
}

// The compatible providers share a request shape. Research can override
// model parameters, while regular requests retain the saved advanced options.
export function createChatCompletionRequests({
    client, getApiKeys, getSelectedModel, getAdvancedRequestParams, readAttempts, getAiRequest,
    rawTimeout = false, selectModelBeforeKeys = false, parseJsonInAttempt = false,
}) {
    const readTimeout = () => getAiRequest()?.DEFAULT_TIMEOUT_MS || 90_000;

    function request(prompt, { attempts, transformResult, signal, timeoutMs, stream, model: overrideModel, body: overrides }) {
        let model = selectModelBeforeKeys ? overrideModel || getSelectedModel() : null;
        const apiKeys = getApiKeys();
        if (!selectModelBeforeKeys && apiKeys.length) model = overrideModel || getSelectedModel();
        return client.request({
            apiKeys, attempts, transformResult, signal, timeoutMs, stream,
            buildBody() {
                const { systemPrompt, userPrompt } = normalizePromptRequest(prompt);
                return {
                    model,
                    messages: [
                        ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
                        { role: 'user', content: userPrompt },
                    ],
                    ...getAdvancedRequestParams(),
                    ...overrides,
                    ...(stream ? { stream: true } : {}),
                };
            },
        });
    }

    function raw(prompt, { attempts = readAttempts(), transformResult = null, signal } = {}) {
        const timeoutMs = rawTimeout ? readTimeout() : undefined;
        return request(prompt, { attempts, transformResult, signal, timeoutMs });
    }

    function stream(prompt, {
        attempts = readAttempts(), transformResult = null, signal, timeoutMs = readTimeout(),
        onLine, onStreamReset, onRawChunk = null, model, body,
    } = {}) {
        return request(prompt, {
            attempts, transformResult, signal, timeoutMs, model, body, stream: { onLine, onStreamReset, onRawChunk },
        });
    }

    async function json(prompt, signal) {
        if (parseJsonInAttempt) return await raw(prompt, { transformResult: extractJSON, signal });
        return extractJSON(await raw(prompt, { signal }));
    }

    return { raw, stream, json };
}
