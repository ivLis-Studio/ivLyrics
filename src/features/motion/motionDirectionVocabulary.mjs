import { motionShapes } from "./MotionLyricsShapes.mjs";

// 6: lines come and go (exits, holds), the compositions, entrances, effects and accents from the motion-typography canon.
// 7: lines are set in pieces (split): long lines in phrases, fast lines word by word; thirteen more exits (six whole-word, seven letter by letter).
// 8: the AI reads the song's structure and energy and directs from a concept and a kit; scenes for instrumental breaks (interlude).
export const VERSION = 9;
export const MOODS = Object.freeze(["calm", "dreamy", "melancholic", "warm", "playful", "energetic", "intense", "dark"]);
export const TEMPOS = Object.freeze(["slow", "mid", "fast", "rap"]);
// Flat compositions, then three that sit in depth: carousel and reel wrap the lines round a drum, crawl lays them on a tilted plane.
export const LAYOUTS = Object.freeze([
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
export const ENTERS = Object.freeze([
	"pan", "drop", "rise", "roll", "flip", "push", "pull", "cut", "whip", "spin", "orbit", "tumble", "fade", "through", "panel",
	"drift", "crane", "twist", "swoop", "corkscrew", "hop", "iris", "open",
]);
export const FX = Object.freeze([
	"pop", "slide", "rise", "slam", "stretch", "flip", "type", "assemble", "drop", "wave", "blur", "wipe", "glitch", "spin", "zoom", "track", "bounce", "flicker",
	"lift", "swing", "smear", "door", "glide", "skew", "open", "cascade", "ripple", "swirl", "rain", "decode", "brush", "shutter",
]);
// Effects that move single letters; joined scripts get a word-level equivalent.
export const LETTER_FX = Object.freeze(["type", "assemble", "drop", "wave", "track", "bounce", "flicker", "cascade", "ripple", "swirl", "rain", "decode"]);
// Entrances that hit: a word smashed in or flying out of the lens, with the camera shaking. Strong spice, used sparingly.
export const HARD_FX = Object.freeze(["slam", "zoom"]);
// Snappy entrances that still jump at the eye; a song uses them now and then.
export const PUNCHY_FX = Object.freeze(["pop", "glitch", "flicker"]);
// Flash cuts and colour wipes between shots.
export const HARD_ENTERS = Object.freeze(["cut", "panel"]);
export const REVEAL_ENTERS = new Set(["iris", "open"]);
export const DISSOLVE_ENTERS = new Set(["fade", ...REVEAL_ENTERS]);
export const ACCENTS = Object.freeze([
	"color", "outline", "underline", "mark", "spark", "glow", "gradient", "stamp", "circle", "extrude", "sticker",
	"script", "giant", "trail", "scribble", "bracket", "neon", "chrome", "spectrum",
]);
// Shot faces. Serif shots are rare (SERIF_SHARE); shot.serif sets only a shot's emphasised words in serif.
export const TYPES = Object.freeze(["impact", "serif", "round", "flex"]);
// How a sung line leaves once the next one is under way (lines come and go; the screen is never a lyric sheet).
// Whole-word exits, then ones that take the words apart letter by letter.
export const EXITS = Object.freeze([
	"fade", "rise", "fall", "scatter", "shrink", "sweep", "blur", "wipe", "flip", "stretch", "glitch", "drip",
	"sink", "shut", "zoom", "twist", "dash", "hinge",
	"crumble", "dissolve", "erase", "burst", "evaporate", "tumble", "scramble",
]);
// How a line keeps moving after its words have landed, so a held line never freezes.
export const HOLDS = Object.freeze(["still", "grow", "drift", "float", "lean", "breathe", "push", "wobble", "swivel"]);
// No composition stays on screen longer than this: a long run of slow lines is cut into several.
export const MAX_SHOT_MS = 8000;
// How a shot breaks its lines into pieces (motionComposition.mjs, piecesOf): whole lines (a long one still in
// phrases), short phrases, or word by word.
export const SPLITS = Object.freeze(["line", "phrase", "word"]);
// Scenes an instrumental break after a shot may play (motionInterludes.mjs, interludesOf): the lyrics are never shown meanwhile.
export const INTERLUDES = Object.freeze(["pulse", "eq", "marquee", "orbit", "stripes", "grid", "count", "wave"]);
// A pause this long is an interlude: the timeline hides the board meanwhile.
export const REST_GAP_MS = 5000;
export const REST_FADE_MS = 1000;
export const CAMERA_INTRO_MS = 2200;

export const MAX_LINES = Object.freeze({
	column: 6, zigzag: 5, spiral: 4, wall: 6, tunnel: 6, collage: 5, hero: 2, tower: 3,
	stairs: 5, strip: 4, split: 6, swell: 4, radial: 6, carousel: 5, reel: 6, crawl: 6,
	slot: 4, poster: 3, wordwall: 4, arch: 4, spread: 3, pillar: 3,
	wave: 5, constellation: 5, grid: 4, corners: 4,
	lockup: 4, flash: 4, chain: 4, fill: 4, seal: 4, frame: 3, margin: 4, marquee: 4, anamorph: 4, bleed: 3, rails: 4,
});
export const PACE = Object.freeze({ slow: 1.4, mid: 1, fast: 0.82, rap: 0.72 });
export const MAX_SHOT_MOTIFS = 4;
// Short phrases ("Beyond the road") read well as a background word too.
export const MAX_ECHO_LENGTH = 16;

export const vocabulary = () => ({
	moods: [...MOODS],
	layouts: [...LAYOUTS],
	enters: [...ENTERS],
	fx: [...FX],
	accents: [...ACCENTS],
	types: [...TYPES],
	motifs: [...(motionShapes?.NAMES || [])],
	exits: [...EXITS],
	splits: [...SPLITS],
	interludes: [...INTERLUDES],
	holds: [...HOLDS],
	maxLines: { ...MAX_LINES },
});
