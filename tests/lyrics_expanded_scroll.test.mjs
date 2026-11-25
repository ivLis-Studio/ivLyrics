import assert from "node:assert/strict";
import test from "node:test";
import { createLyricsExpandedScroll } from "../src/lyrics/lyricsExpandedScroll.mjs";
import { createLyricsScrollGeometry } from "../src/lyrics/lyricsScrollGeometry.mjs";
import { createLyricsScrollActivityHook } from "../src/lyrics/lyricsScrollActivity.mjs";
import { createSyncedLyricsViewportHook } from "../src/lyrics/syncedLyricsViewport.mjs";

test("expanded lyrics retarget scrolling after a row grows and cancel old frames on manual scroll", () => {
	const geometry = createLyricsScrollGeometry(() => ({ getPropertyValue: () => "0.4" }));
	const container = { clientHeight: 500, scrollHeight: 1500, scrollTop: 0 };
	const line = { clientHeight: 60, offsetTop: 600, offsetParent: container };
	const frames = new Map();
	let time = 0;
	let reducedMotion = false;
	const { scrollSyncedContainerToActiveLine: center, cancelSyncedLyricsScrollAnimation: cancel } =
		createLyricsExpandedScroll({
			getExpandedScrollTarget: geometry.getExpandedScrollTarget,
			prefersReducedLyricsMotion: () => reducedMotion,
			now: () => time,
			requestFrame(callback) {
				const id = Symbol();
				frames.set(id, callback);
				return id;
			},
			cancelFrame: (id) => frames.delete(id),
		});
	const frame = (timestamp) => {
		const [id, callback] = frames.entries().next().value;
		frames.delete(id);
		time = timestamp;
		callback(timestamp);
	};

	center(container, line);
	assert.equal(container.scrollTop, 0);
	frame(105);
	const partial = container.scrollTop;
	assert.ok(partial > 0 && partial < 430);
	line.offsetTop = 680;
	center(container, line, "sync");
	assert.equal(container.scrollTop, partial, "a layout update moves the target without snapping");
	assert.equal(frames.size, 1);
	frame(420);
	assert.equal(container.scrollTop, 510, "the retarget lands at the original end time");
	assert.equal(frames.size, 0);

	line.offsetTop = 850;
	center(container, line);
	const [queued] = frames.values();
	cancel(container);
	container.scrollTop = 430;
	queued(840);
	assert.equal(container.scrollTop, 430, "a cancelled playback frame cannot override native scrolling");
	assert.equal(frames.size, 0);

	reducedMotion = true;
	line.offsetTop = 1500;
	center(container, line);
	assert.equal(container.scrollTop, 1000, "reduced motion jumps to the clamped target");
	assert.equal(frames.size, 0);
});

test("expanded lyrics preserve the browsing position and follow the new host after a same-track replacement", () => {
	const slots = [];
	let hookIndex;
	let pending;
	let dirty;
	const react = {
		useState(initial) {
			const slot = slots[hookIndex++] ??= { value: initial };
			return [slot.value, value => {
				if (!Object.is(value, slot.value)) {
					dirty = true;
					slot.value = value;
				}
			}];
		},
		useRef(initial) { return slots[hookIndex++] ??= { current: initial }; },
		useCallback(callback) { return callback; },
		useEffect(callback, deps) {
			const index = hookIndex++;
			const previous = slots[index];
			if (previous && deps.every((value, index) => Object.is(value, previous.deps[index]))) return;
			pending.push(() => {
				previous?.cleanup?.();
				slots[index] = { deps, cleanup: callback() };
			});
		},
	};
	const timers = new Map();
	const centers = [];
	const hostEvents = new EventTarget();
	const useScrollActivity = createLyricsScrollActivityHook({
		react, hostEvents, cancelAutoScroll() {}, now: () => 1000,
		scheduleTimer(callback, delay) {
			assert.equal(delay, 3000);
			const id = Symbol();
			timers.set(id, callback);
			return id;
		},
		cancelTimer(id) { timers.delete(id); },
	});
	const useViewport = createSyncedLyricsViewportHook({
		react, canObserveLayout: () => false, isLineVisible: () => false,
		scrollSyncedContainerToActiveLine: (...args) => centers.push(args),
	});
	const lyrics = [];
	const containerRef = { current: null };
	const activeLineRef = { current: {} };
	const render = (container, visualLineIndex = 0) => {
		containerRef.current = container;
		let activity;
		let renders = 0;
		do {
			assert.ok(++renders < 5);
			dirty = false;
			hookIndex = 0;
			pending = [];
			activity = useScrollActivity({ container, lyricsId: "same track", preserveLayout: false });
			useViewport({
				container, containerRef, activeLineRef, visualLineIndex, lyricsId: "same track",
				compact: false, isScrolling: activity.isScrolling, preparedLyrics: lyrics,
			});
			for (const commit of pending) commit();
		} while (dirty);
		return activity;
	};
	const wheel = (container) => container.dispatchEvent(new Event("wheel"));

	const first = new EventTarget();
	render(null);
	render(first);
	assert.deepEqual(centers, [[first, activeLineRef.current, "auto"]]);
	wheel(first);
	assert.equal(render(first, 1).isScrolling, true);
	assert.equal(centers.length, 1, "playback cannot center during browsing");
	timers.values().next().value();
	assert.equal(render(first, 1).isScrolling, false);
	assert.deepEqual(centers.at(-1), [first, activeLineRef.current, "smooth"], "idle return centers the offscreen row");

	wheel(first);
	render(first).handleContainerClick();
	render(first);
	first.dispatchEvent(new Event("scroll"));
	assert.equal(render(first).isScrolling, false, "programmatic scroll after click cannot reopen browsing");
	wheel(first);
	assert.equal(render(first).isScrolling, true);
	const second = new EventTarget();
	render(null);
	assert.equal(timers.size, 0);
	wheel(first);
	assert.equal(timers.size, 0, "the old host has no remaining listeners");
	assert.equal(render(second).isScrolling, false);
	assert.deepEqual(centers.at(-1), [second, activeLineRef.current, "auto"]);
	wheel(second);
	assert.equal(render(second, 2).isScrolling, true);
	render(null);
	assert.equal(timers.size, 0);
});
