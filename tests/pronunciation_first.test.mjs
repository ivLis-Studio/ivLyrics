import { bundleInitializer } from "./fixtures/initializer-bundle.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { createAIAddonManager } from "../src/providers/ai/createAIAddonManager.mjs";
import { buildTimedPronunciationPrompt } from "../src/providers/ai/pronunciationPolicy.mjs";
import { createLyricsViewClock } from "../src/lyrics/lyricsPlaybackView.mjs";
import { getSettingDefaultValue } from "../src/features/settings/settingsDefaults.mjs";
import { renderLyricsPageToolbar } from "../src/lyrics/lyricsPageToolbarView.mjs";
import { createPagePronunciationPresentation } from "../src/lyrics/createPagePronunciationPresentation.mjs";
import { KARAOKE } from "../src/lyrics/lyricsRenderModes.mjs";

const source = bundleInitializer(new URL("../src/lyrics/PronunciationFirst.js", import.meta.url));
const plain = (value) => JSON.parse(JSON.stringify(value));

const load = ({ enabled = true, synced = true, manager = null, cache = new Map() } = {}) => {
	const events = [];
	const storage = new Map();
	const listeners = new Map();
	const window = {
		CONFIG: { visual: { "pronunciation-first": enabled, "synced-pronunciation": synced } },
		addEventListener: (type, listener) => listeners.set(type, [...(listeners.get(type) || []), listener]),
		dispatchEvent: (event) => {
			events.push(event);
			(listeners.get(event.type) || []).forEach((listener) => listener(event));
		},
		AIAddonManager: manager,
		LyricsService: {
			extractTrackId: (uri) => String(uri).split(":").pop(),
			getWordSupplements: async (...args) => cache.get(args.join("|")) ?? null,
			cacheWordSupplements: async (...args) => { cache.set(args.slice(0, 5).join("|"), args[5]); return true; },
		},
	};
	const context = vm.createContext({
		window,
		CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
		localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
		console: { warn: () => {}, log: () => {} },
		AbortController,
		setTimeout,
	});
	vm.runInContext(source, context);
	return { api: window.ivLyricsPronunciationFirst, window, events, storage };
};

const syllable = (text, startTime, endTime) => ({ text, startTime, endTime });
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

test("pronunciation-first, its lead and AI timing belong to synced pronunciation", async () => {
	let requests = 0;
	const manager = { generateTimedPronunciation: async () => { requests += 1; return new Map(); } };
	const { api, window, events } = load({ enabled: true, synced: false, manager });
	assert.equal(api.isSyncedEnabled(), false);
	assert.equal(api.isEnabled(), false, "a stored pronunciation-first stays off without synced pronunciation");
	assert.equal(api.needsTiming(), false);
	api.setDisplayed(true);
	assert.equal(api.getLeadMs(), 0);
	const lines = [{ originalText: "忘れて", phoneticText: "와스레테", syllables: [syllable("忘", 0, 1), syllable("れ", 1, 2), syllable("て", 2, 3)] }];
	assert.equal(api.ensureTimed({ trackUri: "spotify:track:abc", lines }), null);
	await new Promise((resolve) => setTimeout(resolve, 0));
	assert.equal(requests, 0);

	window.CONFIG.visual["synced-pronunciation"] = true;
	window.dispatchEvent({ type: "ivLyrics", detail: { type: "config", name: "synced-pronunciation", value: true } });
	assert.equal(api.isEnabled(), true, "the stored choice returns with synced pronunciation");
	assert.equal(api.getLeadMs(), api.LEAD_MS);
	assert.equal(events.filter((event) => event.type === api.CHANGED_EVENT).at(-1)?.detail.enabled, true,
		"the settings change refreshes the displays");
});

test("the lyrics toolbar shows pronunciation-first only with synced pronunciation", () => {
	const render = (enabled, displayMode1, displayMode2) => renderLyricsPageToolbar({
		react: { createElement: (_type, props) => props },
		state: {}, visual: {}, modeKeys: {},
		getContentTopOffset: () => 0, isModeAvailable: () => false, canToggleFullscreen: () => true,
		pronunciation: {
			pronunciationFirstApi: { isSyncedEnabled: () => enabled, isEnabled: () => enabled },
			displayMode1, displayMode2,
		},
		track: {}, sync: {}, video: { getIvLyricsTrackBackgroundMode: () => null },
	});
	assert.equal(render(false, "gemini_romaji", "none").showPronunciationFirst, false);
	assert.equal(render(true, "none", "none").showPronunciationFirst, false);
	assert.equal(render(true, "gemini_romaji", "none").showPronunciationFirst, true);
	assert.equal(render(true, "none", "gemini_romaji").showPronunciationFirst, true);
	assert.equal(getSettingDefaultValue("synced-pronunciation"), false);
	const playback = readFileSync(new URL("../src/features/settings/settingsPlaybackTabs.mjs", import.meta.url), "utf8");
	assert.match(playback, /key: "synced-pronunciation",\s*type: ConfigSlider/);
	assert.match(playback, /key: "pronunciation-karaoke-fill",\s*type: ConfigSlider,[^}]*when: \(\) => getVisualSettings\(\)\["synced-pronunciation"\] === true/);
});

