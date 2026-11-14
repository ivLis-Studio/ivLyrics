// Pronunciation slots: pronunciation generated per sung unit of the original.
//
// For songs with word or character timing the pronunciation is requested
// already split over the units of each original line (single characters for
// Japanese, Chinese and Korean text, whole words for space-separated text).
// The line pronunciation is those slots joined, and the pronunciation sung
// during each karaoke syllable is derived from them locally, so a timing
// change never needs a new request. The slots are stored with the line
// pronunciation in the same cache record ({ phonetic, slots }).
(function IvLyricsPronunciationSlots() {
	"use strict";

	if (window.ivLyricsPronunciationSlots?.initialized) return;

	// Bump when the unit split or the stored shape changes; older records are
	// then read as line-only pronunciation.
	const VERSION = 1;
	const MAX_REMEMBERED_TRACKS = 8;
	// The pronunciation-first display refreshes on this event.
	const UPDATED_EVENT = "ivLyrics:pronunciation-first-updated";
	const PSEUDO_KARAOKE_SOURCES = new Set(["audio-analysis-pseudo", "spotify-audio-analysis", "line-timing-pseudo"]);

	const SPACE = /\s/u;
	const SOUND = /[\p{L}\p{N}]/u;
	const SYLLABIC_SCRIPT = /[\p{scx=Han}\p{scx=Hiragana}\p{scx=Katakana}\p{scx=Hangul}\p{scx=Bopomofo}]/u;
	const WORD_JOINER = /^['\u2019]$/u;

	let segmenter = null;
	const splitGraphemes = (text) => {
		const source = String(text ?? "");
		if (!source) return [];
		try {
			segmenter ??= new Intl.Segmenter(undefined, { granularity: "grapheme" });
			return Array.from(segmenter.segment(source), (part) => part.segment);
		} catch {
			return Array.from(source);
		}
	};

	const classify = (grapheme) => {
		if (SPACE.test(grapheme)) return "space";
		if (SOUND.test(grapheme)) return SYLLABIC_SCRIPT.test(grapheme) ? "char" : "word";
		return "punct";
	};

	const normalizeLine = (text) => String(text ?? "").replace(/\r\n?/gu, "\n").trim().normalize("NFC");

	/**
	 * Sung units of one line, in order. Each unit is a substring of the line
	 * ({ text, start, end } in UTF-16 offsets); gapBefore marks whitespace
	 * between it and the previous unit. Single characters are units for
	 * Han, kana, Hangul and Bopomofo; other letters and digits form whole
	 * words. Punctuation joins the unit it touches.
	 */
	const splitUnits = (text) => {
		const source = String(text ?? "");
		const items = [];
		let offset = 0;
		for (const grapheme of splitGraphemes(source)) {
			items.push({ grapheme, start: offset, end: offset + grapheme.length, kind: classify(grapheme) });
			offset += grapheme.length;
		}
		const units = [];
		let gap = false;
		let pending = null;
		items.forEach((item, index) => {
			const last = units[units.length - 1];
			if (item.kind === "space") {
				gap = true;
				return;
			}
			if (item.kind === "punct") {
				const free = last && !gap && !pending;
				if (free && WORD_JOINER.test(item.grapheme) && last.kind === "word" && !last.closed && items[index + 1]?.kind === "word") {
					last.end = item.end;
					return;
				}
				if (free) {
					last.end = item.end;
					last.closed = true;
					return;
				}
				if (pending && !gap) {
					pending.end = item.end;
				} else if (!pending) {
					pending = { start: item.start, end: item.end, gapBefore: units.length > 0 && gap };
				} else {
					// Separate punctuation runs: the earlier one stands alone.
					units.push({ start: pending.start, end: pending.end, kind: "punct", gapBefore: pending.gapBefore });
					pending = { start: item.start, end: item.end, gapBefore: true };
				}
				gap = false;
				return;
			}
			if (item.kind === "word" && last?.kind === "word" && !last.closed && !gap && !pending) {
				last.end = item.end;
				return;
			}
			if (pending && gap) {
				// Punctuation standing between spaces is a unit of its own.
				units.push({ start: pending.start, end: pending.end, kind: "punct", gapBefore: pending.gapBefore });
				pending = null;
			}
			units.push({
				start: pending ? pending.start : item.start,
				end: item.end,
				kind: item.kind,
				gapBefore: pending ? pending.gapBefore : units.length > 0 && gap,
			});
			pending = null;
			gap = false;
		});
		if (pending) units.push({ start: pending.start, end: pending.end, kind: "punct", gapBefore: pending.gapBefore });
		return units.map(({ start, end, kind, gapBefore }) => ({ text: source.slice(start, end), start, end, kind, gapBefore }));
	};

	const hasSound = (text) => SOUND.test(String(text ?? ""));

	const cleanPart = (value) => String(value ?? "").replace(/\s+/gu, " ");

	/**
	 * The line pronunciation of the slots: the original's spaces return
	 * between units, and a slot ending with a space marks a word break.
	 */
	const join = (units, parts) => {
		let output = "";
		let needSpace = false;
		(Array.isArray(units) ? units : []).forEach((unit, index) => {
			if (unit?.gapBefore) needSpace = true;
			const raw = cleanPart(parts?.[index]);
			const core = raw.trim();
			if (raw.startsWith(" ")) needSpace = true;
			if (!core) return;
			if (needSpace && output) output += " ";
			output += core;
			needSpace = raw.endsWith(" ");
		});
		return output;
	};

	/**
	 * Pronunciation sung during each karaoke syllable of a line whose slots
	 * are known. A unit sung over several syllables is spread over them with
	 * the given proportional splitter. Null when the syllables do not split
	 * into the units the slots were made for.
	 */
	const deriveSyllableParts = (syllableTexts, parts, distribute) => {
		const texts = (Array.isArray(syllableTexts) ? syllableTexts : []).map((text) => String(text ?? ""));
		if (!texts.length || !Array.isArray(parts)) return null;
		const joined = texts.join("");
		const leading = joined.length - joined.trimStart().length;
		const units = splitUnits(joined.trim());
		if (!units.length || units.length !== parts.length) return null;
		const ranges = [];
		let offset = 0;
		for (const text of texts) {
			ranges.push({ start: offset, end: offset + text.length });
			offset += text.length;
		}
		const result = texts.map(() => "");
		let last = -1;
		let needSpace = false;
		units.forEach((unit, index) => {
			if (unit.gapBefore) needSpace = true;
			const raw = cleanPart(parts[index]);
			const core = raw.trim();
			if (raw.startsWith(" ")) needSpace = true;
			if (!core) return;
			if (needSpace && last >= 0 && !result[last].endsWith(" ")) result[last] += " ";
			needSpace = raw.endsWith(" ");
			const start = leading + unit.start;
			const end = leading + unit.end;
			const overlapping = [];
			ranges.forEach((range, syllableIndex) => {
				const from = Math.max(start, range.start);
				const to = Math.min(end, range.end);
				if (to > from) overlapping.push({ syllableIndex, text: joined.slice(from, to) });
			});
			if (!overlapping.length) return;
			if (overlapping.length === 1 || typeof distribute !== "function") {
				result[overlapping[0].syllableIndex] += core;
				last = Math.max(last, overlapping[0].syllableIndex);
				return;
			}
			const split = distribute(overlapping.map((item) => item.text), core);
			overlapping.forEach((item, splitIndex) => {
				const piece = String(split?.[splitIndex] ?? "");
				if (!piece) return;
				result[item.syllableIndex] += piece;
				last = Math.max(last, item.syllableIndex);
			});
		});
		return result.some((part) => part.trim()) ? result : null;
	};

	// ---------------------------------------------------------------------
	// Cache record
	// ---------------------------------------------------------------------

	const sourceLinesOf = (text) => String(text ?? "").replace(/\r\n?/gu, "\n").split("\n");

	/** Slots of a cache record, line by line: { units, parts } or null. */
	const readRecordLines = (text, record) => {
		const lines = sourceLinesOf(text);
		const slots = record?.slots;
		if (!slots || slots.v !== VERSION || !Array.isArray(slots.lines) || slots.lines.length !== lines.length) {
			return lines.map(() => null);
		}
		return lines.map((line, index) => {
			const parts = slots.lines[index];
			if (!Array.isArray(parts)) return null;
			const units = splitUnits(normalizeLine(line));
			if (!units.length || parts.length !== units.length) return null;
			return { units, parts: parts.map((part) => (typeof part === "string" ? part : String(part ?? ""))) };
		});
	};

	/** Stored form of per-line slots (line index → parts); null without any. */
	const buildRecordSlots = (lineCount, slotsByLine) => {
		const read = (index) => (typeof slotsByLine?.get === "function" ? slotsByLine.get(index) : slotsByLine?.[index]);
		const lines = Array.from({ length: Math.max(0, lineCount | 0) }, (_, index) => {
			const parts = read(index);
			return Array.isArray(parts) ? parts.map((part) => String(part ?? "")) : null;
		});
		return lines.some(Boolean) ? { v: VERSION, lines } : null;
	};

	// ---------------------------------------------------------------------
	// Slots known for recent tracks
	// ---------------------------------------------------------------------

	const tracks = new Map();
	let revision = 0;

	const partsKey = (parts) => parts.join("\u0000");

	/**
	 * Remembers the slots of a phonetic cache record made for the request
	 * text. Display code looks them up by line text.
	 */
	const remember = (trackId, text, record) => {
		if (!trackId || !record?.slots) return false;
		const recordLines = readRecordLines(text, record);
		const previous = tracks.get(trackId);
		const lines = new Map(previous?.lines || []);
		let changed = false;
		sourceLinesOf(text).forEach((line, index) => {
			const entry = recordLines[index];
			if (!entry) return;
			const key = normalizeLine(line);
			const known = lines.get(key);
			if (known && partsKey(known.parts) === partsKey(entry.parts)) return;
			lines.set(key, entry);
			changed = true;
		});
		if (!changed) return false;
		tracks.delete(trackId);
		tracks.set(trackId, { revision: ++revision, lines });
		while (tracks.size > MAX_REMEMBERED_TRACKS) tracks.delete(tracks.keys().next().value);
		try {
			window.dispatchEvent?.(new CustomEvent(UPDATED_EVENT, { detail: { trackId } }));
		} catch { /* display refresh is best effort */ }
		return true;
	};

	/** { revision, lines: Map<line text, { units, parts }> } of a track. */
	const getTrack = (trackId) => (trackId ? tracks.get(trackId) || null : null);

	const lookup = (trackId, lineText) => getTrack(trackId)?.lines.get(normalizeLine(lineText)) || null;

	const forget = (trackId) => {
		if (trackId) tracks.delete(trackId);
		else tracks.clear();
	};

	const hasSyllables = (value) => Array.isArray(value) && value.length > 0;

	/** Whether lyrics carry real word or character timing (not estimated). */
	const hasRealTiming = (lines, karaokeSource = null) => {
		if (PSEUDO_KARAOKE_SOURCES.has(karaokeSource)) return false;
		return Array.isArray(lines) && lines.some((line) => hasSyllables(line?.syllables) || hasSyllables(line?.vocals?.lead?.syllables));
	};

	/**
	 * Whether the pronunciation of these lyrics is requested by sung unit:
	 * synced pronunciation is on and the lyrics carry real unit timing.
	 * Otherwise the pronunciation is plain line text.
	 */
	const isRequested = (lines, karaokeSource = null) => window.ivLyricsPronunciationFirst?.isSyncedEnabled?.() === true
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
		const accept = (index, parts) => {
			if (!Number.isInteger(index) || !unitLines[index] || parts?.length !== unitLines[index].length) return;
			const joined = join(unitLines[index], parts);
			if (!joined.trim()) return;
			slotLines.set(index, parts.map((part) => String(part ?? "")));
			phonetic[index] = joined;
			try {
				params.onLine?.(index, joined);
			} catch { /* streaming display is best effort */ }
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
					onSlots: accept,
				});
				generated?.forEach?.((parts, index) => {
					if (!slotLines.has(index)) accept(index, parts);
				});
			} catch (error) {
				if (error?.name === "AbortError" && error?.superseded === true) throw error;
				console.warn("[ivLyrics] Pronunciation by unit failed; using line pronunciation:", error?.message || error);
			}
		}

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
				onStreamReset: null,
			});
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

	window.ivLyricsPronunciationSlots = Object.freeze({
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
	});
})();
