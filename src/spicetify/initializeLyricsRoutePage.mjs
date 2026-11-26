import { createLocalLyricsStore, LOCAL_LYRICS_UPDATED_EVENT } from "#ivlyrics/lyrics/localLyricsStore.mjs";
import { createPageLocalLyrics } from "#ivlyrics/lyrics/pageLocalLyrics.mjs";
import { parseLocalLyrics } from "#ivlyrics/lyrics/lyricFileFormats.mjs";
import { createPageTrackPreferences } from "#ivlyrics/lyrics/pageTrackPreferences.mjs";
import { createPageTrackPresentation } from "#ivlyrics/lyrics/pageTrackPresentation.mjs";
import { createLyricsGenerationStatusController } from "#ivlyrics/lyrics/lyricsGenerationStatusController.mjs";
import { createPageLyricsGenerationHandlers } from "#ivlyrics/lyrics/pageLyricsGenerationHandlers.mjs";
import { createVideoBackgroundLoadingStatus } from "#ivlyrics/features/video/videoBackgroundLoadingStatus.mjs";
import { selectedVideoStore as pageSelectedVideoStore } from "#ivlyrics/features/video/selectedVideoStore.mjs";
import { createPageVideoSelection } from "#ivlyrics/features/video/pageVideoSelection.mjs";
import { createLyricsCacheEditor } from "#ivlyrics/lyrics/createLyricsCacheEditor.mjs";
import { publishLyricsReady } from "#ivlyrics/lyrics/lyricsReadyPublisher.mjs";
import { reloadPageLyrics } from "#ivlyrics/lyrics/reloadPageLyrics.mjs";
import { createLyricsPageLifecycle } from "#ivlyrics/spicetify/lyricsPageLifecycle.mjs";
import { getMountedLyricsPage } from "#ivlyrics/spicetify/lyricsPageEffects.mjs";
import { createLyricsPageModes } from "#ivlyrics/lyrics/lyricsPageModes.mjs";
import { createLyricsPointerControls } from "#ivlyrics/lyrics/lyricsPointerControls.mjs";
import { createPagePronunciationPresentation } from "#ivlyrics/lyrics/createPagePronunciationPresentation.mjs";
import { createPageLyricsPresenter } from "#ivlyrics/lyrics/pageLyricsPresenter.mjs";
import { createPageLyricsTranslationState } from "#ivlyrics/lyrics/pageLyricsTranslationState.mjs";
import { createPageTraditionalConversion } from "#ivlyrics/lyrics/pageTraditionalConversion.mjs";
import { createLyricsPagePlayback } from "#ivlyrics/spicetify/lyricsPagePlayback.mjs";
import { createPageCulturalAnnotations } from "#ivlyrics/lyrics/createPageCulturalAnnotations.mjs";
import { getPlaybackPositionService } from "#ivlyrics/core/playbackPositionService.mjs";
import { LRUCache } from "#ivlyrics/core/LRUCache.mjs";
import { resolveModeSpecificLyrics } from "#ivlyrics/lyrics/lyricsRenderModes.mjs";
import { createInitialLyricsContainerState, emptyLyricsState as emptyState } from "#ivlyrics/lyrics/pageLyricsLoadState.mjs";
import { getSyncDataRendererCacheVersion } from "#ivlyrics/lyrics/pageLyricsCacheIdentity.mjs";
import { pageLyricsMemoryCache as CACHE, pageTranslationMemoryCache as CacheManager } from "#ivlyrics/lyrics/pageMemoryCache.mjs";
import { normalizeFullscreenPresentation as normalizeIvLyricsFullscreenPresentation } from "#ivlyrics/features/fullscreen/fullscreenPresentation.mjs";
import { createLyricsPageToolbar } from "#ivlyrics/lyrics/lyricsPageToolbar.mjs";
import { readPronunciationSlots, readPronunciationFirst } from "#ivlyrics/lyrics/pronunciationRuntime.mjs";
import { setRouteDetectedLyricLanguage } from "#ivlyrics/lyrics/lyricsTextRuntime.mjs";

