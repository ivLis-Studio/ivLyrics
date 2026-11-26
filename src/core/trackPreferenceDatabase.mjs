import { awaitIdbRequest, openIdbDatabase, runIdbTransaction } from "./indexedDbTransaction.mjs";
import { DATABASE_BACKUP_RECEIPT_KEY } from "./indexedDbBackupReceipt.mjs";

export const TRACK_SYNC_OFFSETS = Object.freeze({
  dbName: "ivLyrics-db",
  storeName: "track-sync-offsets",
});

export const TRACK_LANGUAGE_OVERRIDES = Object.freeze({
  dbName: "ivLyrics-lang-db",
  storeName: "track-language-overrides",
});

export const TRACK_LYRICS_PROVIDER_OVERRIDES = Object.freeze({
  dbName: "ivLyrics-provider-db",
  storeName: "track-lyrics-provider-overrides",
});

export const TRACK_BACKGROUND_OVERRIDES = Object.freeze({
  dbName: "ivLyrics-background-db",
  storeName: "track-background-overrides",
});

export function openTrackPreferenceDatabase(indexedDB, { dbName, storeName, version = 1 }, { onStoreCreated, onOpenError } = {}) {
  return openIdbDatabase(indexedDB, dbName, version, db => {
    if (!db.objectStoreNames.contains(storeName)) {
      db.createObjectStore(storeName);
      onStoreCreated?.();
    }
  }, { onRequestError: onOpenError });
}

export function createTrackPreferenceDatabase({
  dbName,
  storeName,
  version = 1,
  getIndexedDB,
  waitForDatabaseRecovery,
  sharePendingOpen = false,
  label = "",
  debug,
  logger = console,
}) {
  let database = null;
  const prefix = label ? `[ivLyrics] ${label} IndexedDB` : "[ivLyrics] IndexedDB";
  const openDatabase = async () => {
    if (database) return database;
    if (waitForDatabaseRecovery) await waitForDatabaseRecovery();
    const db = await openTrackPreferenceDatabase(getIndexedDB(), { dbName, storeName, version }, {
      onStoreCreated: () => debug(`${prefix} object store created`),
      onOpenError: error => logger.error(`${prefix} error:`, error),
    });
    const reset = () => { if (database === db) database = null; };
    db.onversionchange = () => { db.close(); reset(); };
    db.onclose = reset;
    database = db;
    debug(`${prefix} initialized`);
    return database;
  };
  if (!sharePendingOpen) return openDatabase;

  let opening = null;
  return () => opening ??= openDatabase().finally(() => { opening = null; });
}

export async function requestTrackPreference(db, storeName, operation, args, result = () => undefined) {
  if (operation === "get") {
    const store = db.transaction([storeName], "readonly").objectStore(storeName);
    return result(await awaitIdbRequest(store.get(...args)));
  }
  await runIdbTransaction(db, [storeName], "readwrite", tx => {
    tx.objectStore(storeName)[operation](...args);
  });
}

export function readAllTrackPreferences(db, storeName, normalize) {
  return new Promise((resolve, reject) => {
    const store = db.transaction([storeName], "readonly").objectStore(storeName);
    const request = store.getAllKeys();
    request.onsuccess = () => {
      const keys = request.result;
      const valuesRequest = store.getAll();
      valuesRequest.onsuccess = () => {
        const result = {};
        keys.forEach((key, index) => {
          if (key === DATABASE_BACKUP_RECEIPT_KEY) return;
          const value = normalize ? normalize(valuesRequest.result[index]) : valuesRequest.result[index];
          if (!normalize || value) result[key] = value;
        });
        resolve(result);
      };
      valuesRequest.onerror = () => reject(valuesRequest.error);
    };
    request.onerror = () => reject(request.error);
  });
}
