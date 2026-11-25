import {
	cancelSyncCreatorAutosave, readSyncCreatorAutosaveRecord, readSyncCreatorDraftBaseline, readSyncCreatorWorkingRecord,
	saveSyncCreatorDraftSnapshot,
} from './syncCreatorDraftAutosave.mjs';
import { createSyncCreatorOutgoingDrafts } from './syncCreatorOutgoingDrafts.mjs';

const SYNC_CREATOR_AUTOSAVE_ENABLED_STORAGE_KEY = 'ivLyrics:syncCreator:autosave-enabled';

export function createSyncCreatorSessionLifecycle({
	syncCreatorDraftStore, pendingPlaybackNavigationRef, refs, ui, getStorage,
	now = Date.now, cancelTimer, scheduleFrame, i18n, toast, logger = console,
}) {
	const {
		sessionAppliedDraftKeyRef, sessionRecoveryRequestRef, sessionSourceChangeRequestRef, sessionEditorRevisionRef,
		sessionCheckpointRestoreRequestRef, sessionWriteGenerationRef, sessionClientRevisionRef, sessionDraftResetRevisions,
		sessionAutosaveTimerRef, sessionAutosaveEnabledRef, sessionAutosaveSuppressedRef,
		sessionAutoRecoveryBlockedRef, sessionBaselineDraftRef, activeSessionDraftKeyRef,
		sessionSkipRecoveryDraftKeyRef, sessionSkipNextSourceRecoveryRef, latestSessionRecordRef, sessionPendingSnapshotRef,
		sessionLastRecoveryAnnouncementRef,
	} = refs;
	const {
		setSessionHistory, setSessionHistoryCursorId, setSessionHydrationComplete, setSessionReadyDraftKey,
		setSessionSaveState, setLastSessionSavedAt, setHistoryAnnouncement, setIsRestoringCheckpoint,
		setIsSessionAutosaveEnabled,
	} = ui;
	let currentDeletion = null;
	const reportOutgoingWriteError = error => logger.warn('[SyncDataCreator] Failed to flush the previous source draft:', error);
	const outgoingDrafts = createSyncCreatorOutgoingDrafts({
		store: syncCreatorDraftStore, resetRevisions: sessionDraftResetRevisions, onWriteError: reportOutgoingWriteError,
	});
	const invalidateDraftOperations = () => {
		sessionRecoveryRequestRef.current += 1;
		sessionCheckpointRestoreRequestRef.current += 1;
		sessionWriteGenerationRef.current += 1;
		sessionEditorRevisionRef.current += 1;
	};
	const nextSessionClientRevision = () => {
		const wallClockRevision = now() * 1000;
		sessionClientRevisionRef.current = Math.max(
			sessionClientRevisionRef.current + 1,
			wallClockRevision
		);
		return sessionClientRevisionRef.current;
	};
	const claimSessionForLocalEditing = () => {
		pendingPlaybackNavigationRef.current = false;
		// Once the user starts editing, no pending or newly scheduled automatic
		// recovery may replace the live editor state.
		sessionAutoRecoveryBlockedRef.current = true;
		invalidateDraftOperations();
		setIsRestoringCheckpoint(false);
		setSessionHydrationComplete(true);
		if (activeSessionDraftKeyRef.current && !sessionAutosaveSuppressedRef.current) {
			sessionAppliedDraftKeyRef.current = activeSessionDraftKeyRef.current;
			setSessionReadyDraftKey(activeSessionDraftKeyRef.current);
		}
	};
	const toggleSessionAutosave = () => {
		const enabled = !sessionAutosaveEnabledRef.current;
		sessionAutosaveEnabledRef.current = enabled;
		try {
			getStorage()?.setItem(SYNC_CREATOR_AUTOSAVE_ENABLED_STORAGE_KEY, String(enabled));
		} catch {
			// The toggle still applies to this session when storage is unavailable.
		}
		sessionWriteGenerationRef.current++;
		cancelSyncCreatorAutosave(sessionAutosaveTimerRef, cancelTimer);
		setIsSessionAutosaveEnabled(enabled);
		setSessionSaveState(enabled && (sessionPendingSnapshotRef.current || latestSessionRecordRef.current)
			? 'dirty' : (enabled ? 'idle' : 'disabled'));
	};

	const retireWorkingDraft = (saveOutgoing) => {
		const pendingDelete = currentDeletion?.draftKey === activeSessionDraftKeyRef.current
			? currentDeletion.pendingWrite : null;
		currentDeletion = null;
		cancelSyncCreatorAutosave(sessionAutosaveTimerRef, cancelTimer);
		try {
			if (saveOutgoing && syncCreatorDraftStore && sessionAutosaveEnabledRef.current) {
				const record = pendingDelete ? readSyncCreatorWorkingRecord(refs) : readSyncCreatorAutosaveRecord(refs);
				if (record) {
					const saveIf = pendingDelete?.done.then(() => !pendingDelete.committed);
					outgoingDrafts.enqueue(record, saveIf, readSyncCreatorDraftBaseline(refs, record.draftKey));
				}
			}
		} catch (error) {
			reportOutgoingWriteError(error);
		}
		invalidateDraftOperations();
		sessionAutosaveSuppressedRef.current = false;
		if (saveOutgoing) sessionBaselineDraftRef.current = null;
		latestSessionRecordRef.current = null;
		sessionPendingSnapshotRef.current = null;
		setIsRestoringCheckpoint(false);
	};

	const isCurrentSyncCreatorSourceChange = (requestId) => requestId === sessionSourceChangeRequestRef.current;
	const beginDraftSourceChange = () => {
		const sourceChangeRequestId = ++sessionSourceChangeRequestRef.current;
		pendingPlaybackNavigationRef.current = true;
		retireWorkingDraft(true);
		sessionAutoRecoveryBlockedRef.current = true;
		sessionSkipRecoveryDraftKeyRef.current = '';
		sessionSkipNextSourceRecoveryRef.current = true;
		sessionAppliedDraftKeyRef.current = '';
		sessionLastRecoveryAnnouncementRef.current = '';
		setSessionReadyDraftKey('');
		setSessionHistory([]);
		setSessionHistoryCursorId('');
		setHistoryAnnouncement('');
		setSessionSaveState('loading');
		setSessionHydrationComplete(true);
		return sourceChangeRequestId;
	};

	const suspendDraftWrites = (draftKey) => {
		sessionAutosaveSuppressedRef.current = true;
		sessionDraftResetRevisions.set(draftKey, (sessionDraftResetRevisions.get(draftKey) || 0) + 1);
		cancelSyncCreatorAutosave(sessionAutosaveTimerRef, cancelTimer);
		invalidateDraftOperations();
		setIsRestoringCheckpoint(false);
		setSessionReadyDraftKey('');
	};

	const clearDeletedDraft = () => {
		latestSessionRecordRef.current = null;
		sessionPendingSnapshotRef.current = null;
		sessionAppliedDraftKeyRef.current = '';
		sessionBaselineDraftRef.current = null;
		setSessionHistory([]);
		setSessionHistoryCursorId('');
		setSessionSaveState(sessionAutosaveEnabledRef.current ? 'idle' : 'disabled');
	};

	const syncSessionUiFromRecord = (record) => {
		setSessionHistory(Array.isArray(record?.history) ? record.history : []);
		setSessionHistoryCursorId(record?.historyCursorId || '');
		setLastSessionSavedAt(Number(record?.updatedAt) || now());
		setSessionSaveState(sessionAutosaveEnabledRef.current ? 'saved' : 'disabled');
		const sourceCheckpoint = Array.isArray(record?.history)
			? record.history.find(entry => entry?.kind === 'source')
			: null;
		if (sourceCheckpoint?.snapshot) {
			sessionBaselineDraftRef.current = { draftKey: record.draftKey, snapshot: sourceCheckpoint.snapshot };
		}
	};
	const announceHistoryStatus = (message) => {
		setHistoryAnnouncement('');
		scheduleFrame(() => setHistoryAnnouncement(message));
	};
	const announceRecoveredSession = (record) => {
		const announcementKey = [
			record?.draftKey || '',
			record?.historyCursorId || '',
			Number(record?.clientRevision) || Number(record?.updatedAt) || 0
		].join(':');
		if (announcementKey === sessionLastRecoveryAnnouncementRef.current) return;
		sessionLastRecoveryAnnouncementRef.current = announcementKey;
		const message = i18n.t('syncCreator.historyRecovered') || '이 곡의 이전 작업을 자동으로 복구했습니다.';
		announceHistoryStatus(message);
		toast.success(message);
	};

	const captureDraftOwnership = () => {
		const draftKey = activeSessionDraftKeyRef.current;
		const generation = sessionWriteGenerationRef.current;
		return () => draftKey === activeSessionDraftKeyRef.current && generation === sessionWriteGenerationRef.current;
	};

	const commitDraftDeletion = async (deletion, resumeAutosave, isDraftCurrent) => {
		const { draftKey } = deletion;
		let ownsReset;
		const beginReset = () => {
			if (currentDeletion !== deletion || (isDraftCurrent && !isDraftCurrent())) return false;
			suspendDraftWrites(draftKey);
			deletion.pendingWrite = deletion;
			ownsReset = captureDraftOwnership();
			return true;
		};
		let failed = false;
		try {
			const canDelete = syncCreatorDraftStore && draftKey;
			if (isDraftCurrent && canDelete) {
				deletion.committed = (await syncCreatorDraftStore.deleteDraft(draftKey, { beforeDelete: beginReset })) !== false;
			} else if (beginReset()) {
				deletion.committed = !canDelete || (await syncCreatorDraftStore.deleteDraft(draftKey)) !== false;
			}
		} catch (error) {
			failed = true;
			logger.warn('[SyncDataCreator] Failed to clear the draft:', error);
		}
		if (currentDeletion !== deletion) return false;
		currentDeletion = null;
		if (draftKey !== activeSessionDraftKeyRef.current) return false;
		const stillCurrent = ownsReset?.() === true;
		if (deletion.committed && stillCurrent) clearDeletedDraft();
		if (deletion.pendingWrite && (resumeAutosave || !deletion.committed || !stillCurrent)) {
			sessionAutosaveSuppressedRef.current = false;
			sessionAppliedDraftKeyRef.current = draftKey;
			setSessionReadyDraftKey(draftKey);
		}
		if (failed && (stillCurrent || (!ownsReset && isDraftCurrent?.() !== false))) {
			setSessionSaveState('error');
			toast.error(i18n.t('syncCreator.historySaveError') || 'Could not clear the draft.');
		}
		return deletion.committed && stillCurrent;
	};

	const deleteActiveSyncCreatorDraft = async ({ resumeAutosave = false, isDraftCurrent } = {}) => {
		if (isDraftCurrent && !isDraftCurrent()) return false;
		const draftKey = activeSessionDraftKeyRef.current;
		const deletion = {
			draftKey,
			pendingWrite: currentDeletion?.draftKey === draftKey ? currentDeletion.pendingWrite : null,
			committed: false,
		};
		currentDeletion = deletion;
		deletion.done = commitDraftDeletion(deletion, resumeAutosave, isDraftCurrent);
		return deletion.done;
	};

	const beginDraftImport = (draftKey) => retireWorkingDraft(
		!!draftKey && draftKey !== activeSessionDraftKeyRef.current,
	);

	const adoptImportedDraftKey = (draftKey) => {
		if (!draftKey) return;
		sessionSkipRecoveryDraftKeyRef.current = draftKey;
		sessionAppliedDraftKeyRef.current = draftKey;
		setSessionReadyDraftKey(draftKey);
	};

	const markDraftDirty = () => setSessionSaveState(sessionAutosaveEnabledRef.current ? 'dirty' : 'disabled');

	const flushDraftBeforeClose = async () => {
		try {
			while (true) {
				if (currentDeletion) {
					await currentDeletion.done;
					continue;
				}
				cancelSyncCreatorAutosave(sessionAutosaveTimerRef, cancelTimer);
				if (sessionAutosaveEnabledRef.current && outgoingDrafts.hasPending) {
					await outgoingDrafts.flush();
					continue;
				}
				const record = syncCreatorDraftStore && readSyncCreatorAutosaveRecord(refs);
				if (!record) break;
				await saveSyncCreatorDraftSnapshot(syncCreatorDraftStore, refs, record);
				await syncCreatorDraftStore.flush();
				const latest = latestSessionRecordRef.current;
				if (latest?.draftKey === record.draftKey && latest.clientRevision === record.clientRevision) {
					latestSessionRecordRef.current = null;
				}
			}
		} catch (error) {
			logger.warn('[SyncDataCreator] Failed to save the draft before closing:', error);
			setSessionSaveState('error');
			return false;
		}
		invalidateDraftOperations();
		return true;
	};

	return {
		nextSessionClientRevision, claimSessionForLocalEditing, toggleSessionAutosave,
		isCurrentSyncCreatorSourceChange, beginDraftSourceChange,
		syncSessionUiFromRecord, announceHistoryStatus, announceRecoveredSession,
		captureDraftOwnership, deleteActiveSyncCreatorDraft, beginDraftImport, adoptImportedDraftKey, markDraftDirty, flushDraftBeforeClose,
		readSourceDraft: outgoingDrafts.readDraft, readTrackDrafts: outgoingDrafts.readTrackDrafts,
	};
}

