import { runWithAbortSignal } from "../core/abortableOperation.mjs";
import { createLocalLyricsImportLifetime } from "./localLyricsImportLifetime.mjs";
import { invalidatePageLyricsTrack } from "./pageLyricsSourceCache.mjs";

// Keep the saved lyrics lifecycle independent of the page, the provider and
// the browser file picker. All three entry points commit through applyLocalLyrics.
const EMPTY_TRANSLATION_STATE = {
  romaji: null, furigana: null, hiragana: null, katakana: null, hangul: null,
  romaja: null, cn: null, hk: null, tw: null, currentLyrics: null, language: null,
};

export function createPageLocalLyrics({
  page, store, lyricsCache, translationCache, readPlayerItem, isTrackCurrent,
  readLyricsService, readPseudoKaraoke, readAddonManager,
  parseLocalLyrics, createFileInput, createFileReader, confirmAction,
  onLocalLyricsUpdated, translate, toast,
}) {
  const imports = createLocalLyricsImportLifetime();
  const invalidateTrack = (uri, service) => invalidatePageLyricsTrack(uri, {
    page, sourceCache: lyricsCache, translationCache, service,
  });

  function saveLocalLyrics(uri, lyrics) {
    const active = isTrackCurrent(uri);
    store.write(uri, active ? { ...lyrics, ...page.getTranslationStates() } : lyrics);
    if (active) page.setState(() => isTrackCurrent(uri) ? { isCached: true } : null);
  }

  function deleteLocalLyrics(uri) {
    store.remove(uri);
    imports.cancel(uri);
    invalidateTrack(uri, readLyricsService());
    if (isTrackCurrent(uri)) {
      page.beginLyricsLoadRequest();
      page.clearPendingLyricsUpdates();
      page.setState(() => isTrackCurrent(uri) ? { isCached: false } : null);
    }
  }

  const lyricsSaved = store.has;
  const getCurrentLyricsTrackUri = () => page.currentTrackUri || page.state.uri || readPlayerItem()?.uri || null;
  const hasLocalLyricsForCurrentTrack = (trackUri = getCurrentLyricsTrackUri()) => lyricsSaved(trackUri);

  function canStartTrackAction(uri, expectedUri) {
    if (uri && (expectedUri === undefined || uri === expectedUri) && isTrackCurrent(uri)) return true;
    toast.error(page.getText("notifications.noTrackPlaying", "No track playing"));
    return false;
  }

  function captureLocalTrack() {
    const uri = getCurrentLyricsTrackUri();
    const item = readPlayerItem();
    const metadata = item?.uri === uri ? item.metadata : null;
    return {
      uri,
      title: metadata?.title ?? page.state.title,
      artist: metadata?.artist_name ?? page.state.artist,
      duration: item?.uri === uri ? Number(metadata?.duration ?? item.duration?.milliseconds) : undefined,
    };
  }

  async function removeLocalLyricsForCurrentTrack({ confirm = true, trackUri } = {}) {
    const currentUri = getCurrentLyricsTrackUri();
    if (!canStartTrackAction(currentUri, trackUri)) return false;
    if (!lyricsSaved(currentUri)) {
      toast.error(page.getText("notifications.noLocalLyricsToDelete", "No local lyrics are saved for this track"));
      return false;
    }
    if (confirm && !confirmAction(page.getText(
      "menu.localLyricsDeleteConfirm",
      "Delete the local lyrics saved for this track? This can't be undone."
    ))) {
      return false;
    }

    deleteLocalLyrics(currentUri);
    onLocalLyricsUpdated({ trackUri: currentUri, deleted: true });
    if (isTrackCurrent(currentUri) && typeof page.reloadLyrics === "function") {
      await page.reloadLyrics(true, currentUri);
    }
    toast.success(page.getText("notifications.localLyricsDeleted", "Local lyrics deleted"));
    return true;
  }

  function getParsedLocalLyricsTypes(localLyrics) {
    return ["karaoke", "synced", "unsynced"]
      .filter((key) => Array.isArray(localLyrics?.[key]) && localLyrics[key].length > 0)
      .map((key) => key[0].toUpperCase() + key.slice(1));
  }

  async function applyLocalLyrics(
    localLyrics, { sourceLabel = "local", successMessage = null, track = captureLocalTrack(), signal } = {},
    reservedImport = null,
  ) {
    if (!page._isComponentMounted || signal?.aborted || (reservedImport && !reservedImport.isCurrent())) return false;
    const uri = track.uri;
    if (!uri) {
      toast.error(page.getText("notifications.noTrackPlaying", "No track playing"));
      return false;
    }

    const parsedKeys = getParsedLocalLyricsTypes(localLyrics);
    if (!parsedKeys.length) {
      toast.error(page.getText("notifications.noValidLyricsInFile", "No valid lyrics found"));
      return false;
    }

    const operation = reservedImport || imports.begin(uri, signal);
    try {
      return await importLyrics(localLyrics, track, { parsedKeys, operation, sourceLabel, successMessage });
    } catch (error) {
      if (operation.signal.aborted) return false;
      throw error;
    } finally {
      operation.finish();
    }
  }

  async function importLyrics(localLyrics, track, { parsedKeys, operation, sourceLabel, successMessage }) {
    const { uri, duration } = track;
    const parsedLyrics = {
      karaoke: Array.isArray(localLyrics.karaoke) && localLyrics.karaoke.length ? localLyrics.karaoke : null,
      synced: Array.isArray(localLyrics.synced) && localLyrics.synced.length ? localLyrics.synced : null,
      unsynced: Array.isArray(localLyrics.unsynced) && localLyrics.unsynced.length ? localLyrics.unsynced : null,
      provider: "local",
      uri,
      localLyricsSource: sourceLabel,
    };
    const pseudoKaraoke = readPseudoKaraoke();
    if (pseudoKaraoke?.applyToResult) {
      await runWithAbortSignal(operation.signal, () => pseudoKaraoke.applyToResult(parsedLyrics, { uri, duration }));
    }
    if (!page._isComponentMounted || !operation.isCurrent()) return false;
    const nextLyrics = readAddonManager()?.normalizeResult?.(parsedLyrics, { uri, duration }) || parsedLyrics;
    const translations = {
      ...EMPTY_TRANSLATION_STATE,
      ...page.applyTranslationStates(nextLyrics),
    };

    // Save before publishing so a failed storage write cannot replace the page's lyrics.
    store.write(uri, { ...nextLyrics, ...translations });
    const service = readLyricsService();
    invalidateTrack(uri, service);
    lyricsCache[uri] = {
      ...nextLyrics,
      trackLyricsProviderOverride: null,
    };
    service?.publishLyricsSnapshot?.({
      trackUri: uri,
      trackInfo: { uri, title: track.title, artist: track.artist },
      rawResult: lyricsCache[uri],
      provider: 'local',
      karaokeSource: nextLyrics.karaokeSource || null,
      trackLyricsProviderOverride: null,
      source: 'ivlyrics-page-base',
    });

    if (isTrackCurrent(uri)) {
      page.lastProcessedUri = null;
      page.lastProcessedMode = null;
      const requestSeq = page.beginLyricsLoadRequest();
      page.clearPendingLyricsUpdates();
      const isActiveImport = () => isTrackCurrent(uri)
        && page.isCurrentLyricsState({ uri, lyricsRequestSeq: requestSeq });

      page.setState(
        () => isActiveImport() ? {
          ...nextLyrics,
          ...translations,
          lyricsRequestSeq: requestSeq,
          isLoading: false,
          lyricsStatus: "ready",
          lyricsDisplayUri: uri,
          isCached: true,
          error: null,
        } : null,
        () => {
          if (isActiveImport()) page.lyricsSource(page.state, page.getCurrentMode());
        },
      );
    }
    onLocalLyricsUpdated({ trackUri: uri });

    const defaultSuccessMessage = page
      .getText("notifications.lyricsLoadedFromFile", "Lyrics loaded: {types}")
      .replace("{types}", parsedKeys.join(", "));
    toast.success(successMessage || defaultSuccessMessage);
    return true;
  }

  function importLocalLyricsFile(expectedUri) {
    if (!page._isComponentMounted) return;
    const track = captureLocalTrack();
    if (!canStartTrackAction(track.uri, expectedUri)) return;
    const operation = imports.begin(track.uri);
    const input = createFileInput();
    input.type = "file";
    input.accept = ".lrc,.txt,text/plain";
    const detach = () => {
      operation.signal.removeEventListener('abort', detach);
      input.onchange = input.oncancel = null;
    };
    input.onchange = (event) => {
      detach();
      if (operation.isCurrent()) processLyricsFromFile(event, track, operation);
    };
    input.oncancel = () => {
      detach();
      operation.finish();
    };
    operation.signal.addEventListener('abort', detach, { once: true });
    input.click();
  }

  async function applyLocalLyricsFromLrclibCandidate(candidate, options = {}) {
    if (options.signal?.aborted) return false;
    const rawLyrics = String(
      candidate?.syncedLyrics ||
      candidate?.plainLyrics ||
      candidate?.previewText ||
      (candidate?.instrumental ? "[00:00.00]♪" : "")
    )
      .replace(/\[(\d+:\d+),(\d+)\]/g, "[$1.$2]")
      .replace(/<(\d+:\d+),(\d+)>/g, "<$1.$2>")
      .trim();

    if (!rawLyrics) {
      throw new Error(page.getText("menu.localLyricsNoCandidateLyrics", "No lyrics available in this result"));
    }

    const track = options.track || captureLocalTrack();
    const localLyrics = parseLocalLyrics(rawLyrics, track.duration);
    const applied = await applyLocalLyrics(localLyrics, {
      sourceLabel: options?.source || "lrclib",
      successMessage: page.getText("notifications.lyricsLoadedFromLrclib", "LRCLIB에서 가사를 가져왔습니다."),
      track,
      signal: options.signal,
    });

    if (!applied) {
      if (options.signal?.aborted) return false;
      throw new Error(page.getText("notifications.lyricsLoadFailed", "Failed to load lyrics"));
    }
  }

  function processLyricsFromFile(event, track = captureLocalTrack(), reservedImport) {
    if (!page._isComponentMounted || (reservedImport && !reservedImport.isCurrent())) return;
    const file = event.target.files?.[0];
    if (!file || !track.uri) {
      reservedImport?.finish();
      return;
    }

    if (file.size > 1024 * 1024) {
      reservedImport?.finish();
      toast.error(translate("notifications.fileTooLarge"));
      return;
    }

    const operation = reservedImport || imports.begin(track.uri);
    const reader = createFileReader();
    const detach = () => {
      operation.signal.removeEventListener('abort', stopReading);
      reader.onload = reader.onerror = reader.onabort = null;
    };
    const stopReading = () => {
      detach();
      if (reader.readyState === 1) reader.abort();
    };
    operation.signal.addEventListener('abort', stopReading, { once: true });
    reader.onload = async (e) => {
      detach();
      try {
        if (!operation.isCurrent()) return;
        const localLyrics = parseLocalLyrics(e.target.result, track.duration);
        await applyLocalLyrics(localLyrics, { sourceLabel: "file", track }, operation);
      } catch {
        if (!operation.signal.aborted) toast.error(translate("notifications.lyricsLoadFailed"));
      } finally {
        operation.finish();
      }
    };

    reader.onerror = () => {
      detach();
      if (operation.isCurrent()) toast.error(translate("notifications.fileReadFailed"));
      operation.finish();
    };
    reader.onabort = () => {
      detach();
      operation.finish();
    };

    try {
      reader.readAsText(file);
    } catch {
      reader.onerror?.();
    }
    event.target.value = "";
  }

  return {
    getLocalLyricsStore: store.readAll, getSavedLocalLyrics: store.get,
    getCurrentLyricsTrackUri, lyricsSaved, saveLocalLyrics, deleteLocalLyrics, hasLocalLyricsForCurrentTrack,
    removeLocalLyricsForCurrentTrack, getParsedLocalLyricsTypes, applyLocalLyrics,
    importLocalLyricsFile, applyLocalLyricsFromLrclibCandidate, processLyricsFromFile,
    cancelPendingLocalLyricsImports: imports.dispose,
  };
}
