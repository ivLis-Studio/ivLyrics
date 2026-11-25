import { HARD_FX, LETTER_FX, MAX_LINES } from "./motionDirectionVocabulary.mjs";
import { wordsPerSecond } from "./motionSongAnalysis.mjs";

export const weightedPick = (random, weights) => {
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
const JOINED_RE = /[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Devanagari}\p{Script=Bengali}]/u;
// Lines that can be set upright (the pillar composition): Korean, Japanese and Chinese without Latin words.
const UPRIGHT_RE = /^[\p{Script=Hangul}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{P}\p{N}\s\u30fc]+$/u;

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

export const localLayout = (lines, energy, shot, history, tempo, random, avoid = null) => {
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

export const localEnter = (shot, gap, energy, previous, tempo, random, avoid = null) => {
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

export const localFx = (lines, energy, tempo, random, avoid = null) => {
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
// The variable face that swells as words land: songs with drive take it more often.
const FLEX_CHANCE = Object.freeze({ slow: 0.06, mid: 0.16, fast: 0.24, rap: 0.2 });
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

export const getTempoAccentWeights = (tempo) =>
	ACCENT_WEIGHTS[tempo.tempo === "rap" ? "fast" : tempo.tempo] || ACCENT_WEIGHTS.mid;

/** A shot's accent: never the one just used, more often one the song has not shown yet. */
export const localAccent = (accents, history, random, avoid = null) => {
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
export const EXIT_WEIGHTS = Object.freeze({
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
export const HOLD_WEIGHTS = Object.freeze({
	slow: { grow: 1.4, drift: 1.3, float: 1.1, push: 1, lean: 0.8, breathe: 0.4, still: 0.05, swivel: 0.9, wobble: 0.3 },
	mid: { grow: 1, drift: 1, float: 0.8, push: 0.9, lean: 0.8, breathe: 0.8, still: 0.2, swivel: 0.8, wobble: 0.6 },
	fast: { grow: 0.7, drift: 0.6, float: 0.4, push: 1, lean: 0.8, breathe: 1.2, still: 0.5, swivel: 0.6, wobble: 1 },
	rap: { grow: 0.6, drift: 0.6, float: 0.3, push: 1, lean: 0.9, breathe: 1.2, still: 0.6, swivel: 0.5, wobble: 0.9 },
});
/** A shot's exit or hold for the tempo: not the one the last shot used. */
export const localMotion = (weights, tempo, previous, random, fallback) => {
	const table = { ...(weights[tempo?.tempo] || weights.mid) };
	if (previous && table[previous]) table[previous] *= 0.15;
	return weightedPick(random, table) || fallback;
};

const WIDE_RE = /[\p{Script=Han}\p{Script=Hangul}\p{Script=Hiragana}\p{Script=Katakana}]/u;
/** Room a text takes: a Latin letter one, a Korean, Japanese or Chinese character nearly two (motionComposition.mjs, unitsOf). */
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
export const localSplit = (lines, tempo, energy, random) => {
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
export const UPPER_CHANCE = Object.freeze({ slow: 0.15, mid: 0.4, fast: 0.6, rap: 0.6 });
export const TILT = Object.freeze({ slow: 2, mid: 5, fast: 9, rap: 11 });

/**
 * A shot's face and whether its emphasised words go serif. A whole serif
 * shot needs room in the song's budget and never follows another.
 */
export const shotType = (mood, tempo, layout, random, serifAllowed) => {
	const round = (ROUND_CHANCE[tempo.tempo] ?? 0.08) + (mood === "playful" ? 0.3 : 0);
	const flex = (FLEX_CHANCE[tempo.tempo] ?? 0.16) + (mood === "energetic" || mood === "intense" ? 0.06 : 0);
	const quiet = mood === "dreamy" || mood === "melancholic" || mood === "calm";
	const serifShot = (SERIF_SHOT_CHANCE[tempo.tempo] ?? 0.08) + (quiet ? 0.06 : 0) + (layout === "hero" ? 0.08 : 0);
	const serifChance = (SERIF_CHANCE[tempo.tempo] ?? 0.3) + (quiet ? 0.15 : 0) + (layout === "hero" ? 0.15 : 0);
	const pick = random();
	const type = serifAllowed && pick < serifShot ? "serif" : pick > 1 - round ? "round" : pick > 1 - round - flex ? "flex" : "impact";
	return { type, serif: type === "serif" || random() < serifChance };
};
