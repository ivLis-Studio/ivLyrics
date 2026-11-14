// Motion lyrics director: decides how a song is staged.
//
// A direction groups consecutive lyric lines into shots and picks, per shot,
// a composition (layout, one of twenty-three), how the camera reaches it
// (enter), how sung words appear (fx), how emphasised words stand out
// (accent, one of eighteen), the type personality
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
(function IvLyricsMotionDirector(root) {
	"use strict";

	if (root.ivLyricsMotionDirector?.initialized) return;

	const VERSION = 4;
	const MOODS = Object.freeze(["calm", "dreamy", "melancholic", "warm", "playful", "energetic", "intense", "dark"]);
	const TEMPOS = Object.freeze(["slow", "mid", "fast", "rap"]);
	// Flat compositions, then three that sit in depth: carousel and reel wrap the lines round a drum, crawl lays them on a tilted plane.
	const LAYOUTS = Object.freeze([
		"column", "zigzag", "spiral", "wall", "tunnel", "collage", "hero", "tower",
		"stairs", "strip", "split", "swell", "radial", "carousel", "reel", "crawl",
		// After kinetic-typography edits: one thought at a time, flat colour, type as an object.
		"slot", "cards", "poster", "wordwall", "arch", "spread", "pillar",
	]);
	const ENTERS = Object.freeze(["pan", "drop", "rise", "roll", "flip", "push", "pull", "cut", "whip", "spin", "orbit", "tumble", "fade", "through", "panel"]);
	const FX = Object.freeze(["pop", "slide", "rise", "slam", "stretch", "flip", "type", "assemble", "drop", "wave", "blur", "wipe", "glitch", "spin", "zoom", "track", "bounce", "flicker"]);
	// Effects that move single letters; joined scripts get a word-level equivalent.
	const LETTER_FX = Object.freeze(["type", "assemble", "drop", "wave", "track", "bounce", "flicker"]);
	const ACCENTS = Object.freeze([
		"color", "box", "outline", "underline", "mark", "spark", "glow", "gradient", "stamp", "circle", "extrude", "sticker",
		"script", "giant", "trail", "scribble", "bubble", "bracket",
	]);
	// Shot faces. Serif shots are rare (SERIF_SHARE); shot.serif sets only a shot's emphasised words in serif.
	const TYPES = Object.freeze(["impact", "serif", "round"]);
	const SERIF_SHARE = 0.15;
	const SERIF_LINE_SHARE = 0.18;
	const MAX_LINES = Object.freeze({
		column: 6, zigzag: 5, spiral: 4, wall: 6, tunnel: 6, collage: 5, hero: 2, tower: 3,
		stairs: 5, strip: 4, split: 6, swell: 4, radial: 6, carousel: 5, reel: 6, crawl: 6,
		slot: 4, cards: 4, poster: 3, wordwall: 4, arch: 4, spread: 3, pillar: 3,
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
				let full = weight + lineWeight > (section[index] ? 4.6 : 3.6) || (index - from >= 2 && gap >= 1800);
				if (repeated[index] && repeated[index - 1]) {
					// A returning section is cut where it was cut the first time.
					sectionBreak = original[index] !== original[index - 1] + 1;
					full = starts.has(original[index]);
				}
				// Lines sung over each other (a duet, a call and response) stay in one composition.
				if (gap < -200 && !sectionBreak && weight + lineWeight <= 6) full = false;
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
			slot: 0.9, cards: 0.4, poster: 0.6, wordwall: 0.3, arch: 1, spread: 0.8, pillar: 1.1,
		},
		mid: {
			hero: 2, column: 0.7, wall: 0.6, tunnel: 0.8, spiral: 0.8, zigzag: 1, collage: 0.8, tower: 0.5,
			stairs: 0.9, strip: 0.8, split: 0.7, swell: 0.9, radial: 0.8, carousel: 1, reel: 0.9, crawl: 0.8,
			slot: 1, cards: 0.9, poster: 1, wordwall: 0.7, arch: 0.9, spread: 0.9, pillar: 0.9,
		},
		fast: {
			hero: 0.8, column: 0.4, wall: 0.6, tunnel: 0.9, spiral: 0.8, zigzag: 1.1, collage: 1.2, tower: 1.1,
			stairs: 0.9, strip: 1, split: 0.8, swell: 0.9, radial: 1, carousel: 1, reel: 1.1, crawl: 0.5,
			slot: 1.1, cards: 1.1, poster: 1.2, wordwall: 1, arch: 0.6, spread: 0.9, pillar: 0.6,
		},
		rap: {
			hero: 0.3, column: 0.8, wall: 0.6, tunnel: 1.1, spiral: 0.5, zigzag: 0.9, collage: 1.4, tower: 1.5,
			stairs: 1, strip: 0.8, split: 1, swell: 0.6, radial: 0.6, carousel: 0.7, reel: 1.2, crawl: 0.6,
			slot: 1.3, cards: 1, poster: 0.8, wordwall: 1.2, arch: 0.4, spread: 0.6, pillar: 0.3,
		},
	});
	// A composition never follows itself (a returning chorus poster aside), the two before it are
	// unlikely to come straight back, and ones the song has not used yet are favoured.
	const RECENT_PENALTY = Object.freeze([0, 0.45, 0.7]);
	const FRESH_BOOST = 1.5;

	const localLayout = (lines, energy, shot, history, tempo, random) => {
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
			cards: within("cards") ? base.cards : 0,
			poster: count <= MAX_LINES.poster && chars / count <= 16 && !shot.voices ? base.poster * (shot.chorus || shot.repeated ? 1.6 : 1) : 0,
			wordwall: within("wordwall") && chars / count <= 22 ? base.wordwall * (shot.chorus || shot.repeated ? 1.5 : 1) : 0,
			arch: within("arch") && chars / count <= 20 ? base.arch : 0,
			spread: count <= MAX_LINES.spread && longest >= 2 && longest <= 6 && !shot.voices ? base.spread : 0,
			// Upright type suits Korean, Japanese and Chinese lines without Latin words.
			pillar: count <= MAX_LINES.pillar && chars / count <= 14 && lines.every((line) => UPRIGHT_RE.test(line.text) && !(line.backing || []).length) ? base.pillar : 0,
		};
		const open = { ...weights };
		history.slice(-RECENT_PENALTY.length).reverse().forEach((name, back) => {
			if (!weights[name]) return;
			weights[name] *= !back && name === "wall" && (shot.chorus || shot.repeated) ? 0.5 : RECENT_PENALTY[back];
		});
		for (const name of Object.keys(weights)) if (!history.includes(name)) weights[name] *= FRESH_BOOST;
		return weightedPick(random, weights) || weightedPick(random, open) || "column";
	};

	const ENTER_WEIGHTS = Object.freeze({
		slow: {
			section: { fade: 1.4, orbit: 0.9, push: 0.8, pull: 0.6, panel: 0.5, roll: 0.3 },
			line: { pan: 1, rise: 0.9, drop: 0.6, fade: 1.1, push: 0.7, orbit: 0.4 },
		},
		mid: {
			section: { roll: 1, flip: 0.7, orbit: 0.9, panel: 0.7, push: 0.7, through: 0.6, tumble: 0.5, fade: 0.4 },
			line: { pan: 1.1, drop: 0.9, rise: 0.8, roll: 0.5, push: 0.7, pull: 0.4, orbit: 0.4, whip: 0.3 },
		},
		fast: {
			section: { panel: 1, spin: 0.9, flip: 0.8, through: 0.8, tumble: 0.7, roll: 0.7, orbit: 0.5 },
			line: { whip: 1.3, pan: 0.8, drop: 0.9, rise: 0.6, roll: 0.6, spin: 0.4, push: 0.6, tumble: 0.4 },
		},
	});

	const localEnter = (shot, gap, energy, previous, tempo, random) => {
		if (shot.index === 0) return "push";
		const table = ENTER_WEIGHTS[tempo.tempo === "rap" ? "fast" : tempo.tempo] || ENTER_WEIGHTS.mid;
		const weights = { ...(shot.sectionStart ? table.section : table.line) };
		// Hard cuts belong to long pauses and section changes in songs with drive.
		if (shot.sectionStart && gap >= (tempo.tempo === "slow" ? 6000 : 2400)) weights.cut = tempo.tempo === "slow" ? 0.5 : 1.1;
		if (energy >= 0.66) for (const name of ["roll", "spin", "flip", "whip"]) if (weights[name]) weights[name] *= 1.3;
		if (previous && weights[previous]) weights[previous] *= 0.3;
		return weightedPick(random, weights) || "pan";
	};

	const FX_WEIGHTS = Object.freeze({
		slow: { blur: 1.3, rise: 1.1, wipe: 0.9, track: 0.9, wave: 0.7, stretch: 0.6, type: 0.4, flip: 0.2 },
		mid: { pop: 1, rise: 0.9, flip: 0.7, drop: 0.6, assemble: 0.6, blur: 0.6, spin: 0.5, bounce: 0.5, wipe: 0.4, type: 0.5, track: 0.3 },
		fast: { slam: 1, pop: 1, zoom: 0.9, glitch: 0.8, slide: 0.8, spin: 0.6, bounce: 0.6, flicker: 0.6, assemble: 0.5, type: 0.5 },
		rap: { type: 1.2, slide: 1.1, glitch: 0.9, slam: 0.8, flicker: 0.8, zoom: 0.6, pop: 0.6 },
	});

	const localFx = (lines, energy, tempo, random) => {
		const charTimed = lines.every((line) => line.charTimed);
		const joined = lines.some((line) => JOINED_RE.test(line.text));
		const weights = { ...(FX_WEIGHTS[tempo.tempo] || FX_WEIGHTS.mid) };
		if (weights.type) weights.type *= charTimed ? 1.6 : 0.6;
		if (joined) for (const name of LETTER_FX) delete weights[name];
		if (energy >= 0.66) for (const name of ["slam", "zoom", "glitch", "pop"]) if (weights[name]) weights[name] *= 1.4;
		if (energy < 0.3) for (const name of ["blur", "rise", "wave", "wipe"]) if (weights[name]) weights[name] *= 1.3;
		return weightedPick(random, weights) || "pop";
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
			script: 1, scribble: 0.6, bracket: 0.5, giant: 0.3,
		},
		mid: {
			color: 1, box: 0.7, underline: 0.6, mark: 0.6, outline: 0.4, spark: 0.5, glow: 0.6, gradient: 0.7, stamp: 0.5, circle: 0.6, extrude: 0.6, sticker: 0.5,
			script: 0.8, giant: 0.7, trail: 0.5, scribble: 0.6, bubble: 0.5, bracket: 0.5,
		},
		fast: {
			box: 1, spark: 1.2, color: 0.8, mark: 0.6, outline: 0.5, glow: 0.8, gradient: 0.6, stamp: 0.9, circle: 0.4, extrude: 0.9, sticker: 0.8,
			giant: 1, trail: 0.9, bubble: 0.7, bracket: 0.6, script: 0.5, scribble: 0.4,
		},
	});

	/** A shot's accent: never the one just used, more often one the song has not shown yet. */
	const localAccent = (accents, history, random) => {
		const weights = { ...accents };
		[0, 0.6].forEach((penalty, back) => {
			const name = history[history.length - 1 - back];
			if (name && weights[name]) weights[name] *= penalty;
		});
		for (const name of Object.keys(weights)) if (!history.includes(name)) weights[name] *= 1.4;
		return weightedPick(random, weights) || "color";
	};
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
				build: groups[index + 1]?.chorus === true && !shot.chorus,
				voices: members.some((line, offset) => (line.backing || []).some((voice) => voice.role === "duet")
					|| (offset > 0 && line.start < members[offset - 1].end - 200)),
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
		return { version: VERSION, source: "local", coverage: 0, mood, tempo, palette: null, shots, lines: lineDirections, shapes: {} };
	};


	const toIndex = (value) => {
		const number = Number(value);
		return Number.isInteger(number) ? number : NaN;
	};
	const hexColor = (value) => {
		const text = String(value ?? "").trim();
		return /^#[0-9a-f]{6}$/i.test(text) ? text.toLowerCase() : null;
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
				type,
				serif: flag(item.serif, item.type === "serif"),
				upper: flag(item.upper, false),
				bars: flag(item.bars, false),
				rule: flag(item.rule, false),
				dutch: Number.isFinite(dutch) ? Math.round(clamp(dutch, -12, 12)) : fallback.dutch,
				motifs: Array.isArray(item.motifs) ? motifs : fallback.motifs,
				echo,
				source: "ai",
			});
			lastTo = to;
		}

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

		// Long shots are split into compositions the layout can hold.
		const split = [];
		for (const shot of filled) {
			const limit = MAX_LINES[shot.layout] || 6;
			for (let from = shot.from; from <= shot.to; from += limit) {
				split.push({ ...shot, from, to: Math.min(shot.to, from + limit - 1), enter: from === shot.from ? shot.enter : "pan", continued: from !== shot.from });
			}
		}
		// However the AI asked, serif shots stay rare.
		const shots = limitSerif(split).map(({ continued: _continued, ...shot }) => shot);
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
		return {
			version: VERSION,
			source: covered.size ? "ai" : "local",
			coverage: covered.size / count,
			mood: MOODS.includes(raw.mood) ? raw.mood : local.mood,
			// Tempo is measured, never taken from the AI.
			tempo: local.tempo,
			palette: palette.length ? palette : null,
			shots,
			lines: lineDirections,
			shapes: custom,
		};
	};

	/** What the AI reads: numbered lines with their words, timing and translation. */
	const promptLines = (model) => (Array.isArray(model) ? model : []).slice(0, MAX_PROMPT_LINES).map((line, index, list) => ({
		n: index,
		words: line.words.map((word) => word.text),
		start: Math.round(line.start / 100) / 10,
		duration: Math.round((line.end - line.start) / 100) / 10,
		pause: Math.round((index ? line.start - list[index - 1].end : line.start) / 100) / 10,
		translation: typeof line.translation === "string" ? line.translation.slice(0, 80) : "",
	}));

	const vocabulary = () => ({
		moods: [...MOODS],
		layouts: [...LAYOUTS],
		enters: [...ENTERS],
		fx: [...FX],
		accents: [...ACCENTS],
		types: [...TYPES],
		motifs: [...(shapes()?.NAMES || [])],
		maxLines: { ...MAX_LINES },
	});

	root.ivLyricsMotionDirector = Object.freeze({
		initialized: true,
		VERSION,
		MOODS,
		TEMPOS,
		LAYOUTS,
		ENTERS,
		FX,
		LETTER_FX,
		ACCENTS,
		TYPES,
		MAX_LINES,
		PACE,
		tempoOf,
		syllablesOf,
		localDirection,
		normalizeDirection,
		promptLines,
		vocabulary,
	});
})(typeof window !== "undefined" ? window : globalThis);

