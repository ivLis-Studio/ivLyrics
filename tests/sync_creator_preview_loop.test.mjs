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
	const parallelCalls = [];
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
		parallelPreviewElementsRef: { current: new Map() },
		charTimesRef: { current: [] },
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
			${slice("\tconst applyParallelPlaybackProgressVisual =", "\n\tuseEffect(() => {\n\t\tcharElementsRef.current = [];")}
			return { getPreviewProgressIndexAtTime, applyPlaybackProgressVisual, applyParallelPlaybackProgressVisual };
		})();`, context);
		const helpers = context.previewHelpers;
		context.applyParallelPlaybackProgressVisual = (value) => {
			parallelCalls.push(value);
			return helpers.applyParallelPlaybackProgressVisual(value);
		};
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
		context, frames, lookupCalls, playbackCalls, recordingCalls, scheduledDelays, parallelCalls,
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

const freeze = (value) => {
	if (value && typeof value === "object") {
		Object.values(value).forEach(freeze);
		Object.freeze(value);
	}
	return value;
};

// Execute the production renderer and its ref callbacks. The minimal element
// tree models only the query selectors used by the preview, not its behavior.
const attachParallelRenderer = (preview, { text = "ABCD", lineStart = 0, selected = "lead" } = {}) => {
	const { context } = preview;
	const selectedCalls = [];
	const recordCalls = [];
	const styleWrites = [];
	let queries = 0;
	let memoResult;
	let memoDependencies;
	Object.assign(context, {
		activeParallelTargetId: selected, currentFullLineChars: Array.from(text), currentLineStart: lineStart,
		currentLineData: { parallel: { parts: [] } }, currentParallelData: { parts: [] },
		useMemo: (callback, dependencies) => {
			if (!memoDependencies || dependencies.some((value, index) => !Object.is(value, memoDependencies[index]))) {
				memoDependencies = dependencies;
				memoResult = callback();
			}
			return memoResult;
		},
		SYNC_CREATOR_DEFAULT_SPEAKER: "NORMAL", SYNC_CREATOR_DEFAULT_KIND: "vocal",
		textEffectsDisabled: false,
		getSyncCreatorSpeakerTextColor: (speaker, color) => color || (speaker === "FEMALE 1" ? "#ffaabb" : "#aabbff"),
		isSyncCreatorDuetSpeaker: (speaker) => speaker.startsWith("DUET"),
		getSyncCreatorKindLabel: (kind) => kind,
		normalizeSyncCreatorKind: (kind) => kind || "vocal",
		handleContainerMouseDown: (event) => recordCalls.push(event),
		selectParallelPart: (id) => selectedCalls.push(id),
		renderCurrentLineCharacters: () => ({ type: "selected-content", props: {}, children: [] }),
		rtlTextRunStyle: {},
		s: new Proxy({
			parallelStackCharSynced: { background: "synced" },
			rtlTextRun: { whiteSpace: "pre", overflowWrap: "normal" },
		}, { get: (target, key) => target[key] || {} }),
		react: { createElement: (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity).filter((child) => child !== false && child !== null && child !== undefined) }) },
	});
	vm.runInContext([
		slice("const SYNC_CREATOR_RTL_STRONG_CHAR_REGEX", "const SYNC_CREATOR_JAPANESE_KANA_REGEX"),
		slice("const countSyncCreatorRangeChars", "const roundSyncCreatorTime"),
		slice("const areSyncCreatorParallelRangesEqual", "const countSyncCreatorParallelRangeOverlap"),
		slice("const getSyncCreatorTextDirection", "const getSyncCreatorLineCharCountsFromText"),
		slice("const hasSyncCreatorRtlText", "const getSyncCreatorCodeUnitOffsets"),
		slice("\tconst rangesToCharRefs =", "\tconst formatSyncCreatorParallelPreviewLines ="),
		`globalThis.renderPart = (() => { ${slice("\tconst renderParallelPartLine =", "\n\tconst getSpeakerTone =")} return renderParallelPartLine; })();`,
	].join("\n"), context);

	const render = (part, index = 1) => {
		const parts = context.currentParallelData.parts;
		if (!parts.includes(part)) {
			context.currentParallelData = { parts: [...parts.filter((item) => item.id !== part.id), part] };
		}
		context.currentExistingLineData = context.currentLineData;
		vm.runInContext(`globalThis.currentParallelPreviewTargets = (() => {
			${slice("\tconst currentParallelPreviewTargets =", "\tconst currentParentheticalLayoutCandidate =")}
			return currentParallelPreviewTargets;
		})();`, context);
		return context.renderPart(part, index);
	};
	const mount = (part, index = 1) => {
		const tree = render(part, index);
		const refs = [];
		const domFor = (node) => {
			if (!node || typeof node !== "object") return node;
			const dom = {
				props: node.props,
				style: new Proxy({ ...node.props.style }, { set(target, key, value) {
					styleWrites.push({ partId: part.id, key, value });
					target[key] = value;
					return true;
				} }),
				children: node.children.map(domFor),
			};
			const descendants = () => {
				const result = [];
				const visit = (child) => {
					if (!child || typeof child !== "object") return;
					result.push(child);
					child.children.forEach(visit);
				};
				dom.children.forEach(visit);
				return result;
			};
			dom.querySelectorAll = (selector) => {
				queries++;
				return descendants().filter((child) => Object.hasOwn(child.props, selector.slice(1, -1)));
			};
			dom.querySelector = (selector) => dom.querySelectorAll(selector)[0] || null;
			if (node.props.ref) refs.push(() => node.props.ref(dom));
			return dom;
		};
		const dom = domFor(tree);
		refs.forEach((ref) => ref());
		const row = context.parallelPreviewElementsRef.current.get(part.id);
		return {
			tree, dom, row,
			unmount: () => {
				const visit = (node) => {
					if (!node || typeof node !== "object") return;
					node.props.ref?.(null);
					node.children.forEach(visit);
				};
				visit(tree);
			},
		};
	};
	return { mount, render, selectedCalls, recordCalls, styleWrites, get queries() { return queries; } };
};

const part = (id, chars, ranges = [{ start: 0, end: 3 }], extra = {}) => ({
	id, role: "background", speaker: "FEMALE 1", kind: "vocal", ranges, join: [], chars, ...extra,
});
const backgrounds = (row) => Array.from(row.elements, (element) => element.style.background || "");

test("nonselected saved parts advance and seek while only the selected part is recording", () => {
	const preview = createPreview({ mode: "record", initialPosition: 1000 });
	const renderer = attachParallelRenderer(preview);
	const saved = freeze(part("background", [1, 2, 3, 4]));
	preview.context.currentLineData.parallel.parts = [saved];
	const { row } = renderer.mount(part("background", undefined));
	preview.context.recordingCharIndexRef.current = 1;
	preview.context.charTimesRef.current = [99, 100, null, null];
	const selectedGlyphs = preview.context.charElementsRef.current;
	selectedGlyphs.forEach((glyph) => { glyph.style.background = "recording-orange"; });
	const savedBefore = JSON.stringify(preview.context.currentLineData);
	for (const [position, expected] of [
		[1000, ["progress", "synced", "synced", "synced"]],
		[3000, ["progress", "progress", "progress", "synced"]],
		[500, ["synced", "synced", "synced", "synced"]],
		[4000, ["progress", "progress", "progress", "progress"]],
	]) {
		preview.setProgress(position);
		preview.tick();
		assert.deepEqual(backgrounds(row), expected);
	}
	assert.deepEqual(preview.playbackCalls, []);
	assert.deepEqual(preview.recordingCalls, []);
	assert.ok(selectedGlyphs.every((glyph) => glyph.style.background === "recording-orange"));
	assert.deepEqual(preview.context.charTimesRef.current, [99, 100, null, null]);
	assert.equal(JSON.stringify(preview.context.currentLineData), savedBefore);
	preview.dispose();
});

test("selected recording locks do not clamp other saved parts or repaint paused previews", () => {
	const preview = createPreview({ mode: "record", initialPosition: 3500 });
	const renderer = attachParallelRenderer(preview);
	const { row } = renderer.mount(freeze(part("background", [1, 2, 3, 4])));
	preview.setLock(0);
	preview.tick();
	const writes = renderer.styleWrites.length;
	preview.setLock(2);
	preview.tick(600);
	assert.deepEqual(preview.recordingCalls, [0, ...new Array(600).fill(2)]);
	assert.deepEqual(backgrounds(row), ["progress", "progress", "progress", "synced"]);
	assert.equal(renderer.styleWrites.length, writes);
	preview.dispose();
});

test("paused nonselected refs repaint after saved timing, speaker, range or target changes", () => {
	const preview = createPreview({ initialPosition: 2500 });
	const renderer = attachParallelRenderer(preview);
	let mounted = renderer.mount(part("background", [1, 2, 3, 4]));
	preview.tick(10);
	assert.deepEqual(backgrounds(mounted.row), ["progress", "progress", "synced", "synced"]);
	const oldRow = mounted.row;
	mounted.unmount();
	mounted = renderer.mount(part("background", [4, 5, 6, 7], undefined, { "speaker-color": "#123456" }));
	preview.tick(10);
	assert.deepEqual(backgrounds(mounted.row), ["synced", "synced", "synced", "synced"]);
	assert.equal(mounted.row.color, "#123456");
	assert.deepEqual(backgrounds(oldRow), ["progress", "progress", "synced", "synced"]);
	mounted.unmount();
	mounted = renderer.mount(part("background", [1, 2], [{ start: 1, end: 2 }]));
	preview.tick();
	assert.deepEqual(backgrounds(mounted.row), ["progress", "progress"]);
	mounted.unmount();
	preview.context.activeParallelTargetId = "background";
	const selected = renderer.mount(part("background", [1, 2], [{ start: 1, end: 2 }]));
	assert.equal(preview.context.parallelPreviewElementsRef.current.size, 0);
	assert.ok(!selected.row, "selected part leaves the preview registry");
	preview.tick();
	assert.deepEqual(preview.playbackCalls, [3], "paused selected paint still remains deduplicated");
	preview.dispose();
});

test("each nonselected RTL/text-run uses its own direction and speaker independently", () => {
	for (const [text, selectedRtl, expectedDirection, textRun] of [
		["אבגד", false, "rtl", true], ["ABCD", true, "ltr", false], ["אבCD", true, "ltr", true],
	]) {
		const preview = createPreview({ initialPosition: 2000, textRun: selectedRtl });
		const renderer = attachParallelRenderer(preview, { text });
		const { row } = renderer.mount(part("background", [1, 2, 3, 4], undefined, { "speaker-color": "#123456" }));
		preview.tick();
		assert.equal(row.direction, expectedDirection);
		assert.equal(!!row.textRun, textRun);
		if (textRun) {
			assert.equal(row.textRun.style.whiteSpace, "pre-wrap");
			assert.equal(row.textRun.style.overflowWrap, "anywhere");
			assert.match(row.textRun.style.backgroundImage, new RegExp(`to ${expectedDirection === "rtl" ? "left" : "right"}.*#123456.*50%`));
			preview.setProgress(0);
			preview.tick();
			assert.match(row.textRun.style.backgroundImage, /0%/);
		} else assert.deepEqual(backgrounds(row), ["progress", "progress", "synced", "synced"]);
		assert.notEqual(row.textRun, preview.context.rtlTextRunRef.current);
		preview.dispose();
	}
});

