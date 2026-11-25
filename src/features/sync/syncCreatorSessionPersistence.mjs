import { ownsSyncCreatorDraftSave, saveSyncCreatorDraftSnapshot, useSyncCreatorDraftAutosave } from './syncCreatorDraftAutosave.mjs';
import { findRecoverableSyncCreatorSession } from './syncCreatorSessionRecord.mjs';

export function useSyncCreatorSessionPersistence({
	react: { useEffect, useLayoutEffect, useCallback }, syncCreatorDraftStore,
	source: { sessionTrackKey, activeSessionDraftKey, lyricsText },
	state: { sessionHydrationComplete, sessionReadyDraftKey, isSessionAutosaveEnabled },
	refs, ui, host, logger = console,
	buildSyncCreatorSessionRecord, applySyncCreatorSessionRecord, syncSessionUiFromRecord, announceRecoveredSession,
}) {
	const {
		sessionAppliedDraftKeyRef,
		sessionRecoveryRequestRef,
		sessionWriteGenerationRef,
		sessionAutosaveEnabledRef,
		sessionAutoRecoveryBlockedRef,
		sessionBaselineDraftRef,
		sessionSkipRecoveryDraftKeyRef,
		sessionSkipNextSourceRecoveryRef,
		latestSessionRecordRef,
	} = refs;
	const {
		setSessionHistory,
		setSessionHistoryCursorId,
		setSessionHydrationComplete,
		setSessionReadyDraftKey,
		setSessionSaveState,
	} = ui;

	const findRecoverableSessionRecord = useCallback((records) => findRecoverableSyncCreatorSession(records, {
		store: syncCreatorDraftStore,
		validateRecord: (record) => applySyncCreatorSessionRecord(record, { validateOnly: true }),
	}), [applySyncCreatorSessionRecord, syncCreatorDraftStore]);

	useEffect(() => {
		// An explicit source request owns startup recovery, including provider failure.
		if (!syncCreatorDraftStore || !sessionTrackKey || sessionAutoRecoveryBlockedRef.current) {
			setSessionHydrationComplete(true);
			return undefined;
		}

		let cancelled = false;
		const requestId = ++sessionRecoveryRequestRef.current;
		setSessionHydrationComplete(false);
		setSessionSaveState('loading');

		syncCreatorDraftStore.getDraftsForTrack(sessionTrackKey)
			.then((records) => {
				if (cancelled || requestId !== sessionRecoveryRequestRef.current) return;
				const record = findRecoverableSessionRecord(records);
				if (record) {
					const appliedRecord = applySyncCreatorSessionRecord(record, {
						announce: false,
						automatic: true
					});
					if (!appliedRecord) return;
					setSessionReadyDraftKey(record.draftKey);
					announceRecoveredSession(appliedRecord);
				} else {
					setSessionHistory([]);
					setSessionHistoryCursorId('');
					setSessionSaveState(sessionAutosaveEnabledRef.current ? 'idle' : 'disabled');
				}
			})
			.catch((error) => {
				if (cancelled || requestId !== sessionRecoveryRequestRef.current) return;
				logger.warn('[SyncDataCreator] Draft recovery is unavailable:', error);
				setSessionSaveState('error');
			})
			.finally(() => {
				if (!cancelled && requestId === sessionRecoveryRequestRef.current) {
					setSessionHydrationComplete(true);
				}
			});

		return () => {
			cancelled = true;
		};
	}, [announceRecoveredSession, applySyncCreatorSessionRecord, findRecoverableSessionRecord, sessionTrackKey, syncCreatorDraftStore, logger]);

	useEffect(() => {
		if (!sessionHydrationComplete || !activeSessionDraftKey || !syncCreatorDraftStore) return undefined;
		const shouldKeepCurrentSource = sessionSkipNextSourceRecoveryRef.current
			|| sessionAutoRecoveryBlockedRef.current;
		if (
			shouldKeepCurrentSource
			&& sessionAppliedDraftKeyRef.current !== activeSessionDraftKey
		) {
			sessionSkipNextSourceRecoveryRef.current = false;
			sessionAppliedDraftKeyRef.current = activeSessionDraftKey;
			setSessionReadyDraftKey(activeSessionDraftKey);
			setSessionHistory([]);
			setSessionHistoryCursorId('');
			try {
				const baselineRecord = buildSyncCreatorSessionRecord();
				if (baselineRecord) {
					sessionBaselineDraftRef.current = { draftKey: baselineRecord.draftKey, snapshot: baselineRecord.draft };
					latestSessionRecordRef.current = baselineRecord;
				}
				setSessionSaveState(sessionAutosaveEnabledRef.current ? 'dirty' : 'disabled');
			} catch (error) {
				logger.warn('[SyncDataCreator] Failed to prepare the selected lyrics source:', error);
				setSessionSaveState('error');
			}
			return undefined;
		}
		if (sessionAppliedDraftKeyRef.current === activeSessionDraftKey) {
			setSessionReadyDraftKey(activeSessionDraftKey);
			return undefined;
		}
		if (sessionSkipRecoveryDraftKeyRef.current === activeSessionDraftKey) {
			sessionSkipRecoveryDraftKeyRef.current = '';
			sessionAppliedDraftKeyRef.current = activeSessionDraftKey;
			setSessionReadyDraftKey(activeSessionDraftKey);
			setSessionSaveState(sessionAutosaveEnabledRef.current ? 'idle' : 'disabled');
			return undefined;
		}

		let cancelled = false;
		const requestId = ++sessionRecoveryRequestRef.current;
		setSessionReadyDraftKey('');
		setSessionSaveState('loading');
		syncCreatorDraftStore.getDraft(activeSessionDraftKey)
			.then((record) => {
				if (cancelled || requestId !== sessionRecoveryRequestRef.current) return;
				const recoveredRecord = findRecoverableSessionRecord(record ? [record] : []);
				if (recoveredRecord) {
					const appliedRecord = applySyncCreatorSessionRecord(recoveredRecord, {
						announce: false,
						automatic: true
					});
					if (!appliedRecord) return;
					announceRecoveredSession(appliedRecord);
				} else {
					sessionAppliedDraftKeyRef.current = activeSessionDraftKey;
					setSessionHistory([]);
					setSessionHistoryCursorId('');
					setSessionSaveState(sessionAutosaveEnabledRef.current ? 'idle' : 'disabled');
					const baselineRecord = buildSyncCreatorSessionRecord();
					if (baselineRecord) {
						sessionBaselineDraftRef.current = { draftKey: baselineRecord.draftKey, snapshot: baselineRecord.draft };
						latestSessionRecordRef.current = baselineRecord;
						if (sessionAutosaveEnabledRef.current) {
							const generation = sessionWriteGenerationRef.current;
							saveSyncCreatorDraftSnapshot(syncCreatorDraftStore, refs, baselineRecord).then((saved) => {
								if (
									!cancelled
									&& requestId === sessionRecoveryRequestRef.current
									&& saved?.draftKey === baselineRecord.draftKey
									&& ownsSyncCreatorDraftSave(refs, baselineRecord, generation)
								) syncSessionUiFromRecord(saved);
							}).catch((error) => {
								logger.warn('[SyncDataCreator] Failed to create the source checkpoint:', error);
							});
						}
					}
				}
				setSessionReadyDraftKey(activeSessionDraftKey);
			})
			.catch((error) => {
				if (cancelled || requestId !== sessionRecoveryRequestRef.current) return;
				logger.warn('[SyncDataCreator] Failed to check the selected source draft:', error);
				sessionAppliedDraftKeyRef.current = activeSessionDraftKey;
				setSessionReadyDraftKey(activeSessionDraftKey);
				setSessionSaveState('error');
			});

		return () => {
			cancelled = true;
		};
	}, [
		activeSessionDraftKey,
		announceRecoveredSession,
		applySyncCreatorSessionRecord,
		buildSyncCreatorSessionRecord,
		findRecoverableSessionRecord,
		logger,
		sessionHydrationComplete,
		syncCreatorDraftStore,
		syncSessionUiFromRecord
	]);

	useSyncCreatorDraftAutosave({
		useEffect,
		useLayoutEffect,
		store: syncCreatorDraftStore,
		draftKey: activeSessionDraftKey,
		readyDraftKey: sessionReadyDraftKey,
		hydrated: sessionHydrationComplete,
		lyricsText,
		enabled: isSessionAutosaveEnabled,
		buildRecord: buildSyncCreatorSessionRecord,
		setSaveState: setSessionSaveState,
		onSave: syncSessionUiFromRecord,
		refs,
		host,
	});
}
