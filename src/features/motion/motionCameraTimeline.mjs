import { onBeat } from "./motionBeatGrid.mjs";
import { cameraFeelOf } from "./motionCameraComfort.mjs";
import { fitHold, revealPose, sharedPose, toWorld } from "./motionCameraFraming.mjs";
import { CAMERA_INTRO_MS, DISSOLVE_ENTERS, HARD_ENTERS, REST_FADE_MS, REST_GAP_MS } from "./motionDirectionVocabulary.mjs";
import { clamp, hashString, rotate2d } from "./motionMath.mjs";
import { singsInto } from "./motionSongAnalysis.mjs";
import { EXIT_LENGTH, EXIT_MS, PEEK_MS, READS_AFTER, fxPaceOf } from "./motionTypeEffects.mjs";

// The camera settles on a line this long before its first word.
const ARRIVE_LEAD_MS = 110;
// Pauses this long let the camera pull back and show the whole board.
const LONG_GAP_MS = 3600;
// A board shows (faintly) this long before the camera leaves for it, and
// stays this long after the camera has left before it fades.
const BOARD_PREVIEW_MS = 1800;
const BOARD_LINGER_MS = 650;
const BOARD_FADE_MS = 900;

// The background turns with the camera, flips and barrel rolls included, so
// the video is seen to turn over with the edit. It is only not left turned:
// on its side (portrait on a wide screen, small and blurry once scaled to
// cover it) it turns back to landscape after SIDEWAYS_HOLD_MS, upside down
// it rights itself UPSIDE_HOLD_MS after the camera has landed, and in
// interludes it comes back upright under the camera's swing. On its own it
// keeps turning, drifting and breathing a little (BG_SWAY), so it never
// stands still.
const SIDEWAYS_HOLD_MS = 5000;
const UPSIDE_HOLD_MS = 700;
const UPRIGHT_TURN_MS = 1400;
const UPSIDE_TURN_MS = 1100;

// Interludes: when the next line is this far off, the board fades soon
// after its last word and the camera keeps moving over the video (turning
// and pushing in) until the lyrics come back. Rests shorter than
// REST_MIN_MS once faded are not worth a fade.
const REST_AFTER_MS = 1100;
const REST_MIN_MS = 1200;
// After the last line the board fades this long after its last word; the camera drifts this long.
const OUTRO_REST_MS = 2600;

// Compositions the camera pulls back from at the end, to show them whole.
const REVEALED = new Set(["spiral", "radial", "carousel", "strip", "split", "constellation", "grid", "wave"]);

/** How far a roll turns the picture from upright: 0 upright, 90 on its side, 180 upside down. */
const tiltOf = (roll) => {
	const turn = ((roll % 360) + 360) % 360;
	return Math.min(turn, 360 - turn);
};

/**
 * How the background is turned against the camera over the song (a list of
 * turns of its offset from the camera's roll). While the camera moves the
 * offset holds, so the video turns over with every roll, flip and barrel
 * roll; it changes only while a line is held: turned upside down the video
 * rights itself UPSIDE_HOLD_MS after the camera has landed, on its side
 * after SIDEWAYS_HOLD_MS, and when the camera turns back upright the video
 * comes back with it during that move. So the video is seen to turn but is
 * never left turned.
 */
const uprightsOf = (lines) => {
	const turns = [];
	let offset = 0;
	let sidewaysSince = null;
	lines.forEach((line, index) => {
		const roll = line.camera.roll;
		const previous = lines[index - 1];
		const moveStart = previous && Number.isFinite(previous.leave) ? Math.min(previous.leave, line.arrive) : line.arrive;
		const bg = roll + offset;
		if (tiltOf(roll) <= 45) {
			sidewaysSince = null;
			const level = Math.round(offset / 360) * 360;
			if (Math.abs(level - offset) > 0.5) {
				turns.push({ from: moveStart, until: Math.max(line.arrive, moveStart + 400), offsetFrom: offset, offsetTo: level });
				offset = level;
			}
			return;
		}
		const tilt = tiltOf(bg);
		if (tilt <= 45) {
			sidewaysSince = null;
			return;
		}
		if (tilt <= 135 && sidewaysSince === null) sidewaysSince = line.arrive;
		const from = tilt > 135 ? line.arrive + UPSIDE_HOLD_MS : Math.max(line.arrive + UPSIDE_HOLD_MS, sidewaysSince + SIDEWAYS_HOLD_MS);
		const leave = Number.isFinite(line.leave) ? line.leave : Infinity;
		// Not enough of the line left: the camera moves on first and the next line decides.
		if (leave - from < 500) return;
		const offsetTo = offset + Math.round(bg / 360) * 360 - bg;
		turns.push({ from, until: Math.min(from + (tilt > 135 ? UPSIDE_TURN_MS : UPRIGHT_TURN_MS), leave), offsetFrom: offset, offsetTo });
		offset = offsetTo;
		sidewaysSince = null;
	});
	return turns;
};

