import {
	blockOptions, boostOf, centerPlaces, frameX, lightFor, rotatedExtent,
} from "./motionBoardGeometry.mjs";
import { graphemesOf } from "./motionLyricModel.mjs";
import { between, clamp, clamp01, lerp, rotate2d } from "./motionMath.mjs";
import {
	DEFAULT_INFO, MAX_LINE_ROWS, itemsOf, layoutBlock, rowWidth, splitRows, towerBlock,
} from "./motionTypesetting.mjs";
import { placeUnits, runUnits } from "./motionWordGroups.mjs";

const TUNNEL_STEP = 1500;

export const layoutColumn = (lines, ctx, random, look) => {
	const align = ["left", "left", "center", "right", "stagger"][Math.floor(random() * 5)];
	const blocks = lines.map((line, index) => layoutBlock(line, ctx, blockOptions(look, line, {
		size: ctx.F * 0.84 * boostOf(line),
		maxLength: ctx.W * 0.78,
		align: align === "stagger" ? (index % 2 ? "right" : "left") : align,
	})));
	const columnWidth = Math.max(...blocks.map((block) => block.width));
	const places = [];
	let y = 0;
	blocks.forEach((block, index) => {
		if (index) y += Math.max(blocks[index - 1].size, block.size) * 0.3;
		let x = 0;
		if (align === "left") x = -columnWidth / 2 + block.width / 2;
		else if (align === "right") x = columnWidth / 2 - block.width / 2;
		else if (align === "stagger") x = (index % 2 ? 1 : -1) * (columnWidth - block.width) * 0.42;
		places.push({ x, y: y + block.height / 2, z: 0, rot: 0, block });
		y += block.height;
	});
	places.forEach((place) => { place.y -= y / 2; });
	const frames = places.map((place) => ({ x: frameX(place, ctx, 0.55), y: place.y, z: 0, roll: 0 }));
	return { places, frames, drift: { z: 80, roll: 1.4 } };
};

// Lines alternate across and down (or up) a staircase; the camera turns 90° for each.
// A line set in pieces turns as one: its words stay together on their line.
export const layoutZigzag = (lines, ctx, random, look) => {
	const turn = random() < 0.5 ? 90 : -90;
	const gap = ctx.F * 0.24;
	const units = runUnits(lines, ctx, (line, lineCtx, unit) => layoutBlock(line, lineCtx, blockOptions(look, line, {
		size: ctx.F * 0.8 * boostOf(line),
		maxLength: ctx.W * 0.72,
		light: lightFor(look, line) && unit % 2 === 1,
	})));
	const boxes = [];
	units.forEach((unit, index) => {
		const vertical = index % 2 === 1;
		const rot = vertical ? turn : 0;
		if (!index) {
			boxes.push({ x: 0, y: 0, rot, w: unit.width, h: unit.height });
			return;
		}
		const previous = boxes[index - 1];
		const width = vertical ? unit.height : unit.width;
		const height = vertical ? unit.width : unit.height;
		const x = previous.x + previous.w / 2 + gap + width / 2;
		let y;
		if (vertical) y = turn > 0 ? previous.y - previous.h / 2 + height / 2 : previous.y + previous.h / 2 - height / 2;
		else y = turn > 0 ? previous.y + previous.h / 2 - height / 2 : previous.y - previous.h / 2 + height / 2;
		boxes.push({ x, y, rot, w: width, h: height });
	});
	return { ...placeUnits(units, boxes, lines.length), drift: { z: 70, roll: 1.2 } };
};

// Up to four lines around a square: the screen turns a quarter for each.
export const layoutSpiral = (lines, ctx, random, look) => {
	const direction = random() < 0.5 ? 1 : -1;
	const blocks = lines.map((line) => layoutBlock(line, ctx, blockOptions(look, line, {
		size: ctx.F * 0.72 * boostOf(line),
		maxLength: ctx.W * 0.58,
	})));
	const longest = Math.max(...blocks.map((block) => block.width));
	const thickest = Math.max(...blocks.map((block) => block.height));
	const radius = longest / 2 + thickest * 1.12;
	const places = blocks.map((block, index) => {
		const rot = direction * 90 * index;
		const inset = radius - block.height / 2;
		const angle = ((rot - 90) * Math.PI) / 180;
		return { x: Math.cos(angle) * inset, y: Math.sin(angle) * inset, z: 0, rot, block };
	});
	const frames = places.map((place) => ({ x: place.x * 0.6, y: place.y * 0.6, z: radius * 0.32, roll: place.rot }));
	return { places, frames, drift: { z: 90, roll: 2.2 * direction } };
};

// A justified poster: every line set to the same width, short lines huge.
export const layoutWall = (lines, ctx, random, look) => {
	const width = ctx.W * 0.72;
	const align = random() < 0.6 ? "left" : "center";
	const alternate = random() < 0.5;
	const places = [];
	let y = 0;
	lines.forEach((line, index) => {
		const options = blockOptions(look, line, { emphScale: 1.12, light: alternate && index % 2 === 1, align });
		const natural = layoutBlock(line, ctx, { ...options, size: 100, maxLength: Infinity }).leadWidth / 100;
		const size = clamp(width / Math.max(1, natural), ctx.F * 0.42, ctx.F * 2.3);
		// The natural width already fits; the slack keeps rounding from wrapping it.
		const block = layoutBlock(line, ctx, { ...options, size, maxLength: width * 1.02 });
		if (index) y += Math.min(block.size, places[index - 1].block.size) * 0.07;
		const x = align === "left" ? -width / 2 + block.width / 2 : 0;
		places.push({ x, y: y + block.height / 2, z: 0, rot: 0, block });
		y += block.height;
	});
	places.forEach((place) => { place.y -= y / 2; });
	const frames = places.map((place) => ({
		x: 0,
		y: place.y,
		z: place.block.size > ctx.F * 1.5 ? Math.min(420, (place.block.size - ctx.F * 1.5) * 2.4) : 0,
		roll: 0,
	}));
	return { places, frames, drift: { z: 60, roll: 0.8 } };
};

