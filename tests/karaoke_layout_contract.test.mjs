import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const currentSource = readFileSync(new URL("../Pages.js", import.meta.url), "utf8");
const baselineRevision = "31ff869ec832c29c713abcc4333faee8cdbf8524";
const baselineSource = execFileSync("git", ["show", `${baselineRevision}:Pages.js`], {
	cwd: repoRoot,
	encoding: "utf8",
});

const requireSlice = (source, startMarker, endMarker, label) => {
	const start = source.indexOf(startMarker);
	const end = source.indexOf(endMarker, start + startMarker.length);
	assert.ok(start >= 0, `${label}: missing start marker ${startMarker}`);
	assert.ok(end > start, `${label}: missing end marker ${endMarker}`);
	return source.slice(start, end);
};

const normalizeResult = (value) => {
	if (value === undefined) return { type: "undefined" };
	return JSON.parse(JSON.stringify(value));
};

const assertDifferential = (label, currentValue, baselineValue) => {
	assert.deepEqual(
		normalizeResult(currentValue),
		normalizeResult(baselineValue),
		`${label}: current source drifted from v6.5.9 baseline`
	);
};

const loadCompactRetentionHelper = (source) => {
	const slice = requireSlice(
		source,
		"const shouldIncludeSyncedLineInCompactView",
		"const getActiveTimedLineIndex",
		"compact retention"
	);
	const context = vm.createContext({});
	vm.runInContext(
		`${slice}\n` +
			"globalThis.__layoutContract = { shouldIncludeSyncedLineInCompactView };",
		context
	);
	return context.__layoutContract;
};

const loadAnchorHelpers = (source) => {
	const slice = requireSlice(
		source,
		"const getLyricsAnchorRatio",
		"const prepareGlobalCharTimeline",
		"anchor and FLIP helpers"
	);
	const context = vm.createContext({
		CONFIG: { visual: {} },
		KARAOKE_VOCAL_STACK_CENTER_THRESHOLD: 4,
		react: { useLayoutEffect: undefined },
		useEffect: () => {},
		window: {
			getComputedStyle: (element) => ({
				getPropertyValue: () => element?.anchorRatio ?? "",
			}),
		},
	});
	vm.runInContext(
		`${slice}\n` +
			"globalThis.__layoutContract = {" +
			" getLyricsAnchorRatio," +
			" getElementOffsetTopWithin," +
			" getTransformTranslateY," +
			" offsetTransformVertically," +
			" getMedian," +
			" getAdaptiveLyricsCenteringTiming," +
			" getLyricsCenteringProgress," +
			" getKaraokeVocalAnchorCenterWithinLine," +
			" getActiveLineAnchorCenter," +
			" getCompactSyncedOffset" +
			" };",
		context
	);
	return context.__layoutContract;
};

const loadVocalAnchorHelpers = (source) => {
	const slice = requireSlice(
		source,
		"const getActiveKaraokeTimedCharIndex",
		"const KARAOKE_FILL_STEPS",
		"vocal anchor helpers"
	);
	const context = vm.createContext({
		console,
		toFiniteTime: (value) => {
			const numeric = Number(value);
			return Number.isFinite(numeric) ? numeric : null;
		},
		getCopyableText: (value) => {
			if (Array.isArray(value)) return value.map(String).join("");
			return value === null || value === undefined ? "" : String(value);
		},
	});
	vm.runInContext(
		`${slice}\n` +
			"globalThis.__layoutContract = {" +
			" getActiveKaraokeTimedCharIndex," +
			" getKaraokeVocalAnchorPosition," +
			" getKaraokeVocalAnchorWindowMs," +
			" getStableKaraokeVocalAnchorPosition" +
			" };",
		context
	);
	return context.__layoutContract;
};

const loadTrailingInterludeHelpers = (source) => {
	const slice = requireSlice(
		source,
		"const getTrailingKaraokeInterludeInfo",
		"const createBreakIconChildren",
		"trailing interlude helpers"
	);
	const context = vm.createContext({
		CONFIG: { visual: { "instrumental-break-auto-detect": true } },
		INTERLUDE_MIN_DURATION_MS: 500,
		KARAOKE_TRAILING_INTERLUDE_DELAY_MS: 2500,
		toFiniteTime: (value) => {
			const numeric = Number(value);
			return Number.isFinite(numeric) ? numeric : null;
		},
		getInterludeCandidateText: (line) => line?.marker ?? line?.text ?? "",
		isInterludeMarkerText: (text) => String(text ?? "") === "MARKER",
		getKaraokeLineFillEndTime: (line) => line?.fillEndTime ?? null,
		getInstrumentalBreakKind: (lineIndex, lineCount) => {
			if (lineIndex === 0) return "prelude";
			if (lineIndex === Math.max(0, lineCount - 1)) return "postlude";
			return "break";
		},
		__autoBreaks: true,
		__trackDuration: 10000,
	});
	context.isAutoInstrumentalBreakEnabled = () => context.__autoBreaks;
	context.getCurrentTrackDurationMs = () => context.__trackDuration;
	vm.runInContext(
		`${slice}\n` +
			"globalThis.__layoutContract = {" +
			" getTrailingKaraokeInterludeInfo," +
			" isTrailingKaraokeInterludePositionActive," +
			" createActiveTrailingKaraokeInterludeLine" +
			" };",
		context
	);
	return { helpers: context.__layoutContract, context };
};

