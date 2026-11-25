import { prepareSyncCreatorLineCommit, prepareSyncCreatorRecordingScore } from './syncCreatorLineCommit.mjs';
import { clampSyncCreatorTimesToLockRange } from './selectionTiming.mjs';
import {
	SYNC_CREATOR_MIN_SEQUENTIAL_STEP_SEC, normalizeSyncCreatorGranularity, normalizeSyncCreatorTimeSequence,
} from './timingGranularity.mjs';

export function useSyncCreatorRecordingCommit({
	react, toast: Toast, i18n: I18n, editingVersion, syncData, syncGranularity, lyricsLanguage,
	line, vocal, recordingLock, score, timing, styles, claimSessionForLocalEditing, setSyncData,
}) {
	const { useCallback } = react;
	const {
		currentLineStart, fullLineCharCount, currentLineChars, currentLineCharRefs, currentLineMeta,
		currentLineMetaDraft, currentLineStyleRanges, currentLineMergedWithNext,
	} = line;
	const {
		activeParallelPart, hasCurrentParallelParts, currentParallelData, currentParallelParts, multiVocalMode,
		activeParallelTargetId, isCurrentSyncTargetMetaComplete, showMissingMetaToast, setActiveParallelPartId,
	} = vocal;
	const { getActiveRecordingLockRange, getCurrentSyncTargetSavedChars } = recordingLock;
	const { scoreInputRef, scorePendingEffectsRef, captureScoreWork } = score;
	const {
		collapseSyncCreatorTimesByGranularity, sanitizeSyncCreatorParallel, readSyncCreatorCodec,
		getSyncCreatorWordRanges, projectSyncCreatorUnitLayout, clipSyncCreatorLineToBounds,
	} = timing;
	const {
		normalizeSyncCreatorSpeaker, normalizeSyncCreatorKind, sanitizeSyncCreatorSpeakerFallback,
		sanitizeSyncCreatorSpeakerColor, normalizeSyncCreatorStyleRanges,
	} = styles;

	// Keep timestamps ordered within each vocal without shifting overlapping lines.
	const normalizeCommittedLineChars = useCallback((
		rawChars,
		granularity = syncGranularity,
		sourceChars = currentLineChars
	) => {
		const normalizedGranularity = normalizeSyncCreatorGranularity(granularity);
		const collapsedChars = collapseSyncCreatorTimesByGranularity(
			rawChars,
			sourceChars,
			normalizedGranularity,
			lyricsLanguage || undefined
		);
		const lockRange = getActiveRecordingLockRange();
		if (lockRange && sourceChars === currentLineChars) {
			return clampSyncCreatorTimesToLockRange(collapsedChars, getCurrentSyncTargetSavedChars(), lockRange, SYNC_CREATOR_MIN_SEQUENTIAL_STEP_SEC);
		}
		return normalizeSyncCreatorTimeSequence(
			collapsedChars,
			normalizedGranularity
		);
	}, [
		syncGranularity, currentLineChars, lyricsLanguage, collapseSyncCreatorTimesByGranularity,
		getActiveRecordingLockRange, getCurrentSyncTargetSavedChars,
	]);

	const commitCurrentLineSync = useCallback((rawChars) => {
		if (multiVocalMode && !isCurrentSyncTargetMetaComplete) {
			showMissingMetaToast();
			return null;
		}
		if (multiVocalMode && hasCurrentParallelParts && !activeParallelPart) {
			setActiveParallelPartId(currentParallelParts[0]?.id || 'full');
			Toast.error(I18n.t('syncCreator.selectVocalPartFirst') || 'Select the vocal part to sync first.');
			return null;
		}
		const { nextSyncData, normalizedLineData, existingLine, lineEnd } = prepareSyncCreatorLineCommit({
			rawChars, syncData, syncGranularity, lyricsLanguage,
			scoreInput: scoreInputRef.current,
			version: editingVersion,
			line: {
				start: currentLineStart, charCount: fullLineCharCount, chars: currentLineChars,
				charRefs: currentLineCharRefs, meta: currentLineMeta, metaDraft: currentLineMetaDraft,
				styleRanges: currentLineStyleRanges, mergedWithNext: currentLineMergedWithNext,
			},
			vocal: {
				activePart: activeParallelPart, parallel: currentParallelData,
				targetId: activeParallelTargetId, multiVocalMode,
			},
		}, {
			normalizeCommittedLineChars, sanitizeSyncCreatorParallel, getCodec: readSyncCreatorCodec,
			getSyncCreatorWordRanges, getRecordingLockRange: getActiveRecordingLockRange,
			projectSyncCreatorUnitLayout, clipSyncCreatorLineToBounds, normalizeSyncCreatorSpeaker,
			normalizeSyncCreatorKind, sanitizeSyncCreatorSpeakerFallback, sanitizeSyncCreatorSpeakerColor,
			normalizeSyncCreatorStyleRanges,
		});
		const score = prepareSyncCreatorRecordingScore({
			scoreInput: scoreInputRef.current, pendingEffectsByKey: scorePendingEffectsRef.current,
			nextSyncData, existingLine, rawChars, charRefs: currentLineCharRefs,
			start: currentLineStart, end: lineEnd, activePart: activeParallelPart, activeParallelTargetId,
		});
		claimSessionForLocalEditing();
		if (score) captureScoreWork('record', score.snapshot, score.work);
		scoreInputRef.current = null;
		setSyncData(nextSyncData);
		return normalizedLineData;
	}, [
		syncData,
		currentLineStart,
		fullLineCharCount,
		currentLineCharRefs,
		activeParallelPart,
		hasCurrentParallelParts,
		currentParallelData,
		currentParallelParts,
		currentLineMeta,
		currentLineStyleRanges,
		currentLineMetaDraft,
		multiVocalMode,
		currentLineMergedWithNext,
		activeParallelTargetId,
		isCurrentSyncTargetMetaComplete,
		showMissingMetaToast,
		normalizeCommittedLineChars,
		syncGranularity,
		currentLineChars,
		getActiveRecordingLockRange,
		captureScoreWork,
		claimSessionForLocalEditing,
		editingVersion,
		lyricsLanguage,
		clipSyncCreatorLineToBounds,
		getSyncCreatorWordRanges,
		normalizeSyncCreatorKind,
		normalizeSyncCreatorSpeaker,
		normalizeSyncCreatorStyleRanges,
		projectSyncCreatorUnitLayout,
		readSyncCreatorCodec,
		sanitizeSyncCreatorParallel,
		sanitizeSyncCreatorSpeakerColor,
		sanitizeSyncCreatorSpeakerFallback,
		scoreInputRef,
		scorePendingEffectsRef,
		setSyncData,
		setActiveParallelPartId,
		Toast,
		I18n,
	]);

	return commitCurrentLineSync;
}
