import { createOutsideTextOutlineShadow, createBlurredLineOutlineShadow, getBlurredLineOutlineWidth } from "./lyricsTextOutline.mjs";

const getFiniteLyricsStyleNumber = (value, fallback) => {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
};

// Keep the settings preview and the playback renderer on one typography contract.
// Container geometry and playback transforms stay local to each surface, but every
// glyph, ruby and auxiliary-line metric comes from this shared variable set.
const getLyricsBackdropMask = (alignment, sideMargin = 0) => {
	const lo = sideMargin;
	const hi = 100 - sideMargin;
	const width = hi - lo;
	const percent = (value) => `${Math.round(Math.min(100, Math.max(0, value)) * 10) / 10}%`;
	const stops = alignment === "left"
		? [["transparent", lo - 6], ["#000", lo], ["#000", lo + width * 0.55], ["transparent", lo + width * 0.9]]
		: alignment === "right"
			? [["transparent", hi - width * 0.9], ["#000", hi - width * 0.55], ["#000", hi], ["transparent", hi + 6]]
			: [["transparent", lo], ["#000", lo + width * 0.2], ["#000", hi - width * 0.2], ["transparent", hi]];
	return `linear-gradient(to right, ${stops.map(([color, stop]) => `${color} ${percent(stop)}`).join(", ")}), `
		+ "linear-gradient(to bottom, transparent 0%, #000 12%, #000 88%, transparent 100%)";
};

