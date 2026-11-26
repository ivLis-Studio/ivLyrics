import { SYNC_CREATOR_SOURCE_ADDON_ID, getSyncCreatorLyricsFingerprintFromText } from "./lrclibSyncSource.mjs";
import { getSyncCreatorFlatLyricsCharsFromText, normalizeSyncCreatorStandaloneParentheticalLines } from "./syncCreatorLyricText.mjs";

export function createSyncCreatorSessionRecord({
  store, source, syncData, timingCleared = false, prepareSyncData, editor, editorOverrides, scoreEvents, nextClientRevision,
}) {
  if (!store || !source.draftKey || !source.trackKey || !source.lyricsText) return null;

  const persistedSyncData = syncData ? prepareSyncData(syncData) : null;
  // Only the anonymous import baseline belongs in a local draft. It cannot
  // attest to recording work, effects, manual changes, or elapsed time.
  const scoreImportBaseline = scoreEvents.find((event) => (
    !event.accountId && event.action === "import" && event.trackUri === source.trackUri
  ))?.baseline || null;
  const persistedEditor = {
    scoreImportBaseline: store.cloneValue(scoreImportBaseline),
    ...editor,
    parallelPartMetaDrafts: store.cloneValue(editor.parallelPartMetaDrafts),
    manualParallelSplitDrafts: store.cloneValue(editor.manualParallelSplitDrafts),
    parentheticalLayoutDrafts: store.cloneValue(editor.parentheticalLayoutDrafts),
    mergedLineDrafts: store.cloneValue(editor.mergedLineDrafts),
    lineMetaDrafts: store.cloneValue(editor.lineMetaDrafts),
    lineStyleDrafts: store.cloneValue(editor.lineStyleDrafts),
    ...editorOverrides,
  };

  return {
    recordVersion: store.RECORD_VERSION,
    ...source,
    lrclibSource: source.lrclibSource ? store.cloneValue(source.lrclibSource) : null,
    clientRevision: nextClientRevision(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    draft: {
      syncData: persistedSyncData ? store.cloneValue(persistedSyncData) : null,
      ...(timingCleared ? { timingCleared: true } : {}),
      editor: persistedEditor,
    },
  };
}

export function isSyncCreatorDraftTimingCleared(record) {
  if (!record?.draft || record.draft.syncData?.lines?.length) return false;
  if (record.draft.timingCleared === true) return true;
  // Older drafts could only express this edit through their source checkpoint.
  return Array.isArray(record.history) && record.history.some(
    entry => entry?.kind === "source" && entry.snapshot?.syncData?.lines?.length > 0
  );
}

export function prepareSyncCreatorSessionRestore(record, { store, sanitizeSyncData, assertValidSyncData, restoreDraftMergeTiming }) {
  if (!record?.draft || !record.lyricsText) {
    throw new Error("Invalid Sync Creator recovery data.");
  }

  const lyricsText = normalizeSyncCreatorStandaloneParentheticalLines(String(record.lyricsText || "").normalize("NFC"));
  if (!lyricsText.trim()) throw new Error("Recovered lyrics are empty.");

  const fingerprint = store?.createLyricsFingerprint?.(lyricsText);
  if (record.lyricsFingerprint && fingerprint && record.lyricsFingerprint !== fingerprint) {
    throw new Error("Recovered lyrics fingerprint does not match.");
  }

  const flatLyricsChars = getSyncCreatorFlatLyricsCharsFromText(lyricsText);
  const editor = record.draft.editor && typeof record.draft.editor === "object" ? record.draft.editor : {};
  let syncData = null;
  if (record.draft.syncData) {
    syncData = sanitizeSyncData(record.draft.syncData, flatLyricsChars);
    if (!syncData) throw new Error("Recovered sync data does not match the lyrics.");
    assertValidSyncData(syncData);
    if (editor.mergedLineDrafts && restoreDraftMergeTiming) {
      const restored = restoreDraftMergeTiming(syncData, lyricsText, editor);
      if (restored !== syncData) assertValidSyncData(restored);
      syncData = restored;
    }
  }

  const lines = lyricsText.split("\n").map((line) => line.trim()).filter(Boolean).map((text) => ({ text }));
  const starts = record.sourceLineStarts;
  const sourceLines = Array.isArray(starts) && starts.length === lines.length
    ? lines.map((line, index) => Number.isFinite(starts[index]) && starts[index] >= 0 ? { ...line, startTime: starts[index] } : line)
    : lines;
  const lineIndex = Math.max(0, Math.min(lines.length - 1, Number(editor.currentLineIndex) || 0));
  const provider = String(record.provider || record.lrclibSource?.provider || "").trim();
  const addonId = String(record.addonId || provider.split("-")[0] || "").trim();
  if (addonId.toLowerCase() !== SYNC_CREATOR_SOURCE_ADDON_ID) {
    throw new Error("Only LRCLIB Sync Creator sessions can be restored.");
  }

  return {
    validatedRecord: { ...record, draft: { ...record.draft, syncData } },
    lyricsText, lines, sourceLines, flatLyricsChars, editor, lineIndex, provider, syncData,
  };
}

export function findRecoverableSyncCreatorSession(records, { store, validateRecord }) {
  const validate = (candidate) => {
    try {
      return validateRecord(candidate);
    } catch (error) {
      console.warn("[SyncDataCreator] Skipped a damaged recovery state:", error);
      return null;
    }
  };
  for (const record of Array.isArray(records) ? records : []) {
    if (record == null) continue;
    const current = validate(record);
    if (current) return current;
    const history = Array.isArray(record?.history) ? [...record.history].reverse() : [];
    for (const entry of history) {
      if (!entry?.snapshot || entry.id === record.historyCursorId) continue;
      const fallback = validate({ ...record, draft: store.cloneValue(entry.snapshot), historyCursorId: entry.id });
      if (fallback) return fallback;
    }
  }
  return null;
}

export async function findUnsubmittedSyncCreatorSession({
  store, trackKey, text, provider, addonId, lrclibSource, isStaleSource, validateRecord, allowUntimedExactDraft = false,
  readDraft = key => store.getDraft(key), readTrackDrafts = key => store.getDraftsForTrack(key),
}) {
  if (!store || !trackKey || !text || (!provider && !addonId)) return null;
  const fingerprint = store.createLyricsFingerprint?.(text) || getSyncCreatorLyricsFingerprintFromText(text);
  const exactDraftKey = store.createDraftKey({
    trackKey, provider, addonId, lyricsFingerprint: fingerprint, lrclibId: lrclibSource?.lrclibId ?? "",
  });
  const hasTiming = record => record?.draft?.syncData?.lines?.length > 0;
  const validate = (record, allowUntimed = false) => {
    if (!record) return null;
    try {
      const validated = validateRecord(record);
      return hasTiming(validated) || (allowUntimed && validated?.draft) ? validated : null;
    } catch {
      return null;
    }
  };
  if (exactDraftKey) {
    let exact;
    try {
      exact = await readDraft(exactDraftKey);
    } catch (error) {
      console.warn("[SyncDataCreator] Failed to check the unsubmitted draft:", error);
    }
    if (isStaleSource()) return null;
    const validated = validate(exact, allowUntimedExactDraft || isSyncCreatorDraftTimingCleared(exact));
    if (validated) return validated;
  }

  let trackDrafts;
  try {
    trackDrafts = await readTrackDrafts(trackKey);
  } catch (error) {
    console.warn("[SyncDataCreator] Failed to list unsubmitted drafts:", error);
  }
  if (isStaleSource()) return null;

  for (const candidate of Array.isArray(trackDrafts) ? trackDrafts : []) {
    if (candidate?.draftKey === exactDraftKey || candidate?.lyricsFingerprint !== fingerprint || !hasTiming(candidate)) continue;
    const validated = validate(candidate);
    if (validated) return validated;
  }
  return null;
}
