import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../SyncDataCreator.js", import.meta.url), "utf8");
const slice = (startMarker, endMarker) => {
	const start = source.indexOf(startMarker);
	const end = source.indexOf(endMarker, start + startMarker.length);
	assert.ok(start >= 0 && end > start, `missing source section: ${startMarker}`);
	return source.slice(start, end);
};
const effectSource = slice(
	"\tuseEffect(() => {\n\t\tif (!syncLinesByStart || currentLineIndex >= lyricsLines.length)",
	"\n\t// Keep the creator on the same restrained visual system as Settings."
);

const createPreview = ({ mode = "preview", initialPosition = 0, textRun = false, timerFallback = false } = {}) => {
	let progress = initialPosition;
	let nextFrameId = 0;
	let effectDependencies;
	let cleanup;
	let polls = 0;
	let lockIndex = -1;
	const frames = new Map();
	const lookupCalls = [];
	const playbackCalls = [];
	const recordingCalls = [];
	const scheduledDelays = [];
	const schedule = (callback) => {
		const id = ++nextFrameId;
		frames.set(id, callback);
		return id;
	};
	const context = vm.createContext({
		mode, position: 0, currentLineIndex: 0, lyricsText: "word", activeParallelPartId: "full",
		lyricsLines: ["word"], lineCharOffsets: [0], activeParallelPart: null,
		syncLinesByStart: new Map([[0, { chars: [0, 0.5, 1, 1.5] }]]),
		currentLineChars: Array.from("word"), currentLineDirection: textRun ? "rtl" : "ltr",
		currentSpeakerTextColor: "#aabbcc", currentSpeakerMutedColor: "#112233",
		useCurrentLineTextRun: textRun,
		lastPaintedPlaybackIndexRef: { current: -1 }, recordingCharIndexRef: { current: -1 },
		charElementsRef: { current: Array.from("word", () => ({ style: {}, dataset: { ivSyncCreatorSynced: "1" } })) },
		rtlTextRunRef: { current: { style: {} } },
		SYNC_CREATOR_PROGRESS_BACKGROUND: "progress",
		SYNC_CREATOR_SYNCED_BACKGROUND: "synced",
		Spicetify: { Player: { getProgress: () => { polls++; return progress; } } },
		getActiveRecordingLockIndex: () => lockIndex,
		applyRecordingProgressVisual: (value) => recordingCalls.push(value),
		useCallback: (callback) => callback,
		useEffect: (effect, dependencies) => {
			if (effectDependencies && dependencies.length === effectDependencies.length
				&& dependencies.every((value, index) => Object.is(value, effectDependencies[index]))) return;
			cleanup?.();
			effectDependencies = dependencies;
			cleanup = effect();
		},
		...(timerFallback ? {
			setTimeout: (callback, delay) => { scheduledDelays.push(delay); return schedule(callback); },
			clearTimeout: (id) => frames.delete(id),
		} : {
			requestAnimationFrame: schedule, cancelAnimationFrame: (id) => frames.delete(id),
		}),
	});
	vm.runInContext([
		slice("const getSyncCreatorLockedPlaybackProgressIndex", "const countSyncCreatorRangeChars"),
		slice("const getSyncCreatorProgressGradient", "const normalizeSyncCreatorIsrc"),
	].join("\n"), context);
	const refreshCallbacks = () => {
		vm.runInContext(`globalThis.previewHelpers = (() => {
			${slice("\tconst getPreviewProgressIndexAtTime =", "\tconst getPreviewProgressIndex =")}
			${slice("\tconst applyPlaybackProgressVisual =", "\n\tuseEffect(() => {\n\t\tcharElementsRef.current = [];")}
			return { getPreviewProgressIndexAtTime, applyPlaybackProgressVisual };
		})();`, context);
		const helpers = context.previewHelpers;
		context.getPreviewProgressIndexAtTime = (...args) => {
			lookupCalls.push(args);
			return helpers.getPreviewProgressIndexAtTime(...args);
		};
		context.applyPlaybackProgressVisual = (value) => {
			playbackCalls.push(value);
			return helpers.applyPlaybackProgressVisual(value);
		};
	};
	refreshCallbacks();
	const render = (changes = {}) => {
		Object.assign(context, changes);
		vm.runInContext(effectSource, context);
	};
	render();
	return {
		context, frames, lookupCalls, playbackCalls, recordingCalls, scheduledDelays,
		get polls() { return polls; },
		setProgress: (value) => { progress = value; },
		setLock: (value) => { lockIndex = value; },
		refreshCallbacks, render,
		remount: () => { cleanup?.(); effectDependencies = undefined; render(); },
		dispose: () => { cleanup?.(); cleanup = undefined; },
		tick: (count = 1) => {
			for (let index = 0; index < count; index++) {
				assert.equal(frames.size, 1, "the preview must keep exactly one scheduled poll");
				const [id, callback] = frames.entries().next().value;
				frames.delete(id);
				callback(index * 16);
			}
		},
	};
};

