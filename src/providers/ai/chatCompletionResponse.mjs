export function createChatCompletionReader(provider, rejectionCode) {
    const error = message => new Error(`[${provider}] ${message}`);

    function rejectResponse(reason, detail = '') {
        const normalizedReason = reason || 'missing_finish_reason';
        const message = String(detail || '').trim();
        return Object.assign(error(`Response rejected (${normalizedReason})${message ? `: ${message}` : ''}`), {
            code: rejectionCode,
            reason: normalizedReason,
        });
    }

    function readChoice(data, streaming = false) {
        if (data?.error) {
            throw error(data.error.message || data.error.code || 'API response error');
        }
        const choice = data?.choices?.[0];
        if (!choice) {
            if (streaming) return { text: '', finishReason: '' };
            throw rejectResponse('missing_choice');
        }
        if (choice.error) {
            const detail = typeof choice.error === 'string'
                ? choice.error
                : choice.error.message || choice.error.code || 'Choice response error';
            throw error(detail);
        }

        const part = streaming ? choice.delta : choice.message;
        const refusal = part?.refusal;
        if ((typeof refusal === 'string' && refusal.trim()) || (refusal && typeof refusal !== 'string')) {
            throw rejectResponse('refusal', typeof refusal === 'string' ? refusal : 'Request refused');
        }
        const finishReason = String(choice.finish_reason ?? '').trim().toLowerCase();
        if (finishReason !== 'stop' && (!streaming || finishReason)) {
            throw rejectResponse(finishReason, choice.finish_details?.message);
        }

        const content = part?.content;
        const text = typeof content === 'string'
            ? content
            : Array.isArray(content)
                ? content.map(part => typeof part === 'string' ? part : (typeof part?.text === 'string' ? part.text : '')).join('')
                : '';
        return { text, finishReason };
    }

    return { readChoice, rejectResponse };
}
