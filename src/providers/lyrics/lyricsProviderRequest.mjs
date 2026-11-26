import { LYRICS_TYPES, LYRICS_TYPE_PRIORITY_ORDER } from "./lyricsProviderTypes.mjs";
import { createOrderedLyricsProviderRequests } from "./orderedLyricsProviderRequests.mjs";
import { getProviderCandidateType } from "./lyricsProviderSelection.mjs";
import { supersededLyricsRequest } from "../../lyrics/lyricsProviderRequests.mjs";

const PROVIDER_SELECTION_POLICIES = {
    PROVIDER_FIRST: 'provider-first-v1',
    TYPE_FIRST: 'type-first-v1'
};

export async function requestLyrics(manager, info, forcedProviderId, {
    readLyricsService, readTrackIdentity, readSyncDataService, readAddonDebug, debug,
}, { isCurrent, signal, publishProgress }) {
    if (!isCurrent()) return supersededLyricsRequest(info.uri);
    const trackId = readLyricsService()?.extractTrackId?.(info.uri)
        || readTrackIdentity()?.extractTrackId?.(info.uri)
        || '';
    const lyricsCacheId = trackId || (info?.uri ? `local-uri:${info.uri}` : '');
    const allEnabledProviders = manager.getEnabledProviders();
    const availableProviders = trackId
        ? allEnabledProviders
        : allEnabledProviders.filter(provider => provider.supportsLocalTracks === true);
    let enabledProviders = forcedProviderId
        ? availableProviders.filter(provider => provider.id === forcedProviderId)
        : availableProviders;
    const typePriorityEnabled = !forcedProviderId
        && (manager.isPreferLyricsTypeOverProviderOrderEnabled() || manager.isAutomaticWordSyncFallbackEnabled());
    if (enabledProviders.length > 0) {
        const forcedProvider = forcedProviderId ? enabledProviders[0] : null;
        publishProgress({
            stage: forcedProvider ? 'provider' : 'sync-data',
            lyricsType: forcedProvider ? null : LYRICS_TYPES.CHARACTER,
            providerId: forcedProvider?.id || 'ivlyrics-sync',
            providerName: forcedProvider?.name || 'ivLyrics Sync',
            attempt: forcedProvider ? 1 : 0
        });
    }
    if (!isCurrent()) return supersededLyricsRequest(info.uri);
    const trackIsrc = (trackId ? await readSyncDataService()?.resolveTrackIsrc?.(trackId, info) : null)
        || readSyncDataService()?.getTrackIsrc?.(trackId, info)
        || readSyncDataService()?.normalizeSyncDataIsrc?.(info?.isrc || info?.external_ids?.isrc || info?.externalIds?.isrc);
    if (!isCurrent()) return supersededLyricsRequest(info.uri);
    const shouldReadSyncDataProviders = !forcedProviderId
        && !!trackIsrc
        && (typePriorityEnabled || manager.isPreferSyncDataProviderEnabled());
    const syncDataProviderIds = shouldReadSyncDataProviders
        ? await manager._getAvailableSyncDataProviderIds(trackId, trackIsrc, info)
        : new Set();
    if (!isCurrent()) return supersededLyricsRequest(info.uri);

    if (!forcedProviderId) {
        enabledProviders = await manager._prioritizeProvidersWithSyncData(
            enabledProviders,
            trackId,
            trackIsrc,
            info,
            syncDataProviderIds
        );
    }
    if (!isCurrent()) return supersededLyricsRequest(info.uri);

    const typeSelectionPolicy = typePriorityEnabled
        ? PROVIDER_SELECTION_POLICIES.TYPE_FIRST
        : PROVIDER_SELECTION_POLICIES.PROVIDER_FIRST;
    const selectionPolicy = `${typeSelectionPolicy}:${
        manager.isPreferSyncDataProviderEnabled()
            ? 'sync-data-first'
            : 'configured-order'
    }`;
    console.info('[ivLyrics sync-data]', 'LyricsAddonManager:getLyrics:start', {
        uri: info.uri,
        trackId,
        resolvedIsrc: trackIsrc || null,
        forcedProviderId,
        selectionPolicy,
        syncDataProviders: Array.from(syncDataProviderIds),
        enabledProviders: enabledProviders.map(provider => provider.id)
    });

    if (readAddonDebug()?.isEnabled()) {
        readAddonDebug().log('lyrics', 'getLyrics called', {
            uri: info.uri,
            title: info.title,
            artist: info.artist,
            providers: enabledProviders.map(provider => provider.id),
            forcedProviderId,
            selectionPolicy
        });
        readAddonDebug().time('lyrics', 'getLyrics:total');
    }

    if (!isCurrent()) return supersededLyricsRequest(info.uri);
    manager.emit('lyrics:fetch:start', { uri: info.uri, title: info.title, artist: info.artist, selectionPolicy });
    if (!isCurrent()) return supersededLyricsRequest(info.uri);

    if (enabledProviders.length === 0) {
        const error = {
            error: forcedProviderId ? 'Selected lyrics provider is not available' : 'No lyrics providers enabled',
            uri: info.uri,
            provider: forcedProviderId || null
        };
        console.warn('[LyricsAddonManager]', error.error, forcedProviderId || '');
        if (isCurrent()) {
            manager.emit('lyrics:fetch:error', {
                ...error,
                reason: forcedProviderId ? 'provider_unavailable' : 'no_providers'
            });
        }
        return error;
    }

    const context = { lyricsCacheId, trackId, trackIsrc, isCurrent, signal };
    const typeSettingsByProvider = new Map(
        enabledProviders.map(provider => [provider.id, manager._getProviderTypeSettings(provider)])
    );
    const { loadProviderOnce, stopProviderQueue, readResult } = createOrderedLyricsProviderRequests({
        isCurrent,
        signal,
        loadCandidate: (provider) => manager._loadProviderCandidate(
            provider, info, context, typeSettingsByProvider.get(provider.id)
        ),
        onAttempt: (provider, lyricsType, attempt) => {
            if (!isCurrent()) return;
            const detail = {
                uri: info.uri || '',
                providerId: provider.id,
                providerName: provider.name || provider.id,
                attempt,
                selectionPolicy,
                stage: 'provider',
                lyricsType
            };
            publishProgress(detail);
            if (isCurrent()) manager.emit('lyrics:provider:attempt', detail);
        },
        onError: (provider, error) => {
            console.warn(`[LyricsAddonManager] Provider ${provider.id} failed:`, error);
            const addonDebug = readAddonDebug();
            if (addonDebug?.isEnabled()) addonDebug.error('lyrics', `Provider ${provider.id} error`, error);
        },
    });

    const finish = (selected, provider, selectionType) =>
        manager._finalizeLyricsFetch(selected, info, provider.id, selectionPolicy, selectionType, isCurrent());

    const phases = typePriorityEnabled ? LYRICS_TYPE_PRIORITY_ORDER : [null];
    for (const lyricsType of phases) {
        if (lyricsType === LYRICS_TYPES.SYNCED && manager.isAutomaticWordSyncFallbackEnabled()) {
            // Native word timing is exhausted. Keep the same text on screen
            // while lrc.red generates timing for it in the background.
            const provider = enabledProviders.find(item => item.id === 'lrcred');
            const candidate = provider ? await loadProviderOnce(provider, lyricsType) : null;
            if (!isCurrent()) return supersededLyricsRequest(info.uri);
            const fallbackType = candidate?.hasSynced ? LYRICS_TYPES.SYNCED : LYRICS_TYPES.UNSYNCED;
            const selected = manager._selectProviderCandidateForType(candidate, fallbackType);
            if (selected) {
                stopProviderQueue();
                if (isCurrent()) provider.requestWordSync(info, { ...selected, karaoke: null, karaokeSource: null }, { isCurrent });
                return finish(selected, provider, fallbackType);
            }
        }

        let phaseProviders = enabledProviders;
        if (lyricsType) {
            debug(`[LyricsAddonManager] Starting lyrics type phase: ${lyricsType}`);
            phaseProviders = enabledProviders.filter(provider => {
                const typeSettings = typeSettingsByProvider.get(provider.id);
                const candidate = readResult(provider.id);
                const hasAllowedPseudoSyncedFallback = lyricsType === LYRICS_TYPES.SYNCED
                    && (typeSettings?.[LYRICS_TYPES.CHARACTER] || typeSettings?.[LYRICS_TYPES.WORD])
                    && candidate?.hasKaraoke
                    && candidate?.isPseudoKaraoke;
                return hasAllowedPseudoSyncedFallback || manager._canProviderParticipateInType(
                    provider, lyricsType, typeSettings, syncDataProviderIds
                );
            });
        }

        // Queue this phase in provider order and await in the same order.
        phaseProviders.forEach(provider => loadProviderOnce(provider, lyricsType));
        for (const provider of phaseProviders) {
            const candidate = await loadProviderOnce(provider, lyricsType);
            if (!isCurrent()) return supersededLyricsRequest(info.uri);
            if (lyricsType) {
                const selected = manager._selectProviderCandidateForType(candidate, lyricsType);
                if (selected) {
                    stopProviderQueue();
                    return finish(selected, provider, lyricsType);
                }
            } else if (candidate) {
                const selectionType = getProviderCandidateType(candidate);
                if (selectionType) {
                    stopProviderQueue();
                    return finish(candidate.result, provider, selectionType);
                }
            }
        }
    }

    stopProviderQueue();
    if (!isCurrent()) return supersededLyricsRequest(info.uri);

    if (readAddonDebug()?.isEnabled()) {
        readAddonDebug().timeEnd('lyrics', 'getLyrics:total');
        readAddonDebug().warn('lyrics', 'No lyrics found from any provider');
    }

    const errorResult = { error: 'No lyrics found', uri: info.uri };
    if (isCurrent()) manager.emit('lyrics:fetch:error', { ...errorResult, reason: 'not_found', selectionPolicy });
    return errorResult;
}
