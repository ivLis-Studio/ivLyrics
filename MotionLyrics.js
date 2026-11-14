// Motion lyrics: a kinetic-typography fullscreen presentation (PC prototype).
//
// Only songs with real word or character timing play it. Each line becomes a
// scene: its words are laid out in 3D space and appear as they are sung, while
// a camera flies, rolls and dollies between the lines over the video
// background. The choreography is planned once per song from the timing (and
// the Spotify audio analysis when it is available) and read by playback
// position, so seeking, pausing and sync offsets need no extra handling. The
// same song always gets the same scenes, and repeated lines get the same scene.
(function IvLyricsMotionLyrics(root) {
	"use strict";

	if (root.ivLyricsMotionLyrics?.initialized) return;

	const PSEUDO_KARAOKE_SOURCES = new Set(["audio-analysis-pseudo", "spotify-audio-analysis", "line-timing-pseudo"]);
	// A word starts flying in this long before it is sung, over APPEAR_MS.
	const APPEAR_LEAD_MS = 90;
	const APPEAR_MS = 260;
	// The next line shows dimly from the moment the camera heads for it, its
	// words waiting where they will fly in from, so every camera move has a
	// destination to see. Unsung word colour (0.42) x 0.5 reads as a faint preview.
	const PREVIEW_OPACITY = 0.5;
	const PREVIEW_FADE_MS = 360;
	const CHAR_PREVIEW_OPACITY = 0.42;
	// The camera settles on a line this long before its first word.
	const ARRIVE_LEAD_MS = 80;
	const MIN_TRANSITION_MS = 380;
	const MAX_TRANSITION_MS = 980;
	// Instrumental gaps: a finished line lingers, then fades.
	const LONG_GAP_MS = 4000;
	const LINGER_MS = 1600;
	const INTRO_MS = 1400;
	const PERSPECTIVE_PX = 1100;
	const TEMPLATES = Object.freeze(["row", "stack", "scatter", "depth", "cascade"]);

	const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
	const clamp01 = (value) => clamp(value, 0, 1);
	const lerp = (from, to, amount) => from + (to - from) * amount;
	const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
	const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
	const easeInOutQuint = (t) => (t < 0.5 ? 16 * Math.pow(t, 5) : 1 - Math.pow(-2 * t + 2, 5) / 2);
	const easeOutBack = (t) => {
		const c1 = 1.70158;
		const c3 = c1 + 1;
		return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
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

	/** mulberry32: a small seeded generator, so a song always gets the same scenes. */
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
	const sign = (random) => (random() < 0.5 ? -1 : 1);
	const weightedPick = (random, weights) => {
		const entries = Object.entries(weights).filter(([, weight]) => weight > 0);
		const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
		let roll = random() * total;
		for (const [key, weight] of entries) {
			roll -= weight;
			if (roll <= 0) return key;
		}
		return entries[entries.length - 1][0];
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
			for (const part of splitRun(run)) {
				const previous = words[words.length - 1];
				if (previous && SYMBOL_RE.test(textOf(part))) {
					words[words.length - 1] = wordOf([...previous.chars, ...part]);
					continue;
				}
				words.push(wordOf(part));
			}
		}
		return words;
	};

	/** Lines that can play as scenes, in time order. */
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
	// Scene layouts (line-local coordinates, origin at the line's centre)
	// ---------------------------------------------------------------------

	const layoutRow = (line, context, scale) => {
		let size = context.F * scale;
		const maxWidth = context.W * 0.84;
		let rows = [];
		for (let attempt = 0; attempt < 9; attempt += 1) {
			const gap = size * 0.28;
			rows = [];
			let row = [];
			let width = 0;
			line.words.forEach((word, index) => {
				const wordWidth = context.measure(word.text, size);
				if (row.length && width + gap + wordWidth > maxWidth) {
					rows.push({ items: row, width });
					row = [];
					width = 0;
				}
				width += (row.length ? gap : 0) + wordWidth;
				row.push({ index, width: wordWidth });
			});
			if (row.length) rows.push({ items: row, width });
			if (rows.length <= 3 && Math.max(...rows.map((entry) => entry.width)) <= maxWidth) break;
			size *= 0.88;
		}
		const gap = size * 0.28;
		const lineHeight = size * 1.18;
		const places = new Array(line.words.length);
		rows.forEach((row, rowIndex) => {
			let x = -row.width / 2;
			const y = (rowIndex - (rows.length - 1) / 2) * lineHeight;
			for (const item of row.items) {
				places[item.index] = { x: x + item.width / 2, y, z: 0, size, rot: 0, dir: rowIndex % 2 ? 1 : -1 };
				x += item.width + gap;
			}
		});
		return places;
	};

	const layoutStack = (line, context, random) => {
		const durations = line.words.map((word) => word.end - word.start);
		const longest = Math.max(1, ...durations);
		const last = line.words.length - 1;
		const align = ["center", "left", "right"][Math.floor(random() * 3)];
		const items = line.words.map((word, index) => {
			// Long-held words, the last word and short words are set larger.
			const importance = clamp01(0.6 * (durations[index] / longest) + (index === last ? 0.25 : 0) + (word.chars.length <= 3 ? 0.15 : 0));
			let size = context.F * (0.62 + 0.8 * importance);
			let width = context.measure(word.text, size);
			const limit = context.W * 0.82;
			if (width > limit) {
				size *= limit / width;
				width = limit;
			}
			return { size, width };
		});
		let total = items.reduce((sum, item) => sum + item.size * 1.02, 0);
		const limit = context.H * 0.78;
		if (total > limit) {
			const factor = limit / total;
			for (const item of items) {
				item.size *= factor;
				item.width *= factor;
			}
			total = limit;
		}
		const widest = Math.max(...items.map((item) => item.width));
		let top = -total / 2;
		return items.map((item, index) => {
			const height = item.size * 1.02;
			const y = top + height / 2;
			top += height;
			const x = align === "left" ? -widest / 2 + item.width / 2 : align === "right" ? widest / 2 - item.width / 2 : 0;
			const dir = align === "left" ? -1 : align === "right" ? 1 : (index % 2 ? 1 : -1);
			return { x, y, z: 0, size: item.size, rot: 0, dir };
		});
	};

	const layoutScatter = (line, context, random) => {
		const placed = [];
		const places = line.words.map((word, index) => {
			const size = context.F * between(random, 0.8, 1.12);
			const width = Math.min(context.measure(word.text, size), context.W * 0.8);
			const height = size * 1.05;
			let chosen = null;
			let fallback = null;
			for (let attempt = 0; attempt < 16 && !chosen; attempt += 1) {
				const previous = placed[placed.length - 1] || { x: 0, y: 0 };
				// Each word lands to the right of the last one or on a lower row, so
				// the line still reads in order however it is scattered.
				const angle = random() < 0.55 ? between(random, -0.5, 0.5) : between(random, 1.1, 2.4);
				const distance = index === 0 ? 0 : between(random, 0.55, 1) * Math.max(context.W * 0.3, width * 0.85);
				const candidate = { x: previous.x + Math.cos(angle) * distance, y: previous.y + Math.sin(angle) * distance * 0.62, width, height };
				// The whole composition stays within most of the screen.
				const left = Math.min(candidate.x - width / 2, ...placed.map((item) => item.x - item.width / 2));
				const right = Math.max(candidate.x + width / 2, ...placed.map((item) => item.x + item.width / 2));
				const top = Math.min(candidate.y - height / 2, ...placed.map((item) => item.y - item.height / 2));
				const bottom = Math.max(candidate.y + height / 2, ...placed.map((item) => item.y + item.height / 2));
				if (right - left > context.W * 0.8 || bottom - top > context.H * 0.66) continue;
				fallback = fallback || candidate;
				const overlaps = placed.some((other) => Math.abs(other.x - candidate.x) < (other.width + candidate.width) / 2 + size * 0.3
					&& Math.abs(other.y - candidate.y) < (other.height + candidate.height) / 2 + size * 0.1);
				if (!overlaps) chosen = candidate;
			}
			chosen = chosen || fallback || { x: 0, y: (index - (line.words.length - 1) / 2) * height, width, height };
			placed.push(chosen);
			return { x: chosen.x, y: chosen.y, z: between(random, -150, 40), size, rot: between(random, -9, 9), dir: sign(random) };
		});
		// Centre the composition on the line's origin.
		const left = Math.min(...placed.map((item) => item.x - item.width / 2));
		const right = Math.max(...placed.map((item) => item.x + item.width / 2));
		const top = Math.min(...placed.map((item) => item.y - item.height / 2));
		const bottom = Math.max(...placed.map((item) => item.y + item.height / 2));
		const shiftX = (left + right) / 2;
		const shiftY = (top + bottom) / 2;
		return places.map((place) => ({ ...place, x: place.x - shiftX, y: place.y - shiftY }));
	};

	const layoutDepth = (line, context, random) => line.words.map((word, index) => {
		const size = context.F * between(random, 0.85, 1.05);
		return {
			x: index === 0 ? 0 : between(random, -0.2, 0.2) * context.W,
			y: index === 0 ? 0 : between(random, -0.16, 0.16) * context.H,
			z: -index * 950,
			size,
			rot: between(random, -6, 6),
			dir: sign(random),
		};
	});

	/** How strongly the camera follows the sung word, per template. */
	const FOLLOW = Object.freeze({
		row: { xy: 0, z: 0 },
		stack: { xy: 0, z: 0 },
		cascade: { xy: 0, z: 0 },
		scatter: { xy: 0.35, z: 0.5 },
		depth: { xy: 0.65, z: 1 },
	});

	const chooseTemplate = (line, energy, previous, random) => {
		const count = line.words.length;
		const seconds = Math.max(0.3, (line.end - line.start) / 1000);
		const wordsPerSecond = count / seconds;
		const longest = Math.max(...line.words.map((word) => word.chars.length));
		// Dense lines stay readable as a plain row.
		if (count >= 9 || wordsPerSecond > 3.6 || line.chars > 28) return "row";
		const weights = {
			row: 1,
			stack: count <= 6 && longest <= 10 ? 2 : 0,
			scatter: count >= 2 && count <= 5 && seconds >= 1.6 ? 1.3 + energy : 0,
			depth: count >= 2 && count <= 5 && seconds >= 1.8 && wordsPerSecond < 2.4 ? 1 + 0.6 * energy : 0,
			cascade: line.charTimed && line.chars <= 16 && wordsPerSecond < 3 ? 1.5 : 0,
		};
		if (previous && weights[previous]) weights[previous] *= 0.35;
		return weightedPick(random, weights);
	};

	const layoutFor = (template, line, context, random) => {
		switch (template) {
			case "stack": return layoutStack(line, context, random);
			case "scatter": return layoutScatter(line, context, random);
			case "depth": return layoutDepth(line, context, random);
			case "cascade": return layoutRow(line, context, 0.92);
			default: return layoutRow(line, context, 0.82);
		}
	};

	// ---------------------------------------------------------------------
	// Camera moves between lines (offsets in the previous camera's frame)
	// ---------------------------------------------------------------------

	const TRANSITIONS = Object.freeze(["pan", "rise", "roll", "flip", "push", "pull"]);

	const chooseTransition = ({ energy, sectionChange, shortGap, previous, roll, random }) => {
		let weights;
		if (sectionChange) weights = { roll: 1, flip: 0.9, push: 1, pull: 0.6, pan: 0.3 };
		else if (energy >= 0.6) weights = { pan: 1, rise: 0.8, roll: 0.8, push: 1, pull: 0.6, flip: 0.25 };
		else if (energy >= 0.35) weights = { pan: 1.2, rise: 1, roll: 0.45, push: 0.6, pull: 0.5, flip: 0.1 };
		else weights = { pan: 1.2, rise: 1.1, roll: 0.25, push: 0.35, pull: 0.6 };
		if (shortGap) {
			for (const heavy of ["roll", "flip", "push", "pull"]) if (weights[heavy]) weights[heavy] *= 0.4;
		}
		// The screen never ends up more than half a turn from upright.
		if (Math.abs(roll) >= 180 && weights.flip) weights.flip = 0;
		if (previous && weights[previous]) weights[previous] *= 0.3;
		return weightedPick(random, weights);
	};

	const transitionOffset = (type, context, roll, random) => {
		const { W, H } = context;
		const towardUpright = roll > 0 ? -1 : roll < 0 ? 1 : sign(random);
		switch (type) {
			case "rise": return { x: between(random, -0.2, 0.2) * W, y: sign(random) * H * 1.2, z: 0, roll: 0, arc: 260 };
			case "roll": return { x: sign(random) * W * 0.95, y: sign(random) * H * 0.55, z: 0, roll: (Math.abs(roll) >= 90 ? towardUpright : sign(random)) * 90, arc: 520 };
			case "flip": return { x: 0, y: H * 1.1, z: 0, roll: towardUpright * 180, arc: 720 };
			case "push": return { x: between(random, -0.2, 0.2) * W, y: between(random, -0.15, 0.15) * H, z: -2200, roll: between(random, -12, 12), arc: 0 };
			case "pull": return { x: between(random, -0.25, 0.25) * W, y: between(random, -0.2, 0.2) * H, z: 1700, roll: between(random, -10, 10), arc: 0 };
			default: return { x: sign(random) * W * 1.25, y: between(random, -0.25, 0.25) * H, z: between(random, -200, 200), roll: 0, arc: 300 };
		}
	};

	const rotate2d = (x, y, degrees) => {
		const radians = (degrees * Math.PI) / 180;
		const cos = Math.cos(radians);
		const sin = Math.sin(radians);
		return { x: x * cos - y * sin, y: x * sin + y * cos };
	};

	// ---------------------------------------------------------------------
	// Plan
	// ---------------------------------------------------------------------

	/**
	 * Scenes for the song: template, layout, camera slot and timing of every
	 * line. Pure: the same lines, size and seed give the same plan.
	 * @param {Array} lines buildModel() output.
	 * @param {{width:number,height:number,seed:number,analysis?:object,measure:(text:string,size:number)=>number}} options
	 */
	const direct = (lines, options = {}) => {
		const W = Math.max(320, Number(options.width) || 0);
		const H = Math.max(240, Number(options.height) || 0);
		const F = clamp(Math.min(W * 0.075, H * 0.13), 40, 150);
		const seed = (Number(options.seed) >>> 0) || 1;
		const measure = typeof options.measure === "function"
			? options.measure
			: (text, size) => graphemesOf(text).reduce((width, piece) => width + (CJK_RE.test(piece) ? 1 : 0.58), 0) * size;
		const context = { W, H, F, measure };
		const energy = lineEnergies(lines, options.analysis);
		const firstTemplateByText = new Map();
		const scenes = [];
		let slot = { x: 0, y: 0, z: 0, roll: 0 };
		lines.forEach((line, index) => {
			const random = createRandom(seed ^ Math.imul(index + 1, 0x9E3779B1) ^ hashString(line.text));
			const repeated = firstTemplateByText.get(line.text);
			const template = repeated || chooseTemplate(line, energy[index], scenes[index - 1]?.template || null, random);
			if (!repeated) firstTemplateByText.set(line.text, template);
			// A repeated line gets the same scene: its layout depends only on the text.
			const layout = layoutFor(template, line, context, createRandom(seed ^ hashString(template + "\u0001" + line.text)));
			let transition = null;
			if (index > 0) {
				const previous = scenes[index - 1];
				const gap = line.start - previous.end;
				const sectionChange = gap >= 3000 || Math.abs(energy[index] - energy[index - 1]) >= 0.5;
				const type = chooseTransition({
					energy: energy[index],
					sectionChange,
					shortGap: gap < 250,
					previous: previous.transition?.type || null,
					roll: slot.roll,
					random,
				});
				const offset = transitionOffset(type, context, slot.roll, random);
				// Moves start from where the camera left the previous line.
				const exit = previous.exitFocus;
				const local = rotate2d(exit.x + offset.x, exit.y + offset.y, slot.roll);
				slot = { x: slot.x + local.x, y: slot.y + local.y, z: slot.z + exit.z + offset.z, roll: slot.roll + offset.roll };
				transition = { type, arc: offset.arc, big: sectionChange };
			}
			const follow = FOLLOW[template] || FOLLOW.row;
			const lastPlace = layout[layout.length - 1];
			scenes.push({
				...line,
				template,
				layout,
				slot: { ...slot },
				transition,
				energy: energy[index],
				drift: sign(random),
				exitFocus: { x: lastPlace.x * follow.xy, y: lastPlace.y * follow.xy, z: lastPlace.z * follow.z },
			});
		});
		timeScenes(scenes);
		return { width: W, height: H, F, seed, scenes, pulses: pulsesInMs(options.analysis) };
	};

	/** When the camera arrives on each line and leaves for the next one. */
	const timeScenes = (scenes) => {
		scenes.forEach((scene) => {
			scene.arrive = scene.start - ARRIVE_LEAD_MS;
			scene.leave = Infinity;
			scene.fadeAt = null;
			scene.previewAt = scene.arrive - INTRO_MS;
		});
		for (let index = 1; index < scenes.length; index += 1) {
			const previous = scenes[index - 1];
			const scene = scenes[index];
			const gap = scene.start - previous.end;
			const big = scene.transition?.big || scene.transition?.type === "roll" || scene.transition?.type === "flip";
			const duration = clamp(gap + 300, MIN_TRANSITION_MS, MAX_TRANSITION_MS) * (big ? 1.15 : 1);
			const lastWordStart = previous.words[previous.words.length - 1].start;
			let leave = Math.max(scene.arrive - duration, lastWordStart + 120);
			if (scene.arrive - leave < 260) leave = scene.arrive - 260;
			previous.leave = Math.max(leave, previous.arrive + 60);
			scene.previewAt = previous.leave;
			if (gap > LONG_GAP_MS) previous.fadeAt = previous.end + LINGER_MS;
		}
	};

	// ---------------------------------------------------------------------
	// Reading the plan at a playback position
	// ---------------------------------------------------------------------

	const sceneIndexAt = (plan, time) => {
		const scenes = plan?.scenes || [];
		let low = 0;
		let high = scenes.length;
		while (low < high) {
			const middle = (low + high) >>> 1;
			if (scenes[middle].arrive <= time) low = middle + 1;
			else high = middle;
		}
		return Math.max(0, low - 1);
	};

	/** Line-local point the camera looks at: the sung word for templates that follow it. */
	const focusAt = (scene, time) => {
		const follow = FOLLOW[scene.template] || FOLLOW.row;
		if (!follow.xy && !follow.z) return { x: 0, y: 0, z: 0 };
		let index = 0;
		for (let wordIndex = 1; wordIndex < scene.words.length; wordIndex += 1) {
			if (scene.words[wordIndex].start - 220 <= time) index = wordIndex;
		}
		const target = scene.layout[index];
		const from = scene.layout[Math.max(0, index - 1)];
		const u = index === 0 ? 1 : easeInOutCubic(clamp01((time - (scene.words[index].start - 220)) / 280));
		return {
			x: lerp(from.x, target.x, u) * follow.xy,
			y: lerp(from.y, target.y, u) * follow.xy,
			z: lerp(from.z, target.z, u) * follow.z,
		};
	};

	const holdPose = (scene, time) => {
		const focus = focusAt(scene, time);
		const end = Number.isFinite(scene.leave) ? scene.leave : scene.end + 1500;
		const life = easeInOutCubic(clamp01((time - scene.arrive) / Math.max(1, end - scene.arrive)));
		// A slow push-in and a little roll while the line is sung.
		const local = rotate2d(focus.x, focus.y, scene.slot.roll);
		return {
			x: scene.slot.x + local.x,
			y: scene.slot.y + local.y,
			z: scene.slot.z + focus.z - 90 * life,
			roll: scene.slot.roll + scene.drift * 1.6 * (life - 0.5),
		};
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

	/** Camera position and roll at a playback position. */
	const cameraPose = (plan, time, pulses = plan?.pulses) => {
		const scenes = plan?.scenes || [];
		if (!scenes.length) return { x: 0, y: 0, z: 0, roll: 0 };
		let pose;
		const first = scenes[0];
		if (time < first.arrive) {
			pose = holdPose(first, first.arrive);
			const u = easeOutCubic(clamp01((time - (first.arrive - INTRO_MS)) / INTRO_MS));
			pose.z += 620 * (1 - u);
			pose.roll += first.drift * 6 * (1 - u);
		} else {
			const index = sceneIndexAt(plan, time);
			const scene = scenes[index];
			const next = scenes[index + 1];
			if (next && time > scene.leave) {
				const u = clamp01((time - scene.leave) / Math.max(1, next.arrive - scene.leave));
				const from = holdPose(scene, scene.leave);
				const to = holdPose(next, next.arrive);
				const eased = easeInOutCubic(u);
				pose = {
					x: lerp(from.x, to.x, eased),
					y: lerp(from.y, to.y, eased),
					z: lerp(from.z, to.z, eased) + (next.transition?.arc || 0) * Math.sin(Math.PI * u),
					roll: lerp(from.roll, to.roll, easeInOutQuint(u)),
				};
			} else {
				pose = holdPose(scene, time);
			}
		}
		const beat = beatAt(pulses, time);
		if (beat) {
			const scene = scenes[sceneIndexAt(plan, time)];
			const amount = beat.strength * (0.35 + 0.65 * (scene.energy ?? 0.5));
			pose.z -= 60 * amount * Math.exp(-beat.since / 130);
			pose.roll += (beat.index % 2 ? 1 : -1) * 0.6 * amount * Math.exp(-beat.since / 160);
		}
		return pose;
	};

	/** How visible a line is: it fades once the camera has moved on. */
	const sceneOpacity = (plan, index, time) => {
		const scene = plan.scenes[index];
		const next = plan.scenes[index + 1];
		let opacity = 1;
		if (scene.fadeAt !== null && time > scene.fadeAt) opacity = Math.min(opacity, 1 - clamp01((time - scene.fadeAt) / 700));
		if (next && time > scene.leave) {
			const u = clamp01((time - scene.leave) / Math.max(1, next.arrive - scene.leave));
			opacity = Math.min(opacity, 1 - 0.6 * u);
			if (time > next.arrive) opacity = Math.min(opacity, 0.4 * (1 - clamp01((time - next.arrive) / 500)));
		}
		return opacity;
	};

	/** Share of a word sung so far, by its characters' timing. */
	const fillOf = (word, time) => {
		const count = word.chars.length;
		for (let index = 0; index < count; index += 1) {
			const char = word.chars[index];
			if (time < char.end || index === count - 1) {
				return clamp01((index + clamp01((time - char.start) / Math.max(1, char.end - char.start))) / count);
			}
		}
		return 1;
	};

	/** How strongly a line's upcoming words show before they are sung. */
	const previewOf = (scene, time) => {
		const previewAt = Number.isFinite(scene.previewAt) ? scene.previewAt : scene.arrive;
		if (time < previewAt) return 0;
		return PREVIEW_OPACITY * easeOutCubic(clamp01((time - previewAt) / PREVIEW_FADE_MS));
	};

	/**
	 * A word's entry motion and sung state at a playback position (null while
	 * hidden). Before it flies in it waits, faint, at the pose it flies in from.
	 */
	const wordFrame = (scene, wordIndex, time) => {
		const word = scene.words[wordIndex];
		const place = scene.layout[wordIndex];
		const appearAt = word.start - APPEAR_LEAD_MS;
		const preview = previewOf(scene, time);
		if (time < appearAt && preview <= 0) return null;
		const progress = clamp01((time - appearAt) / APPEAR_MS);
		const eased = easeOutCubic(progress);
		const back = easeOutBack(progress);
		let { x, y, z, rot } = place;
		let scale = 1;
		const rest = 1 - eased;
		switch (scene.template) {
			case "row":
			case "cascade":
				y += rest * place.size * 0.5;
				z -= rest * 240;
				scale = 0.84 + 0.16 * back;
				break;
			case "stack":
				x += rest * place.dir * place.size * 1.4;
				rot += rest * place.dir * -10;
				scale = 0.9 + 0.1 * back;
				break;
			default:
				z -= rest * 650;
				rot += rest * place.dir * 14;
				scale = 0.7 + 0.3 * back;
		}
		const active = time >= word.start && time < word.end;
		const sung = time >= word.end;
		if (active) {
			const since = time - word.start;
			scale *= 1 + 0.07 * (since < 90 ? since / 90 : Math.max(0, 1 - (since - 90) / 420));
		}
		return {
			x, y, z, rot, scale,
			opacity: Math.max(preview, eased),
			preview,
			active,
			sung,
			fill: active ? fillOf(word, time) : (sung ? 1 : 0),
		};
	};

	/**
	 * A character's drop-in for the cascade template (null while hidden).
	 * `waiting` is its opacity before it drops in (0 hides it).
	 */
	const charFrame = (char, index, time, waiting = 0) => {
		const appearAt = char.start - 60;
		if (time < appearAt && !(waiting > 0)) return null;
		const progress = clamp01((time - appearAt) / 240);
		const base = clamp01(Number(waiting) || 0);
		return {
			y: (1 - easeOutBack(progress)) * -0.75,
			rot: (1 - progress) * (index % 2 ? 22 : -18),
			opacity: base + (1 - base) * easeOutCubic(progress),
			active: time >= char.start && time < char.end,
		};
	};

	const pure = Object.freeze({
		PERSPECTIVE_PX,
		TEMPLATES,
		TRANSITIONS,
		hashString,
		leadSyllablesOf,
		hasRealTiming,
		buildWords,
		buildModel,
		modelSignature,
		direct,
		sceneIndexAt,
		cameraPose,
		sceneOpacity,
		wordFrame,
		charFrame,
		fillOf,
	});

	// ---------------------------------------------------------------------
	// Renderer: one animation loop writes transforms; React renders the shell.
	// ---------------------------------------------------------------------

	const round = (value, digits = 1) => {
		const factor = 10 ** digits;
		return Math.round(value * factor) / factor;
	};

	const translationOf = (line) => {
		for (const value of [line?.text2, line?.translationText, line?.translation, line?.transText]) {
			if (typeof value === "string" && value.trim()) return value.trim();
		}
		return "";
	};

	const createMeasurer = (fontFamily) => {
		const canvas = root.document?.createElement?.("canvas");
		const context = canvas?.getContext?.("2d");
		const cache = new Map();
		return (text, size) => {
			let width = cache.get(text);
			if (width === undefined) {
				if (context) {
					context.font = "800 100px " + fontFamily;
					// letter-spacing: -0.02em
					width = context.measureText(text).width - 2 * graphemesOf(text).length;
				} else {
					width = graphemesOf(text).reduce((sum, piece) => sum + (CJK_RE.test(piece) ? 100 : 58), 0);
				}
				cache.set(text, width);
			}
			return (width * size) / 100;
		};
	};

	const createEngine = ({ camera, subtitle, live }) => {
		let plan = null;
		let lyrics = [];
		let pulses = null;
		let trackUri = "";
		let playing = false;
		let frameId = 0;
		let timerId = 0;
		let destroyed = false;
		let currentScene = -1;
		const mounted = new Map();
		const cameraCache = {};

		const readTime = (frameTime) => {
			const position = root.ivLyricsLyricRendererPrimitives?.getFrameAlignedLyricsPlaybackPosition?.(frameTime);
			if (Number.isFinite(position)) return position;
			const fallback = Number(root.Spicetify?.Player?.getProgress?.());
			return Number.isFinite(fallback) ? fallback : 0;
		};
		const playerUri = () => root.Utils?.getPlayerPlaybackSnapshot?.()?.uri
			|| root.Spicetify?.Player?.data?.item?.uri || "";

		const write = (cache, key, value, apply) => {
			if (cache[key] === value) return;
			cache[key] = value;
			apply(value);
		};

		const unmountAll = () => {
			for (const entry of mounted.values()) entry.el.remove();
			mounted.clear();
			currentScene = -1;
		};

		const mountScene = (index) => {
			const scene = plan.scenes[index];
			const document = root.document;
			const lineEl = document.createElement("div");
			lineEl.className = "ivlyrics-motion-line is-" + scene.template;
			const slot = scene.slot;
			lineEl.style.transform = "translate3d(" + round(slot.x) + "px," + round(slot.y) + "px," + round(slot.z) + "px) rotateZ(" + round(slot.roll, 2) + "deg)";
			const words = scene.words.map((word, wordIndex) => {
				const place = scene.layout[wordIndex];
				const wordEl = document.createElement("div");
				wordEl.className = "ivlyrics-motion-word";
				wordEl.style.fontSize = round(place.size) + "px";
				const base = document.createElement("span");
				base.className = "ivlyrics-motion-word-base";
				let fill = null;
				let chars = null;
				if (scene.template === "cascade") {
					chars = word.chars.map((char) => {
						const charEl = document.createElement("span");
						charEl.className = "ivlyrics-motion-char";
						charEl.textContent = char.ch;
						base.appendChild(charEl);
						return { el: charEl, char, cache: {} };
					});
				} else {
					base.textContent = word.text;
					fill = document.createElement("span");
					fill.className = "ivlyrics-motion-word-fill";
					fill.textContent = word.text;
				}
				wordEl.appendChild(base);
				if (fill) wordEl.appendChild(fill);
				lineEl.appendChild(wordEl);
				return { el: wordEl, chars, cache: {} };
			});
			camera.appendChild(lineEl);
			return { el: lineEl, words };
		};

		const paintScene = (index, entry, time, pose) => {
			const scene = plan.scenes[index];
			const lineOpacity = sceneOpacity(plan, index, time);
			scene.words.forEach((word, wordIndex) => {
				const target = entry.words[wordIndex];
				const frame = lineOpacity > 0.005 ? wordFrame(scene, wordIndex, time) : null;
				// Words that come at or behind the viewer are faded and hidden.
				const depth = frame ? scene.slot.z + frame.z - pose.z : 0;
				const near = 1 - clamp01((depth - 220) / 380);
				const opacity = frame ? round(frame.opacity * lineOpacity * near, 3) : 0;
				write(target.cache, "visibility", opacity > 0 && depth < PERSPECTIVE_PX * 0.85 ? "visible" : "hidden", (value) => {
					target.el.style.visibility = value;
				});
				if (!frame || opacity <= 0) return;
				write(target.cache, "opacity", opacity, (value) => { target.el.style.opacity = String(value); });
				write(target.cache, "transform",
					"translate3d(" + round(frame.x) + "px," + round(frame.y) + "px," + round(frame.z) + "px) rotateZ(" + round(frame.rot, 2)
						+ "deg) scale(" + round(frame.scale, 3) + ") translate(-50%,-55%)",
					(value) => { target.el.style.transform = value; });
				const state = frame.sung ? "is-sung" : frame.active ? "is-active" : "";
				write(target.cache, "state", state, (value) => {
					target.el.classList.toggle("is-sung", value === "is-sung");
					target.el.classList.toggle("is-active", value === "is-active");
				});
				if (target.chars) {
					// Letters still to come stay as faint as the other words' previews
					// (cascade letters are white, other unsung words 0.42 white).
					const waiting = frame.preview > 0 ? clamp01((CHAR_PREVIEW_OPACITY * frame.preview) / Math.max(0.001, frame.opacity)) : 0;
					target.chars.forEach((charEntry, charIndex) => {
						const charState = charFrame(charEntry.char, charIndex, time, waiting);
						const charOpacity = charState ? round(charState.opacity, 3) : 0;
						write(charEntry.cache, "opacity", charOpacity, (value) => { charEntry.el.style.opacity = String(value); });
						if (!charState) return;
						write(charEntry.cache, "transform", "translateY(" + round(charState.y, 3) + "em) rotateZ(" + round(charState.rot, 1) + "deg)",
							(value) => { charEntry.el.style.transform = value; });
						write(charEntry.cache, "active", charState.active, (value) => { charEntry.el.classList.toggle("is-active", value); });
					});
				} else if (frame.active) {
					write(target.cache, "fill", round(frame.fill * 100, 1), (value) => {
						target.el.style.setProperty("--iv-motion-fill", value + "%");
					});
				}
			});
		};

		const updateSubtitle = () => {
			const scene = plan?.scenes?.[currentScene];
			const source = scene ? lyrics[scene.index] : null;
			const text = translationOf(source);
			if (subtitle.textContent !== text) subtitle.textContent = text;
			subtitle.classList.toggle("has-text", !!text);
			if (live && scene && live.textContent !== scene.text) live.textContent = scene.text;
		};

		const render = (time) => {
			const uri = playerUri();
			if (!plan || (trackUri && uri && uri !== trackUri)) {
				if (mounted.size) unmountAll();
				return;
			}
			const pose = cameraPose(plan, time, pulses);
			write(cameraCache, "transform",
				"rotateZ(" + round(-pose.roll, 3) + "deg) translate3d(" + round(-pose.x) + "px," + round(-pose.y) + "px," + round(-pose.z) + "px)",
				(value) => { camera.style.transform = value; });
			const index = sceneIndexAt(plan, time);
			const wanted = new Set([index - 1, index, index + 1].filter((value) => value >= 0 && value < plan.scenes.length));
			for (const [sceneIndex, entry] of mounted) {
				if (!wanted.has(sceneIndex)) {
					entry.el.remove();
					mounted.delete(sceneIndex);
				}
			}
			for (const sceneIndex of wanted) {
				if (!mounted.has(sceneIndex)) mounted.set(sceneIndex, mountScene(sceneIndex));
				paintScene(sceneIndex, mounted.get(sceneIndex), time, pose);
			}
			if (index !== currentScene) {
				currentScene = index;
				updateSubtitle();
			}
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
			render(readTime(NaN));
			schedule();
		};

		return {
			setPlan(nextPlan, nextTrackUri) {
				if (plan === nextPlan && trackUri === nextTrackUri) return;
				plan = nextPlan;
				trackUri = nextTrackUri || "";
				pulses = nextPlan?.pulses || pulses;
				unmountAll();
				restart();
			},
			setPulses(nextPulses) {
				pulses = nextPulses || plan?.pulses || null;
			},
			setLyrics(nextLyrics) {
				lyrics = Array.isArray(nextLyrics) ? nextLyrics : [];
				updateSubtitle();
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
			},
		};
	};

	const createStage = (react) => {
		const { useEffect, useLayoutEffect, useMemo, useRef, useState } = react;
		const ANALYSIS_WAIT_MS = 700;

		return react.memo(({ lyrics = [], trackUri = "", accent = "", isPlaying = false }) => {
			const rootRef = useRef(null);
			const cameraRef = useRef(null);
			const subtitleRef = useRef(null);
			const liveRef = useRef(null);
			const engineRef = useRef(null);
			const measureRef = useRef(null);
			const [size, setSize] = useState({ width: 0, height: 0 });
			// The plan waits briefly for the audio analysis so the choreography
			// does not change once it arrives mid-song.
			const [analysis, setAnalysis] = useState({ uri: "", status: "loading", data: null, planned: false });
			const modelRef = useRef({ signature: "", lines: [] });
			const model = useMemo(() => {
				const lines = buildModel(lyrics);
				const signature = trackUri + "\u0002" + modelSignature(lines);
				if (signature !== modelRef.current.signature) modelRef.current = { signature, lines };
				return modelRef.current.lines;
			}, [lyrics, trackUri]);

			useLayoutEffect(() => {
				const element = rootRef.current;
				if (!element) return undefined;
				const probe = root.document.createElement("span");
				probe.className = "ivlyrics-motion-word";
				probe.style.visibility = "hidden";
				element.appendChild(probe);
				measureRef.current = createMeasurer(root.getComputedStyle(probe).fontFamily || "sans-serif");
				probe.remove();
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
				engineRef.current = createEngine({ camera: cameraRef.current, subtitle: subtitleRef.current, live: liveRef.current });
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
					if (!cancelled) setAnalysis((current) => (current.uri === trackUri && current.status === "loading"
						? { ...current, status: "late" } : current));
				}, ANALYSIS_WAIT_MS);
				Promise.resolve(load(trackUri)).then((data) => {
					if (cancelled) return;
					setAnalysis((current) => (current.uri !== trackUri ? current : {
						uri: trackUri,
						status: "ready",
						data: data || null,
						planned: current.status === "loading",
					}));
				}, () => {
					if (!cancelled) setAnalysis((current) => (current.uri !== trackUri ? current : { ...current, status: "none" }));
				});
				return () => {
					cancelled = true;
					root.clearTimeout(timer);
				};
			}, [trackUri]);

			const planReady = analysis.uri === trackUri && analysis.status !== "loading";
			const planAnalysis = analysis.planned ? analysis.data : null;
			const plan = useMemo(() => {
				if (!planReady || !size.width || !size.height || !model.length) return null;
				return direct(model, {
					width: size.width,
					height: size.height,
					seed: hashString(trackUri),
					analysis: planAnalysis,
					measure: measureRef.current,
				});
			}, [planReady, planAnalysis, model, size.width, size.height, trackUri]);

			useEffect(() => { engineRef.current?.setPlan(plan, trackUri); }, [plan, trackUri]);
			useEffect(() => { engineRef.current?.setPulses(pulsesInMs(analysis.data)); }, [analysis.data]);
			useEffect(() => { engineRef.current?.setLyrics(lyrics); }, [lyrics]);
			useEffect(() => { engineRef.current?.setPlaying(isPlaying); }, [isPlaying]);

			return react.createElement("div", {
				ref: rootRef,
				className: "ivlyrics-motion-stage",
				style: {
					"--iv-motion-accent": accent || "#ffffff",
					"--iv-motion-perspective": PERSPECTIVE_PX + "px",
				},
			},
				react.createElement("div", { className: "ivlyrics-motion-scrim", "aria-hidden": "true" }),
				react.createElement("div", { ref: cameraRef, className: "ivlyrics-motion-camera", "aria-hidden": "true" }),
				react.createElement("div", { ref: subtitleRef, className: "ivlyrics-motion-subtitle", "aria-hidden": "true" }),
				react.createElement("div", { ref: liveRef, className: "ivlyrics-motion-live", "aria-live": "polite" })
			);
		});
	};

	const react = root.Spicetify?.React;
	root.ivLyricsMotionLyrics = Object.freeze({
		initialized: true,
		...pure,
		Stage: react ? createStage(react) : null,
	});
})(typeof window !== "undefined" ? window : globalThis);
