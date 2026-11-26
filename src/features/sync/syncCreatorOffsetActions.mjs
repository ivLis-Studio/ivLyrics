import {
	readSyncCreatorOffsetPart, shiftSyncCreatorGlobalTiming, shiftSyncCreatorSelectedTiming, shiftSyncCreatorLineTiming,
} from './syncCreatorOffsetTiming.mjs';
import { isFiniteSyncCreatorTime } from './timingGranularity.mjs';

export function useSyncCreatorOffsetActions({
	react, toast: Toast, i18n: I18n, mode, syncData, canStartOperation, target, refs, timing, editor,
}) {
	const { useCallback } = react;
	const { currentLineStart, currentLineCharCount, currentParallelTemplate, activeParallelPart, activeParallelTargetId } = target;
	const { offsetSelectionRangeRef, offsetSelectionTargetRef } = refs;
	const { mergeSyncCreatorParallelTemplate, refreshSyncCreatorLineCharsFromParallel, clipSyncCreatorLineToBounds } = timing;
	const { claimSessionForLocalEditing, resetCurrentSyncInput, setSyncData, setGlobalOffset } = editor;

	const adjustGlobalOffset = useCallback((deltaMs) => {
		if (!canStartOperation()) return;
		claimSessionForLocalEditing();
		setSyncData(prev => shiftSyncCreatorGlobalTiming(prev, deltaMs));
		setGlobalOffset(prev => prev + deltaMs);
	}, [canStartOperation, claimSessionForLocalEditing, setSyncData, setGlobalOffset]);

	const adjustCurrentLineOffset = useCallback((deltaMs) => {
		if (!canStartOperation()) return;
		// Right-drag offset ranges only exist outside record mode (entering
		// record clears them). Read the ref synchronously in the click handler.
		// Locks are record-mode-only and released on mode exit, so no lock
		// interaction exists on this path by design. A range covering the whole
		// displayed line falls through to the whole-line path below.
		const selectedRange = mode !== 'record' ? offsetSelectionRangeRef.current : null;
		const selectionRange = selectedRange && !(selectedRange.start === 0 && selectedRange.end === currentLineCharCount - 1)
			? selectedRange : null;
		if (selectionRange) {
			// Selection coordinates belong to the vocal that was displayed when the
			// range was armed. Ignore one left behind by a part switch that the
			// clearing effect has not processed yet.
			const selectionTarget = offsetSelectionTargetRef.current;
			if (selectionTarget && (selectionTarget.lineStart !== currentLineStart
				|| selectionTarget.targetId !== activeParallelTargetId)) return;
			const existing = Array.isArray(syncData?.lines)
				? syncData.lines.find(line => line.start === currentLineStart)
				: null;
			// Stacked parts keep their timing in their own runs, so the selection
			// moves the active part's marks instead of the shared source row. Like
			// the whole-line path, only a part whose saved marks still match its
			// ranges is reusable; anything else would shift misaligned indexes.
			const renderedTarget = activeParallelPart ? readSyncCreatorOffsetPart(existing, {
				currentParallelTemplate, activeParallelPart, mergeSyncCreatorParallelTemplate,
			}) : null;
			const savedChars = activeParallelPart
				? (renderedTarget ? renderedTarget.part.chars : [])
				: (Array.isArray(existing?.chars) ? existing.chars : []);
			if (savedChars.length <= selectionRange.end || savedChars.slice(selectionRange.start, selectionRange.end + 1).some(time => !isFiniteSyncCreatorTime(time))) {
				Toast.error(I18n.t('syncCreator.selectionOffsetRequiresTiming') || 'Selected characters need timing first - sync the line before offsetting part of it.');
				return;
			}
			claimSessionForLocalEditing();
			resetCurrentSyncInput();
			setSyncData(prev => shiftSyncCreatorSelectedTiming(prev, {
				deltaMs, selectionRange, currentLineStart, currentParallelTemplate, activeParallelPart,
			}, { mergeSyncCreatorParallelTemplate, refreshSyncCreatorLineCharsFromParallel, clipSyncCreatorLineToBounds }));
			return;
		}

		claimSessionForLocalEditing();
		const requestedDeltaSec = deltaMs / 1000;
		resetCurrentSyncInput();

		setSyncData(prev => shiftSyncCreatorLineTiming(prev, {
			requestedDeltaSec, currentLineStart, currentParallelTemplate, activeParallelPart,
		}, { mergeSyncCreatorParallelTemplate, refreshSyncCreatorLineCharsFromParallel, clipSyncCreatorLineToBounds }));
	}, [
		canStartOperation, claimSessionForLocalEditing, resetCurrentSyncInput, currentLineStart, currentLineCharCount,
		currentParallelTemplate, activeParallelPart, activeParallelTargetId, mode, syncData,
		offsetSelectionRangeRef, offsetSelectionTargetRef, mergeSyncCreatorParallelTemplate,
		refreshSyncCreatorLineCharsFromParallel, clipSyncCreatorLineToBounds, setSyncData, Toast, I18n,
	]);

	return { adjustGlobalOffset, adjustCurrentLineOffset };
}
