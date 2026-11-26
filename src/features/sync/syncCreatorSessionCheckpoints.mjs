import {
	cancelSyncCreatorAutosave, ownsSyncCreatorDraftSave, readSyncCreatorDraftBaseline, readSyncCreatorWorkingRecord,
	saveSyncCreatorDraftSnapshot,
} from './syncCreatorDraftAutosave.mjs';

export function useSyncCreatorSessionCheckpoints({
	react: { useMemo, useCallback, useRef }, syncCreatorDraftStore,
	source: { activeSessionDraftKey, lyricsLines, lyricsText },
	editor: { activeParallelTargetId, currentLineIndex, isDragging, isKeyboardSyncingRef, mode, syncData },
	state: { sessionHistory, sessionHistoryCursorId },
	refs, ui, cancelTimer, i18n, toast, logger = console,
	buildSyncCreatorSessionRecord, applySyncCreatorSessionRecord, syncSessionUiFromRecord,
	claimSessionForLocalEditing, announceHistoryStatus, nextSessionClientRevision,
	lifetime,
}) {
	const { isOpen: isEditorOpen, canStartOperation, captureOperation } = lifetime;
	const {
		sessionAppliedDraftKeyRef,
		sessionCheckpointRestoreRequestRef,
		sessionWriteGenerationRef,
		sessionAutosaveTimerRef,
		activeSessionDraftKeyRef,
		latestSessionRecordRef, sessionPendingSnapshotRef,
	} = refs;
	const {
		setSessionReadyDraftKey,
		setSessionSaveState,
		setIsRestoringCheckpoint,
	} = ui;
	const restoreInFlight = useRef(null);

	const addManualCheckpoint = useCallback(async () => {
		if (!canStartOperation() || !syncCreatorDraftStore || !activeSessionDraftKey || !lyricsText) return;
		let record;
		try {
			record = buildSyncCreatorSessionRecord(syncData, {
				currentLineIndex,
				activeParallelPartId: activeParallelTargetId || 'full',
			});
		} catch (error) {
			logger.warn('[SyncDataCreator] Skipped invalid checkpoint:', error);
			return;
		}
		if (!record) return;

		claimSessionForLocalEditing();
		cancelSyncCreatorAutosave(sessionAutosaveTimerRef, cancelTimer);
		const writeGeneration = ++sessionWriteGenerationRef.current;
		sessionPendingSnapshotRef.current = null;
		const ownsSave = () => isEditorOpen() && ownsSyncCreatorDraftSave(refs, record, writeGeneration);
		latestSessionRecordRef.current = record;
		setSessionSaveState('saving');
		try {
			const saved = await syncCreatorDraftStore.appendCheckpoint(record, {
				kind: 'manual',
				lineIndex: currentLineIndex,
				lineText: lyricsLines[currentLineIndex] || '',
				partId: activeParallelTargetId,
				snapshot: record.draft,
				baselineSnapshot: readSyncCreatorDraftBaseline(refs, record.draftKey),
			});
			if (
				saved?.draftKey === record.draftKey && ownsSave()
			) {
				latestSessionRecordRef.current = saved;
				sessionAppliedDraftKeyRef.current = saved.draftKey;
				setSessionReadyDraftKey(saved.draftKey);
				syncSessionUiFromRecord(saved);
				announceHistoryStatus(i18n.t('syncCreator.historyCheckpointSaved') || '체크포인트를 저장했습니다.');
			}
		} catch (error) {
			logger.warn('[SyncDataCreator] Failed to save checkpoint:', error);
			if (ownsSave()) {
				setSessionSaveState('error');
			}
		}
	}, [
		activeParallelTargetId,
		activeSessionDraftKey,
		announceHistoryStatus,
		canStartOperation,
		cancelTimer,
		claimSessionForLocalEditing,
		i18n,
		logger,
		buildSyncCreatorSessionRecord,
		currentLineIndex,
		isEditorOpen,
		lyricsLines,
		lyricsText,
		syncCreatorDraftStore,
		syncData,
		syncSessionUiFromRecord
	]);

	const restore = useCallback(async ({ checkpointId, step }) => {
		if (
			!canStartOperation()
			|| !syncCreatorDraftStore
			|| !activeSessionDraftKey
			|| (!step && (!checkpointId || checkpointId === sessionHistoryCursorId))
			|| restoreInFlight.current === sessionCheckpointRestoreRequestRef.current
		) return;
		if (mode === 'record' || isDragging || isKeyboardSyncingRef.current) {
			toast.error(i18n.t('syncCreator.historyStopRecording') || '기록을 멈춘 뒤 작업 내역을 복원하세요.');
			return;
		}

		cancelSyncCreatorAutosave(sessionAutosaveTimerRef, cancelTimer);
		const requestId = ++sessionCheckpointRestoreRequestRef.current;
		restoreInFlight.current = requestId;
		const writeGeneration = ++sessionWriteGenerationRef.current;
		const restoringDraftKey = activeSessionDraftKey;
		const ownsRestore = () => isEditorOpen()
			&& requestId === sessionCheckpointRestoreRequestRef.current
			&& writeGeneration === sessionWriteGenerationRef.current
			&& restoringDraftKey === activeSessionDraftKeyRef.current;
		const canCommitRestore = captureOperation(ownsRestore);
		setIsRestoringCheckpoint(true);
		try {
			const currentWorkingRecord = readSyncCreatorWorkingRecord(refs);
			const saved = currentWorkingRecord?.draftKey === restoringDraftKey
				? await saveSyncCreatorDraftSnapshot(syncCreatorDraftStore, refs, currentWorkingRecord)
				: null;
			await syncCreatorDraftStore.flush();
			if (!canCommitRestore()) return;

			let targetId = checkpointId;
			let historyRevision;
			if (step) {
				// A pending edit may have created a new working checkpoint during the flush.
				const record = saved ?? await syncCreatorDraftStore.getDraft(restoringDraftKey);
				if (!canCommitRestore()) return;
				historyRevision = record?.clientRevision;
				const history = record?.history ?? [];
				const cursor = history.findIndex(entry => entry.id === record.historyCursorId);
				targetId = cursor < 0 ? undefined : history[cursor + step]?.id;
				if (!targetId) {
					if (saved && ownsSyncCreatorDraftSave(refs, currentWorkingRecord, writeGeneration)) {
						latestSessionRecordRef.current = saved;
						syncSessionUiFromRecord(saved);
					}
					return;
				}
			}

			setSessionSaveState('loading');
			announceHistoryStatus(i18n.t('syncCreator.historyRestoring') || '복원 중');
			const candidate = await syncCreatorDraftStore.getCheckpointCandidate(restoringDraftKey, targetId);
			if (!canCommitRestore()) return;
			if (historyRevision !== undefined && candidate.clientRevision !== historyRevision) {
				throw new Error('The Sync Creator draft changed while restoring history.');
			}
			const validatedCandidate = applySyncCreatorSessionRecord(candidate, { validateOnly: true });
			const restored = await syncCreatorDraftStore.restoreCheckpoint(
				restoringDraftKey,
				targetId,
				validatedCandidate.draft,
				nextSessionClientRevision(),
				{ isCurrent: canCommitRestore, expectedClientRevision: candidate.clientRevision }
			);
			// Once committed, the restored checkpoint owns the stored state even if closing has begun.
			if (!ownsRestore() || !restored) return;
			if (restored.historyCursorId !== targetId) {
				throw new Error('A newer Sync Creator state replaced this restore request.');
			}
			applySyncCreatorSessionRecord(restored);
			setSessionReadyDraftKey(restored.draftKey);
			if (canCommitRestore()) toast.success(i18n.t('syncCreator.historyRestored') || '작업 상태를 복원했습니다.');
		} catch (error) {
			logger.error('[SyncDataCreator] Failed to restore checkpoint:', error);
			if (!canCommitRestore()) return;
			setSessionSaveState('error');
			announceHistoryStatus(i18n.t('syncCreator.historyRestoreError') || '작업 상태를 복원하지 못했습니다.');
			toast.error(i18n.t('syncCreator.historyRestoreError') || '작업 상태를 복원하지 못했습니다.');
		} finally {
			if (restoreInFlight.current === requestId) restoreInFlight.current = null;
			if (isEditorOpen() && requestId === sessionCheckpointRestoreRequestRef.current) {
				setIsRestoringCheckpoint(false);
			}
		}
	}, [
		activeSessionDraftKey,
		announceHistoryStatus,
		applySyncCreatorSessionRecord,
		cancelTimer,
		canStartOperation,
		captureOperation,
		i18n,
		logger,
		toast,
		isDragging,
		isEditorOpen,
		mode,
		nextSessionClientRevision,
		sessionHistoryCursorId,
		syncCreatorDraftStore,
		syncSessionUiFromRecord,
	]);

	const historyCursorIndex = useMemo(() => (
		sessionHistory.findIndex(entry => entry.id === sessionHistoryCursorId)
	), [sessionHistory, sessionHistoryCursorId]);
	const restoreHistoryCheckpoint = useCallback(checkpointId => restore({ checkpointId }), [restore]);
	const moveHistoryCursor = useCallback(step => restore({ step }), [restore]);

	return { addManualCheckpoint, restoreHistoryCheckpoint, historyCursorIndex, moveHistoryCursor };
}