// Lines one behind another; the camera flies forward through them.
export const layoutTunnel = (lines, ctx, random, look) => {
	let side = random() < 0.5 ? 1 : -1;
	const places = lines.map((line, index) => {
		side = -side;
		return {
			x: index ? side * between(random, 0.08, 0.2) * ctx.W : 0,
			y: index ? between(random, -0.12, 0.12) * ctx.H : 0,
			z: -index * TUNNEL_STEP,
			rot: index ? between(random, -7, 7) : 0,
			block: layoutBlock(line, ctx, blockOptions(look, line, { size: ctx.F * 0.9 * boostOf(line), maxLength: ctx.W * 0.76 })),
		};
	});
	const frames = places.map((place) => ({ x: place.x, y: place.y, z: place.z, roll: place.rot }));
	return { places, frames, drift: { z: 150, roll: 1 } };
};

// Lines scattered with tilts and sizes, still in reading order.
export const layoutCollage = (lines, ctx, random, look) => {
	const placed = [];
	const places = [];
	lines.forEach((line, index) => {
		const vertical = index > 0 && line.chars <= 8 && random() < 0.24;
		const block = layoutBlock(line, ctx, blockOptions(look, line, {
			size: ctx.F * between(random, 0.62, 1.02) * boostOf(line),
			maxLength: ctx.W * 0.6,
			light: lightFor(look, line) && random() < 0.6,
		}));
		const rot = vertical ? (random() < 0.5 ? 90 : -90) : between(random, -11, 11);
		const box = rotatedExtent(block, rot);
		const previous = placed[placed.length - 1] || null;
		let chosen = null;
		let fallback = null;
		for (let attempt = 0; attempt < 24 && !chosen; attempt += 1) {
			let x = 0;
			let y = 0;
			if (previous) {
				if (random() < 0.5) {
					x = previous.x + previous.w / 2 + box.w / 2 + between(random, 0.02, 0.09) * ctx.W;
					y = previous.y + between(random, -0.3, 0.3) * previous.h;
				} else {
					x = previous.x + between(random, -0.5, 0.2) * (previous.w + box.w);
					y = previous.y + previous.h / 2 + box.h / 2 + between(random, 0.02, 0.07) * ctx.H;
				}
			}
			const candidate = { x, y, w: box.w, h: box.h };
			fallback = fallback || candidate;
			const overlaps = placed.some((other) => Math.abs(other.x - x) < (other.w + box.w) / 2 + ctx.F * 0.14
				&& Math.abs(other.y - y) < (other.h + box.h) / 2 + ctx.F * 0.08);
			if (!overlaps) chosen = candidate;
		}
		if (!chosen && previous) chosen = { x: previous.x, y: previous.y + previous.h / 2 + box.h / 2 + ctx.F * 0.2, w: box.w, h: box.h };
		chosen = chosen || fallback;
		placed.push(chosen);
		places.push({ x: chosen.x, y: chosen.y, z: between(random, -120, 40), rot, block });
	});
	centerPlaces(places);
	const frames = places.map((place) => ({ x: place.x, y: place.y, z: place.z, roll: place.rot }));
	return { places, frames, drift: { z: 70, roll: 1.6 } };
};

// One line filling the screen, an optional second one small beneath it.
export const layoutHero = (lines, ctx, _random, look) => {
	const [first, second] = lines;
	const options = blockOptions(look, first, { emphScale: 1.25, light: false });
	const natural = layoutBlock(first, ctx, { ...options, size: 100, maxLength: Infinity }).leadWidth / 100;
	const size = clamp((ctx.W * 0.84) / Math.max(1, natural), ctx.F * 0.9, ctx.F * 2.5);
	let block = layoutBlock(first, ctx, { ...options, size, maxLength: ctx.W * 0.86 });
	if (block.height > ctx.H * 0.56) block = layoutBlock(first, ctx, { ...options, size: (size * ctx.H * 0.56) / block.height, maxLength: ctx.W * 0.86 });
	const places = [{ x: 0, y: 0, z: 0, rot: 0, block }];
	if (second) {
		const small = layoutBlock(second, ctx, blockOptions(look, second, {
			size: Math.max(ctx.F * 0.5, block.size * 0.42),
			maxLength: ctx.W * 0.8,
			light: true,
		}));
		places.push({ x: 0, y: block.height / 2 + ctx.F * 0.28 + small.height / 2, z: 0, rot: 0, block: small });
		centerPlaces(places);
	}
	const frames = places.map((place) => ({ x: 0, y: place.y * 0.5, z: 0, roll: 0 }));
	return { places, frames, drift: { z: 170, roll: 1.2 } };
};

// Each line a justified tower of its words, the lines stacked like a poster.
export const layoutTower = (lines, ctx, random, look) => {
	const width = ctx.W * between(random, 0.4, 0.54);
	const align = random() < 0.5 ? "left" : "center";
	const places = [];
	let y = 0;
	lines.forEach((line, index) => {
		const block = towerBlock(line, ctx, width, blockOptions(look, line, { emphScale: 1.1, align }));
		if (index) y += ctx.F * 0.24;
		places.push({ x: 0, y: y + block.height / 2, z: 0, rot: 0, block });
		y += block.height;
	});
	places.forEach((place) => { place.y -= y / 2; });
	const frames = places.map((place) => ({ x: 0, y: place.y, z: Math.max(0, (place.block.height - ctx.H * 0.6) * 0.9), roll: 0 }));
	return { places, frames, drift: { z: 110, roll: 1 } };
};

