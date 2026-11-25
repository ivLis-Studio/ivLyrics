import {
  TRACK_SYNC_OFFSETS,
  createTrackPreferenceDatabase,
  openTrackPreferenceDatabase,
  readAllTrackPreferences,
  requestTrackPreference,
} from "./trackPreferenceDatabase.mjs";
import { runIdbTransaction } from "./indexedDbTransaction.mjs";

const MAX_TRACK_SYNC_OFFSET = 10000;
export const TRACK_SYNC_OFFSETS_STORAGE_KEY = "ivLyrics:track-sync-offsets";
export const TRACK_SYNC_IMPORT_RECEIPT_KEY = "ivLyrics:settings-import-receipt";
export const TRACK_SYNC_OFFSETS_RESTORED_KEY = "ivLyrics:track-sync-offsets-restored";
export const isPrivateTrackSyncOffsetKey = key =>
  key === TRACK_SYNC_IMPORT_RECEIPT_KEY || key === TRACK_SYNC_OFFSETS_RESTORED_KEY;

export async function readTrackSyncImportReceipt(indexedDB) {
  const db = await openTrackPreferenceDatabase(indexedDB, TRACK_SYNC_OFFSETS);
  try {
    return await requestTrackPreference(db, TRACK_SYNC_OFFSETS.storeName, "get", [TRACK_SYNC_IMPORT_RECEIPT_KEY], value => value);
  } finally {
    db.close();
  }
}

export const normalizeTrackSyncOffsets = (
  offsetsObj,
  { ignoreInvalidEntries = false, logger = console } = {}
) => {
  const offsetsPrototype =
    offsetsObj && typeof offsetsObj === "object"
      ? Object.getPrototypeOf(offsetsObj)
      : null;
  const hasSupportedPrototype =
    offsetsPrototype === Object.prototype || offsetsPrototype === null;
  if (
    !offsetsObj ||
    typeof offsetsObj !== "object" ||
    Array.isArray(offsetsObj) ||
    (!ignoreInvalidEntries && !hasSupportedPrototype)
  ) {
    throw new TypeError("Invalid track sync offsets backup.");
  }

  const entries = Object.entries(offsetsObj);
  const normalizedOffsets = Object.create(null);
  let ignoredEntryCount = 0;

  entries.forEach(([trackUri, offset]) => {
    if (isPrivateTrackSyncOffsetKey(trackUri)) return;
    const numericOffset =
      typeof offset === "number"
        ? offset
        : typeof offset === "string" && offset.trim()
          ? Number(offset)
          : Number.NaN;

    if (!trackUri.startsWith("spotify:") || !Number.isFinite(numericOffset)) {
      if (ignoreInvalidEntries) {
        ignoredEntryCount += 1;
        return;
      }
      throw new TypeError("Track sync offsets backup has an invalid entry.");
    }

    normalizedOffsets[trackUri] = Math.max(
      -MAX_TRACK_SYNC_OFFSET,
      Math.min(MAX_TRACK_SYNC_OFFSET, Math.round(numericOffset))
    );
  });

  if (ignoredEntryCount > 0) {
    logger.warn(
      `[ivLyrics] Ignored ${ignoredEntryCount} invalid stored track sync offset entr${ignoredEntryCount === 1 ? "y" : "ies"}.`
    );
  }

  return normalizedOffsets;
};

export function readLegacyTrackSyncOffsets(storage, logger = console) {
  const raw = storage?.getItem(TRACK_SYNC_OFFSETS_STORAGE_KEY);
  if (!raw) return null;
  const parsed = JSON.parse(raw);
  const offsets = normalizeTrackSyncOffsets(parsed, { ignoreInvalidEntries: true, logger });
  if (Object.keys(parsed).length > 0 && Object.keys(offsets).length === 0) {
    throw new TypeError("Legacy track offsets have no recoverable entries.");
  }
  return offsets;
}

