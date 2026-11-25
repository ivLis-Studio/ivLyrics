import { onBeat } from "./motionBeatGrid.mjs";
import { motionShapes } from "./MotionLyricsShapes.mjs";
import { motionType } from "./MotionLyricsType.mjs";
import { clamp, createRandom } from "./motionMath.mjs";
import { casedText } from "./motionTypesetting.mjs";

// While no lyrics are on screen (the board has faded) the screen plays a
// scene of its own over the video, never the lyrics: the song's title
// card (intro and outro) or one of these (paintInterludes):
// pulse = rings bursting from the centre on the beat; eq = equalizer bars;
// marquee = the title in huge rows sliding across; orbit = the song's
// motifs orbiting; stripes = diagonal colour bands sweeping past a
// breathing frame; grid = a neon grid floor rushing at the camera;
// count = big numbers counting down to the lyrics; wave = oscilloscope waves.
export const INTERLUDE_STYLES = Object.freeze(["pulse", "eq", "marquee", "orbit", "stripes", "grid", "count", "wave"]);
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
export const SCENE_FADE_MS = 520;
// A long intro opens on the title card for this long; the outro's end card holds this long.
const TITLE_CARD_MS = 6500;
const END_CARD_MS = 9000;
// The beats counted in (cue dots) before the lyrics come back.
export const CUE_BEATS = 3;
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
	const script = motionType?.scriptOf?.(name, ctx.songLang, main) || main;
	const spec = ctx.font(script, "impact", "display");
	const cased = casedText(name, script, true);
	const natural = Math.max(1, ctx.measure(cased, 100, spec)) / 100;
	const size = clamp(Math.min(ctx.H * 0.23, (ctx.W * 0.84) / natural), Math.min(ctx.F * 0.8, ctx.H * 0.2), ctx.H * 0.24);
	const artistSpec = ctx.font(motionType?.scriptOf?.(by, ctx.songLang, main) || main, "impact", "light");
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
export const interludesOf = (plan, ctx, direction, options = {}) => {
	const { lines, boards } = plan;
	if (!lines.length) return [];
	const random = createRandom(((Number(options.seed) >>> 0) || 1) ^ 0x51ed27);
	const weights = INTERLUDE_WEIGHTS[plan.mood] || INTERLUDE_WEIGHTS.warm;
	const titled = titleSetOf(options.title, options.artist, ctx);
	const named = [...new Set((direction?.shots || []).flatMap((shot) => (Array.isArray(shot.motifs) ? shot.motifs : [])))]
		.filter((name) => motionShapes?.motifOf?.(name));
	const motifs = (named.length >= 2 ? named : [...named, ...(ORBIT_MOTIFS[plan.mood] || ORBIT_MOTIFS.warm)]).slice(0, 5);
	const beat = plan.grid?.period || 60000 / clamp(Number(direction?.tempo?.bpm) || DEFAULT_BPM[plan.tempo] || 100, 60, 190);
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
			// A long stretch changes scene on a downbeat.
			const cuts = [at];
			for (let part = 1; part < count; part += 1) cuts.push(onBeat(plan.grid, at + (left * part) / count, beat * 2.5, beat * 2.5, cuts[part - 1] + INTERLUDE_MIN_MS, window.end - INTERLUDE_MIN_MS, true));
			cuts.push(window.end);
			for (let part = 0; part < count; part += 1) parts.push({ style: null, start: cuts[part], end: cuts[part + 1] });
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
export const cuesOf = (scenes) => scenes.filter((scene) => scene.cue !== null).map((scene) => {
	const step = clamp(scene.beat, 380, 900);
	return { at: scene.cue, step, from: scene.cue - CUE_BEATS * step - 360 };
});
