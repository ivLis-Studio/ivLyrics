const SYNC_CREATOR_AUTOSAVE_INTERVAL_MS = 3_000;
const alwaysOpen = () => true;

export function cancelSyncCreatorAutosave(timerRef, cancelTimer) {
  const timer = timerRef.current;
  timerRef.current = null;
  if (timer) cancelTimer(timer.id);
}

export function readSyncCreatorWorkingRecord(refs) {
  const { activeSessionDraftKeyRef, latestSessionRecordRef, sessionPendingSnapshotRef } = refs;
  const draftKey = activeSessionDraftKeyRef.current;
  if (!draftKey) return null;
  const pending = sessionPendingSnapshotRef.current;
  if (pending?.draftKey === draftKey) {
    const record = pending.buildRecord();
    if (sessionPendingSnapshotRef.current !== pending || activeSessionDraftKeyRef.current !== draftKey) return null;
    sessionPendingSnapshotRef.current = null;
    latestSessionRecordRef.current = record?.draftKey === draftKey ? record : null;
  }
  const latestRecord = latestSessionRecordRef.current;
  return latestRecord?.draftKey === draftKey ? latestRecord : null;
}

export function readSyncCreatorAutosaveRecord(refs) {
  return refs.sessionAutosaveEnabledRef.current && !refs.sessionAutosaveSuppressedRef.current
    ? readSyncCreatorWorkingRecord(refs) : null;
}

export function captureSyncCreatorDraftWriteOptions(resetRevisions, draftKey, saveIf) {
  const revision = resetRevisions.get(draftKey);
  return {
    isCurrent: () => resetRevisions.get(draftKey) === revision,
    saveIf,
  };
}

export function readSyncCreatorDraftBaseline(refs, draftKey) {
  const baseline = refs.sessionBaselineDraftRef.current;
  return baseline?.draftKey === draftKey ? baseline.snapshot : undefined;
}

export function saveSyncCreatorDraftSnapshot(store, refs, record) {
  return store.saveDraft(record, {
    ...captureSyncCreatorDraftWriteOptions(refs.sessionDraftResetRevisions, record.draftKey),
    baselineSnapshot: readSyncCreatorDraftBaseline(refs, record.draftKey),
  });
}

export function ownsSyncCreatorDraftSave(refs, record, generation) {
  return refs.latestSessionRecordRef.current === record
    && refs.activeSessionDraftKeyRef.current === record.draftKey
    && refs.sessionPendingSnapshotRef.current?.draftKey !== record.draftKey
    && refs.sessionWriteGenerationRef.current === generation;
}

export function useSyncCreatorDraftAutosave({
  useEffect, useLayoutEffect, useCallback, store, draftKey, readyDraftKey, hydrated, lyricsText, enabled,
  buildRecord, setSaveState, onSave, isEditorOpen = alwaysOpen, logger = console,
  refs,
  host: { windowEvents, documentEvents, scheduleTimer, cancelTimer },
}) {
  const {
    sessionAutosaveTimerRef: timer, latestSessionRecordRef: latestRecord,
    sessionAppliedDraftKeyRef: appliedDraftKey, sessionAutosaveSuppressedRef: suppressed,
    sessionWriteGenerationRef: writeGeneration, sessionPendingSnapshotRef: pendingSnapshot,
    sessionAutosaveEnabledRef: autosaveEnabled,
  } = refs;

  const scheduleAutosave = useCallback(function schedule(retryFor = null) {
    if (!store || timer.current || !autosaveEnabled.current || suppressed.current || !isEditorOpen()) return;
    const scheduled = { id: null };
    timer.current = scheduled;
    scheduled.id = scheduleTimer(async () => {
      if (timer.current !== scheduled) return;
      timer.current = null;
      if (!isEditorOpen()) return;
      const generation = writeGeneration.current;
      let pendingRecord;
      const ownsSave = () => isEditorOpen() && ownsSyncCreatorDraftSave(refs, pendingRecord, generation);
      try {
        pendingRecord = readSyncCreatorAutosaveRecord(refs);
        if (!pendingRecord) return;
        setSaveState("saving");
        const saved = await saveSyncCreatorDraftSnapshot(store, refs, pendingRecord);
        if (saved?.draftKey === pendingRecord.draftKey && ownsSave()) {
          latestRecord.current = saved;
          appliedDraftKey.current = saved.draftKey;
          onSave(saved);
        }
      } catch (error) {
        logger.warn("[SyncDataCreator] Autosave failed:", error);
        if (!isEditorOpen() || (pendingRecord && !ownsSave())) return;
        setSaveState("error");
        if (pendingRecord && pendingRecord !== retryFor) schedule(pendingRecord);
      }
    }, SYNC_CREATOR_AUTOSAVE_INTERVAL_MS);
  }, [appliedDraftKey, autosaveEnabled, isEditorOpen, latestRecord, logger, onSave,
    refs, scheduleTimer, setSaveState, store, suppressed, timer, writeGeneration]);

  useLayoutEffect(() => {
    if (!store || !hydrated || !draftKey || readyDraftKey !== draftKey || !lyricsText || suppressed.current) return;

    // Publish the committed editor state before another action can close it.
    // Compact and clone timing data only when a record is actually needed.
    pendingSnapshot.current = { draftKey, buildRecord };
    setSaveState(enabled ? "dirty" : "disabled");
    if (enabled) scheduleAutosave();
  }, [draftKey, buildRecord, enabled, lyricsText, hydrated, readyDraftKey, store, pendingSnapshot, scheduleAutosave, setSaveState, suppressed]);

  useEffect(() => {
    const reportFlushFailure = (error) => {
      logger.warn("[SyncDataCreator] Final autosave failed:", error);
    };
    const flushLatestSession = () => {
      if (!store) return;
      try {
        const record = readSyncCreatorAutosaveRecord(refs);
        if (record) saveSyncCreatorDraftSnapshot(store, refs, record).catch(reportFlushFailure);
      } catch (error) {
        reportFlushFailure(error);
      }
    };
    const handleVisibilityChange = () => {
      if (documentEvents.visibilityState === "hidden") flushLatestSession();
    };

    windowEvents.addEventListener("beforeunload", flushLatestSession);
    documentEvents.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      windowEvents.removeEventListener("beforeunload", flushLatestSession);
      documentEvents.removeEventListener("visibilitychange", handleVisibilityChange);
      cancelSyncCreatorAutosave(timer, cancelTimer);
      flushLatestSession();
    };
  }, [cancelTimer, documentEvents, logger, refs, store, timer, windowEvents]);

  return scheduleAutosave;
}
