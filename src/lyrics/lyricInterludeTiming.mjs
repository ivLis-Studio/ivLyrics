import { instrumentalMarkers } from "./InstrumentalBreaks.js";

export const INTERLUDE_MIN_DURATION_MS = 500;
const INTERLUDE_NOTE_CHARACTER_REGEX = /[\u2669-\u266F\u{1D100}-\u{1D1FF}\u{1F3B5}-\u{1F3BC}]/u;
const INTERLUDE_MARKER_REGEX = /^[\s\u00A0\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFE0E\uFE0F\uFEFF\u2669-\u266F\u{1D100}-\u{1D1FF}\u{1F3B5}-\u{1F3BC}]+$/u;
const KARAOKE_TRAILING_INTERLUDE_DELAY_MS = 2500;

const getInstrumentalBreakKind = (lineIndex, lineCount) => {
	if (lineIndex === 0) {
		return "prelude";
	}
	if (lineIndex === Math.max(0, lineCount - 1)) {
		return "postlude";
	}
	return "break";
};

const getPlainLyricText = (value) => {
	if (value === null || value === undefined) {
		return "";
	}

	if (typeof value === "string") {
		return value;
	}

	if (typeof value === "number" || typeof value === "boolean") {
		return String(value);
	}

	if (Array.isArray(value)) {
		return value.map(getPlainLyricText).join("");
	}

	if (typeof value === "object") {
		if (value.props?.children !== undefined) {
			return getPlainLyricText(value.props.children);
		}

		if (typeof value.originalText === "string") {
			return value.originalText;
		}

		if (typeof value.text === "string") {
			return value.text;
		}

		if (typeof value.word === "string") {
			return value.word;
		}

		if (Array.isArray(value.syllables)) {
			return value.syllables.map(getPlainLyricText).join("");
		}

		if (Array.isArray(value.vocals?.lead?.syllables)) {
			const lead = value.vocals.lead.syllables.map(getPlainLyricText).join("");
			const background = Array.isArray(value.vocals.background)
				? value.vocals.background
					.flatMap((entry) => Array.isArray(entry?.syllables) ? entry.syllables : [])
					.map(getPlainLyricText)
					.join("")
				: "";
			return lead || background;
		}
	}

	return "";
};

const getInterludeCandidateText = (line) => {
	if (!line) {
		return "";
	}

	if (line.originalText !== undefined) {
		const originalText = getPlainLyricText(line.originalText);
		if (originalText.trim()) {
			return originalText;
		}
	}

	if (line.text !== undefined) {
		return getPlainLyricText(line.text);
	}

	return getPlainLyricText(line);
};

const normalizeInterludeMarkerText = (text) => String(text ?? "")
	.replace(/&nbsp;/gi, " ")
	.replace(/<[^>]+>/g, "")
	.trim();

const isInterludeMarkerText = (text) => {
	if (instrumentalMarkers.isMarkerText(text)) {
		return true;
	}

	const normalized = normalizeInterludeMarkerText(text);

	return !normalized || INTERLUDE_MARKER_REGEX.test(normalized);
};

const isMusicNoteInterludeMarkerText = (text) => {
	if (instrumentalMarkers.isMarkerText(text)) {
		return true;
	}

	const normalized = normalizeInterludeMarkerText(text);

	return INTERLUDE_NOTE_CHARACTER_REGEX.test(normalized)
		&& INTERLUDE_MARKER_REGEX.test(normalized);
};

export const toFiniteTime = (value) => {
	const numeric = Number(value);
	return Number.isFinite(numeric) ? numeric : null;
};

export const isAutomaticInstrumentalBreakEnabled = (value) => {
	if (typeof value === "boolean") return value;
	return !["false", "0", "off", "no"].includes(String(value ?? true).trim().toLowerCase());
};

export const getLyricTrackDurationMs = (track) => toFiniteTime(track?.duration?.milliseconds ?? track?.metadata?.duration);