// Lines step down a diagonal staircase; the camera glides along it.
export const layoutStairs = (lines, ctx, random, look) => {
	const side = random() < 0.5 ? 1 : -1;
	const blocks = lines.map((line) => layoutBlock(line, ctx, blockOptions(look, line, {
		size: ctx.F * 0.84 * boostOf(line),
		maxLength: ctx.W * 0.56,
		align: side > 0 ? "left" : "right",
	})));
	const places = [];
	let edge = 0;
	let y = 0;
	blocks.forEach((block, index) => {
		if (index) {
			const previous = blocks[index - 1];
			edge += side * clamp(previous.width * 0.42, ctx.W * 0.1, ctx.W * 0.24);
			y += Math.max(previous.size, block.size) * 0.34;
		}
		places.push({ x: edge + (side * block.width) / 2, y: y + block.height / 2, z: 0, rot: 0, block });
		y += block.height;
	});
	centerPlaces(places);
	const frames = places.map((place) => ({ x: place.x, y: place.y, z: 0, roll: 0 }));
	return { places, frames, drift: { z: 90, roll: 1.2 } };
};

// Lines side by side on one long strip with a track drawn under them; the camera travels along it.
export const layoutStrip = (lines, ctx, random, look) => {
	const side = (ctx.typography[lines[0].n] || DEFAULT_INFO).rtl ? -1 : 1;
	const lift = (random() < 0.5 ? 1 : -1) * ctx.H * 0.06;
	const gap = ctx.W * 0.09;
	const places = [];
	let x = 0;
	lines.forEach((line, index) => {
		const block = layoutBlock(line, ctx, blockOptions(look, line, { size: ctx.F * 0.92 * boostOf(line), maxLength: ctx.W * 0.6 }));
		if (index) x += side * (places[index - 1].block.width / 2 + gap + block.width / 2);
		places.push({ x, y: index % 2 ? lift : -lift * 0.4, z: 0, rot: 0, block });
	});
	centerPlaces(places);
	const frames = places.map((place) => ({ x: place.x, y: place.y * 0.5, z: 0, roll: 0 }));
	const start = places[0].x - (side * places[0].block.width) / 2 - side * ctx.F * 0.4;
	const last = places[places.length - 1];
	const length = Math.abs(last.x + (side * last.block.width) / 2 + side * ctx.F * 0.4 - start);
	const track = {
		x: start,
		y: Math.max(...places.map((place) => place.y + place.block.height / 2)) + ctx.F * 0.26,
		z: 0,
		length,
		rot: side > 0 ? 0 : 180,
		stops: places.map((place) => clamp01((Math.abs(place.x - start) + place.block.width / 2 + ctx.F * 0.2) / length)),
	};
	return { places, frames, drift: { z: 100, roll: 0.8 }, strokes: [track] };
};

// Two columns facing each other across a centre line; the lines alternate sides (duets, call and response).
export const layoutSplit = (lines, ctx, random, look) => {
	const gutter = ctx.F * 0.42;
	const first = random() < 0.5 ? -1 : 1;
	const bottom = { [-1]: -Infinity, 1: -Infinity };
	const places = [];
	lines.forEach((line, index) => {
		const side = index % 2 ? -first : first;
		const block = layoutBlock(line, ctx, blockOptions(look, line, {
			size: ctx.F * 0.8 * boostOf(line),
			maxLength: ctx.W * 0.4,
			align: side < 0 ? "right" : "left",
		}));
		const previous = places[index - 1];
		// A line starts beside the lower part of the one across from it, below the last one on its own side.
		const top = previous
			? Math.max(bottom[side] + ctx.F * 0.3, previous.y + previous.block.height * 0.12)
			: 0;
		places.push({ x: side * (gutter + block.width / 2), y: top + block.height / 2, z: 0, rot: 0, block });
		bottom[side] = top + block.height;
	});
	const highest = Math.min(...places.map((place) => place.y - place.block.height / 2));
	const lowest = Math.max(...places.map((place) => place.y + place.block.height / 2));
	places.forEach((place) => { place.y -= (highest + lowest) / 2; });
	const frames = places.map((place) => ({ x: place.x * 0.55, y: place.y, z: 0, roll: 0 }));
	const length = lowest - highest + ctx.F * 0.7;
	const top = -(lowest - highest) / 2 - ctx.F * 0.35;
	// The divider reaches the bottom of each line as it is sung, and never draws back.
	let reached = 0;
	const divider = {
		x: 0,
		y: top,
		z: 0,
		length,
		rot: 90,
		stops: places.map((place) => (reached = Math.max(reached, clamp01((place.y + place.block.height / 2 + ctx.F * 0.2 - top) / length)))),
	};
	return { places, frames, drift: { z: 80, roll: 1 }, strokes: [divider] };
};

// Every line larger than the last: the shot builds.
export const layoutSwell = (lines, ctx, random, look) => {
	const count = lines.length;
	const align = random() < 0.4 ? "left" : "center";
	const places = [];
	let y = 0;
	lines.forEach((line, index) => {
		const grow = count > 1 ? index / (count - 1) : 1;
		const block = layoutBlock(line, ctx, blockOptions(look, line, {
			size: ctx.F * lerp(0.56, 1.5, grow),
			maxLength: ctx.W * lerp(0.46, 0.84, grow),
			emphScale: 1.15,
			align,
		}));
		if (index) y += block.size * 0.12;
		places.push({ x: 0, y: y + block.height / 2, z: 0, rot: 0, block });
		y += block.height;
	});
	const widest = Math.max(...places.map((place) => place.block.width));
	places.forEach((place) => {
		place.y -= y / 2;
		if (align === "left") place.x = -widest / 2 + place.block.width / 2;
	});
	const frames = places.map((place) => ({
		x: frameX(place, ctx, 0.5),
		y: place.y,
		z: Math.max(0, (place.block.height - ctx.H * 0.56) * 0.9),
		roll: 0,
	}));
	return { places, frames, drift: { z: 140, roll: 0.8 } };
};

