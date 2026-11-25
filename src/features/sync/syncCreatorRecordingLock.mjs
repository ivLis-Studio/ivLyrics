import { hasReusableSyncCreatorParallelChars } from './parallelTiming.mjs';
import { isFiniteSyncCreatorTime, SYNC_CREATOR_MIN_SEQUENTIAL_STEP_SEC } from './timingGranularity.mjs';

export function useSyncCreatorRecordingLockControls({
	react: { useCallback }, recordingLockIndexRef, recordingLockRangeRef, setRecordingLockIndex, setRecordingLockRange,
}) {
	const setRecordingLockIndexValue = useCallback((index) => {
		const safeIndex = Number.isInteger(index) && index >= 0 ? index : -1;
		recordingLockIndexRef.current = safeIndex;
		setRecordingLockIndex(safeIndex);
	}, []);

	const setRecordingLockRangeValue = useCallback((start, end) => {
		if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start) {
			recordingLockRangeRef.current = null;
			setRecordingLockRange(null);
			return false;
		}
		const range = { start, end };
		recordingLockRangeRef.current = range;
		setRecordingLockRange(range);
		return true;
	}, []);

	const clearRecordingLock = useCallback(() => {
		recordingLockRangeRef.current = null;
		setRecordingLockRange(null);
		recordingLockIndexRef.current = -1;
		setRecordingLockIndex(-1);
	}, []);

	return { setRecordingLockIndexValue, setRecordingLockRangeValue, clearRecordingLock };
}

export function useSyncCreatorRecordingLockTiming({
	react: { useCallback }, currentLineChars, currentExistingLineData, activeParallelPart, activeParallelTargetId,
	recordingLockRangeRef, recordingLockIndexRef, getSyncCreatorRejoinedLineChars,
}) {
	const getCurrentSyncTargetSavedChars = useCallback(() => {
		const expectedLength = currentLineChars.length;
		if (!expectedLength) return [];

		let savedChars = null;
		if (activeParallelPart) {
			if (hasReusableSyncCreatorParallelChars(activeParallelPart, activeParallelPart)) {
				savedChars = activeParallelPart.chars;
			} else {
				const savedPart = currentExistingLineData?.parallel?.parts?.find(part => part.id === activeParallelTargetId);
				if (hasReusableSyncCreatorParallelChars(activeParallelPart, savedPart)) savedChars = savedPart.chars;
			}
		} else if (Array.isArray(currentExistingLineData?.chars)) {
			savedChars = getSyncCreatorRejoinedLineChars(currentExistingLineData);
		}

		if (!Array.isArray(savedChars)) return new Array(expectedLength).fill(null);
		return Array.from({ length: expectedLength }, (_, index) => {
			const time = savedChars[index];
			return isFiniteSyncCreatorTime(time) ? time : null;
		});
	}, [activeParallelPart, activeParallelTargetId, currentExistingLineData, currentLineChars.length]);
	const getActiveRecordingLockRange = useCallback(() => {
		const range = recordingLockRangeRef.current;
		if (range && Number.isInteger(range.start) && Number.isInteger(range.end)
			&& range.start >= 0 && range.end >= range.start && currentLineChars.length > 0) {
			return {
				start: Math.max(0, Math.min(range.start, currentLineChars.length - 1)),
				end: Math.max(0, Math.min(range.end, currentLineChars.length - 1))
			};
		}
		const lockIndex = recordingLockIndexRef.current;
		if (!Number.isInteger(lockIndex) || lockIndex < 0 || currentLineChars.length === 0) return null;
		return { start: 0, end: Math.min(lockIndex, currentLineChars.length - 1) };
	}, [currentLineChars.length]);
	const getActiveRecordingLockIndex = useCallback(() => {
		const lockIndex = recordingLockIndexRef.current;
		if (!Number.isInteger(lockIndex) || lockIndex < 0 || currentLineChars.length === 0) return -1;
		return Math.min(lockIndex, currentLineChars.length - 1);
	}, [currentLineChars.length]);
	const buildLockedCharTimes = useCallback((lockIndex = getActiveRecordingLockIndex()) => {
		const nextCharTimes = new Array(currentLineChars.length).fill(null);
		let range = getActiveRecordingLockRange();
		if (lockIndex !== undefined && lockIndex !== null) {
			if (typeof lockIndex === 'object' && Number.isInteger(lockIndex.start) && Number.isInteger(lockIndex.end)) {
				range = { start: Math.max(0, lockIndex.start), end: Math.min(lockIndex.end, currentLineChars.length - 1) };
			} else if (Number.isInteger(lockIndex) && lockIndex >= 0 && !range) {
				range = { start: 0, end: Math.min(lockIndex, currentLineChars.length - 1) };
			} else if (lockIndex === -1) {
				range = getActiveRecordingLockRange();
			}
		}
		if (!range || range.start < 0 || range.end < range.start) return nextCharTimes;

		const savedChars = getCurrentSyncTargetSavedChars();
		for (let i = Math.max(0, range.start); i <= Math.min(range.end, nextCharTimes.length - 1); i++) {
			nextCharTimes[i] = savedChars[i];
		}
		return nextCharTimes;
	}, [currentLineChars.length, getActiveRecordingLockIndex, getActiveRecordingLockRange, getCurrentSyncTargetSavedChars]);
	const createRecordingTimeClamp = useCallback((range) => {
		if (!range) return (_index, value) => value;
		const savedChars = getCurrentSyncTargetSavedChars();
		const start = savedChars[range.start];
		const end = savedChars[range.end];
		return (index, value) => {
			if (!Number.isFinite(value)) return value;
			if (index < range.start && isFiniteSyncCreatorTime(start)) {
				return Math.max(0, Math.min(value, start - (range.start - index) * SYNC_CREATOR_MIN_SEQUENTIAL_STEP_SEC));
			}
			if (index > range.end && isFiniteSyncCreatorTime(end)) {
				return Math.max(value, end + (index - range.end) * SYNC_CREATOR_MIN_SEQUENTIAL_STEP_SEC);
			}
			return value;
		};
	}, [getCurrentSyncTargetSavedChars]);

	return {
		getCurrentSyncTargetSavedChars, getActiveRecordingLockRange, getActiveRecordingLockIndex,
		buildLockedCharTimes, createRecordingTimeClamp,
	};
}
