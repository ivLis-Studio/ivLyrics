export function getLyricsFullscreenClasses({
  state, visual, isTwoColumn, isLayoutReversed, shouldUseFullscreenNoLyricsLayout,
  isPortraitViewport, isFullscreenPageUi, isFocusedFullscreenPresentation, fullscreenPresentation, fullscreenContainer,
}) {
  let fullscreenClasses = "";
  if (state.isFullscreen) {
    fullscreenClasses = " fullscreen-active";
    if (!isTwoColumn) {
      fullscreenClasses += " fullscreen-single-column";
    }
    if (isLayoutReversed && isTwoColumn) {
      fullscreenClasses += " layout-reversed";
    }
    if (shouldUseFullscreenNoLyricsLayout) {
      fullscreenClasses += " fullscreen-no-lyrics";
    }
    if (state.isLoading && state.lyricsStatus === "loading") {
      fullscreenClasses += " fullscreen-lyrics-loading";
    }
    if (isPortraitViewport && visual["fullscreen-tv-mode"] !== true) {
      fullscreenClasses += " portrait-mode";
    }
    if (visual["fullscreen-tv-mode"] === true) {
      fullscreenClasses += " tv-mode-active";
    }
    if (state.showMarketplace) {
      fullscreenClasses += " marketplace-active";
    }
    if (isFullscreenPageUi) {
      fullscreenClasses += " fullscreen-page-ui";
    }
    if (isFocusedFullscreenPresentation) {
      fullscreenClasses += ` fullscreen-focus-active focus-presentation-${fullscreenPresentation}`;
    }
    if (fullscreenContainer) {
      const tmiScale = (visual["fullscreen-tmi-font-size"] || 100) / 100;
      fullscreenContainer.style.setProperty("--fullscreen-tmi-font-size", tmiScale);
    }
  }
  return fullscreenClasses;
}

export function renderLyricsFullscreenOverlay({
  react, FullscreenOverlay, state, isSyncCreatorActive, shouldHideFullscreenLyrics, suppressStaleLyricsPage,
  renderedCurrentLyrics, karaokeRenderGranularity, getPlainLyricsLineText, lyricsSettingsRevision, vinylTrackAccent,
  fullscreenPresentation, handleFocusedLyricsChange, setFullscreenPresentation, toggleFullscreen,
}) {
  return state.isFullscreen && !state.showMarketplace && !isSyncCreatorActive && FullscreenOverlay && react.createElement(FullscreenOverlay, {
    coverUrl: state.coverUrl,
    title: state.title,
    artist: state.artist,
    isFullscreen: state.isFullscreen,
    currentLyricIndex: shouldHideFullscreenLyrics || suppressStaleLyricsPage ? 0 : state.currentLyricIndex || 0,
    totalLyrics: shouldHideFullscreenLyrics || suppressStaleLyricsPage
      ? 0
      : Array.isArray(state.currentLyrics)
        ? state.currentLyrics.length
        : 0,
    activeLyric: shouldHideFullscreenLyrics || suppressStaleLyricsPage
      ? ""
      : getPlainLyricsLineText(
        Array.isArray(state.currentLyrics)
          ? state.currentLyrics[state.currentLyricIndex || 0]
          : null
      ),
    activeLyrics: shouldHideFullscreenLyrics || suppressStaleLyricsPage || !Array.isArray(state.currentLyrics)
      ? []
      : renderedCurrentLyrics,
    activeLyricsKaraoke: !shouldHideFullscreenLyrics && !suppressStaleLyricsPage && !!karaokeRenderGranularity && !!state.karaoke,
    karaokeRenderGranularity,
    karaokeSource: state.karaokeSource,
    lyricsSettingsRevision,
    translatedMetadata: state.translatedMetadata,
    trackUri: state.uri,
    trackAccent: vinylTrackAccent,
    trackAccentUri: state.colorsUri || "",
    presentationMode: fullscreenPresentation,
    onFocusedLyricsChange: handleFocusedLyricsChange,
    onPresentationModeChange: setFullscreenPresentation,
    onExitFullscreen: toggleFullscreen
  });
}