// Instantiate controllers once per lyrics page. Shared Spotify and add-on
// services are resolved by the route when a controller needs them.
export function initializeLyricsRoutePage(page, {
  host, document, react, Spicetify, CONFIG, I18n, Utils, Toast, StorageManager,
  TrackLyricsProviderDB, TrackBackgroundDB, getService, nextTrackPrefetch,
  getRememberedLyricsRenderModeLock, rememberLyricsRenderModeLock,
  getRememberedIvLyricsFullscreenPresentation, rememberIvLyricsFullscreenPresentation,
  buildTranslationLineRequests, getLegacyNonSectionLyricsText, getNonSectionLyricsText,
  getTranslationResultCacheHash, getLyricsProcessingShapeSignature, getDisplayModeGenerationOptions,
  getCurrentTranslationTargetLanguage, getCurrentLyricsPronunciationNotation,
  getTranslationStyle,
  openConfig, isSetupNeeded, openSetupWizard, readLanguagePrompt,
  spotifyArtworkColors, pageTrackIdentity, ivLyricsDebug,
}) {
  const timers = {
    scheduleTimer: (callback, delay) => setTimeout(callback, delay),
    cancelTimer: (timer) => clearTimeout(timer),
  };
  const readVisualSettings = () => CONFIG.visual;
  const translate = (key) => I18n.t(key);

  page.handleFocusedLyricsChange = (fullscreenFocusedLyricsActive) => {
    if (page.state.fullscreenFocusedLyricsActive !== fullscreenFocusedLyricsActive) {
      page.setState({ fullscreenFocusedLyricsActive });
    }
  };
  page.state = createInitialLyricsContainerState({
    lockedMode: getRememberedLyricsRenderModeLock(),
    fullscreenPresentation: getRememberedIvLyricsFullscreenPresentation(),
  });
  page.currentTrackUri = "";
  page._lyricsFetchSeq = 0;
  page._activeLyricsFetchSeq = 0;
  page._lyricsPresentationSeq = 0;
  page._lyricsTransitionSeq = 0;
  page.lyricsCacheEditor = createLyricsCacheEditor({
    page, readActivePage: () => getMountedLyricsPage(host),
    resolveModeSpecificLyrics, buildTranslationLineRequests, getLegacyNonSectionLyricsText,
    getTranslationResultCacheHash,
    getTranslationCacheId: (uri) => Utils.getTranslationCacheId(uri),
    readSourceLanguage: (lyrics) => page.provideLanguageCode(lyrics, { publish: false }) || "auto",
    getCache: () => getService("LyricsCache"),
    getLyricsService: () => getService("LyricsService"),
    getTranslator: () => getService("Translator"),
    getPronunciationSlots: () => readPronunciationSlots(host),
    clearMemoryCacheByUri: (uri) => CacheManager.clearByUri(uri),
    translate,
    notifyError: (message) => Toast.error(message),
    notifySuccess: (message) => Toast.success(message),
  });
  page.playback = createLyricsPagePlayback({
    page, emptyState,
    getPlayer: () => Spicetify.Player,
    getPlaybackPosition: () => getPlaybackPositionService(host),
    extractTrackId: (uri) => Utils.extractTrackId(uri),
    getTranslator: () => getService("Translator"),
    now: () => Date.now(),
    ...timers,
  });
  page.lifecycle = createLyricsPageLifecycle({
    page, browser: host, document,
    getPlayer: () => Spicetify.Player,
    getLyricsAddonManager: () => getService("LyricsAddonManager"),
    getAIManager: () => getService("AIAddonManager"),
    prefetch: nextTrackPrefetch,
    translationCache: CacheManager,
    needsSetup: () => isSetupNeeded(),
    showSetup: () => openSetupWizard(),
    checkForUpdates: () => Utils.showUpdateNotificationIfAvailable(),
    createConfigButton: () => new Spicetify.Menu.Item("ivLyrics config", false, openConfig, "lyrics"),
    reloadLyrics: (clearCache, expectedTrackUri) => reloadPageLyrics(page, clearCache, {
      expectedTrackUri,
      readPlayerItem: () => Spicetify.Player.data?.item,
      extractTrackId: (uri) => Utils.extractTrackId(uri),
      memoryCache: CACHE,
      translationCache: CacheManager,
      getService,
      debug: ivLyricsDebug,
    }),
    getVisualSettings: readVisualSettings,
    saveConfig: (key, value) => StorageManager.saveConfig(key, value),
    readRememberedPresentation: getRememberedIvLyricsFullscreenPresentation,
    rememberPresentation: rememberIvLyricsFullscreenPresentation,
    normalizePresentation: normalizeIvLyricsFullscreenPresentation,
  });
  page._cleanupFloatingMenuOutsideClick = null;
  page.fullscreenContainer = null;
  page.fullscreenUsesPageUi = false;
  page.containerRef = react.createRef(null);
  page.lyricPresenter = createPageLyricsPresenter({
    page,
    getVisualSettings: readVisualSettings,
    getLyricsService: () => getService("LyricsService"),
    getLanguagePrompt: readLanguagePrompt,
    getCurrentTranslationTargetLanguage, getCurrentLyricsPronunciationNotation,
    getTranslationStyle,
    getDisplayModeGenerationOptions, getSyncDataRendererCacheVersion,
    getLyricsProcessingShapeSignature, getNonSectionLyricsText,
    translate,
    notifyError: (message) => Toast.error(message),
    debug: ivLyricsDebug,
    ...timers,
    publishReady: (payload, deliveryOptions) => publishLyricsReady(payload, host, deliveryOptions),
  });
  page.traditionalConversion = createPageTraditionalConversion({
    cache: CacheManager,
    getRendererCacheVersion: getSyncDataRendererCacheVersion,
    getTranslator: () => getService("Translator"),
    processTranslatedLyrics: (converted, lyrics) => Utils.processTranslatedLyrics(converted, lyrics),
    startLoading: () => page.startTranslationLoading(),
    finishLoading: (token, options) => page.clearTranslationLoading(token, options),
    translate,
    notifyError: (message) => Toast.error(message),
    notifySuccess: (message) => Toast.success(message),
    notifyInfo: (message) => Toast.show(message),
  });
  Object.assign(page, createPageLyricsTranslationState({
    page, translationCache: CacheManager,
    readLanguageOverride: () => CONFIG.visual["translate:detect-language-override"],
    detectLanguage: (lyrics) => Utils.detectLanguage(lyrics),
    publishDetectedLanguage: (language) => setRouteDetectedLyricLanguage(host, language),
    translate,
    notifySuccess: (message) => Toast.success(message),
  }));
  page.languageOverride = CONFIG.visual["translate:detect-language-override"];
  page.trackLanguageOverride = null;
  page.trackLyricsProviderOverride = null;
  page.trackBackgroundOverride = null;
  page.reRenderLyricsPage = 0;
  page.displayMode = null;

  // Prevent infinite render loops
  page.lastProcessedUri = null;
  page.lastProcessedMode = null;

  const generationTimers = {
    isMounted: () => page._isComponentMounted,
    ...timers,
  };
  page.generationStatus = createLyricsGenerationStatusController({
    ...generationTimers,
    setState: (update) => page.setState(update),
  });
  Object.assign(page, createPageVideoSelection({
    store: pageSelectedVideoStore,
    readTrackUri: () => page.currentTrackUri,
    isTrackCurrent: (uri) => page._isComponentMounted && page.currentTrackUri === uri && page.isPlaybackUriCurrent(uri),
    readVisualSettings,
    resolveHiddenCommunityVideo: (...args) => Utils.resolveHiddenCommunityVideo(...args),
    setVideoInfo: (videoInfo, isCurrent) => page.setState(() => isCurrent() ? { videoInfo } : null),
    debug: ivLyricsDebug,
    logError: (...args) => console.error(...args),
  }));
  Object.assign(page, createPageLyricsGenerationHandlers({
    page,
    readLyricsAddonManager: () => getService("LyricsAddonManager"),
    readPronunciationFirst: () => readPronunciationFirst(host),
    translate,
  }));
  page.videoBackgroundLoading = createVideoBackgroundLoadingStatus({
    ...generationTimers,
    readTrackUri: () => page.currentTrackUri || page.state.uri || "",
    readPhase: () => page.state.generationPills?.["video-background"]?.phase,
    statusPills: page.generationStatus,
  });
  page.pronunciationPresentation = createPagePronunciationPresentation({
    ...generationTimers,
    readApi: () => readPronunciationFirst(host),
    readDisplayMode: () => CONFIG.visual["translate:display-mode"],
    readState: () => page.state,
    isPronunciationPending: () => page.generationStatus.hasRequests("pronunciation"),
    getTargetLanguage: () => page.getTranslationTargetLanguage(),
    getSourceLanguage: (lyrics) => page.provideLanguageCode(lyrics),
    getNotation: getCurrentLyricsPronunciationNotation,
  });
  page._sharedPresentationKeys = new LRUCache();
  page._invalidatedSharedPresentationSnapshots = new WeakSet();
  page.culturalAnnotations = createPageCulturalAnnotations({
    page, getVisualSettings: () => CONFIG.visual, buildTranslationLineRequests,
    getTranslator: () => getService("Translator"),
    playbackUri: () => Spicetify.Player.data?.item?.uri,
    extractTrackId: (uri) => Utils.extractTrackId(uri),
    getLyricsCache: () => getService("LyricsCache"),
    toast: Toast, translate: (key) => I18n.t(key),
  });
  page._isComponentMounted = false;

  // Portrait viewport detection
  page._isPortraitViewport = typeof host !== "undefined" && typeof host.matchMedia === "function"
    ? host.matchMedia("(orientation: portrait)").matches
    : false;

  page.isMouseActive = true;
  page.pointerControls = createLyricsPointerControls({
    isToolbarEngaged: () => page.isFloatingToolbarEngaged(),
    onActivityChange: (active) => { page.isMouseActive = active; },
    onWheel: (event) => page.onFontSizeChange?.(event),
    ...timers,
  });
  page.setLyricsContainerElement = (element) => {
    page.containerRef.current = element;
    page.pointerControls.attach(element);
  };

  const isTrackCurrent = (uri) => page._isComponentMounted
    && page.isCurrentLyricsUri(uri) && page.isPlaybackUriCurrent(uri);
  Object.assign(page, createPageLocalLyrics({
    page,
    store: createLocalLyricsStore({
      readStorage: () => StorageManager,
      onReadError: (error) => console.warn("[ivLyrics] Failed to parse local lyrics store:", error),
    }),
    lyricsCache: CACHE, translationCache: CacheManager, isTrackCurrent,
    readPlayerItem: () => Spicetify.Player?.data?.item,
    readLyricsService: () => getService("LyricsService"),
    readPseudoKaraoke: () => getService("PseudoKaraokeService"),
    readAddonManager: () => getService("LyricsAddonManager"),
    parseLocalLyrics: (text, duration) => parseLocalLyrics(text, () => Number(duration)),
    createFileInput: () => document.createElement("input"),
    createFileReader: () => new host.FileReader(),
    confirmAction: (message) => host.confirm(message),
    onLocalLyricsUpdated: (detail) => host.dispatchEvent(new host.CustomEvent(LOCAL_LYRICS_UPDATED_EVENT, { detail })),
    translate,
    toast: Toast,
  }));
  page.trackPreferences = createPageTrackPreferences({
    page, readPlayerItem: () => Spicetify.Player.data?.item, isTrackCurrent,
    readActivePreferences: () => getMountedLyricsPage(host)?.trackPreferences,
    providerStore: TrackLyricsProviderDB, backgroundStore: TrackBackgroundDB,
    lyricsCache: CACHE, translationCache: CacheManager,
    clearLyricsSnapshot: (uri) => getService("LyricsService")?.clearLyricsSnapshot?.(uri),
    onBackgroundChanged: (detail) => host.dispatchEvent(new host.CustomEvent("ivLyrics:track-background-changed", { detail })),
    translate, toast: Toast,
  });
  page.trackPresentation = createPageTrackPresentation({
    page, spotifyArtworkColors,
    readVisualSettings,
    readCurrentArtwork: () => pageTrackIdentity.getTrackArtwork(Spicetify.Player.data?.item),
    convertIntToRGB: (...args) => Utils.convertIntToRGB(...args),
    extractTrackId: (uri) => Utils.extractTrackId(uri),
    fetchAudioFeatures: (url) => Spicetify.CosmosAsync.get(url),
  });

  page.regenerateTranslation = page.regenerateTranslation.bind(page);
  page.regenerateCulturalAnnotations = page.regenerateCulturalAnnotations.bind(page);
  page.handleRegenerateTranslationRequest = page.handleRegenerateTranslationRequest.bind(page);
  page.selectLyricsProviderForCurrentTrack = page.selectLyricsProviderForCurrentTrack.bind(page);
  page.selectBackgroundForCurrentTrack = page.selectBackgroundForCurrentTrack.bind(page);
  page.toggleFullscreenLyricsHidden = page.toggleFullscreenLyricsHidden.bind(page);
  page.handleLyricsProviderAttempt = page.handleLyricsProviderAttempt.bind(page);
  page.handleWordSyncLoading = page.handleWordSyncLoading.bind(page);
  page.handlePronunciationSyncStatus = page.handlePronunciationSyncStatus.bind(page);
  page.handlePronunciationFirstUpdate = page.handlePronunciationFirstUpdate.bind(page);
  page.handleMotionDirectionStatus = page.handleMotionDirectionStatus.bind(page);
  page.handleVideoBackgroundLoadingChange = page.videoBackgroundLoading.handle;

  page.modes = createLyricsPageModes({
    page,
    readVisualSettings,
    rememberModeLock: rememberLyricsRenderModeLock,
  });
  page.floatingToolbar = createLyricsPageToolbar({
    page, modes: page.modes, document,
    readVisualSettings,
    changeVisualSetting: (name, value) => page.handleFloatingToolbarConfigChange(name, value),
    togglePronunciationFirst: () => readPronunciationFirst(host)?.toggle?.(),
    wakeControls: page.pointerControls.wake,
    ...timers,
    requestFrame: (callback) => typeof host.requestAnimationFrame === "function"
      ? host.requestAnimationFrame(callback)
      : setTimeout(callback, 0),
    translate,
    notify: (message) => Toast.show(message),
  });
  page.floatingToolbarActions = page.floatingToolbar.actions;
}
