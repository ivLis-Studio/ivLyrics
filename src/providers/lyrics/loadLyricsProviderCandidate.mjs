import {
    LYRICS_TYPES, SYNC_DATA_RENDERER_VERSION, hasLyricsContent,
    inferKaraokeGranularity, applyKaraokeGranularity, filterProviderCandidateResult,
} from "./lyricsProviderTypes.mjs";
import { canApplyLrcRedWordTiming, normalizeLrcRedIsrc } from "./lrcRedWordTiming.mjs";
import { createLyricsProviderTimingEnrichment } from "./enrichLyricsProviderTiming.mjs";

export function createLyricsProviderCandidateLoader({
    readLyricsService, readSyncDataService, readPseudoKaraoke,
    normalizeProviderInstrumentalBreaks, readAddonDebug, debug,
}) {
    const { refreshContributorIdentity, applyRegisteredTiming, applyPseudoTiming } =
        createLyricsProviderTimingEnrichment({ readLyricsService, readSyncDataService, readPseudoKaraoke });

    // Fetches a provider result, preferring a still-valid cache entry over a
    // fresh provider.getLyrics() call. Mirrors the original try/finally: the
    // AddonDebug timing span always closes, cache-lookup failures are swallowed
    // with a warning, and debug logs fire in the same order. Returns the raw
    // result plus whether it came from cache and whether the provider was hit.
    async function resolveProviderResult(provider, info, lyricsCacheId, debugTiming, { isCurrent, signal }) {
        let result = null;
        let cacheHit = false;
        let providerFetched = false;

        try {
            // A file-backed provider restores its source identity before cache
            // comparison, so a previous online result cannot hide a local DB.
            await provider.prepareLyricsLookup?.(info);
            if (isCurrent() && lyricsCacheId && readLyricsService()?.getCachedLyrics) {
                try {
                    const cached = await readLyricsService().getCachedLyrics(lyricsCacheId, provider.id);
                    const isProviderCacheCurrent = cached && (!provider.cacheVersion || cached.cacheVersion === provider.cacheVersion);
                    const isSyncDataRendererCurrent = !cached?.syncDataApplied
                        || cached.syncDataRendererVersion === SYNC_DATA_RENDERER_VERSION;
                    if (isProviderCacheCurrent && isSyncDataRendererCurrent) {
                        result = cached;
                        cacheHit = true;
                        debug(`[LyricsAddonManager] Cache hit for ${provider.id}`);
                    } else if (isProviderCacheCurrent && !isSyncDataRendererCurrent) {
                        debug(`[LyricsAddonManager] Sync-data renderer cache mismatch for ${provider.id}, refetching...`);
                    } else if (cached) {
                        debug(`[LyricsAddonManager] Cache version mismatch for ${provider.id}, refetching...`);
                    }
                } catch (error) {
                    console.warn(`[LyricsAddonManager] Cache lookup failed for ${provider.id}:`, error);
                }
            }

            if (!result && isCurrent()) {
                result = await (provider.supportsAbortSignal && signal
                    ? provider.getLyrics(info, { signal })
                    : provider.getLyrics(info));
                providerFetched = true;
            }
        } finally {
            if (debugTiming) {
                readAddonDebug().timeEnd('lyrics', `provider:${provider.id}`);
            }
        }

        return { result, cacheHit, providerFetched };
    }

    return async function loadProviderCandidate(provider, info, context, typeSettings, isPseudoKaraokeResult) {
        const { lyricsCacheId: playbackCacheId, trackId, trackIsrc, isCurrent = () => true, signal } = context;
        // The editor must neither reuse playback-only mirror/local lyrics
        // nor replace those playback results with its official source.
        const lyricsCacheId = info?.lrclibOfficialOnly && provider.id === 'lrclib' ? null : playbackCacheId;
        const allowCharacter = typeSettings[LYRICS_TYPES.CHARACTER];
        const allowWord = typeSettings[LYRICS_TYPES.WORD];
        const allowKaraoke = allowCharacter || allowWord;
        const allowSynced = typeSettings[LYRICS_TYPES.SYNCED];
        const allowUnsynced = typeSettings[LYRICS_TYPES.UNSYNCED];

        if (!allowKaraoke && !allowSynced && !allowUnsynced) {
            debug(`[LyricsAddonManager] All lyrics types disabled for ${provider.id}, skipping`);
            return null;
        }

        debug(`[LyricsAddonManager] Trying provider: ${provider.id}`);
        debug(`[LyricsAddonManager] User settings for ${provider.id}: character=${allowCharacter}, word=${allowWord}, synced=${allowSynced}, unsynced=${allowUnsynced}`);

        const addonDebug = readAddonDebug();
        const debugTiming = addonDebug?.isEnabled();
        if (debugTiming) addonDebug.time('lyrics', `provider:${provider.id}`);

        const fetched = await resolveProviderResult(provider, info, lyricsCacheId, debugTiming, { isCurrent, signal });
        if (!isCurrent()) return null;
        let result = fetched.result;
        const { cacheHit, providerFetched } = fetched;

        if (!result || result.error || (result.uri && result.uri !== info.uri)) {
            debug(`[LyricsAddonManager] Provider ${provider.id} returned error:`, result?.error);
            return null;
        }

        const normalizedInstrumentalBreaks = normalizeProviderInstrumentalBreaks(result, info);
        // Timing services can mutate the result object. The cache and add-on
        // retain ownership of the value they handed us.
        result = { ...normalizedInstrumentalBreaks.result };
        const timingContext = { trackId, trackIsrc, isCurrent };

        const hasRedactedContributors = cacheHit && result.syncDataApplied
            && Array.isArray(result.contributors)
            && result.contributors.some(item => item?.identityRedacted === true);
        if (hasRedactedContributors) {
            await refreshContributorIdentity(result, provider.id, info, timingContext);
            if (!isCurrent()) return null;
        }

        result = applyKaraokeGranularity(result);
        const resultHasKaraoke = hasLyricsContent(result.karaoke);
        const resultKaraokeGranularity = resultHasKaraoke
            ? inferKaraokeGranularity(result)
            : '';
        const resultHasCharacterKaraoke = resultHasKaraoke
            && resultKaraokeGranularity === LYRICS_TYPES.CHARACTER;
        const resultHasSynced = hasLyricsContent(result.synced);
        const resultHasUnsynced = hasLyricsContent(result.unsynced);
        const needsCharacterKaraoke = allowCharacter && (
            !resultHasCharacterKaraoke
            || isPseudoKaraokeResult(result)
        );
        const hasBaseLyrics = resultHasSynced || resultHasUnsynced;
        const shouldApplyRegisteredSyncData = needsCharacterKaraoke && hasBaseLyrics;

        debug(`[LyricsAddonManager] Got lyrics from: ${provider.id}`, {
            hasKaraoke: resultHasKaraoke,
            hasSynced: resultHasSynced,
            hasUnsynced: resultHasUnsynced,
            provider: result.provider
        });
        console.info('[ivLyrics sync-data]', 'LyricsAddonManager:sync-check', {
            providerId: provider.id,
            resultProvider: result.provider || null,
            shouldApplyRegisteredSyncData,
            allowCharacter,
            allowWord,
            hasKaraoke: resultHasKaraoke,
            karaokeGranularity: resultKaraokeGranularity || null,
            hasSynced: resultHasSynced,
            hasUnsynced: resultHasUnsynced,
            needsCharacterKaraoke,
            hasBaseLyrics,
            isrc: trackIsrc || null,
            hasSyncDataService: !!readSyncDataService()?.getSyncData
        });

        const syncDataAppliedThisCall = shouldApplyRegisteredSyncData
            && await applyRegisteredTiming(result, provider.id, info, timingContext, resultHasSynced);
        if (!isCurrent()) return null;

        const pseudoKaraokeChanged = allowKaraoke && await applyPseudoTiming(result, info, isCurrent);
        if (!isCurrent()) return null;

        // Sync-data and pseudo-karaoke can rebuild line objects after the
        // provider result was normalized. Normalize once more at the final
        // boundary so every provider and lyric type keeps the same marker.
        const finalInstrumentalBreaks = normalizeProviderInstrumentalBreaks(result, info);
        result = applyKaraokeGranularity(finalInstrumentalBreaks.result);
        const instrumentalBreaksNormalized = normalizedInstrumentalBreaks.changed
            || finalInstrumentalBreaks.changed;

        const {
            finalResult,
            finalKaraokeGranularity,
            hasKaraoke,
            hasCharacterKaraoke,
            hasWordKaraoke,
            hasSynced,
            hasUnsynced,
            isPseudoKaraoke
        } = filterProviderCandidateResult(
            result,
            { allowKaraoke, allowCharacter, allowWord, allowSynced, allowUnsynced },
            isPseudoKaraokeResult
        );

        debug(`[LyricsAddonManager] After filtering for ${provider.id}:`, {
            hasKaraoke,
            karaokeGranularity: hasKaraoke ? finalKaraokeGranularity : null,
            hasSynced,
            hasUnsynced,
            isPseudoKaraoke
        });

        const shouldUpdateCache = (!cacheHit && providerFetched)
            || syncDataAppliedThisCall
            || pseudoKaraokeChanged
            || instrumentalBreaksNormalized;
        if (
            (hasKaraoke || hasSynced || hasUnsynced)
            && lyricsCacheId
            && readLyricsService()?.cacheLyrics
            && !result.skipCache
            && shouldUpdateCache
            && isCurrent()
        ) {
            const cachePayload = { ...result };
            if (cachePayload.syncDataApplied) {
                cachePayload.syncDataRendererVersion = SYNC_DATA_RENDERER_VERSION;
            }
            delete cachePayload.skipCache;
            const service = readLyricsService();
            if (provider.id === 'lrcred' && service.updateCachedLyrics && !cachePayload.syncDataApplied
                && (!cachePayload.karaoke?.length || isPseudoKaraokeResult(cachePayload))) {
                // A provider lookup can finish its sync-data checks after the
                // background job has already saved real word timings.
                service.updateCachedLyrics(lyricsCacheId, provider.id, current => {
                    if (!isCurrent()) return null;
                    const keepTiming = current?.cacheVersion === cachePayload.cacheVersion
                        && normalizeLrcRedIsrc(current?.lrcred?.isrc)
                        && current.karaoke?.length && !current.error
                        && (current.syncDataApplied
                            ? current.syncDataRendererVersion === SYNC_DATA_RENDERER_VERSION
                            : !isPseudoKaraokeResult(current))
                        && canApplyLrcRedWordTiming(cachePayload, current, isPseudoKaraokeResult);
                    return keepTiming ? null : cachePayload;
                });
            } else {
                service.cacheLyrics(lyricsCacheId, provider.id, cachePayload, isCurrent);
            }
        }

        return {
            provider,
            result: finalResult,
            hasKaraoke,
            hasCharacterKaraoke,
            hasWordKaraoke,
            hasSynced,
            hasUnsynced,
            isPseudoKaraoke
        };
    };
}
