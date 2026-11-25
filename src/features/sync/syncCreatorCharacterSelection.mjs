import { normalizeSyncCreatorLockRange, resolveSyncCreatorOffsetSelectionRange } from './selectionTiming.mjs';
import { stopSyncCreatorKeyboardDrag } from './syncCreatorKeyboardDrag.mjs';
import { isFiniteSyncCreatorTime } from './timingGranularity.mjs';

export function useSyncCreatorCharacterSelection({
	react: { useState, useRef, useCallback }, host, i18n: I18n, toast: Toast, cancelInterval,
	target: { mode, syncGranularity, currentLineIndex, lyricsLines, currentLineChars, currentLineStart,
		activeParallelTargetId, currentLineText, currentLineCharRefs, isCurrentSyncTargetMetaComplete },
	refs: { suppressNextLockContextMenuRef, isKeyboardSyncingRef, keyboardCharIndexRef, charTimesRef,
		pendingWordSyncRef, pendingSyllableSyncRef, keyboardDragRef },
	actions: { showMissingMetaToast, getGranularityRangeForIndex, clearRecordingLock,
		getCurrentSyncTargetSavedChars, getActiveRecordingLockRange, setRecordingLockRangeValue,
		setRecordingLockIndexValue, buildLockedCharTimes, setRecordingProgressIndex, clearPointerRecording },
}) {
	// Offset-selection range for preview/idle (set by right-drag, same gesture
	// family as the record-mode lock). Null means "whole current line".
	const [offsetSelectionRange, setOffsetSelectionRange] = useState(null);
	const offsetSelectionRangeRef = useRef(null);
	const offsetSelectionTargetRef = useRef(null);

	const setOffsetSelectionRangeValue = useCallback((start, end) => {
		if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start) {
			offsetSelectionRangeRef.current = null;
			offsetSelectionTargetRef.current = null;
			setOffsetSelectionRange(null);
			return false;
		}
		const range = { start, end };
		offsetSelectionRangeRef.current = range;
		offsetSelectionTargetRef.current = {
			lineStart: currentLineStart, targetId: activeParallelTargetId, text: currentLineText,
			indexes: currentLineCharRefs.map(ref => ref.absoluteIndex)
		};
		setOffsetSelectionRange(range);
		return true;
	}, [currentLineStart, activeParallelTargetId, currentLineText, currentLineCharRefs]);

	const clearOffsetSelection = useCallback(() => {
		offsetSelectionRangeRef.current = null;
		offsetSelectionTargetRef.current = null;
		setOffsetSelectionRange(null);
	}, []);

	const clearLyricTextSelection = useCallback(() => {
		try {
			host.getSelection?.()?.removeAllRanges?.();
		} catch (error) {
			// Selection API unavailable (e.g. detached DOM) — nothing to clear.
		}
	}, []);

	// The same visible range drives partial effects and offsets. Keep a full
	// row selected for styling; offset controls still use whole-line semantics.
	const applyOffsetSelectionRange = useCallback((downIndex, upIndex) => {
		if (currentLineChars.length === 0) return false;
		const range = resolveSyncCreatorOffsetSelectionRange(downIndex, upIndex, currentLineChars.length, true);
		if (!range) {
			if (Number.isInteger(downIndex) && Number.isInteger(upIndex) && downIndex !== upIndex) {
				clearOffsetSelection();
				return true;
			}
			return false;
		}
		return setOffsetSelectionRangeValue(range.start, range.end);
	}, [currentLineChars.length, clearOffsetSelection, setOffsetSelectionRangeValue]);

	// A click and a drag preserve the same marks and reset the same live input.
	const armRecordingLockRange = useCallback((range) => {
		if (!range) {
			Toast.error(I18n.t('settings.syncLockNoEditableChars') || 'Right-click an earlier character so there is something left to re-sync.');
			return false;
		}
		const savedChars = getCurrentSyncTargetSavedChars();
		const missingSavedIndex = savedChars.findIndex((time, index) => index >= range.start && index <= range.end && !isFiniteSyncCreatorTime(time));
		if (missingSavedIndex >= 0) {
			Toast.error(I18n.t('settings.syncLockRequiresTiming') || 'Sync this line once before locking part of it.');
			return false;
		}
		isKeyboardSyncingRef.current = false;
		keyboardCharIndexRef.current = range.end;
		pendingWordSyncRef.current = null;
		pendingSyllableSyncRef.current = null;
		stopSyncCreatorKeyboardDrag(keyboardDragRef, cancelInterval);
		setRecordingLockRangeValue(range.start, range.end);
		setRecordingLockIndexValue(range.end);
		charTimesRef.current = buildLockedCharTimes(range);
		clearPointerRecording();
		setRecordingProgressIndex(-1, { animate: false, commitState: false });
		Toast.success(I18n.t('settings.syncLockSet') || 'Locked timing up to the selected character.');
		return true;
	}, [
		getCurrentSyncTargetSavedChars, setRecordingLockRangeValue, setRecordingLockIndexValue,
		buildLockedCharTimes, setRecordingProgressIndex, clearPointerRecording,
	]);

	const handleCharacterContextMenu = useCallback((charIndex, e) => {
		e.preventDefault();
		e.stopPropagation();

		if (suppressNextLockContextMenuRef.current) {
			suppressNextLockContextMenuRef.current = false;
			return;
		}
		// Outside record mode a plain right-click toggles an offset range (same
		// idiom as the record-mode lock): click inside the armed range to disarm
		// it, click elsewhere to arm the unit under the cursor - the whole word
		// in word mode, one character otherwise. Other spans use right-drag.
		if (mode !== 'record' && currentLineIndex < lyricsLines.length && currentLineChars.length) {
			if (!isCurrentSyncTargetMetaComplete) {
				showMissingMetaToast();
				return;
			}
			const clickedIndex = Math.max(0, Math.min(charIndex, currentLineChars.length - 1));
			const offsetRange = offsetSelectionRangeRef.current;
			if (offsetRange && clickedIndex >= offsetRange.start && clickedIndex <= offsetRange.end) {
				clearOffsetSelection();
			} else {
				// A click in the middle of a word still arms it from its first glyph.
				const unit = syncGranularity === 'word' ? getGranularityRangeForIndex(clickedIndex) : null;
				const armStart = unit ? Math.max(0, Math.min(unit.start, clickedIndex)) : clickedIndex;
				const armEnd = unit ? Math.min(currentLineChars.length - 1, Math.max(unit.end, clickedIndex)) : clickedIndex;
				setOffsetSelectionRangeValue(armStart, armEnd);
			}
			return;
		}
		if (syncGranularity !== 'character' || mode !== 'record' || currentLineIndex >= lyricsLines.length || !currentLineChars.length) return;
		if (!isCurrentSyncTargetMetaComplete) {
			showMissingMetaToast();
			return;
		}

		const safeIndex = Math.max(0, Math.min(charIndex, currentLineChars.length - 1));
		const activeRange = getActiveRecordingLockRange();
		if (activeRange && safeIndex >= activeRange.start && safeIndex <= activeRange.end) {
			clearRecordingLock();
			isKeyboardSyncingRef.current = false;
			keyboardCharIndexRef.current = -1;
			charTimesRef.current = [];
			pendingWordSyncRef.current = null;
			pendingSyllableSyncRef.current = null;
			clearPointerRecording();
			setRecordingProgressIndex(-1);
			Toast.success(I18n.t('settings.syncLockCleared') || 'Sync lock cleared.');
			return;
		}

		armRecordingLockRange(normalizeSyncCreatorLockRange(safeIndex, safeIndex, currentLineChars.length));
	}, [
		syncGranularity,
		mode,
		currentLineIndex,
		lyricsLines.length,
		currentLineChars.length,
		isCurrentSyncTargetMetaComplete,
		showMissingMetaToast,
		clearRecordingLock,
		clearOffsetSelection,
		setOffsetSelectionRangeValue,
		getGranularityRangeForIndex,
		getActiveRecordingLockRange,
		armRecordingLockRange,
		setRecordingProgressIndex,
	]);

	const applyRecordingLockRange = useCallback((startIndex, endIndex) => {
		if (syncGranularity !== 'character' || mode !== 'record' || currentLineIndex >= lyricsLines.length || !currentLineChars.length) return false;
		if (!isCurrentSyncTargetMetaComplete) {
			showMissingMetaToast();
			return false;
		}
		return armRecordingLockRange(normalizeSyncCreatorLockRange(startIndex, endIndex, currentLineChars.length));
	}, [
		syncGranularity, mode, currentLineIndex, lyricsLines.length, currentLineChars.length,
		isCurrentSyncTargetMetaComplete, showMissingMetaToast, armRecordingLockRange,
	]);

	return {
		offsetSelectionRange, offsetSelectionRangeRef, offsetSelectionTargetRef,
		clearOffsetSelection, clearLyricTextSelection, applyOffsetSelectionRange,
		handleCharacterContextMenu, applyRecordingLockRange,
	};
}

export function useSyncCreatorSelectionReset({
	react: { useLayoutEffect }, target,
	clearLyricTextSelection, clearOffsetSelection,
}) {
	useLayoutEffect(() => {
		clearLyricTextSelection();
		clearOffsetSelection();
	}, [target, clearLyricTextSelection, clearOffsetSelection]);
}
