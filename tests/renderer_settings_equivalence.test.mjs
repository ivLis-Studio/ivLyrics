import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import vm from "node:vm";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const currentSource = readFileSync(new URL("../Pages.js", import.meta.url), "utf8");
const baselineRevision = "6bb234835b0f5762876bbe521ddf665c8f952dfa";
const baselineSource = execFileSync("git", ["show", `${baselineRevision}:Pages.js`], {
	cwd: repoRoot, encoding: "utf8",
});

const slice = (source, startMarker, endMarker) => {
	const start = source.indexOf(startMarker);
	const end = source.indexOf(endMarker, start + startMarker.length);
	assert.ok(start >= 0 && end > start, `missing renderer section: ${startMarker}`);
	return source.slice(start, end);
};
const normalize = (value) => JSON.parse(JSON.stringify(value));

// Preserve hook state across frames to detect stale caches. These tests compare
// the engine's actual LyricsLineBlock/IdlingIndicator props, not its internal
// cache shape. DOM effects and child glyph rendering are deliberately excluded;
// layout and installed-player QA remain separate checks.
const createEngine = (source) => {
	const hooks = [];
	let hookIndex = 0;
	let scrolling = false;
	let locale = "en";
	let furiganaReady = false;
	const motionPreference = { matches: false };
	const CONFIG = { visual: {
		"lines-before": 2,
		"lines-after": 2,
		"karaoke-bounce": false,
		"karaoke-line-transition": true,
		"karaoke-text-effects": true,
		"sync-data-custom-speaker-colors-enabled": true,
		"translate:display-mode": "below",
		"furigana-enabled": false,
		"instrumental-break-auto-detect": true,
	} };
	const useMemo = (build, dependencies) => {
		const index = hookIndex++;
		const previous = hooks[index];
		if (previous && dependencies && previous.dependencies
			&& dependencies.length === previous.dependencies.length
			&& dependencies.every((dependency, i) => Object.is(dependency, previous.dependencies[i]))) {
			return previous.value;
		}
		const value = build();
		hooks[index] = { value, dependencies };
		return value;
	};
	const useRef = (value) => useMemo(() => ({ current: value }), []);
	const useState = (initial) => {
		const slot = useRef(typeof initial === "function" ? initial() : initial);
		return [slot.current, (next) => {
			slot.current = typeof next === "function" ? next(slot.current) : next;
		}];
	};
	const react = {
		useMemo, useRef, useState,
		useCallback: (callback, dependencies) => useMemo(() => callback, dependencies),
		useEffect: () => {}, useLayoutEffect: () => {},
		createElement: (tag, props, ...children) => ({ tag, props, children }),
	};
	const Utils = {
		getDetectedLanguage: () => locale,
		applyFuriganaIfEnabled: (text) => CONFIG.visual["furigana-enabled"] && furiganaReady
			? `<ruby>${text}<rt>${locale}:reading</rt></ruby>` : text,
	};
	const window = {
		Utils,
		FuriganaConverter: { isAvailable: () => furiganaReady },
		matchMedia: () => motionPreference,
		LyricsWordSegmenter: { segmentGraphemes: (text, language) => Array.from(
			new Intl.Segmenter(language === "auto" ? undefined : language, { granularity: "grapheme" }).segment(text),
			(entry) => entry.segment,
		) },
	};
	const track = { duration: { milliseconds: 18000 } };
	const context = vm.createContext({
		console, CONFIG, Utils, window, react,
		...react,
		Spicetify: { Player: { data: { item: track } } },
		Element: class Element { animate() {} },
		useScrollActivity: () => ({ isScrolling: scrolling, handleContainerClick: null }),
		LyricsLineBlock: "LyricsLineBlock", IdlingIndicator: "IdlingIndicator",
	});
	const helperCounterMarker = "const getKaraokeLineFillEndTime = (line) => {";
	assert.ok(source.includes(helperCounterMarker), "fill-bound instrumentation requires the public helper entrypoint");
	const instrumentedSource = source.replace(helperCounterMarker,
		`${helperCounterMarker}\nglobalThis.fillBoundsCalls += 1;`);
	context.fillBoundsCalls = 0;
	vm.runInContext([
		slice(source, "const emptyLine", "function renderLyricsUnavailable"),
		slice(source, "const buildLyricDisplayState", "const getFiniteLyricsStyleNumber"),
		slice(instrumentedSource, "const getCurrentTrackDurationMs", "const createBreakIconChildren"),
		slice(source, "const getLyricsAnchorRatio", "const KARAOKE_FILL_CORRECTION_DEFAULT_POINTS"),
		slice(source, "const getKaraokeLineBounds", "const KARAOKE_FILL_STEPS"),
		slice(source, "const buildPreparedSyncedLyrics", "const LyricsLineBlock"),
		slice(source, "const renderLyricsItems", "// Global animation manager"),
		"globalThis.engineApi = { useSyncedLyricsEngine, renderLyricsItems };",
	].join("\n"), context);
	const containerRef = { current: null };
	const activeLineRef = { current: null };
	return {
		CONFIG, window, motionPreference,
		setScrolling: (value) => { scrolling = value; },
		setLocale: (value) => { locale = value; },
		setFuriganaReady: (value) => { furiganaReady = value; },
		setTrackDuration: (value) => { track.duration.milliseconds = value; },
		getFillBoundsCalls: () => context.fillBoundsCalls,
		resetFillBoundsCalls: () => { context.fillBoundsCalls = 0; },
		render: (lyrics, position, options = {}, raw = false) => {
			hookIndex = 0;
			const props = {
				lyrics, position, compact: true, isKara: true,
				containerRef, activeLineRef, lyricsId: "test-track", settingsRevision: 0,
				...options,
			};
			const result = context.engineApi.useSyncedLyricsEngine(props);
			const output = {
				isScrolling: result.isScrolling,
				activeLineIndex: result.activeLineIndex,
				activeLyricIndex: result.activeLyricIndex,
				elements: context.engineApi.renderLyricsItems({
					items: result.renderItems, isKara: props.isKara, position,
					activeLineRef, settingsRevision: props.settingsRevision,
					karaokeRenderGranularity: options.karaokeRenderGranularity || "character",
				}),
			};
			if (raw) return output;
			const comparable = normalize(output);
			if (props.compact && !props.isKara && !scrolling && !motionPreference.matches) {
				// Normal compact rows now delegate movement to WAAPI. Verify that
				// intentional routing change, then compare every remaining row prop.
				for (const element of comparable.elements) {
					const style = element.props?.style;
					if (!style || !Object.hasOwn(style, "--line-shift-duration")) continue;
					assert.equal(style["--line-shift-duration"], source === currentSource ? "0s" : "var(--iv-lyrics-centering-duration, 300ms)");
					style["--line-shift-duration"] = "verified-motion-route";
				}
			}
			return comparable;
		},
	};
};

