import { toFiniteTime } from "./lyricInterludeTiming.mjs";

const KARAOKE_RELEASE_WINDOW_MS = 820;
export const KARAOKE_COMPLETION_POSITION_OFFSET_MS = 900;

export const getLastTimedSyllableEndTime = (syllables, endTime) => {
	let lastEndTime = null;
	const lineEndTime = toFiniteTime(endTime);

	syllables.forEach((syllable) => {
		const syllableStart = toFiniteTime(syllable?.startTime);
		const syllableEnd = toFiniteTime(syllable?.endTime)
			?? (lineEndTime !== null && syllableStart !== null && lineEndTime >= syllableStart ? lineEndTime : null)
			?? syllableStart;

		if (syllableEnd !== null) {
			lastEndTime = lastEndTime === null ? syllableEnd : Math.max(lastEndTime, syllableEnd);
		}
	});

	return lastEndTime;
};

export const getSyncedLeadingEmptyLineCount = (compact) => compact ? 2 : 1;

export const prepareSyncedLineStartIndex = (lines, leadingEmptyLines = 0) => {
	const entries = Array.from({ length: leadingEmptyLines }, (_, sourceIndex) => ({ startTime: 0, sourceIndex }));
	lines.forEach((line, sourceIndex) => {
		const startTime = Number(line?.startTime || 0);
		// Padded views materialize explicit empty source rows as blank rows at zero.
		if ((line || leadingEmptyLines > 0) && !Number.isNaN(startTime)) {
			entries.push({ startTime, sourceIndex: sourceIndex + leadingEmptyLines });
		}
	});
	entries.sort((a, b) => a.startTime - b.startTime);
	let sourceIndex = 0;
	for (const entry of entries) {
		// Preserve the reverse scan's last source row even for overlapping,
		// simultaneous or out-of-order timestamps; do not reorder the lyrics.
		sourceIndex = Math.max(sourceIndex, entry.sourceIndex);
		entry.sourceIndex = sourceIndex;
	}
	return entries;
};

export const buildSyncedPlaybackBoundaries = (windows) => [...new Set(windows.flatMap(lineWindow => [
	lineWindow.startTime, lineWindow.contentEndTime, lineWindow.holdEndTime,
	lineWindow.contentEndTime + KARAOKE_RELEASE_WINDOW_MS,
]).filter(Number.isFinite))].sort((a, b) => a - b);

export const getSyncedPlaybackBoundaryIndex = (boundaries, position) => {
	let low = 0;
	let high = boundaries.length;
	while (low < high) {
		const middle = (low + high) >>> 1;
		if (boundaries[middle] <= position) low = middle + 1;
		else high = middle;
	}
	return low;
};

export const getActiveTimedLineIndex = (lines, position, lookup = null) => {
	if (lookup) {
		let low = 0;
		let high = lookup.length;
		while (low < high) {
			const middle = (low + high) >>> 1;
			if (lookup[middle].startTime <= position) low = middle + 1;
			else high = middle;
		}
		return low > 0 ? lookup[low - 1].sourceIndex : 0;
	}
	for (let i = lines.length - 1; i >= 0; i--) {
		const line = lines[i];
		if (line && position >= (line.startTime || 0)) {
			return i;
		}
	}

	return 0;
};

export function getPrecenteredTimedLineIndex(lyrics, position, activeLineIndex, advanceMs, lookup = null) {
	if (!Array.isArray(lyrics) || lyrics.length === 0 || advanceMs <= 0) {
		return activeLineIndex;
	}

	// Multiple starts can fall inside the lead window. Advance only one row.
	const advancedLineIndex = getActiveTimedLineIndex(lyrics, position + advanceMs, lookup);
	return Math.min(lyrics.length - 1, activeLineIndex + 1, Math.max(activeLineIndex, advancedLineIndex));
}

export const prepareSyncedLinePlaybackWindows = (lines, isKara, readBoundsEndTime, readLineFillEndTime) => {
	const safeLines = Array.isArray(lines) ? lines : [];
	return safeLines.map((line, index) => {
		const startTime = toFiniteTime(line?.startTime) ?? 0;
		const nextStartTime = toFiniteTime(safeLines[index + 1]?.startTime);
		const directEndTime = toFiniteTime(line?.endTime);
		let contentEndTime = directEndTime;

		if (isKara) {
			const boundsEndTime = toFiniteTime(readBoundsEndTime(line));
			const fillEndTime = readLineFillEndTime(line);
			const candidates = [contentEndTime, boundsEndTime, fillEndTime]
				.filter((value) => value !== null && value >= startTime);
			contentEndTime = candidates.length > 0 ? Math.max(...candidates) : null;
		}

		if (contentEndTime === null || contentEndTime <= startTime) {
			contentEndTime = nextStartTime !== null && nextStartTime > startTime
				? nextStartTime
				: startTime;
		}

		const holdEndTime = nextStartTime !== null
			? Math.max(contentEndTime, nextStartTime)
			: contentEndTime;

		return {
			startTime,
			contentEndTime,
			holdEndTime,
			completionPosition: contentEndTime + KARAOKE_COMPLETION_POSITION_OFFSET_MS,
		};
	});
};

export const getSyncedLinePlaybackState = (lineWindow, position, needsLiveReleasePosition) => {
	if (!lineWindow || !Number.isFinite(position) || position < lineWindow.startTime) {
		return {
			isHighlighted: false,
			isSinging: false,
			isAnimating: false,
			renderPosition: 0,
		};
	}

	const isSinging = position < lineWindow.contentEndTime;
	const isSettling = position < lineWindow.contentEndTime + KARAOKE_RELEASE_WINDOW_MS;
	return {
		isHighlighted: position < lineWindow.holdEndTime,
		isSinging,
		isAnimating: isSinging || isSettling,
		// Once filling has completed, only the optional bounce release consumes the
		// live clock. Pin ordinary completed rows immediately so rapid songs do not
		// keep re-rendering several outgoing lines for another 820 ms.
		renderPosition: isSinging || (isSettling && needsLiveReleasePosition)
			? position
			: lineWindow.completionPosition,
	};
};

export const preparePanelLinePlaybackTimeline = (lyrics, readLineFillEndTime) => {
	let prefixEndTime = -Infinity;
	return lyrics.map((line, index) => {
		const startTime = toFiniteTime(line?.startTime) ?? 0;
		const syllableEndTime = readLineFillEndTime(line);
		const endTime = Math.max(startTime, syllableEndTime
			?? toFiniteTime(line?.endTime)
			?? toFiniteTime(lyrics[index + 1]?.startTime)
			?? startTime);
		prefixEndTime = Math.max(prefixEndTime, endTime);
		return { startTime, endTime, prefixEndTime };
	});
};

export const getPanelSingingLineIndices = (timeline, position, latestIndex) => {
	const indices = [];
	// Prefix maxima let an earlier held vocal survive intervening short
	// lines without scanning already-completed history on each clock tick.
	for (let index = Math.min(latestIndex, timeline.length - 1);
		index >= 0 && timeline[index].prefixEndTime > position; index--) {
		const line = timeline[index];
		if (line.startTime <= position && position < line.endTime) indices.push(index);
	}
	return indices.reverse();
};
