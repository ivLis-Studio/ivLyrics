import { beatGridOf } from "./motionBeatGrid.mjs";
import { boxesOf, cornersOf, extentOf } from "./motionBoardGeometry.mjs";
import {
	layoutArch, layoutCarousel, layoutCollage, layoutColumn, layoutConstellation, layoutCorners,
	layoutCrawl, layoutGrid, layoutHero, layoutPillar, layoutPoster, layoutRadial, layoutReel,
	layoutSlot, layoutSpiral, layoutSplit, layoutSpread, layoutStairs, layoutStrip, layoutSwell,
	layoutTower, layoutTunnel, layoutWall, layoutWave, layoutWordwall, layoutZigzag, standsUpright,
} from "./motionBoardLayouts.mjs";
import {
	TEMPO_FEEL, TURNS, comfortDirection, comfortOf, feelFor, normalizeMotionMood, normalizeMotionTempo,
} from "./motionCameraComfort.mjs";
import { placeBoards } from "./motionCameraFraming.mjs";
import { timeline } from "./motionCameraTimeline.mjs";
import { INTERLUDE_STYLES, cuesOf, interludesOf } from "./motionInterludes.mjs";
import {
	SMALL_WORDS, layoutAnamorph, layoutBleed, layoutChain, layoutFill, layoutFlash, layoutFrame,
	layoutLockup, layoutMargin, layoutMarquee, layoutRails, layoutSeal,
} from "./motionKineticLayouts.mjs";
import { graphemesOf, pulsesInMs } from "./motionLyricModel.mjs";
import { singsInto } from "./motionSongAnalysis.mjs";
import { MAX_LINES } from "./motionDirectionVocabulary.mjs";
import { motionShapes } from "./MotionLyricsShapes.mjs";
import { motionType } from "./MotionLyricsType.mjs";
import { between, clamp, createRandom, hashString } from "./motionMath.mjs";
import { EXIT_NAMES, HOLD_NAMES, PREVIEW_LAYOUTS } from "./motionTypeEffects.mjs";
import {
	DEFAULT_INFO, JOINED_FX, casedText, createFontBook, fallbackMeasure,
} from "./motionTypesetting.mjs";

// Compositions that show one line at a time: lines sung over each other cannot share them.
const SOLO_LAYOUTS = new Set(["slot", "poster", "spread", "lockup", "flash", "fill", "seal", "frame", "marquee", "bleed"]);
// Compositions that set any number of lines one after another (the others have a fixed number of places).
const ROOMY_LAYOUTS = new Set(["column", "zigzag", "collage", "stairs", "strip", "rails", "chain"]);

// Accents that still read on upright type.
const UPRIGHT_ACCENTS = new Set(["color", "outline", "glow", "gradient", "extrude", "sticker", "giant", "script", "spark", "neon", "chrome"]);

const LAYOUT_FNS = Object.freeze({
	column: layoutColumn,
	zigzag: layoutZigzag,
	spiral: layoutSpiral,
	wall: layoutWall,
	tunnel: layoutTunnel,
	collage: layoutCollage,
	hero: layoutHero,
	tower: layoutTower,
	stairs: layoutStairs,
	strip: layoutStrip,
	split: layoutSplit,
	swell: layoutSwell,
	radial: layoutRadial,
	carousel: layoutCarousel,
	reel: layoutReel,
	crawl: layoutCrawl,
	slot: layoutSlot,
	poster: layoutPoster,
	wordwall: layoutWordwall,
	arch: layoutArch,
	spread: layoutSpread,
	pillar: layoutPillar,
	wave: layoutWave,
	constellation: layoutConstellation,
	grid: layoutGrid,
	corners: layoutCorners,
	lockup: layoutLockup,
	flash: layoutFlash,
	chain: layoutChain,
	fill: layoutFill,
	seal: layoutSeal,
	frame: layoutFrame,
	margin: layoutMargin,
	marquee: layoutMarquee,
	anamorph: layoutAnamorph,
	bleed: layoutBleed,
	rails: layoutRails,
});
const BIG_MOTIFS = new Set(["ring", "halo", "sunburst", "spiral", "moon", "sun", "disc", "square", "flower", "star", "frame"]);
const CALM_MOTIFS = new Set(["ring", "dot", "disc", "halo", "moon", "sun"]);