const lyric = (startTime, endTime, text, extra = {}) => ({
	startTime, endTime, text, originalText: text,
	syllables: [{ text, startTime, endTime }], ...extra,
});
const makeLyrics = () => [
	lyric(1000, 3100, "First vocal", {
		kind: "wave", speaker: "CUSTOM", "speaker-color": "#aabbcc", "speaker-fallback": "FEMALE 1",
		phoneticText: "first reading", translationText: "first meaning",
	}),
	lyric(2400, 3400, "Overlapping response", { speaker: "MALE 2", kind: "glow" }),
	lyric(3400, 4700, "Inline styled voice", {
		kind: "echo", syllables: [{ text: "Inline styled voice", startTime: 3400, endTime: 4700,
			inlineStyle: true, styleKind: "sparkle", styleSpeaker: "FEMALE 2" }],
	}),
	lyric(8000, 9400, "日本語の声", { phonetic: "nihongo no koe", translation: "Japanese voice" }),
	lyric(10500, 11400, "♪"),
	lyric(12000, 13300, "Final vocal", { text2: "last meaning", culturalNote: "A cultural note" }),
];

const pair = () => [createEngine(currentSource), createEngine(baselineSource)];
const compare = (engines, lyrics, position, options = {}, label = "") => {
	const actual = engines[0].render(lyrics, position, options);
	assert.deepEqual(actual, engines[1].render(lyrics, position, options), `${label} at ${position}`);
	return actual;
};
const sourceElement = (result, text) => result.elements.find((element) => element.props.line?.text === text);

test("renderer output preserves overlapping vocals, precentering, release and interludes across playback and seeks", () => {
	const lyrics = makeLyrics();
	for (const compact of [false, true]) {
		for (const bounce of [false, true]) {
			const engines = pair();
			engines.forEach((engine) => { engine.CONFIG.visual["karaoke-bounce"] = bounce; });
			for (const position of [0, 700, 1000, 1016, 1032, 2100, 2400, 2700, 3100, 3399,
				3400, 4700, 5100, 6900, 7200, 7700, 8000, 9400, 10500, 12000, 15800, 18000, 1000, 8000]) {
				compare(engines, lyrics, position, { compact }, `compact=${compact}, bounce=${bounce}`);
			}
		}
	}
	const engines = pair();
	const overlap = compare(engines, lyrics, 2700);
	assert.equal(sourceElement(overlap, "First vocal").props.isActive, true);
	assert.equal(sourceElement(overlap, "Overlapping response").props.isActive, true);
	assert.equal(sourceElement(overlap, "Final vocal").props.position, 0);
});