test("grouped range separators are display-only and do not consume timing indices", () => {
	const preview = createPreview({ initialPosition: 2000 });
	const renderer = attachParallelRenderer(preview, { text: "AB--CD", lineStart: 10 });
	const saved = freeze(part("background", [1, 2, 3, 4], [{ start: 10, end: 11 }, { start: 14, end: 15 }], { join: [1] }));
	const { row, dom } = renderer.mount(saved);
	assert.equal(row.elements.length, 4);
	assert.deepEqual(Array.from(row.elements, (node) => node.props["data-iv-sync-creator-preview-index"]), [0, 1, 2, 3]);
	assert.equal(dom.children[1].children.length, 5, "join spacer is visible but has no timed ref");
	preview.tick();
	assert.deepEqual(backgrounds(row), ["progress", "progress", "synced", "synced"]);
	preview.dispose();
});

test("missing, invalid and incompatible timings never borrow the recording draft", () => {
	const preview = createPreview({ mode: "record", initialPosition: 10000 });
	const renderer = attachParallelRenderer(preview);
	preview.context.charTimesRef.current = [0, 1, 2, 3];
	for (const chars of [undefined, [], [1, 2], [1, null, 3, 4], [1, NaN, 3, 4], [1, Infinity, 3, 4], [1, "2", 3, 4], [-1, 2, 3, 4], [1, 3, 2, 4], [5, 6, 1, 7], new Array(4), [, 2, 3, 4]]) {
		const mounted = renderer.mount(part("background", chars));
		preview.tick();
		assert.equal(mounted.row.chars.length, 0);
		assert.deepEqual(backgrounds(mounted.row), ["", "", "", ""]);
		mounted.unmount();
	}
	preview.context.currentLineData.parallel.parts = [part("background", [1, 2, 3, 4], [{ start: 1, end: 4 }])];
	const wrongRanges = renderer.mount(part("background", undefined));
	preview.tick();
	assert.equal(wrongRanges.row.chars.length, 0);
	assert.deepEqual(backgrounds(wrongRanges.row), ["", "", "", ""]);
	preview.dispose();
});

