import { cornersOf } from "./motionBoardGeometry.mjs";
import { DISSOLVE_ENTERS, HARD_ENTERS } from "./motionDirectionVocabulary.mjs";
import { between, clamp, createRandom, rotate2d } from "./motionMath.mjs";

export const PERSPECTIVE_PX = 1100;

const PUSH_DEPTH = 2300;
const PULL_DEPTH = 1900;
// A dissolve eases the camera this far forward into the next board.
const FADE_DEPTH = 420;

export const toWorld = (board, x, y) => {
	const point = rotate2d(x, y, board.roll);
	return { x: board.origin.x + point.x, y: board.origin.y + point.y };
};
const nearestRoll = (roll, previous) => {
	let value = roll;
	while (value - previous > 180.001) value -= 360;
	while (previous - value > 180.001) value += 360;
	return value;
};
// Entrances that travel sideways, downwards, upwards, on a slant, through depth or stay put.
const SIDEWAYS = new Set(["pan", "cut", "whip", "spin", "orbit", "panel", "hop"]);
const DOWNWARDS = new Set(["drop", "flip", "tumble"]);
const UPWARDS = new Set(["rise", "crane"]);
// How far down a slanting entrance goes for every step sideways.
const SLANTED = Object.freeze({ roll: 0.45, twist: 0.45, drift: 0.55, swoop: 0.85 });
const IN_DEPTH = { push: -PUSH_DEPTH, through: -PUSH_DEPTH, pull: PULL_DEPTH, fade: -FADE_DEPTH, iris: -FADE_DEPTH, open: -FADE_DEPTH, corkscrew: -PUSH_DEPTH * 0.85 };

const toRadians = (degrees) => (degrees * Math.PI) / 180;
const toDegrees = (radians) => (radians * 180) / Math.PI;

/**
 * How a line tilted in depth (place.tiltX / tiltY, on drums) faces the
 * camera: the direction it looks in the camera's rolled frame, and the
 * yaw and pitch that turn the camera to face it squarely.
 */
export const facingOf = (place, turn) => {
	const tiltX = toRadians(place.tiltX || 0);
	const tiltY = toRadians(place.tiltY || 0);
	const normal = rotate2d(Math.cos(tiltX) * Math.sin(tiltY), -Math.sin(tiltX), -turn);
	const z = Math.cos(tiltX) * Math.cos(tiltY);
	return {
		normal: { x: normal.x, y: normal.y, z },
		yaw: toDegrees(Math.atan2(-normal.x, z)),
		pitch: toDegrees(Math.asin(clamp(normal.y, -1, 1))),
	};
};

