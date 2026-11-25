import {
    areSyncCreatorParallelRangesEqual, hasReusableSyncCreatorParallelChars, preserveSyncCreatorParallelTimingRuns,
} from "./parallelTiming.mjs";
import { followSyncCreatorLastCharShift, shiftSyncCreatorSelectionTimes } from "./selectionTiming.mjs";
import { isFiniteSyncCreatorTime, roundSyncCreatorTime, SYNC_CREATOR_MIN_SEQUENTIAL_STEP_SEC } from "./timingGranularity.mjs";

export const collectSyncCreatorLineTimes = (line) => {
	const times = [];
	const appendTimes = (values) => {
		if (!Array.isArray(values)) return;
		values.forEach((value) => {
			if (typeof value === 'number' && Number.isFinite(value)) {
				times.push(value);
			}
		});
	};

	appendTimes(line?.chars);
	if (Array.isArray(line?.parallel?.parts)) {
		line.parallel.parts.forEach(part => appendTimes(part?.chars));
	}

	return times;
};

export function shiftSyncCreatorGlobalTiming(prev, deltaMs) {
	const deltaSec = deltaMs / 1000;
	const shiftHeldEnd = (target) => (isFiniteSyncCreatorTime(target?.lastCharEnd)
		? { lastCharEnd: Math.round((target.lastCharEnd + deltaSec) * 1000) / 1000 }
		: {});

	if (!prev || !prev.lines) return prev;
	return {
		...prev,
		lines: prev.lines.map(line => ({
			...line,
			chars: line.chars.map(t => Math.round((t + deltaSec) * 1000) / 1000),
			...shiftHeldEnd(line),
			parallel: line.parallel ? {
				...line.parallel,
				parts: Array.isArray(line.parallel.parts)
					? line.parallel.parts.map(part => ({
						...part,
						chars: Array.isArray(part.chars)
							? part.chars.map(t => Math.round((t + deltaSec) * 1000) / 1000)
							: part.chars,
						...shiftHeldEnd(part)
					}))
					: line.parallel.parts
			} : line.parallel
		}))
	};
}

export function readSyncCreatorOffsetPart(line, { currentParallelTemplate, activeParallelPart, mergeSyncCreatorParallelTemplate }) {
	const parallel = mergeSyncCreatorParallelTemplate(currentParallelTemplate, line);
	const part = parallel?.parts?.find(entry => entry.id === activeParallelPart.id
		&& areSyncCreatorParallelRangesEqual(entry.ranges, activeParallelPart.ranges));
	return part && hasReusableSyncCreatorParallelChars(activeParallelPart, part) ? { parallel, part } : null;
}

export function shiftSyncCreatorSelectedTiming(prev, {
	deltaMs, selectionRange, currentLineStart, currentParallelTemplate, activeParallelPart,
}, { mergeSyncCreatorParallelTemplate, refreshSyncCreatorLineCharsFromParallel, clipSyncCreatorLineToBounds }) {
	if (!prev || !Array.isArray(prev.lines)) return prev;
	const targetIndex = prev.lines.findIndex(line => line.start === currentLineStart);
	if (targetIndex < 0) return prev;
	const sourceLine = prev.lines[targetIndex];
	if (!activeParallelPart) {
		const shifted = shiftSyncCreatorSelectionTimes(
			sourceLine.chars, selectionRange.start, selectionRange.end,
			deltaMs / 1000, SYNC_CREATOR_MIN_SEQUENTIAL_STEP_SEC
		);
		if (!shifted.ok) return prev;
		return {
			...prev,
			lines: prev.lines.map((line, index) => index === targetIndex
				? { ...line, chars: shifted.times, ...followSyncCreatorLastCharShift(line, sourceLine.chars, shifted.times) }
				: line)
		};
	}
	// The shift lands on the active part's chars and the merged row is
	// rebuilt from the updater's current data, never a stale render's.
	const target = readSyncCreatorOffsetPart(sourceLine, { currentParallelTemplate, activeParallelPart, mergeSyncCreatorParallelTemplate });
	if (!target) return prev;
	const { parallel, part: targetPart } = target;
	const shiftedPart = shiftSyncCreatorSelectionTimes(
		targetPart.chars, selectionRange.start, selectionRange.end,
		deltaMs / 1000, SYNC_CREATOR_MIN_SEQUENTIAL_STEP_SEC
	);
	if (!shiftedPart.ok) return prev;
	return {
		...prev,
		lines: prev.lines.map((line, index) => index === targetIndex
			? refreshSyncCreatorLineCharsFromParallel(clipSyncCreatorLineToBounds({
				...sourceLine,
				parallel: preserveSyncCreatorParallelTimingRuns({
					...parallel,
					parts: parallel.parts.map(part => part === targetPart
						? { ...part, chars: shiftedPart.times, ...followSyncCreatorLastCharShift(part, targetPart.chars, shiftedPart.times) }
						: part)
				})
			}))
			: line)
	};
}