test("non-karaoke lines swap the original and pronunciation values only", () => {
	const { api } = load();
	const lines = [
		{ startTime: 1000, originalText: "今日は", phoneticText: "쿄우와", text: "쿄우와", text2: "오늘은", translationText: "오늘은" },
		{ startTime: 2000, originalText: "Hello", phoneticText: null, text: null, text2: "안녕" },
	];
	const swapped = api.applyToLines(lines, { karaoke: false });
	assert.equal(swapped[0].originalText, "쿄우와");
	assert.equal(swapped[0].phoneticText, "今日は");
	assert.equal(swapped[0].text, "今日は");
	assert.equal(swapped[0].text2, "오늘은");
	assert.equal(swapped[0].startTime, 1000);
	assert.equal(swapped[0].pronunciationFirst, true);
	assert.equal(swapped[1], lines[1], "lines without a pronunciation keep their identity");
	assert.equal(lines[0].originalText, "今日は", "the stored lines are not mutated");
	assert.equal(api.applyToLines(lines, { karaoke: false }), swapped, "unchanged input returns the same display array");
});

test("replacement display keeps non-karaoke lines as they are", () => {
	const { api } = load();
	const lines = [{ originalText: "今日は", phoneticText: "쿄우와", text: "쿄우와" }];
	assert.equal(api.applyToLines(lines, { karaoke: false, lineLevel: false }), lines);
});

test("karaoke syllables keep their timing and carry the pronunciation", () => {
	const { api } = load();
	const line = {
		startTime: 1000,
		originalText: "忘れて",
		phoneticText: "와스레테",
		text: "와스레테",
		syllables: [syllable("忘", 1000, 1400), syllable("れ", 1400, 1600), syllable("て", 1600, 2000)],
	};
	const timed = new Map([["0:line", ["와스", "레", "테"]]]);
	const [swapped] = api.applyToLines([line], { karaoke: true, timed });
	assert.deepEqual(plain(swapped.syllables), [syllable("와스", 1000, 1400), syllable("레", 1400, 1600), syllable("테", 1600, 2000)]);
	assert.equal(swapped.originalText, "와스레테");
	assert.equal(swapped.phoneticText, "忘れて");
	const [approximate] = api.applyToLines([line], { karaoke: true, timed: null });
	assert.equal(approximate.syllables.map((item) => item.text).join(""), "와스레테");
	assert.deepEqual(approximate.syllables.map((item) => item.startTime), [1000, 1400, 1600]);
});

test("a malformed AI result falls back to the proportional split", () => {
	const { api } = load();
	const line = { originalText: "ab", phoneticText: "XY", syllables: [syllable("a", 0, 1), syllable("b", 1, 2)] };
	const [swapped] = api.applyToLines([line], { karaoke: true, timed: new Map([["0:line", ["XY"]]]) });
	assert.deepEqual(swapped.syllables.map((item) => item.text), ["X", "Y"]);
});

test("distribution follows unit length and keeps spaces with the preceding part", () => {
	const { api } = load();
	assert.deepEqual(plain(api.distribute(["忘", "れ", "て", " ", "し"], "wasure te shi")), ["was", "ure ", "te ", "", "shi"]);
	assert.deepEqual(plain(api.distribute(["...", "!"], "abc")), ["abc", ""]);
	assert.deepEqual(plain(api.normalizeParts(["a ", " b", "", "c "], 4)), ["a ", "b", "", "c"]);
});

