import { validateLyricsPhoneticWritingSystem, validateLyricsTranslationResult } from './pronunciationPolicy.mjs';
import { isSupersededAbort, throwIfAiRequestSuperseded } from './aiRequestCancellation.mjs';

export async function requestMetadataTranslation(manager, params, { getAddonDebug, debug }) {
    const signal = params?.signal;
    throwIfAiRequestSuperseded(signal);
    const providers = manager.getEnabledProvidersFor('metadata');
    if (providers.length === 0) {
        console.warn('[AIAddonManager] No metadata providers enabled');
        throw new Error(manager._t('aiProviders.noEnabledProviders', 'No AI providers enabled. Please enable at least one provider in settings.'));
    }

    const logger = getAddonDebug();
    const timing = logger?.isEnabled();
    if (timing) {
        logger.log('ai', 'translateMetadata called', { providers: providers.map(provider => provider.id), ...params });
        logger.time('ai', 'translateMetadata');
    }
    try {
        manager.emit('ai:request:start', { type: 'metadata', providers: providers.map(provider => provider.id), params });
        return await manager._runProviderFallback(providers, 'translateMetadata', 'metadata', async addon => {
            debug('[AIAddonManager] Trying metadata provider:', addon.id);
            const result = await manager._callProvider(addon, 'translateMetadata', {
                ...params,
                metadataPrompt: manager.buildMetadataTranslationPrompt({ ...params, providerId: addon.id }),
            });
            throwIfAiRequestSuperseded(signal);
            manager.emit('ai:request:success', { type: 'metadata', provider: addon.id });
            return result;
        }, () => {
            console.error('[AIAddonManager] All metadata providers failed');
            if (timing) logger.error('ai', 'translateMetadata all providers failed');
        }, signal);
    } finally {
        if (timing) logger.timeEnd('ai', 'translateMetadata');
    }
}

function createProvisionalTranslation({ onLine, onStreamReset }, provider, debug) {
    let streamed = false;
    let lastLineIndex = -1;

    function reset(detail) {
        if (!streamed) return;
        const last = lastLineIndex;
        streamed = false;
        lastLineIndex = -1;
        try {
            if (typeof onStreamReset === 'function') {
                onStreamReset({ provider, ...detail });
            } else {
                for (let index = 0; index <= last; index++) onLine(index, '');
            }
        } catch (error) {
            debug('[AIAddonManager] Failed to reset provider stream:', provider, error?.message);
        }
    }

    return {
        reset,
        onLine: typeof onLine === 'function' ? (index, text, detail) => {
            streamed = true;
            if (Number.isInteger(index) && index >= 0) lastLineIndex = Math.max(lastLineIndex, index);
            onLine(index, text, detail);
        } : null,
    };
}

export async function requestLyricsTranslation(manager, params, { getAddonDebug, debug }) {
    const { signal, wantSmartPhonetic } = params;
    throwIfAiRequestSuperseded(signal);
    const capability = wantSmartPhonetic ? 'pronunciation' : 'translate';
    const providers = manager.getEnabledProvidersFor(capability);
    if (providers.length === 0) {
        console.warn('[AIAddonManager] No enabled providers for', capability);
        throw new Error(wantSmartPhonetic
            ? manager._t('aiProviders.noPronunciationProviders', 'No enabled AI provider can generate pronunciation. Turn on Pronunciation for an AI provider in AI Providers settings.')
            : manager._t('aiProviders.noEnabledProviders', 'No AI providers enabled. Please enable at least one provider in settings.'));
    }

    const providerIds = providers.map(provider => provider.id);
    const translationStyle = params.translationStyle ?? manager.getTranslationStyle();
    const translationPrompt = wantSmartPhonetic ? null : manager.buildLyricsTranslationPrompt({
        text: params.text, lang: params.lang, translationStyle,
    });
    const logger = getAddonDebug();
    const timing = logger?.isEnabled();
    if (timing) {
        logger.log('ai', 'translateLyrics called', {
            providers: providerIds, lang: params.lang, wantSmartPhonetic,
            translationStyle: wantSmartPhonetic ? null : translationStyle,
            lineCount: params.text?.split('\n').length,
        });
        logger.time('ai', 'translateLyrics');
    }

    try {
        manager.emit('ai:request:start', { type: 'translate', providers: providerIds, params: { ...params, text: '[...]' } });
        return await manager._runProviderFallback(providers, 'translateLyrics', 'translate', async addon => {
            debug('[AIAddonManager] Trying translate provider:', addon.id);
            const stream = createProvisionalTranslation(params, addon.id, debug);
            try {
                const result = await manager._callProvider(addon, 'translateLyrics', {
                    ...params,
                    translationStyle,
                    translationPrompt,
                    phoneticPrompt: wantSmartPhonetic ? manager.buildLyricsPhoneticPrompt({
                        text: params.text,
                        lang: params.lang,
                        providerId: addon.id,
                        pronunciationNotation: params.pronunciationNotation,
                        sourceLang: params.sourceLang,
                    }) : null,
                    onLine: stream.onLine,
                    onStreamReset: stream.reset,
                });
                throwIfAiRequestSuperseded(signal);
                const shaped = validateLyricsTranslationResult(result, params, addon.id);
                const validated = validateLyricsPhoneticWritingSystem(shaped, params, addon.id);
                manager.emit('ai:request:success', { type: 'translate', provider: addon.id });
                return validated;
            } catch (error) {
                stream.reset({
                    reason: signal?.aborted || isSupersededAbort(error) ? 'cancelled' : 'provider-fallback',
                    error: error?.message || null,
                });
                throw error;
            }
        }, () => {
            console.error('[AIAddonManager] All translate providers failed');
            if (timing) logger.error('ai', 'translateLyrics all providers failed');
        }, signal);
    } finally {
        if (timing) logger.timeEnd('ai', 'translateLyrics');
    }
}
