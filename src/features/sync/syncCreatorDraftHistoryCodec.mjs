export function createSyncCreatorDraftHistoryCodec({ getCodec, cloneValue, isPlainObject, normalizeDraft }) {
  const changedFields = (before, after) => ({
    put: Object.fromEntries(Object.entries(after).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(before[key]))),
    remove: Object.keys(before).filter(key => !Object.prototype.hasOwnProperty.call(after, key)),
  });
  const applyFields = (before, patch) => {
    if (!isPlainObject(patch?.put) || !Array.isArray(patch.remove)) throw new Error("Invalid draft patch");
    const value = { ...before };
    for (const key of patch.remove) delete value[key];
    for (const [key, item] of Object.entries(patch.put)) Object.defineProperty(value, key, { value: cloneValue(item), enumerable: true, writable: true, configurable: true });
    return value;
  };
  const compactDraft = (draft, codec) => {
    const result = cloneValue(draft);
    if (result?.syncData && codec) {
      try { result.syncData = codec.encode(result.syncData); } catch { /* Unfinished input remains recoverable. */ }
    }
    return result;
  };
  const draftPatch = (before, after, codec) => {
    const patch = changedFields(before, after);
    if (before.syncData?.version === 6 && after.syncData?.version === 6) {
      delete patch.put.syncData;
      patch.sync = codec.diff(before.syncData, after.syncData);
    }
    if (before.editor && after.editor) { delete patch.put.editor; patch.editor = changedFields(before.editor, after.editor); }
    return patch;
  };
  const applyDraftPatch = (before, patch, codec) => {
    const next = applyFields(before, patch);
    if (patch.sync) next.syncData = codec.applyPatch(before.syncData, patch.sync);
    if (patch.editor) next.editor = applyFields(before.editor, patch.editor);
    return next;
  };
  // Keep API recordVersion 1; storage encoding is private and old records are
  // read unchanged. Every tenth entry is independently recoverable after damage.
  const packStoredRecord = (record) => {
    const codec = getCodec();
    if (!codec) return record;

    const draft = compactDraft(record.draft, codec);
    const serializedDraft = JSON.stringify(draft);
    let matchingEntry = null;
    let previous = null;
    const history = record.history.map((entry, index) => {
      const snapshot = compactDraft(entry.snapshot, codec);
      const serializedSnapshot = JSON.stringify(snapshot);
      if (!matchingEntry && serializedSnapshot === serializedDraft) matchingEntry = entry;

      const patch = previous && index % 10 ? draftPatch(previous, snapshot, codec) : null;
      const next = { ...entry };
      if (patch && JSON.stringify(patch).length < serializedSnapshot.length) {
        next.patch = patch;
        delete next.snapshot;
      } else {
        next.snapshot = snapshot;
      }
      previous = snapshot;
      return next;
    });

    return {
      ...record,
      storageEncoding: 6,
      history,
      draft: matchingEntry ? { historyRef: matchingEntry.id } : draft,
    };
  };

  const unpackStoredRecord = record => {
    if (record?.storageEncoding !== 6) return record;
    const codec = getCodec();
    if (!codec) return null;
    let previous = null;
    const history = [];
    for (const entry of Array.isArray(record.history) ? record.history : []) {
      try {
        const snapshot = entry.patch ? applyDraftPatch(previous, entry.patch, codec) : cloneValue(entry.snapshot);
        if (snapshot?.syncData?.version === 6) codec.validate(snapshot.syncData);
        if (!normalizeDraft(snapshot)) throw new Error("Invalid checkpoint");
        const next = { ...entry, snapshot }; delete next.patch;
        history.push(next); previous = snapshot;
      } catch { previous = null; }
    }
    const draft = record.draft?.historyRef ? history.find(entry => entry.id === record.draft.historyRef)?.snapshot || null : record.draft;
    const result = { ...record, draft, history }; delete result.storageEncoding;
    return result;
  };
  return { packStoredRecord, unpackStoredRecord };
}