test("manual scrolling and return to auto-follow preserve all row props on consecutive playback frames", () => {
	const engines = pair();
	const lyrics = makeLyrics();
	compare(engines, lyrics, 2300);
	for (const scrolling of [true, false, true, false]) {
		engines.forEach((engine) => engine.setScrolling(scrolling));
		for (const position of [2300, 2316, 2332, 2400, 3200, 3400, 7200]) {
			const result = compare(engines, lyrics, position, {}, `scrolling=${scrolling}`);
			if (scrolling) {
				assert.ok(result.elements.every((element) => element.props.hiddenFromAccessibility !== true));
				assert.ok(result.elements.some((element) => element.props.seekTime === 12000));
			}
		}
	}
});

test("manual playback frames keep unchanged row presentation props reusable by React.memo", () => {
	const current = createEngine(currentSource);
	const baseline = createEngine(baselineSource);
	const lyrics = makeLyrics();
	current.setScrolling(true);
	baseline.setScrolling(true);
	const first = current.render(lyrics, 1500, {}, true);
	const original = baseline.render(lyrics, 1500, {}, true);
	const initialStyles = new Map(first.elements.map((element) => [element.props.key, element.props.style]));
	for (let frame = 1; frame <= 12; frame++) {
		const position = 1500 + frame * 16;
		const next = current.render(lyrics, position, {}, true);
		assert.deepEqual(normalize(next), baseline.render(lyrics, position));
		for (const element of next.elements) {
			assert.equal(element.props.style, initialStyles.get(element.props.key), `style changed for ${element.props.key}`);
		}
	}
	assert.notEqual(original.elements[0].props.style,
		baseline.render(lyrics, 1710, {}, true).elements[0].props.style,
		"the frozen baseline must exercise the original repeated style allocation");
});

test("changing the compact line window while paused matches a freshly mounted renderer", () => {
	const current = createEngine(currentSource);
	const lyrics = makeLyrics();
	current.render(lyrics, 8500);
	for (const [before, after] of [[0, 1], [1, 3], [4, 6], [2, 2]]) {
		const baseline = createEngine(baselineSource);
		for (const engine of [current, baseline]) {
			engine.CONFIG.visual["lines-before"] = before;
			engine.CONFIG.visual["lines-after"] = after;
		}
		assert.deepEqual(current.render(lyrics, 8500, { settingsRevision: before + after }),
			baseline.render(lyrics, 8500, { settingsRevision: before + after }), `window ${before}/${after}`);
	}
});

test("a zero-time first lyric refreshes the compact prelude when advancing and seeking within its row", () => {
	const engines = pair();
	const lyrics = [lyric(0, 5000, "Immediate first lyric"), lyric(6000, 9000, "Next lyric")];
	for (const position of [0, 17, 0, 17]) {
		const result = compare(engines, lyrics, position, { compact: true, isKara: false });
		const hasPrelude = result.elements.some((element) => element.tag === "IdlingIndicator");
		assert.equal(hasPrelude, position === 0, "the prelude boundary must update even while the active line index stays unchanged");
	}
});

test("effect, reduced-motion and creator-color settings refresh cached rows with settings revisions", () => {
	const engines = pair();
	const lyrics = makeLyrics();
	let revision = 0;
	const render = () => compare(engines, lyrics, 1500, { settingsRevision: revision++ });
	let result = render();
	assert.equal(sourceElement(result, "First vocal").props.style["--lyrics-color-active"], "#aabbcc");
	for (const scrolling of [false, true]) {
		engines.forEach((engine) => engine.setScrolling(scrolling));
		for (const enabled of [false, true]) {
			engines.forEach((engine) => {
				engine.CONFIG.visual["karaoke-text-effects"] = enabled;
				engine.CONFIG.visual["sync-data-custom-speaker-colors-enabled"] = enabled;
			});
			result = render();
			assert.equal(sourceElement(result, "First vocal").props.className.includes("text-effects-disabled"), !enabled);
			assert.equal(sourceElement(result, "First vocal").props.style["--lyrics-color-active"], enabled ? "#aabbcc" : undefined);
			compare(engines, lyrics, 1516, { settingsRevision: revision - 1 });
		}
	}
	for (const reduced of [true, false]) {
		engines.forEach((engine) => { engine.motionPreference.matches = reduced; });
		result = render();
		assert.equal(sourceElement(result, "First vocal").props.className.includes("text-effects-disabled"), reduced);
	}
	for (const reduced of [true, false]) {
		engines.forEach((engine) => { engine.CONFIG.visual["reduce-motion"] = reduced; });
		result = render();
		assert.equal(sourceElement(result, "First vocal").props.className.includes("text-effects-disabled"), reduced);
	}
});

