import { restAt, uprightAt } from "./motionCamera.mjs";
import { PERSPECTIVE_PX } from "./motionCameraFraming.mjs";
import { REVEAL_ENTERS } from "./motionDirectionVocabulary.mjs";
import { clamp, clamp01, easeInOutCubic, easeOutExpo, lerp, rotate2d, round } from "./motionMath.mjs";
import { fxPaceOf } from "./motionTypeEffects.mjs";

const BG_SWAY = Object.freeze({ slow: 3.4, mid: 4.2, fast: 4.8, rap: 4.4 });

/**
 * Smallest scale at which a width x height layer, turned by degrees and
 * moved by (x, y), still covers a screen of the same size.
 */
export const coverScale = (degrees, width, height, x = 0, y = 0) => {
	let scale = 0;
	for (const [cx, cy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
		const local = rotate2d((cx * width) / 2 - x, (cy * height) / 2 - y, -degrees);
		scale = Math.max(scale, Math.abs(local.x) / (width / 2), Math.abs(local.y) / (height / 2));
	}
	return scale;
};

/**
 * Rotation, zoom and offset of the video background so it moves like the
 * far plane of the same camera: it turns with the roll, slides against
 * 3D swings and travel, and zooms with the dolly and the beat. Given the
 * time, it is not left turned (uprightAt, interludes) and keeps moving on
 * its own: a slow turn, drift and breath, and a swing past the camera's
 * turn while the camera travels between boards.
 */
export const backgroundFrame = (plan, pose, time = NaN) => {
	const timed = Number.isFinite(time);
	let x = 0;
	let y = 0;
	let swing = 0;
	if (pose.sway) {
		const move = rotate2d(pose.sway.dx, pose.sway.dy, -pose.roll);
		const length = Math.hypot(move.x, move.y);
		if (length > 1) {
			const arc = Math.sin(Math.PI * pose.sway.u);
			const amount = arc * plan.W * (pose.sway.whip ? 0.15 : pose.sway.board ? 0.09 : 0.035);
			x = (-move.x / length) * amount;
			y = (-move.y / length) * amount;
			// Between boards the far plane swings a little past the camera's own turn.
			if (pose.sway.board || pose.sway.whip) swing = arc * (pose.sway.whip ? 9 : 6) * (move.x >= 0 ? 1 : -1);
		}
	}
	// Swings slide the video fully; the standing turn that faces a drum line only a little (it would zoom the video in for the whole line).
	const yaw = (pose.yaw || 0) - (pose.faceYaw || 0) * 0.72;
	const pitch = (pose.pitch || 0) - (pose.facePitch || 0) * 0.72;
	x -= Math.sin((yaw * Math.PI) / 180) * plan.W * 0.55;
	y += Math.sin((pitch * Math.PI) / 180) * plan.H * 0.55;
	const dolly = PERSPECTIVE_PX / (PERSPECTIVE_PX + (pose.dolly || 0) * 0.45);
	let roll = pose.roll;
	let breath = 1;
	if (timed) {
		roll += uprightAt(plan, time);
		// Interludes: the picture comes back upright under the camera's swing.
		const rest = restAt(plan, time);
		if (rest > 0) roll += (Math.round(roll / 360) * 360 - roll) * rest;
		const sway = BG_SWAY[plan.tempo] || BG_SWAY.mid;
		const turn = plan.feel?.turn ?? 1;
		roll += (Math.sin(time * 0.00057 + 0.4) * sway + Math.sin(time * 0.00131 + 1.7) * sway * 0.3 + swing) * turn;
		x += Math.sin(time * 0.00041 + 2.2) * plan.W * 0.018;
		y += Math.sin(time * 0.00049 + 0.9) * plan.H * 0.018;
		breath = 1 + 0.05 * (0.5 + 0.5 * Math.sin(time * 0.00071 + 1.1));
	}
	// A viewer who turned rotation off never sees the picture turn.
	if (plan.feel?.turn === 0) roll = 0;
	const wanted = coverScale(-roll, plan.W, plan.H) * 1.14 * dolly * breath * (1 + (pose.beat || 0) * 0.06);
	const scale = Math.max(wanted, coverScale(-roll, plan.W, plan.H, x, y) * 1.01);
	return { rotate: -roll, scale, x, y };
};

/** Opacity of the letterbox bars at a time. */
export const barsLevel = (plan, time) => {
	let level = 0;
	for (const window of plan?.bars || []) {
		if (time < window.start || time > window.end + 500) continue;
		const into = easeInOutCubic(clamp01((time - window.start) / 500));
		const out = Number.isFinite(window.end) ? 1 - easeInOutCubic(clamp01((time - window.end) / 500)) : 1;
		level = Math.max(level, into * out);
	}
	return level;
};

/** The colour panel sweeping across the screen, as a -1..1 position (null when none). */
export const panelAt = (plan, time) => {
	for (const panel of plan?.panels || []) {
		if (time >= panel.start && time <= panel.end) return { position: lerp(-1, 1, easeInOutCubic((time - panel.start) / Math.max(1, panel.end - panel.start))), color: panel.color };
	}
	return null;
};

/**
 * How much of a board's stroke (a strip's track, a split's divider) is
 * drawn: it reaches each line's stop while that line is sung.
 */
export const strokeLevel = (plan, board, stroke, time) => {
	let level = 0;
	stroke.stops.forEach((stop, local) => {
		const line = plan.lines[board.first + local];
		const begin = line.start - 300;
		if (time <= begin) return;
		const amount = easeInOutCubic(clamp01((time - begin) / clamp(line.end - line.start + 300, 600, 1800)));
		level = Math.max(level, lerp(local ? stroke.stops[local - 1] : 0, stop, amount));
	});
	return level;
};

/**
 * The colour field on screen at a time (posters): its colour and how far
 * it has opened (0 to 1). Fields that follow each other cut straight
 * from colour to colour; the first opens from a band and the last closes
 * into one.
 */
export const floodAt = (plan, time) => {
	const floods = plan?.floods || [];
	for (let index = floods.length - 1; index >= 0; index -= 1) {
		const flood = floods[index];
		if (time < flood.start) continue;
		if (time > flood.end) return null;
		const previous = floods[index - 1];
		const next = floods[index + 1];
		const open = previous && flood.start - previous.end < 90 ? 1 : easeOutExpo(clamp01((time - flood.start) / 240));
		const close = next && next.start - flood.end < 90 ? 1 : 1 - easeInOutCubic(clamp01((time - (flood.end - 220)) / 220));
		return { color: flood.color, level: Math.min(open, close) };
	}
	return null;
};

/**
 * The clip a board opening out of a circle (iris) or a band across the
 * middle (open) is seen through while the camera comes in ("" once open).
 * In the board's own px, centred on its first line's frame.
 */
export const revealClip = (plan, board, time) => {
	if (!board.index || !REVEAL_ENTERS.has(board.enter)) return "";
	const first = plan.lines[board.first];
	const k = easeInOutCubic(clamp01((time - board.appear) / Math.max(1, first.arrive - board.appear)));
	if (k >= 1) return "";
	const centre = board.frames[0];
	if (board.enter === "iris") return "circle(" + round(k * Math.hypot(plan.W, plan.H) * 0.62) + "px at " + round(centre.x) + "px " + round(centre.y) + "px)";
	const half = k * plan.H * 0.62;
	const along = plan.W * 3;
	const turn = plan.feel?.turn === 0 ? 0 : (centre.roll || 0) + (board.dutch || 0);
	const points = [[-along, -half], [along, -half], [along, half], [-along, half]].map(([x, y]) => {
		const point = rotate2d(x, y, turn);
		return round(centre.x + point.x) + "px " + round(centre.y + point.y) + "px";
	});
	return "polygon(" + points.join(",") + ")";
};

/** A plate (a slot's band, an arch's ring) arriving with its line: 0 before, 1 once it has landed. */
export const plateLevel = (plan, board, plate, time) => {
	const since = time - (plan.lines[board.first + plate.line].start - 240);
	if (since <= 0) return 0;
	const amount = clamp01(since / (280 * fxPaceOf(plan.pace)));
	let level = Math.max(0.001, easeOutExpo(amount));
	// A plate that belongs to one line of a one-at-a-time composition (a seal) goes when the next line comes in.
	const next = plate.solo ? plan.lines[board.first + plate.line + 1] : null;
	if (next && next.board === board.index) level *= 1 - clamp01((time - (next.start - 260)) / 220);
	return level <= 0.001 && next && time > next.start ? 0 : level;
};

/**
 * Outline and solid opacity of a line on its board. One-at-a-time
 * compositions show only the current line.
 */

/**
 * The background's filter with the camera's motion blur after its own (the
 * app's dimming and blur of a cover): state.base is its own filter,
 * state.written what the camera last set (null: nothing yet). A filter the
 * app set meanwhile becomes its own.
 */
export const cameraFilter = (state, current, blurPx) => {
	const base = state.written !== null && current !== state.written ? current : state.base;
	return { base, written: [base, blurPx > 0 ? "blur(" + blurPx + "px)" : ""].filter(Boolean).join(" ") };
};
