import { createRuntimeDebugLogger } from "#ivlyrics/spicetify/runtimeDebug.mjs";
import { getTrackOverrideStores } from "#ivlyrics/core/trackOverrideRuntime.mjs";
import { createOptionsDropdown } from "#ivlyrics/app/modal/createOptionsDropdown.mjs";
import { createOptionsDialog } from "#ivlyrics/app/modal/createOptionsDialog.mjs";
import { createToolbarFlyout } from "#ivlyrics/app/toolbar/toolbarFlyout.mjs";
import { createToolbarTranslationMenu } from "#ivlyrics/app/toolbar/toolbarTranslationMenu.mjs";
import { createToolbarTranslationPreferences } from "#ivlyrics/app/toolbar/toolbarTranslationPreferences.mjs";
import { getMountedLyricsPage as getToolbarLyricsPage } from "#ivlyrics/spicetify/lyricsPageEffects.mjs";
import { refreshLyricsPage as refreshPageFromToolbar } from "#ivlyrics/spicetify/lyricsPageActions.mjs";
import { createSyncAdjustmentControls } from "#ivlyrics/app/toolbar/sync/createSyncAdjustmentControls.mjs";
import { getTrackSyncOffsetStore } from "#ivlyrics/core/trackSyncOffsetRuntime.mjs";
import { formatSyncOffset } from "#ivlyrics/app/toolbar/sync/syncOffsetValues.mjs";
import { getRuntimeService as getMenuRuntimeService } from "#ivlyrics/spicetify/runtimeServices.mjs";
import { getSettingsModalClose } from "#ivlyrics/features/settings/settingsModalHost.mjs";
import { getSettingsSurfaceTheme } from "#ivlyrics/features/settings/settingsSurfaceTheme.mjs";
import { createFirstLanguagePrompt } from "#ivlyrics/app/modal/firstLanguagePrompt.mjs";
import { createToolbarIcon } from "#ivlyrics/app/toolbar/createToolbarIcon.mjs";
import { createToolbarTooltip } from "#ivlyrics/app/toolbar/createToolbarTooltip.mjs";
import { createToolbarControls } from "#ivlyrics/app/toolbar/createToolbarControls.mjs";
import { createToolbarRegeneration } from "#ivlyrics/app/toolbar/createToolbarRegeneration.mjs";
import { createToolbarDialogs } from "#ivlyrics/app/toolbar/createToolbarDialogs.mjs";
import { createToolbarActionMenus } from "#ivlyrics/app/toolbar/createToolbarActionMenus.mjs";
import { createToolbarPanelViews } from "#ivlyrics/app/toolbar/createToolbarPanelViews.mjs";
import { createFloatingLyricsToolbar } from "#ivlyrics/app/toolbar/createFloatingLyricsToolbar.mjs";

