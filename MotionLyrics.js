// Motion lyrics: a kinetic-typography fullscreen presentation (PC).
//
// Songs with real word or character timing play as a motion-graphics edit.
// A director (MotionLyricsDirector.js, written by AI when a provider is
// available) groups the lines into shots and paces them to the song's tempo;
// each shot becomes a board, a composition of several lines in 3D space, set
// in the faces of its script (MotionLyricsType.js). A camera flies, rolls,
// orbits and dollies across the boards: upcoming lines wait as faint
// outlines, each word lands as solid type with its effect as it is sung, and
// sung lines stay as dim echoes until their board drifts out of view. Motifs,
// a giant background word, colour panels and letterbox bars animate with each
// board, and the video background turns and zooms with the camera. Other
// voices (background vocals, a duet partner) sing in smaller rows of their
// own line, on their own timing. In interludes the board fades soon after
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

	/**
	 * Characters of a line with the time each is sung. Word breaks come from
	 * the voice's text when it spells the same letters (some sources leave the
	 * spaces out of the syllables), otherwise from the syllables' own spaces.
	 */
	const buildChars = (lineText, syllables) => {
		const plain = syllables.map((syllable) => syllable.text).join("").replace(/\s+/gu, "");
		const useLineSpaces = lineText.replace(/\s+/gu, "") === plain;
		const breaks = new Set();
		if (useLineSpaces) {
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
		}
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
				if (useLineSpaces && breaks.has(plainIndex)) pushSpace();
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
	/** Two accent colours that stay vivid and readable over video. */
	const paletteFrom = (accent, aiPalette) => {
		const readable = (rgb) => {
			const [hue, saturation, light] = rgbToHsl(rgb);
			const vivid = saturation < 0.08 ? [0.93, 0.72, 0.66] : [hue, Math.max(saturation, 0.62), clamp(light, 0.58, 0.72)];
			return hslToHex(vivid);
		};
		const fromAi = (Array.isArray(aiPalette) ? aiPalette : []).map(parseColor).filter(Boolean).map(readable);
		if (fromAi.length >= 2) return fromAi.slice(0, 2);
		const base = fromAi.length ? parseColor(fromAi[0]) : (parseColor(accent) || [255, 92, 160]);
		const first = fromAi[0] || readable(base);
		const [hue, saturation] = rgbToHsl(parseColor(first));
		return [first, hslToHex([(hue + 0.42) % 1, Math.max(0.62, saturation), 0.66])];
	};

	// ---------------------------------------------------------------------
	// Type: faces per script (MotionLyricsType.js) and the fonts a song needs
	// ---------------------------------------------------------------------

	const typeLib = () => root.ivLyricsMotionType;
	const UI_FONT = '"Pretendard Variable", Pretendard, "Apple SD Gothic Neo", "Hiragino Sans", sans-serif';
	const FALLBACK_SPEC = Object.freeze({ key: "fallback", script: "latin", kind: "impact", family: UI_FONT, load: null, weight: 800, style: "normal", spacing: 0, lineHeight: 1.08, scale: 1, canvasFont: "normal 800 100px sans-serif" });
	const fallbackMeasure = (text, size) => graphemesOf(text).reduce((sum, piece) => sum + (CJK_RE.test(piece) || /\p{Script=Hangul}/u.test(piece) ? 1 : 0.56), 0) * size;
	const DEFAULT_INFO = Object.freeze({ script: "latin", rtl: false, joined: false, lang: "", words: [] });
	// Word-level stand-ins for letter effects in scripts whose letters join.
	const JOINED_FX = Object.freeze({ type: "wipe", assemble: "blur", drop: "rise", wave: "rise", track: "wipe", bounce: "pop", flicker: "wipe" });

	const createFontBook = () => {
		const specs = new Map();
		return (script, personality = "impact", role = "display") => {
			const key = script + "|" + personality + "|" + role;
			if (!specs.has(key)) specs.set(key, typeLib()?.fontSpec?.(script, personality, role) || FALLBACK_SPEC);
			return specs.get(key);
		};
	};
	const casedText = (text, script, upper) => typeLib()?.casedText?.(text, script, upper) ?? String(text);
	/** The face of a word: a shot's emphasised words may switch to the serif. */
	const faceOf = (type, serif, isEmph) => (isEmph && serif ? "serif" : type);

	/**
	 * The faces a direction will set, each with the characters it sets, so
	 * they can load before the song is composed.
	 */
	const fontNeeds = (model, direction, typography) => {
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
					add(font(script, faceOf(type, shot.serif, emph.has(wordIndex)), "display"), text);
					add(font(script, type, "light"), text);
				});
				(line.backing || []).forEach((voice, voiceIndex) => voice.words.forEach((word, position) => {
					const script = info.backing?.[voiceIndex]?.[position] || info.script;
					add(font(script, type, voice.role === "duet" ? "display" : "light"), cased(word.text, script));
				}));
			}
			if (shot.echo) add(font(typeLib()?.scriptOf?.(shot.echo) || "latin", type, "display"), shot.echo);
		}
		return needs;
	};

	// ---------------------------------------------------------------------
	// Composition: a line's words, then a board of lines (board-local px)
	// ---------------------------------------------------------------------

	const EMPTY_SET = new Set();

	/** A line's words with the face, cased text and natural width each is set in. */
	const itemsOf = (line, ctx, options) => {
		const { size, emph = EMPTY_SET, emphScale = 1.3, light = false, type = "impact", serif = false, upper = false } = options;
		const info = ctx.typography[line.n] || DEFAULT_INFO;
		return line.words.map((word, index) => {
			const isEmph = emph.has(index);
			const script = info.words[index] || info.script;
			const role = light && !isEmph ? "light" : "display";
			const spec = ctx.font(script, faceOf(type, serif, isEmph), role);
			const text = casedText(word.text, script, upper && spec.kind === "impact");
			const wordSize = size * spec.scale * (isEmph ? emphScale : 1) * (role === "light" ? 0.94 : 1);
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
			const fit = fitRows(items, maxLength / scale, 3);
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
	 * A line's words in up to four rows, centred on the line's origin, with
	 * its other voices in smaller rows. leadWidth is the lead's own width.
	 */
	const layoutBlock = (line, ctx, options) => {
		const { size, maxLength, align = "center" } = options;
		const rtl = (ctx.typography[line.n] || DEFAULT_INFO).rtl;
		const lead = fitRows(itemsOf(line, ctx, options), maxLength, 4);
		const { rows, scales } = withVoices(lead.rows, lead.rows.map(() => lead.scale), voiceRows(line, ctx, options, lead.scale, maxLength));
		const block = stackRows(rows, scales, align, rtl, size * lead.scale);
		return { ...block, size: size * lead.scale, rtl, leadWidth: Math.max(...lead.rows.map(rowWidth)) * lead.scale };
	};

	/** A line set as a justified tower: one or two words per row, every row the same width. */
	const towerBlock = (line, ctx, width, options) => {
		const rtl = (ctx.typography[line.n] || DEFAULT_INFO).rtl;
		const sized = { ...options, size: 100 };
		const items = itemsOf(line, ctx, sized);
		const count = items.length <= 4 ? items.length : Math.min(4, Math.ceil(items.length / 2));
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
	const blockOptions = (look, line, extra) => ({ emph: look.emph(line), type: look.type, serif: look.serif, upper: look.upper, light: lightFor(look, line), ...extra });
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
	const layoutZigzag = (lines, ctx, random, look) => {
		const turn = random() < 0.5 ? 90 : -90;
		const gap = ctx.F * 0.24;
		const places = [];
		lines.forEach((line, index) => {
			const vertical = index % 2 === 1;
			const block = layoutBlock(line, ctx, blockOptions(look, line, {
				size: ctx.F * 0.8 * boostOf(line),
				maxLength: ctx.W * 0.72,
				light: lightFor(look, line) && vertical,
			}));
			const rot = vertical ? turn : 0;
			if (!index) {
				places.push({ x: 0, y: 0, z: 0, rot, block });
				return;
			}
			const previous = places[index - 1];
			const previousWidth = previous.rot ? previous.block.height : previous.block.width;
			const previousHeight = previous.rot ? previous.block.width : previous.block.height;
			const width = vertical ? block.height : block.width;
			const height = vertical ? block.width : block.height;
			const x = previous.x + previousWidth / 2 + gap + width / 2;
			let y;
			if (vertical) y = turn > 0 ? previous.y - previousHeight / 2 + height / 2 : previous.y + previousHeight / 2 - height / 2;
			else y = turn > 0 ? previous.y + previousHeight / 2 - height / 2 : previous.y - previousHeight / 2 + height / 2;
			places.push({ x, y, z: 0, rot, block });
		});
		centerPlaces(places);
		const frames = places.map((place) => ({ x: place.x, y: place.y, z: 0, roll: place.rot }));
		return { places, frames, drift: { z: 70, roll: 1.2 } };
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

	const LAYOUT_FNS = Object.freeze({
		column: layoutColumn,
		zigzag: layoutZigzag,
		spiral: layoutSpiral,
		wall: layoutWall,
		tunnel: layoutTunnel,
		collage: layoutCollage,
		hero: layoutHero,
		tower: layoutTower,
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
				z: between(random, -60, 40),
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
	// Entrances that travel sideways, downwards, upwards, through depth or stay put.
	const SIDEWAYS = new Set(["pan", "cut", "whip", "spin", "orbit", "panel"]);
	const DOWNWARDS = new Set(["drop", "flip", "tumble"]);
	const IN_DEPTH = { push: -PUSH_DEPTH, through: -PUSH_DEPTH, pull: PULL_DEPTH, fade: -FADE_DEPTH };
	const HARD_CUTS = new Set(["cut", "panel"]);

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
				const turn = enter === "roll" ? (random() < 0.5 ? 90 : -90) : enter === "flip" ? (random() < 0.5 ? 180 : -180) : 0;
				board.roll = theta + turn - firstFrame.roll;
				const right = rotate2d(1, 0, theta);
				const down = rotate2d(0, 1, theta);
				const sideways = random() < 0.5 ? 1 : -1;
				let direction = null;
				if (SIDEWAYS.has(enter)) direction = { x: right.x * sideways, y: right.y * sideways };
				else if (DOWNWARDS.has(enter)) direction = down;
				else if (enter === "rise") direction = { x: -down.x, y: -down.y };
				else if (enter === "roll") {
					const x = right.x * sideways + down.x * 0.45;
					const y = right.y * sideways + down.y * 0.45;
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
					const gap = HARD_CUTS.has(enter) ? ctx.W * 1.6 : enter === "whip" ? ctx.W * 0.4 : ctx.W * 0.16;
					const distance = Math.max(ahead + behind + gap, ctx.W * 0.85);
					target = { x: last.x + direction.x * distance, y: last.y + direction.y * distance };
				} else {
					const spread = enter === "fade" ? 0.04 : 0.08;
					const side = rotate2d(between(random, -spread, spread) * ctx.W, between(random, -spread * 0.75, spread * 0.75) * ctx.H, theta);
					target = { x: last.x + side.x, y: last.y + side.y };
				}
				const depth = IN_DEPTH[enter] || 0;
				board.origin = { x: target.x - firstOffset.x, y: target.y - firstOffset.y, z: last.z - firstFrame.z + depth };
			}
			board.cameras = board.frames.map((frame) => {
				const point = toWorld(board, frame.x, frame.y);
				const roll = nearestRoll(board.roll + frame.roll + board.dutch, previousRoll);
				previousRoll = roll;
				return { x: point.x, y: point.y, z: board.origin.z + frame.z, roll };
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

	/** How long the camera takes to reach the next line, by move and tempo. */
	const moveDuration = (type, gap, pace) => {
		switch (type) {
			case "line": return clamp((gap + 260) * pace, 300 * Math.min(1, pace), 760 * pace);
			case "cut": return 1;
			case "whip": return clamp((gap + 200) * 0.55 * pace, 260, 520);
			case "panel": return clamp((gap + 300) * pace, 560, 900);
			case "fade": return clamp((gap + 700) * pace, 800, 1800 * pace);
			case "roll":
			case "flip":
			case "spin":
			case "orbit":
			case "tumble": return clamp((gap + 420) * pace, 560, 1150 * pace) * 1.15;
			case "through": return clamp((gap + 420) * pace, 620, 1250 * pace) * 1.2;
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
			line.lastWordStart = Math.max(...line.words.map((word) => word.start));
			line.drift = { z: board.drift.z * feel.drift, roll: board.drift.roll * feel.drift };
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
			else if (!sameBoard && !hardCut(type) && type !== "fade") {
				// Every board move swings a little in depth.
				if (Math.abs(seen.x) >= Math.abs(seen.y)) swing.yaw = 14 * sx;
				else swing.pitch = -11 * sy;
			} else if (sameBoard) swing.yaw = 4 * sx;
			swing.yaw *= feel.swing;
			swing.pitch *= feel.swing;
			line.move = {
				type,
				swing,
				extraRoll: type === "spin" ? (sx > 0 ? 360 : -360) : 0,
				arc: type === "line" ? clamp(distance * 0.1, 20, 150)
					: type === "push" || type === "pull" || hardCut(type) ? 0
						: type === "fade" ? 0
							: type === "orbit" ? clamp(distance * 0.4, 300, 1300)
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
				|| (!sameBoard && board.layout === "spiral" && room >= 1200)) {
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
		boards.forEach((board, index) => {
			const first = lines[board.first];
			const into = index ? lines[board.first - 1] : null;
			if (!index) {
				board.appear = first.arrive - INTRO_MS - 300;
			} else if (board.enter === "cut") {
				board.appear = first.arrive - 60;
			} else if (board.enter === "panel") {
				board.appear = into.move.cutAt - 40;
			} else if (board.enter === "fade") {
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
			} else if (next.enter === "fade") {
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
		plan.flashes = [];
		plan.panels = [];
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
			line.words.forEach((word, index) => slams.push({ time: word.start, strength: (line.emph.has(index) ? 14 : 7) * (line.fx === "zoom" ? 0.6 : 1) }));
		});
		plan.slams = slams.sort((left, right) => left.time - right.time);
	};

	/**
	 * The edit for a song: boards in world space, the camera's path and the
	 * timeline. Pure: the same model, direction, typography, size and seed
	 * give the same plan.
	 */
	const compose = (model, direction, options = {}) => {
		const W = Math.max(320, Number(options.width) || 0);
		const H = Math.max(240, Number(options.height) || 0);
		const F = clamp(Math.min(W * 0.068, H * 0.118), 34, 136);
		const seed = (Number(options.seed) >>> 0) || 1;
		const tempo = direction?.tempo?.tempo || "mid";
		const pace = Number(direction?.tempo?.pace) || 1;
		const typography = Array.isArray(options.typography) ? options.typography : [];
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
			const look = { emph: (line) => line.emph, light: random() < 0.4, type, serif: shot.serif === true, upper: shot.upper === true };
			const layout = (LAYOUT_FNS[shot.layout] || layoutColumn)(members, ctx, random, look);
			members.forEach((line) => {
				const fx = line.fx || shot.fx || "pop";
				line.fx = line.info.joined ? JOINED_FX[fx] || fx : fx;
				line.board = index;
			});
			const board = {
				index,
				layout: shot.layout,
				enter: index ? shot.enter : "push",
				accent: shot.accent || "color",
				type,
				serif: shot.serif === true,
				upper: shot.upper === true,
				bars: shot.bars === true,
				rule: shot.rule === true,
				dutch: Number(shot.dutch) || 0,
				first: shot.from,
				last: shot.to,
				places: layout.places,
				frames: layout.frames,
				drift: layout.drift,
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
		if (!plan.lines.length) return { ...plan, flashes: [], slams: [], panels: [], bars: [] };
		placeBoards(boards, ctx, seed);
		timeline(plan, ctx);
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
	});

	const holdPose = (plan, index, time) => {
		const line = plan.lines[index];
		const camera = line.camera;
		const end = Number.isFinite(line.leave) ? line.leave : line.end + 3200;
		const life = clamp01((time - line.arrive) / Math.max(1, end - line.arrive));
		const ease = easeInOutSine(life);
		let pose = {
			x: camera.x,
			y: camera.y,
			z: camera.z - (line.drift?.z || 0) * ease,
			roll: camera.roll + (line.drift?.roll || 0) * (life - 0.5),
		};
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
			pose.yaw = rest.yaw * swell;
			pose.pitch = rest.pitch * swell;
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
			return { ...pose, yaw: 0, pitch: 0, dolly: 0, sway: null, u };
		}
		let eased;
		if (type === "line") eased = easeInOutQuart(u);
		else if (type === "whip") eased = easeInOutExpo(u);
		else if (type === "fade") eased = easeInOutSine(u);
		else if (type === "push" || type === "pull" || type === "through" || type === "orbit" || type === "tumble") eased = easeInOutCubic(u);
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
		const rollEase = type === "line" ? eased : type === "fade" ? easeInOutSine(u) : easeInOutQuint(u);
		pose.roll = lerp(from.roll, to.roll + move.extraRoll, rollEase);
		const dolly = move.arc * Math.sin(Math.PI * u);
		pose.z += dolly;
		const bell = Math.sin(Math.PI * clamp01(type === "whip" ? u : easeInOutSine(u)));
		return {
			...pose,
			yaw: move.swing.yaw * bell,
			pitch: move.swing.pitch * bell,
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
			const start = { x: target.x, y: target.y, z: target.z + 900, roll: target.roll - 10 };
			const amount = easeInOutCubic(clamp01((time - (first.arrive - INTRO_MS)) / INTRO_MS));
			pose = { ...mixPose(start, target, amount), yaw: 24 * (1 - amount), pitch: -10 * (1 - amount), dolly: 900 * (1 - amount), sway: null };
		} else {
			const index = lineIndexAt(plan, time);
			const line = lines[index];
			const next = lines[index + 1];
			if (next && time > line.leave) {
				pose = movePose(plan, index, time);
			} else {
				pose = { yaw: 0, pitch: 0, dolly: 0, sway: null, ...holdPose(plan, index, time) };
				const previous = lines[index - 1];
				const since = time - line.arrive;
				if (previous && since >= 0 && since < 700 && !["cut", "panel", "fade"].includes(previous.move?.type)) {
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
		const fadeIn = board.index && (board.enter === "cut" || board.enter === "panel") ? 120 : board.enter === "fade" ? 650 : 450;
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
		type: 1, assemble: 1, drop: 1, wave: 1, track: 1, bounce: 1, flicker: 1,
	});
	const CHAR_FX = new Set(["type", "assemble", "drop", "wave", "track", "bounce", "flicker"]);
	const fxPaceOf = (pace) => clamp(Number(pace) || 1, 0.75, 1.5);

	/** Entrance progress of a sung word's solid type (0 before it starts). */
	const wordEntrance = (fx, word, time, pace = 1) => {
		const duration = fx === "stretch" ? clamp(word.end - word.start, 280, 1400) : (FX_DURATION[fx] || 380) * fxPaceOf(pace);
		const lead = fx === "slam" ? 20 : fx === "zoom" || fx === "blur" ? 90 : 50;
		return clamp01((time - (word.start - lead)) / duration);
	};

	const SETTLED = Object.freeze({ opacity: 1, transform: "none", filter: "", clip: "", shadow: "" });
	const HIDDEN = Object.freeze({ opacity: 0, transform: "none", filter: "", clip: "", shadow: "" });
	const frame = (values) => ({ filter: "", clip: "", shadow: "", ...values });

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
				const hidden = round((1 - k) * 112, 1);
				return frame({
					opacity: 1,
					transform: "translateX(" + round((1 - k) * (rtl ? -0.1 : 0.1), 3) + "em)",
					clip: rtl ? "inset(-30% -12% -30% " + hidden + "%)" : "inset(-30% " + hidden + "% -30% -12%)",
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
			default: {
				const k = easeOutBack(progress);
				return frame({ opacity: clamp01(progress * 2.4), transform: "scale(" + round(0.55 + 0.45 * k, 3) + ")" });
			}
		}
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
	 * 3D swings and travel, and zooms with the dolly and the beat.
	 */
	const backgroundFrame = (plan, pose) => {
		let x = 0;
		let y = 0;
		if (pose.sway) {
			const move = rotate2d(pose.sway.dx, pose.sway.dy, -pose.roll);
			const length = Math.hypot(move.x, move.y);
			if (length > 1) {
				const amount = Math.sin(Math.PI * pose.sway.u) * plan.W * (pose.sway.whip ? 0.1 : pose.sway.board ? 0.06 : 0.02);
				x = (-move.x / length) * amount;
				y = (-move.y / length) * amount;
			}
		}
		x -= Math.sin(((pose.yaw || 0) * Math.PI) / 180) * plan.W * 0.42;
		y += Math.sin(((pose.pitch || 0) * Math.PI) / 180) * plan.H * 0.42;
		const dolly = PERSPECTIVE_PX / (PERSPECTIVE_PX + (pose.dolly || 0) * 0.45);
		const wanted = coverScale(-pose.roll, plan.W, plan.H) * 1.14 * dolly * (1 + (pose.beat || 0) * 0.025);
		const scale = Math.max(wanted, coverScale(-pose.roll, plan.W, plan.H, x, y) * 1.01);
		return { rotate: -pose.roll, scale, x, y };
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
		wordEntrance,
		solidFrame,
		charFrame,
		backgroundFrame,
		coverScale,
		barsLevel,
		panelAt,
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
	const requestDirection = ({ trackUri, model, title = "", artist = "", tempo = null, songLang = "" }) => {
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
				lines: director.promptLines(model),
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
	const BOX_ACCENTS = new Set(["box", "underline", "mark"]);

	const createEngine = ({ stage, viewport, camera, scrim, wash, flash, panel, bars, subtitle, live, hudShot, hudTime }) => {
		const document = root.document;
		const shapes = root.ivLyricsMotionShapes;
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
		const cache = { camera: {}, viewport: {}, flash: {}, wash: {}, background: {}, hud: {}, panel: {}, bars: {}, rest: {} };
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
		};

		const mountWord = (board, line, word, wordIndex, spot, lineEl) => {
			const wordEl = document.createElement("div");
			const kind = spot.spec?.kind;
			const voice = spot.voice ? line.backing[spot.voice - 1] : null;
			wordEl.className = "ivlyrics-motion-word"
				+ (kind === "light" ? " is-light" : kind === "serif" ? " is-serif" : "")
				+ (spot.emph ? " is-emph" : "")
				+ (voice ? " is-voice is-" + voice.role : "");
			wordEl.style.fontSize = round(spot.size) + "px";
			wordEl.style.transform = "translate3d(" + round(spot.x) + "px," + round(spot.y) + "px,0) translate(-50%,-56%)";
			applyFont(wordEl, spot.spec || FALLBACK_SPEC);
			if (line.info.rtl) wordEl.dir = "rtl";
			const ghost = document.createElement("span");
			ghost.className = "ivlyrics-motion-ghost";
			ghost.textContent = spot.text || word.text;
			wordEl.appendChild(ghost);
			let box = null;
			let spark = null;
			if (spot.emph && BOX_ACCENTS.has(board.accent)) {
				box = document.createElement("span");
				box.className = "ivlyrics-motion-box is-" + board.accent;
				wordEl.appendChild(box);
			}
			const solid = document.createElement("span");
			solid.className = "ivlyrics-motion-solid";
			let chars = null;
			if (CHAR_FX.has(line.fx) && spot.letters !== false) {
				const cased = (spot.text || word.text) !== word.text;
				chars = word.chars.map((char) => {
					const charEl = document.createElement("span");
					charEl.className = "ivlyrics-motion-char";
					charEl.textContent = cased ? char.ch.toLocaleUpperCase() : char.ch;
					solid.appendChild(charEl);
					return { el: charEl, char, cache: {} };
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
			return { el: wordEl, solid, box, spark, chars, word, index: wordIndex, emph: spot.emph, cache: {} };
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
				echoEl.textContent = board.echo.text;
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
			const lines = board.places.map((place, local) => {
				const line = plan.lines[board.first + local];
				const lineEl = document.createElement("div");
				lineEl.className = "ivlyrics-motion-line";
				if (line.info.lang) lineEl.lang = line.info.lang;
				lineEl.style.transform = "translate3d(" + round(place.x) + "px," + round(place.y) + "px," + round(place.z) + "px) rotateZ(" + round(place.rot, 2) + "deg)";
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
				return { el: lineEl, line, words, rule, cache: {}, settled: null };
			});
			camera.appendChild(el);
			return { el, board, lines, motifs, echo };
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
			for (const word of entry.words) {
				writeSolid(word, sung ? SETTLED : HIDDEN);
				write(word.cache, "active", false, (value) => word.el.classList.toggle("is-active", value));
				if (word.box) write(word.cache, "box", sung ? 1 : 0, (value) => word.box.style.setProperty("--b", String(value)));
				if (word.spark) write(word.cache, "spark", "hidden", (value) => { word.spark.style.visibility = value; });
				if (word.chars) {
					for (const char of word.chars) {
						write(char.cache, "opacity", 1, (value) => { char.el.style.opacity = String(value); });
						write(char.cache, "transform", "none", (value) => { char.el.style.transform = value; });
					}
				}
			}
			if (entry.rule) write(entry.cache, "rule", sung ? 1 : 0, (value) => entry.rule.style.setProperty("--r", String(value)));
		};

		const paintWords = (entry, time, distance) => {
			entry.settled = null;
			const line = entry.line;
			const sway = clamp01(1 - (distance - 0.3) / 0.9);
			const seed = hashString(line.text);
			const pace = plan.pace;
			for (const word of entry.words) {
				const progress = wordEntrance(line.fx, word.word, time, pace);
				writeSolid(word, solidFrame(line.fx, progress, seed + word.index * 7919, line.info.rtl));
				write(word.cache, "active", time >= word.word.start && time < word.word.end, (value) => word.el.classList.toggle("is-active", value));
				if (word.box) {
					write(word.cache, "box", round(easeOutCubic(clamp01((time - word.word.start + 40) / (300 * fxPaceOf(pace)))), 3), (value) => word.box.style.setProperty("--b", String(value)));
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
						const state = charFrame(line.fx, char.char, index, time, context);
						write(char.cache, "opacity", round(state.opacity, 3), (value) => { char.el.style.opacity = String(value); });
						write(char.cache, "transform", state.transform, (value) => { char.el.style.transform = value; });
					});
				}
			}
			if (entry.rule) {
				const k = easeInOutCubic(clamp01((time - line.start + 220) / (900 * fxPaceOf(pace))));
				write(entry.cache, "rule", round(k, 3), (value) => entry.rule.style.setProperty("--r", String(value)));
			}
		};

		const paintBoard = (entry, time, pose, progress, beat, through) => {
			const board = entry.board;
			const visibility = boardVisibility(board, time);
			// Diving through a line lets it grow much closer before it fades.
			const near = through === board.index ? [600, 980, 0.97] : [240, 660, 0.86];
			for (const lineEntry of entry.lines) {
				const line = lineEntry.line;
				const distance = progress - line.n;
				const depth = viewDepth(pose, line.center);
				const closeness = depth > PERSPECTIVE_PX * near[2] ? 0 : 1 - clamp01((depth - near[0]) / (near[1] - near[0]));
				// A line still being sung (overlapping the next one: a duet, an echo) stays bright.
				const singing = distance > 0 && time >= line.start && time < line.end + 150;
				const levels = lineLevels(singing ? Math.min(distance, 0.2) : distance);
				const ghost = round(levels.ghost * visibility * closeness, 3);
				const solid = round(levels.solid * visibility * closeness, 3);
				write(lineEntry.cache, "ghost", ghost, (value) => lineEntry.el.style.setProperty("--lg", String(value)));
				write(lineEntry.cache, "solid", solid, (value) => lineEntry.el.style.setProperty("--ls", String(value)));
				write(lineEntry.cache, "visibility", ghost <= 0.002 && solid <= 0.002 ? "hidden" : "visible", (value) => { lineEntry.el.style.visibility = value; });
				if (time >= line.start - 900 && time <= line.end + 1700) paintWords(lineEntry, time, distance);
				else settleLine(lineEntry, time > line.end);
			}
			for (const item of entry.motifs) {
				const motif = item.motif;
				const startAt = motif.line === null ? board.appear + 250 : plan.lines[board.first + motif.line].start - 60;
				if (time < startAt || visibility <= 0.002) {
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
				write(item.cache, "opacity", round(motif.opacity * visibility * fade, 3), (value) => { item.el.style.opacity = String(value); });
				write(item.cache, "transform",
					"translate3d(" + round(motif.x) + "px," + round(motif.y) + "px," + round(motif.z) + "px) translate(-50%,-50%) rotate(" + round(rotation, 1) + "deg) scale(" + round(scale, 3) + ")",
					(value) => { item.el.style.transform = value; });
				const draw = round(1 - easeOutCubic(clamp01(since / (760 * fxPaceOf(plan.pace)))), 3);
				write(item.cache, "draw", draw, (value) => {
					for (const path of item.paths) if (path.mode === "stroke") path.el.style.strokeDashoffset = String(value);
				});
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
				const frameState = backgroundFrame(plan, pose);
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
				subtitle.classList.toggle("is-resting", value > 0.5);
			});
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
		const t = (key, fallback) => root.I18n?.t?.(key) || fallback;

		return react.memo(({ lyrics = [], trackUri = "", accent = "", isPlaying = false, title = "", artist = "" }) => {
			const rootRef = useRef(null);
			const viewportRef = useRef(null);
			const cameraRef = useRef(null);
			const scrimRef = useRef(null);
			const washRef = useRef(null);
			const flashRef = useRef(null);
			const panelRef = useRef(null);
			const barsRef = useRef(null);
			const subtitleRef = useRef(null);
			const liveRef = useRef(null);
			const hudShotRef = useRef(null);
			const hudTimeRef = useRef(null);
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
					flash: flashRef.current,
					panel: panelRef.current,
					bars: barsRef.current,
					subtitle: subtitleRef.current,
					live: liveRef.current,
					hudShot: hudShotRef.current,
					hudTime: hudTimeRef.current,
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

			useEffect(() => {
				if (!model.length || !trackUri) return undefined;
				let cancelled = false;
				setAi({ key: aiKey, status: "loading", raw: null });
				setShowFailure(false);
				requestDirection({ trackUri, model, title, artist, tempo, songLang }).then((result) => {
					if (cancelled) return;
					setAi({ key: aiKey, status: result.status, raw: result.raw || null });
					if (result.status === "failed") {
						console.warn("[ivLyrics motion] AI direction failed:", result.error);
						setShowFailure(true);
					}
				});
				return () => { cancelled = true; };
			}, [aiKey]);

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
			const needs = useMemo(() => (direction ? fontNeeds(model, direction, typography) : new Map()), [direction, typography]);
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
				});
			}, [planReady, direction, size.width, size.height, fonts.epoch, planAnalysis, typography]);

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
					"--iv-motion-perspective": PERSPECTIVE_PX + "px",
					"--iv-motion-ui": UI_FONT,
				},
			},
				e("div", { ref: scrimRef, className: "ivlyrics-motion-scrim", "aria-hidden": "true" }),
				e("div", { ref: washRef, className: "ivlyrics-motion-wash", "aria-hidden": "true" }),
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
				status ? e("div", { className: "ivlyrics-motion-status is-" + status.kind, role: "status" },
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

