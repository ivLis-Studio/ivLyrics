import {
	countSyncCreatorRangeChars,
	decodeSyncCreatorCompactTiming,
	isFiniteSyncCreatorTime,
	normalizeSyncCreatorGranularity,
	normalizeSyncCreatorTimeSequence,
} from './timingGranularity.mjs';

const SYNC_CREATOR_MAX_PARALLEL_PARTS = 16;
const SYNC_CREATOR_MAX_PART_ID_LENGTH = 32;
// A held note ends at most this long after its last character starts.
const SYNC_CREATOR_MAX_LAST_CHAR_HOLD_SEC = 60;

const repairSyncCreatorLineCharsFromParallel = (line) => {
	const lineStart = Number(line?.start);
	const lineEnd = Number(line?.end);
	if (!Number.isInteger(lineStart) || !Number.isInteger(lineEnd) || lineEnd < lineStart) return line;

	const expectedLength = lineEnd - lineStart + 1;
	if (
		Array.isArray(line?.chars)
		&& line.chars.length === expectedLength
		&& line.chars.every(isFiniteSyncCreatorTime)
	) {
		return line;
	}

	const parts = line?.parallel?.parts;
	if (!Array.isArray(parts) || parts.length === 0) return line;

	const rebuiltChars = new Array(expectedLength).fill(null);
	for (const part of parts) {
		const expectedPartLength = countSyncCreatorRangeChars(part?.ranges);
		if (
			expectedPartLength <= 0
			|| !Array.isArray(part?.chars)
			|| part.chars.length !== expectedPartLength
			|| !part.chars.every(isFiniteSyncCreatorTime)
		) {
			return line;
		}

		let partCharIndex = 0;
		for (const range of part.ranges) {
			const rangeStart = Number(range?.start);
			const rangeEnd = Number(range?.end);
			if (
				!Number.isInteger(rangeStart)
				|| !Number.isInteger(rangeEnd)
				|| rangeStart < lineStart
				|| rangeEnd > lineEnd
				|| rangeEnd < rangeStart
			) {
				return line;
			}
			for (let absoluteIndex = rangeStart; absoluteIndex <= rangeEnd; absoluteIndex++) {
				rebuiltChars[absoluteIndex - lineStart] = part.chars[partCharIndex++];
			}
		}
	}

	const hiddenIndexes = new Set();
	const hiddenRanges = [
		...(Array.isArray(line?.hiddenRanges) ? line.hiddenRanges : []),
		...(Array.isArray(line?.parallel?.hiddenRanges) ? line.parallel.hiddenRanges : [])
	];
	for (const range of hiddenRanges) {
		const rangeStart = Math.max(lineStart, Number(range?.start));
		const rangeEnd = Math.min(lineEnd, Number(range?.end));
		if (!Number.isInteger(rangeStart) || !Number.isInteger(rangeEnd) || rangeEnd < rangeStart) continue;
		for (let absoluteIndex = rangeStart; absoluteIndex <= rangeEnd; absoluteIndex++) {
			hiddenIndexes.add(absoluteIndex - lineStart);
		}
	}

	for (let index = 0; index < rebuiltChars.length; index++) {
		if (isFiniteSyncCreatorTime(rebuiltChars[index])) continue;
		if (!hiddenIndexes.has(index)) return line;
		const previous = index > 0 && isFiniteSyncCreatorTime(rebuiltChars[index - 1])
			? rebuiltChars[index - 1]
			: null;
		const fallback = previous ?? rebuiltChars.slice(index + 1).find(isFiniteSyncCreatorTime);
		if (!isFiniteSyncCreatorTime(fallback)) return line;
		rebuiltChars[index] = fallback;
	}

	return {
		...line,
		chars: normalizeSyncCreatorTimeSequence(rebuiltChars, line?.granularity)
	};
};
const getSyncCreatorRangesValidationError = (ranges, lineStart, lineEnd, label) => {
	if (!Array.isArray(ranges) || ranges.length === 0) {
		return `${label}: ranges must be a non-empty array`;
	}

	let previousEnd = lineStart - 1;
	for (let rangeIndex = 0; rangeIndex < ranges.length; rangeIndex++) {
		const range = ranges[rangeIndex];
		const start = Number(range?.start);
		const end = Number(range?.end);
		if (!Number.isInteger(start) || !Number.isInteger(end)) {
			return `${label}: range ${rangeIndex + 1} start/end must be integers`;
		}
		if (start < lineStart || end > lineEnd || end < start) {
			return `${label}: range ${rangeIndex + 1} is outside the parent line`;
		}
		if (start <= previousEnd) {
			return `${label}: range ${rangeIndex + 1} overlaps or is out of order`;
		}
		previousEnd = end;
	}

	return null;
};
// Optional end of a line's or part's last character (seconds), for a held final
// note. It must come after that character's own time and within the hold limit.
const getSyncCreatorLastCharEndError = (target, times) => {
	if (target?.lastCharEnd === undefined) return null;
	const lastTime = Array.isArray(times) ? times[times.length - 1] : null;
	if (!isFiniteSyncCreatorTime(lastTime)) return 'lastCharEnd needs character timing';
	if (!isFiniteSyncCreatorTime(target.lastCharEnd) || target.lastCharEnd <= lastTime
		|| target.lastCharEnd > lastTime + SYNC_CREATOR_MAX_LAST_CHAR_HOLD_SEC) {
		return `lastCharEnd must be after the last character and within ${SYNC_CREATOR_MAX_LAST_CHAR_HOLD_SEC} seconds`;
	}
	return null;
};
// Drops end marks that no longer follow their last character (after a re-sync,
// an offset or a split). Data without such marks is returned unchanged.
const sanitizeSyncCreatorLastCharEnds = (data) => {
	if (!Array.isArray(data?.lines)) return data;
	let changed = false;
	const clean = (target, times) => {
		if (target?.lastCharEnd === undefined || !getSyncCreatorLastCharEndError(target, times)) return target;
		changed = true;
		const next = { ...target };
		delete next.lastCharEnd;
		return next;
	};
	const lines = data.lines.map((line) => {
		const lineLength = Number(line?.end) - Number(line?.start) + 1;
		let next = clean(line, decodeSyncCreatorCompactTiming(line, lineLength)?.chars);
		if (Array.isArray(next?.parallel?.parts)) {
			const parts = next.parallel.parts.map(part => clean(
				part,
				decodeSyncCreatorCompactTiming(part, countSyncCreatorRangeChars(part?.ranges))?.chars
			));
			if (parts.some((part, index) => part !== next.parallel.parts[index])) {
				next = { ...next, parallel: { ...next.parallel, parts } };
			}
		}
		return next;
	});
	return changed ? { ...data, lines } : data;
};