test("parallel vocal parts swap per part and do not repeat the line original", () => {
	const { api } = load();
	const line = {
		originalText: "lead echo",
		phoneticText: "리드 에코",
		vocals: {
			lead: { text: "lead", phonetic: "리드", syllables: [syllable("lead", 0, 500)] },
			background: [{ text: "echo", phonetic: "에코", syllables: [syllable("echo", 100, 900)] }],
		},
	};
	const [swapped] = api.applyToLines([line], { karaoke: true });
	assert.equal(swapped.vocals.lead.text, "리드");
	assert.equal(swapped.vocals.lead.phonetic, "lead");
	assert.equal(swapped.vocals.lead.syllables[0].text, "리드");
	assert.equal(swapped.vocals.background[0].phonetic, "echo");
	assert.equal(swapped.vocals.background[0].syllables[0].startTime, 100);
	assert.equal(swapped.phoneticText, undefined);
	assert.equal(line.vocals.lead.text, "lead");
});

test("the mode is persisted and announced", () => {
	const { api, window, events } = load({ enabled: false });
	assert.equal(api.isEnabled(), false);
	assert.equal(api.toggle(), true);
	assert.equal(window.CONFIG.visual["pronunciation-first"], true);
	assert.ok(events.some((event) => event.type === api.CHANGED_EVENT && event.detail.enabled === true));
});

test("the lyric clock reads 200 ms ahead only while pronunciation first is shown", () => {
	const { api } = load({ enabled: true });
	assert.equal(api.getLeadMs(), 0, "nothing shown yet");
	api.setDisplayed(true);
	assert.equal(api.getLeadMs(), 200);
	api.setEnabled(false);
	assert.equal(api.getLeadMs(), 0, "the mode is off");
	api.setEnabled(true);
	api.setDisplayed(false);
	assert.equal(api.getLeadMs(), 0, "pronunciation is not shown first");
});

test("the page and panel clocks add the lead outside the sync offsets", () => {
	const pages = readFileSync(new URL("../src/lyrics/Pages.js", import.meta.url), "utf8");
	const panel = readFileSync(new URL("../src/lyrics/createNowPlayingLyricsView.mjs", import.meta.url), "utf8");
	assert.match(pages, /getPronunciationLead: \(\) => readPagePronunciationFirst\(window\)\?\.getLeadMs\?\.\(\)/);
	const { api } = load({ enabled: true });
	const clock = createLyricsViewClock({
		getSafePlayerProgress: () => 5000,
		getSnapshot: () => ({ position: 5000, isPlaying: false }),
		getDelay: () => 25,
		getPronunciationLead: api.getLeadMs,
		readGlobalOffset: () => -100,
	});
	clock.updateOffsets(50, -100);
	assert.equal(clock.getDiscretePosition(50, -100), 4975);
	assert.equal(clock.getFrameAlignedLyricsPlaybackPosition(), 4975);
	const lyrics = [{
		startTime: 1000, originalText: "忘れ", phoneticText: "와스레", text: "와스레",
		syllables: [syllable("忘", 1000, 1400), syllable("れ", 1400, 1800)],
	}];
	const presentation = createPagePronunciationPresentation({
		readApi: () => api, readDisplayMode: () => "line",
	});
	const options = {
		lyricsState: { uri: "spotify:track:abc", currentLyrics: lyrics },
		mode: KARAOKE, displayMode1: "gemini_romaji",
	};
	const rendered = presentation.render(options);
	assert.equal(rendered.lyrics[0].originalText, "와스레");
	assert.equal(rendered.needsTiming, true);
	assert.equal(presentation.render(options).lyrics, rendered.lyrics);
	assert.equal(clock.getDiscretePosition(50, -100), 5175);
	assert.equal(clock.getFrameAlignedLyricsPlaybackPosition(), 5175);
	const editorLyrics = [{ text: "忘れ" }];
	assert.deepEqual(presentation.render({ ...options, syncCreatorLyrics: editorLyrics }), {
		lyrics: editorLyrics,
		needsTiming: false,
	});
	assert.equal(clock.getDiscretePosition(50, -100), 4975);
	assert.match(panel, /pronunciationLead: \(\) => playback\.pronunciationLead/);
});

