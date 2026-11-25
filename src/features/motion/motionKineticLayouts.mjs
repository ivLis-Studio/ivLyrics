import { blockOptions, boostOf, centerPlaces } from "./motionBoardGeometry.mjs";
import { pillarBlock, standsUpright } from "./motionBoardLayouts.mjs";
import { PERSPECTIVE_PX } from "./motionCameraFraming.mjs";
import { graphemesOf } from "./motionLyricModel.mjs";
import { between, clamp, rotate2d } from "./motionMath.mjs";
import {
	ACCENT_SCALE, DEFAULT_INFO, MAX_LINE_ROWS, itemsOf, layoutBlock, rowWidth, splitRows,
} from "./motionTypesetting.mjs";
import { placeUnits, runUnits } from "./motionWordGroups.mjs";

// Little words a sized lockup sets small (the stressed words carry the line).
export const SMALL_WORDS = new Set(["a", "an", "the", "of", "to", "in", "on", "at", "by", "for", "and", "or", "but", "is", "am", "are", "it", "its", "i", "me", "my", "you", "your", "we", "be", "as", "so", "oh", "do", "no", "up", "if", "de", "la", "le", "les", "el", "los", "y", "et", "und", "der", "die", "das", "ein", "un", "une"]);
/** How much a word weighs in a sized lockup: the little words small, the long and emphasised ones big. */
const stressOf = (text, emph) => {
	if (emph) return 1.9;
	const bare = String(text ?? "").toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
	const length = graphemesOf(bare).length;
	if (!length) return 0.5;
	if (SMALL_WORDS.has(bare)) return 0.55;
	if (length === 1 && /\p{Script=Hiragana}/u.test(bare)) return 0.6;
	return length >= 6 ? 1.25 : 1;
};

/**
 * A line as a sized lockup: its words in one or two rows, each word sized
 * by its stress, every row justified to the same width and the rows set
 * tight on their baselines. Lines with other voices keep the plain block.
 */
const lockupBlock = (line, ctx, options, width, maxHeight) => {
	if (line.backing.length) return layoutBlock(line, ctx, { ...options, size: ctx.F * 0.9, maxLength: width });
	const info = ctx.typography[line.n] || DEFAULT_INFO;
	const items = itemsOf(line, ctx, { ...options, size: 100 });
	items.forEach((item, index) => {
		const weight = stressOf(item.text, item.emph) / (item.emph ? 1.3 * (ACCENT_SCALE[options.accent] || 1) : 1);
		item.size *= weight;
		item.width *= weight;
		item.gap = index ? Math.min(item.size, items[index - 1].size) * (item.gap > 10 ? 0.24 : 0.05) : 0;
	});
	const rows = items.length >= 3 ? splitRows(items, Math.min(MAX_LINE_ROWS, items.length), rowWidth(items)) : [items];
	// Every row fills the width, but a row of little words does not grow past twice the line's size.
	let scales = rows.map((row) => Math.min(width / Math.max(1, rowWidth(row)), (ctx.F * 3.2) / Math.max(...row.map((item) => item.size))));
	const build = () => {
		const words = [];
		let baseline = 0;
		let widest = 0;
		let tallest = 0;
		rows.forEach((row, rowIndex) => {
			const scale = scales[rowIndex];
			const top = Math.max(...row.map((item) => item.size)) * scale;
			tallest = Math.max(tallest, top);
			baseline += rowIndex ? top * 0.92 : top * 0.78;
			const rowLength = rowWidth(row) * scale;
			widest = Math.max(widest, rowLength);
			let x = -rowLength / 2;
			row.forEach((item, position) => {
				if (position) x += item.gap * scale;
				const size = item.size * scale;
				const itemWidth = item.width * scale;
				const center = x + itemWidth / 2;
				words[item.index] = {
					x: info.rtl ? -center : center,
					y: baseline - size * 0.24,
					size, width: itemWidth, role: item.role, emph: item.emph, voice: 0, spec: item.spec, text: item.text, letters: item.letters,
				};
				x += itemWidth;
			});
		});
		const height = baseline + tallest * 0.22;
		words.forEach((word) => { word.y -= height / 2; });
		return { words, width: widest, height, rows: rows.length, size: tallest, rtl: info.rtl, leadWidth: widest };
	};
	let block = build();
	if (block.height > maxHeight) {
		scales = scales.map((scale) => (scale * maxHeight) / block.height);
		block = build();
	}
	return block;
};

