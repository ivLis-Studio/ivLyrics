const CANONICAL_MARKER = "♪";
const NOTE_CHARACTER_PATTERN = /[\u2669-\u266F\u{1D100}-\u{1D1FF}\u{1F3B5}-\u{1F3BC}]/u;
const NOTE_ONLY_PATTERN = /^[\s\u00A0\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFE0E\uFE0F\uFEFF\u2669-\u266F\u{1D100}-\u{1D1FF}\u{1F3B5}-\u{1F3BC}·•・。.、,，…⋯~〜～\-–—_|/\\:：]+$/u;
const WRAPPER_PAIRS = new Map([
	["<", ">"],
	["＜", "＞"],
	["〈", "〉"],
	["《", "》"],
	["[", "]"],
	["［", "］"],
	["【", "】"],
	["(", ")"],
	["（", "）"],
	["{", "}"],
	["｛", "｝"]
]);

const decodeEntities = (value) => {
	let decoded = String(value ?? "")
		.replace(/&amp;/giu, "&")
		.replace(/&lt;/giu, "<")
		.replace(/&gt;/giu, ">")
		.replace(/&nbsp;/giu, " ")
		.replace(/&sung;/giu, CANONICAL_MARKER)
		.replace(/&flat;/giu, "♭")
		.replace(/&natur;/giu, "♮")
		.replace(/&sharp;/giu, "♯");

	decoded = decoded.replace(/&#(?:x([0-9a-f]+)|([0-9]+));?/giu, (match, hexadecimal, decimal) => {
		const codePoint = Number.parseInt(hexadecimal || decimal, hexadecimal ? 16 : 10);
		if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10FFFF) {
			return match;
		}
		try {
			return String.fromCodePoint(codePoint);
		} catch {
			return match;
		}
	});

	// Remove real formatting tags without treating a marker such as <♪> as HTML.
	return decoded.replace(/<\/?[a-z][^>]*>/giu, "");
};

const unwrapMarker = (value) => {
	let unwrapped = value.trim();
	for (let depth = 0; depth < 3 && unwrapped.length >= 2; depth += 1) {
		const expectedClosing = WRAPPER_PAIRS.get(unwrapped[0]);
		if (!expectedClosing || unwrapped.at(-1) !== expectedClosing) break;
		unwrapped = unwrapped.slice(1, -1).trim();
	}
	return unwrapped;
};

const getMarker = (value) => {
	const decoded = decodeEntities(value).trim();
	if (!decoded) return null;

	const normalized = unwrapMarker(decoded).normalize("NFKC").trim();
	return normalized && NOTE_CHARACTER_PATTERN.test(normalized) && NOTE_ONLY_PATTERN.test(normalized)
		? CANONICAL_MARKER
		: null;
};

export const instrumentalMarkers = Object.freeze({
	marker: CANONICAL_MARKER,
	decodeEntities,
	getMarker,
	isMarkerText: (value) => getMarker(value) !== null
});

export default function installInstrumentalBreaks() {
	window.ivLyricsInstrumentalBreaks = instrumentalMarkers;
}
