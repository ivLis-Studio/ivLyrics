import { readLearningMode } from "#ivlyrics/features/learning/learningModeRuntime.mjs";
import { readPronunciationFirst } from "#ivlyrics/lyrics/pronunciationRuntime.mjs";
import { writeFirstLyricTime } from "../features/video/videoSyncRuntimeState.mjs";
import { isFocusedLyricsPresentation, normalizeFullscreenPresentation } from "../features/fullscreen/fullscreenPresentation.mjs";
import { getRuntimeService } from "../spicetify/runtimeServices.mjs";
import { SYNCED, getKaraokeRenderGranularity, isKaraokeRenderMode, resolveModeSpecificLyrics } from "./lyricsRenderModes.mjs";
import { resolveFadLyricsContainer, getLyricsPageRenderStyles, resolveLyricsPageRenderMode } from "./lyricsPageRenderState.mjs";
import { commitLyricsPagePresentation } from "./commitLyricsPagePresentation.mjs";
import { getPlainLyricsLineText } from "./lyricDisplayText.mjs";
import {
  renderLyricsCacheEditor, renderLyricsBehindSyncCreator, renderLyricsPageRows,
} from "./lyricsPageContent.mjs";
import { renderLyricsGenerationStatus } from "./lyricsPageGenerationStatus.mjs";
import { renderLyricsPageQuickSync } from "./lyricsPageQuickSyncView.mjs";
import { renderLyricsPageToolbar } from "./lyricsPageToolbarView.mjs";
import {
  getLyricsFullscreenClasses, renderLyricsFullscreenOverlay, renderLyricsStaticBackground,
  renderLyricsVideoBackground, renderLyricsStudyPanel,
} from "./lyricsPageFullscreenView.mjs";

function LyricsPagePresentationCommit({ react, host, page, presentation, needsPronunciationTiming }) {
  const useLayoutEffect = react.useLayoutEffect || react.useEffect;
  useLayoutEffect(() => {
    const { lyricsState } = presentation;
    if (lyricsState !== page.state) return;
    const lyrics = lyricsState.currentLyrics;
    writeFirstLyricTime(host, lyrics && lyrics.length > 0 ? lyrics[0].startTime : null);
    if (needsPronunciationTiming) page.pronunciationPresentation.scheduleTiming(lyricsState);
    else page.pronunciationPresentation.stopTiming();
    commitLyricsPagePresentation(page, presentation);
  });
  return null;
}