test("speaker helper replacement and changed helper functions refresh visible colors and classes", () => {
	const engines = pair();
	const lyrics = makeLyrics();
	compare(engines, lyrics, 1500);
	const contractKey = Symbol.for("ivLyrics.speakerColors.classNameContract");
	for (let revision = 1; revision <= 3; revision++) {
		engines.forEach((engine) => {
			const helper = revision === 1 ? {} : engine.window.ivLyricsSpeakerColors;
			helper.getPresentation = () => ({ speakerClass: `custom-class-${revision}`, creatorColor: `#${revision}02030` });
			helper[contractKey] = {
				getPresentation: helper.getPresentation,
				getClassName: () => `contract-class-${revision}`,
			};
			engine.window.ivLyricsSpeakerColors = helper;
		});
		const result = compare(engines, lyrics, 1500 + revision * 16, { settingsRevision: revision });
		const first = sourceElement(result, "First vocal");
		assert.ok(first.props.className.includes(`speaker-contract-class-${revision}`));
		assert.equal(first.props.style["--lyrics-color-active"], `#${revision}02030`);
	}
});

test("live motion and speaker preferences invalidate presentation without requiring a revision increment", () => {
	const current = createEngine(currentSource);
	const lyrics = makeLyrics();
	let creatorEnabled = true;
	const makeHelper = () => ({
		isCreatorColorEnabled: () => creatorEnabled,
		getPresentation: () => ({ speakerClass: "live-speaker", creatorColor: creatorEnabled ? "#123456" : "" }),
	});
	current.window.ivLyricsSpeakerColors = makeHelper();
	current.render(lyrics, 1500);
	for (const [effects, reduced, creator] of [[false, false, false], [true, true, true], [true, false, false], [true, false, true]]) {
		creatorEnabled = creator;
		const baseline = createEngine(baselineSource);
		baseline.window.ivLyricsSpeakerColors = makeHelper();
		for (const engine of [current, baseline]) {
			engine.CONFIG.visual["karaoke-text-effects"] = effects;
			engine.motionPreference.matches = reduced;
		}
		// Fresh baseline is the intended visible state: its old style memo can
		// otherwise retain colors when only the helper's live preference changes.
		assert.deepEqual(current.render(lyrics, 1500), baseline.render(lyrics, 1500));
	}
	const baseline = createEngine(baselineSource);
	current.window.ivLyricsSpeakerColors.getPresentation = () => ({ speakerClass: "updated-live-speaker", creatorColor: "#abcdef" });
	baseline.window.ivLyricsSpeakerColors = current.window.ivLyricsSpeakerColors;
	assert.deepEqual(current.render(lyrics, 1500), baseline.render(lyrics, 1500));
});

test("translation mode, furigana readiness and language changes preserve current displayed text", () => {
	const engines = pair();
	const lyrics = makeLyrics();
	let revision = 0;
	const render = () => compare(engines, lyrics, 8500, { isKara: false, settingsRevision: revision++ });
	for (const mode of ["below", "replace", "none", "below"]) {
		engines.forEach((engine) => { engine.CONFIG.visual["translate:display-mode"] = mode; });
		const first = sourceElement(render(), "First vocal").props;
		assert.equal(first.mainText, mode === "replace" ? "first reading" : "First vocal");
		assert.equal(first.subText2, mode === "below" ? "first meaning" : null);
	}
	engines.forEach((engine) => { engine.CONFIG.visual["furigana-enabled"] = true; });
	assert.equal(sourceElement(render(), "日本語の声").props.mainText, "日本語の声");
	engines.forEach((engine) => engine.setFuriganaReady(true));
	assert.match(sourceElement(render(), "日本語の声").props.mainText, /<rt>en:reading<\/rt>/);
	engines.forEach((engine) => engine.setLocale("ja"));
	assert.match(sourceElement(render(), "日本語の声").props.mainText, /<rt>ja:reading<\/rt>/);
	engines.forEach((engine) => { engine.CONFIG.visual["furigana-enabled"] = false; });
	assert.equal(sourceElement(render(), "日本語の声").props.mainText, "日本語の声");
});

