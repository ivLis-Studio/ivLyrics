(function IvLyricsSyncCreatorDraftStoreModule(root, factory) {
  "use strict";

  const api = factory(root || globalThis);

  if (root) {
    root.SyncCreatorDraftStore = api;
  }
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis, function createSyncCreatorDraftStore(root) {
  "use strict";

  const DB_NAME = "ivLyricsSyncCreatorDrafts";
  const DB_VERSION = 3;
  const STORE_NAME = "drafts";
  const CHARACTER_PRONUNCIATION_STORE_NAME = "characterPronunciations";
  const SCORE_WORK_STORE_NAME = "scoreWork";
  const RECORD_VERSION = 1;
  // v2 invalidates results generated before the pronunciation writing-system
  // selector and script validation were introduced.
  const CHARACTER_PRONUNCIATION_CACHE_VERSION = 2;
  const MAX_HISTORY_STATES = 40;
  const MAX_TRACK_DRAFTS = 6;
  const MAX_CHARACTER_PRONUNCIATION_CACHE_ENTRIES = 100;

  let databasePromise = null;
  let writeQueue = Promise.resolve();

  const cloneValue = (value) => {
    if (value === null || value === undefined || typeof value !== "object") {
      return value;
    }

    const clone = root?.structuredClone || globalThis.structuredClone;
    if (typeof clone === "function") {
      try {
        return clone(value);
      } catch (error) {
        // Sync Creator records are plain data, so the recursive fallback is safe.
      }
    }

    if (Array.isArray(value)) {
      return value.map(cloneValue);
    }

    const result = {};
    Object.entries(value).forEach(([key, child]) => {
      result[key] = cloneValue(child);
    });
    return result;
  };

  const isPlainObject = (value) => (
    value !== null
      && typeof value === "object"
      && !Array.isArray(value)
      && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
  );

  const hasInvalidNumber = (value, seen = new Set()) => {
    if (typeof value === "number") return !Number.isFinite(value);
    if (!value || typeof value !== "object") return false;
    if (seen.has(value)) return true;
    seen.add(value);
    const values = Array.isArray(value) ? value : Object.values(value);
    const invalid = values.some((child) => hasInvalidNumber(child, seen));
    seen.delete(value);
    return invalid;
  };

  const normalizeText = (value) => String(value || "").normalize("NFC");

  const hashText = (value) => {
    let hash = 2166136261;
    for (const character of Array.from(normalizeText(value))) {
      hash ^= character.codePointAt(0) || 0;
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  };

  const createLyricsFingerprint = (lyricsText) => {
    const comparableText = normalizeText(lyricsText)
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .join("\n");
    return `lyrics-${hashText(comparableText)}-${Array.from(comparableText).length.toString(36)}`;
  };

  const normalizeTrackKey = (value) => normalizeText(value).trim();

  const normalizeLanguageCode = (value, fallback = "auto") => (
    normalizeText(value).trim().toLowerCase() || fallback
  );

  const createCharacterPronunciationCacheKey = ({
    trackKey,
    lyricsFingerprint,
    sourceLang,
    targetLang,
  } = {}) => {
    const normalizedTrackKey = normalizeTrackKey(trackKey);
    const normalizedFingerprint = normalizeText(lyricsFingerprint).trim();
    const normalizedTargetLang = normalizeLanguageCode(targetLang, "");
    if (!normalizedTrackKey || !normalizedFingerprint || !normalizedTargetLang) return "";

    const cacheIdentity = [
      CHARACTER_PRONUNCIATION_CACHE_VERSION,
      normalizedTrackKey,
      normalizedFingerprint,
      normalizeLanguageCode(sourceLang),
      normalizedTargetLang,
    ].join("|");
    return `character-pronunciation:${hashText(cacheIdentity)}`;
  };

  const normalizeCharacterPronunciationResult = (result) => {
    if (!isPlainObject(result) || !Array.isArray(result.lines) || hasInvalidNumber(result)) {
      return null;
    }
    const hasValidLines = result.lines.every((line) => (
      isPlainObject(line)
        && Array.isArray(line.chars)
        && line.chars.every(isPlainObject)
        && (!Object.prototype.hasOwnProperty.call(line, "units")
          || (Array.isArray(line.units) && line.units.every(isPlainObject)))
    ));
    return hasValidLines ? cloneValue(result) : null;
  };

  const normalizeCharacterPronunciationRecord = (record) => {
    if (
      !isPlainObject(record)
      || record.cacheVersion !== CHARACTER_PRONUNCIATION_CACHE_VERSION
    ) return null;

    const trackKey = normalizeTrackKey(record.trackKey);
    const lyricsFingerprint = normalizeText(record.lyricsFingerprint).trim();
    const sourceLang = normalizeLanguageCode(record.sourceLang);
    const targetLang = normalizeLanguageCode(record.targetLang, "");
    const cacheKey = normalizeText(record.cacheKey).trim();
    const expectedCacheKey = createCharacterPronunciationCacheKey({
      trackKey,
      lyricsFingerprint,
      sourceLang,
      targetLang,
    });
    const result = normalizeCharacterPronunciationResult(record.result);
    const createdAt = normalizeTimestamp(record.createdAt);
    const updatedAt = normalizeTimestamp(record.updatedAt);
    if (
      !trackKey
      || !lyricsFingerprint
      || !targetLang
      || !cacheKey
      || cacheKey !== expectedCacheKey
      || !result
      || !createdAt
      || !updatedAt
    ) return null;

    return {
      cacheVersion: CHARACTER_PRONUNCIATION_CACHE_VERSION,
      cacheKey,
      trackKey,
      lyricsFingerprint,
      sourceLang,
      targetLang,
      createdAt,
      updatedAt,
      result,
    };
  };

  const createDraftKey = ({
    trackKey,
    provider,
    addonId,
    lyricsFingerprint,
    lrclibId,
  } = {}) => {
    const normalizedTrackKey = normalizeTrackKey(trackKey);
    const normalizedFingerprint = normalizeText(lyricsFingerprint).trim();
    if (!normalizedTrackKey || !normalizedFingerprint) return "";

    const sourceIdentity = [
      normalizeText(provider).trim().toLowerCase(),
      normalizeText(addonId).trim().toLowerCase(),
      normalizeText(lrclibId).trim(),
      normalizedFingerprint,
    ].join("|");

    return `${normalizedTrackKey}:${hashText(sourceIdentity)}`;
  };

  const normalizeTimestamp = (value) => {
    const timestamp = Number(value);
    return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : 0;
  };

  const normalizeDraft = (draft) => {
    if (!isPlainObject(draft) || hasInvalidNumber(draft)) return null;
    if (!isPlainObject(draft.editor)) return null;
    if (draft.syncData !== null && draft.syncData !== undefined) {
      if (!isPlainObject(draft.syncData) || !Array.isArray(draft.syncData.lines)) return null;
    }
    return cloneValue(draft);
  };

  const normalizeHistoryEntry = (entry) => {
    if (!isPlainObject(entry) || !entry.id) return null;
    const createdAt = normalizeTimestamp(entry.createdAt);
    const snapshot = normalizeDraft(entry.snapshot);
    if (!createdAt || !snapshot) return null;
    return {
      id: String(entry.id),
      kind: String(entry.kind || "manual"),
      createdAt,
      lineIndex: Number.isInteger(Number(entry.lineIndex)) ? Number(entry.lineIndex) : -1,
      lineText: normalizeText(entry.lineText).trim(),
      partId: normalizeText(entry.partId).trim(),
      snapshot,
    };
  };

  const normalizeRecord = (record) => {
    if (!isPlainObject(record) || record.recordVersion !== RECORD_VERSION) return null;
    const trackKey = normalizeTrackKey(record.trackKey);
    const lyricsFingerprint = normalizeText(record.lyricsFingerprint).trim();
    const expectedDraftKey = createDraftKey({
      trackKey,
      provider: record.provider,
      addonId: record.addonId,
      lyricsFingerprint,
      lrclibId: record.lrclibSource?.lrclibId,
    });
    const draftKey = normalizeText(record.draftKey).trim();
    const draft = normalizeDraft(record.draft);
    const createdAt = normalizeTimestamp(record.createdAt);
    const updatedAt = normalizeTimestamp(record.updatedAt);
    const durationMs = Number(record.durationMs);
    const hasClientRevision = Object.prototype.hasOwnProperty.call(record, "clientRevision");
    const rawClientRevision = record.clientRevision;
    // Early local builds used recordVersion 1 before clientRevision was added.
    const clientRevision = hasClientRevision
      ? rawClientRevision
      : Math.round(updatedAt * 1000);
    if (
      !trackKey
      || !lyricsFingerprint
      || !draftKey
      || draftKey !== expectedDraftKey
      || !draft
      || !createdAt
      || !updatedAt
      || !Number.isFinite(durationMs)
      || durationMs < 0
      || !Number.isSafeInteger(clientRevision)
      || clientRevision <= 0
      || hasInvalidNumber(record.lrclibSource)
    ) return null;

    const history = [];
    const historyIds = new Set();
    for (const candidate of Array.isArray(record.history) ? record.history : []) {
      const entry = normalizeHistoryEntry(candidate);
      if (!entry || historyIds.has(entry.id)) return null;
      historyIds.add(entry.id);
      history.push(entry);
    }
    const trimmedHistory = history.slice(-MAX_HISTORY_STATES);
    const requestedCursorId = normalizeText(record.historyCursorId).trim();
    const historyCursorId = trimmedHistory.some((entry) => entry.id === requestedCursorId)
      ? requestedCursorId
      : trimmedHistory[trimmedHistory.length - 1]?.id || "";

    return {
      recordVersion: RECORD_VERSION,
      draftKey,
      trackKey,
      trackId: normalizeText(record.trackId).trim(),
      trackUri: normalizeText(record.trackUri).trim(),
      isrc: normalizeText(record.isrc).trim(),
      title: normalizeText(record.title).trim(),
      artist: normalizeText(record.artist).trim(),
      album: normalizeText(record.album).trim(),
      durationMs: Math.max(0, Math.round(durationMs)),
      provider: normalizeText(record.provider).trim(),
      addonId: normalizeText(record.addonId).trim(),
      lyricsFingerprint,
      lyricsText: normalizeText(record.lyricsText),
      lrclibSource: record.lrclibSource ? cloneValue(record.lrclibSource) : null,
      karaokeSource: normalizeText(record.karaokeSource).trim(),
      clientRevision,
      createdAt,
      updatedAt,
      draft,
      history: trimmedHistory,
      historyCursorId,
    };
  };

  const decodeStoredRecord = (record) => {
    const strictRecord = normalizeRecord(record);
    if (strictRecord) return strictRecord;
    if (!isPlainObject(record) || record.recordVersion !== RECORD_VERSION) return null;

    // A single damaged current snapshot or history entry should not hide every
    // earlier valid checkpoint. The repaired value is read-only until the next
    // strict write passes normalizeRecord again.
    const history = [];
    const historyIds = new Set();
    for (const candidate of Array.isArray(record.history) ? record.history : []) {
      const entry = normalizeHistoryEntry(candidate);
      if (!entry || historyIds.has(entry.id)) continue;
      historyIds.add(entry.id);
      history.push(entry);
    }
    const trimmedHistory = history.slice(-MAX_HISTORY_STATES);
    const requestedCursorId = normalizeText(record.historyCursorId).trim();
    const requestedEntry = trimmedHistory.find((entry) => entry.id === requestedCursorId);
    const fallbackEntry = requestedEntry || trimmedHistory[trimmedHistory.length - 1] || null;
    const recoveredDraft = normalizeDraft(record.draft)
      || (fallbackEntry ? cloneValue(fallbackEntry.snapshot) : null);
    if (!recoveredDraft) return null;

    return normalizeRecord({
      ...record,
      draft: recoveredDraft,
      history: trimmedHistory,
      historyCursorId: fallbackEntry?.id || "",
    });
  };

  const snapshotsEqual = (left, right) => {
    try {
      return JSON.stringify(left) === JSON.stringify(right);
    } catch (error) {
      return false;
    }
  };

  const createCheckpointId = (kind = "state") => (
    `${Date.now().toString(36)}-${String(kind || "state")}-${Math.random().toString(36).slice(2, 8)}`
  );

  const createHistoryEntry = (snapshot, checkpoint = {}) => normalizeHistoryEntry({
    id: checkpoint.id || createCheckpointId(checkpoint.kind),
    kind: checkpoint.kind || "manual",
    createdAt: checkpoint.createdAt || Date.now(),
    lineIndex: checkpoint.lineIndex,
    lineText: checkpoint.lineText,
    partId: checkpoint.partId,
    snapshot,
  });

  const createInitialHistoryEntry = (record, snapshot = record.draft) => createHistoryEntry(snapshot, {
    kind: "source",
    createdAt: record.createdAt,
    lineIndex: Number(record.draft?.editor?.currentLineIndex) || 0,
  });

  const trimHistory = (history) => {
    if (history.length <= MAX_HISTORY_STATES) return history;
    const sourceEntry = history.find((entry) => entry.kind === "source");
    const tail = history.slice(-(MAX_HISTORY_STATES - (sourceEntry ? 1 : 0)));
    return sourceEntry && !tail.some((entry) => entry.id === sourceEntry.id)
      ? [sourceEntry, ...tail]
      : history.slice(-MAX_HISTORY_STATES);
  };

  const openDatabase = () => {
    if (databasePromise) return databasePromise;
    databasePromise = new Promise((resolve, reject) => {
      if (!root?.indexedDB) {
        reject(new Error("IndexedDB is unavailable."));
        return;
      }

      const request = root.indexedDB.open(DB_NAME, DB_VERSION);
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
        const resetConnection = () => {
          if (databasePromise) databasePromise = null;
        };
        database.onversionchange = () => {
          database.close();
          resetConnection();
        };
        database.onclose = resetConnection;
        resolve(database);
      };
      request.onerror = () => {
        databasePromise = null;
        reject(request.error || new Error("Failed to open Sync Creator drafts."));
      };
      request.onblocked = () => {
        console.warn("[SyncCreatorDraftStore] Database upgrade is blocked by another Spotify window.");
      };
    });
    databasePromise.catch(() => {
      databasePromise = null;
    });
    return databasePromise;
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
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(CHARACTER_PRONUNCIATION_STORE_NAME, "readwrite");
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
      existingRequest.onerror = () => reject(
        existingRequest.error || new Error("Failed to inspect the character pronunciation cache."),
      );
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(
        transaction.error || new Error("Failed to cache character pronunciation."),
      );
      transaction.onabort = () => reject(
        transaction.error || new Error("Character pronunciation cache update was aborted."),
      );
    });

    return cloneValue(normalizedRecord.result);
  });

  const mutateDraft = (draftKey, updater) => enqueueWrite(async () => {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const readRequest = store.get(draftKey);
      let nextRecord = null;

      readRequest.onsuccess = () => {
        try {
          const current = readRequest.result ? decodeStoredRecord(readRequest.result) : null;
          if (readRequest.result && !current) {
            console.warn("[SyncCreatorDraftStore] Replacing an unreadable draft with a validated state.");
          }
          nextRecord = updater(current);
          if (nextRecord) {
            const normalized = normalizeRecord(nextRecord);
            if (!normalized) throw new Error("Invalid Sync Creator draft record.");
            nextRecord = normalized;
            store.put(normalized);
          }
        } catch (error) {
          transaction.abort();
          reject(error);
        }
      };
      readRequest.onerror = () => reject(readRequest.error || new Error("Failed to read Sync Creator draft."));
      transaction.oncomplete = () => resolve(cloneValue(nextRecord));
      transaction.onerror = () => reject(transaction.error || new Error("Failed to update Sync Creator draft."));
      transaction.onabort = () => reject(transaction.error || new Error("Sync Creator draft update was aborted."));
    });
  });

  const pruneTrackDrafts = (trackKey, protectedDraftKey) => enqueueWrite(async () => {
    const normalizedTrackKey = normalizeTrackKey(trackKey);
    if (!normalizedTrackKey) return;
    const database = await openDatabase();
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
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
      readRequest.onerror = () => reject(readRequest.error || new Error("Failed to inspect old Sync Creator drafts."));
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error("Failed to prune old Sync Creator drafts."));
      transaction.onabort = () => reject(transaction.error || new Error("Sync Creator draft pruning was aborted."));
    });
  });

  const mergeAutosaveRecord = (existing, incoming) => {
      if (existing && incoming.clientRevision <= existing.clientRevision) return cloneValue(existing);
      const createdAt = existing?.createdAt || incoming.createdAt;
      let history = existing?.history?.map(cloneValue) || [];
      let historyCursorId = existing?.historyCursorId || "";

      if (history.length === 0) {
        const sourceEntry = createInitialHistoryEntry({ ...incoming, createdAt });
        if (!sourceEntry) throw new Error("Invalid Sync Creator source checkpoint.");
        history = [sourceEntry];
        historyCursorId = sourceEntry.id;
      } else {
        let cursorIndex = history.findIndex((entry) => entry.id === historyCursorId);
        if (cursorIndex < 0) cursorIndex = history.length - 1;
        const cursorEntry = history[cursorIndex];
        const draftChangedFromCursor = !cursorEntry
          || !snapshotsEqual(cursorEntry.snapshot, incoming.draft);
        if (draftChangedFromCursor) {
          if (cursorIndex < history.length - 1) {
            history = history.slice(0, cursorIndex + 1);
          }

          const currentEntry = history[history.length - 1];
          if (currentEntry?.kind === "working") {
            currentEntry.snapshot = cloneValue(incoming.draft);
            currentEntry.createdAt = Date.now();
            currentEntry.lineIndex = Number(incoming.draft?.editor?.currentLineIndex) || 0;
            historyCursorId = currentEntry.id;
          } else {
            const workingEntry = createHistoryEntry(incoming.draft, {
              kind: "working",
              lineIndex: Number(incoming.draft?.editor?.currentLineIndex) || 0,
            });
            if (!workingEntry) throw new Error("Invalid Sync Creator working checkpoint.");
            history.push(workingEntry);
            historyCursorId = workingEntry.id;
          }
        }
      }

      history = trimHistory(history);
      if (!history.some((entry) => entry.id === historyCursorId)) {
        historyCursorId = history[history.length - 1]?.id || "";
      }
      return normalizeRecord({
        ...existing,
        ...incoming,
        createdAt,
        updatedAt: Date.now(),
        history,
        historyCursorId,
      });
  };

  const saveDraft = async (record) => {
    const incoming = normalizeRecord(record);
    if (!incoming) throw new Error("Invalid Sync Creator draft record.");

    const saved = await mutateDraft(incoming.draftKey, (existing) => (
      mergeAutosaveRecord(existing, incoming)
    ));

    await pruneTrackDrafts(saved.trackKey, saved.draftKey).catch((error) => {
      console.warn("[SyncCreatorDraftStore] Failed to prune old drafts.", error);
    });
    return saved;
  };

  const mergeCheckpointRecord = (existing, incoming, checkpoint = {}) => {
    const baselineSnapshot = checkpoint.baselineSnapshot
      ? normalizeDraft(checkpoint.baselineSnapshot)
      : null;
    if (checkpoint.baselineSnapshot && !baselineSnapshot) {
      throw new Error("Invalid Sync Creator checkpoint record.");
    }
      if (existing && incoming.clientRevision <= existing.clientRevision) return cloneValue(existing);
      const createdAt = existing?.createdAt || incoming.createdAt;
      let history = existing?.history?.map(cloneValue) || [];
      let cursorId = existing?.historyCursorId || history[history.length - 1]?.id || "";
      if (history.length === 0) {
        const sourceEntry = createInitialHistoryEntry(
          { ...incoming, createdAt },
          baselineSnapshot || incoming.draft,
        );
        if (!sourceEntry) throw new Error("Invalid Sync Creator source checkpoint.");
        history.push(sourceEntry);
        cursorId = sourceEntry.id;
      }

      let cursorIndex = history.findIndex((entry) => entry.id === cursorId);
      if (cursorIndex < 0) cursorIndex = history.length - 1;
      if (history[cursorIndex]?.kind === "working") {
        history.splice(cursorIndex, 1);
        cursorIndex -= 1;
      }
      if (cursorIndex >= 0 && cursorIndex < history.length - 1) {
        history = history.slice(0, cursorIndex + 1);
      }

      const entry = createHistoryEntry(checkpoint.snapshot || incoming.draft, checkpoint);
      if (!entry) throw new Error("Invalid Sync Creator checkpoint.");
      history.push(entry);
      history = trimHistory(history);
      return normalizeRecord({
        ...existing,
        ...incoming,
        createdAt,
        updatedAt: Date.now(),
        draft: cloneValue(entry.snapshot),
        history,
        historyCursorId: entry.id,
      });
  };

  const appendCheckpoint = async (record, checkpoint = {}) => {
    const incoming = normalizeRecord(record);
    if (!incoming) throw new Error("Invalid Sync Creator checkpoint record.");
    const saved = await mutateDraft(incoming.draftKey, (existing) => (
      mergeCheckpointRecord(existing, incoming, checkpoint)
    ));
    await pruneTrackDrafts(saved.trackKey, saved.draftKey).catch((error) => {
      console.warn("[SyncCreatorDraftStore] Failed to prune old drafts.", error);
    });
    return saved;
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

  const mergeRestoredRecord = (existing, checkpointId, normalizedDraft, clientRevision) => {
      if (!existing) throw new Error("Sync Creator draft was not found.");
      if (clientRevision <= existing.clientRevision) return cloneValue(existing);
      const entryIndex = existing.history.findIndex((candidate) => candidate.id === checkpointId);
      if (entryIndex < 0) throw new Error("Sync Creator checkpoint was not found.");
      const history = existing.history.map(cloneValue);
      history[entryIndex].snapshot = cloneValue(normalizedDraft);
      return normalizeRecord({
        ...existing,
        clientRevision,
        updatedAt: Date.now(),
        draft: cloneValue(normalizedDraft),
        history,
        historyCursorId: checkpointId,
      });
  };

  const restoreCheckpoint = async (draftKey, checkpointId, validatedDraft, clientRevision) => {
    const normalizedDraft = normalizeDraft(validatedDraft);
    if (!normalizedDraft || !Number.isSafeInteger(clientRevision) || clientRevision <= 0) {
      throw new Error("Sync Creator checkpoint must be validated before restore.");
    }
    return mutateDraft(draftKey, (existing) => (
      mergeRestoredRecord(existing, checkpointId, normalizedDraft, clientRevision)
    ));
  };

  const deleteDraft = (draftKey) => enqueueWrite(async () => {
    if (!draftKey) return false;
    const database = await openDatabase();
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).delete(draftKey);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error("Failed to delete Sync Creator draft."));
      transaction.onabort = () => reject(transaction.error || new Error("Sync Creator draft deletion was aborted."));
    });
    return true;
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
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(SCORE_WORK_STORE_NAME, "readwrite");
      transaction.objectStore(SCORE_WORK_STORE_NAME).put({ scope, value: cloneValue(value), updatedAt: Date.now() });
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error("Failed to save sync work."));
      transaction.onabort = () => reject(transaction.error || new Error("Sync work save was aborted."));
    });
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
      normalizeDraft,
      normalizeCharacterPronunciationResult,
      normalizeCharacterPronunciationRecord,
    },
  };
});
