import {
	clamp, clamp01, createRandom, easeInOutCubic, easeInOutSine, easeOutBack, easeOutBounce,
	easeOutCubic, easeOutExpo, easeOutQuint, hashString, lerp, round,
} from "./motionMath.mjs";

// Lines come and go instead of standing as a lyric sheet: a line's outline
// peeks in shortly before it is sung, a sung line stays as a dim echo only
// while the next one gets going, then leaves with its shot's exit (at most
// the current line and the one before it are on screen). Compositions whose
// structure is the point (a drum, a wall of words, a star chart) keep the
// lines round the current one in view instead (PREVIEW_LAYOUTS).
export const PEEK_MS = 700;
const PEEK_GHOST = 0.3;
const SINGING_GHOST = 0.3;
const ECHO_SOLID = 0.42;
const ECHO_DIM_MS = 280;
export const EXIT_MS = 560;
export const PREVIEW_LAYOUTS = new Set(["reel", "carousel", "wordwall", "tunnel", "crawl", "constellation", "grid"]);
// A shot's exit (how a sung line leaves) and hold (how a line keeps moving once its words have landed).
export const EXIT_NAMES = new Set([
	"fade", "rise", "fall", "scatter", "shrink", "sweep", "blur", "wipe", "flip", "stretch", "glitch", "drip",
	"sink", "shut", "zoom", "twist", "dash", "hinge",
	"crumble", "dissolve", "erase", "burst", "evaporate", "tumble", "scramble",
]);
// Exits that take a word apart letter by letter (exitCharFrame), and the whole-word exit
// that words whose letters join (Arabic, Devanagari...) leave with instead.
export const LETTER_EXITS = Object.freeze({ crumble: "fall", dissolve: "blur", erase: "wipe", burst: "scatter", evaporate: "rise", tumble: "flip", scramble: "glitch" });
// How long an exit takes against EXIT_MS: letters going one by one take a little longer, a zoom or a dash less.
export const EXIT_LENGTH = Object.freeze({ crumble: 1.35, dissolve: 1.3, erase: 1.05, burst: 1.15, evaporate: 1.4, tumble: 1.3, scramble: 1.25, hinge: 1.3, zoom: 0.85, dash: 0.8 });
export const HOLD_NAMES = new Set(["still", "grow", "drift", "float", "lean", "breathe", "push", "wobble", "swivel"]);

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
export const lineLevels = (distance) => ({ ghost: levelAt(GHOST_STOPS, distance), solid: levelAt(SOLID_STOPS, distance) });

const FX_DURATION = Object.freeze({
	pop: 380, slide: 420, rise: 440, slam: 230, flip: 480, blur: 560, wipe: 520, glitch: 340, spin: 560, zoom: 480,
	lift: 620, swing: 640, smear: 360, door: 620, glide: 760, skew: 500, open: 560, shutter: 460, brush: 640,
	type: 1, assemble: 1, drop: 1, wave: 1, track: 1, bounce: 1, flicker: 1, cascade: 1, ripple: 1, swirl: 1, rain: 1, decode: 1,
});
export const CHAR_FX = new Set(["type", "assemble", "drop", "wave", "track", "bounce", "flicker", "cascade", "ripple", "swirl", "rain", "decode"]);
// How long after its word starts a word coming in with this effect can be read (masks and slow fades take a
// while; others about 70 ms): in a one-at-a-time composition the piece before stays until then (timeline, soloOut).
export const READS_AFTER = Object.freeze({ brush: 280, wipe: 230, open: 210, glide: 200, blur: 200, shutter: 170, door: 160, lift: 150, spin: 150, flip: 130, swing: 120, skew: 110 });
export const fxPaceOf = (pace) => clamp(Number(pace) || 1, 0.75, 1.5);

/** Entrance progress of a sung word's solid type (0 before it starts). */
export const wordEntrance = (fx, word, time, pace = 1) => {
	const duration = fx === "stretch" ? clamp(word.end - word.start, 280, 1400) : (FX_DURATION[fx] || 380) * fxPaceOf(pace);
	const lead = fx === "slam" ? 20 : fx === "zoom" || fx === "blur" || fx === "glide" ? 90 : fx === "lift" || fx === "door" ? 70 : 50;
	return clamp01((time - (word.start - lead)) / duration);
};

export const SETTLED = Object.freeze({ opacity: 1, transform: "none", filter: "", clip: "", shadow: "" });
export const HIDDEN = Object.freeze({ opacity: 0, transform: "none", filter: "", clip: "", shadow: "" });
const frame = (values) => ({ filter: "", clip: "", shadow: "", ...values });
// Masks that reveal a word leave this much room (em) round it for its
// shadow, glow and overhanging letters, so nothing is cut off sharply.
const SPILL_EM = 0.6;
const SPILL = "-" + SPILL_EM + "em";

/** The solid word's opacity, transform, filter, clip and shadow for its entrance. */
export const solidFrame = (fx, progress, seed = 0, rtl = false) => {
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

export const easeInCubic = (t) => t * t * t;
const easeInQuad = (t) => t * t;

/**
 * A sung word leaving with its shot's exit: k runs 0 → 1 over the word's
 * part of the exit (the words of a line leave one after another).
 */
export const exitFrame = (exit, k, seed = 0, rtl = false) => {
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
export const exitCharFrame = (exit, k, char, index, context = {}) => {
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
export const holdFrame = (hold, line, time, beat = 0, F = 60) => {
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
export const fillFrame = (line, place, time) => {
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
export const travelFrame = (line, place, time) => {
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
export const lineMotion = (board, line, time, beat = 0, F = 60) => {
	const place = line.place;
	const slide = place.slide ? slideFrame(line, place, time) : "";
	if (place.fill) return slide + fillFrame(line, place, time);
	if (place.travel) return slide + travelFrame(line, place, time);
	return slide + holdFrame(board.hold, line, time, beat, F);
};

/** How far a word floats (px, up is negative) under the "float" hold. */
export const floatOffset = (line, wordIndex, size, time) => {
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
export const LETTER_SETTLED = Object.freeze({ opacity: 1, transform: "none" });
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
export const charFrame = (fx, char, index, time, context = {}) => {
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

export const levelsOn = (board, line, distance, time) => {
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
export const lifeLevels = (line, time) => {
	if (time < line.peekAt || time >= line.exitAt + line.exitSpan) return { ghost: 0, solid: 0 };
	const ghost = time < line.start
		? PEEK_GHOST * easeOutCubic(clamp01((time - line.peekAt) / 320))
		: SINGING_GHOST * (1 - clamp01((time - line.voicesEnd) / 260));
	const solid = time > line.dimAt ? lerp(1, ECHO_SOLID, easeOutCubic(clamp01((time - line.dimAt) / ECHO_DIM_MS))) : 1;
	return { ghost, solid };
};

/**
 * How a word in a variable face moves (spec.axes): from thin (and narrow,
 * where the face has a width axis) to its resting weight as it lands, a
 * little heavier and wider at most on the beat. Null for other faces.
 */
export const flexOf = (spec) => {
	const axes = spec?.kind === "flex" ? spec.axes : null;
	if (!axes?.wght) return null;
	const weight = clamp(spec.weight, axes.wght[0], axes.wght[1]);
	return {
		weight,
		thin: Math.max(axes.wght[0], weight - 560),
		heaviest: Math.min(axes.wght[1], weight + 80),
		wdth: Array.isArray(axes.wdth),
		narrow: Array.isArray(axes.wdth) ? Math.max(axes.wdth[0], 78) : 100,
		wide: Array.isArray(axes.wdth) ? Math.min(axes.wdth[1], 106) : 100,
	};
};
