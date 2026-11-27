import { throwIfAiRequestAborted } from "./aiRequestCancellation.mjs";
import { requestWithAiKeys } from "./aiKeyRotation.mjs";
import { normalizePromptRequest } from "./aiProviderInputs.mjs";
import { extractJSON } from "./aiResponseParsing.mjs";
import { createStreamingOutput } from "./aiStreamingOutput.mjs";
import { consumeJsonSse, hasBufferedJsonBody } from "./aiEventStream.mjs";

const normalizeGeminiReason = (value) => String(value ?? '').trim().toUpperCase();

function createGeminiResponseError(reason, message = '') {
    const normalizedReason = normalizeGeminiReason(reason) || 'UNKNOWN';
    const detail = String(message || '').trim();
    const error = new Error(`[Gemini] Response rejected (${normalizedReason})${detail ? `: ${detail}` : ''}`);
    error.code = 'GEMINI_RESPONSE_REJECTED';
    error.reason = normalizedReason;
    return error;
}

function validateGeminiFinishReason(reason, allowUnspecified = false) {
    const normalizedReason = normalizeGeminiReason(reason);
    const isUnspecified = !normalizedReason ||
        normalizedReason === 'FINISH_REASON_UNSPECIFIED' ||
        normalizedReason === 'UNSPECIFIED' ||
        normalizedReason === '0';
    if (isUnspecified) {
        if (allowUnspecified) return '';
        throw createGeminiResponseError('MISSING_FINISH_REASON');
    }
    if (normalizedReason !== 'STOP') {
        throw createGeminiResponseError(normalizedReason);
    }
    return normalizedReason;
}

function readGeminiResponse(data, allowUnspecifiedFinishReason = false) {
    if (data?.error) {
        throw new Error(`[Gemini] ${data.error.message || data.error.status || 'API response error'}`);
    }

    const blockReason = normalizeGeminiReason(data?.promptFeedback?.blockReason);
    if (blockReason && blockReason !== 'BLOCK_REASON_UNSPECIFIED' && blockReason !== 'UNSPECIFIED' && blockReason !== '0') {
        throw createGeminiResponseError(blockReason, data?.promptFeedback?.blockReasonMessage);
    }

    const candidate = data?.candidates?.[0];
    const finishReason = validateGeminiFinishReason(candidate?.finishReason, allowUnspecifiedFinishReason);

    const text = (candidate?.content?.parts || [])
        .filter(part => part?.thought !== true && typeof part?.text === 'string')
        .map(part => part.text)
        .join('');
    return { text, finishReason };
}

async function consumeGeminiStream(response, output, transformResult) {
    if (hasBufferedJsonBody(response)) {
        output.append(readGeminiResponse(await response.json()).text);
        output.emit(true);
    } else {
        let finalFinishReason = '';
        await consumeJsonSse(response.body, {
            onEvent(data) {
                const { text, finishReason } = readGeminiResponse(data, true);
                output.append(text);
                if (!finishReason) return;
                finalFinishReason = finishReason;
                return false;
            },
            onChunk: output.emit,
        });
        output.emit(true);
        validateGeminiFinishReason(finalFinishReason);
    }
    if (!output.text.trim()) throw new Error('[Gemini] Empty response from streaming API');
    return output.finish(output.text, transformResult);
}

export function createGeminiTransport({
    getAiRequest, getApiKeys, getBaseUrl, getSelectedModel, getGenerationConfig, readRequestAttempts, debug,
}) {
    async function requestGemini(prompt, { attempts, transformResult, signal, stream, timeoutMs, overrides }) {
        const apiKeys = getApiKeys();
        if (apiKeys.length === 0) {
            throw new Error(stream
                ? '[Gemini] API key is required.'
                : '[Gemini] API key is required. Please configure your Gemini API key in settings.');
        }
        const model = getSelectedModel();
        if (!model) {
            throw new Error(stream ? '[Gemini] Model is not selected.' : '[Gemini] Model is not selected. Please select a model in settings.');
        }
        const { systemPrompt, userPrompt } = normalizePromptRequest(prompt);
        const action = stream ? 'streamGenerateContent?alt=sse&key=' : 'generateContent?key=';
        const contents = [{ role: 'user', parts: [{ text: userPrompt }] }];
        const systemInstruction = systemPrompt ? { parts: [{ text: systemPrompt }] } : undefined;

        return requestWithAiKeys({
            apiKeys, attempts, signal,
            exhaustedMessage: '[Gemini] All API keys and retries exhausted',
            createOutput: stream && (() => createStreamingOutput({
                ...stream,
                onResetError: error => debug('[Gemini Addon] Failed to reset provisional stream:', error?.message),
            })),
            async run({ key, keyNumber, output, nextKey }) {
                throwIfAiRequestAborted(signal);
                const baseUrl = getBaseUrl();
                const endpoint = `${baseUrl.replace(/\/$/, '')}/models/${model}:${action}${encodeURIComponent(key)}`;
                const request = getAiRequest();
                const options = {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    ...(signal ? { signal } : {}),
                    body: JSON.stringify({ systemInstruction, contents, generationConfig: getGenerationConfig(), ...overrides }),
                };
                const response = stream ? await request(endpoint, options, timeoutMs) : await request(endpoint, options);

                if (response.status === 429 || response.status === 403) {
                    if (!stream) debug(`[Gemini Addon] API key ${keyNumber} failed (${response.status}), trying next...`);
                    return nextKey();
                }
                if (!response.ok) {
                    let message = `HTTP ${response.status}`;
                    try {
                        const data = await response.json();
                        if (data.error?.message) message = data.error.message;
                    } catch {
                        // Keep the HTTP status if the API did not return a JSON error.
                    }
                    throw new Error(`[Gemini] ${message}`);
                }
                if (output) return await consumeGeminiStream(response, output, transformResult);

                const { text } = readGeminiResponse(await response.json());
                if (!text.trim()) throw new Error('[Gemini] Empty response from API');
                return typeof transformResult === 'function' ? transformResult(text) : text;
            },
            onError(error, { attemptNumber, output, willRetry }) {
                if (output) output.reset(willRetry ? 'retry' : 'failed', error);
                else debug(`[Gemini Addon] Attempt ${attemptNumber} failed:`, error.message);
            },
        });
    }

    async function callGeminiAPIRaw(prompt, attempts = readRequestAttempts(), transformResult = null, signal) {
        return requestGemini(prompt, { attempts, transformResult, signal });
    }

    async function callGeminiAPIStream(
        prompt,
        onLine,
        onStreamReset,
        attempts = readRequestAttempts(),
        transformResult = null,
        timeoutMs = getAiRequest()?.DEFAULT_TIMEOUT_MS || 90_000,
        onRawChunk = null,
        overrides = {},
        signal,
    ) {
        return requestGemini(prompt, {
            attempts, transformResult, signal, timeoutMs, overrides, stream: { onLine, onStreamReset, onRawChunk },
        });
    }

    async function callGeminiAPI(prompt, maxRetries = readRequestAttempts(), signal) {
        const rawText = await callGeminiAPIRaw(prompt, maxRetries, null, signal);
        return extractJSON(rawText);
    }

    return { callGeminiAPIRaw, callGeminiAPIStream, callGeminiAPI };
}
