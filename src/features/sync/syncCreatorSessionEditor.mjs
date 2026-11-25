import { createSyncCreatorSessionRecord, isSyncCreatorDraftTimingCleared, prepareSyncCreatorSessionRestore } from './syncCreatorSessionRecord.mjs';
import { getSyncCreatorSourceLineStarts } from './syncCreatorPlayback.mjs';
import { extractLyricsText } from './syncCreatorLrclibLyrics.mjs';
import { SYNC_CREATOR_SOURCE_ADDON_ID } from './lrclibSyncSource.mjs';
import { normalizeSyncCreatorGranularity } from './timingGranularity.mjs';

export function useSyncCreatorSessionEditor({
	react: { useCallback }, i18n: I18n, syncCreatorDraftStore,
	track: { trackId, trackUri, trackIsrc, trackName, artistName, albumName, trackDurationMs },
	source: { lyrics, lyricsLines, lyricsText, lyricsFullTextChars, lyricsLanguage, provider, addonId, selectedLrclibSource, selectedLrclibCandidateKey },
	editor: { syncData, currentLineIndex, activeParallelPartId, multiVocalMode, syncGranularity, globalOffset },
	drafts: { parallelPartMetaDrafts, manualParallelSplitDrafts, parentheticalLayoutDrafts, mergedLineDrafts, lineMetaDrafts, lineStyleDrafts },
	timing: { attachSelectedLrclibSource, assertValidSyncCreatorSyncData, compactSyncCreatorSyncData, sanitizeSyncCreatorSyncData },
	score: { scorePendingEventsRef, scorePendingEffectsRef },
	session: {
		activeSessionDraftKey, sessionTrackKey, sessionLyricsFingerprint, nextSessionClientRevision,
		syncSessionUiFromRecord, announceHistoryStatus,
	},
	refs: { sessionAutoRecoveryBlockedRef, sessionAppliedDraftKeyRef, sessionClientRevisionRef,
		latestSessionRecordRef, sessionPendingSnapshotRef, serverBaselineSyncDataRef },
	recording: { pendingPlaybackNavigationRef, resetCurrentSyncInput },
	update: {
		setProviderValue, setAddonId, setLyrics, setLyricsText, setSyncData, setSelectedLrclibSourceValue,
		setLrclibIdInput, setSelectedLrclibCandidateKey, setCurrentLineIndex, setActiveParallelPartId, setMultiVocalMode,
		setSyncGranularity, setGlobalOffset, setParallelPartMetaDrafts, setManualParallelSplitDrafts, setParentheticalLayoutDrafts,
		setMergedLineDrafts, setLineMetaDrafts, setLineStyleDrafts, setPendingMultiVocalDecision,
		setPendingParentheticalLayoutDecision, setError, setIsLoading, setMode,
	},
}) {
	const buildSyncCreatorSessionRecord = useCallback((syncDataOverride = syncData, editorOverrides = {}) => {
		const previous = latestSessionRecordRef.current;
		return createSyncCreatorSessionRecord({
			store: syncCreatorDraftStore,
			source: {
				draftKey: activeSessionDraftKey,
				trackKey: sessionTrackKey,
				trackId,
				trackUri,
				isrc: trackIsrc,
				title: trackName,
				artist: artistName,
				album: albumName,
				durationMs: trackDurationMs,
				provider,
				addonId,
				lyricsFingerprint: sessionLyricsFingerprint,
				lyricsText,
				sourceLineStarts: getSyncCreatorSourceLineStarts(lyricsLines, lyrics?.synced),
				lrclibSource: selectedLrclibSource,
				karaokeSource: lyrics?.karaokeSource || '',
			},
			syncData: syncDataOverride,
			timingCleared: !syncDataOverride?.lines?.length && (
				serverBaselineSyncDataRef.current?.lines?.length > 0
				|| (previous?.draftKey === activeSessionDraftKey && (
					previous.draft?.syncData?.lines?.length > 0 || isSyncCreatorDraftTimingCleared(previous)
				))
			),
			prepareSyncData: (data) => {
				const expanded = attachSelectedLrclibSource(data);
				assertValidSyncCreatorSyncData(expanded);
				return compactSyncCreatorSyncData(expanded, lyricsFullTextChars, lyricsLanguage || undefined);
			},
			editor: {
				currentLineIndex,
				activeParallelPartId,
				multiVocalMode,
				syncGranularity,
				globalOffset,
				parallelPartMetaDrafts,
				manualParallelSplitDrafts,
				parentheticalLayoutDrafts,
				mergedLineDrafts,
				lineMetaDrafts,
				lineStyleDrafts,
				selectedLrclibCandidateKey,
			},
			editorOverrides,
			scoreEvents: scorePendingEventsRef.current,
			nextClientRevision: nextSessionClientRevision,
		});
	}, [
		activeParallelPartId,
		activeSessionDraftKey,
		addonId,
		albumName,
		artistName,
		attachSelectedLrclibSource,
		currentLineIndex,
		globalOffset,
		lineMetaDrafts,
		lineStyleDrafts,
		lyricsFullTextChars,
		lyricsLanguage,
		lyricsLines,
		lyrics?.synced,
		lyrics?.karaokeSource,
		lyricsText,
		manualParallelSplitDrafts,
		mergedLineDrafts,
		multiVocalMode,
		nextSessionClientRevision,
		parallelPartMetaDrafts,
		parentheticalLayoutDrafts,
		provider,
		selectedLrclibCandidateKey,
		selectedLrclibSource,
		sessionLyricsFingerprint,
		sessionTrackKey,
		syncCreatorDraftStore,
		syncData,
		syncGranularity,
		trackDurationMs,
		trackId,
		trackIsrc,
		trackName,
		trackUri
	]);

	const applySyncCreatorSessionRecord = useCallback((record, options = {}) => {
		const {
			validatedRecord, lyricsText: restoredLyricsText, lines: restoredLines, sourceLines: restoredSourceLines, flatLyricsChars,
			editor, lineIndex: restoredLineIndex, provider: restoredProvider, syncData: restoredSyncData,
		} = prepareSyncCreatorSessionRestore(record, {
			store: syncCreatorDraftStore,
			sanitizeSyncData: sanitizeSyncCreatorSyncData,
			assertValidSyncData: assertValidSyncCreatorSyncData,
		});
		if (options.validateOnly === true) return validatedRecord;
		if (options.automatic === true && sessionAutoRecoveryBlockedRef.current) return null;
		resetCurrentSyncInput();
		scorePendingEffectsRef.current?.clear();
		if (editor.scoreImportBaseline && restoredSyncData) {
			try {
				const baseline = sanitizeSyncCreatorSyncData(editor.scoreImportBaseline, flatLyricsChars);
				if (baseline && !scorePendingEventsRef.current.some(event => !event.accountId && event.trackUri === trackUri)) {
					scorePendingEventsRef.current.push({ action: 'import', baseline, syncData: restoredSyncData, accountId: '', trackUri });
				}
			} catch (_) { /* Invalid local import hints are never trusted as manual work. */ }
		}

		setProviderValue(restoredProvider);
		setAddonId(SYNC_CREATOR_SOURCE_ADDON_ID);
		setLyrics(previousLyrics => ({
			provider: restoredProvider,
			synced: (options.automatic === true || options.preserveSourceTiming === true)
				&& previousLyrics?.provider === restoredProvider
				&& extractLyricsText(previousLyrics?.synced) === restoredLyricsText
				&& String(previousLyrics?.lrclibSource?.lrclibId || '') === String(record.lrclibSource?.lrclibId || '')
					? previousLyrics.synced : restoredSourceLines,
			unsynced: restoredLines,
			lrclibSource: record.lrclibSource || undefined,
			karaokeSource: record.karaokeSource || undefined
		}));
		setLyricsText(restoredLyricsText);
		setSyncData(restoredSyncData);
		setSelectedLrclibSourceValue(record.lrclibSource || null);
		if (!options.preserveLrclibIdInput) setLrclibIdInput(String(record.lrclibSource?.lrclibId ?? ''));
		setSelectedLrclibCandidateKey(String(editor.selectedLrclibCandidateKey || ''));
		pendingPlaybackNavigationRef.current = options.automatic === true;
		setCurrentLineIndex(restoredLineIndex);
		setActiveParallelPartId(String(editor.activeParallelPartId || 'full'));
		setMultiVocalMode(editor.multiVocalMode === true);
		if (Object.prototype.hasOwnProperty.call(editor, 'syncGranularity')) {
			setSyncGranularity(normalizeSyncCreatorGranularity(editor.syncGranularity));
		}
		setGlobalOffset(Number.isFinite(Number(editor.globalOffset)) ? Number(editor.globalOffset) : 0);
		const restoreObject = (value) => (
			value && typeof value === 'object' && !Array.isArray(value)
				? syncCreatorDraftStore.cloneValue(value)
				: {}
		);
		setParallelPartMetaDrafts(restoreObject(editor.parallelPartMetaDrafts));
		setManualParallelSplitDrafts(restoreObject(editor.manualParallelSplitDrafts));
		setParentheticalLayoutDrafts(restoreObject(editor.parentheticalLayoutDrafts));
		setMergedLineDrafts(restoreObject(editor.mergedLineDrafts));
		setLineMetaDrafts(restoreObject(editor.lineMetaDrafts));
		setLineStyleDrafts(restoreObject(editor.lineStyleDrafts));
		setPendingMultiVocalDecision(null);
		setPendingParentheticalLayoutDecision(null);
		setError(null);
		setIsLoading(false);
		if (options.automatic === true) {
			// If a direct mode change was queued in the same React batch, recovery
			// must not switch it back to idle.
			setMode(currentMode => (
				currentMode === 'record' || currentMode === 'preview'
					? currentMode
					: 'idle'
			));
		} else {
			setMode('idle');
		}
		sessionAppliedDraftKeyRef.current = record.draftKey;
		sessionClientRevisionRef.current = Math.max(
			sessionClientRevisionRef.current,
			Number(validatedRecord.clientRevision) || 0
		);
		latestSessionRecordRef.current = validatedRecord;
		sessionPendingSnapshotRef.current = null;
		syncSessionUiFromRecord(validatedRecord);

		if (options.announce !== false) {
			announceHistoryStatus(I18n.t('syncCreator.historyRestored') || '작업 상태를 복원했습니다.');
		}
		return validatedRecord;
	}, [
		announceHistoryStatus,
		resetCurrentSyncInput,
		extractLyricsText,
		setProviderValue,
		setSelectedLrclibSourceValue,
		syncCreatorDraftStore,
		syncSessionUiFromRecord
	]);

	return {
		buildSyncCreatorSessionRecord,
		applySyncCreatorSessionRecord,
	};
}
