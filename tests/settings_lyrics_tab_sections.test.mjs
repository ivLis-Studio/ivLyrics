import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const settingsSource = readFileSync(new URL("../src/features/settings/settingsPlaybackTabs.mjs", import.meta.url), "utf8");

// The behavior ("lyrics") tab is assembled from several section renderers.
// A merge once left two copies of the playback and Sync Creator renderers in
// place, so both sections were shown twice in that tab.
const lyricsTabSource = () => {
	const start = settingsSource.indexOf("const renderLyricsTab = () => {");
	assert.notEqual(start, -1, "renderLyricsTab not found");
	const end = settingsSource.indexOf("return { renderGeneralTab", start);
	assert.notEqual(end, -1, "playback tab exports not found");
	return settingsSource.slice(start, end);
};

test("behavior tab defines the playback and Sync Creator sections once", () => {
	const body = lyricsTabSource();
	for (const key of ["playback", "sync-creator-settings"]) {
		const count = body.split(`sectionKey: "${key}"`).length - 1;
		assert.equal(count, 1, `${key} section is defined ${count} times in the behavior tab`);
	}
});

test("behavior tab renders each section renderer once", () => {
	const body = lyricsTabSource();
	const tree = body.slice(body.lastIndexOf("return react.createElement("));
	const renderers = [...tree.matchAll(/\.\.\.(render\w+)\(\)/g)].map((match) => match[1]);
  assert.ok(renderers.length >= 5, "expected the behavior tab section renderers");
	assert.equal(new Set(renderers).size, renderers.length, `duplicate renderers: ${renderers.join(", ")}`);
	// Section order of the redesigned settings window (playback, karaoke mode,
  // Sync Creator, cache, helper). Prefetch is owned by Performance.
	assert.deepEqual(renderers, [
		"renderLyricsPlaybackSection",
		"renderLyricsLanguageSection",
		"renderLyricsSyncControlsSection",
		"renderLyricsCacheSection",
		"renderLyricsHelperSection",
	]);
});

test("behavior tab section keys are unique", () => {
	const keys = [...lyricsTabSource().matchAll(/sectionKey: "([^"]+)"/g)].map((match) => match[1]);
	assert.equal(new Set(keys).size, keys.length, `duplicate section keys: ${keys.join(", ")}`);
});
