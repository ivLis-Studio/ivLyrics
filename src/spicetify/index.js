import { TinySegmenter } from "#ivlyrics/vendor/TinySegmenter.js";
import { lyricsWordSegmenter } from "#ivlyrics/lyrics/LyricsWordSegmenter.js";
import { initializeRuntimeI18n } from "#ivlyrics/i18n/I18n.js";
import { installPageLyricsPublisher } from "#ivlyrics/lyrics/LyricsPresentationPublisher.js";
import { startWordSupplementService } from "#ivlyrics/lyrics/WordLevelSupplements.js";
import { createPlaylistPicker } from "#ivlyrics/features/player/PlaylistPicker.js";
import { mountLyricsRenderer } from "#ivlyrics/spicetify/lyricsRendererHost.mjs";
import { startPageMotion } from "#ivlyrics/spicetify/composePageMotion.js";
import { createPageUtils } from "#ivlyrics/core/Utils.js";
import { installPageShareImage } from "#ivlyrics/features/share/LyricsShareImage.js";
import { startPageVideo } from "#ivlyrics/spicetify/composePageVideo.js";
import { startPageFullscreen } from "#ivlyrics/spicetify/composePageFullscreen.js";
import { startPageApp } from "#ivlyrics/spicetify/composePageApp.js";
import { installPageSyncCreatorDraftStore } from "#ivlyrics/features/sync/SyncCreatorDraftStore.js";
import { startPageMenus } from "#ivlyrics/spicetify/composePageMenus.js";
import { createPageTranslation } from "#ivlyrics/spicetify/composePageTranslation.mjs";
import initializeSettingsPersistence from "#ivlyrics/core/StoragePersistence.js";
import { readSettingsPersistence, publishSettingsStorage } from "#ivlyrics/core/settingsRuntime.mjs";
import { createSettingsEventChannel, createVisualSettingsActions } from "#ivlyrics/core/visualSettingsActions.mjs";
import { readPronunciationSlots } from "#ivlyrics/lyrics/pronunciationRuntime.mjs";
import { readMarketplaceManager as readAppMarketplaceManager } from "#ivlyrics/features/marketplace/marketplaceRuntime.mjs";
import { VideoMatch } from "#ivlyrics/features/video/VideoMatch.js";
import { renderLyricsPage } from "#ivlyrics/lyrics/lyricsPageView.mjs";
import {
  SYNCED, UNSYNCED, getLyricsDataMode,
  isKaraokeRenderMode, getLyricsModeTypeKey, createLyricsModeLockStore,
} from "#ivlyrics/lyrics/lyricsRenderModes.mjs";
import { createRuntimeTrackIdentity as createPageTrackIdentity } from "#ivlyrics/core/trackIdentity.mjs";
import { regeneratePageTranslation } from "#ivlyrics/lyrics/pageTranslationRegeneration.mjs";
import {
  createPageRegenerationMenu, getPageRegenerationTargets, runPageLyricRegeneration, regeneratePageWordSupplements,
} from "#ivlyrics/lyrics/pageLyricRegeneration.mjs";
import { createSpotifyTrackMetadata } from "#ivlyrics/core/spotifyTrackMetadata.mjs";
import { getSettingsSurfaceTheme as getActiveSettingsSurfaceTheme } from "#ivlyrics/features/settings/settingsSurfaceTheme.mjs";
import { createAppConfig } from "#ivlyrics/spicetify/createAppConfig.mjs";
import { IVLYRICS_BACKGROUND_MODE_IDS, IVLYRICS_BACKGROUND_FLAG_IDS, normalizeIvLyricsTrackBackgroundOverride, resolveGlobalBackgroundMode } from "#ivlyrics/lyrics/backgroundModes.mjs";
import { FULLSCREEN_PRESENTATION_STORAGE_KEY, normalizeFullscreenPresentation as normalizeIvLyricsFullscreenPresentation } from "#ivlyrics/features/fullscreen/fullscreenPresentation.mjs";
import { getSyncDataRendererCacheVersion } from "#ivlyrics/lyrics/pageLyricsCacheIdentity.mjs";
import { pageLyricsMemoryCache as CACHE, pageTranslationMemoryCache as CacheManager } from "#ivlyrics/lyrics/pageMemoryCache.mjs";
import { createSpotifyArtworkColors } from "#ivlyrics/core/spotifyArtworkColors.mjs";
import {
  getWordSupplementPrefetcher as getAppWordSupplementPrefetcher,
  getWordSupplementService as getAppWordSupplementService,
} from "#ivlyrics/lyrics/wordSupplementRuntime.mjs";
import { createLyricsCacheEditModal } from "#ivlyrics/lyrics/LyricsCacheEditModal.mjs";
import { createUpdateBanner } from "#ivlyrics/features/updates/UpdateBanner.mjs";
import {
  installPageUrlCallbacks, loadPageFonts, observeOverlayStartup,
  schedulePageNotice, schedulePageToastCleanup,
} from "#ivlyrics/spicetify/pageStartup.mjs";
import { refreshLyricsPage as refreshPageFromRoute } from "#ivlyrics/spicetify/lyricsPageActions.mjs";
import { FLOATING_TOOLBAR_MODE_KEYS, isLyricsShortcutInputFocused } from "#ivlyrics/lyrics/lyricsPageToolbar.mjs";
import { createPageLyricsDataLoader } from "#ivlyrics/lyrics/pageLyricsDataLoader.mjs";
import { cancelPendingPageMetadataTranslation, createPageMetadataTranslation } from "#ivlyrics/lyrics/createPageMetadataTranslation.mjs";
import { createPageLyricsLoad } from "#ivlyrics/lyrics/createPageLyricsLoad.mjs";
import { createTrackLyricsProviderReader } from "#ivlyrics/lyrics/trackLyricsProviderReader.mjs";
import { buildLyricsLoadingState, hasLyricsLayout } from "#ivlyrics/lyrics/pageLyricsLoadState.mjs";
import { cancelPendingLyricsTimingUpgrade, createPageLyricsTimingUpgrade } from "#ivlyrics/lyrics/pageLyricsTimingUpgrade.mjs";
import { getRuntimeService as getAppService, publishRuntimeService as publishAppService } from "#ivlyrics/spicetify/runtimeServices.mjs";
import { reuseLyricsPresentation } from "#ivlyrics/lyrics/translationPresentation.mjs";
import { createLyricsBackgroundStyles } from "#ivlyrics/lyrics/lyricsBackgroundStyles.mjs";
import { createFuriganaConverter, loadFuriganaDictionary } from "#ivlyrics/lyrics/furigana.mjs";
import { registerLyricFuriganaConverter } from "#ivlyrics/lyrics/lyricsTextRuntime.mjs";