// One line at a time as a sized lockup in the middle of the screen.
export const layoutLockup = (lines, ctx, random, look) => {
	const places = lines.map((line) => ({ x: 0, y: 0, z: 0, rot: 0, block: lockupBlock(line, ctx, blockOptions(look, line, { light: false }), ctx.W * between(random, 0.56, 0.7), ctx.H * 0.62) }));
	const frames = places.map(() => ({ x: 0, y: 0, z: 0, roll: 0 }));
	return { places, frames, drift: { z: 110, roll: 0.6 }, solo: true };
};

/** A line set one word at a time in one place: each word sized by its stress (the renderer shows only the latest). */
const flashBlock = (line, ctx, options) => {
	const info = ctx.typography[line.n] || DEFAULT_INFO;
	const items = itemsOf(line, ctx, { ...options, size: 100 });
	const words = [];
	let widest = 0;
	let tallest = 0;
	items.forEach((item) => {
		const wanted = ctx.F * 1.55 * stressOf(item.text, item.emph);
		const size = Math.min(wanted, (ctx.W * 0.84 * 100) / Math.max(1, item.width) * (item.size / 100), ctx.H * 0.46);
		const scale = size / item.size;
		const width = item.width * scale;
		words[item.index] = { x: 0, y: 0, size, width, role: item.role, emph: item.emph, voice: 0, spec: item.spec, text: item.text, letters: item.letters };
		widest = Math.max(widest, width);
		tallest = Math.max(tallest, size);
	});
	return { words, width: widest, height: tallest * 1.1, rows: 1, size: tallest, rtl: info.rtl, leadWidth: widest };
};

// One word at a time, each replacing the last in the same place on its beat.
export const layoutFlash = (lines, ctx, _random, look) => {
	const places = lines.map((line) => (line.backing.length
		? { x: 0, y: 0, z: 0, rot: 0, block: layoutBlock(line, ctx, blockOptions(look, line, { size: ctx.F * 1.05 * boostOf(line), maxLength: ctx.W * 0.74 })) }
		: { x: 0, y: 0, z: 0, rot: 0, block: flashBlock(line, ctx, blockOptions(look, line, { light: false })), flash: true }));
	const frames = places.map(() => ({ x: 0, y: 0, z: 0, roll: 0 }));
	return { places, frames, drift: { z: 140, roll: 0.4 }, solo: true };
};

// Each line attached to the edge of the one before, now and then turned a quarter: a mosaic the camera rolls along.
// A line set in pieces keeps its pieces together in its own lockup: only the lines turn, never their words.
export const layoutChain = (lines, ctx, random, look) => {
	const turn = random() < 0.5 ? 90 : -90;
	const gap = ctx.F * 0.22;
	const units = runUnits(lines, ctx, (line, lineCtx) => lockupBlock(line, lineCtx, blockOptions(look, line, { light: false }), ctx.W * between(random, 0.42, 0.54), ctx.H * 0.46));
	const boxes = [];
	units.forEach((unit, index) => {
		if (!index) {
			boxes.push({ x: 0, y: 0, rot: 0 });
			return;
		}
		const previous = boxes[index - 1];
		const before = units[index - 1];
		// Every other line turns down the side of the one before (now and then two in a row).
		const turned = index % 2 === 1 || random() < 0.2;
		// In the previous line's own frame: under it (left edges aligned), or down its side when turned.
		const local = turned
			? { x: (turn > 0 ? 1 : -1) * (before.width / 2 + gap + unit.height / 2), y: -before.height / 2 + unit.width / 2 }
			: { x: -before.width / 2 + unit.width / 2, y: before.height / 2 + gap + unit.height / 2 };
		const offset = rotate2d(local.x, local.y, previous.rot);
		boxes.push({ x: previous.x + offset.x, y: previous.y + offset.y, rot: previous.rot + (turned ? turn : 0) });
	});
	return { ...placeUnits(units, boxes, lines.length), drift: { z: 70, roll: 0.8 } };
};

