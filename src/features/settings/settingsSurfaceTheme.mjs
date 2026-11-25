import { readSettingsPersistence } from "../../core/settingsRuntime.mjs";
import { getRuntimeService } from "../../spicetify/runtimeServices.mjs";

export function getSettingsSurfaceTheme() {
  const storedTheme = readSettingsPersistence(window)?.getItem("ivLyrics:settings-ui-theme")
    ?? localStorage.getItem("ivLyrics:settings-ui-theme");
  if (storedTheme === "light" || storedTheme === "dark") {
    return storedTheme;
  }
  // Follow the settings screen when it resolves an older "auto" preference;
  // popups stay dark when the settings module is not available.
  try {
    return getRuntimeService("ivLyricsResolveSettingsUiTheme", window)?.(storedTheme || "auto") === "light"
      ? "light"
      : "dark";
  } catch {
    return "dark";
  }
}
