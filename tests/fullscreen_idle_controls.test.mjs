import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (name) => readFileSync(new URL("../" + name, import.meta.url), "utf8");

// Issue #154: in fullscreen, every song change brought back the cursor, the
// menu and the sync-offset buttons until the mouse moved again.
test("a render that rewrites the page's class list keeps idle controls hidden", () => {
	const source = read("index.js");
	const start = source.indexOf("className: \`lyrics-lyricsContainer-LyricsContainer");
	const end = source.indexOf("style: this.styleVariables", start);
	assert.ok(start > 0 && end > start);
	const className = source.slice(start, end);
	assert.match(className, /this\.isMouseActive === false \? " controls-hidden ui-hidden" : ""/,
		"the idle classes the timer sets are part of every rendered class list");
	assert.match(className, /this\.state\.isPlaybackPaused \? " playback-paused"/, "a pause between songs rewrites the class list");
	const hide = source.slice(source.indexOf("const hideWhenIdle = () => {"), source.indexOf("this._handleMouseLeave = () => {"));
	assert.match(hide, /this\.isMouseActive = false;[\s\S]*classList\.add\('controls-hidden'\)/, "idle state and classes change together");
});

test("a mousemove without movement does not wake the controls", () => {
	const source = read("index.js");
	const handler = source.slice(source.indexOf("this._handleMouseMove = (event) => {"), source.indexOf("const hideWhenIdle = () => {"));
	assert.ok(handler.length > 0);
	assert.ok(handler.indexOf("if (last && last.x === event.screenX && last.y === event.screenY) return;") < handler.indexOf("this.isMouseActive = true;"));
	// The handler also starts the idle timer without an event.
	assert.match(handler, /if \(event && Number\.isFinite\(event\.screenX\)/);

	const overlay = read("FullscreenOverlay.js");
	const own = overlay.slice(overlay.indexOf("const handleMouseMove = (event) => {"), overlay.indexOf("document.addEventListener('mousemove', handleMouseMove"));
	assert.ok(own.indexOf("last.x === event.screenX && last.y === event.screenY) return;") < own.indexOf("setUiVisible(true)"),
		"the fullscreen controller ignores it too");
});

