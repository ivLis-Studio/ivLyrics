import { createSettingsTabContent } from "#ivlyrics/features/settings/settingsTabContent.mjs";
import { createRuntimeDebugLogger, writeRuntimeDebug } from "#ivlyrics/spicetify/runtimeDebug.mjs";
import { createSettingsModalCss } from "./SettingsStyles.js";
import { LOCAL_LYRICS_UPDATED_EVENT as SETTINGS_LOCAL_LYRICS_UPDATED_EVENT } from "#ivlyrics/lyrics/localLyricsStore.mjs";
import { SETTINGS_BACKGROUND_PRESETS, getSettingsBackgroundPresetLabel } from "#ivlyrics/features/settings/settingsBackgroundPresets.mjs";
import { useSettingsSignal, useSettingsConfigSignal, useSettingsInterfaceLanguage } from "#ivlyrics/features/settings/settingsSignals.mjs";
import { createSettingsSectionNavigation } from "#ivlyrics/features/settings/settingsSectionNavigation.mjs";
import { useSettingsDockPreferences } from "#ivlyrics/features/settings/useSettingsDockPreferences.mjs";
import { createSettingsPreviewDock } from "#ivlyrics/features/settings/settingsPreviewDock.mjs";
import { createSettingsKaraokeFillCurveEditor } from "#ivlyrics/features/settings/settingsKaraokeFillCurveEditor.mjs";
import { createSettingsHotkeyControls } from "#ivlyrics/features/settings/settingsHotkeyControls.mjs";
import { createSettingsLayerMatrix } from "#ivlyrics/features/settings/settingsLayerMatrix.mjs";
import { createSettingsLayoutControls } from "#ivlyrics/features/settings/settingsLayoutControls.mjs";
import { createSettingsHelperToggles } from "#ivlyrics/features/settings/settingsHelperToggles.mjs";
import { useSettingsReleaseNotes } from "#ivlyrics/features/settings/useSettingsReleaseNotes.mjs";
import { isSettingsEditableField, useSettingsModalInteractions } from "#ivlyrics/features/settings/settingsModalInteractions.mjs";
import { useSettingsModalSearch } from "#ivlyrics/features/settings/useSettingsModalSearch.mjs";
import { createSettingsCloudSyncPanel } from "#ivlyrics/features/settings/settingsCloudSyncPanel.mjs";
import { useSettingsBackgroundTab } from "#ivlyrics/features/settings/settingsBackgroundTab.mjs";
import { refreshLyricsPage as refreshPageFromSettings, requestLyricsReload as reloadPageFromSettings } from "#ivlyrics/spicetify/lyricsPageActions.mjs";
import { createSettingsChoiceControls, handleSettingsRadioKeys } from "#ivlyrics/features/settings/settingsChoiceControls.mjs";
import { createSettingsColorControls, normalizeSettingsHexColor } from "#ivlyrics/features/settings/settingsColorControls.mjs";
import { createSettingsFontControls } from "#ivlyrics/features/settings/settingsFontControls.mjs";
import { loadSettingsFontFamily, loadStoredSettingsFonts } from "#ivlyrics/features/settings/settingsFontLoading.mjs";
import { createSettingsNumericControls } from "#ivlyrics/features/settings/settingsNumericControls.mjs";
import { createSettingsOptionList, createSettingsToggleRowInteractions } from "#ivlyrics/features/settings/settingsOptionList.mjs";
import { createSettingsTextControls } from "#ivlyrics/features/settings/settingsTextControls.mjs";
import { createSettingsLyricsPreview, getSettingsPreviewSupplementVisibility } from "#ivlyrics/features/settings/createSettingsLyricsPreview.mjs";
import { createSettingsPanelPreview } from "#ivlyrics/features/settings/createSettingsPanelPreview.mjs";
import { createSettingsTypographyControls } from "#ivlyrics/features/settings/settingsTypographyControls.mjs";
import { createSettingsInterludeControls } from "#ivlyrics/features/settings/settingsInterludeControls.mjs";
import { createSettingsMultiVocalColors } from "#ivlyrics/features/settings/settingsMultiVocalColors.mjs";
import { requestAppRouteReload } from "#ivlyrics/spicetify/routeReload.mjs";
import { createSettingsProviderCards } from "#ivlyrics/features/settings/settingsProviderCards.mjs";
import { createSettingsProviderListView } from "#ivlyrics/features/settings/settingsProviderListView.mjs";
import { createSettingsLyricsProviderTab } from "#ivlyrics/features/settings/settingsLyricsProviderTab.mjs";
import { createSettingsAiProviderTab } from "#ivlyrics/features/settings/settingsAiProviderTab.mjs";
import { renderSettingsSectionShell } from "#ivlyrics/features/settings/settingsSectionShell.mjs";
import { createSettingsPresetsStore, formatSettingsPresetTimestamp } from '#ivlyrics/features/settings/settingsPresetsStore.mjs';
import { createSettingsPresetsPanel } from '#ivlyrics/features/settings/settingsPresetsPanel.mjs';
import { createAccountSettingsPanel } from '#ivlyrics/features/settings/accountSettingsPanel.mjs';
import { createSettingsUiTheme } from '#ivlyrics/features/settings/settingsUiTheme.mjs';
import { createOverlaySettingsPanel } from '#ivlyrics/features/settings/overlaySettingsPanel.mjs';
import { createSettingsSaveEffects, publishAppliedSettingsPreset } from '#ivlyrics/features/settings/settingsSaveEffects.mjs';
import { createSettingsEventChannel, createVisualSettingsActions } from '#ivlyrics/core/visualSettingsActions.mjs';
import { collectSettingsRegistry, indexSettingsSearch } from '#ivlyrics/features/settings/settingsRegistry.mjs';
import { useSettingsTabNavigation } from "#ivlyrics/features/settings/useSettingsTabNavigation.mjs";
import { createSettingsMenuMetadata } from "#ivlyrics/features/settings/settingsMenuMetadata.mjs";
import { createSettingsModalChrome } from "#ivlyrics/features/settings/settingsModalChrome.mjs";
import { createChangedSettingsView, useChangedSettingsCounts } from "#ivlyrics/features/settings/settingsChangedView.mjs";
import { createSettingsFullscreenPreview } from "#ivlyrics/features/settings/createSettingsFullscreenPreview.mjs";
import { readSettingFlag, readSettingNumber } from "#ivlyrics/features/settings/settingsPreviewValues.mjs";
import {
  SETTINGS_BACKGROUND_MODE_KEY, SETTINGS_DEFAULT_BACKGROUND_MODE, hasSettingDefault, getSettingDefaultValue,
} from "#ivlyrics/features/settings/settingsDefaults.mjs";
import { resolveGlobalBackgroundMode as resolveSettingsBackgroundMode } from "#ivlyrics/lyrics/backgroundModes.mjs";
import { createFullscreenPresentationPicker } from "#ivlyrics/features/settings/settingsFullscreenPresentationPicker.mjs";
import { createSettingsPerformanceControls } from "#ivlyrics/features/settings/settingsPerformanceControls.mjs";
import { createCdSettingsCatalog, isCdSettingsKey } from "#ivlyrics/features/settings/settingsCdCatalog.mjs";
import { createSettingsDestinationResolver } from "#ivlyrics/features/settings/settingsDestinations.mjs";
import {
  isSettingsModalOpen, mountSettingsModal, registerSettingsModalOpen, restoreSettingsOnFirstLyricsMount,
} from "#ivlyrics/features/settings/settingsModalHost.mjs";
import { createReactMountBoundary } from "#ivlyrics/spicetify/routeReactDom.mjs";
import { createSettingsCacheActions } from "#ivlyrics/features/settings/settingsCacheActions.mjs";
import { createLocalCacheSettingsPanel } from "#ivlyrics/features/settings/localCacheSettingsPanel.mjs";
import { createDebugSettingsPanel } from "#ivlyrics/features/settings/debugSettingsPanel.mjs";
import { getMountedLyricsPage as getSettingsLyricsPage } from "#ivlyrics/spicetify/lyricsPageEffects.mjs";
import { pageLyricsMemoryCache } from "#ivlyrics/lyrics/pageMemoryCache.mjs";
import { createIndexedDbBackup } from "#ivlyrics/core/indexedDbBackup.mjs";
import { createSettingsBackupActions } from "#ivlyrics/features/settings/settingsBackupActions.mjs";
import { createSettingsBackupButton } from "#ivlyrics/features/settings/settingsBackupButton.mjs";
import { createSettingsUpdateButton } from "#ivlyrics/features/settings/settingsUpdateButton.mjs";

