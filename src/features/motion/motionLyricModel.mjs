import { segmentGraphemes, segmentRanges } from "#ivlyrics/lyrics/LyricsWordSegmenter.js";

const PSEUDO_KARAOKE_SOURCES = new Set(["audio-analysis-pseudo", "spotify-audio-analysis", "line-timing-pseudo"]);

const SPACE_RE = /\s/u;
export const CJK_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
const KANA_RE = /^[\p{Script=Hiragana}\p{Script=Katakana}ー]+$/u;
const SYMBOL_RE = /^[^\p{L}\p{N}]+$/u;
const SOUND_RE = /[\p{L}\p{N}]/u;
// Short Japanese verb endings the segmenter leaves on their own (立ち尽くし|てた).
const ENDING_RE = /^(?:てた|てる|でた|でる|ます|ない|たい|った|って|んだ|てく|ても)$/u;

export const graphemesOf = (text) => {
	const source = String(text ?? "");
	if (!source) return [];
	return typeof Intl?.Segmenter === "function" ? segmentGraphemes(source) : Array.from(source);
};

const finiteTime = (value) => {
	const number = Number(value);
	return Number.isFinite(number) ? number : NaN;
};

/** Timed units (word or character syllables) with usable times. */
const timedUnits = (list) => {
	const syllables = [];
	for (const syllable of Array.isArray(list) ? list : []) {
		const text = String(syllable?.text ?? "");
		const start = finiteTime(syllable?.startTime ?? syllable?.karaokeFillStartTime);
		const end = finiteTime(syllable?.endTime ?? syllable?.karaokeFillEndTime);
		if (!text || !Number.isFinite(start)) continue;
		syllables.push({ text, start, end: Number.isFinite(end) && end >= start ? end : start });
	}
	return syllables;
};

const hasLeadVocal = (line) => Array.isArray(line?.vocals?.lead?.syllables) && line.vocals.lead.syllables.length > 0;

/** The lead voice's timed units. */
export const leadSyllablesOf = (line) => timedUnits(hasLeadVocal(line) ? line.vocals.lead.syllables : line?.syllables);

/** The lead voice's text, which carries its word spaces (a multi-voice line's own text mixes the voices). */
const leadTextOf = (line) => {
	if (hasLeadVocal(line)) return typeof line.vocals.lead.text === "string" ? line.vocals.lead.text : "";
	return typeof line?.originalText === "string" && line.originalText.trim() ? line.originalText : String(line?.text ?? "");
};

/** Whether the lyrics carry real (not estimated) word or character timing. */
export const hasRealTiming = (lines, karaoke, karaokeSource = null) => karaoke === true
	&& !PSEUDO_KARAOKE_SOURCES.has(karaokeSource)
	&& Array.isArray(lines)
	&& lines.some((line) => leadSyllablesOf(line).length > 0);

/** Word starts (offsets in the spaceless text) of a text that spells the syllables exactly. */
const exactBreaks = (lineText) => {
	const breaks = new Set();
	let index = 0;
	let pending = false;
	for (const codePoint of lineText) {
		if (SPACE_RE.test(codePoint)) {
			pending = index > 0;
			continue;
		}
		if (pending) breaks.add(index);
		pending = false;
		index += codePoint.length;
	}
	return breaks;
};

const foldLetter = (value) => value.normalize("NFKC").toLocaleLowerCase();
// How far ahead in the syllables a letter of the text may be found (letters only the syllables have).
const ALIGN_LOOKAHEAD = 3;

/**
 * Word starts from a text that spells the syllables with small differences:
 * each text letter is found in the syllables (a few letters ahead at most),
 * letters only the text has are passed over, and a space between two found
 * letters breaks the words. Empty when too little of the text matches.
 */
const alignedBreaks = (lineText, plain) => {
	const breaks = new Set();
	if (!lineText || !plain || !SPACE_RE.test(lineText)) return breaks;
	const letters = [];
	for (let offset = 0; offset < plain.length;) {
		const codePoint = String.fromCodePoint(plain.codePointAt(offset));
		letters.push({ offset, letter: foldLetter(codePoint) });
		offset += codePoint.length;
	}
	let next = 0;
	let pending = false;
	let matched = 0;
	for (const codePoint of lineText) {
		if (SPACE_RE.test(codePoint)) {
			pending = next > 0;
			continue;
		}
		const letter = foldLetter(codePoint);
		let found = -1;
		for (let ahead = next; ahead < Math.min(letters.length, next + ALIGN_LOOKAHEAD); ahead += 1) {
			if (letters[ahead].letter === letter) {
				found = ahead;
				break;
			}
		}
		// A letter the syllables do not have (a dash, a symbol) keeps a pending break.
		if (found < 0) continue;
		if (pending) breaks.add(letters[found].offset);
		pending = false;
		matched += found === next ? 1 : 0;
		next = found + 1;
	}
	return matched >= letters.length * 0.8 ? breaks : new Set();
};