test("the page times only the current committed pronunciation revision", () => {
	const timers = new Set();
	const calls = [];
	let state = { uri: "spotify:track:abc", currentLyrics: [{ text: "before" }] };
	const presentation = createPagePronunciationPresentation({
		readApi: () => ({ ensureTimed: (request) => calls.push(request) }),
		readState: () => state,
		isMounted: () => true,
		getTargetLanguage: () => "ko", getSourceLanguage: () => "ja", getNotation: () => "translation",
		scheduleTimer: (callback, delay) => {
			assert.equal(delay, 700);
			timers.add(callback);
			return callback;
		},
		cancelTimer: (callback) => timers.delete(callback),
	});
	const flushTimers = () => {
		for (const callback of timers) {
			timers.delete(callback);
			callback();
		}
	};

	presentation.scheduleTiming(state);
	presentation.scheduleTiming(state);
	assert.equal(timers.size, 1);
	state = { ...state, uri: "spotify:track:def", currentLyrics: [{ text: "after" }], isPhoneticLoading: true };
	flushTimers();
	presentation.scheduleTiming(state);
	assert.deepEqual(calls, []);
	assert.equal(timers.size, 0);

	state = { ...state, isPhoneticLoading: false, karaokeSource: "line-timing-pseudo" };
	presentation.scheduleTiming(state);
	assert.equal(timers.size, 0);
	state = { ...state, karaokeSource: "lrcred" };
	presentation.scheduleTiming(state);
	flushTimers();
	presentation.scheduleTiming(state);
	assert.equal(timers.size, 0);
	assert.deepEqual(calls, [{
		trackUri: state.uri, lines: state.currentLyrics, karaokeSource: "lrcred",
		targetLang: "ko", sourceLang: "ja", notation: "translation",
		consumer: "page",
	}]);
	presentation.invalidateTiming();
	presentation.scheduleTiming(state);
	assert.equal(timers.size, 1);
	presentation.dispose();
	assert.equal(timers.size, 0);
});

test("AI timing is requested once per pronunciation revision and cached", async () => {
	const requests = [];
	const manager = {
		generateTimedPronunciation: async (params) => {
			requests.push(params);
			return new Map([[0, ["와스", "레", "테"]]]);
		},
	};
	const cache = new Map();
	const lines = [{ originalText: "忘れて", phoneticText: "와스레테", syllables: [syllable("忘", 0, 1), syllable("れ", 1, 2), syllable("て", 2, 3)] }];
	const { api, events } = load({ manager, cache });
	const options = { trackUri: "spotify:track:abc", lines, targetLang: "ko", sourceLang: "ja" };
	api.ensureTimed(options);
	api.ensureTimed(options);
	await new Promise((resolve) => setTimeout(resolve, 0));
	await new Promise((resolve) => setTimeout(resolve, 0));
	assert.equal(requests.length, 1);
	assert.deepEqual(plain(requests[0].items[0].u), [["忘", 0, 1], ["れ", 1, 2], ["て", 2, 3]]);
	assert.equal(requests[0].items[0].r, "와스레테");
	assert.deepEqual(plain(api.getTimed("spotify:track:abc").get("0:line")), ["와스", "레", "테"]);
	assert.deepEqual(events.filter((event) => event.type === api.STATUS_EVENT).map((event) => event.detail.phase), ["generating", "complete"]);

	const second = load({ manager, cache });
	second.api.ensureTimed(options);
	await new Promise((resolve) => setTimeout(resolve, 0));
	await new Promise((resolve) => setTimeout(resolve, 0));
	assert.equal(requests.length, 1, "the persistent cache answers a later session");
	assert.deepEqual(plain(second.api.getTimed("spotify:track:abc").get("0:line")), ["와스", "레", "테"]);
});

test("late karaoke timing reuses the displayed pronunciation and shares alignment across views", async () => {
	const calls = [];
	const { api } = load({ manager: {
		async generateTimedPronunciation(params) {
			calls.push(params);
			return new Map([[0, ["쿄오", "모"]]]);
		},
	} });
	const trackUri = "spotify:track:late";
	const original = { originalText: "今日も", phoneticText: "쿄오 모", translationText: "오늘도" };
	assert.equal(api.ensureTimed({ trackUri, lines: [original], consumer: "panel" }), null);
	const lines = [{ ...original, syllables: [syllable("今日", 10, 34), syllable("も", 34, 49)] }];
	const options = { trackUri, lines, karaokeSource: "lrcred", targetLang: "ko", sourceLang: "ja" };
	const panel = api.ensureTimed({ ...options, consumer: "panel" });
	assert.strictEqual(api.ensureTimed({ ...options, lines: structuredClone(lines) }), panel);
	await tick();
	assert.equal(calls.length, 1);
	assert.deepEqual(plain(calls[0].items), [{ i: 0, r: "쿄오 모", u: [["今日", 10, 34], ["も", 34, 49]] }]);
	const [displayed] = api.applyToLines(lines, { karaoke: true, timed: api.getTimed(trackUri, lines, "panel") });
	assert.deepEqual(plain(displayed.syllables), [syllable("쿄오 ", 10, 34), syllable("모", 34, 49)]);
	assert.equal(displayed.originalText, "쿄오 모");
	assert.equal(displayed.translationText, "오늘도");
	assert.equal(lines[0].phoneticText, "쿄오 모");
});

