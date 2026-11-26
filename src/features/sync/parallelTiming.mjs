import {
	countSyncCreatorRangeChars,
	isFiniteSyncCreatorTime,
	normalizeSyncCreatorGranularity,
	normalizeSyncCreatorTimeSequence,
} from './timingGranularity.mjs';
import { SYNC_CREATOR_MAX_PART_ID_LENGTH } from './timingValidation.mjs';

const areSyncCreatorParallelRangesEqual = (leftRanges, rightRanges) => (
	Array.isArray(leftRanges)
	&& Array.isArray(rightRanges)
	&& leftRanges.length === rightRanges.length
	&& leftRanges.every((range, index) => (
		Number(range?.start) === Number(rightRanges[index]?.start)
		&& Number(range?.end) === Number(rightRanges[index]?.end)
	))
);
const syncCreatorRejoinedTimingSequences = new WeakSet();
const hasOrderedSyncCreatorTimes = (chars) => {
	if (!Array.isArray(chars)) return false;
	let previous = 0;
	for (const time of chars) {
		if (!isFiniteSyncCreatorTime(time) || time < previous) return false;
		previous = time;
	}
	return true;
};
const hasReusableSyncCreatorParallelChars = (targetPart, sourcePart) => (
	Array.isArray(sourcePart?.chars)
	&& areSyncCreatorParallelRangesEqual(targetPart?.ranges, sourcePart?.ranges)
	&& sourcePart.chars.length === countSyncCreatorRangeChars(targetPart?.ranges)
);
// Character spans own the right-click. Record-mode locks are character-only,
// while outside record mode a plain right-click arms a character or a word.
const isSyncCreatorCharContextMenuEnabled = (granularity, mode) => (
	granularity === 'character' || (granularity === 'word' && mode !== 'record')
);
const getSyncCreatorParallelPreviewChars = (part, savedPart) => {
	const timingSource = hasReusableSyncCreatorParallelChars(part, part) ? part : savedPart;
	return hasReusableSyncCreatorParallelChars(part, timingSource)
		&& Array.from(timingSource.chars).every((time, index, times) => (
			isFiniteSyncCreatorTime(time) && time >= 0 && (
				index === 0 || time >= times[index - 1] || syncCreatorRejoinedTimingSequences.has(timingSource.chars)
			)
		)) ? timingSource.chars : [];
};
const countSyncCreatorParallelRangeOverlap = (leftRanges, rightRanges) => {
	let overlap = 0;
	for (const left of Array.isArray(leftRanges) ? leftRanges : []) {
		const leftStart = Number(left?.start);
		const leftEnd = Number(left?.end);
		if (!Number.isInteger(leftStart) || !Number.isInteger(leftEnd) || leftEnd < leftStart) continue;
		for (const right of Array.isArray(rightRanges) ? rightRanges : []) {
			const rightStart = Number(right?.start);
			const rightEnd = Number(right?.end);
			if (!Number.isInteger(rightStart) || !Number.isInteger(rightEnd) || rightEnd < rightStart) continue;
			overlap += Math.max(0, Math.min(leftEnd, rightEnd) - Math.max(leftStart, rightStart) + 1);
		}
	}
	return overlap;
};
const getSyncCreatorConcurrentParallelParts = (parallel) => {
	const parts = Array.isArray(parallel?.parts) ? parallel.parts : [];
	return parts.filter((part, index) => parts.slice(0, index).some(previous => (
		countSyncCreatorParallelRangeOverlap(previous?.ranges, part?.ranges) > 0
	)));
};
const getSyncCreatorPersistedParallelSplitPoints = (parallel, lineStart, lineLength) => {
	const numericLineStart = Number(lineStart);
	const numericLineLength = Number(lineLength);
	if (!Number.isInteger(numericLineStart) || !Number.isInteger(numericLineLength) || numericLineLength < 2) return [];
	// Ordered timing runs can outnumber the groups the user chose to keep.
	// An explicit empty list means that every manual boundary was removed.
	if (Array.isArray(parallel?.manualSplitPoints)) {
		return [...new Set(parallel.manualSplitPoints
			.filter(point => Number.isInteger(point) && point > 0 && point < numericLineLength))]
			.sort((left, right) => left - right);
	}
	const parts = Array.isArray(parallel?.parts) ? parallel.parts : [];
	if (parts.length < 2 || parts.some(part => !Array.isArray(part?.ranges) || part.ranges.length !== 1)) return [];
	const orderedRanges = parts
		.map(part => {
			const start = Number(part.ranges[0]?.start);
			const end = Number(part.ranges[0]?.end);
			return Number.isInteger(start) && Number.isInteger(end) && end >= start
				? { start, end }
				: null;
		})
		.filter(Boolean)
		.sort((left, right) => left.start - right.start || left.end - right.end);
	if (orderedRanges.length !== parts.length) return [];
	for (let index = 1; index < orderedRanges.length; index++) {
		if (orderedRanges[index].start <= orderedRanges[index - 1].end) return [];
	}
	return [...new Set(orderedRanges.slice(1)
		.map(range => range.start - numericLineStart)
		.filter(point => point > 0 && point < numericLineLength))]
		.sort((left, right) => left - right);
};
const resolveSyncCreatorManualSplitState = (
	drafts,
	lineStart,
	lineLength,
	existingParallel,
	autoSplitPoints = []
) => {
	const sourceDrafts = drafts && typeof drafts === 'object' ? drafts : {};
	const hasManualDraft = Object.prototype.hasOwnProperty.call(sourceDrafts, lineStart);
	const manualSource = hasManualDraft
		? sourceDrafts[lineStart]
		: getSyncCreatorPersistedParallelSplitPoints(existingParallel, lineStart, lineLength);
	const normalizePoints = (values) => [...new Set((Array.isArray(values) ? values : [])
		.map(value => Number(value))
		.filter(value => Number.isInteger(value) && value > 0 && value < lineLength))]
		.sort((left, right) => left - right);
	const manualSplitPoints = normalizePoints(manualSource);
	return {
		hasManualDraft,
		manualSplitPoints,
		splitPoints: normalizePoints([...autoSplitPoints, ...manualSplitPoints])
	};
};
const findSyncCreatorParallelSourcePart = (targetPart, sourceParts) => {
	const candidates = Array.isArray(sourceParts) ? sourceParts : [];
	const exact = candidates.find(part => (
		part?.id === targetPart?.id
		&& areSyncCreatorParallelRangesEqual(targetPart?.ranges, part?.ranges)
	));
	if (exact) return exact;

	let bestPart = null;
	let bestOverlap = 0;
	for (const part of candidates) {
		const overlap = countSyncCreatorParallelRangeOverlap(targetPart?.ranges, part?.ranges);
		if (
			overlap > bestOverlap
			|| (overlap > 0 && overlap === bestOverlap && part?.id === targetPart?.id)
		) {
			bestPart = part;
			bestOverlap = overlap;
		}
	}
	return bestPart;
};
const buildSyncCreatorExistingTimingIndex = (line) => {
	const timingByAbsoluteIndex = new Map();
	const partTimedIndexes = new Set();
	const pendingIndexes = new Set();
	const parts = Array.isArray(line?.parallel?.parts) ? line.parallel.parts : [];
	for (const part of parts) {
		const expectedLength = countSyncCreatorRangeChars(part?.ranges);
		if (!expectedLength) continue;
		const recorded = hasReusableSyncCreatorParallelChars(part, part);
		// A saved parent has a valid line marker even during partial recording.
		// Indices belonging to a pending vocal must never inherit that marker.
		let charIndex = 0;
		for (const range of part.ranges) {
			const start = Number(range?.start);
			const end = Number(range?.end);
			if (!Number.isInteger(start) || !Number.isInteger(end) || end < start) break;
			for (let absoluteIndex = start; absoluteIndex <= end; absoluteIndex++) {
				const time = recorded ? part.chars[charIndex] : undefined;
				if (!isFiniteSyncCreatorTime(time)) pendingIndexes.add(absoluteIndex);
				else if (!timingByAbsoluteIndex.has(absoluteIndex)) {
					timingByAbsoluteIndex.set(absoluteIndex, time);
					partTimedIndexes.add(absoluteIndex);
				}
				charIndex++;
			}
		}
	}

	const lineStart = Number(line?.start);
	const lineEnd = Number(line?.end);
	const expectedLineLength = Number.isInteger(lineStart) && Number.isInteger(lineEnd) && lineEnd >= lineStart
		? lineEnd - lineStart + 1
		: 0;
	if (expectedLineLength && Array.isArray(line?.chars) && line.chars.length === expectedLineLength) {
		line.chars.forEach((time, index) => {
			const absoluteIndex = lineStart + index;
			if (isFiniteSyncCreatorTime(time) && !pendingIndexes.has(absoluteIndex) && !timingByAbsoluteIndex.has(absoluteIndex)) {
				timingByAbsoluteIndex.set(absoluteIndex, time);
			}
		});
	}
	// Split separators have no sung timing. Their parent marks may predate a
	// vocal offset, so constrain only those gaps to their visible neighbours.
	// Real vocal overlaps must retain every recorded mark exactly.
	const hiddenIndexes = new Set();
	for (const range of [
		...(Array.isArray(line?.hiddenRanges) ? line.hiddenRanges : []),
		...(Array.isArray(line?.parallel?.hiddenRanges) ? line.parallel.hiddenRanges : [])
	]) {
		const start = Math.max(lineStart, Number(range?.start));
		const end = Math.min(lineEnd, Number(range?.end));
		if (!Number.isInteger(start) || !Number.isInteger(end)) continue;
		for (let index = start; index <= end; index++) {
			if (!partTimedIndexes.has(index)) hiddenIndexes.add(index);
		}
	}
	for (let index = lineStart; hiddenIndexes.size && index <= lineEnd; index++) {
		if (!hiddenIndexes.has(index)) continue;
		const start = index;
		while (index < lineEnd && hiddenIndexes.has(index + 1)) index++;
		const previous = timingByAbsoluteIndex.get(start - 1);
		const next = timingByAbsoluteIndex.get(index + 1);
		let minimum = isFiniteSyncCreatorTime(previous) ? previous : 0;
		const maximum = isFiniteSyncCreatorTime(next) ? next : Infinity;
		if (minimum > maximum) continue;
		for (let gapIndex = start; gapIndex <= index; gapIndex++) {
			const time = timingByAbsoluteIndex.get(gapIndex);
			if (!isFiniteSyncCreatorTime(time)) continue;
			minimum = Math.max(minimum, Math.min(maximum, time));
			timingByAbsoluteIndex.set(gapIndex, minimum);
		}
	}
	return timingByAbsoluteIndex;
};
const preserveSyncCreatorParallelTimingRuns = (parallel) => {
	if (!Array.isArray(parallel?.parts)) return parallel;
	const usedIds = new Set(parallel.parts.map(part => part.id));
	const parts = parallel.parts.flatMap(part => {
		if (!hasReusableSyncCreatorParallelChars(part, part) || hasOrderedSyncCreatorTimes(part.chars)) return [part];
		const runs = [];
		let charIndex = 0;
		for (const [rangeIndex, range] of part.ranges.entries()) {
			for (let index = range.start; index <= range.end; index++) {
				const time = part.chars[charIndex++];
				let run = runs[runs.length - 1];
				if (!run || time < run.chars[run.chars.length - 1]) {
					let id = part.id;
					if (run) {
						let suffix = 1;
						const candidate = () => {
							const ending = `_${suffix}`;
							return `${String(part.id).slice(0, SYNC_CREATOR_MAX_PART_ID_LENGTH - ending.length)}${ending}`;
						};
						while (usedIds.has(candidate())) suffix++;
						id = candidate();
						usedIds.add(id);
					}
					run = { ...part, id, granularity: 'character', ranges: [], join: [], chars: [] };
					runs.push(run);
				}
				const previousRange = run.ranges[run.ranges.length - 1];
				if (previousRange && index > range.start && index === previousRange.end + 1) previousRange.end = index;
				else {
					if (previousRange) run.join.push(part.join?.[rangeIndex - 1] ?? 1);
					run.ranges.push({ start: index, end: index });
				}
				run.chars.push(time);
			}
		}
		// Only the run that holds the part's last character keeps its held end.
		const lastIndex = part.ranges[part.ranges.length - 1]?.end;
		return runs.map(run => (run.ranges[run.ranges.length - 1]?.end === lastIndex || run.lastCharEnd === undefined
			? run
			: (({ lastCharEnd, ...rest }) => rest)(run)));
	});
	return { ...parallel, parts };
};

