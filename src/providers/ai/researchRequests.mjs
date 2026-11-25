import {
    RESEARCH_CACHE_VERSION,
    isResearchWebSearchFailure,
    normalizeResearchResult,
} from './researchDocument.mjs';
import { isSupersededAbort, throwIfAiRequestAborted } from './aiRequestCancellation.mjs';

const PROVIDER_RESEARCH_REQUEST_TIMEOUT_MS = 480_000;

export async function requestResearch(manager, params, { getAddonDebug, debug }) {
    const signal = params?.signal;
    throwIfAiRequestAborted(signal);
    const providers = manager.getEnabledProvidersFor('research');

    if (providers.length === 0) {
        console.warn('[AIAddonManager] No Research providers enabled');
        return null;
    }

    if (getAddonDebug()?.isEnabled()) {
        getAddonDebug().log('ai', 'generateResearch called', {
            providers: providers.map(p => p.id),
            trackId: params?.trackId,
            title: params?.title,
            artist: params?.artist,
            lyricLineCount: Array.isArray(params?.lyrics) ? params.lyrics.length : 0
        });
        getAddonDebug().time('ai', 'generateResearch');
    }

    manager.emit('ai:request:start', { type: 'research', providers: providers.map(p => p.id), params });
    let lastError = null;

    for (const addon of providers) {
        const method = typeof addon.generateResearch === 'function' ? 'generateResearch' : 'generateTMI';
        if (typeof addon[method] !== 'function') continue;
        let activeWebSearchStatus = 'searching';

        const reportProgress = (partial, details = {}) => {
            if (signal?.aborted || typeof params?.onProgress !== 'function') return;
            try {
                if (!partial || typeof partial !== 'object') {
                    params.onProgress(null, { provider: addon.id, ...details });
                    return;
                }
                const normalizedPartial = normalizeResearchResult(partial, params);
                normalizedPartial._research = {
                    ...(normalizedPartial._research || {}),
                    provider: addon.id,
                    schema: RESEARCH_CACHE_VERSION,
                    streaming: details.complete !== true,
                    web_search: activeWebSearchStatus
                };
                params.onProgress(normalizedPartial, { provider: addon.id, ...details });
            } catch (progressError) {
                debug('[AIAddonManager] Research progress callback failed:', progressError?.message);
            }
        };

        try {
            debug(`[AIAddonManager] Trying Research provider: ${addon.id}`);
            const researchPrompt = manager.buildResearchPrompt(params);
            const callResearchProvider = (webSearch) => manager._callProvider(addon, method, {
                ...params,
                webSearch,
                researchPrompt,
                requestTimeoutMs: PROVIDER_RESEARCH_REQUEST_TIMEOUT_MS,
                onResearchProgress: reportProgress,
                // Existing provider addons consume this property.
                tmiPrompt: researchPrompt
            });

            reportProgress(null, { reset: true, webSearchStatus: 'searching' });

            let result;
            try {
                result = await callResearchProvider(true);
            } catch (webSearchError) {
                throwIfAiRequestAborted(signal);
                if (isSupersededAbort(webSearchError)) throw webSearchError;
                // A generation failure (for example MAX_TOKENS) is not a
                // web-search failure. Retrying it without search would run
                // the same provider twice and discard the streamed draft.
                if (!isResearchWebSearchFailure(webSearchError)) {
                    throw webSearchError;
                }
                activeWebSearchStatus = 'fallback';
                console.warn(`[AIAddonManager] Provider ${addon.id} web search failed; retrying without search:`, webSearchError.message);
                reportProgress(null, {
                    reset: true,
                    webSearchStatus: 'fallback',
                    webSearchError: webSearchError.message
                });
                result = await callResearchProvider(false);
            }

            throwIfAiRequestAborted(signal);

            const normalized = normalizeResearchResult(result, params);
            if (!normalized || typeof normalized !== 'object') {
                throw new Error('Research provider returned an invalid document.');
            }
            normalized._research = {
                ...(normalized._research || {}),
                provider: addon.id,
                generated_at: new Date().toISOString(),
                schema: RESEARCH_CACHE_VERSION,
                streaming: false,
                web_search: activeWebSearchStatus === 'fallback' ? 'fallback' : 'used'
            };

            reportProgress(normalized, {
                complete: true,
                webSearchStatus: normalized._research.web_search
            });

            if (getAddonDebug()?.isEnabled()) {
                getAddonDebug().timeEnd('ai', 'generateResearch');
            }
            manager.emit('ai:request:success', { type: 'research', provider: addon.id });
            return normalized;
        } catch (error) {
            throwIfAiRequestAborted(signal);
            if (isSupersededAbort(error)) throw error;
            console.warn(`[AIAddonManager] Provider ${addon.id} failed for generateResearch:`, error.message);
            reportProgress(null, { reset: true, error: error.message });
            lastError = error;
        }
    }

    console.error('[AIAddonManager] All Research providers failed');
    if (getAddonDebug()?.isEnabled()) {
        getAddonDebug().timeEnd('ai', 'generateResearch');
        getAddonDebug().error('ai', 'generateResearch all providers failed');
    }

    const errorMsg = lastError?.message || manager._t('aiProviders.allProvidersFailed', 'All AI providers failed to process the request.');
    manager.emit('ai:request:error', { type: 'research', error: errorMsg });
    throw new Error(errorMsg);
}
