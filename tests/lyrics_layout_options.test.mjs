import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

// Layout options from the feature-request forum. Each one is opt-in: the
// default settings must produce exactly the variables (and classes) the
// lyrics page used before the option existed.
const pages = readFileSync(new URL("../Pages.js", import.meta.url), "utf8");
const extract = (source, startMarker, endMarker) => {
	const start = source.indexOf(startMarker);
	const end = source.indexOf(endMarker, start);
	assert.ok(start >= 0 && end > start, `missing section: ${startMarker}`);
	return source.slice(start, end);
};
const context = vm.createContext({ CONFIG: { visual: {} }, window: {} });
vm.runInContext(`${extract(pages, "const getFiniteLyricsStyleNumber =", "const getCurrentTrackDurationMs =")}
${extract(pages, "const getLyricsAnchorRatio =", "const getElementOffsetTopWithin =")}
globalThis.api = { typography: getLyricsTypographyStyleVariables, anchorRatio: getLyricsAnchorRatio };`, context);
const { typography, anchorRatio } = context.api;
const ratioFor = (variables) => {
	context.window.getComputedStyle = () => ({
		getPropertyValue: (name) => String(variables[name] ?? ""),
	});
	return anchorRatio({});
};

test("the current-line position defaults to the centred anchor", () => {
	for (const visual of [{}, { "lyrics-anchor-position": "50" }, { "lyrics-anchor-position": "" }, { "lyrics-anchor-position": null }]) {
		const variables = typography(visual);
		assert.equal("--ivfs-lyrics-anchor-ratio" in variables, false);
		assert.equal(ratioFor(variables), 0.5);
	}
});

test("the current-line position moves the anchor used by both synced layouts", () => {
	assert.equal(typography({ "lyrics-anchor-position": "35" })["--ivfs-lyrics-anchor-ratio"], 0.35);
	assert.equal(ratioFor(typography({ "lyrics-anchor-position": 65 })), 0.65);
	assert.equal(typography({ "lyrics-anchor-position": "5" })["--ivfs-lyrics-anchor-ratio"], 0.2);
	assert.equal(typography({ "lyrics-anchor-position": "95" })["--ivfs-lyrics-anchor-ratio"], 0.8);
	assert.equal("--ivfs-lyrics-anchor-ratio" in typography({ "lyrics-anchor-position": "abc" }), false);
});

test("album covers up to 500px keep their size; larger covers fit the window", () => {
	const overlay = readFileSync(new URL("../FullscreenOverlay.js", import.meta.url), "utf8");
	const sandbox = vm.createContext({});
	vm.runInContext(`${extract(overlay, "    const FULLSCREEN_ALBUM_FIXED_MAX =", "    // Format time helper")}
globalThis.fit = fitFullscreenAlbumSize;`, sandbox);
	const fit = sandbox.fit;
	assert.equal(fit(400, 800, 600), 400, "existing sizes never change, even in small windows");
	assert.equal(fit(500, 800, 600), 500);
	assert.equal(fit(800, 2560, 1440), 800);
	assert.equal(fit(800, 1920, 1080), 800);
	assert.equal(fit(760, 1600, 900), 620, "height leaves room for the title and controls");
	assert.equal(fit(760, 1200, 1400), 500, "a narrow two-column window keeps the old maximum");
	assert.equal(fit(760, 1200, 1400, false), 760, "single column can use the full width");
	assert.equal(fit(700, NaN, NaN), 700);
});