export function useSyncCreatorHistoryNavigation({
	react: { useEffect }, host, historyListRef, historyLength, sessionHistoryCursorId, moveHistoryCursor,
}) {
	useEffect(() => {
		const activeEntry = historyListRef.current?.querySelector?.('[aria-current="step"]');
		activeEntry?.scrollIntoView?.({ block: 'nearest' });
	}, [historyLength, sessionHistoryCursorId]);

	useEffect(() => {
		const handleHistoryShortcut = (event) => {
			const target = event.target;
			if (
				target?.isContentEditable
				|| ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName)
			) return;
			const key = String(event.key || '').toLowerCase();
			const hasPrimaryModifier = event.metaKey || event.ctrlKey;
			const isUndo = hasPrimaryModifier && key === 'z' && !event.shiftKey;
			const isRedo = (hasPrimaryModifier && key === 'z' && event.shiftKey)
				|| (event.ctrlKey && key === 'y');
			if (!isUndo && !isRedo) return;
			event.preventDefault();
			event.stopPropagation();
			moveHistoryCursor(isUndo ? -1 : 1);
		};

		host.addEventListener('keydown', handleHistoryShortcut, true);
		return () => host.removeEventListener('keydown', handleHistoryShortcut, true);
	}, [moveHistoryCursor]);
}
