import { emptyLyricsState } from "./pageLyricsLoadState.mjs";
import { emptyPageTranslationFields } from "./pageLyricsTranslationState.mjs";
import { createPageLyricsLoadPresentation } from "./pageLyricsLoadPresentation.mjs";
import {
  getLyricDisplayModes, getLyricLanguageMode, hasStyleDependentLyricTranslation,
  matchesLyricPlaybackPreferences, matchesLyricTranslationStyle, readLyricPlaybackPreferences, resolveLyricSourceLanguage,
} from "./lyricPresentationIdentity.mjs";

function readProvisionalDisplay(snapshot, settings) {
  if (snapshot?.rawResult || !Array.isArray(snapshot?.displayLyrics)) return null;
  const visual = settings.getVisualSettings();
  const trackLanguageOverride = snapshot.trackInfo?.languageOverride;
  const playbackPreferences = readLyricPlaybackPreferences(key => visual[key], trackLanguageOverride);
  if (!matchesLyricPlaybackPreferences(snapshot.playbackPreferences, playbackPreferences)) return null;
  const language = resolveLyricSourceLanguage(trackLanguageOverride, playbackPreferences.configuredSourceLanguage,
    () => snapshot.detectedLanguage);
  const [mode1, mode2] = getLyricDisplayModes(visual, getLyricLanguageMode(language));
  const matches = (value, configured) => value == null || value === configured;
  if (!matches(snapshot.detectedLanguage, language)
    || !matches(snapshot.displayMode1, mode1 || "none") || !matches(snapshot.displayMode2, mode2 || "none")
    || !matches(snapshot.translationTargetLanguage, settings.getTargetLanguage())
    || !matches(snapshot.pronunciationNotation, settings.getPronunciationNotation())
    || (hasStyleDependentLyricTranslation(snapshot) && !matchesLyricTranslationStyle(snapshot, settings.getTranslationStyle?.()))) return null;
  return snapshot.displayLyrics;
}

export function createPageLyricsLoad({
  extractTrackId, getLyricsService,
  readStoredTrackLanguage, readTrackProviderOverride, readStoredTrackBackground,
  syncedMode, ...presentationSettings
}) {
  const preparePresentation = createPageLyricsLoadPresentation(presentationSettings);

  return async function fetchLyricsForTrack(page, track, mode = -1, refresh = false) {
    if (!page._isComponentMounted || (track?.uri && !page.isPlaybackUriCurrent(track.uri))) return;
    let isCurrent = () => page._isComponentMounted;
    let dataRequest = null;
    let loadingToken = null;
    let completed = false;

    function updateCurrent(patch, isSourceCurrent = () => true) {
      page.setState(() => isCurrent() && isSourceCurrent() ? patch : null);
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
        && !dataRequest.signal.aborted
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
      const provisional = readProvisionalDisplay(sharedSnapshot, presentationSettings);
      updateCurrent({ ...page.getLoadingLyricsState(info, requestSeq), ...(provisional && { currentLyrics: provisional }) });

      const languageRevision = page._trackLanguagePreferenceRevision;
      const backgroundRevision = page._trackBackgroundPreferenceRevision;
      const readProviderRevision = () => getLyricsService()?.getLyricsRequestRevision?.(uri);
      let providerRevision = readProviderRevision();
      const readProviderOverride = () => readTrackProviderOverride(uri, { signal: dataRequest.signal });
      let trackLanguageOverride, trackLyricsProviderOverride, backgroundOverride;
      try {
        [trackLanguageOverride, trackLyricsProviderOverride, backgroundOverride] = await Promise.all([
          readStoredTrackLanguage(uri), readProviderOverride(), readStoredTrackBackground(uri),
        ]);
      } catch (error) {
        console.warn("[ivLyrics] Failed to load track overrides:", error);
        trackLanguageOverride = trackLyricsProviderOverride = backgroundOverride = null;
      }
      if (!isCurrent()) return;

      if (languageRevision === page._trackLanguagePreferenceRevision) {
        page.trackLanguageOverride = trackLanguageOverride;
      }
      if (backgroundRevision === page._trackBackgroundPreferenceRevision) {
        page.trackBackgroundOverride = backgroundOverride;
      }
      updateCurrent({ trackBackgroundOverride: page.trackBackgroundOverride });
      page.fetchMetadataTranslation(uri, info.title, info.artist);

      let trackPrepared = false;
      const readOptions = {
        info, mode, hasSpotifyTrackId,
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
      let refreshSource = refresh;
      let sourceSnapshot = sharedSnapshot;
      let waitedForLanguageModel = false;
      while (isCurrent()) {
        const revision = readProviderRevision();
        const isSourceCurrent = () => readProviderRevision() === revision;
        if (revision !== providerRevision) {
          providerRevision = revision;
          sourceSnapshot = null;
          trackLyricsProviderOverride = await readProviderOverride();
          if (!isCurrent()) return;
          if (!isSourceCurrent()) continue;
        }

        page.trackLyricsProviderOverride = trackLyricsProviderOverride;
        updateCurrent({ trackLyricsProviderOverride }, isSourceCurrent);

        try {
          const resolved = await dataRequest.read({
            ...readOptions, refresh: refreshSource, sharedSnapshot: sourceSnapshot,
            providerOverride: trackLyricsProviderOverride, isSourceCurrent,
          });
          refreshSource = false;
          if (!isCurrent()) return;
          if (!isSourceCurrent()) continue;
          if (!resolved) return;

          const prepare = () => preparePresentation(page, {
            info, mode, refresh, requestSeq, trackLyricsProviderOverride, trackLanguageOverride: page.trackLanguageOverride,
            sharedSnapshot: sourceSnapshot, resolved, latestSnapshot: getLyricsService()?.getLyricsSnapshot?.(uri),
          });
          // A matching warm display already has its language and presentation settings.
          let presentation = resolved.reusesSharedSnapshot ? prepare() : null;
          if (!presentation?.reusedDisplay && !waitedForLanguageModel) {
            const service = getLyricsService();
            waitedForLanguageModel = true;
            if (typeof service?.whenLanguageModelReady === "function") await service.whenLanguageModelReady(1200);
            presentation = null;
          }
          if (!isCurrent()) return;
          if (!isSourceCurrent()) continue;
          const { rawResult, languagePatch, patch, hasLyrics } = presentation ?? prepare();

          getLyricsService()?.publishLyricsSnapshot?.({
            trackUri: uri,
            trackInfo: info,
            rawResult,
            provider: rawResult.provider || null,
            karaokeSource: rawResult.karaokeSource || null,
            trackLyricsProviderOverride,
            source: "ivlyrics-page-base",
          });
          if (!isCurrent()) return;
          if (!isSourceCurrent()) continue;
          updateCurrent({
            ...rawResult,
            ...languagePatch,
            ...page.applyTranslationStates(rawResult),
            ...patch,
            trackBackgroundOverride: page.trackBackgroundOverride,
            lyricsTransitionSeq: transitionSeq,
          }, isSourceCurrent);
          completed = hasLyrics;
          return;
        } catch (error) {
          if (isSourceCurrent()) throw error;
        }
      }
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
