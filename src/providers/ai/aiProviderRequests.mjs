import { isSupersededAbort, runWithAiRequestSignal, supersededAiRequest, throwIfAiRequestSuperseded } from './aiRequestCancellation.mjs';

const PROVIDER_OPERATION_TIMEOUT_MS = 95_000;
const PROVIDER_RESEARCH_TIMEOUT_MS = 600_000;
const PROVIDER_OUTPUT_CALLBACKS = ['onLine', 'onStreamReset', 'onResearchProgress', 'onProgress', 'onSlots', 'onRawChunk'];

export async function callAiProvider(addon, method, params) {
    const callerSignal = params?.signal;
    throwIfAiRequestSuperseded(callerSignal);
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
    const signal = controller.signal;
    let settled = false;
    try {
        return await runWithAiRequestSignal(signal, () => {
            const providerParams = { ...params, signal };
            // Each attempt owns its output, including retries of the same provider.
            for (const name of PROVIDER_OUTPUT_CALLBACKS) {
                const callback = providerParams[name];
                if (typeof callback === 'function') {
                    providerParams[name] = function (...args) {
                        if (!settled && !signal.aborted) return Reflect.apply(callback, this, args);
                    };
                }
            }
            return addon[method](providerParams);
        });
    } finally {
        settled = true;
        clearTimeout(timeoutId);
        callerSignal?.removeEventListener('abort', onAbort);
    }
}

// Keep each request's prompt, callbacks and result handling inside the
// attempt so failures at any of those stages still try the next addon.
export async function runAiProviderFallback(manager, providers, method, type, attempt, onAllFailed = null, signal) {
    let lastError = null;
    for (const addon of providers) {
        throwIfAiRequestSuperseded(signal);
        if (typeof addon[method] !== 'function') continue;
        try {
            const result = await attempt(addon);
            throwIfAiRequestSuperseded(signal);
            return result;
        } catch (error) {
            throwIfAiRequestSuperseded(signal);
            if (isSupersededAbort(error)) throw error;
            console.warn(`[AIAddonManager] Provider ${addon.id} failed for ${method}:`, error?.message || error);
            lastError = error;
        }
    }

    throwIfAiRequestSuperseded(signal);
    onAllFailed?.();
    throwIfAiRequestSuperseded(signal);
    const errorMsg = lastError?.message || manager._t('aiProviders.allProvidersFailed', 'All AI providers failed to process the request.');
    manager.emit('ai:request:error', { type, error: errorMsg });
    throw new Error(errorMsg);
}
