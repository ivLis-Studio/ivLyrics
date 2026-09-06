import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../Pages.js", import.meta.url), "utf8");
const styles = readFileSync(new URL("../style.css", import.meta.url), "utf8");
const start = source.indexOf("const getFiniteLyricsStyleNumber =");
const end = source.indexOf("const getCurrentTrackDurationMs =", start);
assert.ok(start >= 0 && end > start, "shared typography helpers must remain extractable");
const context = vm.createContext({ CONFIG: { visual: {} } });
vm.runInContext(
	`${source.slice(start, end)}\nglobalThis.typography = getLyricsTypographyStyleVariables;`,
	context
);
const typography = context.typography;

test("turning shadow off removes both text and karaoke filter shadows", () => {
	for (const visual of [{}, {
		"text-shadow-enabled": false,
		"text-shadow-color": "#FF8040",
		"text-shadow-opacity": 100,
		"text-shadow-blur": 12,
	}]) {
		const variables = typography(visual);
		assert.equal(variables["--lyrics-text-shadow"], "0 0 0 transparent");
		assert.equal(variables["--lyrics-text-drop-shadow"], "none");
		assert.equal(variables["--lyrics-shadow-enabled"], 0);
	}
});

test("enabled shadow uses the user's color, opacity and blur for text and karaoke", () => {
	const variables = typography({
		"text-shadow-enabled": true,
		"text-shadow-color": "#4080Ff",
		"text-shadow-opacity": "37",
		"text-shadow-blur": "7.5",
	});
	assert.equal(variables["--lyrics-text-shadow"], "0 0 7.5px rgba(64, 128, 255, 0.37)");
	assert.equal(variables["--lyrics-text-drop-shadow"], "drop-shadow(0 0 7.5px rgba(64, 128, 255, 0.37))");
	assert.equal(variables["--lyrics-shadow-enabled"], 1);
});

test("zero opacity and zero blur remain valid shadow settings", () => {
	const variables = typography({
		"text-shadow-enabled": true,
		"text-shadow-color": "#FF8040",
		"text-shadow-opacity": 0,
		"text-shadow-blur": 0,
	});
	assert.equal(variables["--lyrics-text-shadow"], "0 0 0px rgba(255, 128, 64, 0)");
	assert.equal(variables["--lyrics-text-drop-shadow"], "drop-shadow(0 0 0px rgba(255, 128, 64, 0))");
});

test("disabling decorative shadows preserves the separately configured lyric outlines", () => {
	const visual = {
		"original-outline-width": 2,
		"original-outline-color": "#123456",
		"phonetic-outline-width": 1,
		"phonetic-outline-color": "#345678",
		"translation-outline-width": 0.5,
		"translation-outline-color": "#56789A",
		"cultural-annotations-outline-width": 1.5,
		"cultural-annotations-outline-color": "#789ABC",
		"furigana-outline-width": 0.5,
		"furigana-outline-color": "#9ABCDE",
	};
	const enabled = typography({ ...visual, "text-shadow-enabled": true });
	const disabled = typography({ ...visual, "text-shadow-enabled": false });
	for (const [name, setting] of [
		["original", "original"],
		["phonetic", "phonetic"],
		["translation", "translation"],
		["cultural-note", "cultural-annotations"],
		["furigana", "furigana"],
	]) {
		const outline = disabled[`--lyrics-${name}-outline-shadow`];
		assert.ok(outline.includes(visual[`${setting}-outline-color`]), `${name} keeps its outline color`);
		assert.notEqual(outline, "0 0 0 transparent", `${name} keeps its configured outline`);
	}
	for (const key of Object.keys(enabled).filter(key => key.includes("outline"))) {
		assert.equal(disabled[key], enabled[key], `${key} is independent of Shadow Effect`);
	}
});

// These selectors previously overrode a correctly disabled shared variable.
// Inspect every matching declaration, including duplicate rules later in the
// stylesheet, so a second hard-coded readability shadow cannot silently win.
const normalizeSelector = selector => selector.trim().replace(/\s+/g, " ");
const rules = [...styles.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)]
	.map(([, selectors, body]) => ({
		selectors: selectors.split(",").map(normalizeSelector),
		body,
	}));
const declarationsFor = (selector, property) => rules
	.filter(rule => rule.selectors.includes(normalizeSelector(selector)))
	.flatMap(rule => [...rule.body.matchAll(new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, "g"))]
		.map(match => match[1].trim()));

test("active, highlighted, furigana and Vinyl lyrics do not bypass the configured text shadow", () => {
	const active = ".lyrics-lyricsContainer-LyricsLine-active";
	const vinyl = ".fullscreen-vinyl-active-lyric";
	const video = ".fullscreen-vinyl-overlay.is-presentation-video";
	const selectors = [
		active,
		`${active} > p:first-child`,
		`${active} ruby rt`,
		...["SyncedLyrics", "SyncedScrollView", "UnsyncedLyricsPage"].map(mode =>
			`.lyrics-lyricsContainer-LyricsContainer.highlight-mode-enabled .lyrics-lyricsContainer-${mode} .lyrics-lyricsContainer-LyricsLine${active}`),
		`${vinyl} .lyrics-lyricsContainer-LyricsLine`,
		`${vinyl} .lyrics-lyricsContainer-LyricsLine > p:first-child`,
		`${video} ${vinyl} .lyrics-lyricsContainer-LyricsLine > p`,
		...["phonetic", "translation", "culturalNote"].flatMap(kind => [
			`${vinyl} .lyrics-lyricsContainer-LyricsLine-${kind}`,
			`${video} ${vinyl} .lyrics-lyricsContainer-LyricsLine-${kind}`,
		]),
	];
	for (const selector of selectors) {
		const declarations = declarationsFor(selector, "text-shadow");
		assert.ok(declarations.length, `${selector} has a text-shadow declaration`);
		for (const value of declarations) {
			assert.ok(value.includes("var(--lyrics-text-shadow"), `${selector} must use the configured shadow: ${value}`);
			assert.doesNotMatch(value, /rgba?\(/, `${selector} must not append a hard-coded shadow`);
		}
	}
});

test("video karaoke uses the configured filter shadow", () => {
	const selector = ".fullscreen-vinyl-overlay.is-presentation-video .fullscreen-vinyl-active-lyric .lyrics-karaoke-line";
	const declarations = declarationsFor(selector, "filter");
	assert.ok(declarations.length, "video karaoke has a filter declaration");
	for (const value of declarations) {
		assert.ok(value.includes("var(--lyrics-text-drop-shadow"), `video karaoke must use the configured filter: ${value}`);
		assert.doesNotMatch(value, /drop-shadow\(/, "video karaoke must not append a hard-coded filter shadow");
	}
});
