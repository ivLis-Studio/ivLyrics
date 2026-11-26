import { SYNC_CREATOR_SOURCE_ADDON_ID } from './lrclibSyncSource.mjs';
import { pickSyncCreatorLrclibPreview } from './syncCreatorLrclibControls.mjs';
import { extractLyricsText } from './syncCreatorLrclibLyrics.mjs';
import {
	describeSyncCreatorLoadedSource, requestSyncCreatorPublishedSync, prepareSyncCreatorPublishedSync,
	hasPublishedSyncLines, getSyncCreatorLoadedVocalMode,
} from './syncCreatorLoadedSource.mjs';
import { findRecoverableSyncCreatorSession, findUnsubmittedSyncCreatorSession } from './syncCreatorSessionRecord.mjs';

const allowSourceChange = () => true;

export function useSyncCreatorSourceChange({
	react, i18n: I18n, toast: Toast, track, lrclib, editor, session, services,
	canStartOperation = allowSourceChange,
}) {
	const { useCallback, useMemo, useRef } = react;
	const { trackId, trackIsrc, trackName, artistName, albumName, sessionTrackKey } = track;
	const {
		lrclibCandidates, previewLrclibCandidateKey, selectedLrclibCandidateKey, lrclibIdInputEditedRef,
		setLrclibCandidates, setSelectedLrclibCandidateKey, setSelectedLrclibSourceValue, setPreviewLrclibCandidateKey,
		setLrclibSearchMeta, setIsLoadingLrclibId, setLrclibIdInput, searchRequests,
	} = lrclib;
	const {
		pendingMultiVocalDecision, updatePublishedBaseline,
		setManualParallelSplitDrafts, setParentheticalLayoutDrafts, setPendingParentheticalLayoutDecision, setMergedLineDrafts,
		setLyrics, setLyricsText, setSyncData, setProviderValue, setAddonId,
		setPendingMultiVocalDecision, setMultiVocalMode, setActiveParallelPartId, setError, setIsLoading, setCurrentLineIndex, setMode,
	} = editor;
	const {
		scoreInputRef, scorePendingEffectsRef, beginDraftSourceChange, isCurrentSyncCreatorSourceChange,
		syncCreatorDraftStore, applySyncCreatorSessionRecord, announceRecoveredSession, sessionEditorRevisionRef,
		readSourceDraft, readTrackDrafts,
	} = session;
	const { readSyncCreatorSyncService, readSyncCreatorCodec, sanitizeSyncCreatorSyncData, debugSyncCreatorSource } = services;
	const sourceDraftGenerationRef = useRef(null);

	const ownsSourceDraft = useCallback(requestId => isCurrentSyncCreatorSourceChange(requestId)
		&& sourceDraftGenerationRef.current === sessionEditorRevisionRef.current,
	[isCurrentSyncCreatorSourceChange, sessionEditorRevisionRef]);

	const clearVocalDrafts = useCallback(() => {
		setManualParallelSplitDrafts({});
		setParentheticalLayoutDrafts({});
		setPendingParentheticalLayoutDecision(null);
		setMergedLineDrafts({});
	}, [setManualParallelSplitDrafts, setParentheticalLayoutDrafts, setPendingParentheticalLayoutDecision, setMergedLineDrafts]);

	const clearLrclibCandidateState = useCallback(() => {
		setLrclibCandidates([]);
		setSelectedLrclibCandidateKey('');
		setSelectedLrclibSourceValue(null);
		setPreviewLrclibCandidateKey('');
		setLrclibSearchMeta(null);
	}, [setSelectedLrclibSourceValue]);
	const beginSyncCreatorSourceChange = useCallback(() => {
		if (!canStartOperation()) return null;
		searchRequests.cancel();
		scoreInputRef.current = null;
		scorePendingEffectsRef.current?.clear();
		const requestId = beginDraftSourceChange();
		sourceDraftGenerationRef.current = sessionEditorRevisionRef.current;
		setIsLoadingLrclibId(false);
		return requestId;
	}, [beginDraftSourceChange, canStartOperation, searchRequests, sessionEditorRevisionRef]);

	const captureOfflineDraftRecovery = (sourceChangeRequestId) => {
		const ownsLoad = () => ownsSourceDraft(sourceChangeRequestId);
		return async () => {
			if (!ownsLoad() || !syncCreatorDraftStore || !sessionTrackKey) return null;
			try {
				const records = await (readTrackDrafts ? readTrackDrafts(sessionTrackKey) : syncCreatorDraftStore.getDraftsForTrack(sessionTrackKey));
				if (!ownsLoad()) return null;
				const record = findRecoverableSyncCreatorSession(records, {
					store: syncCreatorDraftStore,
					validateRecord: candidate => applySyncCreatorSessionRecord(candidate, { validateOnly: true }),
				});
				if (!record) return null;
				const applied = applySyncCreatorSessionRecord(record, {
					announce: false, preserveLrclibIdInput: lrclibIdInputEditedRef.current,
				});
				if (applied) announceRecoveredSession(applied);
				return applied;
			} catch (error) {
				console.warn('[SyncDataCreator] Offline draft recovery failed:', error);
				return null;
			}
		};
	};

	const selectLyricsSource = (result, usedProvider, { provider, lrclibSource, lrclibId }) => {
		setProviderValue(provider);
		setAddonId(usedProvider);
		setLyrics(result);
		setSelectedLrclibSourceValue(lrclibSource);
		if (lrclibId && !lrclibIdInputEditedRef.current) setLrclibIdInput(String(lrclibId));
	};

	const readPublishedSync = useCallback(async (provider) => {
		const syncService = readSyncCreatorSyncService();
		if (syncService && trackId) {
			try {
				const existing = await requestSyncCreatorPublishedSync(syncService, trackId, provider, {
					isrc: trackIsrc,
					title: trackName,
					artist: artistName,
					album: albumName
				});
				if (existing?.syncData?.lines) {
					debugSyncCreatorSource('[SyncDataCreator] Found matching existing sync data');
					return existing.syncData;
				}
			} catch (e) {
				console.warn('[SyncDataCreator] Failed to load existing sync data:', e);
			}
		}
		return null;
	}, [readSyncCreatorSyncService, trackId, trackIsrc, trackName, artistName, albumName, debugSyncCreatorSource]);

	const preparePublishedBaseline = (body, lyricsText) => (
		body && prepareSyncCreatorPublishedSync(body, lyricsText, {
			getCodec: readSyncCreatorCodec, sanitize: sanitizeSyncCreatorSyncData, debug: debugSyncCreatorSource,
		})
	);

	const applyLoadedLyricsResult = useCallback(async (result, usedProvider, sourceChangeRequestId, { publishedSync } = {}) => {
		const ownsEditor = () => ownsSourceDraft(sourceChangeRequestId);
		if (!ownsEditor()) return false;
		const source = describeSyncCreatorLoadedSource(result, usedProvider);
		const published = publishedSync === undefined ? await readPublishedSync(source.provider) : publishedSync;
		if (!ownsEditor()) return false;

		const text = extractLyricsText(result.synced || result.unsynced);
		const loadedSyncBody = preparePublishedBaseline(published, text);
		// An unsubmitted local draft survives closing the editor. Prefer it over
		// the server state so earlier taps stay in place until they are submitted.
		let record = null;
		if (text.trim().length > 0 && syncCreatorDraftStore) {
			try {
				record = await findUnsubmittedSyncCreatorSession({
					store: syncCreatorDraftStore,
					trackKey: sessionTrackKey,
					text,
					provider: source.provider,
					addonId: usedProvider,
					lrclibSource: source.lrclibSource,
					readDraft: readSourceDraft,
					readTrackDrafts,
					allowUntimedExactDraft: !hasPublishedSyncLines(loadedSyncBody),
					isStaleSource: () => !ownsEditor(),
					validateRecord: candidate => applySyncCreatorSessionRecord(candidate, { validateOnly: true }),
				});
			} catch (error) {
				console.warn('[SyncDataCreator] Failed to restore the unsubmitted draft:', error);
			}
			if (!ownsEditor()) return false;
		}
		clearVocalDrafts();
		selectLyricsSource(result, usedProvider, source);
		updatePublishedBaseline(loadedSyncBody);
		if (record) {
			try {
				const restored = applySyncCreatorSessionRecord(record, {
					announce: false, preserveSourceTiming: true, preserveLrclibIdInput: lrclibIdInputEditedRef.current,
				});
				if (restored) {
					announceRecoveredSession(restored);
					return true;
				}
			} catch (error) {
				console.warn('[SyncDataCreator] Failed to apply the unsubmitted draft:', error);
			}
		}
		setSyncData(loadedSyncBody);
		if (loadedSyncBody) Toast.success(I18n.t('syncCreator.loadedExistingSyncData') || 'Loaded existing sync data');
		if (text.trim().length > 0) {
			const { multiVocal, decision } = getSyncCreatorLoadedVocalMode(text, loadedSyncBody);
			if (decision) {
				setPendingMultiVocalDecision(decision);
				setError(null);
				return true;
			}
			setMultiVocalMode(multiVocal);
			setActiveParallelPartId(multiVocal ? '' : 'full');
			setLyricsText(text);
			setError(null);
		} else {
			setPendingMultiVocalDecision(null);
			setMultiVocalMode(false);
			setError(I18n.t('syncCreator.noLyrics'));
		}
		return true;
	}, [ownsSourceDraft, clearVocalDrafts, selectLyricsSource, readPublishedSync,
		syncCreatorDraftStore, sessionTrackKey, readSourceDraft, readTrackDrafts, applySyncCreatorSessionRecord,
		announceRecoveredSession, lrclibIdInputEditedRef, preparePublishedBaseline, updatePublishedBaseline]);

	const resolveMultiVocalDecision = useCallback((useMultiVocalMode) => {
		if (!pendingMultiVocalDecision) return;
		setPendingMultiVocalDecision(null);
		clearVocalDrafts();
		setMultiVocalMode(useMultiVocalMode);
		setActiveParallelPartId(useMultiVocalMode ? '' : 'full');
		setLyricsText(pendingMultiVocalDecision.text);
		setError(null);
	}, [pendingMultiVocalDecision, clearVocalDrafts]);

	const previewLrclibCandidate = useMemo(
		() => pickSyncCreatorLrclibPreview(lrclibCandidates, previewLrclibCandidateKey, selectedLrclibCandidateKey),
		[lrclibCandidates, previewLrclibCandidateKey, selectedLrclibCandidateKey],
	);

	// Reset the editor to a clean "no lyrics loaded yet" state before a new
	// LRCLIB source is fetched. Every referenced updater is a stable React state
	// setter, so this closes over nothing that changes between renders.
	const resetSyncCreatorLyricsLoadingState = useCallback(({ resetProvider = false } = {}) => {
		setIsLoading(true);
		setError(null);
		setLyrics(null);
		setLyricsText('');
		setSyncData(null);
		updatePublishedBaseline(null);
		if (resetProvider) {
			setAddonId(SYNC_CREATOR_SOURCE_ADDON_ID);
			setProviderValue('');
		}
		setCurrentLineIndex(0);
		setMultiVocalMode(false);
		clearVocalDrafts();
		setPendingMultiVocalDecision(null);
		setActiveParallelPartId('full');
		setMode('idle');
	}, [setProviderValue, clearVocalDrafts, updatePublishedBaseline]);

	const prepareImportedLyricsSource = useCallback(async (result, text, isCurrent) => {
		const source = describeSyncCreatorLoadedSource(result, SYNC_CREATOR_SOURCE_ADDON_ID);
		const published = await readPublishedSync(source.provider);
		if (!isCurrent()) return null;
		const publishedBaseline = preparePublishedBaseline(published, text);

		return {
			publishedBaseline,
			activate() {
				beginSyncCreatorSourceChange();
				clearLrclibCandidateState();
				clearVocalDrafts();
				setPendingMultiVocalDecision(null);
				setCurrentLineIndex(0);
				setMode('idle');
				setError(null);
				selectLyricsSource(result, SYNC_CREATOR_SOURCE_ADDON_ID, source);
				setLyricsText(text);
				setIsLoading(false);
				updatePublishedBaseline(publishedBaseline);
			},
		};
	}, [readPublishedSync, beginSyncCreatorSourceChange, clearLrclibCandidateState, clearVocalDrafts,
		selectLyricsSource, preparePublishedBaseline, updatePublishedBaseline]);

	return {
		clearLrclibCandidateState, beginSyncCreatorSourceChange, applyLoadedLyricsResult, captureOfflineDraftRecovery,
		resolveMultiVocalDecision, previewLrclibCandidate, resetSyncCreatorLyricsLoadingState, prepareImportedLyricsSource, readPublishedSync,
	};
}
