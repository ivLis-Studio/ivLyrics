import { createSyncCreatorDraftHistoryCodec } from "./syncCreatorDraftHistoryCodec.mjs";

export function createSyncCreatorDraftRecords({ getStructuredClone, getCodec }) {
  const RECORD_VERSION = 1;
  // v2 invalidates results generated before the pronunciation writing-system
  // selector and script validation were introduced.
  // v3 invalidates results generated before Chinese tone marks were required.
  const CHARACTER_PRONUNCIATION_CACHE_VERSION = 3;
  const MAX_HISTORY_STATES = 40;

  const cloneValue = (value) => {
    if (value === null || value === undefined || typeof value !== "object") {
      return value;
    }

    const clone = getStructuredClone();
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
      ...(Array.isArray(record.sourceLineStarts) && record.sourceLineStarts.some(Number.isFinite)
        ? { sourceLineStarts: record.sourceLineStarts.map(time => Number.isFinite(time) && time >= 0 ? time : null) }
        : {}),
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

  const { packStoredRecord, unpackStoredRecord } = createSyncCreatorDraftHistoryCodec({
    getCodec, cloneValue, isPlainObject, normalizeDraft,
  });

  const decodeStoredRecord = (record) => {
    record = unpackStoredRecord(record);
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

  const historyContent = (snapshot) => {
    const { currentLineIndex, activeParallelPartId, ...editor } = snapshot.editor;
    return JSON.stringify({ ...snapshot, editor });
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
    lineIndex: Number(snapshot?.editor?.currentLineIndex) || 0,
  });

  const trimHistory = (history) => {
    if (history.length <= MAX_HISTORY_STATES) return history;
    const sourceEntry = history.find((entry) => entry.kind === "source");
    const tail = history.slice(-(MAX_HISTORY_STATES - (sourceEntry ? 1 : 0)));
    return sourceEntry && !tail.some((entry) => entry.id === sourceEntry.id)
      ? [sourceEntry, ...tail]
      : history.slice(-MAX_HISTORY_STATES);
  };

  const mergeAutosaveRecord = (existing, incoming, baselineSnapshot) => {
    if (existing && incoming.clientRevision <= existing.clientRevision) return existing;
    const createdAt = existing?.createdAt || incoming.createdAt;
    let history = existing?.history?.map(cloneValue) || [];
    let historyCursorId = existing?.historyCursorId || "";

    if (history.length === 0) {
      const baseline = normalizeDraft(baselineSnapshot) || incoming.draft;
      const sourceEntry = createInitialHistoryEntry({ ...incoming, createdAt }, baseline);
      if (!sourceEntry) throw new Error("Invalid Sync Creator source checkpoint.");
      history = [sourceEntry];
      historyCursorId = sourceEntry.id;
    }

    let cursorIndex = history.findIndex((entry) => entry.id === historyCursorId);
    if (cursorIndex < 0) cursorIndex = history.length - 1;
    const cursorEntry = history[cursorIndex];
    historyCursorId = cursorEntry.id;
    // Keep the navigation position in the live draft and preserve the redo branch.
    if (historyContent(cursorEntry.snapshot) !== historyContent(incoming.draft)) {
      const updatingWorkingTip = cursorEntry.kind === "working" && cursorIndex === history.length - 1;
      history = history.slice(0, cursorIndex + 1);
      const workingEntry = createHistoryEntry(incoming.draft, {
        id: updatingWorkingTip ? cursorEntry.id : undefined,
        kind: "working",
        lineIndex: Number(incoming.draft.editor.currentLineIndex) || 0,
      });
      if (!workingEntry) throw new Error("Invalid Sync Creator working checkpoint.");
      if (updatingWorkingTip) history[cursorIndex] = workingEntry;
      else history.push(workingEntry);
      historyCursorId = workingEntry.id;
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

  const mergeCheckpointRecord = (existing, incoming, checkpoint = {}) => {
    const baselineSnapshot = checkpoint.baselineSnapshot
      ? normalizeDraft(checkpoint.baselineSnapshot)
      : null;
    if (checkpoint.baselineSnapshot && !baselineSnapshot) {
      throw new Error("Invalid Sync Creator checkpoint record.");
    }
    if (existing && incoming.clientRevision <= existing.clientRevision) return existing;
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
    const entry = createHistoryEntry(checkpoint.snapshot || incoming.draft, checkpoint);
    if (!entry) throw new Error("Invalid Sync Creator checkpoint.");
    const current = history[cursorIndex];
    const promotesWorking = current?.kind === "working"
      && historyContent(current.snapshot) === historyContent(entry.snapshot);
    history = history.slice(0, cursorIndex + (promotesWorking ? 0 : 1));
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

  const mergeRestoredRecord = (existing, checkpointId, normalizedDraft, clientRevision, expectedClientRevision) => {
    if (!existing) throw new Error("Sync Creator draft was not found.");
    // A working checkpoint can keep its ID while another editor changes its snapshot.
    if (expectedClientRevision !== undefined && existing.clientRevision !== expectedClientRevision) {
      throw new Error("The Sync Creator draft changed while restoring history.");
    }
    if (clientRevision <= existing.clientRevision) return existing;
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

  return {
    RECORD_VERSION, CHARACTER_PRONUNCIATION_CACHE_VERSION, MAX_HISTORY_STATES,
    cloneValue, createLyricsFingerprint, normalizeTrackKey, createDraftKey,
    createCharacterPronunciationCacheKey, normalizeCharacterPronunciationResult, normalizeCharacterPronunciationRecord,
    normalizeDraft, normalizeRecord, decodeStoredRecord, packStoredRecord, unpackStoredRecord,
    mergeAutosaveRecord, mergeCheckpointRecord, mergeRestoredRecord,
  };
}
