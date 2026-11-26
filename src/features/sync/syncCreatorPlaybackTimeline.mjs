import { normalizeSyncCreatorStandaloneParentheticalLines } from "./syncCreatorLyricText.mjs";
import { collectSyncCreatorLineTimes } from "./syncCreatorOffsetTiming.mjs";

function buildLineIndex(lyricsLines) {
	const indexByStart = new Map();
	let offset = 0;
	for (const [index, line] of lyricsLines.entries()) {
		indexByStart.set(offset, index);
		offset += Array.from(line).length;
	}
	return indexByStart;
}

export function getSyncCreatorSourceLineStarts(lyricsLines, sourceLines) {
	const source = (Array.isArray(sourceLines) ? sourceLines : []).filter(line => (
		typeof line?.text === 'string' && line.text.trim()
	));
	const normalizedSource = normalizeSyncCreatorStandaloneParentheticalLines(source.map(line => line.text).join('\n'))
		.split('\n').map((text, index) => ({ text: text.trim(), startTime: source[index]?.startTime })).filter(line => line.text);
	// LRCLIB marks apply only to an exact lyric text and order match.
	if (normalizedSource.length !== lyricsLines.length
		|| normalizedSource.some((line, index) => line.text !== lyricsLines[index])) return [];
	return normalizedSource.map(({ startTime }) => Number.isFinite(startTime) && startTime >= 0 ? startTime : null);
}

function getRecordedLineStarts(syncData, lineIndexByStart) {
	const starts = new Map();
	for (const line of Array.isArray(syncData?.lines) ? syncData.lines : []) {
		const index = lineIndexByStart.get(line?.start);
		if (index === undefined) continue;
		const first = collectSyncCreatorLineTimes(line).reduce((minimum, time) => time < 0 ? minimum : Math.min(minimum, time), Infinity);
		if (Number.isFinite(first)) starts.set(index, first * 1000);
	}
	return starts;
}

export function buildSyncCreatorPlaybackTimeline(lyricsLines, syncData, sourceLines, lineIndexByStart, findMergedOwnerLineIndex) {
	const source = getSyncCreatorSourceLineStarts(lyricsLines, sourceLines);
	const recorded = getRecordedLineStarts(syncData, lineIndexByStart || buildLineIndex(lyricsLines));
	const owners = [];
	const starts = new Map();
	for (let index = 0; index < lyricsLines.length; index++) {
		const previous = findMergedOwnerLineIndex?.(index);
		const owner = previous >= 0 && previous < index ? owners[previous] : index;
		owners.push(owner);

		// A recorded head describes the merged line. Until then, a continuation
		// can still give its visible parent a playback position.
		const recordedHead = recorded.get(owner);
		const time = recordedHead ?? recorded.get(index) ?? source[index];
		if (time != null && time < (starts.get(owner) ?? Infinity)) starts.set(owner, time);
	}
	return [...starts].map(([lineIndex, startTime]) => ({ lineIndex, startTime }))
		.sort((left, right) => left.startTime - right.startTime || left.lineIndex - right.lineIndex);
}

export function getSyncCreatorPlaybackLineIndex(timeline, positionMs) {
	if (!timeline.length || !Number.isFinite(positionMs) || positionMs < 0) return -1;
	let low = 0;
	let high = timeline.length;
	while (low < high) {
		const middle = Math.floor((low + high) / 2);
		if (timeline[middle].startTime <= positionMs) low = middle + 1;
		else high = middle;
	}
	return low > 0 ? timeline[low - 1].lineIndex : 0;
}