/** Motifs around the lines and a giant outline word behind them. */
const decorate = (board, ctx, random, shot, direction) => {
	const shapes = motionShapes;
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
			// At the depth of its line (tunnels and drums put lines at different depths).
			z: (board.places[line].z || 0) + between(random, -60, 40),
			size,
			rot: between(random, -30, 30),
			spin: between(random, -42, 42) * (CALM_MOTIFS.has(name) ? 0.25 : 1) * ctx.spin,
			accent: random() < 0.55,
			opacity: 0.94,
		});
	});
	let echo = null;
	if (shot.echo) {
		const script = motionType?.scriptOf?.(shot.echo, ctx.songLang) || "latin";
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

// How a shot breaks its lines into pieces, each set, timed and left on its own:
// "line" keeps short lines whole (a long line is still broken into phrases),
// "phrase" breaks every line of more than a few words into short phrases,
// "word" sets every word on its own (the words of a line stay until the next line).
const SPLIT_MODES = new Set(["line", "phrase", "word"]);
const PIECE_RULES = Object.freeze({
	// A line heavier than "most" units (or with more words) is broken into pieces of about "target" units.
	line: { most: 26, words: 8, target: 16 },
	phrase: { most: 13, words: 4, target: 12 },
});
const WIDE_RE = /[\p{Script=Han}\p{Script=Hangul}\p{Script=Hiragana}\p{Script=Katakana}]/u;
const BREAK_AFTER_RE = /[,.;:!?、。，．！？；：…]["'”’」』)]*$/u;
const PARTICLE_RE = /^[\p{Script=Hiragana}ー]{1,2}$/u;
const PUNCTUATION_RE = /^[\p{P}\p{S}\s]+$/u;

/** How much room a text takes: a Latin letter counts one, a Korean, Japanese or Chinese character nearly two. */
const unitsOf = (text) => {
	let units = 0;
	for (const grapheme of graphemesOf(text)) {
		if (/\s/u.test(grapheme)) continue;
		units += WIDE_RE.test(grapheme) ? 1.8 : 1;
	}
	return units;
};

/**
 * The pieces a line is set in, as [first word, last word] ranges. Phrases
 * break where the line breaks itself (punctuation, a breath between words)
 * into pieces of about the same size, never ending on a little word.
 */
export const piecesOf = (line, mode = "line") => {
	const words = line.words;
	const count = words.length;
	if (count < 2) return [[0, Math.max(0, count - 1)]];
	if (mode === "word") {
		const pieces = [];
		words.forEach((word, index) => {
			const text = String(word.text ?? "").trim();
			// Punctuation, and a Japanese particle run on from its word, stay with the word before.
			const tagAlong = index > 0 && (PUNCTUATION_RE.test(text) || (word.joined && PARTICLE_RE.test(text)));
			if (tagAlong) pieces[pieces.length - 1][1] = index;
			else pieces.push([index, index]);
		});
		return pieces;
	}
	const rule = PIECE_RULES[mode] || PIECE_RULES.line;
	const weights = words.map((word) => Math.max(0.6, unitsOf(word.text)));
	const total = weights.reduce((sum, value) => sum + value, 0);
	if (total <= rule.most && count < rule.words) return [[0, count - 1]];
	const parts = clamp(Math.max(Math.ceil(total / rule.target), Math.ceil(count / (mode === "phrase" ? 3 : 5))), 2, count);
	const even = total / parts;
	const prefix = [0];
	weights.forEach((value, index) => prefix.push(prefix[index] + value));
	/** What breaking after word b costs (negative where the line breaks itself). */
	const breakCost = (b) => {
		const text = String(words[b].text ?? "");
		const gap = words[b + 1].start - words[b].end;
		let cost = 0;
		if (BREAK_AFTER_RE.test(text)) cost -= 0.7;
		if (gap >= 350) cost -= 0.55;
		else if (gap >= 150) cost -= 0.25;
		if (SMALL_WORDS.has(text.toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, ""))) cost += 0.45;
		// Japanese and Chinese runs break on their particles rather than inside a compound.
		if (words[b + 1].joined && !PARTICLE_RE.test(text)) cost += 0.15;
		if (PUNCTUATION_RE.test(String(words[b + 1].text ?? "").trim())) cost += 2;
		return cost;
	};
	const pieceCost = (from, to) => {
		const weight = prefix[to + 1] - prefix[from];
		const off = (weight - even) / even;
		return off * off * 1.4 + (from === to && unitsOf(words[from].text) <= 2 ? 0.5 : 0);
	};
	// best[m][j]: the cheapest way to set words 0..j-1 in m pieces.
	const best = Array.from({ length: parts + 1 }, () => new Array(count + 1).fill(Infinity));
	const from = Array.from({ length: parts + 1 }, () => new Array(count + 1).fill(-1));
	best[0][0] = 0;
	for (let m = 1; m <= parts; m += 1) {
		for (let j = m; j <= count; j += 1) {
			for (let i = m - 1; i < j; i += 1) {
				if (!Number.isFinite(best[m - 1][i])) continue;
				const cost = best[m - 1][i] + pieceCost(i, j - 1) + (i > 0 ? breakCost(i - 1) : 0);
				if (cost < best[m][j]) {
					best[m][j] = cost;
					from[m][j] = i;
				}
			}
		}
	}
	const pieces = [];
	for (let m = parts, j = count; m > 0; m -= 1) {
		const i = from[m][j];
		pieces.unshift([i, j - 1]);
		j = i;
	}
	return pieces;
};

/**
 * The song as it reaches the screen: each line broken into the pieces its
 * shot asks for, with the direction (shots, emphasised words, line
 * effects) and the typography carried over to the pieces. A shot with more
 * pieces than its composition holds goes on in the next board. Pieces keep
 * their line's index (its translation) and know their line (source).
 */
export const expandPieces = (model, direction, typography) => {
	const shots = Array.isArray(direction?.shots) ? direction.shots : [];
	const modeOf = new Array(model.length).fill("line");
	for (const shot of shots) {
		const mode = SPLIT_MODES.has(shot.split) ? shot.split : "line";
		for (let index = shot.from; index <= shot.to && index < model.length; index += 1) modeOf[index] = mode;
	}
	const pieces = [];
	const pieceTypography = [];
	const firstOf = [];
	const lastOf = [];
	const where = [];
	model.forEach((line, n) => {
		const info = typography[n] || DEFAULT_INFO;
		const ranges = piecesOf(line, modeOf[n]);
		firstOf[n] = pieces.length;
		where[n] = [];
		// Each other voice goes with the piece being sung when it comes in.
		const starts = ranges.map(([first]) => line.words[first].start);
		const voiceAt = (line.backing || []).map((voice) => {
			let at = 0;
			while (at + 1 < starts.length && starts[at + 1] <= voice.start) at += 1;
			return at;
		});
		ranges.forEach(([first, last], part) => {
			const words = line.words.slice(first, last + 1);
			const voices = (line.backing || []).filter((_, voice) => voiceAt[voice] === part);
			for (let word = first; word <= last; word += 1) where[n][word] = { piece: pieces.length, word: word - first };
			pieces.push(ranges.length === 1 ? { ...line, source: n, part: 0, parts: 1, split: modeOf[n] } : {
				...line,
				words,
				backing: voices,
				text: words.map((word) => word.text).join(" "),
				start: Math.min(words[0].start, ...voices.map((voice) => voice.start)),
				end: Math.max(...words.map((word) => word.end), ...voices.flatMap((voice) => voice.words.map((word) => word.end))),
				chars: words.reduce((sum, word) => sum + word.chars.length, 0),
				source: n,
				part,
				parts: ranges.length,
				split: modeOf[n],
			});
			pieceTypography.push(ranges.length === 1 ? info : {
				...info,
				words: (info.words || []).slice(first, last + 1),
				backing: (info.backing || []).filter((_, voice) => voiceAt[voice] === part),
			});
		});
		lastOf[n] = pieces.length - 1;
	});
	if (pieces.length === model.length) return { model: pieces, direction, typography: pieceTypography };
	const lineDirections = {};
	for (const [key, entry] of Object.entries(direction?.lines || {})) {
		const n = Number(key);
		if (!Number.isInteger(n) || !where[n]) continue;
		for (let piece = firstOf[n]; piece <= lastOf[n]; piece += 1) {
			const value = {};
			if (entry.fx) value.fx = entry.fx;
			const emph = (entry.emph || []).map((word) => where[n][word]).filter((spot) => spot && spot.piece === piece).map((spot) => spot.word);
			if (emph.length) value.emph = emph;
			if (Object.keys(value).length) lineDirections[piece] = value;
		}
	}
	const holds = (shot) => MAX_LINES[shot.layout] || 6;
	const split = [];
	for (const shot of shots) {
		const first = firstOf[shot.from];
		const last = lastOf[Math.min(shot.to, model.length - 1)];
		if (!Number.isInteger(first) || !Number.isInteger(last)) continue;
		// One-at-a-time compositions show one piece at a time in the same place: they hold more;
		// so do the open-ended ones for words set one by one (small, and gone as their line goes).
		const most = SOLO_LAYOUTS.has(shot.layout) ? Math.max(12, holds(shot))
			: shot.split === "word" && ROOMY_LAYOUTS.has(shot.layout) ? Math.min(10, Math.max(8, holds(shot) * 2)) : holds(shot);
		for (let start = first; start <= last;) {
			let end = Math.min(last, start + most - 1);
			if (end < last) {
				// Between two lines rather than inside one (unless that leaves the board half empty),
				// and never between pieces sung into each other.
				const fits = (cut, between) => (!between || pieces[cut].source !== pieces[cut + 1].source) && !singsInto(pieces[cut], pieces[cut + 1]);
				const find = (between, lowest) => {
					for (let cut = end; cut >= lowest; cut -= 1) if (fits(cut, between)) return cut;
					return -1;
				};
				let cut = find(true, start + Math.floor((most - 1) / 2));
				if (cut < 0) cut = find(false, start + 1);
				if (cut >= 0) end = cut;
			}
			split.push(start === first ? { ...shot, from: start, to: end } : { ...shot, from: start, to: end, enter: "pan", continued: true });
			start = end + 1;
		}
	}
	return { model: pieces, direction: { ...direction, shots: split, lines: lineDirections }, typography: pieceTypography };
};

/**
 * The edit for a song: boards in world space, the camera's path and the
 * timeline. Pure: the same model, direction, typography, size and seed
 * give the same plan.
 */
export const compose = (sourceModel, sourceDirection, options = {}) => {
	const W = Math.max(320, Number(options.width) || 0);
	const H = Math.max(240, Number(options.height) || 0);
	const F = clamp(Math.min(W * 0.068, H * 0.118), 34, 136);
	const seed = (Number(options.seed) >>> 0) || 1;
	const tempo = normalizeMotionTempo(sourceDirection?.tempo?.tempo);
	const pace = Number(sourceDirection?.tempo?.pace) || 1;
	// Lines are set in the pieces their shots ask for (options.pieces: false keeps every line whole).
	const sourceTypography = Array.isArray(options.typography) ? options.typography : [];
	// The viewer's comfort (how much it moves, turns and flashes) applies to whoever directed the song.
	const comfort = comfortOf(options.motion);
	const comfortable = comfortDirection(sourceDirection, comfort);
	const { model, direction, typography } = options.pieces === false
		? { model: sourceModel, direction: comfortable, typography: sourceTypography }
		: expandPieces(sourceModel, comfortable, sourceTypography);
	const ctx = {
		W, H, F,
		measure: typeof options.measure === "function" ? options.measure : fallbackMeasure,
		font: createFontBook(),
		typography,
		songLang: options.songLang || "",
		tempo,
		pace,
		spin: TEMPO_FEEL[tempo].spin,
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
		// One-at-a-time compositions cannot hold lines sung over (or into) each other, and only some scripts stand upright.
		let name = LAYOUT_FNS[shot.layout] ? shot.layout : "column";
		if (SOLO_LAYOUTS.has(name) && members.some((line, offset) => offset > 0 && singsInto(members[offset - 1], line))) name = "split";
		if (name === "pillar" && !members.every(standsUpright)) name = "column";
		const accent = name === "pillar" && !UPRIGHT_ACCENTS.has(shot.accent) ? "color" : shot.accent || "color";
		const look = { emph: (line) => line.emph, light: random() < 0.4, type, serif: shot.serif === true, upper: shot.upper === true, accent };
		const layout = LAYOUT_FNS[name](members, ctx, random, look);
		members.forEach((line) => {
			const fx = line.fx || shot.fx || "rise";
			line.fx = line.info.joined ? JOINED_FX[fx] || fx : fx;
			line.board = index;
		});
		const board = {
			index,
			layout: name,
			enter: index ? shot.enter : "push",
			accent,
			type,
			serif: shot.serif === true,
			upper: shot.upper === true,
			bars: shot.bars === true,
			// The scene an instrumental break after the shot's last line plays (interludesOf), if the AI named one.
			interlude: INTERLUDE_STYLES.includes(shot.interlude) ? shot.interlude : null,
			rule: shot.rule === true,
			// A composition that sets its own slant (a word wall) keeps it, as far as the viewer lets the screen turn.
			dutch: layout.tilt != null ? layout.tilt * (TURNS[comfort.rotation] ?? 1) : (Number(shot.dutch) || 0),
			first: shot.from,
			last: shot.to,
			places: layout.places,
			frames: layout.frames,
			drift: layout.drift,
			strokes: layout.strokes || [],
			plates: layout.plates || [],
			fills: layout.fills || [],
			solo: layout.solo === true,
			preview: PREVIEW_LAYOUTS.has(name),
			exit: EXIT_NAMES.has(shot.exit) ? shot.exit : "fade",
			hold: HOLD_NAMES.has(shot.hold) ? shot.hold : "grow",
			color: index % 2,
			rests: [],
		};
		board.localCorners = board.places.flatMap(cornersOf);
		Object.assign(board, decorate(board, ctx, random, shot, direction || {}));
		return board;
	});
	const plan = {
		W, H, F,
		mood: normalizeMotionMood(direction?.mood),
		tempo,
		pace,
		source: direction?.source || "local",
		boards,
		lines: lines.filter((line) => line.board >= 0),
		pulses: pulsesInMs(options.analysis),
		// Where the beats fall (the analysis, or the singing): moves set off and lines leave on them.
		grid: beatGridOf(model, pulsesInMs(options.analysis)),
		comfort,
		feel: feelFor(tempo, comfort),
	};
	// Without an analysis, the beats found in the singing drive what pulses with the beat.
	if (!plan.pulses && plan.grid) plan.pulses = { times: Float64Array.from(plan.grid.times), strengths: Float32Array.from(plan.grid.strengths) };
	if (!plan.lines.length) return { ...plan, flashes: [], slams: [], panels: [], bars: [], interludes: [], cues: [] };
	placeBoards(boards, ctx, seed, plan.feel.turn);
	timeline(plan, ctx);
	// The stretches without lyrics play scenes of their own (title cards, beat scenes, a count-in).
	plan.interludes = interludesOf(plan, ctx, direction, { seed, title: options.title, artist: options.artist });
	plan.cues = cuesOf(plan.interludes);
	return plan;
};