const loadAllHelpers = (source) => ({
	compact: loadCompactRetentionHelper(source),
	anchor: loadAnchorHelpers(source),
	vocal: loadVocalAnchorHelpers(source),
	trailing: loadTrailingInterludeHelpers(source).helpers,
});

const current = loadAllHelpers(currentSource);
const baseline = loadAllHelpers(baselineSource);

const makeVocalRow = (startTime, endTime) => ({
	timedChars: [{ startTime, endTime }],
	bounds: { startTime, endTime },
});

const makeMeasuredVocalLine = ({ anchorPosition = "1.5", rowCount = "4" } = {}) => {
	const rowSpecs = [
		{ index: "0", top: 120, height: 20 },
		{ index: "1", top: 160, height: 20 },
		{ index: "2", top: 200, height: 20 },
		{ index: "3", top: 240, height: 20 },
	];
	const rows = rowSpecs.map(({ index, top, height }) => ({
		getAttribute: (name) => name === "data-karaoke-vocal-row-index" ? index : null,
		getBoundingClientRect: () => ({ top, height }),
	}));
	const stack = {
		getAttribute: (name) => {
			if (name === "data-karaoke-vocal-row-count") return rowCount;
			if (name === "data-karaoke-vocal-anchor-position") return anchorPosition;
			return null;
		},
		querySelectorAll: () => rows,
	};
	const line = {
		clientHeight: 160,
		offsetTop: 80,
		offsetParent: null,
		getBoundingClientRect: () => ({ top: 100, height: 160 }),
		querySelector: (selector) => selector.includes("data-karaoke-vocal-row-count") ? stack : null,
	};
	const container = {
		clientHeight: 500,
		anchorRatio: "0.5",
	};
	line.offsetParent = container;
	return { container, line, rows, stack };
};

test("retains active and visual interlude rows while excluding unrelated breaks", () => {
	const fixtures = [
		{ lineNumber: 10, interludeInfo: { isInterlude: false } },
		{ lineNumber: 11, interludeInfo: { isInterlude: true } },
	];
	const scenarios = [
		[10, 10],
		[11, 10],
		[10, 11],
		[10, 12],
	];

	for (const [activeLineIndex, visualLineIndex] of scenarios) {
		const currentResult = fixtures.map((line) => current.compact.shouldIncludeSyncedLineInCompactView(
			line,
			activeLineIndex,
			visualLineIndex
		));
		const baselineResult = fixtures.map((line) => baseline.compact.shouldIncludeSyncedLineInCompactView(
			line,
			activeLineIndex,
			visualLineIndex
		));
		assertDifferential(
			`retained-row scenario ${activeLineIndex}/${visualLineIndex}`,
			currentResult,
			baselineResult
		);
		assert.deepEqual(currentResult, [true, activeLineIndex === 11 || visualLineIndex === 11]);
	}
});

test("tracks overlapping vocal rows with the midpoint anchor and later-row window", () => {
	const rows = [
		makeVocalRow(1000, 2200),
		makeVocalRow(1200, 2600),
		makeVocalRow(1400, 2800),
		makeVocalRow(2300, 3600),
	];
	const positions = [900, 1700, 2500, 2900];

	for (const position of positions) {
		const currentResult = current.vocal.getKaraokeVocalAnchorPosition(rows, position);
		const baselineResult = baseline.vocal.getKaraokeVocalAnchorPosition(rows, position);
		assertDifferential(`vocal anchor at ${position}ms`, currentResult, baselineResult);
	}

	assert.equal(current.vocal.getKaraokeVocalAnchorPosition(rows, 900), -1);
	assert.equal(current.vocal.getKaraokeVocalAnchorPosition(rows, 1700), 1);
	assert.equal(current.vocal.getKaraokeVocalAnchorPosition(rows, 2500), 2);
	assert.equal(current.vocal.getKaraokeVocalAnchorPosition(rows, 2900), 3);
	assert.equal(current.vocal.getKaraokeVocalAnchorWindowMs(rows, 1), 200);
	assert.equal(current.vocal.getKaraokeVocalAnchorWindowMs(rows, 2), 900);
	assert.equal(current.vocal.getKaraokeVocalAnchorWindowMs(rows, 3), null);
	assertDifferential(
		"vocal anchor window",
		current.vocal.getKaraokeVocalAnchorWindowMs(rows, 1),
		baseline.vocal.getKaraokeVocalAnchorWindowMs(rows, 1)
	);
});