export function renderLyricsStaticBackground({
  react, shouldRenderStaticBackground, isSyncCreatorActive, effectiveBackgroundMode, motionUsesTrackBackground, backgroundStyle,
}) {
  return shouldRenderStaticBackground && react.createElement("div", {
    id: "ivLyrics-gradient-background",
    className: [
      !isSyncCreatorActive && effectiveBackgroundMode === "blur-gradient-background" ? "color-gradient-bg" : "",
      // Motion lyrics turn and zoom this layer with their camera, as they do the video.
      motionUsesTrackBackground ? "ivlyrics-video-background-camera" : "",
    ].filter(Boolean).join(" "),
    style: backgroundStyle,
  },
    !isSyncCreatorActive && effectiveBackgroundMode === "blur-gradient-background" && [
      react.createElement("div", { key: "blob1", className: "gradient-blob blob-1" }),
      react.createElement("div", { key: "blob2", className: "gradient-blob blob-2" }),
      react.createElement("div", { key: "blob3", className: "gradient-blob blob-3" }),
      react.createElement("div", { key: "blob4", className: "gradient-blob blob-4" }),
      react.createElement("div", { key: "blob5", className: "gradient-blob blob-5" }),
      react.createElement("div", { key: "blob6", className: "gradient-blob blob-6" }),
    ]
  );
}

export function resolveLyricsVideoSource(state, isPlaybackUriCurrent) {
  const awaitingTrack = state.isLoading && !state.lyricsDisplayUri;
  const trackUri = !awaitingTrack && state.uri && isPlaybackUriCurrent(state.uri) ? state.uri : null;
  const hasCurrentLyrics = trackUri && (!state.lyricsDisplayUri || state.lyricsDisplayUri === trackUri);
  const rawTime = hasCurrentLyrics ? state.currentLyrics?.[0]?.startTime : null;
  const startTime = typeof rawTime === "string" && rawTime.trim() ? Number(rawTime) : rawTime;
  return {
    trackUri,
    firstLyricTime: Number.isFinite(startTime) && startTime >= 0 ? startTime : null,
    externalVideoInfo: trackUri ? state.videoInfo ?? null : null,
  };
}

export function renderLyricsVideoBackground({
  react, VideoBackground, state, source, visual, shouldUseVideoBackground, isVideoStagePresentation,
  computeLyricsBackgroundStyle, readPrefetchedVideo, onLoadingChange,
}) {
  return shouldUseVideoBackground && VideoBackground && react.createElement(VideoBackground, {
    ...source,
    brightness: isVideoStagePresentation
      ? 100
      : visual["background-brightness"],
    blurAmount: isVideoStagePresentation
      ? 0
      : visual["video-blur"],
    coverMode: visual["video-cover"],
    videoScale: visual["video-scale"],
    fallbackBackground: visual["video-fallback-background"],
    fallbackSolidColor: visual["solid-background-color"],
    fallbackGradientStyle: visual["video-fallback-background"] === "blur-gradient"
      ? computeLyricsBackgroundStyle({
        isSyncCreatorActive: false, isFADMode: false,
        effectiveBackgroundMode: "blur-gradient-background",
        dynamicColors: state.dynamicColors, colors: state.colors,
      })
      : null,
    readPrefetchedVideo,
    onLoadingChange,
  });
}

export function renderLyricsStudyPanel({
  react, StudyPanel, state, shouldHideFullscreenLyrics,
}) {
  return !state.showMarketplace && !shouldHideFullscreenLyrics && StudyPanel &&
    react.createElement(StudyPanel, {
      trackUri: state.uri,
      title: state.title,
      artist: state.artist,
      provider: state.provider,
      lyrics: state.currentLyrics || [],
      activeLineIndex: state.currentLyricIndex || 0,
    });
}
