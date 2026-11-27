import { getKaraokeLineBounds, getActiveKaraokeTimedCharIndex, applyKaraokeWhitespaceCompensation } from "./karaokeLineTiming.mjs";
import { getCopyableText } from "./lyricDisplayText.mjs";
import { toFiniteTime } from "./lyricInterludeTiming.mjs";
import { KARAOKE_COMPLETION_POSITION_OFFSET_MS } from "./lyricPlaybackTimeline.mjs";

const KARAOKE_VOCAL_QUICK_STEP_MAX_MS = 320;

const buildKaraokeVocalRowLine = (line, row) => ({
  ...line,
  text: row.text,
  originalText: row.text,
  syllables: row.syllables,
  vocals: undefined,
  speaker: row.speaker,
  'speaker-color': row.speakerColor,
  'speaker-fallback': row.speakerFallback,
  kind: row.kind,
});

const getKaraokeVocalRowRenderPosition = (rowData, position) => {
	if (!Number.isFinite(position)) return position;
	if (position < rowData.renderStartTime) return rowData.renderStartTime - 1;
	return Math.min(position, rowData.renderCompletionPosition);
};

const prepareKaraokeVocalAnchorWindows = (rows) => {
	if (!Array.isArray(rows)) return rows;
	const starts = [...new Set(rows.map(row => row.bounds?.startTime).filter(Number.isFinite))].sort((a, b) => a - b);
	const nextStarts = new Map(starts.map((start, index) => [start, starts[index + 1]]));
	return rows.map(row => {
		const nextStart = nextStarts.get(row.bounds?.startTime);
		if (!Number.isFinite(nextStart) || nextStart >= row.bounds.endTime
			|| nextStart - row.bounds.startTime > KARAOKE_VOCAL_QUICK_STEP_MAX_MS) return row;
		let textEnd = -Infinity;
		let punctuationEnd = -Infinity;
		for (const char of row.timedChars) {
			if (/^[\p{P}\s]+$/u.test(char.char)) punctuationEnd = Math.max(punctuationEnd, char.endTime);
			else textEnd = Math.max(textEnd, char.endTime);
		}
		// Some short calls store almost their entire duration on the trailing
		// comma. That tail must not keep an earlier voice in the scroll midpoint.
		// Hold until the next onset so a 1ms call cannot fall between player ticks;
		// keep simultaneous starts and real spoken overlap, and leave fill intact.
		return Number.isFinite(textEnd) && textEnd <= nextStart && punctuationEnd > nextStart
			? { ...row, anchorEndTime: nextStart }
			: row;
	});
};

const getKaraokeVocalAnchorLineKey = (line) => [
  line?.startTime ?? "",
  line?.endTime ?? "",
  getCopyableText(line?.originalText ?? line?.text ?? ""),
].join("|");

const getKaraokeVocalAnchorPosition = (vocalRowRenderData, position, activeCharIndexes = null) => {
	if (!Array.isArray(vocalRowRenderData) || vocalRowRenderData.length === 0 || !Number.isFinite(position)) {
		return -1;
	}

	let firstActiveRowIndex = -1;
	let lastActiveRowIndex = -1;

	for (let rowIndex = 0; rowIndex < vocalRowRenderData.length; rowIndex++) {
		const { timedChars: rowTimedChars, bounds, anchorEndTime } = vocalRowRenderData[rowIndex];
		const activeCharIndex = activeCharIndexes?.[rowIndex]
			?? getActiveKaraokeTimedCharIndex(rowTimedChars, position);
		const { startTime, endTime } = bounds;
		const rowActive = Number.isFinite(anchorEndTime)
			? position >= startTime && position < anchorEndTime
			: (activeCharIndex >= 0 && activeCharIndex < rowTimedChars.length)
				|| (position >= startTime && position <= endTime);

		if (rowActive) {
			if (firstActiveRowIndex < 0) {
				firstActiveRowIndex = rowIndex;
			}
			lastActiveRowIndex = rowIndex;
		}
	}

	if (firstActiveRowIndex >= 0 && lastActiveRowIndex >= 0) {
		return Math.ceil((firstActiveRowIndex + lastActiveRowIndex) / 2);
	}

	return -1;
};

