import { IV_LYRICS_DEFAULT_SPEAKER_COLOR_SETTINGS } from "../../lyrics/speakerColors.mjs";

export function publishAppliedSettingsPreset(entries, {
  setInterfaceLanguage, applySpeakerColors, publishConfigChange, refreshLyrics, publishEvent,
}) {
  const language = entries.find(([name]) => name === "language");
  if (language) setInterfaceLanguage(language[1]);
  if (entries.some(([name]) => Object.hasOwn(IV_LYRICS_DEFAULT_SPEAKER_COLOR_SETTINGS, name))) {
    applySpeakerColors();
  }
  for (const [name, value] of entries) publishConfigChange(name, value);
  refreshLyrics();
  publishEvent("ivLyrics:panel-preview-update", { source: "settings-preset" });
}

export function createSettingsSaveEffects({
  visualSettingsActions, persistConfig, persistVisualSetting, reloadLyrics,
  updatePreviewStyles, loadFont, publishConfigChange, publishEvent, setInterfaceLanguage,
  reopenLanguageSettings, setLyricsHelperEnabled,
}) {
  const { saveVisualSetting, refreshAndPublishSetting, handleVisualConfigChange } = visualSettingsActions;

  return {
    handleVisualConfigChange,
    saveLyricsTypographySetting(name, value) {
      saveVisualSetting(name, value, persistVisualSetting);
      if (name.endsWith("font-family")) loadFont(value);
      updatePreviewStyles();
      if (name === "phonetic-hyphen-replace") {
        reloadLyrics();
        publishConfigChange(name, value);
      } else {
        refreshAndPublishSetting(name, value);
      }
    },
    saveVinylSetting(name, value) {
      saveVisualSetting(name, value);
      if (name.endsWith("font-family")) loadFont(value);
      refreshAndPublishSetting(name, value);
    },
    handleAppearancePreviewChange(name, value) {
      saveVisualSetting(name, value, persistVisualSetting);
      updatePreviewStyles();
      refreshAndPublishSetting(name, value);
    },
    handleNowPlayingPanelChange(name, value) {
      saveVisualSetting(name, value);
      publishConfigChange(name, value);
      publishEvent("ivLyrics:panel-preview-update", { name, value });
    },
    changeInterfaceLanguage(name, value) {
      saveVisualSetting(name, value);
      setInterfaceLanguage(value);
      reopenLanguageSettings();
    },
    saveLyricsHelperSetting(name, value) {
      saveVisualSetting(name, value);
      if (name === "lyrics-helper-enabled") setLyricsHelperEnabled(value);
    },
    saveInstrumentalLabelSetting(name, value) {
      saveVisualSetting(name, value, (key, nextValue) => {
        if (key === "instrumental-break-label-font-family") loadFont(nextValue);
        persistConfig(key, nextValue);
      });
      refreshAndPublishSetting(name, value);
    },
  };
}
