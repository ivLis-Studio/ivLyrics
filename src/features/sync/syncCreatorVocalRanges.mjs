import {
	splitSyncDataHiddenDelimitedParallelParts, trimSyncDataPartParentheticals,
} from '../../lyrics/syncRenderVocalRanges.mjs';

// Hidden ranges as the editor keeps them: valid, sorted and merged, so
// adjacent hidden characters read as one range.
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

// Splits background parts whose ranges are separated only by hidden
// characters, as the renderer does. The editor's parts may not be timed yet,
// and the user can opt out of the split.
export const splitSyncCreatorHiddenDelimitedParallelParts = (parallel, options = {}) => (
	options.splitHiddenDelimitedBackgroundParts === false
		? parallel
		: splitSyncDataHiddenDelimitedParallelParts(parallel, { allowUntimedParts: true })
);

// Moves standalone parenthetical characters at the edges of single-range
// parts out of the part and into the line's hidden ranges, then sanitizes the
// result with the editor's own rules (sanitizeParallel).
export const normalizeSyncCreatorParentheticalParallelRanges = (parallel, fullTextChars, sanitizeParallel) => {
	const sourceChars = Array.isArray(fullTextChars) ? fullTextChars : [];
	if (!parallel || typeof parallel !== 'object' || !Array.isArray(parallel.parts) || sourceChars.length === 0) {
		return { parallel, changed: false };
	}

	const hiddenRanges = Array.isArray(parallel.hiddenRanges) ? [...parallel.hiddenRanges] : [];
	let changed = false;
	const parts = parallel.parts.map((part) => {
		const trimmed = trimSyncDataPartParentheticals(part, sourceChars, index => hiddenRanges.push({ start: index, end: index }));
		if (trimmed !== part) changed = true;
		return trimmed;
	});

	if (!changed) {
		return { parallel, changed: false };
	}

	return {
		parallel: sanitizeParallel({
			...parallel,
			hiddenRanges,
			parts
		}),
		changed: true
	};
};