// One line at a time in capitals that always fill the width: each sung word stretches the line (fillFrame).
export const layoutFill = (lines, ctx, _random, look) => {
	const target = ctx.W * 0.88;
	const places = lines.map((line) => {
		// Heavy capitals throughout (the shot's face and serif words give way).
		const options = blockOptions(look, line, { emphScale: 1.15, light: false, upper: true, type: "impact", serif: false });
		const natural = layoutBlock(line, ctx, { ...options, size: 100, maxLength: Infinity }).leadWidth / 100;
		const size = Math.min(target / Math.max(1, natural), ctx.F * 3);
		// A long line cannot fill the width in one row: it is set as a plain block.
		if (size < ctx.F * 0.55 || line.backing.length) {
			return { x: 0, y: 0, z: 0, rot: 0, block: layoutBlock(line, ctx, { ...options, size: ctx.F * 0.95, maxLength: target }) };
		}
		const block = layoutBlock(line, ctx, { ...options, size, maxLength: Infinity });
		return { x: 0, y: 0, z: 0, rot: 0, block, fill: { target, most: Math.max(1, Math.min(3.4, (ctx.H * 0.62) / Math.max(1, block.height))) } };
	});
	const frames = places.map(() => ({ x: 0, y: 0, z: 0, roll: 0 }));
	return { places, frames, drift: { z: 60, roll: 0.3 }, solo: true };
};

// One line at a time inside a ring like a seal, an outer dashed ring turning the other way.
export const layoutSeal = (lines, ctx, random, look) => {
	const radius = Math.min(ctx.W, ctx.H) * 0.33;
	const spin = random() < 0.5 ? 1 : -1;
	const places = lines.map((line) => {
		let block = layoutBlock(line, ctx, blockOptions(look, line, { size: ctx.F * 0.92 * boostOf(line), maxLength: radius * 1.5 }));
		if (block.height > radius * 1.2) block = layoutBlock(line, ctx, blockOptions(look, line, { size: (ctx.F * 0.92 * boostOf(line) * radius * 1.2) / block.height, maxLength: radius * 1.5 }));
		return { x: 0, y: 0, z: 0, rot: 0, block };
	});
	const plates = [];
	places.forEach((_, index) => {
		plates.push({ kind: "ring", color: "seal", x: 0, y: 0, z: -6, w: radius * 2, h: radius * 2, rot: 0, radius, line: index, solo: true, spin: spin * 14 });
		plates.push({ kind: "ring", color: "dash", x: 0, y: 0, z: -10, w: radius * 2.28, h: radius * 2.28, rot: between(random, 0, 90), radius: radius * 1.14, line: index, solo: true, spin: -spin * 26 });
	});
	const frames = places.map(() => ({ x: 0, y: 0, z: 0, roll: 0 }));
	return { places, frames, drift: { z: 90, roll: 0.6 }, solo: true, plates };
};

/** A line's words placed round the edges of the frame (clockwise from the top left), the middle left open. */
const frameBlock = (line, ctx, options, random) => {
	const info = ctx.typography[line.n] || DEFAULT_INFO;
	const items = itemsOf(line, ctx, { ...options, size: 100 });
	const A = ctx.W * 0.4;
	const B = ctx.H * 0.34;
	const perimeter = 4 * A + 4 * B;
	const sized = items.map((item) => {
		const size = clamp(ctx.F * 0.74 * stressOf(item.text, item.emph) * between(random, 0.85, 1.2), ctx.F * 0.42, ctx.F * 1.4);
		return { item, size, width: (item.width * size) / item.size };
	});
	const gap = ctx.F * 0.9;
	const total = sized.reduce((sum, entry) => sum + entry.width, 0) + gap * Math.max(0, sized.length - 1);
	const stretch = Math.max(1, (perimeter * 0.7) / Math.max(1, total));
	const pointAt = (s) => {
		let rest = ((s % perimeter) + perimeter) % perimeter;
		if (rest < 2 * A) return { x: -A + rest, y: -B };
		rest -= 2 * A;
		if (rest < 2 * B) return { x: A, y: -B + rest };
		rest -= 2 * B;
		if (rest < 2 * A) return { x: A - rest, y: B };
		rest -= 2 * A;
		return { x: -A, y: B - rest };
	};
	const words = [];
	let along = perimeter * 0.02;
	sized.forEach((entry, index) => {
		if (index) along += gap * stretch;
		const point = pointAt(along + (entry.width * stretch) / 2);
		along += entry.width * stretch;
		// Pulled inside the frame.
		const x = clamp(point.x, -ctx.W * 0.46 + entry.width / 2, ctx.W * 0.46 - entry.width / 2);
		const y = clamp(point.y, -ctx.H * 0.43 + entry.size * 0.6, ctx.H * 0.43 - entry.size * 0.6);
		words[entry.item.index] = { x, y, rot: between(random, -3, 3), size: entry.size, width: entry.width, role: entry.item.role, emph: entry.item.emph, voice: 0, spec: entry.item.spec, text: entry.item.text, letters: entry.item.letters };
	});
	return { words, width: A * 2, height: B * 2, rows: 2, size: Math.max(...sized.map((entry) => entry.size)), rtl: info.rtl, leadWidth: A * 2 };
};

