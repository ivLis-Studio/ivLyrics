// Pronunciation slots: pronunciation generated per sung unit of the original.
//
// For songs with word or character timing the pronunciation is requested
// already split over the units of each original line (single characters for
// Japanese, Chinese and Korean text, whole words for space-separated text).
// The line pronunciation is those slots joined, and the pronunciation sung
// during each karaoke syllable is derived from them locally, so a timing
// change never needs a new request. The slots are stored with the line
// pronunciation in the same cache record ({ phonetic, slots }).
import {
	readPronunciationSlots, readPronunciationFirst, publishPronunciationSlots, PRONUNCIATION_UPDATED_EVENT,
} from "./pronunciationRuntime.mjs";
import { isSupersededAbort, throwIfAiRequestAborted } from "../providers/ai/aiRequestCancellation.mjs";
import {
	VERSION, normalizeLine, splitUnits, hasSound, join, deriveSyllableParts,
	sourceLinesOf, readRecordLines, buildRecordSlots,
} from "./pronunciationSlotFormat.mjs";
import { isEstimatedPronunciationTiming } from "./pronunciationTimingSource.mjs";

export default function initializePronunciationSlots() {
	const host = window;
	if (readPronunciationSlots(host)?.initialized) return;

	const MAX_REMEMBERED_TRACKS = 8;

	// ---------------------------------------------------------------------
	// Slots known for recent tracks
	// ---------------------------------------------------------------------

	const tracks = new Map();
	let revision = 0;

	const partsKey = (parts) => parts.join("\u0000");
	const pronunciationKey = text => normalizeLine(text).replace(/\s+/gu, "");

	/**
	 * Remembers the slots of a phonetic cache record made for the request
	 * text. Display code looks them up by line text.
	 */
	const remember = (trackId, text, record) => {
		if (!trackId || !record?.slots) return false;
		const recordLines = readRecordLines(text, record);
		const previous = tracks.get(trackId);
		const lines = new Map(previous?.lines || []);
		const variants = new Map(previous?.variants || []);
		let changed = false;
		sourceLinesOf(text).forEach((line, index) => {
			const entry = recordLines[index];
			if (!entry) return;
			const key = normalizeLine(line);
			const reading = pronunciationKey(join(entry.units, entry.parts));
			const existing = variants.get(key);
			const known = existing?.get(reading);
			if (known && partsKey(known.parts) === partsKey(entry.parts)) return;
			const readings = new Map(existing);
			readings.set(reading, entry);
			variants.set(key, readings);
			lines.set(key, entry);
			changed = true;
		});
		if (!changed) return false;
		tracks.delete(trackId);
		tracks.set(trackId, { revision: ++revision, lines, variants });
		while (tracks.size > MAX_REMEMBERED_TRACKS) tracks.delete(tracks.keys().next().value);
		try {
			host.dispatchEvent?.(new CustomEvent(PRONUNCIATION_UPDATED_EVENT, { detail: { trackId } }));
		} catch { /* display refresh is best effort */ }
		return true;
	};

	/** { revision, lines: Map<line text, { units, parts }> } of a track. */
	const getTrack = (trackId) => (trackId ? tracks.get(trackId) || null : null);

	const lookup = (trackId, lineText, pronunciation = null) => {
		const track = getTrack(trackId);
		const source = normalizeLine(lineText);
		return (pronunciation === null ? track?.lines.get(source)
			: track?.variants.get(source)?.get(pronunciationKey(pronunciation))) || null;
	};

	const forget = (trackId) => {
		if (trackId) tracks.delete(trackId);
		else tracks.clear();
	};

	const hasSyllables = (value) => Array.isArray(value) && value.length > 0;

	/** Whether lyrics carry real word or character timing (not estimated). */
	const hasRealTiming = (lines, karaokeSource = null) => {
		if (isEstimatedPronunciationTiming(karaokeSource)) return false;
		return Array.isArray(lines) && lines.some(line => hasSyllables(line?.syllables) || hasSyllables(line?.vocals?.lead?.syllables));
	};

	/**
	 * Whether the pronunciation of these lyrics is requested by sung unit:
	 * synced pronunciation is on and the lyrics carry real unit timing.
	 * Otherwise the pronunciation is plain line text.
	 */
	const isRequested = (lines, karaokeSource = null) => readPronunciationFirst(host)?.isSyncedEnabled?.() === true
		&& hasRealTiming(lines, karaokeSource);

	// ---------------------------------------------------------------------
	// Request
	// ---------------------------------------------------------------------

	const toLines = (value) => (Array.isArray(value)
		? value.map((line) => String(line ?? ""))
		: (typeof value === "string" ? value.replace(/\r\n?/gu, "\n").split("\n") : null));

	/**
	 * Pronunciation of a karaoke song, requested split over the sung units
	 * of every line (AIAddonManager.generatePronunciationSlots). The line
	 * pronunciation is the joined slots; lines AI could not split exactly
	 * fall back to the line pronunciation request. Lines without sound keep
	 * their symbols, as the line request does.
	 * @param {object} manager AIAddonManager.
	 * @param {object} params translateLyrics parameters (text, lang, sourceLang, pronunciationNotation, onLine, ...).
	 * @returns {Promise<{phonetic: string[], slots?: object}>}
	 */
	const requestPronunciation = async (manager, params) => {
		const sourceLines = sourceLinesOf(params?.text);
		const unitLines = sourceLines.map((line) => splitUnits(normalizeLine(line)));
		const phonetic = sourceLines.map((line) => (hasSound(line) ? "" : line.trim()));
		const slotLines = new Map();
		const publishLine = (index, value) => {
			try {
				params.onLine?.(index, value);
			} catch { /* streaming display is best effort */ }
		};
		const accept = (index, parts) => {
			if (!Number.isInteger(index) || !unitLines[index] || parts?.length !== unitLines[index].length) return;
			const joined = join(unitLines[index], parts);
			if (!joined.trim()) return;
			slotLines.set(index, parts.map((part) => String(part ?? "")));
			phonetic[index] = joined;
			publishLine(index, joined);
		};
		const items = [];
		sourceLines.forEach((line, index) => {
			if (hasSound(line) && unitLines[index].length > 0) items.push({ i: index, u: unitLines[index].map((unit) => unit.text) });
		});
		if (items.length > 0 && typeof manager?.generatePronunciationSlots === "function") {
			try {
				const generated = await manager.generatePronunciationSlots({
					lines: items,
					lang: params.lang,
					sourceLang: params.sourceLang,
					pronunciationNotation: params.pronunciationNotation,
					...(params.signal ? { signal: params.signal } : {}),
					onSlots: accept,
				});
				generated?.forEach?.((parts, index) => {
					if (!slotLines.has(index)) accept(index, parts);
				});
			} catch (error) {
				if (isSupersededAbort(error)) throw error;
				console.warn("[ivLyrics] Pronunciation by unit failed; using line pronunciation:", error?.message || error);
			}
		}
		throwIfAiRequestAborted(params.signal);

		const missing = sourceLines
			.map((_, index) => index)
			.filter((index) => sourceLines[index].trim() && !phonetic[index].trim());
		if (missing.length > 0) {
			const fallback = await manager.translateLyrics({
				...params,
				text: missing.map((index) => sourceLines[index]).join("\n"),
				wantSmartPhonetic: true,
				onLine: typeof params.onLine === "function"
					? (lineIndex, lineText, detail) => {
						if (Number.isInteger(lineIndex) && missing[lineIndex] !== undefined) {
							params.onLine(missing[lineIndex], lineText, detail);
						}
					}
					: null,
				onStreamReset: typeof params.onStreamReset === "function"
					? (detail) => {
						params.onStreamReset(detail);
						for (const index of slotLines.keys()) publishLine(index, phonetic[index]);
					}
					: null,
			});
			throwIfAiRequestAborted(params.signal);
			const lines = toLines(fallback?.phonetic);
			if (!lines || lines.length !== missing.length) {
				throw new Error("Line pronunciation fallback returned an unexpected line count");
			}
			missing.forEach((lineIndex, position) => {
				phonetic[lineIndex] = lines[position];
			});
		}

		const slots = buildRecordSlots(sourceLines.length, slotLines);
		return slots ? { phonetic, slots } : { phonetic };
	};

	publishPronunciationSlots(host, Object.freeze({
		initialized: true,
		VERSION,
		splitUnits,
		hasSound,
		join,
		deriveSyllableParts,
		normalizeLine,
		readRecordLines,
		buildRecordSlots,
		remember,
		getTrack,
		lookup,
		forget,
		hasRealTiming,
		isRequested,
		requestPronunciation,
	}));
}
