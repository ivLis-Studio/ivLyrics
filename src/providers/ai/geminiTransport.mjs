import { isSupersededAbort, throwIfAiRequestAborted, waitForAiRetry } from "./aiRequestCancellation.mjs";
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
    async function callGeminiAPIRaw(prompt, maxRetries = readRequestAttempts(), transformResult = null, signal) {
        const apiKeys = getApiKeys();
        if (apiKeys.length === 0) {
            throw new Error('[Gemini] API key is required. Please configure your Gemini API key in settings.');
        }

        const model = getSelectedModel();
        if (!model) {
            throw new Error('[Gemini] Model is not selected. Please select a model in settings.');
        }
        const { systemPrompt, userPrompt } = normalizePromptRequest(prompt);
        let lastError = null;

        for (let keyIndex = 0; keyIndex < apiKeys.length; keyIndex++) {
            const apiKey = apiKeys[keyIndex];

            for (let attempt = 0; attempt < maxRetries; attempt++) {
                try {
                    throwIfAiRequestAborted(signal);
                    const baseUrl = getBaseUrl();
                    const endpoint = `${baseUrl.replace(/\/$/, '')}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

                    const response = await getAiRequest()(endpoint, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        ...(signal ? { signal } : {}),
                        body: JSON.stringify({
                            ...(systemPrompt ? {
                                systemInstruction: { parts: [{ text: systemPrompt }] }
                            } : {}),
                            contents: [{
                                role: 'user',
                                parts: [{ text: userPrompt }]
                            }],
                            generationConfig: getGenerationConfig()
                        })
                    });

                    if (response.status === 429 || response.status === 403) {
                        debug(`[Gemini Addon] API key ${keyIndex + 1} failed (${response.status}), trying next...`);
                        break; // Try next key
                    }

                    if (!response.ok) {
                        // Try to parse error response for better error messages
                        let errorMessage = `HTTP ${response.status}`;
                        try {
                            const errorData = await response.json();
                            if (errorData.error?.message) {
                                errorMessage = errorData.error.message;
                            }
                        } catch (parseError) {
                            // Use default error message if parsing fails
                        }
                        throw new Error(`[Gemini] ${errorMessage}`);
                    }

                    const data = await response.json();
                    const { text: rawText } = readGeminiResponse(data);

                    if (!rawText.trim()) {
                        throw new Error('[Gemini] Empty response from API');
                    }

                    return typeof transformResult === 'function'
                        ? transformResult(rawText)
                        : rawText;

                } catch (e) {
                    throwIfAiRequestAborted(signal);
                    if (isSupersededAbort(e)) throw e;
                    lastError = e;
                    debug(`[Gemini Addon] Attempt ${attempt + 1} failed:`, e.message);

                    if (attempt < maxRetries - 1) {
                        await waitForAiRetry(1000 * (attempt + 1), signal);
                    }
                }
            }
        }

        throw lastError || new Error('[Gemini] All API keys and retries exhausted');
    }

    async function callGeminiAPIStream(
        prompt,
        onLine,
        onStreamReset,
        maxRetries = readRequestAttempts(),
        transformResult = null,
        requestTimeoutMs = getAiRequest()?.DEFAULT_TIMEOUT_MS || 90_000,
        onRawChunk = null,
        requestOverrides = {},
        signal,
    ) {
        const apiKeys = getApiKeys();
        if (apiKeys.length === 0) throw new Error('[Gemini] API key is required.');
        const model = getSelectedModel();
        if (!model) throw new Error('[Gemini] Model is not selected.');
        const { systemPrompt, userPrompt } = normalizePromptRequest(prompt);
        let lastError = null;

        for (let keyIndex = 0; keyIndex < apiKeys.length; keyIndex++) {
            const apiKey = apiKeys[keyIndex];
            for (let attempt = 0; attempt < maxRetries; attempt++) {
                const output = createStreamingOutput({
                    onLine, onRawChunk, onStreamReset,
                    onResetError: error => debug('[Gemini Addon] Failed to reset provisional stream:', error?.message),
                });

                try {
                    throwIfAiRequestAborted(signal);
                    const baseUrl = getBaseUrl();
                    const endpoint = `${baseUrl.replace(/\/$/, '')}/models/${model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`;

                    const response = await getAiRequest()(endpoint, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        ...(signal ? { signal } : {}),
                        body: JSON.stringify({
                            ...(systemPrompt ? {
                                systemInstruction: { parts: [{ text: systemPrompt }] }
                            } : {}),
                            contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
                            generationConfig: getGenerationConfig(),
                            ...requestOverrides
                        })
                    }, requestTimeoutMs);

                    if (response.status === 429 || response.status === 403) { break; }
                    if (!response.ok) {
                        let msg = `HTTP ${response.status}`;
                        try { const d = await response.json(); if (d.error?.message) msg = d.error.message; } catch (e) { }
                        throw new Error(`[Gemini] ${msg}`);
                    }

                    return await consumeGeminiStream(response, output, transformResult);

                } catch (e) {
                    throwIfAiRequestAborted(signal);
                    if (isSupersededAbort(e)) throw e;
                    lastError = e;
                    output.reset(attempt < maxRetries - 1 ? 'retry' : 'failed', e);
                    if (attempt < maxRetries - 1) await waitForAiRetry(1000 * (attempt + 1), signal);
                }
            }
        }
        throw lastError || new Error('[Gemini] All API keys and retries exhausted');
    }

    async function callGeminiAPI(prompt, maxRetries = readRequestAttempts(), signal) {
        const rawText = await callGeminiAPIRaw(prompt, maxRetries, null, signal);
        return extractJSON(rawText);
    }

    return { callGeminiAPIRaw, callGeminiAPIStream, callGeminiAPI };
}
