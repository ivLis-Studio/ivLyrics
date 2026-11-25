import { boxesOf, extentOf } from "./motionBoardGeometry.mjs";
import { rotate2d } from "./motionMath.mjs";
import { DEFAULT_INFO } from "./motionTypesetting.mjs";

/**
 * The members of a composition in runs that belong together: the pieces a
 * lyric line was broken into (expandPieces) form one run, a whole line its own.
 */
const pieceRuns = (lines) => {
	const runs = [];
	lines.forEach((line, index) => {
		const previous = lines[index - 1];
		const continues = previous && line.part > 0 && Number.isInteger(line.source) && previous.source === line.source;
		if (continues) runs[runs.length - 1].push(index);
		else runs.push([index]);
	});
	return runs;
};

/**
 * The pieces of one lyric line set together as that line would be set
 * (makeBlock: lockupBlock, layoutBlock...), each piece getting its own
 * words back as a block centred on its own box (x, y: where that box sits
 * in the line). Null when the line has other voices (their rows belong to
 * single pieces).
 */
const runParts = (members, ctx, makeBlock) => {
	if (members.length < 2 || members.some((line) => line.backing.length)) return null;
	const head = members[0];
	const words = [];
	const scripts = [];
	const emph = new Set();
	const offsets = [];
	members.forEach((line) => {
		offsets.push(words.length);
		const info = ctx.typography[line.n] || DEFAULT_INFO;
		line.words.forEach((word, index) => {
			if (line.emph.has(index)) emph.add(words.length);
			scripts.push((info.words || [])[index]);
			words.push(word);
		});
	});
	const whole = { ...head, n: 0, words, backing: [], emph, chars: members.reduce((sum, line) => sum + (line.chars || 0), 0) };
	const block = makeBlock(whole, { ...ctx, typography: [{ ...(ctx.typography[head.n] || DEFAULT_INFO), words: scripts }] });
	return members.map((line, member) => {
		const own = block.words.slice(offsets[member], offsets[member] + line.words.length);
		const left = Math.min(...own.map((word) => word.x - word.width / 2));
		const right = Math.max(...own.map((word) => word.x + word.width / 2));
		const top = Math.min(...own.map((word) => word.y - word.size * 0.5));
		const bottom = Math.max(...own.map((word) => word.y + word.size * 0.5));
		const x = (left + right) / 2;
		const y = (top + bottom) / 2;
		const size = Math.max(...own.map((word) => word.size));
		return {
			x,
			y,
			block: { words: own.map((word) => ({ ...word, x: word.x - x, y: word.y - y })), width: right - left, height: bottom - top, rows: 1, size, rtl: block.rtl, leadWidth: right - left },
		};
	});
};

/**
 * A composition's members as units that move together: a line set in
 * pieces is one unit (its pieces where the whole line would have its
 * words), a whole line a unit of its own. makeBlock(line, ctx, unit) sets
 * a line. Each unit: its members, where each sits (centred on the unit)
 * and the unit's box.
 */
export const runUnits = (lines, ctx, makeBlock) => pieceRuns(lines).map((members, unit) => {
	const make = (line, lineCtx) => makeBlock(line, lineCtx, unit);
	let parts = runParts(members.map((index) => lines[index]), ctx, make);
	if (!parts) {
		// Whole lines (or pieces with other voices): stacked under each other.
		const gap = ctx.F * 0.22;
		const blocks = members.map((index) => make(lines[index], ctx));
		const height = blocks.reduce((sum, block) => sum + block.height, 0) + gap * (blocks.length - 1);
		const widest = Math.max(...blocks.map((block) => block.width));
		let top = -height / 2;
		parts = blocks.map((block) => {
			const part = { x: -widest / 2 + block.width / 2, y: top + block.height / 2, block };
			top += block.height + gap;
			return part;
		});
	}
	const left = Math.min(...parts.map((part) => part.x - part.block.width / 2));
	const right = Math.max(...parts.map((part) => part.x + part.block.width / 2));
	const top = Math.min(...parts.map((part) => part.y - part.block.height / 2));
	const bottom = Math.max(...parts.map((part) => part.y + part.block.height / 2));
	const cx = (left + right) / 2;
	const cy = (top + bottom) / 2;
	return { members, parts: parts.map((part) => ({ ...part, x: part.x - cx, y: part.y - cy })), width: right - left, height: bottom - top };
});

/**
 * Places and camera frames for units set at boxes (x, y, rot): every
 * member where its unit puts it, all centred, the camera holding still on
 * the pieces of one line.
 */
export const placeUnits = (units, boxes, count) => {
	const places = new Array(count);
	units.forEach((unit, index) => {
		const box = boxes[index];
		unit.members.forEach((member, position) => {
			const part = unit.parts[position];
			const at = rotate2d(part.x, part.y, box.rot);
			places[member] = { x: box.x + at.x, y: box.y + at.y, z: 0, rot: box.rot, block: part.block };
		});
	});
	const extent = extentOf(boxesOf(places));
	places.forEach((place) => {
		place.x -= extent.cx;
		place.y -= extent.cy;
	});
	const frames = new Array(count);
	units.forEach((unit, index) => {
		const box = boxes[index];
		for (const member of unit.members) frames[member] = { x: box.x - extent.cx, y: box.y - extent.cy, z: 0, roll: box.rot };
	});
	return { places, frames };
};
