import { createSyncCreatorDraftRecords } from "./syncCreatorDraftRecords.mjs";
import { runIdbTransaction } from "../../core/indexedDbTransaction.mjs";

export function createSyncCreatorDraftStore({
  getIndexedDB = () => globalThis.indexedDB,
  getStructuredClone = () => globalThis.structuredClone,
  getCodec,
}) {
  const DB_NAME = "ivLyricsSyncCreatorDrafts";
  const DB_VERSION = 3;
  const STORE_NAME = "drafts";
  const CHARACTER_PRONUNCIATION_STORE_NAME = "characterPronunciations";
  const SCORE_WORK_STORE_NAME = "scoreWork";
  const MAX_TRACK_DRAFTS = 6;
  const MAX_CHARACTER_PRONUNCIATION_CACHE_ENTRIES = 100;
  const {
    RECORD_VERSION, CHARACTER_PRONUNCIATION_CACHE_VERSION, MAX_HISTORY_STATES,
    cloneValue, createLyricsFingerprint, normalizeTrackKey, createDraftKey,
    createCharacterPronunciationCacheKey, normalizeCharacterPronunciationResult, normalizeCharacterPronunciationRecord,
    normalizeDraft, normalizeRecord, decodeStoredRecord, packStoredRecord, unpackStoredRecord,
    mergeAutosaveRecord, mergeCheckpointRecord, mergeRestoredRecord,
  } = createSyncCreatorDraftRecords({ getStructuredClone, getCodec });

  let databasePromise = null;
  let blockedOpenError = null;
  let writeQueue = Promise.resolve();

  const openDatabase = () => {
    if (databasePromise) return databasePromise;
    if (blockedOpenError) return Promise.reject(blockedOpenError);
    const opening = new Promise((resolve, reject) => {
      const indexedDB = getIndexedDB();
      if (!indexedDB) {
        reject(new Error("IndexedDB is unavailable."));
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(SCORE_WORK_STORE_NAME)) {
          database.createObjectStore(SCORE_WORK_STORE_NAME, { keyPath: "scope" });
        }
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          const store = database.createObjectStore(STORE_NAME, { keyPath: "draftKey" });
          store.createIndex("trackKey", "trackKey", { unique: false });
          store.createIndex("updatedAt", "updatedAt", { unique: false });
        }
        if (!database.objectStoreNames.contains(CHARACTER_PRONUNCIATION_STORE_NAME)) {
          const pronunciationStore = database.createObjectStore(
            CHARACTER_PRONUNCIATION_STORE_NAME,
            { keyPath: "cacheKey" },
          );
          pronunciationStore.createIndex("trackKey", "trackKey", { unique: false });
          pronunciationStore.createIndex("updatedAt", "updatedAt", { unique: false });
        }
      };
      request.onsuccess = () => {
        const database = request.result;
        blockedOpenError = null;
        if (databasePromise !== opening) {
          database.close();
          return;
        }
        const resetConnection = () => {
          if (databasePromise === opening) databasePromise = null;
        };
        database.onversionchange = () => {
          database.close();
          resetConnection();
        };
        database.onclose = resetConnection;
        resolve(database);
      };
      request.onerror = () => {
        blockedOpenError = null;
        reject(request.error || new Error("Failed to open Sync Creator drafts."));
      };
      request.onblocked = () => {
        blockedOpenError = new Error("Sync Creator draft storage is blocked by another Spotify window.");
        reject(blockedOpenError);
      };
    });
    databasePromise = opening;
    opening.catch(() => {
      if (databasePromise === opening) databasePromise = null;
    });
    return opening;
  };

  const requestResult = (request) => new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB request failed."));
  });

  const waitForWrites = () => writeQueue.catch(() => undefined);

  const getDraft = async (draftKey) => {
    if (!draftKey) return null;
    await waitForWrites();
    const database = await openDatabase();
    const transaction = database.transaction(STORE_NAME, "readonly");
    const result = await requestResult(transaction.objectStore(STORE_NAME).get(draftKey));
    return decodeStoredRecord(result);
  };

  const getDraftsForTrack = async (trackKey) => {
    const normalizedTrackKey = normalizeTrackKey(trackKey);
    if (!normalizedTrackKey) return [];
    await waitForWrites();
    const database = await openDatabase();
    const transaction = database.transaction(STORE_NAME, "readonly");
    const results = await requestResult(
      transaction.objectStore(STORE_NAME).index("trackKey").getAll(normalizedTrackKey),
    );
    return (Array.isArray(results) ? results : [])
      .map(decodeStoredRecord)
      .filter(Boolean)
      .sort((left, right) => right.updatedAt - left.updatedAt);
  };

  const getLatestDraftForTrack = async (trackKey) => (
    (await getDraftsForTrack(trackKey))[0] || null
  );

  const getCharacterPronunciationCache = async (options = {}) => {
    const cacheKey = createCharacterPronunciationCacheKey(options);
    if (!cacheKey) return null;
    await waitForWrites();
    const database = await openDatabase();
    const transaction = database.transaction(CHARACTER_PRONUNCIATION_STORE_NAME, "readonly");
    const storedRecord = await requestResult(
      transaction.objectStore(CHARACTER_PRONUNCIATION_STORE_NAME).get(cacheKey),
    );
    const record = normalizeCharacterPronunciationRecord(storedRecord);
    return record ? cloneValue(record.result) : null;
  };

  const enqueueWrite = (operation) => {
    const next = writeQueue.catch(() => undefined).then(operation);
    writeQueue = next.catch(() => undefined);
    return next;
  };

  const setCharacterPronunciationCache = (options = {}, result) => enqueueWrite(async () => {
    const cacheKey = createCharacterPronunciationCacheKey(options);
    const normalizedResult = normalizeCharacterPronunciationResult(result);
    if (!cacheKey || !normalizedResult) {
      throw new Error("Invalid Sync Creator character pronunciation cache entry.");
    }

    const now = Date.now();
    const normalizedRecord = normalizeCharacterPronunciationRecord({
      cacheVersion: CHARACTER_PRONUNCIATION_CACHE_VERSION,
      cacheKey,
      trackKey: options.trackKey,
      lyricsFingerprint: options.lyricsFingerprint,
      sourceLang: options.sourceLang,
      targetLang: options.targetLang,
      createdAt: now,
      updatedAt: now,
      result: normalizedResult,
    });
    if (!normalizedRecord) {
      throw new Error("Invalid Sync Creator character pronunciation cache record.");
    }

    const database = await openDatabase();
    await runIdbTransaction(database, CHARACTER_PRONUNCIATION_STORE_NAME, "readwrite", transaction => {
      const store = transaction.objectStore(CHARACTER_PRONUNCIATION_STORE_NAME);
      const existingRequest = store.get(cacheKey);

      existingRequest.onsuccess = () => {
        const existing = normalizeCharacterPronunciationRecord(existingRequest.result);
        store.put({
          ...normalizedRecord,
          createdAt: existing?.createdAt || normalizedRecord.createdAt,
        });

        const allRecordsRequest = store.getAll();
        allRecordsRequest.onsuccess = () => {
          const rawRecords = Array.isArray(allRecordsRequest.result) ? allRecordsRequest.result : [];
          const records = rawRecords
            .map((record) => {
              const normalized = normalizeCharacterPronunciationRecord(record);
              if (!normalized && typeof record?.cacheKey === "string" && record.cacheKey) {
                store.delete(record.cacheKey);
              }
              return normalized;
            })
            .filter(Boolean)
            .sort((left, right) => right.updatedAt - left.updatedAt);
          records
            .filter((record) => record.cacheKey !== cacheKey)
            .slice(Math.max(0, MAX_CHARACTER_PRONUNCIATION_CACHE_ENTRIES - 1))
            .forEach((record) => store.delete(record.cacheKey));
        };
      };
    }, "Character pronunciation cache update was aborted.");

    return cloneValue(normalizedRecord.result);
  });

  const mutateDraft = (draftKey, updater, { isCurrent, saveIf, prune = false }) => enqueueWrite(async () => {
    if (saveIf && !(await saveIf)) return null;
    if (isCurrent && !isCurrent()) return null;
    const database = await openDatabase();
    let written = false;
    const record = await runIdbTransaction(database, STORE_NAME, "readwrite", transaction => new Promise((resolve, reject) => {
      const store = transaction.objectStore(STORE_NAME);
      const readRequest = store.get(draftKey);

      readRequest.onsuccess = () => {
        try {
          if (isCurrent && !isCurrent()) return resolve(null);
          const current = readRequest.result ? decodeStoredRecord(readRequest.result) : null;
          if (readRequest.result && !current) {
            console.warn("[SyncCreatorDraftStore] Replacing an unreadable draft with a validated state.");
          }
          let nextRecord = updater(current);
          if (nextRecord && nextRecord !== current) {
            const normalized = normalizeRecord(nextRecord);
            if (!normalized) throw new Error("Invalid Sync Creator draft record.");
            nextRecord = normalized;
            store.put(packStoredRecord(normalized));
            written = true;
          }
          resolve(nextRecord);
        } catch (error) {
          reject(error);
        }
      };
      readRequest.onerror = () => reject(readRequest.error || new Error("Failed to read Sync Creator draft."));
    }), "Sync Creator draft update was aborted.");
    if (written && prune) {
      try {
        await pruneTrackDrafts(database, record.trackKey, record.draftKey);
      } catch (error) {
        console.warn("[SyncCreatorDraftStore] Failed to prune old drafts.", error);
      }
    }
    return cloneValue(record);
  });

  async function pruneTrackDrafts(database, trackKey, protectedDraftKey) {
    const normalizedTrackKey = normalizeTrackKey(trackKey);
    if (!normalizedTrackKey) return;
    await runIdbTransaction(database, STORE_NAME, "readwrite", transaction => {
      const store = transaction.objectStore(STORE_NAME);
      const readRequest = store.index("trackKey").getAll(normalizedTrackKey);
      readRequest.onsuccess = () => {
        const drafts = (Array.isArray(readRequest.result) ? readRequest.result : [])
          .map(decodeStoredRecord)
          .filter(Boolean)
          .sort((left, right) => right.updatedAt - left.updatedAt);
        drafts
          .filter((record) => record.draftKey !== protectedDraftKey)
          .slice(Math.max(0, MAX_TRACK_DRAFTS - 1))
          .forEach((record) => store.delete(record.draftKey));
      };
    }, "Sync Creator draft pruning was aborted.");
  }

  const saveDraft = async (record, { isCurrent, saveIf, baselineSnapshot } = {}) => {
    const incoming = normalizeRecord(record);
    if (!incoming) throw new Error("Invalid Sync Creator draft record.");

    return mutateDraft(incoming.draftKey, existing => mergeAutosaveRecord(existing, incoming, baselineSnapshot), {
      isCurrent, saveIf, prune: true,
    });
  };

  const appendCheckpoint = async (record, checkpoint = {}) => {
    const incoming = normalizeRecord(record);
    if (!incoming) throw new Error("Invalid Sync Creator checkpoint record.");
    return mutateDraft(incoming.draftKey, existing => mergeCheckpointRecord(existing, incoming, checkpoint), {
      prune: true,
    });
  };

  const getCheckpointCandidate = async (draftKey, checkpointId) => {
    const existing = await getDraft(draftKey);
    if (!existing) throw new Error("Sync Creator draft was not found.");
    const entry = existing.history.find((candidate) => candidate.id === checkpointId);
    if (!entry) throw new Error("Sync Creator checkpoint was not found.");
    return {
      ...existing,
      draft: cloneValue(entry.snapshot),
      historyCursorId: entry.id,
    };
  };

  const restoreCheckpoint = async (draftKey, checkpointId, validatedDraft, clientRevision, { isCurrent, expectedClientRevision } = {}) => {
    const normalizedDraft = normalizeDraft(validatedDraft);
    if (!normalizedDraft || !Number.isSafeInteger(clientRevision) || clientRevision <= 0) {
      throw new Error("Sync Creator checkpoint must be validated before restore.");
    }
    return mutateDraft(draftKey, existing => mergeRestoredRecord(
      existing, checkpointId, normalizedDraft, clientRevision, expectedClientRevision,
    ), {
      isCurrent,
    });
  };

  const deleteDraft = (draftKey, { beforeDelete } = {}) => enqueueWrite(async () => {
    if (!draftKey) return false;
    const database = await openDatabase();
    return runIdbTransaction(database, STORE_NAME, "readwrite", transaction => new Promise((resolve, reject) => {
      const store = transaction.objectStore(STORE_NAME);
      const remove = () => {
        try {
          if (beforeDelete && !beforeDelete()) return resolve(false);
          store.delete(draftKey);
          resolve(true);
        } catch (error) {
          reject(error);
        }
      };
      // Let the transaction acquire the write lock before checking the editor.
      if (beforeDelete) store.getKey(draftKey).onsuccess = remove;
      else remove();
    }), "Sync Creator draft deletion was aborted.");
  });

  const flush = () => waitForWrites();

  const getScoreWork = async (scope) => {
    await waitForWrites();
    const database = await openDatabase();
    const transaction = database.transaction(SCORE_WORK_STORE_NAME, "readonly");
    const record = await requestResult(transaction.objectStore(SCORE_WORK_STORE_NAME).get(scope));
    return record?.value ? cloneValue(record.value) : null;
  };

  const saveScoreWork = (scope, value) => enqueueWrite(async () => {
    const database = await openDatabase();
    await runIdbTransaction(database, SCORE_WORK_STORE_NAME, "readwrite", transaction => {
      transaction.objectStore(SCORE_WORK_STORE_NAME).put({ scope, value: cloneValue(value), updatedAt: Date.now() });
    }, "Sync work save was aborted.");
  });

  return {
    DB_NAME,
    RECORD_VERSION,
    CHARACTER_PRONUNCIATION_CACHE_VERSION,
    MAX_HISTORY_STATES,
    cloneValue,
    createLyricsFingerprint,
    createDraftKey,
    createCharacterPronunciationCacheKey,
    normalizeRecord,
    getDraft,
    getDraftsForTrack,
    getLatestDraftForTrack,
    getCharacterPronunciationCache,
    setCharacterPronunciationCache,
    saveDraft,
    appendCheckpoint,
    getCheckpointCandidate,
    restoreCheckpoint,
    deleteDraft,
    getScoreWork,
    saveScoreWork,
    flush,
    __test: {
      mergeAutosaveRecord,
      mergeCheckpointRecord,
      mergeRestoredRecord,
      decodeStoredRecord,
      packStoredRecord, unpackStoredRecord,
      normalizeDraft,
      normalizeCharacterPronunciationResult,
      normalizeCharacterPronunciationRecord,
    },
  };
}
