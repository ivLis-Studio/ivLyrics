import { createSettingsPersistence } from "./createSettingsPersistence.mjs";
import { isIvLyricsRoute } from "../spicetify/lyricsRoute.mjs";
import { requestAppRouteReload } from "../spicetify/routeReload.mjs";
import { publishSettingsPersistence, readSettingsPersistence } from "./settingsRuntime.mjs";
import { createIndexedDbBackup } from "./indexedDbBackup.mjs";
import { hasInterruptedSettingsImport } from "./settingsImportJournal.mjs";

const PLATFORM_STORAGE_WAIT_MS = 3000;
const PLATFORM_STORAGE_RETRY_MS = 100;

const getPlatformStorage = () => window.Spicetify?.Platform?.LocalStorageAPI;
const isPlatformStorageReady = () => {
  const storage = getPlatformStorage();
  return typeof storage?.getItem === "function" && typeof storage.namespace === "string" && !!storage.namespace;
};

function waitForPlatformStorage() {
  return new Promise(resolve => {
    let remaining = PLATFORM_STORAGE_WAIT_MS;
    const check = () => {
      if (isPlatformStorageReady() || remaining <= 0) resolve();
      else {
        remaining -= PLATFORM_STORAGE_RETRY_MS;
        window.setTimeout(check, PLATFORM_STORAGE_RETRY_MS);
      }
    };
    check();
  });
}

function reloadRecoveredSettings({ namespace, revision }) {
  if (typeof window.location?.reload !== "function") return;

  const marker = `ivLyrics:settings-recovered:${namespace}:${revision}`;
  try {
    if (sessionStorage.getItem(marker) === "true") return;
    sessionStorage.setItem(marker, "true");
  } catch (error) {
    // Settings may already be loaded with defaults. Refresh once to read the recovered values.
  }

  const restoreLyrics = isIvLyricsRoute(window.Spicetify?.Platform?.History?.location?.pathname);
  requestAppRouteReload({ host: window, restoreLyrics, reportError: console.warn });
}

export default function initializeSettingsPersistence() {
  const existing = readSettingsPersistence(window);
  if (existing?.ready) return existing;

  // The database restore may need the track-offset receipt owned by settings
  // import recovery. Clean starts can check the database journal in parallel.
  let waitForSettingsImport = true;
  try { waitForSettingsImport = hasInterruptedSettingsImport(localStorage); }
  catch { /* Wait for settings recovery if native storage is unavailable. */ }
  let recoveredSettings;
  const { api, startRecovery } = createSettingsPersistence({
    getLocalStorage: () => localStorage,
    getPlatformStorage,
    waitForInitialPlatformStorage: isPlatformStorageReady() ? null : waitForPlatformStorage,
    getIndexedDB: () => window.indexedDB,
    onRecovered: recovery => { recoveredSettings = recovery; },
    warn: (...args) => console.warn(...args),
  });
  publishSettingsPersistence(window, api);
  const settingsReady = startRecovery();
  const recoverDatabases = () => createIndexedDbBackup({ readIndexedDb: () => window.indexedDB }).recover();
  api.databasesReady = (waitForSettingsImport ? settingsReady.then(recoverDatabases) : recoverDatabases())
    .catch(error => {
      console.warn("[ivLyrics] Could not recover the interrupted database restore.", error);
    });
  api.ready = Promise.all([settingsReady, api.databasesReady]).then(([result]) => {
    if (recoveredSettings) reloadRecoveredSettings(recoveredSettings);
    return result;
  });
  return api;
}