export function createOptionsMenu({
  react, host: window, document = window.document ?? globalThis.document, spicetify: Spicetify, i18n: I18n, utils: Utils, toast: Toast,
  appName: APP_NAME, config: CONFIG, storage: StorageManager,
  ConfigSlider, ConfigButton, CommunityVideoSelector, SyncDataCreator, getSettingsMotionDurationMs, openSettings,
}) {
  const translate = (...args) => I18n.t(...args);
  const readVisualSettings = () => CONFIG.visual;
  const notify = (type, message) => Toast[type](message);
  const debug = createRuntimeDebugLogger(window);

  const IvLyricsTooltip = createToolbarTooltip({ react, host: window, document });

  const OptionsMenu = createOptionsDropdown({
    react, host: window, document,
    readReactDom: () => Spicetify.ReactDOM,
    debug,
  });
  const { openOptionsModal, SettingRowDescription } = createOptionsDialog({
    react, OptionsMenu, ConfigSlider, ConfigButton,
  });

  const getOptionsText = (key, fallback) => {
    const value = I18n?.t?.(key);
    return value && value !== key ? value : fallback;
  };

  const IvLyricsToolbarIcon = createToolbarIcon(react);

  const controls = createToolbarControls({ react, IvLyricsToolbarIcon, formatSyncOffset });
  const {
    useToolbarControlId,
    ToolbarGlyph,
    ToolbarPanelSection,
    ToolbarPanelGroup,
    ToolbarPanelRow,
    ToolbarButton,
    ToolbarToggleRow,
    ToolbarSelect,
    ToolbarMenuList,
    ToolbarMenuItem,
    ToolbarOffsetSteps,
    ToolbarRangeField,
  } = controls;

  const ivLyricsFirstLanguagePrompt = createFirstLanguagePrompt({
    appName: APP_NAME,
    browser: window,
    document,
    getUiLanguage: () => I18n.getCurrentLanguage?.(),
    translate,
    applyModes(modeKey, pronunciationMode, translationMode) {
      CONFIG.visual[`translation-mode:${modeKey}`] = pronunciationMode;
      CONFIG.visual[`translation-mode-2:${modeKey}`] = translationMode;
      StorageManager.setItem(`${APP_NAME}:visual:translation-mode:${modeKey}`, pronunciationMode);
      StorageManager.setItem(`${APP_NAME}:visual:translation-mode-2:${modeKey}`, translationMode);
    },
  });

  const readToolbarLyricsManager = () => getMenuRuntimeService("LyricsAddonManager", window);

  // Opens the settings window on a tab (and section) from a toolbar panel. An
  // already open settings window is closed first, as the conversion dialog did.
  const openToolbarSettings = (options = {}) => {
    const overlay = document.getElementById("ivLyrics-settings-overlay");
    if (overlay) {
      const close = getSettingsModalClose(window);
      if (typeof close === "function") {
        close();
      } else {
        overlay.remove();
        document.documentElement.classList.remove("ivlyrics-settings-open");
        document.body?.classList.remove("ivlyrics-settings-open");
      }
    }
    setTimeout(() => {
      openSettings?.(options);
    }, overlay ? getSettingsMotionDurationMs() + 24 : 0);
  };

  const { openRegenerateTranslationChoiceModal, getRegenerateTranslationChoiceItems, RegenerateTranslationButton } = createToolbarRegeneration({
    react, translate, ConfigButton, SettingRowDescription, openOptionsModal, ToolbarButton, ToolbarGlyph, ToolbarPanelRow,
  });
  const TranslationMenu = createToolbarTranslationMenu({
    react,
    translate,
    readInterfaceLanguage: () => I18n.getCurrentLanguage(),
    getToolbarText: getOptionsText,
    getVisualSettings: readVisualSettings,
    preferences: createToolbarTranslationPreferences({
      getVisualSettings: readVisualSettings,
      readSetting: (key) => StorageManager.getItem(`${APP_NAME}:visual:${key}`),
      writeSetting: (key, value) => StorageManager.setItem(`${APP_NAME}:visual:${key}`, value),
      readCurrentTrackUri: () => Spicetify.Player.data?.item?.uri,
      readMountedPage: () => getToolbarLyricsPage(window),
      readTrackLanguageStore: () => getTrackOverrideStores(window).TrackLanguageDB,
      clearTrackSnapshot: (uri) => getMenuRuntimeService("LyricsService", window)?.clearLyricsSnapshot?.(uri),
      refreshLyrics: () => refreshPageFromToolbar(window),
      reportLanguageSaveError: error => {
        console.error("[ivLyrics] Failed to save track language:", error);
        notify("error", translate("messages.error"));
      },
    }),
    debug,
    ToolbarPanelSection, ToolbarPanelGroup, ToolbarToggleRow, ToolbarPanelRow, ToolbarSelect, ToolbarButton,
    RegenerateTranslationButton,
  });

  const dialogs = createToolbarDialogs({
    react, host: window, document, translate, notify, getOptionsText,
    readLyricsManager: readToolbarLyricsManager, readUtils: () => Utils, CommunityVideoSelector, SyncDataCreator,
  });
  const { openSyncDataCreator } = dialogs;
  const { CurrentTrackMenu, ToolbarMoreMenu, SyncDataCreatorButton, buildTrackBackgroundView, buildLyricsProviderView } = createToolbarActionMenus({
    react, host: window, translate, notify, getOptionsText, readVisualSettings, dialogs, ToolbarMenuItem, ToolbarMenuList,
    extractTrackId: trackUri => Utils.extractTrackId(trackUri),
    readProviders: () => readToolbarLyricsManager()?.getEnabledProviders?.() || [],
  });

  const { SyncAdjustButtonFluent, TrackSyncAdjustPill, useToolbarSyncOffsets } = createSyncAdjustmentControls({
    react,
    host: window,
    readUtils: () => Utils,
    readTrackOffsets: () => getTrackSyncOffsetStore(window),
    readCurrentTrackUri: () => Spicetify.Player.data?.item?.uri,
    translate,
    notify,
    controls: {
      ToolbarButton, IvLyricsToolbarIcon, ToolbarOffsetSteps, ToolbarPanelSection,
      ToolbarPanelGroup, ToolbarPanelRow, ToolbarRangeField, ToolbarToggleRow,
    },
  });

  const ToolbarFlyout = createToolbarFlyout({
    react, host: window, getOptionsText, translate,
    useToolbarControlId, ToolbarGlyph,
  });

  const buildPanelView = createToolbarPanelViews({
    react, translate, getOptionsText, controls, TranslationMenu, SyncAdjustButtonFluent,
    CurrentTrackMenu, ToolbarMoreMenu, buildLyricsProviderView, buildTrackBackgroundView,
  });
  const IvLyricsFloatingToolbar = createFloatingLyricsToolbar({
    react, host: window, document, translate, getOptionsText, readVisualSettings, readTheme: getSettingsSurfaceTheme,
    useToolbarSyncOffsets, openSettings, openToolbarSettings, buildPanelView, ToolbarGlyph, ToolbarFlyout,
  });

  return {
    OptionsMenu, IvLyricsFloatingToolbar, IvLyricsTooltip, IvLyricsToolbarIcon, ivLyricsFirstLanguagePrompt,
    openRegenerateTranslationChoiceModal, getRegenerateTranslationChoiceItems, openSyncDataCreator, SyncDataCreatorButton, TrackSyncAdjustPill,
  };
}