import { getTrackOverrideStores } from "#ivlyrics/core/trackOverrideRuntime.mjs";
import { getTrackSyncOffsetStore } from "#ivlyrics/core/trackSyncOffsetRuntime.mjs";
import { createSettingsStorage } from "#ivlyrics/core/createSettingsStorage.mjs";
import { initializeLyricsRoutePage } from "./initializeLyricsRoutePage.mjs";
import { createLyricsRoutePrefetch } from "./lyricsRoutePrefetch.mjs";
import { createReactMountBoundary, createRouteReactDomResolver } from "./routeReactDom.mjs";
import { createRuntimeDebugLogger, initializeRuntimeDebug } from "./runtimeDebug.mjs";
import { watchFullscreenContainerBodyClass } from "#ivlyrics/features/fullscreen/fullscreenContainerPresence.mjs";
import { captureSyncCreatorTrackInfo } from "#ivlyrics/features/sync/syncCreatorTrack.mjs";

// The startup extension and external add-ons share these legacy APIs.
window.TinySegmenter = TinySegmenter;
window.LyricsWordSegmenter = lyricsWordSegmenter;

const ivLyricsDebug = createRuntimeDebugLogger(window);
const FuriganaConverter = registerLyricFuriganaConverter(window, createFuriganaConverter(window));
loadFuriganaDictionary({
  browser: window,
  document,
  converter: FuriganaConverter,
});

observeOverlayStartup(window, {
  getSender: () => getAppService("OverlaySender", window),
  onWaiting: () => console.warn("[ivLyrics] OverlaySender not found from Extension, waiting..."),
  onAvailable: () => ivLyricsDebug("[ivLyrics] OverlaySender loaded from Extension"),
});

const pageTrackIdentity = createPageTrackIdentity(window);

const react = Spicetify.React;

const UpdateBanner = createUpdateBanner({
  react,
  host: window,
  document,
  readSetting: (key) => readSettingsPersistence(window)?.getItem?.(key) ?? localStorage.getItem(key),
  translate: (key) => I18n.t(key),
  ensureReactDOM: () => ensureReactDOM(),
  dismissUpdate: (version) => Utils.dismissUpdate(version),
});

const LyricsCacheEditModal = createLyricsCacheEditModal({
  react,
  translate: (...args) => I18n.t(...args),
  readPronunciationSlots: () => readPronunciationSlots(window),
  readTheme: getActiveSettingsSurfaceTheme,
});