/** Puts each board next to the last one, out of its way, in the direction its entrance moves. */
export const placeBoards = (boards, ctx, seed, turning = 1) => {
	const random = createRandom(seed ^ 0x51ED270B);
	// Rotation off: nothing turns. Gentle: each board starts level again, so small tilts never add up.
	const level = turning === 0;
	const steady = turning < 1;
	let previousRoll = 0;
	boards.forEach((board, index) => {
		const firstFrame = board.frames[0];
		// Rotation off: the world and the camera stay level (a line set at a slant shows it, the screen never turns).
		if (level) board.roll = 0;
		if (!index) {
			if (!level) board.roll = -firstFrame.roll;
			board.origin = { x: 0, y: 0, z: 0 };
		} else {
			const previous = boards[index - 1];
			const last = previous.cameras[previous.cameras.length - 1];
			const theta = steady ? 0 : last.roll - previous.dutch;
			const enter = board.enter;
			const turn = steady ? 0 : enter === "roll" ? (random() < 0.5 ? 90 : -90)
				: enter === "flip" ? (random() < 0.5 ? 180 : -180)
					: enter === "twist" ? (random() < 0.5 ? 45 : -45) : 0;
			if (!level) board.roll = theta + turn - firstFrame.roll;
			const right = rotate2d(1, 0, theta);
			const down = rotate2d(0, 1, theta);
			const sideways = random() < 0.5 ? 1 : -1;
			let direction = null;
			if (SIDEWAYS.has(enter)) direction = { x: right.x * sideways, y: right.y * sideways };
			else if (DOWNWARDS.has(enter)) direction = down;
			else if (UPWARDS.has(enter)) direction = { x: -down.x, y: -down.y };
			else if (SLANTED[enter]) {
				const x = right.x * sideways + down.x * SLANTED[enter];
				const y = right.y * sideways + down.y * SLANTED[enter];
				const length = Math.hypot(x, y);
				direction = { x: x / length, y: y / length };
			}
			const firstOffset = rotate2d(firstFrame.x, firstFrame.y, board.roll);
			let target;
			if (direction) {
				const ahead = Math.max(0, ...previous.corners.map((corner) => (corner.x - last.x) * direction.x + (corner.y - last.y) * direction.y));
				const behind = Math.max(0, ...board.localCorners.map((corner) => {
					const point = rotate2d(corner.x, corner.y, board.roll);
					return (firstOffset.x - point.x) * direction.x + (firstOffset.y - point.y) * direction.y;
				}));
				const gap = HARD_ENTERS.includes(enter) ? ctx.W * 1.6 : enter === "whip" || enter === "hop" ? ctx.W * 0.4 : ctx.W * 0.16;
				const distance = Math.max(ahead + behind + gap, ctx.W * 0.85);
				target = { x: last.x + direction.x * distance, y: last.y + direction.y * distance };
			} else {
				const spread = DISSOLVE_ENTERS.has(enter) ? 0.04 : 0.08;
				const side = rotate2d(between(random, -spread, spread) * ctx.W, between(random, -spread * 0.75, spread * 0.75) * ctx.H, theta);
				target = { x: last.x + side.x, y: last.y + side.y };
			}
			const depth = IN_DEPTH[enter] || 0;
			board.origin = { x: target.x - firstOffset.x, y: target.y - firstOffset.y, z: last.z - firstFrame.z + depth };
		}
		board.cameras = board.frames.map((frame, local) => {
			const point = toWorld(board, frame.x, frame.y);
			const roll = level ? 0 : nearestRoll(board.roll + frame.roll + board.dutch, previousRoll);
			previousRoll = roll;
			// On drums the camera turns to face the line; push is the way it dollies in (world).
			const place = board.places[local];
			const facing = frame.face ? facingOf(place, frame.roll - place.rot + board.dutch) : null;
			const into = facing ? rotate2d(-facing.normal.x, -facing.normal.y, roll) : { x: 0, y: 0 };
			return {
				x: point.x,
				y: point.y,
				z: board.origin.z + frame.z,
				roll,
				yaw: facing ? facing.yaw : 0,
				pitch: facing ? facing.pitch : 0,
				push: { x: into.x, y: into.y, z: facing ? -facing.normal.z : -1 },
			};
		});
		board.corners = board.localCorners.map((corner) => toWorld(board, corner.x, corner.y));
		board.planeZ = board.origin.z + board.places.reduce((sum, place) => sum + place.z, 0) / board.places.length;
	});
};

const measureFrameInCamera = (points, roll) => {
	const xs = points.map((point) => point.x);
	const ys = points.map((point) => point.y);
	const width = Math.max(...xs) - Math.min(...xs);
	const height = Math.max(...ys) - Math.min(...ys);
	const center = rotate2d((Math.max(...xs) + Math.min(...xs)) / 2, (Math.max(...ys) + Math.min(...ys)) / 2, roll);
	return { width, height, center };
};

/** Where the camera pulls back to show a whole board, keeping its roll (always behind where it was). */
export const revealPose = (board, camera, ctx) => {
	const roll = camera.roll;
	const local = board.corners.map((corner) => rotate2d(corner.x, corner.y, -roll));
	const { width, height, center } = measureFrameInCamera(local, roll);
	const scale = clamp(Math.min((ctx.W * 0.88) / Math.max(1, width), (ctx.H * 0.82) / Math.max(1, height)), 0.34, 0.92);
	const z = board.layout === "tunnel" ? board.cameras[board.cameras.length - 1].z + 320 : board.planeZ + PERSPECTIVE_PX * (1 / scale - 1);
	return { x: center.x, y: center.y, z: Math.max(z, camera.z + 160), roll };
};

