import { createDefaultVisualSettings } from "../../spicetify/createAppConfig.mjs";
import { IVLYRICS_BACKGROUND_FLAG_IDS, resolveGlobalBackgroundMode } from "../../lyrics/backgroundModes.mjs";
import { SYNC_CREATOR_SHORTCUT_DEFAULTS } from "../sync/syncCreatorShortcutSettings.mjs";

const initialVisual = createDefaultVisualSettings();
const untrackedSettings = new Set([
  ...IVLYRICS_BACKGROUND_FLAG_IDS,
  "language", "delay", "translate", "synced-compact", "global-sync-offset",
  "background-color", "active-color", "inactive-color", "highlight-color",
  "font-size", "font-family", "translate:translated-lyrics-source", "translate:display-mode",
  "translate:pronunciation-notation", "translate:detect-language-override",
]);
const untrackedPrefixes = ["translation-mode:", "translation-mode-2:", "gemini-api-key", "community-video-"];

// Theme, account and per-track values do not have a settings reset. The
// background flags are represented in the UI by one choice.
export const SETTINGS_DEFAULT_VALUES = Object.freeze(Object.fromEntries(
  Object.entries(initialVisual).filter(([key]) => (
    !untrackedSettings.has(key) && !untrackedPrefixes.some((prefix) => key.startsWith(prefix))
  ))
));

export const SETTINGS_FALLBACK_DEFAULT_VALUES = Object.freeze({
  ...SYNC_CREATOR_SHORTCUT_DEFAULTS,
});

export const SETTINGS_BACKGROUND_MODE_KEY = "__background-mode";
export const SETTINGS_DEFAULT_BACKGROUND_MODE = resolveGlobalBackgroundMode(initialVisual);

export function hasSettingDefault(key) {
  return typeof key === "string" && (
    Object.hasOwn(SETTINGS_DEFAULT_VALUES, key) || Object.hasOwn(SETTINGS_FALLBACK_DEFAULT_VALUES, key)
  );
}

export function getSettingDefaultValue(key) {
  if (key === SETTINGS_BACKGROUND_MODE_KEY) return SETTINGS_DEFAULT_BACKGROUND_MODE;
  return Object.hasOwn(SETTINGS_DEFAULT_VALUES, key) ? SETTINGS_DEFAULT_VALUES[key] : SETTINGS_FALLBACK_DEFAULT_VALUES[key];
}