const {
  getCurrentTranslationTargetLanguage, getCurrentLyricsPronunciationNotation,
  getTranslationStyle,
  buildTranslationLineRequests, composeLyricSupplements, getLyricsProcessingShapeSignature,
  getNonSectionLyricsText, getLegacyNonSectionLyricsText, mapTranslationLinesToLyrics,
  getTranslationResultCacheHash, getCachedTranslationForText,
  isLyricsRenderCacheCurrent, getDisplayModeGenerationOptions, getDisplayModeCacheKey, requestLyricsTranslation,
} = createPageTranslation({
  host: window, memoryCache: CacheManager,
  readVisualSettings: () => CONFIG.visual,
  readLocalSetting: (key) => localStorage.getItem(key),
  readPersistedSetting: (key) => StorageManager.getPersisted(key),
  readAppLanguage: () => I18n.getCurrentLanguage(),
  readSpotifyLocale: () => Spicetify.Locale?.getLocale?.(),
  getTranslationCacheId: (uri) => Utils.getTranslationCacheId(uri),
  translate: (key) => I18n.t(key),
});

const ensureReactDOM = createRouteReactDomResolver(window, Spicetify.ReactDOM);
publishAppService("ivLyricsEnsureReactDOM", ensureReactDOM, window);
const LyricsRouteBoundary = createReactMountBoundary(react);

function reportLyricsRouteError(error) {
  console.error("[ivLyrics] Lyrics page failed:", error);
  Toast.error(I18n.t("messages.error"));
}

// Define a function called "render" to specify app entry point
// This function will be used to mount app to main view.
export function render() {
  return react.createElement(
    LyricsRouteBoundary, { onError: reportLyricsRouteError },
    react.createElement(LyricsContainer, null),
  );
}

// Optimized utility functions with better error handling and performance
const APP_NAME = "ivLyrics";
initializeRuntimeDebug(window);

function getRememberedIvLyricsFullscreenPresentation() {
  try {
    return normalizeIvLyricsFullscreenPresentation(
      StorageManager.getItem(FULLSCREEN_PRESENTATION_STORAGE_KEY)
    );
  } catch (error) {
    return "standard";
  }
}

function rememberIvLyricsFullscreenPresentation(value) {
  const normalized = normalizeIvLyricsFullscreenPresentation(value);
  try {
    StorageManager.setItem(
      FULLSCREEN_PRESENTATION_STORAGE_KEY,
      normalized
    );
  } catch (error) {
    ivLyricsDebug("[ivLyrics] Failed to remember fullscreen presentation:", error);
  }
  return normalized;
}

function getIvLyricsGlobalBackgroundMode(visual = getAppService("CONFIG", window)?.visual || {}) {
  return resolveGlobalBackgroundMode(visual);
}

function getIvLyricsTrackBackgroundMode(value) {
  return normalizeIvLyricsTrackBackgroundOverride(value)?.mode || null;
}

window.ivLyricsBackgroundModeIds = IVLYRICS_BACKGROUND_MODE_IDS;
window.ivLyricsBackgroundFlagIds = IVLYRICS_BACKGROUND_FLAG_IDS;
window.ivLyricsGetGlobalBackgroundMode = getIvLyricsGlobalBackgroundMode;
window.ivLyricsNormalizeTrackBackgroundOverride = normalizeIvLyricsTrackBackgroundOverride;

const settingsPersistence = initializeSettingsPersistence();
const TrackSyncDB = getTrackSyncOffsetStore(window);
const trackOverrides = getTrackOverrideStores(window);
const { TrackLyricsProviderDB, TrackBackgroundDB } = trackOverrides;

const StorageManager = publishSettingsStorage(window, createSettingsStorage({
  persistence: settingsPersistence,
  localStorage,
  getSpicetifyStorage: () => Spicetify.LocalStorage,
  offsetStore: TrackSyncDB,
  getI18n: () => getAppService("I18n", window),
  debug: ivLyricsDebug,
}));

const { getRememberedLyricsRenderModeLock, rememberLyricsRenderModeLock } =
  createLyricsModeLockStore({ storage: StorageManager, debug: ivLyricsDebug });

const CONFIG = createAppConfig({
  storage: StorageManager,
  readI18n: () => getAppService("I18n", window),
});

const { publishSettingsConfigChange } = createSettingsEventChannel(window, (type, detail) => new CustomEvent(type, { detail }));
const { handleVisualConfigChange: changeToolbarVisualSetting } = createVisualSettingsActions({
  getVisualSettings: () => CONFIG.visual,
  persistConfig: (name, value) => StorageManager.saveConfig(name, value),
  updateLyrics: () => refreshPageFromRoute(window),
  publishConfigChange: publishSettingsConfigChange,
});

// Extension에서 접근 가능하도록 window에 노출
publishAppService("CONFIG", CONFIG, window);
getAppService("ivLyricsSpeakerColors", window)?.applyCssVariables?.();

// Retain the cache references exposed to older add-ons.
window.CacheManager = CacheManager;
publishAppService("CACHE", CACHE, window);

const spotifyArtworkColors = createSpotifyArtworkColors({
  readGraphQL: () => Spicetify.GraphQL,
  readCosmos: () => Spicetify.CosmosAsync,
});

