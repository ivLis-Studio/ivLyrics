import { emptyLyricsState } from "./pageLyricsLoadState.mjs";
import { emptyPageTranslationFields } from "./pageLyricsTranslationState.mjs";
import { createPageLyricsLoadPresentation } from "./pageLyricsLoadPresentation.mjs";
import { matchesLyricTranslationStyle } from "./lyricPresentationIdentity.mjs";

export function createPageLyricsLoad({
  extractTrackId, getLyricsService, getLyricsAddonManager,
  readStoredTrackLanguage, readStoredTrackProvider, readStoredTrackBackground,
  syncedMode, ...presentationSettings
}) {
  const preparePresentation = createPageLyricsLoadPresentation(presentationSettings);

  return async function fetchLyricsForTrack(page, track, mode = -1, refresh = false) {
    if (!page._isComponentMounted || (track?.uri && !page.isPlaybackUriCurrent(track.uri))) return;
    let isCurrent = () => page._isComponentMounted;
    let dataRequest = null;
    let loadingToken = null;
    let completed = false;

    function updateCurrent(patch) {
      page.setState(() => isCurrent() ? patch : null);
    }

    try {
      const info = page.infoFromTrack(track);
      if (!info) {
        page.playback.releaseUnresolvedPlayback("No track info");
        return;
      }

      const uri = info.uri;
      const requestSeq = page.beginLyricsLoadRequest(true);
      const transitionSeq = page._lyricsTransitionSeq;
      const hasSpotifyTrackId = !!extractTrackId(uri);
      page.currentTrackUri = uri;
      page.pageLyricsDataLoader ??= page.createPageLyricsDataLoader();
      dataRequest = page.pageLyricsDataLoader.begin(uri);
      isCurrent = () => page._isComponentMounted
        && page._activeLyricsFetchSeq === requestSeq
        && page.currentTrackUri === uri
        && page.isPlaybackUriCurrent(uri);

      page.clearPendingLyricsUpdates();
      page.lastProcessedUri = null;
      page.lastProcessedMode = null;
      if (refresh) getLyricsService()?.clearLyricsSnapshot?.(uri);
      const sharedSnapshot = refresh ? null : getLyricsService()?.getLyricsSnapshot?.(uri);

      // Display-only snapshots from older integrations can bridge a cold load.
      // A snapshot with raw lyrics must also pass provider and mode validation.
      const provisional = !sharedSnapshot?.rawResult && Array.isArray(sharedSnapshot?.displayLyrics)
        && matchesLyricTranslationStyle(sharedSnapshot, presentationSettings.getTranslationStyle?.())
        ? { currentLyrics: sharedSnapshot.displayLyrics } : null;
      updateCurrent({ ...page.getLoadingLyricsState(info, requestSeq), ...provisional });

      const languageRevision = page._trackLanguagePreferenceRevision;
      const backgroundRevision = page._trackBackgroundPreferenceRevision;
      let trackLanguageOverride, trackLyricsProviderOverride, backgroundOverride;
      try {
        [trackLanguageOverride, trackLyricsProviderOverride, backgroundOverride] = await Promise.all([
          readStoredTrackLanguage(uri), readStoredTrackProvider(uri), readStoredTrackBackground(uri),
        ]);
      } catch (error) {
        console.warn("[ivLyrics] Failed to load track overrides:", error);
        trackLanguageOverride = trackLyricsProviderOverride = backgroundOverride = null;
      }
      if (!isCurrent()) return;

      const manager = getLyricsAddonManager();
      if (!hasSpotifyTrackId || (trackLyricsProviderOverride && manager?.getAddon
        && !manager.getAddon(trackLyricsProviderOverride))) {
        trackLyricsProviderOverride = null;
      }
      if (languageRevision === page._trackLanguagePreferenceRevision) {
        page.trackLanguageOverride = trackLanguageOverride;
      }
      page.trackLyricsProviderOverride = trackLyricsProviderOverride;
      if (backgroundRevision === page._trackBackgroundPreferenceRevision) {
        page.trackBackgroundOverride = backgroundOverride;
      }
      updateCurrent({ trackLyricsProviderOverride, trackBackgroundOverride: page.trackBackgroundOverride });
      page.fetchMetadataTranslation(uri, info.title, info.artist);

      let trackPrepared = false;
      const readOptions = {
        info, mode, refresh, hasSpotifyTrackId, sharedSnapshot, providerOverride: trackLyricsProviderOverride,
        lyricsSaved: (uri) => page.lyricsSaved(uri),
        getSavedLocalLyrics: (uri) => page.getSavedLocalLyrics(uri),
        isCurrent,
        onTrackPrepared() {
          if (trackPrepared) return;
          trackPrepared = true;
          page.fetchColors(uri);
          page.fetchTempo(uri);
          page.resetDelay(uri);
        },
        onProviderLoad() {
          if (loadingToken !== null) return;
          const currentMode = page.getCurrentMode();
          page.lastModeBeforeLoading = currentMode !== -1 ? currentMode : syncedMode;
          loadingToken = page.startLyricsLoading();
          if (provisional) updateCurrent({ currentLyrics: [] });
        },
      };
      const readProviderRevision = () => getLyricsService()?.getLyricsRequestRevision?.(uri);
      let resolved = await dataRequest.read(readOptions);
      if (!resolved || !isCurrent()) return;

      const prepare = () => preparePresentation(page, {
        info, mode, refresh, requestSeq, trackLyricsProviderOverride, trackLanguageOverride: page.trackLanguageOverride,
        sharedSnapshot, resolved, latestSnapshot: getLyricsService()?.getLyricsSnapshot?.(uri),
      });
      // Matching warm presentations already contain the language and display
      // configuration. Cold loads wait briefly for first-use language detection.
      let presentation = resolved.reusesSharedSnapshot ? prepare() : null;
      if (!presentation?.reusedDisplay) {
        const service = getLyricsService();
        if (typeof service?.whenLanguageModelReady === "function") await service.whenLanguageModelReady(1200);
        presentation = null;
      }
      while (isCurrent() && resolved.providerRevision !== readProviderRevision()) {
        resolved = await dataRequest.read({ ...readOptions, refresh: false, sharedSnapshot: null });
        if (!resolved) return;
        presentation = null;
      }
      if (!isCurrent()) return;
      const { rawResult, languagePatch, patch, hasLyrics } = presentation ?? prepare();

      getLyricsService()?.publishLyricsSnapshot?.({
        trackUri: uri,
        trackInfo: info,
        rawResult,
        provider: rawResult.provider || null,
        karaokeSource: rawResult.karaokeSource || null,
        trackLyricsProviderOverride: trackLyricsProviderOverride || null,
        source: "ivlyrics-page-base",
      });
      if (!isCurrent()) return;
      updateCurrent({
        ...rawResult,
        ...languagePatch,
        ...page.applyTranslationStates(rawResult),
        ...patch,
        trackBackgroundOverride: page.trackBackgroundOverride,
        lyricsTransitionSeq: transitionSeq,
      });
      completed = hasLyrics;
    } catch (error) {
      if (!isCurrent()) return;
      updateCurrent({
        ...emptyLyricsState,
        ...emptyPageTranslationFields,
        provider: "",
        contributors: null,
        language: null,
        error: `Failed to fetch lyrics: ${error.message}`,
        isLoading: false,
        lyricsStatus: "empty",
        uri: page.currentTrackUri,
        lyricsRequestSeq: page._activeLyricsFetchSeq,
        lyricsDisplayUri: page.currentTrackUri,
      });
    } finally {
      dataRequest?.close();
      if (loadingToken !== null && page._isComponentMounted) {
        page.clearLyricsLoading(loadingToken, { completed: completed && isCurrent() });
      }
    }
  };
}