// Lines radiate from a hub like spokes; the screen turns to read each one.
export const layoutRadial = (lines, ctx, random, look) => {
	// Never a quarter turn: four lines sit a fifth of a turn apart, so the spokes do not read as a square.
	const step = (360 / Math.max(3, lines.length === 4 ? 5 : lines.length)) * (random() < 0.5 ? 1 : -1);
	const blocks = lines.map((line) => layoutBlock(line, ctx, blockOptions(look, line, {
		size: ctx.F * 0.78 * boostOf(line),
		maxLength: ctx.W * 0.5,
		align: "left",
	})));
	const thickest = Math.max(...blocks.map((block) => block.height));
	// Far enough out that neighbouring spokes clear each other at the hub.
	const hub = thickest / (2 * Math.tan((Math.abs(step) * Math.PI) / 360)) + ctx.F * 0.5;
	const frames = [];
	const places = blocks.map((block, index) => {
		const angle = step * index;
		const out = rotate2d(1, 0, angle);
		const reach = hub + block.width / 2;
		// The camera sits towards the hub but keeps the whole spoke in frame.
		const view = clamp(reach * 0.84, hub + block.width - ctx.W * 0.46, hub + ctx.W * 0.46);
		frames.push({ x: out.x * view, y: out.y * view, z: 0, roll: angle });
		return { x: out.x * reach, y: out.y * reach, z: 0, rot: angle, block };
	});
	return { places, frames, drift: { z: 80, roll: 1.6 * Math.sign(step) } };
};

// Lines around a drum that turns about its upright axis. Seen from outside the
// neighbours curve away; from inside they lean in. The camera swings round to face each line.
export const layoutCarousel = (lines, ctx, random, look) => {
	const side = (ctx.typography[lines[0].n] || DEFAULT_INFO).rtl ? -1 : 1;
	const inside = random() < 0.35;
	const blocks = lines.map((line) => layoutBlock(line, ctx, blockOptions(look, line, {
		size: ctx.F * 0.88 * boostOf(line),
		maxLength: ctx.W * 0.5,
	})));
	const gap = ctx.W * 0.07;
	const arcs = [0];
	for (let index = 1; index < blocks.length; index += 1) arcs.push(arcs[index - 1] + blocks[index - 1].width / 2 + gap + blocks[index].width / 2);
	const total = arcs[arcs.length - 1];
	// At most a quarter turn from the first line to the last.
	const radius = Math.max(ctx.W * 1.25, total / 1.5);
	const places = blocks.map((block, index) => {
		const angle = (side * (arcs[index] - total / 2)) / radius;
		const degrees = (angle * 180) / Math.PI;
		return {
			x: radius * Math.sin(angle),
			y: 0,
			z: (inside ? 1 : -1) * radius * (1 - Math.cos(angle)),
			rot: 0,
			tiltY: inside ? -degrees : degrees,
			block,
		};
	});
	const frames = places.map((place) => ({ x: place.x, y: place.y, z: place.z, roll: 0, face: true }));
	return { places, frames, drift: { z: 100, roll: 0.8 } };
};

// Lines on a drum that rolls like a slot-machine reel: sung lines roll away over the top.
export const layoutReel = (lines, ctx, random, look) => {
	const align = random() < 0.35 ? "left" : "center";
	const blocks = lines.map((line) => layoutBlock(line, ctx, blockOptions(look, line, {
		size: ctx.F * 0.92 * boostOf(line),
		maxLength: ctx.W * 0.74,
		align,
	})));
	const gap = ctx.F * 0.36;
	const arcs = [0];
	for (let index = 1; index < blocks.length; index += 1) arcs.push(arcs[index - 1] + blocks[index - 1].height / 2 + gap + blocks[index].height / 2);
	const total = arcs[arcs.length - 1];
	// About 28 degrees between lines, at most a third of a turn in all.
	const radius = Math.max(ctx.H * 0.42, total / Math.max(1, blocks.length - 1) / 0.5, total / 2.1);
	const widest = Math.max(...blocks.map((block) => block.width));
	const places = blocks.map((block, index) => {
		const angle = (arcs[index] - total / 2) / radius;
		return {
			x: align === "left" ? -widest / 2 + block.width / 2 : 0,
			y: radius * Math.sin(angle),
			z: -radius * (1 - Math.cos(angle)),
			rot: 0,
			tiltX: (-angle * 180) / Math.PI,
			block,
		};
	});
	const frames = places.map((place) => ({ x: frameX(place, ctx, 0.5), y: place.y, z: place.z, roll: 0, face: true }));
	return { places, frames, drift: { z: 90, roll: 0.8 } };
};

const CRAWL_TILT = 36;

