export const SYNC_CREATOR_MAX_MERGED_LINES = 5;

function normalizeMergedLineDraftStarts(value) {
	const rawStarts = Array.isArray(value)
		? value
		: Number.isInteger(Number(value))
			? [Number(value)]
			: [];
	return [...new Set(rawStarts
		.map(start => Number(start))
		.filter(start => Number.isInteger(start)))]
		.sort((a, b) => a - b)
		.slice(0, SYNC_CREATOR_MAX_MERGED_LINES - 1);
}
const lineHasParallelRangeOverlapping = (line, lineStart, lineEnd) => (
	Array.isArray(line?.parallel?.parts)
	&& line.parallel.parts.some(part =>
		Array.isArray(part?.ranges)
		&& part.ranges.some((range) => {
			const rangeStart = Number(range?.start);
			const rangeEnd = Number(range?.end);
			return Number.isInteger(rangeStart)
				&& Number.isInteger(rangeEnd)
				&& rangeStart <= lineEnd
				&& rangeEnd >= lineStart;
		})
	)
);

export function createSyncCreatorMergedLayout(lyricDocument, mergedLineDrafts, syncData) {
	const { lyricsLines, lineCharOffsets, lineChars, lineIndexByStart, getLineEndAtIndex } = lyricDocument;
	const savedLinesByStart = new Map((Array.isArray(syncData?.lines) ? syncData.lines : []).map(line => [line.start, line]));
	const groups = new Map();
	const owners = new Map();

	function getIndexesFromMergedStarts(startIndex, mergedStarts) {
		const indexes = [startIndex];
		if (mergedStarts === undefined) return indexes;
		const starts = normalizeMergedLineDraftStarts(mergedStarts);
		for (let index = startIndex + 1; index < lyricsLines.length && indexes.length < SYNC_CREATOR_MAX_MERGED_LINES; index++) {
			if (!starts.includes(lineCharOffsets[index])) break;
			indexes.push(index);
		}
		return indexes;
	}

	function getSavedMergedIndexes(startIndex, lineData) {
		const indexes = getIndexesFromMergedStarts(startIndex, lineData?.mergedLineContinuationStarts);
		if (!Array.isArray(lineData?.parallel?.parts)) return indexes;

		for (let index = indexes.at(-1) + 1; index < lyricsLines.length && indexes.length < SYNC_CREATOR_MAX_MERGED_LINES; index++) {
			const nextStart = lineCharOffsets[index];
			const nextEnd = getLineEndAtIndex(index);
			if (!Number.isInteger(nextStart) || nextEnd < nextStart || Number(lineData.end) < nextEnd) break;
			if (!lineHasParallelRangeOverlapping(lineData, nextStart, nextEnd)) break;
			indexes.push(index);
		}
		return indexes;
	}

	function resolveMergedLineIndexes(startIndex, linesByStart) {
		if (startIndex < 0 || startIndex >= lyricsLines.length) return [];
		const lineStart = lineCharOffsets[startIndex];
		if (!Number.isInteger(lineStart)) return [startIndex];

		const draftIndexes = getIndexesFromMergedStarts(startIndex, mergedLineDrafts[lineStart]);
		const savedIndexes = getSavedMergedIndexes(startIndex, linesByStart.get(lineStart));
		// An older draft may describe fewer rows than the saved timing covers.
		// The editor only shrinks a group once the saved timing has been split.
		return draftIndexes.length > savedIndexes.length ? draftIndexes : savedIndexes;
	}
	// Playback navigation and completion counting traverse the same layout on
	// each edit. Cache only this layout's saved data; preview and export can
	// ask about a different set of lines before it is committed.
	function readMergedLineIndexes(startIndex, linesByStartOverride) {
		if (linesByStartOverride) return resolveMergedLineIndexes(startIndex, linesByStartOverride);
		let indexes = groups.get(startIndex);
		if (!indexes) {
			indexes = resolveMergedLineIndexes(startIndex, savedLinesByStart);
			groups.set(startIndex, indexes);
		}
		return indexes;
	}

	function resolveMergedOwnerLineIndex(index, linesByStartOverride) {
		if (index <= 0 || index >= lyricsLines.length) return -1;
		const minIndex = Math.max(0, index - SYNC_CREATOR_MAX_MERGED_LINES + 1);
		for (let ownerIndex = index - 1; ownerIndex >= minIndex; ownerIndex--) {
			const mergedIndexes = readMergedLineIndexes(ownerIndex, linesByStartOverride);
			if (mergedIndexes.includes(index)) return ownerIndex;
		}
		return -1;
	}

	function findMergedOwnerLineIndex(index, linesByStartOverride = null) {
		if (linesByStartOverride) return resolveMergedOwnerLineIndex(index, linesByStartOverride);
		let owner = owners.get(index);
		if (owner === undefined) {
			owner = resolveMergedOwnerLineIndex(index, null);
			owners.set(index, owner);
		}
		return owner;
	}

	function isLineCoveredByMergedPrevious(index, linesByStartOverride = null) {
		return findMergedOwnerLineIndex(index, linesByStartOverride) >= 0;
	}
	function findNavigableLineIndex(fromIndex, direction) {
		const step = direction < 0 ? -1 : 1;
		for (let index = fromIndex + step; index >= 0 && index < lyricsLines.length; index += step) {
			if (!isLineCoveredByMergedPrevious(index)) return index;
		}
		return -1;
	}

	function getAutoMergeSplitPointsForLine(lineStart) {
		const startIndex = lineIndexByStart.get(lineStart) ?? -1;
		if (startIndex < 0) return [];
		const mergedIndexes = readMergedLineIndexes(startIndex, null);
		if (mergedIndexes.length <= 1) return [];

		const splitPoints = [];
		let offset = 0;
		for (let index = 0; index < mergedIndexes.length - 1; index++) {
			offset += lineChars[mergedIndexes[index]]?.length ?? 0;
			if (offset > 0) splitPoints.push(offset);
		}
		return splitPoints;
	}
	return {
		getSavedLineAtIndex: index => savedLinesByStart.get(lineCharOffsets[index]),
		getMergedLineIndexesForStart: (index, override) => {
			const indexes = readMergedLineIndexes(index, override);
			return override ? indexes : indexes.slice();
		},
		findMergedOwnerLineIndex,
		isLineCoveredByMergedPrevious,
		findNavigableLineIndex,
		getAutoMergeSplitPointsForLine,
	};
}
