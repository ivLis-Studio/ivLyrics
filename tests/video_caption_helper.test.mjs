import assert from "node:assert/strict";
import test from "node:test";
import { disableYouTubeCaptions } from "#ivlyrics/features/video/youTubeBackgroundTimeline.mjs";
import { createYouTubeBackgroundPlayerControls } from "#ivlyrics/features/video/youtubeBackgroundPlayerControls.mjs";

test("the background player controls turn captions off with the shared helper", () => {
	const controls = createYouTubeBackgroundPlayerControls({ document: {}, registerRestore() {}, forgetRestore() {} });
	assert.equal(controls.disableYouTubeCaptions, disableYouTubeCaptions);
	const calls = [];
	disableYouTubeCaptions({
		unloadModule: name => calls.push(["unload", name]),
		setOption: (module, option, value) => calls.push(["option", module, option, value]),
	});
	assert.deepEqual(calls, [["unload", "captions"], ["unload", "cc"], ["option", "captions", "track", {}], ["option", "cc", "track", {}]]);
	// A player that throws, or has neither method, is left alone.
	assert.doesNotThrow(() => disableYouTubeCaptions({ unloadModule() { throw new Error("x"); }, setOption() { throw new Error("y"); } }));
	assert.doesNotThrow(() => disableYouTubeCaptions({}));
	assert.doesNotThrow(() => disableYouTubeCaptions(null));
});

