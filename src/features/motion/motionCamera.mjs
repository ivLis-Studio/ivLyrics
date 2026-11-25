import { cameraFeelOf, cameraMoodOf } from "./motionCameraComfort.mjs";
import { CAMERA_INTRO_MS, DISSOLVE_ENTERS, REST_FADE_MS, REVEAL_ENTERS } from "./motionDirectionVocabulary.mjs";
import {
	clamp, clamp01, easeInOutCubic, easeInOutExpo, easeInOutQuart, easeInOutQuint, easeInOutSine,
	easeOutCubic, lerp, rotate2d,
} from "./motionMath.mjs";

// After a voice sung into the next line ends, the camera takes this long to settle on the new line.
const SHARE_RETURN_MS = 520;

const REST_RETURN_MS = 700;
const OUTRO_DRIFT_MS = 16000;

// Moves eased evenly in and out (the others accelerate hard).
const CUBIC_MOVES = new Set(["push", "pull", "through", "orbit", "tumble", "crane", "swoop", "corkscrew", "hop"]);

const FORWARD = Object.freeze({ x: 0, y: 0, z: -1 });

export const lineIndexAt = (plan, time) => {
	const lines = plan?.lines || [];
	let low = 0;
	let high = lines.length;
	while (low < high) {
		const middle = (low + high) >>> 1;
		if (lines[middle].arrive <= time) low = middle + 1;
		else high = middle;
	}
	return low - 1;
};

/** Continuous line position: 2.5 is halfway from line 2 to line 3. */
export const progressAt = (plan, time, index = lineIndexAt(plan, time)) => {
	const lines = plan?.lines || [];
	if (!lines.length) return -1;
	if (index < 0) return -1 + clamp01((time - (lines[0].arrive - CAMERA_INTRO_MS)) / CAMERA_INTRO_MS);
	const line = lines[index];
	const next = lines[index + 1];
	if (next && time > line.leave) return index + clamp01((time - line.leave) / Math.max(1, next.arrive - line.leave));
	return index;
};

const mixPose = (from, to, amount) => ({
	x: lerp(from.x, to.x, amount),
	y: lerp(from.y, to.y, amount),
	z: lerp(from.z, to.z, amount),
	roll: lerp(from.roll, to.roll, amount),
	// The turn that faces a line on a drum (zero on flat boards).
	yaw: lerp(from.yaw || 0, to.yaw || 0, amount),
	pitch: lerp(from.pitch || 0, to.pitch || 0, amount),
	faceYaw: lerp(from.faceYaw || 0, to.faceYaw || 0, amount),
	facePitch: lerp(from.facePitch || 0, to.facePitch || 0, amount),
});

const holdPose = (plan, index, time) => {
	const line = plan.lines[index];
	const camera = line.camera;
	const end = Number.isFinite(line.leave) ? line.leave : line.end + 3200;
	const life = clamp01((time - line.arrive) / Math.max(1, end - line.arrive));
	const ease = easeInOutSine(life);
	// While a line is held the camera eases in towards it.
	const push = (line.drift?.z || 0) * ease;
	const into = camera.push || FORWARD;
	let pose = {
		x: camera.x + into.x * push,
		y: camera.y + into.y * push,
		z: camera.z + into.z * push,
		roll: camera.roll + (line.drift?.roll || 0) * (life - 0.5),
		yaw: camera.yaw || 0,
		pitch: camera.pitch || 0,
		faceYaw: camera.yaw || 0,
		facePitch: camera.pitch || 0,
	};
	if (line.share && time < line.share.until + SHARE_RETURN_MS) {
		// The line before still sings into this one: both stay in frame, then the camera settles on this line.
		pose = mixPose(line.share.pose, pose, easeInOutCubic(clamp01((time - line.share.until) / SHARE_RETURN_MS)));
	}
	if (line.reveal && time > line.reveal.start) {
		const amount = easeInOutCubic(clamp01((time - line.reveal.start) / Math.max(1, Math.min(1700, line.reveal.end - line.reveal.start))));
		pose = mixPose(pose, line.reveal.pose, amount);
	}
	if (line.rest && time > line.rest.start) {
		// Over an interlude the camera turns, swings and pushes into the video, and settles back before it moves on.
		const rest = line.rest;
		const until = Number.isFinite(line.leave) ? line.leave : rest.start + OUTRO_DRIFT_MS;
		const k = clamp01((time - rest.start) / Math.max(1, until - rest.start));
		const swell = Math.sin(Math.PI * k);
		pose.roll += rest.roll * easeInOutSine(k);
		pose.yaw += rest.yaw * swell;
		pose.pitch += rest.pitch * swell;
		pose.dolly = -rest.zoom * swell;
	}
	if (!Number.isFinite(line.leave) && time > line.outro) pose.z += 700 * easeInOutCubic(clamp01((time - line.outro) / 4200));
	return pose;
};

