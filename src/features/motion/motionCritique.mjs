import { boardVisibility, cameraPose, lineIndexAt, progressAt } from "./motionCamera.mjs";
import { PERSPECTIVE_PX, toWorld, viewDepth } from "./motionCameraFraming.mjs";
import { clamp, clamp01, rotate2d, round } from "./motionMath.mjs";
import { levelsOn } from "./motionTypeEffects.mjs";

const CRITIQUE_STEP_MS = 100;
// A sung word has to be on screen for this long after it starts to be read; a long held note may leave with the camera after.
const READ_WORD_MS = 450;
const DENSE_SCRIPT_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
// Compositions meant to run off the screen or fill it (their words leaving the frame is the point).
const BLEEDING_LAYOUTS = new Set(["bleed", "wordwall", "fill"]);
// Moves and compositions that turn the screen, for the notes.
const TURNING_NAMES = "roll, flip, spin, corkscrew, twist, zigzag, spiral, radial, chain and arch";

/** How long a line needs on screen to be read (ms): a moment to find it, then its letters. */
const readingMs = (line) => {
	const text = line.shown.map((word) => word.text).join("");
	const glyphs = [...text.replace(/\s+/gu, "")].length;
	return clamp(260 + glyphs * (DENSE_SCRIPT_RE.test(text) ? 100 : 50), 600, 2600);
};

/** Where a world point lands on screen (px from the centre) for the camera at pose; null at or behind the lens. */
export const projectPoint = (pose, x, y, z) => {
	const radians = (-pose.roll * Math.PI) / 180;
	const x0 = x - pose.x;
	const y0 = y - pose.y;
	const z0 = z - pose.z;
	const x1 = x0 * Math.cos(radians) - y0 * Math.sin(radians);
	const y1 = x0 * Math.sin(radians) + y0 * Math.cos(radians);
	const yaw = ((pose.yaw || 0) * Math.PI) / 180;
	const pitch = ((pose.pitch || 0) * Math.PI) / 180;
	const x2 = x1 * Math.cos(yaw) + z0 * Math.sin(yaw);
	const z2 = -x1 * Math.sin(yaw) + z0 * Math.cos(yaw);
	const y3 = y1 * Math.cos(pitch) - z2 * Math.sin(pitch);
	const depth = y1 * Math.sin(pitch) + z2 * Math.cos(pitch);
	if (depth >= PERSPECTIVE_PX * 0.86) return null;
	const scale = PERSPECTIVE_PX / (PERSPECTIVE_PX - depth);
	return { x: x2 * scale, y: y3 * scale, scale };
};

/** A word's box on screen (px from the centre, the box round it as turned), or null. */
const wordBoxOn = (board, line, word, pose) => {
	const place = line.place;
	const local = rotate2d(word.x, word.y, place.rot || 0);
	const world = toWorld(board, place.x + local.x, place.y + local.y);
	const point = projectPoint(pose, world.x, world.y, board.origin.z + (place.z || 0) + (word.z || 0));
	if (!point) return null;
	const turn = ((board.roll + (place.rot || 0) + (word.rot || 0) - pose.roll) * Math.PI) / 180;
	const halfWidth = (word.width / 2) * point.scale;
	// The ink of a line of type (caps and most letters), not its whole em: tightly stacked rows only touch.
	const halfHeight = word.size * 0.38 * point.scale;
	const cos = Math.abs(Math.cos(turn));
	const sin = Math.abs(Math.sin(turn));
	const reachX = halfWidth * cos + halfHeight * sin;
	const reachY = halfWidth * sin + halfHeight * cos;
	return { left: point.x - reachX, right: point.x + reachX, top: point.y - reachY, bottom: point.y + reachY };
};
const boxArea = (box) => Math.max(0, box.right - box.left) * Math.max(0, box.bottom - box.top);
const boxOverlap = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));

