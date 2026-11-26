import {
	distributeSyncCreatorManualSplitDraft, prepareSyncCreatorLineMerge, mergeSyncCreatorLineTiming, unmergeSyncCreatorLineTiming,
} from './syncCreatorMergedTiming.mjs';
import { resolveSyncCreatorManualSplitState } from './parallelTiming.mjs';

function removeMergedLineDrafts(drafts, lineIndexes, lineCharOffsets) {
	const remaining = { ...drafts };
	for (const index of lineIndexes) delete remaining[lineCharOffsets[index]];
	return remaining;
}

export function useSyncCreatorLineActions({
	react, toast: Toast, i18n: I18n, editingVersion, canStartOperation, line, song, vocal, timing, editor, recording,
}) {
	const { useMemo, useCallback } = react;
	const { lyricDocument, syncData, lineCharOffsets } = song;
	const { getLineEndAtIndex } = lyricDocument;
	const {
		currentLineIndex, currentLineStart, currentFullLineChars, currentExistingLineData, currentMergedLineIndexes,
		nextMergeLineIndexes, currentLineMergedWithNext, currentAutoMergeSplitPoints, currentAutoMergeSplitPointSet,
		canMergeCurrentLineWithNext,
	} = line;
	const {
		multiVocalMode, pendingParentheticalLayoutDecision, manualParallelSplitDrafts,
		setMultiVocalMode, setActiveParallelPartId, setMergedLineDrafts, setManualParallelSplitDrafts,
		setParentheticalLayoutDrafts, setPendingParentheticalLayoutDecision,
	} = vocal;
	const {
		sliceSyncCreatorLineTiming, normalizeSyncCreatorSpeaker,
		sanitizeSyncCreatorSpeakerFallback, sanitizeSyncCreatorSpeakerColor, normalizeSyncCreatorKind,
	} = timing;
	const { claimSessionForLocalEditing, setSyncData, setMode } = editor;
	const { setRecordingProgressIndex, clearRecordingLock, charTimesRef, lyricsScrollRef } = recording;

	const resetAfterLayoutChange = useCallback(({ preserveLock = false } = {}) => {
		setMode(prev => prev === 'record' ? prev : 'idle');
		setRecordingProgressIndex(-1);
		if (!preserveLock) clearRecordingLock();
		charTimesRef.current = [];
		if (lyricsScrollRef.current) lyricsScrollRef.current.scrollLeft = 0;
	}, [setMode, setRecordingProgressIndex, clearRecordingLock, charTimesRef, lyricsScrollRef]);

	const mergeCurrentLineWithNext = useCallback(() => {
		if (!canStartOperation() || !canMergeCurrentLineWithNext) return;

		const currentStart = lineCharOffsets[currentLineIndex] ?? 0;
		const nextIndex = nextMergeLineIndexes[0];
		const nextStart = lineCharOffsets[nextIndex];
		const nextEnd = getLineEndAtIndex(nextIndex);
		if (!Number.isInteger(currentStart) || !Number.isInteger(nextStart) || nextEnd < nextStart) return;

		const mergePlan = prepareSyncCreatorLineMerge({
			currentStart, currentMergedLineIndexes, nextMergeLineIndexes, getLineEndAtIndex,
			lineCharOffsets, syncData, manualParallelSplitDrafts,
		});
		const { nextMergedLineIndexes, hasManualSplitState, mergedManualSplitPoints } = mergePlan;

		const applyMerge = data => mergeSyncCreatorLineTiming(data, {
			...mergePlan, currentStart, lineCharOffsets, getLineEndAtIndex, editingVersion,
		}, timing);
		const merged = applyMerge(syncData);
		if (merged.issue) {
			Toast.error(merged.issue);
			return;
		}
		claimSessionForLocalEditing();
		setSyncData(prev => prev === syncData ? merged.data : applyMerge(prev).data);

		setMultiVocalMode(true);
		setActiveParallelPartId('a');
		setMergedLineDrafts(prev => ({
			...removeMergedLineDrafts(prev, nextMergedLineIndexes, lineCharOffsets),
			[currentStart]: nextMergedLineIndexes.slice(1).map(index => lineCharOffsets[index])
		}));
		if (hasManualSplitState) {
			setManualParallelSplitDrafts(prev => ({ ...prev, [currentStart]: mergedManualSplitPoints }));
		}
		resetAfterLayoutChange({ preserveLock: true });
		Toast.success(I18n.t('syncCreator.mergedWithNextLine') || 'Merged with the next line as separate vocal parts.');
	}, [
		canMergeCurrentLineWithNext,
		canStartOperation,
		claimSessionForLocalEditing,
		currentLineIndex,
		currentMergedLineIndexes,
		nextMergeLineIndexes,
		getLineEndAtIndex,
		lineCharOffsets,
		manualParallelSplitDrafts,
		resetAfterLayoutChange,
		syncData,
		timing,
	]);

	const deleteCurrentLineSync = useCallback(() => {
		if (!canStartOperation() || !Array.isArray(syncData?.lines)) return;
		claimSessionForLocalEditing();
		const lineStart = lineCharOffsets[currentLineIndex];

		setSyncData(prev => {
			if (!Array.isArray(prev?.lines)) return prev;
			const newLines = prev.lines.filter(l => l.start !== lineStart);
			return newLines.length > 0 ? { ...prev, lines: newLines } : null;
		});
		clearRecordingLock();
	}, [canStartOperation, syncData, lineCharOffsets, currentLineIndex, claimSessionForLocalEditing, clearRecordingLock]);

	const currentManualSplitPoints = useMemo(() => {
		return resolveSyncCreatorManualSplitState(
			manualParallelSplitDrafts,
			currentLineStart,
			currentFullLineChars.length,
			currentExistingLineData?.parallel,
			currentAutoMergeSplitPoints
		).splitPoints;
	}, [manualParallelSplitDrafts, currentLineStart, currentFullLineChars.length, currentAutoMergeSplitPoints, currentExistingLineData]);
	const currentManualSplitPointSet = useMemo(
		() => new Set(currentManualSplitPoints),
		[currentManualSplitPoints]
	);
	const hasManualParallelSplit = currentManualSplitPoints.length > 0;
	const hasManualDraftSplit = Array.isArray(manualParallelSplitDrafts[currentLineStart])
		&& manualParallelSplitDrafts[currentLineStart].length > 0;
	const resetCurrentLineManualSplit = useCallback(() => {
		if (!canStartOperation()) return;
		claimSessionForLocalEditing();
		const lineStart = lineCharOffsets[currentLineIndex];
		// An explicit empty override also suppresses persisted manual boundaries.
		// Deleting the draft would immediately resurrect the saved manual split.
		setManualParallelSplitDrafts(prev => ({ ...prev, [lineStart]: [] }));
		resetAfterLayoutChange();
	}, [canStartOperation, claimSessionForLocalEditing, lineCharOffsets, currentLineIndex, resetAfterLayoutChange]);
	const unmergeCurrentLine = useCallback(() => {
		if (!currentLineMergedWithNext || currentMergedLineIndexes.length <= 1) return;
		claimSessionForLocalEditing();
		const lineStart = lineCharOffsets[currentLineIndex];
		const mergedEnd = getLineEndAtIndex(currentMergedLineIndexes[currentMergedLineIndexes.length - 1]);

		const layout = { lineStart, mergedEnd, currentMergedLineIndexes, lineCharOffsets, getLineEndAtIndex };
		setSyncData(prev => unmergeSyncCreatorLineTiming(prev, {
			lineStart, lineIndex: currentLineIndex, lineCharOffsets, getLineEndAtIndex, editingVersion,
		}, {
			sliceSyncCreatorLineTiming, normalizeSyncCreatorSpeaker,
			sanitizeSyncCreatorSpeakerFallback, sanitizeSyncCreatorSpeakerColor, normalizeSyncCreatorKind,
		}));

		setMergedLineDrafts(prev => removeMergedLineDrafts(prev, currentMergedLineIndexes, lineCharOffsets));
		setManualParallelSplitDrafts(prev => distributeSyncCreatorManualSplitDraft(prev, layout));
		setActiveParallelPartId('full');
		resetAfterLayoutChange();
	}, [
		currentLineIndex,
		claimSessionForLocalEditing,
		currentLineMergedWithNext,
		currentMergedLineIndexes,
		getLineEndAtIndex,
		lineCharOffsets,
		resetAfterLayoutChange
	]);
	const toggleManualParallelSplitPoint = useCallback((splitPoint) => {
		if (!canStartOperation() || !multiVocalMode || currentFullLineChars.length < 2) return;
		const normalizedSplitPoint = Number(splitPoint);
		if (!Number.isInteger(normalizedSplitPoint) || normalizedSplitPoint <= 0 || normalizedSplitPoint >= currentFullLineChars.length) {
			return;
		}
		if (currentAutoMergeSplitPointSet.has(normalizedSplitPoint)) {
			unmergeCurrentLine();
			return;
		}
		claimSessionForLocalEditing();

		const lineStart = lineCharOffsets[currentLineIndex];
		setManualParallelSplitDrafts(prev => {
			const splitState = resolveSyncCreatorManualSplitState(
				prev,
				lineStart,
				currentFullLineChars.length,
				currentExistingLineData?.parallel,
				currentAutoMergeSplitPoints
			);
			const current = new Set(splitState.manualSplitPoints
				.filter(point => !currentAutoMergeSplitPointSet.has(point)));
			if (current.has(normalizedSplitPoint)) {
				current.delete(normalizedSplitPoint);
			} else {
				current.add(normalizedSplitPoint);
			}

			const nextSplitPoints = [...current]
				.filter(value => Number.isInteger(value) && value > 0 && value < currentFullLineChars.length)
				.sort((a, b) => a - b);
			const next = { ...prev };
			next[lineStart] = nextSplitPoints;
			return next;
		});
		resetAfterLayoutChange();
	}, [
		canStartOperation,
		multiVocalMode,
		currentFullLineChars.length,
		currentAutoMergeSplitPointSet,
		unmergeCurrentLine,
		lineCharOffsets,
		currentLineIndex,
		currentExistingLineData,
		claimSessionForLocalEditing,
		resetAfterLayoutChange
	]);
	const resolveParentheticalLayoutDecision = useCallback((layoutMode) => {
		const decision = pendingParentheticalLayoutDecision;
		if (!canStartOperation() || !decision || !Number.isInteger(Number(decision.lineStart))) return;
		claimSessionForLocalEditing();
		const safeMode = layoutMode === 'grouped' ? 'grouped' : 'separate';
		const lineStart = Number(decision.lineStart);

		setParentheticalLayoutDrafts(prev => ({
			...prev,
			[lineStart]: safeMode
		}));
		setPendingParentheticalLayoutDecision(null);
		resetAfterLayoutChange();
	}, [canStartOperation, claimSessionForLocalEditing, pendingParentheticalLayoutDecision, resetAfterLayoutChange]);
	const enableManualMultiVocalMode = useCallback(() => {
		if (!canStartOperation()) return;
		claimSessionForLocalEditing();
		setMultiVocalMode(true);
		setActiveParallelPartId('');
		resetAfterLayoutChange();
	}, [canStartOperation, claimSessionForLocalEditing, resetAfterLayoutChange]);

	return {
		mergeCurrentLineWithNext, deleteCurrentLineSync,
		currentManualSplitPoints, currentManualSplitPointSet, hasManualParallelSplit, hasManualDraftSplit, resetCurrentLineManualSplit,
		toggleManualParallelSplitPoint, resolveParentheticalLayoutDecision, enableManualMultiVocalMode,
	};
}