const hasExplicitSyncCreatorGroupedBackground = (parallel) => (
	Array.isArray(parallel?.parts)
	&& parallel.parts.some((part) => {
		if (part?.role !== 'background' || !Array.isArray(part.ranges) || part.ranges.length < 2) return false;
		if (!Array.isArray(part.join) || part.join.length !== part.ranges.length - 1) return false;
		const hasValidRanges = part.ranges.every((range, index) => {
			const start = Number(range?.start);
			const end = Number(range?.end);
			const previousEnd = index > 0 ? Number(part.ranges[index - 1]?.end) : -1;
			return Number.isInteger(start)
				&& Number.isInteger(end)
				&& end >= start
				&& (index === 0 || start > previousEnd);
		});
		const hasValidJoins = part.join.every((joinMode) => {
			const mode = Number(joinMode);
			return Number.isInteger(mode) && mode >= 0 && mode <= 2;
		});
		return hasValidRanges && hasValidJoins && part.join.some(joinMode => Number(joinMode) === 2);
	})
);
const selectSyncCreatorParallelTemplate = (existingParallel, textTemplate, options = {}) => {
	const hasManualDraft = options.hasManualDraft === true;
	if (!hasManualDraft && hasExplicitSyncCreatorGroupedBackground(existingParallel)) {
		return existingParallel;
	}

	if (!hasManualDraft && Array.isArray(existingParallel?.parts) && existingParallel.parts.length > 1) {
		if (textTemplate && textTemplate.parts.length > existingParallel.parts.length) {
			return textTemplate;
		}
		return existingParallel;
	}

	return textTemplate || (options.isMergedWithNext ? existingParallel : null);
};