// One line at a time round the edges of the frame, the middle left to the video.
export const layoutFrame = (lines, ctx, random, look) => {
	const places = lines.map((line) => ({
		x: 0, y: 0, z: 0, rot: 0,
		block: line.backing.length
			? layoutBlock(line, ctx, blockOptions(look, line, { size: ctx.F * 0.85 * boostOf(line), maxLength: ctx.W * 0.7 }))
			: frameBlock(line, ctx, blockOptions(look, line, { light: false }), random),
	}));
	const frames = places.map(() => ({ x: 0, y: 0, z: 0, roll: 0 }));
	return { places, frames, drift: { z: 40, roll: 0.5 }, solo: true };
};

// Lines along the left and right edges of the screen, stepping inward: upright for Korean, Japanese and Chinese.
export const layoutMargin = (lines, ctx, random, look) => {
	const first = random() < 0.5 ? 1 : -1;
	const places = lines.map((line, index) => {
		const side = index % 2 ? -first : first;
		const step = Math.floor(index / 2);
		if (standsUpright(line)) {
			const block = pillarBlock(line, ctx, blockOptions(look, line, { size: ctx.F * 0.62 * boostOf(line), light: false }));
			return { x: side * (ctx.W * 0.4 - step * ctx.F * 1.3 - block.width / 2), y: -ctx.H * 0.04, z: 0, rot: 0, block, upright: true };
		}
		const block = layoutBlock(line, ctx, blockOptions(look, line, { size: ctx.F * 0.62 * boostOf(line), maxLength: ctx.W * 0.42, align: side > 0 ? "right" : "left" }));
		return { x: side * Math.max(0, ctx.W * 0.44 - block.width / 2), y: -ctx.H * 0.3 + index * ctx.H * 0.17, z: 0, rot: 0, block };
	});
	const frames = places.map((place) => ({ x: place.x * 0.2, y: place.y * 0.3, z: 0, roll: 0 }));
	return { places, frames, drift: { z: 30, roll: 0.4 } };
};

// One line at a time with copies of it streaming across the screen in rows above and below (marquee bands).
export const layoutMarquee = (lines, ctx, random, look) => {
	const fills = [];
	const places = lines.map((line, index) => {
		const options = blockOptions(look, line, { light: false });
		const block = layoutBlock(line, ctx, { ...options, size: ctx.F * 1.05 * boostOf(line), maxLength: ctx.W * 0.8 });
		const info = ctx.typography[line.n] || DEFAULT_INFO;
		const spec = ctx.font(info.script, look.type, "display");
		const text = block.words.slice(0, line.words.length).map((word) => word.text).join(info.joined ? "" : " ");
		const size = block.size * 0.92;
		const copy = ctx.measure(text + "   ", size, spec);
		const pitch = Math.max(block.height / Math.max(1, block.rows), size * 1.08);
		const direction = random() < 0.5 ? 1 : -1;
		// Enough copies in a row to cover the screen wherever the row has slid to.
		const copies = Math.max(4, Math.ceil((ctx.W * 1.8) / Math.max(1, copy)) + 2);
		for (let row = 1; row * pitch < ctx.H * 0.62; row += 1) {
			for (const sign of [-1, 1]) {
				const y = sign * (block.height / 2 + (row - 0.5) * pitch + size * 0.08);
				fills.push({ text: (text + "   ").repeat(copies), spec, size, x: 0, y, z: 0, rot: 0, line: index, step: copy, speed: direction * (row % 2 ? 1 : -1) * (sign > 0 ? 1 : -1) * ctx.F * (1.1 + row * 0.25) });
			}
		}
		return { x: 0, y: 0, z: 0, rot: 0, block };
	});
	const frames = places.map(() => ({ x: 0, y: 0, z: 0, roll: 0 }));
	return { places, frames, drift: { z: 80, roll: 0.5 }, solo: true, fills };
};