// Lines lying on a plane that tilts away like an opening crawl: sung lines
// recede into the distance (or, tilted the other way, the coming ones do).
export const layoutCrawl = (lines, ctx, random, look) => {
	const tilt = (random() < 0.6 ? 1 : -1) * CRAWL_TILT;
	const blocks = lines.map((line) => layoutBlock(line, ctx, blockOptions(look, line, {
		size: ctx.F * 0.96 * boostOf(line),
		maxLength: ctx.W * 0.7,
	})));
	const along = [];
	let position = 0;
	blocks.forEach((block, index) => {
		if (index) position += Math.max(blocks[index - 1].size, block.size) * 0.34;
		along.push(position + block.height / 2);
		position += block.height;
	});
	const radians = (tilt * Math.PI) / 180;
	const places = blocks.map((block, index) => {
		const offset = along[index] - position / 2;
		return { x: 0, y: offset * Math.cos(radians), z: offset * Math.sin(radians), rot: 0, tiltX: tilt, block };
	});
	const frames = places.map((place) => ({ x: 0, y: place.y, z: place.z, roll: 0 }));
	return { places, frames, drift: { z: 120, roll: 0.6 } };
};

// ---- Compositions after kinetic-typography edits: one thought at a time, flat colour, type as an object ----

// Colours of plates and floods: two deep palette colours and ink. Type stays white on all three.
const GROUNDS = Object.freeze(["deep", "ink", "deep2"]);
const groundOf = (index, offset) => GROUNDS[(index + offset) % GROUNDS.length];

// One line at a time in the same place, inside a band drawn across the screen: each line replaces the last.
export const layoutSlot = (lines, ctx, _random, look) => {
	const blocks = lines.map((line) => layoutBlock(line, ctx, blockOptions(look, line, { size: ctx.F * 1.02 * boostOf(line), maxLength: ctx.W * 0.62 })));
	const tallest = Math.max(...blocks.map((block) => block.height));
	const widest = Math.max(...blocks.map((block) => block.width));
	const places = blocks.map((block) => ({ x: 0, y: 0, z: 0, rot: 0, block }));
	const frames = places.map(() => ({ x: 0, y: 0, z: 0, roll: 0 }));
	const band = { kind: "band", color: "ink", x: 0, y: 0, z: -8, w: ctx.W * 4, h: tallest + ctx.F * 0.8, rot: 0, radius: 0, line: 0 };
	const tick = (side) => ({
		x: side * (widest / 2 + ctx.F * 0.55),
		y: -(tallest / 2 + ctx.F * 0.14),
		z: 0,
		length: tallest + ctx.F * 0.28,
		rot: 90,
		stops: places.map(() => 1),
	});
	return { places, frames, drift: { z: 60, roll: 0.5 }, solo: true, plates: [band], strokes: [tick(-1), tick(1)] };
};

// One line at a time, as large as the screen allows, on a flat colour field that changes with every line.
export const layoutPoster = (lines, ctx, random, look) => {
	const offset = Math.floor(random() * GROUNDS.length);
	const places = lines.map((line, index) => {
		const options = blockOptions(look, line, { emphScale: 1.2, light: false });
		const natural = layoutBlock(line, ctx, { ...options, size: 100, maxLength: Infinity }).leadWidth / 100;
		const size = clamp((ctx.W * 0.86) / Math.max(1, natural), ctx.F * 0.95, ctx.F * 2.6);
		let block = layoutBlock(line, ctx, { ...options, size, maxLength: ctx.W * 0.86 });
		if (block.height > ctx.H * 0.6) block = layoutBlock(line, ctx, { ...options, size: (size * ctx.H * 0.6) / block.height, maxLength: ctx.W * 0.86 });
		const color = groundOf(index, offset);
		return { x: 0, y: 0, z: 0, rot: 0, block, flood: color, ground: color === "ink" ? "dark" : "color" };
	});
	const frames = places.map(() => ({ x: 0, y: 0, z: 0, roll: 0 }));
	return { places, frames, drift: { z: 120, roll: 0.6 }, solo: true };
};

// The shot's lines repeated across the whole screen as outlines, a little askew; each fills in where it is sung.
export const layoutWordwall = (lines, ctx, random, look) => {
	const width = ctx.W * 0.62;
	const places = [];
	const rows = [];
	let y = 0;
	lines.forEach((line, index) => {
		const options = blockOptions(look, line, { emphScale: 1.1, light: false });
		const natural = layoutBlock(line, ctx, { ...options, size: 100, maxLength: Infinity }).leadWidth / 100;
		const size = clamp(width / Math.max(1, natural), ctx.F * 0.5, ctx.F * 1.5);
		const block = layoutBlock(line, ctx, { ...options, size, maxLength: Infinity });
		const info = ctx.typography[line.n] || DEFAULT_INFO;
		const spec = ctx.font(info.script, look.type, "display");
		const text = block.words.slice(0, line.words.length).map((word) => word.text).join(" ");
		if (index) y += block.size * 0.16;
		const place = { x: (index % 2 ? 1 : -1) * ctx.W * 0.07, y: y + block.height / 2, z: 0, rot: 0, block };
		places.push(place);
		rows.push({ place, text, spec, size: block.size, copy: ctx.measure(text, block.size, spec) });
		y += block.height;
	});
	places.forEach((place) => { place.y -= y / 2; });
	const fills = [];
	const tile = (row, cx, cy, from, to) => {
		const step = row.copy + row.size * 0.55;
		for (let k = from; k <= to; k += 1) {
			if (k) fills.push({ text: row.text, spec: row.spec, size: row.size, x: cx + k * step + Math.sign(k) * (row.place.block.width - row.copy) / 2, y: cy, z: 0, rot: 0 });
		}
	};
	rows.forEach((row) => tile(row, row.place.x, row.place.y, -2, 2));
	// A row of outlines above the first line and below the last, set like bricks.
	const first = rows[0];
	const last = rows[rows.length - 1];
	const over = { ...last, place: { ...last.place, block: { width: last.copy } } };
	const under = { ...first, place: { ...first.place, block: { width: first.copy } } };
	for (const [row, cy] of [[over, first.place.y - first.place.block.height / 2 - last.size * 0.62], [under, last.place.y + last.place.block.height / 2 + first.size * 0.62]]) {
		const shift = row.copy * 0.5;
		fills.push({ text: row.text, spec: row.spec, size: row.size, x: shift, y: cy, z: 0, rot: 0 });
		tile(row, shift, cy, -2, 2);
	}
	const frames = places.map((place) => ({ x: place.x, y: place.y, z: 0, roll: 0 }));
	return { places, frames, drift: { z: 90, roll: 0.8 }, fills, tilt: (random() < 0.5 ? 1 : -1) * between(random, 7, 12) };
};

