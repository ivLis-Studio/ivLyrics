import {
	getSyncCreatorCodeUnitOffsets, getSyncCreatorTextLayout, resolveSyncCreatorLyricsLanguage,
} from './syncCreatorLyricText.mjs';
import { buildLineSyllableSegments } from './syncCreatorRecordingTiming.mjs';

// Granularity ranges are sorted and disjoint, including when punctuation or
// spaces are attached to adjacent words by the segmenter.
function findRangeAtIndex(ranges, index) {
	let low = 0;
	let high = ranges.length - 1;
	while (low <= high) {
		const middle = Math.floor((low + high) / 2);
		const range = ranges[middle];
		if (index <= range.end) {
			if (index >= range.start) return range;
			high = middle - 1;
		} else {
			low = middle + 1;
		}
	}
	return null;
}

export function useSyncCreatorLineInput({
	react, currentLineChars, lyricsLines, trackName, artistName, utils, getLyricsService,
	syncGranularity, getSyncCreatorGranularityRanges,
}) {
	const { useMemo, useCallback } = react;
	const currentLineText = useMemo(() => currentLineChars.join(''), [currentLineChars]);
	const { direction: currentLineDirection, useTextRun: useCurrentLineTextRun } = useMemo(
		() => getSyncCreatorTextLayout(currentLineText), [currentLineText],
	);
	const currentLineCodeUnitOffsets = useMemo(() => getSyncCreatorCodeUnitOffsets(currentLineChars), [currentLineChars]);
	const currentLineSyllableSegments = useMemo(() => buildLineSyllableSegments(currentLineChars), [currentLineChars]);
	const lyricsLanguage = useMemo(() => resolveSyncCreatorLyricsLanguage({
		lyricsLines, trackName, artistName, utils, getLyricsService,
	}), [lyricsLines, trackName, artistName, utils, getLyricsService]);

	const currentGranularityRanges = useMemo(
		() => getSyncCreatorGranularityRanges(currentLineChars, syncGranularity, lyricsLanguage || undefined),
		[currentLineChars, syncGranularity, lyricsLanguage, getSyncCreatorGranularityRanges],
	);
	const currentWordBoundaryStartIndexes = useMemo(() => new Set(
		syncGranularity === 'word' ? currentGranularityRanges.slice(1).map(range => range.start) : [],
	), [currentGranularityRanges, syncGranularity]);
	const getGranularityRangeForIndex = useCallback(
		index => findRangeAtIndex(currentGranularityRanges, index), [currentGranularityRanges],
	);
	const getGranularityEndIndex = useCallback(
		index => getGranularityRangeForIndex(index)?.end ?? index, [getGranularityRangeForIndex],
	);

	return {
		currentLineText, currentLineDirection, useCurrentLineTextRun, currentLineCodeUnitOffsets, currentLineSyllableSegments,
		lyricsLanguage, currentGranularityRanges, currentWordBoundaryStartIndexes, getGranularityRangeForIndex, getGranularityEndIndex,
	};
}