/**
 * Characters of a line with the time each is sung. Word breaks come from
 * the voice's text when it spells the same letters (some sources leave the
 * spaces out of the syllables). When the text and the syllables differ a
 * little (a dash or punctuation only one of them has, another case), the
 * text is matched letter by letter and its spaces still break the words:
 * otherwise a whole line whose syllables carry no spaces ran together into
 * one long word. The syllables' own spaces always break too.
 */
const buildChars = (lineText, syllables) => {
	const plain = syllables.map((syllable) => syllable.text).join("").replace(/\s+/gu, "");
	const useLineSpaces = lineText.replace(/\s+/gu, "") === plain;
	const breaks = useLineSpaces ? exactBreaks(lineText) : alignedBreaks(lineText, plain);
	const chars = [];
	const pushSpace = () => {
		if (chars.length && !chars[chars.length - 1].space) chars.push({ ch: " ", space: true });
	};
	let plainIndex = 0;
	syllables.forEach((syllable, syllableIndex) => {
		const pieces = graphemesOf(syllable.text);
		const sounding = pieces.filter((piece) => !SPACE_RE.test(piece)).length;
		const slice = sounding ? (syllable.end - syllable.start) / sounding : 0;
		let position = 0;
		for (const piece of pieces) {
			if (SPACE_RE.test(piece)) {
				if (!useLineSpaces) pushSpace();
				continue;
			}
			if (breaks.has(plainIndex)) pushSpace();
			const start = syllable.start + slice * position;
			chars.push({ ch: piece, start, end: start + slice, syl: syllableIndex });
			position += 1;
			plainIndex += piece.length;
		}
	});
	return chars;
};

const textOf = (chars) => chars.map((char) => char.ch).join("");

/** Particles, symbols and verb endings join the word before them. */
const mergeWeak = (tokens) => {
	const merged = [];
	for (const token of tokens) {
		const tokenText = textOf(token);
		const previous = merged[merged.length - 1];
		const weak = SYMBOL_RE.test(tokenText) || (token.length === 1 && KANA_RE.test(tokenText)) || ENDING_RE.test(tokenText);
		if (previous && weak && previous.length < 8) previous.push(...token);
		else merged.push([...token]);
	}
	if (merged.length > 1 && SYMBOL_RE.test(textOf(merged[0]))) merged[1].unshift(...merged.shift());
	return merged;
};

/**
 * Word-timed sources mostly cut at word ends (立ち|尽くし|てた) where the
 * segmenter can miss by a letter (立ち尽く|してた), so each word break moves
 * onto a syllable break up to two letters away. Character-timed lines have
 * a syllable break everywhere and keep the segmenter's breaks.
 */
const snapToSyllables = (run, tokens) => {
	const breaks = [];
	for (let index = 1; index < run.length; index += 1) {
		if (run[index].syl !== run[index - 1].syl) breaks.push(index);
	}
	if (!breaks.length || breaks.length === run.length - 1 || tokens.length < 2) return tokens;
	const cuts = new Set();
	let index = 0;
	for (const token of tokens.slice(0, -1)) {
		index += token.length;
		let best = index;
		let distance = Infinity;
		for (const candidate of breaks) {
			const away = Math.abs(candidate - index);
			if (away > 2) continue;
			if (away < distance || (away === distance && candidate > best)) {
				best = candidate;
				distance = away;
			}
		}
		cuts.add(best);
	}
	const snapped = [];
	let from = 0;
	for (const cut of [...cuts].sort((left, right) => left - right)) {
		if (cut > from && cut < run.length) {
			snapped.push(run.slice(from, cut));
			from = cut;
		}
	}
	snapped.push(run.slice(from));
	return snapped;
};

/** Splits an unspaced Japanese or Chinese run into words, keeping particles with their word. */
const splitRun = (run) => {
	const text = textOf(run);
	if (run.length <= 3 || !CJK_RE.test(text)) return [run];
	let ranges = null;
	try {
		ranges = segmentRanges(text);
	} catch {
		ranges = null;
	}
	if (!Array.isArray(ranges) || ranges.length < 2) return [run];
	const offsets = [];
	let offset = 0;
	for (const char of run) {
		offsets.push(offset);
		offset += char.ch.length;
	}
	const tokens = [];
	let covered = 0;
	for (const range of ranges) {
		const token = run.filter((_char, index) => offsets[index] >= range.start && offsets[index] < range.end);
		covered += token.length;
		if (token.length) tokens.push(token);
	}
	if (covered !== run.length) return [run];
	return mergeWeak(snapToSyllables(run, mergeWeak(tokens)));
};

const wordOf = (chars) => ({
	text: textOf(chars),
	chars,
	start: Math.min(...chars.map((char) => char.start)),
	end: Math.max(...chars.map((char) => char.end)),
});

/** Words of one voice, each with its characters and their timing. */
const wordsOf = (text, syllables) => {
	if (!syllables.length) return [];
	const runs = [];
	let current = [];
	for (const char of buildChars(String(text ?? ""), syllables)) {
		if (char.space) {
			if (current.length) runs.push(current);
			current = [];
		} else {
			current.push(char);
		}
	}
	if (current.length) runs.push(current);
	const words = [];
	for (const run of runs) {
		// Words split from one unspaced run keep their letters close (joined).
		splitRun(run).forEach((part, partIndex) => {
			const previous = words[words.length - 1];
			if (previous && SYMBOL_RE.test(textOf(part))) {
				words[words.length - 1] = { ...wordOf([...previous.chars, ...part]), joined: previous.joined };
				return;
			}
			words.push({ ...wordOf(part), joined: partIndex > 0 });
		});
	}
	return words;
};

