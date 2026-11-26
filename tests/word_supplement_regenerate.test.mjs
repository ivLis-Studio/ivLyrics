import { createWordSupplementPrefetcher } from "#ivlyrics/lyrics/createWordSupplementPrefetcher.mjs";
import { createFixtureWordSupplementService } from "./fixtures/word-supplement-service.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { createLyricsCache } from "#ivlyrics/lyrics/createLyricsCache.mjs";
import { regeneratePageWordSupplements } from "#ivlyrics/lyrics/pageLyricRegeneration.mjs";

const indexSource = readFileSync(new URL("../src/spicetify/index.js", import.meta.url), "utf8");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const DEBOUNCE = 350;

const units = [
	{ wordKey: 0, surface: "こんにちは" },
	{ wordKey: 1, surface: "世界" },
];

// Persistent store mock with a working per-track clear, mirroring
// LyricsCache.clearWordSupplementsForTrack.
const loadSupplements = () => {
	const persisted = new Map();
	const keyOf = (args) => JSON.stringify(args);
	const readCalls = [];
	const glossCalls = [];
	const glossResponders = [];
	const window = {};
	window.Spicetify = { Player: { data: { item: { uri: "spotify:track:T1" } } } };
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
		getWordSupplements: async (...args) => {
			readCalls.push(args);
			return persisted.get(keyOf(args)) ?? null;
		},
		cacheWordSupplements: (...args) => {
			// args: trackId, targetLang, sourceLang, kind, sourceHash, data
			persisted.set(keyOf(args.slice(0, 5)), args[5]);
			return Promise.resolve(true);
		},
		clearWordSupplementsCache: async (trackId) => {
			for (const key of [...persisted.keys()]) {
				if (JSON.parse(key)[0] === trackId) persisted.delete(key);
			}
			return true;
		},
	};
	window.AIAddonManager = {
		generateWordGloss: (params) => {
			glossCalls.push(params);
			return new Promise((resolve, reject) => { glossResponders.push({ resolve, reject }); });
		},
	};
	createFixtureWordSupplementService(window);
	return { window, api: window.ivLyricsWordSupplements, readCalls, glossCalls, glossResponders };
};

test("regenerateWordSupplements explicitly refetches with force after clearing the cache", async () => {
	assert.match(indexSource, /getWordSupplementPrefetcher as getAppWordSupplementPrefetcher,[\s\S]*?from "#ivlyrics\/lyrics\/wordSupplementRuntime\.mjs"/);
	const body = indexSource.slice(
		indexSource.indexOf("async regenerateWordSupplements()"),
		indexSource.indexOf("async regenerateTranslation(")
	);
	assert.ok(body.length > 0, "regenerateWordSupplements body found");
	const calls = [];
	const karaoke = [{ text: "生" }];
	const app = vm.runInNewContext(`({ ${body} })`, {
		regeneratePageWordSupplements,
		window: {},
		Utils: { extractTrackId: uri => uri.split(":").pop() },
		getAppService: () => ({
			clearWordSupplementsCache: async id => { calls.push(["persistent", id]); return true; },
			detectLanguage: () => "ja",
		}),
		getAppWordSupplementService: () => ({
			clearCaches: id => calls.push(["memory", id]),
			invalidate: id => calls.push(["invalidate", id]),
		}),
		getAppWordSupplementPrefetcher: () => async (lines, options) => {
			assert.equal(lines, karaoke);
			calls.push(["prefetch", { ...options }]);
			return true;
		},
		Toast: { show() {}, success: () => calls.push(["success"]), error: message => assert.fail(message) },
		I18n: { t: key => key },
	});
	app.state = { uri: "spotify:track:T1", currentLyrics: karaoke, karaoke };
	app.isCurrentLyricsUri = uri => uri === app.state.uri;
	await app.regenerateWordSupplements();
	assert.deepEqual(calls, [
		["memory", "T1"], ["persistent", "T1"], ["invalidate", "T1"],
		["prefetch", { sourceLang: "ja", trackId: "T1", force: true }], ["success"],
	]);
});

function createTestPrefetcher({ getWordGlosses, enabled = true }) {
	const api = {
		getWordUnits: () => units,
		isSuitableSourceLanguage: () => true,
		resolveReadingMode: () => null,
		getWordGlosses,
	};
	return createWordSupplementPrefetcher({
		getService: () => api,
		getVisualSettings: () => ({ "prefetch-word-details-enabled": enabled }),
		getDetectedLanguage: () => "ja",
		prepareTimedChars: () => [{ char: "生" }],
	});
}

test("word prefetch honors the force flag for explicit regenerate requests", async () => {
	let calls = 0;
	const prefetch = createTestPrefetcher({
		enabled: false,
		getWordGlosses: async () => { calls++; return ["life"]; },
	});
	assert.equal(await prefetch([{}]), false);
	assert.equal(calls, 0);
	assert.equal(await prefetch([{}], { force: true }), true);
	assert.equal(calls, 1);
});