test("paused preview paints position zero once while polling all 600 frames", () => {
	const preview = createPreview();
	preview.tick(600);
	assert.equal(preview.polls, 600);
	assert.deepEqual(preview.lookupCalls, [[0, 0]]);
	assert.deepEqual(preview.playbackCalls, [0]);
	assert.equal(preview.context.charElementsRef.current[0].style.background, "progress");
	assert.equal(preview.context.charElementsRef.current[1].style.background, "synced");
	preview.dispose();
	assert.equal(preview.frames.size, 0);
});

test("seek forward, seek backward and resumed playback repaint on the next poll", () => {
	const preview = createPreview({ initialPosition: 1000 });
	for (const position of [1000, 1000, 1500, 1500, 250, 250, 266, 282, 298]) {
		preview.setProgress(position);
		preview.tick();
	}
	assert.equal(preview.polls, 9);
	assert.deepEqual(preview.lookupCalls.map(([, time]) => time), [1, 1.5, 0.25, 0.266, 0.282, 0.298]);
	assert.deepEqual(preview.playbackCalls, [2, 3, 0.5, 0.532, 0.564, 0.596]);
	assert.equal(preview.context.charElementsRef.current[0].style.background, "progress");
	assert.equal(preview.context.charElementsRef.current[1].style.background, "synced");
});

test("non-finite positions keep the existing invalid-position paint path", () => {
	const preview = createPreview({ initialPosition: 1000 });
	preview.tick();
	preview.setProgress(Infinity);
	preview.tick(2);
	preview.setProgress("invalid");
	preview.tick(2);
	preview.setProgress(1000);
	preview.tick();
	assert.deepEqual(preview.playbackCalls, [2, -1, -1, -1, -1, 2]);
	assert.equal(preview.lookupCalls.length, 2);
	preview.setProgress(NaN);
	preview.tick();
	assert.equal(preview.lookupCalls.at(-1)[1], 0, "retain the existing getProgress() || 0 fallback");
});

test("the paint-reset sentinel refreshes paused glyphs and RTL text runs", () => {
	for (const textRun of [false, true]) {
		const preview = createPreview({ initialPosition: 1000, textRun });
		preview.tick(3);
		preview.context.lastPaintedPlaybackIndexRef.current = -2;
		preview.tick(3);
		assert.deepEqual(preview.playbackCalls, [2, 2]);
		assert.equal(preview.context.lastPaintedPlaybackIndexRef.current, 2);
		if (textRun) {
			assert.match(preview.context.rtlTextRunRef.current.style.backgroundImage, /to left.*75%/);
		}
	}
});

test("paused previews refresh after lyrics, vocal target, style and effect remount changes", () => {
	const preview = createPreview({ initialPosition: 1000 });
	preview.tick(3);
	preview.render({ lyricsText: "next" });
	preview.tick(3);
	preview.render({ activeParallelPartId: "background-1" });
	preview.tick(3);
	preview.context.currentSpeakerTextColor = "#123456";
	preview.refreshCallbacks();
	preview.render();
	preview.tick(3);
	assert.equal(preview.context.charElementsRef.current[0].style.color, "#123456");
	preview.remount();
	preview.tick(3);
	assert.deepEqual(preview.playbackCalls, [2, 2, 2, 2, 2]);
	assert.equal(preview.polls, 15);
});

test("recording still resolves changing locks on every frame at a fixed position", () => {
	const preview = createPreview({ mode: "record", initialPosition: 1500 });
	preview.setLock(0);
	preview.tick(2);
	preview.setLock(2);
	preview.tick(2);
	preview.context.recordingCharIndexRef.current = 1;
	preview.tick(2);
	preview.context.recordingCharIndexRef.current = -1;
	preview.setLock(-1);
	preview.tick(2);
	assert.equal(preview.lookupCalls.length, 8);
	assert.deepEqual(preview.recordingCalls, [0, 0, 2, 2]);
	assert.deepEqual(preview.playbackCalls, [3, 3]);
});

test("edit mode and the timeout fallback retain scheduling cadence and cancellation", () => {
	const preview = createPreview({ mode: "edit", initialPosition: 500, timerFallback: true });
	preview.tick(10);
	assert.equal(preview.polls, 10);
	assert.deepEqual(preview.playbackCalls, [1]);
	assert.deepEqual(preview.scheduledDelays, new Array(11).fill(16));
	preview.dispose();
	assert.equal(preview.frames.size, 0);
});
