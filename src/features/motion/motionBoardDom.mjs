import { REVEAL_ENTERS } from "./motionDirectionVocabulary.mjs";
import {
	BOX_ACCENTS, applyFont, createLoop, createOutlines, createScribble, setOutlineText,
} from "./motionDomEffects.mjs";
import { motionShapes } from "./MotionLyricsShapes.mjs";
import { hashString, round } from "./motionMath.mjs";
import { CHAR_FX, LETTER_EXITS, flexOf } from "./motionTypeEffects.mjs";
import { FALLBACK_SPEC } from "./motionTypesetting.mjs";

export function createBoardMount({ document, camera, defs, shapedOutlines }) {
	const shapes = motionShapes;
	const outlineOf = createOutlines(document, defs, shapedOutlines);

	const mountWord = (board, line, word, wordIndex, spot, lineEl) => {
		const wordEl = document.createElement("div");
		const kind = spot.spec?.kind;
		const voice = spot.voice ? line.backing[spot.voice - 1] : null;
		wordEl.className = "ivlyrics-motion-word"
			+ (kind === "light" ? " is-light" : kind === "serif" ? " is-serif" : "")
			+ (spot.emph ? " is-emph" : "")
			+ (voice ? " is-voice is-" + voice.role : "")
			+ (spot.vertical ? " is-upright" : "");
		wordEl.style.fontSize = round(spot.size) + "px";
		wordEl.style.transform = "translate3d(" + round(spot.x) + "px," + round(spot.y) + "px," + round(spot.z || 0) + "px)"
			+ (spot.rot ? " rotate(" + round(spot.rot, 2) + "deg)" : "")
			+ (spot.vertical ? " translate(-50%,-50%)" : " translate(-50%,-56%)");
		applyFont(wordEl, spot.spec || FALLBACK_SPEC);
		if (line.info.rtl) wordEl.dir = "rtl";
		const ghost = document.createElement("span");
		ghost.className = "ivlyrics-motion-ghost";
		// Other voices wait as a faint fill (style.css), not an outline.
		setOutlineText(document, ghost, spot.text || word.text, voice ? "" : outlineOf(spot.size * 0.012));
		wordEl.appendChild(ghost);
		let box = null;
		let spark = null;
		if (spot.emph && BOX_ACCENTS.has(board.accent)) {
			box = document.createElement("span");
			box.className = "ivlyrics-motion-box is-" + board.accent;
			wordEl.appendChild(box);
		} else if (spot.emph && board.accent === "circle") {
			// Drawn around the word as it is sung (--b, like the boxes).
			box = createLoop(document, spot.width + spot.size * 0.56, spot.size * 1.3, Math.max(2, spot.size * 0.055));
			box.style.left = round(-spot.size * 0.28) + "px";
			box.style.top = round(-spot.size * 0.13) + "px";
			wordEl.appendChild(box);
		} else if (spot.emph && board.accent === "scribble") {
			box = createScribble(document, spot.width + spot.size * 0.2, spot.size * 0.26, Math.max(2, spot.size * 0.055));
			box.style.left = round(-spot.size * 0.1) + "px";
			box.style.top = round(spot.size * 0.94) + "px";
			wordEl.appendChild(box);
		} else if (spot.emph && (board.accent === "trail" || board.accent === "spectrum")) {
			// Copies that step out from behind the word as it is sung: outlines (trail) or coloured fills (spectrum).
			box = document.createElement("span");
			box.className = "ivlyrics-motion-trails";
			for (let copy = 3; copy >= 1; copy -= 1) {
				const trail = document.createElement("span");
				trail.className = "ivlyrics-motion-trail";
				trail.style.setProperty("--k", String(copy));
				trail.textContent = spot.text || word.text;
				box.appendChild(trail);
			}
			wordEl.appendChild(box);
		}
		const solid = document.createElement("span");
		solid.className = "ivlyrics-motion-solid";
		let chars = null;
		// Letters of their own for letter-by-letter entrances and exits.
		if ((CHAR_FX.has(line.fx) || LETTER_EXITS[board.exit]) && spot.letters !== false) {
			const cased = (spot.text || word.text) !== word.text;
			// Styles that paint through the glyphs (the gradient accent) then paint each letter, not the word:
			// the word would also paint every letter where it rests, under the one in motion.
			solid.classList.add("has-letters");
			chars = word.chars.map((char) => {
				const charEl = document.createElement("span");
				charEl.className = "ivlyrics-motion-char";
				charEl.textContent = cased ? char.ch.toLocaleUpperCase() : char.ch;
				solid.appendChild(charEl);
				return { el: charEl, char, text: charEl.textContent, cache: { text: charEl.textContent } };
			});
		} else {
			solid.textContent = spot.text || word.text;
		}
		wordEl.appendChild(solid);
		if (spot.emph && board.accent === "spark" && shapes?.createSvg) {
			spark = document.createElement("span");
			spark.className = "ivlyrics-motion-spark";
			const drawn = shapes.createSvg(document, shapes.motifOf("burst"), spot.size * 1.9);
			spark.appendChild(drawn.svg);
			wordEl.appendChild(spark);
		}
		lineEl.appendChild(wordEl);
		// Glowing words throb with the beat.
		return { el: wordEl, solid, box, spark, chars, word, index: wordIndex, size: spot.size, emph: spot.emph, pulse: spot.emph && (board.accent === "glow" || board.accent === "neon"), flex: flexOf(spot.spec), cache: {} };
	};

	const mountBoard = (plan, index) => {
		const board = plan.boards[index];
		const el = document.createElement("div");
		el.className = "ivlyrics-motion-board accent-" + board.accent + " type-" + board.type + (board.serif ? " has-serif" : "");
		el.style.transform = "translate3d(" + round(board.origin.x) + "px," + round(board.origin.y) + "px," + round(board.origin.z) + "px) rotateZ(" + round(board.roll, 2) + "deg)";
		let echo = null;
		if (board.echo) {
			const echoEl = document.createElement("div");
			echoEl.className = "ivlyrics-motion-echo";
			setOutlineText(document, echoEl, board.echo.text, outlineOf(Math.max(0.75, board.echo.size * 0.006)));
			echoEl.style.fontSize = round(board.echo.size) + "px";
			applyFont(echoEl, board.echo.spec || FALLBACK_SPEC);
			el.appendChild(echoEl);
			echo = { el: echoEl, cache: {} };
		}
		const motifs = board.motifs.map((motif) => {
			const motifEl = document.createElement("div");
			motifEl.className = "ivlyrics-motion-motif" + (motif.accent ? " is-accent" : "");
			motifEl.style.width = round(motif.size) + "px";
			motifEl.style.height = round(motif.size) + "px";
			const drawn = shapes?.createSvg?.(document, motif.parts, motif.size);
			if (drawn) motifEl.appendChild(drawn.svg);
			el.appendChild(motifEl);
			return { el: motifEl, motif, paths: drawn?.paths || [], cache: {} };
		});
		const strokes = board.strokes.map((stroke) => {
			const strokeEl = document.createElement("div");
			strokeEl.className = "ivlyrics-motion-stroke";
			strokeEl.style.width = round(stroke.length) + "px";
			el.appendChild(strokeEl);
			return { el: strokeEl, stroke, cache: {} };
		});
		const plates = board.plates.map((plate) => {
			const plateEl = document.createElement("div");
			plateEl.className = "ivlyrics-motion-plate is-" + plate.kind + " is-" + plate.color;
			plateEl.style.width = round(plate.w) + "px";
			plateEl.style.height = round(plate.h) + "px";
			if (plate.radius) plateEl.style.borderRadius = round(plate.radius) + "px";
			el.appendChild(plateEl);
			return { el: plateEl, plate, cache: {} };
		});
		// Rows of a marquee belong to one line and stream sideways (paintBoard); a word wall's copies stand still.
		const streams = [];
		for (const fill of board.fills) {
			const fillEl = document.createElement("div");
			fillEl.className = "ivlyrics-motion-fill";
			setOutlineText(document, fillEl, fill.text, outlineOf(Math.max(0.5, fill.size * 0.01)));
			fillEl.style.fontSize = round(fill.size) + "px";
			fillEl.style.transform = "translate3d(" + round(fill.x) + "px," + round(fill.y) + "px," + round(fill.z) + "px) rotateZ(" + round(fill.rot, 2) + "deg) translate(-50%,-56%)";
			applyFont(fillEl, fill.spec || FALLBACK_SPEC);
			el.appendChild(fillEl);
			if (Number.isInteger(fill.line)) {
				fillEl.style.opacity = "0";
				streams.push({ el: fillEl, fill, cache: {} });
			}
		}
		const lines = board.places.map((place, local) => {
			const line = plan.lines[board.first + local];
			const lineEl = document.createElement("div");
			lineEl.className = "ivlyrics-motion-line" + (place.ground === "color" ? " on-color" : "");
			if (line.info.lang) lineEl.lang = line.info.lang;
			// The line's place; its hold (holdFrame) is added after it every frame.
			const base = "translate3d(" + round(place.x) + "px," + round(place.y) + "px," + round(place.z) + "px) rotateZ(" + round(place.rot, 2) + "deg)"
				+ (place.tiltY ? " rotateY(" + round(place.tiltY, 2) + "deg)" : "")
				+ (place.tiltX ? " rotateX(" + round(place.tiltX, 2) + "deg)" : "");
			lineEl.style.transform = base;
			let rule = null;
			if (board.rule) {
				rule = document.createElement("div");
				rule.className = "ivlyrics-motion-rule";
				const width = place.block.width + plan.F * 0.9;
				rule.style.width = round(width) + "px";
				rule.style.transform = "translate(" + round(-width / 2) + "px," + round(place.block.height / 2 + plan.F * 0.14) + "px)";
				rule.style.transformOrigin = line.info.rtl ? "100% 50%" : "0 50%";
				lineEl.appendChild(rule);
			}
			const words = line.shown.map((word, wordIndex) => mountWord(board, line, word, wordIndex, place.block.words[wordIndex], lineEl));
			el.appendChild(lineEl);
			const animateUntil = Number.isFinite(line.exitAt)
				? Math.max(line.end + 1700, line.exitAt + line.exitSpan + 60)
				: line.end + 1700;
			return { el: lineEl, line, words, rule, base, seed: hashString(line.text), animateUntil, cache: {}, settled: null };
		});
		camera.appendChild(el);
		return { el, board, lines, motifs, strokes, plates, streams, echo, reveal: board.index > 0 && REVEAL_ENTERS.has(board.enter), cache: {} };
	};

	return mountBoard;
}