export const getLyricsTypographyStyleVariables = (visual = {}) => {
	const alignment = ["left", "center", "right"].includes(visual.alignment)
		? visual.alignment
		: "center";
	const culturalNoteMargins = alignment === "left"
		? { left: "0", right: "auto" }
		: alignment === "right"
			? { left: "auto", right: "0" }
			: { left: "auto", right: "auto" };
	const baseFontFamily = visual["font-family"] || "var(--font-family)";
	const shadowColor = visual["text-shadow-color"] || "#000000";
	const shadowOpacity = getFiniteLyricsStyleNumber(visual["text-shadow-opacity"], 50);
	const shadowBlur = getFiniteLyricsStyleNumber(visual["text-shadow-blur"], 2);
	const colorMatch = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(shadowColor);
	const resolvedShadowColor = colorMatch
		? `rgba(${parseInt(colorMatch[1], 16)}, ${parseInt(colorMatch[2], 16)}, ${parseInt(colorMatch[3], 16)}, ${shadowOpacity / 100})`
		: shadowColor;
	const textShadow = visual["text-shadow-enabled"]
		? `0 0 ${shadowBlur}px ${resolvedShadowColor}`
		: "0 0 0 transparent";
	// Where the current line rests, as a percentage of the lyrics height. The
	// default (50) leaves the stylesheet's centred anchor untouched.
	const rawAnchorPosition = visual["lyrics-anchor-position"];
	const anchorPosition = rawAnchorPosition === undefined || rawAnchorPosition === null || rawAnchorPosition === ""
		? 50
		: Math.min(80, Math.max(20, getFiniteLyricsStyleNumber(rawAnchorPosition, 50)));
	// Symmetric side margin as a percentage of the lyric column (0 = off). The
	// container only applies it with the lyrics-side-margin-enabled class.
	const sideMargin = Math.min(30, Math.max(0, getFiniteLyricsStyleNumber(visual["lyrics-side-margin"], 0)));
	// Blur behind the lyric column (0 = off). The mask keeps the blur around the
	// lyrics: it follows the alignment inside the column left by the side margin.
	const backdropBlur = Math.min(40, Math.max(0, getFiniteLyricsStyleNumber(visual["lyrics-backdrop-blur"], 0)));

	return {
		...(anchorPosition !== 50 ? { "--ivfs-lyrics-anchor-ratio": anchorPosition / 100 } : {}),
		...(sideMargin > 0 ? { "--lyrics-side-margin": `${sideMargin}%` } : {}),
		...(backdropBlur > 0 ? {
			"--lyrics-backdrop-blur": `${backdropBlur}px`,
			"--lyrics-backdrop-mask": getLyricsBackdropMask(alignment, sideMargin),
		} : {}),
		"--lyrics-align-text": alignment,
		"--lyrics-font-size": `${getFiniteLyricsStyleNumber(visual["font-size"], 32)}px`,
		"--lyrics-font-family": baseFontFamily,
		"--lyrics-original-font-family": visual["original-font-family"] || baseFontFamily,
		"--lyrics-original-font-size": `${getFiniteLyricsStyleNumber(visual["original-font-size"], 44)}px`,
		"--lyrics-original-font-weight": getFiniteLyricsStyleNumber(visual["original-font-weight"], 600),
		"--lyrics-original-opacity": getFiniteLyricsStyleNumber(visual["original-opacity"], 95) / 100,
		"--lyrics-original-letter-spacing": `${getFiniteLyricsStyleNumber(visual["original-letter-spacing"], 0)}px`,
		"--lyrics-original-outline-shadow": createOutsideTextOutlineShadow(
			visual["original-outline-width"],
			visual["original-outline-color"]
		),
		"--lyrics-original-outline-blurred-shadow": createBlurredLineOutlineShadow(
			visual["original-outline-width"],
			visual["original-outline-color"]
		),
		"--lyrics-original-outline-stroke-width": `${getFiniteLyricsStyleNumber(visual["original-outline-width"], 0) * 2}px`,
		"--lyrics-original-outline-blurred-stroke-width": `${getBlurredLineOutlineWidth(visual["original-outline-width"]) * 2}px`,
		"--lyrics-original-outline-blurred-stroke-color": `color-mix(in srgb, ${visual["original-outline-color"] || "#000000"} 8%, transparent)`,
		"--lyrics-original-outline-stroke-color": visual["original-outline-color"] || "#000000",
		"--lyrics-phonetic-font-family": visual["phonetic-font-family"] || baseFontFamily,
		"--lyrics-phonetic-font-size": `${getFiniteLyricsStyleNumber(visual["phonetic-font-size"], 16)}px`,
		"--lyrics-phonetic-font-weight": getFiniteLyricsStyleNumber(visual["phonetic-font-weight"], 100),
		"--lyrics-phonetic-opacity": getFiniteLyricsStyleNumber(visual["phonetic-opacity"], 70) / 100,
		"--lyrics-phonetic-spacing": `${getFiniteLyricsStyleNumber(visual["phonetic-spacing"], -1)}px`,
		"--lyrics-phonetic-letter-spacing": `${getFiniteLyricsStyleNumber(visual["phonetic-letter-spacing"], 0)}px`,
		"--lyrics-phonetic-outline-shadow": createOutsideTextOutlineShadow(
			visual["phonetic-outline-width"],
			visual["phonetic-outline-color"]
		),
		"--lyrics-phonetic-outline-blurred-shadow": createBlurredLineOutlineShadow(
			visual["phonetic-outline-width"],
			visual["phonetic-outline-color"]
		),
		"--lyrics-translation-font-family": visual["translation-font-family"] || baseFontFamily,
		"--lyrics-translation-font-size": `${getFiniteLyricsStyleNumber(visual["translation-font-size"], 22)}px`,
		"--lyrics-translation-font-weight": getFiniteLyricsStyleNumber(visual["translation-font-weight"], 300),
		"--lyrics-translation-opacity": getFiniteLyricsStyleNumber(visual["translation-opacity"], 85) / 100,
		"--lyrics-translation-spacing": `${getFiniteLyricsStyleNumber(visual["translation-spacing"], 0)}px`,
		"--lyrics-translation-letter-spacing": `${getFiniteLyricsStyleNumber(visual["translation-letter-spacing"], 0)}px`,
		"--lyrics-translation-outline-shadow": createOutsideTextOutlineShadow(
			visual["translation-outline-width"],
			visual["translation-outline-color"]
		),
		"--lyrics-translation-outline-blurred-shadow": createBlurredLineOutlineShadow(
			visual["translation-outline-width"],
			visual["translation-outline-color"]
		),
		"--lyrics-cultural-note-font-family": visual["cultural-annotations-font-family"] || visual["translation-font-family"] || baseFontFamily,
		"--lyrics-cultural-note-font-size": `${getFiniteLyricsStyleNumber(visual["cultural-annotations-font-size"], 14)}px`,
		"--lyrics-cultural-note-font-weight": getFiniteLyricsStyleNumber(visual["cultural-annotations-font-weight"], 300),
		"--lyrics-cultural-note-opacity": getFiniteLyricsStyleNumber(visual["cultural-annotations-opacity"], 60) / 100,
		"--lyrics-cultural-note-outline-shadow": createOutsideTextOutlineShadow(
			visual["cultural-annotations-outline-width"],
			visual["cultural-annotations-outline-color"]
		),
		"--lyrics-cultural-note-outline-blurred-shadow": createBlurredLineOutlineShadow(
			visual["cultural-annotations-outline-width"],
			visual["cultural-annotations-outline-color"]
		),
		"--lyrics-cultural-note-margin-left": culturalNoteMargins.left,
		"--lyrics-cultural-note-margin-right": culturalNoteMargins.right,
		"--lyrics-furigana-font-size": `${getFiniteLyricsStyleNumber(visual["furigana-font-size"], 14)}px`,
		"--lyrics-furigana-font-weight": getFiniteLyricsStyleNumber(visual["furigana-font-weight"], 300),
		"--lyrics-furigana-opacity": getFiniteLyricsStyleNumber(visual["furigana-opacity"], 80) / 100,
		"--lyrics-furigana-spacing": `${getFiniteLyricsStyleNumber(visual["furigana-spacing"], 2)}px`,
		"--lyrics-furigana-outline-shadow": createOutsideTextOutlineShadow(
			visual["furigana-outline-width"],
			visual["furigana-outline-color"]
		),
		"--lyrics-furigana-outline-blurred-shadow": createBlurredLineOutlineShadow(
			visual["furigana-outline-width"],
			visual["furigana-outline-color"]
		),
		"--lyrics-line-spacing": `${getFiniteLyricsStyleNumber(visual["line-spacing"], 8)}px`,
		"--fullscreen-title-outline-shadow": createOutsideTextOutlineShadow(
			visual["fullscreen-title-outline-width"],
			visual["fullscreen-title-outline-color"]
		),
		"--fullscreen-artist-outline-shadow": createOutsideTextOutlineShadow(
			visual["fullscreen-artist-outline-width"],
			visual["fullscreen-artist-outline-color"]
		),
		"--fullscreen-clock-outline-shadow": createOutsideTextOutlineShadow(
			visual["fullscreen-clock-outline-width"],
			visual["fullscreen-clock-outline-color"]
		),
		"--fullscreen-tmi-outline-shadow": createOutsideTextOutlineShadow(
			visual["fullscreen-tmi-outline-width"],
			visual["fullscreen-tmi-outline-color"]
		),
		"--lyrics-text-shadow": textShadow,
		// Decorative karaoke glows share the shadow switch; text outlines remain independent.
		"--lyrics-shadow-enabled": visual["text-shadow-enabled"] ? 1 : 0,
		"--lyrics-text-drop-shadow": visual["text-shadow-enabled"]
			? `drop-shadow(0 0 ${shadowBlur}px ${resolvedShadowColor})`
			: "none",
	};
};
