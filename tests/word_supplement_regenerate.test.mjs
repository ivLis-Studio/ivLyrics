import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const supplementsSource = readFileSync(new URL("../WordLevelSupplements.js", import.meta.url), "utf8");
const indexSource = readFileSync(new URL("../index.js", import.meta.url), "utf8");
const pagesSource = readFileSync(new URL("../Pages.js", import.meta.url), "utf8");

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
	const context = vm.createContext({
		window,
		console: { log: () => {}, warn: () => {}, error: () => {} },
		setTimeout, clearTimeout,
	});
	vm.runInContext(supplementsSource, context);
	return { window, api: window.ivLyricsWordSupplements, readCalls, glossCalls, glossResponders };
};

test("regenerateWordSupplements explicitly refetches with force after clearing the cache", () => {
	const body = indexSource.slice(
		indexSource.indexOf("async regenerateWordSupplements()"),
		indexSource.indexOf("async regenerateTranslation(")
	);
	assert.ok(body.length > 0, "regenerateWordSupplements body found");
	// Persistent clear still happens first, then memory invalidation...
	assert.match(body, /await window\.LyricsService\?\.clearWordSupplementsCache\?\. *\(trackId\)/);
	assert.match(body, /window\.ivLyricsWordSupplements\?\.invalidate\?\.?\(\)/);
	// ...followed by an explicit, awaited refetch that bypasses the
	// prefetch toggle with the same track id the render path uses.
	assert.match(body, /await prefetch\(karaokeLines, \{ sourceLang, trackId, force: true \}\)/);
	// Success is reported only after the refetch settles and the track is
	// still current; a no-op refetch surfaces as a failure.
	assert.match(body, /if \(!refetched\)/);
	assert.match(body, /this\.state\.karaoke/);
});

test("word prefetch honors the force flag for explicit regenerate requests", () => {
	assert.match(pagesSource, /trackId = "", force = false \} = \{\}\) => \{/);
	assert.match(
		pagesSource,
		/if \(!force && window\.CONFIG\?\.visual\?\.\["prefetch-word-details-enabled"\] === false\)/
	);
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
	const cleared = await window.LyricsService.clearWordSupplementsCache("T1");
	assert.equal(cleared, true);
	window.ivLyricsWordSupplements.invalidate();

	// Next fetch must miss both caches and resend the AI request.
	const pending2 = api.getWordGlosses(units, "line", "ja", { trackId: "T1" });
	await sleep(DEBOUNCE + 100);
	assert.ok(readCalls.length > readsAfterFirst, "persistent cache re-read after clear");
	assert.equal(glossCalls.length, 2, "AI request resent after regenerate");
	glossResponders[1].resolve(["hello2", "world2"]);
	assert.deepEqual(Array.from(await pending2), ["hello2", "world2"]);
});
