import { createFullscreenPresentationPicker } from "#ivlyrics/features/settings/settingsFullscreenPresentationPicker.mjs";
import { createSettingsDestinationResolver } from "#ivlyrics/features/settings/settingsDestinations.mjs";
import { createCdSettingsCatalog, isCdSettingsKey } from "#ivlyrics/features/settings/settingsCdCatalog.mjs";
import { createSettingsPerformanceControls } from "#ivlyrics/features/settings/settingsPerformanceControls.mjs";
import { LOCAL_LYRICS_UPDATED_EVENT as SETTINGS_LOCAL_LYRICS_UPDATED_EVENT } from "#ivlyrics/lyrics/localLyricsStore.mjs";
import { SETTINGS_BACKGROUND_PRESETS, getSettingsBackgroundPresetLabel } from "#ivlyrics/features/settings/settingsBackgroundPresets.mjs";
import { useSettingsSignal, useSettingsConfigSignal } from "../../src/features/settings/settingsSignals.mjs";
import { createSettingsSectionNavigation } from "../../src/features/settings/settingsSectionNavigation.mjs";
import { useSettingsDockPreferences } from "../../src/features/settings/useSettingsDockPreferences.mjs";
import { createSettingsPreviewDock } from "../../src/features/settings/settingsPreviewDock.mjs";
import { createSettingsLayerMatrix } from "../../src/features/settings/settingsLayerMatrix.mjs";
import { createSettingsLayoutControls } from "../../src/features/settings/settingsLayoutControls.mjs";
import { createSettingsServices } from "#ivlyrics/spicetify/settingsServices.mjs";
import { useSettingsModalSearch } from "../../src/features/settings/useSettingsModalSearch.mjs";
import { useSettingsModalInteractions, isSettingsEditableField } from "../../src/features/settings/settingsModalInteractions.mjs";
import { restoreSettingsOnFirstLyricsMount } from "../../src/features/settings/settingsModalHost.mjs";
import { useSettingsReleaseNotes } from "../../src/features/settings/useSettingsReleaseNotes.mjs";
import { loadStoredSettingsFonts } from "../../src/features/settings/settingsFontLoading.mjs";
import { renderSettingsAboutUpdateSection } from "../../src/features/settings/settingsAboutUpdateSection.mjs";
import { useSettingsBackgroundTab } from "../../src/features/settings/settingsBackgroundTab.mjs";
import { createSettingsProviderCards } from "../../src/features/settings/settingsProviderCards.mjs";
import { createSettingsProviderListView } from "../../src/features/settings/settingsProviderListView.mjs";
import { createSettingsLyricsProviderTab } from "../../src/features/settings/settingsLyricsProviderTab.mjs";
import { createSettingsAiProviderTab } from "../../src/features/settings/settingsAiProviderTab.mjs";
import { renderSettingsSectionShell } from "../../src/features/settings/settingsSectionShell.mjs";
import { createSettingsLyricsPreview, getSettingsPreviewSupplementVisibility } from "#ivlyrics/features/settings/createSettingsLyricsPreview.mjs";
import { createSettingsBackupActions } from "../../src/features/settings/settingsBackupActions.mjs";
import { createSettingsPanelPreview } from "../../src/features/settings/createSettingsPanelPreview.mjs";
import { renderAdvancedSettingsTab } from "../../src/features/settings/settingsAdvancedTab.mjs";
import { createSettingsUpdateButton } from "../../src/features/settings/settingsUpdateButton.mjs";
import { createChangedSettingsView, useChangedSettingsCounts } from "../../src/features/settings/settingsChangedView.mjs";
import { useSettingsTabNavigation } from "../../src/features/settings/useSettingsTabNavigation.mjs";
import { createSettingsMenuMetadata } from "../../src/features/settings/settingsMenuMetadata.mjs";
import { createSettingsModalChrome } from "../../src/features/settings/settingsModalChrome.mjs";
import { buildSettingsSearchCatalog } from "../../src/features/settings/settingsSearchCatalog.mjs";
import { useSettingsSearchIndex } from "../../src/features/settings/settingsSearchIndex.mjs";
import { buildSettingsSearchEntries, rankSettingsSearchEntries, SETTINGS_SEARCH_RESULT_LIMIT } from "../../src/features/settings/settingsSearchRanking.mjs";
import { renderSettingsSearchPanel } from "../../src/features/settings/renderSettingsSearchPanel.mjs";
import { createLyricDisplayResolver as createSettingsLyricDisplayResolver } from "../../src/lyrics/lyricDisplayText.mjs";
import { createPlaybackSettingsTabs } from "../../src/features/settings/settingsPlaybackTabs.mjs";
import { createProviderSettingsTabs } from "../../src/features/settings/settingsProviderTabs.mjs";
import { createPanelSettingsTab } from "../../src/features/settings/settingsPanelTab.mjs";
import { createAppearanceSettingsTab } from "../../src/features/settings/settingsAppearanceTab.mjs";
import { createFullscreenSettingsTab } from "../../src/features/settings/settingsFullscreenTab.mjs";
import { createSettingsSaveEffects } from "../../src/features/settings/settingsSaveEffects.mjs";
import { createSettingsEventChannel, createVisualSettingsActions } from "../../src/core/visualSettingsActions.mjs";
import { collectSettingsRegistry, indexSettingsSearch } from "../../src/features/settings/settingsRegistry.mjs";
import { createSettingsFullscreenPreview, SETTINGS_CD_RAINBOW_HUES, SETTINGS_CD_STYLE_ORDER } from "../../src/features/settings/createSettingsFullscreenPreview.mjs";
import { readSettingFlag, readSettingNumber } from "../../src/features/settings/settingsPreviewValues.mjs";
import {
  SYNC_CREATOR_SHORTCUT_DEFAULTS, SYNC_CREATOR_AUTO_BOUNDARY_CHARS_KEY, SYNC_CREATOR_AUTO_BOUNDARY_CHARS_DEFAULT,
} from "../../src/features/sync/syncCreatorShortcutSettings.mjs";