const SpotifyDataHelper = publishAppService("SpotifyDataHelper", createSpotifyTrackMetadata({
  extractTrackId: uri => Utils.extractTrackId(uri),
  readPlayerData: () => Spicetify.Player?.data,
  readNextTracks: () => Spicetify.Queue?.nextTracks,
}), window);

const { nextTrackPrefetch, makeVideoLookupRequest, fetchVideoLookup, routeVideoMatchSession, readPrefetchedVideo } = createLyricsRoutePrefetch({
  host: window,
  readVisual: () => CONFIG.visual, readVersion: () => CONFIG.version, readUtils: () => Utils,
  getService: name => getAppService(name, window),
  timers: { scheduleTimer: (callback, delay) => setTimeout(callback, delay), cancelTimer: timer => clearTimeout(timer) },
  debug: ivLyricsDebug,
  fetchVideo: (url, options) => fetch(url, options),
  readSpotifyData: uri => SpotifyDataHelper.extractSpotifyData(uri),
  readPlayerItem: () => Spicetify.Player?.data?.item,
  readVideoHelper: () => VideoHelperService,
  getDisplayModeCacheKey, getDisplayModeGenerationOptions, getNonSectionLyricsText, getLegacyNonSectionLyricsText,
  getCurrentTranslationTargetLanguage, getCachedTranslationForText, mapTranslationLinesToLyrics,
});

const thresholdSizeLimit = { min: 0, max: 100, step: 5 };

// Computes the base lyrics colour CSS variables for the current render, mirroring
// the original branch order in render(). Pure: reads only its inputs and CONFIG.
// The default branch returns the passed baseLyricsStyleVariables object by
// reference, exactly as before.
const { computeBaseLyricsStyleVariables, computeLyricsBackgroundStyle } = createLyricsBackgroundStyles({
  getVisualSettings: () => CONFIG.visual,
  isColorLight: (color) => Utils.isColorLight(color),
  getTrackArtwork: () => pageTrackIdentity.getTrackArtwork(Spicetify.Player.data?.item),
});

const fetchLyricsForTrack = createPageLyricsLoad({
  extractTrackId: (uri) => Utils.extractTrackId(uri),
  getLyricsService: () => getAppService("LyricsService", window),
  readStoredTrackLanguage: trackOverrides.readLanguage,
  readTrackProviderOverride: createTrackLyricsProviderReader(window, (uri) => Utils.extractTrackId(uri)),
  readStoredTrackBackground: trackOverrides.readBackground,
  getVisualSettings: () => CONFIG.visual,
  getModeKey: getLyricsModeTypeKey,
  syncedMode: SYNCED,
  detectLanguage: (lines) => Utils.detectLanguage(lines),
  getTargetLanguage: getCurrentTranslationTargetLanguage,
  getPronunciationNotation: getCurrentLyricsPronunciationNotation,
  getTranslationStyle,
  getSourceText: getNonSectionLyricsText,
});

const fetchTrackMetadataTranslation = createPageMetadataTranslation({
  isEnabled: () => CONFIG.visual["translate-metadata"],
  getTranslationCacheId: (uri) => Utils.getTranslationCacheId(uri),
  getTranslator: () => getAppService("Translator", window),
  getTargetLanguage: getCurrentTranslationTargetLanguage,
  publishMetadata: (result, uri) => getAppService("OverlaySender", window)?.sendTranslatedMetadata?.(result, uri),
});

const pageTimingUpgrade = createPageLyricsTimingUpgrade({
  cache: CACHE,
  getLyricsService: () => getAppService("LyricsService", window),
  getLyricsModeTypeKey,
});

class LyricsContainer extends react.Component {
  constructor() {
    super();
    watchFullscreenContainerBodyClass(document, window.MutationObserver);
    this.regenerationMenu = createPageRegenerationMenu({
      page: this,
      openChoiceModal: openRegenerateTranslationChoiceModal,
      getChoiceItems: getRegenerateTranslationChoiceItems,
      readWordSupplements: getAppWordSupplementService,
    });
    initializeLyricsRoutePage(this, {
      host: window, document, react, Spicetify, CONFIG, I18n, Utils, Toast, StorageManager,
      TrackLyricsProviderDB, TrackBackgroundDB, getService: name => getAppService(name, window), nextTrackPrefetch,
      getRememberedLyricsRenderModeLock, rememberLyricsRenderModeLock,
      getRememberedIvLyricsFullscreenPresentation, rememberIvLyricsFullscreenPresentation,
      buildTranslationLineRequests, getLegacyNonSectionLyricsText, getNonSectionLyricsText,
      getTranslationResultCacheHash, getLyricsProcessingShapeSignature, getDisplayModeGenerationOptions,
      getCurrentTranslationTargetLanguage, getCurrentLyricsPronunciationNotation,
      getTranslationStyle,
      openConfig, isSetupNeeded, openSetupWizard,
      readLanguagePrompt: () => ivLyricsFirstLanguagePrompt,
      spotifyArtworkColors, pageTrackIdentity, ivLyricsDebug,
    });
  }

