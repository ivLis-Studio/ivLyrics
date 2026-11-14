// Motion lyrics director: decides how a song is staged.
//
// A direction groups consecutive lyric lines into shots and picks, per shot,
// a composition (layout), how the camera reaches it (enter), how sung words
// appear (fx), how emphasised words stand out (accent), a camera tilt, the
// motifs that animate around it and an optional giant background word. The
// AI writes one (see AIAddonManager.generateMotionDirection); every AI answer
// is checked here and anything missing or invalid falls back to the local
// director, so the renderer always gets a complete, valid direction.
(function IvLyricsMotionDirector(root) {
	"use strict";

	if (root.ivLyricsMotionDirector?.initialized) return;

	const VERSION = 1;
	const MOODS = Object.freeze(["calm", "dreamy", "melancholic", "warm", "playful", "energetic", "intense", "dark"]);
	const LAYOUTS = Object.freeze(["column", "zigzag", "spiral", "wall", "tunnel", "collage", "hero"]);
	const ENTERS = Object.freeze(["pan", "drop", "rise", "roll", "flip", "push", "pull", "cut"]);
	const FX = Object.freeze(["pop", "slide", "rise", "slam", "stretch", "flip", "type", "assemble", "drop", "wave"]);
	const ACCENTS = Object.freeze(["color", "box", "outline"]);
	const MAX_LINES = Object.freeze({ column: 6, zigzag: 5, spiral: 4, wall: 6, tunnel: 6, collage: 5, hero: 2 });
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

	/** The song's mood from how densely it is sung (the AI reads the words instead). */
	const localMood = (model) => {
		if (!model.length) return "warm";
		const rate = model.reduce((sum, line) => sum + wordsPerSecond(line), 0) / model.length;
		const gaps = model.slice(1).map((line, index) => line.start - model[index].end);
		const pausy = gaps.filter((gap) => gap > 2500).length / Math.max(1, gaps.length);
		if (rate >= 3.4) return "intense";
		if (rate >= 2.5) return "energetic";
		if (rate <= 1.2) return pausy > 0.2 ? "dreamy" : "calm";
		if (rate <= 1.7) return "melancholic";
		return "warm";
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

	const localLayout = (lines, energy, shot, previous, random) => {
		const count = lines.length;
		const chars = lines.reduce((sum, line) => sum + line.chars, 0);
		const seconds = (lines[count - 1].end - lines[0].start) / 1000;
		const weights = {
			hero: count <= 2 && (chars <= 16 || seconds / count >= 3.6) ? 2.2 : 0,
			// Choruses are set big, from their first time; other shots leave the poster to them.
			wall: count <= MAX_LINES.wall ? (shot.chorus || shot.repeated ? 5 : count >= 3 ? 0.6 : 0.2) : 0,
			column: 0.8,
			zigzag: count >= 2 && count <= MAX_LINES.zigzag ? 1 + 0.6 * energy : 0,
			spiral: count >= 3 && count <= MAX_LINES.spiral ? 0.9 : 0,
			tunnel: count >= 2 ? 0.6 + energy : 0,
			collage: count >= 3 && count <= MAX_LINES.collage && energy > 0.4 ? 1 : 0,
		};
		if (previous && weights[previous]) weights[previous] *= previous === "wall" && (shot.chorus || shot.repeated) ? 0.5 : 0.12;
		return weightedPick(random, weights) || "column";
	};

	const localEnter = (shot, gap, energy, previous, random) => {
		if (shot.index === 0) return "push";
		let weights;
		if (shot.sectionStart && gap >= 3000) weights = { cut: 1, flip: 1, roll: 1.2, push: 0.8, pull: 0.5 };
		else if (shot.sectionStart) weights = { roll: 1, flip: 0.6, push: 1, pan: 0.8, drop: 0.6 };
		else weights = { pan: 1.2, drop: 1, rise: 0.8, roll: 0.5 + 0.6 * energy, push: 0.8, pull: 0.5 };
		if (previous && weights[previous]) weights[previous] *= 0.3;
		return weightedPick(random, weights) || "pan";
	};

	const localFx = (lines, energy, random) => {
		const charTimed = lines.every((line) => line.charTimed);
		let weights;
		if (energy >= 0.66) weights = { slam: 1, pop: 1.2, slide: 0.8, assemble: 0.7, type: charTimed ? 0.8 : 0.2 };
		else if (energy >= 0.36) weights = { pop: 1, rise: 1, flip: 0.7, drop: 0.6, assemble: 0.5, type: charTimed ? 0.9 : 0.3 };
		else weights = { rise: 1.2, wave: 0.9, stretch: 0.4, pop: 0.5, type: charTimed ? 0.6 : 0.2 };
		return weightedPick(random, weights) || "pop";
	};

	/** A complete direction made without AI, deterministic for the same song. */
	const localDirection = (model, options = {}) => {
		const lines = Array.isArray(model) ? model : [];
		const random = createRandom((Number(options.seed) >>> 0) ^ 0xA5A5A5A5);
		const energy = Array.isArray(options.energy) && options.energy.length === lines.length
			? options.energy
			: lines.map(() => 0.5);
		const mood = localMood(lines);
		// Every return of a section gets the look it had the first time.
		const styleByKey = new Map();
		const shots = [];
		groupShots(lines).forEach((shot, index) => {
			const members = lines.slice(shot.from, shot.to + 1);
			const shotEnergy = members.reduce((sum, _, offset) => sum + energy[shot.from + offset], 0) / members.length;
			const previous = shots[shots.length - 1] || null;
			const gap = index ? members[0].start - lines[shot.from - 1].end : Infinity;
			const enter = localEnter({ ...shot, index }, gap, shotEnergy, previous?.enter, random);
			// A returning section (all repeated lines) looks like the shot that
			// first opened with the same line, even when only part of it returns.
			const seen = shot.repeated ? styleByKey.get(shot.key) : null;
			if (seen && members.length <= MAX_LINES[seen.layout]) {
				shots.push({ ...seen, from: shot.from, to: shot.to, enter });
				return;
			}
			const layout = localLayout(members, shotEnergy, shot, previous?.layout, random);
			const tilt = shotEnergy > 0.6 ? 9 : 3.5;
			const style = {
				from: shot.from,
				to: shot.to,
				layout,
				enter,
				fx: localFx(members, shotEnergy, random),
				accent: weightedPick(random, { color: 1.4, box: 0.8, outline: 0.6 }),
				dutch: Math.round((random() * 2 - 1) * tilt),
				motifs: motifsFor(members.map((line) => line.text + " " + (line.translation || "")).join(" "), mood, random, 2 + Math.floor(random() * 2)),
				echo: ["wall", "hero", "column", "tunnel"].includes(layout) && random() < 0.65 ? echoFor(members) : null,
				source: "local",
			};
			if (!styleByKey.has(shot.key)) styleByKey.set(shot.key, style);
			shots.push(style);
		});
		const lineDirections = {};
		lines.forEach((line, index) => {
			const held = heldWordIndex(line);
			if (held >= 0) lineDirections[index] = { emph: [held] };
		});
		return { version: VERSION, source: "local", coverage: 0, mood, palette: null, shots, lines: lineDirections, shapes: {} };
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
			aiShots.push({
				from,
				to,
				layout,
				enter: ENTERS.includes(item.enter) ? item.enter : fallback.enter,
				fx: FX.includes(item.fx) ? item.fx : fallback.fx,
				accent: ACCENTS.includes(item.accent) ? item.accent : fallback.accent,
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
		const shots = [];
		for (const shot of filled) {
			const limit = MAX_LINES[shot.layout] || 6;
			for (let from = shot.from; from <= shot.to; from += limit) {
				shots.push({ ...shot, from, to: Math.min(shot.to, from + limit - 1), enter: from === shot.from ? shot.enter : "pan" });
			}
		}
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
		motifs: [...(shapes()?.NAMES || [])],
		maxLines: { ...MAX_LINES },
	});

	root.ivLyricsMotionDirector = Object.freeze({
		initialized: true,
		VERSION,
		MOODS,
		LAYOUTS,
		ENTERS,
		FX,
		ACCENTS,
		MAX_LINES,
		localDirection,
		normalizeDirection,
		promptLines,
		vocabulary,
	});
})(typeof window !== "undefined" ? window : globalThis);