export function shiftSyncCreatorLineTiming(prev, {
	requestedDeltaSec, currentLineStart, currentParallelTemplate, activeParallelPart,
}, { mergeSyncCreatorParallelTemplate, refreshSyncCreatorLineCharsFromParallel, clipSyncCreatorLineToBounds }) {
	if (!prev || !Array.isArray(prev.lines) || !Number.isInteger(currentLineStart)) return prev;

	const targetIndex = prev.lines.findIndex(line => line.start === currentLineStart);
	if (targetIndex < 0) return prev;

	const sourceLine = prev.lines[targetIndex];
	// currentLineIndex is the ORIGINAL source row, shared by all vocals.
	// Rebuild from the updater's current data, never a stale render's chars.
	const parallel = activeParallelPart
		? mergeSyncCreatorParallelTemplate(currentParallelTemplate, sourceLine)
		: null;
	const targetPart = parallel?.parts?.find(part => part.id === activeParallelPart.id
		&& areSyncCreatorParallelRangesEqual(part.ranges, activeParallelPart.ranges));
	if (activeParallelPart && !hasReusableSyncCreatorParallelChars(activeParallelPart, targetPart)) return prev;
	const targetLine = parallel ? { ...sourceLine, parallel } : sourceLine;
	const targetTimes = targetPart ? collectSyncCreatorLineTimes(targetPart) : collectSyncCreatorLineTimes(targetLine);
	if (targetTimes.length === 0) return prev;

	const firstTime = Math.min(...targetTimes);
	// Bound only the selected timing target at the start of the track.
	const boundedDeltaSec = Math.max(requestedDeltaSec, -firstTime);
	if ((requestedDeltaSec > 0 && boundedDeltaSec <= 0) || (requestedDeltaSec < 0 && boundedDeltaSec >= 0)) return prev;
	if (!Number.isFinite(boundedDeltaSec) || Math.abs(boundedDeltaSec) < 0.0005) return prev;

	const shiftTimes = (values) => Array.isArray(values)
		? values.map(time => (
			typeof time === 'number' && Number.isFinite(time)
				? roundSyncCreatorTime(Math.max(0, time + boundedDeltaSec))
				: time
		))
		: values;
	const shiftTarget = (target) => {
		const chars = shiftTimes(target.chars);
		return { ...target, chars, ...followSyncCreatorLastCharShift(target, target.chars, chars) };
	};
	const shiftLine = (line) => ({
		...shiftTarget(line),
		parallel: line.parallel ? {
			...line.parallel,
			parts: Array.isArray(line.parallel.parts)
				? line.parallel.parts.map(shiftTarget)
				: line.parallel.parts
		} : line.parallel
	});
	const shiftedLine = targetPart
		// The displayed row can include merged lyrics that the saved row
		// does not cover yet; only the saved row's parts are written back.
		? refreshSyncCreatorLineCharsFromParallel(clipSyncCreatorLineToBounds({
			...targetLine,
			parallel: preserveSyncCreatorParallelTimingRuns({
				...parallel,
				parts: parallel.parts.map(part => part === targetPart ? shiftTarget(part) : part)
			})
		}))
		: shiftLine(targetLine);

	return {
		...prev,
		lines: prev.lines.map((line, index) => index === targetIndex ? shiftedLine : line)
	};
}