  shouldReduceMotion() {
    return CONFIG.visual["reduce-motion"] === true;
  }

  getFloatingMenuContentTopOffset() {
    return this.floatingToolbar.getContentTopOffset();
  }

  isShortcutInputFocused() {
    return isLyricsShortcutInputFocused(document);
  }

  toggleFullscreenLyricsHidden() {
    if (!this.state.isFullscreen) {
      return;
    }

    this.setState((prevState) => ({
      fullscreenLyricsHidden: !prevState.fullscreenLyricsHidden,
    }));
  }

  clearFloatingMenuCloseTimer() {
    this.floatingToolbar.clearCloseTimer();
  }

  isFloatingToolbarEngaged() {
    return this.floatingToolbar.isEngaged();
  }

  // The player item as the toolbar's track tools see it (LRCLIB search uses
  // its title and artist).
  getCurrentPlayerTrackInfo() {
    const currentPlayerItem = Spicetify.Player.data?.item;
    return this.infoFromTrack(currentPlayerItem) || {
      duration: Number(currentPlayerItem?.metadata?.duration || 0),
      album: currentPlayerItem?.metadata?.album_title || "",
      artist: this.state.artist || currentPlayerItem?.metadata?.artist_name || "",
      title: this.state.title || currentPlayerItem?.metadata?.title || "",
      uri: this.currentTrackUri || this.state.uri || currentPlayerItem?.uri || "",
      image: this.state.coverUrl || currentPlayerItem?.metadata?.image_url || "",
    };
  }

  getSyncCreatorTrackInfo() {
    const item = Spicetify.Player.data?.item;
    const trackUri = this.currentTrackUri || this.state.uri || item?.uri;
    return captureSyncCreatorTrackInfo(trackUri, item, this.state);
  }

  getShareImageTrackInfo(lyrics) {
    const item = Spicetify.Player.data?.item;
    const { currentLyrics, isLoading, uri } = this.state;
    if (lyrics !== currentLyrics || isLoading || (item?.uri && uri !== item.uri)) return null;
    return {
      uri,
      sourceLanguage: this.provideLanguageCode(lyrics, { publish: false }) || "auto",
      name: item?.name || item?.metadata?.title || '',
      artist: item?.artists?.map(a => a.name).join(', ') || item?.metadata?.artist_name || '',
      cover: pageTrackIdentity.getTrackArtwork(item),
    };
  }

  handleFloatingToolbarConfigChange(name, value) {
    changeToolbarVisualSetting(name, value);
  }

  getTranslationTargetLanguage() {
    return getCurrentTranslationTargetLanguage();
  }

  isCulturalAnnotationsEnabled() {
    return this.culturalAnnotations.isEnabled();
  }

  clearCulturalAnnotationsForTrack(uri, options) {
    return this.culturalAnnotations.clearTrack(uri, options);
  }

  clearAllCulturalAnnotations(options) {
    return this.culturalAnnotations.clearAll(options);
  }

  applyCulturalAnnotations(lyrics, uri) {
    return this.culturalAnnotations.apply(lyrics, uri);
  }

  requestCulturalAnnotations(options) {
    return this.culturalAnnotations.request(options);
  }

  getEditingBaseLyrics() {
    return this.lyricsCacheEditor.getEditingBaseLyrics();
  }

  getEditableCacheSourceLines() {
    return this.lyricsCacheEditor.getEditableCacheSourceLines();
  }

  openLyricsEditModal() {
    return this.lyricsCacheEditor.open();
  }

  closeLyricsEditModal(options) {
    this.lyricsCacheEditor.close(options);
  }

  saveLyricsEditModal() {
    return this.lyricsCacheEditor.save();
  }

  invalidateSharedLyricsPresentation(trackUri) {
    this.lyricsCacheEditor.invalidatePresentation(trackUri);
  }

  fetchMetadataTranslation(uri, title, artist) {
    return fetchTrackMetadataTranslation(this, uri, title, artist);
  }

  beginLyricsLoadRequest(advanceTransition = false) {
    if (advanceTransition) this._lyricsTransitionSeq += 1;
    const requestSeq = ++this._lyricsFetchSeq;
    this._activeLyricsFetchSeq = requestSeq;
    return requestSeq;
  }

  isCurrentLyricsUri(uri) {
    return !!uri && this.currentTrackUri === uri;
  }

  isCurrentLyricsState(lyricsState) {
    if (!lyricsState?.uri || !this.isCurrentLyricsUri(lyricsState.uri)) {
      return false;
    }

    const requestSeq = lyricsState.lyricsRequestSeq;
    return !requestSeq || requestSeq === this._activeLyricsFetchSeq;
  }

