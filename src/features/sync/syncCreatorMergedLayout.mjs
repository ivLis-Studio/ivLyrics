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

	function getIndexesFromMergedStarts(startIndex, mergedStarts) {
		const starts = normalizeMergedLineDraftStarts(mergedStarts);
		const indexes = [startIndex];
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

	function getMergedLineIndexesForStart(startIndex, linesByStartOverride = null) {
		if (startIndex < 0 || startIndex >= lyricsLines.length) return [];
		const lineStart = lineCharOffsets[startIndex];
		if (!Number.isInteger(lineStart)) return [startIndex];

		const draftIndexes = getIndexesFromMergedStarts(startIndex, mergedLineDrafts[lineStart]);
		const savedIndexes = getSavedMergedIndexes(startIndex, (linesByStartOverride || savedLinesByStart).get(lineStart));
		// An older draft may describe fewer rows than the saved timing covers.
		// The editor only shrinks a group once the saved timing has been split.
		return draftIndexes.length > savedIndexes.length ? draftIndexes : savedIndexes;
	}
	function findMergedOwnerLineIndex(index, linesByStartOverride = null) {
		if (index <= 0 || index >= lyricsLines.length) return -1;
		const minIndex = Math.max(0, index - SYNC_CREATOR_MAX_MERGED_LINES + 1);
		for (let ownerIndex = index - 1; ownerIndex >= minIndex; ownerIndex--) {
			const mergedIndexes = getMergedLineIndexesForStart(ownerIndex, linesByStartOverride);
			if (mergedIndexes.includes(index)) return ownerIndex;
		}
		return -1;
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
		const mergedIndexes = getMergedLineIndexesForStart(startIndex);
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
		getMergedLineIndexesForStart,
		findMergedOwnerLineIndex,
		isLineCoveredByMergedPrevious,
		findNavigableLineIndex,
		getAutoMergeSplitPointsForLine,
	};
}
