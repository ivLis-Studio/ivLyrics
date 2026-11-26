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

  async function clearWithLoadRecovery(page, trackUri, clear, errorMessage) {
    const interrupted = trackUri && page?.currentTrackUri === trackUri
      && page.pageLyricsDataLoader?.hasPending?.(trackUri)
      ? { uri: trackUri, lyricsRequestSeq: page._activeLyricsFetchSeq }
      : null;
    try {
      if (await clear() === false) throw new Error(errorMessage);
    } catch (error) {
      // The settings controller reloads after a successful clear. If storage
      // failed after cancellation, resume only the request this clear stopped.
      if (interrupted && getLyricsPage() === page && page.isCurrentLyricsState(interrupted)) {
        try {
          await page.reloadLyrics?.(false, trackUri);
        } catch (reloadError) {
          console.warn("[LocalCacheManager] Failed to resume the interrupted lyrics load:", reloadError);
        }
      }
      throw error;
    }
  }

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
    const page = getLyricsPage();
    await clearWithLoadRecovery(page, page?.currentTrackUri, () => {
      page?.pageLyricsDataLoader?.cancelPending();
      getLyricsService()?.clearLyricsSnapshot?.();
      const translator = getTranslator();
      translator?.clearAllMemoryCache?.();
      translator?.clearAllInflightRequests?.();
      page?.clearAllCulturalAnnotations?.({ updateState: true });
      pageTranslationMemoryCache.clear();
      for (const key of Object.keys(pageLyricsMemoryCache)) delete pageLyricsMemoryCache[key];
      page?.clearTranslationRequestsForCacheRemoval?.();
      getSyncDataService()?.clearCache(undefined, { preserveOpenDb: true });
      return getLyricsCache().clearAll();
    }, "Could not clear the local lyrics cache.");
  };

  const clearTrack = async (trackUri, trackId, removeLocalLyrics) => {
    const savedLocalLyrics = removeLocalLyrics ? localLyrics.get(trackUri) : null;
    const page = getLyricsPage();
    await clearWithLoadRecovery(page, trackUri, () => {
      invalidateTrack(trackUri, page);
      const translator = getTranslator();
      translator?.clearMemoryCache?.(trackId);
      page?.clearCulturalAnnotationsForTrack?.(trackUri, { updateState: true });
      page?.clearTranslationRequestsForCacheRemoval?.(trackUri);
      getSyncDataService()?.clearCache(trackId, { preserveOpenDb: true });
      return getLyricsCache().clearTrack(trackId);
    }, "Could not clear this track's lyrics cache.");
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
