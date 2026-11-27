import { plateLevel, revealClip, strokeLevel } from "./motionBackground.mjs";
import { boardVisibility } from "./motionCamera.mjs";
import { PERSPECTIVE_PX } from "./motionCameraFraming.mjs";
import { clamp, clamp01, easeInOutCubic, easeOutBack, easeOutCubic, lerp, round } from "./motionMath.mjs";
import {
	CHAR_FX, EXIT_MS, HIDDEN, LETTER_EXITS, LETTER_SETTLED, SETTLED, charFrame, easeInCubic,
	exitCharFrame, exitFrame, floatOffset, fxPaceOf, levelsOn, lineMotion, solidFrame, wordEntrance,
} from "./motionTypeEffects.mjs";

const NEAR = [240, 660, 0.86];
// Diving through a line lets it grow much closer before it fades.
const NEAR_THROUGH = [600, 980, 0.97];
/** Things fade as they come up to the lens instead of filling the screen. */
const closenessOf = (depth, near) => (depth > PERSPECTIVE_PX * near[2] ? 0 : 1 - clamp01((depth - near[0]) / (near[1] - near[0])));

const writeCharacter = (char, state) => {
	const { cache, el } = char;
	const opacity = round(state.opacity, 3);
	if (cache.opacity !== opacity) {
		cache.opacity = opacity;
		el.style.opacity = String(opacity);
	}
	if (cache.transform !== state.transform) {
		cache.transform = state.transform;
		el.style.transform = state.transform;
	}
	const text = state.text || char.text;
	if (cache.text !== text) {
		cache.text = text;
		el.textContent = text;
	}
};

const settleCharacters = (chars) => {
	if (!chars) return;
	for (const char of chars) writeCharacter(char, LETTER_SETTLED);
};

