import { normalizeCulturalAnnotationsResult } from "./culturalAnnotations.mjs";

export async function requestMotionDirection(manager, params, { debug }) {
    if (!Array.isArray(params?.lines) || params.lines.length === 0) {
        throw new Error('No lyrics lines provided');
    }
    const providers = manager.getEnabledProvidersFor('motionDirection');
    if (providers.length === 0) {
        throw new Error(manager._t('aiProviders.noEnabledProviders', 'No AI providers enabled. Please enable at least one provider in settings.'));
    }
    manager.emit('ai:request:start', {
        type: 'motionDirection',
        providers: providers.map((provider) => provider.id),
        params: { title: params.title, artist: params.artist, lineCount: params.lines.length }
    });
    const motionDirectionPrompt = manager.buildMotionDirectionPrompt(params);
    return manager._runProviderFallback(providers, 'generateMotionDirection', 'motionDirection', async (addon) => {
        debug('[AIAddonManager] Trying motion direction provider: ' + addon.id);
        const result = await manager._callProvider(addon, 'generateMotionDirection', { ...params, motionDirectionPrompt });
        const direction = result && typeof result === 'object' && result.direction && typeof result.direction === 'object'
            ? result.direction
            : result;
        if (!direction || typeof direction !== 'object' || !Array.isArray(direction.shots) || direction.shots.length === 0) {
            throw new Error('[AIAddonManager] Provider ' + addon.id + ' returned a motion direction without shots');
        }
        manager.emit('ai:request:success', { type: 'motionDirection', provider: addon.id });
        return direction;
    });
}

export async function requestLyricsStudy(manager, params, { getAddonDebug, debug }) {
    const providers = manager.getEnabledProvidersFor('lyricsStudy');

    if (providers.length === 0) {
        console.warn('[AIAddonManager] No lyrics study providers enabled');
        throw new Error(manager._t('aiProviders.noEnabledProviders', 'No AI providers enabled. Please enable at least one provider in settings.'));
    }

    if (getAddonDebug()?.isEnabled()) {
        getAddonDebug().log('ai', 'generateLyricsStudy called', {
            providers: providers.map(p => p.id),
            targetLang: params.targetLang,
            sourceLang: params.sourceLang,
            lineCount: Array.isArray(params.lines) ? params.lines.length : 0
        });
        getAddonDebug().time('ai', 'generateLyricsStudy');
    }

    manager.emit('ai:request:start', {
        type: 'lyricsStudy',
        providers: providers.map(p => p.id),
        params: { ...params, lines: '[...]' }
    });

    return manager._runProviderFallback(providers, 'generateLyricsStudy', 'lyricsStudy', async (addon) => {
        debug(`[AIAddonManager] Trying lyrics study provider: ${addon.id}`);
        const result = await manager._callProvider(addon, 'generateLyricsStudy', {
            ...params,
            lyricsStudyPrompt: manager.buildLyricsStudyPrompt(params)
        });

        if (getAddonDebug()?.isEnabled()) {
            getAddonDebug().timeEnd('ai', 'generateLyricsStudy');
        }

        manager.emit('ai:request:success', { type: 'lyricsStudy', provider: addon.id });
        return result;
    }, () => {
        if (getAddonDebug()?.isEnabled()) {
            getAddonDebug().timeEnd('ai', 'generateLyricsStudy');
            getAddonDebug().error('ai', 'generateLyricsStudy all providers failed');
        }
    });
}

export async function requestCulturalAnnotations(manager, params, { debug }) {
    let providers = manager.getEnabledProvidersFor('culturalAnnotations');
    if (params?.provider) {
        providers = providers.filter(addon => addon.id === params.provider);
    }

    if (providers.length === 0) {
        console.warn('[AIAddonManager] No cultural annotation providers enabled');
        throw new Error(manager._t('aiProviders.noEnabledProviders', 'No AI providers enabled. Please enable at least one provider in settings.'));
    }

    manager.emit('ai:request:start', {
        type: 'culturalAnnotations',
        providers: providers.map(provider => provider.id),
        params: { ...params, lines: '[...]' }
    });

    return manager._runProviderFallback(providers, 'generateCulturalAnnotations', 'culturalAnnotations', async (addon) => {
        if (typeof params?.onProviderLoading === 'function') {
            params.onProviderLoading({
                providerId: addon.id,
                providerName: addon.name || addon.id
            });
        }
        debug(`[AIAddonManager] Trying cultural annotations provider: ${addon.id}`);
        const result = normalizeCulturalAnnotationsResult(
            await manager._callProvider(addon, 'generateCulturalAnnotations', {
                ...params,
                culturalAnnotationsPrompt: manager.buildCulturalAnnotationsPrompt({
                    ...params,
                    providerId: addon.id
                })
            }),
            params?.lines,
            addon.id
        );

        manager.emit('ai:request:success', { type: 'culturalAnnotations', provider: addon.id });
        return result;
    });
}