export function createSettingsPage({
  host: window, react, appName: APP_NAME, i18n: I18n, config: CONFIG,
  storage: StorageManager, spicetify: Spicetify, utils: Utils, toast: Toast,
  readKaraokeLine, readVideoHelper, readReactDom, readSpeakerColors = () => undefined, thresholdSizeLimit, services,
}) {
  const SETTINGS_MODAL_CSS = createSettingsModalCss(APP_NAME);

  const { publishSettingsEvent, publishSettingsConfigChange, publishSettingsRefresh, subscribeSettingsConfig } =
    createSettingsEventChannel(window, (type, detail) => new CustomEvent(type, { detail }));
  const updateLyrics = () => refreshPageFromSettings(window);
  const persistConfig = (name, value) => StorageManager.saveConfig(name, value);
  const visualSettingsActions = createVisualSettingsActions({
    getVisualSettings: () => CONFIG.visual,
    persistConfig, persistConfigBatch: (values) => StorageManager.saveConfigs(values),
    updateLyrics, publishConfigChange: publishSettingsConfigChange,
  });
  const { saveVisualSetting, saveVisualSettings } = visualSettingsActions;

  const {
    getOverlaySender, getSyncDataService, getLyricsService, getLyricsCache, getTranslator,
    getApiTracker, readSettingsLanguage, setSettingsLanguage, getSettingsLyricsHelper, getStoragePersistence,
    readAiSettingsManager, readLyricsSettingsManager,
    publishSettingsThemeCompatibility, publishSettingsBackgroundCompatibility,
  } = services;

  const indexedDbBackup = createIndexedDbBackup();
  const backupActions = createSettingsBackupActions({
    document,
    translate: (...args) => I18n.t(...args),
    confirm: message => window.confirm(message),
    requestSaveTarget: (...args) => Utils.requestSaveFileTarget(...args),
    saveBlob: (...args) => Utils.saveBlobAs(...args),
    exportConfig: () => StorageManager.exportConfig(),
    importConfig: config => StorageManager.importConfig(config),
    exportDatabases: () => indexedDbBackup.exportAllDBs(),
    importDatabases: data => indexedDbBackup.importAllDBs(data),
    clearSettings: () => StorageManager.clearConfig(),
    reload: () => queueReloadIntoIvLyrics({ reopenSettings: true, initialTab: "general", delay: 1500 }),
  });

  const SETTINGS_OUTLINE_ICONS = Object.freeze({
    general: "M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M6 14v6",
    "lyrics-providers": "M9 18V5l10-2v13M9 8l10-2M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm10-2a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z",
    "ai-providers": "M12 3l1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3ZM5 14l.8 2.2L8 17l-2.2.8L5 20l-.8-2.2L2 17l2.2-.8L5 14Zm13-1 1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3Z",
    appearance: "M12 3a9 9 0 0 0 0 18h1.4a2.1 2.1 0 0 0 0-4.2h-1a1.7 1.7 0 0 1 0-3.4H15a6 6 0 0 0 0-12h-3ZM7.5 9h.01M9.5 6h.01M15 6.5h.01M17 10h.01",
    performance: "M4.3 18a9 9 0 1 1 15.4 0M12 12l4-4M7 18h10",
    lyrics: "M5 7h8M5 12h6M5 17h8M16 8l4 4-4 4V8Z",
    fullscreen: "M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5",
    nowplaying: "M3 5h18v14H3V5Zm11 0v14M17 9h1M17 13h1",
    advanced: "M4 7h6M14 7h6M4 17h10M18 17h2M10 4v6M14 14v6",
    debug: "M9 9h6v8a3 3 0 0 1-6 0V9Zm3-5v5M8 4l2 2M16 4l-2 2M5 11h4M15 11h4M5 16h4M15 16h4",
    about: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-11v6M12 7h.01",
    karaoke: "M12 14a4 4 0 0 0 4-4V5a4 4 0 1 0-8 0v5a4 4 0 0 0 4 4Zm-7-4a7 7 0 0 0 14 0M12 17v4M9 21h6",
    character: "M5 9v6M9 6v12M13 9v6M17 4v16M21 8v8",
    word: "M3 6h4l2 12h2l3-12h4l3 12M4.5 13h3M14.5 13h5",
    synced: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-15v5l3 2",
    unsynced: "M5 6h14M5 12h14M5 18h9",
    ivsync: "M20 7h-5V2M4 17h5v5M5.5 8a8 8 0 0 1 13-2L20 7M4 17l1.5 1A8 8 0 0 0 18.5 16",
    pronunciation: "M11 5 6 9H3v6h3l5 4V5ZM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13",
    translate: "M4 5h8M8 3v2M6 5c0 4 2 7 6 9M11 5c-.4 3.4-2.2 6.2-5.5 8M14 21l3.5-9L21 21M15.5 18h4",
    metadata: "M4 4h7l9 9-7 7-9-9V4Zm4 4h.01",
    tmi: "M21 12a9 9 0 0 1-9 9H5l1.8-3.2A9 9 0 1 1 21 12Zm-9-1v5M12 7h.01",
    lyricsStudy: "M4 5.5A3.5 3.5 0 0 1 7.5 2H12v17H7.5A3.5 3.5 0 0 0 4 22V5.5ZM20 5.5A3.5 3.5 0 0 0 16.5 2H12v17h4.5A3.5 3.5 0 0 1 20 22V5.5Z",
    characterPronunciation: "M5 9v6M9 6v12M13 9v6M17 4v16M21 8v8",
    wordSupplements: "M3 6h4l2 12h2l3-12h4l3 12M4.5 13h3M14.5 13h5M4 20h16",
    culturalAnnotations: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-20c3 3 4.5 6.3 4.5 10S15 19 12 22M12 2C9 5 7.5 8.3 7.5 12S9 19 12 22M2 12h20",
    motionDirection: "M3 7h12v10H3V7Zm12 4 6-3v8l-6-3",
  });

  const SettingsOutlineIcon = ({ name, className = "", size = 16 }) =>
    react.createElement("svg", {
      className,
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 1.7,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      "aria-hidden": "true",
    }, react.createElement("path", { d: SETTINGS_OUTLINE_ICONS[name] || SETTINGS_OUTLINE_ICONS.general }));

  // 데스크탑 오버레이 설정 컴포넌트
  const OverlaySettings = createOverlaySettingsPanel({
    react,
    translate: (key) => I18n.t(key),
    getSender: getOverlaySender,
    listenForConnection: (listener) => {
      window.addEventListener("ivLyrics:overlay-connection", listener);
      return () => window.removeEventListener("ivLyrics:overlay-connection", listener);
    },
    openDownload: (url) => window.open(url, "_blank"),
    notifySuccess: (message) => Toast?.success?.(message),
    notifyError: (message) => Toast?.error?.(message),
    onToggleRowPointerDown: (event) => handleSettingsToggleRowPointerDown(event),
    onToggleRowClick: (event) => handleSettingsToggleRowClick(event),
    getConfigSlider: () => ConfigSlider,
  });

  const listenForAccountChange = (listener) => {
    window.addEventListener("ivLyrics:account-changed", listener);
    return () => window.removeEventListener("ivLyrics:account-changed", listener);
  };

  const AccountSection = createAccountSettingsPanel({
    react,
    translate: (key) => I18n.t(key),
    getTheme: () => resolveEffectiveSettingsUiTheme(),
    accountApi: {
      captureAccountSession: () => Utils.captureAccountSession(),
      isAccountSessionCurrent: (session) => Utils.isAccountSessionCurrent(session),
      fetchAccountProfile: () => Utils.fetchAccountProfile(),
      saveOwnNickname: (userHash, nickname) => Utils.saveOwnNickname(userHash, nickname),
      fetchSyncCreatorPrivacy: () => Utils.fetchSyncCreatorPrivacy(),
      setSyncCreatorPrivacy: (isPrivate) => Utils.setSyncCreatorPrivacy(isPrivate),
      startDiscordLogin: () => Utils.startDiscordLogin(),
      logoutDiscordSession: () => Utils.logoutDiscordSession({ resetIdentity: true }),
      restoreAccountSettings: (options) => Utils.restoreAccountSettings(options),
    },
    notifySuccess: (message) => Toast.success(message),
    notifyError: (message) => Toast.error(message),
    clearSyncCache: () => getSyncDataService()?.clearCache?.(),
    listenForAccountChange,
    publishPrivacyChange: (detail) => window.dispatchEvent(new CustomEvent("ivLyrics:creator-privacy-changed", { detail })),
  });

  const LocalCacheManager = createLocalCacheSettingsPanel({
    react,
    cache: createSettingsCacheActions({
      storage: StorageManager,
      services: { getSyncDataService, getLyricsService, getLyricsCache, getTranslator },
      getLyricsPage: () => getSettingsLyricsPage(window),
      onLocalLyricsDeleted: (trackUri) => window.dispatchEvent(new CustomEvent(SETTINGS_LOCAL_LYRICS_UPDATED_EVENT, {
        detail: { trackUri, deleted: true },
      })),
    }),
    readLanguage: readSettingsLanguage,
    readTrackUri: () => Spicetify.Player.data?.item?.uri,
    extractTrackId: (uri) => Utils.extractTrackId?.(uri),
    getTranslationCacheId: (uri) => Utils.getTranslationCacheId?.(uri),
    getSettingsText: (key, fallback) => getSettingsText(key, fallback),
    translate: (...args) => I18n.t(...args),
    confirm: (message) => window.confirm(message),
    reloadLyrics: (clearCache, trackUri) => reloadPageFromSettings(window, clearCache, trackUri),
    notifySuccess: (message) => Toast.success(message),
    notifyError: (message) => Toast.error(message),
  });

  const DebugInfoPanel = createDebugSettingsPanel({
    react,
    readTracker: getApiTracker,
    readTrack: () => Spicetify.Player.data?.item,
    readCachedLyrics: (uri) => pageLyricsMemoryCache[uri],
    readVisualSettings: () => CONFIG.visual,
    readAppVersion: () => Utils.currentVersion,
    readClientId: () => Spicetify.LocalStorage.get("ivLyrics:user-hash"),
    readPlatform: () => Utils.detectPlatform(),
    readLanguage: () => I18n.getCurrentLanguage(),
    translate: (...args) => I18n.t(...args),
    copyText: (text) => navigator.clipboard.writeText(text),
    openLink: (url, target) => window.open(url, target),
    scheduleTimeout: (callback, delay) => setTimeout(callback, delay),
    notifySuccess: (message) => Toast.success(message),
    notifyError: (message) => Toast.error(message),
  });

  const formatSettingsPresetDate = (value) =>
    formatSettingsPresetTimestamp(value, readSettingsLanguage);

  const settingsPresetsStore = createSettingsPresetsStore({
    readItem: (key) => StorageManager.getItem(key),
    writeItem: (key, value) => StorageManager.setItem(key, value),
    readVisualSettings: () => CONFIG.visual,
    isInterfaceLanguageAvailable: (code) => I18n.getAvailableLanguages().some(language => language.code === code),
    applyVisualSettings: saveVisualSettings,
    onApplied: entries => publishAppliedSettingsPreset(entries, {
      setInterfaceLanguage: setSettingsLanguage,
      applySpeakerColors: () => readSpeakerColors()?.applyCssVariables?.(),
      publishConfigChange: publishSettingsConfigChange,
      refreshLyrics: updateLyrics,
      publishEvent: publishSettingsEvent,
      loadFont: (value) => loadSettingsFontFamily(document, value, { refreshExisting: false }),
    }),
    randomUUID: () => window.crypto?.randomUUID?.(),
  });

  const ConfigSettingsPresets = createSettingsPresetsPanel({
    react,
    store: settingsPresetsStore,
    translate: (key) => I18n.t(key),
    confirm: (message) => window.confirm(message),
    notifyError: (message) => Toast?.error?.(message),
    notifySuccess: (message) => Toast?.success?.(message),
    reloadSettings: (options) => queueReloadIntoIvLyrics(options),
    formatSettingsPresetDate,
  });

  const ConfigCloudSync = createSettingsCloudSyncPanel({
    react, translate: (key) => I18n.t(key),
    listenForAccountChange,
    isClosing: () => !isSettingsModalOpen(window),
    account: {
      getAuthToken: () => Utils.getAuthToken(),
      captureAccountSession: () => Utils.captureAccountSession(),
      isAccountSessionCurrent: (session) => Utils.isAccountSessionCurrent(session),
      isDiscordUserHash: (id) => Utils.isDiscordUserHash(id),
      setCachedDiscordSupportTier: (...args) => Utils.setCachedDiscordSupportTier(...args),
      fetchDiscordSupportTier: (...args) => Utils.fetchDiscordSupportTier(...args),
      fetchCloudSettings: (options) => Utils.fetchCloudSettings(options),
      saveCloudSettings: (...args) => Utils.saveCloudSettings(...args),
      deleteCloudSettings: (options) => Utils.deleteCloudSettings(options),
    },
    confirm: (message) => window.confirm(message),
    notifyError: (message) => Toast?.error?.(message),
    exportConfig: () => StorageManager.exportCloudConfig(),
    importConfig: (settings, beforeApply) => StorageManager.importCloudConfig(settings, beforeApply),
    reloadSettings: (options) => queueReloadIntoIvLyrics(options),
    formatSettingsPresetDate,
  });

  const openSettingsHelperDownload = () => window.open("https://ivlis.kr/ivLyrics/extensions/#helper", "_blank");
  const { VideoHelperToggle, LyricsHelperToggle } = createSettingsHelperToggles({
    react, translate: (key) => I18n.t(key),
    getCheckIcon: () => Spicetify.SVGIcons.check,
    getVideoHelper: readVideoHelper,
    getLyricsHelper: getSettingsLyricsHelper,
    isSettingsOpen: () => document.querySelector("#ivLyrics-config-container")
      || document.querySelector("#ivLyrics-settings-overlay"),
    openDownload: openSettingsHelperDownload,
    onSaveError: () => Toast?.error?.(I18n.t("messages.error")),
    listenForLyricsHelperConnection: (listener) => {
      window.addEventListener("ivLyrics:lyrics-helper-connection", listener);
      return () => window.removeEventListener("ivLyrics:lyrics-helper-connection", listener);
    },
    scheduleCheck: (callback, delay) => setInterval(callback, delay),
    cancelCheck: (timer) => clearInterval(timer),
  });

  const ConfigKaraokeFillCurveEditor = createSettingsKaraokeFillCurveEditor({
    react, host: window, isSettingChanged: (key) => isSettingChanged(key),
    getSettingsText: (key, fallback) => getSettingsText(key, fallback),
  });

  const { ConfigHotkey, ConfigKeyList, SettingsHotkeyTable } = createSettingsHotkeyControls({
    react, host: window, getSettingsText: (key, fallback) => getSettingsText(key, fallback),
    isSettingChanged: (key) => isSettingChanged(key), translate: (key) => I18n.t(key),
  });

  const settingsInputContext = {
    react,
    SettingsUiIcon,
    translate: (...args) => I18n.t(...args),
    getSettingsText: (key, fallback) => getSettingsText(key, fallback),
    isSettingChanged: (key) => isSettingChanged(key),
    onSaveError: () => Toast?.error?.(I18n.t("messages.error")),
  };

  const {
    ConfigSliderRange, ConfigFontWeightSlider, SettingsStepper, SettingsScrubField,
  } = createSettingsNumericControls({
    ...settingsInputContext,
    host: window,
    getDocument: () => document,
    getLanguage: readSettingsLanguage,
    settingValuesEqual: (first, second) => settingValuesEqual(first, second),
    hasSettingDefault,
    getSettingDefaultValue,
  });
  const { ConfigButton, ConfigSlider, ConfigWarning, ConfigInfo, ConfigInput } = createSettingsTextControls({
    ...settingsInputContext,
    getCheckIcon: () => Spicetify.SVGIcons.check,
  });
  const SettingsBackupButton = createSettingsBackupButton({ react, ConfigButton, actions: backupActions });
  const SettingsUpdateButton = createSettingsUpdateButton({
    react, ConfigButton, translate: settingsInputContext.translate, checkForUpdates: () => Utils.checkForUpdates(),
  });
  const { SettingsSegmented, SettingsChoiceCards, ConfigSelection } = createSettingsChoiceControls({
    ...settingsInputContext, SettingsStepper,
  });
  const { ConfigColorControl, ConfigColorPicker, ColorPresetSelector } = createSettingsColorControls(settingsInputContext);
  const { SettingsFontPicker, ConfigFontSelector } = createSettingsFontControls(settingsInputContext);
  const { createTextOutlineSettingItems, buildLyricsTypographyColumns, getLyricsTypographyRows } =
    createSettingsTypographyControls({
      readVisualSettings: () => CONFIG.visual,
      translate: (...args) => I18n.t(...args),
      getSettingsText: (key, fallback) => getSettingsText(key, fallback),
      controls: { ConfigSliderRange, ConfigColorPicker, ConfigFontSelector, ConfigFontWeightSlider, ConfigSelection },
    });
  const { SettingsInterludeIndicator, getInstrumentalBreakLabelStyleDefault, ConfigInstrumentalBreakIconPicker } =
    createSettingsInterludeControls({
      react, readVisualSettings: () => CONFIG?.visual, translate: key => I18n.t(key),
      isSettingChanged: key => isSettingChanged(key),
    });
  const { ConfigMultiVocalColorSettings, getMultiVocalRegistryItems } = createSettingsMultiVocalColors({
    react, ConfigColorControl, ConfigColorPicker, translate: key => I18n.t(key), toast: Toast,
    readSpeakerColors, readVisualSettings: () => CONFIG.visual,
    saveVisualSetting,
    resetVisualSettings: values => saveVisualSettings(values, () => StorageManager.resetConfigs(Object.keys(values))),
    applyColorChange: visualSettingsActions.refreshAndPublishSetting,
    useSettingsConfigRevision: () => useSettingsConfigRevision(),
    onSaveError: settingsInputContext.onSaveError,
  });
  const loadGoogleFontFamily = (fontFamily) => loadSettingsFontFamily(document, fontFamily);

  const { handleSettingsToggleRowPointerDown, handleSettingsToggleRowClick } =
    createSettingsToggleRowInteractions(() => window.getSelection?.());

  const OptionList = createSettingsOptionList({
    ...settingsInputContext,
    controls: { ConfigSlider, ConfigFontWeightSlider, ConfigSliderRange, ConfigSelection, ConfigColorPicker, ColorPresetSelector },
    ownRowControls: [
      ConfigButton, SettingsBackupButton, SettingsUpdateButton, ConfigInput, ConfigHotkey, ConfigWarning, ConfigInfo, ConfigKeyList, ConfigFontSelector,
      ConfigInstrumentalBreakIconPicker, ConfigKaraokeFillCurveEditor, VideoHelperToggle, LyricsHelperToggle,
    ],
    readVisualSettings: () => CONFIG.visual,
    hasSettingDefault,
    getSettingDefaultValue,
    listenForSettings: subscribeSettingsConfig,
    publishSettingsRefresh,
    handleSettingsToggleRowPointerDown,
    handleSettingsToggleRowClick,
  });

  const getEffectiveReducedMotionPreference = () =>
    CONFIG.visual["reduce-motion"] === true;

  const saveSettingsTranslationTargetLanguage = (name, value) => {
    if (settingValuesEqual(CONFIG.visual[name], value)) return;
    saveVisualSetting(name, value);
    publishSettingsConfigChange(name, value);
  };

  const getSettingsMotionDurationMs = () =>
    getEffectiveReducedMotionPreference() ? 24 : 280;

  const getSettingsText = (key, fallback) => {
    const value = I18n?.t?.(key);
    return !value || value === key ? fallback : value;
  };

  // ---------------------------------------------------------------------------
  // Settings window design system
  // ---------------------------------------------------------------------------

  // Stored values mix numbers and numeric strings ("100" / 100), booleans and
  // "true"/"false", and upper/lower case colors; compare what the user sees.
  const normalizeSettingComparable = (value) => {
    if (value === undefined || value === null) return "";
    if (typeof value === "boolean") return value ? "true" : "false";
    if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
    const text = String(value).trim();
    if (/^#[0-9a-f]{3,8}$/i.test(text)) return text.toLowerCase();
    if (/^-?(?:\d+\.?\d*|\.\d+)$/.test(text)) return String(Number(text));
    return text;
  };

  const settingValuesEqual = (first, second) =>
    normalizeSettingComparable(first) === normalizeSettingComparable(second);

  const getCurrentSettingValue = (key) => {
    if (key === SETTINGS_BACKGROUND_MODE_KEY) return getCurrentSettingsBackgroundMode();
    const value = CONFIG?.visual?.[key];
    return value === undefined ? getSettingDefaultValue(key) : value;
  };

  const isSettingChanged = (key) => {
    if (key === SETTINGS_BACKGROUND_MODE_KEY) {
      return getCurrentSettingsBackgroundMode() !== SETTINGS_DEFAULT_BACKGROUND_MODE;
    }
    if (!hasSettingDefault(key)) return false;
    return !settingValuesEqual(getCurrentSettingValue(key), getSettingDefaultValue(key));
  };

  const SETTINGS_UI_ICON_PATHS = Object.freeze({
    search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm9 16-4.35-4.35",
    close: "M6 6l12 12M18 6 6 18",
    right: "m9 6 6 6-6 6",
    left: "m15 6-6 6 6 6",
    down: "m6 9 6 6 6-6",
    up: "m6 15 6-6 6 6",
    reset: "M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4",
    check: "m5 12.5 4.5 4.5L19 7.5",
    grip: "M9 6.5h.01M15 6.5h.01M9 12h.01M15 12h.01M9 17.5h.01M15 17.5h.01",
    info: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 5v.01M11 11.5h1v5h1",
    warn: "M12 9v4m0 3.5v.01M10.3 3.9 1.9 18a2 2 0 0 0 1.7 3h16.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z",
    sun: "M12 3v1.5M12 19.5V21M4.6 4.6l1.1 1.1M18.3 18.3l1.1 1.1M3 12h1.5M19.5 12H21M4.6 19.4l1.1-1.1M18.3 5.7l1.1-1.1M12 7.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9Z",
    moon: "M20.5 13.2A8.5 8.5 0 1 1 10.8 3.5a6.6 6.6 0 0 0 9.7 9.7Z",
    dot: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 6a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z",
    dock: "M4 5h16v14H4zM15 5v14",
    plus: "M12 5v14M5 12h14",
    minus: "M5 12h14",
    external: "M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
    alignLeft: "M4 6h16M4 10h10M4 14h16M4 18h10",
    alignCenter: "M4 6h16M7 10h10M4 14h16M7 18h10",
    alignRight: "M4 6h16M10 10h10M4 14h16M10 18h10",
    layers: "M12 3 2.5 8 12 13l9.5-5L12 3ZM2.5 13 12 18l9.5-5",
    clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4.5V12l3 2",
    context: "M4 6.5h16v11H4zM8 10.5h8M8 13.5h5",
    next: "M5 6v12l9-6-9-6ZM18 6v12",
    controls: "M6.5 9v6M17.5 9v6M10 8.5v7l5-3.5-5-3.5Z",
    lprogress: "M7 4v16M11 8h7M11 12h5M11 16h7",
    queue: "M4 6h11M4 11h11M4 16h7M17 13v7l4-2.5",
    github: "M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21",
    discord: "M8.5 11.5h.01M15.5 11.5h.01M7 6.5c1.5-.7 3-1 5-1s3.5.3 5 1c1.6 2.7 2.3 5.5 2 9-1.4 1.1-2.8 1.8-4.2 2.1l-.9-1.6c-.7.2-1.3.3-1.9.3s-1.2-.1-1.9-.3l-.9 1.6C7.8 17.3 6.4 16.6 5 15.5c-.3-3.5.4-6.3 2-9Z",
    coffee: "M5 9h11v5a5 5 0 0 1-5 5H10a5 5 0 0 1-5-5V9Zm11 1h1.5a2.5 2.5 0 0 1 0 5H16M8 3v3M11 3v3",
  });

  function SettingsUiIcon({ name, className = "", size = 16 }) {
    return react.createElement("svg", {
      className: `settings-ui-icon${className ? ` ${className}` : ""}`,
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 1.6,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      "aria-hidden": "true",
      focusable: "false",
    }, react.createElement("path", { d: SETTINGS_UI_ICON_PATHS[name] || SETTINGS_UI_ICON_PATHS.dot }));
  }

  const translateProviderSettings = (key) => I18n.t(key);
  const providerSettingsListView = createSettingsProviderListView({ react, translate: translateProviderSettings });
  const { AddonSettingsCard, LyricsProviderCard } = createSettingsProviderCards({
    react, translate: translateProviderSettings, getSettingsText, SettingsUiIcon,
    readAiManager: readAiSettingsManager,
    readLyricsManager: readLyricsSettingsManager,
    readAiLanguage: () => Spicetify.LocalStorage.get("ivLyrics:visual:language"),
    readLyricsLanguage: () => StorageManager.getItem("ivLyrics:visual:language"),
    readCurrentLanguage: readSettingsLanguage,
  });
  const LyricsProvidersTab = createSettingsLyricsProviderTab({
    react, translate: translateProviderSettings, readManager: readLyricsSettingsManager,
    schedule: (callback, delay) => setTimeout(callback, delay),
    cancel: (id) => clearTimeout(id),
    getVisualSettings: () => CONFIG.visual,
    saveSetting: (name, value) => StorageManager.saveConfig(name, value),
    notifyConfigChange: publishSettingsConfigChange,
    listView: providerSettingsListView, LyricsProviderCard, OptionList, ConfigSlider,
  });
  const AIProvidersTab = createSettingsAiProviderTab({
    react, translate: translateProviderSettings, readManager: readAiSettingsManager,
    schedule: (callback, delay) => setTimeout(callback, delay),
    cancel: (id) => clearTimeout(id),
    requestFrame: (callback) => window.requestAnimationFrame?.(callback),
    findConnectionCard: (id) => document.getElementById?.(`ivlyrics-ai-connection-${id}`),
    listView: providerSettingsListView, AddonSettingsCard, OptionList, ConfigSliderRange,
  });

  const settingsSignalHost = {
    host: window,
    requestFrame: (callback) => requestAnimationFrame(callback),
    cancelFrame: (id) => cancelAnimationFrame(id),
  };
  const useSettingsConfigRevision = (previewEvent = null) =>
    useSettingsConfigSignal(react, settingsSignalHost, previewEvent);

  const SettingsSection = ({ sectionKey, title, subtitle, view, hidden, className = "", children }) =>
    renderSettingsSectionShell(react, {
      sectionKey,
      title,
      subtitle,
      view,
      hidden,
      className,
      children,
    });
  const SettingsWordmark = () => react.createElement(
    "h1",
    { className: "settings-wordmark", "aria-label": "ivLyrics", lang: "en", dir: "ltr" },
    react.createElement("span", { className: "settings-wordmark-iv", "aria-hidden": "true" }, "iv"),
    react.createElement("span", { className: "settings-wordmark-lyrics", "aria-hidden": "true" }, "Lyrics")
  );

  const SettingsCrumbs = ({ menuLabel, sections, signal }) => {
    const activeKey = useSettingsSignal(react, signal);
    const section = (sections || []).find((candidate) => candidate.key === activeKey);
    return react.createElement(
      "div",
      { className: "settings-crumbs" },
      react.createElement("span", null, menuLabel),
      section ? react.createElement(SettingsUiIcon, { name: "right", size: 12 }) : null,
      section ? react.createElement("span", null, section.label) : null
    );
  };

  const SettingsToc = createSettingsSectionNavigation({
    react, document, ...settingsSignalHost, getTime: () => performance.now(),
    getComputedStyle: (element) => getComputedStyle(element),
    observeResize: (callback) => typeof ResizeObserver === "function" ? new ResizeObserver(callback) : null,
  });

  const getSettingsPreviewNumber = (key, fallback) => readSettingNumber(CONFIG.visual, key, fallback);
  const getSettingsPreviewFlag = (key, fallback) => readSettingFlag(CONFIG.visual, key, fallback);

  const { SettingsLyricsPreview, syncSettingsLyricsPreviewStyles } = createSettingsLyricsPreview({
    react,
    getVisualSettings: () => CONFIG.visual,
    translate: key => I18n.t(key),
    getSettingsText,
    useSettingsConfigRevision,
    applyFurigana: text => Utils.applyFuriganaIfEnabled(text),
    getBackgroundMode: () => getCurrentSettingsBackgroundMode(),
    getBackgroundPreset: mode => SETTINGS_BACKGROUND_PRESETS.find(candidate => candidate.id === mode),
    normalizeHexColor: value => normalizeSettingsHexColor(value),
    getKaraokeLine: readKaraokeLine,
    InterludeIndicator: SettingsInterludeIndicator,
    getDocument: () => document,
  });

  const NowPlayingPanelPreview = createSettingsPanelPreview({
    react,
    getVisualSettings: () => CONFIG.visual,
    translate: key => I18n.t(key),
    useSettingsConfigRevision,
    getSupplementVisibility: () => getSettingsPreviewSupplementVisibility(CONFIG.visual),
  });

  const { SettingsCdDiscPreview, SettingsFullscreenPreview } = createSettingsFullscreenPreview({
    react,
    getVisual: () => CONFIG.visual,
    useSettingsConfigRevision,
    getCurrentSettingsBackgroundMode: () => getCurrentSettingsBackgroundMode(),
    normalizeSettingsHexColor: value => normalizeSettingsHexColor(value),
  });

  const SettingsLayerMatrix = createSettingsLayerMatrix({
    react, host: window, useSettingsConfigRevision, getVisualSettings: () => CONFIG.visual,
    getControls: () => ({
      ConfigFontSelector, SettingsFontPicker, ConfigFontWeightSlider, SettingsScrubField, ConfigSliderRange,
      ConfigColorPicker, ConfigSelection, ConfigSlider, SettingsSegmented, OptionList, SettingsUiIcon,
    }),
    getSettingsText,
    getSettingDefaultValue: (key) => getSettingDefaultValue(key),
    hasSettingDefault: (key) => hasSettingDefault(key),
    isSettingChanged,
    publishSettingsRefresh,
    onSaveError: settingsInputContext.onSaveError,
  });

  const { SettingsLineWindow, SettingsTiles } = createSettingsLayoutControls({
    react, useSettingsConfigRevision, getVisualSettings: () => CONFIG.visual,
    getSettingsStepper: () => SettingsStepper,
    getSettingsText, isSettingChanged, SettingsUiIcon, OptionList,
  });

  const { getPerformanceSettingsSections, SettingsLoadMeter } = createSettingsPerformanceControls({
    react, translate: key => I18n.t(key), getSettingsText,
    readVisualSettings: () => CONFIG.visual, useSettingsConfigRevision,
    getSettingsPreviewFlag, getSettingsPreviewNumber, controls: { ConfigSlider, ConfigSliderRange, ConfigButton },
  });
  const getCdSettingsSections = createCdSettingsCatalog({
    react, translate: key => I18n.t(key), readVisualSettings: () => CONFIG.visual,
    getSettingsPreviewFlag, SettingsCdDiscPreview,
    components: { ConfigSlider, ConfigSliderRange, ConfigSelection, ConfigColorPicker },
  });
  const getCanonicalSettingsDestination = createSettingsDestinationResolver(getPerformanceSettingsSections);

  const SettingsDock = createSettingsPreviewDock({
    react, getSettingsText, SettingsUiIcon, SettingsLyricsPreview, NowPlayingPanelPreview, SettingsFullscreenPreview,
  });

  const SETTINGS_UI_THEME_STORAGE_KEY = "ivLyrics:settings-ui-theme";

  const settingsUiTheme = createSettingsUiTheme({
    readTheme: () => getStoragePersistence()?.getItem(SETTINGS_UI_THEME_STORAGE_KEY)
      ?? localStorage.getItem(SETTINGS_UI_THEME_STORAGE_KEY),
    matchMedia: (query) => window.matchMedia?.(query),
    getAppliedColorScheme: () => window.Spicetify?.Config?.color_scheme,
    getRootComputedStyle: () => window.getComputedStyle?.(document.documentElement),
  });

  const { getSettingsUiTheme, resolveEffectiveSettingsUiTheme } = settingsUiTheme;
  publishSettingsThemeCompatibility(settingsUiTheme);

  const persistSettingsUiTheme = (theme) => {
    const persistence = getStoragePersistence();
    if (persistence) {
      persistence.setItem(SETTINGS_UI_THEME_STORAGE_KEY, theme);
    } else {
      localStorage.setItem(SETTINGS_UI_THEME_STORAGE_KEY, theme);
    }
  };

  const FullscreenPresentationPicker = createFullscreenPresentationPicker({ react, getSettingsText });

  const getCurrentSettingsBackgroundMode = () => resolveSettingsBackgroundMode(CONFIG.visual);

  publishSettingsBackgroundCompatibility(
    SETTINGS_BACKGROUND_PRESETS,
    (modeId) => getSettingsBackgroundPresetLabel(modeId, getSettingsText),
    getCurrentSettingsBackgroundMode,
  );

  const applySettingsMotionClasses = () => {
    const reduceMotion = getEffectiveReducedMotionPreference();
    document
      .getElementById("ivLyrics-settings-overlay")
      ?.classList.toggle("motion-reduced", reduceMotion);
    document
      .getElementById(`${APP_NAME}-config-container`)
      ?.classList.toggle("motion-reduced", reduceMotion);
  };

  const ConfigModal = ({
    onRequestClose = () => {},
    onContentReady,
    initialTab: requestedInitialTab = "general",
    initialSettingKey: requestedInitialSettingKey = null,
  }) => {
    const { tabId: initialTab, settingKey: initialSettingKey } =
      getCanonicalSettingsDestination(requestedInitialTab, requestedInitialSettingKey);
    const navigation = useSettingsTabNavigation(react, {
      host: window, initialTab, initialSettingKey,
      prefersReducedMotion: getEffectiveReducedMotionPreference,
      getCanonicalSettingsDestination,
      isCdSettingsKey,
    });
    const {
      activeTab, changedView, fullscreenView, settingsContentRef,
      activeSectionSignal, navigateToDestination,
    } = navigation;
    const shouldReduceMotion = getEffectiveReducedMotionPreference();
    // Light or dark only. getSettingsUiTheme settles an older "auto" choice
    // from the system/Spotify theme once; the effect below stores the result.
    const [uiTheme, setUiTheme] = react.useState(getSettingsUiTheme);
    const uiThemePreference = uiTheme;

    react.useEffect(() => {
      persistSettingsUiTheme(uiTheme);
    }, [uiTheme]);

    react.useEffect(() => {
      const overlay = document.getElementById("ivLyrics-settings-overlay");
      overlay?.setAttribute("data-ui-theme", uiTheme);
      overlay?.setAttribute("data-ui-theme-preference", uiThemePreference);
    }, [uiTheme, uiThemePreference]);

    const interfaceLanguage = useSettingsInterfaceLanguage(react, window, readSettingsLanguage);
    const settingsCatalog = react.useMemo(() => ({ registry: null, searchIndex: null }), [interfaceLanguage]);
    const search = useSettingsModalSearch(react, {
      host: window, document, activeTab, changedView, settingsContentRef, interfaceLanguage,
      getPerformanceSettingsSections, getCdSettingsSections, getSettingsText,
      translate: (key) => I18n.t(key),
      getAllTranslations: (key) => I18n.getAllTranslations?.(key),
      getDeclaredSearchIndex, navigateToDestination,
      SettingsUiIcon, SettingsOutlineIcon,
    });

    // Initialize line-spacing if not set
    if (CONFIG.visual["line-spacing"] === undefined) {
      CONFIG.visual["line-spacing"] = 8;
    }

    // FAD (Full Screen) 확장 프로그램 감지
    const isFadActive = react.useMemo(() => {
      return !!document.getElementById("fad-ivLyrics-container");
    }, []);

    react.useEffect(() => {
      loadStoredSettingsFonts(document, CONFIG.visual, createRuntimeDebugLogger(window));
    }, []);

    // 외관 탭으로 전환될 때 미리보기 폰트 강제 업데이트
    react.useEffect(() => {
      if (activeTab === "appearance") {
        writeRuntimeDebug(window,
          `[ivLyrics] Appearance tab activated, updating lyrics preview`
        );
        const frameId = requestAnimationFrame(syncSettingsLyricsPreviewStyles);
        return () => cancelAnimationFrame(frameId);
      }
    }, [activeTab, uiTheme]);

    useSettingsReleaseNotes(react, {
      activeTab, uiTheme,
      findContainer: () => document.getElementById("patch-notes-container"),
      request: (...args) => fetch(...args),
      translate: (key) => I18n.t(key),
      escapeHtml: (value) => Utils.escapeHtml(value),
      escapeAttribute: (value) => Utils.escapeAttribute(value),
      sanitizeHttpUrl: (url) => Utils.sanitizeHttpUrl(url),
      renderMarkdown: (...args) => Utils.renderSafeMarkdownToHTML(...args),
      schedule: (callback, delay) => setTimeout(callback, delay),
      cancel: (timer) => clearTimeout(timer),
      reportError: (...args) => console.error(...args),
    });

    const menus = createSettingsMenuMetadata(activeTab, key => I18n.t(key), getSettingsText);
    const { activeTabMeta, sidebarTabs } = menus;

    const rootRef = react.useRef(null);
    const attachSettingsRoot = react.useCallback((node) => {
      rootRef.current = node;
      if (node) onContentReady?.();
    }, [onContentReady]);
    const { dockOpen, toggleDock } = useSettingsDockPreferences(react, { activeTab, changedView, getStorage: () => localStorage });

    useSettingsModalInteractions(react, {
      host: window, document, rootRef, searchBoxRef: search.searchBoxRef, setSearchPanelOpen: search.setSearchPanelOpen,
    });

    const { settingsRegistry, changedCounts } = useChangedSettingsCounts(react, {
      host: window, readSettingsRegistry, isSettingChanged, isChangedView: changedView, interfaceLanguage,
    });

    const changedViewTitle = getSettingsText("settingsUi.changed.title", "Changed settings");

    const { renderHeaderSection, renderRail, renderPageHead } = createSettingsModalChrome(react, {
      appName: APP_NAME,
      translate: key => I18n.t(key),
      getSettingsText,
      readVersions: () => ({
        spicetifyVersion: window.Spicetify?.Config?.version,
        spotifyVersion: window.Spicetify?.Platform?.version,
        appVersion: Utils.currentVersion,
      }),
      components: { SettingsWordmark, SettingsCrumbs, SettingsUiIcon, SettingsOutlineIcon,
        SettingsSegmented, SettingsToc, handleSettingsRadioKeys },
      menus, navigation,
      search,
      uiTheme, setUiTheme, changedCounts, changedViewTitle, settingsRegistry, onRequestClose,
    });

    const { getBackgroundRegistryItems, BackgroundExperienceSection, handlePerformanceSettingChange } =
      useSettingsBackgroundTab({
        react, translate: (...args) => I18n.t(...args), getSettingsText,
        getVisualSettings: () => CONFIG.visual,
        saveVisualSetting, saveVisualSettings,
        updatePreviewStyles: syncSettingsLyricsPreviewStyles,
        refreshLyrics: () => refreshPageFromSettings(window),
        publishConfig: publishSettingsConfigChange,
        subscribeConfig: subscribeSettingsConfig,
        openHelperDownload: () => window.open("https://ivlis.kr/ivLyrics/extensions/#helper", "_blank"),
        applyMotionClasses: applySettingsMotionClasses,
        backgroundPresets: SETTINGS_BACKGROUND_PRESETS,
        getCurrentSettingsBackgroundMode, useSettingsConfigRevision, isFadActive,
        controls: {
          ConfigSliderRange, ColorPresetSelector, ConfigWarning, ConfigSelection, VideoHelperToggle,
          ConfigInfo, ConfigSlider, SettingsChoiceCards, OptionList,
        },
      });

    const {
      saveLyricsTypographySetting,
      saveVinylSetting,
      handleVisualConfigChange,
      handleAppearancePreviewChange,
      handleNowPlayingPanelChange,
      changeInterfaceLanguage,
      saveLyricsHelperSetting,
      saveInstrumentalLabelSetting,
    } = createSettingsSaveEffects({
      visualSettingsActions, persistConfig,
      persistVisualSetting: (name, value) => StorageManager.setItem(`${APP_NAME}:visual:${name}`, value),
      updatePreviewStyles: () => syncSettingsLyricsPreviewStyles(),
      loadFont: (value) => loadGoogleFontFamily(value),
      publishConfigChange: publishSettingsConfigChange,
      publishEvent: publishSettingsEvent,
      setInterfaceLanguage: setSettingsLanguage,
      reopenLanguageSettings: () => queueReloadIntoIvLyrics({ reopenSettings: true, initialTab: "general" }),
    });
    const renderTabContent = createSettingsTabContent({
      react, translate: key => I18n.t(key), activeTab, fullscreenView, isFadActive,
      getSettingsText, getVisualSettings: () => CONFIG.visual,
      playback: {
        getAvailableLanguages: () => I18n.getAvailableLanguages(),
        changeInterfaceLanguage, saveSettingsTranslationTargetLanguage, getPerformanceSettingsSections,
        navigateToDestination, handlePerformanceSettingChange,
        openLyricsHelperDownload: openSettingsHelperDownload, saveLyricsHelperSetting,
      },
      visuals: {
        createTextOutlineSettingItems, saveVinylSetting, handleNowPlayingPanelChange,
        getInstrumentalBreakLabelStyleDefault, saveInstrumentalLabelSetting, getMultiVocalRegistryItems,
        getBackgroundRegistryItems, buildLyricsTypographyColumns, saveLyricsTypographySetting,
        handleAppearancePreviewChange, getLyricsTypographyRows, handleVisualConfigChange, getCdSettingsSections,
      },
      advanced: { thresholdSizeLimit, backupActions },
      about: {
        getCurrentVersion: () => Utils.currentVersion,
        openUpdaterProtocol: action => Utils.openUpdaterProtocol(action),
        readClientId: () => Spicetify.LocalStorage.get("ivLyrics:user-hash"),
        copyText: text => window.navigator.clipboard.writeText(text),
        openLink: (url, target) => window.open(url, target),
        notifySuccess: message => Toast.success(message),
        notifyError: message => Toast.error(message),
      },
      controls: {
        SettingsSection, OptionList, ConfigSelection, OverlaySettings, SettingsLoadMeter, ConfigSlider,
        ConfigKaraokeFillCurveEditor, SettingsHotkeyTable, ConfigHotkey, ConfigSliderRange, LocalCacheManager,
        LyricsHelperToggle, ConfigInfo, LyricsProvidersTab, ConfigFontSelector, ConfigFontWeightSlider,
        SettingsLayerMatrix, AIProvidersTab, SettingsUiIcon, DebugInfoPanel, ConfigColorPicker,
        ConfigInstrumentalBreakIconPicker, BackgroundExperienceSection, SettingsLineWindow,
        ConfigMultiVocalColorSettings, SettingsBackupButton, ConfigCloudSync, ConfigSettingsPresets,
        SettingsTiles, FullscreenPresentationPicker, ConfigButton, SettingsUpdateButton, AccountSection,
      },
    });

    // Use the same controls and save handlers for menus, search and reset.
    function buildSettingsRegistry(tabs = sidebarTabs) {
      return collectSettingsRegistry({
        sidebarTabs: tabs, renderTabContent, SettingsSection, OptionList, SettingsLayerMatrix, ConfigSlider,
        backgroundModeKey: SETTINGS_BACKGROUND_MODE_KEY,
        hasSettingDefault, getCanonicalSettingsDestination,
        onRenderError: (tabId, error) => console.warn("[ivLyrics] settings registry skipped", tabId, error),
      });
    }

    function readSettingsRegistry() {
      return settingsCatalog.registry ??= buildSettingsRegistry();
    }

    function getDeclaredSearchIndex() {
      return settingsCatalog.searchIndex ??= indexSettingsSearch(sidebarTabs, readSettingsRegistry());
    }

    const changedSettings = createChangedSettingsView(react, {
      sidebarTabs, readSettingsRegistry, buildSettingsRegistry, navigateToDestination,
      confirmReset: message => window.confirm(message),
      publishReset: () => publishSettingsEvent("ivLyrics:settings-refresh", { reset: true }),
      isSettingChanged, getSettingsText, getCurrentSettingsBackgroundMode,
      SettingsUiIcon, SettingsOutlineIcon, OptionList, onSaveError: settingsInputContext.onSaveError,
    });

    return react.createElement(
      "div",
      {
        id: `${APP_NAME}-config-container`,
        ref: attachSettingsRoot,
        className: `settings-app${shouldReduceMotion ? " motion-reduced" : ""}`,
        "data-ui-theme": uiTheme,
        "data-ui-theme-preference": uiThemePreference,
      },
      react.createElement("style", {
        dangerouslySetInnerHTML: {
          __html: SETTINGS_MODAL_CSS,
        },
      }),
      renderHeaderSection(),
      react.createElement(
        "div",
        { className: "settings-body" },
        renderRail(),
        react.createElement(
          "main",
          {
            className: "settings-content",
            ref: settingsContentRef,
            tabIndex: -1,
            "aria-label": changedView ? changedViewTitle : activeTabMeta.label,
          },
          react.createElement(
            "div",
            { className: "settings-page" },
            renderPageHead(),
            changedView ? changedSettings.renderChangedView() : renderTabContent(activeTab)
          )
        ),
        react.createElement(SettingsDock, {
          open: dockOpen,
          onToggle: toggleDock,
          menu: activeTab,
          signal: activeSectionSignal,
          fullscreenView,
          onNavigate: navigateToDestination,
        })
      )
    );
  };

  function openConfig(options = {}) {
    const { initialTab = "general", initialSettingKey = null } = options || {};
    mountSettingsModal({
      host: window,
      getRenderer: readReactDom,
      renderContent(onRequestClose, onContentReady, onError) {
        const content = react.createElement(ConfigModal, { onRequestClose, onContentReady, initialTab, initialSettingKey });
        if (!onError) return content;
        const ErrorBoundary = createReactMountBoundary(react);
        return react.createElement(ErrorBoundary, { onError }, content);
      },
      isReducedMotion: getEffectiveReducedMotionPreference,
      getCloseDuration: getSettingsMotionDurationMs,
      isEditableField: isSettingsEditableField,
    });
  }

  function queueReloadIntoIvLyrics(options = {}) {
    const {
      reopenSettings = false,
      initialTab = "general",
      initialSettingKey = null,
      delay = 0,
    } = options;

    requestAppRouteReload({
      host: window,
      getHistory: () => Spicetify?.Platform?.History,
      settingsReturn: reopenSettings
        ? () => isSettingsModalOpen(window) && { initialTab, initialSettingKey }
        : undefined,
      delay,
    });
  }

  registerSettingsModalOpen(window, openConfig);

  restoreSettingsOnFirstLyricsMount(window, openConfig);

  return {
    openConfig,
    ConfigButton,
    ConfigSlider,
    getSettingsMotionDurationMs,
  };
}