export const recentEvent = (events, time, window) => {
	if (!events?.length) return null;
	let low = 0;
	let high = events.length;
	while (low < high) {
		const middle = (low + high) >>> 1;
		if (events[middle].time <= time) low = middle + 1;
		else high = middle;
	}
	const event = events[low - 1];
	return event && time - event.time < window ? { ...event, since: time - event.time } : null;
};

const beatAt = (pulses, time) => {
	if (!pulses?.times?.length) return null;
	const times = pulses.times;
	let low = 0;
	let high = times.length;
	while (low < high) {
		const middle = (low + high) >>> 1;
		if (times[middle] <= time) low = middle + 1;
		else high = middle;
	}
	const index = low - 1;
	if (index < 0 || time - times[index] > 450) return null;
	return { index, since: time - times[index], strength: pulses.strengths[index] || 0 };
};

/** The camera on its way from one line to the next. */
const movePose = (plan, index, time) => {
	const line = plan.lines[index];
	const next = plan.lines[index + 1];
	const move = line.move;
	const u = clamp01((time - line.leave) / Math.max(1, next.arrive - line.leave));
	const from = holdPose(plan, index, line.leave);
	const to = holdPose(plan, index + 1, next.arrive);
	const type = move.type;
	if (type === "cut" || type === "panel") {
		const pose = time >= move.cutAt ? to : from;
		return { ...pose, dolly: 0, sway: null, u };
	}
	let eased;
	if (type === "line") eased = easeInOutQuart(u);
	else if (type === "whip") eased = easeInOutExpo(u);
	else if (DISSOLVE_ENTERS.has(type) || type === "drift") eased = easeInOutSine(u);
	else if (CUBIC_MOVES.has(type)) eased = easeInOutCubic(u);
	else eased = easeInOutExpo(u);
	const pose = mixPose(from, to, eased);
	if (type === "through" && move.waypoint) {
		// Head for the last sung word first, so the camera flies through it.
		const half = u < 0.5 ? easeInOutCubic(u / 0.5) : easeInOutCubic((u - 0.5) / 0.5);
		const a = u < 0.5 ? from : move.waypoint;
		const b = u < 0.5 ? move.waypoint : to;
		pose.x = lerp(a.x, b.x, half);
		pose.y = lerp(a.y, b.y, half);
	}
	const rollEase = type === "line" ? eased : DISSOLVE_ENTERS.has(type) || type === "drift" ? easeInOutSine(u) : type === "corkscrew" ? easeInOutCubic(u) : easeInOutQuint(u);
	pose.roll = lerp(from.roll, to.roll + move.extraRoll, rollEase);
	const dolly = move.arc * Math.sin(Math.PI * u);
	pose.z += dolly;
	const bell = Math.sin(Math.PI * clamp01(type === "whip" ? u : easeInOutSine(u)));
	return {
		...pose,
		yaw: pose.yaw + move.swing.yaw * bell,
		pitch: pose.pitch + move.swing.pitch * bell,
		dolly,
		sway: { u, dx: to.x - from.x, dy: to.y - from.y, board: type !== "line", whip: type === "whip" },
		u,
	};
};

/**
 * Camera pose at a playback position: the planned path plus 3D swings,
 * a settling overshoot, a handheld drift, beat punches and slam shakes.
 * Also reports the dolly (pull-back) and the move in progress, for the
 * background.
 */