  mergeCurrentLyricsTiming(lyrics, uri, provider, state = this.state) {
    return pageTimingUpgrade.mergeCurrentLyricsTiming(this, lyrics, uri, provider, state);
  }

  applyLyricsTimingUpgrade(upgraded, isCurrent) {
    return pageTimingUpgrade.applyLyricsTimingUpgrade(this, upgraded, isCurrent);
  }

  clearPendingLyricsUpdates() {
    cancelPendingLyricsTimingUpgrade(this);
    cancelPendingPageMetadataTranslation(this);
    this.lyricPresenter.clear();
    this.clearLyricsLoading();
    this.clearPhoneticLoading();
    this.clearTranslationLoading();
    this.clearCulturalAnnotationsLoading();
    this.clearWordSyncLoading();
    this.restoreWordSyncLoading();
    this.clearPronunciationSyncLoading();
    this.restorePronunciationSyncLoading();
  }

  getLyricsLayoutHasLyrics(lyricsState = this.state) {
    return hasLyricsLayout(lyricsState);
  }

  getLoadingLyricsState(info, requestSeq) {
    return buildLyricsLoadingState({
      info, requestSeq, transitionSeq: this._lyricsTransitionSeq,
      lyricsLoadingHasLyrics: this.getLyricsLayoutHasLyrics(),
    });
  }

  publishLyricsPresentation(lyrics, context = {}, deliveryOptions) {
    return this.lyricPresenter.publish(lyrics, context, deliveryOptions);
  }

  /**
   * 번역 재생성 메서드 - ignore_cache를 true로 설정하여 새로운 번역 요청
   */
  getRegenerationTargets({ publishLanguage = true } = {}) {
    return getPageRegenerationTargets(CONFIG.visual, () => this.provideLanguageCode(this.state.currentLyrics, {
      publish: publishLanguage,
    }));
  }

  handleRegenerateTranslationRequest() {
    this.regenerationMenu.open();
  }

  getRegenerateTranslationChoices() {
    return this.regenerationMenu.getChoices();
  }

  async runRegenerateTranslationChoice(target, trackUri) {
    return runPageLyricRegeneration(this, target, trackUri);
  }

  regenerateCulturalAnnotations() {
    return this.culturalAnnotations.regenerate();
  }

  applyStreamingTranslation(payload) {
    this.lyricPresenter.enqueueStreamingTranslation(payload);
  }

  async regenerateWordSupplements() {
    return regeneratePageWordSupplements(this, {
      playbackUri: () => Spicetify.Player.data?.item?.uri,
      getLyricsService: () => getAppService("LyricsService", window),
      getPrefetcher: getAppWordSupplementPrefetcher,
      getSupplements: getAppWordSupplementService,
      toast: Toast,
      translate: key => I18n.t(key),
    });
  }

  async regenerateTranslation(target = "all") {
    return regeneratePageTranslation(this, target, {
      toast: Toast, translate: key => I18n.t(key),
      getTranslationCacheId: uri => Utils.getTranslationCacheId(uri),
      getTranslator: () => getAppService("Translator", window),
      selectOriginalLyrics: (state, mode) => {
        if (isKaraokeRenderMode(mode) && state.karaoke) return state.karaoke;
        if (mode === SYNCED && state.synced) return state.synced;
        if (mode === UNSYNCED && state.unsynced) return state.unsynced;
        return state.currentLyrics || [];
      },
      getNonSectionLyricsText, getDisplayModeCacheKey, getDisplayModeGenerationOptions,
      getSyncDataRendererCacheVersion, getLyricsProcessingShapeSignature, getCurrentLyricsPronunciationNotation,
      mapTranslationLinesToLyrics,
      shouldRequestPronunciationSlots: (lyrics, source) => !!readPronunciationSlots(window)?.isRequested?.(lyrics, source),
      memoryCache: CacheManager,
    });
  }

  async selectLyricsProviderForCurrentTrack(providerId, trackUri) {
    return this.trackPreferences.selectProvider(providerId, trackUri);
  }

  getEffectiveBackgroundMode(override = this.trackBackgroundOverride) {
    return (
      getIvLyricsTrackBackgroundMode(override) ||
      getIvLyricsGlobalBackgroundMode(CONFIG.visual)
    );
  }

  async selectBackgroundForCurrentTrack(mode, trackUri) {
    return this.trackPreferences.selectBackground(mode, trackUri);
  }

  infoFromTrack(track) {
    const meta = track?.metadata;
    if (!meta) {
      return null;
    }
    return {
      duration: Number(meta.duration),
      album: meta.album_title,
      artist: track.artists?.map((artist) => artist?.name).filter(Boolean).join(", ") || meta.artist_name,
      title: meta.title,
      isrc: meta.isrc || track.external_ids?.isrc || "",
      uri: track.uri,
      image: pageTrackIdentity.getTrackArtwork(track),
    };
  }


