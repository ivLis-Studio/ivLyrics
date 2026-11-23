// Motion lyrics: a kinetic-typography fullscreen presentation (PC).
//
// Songs with real word or character timing play as a motion-graphics edit.
// A director (MotionLyricsDirector.js, written by AI when a provider is
// available) groups the lines into shots and paces them to the song's tempo;
// each shot becomes a board, a composition of several lines in 3D space
// (thirty-seven kinds: flat ones like columns, stairs, strips and spokes,
// ones in depth like tunnels, drums the lines wrap around and a tilted
// crawl, ones after typography edits that show one thought at a time on
// bands and colour fields, bend type round a circle or stand it upright, set
// it on a wave, a star chart, a grid or in the corners, and ones from the
// motion-typography canon: sized lockups, one word at a time, chains of
// words, lines that fill the width, seals, words round the frame, upright
// margins, marquee rows, words hung in depth, type larger than the screen
// and rails), set in the faces of its script (MotionLyricsType.js). A lyric
// line takes at most two rows (MAX_LINE_ROWS) however it is set. A camera
// flies, rolls, orbits and dollies across the boards and turns to face the
// lines on drums. Lines come and go: a line's outline peeks in just before
// it is sung, each word lands as solid type with its effect as it is sung
// (emphasised words in one of nineteen accents), the line keeps moving while
// it is held (its hold) and leaves with its shot's exit once the next line
// is under way. Motifs, a giant background word, colour panels and letterbox
// bars animate with each board, and the video background turns and zooms
// with the camera (never left turned) and keeps moving on its own. Other
// voices (background vocals, a duet partner) sing in smaller rows of their
// own line, on their own timing; while one is still sung into the next
// line the camera keeps both in frame. In interludes the board fades soon after
// its last word and the camera keeps turning over the video until the
// lyrics return.
// Everything is planned once per song and read by playback position, so
// seeking, pausing and sync offsets need no extra handling.
(function IvLyricsMotionLyrics(root) {
	"use strict";

	if (root.ivLyricsMotionLyrics?.initialized) return;

	const PSEUDO_KARAOKE_SOURCES = new Set(["audio-analysis-pseudo", "spotify-audio-analysis", "line-timing-pseudo"]);
	const PERSPECTIVE_PX = 1100;
	// The camera settles on a line this long before its first word.
	const ARRIVE_LEAD_MS = 110;
	const INTRO_MS = 2200;
	// Pauses this long let the camera pull back and show the whole board.
	const LONG_GAP_MS = 3600;
	// A board shows (faintly) this long before the camera leaves for it, and
	// stays this long after the camera has left before it fades.
	const BOARD_PREVIEW_MS = 1800;
	const BOARD_LINGER_MS = 650;
	const BOARD_FADE_MS = 900;
	// Lines come and go instead of standing as a lyric sheet: a line's outline
	// peeks in shortly before it is sung, a sung line stays as a dim echo only
	// while the next one gets going, then leaves with its shot's exit (at most
	// the current line and the one before it are on screen). Compositions whose
	// structure is the point (a drum, a wall of words, a star chart) keep the
	// lines round the current one in view instead (PREVIEW_LAYOUTS).
	const PEEK_MS = 700;
	const PEEK_GHOST = 0.3;
	const SINGING_GHOST = 0.3;
	const ECHO_SOLID = 0.42;
	const ECHO_DIM_MS = 280;
	const EXIT_MS = 560;
	const PREVIEW_LAYOUTS = new Set(["reel", "carousel", "wordwall", "tunnel", "crawl", "constellation", "grid"]);
	// A shot's exit (how a sung line leaves) and hold (how a line keeps moving once its words have landed).
	const EXIT_NAMES = new Set([
		"fade", "rise", "fall", "scatter", "shrink", "sweep", "blur", "wipe", "flip", "stretch", "glitch", "drip",
		"sink", "shut", "zoom", "twist", "dash", "hinge",
		"crumble", "dissolve", "erase", "burst", "evaporate", "tumble", "scramble",
	]);
	// Exits that take a word apart letter by letter (exitCharFrame), and the whole-word exit
	// that words whose letters join (Arabic, Devanagari...) leave with instead.
	const LETTER_EXITS = Object.freeze({ crumble: "fall", dissolve: "blur", erase: "wipe", burst: "scatter", evaporate: "rise", tumble: "flip", scramble: "glitch" });
	// How long an exit takes against EXIT_MS: letters going one by one take a little longer, a zoom or a dash less.
	const EXIT_LENGTH = Object.freeze({ crumble: 1.35, dissolve: 1.3, erase: 1.05, burst: 1.15, evaporate: 1.4, tumble: 1.3, scramble: 1.25, hinge: 1.3, zoom: 0.85, dash: 0.8 });
	const HOLD_NAMES = new Set(["still", "grow", "drift", "float", "lean", "breathe", "push", "wobble", "swivel"]);
	// After a voice sung into the next line ends, the camera takes this long to settle on the new line.
	const SHARE_RETURN_MS = 520;
	// The background turns with the camera, flips and barrel rolls included, so
	// the video is seen to turn over with the edit. It is only not left turned:
	// on its side (portrait on a wide screen, small and blurry once scaled to
	// cover it) it turns back to landscape after SIDEWAYS_HOLD_MS, upside down
	// it rights itself UPSIDE_HOLD_MS after the camera has landed, and in
	// interludes it comes back upright under the camera's swing. On its own it
	// keeps turning, drifting and breathing a little (BG_SWAY), so it never
	// stands still.
	const SIDEWAYS_HOLD_MS = 5000;
	const UPSIDE_HOLD_MS = 700;
	const UPRIGHT_TURN_MS = 1400;
	const UPSIDE_TURN_MS = 1100;
	const BG_SWAY = Object.freeze({ slow: 3.4, mid: 4.2, fast: 4.8, rap: 4.4 });
	const TUNNEL_STEP = 1500;
	const PUSH_DEPTH = 2300;
	const PULL_DEPTH = 1900;
	// A dissolve eases the camera this far forward into the next board.
	const FADE_DEPTH = 420;
	// Interludes: when the next line is this far off, the board fades soon
	// after its last word and the camera keeps moving over the video (turning
	// and pushing in) until the lyrics come back. Rests shorter than
	// REST_MIN_MS once faded are not worth a fade.
	const REST_GAP_MS = 5000;
	const REST_AFTER_MS = 1100;
	const REST_FADE_MS = 1000;
	const REST_RETURN_MS = 700;
	const REST_MIN_MS = 1200;
	// After the last line the board fades this long after its last word; the camera drifts this long.
	const OUTRO_REST_MS = 2600;
	const OUTRO_DRIFT_MS = 16000;

	const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
	const clamp01 = (value) => clamp(value, 0, 1);
	const lerp = (from, to, amount) => from + (to - from) * amount;
	const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
	const easeOutQuint = (t) => 1 - Math.pow(1 - t, 5);
	const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
	const easeInOutQuart = (t) => (t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2);
	const easeInOutQuint = (t) => (t < 0.5 ? 16 * Math.pow(t, 5) : 1 - Math.pow(-2 * t + 2, 5) / 2);
	const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
	const easeOutExpo = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
	const easeInOutExpo = (t) => {
		if (t <= 0) return 0;
		if (t >= 1) return 1;
		return t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2;
	};
	const easeOutBack = (t) => {
		const c1 = 1.70158;
		const c3 = c1 + 1;
		return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
	};
	const easeOutBounce = (t) => {
		const n1 = 7.5625;
		const d1 = 2.75;
		if (t < 1 / d1) return n1 * t * t;
		if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
		if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
		return n1 * (t -= 2.625 / d1) * t + 0.984375;
	};

	const hashString = (text) => {
		let hash = 2166136261;
		const source = String(text ?? "");
		for (let index = 0; index < source.length; index += 1) {
			hash ^= source.charCodeAt(index);
			hash = Math.imul(hash, 16777619);
		}
		return hash >>> 0;
	};

	/** mulberry32: a small seeded generator, so a song always gets the same edit. */
	const createRandom = (seed) => {
		let state = (seed >>> 0) || 1;
		return () => {
			state = (state + 0x6D2B79F5) >>> 0;
			let value = state;
			value = Math.imul(value ^ (value >>> 15), value | 1);
			value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
			return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
		};
	};
	const between = (random, low, high) => low + (high - low) * random();
	const round = (value, digits = 1) => {
		const factor = 10 ** digits;
		return Math.round(value * factor) / factor;
	};
	const rotate2d = (x, y, degrees) => {
		const radians = (degrees * Math.PI) / 180;
		const cos = Math.cos(radians);
		const sin = Math.sin(radians);
		return { x: x * cos - y * sin, y: x * sin + y * cos };
	};

	// ---------------------------------------------------------------------
	// Words and their timing
	// ---------------------------------------------------------------------

	const SPACE_RE = /\s/u;
	const CJK_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
	const KANA_RE = /^[\p{Script=Hiragana}\p{Script=Katakana}ー]+$/u;
	const SYMBOL_RE = /^[^\p{L}\p{N}]+$/u;
	const SOUND_RE = /[\p{L}\p{N}]/u;
	// Short Japanese verb endings the segmenter leaves on their own (立ち尽くし|てた).
	const ENDING_RE = /^(?:てた|てる|でた|でる|ます|ない|たい|った|って|んだ|てく|ても)$/u;

	const graphemesOf = (text) => {
		const source = String(text ?? "");
		if (!source) return [];
		const segment = root.LyricsWordSegmenter?.segmentGraphemes;
		if (typeof segment === "function") return segment(source);
		if (typeof Intl?.Segmenter === "function") {
			return Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(source), (item) => item.segment);
		}
		return Array.from(source);
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
	const leadSyllablesOf = (line) => timedUnits(hasLeadVocal(line) ? line.vocals.lead.syllables : line?.syllables);

	/** The lead voice's text, which carries its word spaces (a multi-voice line's own text mixes the voices). */
	const leadTextOf = (line) => {
		if (hasLeadVocal(line)) return typeof line.vocals.lead.text === "string" ? line.vocals.lead.text : "";
		return typeof line?.originalText === "string" && line.originalText.trim() ? line.originalText : String(line?.text ?? "");
	};

	/** Whether the lyrics carry real (not estimated) word or character timing. */
	const hasRealTiming = (lines, karaoke, karaokeSource = null) => karaoke === true
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
			ranges = root.LyricsWordSegmenter?.segmentRanges?.(text);
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
			const token = run.filter((char, index) => offsets[index] >= range.start && offsets[index] < range.end);
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
	const buildWords = (line) => wordsOf(leadTextOf(line), leadSyllablesOf(line));

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
	const buildModel = (lyrics) => {
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

	const modelSignature = (lines) => lines.map((line) => Math.round(line.start) + ":" + line.text).join("\u0001");
	/** The other voices too, so a change to them re-plans the song (the AI reads only the lead). */
	const voicesSignature = (lines) => lines.map((line) => (line.backing || []).map((voice) => Math.round(voice.start) + ":" + voice.text).join("|")).join("\u0001");

	// ---------------------------------------------------------------------
	// Energy from the audio analysis (or the singing density without it)
	// ---------------------------------------------------------------------

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

	const lineEnergies = (lines, analysis) => {
		const density = ranks(lines.map((line) => line.words.length / Math.max(0.4, (line.end - line.start) / 1000)));
		if (!analysis?.segments?.length) return density;
		const loudness = ranks(lines.map((line) => loudnessBetween(analysis, line.start, Math.max(line.end, line.start + 300))));
		return lines.map((_, index) => 0.7 * loudness[index] + 0.3 * density[index]);
	};

	const pulsesInMs = (analysis) => {
		const times = analysis?.pulses?.times;
		const strengths = analysis?.pulses?.strengths;
		if (!times?.length || !strengths?.length) return null;
		return { times: Float64Array.from(times, (seconds) => seconds * 1000), strengths: Float32Array.from(strengths) };
	};

	// ---------------------------------------------------------------------
	// Colour
	// ---------------------------------------------------------------------

	const parseColor = (value) => {
		const text = String(value ?? "").trim();
		let match = text.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
		if (match) {
			const hex = match[1].length === 3 ? match[1].split("").map((digit) => digit + digit).join("") : match[1];
			return [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
		}
		match = text.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
		return match ? [match[1], match[2], match[3]].map((part) => clamp(Math.round(Number(part)), 0, 255)) : null;
	};
	const rgbToHsl = ([red, green, blue]) => {
		const r = red / 255;
		const g = green / 255;
		const b = blue / 255;
		const max = Math.max(r, g, b);
		const min = Math.min(r, g, b);
		const light = (max + min) / 2;
		if (max === min) return [0, 0, light];
		const delta = max - min;
		const saturation = light > 0.5 ? delta / (2 - max - min) : delta / (max + min);
		let hue;
		if (max === r) hue = (g - b) / delta + (g < b ? 6 : 0);
		else if (max === g) hue = (b - r) / delta + 2;
		else hue = (r - g) / delta + 4;
		return [hue / 6, saturation, light];
	};
	const hslToHex = ([hue, saturation, light]) => {
		const channel = (n) => {
			const k = (n + hue * 12) % 12;
			const a = saturation * Math.min(light, 1 - light);
			return Math.round(255 * (light - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
		};
		return "#" + [channel(0), channel(8), channel(4)].map((value) => value.toString(16).padStart(2, "0")).join("");
	};
	/**
	 * Two accent colours that stay vivid and readable over video. The cover's
	 * colour leads: the AI palette (which favoured pinks and reds whatever the
	 * cover) only leads when the cover has no colour to give (missing, or grey),
	 * and otherwise may only add a second colour clearly apart from it.
	 */
	const paletteFrom = (accent, aiPalette) => {
		const readable = (rgb) => {
			const [hue, saturation, light] = rgbToHsl(rgb);
			return hslToHex([hue, Math.max(saturation, 0.62), clamp(light, 0.58, 0.72)]);
		};
		const colourful = (rgb) => !!rgb && rgbToHsl(rgb)[1] >= 0.08;
		const fromAi = (Array.isArray(aiPalette) ? aiPalette : []).map(parseColor).filter(colourful).map(readable);
		const cover = parseColor(accent);
		// A grey cover with no AI colour gets a cool, quiet blue rather than a loud pink.
		const first = colourful(cover) ? readable(cover) : fromAi[0] || hslToHex([0.6, 0.62, 0.68]);
		const [hue, saturation] = rgbToHsl(parseColor(first));
		const apart = (colour) => {
			const distance = Math.abs(rgbToHsl(parseColor(colour))[0] - hue);
			return Math.min(distance, 1 - distance) >= 0.12;
		};
		const second = fromAi.find((colour) => colour !== first && apart(colour));
		return [first, second || hslToHex([(hue + 0.42) % 1, Math.max(0.62, saturation), 0.66])];
	};

	/** A palette colour deepened into a ground (colour fields) that white type reads on. */
	const deepOf = (color) => {
		const [hue, saturation] = rgbToHsl(parseColor(color) || [255, 92, 160]);
		return hslToHex([hue, Math.max(0.74, saturation), 0.44]);
	};

	// ---------------------------------------------------------------------
	// Type: faces per script (MotionLyricsType.js) and the fonts a song needs
	// ---------------------------------------------------------------------

	const typeLib = () => root.ivLyricsMotionType;
	const shapesLib = () => root.ivLyricsMotionShapes;
	const UI_FONT = '"Pretendard Variable", Pretendard, "Apple SD Gothic Neo", "Hiragino Sans", sans-serif';
	const FALLBACK_SPEC = Object.freeze({ key: "fallback", script: "latin", kind: "impact", family: UI_FONT, load: null, weight: 800, style: "normal", spacing: 0, lineHeight: 1.08, scale: 1, canvasFont: "normal 800 100px sans-serif" });
	const fallbackMeasure = (text, size) => graphemesOf(text).reduce((sum, piece) => sum + (CJK_RE.test(piece) || /\p{Script=Hangul}/u.test(piece) ? 1 : 0.56), 0) * size;
	const DEFAULT_INFO = Object.freeze({ script: "latin", rtl: false, joined: false, lang: "", words: [] });
	// Word-level stand-ins for letter effects in scripts whose letters join.
	const JOINED_FX = Object.freeze({ type: "wipe", assemble: "blur", drop: "rise", wave: "rise", track: "wipe", bounce: "pop", flicker: "wipe", cascade: "lift", ripple: "rise", swirl: "blur", rain: "rise", decode: "blur" });

	const createFontBook = () => {
		const specs = new Map();
		return (script, personality = "impact", role = "display") => {
			const key = script + "|" + personality + "|" + role;
			if (!specs.has(key)) specs.set(key, typeLib()?.fontSpec?.(script, personality, role) || FALLBACK_SPEC);
			return specs.get(key);
		};
	};
	const casedText = (text, script, upper) => typeLib()?.casedText?.(text, script, upper) ?? String(text);
	/** The face of a word: a shot's emphasised words may switch to handwriting (the script accent) or the serif. */
	const faceOf = (type, serif, isEmph, accent) => (isEmph && accent === "script" ? "hand" : isEmph && serif ? "serif" : type);
	// How much larger than its line an emphasised word is set, for accents that work by size.
	const ACCENT_SCALE = Object.freeze({ giant: 1.7, script: 1.14 });

	/**
	 * The faces a direction will set, each with the characters it sets, so
	 * they can load before the song is composed.
	 */
	const fontNeeds = (model, direction, typography, extra = []) => {
		const needs = new Map();
		const font = createFontBook();
		const add = (spec, text) => {
			if (!spec?.load) return;
			const entry = needs.get(spec.key) || { spec, sample: "" };
			if (entry.sample.length < 400) entry.sample += text;
			needs.set(spec.key, entry);
		};
		for (const shot of direction?.shots || []) {
			const type = shot.type || "impact";
			const cased = (text, script) => text + (shot.upper ? casedText(text, script, true) : "");
			for (let index = shot.from; index <= shot.to; index += 1) {
				const line = model[index];
				const info = typography?.[index] || DEFAULT_INFO;
				if (!line) continue;
				const emph = new Set(direction?.lines?.[index]?.emph || []);
				line.words.forEach((word, wordIndex) => {
					const script = info.words[wordIndex] || info.script;
					const text = cased(word.text, script);
					add(font(script, faceOf(type, shot.serif, emph.has(wordIndex), shot.accent), "display"), text);
					add(font(script, type, "light"), text);
				});
				(line.backing || []).forEach((voice, voiceIndex) => voice.words.forEach((word, position) => {
					const script = info.backing?.[voiceIndex]?.[position] || info.script;
					add(font(script, type, voice.role === "duet" ? "display" : "light"), cased(word.text, script));
				}));
			}
			if (shot.echo) add(font(typeLib()?.scriptOf?.(shot.echo) || "latin", type, "display"), shot.echo);
		}
		// Other texts the edit sets (the title cards and marquees of the interludes) in the song's main script's faces.
		const main = typography?.find?.(Boolean)?.script || "latin";
		for (const text of extra) {
			const value = String(text ?? "").trim();
			if (!value) continue;
			const script = typeLib()?.scriptOf?.(value, "", main) || main;
			add(font(script, "impact", "display"), value + casedText(value, script, true));
			add(font(script, "impact", "light"), value + casedText(value, script, true));
		}
		return needs;
	};

	// ---------------------------------------------------------------------
	// Composition: a line's words, then a board of lines (board-local px)
	// ---------------------------------------------------------------------

	const EMPTY_SET = new Set();
	// How far past an emphasised word (in its own em) the mark of these accents
	// reaches sideways (style.css: the brackets' rules, the stamp's frame, the
	// pen loop, the marker): the words beside it are set clear of the mark.
	const ACCENT_REACH = Object.freeze({ bracket: 0.26, stamp: 0.24, circle: 0.31, mark: 0.1, underline: 0.06 });
	// However a lyric line is set (rows, a tower, upright columns), it never
	// takes more than this many rows: a long line is set smaller instead.
	const MAX_LINE_ROWS = 2;

	/** A line's words with the face, cased text and natural width each is set in. */
	const itemsOf = (line, ctx, options) => {
		const { size, emph = EMPTY_SET, emphScale = 1.3, light = false, type = "impact", serif = false, upper = false, accent = "" } = options;
		const info = ctx.typography[line.n] || DEFAULT_INFO;
		const items = line.words.map((word, index) => {
			const isEmph = emph.has(index);
			const script = info.words[index] || info.script;
			const role = light && !isEmph ? "light" : "display";
			const spec = ctx.font(script, faceOf(type, serif, isEmph, accent), role);
			const text = casedText(word.text, script, upper && spec.kind === "impact");
			const wordSize = size * spec.scale * (isEmph ? emphScale * (ACCENT_SCALE[accent] || 1) : 1) * (role === "light" ? 0.94 : 1);
			return {
				index,
				spec,
				text,
				role,
				emph: isEmph,
				letters: !typeLib()?.JOINED?.has(script),
				size: wordSize,
				width: ctx.measure(text, wordSize, spec),
				// Words the segmenter split from one unspaced run stay close.
				gap: index ? size * (word.joined ? 0.05 + spec.spacing : 0.27 + spec.spacing) : 0,
			};
		});
		const reach = ACCENT_REACH[accent] || 0;
		if (reach) {
			items.forEach((item, index) => {
				const previous = items[index - 1];
				if (!previous || (!previous.emph && !item.emph)) return;
				const clear = (previous.emph ? previous.size * reach : 0) + (item.emph ? item.size * reach : 0) + size * 0.08;
				item.gap = Math.max(item.gap, clear);
			});
		}
		return items;
	};

	const splitRows = (items, count, total) => {
		const target = total / count;
		const rows = [];
		let row = [];
		let width = 0;
		items.forEach((item, index) => {
			const remainingRows = count - rows.length - 1;
			const remainingItems = items.length - index;
			if (row.length && width + item.gap + item.width / 2 > target && remainingRows > 0 && remainingItems >= remainingRows) {
				rows.push(row);
				row = [];
				width = 0;
			}
			width += row.length ? item.gap + item.width : item.width;
			row.push(item);
		});
		if (row.length) rows.push(row);
		return rows;
	};
	const rowWidth = (row) => row.reduce((sum, item, position) => sum + item.width + (position ? item.gap : 0), 0);

	/** Items in up to `most` rows no wider than maxLength, and the scale that makes them fit. */
	const fitRows = (items, maxLength, most) => {
		const total = rowWidth(items);
		let rows = [items];
		if (total > maxLength && items.length > 1) {
			for (let count = 2; count <= Math.min(most, items.length); count += 1) {
				rows = splitRows(items, count, total);
				if (Math.max(...rows.map(rowWidth)) <= maxLength) break;
			}
		}
		const widest = Math.max(...rows.map(rowWidth));
		return { rows, scale: widest > maxLength ? maxLength / widest : 1 };
	};

	// Other voices are set smaller than the lead: background vocals much smaller, a duet partner a little.
	const VOICE_SCALE = Object.freeze({ background: 0.56, duet: 0.8 });

	/**
	 * Rows for the other voices of a line: background vocals in the companion
	 * face, a duet partner in the shot's face, under the lead (above it when
	 * they start first). scale is the lead's row scale; maxLength is final px.
	 */
	const voiceRows = (line, ctx, options, scale, maxLength) => {
		const above = [];
		const below = [];
		const info = ctx.typography[line.n] || DEFAULT_INFO;
		let index = line.words.length;
		(line.backing || []).forEach((voice, voiceIndex) => {
			const duet = voice.role === "duet";
			const role = duet ? "display" : "light";
			const size = options.size * (VOICE_SCALE[voice.role] || VOICE_SCALE.background);
			const items = voice.words.map((word, position) => {
				const script = info.backing?.[voiceIndex]?.[position] || info.script;
				const spec = ctx.font(script, options.type || "impact", role);
				const text = casedText(word.text, script, options.upper && spec.kind === "impact");
				const itemSize = size * spec.scale;
				return {
					index: index++,
					spec,
					text,
					role,
					emph: false,
					voice: voiceIndex + 1,
					letters: !typeLib()?.JOINED?.has(script),
					size: itemSize,
					width: ctx.measure(text, itemSize, spec),
					gap: position ? size * (word.joined ? 0.05 + spec.spacing : 0.27 + spec.spacing) : 0,
				};
			});
			const fit = fitRows(items, maxLength / scale, MAX_LINE_ROWS);
			const target = voice.start < line.words[0].start - 250 ? above : below;
			for (const row of fit.rows) target.push({ row, scale: scale * fit.scale });
		});
		return { above, below };
	};

	const withVoices = (rows, scales, voices) => ({
		rows: [...voices.above.map((entry) => entry.row), ...rows, ...voices.below.map((entry) => entry.row)],
		scales: [...voices.above.map((entry) => entry.scale), ...scales, ...voices.below.map((entry) => entry.scale)],
	});

	/**
	 * Rows of items stacked into a block centred on the origin. Each row has
	 * its own scale; right-to-left lines read from the right.
	 */
	const stackRows = (rows, scales, align, rtl, rowGapSize) => {
		const metrics = rows.map((row, index) => {
			const scale = scales[index];
			const tallest = Math.max(...row.map((item) => item.size)) * scale;
			const lineHeight = Math.max(...row.map((item) => item.spec.lineHeight));
			return { row, scale, width: rowWidth(row) * scale, height: tallest * lineHeight, tallest };
		});
		const rowGap = rowGapSize * 0.05;
		const width = Math.max(...metrics.map((metric) => metric.width));
		const height = metrics.reduce((sum, metric) => sum + metric.height, 0) + rowGap * (metrics.length - 1);
		const words = [];
		let top = -height / 2;
		for (const metric of metrics) {
			let x = align === "left" ? -width / 2 : align === "right" ? width / 2 - metric.width : -metric.width / 2;
			metric.row.forEach((item, position) => {
				if (position) x += item.gap * metric.scale;
				const itemWidth = item.width * metric.scale;
				const itemSize = item.size * metric.scale;
				const center = x + itemWidth / 2;
				words[item.index] = {
					x: rtl ? -center : center,
					y: top + metric.height / 2 + (metric.tallest - itemSize) * 0.3,
					size: itemSize,
					width: itemWidth,
					role: item.role,
					emph: item.emph,
					voice: item.voice || 0,
					spec: item.spec,
					text: item.text,
					letters: item.letters,
				};
				x += itemWidth;
			});
			top += metric.height + rowGap;
		}
		return { words, width, height, rows: metrics.length };
	};

	/**
	 * A line's words in up to two rows, centred on the line's origin, with
	 * its other voices in smaller rows. leadWidth is the lead's own width.
	 */
	const layoutBlock = (line, ctx, options) => {
		const { size, maxLength, align = "center" } = options;
		const rtl = (ctx.typography[line.n] || DEFAULT_INFO).rtl;
		const lead = fitRows(itemsOf(line, ctx, options), maxLength, MAX_LINE_ROWS);
		const { rows, scales } = withVoices(lead.rows, lead.rows.map(() => lead.scale), voiceRows(line, ctx, options, lead.scale, maxLength));
		const block = stackRows(rows, scales, align, rtl, size * lead.scale);
		return { ...block, size: size * lead.scale, rtl, leadWidth: Math.max(...lead.rows.map(rowWidth)) * lead.scale };
	};

	/** A line set as a justified tower: two rows (one when it is a single word), every row the same width. */
	const towerBlock = (line, ctx, width, options) => {
		const rtl = (ctx.typography[line.n] || DEFAULT_INFO).rtl;
		const sized = { ...options, size: 100 };
		const items = itemsOf(line, ctx, sized);
		const count = Math.min(MAX_LINE_ROWS, items.length);
		const rows = count <= 1 ? [items] : splitRows(items, count, rowWidth(items));
		const scaleOf = (row) => clamp(width / Math.max(1, rowWidth(row)), (ctx.F * 0.5) / 100, (ctx.F * 2.4) / 100);
		// The other voices sit under the tower, sized from its smallest row.
		const build = (scales) => {
			const all = withVoices(rows, scales, voiceRows(line, ctx, sized, Math.min(...scales), width));
			return stackRows(all.rows, all.scales, options.align || "center", rtl, ctx.F);
		};
		let scales = rows.map(scaleOf);
		let block = build(scales);
		if (block.height > ctx.H * 0.78) {
			const shrink = (ctx.H * 0.78) / block.height;
			scales = scales.map((scale) => scale * shrink);
			block = build(scales);
		}
		return { ...block, size: 100 * Math.max(...scales), rtl };
	};

	const rotatedExtent = (block, rot) => {
		const radians = (rot * Math.PI) / 180;
		const cos = Math.abs(Math.cos(radians));
		const sin = Math.abs(Math.sin(radians));
		return { w: block.width * cos + block.height * sin, h: block.width * sin + block.height * cos };
	};
	const extentOf = (boxes) => {
		const left = Math.min(...boxes.map((box) => box.x - box.w / 2));
		const right = Math.max(...boxes.map((box) => box.x + box.w / 2));
		const top = Math.min(...boxes.map((box) => box.y - box.h / 2));
		const bottom = Math.max(...boxes.map((box) => box.y + box.h / 2));
		return { cx: (left + right) / 2, cy: (top + bottom) / 2, w: right - left, h: bottom - top };
	};
	const boxesOf = (places) => places.map((place) => ({ ...rotatedExtent(place.block, place.rot), x: place.x, y: place.y }));
	const centerPlaces = (places) => {
		const extent = extentOf(boxesOf(places));
		places.forEach((place) => {
			place.x -= extent.cx;
			place.y -= extent.cy;
		});
	};
	const cornersOf = (place) => {
		const halfWidth = place.block.width / 2;
		const halfHeight = place.block.height / 2;
		return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => {
			const point = rotate2d(sx * halfWidth, sy * halfHeight, place.rot);
			return { x: place.x + point.x, y: place.y + point.y };
		});
	};
	/** The companion face sets off the emphasised words, so a line uses it only when it has some. */
	const lightFor = (look, line) => look.light && look.emph(line).size > 0;
	const blockOptions = (look, line, extra) => ({ emph: look.emph(line), type: look.type, serif: look.serif, upper: look.upper, accent: look.accent, light: lightFor(look, line), ...extra });
	/** Short lines are set larger. */
	const boostOf = (line) => (line.chars <= 4 ? 1.36 : line.chars <= 8 ? 1.16 : 1);
	/** The camera follows a line part of the way from the board's centre, keeping all of it in frame. */
	const frameX = (place, ctx, follow) => {
		const slack = ctx.W * 0.46 - place.block.width / 2;
		const x = place.x * follow;
		return slack > 0 ? clamp(x, place.x - slack, place.x + slack) : place.x;
	};

	const layoutColumn = (lines, ctx, random, look) => {
		const align = ["left", "left", "center", "right", "stagger"][Math.floor(random() * 5)];
		const blocks = lines.map((line, index) => layoutBlock(line, ctx, blockOptions(look, line, {
			size: ctx.F * 0.84 * boostOf(line),
			maxLength: ctx.W * 0.78,
			align: align === "stagger" ? (index % 2 ? "right" : "left") : align,
		})));
		const columnWidth = Math.max(...blocks.map((block) => block.width));
		const places = [];
		let y = 0;
		blocks.forEach((block, index) => {
			if (index) y += Math.max(blocks[index - 1].size, block.size) * 0.3;
			let x = 0;
			if (align === "left") x = -columnWidth / 2 + block.width / 2;
			else if (align === "right") x = columnWidth / 2 - block.width / 2;
			else if (align === "stagger") x = (index % 2 ? 1 : -1) * (columnWidth - block.width) * 0.42;
			places.push({ x, y: y + block.height / 2, z: 0, rot: 0, block });
			y += block.height;
		});
		places.forEach((place) => { place.y -= y / 2; });
		const frames = places.map((place) => ({ x: frameX(place, ctx, 0.55), y: place.y, z: 0, roll: 0 }));
		return { places, frames, drift: { z: 80, roll: 1.4 } };
	};

	// Lines alternate across and down (or up) a staircase; the camera turns 90° for each.
	// A line set in pieces turns as one: its words stay together on their line.
	const layoutZigzag = (lines, ctx, random, look) => {
		const turn = random() < 0.5 ? 90 : -90;
		const gap = ctx.F * 0.24;
		const units = runUnits(lines, ctx, (line, lineCtx, unit) => layoutBlock(line, lineCtx, blockOptions(look, line, {
			size: ctx.F * 0.8 * boostOf(line),
			maxLength: ctx.W * 0.72,
			light: lightFor(look, line) && unit % 2 === 1,
		})));
		const boxes = [];
		units.forEach((unit, index) => {
			const vertical = index % 2 === 1;
			const rot = vertical ? turn : 0;
			if (!index) {
				boxes.push({ x: 0, y: 0, rot, w: unit.width, h: unit.height });
				return;
			}
			const previous = boxes[index - 1];
			const width = vertical ? unit.height : unit.width;
			const height = vertical ? unit.width : unit.height;
			const x = previous.x + previous.w / 2 + gap + width / 2;
			let y;
			if (vertical) y = turn > 0 ? previous.y - previous.h / 2 + height / 2 : previous.y + previous.h / 2 - height / 2;
			else y = turn > 0 ? previous.y + previous.h / 2 - height / 2 : previous.y - previous.h / 2 + height / 2;
			boxes.push({ x, y, rot, w: width, h: height });
		});
		return { ...placeUnits(units, boxes, lines.length), drift: { z: 70, roll: 1.2 } };
	};

	// Up to four lines around a square: the screen turns a quarter for each.
	const layoutSpiral = (lines, ctx, random, look) => {
		const direction = random() < 0.5 ? 1 : -1;
		const blocks = lines.map((line) => layoutBlock(line, ctx, blockOptions(look, line, {
			size: ctx.F * 0.72 * boostOf(line),
			maxLength: ctx.W * 0.58,
		})));
		const longest = Math.max(...blocks.map((block) => block.width));
		const thickest = Math.max(...blocks.map((block) => block.height));
		const radius = longest / 2 + thickest * 1.12;
		const places = blocks.map((block, index) => {
			const rot = direction * 90 * index;
			const inset = radius - block.height / 2;
			const angle = ((rot - 90) * Math.PI) / 180;
			return { x: Math.cos(angle) * inset, y: Math.sin(angle) * inset, z: 0, rot, block };
		});
		const frames = places.map((place) => ({ x: place.x * 0.6, y: place.y * 0.6, z: radius * 0.32, roll: place.rot }));
		return { places, frames, drift: { z: 90, roll: 2.2 * direction } };
	};

	// A justified poster: every line set to the same width, short lines huge.
	const layoutWall = (lines, ctx, random, look) => {
		const width = ctx.W * 0.72;
		const align = random() < 0.6 ? "left" : "center";
		const alternate = random() < 0.5;
		const places = [];
		let y = 0;
		lines.forEach((line, index) => {
			const options = blockOptions(look, line, { emphScale: 1.12, light: alternate && index % 2 === 1, align });
			const natural = layoutBlock(line, ctx, { ...options, size: 100, maxLength: Infinity }).leadWidth / 100;
			const size = clamp(width / Math.max(1, natural), ctx.F * 0.42, ctx.F * 2.3);
			// The natural width already fits; the slack keeps rounding from wrapping it.
			const block = layoutBlock(line, ctx, { ...options, size, maxLength: width * 1.02 });
			if (index) y += Math.min(block.size, places[index - 1].block.size) * 0.07;
			const x = align === "left" ? -width / 2 + block.width / 2 : 0;
			places.push({ x, y: y + block.height / 2, z: 0, rot: 0, block });
			y += block.height;
		});
		places.forEach((place) => { place.y -= y / 2; });
		const frames = places.map((place) => ({
			x: 0,
			y: place.y,
			z: place.block.size > ctx.F * 1.5 ? Math.min(420, (place.block.size - ctx.F * 1.5) * 2.4) : 0,
			roll: 0,
		}));
		return { places, frames, drift: { z: 60, roll: 0.8 } };
	};

	// Lines one behind another; the camera flies forward through them.
	const layoutTunnel = (lines, ctx, random, look) => {
		let side = random() < 0.5 ? 1 : -1;
		const places = lines.map((line, index) => {
			side = -side;
			return {
				x: index ? side * between(random, 0.08, 0.2) * ctx.W : 0,
				y: index ? between(random, -0.12, 0.12) * ctx.H : 0,
				z: -index * TUNNEL_STEP,
				rot: index ? between(random, -7, 7) : 0,
				block: layoutBlock(line, ctx, blockOptions(look, line, { size: ctx.F * 0.9 * boostOf(line), maxLength: ctx.W * 0.76 })),
			};
		});
		const frames = places.map((place) => ({ x: place.x, y: place.y, z: place.z, roll: place.rot }));
		return { places, frames, drift: { z: 150, roll: 1 } };
	};

	// Lines scattered with tilts and sizes, still in reading order.
	const layoutCollage = (lines, ctx, random, look) => {
		const placed = [];
		const places = [];
		lines.forEach((line, index) => {
			const vertical = index > 0 && line.chars <= 8 && random() < 0.24;
			const block = layoutBlock(line, ctx, blockOptions(look, line, {
				size: ctx.F * between(random, 0.62, 1.02) * boostOf(line),
				maxLength: ctx.W * 0.6,
				light: lightFor(look, line) && random() < 0.6,
			}));
			const rot = vertical ? (random() < 0.5 ? 90 : -90) : between(random, -11, 11);
			const box = rotatedExtent(block, rot);
			const previous = placed[placed.length - 1] || null;
			let chosen = null;
			let fallback = null;
			for (let attempt = 0; attempt < 24 && !chosen; attempt += 1) {
				let x = 0;
				let y = 0;
				if (previous) {
					if (random() < 0.5) {
						x = previous.x + previous.w / 2 + box.w / 2 + between(random, 0.02, 0.09) * ctx.W;
						y = previous.y + between(random, -0.3, 0.3) * previous.h;
					} else {
						x = previous.x + between(random, -0.5, 0.2) * (previous.w + box.w);
						y = previous.y + previous.h / 2 + box.h / 2 + between(random, 0.02, 0.07) * ctx.H;
					}
				}
				const candidate = { x, y, w: box.w, h: box.h };
				fallback = fallback || candidate;
				const overlaps = placed.some((other) => Math.abs(other.x - x) < (other.w + box.w) / 2 + ctx.F * 0.14
					&& Math.abs(other.y - y) < (other.h + box.h) / 2 + ctx.F * 0.08);
				if (!overlaps) chosen = candidate;
			}
			if (!chosen && previous) chosen = { x: previous.x, y: previous.y + previous.h / 2 + box.h / 2 + ctx.F * 0.2, w: box.w, h: box.h };
			chosen = chosen || fallback;
			placed.push(chosen);
			places.push({ x: chosen.x, y: chosen.y, z: between(random, -120, 40), rot, block });
		});
		centerPlaces(places);
		const frames = places.map((place) => ({ x: place.x, y: place.y, z: place.z, roll: place.rot }));
		return { places, frames, drift: { z: 70, roll: 1.6 } };
	};

	// One line filling the screen, an optional second one small beneath it.
	const layoutHero = (lines, ctx, random, look) => {
		const [first, second] = lines;
		const options = blockOptions(look, first, { emphScale: 1.25, light: false });
		const natural = layoutBlock(first, ctx, { ...options, size: 100, maxLength: Infinity }).leadWidth / 100;
		const size = clamp((ctx.W * 0.84) / Math.max(1, natural), ctx.F * 0.9, ctx.F * 2.5);
		let block = layoutBlock(first, ctx, { ...options, size, maxLength: ctx.W * 0.86 });
		if (block.height > ctx.H * 0.56) block = layoutBlock(first, ctx, { ...options, size: (size * ctx.H * 0.56) / block.height, maxLength: ctx.W * 0.86 });
		const places = [{ x: 0, y: 0, z: 0, rot: 0, block }];
		if (second) {
			const small = layoutBlock(second, ctx, blockOptions(look, second, {
				size: Math.max(ctx.F * 0.5, block.size * 0.42),
				maxLength: ctx.W * 0.8,
				light: true,
			}));
			places.push({ x: 0, y: block.height / 2 + ctx.F * 0.28 + small.height / 2, z: 0, rot: 0, block: small });
			centerPlaces(places);
		}
		const frames = places.map((place) => ({ x: 0, y: place.y * 0.5, z: 0, roll: 0 }));
		return { places, frames, drift: { z: 170, roll: 1.2 } };
	};

	// Each line a justified tower of its words, the lines stacked like a poster.
	const layoutTower = (lines, ctx, random, look) => {
		const width = ctx.W * between(random, 0.4, 0.54);
		const align = random() < 0.5 ? "left" : "center";
		const places = [];
		let y = 0;
		lines.forEach((line, index) => {
			const block = towerBlock(line, ctx, width, blockOptions(look, line, { emphScale: 1.1, align }));
			if (index) y += ctx.F * 0.24;
			places.push({ x: 0, y: y + block.height / 2, z: 0, rot: 0, block });
			y += block.height;
		});
		places.forEach((place) => { place.y -= y / 2; });
		const frames = places.map((place) => ({ x: 0, y: place.y, z: Math.max(0, (place.block.height - ctx.H * 0.6) * 0.9), roll: 0 }));
		return { places, frames, drift: { z: 110, roll: 1 } };
	};

	// Lines step down a diagonal staircase; the camera glides along it.
	const layoutStairs = (lines, ctx, random, look) => {
		const side = random() < 0.5 ? 1 : -1;
		const blocks = lines.map((line) => layoutBlock(line, ctx, blockOptions(look, line, {
			size: ctx.F * 0.84 * boostOf(line),
			maxLength: ctx.W * 0.56,
			align: side > 0 ? "left" : "right",
		})));
		const places = [];
		let edge = 0;
		let y = 0;
		blocks.forEach((block, index) => {
			if (index) {
				const previous = blocks[index - 1];
				edge += side * clamp(previous.width * 0.42, ctx.W * 0.1, ctx.W * 0.24);
				y += Math.max(previous.size, block.size) * 0.34;
			}
			places.push({ x: edge + (side * block.width) / 2, y: y + block.height / 2, z: 0, rot: 0, block });
			y += block.height;
		});
		centerPlaces(places);
		const frames = places.map((place) => ({ x: place.x, y: place.y, z: 0, roll: 0 }));
		return { places, frames, drift: { z: 90, roll: 1.2 } };
	};

	// Lines side by side on one long strip with a track drawn under them; the camera travels along it.
	const layoutStrip = (lines, ctx, random, look) => {
		const side = (ctx.typography[lines[0].n] || DEFAULT_INFO).rtl ? -1 : 1;
		const lift = (random() < 0.5 ? 1 : -1) * ctx.H * 0.06;
		const gap = ctx.W * 0.09;
		const places = [];
		let x = 0;
		lines.forEach((line, index) => {
			const block = layoutBlock(line, ctx, blockOptions(look, line, { size: ctx.F * 0.92 * boostOf(line), maxLength: ctx.W * 0.6 }));
			if (index) x += side * (places[index - 1].block.width / 2 + gap + block.width / 2);
			places.push({ x, y: index % 2 ? lift : -lift * 0.4, z: 0, rot: 0, block });
		});
		centerPlaces(places);
		const frames = places.map((place) => ({ x: place.x, y: place.y * 0.5, z: 0, roll: 0 }));
		const start = places[0].x - (side * places[0].block.width) / 2 - side * ctx.F * 0.4;
		const last = places[places.length - 1];
		const length = Math.abs(last.x + (side * last.block.width) / 2 + side * ctx.F * 0.4 - start);
		const track = {
			x: start,
			y: Math.max(...places.map((place) => place.y + place.block.height / 2)) + ctx.F * 0.26,
			z: 0,
			length,
			rot: side > 0 ? 0 : 180,
			stops: places.map((place) => clamp01((Math.abs(place.x - start) + place.block.width / 2 + ctx.F * 0.2) / length)),
		};
		return { places, frames, drift: { z: 100, roll: 0.8 }, strokes: [track] };
	};

	// Two columns facing each other across a centre line; the lines alternate sides (duets, call and response).
	const layoutSplit = (lines, ctx, random, look) => {
		const gutter = ctx.F * 0.42;
		const first = random() < 0.5 ? -1 : 1;
		const bottom = { [-1]: -Infinity, 1: -Infinity };
		const places = [];
		lines.forEach((line, index) => {
			const side = index % 2 ? -first : first;
			const block = layoutBlock(line, ctx, blockOptions(look, line, {
				size: ctx.F * 0.8 * boostOf(line),
				maxLength: ctx.W * 0.4,
				align: side < 0 ? "right" : "left",
			}));
			const previous = places[index - 1];
			// A line starts beside the lower part of the one across from it, below the last one on its own side.
			const top = previous
				? Math.max(bottom[side] + ctx.F * 0.3, previous.y + previous.block.height * 0.12)
				: 0;
			places.push({ x: side * (gutter + block.width / 2), y: top + block.height / 2, z: 0, rot: 0, block });
			bottom[side] = top + block.height;
		});
		const highest = Math.min(...places.map((place) => place.y - place.block.height / 2));
		const lowest = Math.max(...places.map((place) => place.y + place.block.height / 2));
		places.forEach((place) => { place.y -= (highest + lowest) / 2; });
		const frames = places.map((place) => ({ x: place.x * 0.55, y: place.y, z: 0, roll: 0 }));
		const length = lowest - highest + ctx.F * 0.7;
		const top = -(lowest - highest) / 2 - ctx.F * 0.35;
		// The divider reaches the bottom of each line as it is sung, and never draws back.
		let reached = 0;
		const divider = {
			x: 0,
			y: top,
			z: 0,
			length,
			rot: 90,
			stops: places.map((place) => (reached = Math.max(reached, clamp01((place.y + place.block.height / 2 + ctx.F * 0.2 - top) / length)))),
		};
		return { places, frames, drift: { z: 80, roll: 1 }, strokes: [divider] };
	};

	// Every line larger than the last: the shot builds.
	const layoutSwell = (lines, ctx, random, look) => {
		const count = lines.length;
		const align = random() < 0.4 ? "left" : "center";
		const places = [];
		let y = 0;
		lines.forEach((line, index) => {
			const grow = count > 1 ? index / (count - 1) : 1;
			const block = layoutBlock(line, ctx, blockOptions(look, line, {
				size: ctx.F * lerp(0.56, 1.5, grow),
				maxLength: ctx.W * lerp(0.46, 0.84, grow),
				emphScale: 1.15,
				align,
			}));
			if (index) y += block.size * 0.12;
			places.push({ x: 0, y: y + block.height / 2, z: 0, rot: 0, block });
			y += block.height;
		});
		const widest = Math.max(...places.map((place) => place.block.width));
		places.forEach((place) => {
			place.y -= y / 2;
			if (align === "left") place.x = -widest / 2 + place.block.width / 2;
		});
		const frames = places.map((place) => ({
			x: frameX(place, ctx, 0.5),
			y: place.y,
			z: Math.max(0, (place.block.height - ctx.H * 0.56) * 0.9),
			roll: 0,
		}));
		return { places, frames, drift: { z: 140, roll: 0.8 } };
	};

	// Lines radiate from a hub like spokes; the screen turns to read each one.
	const layoutRadial = (lines, ctx, random, look) => {
		// Never a quarter turn: four lines sit a fifth of a turn apart, so the spokes do not read as a square.
		const step = (360 / Math.max(3, lines.length === 4 ? 5 : lines.length)) * (random() < 0.5 ? 1 : -1);
		const blocks = lines.map((line) => layoutBlock(line, ctx, blockOptions(look, line, {
			size: ctx.F * 0.78 * boostOf(line),
			maxLength: ctx.W * 0.5,
			align: "left",
		})));
		const thickest = Math.max(...blocks.map((block) => block.height));
		// Far enough out that neighbouring spokes clear each other at the hub.
		const hub = thickest / (2 * Math.tan((Math.abs(step) * Math.PI) / 360)) + ctx.F * 0.5;
		const frames = [];
		const places = blocks.map((block, index) => {
			const angle = step * index;
			const out = rotate2d(1, 0, angle);
			const reach = hub + block.width / 2;
			// The camera sits towards the hub but keeps the whole spoke in frame.
			const view = clamp(reach * 0.84, hub + block.width - ctx.W * 0.46, hub + ctx.W * 0.46);
			frames.push({ x: out.x * view, y: out.y * view, z: 0, roll: angle });
			return { x: out.x * reach, y: out.y * reach, z: 0, rot: angle, block };
		});
		return { places, frames, drift: { z: 80, roll: 1.6 * Math.sign(step) } };
	};

	// Lines around a drum that turns about its upright axis. Seen from outside the
	// neighbours curve away; from inside they lean in. The camera swings round to face each line.
	const layoutCarousel = (lines, ctx, random, look) => {
		const side = (ctx.typography[lines[0].n] || DEFAULT_INFO).rtl ? -1 : 1;
		const inside = random() < 0.35;
		const blocks = lines.map((line) => layoutBlock(line, ctx, blockOptions(look, line, {
			size: ctx.F * 0.88 * boostOf(line),
			maxLength: ctx.W * 0.5,
		})));
		const gap = ctx.W * 0.07;
		const arcs = [0];
		for (let index = 1; index < blocks.length; index += 1) arcs.push(arcs[index - 1] + blocks[index - 1].width / 2 + gap + blocks[index].width / 2);
		const total = arcs[arcs.length - 1];
		// At most a quarter turn from the first line to the last.
		const radius = Math.max(ctx.W * 1.25, total / 1.5);
		const places = blocks.map((block, index) => {
			const angle = (side * (arcs[index] - total / 2)) / radius;
			const degrees = (angle * 180) / Math.PI;
			return {
				x: radius * Math.sin(angle),
				y: 0,
				z: (inside ? 1 : -1) * radius * (1 - Math.cos(angle)),
				rot: 0,
				tiltY: inside ? -degrees : degrees,
				block,
			};
		});
		const frames = places.map((place) => ({ x: place.x, y: place.y, z: place.z, roll: 0, face: true }));
		return { places, frames, drift: { z: 100, roll: 0.8 } };
	};

	// Lines on a drum that rolls like a slot-machine reel: sung lines roll away over the top.
	const layoutReel = (lines, ctx, random, look) => {
		const align = random() < 0.35 ? "left" : "center";
		const blocks = lines.map((line) => layoutBlock(line, ctx, blockOptions(look, line, {
			size: ctx.F * 0.92 * boostOf(line),
			maxLength: ctx.W * 0.74,
			align,
		})));
		const gap = ctx.F * 0.36;
		const arcs = [0];
		for (let index = 1; index < blocks.length; index += 1) arcs.push(arcs[index - 1] + blocks[index - 1].height / 2 + gap + blocks[index].height / 2);
		const total = arcs[arcs.length - 1];
		// About 28 degrees between lines, at most a third of a turn in all.
		const radius = Math.max(ctx.H * 0.42, total / Math.max(1, blocks.length - 1) / 0.5, total / 2.1);
		const widest = Math.max(...blocks.map((block) => block.width));
		const places = blocks.map((block, index) => {
			const angle = (arcs[index] - total / 2) / radius;
			return {
				x: align === "left" ? -widest / 2 + block.width / 2 : 0,
				y: radius * Math.sin(angle),
				z: -radius * (1 - Math.cos(angle)),
				rot: 0,
				tiltX: (-angle * 180) / Math.PI,
				block,
			};
		});
		const frames = places.map((place) => ({ x: frameX(place, ctx, 0.5), y: place.y, z: place.z, roll: 0, face: true }));
		return { places, frames, drift: { z: 90, roll: 0.8 } };
	};

	const CRAWL_TILT = 36;

	// Lines lying on a plane that tilts away like an opening crawl: sung lines
	// recede into the distance (or, tilted the other way, the coming ones do).
	const layoutCrawl = (lines, ctx, random, look) => {
		const tilt = (random() < 0.6 ? 1 : -1) * CRAWL_TILT;
		const blocks = lines.map((line) => layoutBlock(line, ctx, blockOptions(look, line, {
			size: ctx.F * 0.96 * boostOf(line),
			maxLength: ctx.W * 0.7,
		})));
		const along = [];
		let position = 0;
		blocks.forEach((block, index) => {
			if (index) position += Math.max(blocks[index - 1].size, block.size) * 0.34;
			along.push(position + block.height / 2);
			position += block.height;
		});
		const radians = (tilt * Math.PI) / 180;
		const places = blocks.map((block, index) => {
			const offset = along[index] - position / 2;
			return { x: 0, y: offset * Math.cos(radians), z: offset * Math.sin(radians), rot: 0, tiltX: tilt, block };
		});
		const frames = places.map((place) => ({ x: 0, y: place.y, z: place.z, roll: 0 }));
		return { places, frames, drift: { z: 120, roll: 0.6 } };
	};

	// ---- Compositions after kinetic-typography edits: one thought at a time, flat colour, type as an object ----

	// Colours of plates and floods: two deep palette colours and ink. Type stays white on all three.
	const GROUNDS = Object.freeze(["deep", "ink", "deep2"]);
	const groundOf = (index, offset) => GROUNDS[(index + offset) % GROUNDS.length];

	// One line at a time in the same place, inside a band drawn across the screen: each line replaces the last.
	const layoutSlot = (lines, ctx, random, look) => {
		const blocks = lines.map((line) => layoutBlock(line, ctx, blockOptions(look, line, { size: ctx.F * 1.02 * boostOf(line), maxLength: ctx.W * 0.62 })));
		const tallest = Math.max(...blocks.map((block) => block.height));
		const widest = Math.max(...blocks.map((block) => block.width));
		const places = blocks.map((block) => ({ x: 0, y: 0, z: 0, rot: 0, block }));
		const frames = places.map(() => ({ x: 0, y: 0, z: 0, roll: 0 }));
		const band = { kind: "band", color: "ink", x: 0, y: 0, z: -8, w: ctx.W * 4, h: tallest + ctx.F * 0.8, rot: 0, radius: 0, line: 0 };
		const tick = (side) => ({
			x: side * (widest / 2 + ctx.F * 0.55),
			y: -(tallest / 2 + ctx.F * 0.14),
			z: 0,
			length: tallest + ctx.F * 0.28,
			rot: 90,
			stops: places.map(() => 1),
		});
		return { places, frames, drift: { z: 60, roll: 0.5 }, solo: true, plates: [band], strokes: [tick(-1), tick(1)] };
	};

	// One line at a time, as large as the screen allows, on a flat colour field that changes with every line.
	const layoutPoster = (lines, ctx, random, look) => {
		const offset = Math.floor(random() * GROUNDS.length);
		const places = lines.map((line, index) => {
			const options = blockOptions(look, line, { emphScale: 1.2, light: false });
			const natural = layoutBlock(line, ctx, { ...options, size: 100, maxLength: Infinity }).leadWidth / 100;
			const size = clamp((ctx.W * 0.86) / Math.max(1, natural), ctx.F * 0.95, ctx.F * 2.6);
			let block = layoutBlock(line, ctx, { ...options, size, maxLength: ctx.W * 0.86 });
			if (block.height > ctx.H * 0.6) block = layoutBlock(line, ctx, { ...options, size: (size * ctx.H * 0.6) / block.height, maxLength: ctx.W * 0.86 });
			const color = groundOf(index, offset);
			return { x: 0, y: 0, z: 0, rot: 0, block, flood: color, ground: color === "ink" ? "dark" : "color" };
		});
		const frames = places.map(() => ({ x: 0, y: 0, z: 0, roll: 0 }));
		return { places, frames, drift: { z: 120, roll: 0.6 }, solo: true };
	};

	// The shot's lines repeated across the whole screen as outlines, a little askew; each fills in where it is sung.
	const layoutWordwall = (lines, ctx, random, look) => {
		const width = ctx.W * 0.62;
		const places = [];
		const rows = [];
		let y = 0;
		lines.forEach((line, index) => {
			const options = blockOptions(look, line, { emphScale: 1.1, light: false });
			const natural = layoutBlock(line, ctx, { ...options, size: 100, maxLength: Infinity }).leadWidth / 100;
			const size = clamp(width / Math.max(1, natural), ctx.F * 0.5, ctx.F * 1.5);
			const block = layoutBlock(line, ctx, { ...options, size, maxLength: Infinity });
			const info = ctx.typography[line.n] || DEFAULT_INFO;
			const spec = ctx.font(info.script, look.type, "display");
			const text = block.words.slice(0, line.words.length).map((word) => word.text).join(" ");
			if (index) y += block.size * 0.16;
			const place = { x: (index % 2 ? 1 : -1) * ctx.W * 0.07, y: y + block.height / 2, z: 0, rot: 0, block };
			places.push(place);
			rows.push({ place, text, spec, size: block.size, copy: ctx.measure(text, block.size, spec) });
			y += block.height;
		});
		places.forEach((place) => { place.y -= y / 2; });
		const fills = [];
		const tile = (row, cx, cy, from, to) => {
			const step = row.copy + row.size * 0.55;
			for (let k = from; k <= to; k += 1) {
				if (k) fills.push({ text: row.text, spec: row.spec, size: row.size, x: cx + k * step + Math.sign(k) * (row.place.block.width - row.copy) / 2, y: cy, z: 0, rot: 0 });
			}
		};
		rows.forEach((row) => tile(row, row.place.x, row.place.y, -2, 2));
		// A row of outlines above the first line and below the last, set like bricks.
		const first = rows[0];
		const last = rows[rows.length - 1];
		const over = { ...last, place: { ...last.place, block: { width: last.copy } } };
		const under = { ...first, place: { ...first.place, block: { width: first.copy } } };
		for (const [row, cy] of [[over, first.place.y - first.place.block.height / 2 - last.size * 0.62], [under, last.place.y + last.place.block.height / 2 + first.size * 0.62]]) {
			const shift = row.copy * 0.5;
			fills.push({ text: row.text, spec: row.spec, size: row.size, x: shift, y: cy, z: 0, rot: 0 });
			tile(row, shift, cy, -2, 2);
		}
		const frames = places.map((place) => ({ x: place.x, y: place.y, z: 0, roll: 0 }));
		return { places, frames, drift: { z: 90, roll: 0.8 }, fills, tilt: (random() < 0.5 ? 1 : -1) * between(random, 7, 12) };
	};

	// A line may cover this much of the great circle it is set round (radians).
	const ARCH_SPAN = 1.1;

	/** A line's words in one row bent round a circle: each word stands on the curve. */
	const archBlock = (line, ctx, options, radius) => {
		const info = ctx.typography[line.n] || DEFAULT_INFO;
		const items = itemsOf(line, ctx, options);
		const natural = rowWidth(items);
		const scale = Math.min(1, (radius * ARCH_SPAN) / Math.max(1, natural));
		const length = natural * scale;
		const side = info.rtl ? -1 : 1;
		const words = [];
		let along = -length / 2;
		let tallest = 0;
		items.forEach((item, position) => {
			if (position) along += item.gap * scale;
			const width = item.width * scale;
			const size = item.size * scale;
			const angle = (side * (along + width / 2)) / radius;
			words[item.index] = {
				x: radius * Math.sin(angle),
				y: radius * (1 - Math.cos(angle)),
				rot: (angle * 180) / Math.PI,
				size, width, role: item.role, emph: item.emph, voice: 0, spec: item.spec, text: item.text, letters: item.letters,
			};
			tallest = Math.max(tallest, size);
			along += width;
		});
		const half = Math.min(Math.PI / 2, length / 2 / radius);
		return {
			words,
			width: 2 * radius * Math.sin(half),
			height: tallest * 1.1 + radius * (1 - Math.cos(half)),
			rows: 1,
			size: options.size * scale,
			rtl: info.rtl,
			leadWidth: length,
		};
	};

	// Lines set round a great circle like the lettering on a seal: the screen turns as the song goes round it.
	const layoutArch = (lines, ctx, random, look) => {
		const direction = (ctx.typography[lines[0].n] || DEFAULT_INFO).rtl ? -1 : 1;
		const radius = ctx.W * between(random, 0.5, 0.62);
		const blocks = lines.map((line) => (line.backing.length
			// Other voices need rows of their own: such a line stays straight.
			? layoutBlock(line, ctx, blockOptions(look, line, { size: ctx.F * 0.8 * boostOf(line), maxLength: ctx.W * 0.56 }))
			: archBlock(line, ctx, blockOptions(look, line, { size: ctx.F * 0.92 * boostOf(line) }), radius)));
		const places = [];
		const frames = [];
		let angle = 0;
		let before = 0;
		blocks.forEach((block, index) => {
			const span = (block.leadWidth || block.width) / radius;
			if (index) angle += direction * ((before + span) / 2 + (ctx.F * 0.9) / radius);
			before = span;
			const degrees = (angle * 180) / Math.PI;
			const out = rotate2d(0, -1, degrees);
			places.push({ x: out.x * radius, y: out.y * radius, z: 0, rot: degrees, block });
			// From a little inside the circle, so the arc rises over the middle of the screen.
			const view = radius - ctx.H * 0.1;
			frames.push({ x: out.x * view, y: out.y * view, z: 0, roll: degrees });
		});
		const inner = radius - ctx.F * 1.15;
		const ring = { kind: "ring", color: "line", x: 0, y: 0, z: -6, w: inner * 2, h: inner * 2, rot: 0, radius: inner, line: 0 };
		return { places, frames, drift: { z: 70, roll: 1.4 * direction }, plates: [ring] };
	};

	/** A line's words set apart like stepping stones across the screen, one higher, the next lower. */
	const spreadBlock = (line, ctx, options, random) => {
		const info = ctx.typography[line.n] || DEFAULT_INFO;
		const items = itemsOf(line, ctx, options);
		const rows = items.length > 5 ? splitRows(items, 2, rowWidth(items)) : [items];
		const side = info.rtl ? -1 : 1;
		const words = [];
		let span = 0;
		rows.forEach((row, rowIndex) => {
			const total = row.reduce((sum, item) => sum + item.width, 0);
			const room = ctx.W * 0.82;
			const scale = Math.min(1, (room * 0.84) / Math.max(1, total));
			const gap = row.length > 1 ? Math.min((room - total * scale) / (row.length - 1), ctx.W * 0.2) : 0;
			const width = total * scale + gap * (row.length - 1);
			span = Math.max(span, width);
			const middle = (rowIndex - (rows.length - 1) / 2) * ctx.H * 0.3;
			let x = -width / 2;
			row.forEach((item, position) => {
				const itemWidth = item.width * scale;
				const lift = row.length > 1 ? (position % 2 ? 1 : -1) * ctx.H * between(random, 0.035, 0.1) : 0;
				words[item.index] = {
					x: side * (x + itemWidth / 2),
					y: middle + lift,
					rot: row.length > 1 ? between(random, -4, 4) : 0,
					size: item.size * scale, width: itemWidth, role: item.role, emph: item.emph, voice: 0, spec: item.spec, text: item.text, letters: item.letters,
				};
				x += itemWidth + gap;
			});
		});
		const height = (rows.length - 1) * ctx.H * 0.3 + ctx.H * 0.2 + options.size * 1.3;
		return { words, width: span, height, rows: rows.length, size: options.size, rtl: info.rtl, leadWidth: span };
	};

	// One line at a time, its words scattered across the width; each word lands on its beat.
	const layoutSpread = (lines, ctx, random, look) => {
		const places = lines.map((line) => ({
			x: 0, y: 0, z: 0, rot: 0,
			block: line.backing.length
				? layoutBlock(line, ctx, blockOptions(look, line, { size: ctx.F * 1.05 * boostOf(line), maxLength: ctx.W * 0.74 }))
				: spreadBlock(line, ctx, blockOptions(look, line, { size: ctx.F * 1.08 * boostOf(line), light: false }), random),
		}));
		const frames = places.map(() => ({ x: 0, y: 0, z: 0, roll: 0 }));
		return { places, frames, drift: { z: 110, roll: 1 }, solo: true };
	};

	// Lines that can stand upright: Korean, Japanese and Chinese without Latin words or other voices.
	const UPRIGHT_RE = /^[\p{Script=Hangul}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{P}\p{N}\s\u30fc]+$/u;
	const standsUpright = (line) => UPRIGHT_RE.test(line.text) && !line.backing.length;

	/** A line set top to bottom, in two columns (right to left) when it is long. */
	const pillarBlock = (line, ctx, options) => {
		const items = itemsOf(line, ctx, options);
		const lengthOf = (item) => graphemesOf(item.text).length * item.size * 1.02;
		const gap = options.size * 0.3;
		const most = ctx.H * 0.64;
		// A long line splits into at most MAX_LINE_ROWS balanced columns, set smaller when they are still too tall.
		const spans = items.map((item, index) => ({ item, width: lengthOf(item), gap: index ? gap : 0 }));
		const total = rowWidth(spans);
		const columns = (total > most && items.length > 1 ? splitRows(spans, Math.min(MAX_LINE_ROWS, items.length), total) : [spans])
			.map((column) => column.map((span) => span.item));
		const heights = columns.map((column) => column.reduce((sum, item, index) => sum + lengthOf(item) + (index ? gap : 0), 0));
		const scale = Math.min(1, most / Math.max(...heights));
		const pitch = options.size * 1.34 * scale;
		const width = columns.length * pitch;
		const height = Math.max(...heights) * scale;
		const words = [];
		columns.forEach((column, index) => {
			let top = -height / 2;
			column.forEach((item, position) => {
				if (position) top += gap * scale;
				const length = lengthOf(item) * scale;
				words[item.index] = {
					x: width / 2 - pitch * (index + 0.5),
					y: top + length / 2,
					vertical: true,
					size: item.size * scale, width: item.size * scale, height: length, role: item.role, emph: item.emph, voice: 0, spec: item.spec, text: item.text, letters: item.letters,
				};
				top += length;
			});
		});
		return { words, width, height, rows: columns.length, size: options.size * scale, rtl: false, leadWidth: width };
	};

	// Lines set upright like banners, read right to left (Korean, Japanese and Chinese).
	const layoutPillar = (lines, ctx, random, look) => {
		const blocks = lines.map((line) => pillarBlock(line, ctx, blockOptions(look, line, { size: ctx.F * 0.98 * boostOf(line), light: false })));
		const gap = ctx.F * 1.5;
		const places = [];
		let x = 0;
		blocks.forEach((block, index) => {
			if (index) x -= blocks[index - 1].width / 2 + gap + block.width / 2;
			// Every line hangs from the same height, the next a little lower.
			places.push({ x, y: block.height / 2 + index * ctx.F * 0.5, z: 0, rot: 0, block, upright: true });
		});
		centerPlaces(places);
		const frames = places.map((place) => ({ x: place.x * 0.7, y: place.y * 0.5, z: 0, roll: 0 }));
		return { places, frames, drift: { z: 90, roll: 0.6 } };
	};

	// Lines riding a long wave across the screen: each tilts with the slope under it and the camera rolls along the swell.
	const layoutWave = (lines, ctx, random, look) => {
		const side = (ctx.typography[lines[0].n] || DEFAULT_INFO).rtl ? -1 : 1;
		const blocks = lines.map((line) => layoutBlock(line, ctx, blockOptions(look, line, { size: ctx.F * 0.84 * boostOf(line), maxLength: ctx.W * 0.56 })));
		const gap = ctx.F * 0.75;
		const amplitude = ctx.H * between(random, 0.1, 0.16);
		const phase = random() < 0.5 ? 0 : Math.PI;
		const places = [];
		let x = 0;
		blocks.forEach((block, index) => {
			if (index) x += blocks[index - 1].width / 2 + gap + block.width / 2;
			places.push({ x, y: 0, z: 0, rot: 0, block });
		});
		// About one and a half swells over the shot, however long it is.
		const wavelength = Math.max(ctx.W * 0.9, x / 1.5);
		places.forEach((place) => {
			const angle = (2 * Math.PI * place.x) / wavelength + phase;
			const slope = ((amplitude * 2 * Math.PI) / wavelength) * Math.cos(angle) * side;
			place.y = amplitude * Math.sin(angle);
			place.rot = clamp((Math.atan(slope) * 180) / Math.PI, -11, 11);
			place.x *= side;
		});
		centerPlaces(places);
		const frames = places.map((place) => ({ x: place.x, y: place.y, z: 0, roll: place.rot }));
		return { places, frames, drift: { z: 80, roll: 0.9 } };
	};

	// Lines scattered wide like stars on a chart, a thin line drawn from each to the next as it is sung.
	const layoutConstellation = (lines, ctx, random, look) => {
		const places = [];
		let side = random() < 0.5 ? 1 : -1;
		lines.forEach((line, index) => {
			const block = layoutBlock(line, ctx, blockOptions(look, line, { size: ctx.F * between(random, 0.66, 0.92) * boostOf(line), maxLength: ctx.W * 0.5 }));
			if (!index) {
				places.push({ x: 0, y: 0, z: 0, rot: 0, block });
				return;
			}
			side = -side;
			const previous = places[index - 1];
			// Across and up or down from the last line, far enough apart for the line between them to read.
			const x = previous.x + side * (previous.block.width / 2 + block.width / 2 + ctx.W * between(random, 0.05, 0.14));
			const y = previous.y + (random() < 0.5 ? -1 : 1) * (previous.block.height / 2 + block.height / 2 + ctx.H * between(random, 0.08, 0.2));
			places.push({ x, y, z: between(random, -90, 60), rot: 0, block });
		});
		centerPlaces(places);
		const strokes = [];
		places.forEach((place, index) => {
			const next = places[index + 1];
			if (!next) return;
			const dx = next.x - place.x;
			const dy = next.y - place.y;
			const length = Math.hypot(dx, dy) || 1;
			const ux = dx / length;
			const uy = dy / length;
			// From the edge of one line's box to the edge of the next.
			const reach = (target) => Math.min(target.block.width / 2 / Math.max(0.001, Math.abs(ux)), target.block.height / 2 / Math.max(0.001, Math.abs(uy))) + ctx.F * 0.3;
			const from = reach(place);
			const span = length - from - reach(next);
			if (span < ctx.F * 0.6) return;
			strokes.push({
				x: place.x + ux * from,
				y: place.y + uy * from,
				z: Math.max(place.z, next.z),
				length: span,
				rot: (Math.atan2(dy, dx) * 180) / Math.PI,
				stops: places.map((_, local) => (local > index ? 1 : 0)),
			});
		});
		const frames = places.map((place) => ({ x: place.x, y: place.y, z: place.z, roll: 0 }));
		return { places, frames, drift: { z: 90, roll: 1.1 }, strokes };
	};

	// A modular poster grid: each line set tight in its own cell, the rules between the cells drawn as they fill.
	const layoutGrid = (lines, ctx, random, look) => {
		const side = (ctx.typography[lines[0].n] || DEFAULT_INFO).rtl ? -1 : 1;
		const columns = lines.length <= 1 ? 1 : 2;
		const rows = Math.ceil(lines.length / columns);
		const cellWidth = ctx.W * (columns === 1 ? 0.72 : 0.4);
		const pad = ctx.F * 0.32;
		const blocks = lines.map((line) => layoutBlock(line, ctx, blockOptions(look, line, {
			size: ctx.F * 0.8 * boostOf(line),
			maxLength: cellWidth - pad * 2,
			align: side > 0 ? "left" : "right",
		})));
		// Reading along the rows, or down the columns first.
		const down = lines.length > 2 && random() < 0.4;
		const cellOf = (index) => (down ? { column: Math.floor(index / rows), row: index % rows } : { column: index % columns, row: Math.floor(index / columns) });
		const rowHeights = Array.from({ length: rows }, (_, row) => Math.max(...blocks.filter((_, index) => cellOf(index).row === row).map((block) => block.height)) + pad * 2);
		const tops = rowHeights.map((_, row) => rowHeights.slice(0, row).reduce((sum, height) => sum + height, 0));
		const height = tops[rows - 1] + rowHeights[rows - 1];
		const width = cellWidth * columns;
		const places = blocks.map((block, index) => {
			const { column, row } = cellOf(index);
			const left = -width / 2 + column * cellWidth + pad;
			return { x: side * (left + block.width / 2), y: -height / 2 + tops[row] + pad + block.height / 2, z: 0, rot: 0, block };
		});
		const strokes = [];
		if (columns > 1) {
			// The rule between the columns grows down as the lines are sung.
			strokes.push({ x: 0, y: -height / 2, z: 0, length: height, rot: 90, stops: places.map((_, local) => clamp01((local + 1) / places.length)) });
		}
		for (let row = 1; row < rows; row += 1) {
			const first = places.findIndex((_, index) => cellOf(index).row === row);
			strokes.push({ x: side * (-width / 2), y: -height / 2 + tops[row], z: 0, length: width, rot: side > 0 ? 0 : 180, stops: places.map((_, local) => (local >= first ? 1 : 0)) });
		}
		const frames = places.map((place) => ({ x: frameX(place, ctx, 0.6), y: place.y * 0.8, z: 0, roll: 0 }));
		return { places, frames, drift: { z: 70, roll: 0.6 }, strokes };
	};

	// Lines set small in the corners of a wide frame with the middle left open; the camera barely moves.
	const layoutCorners = (lines, ctx, random, look) => {
		const order = random() < 0.5 ? [[-1, -1], [1, 1], [1, -1], [-1, 1]] : [[-1, -1], [1, -1], [-1, 1], [1, 1]];
		// Inside the frame from wherever the camera stands (it moves only a little towards each line).
		const reachX = ctx.W * 0.37;
		const reachY = ctx.H * 0.31;
		const places = lines.map((line, index) => {
			const [sx, sy] = order[index % order.length];
			const block = layoutBlock(line, ctx, blockOptions(look, line, {
				size: ctx.F * 0.72 * boostOf(line),
				maxLength: ctx.W * 0.4,
				align: sx < 0 ? "left" : "right",
			}));
			return { x: sx * Math.max(block.width / 2, reachX - block.width / 2), y: sy * Math.max(block.height / 2 + ctx.F * 0.2, reachY - block.height / 2), z: 0, rot: 0, block };
		});
		const frames = places.map((place) => ({ x: place.x * 0.16, y: place.y * 0.16, z: 0, roll: 0 }));
		return { places, frames, drift: { z: 24, roll: 0.4 } };
	};

	// ---- Compositions from the motion-typography canon (lyric videos, title sequences, kinetic identities)

	// Little words a sized lockup sets small (the stressed words carry the line).
	const SMALL_WORDS = new Set(["a", "an", "the", "of", "to", "in", "on", "at", "by", "for", "and", "or", "but", "is", "am", "are", "it", "its", "i", "me", "my", "you", "your", "we", "be", "as", "so", "oh", "do", "no", "up", "if", "de", "la", "le", "les", "el", "los", "y", "et", "und", "der", "die", "das", "ein", "un", "une"]);
	/** How much a word weighs in a sized lockup: the little words small, the long and emphasised ones big. */
	const stressOf = (text, emph) => {
		if (emph) return 1.9;
		const bare = String(text ?? "").toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
		const length = graphemesOf(bare).length;
		if (!length) return 0.5;
		if (SMALL_WORDS.has(bare)) return 0.55;
		if (length === 1 && /\p{Script=Hiragana}/u.test(bare)) return 0.6;
		return length >= 6 ? 1.25 : 1;
	};

	/**
	 * A line as a sized lockup: its words in one or two rows, each word sized
	 * by its stress, every row justified to the same width and the rows set
	 * tight on their baselines. Lines with other voices keep the plain block.
	 */
	const lockupBlock = (line, ctx, options, width, maxHeight) => {
		if (line.backing.length) return layoutBlock(line, ctx, { ...options, size: ctx.F * 0.9, maxLength: width });
		const info = ctx.typography[line.n] || DEFAULT_INFO;
		const items = itemsOf(line, ctx, { ...options, size: 100 });
		items.forEach((item, index) => {
			const weight = stressOf(item.text, item.emph) / (item.emph ? 1.3 * (ACCENT_SCALE[options.accent] || 1) : 1);
			item.size *= weight;
			item.width *= weight;
			item.gap = index ? Math.min(item.size, items[index - 1].size) * (item.gap > 10 ? 0.24 : 0.05) : 0;
		});
		const rows = items.length >= 3 ? splitRows(items, Math.min(MAX_LINE_ROWS, items.length), rowWidth(items)) : [items];
		// Every row fills the width, but a row of little words does not grow past twice the line's size.
		let scales = rows.map((row) => Math.min(width / Math.max(1, rowWidth(row)), (ctx.F * 3.2) / Math.max(...row.map((item) => item.size))));
		const build = () => {
			const words = [];
			let baseline = 0;
			let widest = 0;
			let tallest = 0;
			rows.forEach((row, rowIndex) => {
				const scale = scales[rowIndex];
				const top = Math.max(...row.map((item) => item.size)) * scale;
				tallest = Math.max(tallest, top);
				baseline += rowIndex ? top * 0.92 : top * 0.78;
				const rowLength = rowWidth(row) * scale;
				widest = Math.max(widest, rowLength);
				let x = -rowLength / 2;
				row.forEach((item, position) => {
					if (position) x += item.gap * scale;
					const size = item.size * scale;
					const itemWidth = item.width * scale;
					const center = x + itemWidth / 2;
					words[item.index] = {
						x: info.rtl ? -center : center,
						y: baseline - size * 0.24,
						size, width: itemWidth, role: item.role, emph: item.emph, voice: 0, spec: item.spec, text: item.text, letters: item.letters,
					};
					x += itemWidth;
				});
			});
			const height = baseline + tallest * 0.22;
			words.forEach((word) => { word.y -= height / 2; });
			return { words, width: widest, height, rows: rows.length, size: tallest, rtl: info.rtl, leadWidth: widest };
		};
		let block = build();
		if (block.height > maxHeight) {
			scales = scales.map((scale) => (scale * maxHeight) / block.height);
			block = build();
		}
		return block;
	};

	// One line at a time as a sized lockup in the middle of the screen.
	const layoutLockup = (lines, ctx, random, look) => {
		const places = lines.map((line) => ({ x: 0, y: 0, z: 0, rot: 0, block: lockupBlock(line, ctx, blockOptions(look, line, { light: false }), ctx.W * between(random, 0.56, 0.7), ctx.H * 0.62) }));
		const frames = places.map(() => ({ x: 0, y: 0, z: 0, roll: 0 }));
		return { places, frames, drift: { z: 110, roll: 0.6 }, solo: true };
	};

	/** A line set one word at a time in one place: each word sized by its stress (the renderer shows only the latest). */
	const flashBlock = (line, ctx, options) => {
		const info = ctx.typography[line.n] || DEFAULT_INFO;
		const items = itemsOf(line, ctx, { ...options, size: 100 });
		const words = [];
		let widest = 0;
		let tallest = 0;
		items.forEach((item) => {
			const wanted = ctx.F * 1.55 * stressOf(item.text, item.emph);
			const size = Math.min(wanted, (ctx.W * 0.84 * 100) / Math.max(1, item.width) * (item.size / 100), ctx.H * 0.46);
			const scale = size / item.size;
			const width = item.width * scale;
			words[item.index] = { x: 0, y: 0, size, width, role: item.role, emph: item.emph, voice: 0, spec: item.spec, text: item.text, letters: item.letters };
			widest = Math.max(widest, width);
			tallest = Math.max(tallest, size);
		});
		return { words, width: widest, height: tallest * 1.1, rows: 1, size: tallest, rtl: info.rtl, leadWidth: widest };
	};

	// One word at a time, each replacing the last in the same place on its beat.
	const layoutFlash = (lines, ctx, random, look) => {
		const places = lines.map((line) => (line.backing.length
			? { x: 0, y: 0, z: 0, rot: 0, block: layoutBlock(line, ctx, blockOptions(look, line, { size: ctx.F * 1.05 * boostOf(line), maxLength: ctx.W * 0.74 })) }
			: { x: 0, y: 0, z: 0, rot: 0, block: flashBlock(line, ctx, blockOptions(look, line, { light: false })), flash: true }));
		const frames = places.map(() => ({ x: 0, y: 0, z: 0, roll: 0 }));
		return { places, frames, drift: { z: 140, roll: 0.4 }, solo: true };
	};

	/**
	 * The members of a composition in runs that belong together: the pieces a
	 * lyric line was broken into (expandPieces) form one run, a whole line its own.
	 */
	const pieceRuns = (lines) => {
		const runs = [];
		lines.forEach((line, index) => {
			const previous = lines[index - 1];
			const continues = previous && line.part > 0 && Number.isInteger(line.source) && previous.source === line.source;
			if (continues) runs[runs.length - 1].push(index);
			else runs.push([index]);
		});
		return runs;
	};

	/**
	 * The pieces of one lyric line set together as that line would be set
	 * (makeBlock: lockupBlock, layoutBlock...), each piece getting its own
	 * words back as a block centred on its own box (x, y: where that box sits
	 * in the line). Null when the line has other voices (their rows belong to
	 * single pieces).
	 */
	const runParts = (members, ctx, makeBlock) => {
		if (members.length < 2 || members.some((line) => line.backing.length)) return null;
		const head = members[0];
		const words = [];
		const scripts = [];
		const emph = new Set();
		const offsets = [];
		members.forEach((line) => {
			offsets.push(words.length);
			const info = ctx.typography[line.n] || DEFAULT_INFO;
			line.words.forEach((word, index) => {
				if (line.emph.has(index)) emph.add(words.length);
				scripts.push((info.words || [])[index]);
				words.push(word);
			});
		});
		const whole = { ...head, n: 0, words, backing: [], emph, chars: members.reduce((sum, line) => sum + (line.chars || 0), 0) };
		const block = makeBlock(whole, { ...ctx, typography: [{ ...(ctx.typography[head.n] || DEFAULT_INFO), words: scripts }] });
		return members.map((line, member) => {
			const own = block.words.slice(offsets[member], offsets[member] + line.words.length);
			const left = Math.min(...own.map((word) => word.x - word.width / 2));
			const right = Math.max(...own.map((word) => word.x + word.width / 2));
			const top = Math.min(...own.map((word) => word.y - word.size * 0.5));
			const bottom = Math.max(...own.map((word) => word.y + word.size * 0.5));
			const x = (left + right) / 2;
			const y = (top + bottom) / 2;
			const size = Math.max(...own.map((word) => word.size));
			return {
				x,
				y,
				block: { words: own.map((word) => ({ ...word, x: word.x - x, y: word.y - y })), width: right - left, height: bottom - top, rows: 1, size, rtl: block.rtl, leadWidth: right - left },
			};
		});
	};

	/**
	 * A composition's members as units that move together: a line set in
	 * pieces is one unit (its pieces where the whole line would have its
	 * words), a whole line a unit of its own. makeBlock(line, ctx, unit) sets
	 * a line. Each unit: its members, where each sits (centred on the unit)
	 * and the unit's box.
	 */
	const runUnits = (lines, ctx, makeBlock) => pieceRuns(lines).map((members, unit) => {
		const make = (line, lineCtx) => makeBlock(line, lineCtx, unit);
		let parts = runParts(members.map((index) => lines[index]), ctx, make);
		if (!parts) {
			// Whole lines (or pieces with other voices): stacked under each other.
			const gap = ctx.F * 0.22;
			const blocks = members.map((index) => make(lines[index], ctx));
			const height = blocks.reduce((sum, block) => sum + block.height, 0) + gap * (blocks.length - 1);
			const widest = Math.max(...blocks.map((block) => block.width));
			let top = -height / 2;
			parts = blocks.map((block) => {
				const part = { x: -widest / 2 + block.width / 2, y: top + block.height / 2, block };
				top += block.height + gap;
				return part;
			});
		}
		const left = Math.min(...parts.map((part) => part.x - part.block.width / 2));
		const right = Math.max(...parts.map((part) => part.x + part.block.width / 2));
		const top = Math.min(...parts.map((part) => part.y - part.block.height / 2));
		const bottom = Math.max(...parts.map((part) => part.y + part.block.height / 2));
		const cx = (left + right) / 2;
		const cy = (top + bottom) / 2;
		return { members, parts: parts.map((part) => ({ ...part, x: part.x - cx, y: part.y - cy })), width: right - left, height: bottom - top };
	});

	/**
	 * Places and camera frames for units set at boxes (x, y, rot): every
	 * member where its unit puts it, all centred, the camera holding still on
	 * the pieces of one line.
	 */
	const placeUnits = (units, boxes, count) => {
		const places = new Array(count);
		units.forEach((unit, index) => {
			const box = boxes[index];
			unit.members.forEach((member, position) => {
				const part = unit.parts[position];
				const at = rotate2d(part.x, part.y, box.rot);
				places[member] = { x: box.x + at.x, y: box.y + at.y, z: 0, rot: box.rot, block: part.block };
			});
		});
		const extent = extentOf(boxesOf(places));
		places.forEach((place) => {
			place.x -= extent.cx;
			place.y -= extent.cy;
		});
		const frames = new Array(count);
		units.forEach((unit, index) => {
			const box = boxes[index];
			for (const member of unit.members) frames[member] = { x: box.x - extent.cx, y: box.y - extent.cy, z: 0, roll: box.rot };
		});
		return { places, frames };
	};

	// Each line attached to the edge of the one before, now and then turned a quarter: a mosaic the camera rolls along.
	// A line set in pieces keeps its pieces together in its own lockup: only the lines turn, never their words.
	const layoutChain = (lines, ctx, random, look) => {
		const turn = random() < 0.5 ? 90 : -90;
		const gap = ctx.F * 0.22;
		const units = runUnits(lines, ctx, (line, lineCtx) => lockupBlock(line, lineCtx, blockOptions(look, line, { light: false }), ctx.W * between(random, 0.42, 0.54), ctx.H * 0.46));
		const boxes = [];
		units.forEach((unit, index) => {
			if (!index) {
				boxes.push({ x: 0, y: 0, rot: 0 });
				return;
			}
			const previous = boxes[index - 1];
			const before = units[index - 1];
			// Every other line turns down the side of the one before (now and then two in a row).
			const turned = index % 2 === 1 || random() < 0.2;
			// In the previous line's own frame: under it (left edges aligned), or down its side when turned.
			const local = turned
				? { x: (turn > 0 ? 1 : -1) * (before.width / 2 + gap + unit.height / 2), y: -before.height / 2 + unit.width / 2 }
				: { x: -before.width / 2 + unit.width / 2, y: before.height / 2 + gap + unit.height / 2 };
			const offset = rotate2d(local.x, local.y, previous.rot);
			boxes.push({ x: previous.x + offset.x, y: previous.y + offset.y, rot: previous.rot + (turned ? turn : 0) });
		});
		return { ...placeUnits(units, boxes, lines.length), drift: { z: 70, roll: 0.8 } };
	};

	// One line at a time in capitals that always fill the width: each sung word stretches the line (fillFrame).
	const layoutFill = (lines, ctx, random, look) => {
		const target = ctx.W * 0.88;
		const places = lines.map((line) => {
			// Heavy capitals throughout (the shot's face and serif words give way).
			const options = blockOptions(look, line, { emphScale: 1.15, light: false, upper: true, type: "impact", serif: false });
			const natural = layoutBlock(line, ctx, { ...options, size: 100, maxLength: Infinity }).leadWidth / 100;
			const size = Math.min(target / Math.max(1, natural), ctx.F * 3);
			// A long line cannot fill the width in one row: it is set as a plain block.
			if (size < ctx.F * 0.55 || line.backing.length) {
				return { x: 0, y: 0, z: 0, rot: 0, block: layoutBlock(line, ctx, { ...options, size: ctx.F * 0.95, maxLength: target }) };
			}
			const block = layoutBlock(line, ctx, { ...options, size, maxLength: Infinity });
			return { x: 0, y: 0, z: 0, rot: 0, block, fill: { target, most: Math.max(1, Math.min(3.4, (ctx.H * 0.62) / Math.max(1, block.height))) } };
		});
		const frames = places.map(() => ({ x: 0, y: 0, z: 0, roll: 0 }));
		return { places, frames, drift: { z: 60, roll: 0.3 }, solo: true };
	};

	// One line at a time inside a ring like a seal, an outer dashed ring turning the other way.
	const layoutSeal = (lines, ctx, random, look) => {
		const radius = Math.min(ctx.W, ctx.H) * 0.33;
		const spin = random() < 0.5 ? 1 : -1;
		const places = lines.map((line) => {
			let block = layoutBlock(line, ctx, blockOptions(look, line, { size: ctx.F * 0.92 * boostOf(line), maxLength: radius * 1.5 }));
			if (block.height > radius * 1.2) block = layoutBlock(line, ctx, blockOptions(look, line, { size: (ctx.F * 0.92 * boostOf(line) * radius * 1.2) / block.height, maxLength: radius * 1.5 }));
			return { x: 0, y: 0, z: 0, rot: 0, block };
		});
		const plates = [];
		places.forEach((_, index) => {
			plates.push({ kind: "ring", color: "seal", x: 0, y: 0, z: -6, w: radius * 2, h: radius * 2, rot: 0, radius, line: index, solo: true, spin: spin * 14 });
			plates.push({ kind: "ring", color: "dash", x: 0, y: 0, z: -10, w: radius * 2.28, h: radius * 2.28, rot: between(random, 0, 90), radius: radius * 1.14, line: index, solo: true, spin: -spin * 26 });
		});
		const frames = places.map(() => ({ x: 0, y: 0, z: 0, roll: 0 }));
		return { places, frames, drift: { z: 90, roll: 0.6 }, solo: true, plates };
	};

	/** A line's words placed round the edges of the frame (clockwise from the top left), the middle left open. */
	const frameBlock = (line, ctx, options, random) => {
		const info = ctx.typography[line.n] || DEFAULT_INFO;
		const items = itemsOf(line, ctx, { ...options, size: 100 });
		const A = ctx.W * 0.4;
		const B = ctx.H * 0.34;
		const perimeter = 4 * A + 4 * B;
		const sized = items.map((item) => {
			const size = clamp(ctx.F * 0.74 * stressOf(item.text, item.emph) * between(random, 0.85, 1.2), ctx.F * 0.42, ctx.F * 1.4);
			return { item, size, width: (item.width * size) / item.size };
		});
		const gap = ctx.F * 0.9;
		const total = sized.reduce((sum, entry) => sum + entry.width, 0) + gap * Math.max(0, sized.length - 1);
		const stretch = Math.max(1, (perimeter * 0.7) / Math.max(1, total));
		const pointAt = (s) => {
			let rest = ((s % perimeter) + perimeter) % perimeter;
			if (rest < 2 * A) return { x: -A + rest, y: -B };
			rest -= 2 * A;
			if (rest < 2 * B) return { x: A, y: -B + rest };
			rest -= 2 * B;
			if (rest < 2 * A) return { x: A - rest, y: B };
			rest -= 2 * A;
			return { x: -A, y: B - rest };
		};
		const words = [];
		let along = perimeter * 0.02;
		sized.forEach((entry, index) => {
			if (index) along += gap * stretch;
			const point = pointAt(along + (entry.width * stretch) / 2);
			along += entry.width * stretch;
			// Pulled inside the frame.
			const x = clamp(point.x, -ctx.W * 0.46 + entry.width / 2, ctx.W * 0.46 - entry.width / 2);
			const y = clamp(point.y, -ctx.H * 0.43 + entry.size * 0.6, ctx.H * 0.43 - entry.size * 0.6);
			words[entry.item.index] = { x, y, rot: between(random, -3, 3), size: entry.size, width: entry.width, role: entry.item.role, emph: entry.item.emph, voice: 0, spec: entry.item.spec, text: entry.item.text, letters: entry.item.letters };
		});
		return { words, width: A * 2, height: B * 2, rows: 2, size: Math.max(...sized.map((entry) => entry.size)), rtl: info.rtl, leadWidth: A * 2 };
	};

	// One line at a time round the edges of the frame, the middle left to the video.
	const layoutFrame = (lines, ctx, random, look) => {
		const places = lines.map((line) => ({
			x: 0, y: 0, z: 0, rot: 0,
			block: line.backing.length
				? layoutBlock(line, ctx, blockOptions(look, line, { size: ctx.F * 0.85 * boostOf(line), maxLength: ctx.W * 0.7 }))
				: frameBlock(line, ctx, blockOptions(look, line, { light: false }), random),
		}));
		const frames = places.map(() => ({ x: 0, y: 0, z: 0, roll: 0 }));
		return { places, frames, drift: { z: 40, roll: 0.5 }, solo: true };
	};

	// Lines along the left and right edges of the screen, stepping inward: upright for Korean, Japanese and Chinese.
	const layoutMargin = (lines, ctx, random, look) => {
		const first = random() < 0.5 ? 1 : -1;
		const places = lines.map((line, index) => {
			const side = index % 2 ? -first : first;
			const step = Math.floor(index / 2);
			if (standsUpright(line)) {
				const block = pillarBlock(line, ctx, blockOptions(look, line, { size: ctx.F * 0.62 * boostOf(line), light: false }));
				return { x: side * (ctx.W * 0.4 - step * ctx.F * 1.3 - block.width / 2), y: -ctx.H * 0.04, z: 0, rot: 0, block, upright: true };
			}
			const block = layoutBlock(line, ctx, blockOptions(look, line, { size: ctx.F * 0.62 * boostOf(line), maxLength: ctx.W * 0.42, align: side > 0 ? "right" : "left" }));
			return { x: side * Math.max(0, ctx.W * 0.44 - block.width / 2), y: -ctx.H * 0.3 + index * ctx.H * 0.17, z: 0, rot: 0, block };
		});
		const frames = places.map((place) => ({ x: place.x * 0.2, y: place.y * 0.3, z: 0, roll: 0 }));
		return { places, frames, drift: { z: 30, roll: 0.4 } };
	};

	// One line at a time with copies of it streaming across the screen in rows above and below (marquee bands).
	const layoutMarquee = (lines, ctx, random, look) => {
		const fills = [];
		const places = lines.map((line, index) => {
			const options = blockOptions(look, line, { light: false });
			const block = layoutBlock(line, ctx, { ...options, size: ctx.F * 1.05 * boostOf(line), maxLength: ctx.W * 0.8 });
			const info = ctx.typography[line.n] || DEFAULT_INFO;
			const spec = ctx.font(info.script, look.type, "display");
			const text = block.words.slice(0, line.words.length).map((word) => word.text).join(info.joined ? "" : " ");
			const size = block.size * 0.92;
			const copy = ctx.measure(text + "   ", size, spec);
			const pitch = Math.max(block.height / Math.max(1, block.rows), size * 1.08);
			const direction = random() < 0.5 ? 1 : -1;
			// Enough copies in a row to cover the screen wherever the row has slid to.
			const copies = Math.max(4, Math.ceil((ctx.W * 1.8) / Math.max(1, copy)) + 2);
			for (let row = 1; row * pitch < ctx.H * 0.62; row += 1) {
				for (const sign of [-1, 1]) {
					const y = sign * (block.height / 2 + (row - 0.5) * pitch + size * 0.08);
					fills.push({ text: (text + "   ").repeat(copies), spec, size, x: 0, y, z: 0, rot: 0, line: index, step: copy, speed: direction * (row % 2 ? 1 : -1) * (sign > 0 ? 1 : -1) * ctx.F * (1.1 + row * 0.25) });
				}
			}
			return { x: 0, y: 0, z: 0, rot: 0, block };
		});
		const frames = places.map(() => ({ x: 0, y: 0, z: 0, roll: 0 }));
		return { places, frames, drift: { z: 80, roll: 0.5 }, solo: true, fills };
	};

	/**
	 * The words of a line hung at different depths, each moved and sized so
	 * that from the line's camera (on the line's plane) the words line up into
	 * the line; when the camera moves they split apart in parallax.
	 */
	const anamorphize = (block, random) => {
		const words = block.words.map((word, index) => {
			const depth = index ? between(random, -760, 240) : between(random, -260, 120);
			const k = (PERSPECTIVE_PX - depth) / PERSPECTIVE_PX;
			return { ...word, x: word.x * k, y: word.y * k, size: word.size * k, width: word.width * k, z: depth };
		});
		return { ...block, words };
	};

	// Lines stacked like a column, their words hung in depth: they only read as lines from where the camera holds.
	const layoutAnamorph = (lines, ctx, random, look) => {
		const places = [];
		let y = 0;
		lines.forEach((line, index) => {
			const block = anamorphize(layoutBlock(line, ctx, blockOptions(look, line, { size: ctx.F * 0.95 * boostOf(line), maxLength: ctx.W * 0.66 })), random);
			if (index) y += places[index - 1].block.height / 2 + ctx.H * 0.24 + block.height / 2;
			places.push({ x: (index % 2 ? 1 : -1) * ctx.W * between(random, 0.04, 0.12), y, z: 0, rot: 0, block });
		});
		centerPlaces(places);
		const frames = places.map((place) => ({ x: place.x, y: place.y, z: 0, roll: 0 }));
		return { places, frames, drift: { z: 12, roll: 0.6 } };
	};

	// One short line at a time so large it runs off the screen; the view slides along it as it is sung (travelFrame).
	const layoutBleed = (lines, ctx, random, look) => {
		const places = lines.map((line) => {
			const options = blockOptions(look, line, { emphScale: 1.1, light: false });
			const block = layoutBlock(line, ctx, { ...options, size: ctx.H * 0.5, maxLength: Infinity });
			const travel = Math.max(0, (block.leadWidth - ctx.W * 0.9) / 2);
			// The frame holds a screenful of it.
			return { x: 0, y: 0, z: 0, rot: 0, block: { ...block, width: Math.min(block.width, ctx.W * 0.9), height: Math.min(block.height, ctx.H * 0.8) }, travel };
		});
		const frames = places.map(() => ({ x: 0, y: 0, z: 0, roll: 0 }));
		return { places, frames, drift: { z: 50, roll: 0.3 }, solo: true };
	};

	// Lines on a slanted grid of rules, each sliding along its rule into place (a Saul Bass title).
	const layoutRails = (lines, ctx, random, look) => {
		const side = (ctx.typography[lines[0].n] || DEFAULT_INFO).rtl ? -1 : 1;
		const places = [];
		let y = 0;
		lines.forEach((line, index) => {
			const block = layoutBlock(line, ctx, blockOptions(look, line, { size: ctx.F * 0.88 * boostOf(line), maxLength: ctx.W * 0.6, align: side > 0 ? "left" : "right" }));
			if (index) y += places[index - 1].block.height / 2 + ctx.F * 0.7 + block.height / 2;
			const x = side * (index % 3) * ctx.W * 0.09;
			places.push({ x, y, z: 0, rot: 0, block, slide: { x: 0, y: (index % 2 ? -1 : 1) * ctx.H * 0.42 } });
		});
		centerPlaces(places);
		const rails = new Set();
		for (const place of places) rails.add(Math.round(place.x - (side * place.block.width) / 2 - side * ctx.F * 0.3));
		for (let extra = -2; extra <= 2; extra += 1) rails.add(Math.round(extra * ctx.W * 0.16 + ctx.W * 0.05));
		const top = Math.min(...places.map((place) => place.y - place.block.height / 2)) - ctx.H * 0.5;
		const length = Math.max(...places.map((place) => place.y + place.block.height / 2)) + ctx.H * 0.5 - top;
		const strokes = [...rails].map((x) => ({ x, y: top, z: -4, length, rot: 90, stops: places.map(() => 1) }));
		const frames = places.map((place) => ({ x: place.x, y: place.y, z: 0, roll: 0 }));
		return { places, frames, drift: { z: 60, roll: 0.4 }, strokes, tilt: (random() < 0.5 ? 1 : -1) * between(random, 10, 14) };
	};

	// Compositions that show one line at a time: lines sung over each other cannot share them.
	const SOLO_LAYOUTS = new Set(["slot", "poster", "spread", "lockup", "flash", "fill", "seal", "frame", "marquee", "bleed"]);
	// Compositions that set any number of lines one after another (the others have a fixed number of places).
	const ROOMY_LAYOUTS = new Set(["column", "zigzag", "collage", "stairs", "strip", "rails", "chain"]);
	/** A line still sung when the next comes in (MotionLyricsDirector.singsInto: overlapping lines, or another voice singing on). */
	const singsInto = (line, next) => (root.ivLyricsMotionDirector?.singsInto
		? root.ivLyricsMotionDirector.singsInto(line, next)
		: !!line && !!next && next.start < line.end - 150);
	// Accents that still read on upright type.
	const UPRIGHT_ACCENTS = new Set(["color", "outline", "glow", "gradient", "extrude", "sticker", "giant", "script", "spark", "neon", "chrome"]);

	const LAYOUT_FNS = Object.freeze({
		column: layoutColumn,
		zigzag: layoutZigzag,
		spiral: layoutSpiral,
		wall: layoutWall,
		tunnel: layoutTunnel,
		collage: layoutCollage,
		hero: layoutHero,
		tower: layoutTower,
		stairs: layoutStairs,
		strip: layoutStrip,
		split: layoutSplit,
		swell: layoutSwell,
		radial: layoutRadial,
		carousel: layoutCarousel,
		reel: layoutReel,
		crawl: layoutCrawl,
		slot: layoutSlot,
		poster: layoutPoster,
		wordwall: layoutWordwall,
		arch: layoutArch,
		spread: layoutSpread,
		pillar: layoutPillar,
		wave: layoutWave,
		constellation: layoutConstellation,
		grid: layoutGrid,
		corners: layoutCorners,
		lockup: layoutLockup,
		flash: layoutFlash,
		chain: layoutChain,
		fill: layoutFill,
		seal: layoutSeal,
		frame: layoutFrame,
		margin: layoutMargin,
		marquee: layoutMarquee,
		anamorph: layoutAnamorph,
		bleed: layoutBleed,
		rails: layoutRails,
	});
	const BIG_MOTIFS = new Set(["ring", "halo", "sunburst", "spiral", "moon", "sun", "disc", "square", "flower", "star", "frame"]);
	const CALM_MOTIFS = new Set(["ring", "dot", "disc", "halo", "moon", "sun"]);

	/** Motifs around the lines and a giant outline word behind them. */
	const decorate = (board, ctx, random, shot, direction) => {
		const shapes = root.ivLyricsMotionShapes;
		const boxes = boxesOf(board.places);
		const extent = extentOf(boxes);
		const blocked = (x, y, radius) => boxes.some((box) => Math.abs(box.x - x) < box.w / 2 + radius * 0.55
			&& Math.abs(box.y - y) < box.h / 2 + radius * 0.55);
		const motifs = [];
		(shot.motifs || []).forEach((name, order) => {
			const parts = shapes?.motifOf?.(name, direction.shapes);
			if (!parts) return;
			const line = Math.floor(random() * board.places.length);
			if (order === 0 && BIG_MOTIFS.has(name) && random() < 0.45) {
				motifs.push({
					name, parts, line: null,
					x: extent.cx + between(random, -0.08, 0.08) * ctx.W,
					y: extent.cy + between(random, -0.06, 0.06) * ctx.H,
					z: -340,
					size: clamp(Math.max(extent.w, extent.h) * 0.78, ctx.F * 2.4, ctx.H * 0.95),
					rot: between(random, -20, 20),
					spin: between(random, -7, 7) * ctx.spin,
					accent: random() < 0.5,
					opacity: 0.2,
				});
				return;
			}
			const size = ctx.F * between(random, 0.42, 1.05);
			let spot = null;
			for (let attempt = 0; attempt < 16 && !spot; attempt += 1) {
				const box = boxes[attempt < 9 ? line : Math.floor(random() * boxes.length)];
				const sx = random() < 0.5 ? -1 : 1;
				const sy = random() < 0.5 ? -1 : 1;
				const x = box.x + sx * (box.w / 2 + size * between(random, 0.1, 0.7));
				const y = box.y + sy * (box.h / 2 + size * between(random, 0.05, 0.45));
				if (!blocked(x, y, size)) spot = { x, y };
			}
			if (!spot) return;
			motifs.push({
				name, parts, line,
				x: spot.x,
				y: spot.y,
				// At the depth of its line (tunnels and drums put lines at different depths).
				z: (board.places[line].z || 0) + between(random, -60, 40),
				size,
				rot: between(random, -30, 30),
				spin: between(random, -42, 42) * (CALM_MOTIFS.has(name) ? 0.25 : 1) * ctx.spin,
				accent: random() < 0.55,
				opacity: 0.94,
			});
		});
		let echo = null;
		if (shot.echo) {
			const script = typeLib()?.scriptOf?.(shot.echo, ctx.songLang) || "latin";
			const spec = ctx.font(script, board.type, "display");
			const text = casedText(shot.echo, script, board.upper);
			const vertical = board.layout === "zigzag" && random() < 0.5;
			const natural = Math.max(0.5, ctx.measure(text, 100, spec) / 100);
			const span = vertical ? Math.max(extent.h, ctx.H) * 1.05 : Math.max(extent.w, ctx.W) * 1.08;
			echo = {
				text,
				spec,
				x: extent.cx,
				y: extent.cy,
				z: -460,
				size: clamp(span / natural, ctx.F * 1.6, ctx.F * 5.5),
				rot: vertical ? 90 : between(random, -4, 4),
				drift: (random() < 0.5 ? -1 : 1) * ctx.W * between(random, 0.03, 0.07) * (ctx.tempo === "slow" ? 1.8 : 1),
			};
		}
		return { motifs, echo };
	};

	// ---------------------------------------------------------------------
	// The plan: boards in world space, the camera's path, the timeline
	// ---------------------------------------------------------------------

	const MOODS = Object.freeze({
		calm: { shake: 0.55, punch: 0.6 },
		dreamy: { shake: 0.5, punch: 0.5 },
		melancholic: { shake: 0.5, punch: 0.55 },
		warm: { shake: 0.8, punch: 0.9 },
		playful: { shake: 1, punch: 1 },
		energetic: { shake: 1.15, punch: 1.25 },
		intense: { shake: 1.35, punch: 1.45 },
		dark: { shake: 0.9, punch: 1.1 },
	});
	// How the song's tempo scales the camera: drift while a line is held, handheld shake, motif spin.
	const TEMPO_FEEL = Object.freeze({
		slow: { drift: 1.7, shake: 0.55, sway: 1.6, spin: 0.5, swing: 0.55 },
		mid: { drift: 1, shake: 1, sway: 1, spin: 1, swing: 1 },
		fast: { drift: 0.8, shake: 1.2, sway: 0.7, spin: 1.3, swing: 1.15 },
		rap: { drift: 0.7, shake: 1.35, sway: 0.6, spin: 1.4, swing: 1.2 },
	});
	const moodOf = (plan) => MOODS[plan?.mood] || MOODS.warm;
	const feelOf = (plan) => TEMPO_FEEL[plan?.tempo] || TEMPO_FEEL.mid;
	const toWorld = (board, x, y) => {
		const point = rotate2d(x, y, board.roll);
		return { x: board.origin.x + point.x, y: board.origin.y + point.y };
	};
	const nearestRoll = (roll, previous) => {
		let value = roll;
		while (value - previous > 180.001) value -= 360;
		while (previous - value > 180.001) value += 360;
		return value;
	};
	// Entrances that travel sideways, downwards, upwards, on a slant, through depth or stay put.
	const SIDEWAYS = new Set(["pan", "cut", "whip", "spin", "orbit", "panel", "hop"]);
	const DOWNWARDS = new Set(["drop", "flip", "tumble"]);
	const UPWARDS = new Set(["rise", "crane"]);
	// How far down a slanting entrance goes for every step sideways.
	const SLANTED = Object.freeze({ roll: 0.45, twist: 0.45, drift: 0.55, swoop: 0.85 });
	const IN_DEPTH = { push: -PUSH_DEPTH, through: -PUSH_DEPTH, pull: PULL_DEPTH, fade: -FADE_DEPTH, iris: -FADE_DEPTH, open: -FADE_DEPTH, corkscrew: -PUSH_DEPTH * 0.85 };
	const HARD_CUTS = new Set(["cut", "panel"]);
	// Entrances that change shot in place (a dissolve, or the next shot opening out of a circle or a band).
	const DISSOLVES = new Set(["fade", "iris", "open"]);
	const REVEALS = new Set(["iris", "open"]);
	// Moves eased evenly in and out (the others accelerate hard).
	const CUBIC_MOVES = new Set(["push", "pull", "through", "orbit", "tumble", "crane", "swoop", "corkscrew", "hop"]);
	// Compositions the camera pulls back from at the end, to show them whole.
	const REVEALED = new Set(["spiral", "radial", "carousel", "strip", "split", "constellation", "grid", "wave"]);
	const FORWARD = Object.freeze({ x: 0, y: 0, z: -1 });

	const toRadians = (degrees) => (degrees * Math.PI) / 180;
	const toDegrees = (radians) => (radians * 180) / Math.PI;

	/**
	 * How a line tilted in depth (place.tiltX / tiltY, on drums) faces the
	 * camera: the direction it looks in the camera's rolled frame, and the
	 * yaw and pitch that turn the camera to face it squarely.
	 */
	const facingOf = (place, turn) => {
		const tiltX = toRadians(place.tiltX || 0);
		const tiltY = toRadians(place.tiltY || 0);
		const normal = rotate2d(Math.cos(tiltX) * Math.sin(tiltY), -Math.sin(tiltX), -turn);
		const z = Math.cos(tiltX) * Math.cos(tiltY);
		return {
			normal: { x: normal.x, y: normal.y, z },
			yaw: toDegrees(Math.atan2(-normal.x, z)),
			pitch: toDegrees(Math.asin(clamp(normal.y, -1, 1))),
		};
	};

	/** Puts each board next to the last one, out of its way, in the direction its entrance moves. */
	const placeBoards = (boards, ctx, seed) => {
		const random = createRandom(seed ^ 0x51ED270B);
		let previousRoll = 0;
		boards.forEach((board, index) => {
			const firstFrame = board.frames[0];
			if (!index) {
				board.roll = -firstFrame.roll;
				board.origin = { x: 0, y: 0, z: 0 };
			} else {
				const previous = boards[index - 1];
				const last = previous.cameras[previous.cameras.length - 1];
				const theta = last.roll - previous.dutch;
				const enter = board.enter;
				const turn = enter === "roll" ? (random() < 0.5 ? 90 : -90)
					: enter === "flip" ? (random() < 0.5 ? 180 : -180)
						: enter === "twist" ? (random() < 0.5 ? 45 : -45) : 0;
				board.roll = theta + turn - firstFrame.roll;
				const right = rotate2d(1, 0, theta);
				const down = rotate2d(0, 1, theta);
				const sideways = random() < 0.5 ? 1 : -1;
				let direction = null;
				if (SIDEWAYS.has(enter)) direction = { x: right.x * sideways, y: right.y * sideways };
				else if (DOWNWARDS.has(enter)) direction = down;
				else if (UPWARDS.has(enter)) direction = { x: -down.x, y: -down.y };
				else if (SLANTED[enter]) {
					const x = right.x * sideways + down.x * SLANTED[enter];
					const y = right.y * sideways + down.y * SLANTED[enter];
					const length = Math.hypot(x, y);
					direction = { x: x / length, y: y / length };
				}
				const firstOffset = rotate2d(firstFrame.x, firstFrame.y, board.roll);
				let target;
				if (direction) {
					const ahead = Math.max(0, ...previous.corners.map((corner) => (corner.x - last.x) * direction.x + (corner.y - last.y) * direction.y));
					const behind = Math.max(0, ...board.localCorners.map((corner) => {
						const point = rotate2d(corner.x, corner.y, board.roll);
						return (firstOffset.x - point.x) * direction.x + (firstOffset.y - point.y) * direction.y;
					}));
					const gap = HARD_CUTS.has(enter) ? ctx.W * 1.6 : enter === "whip" || enter === "hop" ? ctx.W * 0.4 : ctx.W * 0.16;
					const distance = Math.max(ahead + behind + gap, ctx.W * 0.85);
					target = { x: last.x + direction.x * distance, y: last.y + direction.y * distance };
				} else {
					const spread = DISSOLVES.has(enter) ? 0.04 : 0.08;
					const side = rotate2d(between(random, -spread, spread) * ctx.W, between(random, -spread * 0.75, spread * 0.75) * ctx.H, theta);
					target = { x: last.x + side.x, y: last.y + side.y };
				}
				const depth = IN_DEPTH[enter] || 0;
				board.origin = { x: target.x - firstOffset.x, y: target.y - firstOffset.y, z: last.z - firstFrame.z + depth };
			}
			board.cameras = board.frames.map((frame, local) => {
				const point = toWorld(board, frame.x, frame.y);
				const roll = nearestRoll(board.roll + frame.roll + board.dutch, previousRoll);
				previousRoll = roll;
				// On drums the camera turns to face the line; push is the way it dollies in (world).
				const place = board.places[local];
				const facing = frame.face ? facingOf(place, frame.roll - place.rot + board.dutch) : null;
				const into = facing ? rotate2d(-facing.normal.x, -facing.normal.y, roll) : { x: 0, y: 0 };
				return {
					x: point.x,
					y: point.y,
					z: board.origin.z + frame.z,
					roll,
					yaw: facing ? facing.yaw : 0,
					pitch: facing ? facing.pitch : 0,
					push: { x: into.x, y: into.y, z: facing ? -facing.normal.z : -1 },
				};
			});
			board.corners = board.localCorners.map((corner) => toWorld(board, corner.x, corner.y));
			board.planeZ = board.origin.z + board.places.reduce((sum, place) => sum + place.z, 0) / board.places.length;
		});
	};

	/** Where the camera pulls back to show a whole board, keeping its roll (always behind where it was). */
	const revealPose = (board, camera, ctx) => {
		const roll = camera.roll;
		const local = board.corners.map((corner) => rotate2d(corner.x, corner.y, -roll));
		const xs = local.map((point) => point.x);
		const ys = local.map((point) => point.y);
		const width = Math.max(...xs) - Math.min(...xs);
		const height = Math.max(...ys) - Math.min(...ys);
		const center = rotate2d((Math.max(...xs) + Math.min(...xs)) / 2, (Math.max(...ys) + Math.min(...ys)) / 2, roll);
		const scale = clamp(Math.min((ctx.W * 0.88) / Math.max(1, width), (ctx.H * 0.82) / Math.max(1, height)), 0.34, 0.92);
		const z = board.layout === "tunnel" ? board.cameras[board.cameras.length - 1].z + 320 : board.planeZ + PERSPECTIVE_PX * (1 / scale - 1);
		return { x: center.x, y: center.y, z: Math.max(z, camera.z + 160), roll };
	};

	/**
	 * Where the camera holds while the line before is still being sung into
	 * this one on the same board (an echo, an answer, a duet): both lines in
	 * frame, pulled back when they need the room, turned as the new line
	 * reads and never closer than either line's own view.
	 */
	const sharedPose = (board, previous, line, ctx) => {
		const camera = line.camera;
		const roll = camera.roll;
		const local = [previous.place, line.place].flatMap(cornersOf).map((corner) => {
			const world = toWorld(board, corner.x, corner.y);
			return rotate2d(world.x, world.y, -roll);
		});
		const xs = local.map((point) => point.x);
		const ys = local.map((point) => point.y);
		const width = Math.max(...xs) - Math.min(...xs);
		const height = Math.max(...ys) - Math.min(...ys);
		const center = rotate2d((Math.max(...xs) + Math.min(...xs)) / 2, (Math.max(...ys) + Math.min(...ys)) / 2, roll);
		const scale = clamp(Math.min((ctx.W * 0.9) / Math.max(1, width), (ctx.H * 0.84) / Math.max(1, height)), 0.4, 1);
		const plane = Math.max(previous.worldZ, line.worldZ);
		const yaw = ((previous.camera.yaw || 0) + (camera.yaw || 0)) / 2;
		const pitch = ((previous.camera.pitch || 0) + (camera.pitch || 0)) / 2;
		return {
			x: center.x,
			y: center.y,
			z: Math.max(camera.z, previous.camera.z, plane + PERSPECTIVE_PX * (1 / scale - 1)),
			roll,
			yaw,
			pitch,
			faceYaw: yaw,
			facePitch: pitch,
		};
	};

	/** How far a roll turns the picture from upright: 0 upright, 90 on its side, 180 upside down. */
	const tiltOf = (roll) => {
		const turn = ((roll % 360) + 360) % 360;
		return Math.min(turn, 360 - turn);
	};

	/**
	 * How the background is turned against the camera over the song (a list of
	 * turns of its offset from the camera's roll). While the camera moves the
	 * offset holds, so the video turns over with every roll, flip and barrel
	 * roll; it changes only while a line is held: turned upside down the video
	 * rights itself UPSIDE_HOLD_MS after the camera has landed, on its side
	 * after SIDEWAYS_HOLD_MS, and when the camera turns back upright the video
	 * comes back with it during that move. So the video is seen to turn but is
	 * never left turned.
	 */
	const uprightsOf = (lines) => {
		const turns = [];
		let offset = 0;
		let sidewaysSince = null;
		lines.forEach((line, index) => {
			const roll = line.camera.roll;
			const previous = lines[index - 1];
			const moveStart = previous && Number.isFinite(previous.leave) ? Math.min(previous.leave, line.arrive) : line.arrive;
			const bg = roll + offset;
			if (tiltOf(roll) <= 45) {
				sidewaysSince = null;
				const level = Math.round(offset / 360) * 360;
				if (Math.abs(level - offset) > 0.5) {
					turns.push({ from: moveStart, until: Math.max(line.arrive, moveStart + 400), offsetFrom: offset, offsetTo: level });
					offset = level;
				}
				return;
			}
			const tilt = tiltOf(bg);
			if (tilt <= 45) {
				sidewaysSince = null;
				return;
			}
			if (tilt <= 135 && sidewaysSince === null) sidewaysSince = line.arrive;
			const from = tilt > 135 ? line.arrive + UPSIDE_HOLD_MS : Math.max(line.arrive + UPSIDE_HOLD_MS, sidewaysSince + SIDEWAYS_HOLD_MS);
			const leave = Number.isFinite(line.leave) ? line.leave : Infinity;
			// Not enough of the line left: the camera moves on first and the next line decides.
			if (leave - from < 500) return;
			const offsetTo = offset + Math.round(bg / 360) * 360 - bg;
			turns.push({ from, until: Math.min(from + (tilt > 135 ? UPSIDE_TURN_MS : UPRIGHT_TURN_MS), leave), offsetFrom: offset, offsetTo });
			offset = offsetTo;
			sidewaysSince = null;
		});
		return turns;
	};

	/** The background's turn against the camera's roll at a time (degrees; 0 before any turn or without a time). */
	const uprightAt = (plan, time) => {
		if (!Number.isFinite(time)) return 0;
		let offset = 0;
		for (const turn of plan?.uprights || []) {
			if (turn.from > time) break;
			offset = time >= turn.until ? turn.offsetTo : turn.offsetFrom + (turn.offsetTo - turn.offsetFrom) * easeInOutCubic(clamp01((time - turn.from) / Math.max(1, turn.until - turn.from)));
		}
		return offset;
	};
	const moveDuration = (type, gap, pace) => {
		switch (type) {
			case "line": return clamp((gap + 260) * pace, 300 * Math.min(1, pace), 760 * pace);
			case "cut": return 1;
			case "whip": return clamp((gap + 200) * 0.55 * pace, 260, 520);
			case "panel": return clamp((gap + 300) * pace, 560, 900);
			case "fade": case "iris": case "open": return clamp((gap + 700) * pace, 800, 1800 * pace);
			case "roll":
			case "flip":
			case "spin":
			case "orbit":
			case "tumble":
			case "twist":
			case "crane":
			case "swoop": return clamp((gap + 420) * pace, 560, 1150 * pace) * 1.15;
			case "through":
			case "corkscrew": return clamp((gap + 420) * pace, 620, 1250 * pace) * 1.2;
			case "drift": return clamp((gap + 640) * pace, 720, 1500 * pace);
			case "hop": return clamp((gap + 420) * pace, 640, 1250 * pace) * 1.1;
			default: return clamp((gap + 420) * pace, 520, 1150 * pace);
		}
	};

	/** An interlude after a line: when it fades, when the lyrics return, and the camera's drift meanwhile. */
	const restOf = (line, start, end, feel) => {
		const seed = hashString(line.text + "\u0001" + line.n);
		const sign = seed & 1 ? 1 : -1;
		return {
			start,
			end,
			roll: sign * (7 + (seed % 7)) * feel.swing,
			yaw: -sign * (4 + ((seed >>> 3) % 4)),
			pitch: ((seed >>> 5) & 1 ? 1 : -1) * 2.5,
			zoom: 220 + ((seed >>> 7) % 120),
		};
	};

	// The line the camera holds keeps inside this share of the screen (each
	// side of the centre) even when the camera has eased all the way in on it.
	const HOLD_ROOM_X = 0.46;
	const HOLD_ROOM_Y = 0.44;

	/**
	 * Keeps a held line whole on screen: the camera eases in on it (drift)
	 * only as far as its ends stay in frame, and a line already too large for
	 * the screen (a long line on a narrow window) is seen from further back.
	 * Lines the camera turns to face (on a drum) keep their own framing.
	 */
	const fitHold = (line, board, ctx) => {
		const camera = line.camera;
		if (camera.yaw || camera.pitch) return;
		let reachX = 0;
		let reachY = 0;
		for (const corner of cornersOf(line.place)) {
			const world = toWorld(board, corner.x, corner.y);
			const seen = rotate2d(world.x - camera.x, world.y - camera.y, -camera.roll);
			reachX = Math.max(reachX, Math.abs(seen.x));
			reachY = Math.max(reachY, Math.abs(seen.y));
		}
		if (!(reachX > 0 && reachY > 0)) return;
		const largest = Math.min((ctx.W * HOLD_ROOM_X) / reachX, (ctx.H * HOLD_ROOM_Y) / reachY);
		// Depth in front of the camera that shows the line at that scale (CSS perspective).
		const deepest = PERSPECTIVE_PX * (1 - 1 / largest);
		const depth = line.worldZ - camera.z;
		if (depth > deepest) {
			camera.z = line.worldZ - deepest;
			line.drift.z = 0;
			return;
		}
		line.drift.z = Math.min(line.drift.z, deepest - depth);
	};

	const timeline = (plan, ctx) => {
		const { boards, lines } = plan;
		const pace = ctx.pace;
		const feel = feelOf(plan);
		lines.forEach((line) => {
			const board = boards[line.board];
			line.local = line.n - board.first;
			line.camera = board.cameras[line.local];
			line.place = board.places[line.local];
			line.worldZ = board.origin.z + line.place.z;
			const center = toWorld(board, line.place.x, line.place.y);
			line.center = { x: center.x, y: center.y, z: line.worldZ };
			line.arrive = line.start - ARRIVE_LEAD_MS;
			// Every voice's last word: the camera waits for an echo or an answer when it has the time.
			line.lastWordStart = Math.max(...line.shown.map((word) => word.start));
			line.drift = { z: board.drift.z * feel.drift, roll: board.drift.roll * feel.drift };
			fitHold(line, board, ctx);
		});
		boards.forEach((board) => {
			for (const motif of board.motifs) {
				const point = toWorld(board, motif.x, motif.y);
				motif.center = { x: point.x, y: point.y, z: board.origin.z + motif.z };
			}
		});
		const hardCut = (type) => type === "cut" || type === "panel";
		lines.forEach((line, index) => {
			const next = lines[index + 1];
			if (!next) {
				line.leave = Infinity;
				line.move = null;
				line.outro = line.end + 1600;
				line.rest = restOf(line, line.end + OUTRO_REST_MS * clamp(pace, 0.85, 1.25), Infinity, feel);
				return;
			}
			const sameBoard = next.board === line.board;
			const type = sameBoard ? "line" : boards[next.board].enter;
			const gap = next.start - line.end;
			const duration = moveDuration(type, gap, pace);
			let leave = Math.max(next.arrive - duration, line.lastWordStart + 140);
			if (type !== "cut" && next.arrive - leave < 220) leave = next.arrive - 220;
			leave = type === "cut" ? next.arrive - 1 : leave;
			line.leave = Math.max(leave, line.arrive + 60);
			const dx = next.camera.x - line.camera.x;
			const dy = next.camera.y - line.camera.y;
			const distance = Math.hypot(dx, dy);
			// The travel seen on screen, for the direction of 3D swings.
			const seen = rotate2d(dx, dy, -line.camera.roll);
			const sx = Math.sign(seen.x) || 1;
			const sy = Math.sign(seen.y) || 1;
			const swing = { yaw: 0, pitch: 0 };
			if (type === "orbit") swing.yaw = 72 * sx;
			else if (type === "tumble") swing.pitch = -62 * sy;
			else if (type === "whip") swing.yaw = 20 * sx;
			else if (type === "crane") swing.pitch = -34 * sy;
			else if (type === "swoop") {
				// Down and round: the camera banks into the turn.
				swing.yaw = 38 * sx;
				swing.pitch = -24 * sy;
			} else if (type === "drift") swing.yaw = 7 * sx;
			else if (type === "hop") swing.yaw = 10 * sx;
			else if (!sameBoard && !hardCut(type) && !DISSOLVES.has(type) && type !== "corkscrew") {
				// Every board move swings a little in depth.
				if (Math.abs(seen.x) >= Math.abs(seen.y)) swing.yaw = 14 * sx;
				else swing.pitch = -11 * sy;
			} else if (sameBoard) swing.yaw = 4 * sx;
			swing.yaw *= feel.swing;
			swing.pitch *= feel.swing;
			line.move = {
				type,
				swing,
				extraRoll: type === "spin" || type === "corkscrew" ? (sx > 0 ? 360 : -360) : 0,
				arc: type === "line" ? clamp(distance * 0.1, 20, 150)
					: type === "push" || type === "pull" || type === "corkscrew" || hardCut(type) ? 0
						: DISSOLVES.has(type) ? 0
							: type === "orbit" ? clamp(distance * 0.4, 300, 1300)
								// A hop leaps back to see both boards on its way; a crane lifts; a drift barely leaves the plane.
								: type === "hop" ? clamp(distance * 0.75, 520, 1500)
									: type === "crane" ? clamp(distance * 0.45, 300, 1100)
										: type === "drift" ? clamp(distance * 0.12, 60, 260)
											: clamp(distance * 0.3, 160, 950),
				cutAt: type === "panel" ? (line.leave + next.arrive) / 2 : type === "cut" ? next.arrive : null,
				// Through: the camera dives into the last sung word on its way.
				waypoint: type === "through" ? (() => {
					const word = line.place.block.words[line.words.length - 1];
					const point = rotate2d(word.x, word.y, line.place.rot);
					const world = toWorld(boards[line.board], line.place.x + point.x, line.place.y + point.y);
					return { x: world.x, y: world.y };
				})() : null,
			};
			const board = boards[line.board];
			const room = line.leave - (line.end + 250);
			if (gap >= LONG_GAP_MS
				|| (!sameBoard && board.layout === "wall" && room >= 900)
				|| (!sameBoard && REVEALED.has(board.layout) && room >= 1200)) {
				line.reveal = { start: line.end + (gap >= LONG_GAP_MS ? 700 : 250), end: line.leave, pose: revealPose(board, line.camera, ctx) };
			}
			if (gap >= REST_GAP_MS) {
				const start = line.end + REST_AFTER_MS * clamp(pace, 0.85, 1.25);
				// The lyrics come back when the next board's preview would start.
				const end = line.leave - BOARD_PREVIEW_MS * Math.min(1.3, pace);
				if (end - (start + REST_FADE_MS) >= REST_MIN_MS) {
					line.rest = restOf(line, start, end, feel);
					if (sameBoard) board.rests.push(line.rest);
				}
			}
		});
		// A line still sung into the next one on its board keeps both in frame until its last voice ends.
		lines.forEach((line, index) => {
			const previous = lines[index - 1];
			if (!previous || previous.board !== line.board || boards[line.board].solo || !singsInto(previous, line)) return;
			line.share = { pose: sharedPose(boards[line.board], previous, line, ctx), until: previous.end + 120 };
		});
		boards.forEach((board, index) => {
			const first = lines[board.first];
			const into = index ? lines[board.first - 1] : null;
			if (!index) {
				board.appear = first.arrive - INTRO_MS - 300;
			} else if (board.enter === "cut") {
				board.appear = first.arrive - 60;
			} else if (board.enter === "panel") {
				board.appear = into.move.cutAt - 40;
			} else if (DISSOLVES.has(board.enter)) {
				// A dissolve: the new board fades in while the camera eases into it.
				board.appear = into.leave - 100;
			} else {
				board.appear = Math.min(into.leave - 120, Math.max(into.start, into.leave - BOARD_PREVIEW_MS * Math.min(1.3, pace)));
			}
			const next = boards[index + 1];
			if (!next) {
				const rest = lines[board.last].rest;
				board.fadeAt = rest ? rest.start : Infinity;
				board.fadeEnd = rest ? rest.start + REST_FADE_MS : Infinity;
				return;
			}
			const nextFirst = lines[next.first];
			const out = lines[next.first - 1];
			if (next.enter === "cut") {
				board.fadeAt = nextFirst.arrive - 80;
				board.fadeEnd = nextFirst.arrive + 40;
			} else if (next.enter === "panel") {
				board.fadeAt = out.move.cutAt - 60;
				board.fadeEnd = out.move.cutAt + 20;
			} else if (DISSOLVES.has(next.enter)) {
				board.fadeAt = out.leave;
				board.fadeEnd = nextFirst.arrive - 40;
			} else {
				board.fadeAt = nextFirst.arrive + BOARD_LINGER_MS * Math.min(1.5, pace);
				board.fadeEnd = board.fadeAt + BOARD_FADE_MS * Math.min(1.5, pace);
			}
			if (out.rest) {
				// An interlude: the board leaves with its last word, not with the next board.
				board.fadeAt = Math.min(board.fadeAt, out.rest.start);
				board.fadeEnd = Math.min(board.fadeEnd, out.rest.start + REST_FADE_MS);
			}
		});
		// When each line peeks in, dims and leaves (lifeLevels, paintWords).
		lines.forEach((line, index) => {
			const board = boards[line.board];
			let next = lines[index + 1];
			// A line set word by word builds up: its words stay until the line after it comes in.
			if (line.split === "word" && line.parts > 1) {
				let after = index + 1;
				while (lines[after] && lines[after].source === line.source) after += 1;
				next = lines[after];
			}
			line.peekAt = line.local ? line.arrive - PEEK_MS * clamp(pace, 0.85, 1.3) : board.appear;
			line.voicesEnd = Math.max(line.end, ...line.shown.map((word) => word.end));
			line.exitStagger = Math.min(70, 280 / Math.max(1, line.shown.length));
			line.exitLength = EXIT_MS * fxPaceOf(pace) * (EXIT_LENGTH[board.exit] || 1);
			line.exitSpan = line.exitLength + line.exitStagger * Math.max(0, line.shown.length - 1);
			// One line at a time: a line stays until the next one on its board (even the next piece of the
			// same line) can be read, crossfading into it, so the screen is never empty between them.
			// (Letters that decode or rain in show before their word: the line before has gone by then.)
			const following = lines[index + 1];
			line.soloOut = Infinity;
			line.soloFade = 120;
			if (board.solo && following && following.board === line.board) {
				if (following.fx === "decode" || following.fx === "rain") line.soloOut = following.start - 360;
				else {
					const first = following.words[0];
					const reads = Math.min((READS_AFTER[following.fx] ?? 70) * fxPaceOf(pace), Math.max(60, (first.end - first.start) * 0.75));
					line.soloOut = Math.max(line.lastWordStart + 120, following.start - 50);
					line.soloFade = Math.max(120, following.start + reads - line.soloOut);
				}
				// It leaves with the shot's exit, quickly, as the next one comes in in its place.
				line.exitStagger = Math.min(22, 90 / Math.max(1, line.shown.length));
				line.exitLength = clamp(line.soloFade + 160, 260, 400);
				line.exitSpan = line.exitLength + line.exitStagger * Math.max(0, line.shown.length - 1);
			}
			if (!next || next.board !== line.board || board.preview || board.solo) {
				// The last line of a board leaves with the board.
				line.dimAt = Infinity;
				line.exitAt = Number.isFinite(line.soloOut) ? line.soloOut : Infinity;
				return;
			}
			line.dimAt = Math.max(next.start, line.voicesEnd + 60);
			line.exitAt = Math.max(next.start + clamp((next.end - next.start) * 0.4, 300, 1300), line.voicesEnd + 220);
			// The words of a line set word by word leave one after another, in the order they came.
			if (line.split === "word" && line.parts > 1) line.exitAt += line.part * Math.min(70, 280 / line.parts);
		});
		plan.flashes = [];
		plan.panels = [];
		plan.uprights = uprightsOf(lines);
		// Colour fields (posters): one per line, opening from a band and cutting from colour to colour.
		plan.floods = [];
		lines.forEach((line) => {
			if (!line.place.flood) return;
			const board = boards[line.board];
			const next = lines[line.n + 1];
			const start = line.local ? line.arrive - 40 : Math.max(board.appear + 60, line.arrive - 260);
			let end = next && next.board === line.board ? next.arrive - 40 : Number.isFinite(line.leave) ? line.leave + 80 : line.end + 2600;
			if (line.rest) end = Math.min(end, line.rest.start + 320);
			if (end > start) plan.floods.push({ start, end, color: line.place.flood });
		});
		lines.forEach((line) => {
			const type = line.move?.type;
			if (type === "cut") plan.flashes.push({ time: line.move.cutAt, strength: 0.6 });
			if (type === "through") plan.flashes.push({ time: (line.leave + lines[line.n + 1].arrive) / 2, strength: 0.32 });
			if (type === "panel") plan.panels.push({ start: line.leave, end: lines[line.n + 1].arrive, color: boards[lines[line.n + 1].board].color });
		});
		plan.flashes.sort((left, right) => left.time - right.time);
		plan.bars = boards.filter((board) => board.bars).map((board) => ({
			start: lines[board.first].arrive - 500,
			end: Number.isFinite(lines[board.last].leave) ? lines[board.last].leave + 200 : Infinity,
		}));
		const slams = [];
		lines.forEach((line) => {
			if (line.fx !== "slam" && line.fx !== "zoom") return;
			// The camera takes the hit on the line's first word and its emphasised ones, not on every word.
			line.words.forEach((word, index) => {
				if (index && !line.emph.has(index)) return;
				slams.push({ time: word.start, strength: (line.emph.has(index) ? 12 : 6) * (line.fx === "zoom" ? 0.5 : 1) });
			});
		});
		plan.slams = slams.sort((left, right) => left.time - right.time);
	};

	// ---------------------------------------------------------------------
	// Interludes: the intro, instrumental breaks and the outro
	// ---------------------------------------------------------------------

	// While no lyrics are on screen (the board has faded) the screen plays a
	// scene of its own over the video, never the lyrics: the song's title
	// card (intro and outro) or one of these (paintInterludes):
	// pulse = rings bursting from the centre on the beat; eq = equalizer bars;
	// marquee = the title in huge rows sliding across; orbit = the song's
	// motifs orbiting; stripes = diagonal colour bands sweeping past a
	// breathing frame; grid = a neon grid floor rushing at the camera;
	// count = big numbers counting down to the lyrics; wave = oscilloscope waves.
	const INTERLUDE_STYLES = Object.freeze(["pulse", "eq", "marquee", "orbit", "stripes", "grid", "count", "wave"]);
	// Which scenes suit a song's mood (the AI may name one per shot: shot.interlude).
	const INTERLUDE_WEIGHTS = Object.freeze({
		calm: { wave: 1.4, orbit: 1.2, pulse: 1, marquee: 0.6, count: 0.5, stripes: 0.3, eq: 0.3, grid: 0.1 },
		dreamy: { orbit: 1.4, wave: 1.3, pulse: 1, marquee: 0.6, stripes: 0.4, count: 0.4, eq: 0.3, grid: 0.3 },
		melancholic: { wave: 1.4, pulse: 1.1, orbit: 0.8, marquee: 0.7, count: 0.5, eq: 0.3, stripes: 0.2, grid: 0.1 },
		warm: { orbit: 1.1, wave: 1, pulse: 1, marquee: 0.9, stripes: 0.7, count: 0.6, eq: 0.6, grid: 0.3 },
		playful: { orbit: 1.3, stripes: 1.3, marquee: 1.1, count: 0.9, eq: 0.8, pulse: 0.7, wave: 0.5, grid: 0.5 },
		energetic: { eq: 1.3, stripes: 1.2, grid: 1.1, count: 1, marquee: 1, pulse: 0.9, orbit: 0.6, wave: 0.4 },
		intense: { eq: 1.3, grid: 1.2, count: 1.1, stripes: 1, pulse: 1, marquee: 0.8, wave: 0.4, orbit: 0.4 },
		dark: { grid: 1.3, pulse: 1.1, wave: 1, eq: 1, count: 0.9, marquee: 0.7, stripes: 0.5, orbit: 0.4 },
	});
	// Stretches shorter than this are left to the video; one longer than SCENE_MAX_MS plays several scenes.
	const INTERLUDE_MIN_MS = 2400;
	const SCENE_MAX_MS = 9500;
	const SCENE_FADE_MS = 520;
	// A long intro opens on the title card for this long; the outro's end card holds this long.
	const TITLE_CARD_MS = 6500;
	const END_CARD_MS = 9000;
	// The beats counted in (cue dots) before the lyrics come back.
	const CUE_BEATS = 3;
	const DEFAULT_BPM = Object.freeze({ slow: 74, mid: 100, fast: 128, rap: 92 });
	// What an orbit sends round when the direction names no motifs, by mood.
	const ORBIT_MOTIFS = Object.freeze({
		calm: ["moon", "sparkle", "ring", "dot"],
		dreamy: ["sparkle", "moon", "cloud", "halo"],
		melancholic: ["drop", "moon", "ring", "dot"],
		warm: ["sun", "heart", "sparkle", "ring"],
		playful: ["star", "heart", "flower", "sparkle"],
		energetic: ["bolt", "star", "burst", "zigzag"],
		intense: ["bolt", "flame", "cross", "burst"],
		dark: ["eye", "moon", "cross", "spiral"],
	});

	const pickWeighted = (random, table) => {
		const entries = Object.entries(table).filter(([, weight]) => weight > 0);
		const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
		let roll = random() * total;
		for (const [name, weight] of entries) {
			roll -= weight;
			if (roll <= 0) return name;
		}
		return entries[entries.length - 1]?.[0] || null;
	};

	/**
	 * The song's title as the interludes set it: in the display face of its
	 * script (capitals where the script has them), the card's size, and the
	 * marquee's repeated row with its width.
	 */
	const titleSetOf = (title, artist, ctx) => {
		const name = String(title ?? "").trim();
		if (!name) return null;
		const by = String(artist ?? "").trim();
		const main = ctx.typography.find(Boolean)?.script || "latin";
		const script = typeLib()?.scriptOf?.(name, ctx.songLang, main) || main;
		const spec = ctx.font(script, "impact", "display");
		const cased = casedText(name, script, true);
		const natural = Math.max(1, ctx.measure(cased, 100, spec)) / 100;
		const size = clamp(Math.min(ctx.H * 0.23, (ctx.W * 0.84) / natural), Math.min(ctx.F * 0.8, ctx.H * 0.2), ctx.H * 0.24);
		const artistSpec = ctx.font(typeLib()?.scriptOf?.(by, ctx.songLang, main) || main, "impact", "light");
		const unit = cased + (by ? "  \u00b7  " + casedText(by, script, true) : "") + "  \u00b7  ";
		const rowSize = ctx.H * 0.17;
		return { title: cased, artist: by, spec, artistSpec, size, unit, rowSize, unitWidth: Math.max(ctx.W * 0.25, ctx.measure(unit, rowSize, spec)) };
	};

	/**
	 * The scenes the stretches without lyrics play: the intro (a title card,
	 * then scenes if it is long), each instrumental break (a scene per
	 * SCENE_MAX_MS, never the same twice running) and the outro (an end
	 * card). Each knows when the lyrics come back (cue), for the count and
	 * the cue dots. Pure: the same plan gives the same scenes.
	 */
	const interludesOf = (plan, ctx, direction, options = {}) => {
		const { lines, boards } = plan;
		if (!lines.length) return [];
		const random = createRandom(((Number(options.seed) >>> 0) || 1) ^ 0x51ed27);
		const weights = INTERLUDE_WEIGHTS[plan.mood] || INTERLUDE_WEIGHTS.warm;
		const titled = titleSetOf(options.title, options.artist, ctx);
		const named = [...new Set((direction?.shots || []).flatMap((shot) => (Array.isArray(shot.motifs) ? shot.motifs : [])))]
			.filter((name) => shapesLib()?.motifOf?.(name));
		const motifs = (named.length >= 2 ? named : [...named, ...(ORBIT_MOTIFS[plan.mood] || ORBIT_MOTIFS.warm)]).slice(0, 5);
		const beat = 60000 / clamp(Number(direction?.tempo?.bpm) || DEFAULT_BPM[plan.tempo] || 100, 60, 190);
		const windows = [];
		const first = lines[0];
		// A scene plays on until shortly before the lyrics come in (over the faint preview of the next board), so the screen is never left waiting.
		const until = (shown, next) => Math.max(shown, Math.min(next - 450, shown + 1800));
		const introEnd = until(boards[first.board].appear + 400, first.start);
		if (introEnd >= INTERLUDE_MIN_MS) windows.push({ kind: "intro", start: 0, end: introEnd, cue: first.start, wanted: null });
		lines.forEach((line, index) => {
			const rest = line.rest;
			if (!rest) return;
			const wanted = boards[line.board]?.interlude || null;
			const next = lines[index + 1];
			if (Number.isFinite(rest.end)) windows.push({ kind: "break", start: rest.start + 250, end: next ? until(rest.end + 300, next.start) : rest.end + 300, cue: next?.start ?? null, wanted });
			else windows.push({ kind: "outro", start: rest.start + 300, end: rest.start + 300 + END_CARD_MS, cue: null, wanted });
		});
		const scenes = [];
		let previous = null;
		const pick = (wanted, counts) => {
			const usable = (name) => INTERLUDE_STYLES.includes(name) && name !== previous && (name !== "marquee" || titled) && (name !== "count" || counts);
			if (usable(wanted)) return wanted;
			const table = {};
			for (const name of INTERLUDE_STYLES) if (usable(name)) table[name] = weights[name] || 0.3;
			return pickWeighted(random, table) || "pulse";
		};
		for (const window of windows) {
			if (window.end - window.start < INTERLUDE_MIN_MS) continue;
			const parts = [];
			let at = window.start;
			if (titled && (window.kind === "intro" || window.kind === "outro")) {
				const length = window.kind === "outro" || window.end - window.start <= SCENE_MAX_MS ? window.end - window.start : TITLE_CARD_MS;
				parts.push({ style: "title", start: at, end: at + length });
				at += length;
			}
			const left = window.end - at;
			if (left >= INTERLUDE_MIN_MS) {
				const count = Math.max(1, Math.round(left / SCENE_MAX_MS));
				for (let part = 0; part < count; part += 1) parts.push({ style: null, start: at + (left * part) / count, end: at + (left * (part + 1)) / count });
			} else if (parts.length) parts[parts.length - 1].end = window.end;
			parts.forEach((part, order) => {
				const last = order === parts.length - 1;
				const cue = last && Number.isFinite(window.cue) ? window.cue : null;
				const style = part.style || pick(order === parts.length - 1 || order === 0 ? window.wanted : null, cue !== null);
				previous = style;
				scenes.push({
					index: scenes.length,
					kind: window.kind,
					style,
					start: part.start,
					end: part.end,
					cue,
					beat,
					seed: (random() * 0xffffffff) >>> 0,
					motifs,
					title: titled,
				});
			});
		}
		return scenes;
	};

	/** The cue dots before lyrics come back after an interlude: when each lights (one a beat) and when they go. */
	const cuesOf = (scenes) => scenes.filter((scene) => scene.cue !== null).map((scene) => {
		const step = clamp(scene.beat, 380, 900);
		return { at: scene.cue, step, from: scene.cue - CUE_BEATS * step - 360 };
	});

	// ---------------------------------------------------------------------
	// Pieces: a lyric line need not reach the screen all at once
	// ---------------------------------------------------------------------

	// How a shot breaks its lines into pieces, each set, timed and left on its own:
	// "line" keeps short lines whole (a long line is still broken into phrases),
	// "phrase" breaks every line of more than a few words into short phrases,
	// "word" sets every word on its own (the words of a line stay until the next line).
	const SPLIT_MODES = new Set(["line", "phrase", "word"]);
	const PIECE_RULES = Object.freeze({
		// A line heavier than "most" units (or with more words) is broken into pieces of about "target" units.
		line: { most: 26, words: 8, target: 16 },
		phrase: { most: 13, words: 4, target: 12 },
	});
	const WIDE_RE = /[\p{Script=Han}\p{Script=Hangul}\p{Script=Hiragana}\p{Script=Katakana}]/u;
	const BREAK_AFTER_RE = /[,.;:!?、。，．！？；：…]["'”’」』)]*$/u;
	const PARTICLE_RE = /^[\p{Script=Hiragana}ー]{1,2}$/u;
	const PUNCTUATION_RE = /^[\p{P}\p{S}\s]+$/u;

	/** How much room a text takes: a Latin letter counts one, a Korean, Japanese or Chinese character nearly two. */
	const unitsOf = (text) => {
		let units = 0;
		for (const grapheme of graphemesOf(text)) {
			if (/\s/u.test(grapheme)) continue;
			units += WIDE_RE.test(grapheme) ? 1.8 : 1;
		}
		return units;
	};

	/**
	 * The pieces a line is set in, as [first word, last word] ranges. Phrases
	 * break where the line breaks itself (punctuation, a breath between words)
	 * into pieces of about the same size, never ending on a little word.
	 */
	const piecesOf = (line, mode = "line") => {
		const words = line.words;
		const count = words.length;
		if (count < 2) return [[0, Math.max(0, count - 1)]];
		if (mode === "word") {
			const pieces = [];
			words.forEach((word, index) => {
				const text = String(word.text ?? "").trim();
				// Punctuation, and a Japanese particle run on from its word, stay with the word before.
				const tagAlong = index > 0 && (PUNCTUATION_RE.test(text) || (word.joined && PARTICLE_RE.test(text)));
				if (tagAlong) pieces[pieces.length - 1][1] = index;
				else pieces.push([index, index]);
			});
			return pieces;
		}
		const rule = PIECE_RULES[mode] || PIECE_RULES.line;
		const weights = words.map((word) => Math.max(0.6, unitsOf(word.text)));
		const total = weights.reduce((sum, value) => sum + value, 0);
		if (total <= rule.most && count < rule.words) return [[0, count - 1]];
		const parts = clamp(Math.max(Math.ceil(total / rule.target), Math.ceil(count / (mode === "phrase" ? 3 : 5))), 2, count);
		const even = total / parts;
		const prefix = [0];
		weights.forEach((value, index) => prefix.push(prefix[index] + value));
		/** What breaking after word b costs (negative where the line breaks itself). */
		const breakCost = (b) => {
			const text = String(words[b].text ?? "");
			const gap = words[b + 1].start - words[b].end;
			let cost = 0;
			if (BREAK_AFTER_RE.test(text)) cost -= 0.7;
			if (gap >= 350) cost -= 0.55;
			else if (gap >= 150) cost -= 0.25;
			if (SMALL_WORDS.has(text.toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, ""))) cost += 0.45;
			// Japanese and Chinese runs break on their particles rather than inside a compound.
			if (words[b + 1].joined && !PARTICLE_RE.test(text)) cost += 0.15;
			if (PUNCTUATION_RE.test(String(words[b + 1].text ?? "").trim())) cost += 2;
			return cost;
		};
		const pieceCost = (from, to) => {
			const weight = prefix[to + 1] - prefix[from];
			const off = (weight - even) / even;
			return off * off * 1.4 + (from === to && unitsOf(words[from].text) <= 2 ? 0.5 : 0);
		};
		// best[m][j]: the cheapest way to set words 0..j-1 in m pieces.
		const best = Array.from({ length: parts + 1 }, () => new Array(count + 1).fill(Infinity));
		const from = Array.from({ length: parts + 1 }, () => new Array(count + 1).fill(-1));
		best[0][0] = 0;
		for (let m = 1; m <= parts; m += 1) {
			for (let j = m; j <= count; j += 1) {
				for (let i = m - 1; i < j; i += 1) {
					if (!Number.isFinite(best[m - 1][i])) continue;
					const cost = best[m - 1][i] + pieceCost(i, j - 1) + (i > 0 ? breakCost(i - 1) : 0);
					if (cost < best[m][j]) {
						best[m][j] = cost;
						from[m][j] = i;
					}
				}
			}
		}
		const pieces = [];
		for (let m = parts, j = count; m > 0; m -= 1) {
			const i = from[m][j];
			pieces.unshift([i, j - 1]);
			j = i;
		}
		return pieces;
	};

	/**
	 * The song as it reaches the screen: each line broken into the pieces its
	 * shot asks for, with the direction (shots, emphasised words, line
	 * effects) and the typography carried over to the pieces. A shot with more
	 * pieces than its composition holds goes on in the next board. Pieces keep
	 * their line's index (its translation) and know their line (source).
	 */
	const expandPieces = (model, direction, typography) => {
		const shots = Array.isArray(direction?.shots) ? direction.shots : [];
		const modeOf = new Array(model.length).fill("line");
		for (const shot of shots) {
			const mode = SPLIT_MODES.has(shot.split) ? shot.split : "line";
			for (let index = shot.from; index <= shot.to && index < model.length; index += 1) modeOf[index] = mode;
		}
		const pieces = [];
		const pieceTypography = [];
		const firstOf = [];
		const lastOf = [];
		const where = [];
		model.forEach((line, n) => {
			const info = typography[n] || DEFAULT_INFO;
			const ranges = piecesOf(line, modeOf[n]);
			firstOf[n] = pieces.length;
			where[n] = [];
			// Each other voice goes with the piece being sung when it comes in.
			const starts = ranges.map(([first]) => line.words[first].start);
			const voiceAt = (line.backing || []).map((voice) => {
				let at = 0;
				while (at + 1 < starts.length && starts[at + 1] <= voice.start) at += 1;
				return at;
			});
			ranges.forEach(([first, last], part) => {
				const words = line.words.slice(first, last + 1);
				const voices = (line.backing || []).filter((_, voice) => voiceAt[voice] === part);
				for (let word = first; word <= last; word += 1) where[n][word] = { piece: pieces.length, word: word - first };
				pieces.push(ranges.length === 1 ? { ...line, source: n, part: 0, parts: 1, split: modeOf[n] } : {
					...line,
					words,
					backing: voices,
					text: words.map((word) => word.text).join(" "),
					start: Math.min(words[0].start, ...voices.map((voice) => voice.start)),
					end: Math.max(...words.map((word) => word.end), ...voices.flatMap((voice) => voice.words.map((word) => word.end))),
					chars: words.reduce((sum, word) => sum + word.chars.length, 0),
					source: n,
					part,
					parts: ranges.length,
					split: modeOf[n],
				});
				pieceTypography.push(ranges.length === 1 ? info : {
					...info,
					words: (info.words || []).slice(first, last + 1),
					backing: (info.backing || []).filter((_, voice) => voiceAt[voice] === part),
				});
			});
			lastOf[n] = pieces.length - 1;
		});
		if (pieces.length === model.length) return { model: pieces, direction, typography: pieceTypography };
		const lineDirections = {};
		for (const [key, entry] of Object.entries(direction?.lines || {})) {
			const n = Number(key);
			if (!Number.isInteger(n) || !where[n]) continue;
			for (let piece = firstOf[n]; piece <= lastOf[n]; piece += 1) {
				const value = {};
				if (entry.fx) value.fx = entry.fx;
				const emph = (entry.emph || []).map((word) => where[n][word]).filter((spot) => spot && spot.piece === piece).map((spot) => spot.word);
				if (emph.length) value.emph = emph;
				if (Object.keys(value).length) lineDirections[piece] = value;
			}
		}
		const holds = (shot) => root.ivLyricsMotionDirector?.MAX_LINES?.[shot.layout] || 6;
		const split = [];
		for (const shot of shots) {
			const first = firstOf[shot.from];
			const last = lastOf[Math.min(shot.to, model.length - 1)];
			if (!Number.isInteger(first) || !Number.isInteger(last)) continue;
			// One-at-a-time compositions show one piece at a time in the same place: they hold more;
			// so do the open-ended ones for words set one by one (small, and gone as their line goes).
			const most = SOLO_LAYOUTS.has(shot.layout) ? Math.max(12, holds(shot))
				: shot.split === "word" && ROOMY_LAYOUTS.has(shot.layout) ? Math.min(10, Math.max(8, holds(shot) * 2)) : holds(shot);
			for (let start = first; start <= last;) {
				let end = Math.min(last, start + most - 1);
				if (end < last) {
					// Between two lines rather than inside one (unless that leaves the board half empty),
					// and never between pieces sung into each other.
					const fits = (cut, between) => (!between || pieces[cut].source !== pieces[cut + 1].source) && !singsInto(pieces[cut], pieces[cut + 1]);
					const find = (between, lowest) => {
						for (let cut = end; cut >= lowest; cut -= 1) if (fits(cut, between)) return cut;
						return -1;
					};
					let cut = find(true, start + Math.floor((most - 1) / 2));
					if (cut < 0) cut = find(false, start + 1);
					if (cut >= 0) end = cut;
				}
				split.push(start === first ? { ...shot, from: start, to: end } : { ...shot, from: start, to: end, enter: "pan", continued: true });
				start = end + 1;
			}
		}
		return { model: pieces, direction: { ...direction, shots: split, lines: lineDirections }, typography: pieceTypography };
	};

	/**
	 * The edit for a song: boards in world space, the camera's path and the
	 * timeline. Pure: the same model, direction, typography, size and seed
	 * give the same plan.
	 */
	const compose = (sourceModel, sourceDirection, options = {}) => {
		const W = Math.max(320, Number(options.width) || 0);
		const H = Math.max(240, Number(options.height) || 0);
		const F = clamp(Math.min(W * 0.068, H * 0.118), 34, 136);
		const seed = (Number(options.seed) >>> 0) || 1;
		const tempo = sourceDirection?.tempo?.tempo || "mid";
		const pace = Number(sourceDirection?.tempo?.pace) || 1;
		// Lines are set in the pieces their shots ask for (options.pieces: false keeps every line whole).
		const sourceTypography = Array.isArray(options.typography) ? options.typography : [];
		const { model, direction, typography } = options.pieces === false
			? { model: sourceModel, direction: sourceDirection, typography: sourceTypography }
			: expandPieces(sourceModel, sourceDirection, sourceTypography);
		const ctx = {
			W, H, F,
			measure: typeof options.measure === "function" ? options.measure : fallbackMeasure,
			font: createFontBook(),
			typography,
			songLang: options.songLang || "",
			tempo,
			pace,
			spin: (TEMPO_FEEL[tempo] || TEMPO_FEEL.mid).spin,
		};
		const shots = Array.isArray(direction?.shots) ? direction.shots : [];
		const lines = model.map((line, index) => ({
			...line,
			n: index,
			backing: line.backing || [],
			// Every word on screen: the lead's, then each other voice's.
			shown: [...line.words, ...(line.backing || []).flatMap((voice) => voice.words)],
			info: typography[index] || DEFAULT_INFO,
			emph: new Set(direction?.lines?.[index]?.emph || []),
			fx: direction?.lines?.[index]?.fx || null,
			board: -1,
		}));
		const boards = shots.map((shot, index) => {
			const members = lines.slice(shot.from, shot.to + 1);
			// Repeated sections are composed the same way every time they come back.
			const random = createRandom(seed ^ hashString(shot.layout + "\u0001" + members.map((line) => line.text).join("\u0002")));
			const type = shot.type || "impact";
			// One-at-a-time compositions cannot hold lines sung over (or into) each other, and only some scripts stand upright.
			let name = LAYOUT_FNS[shot.layout] ? shot.layout : "column";
			if (SOLO_LAYOUTS.has(name) && members.some((line, offset) => offset > 0 && singsInto(members[offset - 1], line))) name = "split";
			if (name === "pillar" && !members.every(standsUpright)) name = "column";
			const accent = name === "pillar" && !UPRIGHT_ACCENTS.has(shot.accent) ? "color" : shot.accent || "color";
			const look = { emph: (line) => line.emph, light: random() < 0.4, type, serif: shot.serif === true, upper: shot.upper === true, accent };
			const layout = LAYOUT_FNS[name](members, ctx, random, look);
			members.forEach((line) => {
				const fx = line.fx || shot.fx || "rise";
				line.fx = line.info.joined ? JOINED_FX[fx] || fx : fx;
				line.board = index;
			});
			const board = {
				index,
				layout: name,
				enter: index ? shot.enter : "push",
				accent,
				type,
				serif: shot.serif === true,
				upper: shot.upper === true,
				bars: shot.bars === true,
				// The scene an instrumental break after the shot's last line plays (interludesOf), if the AI named one.
				interlude: INTERLUDE_STYLES.includes(shot.interlude) ? shot.interlude : null,
				rule: shot.rule === true,
				// A composition that sets its own slant (a word wall) keeps it.
				dutch: layout.tilt ?? (Number(shot.dutch) || 0),
				first: shot.from,
				last: shot.to,
				places: layout.places,
				frames: layout.frames,
				drift: layout.drift,
				strokes: layout.strokes || [],
				plates: layout.plates || [],
				fills: layout.fills || [],
				solo: layout.solo === true,
				preview: PREVIEW_LAYOUTS.has(name),
				exit: EXIT_NAMES.has(shot.exit) ? shot.exit : "fade",
				hold: HOLD_NAMES.has(shot.hold) ? shot.hold : "grow",
				color: index % 2,
				rests: [],
			};
			board.localCorners = board.places.flatMap(cornersOf);
			Object.assign(board, decorate(board, ctx, random, shot, direction || {}));
			return board;
		});
		const plan = {
			W, H, F,
			mood: direction?.mood || "warm",
			tempo,
			pace,
			source: direction?.source || "local",
			boards,
			lines: lines.filter((line) => line.board >= 0),
			pulses: pulsesInMs(options.analysis),
		};
		if (!plan.lines.length) return { ...plan, flashes: [], slams: [], panels: [], bars: [], interludes: [], cues: [] };
		placeBoards(boards, ctx, seed);
		timeline(plan, ctx);
		// The stretches without lyrics play scenes of their own (title cards, beat scenes, a count-in).
		plan.interludes = interludesOf(plan, ctx, direction, { seed, title: options.title, artist: options.artist });
		plan.cues = cuesOf(plan.interludes);
		return plan;
	};

	// ---------------------------------------------------------------------
	// Reading the plan at a playback position
	// ---------------------------------------------------------------------

	const lineIndexAt = (plan, time) => {
		const lines = plan?.lines || [];
		let low = 0;
		let high = lines.length;
		while (low < high) {
			const middle = (low + high) >>> 1;
			if (lines[middle].arrive <= time) low = middle + 1;
			else high = middle;
		}
		return low - 1;
	};

	/** Continuous line position: 2.5 is halfway from line 2 to line 3. */
	const progressAt = (plan, time) => {
		const lines = plan?.lines || [];
		if (!lines.length) return -1;
		const index = lineIndexAt(plan, time);
		if (index < 0) return -1 + clamp01((time - (lines[0].arrive - INTRO_MS)) / INTRO_MS);
		const line = lines[index];
		const next = lines[index + 1];
		if (next && time > line.leave) return index + clamp01((time - line.leave) / Math.max(1, next.arrive - line.leave));
		return index;
	};

	const mixPose = (from, to, amount) => ({
		x: lerp(from.x, to.x, amount),
		y: lerp(from.y, to.y, amount),
		z: lerp(from.z, to.z, amount),
		roll: lerp(from.roll, to.roll, amount),
		// The turn that faces a line on a drum (zero on flat boards).
		yaw: lerp(from.yaw || 0, to.yaw || 0, amount),
		pitch: lerp(from.pitch || 0, to.pitch || 0, amount),
		faceYaw: lerp(from.faceYaw || 0, to.faceYaw || 0, amount),
		facePitch: lerp(from.facePitch || 0, to.facePitch || 0, amount),
	});

	const holdPose = (plan, index, time) => {
		const line = plan.lines[index];
		const camera = line.camera;
		const end = Number.isFinite(line.leave) ? line.leave : line.end + 3200;
		const life = clamp01((time - line.arrive) / Math.max(1, end - line.arrive));
		const ease = easeInOutSine(life);
		// While a line is held the camera eases in towards it.
		const push = (line.drift?.z || 0) * ease;
		const into = camera.push || FORWARD;
		let pose = {
			x: camera.x + into.x * push,
			y: camera.y + into.y * push,
			z: camera.z + into.z * push,
			roll: camera.roll + (line.drift?.roll || 0) * (life - 0.5),
			yaw: camera.yaw || 0,
			pitch: camera.pitch || 0,
			faceYaw: camera.yaw || 0,
			facePitch: camera.pitch || 0,
		};
		if (line.share && time < line.share.until + SHARE_RETURN_MS) {
			// The line before still sings into this one: both stay in frame, then the camera settles on this line.
			pose = mixPose(line.share.pose, pose, easeInOutCubic(clamp01((time - line.share.until) / SHARE_RETURN_MS)));
		}
		if (line.reveal && time > line.reveal.start) {
			const amount = easeInOutCubic(clamp01((time - line.reveal.start) / Math.max(1, Math.min(1700, line.reveal.end - line.reveal.start))));
			pose = mixPose(pose, line.reveal.pose, amount);
		}
		if (line.rest && time > line.rest.start) {
			// Over an interlude the camera turns, swings and pushes into the video, and settles back before it moves on.
			const rest = line.rest;
			const until = Number.isFinite(line.leave) ? line.leave : rest.start + OUTRO_DRIFT_MS;
			const k = clamp01((time - rest.start) / Math.max(1, until - rest.start));
			const swell = Math.sin(Math.PI * k);
			pose.roll += rest.roll * easeInOutSine(k);
			pose.yaw += rest.yaw * swell;
			pose.pitch += rest.pitch * swell;
			pose.dolly = -rest.zoom * swell;
		}
		if (!Number.isFinite(line.leave) && time > line.outro) pose.z += 700 * easeInOutCubic(clamp01((time - line.outro) / 4200));
		return pose;
	};

	const recentEvent = (events, time, window) => {
		if (!events?.length) return null;
		let low = 0;
		let high = events.length;
		while (low < high) {
			const middle = (low + high) >>> 1;
			if (events[middle].time <= time) low = middle + 1;
			else high = middle;
		}
		const event = events[low - 1];
		return event && time - event.time < window ? { ...event, since: time - event.time } : null;
	};

	const beatAt = (pulses, time) => {
		if (!pulses?.times?.length) return null;
		const times = pulses.times;
		let low = 0;
		let high = times.length;
		while (low < high) {
			const middle = (low + high) >>> 1;
			if (times[middle] <= time) low = middle + 1;
			else high = middle;
		}
		const index = low - 1;
		if (index < 0 || time - times[index] > 450) return null;
		return { index, since: time - times[index], strength: pulses.strengths[index] || 0 };
	};

	/** The camera on its way from one line to the next. */
	const movePose = (plan, index, time) => {
		const line = plan.lines[index];
		const next = plan.lines[index + 1];
		const move = line.move;
		const u = clamp01((time - line.leave) / Math.max(1, next.arrive - line.leave));
		const from = holdPose(plan, index, line.leave);
		const to = holdPose(plan, index + 1, next.arrive);
		const type = move.type;
		if (type === "cut" || type === "panel") {
			const pose = time >= move.cutAt ? to : from;
			return { ...pose, dolly: 0, sway: null, u };
		}
		let eased;
		if (type === "line") eased = easeInOutQuart(u);
		else if (type === "whip") eased = easeInOutExpo(u);
		else if (DISSOLVES.has(type) || type === "drift") eased = easeInOutSine(u);
		else if (CUBIC_MOVES.has(type)) eased = easeInOutCubic(u);
		else eased = easeInOutExpo(u);
		const pose = mixPose(from, to, eased);
		if (type === "through" && move.waypoint) {
			// Head for the last sung word first, so the camera flies through it.
			const half = u < 0.5 ? easeInOutCubic(u / 0.5) : easeInOutCubic((u - 0.5) / 0.5);
			const a = u < 0.5 ? from : move.waypoint;
			const b = u < 0.5 ? move.waypoint : to;
			pose.x = lerp(a.x, b.x, half);
			pose.y = lerp(a.y, b.y, half);
		}
		const rollEase = type === "line" ? eased : DISSOLVES.has(type) || type === "drift" ? easeInOutSine(u) : type === "corkscrew" ? easeInOutCubic(u) : easeInOutQuint(u);
		pose.roll = lerp(from.roll, to.roll + move.extraRoll, rollEase);
		const dolly = move.arc * Math.sin(Math.PI * u);
		pose.z += dolly;
		const bell = Math.sin(Math.PI * clamp01(type === "whip" ? u : easeInOutSine(u)));
		return {
			...pose,
			yaw: pose.yaw + move.swing.yaw * bell,
			pitch: pose.pitch + move.swing.pitch * bell,
			dolly,
			sway: { u, dx: to.x - from.x, dy: to.y - from.y, board: type !== "line", whip: type === "whip" },
			u,
		};
	};

	/**
	 * Camera pose at a playback position: the planned path plus 3D swings,
	 * a settling overshoot, a handheld drift, beat punches and slam shakes.
	 * Also reports the dolly (pull-back) and the move in progress, for the
	 * background.
	 */
	const cameraPose = (plan, time, pulses = plan?.pulses) => {
		const lines = plan?.lines || [];
		if (!lines.length) return { x: 0, y: 0, z: 0, roll: 0, yaw: 0, pitch: 0, dolly: 0, sway: null, beat: 0 };
		let pose;
		const first = lines[0];
		if (time < first.arrive) {
			const target = holdPose(plan, 0, first.arrive);
			const start = { ...target, z: target.z + 900, roll: target.roll - 10 };
			const amount = easeInOutCubic(clamp01((time - (first.arrive - INTRO_MS)) / INTRO_MS));
			pose = { ...mixPose(start, target, amount), dolly: 900 * (1 - amount), sway: null };
			pose.yaw += 24 * (1 - amount);
			pose.pitch -= 10 * (1 - amount);
		} else {
			const index = lineIndexAt(plan, time);
			const line = lines[index];
			const next = lines[index + 1];
			if (next && time > line.leave) {
				pose = movePose(plan, index, time);
			} else {
				pose = { dolly: 0, sway: null, ...holdPose(plan, index, time) };
				const previous = lines[index - 1];
				const since = time - line.arrive;
				if (previous && since >= 0 && since < 700 && !["cut", "panel", "fade", "iris", "open"].includes(previous.move?.type)) {
					const k = since / 700;
					const spring = Math.sin(k * Math.PI * 2.2) * Math.exp(-k * 4.5);
					const dx = line.camera.x - previous.camera.x;
					const dy = line.camera.y - previous.camera.y;
					const distance = Math.hypot(dx, dy) || 1;
					const push = Math.min(34, distance * 0.02) * spring;
					pose.x += (dx / distance) * push;
					pose.y += (dy / distance) * push;
					pose.roll += clamp((line.camera.roll - previous.camera.roll) * 0.04, -3.5, 3.5) * spring;
					pose.yaw -= (previous.move?.swing?.yaw || 0) * 0.08 * spring;
					pose.pitch -= (previous.move?.swing?.pitch || 0) * 0.08 * spring;
				}
			}
		}
		const mood = moodOf(plan);
		const feel = feelOf(plan);
		const shake = mood.shake * feel.shake;
		let shakeX = (Math.sin(time * 0.00071 + 1.3) * 0.6 + Math.sin(time * 0.00153 + 0.4) * 0.4) * 5 * shake;
		let shakeY = (Math.sin(time * 0.00063 + 2.1) * 0.6 + Math.sin(time * 0.00117) * 0.4) * 4 * shake;
		pose.roll += Math.sin(time * 0.00043 + 0.7) * 0.32 * shake;
		// A slow handheld orbit gives the layers depth even while a line is held.
		pose.yaw += Math.sin(time * 0.00029 + 0.3) * 2.2 * feel.sway;
		pose.pitch += Math.sin(time * 0.00023 + 1.9) * 1.5 * feel.sway;
		const slam = recentEvent(plan.slams, time, 220);
		if (slam) {
			const k = 1 - slam.since / 220;
			shakeX += Math.sin(slam.since * 0.11) * slam.strength * k;
			shakeY += Math.cos(slam.since * 0.13) * slam.strength * k * 0.7;
			pose.roll += Math.sin(slam.since * 0.08) * 0.09 * slam.strength * k;
		}
		const offset = rotate2d(shakeX, shakeY, pose.roll);
		pose.x += offset.x;
		pose.y += offset.y;
		let beatAmount = 0;
		const beat = beatAt(pulses, time);
		if (beat) {
			beatAmount = beat.strength * mood.punch * Math.exp(-beat.since / 150);
			pose.z -= 46 * beat.strength * mood.punch * Math.exp(-beat.since / 130);
			pose.roll += (beat.index % 2 ? 1 : -1) * 0.5 * beat.strength * mood.punch * Math.exp(-beat.since / 160);
		}
		pose.beat = beatAmount;
		return pose;
	};

	/** How far in front of the viewer's focal plane a world point is (CSS z after the camera turns). */
	const viewDepth = (pose, point) => {
		const radians = (-pose.roll * Math.PI) / 180;
		const x0 = point.x - pose.x;
		const y0 = point.y - pose.y;
		const z0 = point.z - pose.z;
		const x1 = x0 * Math.cos(radians) - y0 * Math.sin(radians);
		const y1 = x0 * Math.sin(radians) + y0 * Math.cos(radians);
		const yaw = ((pose.yaw || 0) * Math.PI) / 180;
		const pitch = ((pose.pitch || 0) * Math.PI) / 180;
		const z2 = -x1 * Math.sin(yaw) + z0 * Math.cos(yaw);
		return y1 * Math.sin(pitch) + z2 * Math.cos(pitch);
	};

	const boardVisibility = (board, time) => {
		const fadeIn = board.index && (board.enter === "cut" || board.enter === "panel" || REVEALS.has(board.enter)) ? 120 : board.enter === "fade" ? 650 : 450;
		const into = easeOutCubic(clamp01((time - board.appear) / fadeIn));
		const out = Number.isFinite(board.fadeAt) ? 1 - easeInOutCubic(clamp01((time - board.fadeAt) / Math.max(1, board.fadeEnd - board.fadeAt))) : 1;
		// An interlude inside a board hides it until its lyrics return.
		let rest = 1;
		for (const window of board.rests || []) {
			if (time <= window.start || time >= window.end + REST_RETURN_MS) continue;
			const away = 1 - easeInOutCubic(clamp01((time - window.start) / REST_FADE_MS));
			const back = easeInOutCubic(clamp01((time - window.end) / REST_RETURN_MS));
			rest = Math.min(rest, Math.max(away, back));
		}
		return into * out * rest;
	};

	/** How far the edit is into an interlude, the intro or the outro (0: lyrics on screen, 1: only the video). */
	const restAt = (plan, time) => {
		const lines = plan?.lines || [];
		if (!lines.length) return 0;
		const index = lineIndexAt(plan, time);
		if (index < 0) return 1 - easeInOutCubic(clamp01((time - plan.boards[0].appear) / 900));
		const rest = lines[index].rest;
		if (!rest || time <= rest.start) return 0;
		const away = easeInOutCubic(clamp01((time - rest.start) / REST_FADE_MS));
		const back = Number.isFinite(rest.end) ? easeInOutCubic(clamp01((time - rest.end) / REST_RETURN_MS)) : 0;
		return away * (1 - back);
	};

	const levelAt = (stops, distance) => {
		if (distance <= stops[0][0]) return stops[0][1];
		for (let index = 1; index < stops.length; index += 1) {
			const [position, value] = stops[index];
			if (distance <= position) {
				const [previousPosition, previousValue] = stops[index - 1];
				return lerp(previousValue, value, (distance - previousPosition) / (position - previousPosition));
			}
		}
		return stops[stops.length - 1][1];
	};
	// Outlines: upcoming lines wait faintly, the next one a little clearer; sung lines keep a dim echo.
	const GHOST_STOPS = [[-2, 0.2], [-1, 0.3], [0, 0.56], [1, 0.34], [2, 0.24], [3, 0.16]];
	// Solid type: full while the line is current, then dimmer the further back it is.
	const SOLID_STOPS = [[0, 1], [1, 0.5], [2, 0.32], [3, 0.2]];
	/** Outline and solid opacity of a line (distance = playback progress − line number). */
	const lineLevels = (distance) => ({ ghost: levelAt(GHOST_STOPS, distance), solid: levelAt(SOLID_STOPS, distance) });

	const FX_DURATION = Object.freeze({
		pop: 380, slide: 420, rise: 440, slam: 230, flip: 480, blur: 560, wipe: 520, glitch: 340, spin: 560, zoom: 480,
		lift: 620, swing: 640, smear: 360, door: 620, glide: 760, skew: 500, open: 560, shutter: 460, brush: 640,
		type: 1, assemble: 1, drop: 1, wave: 1, track: 1, bounce: 1, flicker: 1, cascade: 1, ripple: 1, swirl: 1, rain: 1, decode: 1,
	});
	const CHAR_FX = new Set(["type", "assemble", "drop", "wave", "track", "bounce", "flicker", "cascade", "ripple", "swirl", "rain", "decode"]);
	// How long after its word starts a word coming in with this effect can be read (masks and slow fades take a
	// while; others about 70 ms): in a one-at-a-time composition the piece before stays until then (timeline, soloOut).
	const READS_AFTER = Object.freeze({ brush: 280, wipe: 230, open: 210, glide: 200, blur: 200, shutter: 170, door: 160, lift: 150, spin: 150, flip: 130, swing: 120, skew: 110 });
	const fxPaceOf = (pace) => clamp(Number(pace) || 1, 0.75, 1.5);

	/** Entrance progress of a sung word's solid type (0 before it starts). */
	const wordEntrance = (fx, word, time, pace = 1) => {
		const duration = fx === "stretch" ? clamp(word.end - word.start, 280, 1400) : (FX_DURATION[fx] || 380) * fxPaceOf(pace);
		const lead = fx === "slam" ? 20 : fx === "zoom" || fx === "blur" || fx === "glide" ? 90 : fx === "lift" || fx === "door" ? 70 : 50;
		return clamp01((time - (word.start - lead)) / duration);
	};

	const SETTLED = Object.freeze({ opacity: 1, transform: "none", filter: "", clip: "", shadow: "" });
	const HIDDEN = Object.freeze({ opacity: 0, transform: "none", filter: "", clip: "", shadow: "" });
	const frame = (values) => ({ filter: "", clip: "", shadow: "", ...values });
	// Masks that reveal a word leave this much room (em) round it for its
	// shadow, glow and overhanging letters, so nothing is cut off sharply.
	const SPILL_EM = 0.6;
	const SPILL = "-" + SPILL_EM + "em";

	/** The solid word's opacity, transform, filter, clip and shadow for its entrance. */
	const solidFrame = (fx, progress, seed = 0, rtl = false) => {
		if (progress <= 0) return HIDDEN;
		if (progress >= 1 || CHAR_FX.has(fx)) return SETTLED;
		switch (fx) {
			case "slide": {
				const k = easeOutExpo(progress);
				const side = rtl ? -1 : 1;
				return frame({ opacity: clamp01(progress * 2.5), transform: "translateX(" + round((1 - k) * -0.55 * side, 3) + "em) skewX(" + round((1 - k) * -14 * side, 1) + "deg)" });
			}
			case "rise": {
				const k = easeOutCubic(progress);
				return frame({ opacity: clamp01(progress * 2), transform: "translateY(" + round((1 - k) * 0.42, 3) + "em)" });
			}
			case "slam": {
				const k = easeOutCubic(progress);
				return frame({ opacity: clamp01(progress * 3), transform: "scale(" + round(1 + (1 - k) * 1.5, 3) + ")" });
			}
			case "stretch": {
				const k = easeOutCubic(progress);
				return frame({ opacity: clamp01(progress * 5), transform: "scale(" + round(0.5 + 0.5 * k, 3) + "," + round(1.18 - 0.18 * k, 3) + ")" });
			}
			case "flip": {
				const k = easeOutBack(progress);
				return frame({ opacity: clamp01(progress * 2.2), transform: "perspective(5em) rotateX(" + round((1 - k) * 88, 1) + "deg)" });
			}
			case "spin": {
				const k = easeOutBack(progress);
				return frame({ opacity: clamp01(progress * 2.4), transform: "perspective(6em) rotateY(" + round((1 - k) * -250, 1) + "deg) scale(" + round(0.8 + 0.2 * easeOutCubic(progress), 3) + ")" });
			}
			case "blur": {
				const k = easeOutCubic(progress);
				const blur = (1 - k) * 16;
				return frame({ opacity: clamp01(progress * 1.8), transform: "scale(" + round(1.14 - 0.14 * k, 3) + ")", filter: blur > 0.3 ? "blur(" + round(blur, 1) + "px)" : "" });
			}
			case "zoom": {
				const k = easeOutExpo(progress);
				const blur = (1 - k) * 7;
				return frame({ opacity: clamp01(progress * 3), transform: "scale(" + round(3.4 - 2.4 * k, 3) + ")", filter: blur > 0.3 ? "blur(" + round(blur, 1) + "px)" : "" });
			}
			case "wipe": {
				const k = easeInOutCubic(progress);
				// The edge sweeps from before the word's start to past its end (its shadow included).
				const edge = "calc(" + round((1 - k) * 100, 2) + "% + " + round(SPILL_EM * (1 - 2 * k), 3) + "em)";
				return frame({
					opacity: 1,
					transform: "translateX(" + round((1 - k) * (rtl ? -0.1 : 0.1), 3) + "em)",
					clip: rtl ? "inset(" + SPILL + " " + SPILL + " " + SPILL + " " + edge + ")" : "inset(" + SPILL + " " + edge + " " + SPILL + " " + SPILL + ")",
				});
			}
			case "glitch": {
				const bucket = Math.floor(progress * 9);
				const random = createRandom((seed + bucket * 2654435761) >>> 0);
				const decay = 1 - progress;
				const off = progress < 0.12 || (random() < 0.2 && progress < 0.7);
				const split = round(0.012 + 0.07 * decay, 3);
				return frame({
					opacity: off ? (progress < 0.12 ? 0 : 0.35) : 1,
					transform: "translate(" + round((random() * 2 - 1) * 0.12 * decay, 3) + "em," + round((random() * 2 - 1) * 0.05 * decay, 3) + "em) skewX(" + round((random() * 2 - 1) * 18 * decay, 1) + "deg)",
					shadow: split + "em 0 0 rgba(255, 46, 99, 0.85), " + (-split) + "em 0 0 rgba(46, 226, 255, 0.85)",
				});
			}
			case "lift": {
				// Rises out of a mask at its own baseline (the part still below it is cut off); once up, the mask drops away from its shadow.
				const k = easeOutExpo(progress);
				const depth = (1 - k) * 1.05;
				const settle = easeInOutCubic(clamp01((progress - 0.7) / 0.3));
				return frame({
					opacity: clamp01(progress * 4),
					transform: "translateY(" + round(depth, 3) + "em)",
					clip: "inset(" + SPILL + " " + SPILL + " " + round(depth - 0.2 - SPILL_EM * settle, 3) + "em " + SPILL + ")",
				});
			}
			case "swing": {
				// Hangs from its first letter and swings down into place.
				const k = easeOutBack(progress);
				const hinge = rtl ? ["translateX(50%)", "translateX(-50%)"] : ["translateX(-50%)", "translateX(50%)"];
				return frame({ opacity: clamp01(progress * 3), transform: hinge[0] + " rotate(" + round((1 - k) * (rtl ? -32 : 32), 2) + "deg) " + hinge[1] });
			}
			case "smear": {
				// A fast motion smear that snaps into shape.
				const k = easeOutExpo(progress);
				const side = rtl ? 1 : -1;
				const blur = (1 - k) * 4;
				return frame({ opacity: clamp01(progress * 3.2), transform: "translateX(" + round((1 - k) * 0.6 * side, 3) + "em) scaleX(" + round(1 + (1 - k) * 0.85, 3) + ")", filter: blur > 0.3 ? "blur(" + round(blur, 1) + "px)" : "" });
			}
			case "door": {
				// Turns in from its first letter like a door swinging shut towards the viewer.
				const k = easeOutCubic(progress);
				const hinge = rtl ? ["translateX(50%)", "translateX(-50%)"] : ["translateX(-50%)", "translateX(50%)"];
				return frame({ opacity: clamp01(progress * 2.6), transform: "perspective(7em) " + hinge[0] + " rotateY(" + round((1 - k) * (rtl ? 86 : -86), 1) + "deg) " + hinge[1] });
			}
			case "glide": {
				// Drifts in slowly from the side, a breath rather than a hit.
				const k = easeOutQuint(progress);
				return frame({ opacity: clamp01(progress * 1.5), transform: "translateX(" + round((1 - k) * (rtl ? 0.42 : -0.42), 3) + "em)" });
			}
			case "skew": {
				// Leans in from below like a brush stroke and straightens up.
				const k = easeOutExpo(progress);
				return frame({ opacity: clamp01(progress * 2.4), transform: "translateY(" + round((1 - k) * 0.38, 3) + "em) skewX(" + round((1 - k) * (rtl ? 26 : -26), 1) + "deg)" });
			}
			case "open": {
				// Opens from its middle outwards.
				const k = easeInOutCubic(progress);
				const side = "calc(" + round((1 - k) * 50, 2) + "% - " + round(SPILL_EM * k, 3) + "em)";
				return frame({ opacity: 1, transform: "scaleX(" + round(1.06 - 0.06 * k, 3) + ")", clip: "inset(" + SPILL + " " + side + " " + SPILL + " " + side + ")" });
			}
			case "shutter": {
				// Opens from a thin line across its middle, top and bottom apart.
				const k = easeOutCubic(progress);
				const edge = "calc(" + round((1 - k) * 50, 2) + "% - " + round(SPILL_EM * k, 3) + "em)";
				return frame({ opacity: clamp01(progress * 4), transform: "scaleY(" + round(1.12 - 0.12 * k, 3) + ")", clip: "inset(" + edge + " " + SPILL + " " + edge + " " + SPILL + ")" });
			}
			case "brush": {
				// A slanted edge pulled across the word, like a brush stroke (from the right in right-to-left lines).
				const k = easeInOutCubic(progress);
				const lead = round(-30 + k * 160, 2);
				const tail = round(lead - 30, 2);
				const points = rtl
					? [(100 - tail) + "% -0.6em", "calc(100% + 0.6em) -0.6em", "calc(100% + 0.6em) calc(100% + 0.6em)", (100 - lead) + "% calc(100% + 0.6em)"]
					: ["-0.6em -0.6em", lead + "% -0.6em", tail + "% calc(100% + 0.6em)", "-0.6em calc(100% + 0.6em)"];
				return frame({ opacity: 1, transform: "translateX(" + round((1 - k) * (rtl ? 0.08 : -0.08), 3) + "em)", clip: "polygon(" + points.join(",") + ")", filter: k < 0.6 ? "blur(" + round((0.6 - k) * 3, 1) + "px)" : "" });
			}
			default: {
				const k = easeOutBack(progress);
				return frame({ opacity: clamp01(progress * 2.4), transform: "scale(" + round(0.55 + 0.45 * k, 3) + ")" });
			}
		}
	};

	const easeInCubic = (t) => t * t * t;
	const easeInQuad = (t) => t * t;

	/**
	 * A sung word leaving with its shot's exit: k runs 0 → 1 over the word's
	 * part of the exit (the words of a line leave one after another).
	 */
	const exitFrame = (exit, k, seed = 0, rtl = false) => {
		if (k <= 0) return SETTLED;
		if (k >= 1) return HIDDEN;
		const side = rtl ? -1 : 1;
		// A word that cannot be taken apart letter by letter leaves the nearest whole-word way.
		switch (LETTER_EXITS[exit] || exit) {
			case "rise": {
				const e = easeOutCubic(k);
				return frame({ opacity: 1 - k, transform: "translateY(" + round(-0.85 * e, 3) + "em)", filter: k > 0.1 ? "blur(" + round(k * 3, 1) + "px)" : "" });
			}
			case "fall": {
				const e = easeInQuad(k);
				const turn = (seed % 2 ? 1 : -1) * (8 + (seed % 9));
				return frame({ opacity: 1 - easeInCubic(k), transform: "translateY(" + round(e * 1.5, 3) + "em) rotate(" + round(turn * e, 1) + "deg)" });
			}
			case "scatter": {
				const e = easeOutCubic(k);
				const scatter = scatterOf(seed);
				return frame({
					opacity: 1 - k,
					transform: "translate(" + round(scatter.x * 1.2 * e, 3) + "em," + round(scatter.y * 1.2 * e, 3) + "em) rotate(" + round(scatter.r * e, 1) + "deg) scale(" + round(1 + scatter.s * 0.6 * e, 3) + ")",
					filter: k > 0.15 ? "blur(" + round(k * 5, 1) + "px)" : "",
				});
			}
			case "shrink": {
				const e = easeInOutCubic(k);
				return frame({ opacity: 1 - easeInQuad(k), transform: "scale(" + round(1 - 0.55 * e, 3) + ")" });
			}
			case "sweep": {
				const e = easeInCubic(k);
				return frame({ opacity: 1 - easeInQuad(k), transform: "translateX(" + round(side * 1.4 * e, 3) + "em) skewX(" + round(-side * 18 * e, 1) + "deg)" });
			}
			case "blur": {
				const e = easeOutCubic(k);
				return frame({ opacity: 1 - k, transform: "scale(" + round(1 + 0.16 * e, 3) + ")", filter: "blur(" + round(e * 14, 1) + "px)" });
			}
			case "wipe": {
				const e = easeInOutCubic(k);
				// The edge sweeps across the word (its shadow included), taking it away in reading order.
				const edge = "calc(" + round(e * 100, 2) + "% + " + round(SPILL_EM * (2 * e - 1), 3) + "em)";
				return frame({ opacity: 1, transform: "translateX(" + round(side * 0.1 * e, 3) + "em)", clip: rtl ? "inset(" + SPILL + " " + edge + " " + SPILL + " " + SPILL + ")" : "inset(" + SPILL + " " + SPILL + " " + SPILL + " " + edge + ")" });
			}
			case "flip": {
				const e = easeInCubic(k);
				return frame({ opacity: 1 - easeInQuad(k), transform: "perspective(6em) rotateX(" + round(e * 88, 1) + "deg)" });
			}
			case "stretch": {
				const e = easeInCubic(k);
				return frame({ opacity: 1 - easeInQuad(k), transform: "scale(" + round(1 + 0.6 * e, 3) + "," + round(1 - 0.9 * e, 3) + ")" });
			}
			case "glitch": {
				const random = createRandom((seed + Math.floor(k * 14) * 7919) >>> 0);
				const jolt = (random() * 2 - 1) * (0.1 + k * 0.5);
				const cut = round(random() * 70, 1);
				return frame({
					opacity: random() < k * 0.7 ? 0 : 1 - k * 0.6,
					transform: "translateX(" + round(jolt, 3) + "em) skewX(" + round((random() * 2 - 1) * 24 * k, 1) + "deg)",
					clip: "inset(" + cut + "% " + SPILL + " " + round(Math.max(0, 100 - cut - 18 - random() * 30), 1) + "% " + SPILL + ")",
					shadow: "0.06em 0 0 rgba(255,40,90,0.7), -0.06em 0 0 rgba(40,220,255,0.7)",
				});
			}
			case "drip": {
				const e = easeInCubic(k);
				return frame({ opacity: 1 - easeInQuad(k), transform: "translateY(" + round(e * 0.55, 3) + "em) scale(" + round(1 - 0.25 * e, 3) + "," + round(1 + 1.1 * e, 3) + ")", filter: k > 0.2 ? "blur(" + round(k * 3, 1) + "px)" : "" });
			}
			case "sink": {
				// Sinks behind a mask at its own baseline, the way lift brings a word in, backwards.
				const depth = easeInCubic(k) * 1.1;
				const bottom = lerp(-SPILL_EM, depth - 0.2, clamp01(k / 0.18));
				return frame({ opacity: 1 - clamp01((k - 0.82) / 0.18), transform: "translateY(" + round(depth, 3) + "em)", clip: "inset(" + SPILL + " " + SPILL + " " + round(bottom, 3) + "em " + SPILL + ")" });
			}
			case "shut": {
				// Closes to a thin line across its middle, top and bottom together.
				const e = easeInCubic(k);
				const edge = "calc(" + round(e * 50, 2) + "% - " + round(SPILL_EM * (1 - e), 3) + "em)";
				return frame({ opacity: 1 - clamp01((k - 0.78) / 0.22), transform: "scaleY(" + round(1 + 0.12 * e, 3) + ")", clip: "inset(" + edge + " " + SPILL + " " + edge + " " + SPILL + ")" });
			}
			case "zoom": {
				// Flies at the lens, out of focus.
				const e = easeInCubic(k);
				return frame({ opacity: 1 - easeInQuad(k), transform: "scale(" + round(1 + 1.6 * e, 3) + ")", filter: k > 0.1 ? "blur(" + round(e * 10, 1) + "px)" : "" });
			}
			case "twist": {
				// Turns away and shrinks to a point.
				const e = easeInCubic(k);
				const turn = (seed % 2 ? 1 : -1) * 190;
				return frame({ opacity: 1 - easeInQuad(k), transform: "rotate(" + round(turn * e, 1) + "deg) scale(" + round(1 - 0.9 * e, 3) + ")" });
			}
			case "dash": {
				// Smeared off sideways at speed.
				const e = easeInCubic(k);
				const blur = e * 6;
				return frame({ opacity: 1 - easeInQuad(k), transform: "translateX(" + round(side * 2.2 * e, 3) + "em) scaleX(" + round(1 + 1.3 * e, 3) + ")", filter: blur > 0.3 ? "blur(" + round(blur, 1) + "px)" : "" });
			}
			case "hinge": {
				// Loses a screw: swings down from its first letter, then drops away.
				const hinge = rtl ? ["translateX(50%)", "translateX(-50%)"] : ["translateX(-50%)", "translateX(50%)"];
				const turn = easeOutBack(clamp01(k / 0.55)) * 64 * side;
				const drop = easeInQuad(clamp01((k - 0.5) / 0.5)) * 1.6;
				return frame({ opacity: 1 - clamp01((k - 0.45) / 0.55), transform: "translateY(" + round(drop, 3) + "em) " + hinge[0] + " rotate(" + round(turn, 1) + "deg) " + hinge[1] });
			}
			default: {
				const e = easeOutCubic(k);
				return frame({ opacity: 1 - k, transform: "translateY(" + round(-0.14 * e, 3) + "em)" });
			}
		}
	};

	/**
	 * A letter of a word leaving letter by letter (LETTER_EXITS): k runs 0 → 1
	 * over the word's part of the exit; each letter takes its own turn within
	 * it (in reading order, from the end, at random or all at once).
	 * context: count (letters in the word) and seed.
	 */
	const exitCharFrame = (exit, k, char, index, context = {}) => {
		const { count = 1, seed = 0 } = context;
		if (k <= 0) return LETTER_SETTLED;
		if (k >= 1) return LETTER_HIDDEN;
		const random = createRandom((seed + index * 2654435761) >>> 0);
		const along = count > 1 ? index / (count - 1) : 0;
		const turn = exit === "erase" ? 1 - along
			: exit === "dissolve" || exit === "scramble" ? random()
				: exit === "burst" ? random() * 0.25 : along;
		const spread = count > 1 ? 0.55 : 0;
		const t = clamp01((k - turn * spread) / (1 - spread));
		if (t <= 0) return LETTER_SETTLED;
		switch (exit) {
			case "crumble": {
				// The letters drop off one after another, each turning its own way.
				const e = easeInQuad(t);
				return { opacity: 1 - easeInCubic(t), transform: "translate(" + round((random() * 2 - 1) * 0.18 * e, 3) + "em," + round(e * 1.4, 3) + "em) rotate(" + round((random() * 2 - 1) * 48 * e, 1) + "deg)" };
			}
			case "dissolve": {
				// The letters go out one by one at random, swelling a little as they fade.
				const e = easeOutCubic(t);
				return { opacity: 1 - t, transform: "translateY(" + round(-0.08 * e, 3) + "em) scale(" + round(1 + 0.3 * e, 3) + ")" };
			}
			case "erase": {
				// Deleted from the end, letter by letter, like a cursor going back.
				return { opacity: 1 - clamp01((t - 0.1) / 0.18), transform: "scale(" + round(1 - 0.3 * clamp01(t / 0.28), 3) + ")" };
			}
			case "burst": {
				// Blown apart from the middle of the word.
				const e = easeOutCubic(t);
				const out = count > 1 ? (index - (count - 1) / 2) / Math.max(1, (count - 1) / 2) : random() * 2 - 1;
				return {
					opacity: 1 - t,
					transform: "translate(" + round((out * 1.1 + (random() * 2 - 1) * 0.35) * e, 3) + "em," + round((random() * 2 - 1) * 0.9 * e, 3) + "em) rotate("
						+ round((random() * 2 - 1) * 120 * e, 1) + "deg) scale(" + round(1 + 0.5 * e, 3) + ")",
				};
			}
			case "evaporate": {
				// The letters rise away one after another like steam, swaying as they go.
				const e = easeOutCubic(t);
				return { opacity: 1 - easeInQuad(t), transform: "translate(" + round(Math.sin(t * 5 + index) * 0.12 * e, 3) + "em," + round(-1.1 * e, 3) + "em) scale(" + round(1 + 0.18 * e, 3) + ")" };
			}
			case "tumble": {
				// Each letter tips over forwards, one after another like dominoes.
				const e = easeInCubic(t);
				return { opacity: 1 - easeInCubic(t), transform: "perspective(4em) translateY(" + round(0.3 * e, 3) + "em) rotateX(" + round(-100 * e, 1) + "deg)" };
			}
			case "scramble": {
				// The letters flicker through random characters, then blink out.
				if (t >= 0.78) return LETTER_HIDDEN;
				const pool = DECODE_POOLS[decodePoolOf(char?.ch || "")] || DECODE_POOLS.latin;
				const flicker = createRandom((seed + index * 7919 + Math.floor(t * 9) * 104729) >>> 0);
				return { opacity: 1, transform: "none", text: t < 0.08 ? undefined : pool[Math.floor(flicker() * pool.length)] };
			}
			default:
				return { opacity: 1 - t, transform: "none" };
		}
	};

	/**
	 * A line's movement while it is held (its shot's hold), added after its
	 * place: it never freezes once its words have landed. "float" moves the
	 * words themselves (floatOffset).
	 */
	const holdFrame = (hold, line, time, beat = 0, F = 60) => {
		if (!hold || hold === "still" || hold === "float" || time < line.start) return "";
		const end = Number.isFinite(line.exitAt) ? line.exitAt + line.exitSpan : line.voicesEnd + 2600;
		const k = clamp01((time - line.start) / Math.max(1, end - line.start));
		const side = hashString(line.text) % 2 ? 1 : -1;
		switch (hold) {
			case "grow": return " scale(" + round(1 + 0.05 * Math.sin((k * Math.PI) / 2), 4) + ")";
			case "drift": return " translateX(" + round(side * F * 0.5 * easeInOutSine(k), 1) + "px)";
			case "lean": return " rotateZ(" + round(side * 2.2 * easeInOutSine(k), 2) + "deg)";
			case "push": return " translateZ(" + round(F * 1.6 * easeInOutSine(k), 1) + "px)";
			case "breathe": {
				const swell = 0.018 * Math.sin(((time - line.start) / 2600) * Math.PI * 2) + beat * 0.03;
				return Math.abs(swell) < 0.0005 ? "" : " scale(" + round(1 + swell, 4) + ")";
			}
			case "wobble": {
				// Rocks and leans like jelly, a little more on the beat.
				const phase = ((time - line.start) / 1300) * Math.PI * 2;
				const fade = clamp01((time - line.start) / 500);
				return " rotateZ(" + round(Math.sin(phase) * 2.4 * fade, 2) + "deg) skewX(" + round(Math.sin(phase * 0.5 + 1) * 5 * fade, 2) + "deg) scale(" + round(1 + beat * 0.04, 4) + "," + round(1 - beat * 0.03, 4) + ")";
			}
			case "swivel": return " rotateY(" + round(side * 16 * Math.sin(easeInOutSine(k) * Math.PI * 1.2 - 0.6), 2) + "deg)";
			default: return "";
		}
	};

	/** Where a line's sung words reach in its block (left and right edges and centre) after count of them have started. */
	const sungSpan = (line, words, count) => {
		let left = Infinity;
		let right = -Infinity;
		for (let index = 0; index < Math.max(1, count) && index < line.words.length; index += 1) {
			const word = words[index];
			left = Math.min(left, word.x - word.width / 2);
			right = Math.max(right, word.x + word.width / 2);
		}
		return { width: right - left, center: (left + right) / 2 };
	};
	const startedWords = (line, time) => {
		let count = 0;
		while (count < line.words.length && line.words[count].start <= time) count += 1;
		return count;
	};

	/** A line that fills the width: the words sung so far are scaled and centred to fill it, easing as each word lands. */
	const fillFrame = (line, place, time) => {
		const fill = place.fill;
		const words = place.block.words;
		const count = startedWords(line, time);
		const stateAt = (n) => {
			const span = sungSpan(line, words, n);
			return { scale: clamp(fill.target / Math.max(1, span.width), 1, fill.most), center: span.center };
		};
		const now = stateAt(count);
		const before = stateAt(count - 1);
		const k = count <= 1 ? 1 : easeOutCubic(clamp01((time - line.words[count - 1].start) / 240));
		return " scale(" + round(lerp(before.scale, now.scale, k), 4) + ") translateX(" + round(-lerp(before.center, now.center, k), 1) + "px)";
	};

	/** A line larger than the screen: the view slides along it as it is sung, from its start to its end. */
	const travelFrame = (line, place, time) => {
		const k = easeInOutSine(clamp01((time - line.start + 200) / Math.max(400, line.end - line.start + 400)));
		const side = line.info.rtl ? -1 : 1;
		return " translateX(" + round(side * place.travel * (1 - 2 * k), 1) + "px)";
	};

	/** A line that slides along its rail into place as it starts (rails). */
	const slideFrame = (line, place, time) => {
		const k = easeOutExpo(clamp01((time - (line.start - 420)) / 560));
		if (k >= 1) return "";
		return " translate(" + round(place.slide.x * (1 - k), 1) + "px," + round(place.slide.y * (1 - k), 1) + "px)";
	};

	/** Everything a line does on top of its place at a time: sliding in, filling the width or travelling, or its hold. */
	const lineMotion = (board, line, time, beat = 0, F = 60) => {
		const place = line.place;
		const slide = place.slide ? slideFrame(line, place, time) : "";
		if (place.fill) return slide + fillFrame(line, place, time);
		if (place.travel) return slide + travelFrame(line, place, time);
		return slide + holdFrame(board.hold, line, time, beat, F);
	};

	/** How far a word floats (px, up is negative) under the "float" hold. */
	const floatOffset = (line, wordIndex, size, time) => {
		if (time < line.start) return 0;
		const fadeOut = Number.isFinite(line.exitAt) ? 1 : 1 - clamp01((time - (line.voicesEnd + 1200)) / 400);
		const fadeIn = clamp01((time - line.start) / 600);
		return Math.sin((time / 2600) * Math.PI * 2 + wordIndex * 0.9) * size * 0.06 * fadeIn * fadeOut;
	};


	const scatterOf = (seed) => {
		const random = createRandom(seed);
		return { x: (random() * 2 - 1) * 1.7, y: (random() * 2 - 1) * 1.25, r: (random() * 2 - 1) * 75, s: random() * 0.7 };
	};
	const easeOutElastic = (t) => {
		if (t <= 0) return 0;
		if (t >= 1) return 1;
		return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
	};
	const LETTER_SETTLED = Object.freeze({ opacity: 1, transform: "none" });
	const LETTER_HIDDEN = Object.freeze({ opacity: 0, transform: "none" });
	// What decoding letters flicker through, by script.
	const DECODE_POOLS = Object.freeze({
		latin: [..."ABCDEFGHJKLMNPRSTUVWXYZ0123456789#%&@$?"],
		hangul: [..."가나다라마바사아자차카타파하고노도로모보소오조호구누두루무부수우주후"],
		kana: [..."アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモ"],
		han: [..."日月火水木金土山川田人心花光夢風空海星雨雪愛生"],
		cyrillic: [..."АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЭЮЯ"],
	});
	const decodePoolOf = (ch) => (/\p{Script=Hangul}/u.test(ch) ? "hangul"
		: /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(ch) ? "kana"
			: /\p{Script=Han}/u.test(ch) ? "han"
				: /\p{Script=Cyrillic}/u.test(ch) ? "cyrillic" : "latin");

	/**
	 * A character's state for the letter-by-letter effects. context: count
	 * (letters in the word), wordStart, seed, sway (how much "wave" still
	 * floats) and pace.
	 */
	const charFrame = (fx, char, index, time, context = {}) => {
		const { count = 1, wordStart = char.start, seed = 0, sway = 1, pace = 1 } = context;
		const slow = fxPaceOf(pace);
		switch (fx) {
			case "type": {
				const e = clamp01((time - (char.start - 30)) / 140);
				return { opacity: e, transform: e <= 0 || e >= 1 ? "none" : "scale(" + round(1.35 - 0.35 * easeOutCubic(e), 3) + ")" };
			}
			case "assemble": {
				const e = clamp01((time - (char.start - 380)) / (440 * slow));
				if (e <= 0) return LETTER_HIDDEN;
				if (e >= 1) return LETTER_SETTLED;
				const k = easeOutCubic(e);
				const scatter = scatterOf((seed + index * 2654435761) >>> 0);
				return {
					opacity: clamp01(e * 3),
					transform: "translate(" + round(scatter.x * (1 - k), 3) + "em," + round(scatter.y * (1 - k), 3) + "em) rotate("
						+ round(scatter.r * (1 - k), 1) + "deg) scale(" + round(1 + (1 - k) * scatter.s, 3) + ")",
				};
			}
			case "drop": {
				const e = clamp01((time - (char.start - 60)) / (420 * slow));
				if (e <= 0) return LETTER_HIDDEN;
				return { opacity: clamp01(e * 4), transform: e >= 1 ? "none" : "translateY(" + round((1 - easeOutBounce(e)) * -0.9, 3) + "em)" };
			}
			case "wave": {
				const e = clamp01((time - (char.start - 40)) / (260 * slow));
				if (e <= 0) return LETTER_HIDDEN;
				const bob = Math.sin(time * 0.0052 + index * 0.65) * 0.07 * sway;
				const offset = (1 - easeOutBack(e)) * 0.35 + bob;
				return { opacity: e, transform: Math.abs(offset) < 0.001 ? "none" : "translateY(" + round(offset, 3) + "em)" };
			}
			case "track": {
				// Letters close in from wide tracking (the whole word at once).
				const e = clamp01((time - (wordStart - 90)) / (680 * slow));
				if (e <= 0) return LETTER_HIDDEN;
				if (e >= 1) return LETTER_SETTLED;
				const k = easeOutCubic(e);
				return { opacity: clamp01(e * 1.6), transform: "translateX(" + round((index - (count - 1) / 2) * 0.62 * (1 - k), 3) + "em)" };
			}
			case "bounce": {
				const e = clamp01((time - (char.start - 40)) / (560 * slow));
				if (e <= 0) return LETTER_HIDDEN;
				if (e >= 1) return LETTER_SETTLED;
				const lift = (1 - easeOutElastic(e)) * 0.7;
				return { opacity: clamp01(e * 5), transform: "translateY(" + round(lift, 3) + "em) scale(" + round(1 + Math.min(0, lift) * -0.4, 3) + "," + round(1 - Math.min(0, lift) * -0.3, 3) + ")" };
			}
			case "flicker": {
				const from = char.start - 170;
				if (time < from) return LETTER_HIDDEN;
				if (time >= char.start + 40) return LETTER_SETTLED;
				const bucket = Math.floor((time - from) / 38);
				const random = createRandom((seed + index * 977 + bucket * 2654435761) >>> 0);
				const chance = (time - from) / 210;
				return { opacity: random() < chance ? 1 : random() * 0.25, transform: "none" };
			}
			case "cascade": {
				// Letters fall softly into place one after another, turning as they land.
				const e = clamp01((time - (char.start - 140)) / (520 * slow));
				if (e <= 0) return LETTER_HIDDEN;
				if (e >= 1) return LETTER_SETTLED;
				const k = easeOutCubic(e);
				return { opacity: clamp01(e * 2.2), transform: "translateY(" + round((1 - k) * -0.62, 3) + "em) rotate(" + round((1 - k) * (index % 2 ? 16 : -16), 1) + "deg)" };
			}
			case "ripple": {
				// Each letter grows up from its baseline as it is sung, a ripple running along the word.
				const e = clamp01((time - (char.start - 70)) / (440 * slow));
				if (e <= 0) return LETTER_HIDDEN;
				if (e >= 1) return LETTER_SETTLED;
				const k = easeOutBack(e);
				return { opacity: clamp01(e * 3), transform: "translateY(" + round((1 - k) * 0.22, 3) + "em) scaleY(" + round(0.25 + 0.75 * k, 3) + ")" };
			}
			case "swirl": {
				// Letters spiral in from behind the one before and settle upright.
				const e = clamp01((time - (char.start - 220)) / (620 * slow));
				if (e <= 0) return LETTER_HIDDEN;
				if (e >= 1) return LETTER_SETTLED;
				const k = easeOutCubic(e);
				return { opacity: clamp01(e * 2), transform: "translate(" + round((1 - k) * -0.55, 3) + "em," + round((1 - k) * 0.32, 3) + "em) rotate(" + round((1 - k) * -150, 1) + "deg) scale(" + round(0.55 + 0.45 * k, 3) + ")" };
			}
			case "rain": {
				// Letters start scattered high and low and drop or rise into one line.
				const e = clamp01((time - (char.start - 240)) / (440 * slow));
				if (e <= 0) return LETTER_HIDDEN;
				if (e >= 1) return LETTER_SETTLED;
				const height = scatterOf((seed + index * 2654435761) >>> 0).y * 1.3;
				return { opacity: clamp01(e * 3), transform: "translateY(" + round(height * (1 - easeOutCubic(e)), 3) + "em)" };
			}
			case "decode": {
				// Each letter flickers through random characters of its script and locks onto the right one.
				const begin = char.start - 320 * slow;
				if (time < begin) return LETTER_HIDDEN;
				if (time >= char.start) return LETTER_SETTLED;
				const pool = DECODE_POOLS[decodePoolOf(char.ch)];
				const pick = Math.floor(time / 55) * 7 + index * 13 + seed;
				return { opacity: 0.55 + 0.45 * ((time - begin) / (char.start - begin)), transform: "none", text: pool[((pick % pool.length) + pool.length) % pool.length] };
			}
			default:
				return time >= char.start ? LETTER_SETTLED : LETTER_HIDDEN;
		}
	};

	/**
	 * Smallest scale at which a width x height layer, turned by degrees and
	 * moved by (x, y), still covers a screen of the same size.
	 */
	const coverScale = (degrees, width, height, x = 0, y = 0) => {
		let scale = 0;
		for (const [cx, cy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
			const local = rotate2d((cx * width) / 2 - x, (cy * height) / 2 - y, -degrees);
			scale = Math.max(scale, Math.abs(local.x) / (width / 2), Math.abs(local.y) / (height / 2));
		}
		return scale;
	};

	/**
	 * Rotation, zoom and offset of the video background so it moves like the
	 * far plane of the same camera: it turns with the roll, slides against
	 * 3D swings and travel, and zooms with the dolly and the beat. Given the
	 * time, it is not left turned (uprightAt, interludes) and keeps moving on
	 * its own: a slow turn, drift and breath, and a swing past the camera's
	 * turn while the camera travels between boards.
	 */
	const backgroundFrame = (plan, pose, time = NaN) => {
		const timed = Number.isFinite(time);
		let x = 0;
		let y = 0;
		let swing = 0;
		if (pose.sway) {
			const move = rotate2d(pose.sway.dx, pose.sway.dy, -pose.roll);
			const length = Math.hypot(move.x, move.y);
			if (length > 1) {
				const arc = Math.sin(Math.PI * pose.sway.u);
				const amount = arc * plan.W * (pose.sway.whip ? 0.15 : pose.sway.board ? 0.09 : 0.035);
				x = (-move.x / length) * amount;
				y = (-move.y / length) * amount;
				// Between boards the far plane swings a little past the camera's own turn.
				if (pose.sway.board || pose.sway.whip) swing = arc * (pose.sway.whip ? 9 : 6) * (move.x >= 0 ? 1 : -1);
			}
		}
		// Swings slide the video fully; the standing turn that faces a drum line only a little (it would zoom the video in for the whole line).
		const yaw = (pose.yaw || 0) - (pose.faceYaw || 0) * 0.72;
		const pitch = (pose.pitch || 0) - (pose.facePitch || 0) * 0.72;
		x -= Math.sin((yaw * Math.PI) / 180) * plan.W * 0.55;
		y += Math.sin((pitch * Math.PI) / 180) * plan.H * 0.55;
		const dolly = PERSPECTIVE_PX / (PERSPECTIVE_PX + (pose.dolly || 0) * 0.45);
		let roll = pose.roll;
		let breath = 1;
		if (timed) {
			roll += uprightAt(plan, time);
			// Interludes: the picture comes back upright under the camera's swing.
			const rest = restAt(plan, time);
			if (rest > 0) roll += (Math.round(roll / 360) * 360 - roll) * rest;
			const sway = BG_SWAY[plan.tempo] || BG_SWAY.mid;
			roll += Math.sin(time * 0.00057 + 0.4) * sway + Math.sin(time * 0.00131 + 1.7) * sway * 0.3 + swing;
			x += Math.sin(time * 0.00041 + 2.2) * plan.W * 0.018;
			y += Math.sin(time * 0.00049 + 0.9) * plan.H * 0.018;
			breath = 1 + 0.05 * (0.5 + 0.5 * Math.sin(time * 0.00071 + 1.1));
		}
		const wanted = coverScale(-roll, plan.W, plan.H) * 1.14 * dolly * breath * (1 + (pose.beat || 0) * 0.06);
		const scale = Math.max(wanted, coverScale(-roll, plan.W, plan.H, x, y) * 1.01);
		return { rotate: -roll, scale, x, y };
	};

	/** Opacity of the letterbox bars at a time. */
	const barsLevel = (plan, time) => {
		let level = 0;
		for (const window of plan?.bars || []) {
			if (time < window.start || time > window.end + 500) continue;
			const into = easeInOutCubic(clamp01((time - window.start) / 500));
			const out = Number.isFinite(window.end) ? 1 - easeInOutCubic(clamp01((time - window.end) / 500)) : 1;
			level = Math.max(level, into * out);
		}
		return level;
	};

	/** The colour panel sweeping across the screen, as a -1..1 position (null when none). */
	const panelAt = (plan, time) => {
		for (const panel of plan?.panels || []) {
			if (time >= panel.start && time <= panel.end) return { position: lerp(-1, 1, easeInOutCubic((time - panel.start) / Math.max(1, panel.end - panel.start))), color: panel.color };
		}
		return null;
	};

	/**
	 * How much of a board's stroke (a strip's track, a split's divider) is
	 * drawn: it reaches each line's stop while that line is sung.
	 */
	const strokeLevel = (plan, board, stroke, time) => {
		let level = 0;
		stroke.stops.forEach((stop, local) => {
			const line = plan.lines[board.first + local];
			const begin = line.start - 300;
			if (time <= begin) return;
			const amount = easeInOutCubic(clamp01((time - begin) / clamp(line.end - line.start + 300, 600, 1800)));
			level = Math.max(level, lerp(local ? stroke.stops[local - 1] : 0, stop, amount));
		});
		return level;
	};

	/**
	 * The colour field on screen at a time (posters): its colour and how far
	 * it has opened (0 to 1). Fields that follow each other cut straight
	 * from colour to colour; the first opens from a band and the last closes
	 * into one.
	 */
	const floodAt = (plan, time) => {
		const floods = plan?.floods || [];
		for (let index = floods.length - 1; index >= 0; index -= 1) {
			const flood = floods[index];
			if (time < flood.start) continue;
			if (time > flood.end) return null;
			const previous = floods[index - 1];
			const next = floods[index + 1];
			const open = previous && flood.start - previous.end < 90 ? 1 : easeOutExpo(clamp01((time - flood.start) / 240));
			const close = next && next.start - flood.end < 90 ? 1 : 1 - easeInOutCubic(clamp01((time - (flood.end - 220)) / 220));
			return { color: flood.color, level: Math.min(open, close) };
		}
		return null;
	};

	/**
	 * The clip a board opening out of a circle (iris) or a band across the
	 * middle (open) is seen through while the camera comes in ("" once open).
	 * In the board's own px, centred on its first line's frame.
	 */
	const revealClip = (plan, board, time) => {
		if (!board.index || !REVEALS.has(board.enter)) return "";
		const first = plan.lines[board.first];
		const k = easeInOutCubic(clamp01((time - board.appear) / Math.max(1, first.arrive - board.appear)));
		if (k >= 1) return "";
		const centre = board.frames[0];
		if (board.enter === "iris") return "circle(" + round(k * Math.hypot(plan.W, plan.H) * 0.62) + "px at " + round(centre.x) + "px " + round(centre.y) + "px)";
		const half = k * plan.H * 0.62;
		const along = plan.W * 3;
		const turn = (centre.roll || 0) + (board.dutch || 0);
		const points = [[-along, -half], [along, -half], [along, half], [-along, half]].map(([x, y]) => {
			const point = rotate2d(x, y, turn);
			return round(centre.x + point.x) + "px " + round(centre.y + point.y) + "px";
		});
		return "polygon(" + points.join(",") + ")";
	};

	/** A plate (a slot's band, an arch's ring) arriving with its line: 0 before, 1 once it has landed. */
	const plateLevel = (plan, board, plate, time) => {
		const since = time - (plan.lines[board.first + plate.line].start - 240);
		if (since <= 0) return 0;
		const amount = clamp01(since / (280 * fxPaceOf(plan.pace)));
		let level = Math.max(0.001, easeOutExpo(amount));
		// A plate that belongs to one line of a one-at-a-time composition (a seal) goes when the next line comes in.
		const next = plate.solo ? plan.lines[board.first + plate.line + 1] : null;
		if (next && next.board === board.index) level *= 1 - clamp01((time - (next.start - 260)) / 220);
		return level <= 0.001 && next && time > next.start ? 0 : level;
	};

	/**
	 * Outline and solid opacity of a line on its board. One-at-a-time
	 * compositions show only the current line.
	 */
	const levelsOn = (board, line, distance, time) => {
		if (board.solo) {
			if (distance <= 0) return { ghost: 0, solid: 1 };
			// Handing over to the next line: its exit plays, the last of it fading out.
			const span = line.exitSpan || line.soloFade || 120;
			return { ghost: 0, solid: Number.isFinite(line.soloOut) ? 1 - clamp01((time - (line.soloOut + span * 0.55)) / (span * 0.45)) : 1 - clamp01(distance / 0.4) };
		}
		if (board.preview || !Number.isFinite(line.peekAt)) {
			// A line still being sung (overlapping the next one: a duet, an echo) stays bright.
			const singing = distance > 0 && time >= line.start && time < line.end + 150;
			return lineLevels(singing ? Math.min(distance, 0.2) : distance);
		}
		return lifeLevels(line, time);
	};

	/**
	 * A line that comes and goes: nothing until its outline peeks in, the
	 * outline of its words still to come while it is sung, full while it is
	 * the latest line, a dim echo once the next one starts, gone after its
	 * exit (the words leave one after another, paintWords).
	 */
	const lifeLevels = (line, time) => {
		if (time < line.peekAt || time >= line.exitAt + line.exitSpan) return { ghost: 0, solid: 0 };
		const ghost = time < line.start
			? PEEK_GHOST * easeOutCubic(clamp01((time - line.peekAt) / 320))
			: SINGING_GHOST * (1 - clamp01((time - line.voicesEnd) / 260));
		const solid = time > line.dimAt ? lerp(1, ECHO_SOLID, easeOutCubic(clamp01((time - line.dimAt) / ECHO_DIM_MS))) : 1;
		return { ghost, solid };
	};

	const pure = Object.freeze({
		PERSPECTIVE_PX,
		hashString,
		leadSyllablesOf,
		hasRealTiming,
		buildWords,
		buildModel,
		modelSignature,
		lineEnergies,
		paletteFrom,
		fontNeeds,
		layoutBlock,
		compose,
		lineIndexAt,
		progressAt,
		cameraPose,
		viewDepth,
		boardVisibility,
		restAt,
		lineLevels,
		lifeLevels,
		exitFrame,
		holdFrame,
		wordEntrance,
		solidFrame,
		charFrame,
		backgroundFrame,
		uprightAt,
		coverScale,
		barsLevel,
		panelAt,
		strokeLevel,
		facingOf,
		floodAt,
		plateLevel,
		levelsOn,
		piecesOf,
		expandPieces,
		exitCharFrame,
		EXIT_NAMES: [...EXIT_NAMES],
		LETTER_EXITS,
		INTERLUDE_STYLES,
		interludesOf,
		revealClip,
		fillFrame,
		travelFrame,
		lineMotion,
		deepOf,
	});

	// ---------------------------------------------------------------------
	// AI direction: cached per song, one request at a time per song
	// ---------------------------------------------------------------------

	const directionRequests = new Map();
	const trackIdOf = (uri) => {
		const id = root.Utils?.extractTrackId?.(uri);
		return id || String(uri || "").split(":").pop() || String(uri || "");
	};

	/**
	 * The AI direction for a song: { status: "ready", raw } from the cache or a
	 * provider, { status: "off" } without a motion-capable provider, or
	 * { status: "failed", error }.
	 */
	const requestDirection = ({ trackUri, model, title = "", artist = "", tempo = null, songLang = "", energy = null }) => {
		const director = root.ivLyricsMotionDirector;
		if (!director || !trackUri || !model?.length) return Promise.resolve({ status: "off" });
		const sourceHash = hashString(modelSignature(model)).toString(36) + "-v" + director.VERSION;
		const key = trackUri + "\u0002" + sourceHash;
		if (directionRequests.has(key)) return directionRequests.get(key);
		const request = (async () => {
			const trackId = trackIdOf(trackUri);
			const cache = root.LyricsCache;
			try {
				const cached = await cache?.getMotionDirection?.(trackId, sourceHash);
				if (cached?.raw) return { status: "ready", raw: cached.raw, cached: true };
			} catch {
				// A cache miss only means asking the AI.
			}
			const manager = root.AIAddonManager;
			const providers = manager?.getEnabledProvidersFor?.("motionDirection") || [];
			if (typeof manager?.generateMotionDirection !== "function" || !providers.length) return { status: "off" };
			const raw = await manager.generateMotionDirection({
				title,
				artist,
				// The lines with what the song says about them (energy, choruses, repeats, held words) and the cuts its structure suggests.
				lines: director.promptLines(model, { energy }),
				cuts: director.promptShots?.(model) || [],
				vocabulary: director.vocabulary(),
				tempo: tempo || director.tempoOf(model),
				language: songLang,
			});
			const checked = director.normalizeDirection(raw, model, {});
			if (checked.coverage < 0.5) throw new Error("The AI direction covered too few lines");
			try {
				await cache?.setMotionDirection?.(trackId, sourceHash, { raw, version: director.VERSION });
			} catch {
				// Not cached: the next play asks again.
			}
			return { status: "ready", raw };
		})().catch((error) => ({ status: "failed", error: String(error?.message || error) }));
		directionRequests.set(key, request);
		request.then(() => directionRequests.delete(key));
		return request;
	};

	// ---------------------------------------------------------------------
	// Renderer: one animation loop writes transforms; React renders the shell
	// ---------------------------------------------------------------------

	const translationOf = (line) => {
		for (const value of [line?.text2, line?.translationText, line?.translation, line?.transText]) {
			if (typeof value === "string" && value.trim()) return value.trim();
		}
		return "";
	};
	const timecode = (ms) => {
		const seconds = Math.max(0, Math.floor(ms / 1000));
		return String(Math.floor(seconds / 60)).padStart(2, "0") + ":" + String(seconds % 60).padStart(2, "0");
	};
	const pad2 = (value) => String(Math.max(0, value)).padStart(2, "0");
	const applyFont = (element, spec) => {
		element.style.fontFamily = spec.family;
		element.style.fontWeight = String(spec.weight);
		element.style.fontStyle = spec.style;
		if (spec.spacing) element.style.letterSpacing = spec.spacing + "em";
	};
	// Accents drawn with an extra element behind or around the emphasised word.
	const BOX_ACCENTS = new Set(["underline", "mark", "stamp", "bracket"]);
	const SVG_NS = "http://www.w3.org/2000/svg";
	// A hand-drawn loop around a word, in a unit box: it overshoots its start like a pen stroke.
	const LOOP_PATH = [
		["M", 0.05, 0.6], ["C", 0.0, 0.24, 0.32, 0.03, 0.58, 0.04], ["C", 0.88, 0.05, 1.03, 0.3, 0.97, 0.6],
		["C", 0.92, 0.9, 0.5, 1.02, 0.24, 0.94], ["C", 0.0, 0.86, -0.03, 0.48, 0.16, 0.26],
	];

	/** The loop of the "circle" accent, sized to a word. */
	const createLoop = (document, width, height, stroke) => {
		const svg = document.createElementNS(SVG_NS, "svg");
		svg.setAttribute("class", "ivlyrics-motion-loop");
		svg.setAttribute("viewBox", "0 0 " + round(width) + " " + round(height));
		svg.setAttribute("aria-hidden", "true");
		svg.setAttribute("focusable", "false");
		svg.style.width = round(width) + "px";
		svg.style.height = round(height) + "px";
		const path = document.createElementNS(SVG_NS, "path");
		path.setAttribute("d", LOOP_PATH.map(([command, ...points]) => command + points.map((value, index) => round(value * (index % 2 ? height : width))).join(" ")).join(" "));
		path.setAttribute("pathLength", "1");
		path.setAttribute("stroke-width", String(round(stroke, 2)));
		svg.appendChild(path);
		return svg;
	};

	/** The squiggle of the "scribble" accent: a pen line wobbling under a word. */
	const createScribble = (document, width, height, stroke) => {
		const waves = Math.max(3, Math.round(width / (height * 1.5)));
		const step = width / waves;
		let d = "M0 " + round(height * 0.5);
		for (let index = 0; index < waves; index += 1) {
			d += " Q" + round(step * (index + 0.5)) + " " + round(index % 2 ? height * 1.05 : -height * 0.05) + " " + round(step * (index + 1)) + " " + round(height * 0.5);
		}
		const svg = document.createElementNS(SVG_NS, "svg");
		svg.setAttribute("class", "ivlyrics-motion-loop is-scribble");
		svg.setAttribute("viewBox", "0 0 " + round(width) + " " + round(height));
		svg.setAttribute("aria-hidden", "true");
		svg.setAttribute("focusable", "false");
		svg.style.width = round(width) + "px";
		svg.style.height = round(height) + "px";
		const path = document.createElementNS(SVG_NS, "path");
		path.setAttribute("d", d);
		path.setAttribute("pathLength", "1");
		path.setAttribute("stroke-width", String(round(stroke, 2)));
		svg.appendChild(path);
		return svg;
	};

	// A translation shows while its line is sung and this long after; between lines it steps aside.
	const SUBTITLE_LINGER_MS = 700;
	const SVG_FILTER_UNITS = Object.freeze({ x: "-0.1", y: "-0.3", width: "1.2", height: "1.6" });
	let engineSerial = 0;

	/**
	 * Outlines drawn round each word's shape: the text filled, widened and
	 * hollowed by an SVG filter (half the width outside the letters, half
	 * inside, like the stroke it replaces). A text stroke also traces every
	 * contour inside the letters where a variable face's parts overlap (Hangul
	 * in Pretendard, Han in Noto Sans TC), which reads as a broken wireframe.
	 * The desktop app only (ivLyricsMotionConfig.shapedOutlines): each outline
	 * is drawn once into its own layer, which the phones' WebViews are spared.
	 */
	const createOutlines = (document, defs) => {
		if (!defs || root.ivLyricsMotionConfig?.shapedOutlines === false || typeof document?.createElementNS !== "function") return () => "";
		engineSerial += 1;
		const prefix = "ivlyrics-motion-ring-" + engineSerial + "-";
		const filters = new Map();
		const node = (name, attributes) => {
			const element = document.createElementNS(SVG_NS, name);
			for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
			return element;
		};
		/** The filter for an outline half this wide (CSS px of the element) either side of the letters' edge. */
		return (half) => {
			const radius = Math.max(0.5, Math.round(half * 4) / 4);
			let id = filters.get(radius);
			if (!id) {
				id = prefix + filters.size;
				const filter = node("filter", { id, ...SVG_FILTER_UNITS, "color-interpolation-filters": "sRGB" });
				filter.appendChild(node("feMorphology", { in: "SourceGraphic", operator: "dilate", radius, result: "outer" }));
				filter.appendChild(node("feMorphology", { in: "SourceAlpha", operator: "erode", radius, result: "inner" }));
				filter.appendChild(node("feComposite", { in: "outer", in2: "inner", operator: "out" }));
				defs.appendChild(filter);
				filters.set(radius, id);
			}
			return "url(#" + id + ")";
		};
	};

	/** Sets an outline's text: shaped by the filter when there is one, else stroked (style.css). */
	const setOutlineText = (document, element, text, filter) => {
		if (!filter) {
			element.textContent = text;
			return;
		}
		element.classList.add("is-shaped");
		const shape = document.createElement("span");
		shape.className = "ivlyrics-motion-shape";
		shape.style.filter = filter;
		shape.textContent = text;
		element.appendChild(shape);
	};

	const createEngine = ({ stage, viewport, camera, scrim, wash, flood, interlude, flash, panel, bars, subtitle, live, hudShot, hudTime, defs }) => {
		const document = root.document;
		const shapes = root.ivLyricsMotionShapes;
		const outlineOf = createOutlines(document, defs);
		let plan = null;
		let pending = null;
		let planSetAt = 0;
		let lyrics = [];
		let pulses = null;
		let trackUri = "";
		let playing = false;
		let frameId = 0;
		let timerId = 0;
		let destroyed = false;
		let currentLine = -2;
		let currentBoard = -2;
		let background = null;
		let backgroundCheckedAt = -Infinity;
		let lastPose = null;
		let lastFrameAt = 0;
		let swapFlashAt = -Infinity;
		const mounted = new Map();
		const cache = { camera: {}, viewport: {}, flash: {}, wash: {}, background: {}, hud: {}, panel: {}, bars: {}, rest: {}, flood: {}, cue: {} };
		const write = (store, key, value, apply) => {
			if (store[key] === value) return;
			store[key] = value;
			apply(value);
		};

		const readTime = (frameTime) => {
			const position = root.ivLyricsLyricRendererPrimitives?.getFrameAlignedLyricsPlaybackPosition?.(frameTime);
			if (Number.isFinite(position)) return position;
			const fallback = Number(root.Spicetify?.Player?.getProgress?.());
			return Number.isFinite(fallback) ? fallback : 0;
		};
		const playerUri = () => root.Utils?.getPlayerPlaybackSnapshot?.()?.uri || root.Spicetify?.Player?.data?.item?.uri || "";
		const now = () => (typeof root.performance?.now === "function" ? root.performance.now() : Date.now());

		const findBackground = (at) => {
			if (background?.isConnected) return background;
			if (at - backgroundCheckedAt < 1000) return null;
			backgroundCheckedAt = at;
			const scope = stage.closest?.("#lyrics-fullscreen-container, .lyrics-lyricsContainer-LyricsContainer") || document;
			background = scope.querySelector?.(".ivlyrics-video-background-camera") || document.querySelector?.(".ivlyrics-video-background-camera") || null;
			cache.background = {};
			background?.classList?.add("is-motion-camera");
			return background;
		};
		const releaseBackground = () => {
			if (!background) return;
			background.classList?.remove("is-motion-camera");
			background.style.rotate = "";
			background.style.scale = "";
			background.style.translate = "";
			background.style.filter = "";
			background = null;
			cache.background = {};
		};

		const unmount = (index) => {
			const entry = mounted.get(index);
			if (!entry) return;
			entry.el.remove();
			mounted.delete(index);
		};
		const unmountAll = () => {
			for (const index of [...mounted.keys()]) unmount(index);
			currentLine = -2;
			currentBoard = -2;
			clearScenes();
		};
		// ---- Interludes: scenes over the video while no lyrics are on screen (interludesOf)
		const scenesShown = new Map();
		let cueEl = null;
		const node = (tag, className, parent) => {
			const element = document.createElement(tag);
			if (className) element.className = className;
			parent?.appendChild(element);
			return element;
		};
		/** Beats within span ms before time, latest first: the song's analysis, or without one the tempo's. */
		const beatsBefore = (scene, time, span) => {
			const found = [];
			if (pulses?.times?.length) {
				const times = pulses.times;
				let low = 0;
				let high = times.length;
				while (low < high) {
					const middle = (low + high) >>> 1;
					if (times[middle] <= time) low = middle + 1;
					else high = middle;
				}
				for (let index = low - 1; index >= 0 && time - times[index] <= span && found.length < 16; index -= 1) {
					found.push({ time: times[index], strength: pulses.strengths[index] || 0.5 });
				}
				return found;
			}
			const count = Math.floor((time - scene.start) / scene.beat);
			for (let index = count; index >= 0 && time - (scene.start + index * scene.beat) <= span && found.length < 16; index -= 1) {
				found.push({ time: scene.start + index * scene.beat, strength: index % 4 === 0 ? 1 : 0.62 });
			}
			return found;
		};
		/** How hard the beat hits now (0 to 1), dying away after each beat. */
		const beatLevel = (scene, time) => {
			let level = 0;
			for (const hit of beatsBefore(scene, time, 600)) level = Math.max(level, clamp01(hit.strength * 1.15) * Math.exp(-(time - hit.time) / 190));
			return level;
		};

		const mountScene = (scene) => {
			const W = plan.W;
			const H = plan.H;
			const least = Math.min(W, H);
			const random = createRandom(scene.seed);
			const el = node("div", "ivlyrics-motion-scene is-" + scene.style);
			const state = { el, cache: {} };
			const part = (element) => ({ el: element, cache: {} });
			const halo = (size) => {
				const ring = node("div", "ivlyrics-motion-scene-halo", el);
				ring.style.width = round(size) + "px";
				ring.style.height = round(size) + "px";
				if (shapes?.createSvg) ring.appendChild(shapes.createSvg(document, shapes.motifOf("halo"), size).svg);
				return part(ring);
			};
			switch (scene.style) {
				case "title": {
					const set = scene.title;
					const block = node("div", "ivlyrics-motion-scene-title", el);
					applyFont(block, set.spec);
					block.style.fontSize = round(set.size) + "px";
					state.block = part(block);
					state.letters = [];
					for (const chunk of set.title.split(/(\s+)/u)) {
						if (!chunk) continue;
						if (/^\s+$/u.test(chunk)) {
							block.appendChild(document.createTextNode(" "));
							continue;
						}
						const word = node("span", "ivlyrics-motion-scene-word", block);
						for (const grapheme of graphemesOf(chunk)) {
							const letter = node("span", "ivlyrics-motion-scene-letter", word);
							letter.textContent = grapheme;
							state.letters.push(part(letter));
						}
					}
					state.rule = part(node("div", "ivlyrics-motion-scene-rule", el));
					if (set.artist) {
						const by = node("div", "ivlyrics-motion-scene-artist", el);
						applyFont(by, set.artistSpec);
						by.style.fontSize = round(clamp(set.size * 0.22, 13, 42)) + "px";
						by.textContent = set.artist;
						state.artist = part(by);
					}
					break;
				}
				case "pulse": {
					state.rings = Array.from({ length: 7 }, () => {
						const ring = node("div", "ivlyrics-motion-scene-ring", el);
						ring.style.width = round(least * 0.5) + "px";
						ring.style.height = round(least * 0.5) + "px";
						return part(ring);
					});
					state.halo = halo(least * 0.62);
					state.core = part(node("div", "ivlyrics-motion-scene-core", el));
					break;
				}
				case "eq": {
					const row = node("div", "ivlyrics-motion-scene-eq", el);
					state.bars = Array.from({ length: 36 }, () => part(node("div", "ivlyrics-motion-scene-bar", row)));
					node("div", "ivlyrics-motion-scene-axis", el);
					break;
				}
				case "marquee": {
					const set = scene.title;
					const field = node("div", "ivlyrics-motion-scene-marquee", el);
					field.style.transform = "translate(-50%,-50%) rotate(" + round((random() < 0.5 ? -1 : 1) * between(random, 5, 9), 2) + "deg)";
					const copies = Math.ceil((W * 1.9) / set.unitWidth) + 2;
					state.unit = set.unitWidth;
					state.rows = Array.from({ length: 4 }, (_, index) => {
						const row = node("div", "ivlyrics-motion-scene-row" + (index % 2 ? " is-fill" : " is-outline"), field);
						applyFont(row, set.spec);
						row.style.fontSize = round(set.rowSize) + "px";
						row.textContent = set.unit.repeat(copies);
						return part(row);
					});
					break;
				}
				case "orbit": {
					const names = scene.motifs.filter((name) => shapes?.motifOf?.(name));
					state.items = Array.from({ length: 8 }, (_, index) => {
						const item = node("div", "ivlyrics-motion-scene-motif" + (index % 3 === 1 ? " is-alt" : ""), el);
						const size = least * between(random, 0.07, 0.14);
						item.style.width = round(size) + "px";
						item.style.height = round(size) + "px";
						const motif = shapes?.motifOf?.(names[index % Math.max(1, names.length)] || "sparkle");
						if (motif) item.appendChild(shapes.createSvg(document, motif, size).svg);
						const entry = part(item);
						entry.orbit = {
							radius: least * (0.17 + 0.045 * index),
							speed: (index % 2 ? 1 : -1) * between(random, 7, 16),
							phase: random() * 360,
							spin: (random() < 0.5 ? -1 : 1) * between(random, 10, 40),
							tilt: between(random, 0.5, 0.72),
						};
						return entry;
					});
					state.halo = halo(least * 0.72);
					break;
				}
				case "stripes": {
					const count = 12;
					state.spacing = W * 0.17;
					const field = node("div", "ivlyrics-motion-scene-stripes", el);
					field.style.width = round(state.spacing * count) + "px";
					field.style.transform = "translate(-50%,-50%) rotate(" + round((random() < 0.5 ? -1 : 1) * between(random, 18, 30), 2) + "deg)";
					state.bands = Array.from({ length: count }, (_, index) => {
						const band = node("div", "ivlyrics-motion-scene-band is-" + ["a", "b", "w"][index % 3], field);
						band.style.width = round(W * 0.075) + "px";
						return part(band);
					});
					state.frames = [0.46, 0.32].map((share) => {
						const frameEl = node("div", "ivlyrics-motion-scene-frame", el);
						frameEl.style.width = round(W * share) + "px";
						frameEl.style.height = round(H * share * 1.05) + "px";
						return part(frameEl);
					});
					break;
				}
				case "grid": {
					state.sun = part(node("div", "ivlyrics-motion-scene-sun", el));
					state.sun.el.style.width = round(least * 0.46) + "px";
					state.sun.el.style.height = round(least * 0.46) + "px";
					const floor = node("div", "ivlyrics-motion-scene-floor", el);
					state.lines = part(node("div", "ivlyrics-motion-scene-lines", floor));
					node("div", "ivlyrics-motion-scene-horizon", el);
					state.cell = 90;
					break;
				}
				case "count": {
					const digits = node("div", "ivlyrics-motion-scene-count", el);
					digits.style.fontSize = round(H * 0.42) + "px";
					state.outline = part(node("span", "ivlyrics-motion-scene-digits is-outline", digits));
					state.fill = part(node("span", "ivlyrics-motion-scene-digits is-fill", digits));
					node("div", "ivlyrics-motion-scene-rail", el);
					state.track = part(node("div", "ivlyrics-motion-scene-track", el));
					break;
				}
				case "wave":
				default: {
					state.waves = [0.34, 0.22, 0.47].map((share, index) => {
						const length = W * share;
						const amplitude = H * (0.09 + index * 0.03);
						const width = W * 2 + length * 2;
						const svg = document.createElementNS(SVG_NS, "svg");
						svg.setAttribute("class", "ivlyrics-motion-scene-wave is-" + index);
						svg.setAttribute("viewBox", "0 " + round(-amplitude * 1.6) + " " + round(width) + " " + round(amplitude * 3.2));
						svg.setAttribute("width", String(round(width)));
						svg.setAttribute("height", String(round(amplitude * 3.2)));
						svg.setAttribute("preserveAspectRatio", "none");
						svg.setAttribute("aria-hidden", "true");
						const path = document.createElementNS(SVG_NS, "path");
						let d = "M0 0Q" + round(length / 4) + " " + round(-amplitude) + " " + round(length / 2) + " 0";
						for (let x = length; x <= width + 0.5; x += length / 2) d += "T" + round(x) + " 0";
						path.setAttribute("d", d);
						path.setAttribute("fill", "none");
						path.setAttribute("stroke", "currentColor");
						path.setAttribute("stroke-width", index === 1 ? "4" : "3");
						path.setAttribute("stroke-linecap", "round");
						path.setAttribute("vector-effect", "non-scaling-stroke");
						svg.appendChild(path);
						el.appendChild(svg);
						const entry = part(svg);
						entry.length = length;
						return entry;
					});
					break;
				}
			}
			return state;
		};

		const paintScene = (state, scene, time) => {
			const W = plan.W;
			const since = time - scene.start;
			const span = Math.max(1, scene.end - scene.start);
			const beat = beatLevel(scene, time);
			const move = (entry, value) => write(entry.cache, "transform", value, (next) => { entry.el.style.transform = next; });
			const fade = (entry, value) => write(entry.cache, "opacity", round(clamp01(value), 3), (next) => { entry.el.style.opacity = String(next); });
			switch (scene.style) {
				case "title": {
					// The letters rise in one after another, drift apart as the card holds, and go before the lyrics come.
					const count = state.letters.length;
					const step = Math.min(55, 900 / Math.max(1, count));
					const drift = 0.05 * easeInOutSine(clamp01(since / span));
					state.letters.forEach((letter, index) => {
						const k = easeOutExpo(clamp01((since - 140 - index * step) / 640));
						const out = easeInCubic(clamp01((time - (scene.end - 950 + index * step * 0.5)) / 460));
						fade(letter, k * (1 - out));
						move(letter, "translate(" + round((index - (count - 1) / 2) * drift, 3) + "em," + round((1 - k) * 0.6 - out * 0.35, 3) + "em) scale(" + round(1 + (1 - k) * 0.25, 3) + ")");
					});
					move(state.block, "scale(" + round(1 + 0.035 * clamp01(since / span) + beat * 0.012, 4) + ")");
					const open = easeInOutCubic(clamp01((since - 380) / 820)) * (1 - easeInCubic(clamp01((time - (scene.end - 700)) / 420)));
					move(state.rule, "scaleX(" + round(open, 3) + ")");
					if (state.artist) {
						const k = easeOutCubic(clamp01((since - 650) / 600)) * (1 - clamp01((time - (scene.end - 800)) / 420));
						fade(state.artist, k);
						move(state.artist, "translateY(" + round((1 - k) * 0.6, 3) + "em)");
					}
					break;
				}
				case "pulse": {
					// A ring bursts out from the centre on every beat.
					const hits = beatsBefore(scene, time, 1800).filter((hit) => hit.strength >= 0.3);
					state.rings.forEach((ring, index) => {
						const hit = hits[index];
						if (!hit) {
							fade(ring, 0);
							return;
						}
						const t = clamp01((time - hit.time) / 1800);
						fade(ring, (0.4 + 0.5 * clamp01(hit.strength)) * Math.pow(1 - t, 1.4));
						move(ring, "translate(-50%,-50%) scale(" + round(0.22 + 2.1 * easeOutCubic(t), 3) + ")");
					});
					fade(state.halo, 0.55);
					move(state.halo, "translate(-50%,-50%) rotate(" + round((since * 0.014) % 360, 2) + "deg) scale(" + round(1 + beat * 0.07, 3) + ")");
					move(state.core, "translate(-50%,-50%) scale(" + round(0.6 + beat * 0.9, 3) + ")");
					break;
				}
				case "eq": {
					const count = state.bars.length;
					state.bars.forEach((bar, index) => {
						const phase = index / count;
						const swell = 0.5 + 0.5 * Math.sin(time * 0.0021 + phase * 6.283 + (scene.seed % 7));
						const jitter = 0.5 + 0.5 * Math.sin(time * 0.0113 * (1 + (index % 5) * 0.17) + index * 1.7);
						const middle = 1 - Math.abs(phase - 0.5) * 1.1;
						const grow = easeOutCubic(clamp01((since - Math.abs(index - count / 2) * 18) / 520));
						const height = clamp((0.05 + 0.22 * swell * middle + beat * (0.35 + 0.55 * jitter) * middle + 0.08 * jitter) * grow, 0.02, 1);
						move(bar, "scaleY(" + round(height, 3) + ")");
					});
					break;
				}
				case "marquee": {
					// The title in huge rows sliding past each other, outlined and filled in turn.
					state.rows.forEach((row, index) => {
						const way = index % 2 ? 1 : -1;
						const travel = (way * W * (0.045 + index * 0.012) * since) / 1000 + index * state.unit * 0.37;
						const shift = ((travel % state.unit) + state.unit) % state.unit;
						const rise = (1 - easeOutExpo(clamp01((since - index * 110) / 760))) * 0.8;
						move(row, "translate(" + round(shift - state.unit, 1) + "px," + round(rise, 3) + "em)");
					});
					break;
				}
				case "orbit": {
					// The song's motifs on tilted orbits, larger and brighter as they come round to the front.
					state.items.forEach((item, index) => {
						const { radius, speed, phase, spin, tilt } = item.orbit;
						const angle = ((phase + (speed * since) / 1000) * Math.PI) / 180;
						const near = (Math.sin(angle) + 1) / 2;
						const pop = easeOutBack(clamp01((since - index * 120) / 560));
						const scale = Math.max(0, pop * (0.75 + 0.4 * near) * (1 + (index % 2 ? beat * 0.3 : 0)));
						fade(item, (0.4 + 0.5 * near) * clamp01(pop));
						move(item, "translate(-50%,-50%) translate(" + round(Math.cos(angle) * radius) + "px," + round(Math.sin(angle) * radius * tilt) + "px) rotate("
							+ round((spin * since) / 1000 + phase, 1) + "deg) scale(" + round(scale, 3) + ")");
					});
					fade(state.halo, 0.5);
					move(state.halo, "translate(-50%,-50%) rotate(" + round((-since * 0.01) % 360, 2) + "deg) scale(" + round(1 + beat * 0.05, 3) + ")");
					break;
				}
				case "stripes": {
					const total = state.spacing * state.bands.length;
					const travel = (since / 1000) * W * 0.11;
					state.bands.forEach((band, index) => {
						const x = (((index * state.spacing + travel) % total) + total) % total;
						move(band, "translateX(" + round(x) + "px)");
						fade(band, 0.72 + (index % 2 ? beat * 0.28 : 0));
					});
					state.frames.forEach((frameEntry, index) => {
						const way = index ? -1 : 1;
						const k = easeOutExpo(clamp01((since - index * 160) / 700));
						move(frameEntry, "translate(-50%,-50%) rotate(" + round(way * since * 0.004, 2) + "deg) scale(" + round((0.6 + 0.4 * k) * (1 + way * beat * 0.05), 3) + ")");
						fade(frameEntry, k * 0.85);
					});
					break;
				}
				case "grid": {
					// The floor rushes at the camera half a cell a beat; it flares on the beat.
					const travel = (since / scene.beat) * state.cell * 0.5;
					move(state.lines, "translateY(" + round(travel % state.cell, 1) + "px)");
					fade(state.lines, 0.7 + beat * 0.3);
					const rise = easeOutCubic(clamp01(since / 1200));
					fade(state.sun, 0.62 * rise);
					move(state.sun, "translate(-50%," + round(-100 + (1 - rise) * 30, 1) + "%) scale(" + round(1 + beat * 0.04, 3) + ")");
					break;
				}
				case "count": {
					// The seconds to the lyrics, each filling up as it runs out.
					const target = scene.cue ?? scene.end;
					const left = target - time;
					const text = String(Math.max(0, Math.ceil(left / 1000)));
					for (const entry of [state.outline, state.fill]) write(entry.cache, "text", text, (value) => { entry.el.textContent = value; });
					const within = left > 0 ? 1 - (left % 1000) / 1000 : 1;
					const enter = easeOutExpo(clamp01(within * 4));
					const shape = "translateY(" + round((1 - enter) * 0.18, 3) + "em) scale(" + round(1 + beat * 0.03, 3) + ")";
					move(state.outline, shape);
					move(state.fill, shape);
					write(state.fill.cache, "clip", "inset(" + round((1 - within) * 100, 1) + "% -0.2em -0.2em -0.2em)", (value) => { state.fill.el.style.clipPath = value; });
					fade(state.outline, 0.25 + 0.75 * enter);
					move(state.track, "translateX(-50%) scaleX(" + round(clamp01(since / Math.max(1, target - scene.start)), 4) + ")");
					break;
				}
				case "wave":
				default: {
					state.waves.forEach((wave, index) => {
						const travel = ((since / 1000) * W * (0.05 + index * 0.025)) % wave.length;
						const lift = clamp(0.45 + 0.3 * Math.sin(time * 0.0009 * (index + 1) + index) + beat * (0.9 - index * 0.2), 0.15, 1.6);
						move(wave, "translate(" + round(index === 1 ? travel - wave.length : -travel) + "px,-50%) scaleY(" + round(lift, 3) + ")");
					});
					break;
				}
			}
		};

		const clearScenes = () => {
			for (const state of scenesShown.values()) state.el.remove();
			scenesShown.clear();
			cueEl?.remove();
			cueEl = null;
			cache.cue = {};
		};

		/** The scenes due now, faded in and out at their ends, and the cue dots counting in the lyrics. */
		const paintInterludes = (time) => {
			if (!interlude) return;
			const scenes = plan.interludes || [];
			const due = new Set();
			for (const scene of scenes) if (time >= scene.start - 30 && time <= scene.end + 30) due.add(scene.index);
			for (const [index, state] of scenesShown) {
				if (due.has(index)) continue;
				state.el.remove();
				scenesShown.delete(index);
			}
			for (const index of due) {
				const scene = scenes[index];
				let state = scenesShown.get(index);
				if (!state) {
					state = mountScene(scene);
					scenesShown.set(index, state);
					interlude.appendChild(state.el);
				}
				const level = round(Math.min(clamp01((time - scene.start) / SCENE_FADE_MS), clamp01((scene.end - time) / SCENE_FADE_MS)), 3);
				write(state.cache, "opacity", level, (value) => { state.el.style.opacity = String(value); });
				if (level > 0) paintScene(state, scene, time);
			}
			const cue = (plan.cues || []).find((entry) => time >= entry.from && time <= entry.at + 260);
			if (!cue) {
				if (cueEl) write(cache.cue, "opacity", 0, () => { cueEl.style.opacity = "0"; });
				return;
			}
			if (!cueEl) {
				cueEl = node("div", "ivlyrics-motion-cue", interlude);
				cueEl.dots = Array.from({ length: CUE_BEATS }, () => ({ el: node("span", "ivlyrics-motion-cue-dot", cueEl), cache: {} }));
				cache.cue = {};
			}
			const shown = easeOutCubic(clamp01((time - cue.from) / 300)) * (1 - clamp01((time - cue.at) / 260));
			write(cache.cue, "opacity", round(shown, 3), (value) => { cueEl.style.opacity = String(value); });
			// One dot goes out on each beat; the lyrics come in as the last one does.
			const lit = clamp(Math.ceil((cue.at - time) / cue.step), 0, CUE_BEATS);
			cueEl.dots.forEach((dot, index) => {
				const on = index < lit;
				write(dot.cache, "lit", on, (value) => dot.el.classList.toggle("is-lit", value));
				const out = time - (cue.at - index * cue.step);
				write(dot.cache, "transform", on ? "none" : "scale(" + round(0.7 + 0.5 * Math.exp(-Math.max(0, out) / 160), 3) + ")", (value) => { dot.el.style.transform = value; });
			});
		};

		const mountWord = (board, line, word, wordIndex, spot, lineEl) => {
			const wordEl = document.createElement("div");
			const kind = spot.spec?.kind;
			const voice = spot.voice ? line.backing[spot.voice - 1] : null;
			wordEl.className = "ivlyrics-motion-word"
				+ (kind === "light" ? " is-light" : kind === "serif" ? " is-serif" : "")
				+ (spot.emph ? " is-emph" : "")
				+ (voice ? " is-voice is-" + voice.role : "")
				+ (spot.vertical ? " is-upright" : "");
			wordEl.style.fontSize = round(spot.size) + "px";
			wordEl.style.transform = "translate3d(" + round(spot.x) + "px," + round(spot.y) + "px," + round(spot.z || 0) + "px)"
				+ (spot.rot ? " rotate(" + round(spot.rot, 2) + "deg)" : "")
				+ (spot.vertical ? " translate(-50%,-50%)" : " translate(-50%,-56%)");
			applyFont(wordEl, spot.spec || FALLBACK_SPEC);
			if (line.info.rtl) wordEl.dir = "rtl";
			const ghost = document.createElement("span");
			ghost.className = "ivlyrics-motion-ghost";
			// Other voices wait as a faint fill (style.css), not an outline.
			setOutlineText(document, ghost, spot.text || word.text, voice ? "" : outlineOf(spot.size * 0.012));
			wordEl.appendChild(ghost);
			let box = null;
			let spark = null;
			if (spot.emph && BOX_ACCENTS.has(board.accent)) {
				box = document.createElement("span");
				box.className = "ivlyrics-motion-box is-" + board.accent;
				wordEl.appendChild(box);
			} else if (spot.emph && board.accent === "circle") {
				// Drawn around the word as it is sung (--b, like the boxes).
				box = createLoop(document, spot.width + spot.size * 0.56, spot.size * 1.3, Math.max(2, spot.size * 0.055));
				box.style.left = round(-spot.size * 0.28) + "px";
				box.style.top = round(-spot.size * 0.13) + "px";
				wordEl.appendChild(box);
			} else if (spot.emph && board.accent === "scribble") {
				box = createScribble(document, spot.width + spot.size * 0.2, spot.size * 0.26, Math.max(2, spot.size * 0.055));
				box.style.left = round(-spot.size * 0.1) + "px";
				box.style.top = round(spot.size * 0.94) + "px";
				wordEl.appendChild(box);
			} else if (spot.emph && (board.accent === "trail" || board.accent === "spectrum")) {
				// Copies that step out from behind the word as it is sung: outlines (trail) or coloured fills (spectrum).
				box = document.createElement("span");
				box.className = "ivlyrics-motion-trails";
				for (let copy = 3; copy >= 1; copy -= 1) {
					const trail = document.createElement("span");
					trail.className = "ivlyrics-motion-trail";
					trail.style.setProperty("--k", String(copy));
					trail.textContent = spot.text || word.text;
					box.appendChild(trail);
				}
				wordEl.appendChild(box);
			}
			const solid = document.createElement("span");
			solid.className = "ivlyrics-motion-solid";
			let chars = null;
			// Letters of their own for letter-by-letter entrances and exits.
			if ((CHAR_FX.has(line.fx) || LETTER_EXITS[board.exit]) && spot.letters !== false) {
				const cased = (spot.text || word.text) !== word.text;
				// Styles that paint through the glyphs (the gradient accent) then paint each letter, not the word:
				// the word would also paint every letter where it rests, under the one in motion.
				solid.classList.add("has-letters");
				chars = word.chars.map((char) => {
					const charEl = document.createElement("span");
					charEl.className = "ivlyrics-motion-char";
					charEl.textContent = cased ? char.ch.toLocaleUpperCase() : char.ch;
					solid.appendChild(charEl);
					return { el: charEl, char, text: charEl.textContent, cache: { text: charEl.textContent } };
				});
			} else {
				solid.textContent = spot.text || word.text;
			}
			wordEl.appendChild(solid);
			if (spot.emph && board.accent === "spark" && shapes?.createSvg) {
				spark = document.createElement("span");
				spark.className = "ivlyrics-motion-spark";
				const drawn = shapes.createSvg(document, shapes.motifOf("burst"), spot.size * 1.9);
				spark.appendChild(drawn.svg);
				wordEl.appendChild(spark);
			}
			lineEl.appendChild(wordEl);
			// Glowing words throb with the beat.
			return { el: wordEl, solid, box, spark, chars, word, index: wordIndex, size: spot.size, emph: spot.emph, pulse: spot.emph && (board.accent === "glow" || board.accent === "neon"), cache: {} };
		};

		const mountBoard = (index) => {
			const board = plan.boards[index];
			const el = document.createElement("div");
			el.className = "ivlyrics-motion-board accent-" + board.accent + " type-" + board.type + (board.serif ? " has-serif" : "");
			el.style.transform = "translate3d(" + round(board.origin.x) + "px," + round(board.origin.y) + "px," + round(board.origin.z) + "px) rotateZ(" + round(board.roll, 2) + "deg)";
			let echo = null;
			if (board.echo) {
				const echoEl = document.createElement("div");
				echoEl.className = "ivlyrics-motion-echo";
				setOutlineText(document, echoEl, board.echo.text, outlineOf(Math.max(0.75, board.echo.size * 0.006)));
				echoEl.style.fontSize = round(board.echo.size) + "px";
				applyFont(echoEl, board.echo.spec || FALLBACK_SPEC);
				el.appendChild(echoEl);
				echo = { el: echoEl, cache: {} };
			}
			const motifs = board.motifs.map((motif) => {
				const motifEl = document.createElement("div");
				motifEl.className = "ivlyrics-motion-motif" + (motif.accent ? " is-accent" : "");
				motifEl.style.width = round(motif.size) + "px";
				motifEl.style.height = round(motif.size) + "px";
				const drawn = shapes?.createSvg?.(document, motif.parts, motif.size);
				if (drawn) motifEl.appendChild(drawn.svg);
				el.appendChild(motifEl);
				return { el: motifEl, motif, paths: drawn?.paths || [], cache: {} };
			});
			const strokes = board.strokes.map((stroke) => {
				const strokeEl = document.createElement("div");
				strokeEl.className = "ivlyrics-motion-stroke";
				strokeEl.style.width = round(stroke.length) + "px";
				el.appendChild(strokeEl);
				return { el: strokeEl, stroke, cache: {} };
			});
			const plates = board.plates.map((plate) => {
				const plateEl = document.createElement("div");
				plateEl.className = "ivlyrics-motion-plate is-" + plate.kind + " is-" + plate.color;
				plateEl.style.width = round(plate.w) + "px";
				plateEl.style.height = round(plate.h) + "px";
				if (plate.radius) plateEl.style.borderRadius = round(plate.radius) + "px";
				el.appendChild(plateEl);
				return { el: plateEl, plate, cache: {} };
			});
			// Rows of a marquee belong to one line and stream sideways (paintBoard); a word wall's copies stand still.
			const streams = [];
			for (const fill of board.fills) {
				const fillEl = document.createElement("div");
				fillEl.className = "ivlyrics-motion-fill";
				setOutlineText(document, fillEl, fill.text, outlineOf(Math.max(0.5, fill.size * 0.01)));
				fillEl.style.fontSize = round(fill.size) + "px";
				fillEl.style.transform = "translate3d(" + round(fill.x) + "px," + round(fill.y) + "px," + round(fill.z) + "px) rotateZ(" + round(fill.rot, 2) + "deg) translate(-50%,-56%)";
				applyFont(fillEl, fill.spec || FALLBACK_SPEC);
				el.appendChild(fillEl);
				if (Number.isInteger(fill.line)) {
					fillEl.style.opacity = "0";
					streams.push({ el: fillEl, fill, cache: {} });
				}
			}
			const lines = board.places.map((place, local) => {
				const line = plan.lines[board.first + local];
				const lineEl = document.createElement("div");
				lineEl.className = "ivlyrics-motion-line" + (place.ground === "color" ? " on-color" : "");
				if (line.info.lang) lineEl.lang = line.info.lang;
				// The line's place; its hold (holdFrame) is added after it every frame.
				const base = "translate3d(" + round(place.x) + "px," + round(place.y) + "px," + round(place.z) + "px) rotateZ(" + round(place.rot, 2) + "deg)"
					+ (place.tiltY ? " rotateY(" + round(place.tiltY, 2) + "deg)" : "")
					+ (place.tiltX ? " rotateX(" + round(place.tiltX, 2) + "deg)" : "");
				lineEl.style.transform = base;
				let rule = null;
				if (board.rule) {
					rule = document.createElement("div");
					rule.className = "ivlyrics-motion-rule";
					const width = place.block.width + plan.F * 0.9;
					rule.style.width = round(width) + "px";
					rule.style.transform = "translate(" + round(-width / 2) + "px," + round(place.block.height / 2 + plan.F * 0.14) + "px)";
					rule.style.transformOrigin = line.info.rtl ? "100% 50%" : "0 50%";
					lineEl.appendChild(rule);
				}
				const words = line.shown.map((word, wordIndex) => mountWord(board, line, word, wordIndex, place.block.words[wordIndex], lineEl));
				el.appendChild(lineEl);
				return { el: lineEl, line, words, rule, base, cache: {}, settled: null };
			});
			camera.appendChild(el);
			return { el, board, lines, motifs, strokes, plates, streams, echo, reveal: board.index > 0 && REVEALS.has(board.enter), cache: {} };
		};

		const writeSolid = (word, frameState) => {
			write(word.cache, "opacity", round(frameState.opacity, 3), (value) => word.solid.style.setProperty("--e", String(value)));
			write(word.cache, "transform", frameState.transform, (value) => { word.solid.style.transform = value; });
			write(word.cache, "filter", frameState.filter, (value) => { word.solid.style.filter = value; });
			write(word.cache, "clip", frameState.clip, (value) => { word.solid.style.clipPath = value; });
			write(word.cache, "shadow", frameState.shadow, (value) => { word.solid.style.textShadow = value; });
		};

		const settleLine = (entry, sung) => {
			const state = sung ? "sung" : "waiting";
			if (entry.settled === state) return;
			entry.settled = state;
			const flash = entry.line.place.flash === true;
			entry.words.forEach((word, order) => {
				// One word at a time: a sung line keeps only its last word.
				const shown = sung && !(flash && order < entry.line.words.length - 1);
				writeSolid(word, shown ? SETTLED : HIDDEN);
				write(word.cache, "active", false, (value) => word.el.classList.toggle("is-active", value));
				if (word.box) write(word.cache, "box", shown ? 1 : 0, (value) => word.box.style.setProperty("--b", String(value)));
				if (word.spark) write(word.cache, "spark", "hidden", (value) => { word.spark.style.visibility = value; });
				if (word.pulse) write(word.cache, "pulse", "", (value) => { word.solid.style.scale = value; });
				write(word.cache, "float", "", (value) => { word.el.style.translate = value; });
				if (word.chars) {
					for (const char of word.chars) {
						write(char.cache, "opacity", 1, (value) => { char.el.style.opacity = String(value); });
						write(char.cache, "transform", "none", (value) => { char.el.style.transform = value; });
						write(char.cache, "text", char.text, (value) => { char.el.textContent = value; });
					}
				}
			});
			if (entry.rule) write(entry.cache, "rule", sung ? 1 : 0, (value) => entry.rule.style.setProperty("--r", String(value)));
		};

		const paintWords = (entry, time, distance, beat) => {
			entry.settled = null;
			const line = entry.line;
			const board = plan.boards[line.board];
			const sway = clamp01(1 - (distance - 0.3) / 0.9);
			const seed = hashString(line.text);
			const pace = plan.pace;
			const exitLength = line.exitLength || EXIT_MS * fxPaceOf(pace);
			const lettered = !!LETTER_EXITS[board.exit];
			const letterFx = CHAR_FX.has(line.fx);
			const floating = board.hold === "float";
			const flash = line.place.flash === true;
			entry.words.forEach((word, order) => {
				if (floating) {
					const lift = round(floatOffset(line, order, word.size || plan.F, time), 1);
					write(word.cache, "float", Math.abs(lift) < 0.1 ? "" : "0 " + lift + "px", (value) => { word.el.style.translate = value; });
				}
				// One word at a time: a word gives way as the next one comes in.
				const next = flash ? line.words[order + 1] : null;
				if (next && time >= next.start - 40) {
					writeSolid(word, HIDDEN);
					write(word.cache, "active", false, (value) => word.el.classList.toggle("is-active", value));
					if (word.box) write(word.cache, "box", 0, (value) => word.box.style.setProperty("--b", String(value)));
					return;
				}
				if (time >= line.exitAt) {
					// Leaving: the words go one after another with the shot's exit, settled in place until their turn.
					const k = clamp01((time - (line.exitAt + order * line.exitStagger)) / exitLength);
					write(word.cache, "active", false, (value) => word.el.classList.toggle("is-active", value));
					if (word.chars && lettered) {
						// Taken apart letter by letter.
						writeSolid(word, k >= 1 ? HIDDEN : SETTLED);
						const context = { count: word.chars.length, seed: seed + word.index * 131 };
						word.chars.forEach((char, index) => {
							const state = exitCharFrame(board.exit, k, char.char, index, context);
							write(char.cache, "opacity", round(state.opacity, 3), (value) => { char.el.style.opacity = String(value); });
							write(char.cache, "transform", state.transform, (value) => { char.el.style.transform = value; });
							write(char.cache, "text", state.text || char.text, (value) => { char.el.textContent = value; });
						});
						return;
					}
					writeSolid(word, exitFrame(board.exit, k, seed + word.index * 7919, line.info.rtl));
					if (word.chars) {
						for (const char of word.chars) {
							write(char.cache, "opacity", 1, (value) => { char.el.style.opacity = String(value); });
							write(char.cache, "transform", "none", (value) => { char.el.style.transform = value; });
							write(char.cache, "text", char.text, (value) => { char.el.textContent = value; });
						}
					}
					return;
				}
				const progress = wordEntrance(line.fx, word.word, time, pace);
				writeSolid(word, solidFrame(line.fx, progress, seed + word.index * 7919, line.info.rtl));
				write(word.cache, "active", time >= word.word.start && time < word.word.end, (value) => word.el.classList.toggle("is-active", value));
				if (word.box) {
					write(word.cache, "box", round(easeOutCubic(clamp01((time - word.word.start + 40) / (300 * fxPaceOf(pace)))), 3), (value) => word.box.style.setProperty("--b", String(value)));
				}
				if (word.pulse) {
					const throb = time >= word.word.start ? 1 + beat * 0.09 : 1;
					write(word.cache, "pulse", throb > 1.004 ? String(round(throb, 3)) : "", (value) => { word.solid.style.scale = value; });
				}
				if (word.spark) {
					const since = time - word.word.start;
					const visible = since >= 0 && since < 560;
					write(word.cache, "spark", visible ? "visible" : "hidden", (value) => { word.spark.style.visibility = value; });
					if (visible) {
						const k = easeOutCubic(since / 560);
						write(word.cache, "sparkTransform", "translate(-50%,-50%) scale(" + round(0.55 + k * 0.85, 3) + ") rotate(" + round((seed % 40) - 20 + k * 25, 1) + "deg)",
							(value) => { word.spark.style.transform = value; });
						write(word.cache, "sparkOpacity", round(1 - k, 3), (value) => { word.spark.style.opacity = String(value); });
					}
				}
				if (word.chars) {
					const context = { count: word.chars.length, wordStart: word.word.start, seed: seed + word.index * 131, sway, pace };
					word.chars.forEach((char, index) => {
						// Letters set apart only for the exit come in with their word.
						const state = letterFx ? charFrame(line.fx, char.char, index, time, context) : LETTER_SETTLED;
						write(char.cache, "opacity", round(state.opacity, 3), (value) => { char.el.style.opacity = String(value); });
						write(char.cache, "transform", state.transform, (value) => { char.el.style.transform = value; });
						write(char.cache, "text", state.text || char.text, (value) => { char.el.textContent = value; });
					});
				}
			});
			if (entry.rule) {
				const k = easeInOutCubic(clamp01((time - line.start + 220) / (900 * fxPaceOf(pace))));
				write(entry.cache, "rule", round(k, 3), (value) => entry.rule.style.setProperty("--r", String(value)));
			}
		};

		const NEAR = [240, 660, 0.86];
		// Diving through a line lets it grow much closer before it fades.
		const NEAR_THROUGH = [600, 980, 0.97];
		/** Things fade as they come up to the lens instead of filling the screen. */
		const closenessOf = (depth, near) => (depth > PERSPECTIVE_PX * near[2] ? 0 : 1 - clamp01((depth - near[0]) / (near[1] - near[0])));

		const paintBoard = (entry, time, pose, progress, beat, through) => {
			const board = entry.board;
			const visibility = boardVisibility(board, time);
			const near = through === board.index ? NEAR_THROUGH : NEAR;
			for (const lineEntry of entry.lines) {
				const line = lineEntry.line;
				const distance = progress - line.n;
				const closeness = closenessOf(viewDepth(pose, line.center), near);
				const levels = levelsOn(board, line, distance, time);
				const ghost = round(levels.ghost * visibility * closeness, 3);
				const solid = round(levels.solid * visibility * closeness, 3);
				write(lineEntry.cache, "ghost", ghost, (value) => lineEntry.el.style.setProperty("--lg", String(value)));
				write(lineEntry.cache, "solid", solid, (value) => lineEntry.el.style.setProperty("--ls", String(value)));
				const shown = ghost > 0.002 || solid > 0.002;
				write(lineEntry.cache, "visibility", shown ? "visible" : "hidden", (value) => { lineEntry.el.style.visibility = value; });
				if (shown) write(lineEntry.cache, "hold", lineMotion(board, line, time, beat, plan.F), (value) => { lineEntry.el.style.transform = lineEntry.base + value; });
				const until = Number.isFinite(line.exitAt) ? Math.max(line.end + 1700, line.exitAt + line.exitSpan + 60) : line.end + 1700;
				if (time >= line.start - 900 && time <= until) paintWords(lineEntry, time, distance, beat);
				else settleLine(lineEntry, time > line.end);
			}
			for (const item of entry.motifs) {
				const motif = item.motif;
				const startAt = motif.line === null ? board.appear + 250 : plan.lines[board.first + motif.line].start - 60;
				const closeness = closenessOf(viewDepth(pose, motif.center), near);
				if (time < startAt || visibility * closeness <= 0.002) {
					write(item.cache, "visibility", "hidden", (value) => { item.el.style.visibility = value; });
					continue;
				}
				write(item.cache, "visibility", "visible", (value) => { item.el.style.visibility = value; });
				const since = time - startAt;
				const entrance = clamp01(since / (520 * fxPaceOf(plan.pace)));
				const lineDistance = motif.line === null ? 0 : progress - (board.first + motif.line);
				const fade = motif.line === null ? 1 : lineDistance > 1.5 ? 0.6 : 1;
				const scale = Math.max(0, easeOutBack(entrance)) * (1 + beat * 0.12);
				const rotation = motif.rot - (1 - easeOutCubic(entrance)) * 70 + (motif.spin * since) / 1000;
				write(item.cache, "opacity", round(motif.opacity * visibility * fade * closeness, 3), (value) => { item.el.style.opacity = String(value); });
				write(item.cache, "transform",
					"translate3d(" + round(motif.x) + "px," + round(motif.y) + "px," + round(motif.z) + "px) translate(-50%,-50%) rotate(" + round(rotation, 1) + "deg) scale(" + round(scale, 3) + ")",
					(value) => { item.el.style.transform = value; });
				const draw = round(1 - easeOutCubic(clamp01(since / (760 * fxPaceOf(plan.pace)))), 3);
				write(item.cache, "draw", draw, (value) => {
					// Not drawn yet, a round line cap would still show a dot where the stroke starts.
					for (const path of item.paths) {
						if (path.mode !== "stroke") continue;
						path.el.style.strokeDashoffset = String(value);
						path.el.style.visibility = value >= 0.999 ? "hidden" : "";
					}
				});
			}
			for (const item of entry.strokes) {
				const stroke = item.stroke;
				const level = round(strokeLevel(plan, board, stroke, time), 4);
				write(item.cache, "opacity", round(level > 0 ? 0.62 * visibility : 0, 3), (value) => { item.el.style.opacity = String(value); });
				write(item.cache, "transform",
					"translate3d(" + round(stroke.x) + "px," + round(stroke.y) + "px," + round(stroke.z) + "px) rotateZ(" + stroke.rot + "deg) scaleX(" + level + ")",
					(value) => { item.el.style.transform = value; });
			}
			write(entry.cache, "fills", round(0.2 * visibility, 3), (value) => entry.el.style.setProperty("--fl", String(value)));
			for (const item of entry.plates) {
				const plate = item.plate;
				const level = round(plateLevel(plan, board, plate, time), 3);
				write(item.cache, "opacity", round(level > 0 ? visibility * (plate.solo ? clamp01(level * 3) : 1) : 0, 3), (value) => { item.el.style.opacity = String(value); });
				const turn = plate.spin ? plate.rot + (plate.spin * (time - plan.lines[board.first + plate.line].start)) / 1000 : plate.rot;
				write(item.cache, "transform",
					"translate3d(" + round(plate.x) + "px," + round(plate.y) + "px," + round(plate.z) + "px) translate(-50%,-50%) rotateZ(" + round(turn, 2) + "deg) "
						+ (plate.kind === "band" ? "scaleY(" + level + ")" : "scale(" + round(0.7 + 0.3 * level, 3) + ")"),
					(value) => { item.el.style.transform = value; });
			}
			for (const item of entry.streams) {
				// A marquee row: shown while its line is the current one, streaming sideways.
				const fill = item.fill;
				const owner = plan.lines[board.first + fill.line];
				const next = plan.lines[board.first + fill.line + 1];
				let level = clamp01((time - (owner.start - 320)) / 260);
				if (next && next.board === board.index) level *= 1 - clamp01((time - (next.start - 280)) / 220);
				const opacity = round(0.24 * visibility * level, 3);
				write(item.cache, "opacity", opacity, (value) => { item.el.style.opacity = String(value); });
				if (opacity <= 0) continue;
				const travel = (fill.speed * (time - owner.start)) / 1000;
				const shift = ((travel % fill.step) + fill.step) % fill.step - fill.step / 2;
				write(item.cache, "transform", "translate3d(" + round(fill.x + shift) + "px," + round(fill.y) + "px," + round(fill.z) + "px) translate(-50%,-56%)",
					(value) => { item.el.style.transform = value; });
			}
			// The way into a board that opens out of a circle (iris) or a band (open).
			if (entry.reveal) {
				const clip = revealClip(plan, board, time);
				write(entry.cache, "reveal", clip, (value) => { entry.el.style.clipPath = value; });
			}
			if (entry.echo) {
				const echo = board.echo;
				const span = Math.max(1, (Number.isFinite(board.fadeEnd) ? board.fadeEnd : board.appear + 20000) - board.appear);
				const travel = clamp01((time - board.appear) / span) - 0.5;
				write(entry.echo.cache, "opacity", round(0.15 * visibility, 3), (value) => { entry.echo.el.style.opacity = String(value); });
				write(entry.echo.cache, "transform",
					"translate3d(" + round(echo.x + echo.drift * travel) + "px," + round(echo.y) + "px," + round(echo.z) + "px) translate(-50%,-56%) rotateZ(" + round(echo.rot, 2) + "deg)",
					(value) => { entry.echo.el.style.transform = value; });
			}
		};

		const updateText = (index) => {
			const line = plan.lines[index];
			const source = line ? lyrics[line.index] : null;
			const text = translationOf(source);
			if (subtitle.textContent !== text) subtitle.textContent = text;
			subtitle.classList.toggle("has-text", !!text);
			if (live && line && live.textContent !== line.text) live.textContent = line.text;
		};

		const swapIfDue = (time, at) => {
			if (!pending) return;
			const lines = plan?.lines || [];
			const index = lineIndexAt(plan, time);
			const line = lines[index];
			const next = lines[index + 1];
			const betweenBoards = !!(line && next && time > line.leave && next.board !== line.board);
			const beforeSong = !lines.length || time < lines[0].arrive - 400;
			// Nothing to cut away from while only the video plays.
			const resting = restAt(plan, time) > 0.95;
			if (!playing || beforeSong || betweenBoards || resting || at - planSetAt < 1500 || at - pending.since > 15000) {
				const quiet = at - planSetAt < 1500 || beforeSong || resting || !playing;
				plan = pending.plan;
				pending = null;
				planSetAt = at;
				unmountAll();
				if (!quiet) swapFlashAt = at;
			}
		};

		const throughBoard = (time) => {
			const index = lineIndexAt(plan, time);
			const line = plan.lines[index];
			return line?.move?.type === "through" && time > line.leave ? line.board : -1;
		};

		const render = (time) => {
			const at = now();
			const uri = playerUri();
			if (!plan || !plan.lines.length || (trackUri && uri && uri !== trackUri)) {
				if (mounted.size) unmountAll();
				return;
			}
			swapIfDue(time, at);
			const pose = cameraPose(plan, time, pulses);
			write(cache.camera, "transform",
				"rotateX(" + round(pose.pitch || 0, 2) + "deg) rotateY(" + round(pose.yaw || 0, 2) + "deg) rotateZ(" + round(-pose.roll, 3) + "deg) translate3d(" + round(-pose.x) + "px," + round(-pose.y) + "px," + round(-pose.z) + "px)",
				(value) => { camera.style.transform = value; });

			// Motion blur while the camera whips between boards.
			let blur = 0;
			if (playing && lastPose && at - lastFrameAt > 0 && at - lastFrameAt < 90) {
				const elapsed = at - lastFrameAt;
				let turn = Math.abs(pose.roll - lastPose.roll) % 360;
				turn = Math.min(turn, 360 - turn);
				const swing = Math.abs((pose.yaw || 0) - (lastPose.yaw || 0)) + Math.abs((pose.pitch || 0) - (lastPose.pitch || 0));
				const travel = Math.hypot(pose.x - lastPose.x, pose.y - lastPose.y) + ((turn + swing) * Math.PI / 180) * plan.W * 0.45;
				blur = clamp((travel / elapsed - 1.7) * 1.3, 0, 7);
			}
			lastPose = pose;
			lastFrameAt = at;
			const blurValue = blur >= 0.5 ? "blur(" + round(blur, 1) + "px)" : "";
			write(cache.viewport, "filter", blurValue, (value) => { viewport.style.filter = value; });

			const backdrop = findBackground(at);
			if (backdrop) {
				const frameState = backgroundFrame(plan, pose, time);
				write(cache.background, "rotate", round(frameState.rotate, 2) + "deg", (value) => { backdrop.style.rotate = value; });
				write(cache.background, "scale", String(round(frameState.scale, 4)), (value) => { backdrop.style.scale = value; });
				write(cache.background, "translate", round(frameState.x) + "px " + round(frameState.y) + "px", (value) => { backdrop.style.translate = value; });
				write(cache.background, "filter", blur >= 1 ? "blur(" + round(blur * 0.5, 1) + "px)" : "", (value) => { backdrop.style.filter = value; });
			}

			const progress = progressAt(plan, time);
			const through = throughBoard(time);
			const wanted = new Set();
			plan.boards.forEach((board, index) => {
				if (time >= board.appear - 60 && time <= board.fadeEnd + 60) wanted.add(index);
			});
			for (const index of [...mounted.keys()]) if (!wanted.has(index)) unmount(index);
			for (const index of wanted) {
				if (!mounted.has(index)) mounted.set(index, mountBoard(index));
				paintBoard(mounted.get(index), time, pose, progress, pose.beat || 0, through);
			}
			paintInterludes(time);

			const index = Math.max(0, lineIndexAt(plan, time));
			if (index !== currentLine) {
				currentLine = index;
				updateText(index);
				const board = plan.lines[index]?.board ?? 0;
				write(cache.hud, "line", pad2(index + 1) + " / " + pad2(plan.lines.length), (value) => { if (hudShot) hudShot.textContent = "SHOT " + pad2(board + 1) + " / " + pad2(plan.boards.length) + "  ·  L " + value; });
				if (board !== currentBoard) {
					currentBoard = board;
					write(cache.wash, "color", plan.boards[board]?.color ? "is-alt" : "", (value) => { wash.classList.toggle("is-alt", value === "is-alt"); });
				}
			}
			// Interludes, intro and outro: the video comes forward and the subtitle steps aside.
			const rest = round(restAt(plan, time), 2);
			write(cache.rest, "level", rest, (value) => {
				if (scrim) scrim.style.opacity = String(round(1 - value * 0.5, 2));
			});
			// The translation goes with its line: not after it ends, before the next one starts.
			const sung = plan.lines[index];
			const spoken = !!sung && time >= sung.arrive - 200 && time <= sung.end + SUBTITLE_LINGER_MS;
			write(cache.rest, "subtitle", rest > 0.5 || !spoken, (value) => subtitle.classList.toggle("is-resting", value));
			write(cache.hud, "time", timecode(time), (value) => { if (hudTime) hudTime.textContent = value; });

			const sweep = panelAt(plan, time);
			write(cache.panel, "visibility", sweep ? "visible" : "hidden", (value) => { if (panel) panel.style.visibility = value; });
			if (sweep && panel) {
				write(cache.panel, "transform", "translateX(" + round(sweep.position * 135, 2) + "%) skewX(-14deg)", (value) => { panel.style.transform = value; });
				write(cache.panel, "color", sweep.color ? "is-alt" : "", (value) => { panel.classList.toggle("is-alt", value === "is-alt"); });
			}
			const barLevel = round(barsLevel(plan, time), 3);
			write(cache.bars, "level", barLevel, (value) => {
				if (!bars) return;
				bars.style.visibility = value > 0.001 ? "visible" : "hidden";
				for (const bar of bars.children) bar.style.transform = "scaleY(" + value + ")";
			});
			if (flood) {
				const field = floodAt(plan, time);
				write(cache.flood, "color", field ? field.color : "", (value) => { flood.className = "ivlyrics-motion-flood" + (value ? " is-" + value : ""); });
				write(cache.flood, "level", field ? round(field.level, 3) : 0, (value) => {
					flood.style.visibility = value > 0.001 ? "visible" : "hidden";
					flood.style.transform = "scaleY(" + value + ")";
				});
			}

			let flashLevel = 0;
			const cut = recentEvent(plan.flashes, time, 320);
			if (cut) flashLevel = cut.strength * Math.exp(-cut.since / 90);
			if (at - swapFlashAt < 360) flashLevel = Math.max(flashLevel, 0.45 * Math.exp(-(at - swapFlashAt) / 110));
			write(cache.flash, "opacity", round(flashLevel, 3), (value) => { flash.style.opacity = String(value); });
		};

		const schedule = () => {
			if (destroyed || frameId || timerId) return;
			if (playing) {
				frameId = root.requestAnimationFrame((frameTime) => {
					frameId = 0;
					render(readTime(frameTime));
					schedule();
				});
			} else {
				// Paused: follow seeks without a running frame loop.
				timerId = root.setTimeout(() => {
					timerId = 0;
					render(readTime(NaN));
					schedule();
				}, 200);
			}
		};

		const restart = () => {
			if (frameId) root.cancelAnimationFrame(frameId);
			if (timerId) root.clearTimeout(timerId);
			frameId = 0;
			timerId = 0;
			lastPose = null;
			render(readTime(NaN));
			schedule();
		};

		return {
			/**
			 * soft: a new edit of the same song (the AI direction or a late
			 * font arrived) waits for a cut between boards; anything else
			 * (size, a new song) applies now.
			 */
			setPlan(nextPlan, nextTrackUri, options = {}) {
				const uri = nextTrackUri || "";
				if ((plan === nextPlan || pending?.plan === nextPlan) && trackUri === uri) return;
				if (!plan || !nextPlan || trackUri !== uri || options.soft !== true) {
					plan = nextPlan;
					pending = null;
					trackUri = uri;
					planSetAt = now();
					pulses = nextPlan?.pulses || null;
					unmountAll();
					restart();
					return;
				}
				pending = { plan: nextPlan, since: now() };
			},
			setPulses(nextPulses) {
				pulses = nextPulses || plan?.pulses || null;
			},
			setLyrics(nextLyrics) {
				lyrics = Array.isArray(nextLyrics) ? nextLyrics : [];
				currentLine = -2;
			},
			setPlaying(value) {
				if (playing === (value === true)) return;
				playing = value === true;
				restart();
			},
			destroy() {
				destroyed = true;
				if (frameId) root.cancelAnimationFrame(frameId);
				if (timerId) root.clearTimeout(timerId);
				unmountAll();
				releaseBackground();
			},
		};
	};

	const createStage = (react) => {
		const { useEffect, useLayoutEffect, useMemo, useRef, useState } = react;
		const ANALYSIS_WAIT_MS = 700;
		const FAILED_NOTICE_MS = 6000;
		// A direction that arrives sooner (from the cache) is not announced at all.
		const STATUS_DELAY_MS = 400;
		const t = (key, fallback) => root.I18n?.t?.(key) || fallback;

		/**
		 * onStatus: the app shows the AI direction's progress with its other AI
		 * tasks; it is called with { phase: "loading" | "complete" | "failed" |
		 * "idle", uri }. Without it the stage shows its own notice.
		 */
		return react.memo(({ lyrics = [], trackUri = "", accent = "", isPlaying = false, title = "", artist = "", onStatus = null }) => {
			const rootRef = useRef(null);
			const viewportRef = useRef(null);
			const cameraRef = useRef(null);
			const scrimRef = useRef(null);
			const washRef = useRef(null);
			const floodRef = useRef(null);
			const interludeRef = useRef(null);
			const flashRef = useRef(null);
			const panelRef = useRef(null);
			const barsRef = useRef(null);
			const subtitleRef = useRef(null);
			const liveRef = useRef(null);
			const hudShotRef = useRef(null);
			const hudTimeRef = useRef(null);
			const defsRef = useRef(null);
			const engineRef = useRef(null);
			const measureRef = useRef(null);
			const [size, setSize] = useState({ width: 0, height: 0 });
			const [fonts, setFonts] = useState({ key: "", epoch: 0 });
			const [analysis, setAnalysis] = useState({ uri: "", status: "loading", data: null, planned: false });
			const [ai, setAi] = useState({ key: "", status: "idle", raw: null });
			const [showFailure, setShowFailure] = useState(false);
			const modelRef = useRef({ signature: "", lines: [] });
			const model = useMemo(() => {
				const lines = buildModel(lyrics);
				const signature = trackUri + "\u0002" + modelSignature(lines);
				const shape = signature + "\u0003" + voicesSignature(lines);
				if (shape !== modelRef.current.shape) modelRef.current = { signature, shape, lines };
				return modelRef.current.lines;
			}, [lyrics, trackUri]);
			const signature = modelRef.current.signature;
			const aiKey = String(hashString(signature));
			// The song's language decides Han characters (Japanese, Simplified or Traditional faces).
			const songLang = useMemo(() => {
				try {
					return String(root.LyricsService?.detectLanguage?.(lyrics) || root.Utils?.detectLanguage?.(lyrics) || "");
				} catch {
					return "";
				}
			}, [signature]);
			const typography = useMemo(() => typeLib()?.typographyOf?.(model, songLang) || [], [model, songLang]);

			useLayoutEffect(() => {
				const element = rootRef.current;
				if (!element) return undefined;
				const update = () => {
					const rect = element.getBoundingClientRect();
					// Small changes (scrollbars, rounding) do not re-plan the song.
					const width = Math.round(rect.width / 16) * 16;
					const height = Math.round(rect.height / 16) * 16;
					setSize((current) => (current.width === width && current.height === height ? current : { width, height }));
				};
				update();
				const observer = typeof root.ResizeObserver === "function" ? new root.ResizeObserver(update) : null;
				observer?.observe(element);
				engineRef.current = createEngine({
					stage: element,
					viewport: viewportRef.current,
					camera: cameraRef.current,
					scrim: scrimRef.current,
					wash: washRef.current,
					flood: floodRef.current,
					interlude: interludeRef.current,
					flash: flashRef.current,
					panel: panelRef.current,
					bars: barsRef.current,
					subtitle: subtitleRef.current,
					live: liveRef.current,
					hudShot: hudShotRef.current,
					hudTime: hudTimeRef.current,
					defs: defsRef.current,
				});
				return () => {
					observer?.disconnect();
					engineRef.current?.destroy();
					engineRef.current = null;
				};
			}, []);

			useEffect(() => {
				let cancelled = false;
				setAnalysis({ uri: trackUri, status: "loading", data: null, planned: false });
				const load = root.ivLyricsCdVisualizer?.loadAnalysis;
				if (!trackUri || typeof load !== "function") {
					setAnalysis({ uri: trackUri, status: "none", data: null, planned: false });
					return undefined;
				}
				const timer = root.setTimeout(() => {
					if (!cancelled) setAnalysis((current) => (current.uri === trackUri && current.status === "loading" ? { ...current, status: "late" } : current));
				}, ANALYSIS_WAIT_MS);
				Promise.resolve(load(trackUri)).then((data) => {
					if (cancelled) return;
					setAnalysis((current) => (current.uri !== trackUri ? current : { uri: trackUri, status: "ready", data: data || null, planned: current.status === "loading" }));
				}, () => {
					if (!cancelled) setAnalysis((current) => (current.uri !== trackUri ? current : { ...current, status: "none" }));
				});
				return () => {
					cancelled = true;
					root.clearTimeout(timer);
				};
			}, [trackUri]);

			const planAnalysis = analysis.planned ? analysis.data : null;
			const tempo = useMemo(() => root.ivLyricsMotionDirector?.tempoOf?.(model, pulsesInMs(planAnalysis)) || null, [model, planAnalysis]);

			// The AI is asked once the song's analysis is in (or late): it reads each line's energy and the tempo with its BPM.
			const analysisSettled = analysis.uri === trackUri && analysis.status !== "loading";
			useEffect(() => {
				if (!model.length || !trackUri || !analysisSettled) return undefined;
				let cancelled = false;
				setAi({ key: aiKey, status: "loading", raw: null });
				setShowFailure(false);
				const sound = analysis.data || null;
				const requestTempo = root.ivLyricsMotionDirector?.tempoOf?.(model, pulsesInMs(sound)) || tempo;
				requestDirection({ trackUri, model, title, artist, tempo: requestTempo, songLang, energy: lineEnergies(model, sound) }).then((result) => {
					if (cancelled) return;
					setAi({ key: aiKey, status: result.status, raw: result.raw || null });
					if (result.status === "failed") {
						console.warn("[ivLyrics motion] AI direction failed:", result.error);
						setShowFailure(true);
					}
				});
				return () => { cancelled = true; };
			}, [aiKey, analysisSettled]);

			useEffect(() => {
				if (!showFailure) return undefined;
				const timer = root.setTimeout(() => setShowFailure(false), FAILED_NOTICE_MS);
				return () => root.clearTimeout(timer);
			}, [showFailure]);

			const direction = useMemo(() => {
				const director = root.ivLyricsMotionDirector;
				if (!director || !model.length) return null;
				const options = { seed: hashString(trackUri), energy: lineEnergies(model, planAnalysis), tempo };
				return ai.key === aiKey && ai.raw ? director.normalizeDirection(ai.raw, model, options) : director.localDirection(model, options);
			}, [ai, aiKey, model, trackUri, planAnalysis, tempo]);
			const palette = useMemo(() => paletteFrom(accent, direction?.palette), [accent, direction]);

			// The faces this direction sets load before it is composed (bounded),
			// and a face that arrives later re-measures the edit at the next cut.
			const needs = useMemo(() => (direction ? fontNeeds(model, direction, typography, [title, artist]) : new Map()), [direction, typography, title, artist]);
			const needsKey = useMemo(() => [...needs.keys()].sort().join("\u0001"), [needs]);
			useEffect(() => {
				let cancelled = false;
				const document = root.document;
				typeLib()?.ensureFonts?.(document, needs).then(() => {
					if (cancelled) return;
					measureRef.current = typeLib()?.createMeasurer?.(document) || null;
					setFonts((current) => ({ key: needsKey, epoch: current.epoch + 1 }));
				});
				const fontSet = document?.fonts;
				const late = () => {
					if (cancelled) return;
					measureRef.current = typeLib()?.createMeasurer?.(document) || null;
					setFonts((current) => (current.key === needsKey ? { key: needsKey, epoch: current.epoch + 1 } : current));
				};
				fontSet?.addEventListener?.("loadingdone", late);
				return () => {
					cancelled = true;
					fontSet?.removeEventListener?.("loadingdone", late);
				};
			}, [needsKey]);

			const fontsReady = fonts.key === needsKey && fonts.epoch > 0;
			const planReady = analysis.uri === trackUri && analysis.status !== "loading" && fontsReady;
			const plan = useMemo(() => {
				if (!planReady || !size.width || !size.height || !direction) return null;
				return compose(model, direction, {
					width: size.width,
					height: size.height,
					seed: hashString(trackUri),
					analysis: planAnalysis,
					measure: measureRef.current,
					typography,
					songLang,
					title,
					artist,
				});
			}, [planReady, direction, size.width, size.height, fonts.epoch, planAnalysis, typography, title, artist]);

			useEffect(() => { engineRef.current?.setLyrics(lyrics); }, [lyrics]);
			const shownRef = useRef({ direction: null, size: "" });
			useEffect(() => {
				// A new direction or a late face for the same song and size waits for a cut.
				const sizeKey = size.width + "x" + size.height;
				const soft = !!plan && !!shownRef.current.direction && shownRef.current.size === sizeKey;
				if (plan) shownRef.current = { direction, size: sizeKey };
				engineRef.current?.setPlan(plan, trackUri, { soft });
			}, [plan, trackUri]);
			useEffect(() => { engineRef.current?.setPulses(pulsesInMs(analysis.data)); }, [analysis.data]);
			useEffect(() => { engineRef.current?.setPlaying(isPlaying); }, [isPlaying]);

			const status = ai.status === "loading" && ai.key === aiKey
				? { kind: "loading", text: t("vinyl.presentation.motionDirecting", "AI is directing the motion…") }
				: showFailure
					? { kind: "failed", text: t("vinyl.presentation.motionDirectFailed", "AI direction failed. Using the built-in direction.") }
					: null;

			// The app's status list: loading once the AI takes a while, then done or failed.
			const onStatusRef = useRef(onStatus);
			onStatusRef.current = onStatus;
			const reportedRef = useRef(null);
			const reports = typeof onStatus === "function";
			const loading = ai.status === "loading" && ai.key === aiKey;
			useEffect(() => {
				if (!reports) return undefined;
				if (loading) {
					const timer = root.setTimeout(() => {
						reportedRef.current = { key: aiKey, uri: trackUri };
						onStatusRef.current?.({ phase: "loading", uri: trackUri });
					}, STATUS_DELAY_MS);
					return () => root.clearTimeout(timer);
				}
				const reported = reportedRef.current;
				if (reported) {
					reportedRef.current = null;
					const phase = reported.key !== ai.key ? "idle" : ai.status === "ready" ? "complete" : ai.status === "failed" ? "failed" : "idle";
					onStatusRef.current?.({ phase, uri: reported.uri });
				}
				return undefined;
			}, [reports, loading, ai.status, ai.key, aiKey, trackUri]);
			useEffect(() => () => {
				const reported = reportedRef.current;
				reportedRef.current = null;
				if (reported) onStatusRef.current?.({ phase: "idle", uri: reported.uri });
			}, []);

			const e = react.createElement;
			return e("div", {
				ref: rootRef,
				className: "ivlyrics-motion-stage",
				"data-mood": direction?.mood || "warm",
				"data-tempo": direction?.tempo?.tempo || "mid",
				"data-source": direction?.source || "local",
				style: {
					"--iv-motion-accent": palette[0],
					"--iv-motion-accent-2": palette[1],
					"--iv-motion-deep": deepOf(palette[0]),
					"--iv-motion-deep-2": deepOf(palette[1]),
					"--iv-motion-perspective": PERSPECTIVE_PX + "px",
					"--iv-motion-ui": UI_FONT,
				},
			},
				e("div", { ref: scrimRef, className: "ivlyrics-motion-scrim", "aria-hidden": "true" }),
				// The outline filters (createOutlines) are added here by the engine.
				e("svg", { ref: defsRef, className: "ivlyrics-motion-defs", width: 0, height: 0, "aria-hidden": "true", focusable: "false" }),
				e("div", { ref: washRef, className: "ivlyrics-motion-wash", "aria-hidden": "true" }),
				e("div", { ref: floodRef, className: "ivlyrics-motion-flood", "aria-hidden": "true" }),
				// Scenes while no lyrics are on screen (the intro, instrumental breaks, the outro).
				e("div", { ref: interludeRef, className: "ivlyrics-motion-interludes", "aria-hidden": "true" }),
				e("div", { ref: viewportRef, className: "ivlyrics-motion-viewport", "aria-hidden": "true" },
					e("div", { ref: cameraRef, className: "ivlyrics-motion-camera" })),
				e("div", { ref: panelRef, className: "ivlyrics-motion-panel", "aria-hidden": "true" }),
				e("div", { ref: barsRef, className: "ivlyrics-motion-bars", "aria-hidden": "true" },
					e("div", { className: "ivlyrics-motion-bar is-top" }),
					e("div", { className: "ivlyrics-motion-bar is-bottom" })),
				e("div", { ref: flashRef, className: "ivlyrics-motion-flash", "aria-hidden": "true" }),
				e("div", { className: "ivlyrics-motion-hud", "aria-hidden": "true" },
					e("div", { className: "ivlyrics-motion-hud-title" },
						e("span", { className: "ivlyrics-motion-hud-strong" }, title),
						artist ? e("span", null, artist) : null),
					e("div", { className: "ivlyrics-motion-hud-shot" },
						e("span", { ref: hudShotRef }),
						direction?.source === "ai" ? e("span", { className: "ivlyrics-motion-hud-ai" }, "AI") : null),
					e("div", { ref: hudTimeRef, className: "ivlyrics-motion-hud-time" })),
				status && !reports ? e("div", { className: "ivlyrics-motion-status is-" + status.kind, role: "status" },
					e("span", { className: "ivlyrics-motion-status-dot", "aria-hidden": "true" }), status.text) : null,
				e("div", { ref: subtitleRef, className: "ivlyrics-motion-subtitle", "aria-hidden": "true" }),
				e("div", { ref: liveRef, className: "ivlyrics-motion-live", "aria-live": "polite" })
			);
		});
	};

	const react = root.Spicetify?.React;
	root.ivLyricsMotionLyrics = Object.freeze({
		initialized: true,
		...pure,
		requestDirection,
		createEngine,
		Stage: react ? createStage(react) : null,
	});
})(typeof window !== "undefined" ? window : globalThis);