export const cameraPose = (plan, time, pulses = plan?.pulses) => {
	const lines = plan?.lines || [];
	if (!lines.length) return { x: 0, y: 0, z: 0, roll: 0, yaw: 0, pitch: 0, dolly: 0, sway: null, beat: 0 };
	let pose;
	const first = lines[0];
	if (time < first.arrive) {
		const target = holdPose(plan, 0, first.arrive);
		const start = { ...target, z: target.z + 900, roll: target.roll - 10 };
		const amount = easeInOutCubic(clamp01((time - (first.arrive - CAMERA_INTRO_MS)) / CAMERA_INTRO_MS));
		pose = { ...mixPose(start, target, amount), dolly: 900 * (1 - amount), sway: null };
		pose.yaw += 24 * (1 - amount);
		pose.pitch -= 10 * (1 - amount);
	} else {
		const index = lineIndexAt(plan, time);
		const line = lines[index];
		const next = lines[index + 1];
		if (next && time > line.leave) {
			pose = movePose(plan, index, time);
		} else {
			pose = { dolly: 0, sway: null, ...holdPose(plan, index, time) };
			const previous = lines[index - 1];
			const since = time - line.arrive;
			if (previous && since >= 0 && since < 700 && !["cut", "panel", "fade", "iris", "open"].includes(previous.move?.type)) {
				const k = since / 700;
				const spring = Math.sin(k * Math.PI * 2.2) * Math.exp(-k * 4.5);
				const dx = line.camera.x - previous.camera.x;
				const dy = line.camera.y - previous.camera.y;
				const distance = Math.hypot(dx, dy) || 1;
				const push = Math.min(34, distance * 0.02) * spring;
				pose.x += (dx / distance) * push;
				pose.y += (dy / distance) * push;
				pose.roll += clamp((line.camera.roll - previous.camera.roll) * 0.04, -3.5, 3.5) * spring;
				pose.yaw -= (previous.move?.swing?.yaw || 0) * 0.08 * spring;
				pose.pitch -= (previous.move?.swing?.pitch || 0) * 0.08 * spring;
			}
		}
	}
	const mood = cameraMoodOf(plan);
	const feel = cameraFeelOf(plan);
	const shake = mood.shake * feel.shake;
	let shakeX = (Math.sin(time * 0.00071 + 1.3) * 0.6 + Math.sin(time * 0.00153 + 0.4) * 0.4) * 5 * shake;
	let shakeY = (Math.sin(time * 0.00063 + 2.1) * 0.6 + Math.sin(time * 0.00117) * 0.4) * 4 * shake;
	pose.roll += Math.sin(time * 0.00043 + 0.7) * 0.32 * shake;
	// A slow handheld orbit gives the layers depth even while a line is held.
	pose.yaw += Math.sin(time * 0.00029 + 0.3) * 2.2 * feel.sway;
	pose.pitch += Math.sin(time * 0.00023 + 1.9) * 1.5 * feel.sway;
	const slam = recentEvent(plan.slams, time, 220);
	if (slam) {
		const k = 1 - slam.since / 220;
		shakeX += Math.sin(slam.since * 0.11) * slam.strength * k;
		shakeY += Math.cos(slam.since * 0.13) * slam.strength * k * 0.7;
		pose.roll += Math.sin(slam.since * 0.08) * 0.09 * slam.strength * k;
	}
	const offset = rotate2d(shakeX, shakeY, pose.roll);
	pose.x += offset.x;
	pose.y += offset.y;
	let beatAmount = 0;
	const beat = beatAt(pulses, time);
	if (beat) {
		beatAmount = beat.strength * mood.punch * Math.exp(-beat.since / 150);
		pose.z -= 46 * beat.strength * mood.punch * Math.exp(-beat.since / 130);
		pose.roll += (beat.index % 2 ? 1 : -1) * 0.5 * beat.strength * mood.punch * Math.exp(-beat.since / 160);
	}
	pose.beat = beatAmount;
	// A viewer who turned rotation off: the camera never rolls (shake, beats, moves and interludes included).
	if (plan.feel?.turn === 0) pose.roll = 0;
	return pose;
};

export const boardVisibility = (board, time) => {
	const fadeIn = board.index && (board.enter === "cut" || board.enter === "panel" || REVEAL_ENTERS.has(board.enter)) ? 120 : board.enter === "fade" ? 650 : 450;
	const into = easeOutCubic(clamp01((time - board.appear) / fadeIn));
	const out = Number.isFinite(board.fadeAt) ? 1 - easeInOutCubic(clamp01((time - board.fadeAt) / Math.max(1, board.fadeEnd - board.fadeAt))) : 1;
	// An interlude inside a board hides it until its lyrics return.
	let rest = 1;
	for (const window of board.rests || []) {
		if (time <= window.start || time >= window.end + REST_RETURN_MS) continue;
		const away = 1 - easeInOutCubic(clamp01((time - window.start) / REST_FADE_MS));
		const back = easeInOutCubic(clamp01((time - window.end) / REST_RETURN_MS));
		rest = Math.min(rest, Math.max(away, back));
	}
	return into * out * rest;
};

/** How far the edit is into an interlude, the intro or the outro (0: lyrics on screen, 1: only the video). */
export const restAt = (plan, time) => {
	const lines = plan?.lines || [];
	if (!lines.length) return 0;
	const index = lineIndexAt(plan, time);
	if (index < 0) return 1 - easeInOutCubic(clamp01((time - plan.boards[0].appear) / 900));
	const rest = lines[index].rest;
	if (!rest || time <= rest.start) return 0;
	const away = easeInOutCubic(clamp01((time - rest.start) / REST_FADE_MS));
	const back = Number.isFinite(rest.end) ? easeInOutCubic(clamp01((time - rest.end) / REST_RETURN_MS)) : 0;
	return away * (1 - back);
};

/** The background's turn against the camera's roll at a time (degrees; 0 before any turn or without a time). */
export const uprightAt = (plan, time) => {
	if (!Number.isFinite(time)) return 0;
	let offset = 0;
	for (const turn of plan?.uprights || []) {
		if (turn.from > time) break;
		offset = time >= turn.until ? turn.offsetTo : turn.offsetFrom + (turn.offsetTo - turn.offsetFrom) * easeInOutCubic(clamp01((time - turn.from) / Math.max(1, turn.until - turn.from)));
	}
	return offset;
};
