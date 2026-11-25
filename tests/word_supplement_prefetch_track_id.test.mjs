import { createFixtureWordSupplementService } from "./fixtures/word-supplement-service.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { createWordSupplementPrefetcher } from "#ivlyrics/lyrics/createWordSupplementPrefetcher.mjs";
import { createLyricPrefetcher } from "../src/lyrics/createLyricPrefetcher.mjs";


const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const DEBOUNCE = 350;

const loadSupplements = ({ playerUri = "spotify:track:PLAYERA", ...scheduling } = {}) => {
	const readCalls = [];
	const writeCalls = [];
	const glossCalls = [];
	const glossResponders = [];
	const window = {};
	window.Spicetify = { Player: { data: { item: { uri: playerUri } } } };
	window.CONFIG = {
		visual: {
			"translation-mode:japanese": "gemini_translate",
			"translate:target-language": "en",
		},
	};
	window.ivLyricsTranslationModes = {
		normalizeLanguage: (value) => String(value ?? "").trim().toLowerCase(),
		isPronunciationMode: () => false,
	};
	window.LyricsService = {
		getWordSupplements: async (...args) => { readCalls.push(args); return null; },
		cacheWordSupplements: (...args) => { writeCalls.push(args); return Promise.resolve(); },
	};
	window.AIAddonManager = {
		generateWordGloss: (params) => {
			glossCalls.push(params);
			return new Promise((resolve, reject) => { glossResponders.push({ resolve, reject }); });
		},
	};
	createFixtureWordSupplementService(window, scheduling);
	return { window, api: window.ivLyricsWordSupplements, readCalls, writeCalls, glossCalls, glossResponders };
};

const units = [
	{ wordKey: 0, surface: "こんにちは" },
	{ wordKey: 1, surface: "世界" },
];

test("prefetch with an explicit track id reads and writes under that track when playback changes", async () => {
	const { window, api, readCalls, writeCalls, glossCalls, glossResponders } =
		loadSupplements({ playerUri: "spotify:track:PLAYERA" });

	const pending = api.getWordGlosses(units, "line-B", "ja", { trackId: "PREFETCHB" });
	// The cache read is issued synchronously under the prefetch target...
	assert.equal(readCalls.length, 1);
	assert.equal(readCalls[0][0], "PREFETCHB");

	// ...and playback switches to a third track before the batch settles.
	window.Spicetify.Player.data.item.uri = "spotify:track:PLAYERC";

	await sleep(DEBOUNCE + 100);
	assert.equal(glossCalls.length, 1);
	glossResponders[0].resolve(["hello", "world"]);
	assert.deepEqual(Array.from(await pending), ["hello", "world"]);

	// The deferred write must retain the captured id, not the new player's.
	assert.equal(writeCalls.length, 1);
	assert.equal(writeCalls[0][0], "PREFETCHB");
});

test("calls without an explicit track id keep the current-player default", async () => {
	const { api, readCalls, writeCalls, glossResponders } =
		loadSupplements({ playerUri: "spotify:track:PLAYERNOW" });

	const pending = api.getWordGlosses(units, "line-R", "ja");
	assert.equal(readCalls.length, 1);
	assert.equal(readCalls[0][0], "PLAYERNOW");

	await sleep(DEBOUNCE + 100);
	glossResponders[0].resolve(["hello", "world"]);
	await pending;
	assert.equal(writeCalls.length, 1);
	assert.equal(writeCalls[0][0], "PLAYERNOW");
});

test("word supplement prefetch uses the requested track id", async () => {
	const trackUri = "spotify:track:QUEUED";
	const lyrics = { karaoke: [{ text: "Fixture" }] };
	const calls = [];
	const services = {
		LyricsService: { detectLanguage: () => "ja" },
	};
	const prefetcher = createLyricPrefetcher({
		getService: (name) => services[name],
		getWordSupplementPrefetcher: () => (...args) => calls.push(args),
		extractTrackId: (uri) => {
			assert.equal(uri, trackUri);
			return null; // Preserve the fallback for an ID the Spotify parser does not recognize.
		},
	});
	assert.equal(await prefetcher.loadWordSupplements({ uri: trackUri }, lyrics), true);
	assert.deepEqual(calls, [[lyrics.karaoke, { sourceLang: "ja", trackId: "QUEUED" }]]);

});

