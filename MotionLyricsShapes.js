// Motion lyrics shapes: the vector motifs that animate around the lyrics.
//
// Every motif is drawn in a 100x100 box. The AI director names motifs from
// this library, or sends a few custom single-path shapes that are checked
// here before they ever reach the DOM.
(function IvLyricsMotionShapes(root) {
	"use strict";

	if (root.ivLyricsMotionShapes?.initialized) return;

	const stroke = (d) => ({ d, mode: "stroke" });
	const fill = (d) => ({ d, mode: "fill" });
	const dashed = (d) => ({ d, mode: "dashed" });

	const MOTIFS = Object.freeze({
		ring: [stroke("M50 8a42 42 0 1 1 0 84a42 42 0 1 1 0-84Z")],
		disc: [fill("M50 8a42 42 0 1 1 0 84a42 42 0 1 1 0-84Z")],
		dot: [fill("M50 36a14 14 0 1 1 0 28a14 14 0 1 1 0-28Z")],
		dots: [fill("M20 12a8 8 0 1 1 0 16a8 8 0 1 1 0-16ZM50 12a8 8 0 1 1 0 16a8 8 0 1 1 0-16ZM80 12a8 8 0 1 1 0 16a8 8 0 1 1 0-16Z"
			+ "M20 42a8 8 0 1 1 0 16a8 8 0 1 1 0-16ZM50 42a8 8 0 1 1 0 16a8 8 0 1 1 0-16ZM80 42a8 8 0 1 1 0 16a8 8 0 1 1 0-16Z"
			+ "M20 72a8 8 0 1 1 0 16a8 8 0 1 1 0-16ZM50 72a8 8 0 1 1 0 16a8 8 0 1 1 0-16ZM80 72a8 8 0 1 1 0 16a8 8 0 1 1 0-16Z")],
		halo: [dashed("M50 6a44 44 0 1 1 0 88a44 44 0 1 1 0-88Z")],
		sparkle: [fill("M50 0C53 30 70 47 100 50C70 53 53 70 50 100C47 70 30 53 0 50C30 47 47 30 50 0Z")],
		star: [fill("M50 2L61.8 33.8L95.7 35.2L69 56.2L78.2 88.8L50 70L21.8 88.8L31 56.2L4.3 35.2L38.2 33.8Z")],
		cross: [stroke("M16 16L84 84M84 16L16 84")],
		plus: [stroke("M50 10V90M10 50H90")],
		burst: [stroke("M50 2V24M50 76V98M2 50H24M76 50H98M16 16L32 32M68 68L84 84M84 16L68 32M32 68L16 84")],
		sunburst: [fill("M50 0L56.6 16.7L69.1 3.8L68.9 21.7L85.4 14.6L78.3 31.1L96.2 30.9L83.3 43.4L100 50L83.3 56.6L96.2 69.1"
			+ "L78.3 68.9L85.4 85.4L68.9 78.3L69.1 96.2L56.6 83.3L50 100L43.4 83.3L30.9 96.2L31.1 78.3L14.6 85.4L21.7 68.9"
			+ "L3.8 69.1L16.7 56.6L0 50L16.7 43.4L3.8 30.9L21.7 31.1L14.6 14.6L31.1 21.7L30.9 3.8L43.4 16.7Z")],
		arc: [stroke("M8 72A44 44 0 0 1 92 72")],
		wave: [stroke("M2 50Q14.5 24 27 50T52 50T77 50T102 50")],
		zigzag: [stroke("M2 62L14 38L26 62L38 38L50 62L62 38L74 62L86 38L98 62")],
		scribble: [stroke("M6 72C18 36 34 88 50 58S78 18 94 36")],
		square: [stroke("M16 16H84V84H16Z")],
		triangle: [stroke("M50 10L92 84H8Z")],
		frame: [stroke("M8 32V8H32M68 8H92V32M92 68V92H68M32 92H8V68")],
		bars: [fill("M8 26H68V38H8ZM8 46H92V58H8ZM8 66H48V78H8Z")],
		heart: [fill("M50 88C20 66 6 48 6 30C6 16 17 6 30 6C40 6 47 12 50 20C53 12 60 6 70 6C83 6 94 16 94 30C94 48 80 66 50 88Z")],
		moon: [fill("M62 6A44 44 0 1 0 94 70A36 36 0 1 1 62 6Z")],
		sun: [fill("M50 32a18 18 0 1 1 0 36a18 18 0 1 1 0-36Z"), stroke("M50 2V18M50 82V98M2 50H18M82 50H98M16 16L27 27M73 73L84 84M84 16L73 27M27 73L16 84")],
		flower: [fill("M50 50C40 32 40 12 50 4C60 12 60 32 50 50C68 40 88 40 96 50C88 60 68 60 50 50C60 68 60 88 50 96C40 88 40 68 50 50C32 60 12 60 4 50C12 40 32 40 50 50Z")],
		drop: [fill("M50 6C50 6 82 44 82 64A32 32 0 1 1 18 64C18 44 50 6 50 6Z")],
		cloud: [fill("M28 78A20 20 0 1 1 32 40A26 26 0 0 1 82 44A18 18 0 1 1 80 78Z")],
		bolt: [fill("M58 4L18 56H46L40 96L82 40H54Z")],
		note: [fill("M14 76a12 10 0 1 0 24 0a12 10 0 1 0-24 0ZM62 66a12 10 0 1 0 24 0a12 10 0 1 0-24 0Z"), stroke("M37 76V22L85 12V66")],
		eye: [stroke("M4 50C20 22 80 22 96 50C80 78 20 78 4 50Z"), fill("M50 36a14 14 0 1 1 0 28a14 14 0 1 1 0-28Z")],
		flame: [fill("M50 4C60 26 82 38 82 62A32 32 0 0 1 18 62C18 46 28 36 34 28C36 42 44 46 46 46C42 30 44 16 50 4Z")],
		leaf: [fill("M10 90C10 40 40 10 90 10C90 60 60 90 10 90Z")],
		snow: [stroke("M50 6V94M12 28L88 72M88 28L12 72M50 6L41 16M50 6L59 16M50 94L41 84M50 94L59 84")],
		arrow: [stroke("M8 50H88M62 24L90 50L62 76")],
		crown: [fill("M10 80L16 28L36 54L50 18L64 54L84 28L90 80Z")],
		spiral: [stroke("M50 50m0-5a5 5 0 1 1-5 5a10 10 0 1 1 10 10a15 15 0 1 1-15-15a20 20 0 1 1 20 20a25 25 0 1 1-25-25a30 30 0 1 1 30 30")],
	});

	const NAMES = Object.freeze(Object.keys(MOTIFS));
	const SVG_NS = "http://www.w3.org/2000/svg";
	const PATH_RE = /^[MmLlHhVvCcSsQqTtAaZz0-9eE.,\s+-]+$/;
	const NAME_RE = /^[a-z][a-z0-9_-]{0,23}$/;
	const MAX_PATH_LENGTH = 600;

	/** A custom path from the AI, or null when it is not a plain, bounded path. */
	const sanitizePath = (value) => {
		const d = String(value ?? "").trim().replace(/\s+/g, " ");
		if (!d || d.length > MAX_PATH_LENGTH || !PATH_RE.test(d) || !/^[Mm]/.test(d)) return null;
		const numbers = d.match(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) || [];
		if (numbers.length < 4 || numbers.length > 260) return null;
		// Coordinates stay near the 100x100 box (arcs and controls may overshoot a little).
		if (numbers.some((number) => !Number.isFinite(Number(number)) || Math.abs(Number(number)) > 400)) return null;
		return d;
	};

	/** Custom shapes keyed by name: { name: [{ d, mode }] }. Unknown or unsafe entries are dropped. */
	const sanitizeShapes = (raw, limit = 3) => {
		const shapes = {};
		if (!raw || typeof raw !== "object" || Array.isArray(raw)) return shapes;
		for (const [key, value] of Object.entries(raw)) {
			if (Object.keys(shapes).length >= limit) break;
			const name = String(key).trim().toLowerCase();
			if (!NAME_RE.test(name) || MOTIFS[name]) continue;
			const d = sanitizePath(typeof value === "string" ? value : value?.d);
			if (!d) continue;
			const mode = String(value?.style || value?.mode || "fill").toLowerCase() === "stroke" ? "stroke" : "fill";
			shapes[name] = [{ d, mode }];
		}
		return shapes;
	};

	const motifOf = (name, custom = null) => custom?.[name] || MOTIFS[name] || null;

	/**
	 * An <svg> for a motif. Strokes keep a similar visual width at any size.
	 * Paths are normalised to length 1 so they can draw on with stroke-dashoffset.
	 */
	const createSvg = (document, parts, sizePx) => {
		const svg = document.createElementNS(SVG_NS, "svg");
		svg.setAttribute("viewBox", "0 0 100 100");
		svg.setAttribute("aria-hidden", "true");
		svg.setAttribute("focusable", "false");
		const strokeWidth = Math.max(3.2, 260 / Math.max(40, sizePx));
		const paths = parts.map((part) => {
			const path = document.createElementNS(SVG_NS, "path");
			path.setAttribute("d", part.d);
			if (part.mode === "fill") {
				path.setAttribute("fill", "currentColor");
			} else {
				path.setAttribute("fill", "none");
				path.setAttribute("stroke", "currentColor");
				path.setAttribute("stroke-width", strokeWidth.toFixed(2));
				path.setAttribute("stroke-linecap", "round");
				path.setAttribute("stroke-linejoin", "round");
				if (part.mode === "dashed") {
					path.setAttribute("stroke-dasharray", "0.5 7");
				} else {
					path.setAttribute("pathLength", "1");
					path.setAttribute("stroke-dasharray", "1 1");
				}
			}
			svg.appendChild(path);
			return { el: path, mode: part.mode };
		});
		return { svg, paths };
	};

	root.ivLyricsMotionShapes = Object.freeze({
		initialized: true,
		NAMES,
		MOTIFS,
		sanitizePath,
		sanitizeShapes,
		motifOf,
		createSvg,
	});
})(typeof window !== "undefined" ? window : globalThis);

