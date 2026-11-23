// Motion lyrics director: decides how a song is staged.
//
// A direction groups consecutive lyric lines into shots and picks, per shot,
// a composition (layout, one of thirty-seven), how the camera reaches it
// (enter, one of twenty-three), how sung words appear (fx, one of
// thirty-two), how emphasised words stand out (accent, one of nineteen),
// how a sung line leaves (exit) and keeps moving while it is held (hold),
// the type personality
// (impact nearly always; a serif shot now and then, never two in a row and
// at most about one in seven; round for playful shots), whether its
// emphasised words switch to a serif, a camera tilt, letterbox bars, line
// rules, the motifs that animate around it and an optional giant background
// word.
// The song's tempo (slow, mid, fast, rap: measured from how densely it is
// sung and the beat) paces everything and steers the choices. The AI writes
// one (see AIAddonManager.generateMotionDirection); every AI answer is
// checked here and anything missing or invalid falls back to the local
// director, so the renderer always gets a complete, valid direction.
// Whoever directs, the edit keeps its restraint and range (refineShots):
// words that smash in are a rare spice, and no choice takes over the song,
// with replacements drawn from the song's own tempo palette. Lines whose
// voices are sung into the next line are never cut apart.
(function IvLyricsMotionDirector(root) {
	"use strict";

	if (root.ivLyricsMotionDirector?.initialized) return;

	// 6: lines come and go (exits, holds), the compositions, entrances, effects and accents from the motion-typography canon.
	// 7: lines are set in pieces (split): long lines in phrases, fast lines word by word; thirteen more exits (six whole-word, seven letter by letter).
	// 8: the AI reads the song's structure and energy and directs from a concept and a kit; scenes for instrumental breaks (interlude).
	const VERSION = 8;
	const MOODS = Object.freeze(["calm", "dreamy", "melancholic", "warm", "playful", "energetic", "intense", "dark"]);
	const TEMPOS = Object.freeze(["slow", "mid", "fast", "rap"]);
	// Flat compositions, then three that sit in depth: carousel and reel wrap the lines round a drum, crawl lays them on a tilted plane.
	const LAYOUTS = Object.freeze([
		"column", "zigzag", "spiral", "wall", "tunnel", "collage", "hero", "tower",
		"stairs", "strip", "split", "swell", "radial", "carousel", "reel", "crawl",
		// After kinetic-typography edits: one thought at a time, flat colour, type as an object.
		"slot", "poster", "wordwall", "arch", "spread", "pillar",
		// Editorial and graphic: a swell of lines, a star chart, a modular grid, the corners of the frame.
		"wave", "constellation", "grid", "corners",
		// From the motion-typography canon (kinetic lyric videos, title sequences, kinetic identities):
		// a sized lockup, one word at a time, a chain of words, a line that fills the width, a seal,
		// words round the frame, upright lines at the edges, marquee rows, words in depth that only line
		// up from the camera, a word larger than the screen, lines on a slanted rail grid.
		"lockup", "flash", "chain", "fill", "seal", "frame", "margin", "marquee", "anamorph", "bleed", "rails",
	]);
	const ENTERS = Object.freeze([
		"pan", "drop", "rise", "roll", "flip", "push", "pull", "cut", "whip", "spin", "orbit", "tumble", "fade", "through", "panel",
		"drift", "crane", "twist", "swoop", "corkscrew", "hop", "iris", "open",
	]);
	const FX = Object.freeze([
		"pop", "slide", "rise", "slam", "stretch", "flip", "type", "assemble", "drop", "wave", "blur", "wipe", "glitch", "spin", "zoom", "track", "bounce", "flicker",
		"lift", "swing", "smear", "door", "glide", "skew", "open", "cascade", "ripple", "swirl", "rain", "decode", "brush", "shutter",
	]);
	// Effects that move single letters; joined scripts get a word-level equivalent.
	const LETTER_FX = Object.freeze(["type", "assemble", "drop", "wave", "track", "bounce", "flicker", "cascade", "ripple", "swirl", "rain", "decode"]);
	// Entrances that hit: a word smashed in or flying out of the lens, with the camera shaking. Strong spice, used sparingly.
	const HARD_FX = Object.freeze(["slam", "zoom"]);
	// Snappy entrances that still jump at the eye; a song uses them now and then.
	const PUNCHY_FX = Object.freeze(["pop", "glitch", "flicker"]);
	// Flash cuts and colour wipes between shots.
	const HARD_ENTERS = Object.freeze(["cut", "panel"]);
	const ACCENTS = Object.freeze([
		"color", "outline", "underline", "mark", "spark", "glow", "gradient", "stamp", "circle", "extrude", "sticker",
		"script", "giant", "trail", "scribble", "bracket", "neon", "chrome", "spectrum",
	]);
	// Shot faces. Serif shots are rare (SERIF_SHARE); shot.serif sets only a shot's emphasised words in serif.
	const TYPES = Object.freeze(["impact", "serif", "round"]);
	// How a sung line leaves once the next one is under way (lines come and go; the screen is never a lyric sheet).
	// Whole-word exits, then ones that take the words apart letter by letter.
	const EXITS = Object.freeze([
		"fade", "rise", "fall", "scatter", "shrink", "sweep", "blur", "wipe", "flip", "stretch", "glitch", "drip",
		"sink", "shut", "zoom", "twist", "dash", "hinge",
		"crumble", "dissolve", "erase", "burst", "evaporate", "tumble", "scramble",
	]);
	// How a line keeps moving after its words have landed, so a held line never freezes.
	const HOLDS = Object.freeze(["still", "grow", "drift", "float", "lean", "breathe", "push", "wobble", "swivel"]);
	// No composition stays on screen longer than this: a long run of slow lines is cut into several.
	const MAX_SHOT_MS = 8000;
	// How a shot breaks its lines into pieces (MotionLyrics.js, piecesOf): whole lines (a long one still in
	// phrases), short phrases, or word by word.
	const SPLITS = Object.freeze(["line", "phrase", "word"]);
	// Scenes an instrumental break after a shot may play (MotionLyrics.js, interludesOf): the lyrics are never shown meanwhile.
	const INTERLUDES = Object.freeze(["pulse", "eq", "marquee", "orbit", "stripes", "grid", "count", "wave"]);
	// A pause this long is an interlude: the board is hidden meanwhile (MotionLyrics.js REST_GAP_MS).
	const REST_GAP_MS = 5000;
	/** How long lines from..to keep their composition on screen (interludes do not count). */
	const screenSpan = (lines, from, to) => {
		let span = lines[to].end - lines[from].start;
		for (let index = from + 1; index <= to; index += 1) {
			const gap = lines[index].start - lines[index - 1].end;
			if (gap >= REST_GAP_MS) span -= gap;
		}
		return span;
	};
	const SERIF_SHARE = 0.15;
	const SERIF_LINE_SHARE = 0.18;
	const MAX_LINES = Object.freeze({
		column: 6, zigzag: 5, spiral: 4, wall: 6, tunnel: 6, collage: 5, hero: 2, tower: 3,
		stairs: 5, strip: 4, split: 6, swell: 4, radial: 6, carousel: 5, reel: 6, crawl: 6,
		slot: 4, poster: 3, wordwall: 4, arch: 4, spread: 3, pillar: 3,
		wave: 5, constellation: 5, grid: 4, corners: 4,
		lockup: 4, flash: 4, chain: 4, fill: 4, seal: 4, frame: 3, margin: 4, marquee: 4, anamorph: 4, bleed: 3, rails: 4,
	});
	const PACE = Object.freeze({ slow: 1.4, mid: 1, fast: 0.82, rap: 0.72 });
	const MAX_PROMPT_LINES = 140;
	const MAX_SHOT_MOTIFS = 4;
	// Short phrases ("Beyond the road") read well as a background word too.
	const MAX_ECHO_LENGTH = 16;


	const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
	const hashString = (text) => {
		let hash = 2166136261;
		const source = String(text ?? "");
		for (let index = 0; index < source.length; index += 1) {
			hash ^= source.charCodeAt(index);
			hash = Math.imul(hash, 16777619);
		}
		return hash >>> 0;
	};
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
	const weightedPick = (random, weights) => {
		const entries = Object.entries(weights).filter(([, weight]) => weight > 0);
		if (!entries.length) return null;
		const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
		let roll = random() * total;
		for (const [key, weight] of entries) {
			roll -= weight;
			if (roll <= 0) return key;
		}
		return entries[entries.length - 1][0];
	};
	const graphemeCount = (text) => {
		const source = String(text ?? "");
		if (typeof Intl?.Segmenter === "function") {
			let count = 0;
			for (const _ of new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(source)) count += 1;
			return count;
		}
		return Array.from(source).length;
	};
	const squash = (text) => String(text ?? "").normalize("NFKC").toLowerCase().replace(/[\s\p{P}]/gu, "");
	const shapes = () => root.ivLyricsMotionShapes;

	// Concrete images from the words first, then decoration for the mood.
	const MOTIF_HINTS = Object.freeze([
		["moon", /月|달빛|달님|달이|달을|달에|\bmoon|\bluna\b|\blune\b/i],
		["sun", /太陽|日差し|陽射し|햇살|햇빛|태양|\bsun(?:shine|light|rise|set)?\b|\bsoleil\b/i],
		["star", /星|별빛|별이|별을|별처럼|\bstars?\b|\bétoiles?\b/i],
		["heart", /心|恋|愛|好き|사랑|마음|\blove|\bheart/i],
		["flower", /花|桜|꽃|\bflowers?\b|\bbloom|\broses?\b/i],
		["drop", /涙|泣|雨|눈물|빗물|비가|\btears?\b|\brain|\bcry/i],
		["flame", /火|炎|燃|불꽃|불타|\bfire|\bburn|\bflames?\b/i],
		["snow", /雪|冬|겨울|눈송이|\bsnow|\bwinter/i],
		["bolt", /雷|稲妻|電気|번개|\bthunder|\blightning|\belectric/i],
		["eye", /目|瞳|눈빛|눈동자|\beyes?\b/i],
		["crown", /王|女王|왕관|\bkings?\b|\bqueens?\b|\bcrown/i],
		["note", /歌|音楽|メロディ|노래|멜로디|\bsing|\bsongs?\b|\bmusic|\bmelody/i],
		["leaf", /葉|春|잎|봄|\bleaf|\bleaves|\bspring\b/i],
		["cloud", /雲|空|하늘|구름|\bsky|\bclouds?\b/i],
		["wave", /海|波|바다|파도|\bsea\b|\bocean|\bwaves?\b/i],
		["arrow", /走|行け|달려|\brun\b|\bgo\b|\baway\b/i],
		["spiral", /夢|꿈|\bdreams?\b|\bdizzy/i],
	]);
	const MOOD_MOTIFS = Object.freeze({
		calm: ["ring", "arc", "dot", "scribble"],
		dreamy: ["sparkle", "halo", "dots", "ring"],
		melancholic: ["arc", "halo", "dot", "scribble"],
		warm: ["sun", "ring", "sparkle", "scribble"],
		playful: ["sparkle", "star", "zigzag", "dots", "heart"],
		energetic: ["burst", "cross", "sparkle", "zigzag", "plus"],
		intense: ["cross", "burst", "frame", "bars", "bolt"],
		dark: ["cross", "frame", "bars", "halo"],
	});

	const wordsPerSecond = (line) => line.words.length / Math.max(0.4, (line.end - line.start) / 1000);

	// Another voice of a line (an echo, an answer, a duet partner) still sung
	// this close to the next line's start would be cut off when the camera
	// moves on for it.
	const VOICE_CROSS_MS = 360;
	/**
	 * Whether a line is still being sung when the next one comes in: the two
	 * overlap (a duet), or another voice in it sings on into the next line.
	 * Such lines share a composition that shows several lines at once.
	 */
	const singsInto = (line, next) => !!line && !!next && (next.start < line.end - 150
		|| (Array.isArray(line.backing) ? line.backing : []).some((voice) => voice.end > next.start - VOICE_CROSS_MS));
	const JOINED_RE = /[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Devanagari}\p{Script=Bengali}]/u;
	// Lines that can be set upright (the pillar composition): Korean, Japanese and Chinese without Latin words.
	const UPRIGHT_RE = /^[\p{Script=Hangul}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{P}\p{N}\s\u30fc]+$/u;
	const SYLLABIC_RE = /[\p{Script=Han}\p{Script=Hangul}\p{Script=Hiragana}\p{Script=Katakana}]/gu;
	const VOWELS_RE = /[aeiouyàáâãäåæèéêëìíîïòóôõöøùúûüýÿœăâđêôơưаеёиоуыэюяαεηιουωάέήίόύώ]+/giu;

	/** Roughly how many syllables are sung in a text, in any script. */
	const syllablesOf = (text) => {
		const source = String(text ?? "");
		const syllabic = (source.match(SYLLABIC_RE) || []).length;
		const thai = (source.match(/\p{Script=Thai}/gu) || []).length / 2.2;
		const joined = (source.match(/[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Devanagari}\p{Script=Bengali}]/gu) || []).length / 2.4;
		const rest = source.replace(SYLLABIC_RE, " ").replace(/[\p{Script=Thai}\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Devanagari}\p{Script=Bengali}]/gu, " ");
		let vowelGroups = 0;
		for (const word of rest.split(/[^\p{L}]+/u)) {
			if (word) vowelGroups += Math.max(1, (word.match(VOWELS_RE) || []).length);
		}
		return syllabic + thai + joined + vowelGroups;
	};

	const median = (values) => {
		if (!values.length) return 0;
		const sorted = [...values].sort((a, b) => a - b);
		const middle = sorted.length >> 1;
		return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
	};

	/** Beats per minute from the beat times (ms), folded into 70-180. */
	const bpmOf = (pulses) => {
		const times = pulses?.times;
		if (!times || times.length < 8) return null;
		const gaps = [];
		for (let index = 1; index < times.length; index += 1) {
			const gap = times[index] - times[index - 1];
			if (gap > 200 && gap < 2000) gaps.push(gap);
		}
		if (gaps.length < 6) return null;
		let bpm = 60000 / median(gaps);
		while (bpm < 70) bpm *= 2;
		while (bpm >= 180) bpm /= 2;
		return Math.round(bpm);
	};

	/**
	 * How fast the song is sung: slow (ballads), mid, fast or rap, from the
	 * median syllables per second and, when known, the beat.
	 */
	const tempoOf = (model, pulses = null) => {
		const rates = (Array.isArray(model) ? model : [])
			.map((line) => ({ syllables: syllablesOf(line.text), seconds: Math.max(0.4, (line.end - line.start) / 1000) }))
			.filter((entry) => entry.syllables >= 2)
			.map((entry) => entry.syllables / entry.seconds);
		const sps = median(rates);
		const bpm = bpmOf(pulses);
		let tempo = "mid";
		if (sps >= 6.4) tempo = "rap";
		else if (sps >= 4.8 || (bpm && bpm >= 140 && sps >= 3.6)) tempo = "fast";
		else if (sps > 0 && (sps < 3 || (bpm && bpm < 82 && sps < 3.8))) tempo = "slow";
		return { tempo, sps: Math.round(sps * 10) / 10, bpm, pace: PACE[tempo] };
	};

	/** The song's mood from its tempo and pauses (the AI reads the words instead). */
	const localMood = (model, tempo) => {
		if (!model.length) return "warm";
		const gaps = model.slice(1).map((line, index) => line.start - model[index].end);
		const pausy = gaps.filter((gap) => gap > 2500).length / Math.max(1, gaps.length);
		if (tempo.tempo === "rap") return "intense";
		if (tempo.tempo === "fast") return "energetic";
		if (tempo.tempo === "slow") return pausy > 0.2 ? "dreamy" : "melancholic";
		return pausy > 0.3 ? "calm" : "warm";
	};


	const heldWordIndex = (line) => {
		if (line.words.length < 2) return -1;
		const durations = line.words.map((word) => word.end - word.start);
		const sorted = [...durations].sort((a, b) => a - b);
		const median = sorted[Math.floor(sorted.length / 2)];
		let best = 0;
		durations.forEach((duration, index) => {
			if (duration > durations[best]) best = index;
		});
		return durations[best] >= Math.max(700, median * 1.7) ? best : -1;
	};

	const motifsFor = (text, mood, random, count) => {
		const names = [];
		for (const [name, pattern] of MOTIF_HINTS) {
			if (names.length >= 2) break;
			if (pattern.test(text)) names.push(name);
		}
		const pool = [...(MOOD_MOTIFS[mood] || MOOD_MOTIFS.warm)];
		while (names.length < count && pool.length) {
			const name = pool.splice(Math.floor(random() * pool.length), 1)[0];
			if (!names.includes(name)) names.push(name);
		}
		return names;
	};

	const echoFor = (lines) => {
		let best = null;
		for (const line of lines) {
			for (const word of line.words) {
				const length = graphemeCount(word.text);
				if (length < 1 || length > MAX_ECHO_LENGTH || !/[\p{L}\p{N}]/u.test(word.text)) continue;
				const held = word.end - word.start;
				if (!best || held > best.held) best = { text: word.text, held };
			}
		}
		return best?.text || null;
	};

	/**
	 * Shots of consecutive lines (two to four, usually): long pauses and the
	 * edges of repeated sections always break; a shorter pause breaks once a
	 * shot already holds two lines.
	 */
	const groupShots = (model) => {
		const firstSeen = new Map();
		const counts = new Map();
		const original = model.map((line, index) => {
			const key = squash(line.text);
			if (!firstSeen.has(key)) firstSeen.set(key, index);
			counts.set(key, (counts.get(key) || 0) + 1);
			return firstSeen.get(key);
		});
		const repeated = original.map((first, index) => first < index);
		// Sections that come back (choruses): two or more lines in a row that
		// recur somewhere in the song. Shots break at their edges, even the
		// first time, so every return can be cut the same way.
		const recurs = model.map((line) => counts.get(squash(line.text)) > 1);
		const section = recurs.map((value, index) => value && (recurs[index - 1] === true || recurs[index + 1] === true));
		const shots = [];
		const starts = new Set([0]);
		let from = 0;
		let weight = 0;
		model.forEach((line, index) => {
			const lineWeight = line.chars > 26 || line.words.length >= 8 ? 1.6 : 1;
			if (index > from) {
				const gap = line.start - model[index - 1].end;
				let sectionBreak = gap >= 3500 || section[index] !== section[index - 1]
					|| (repeated[index] !== repeated[index - 1] && (section[index] || section[index - 1]));
				// A chorus may hold one more line, so it stays one composition.
				let full = weight + lineWeight > (section[index] ? 4.6 : 3.6) || (index - from >= 2 && gap >= 1800)
					|| screenSpan(model, from, index) > MAX_SHOT_MS;
				if (repeated[index] && repeated[index - 1]) {
					// A returning section is cut where it was cut the first time.
					sectionBreak = original[index] !== original[index - 1] + 1;
					full = starts.has(original[index]);
				}
				// Lines sung over each other (a duet, a call and response, an echo running on) stay in one composition.
				if (singsInto(model[index - 1], line) && weight + lineWeight <= 6) {
					sectionBreak = false;
					full = false;
				}
				if (sectionBreak || full) {
					shots.push({ from, to: index - 1, sectionBreak });
					from = index;
					starts.add(index);
					weight = 0;
				}
			}
			weight += lineWeight;
		});
		if (model.length) shots.push({ from, to: model.length - 1 });
		// Mark which shots start a section (used for bigger camera entrances).
		return shots.map((shot, index) => ({
			...shot,
			sectionStart: index === 0 || shots[index - 1].sectionBreak === true,
			repeated: model.slice(shot.from, shot.to + 1).every((_, offset) => repeated[shot.from + offset]),
			chorus: model.slice(shot.from, shot.to + 1).every((_, offset) => section[shot.from + offset]),
			key: squash(model[shot.from].text),
		}));
	};

	const LAYOUT_WEIGHTS = Object.freeze({
		slow: {
			hero: 2.2, column: 1.2, wall: 0.3, tunnel: 0.7, spiral: 0.6, zigzag: 0.4, collage: 0, tower: 0,
			stairs: 0.9, strip: 0.7, split: 0.6, swell: 0.9, radial: 0.3, carousel: 0.9, reel: 0.8, crawl: 1.1,
			slot: 0.9, poster: 0.6, wordwall: 0.3, arch: 1, spread: 0.8, pillar: 1.1,
			wave: 1, constellation: 0.9, grid: 0.5, corners: 1.1,
			lockup: 0.7, flash: 0.3, chain: 0.6, fill: 0.4, seal: 0.9, frame: 1.1, margin: 1, marquee: 0.4, anamorph: 1, bleed: 0.6, rails: 0.7,
		},
		mid: {
			hero: 2, column: 0.7, wall: 0.6, tunnel: 0.8, spiral: 0.8, zigzag: 1, collage: 0.8, tower: 0.5,
			stairs: 0.9, strip: 0.8, split: 0.7, swell: 0.9, radial: 0.8, carousel: 1, reel: 0.9, crawl: 0.8,
			slot: 1, poster: 1, wordwall: 0.7, arch: 0.9, spread: 0.9, pillar: 0.9,
			wave: 0.9, constellation: 0.9, grid: 0.8, corners: 0.8,
			lockup: 1.1, flash: 0.8, chain: 1, fill: 0.9, seal: 0.8, frame: 0.9, margin: 0.8, marquee: 0.9, anamorph: 1, bleed: 0.8, rails: 0.8,
		},
		fast: {
			hero: 0.8, column: 0.4, wall: 0.6, tunnel: 0.9, spiral: 0.8, zigzag: 1.1, collage: 1.2, tower: 1.1,
			stairs: 0.9, strip: 1, split: 0.8, swell: 0.9, radial: 1, carousel: 1, reel: 1.1, crawl: 0.5,
			slot: 1.1, poster: 1.2, wordwall: 1, arch: 0.6, spread: 0.9, pillar: 0.6,
			wave: 0.7, constellation: 0.8, grid: 1, corners: 0.6,
			lockup: 1.3, flash: 1.3, chain: 1, fill: 1.2, seal: 0.8, frame: 0.7, margin: 0.6, marquee: 1.2, anamorph: 0.8, bleed: 1.1, rails: 0.7,
		},
		rap: {
			hero: 0.3, column: 0.8, wall: 0.6, tunnel: 1.1, spiral: 0.5, zigzag: 0.9, collage: 1.4, tower: 1.5,
			stairs: 1, strip: 0.8, split: 1, swell: 0.6, radial: 0.6, carousel: 0.7, reel: 1.2, crawl: 0.6,
			slot: 1.3, poster: 0.8, wordwall: 1.2, arch: 0.4, spread: 0.6, pillar: 0.3,
			wave: 0.5, constellation: 0.6, grid: 1.2, corners: 0.5,
			lockup: 1.4, flash: 1.5, chain: 1.3, fill: 1.3, seal: 0.6, frame: 0.5, margin: 0.6, marquee: 1.1, anamorph: 0.6, bleed: 0.9, rails: 0.8,
		},
	});
	// A composition never follows itself (a returning chorus poster aside), the two before it are
	// unlikely to come straight back, and ones the song has not used yet are favoured.
	const RECENT_PENALTY = Object.freeze([0, 0.45, 0.7]);
	const FRESH_BOOST = 1.5;

	const localLayout = (lines, energy, shot, history, tempo, random, avoid = null) => {
		const count = lines.length;
		const chars = lines.reduce((sum, line) => sum + line.chars, 0);
		const seconds = (lines[count - 1].end - lines[0].start) / 1000;
		const base = LAYOUT_WEIGHTS[tempo.tempo] || LAYOUT_WEIGHTS.mid;
		const longest = Math.max(...lines.map((line) => line.words.length));
		const within = (name, least = 2) => count >= least && count <= MAX_LINES[name];
		const weights = {
			hero: count <= 2 && (chars <= 16 || seconds / count >= 3.6) ? base.hero : 0,
			// Choruses are set big, from their first time; other shots leave the poster to them.
			wall: count <= MAX_LINES.wall ? (shot.chorus || shot.repeated ? 7 : count >= 3 ? base.wall : base.wall * 0.3) : 0,
			column: base.column,
			zigzag: within("zigzag") ? base.zigzag * (1 + 0.5 * energy) : 0,
			spiral: within("spiral", 3) ? base.spiral : 0,
			tunnel: count >= 2 ? base.tunnel * (0.6 + energy) : 0,
			collage: within("collage", 3) && energy > 0.3 ? base.collage : 0,
			tower: count <= MAX_LINES.tower && longest <= 6 ? base.tower : 0,
			stairs: within("stairs") ? base.stairs : 0,
			strip: within("strip") && chars / count <= 22 ? base.strip : 0,
			// Voices answering each other face each other.
			split: within("split") ? base.split * (shot.voices ? 3 : 1) : 0,
			// The shot before a chorus builds into it.
			swell: within("swell") ? base.swell * (shot.build ? 3 : 1) : 0,
			radial: within("radial", 3) ? base.radial * (0.7 + 0.6 * energy) : 0,
			carousel: within("carousel") ? base.carousel : 0,
			reel: within("reel", 3) ? base.reel : 0,
			crawl: within("crawl", 3) ? base.crawl * (1.3 - 0.6 * energy) : 0,
			// One line at a time: not for voices singing over each other.
			slot: within("slot") && !shot.voices ? base.slot : 0,
			poster: count <= MAX_LINES.poster && chars / count <= 16 && !shot.voices ? base.poster * (shot.chorus || shot.repeated ? 1.6 : 1) : 0,
			wordwall: within("wordwall") && chars / count <= 22 ? base.wordwall * (shot.chorus || shot.repeated ? 1.5 : 1) : 0,
			arch: within("arch") && chars / count <= 20 ? base.arch : 0,
			spread: count <= MAX_LINES.spread && longest >= 2 && longest <= 6 && !shot.voices ? base.spread : 0,
			// Upright type suits Korean, Japanese and Chinese lines without Latin words.
			pillar: count <= MAX_LINES.pillar && chars / count <= 14 && lines.every((line) => UPRIGHT_RE.test(line.text) && !(line.backing || []).length) ? base.pillar : 0,
			wave: within("wave") ? base.wave : 0,
			constellation: within("constellation") ? base.constellation * (0.8 + 0.4 * energy) : 0,
			grid: within("grid") ? base.grid : 0,
			// Small type in the corners leaves the screen to the video: quieter shots.
			corners: within("corners") ? base.corners * (1.25 - 0.5 * energy) : 0,
			// One line at a time, its words sized by stress into a tight block.
			lockup: count <= MAX_LINES.lockup && longest >= 2 && !shot.voices ? base.lockup : 0,
			// One word at a time in one place: dense, fast lines.
			flash: count <= MAX_LINES.flash && longest >= 2 && !shot.voices && !lines.some((line) => (line.backing || []).length) ? base.flash * (0.6 + energy) : 0,
			chain: within("chain") ? base.chain : 0,
			fill: count <= MAX_LINES.fill && chars / count <= 26 && !shot.voices ? base.fill * (shot.chorus || shot.repeated ? 1.4 : 1) : 0,
			seal: count <= MAX_LINES.seal && chars / count <= 22 && !shot.voices ? base.seal : 0,
			// The words round the frame, the middle left to the video.
			frame: count <= MAX_LINES.frame && longest >= 2 && longest <= 8 && !shot.voices ? base.frame * (1.2 - 0.4 * energy) : 0,
			margin: within("margin") ? base.margin * (1.2 - 0.4 * energy) : 0,
			marquee: count <= MAX_LINES.marquee && chars / count <= 24 && !shot.voices ? base.marquee * (shot.chorus || shot.repeated ? 1.4 : 1) : 0,
			anamorph: within("anamorph") && longest >= 3 ? base.anamorph : 0,
			bleed: count <= MAX_LINES.bleed && chars / count <= 18 && !shot.voices ? base.bleed : 0,
			rails: within("rails") ? base.rails : 0,
		};
		if (avoid) for (const name of avoid) weights[name] = 0;
		const open = { ...weights };
		if (shot.split === "word") for (const [name, factor] of Object.entries(WORD_LAYOUTS)) if (weights[name]) weights[name] *= factor;
		history.slice(-RECENT_PENALTY.length).reverse().forEach((name, back) => {
			if (!weights[name]) return;
			weights[name] *= !back && name === "wall" && (shot.chorus || shot.repeated) ? 0.5 : RECENT_PENALTY[back];
		});
		for (const name of Object.keys(weights)) if (!history.includes(name)) weights[name] *= FRESH_BOOST;
		return weightedPick(random, weights) || weightedPick(random, open) || "column";
	};

	const ENTER_WEIGHTS = Object.freeze({
		slow: {
			section: { fade: 1.3, orbit: 0.8, push: 0.7, pull: 0.6, panel: 0.3, roll: 0.3, drift: 1, crane: 0.8, swoop: 0.4, iris: 0.8, open: 0.6 },
			line: { pan: 0.9, rise: 0.8, drop: 0.5, fade: 1, push: 0.6, orbit: 0.4, drift: 1.1, crane: 0.5, iris: 0.4, open: 0.4 },
		},
		mid: {
			section: { roll: 0.9, flip: 0.6, orbit: 0.8, panel: 0.5, push: 0.6, through: 0.6, tumble: 0.5, fade: 0.4, crane: 0.7, swoop: 0.7, twist: 0.7, corkscrew: 0.5, hop: 0.6, iris: 0.6, open: 0.6 },
			line: { pan: 1, drop: 0.8, rise: 0.7, roll: 0.4, push: 0.6, pull: 0.4, orbit: 0.4, whip: 0.3, drift: 0.6, twist: 0.5, hop: 0.5, swoop: 0.4, iris: 0.3, open: 0.4 },
		},
		fast: {
			section: { panel: 0.7, spin: 0.8, flip: 0.7, through: 0.8, tumble: 0.7, roll: 0.7, orbit: 0.5, corkscrew: 0.8, twist: 0.7, swoop: 0.6, hop: 0.6, iris: 0.5, open: 0.7 },
			line: { whip: 1.1, pan: 0.7, drop: 0.8, rise: 0.5, roll: 0.5, spin: 0.3, push: 0.5, tumble: 0.3, twist: 0.6, hop: 0.7, swoop: 0.5, open: 0.4 },
		},
	});

	const localEnter = (shot, gap, energy, previous, tempo, random, avoid = null) => {
		if (shot.index === 0) return "push";
		const table = ENTER_WEIGHTS[tempo.tempo === "rap" ? "fast" : tempo.tempo] || ENTER_WEIGHTS.mid;
		const weights = { ...(shot.sectionStart ? table.section : table.line) };
		// Hard cuts belong to long pauses and section changes in songs with drive.
		if (shot.sectionStart && gap >= (tempo.tempo === "slow" ? 6000 : 2400)) weights.cut = tempo.tempo === "slow" ? 0.5 : 1.1;
		if (energy >= 0.66) for (const name of ["roll", "spin", "flip", "whip", "corkscrew", "twist"]) if (weights[name]) weights[name] *= 1.3;
		if (energy < 0.3) for (const name of ["drift", "fade", "crane"]) if (weights[name]) weights[name] *= 1.3;
		if (previous && weights[previous]) weights[previous] *= 0.3;
		if (avoid) for (const name of avoid) delete weights[name];
		return weightedPick(random, weights) || "pan";
	};

	const FX_WEIGHTS = Object.freeze({
		slow: {
			blur: 1.1, rise: 1, wipe: 0.8, track: 0.8, wave: 0.6, stretch: 0.6, type: 0.4, flip: 0.2,
			lift: 1.1, glide: 1.2, open: 0.7, door: 0.5, cascade: 0.6, swirl: 0.3, skew: 0.3,
			brush: 1, shutter: 0.6, rain: 0.4,
		},
		mid: {
			pop: 0.45, rise: 0.8, flip: 0.6, drop: 0.5, assemble: 0.6, blur: 0.6, spin: 0.4, bounce: 0.4, wipe: 0.5, type: 0.5, track: 0.4,
			lift: 0.9, swing: 0.7, door: 0.6, skew: 0.6, open: 0.6, cascade: 0.6, ripple: 0.6, glide: 0.5, swirl: 0.4, smear: 0.4,
			rain: 0.7, decode: 0.5, brush: 0.7, shutter: 0.6,
		},
		fast: {
			slam: 0.35, pop: 0.55, zoom: 0.3, glitch: 0.55, slide: 0.8, spin: 0.5, bounce: 0.6, flicker: 0.5, assemble: 0.5, type: 0.5,
			smear: 0.9, skew: 0.8, lift: 0.7, swing: 0.6, ripple: 0.7, door: 0.5, open: 0.5, cascade: 0.4,
			rain: 0.8, decode: 0.8, brush: 0.5, shutter: 0.7,
		},
		rap: {
			type: 1.1, slide: 1, glitch: 0.6, slam: 0.3, flicker: 0.6, zoom: 0.2, pop: 0.4,
			smear: 1, skew: 0.8, lift: 0.7, ripple: 0.5, open: 0.5,
			decode: 1, rain: 0.6, shutter: 0.6,
		},
	});

	const localFx = (lines, energy, tempo, random, avoid = null) => {
		const charTimed = lines.every((line) => line.charTimed);
		const joined = lines.some((line) => JOINED_RE.test(line.text));
		const weights = { ...(FX_WEIGHTS[tempo.tempo] || FX_WEIGHTS.mid) };
		if (weights.type) weights.type *= charTimed ? 1.6 : 0.6;
		if (joined) for (const name of LETTER_FX) delete weights[name];
		if (energy >= 0.66) {
			for (const name of ["slam", "zoom", "glitch", "smear", "skew"]) if (weights[name]) weights[name] *= 1.25;
		} else {
			// Words only smash in on the loudest parts.
			for (const name of HARD_FX) delete weights[name];
		}
		if (energy < 0.3) for (const name of ["blur", "rise", "wave", "wipe", "glide", "lift", "open"]) if (weights[name]) weights[name] *= 1.3;
		if (avoid) for (const name of avoid) delete weights[name];
		return weightedPick(random, weights) || "rise";
	};

	// Heavy display type carries the edit; the rounded face is a rare change of voice.
	const ROUND_CHANCE = Object.freeze({ slow: 0.03, mid: 0.08, fast: 0.1, rap: 0.06 });
	// How often a whole shot is set in serif (within the song's budget) ...
	const SERIF_SHOT_CHANCE = Object.freeze({ slow: 0.2, mid: 0.08, fast: 0.03, rap: 0.02 });
	// ... and how often a heavy shot sets just its emphasised words in serif.
	const SERIF_CHANCE = Object.freeze({ slow: 0.4, mid: 0.25, fast: 0.1, rap: 0.05 });
	const ACCENT_WEIGHTS = Object.freeze({
		slow: {
			color: 1, underline: 1, outline: 0.6, mark: 0.5, glow: 0.9, gradient: 0.9, circle: 0.7, extrude: 0.2,
			script: 1, scribble: 0.6, bracket: 0.5, giant: 0.3, neon: 0.6, chrome: 0.4,
		},
		mid: {
			color: 1, underline: 0.6, mark: 0.6, outline: 0.4, spark: 0.5, glow: 0.6, gradient: 0.7, stamp: 0.5, circle: 0.6, extrude: 0.6, sticker: 0.5,
			script: 0.8, giant: 0.7, trail: 0.5, scribble: 0.6, bracket: 0.5, neon: 0.6, chrome: 0.6, spectrum: 0.5,
		},
		fast: {
			spark: 1.1, color: 0.8, mark: 0.6, outline: 0.6, glow: 0.8, gradient: 0.6, stamp: 0.5, circle: 0.5, extrude: 0.9, sticker: 0.8,
			giant: 1, trail: 0.9, bracket: 0.6, script: 0.5, scribble: 0.4, neon: 0.9, chrome: 0.8, spectrum: 0.9,
		},
	});

	/** A shot's accent: never the one just used, more often one the song has not shown yet. */
	const localAccent = (accents, history, random, avoid = null) => {
		const weights = { ...accents };
		[0, 0.6].forEach((penalty, back) => {
			const name = history[history.length - 1 - back];
			if (name && weights[name]) weights[name] *= penalty;
		});
		for (const name of Object.keys(weights)) if (!history.includes(name)) weights[name] *= 1.4;
		if (avoid) for (const name of avoid) delete weights[name];
		return weightedPick(random, weights) || "color";
	};

	// Exits and holds by tempo: slow songs leave softly and keep drifting, fast ones get thrown off and pulse.
	const EXIT_WEIGHTS = Object.freeze({
		slow: {
			fade: 1.1, rise: 1.2, blur: 1.2, shrink: 0.8, wipe: 0.8, sweep: 0.5, fall: 0.5, flip: 0.4, scatter: 0.2, stretch: 0.1, drip: 0.6,
			sink: 0.9, shut: 0.5, zoom: 0.4, twist: 0.2, hinge: 0.2, dissolve: 1.1, evaporate: 1.1, crumble: 0.4, erase: 0.5, tumble: 0.3,
		},
		mid: {
			fade: 0.7, rise: 1, blur: 0.9, shrink: 0.9, wipe: 0.9, sweep: 1, fall: 0.9, flip: 0.8, scatter: 0.6, stretch: 0.5, glitch: 0.5, drip: 0.6,
			sink: 1, shut: 0.8, zoom: 0.8, twist: 0.6, dash: 0.7, hinge: 0.6, crumble: 0.9, dissolve: 0.9, erase: 0.8, burst: 0.6, evaporate: 0.8, tumble: 0.8, scramble: 0.5,
		},
		fast: {
			fade: 0.3, rise: 0.7, blur: 0.6, shrink: 0.9, wipe: 0.9, sweep: 1.2, fall: 1.1, flip: 1, scatter: 1.1, stretch: 0.9, glitch: 1, drip: 0.5,
			sink: 1, shut: 1, zoom: 1.1, twist: 0.9, dash: 1.2, hinge: 0.8, crumble: 1, dissolve: 0.5, erase: 0.9, burst: 1.1, evaporate: 0.4, tumble: 1, scramble: 0.9,
		},
		rap: {
			fade: 0.3, rise: 0.6, blur: 0.5, shrink: 1, wipe: 1, sweep: 1.2, fall: 1, flip: 1, scatter: 1, stretch: 1, glitch: 1.1, drip: 0.4,
			sink: 1, shut: 1.1, zoom: 1, twist: 0.8, dash: 1.2, hinge: 0.7, crumble: 0.9, dissolve: 0.4, erase: 1.1, burst: 1, evaporate: 0.3, tumble: 0.9, scramble: 1.1,
		},
	});
	const HOLD_WEIGHTS = Object.freeze({
		slow: { grow: 1.4, drift: 1.3, float: 1.1, push: 1, lean: 0.8, breathe: 0.4, still: 0.05, swivel: 0.9, wobble: 0.3 },
		mid: { grow: 1, drift: 1, float: 0.8, push: 0.9, lean: 0.8, breathe: 0.8, still: 0.2, swivel: 0.8, wobble: 0.6 },
		fast: { grow: 0.7, drift: 0.6, float: 0.4, push: 1, lean: 0.8, breathe: 1.2, still: 0.5, swivel: 0.6, wobble: 1 },
		rap: { grow: 0.6, drift: 0.6, float: 0.3, push: 1, lean: 0.9, breathe: 1.2, still: 0.6, swivel: 0.5, wobble: 0.9 },
	});
	/** A shot's exit or hold for the tempo: not the one the last shot used. */
	const localMotion = (weights, tempo, previous, random, fallback) => {
		const table = { ...(weights[tempo?.tempo] || weights.mid) };
		if (previous && table[previous]) table[previous] *= 0.15;
		return weightedPick(random, table) || fallback;
	};

	const WIDE_RE = /[\p{Script=Han}\p{Script=Hangul}\p{Script=Hiragana}\p{Script=Katakana}]/u;
	/** Room a text takes: a Latin letter one, a Korean, Japanese or Chinese character nearly two (MotionLyrics.js, unitsOf). */
	const unitsOfText = (text) => {
		let units = 0;
		for (const character of String(text ?? "").replace(/\s+/gu, "")) units += WIDE_RE.test(character) ? 1.8 : 1;
		return units;
	};
	// How often a shot of short, clearly sung lines goes word by word, by tempo.
	const WORD_SPLIT_CHANCE = Object.freeze({ slow: 0, mid: 0.14, fast: 0.32, rap: 0.24 });
	/**
	 * How a shot breaks its lines: word by word now and then in songs with drive
	 * (lines of 2 to 7 words sung at a readable pace), short phrases when its
	 * lines are long, otherwise whole lines.
	 */
	const localSplit = (lines, tempo, energy, random) => {
		const heaviest = Math.max(...lines.map((line) => unitsOfText(line.text)));
		const most = Math.max(...lines.map((line) => line.words.length));
		const pace = lines.reduce((sum, line) => sum + wordsPerSecond(line), 0) / Math.max(1, lines.length);
		const wordy = lines.every((line) => line.words.length >= 2 && line.words.length <= 7 && !(line.backing || []).length);
		if (wordy && pace >= 1.4 && pace <= 4.6 && random() < (WORD_SPLIT_CHANCE[tempo.tempo] ?? 0.14) * (0.6 + energy)) return "word";
		if (heaviest > 20 || most >= 6) return random() < 0.8 ? "phrase" : "line";
		return most >= 4 && random() < 0.12 ? "phrase" : "line";
	};
	// Compositions that suit words set one by one, and ones that do not.
	const WORD_LAYOUTS = Object.freeze({ chain: 2, flash: 1.7, stairs: 1.5, collage: 1.5, zigzag: 1.3, tower: 1.3, constellation: 1.3, spread: 1.2, rails: 1.2, wall: 0.5, poster: 0.6, fill: 0.5, frame: 0.6, marquee: 0.4, bleed: 0.6, seal: 0.6 });
	const UPPER_CHANCE = Object.freeze({ slow: 0.15, mid: 0.4, fast: 0.6, rap: 0.6 });
	const TILT = Object.freeze({ slow: 2, mid: 5, fast: 9, rap: 11 });

	/**
	 * A shot's face and whether its emphasised words go serif. A whole serif
	 * shot needs room in the song's budget and never follows another.
	 */
	const shotType = (mood, tempo, layout, random, serifAllowed) => {
		const round = (ROUND_CHANCE[tempo.tempo] ?? 0.08) + (mood === "playful" ? 0.3 : 0);
		const quiet = mood === "dreamy" || mood === "melancholic" || mood === "calm";
		const serifShot = (SERIF_SHOT_CHANCE[tempo.tempo] ?? 0.08) + (quiet ? 0.06 : 0) + (layout === "hero" ? 0.08 : 0);
		const serifChance = (SERIF_CHANCE[tempo.tempo] ?? 0.3) + (quiet ? 0.15 : 0) + (layout === "hero" ? 0.15 : 0);
		const pick = random();
		const type = serifAllowed && pick < serifShot ? "serif" : pick > 1 - round ? "round" : "impact";
		return { type, serif: type === "serif" || random() < serifChance };
	};

	/** How many shots, and lines in them, may be set wholly in serif. */
	const serifBudget = (shotCount, lineCount) => ({
		shots: Math.max(1, Math.round(shotCount * SERIF_SHARE)),
		lines: Math.max(3, Math.round(lineCount * SERIF_LINE_SHARE)),
	});

	/**
	 * Keeps serif shots rare: never two neighbouring shots (parts of one
	 * split shot excepted) and no more shots or lines than the budget; the
	 * rest become heavy shots whose emphasised words stay serif.
	 */
	const limitSerif = (shots) => {
		const budget = serifBudget(shots.length, shots.length ? shots[shots.length - 1].to + 1 : 0);
		let used = 0;
		let usedLines = 0;
		const result = [];
		shots.forEach((shot) => {
			const previous = result[result.length - 1];
			const size = shot.to - shot.from + 1;
			const fits = usedLines + size <= budget.lines;
			const keep = shot.type === "serif" && fits && (shot.continued === true
				? previous?.type === "serif"
				: previous?.type !== "serif" && used < budget.shots);
			if (keep) {
				if (shot.continued !== true) used += 1;
				usedLines += size;
				result.push(shot);
			} else {
				result.push(shot.type === "serif" ? { ...shot, type: "impact", serif: true } : shot);
			}
		});
		return result;
	};

	// The largest share of a song's shots one composition, entrance, word effect or accent may take.
	const SHARE_LIMIT = Object.freeze({ layout: 0.16, enter: 0.22, fx: 0.2, accent: 0.2 });
	// An AI edit built on a kit of its own (a few compositions it keeps coming back to) may lean on each a little more.
	const KIT_SHARE_LIMIT = Object.freeze({ layout: 0.22, enter: 0.28, fx: 0.26, accent: 0.3 });
	const QUIET_MOODS = new Set(["calm", "dreamy", "melancholic"]);

	/**
	 * The edit's restraint and range, whoever directed it. Words that smash
	 * in (slam, zoom) come only on the loudest shots of songs with drive, a
	 * few times a song and never two shots running; snappy entrances and
	 * flash cuts are rationed the same way; no composition, entrance, word
	 * effect or accent follows itself or takes over the song. Whatever is
	 * replaced is picked from the song's own tempo palette, so the mood
	 * holds, and a returning section keeps the look it had the first time.
	 * Line effects (direction.lines) are held to the same budget.
	 */
	const refineShots = (shots, lineDirections, model, options = {}) => {
		const lines = Array.isArray(model) ? model : [];
		const count = shots.length;
		if (!count) return { shots, lines: lineDirections };
		const random = createRandom((Number(options.seed) >>> 0) ^ 0x3C6EF372);
		const tempo = options.tempo?.tempo ? options.tempo : tempoOf(lines, options.pulses);
		const energy = Array.isArray(options.energy) && options.energy.length === lines.length ? options.energy : lines.map(() => 0.5);
		const quiet = tempo.tempo === "slow" || QUIET_MOODS.has(options.mood);
		const accents = ACCENT_WEIGHTS[tempo.tempo === "rap" ? "fast" : tempo.tempo] || ACCENT_WEIGHTS.mid;
		// The AI's kit (what it said it would use and what it used): replacements come from it first, so the edit keeps its look.
		const kit = options.kit || null;
		// (A kit of one or two choices is no kit: the usual limits hold.)
		const cap = (kind) => Math.max(2, Math.ceil(count * ((kit?.[kind]?.size || 0) >= 3 ? KIT_SHARE_LIMIT : SHARE_LIMIT)[kind]));
		const fromKit = (kind, names, avoid, pick) => {
			const own = kit?.[kind];
			const blocked = avoid || new Set();
			if (own && own.size >= 2) {
				const narrowed = new Set([...blocked, ...names.filter((name) => !own.has(name))]);
				if (names.some((name) => !narrowed.has(name))) {
					const choice = pick(narrowed);
					if (own.has(choice) && !blocked.has(choice)) return choice;
				}
			}
			return pick(blocked);
		};
		const motionFromKit = (kind, weights, previous, fallback) => {
			const own = [...(kit?.[kind] || [])].filter((name) => name !== previous);
			if (own.length) {
				const table = weights[tempo.tempo] || weights.mid || {};
				return weightedPick(random, Object.fromEntries(own.map((name) => [name, table[name] || 0.3]))) || own[0];
			}
			return localMotion(weights, tempo, previous, random, fallback);
		};
		const budget = {
			hard: quiet ? 0 : Math.max(1, Math.floor(count / (tempo.tempo === "mid" ? 12 : 8))),
			punchy: Math.max(1, Math.ceil(count * (quiet ? 0.08 : 0.15))),
			cuts: Math.max(1, Math.floor(count / (quiet ? 10 : 6))),
			stamps: Math.max(1, Math.floor(count / 6)),
		};
		const used = { hard: 0, punchy: 0, cuts: 0, stamps: 0 };
		const counts = { layout: new Map(), enter: new Map(), fx: new Map(), accent: new Map() };
		const tally = (kind, value) => counts[kind].set(value, (counts[kind].get(value) || 0) + 1);
		const full = (kind) => [...counts[kind]].filter(([, times]) => times >= cap(kind)).map(([name]) => name);
		const history = { layout: [], accent: [] };
		const returns = new Map();
		const result = [];
		shots.forEach((original, index) => {
			const { continued, ...shot } = original;
			const previous = result[index - 1] || null;
			const members = lines.slice(shot.from, shot.to + 1);
			const shotEnergy = members.reduce((sum, _, offset) => sum + (energy[shot.from + offset] ?? 0.5), 0) / Math.max(1, members.length);
			if (continued === true && previous) {
				// The rest of a shot too long for its composition carries on as it began, but a hit is not repeated.
				const hit = HARD_FX.includes(previous.fx) || PUNCHY_FX.includes(previous.fx);
				shot.layout = previous.layout;
				shot.fx = hit ? fromKit("fx", FX, new Set([...HARD_FX, ...PUNCHY_FX, ...full("fx")]), (avoid) => localFx(members, shotEnergy, tempo, random, avoid)) : previous.fx;
				shot.accent = previous.accent === "stamp" && used.stamps >= budget.stamps
					? fromKit("accent", ACCENTS, new Set(["stamp", ...full("accent")]), (avoid) => localAccent(accents, history.accent, random, avoid))
					: previous.accent;
				if (shot.accent === "stamp") used.stamps += 1;
				for (const kind of Object.keys(counts)) tally(kind, shot[kind]);
				history.layout.push(shot.layout);
				history.accent.push(shot.accent);
				result.push(shot);
				return;
			}
			const loud = shotEnergy >= 0.62;
			const gap = index && lines[shot.from - 1] ? members[0].start - lines[shot.from - 1].end : Infinity;
			const key = squash(members[0]?.text) + ":" + members.length;
			const first = returns.get(key);
			// A returning section is cut the same way: what the AI repeated is repeated as it was refined.
			const repeats = (kind) => !!first && original[kind] === first.raw[kind];

			if (repeats("layout")) shot.layout = first.final.layout;
			else if ((previous && shot.layout === previous.layout) || (counts.layout.get(shot.layout) || 0) >= cap("layout")) {
				const traits = { chorus: false, repeated: false, build: false, split: shot.split, voices: members.some((line, offset) => (line.backing || []).some((voice) => voice.role === "duet") || (offset > 0 && singsInto(members[offset - 1], line))) };
				const avoid = new Set([...full("layout"), previous?.layout].filter(Boolean));
				shot.layout = fromKit("layout", LAYOUTS, avoid, (blocked) => localLayout(members, shotEnergy, traits, history.layout, tempo, random, blocked));
			}

			const hardFx = HARD_FX.includes(shot.fx);
			const punchyFx = PUNCHY_FX.includes(shot.fx);
			const afterHit = previous && (HARD_FX.includes(previous.fx) || PUNCHY_FX.includes(previous.fx));
			if (repeats("fx") && !(hardFx && (quiet || used.hard >= budget.hard))) shot.fx = first.final.fx;
			else if ((hardFx && (quiet || !loud || used.hard >= budget.hard || afterHit))
				|| (punchyFx && (used.punchy >= budget.punchy || afterHit))
				|| (previous && shot.fx === previous.fx)
				|| (counts.fx.get(shot.fx) || 0) >= cap("fx")) {
				const avoid = new Set([...full("fx"), previous?.fx].filter(Boolean));
				if (quiet || !loud || used.hard >= budget.hard || afterHit) HARD_FX.forEach((name) => avoid.add(name));
				if (used.punchy >= budget.punchy || afterHit) PUNCHY_FX.forEach((name) => avoid.add(name));
				shot.fx = fromKit("fx", FX, avoid, (blocked) => localFx(members, shotEnergy, tempo, random, blocked));
			}
			if (HARD_FX.includes(shot.fx)) used.hard += 1;
			if (PUNCHY_FX.includes(shot.fx)) used.punchy += 1;

			if (index && !repeats("enter")) {
				const cut = HARD_ENTERS.includes(shot.enter);
				const sectionLike = gap >= 1200;
				if ((cut && (!sectionLike || used.cuts >= budget.cuts || HARD_ENTERS.includes(previous?.enter)))
					|| (previous && shot.enter === previous.enter && shot.enter !== "pan")
					|| (counts.enter.get(shot.enter) || 0) >= cap("enter")) {
					const avoid = new Set([...full("enter"), previous?.enter].filter(Boolean));
					if (!sectionLike || used.cuts >= budget.cuts) HARD_ENTERS.forEach((name) => avoid.add(name));
					shot.enter = fromKit("enter", ENTERS, avoid, (blocked) => localEnter({ index, sectionStart: sectionLike }, gap, shotEnergy, previous?.enter, tempo, random, blocked));
				}
			} else if (index) shot.enter = first.final.enter;
			if (index && HARD_ENTERS.includes(shot.enter)) used.cuts += 1;

			if (repeats("accent")) shot.accent = first.final.accent;
			else if ((previous && shot.accent === previous.accent)
				|| (counts.accent.get(shot.accent) || 0) >= cap("accent")
				|| (shot.accent === "stamp" && used.stamps >= budget.stamps)) {
				const avoid = new Set([...full("accent"), previous?.accent].filter(Boolean));
				if (used.stamps >= budget.stamps) avoid.add("stamp");
				shot.accent = fromKit("accent", ACCENTS, avoid, (blocked) => localAccent(accents, history.accent, random, blocked));
			}
			if (shot.accent === "stamp") used.stamps += 1;

			// Exits and holds keep changing too: never the same as the shot before (a returning section aside).
			for (const [kind, weights, names, fallback] of [["exit", EXIT_WEIGHTS, EXITS, "fade"], ["hold", HOLD_WEIGHTS, HOLDS, "grow"]]) {
				if (repeats(kind)) shot[kind] = first.final[kind];
				else if (!names.includes(shot[kind]) || (previous && shot[kind] === previous[kind])) {
					shot[kind] = motionFromKit(kind, weights, previous?.[kind], fallback);
				}
			}

			tally("layout", shot.layout);
			tally("enter", shot.enter);
			tally("fx", shot.fx);
			tally("accent", shot.accent);
			history.layout.push(shot.layout);
			history.accent.push(shot.accent);
			if (!first) returns.set(key, { raw: original, final: shot });
			result.push(shot);
		});

		// Line effects: a line may hit harder than its shot only on a loud line, a few times a song.
		const refinedLines = {};
		const lineBudget = { hard: quiet ? 0 : Math.max(1, Math.floor(lines.length / 16)), punchy: Math.max(1, Math.ceil(lines.length / 10)) };
		const lineUsed = { hard: 0, punchy: 0 };
		for (const [key, entry] of Object.entries(lineDirections || {})) {
			const value = { ...entry };
			const index = Number(key);
			const shot = result.find((item) => item.from <= index && index <= item.to);
			if (HARD_FX.includes(value.fx)) {
				if (lineUsed.hard < lineBudget.hard && (energy[index] ?? 0.5) >= 0.62 && !HARD_FX.includes(shot?.fx)) lineUsed.hard += 1;
				else delete value.fx;
			} else if (PUNCHY_FX.includes(value.fx)) {
				if (lineUsed.punchy < lineBudget.punchy) lineUsed.punchy += 1;
				else delete value.fx;
			}
			if (Object.keys(value).length) refinedLines[key] = value;
		}
		return { shots: result, lines: refinedLines };
	};

	/** A complete direction made without AI, deterministic for the same song. */
	const localDirection = (model, options = {}) => {
		const lines = Array.isArray(model) ? model : [];
		const random = createRandom((Number(options.seed) >>> 0) ^ 0xA5A5A5A5);
		const energy = Array.isArray(options.energy) && options.energy.length === lines.length
			? options.energy
			: lines.map(() => 0.5);
		const tempo = options.tempo?.tempo ? options.tempo : tempoOf(lines, options.pulses);
		const mood = localMood(lines, tempo);
		const accents = ACCENT_WEIGHTS[tempo.tempo === "rap" ? "fast" : tempo.tempo] || ACCENT_WEIGHTS.mid;
		// Every return of a section gets the look it had the first time.
		const styleByKey = new Map();
		const shots = [];
		const layoutHistory = [];
		const accentHistory = [];
		const groups = groupShots(lines);
		// Its own stream, so the rest of the edit is chosen as before.
		const splitRandom = createRandom((Number(options.seed) >>> 0) ^ 0x2545F491);
		const budget = serifBudget(groups.length, lines.length);
		let serifShots = 0;
		let serifLines = 0;
		groups.forEach((shot, index) => {
			const members = lines.slice(shot.from, shot.to + 1);
			const shotEnergy = members.reduce((sum, _, offset) => sum + energy[shot.from + offset], 0) / members.length;
			const previous = shots[shots.length - 1] || null;
			const gap = index ? members[0].start - lines[shot.from - 1].end : Infinity;
			const enter = localEnter({ ...shot, index }, gap, shotEnergy, previous?.enter, tempo, random);
			const seen = shot.repeated ? styleByKey.get(shot.key) : null;
			if (seen && members.length <= MAX_LINES[seen.layout]) {
				// A returning serif section right after another serif shot keeps only its serif words.
				const back = seen.type === "serif" && previous?.type === "serif" ? { type: "impact", serif: true } : {};
				if ((back.type || seen.type) === "serif") {
					serifShots += 1;
					serifLines += members.length;
				}
				layoutHistory.push(seen.layout);
				accentHistory.push(seen.accent);
				shots.push({ ...seen, ...back, from: shot.from, to: shot.to, enter });
				return;
			}
			const traits = {
				...shot,
				split: localSplit(members, tempo, shotEnergy, splitRandom),
				build: groups[index + 1]?.chorus === true && !shot.chorus,
				voices: members.some((line, offset) => (line.backing || []).some((voice) => voice.role === "duet")
					|| (offset > 0 && singsInto(members[offset - 1], line))),
			};
			const layout = localLayout(members, shotEnergy, traits, layoutHistory, tempo, random);
			const serifRoom = previous?.type !== "serif" && serifShots < budget.shots && serifLines + members.length <= budget.lines;
			const { type, serif } = shotType(mood, tempo, layout, random, serifRoom);
			if (type === "serif") {
				serifShots += 1;
				serifLines += members.length;
			}
			const tilt = TILT[tempo.tempo] * (0.5 + shotEnergy);
			const quiet = tempo.tempo === "slow" || mood === "dreamy" || mood === "melancholic";
			const motifCount = quiet ? 1 + Math.floor(random() * 2) : 2 + Math.floor(random() * 3);
			const style = {
				from: shot.from,
				to: shot.to,
				layout,
				enter,
				fx: localFx(members, shotEnergy, tempo, random),
				accent: localAccent(accents, accentHistory, random),
				exit: localMotion(EXIT_WEIGHTS, tempo, previous?.exit, random, "fade"),
				hold: localMotion(HOLD_WEIGHTS, tempo, previous?.hold, random, "grow"),
				split: traits.split,
				type,
				serif,
				upper: type === "impact" && random() < UPPER_CHANCE[tempo.tempo],
				bars: ["hero", "wall", "crawl", "swell", "pillar"].includes(layout) && random() < (quiet ? 0.45 : 0.2),
				rule: (quiet || serif) && ["column", "hero", "tower", "stairs"].includes(layout) && random() < 0.5,
				dutch: Math.round((random() * 2 - 1) * tilt),
				motifs: motifsFor(members.map((line) => line.text + " " + (line.translation || "")).join(" "), mood, random, motifCount),
				echo: ["wall", "hero", "column", "tunnel", "tower", "stairs", "split", "swell", "carousel", "slot", "poster", "spread", "pillar"].includes(layout) && random() < 0.65 ? echoFor(members) : null,
				source: "local",
			};
			layoutHistory.push(layout);
			accentHistory.push(style.accent);
			styleByKey.set(shot.key, styleByKey.get(shot.key) || style);
			shots.push(style);
		});
		const lineDirections = {};
		lines.forEach((line, index) => {
			const held = heldWordIndex(line);
			if (held >= 0) lineDirections[index] = { emph: [held] };
		});
		// Every shot shows its accent: one without a held word emphasises its longest-sung word.
		for (const shot of shots) {
			let best = null;
			let marked = false;
			for (let index = shot.from; index <= shot.to && !marked; index += 1) {
				marked = !!lineDirections[index];
				lines[index].words.forEach((word, position) => {
					if (graphemeCount(word.text) < 2 || !/[\p{L}\p{N}]/u.test(word.text)) return;
					const sung = word.end - word.start;
					if (!best || sung > best.sung) best = { index, position, sung };
				});
			}
			if (!marked && best) lineDirections[best.index] = { emph: [best.position] };
		}
		const refined = refineShots(shots, lineDirections, lines, { ...options, tempo, energy, mood });
		return { version: VERSION, source: "local", coverage: 0, mood, tempo, palette: null, shots: refined.shots, lines: refined.lines, shapes: {} };
	};


	const toIndex = (value) => {
		const number = Number(value);
		return Number.isInteger(number) ? number : NaN;
	};

	/**
	 * Moves cuts off lines sung into each other (shots in order, covering
	 * every line): the next lines join the shot while it has room, otherwise
	 * its last lines go over to the next shot (which is split again later, at
	 * a cut between lines that are not sung into each other). A shot left
	 * empty goes.
	 */
	const keepVoicesTogether = (shots, lines) => {
		const result = shots.map((shot) => ({ ...shot }));
		const room = (shot) => (MAX_LINES[shot.layout] || 6) - (shot.to - shot.from + 1);
		for (let index = 0; index + 1 < result.length; index += 1) {
			const before = result[index];
			let after = result[index + 1];
			while (after && room(before) > 0 && singsInto(lines[before.to], lines[after.from])) {
				before.to += 1;
				after.from += 1;
				if (after.from > after.to) {
					result.splice(index + 1, 1);
					after = result[index + 1];
				}
			}
			while (after && before.to > before.from && singsInto(lines[before.to], lines[after.from])) {
				before.to -= 1;
				after.from -= 1;
			}
		}
		return result;
	};
	const hexColor = (value) => {
		const text = String(value ?? "").trim();
		return /^#[0-9a-f]{6}$/i.test(text) ? text.toLowerCase() : null;
	};

	/**
	 * The kit an AI answer built its edit on: the choices it named in "kit"
	 * and the ones its shots used, each checked against the vocabulary.
	 */
	const kitOf = (raw) => {
		const named = raw?.kit && typeof raw.kit === "object" ? raw.kit : {};
		const kit = {};
		for (const [kind, key, names] of [["layout", "layouts", LAYOUTS], ["enter", "enters", ENTERS], ["fx", "fx", FX], ["accent", "accents", ACCENTS], ["exit", "exits", EXITS], ["hold", "holds", HOLDS]]) {
			const set = new Set();
			for (const name of Array.isArray(named[key]) ? named[key] : []) if (names.includes(name)) set.add(name);
			for (const shot of Array.isArray(raw?.shots) ? raw.shots : []) if (names.includes(shot?.[kind])) set.add(shot[kind]);
			kit[kind] = set;
		}
		return kit;
	};

	/**
	 * A complete direction from an AI answer. Shots must be in order and may
	 * not overlap; lines no AI shot covers get the local director's shots.
	 */
	const normalizeDirection = (raw, model, options = {}) => {
		const lines = Array.isArray(model) ? model : [];
		const local = localDirection(lines, options);
		if (!raw || typeof raw !== "object" || Array.isArray(raw) || !lines.length) return local;
		const count = lines.length;
		const custom = shapes()?.sanitizeShapes?.(raw.shapes) || {};
		const knownMotif = (name) => !!custom[name] || shapes()?.NAMES?.includes(name);
		const localShotAt = (index) => local.shots.find((shot) => shot.from <= index && index <= shot.to);

		const aiShots = [];
		let lastTo = -1;
		for (const item of (Array.isArray(raw.shots) ? raw.shots : []).slice(0, 120)) {
			if (!item || typeof item !== "object") continue;
			let from = toIndex(item.from ?? item.lines?.[0]);
			let to = toIndex(item.to ?? item.lines?.[1] ?? item.from);
			if (!Number.isInteger(from) || !Number.isInteger(to)) continue;
			from = Math.max(from, lastTo + 1);
			to = Math.min(to, count - 1);
			if (from > to || from >= count) continue;
			const fallback = localShotAt(from);
			const layout = LAYOUTS.includes(item.layout) ? item.layout : fallback.layout;
			const motifs = (Array.isArray(item.motifs) ? item.motifs : [])
				.map((name) => String(name ?? "").trim().toLowerCase())
				.filter((name, index, list) => knownMotif(name) && list.indexOf(name) === index)
				.slice(0, MAX_SHOT_MOTIFS);
			const shotText = squash(lines.slice(from, to + 1).map((line) => line.text).join(""));
			const echoText = typeof item.echo === "string" ? item.echo.trim() : "";
			const echo = echoText && graphemeCount(echoText) <= MAX_ECHO_LENGTH && shotText.includes(squash(echoText)) ? echoText : null;
			const dutch = Number(item.dutch);
			const flag = (value, fallbackValue) => (typeof value === "boolean" ? value : fallbackValue);
			// Thin type no longer exists (it read badly over video): older answers asking for it get the heavy face.
			const type = TYPES.includes(item.type) ? item.type : item.type === "thin" ? "impact" : fallback.type;
			aiShots.push({
				from,
				to,
				layout,
				enter: ENTERS.includes(item.enter) ? item.enter : fallback.enter,
				fx: FX.includes(item.fx) ? item.fx : fallback.fx,
				accent: ACCENTS.includes(item.accent) ? item.accent : fallback.accent,
				exit: EXITS.includes(item.exit) ? item.exit : fallback.exit,
				hold: HOLDS.includes(item.hold) ? item.hold : fallback.hold,
				split: SPLITS.includes(item.split) ? item.split : fallback.split,
				interlude: INTERLUDES.includes(item.interlude) ? item.interlude : null,
				type,
				serif: flag(item.serif, item.type === "serif"),
				upper: flag(item.upper, false),
				bars: flag(item.bars, false),
				rule: flag(item.rule, false),
				dutch: Number.isFinite(dutch) ? Math.round(clamp(dutch, -12, 12)) : fallback.dutch,
				motifs: Array.isArray(item.motifs) ? motifs : fallback.motifs,
				echo,
				source: "ai",
				// The look the AI gave the shot itself (not what was filled in for it): shots in a row with one look run on.
				look: [item.layout, item.fx, item.accent, item.exit].every((value) => typeof value === "string" && value)
					? [layout, item.fx, item.accent, item.exit, item.type || ""].join("|") : "",
			});
			lastTo = to;
		}
		// Shots in a row that the AI gave one look (a chorus set line by line, the same composition, effect, accent
		// and exit) are one composition running on: they are merged as far as it holds lines and keeps them on screen
		// (not across an interlude), so the look is not broken up by the rule that no composition follows itself.
		const runs = [];
		for (const shot of aiShots) {
			const before = runs[runs.length - 1];
			const alike = !!before && before.to + 1 === shot.from && !!shot.look && shot.look === before.look;
			if (alike && shot.to - before.from + 1 <= (MAX_LINES[before.layout] || 6)
				&& lines[shot.from].start - lines[before.to].end < REST_GAP_MS && screenSpan(lines, before.from, shot.to) <= MAX_SHOT_MS) {
				before.to = shot.to;
				before.motifs = [...new Set([...before.motifs, ...shot.motifs])].slice(0, MAX_SHOT_MOTIFS);
				before.echo = before.echo || shot.echo;
				before.interlude = shot.interlude || before.interlude;
				continue;
			}
			runs.push(shot);
		}
		aiShots.splice(0, aiShots.length, ...runs);
		// Ones that cannot be merged (their lines would stay on screen too long) run on as the same composition.
		aiShots.forEach((shot, index) => {
			const before = aiShots[index - 1];
			if (!before || before.to + 1 !== shot.from || !shot.look || shot.look !== before.look) return;
			shot.continued = true;
			shot.type = before.type;
			shot.split = before.split;
		});

		// Fill what the AI left out with the local shots, clipped to the gaps.
		const filled = [];
		let cursor = 0;
		const pushLocal = (from, to) => {
			for (const shot of local.shots) {
				const start = Math.max(from, shot.from);
				const end = Math.min(to, shot.to);
				if (start <= end) filled.push({ ...shot, from: start, to: end, layout: end - start + 1 > MAX_LINES[shot.layout] ? "column" : shot.layout });
			}
		};
		for (const shot of aiShots) {
			if (shot.from > cursor) pushLocal(cursor, shot.from - 1);
			filled.push(shot);
			cursor = shot.to + 1;
		}
		if (cursor < count) pushLocal(cursor, count - 1);

		// A cut between lines sung into each other would hide the voice still
		// singing: the line moves to the shot that has room for it.
		const joined = keepVoicesTogether(filled, lines);

		// Long shots are split into compositions the layout can hold and that leave the screen within
		// MAX_SHOT_MS, away from voices sung into the next line.
		const split = [];
		for (const shot of joined) {
			const limit = MAX_LINES[shot.layout] || 6;
			for (let from = shot.from; from <= shot.to;) {
				let to = Math.min(shot.to, from + limit - 1);
				while (to > from && screenSpan(lines, from, to) > MAX_SHOT_MS) to -= 1;
				for (let end = to; to < shot.to && end > from; end -= 1) {
					if (!singsInto(lines[end], lines[end + 1])) {
						to = end;
						break;
					}
				}
				split.push({ ...shot, from, to, enter: from === shot.from ? shot.enter : "pan", continued: from !== shot.from || shot.continued === true });
				from = to + 1;
			}
		}
		// However the AI asked, serif shots stay rare.
		const shots = limitSerif(split);
		if (shots.length && shots[0].enter === "cut") shots[0].enter = "push";

		const covered = new Set();
		for (const shot of shots) {
			if (shot.source !== "ai") continue;
			for (let index = shot.from; index <= shot.to; index += 1) covered.add(index);
		}
		const lineDirections = {};
		for (const [key, value] of Object.entries(local.lines)) {
			if (!covered.has(Number(key))) lineDirections[key] = value;
		}
		for (const item of (Array.isArray(raw.lines) ? raw.lines : []).slice(0, 400)) {
			const index = toIndex(item?.n ?? item?.line ?? item?.index);
			if (!Number.isInteger(index) || index < 0 || index >= count) continue;
			const words = lines[index].words.length;
			const emph = (Array.isArray(item.emph) ? item.emph : [])
				.map(toIndex)
				.filter((value, position, list) => Number.isInteger(value) && value >= 0 && value < words && list.indexOf(value) === position)
				.slice(0, 2);
			const entry = {};
			if (emph.length) entry.emph = emph;
			if (FX.includes(item.fx)) entry.fx = item.fx;
			if (Object.keys(entry).length) lineDirections[index] = entry;
		}

		const palette = (Array.isArray(raw.palette) ? raw.palette : []).map(hexColor).filter(Boolean).slice(0, 3);
		const mood = MOODS.includes(raw.mood) ? raw.mood : local.mood;
		// However the AI chose, hits stay rare and the choices keep moving, within the kit the AI built the edit on.
		const refined = refineShots(shots, lineDirections, lines, { ...options, tempo: local.tempo, mood, kit: covered.size ? kitOf(raw) : null });
		return {
			version: VERSION,
			source: covered.size ? "ai" : "local",
			coverage: covered.size / count,
			mood,
			concept: typeof raw.concept === "string" ? raw.concept.slice(0, 200) : "",
			// Tempo is measured, never taken from the AI.
			tempo: local.tempo,
			palette: palette.length ? palette : null,
			shots: refined.shots,
			lines: refined.lines,
			shapes: custom,
		};
	};

	/**
	 * What the AI reads: numbered lines with their words, timing and
	 * translation, and what the song's structure and sound say about each:
	 * its energy (0 to 9 against the rest of the song, from options.energy),
	 * whether it belongs to a recurring block (a chorus), the earlier line it
	 * repeats, the word held over a long note and the other voices singing
	 * with it.
	 */
	const promptLines = (model, options = {}) => {
		const lines = Array.isArray(model) ? model : [];
		const energy = Array.isArray(options.energy) && options.energy.length === lines.length ? options.energy : null;
		const counts = new Map();
		for (const line of lines) counts.set(squash(line.text), (counts.get(squash(line.text)) || 0) + 1);
		const recurs = lines.map((line) => counts.get(squash(line.text)) > 1);
		const firstSeen = new Map();
		return lines.slice(0, MAX_PROMPT_LINES).map((line, index, list) => {
			const key = squash(line.text);
			if (!firstSeen.has(key)) firstSeen.set(key, index);
			const first = firstSeen.get(key);
			const held = heldWordIndex(line);
			return {
				n: index,
				words: line.words.map((word) => word.text),
				start: Math.round(line.start / 100) / 10,
				duration: Math.round((line.end - line.start) / 100) / 10,
				pause: Math.round((index ? line.start - list[index - 1].end : line.start) / 100) / 10,
				translation: typeof line.translation === "string" ? line.translation.slice(0, 80) : "",
				energy: energy && Number.isFinite(Number(energy[index])) ? Math.round(clamp(Number(energy[index]), 0, 1) * 9) : null,
				chorus: recurs[index] && (recurs[index - 1] === true || recurs[index + 1] === true),
				repeats: first < index ? first : null,
				held: held >= 0 ? held : null,
				voices: (line.backing || []).length,
			};
		});
	};

	/**
	 * The shots the song's structure suggests (groupShots: cut at sections,
	 * long pauses and the edges of recurring blocks, returning sections cut
	 * as the first time), for the AI to follow or improve on.
	 */
	const promptShots = (model) => groupShots((Array.isArray(model) ? model : []).slice(0, MAX_PROMPT_LINES))
		.map((shot) => ({ from: shot.from, to: shot.to, chorus: shot.chorus === true, repeated: shot.repeated === true }));

	const vocabulary = () => ({
		moods: [...MOODS],
		layouts: [...LAYOUTS],
		enters: [...ENTERS],
		fx: [...FX],
		accents: [...ACCENTS],
		types: [...TYPES],
		motifs: [...(shapes()?.NAMES || [])],
		exits: [...EXITS],
		splits: [...SPLITS],
		interludes: [...INTERLUDES],
		holds: [...HOLDS],
		maxLines: { ...MAX_LINES },
	});

	// What each tempo asks of the edit (part of the prompt).
	const TEMPO_NOTES = Object.freeze({
		slow: 'a slow song (ballad): let it breathe. Long, smooth camera moves (drift, fade, crane, orbit, push, pan, rise), soft entrances (glide, lift, blur, rise, wipe, open, track, wave, cascade, stretch, door), impact type with serif on the tender words (a serif shot or two at most), hero, column, corners, frame, margin, anamorph, seal, wave, crawl, carousel, constellation, stairs and swell shots, glow, gradient, underline and circle accents, rules and letterbox bars for the big lines; no whip, cut, glitch, pop, zoom or slam.',
		mid: 'a mid-tempo song: mix glides with a few bold turns (roll, twist, crane, swoop, orbit, tumble, through, hop, corkscrew, panel at section changes); lift, rise, swing, door, skew, open, cascade, ripple, flip, assemble, blur, wipe and only now and then pop; impact type, serif for a few key words; a kit drawn from compositions like lockup, chain, fill, anamorph, rails, carousel, reel, stairs, strip, split, radial, zigzag, wave, grid, constellation, corners and wall.',
		fast: 'a fast song: snappy and driving. Whip, twist, hop, corkscrew, spin, swoop, tumble and through between shots (panel or cut only at a big section change); smear, skew, slide, ripple, lift, swing, bounce, glitch and flicker words, with slam or zoom saved for the few loudest hits; reel, radial, strip, grid, collage, tower, carousel, flash, fill, lockup, marquee and bleed shots; impact type (often upper case), sticker, extrude, spark and trail accents, strong tilts.',
		rap: 'a rap or very dense song: keep up with the flow. type, slide, smear, skew, ripple, glitch and flicker words, slam only on a couple of punchlines; flash, lockup, chain, tower, grid, reel, collage, split, stairs and tunnel shots; whip, hop, twist and the odd cut between them; impact type, extrude, spark and sticker accents.'
	});

	/**
	 * The prompt an AI provider answers with a direction (normalizeDirection
	 * checks the answer). Desktop sends it through AIAddonManager; the mobile
	 * apps send it through their own providers.
	 */
	const buildPrompt = ({ title = "", artist = "", lines = [], cuts = [], vocabulary: custom = null, tempo = null, language = "" } = {}) => {
		const vocab = { ...vocabulary(), ...(custom && typeof custom === "object" ? custom : {}) };
		const list = (values) => (Array.isArray(values) ? values : []).join('|');
		const formatted = (Array.isArray(lines) ? lines : []).map((line) => {
			const words = (Array.isArray(line?.words) ? line.words : []).map((word) => String(word ?? '').replace(/\s+/g, ' ').trim()).join(' | ');
			const pause = Number(line?.pause) >= 2.5 ? ' (pause ' + Number(line.pause).toFixed(1) + 's)' : '';
			const translation = line?.translation ? ' -> ' + String(line.translation).replace(/\s+/g, ' ').trim() : '';
			// What the song says about the line (promptLines): its energy, a chorus block, a repeat, a held word, other voices.
			const facts = [
				line?.energy !== null && line?.energy !== undefined && Number.isFinite(Number(line.energy)) ? 'energy ' + Math.round(Number(line.energy)) : '',
				line?.chorus ? 'chorus' : '',
				Number.isInteger(line?.repeats) ? '= #' + line.repeats : '',
				Number.isInteger(line?.held) ? 'held ' + line.held : '',
				Number(line?.voices) > 0 ? 'voices ' + Number(line.voices) : '',
			].filter(Boolean);
			return '#' + line.n + ' [' + Number(line.start || 0).toFixed(1) + 's ' + Number(line.duration || 0).toFixed(1) + 's]' + pause + ' ' + words + translation + (facts.length ? ' {' + facts.join(', ') + '}' : '');
		}).join('\n');
		const max = vocab.maxLines || MAX_LINES;
		const limits = Object.entries(max).filter(([, most]) => Number(most) < Math.max(...Object.values(max))).map(([name, most]) => name + ' at most ' + most).join(', ');
		const tempoName = TEMPO_NOTES[tempo?.tempo] ? tempo.tempo : 'mid';
		const tempoFacts = [
			Number.isFinite(Number(tempo?.sps)) && Number(tempo.sps) > 0 ? Number(tempo.sps).toFixed(1) + ' syllables per second' : '',
			Number.isFinite(Number(tempo?.bpm)) && Number(tempo.bpm) > 0 ? Math.round(Number(tempo.bpm)) + ' BPM' : ''
		].filter(Boolean).join(', ');
		const suggested = (Array.isArray(cuts) ? cuts : [])
			.filter((cut) => Number.isInteger(cut?.from) && Number.isInteger(cut?.to))
			.map((cut) => cut.from + '-' + cut.to + (cut.chorus ? ' C' : '') + (cut.repeated ? ' R' : ''))
			.join(', ');

		return 'You are a motion-graphics director with thirty years of experience cutting kinetic-typography lyric videos (the best After Effects and Alight Motion typography edits). Direct a full edit of this song: one with a clear idea, a visual language of its own and a shape that follows the song, not a sampler of every effect.\n\n'
			+ 'How the renderer works: consecutive lyric lines are grouped into SHOTS. Each shot is one composition of its lines in 3D space over the music video, and the camera flies, tilts, rolls and orbits from line to line while the video turns with it. Lines are not shown as a lyric sheet: a line\'s faint outline peeks in just before it is sung, each word appears as solid type the moment it is sung, the line keeps moving while it is held (its hold), and once the next line is under way it leaves with the shot\'s exit; at most the current line and the one before it are on screen. Every script gets matching display faces (Korean, Japanese, Chinese, Latin, Cyrillic, Arabic, Thai, Devanagari, Bengali...). You decide the grouping, the composition, the camera moves, the word animation, type, emphasis and the motifs; the renderer does the layout and timing.\n\n'
			+ 'Song: "' + String(title || '').trim() + '"' + (artist ? ' by ' + String(artist).trim() : '') + (language ? ' (language: ' + String(language) + ')' : '') + '\n'
			+ 'Tempo: ' + tempoName + (tempoFacts ? ' (' + tempoFacts + ')' : '') + ' - ' + TEMPO_NOTES[tempoName] + '\n'
			+ 'Lines (#n [start, length] words separated by " | ", then the translation after "->" when known, then in {} what the song says about the line: energy 0-9 = how loud and dense it is against the rest of the song (measured from the audio when known); chorus = part of a block of lines that recurs; = #k = the same words as line k; held i = word i is sung over a long note; voices k = other voices sing with it):\n'
			+ formatted + '\n'
			+ (suggested ? 'Suggested shots from the song\'s structure (cut at its sections, long pauses and the edges of recurring blocks; C = a recurring chorus block, R = the return of an earlier block): ' + suggested + '\n' : '')
			+ '\n'
			+ 'How to direct, in this order (write the first three into your answer, briefly):\n'
			+ '1. concept: one sentence, the visual idea of this edit, taken from the words and the sound (say "neon night drive: rails and grids, neon accents, whips between shots" or "a diary on a quiet night: corners and margins, handwriting accents, soft wipes"). Everything after follows it.\n'
			+ '2. kit: the song\'s own visual language, picked before any shot for its mood, tempo and concept: 6 to 9 layouts, 4 to 6 entrances, 5 to 7 fx, 3 to 5 accents, 4 to 6 exits, 3 to 5 holds and 0 to 4 motifs. Nearly every shot draws on the kit; step outside it only for the bridge or the single biggest moment. An edit feels designed when it keeps coming back to its kit, not when every shot changes everything; a kit that fights the song (dreamy waves in a metal song, slams in a lullaby) is the worst mistake.\n'
			+ '3. sections: name the parts of the song (intro, verse, pre-chorus, chorus, bridge, final chorus, outro) from the lines, the pauses and the chorus marks, and give each its role. Verses carry the story: clean and readable (lockup, column, corners, frame, margin, chain, stairs, rails, slot), gentle or crisp fx, little decoration. A pre-chorus builds: swell, stairs, tunnel, a push hold, the energy rising shot by shot. Every chorus has the signature look of the song and keeps it each time it returns (the same layout, fx, accent and exit; a later chorus may add bars or a stronger entrance), the final chorus the biggest. The bridge is the contrast: something the song has not shown yet, often quieter. The loudest lines (highest energy) get the big compositions (hero, wall, fill, poster, bleed, tower, flash) and the few hits; quiet lines get air.\n'
			+ '4. shots: follow the suggested shots unless the meaning asks for another cut. A shot is a composition the camera explores: it holds the 2 to 4 lines that belong together (a couplet, a run of the chorus); one-line shots are for the few biggest moments, never a whole song of them, and lines that share one look go in one shot rather than a row of one-line shots with the same settings. For each shot pick from the kit what fits its lines: their energy, meaning and rhythm. The word animation follows the vocal: smooth for held and tender lines, letter by letter for quick syllables, a hit only on the loudest words. Long lines go in phrases, sharp rhythmic lines now and then word by word (split).\n'
			+ '5. lines: emphasise the words that carry each line (the image, the name, the verb that turns it, a held word): 0 to 2 per line, not on every line, chosen for meaning, never by position out of habit.\n\n'
			+ 'Return ONLY one JSON object, no markdown:\n'
			+ '{"concept": "...",\n'
			+ ' "kit": {"layouts": ["..."], "enters": ["..."], "fx": ["..."], "accents": ["..."], "exits": ["..."], "holds": ["..."], "motifs": ["..."]},\n'
			+ ' "sections": [{"from": 0, "to": 3, "name": "verse 1"}],\n'
			+ ' "mood": "' + list(vocab.moods) + '",\n'
			+ ' "palette": ["#rrggbb", "#rrggbb"],\n'
			+ ' "shots": [{"from": 0, "to": 2, "layout": "...", "enter": "...", "fx": "...", "accent": "...", "exit": "...", "hold": "...", "split": "line", "interlude": "...", "type": "impact", "serif": false, "upper": false, "bars": false, "rule": false, "dutch": 0, "motifs": ["..."], "echo": "..."}],\n'
			+ ' "lines": [{"n": 0, "emph": [1], "fx": "..."}],\n'
			+ ' "shapes": {"name": {"d": "M10 10 L90 50 L10 90 Z", "style": "fill"}}}\n\n'
			+ 'What every choice looks like:\n'
			+ '- layout, flat compositions: column = stacked lines the camera glides down (verses, storytelling); stairs = lines stepping down a diagonal staircase (a thought unfolding, descending or rising lines); strip = lines side by side on one long strip with a track drawn under them while the camera travels sideways (lists, journeys, a run of short lines; needs 2+ short lines); split = two columns facing each other across a centre line, lines alternating sides (duets, question and answer, contrasts; needs 2+ lines); swell = every line larger than the last (a build into the chorus, a rising plea; needs 2+ lines); zigzag = lines alternate horizontal and vertical and the screen turns 90 degrees each line (flowing, playful); spiral = 3 or 4 lines around a square while the screen turns a full circle (building, hypnotic); radial = 3+ lines radiating from a hub like spokes, the screen turning to read each (circling thoughts, obsession, festive); wall = a justified poster where short lines become huge (choruses, hooks, repeated phrases); collage = 3+ lines scattered with tilts and different sizes (busy, chaotic); hero = one or two short lines filling the screen (titles, punchlines, the biggest moments); tower = each line set in two justified rows of the same width (rap punchlines, chants, short hard lines).\n'
			+ '- layout, compositions in depth: tunnel = lines one behind another and the camera flies forward through them (driving, urgent); carousel = lines around a drum turning about its upright axis, the camera swinging round to face each while its neighbours curve away (turning points, memories going round; needs 2+ lines); reel = lines on a drum that rolls like a slot-machine reel, sung lines rolling away over the top (momentum, counting, fate; needs 3+ lines); crawl = lines lying on a plane tilted into the distance like an opening crawl (storytelling, intros, cinematic verses; needs 3+ lines).\n'
			+ '- layout, one thought at a time (after the best typography edits; use these often, they keep the screen clean and snappy): slot = one line at a time in the same place inside a dark band drawn across the screen, each line replacing the last (quick exchanges, lists, a run of short lines; needs 2+ lines); poster = one line at a time as large as the screen allows on a flat colour field that cuts to another colour with every line (hooks, shouts, the loudest lines; short lines only); spread = one line at a time with its words set apart like stepping stones across the width, each landing on its beat (lines of 2 to 6 clearly sung words); wordwall = the lines repeated across the whole screen as slanted outlines, each filling in where it is sung (chants, repeated phrases, choruses; needs 2+ short lines); arch = lines bent round a great circle like the lettering on a seal while the screen turns (cycles, seasons, going round; needs 2+ lines); pillar = lines set upright like banners, read top to bottom (only lines written wholly in Korean, Japanese or Chinese; poetic, traditional, quiet or solemn lines). The one-at-a-time compositions (slot, poster, spread) cannot hold lines sung over each other.\n'
			+ '- layout, editorial and graphic compositions: wave = the lines ride one long wave across the screen, each tilted with the slope it sits on, the camera rolling along the swell (flowing, sea, longing, a melody that rises and falls; needs 2+ lines); constellation = the lines scattered wide like stars on a chart, a thin line drawn from each to the next as it is sung (dreams, night, memories joined up, connections; needs 2+ lines); grid = a modular poster grid, each line set tight in its own cell with rules drawn between the cells (lists, statements, cool and graphic, rap; needs 2+ lines); corners = small type in the corners of the frame with the middle left open to the video (quiet verses, intros, intimate lines, letting the video speak; needs 2+ lines).\n'
			+ '- layout, from the motion-typography canon: lockup = one line at a time, its words packed into a tight block of one or two rows, each word sized by its stress (the key word huge, the little words small) (hooks, punchlines, any line with one word that matters); flash = one word at a time in the same place, each replacing the last on its beat, the little words small and the key words huge (fast, dense, rap lines, countdowns, lists; needs lines of 2+ words); chain = each line attached to the edge of the one before, every other line turned a quarter so the words build a mosaic and the camera rolls with them (storytelling, spoken flows, long verses); fill = one line at a time in capitals that always fill the width: each sung word stretches the line and the whole line rescales (shouted hooks, chants, statements; short lines); seal = one line at a time inside a ring like a stamp or a badge, the ring spinning in (titles, names, the hook, a declaration); frame = one line at a time with its words placed round the edges of the frame, the middle left open to the video (intimate, airy lines, a singer in the middle of the picture); margin = the lines set upright along the left and right edges of the screen, stepping inward (Japanese, Korean and Chinese read top to bottom; quiet, cool, cinematic verses); marquee = one line at a time with copies of it streaming across the screen in rows, alternate rows the other way (choruses, chants, repeated phrases, driving hooks); anamorph = the words of a line hang at different depths and only line up into the line from where the camera looks at it, breaking apart as the camera moves on (dreamlike, surreal, spatial verses); bleed = one short line at a time so large it runs off the screen, the view sliding along it as it is sung (huge statements, single shouted words); rails = lines riding a slanted grid of rules like a Saul Bass title, each sliding along its rule into place (cool, retro, cinematic, jazzy lines). Lockup, flash, fill, seal, frame, marquee and bleed cannot hold lines sung over each other.\n'
			+ '- enter (' + list(vocab.enters) + '): how the camera reaches the shot. pan = sideways, drop / rise = down / up, drift = a slow diagonal glide, crane = the camera lifts up and over to the next shot, roll = the screen turns 90 degrees, twist = the screen turns 45 degrees on a diagonal move, flip = turns 180 degrees, spin = a full barrel roll, corkscrew = dolly forward while turning a full circle, whip = a very fast blurred pan, hop = the camera leaps back and across, seeing both shots on its way, orbit = the camera swings around in 3D, swoop = it banks down and round into the next shot, tumble = it somersaults over the top, push = dolly forward through the previous shot, pull = dolly back out, through = dive into the last sung word and come out in the next shot, fade = a slow dissolve in place, panel = a colour panel sweeps across and reveals the next shot, cut = hard cut with a flash, iris = the next shot opens out of a growing circle in place, open = the next shot opens out of a thin band across the middle. Big moves (iris, open, roll, twist, flip, spin, corkscrew, orbit, swoop, tumble, hop, panel, cut, through) belong at section changes.\n'
			+ '- fx (' + list(vocab.fx) + '): how sung words appear. Gentle: glide = drifts in from the side, a breath; rise = floats up; lift = rises out of a mask at its own baseline (the classic clean reveal); blur = focus pull; wipe = revealed left to right; open = opens from its middle outwards; track = letters close in from wide spacing; wave = letters rise and float; cascade = letters fall softly into place one after another; stretch = grows over a held note; brush = revealed by a slanted soft stroke, like a brush pulled across; shutter = opens from a thin line across its middle. Lively: door = turns in from its first letter like a door; swing = hangs from its first letter and swings down into place; skew = leans in like a brush stroke and straightens; flip = 3D flip-up; spin = 3D card spin; slide = sweeps in sideways; smear = a fast motion smear that snaps into shape; type = letter by letter; assemble = scattered letters fly together; swirl = letters spiral in; ripple = each letter grows up from the baseline in a ripple; drop = letters bounce down; bounce = letters spring up; rain = letters start scattered high and low and drop or rise into one line; decode = each letter flickers through random characters and locks onto the right one. Hits: pop = scale up with a bounce; glitch = RGB-split glitch; flicker = letters flicker on like neon; slam = smash in big with the camera shaking; zoom = fly in from the camera. Match the vocal and the tempo. Set fx per shot and override it in "lines" only where a line differs.\n'
			+ '- type (' + list(vocab.types) + '): the face. impact = heavy display, the default for nearly every shot (it stays readable over video); serif = elegant Myeongjo / Mincho / Didone for a whole shot, rarely: a quiet bridge or the most tender lines, at most about one shot in seven and never two shots in a row; round = soft and friendly, only for playful songs. Never ask for thin or light type.\n'
			+ '- serif: true sets only the shot\'s emphasised words in the serif against the heavy type. Use it for a few poignant words, not every shot.\n'
			+ '- upper: true sets Latin, Cyrillic and Greek words in capitals (impact shots, hooks). bars: true brings cinematic letterbox bars for the shot (big, emotional moments). rule: true draws a thin line under each line as it is sung (quiet, elegant shots).\n'
			+ '- accent (' + list(vocab.accents) + '): how emphasised words stand out. color = accent colour; outline = hollow outlined letters; underline = a line drawn under; mark = a highlighter stroke; spark = sparks bursting around the word; glow = white neon glow that throbs with the beat (night, longing, electric); gradient = filled with a two-colour gradient (dreamy, pop); stamp = an outlined frame slammed on like a rubber stamp (declarations, punchlines); circle = circled by hand with a pen (the word that matters, tender or pointed); extrude = solid 3D block letters (retro, loud, confident); sticker = coloured letters with a thick white edge, slightly tilted (playful, cute, K-pop); script = the word alone in brush handwriting against the heavy type (asides, feelings, the personal word); giant = the word blown up far larger than its line (the one word that matters most; shouts); trail = outlined copies stepping out from behind the word (echoes, repeats, reverb); scribble = a wobbling pen line scrawled under it (casual, nervous, handwritten); bracket = a rule either side closing in on it (precise, cool, a word singled out); neon = a hollow glowing tube of the accent colour that throbs with the beat (night, clubs, retro, electric); chrome = polished metal letters with a light sweeping across them (80s, flex, glory, the title word); spectrum = coloured copies of the word fanned out behind it (pop, retro, euphoria, a word that echoes). Keep a returning section on its accent.\n'
			+ '- exit (' + list(vocab.exits) + '): how a sung line leaves once the next line is under way (in one-at-a-time compositions, as the next line comes in in its place). Whole words: fade = melts away; rise = floats up and fades; fall = drops away with gravity; scatter = its words fly apart; shrink = shrinks away; sweep = swept off sideways; blur = goes out of focus; wipe = wiped off; flip = flips away; stretch = squashed flat and gone; glitch = breaks up in digital jitter; drip = melts down and runs away; sink = sinks out of sight behind its own baseline (clean, editorial); shut = closes to a thin line across its middle (crisp, techno); zoom = flies at the camera out of focus (impact, a drop); twist = turns away and shrinks to a point (playful, dizzy); dash = smeared off sideways at speed (fast, sporty); hinge = swings down from its first letter like a sign losing a screw, then drops (comic, broken, a letdown). Letter by letter: crumble = its letters drop off one after another (falling apart, loss); dissolve = its letters go out one by one at random (fading memories, dreamy); erase = deleted from the end letter by letter like a cursor going back (regret, taking words back, chat-like); burst = its letters blown apart from the middle (explosive hooks, shouts); evaporate = its letters rise away like steam (tender, warm, sad endings); tumble = each letter tips over forwards like dominoes (rhythmic, quirky); scramble = its letters flicker through random characters and blink out (cyber, glitchy, secrets). Tender parts leave gently (fade, rise, blur, shrink, wipe, sink, dissolve, evaporate), driving parts get thrown off (fall, scatter, sweep, flip, stretch, zoom, dash, burst, crumble, shut). A kit mixes whole-word and letter-by-letter exits; keep a returning section on its exit.\n'
			+ '- hold (' + list(vocab.holds) + '): how a line keeps moving while it is held, so the screen never freezes: grow = slowly grows; drift = slides slowly along; float = its words bob gently; lean = slowly tilts; push = comes slowly toward the camera; breathe = pulses with the beat; wobble = rocks and leans like jelly (playful, drunk, dizzy lines); swivel = turns slowly in depth like a sign on a pole; still = holds still (rarely, only for short hard lines in fast songs). Slow songs always need one that moves.\n'
			+ '- split (' + list(vocab.splits) + '): how the shot breaks its lines; a line need not reach the screen all at once. line = each line whole (a very long line is still broken into phrases); phrase = lines of more than three or four words are broken into short phrases of two to four words at their natural breaks, each set, timed and leaving on its own while the camera moves from phrase to phrase (long lines, storytelling, any line too long to read at a glance); word = every word on its own, landing one after another in its own place, the line building up word by word until the next line (punchy, rhythmic lines of two to seven words, hooks, chants, fast songs; never for long dense lines or lines sung over each other). Use phrase for long lines, word now and then where the rhythm is sharp, line for short ones.\n'
			+ '- interlude (' + list(vocab.interludes) + '): only matters when an instrumental break (a long stretch with no singing) follows the shot\'s last line: the scene that plays over the video meanwhile (the lyrics are never shown in a break). pulse = rings bursting from the centre on every beat (anything with a clear beat); eq = equalizer bars dancing to the music (pop, EDM, rock); marquee = the song title in huge rows sliding past each other (anthems, confident songs); orbit = the song\'s motifs orbiting the centre (dreamy, playful, love songs); stripes = diagonal colour bands sweeping past a breathing frame (pop, funk, playful); grid = a neon grid floor rushing at the camera under a striped sun (synth, retro, electronic, night drives); count = big numbers counting down the seconds to the next lyric (build-ups, drops, tension); wave = oscilloscope waves swelling with the music (ballads, ambient, calm). Pick what fits the music in the break, and vary it from break to break.\n'
			+ '- lines: list only lines that need emphasis or their own fx. emph = 0 to 2 word indexes (0-based, in " | " order) that carry the meaning or are held long; they are set larger and take the shot\'s accent. Give nearly every shot at least one emphasised word, or its accent never shows; pick it for meaning (see step 5).\n'
			+ '- dutch: camera tilt in degrees, 0 for calm shots, up to 12 or -12 for energetic ones.\n'
			+ '- motifs: 0 or 1 per shot (2 at a big moment), only where the lines name or imply an image (moon for moon or 月, drop for tears or rain, heart for love, flame for fire); keep a motif with its idea through the song rather than decorating every shot. Library: ' + list(vocab.motifs) + '.\n'
			+ '- shapes: optional, at most 3 custom motifs when the library lacks an image the lyrics need: one SVG path "d" drawn in a 100x100 box with only M L H V C S Q T A Z commands and under 600 characters, style "fill" or "stroke"; use the name in a shot\'s motifs.\n'
			+ '- echo: optional, on about one shot in three: the key word or short phrase people will remember (at most 16 characters), copied exactly from the shot\'s lyrics and shown as a giant outline behind the shot.\n'
			+ '- palette: two vivid accent colours that fit the song and its concept and read well on dark video.\n\n'
			+ 'Rules (the renderer holds the edit to them anyway):\n'
			+ '- shots: cover every line exactly once, in order, without gaps. 1 to ' + Math.max(...Object.values(max)) + ' lines each (' + limits + '). Cut where the song changes section (verse, pre-chorus, chorus, bridge), after long pauses and where the meaning turns; keep lines that answer each other together, and never cut between lines sung over each other (a duet, a call and response). Most shots hold 2 to 4 lines. Background vocals and duet parts are shown with their line automatically.\n'
			+ '- No layout in two shots running (a chorus running on aside) and none in more than about a quarter of the shots; the same for entrances, fx and accents. Repetition belongs to the returning sections, where it is the point.\n'
			+ '- Restraint: most words should arrive smoothly and stay readable. The hits are spice: slam and zoom at most about one shot in eight, only on the loudest moments (a drop, the last chorus, a shouted punchline) of songs with drive, never in two shots running and never in calm, dreamy, melancholic or slow songs; pop, glitch and flicker at most one shot in five and never right after another hit; cut and panel only at a real section change after a pause. A word slammed in again and again stops meaning anything.\n';
	};

	root.ivLyricsMotionDirector = Object.freeze({
		initialized: true,
		VERSION,
		MOODS,
		TEMPOS,
		LAYOUTS,
		ENTERS,
		FX,
		LETTER_FX,
		HARD_FX,
		PUNCHY_FX,
		HARD_ENTERS,
		ACCENTS,
		TYPES,
		EXITS,
		HOLDS,
		SPLITS,
		INTERLUDES,
		MAX_SHOT_MS,
		MAX_LINES,
		PACE,
		tempoOf,
		syllablesOf,
		singsInto,
		localDirection,
		normalizeDirection,
		promptLines,
		promptShots,
		vocabulary,
		buildPrompt,
	});
})(typeof window !== "undefined" ? window : globalThis);