/** How solidly a line is on screen at a time (0 to 1), as the renderer draws it. */
const solidOn = (plan, line, time, progress, pose) => {
	const board = plan.boards[line.board];
	const visibility = boardVisibility(board, time);
	if (visibility <= 0.002) return 0;
	const depth = viewDepth(pose, line.center);
	const closeness = depth > PERSPECTIVE_PX * 0.86 ? 0 : 1 - clamp01((depth - 240) / 420);
	return levelsOn(board, line, progress - line.n, time).solid * visibility * closeness;
};
/** Whether a line has words on screen that are not on their way out (sung, and before its exit). */
const standing = (plan, line, time) => {
	if (time < line.start) return false;
	if (Number.isFinite(line.exitAt) && time >= line.exitAt) return false;
	return !(plan.boards[line.board].solo && Number.isFinite(line.soloOut) && time >= line.soloOut);
};

/** The sung words of a line on screen at a time (boxes), skipping compositions whose geometry the camera bends. */
const sungBoxes = (board, line, time, pose) => {
	const place = line.place;
	if (!place?.block?.words || place.tiltX || place.tiltY || place.fill || place.travel) return [];
	const boxes = [];
	place.block.words.forEach((word, index) => {
		if (!word) return;
		const timing = line.shown[index];
		if (timing && timing.start > time) return;
		const box = wordBoxOn(board, line, word, pose);
		if (box) boxes.push(box);
	});
	return boxes;
};

/**
 * Watches a composed edit the way a viewer would and reports what goes
 * wrong: words running off the screen, lines covering each other, lines
 * gone before they can be read, singing with nothing on screen, a crowd
 * of lines like a lyric sheet, how much the screen turns and flashes,
 * and an edit that leans on one look. score: 100 = nothing noticed.
 * issues name the song's lines (#n of the prompt) for the AI's notes.
 */
