import { round } from "./motionMath.mjs";

export const applyFont = (element, spec) => {
	element.style.fontFamily = spec.family;
	element.style.fontWeight = String(spec.weight);
	element.style.fontStyle = spec.style;
	if (spec.spacing) element.style.letterSpacing = spec.spacing + "em";
};
// Accents drawn with an extra element behind or around the emphasised word.
export const BOX_ACCENTS = new Set(["underline", "mark", "stamp", "bracket"]);
export const SVG_NS = "http://www.w3.org/2000/svg";
// A hand-drawn loop around a word, in a unit box: it overshoots its start like a pen stroke.
const LOOP_PATH = [
	["M", 0.05, 0.6], ["C", 0.0, 0.24, 0.32, 0.03, 0.58, 0.04], ["C", 0.88, 0.05, 1.03, 0.3, 0.97, 0.6],
	["C", 0.92, 0.9, 0.5, 1.02, 0.24, 0.94], ["C", 0.0, 0.86, -0.03, 0.48, 0.16, 0.26],
];

/** The loop of the "circle" accent, sized to a word. */
export const createLoop = (document, width, height, stroke) => {
	const svg = document.createElementNS(SVG_NS, "svg");
	svg.setAttribute("class", "ivlyrics-motion-loop");
	svg.setAttribute("viewBox", "0 0 " + round(width) + " " + round(height));
	svg.setAttribute("aria-hidden", "true");
	svg.setAttribute("focusable", "false");
	svg.style.width = round(width) + "px";
	svg.style.height = round(height) + "px";
	const path = document.createElementNS(SVG_NS, "path");
	path.setAttribute("d", LOOP_PATH.map(([command, ...points]) => command + points.map((value, index) => round(value * (index % 2 ? height : width))).join(" ")).join(" "));
	path.setAttribute("pathLength", "1");
	path.setAttribute("stroke-width", String(round(stroke, 2)));
	svg.appendChild(path);
	return svg;
};

/** The squiggle of the "scribble" accent: a pen line wobbling under a word. */
export const createScribble = (document, width, height, stroke) => {
	const waves = Math.max(3, Math.round(width / (height * 1.5)));
	const step = width / waves;
	let d = "M0 " + round(height * 0.5);
	for (let index = 0; index < waves; index += 1) {
		d += " Q" + round(step * (index + 0.5)) + " " + round(index % 2 ? height * 1.05 : -height * 0.05) + " " + round(step * (index + 1)) + " " + round(height * 0.5);
	}
	const svg = document.createElementNS(SVG_NS, "svg");
	svg.setAttribute("class", "ivlyrics-motion-loop is-scribble");
	svg.setAttribute("viewBox", "0 0 " + round(width) + " " + round(height));
	svg.setAttribute("aria-hidden", "true");
	svg.setAttribute("focusable", "false");
	svg.style.width = round(width) + "px";
	svg.style.height = round(height) + "px";
	const path = document.createElementNS(SVG_NS, "path");
	path.setAttribute("d", d);
	path.setAttribute("pathLength", "1");
	path.setAttribute("stroke-width", String(round(stroke, 2)));
	svg.appendChild(path);
	return svg;
};

const SVG_FILTER_UNITS = Object.freeze({ x: "-0.1", y: "-0.3", width: "1.2", height: "1.6" });
let engineSerial = 0;

/**
 * Outlines drawn round each word's shape: the text filled, widened and
 * hollowed by an SVG filter (half the width outside the letters, half
 * inside, like the stroke it replaces). A text stroke also traces every
 * contour inside the letters where a variable face's parts overlap (Hangul
 * in Pretendard, Han in Noto Sans TC), which reads as a broken wireframe.
 * The desktop app only (ivLyricsMotionConfig.shapedOutlines): each outline
 * is drawn once into its own layer, which the phones' WebViews are spared.
 */
export const createOutlines = (document, defs, shapedOutlines) => {
	if (!defs || shapedOutlines === false || typeof document?.createElementNS !== "function") return () => "";
	engineSerial += 1;
	const prefix = "ivlyrics-motion-ring-" + engineSerial + "-";
	const filters = new Map();
	const node = (name, attributes) => {
		const element = document.createElementNS(SVG_NS, name);
		for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
		return element;
	};
	/** The filter for an outline half this wide (CSS px of the element) either side of the letters' edge. */
	return (half) => {
		const radius = Math.max(0.5, Math.round(half * 4) / 4);
		let id = filters.get(radius);
		if (!id) {
			id = prefix + filters.size;
			const filter = node("filter", { id, ...SVG_FILTER_UNITS, "color-interpolation-filters": "sRGB" });
			filter.appendChild(node("feMorphology", { in: "SourceGraphic", operator: "dilate", radius, result: "outer" }));
			filter.appendChild(node("feMorphology", { in: "SourceAlpha", operator: "erode", radius, result: "inner" }));
			filter.appendChild(node("feComposite", { in: "outer", in2: "inner", operator: "out" }));
			defs.appendChild(filter);
			filters.set(radius, id);
		}
		return "url(#" + id + ")";
	};
};

/** Sets an outline's text: shaped by the filter when there is one, else stroked (style.css). */
export const setOutlineText = (document, element, text, filter) => {
	if (!filter) {
		element.textContent = text;
		return;
	}
	element.classList.add("is-shaped");
	const shape = document.createElement("span");
	shape.className = "ivlyrics-motion-shape";
	shape.style.filter = filter;
	shape.textContent = text;
	element.appendChild(shape);
};