test("the side margin is opt-in and limited to 30% of the lyric column", () => {
	assert.equal("--lyrics-side-margin" in typography({}), false);
	assert.equal("--lyrics-side-margin" in typography({ "lyrics-side-margin": "0" }), false);
	assert.equal(typography({ "lyrics-side-margin": "18" })["--lyrics-side-margin"], "18%");
	assert.equal(typography({ "lyrics-side-margin": 90 })["--lyrics-side-margin"], "30%");
	const styles = readFileSync(new URL("../style.css", import.meta.url), "utf8");
	assert.match(styles, /\.lyrics-side-margin-enabled\s+:is\(\.lyrics-lyricsContainer-SyncedLyrics, \.lyrics-lyricsContainer-UnsyncedLyricsPage\)\s+> \.lyrics-lyricsContainer-LyricsLine \{\s+padding-inline: var\(--lyrics-side-margin, 0px\);/);
	const index = readFileSync(new URL("../index.js", import.meta.url), "utf8");
	assert.match(index, /Number\(CONFIG\.visual\["lyrics-side-margin"\]\) > 0 \? " lyrics-side-margin-enabled" : ""/);
});

test("blur behind lyrics is off by default and follows the lyric alignment", () => {
	const off = typography({});
	assert.equal("--lyrics-backdrop-blur" in off, false);
	assert.equal("--lyrics-backdrop-mask" in off, false);
	const right = typography({ "lyrics-backdrop-blur": "16", alignment: "right" });
	assert.equal(right["--lyrics-backdrop-blur"], "16px");
	assert.match(right["--lyrics-backdrop-mask"], /^linear-gradient\(to right, transparent 10%, #000 45%, #000 100%, transparent 100%\)/);
	const left = typography({ "lyrics-backdrop-blur": 60, alignment: "left", "lyrics-side-margin": 20 });
	assert.equal(left["--lyrics-backdrop-blur"], "40px");
	assert.match(left["--lyrics-backdrop-mask"], /^linear-gradient\(to right, transparent 14%, #000 20%, #000 53%, transparent 74%\)/);
	const center = typography({ "lyrics-backdrop-blur": 8 });
	assert.match(center["--lyrics-backdrop-mask"], /^linear-gradient\(to right, transparent 0%, #000 20%, #000 80%, transparent 100%\)/);
	assert.match(center["--lyrics-backdrop-mask"], /linear-gradient\(to bottom, transparent 0%, #000 12%, #000 88%, transparent 100%\)$/);
});

test("every lyrics page mounts one hidden backdrop layer that only the enabled class draws", () => {
	assert.equal(pages.match(/react\.createElement\(LyricsBackdropLayer, null\)/g)?.length, 3);
	const styles = readFileSync(new URL("../style.css", import.meta.url), "utf8");
	assert.match(styles, /\.lyrics-lyricsContainer-LyricsBackdrop \{\s+display: none;\s+\}/);
	assert.match(styles, /\.lyrics-backdrop-blur-enabled \.lyrics-lyricsContainer-LyricsBackdrop \{[^}]*backdrop-filter: blur\(var\(--lyrics-backdrop-blur, 0px\)\);/);
	const index = readFileSync(new URL("../index.js", import.meta.url), "utf8");
	assert.match(index, /Number\(CONFIG\.visual\["lyrics-backdrop-blur"\]\) > 0 \? " lyrics-backdrop-blur-enabled" : ""/);
});

test("the backdrop layer follows manual scrolling so it stays behind the visible rows", () => {
	const layerSource = extract(pages, "const LyricsBackdropLayer =", "// Global SearchBar manager");
	const effects = [];
	const listeners = new Map();
	const page = { scrollTop: 0, addEventListener: (name, handler) => listeners.set(name, handler), removeEventListener: (name) => listeners.delete(name) };
	const layer = { parentElement: page, style: { translate: "" } };
	const sandbox = vm.createContext({
		react: { memo: (component) => component, createElement: (type, props) => ({ type, props }) },
		useRef: () => ({ current: layer }),
		useEffect: (effect) => effects.push(effect),
	});
	vm.runInContext(`${layerSource}\nglobalThis.Layer = LyricsBackdropLayer;`, sandbox);
	const element = sandbox.Layer();
	assert.equal(element.props.className, "lyrics-lyricsContainer-LyricsBackdrop");
	const cleanup = effects[0]();
	page.scrollTop = 240;
	listeners.get("scroll")();
	assert.equal(layer.style.translate, "0 240px");
	page.scrollTop = 0;
	listeners.get("scroll")();
	assert.equal(layer.style.translate, "");
	cleanup();
	assert.equal(listeners.has("scroll"), false);
});