function createSyncCreatorParallelEditing({ getSyncCreatorSyncDataValidationError, projectSyncCreatorUnitLayout }) {
	const inheritSyncCreatorParallelPartChars = (targetPart, existingLine) => {
		const expectedLength = countSyncCreatorRangeChars(targetPart?.ranges);
		if (!expectedLength) return undefined;
		const timingByAbsoluteIndex = buildSyncCreatorExistingTimingIndex(existingLine);
		const inheritedChars = [];
		for (const range of Array.isArray(targetPart?.ranges) ? targetPart.ranges : []) {
			const start = Number(range?.start);
			const end = Number(range?.end);
			if (!Number.isInteger(start) || !Number.isInteger(end) || end < start) return undefined;
			for (let absoluteIndex = start; absoluteIndex <= end; absoluteIndex++) {
				if (!timingByAbsoluteIndex.has(absoluteIndex)) return undefined;
				inheritedChars.push(timingByAbsoluteIndex.get(absoluteIndex));
			}
		}
		if (inheritedChars.length !== expectedLength) return undefined;
		// Only editor-generated joins of valid independent vocals may go backwards.
		// Malformed imported/saved timing targets still fail preview validation.
		if (!hasOrderedSyncCreatorTimes(inheritedChars)
			&& getSyncCreatorSyncDataValidationError({ lines: [existingLine] }) === null) {
			syncCreatorRejoinedTimingSequences.add(inheritedChars);
		}
		return inheritedChars;
	};
	const getSyncCreatorRejoinedLineChars = (line) => (
		inheritSyncCreatorParallelPartChars({ ranges: [{ start: line?.start, end: line?.end }] }, line)
			|| line?.chars
	);

	const refreshSyncCreatorLineCharsFromParallel = (line) => {
		const chars = getSyncCreatorRejoinedLineChars(line);
		if (!Array.isArray(chars)) return line;
		return {
			...line,
			chars: hasOrderedSyncCreatorTimes(chars) ? chars : normalizeSyncCreatorTimeSequence(chars, 'word')
		};
	};

	const resolveSyncCreatorParallelTemplateParts = (templateParts, existingLine) => {
		const existingParts = Array.isArray(existingLine?.parallel?.parts) ? existingLine.parallel.parts : [];
		return (Array.isArray(templateParts) ? templateParts : []).map(part => {
			const sourcePart = findSyncCreatorParallelSourcePart(part, existingParts);
			// A recorded sibling can give the parent placeholder marks. An
			// explicitly unrecorded vocal must keep its missing timing.
			if (sourcePart && !hasReusableSyncCreatorParallelChars(sourcePart, sourcePart)) {
				return { part, sourcePart, chars: undefined };
			}
			return {
				part, sourcePart,
				// Concurrent vocals can share lyric indexes but have distinct marks.
				chars: hasReusableSyncCreatorParallelChars(part, sourcePart)
					? sourcePart.chars
					: inheritSyncCreatorParallelPartChars(part, existingLine)
			};
		});
	};

	const rejoinSyncCreatorParallelLine = (line, options = {}) => {
		const chars = getSyncCreatorRejoinedLineChars(line);
		if (!hasOrderedSyncCreatorTimes(chars) && options.preview !== true) {
			// The wire format requires ordered targets. Retain the independent vocal
			// timings as provenance when a joined row contains overlapping vocals.
			return { ...line, parallel: { ...line.parallel, manualSplitPoints: [] } };
		}
		const granularity = normalizeSyncCreatorGranularity(line?.granularity);
		const joined = {
			...line, chars,
			granularity: granularity === 'line' && chars?.some(time => time !== chars[0]) ? 'character' : granularity
		};
		delete joined.parallel;
		return joined;
	};

	const sliceSyncCreatorLineTiming = (line, start, end, { keepParallel = false } = {}) => {
		const chars = inheritSyncCreatorParallelPartChars({ ranges: [{ start, end }] }, line);
		const sliceRanges = ranges => (Array.isArray(ranges) ? ranges : [])
			.map(range => ({ ...range, start: Math.max(start, range.start), end: Math.min(end, range.end) }))
			.filter(range => range.end >= range.start);
		const parts = (Array.isArray(line?.parallel?.parts) ? line.parallel.parts : []).flatMap(part => {
			let charIndex = 0;
			const ranges = [];
			const times = [];
			const join = [];
			for (const [rangeIndex, range] of (part.ranges || []).entries()) {
				const from = Math.max(start, range.start);
				const to = Math.min(end, range.end);
				if (to >= from) {
					if (ranges.length) join.push(part.join?.[rangeIndex - 1] ?? 1);
					ranges.push({ ...range, start: from, end: to });
					if (Array.isArray(part.chars)) times.push(...part.chars.slice(charIndex + from - range.start, charIndex + to - range.start + 1));
				}
				charIndex += range.end - range.start + 1;
			}
			if (!ranges.length) return [];
			const slicedPart = { ...part, ranges, join, ...(Array.isArray(part.chars) ? { chars: times } : {}) };
			// A held end belongs to the part's last character; keep it only with it.
			if (ranges[ranges.length - 1].end !== part.ranges[part.ranges.length - 1]?.end) delete slicedPart.lastCharEnd;
			return [projectSyncCreatorUnitLayout(part, slicedPart)];
		});
		const recordedPart = parts.find(part => hasReusableSyncCreatorParallelChars(part, part));
		if (!chars && !recordedPart) return null;
		const sliced = {
			...line, start, end,
			chars: chars ?? new Array(end - start + 1).fill(recordedPart.chars[0]),
			granularity: chars ? 'character' : 'line',
			hiddenRanges: sliceRanges(line?.hiddenRanges), styleRanges: sliceRanges(line?.styleRanges),
			...(parts.length ? { parallel: {
				...line.parallel, parts, hiddenRanges: sliceRanges(line.parallel.hiddenRanges),
				...(Array.isArray(line.parallel.manualSplitPoints) ? { manualSplitPoints: line.parallel.manualSplitPoints
					.map(point => Number(line.start) + point - start)
					.filter(point => point > 0 && point <= end - start) } : {})
			} } : {})
		};
		delete sliced.mergedLineContinuationStarts;
		if (end !== Number(line?.end)) delete sliced.lastCharEnd;
		if (!sliced.hiddenRanges.length) delete sliced.hiddenRanges;
		if (!sliced.styleRanges.length) delete sliced.styleRanges;
		if (!parts.length) delete sliced.parallel;
		else if (!sliced.parallel.hiddenRanges.length) delete sliced.parallel.hiddenRanges;

		if (!chars || parts.length > 1 || (keepParallel && parts.length)) {
			return projectSyncCreatorUnitLayout(line, refreshSyncCreatorLineCharsFromParallel(sliced));
		}
		const onlyPart = parts[0];
		const partEndsAtSlice = onlyPart?.ranges.at(-1)?.end === end;
		if (partEndsAtSlice && isFiniteSyncCreatorTime(onlyPart.lastCharEnd)) sliced.lastCharEnd = onlyPart.lastCharEnd;
		const joined = rejoinSyncCreatorParallelLine(sliced);
		return projectSyncCreatorUnitLayout(onlyPart?.unitLayout ? onlyPart : line, joined);
	};
	// Parts, ranges and merge/split markers belong inside their saved row. The
	// displayed row can be wider than the saved one (for example after merging with
	// a lyric that has no timing yet), so keep only what the saved row covers.
	// Rows that are already inside their bounds are returned unchanged.
	const clipSyncCreatorLineToBounds = (line) => {
		const start = Number(line?.start);
		const end = Number(line?.end);
		if (!Number.isInteger(start) || !Number.isInteger(end) || end < start) return line;
		const length = end - start + 1;
		const isIntegerRange = range => Number.isInteger(range?.start) && Number.isInteger(range?.end) && range.end >= range.start;
		const isOutside = range => isIntegerRange(range) && (range.start < start || range.end > end);
		const hasOutside = ranges => Array.isArray(ranges) && ranges.some(isOutside);
		const clipRanges = ranges => ranges.flatMap(range => {
			if (!isOutside(range)) return [range];
			const from = Math.max(start, range.start);
			const to = Math.min(end, range.end);
			return to >= from ? [{ ...range, start: from, end: to }] : [];
		});
		const clipPart = (part) => {
			const ranges = Array.isArray(part?.ranges) ? part.ranges : null;
			if (!ranges || !hasOutside(ranges) || !ranges.every(isIntegerRange)) return part;
			const hasChars = Array.isArray(part.chars) && part.chars.length === countSyncCreatorRangeChars(ranges);
			const nextRanges = [];
			const join = [];
			const chars = [];
			let charIndex = 0;
			ranges.forEach((range, rangeIndex) => {
				const from = Math.max(start, range.start);
				const to = Math.min(end, range.end);
				if (to >= from) {
					if (nextRanges.length) join.push(part.join?.[rangeIndex - 1] ?? 1);
					nextRanges.push({ ...range, start: from, end: to });
					if (hasChars) chars.push(...part.chars.slice(charIndex + from - range.start, charIndex + to - range.start + 1));
				}
				charIndex += range.end - range.start + 1;
			});
			if (!nextRanges.length) return null;
			const nextPart = { ...part, ranges: nextRanges, join };
			if (nextRanges[nextRanges.length - 1].end !== ranges[ranges.length - 1].end) delete nextPart.lastCharEnd;
			if (hasChars) {
				nextPart.chars = chars;
			} else {
				// Timing that cannot be mapped onto the kept characters is dropped.
				delete nextPart.chars;
				delete nextPart.timing;
				delete nextPart.lastCharEnd;
			}
			return projectSyncCreatorUnitLayout(part, nextPart);
		};
		const parallel = line.parallel && typeof line.parallel === 'object' ? line.parallel : null;
		const parts = Array.isArray(parallel?.parts) ? parallel.parts : null;
		const mergedStarts = Array.isArray(line.mergedLineContinuationStarts) ? line.mergedLineContinuationStarts : null;
		const splitPoints = Array.isArray(parallel?.manualSplitPoints) ? parallel.manualSplitPoints : null;
		const needsClip = hasOutside(line.hiddenRanges) || hasOutside(line.styleRanges) || hasOutside(parallel?.hiddenRanges)
			|| Boolean(parts?.some(part => hasOutside(part?.ranges)))
			|| Boolean(mergedStarts?.some(value => Number.isInteger(value) && (value <= start || value > end)))
			|| Boolean(splitPoints?.some(point => Number.isInteger(point) && (point <= 0 || point >= length)));
		if (!needsClip) return line;

		const nextLine = { ...line };
		for (const key of ['hiddenRanges', 'styleRanges']) {
			if (!Array.isArray(line[key])) continue;
			const ranges = clipRanges(line[key]);
			if (ranges.length) nextLine[key] = ranges;
			else delete nextLine[key];
		}
		if (mergedStarts) {
			const starts = mergedStarts.filter(value => !Number.isInteger(value) || (value > start && value <= end));
			if (starts.length) nextLine.mergedLineContinuationStarts = starts;
			else delete nextLine.mergedLineContinuationStarts;
		}
		if (parts) {
			const nextParts = parts.map(clipPart).filter(Boolean);
			if (!nextParts.length) {
				delete nextLine.parallel;
			} else {
				const nextParallel = { ...parallel, parts: nextParts };
				if (Array.isArray(parallel.hiddenRanges)) {
					const hiddenRanges = clipRanges(parallel.hiddenRanges);
					if (hiddenRanges.length) nextParallel.hiddenRanges = hiddenRanges;
					else delete nextParallel.hiddenRanges;
				}
				// An empty list stays meaningful: every manual boundary was removed.
				if (splitPoints) {
					nextParallel.manualSplitPoints = splitPoints.filter(point => !Number.isInteger(point) || (point > 0 && point < length));
				}
				nextLine.parallel = nextParallel;
			}
		}
		return nextLine;
	};
	const clipSyncCreatorSyncDataToLineBounds = (data) => {
		if (!Array.isArray(data?.lines)) return data;
		const lines = data.lines.map(clipSyncCreatorLineToBounds);
		return lines.some((line, index) => line !== data.lines[index]) ? { ...data, lines } : data;
	};

	return {
		getSyncCreatorRejoinedLineChars,
		inheritSyncCreatorParallelPartChars,
		refreshSyncCreatorLineCharsFromParallel,
		resolveSyncCreatorParallelTemplateParts,
		rejoinSyncCreatorParallelLine,
		sliceSyncCreatorLineTiming,
		clipSyncCreatorLineToBounds,
		clipSyncCreatorSyncDataToLineBounds,
	};
}

export {
	areSyncCreatorParallelRangesEqual,
	createSyncCreatorParallelEditing,
	getSyncCreatorConcurrentParallelParts,
	getSyncCreatorParallelPreviewChars,
	hasOrderedSyncCreatorTimes,
	hasReusableSyncCreatorParallelChars,
	isSyncCreatorCharContextMenuEnabled,
	preserveSyncCreatorParallelTimingRuns,
	resolveSyncCreatorManualSplitState,
	selectSyncCreatorParallelTemplate,
};
