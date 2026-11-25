import { getSyncCreatorNextEditableIndex, isSyncCreatorIndexLocked } from './selectionTiming.mjs';
import { isFiniteSyncCreatorTime } from './timingGranularity.mjs';
import {
	finishSyncCreatorRecordedTimes, interpolateSyncCreatorUnit, getPreviousRecordedSyncTime, getSequentialSyncTime,
} from './syncCreatorRecordingTiming.mjs';
import { stopSyncCreatorKeyboardDrag } from './syncCreatorKeyboardDrag.mjs';

export function createSyncCreatorPointerRecorder({
	target: { mode, canRecordLine, charCount, syncGranularity, getGranularityEndIndex },
	cacheCharHitBoxes,
	refs: {
		charTimesRef, recordingCharIndexRef, charHitBoxesRef, charScrollMetricsRef,
		isKeyboardSyncingRef, keyboardCharIndexRef, keyboardDragRef,
		interpolationEnabledRef, pendingWordSyncRef, pendingSyllableSyncRef, pointerRecordingRef, scoreInputRef,
	},
	lock: {
		getActiveRecordingLockRange, getActiveRecordingLockIndex, buildLockedCharTimes,
		createRecordingTimeClamp, getCurrentSyncTargetSavedChars, clearRecordingLock,
	},
	output: {
		clearPointerRecording, setIsDragging, setRecordingProgressIndex, markScoreTimingInput,
		commitCurrentLineSync, advanceAfterCompletedTarget, showNoEditableChars,
	},
	getProgressSeconds,
	cancelInterval,
}) {
	const resetDrag = (index = -1, lockedTarget = null) => {
		clearPointerRecording();
		if (lockedTarget === null) setRecordingProgressIndex(index);
		else setRecordingProgressIndex(index, { commitState: false });
		charTimesRef.current = lockedTarget === null ? [] : buildLockedCharTimes(lockedTarget);
		charHitBoxesRef.current = [];
		charScrollMetricsRef.current = [];
	};

	const start = (charIndex, event) => {
		if (mode !== 'record' || !canRecordLine || pointerRecordingRef.current) return false;
		event.preventDefault();
		event.stopPropagation();

		const currentTime = getProgressSeconds();
		if (!isFiniteSyncCreatorTime(currentTime)) return false;
		const lockRange = getActiveRecordingLockRange();
		const lockIndex = getActiveRecordingLockIndex();
		if (charCount === 0 || (lockRange && lockRange.start === 0 && lockRange.end >= charCount - 1)) {
			showNoEditableChars();
			return false;
		}
		const rawRequested = charIndex < 0 ? 0 : charIndex;
		const requestedStartIndex = getSyncCreatorNextEditableIndex(
			Math.min(charCount - 1, Math.max(0, rawRequested)),
			lockRange,
			charCount,
			1
		);
		if (requestedStartIndex >= charCount) {
			showNoEditableChars();
			return false;
		}
		const startIndex = Math.min(
			charCount - 1,
			getGranularityEndIndex(Math.max(0, requestedStartIndex))
		);
		const safeStartIndex = isSyncCreatorIndexLocked(startIndex, lockRange)
			? getSyncCreatorNextEditableIndex(startIndex, lockRange, charCount, 1)
			: startIndex;
		if (safeStartIndex < 0 || safeStartIndex >= charCount) {
			showNoEditableChars();
			return false;
		}
		const hasKeyboardProgress = isKeyboardSyncingRef.current
			&& Array.isArray(charTimesRef.current)
			&& charTimesRef.current.length === charCount;
		const nextCharTimes = hasKeyboardProgress
			? [...charTimesRef.current]
			: buildLockedCharTimes(lockRange || lockIndex);

		if (hasKeyboardProgress) {
			if (pendingWordSyncRef.current && interpolationEnabledRef.current) {
				interpolateSyncCreatorUnit(nextCharTimes, pendingWordSyncRef.current, 'word', currentTime);
			}
			if (pendingSyllableSyncRef.current && interpolationEnabledRef.current) {
				interpolateSyncCreatorUnit(nextCharTimes, pendingSyllableSyncRef.current, 'syllable', currentTime);
			}
			if (lockRange) {
				const lockedCharTimes = buildLockedCharTimes(lockRange);
				for (let i = lockRange.start; i <= lockRange.end && i < nextCharTimes.length; i++) {
					nextCharTimes[i] = lockedCharTimes[i];
				}
			}
		}

		const score = scoreInputRef.current;
		pointerRecordingRef.current = {
			startTime: currentTime,
			previous: hasKeyboardProgress ? {
				times: charTimesRef.current,
				index: keyboardCharIndexRef.current,
				word: pendingWordSyncRef.current,
				syllable: pendingSyllableSyncRef.current,
				score: score && { ...score, anchors: new Set(score.anchors), indexes: new Set(score.indexes) },
			} : null,
		};
		cacheCharHitBoxes();
		stopSyncCreatorKeyboardDrag(keyboardDragRef, cancelInterval);
		setRecordingProgressIndex(safeStartIndex, { commitState: false });
		setIsDragging(true);

		const clampTime = createRecordingTimeClamp(lockRange);
		if (hasKeyboardProgress) {
			// Future locked marks are already present in the array, but only
			// the keyboard cursor identifies how far the user has recorded.
			const keyboardIndex = keyboardCharIndexRef.current;
			if (safeStartIndex <= keyboardIndex) {
				for (let i = 0; i < nextCharTimes.length; i++) {
					if (!isSyncCreatorIndexLocked(i, lockRange)) nextCharTimes[i] = null;
				}
				nextCharTimes[safeStartIndex] = clampTime(safeStartIndex, getSequentialSyncTime(currentTime, getPreviousRecordedSyncTime(nextCharTimes, safeStartIndex)));
			} else {
				let previousTime = getPreviousRecordedSyncTime(nextCharTimes, keyboardIndex + 1);
				for (let i = Math.max(0, keyboardIndex + 1); i <= safeStartIndex; i++) {
					if (!isSyncCreatorIndexLocked(i, lockRange)) {
						nextCharTimes[i] = clampTime(i, getSequentialSyncTime(currentTime, previousTime));
					}
					previousTime = nextCharTimes[i];
				}
			}
			isKeyboardSyncingRef.current = false;
			keyboardCharIndexRef.current = -1;
			pendingWordSyncRef.current = null;
			pendingSyllableSyncRef.current = null;
		} else {
			let previousTime = null;
			for (let i = 0; i <= safeStartIndex; i++) {
				if (isSyncCreatorIndexLocked(i, lockRange)) {
					previousTime = nextCharTimes[i];
					continue;
				}
				if (!isFiniteSyncCreatorTime(nextCharTimes[i])) {
					nextCharTimes[i] = clampTime(i, getSequentialSyncTime(currentTime, previousTime));
				}
				previousTime = nextCharTimes[i];
			}
		}
		charTimesRef.current = nextCharTimes;
		markScoreTimingInput(requestedStartIndex, safeStartIndex, syncGranularity);
		return true;
	};

	const move = (charIndex, event) => {
		if (mode !== 'record' || !pointerRecordingRef.current) return;
		event.preventDefault();
		const currentTime = getProgressSeconds();
		if (!isFiniteSyncCreatorTime(currentTime)) return;
		const previousRecordingCharIndex = recordingCharIndexRef.current;

		if (charIndex < 0) return;

		charIndex = Math.min(charCount - 1, getGranularityEndIndex(charIndex));
		const lockRange = getActiveRecordingLockRange();
		const isCharLocked = (index) => isSyncCreatorIndexLocked(index, lockRange);
		if (lockRange && charIndex >= lockRange.start && charIndex <= lockRange.end) {
			if (previousRecordingCharIndex > lockRange.end) {
				for (let index = lockRange.end + 1; index <= previousRecordingCharIndex; index++) {
					charTimesRef.current[index] = null;
				}
				setRecordingProgressIndex(lockRange.end, { commitState: false });
			} else if (previousRecordingCharIndex >= lockRange.start) {
				setRecordingProgressIndex(previousRecordingCharIndex, { commitState: false });
			} else {
				setRecordingProgressIndex(lockRange.start - 1 >= 0 ? lockRange.start - 1 : lockRange.end, { commitState: false });
			}
			return;
		}
		if (charIndex === previousRecordingCharIndex) return;
		if (charIndex > previousRecordingCharIndex) {
			const scoreFrom = (() => {
				let from = previousRecordingCharIndex + 1;
				if (lockRange && from >= lockRange.start && from <= lockRange.end) from = lockRange.end + 1;
				return Math.max(0, from);
			})();
			if (scoreFrom <= charIndex) markScoreTimingInput(scoreFrom, charIndex, syncGranularity);
			const clampTime = createRecordingTimeClamp(lockRange);
			// 정방향 진행 (locked span은 saved 시간 유지 → skip, 경계에서 clamp)
			for (let i = previousRecordingCharIndex + 1; i <= charIndex; i++) {
				if (isCharLocked(i)) continue;
				if (!isFiniteSyncCreatorTime(charTimesRef.current[i])) {
					charTimesRef.current[i] = clampTime(i, currentTime);
				}
			}
			setRecordingProgressIndex(charIndex, { commitState: false });
		} else {
			// Reversing a drag clears tentative marks while retaining saved locks.
			for (let i = Math.max(charIndex + 1, 0); i <= previousRecordingCharIndex; i++) {
				if (isCharLocked(i)) continue;
				charTimesRef.current[i] = null;
			}
			setRecordingProgressIndex(Math.max(charIndex, -1), { commitState: false });
		}
	};

	const finish = (event) => {
		const recording = pointerRecordingRef.current;
		const endCharIndex = recordingCharIndexRef.current;
		if (mode !== 'record' || !recording) return;
		if (endCharIndex === -1) return cancel();

		event.preventDefault();

		const endTime = getProgressSeconds();
		if (!isFiniteSyncCreatorTime(endTime)) return cancel();
		const lockRange = getActiveRecordingLockRange();
		const lockIndex = getActiveRecordingLockIndex();
		if (lockRange) {
			let hasEditableTiming = false;
			for (let i = 0; i < charCount; i++) {
				if (!isSyncCreatorIndexLocked(i, lockRange) && isFiniteSyncCreatorTime(charTimesRef.current[i])) {
					hasEditableTiming = true;
					break;
				}
			}
			if (!hasEditableTiming) {
				resetDrag(lockRange.end, lockRange);
				return;
			}
		} else if (lockIndex >= 0 && endCharIndex <= lockIndex) {
			resetDrag(lockIndex, lockIndex);
			return;
		}

		const isComplete = getSyncCreatorNextEditableIndex(endCharIndex + 1, lockRange, charCount, 1) >= charCount;
		const finalChars = finishSyncCreatorRecordedTimes(charTimesRef.current, {
			endIndex: endCharIndex, charCount, endTime, startTime: recording.startTime,
			lockRange, savedChars: lockRange ? getCurrentSyncTargetSavedChars() : null,
		});
		const committedLine = commitCurrentLineSync(finalChars, { createCheckpoint: isComplete });
		if (!committedLine) {
			resetDrag();
			return;
		}

		if (isComplete) {
			advanceAfterCompletedTarget(committedLine);
		}

		clearRecordingLock();
		resetDrag();
	};

	const cancel = ({ restoreKeyboard = true } = {}) => {
		const recording = pointerRecordingRef.current;
		if (!recording) return;
		const previous = restoreKeyboard ? recording.previous : null;
		const lock = restoreKeyboard ? getActiveRecordingLockRange() : null;
		resetDrag(previous?.index ?? lock?.end ?? -1, lock);
		scoreInputRef.current = previous?.score ?? null;
		isKeyboardSyncingRef.current = !!previous;
		keyboardCharIndexRef.current = previous?.index ?? -1;
		pendingWordSyncRef.current = previous?.word ?? null;
		pendingSyllableSyncRef.current = previous?.syllable ?? null;
		if (previous) charTimesRef.current = previous.times;
	};

	return { start, move, finish, cancel };
}
