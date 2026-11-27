import { throwIfAiRequestAborted, waitForAiRetry } from './aiRequestCancellation.mjs';

const RETRYABLE_ERRORS = new Set(["TypeError", "SyntaxError"]);

// Web translation add-ons keep their routes out of plain-text bundles as
// salt-rotated, 16-bit packed words; this restores one at run time.
export function unpackRuntimeString(seed, length, words) {
    let value = '';
    for (let index = 0; index < length; index++) {
        const packed = words[index >> 1];
        const masked = (packed >>> (index % 2 === 0 ? 8 : 0)) & 0xff;
        const lane = (seed ^ Math.imul(index + 1, 0x5d) ^ (index << 1)) & 0xff;
        value += String.fromCharCode(masked ^ lane);
    }
    return value;
}

export function createWebTranslationTransport({ name, fetch, timeoutMs = 15000 }) {
    async function read(url, options, readBody, signal) {
        throwIfAiRequestAborted(signal);
        const controller = new AbortController();
        const cancel = () => controller.abort(signal.reason);
        signal?.addEventListener('abort', cancel, { once: true });
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetch(url, { ...options, signal: controller.signal });
            return await readBody(response);
        } catch (error) {
            throwIfAiRequestAborted(signal);
            if (controller.signal.aborted || error?.name === "AbortError") {
                throw Object.assign(new Error(`[${name}] Request timed out`, { cause: error }), { retryable: true });
            }
            if (RETRYABLE_ERRORS.has(error?.name) && error.retryable === undefined) {
                throw Object.assign(new Error(error.message, { cause: error }), { retryable: true });
            }
            throw error;
        } finally {
            clearTimeout(timer);
            signal?.removeEventListener('abort', cancel);
        }
    }

    async function retry(operation, signal) {
        throwIfAiRequestAborted(signal);
        try {
            return await operation();
        } catch (error) {
            if (!error?.retryable) throw error;
        }
        await waitForAiRetry(400, signal);
        return operation();
    }

    return { read, retry };
}
