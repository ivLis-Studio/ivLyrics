import { clamp, rotate2d } from "./motionMath.mjs";

export const rotatedExtent = (block, rot) => {
	const radians = (rot * Math.PI) / 180;
	const cos = Math.abs(Math.cos(radians));
	const sin = Math.abs(Math.sin(radians));
	return { w: block.width * cos + block.height * sin, h: block.width * sin + block.height * cos };
};
export const extentOf = (boxes) => {
	const left = Math.min(...boxes.map((box) => box.x - box.w / 2));
	const right = Math.max(...boxes.map((box) => box.x + box.w / 2));
	const top = Math.min(...boxes.map((box) => box.y - box.h / 2));
	const bottom = Math.max(...boxes.map((box) => box.y + box.h / 2));
	return { cx: (left + right) / 2, cy: (top + bottom) / 2, w: right - left, h: bottom - top };
};
export const boxesOf = (places) => places.map((place) => ({ ...rotatedExtent(place.block, place.rot), x: place.x, y: place.y }));
export const centerPlaces = (places) => {
	const extent = extentOf(boxesOf(places));
	places.forEach((place) => {
		place.x -= extent.cx;
		place.y -= extent.cy;
	});
};
export const cornersOf = (place) => {
	const halfWidth = place.block.width / 2;
	const halfHeight = place.block.height / 2;
	return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => {
		const point = rotate2d(sx * halfWidth, sy * halfHeight, place.rot);
		return { x: place.x + point.x, y: place.y + point.y };
	});
};
/** The companion face sets off the emphasised words, so a line uses it only when it has some. */
export const lightFor = (look, line) => look.light && look.emph(line).size > 0;
export const blockOptions = (look, line, extra) => ({ emph: look.emph(line), type: look.type, serif: look.serif, upper: look.upper, accent: look.accent, light: lightFor(look, line), ...extra });
/** Short lines are set larger. */
export const boostOf = (line) => (line.chars <= 4 ? 1.36 : line.chars <= 8 ? 1.16 : 1);
/** The camera follows a line part of the way from the board's centre, keeping all of it in frame. */
export const frameX = (place, ctx, follow) => {
	const slack = ctx.W * 0.46 - place.block.width / 2;
	const x = place.x * follow;
	return slack > 0 ? clamp(x, place.x - slack, place.x + slack) : place.x;
};