export function createTrackSyncOffsetStore({ getIndexedDB, debug, logger = console }) {
  const { storeName } = TRACK_SYNC_OFFSETS;
  const open = createTrackPreferenceDatabase({ ...TRACK_SYNC_OFFSETS, getIndexedDB, sharePendingOpen: true, debug, logger });

  return {
    async getOffset(trackUri) {
      if (!trackUri) return 0;
      try {
        const db = await open();
        return await requestTrackPreference(db, storeName, "get", [trackUri], value => value || 0);
      } catch (error) {
        logger.error("[ivLyrics] Failed to get offset:", error);
        return 0;
      }
    },

    async setOffset(trackUri, offset) {
      try {
        const db = await open();
        await requestTrackPreference(db, storeName, "put", [offset, trackUri]);
        return true;
      } catch (error) {
        logger.error("[ivLyrics] Failed to set offset:", error);
        return false;
      }
    },

    async clearOffset(trackUri) {
      try {
        const db = await open();
        return requestTrackPreference(db, storeName, "delete", [trackUri]);
      } catch (error) {
        logger.error("[ivLyrics] Failed to clear offset:", error);
      }
    },

    async getAllOffsets({ throwOnError = false, legacyStorage } = {}) {
      try {
        const db = await open();
        const offsets = await readAllTrackPreferences(db, storeName);
        if (legacyStorage && Object.keys(offsets).length === 0) {
          return { ...readLegacyTrackSyncOffsets(legacyStorage, logger) };
        }
        delete offsets[TRACK_SYNC_IMPORT_RECEIPT_KEY];
        delete offsets[TRACK_SYNC_OFFSETS_RESTORED_KEY];
        return offsets;
      } catch (error) {
        if (throwOnError) throw error;
        logger.error("[ivLyrics] Failed to get all offsets:", error);
        return {};
      }
    },

    async importOffsets(offsetsObj, { onlyIfEmpty = false, restoreId } = {}) {
      try {
        const normalizedOffsets = normalizeTrackSyncOffsets(offsetsObj, { logger });
        const db = await open();
        return await runIdbTransaction(db, [storeName], "readwrite", transaction => new Promise((resolve, reject) => {
          const store = transaction.objectStore(storeName);
          const writeOffsets = () => {
            try {
              for (const [trackUri, offset] of Object.entries(normalizedOffsets)) {
                store.put(offset, trackUri);
              }
              // An explicitly restored empty backup also replaces the old offsets.
              store.put(true, TRACK_SYNC_OFFSETS_RESTORED_KEY);
              if (restoreId) store.put(restoreId, TRACK_SYNC_IMPORT_RECEIPT_KEY);
              resolve(true);
            } catch (error) {
              reject(error);
            }
          };
          if (onlyIfEmpty) {
            // Checking and writing in one transaction protects new offsets
            // saved by the page or another window while migration is pending.
            const count = store.count();
            count.onsuccess = () => {
              // A previous restore may contain only a private receipt or marker.
              if (count.result === 0) writeOffsets();
              else resolve(null);
            };
            count.onerror = () => reject(count.error);
          } else {
            const clear = store.clear();
            clear.onsuccess = writeOffsets;
            clear.onerror = () => reject(clear.error);
          }
        }), "Track sync offset transaction aborted.");
      } catch (error) {
        logger.error("[ivLyrics] Failed to import offsets:", error);
        return false;
      }
    },
  };
}

export async function migrateTrackSyncOffsets({ localStorage, offsetStore, debug, logger = console }) {
  let offsetsObj;
  try {
    offsetsObj = readLegacyTrackSyncOffsets(localStorage, logger);
  } catch (error) {
    logger.error("[ivLyrics] Keeping invalid legacy track offsets:", error);
    return;
  }
  if (!offsetsObj) return;

  try {
    debug("[ivLyrics] Migrating track-sync-offsets to IndexedDB");
    const imported = await offsetStore.importOffsets(offsetsObj, { onlyIfEmpty: true });
    if (imported === null) {
      debug("[ivLyrics] IndexedDB offsets are already initialized; skipping migration");
    } else if (imported) {
      localStorage.removeItem(TRACK_SYNC_OFFSETS_STORAGE_KEY);
      debug("[ivLyrics] Migration complete");
    } else {
      logger.warn("[ivLyrics] Keeping legacy track offsets for a later retry.");
    }
  } catch (error) {
    logger.error("[ivLyrics] Migration failed:", error);
  }
}
