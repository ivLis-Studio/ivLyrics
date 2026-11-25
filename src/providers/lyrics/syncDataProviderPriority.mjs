import { LYRICS_TYPES } from "./lyricsProviderTypes.mjs";

const LRCLIB_PROVIDER_ID = 'lrclib';

export function getLyricsAddonIdForSyncProvider(providerValue) {
    const providerId = typeof providerValue === 'string'
        ? providerValue.trim().toLowerCase()
        : '';
    if (!providerId) return '';
    if (providerId === 'legacy' || providerId === 'spotify' || providerId.startsWith('spotify-')) {
        return 'spotify';
    }
    return providerId;
}

function getSyncProviderId(entry) {
    return typeof entry === 'string' ? entry : entry?.provider;
}

export async function getAvailableSyncDataProviderIds(readSyncDataService, trackId, trackIsrc, info) {
    if (!trackIsrc || !readSyncDataService()?.getAvailableProviders) {
        return new Set();
    }

    try {
        const syncProviders = await readSyncDataService().getAvailableProviders(trackId, {
            ...info,
            isrc: trackIsrc
        });
        if (!Array.isArray(syncProviders)) return new Set();

        return new Set(
            syncProviders
                .map(entry => getLyricsAddonIdForSyncProvider(getSyncProviderId(entry)))
                .filter(Boolean)
        );
    } catch (error) {
        console.warn('[LyricsAddonManager] Failed to read available sync-data providers:', error);
        return new Set();
    }
}

export async function prioritizeProvidersWithSyncData(manager, readSyncDataService, providers, trackId, trackIsrc, info, syncDataProviderIds) {
    if (!Array.isArray(providers) || providers.length < 2) return providers;
    if (!trackIsrc || !manager.isPreferSyncDataProviderEnabled()) return providers;
    if (!readSyncDataService()?.getAvailableProviders) return providers;

    try {
        const preferredAddonIds = syncDataProviderIds instanceof Set
            ? syncDataProviderIds
            : await manager._getAvailableSyncDataProviderIds(trackId, trackIsrc, info);
        if (preferredAddonIds.size === 0) return providers;

        const lrclibPreferred = [];
        const preferred = [];
        const remaining = [];
        for (const provider of providers) {
            const addonId = getLyricsAddonIdForSyncProvider(provider?.id);
            const typeSettings = manager._getProviderTypeSettings(provider);
            if (typeSettings[LYRICS_TYPES.CHARACTER] !== false && preferredAddonIds.has(addonId)) {
                if (addonId === LRCLIB_PROVIDER_ID) {
                    lrclibPreferred.push(provider);
                } else {
                    preferred.push(provider);
                }
            } else {
                remaining.push(provider);
            }
        }

        if (lrclibPreferred.length === 0 && preferred.length === 0) return providers;
        const prioritizedProviders = [...lrclibPreferred, ...preferred, ...remaining];
        console.info('[ivLyrics sync-data]', 'LyricsAddonManager:provider-priority', {
            isrc: trackIsrc,
            syncProviders: Array.from(preferredAddonIds),
            configuredOrder: providers.map(provider => provider.id),
            attemptOrder: prioritizedProviders.map(provider => provider.id)
        });
        return prioritizedProviders;
    } catch (error) {
        console.warn('[LyricsAddonManager] Failed to prioritize providers with sync-data:', error);
        return providers;
    }
}