// A line may cover this much of the great circle it is set round (radians).
const ARCH_SPAN = 1.1;

/** A line's words in one row bent round a circle: each word stands on the curve. */
const archBlock = (line, ctx, options, radius) => {
	const info = ctx.typography[line.n] || DEFAULT_INFO;
	const items = itemsOf(line, ctx, options);
	const natural = rowWidth(items);
	const scale = Math.min(1, (radius * ARCH_SPAN) / Math.max(1, natural));
	const length = natural * scale;
	const side = info.rtl ? -1 : 1;
	const words = [];
	let along = -length / 2;
	let tallest = 0;
	items.forEach((item, position) => {
		if (position) along += item.gap * scale;
		const width = item.width * scale;
		const size = item.size * scale;
		const angle = (side * (along + width / 2)) / radius;
		words[item.index] = {
			x: radius * Math.sin(angle),
			y: radius * (1 - Math.cos(angle)),
			rot: (angle * 180) / Math.PI,
			size, width, role: item.role, emph: item.emph, voice: 0, spec: item.spec, text: item.text, letters: item.letters,
		};
		tallest = Math.max(tallest, size);
		along += width;
	});
	const half = Math.min(Math.PI / 2, length / 2 / radius);
	return {
		words,
		width: 2 * radius * Math.sin(half),
		height: tallest * 1.1 + radius * (1 - Math.cos(half)),
		rows: 1,
		size: options.size * scale,
		rtl: info.rtl,
		leadWidth: length,
	};
};

// Lines set round a great circle like the lettering on a seal: the screen turns as the song goes round it.
export const layoutArch = (lines, ctx, random, look) => {
	const direction = (ctx.typography[lines[0].n] || DEFAULT_INFO).rtl ? -1 : 1;
	const radius = ctx.W * between(random, 0.5, 0.62);
	const blocks = lines.map((line) => (line.backing.length
		// Other voices need rows of their own: such a line stays straight.
		? layoutBlock(line, ctx, blockOptions(look, line, { size: ctx.F * 0.8 * boostOf(line), maxLength: ctx.W * 0.56 }))
		: archBlock(line, ctx, blockOptions(look, line, { size: ctx.F * 0.92 * boostOf(line) }), radius)));
	const places = [];
	const frames = [];
	let angle = 0;
	let before = 0;
	blocks.forEach((block, index) => {
		const span = (block.leadWidth || block.width) / radius;
		if (index) angle += direction * ((before + span) / 2 + (ctx.F * 0.9) / radius);
		before = span;
		const degrees = (angle * 180) / Math.PI;
		const out = rotate2d(0, -1, degrees);
		places.push({ x: out.x * radius, y: out.y * radius, z: 0, rot: degrees, block });
		// From a little inside the circle, so the arc rises over the middle of the screen.
		const view = radius - ctx.H * 0.1;
		frames.push({ x: out.x * view, y: out.y * view, z: 0, roll: degrees });
	});
	const inner = radius - ctx.F * 1.15;
	const ring = { kind: "ring", color: "line", x: 0, y: 0, z: -6, w: inner * 2, h: inner * 2, rot: 0, radius: inner, line: 0 };
	return { places, frames, drift: { z: 70, roll: 1.4 * direction }, plates: [ring] };
};

/** A line's words set apart like stepping stones across the screen, one higher, the next lower. */
const spreadBlock = (line, ctx, options, random) => {
	const info = ctx.typography[line.n] || DEFAULT_INFO;
	const items = itemsOf(line, ctx, options);
	const rows = items.length > 5 ? splitRows(items, 2, rowWidth(items)) : [items];
	const side = info.rtl ? -1 : 1;
	const words = [];
	let span = 0;
	rows.forEach((row, rowIndex) => {
		const total = row.reduce((sum, item) => sum + item.width, 0);
		const room = ctx.W * 0.82;
		const scale = Math.min(1, (room * 0.84) / Math.max(1, total));
		const gap = row.length > 1 ? Math.min((room - total * scale) / (row.length - 1), ctx.W * 0.2) : 0;
		const width = total * scale + gap * (row.length - 1);
		span = Math.max(span, width);
		const middle = (rowIndex - (rows.length - 1) / 2) * ctx.H * 0.3;
		let x = -width / 2;
		row.forEach((item, position) => {
			const itemWidth = item.width * scale;
			const lift = row.length > 1 ? (position % 2 ? 1 : -1) * ctx.H * between(random, 0.035, 0.1) : 0;
			words[item.index] = {
				x: side * (x + itemWidth / 2),
				y: middle + lift,
				rot: row.length > 1 ? between(random, -4, 4) : 0,
				size: item.size * scale, width: itemWidth, role: item.role, emph: item.emph, voice: 0, spec: item.spec, text: item.text, letters: item.letters,
			};
			x += itemWidth + gap;
		});
	});
	const height = (rows.length - 1) * ctx.H * 0.3 + ctx.H * 0.2 + options.size * 1.3;
	return { words, width: span, height, rows: rows.length, size: options.size, rtl: info.rtl, leadWidth: span };
};