test("nonselected pointer events select only; selected events keep the recording handler", () => {
	const preview = createPreview({ mode: "record" });
	const renderer = attachParallelRenderer(preview);
	const nonselected = renderer.mount(part("background", [1, 2, 3, 4]));
	let prevented = 0;
	let stopped = 0;
	const event = { preventDefault: () => prevented++, stopPropagation: () => stopped++ };
	nonselected.tree.props.onMouseDown(event);
	nonselected.tree.props.onTouchStart(event);
	nonselected.tree.props.onClick();
	assert.deepEqual(renderer.selectedCalls, ["background", "background", "background"]);
	assert.equal(renderer.recordCalls.length, 0);
	assert.equal(prevented, 2);
	assert.equal(stopped, 2);
	const selected = renderer.mount(part("lead", [1, 2, 3, 4]));
	selected.tree.props.onMouseDown(event);
	selected.tree.props.onTouchStart(event);
	selected.tree.props.onClick();
	assert.deepEqual(renderer.recordCalls, [event, event]);
	assert.equal(renderer.selectedCalls.length, 3);
	assert.equal(preview.context.charElementsRef.current.length, 4, "preview mount never registers recording hit-test glyphs");
	preview.dispose();
});

test("committing a selected recording preserves every nonselected saved or inherited timing", () => {
	const preview = createPreview();
	attachParallelRenderer(preview);
	const lead = freeze(part("lead", [1, 2, 3, 4]));
	const savedBackground = freeze(part("saved", [4, 5, 6, 7]));
	const inheritedBackground = freeze(part("inherited", [8, 9, 10, 11]));
	const parts = freeze([lead, part("saved", undefined), inheritedBackground, part("unsynced", undefined)]);
	const existingParts = freeze([lead, savedBackground]);
	Object.assign(preview.context, {
		currentParallelData: { parts }, existingParts, activeParallelPart: lead,
		normalizedRawChars: [20.12345, 21.23456, 22.34567, 23.45678], syncGranularity: "character",
		roundSyncTime: (time) => Math.round(time * 1000) / 1000,
		sanitizeSyncCreatorSpeakerFallback: (_speaker, fallback) => fallback,
		sanitizeSyncCreatorSpeakerColor: (_speaker, color) => color,
		normalizeSyncCreatorGranularity: (value) => value || "character",
	});
	const mappingStart = source.indexOf("const parts = currentParallelData.parts", source.indexOf("const commitCurrentLineSync ="));
	const mappingEnd = source.indexOf("\n\t\t\tif (parts.length > 0)", mappingStart);
	assert.ok(mappingStart > 0 && mappingEnd > mappingStart);
	vm.runInContext(`globalThis.committedParts = (() => {
		const countRangeChars = countSyncCreatorRangeChars;
		${source.slice(mappingStart, mappingEnd)}
		return parts;
	})();`, preview.context);
	const committed = Array.from(preview.context.committedParts);
	assert.deepEqual(Array.from(committed[0].chars), [20.123, 21.235, 22.346, 23.457]);
	assert.equal(committed[1].chars, savedBackground.chars);
	assert.equal(committed[2].chars, inheritedBackground.chars);
	assert.ok(!Object.hasOwn(committed[3], "chars"));
	assert.deepEqual(lead.chars, [1, 2, 3, 4]);
	preview.dispose();
});