test("keeps the multivocal anchor monotonic during forward overlap and resets on seek", () => {
	const line = { startTime: 1000, endTime: 4000, originalText: "lead / response" };
	const run = (helper) => {
		const stateRef = { current: { lineKey: null, anchorPosition: -1, lastPlaybackPosition: NaN } };
		return [
			helper.getStableKaraokeVocalAnchorPosition(stateRef, line, 1500, 1),
			helper.getStableKaraokeVocalAnchorPosition(stateRef, line, 1700, -1),
			helper.getStableKaraokeVocalAnchorPosition(stateRef, line, 1900, 2),
			helper.getStableKaraokeVocalAnchorPosition(stateRef, line, 2100, -1),
			helper.getStableKaraokeVocalAnchorPosition(stateRef, line, 1000, 0),
		];
	};
	const currentResult = run(current.vocal);
	const baselineResult = run(baseline.vocal);
	assertDifferential("stable multivocal anchor sequence", currentResult, baselineResult);
	assert.deepEqual(currentResult, [1, 1, 2, 2, 0]);
});

test("measures the active vocal row center instead of the whole multivocal block", () => {
	const fixture = makeMeasuredVocalLine();
	const currentCenter = current.anchor.getActiveLineAnchorCenter(fixture.line);
	const baselineCenter = baseline.anchor.getActiveLineAnchorCenter(fixture.line);
	assertDifferential("multivocal measured center", currentCenter, baselineCenter);
	assert.equal(currentCenter, 90, "row 1.5 center should interpolate between measured row centers");

	const currentOffset = current.anchor.getCompactSyncedOffset(
		fixture.container,
		fixture.line,
		false
	);
	const baselineOffset = baseline.anchor.getCompactSyncedOffset(fixture.container, fixture.line, false);
	assertDifferential("compact offset from vocal center", currentOffset, baselineOffset);
	assert.equal(currentOffset, 80, "500px * 0.5 - (80px line top + 90px row center)");

	const beforeFirstRow = makeMeasuredVocalLine({ anchorPosition: null });
	assert.equal(current.anchor.getActiveLineAnchorCenter(beforeFirstRow.line), 30);
	const shortStack = makeMeasuredVocalLine({ rowCount: "3", anchorPosition: "1" });
	assert.equal(current.anchor.getActiveLineAnchorCenter(shortStack.line), 80);
});

test("bounds compact centering and FLIP timing while preserving shared row deltas", () => {
	const transitionWindows = [null, 40, 300, 1000];
	for (const transitionWindow of transitionWindows) {
		const currentTiming = current.anchor.getAdaptiveLyricsCenteringTiming(transitionWindow);
		const baselineTiming = baseline.anchor.getAdaptiveLyricsCenteringTiming(transitionWindow);
		assertDifferential(`centering timing ${transitionWindow}`, currentTiming, baselineTiming);
		const total = currentTiming.durationMs + currentTiming.maxStaggerMs;
		if (transitionWindow === null || transitionWindow <= 0 || transitionWindow >= 412) {
			assert.deepEqual(normalizeResult(currentTiming), { durationMs: 300, staggerMs: 28, maxStaggerMs: 112 });
		} else {
			assert.ok(total <= Math.max(80, transitionWindow - 24));
			assert.ok(currentTiming.durationMs >= 1);
			assert.ok(currentTiming.staggerMs >= 0);
			assert.ok(currentTiming.maxStaggerMs >= currentTiming.staggerMs);
		}
	}

	const progressSamples = [0, 0.25, 0.5, 0.75, 1].map((sample) => ({
		current: current.anchor.getLyricsCenteringProgress(sample),
		baseline: baseline.anchor.getLyricsCenteringProgress(sample),
	}));
	for (let index = 0; index < progressSamples.length; index += 1) {
		assertDifferential(
			`centering progress ${index}`,
			progressSamples[index].current,
		progressSamples[index].baseline
		);
		if (index > 0) {
			assert.ok(progressSamples[index].current >= progressSamples[index - 1].current);
		}
	}
	assert.equal(progressSamples[0].current, 0);
	assert.equal(progressSamples.at(-1).current, 1);

	const previous = ["matrix(1,0,0,1,0,10)", "matrix(1,0,0,1,0,18)", "matrix(1,0,0,1,0,27)"];
	const target = ["matrix(1,0,0,1,0,0)", "matrix(1,0,0,1,0,8)", "matrix(1,0,0,1,0,15)"];
	const deltas = previous.map((value, index) => (
		current.anchor.getTransformTranslateY(value) - current.anchor.getTransformTranslateY(target[index])
	));
	assert.deepEqual(deltas, [10, 10, 12]);
	assert.equal(current.anchor.getMedian(deltas), 10);
	assert.equal(current.anchor.offsetTransformVertically(target[1], 10), "translateY(10px) matrix(1,0,0,1,0,8)");
	assertDifferential(
		"shared FLIP delta",
		current.anchor.getMedian(deltas),
		baseline.anchor.getMedian(deltas)
	);
});

