import { createRuntimeDebugLogger } from "#ivlyrics/spicetify/runtimeDebug.mjs";
import { readSettingsPersistence as readI18nSettingsPersistence } from "#ivlyrics/core/settingsRuntime.mjs";
import { createI18n } from "#ivlyrics/i18n/createI18n.mjs";
import { LANGUAGE_DATA, LANGUAGE_NAMES } from "#ivlyrics/i18n/languageCatalog.mjs";
import { getRuntimeService, publishRuntimeService } from "#ivlyrics/spicetify/runtimeServices.mjs";
import { INTERFACE_LANGUAGE_CHANGED, INTERFACE_LANGUAGE_STORAGE_KEY } from "./interfaceLanguage.mjs";

const RUNTIME_I18N = Symbol.for("ivLyrics.interfaceLanguage.runtime");

export function initializeRuntimeI18n({ host: window, spicetify, getLocalStorage = () => window.localStorage }) {
  const applyLanguageToConfig = (language) => {
      const visual = getRuntimeService("CONFIG", window)?.visual;
      if (visual) visual.language = language;
  };
  const installed = window[RUNTIME_I18N];
  if (installed) {
      applyLanguageToConfig(installed.getCurrentLanguage());
      return installed;
  }
  const readSpotifyStorage = () => (window.Spicetify ?? spicetify)?.LocalStorage;
  const I18n = createI18n({
      languages: LANGUAGE_DATA,
      languageNames: LANGUAGE_NAMES,
      readLanguage() {
          const persistence = readI18nSettingsPersistence(window);
          if (persistence) return persistence.getItem(INTERFACE_LANGUAGE_STORAGE_KEY);
          return readSpotifyStorage()?.get?.(INTERFACE_LANGUAGE_STORAGE_KEY)
              ?? getLocalStorage()?.getItem(INTERFACE_LANGUAGE_STORAGE_KEY);
      },
      writeLanguage(language) {
          const persistence = readI18nSettingsPersistence(window);
          if (persistence) {
              persistence.setItem(INTERFACE_LANGUAGE_STORAGE_KEY, language);
              return;
          }
          const spotifyStorage = readSpotifyStorage();
          if (typeof spotifyStorage?.set === "function") spotifyStorage.set(INTERFACE_LANGUAGE_STORAGE_KEY, language);
          else getLocalStorage().setItem(INTERFACE_LANGUAGE_STORAGE_KEY, language);
      },
      onLanguageChanged(language) {
          applyLanguageToConfig(language);
          if (typeof window.CustomEvent === "function") {
              window.dispatchEvent?.(new window.CustomEvent(INTERFACE_LANGUAGE_CHANGED, { detail: { language } }));
          }
      },
      debug: createRuntimeDebugLogger(window),
  });
  window[RUNTIME_I18N] = I18n;
  publishRuntimeService("I18n", I18n, window);

  window.t = (key, params) => I18n.t(key, params);

  try {
      I18n.initSync();
  } catch (error) {
      console.error("[I18n] Init error:", error);
  }
  return I18n;
}

export default function startI18n() {
  return initializeRuntimeI18n({ host: window });
}