const moveDuration = (type, gap, pace) => {
	switch (type) {
		case "line": return clamp((gap + 260) * pace, 300 * Math.min(1, pace), 760 * pace);
		case "cut": return 1;
		case "whip": return clamp((gap + 200) * 0.55 * pace, 260, 520);
		case "panel": return clamp((gap + 300) * pace, 560, 900);
		case "fade": case "iris": case "open": return clamp((gap + 700) * pace, 800, 1800 * pace);
		case "roll":
		case "flip":
		case "spin":
		case "orbit":
		case "tumble":
		case "twist":
		case "crane":
		case "swoop": return clamp((gap + 420) * pace, 560, 1150 * pace) * 1.15;
		case "through":
		case "corkscrew": return clamp((gap + 420) * pace, 620, 1250 * pace) * 1.2;
		case "drift": return clamp((gap + 640) * pace, 720, 1500 * pace);
		case "hop": return clamp((gap + 420) * pace, 640, 1250 * pace) * 1.1;
		default: return clamp((gap + 420) * pace, 520, 1150 * pace);
	}
};

/** An interlude after a line: when it fades, when the lyrics return, and the camera's drift meanwhile. */
const restOf = (line, start, end, feel) => {
	const seed = hashString(line.text + "\u0001" + line.n);
	const sign = seed & 1 ? 1 : -1;
	return {
		start,
		end,
		roll: sign * (7 + (seed % 7)) * feel.swing * (feel.turn ?? 1),
		yaw: -sign * (4 + ((seed >>> 3) % 4)),
		pitch: ((seed >>> 5) & 1 ? 1 : -1) * 2.5,
		zoom: 220 + ((seed >>> 7) % 120),
	};
};