test("selects trailing karaoke gaps, previews their entry, and keeps postludes through handoff", () => {
	const line = { fillEndTime: 1000 };
	const nextLine = { startTime: 6000, text: "next lyric" };
	const currentGap = current.trailing.getTrailingKaraokeInterludeInfo(line, nextLine, 1, 3);
	const baselineGap = baseline.trailing.getTrailingKaraokeInterludeInfo(line, nextLine, 1, 3);
	assertDifferential("trailing gap selection", currentGap, baselineGap);
	assert.deepEqual(normalizeResult(currentGap), {
		isInterlude: true,
		durationMs: 2500,
		startTime: 3500,
		endTime: 6000,
		kind: "break",
		source: "karaoke-trailing-gap",
	});

	const positions = [2999, 3000, 3500, 5999, 6000];
	for (const position of positions) {
		const currentResult = current.trailing.createActiveTrailingKaraokeInterludeLine({
			line,
			nextLine,
			lineIndex: 1,
			lineCount: 3,
			position,
			isActiveLine: true,
			isKara: true,
			activationAdvanceMs: 500,
		});
		const baselineResult = baseline.trailing.createActiveTrailingKaraokeInterludeLine({
			line,
			nextLine,
			lineIndex: 1,
			lineCount: 3,
			position,
			isActiveLine: true,
			isKara: true,
			activationAdvanceMs: 500,
		});
		assertDifferential(`trailing gap at ${position}ms`, currentResult, baselineResult);
	}
	assert.equal(current.trailing.createActiveTrailingKaraokeInterludeLine({
		line,
		nextLine,
		lineIndex: 1,
		lineCount: 3,
		position: 2999,
		isActiveLine: true,
		isKara: true,
		activationAdvanceMs: 500,
	}), null);
	assert.equal(current.trailing.createActiveTrailingKaraokeInterludeLine({
		line,
		nextLine,
		lineIndex: 1,
		lineCount: 3,
		position: 3000,
		isActiveLine: true,
		isKara: true,
		activationAdvanceMs: 500,
	}).isPrecentered, true);
	assert.equal(current.trailing.createActiveTrailingKaraokeInterludeLine({
		line,
		nextLine,
		lineIndex: 1,
		lineCount: 3,
		position: 3500,
		isActiveLine: true,
		isKara: true,
		activationAdvanceMs: 500,
	}).isPrecentered, false);
	assert.equal(current.trailing.createActiveTrailingKaraokeInterludeLine({
		line,
		nextLine: { startTime: 6000, marker: "MARKER" },
		lineIndex: 1,
		lineCount: 3,
		position: 4000,
		isActiveLine: true,
		isKara: true,
	}), null);

	const trailingRuntime = loadTrailingInterludeHelpers(currentSource);
	const postludeLine = { fillEndTime: 6999 };
	const postlude = trailingRuntime.helpers.getTrailingKaraokeInterludeInfo(postludeLine, null, 2, 3);
	assert.deepEqual(normalizeResult(postlude), {
		isInterlude: true,
		durationMs: 501,
		startTime: 9499,
		endTime: 10000,
		kind: "postlude",
		source: "karaoke-trailing-gap",
	});
	assert.equal(trailingRuntime.helpers.isTrailingKaraokeInterludePositionActive(postlude, 12000), true);
	trailingRuntime.context.__autoBreaks = false;
	assert.equal(
		trailingRuntime.helpers.getTrailingKaraokeInterludeInfo(postludeLine, null, 2, 3).isInterlude,
		false
	);
});