export function renderLyricsPage(page, {
  host, document, react, visual, translate, ensureReactDOM, extractTrackId,
  computeBaseLyricsStyleVariables, computeLyricsBackgroundStyle,
  getDisplayModeGenerationOptions, getCurrentLyricsPronunciationNotation, getSyncDataRendererCacheVersion,
  LyricsCacheEditModal, LyricsPageRenderer, MarketplacePage, UpdateBanner, TrackSyncAdjustPill, Toolbar, modeKeys,
  FullscreenOverlay, VideoBackground, readPrefetchedVideo, getIvLyricsTrackBackgroundMode,
}) {
  // Enhanced FAD container detection - try multiple selectors if main one fails
  const fadLyricsContainer = resolveFadLyricsContainer(document, page._domCache);
  const isFADMode = !!fadLyricsContainer;
  const isSyncCreatorOverlayPresent =
    typeof document !== "undefined" &&
    !!document.getElementById("ivLyrics-sync-creator-overlay");
  const isSyncCreatorActive =
    page.state.isSyncCreatorActive === true && isSyncCreatorOverlayPresent;
  const effectiveBackgroundMode = page.getEffectiveBackgroundMode(page.state.trackBackgroundOverride);
  const { styleVariables, backgroundStyle, vinylTrackAccent } = getLyricsPageRenderStyles({
    visual, state: page.state, isSyncCreatorActive, isFADMode, effectiveBackgroundMode,
    computeBaseLyricsStyleVariables, computeLyricsBackgroundStyle,
    shouldReduceMotion: () => page.shouldReduceMotion(),
  });

  const {
    mode, syncCreatorPlainLyrics, defaultCommunityVideoStartTime, originalLanguage, friendlyLanguage,
    displayMode1, displayMode2, showTranslationButton, canRegenerateTranslation,
    presentation,
  } = resolveLyricsPageRenderMode(page, {
    visual, isSyncCreatorActive, getDisplayModeGenerationOptions,
    getCurrentLyricsPronunciationNotation, getSyncDataRendererCacheVersion,
  });
  const cacheEditModal = renderLyricsCacheEditor({ react, page, LyricsCacheEditModal });

  const { lyrics: renderedCurrentLyrics, needsTiming: needsPronunciationTiming } = page.pronunciationPresentation.render({
    lyricsState: presentation.lyricsState,
    mode, displayMode1, displayMode2, syncCreatorLyrics: syncCreatorPlainLyrics,
  });
  const renderedUnsyncedLyrics = syncCreatorPlainLyrics.length > 0
    ? syncCreatorPlainLyrics
    : page.state.unsynced;
  const { syncCreatorPlainPage, lineCounterOverlay } = renderLyricsBehindSyncCreator({
    react, page, translate, isSyncCreatorActive, syncCreatorPlainLyrics,
  });
  const fullscreenPresentation = page.state.isFullscreen
    ? normalizeFullscreenPresentation(
      page.state.fullscreenPresentation
    )
    : "standard";
  const isFocusedFullscreenPresentation = isFocusedLyricsPresentation(fullscreenPresentation);
  const activeLyricsPage = syncCreatorPlainPage || renderLyricsPageRows({
    react, page, LyricsPageRenderer, MarketplacePage, isFocusedFullscreenPresentation, mode, isSyncCreatorActive,
    renderedCurrentLyrics, renderedUnsyncedLyrics,
  });
  // Reject an inconsistent display identity even after a failed request.
  const suppressStaleLyricsPage = !!page.state.lyricsDisplayUri &&
    page.state.lyricsDisplayUri !== page.state.uri;

  // Tab bar removed - modes are now auto-detected
  const topBarContent = null;

  const hasLyrics = [page.state.karaoke, page.state.synced, page.state.unsynced]
    .some((lyrics) => Array.isArray(lyrics) && lyrics.length > 0);
  const hasLyricsLayout = page.getLyricsLayoutHasLyrics();
  const isTwoColumn = visual["fullscreen-two-column"] !== false;
  const isLayoutReversed = visual["fullscreen-layout-reverse"] === true;
  const centerWhenNoLyrics = visual["fullscreen-center-when-no-lyrics"] !== false;
  const shouldHideFullscreenLyrics =
    page.state.isFullscreen &&
    page.state.fullscreenLyricsHidden &&
    hasLyricsLayout &&
    !page.state.showMarketplace &&
    !isSyncCreatorActive;
  const shouldUseFullscreenNoLyricsLayout =
    shouldHideFullscreenLyrics ||
    (!hasLyricsLayout && centerWhenNoLyrics);
  const shouldReduceMotion = page.shouldReduceMotion();
  const isFullscreenMarketplace = page.state.isFullscreen && page.state.showMarketplace;
  const isFullscreenPageUi = page.state.isFullscreen && page.fullscreenUsesPageUi === true;
  const currentTrackInfo = page.getCurrentPlayerTrackInfo();
  const renderTrackUri = currentTrackInfo?.uri || page.currentTrackUri || page.state.uri || "";
  const isLocalTrack = !!renderTrackUri && !extractTrackId(renderTrackUri);
  // Motion lyrics fly over the same unblurred video as the video stage, unless
  // the user chose the track background for them (no video found, YouTube
  // blocked or age-restricted, or simply the cover they prefer).
  const motionUsesTrackBackground = fullscreenPresentation === "motion"
    && visual["fullscreen-motion-background"] === "track";
  const isVideoStagePresentation =
    fullscreenPresentation === "video" || (fullscreenPresentation === "motion" && !motionUsesTrackBackground);
  const shouldUseVideoBackground =
    !isSyncCreatorActive &&
    !isFADMode &&
    (
      effectiveBackgroundMode === "video-background" ||
      isVideoStagePresentation
    );
  const shouldRenderStaticBackground = !shouldUseVideoBackground;

  const fullscreenClasses = getLyricsFullscreenClasses({
    state: page.state, visual, isTwoColumn, isLayoutReversed, shouldUseFullscreenNoLyricsLayout,
    isPortraitViewport: page._isPortraitViewport, isFullscreenPageUi, isFocusedFullscreenPresentation,
    fullscreenPresentation, fullscreenContainer: page.fullscreenContainer,
  });
  const generationStatusStack = renderLyricsGenerationStatus({
    react, translate, generationPills: page.state.generationPills, isSyncCreatorActive, isFullscreenMarketplace,
  });
  const timedLyrics = isKaraokeRenderMode(mode) || mode === SYNCED
    ? resolveModeSpecificLyrics(page.state, mode)
    : null;
  const { canAdjustTrackSync, quickSyncControlsEnabled, quickSyncStack } = renderLyricsPageQuickSync({
    react, TrackSyncAdjustPill,
    state: page.state, visual, hasTrackSyncLyrics: (timedLyrics?.length ?? 0) > 0,
    suppressStaleLyricsPage, shouldHideFullscreenLyrics,
    isSyncCreatorActive, shouldUseVideoBackground, renderTrackUri,
  });

  const out = react.createElement(
    "div",
    {
      className: `lyrics-lyricsContainer-LyricsContainer${visual["fade-blur"] ? " blur-enabled" : ""
        }${Number(visual["lyrics-side-margin"]) > 0 ? " lyrics-side-margin-enabled" : ""
        }${Number(visual["lyrics-backdrop-blur"]) > 0 ? " lyrics-backdrop-blur-enabled" : ""
        }${visual["highlight-mode"] ? " highlight-mode-enabled" : ""}${fadLyricsContainer ? " fad-enabled" : ""}${fullscreenClasses}${shouldReduceMotion ? " motion-reduced" : ""}${page.state.isPlaybackPaused ? " playback-paused" : ""}${isSyncCreatorActive ? " sync-creator-minimal" : ""
        // The idle timer sets these on the element; a render that rewrites the
        // class list (a new song, a pause) keeps them instead of waking the controls.
        }${page.isMouseActive === false ? " controls-hidden ui-hidden" : ""}`,
      style: styleVariables,
      // Spotify's OverlayScrollbars wrapper skips mutations inside elements
      // marked scroll-size contained. Without it, every lyric DOM change
      // (glyph states, live karaoke paint, line motion) made the main view
      // re-measure its scroll size in a microtask, forcing a synchronous
      // style and layout pass. This page is absolutely positioned with
      // hidden overflow and layout containment, so its content can never
      // change the main view's scroll size.
      "data-scroll-size-contained": "",
      ref: page.setLyricsContainerElement,
    },
    react.createElement(LyricsPagePresentationCommit, {
      react, host, page, presentation, needsPronunciationTiming,
    }),
    // Left panel for fullscreen mode
    renderLyricsFullscreenOverlay({
      react, FullscreenOverlay, state: page.state,
      isSyncCreatorActive, shouldHideFullscreenLyrics, suppressStaleLyricsPage, renderedCurrentLyrics,
      karaokeRenderGranularity: getKaraokeRenderGranularity(mode), getPlainLyricsLineText, lyricsSettingsRevision: page.reRenderLyricsPage,
      vinylTrackAccent, fullscreenPresentation, handleFocusedLyricsChange: page.handleFocusedLyricsChange,
      setFullscreenPresentation: next => page.setFullscreenPresentation(next), toggleFullscreen: page.toggleFullscreen,
    }),
    // Tab bar for mode switching
    topBarContent,
    // Update notification banner
    !isSyncCreatorActive && !page.state.isFullscreen && react.createElement(UpdateBanner),
    renderLyricsStaticBackground({
      react, shouldRenderStaticBackground, isSyncCreatorActive, effectiveBackgroundMode, motionUsesTrackBackground, backgroundStyle,
    }),
    renderLyricsVideoBackground({
      react, VideoBackground, state: page.state, visual,
      shouldUseVideoBackground, isVideoStagePresentation, computeLyricsBackgroundStyle,
      readPrefetchedVideo, onLoadingChange: page.handleVideoBackgroundLoadingChange,
    }),
    shouldRenderStaticBackground && react.createElement("div", {
      className: "lyrics-lyricsContainer-LyricsBackground",
    }),
    generationStatusStack,
    quickSyncStack,
    // ===== 플로팅 바 (일반 모드: 전체 표시, 전체화면: 메뉴 토글 방식) =====
    renderLyricsPageToolbar({
      react, Toolbar, state: page.state, visual,
      actions: page.floatingToolbarActions, modeKeys, mode, lastModeBeforeLoading: page.lastModeBeforeLoading,
      isModeAvailable: value => page.isModeAvailable(value), isFullscreenMarketplace, isSyncCreatorActive,
      getContentTopOffset: () => page.getFloatingMenuContentTopOffset(),
      canToggleFullscreen: () => !document.getElementById("fad-ivLyrics-container"),
      pronunciation: {
        pronunciationFirstApi: readPronunciationFirst(host), displayMode1, displayMode2,
        friendlyLanguage, originalLanguage, showTranslationButton, canRegenerateTranslation,
        regenerationRequests: page._regenerationRequests,
        wordSupplementsLoading: page.generationStatus.hasRequests("word-supplements"),
      },
      track: { currentTrackUri: page.currentTrackUri, renderTrackUri, currentTrackInfo, isLocalTrack, hasLyrics },
      sync: { canAdjustTrackSync, quickSyncControlsEnabled },
      video: { effectiveBackgroundMode, shouldUseVideoBackground, defaultCommunityVideoStartTime, getIvLyricsTrackBackgroundMode },
    }),
    cacheEditModal,
    !shouldHideFullscreenLyrics && !suppressStaleLyricsPage && activeLyricsPage,
    lineCounterOverlay,
    renderLyricsStudyPanel({
      react, StudyPanel: readLearningMode(host)?.StudyPanel, state: page.state, shouldHideFullscreenLyrics,
    })
  );

  const dom = ensureReactDOM();
  if (
    page.state.isFullscreen &&
    !isFullscreenPageUi &&
    dom?.createPortal &&
    page.fullscreenContainer
  ) {
    return dom.createPortal(out, page.fullscreenContainer);
  }
  if (fadLyricsContainer && dom?.createPortal) {
    return dom.createPortal(out, fadLyricsContainer);
  }
  return out;
}