function createSyncCreatorValidation({ prepareSyncCreatorWorkSnapshot, getSyncCreatorStyleRangeSpeakerMeta, normalizeSyncCreatorKind }) {
	const getSyncCreatorSyncDataValidationError = (data) => {
		if (data?.version === 6) {
			try { data = prepareSyncCreatorWorkSnapshot(data); } catch (error) { return error.message; }
		}
		if (!data || !Array.isArray(data.lines)) return 'Invalid sync data format';

		for (let lineIndex = 0; lineIndex < data.lines.length; lineIndex++) {
			const line = data.lines[lineIndex];
			const start = Number(line?.start);
			const end = Number(line?.end);
			if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start) {
				return `Line ${lineIndex + 1}: invalid character range`;
			}

			const expectedLength = end - start + 1;
			if (!Array.isArray(line?.chars) || line.chars.length !== expectedLength) {
				return `Line ${lineIndex + 1}: expected ${expectedLength} char timings, received ${Array.isArray(line?.chars) ? line.chars.length : 0}`;
			}
			const invalidLineCharIndex = line.chars.findIndex(value => !isFiniteSyncCreatorTime(value) || value < 0);
			if (invalidLineCharIndex >= 0) {
				return `Line ${lineIndex + 1}, char ${invalidLineCharIndex}: invalid time value`;
			}
			const backwardLineCharIndex = line.chars.findIndex((value, index) => index > 0 && value < line.chars[index - 1]);
			if (backwardLineCharIndex >= 0) {
				return `Line ${lineIndex + 1}, char ${backwardLineCharIndex}: time goes backwards`;
			}
			const lineLastCharEndError = getSyncCreatorLastCharEndError(line, line.chars);
			if (lineLastCharEndError) return `Line ${lineIndex + 1}: ${lineLastCharEndError}`;
			if (line.granularity !== undefined && normalizeSyncCreatorGranularity(line.granularity) !== line.granularity) {
				return `Line ${lineIndex + 1}: invalid sync granularity`;
			}

			if (line.hiddenRanges !== undefined) {
				const hiddenError = getSyncCreatorRangesValidationError(
					line.hiddenRanges,
					start,
					end,
					`Line ${lineIndex + 1}, hiddenRanges`
				);
				if (hiddenError) return hiddenError;
			}

			if (line.styleRanges !== undefined) {
				const styleError = getSyncCreatorRangesValidationError(
					line.styleRanges,
					start,
					end,
					`Line ${lineIndex + 1}, styleRanges`
				);
				if (styleError) return styleError;
				for (let styleIndex = 0; styleIndex < line.styleRanges.length; styleIndex++) {
					const styleRange = line.styleRanges[styleIndex];
					const styleSpeakerMeta = getSyncCreatorStyleRangeSpeakerMeta(styleRange);
					if (!normalizeSyncCreatorKind(styleRange?.kind) && !styleSpeakerMeta) {
						return `Line ${lineIndex + 1}, style range ${styleIndex + 1}: effect or speaker color is required`;
					}
					if (styleRange?.kind !== undefined && !normalizeSyncCreatorKind(styleRange.kind)) {
						return `Line ${lineIndex + 1}, style range ${styleIndex + 1}: invalid text effect`;
					}
					if (styleRange?.speaker !== undefined && !styleSpeakerMeta) {
						return `Line ${lineIndex + 1}, style range ${styleIndex + 1}: invalid speaker color`;
					}
				}
			}

			const parts = Array.isArray(line?.parallel?.parts) ? line.parallel.parts : [];
			if (parts.length > SYNC_CREATOR_MAX_PARALLEL_PARTS) {
				return `Line ${lineIndex + 1}: parallel.parts cannot exceed ${SYNC_CREATOR_MAX_PARALLEL_PARTS}`;
			}
			if (line?.parallel?.manualSplitPoints !== undefined) {
				const points = line.parallel.manualSplitPoints;
				if (!Array.isArray(points) || points.length >= SYNC_CREATOR_MAX_PARALLEL_PARTS) {
					return `Line ${lineIndex + 1}: parallel.manualSplitPoints must contain at most ${SYNC_CREATOR_MAX_PARALLEL_PARTS - 1} boundaries`;
				}
				if (points.some((point, index) => !Number.isInteger(point) || point <= 0 || point >= expectedLength
					|| (index > 0 && point <= points[index - 1]))) {
					return `Line ${lineIndex + 1}: parallel.manualSplitPoints must be ordered boundaries inside the parent line`;
				}
			}
			for (let partIndex = 0; partIndex < parts.length; partIndex++) {
				const part = parts[partIndex];
				const partLabel = String(part?.id || partIndex + 1);
				if (typeof part?.id === 'string' && part.id.length > SYNC_CREATOR_MAX_PART_ID_LENGTH) {
					return `Line ${lineIndex + 1}, parallel part ${partIndex + 1}: id is too long`;
				}
				const rangeError = getSyncCreatorRangesValidationError(
					part?.ranges,
					start,
					end,
					`Line ${lineIndex + 1}, parallel part ${partLabel}`
				);
				if (rangeError) return rangeError;
				if (!Array.isArray(part?.chars)) {
					if (part?.lastCharEnd !== undefined) {
						return `Line ${lineIndex + 1}, parallel part ${partLabel}: lastCharEnd needs character timing`;
					}
					continue;
				}
				const expectedPartLength = countSyncCreatorRangeChars(part.ranges);
				if (part.chars.length !== expectedPartLength) {
					return `Line ${lineIndex + 1}, parallel part ${partLabel}: expected ${expectedPartLength} char timings, received ${part.chars.length}`;
				}
				const invalidPartCharIndex = part.chars.findIndex(value => !isFiniteSyncCreatorTime(value) || value < 0);
				if (invalidPartCharIndex >= 0) {
					return `Line ${lineIndex + 1}, parallel part ${partLabel}, char ${invalidPartCharIndex}: invalid time value`;
				}
				const backwardPartCharIndex = part.chars.findIndex((value, index) => index > 0 && value < part.chars[index - 1]);
				if (backwardPartCharIndex >= 0) {
					return `Line ${lineIndex + 1}, parallel part ${partLabel}, char ${backwardPartCharIndex}: time goes backwards`;
				}
				if (part.granularity !== undefined && normalizeSyncCreatorGranularity(part.granularity) !== part.granularity) {
					return `Line ${lineIndex + 1}, parallel part ${partLabel}: invalid sync granularity`;
				}
				const partLastCharEndError = getSyncCreatorLastCharEndError(part, part.chars);
				if (partLastCharEndError) return `Line ${lineIndex + 1}, parallel part ${partLabel}: ${partLastCharEndError}`;
			}

			if (line?.parallel?.hiddenRanges !== undefined) {
				const hiddenError = getSyncCreatorRangesValidationError(
					line.parallel.hiddenRanges,
					start,
					end,
					`Line ${lineIndex + 1}, hiddenRanges`
				);
				if (hiddenError) return hiddenError;
			}
		}

		return null;
	};
	const assertValidSyncCreatorSyncData = (data) => {
		const validationError = getSyncCreatorSyncDataValidationError(data);
		if (validationError) throw new Error(`Invalid sync data: ${validationError}`);
		return data;
	};

	return { getSyncCreatorSyncDataValidationError, assertValidSyncCreatorSyncData };
}

export {
	SYNC_CREATOR_MAX_LAST_CHAR_HOLD_SEC,
	SYNC_CREATOR_MAX_PART_ID_LENGTH,
	createSyncCreatorValidation,
	repairSyncCreatorLineCharsFromParallel,
	sanitizeSyncCreatorLastCharEnds,
};
