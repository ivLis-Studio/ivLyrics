import {
    validateLyricsPhoneticWritingSystem,
    validateLyricsTranslationResult,
} from './pronunciationPolicy.mjs';
import { isSupersededAbort } from './aiRequestCancellation.mjs';

export async function requestMetadataTranslation(manager, params, { getAddonDebug, debug }) {
    const providers = manager.getEnabledProvidersFor('metadata');

    if (providers.length === 0) {
        console.warn('[AIAddonManager] No metadata providers enabled');
        throw new Error(manager._t('aiProviders.noEnabledProviders', 'No AI providers enabled. Please enable at least one provider in settings.'));
    }

    // 디버그 로깅
    if (getAddonDebug()?.isEnabled()) {
        getAddonDebug().log('ai', 'translateMetadata called', {
            providers: providers.map(p => p.id),
            ...params
        });
        getAddonDebug().time('ai', 'translateMetadata');
    }

    // 이벤트 발생
    manager.emit('ai:request:start', { type: 'metadata', providers: providers.map(p => p.id), params });

    return manager._runProviderFallback(providers, 'translateMetadata', 'metadata', async (addon) => {
        debug(`[AIAddonManager] Trying metadata provider: ${addon.id}`);
        const result = await manager._callProvider(addon, 'translateMetadata', {
            ...params,
            metadataPrompt: manager.buildMetadataTranslationPrompt({
                ...params,
                providerId: addon.id
            })
        });

        // 디버그 타이머 종료
        if (getAddonDebug()?.isEnabled()) {
            getAddonDebug().timeEnd('ai', 'translateMetadata');
        }

        // 이벤트 발생
        manager.emit('ai:request:success', { type: 'metadata', provider: addon.id });

        return result;
    }, () => {
        // 모든 provider 실패
        console.error('[AIAddonManager] All metadata providers failed');

        if (getAddonDebug()?.isEnabled()) {
            getAddonDebug().timeEnd('ai', 'translateMetadata');
            getAddonDebug().error('ai', 'translateMetadata all providers failed');
        }
    });
}

/**
 * 가사 번역 또는 발음 생성 (해당 기능이 켜진 Provider 순서대로 시도)
 * @param {Object} params - { trackId, artist, title, text, lang, wantSmartPhonetic }
 * @returns {Promise<Object|null>}
 */
export async function requestLyricsTranslation(manager, params, { getAddonDebug, debug }) {
    const capability = params.wantSmartPhonetic ? 'pronunciation' : 'translate';
    const providers = manager.getEnabledProvidersFor(capability);

    if (providers.length === 0) {
        console.warn(`[AIAddonManager] No ${capability} providers enabled`);
        throw new Error(params.wantSmartPhonetic
            ? manager._t('aiProviders.noPronunciationProviders', 'No enabled AI provider can generate pronunciation. Turn on Pronunciation for an AI provider in AI Providers settings.')
            : manager._t('aiProviders.noEnabledProviders', 'No AI providers enabled. Please enable at least one provider in settings.'));
    }

    const translationStyle = params.translationStyle ?? manager.getTranslationStyle();
    const translationPrompt = params.wantSmartPhonetic
        ? null
        : manager.buildLyricsTranslationPrompt({
            text: params.text,
            lang: params.lang,
            translationStyle
        });

    // 디버그 로깅
    if (getAddonDebug()?.isEnabled()) {
        getAddonDebug().log('ai', 'translateLyrics called', {
            providers: providers.map(p => p.id),
            lang: params.lang,
            wantSmartPhonetic: params.wantSmartPhonetic,
            translationStyle: params.wantSmartPhonetic ? null : translationStyle,
            lineCount: params.text?.split('\n').length
        });
        getAddonDebug().time('ai', 'translateLyrics');
    }

    // 이벤트 발생
    manager.emit('ai:request:start', { type: 'translate', providers: providers.map(p => p.id), params: { ...params, text: '[...]' } });

    let lastError = null;

    for (const addon of providers) {
        if (typeof addon.translateLyrics !== 'function') continue;

        let hasProvisionalOutput = false;
        let maxProvisionalLineIndex = -1;
        const resetProvisionalOutput = (detail = {}) => {
            if (!hasProvisionalOutput) return;

            try {
                if (typeof params.onStreamReset === 'function') {
                    params.onStreamReset({ provider: addon.id, ...detail });
                } else if (typeof params.onLine === 'function') {
                    for (let index = 0; index <= maxProvisionalLineIndex; index++) {
                        params.onLine(index, '');
                    }
                }
            } catch (resetError) {
                debug(`[AIAddonManager] Failed to reset ${addon.id} stream:`, resetError?.message);
            }

            hasProvisionalOutput = false;
            maxProvisionalLineIndex = -1;
        };
        let providerActive = true;
        const providerParams = {
            ...params,
            translationStyle,
            translationPrompt,
            phoneticPrompt: params.wantSmartPhonetic
                ? manager.buildLyricsPhoneticPrompt({
                    text: params.text,
                    lang: params.lang,
                    providerId: addon.id,
                    pronunciationNotation: params.pronunciationNotation,
                    sourceLang: params.sourceLang
                })
                : null,
            onLine: typeof params.onLine === 'function'
                ? (lineIndex, lineText, detail) => {
                    if (!providerActive) return;
                    hasProvisionalOutput = true;
                    if (Number.isInteger(lineIndex) && lineIndex >= 0) {
                        maxProvisionalLineIndex = Math.max(maxProvisionalLineIndex, lineIndex);
                    }
                    params.onLine(lineIndex, lineText, detail);
                }
                : null,
            onStreamReset: detail => resetProvisionalOutput(detail),
        };

        try {
            debug(`[AIAddonManager] Trying translate provider: ${addon.id}`);
            let result = validateLyricsTranslationResult(
                await manager._callProvider(addon, 'translateLyrics', providerParams),
                params,
                addon.id
            );
            result = validateLyricsPhoneticWritingSystem(
                result,
                params,
                addon.id
            );

            // 디버그 타이머 종료
            if (getAddonDebug()?.isEnabled()) {
                getAddonDebug().timeEnd('ai', 'translateLyrics');
            }

            // 이벤트 발생
            manager.emit('ai:request:success', { type: 'translate', provider: addon.id });

            providerActive = false;
            return result;
        } catch (e) {
            providerActive = false;
            const cancelled = isSupersededAbort(e);
            resetProvisionalOutput({ reason: cancelled ? 'cancelled' : 'provider-fallback', error: e?.message || null });
            if (cancelled) {
                if (getAddonDebug()?.isEnabled()) getAddonDebug().timeEnd('ai', 'translateLyrics');
                throw e;
            }
            console.warn(`[AIAddonManager] Provider ${addon.id} failed for translateLyrics:`, e.message);
            lastError = e;
        }
    }

    // 모든 provider 실패
    console.error('[AIAddonManager] All translate providers failed');

    if (getAddonDebug()?.isEnabled()) {
        getAddonDebug().timeEnd('ai', 'translateLyrics');
        getAddonDebug().error('ai', 'translateLyrics all providers failed');
    }

    const errorMsg = lastError?.message || manager._t('aiProviders.allProvidersFailed', 'All AI providers failed to process the request.');
    manager.emit('ai:request:error', { type: 'translate', error: errorMsg });
    throw new Error(errorMsg);
}
