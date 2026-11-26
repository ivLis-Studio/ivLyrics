import {
  TRACK_LANGUAGE_OVERRIDES,
  TRACK_LYRICS_PROVIDER_OVERRIDES,
  TRACK_BACKGROUND_OVERRIDES,
  createTrackPreferenceDatabase,
  readAllTrackPreferences,
  requestTrackPreference,
} from "./trackPreferenceDatabase.mjs";

export const REQUIRE_TRACK_OVERRIDE_COMMIT = Object.freeze({ requireCommit: true });

function createTrackOverrideStore({ dbName, storeName, label, setting, methods, normalize, getIndexedDB, waitForDatabaseRecovery, sharePendingOpen, debug, logger = console }) {
  const [getName, setName, clearName] = methods;
  const open = createTrackPreferenceDatabase({ dbName, storeName, label, getIndexedDB, waitForDatabaseRecovery, sharePendingOpen, debug, logger });
  return {
    async [getName](trackUri) {
      try {
        const db = await open();
        // Open failures use fallback values. Failed requests reject to callers.
        return requestTrackPreference(db, storeName, "get", [trackUri], normalize || ((value) => value || null));
      } catch (error) {
        logger.error(`[ivLyrics] Failed to get ${setting} override:`, error);
        return null;
      }
    },
    async [setName](trackUri, value, options) {
      try {
        const storedValue = normalize ? normalize(value) : value;
        if (normalize && !storedValue) {
          await this[clearName](trackUri, options);
          return;
        }
        const db = await open();
        return requestTrackPreference(db, storeName, "put", [storedValue, trackUri]);
      } catch (error) {
        logger.error(`[ivLyrics] Failed to set ${setting} override:`, error);
        if (options?.requireCommit) throw error;
      }
    },
    async [clearName](trackUri, options) {
      try {
        const db = await open();
        return requestTrackPreference(db, storeName, "delete", [trackUri]);
      } catch (error) {
        logger.error(`[ivLyrics] Failed to clear ${setting} override:`, error);
        if (options?.requireCommit) throw error;
      }
    },
    async getAllOverrides() {
      try {
        const db = await open();
        return readAllTrackPreferences(db, storeName, normalize);
      } catch (error) {
        logger.error(`[ivLyrics] Failed to get all ${setting} overrides:`, error);
        return {};
      }
    },
  };
}

export function createTrackOverrideStores({ normalizeBackground, ...runtime }) {
  return {
    TrackLanguageDB: createTrackOverrideStore({
      ...TRACK_LANGUAGE_OVERRIDES,
      ...runtime,
      label: "Language",
      setting: "language",
      methods: ["getLanguage", "setLanguage", "clearLanguage"],
    }),
    TrackLyricsProviderDB: createTrackOverrideStore({
      ...TRACK_LYRICS_PROVIDER_OVERRIDES,
      ...runtime,
      label: "Provider",
      setting: "provider",
      methods: ["getProvider", "setProvider", "clearProvider"],
    }),
    TrackBackgroundDB: createTrackOverrideStore({
      ...TRACK_BACKGROUND_OVERRIDES,
      ...runtime,
      label: "Background",
      setting: "background",
      methods: ["getOverride", "setOverride", "clearOverride"],
      normalize: normalizeBackground,
    }),
  };
}