function loadPersistentClear() {
	const service = createLyricsCache({});
	let notifyReady;
	const ready = new Promise(resolve => { notifyReady = resolve; });
	const request = {};
	const transaction = { objectStore: () => ({ openCursor: () => request }) };
	service._openDB = async () => ({ transaction: () => { notifyReady(); return transaction; } });
	service._getTrackCacheKeyRange = () => null;
	return { service, request, transaction, ready };
}

test("persistent word clear waits for the deletion transaction to commit", async () => {
	const { service, request, transaction, ready } = loadPersistentClear();
	let settled = false;
	const pending = service.clearWordSupplementsForTrack("T1");
	pending.then(() => { settled = true; });
	await ready;
	request.onsuccess({ target: { result: null } });
	await Promise.resolve();
	await Promise.resolve();
	assert.equal(settled, false, "exhausting the cursor is not a committed clear");
	transaction.oncomplete();
	assert.equal(await pending, true);
});

test("an aborted word cache deletion cannot report success", async () => {
	const { service, request, transaction, ready } = loadPersistentClear();
	const pending = service.clearWordSupplementsForTrack("T1");
	await ready;
	request.onsuccess({ target: { result: null } });
	transaction.error = new Error("transaction aborted");
	transaction.onabort();
	await assert.rejects(pending, /transaction aborted/);
});

test("a local track's word clear preserves its translation and pronunciation", async () => {
	const { service, request, transaction, ready } = loadPersistentClear();
	const trackId = "local-uri:spotify:local:artist:album:word:205";
	const other = "local-uri:spotify:local:artist:album:another:205";
	service._getTrackCacheKeyRange = () => ({});
	const pending = service.clearWordSupplementsForTrack(trackId);
	await ready;
	const deleted = [];
	for (const [id, type, suffix] of [
		[trackId, "translation", "en:translation"],
		[trackId, undefined, "en:phonetic"],
		[trackId, "word", "en:word:gloss:ja:hash"],
		[trackId, undefined, "en:word:reading:ja:hash"],
		[other, "word", "en:word:reading:ja:hash"],
	]) {
		request.onsuccess({ target: { result: {
			value: { trackId: id, type, cacheKey: `${id}:${suffix}` },
			delete: () => deleted.push([id, suffix]),
			continue() {},
		} } });
	}
	request.onsuccess({ target: { result: null } });
	transaction.oncomplete();
	assert.equal(await pending, true);
	assert.deepEqual(deleted, [
		[trackId, "en:word:gloss:ja:hash"], [trackId, "en:word:reading:ja:hash"],
	]);
});

test("word prefetch reports success only when a supplement was actually returned", async () => {
	let result = [];
	const prefetch = createTestPrefetcher({ getWordGlosses: async () => result });
	assert.equal(await prefetch([{}], { sourceLang: "ja", force: true }), false);
	result = ["", " "];
	assert.equal(await prefetch([{}], { sourceLang: "ja", force: true }), false);
	result = ["life"];
	assert.equal(await prefetch([{}], { sourceLang: "ja", force: true }), true);
});

test("clearing persistent cache plus invalidate makes the next fetch resend the AI request", async () => {
	const { window, api, readCalls, glossCalls, glossResponders } = loadSupplements();

	// First fetch: persistent miss, one AI batch request.
	const pending1 = api.getWordGlosses(units, "line", "ja", { trackId: "T1" });
	await sleep(DEBOUNCE + 100);
	assert.equal(glossCalls.length, 1);
	glossResponders[0].resolve(["hello", "world"]);
	assert.deepEqual(Array.from(await pending1), ["hello", "world"]);
	const readsAfterFirst = readCalls.length;
	assert.ok(readsAfterFirst >= 1);

	// Cached fetch: no new AI request.
	const cached = await api.getWordGlosses(units, "line", "ja", { trackId: "T1" });
	assert.deepEqual(Array.from(cached), ["hello", "world"]);
	assert.equal(glossCalls.length, 1);

	// Regenerate sequence: persistent clear, then memory invalidation.
	api.clearCaches("T1");
	const cleared = await window.LyricsService.clearWordSupplementsCache("T1");
	assert.equal(cleared, true);
	api.invalidate("T1");

	// Next fetch must miss both caches and resend the AI request.
	const pending2 = api.getWordGlosses(units, "line", "ja", { trackId: "T1" });
	await sleep(DEBOUNCE + 100);
	assert.ok(readCalls.length > readsAfterFirst, "persistent cache re-read after clear");
	assert.equal(glossCalls.length, 2, "AI request resent after regenerate");
	glossResponders[1].resolve(["hello2", "world2"]);
	assert.deepEqual(Array.from(await pending2), ["hello2", "world2"]);
});
