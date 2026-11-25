import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createLyricsPointerControls } from "../src/lyrics/lyricsPointerControls.mjs";
import { createLyricsPageToolbar } from "../src/lyrics/lyricsPageToolbar.mjs";

// Issue #154: in fullscreen, every song change brought back the cursor, the
// menu and the sync-offset buttons until the mouse moved again.
test("a render that rewrites the page's class list keeps idle controls hidden", () => {
	const source = readFileSync(new URL("../src/lyrics/lyricsPageView.mjs", import.meta.url), "utf8");
	const start = source.indexOf("className: \`lyrics-lyricsContainer-LyricsContainer");
	const end = source.indexOf("style: styleVariables", start);
	assert.ok(start > 0 && end > start);
	const className = source.slice(start, end);
	assert.match(className, /page\.isMouseActive === false \? " controls-hidden ui-hidden" : ""/,
		"the idle classes the timer sets are part of every rendered class list");
	assert.match(className, /page\.state\.isPlaybackPaused \? " playback-paused"/, "a pause between songs rewrites the class list");
});

test("a mousemove without movement does not wake the controls", () => {
	const container = new EventTarget();
	const hidden = new Set();
	container.classList = {
		toggle(name, force) {
			if (force) hidden.add(name);
			else hidden.delete(name);
		},
	};
	let idle;
	const activities = [];
	const listener = createLyricsPointerControls({
		isToolbarEngaged: () => false,
		onActivityChange: (active) => activities.push(active),
		onWheel: () => {},
		scheduleTimer: (callback) => { idle = callback; },
		cancelTimer: () => { idle = undefined; },
	});
	const moveTo = (x, y) => container.dispatchEvent(Object.assign(new Event("mousemove"), { screenX: x, screenY: y }));
	listener.attach(container);
	moveTo(10, 20);
	idle();
	assert.deepEqual(hidden, new Set(["controls-hidden", "ui-hidden"]));

	moveTo(10, 20);
	assert.equal(activities.at(-1), false);
	assert.equal(hidden.size, 2);
	moveTo(20, 20);
	assert.equal(activities.at(-1), true);
	assert.equal(hidden.size, 0);

	const staleIdle = idle;
	listener.attach(null);
	assert.equal(idle, undefined);
	assert.equal(container.onmousewheel, null);
	moveTo(30, 20);
	staleIdle();
	assert.deepEqual(activities, [true, true, false, true]);
});

test("toolbar engagement wakes hidden controls and disengagement restarts the idle timer", () => {
	const container = new EventTarget();
	const active = [];
	container.classList = { toggle() {} };
	let idle;
	let delay;
	const controls = createLyricsPointerControls({
		isToolbarEngaged: () => toolbar.isEngaged(),
		onActivityChange: value => active.push(value),
		onWheel() {},
		scheduleTimer: (callback, timeout) => { idle = callback; delay = timeout; },
		cancelTimer: () => { idle = null; },
	});
	const toolbar = createLyricsPageToolbar({
		page: { containerRef: { current: container } }, modes: {},
		wakeControls: controls.wake,
	});
	controls.attach(container);
	idle();
	assert.equal(active.at(-1), false);
	toolbar.actions.setEngaged(true);
	assert.equal(active.at(-1), true);
	idle();
	assert.equal(active.at(-1), true);
	assert.equal(delay, 1200);
	toolbar.actions.setEngaged(false);
	assert.equal(delay, 2500);
	idle();
	assert.equal(active.at(-1), false);
});