export const critiquePlan = (plan, options = {}) => {
	const lines = plan?.lines || [];
	if (!lines.length) return { score: 0, stats: {}, issues: [] };
	const step = Math.max(40, Number(options.step) || CRITIQUE_STEP_MS);
	const halfWidth = plan.W / 2;
	const halfHeight = plan.H / 2;
	const first = lines[0].start;
	const last = Math.max(...lines.map((line) => line.end));
	const span = Math.max(1, last - first);
	const shownMs = new Float64Array(lines.length);
	const afterLastMs = new Float64Array(lines.length);
	const blankOf = new Float64Array(lines.length);
	const crowdOf = new Map();
	const pairs = new Map();
	let overlapMs = 0;
	let blankMs = 0;
	let singingMs = 0;
	let crowdMs = 0;
	let turned = 0;
	let previousRoll = null;
	for (let time = first - 400; time <= last + 400; time += step) {
		const pose = cameraPose(plan, time);
		if (previousRoll !== null) {
			const change = Math.abs(pose.roll - previousRoll) % 360;
			turned += Math.min(change, 360 - change);
		}
		previousRoll = pose.roll;
		const progress = progressAt(plan, time);
		const index = lineIndexAt(plan, time);
		const visible = [];
		let sung = false;
		let sungShown = false;
		for (let n = Math.max(0, index - 5); n <= Math.min(lines.length - 1, index + 2); n += 1) {
			const line = lines[n];
			const level = solidOn(plan, line, time, progress, pose);
			// Only sung words are on screen (a line waiting for its turn shows at most its faint outline).
			if (level >= 0.5 && time >= line.start) {
				shownMs[n] += step;
				if (time >= line.lastWordStart) afterLastMs[n] += step;
			}
			if (level >= 0.35 && standing(plan, line, time)) visible.push(line);
			if (line.shown.some((word) => word.start <= time && time < Math.min(word.end, word.start + READ_WORD_MS))) {
				sung = true;
				if (level >= 0.3) sungShown = true;
				else blankOf[n] += step;
			}
		}
		if (sung) {
			singingMs += step;
			if (!sungShown) blankMs += step;
		}
		// Pieces of one sung line count as one line (a line built up word by word is not a crowd).
		const sources = new Set(visible.map((line) => (Number.isInteger(line.source) ? line.source : line.n)));
		if (sources.size >= 4) {
			crowdMs += step;
			const board = visible[visible.length - 1].board;
			crowdOf.set(board, (crowdOf.get(board) || 0) + step);
		}
		if (sources.size >= 2) {
			const boxes = visible.map((line) => sungBoxes(plan.boards[line.board], line, time, pose));
			let covered = false;
			for (let a = 0; a < visible.length; a += 1) {
				for (let b = a + 1; b < visible.length; b += 1) {
					if ((visible[a].source ?? visible[a].n) === (visible[b].source ?? visible[b].n)) continue;
					const hit = boxes[a].some((one) => boxes[b].some((other) => boxOverlap(one, other) > 0.2 * Math.min(boxArea(one), boxArea(other))));
					if (!hit) continue;
					covered = true;
					const key = visible[a].n + ":" + visible[b].n;
					pairs.set(key, (pairs.get(key) || 0) + step);
				}
			}
			if (covered) overlapMs += step;
		}
	}
	// Each line once all of it is in: how much of its words the frame cuts off.
	const clipped = [];
	lines.forEach((line) => {
		const board = plan.boards[line.board];
		if (BLEEDING_LAYOUTS.has(board.layout)) return;
		const until = Math.min(Number.isFinite(line.exitAt) ? line.exitAt : Infinity, Number.isFinite(line.leave) ? line.leave : Infinity, line.end + 1200) - 60;
		const time = Math.max(line.start, Math.min(line.lastWordStart + 220, until));
		const pose = cameraPose(plan, time);
		if (solidOn(plan, line, time, progressAt(plan, time), pose) < 0.5) return;
		let worst = 0;
		for (const box of sungBoxes(board, line, time, pose)) {
			const area = boxArea(box);
			if (!area) continue;
			const inside = boxOverlap(box, { left: -halfWidth, right: halfWidth, top: -halfHeight, bottom: halfHeight });
			worst = Math.max(worst, 1 - inside / area);
		}
		if (worst > 0.2) clipped.push(line);
	});
	// A line can be read while it is sung: a word sung quickly needs no more than its own time.
	const rushed = lines.filter((line, index) => index < lines.length - 1
		&& (shownMs[index] < Math.min(readingMs(line) * 0.6, line.end - line.start + 150)
			|| afterLastMs[index] < Math.min(260, Math.max(100, (line.end - line.lastWordStart) * 0.6))));
	const blanks = lines.filter((_, index) => blankOf[index] >= 400);
	const minutes = span / 60000;
	const turnsPerMinute = turned / 360 / Math.max(0.5, minutes);
	const flashesPerMinute = (plan.flashes?.length || 0) / Math.max(0.5, minutes);
	const boards = plan.boards;
	const layoutCount = new Map();
	for (const board of boards) layoutCount.set(board.layout, (layoutCount.get(board.layout) || 0) + 1);
	const [mostLayout, mostCount] = [...layoutCount.entries()].sort((a, b) => b[1] - a[1])[0] || ["", 0];
	const monotonous = boards.length >= 6 && (layoutCount.size < 3 || mostCount / boards.length > 0.4);
	const hits = lines.filter((line) => line.fx === "slam" || line.fx === "zoom");
	const tooManyHits = hits.length > Math.max(2, lines.length * 0.15);

	const sourceOf = (line) => (Number.isInteger(line.source) ? line.source : line.n);
	const numbers = (group) => [...new Set(group.map(sourceOf))].sort((a, b) => a - b);
	const byBoard = (group) => {
		const groups = new Map();
		for (const line of group) {
			if (!groups.has(line.board)) groups.set(line.board, []);
			groups.get(line.board).push(line);
		}
		return [...groups.entries()].map(([board, members]) => ({ board, layout: boards[board].layout, lines: numbers(members) }));
	};
	const issues = [];
	for (const group of byBoard(clipped)) issues.push({ kind: "clip", ...group });
	for (const [key, ms] of [...pairs.entries()].sort((a, b) => b[1] - a[1])) {
		if (ms < 300) continue;
		const [a, b] = key.split(":").map(Number);
		issues.push({ kind: "overlap", board: lines[b].board, layout: boards[lines[b].board].layout, lines: numbers([lines[a], lines[b]]), ms });
	}
	for (const group of byBoard(rushed)) issues.push({ kind: "rushed", ...group });
	for (const group of byBoard(blanks)) issues.push({ kind: "blank", ...group });
	for (const [board, ms] of crowdOf) if (ms >= 1000) issues.push({ kind: "crowd", board, layout: boards[board].layout, lines: numbers(lines.filter((line) => line.board === board)), ms });
	if (turnsPerMinute > 6) issues.push({ kind: "turns", value: round(turnsPerMinute, 1) });
	if (flashesPerMinute > 6) issues.push({ kind: "flashes", value: round(flashesPerMinute, 1) });
	if (monotonous) issues.push({ kind: "monotony", layout: mostLayout, value: mostCount, of: boards.length });
	if (tooManyHits) issues.push({ kind: "hits", lines: numbers(hits) });

	const penalty = Math.min(30, clipped.length * 5)
		+ Math.min(25, (overlapMs / span) * 400)
		+ Math.min(20, rushed.length * 2.5)
		+ Math.min(30, (blankMs / Math.max(1, singingMs)) * 250)
		+ Math.min(15, (crowdMs / span) * 150)
		+ Math.min(10, Math.max(0, turnsPerMinute - 6) * 1.5)
		+ Math.min(8, Math.max(0, flashesPerMinute - 6))
		+ (monotonous ? 6 : 0)
		+ (tooManyHits ? Math.min(8, hits.length - Math.max(2, lines.length * 0.15)) : 0);
	return {
		score: Math.round(clamp(100 - penalty, 0, 100)),
		stats: {
			clipped: clipped.length,
			overlapMs: Math.round(overlapMs),
			rushed: rushed.length,
			blankMs: Math.round(blankMs),
			singingMs: Math.round(singingMs),
			crowdMs: Math.round(crowdMs),
			turnsPerMinute: round(turnsPerMinute, 2),
			flashesPerMinute: round(flashesPerMinute, 2),
			layouts: layoutCount.size,
			hits: hits.length,
		},
		issues,
	};
};