test("both word prefetch outputs warm the cache for the queued track", async () => {
	const calls = [];
	const timed = [{ char: "生", karaokeWordIndex: 0 }];
	const words = [{ wordKey: 0, surface: "生" }];
	const service = {
		getWordUnits: chars => { assert.equal(chars, timed); return words; },
		isSuitableSourceLanguage: lang => lang === "ja",
		resolveReadingMode: () => "romaji",
		getWordReadings: async (...args) => { calls.push(args); return ["sei"]; },
		getWordGlosses: async (...args) => { calls.push(args); return ["life"]; },
	};
	const prefetch = createWordSupplementPrefetcher({
		getService: () => service,
		getVisualSettings: () => ({}),
		getDetectedLanguage: () => "ja",
		prepareTimedChars: () => timed,
	});
	assert.equal(await prefetch([{}], { sourceLang: "ja", trackId: "QUEUED" }), true);
	assert.deepEqual(calls, [
		[words, "ja", "romaji", "生", { trackId: "QUEUED" }],
		[words, "生", "ja", { trackId: "QUEUED" }],
	]);
});

test("queue work cancelled before the batch reaches AI makes neither a request nor a loading notification", async () => {
	const timers = new Map();
	const schedule = callback => { const key = Symbol(); timers.set(key, callback); return key; };
	const { window, api, glossCalls } = loadSupplements({ schedule, cancelTimer: key => timers.delete(key) });
	let wanted = true;
	const loading = [];
	window.dispatchEvent = event => loading.push(event.detail);
	window.AIAddonManager.generateWordPronunciation = () => assert.fail("cancelled word readings reached AI");
	const options = { trackId: "B", wanted: () => wanted };
	const gloss = api.getWordGlosses(units, "obsolete verse", "ja", options);
	const reading = api.getWordReadings(units, "ja", "gemini_romaji", "obsolete verse", options);
	await new Promise(setImmediate);
	assert.equal(timers.size, 2);
	wanted = false;
	for (const fire of [...timers.values()]) await fire();
	assert.deepEqual(await Promise.all([gloss, reading]), [["", ""], ["", ""]]);
	assert.deepEqual(glossCalls, []);
	assert.deepEqual(loading, []);
});

test("a foreground reader can adopt a queued batch before it reaches AI", async () => {
	const timers = new Map();
	const schedule = callback => { const key = Symbol(); timers.set(key, callback); return key; };
	const { api, glossCalls, glossResponders } = loadSupplements({ schedule, cancelTimer: key => timers.delete(key) });
	let wanted = true;
	const prefetch = api.getWordGlosses(units, "same verse", "ja", { trackId: "B", wanted: () => wanted });
	await new Promise(setImmediate);
	wanted = false;
	const foreground = api.getWordGlosses(units, "same verse", "ja", { trackId: "B" });
	assert.equal(timers.size, 1);
	const flushed = timers.values().next().value();
	assert.equal(glossCalls.length, 1);
	glossResponders[0].resolve(["hello", "world"]);
	await flushed;
	assert.deepEqual(await foreground, ["hello", "world"]);
	assert.deepEqual(await prefetch, ["hello", "world"]);
});

test("a failed mixed batch only retries the lines that still have a consumer", async () => {
	const timers = new Map();
	const schedule = callback => { const key = Symbol(); timers.set(key, callback); return key; };
	const { api, glossCalls, glossResponders } = loadSupplements({ schedule, cancelTimer: key => timers.delete(key) });
	let wanted = true;
	const queued = api.getWordGlosses(units, "old verse", "ja", { trackId: "B", wanted: () => wanted });
	const foreground = api.getWordGlosses(units, "current verse", "ja", { trackId: "B" });
	await new Promise(setImmediate);
	const batch = timers.values().next().value();
	assert.equal(glossCalls[0].lineText, "old verse\ncurrent verse");
	wanted = false;
	glossResponders[0].reject(Error("batch response failed"));
	await batch;
	assert.deepEqual(await queued, ["", ""]);
	assert.equal(timers.size, 1);
	const retry = timers.values().next().value();
	assert.equal(glossCalls[1].lineText, "current verse");
	glossResponders[1].resolve(["hello", "world"]);
	await retry;
	assert.deepEqual(await foreground, ["hello", "world"]);
});
