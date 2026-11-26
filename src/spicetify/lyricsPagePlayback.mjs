import { isPlaybackLyricsTargetCurrent } from "../core/playbackPositionService.mjs";
import { createPlaybackTrackResolver } from "./playbackTrackResolver.mjs";

export function createLyricsPagePlayback({
  page, emptyState, getPlayer, getPlaybackPosition, extractTrackId, getTranslator,
  now, scheduleTimer, cancelTimer,
}) {
  let narrationActive = false;
  let onTrackChange = null;

  function bindTrackChanges(listener) {
    onTrackChange = listener;
    return () => { if (onTrackChange === listener) onTrackChange = null; };
  }

  function getPlaybackPaused() {
    const paused = getPlayer()?.data?.isPaused;
    if (typeof paused === "boolean") {
      return paused;
    }
    return !(getPlayer()?.isPlaying?.() ?? false);
  }

  function isPlaybackUriCurrent(uri) {
    const snapshot = getPlaybackPosition()?.getPlayerPlaybackSnapshot?.() || null;
    return isPlaybackLyricsTargetCurrent(snapshot, getPlayer()?.data?.item?.uri, uri);
  }

  const resolver = createPlaybackTrackResolver({
    getPlaybackPosition,
    isMounted: () => page._isComponentMounted,
    getCurrentUri: () => page.currentTrackUri,
    isNarrationActive: () => narrationActive,
    beginTransition: beginPlaybackTrackTransition,
    commitTrack: commitResolvedPlaybackTrack,
    commitNarration: commitDjNarrationTrack,
    recoverTrack: (track) => page.fetchLyrics(track, -1),
    releaseUnresolved: releaseUnresolvedPlayback,
    now, scheduleTimer, cancelTimer,
  });

  function deactivate() {
    resolver.cancel();
    // An instance can mount again with the same track after its work was
    // cancelled. Retire the request and let the resolver load it afresh.
    page.beginLyricsLoadRequest(true);
    page.currentTrackUri = "";
    narrationActive = false;
  }

  function beginPlaybackTrackTransition(candidateTrack = null) {
    const candidateUri = candidateTrack?.uri || "";
    if (candidateUri && candidateUri === page.currentTrackUri) return false;

    page.cancelSavedVideoLookup?.();
    page.clearMotionDirectionLoading?.();
    const transitionSeq = page.beginLyricsLoadRequest(true);
    page.clearPendingLyricsUpdates();
    page.closeLyricsEditModal({ force: true });
    // Only carry layout availability across the handoff. Keeping the arrays
    // here lets mode selection, snapshots and overlays consume the old song.
    const lyricsLoadingHasLyrics = page.getLyricsLayoutHasLyrics();
    page.setState({
      ...emptyState,
      currentLyrics: [],
      lyricsDisplayUri: null,
      lyricsLoadingHasLyrics,
      isLoading: true,
      lyricsStatus: "loading",
      lyricsTransitionSeq: page._lyricsTransitionSeq,
      lyricsRequestSeq: transitionSeq,
    });
    return true;
  }

  function replacePlaybackTarget(uri, isNarration, advanceTransition = false) {
    page.cancelSavedVideoLookup?.();
    page.clearMotionDirectionLoading?.();
    page.closeLyricsEditModal({ force: true });
    const previousTrackId = extractTrackId(page.currentTrackUri);
    if (previousTrackId) getTranslator()?.clearInflightRequests?.(previousTrackId);

    const requestSeq = page.beginLyricsLoadRequest(advanceTransition);
    page.currentTrackUri = uri;
    narrationActive = isNarration;
    page.trackLanguageOverride = null;
    page.trackLyricsProviderOverride = null;
    page.trackBackgroundOverride = null;
    page.clearPendingLyricsUpdates();
    onTrackChange?.(isNarration ? null : uri || null);
    return requestSeq;
  }

  function releaseUnresolvedPlayback(error = "Playback transition unresolved") {
    const requestSeq = replacePlaybackTarget("", false, true);
    page.setState({
      ...page.getLoadingLyricsState(null, requestSeq),
      ...emptyState,
      explicitMode: -1,
      videoInfo: null,
      isLoading: false,
      lyricsStatus: "empty",
      lyricsLoadingHasLyrics: false,
      error,
    });
  }

  function commitDjNarrationTrack(track, snapshot) {
    const uri = snapshot?.uri || track?.uri || "";
    const requestSeq = replacePlaybackTarget(uri, true, true);
    const item = track?.uri === uri ? track : null;
    const info = {
      uri,
      title: item?.metadata?.title || item?.name || "Spotify DJ",
      artist: item?.metadata?.artist_name || "",
      image: item?.metadata?.image_xlarge_url || item?.metadata?.image_url || null,
    };
    page.setState({
      ...page.getLoadingLyricsState(info, requestSeq),
      ...emptyState,
      error: "DJ narration",
      isLoading: false,
      lyricsStatus: "empty",
      lyricsLoadingHasLyrics: false,
      explicitMode: -1,
      videoInfo: null,
    });
  }

  function commitResolvedPlaybackTrack(track, snapshot) {
    const newUri = track?.uri;
    if (!newUri) return;

    if (snapshot?.djNarration === true) {
      commitDjNarrationTrack(track, snapshot);
      return;
    }

    if (page.currentTrackUri === newUri && !narrationActive) {
      getPlaybackPosition()?.clearSafePlayerProgressCorrection?.();
      return;
    }

    const transitionInfo = page.infoFromTrack(track) || { uri: newUri };
    const requestSeq = replacePlaybackTarget(newUri, false, narrationActive);
    page.setState({
      ...page.getLoadingLyricsState(transitionInfo, requestSeq),
      explicitMode: -1,
      videoInfo: null,
    }, () => {
      if (page._isComponentMounted && page.isCurrentLyricsState({ uri: newUri, lyricsRequestSeq: requestSeq })) {
        page.fetchLyrics(track, -1);
      }
    });
    page.viewPort?.scrollTo?.(0, 0);
  }

  return {
    resolver, deactivate, getPlaybackPaused, isPlaybackUriCurrent, beginPlaybackTrackTransition, bindTrackChanges,
    commitResolvedPlaybackTrack, releaseUnresolvedPlayback,
  };
}