/** The critique as short notes for the AI to revise its direction from (English, at most eight). */
export const critiqueNotes = (critique, limit = 8) => {
	const list = (numbers) => numbers.map((n) => "#" + n).join(", ");
	const notes = [];
	for (const issue of critique?.issues || []) {
		switch (issue.kind) {
			case "clip": notes.push("Lines " + list(issue.lines) + " (layout " + issue.layout + ") run off the screen: give them a composition that keeps them in frame (lockup, column, corners, stairs) or split them into phrases."); break;
			case "overlap": notes.push("Lines " + list(issue.lines) + " cover each other on screen (layout " + issue.layout + "): give that shot room, fewer lines, or a one-at-a-time composition."); break;
			case "rushed": notes.push("Lines " + list(issue.lines) + " (layout " + issue.layout + ") are gone before they can be read: keep each whole until the next is sung (split line, a composition that holds lines), fewer pieces."); break;
			case "blank": notes.push("While " + list(issue.lines) + " are sung they are hardly on screen (layout " + issue.layout + "): a quicker entrance into that shot, and a composition that keeps the sung line in view."); break;
			case "crowd": notes.push("The shot with " + list(issue.lines) + " (layout " + issue.layout + ") shows four or more lines at once and reads like a lyric sheet: fewer lines in it, or one at a time."); break;
			case "turns": notes.push("The screen turns " + issue.value + " full circles a minute: keep turning moves and compositions (" + TURNING_NAMES + ") to section changes."); break;
			case "flashes": notes.push(issue.value + " flashes a minute: keep cut, panel, glitch and flicker to real section changes."); break;
			case "monotony": notes.push("The edit leans on " + issue.layout + " (" + issue.value + " of " + issue.of + " shots): draw on more of the kit, keeping the chorus look for the choruses."); break;
			case "hits": notes.push("slam or zoom on " + issue.lines.length + " lines (" + list(issue.lines.slice(0, 8)) + "): keep hits for the one or two loudest moments, arrive smoothly elsewhere."); break;
			default: break;
		}
		if (notes.length >= limit) break;
	}
	return notes;
};
