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
