import { LYRICS_TYPES, SYNC_DATA_RENDERER_VERSION, hasLyricsContent } from "./lyricsProviderTypes.mjs";

export function createLyricsProviderTimingEnrichment({ readLyricsService, readSyncDataService, readPseudoKaraoke }) {
    // The candidate loader owns the result passed to these three operations.
    async function refreshContributorIdentity(result, providerId, info, { trackId, trackIsrc, isCurrent }) {
        const service = readSyncDataService();
        if (!isCurrent() || !(trackId || trackIsrc) || !service?.getSyncData) return;

        try {
            const syncProvider = result.syncDataProvider || result.provider || providerId;
            const syncData = await service.getSyncData(trackId, syncProvider, {
                ...info,
                isrc: trackIsrc,
                forceContributorRefresh: true,
            });
            if (!isCurrent() || !syncData) return;
            if (Array.isArray(syncData.contributors)) result.contributors = syncData.contributors;
            result.syncType = syncData.syncType || result.syncType || 'unknown';
            result.syncPoints = Number(syncData.syncPoints ?? result.syncPoints ?? 2);
            result.syncTypeBreakdown = syncData.syncTypeBreakdown || result.syncTypeBreakdown || null;
        } catch (error) {
            if (isCurrent()) console.warn('[LyricsAddonManager] Failed to refresh contributor privacy metadata:', error);
        }
    }

    async function applyLegacyTiming(result, isCurrent) {
        const service = readLyricsService();
        if (!service?.applyIvLyricsSyncData) return false;

        const { karaoke, synced, syncDataApplied } = result;
        try {
            const enriched = await service.applyIvLyricsSyncData(result);
            if (!isCurrent() || !enriched) return false;
            Object.assign(result, enriched);
            return !!result.syncDataApplied
                && (result.karaoke !== karaoke || result.synced !== synced || result.syncDataApplied !== syncDataApplied);
        } catch (error) {
            if (isCurrent()) console.warn('[LyricsAddonManager] Failed to apply legacy sync data:', error);
            return false;
        }
    }

    async function applyRegisteredTiming(result, providerId, info, { trackId, trackIsrc, isCurrent }, hasSynced) {
        if (!isCurrent()) return false;
        const service = readSyncDataService();
        if (!(trackId || trackIsrc) || !service?.getSyncData) return applyLegacyTiming(result, isCurrent);

        let applied = false;
        try {
            const syncProvider = result.provider || providerId;
            const syncData = await service.getSyncData(trackId, syncProvider, { ...info, isrc: trackIsrc });
            if (!isCurrent() || !syncData?.syncData) return false;

            const baseLyrics = hasSynced ? result.synced : result.unsynced;
            const karaoke = service.applySyncDataToLyrics(baseLyrics, syncData, {
                durationMs: info.durationMs || info.duration_ms || info.duration,
                trackInfo: info,
                result,
            });
            if (!isCurrent() || !hasLyricsContent(karaoke)) return false;

            Object.assign(result, {
                karaoke,
                karaokeSource: 'sync-data',
                karaokeGranularity: LYRICS_TYPES.CHARACTER,
                syncDataApplied: true,
                syncDataProvider: syncProvider,
                syncDataRendererVersion: SYNC_DATA_RENDERER_VERSION,
                syncType: syncData.syncType || 'unknown',
                syncPoints: Number(syncData.syncPoints ?? 2),
                syncTypeBreakdown: syncData.syncTypeBreakdown || null,
            });
            delete result.pseudoKaraokeCacheVersion;
            applied = true;

            const contributors = syncData.contributors || syncData.syncData.contributors;
            if (contributors) result.contributors = contributors;
            const synced = service.convertKaraokeToSynced?.(karaoke);
            if (hasLyricsContent(synced)) result.synced = synced;
        } catch (error) {
            if (isCurrent()) console.warn('[LyricsAddonManager] Failed to get sync-data:', error);
        }
        return applied;
    }

    async function applyPseudoTiming(result, info, isCurrent) {
        const service = readPseudoKaraoke();
        if (!isCurrent() || !service?.applyToResult) return false;

        const { karaoke, karaokeSource, pseudoKaraokeCacheVersion } = result;
        try {
            const enriched = await service.applyToResult(result, info);
            if (!isCurrent()) return false;
            if (enriched) Object.assign(result, enriched);
            return result.karaoke !== karaoke
                || result.karaokeSource !== karaokeSource
                || result.pseudoKaraokeCacheVersion !== pseudoKaraokeCacheVersion;
        } catch (error) {
            if (isCurrent()) console.warn('[LyricsAddonManager] Failed to apply pseudo karaoke:', error);
            return false;
        }
    }

    return { refreshContributorIdentity, applyRegisteredTiming, applyPseudoTiming };
}