test("distinct page and panel layouts keep independent results", async () => {
	const requests = [];
	const { api, events } = load({ manager: {
		generateTimedPronunciation(params) {
			const pending = Promise.withResolvers();
			requests.push({ params, ...pending });
			return pending.promise;
		},
	} });
	const trackUri = "spotify:track:fixture";
	const panelLines = [{ originalText: "ab", phoneticText: "AB", syllables: [syllable("a", 0, 1), syllable("b", 1, 2)] }];
	const pageLines = [{ originalText: "♪" }, ...panelLines];
	api.ensureTimed({ trackUri, lines: panelLines, consumer: "panel" });
	api.ensureTimed({ trackUri, lines: pageLines });
	await tick();
	assert.equal(api.getStatuses(trackUri).length, 2);
	requests[1].resolve(new Map([[0, ["AB", ""]]]));
	requests[0].resolve(new Map([[0, ["A", "B"]]]));
	await tick();
	assert.deepEqual(plain([...api.getTimed(trackUri, pageLines)]), [["1:line", ["AB", ""]]]);
	assert.deepEqual(plain([...api.getTimed(trackUri, panelLines, "panel")]), [["0:line", ["A", "B"]]]);
	assert.equal(events.filter(event => event.detail?.phase === "cancelled").length, 0);
});

test("edited readings cancel stale alignment and preserve only the new result", async () => {
	const requests = [];
	const cache = new Map();
	const { api, events } = load({ cache, manager: {
		generateTimedPronunciation(params) {
			const pending = Promise.withResolvers();
			requests.push({ params, ...pending });
			return pending.promise;
		},
	} });
	const trackUri = "spotify:track:fixture";
	const oldLines = [{ originalText: "ab", phoneticText: "AB", syllables: [syllable("a", 0, 1), syllable("b", 1, 2)] }];
	api.ensureTimed({ trackUri, lines: oldLines });
	await tick();
	api.clearTrack("fixture");
	assert.equal(requests[0].params.signal.aborted, true);
	const edited = [{ ...oldLines[0], phoneticText: "AX B" }];
	api.ensureTimed({ trackUri, lines: edited });
	await tick();
	assert.equal(requests.length, 2);
	requests[1].resolve(new Map([[0, ["AX", "B"]]]));
	requests[0].resolve(new Map([[0, ["A", "B"]]]));
	await tick();
	assert.equal(cache.size, 1);
	assert.deepEqual(plain([...api.getTimed(trackUri, edited)]), [["0:line", ["AX ", "B"]]]);
	assert.equal(api.getTimed(trackUri, oldLines), null);
	assert.deepEqual(events.filter(event => event.type === api.STATUS_EVENT).map(event => event.detail.phase),
		["generating", "cancelled", "generating", "complete"]);
});

test("alignment stays live until its last display leaves and ignores stale releases", async () => {
	const requests = [];
	const { api, events } = load({ manager: {
		generateTimedPronunciation(params) {
			const pending = Promise.withResolvers();
			requests.push({ params, ...pending });
			return pending.promise;
		},
	} });
	const trackUri = "spotify:track:shared";
	const lines = [{ originalText: "ab", phoneticText: "AB", syllables: [syllable("a", 0, 1), syllable("b", 1, 2)] }];
	const options = { trackUri, lines };
	const shared = api.ensureTimed(options);
	assert.equal(api.ensureTimed({ ...options, consumer: "panel" }), shared);
	await tick();

	api.releaseTimed(trackUri, shared);
	assert.equal(requests[0].params.signal.aborted, false);
	api.releaseTimed(trackUri, shared, "panel");
	assert.equal(requests[0].params.signal.aborted, true);
	assert.equal(requests[0].params.signal.reason.superseded, true);
	assert.deepEqual(plain(api.getStatuses(trackUri)), []);

	const next = api.ensureTimed(options);
	api.releaseTimed(trackUri, shared);
	await tick();
	assert.equal(requests.length, 2);
	assert.equal(requests[1].params.signal.aborted, false);
	requests[0].resolve(new Map([[0, ["AB", ""]]]));
	requests[1].resolve(new Map([[0, ["A", "B"]]]));
	await tick();
	api.releaseTimed(trackUri, next);
	assert.deepEqual(plain([...api.getTimed(trackUri, lines)]), [["0:line", ["A", "B"]]]);
	assert.deepEqual(events.filter(event => event.type === api.STATUS_EVENT).map(event => event.detail.phase),
		["generating", "cancelled", "generating", "complete"]);
});