  async fetchColors(uri) {
    return this.trackPresentation.fetchColors(uri);
  }

  async fetchTempo(uri) {
    return this.trackPresentation.fetchTempo(uri);
  }

  createPageLyricsDataLoader() {
    return createPageLyricsDataLoader({
      cache: CACHE,
      getLyricsService: () => getAppService("LyricsService", window),
      getPseudoKaraoke: () => getAppService("PseudoKaraokeService", window),
      getMarketplaceReady: () => readAppMarketplaceManager(window)?.readyPromise,
      isCacheCurrent: isLyricsRenderCacheCurrent,
      getDataMode: getLyricsDataMode,
      getModeKey: (mode) => CONFIG.modes?.[getLyricsDataMode(mode)],
    });
  }

  fetchLyrics(track, mode = -1, refresh = false) {
    return fetchLyricsForTrack(this, track, mode, refresh);
  }

  resolveLyricsForMode(lyricsState, mode) {
    if (!lyricsState) return null;

    const dataMode = getLyricsDataMode(mode);
    const preferredModeKey =
      typeof dataMode === "number" && dataMode >= 0 ? CONFIG.modes?.[dataMode] : null;
    const preferredLyrics =
      preferredModeKey && lyricsState[preferredModeKey]
        ? lyricsState[preferredModeKey]
        : null;

    return (
      preferredLyrics ||
      lyricsState.karaoke ||
      lyricsState.synced ||
      lyricsState.unsynced ||
      null
    );
  }

  lyricsSource(lyricsState, mode) {
    this.lyricPresenter.present(lyricsState, mode);
  }

  /**
   * Smart optimization for translations - removes duplicates and identical content
   * @param {Array} originalLyrics - Original lyrics
   * @param {Array} mode1 - Translation from Display Mode 1
   * @param {Array} mode2 - Translation from Display Mode 2
   * @param {String} displayMode1 - Mode type for mode1 (e.g., "gemini_romaji", "gemini_ko")
   * @param {String} displayMode2 - Mode type for mode2
   * @returns {Array} Optimized lyrics with smart deduplication
   */
  optimizeTranslations(originalLyrics, mode1, mode2, displayMode1, displayMode2) {
    if (!Array.isArray(originalLyrics)) return [];
    const processed = composeLyricSupplements(originalLyrics, mode1, mode2, displayMode1, displayMode2);
    return reuseLyricsPresentation(this.state?.currentLyrics,
      this.applyCulturalAnnotations(processed, this.state.uri));
  }

  getGeminiTranslation(lyricsState, lyrics, mode, onProgress = null) {
    return requestLyricsTranslation({
      lyricsState,
      lyrics,
      mode,
      onProgress,
      session: {
        getState: () => this.state,
        getTargetLanguage: () => this.getTranslationTargetLanguage(),
        getSourceLanguage: (source) => this.provideLanguageCode(source, { publish: false }) || "auto",
        getSourceLanguagePreference: () => this.getSourceLanguagePreference(),
        getInflightRequests: () => this._inflightGemini,
        ensureInflightRequests: () => (this._inflightGemini ||= new Map()),
        isCurrentLyricsState: (state) => this.isCurrentLyricsState(state),
        startLoading: (phonetic) => phonetic ? this.startPhoneticLoading() : this.startTranslationLoading(),
        finishLoading: (phonetic, token, options) => phonetic
          ? this.clearPhoneticLoading(token, options)
          : this.clearTranslationLoading(token, options),
      },
    });
  }

  getTraditionalConversion(lyricsState, lyrics, language, displayMode) {
    return this.traditionalConversion.request(lyricsState, lyrics, language, displayMode);
  }

  resetDelay(uri = Spicetify.Player.data?.item?.uri) {
    CONFIG.visual.delay =
      Number(
        uri && StorageManager.getItem(`lyrics-delay:${uri}`)
      ) || 0;
  }

  getText(key, fallback) {
    const value = I18n?.t?.(key);
    return value && value !== key ? value : fallback;
  }

  getPlaybackPaused() {
    return this.playback.getPlaybackPaused();
  }

  isPlaybackUriCurrent(uri) {
    return this.playback.isPlaybackUriCurrent(uri);
  }

  componentDidMount() {
    this.lifecycle.mount();
  }

  componentWillUnmount() {
    this.lifecycle.unmount();
  }

  isModeAvailable(mode, lyricsState) {
    return this.modes.isModeAvailable(mode, lyricsState);
  }

  getCurrentMode() {
    return this.modes.getCurrentMode();
  }

  getAutomaticMode(lyricsState) {
    return this.modes.getAutomaticMode(lyricsState);
  }