export const settingsTabModules = {
  createFullscreenPresentationPicker,
  createSettingsDestinationResolver,
  createCdSettingsCatalog, isCdSettingsKey,
  createSettingsPerformanceControls,
  SETTINGS_LOCAL_LYRICS_UPDATED_EVENT,
  SETTINGS_BACKGROUND_PRESETS,
  getSettingsBackgroundPresetLabel,
  useSettingsSignal, useSettingsConfigSignal, createSettingsSectionNavigation, useSettingsDockPreferences, createSettingsPreviewDock,
  createSettingsLayerMatrix, createSettingsLayoutControls,
  useSettingsModalSearch, useSettingsModalInteractions, isSettingsEditableField, restoreSettingsOnFirstLyricsMount,
  useSettingsReleaseNotes, loadStoredSettingsFonts, renderSettingsAboutUpdateSection,
  useSettingsBackgroundTab,
  createSettingsProviderCards,
  createSettingsProviderListView,
  createSettingsLyricsProviderTab,
  createSettingsAiProviderTab,
  renderSettingsSectionShell,
  createSettingsBackupActions,
  createSettingsPanelPreview,
  createSettingsLyricsPreview,
  getSettingsPreviewSupplementVisibility,
  SettingsInterludeIndicator: () => null,
  renderAdvancedSettingsTab,
  createSettingsUpdateButton,
  createSettingsLyricDisplayResolver,
  SYNC_CREATOR_SHORTCUT_DEFAULTS,
  SYNC_CREATOR_AUTO_BOUNDARY_CHARS_KEY,
  SYNC_CREATOR_AUTO_BOUNDARY_CHARS_DEFAULT,
  createPlaybackSettingsTabs,
  createProviderSettingsTabs,
  createPanelSettingsTab,
  createAppearanceSettingsTab,
  createFullscreenSettingsTab,
  createSettingsSaveEffects,
  collectSettingsRegistry,
  indexSettingsSearch,
  buildSettingsSearchCatalog,
  useSettingsSearchIndex,
  buildSettingsSearchEntries,
  rankSettingsSearchEntries,
  SETTINGS_SEARCH_RESULT_LIMIT,
  renderSettingsSearchPanel,
  useSettingsTabNavigation,
  createSettingsMenuMetadata,
  createSettingsModalChrome,
  createChangedSettingsView,
  useChangedSettingsCounts,
  createSettingsFullscreenPreview,
  SETTINGS_CD_RAINBOW_HUES,
  SETTINGS_CD_STYLE_ORDER,
  readSettingFlag,
  readSettingNumber,
};


export function installSettingsFixtureBindings(context) {
  const channel = createSettingsEventChannel(context.window, (type, detail) => new context.CustomEvent(type, { detail }));
  const updateLyrics = () => context.refreshPageFromSettings(context.window);
  const persistConfig = (name, value) => context.StorageManager.saveConfig(name, value);
  const visualSettingsActions = createVisualSettingsActions({
    getVisualSettings: () => context.CONFIG.visual,
    persistConfig, persistConfigBatch: values => context.StorageManager.saveConfigs(values),
    updateLyrics, publishConfigChange: channel.publishSettingsConfigChange,
  });
  Object.assign(context, channel, createSettingsServices(context.window), {
    updateLyrics, persistConfig, visualSettingsActions,
    saveVisualSetting: visualSettingsActions.saveVisualSetting,
    saveVisualSettings: visualSettingsActions.saveVisualSettings,
  });
}
