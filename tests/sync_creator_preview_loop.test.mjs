import { rangesToCharRefs, getSyncCreatorParallelPartDisplayItems } from "#ivlyrics/features/sync/syncCreatorVocalLayout.mjs";
import { buildRecordedSyncCreatorParallelParts } from "#ivlyrics/features/sync/syncCreatorLineCommit.mjs";
import { projectTimedUnits } from "#ivlyrics/features/sync/timingGranularity.mjs";
import { createSyncCreatorParallelPreviewTargets, createSyncCreatorPreviewPainting } from "#ivlyrics/features/sync/syncCreatorPreviewPainting.mjs";
import { useSyncCreatorEditorPreview, useSyncCreatorPreviewTiming } from "#ivlyrics/features/sync/syncCreatorEditorPreview.mjs";
import { renderSyncCreatorParallelPart } from "#ivlyrics/features/sync/syncCreatorParallelPartView.mjs";
import { renderSyncCreatorLineGlyphs, useSyncCreatorGlyphLayout } from "#ivlyrics/features/sync/syncCreatorLineGlyphView.mjs";
import { createSyncCreatorCharacterHitTesting } from "#ivlyrics/features/sync/syncCreatorCharacterHitTesting.mjs";
import { getSyncCreatorPreviewProgressIndex } from "#ivlyrics/features/sync/syncCreatorPlayback.mjs";
import { useSyncCreatorRecordingProgress } from "#ivlyrics/features/sync/syncCreatorRecordingProgress.mjs";
import {
	SYNC_CREATOR_PROGRESS_BACKGROUND, SYNC_CREATOR_RECORDING_BACKGROUND, SYNC_CREATOR_SYNCED_BACKGROUND,
} from "#ivlyrics/features/sync/syncCreatorStyles.mjs";
import { readSyncCreatorFixture } from "./fixtures/legacy-page-source.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readSyncCreatorFixture();
const slice = (startMarker, endMarker) => {
	const start = source.indexOf(startMarker);
	const end = source.indexOf(endMarker, start + startMarker.length);
	assert.ok(start >= 0 && end > start, `missing source section: ${startMarker}`);
	return source.slice(start, end);
};
const readPreviewTiming = (context) => useSyncCreatorPreviewTiming({
	react: context,
	syncData: { lines: [...context.syncLinesByStart].map(([start, line]) => ({ ...line, start })) },
	lineCharOffsets: context.lineCharOffsets,
	activeParallelPart: context.activeParallelPart,
	getRejoinedLineChars: context.getSyncCreatorRejoinedLineChars,
});

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
		createSyncCreatorPreviewPainting,
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
		window: {},
		Spicetify: { Player: { getProgress: () => { polls++; return progress; } } },
		getActiveRecordingLockIndex: () => lockIndex,
		applyRecordingProgressVisual: (value) => recordingCalls.push(value),
		useCallback: (callback) => callback,
		useMemo: (callback) => callback(),
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
		slice("const getSyncCreatorProgressGradient", "const syncCreatorVocalLayout"),
		`Object.assign(globalThis, (() => {
			${source.slice(0, source.indexOf("const SyncDataCreator ="))}
			return { hasOrderedSyncCreatorTimes, getSyncCreatorRejoinedLineChars, resolveSyncCreatorPaintCharColor, readSyncCreatorCodec };
		})());`,
	].join("\n"), context);
	const painting = vm.runInContext("syncCreatorPreviewPainting", context);
	const instrumentedPainting = {
		paintParallelPreviews(previews, position) {
			parallelCalls.push(position);
			return painting.paintParallelPreviews(previews, position);
		},
		paintActivePreview(input) {
			playbackCalls.push(input.nextIndex);
			return painting.paintActivePreview(input);
		},
	};
	let timing;
	const refreshCallbacks = () => {
		const helpers = readPreviewTiming(context);
		context.getPreviewProgressIndexAtTime = (...args) => {
			lookupCalls.push(args);
			return helpers.getPreviewProgressIndexAtTime(...args);
		};
		timing = { ...helpers, getPreviewProgressIndexAtTime: context.getPreviewProgressIndexAtTime };
	};
	const getProgress = () => context.Spicetify.Player.getProgress();
	const scheduleFrame = context.requestAnimationFrame || (callback => context.setTimeout(callback, 16));
	const cancelFrame = context.cancelAnimationFrame || context.clearTimeout;
	refreshCallbacks();
	const render = (changes = {}) => {
		Object.assign(context, changes);
		useSyncCreatorEditorPreview({
			react: context, mode: context.mode, timing, lyricsText: context.lyricsText, lineCount: context.lyricsLines.length,
			line: {
				index: context.currentLineIndex, partId: context.activeParallelPartId, charCount: context.currentLineChars.length,
				direction: context.currentLineDirection, color: context.currentSpeakerTextColor, mutedColor: context.currentSpeakerMutedColor,
				useTextRun: context.useCurrentLineTextRun,
			},
			refs: context, painting: instrumentedPainting, getProgress, scheduleFrame, cancelFrame,
			getActiveRecordingLockIndex: context.getActiveRecordingLockIndex,
			applyRecordingProgressVisual: context.applyRecordingProgressVisual,
		});
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
		renderSyncCreatorParallelPart, currentParallelPartReadingMaps: new Map(),
		usePrimaryCharacterPronunciation: false, hasCurrentLineCharacterPronunciation: false,
		useMemo: (callback, dependencies) => {
			if (!memoDependencies || dependencies.some((value, index) => !Object.is(value, memoDependencies[index]))) {
				memoDependencies = dependencies;
				memoResult = callback();
			}
			return memoResult;
		},
		rangesToCharRefs, getSyncCreatorParallelPartDisplayItems,
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
	context.syncCreatorVocalStyles = {
		getSyncCreatorSpeakerTextColor: context.getSyncCreatorSpeakerTextColor,
		isSyncCreatorDuetSpeaker: context.isSyncCreatorDuetSpeaker,
		getSyncCreatorKindLabel: context.getSyncCreatorKindLabel,
		normalizeSyncCreatorKind: context.normalizeSyncCreatorKind,
	};
	vm.runInContext([
		slice("const countSyncCreatorRangeChars", "const roundSyncCreatorTime"),
		`globalThis.renderPart = (() => { ${slice("\tconst renderParallelPartLine =", "\n\tconst updateCurrentTextEffect =")} return renderParallelPartLine; })();`,
	].join("\n"), context);

	const render = (part, index = 1) => {
		const parts = context.currentParallelData.parts;
		if (!parts.includes(part)) {
			context.currentParallelData = { parts: [...parts.filter((item) => item.id !== part.id), part] };
		}
		context.currentExistingLineData = context.currentLineData;
		context.createSyncCreatorParallelPreviewTargets = createSyncCreatorParallelPreviewTargets;
		vm.runInContext(`globalThis.currentParallelPreviewTargets = (() => {
			${slice("\tconst currentParallelPreviewTargets =", "\tconst showMissingMetaToast =")}
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
				dataset: Object.fromEntries(Object.entries(node.props)
					.filter(([key]) => key.startsWith("data-"))
					.map(([key, value]) => [key.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()), value])),
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
const colors = (elements) => Array.from(elements, (element) => element.style.color);

// Mount the selected row with its production glyph renderer and timing lookups,
// so synced flags and playback paint are checked together rather than replaced
// by the selected-content stub used in the independent-vocal tests below.
const createSelectedPartPreview = ({ savedLine, targetPart, text = "ABCD", initialPosition = 2000 } = {}) => {
	const preview = createPreview({ initialPosition });
	const renderer = attachParallelRenderer(preview, { text, selected: targetPart.id });
	const { context } = preview;
	Object.assign(context, {
		activeParallelPart: targetPart, activeParallelPartId: targetPart.id,
		renderSyncCreatorLineGlyphs, I18n: { t: () => "" },
		currentLineData: savedLine,
		syncLinesByStart: new Map([[0, savedLine]]),
		currentParallelData: { parts: [targetPart] },
		currentLineStyleRanges: savedLine?.styleRanges || [], currentLineFuriganaMap: new Map(),
		currentLineCharacterPronunciationMap: new Map(), currentLineRenderedPronunciationUnits: [],
		currentLineRenderedPronunciationUnitByStart: new Map(), currentLineRenderedPronunciationCoveredIndexes: new Set(),
		currentWordBoundaryStartIndexes: new Set(),
		currentGranularityRanges: [],
		usePrimaryCharacterPronunciation: false, useFixedPrimaryCharacterCells: false,
		currentRecordingCharIndex: -1, isRecordingLockArmed: false, recordingLockIndex: -1,
		recordingLockRange: null, offsetSelectionRange: null, mode: 'preview',
		currentLockedPlaybackIndex: null, syncGranularity: "character",
		formatSeconds: (value) => `${value.toFixed(1)}s`,
		getCharIndexFromPoint: () => -1,
		handleCharacterContextMenu: () => {},
		charElementsRef: { current: [] },
	});
	context.characterRefs = Array.from(text, (_, index) => element => {
		context.charElementsRef.current[index] = element;
	});
	Object.assign(context.s, {
		charSynced: { background: "synced" },
		charPlayed: { background: "progress" },
	});
	Object.assign(context, readPreviewTiming(context));
	vm.runInContext(`globalThis.currentLineCharRefs = rangesToCharRefs(activeParallelPart.ranges, currentFullLineChars, currentLineStart);
		globalThis.currentLineChars = currentLineCharRefs.map(ref => ref.char);
		globalThis.currentLineText = currentLineChars.join('');
		globalThis.renderCurrentLineCharacters = (() => {
			${slice("\tconst renderCurrentLineCharacters =", "\tconst renderParallelPartLine =")}
			return renderCurrentLineCharacters;
		})();`, context);
	context.currentLinePreviewIndex = Math.floor(context.getPreviewProgressIndexAtTime(0, initialPosition / 1000));
	context.currentLinePlayedMarks = context.getPlayedCharacters(0, initialPosition / 1000);
	const mounted = renderer.mount(targetPart, 0);
	preview.refreshCallbacks();
	preview.render();
	return { preview, context, renderer, mounted };
};

test("committed glyphs stay available for paint and hit testing when the active line changes", () => {
	let applyLayout;
	let memo;
	let memoDeps;
	let layoutDeps;
	const sameDependencies = (previous, next) => previous && next.every((value, index) => Object.is(previous[index], value));
	const react = {
		useMemo(create, deps) {
			if (!sameDependencies(memoDeps, deps)) {
				memo = create();
				memoDeps = deps;
			}
			return memo;
		},
		useLayoutEffect(effect, deps) {
			applyLayout = sameDependencies(layoutDeps, deps) ? null : effect;
			layoutDeps = deps;
		},
	};
	const refs = {
		charElementsRef: { current: [] }, charHitBoxesRef: { current: [] },
		charScrollMetricsRef: { current: [] }, lastPaintedPlaybackIndexRef: { current: 3 },
		rtlTextRunRef: { current: null },
	};
	let recordingInvalidations = 0;
	const invalidateRecordingPaint = () => recordingInvalidations++;
	const render = line => useSyncCreatorGlyphLayout({ react, line, refs, invalidateRecordingPaint });
	const glyph = left => ({
		getBoundingClientRect: () => ({ left, right: left + 8, top: 0, bottom: 10, width: 8 }),
	});
	const first = { index: 0, partId: "full", text: "ABCD", charCount: 4 };
	const firstRefs = render(first);
	firstRefs.forEach((ref, index) => ref(glyph(index * 10)));
	applyLayout();
	const hitTest = createSyncCreatorCharacterHitTesting({ refs, charCount: 4 });
	hitTest.cacheCharHitBoxes();
	assert.equal(hitTest.getCharIndexFromPoint(23, 5), 2);
	assert.equal(render(first), firstRefs, "an unchanged layout keeps the same callback refs");
	assert.equal(applyLayout, null);

	const next = { ...first, index: 1, text: "EF", charCount: 2 };
	const nextRefs = render(next);
	firstRefs.forEach(ref => ref(null));
	const mounted = [glyph(100), glyph(120)];
	nextRefs.forEach((ref, index) => ref(mounted[index]));
	applyLayout();
	assert.deepEqual(refs.charElementsRef.current, mounted);
	assert.deepEqual(refs.charHitBoxesRef.current, []);
	assert.deepEqual(refs.charScrollMetricsRef.current, []);
	assert.equal(hitTest.getCharIndexFromPoint(125, 5), 1);
	assert.equal(refs.lastPaintedPlaybackIndexRef.current, -2);
	assert.equal(recordingInvalidations, 2);

	assert.deepEqual(render({ ...next, useTextRun: true }), []);
	nextRefs.forEach(ref => ref(null));
	applyLayout();
	assert.deepEqual(refs.charElementsRef.current, []);
});

const attachRecordingPainter = (preview) => {
	const { context } = preview;
	const recording = useSyncCreatorRecordingProgress({
		react: { useCallback: context.useCallback, useEffect: () => {}, useRef: current => ({ current }) },
		mode: "record",
		line: { ...context, charCount: context.currentLineChars.length },
		refs: { ...context, lyricsScrollRef: { current: null } },
		getSyncCreatorProgressGradient: vm.runInContext("getSyncCreatorProgressGradient", context),
	});
	recording.invalidateRecordingPaint();
	context.invalidateRecordingPaint = recording.invalidateRecordingPaint;
	context.applyRecordingProgressVisual = (value) => {
		preview.recordingCalls.push(value);
		recording.applyRecordingProgressVisual(value);
	};
	preview.render({ mode: "record" });
};

test("partial speaker colors follow absolute split-vocal ranges through playback, seeks and paused polls", () => {
	const rangeColor = "#33cc99";
	const savedLine = freeze({
		start: 0, end: 5, chars: [1, 2, 2, 2, 3, 4],
		styleRanges: [{ start: 1, end: 4, speaker: "CUSTOM", "speaker-color": rangeColor }],
	});
	const targetPart = freeze(part("lead", [1, 2, 3, 4], [{ start: 0, end: 1 }, { start: 4, end: 5 }]));
	const { preview, context, renderer } = createSelectedPartPreview({ savedLine, targetPart, text: "AB--CD", initialPosition: 500 });
	const glyphs = context.charElementsRef.current;
	assert.deepEqual(Array.from(glyphs, glyph => glyph.dataset.ivSyncCreatorRangeColor), ["", rangeColor, rangeColor, ""]);
	for (const [position, expected] of [
		[500, ["synced", "synced", "synced", "synced"]],
		[1500, ["progress", "synced", "synced", "synced"]],
		[4500, ["progress", "progress", "progress", "progress"]],
		[2500, ["progress", "progress", "synced", "synced"]],
		[500, ["synced", "synced", "synced", "synced"]],
	]) {
		preview.setProgress(position);
		preview.tick();
		assert.deepEqual(colors(glyphs), [context.currentSpeakerTextColor, rangeColor, rangeColor, context.currentSpeakerTextColor]);
		assert.deepEqual(Array.from(glyphs, glyph => glyph.style.background), expected);
		const writes = renderer.styleWrites.length;
		preview.tick(10);
		assert.equal(renderer.styleWrites.length, writes, "paused range colors do not require repeated paint");
	}
	preview.dispose();
});

for (const mode of ["preview", "record"]) {
	test(`clearing one partial speaker color restores the line color during ${mode} without clearing its neighbour`, () => {
		const retainedRange = { start: 0, end: 0, speaker: "CUSTOM", "speaker-color": "#ee6699" };
		const clearedColor = "#33cc99";
		const savedLine = freeze({
			start: 0, end: 3, chars: [1, 2, 3, 4],
			styleRanges: [retainedRange, { start: 1, end: 2, speaker: "CUSTOM", "speaker-color": clearedColor }],
		});
		const targetPart = freeze(part("lead", [1, 2, 3, 4]));
		const { preview, context, renderer } = createSelectedPartPreview({ savedLine, targetPart, initialPosition: 4500 });
		if (mode === "record") {
			attachRecordingPainter(preview);
			preview.setLock(3);
		}
		preview.tick();
		const glyphs = context.charElementsRef.current;
		assert.deepEqual(colors(glyphs), ["#ee6699", clearedColor, clearedColor, context.currentSpeakerTextColor]);

		// React updates these data attributes on existing glyphs when a range's
		// speaker is cleared. Keep the old inline paint to catch stale-color reuse.
		context.currentLineStyleRanges = [retainedRange, { start: 1, end: 2, kind: "whisper" }];
		const updatedGlyphs = renderer.render(targetPart, 0).children[1].children;
		updatedGlyphs.forEach((glyph, index) => {
			glyphs[index].dataset.ivSyncCreatorRangeColor = glyph.props["data-iv-sync-creator-range-color"];
			glyphs[index].dataset.ivSyncCreatorBaseColor = glyph.props["data-iv-sync-creator-base-color"];
		});
		assert.deepEqual(Array.from(glyphs, glyph => glyph.dataset.ivSyncCreatorRangeColor), ["#ee6699", "", "", ""]);
		assert.equal(glyphs[1].style.color, clearedColor, "the painter must replace its previous range color");
		context.lastPaintedPlaybackIndexRef.current = -2;
		if (mode === "record") context.invalidateRecordingPaint();
		for (const position of [4500, 500, 2500, 4500]) {
			preview.setProgress(position);
			preview.tick();
			assert.deepEqual(colors(glyphs), ["#ee6699", ...new Array(3).fill(context.currentSpeakerTextColor)]);
		}
		assert.deepEqual(Array.from(glyphs, glyph => glyph.style.background), new Array(4).fill(mode === "record" ? SYNC_CREATOR_RECORDING_BACKGROUND : "progress"));
		assert.equal(savedLine.styleRanges[1]["speaker-color"], clearedColor, "preview paint never edits persisted styles");
		preview.dispose();
	});
}

test("rejoined overlapping vocals preserve partial speaker colors and clear stale paint per glyph", () => {
	const rangeColor = "#33cc99";
	const savedLine = freeze({
		start: 0, end: 3, chars: [1, 2, 3, 4],
		parallel: { parts: [part("a", [1, 3], [{ start: 0, end: 1 }]), part("b", [2, 4], [{ start: 2, end: 3 }])] },
		styleRanges: [{ start: 1, end: 2, speaker: "CUSTOM", "speaker-color": rangeColor }],
	});
	const targetPart = freeze(part("lead", [1, 2, 3, 4]));
	const { preview, context } = createSelectedPartPreview({ savedLine, targetPart });
	context.activeParallelPart = null;
	Object.assign(context, readPreviewTiming(context));
	context.currentLinePreviewIndex = Math.floor(context.getPreviewProgressIndexAtTime(0, 2.5));
	context.currentLinePlayedMarks = context.getPlayedCharacters(0, 2.5);
	assert.deepEqual(Array.from(context.renderCurrentLineCharacters(), glyph => glyph.props["data-iv-sync-creator-base-background"]),
		[SYNC_CREATOR_PROGRESS_BACKGROUND, SYNC_CREATOR_SYNCED_BACKGROUND, SYNC_CREATOR_PROGRESS_BACKGROUND, SYNC_CREATOR_SYNCED_BACKGROUND],
		"initial rendering must not fill an overlapping vocal early");
	preview.refreshCallbacks();
	preview.render({ activeParallelPartId: "full" });
	const glyphs = context.charElementsRef.current;
	for (const [position, expected] of [
		[2500, ["progress", "synced", "progress", "synced"]],
		[3500, ["progress", "progress", "progress", "synced"]],
		[1500, ["progress", "synced", "synced", "synced"]],
		[500, ["synced", "synced", "synced", "synced"]],
	]) {
		preview.setProgress(position);
		preview.tick();
		assert.deepEqual(Array.from(glyphs, glyph => glyph.style.background), expected);
		assert.deepEqual(colors(glyphs), [context.currentSpeakerTextColor, rangeColor, rangeColor, context.currentSpeakerTextColor]);
	}
	glyphs[1].dataset.ivSyncCreatorRangeColor = "";
	glyphs[2].dataset.ivSyncCreatorRangeColor = "";
	context.lastPaintedPlaybackIndexRef.current = -2;
	preview.tick();
	assert.deepEqual(colors(glyphs), new Array(4).fill(context.currentSpeakerTextColor));
	preview.dispose();
});

test("preview progress preserves time zero and ignores missing marks and later-starting overlapping vocals", () => {
	assert.equal(getSyncCreatorPreviewProgressIndex([null, 0, 1, undefined], 0), 1);
	assert.equal(getSyncCreatorPreviewProgressIndex([null, -1, , NaN], 2), -1);
	assert.equal(getSyncCreatorPreviewProgressIndex([3, 4, 1, 2], 1.5), 2.5);
	const timing = useSyncCreatorPreviewTiming({
		react: { useMemo: callback => callback() },
		syncData: { lines: [{ start: 0, chars: [0, null, 2, -1] }] },
		lineCharOffsets: [0],
		getRejoinedLineChars: line => line?.chars,
	});
	assert.deepEqual([0, 1, 2, 3].map(index => timing.isCharSynced(0, index)), [true, false, true, false]);
	assert.deepEqual(timing.getPlayedCharacters(0, 1), [true, false, false, false]);
});

test("recording paints retain selected range colors while parallel vocals keep their own speaker color", () => {
	const rangeColor = "#33cc99";
	const parallelColor = "#7755cc";
	const savedLine = freeze({
		start: 0, end: 3, chars: [1, 2, 3, 4],
		styleRanges: [{ start: 1, end: 2, speaker: "CUSTOM", "speaker-color": rangeColor }],
	});
	const targetPart = freeze(part("lead", [1, 2, 3, 4]));
	const { preview, context, renderer } = createSelectedPartPreview({ savedLine, targetPart, initialPosition: 500 });
	const { row } = renderer.mount(freeze(part("background", [1, 2, 3, 4], undefined, { "speaker-color": parallelColor })));
	attachRecordingPainter(preview);
	preview.setLock(3);
	for (const [position, completed] of [[500, 0], [1500, 1], [3500, 3], [4500, 4], [500, 0]]) {
		preview.setProgress(position);
		preview.tick();
		assert.deepEqual(colors(context.charElementsRef.current), [context.currentSpeakerTextColor, rangeColor, rangeColor, context.currentSpeakerTextColor]);
		assert.deepEqual(Array.from(context.charElementsRef.current, glyph => glyph.style.background),
			Array.from({ length: 4 }, (_, index) => index < completed ? SYNC_CREATOR_RECORDING_BACKGROUND : SYNC_CREATOR_SYNCED_BACKGROUND));
		assert.deepEqual(colors(row.elements), new Array(4).fill(parallelColor));
		assert.deepEqual(backgrounds(row), Array.from({ length: 4 }, (_, index) => index < completed ? "progress" : "synced"));
	}
	assert.deepEqual(preview.playbackCalls, [], "locked recording uses the production recording painter");
	assert.deepEqual(preview.recordingCalls, [-1, 0.5, 2.5, 3, -1]);
	preview.dispose();
});

test("selected split vocals preview inherited line timings and retain time labels", () => {
	const savedLine = freeze({ start: 0, end: 3, chars: [1, 2, 3, 4] });
	const targetPart = freeze(part("a", [1, 2], [{ start: 0, end: 1 }]));
	const { preview, context, mounted } = createSelectedPartPreview({ savedLine, targetPart });
	assert.equal(context.isCharSynced(0, 0), true);
	assert.equal(context.getCharSyncTime(0, 0), 1);
	assert.equal(context.getPreviewProgressIndexAtTime(0, 1.5), 0.5);
	const glyphs = mounted.tree.children[1].children;
	assert.deepEqual(glyphs.map(glyph => glyph.props["data-iv-sync-creator-synced"]), ["1", "1"]);
	assert.deepEqual(glyphs.map(glyph => glyph.children.at(-1).children[0]), ["1.0s", "2.0s"]);
	for (const [position, expected] of [
		[2000, ["progress", "progress"]],
		[500, ["synced", "synced"]],
		[1500, ["progress", "synced"]],
	]) {
		preview.setProgress(position);
		preview.tick();
		assert.deepEqual(Array.from(context.charElementsRef.current, glyph => glyph.style.background), expected);
	}
	assert.deepEqual(savedLine.chars, [1, 2, 3, 4]);
	preview.dispose();
});

test("selected merged and regrouped vocals use inherited timings after part IDs change", () => {
	const oldPart = freeze(part("old-background", [4, 5], [{ start: 2, end: 3 }]));
	const savedLine = freeze({ start: 0, end: 3, chars: [1, 2, 4, 5], parallel: { parts: [oldPart] } });
	const targetPart = freeze(part("b", [4, 5], [{ start: 2, end: 3 }]));
	const { preview, context } = createSelectedPartPreview({ savedLine, targetPart, initialPosition: 4500 });
	assert.equal(context.isCharSynced(0, 1), true);
	assert.equal(context.getCharSyncTime(0, 1), 5);
	assert.equal(context.getPreviewProgressIndexAtTime(0, 4.5), 0.5);
	preview.tick();
	assert.deepEqual(Array.from(context.charElementsRef.current, glyph => glyph.style.background), ["progress", "synced"]);
	preview.dispose();
});

test("selected vocals fall back to matching saved timings when inherited timings are absent", () => {
	const saved = freeze(part("a", [1, 2], [{ start: 0, end: 1 }]));
	const savedLine = freeze({ start: 0, end: 3, chars: [1, 2, 3, 4], parallel: { parts: [saved] } });
	const targetPart = freeze(part("a", undefined, [{ start: 0, end: 1 }]));
	const { preview, context } = createSelectedPartPreview({ savedLine, targetPart, initialPosition: 1500 });
	assert.equal(context.isCharSynced(0, 0), true);
	assert.equal(context.getCharSyncTime(0, 1), 2);
	assert.equal(context.getPreviewProgressIndexAtTime(0, 1.5), 0.5);
	preview.tick();
	assert.deepEqual(Array.from(context.charElementsRef.current, glyph => glyph.style.background), ["progress", "synced"]);
	preview.dispose();
});

test("selected unsynced, invalid and out-of-order vocals never display false playback progress", () => {
	for (const chars of [undefined, [], [1], [1, null], [1, NaN], [1, Infinity], [1, "2"], [-1, 2], [2, 1], new Array(2), [, 2]]) {
		const targetPart = part("a", chars, [{ start: 0, end: 1 }]);
		const savedLine = { start: 0, end: 3, chars: [1, 2, 3, 4], parallel: { parts: [targetPart] } };
		const { preview, context, mounted } = createSelectedPartPreview({ savedLine, targetPart });
		assert.equal(context.isCharSynced(0, 0), false, `invalid timings: ${JSON.stringify(chars)}`);
		assert.equal(context.getCharSyncTime(0, 0), null);
		assert.equal(context.getPreviewProgressIndexAtTime(0, 10), -1);
		assert.ok(mounted.tree.children[1].children.every(glyph => glyph.props["data-iv-sync-creator-synced"] === "0"));
		preview.tick();
		assert.ok(context.charElementsRef.current.every(glyph => !glyph.style.background));
		preview.dispose();
	}
});

test("selected glyphs and preview polls share validation until the vocal or saved timing changes", () => {
	let validations = 0;
	let memoIndex = 0;
	const memos = [];
	const react = {
		useMemo(callback, dependencies) {
			const index = memoIndex++;
			if (!memos[index] || dependencies.some((value, key) => !Object.is(value, memos[index].dependencies[key]))) {
				memos[index] = { value: callback(), dependencies };
			}
			return memos[index].value;
		},
	};
	const lineCharOffsets = [0];
	let activeParallelPart = part("a", [1, 2], [{ start: 0, end: 1 }]);
	const makeSyncData = (parts = []) => ({ lines: [{
		start: 0,
		get parallel() {
			validations++;
			return { parts };
		},
	}] });
	let syncData = makeSyncData();
	const render = () => {
		memoIndex = 0;
		return useSyncCreatorPreviewTiming({ react, syncData, lineCharOffsets, activeParallelPart });
	};
	for (let frame = 0; frame < 100; frame++) {
		const selected = render();
		assert.equal(selected.isCharSynced(0, 0), true);
		assert.equal(selected.getCharSyncTime(0, 1), 2);
		assert.equal(selected.getPreviewProgressIndexAtTime(0, 1.5), 0.5);
	}
	assert.equal(validations, 1, "position-only renders and per-glyph queries reuse the validated timeline");
	activeParallelPart = part("b", undefined, [{ start: 0, end: 1 }]);
	for (const [times, expected] of [[[4, 5], 4], [[6, 7], 6]]) {
		syncData = makeSyncData([part("b", times, [{ start: 0, end: 1 }])]);
		const selected = render();
		assert.equal(selected.getCharSyncTime(0, 0), expected);
		assert.equal(selected.getPreviewProgressIndexAtTime(0, 2), -1);
	}
	assert.equal(validations, 3, "target changes and saved timing updates invalidate the cached timeline");
});

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
	const lead = freeze(part("lead", [1, 2, 3, 4]));
	const savedBackground = freeze(part("saved", [4, 5, 6, 7]));
	const inheritedBackground = freeze(part("inherited", [8, 9, 10, 11]));
	const committed = buildRecordedSyncCreatorParallelParts({
		currentParts: freeze([lead, part("saved", undefined), inheritedBackground, part("unsynced", undefined)]),
		existingParts: freeze([lead, savedBackground]),
		activePartId: lead.id,
		normalizedRawChars: [20.12345, 21.23456, 22.34567, 23.45678],
		syncGranularity: "character",
	}, {
		sanitizeSyncCreatorSpeakerFallback: (_speaker, fallback) => fallback,
		sanitizeSyncCreatorSpeakerColor: (_speaker, color) => color,
		projectSyncCreatorUnitLayout: (source, target) => projectTimedUnits(source, target, () => null),
	});
	assert.deepEqual(Array.from(committed[0].chars), [20.123, 21.235, 22.346, 23.457]);
	assert.equal(committed[1].chars, savedBackground.chars);
	assert.equal(committed[2].chars, inheritedBackground.chars);
	assert.ok(!Object.hasOwn(committed[3], "chars"));
	assert.deepEqual(lead.chars, [1, 2, 3, 4]);
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

test('a temporarily unavailable editing track does not repaint either vocal at time zero', () => {
	const preview = createPreview({ initialPosition: 1300 });
	const renderer = attachParallelRenderer(preview);
	const { row } = renderer.mount(part('background', [0, 0.5, 1, 1.5]));
	const active = () => Array.from(preview.context.charElementsRef.current, element => element.style.background);
	preview.tick();
	assert.deepEqual(active(), ['progress', 'progress', 'progress', 'synced']);
	assert.deepEqual(backgrounds(row), active());
	for (const position of [undefined, null]) {
		preview.setProgress(position);
		preview.tick(3);
		assert.deepEqual(active(), ['progress', 'progress', 'progress', 'synced']);
		assert.deepEqual(backgrounds(row), active());
	}
	assert.deepEqual(preview.parallelCalls, [1.3]);
	preview.setProgress(0);
	preview.tick();
	assert.deepEqual(active(), ['progress', 'synced', 'synced', 'synced']);
	assert.deepEqual(backgrounds(row), active());
	preview.dispose();
});