test("replaced lyrics, song identities and settings revisions do not retain stale row text or timing", () => {
	const engines = pair();
	let lyrics = makeLyrics();
	compare(engines, lyrics, 1500);
	lyrics = lyrics.map((line, index) => index ? line : {
		...line, translationText: "updated meaning", "speaker-color": "#102030",
	});
	let result = compare(engines, lyrics, 1516, { settingsRevision: 1 });
	assert.equal(sourceElement(result, "First vocal").props.subText2, "updated meaning");
	assert.equal(sourceElement(result, "First vocal").props.style["--lyrics-color-active"], "#102030");
	lyrics = [lyric(500, 1600, "Replacement song", { translation: "New song translation" })];
	result = compare(engines, lyrics, 516, { lyricsId: "replacement-track", settingsRevision: 2 });
	assert.ok(sourceElement(result, "Replacement song"));
	assert.equal(sourceElement(result, "First vocal"), undefined);
	assert.equal(sourceElement(result, "Replacement song").props.seekTime, 500);
	for (const karaokeRenderGranularity of ["word", "character"]) {
		compare(engines, lyrics, 532, { lyricsId: "replacement-track", settingsRevision: 3, karaokeRenderGranularity });
	}
});

test("paused auto-interlude toggles refresh immediately without stale trailing markers", () => {
	const current = createEngine(currentSource);
	const lyrics = makeLyrics();
	current.render(lyrics, 7200);
	for (const enabled of [false, true, false, true]) {
		const baseline = createEngine(baselineSource);
		for (const engine of [current, baseline]) {
			engine.CONFIG.visual["instrumental-break-auto-detect"] = enabled;
		}
		const result = current.render(lyrics, 7200);
		assert.deepEqual(result, baseline.render(lyrics, 7200));
		assert.equal(result.elements.some((element) => element.props.line?.isVirtualTrailingInterlude), enabled);
	}
});

test("a late track duration refreshes the last explicit marker while playback is paused", () => {
	const current = createEngine(currentSource);
	const lyrics = [lyric(1000, 2500, "Song"), { startTime: 3000, text: "♪" }];
	current.setTrackDuration(0);
	current.render(lyrics, 4000, { isKara: false });
	for (const duration of [12000, 18000]) {
		const baseline = createEngine(baselineSource);
		for (const engine of [current, baseline]) engine.setTrackDuration(duration);
		const result = current.render(lyrics, 4000, { isKara: false });
		assert.deepEqual(result, baseline.render(lyrics, 4000, { isKara: false }));
		assert.equal(sourceElement(result, "♪").props.line.interludeInfo.durationMs, duration - 3000);
	}
});

test("repeated playback reuses prepared trailing-interlude bounds in automatic and manual views", () => {
	const lyrics = makeLyrics();
	for (const scrolling of [false, true]) {
		const engines = pair();
		engines.forEach((engine) => engine.setScrolling(scrolling));
		compare(engines, lyrics, 1500);
		engines.forEach((engine) => engine.resetFillBoundsCalls());
		for (let frame = 1; frame <= 10; frame++) {
			compare(engines, lyrics, 1500 + frame * 16);
		}
		assert.equal(engines[0].getFillBoundsCalls(), 0, `bounds recomputed while scrolling=${scrolling}`);
		assert.ok(engines[1].getFillBoundsCalls() >= 10, "frozen baseline must exercise repeated fill-bound computation");
	}
});

test("prepared interludes wait for an earlier long vocal while a later response has finished", () => {
	const lyrics = [
		lyric(1000, 9000, "Long preceding vocal", {
			vocals: {
				lead: { syllables: [{ text: "Lead", startTime: 1000, endTime: 8000 }] },
				background: [{ syllables: [{ text: "Echo", startTime: 2000, endTime: 9000 }] }],
			},
		}),
		lyric(2000, 2500, "Short response"),
		lyric(15000, 17000, "Next verse"),
	];
	for (const scrolling of [false, true]) {
		const engines = pair();
		engines.forEach((engine) => {
			engine.setScrolling(scrolling);
			engine.CONFIG.visual["karaoke-bounce"] = true;
		});
		for (const position of [2300, 3000, 6000, 9000, 10000, 11199, 11200, 11500, 15000]) {
			const result = compare(engines, lyrics, position);
			if (position < 11200) {
				assert.equal(result.elements.some((element) => element.props.line?.isVirtualTrailingInterlude), false);
			}
			if (position === 11500) {
				assert.equal(result.elements.find((element) => element.props.line?.isVirtualTrailingInterlude)?.props.line.startTime, 11500);
			}
		}
	}
});