export function createLyricInterludeTiming({ readTrackDuration, readLineFillEndTime, readAutoBreakEnabled }) {
	const getInterludeInfo = (line, nextLine = null, lineIndex = -1, lineCount = 0) => {
		const startTime = toFiniteTime(line?.startTime);
		const markerText = getInterludeCandidateText(line);
		if (startTime === null || !isInterludeMarkerText(markerText)) {
			return { isInterlude: false, durationMs: 0 };
		}

		const directEndTime = toFiniteTime(line?.endTime);
		const nextStartTime = toFiniteTime(nextLine?.startTime);
		const trackEndTime = lineIndex === Math.max(0, lineCount - 1) ? readTrackDuration() : null;
		const endTime = nextStartTime !== null && nextStartTime > startTime
			? nextStartTime
			: (directEndTime !== null && directEndTime > startTime
				? directEndTime
				: (trackEndTime !== null && trackEndTime > startTime ? trackEndTime : null));
		const durationMs = endTime !== null ? endTime - startTime : 0;
		const minimumDurationMs = isMusicNoteInterludeMarkerText(markerText)
			? 0
			: INTERLUDE_MIN_DURATION_MS;

		return {
			isInterlude: durationMs > minimumDurationMs,
			durationMs,
			kind: getInstrumentalBreakKind(lineIndex, lineCount),
		};
	};

	const buildKaraokeCumulativeEndTimes = (lines) => {
		let latestEndTime = 0;
		return lines.map((line) => {
			latestEndTime = Math.max(latestEndTime, readLineFillEndTime(line) ?? 0);
			return latestEndTime;
		});
	};

	const getTrailingKaraokeInterludeInfo = (
		line, nextLine = null, lineIndex = -1, lineCount = 0,
		precedingFillEndTime = null, enabled = readAutoBreakEnabled(),
	) => {
		if (!enabled) {
			return { isInterlude: false, durationMs: 0, source: "karaoke-trailing-gap" };
		}

		const nextStartTime = toFiniteTime(nextLine?.startTime);
		if (
			nextStartTime !== null
			&& isInterludeMarkerText(getInterludeCandidateText(nextLine))
		) {
			return { isInterlude: false, durationMs: 0, source: "karaoke-trailing-gap" };
		}

		const ownFillEndTime = readLineFillEndTime(line);
		// A short response ending does not start an interlude while an earlier
		// independent vocal is still playing.
		const fillEndTime = ownFillEndTime === null ? null : Math.max(ownFillEndTime, precedingFillEndTime ?? 0);
		const startTime = fillEndTime !== null ? fillEndTime + KARAOKE_TRAILING_INTERLUDE_DELAY_MS : null;
		const trackEndTime = lineIndex === Math.max(0, lineCount - 1) ? readTrackDuration() : null;
		const endTime = nextStartTime ?? trackEndTime;
		const durationMs = startTime !== null && endTime !== null && endTime > startTime
			? endTime - startTime
			: 0;

		return {
			isInterlude: durationMs > INTERLUDE_MIN_DURATION_MS,
			durationMs,
			startTime,
			endTime,
			kind: lineIndex >= Math.max(0, lineCount - 1) ? "postlude" : "break",
			source: "karaoke-trailing-gap",
		};
	};

	const isTrailingKaraokeInterludePositionActive = (interludeInfo, position) => {
		if (position < interludeInfo.startTime) {
			return false;
		}

		// A postlude has no following lyric line to take over. Spotify can report a
		// position equal to or slightly beyond the track duration while handing off
		// to the next song, so keep an already-reached outro marker visible until the
		// new track resets the playback position.
		return interludeInfo.kind === "postlude" || position < interludeInfo.endTime;
	};

	const createActiveTrailingKaraokeInterludeLine = ({
		line,
		nextLine = null,
		lineIndex = -1,
		lineCount = 0,
		position = 0,
		isActiveLine = false,
		isKara = false,
		activationAdvanceMs = 0,
		precedingFillEndTime = null,
		preparedInterludeInfo = null,
	}) => {
		if (!isKara || !isActiveLine || line?.interludeInfo?.isInterlude) {
			return null;
		}

		const interludeInfo = preparedInterludeInfo
			|| getTrailingKaraokeInterludeInfo(line, nextLine, lineIndex, lineCount, precedingFillEndTime);
		const previewStartTime = interludeInfo.startTime !== null
			? interludeInfo.startTime - Math.max(0, activationAdvanceMs)
			: null;
		if (
			!interludeInfo.isInterlude ||
			interludeInfo.startTime === null ||
			interludeInfo.endTime === null ||
			previewStartTime === null ||
			position < previewStartTime ||
			(interludeInfo.kind !== "postlude" && position >= interludeInfo.endTime)
		) {
			return null;
		}

		return {
			startTime: interludeInfo.startTime,
			endTime: interludeInfo.endTime,
			text: "",
			originalText: "",
			text2: "",
			interludeInfo,
			isVirtualTrailingInterlude: true,
			isPrecentered: !isTrailingKaraokeInterludePositionActive(interludeInfo, position),
		};
	};

	return { getInterludeInfo, getTrailingKaraokeInterludeInfo, createActiveTrailingKaraokeInterludeLine,
		buildKaraokeCumulativeEndTimes, isTrailingKaraokeInterludePositionActive };
}
