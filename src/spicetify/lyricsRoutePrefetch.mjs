import { createLyricPrefetcher } from "#ivlyrics/lyrics/createLyricPrefetcher.mjs";
import { createNextTrackPrefetch } from "#ivlyrics/lyrics/nextTrackPrefetch.mjs";
import { WORD_KARAOKE } from "#ivlyrics/lyrics/lyricsRenderModes.mjs";
import { getWordSupplementPrefetcher } from "#ivlyrics/lyrics/wordSupplementRuntime.mjs";
import { readPronunciationSlots } from "#ivlyrics/lyrics/pronunciationRuntime.mjs";
import { readMarketplaceManager } from "#ivlyrics/features/marketplace/marketplaceRuntime.mjs";
import { pageLyricsMemoryCache as CACHE, pageTranslationMemoryCache as CacheManager } from "#ivlyrics/lyrics/pageMemoryCache.mjs";
import { createYouTubeVideoLookup, createYouTubeVideoLookupRequest } from "#ivlyrics/features/video/youTubeVideoLookupRequest.mjs";
import { createVideoPrefetcher, createVideoDownloadPrefetcher } from "#ivlyrics/features/video/createVideoPrefetcher.mjs";
import { createVideoMatchSession, getYouTubeVideoCandidates } from "#ivlyrics/features/video/videoMatchSession.mjs";
import { schedulePagePrefetchCleanup } from "./pageStartup.mjs";

const PREFETCH_CACHE_MAX_AGE_MS = 30 * 60 * 1000;

export function createLyricsRoutePrefetch({
  host, readVisual, readVersion, readUtils, getService, timers, debug, fetchVideo,
  readSpotifyData, readPlayerItem, readVideoHelper,
  getDisplayModeCacheKey, getDisplayModeGenerationOptions, getNonSectionLyricsText, getLegacyNonSectionLyricsText,
  getCurrentTranslationTargetLanguage, getCachedTranslationForText, mapTranslationLinesToLyrics,
}) {
  const prefetchCache = new Map();
  const prefetchRequests = new Map();
  const prefetchRuntime = {
    cache: prefetchCache,
    requests: prefetchRequests,
    readVisual, getService, debug,
  };
  const lyricPrefetcher = createLyricPrefetcher({
    ...prefetchRuntime,
    getWordSupplementPrefetcher,
    getPronunciationSlots: () => readPronunciationSlots(host),
    getMarketplaceReady: () => readMarketplaceManager(host)?.readyPromise,
    sourceCache: CACHE,
    translationCache: CacheManager,
    extractTrackId: (uri) => readUtils().extractTrackId(uri),
    getTranslationCacheId: (uri) => readUtils().getTranslationCacheId(uri),
    getDisplayModeCacheKey,
    getDisplayModeGenerationOptions,
    getNonSectionLyricsText,
    getLegacyNonSectionLyricsText,
    getCurrentTranslationTargetLanguage,
    getCachedTranslationForText,
    mapTranslationLinesToLyrics,
  });
  const makeVideoLookupRequest = (params) => createYouTubeVideoLookupRequest({
    ...params,
    clientVersion: readUtils()?.currentVersion || readVersion() || "unknown",
    shouldBypassCache: (isrc) => getService("SyncDataService")?.shouldBypassServerCache?.(isrc),
  });
  const fetchVideoLookup = createYouTubeVideoLookup(fetchVideo);
  const routeVideoMatchSession = createVideoMatchSession({
    normalizeIsrc: (value) => getService("SyncDataService")?.normalizeSyncDataIsrc?.(value),
  });
  const videoPrefetcher = createVideoPrefetcher({
    ...prefetchRuntime,
    maxAgeMs: PREFETCH_CACHE_MAX_AGE_MS,
    extractTrackId: (uri) => readUtils().extractTrackId(uri),
    readSpotifyData: (uri) => readSpotifyData(uri),
    readPlayerItem,
    makeLookupRequest: makeVideoLookupRequest,
    pickVideo: (track, response, uri) => routeVideoMatchSession.pickVideoForTrack(
      track, getYouTubeVideoCandidates(response.data, response.communityVideos), uri,
    ),
    isRejectedVideoForTrack: routeVideoMatchSession.isRejectedVideoForTrack,
    prefetchDownload: createVideoDownloadPrefetcher({
      ...prefetchRuntime, ...timers, readVideoHelper,
    }),
    fetchVideoLookup,
  });
  const nextTrackPrefetch = createNextTrackPrefetch({
    ...prefetchRuntime,
    ...timers,
    maxAgeMs: PREFETCH_CACHE_MAX_AGE_MS,
    wordMode: WORD_KARAOKE,
    lyrics: lyricPrefetcher,
    loadVideo: videoPrefetcher.loadVideo,
  });

  schedulePagePrefetchCleanup(host, nextTrackPrefetch.cleanupOldEntries);

  return { nextTrackPrefetch, makeVideoLookupRequest, fetchVideoLookup, routeVideoMatchSession, readPrefetchedVideo: videoPrefetcher.getVideoInfo };
}
