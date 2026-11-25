import { clampSyncCreatorTimesToLockRange, getSyncCreatorNextEditableIndex, isSyncCreatorIndexLocked } from './selectionTiming.mjs';
import { stopSyncCreatorKeyboardDrag } from './syncCreatorKeyboardDrag.mjs';
import { SYNC_CREATOR_MIN_SEQUENTIAL_STEP_SEC, isFiniteSyncCreatorTime, roundSyncCreatorTime } from './timingGranularity.mjs';
import {
	WORD_GAP_MS, isWordBoundary, isLeadingChar, isTrailingChar,
	getPreviousRecordedSyncTime, getSequentialSyncTime, interpolateSyncCreatorUnit,
	finishSyncCreatorRecordedTimes, getSyncCreatorPunctuationSpanEnd, sameSyncCreatorRecordingTarget,
} from './syncCreatorRecordingTiming.mjs';

export function createSyncCreatorKeyboardRecorder({
	target: {
		identity, currentLineChars, currentLineEffectiveSyllableSegments, currentGranularityRanges, getWordRanges,
	},
	refs: {
		prevKeyboardTargetRef, scoreInputRef, recordingLockIndexRef,
		isKeyboardSyncingRef, keyboardDragRef, keyboardCharIndexRef, charTimesRef,
		pendingWordSyncRef, pendingSyllableSyncRef, interpolationEnabledRef,
	},
	lock: {
		clearRecordingLock, getActiveRecordingLockRange, getCurrentSyncTargetSavedChars,
		buildLockedCharTimes, createRecordingTimeClamp, getActiveRecordingLockIndex,
	},
	output: {
		setRecordingProgressIndex, commitCurrentLineSync,
		advanceAfterCompletedTarget, markScoreTimingInput, showNoEditableChars,
	},
	getProgressSeconds,
	cancelInterval,
	debug = () => {},
}) {
	const { mode, syncGranularity } = identity;
	const writeTimes = (start, end, time) => {
		const marks = charTimesRef.current;
		for (let index = start; index <= end; index++) marks[index] = time;
	};
	const clearPendingUnits = () => {
		pendingWordSyncRef.current = null;
		pendingSyllableSyncRef.current = null;
	};
	const resetRecording = () => {
		isKeyboardSyncingRef.current = false;
		keyboardCharIndexRef.current = -1;
		charTimesRef.current = [];
		clearPendingUnits();
	};
	const stopDrag = () => stopSyncCreatorKeyboardDrag(keyboardDragRef, cancelInterval);

	const reconcileTarget = () => {
		const previous = prevKeyboardTargetRef.current;
		prevKeyboardTargetRef.current = identity;
		const sameTarget = !previous || sameSyncCreatorRecordingTarget(previous, identity);
		if (mode === 'record' && sameTarget) return;
		scoreInputRef.current = null;
		if (recordingLockIndexRef.current >= 0) clearRecordingLock();
		if (isKeyboardSyncingRef.current || keyboardDragRef.current) {
			debug('[SyncDataCreator] Resetting keyboard sync state, mode:', mode, 'targetChanged:', !sameTarget);
			stopDrag();
			resetRecording();
			setRecordingProgressIndex(-1);
		}
	};

	const interpolateLockedKeyboardUnit = (nextTime = null) => {
		const word = pendingWordSyncRef.current;
		const pending = word || pendingSyllableSyncRef.current;
		const range = getActiveRecordingLockRange();
		if (pending && range && interpolationEnabledRef.current) {
			interpolateSyncCreatorUnit(charTimesRef.current, pending, word ? 'word' : 'syllable', nextTime);
			charTimesRef.current = clampSyncCreatorTimesToLockRange(
				charTimesRef.current, getCurrentSyncTargetSavedChars(), range, SYNC_CREATOR_MIN_SEQUENTIAL_STEP_SEC
			);
		}
		clearPendingUnits();
	};

	const getLockedUnitRanges = (unit) => {
		if (unit === 'syllable') return currentLineEffectiveSyllableSegments;
		if (unit === 'word') return syncGranularity === 'word' ? currentGranularityRanges : getWordRanges();
		return [];
	};

	// Keep editable characters on both sides of a middle lock reachable.
	const advanceLockedKeyboardSync = (currentTime, unit = 'character') => {
		const range = getActiveRecordingLockRange();
		if (!range) return -1;
		const nextIndex = getSyncCreatorNextEditableIndex(
			isKeyboardSyncingRef.current ? keyboardCharIndexRef.current + 1 : 0,
			range, currentLineChars.length, 1
		);
		if (nextIndex >= currentLineChars.length) return -1;
		if (!isKeyboardSyncingRef.current) {
			isKeyboardSyncingRef.current = true;
			charTimesRef.current = buildLockedCharTimes(range);
			clearPendingUnits();
		}
		interpolateLockedKeyboardUnit(currentTime);
		const ranges = getLockedUnitRanges(unit);
		const target = ranges.find(item => item.end >= nextIndex);
		const endIndex = getSyncCreatorNextEditableIndex(
			Math.min(currentLineChars.length - 1, target?.end ?? nextIndex), range, currentLineChars.length, -1
		);
		const clampTime = createRecordingTimeClamp(range);
		const times = charTimesRef.current;
		let previousTime = getPreviousRecordedSyncTime(times, nextIndex);
		let scoreStart = -1;
		for (let index = nextIndex; index <= endIndex; index++) {
			if (isSyncCreatorIndexLocked(index, range)) {
				if (scoreStart >= 0) markScoreTimingInput(scoreStart, index - 1, 'character');
				scoreStart = -1;
				if (isFiniteSyncCreatorTime(times[index])) previousTime = times[index];
				continue;
			}
			if (scoreStart < 0) scoreStart = index;
			previousTime = clampTime(index, getSequentialSyncTime(currentTime, previousTime));
			times[index] = previousTime;
		}
		if (scoreStart >= 0) markScoreTimingInput(scoreStart, endIndex, 'character');
		if (endIndex > nextIndex && interpolationEnabledRef.current) {
			const pending = { startIdx: nextIndex, endIdx: endIndex, startTime: currentTime };
			if (unit === 'word') pendingWordSyncRef.current = pending;
			else if (unit === 'syllable') pendingSyllableSyncRef.current = pending;
		}
		keyboardCharIndexRef.current = endIndex;
		setRecordingProgressIndex(endIndex, { commitState: false });
		if (getSyncCreatorNextEditableIndex(endIndex + 1, range, currentLineChars.length, 1) >= currentLineChars.length) {
			finishKeyboardSync();
			return -1;
		}
		return endIndex;
	};

	const revertLockedKeyboardSync = (unit = 'character') => {
		const range = getActiveRecordingLockRange();
		const cursor = keyboardCharIndexRef.current;
		if (!range || !isKeyboardSyncingRef.current || cursor < 0) return;
		const ranges = getLockedUnitRanges(unit);
		const target = ranges.find(item => cursor >= item.start && cursor <= item.end);
		const start = target?.start ?? cursor;
		for (let index = start; index <= cursor; index++) {
			if (!isSyncCreatorIndexLocked(index, range)) charTimesRef.current[index] = null;
		}
		let previousIndex = start - 1;
		while (previousIndex >= 0 && (isSyncCreatorIndexLocked(previousIndex, range)
			|| !isFiniteSyncCreatorTime(charTimesRef.current[previousIndex]))) previousIndex--;
		keyboardCharIndexRef.current = previousIndex;
		clearPendingUnits();
		setRecordingProgressIndex(previousIndex, { commitState: false });
		if (previousIndex < 0) {
			isKeyboardSyncingRef.current = false;
		}
	};

	const finishKeyboardSync = () => {
		if (!isKeyboardSyncingRef.current) return;
		const endTime = getProgressSeconds();
		if (!isFiniteSyncCreatorTime(endTime)) return cancelRecording();
		stopDrag();
		if (getActiveRecordingLockRange()) interpolateLockedKeyboardUnit();

		const lockRange = getActiveRecordingLockRange();
		const finalChars = finishSyncCreatorRecordedTimes(charTimesRef.current, {
			endIndex: keyboardCharIndexRef.current, charCount: currentLineChars.length, endTime,
			lockRange, savedChars: lockRange ? getCurrentSyncTargetSavedChars() : null,
		});
		const committedLine = commitCurrentLineSync(finalChars, { createCheckpoint: true });

		// 다음 라인으로 이동
		if (committedLine) {
			advanceAfterCompletedTarget(committedLine);
		}

		// 키보드 싱크 상태 초기화
		resetRecording();
		clearRecordingLock();
		setRecordingProgressIndex(-1);
	};

	const syncWholeLine = (currentTime) => {
		stopDrag();
		const lockIndex = getActiveRecordingLockIndex();
		if (lockIndex >= 0) clearRecordingLock();
		const chars = new Array(currentLineChars.length).fill(roundSyncCreatorTime(currentTime));
		markScoreTimingInput(0, currentLineChars.length - 1, 'line');
		const committedLine = commitCurrentLineSync(chars, { createCheckpoint: true });
		if (committedLine) advanceAfterCompletedTarget(committedLine);
		resetRecording();
		setRecordingProgressIndex(-1);
	};
	const advanceOneChar = (currentTime, autoAdvanceBoundaries) => {
		if (getActiveRecordingLockRange()) return advanceLockedKeyboardSync(currentTime);
		const lockIndex = getActiveRecordingLockIndex();
		const starting = !isKeyboardSyncingRef.current;
		if (starting && lockIndex >= currentLineChars.length - 1) {
			showNoEditableChars();
			return -1;
		}
		const startIndex = starting ? Math.max(0, lockIndex + 1) : Math.max(keyboardCharIndexRef.current + 1, lockIndex + 1);
		if (starting) {
			isKeyboardSyncingRef.current = true;
			charTimesRef.current = buildLockedCharTimes(lockIndex);
			clearPendingUnits();
		}
		if (startIndex < currentLineChars.length) {
			const endIndex = autoAdvanceBoundaries ? getSyncCreatorPunctuationSpanEnd(currentLineChars, startIndex) : startIndex;
			writeTimes(startIndex, endIndex, currentTime);
			markScoreTimingInput(startIndex, endIndex, 'character');
			keyboardCharIndexRef.current = endIndex;
			setRecordingProgressIndex(endIndex, { commitState: false });
			if (starting) {
				debug('[SyncDataCreator] Started keyboard sync, chars:', currentLineChars.length, 'startIndex:', endIndex);
			} else {
				debug('[SyncDataCreator] Advanced to char:', endIndex);
			}
		}

		if (!starting && keyboardCharIndexRef.current >= currentLineChars.length - 1) {
			finishKeyboardSync();
			debug('[SyncDataCreator] Line completed');
			return -1;
		}
		return keyboardCharIndexRef.current;
	};
	const applyInterpolationToPendingWord = (nextWordStartTime) => {
		if (!pendingWordSyncRef.current || !interpolationEnabledRef.current) return;

		const pending = pendingWordSyncRef.current;
		const { startIdx, endIdx } = pending;

		if (endIdx <= startIdx) {
			// 한 글자 단어는 보간 불필요
			pendingWordSyncRef.current = null;
			return;
		}

		const duration = interpolateSyncCreatorUnit(charTimesRef.current, pending, 'word', nextWordStartTime);

		debug('[SyncDataCreator] Applied interpolation to word:', startIdx, '-', endIdx, 'duration:', duration.toFixed(3));
		pendingWordSyncRef.current = null;
	};

	const applyInterpolationToPendingSyllable = (nextSyllableStartTime) => {
		if (!pendingSyllableSyncRef.current || !interpolationEnabledRef.current) return;

		const pending = pendingSyllableSyncRef.current;
		const duration = interpolateSyncCreatorUnit(charTimesRef.current, pending, 'syllable', nextSyllableStartTime);

		debug('[SyncDataCreator] Applied interpolation to syllable:', pending.startIdx, '-', pending.endIdx, 'duration:', duration.toFixed(3));
		pendingSyllableSyncRef.current = null;
	};

	// 한 단어 앞으로 진행하는 헬퍼 함수
	const advanceOneWord = (currentTime) => {
		if (getActiveRecordingLockRange()) return advanceLockedKeyboardSync(currentTime, 'word');
		// 싱크가 시작되지 않은 경우: 첫 단어만 처리
		if (!isKeyboardSyncingRef.current) {
			const lockIndex = getActiveRecordingLockIndex();
			if (lockIndex >= currentLineChars.length - 1) {
				showNoEditableChars();
				return;
			}
			isKeyboardSyncingRef.current = true;
			charTimesRef.current = buildLockedCharTimes(lockIndex);

			let startIdx = Math.max(0, lockIndex + 1);
			const wordStartIdx = startIdx;
			charTimesRef.current[startIdx] = currentTime;

			// 첫 글자가 여는 괄호면 다음 글자까지 포함
			while (startIdx + 1 < currentLineChars.length && isLeadingChar(currentLineChars, startIdx)) {
				startIdx++;
				charTimesRef.current[startIdx] = currentTime;
			}

			// 첫 단어의 끝까지 진행 (단어 경계 만나면 멈춤)
			let endIdx = startIdx;
			while (endIdx + 1 < currentLineChars.length &&
				!isWordBoundary(currentLineChars, endIdx + 1) &&
				!isTrailingChar(currentLineChars, endIdx + 1)) {
				endIdx++;
				charTimesRef.current[endIdx] = currentTime;
			}

			// trailing 문자들(구두점 등) 포함
			while (endIdx + 1 < currentLineChars.length &&
				isTrailingChar(currentLineChars, endIdx + 1) &&
				!isWordBoundary(currentLineChars, endIdx + 1)) {
				endIdx++;
				charTimesRef.current[endIdx] = currentTime;
			}

			markScoreTimingInput(wordStartIdx, endIdx, 'word');
			keyboardCharIndexRef.current = endIdx;
			setRecordingProgressIndex(endIdx, { commitState: false });

			debug('[SyncDataCreator] Word sync started, first word ends at:', endIdx);

			// 마지막 글자면 라인 완료 (보간 적용 후)
			if (keyboardCharIndexRef.current >= currentLineChars.length - 1) {
				// 첫 단어이자 마지막 단어인 경우에도 보간 적용
				if (interpolationEnabledRef.current && endIdx > wordStartIdx) {
					interpolateSyncCreatorUnit(charTimesRef.current, { startIdx: wordStartIdx, endIdx, startTime: currentTime }, 'word');
					debug('[SyncDataCreator] Applied interpolation to single word line');
				}
				finishKeyboardSync();
				debug('[SyncDataCreator] Line completed by word');
			} else {
				// 보간을 위해 현재 단어 정보 저장 (보간 활성화 시)
				if (interpolationEnabledRef.current) {
					pendingWordSyncRef.current = {
						startIdx: wordStartIdx,
						endIdx,
						startTime: currentTime
					};
				}
			}
			return;
		}

		// 이미 싱크 중인 경우: 이전 단어에 보간 적용 후 다음 단어로 진행
		applyInterpolationToPendingWord(currentTime);

		const lockIndex = getActiveRecordingLockIndex();
		const startIdx = Math.max(keyboardCharIndexRef.current, lockIndex);
		let endIdx = startIdx + 1;

		// 먼저 현재 공백들 건너뛰기
		while (endIdx < currentLineChars.length && isWordBoundary(currentLineChars, endIdx)) {
			// 공백에는 이전 단어 끝 시간 + 갭 적용
			charTimesRef.current[endIdx] = currentTime - (WORD_GAP_MS / 2000);
			endIdx++;
		}

		// 다음 단어의 시작 인덱스
		const nextWordStartIdx = endIdx;

		// 다음 단어 경계까지 진행
		while (endIdx < currentLineChars.length && !isWordBoundary(currentLineChars, endIdx) && !isTrailingChar(currentLineChars, endIdx)) {
			charTimesRef.current[endIdx] = currentTime;
			endIdx++;
		}

		// trailing 문자들도 함께 처리
		while (endIdx < currentLineChars.length && isTrailingChar(currentLineChars, endIdx) && !isWordBoundary(currentLineChars, endIdx)) {
			charTimesRef.current[endIdx] = currentTime;
			endIdx++;
		}

		// 최소 한 글자는 진행했는지 확인
		if (endIdx <= startIdx + 1) {
			endIdx = Math.min(startIdx + 1, currentLineChars.length - 1);
			charTimesRef.current[endIdx] = currentTime;
		}

		// endIdx는 마지막으로 처리된 글자의 다음 인덱스이므로 -1
		const finalEndIdx = endIdx - 1;
		markScoreTimingInput(nextWordStartIdx, Math.max(0, finalEndIdx), 'word');
		keyboardCharIndexRef.current = Math.max(0, finalEndIdx);

		setRecordingProgressIndex(keyboardCharIndexRef.current, { commitState: false });

		// 보간을 위해 현재 단어 정보 저장
		if (interpolationEnabledRef.current && nextWordStartIdx < currentLineChars.length) {
			pendingWordSyncRef.current = {
				startIdx: nextWordStartIdx,
				endIdx: keyboardCharIndexRef.current,
				startTime: currentTime
			};
		}

		debug('[SyncDataCreator] Word advanced to char:', keyboardCharIndexRef.current);

		// 마지막 글자면 라인 완료
		if (keyboardCharIndexRef.current >= currentLineChars.length - 1) {
			// 마지막 단어에도 보간 적용 (현재 시간 기준으로 약간의 지속시간 부여)
			if (pendingWordSyncRef.current && interpolationEnabledRef.current) {
				const pending = pendingWordSyncRef.current;
				const { startIdx, endIdx } = pending;
				if (endIdx > startIdx) {
					// 마지막 단어는 시작 시간으로부터 글자 수에 비례한 짧은 지속시간 부여
					interpolateSyncCreatorUnit(charTimesRef.current, pending, 'word');
					debug('[SyncDataCreator] Applied interpolation to last word:', startIdx, '-', endIdx);
				}
			}
			pendingWordSyncRef.current = null;
			finishKeyboardSync();
			debug('[SyncDataCreator] Line completed by word');
		}
	};

	// 한 단어 뒤로 취소하는 헬퍼 함수 (첫 글자도 취소 가능)
	const revertOneWord = () => {
		if (getActiveRecordingLockRange()) return revertLockedKeyboardSync('word');
		if (!isKeyboardSyncingRef.current || keyboardCharIndexRef.current < 0) return;
		const lockIndex = getActiveRecordingLockIndex();
		if (keyboardCharIndexRef.current <= lockIndex) return;

		// 보간 대기 중인 단어 취소
		pendingWordSyncRef.current = null;

		let targetIdx = keyboardCharIndexRef.current - 1;

		while (targetIdx > lockIndex && isTrailingChar(currentLineChars, targetIdx)) targetIdx--;
		while (targetIdx > lockIndex && !isWordBoundary(currentLineChars, targetIdx)) targetIdx--;
		while (targetIdx > lockIndex && isWordBoundary(currentLineChars, targetIdx)) targetIdx--;

		writeTimes(Math.max(targetIdx + 1, lockIndex + 1), keyboardCharIndexRef.current, null);

		keyboardCharIndexRef.current = Math.max(targetIdx, lockIndex);
		setRecordingProgressIndex(keyboardCharIndexRef.current, { commitState: false });
		debug('[SyncDataCreator] Word reverted to char:', keyboardCharIndexRef.current);

		// 모든 글자 취소시 싱크 상태 초기화
		if (keyboardCharIndexRef.current <= lockIndex) {
			isKeyboardSyncingRef.current = false;
			debug('[SyncDataCreator] All chars reverted by word, sync reset');
		}
	};

	const advanceOneSelectedWord = (currentTime) => {
		if (getActiveRecordingLockRange()) return advanceLockedKeyboardSync(currentTime, 'word');
		const lockIndex = getActiveRecordingLockIndex();
		if (lockIndex >= currentLineChars.length - 1) {
			showNoEditableChars();
			return -1;
		}
		if (!isKeyboardSyncingRef.current) {
			isKeyboardSyncingRef.current = true;
			charTimesRef.current = buildLockedCharTimes(lockIndex);
			keyboardCharIndexRef.current = lockIndex;
		}
		const nextRange = currentGranularityRanges.find(range => range.end > keyboardCharIndexRef.current);
		if (!nextRange) {
			finishKeyboardSync();
			return -1;
		}
		const start = Math.max(lockIndex + 1, keyboardCharIndexRef.current + 1, nextRange.start);
		writeTimes(start, nextRange.end, currentTime);
		markScoreTimingInput(start, nextRange.end, 'word');
		keyboardCharIndexRef.current = nextRange.end;
		setRecordingProgressIndex(nextRange.end, { commitState: false });
		if (nextRange.end >= currentLineChars.length - 1) {
			finishKeyboardSync();
			return -1;
		}
		return nextRange.end;
	};

	const revertOneSelectedWord = () => {
		if (getActiveRecordingLockRange()) return revertLockedKeyboardSync('word');
		if (!isKeyboardSyncingRef.current || keyboardCharIndexRef.current < 0) return;
		const lockIndex = getActiveRecordingLockIndex();
		const currentRangeIndex = currentGranularityRanges.findIndex(range => (
			keyboardCharIndexRef.current >= range.start && keyboardCharIndexRef.current <= range.end
		));
		const currentRange = currentGranularityRanges[currentRangeIndex];
		if (!currentRange) return;
		writeTimes(Math.max(lockIndex + 1, currentRange.start), currentRange.end, null);
		const previousRange = currentGranularityRanges[currentRangeIndex - 1];
		keyboardCharIndexRef.current = previousRange && previousRange.end > lockIndex
			? previousRange.end
			: lockIndex;
		setRecordingProgressIndex(keyboardCharIndexRef.current, { commitState: false });
		if (keyboardCharIndexRef.current <= lockIndex) {
			isKeyboardSyncingRef.current = false;
		}
	};
	const revertCharacter = () => {
		if (getActiveRecordingLockRange()) return revertLockedKeyboardSync(syncGranularity === 'word' ? 'word' : 'character');
		if (syncGranularity === 'word') {
			pendingSyllableSyncRef.current = null;
			revertOneSelectedWord();
			return;
		}
		if (isKeyboardSyncingRef.current && keyboardCharIndexRef.current >= 0) {
			const lockIndex = getActiveRecordingLockIndex();
			if (keyboardCharIndexRef.current <= lockIndex) return;
			clearPendingUnits();
			charTimesRef.current[keyboardCharIndexRef.current] = null;
			keyboardCharIndexRef.current--;
			setRecordingProgressIndex(keyboardCharIndexRef.current, { commitState: false });
			debug('[SyncDataCreator] Reverted to char:', keyboardCharIndexRef.current);
			// 모든 글자 취소시 싱크 상태 초기화
			if (keyboardCharIndexRef.current <= lockIndex) {
				isKeyboardSyncingRef.current = false;
				debug('[SyncDataCreator] All chars reverted, sync reset');
			}
		}
		return;
	};
	const revertWord = () => {
		pendingSyllableSyncRef.current = null;
		if (syncGranularity === 'word') revertOneSelectedWord();
		else revertOneWord();
		return;
	};
	const advanceSyllable = (currentTime) => {
		if (getActiveRecordingLockRange()) return advanceLockedKeyboardSync(currentTime, 'syllable');

		if (!currentLineEffectiveSyllableSegments.length) {
			return;
		}

		if (!isKeyboardSyncingRef.current) {
			const lockIndex = getActiveRecordingLockIndex();
			if (lockIndex >= currentLineChars.length - 1) {
				showNoEditableChars();
				return;
			}
			isKeyboardSyncingRef.current = true;
			charTimesRef.current = buildLockedCharTimes(lockIndex);
			pendingSyllableSyncRef.current = null;
			pendingWordSyncRef.current = null;

			const firstSegment = currentLineEffectiveSyllableSegments.find(segment => segment.end > lockIndex);
			if (!firstSegment) {
				isKeyboardSyncingRef.current = false;
				keyboardCharIndexRef.current = lockIndex;
				return;
			}
			const segmentStart = Math.max(firstSegment.start, lockIndex + 1);
			writeTimes(segmentStart, firstSegment.end, currentTime);

			markScoreTimingInput(segmentStart, firstSegment.end, 'character');
			keyboardCharIndexRef.current = firstSegment.end;
			setRecordingProgressIndex(firstSegment.end, { commitState: false });
			debug('[SyncDataCreator] Syllable sync started, segment:', firstSegment.start, '-', firstSegment.end);

			if (firstSegment.end >= currentLineChars.length - 1) {
				interpolateSyncCreatorUnit(charTimesRef.current,
					{ startIdx: segmentStart, endIdx: firstSegment.end, startTime: currentTime }, 'syllable');
				finishKeyboardSync();
				debug('[SyncDataCreator] Line completed by syllable');
				return;
			}

			pendingSyllableSyncRef.current = {
				startIdx: segmentStart,
				endIdx: firstSegment.end,
				startTime: currentTime
			};
			return;
		}

		const currentSegmentIndex = currentLineEffectiveSyllableSegments.findIndex(
			(segment) => keyboardCharIndexRef.current >= segment.start && keyboardCharIndexRef.current <= segment.end
		);
		const nextSegment = currentLineEffectiveSyllableSegments[(currentSegmentIndex >= 0 ? currentSegmentIndex : -1) + 1];

		if (!nextSegment) {
			applyInterpolationToPendingSyllable(currentTime);
			finishKeyboardSync();
			return;
		}

		applyInterpolationToPendingSyllable(currentTime);
		const lockIndex = getActiveRecordingLockIndex();
		const segmentStart = Math.max(nextSegment.start, lockIndex + 1);
		writeTimes(segmentStart, nextSegment.end, currentTime);

		markScoreTimingInput(segmentStart, nextSegment.end, 'character');
		keyboardCharIndexRef.current = nextSegment.end;
		setRecordingProgressIndex(nextSegment.end, { commitState: false });
		debug('[SyncDataCreator] Syllable advanced to segment:', nextSegment.start, '-', nextSegment.end);

		if (nextSegment.end >= currentLineChars.length - 1) {
			interpolateSyncCreatorUnit(charTimesRef.current,
				{ startIdx: segmentStart, endIdx: nextSegment.end, startTime: currentTime }, 'syllable');
			pendingSyllableSyncRef.current = null;
			finishKeyboardSync();
			debug('[SyncDataCreator] Line completed by syllable');
			return;
		}

		pendingSyllableSyncRef.current = {
			startIdx: segmentStart,
			endIdx: nextSegment.end,
			startTime: currentTime
		};
		return;
	};
	const cancelRecording = () => {
		scoreInputRef.current = null;
		stopDrag();
		if (isKeyboardSyncingRef.current) {
			resetRecording();
			clearRecordingLock();
			setRecordingProgressIndex(-1);
		}
		return;
	};

	const advance = (unit, autoAdvanceBoundaries) => {
		const time = getProgressSeconds();
		if (!isFiniteSyncCreatorTime(time)) return -1;
		if (unit === 'syllable') return advanceSyllable(time);
		if (syncGranularity === 'line') {
			syncWholeLine(time);
			return -1;
		}
		if (syncGranularity === 'word') return advanceOneSelectedWord(time);
		if (unit === 'word') return advanceOneWord(time);
		return advanceOneChar(time, autoAdvanceBoundaries);
	};
	return {
		reconcileTarget,
		advance,
		revertCharacter,
		revertWord,
		cancelRecording,
		canFinish: () => isKeyboardSyncingRef.current && keyboardCharIndexRef.current >= 0,
		finish: finishKeyboardSync,
	};
}
