import { countSyncCreatorRangeChars } from './timingGranularity.mjs';
import { stripStandaloneParentheticalCharRange } from './syncParentheticalText.mjs';

export const normalizeSyncCreatorHiddenRanges = (ranges) => {
	if (!Array.isArray(ranges)) return [];
	const normalizedRanges = ranges
		.map((range) => {
			const start = Number(range?.start);
			const end = Number(range?.end);
			return Number.isInteger(start) && Number.isInteger(end) && end >= start
				? { start, end }
				: null;
		})
		.filter(Boolean)
		.sort((a, b) => a.start - b.start || a.end - b.end);

	return normalizedRanges.reduce((merged, range) => {
		const previous = merged[merged.length - 1];
		if (previous && range.start <= previous.end + 1) {
			previous.end = Math.max(previous.end, range.end);
		} else {
			merged.push(range);
		}
		return merged;
	}, []);
};

const isSyncCreatorRangeGapFullyHidden = (hiddenRanges, gapStart, gapEnd) => {
	if (gapStart > gapEnd || !Array.isArray(hiddenRanges) || hiddenRanges.length === 0) return false;

	let cursor = gapStart;
	for (const hiddenRange of hiddenRanges) {
		const start = Number(hiddenRange?.start);
		const end = Number(hiddenRange?.end);
		if (!Number.isInteger(start) || !Number.isInteger(end) || end < start) return false;
		if (end < cursor) continue;
		if (start > cursor) return false;
		cursor = Math.max(cursor, end + 1);
		if (cursor > gapEnd) return true;
	}

	return false;
};

const getNextSyncCreatorPartId = (usedIds) => {
	for (const label of 'abcdefghijklmnopqrstuvwxyz') {
		if (!usedIds.has(label)) {
			usedIds.add(label);
			return label;
		}
	}

	let index = 1;
	while (index <= 16) {
		const id = `p${index}`;
		if (!usedIds.has(id)) {
			usedIds.add(id);
			return id;
		}
		index++;
	}

	return null;
};

const splitSyncCreatorHiddenDelimitedParallelPart = (part, hiddenRanges, usedIds) => {
	if (
		!part
		|| typeof part !== 'object'
		|| part.role !== 'background'
		|| typeof part.id !== 'string'
		|| !Array.isArray(part.ranges)
		|| part.ranges.length < 2
		|| !Array.isArray(part.join)
		|| part.join.length !== part.ranges.length - 1
		|| !part.join.every(joinMode => Number.isInteger(joinMode) && joinMode >= 0 && joinMode <= 2)
	) {
		return null;
	}

	const hasSyncedChars = Array.isArray(part.chars);
	if (hasSyncedChars && part.chars.length !== countSyncCreatorRangeChars(part.ranges)) {
		return null;
	}
	if (part.join.some(joinMode => Number(joinMode) === 2)) {
		return null;
	}

	for (let index = 0; index < part.ranges.length; index++) {
		const range = part.ranges[index];
		const start = Number(range?.start);
		const end = Number(range?.end);
		if (!Number.isInteger(start) || !Number.isInteger(end) || end < start) return null;
		if (index > 0) {
			const previousRange = part.ranges[index - 1];
			const previousEnd = Number(previousRange?.end);
			if (!Number.isInteger(previousEnd) || start <= previousEnd) return null;
			if (!isSyncCreatorRangeGapFullyHidden(hiddenRanges, previousEnd + 1, start - 1)) {
				return null;
			}
		}
	}

	const splitParts = [];
	let charOffset = 0;
	for (let index = 0; index < part.ranges.length; index++) {
		const range = part.ranges[index];
		const charCount = range.end - range.start + 1;
		const id = index === 0 ? part.id : getNextSyncCreatorPartId(usedIds);
		if (!id) return null;

		const splitPart = {
			...part,
			id,
			ranges: [{ ...range }],
			join: []
		};
		if (hasSyncedChars) {
			splitPart.chars = part.chars.slice(charOffset, charOffset + charCount);
		} else {
			delete splitPart.chars;
		}
		splitParts.push(splitPart);
		charOffset += charCount;
	}

	return splitParts;
};

export const splitSyncCreatorHiddenDelimitedParallelParts = (parallel, options = {}) => {
	if (!parallel || typeof parallel !== 'object' || !Array.isArray(parallel.parts) || !Array.isArray(parallel.hiddenRanges)) {
		return parallel;
	}
	if (options.splitHiddenDelimitedBackgroundParts === false) {
		return parallel;
	}

	const usedIds = new Set(parallel.parts
		.map(part => (typeof part?.id === 'string' ? part.id : null))
		.filter(Boolean));
	const parts = [];
	let changed = false;

	parallel.parts.forEach((part) => {
		const splitParts = splitSyncCreatorHiddenDelimitedParallelPart(part, parallel.hiddenRanges, usedIds);
		if (splitParts) {
			changed = true;
			parts.push(...splitParts);
		} else {
			parts.push(part);
		}
	});

	return changed && parts.length <= 16 ? { ...parallel, parts } : parallel;
};

export const normalizeSyncCreatorParentheticalParallelRanges = (parallel, fullTextChars) => {
	const sourceChars = Array.isArray(fullTextChars) ? fullTextChars : [];
	if (!parallel || typeof parallel !== 'object' || !Array.isArray(parallel.parts) || sourceChars.length === 0) {
		return { parallel, changed: false };
	}

	const hiddenRanges = Array.isArray(parallel.hiddenRanges) ? [...parallel.hiddenRanges] : [];
	let changed = false;
	const parts = parallel.parts.map((part) => {
		if (!part || !Array.isArray(part.ranges) || part.ranges.length !== 1 || !Array.isArray(part.chars)) {
			return part;
		}

		const range = part.ranges[0];
		const start = Number(range?.start);
		const end = Number(range?.end);
		if (
			!Number.isInteger(start)
			|| !Number.isInteger(end)
			|| start < 0
			|| end < start
			|| end >= sourceChars.length
			|| part.chars.length !== end - start + 1
		) {
			return part;
		}

		const localChars = sourceChars.slice(start, end + 1);
		const hiddenLocalIndexes = [];
		const stripped = stripStandaloneParentheticalCharRange(
			localChars,
			0,
			localChars.length - 1,
			index => hiddenLocalIndexes.push(index)
		);
		if (!stripped.changed || stripped.start > stripped.end) return part;

		const nextChars = part.chars.slice(stripped.start, stripped.end + 1);
		if (nextChars.length !== stripped.end - stripped.start + 1) return part;

		changed = true;
		hiddenLocalIndexes.forEach(index => {
			const absoluteIndex = start + index;
			hiddenRanges.push({ start: absoluteIndex, end: absoluteIndex });
		});

		return {
			...part,
			ranges: [{ ...range, start: start + stripped.start, end: start + stripped.end }],
			chars: nextChars
		};
	});

	if (!changed) {
		return { parallel, changed: false };
	}

	return {
		parallel: sanitizeSyncCreatorParallel({
			...parallel,
			hiddenRanges,
			parts
		}),
		changed: true
	};
};