/**
 * Where the camera holds while the line before is still being sung into
 * this one on the same board (an echo, an answer, a duet): both lines in
 * frame, pulled back when they need the room, turned as the new line
 * reads and never closer than either line's own view.
 */
export const sharedPose = (board, previous, line, ctx) => {
	const camera = line.camera;
	const roll = camera.roll;
	const local = [previous.place, line.place].flatMap(cornersOf).map((corner) => {
		const world = toWorld(board, corner.x, corner.y);
		return rotate2d(world.x, world.y, -roll);
	});
	const { width, height, center } = measureFrameInCamera(local, roll);
	const scale = clamp(Math.min((ctx.W * 0.9) / Math.max(1, width), (ctx.H * 0.84) / Math.max(1, height)), 0.4, 1);
	const plane = Math.max(previous.worldZ, line.worldZ);
	const yaw = ((previous.camera.yaw || 0) + (camera.yaw || 0)) / 2;
	const pitch = ((previous.camera.pitch || 0) + (camera.pitch || 0)) / 2;
	return {
		x: center.x,
		y: center.y,
		z: Math.max(camera.z, previous.camera.z, plane + PERSPECTIVE_PX * (1 / scale - 1)),
		roll,
		yaw,
		pitch,
		faceYaw: yaw,
		facePitch: pitch,
	};
};

// The line the camera holds keeps inside this share of the screen (each
// side of the centre) even when the camera has eased all the way in on it.
const HOLD_ROOM_X = 0.46;
const HOLD_ROOM_Y = 0.44;

/**
 * Keeps a held line whole on screen: the camera eases in on it (drift)
 * only as far as its ends stay in frame, and a line already too large for
 * the screen (a long line on a narrow window) is seen from further back.
 * Lines the camera turns to face (on a drum) keep their own framing.
 */
export const fitHold = (line, board, ctx) => {
	const camera = line.camera;
	if (camera.yaw || camera.pitch) return;
	let reachX = 0;
	let reachY = 0;
	for (const corner of cornersOf(line.place)) {
		const world = toWorld(board, corner.x, corner.y);
		const seen = rotate2d(world.x - camera.x, world.y - camera.y, -camera.roll);
		reachX = Math.max(reachX, Math.abs(seen.x));
		reachY = Math.max(reachY, Math.abs(seen.y));
	}
	if (!(reachX > 0 && reachY > 0)) return;
	const largest = Math.min((ctx.W * HOLD_ROOM_X) / reachX, (ctx.H * HOLD_ROOM_Y) / reachY);
	// Depth in front of the camera that shows the line at that scale (CSS perspective).
	const deepest = PERSPECTIVE_PX * (1 - 1 / largest);
	const depth = line.worldZ - camera.z;
	if (depth > deepest) {
		camera.z = line.worldZ - deepest;
		line.drift.z = 0;
		return;
	}
	line.drift.z = Math.min(line.drift.z, deepest - depth);
};

/** How far in front of the viewer's focal plane a world point is (CSS z after the camera turns). */
export const viewDepth = (pose, point) => {
	const radians = (-pose.roll * Math.PI) / 180;
	const x0 = point.x - pose.x;
	const y0 = point.y - pose.y;
	const z0 = point.z - pose.z;
	const x1 = x0 * Math.cos(radians) - y0 * Math.sin(radians);
	const y1 = x0 * Math.sin(radians) + y0 * Math.cos(radians);
	const yaw = ((pose.yaw || 0) * Math.PI) / 180;
	const pitch = ((pose.pitch || 0) * Math.PI) / 180;
	const z2 = -x1 * Math.sin(yaw) + z0 * Math.cos(yaw);
	return y1 * Math.sin(pitch) + z2 * Math.cos(pitch);
};
