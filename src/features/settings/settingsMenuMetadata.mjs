export const SETTINGS_TAB_TRANSLATION_KEYS = {
  assistant: "tabs.assistant",
  general: "tabs.general",
  appearance: "tabs.appearance",
  performance: "tabs.performance",
  lyrics: "tabs.behavior",
  "lyrics-providers": "tabs.lyricsProviders",
  "ai-providers": "tabs.aiProviders",
  fullscreen: "tabs.fullscreen",
  nowplaying: "tabs.nowplaying",
  advanced: "tabs.advanced",
  debug: "tabs.debug",
  about: "tabs.about",
};

export function createSettingsMenuMetadata(activeTab, translate, getSettingsText) {
  const tabMeta = {
    assistant: {
      label: translate(SETTINGS_TAB_TRANSLATION_KEYS.assistant) || "AI Assistant",
      description: getSettingsText(
        "settingsUi.nav.assistantDesc",
        "Ask in your own words. It finds the right settings, explains them and changes them for you."
      ),
    },
    general: {
      label: translate(SETTINGS_TAB_TRANSLATION_KEYS.general),
      description: getSettingsText(
        "settingsUi.nav.generalDesc",
        "Language, translation target, and desktop overlay behavior"
      ),
    },
    appearance: {
      label: translate(SETTINGS_TAB_TRANSLATION_KEYS.appearance),
      description: getSettingsText(
        "settingsUi.nav.appearanceDesc",
        "Background, sync presentation, motion, and text styles"
      ),
    },
    performance: {
      label: translate(SETTINGS_TAB_TRANSLATION_KEYS.performance),
      description: getSettingsText(
        "settingsUi.nav.performanceDesc",
        "Frame rate, motion, and visual cost controls"
      ),
    },
    lyrics: {
      label: translate(SETTINGS_TAB_TRANSLATION_KEYS.lyrics),
      description: getSettingsText(
        "settingsUi.nav.lyricsDesc",
        "Playback buttons, karaoke behavior, prefetch, sync sharing, and helper integrations"
      ),
    },
    fullscreen: {
      label: translate(SETTINGS_TAB_TRANSLATION_KEYS.fullscreen),
      description: getSettingsText(
        "settingsUi.nav.fullscreenDesc",
        "Fullscreen layout, metadata display, controller UI, and TV mode presentation"
      ),
    },
    nowplaying: {
      label: translate(SETTINGS_TAB_TRANSLATION_KEYS.nowplaying),
      description: getSettingsText(
        "settingsUi.nav.nowplayingDesc",
        "Panel lyrics typography, background, border, and preview behavior"
      ),
    },
    "lyrics-providers": {
      label: translate(SETTINGS_TAB_TRANSLATION_KEYS["lyrics-providers"]) || "Lyrics Providers",
      description: getSettingsText(
        "settingsUi.nav.lyricsProvidersDesc",
        "Choose, order, and scope each lyrics source"
      ),
    },
    "ai-providers": {
      label: translate(SETTINGS_TAB_TRANSLATION_KEYS["ai-providers"]),
      description: getSettingsText(
        "settingsUi.nav.aiProvidersDesc",
        "Configure AI translation providers, models, and keys"
      ),
    },
    advanced: {
      label: translate(SETTINGS_TAB_TRANSLATION_KEYS.advanced),
      description: getSettingsText(
        "settingsUi.nav.advancedDesc",
        "Language detection, import/export, database tools, and reset operations"
      ),
    },
    debug: {
      label: translate(SETTINGS_TAB_TRANSLATION_KEYS.debug),
      description: getSettingsText(
        "settingsUi.nav.debugDesc",
        "Inspect track, lyrics, and runtime state for troubleshooting"
      ),
    },
    about: {
      label: translate(SETTINGS_TAB_TRANSLATION_KEYS.about),
      description: getSettingsText(
        "settingsUi.nav.aboutDesc",
        "Account, update status, client info, and release notes"
      ),
    },
  };

  const activeTabMeta = tabMeta[activeTab] || tabMeta.general;

  const sidebarTabs = [
    // The AI settings assistant (settingsAssistantPanel.mjs) is a chat, not
    // a list of rows; settingsGuide.mjs lists it as the first menu.
    { id: "assistant", icon: "assistant", group: "assistant" },
    { id: "general", icon: "general", group: "general" },
    { id: "lyrics-providers", icon: "lyrics-providers", group: "sources" },
    { id: "ai-providers", icon: "ai-providers", group: "sources" },
    { id: "appearance", icon: "appearance", group: "screen" },
    { id: "performance", icon: "performance", group: "screen" },
    { id: "lyrics", icon: "lyrics", group: "screen" },
    { id: "fullscreen", icon: "fullscreen", group: "screen" },
    { id: "nowplaying", icon: "nowplaying", group: "screen" },
    { id: "advanced", icon: "advanced", group: "system" },
    { id: "debug", icon: "debug", group: "system" },
    { id: "about", icon: "about", group: "system" },
  ].map((tab) => ({ ...tab, ...tabMeta[tab.id] }));
  const sidebarGroups = [
    {
      id: "assistant",
      label: getSettingsText("settingsUi.nav.badges.assistant", "AI"),
    },
    {
      id: "general",
      label: translate(SETTINGS_TAB_TRANSLATION_KEYS.general) || "General",
    },
    {
      id: "sources",
      label: getSettingsText("settingsUi.nav.badges.providers", "Sources"),
    },
    {
      id: "screen",
      label: getSettingsText("settingsUi.nav.badges.surface", "Screen"),
    },
    {
      id: "system",
      label: getSettingsText("settingsUi.nav.badges.system", "System"),
    },
  ];

  const fullscreenViews = [
    { value: "basic", label: getSettingsText("settingsUi.fullscreenViews.basic", "Basics") },
    { value: "normal", label: getSettingsText("settingsUi.fullscreenViews.normal", "Normal mode") },
    { value: "tv", label: getSettingsText("settingsUi.fullscreenViews.tv", "TV mode") },
    { value: "cd", label: translate("vinyl.cd.mode") },
    { value: "vinyl", label: translate("vinyl.mode") || "LP" },
  ];

  return { activeTabMeta, sidebarTabs, sidebarGroups, fullscreenViews };
}