// One line at a time, its words scattered across the width; each word lands on its beat.
export const layoutSpread = (lines, ctx, random, look) => {
	const places = lines.map((line) => ({
		x: 0, y: 0, z: 0, rot: 0,
		block: line.backing.length
			? layoutBlock(line, ctx, blockOptions(look, line, { size: ctx.F * 1.05 * boostOf(line), maxLength: ctx.W * 0.74 }))
			: spreadBlock(line, ctx, blockOptions(look, line, { size: ctx.F * 1.08 * boostOf(line), light: false }), random),
	}));
	const frames = places.map(() => ({ x: 0, y: 0, z: 0, roll: 0 }));
	return { places, frames, drift: { z: 110, roll: 1 }, solo: true };
};

// Lines that can stand upright: Korean, Japanese and Chinese without Latin words or other voices.
const UPRIGHT_RE = /^[\p{Script=Hangul}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{P}\p{N}\s\u30fc]+$/u;
export const standsUpright = (line) => UPRIGHT_RE.test(line.text) && !line.backing.length;

/** A line set top to bottom, in two columns (right to left) when it is long. */
export const pillarBlock = (line, ctx, options) => {
	const items = itemsOf(line, ctx, options);
	const lengthOf = (item) => graphemesOf(item.text).length * item.size * 1.02;
	const gap = options.size * 0.3;
	const most = ctx.H * 0.64;
	// A long line splits into at most MAX_LINE_ROWS balanced columns, set smaller when they are still too tall.
	const spans = items.map((item, index) => ({ item, width: lengthOf(item), gap: index ? gap : 0 }));
	const total = rowWidth(spans);
	const columns = (total > most && items.length > 1 ? splitRows(spans, Math.min(MAX_LINE_ROWS, items.length), total) : [spans])
		.map((column) => column.map((span) => span.item));
	const heights = columns.map((column) => column.reduce((sum, item, index) => sum + lengthOf(item) + (index ? gap : 0), 0));
	const scale = Math.min(1, most / Math.max(...heights));
	const pitch = options.size * 1.34 * scale;
	const width = columns.length * pitch;
	const height = Math.max(...heights) * scale;
	const words = [];
	columns.forEach((column, index) => {
		let top = -height / 2;
		column.forEach((item, position) => {
			if (position) top += gap * scale;
			const length = lengthOf(item) * scale;
			words[item.index] = {
				x: width / 2 - pitch * (index + 0.5),
				y: top + length / 2,
				vertical: true,
				size: item.size * scale, width: item.size * scale, height: length, role: item.role, emph: item.emph, voice: 0, spec: item.spec, text: item.text, letters: item.letters,
			};
			top += length;
		});
	});
	return { words, width, height, rows: columns.length, size: options.size * scale, rtl: false, leadWidth: width };
};

// Lines set upright like banners, read right to left (Korean, Japanese and Chinese).
export const layoutPillar = (lines, ctx, _random, look) => {
	const blocks = lines.map((line) => pillarBlock(line, ctx, blockOptions(look, line, { size: ctx.F * 0.98 * boostOf(line), light: false })));
	const gap = ctx.F * 1.5;
	const places = [];
	let x = 0;
	blocks.forEach((block, index) => {
		if (index) x -= blocks[index - 1].width / 2 + gap + block.width / 2;
		// Every line hangs from the same height, the next a little lower.
		places.push({ x, y: block.height / 2 + index * ctx.F * 0.5, z: 0, rot: 0, block, upright: true });
	});
	centerPlaces(places);
	const frames = places.map((place) => ({ x: place.x * 0.7, y: place.y * 0.5, z: 0, roll: 0 }));
	return { places, frames, drift: { z: 90, roll: 0.6 } };
};

// Lines riding a long wave across the screen: each tilts with the slope under it and the camera rolls along the swell.
export const layoutWave = (lines, ctx, random, look) => {
	const side = (ctx.typography[lines[0].n] || DEFAULT_INFO).rtl ? -1 : 1;
	const blocks = lines.map((line) => layoutBlock(line, ctx, blockOptions(look, line, { size: ctx.F * 0.84 * boostOf(line), maxLength: ctx.W * 0.56 })));
	const gap = ctx.F * 0.75;
	const amplitude = ctx.H * between(random, 0.1, 0.16);
	const phase = random() < 0.5 ? 0 : Math.PI;
	const places = [];
	let x = 0;
	blocks.forEach((block, index) => {
		if (index) x += blocks[index - 1].width / 2 + gap + block.width / 2;
		places.push({ x, y: 0, z: 0, rot: 0, block });
	});
	// About one and a half swells over the shot, however long it is.
	const wavelength = Math.max(ctx.W * 0.9, x / 1.5);
	places.forEach((place) => {
		const angle = (2 * Math.PI * place.x) / wavelength + phase;
		const slope = ((amplitude * 2 * Math.PI) / wavelength) * Math.cos(angle) * side;
		place.y = amplitude * Math.sin(angle);
		place.rot = clamp((Math.atan(slope) * 180) / Math.PI, -11, 11);
		place.x *= side;
	});
	centerPlaces(places);
	const frames = places.map((place) => ({ x: place.x, y: place.y, z: 0, roll: place.rot }));
	return { places, frames, drift: { z: 80, roll: 0.9 } };
};