export const timeline = (plan, ctx) => {
	const { boards, lines } = plan;
	const pace = ctx.pace;
	const feel = cameraFeelOf(plan);
	lines.forEach((line) => {
		const board = boards[line.board];
		line.local = line.n - board.first;
		line.camera = board.cameras[line.local];
		line.place = board.places[line.local];
		line.worldZ = board.origin.z + line.place.z;
		const center = toWorld(board, line.place.x, line.place.y);
		line.center = { x: center.x, y: center.y, z: line.worldZ };
		line.arrive = line.start - ARRIVE_LEAD_MS;
		// Every voice's last word: the camera waits for an echo or an answer when it has the time.
		line.lastWordStart = Math.max(...line.shown.map((word) => word.start));
		line.drift = { z: board.drift.z * feel.drift, roll: board.drift.roll * feel.drift * (feel.turn ?? 1) };
		fitHold(line, board, ctx);
	});
	boards.forEach((board) => {
		for (const motif of board.motifs) {
			const point = toWorld(board, motif.x, motif.y);
			motif.center = { x: point.x, y: point.y, z: board.origin.z + motif.z };
		}
	});
	lines.forEach((line, index) => {
		const next = lines[index + 1];
		if (!next) {
			line.leave = Infinity;
			line.move = null;
			line.outro = line.end + 1600;
			line.rest = restOf(line, line.end + OUTRO_REST_MS * clamp(pace, 0.85, 1.25), Infinity, feel);
			return;
		}
		const sameBoard = next.board === line.board;
		const type = sameBoard ? "line" : boards[next.board].enter;
		const gap = next.start - line.end;
		const duration = moveDuration(type, gap, pace);
		// The last word stays long enough to be read (most of a held one) unless the next line leaves no room.
		const readFloor = line.lastWordStart + clamp((line.end - line.lastWordStart) * 0.7, 140, 380);
		let leave = Math.max(next.arrive - duration, readFloor);
		if (type !== "cut" && next.arrive - leave < 220) leave = next.arrive - 220;
		leave = type === "cut" ? next.arrive - 1 : leave;
		line.leave = Math.max(leave, line.arrive + 60);
		// A camera move sets off on the beat (a cut lands where the next line is).
		if (type !== "cut" && plan.grid) {
			const period = plan.grid.period;
			line.leave = onBeat(plan.grid, line.leave, period * 0.5, period * 0.5, Math.max(line.arrive + 60, Math.min(readFloor, next.arrive - 220)), next.arrive - 220);
		}
		const dx = next.camera.x - line.camera.x;
		const dy = next.camera.y - line.camera.y;
		const distance = Math.hypot(dx, dy);
		// The travel seen on screen, for the direction of 3D swings.
		const seen = rotate2d(dx, dy, -line.camera.roll);
		const sx = Math.sign(seen.x) || 1;
		const sy = Math.sign(seen.y) || 1;
		const swing = { yaw: 0, pitch: 0 };
		if (type === "orbit") swing.yaw = 72 * sx;
		else if (type === "tumble") swing.pitch = -62 * sy;
		else if (type === "whip") swing.yaw = 20 * sx;
		else if (type === "crane") swing.pitch = -34 * sy;
		else if (type === "swoop") {
			// Down and round: the camera banks into the turn.
			swing.yaw = 38 * sx;
			swing.pitch = -24 * sy;
		} else if (type === "drift") swing.yaw = 7 * sx;
		else if (type === "hop") swing.yaw = 10 * sx;
		else if (!sameBoard && !HARD_ENTERS.includes(type) && !DISSOLVE_ENTERS.has(type) && type !== "corkscrew") {
			// Every board move swings a little in depth.
			if (Math.abs(seen.x) >= Math.abs(seen.y)) swing.yaw = 14 * sx;
			else swing.pitch = -11 * sy;
		} else if (sameBoard) swing.yaw = 4 * sx;
		swing.yaw *= feel.swing;
		swing.pitch *= feel.swing;
		line.move = {
			type,
			swing,
			extraRoll: type === "spin" || type === "corkscrew" ? (sx > 0 ? 360 : -360) : 0,
			arc: type === "line" ? clamp(distance * 0.1, 20, 150)
				: type === "push" || type === "pull" || type === "corkscrew" || HARD_ENTERS.includes(type) ? 0
					: DISSOLVE_ENTERS.has(type) ? 0
						: type === "orbit" ? clamp(distance * 0.4, 300, 1300)
							// A hop leaps back to see both boards on its way; a crane lifts; a drift barely leaves the plane.
							: type === "hop" ? clamp(distance * 0.75, 520, 1500)
								: type === "crane" ? clamp(distance * 0.45, 300, 1100)
									: type === "drift" ? clamp(distance * 0.12, 60, 260)
										: clamp(distance * 0.3, 160, 950),
			cutAt: type === "panel" ? (line.leave + next.arrive) / 2 : type === "cut" ? next.arrive : null,
			// Through: the camera dives into the last sung word on its way.
			waypoint: type === "through" ? (() => {
				const word = line.place.block.words[line.words.length - 1];
				const point = rotate2d(word.x, word.y, line.place.rot);
				const world = toWorld(boards[line.board], line.place.x + point.x, line.place.y + point.y);
				return { x: world.x, y: world.y };
			})() : null,
		};
		const board = boards[line.board];
		const room = line.leave - (line.end + 250);
		if (gap >= LONG_GAP_MS
			|| (!sameBoard && board.layout === "wall" && room >= 900)
			|| (!sameBoard && REVEALED.has(board.layout) && room >= 1200)) {
			line.reveal = { start: line.end + (gap >= LONG_GAP_MS ? 700 : 250), end: line.leave, pose: revealPose(board, line.camera, ctx) };
		}
		if (gap >= REST_GAP_MS) {
			const start = line.end + REST_AFTER_MS * clamp(pace, 0.85, 1.25);
			// The lyrics come back when the next board's preview would start.
			const end = line.leave - BOARD_PREVIEW_MS * Math.min(1.3, pace);
			if (end - (start + REST_FADE_MS) >= REST_MIN_MS) {
				line.rest = restOf(line, start, end, feel);
				if (sameBoard) board.rests.push(line.rest);
			}
		}
	});
	// A line still sung into the next one on its board keeps both in frame until its last voice ends.
	lines.forEach((line, index) => {
		const previous = lines[index - 1];
		if (!previous || previous.board !== line.board || boards[line.board].solo || !singsInto(previous, line)) return;
		line.share = { pose: sharedPose(boards[line.board], previous, line, ctx), until: previous.end + 120 };
	});
	boards.forEach((board, index) => {
		const first = lines[board.first];
		const into = index ? lines[board.first - 1] : null;
		if (!index) {
			board.appear = first.arrive - CAMERA_INTRO_MS - 300;
		} else if (board.enter === "cut") {
			board.appear = first.arrive - 60;
		} else if (board.enter === "panel") {
			board.appear = into.move.cutAt - 40;
		} else if (DISSOLVE_ENTERS.has(board.enter)) {
			// A dissolve: the new board fades in while the camera eases into it.
			board.appear = into.leave - 100;
		} else {
			board.appear = Math.min(into.leave - 120, Math.max(into.start, into.leave - BOARD_PREVIEW_MS * Math.min(1.3, pace)));
		}
		const next = boards[index + 1];
		if (!next) {
			const rest = lines[board.last].rest;
			board.fadeAt = rest ? rest.start : Infinity;
			board.fadeEnd = rest ? rest.start + REST_FADE_MS : Infinity;
			return;
		}
		const nextFirst = lines[next.first];
		const out = lines[next.first - 1];
		if (next.enter === "cut") {
			board.fadeAt = nextFirst.arrive - 80;
			board.fadeEnd = nextFirst.arrive + 40;
		} else if (next.enter === "panel") {
			board.fadeAt = out.move.cutAt - 60;
			board.fadeEnd = out.move.cutAt + 20;
		} else if (DISSOLVE_ENTERS.has(next.enter)) {
			board.fadeAt = out.leave;
			board.fadeEnd = nextFirst.arrive - 40;
		} else {
			board.fadeAt = nextFirst.arrive + BOARD_LINGER_MS * Math.min(1.5, pace);
			board.fadeEnd = board.fadeAt + BOARD_FADE_MS * Math.min(1.5, pace);
		}
		if (out.rest) {
			// An interlude: the board leaves with its last word, not with the next board.
			board.fadeAt = Math.min(board.fadeAt, out.rest.start);
			board.fadeEnd = Math.min(board.fadeEnd, out.rest.start + REST_FADE_MS);
		}
	});
	// When each line peeks in, dims and leaves (lifeLevels, paintWords).
	lines.forEach((line, index) => {
		const board = boards[line.board];
		let next = lines[index + 1];
		// A line set word by word builds up: its words stay until the line after it comes in.
		if (line.split === "word" && line.parts > 1) {
			let after = index + 1;
			while (lines[after] && lines[after].source === line.source) after += 1;
			next = lines[after];
		}
		line.peekAt = line.local ? line.arrive - PEEK_MS * clamp(pace, 0.85, 1.3) : board.appear;
		line.voicesEnd = Math.max(line.end, ...line.shown.map((word) => word.end));
		line.exitStagger = Math.min(70, 280 / Math.max(1, line.shown.length));
		line.exitLength = EXIT_MS * fxPaceOf(pace) * (EXIT_LENGTH[board.exit] || 1);
		line.exitSpan = line.exitLength + line.exitStagger * Math.max(0, line.shown.length - 1);
		// One line at a time: a line stays until the next one on its board (even the next piece of the
		// same line) can be read, crossfading into it, so the screen is never empty between them.
		// (Letters that decode or rain in show before their word: the line before has gone by then.)
		const following = lines[index + 1];
		line.soloOut = Infinity;
		line.soloFade = 120;
		if (board.solo && following && following.board === line.board) {
			if (following.fx === "decode" || following.fx === "rain") line.soloOut = following.start - 360;
			else {
				const first = following.words[0];
				const reads = Math.min((READS_AFTER[following.fx] ?? 70) * fxPaceOf(pace), Math.max(60, (first.end - first.start) * 0.75));
				line.soloOut = Math.max(line.lastWordStart + 120, following.start - 50);
				line.soloFade = Math.max(120, following.start + reads - line.soloOut);
			}
			// It leaves with the shot's exit, quickly, as the next one comes in in its place.
			line.exitStagger = Math.min(22, 90 / Math.max(1, line.shown.length));
			line.exitLength = clamp(line.soloFade + 160, 260, 400);
			line.exitSpan = line.exitLength + line.exitStagger * Math.max(0, line.shown.length - 1);
		}
		if (!next || next.board !== line.board || board.preview || board.solo) {
			// The last line of a board leaves with the board.
			line.dimAt = Infinity;
			line.exitAt = Number.isFinite(line.soloOut) ? line.soloOut : Infinity;
			return;
		}
		line.dimAt = Math.max(next.start, line.voicesEnd + 60);
		line.exitAt = Math.max(next.start + clamp((next.end - next.start) * 0.4, 300, 1300), line.voicesEnd + 220);
		// It leaves on a beat.
		if (plan.grid) line.exitAt = onBeat(plan.grid, line.exitAt, plan.grid.period * 0.5, plan.grid.period * 0.5, Math.max(next.start, line.voicesEnd + 180));
		// The words of a line set word by word leave one after another, in the order they came.
		if (line.split === "word" && line.parts > 1) line.exitAt += line.part * Math.min(70, 280 / line.parts);
	});
	plan.flashes = [];
	plan.panels = [];
	plan.uprights = uprightsOf(lines);
	// Colour fields (posters): one per line, opening from a band and cutting from colour to colour.
	plan.floods = [];
	lines.forEach((line) => {
		if (!line.place.flood) return;
		const board = boards[line.board];
		const next = lines[line.n + 1];
		const start = line.local ? line.arrive - 40 : Math.max(board.appear + 60, line.arrive - 260);
		let end = next && next.board === line.board ? next.arrive - 40 : Number.isFinite(line.leave) ? line.leave + 80 : line.end + 2600;
		if (line.rest) end = Math.min(end, line.rest.start + 320);
		if (end > start) plan.floods.push({ start, end, color: line.place.flood });
	});
	lines.forEach((line) => {
		const type = line.move?.type;
		if (type === "cut") plan.flashes.push({ time: line.move.cutAt, strength: 0.6 });
		if (type === "through") plan.flashes.push({ time: (line.leave + lines[line.n + 1].arrive) / 2, strength: 0.32 });
		if (type === "panel") plan.panels.push({ start: line.leave, end: lines[line.n + 1].arrive, color: boards[lines[line.n + 1].board].color });
	});
	plan.flashes.sort((left, right) => left.time - right.time);
	// Nothing flashes for a viewer who asked for that.
	if (plan.comfort?.safe) plan.flashes = [];
	plan.bars = boards.filter((board) => board.bars).map((board) => ({
		start: lines[board.first].arrive - 500,
		end: Number.isFinite(lines[board.last].leave) ? lines[board.last].leave + 200 : Infinity,
	}));
	const slams = [];
	lines.forEach((line) => {
		if (line.fx !== "slam" && line.fx !== "zoom") return;
		// The camera takes the hit on the line's first word and its emphasised ones, not on every word.
		line.words.forEach((word, index) => {
			if (index && !line.emph.has(index)) return;
			slams.push({ time: word.start, strength: (line.emph.has(index) ? 12 : 6) * (line.fx === "zoom" ? 0.5 : 1) });
		});
	});
	plan.slams = slams.sort((left, right) => left.time - right.time);
};