export function createSyncCreatorSessionRefs({ now = Date.now, autosaveEnabled = true } = {}) {
	return {
		sessionAppliedDraftKeyRef: { current: '' },
		sessionRecoveryRequestRef: { current: 0 },
		sessionSourceChangeRequestRef: { current: 0 },
		sessionEditorRevisionRef: { current: 0 },
		sessionCheckpointRestoreRequestRef: { current: 0 },
		sessionWriteGenerationRef: { current: 0 },
		sessionDraftResetRevisions: new Map(),
		sessionClientRevisionRef: { current: now() * 1000 },
		sessionAutosaveTimerRef: { current: null },
		sessionAutosaveEnabledRef: { current: autosaveEnabled },
		sessionAutosaveSuppressedRef: { current: false },
		sessionAutoRecoveryBlockedRef: { current: false },
		sessionBaselineDraftRef: { current: null },
		activeSessionDraftKeyRef: { current: '' },
		sessionSkipRecoveryDraftKeyRef: { current: '' },
		sessionSkipNextSourceRecoveryRef: { current: false },
		latestSessionRecordRef: { current: null },
		sessionPendingSnapshotRef: { current: null },
		sessionLastRecoveryAnnouncementRef: { current: '' },
	};
}

export function useSyncCreatorSessionLifecycle({
	react: { useMemo, useRef, useState }, syncCreatorDraftStore, pendingPlaybackNavigationRef,
	getStorage, now = Date.now, cancelTimer, scheduleFrame, i18n, toast,
}) {
	const [sessionHistory, setSessionHistory] = useState([]);
	const [sessionHistoryCursorId, setSessionHistoryCursorId] = useState('');
	const [sessionHydrationComplete, setSessionHydrationComplete] = useState(false);
	const [sessionReadyDraftKey, setSessionReadyDraftKey] = useState('');
	const [sessionSaveState, setSessionSaveState] = useState('idle');
	const [lastSessionSavedAt, setLastSessionSavedAt] = useState(0);
	const [historyAnnouncement, setHistoryAnnouncement] = useState('');
	const [isRestoringCheckpoint, setIsRestoringCheckpoint] = useState(false);
	const [isSessionAutosaveEnabled, setIsSessionAutosaveEnabled] = useState(() => {
		try {
			return getStorage()?.getItem(SYNC_CREATOR_AUTOSAVE_ENABLED_STORAGE_KEY) !== 'false';
		} catch {
			return true;
		}
	});
	const lifecycleRefs = useRef(null);
	if (!lifecycleRefs.current) {
		lifecycleRefs.current = createSyncCreatorSessionRefs({ now, autosaveEnabled: isSessionAutosaveEnabled });
	}
	const refs = lifecycleRefs.current;
	const ui = useMemo(() => ({
		setSessionHistory, setSessionHistoryCursorId, setSessionHydrationComplete, setSessionReadyDraftKey,
		setSessionSaveState, setLastSessionSavedAt, setHistoryAnnouncement, setIsRestoringCheckpoint,
		setIsSessionAutosaveEnabled,
	}), []);
	const actions = useMemo(() => createSyncCreatorSessionLifecycle({
		syncCreatorDraftStore, pendingPlaybackNavigationRef, refs, ui, getStorage, now, cancelTimer, scheduleFrame, i18n, toast,
	}), [syncCreatorDraftStore, pendingPlaybackNavigationRef, refs, ui, getStorage, now, cancelTimer, scheduleFrame, i18n, toast]);

	return {
		state: {
			sessionHistory, sessionHistoryCursorId, sessionHydrationComplete, sessionReadyDraftKey,
			sessionSaveState, lastSessionSavedAt, historyAnnouncement, isRestoringCheckpoint,
			isSessionAutosaveEnabled,
		},
		refs,
		ui,
		actions,
	};
}
