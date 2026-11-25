import { createLocalLyricsStore } from "../../lyrics/localLyricsStore.mjs";
import { pageLyricsMemoryCache, pageTranslationMemoryCache } from "../../lyrics/pageMemoryCache.mjs";
import { invalidatePageLyricsTrack } from "../../lyrics/pageLyricsSourceCache.mjs";

export function createSettingsCacheActions({
  storage, services: { getSyncDataService, getLyricsService, getLyricsCache, getTranslator },
  getLyricsPage, onLocalLyricsDeleted,
}) {
  const localLyrics = createLocalLyricsStore({
    readStorage: () => storage,
    onReadError: (error) => console.warn("[LocalCacheManager] Failed to read local lyrics:", error),
  });
  const hasSavedLocalLyrics = localLyrics.has;
  const invalidateTrack = (trackUri, page) => invalidatePageLyricsTrack(trackUri, {
    page, sourceCache: pageLyricsMemoryCache, translationCache: pageTranslationMemoryCache, service: getLyricsService(),
  });

  // Imported lyrics are saved user data. Removing them requires separate confirmation.
  const deleteSavedLocalLyrics = (trackUri) => {
    const page = getLyricsPage();
    if (typeof page?.deleteLocalLyrics === "function") {
      page.deleteLocalLyrics(trackUri);
    } else {
      localLyrics.remove(trackUri);
      invalidateTrack(trackUri, page);
    }
    onLocalLyricsDeleted(trackUri);
    return true;
  };

  const clearAll = async () => {
    getLyricsService()?.clearLyricsSnapshot?.();
    const translator = getTranslator();
    translator?.clearAllMemoryCache?.();
    translator?.clearAllInflightRequests?.();
    const page = getLyricsPage();
    page?.clearAllCulturalAnnotations?.({ updateState: true });
    pageTranslationMemoryCache.clear();
    for (const key of Object.keys(pageLyricsMemoryCache)) delete pageLyricsMemoryCache[key];
    page?.clearTranslationRequestsForCacheRemoval?.();
    getSyncDataService()?.clearCache(undefined, { preserveOpenDb: true });
    if (await getLyricsCache().clearAll() === false) throw new Error("Could not clear the local lyrics cache.");
  };

  const clearTrack = async (trackUri, trackId, removeLocalLyrics) => {
    const savedLocalLyrics = removeLocalLyrics ? localLyrics.get(trackUri) : null;
    invalidateTrack(trackUri);
    const page = getLyricsPage();
    const translator = getTranslator();
    translator?.clearMemoryCache?.(trackId);
    page?.clearCulturalAnnotationsForTrack?.(trackUri, { updateState: true });
    page?.clearTranslationRequestsForCacheRemoval?.(trackUri);
    getSyncDataService()?.clearCache(trackId, { preserveOpenDb: true });
    if (await getLyricsCache().clearTrack(trackId) === false) throw new Error("Could not clear this track's lyrics cache.");
    // Confirmation applies to the saved lyrics present when the clear began.
    if (!savedLocalLyrics || JSON.stringify(localLyrics.get(trackUri)) !== JSON.stringify(savedLocalLyrics)) return false;
    return deleteSavedLocalLyrics(trackUri);
  };

  return {
    hasSavedLocalLyrics, clearAll, clearTrack,
    getStats: () => getLyricsCache().getStats(),
    getOpenDbInfo: () => getSyncDataService()?.getOpenDbCacheInfo?.() || null,
    getOpenDbRefresh: () => getSyncDataService()?.refreshOpenDbCache,
  };
}
