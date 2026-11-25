import { readPcStylesheet } from "../.github/scripts/pc_stylesheet.mjs";
import { getLyricsTypographyStyleVariables as typography } from "#ivlyrics/lyrics/lyricsTypography.mjs";
import { createInterludeIndicator, getInstrumentalBreakPresentation } from "#ivlyrics/lyrics/lyricInterludePresentation.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { fitFullscreenAlbumSize as fit } from "../src/features/fullscreen/fullscreenLayout.mjs";
import { createLyricsScrollGeometry } from "../src/lyrics/lyricsScrollGeometry.mjs";
import { resolveLyricsFullscreenLayout } from "../src/features/fullscreen/lyricsFullscreenController.mjs";

// Layout options from the feature-request forum. Each one is opt-in: the
// default settings must produce exactly the variables (and classes) the
// lyrics page used before the option existed.
const pages = readFileSync(new URL("../src/lyrics/Pages.js", import.meta.url), "utf8");
const extract = (source, startMarker, endMarker) => {
	const start = source.indexOf(startMarker);
	const end = source.indexOf(endMarker, start);
	assert.ok(start >= 0 && end > start, `missing section: ${startMarker}`);
	return source.slice(start, end);
};
const ratioFor = (variables) => {
	const geometry = createLyricsScrollGeometry(() => ({
		getPropertyValue: (name) => String(variables[name] ?? ""),
	}));
	return geometry.getLyricsAnchorRatio({});
};

test("the current-line position defaults to the centred anchor", () => {
	for (const visual of [{}, { "lyrics-anchor-position": "50" }, { "lyrics-anchor-position": "" }, { "lyrics-anchor-position": null }]) {
		const variables = typography(visual);
		assert.equal("--ivfs-lyrics-anchor-ratio" in variables, false);
		assert.equal(ratioFor(variables), 0.5);
	}
});

test("interlude typography keeps each surface's fallback and shares configured styles", () => {
	const react = { memo: component => component, createElement: (_type, props) => props };
	let visual = {};
	const PageIndicator = createInterludeIndicator({ react, getVisualSettings: () => visual, translate: () => "" });
	const pageStyle = () => PageIndicator({}).style;
	const panelStyle = () => getInstrumentalBreakPresentation({
		readSetting: (key, fallback) => visual[key] ?? fallback,
		defaultSize: 12,
		fallbackFont: () => "Panel Font",
	}).style;
	assert.equal(pageStyle()["--break-label-font-size"], "20px");
	assert.equal(panelStyle()["--break-label-font-size"], "12px");
	assert.equal(panelStyle()["--break-label-font-family"], "Panel Font");
	visual = {
		"instrumental-break-label-font-family": "Configured Font",
		"instrumental-break-label-font-size": "24",
		"instrumental-break-label-outline-width": 0.5,
		"instrumental-break-animation-speed": 200,
	};
	assert.deepEqual(panelStyle(), pageStyle());
	assert.equal(pageStyle()["--break-duration"], "550ms");
});

test("the current-line position moves the anchor used by both synced layouts", () => {
	assert.equal(typography({ "lyrics-anchor-position": "35" })["--ivfs-lyrics-anchor-ratio"], 0.35);
	assert.equal(ratioFor(typography({ "lyrics-anchor-position": 65 })), 0.65);
	assert.equal(typography({ "lyrics-anchor-position": "5" })["--ivfs-lyrics-anchor-ratio"], 0.2);
	assert.equal(typography({ "lyrics-anchor-position": "95" })["--ivfs-lyrics-anchor-ratio"], 0.8);
	assert.equal("--ivfs-lyrics-anchor-ratio" in typography({ "lyrics-anchor-position": "abc" }), false);
});

test("album covers up to 500px keep their size; larger covers fit the window", () => {
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
	const styles = readPcStylesheet();
	assert.match(styles, /\.lyrics-side-margin-enabled\s+:is\(\.lyrics-lyricsContainer-SyncedLyrics, \.lyrics-lyricsContainer-UnsyncedLyricsPage\)\s+> \.lyrics-lyricsContainer-LyricsLine \{\s+padding-inline: var\(--lyrics-side-margin, 0px\);/);
	const view = readFileSync(new URL("../src/lyrics/lyricsPageView.mjs", import.meta.url), "utf8");
	assert.match(view, /Number\(visual\["lyrics-side-margin"\]\) > 0 \? " lyrics-side-margin-enabled" : ""/);
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
	const syncedPages = readFileSync(new URL("../src/lyrics/createSyncedLyricsPages.mjs", import.meta.url), "utf8");
	assert.equal(pages.match(/react\.createElement\(LyricsBackdropLayer, null\)/g)?.length, 1);
	assert.equal(syncedPages.match(/react\.createElement\(LyricsBackdropLayer, null\)/g)?.length, 2);
	const styles = readPcStylesheet();
	assert.match(styles, /\.lyrics-lyricsContainer-LyricsBackdrop \{\s+display: none;\s+\}/);
	assert.match(styles, /\.lyrics-backdrop-blur-enabled \.lyrics-lyricsContainer-LyricsBackdrop \{[^}]*backdrop-filter: blur\(var\(--lyrics-backdrop-blur, 0px\)\);/);
	const view = readFileSync(new URL("../src/lyrics/lyricsPageView.mjs", import.meta.url), "utf8");
	assert.match(view, /Number\(visual\["lyrics-backdrop-blur"\]\) > 0 \? " lyrics-backdrop-blur-enabled" : ""/);
});

test("the backdrop layer follows manual scrolling so it stays behind the visible rows", () => {
	const layerSource = extract(pages, "const LyricsBackdropLayer =", "const SearchBar =");
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

test("a requested fullscreen presentation overrides the page and monitor settings only for that entry", () => {
	const decide = (visual, options, state = { isFullscreen: false }) => resolveLyricsFullscreenLayout({
		isEnabled: !state.isFullscreen, options, visual, currentPageLayout: false,
	});
	assert.deepEqual(decide({}, undefined), { requestedPresentation: null, usePageFullscreenUi: false, useBrowserFullscreen: false });
	assert.deepEqual(decide({ "fullscreen-browser-fullscreen": true }, { type: "click" }), { requestedPresentation: null, usePageFullscreenUi: false, useBrowserFullscreen: true });
	assert.deepEqual(decide({ "fullscreen-page-ui-only": true, "fullscreen-browser-fullscreen": true }, undefined), { requestedPresentation: null, usePageFullscreenUi: true, useBrowserFullscreen: false });
	assert.deepEqual(decide({ "fullscreen-page-ui-only": true }, { presentation: "screen" }), { requestedPresentation: "screen", usePageFullscreenUi: false, useBrowserFullscreen: true });
	assert.deepEqual(decide({ "fullscreen-browser-fullscreen": true }, { presentation: "page" }), { requestedPresentation: "page", usePageFullscreenUi: true, useBrowserFullscreen: false });
	assert.equal(decide({}, { presentation: "screen" }, { isFullscreen: true }).requestedPresentation, null, "leaving fullscreen ignores the request");
});
