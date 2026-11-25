import { throwIfAiRequestAborted, waitForAiRetry } from './aiRequestCancellation.mjs';

const RETRYABLE_ERRORS = new Set(["TypeError", "SyntaxError"]);

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