/**
 * The words of a line hung at different depths, each moved and sized so
 * that from the line's camera (on the line's plane) the words line up into
 * the line; when the camera moves they split apart in parallax.
 */
const anamorphize = (block, random) => {
	const words = block.words.map((word, index) => {
		const depth = index ? between(random, -760, 240) : between(random, -260, 120);
		const k = (PERSPECTIVE_PX - depth) / PERSPECTIVE_PX;
		return { ...word, x: word.x * k, y: word.y * k, size: word.size * k, width: word.width * k, z: depth };
	});
	return { ...block, words };
};

// Lines stacked like a column, their words hung in depth: they only read as lines from where the camera holds.
export const layoutAnamorph = (lines, ctx, random, look) => {
	const places = [];
	let y = 0;
	lines.forEach((line, index) => {
		const block = anamorphize(layoutBlock(line, ctx, blockOptions(look, line, { size: ctx.F * 0.95 * boostOf(line), maxLength: ctx.W * 0.66 })), random);
		if (index) y += places[index - 1].block.height / 2 + ctx.H * 0.24 + block.height / 2;
		places.push({ x: (index % 2 ? 1 : -1) * ctx.W * between(random, 0.04, 0.12), y, z: 0, rot: 0, block });
	});
	centerPlaces(places);
	const frames = places.map((place) => ({ x: place.x, y: place.y, z: 0, roll: 0 }));
	return { places, frames, drift: { z: 12, roll: 0.6 } };
};

// One short line at a time so large it runs off the screen; the view slides along it as it is sung (travelFrame).
export const layoutBleed = (lines, ctx, _random, look) => {
	const places = lines.map((line) => {
		const options = blockOptions(look, line, { emphScale: 1.1, light: false });
		const block = layoutBlock(line, ctx, { ...options, size: ctx.H * 0.5, maxLength: Infinity });
		const travel = Math.max(0, (block.leadWidth - ctx.W * 0.9) / 2);
		// The frame holds a screenful of it.
		return { x: 0, y: 0, z: 0, rot: 0, block: { ...block, width: Math.min(block.width, ctx.W * 0.9), height: Math.min(block.height, ctx.H * 0.8) }, travel };
	});
	const frames = places.map(() => ({ x: 0, y: 0, z: 0, roll: 0 }));
	return { places, frames, drift: { z: 50, roll: 0.3 }, solo: true };
};

// Lines on a slanted grid of rules, each sliding along its rule into place (a Saul Bass title).
export const layoutRails = (lines, ctx, random, look) => {
	const side = (ctx.typography[lines[0].n] || DEFAULT_INFO).rtl ? -1 : 1;
	const places = [];
	let y = 0;
	lines.forEach((line, index) => {
		const block = layoutBlock(line, ctx, blockOptions(look, line, { size: ctx.F * 0.88 * boostOf(line), maxLength: ctx.W * 0.6, align: side > 0 ? "left" : "right" }));
		if (index) y += places[index - 1].block.height / 2 + ctx.F * 0.7 + block.height / 2;
		const x = side * (index % 3) * ctx.W * 0.09;
		places.push({ x, y, z: 0, rot: 0, block, slide: { x: 0, y: (index % 2 ? -1 : 1) * ctx.H * 0.42 } });
	});
	centerPlaces(places);
	const rails = new Set();
	for (const place of places) rails.add(Math.round(place.x - (side * place.block.width) / 2 - side * ctx.F * 0.3));
	for (let extra = -2; extra <= 2; extra += 1) rails.add(Math.round(extra * ctx.W * 0.16 + ctx.W * 0.05));
	const top = Math.min(...places.map((place) => place.y - place.block.height / 2)) - ctx.H * 0.5;
	const length = Math.max(...places.map((place) => place.y + place.block.height / 2)) + ctx.H * 0.5 - top;
	const strokes = [...rails].map((x) => ({ x, y: top, z: -4, length, rot: 90, stops: places.map(() => 1) }));
	const frames = places.map((place) => ({ x: place.x, y: place.y, z: 0, roll: 0 }));
	return { places, frames, drift: { z: 60, roll: 0.4 }, strokes, tilt: (random() < 0.5 ? 1 : -1) * between(random, 10, 14) };
};
