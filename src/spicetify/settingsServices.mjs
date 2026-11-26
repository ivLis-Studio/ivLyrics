import { readSettingsPersistence } from "../core/settingsRuntime.mjs";
import { getRuntimeService, publishRuntimeService } from "./runtimeServices.mjs";

export function createSettingsServices(host) {
  // Several startup services are installed after the route is evaluated.
  // Keep access lazy so an already-open settings panel can discover them.
  const read = (name) => getRuntimeService(name, host);
  return {
    getOverlaySender: () => read("OverlaySender"),
    getSyncDataService: () => read("SyncDataService"),
    getLyricsService: () => read("LyricsService"),
    getLyricsCache: () => read("LyricsCache"),
    getTranslator: () => read("Translator"),
    getApiTracker: () => read("ApiTracker"),
    readSettingsLanguage: () => read("I18n")?.getCurrentLanguage?.(),
    setSettingsLanguage: (language, options) => read("I18n")?.setLanguage?.(language, options),
    getSettingsLyricsHelper: () => read("lyricsHelperSender"),
    getStoragePersistence: () => readSettingsPersistence(host),
    readAiSettingsManager: () => read("AIAddonManager"),
    readLyricsSettingsManager: () => read("LyricsAddonManager"),
    publishSettingsThemeCompatibility: (theme) => {
      try {
        publishRuntimeService("ivLyricsGetSystemSettingsUiTheme", theme.getSystemSettingsUiTheme, host);
        publishRuntimeService("ivLyricsGetEffectiveSettingsUiTheme", theme.getEffectiveSettingsUiTheme, host);
        publishRuntimeService("ivLyricsResolveSettingsUiTheme", theme.resolveEffectiveSettingsUiTheme, host);
        publishRuntimeService("ivLyricsSubscribeSystemSettingsUiTheme", theme.subscribeSystemSettingsUiTheme, host);
        host.ivLyricsThemeDebug = () => {
          const info = theme.getSettingsUiThemeDebugInfo();
          try {
            console.info("[ivLyrics] theme debug:", info);
          } catch {
            // Console may be unavailable in hardened contexts.
          }
          return info;
        };
      } catch {
        // Compatibility publication can fail on a restricted host.
      }
    },
    publishSettingsBackgroundCompatibility: (presets, getPresetLabel, getMode) => {
      host.ivLyricsBackgroundPresets = presets;
      host.ivLyricsGetBackgroundPresetLabel = getPresetLabel;
      host.ivLyricsGetCurrentSettingsBackgroundMode = getMode;
    },
  };
}
