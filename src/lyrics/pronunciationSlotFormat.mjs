// Bump when the unit split or the stored shape changes. Older records
// then supply line-only pronunciation.
export const VERSION = 1;

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

export const normalizeLine = (text) => String(text ?? "").replace(/\r\n?/gu, "\n").trim().normalize("NFC");

/**
 * Sung units of one line, in order. Each unit is a substring of the line
 * ({ text, start, end } in UTF-16 offsets); gapBefore marks whitespace
 * between it and the previous unit. Single characters are units for
 * Han, kana, Hangul and Bopomofo; other letters and digits form whole
 * words. Punctuation joins the unit it touches.
 */
export const splitUnits = (text) => {
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

export const hasSound = (text) => SOUND.test(String(text ?? ""));

const cleanPart = (value) => String(value ?? "").replace(/\s+/gu, " ");

/**
 * The line pronunciation of the slots: the original's spaces return
 * between units, and a slot ending with a space marks a word break.
 */
export const join = (units, parts) => {
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
export const deriveSyllableParts = (syllableTexts, parts, distribute) => {
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

export const sourceLinesOf = (text) => String(text ?? "").replace(/\r\n?/gu, "\n").split("\n");

/** Slots of a cache record, line by line: { units, parts } or null. */
export const readRecordLines = (text, record) => {
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
export const buildRecordSlots = (lineCount, slotsByLine) => {
	const read = (index) => (typeof slotsByLine?.get === "function" ? slotsByLine.get(index) : slotsByLine?.[index]);
	const lines = Array.from({ length: Math.max(0, lineCount | 0) }, (_, index) => {
		const parts = read(index);
		return Array.isArray(parts) ? parts.map((part) => String(part ?? "")) : null;
	});
	return lines.some(Boolean) ? { v: VERSION, lines } : null;
};