// Lines scattered wide like stars on a chart, a thin line drawn from each to the next as it is sung.
export const layoutConstellation = (lines, ctx, random, look) => {
	const places = [];
	let side = random() < 0.5 ? 1 : -1;
	lines.forEach((line, index) => {
		const block = layoutBlock(line, ctx, blockOptions(look, line, { size: ctx.F * between(random, 0.66, 0.92) * boostOf(line), maxLength: ctx.W * 0.5 }));
		if (!index) {
			places.push({ x: 0, y: 0, z: 0, rot: 0, block });
			return;
		}
		side = -side;
		const previous = places[index - 1];
		// Across and up or down from the last line, far enough apart for the line between them to read.
		const x = previous.x + side * (previous.block.width / 2 + block.width / 2 + ctx.W * between(random, 0.05, 0.14));
		const y = previous.y + (random() < 0.5 ? -1 : 1) * (previous.block.height / 2 + block.height / 2 + ctx.H * between(random, 0.08, 0.2));
		places.push({ x, y, z: between(random, -90, 60), rot: 0, block });
	});
	centerPlaces(places);
	const strokes = [];
	places.forEach((place, index) => {
		const next = places[index + 1];
		if (!next) return;
		const dx = next.x - place.x;
		const dy = next.y - place.y;
		const length = Math.hypot(dx, dy) || 1;
		const ux = dx / length;
		const uy = dy / length;
		// From the edge of one line's box to the edge of the next.
		const reach = (target) => Math.min(target.block.width / 2 / Math.max(0.001, Math.abs(ux)), target.block.height / 2 / Math.max(0.001, Math.abs(uy))) + ctx.F * 0.3;
		const from = reach(place);
		const span = length - from - reach(next);
		if (span < ctx.F * 0.6) return;
		strokes.push({
			x: place.x + ux * from,
			y: place.y + uy * from,
			z: Math.max(place.z, next.z),
			length: span,
			rot: (Math.atan2(dy, dx) * 180) / Math.PI,
			stops: places.map((_, local) => (local > index ? 1 : 0)),
		});
	});
	const frames = places.map((place) => ({ x: place.x, y: place.y, z: place.z, roll: 0 }));
	return { places, frames, drift: { z: 90, roll: 1.1 }, strokes };
};

// A modular poster grid: each line set tight in its own cell, the rules between the cells drawn as they fill.
export const layoutGrid = (lines, ctx, random, look) => {
	const side = (ctx.typography[lines[0].n] || DEFAULT_INFO).rtl ? -1 : 1;
	const columns = lines.length <= 1 ? 1 : 2;
	const rows = Math.ceil(lines.length / columns);
	const cellWidth = ctx.W * (columns === 1 ? 0.72 : 0.4);
	const pad = ctx.F * 0.32;
	const blocks = lines.map((line) => layoutBlock(line, ctx, blockOptions(look, line, {
		size: ctx.F * 0.8 * boostOf(line),
		maxLength: cellWidth - pad * 2,
		align: side > 0 ? "left" : "right",
	})));
	// Reading along the rows, or down the columns first.
	const down = lines.length > 2 && random() < 0.4;
	const cellOf = (index) => (down ? { column: Math.floor(index / rows), row: index % rows } : { column: index % columns, row: Math.floor(index / columns) });
	const rowHeights = Array.from({ length: rows }, (_, row) => Math.max(...blocks.filter((_, index) => cellOf(index).row === row).map((block) => block.height)) + pad * 2);
	const tops = rowHeights.map((_, row) => rowHeights.slice(0, row).reduce((sum, height) => sum + height, 0));
	const height = tops[rows - 1] + rowHeights[rows - 1];
	const width = cellWidth * columns;
	const places = blocks.map((block, index) => {
		const { column, row } = cellOf(index);
		const left = -width / 2 + column * cellWidth + pad;
		return { x: side * (left + block.width / 2), y: -height / 2 + tops[row] + pad + block.height / 2, z: 0, rot: 0, block };
	});
	const strokes = [];
	if (columns > 1) {
		// The rule between the columns grows down as the lines are sung.
		strokes.push({ x: 0, y: -height / 2, z: 0, length: height, rot: 90, stops: places.map((_, local) => clamp01((local + 1) / places.length)) });
	}
	for (let row = 1; row < rows; row += 1) {
		const first = places.findIndex((_, index) => cellOf(index).row === row);
		strokes.push({ x: side * (-width / 2), y: -height / 2 + tops[row], z: 0, length: width, rot: side > 0 ? 0 : 180, stops: places.map((_, local) => (local >= first ? 1 : 0)) });
	}
	const frames = places.map((place) => ({ x: frameX(place, ctx, 0.6), y: place.y * 0.8, z: 0, roll: 0 }));
	return { places, frames, drift: { z: 70, roll: 0.6 }, strokes };
};

// Lines set small in the corners of a wide frame with the middle left open; the camera barely moves.
export const layoutCorners = (lines, ctx, random, look) => {
	const order = random() < 0.5 ? [[-1, -1], [1, 1], [1, -1], [-1, 1]] : [[-1, -1], [1, -1], [-1, 1], [1, 1]];
	// Inside the frame from wherever the camera stands (it moves only a little towards each line).
	const reachX = ctx.W * 0.37;
	const reachY = ctx.H * 0.31;
	const places = lines.map((line, index) => {
		const [sx, sy] = order[index % order.length];
		const block = layoutBlock(line, ctx, blockOptions(look, line, {
			size: ctx.F * 0.72 * boostOf(line),
			maxLength: ctx.W * 0.4,
			align: sx < 0 ? "left" : "right",
		}));
		return { x: sx * Math.max(block.width / 2, reachX - block.width / 2), y: sy * Math.max(block.height / 2 + ctx.F * 0.2, reachY - block.height / 2), z: 0, rot: 0, block };
	});
	const frames = places.map((place) => ({ x: place.x * 0.16, y: place.y * 0.16, z: 0, roll: 0 }));
	return { places, frames, drift: { z: 24, roll: 0.4 } };
};