export function createBoardPainter({ write, isLite }) {
	const writeSolid = (word, frameState) => {
		write(word.cache, "opacity", round(frameState.opacity, 3), (value) => word.solid.style.setProperty("--e", String(value)));
		write(word.cache, "transform", frameState.transform, (value) => { word.solid.style.transform = value; });
		write(word.cache, "filter", frameState.filter, (value) => { word.solid.style.filter = value; });
		write(word.cache, "clip", frameState.clip, (value) => { word.solid.style.clipPath = value; });
		write(word.cache, "shadow", frameState.shadow, (value) => { word.solid.style.textShadow = value; });
	};

	/** A variable word's weight and width (rounded, so the type is reshaped only when they visibly change). */
	const writeFlex = (word, weight, width) => {
		// Lite: words keep their resting weight (a changing weight lays the word out again every frame).
		if (isLite()) {
			weight = word.flex.weight;
			width = word.flex.wdth ? 100 : null;
		}
		write(word.cache, "weight", Math.round(weight / 10) * 10, (value) => { word.el.style.fontWeight = String(value); });
		if (width !== null) write(word.cache, "stretch", Math.round(width), (value) => { word.el.style.fontStretch = value + "%"; });
	};

	const settleLine = (entry, sung) => {
		const state = sung ? "sung" : "waiting";
		if (entry.settled === state) return;
		entry.settled = state;
		const flash = entry.line.place.flash === true;
		entry.words.forEach((word, order) => {
			// One word at a time: a sung line keeps only its last word.
			const shown = sung && !(flash && order < entry.line.words.length - 1);
			writeSolid(word, shown ? SETTLED : HIDDEN);
			write(word.cache, "active", false, (value) => word.el.classList.toggle("is-active", value));
			if (word.box) write(word.cache, "box", shown ? 1 : 0, (value) => word.box.style.setProperty("--b", String(value)));
			if (word.spark) write(word.cache, "spark", "hidden", (value) => { word.spark.style.visibility = value; });
			if (word.pulse) write(word.cache, "pulse", "", (value) => { word.solid.style.scale = value; });
			write(word.cache, "float", "", (value) => { word.el.style.translate = value; });
			if (word.flex) writeFlex(word, word.flex.weight, word.flex.wdth ? 100 : null);
			settleCharacters(word.chars);
		});
		if (entry.rule) write(entry.cache, "rule", sung ? 1 : 0, (value) => entry.rule.style.setProperty("--r", String(value)));
	};

	const paintWords = (plan, board, entry, time, distance, beat, fxPace) => {
		entry.settled = null;
		const line = entry.line;
		const sway = clamp01(1 - (distance - 0.3) / 0.9);
		const seed = entry.seed;
		const pace = plan.pace;
		const exitLength = line.exitLength || EXIT_MS * fxPace;
		const lettered = !!LETTER_EXITS[board.exit];
		const letterFx = CHAR_FX.has(line.fx);
		const floating = board.hold === "float";
		const flash = line.place.flash === true;
		entry.words.forEach((word, order) => {
			if (floating) {
				const lift = round(floatOffset(line, order, word.size || plan.F, time), 1);
				write(word.cache, "float", Math.abs(lift) < 0.1 ? "" : "0 " + lift + "px", (value) => { word.el.style.translate = value; });
			}
			// One word at a time: a word gives way as the next one comes in.
			const next = flash ? line.words[order + 1] : null;
			if (next && time >= next.start - 40) {
				writeSolid(word, HIDDEN);
				write(word.cache, "active", false, (value) => word.el.classList.toggle("is-active", value));
				if (word.box) write(word.cache, "box", 0, (value) => word.box.style.setProperty("--b", String(value)));
				return;
			}
			if (time >= line.exitAt) {
				// Leaving: the words go one after another with the shot's exit, settled in place until their turn.
				const k = clamp01((time - (line.exitAt + order * line.exitStagger)) / exitLength);
				write(word.cache, "active", false, (value) => word.el.classList.toggle("is-active", value));
				// A variable word thins out as it goes.
				if (word.flex) {
					const eased = easeInCubic(k);
					writeFlex(word, lerp(word.flex.weight, word.flex.thin, eased), word.flex.wdth ? lerp(100, word.flex.narrow, eased) : null);
				}
				if (word.chars && lettered) {
					// Taken apart letter by letter.
					writeSolid(word, k >= 1 ? HIDDEN : SETTLED);
					const context = { count: word.chars.length, seed: seed + word.index * 131 };
					word.chars.forEach((char, index) => {
						writeCharacter(char, exitCharFrame(board.exit, k, char.char, index, context));
					});
					return;
				}
				writeSolid(word, exitFrame(board.exit, k, seed + word.index * 7919, line.info.rtl));
				settleCharacters(word.chars);
				return;
			}
			const progress = wordEntrance(line.fx, word.word, time, pace);
			writeSolid(word, solidFrame(line.fx, progress, seed + word.index * 7919, line.info.rtl));
			write(word.cache, "active", time >= word.word.start && time < word.word.end, (value) => word.el.classList.toggle("is-active", value));
			if (word.flex) {
				// A variable word lands thin and narrow and swells to its weight as it is sung; an emphasised one breathes with the beat.
				const flex = word.flex;
				const grow = easeOutCubic(clamp01((time - word.word.start + 40) / clamp(word.word.end - word.word.start, 280, 720)));
				let weight = lerp(flex.thin, flex.weight, grow);
				let width = flex.wdth ? lerp(flex.narrow, 100, grow) : null;
				if (word.emph && grow >= 1) {
					weight = Math.min(flex.heaviest, weight + beat * 70);
					if (width !== null) width = Math.min(flex.wide, width + beat * 5);
				}
				writeFlex(word, weight, width);
			}
			if (word.box) {
				write(word.cache, "box", round(easeOutCubic(clamp01((time - word.word.start + 40) / (300 * fxPace))), 3), (value) => word.box.style.setProperty("--b", String(value)));
			}
			if (word.pulse) {
				const throb = time >= word.word.start ? 1 + beat * 0.09 : 1;
				write(word.cache, "pulse", throb > 1.004 ? String(round(throb, 3)) : "", (value) => { word.solid.style.scale = value; });
			}
			if (word.spark) {
				const since = time - word.word.start;
				const visible = since >= 0 && since < 560;
				write(word.cache, "spark", visible ? "visible" : "hidden", (value) => { word.spark.style.visibility = value; });
				if (visible) {
					const k = easeOutCubic(since / 560);
					write(word.cache, "sparkTransform", "translate(-50%,-50%) scale(" + round(0.55 + k * 0.85, 3) + ") rotate(" + round((seed % 40) - 20 + k * 25, 1) + "deg)",
						(value) => { word.spark.style.transform = value; });
					write(word.cache, "sparkOpacity", round(1 - k, 3), (value) => { word.spark.style.opacity = String(value); });
				}
			}
			if (word.chars && letterFx) {
				const context = { count: word.chars.length, wordStart: word.word.start, seed: seed + word.index * 131, sway, pace };
				word.chars.forEach((char, index) => writeCharacter(char, charFrame(line.fx, char.char, index, time, context)));
			} else {
				// Letters set apart only for the exit come in with their word.
				settleCharacters(word.chars);
			}
		});
		if (entry.rule) {
			const k = easeInOutCubic(clamp01((time - line.start + 220) / (900 * fxPace)));
			write(entry.cache, "rule", round(k, 3), (value) => entry.rule.style.setProperty("--r", String(value)));
		}
	};

	const paintBoard = (plan, entry, time, depthOf, progress, beat, through) => {
		const board = entry.board;
		const visibility = boardVisibility(board, time);
		const fxPace = fxPaceOf(plan.pace);
		const near = through === board.index ? NEAR_THROUGH : NEAR;
		for (const lineEntry of entry.lines) {
			const line = lineEntry.line;
			const distance = progress - line.n;
			const closeness = closenessOf(depthOf(line.center), near);
			const levels = levelsOn(board, line, distance, time);
			const ghost = round(levels.ghost * visibility * closeness, 3);
			const solid = round(levels.solid * visibility * closeness, 3);
			write(lineEntry.cache, "ghost", ghost, (value) => lineEntry.el.style.setProperty("--lg", String(value)));
			write(lineEntry.cache, "solid", solid, (value) => lineEntry.el.style.setProperty("--ls", String(value)));
			const shown = ghost > 0.002 || solid > 0.002;
			write(lineEntry.cache, "visibility", shown ? "visible" : "hidden", (value) => { lineEntry.el.style.visibility = value; });
			if (shown) write(lineEntry.cache, "hold", lineMotion(board, line, time, beat, plan.F), (value) => { lineEntry.el.style.transform = lineEntry.base + value; });
			if (time >= line.start - 900 && time <= lineEntry.animateUntil) paintWords(plan, board, lineEntry, time, distance, beat, fxPace);
			else settleLine(lineEntry, time > line.end);
		}
		for (const item of entry.motifs) {
			const motif = item.motif;
			const startAt = motif.line === null ? board.appear + 250 : plan.lines[board.first + motif.line].start - 60;
			const closeness = closenessOf(depthOf(motif.center), near);
			if (time < startAt || visibility * closeness <= 0.002) {
				write(item.cache, "visibility", "hidden", (value) => { item.el.style.visibility = value; });
				continue;
			}
			write(item.cache, "visibility", "visible", (value) => { item.el.style.visibility = value; });
			const since = time - startAt;
			const entrance = clamp01(since / (520 * fxPace));
			const lineDistance = motif.line === null ? 0 : progress - (board.first + motif.line);
			const fade = motif.line === null ? 1 : lineDistance > 1.5 ? 0.6 : 1;
			const scale = Math.max(0, easeOutBack(entrance)) * (1 + beat * 0.12);
			const rotation = motif.rot - (1 - easeOutCubic(entrance)) * 70 + (motif.spin * since) / 1000;
			write(item.cache, "opacity", round(motif.opacity * visibility * fade * closeness, 3), (value) => { item.el.style.opacity = String(value); });
			write(item.cache, "transform",
				"translate3d(" + round(motif.x) + "px," + round(motif.y) + "px," + round(motif.z) + "px) translate(-50%,-50%) rotate(" + round(rotation, 1) + "deg) scale(" + round(scale, 3) + ")",
				(value) => { item.el.style.transform = value; });
			const draw = round(1 - easeOutCubic(clamp01(since / (760 * fxPace))), 3);
			write(item.cache, "draw", draw, (value) => {
				// Not drawn yet, a round line cap would still show a dot where the stroke starts.
				for (const path of item.paths) {
					if (path.mode !== "stroke") continue;
					path.el.style.strokeDashoffset = String(value);
					path.el.style.visibility = value >= 0.999 ? "hidden" : "";
				}
			});
		}
		for (const item of entry.strokes) {
			const stroke = item.stroke;
			const level = round(strokeLevel(plan, board, stroke, time), 4);
			write(item.cache, "opacity", round(level > 0 ? 0.62 * visibility : 0, 3), (value) => { item.el.style.opacity = String(value); });
			write(item.cache, "transform",
				"translate3d(" + round(stroke.x) + "px," + round(stroke.y) + "px," + round(stroke.z) + "px) rotateZ(" + stroke.rot + "deg) scaleX(" + level + ")",
				(value) => { item.el.style.transform = value; });
		}
		write(entry.cache, "fills", round(0.2 * visibility, 3), (value) => entry.el.style.setProperty("--fl", String(value)));
		for (const item of entry.plates) {
			const plate = item.plate;
			const level = round(plateLevel(plan, board, plate, time), 3);
			write(item.cache, "opacity", round(level > 0 ? visibility * (plate.solo ? clamp01(level * 3) : 1) : 0, 3), (value) => { item.el.style.opacity = String(value); });
			const turn = plate.spin ? plate.rot + (plate.spin * (time - plan.lines[board.first + plate.line].start)) / 1000 : plate.rot;
			write(item.cache, "transform",
				"translate3d(" + round(plate.x) + "px," + round(plate.y) + "px," + round(plate.z) + "px) translate(-50%,-50%) rotateZ(" + round(turn, 2) + "deg) "
					+ (plate.kind === "band" ? "scaleY(" + level + ")" : "scale(" + round(0.7 + 0.3 * level, 3) + ")"),
				(value) => { item.el.style.transform = value; });
		}
		for (const item of entry.streams) {
			// A marquee row: shown while its line is the current one, streaming sideways.
			const fill = item.fill;
			const owner = plan.lines[board.first + fill.line];
			const next = plan.lines[board.first + fill.line + 1];
			let level = clamp01((time - (owner.start - 320)) / 260);
			if (next && next.board === board.index) level *= 1 - clamp01((time - (next.start - 280)) / 220);
			const opacity = round(0.24 * visibility * level, 3);
			write(item.cache, "opacity", opacity, (value) => { item.el.style.opacity = String(value); });
			if (opacity <= 0) continue;
			const travel = (fill.speed * (time - owner.start)) / 1000;
			const shift = ((travel % fill.step) + fill.step) % fill.step - fill.step / 2;
			write(item.cache, "transform", "translate3d(" + round(fill.x + shift) + "px," + round(fill.y) + "px," + round(fill.z) + "px) translate(-50%,-56%)",
				(value) => { item.el.style.transform = value; });
		}
		// The way into a board that opens out of a circle (iris) or a band (open).
		if (entry.reveal) {
			const clip = revealClip(plan, board, time);
			write(entry.cache, "reveal", clip, (value) => { entry.el.style.clipPath = value; });
		}
		if (entry.echo) {
			const echo = board.echo;
			const span = Math.max(1, (Number.isFinite(board.fadeEnd) ? board.fadeEnd : board.appear + 20000) - board.appear);
			const travel = clamp01((time - board.appear) / span) - 0.5;
			write(entry.echo.cache, "opacity", round(0.15 * visibility, 3), (value) => { entry.echo.el.style.opacity = String(value); });
			write(entry.echo.cache, "transform",
				"translate3d(" + round(echo.x + echo.drift * travel) + "px," + round(echo.y) + "px," + round(echo.z) + "px) translate(-50%,-56%) rotateZ(" + round(echo.rot, 2) + "deg)",
				(value) => { entry.echo.el.style.transform = value; });
		}
	};

	return paintBoard;
}
