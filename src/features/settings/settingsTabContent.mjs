import { renderSettingsAboutTab } from "./settingsAboutTab.mjs";
import { renderSettingsAboutUpdateSection } from "./settingsAboutUpdateSection.mjs";
import { createPlaybackSettingsTabs } from './settingsPlaybackTabs.mjs';
import { createProviderSettingsTabs } from './settingsProviderTabs.mjs';
import { createPanelSettingsTab } from './settingsPanelTab.mjs';
import { createAppearanceSettingsTab } from './settingsAppearanceTab.mjs';
import { createFullscreenSettingsTab } from './settingsFullscreenTab.mjs';
import { renderAdvancedSettingsTab } from "./settingsAdvancedTab.mjs";

// Visible tabs and the settings registry use the same renderers and handlers.
// Create the group factories on demand, once per render of the settings modal.
export function createSettingsTabContent({
  react, translate, activeTab, fullscreenView, isFadActive, getSettingsText, getVisualSettings,
  playback: {
    getAvailableLanguages, changeInterfaceLanguage, saveSettingsTranslationTargetLanguage,
    getPerformanceSettingsSections, navigateToDestination, handlePerformanceSettingChange,
    openLyricsHelperDownload, saveLyricsHelperSetting,
  },
  visuals: {
    createTextOutlineSettingItems, saveVinylSetting, handleNowPlayingPanelChange,
    getInstrumentalBreakLabelStyleDefault, saveInstrumentalLabelSetting, getMultiVocalRegistryItems,
    getBackgroundRegistryItems, buildLyricsTypographyColumns, saveLyricsTypographySetting,
    handleAppearancePreviewChange, getLyricsTypographyRows, handleVisualConfigChange, getCdSettingsSections,
  },
  advanced: { thresholdSizeLimit, backupActions },
  about: { getCurrentVersion, openUpdaterProtocol, readClientId, copyText, openLink, notifySuccess, notifyError },
  // The AI assistant menu is a chat, not a list of rows; Settings.js renders it.
  assistant: { renderAssistantTab } = {},
  controls,
}) {
  const { SettingsSection, OptionList, ConfigSliderRange, SettingsBackupButton, ConfigCloudSync,
    ConfigSettingsPresets, ConfigButton, SettingsUpdateButton, AccountSection, SettingsUiIcon } = controls;

  let playbackTabs;
  const getPlaybackTabs = () => playbackTabs ??= createPlaybackSettingsTabs({
    react, t: translate, activeTab,
    getAvailableLanguages,
    getVisualSettings,
    changeInterfaceLanguage,
    saveSettingsTranslationTargetLanguage,
    getPerformanceSettingsSections,
    navigateToDestination,
    handlePerformanceSettingChange,
    handleVisualConfigChange,
    getSettingsText,
    isFadActive,
    openLyricsHelperDownload,
    saveLyricsHelperSetting,
    controls,
  });
  let providerTabs;
  const getProviderTabs = () => providerTabs ??= createProviderSettingsTabs({
    react, t: translate, activeTab,
    getSettingsText,
    getVisualSettings,
    createTextOutlineSettingItems,
    handleCulturalSettingChange: saveVinylSetting,
    controls,
  });
  const renderNowPlayingTab = () => createPanelSettingsTab({
    react, t: translate, activeTab,
    getSettingsText,
    getVisualSettings,
    createTextOutlineSettingItems,
    handleNowPlayingPanelChange,
    controls,
  }).renderNowPlayingTab();

  const renderAppearanceTab = () => createAppearanceSettingsTab({
    react, t: translate, activeTab,
    getVisualSettings,
    getInstrumentalBreakLabelStyleDefault,
    createTextOutlineSettingItems,
    saveInstrumentalLabelSetting,
    getMultiVocalRegistryItems,
    getBackgroundRegistryItems,
    getSettingsText,
    buildLyricsTypographyColumns,
    saveLyricsTypographySetting,
    handleAppearancePreviewChange,
    getLyricsTypographyRows,
    handleVisualConfigChange,
    isFadActive,
    controls,
  }).renderAppearanceTab();

  const renderAdvancedTab = () => renderAdvancedSettingsTab(react, {
    activeTab, translate, thresholdSizeLimit, handleVisualConfigChange, actions: backupActions,
    SettingsSection, OptionList, ConfigSliderRange, SettingsBackupButton, ConfigCloudSync, ConfigSettingsPresets,
  });

  const renderFullscreenTab = () => createFullscreenSettingsTab({
    react, t: translate, activeTab,
    getVisualSettings,
    fullscreenView,
    createTextOutlineSettingItems,
    handleVisualConfigChange,
    getCdSettingsSections,
    saveVinylSetting,
    buildLyricsTypographyColumns,
    getLyricsTypographyRows,
    controls,
  }).renderFullscreenTab();

  const renderAboutUpdateSection = () => renderSettingsAboutUpdateSection(react, {
    OptionList, ConfigButton, SettingsUpdateButton, translate,
    getCurrentVersion, openUpdaterProtocol, notifySuccess, notifyError,
  });
  const renderAboutTab = () => renderSettingsAboutTab(react, {
    activeTab, SettingsSection, AccountSection, SettingsUiIcon,
    translate, appVersion: getCurrentVersion(), readClientId, copyText, openLink, notifySuccess, notifyError,
    renderUpdate: renderAboutUpdateSection,
  });

  return function renderTabContent(tabId) {
    switch (tabId) {
      case "assistant": return renderAssistantTab ? renderAssistantTab() : null;
      case "lyrics-providers": return getProviderTabs().renderLyricsProvidersTab();
      case "ai-providers": return getProviderTabs().renderAiProvidersTab();
      case "appearance": return renderAppearanceTab();
      case "performance": return getPlaybackTabs().renderPerformanceTab();
      case "lyrics": return getPlaybackTabs().renderLyricsTab();
      case "fullscreen": return renderFullscreenTab();
      case "nowplaying": return renderNowPlayingTab();
      case "advanced": return renderAdvancedTab();
      case "debug": return getProviderTabs().renderDebugTab();
      case "about": return renderAboutTab();
      default: return getPlaybackTabs().renderGeneralTab();
    }
  }
}