/** Words of a line's lead voice. */
export const buildWords = (line) => wordsOf(leadTextOf(line), leadSyllablesOf(line));

const MAX_BACKING_VOICES = 3;

/**
 * The other voices sung with a line, each with its own timing: background
 * vocals, or a duet partner (another lead part, or another singer).
 */
const backingOf = (line) => {
	const parts = Array.isArray(line?.vocals?.background) ? line.vocals.background : [];
	const leadSpeaker = String(line?.vocals?.lead?.speaker || "");
	const voices = [];
	for (const part of parts) {
		if (voices.length >= MAX_BACKING_VOICES) break;
		const units = timedUnits(part?.syllables);
		const words = wordsOf(String(part?.text ?? ""), units);
		if (!words.some((word) => SOUND_RE.test(word.text))) continue;
		const speaker = String(part?.speaker || "");
		const duet = part?.role === "lead" || (!!speaker && !!leadSpeaker && speaker !== leadSpeaker);
		voices.push({
			role: duet ? "duet" : "background",
			words,
			units,
			text: words.map((word) => word.text).join(" "),
			start: words[0].start,
			end: Math.max(...words.map((word) => word.end)),
		});
	}
	return voices;
};

/** Lines that can play, in time order. */
export const buildModel = (lyrics) => {
	const lines = [];
	(Array.isArray(lyrics) ? lyrics : []).forEach((line, index) => {
		let words = buildWords(line);
		let syllables = leadSyllablesOf(line);
		let backing = backingOf(line);
		if (!words.some((word) => SOUND_RE.test(word.text))) {
			// Only the other voices sing here: the first of them leads the line.
			if (!backing.length) return;
			words = backing[0].words;
			syllables = backing[0].units;
			backing = backing.slice(1);
		}
		const single = syllables.filter((syllable) => graphemesOf(syllable.text.trim()).length <= 1).length;
		const ends = [...words, ...backing.flatMap((voice) => voice.words)].map((word) => word.end);
		lines.push({
			index,
			words,
			backing,
			text: words.map((word) => word.text).join(" "),
			// The line spans every voice in it; its lead words decide when the camera may leave.
			start: Math.min(words[0].start, ...backing.map((voice) => voice.start)),
			end: Math.max(...ends),
			chars: words.reduce((count, word) => count + word.chars.length, 0),
			charTimed: syllables.length > 0 && single / syllables.length >= 0.7,
			translation: translationOf(line),
		});
	});
	return lines.sort((left, right) => left.start - right.start);
};

export const modelSignature = (lines) => lines.map((line) => Math.round(line.start) + ":" + line.text).join("\u0001");
/** The other voices too, so a change to them re-plans the song (the AI reads only the lead). */
export const voicesSignature = (lines) => lines.map((line) => (line.backing || []).map((voice) => Math.round(voice.start) + ":" + voice.text).join("|")).join("\u0001");

export const translationOf = (line) => {
	for (const value of [line?.text2, line?.translationText, line?.translation, line?.transText]) {
		if (typeof value === "string" && value.trim()) return value.trim();
	}
	return "";
};

const ranks = (values) => {
	if (values.length <= 1) return values.map(() => 0.5);
	const sorted = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
	const result = new Array(values.length);
	sorted.forEach((entry, rank) => {
		result[entry.index] = rank / (values.length - 1);
	});
	return result;
};

const loudnessBetween = (analysis, startMs, endMs) => {
	const segments = analysis?.segments;
	if (!Array.isArray(segments) || !segments.length) return 0;
	const start = startMs / 1000;
	const end = endMs / 1000;
	let low = 0;
	let high = segments.length;
	while (low < high) {
		const middle = (low + high) >>> 1;
		if (segments[middle].end <= start) low = middle + 1;
		else high = middle;
	}
	let total = 0;
	let count = 0;
	for (let index = low; index < segments.length && segments[index].start < end; index += 1) {
		total += Number(segments[index].amplitudeMax) || 0;
		count += 1;
	}
	return count ? total / count : 0;
};

export const lineEnergies = (lines, analysis) => {
	const density = ranks(lines.map((line) => line.words.length / Math.max(0.4, (line.end - line.start) / 1000)));
	if (!analysis?.segments?.length) return density;
	const loudness = ranks(lines.map((line) => loudnessBetween(analysis, line.start, Math.max(line.end, line.start + 300))));
	return lines.map((_, index) => 0.7 * loudness[index] + 0.3 * density[index]);
};

export const pulsesInMs = (analysis) => {
	const times = analysis?.pulses?.times;
	const strengths = analysis?.pulses?.strengths;
	if (!times?.length || !strengths?.length) return null;
	return { times: Float64Array.from(times, (seconds) => seconds * 1000), strengths: Float32Array.from(strengths) };
};