test("disposing the committed page alignment stops provider batches and fallback", { timeout: 2000 }, async () => {
	const manager = createAIAddonManager({ getAddonDebug: () => null });
	const providerStarted = Promise.withResolvers();
	const providerFinished = Promise.withResolvers();
	const requests = [];
	let fallbackCalls = 0;
	manager.getEnabledProvidersFor = () => [{
		id: "primary",
		generateCharacterPronunciation({ signal }) {
			requests.push(signal);
			providerStarted.resolve();
			return new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
		},
	}, {
		id: "fallback",
		generateCharacterPronunciation() { fallbackCalls += 1; },
	}];
	const { api } = load({ manager: {
		generateTimedPronunciation(params) {
			return manager.generateTimedPronunciation(params).catch(error => {
				providerFinished.resolve(error);
				throw error;
			});
		},
	} });
	const state = {
		uri: "spotify:track:fixture",
		currentLyrics: Array.from({ length: 40 }, () => ({
			originalText: "ab", phoneticText: "AB", syllables: [syllable("a", 0, 1), syllable("b", 1, 2)],
		})),
	};
	let runTimer;
	const presentation = createPagePronunciationPresentation({
		readApi: () => api, readState: () => state, isMounted: () => true,
		getTargetLanguage: () => "ko", getSourceLanguage: () => "ja", getNotation: () => "translation",
		scheduleTimer(callback) { runTimer = callback; },
		cancelTimer() {},
	});
	presentation.scheduleTiming(state);
	runTimer();
	try {
		await Promise.race([providerStarted.promise, providerFinished.promise.then(error => { throw error; })]);
		assert.equal(requests.length, 12);
	} finally {
		presentation.dispose();
	}
	const reason = await providerFinished.promise;
	assert.equal(reason.superseded, true);
	assert.ok(requests.every(signal => signal.aborted));
	assert.equal(requests.length, 12);
	assert.equal(fallbackCalls, 0);
	assert.deepEqual(plain(api.getStatuses(state.uri)), []);
});

test("pseudo karaoke and a disabled mode do not ask AI", () => {
	const manager = { generateTimedPronunciation: () => { throw new Error("must not run"); } };
	const lines = [{ originalText: "a", phoneticText: "b", syllables: [syllable("a", 0, 1)] }];
	const { api } = load({ manager });
	assert.equal(api.ensureTimed({ trackUri: "t", lines, karaokeSource: "line-timing-pseudo" }), null);
	assert.equal(load({ enabled: false, manager }).api.ensureTimed({ trackUri: "t", lines }), null);
});

test("AIAddonManager parses only slot-exact unit pronunciations", () => {
	const manager = createAIAddonManager({});
	const chunk = [{ i: 0, r: "x", u: [["a", 0, 1], ["b", 1, 2]] }, { i: 1, r: "y z", u: [["c", 0, 1]] },
		{ i: 2, r: "사난 테", u: [["さ", 0, 1], ["な", 1, 2]] }, { i: 3, r: "지분 라시", u: [["自分", 0, 1], ["らし", 1, 2]] }];
	const parsed = manager._parseTimedPronunciationResult({ l: [
		{ i: 0, p: ["x", null] },
		{ i: 1, p: ["y", "z"] },
		{ i: 7, p: ["w"] },
		{ i: 2, p: ["사나", "은테"] },
		{ i: 3, p: ["지분", "라시"] },
	] }, chunk);
	assert.deepEqual(plain([...parsed]), [[0, ["x", ""]], [3, ["지분", "라시"]]],
		"a split that changes letters is dropped (and repaired); a dropped space is accepted");
});

test("the timing prompt carries the full lyrics, units and pronunciation", () => {
	const prompt = buildTimedPronunciationPrompt({ items: [{ i: 3, r: "와스레테", u: [["忘", 0, 400]] }], lyricsText: "忘れて\n次の行", sourceLang: "ja" });
	assert.match(prompt, /忘れて\n次の行/);
	assert.match(prompt, /"i":3,"n":1,"r":"와스레테","u":\[\["忘",0,400\]\]/);
	assert.match(prompt, /p must contain exactly n strings/);
});
