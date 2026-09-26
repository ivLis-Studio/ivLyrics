import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../WordLevelSupplements.js", import.meta.url), "utf8");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const DEBOUNCE = 350;

const loadSupplements = ({ playerUri = "spotify:track:PLAYERA" } = {}) => {
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

test("index.js and Pages.js thread the target track id into the prefetch calls", () => {
	const index = readFileSync(new URL("../index.js", import.meta.url), "utf8");
	const pages = readFileSync(new URL("../Pages.js", import.meta.url), "utf8");

	assert.match(
		index,
		/const trackId = Utils\.extractTrackId\(uri\) \|\| \(uri\.includes\(":"\) \? uri\.split\(":"\)\.pop\(\) : uri\);/
	);
	assert.match(index, /await prefetch\(karaoke, \{ sourceLang: detected, trackId \}\);/);
	assert.match(pages, /sourceLang = "auto", trackId = "", force = false \} = \{\}\) => \{/);
	assert.match(pages, /api\.getWordReadings\(units, lang, readingMode, timedText, supplementOptions\)/);
	assert.match(pages, /api\.getWordGlosses\(units, timedText, lang, supplementOptions\)/);
});
