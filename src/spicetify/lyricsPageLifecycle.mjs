import { cancelPendingLyricsTimingUpgrade } from "../lyrics/pageLyricsTimingUpgrade.mjs";
import { cancelPendingPageMetadataTranslation } from "../lyrics/createPageMetadataTranslation.mjs";
import { LYRICS_PROVIDER_SELECTION_CHANGED } from "../lyrics/lyricsProviderRequests.mjs";
import { createLyricsFullscreenController } from "../features/fullscreen/lyricsFullscreenController.mjs";
import { schedulePageUpdateCheck } from "../features/updates/pageUpdateCheck.mjs";
import { activateLyricsPage, releaseLyricsPage, LYRICS_PAGE_READY_EVENT } from "./lyricsPageEffects.mjs";
import { publishRuntimeService, releaseRuntimeService } from "./runtimeServices.mjs";
import { attachLyricsPageSettings } from "./lyricsPageSettings.mjs";
import { createRuntimeEffects } from "../core/runtimeEffects.mjs";

export function createLyricsPageLifecycle({
  page, browser, document, getPlayer, getLyricsAddonManager, getAIManager,
  prefetch, translationCache, needsSetup, showSetup, checkForUpdates,
  createConfigButton, reloadLyrics, getVisualSettings, saveConfig,
  readRememberedPresentation, rememberPresentation, normalizePresentation,
}) {
  const scheduleTimer = (callback, delay) => browser.setTimeout(callback, delay);
  const cancelTimer = (timer) => browser.clearTimeout(timer);
  const reportCleanupError = (error) => console.warn("[ivLyrics] Page cleanup failed:", error);
  let activeEffects = null;

  function mount() {
    if (page._isComponentMounted) return;
    const effects = createRuntimeEffects({ scheduleTimer, cancelTimer, onCleanupError: reportCleanupError });
    activeEffects = effects;
    page._isComponentMounted = true;

    try {
      activateLyricsPage(browser, page);
      attachLyricsStatus(effects);

      const queuedTrack = prefetch.createSession(() => page.getCurrentMode());
      effects.add(queuedTrack.dispose);
      effects.add(page.playback.bindTrackChanges?.(queuedTrack.updatePlayingTrack));
      page._domCache = { viewport: null, fadContainer: null, fileInput: null };
      if (needsSetup()) effects.schedule(showSetup, 500);
      schedulePageUpdateCheck(browser, checkForUpdates);
      translationCache.init();

      attachPlayback(effects, queuedTrack);
      attachPageControls(effects);
      attachDisplayEvents(effects);
      browser.dispatchEvent(new browser.CustomEvent(LYRICS_PAGE_READY_EVENT, { detail: page }));
    } catch (error) {
      unmount();
      throw error;
    }
  }

  function attachLyricsStatus(effects) {
    const addonManager = getLyricsAddonManager();
    effects.subscribe((handler) => addonManager?.on?.("lyrics:search:progress", handler), page.handleLyricsProviderAttempt);
    effects.subscribe((handler) => addonManager?.on?.("lyrics:word-sync:status", handler), page.handleWordSyncLoading);
    page.restoreWordSyncLoading();
    effects.listen(browser, "ivLyrics:pronunciation-sync:status", page.handlePronunciationSyncStatus);
    effects.listen(browser, "ivLyrics:pronunciation-first-updated", page.handlePronunciationFirstUpdate);
    effects.listen(browser, "ivLyrics:motion-direction:status", page.handleMotionDirectionStatus);
    page.restorePronunciationSyncLoading();

    const handleSyncCreatorVisibility = (event) => {
      const active = event?.detail?.active ?? !!document.getElementById("ivLyrics-sync-creator-overlay");
      // Compare against the pending state: a close and reopen in one tick must
      // end active, or the full karaoke page keeps rendering under the editor.
      page.setState((state) => {
        if (state.isSyncCreatorActive === active) return null;
        page.lastProcessedMode = null;
        return { isSyncCreatorActive: active };
      });
    };
    effects.listen(browser, "ivLyrics:sync-creator-visibility", handleSyncCreatorVisibility);
    handleSyncCreatorVisibility();
  }

  function attachPlayback(effects, queuedTrack) {
    const player = getPlayer();
    const updatePlaybackPausedState = () => {
      const isPlaybackPaused = page.getPlaybackPaused();
      page.setState(state => state.isPlaybackPaused === isPlaybackPaused ? null : { isPlaybackPaused });
    };
    updatePlaybackPausedState();
    effects.listen(player, "onplaypause", updatePlaybackPausedState);
    effects.listen(player, "songchange", (event) => {
      updatePlaybackPausedState();
      const item = event?.data?.item;
      page.playback.resolver.schedule(item || null);
    });

    const currentTrack = player?.data?.item;
    if (currentTrack) page.playback.resolver.schedule(currentTrack);

    const queueEvents = player?.origin?._events;
    effects.subscribe((handler) => {
      queueEvents?.addListener?.("queue_update", handler);
      return () => queueEvents?.removeListener?.("queue_update", handler);
    }, (event) => {
      const queue = event?.data;
      if (!queue) return;
      if (queue.current?.uri && queue.current.uri !== page.currentTrackUri) {
        page.playback.resolver.schedule(queue.current);
      }
      const nextTrack = queue.queued?.[0] || queue.nextUp?.[0];
      queuedTrack.schedule(page.infoFromTrack(nextTrack), page.state.explicitMode);
    });
  }

  function attachPageControls(effects) {
    const isCurrentMount = () => activeEffects === effects;
    page.reloadLyrics = (clearCache = true, trackUri) => {
      if (isCurrentMount()) return trackUri ? reloadLyrics(clearCache, trackUri) : reloadLyrics(clearCache);
    };
    publishRuntimeService("reloadLyrics", page.reloadLyrics, browser);
    effects.listen(browser, LYRICS_PROVIDER_SELECTION_CHANGED, () => {
      const item = getPlayer()?.data?.item;
      if (isCurrentMount() && item?.uri) page.fetchLyrics(item, -1);
    });
    effects.listen(browser, "ivLyrics:sync-data-updated", (event) => {
      const trackUri = event.detail?.trackUri;
      if (isCurrentMount() && trackUri) {
        Promise.resolve(reloadLyrics(false, trackUri)).catch((error) => {
          console.warn("[ivLyrics] Failed to refresh the published lyrics:", error);
        });
      }
    });

    page.viewPort = page._domCache.viewport =
      document.querySelector(".Root__main-view .os-viewport") ??
      document.querySelector(".Root__main-view .main-view-container__scroll-node");

    const configButton = createConfigButton();
    effects.add(() => configButton.deregister());
    configButton.register();

    page.fullscreenController = createLyricsFullscreenController({
      document,
      readVisual: getVisualSettings,
      readState: () => page.state,
      writeLayout: ({ portal, usePageFullscreenUi, requestedPresentation, useBrowserFullscreen }) => {
        page.fullscreenContainer = portal;
        page.fullscreenUsesPageUi = usePageFullscreenUi;
        page.fullscreenRequestedPresentation = requestedPresentation;
        page.fullscreenUsesBrowser = useBrowserFullscreen;
      },
      setState: (patch) => page.setState(patch),
      readRememberedPresentation, rememberPresentation, normalizePresentation,
      onClosed: () => browser.dispatchEvent(new browser.CustomEvent("ivLyrics:fullscreen-closed")),
      scheduleTimer, cancelTimer,
      onBrowserFullscreenError: (error) => console.debug("Fullscreen request failed:", error),
    });
    page.setFullscreenPresentation = page.fullscreenController.setPresentation;
    page.exitFullscreenPresentation = page.fullscreenController.exitPresentation;
    page.toggleFullscreen = page.fullscreenController.toggle;
    attachLyricsPageSettings({
      page, browser, effects, isCurrentMount, getVisualSettings, saveConfig, getAIManager,
    });
  }

  function attachDisplayEvents(effects) {
    // Listen for lyric index changes from Pages.js
    const handleLyricIndexChange = (event) => {
      if (event.detail && typeof event.detail.index === 'number') {
        page.setState({ currentLyricIndex: event.detail.index });
      }
    };
    effects.listen(browser, "ivLyrics:lyric-index-changed", handleLyricIndexChange);

    // Word-level supplements (per-word gloss/reading batches) drive their own
    // top-left pill through the shared generation status stack.
    page._wordSupplementsLoadingToken = null;
    const handleWordSupplementsLoading = (event) => {
      const detail = event?.detail || {};
      if (detail.active) {
        if (page._wordSupplementsLoadingToken === null) {
          page._wordSupplementsLoadingToken = page.startWordSupplementsLoading();
        }
        return;
      }
      if (page._wordSupplementsLoadingToken !== null) {
        page.clearWordSupplementsLoading(page._wordSupplementsLoadingToken, {
          completed: detail.completed === true,
        });
        page._wordSupplementsLoadingToken = null;
      }
    };
    effects.listen(browser, "ivLyrics:word-supplements", handleWordSupplementsLoading);

    effects.listenMedia(browser.matchMedia?.("(orientation: portrait)"), (event) => {
      page._isPortraitViewport = event.matches;
      page.forceUpdate();
    });
  }

  function unmount() {
    if (page._isComponentMounted === false) return;
    page._isComponentMounted = false;
    const effects = activeEffects;
    activeEffects = null;
    const releasedTrackUri = page.currentTrackUri;
    page._lyricsPresentationSeq += 1;
    const released = releaseLyricsPage(browser, page);
    if (page.reloadLyrics) releaseRuntimeService("reloadLyrics", page.reloadLyrics, browser);
    effects?.dispose();

    cleanUp(() => page.cancelSavedVideoLookup?.());
    cleanUp(() => page.cancelPendingLocalLyricsImports?.());
    cleanUp(() => page.pageLyricsDataLoader?.cancelPending());
    cleanUp(() => page.trackPresentation?.cancelPending());
    cleanUp(() => page.pronunciationPresentation?.dispose());
    cleanUp(() => cancelPendingLyricsTimingUpgrade(page));
    cleanUp(() => cancelPendingPageMetadataTranslation(page));
    cleanUp(() => page.lyricsCacheEditor.cancelPending());

    cleanUp(() => page.fullscreenController?.dispose());
    page._wordSupplementsLoadingToken = null;
    cleanUp(() => page.playback.deactivate());
    cleanUp(() => page.pointerControls.attach(null));
    cleanUp(() => page._cleanupFloatingMenuOutsideClick?.());
    page._cleanupFloatingMenuOutsideClick = null;
    cleanUp(() => page.clearFloatingMenuCloseTimer());
    cleanUp(() => page.videoBackgroundLoading.dispose());
    cleanUp(() => page.generationStatus.dispose());
    cleanUp(() => page.lyricPresenter?.clear());
    cleanUp(() => page.traditionalConversion?.clear());

    page.viewPort = null;
    page._domCache = null;
    cleanUp(() => page._inflightGemini?.clear());
    page._inflightGemini = null;
    page._dmResults = null;
    if (released && browser.lyricsPerformance) delete browser.lyricsPerformance;
    if (released) {
      // Let the overlay continue pending translation or pronunciation work.
      browser.dispatchEvent(new browser.CustomEvent("ivLyrics:presentation-owner-released", {
        detail: { source: "ivlyrics-page", trackUri: releasedTrackUri },
      }));
    }
  }

  function cleanUp(dispose) {
    try {
      dispose();
    } catch (error) {
      reportCleanupError(error);
    }
  }

  return { mount, unmount };
}
