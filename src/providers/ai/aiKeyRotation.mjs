import { isSupersededAbort, throwIfAiRequestAborted, waitForAiRetry } from "./aiRequestCancellation.mjs";

const NEXT_KEY = Symbol('next AI key');

// The provider decides which HTTP failures rotate keys and what provisional
// output needs clearing. Backoff only happens between attempts of one key.
export async function requestWithAiKeys({
    apiKeys, attempts, signal, exhaustedMessage, run, onError, createOutput,
}) {
    let lastError;
    function nextKey(error) {
        if (error) lastError = error;
        return NEXT_KEY;
    }

    for (let keyIndex = 0; keyIndex < apiKeys.length; keyIndex++) {
        const key = apiKeys[keyIndex];
        const keyNumber = keyIndex + 1;
        const hasNextKey = keyNumber < apiKeys.length;
        for (let attempt = 0; attempt < attempts; attempt++) {
            const output = createOutput?.();
            try {
                const result = await run({ key, keyNumber, output, nextKey });
                if (result === NEXT_KEY) break;
                return result;
            } catch (error) {
                throwIfAiRequestAborted(signal);
                if (isSupersededAbort(error)) throw error;
                lastError = error;
                const attemptNumber = attempt + 1;
                const willRetry = attempt < attempts - 1;
                const decision = onError?.(error, { keyNumber, attemptNumber, output, willRetry, hasNextKey });
                if (decision === 'stop') throw error;
                if (decision === 'rotate') break;
                if (willRetry) await waitForAiRetry(1000 * attemptNumber, signal);
            }
        }
    }
    throw lastError || new Error(exhaustedMessage);
}