test("inherited timings take precedence over old saved shapes without using raw recording inputs", () => {
	const preview = createPreview({ mode: "record", initialPosition: 1500 });
	const renderer = attachParallelRenderer(preview);
	const inherited = freeze(part("background", [1, 2, 3, 4]));
	preview.context.currentLineData.parallel.parts = [freeze(part("background", [10, 20, 30, 40]))];
	preview.context.charTimesRef.current = [99, 99, 99, 99];
	const { row } = renderer.mount(inherited);
	preview.tick();
	assert.equal(row.chars, inherited.chars);
	assert.deepEqual(backgrounds(row), ["progress", "synced", "synced", "synced"]);
	preview.context.charTimesRef.current = [0, 0, 0, 0];
	preview.tick();
	assert.deepEqual(backgrounds(row), ["progress", "synced", "synced", "synced"]);
	preview.dispose();
});

test("position-only rerenders preserve memo targets, ref identity and existing playback paint", () => {
	for (const text of ["ABCD", "אבגד"]) {
		const preview = createPreview({ initialPosition: 2000 });
		const renderer = attachParallelRenderer(preview, { text });
		const saved = freeze(part("background", [1, 2, 3, 4]));
		const mounted = renderer.mount(saved);
		preview.tick();
		const targets = preview.context.currentParallelPreviewTargets;
		const target = targets.get(saved.id);
		const ref = mounted.tree.children[1].props.ref;
		const queryCount = renderer.queries;
		const writeCount = renderer.styleWrites.length;
		const initialVirtualStyles = mounted.tree.children[1].children.map((node) => node.props.style);
		for (let position = 2100; position < 8100; position += 10) {
			preview.context.position = position;
			const tree = renderer.render(saved);
			assert.equal(preview.context.currentParallelPreviewTargets, targets);
			assert.equal(targets.get(saved.id), target);
			assert.equal(tree.children[1].props.ref, ref);
			assert.deepEqual(tree.children[1].children.map((node) => node.props.style), initialVirtualStyles,
				"React does not replace the existing playback paint with an updated position-derived style");
			preview.tick();
		}
		assert.equal(preview.context.parallelPreviewElementsRef.current.get(saved.id), mounted.row);
		assert.equal(mounted.row.lastIndex, 1);
		assert.equal(mounted.row.lastPosition, 2);
		assert.equal(renderer.queries, queryCount, "unchanged ref does not query the DOM again");
		assert.equal(renderer.styleWrites.length, writeCount, "paused paint cache survives every rerender");
		preview.dispose();
	}
});

test("line and word granularity accept equal timestamps including time zero", () => {
	for (const [chars, position, expected] of [
		[[0, 0, 0, 0], 0, ["progress", "progress", "progress", "progress"]],
		[[1, 1, 2, 2], 1500, ["progress", "progress", "synced", "synced"]],
	]) {
		const preview = createPreview({ initialPosition: position });
		const renderer = attachParallelRenderer(preview);
		const saved = freeze(part("background", chars));
		const { row } = renderer.mount(saved);
		preview.tick();
		assert.equal(row.chars, saved.chars);
		assert.deepEqual(backgrounds(row), expected);
		preview.setProgress(Infinity);
		preview.tick();
		assert.deepEqual(backgrounds(row), ["synced", "synced", "synced", "synced"]);
		preview.setProgress(position);
		preview.tick();
		assert.deepEqual(backgrounds(row), expected);
		preview.dispose();
	}
});
