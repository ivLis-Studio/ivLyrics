import { GLOBAL_SYNC_OFFSET_SETTING, resolveGlobalSyncOffset } from "#ivlyrics/core/globalSyncOffset.mjs";

function normalizeStoredOffset(value) {
  if (typeof value !== "number" && typeof value !== "string") return 0;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return numeric;
}

function pageOwnsTrack(page, uri) {
  if (!uri || !page || page._isComponentMounted === false) return false;
  return (page.currentTrackUri || page.state?.uri || null) === uri;
}

export function createOverlayOffsetResolver({
  readSettingSources, getVisualSettings, getMountedLyricsPage, getPageGlobalOffset, readTrackOffset,
}) {
  const pendingByCache = new WeakMap();

  const readPersistedOffset = (key) => {
    for (const readSetting of readSettingSources) {
      try {
        const value = readSetting(key);
        if (value != null) return value;
      } catch {
        // An unavailable store must not prevent the remaining fallbacks.
      }
    }
    return null;
  };

  function readTrackOffsetOnce(sender, cache, uri) {
    if (!cache) return Promise.resolve().then(() => readTrackOffset(uri)).then(normalizeStoredOffset, () => 0);
    let pending = pendingByCache.get(cache);
    if (!pending) pendingByCache.set(cache, pending = new Map());
    if (pending.has(uri)) return pending.get(uri);

    const request = Promise.resolve().then(() => readTrackOffset(uri)).then(value => {
      const offset = normalizeStoredOffset(value);
      if (sender._offsetCache === cache && !Object.hasOwn(cache, uri)) cache[uri] = offset;
      return offset;
    }, () => 0).finally(() => pending.delete(uri));
    pending.set(uri, request);
    return request;
  }

  async function resolveTrackOffset(sender, uri) {
    if (!uri) return 0;
    for (;;) {
      const cache = sender?._offsetCache;
      if (cache && Object.hasOwn(cache, uri)) return normalizeStoredOffset(cache[uri]);
      const offset = await readTrackOffsetOnce(sender, cache, uri);
      // Offset edits, song changes and sender restarts replace the cache.
      // Follow the replacement before returning a buffered read.
      if (sender?._offsetCache === cache) {
        return cache && Object.hasOwn(cache, uri) ? normalizeStoredOffset(cache[uri]) : offset;
      }
    }
  }

  return async function getSyncOffset(uri) {
    const trackOffset = await resolveTrackOffset(this, uri);
    const visual = getVisualSettings();
    const savedDelay = uri ? readPersistedOffset(`lyrics-delay:${uri}`) : null;
    const configuredDelay = visual?.delay;
    const page = getMountedLyricsPage();
    // An unmounted page or the previous track can leave its delay in CONFIG.
    const usePageDelay = pageOwnsTrack(page, uri) && visual
      && Object.prototype.hasOwnProperty.call(visual, "delay");
    const delay = normalizeStoredOffset(usePageDelay ? configuredDelay : savedDelay);

    let pageGlobalOffset;
    try {
      pageGlobalOffset = getPageGlobalOffset();
    } catch {
      // The page may be between tracks. Follow the same persisted fallbacks.
    }
    const globalOffset = resolveGlobalSyncOffset(
      pageGlobalOffset ?? visual?.[GLOBAL_SYNC_OFFSET_SETTING], readPersistedOffset,
    );

    const offset = delay + globalOffset + trackOffset;
    return offset === 0 ? 0 : -offset;
  };
}
