// Motion lyrics: a kinetic-typography fullscreen presentation (PC).
//
// Songs with real word or character timing play as a motion-graphics edit.
// A director (MotionLyricsDirector.js, written by AI when a provider is
// available) groups the lines into shots; each shot becomes a board, a
// composition of several lines in 3D space. A camera flies, rolls and dollies
// across the boards: upcoming lines wait as faint outlines, each word slams,
// pops or assembles into solid type as it is sung, and sung lines stay as dim
// echoes until their board drifts out of view. Motifs and a giant background
// word animate with each board, and the video background turns and zooms with
// the camera. Everything is planned once per song and read by playback
// position, so seeking, pausing and sync offsets need no extra handling.
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
	const FONT_WAIT_MS = 2600;

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

	/** The lead voice's timed units (word or character syllables). */
	const leadSyllablesOf = (line) => {
		const lead = line?.vocals?.lead?.syllables;
		const list = Array.isArray(lead) && lead.length ? lead : (Array.isArray(line?.syllables) ? line.syllables : []);
		const syllables = [];
		for (const syllable of list) {
			const text = String(syllable?.text ?? "");
			const start = finiteTime(syllable?.startTime ?? syllable?.karaokeFillStartTime);
			const end = finiteTime(syllable?.endTime ?? syllable?.karaokeFillEndTime);
			if (!text || !Number.isFinite(start)) continue;
			syllables.push({ text, start, end: Number.isFinite(end) && end >= start ? end : start });
		}
		return syllables;
	};

	/** Whether the lyrics carry real (not estimated) word or character timing. */
	const hasRealTiming = (lines, karaoke, karaokeSource = null) => karaoke === true
		&& !PSEUDO_KARAOKE_SOURCES.has(karaokeSource)
		&& Array.isArray(lines)
		&& lines.some((line) => leadSyllablesOf(line).length > 0);

	/**
	 * Characters of a line with the time each is sung. Word breaks come from
	 * the line text when it spells the same letters (some sources leave the
	 * spaces out of the syllables), otherwise from the syllables' own spaces.
	 */
	const buildChars = (line, syllables) => {
		const plain = syllables.map((syllable) => syllable.text).join("").replace(/\s+/gu, "");
		const lineText = typeof line?.originalText === "string" && line.originalText.trim()
			? line.originalText
			: String(line?.text ?? "");
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

	/** Words of a line, each with its characters and their timing. */
	const buildWords = (line) => {
		const syllables = leadSyllablesOf(line);
		if (!syllables.length) return [];
		const runs = [];
		let current = [];
		for (const char of buildChars(line, syllables)) {
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

	/** Lines that can play, in time order. */
	const buildModel = (lyrics) => {
		const lines = [];
		(Array.isArray(lyrics) ? lyrics : []).forEach((line, index) => {
			const words = buildWords(line);
			if (!words.length || !words.some((word) => SOUND_RE.test(word.text))) return;
			const syllables = leadSyllablesOf(line);
			const single = syllables.filter((syllable) => graphemesOf(syllable.text.trim()).length <= 1).length;
			lines.push({
				index,
				words,
				text: words.map((word) => word.text).join(" "),
				start: words[0].start,
				end: Math.max(...words.map((word) => word.end)),
				chars: words.reduce((count, word) => count + word.chars.length, 0),
				charTimed: single / syllables.length >= 0.7,
				translation: translationOf(line),
			});
		});
		return lines.sort((left, right) => left.start - right.start);
	};

	const modelSignature = (lines) => lines.map((line) => Math.round(line.start) + ":" + line.text).join("\u0001");

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
	// Colour and type
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

	const FONT_LINK_ID = "ivlyrics-motion-fonts";
	const FONT_URL = "https://fonts.googleapis.com/css2?family=Anton&family=Black+Han+Sans&family=Dela+Gothic+One&family=ZCOOL+QingKe+HuangYou&display=swap";
	const DISPLAY_FAMILIES = ["Anton", "Dela Gothic One", "Black Han Sans", "ZCOOL QingKe HuangYou"];
	const DISPLAY_FONT = DISPLAY_FAMILIES.map((family) => '"' + family + '"').join(", ") + ', "Pretendard Variable", Pretendard, sans-serif';
	const LIGHT_FONT = '"Pretendard Variable", Pretendard, "Hiragino Sans", "Apple SD Gothic Neo", sans-serif';
	const FONT_ROLES = Object.freeze({
		display: { family: DISPLAY_FONT, weight: 800, spacing: -0.005, lineHeight: 1.02 },
		light: { family: LIGHT_FONT, weight: 250, spacing: -0.02, lineHeight: 1.16 },
	});
	const HANGUL_RE = /\p{Script=Hangul}/u;
	let fontCss = null;

	/** Loads the display faces for the song's characters (bounded wait; fallbacks still render). */
	const ensureFonts = (document, sample) => {
		if (!document?.head || typeof document.createElement !== "function") return Promise.resolve(false);
		if (!fontCss) {
			fontCss = new Promise((resolve) => {
				let link = document.getElementById(FONT_LINK_ID);
				if (link?.sheet) {
					resolve(true);
					return;
				}
				if (!link) {
					link = document.createElement("link");
					link.id = FONT_LINK_ID;
					link.rel = "stylesheet";
					link.href = FONT_URL;
					document.head.appendChild(link);
				}
				link.addEventListener("load", () => resolve(true), { once: true });
				link.addEventListener("error", () => resolve(false), { once: true });
				root.setTimeout(() => resolve(false), FONT_WAIT_MS);
			});
		}
		const fonts = document.fonts;
		const text = String(sample || "Aa").slice(0, 600) || "Aa";
		const wait = new Promise((resolve) => root.setTimeout(resolve, FONT_WAIT_MS, false));
		const load = fontCss.then(() => {
			if (typeof fonts?.load !== "function") return false;
			return Promise.all([
				...DISPLAY_FAMILIES.map((family) => fonts.load('400 64px "' + family + '"', text).catch(() => [])),
				fonts.load('250 64px "Pretendard Variable"', text).catch(() => []),
			]).then(() => true);
		});
		return Promise.race([load, wait]);
	};

	const createMeasurer = (document) => {
		const canvas = document?.createElement?.("canvas");
		const context = canvas?.getContext?.("2d");
		const cache = new Map();
		return (text, size, role = "display") => {
			const font = FONT_ROLES[role] || FONT_ROLES.display;
			const key = role + "\u0001" + text;
			let width = cache.get(key);
			if (width === undefined) {
				const pieces = graphemesOf(text);
				if (context) {
					context.font = font.weight + " 100px " + font.family;
					width = context.measureText(text).width + font.spacing * 100 * pieces.length;
				} else {
					width = pieces.reduce((sum, piece) => sum + (CJK_RE.test(piece) || HANGUL_RE.test(piece) ? 100 : role === "display" ? 50 : 56), 0);
				}
				cache.set(key, width);
			}
			return (width * size) / 100;
		};
	};
	const fallbackMeasure = createMeasurer(null);

	// ---------------------------------------------------------------------
	// Composition: a line's words, then a board of lines (board-local px)
	// ---------------------------------------------------------------------

	const EMPTY_SET = new Set();

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

	/** A line's words in up to four rows, centred on the line's origin. */
	const layoutBlock = (line, ctx, options) => {
		const { size, maxLength, emph = EMPTY_SET, emphScale = 1.3, light = false, align = "center" } = options;
		const items = line.words.map((word, index) => {
			const isEmph = emph.has(index);
			const role = light && !isEmph ? "light" : "display";
			const wordSize = size * (isEmph ? emphScale : 1) * (role === "light" ? 0.94 : 1);
			return {
				index,
				role,
				emph: isEmph,
				size: wordSize,
				width: ctx.measure(word.text, wordSize, role),
				// Words the segmenter split from one unspaced run stay close.
				gap: index ? size * (word.joined ? 0.05 : 0.27) : 0,
			};
		});
		const rowWidth = (row) => row.reduce((sum, item, position) => sum + item.width + (position ? item.gap : 0), 0);
		const total = rowWidth(items);
		let rows = [items];
		if (total > maxLength && items.length > 1) {
			for (let count = 2; count <= Math.min(4, items.length); count += 1) {
				rows = splitRows(items, count, total);
				if (Math.max(...rows.map(rowWidth)) <= maxLength) break;
			}
		}
		const widest = Math.max(...rows.map(rowWidth));
		const scale = widest > maxLength ? maxLength / widest : 1;
		const metrics = rows.map((row) => {
			const tallest = Math.max(...row.map((item) => item.size)) * scale;
			const lineHeight = row.some((item) => item.role === "display") ? FONT_ROLES.display.lineHeight : FONT_ROLES.light.lineHeight;
			return { row, width: rowWidth(row) * scale, height: tallest * lineHeight, tallest };
		});
		const rowGap = size * scale * 0.05;
		const width = Math.max(...metrics.map((metric) => metric.width));
		const height = metrics.reduce((sum, metric) => sum + metric.height, 0) + rowGap * (metrics.length - 1);
		const words = new Array(items.length);
		let top = -height / 2;
		for (const metric of metrics) {
			let x = align === "left" ? -width / 2 : align === "right" ? width / 2 - metric.width : -metric.width / 2;
			metric.row.forEach((item, position) => {
				if (position) x += item.gap * scale;
				const itemWidth = item.width * scale;
				const itemSize = item.size * scale;
				words[item.index] = {
					x: x + itemWidth / 2,
					y: top + metric.height / 2 + (metric.tallest - itemSize) * 0.3,
					size: itemSize,
					width: itemWidth,
					role: item.role,
					emph: item.emph,
				};
				x += itemWidth;
			});
			top += metric.height + rowGap;
		}
		return { words, width, height, size: size * scale, rows: metrics.length };
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
	/** Thin type sets off the heavy emphasised words, so a line goes thin only when it has some. */
	const lightFor = (look, line) => look.light && look.emph(line).size > 0;
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
		const blocks = lines.map((line, index) => layoutBlock(line, ctx, {
			size: ctx.F * 0.84 * boostOf(line),
			maxLength: ctx.W * 0.78,
			emph: look.emph(line),
			light: lightFor(look, line),
			align: align === "stagger" ? (index % 2 ? "right" : "left") : align,
		}));
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
			const block = layoutBlock(line, ctx, {
				size: ctx.F * 0.8 * boostOf(line),
				maxLength: ctx.W * 0.72,
				emph: look.emph(line),
				light: lightFor(look, line) && vertical,
			});
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
		const blocks = lines.map((line) => layoutBlock(line, ctx, {
			size: ctx.F * 0.72 * boostOf(line),
			maxLength: ctx.W * 0.58,
			emph: look.emph(line),
			light: lightFor(look, line),
		}));
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
			const light = alternate && index % 2 === 1;
			const options = { emph: look.emph(line), emphScale: 1.12, light, align };
			const natural = layoutBlock(line, ctx, { ...options, size: 100, maxLength: Infinity }).width / 100;
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
				block: layoutBlock(line, ctx, { size: ctx.F * 0.9 * boostOf(line), maxLength: ctx.W * 0.76, emph: look.emph(line), light: lightFor(look, line) }),
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
			const block = layoutBlock(line, ctx, {
				size: ctx.F * between(random, 0.62, 1.02) * boostOf(line),
				maxLength: ctx.W * 0.6,
				emph: look.emph(line),
				light: lightFor(look, line) && random() < 0.6,
			});
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
		const options = { emph: look.emph(first), emphScale: 1.25 };
		const natural = layoutBlock(first, ctx, { ...options, size: 100, maxLength: Infinity }).width / 100;
		const size = clamp((ctx.W * 0.84) / Math.max(1, natural), ctx.F * 0.9, ctx.F * 2.5);
		let block = layoutBlock(first, ctx, { ...options, size, maxLength: ctx.W * 0.86 });
		if (block.height > ctx.H * 0.56) block = layoutBlock(first, ctx, { ...options, size: (size * ctx.H * 0.56) / block.height, maxLength: ctx.W * 0.86 });
		const places = [{ x: 0, y: 0, z: 0, rot: 0, block }];
		if (second) {
			const small = layoutBlock(second, ctx, { size: Math.max(ctx.F * 0.5, block.size * 0.42), maxLength: ctx.W * 0.8, emph: look.emph(second), light: true });
			places.push({ x: 0, y: block.height / 2 + ctx.F * 0.28 + small.height / 2, z: 0, rot: 0, block: small });
			centerPlaces(places);
		}
		const frames = places.map((place) => ({ x: 0, y: place.y * 0.5, z: 0, roll: 0 }));
		return { places, frames, drift: { z: 170, roll: 1.2 } };
	};

	const LAYOUT_FNS = Object.freeze({
		column: layoutColumn,
		zigzag: layoutZigzag,
		spiral: layoutSpiral,
		wall: layoutWall,
		tunnel: layoutTunnel,
		collage: layoutCollage,
		hero: layoutHero,
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
					spin: between(random, -7, 7),
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
				spin: between(random, -42, 42) * (CALM_MOTIFS.has(name) ? 0.25 : 1),
				accent: random() < 0.55,
				opacity: 0.94,
			});
		});
		let echo = null;
		if (shot.echo) {
			const vertical = board.layout === "zigzag" && random() < 0.5;
			const natural = Math.max(0.5, ctx.measure(shot.echo, 100, "display") / 100);
			const span = vertical ? Math.max(extent.h, ctx.H) * 1.05 : Math.max(extent.w, ctx.W) * 1.08;
			echo = {
				text: shot.echo,
				x: extent.cx,
				y: extent.cy,
				z: -460,
				size: clamp(span / natural, ctx.F * 1.6, ctx.F * 5.5),
				rot: vertical ? 90 : between(random, -4, 4),
				drift: (random() < 0.5 ? -1 : 1) * ctx.W * between(random, 0.03, 0.07),
			};
		}
		return { motifs, echo };
	};

	// ---------------------------------------------------------------------
	// The plan: boards in world space, the camera's path, the timeline
	// ---------------------------------------------------------------------

	const MOODS = Object.freeze({
		calm: { pace: 1.15, shake: 0.55, punch: 0.6 },
		dreamy: { pace: 1.2, shake: 0.5, punch: 0.5 },
		melancholic: { pace: 1.15, shake: 0.5, punch: 0.55 },
		warm: { pace: 1, shake: 0.8, punch: 0.9 },
		playful: { pace: 0.95, shake: 1, punch: 1 },
		energetic: { pace: 0.88, shake: 1.15, punch: 1.25 },
		intense: { pace: 0.85, shake: 1.35, punch: 1.45 },
		dark: { pace: 1.05, shake: 0.9, punch: 1.1 },
	});
	const moodOf = (plan) => MOODS[plan?.mood] || MOODS.warm;
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
				if (enter === "pan" || enter === "cut") direction = { x: right.x * sideways, y: right.y * sideways };
				else if (enter === "drop" || enter === "flip") direction = down;
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
					const gap = enter === "cut" ? ctx.W * 1.6 : ctx.W * 0.16;
					const distance = Math.max(ahead + behind + gap, ctx.W * 0.85);
					target = { x: last.x + direction.x * distance, y: last.y + direction.y * distance };
				} else {
					const side = rotate2d(between(random, -0.08, 0.08) * ctx.W, between(random, -0.06, 0.06) * ctx.H, theta);
					target = { x: last.x + side.x, y: last.y + side.y };
				}
				const depth = enter === "push" ? -PUSH_DEPTH : enter === "pull" ? PULL_DEPTH : 0;
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

	/** Where the camera pulls back to show a whole board, keeping its roll. */
	const revealPose = (board, roll, ctx) => {
		const local = board.corners.map((corner) => rotate2d(corner.x, corner.y, -roll));
		const xs = local.map((point) => point.x);
		const ys = local.map((point) => point.y);
		const width = Math.max(...xs) - Math.min(...xs);
		const height = Math.max(...ys) - Math.min(...ys);
		const center = rotate2d((Math.max(...xs) + Math.min(...xs)) / 2, (Math.max(...ys) + Math.min(...ys)) / 2, roll);
		const scale = clamp(Math.min((ctx.W * 0.88) / Math.max(1, width), (ctx.H * 0.82) / Math.max(1, height)), 0.34, 0.92);
		const z = board.layout === "tunnel" ? board.cameras[board.cameras.length - 1].z + 320 : board.planeZ + PERSPECTIVE_PX * (1 / scale - 1);
		return { x: center.x, y: center.y, z, roll };
	};

	const timeline = (plan, ctx) => {
		const { boards, lines } = plan;
		const pace = moodOf(plan).pace;
		lines.forEach((line) => {
			const board = boards[line.board];
			line.local = line.n - board.first;
			line.camera = board.cameras[line.local];
			line.place = board.places[line.local];
			line.worldZ = board.origin.z + line.place.z;
			line.arrive = line.start - ARRIVE_LEAD_MS;
			line.lastWordStart = Math.max(...line.words.map((word) => word.start));
			line.drift = board.drift;
		});
		lines.forEach((line, index) => {
			const next = lines[index + 1];
			if (!next) {
				line.leave = Infinity;
				line.move = null;
				line.outro = line.end + 1600;
				return;
			}
			const sameBoard = next.board === line.board;
			const type = sameBoard ? "line" : boards[next.board].enter;
			const gap = next.start - line.end;
			let duration;
			if (type === "cut") duration = 1;
			else if (sameBoard) duration = clamp((gap + 260) * pace, 300, 760);
			else duration = clamp((gap + 420) * pace, 520, 1150) * (type === "roll" || type === "flip" ? 1.12 : 1);
			let leave = Math.max(next.arrive - duration, line.lastWordStart + 140);
			if (type !== "cut" && next.arrive - leave < 220) leave = next.arrive - 220;
			leave = type === "cut" ? next.arrive - 1 : leave;
			line.leave = Math.max(leave, line.arrive + 60);
			const distance = Math.hypot(next.camera.x - line.camera.x, next.camera.y - line.camera.y);
			line.move = {
				type,
				arc: type === "line" ? clamp(distance * 0.1, 20, 150)
					: type === "push" || type === "pull" || type === "cut" ? 0
						: clamp(distance * 0.3, 160, 950),
			};
			const board = boards[line.board];
			const room = line.leave - (line.end + 250);
			if (gap >= LONG_GAP_MS
				|| (!sameBoard && board.layout === "wall" && room >= 900)
				|| (!sameBoard && board.layout === "spiral" && room >= 1200)) {
				line.reveal = { start: line.end + (gap >= LONG_GAP_MS ? 700 : 250), end: line.leave, pose: revealPose(board, line.camera.roll, ctx) };
			}
		});
		boards.forEach((board, index) => {
			const first = lines[board.first];
			if (!index) {
				board.appear = first.arrive - INTRO_MS - 300;
			} else {
				const previous = lines[board.first - 1];
				board.appear = board.enter === "cut"
					? first.arrive - 60
					: Math.min(previous.leave - 120, Math.max(previous.start, previous.leave - BOARD_PREVIEW_MS));
			}
			const next = boards[index + 1];
			if (!next) {
				board.fadeAt = Infinity;
				board.fadeEnd = Infinity;
			} else {
				const nextArrive = lines[next.first].arrive;
				board.fadeAt = next.enter === "cut" ? nextArrive - 80 : nextArrive + BOARD_LINGER_MS;
				board.fadeEnd = next.enter === "cut" ? nextArrive + 40 : board.fadeAt + BOARD_FADE_MS;
			}
		});
		plan.flashes = boards.filter((board) => board.index && board.enter === "cut").map((board) => ({ time: lines[board.first].arrive, strength: 0.6 }));
		const slams = [];
		lines.forEach((line) => {
			if (line.fx !== "slam") return;
			line.words.forEach((word, index) => slams.push({ time: word.start, strength: line.emph.has(index) ? 14 : 7 }));
		});
		plan.slams = slams.sort((left, right) => left.time - right.time);
	};

	/**
	 * The edit for a song: boards in world space, the camera's path and the
	 * timeline. Pure: the same model, direction, size and seed give the same plan.
	 */
	const compose = (model, direction, options = {}) => {
		const W = Math.max(320, Number(options.width) || 0);
		const H = Math.max(240, Number(options.height) || 0);
		const F = clamp(Math.min(W * 0.068, H * 0.118), 34, 136);
		const ctx = { W, H, F, measure: typeof options.measure === "function" ? options.measure : fallbackMeasure };
		const seed = (Number(options.seed) >>> 0) || 1;
		const shots = Array.isArray(direction?.shots) ? direction.shots : [];
		const lines = model.map((line, index) => ({
			...line,
			n: index,
			emph: new Set(direction?.lines?.[index]?.emph || []),
			fx: direction?.lines?.[index]?.fx || null,
			board: -1,
		}));
		const boards = shots.map((shot, index) => {
			const members = lines.slice(shot.from, shot.to + 1);
			// Repeated sections are composed the same way every time they come back.
			const random = createRandom(seed ^ hashString(shot.layout + "\u0001" + members.map((line) => line.text).join("\u0002")));
			const look = { emph: (line) => line.emph, light: random() < 0.45 };
			const layout = (LAYOUT_FNS[shot.layout] || layoutColumn)(members, ctx, random, look);
			members.forEach((line) => {
				line.fx = line.fx || shot.fx || "pop";
				line.board = index;
			});
			const board = {
				index,
				layout: shot.layout,
				enter: index ? shot.enter : "push",
				accent: shot.accent || "color",
				dutch: Number(shot.dutch) || 0,
				first: shot.from,
				last: shot.to,
				places: layout.places,
				frames: layout.frames,
				drift: layout.drift,
				color: index % 2,
			};
			board.localCorners = board.places.flatMap(cornersOf);
			Object.assign(board, decorate(board, ctx, random, shot, direction || {}));
			return board;
		});
		const plan = {
			W, H, F,
			mood: direction?.mood || "warm",
			source: direction?.source || "local",
			boards,
			lines: lines.filter((line) => line.board >= 0),
			pulses: pulsesInMs(options.analysis),
		};
		if (!plan.lines.length) return { ...plan, flashes: [], slams: [] };
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

	/**
	 * Camera pose at a playback position: the planned path plus a settling
	 * overshoot, a handheld drift, beat punches and slam shakes. Also reports
	 * the dolly (pull-back) and the move in progress, for the background.
	 */
	const cameraPose = (plan, time, pulses = plan?.pulses) => {
		const lines = plan?.lines || [];
		if (!lines.length) return { x: 0, y: 0, z: 0, roll: 0, dolly: 0, sway: null, beat: 0 };
		let pose;
		let dolly = 0;
		let sway = null;
		const first = lines[0];
		if (time < first.arrive) {
			const target = holdPose(plan, 0, first.arrive);
			const start = { x: target.x, y: target.y, z: target.z + 900, roll: target.roll - 10 };
			const amount = easeInOutCubic(clamp01((time - (first.arrive - INTRO_MS)) / INTRO_MS));
			pose = mixPose(start, target, amount);
			dolly = 900 * (1 - amount);
		} else {
			const index = lineIndexAt(plan, time);
			const line = lines[index];
			const next = lines[index + 1];
			if (next && time > line.leave) {
				const u = clamp01((time - line.leave) / Math.max(1, next.arrive - line.leave));
				const from = holdPose(plan, index, line.leave);
				const to = holdPose(plan, index + 1, next.arrive);
				const type = line.move.type;
				if (type === "cut") {
					pose = u >= 1 ? to : from;
				} else {
					const eased = type === "line" ? easeInOutQuart(u) : type === "push" || type === "pull" ? easeInOutCubic(u) : easeInOutExpo(u);
					pose = mixPose(from, to, eased);
					pose.roll = lerp(from.roll, to.roll, type === "line" ? eased : easeInOutQuint(u));
					dolly = line.move.arc * Math.sin(Math.PI * u);
					pose.z += dolly;
					sway = { u, dx: to.x - from.x, dy: to.y - from.y, board: type !== "line" };
				}
			} else {
				pose = holdPose(plan, index, time);
				const previous = lines[index - 1];
				const since = time - line.arrive;
				if (previous && since >= 0 && since < 700 && previous.move?.type !== "cut") {
					const k = since / 700;
					const spring = Math.sin(k * Math.PI * 2.2) * Math.exp(-k * 4.5);
					const dx = line.camera.x - previous.camera.x;
					const dy = line.camera.y - previous.camera.y;
					const distance = Math.hypot(dx, dy) || 1;
					const push = Math.min(34, distance * 0.02) * spring;
					pose.x += (dx / distance) * push;
					pose.y += (dy / distance) * push;
					pose.roll += clamp((line.camera.roll - previous.camera.roll) * 0.04, -3.5, 3.5) * spring;
				}
			}
		}
		const mood = moodOf(plan);
		let shakeX = (Math.sin(time * 0.00071 + 1.3) * 0.6 + Math.sin(time * 0.00153 + 0.4) * 0.4) * 5 * mood.shake;
		let shakeY = (Math.sin(time * 0.00063 + 2.1) * 0.6 + Math.sin(time * 0.00117) * 0.4) * 4 * mood.shake;
		pose.roll += Math.sin(time * 0.00043 + 0.7) * 0.32 * mood.shake;
		const slam = recentEvent(plan.slams, time, 220);
		if (slam) {
			const k = 1 - slam.since / 220;
			shakeX += Math.sin(slam.since * 0.11) * slam.strength * k;
			shakeY += Math.cos(slam.since * 0.13) * slam.strength * k * 0.7;
			pose.roll += Math.sin(slam.since * 0.08) * 0.09 * slam.strength * k;
		}
		const shake = rotate2d(shakeX, shakeY, pose.roll);
		pose.x += shake.x;
		pose.y += shake.y;
		let beatAmount = 0;
		const beat = beatAt(pulses, time);
		if (beat) {
			beatAmount = beat.strength * mood.punch * Math.exp(-beat.since / 150);
			pose.z -= 46 * beat.strength * mood.punch * Math.exp(-beat.since / 130);
			pose.roll += (beat.index % 2 ? 1 : -1) * 0.5 * beat.strength * mood.punch * Math.exp(-beat.since / 160);
		}
		pose.dolly = dolly;
		pose.sway = sway;
		pose.beat = beatAmount;
		return pose;
	};

	const boardVisibility = (board, time) => {
		const fadeIn = board.index && board.enter === "cut" ? 120 : 450;
		const into = easeOutCubic(clamp01((time - board.appear) / fadeIn));
		const out = Number.isFinite(board.fadeAt) ? 1 - easeInOutCubic(clamp01((time - board.fadeAt) / Math.max(1, board.fadeEnd - board.fadeAt))) : 1;
		return into * out;
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

	const FX_DURATION = Object.freeze({ pop: 380, slide: 420, rise: 440, slam: 230, flip: 480, type: 1, assemble: 1, drop: 1, wave: 1 });
	const CHAR_FX = new Set(["type", "assemble", "drop", "wave"]);

	/** Entrance progress of a sung word's solid type (0 before it starts). */
	const wordEntrance = (fx, word, time) => {
		const duration = fx === "stretch" ? clamp(word.end - word.start, 280, 1400) : FX_DURATION[fx] || 380;
		return clamp01((time - (word.start - (fx === "slam" ? 20 : 50))) / duration);
	};

	/** The solid word's opacity and transform for its entrance. */
	const solidFrame = (fx, progress) => {
		if (progress <= 0) return { opacity: 0, transform: "none" };
		if (progress >= 1 || CHAR_FX.has(fx)) return { opacity: 1, transform: "none" };
		switch (fx) {
			case "slide": {
				const k = easeOutExpo(progress);
				return { opacity: clamp01(progress * 2.5), transform: "translateX(" + round((1 - k) * -0.55, 3) + "em) skewX(" + round((1 - k) * -14, 1) + "deg)" };
			}
			case "rise": {
				const k = easeOutCubic(progress);
				return { opacity: clamp01(progress * 2), transform: "translateY(" + round((1 - k) * 0.42, 3) + "em)" };
			}
			case "slam": {
				const k = easeOutCubic(progress);
				return { opacity: clamp01(progress * 3), transform: "scale(" + round(1 + (1 - k) * 1.5, 3) + ")" };
			}
			case "stretch": {
				const k = easeOutCubic(progress);
				return { opacity: clamp01(progress * 5), transform: "scale(" + round(0.5 + 0.5 * k, 3) + "," + round(1.18 - 0.18 * k, 3) + ")" };
			}
			case "flip": {
				const k = easeOutBack(progress);
				return { opacity: clamp01(progress * 2.2), transform: "rotateX(" + round((1 - k) * 88, 1) + "deg)" };
			}
			default: {
				const k = easeOutBack(progress);
				return { opacity: clamp01(progress * 2.4), transform: "scale(" + round(0.55 + 0.45 * k, 3) + ")" };
			}
		}
	};

	const scatterOf = (seed) => {
		const random = createRandom(seed);
		return { x: (random() * 2 - 1) * 1.7, y: (random() * 2 - 1) * 1.25, r: (random() * 2 - 1) * 75, s: random() * 0.7 };
	};

	/** A character's state for the letter-by-letter effects (sway: how much "wave" still floats). */
	const charFrame = (fx, char, index, time, seed = 0, sway = 1) => {
		switch (fx) {
			case "type": {
				const e = clamp01((time - (char.start - 30)) / 140);
				return { opacity: e, transform: e <= 0 || e >= 1 ? "none" : "scale(" + round(1.35 - 0.35 * easeOutCubic(e), 3) + ")" };
			}
			case "assemble": {
				const e = clamp01((time - (char.start - 380)) / 440);
				if (e <= 0) return { opacity: 0, transform: "none" };
				if (e >= 1) return { opacity: 1, transform: "none" };
				const k = easeOutCubic(e);
				const scatter = scatterOf((seed + index * 2654435761) >>> 0);
				return {
					opacity: clamp01(e * 3),
					transform: "translate(" + round(scatter.x * (1 - k), 3) + "em," + round(scatter.y * (1 - k), 3) + "em) rotate("
						+ round(scatter.r * (1 - k), 1) + "deg) scale(" + round(1 + (1 - k) * scatter.s, 3) + ")",
				};
			}
			case "drop": {
				const e = clamp01((time - (char.start - 60)) / 420);
				if (e <= 0) return { opacity: 0, transform: "none" };
				return { opacity: clamp01(e * 4), transform: e >= 1 ? "none" : "translateY(" + round((1 - easeOutBounce(e)) * -0.9, 3) + "em)" };
			}
			case "wave": {
				const e = clamp01((time - (char.start - 40)) / 260);
				if (e <= 0) return { opacity: 0, transform: "none" };
				const bob = Math.sin(time * 0.0052 + index * 0.65) * 0.07 * sway;
				const offset = (1 - easeOutBack(e)) * 0.35 + bob;
				return { opacity: e, transform: Math.abs(offset) < 0.001 ? "none" : "translateY(" + round(offset, 3) + "em)" };
			}
			default:
				return time >= char.start ? { opacity: 1, transform: "none" } : { opacity: 0, transform: "none" };
		}
	};

	/**
	 * Smallest scale at which a width x height layer, turned by `degrees` and
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

	/** Rotation, zoom and offset of the video background so it moves like the far plane of the same camera. */
	const backgroundFrame = (plan, pose) => {
		let x = 0;
		let y = 0;
		if (pose.sway) {
			const move = rotate2d(pose.sway.dx, pose.sway.dy, -pose.roll);
			const length = Math.hypot(move.x, move.y);
			if (length > 1) {
				const amount = Math.sin(Math.PI * pose.sway.u) * plan.W * (pose.sway.board ? 0.06 : 0.02);
				x = (-move.x / length) * amount;
				y = (-move.y / length) * amount;
			}
		}
		// The far plane zooms a little with the dolly and the beat, but never
		// shows its edges, whatever the turn and offset.
		const dolly = PERSPECTIVE_PX / (PERSPECTIVE_PX + (pose.dolly || 0) * 0.45);
		const wanted = coverScale(-pose.roll, plan.W, plan.H) * 1.14 * dolly * (1 + (pose.beat || 0) * 0.025);
		const scale = Math.max(wanted, coverScale(-pose.roll, plan.W, plan.H, x, y) * 1.01);
		return { rotate: -pose.roll, scale, x, y };
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
		layoutBlock,
		compose,
		lineIndexAt,
		progressAt,
		cameraPose,
		boardVisibility,
		lineLevels,
		wordEntrance,
		solidFrame,
		charFrame,
		backgroundFrame,
		coverScale,
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
	const requestDirection = ({ trackUri, model, title = "", artist = "" }) => {
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

	const createEngine = ({ stage, viewport, camera, wash, flash, subtitle, live, hudShot, hudTime }) => {
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
		const cache = { camera: {}, viewport: {}, flash: {}, wash: {}, background: {}, hud: {} };
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

		const mountBoard = (index) => {
			const board = plan.boards[index];
			const el = document.createElement("div");
			el.className = "ivlyrics-motion-board accent-" + board.accent;
			el.style.transform = "translate3d(" + round(board.origin.x) + "px," + round(board.origin.y) + "px," + round(board.origin.z) + "px) rotateZ(" + round(board.roll, 2) + "deg)";
			let echo = null;
			if (board.echo) {
				const echoEl = document.createElement("div");
				echoEl.className = "ivlyrics-motion-echo";
				echoEl.textContent = board.echo.text;
				echoEl.style.fontSize = round(board.echo.size) + "px";
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
				lineEl.style.transform = "translate3d(" + round(place.x) + "px," + round(place.y) + "px," + round(place.z) + "px) rotateZ(" + round(place.rot, 2) + "deg)";
				const letters = CHAR_FX.has(line.fx);
				const words = line.words.map((word, wordIndex) => {
					const spot = place.block.words[wordIndex];
					const wordEl = document.createElement("div");
					wordEl.className = "ivlyrics-motion-word" + (spot.role === "light" ? " is-light" : "") + (spot.emph ? " is-emph" : "");
					wordEl.style.fontSize = round(spot.size) + "px";
					wordEl.style.transform = "translate3d(" + round(spot.x) + "px," + round(spot.y) + "px,0) translate(-50%,-56%)";
					const ghost = document.createElement("span");
					ghost.className = "ivlyrics-motion-ghost";
					ghost.textContent = word.text;
					wordEl.appendChild(ghost);
					let box = null;
					if (spot.emph && board.accent === "box") {
						box = document.createElement("span");
						box.className = "ivlyrics-motion-box";
						wordEl.appendChild(box);
					}
					const solid = document.createElement("span");
					solid.className = "ivlyrics-motion-solid";
					let chars = null;
					if (letters) {
						chars = word.chars.map((char) => {
							const charEl = document.createElement("span");
							charEl.className = "ivlyrics-motion-char";
							charEl.textContent = char.ch;
							solid.appendChild(charEl);
							return { el: charEl, char, cache: {} };
						});
					} else {
						solid.textContent = word.text;
					}
					wordEl.appendChild(solid);
					lineEl.appendChild(wordEl);
					return { el: wordEl, solid, box, chars, word, emph: spot.emph, cache: {} };
				});
				el.appendChild(lineEl);
				return { el: lineEl, line, words, cache: {}, settled: null };
			});
			camera.appendChild(el);
			return { el, board, lines, motifs, echo };
		};

		const settleLine = (entry, sung) => {
			const state = sung ? "sung" : "waiting";
			if (entry.settled === state) return;
			entry.settled = state;
			for (const word of entry.words) {
				write(word.cache, "opacity", sung ? 1 : 0, (value) => word.solid.style.setProperty("--e", String(value)));
				write(word.cache, "transform", "none", (value) => { word.solid.style.transform = value; });
				write(word.cache, "active", false, (value) => word.el.classList.toggle("is-active", value));
				if (word.box) write(word.cache, "box", sung ? 1 : 0, (value) => word.box.style.setProperty("--b", String(value)));
				if (word.chars) {
					for (const char of word.chars) {
						write(char.cache, "opacity", 1, (value) => { char.el.style.opacity = String(value); });
						write(char.cache, "transform", "none", (value) => { char.el.style.transform = value; });
					}
				}
			}
		};

		const paintWords = (entry, time, distance) => {
			entry.settled = null;
			const line = entry.line;
			const sway = clamp01(1 - (distance - 0.3) / 0.9);
			const seed = hashString(line.text);
			for (const word of entry.words) {
				const progress = wordEntrance(line.fx, word.word, time);
				const frame = solidFrame(line.fx, progress);
				write(word.cache, "opacity", round(frame.opacity, 3), (value) => word.solid.style.setProperty("--e", String(value)));
				write(word.cache, "transform", frame.transform, (value) => { word.solid.style.transform = value; });
				write(word.cache, "active", time >= word.word.start && time < word.word.end, (value) => word.el.classList.toggle("is-active", value));
				if (word.box) {
					write(word.cache, "box", round(easeOutCubic(clamp01((time - word.word.start + 40) / 280)), 3), (value) => word.box.style.setProperty("--b", String(value)));
				}
				if (word.chars) {
					word.chars.forEach((char, index) => {
						const state = charFrame(line.fx, char.char, index, time, seed + index, sway);
						write(char.cache, "opacity", round(state.opacity, 3), (value) => { char.el.style.opacity = String(value); });
						write(char.cache, "transform", state.transform, (value) => { char.el.style.transform = value; });
					});
				}
			}
		};

		const paintBoard = (entry, time, pose, progress, beat) => {
			const board = entry.board;
			const visibility = boardVisibility(board, time);
			for (const lineEntry of entry.lines) {
				const line = lineEntry.line;
				const distance = progress - line.n;
				const depth = line.worldZ - pose.z;
				const near = depth > PERSPECTIVE_PX * 0.86 ? 0 : 1 - clamp01((depth - 240) / 420);
				const levels = lineLevels(distance);
				const ghost = round(levels.ghost * visibility * near, 3);
				const solid = round(levels.solid * visibility * near, 3);
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
				const entrance = clamp01(since / 520);
				const lineDistance = motif.line === null ? 0 : progress - (board.first + motif.line);
				const fade = motif.line === null ? 1 : lineDistance > 1.5 ? 0.6 : 1;
				const scale = Math.max(0, easeOutBack(entrance)) * (1 + beat * 0.12);
				const rotation = motif.rot - (1 - easeOutCubic(entrance)) * 70 + (motif.spin * since) / 1000;
				write(item.cache, "opacity", round(motif.opacity * visibility * fade, 3), (value) => { item.el.style.opacity = String(value); });
				write(item.cache, "transform",
					"translate3d(" + round(motif.x) + "px," + round(motif.y) + "px," + round(motif.z) + "px) translate(-50%,-50%) rotate(" + round(rotation, 1) + "deg) scale(" + round(scale, 3) + ")",
					(value) => { item.el.style.transform = value; });
				const draw = round(1 - easeOutCubic(clamp01(since / 760)), 3);
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
			if (!playing || beforeSong || betweenBoards || at - planSetAt < 1500 || at - pending.since > 15000) {
				const quiet = at - planSetAt < 1500 || beforeSong || !playing;
				plan = pending.plan;
				pending = null;
				planSetAt = at;
				unmountAll();
				if (!quiet) swapFlashAt = at;
			}
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
				"rotateZ(" + round(-pose.roll, 3) + "deg) translate3d(" + round(-pose.x) + "px," + round(-pose.y) + "px," + round(-pose.z) + "px)",
				(value) => { camera.style.transform = value; });

			// Motion blur while the camera whips between boards.
			let blur = 0;
			if (playing && lastPose && at - lastFrameAt > 0 && at - lastFrameAt < 90) {
				const elapsed = at - lastFrameAt;
				const travel = Math.hypot(pose.x - lastPose.x, pose.y - lastPose.y) + (Math.abs(pose.roll - lastPose.roll) * Math.PI / 180) * plan.W * 0.45;
				blur = clamp((travel / elapsed - 1.7) * 1.3, 0, 6);
			}
			lastPose = pose;
			lastFrameAt = at;
			const blurValue = blur >= 0.5 ? "blur(" + round(blur, 1) + "px)" : "";
			write(cache.viewport, "filter", blurValue, (value) => { viewport.style.filter = value; });

			const backdrop = findBackground(at);
			if (backdrop) {
				const frame = backgroundFrame(plan, pose);
				write(cache.background, "rotate", round(frame.rotate, 2) + "deg", (value) => { backdrop.style.rotate = value; });
				write(cache.background, "scale", String(round(frame.scale, 4)), (value) => { backdrop.style.scale = value; });
				write(cache.background, "translate", round(frame.x) + "px " + round(frame.y) + "px", (value) => { backdrop.style.translate = value; });
				write(cache.background, "filter", blur >= 1 ? "blur(" + round(blur * 0.5, 1) + "px)" : "", (value) => { backdrop.style.filter = value; });
			}

			const progress = progressAt(plan, time);
			const wanted = new Set();
			plan.boards.forEach((board, index) => {
				if (time >= board.appear - 60 && time <= board.fadeEnd + 60) wanted.add(index);
			});
			for (const index of [...mounted.keys()]) if (!wanted.has(index)) unmount(index);
			for (const index of wanted) {
				if (!mounted.has(index)) mounted.set(index, mountBoard(index));
				paintBoard(mounted.get(index), time, pose, progress, pose.beat || 0);
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
			write(cache.hud, "time", timecode(time), (value) => { if (hudTime) hudTime.textContent = value; });

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
			 * soft: a new edit of the same song (the AI direction arrived) waits
			 * for a cut between boards; anything else (size, fonts) applies now.
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
			const washRef = useRef(null);
			const flashRef = useRef(null);
			const subtitleRef = useRef(null);
			const liveRef = useRef(null);
			const hudShotRef = useRef(null);
			const hudTimeRef = useRef(null);
			const engineRef = useRef(null);
			const measureRef = useRef(null);
			const [size, setSize] = useState({ width: 0, height: 0 });
			const [fontEpoch, setFontEpoch] = useState(0);
			const [analysis, setAnalysis] = useState({ uri: "", status: "loading", data: null, planned: false });
			const [ai, setAi] = useState({ key: "", status: "idle", raw: null });
			const [showFailure, setShowFailure] = useState(false);
			const modelRef = useRef({ signature: "", lines: [] });
			const model = useMemo(() => {
				const lines = buildModel(lyrics);
				const signature = trackUri + "\u0002" + modelSignature(lines);
				if (signature !== modelRef.current.signature) modelRef.current = { signature, lines };
				return modelRef.current.lines;
			}, [lyrics, trackUri]);
			const signature = modelRef.current.signature;
			const aiKey = String(hashString(signature));

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
					wash: washRef.current,
					flash: flashRef.current,
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
				const sample = model.map((line) => line.text).join("");
				ensureFonts(root.document, sample).then(() => {
					if (cancelled) return;
					measureRef.current = createMeasurer(root.document);
					setFontEpoch((value) => value + 1);
				});
				return () => { cancelled = true; };
			}, [signature]);

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

			useEffect(() => {
				if (!model.length || !trackUri) return undefined;
				let cancelled = false;
				setAi({ key: aiKey, status: "loading", raw: null });
				setShowFailure(false);
				requestDirection({ trackUri, model, title, artist }).then((result) => {
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

			const planAnalysis = analysis.planned ? analysis.data : null;
			const direction = useMemo(() => {
				const director = root.ivLyricsMotionDirector;
				if (!director || !model.length) return null;
				const options = { seed: hashString(trackUri), energy: lineEnergies(model, planAnalysis) };
				return ai.key === aiKey && ai.raw ? director.normalizeDirection(ai.raw, model, options) : director.localDirection(model, options);
			}, [ai, aiKey, model, trackUri, planAnalysis]);
			const palette = useMemo(() => paletteFrom(accent, direction?.palette), [accent, direction]);

			const planReady = analysis.uri === trackUri && analysis.status !== "loading" && fontEpoch > 0;
			const plan = useMemo(() => {
				if (!planReady || !size.width || !size.height || !direction) return null;
				return compose(model, direction, {
					width: size.width,
					height: size.height,
					seed: hashString(trackUri),
					analysis: planAnalysis,
					measure: measureRef.current,
				});
			}, [planReady, direction, size.width, size.height, fontEpoch, planAnalysis]);

			useEffect(() => { engineRef.current?.setLyrics(lyrics); }, [lyrics]);
			const shownDirectionRef = useRef(null);
			useEffect(() => {
				const soft = !!plan && !!shownDirectionRef.current && shownDirectionRef.current !== direction;
				if (plan) shownDirectionRef.current = direction;
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
				"data-source": direction?.source || "local",
				style: {
					"--iv-motion-accent": palette[0],
					"--iv-motion-accent-2": palette[1],
					"--iv-motion-perspective": PERSPECTIVE_PX + "px",
					"--iv-motion-display": DISPLAY_FONT,
					"--iv-motion-light": LIGHT_FONT,
				},
			},
				e("div", { className: "ivlyrics-motion-scrim", "aria-hidden": "true" }),
				e("div", { ref: washRef, className: "ivlyrics-motion-wash", "aria-hidden": "true" }),
				e("div", { ref: viewportRef, className: "ivlyrics-motion-viewport", "aria-hidden": "true" },
					e("div", { ref: cameraRef, className: "ivlyrics-motion-camera" })),
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
		Stage: react ? createStage(react) : null,
	});
})(typeof window !== "undefined" ? window : globalThis);

