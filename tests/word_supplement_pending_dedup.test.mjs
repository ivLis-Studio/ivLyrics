import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../WordLevelSupplements.js", import.meta.url), "utf8");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const DEBOUNCE = 350;

const loadSupplements = ({ playerUri = "spotify:track:TRACKAAA" } = {}) => {
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
	// Never settles on its own: the test decides when and how each batch
	// request completes, mirroring a slow AI provider.
	window.AIAddonManager = {
		generateWordGloss: (params) => {
			glossCalls.push(params);
			return new Promise((resolve, reject) => { glossResponders.push({ resolve, reject }); });
		},
	};
	const context = vm.createContext({
		window,
		console: { log: () => {}, warn: () => {}, error: () => {} },
		setTimeout, clearTimeout,
	});
	vm.runInContext(source, context);
	return { window, api: window.ivLyricsWordSupplements, readCalls, writeCalls, glossCalls, glossResponders };
};

const units = [
	{ wordKey: 0, surface: "こんにちは" },
	{ wordKey: 1, surface: "世界" },
];

test("a call while the original request is pending joins it instead of issuing a second AI request", async () => {
	const { api, glossCalls, glossResponders } = loadSupplements();

	// First request: enqueued, flushed after the batch debounce, still
	// awaiting the AI provider when the "retry" fires.
	const first = api.getWordGlosses(units, "line-1", "ja");
	await sleep(DEBOUNCE + 100);
	assert.equal(glossCalls.length, 1);

	// The supplement retry effect re-requests while the original is in flight.
	const second = api.getWordGlosses(units, "line-1", "ja");
	await sleep(DEBOUNCE + 150);
	// Without pending-promise sharing this flushes a duplicate batch.
	assert.equal(glossCalls.length, 1);

	glossResponders[0].resolve(["hello", "world"]);
	const [firstResult, secondResult] = await Promise.all([first, second]);
	assert.deepEqual(Array.from(firstResult), ["hello", "world"]);
	assert.deepEqual(Array.from(secondResult), ["hello", "world"]);

	// Settled results are served from the memory cache.
	const cached = await api.getWordGlosses(units, "line-1", "ja");
	assert.deepEqual(Array.from(cached), ["hello", "world"]);
	assert.equal(glossCalls.length, 1);
});

test("after a failure settles the pending entry clears and a new call may re-request", async () => {
	const { api, glossCalls, glossResponders } = loadSupplements();

	const failing = api.getWordGlosses(units, "line-2", "ja");
	await sleep(DEBOUNCE + 100);
	assert.equal(glossCalls.length, 1);
	glossResponders[0].reject(new Error("provider down"));
	assert.deepEqual(Array.from(await failing), ["", ""]);

	// Failure neither caches nor keeps the pending entry: the next call
	// (the real 8s retry) must be allowed to reach the provider again.
	const retrying = api.getWordGlosses(units, "line-2", "ja");
	await sleep(DEBOUNCE + 100);
	assert.equal(glossCalls.length, 2);
	glossResponders[1].resolve(["hello again", "world again"]);
	assert.deepEqual(
		Array.from(await retrying),
		["hello again", "world again"]
	);
});
