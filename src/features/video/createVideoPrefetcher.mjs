import { describeVideoTrack } from "./videoTrackMetadata.mjs";

const isVideoPrefetchEnabled = visual => visual["video-background"] !== false
  && visual["prefetch-video-enabled"] !== false && visual["community-video-random"] !== true;

function createPrefetchInterests(onEmpty) {
  const consumers = new Map();
  function add(interest) {
    const { signal } = interest;
    const detach = () => signal?.removeEventListener("abort", release);
    function release() {
      detach();
      if (consumers.delete(interest) && consumers.size === 0) onEmpty();
    }
    consumers.set(interest, detach);
    signal?.addEventListener("abort", release, { once: true });
  }
  function clear() {
    for (const detach of consumers.values()) detach();
    consumers.clear();
  }
  return { add, clear, active: () => [...consumers.keys()].filter(interest => interest.wanted()) };
}

export function createVideoPrefetcher({
  cache, requests, maxAgeMs, readVisual, getService, extractTrackId, readSpotifyData, readPlayerItem,
  makeLookupRequest, pickVideo, isRejectedVideoForTrack, prefetchDownload, fetchVideoLookup, debug, warn = console.warn,
}) {
  const describeTrack = (uri, trackId, queuedTrack) => describeVideoTrack({
    trackUri: uri, trackId, spotifyData: readSpotifyData(uri), playerItem: readPlayerItem(), queuedTrack,
  });
  const getCacheKey = trackId => `prefetch:video:${trackId}`;
  const getRevision = trackId => getService("LyricsCache")?.getRevision?.(trackId) ?? 0;

  function getCachedVideo(trackId, uri, revision) {
    const cached = cache.get(getCacheKey(trackId));
    if (!cached?.data?.youtubeVideoId || cached.revision !== revision || Date.now() - cached.timestamp >= maxAgeMs) return null;
    return isRejectedVideoForTrack(uri, cached.data.youtubeVideoId) ? null : cached;
  }

  async function loadVideo(uri, trackInfo = null, { wanted = () => true, signal } = {}) {
    if (signal?.aborted || !wanted() || !isVideoPrefetchEnabled(readVisual())) return null;

    const trackId = extractTrackId(uri);
    if (!trackId) return;
    const revision = getRevision(trackId);
    const cacheCurrent = () => getRevision(trackId) === revision && isVideoPrefetchEnabled(readVisual());
    const metadata = describeTrack(uri, trackId, trackInfo);
    const isrc = await getService("SyncDataService")?.resolveTrackIsrc?.(trackId, metadata)
      || getService("SyncDataService")?.getTrackIsrc?.(trackId, metadata)
      || "";
    if (signal?.aborted || !wanted() || !cacheCurrent()) return null;
    if (!isrc) {
      warn(`[Prefetcher] ISRC를 확인할 수 없어 영상 프리페치를 건너뜁니다: ${trackId}`);
      return null;
    }

    const interest = { wanted: () => cacheCurrent() && wanted(), signal };
    const cacheKey = getCacheKey(trackId);

    const cached = getCachedVideo(trackId, uri, revision);
    if (cached?.isrc === isrc) {
      debug(`[Prefetcher] Video info already cached for: ${isrc}`);
      prefetchDownload(cached.data.youtubeVideoId, interest);
      return;
    }

    const pending = requests.get(cacheKey);
    if (pending?.revision === revision && pending.isrc === isrc) {
      pending.interests.add(interest);
      return pending.promise;
    }
    pending?.cancel();

    const controller = new AbortController();
    function release() {
      if (requests.get(cacheKey) === request) requests.delete(cacheKey);
      interests.clear();
    }
    function cancel() {
      release();
      controller.abort();
    }
    const interests = createPrefetchInterests(cancel);
    interests.add(interest);
    const request = { revision, isrc, interests, cancel, promise: null };
    request.promise = Promise.resolve().then(async () => {
      try {
        if (controller.signal.aborted || !interests.active().length) return null;
        debug(`[Prefetcher] Fetching video info for: ${isrc} (fallback)`);

        const { url, headers } = makeLookupRequest({ trackIsrc: isrc, trackId, spotifyData: metadata });
        const { data, isDecoy } = await fetchVideoLookup(url, { headers, cacheRevision: revision, signal: controller.signal });
        if (controller.signal.aborted || !cacheCurrent() || requests.get(cacheKey) !== request) return null;
        if (isDecoy) {
          warn(`[Prefetcher] Video prefetch returned decoy for: ${isrc}`);
          return null;
        }

        if (data?.success) {
          // The track's ISRC was resolved locally before the request. Never
          // re-map the track (or cache) by an ISRC echoed from the response:
          // a mismatched server answer would otherwise stick to this track.
          const responseIsrc = getService("SyncDataService")?.normalizeSyncDataIsrc?.(data.data?.isrc) || "";
          if (responseIsrc && responseIsrc !== isrc) {
            warn(`[Prefetcher] Video response ISRC ${responseIsrc} differs from requested ${isrc}`);
          }
          const picked = pickVideo({ ...metadata, isrc }, data, uri);
          // Do not cache or download a different recording even under the right
          // cache key. Playback re-checks this selection once its length is known.
          if (!picked) return null;
          cache.set(cacheKey, {
            data: picked.video,
            timestamp: Date.now(),
            isrc,
            revision,
          });
          debug(`[Prefetcher] Video info cached for: ${isrc}`);
          if (picked.video?.youtubeVideoId) {
            for (const consumer of interests.active()) prefetchDownload(picked.video.youtubeVideoId, consumer);
          }
        }

        return data;
      } catch (error) {
        if (!controller.signal.aborted && cacheCurrent()) warn(`[Prefetcher] Video prefetch failed:`, error.message);
        return null;
      } finally {
        release();
      }
    });

    requests.set(cacheKey, request);
    return request.promise;
  }

  function getVideoInfo(uri) {
    const trackId = extractTrackId(uri);
    if (!trackId) return null;
    const cached = getCachedVideo(trackId, uri, getRevision(trackId));
    if (!cached) return null;
    const isrc = getService("SyncDataService")?.getTrackIsrc?.(trackId, describeTrack(uri, trackId));
    return !isrc || isrc === cached.isrc ? cached.data : null;
  }

  return { loadVideo, getVideoInfo };
}