  switchTo(mode) {
    this.modes.switchTo(mode);
  }

  toggleModeLock(mode, event) {
    this.modes.toggleModeLock(mode, event);
  }

  setCurrentModeLock(locked) {
    this.modes.setCurrentModeLock(locked);
  }

  render() {
    return renderLyricsPage(this, {
      host: window, document, react, visual: CONFIG.visual,
      translate: (key) => I18n.t(key),
      ensureReactDOM, extractTrackId: (uri) => Utils.extractTrackId(uri),
      computeBaseLyricsStyleVariables, computeLyricsBackgroundStyle,
      getDisplayModeGenerationOptions, getCurrentLyricsPronunciationNotation, getSyncDataRendererCacheVersion,
      LyricsCacheEditModal, LyricsPageRenderer, MarketplacePage, UpdateBanner,
      TrackSyncAdjustPill,
      Toolbar: IvLyricsFloatingToolbar, modeKeys: FLOATING_TOOLBAR_MODE_KEYS,
      FullscreenOverlay, VideoBackground, readPrefetchedVideo: readPrefetchedVideo, getIvLyricsTrackBackgroundMode,
    });
  }
}

loadPageFonts(document, CONFIG.visual);

const I18n = initializeRuntimeI18n({ host: window, spicetify: Spicetify, getLocalStorage: () => localStorage });
installPageLyricsPublisher(window);
startWordSupplementService(window);

const PlaylistPicker = publishAppService("PlaylistPicker", createPlaylistPicker({
  host: window, document, spicetify: Spicetify, i18n: I18n, getToast: () => Toast,
}), window);

const { LyricsPageRenderer, KaraokeLine, lyricRendererPrimitives } = mountLyricsRenderer({
  host: window, document, localStorage, react, spicetify: Spicetify, config: CONFIG, i18n: I18n,
  getUtils: () => Utils,
  getToast: () => Toast,
  getMarketplacePage: () => MarketplacePage,
});

const CdVisualizer = startPageMotion(window, lyricRendererPrimitives);
const { utils: Utils, toast: Toast, speakerColors: ivLyricsSpeakerColors } = createPageUtils({
  host: window, document, localStorage, spicetify: Spicetify, config: CONFIG,
  i18n: I18n, storage: StorageManager, trackSyncStore: TrackSyncDB,
});
installPageShareImage(window);

const { VideoHelperService, CommunityVideoSelector, VideoBackground } = startPageVideo({
  host: window, react, spicetify: Spicetify, config: CONFIG, i18n: I18n, storage: StorageManager,
  utils: Utils, toast: Toast, videoMatch: VideoMatch,
  routeVideoMatchSession, makeVideoLookupRequest, readRoutePrefetchedVideo: readPrefetchedVideo, fetchVideoLookup,
});

const FullscreenOverlay = startPageFullscreen({
  host: window, document, spicetify: Spicetify, config: CONFIG, i18n: I18n, toast: Toast,
  lyricRendererPrimitives, cdVisualizer: CdVisualizer, playlistPicker: PlaylistPicker,
  getSongResearch: () => SongResearch,
  getReactDOM: () => ensureReactDOM() || Spicetify.ReactDOM || window.ReactDOM,
});

const { openSetupWizard, isSetupNeeded, SongResearch, showNoticeIfNeeded } = startPageApp({
  host: window, document, react, spicetify: Spicetify, config: CONFIG, i18n: I18n,
  storage: StorageManager, utils: Utils, videoHelper: VideoHelperService,
  getReactDOM: ensureReactDOM,
});
installPageSyncCreatorDraftStore(window);

const {
  openConfig, IvLyricsFloatingToolbar, openRegenerateTranslationChoiceModal,
  getRegenerateTranslationChoiceItems, ivLyricsFirstLanguagePrompt, MarketplacePage, TrackSyncAdjustPill,
} = startPageMenus({
  host: window, document, react, spicetify: Spicetify, appName: APP_NAME, i18n: I18n,
  config: CONFIG, storage: StorageManager, utils: Utils, toast: Toast, KaraokeLine,
  speakerColors: ivLyricsSpeakerColors, videoHelper: VideoHelperService, CommunityVideoSelector,
  lyricRendererPrimitives, thresholdSizeLimit, readReactDom: ensureReactDOM,
});

// A deep link can already be the current route on the first callback.
installPageUrlCallbacks(window, {
  getHistory: () => Spicetify.Platform?.History,
  onAlert: (message) => Toast.show(message, false, 3000),
  onDiscordLogin: (token) => Utils.handleDiscordAuthCallback(token),
  onError: (error) => console.error("[ivLyrics] URL Scheme error:", error),
});
schedulePageNotice(window, showNoticeIfNeeded);
schedulePageToastCleanup(window, () => Toast.startPeriodicCleanup?.());