const getKaraokeVocalAnchorWindowMs = (vocalRowRenderData, anchorPosition) => {
	if (
		!Array.isArray(vocalRowRenderData)
		|| vocalRowRenderData.length < 2
		|| !Number.isFinite(anchorPosition)
		|| anchorPosition < 0
	) {
		return null;
	}

	const anchorIndex = Math.max(
		0,
		Math.min(vocalRowRenderData.length - 1, Math.round(anchorPosition))
	);
	const anchorStartTime = toFiniteTime(vocalRowRenderData[anchorIndex]?.bounds?.startTime);
	if (anchorStartTime === null) {
		return null;
	}

	let nextWindow = null;
	for (let rowIndex = anchorIndex + 1; rowIndex < vocalRowRenderData.length; rowIndex++) {
		const nextStartTime = toFiniteTime(vocalRowRenderData[rowIndex]?.bounds?.startTime);
		if (nextStartTime !== null && nextStartTime > anchorStartTime) {
			nextWindow = nextStartTime - anchorStartTime;
			break;
		}
	}

	// The last call in a quick sequence still arrives on that sequence's beat,
	// even when it is followed by a long note or a pause.
	for (let rowIndex = anchorIndex - 1; rowIndex >= 0; rowIndex--) {
		const previous = vocalRowRenderData[rowIndex];
		const previousStart = toFiniteTime(previous?.bounds?.startTime);
		if (previousStart === null || previousStart >= anchorStartTime) continue;
		const precedingWindow = anchorStartTime - previousStart;
		if (previous.anchorEndTime === anchorStartTime && precedingWindow <= KARAOKE_VOCAL_QUICK_STEP_MAX_MS) {
			return nextWindow === null ? precedingWindow : Math.min(nextWindow, precedingWindow);
		}
		break;
	}
	return nextWindow;
};

const getStableVocalAnchorPosition = (stateRef, key, position, nextAnchorPosition) => {
	if (!stateRef?.current) {
		return nextAnchorPosition;
	}

	const state = stateRef.current;
	const positionWentBack = Number.isFinite(state.lastPlaybackPosition)
		&& Number.isFinite(position)
		&& position < state.lastPlaybackPosition - 250;

	if (state.key !== key || positionWentBack) {
		state.key = key;
		state.anchorPosition = nextAnchorPosition;
		state.lastPlaybackPosition = position;
		return nextAnchorPosition;
	}

	state.lastPlaybackPosition = position;
	if (!Number.isFinite(nextAnchorPosition) || nextAnchorPosition < 0) {
		return Number.isFinite(state.anchorPosition) ? state.anchorPosition : -1;
	}

	state.anchorPosition = Math.max(
		Number.isFinite(state.anchorPosition) ? state.anchorPosition : nextAnchorPosition,
		nextAnchorPosition
	);
	return state.anchorPosition;
};

export function createKaraokeVocalRowRenderDataBuilder(buildKaraokeTimedChars) {
	return function buildKaraokeVocalRowRenderData(line, row, includeBounds) {
		const rowLine = buildKaraokeVocalRowLine(line, row);
		const timedChars = applyKaraokeWhitespaceCompensation(buildKaraokeTimedChars(rowLine));
		const bounds = getKaraokeLineBounds(rowLine);
		const renderStartTime = timedChars.reduce((minimum, charInfo) => (
			Number.isFinite(charInfo?.startTime) ? Math.min(minimum, charInfo.startTime) : minimum
		), bounds.startTime);
		const renderEndTime = timedChars.reduce((maximum, charInfo) => (
			Number.isFinite(charInfo?.endTime) ? Math.max(maximum, charInfo.endTime) : maximum
		), bounds.endTime);
		return {
			line: rowLine,
			timedChars,
			bounds: includeBounds ? bounds : null,
			renderStartTime,
			// Includes compensated/missing-end glyph timings and the full motion
			// release. Parent effect classes continue to follow the live row state.
			renderCompletionPosition: renderEndTime + KARAOKE_COMPLETION_POSITION_OFFSET_MS,
		};
	};
}

export {
	getKaraokeVocalRowRenderPosition, prepareKaraokeVocalAnchorWindows, getKaraokeVocalAnchorLineKey,
	getKaraokeVocalAnchorPosition, getKaraokeVocalAnchorWindowMs, getStableVocalAnchorPosition,
};