export function createVideoDownloadPrefetcher({
  cache, requests, readVisual, getService, scheduleTimer, cancelTimer, debug, warn = console.warn,
  readVideoHelper = () => getService("VideoHelperService"),
}) {
  const isDownloadEnabled = () => {
    const visual = readVisual();
    return isVideoPrefetchEnabled(visual)
      && (visual["video-helper-enabled"] === true || visual["video-helper-enabled"] === "true");
  };
  return async function prefetchDownload(videoId, { wanted = () => true, signal } = {}) {
    if (signal?.aborted || !wanted() || !isDownloadEnabled()) return;
    const helper = readVideoHelper();
    if (!helper) return;

    const key = `prefetch:helper:${videoId}`;
    if (cache.has(key)) return;
    const pending = requests.get(key);
    if (pending) {
      pending.interests.add({ wanted, signal });
      return;
    }

    const interests = createPrefetchInterests(cancel);
    interests.add({ wanted, signal });
    const request = { interests, timeout: null, abort: null };
    requests.set(key, request);
    const ownsRequest = () => requests.get(key) === request;
    const finish = () => {
      if (!ownsRequest()) return false;
      requests.delete(key);
      interests.clear();
      if (request.timeout !== null) cancelTimer(request.timeout);
      return true;
    };
    function cancel() {
      if (finish()) request.abort?.();
    }

    try {
      const available = await helper.isHelperAvailable();
      if (!ownsRequest()) return;
      if (!isDownloadEnabled() || !interests.active().length) {
        finish();
        return;
      }
      if (!available) {
        debug(`[Prefetcher] Helper not available, skipping prefetch for: ${videoId}`);
        finish();
        return;
      }

      debug(`[Prefetcher] Starting helper prefetch for video: ${videoId}`);
      request.abort = helper.requestVideo(videoId, {
        onProgress: ({ percent }) => {
          if (ownsRequest() && percent > 0 && percent < 100) {
            debug(`[Prefetcher] Helper prefetch progress: ${percent}% for ${videoId}`);
          }
        },
        onComplete: (url) => {
          if (!finish() || !isDownloadEnabled()) return;
          debug(`[Prefetcher] Helper prefetch complete for: ${videoId}`);
          cache.set(key, { videoId, url, timestamp: Date.now() });
        },
        onError: (message) => {
          if (finish()) warn(`[Prefetcher] Helper prefetch failed for ${videoId}:`, message);
        },
      });

      if (ownsRequest()) {
        request.timeout = scheduleTimer(() => {
          if (!ownsRequest()) return;
          debug(`[Prefetcher] Helper prefetch timeout for: ${videoId}`);
          cancel();
        }, 30000);
      }
    } catch (error) {
      if (finish()) warn("[Prefetcher] Helper prefetch error:", error.message);
    }
  };
}
