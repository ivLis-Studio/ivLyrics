import { isSupersededAbort, runWithAiRequestSignal, supersededAiRequest } from './aiRequestCancellation.mjs';

const PROVIDER_OPERATION_TIMEOUT_MS = 95_000;
const PROVIDER_RESEARCH_TIMEOUT_MS = 600_000;

export async function callAiProvider(addon, method, params) {
    const callerSignal = params?.signal;
    if (callerSignal?.aborted) throw supersededAiRequest(callerSignal.reason);
    const controller = new AbortController();
    const onAbort = () => controller.abort(supersededAiRequest(callerSignal.reason));
    callerSignal?.addEventListener('abort', onAbort, { once: true });
    const providerName = addon?.name || addon?.id || 'unknown';
    const timeoutMs = method === 'generateResearch' || method === 'generateTMI'
        ? PROVIDER_RESEARCH_TIMEOUT_MS
        : PROVIDER_OPERATION_TIMEOUT_MS;
    const timeoutId = setTimeout(() => {
        const error = new Error(`${providerName} ${method} timed out`);
        error.name = 'TimeoutError';
        controller.abort(error);
    }, timeoutMs);
    try {
        return await runWithAiRequestSignal(controller.signal,
            () => addon[method]({ ...params, signal: controller.signal }));
    } finally {
        clearTimeout(timeoutId);
        callerSignal?.removeEventListener('abort', onAbort);
    }
}

// Keep each request's prompt, callbacks and result handling inside the
// attempt so failures at any of those stages still try the next addon.
export async function runAiProviderFallback(manager, providers, method, type, attempt, onAllFailed = null) {
    let lastError = null;
    for (const addon of providers) {
        if (typeof addon[method] !== 'function') continue;
        try {
            return await attempt(addon);
        } catch (error) {
            if (isSupersededAbort(error)) throw error;
            console.warn(`[AIAddonManager] Provider ${addon.id} failed for ${method}:`, error.message);
            lastError = error;
        }
    }

    if (onAllFailed) onAllFailed();
    const errorMsg = lastError?.message || manager._t('aiProviders.allProvidersFailed', 'All AI providers failed to process the request.');
    manager.emit('ai:request:error', { type, error: errorMsg });
    throw new Error(errorMsg);
}
