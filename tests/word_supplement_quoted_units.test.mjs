import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const suppSource = readFileSync(new URL("../WordLevelSupplements.js", import.meta.url), "utf8");
const managerSource = readFileSync(new URL("../AIAddonManager.js", import.meta.url), "utf8");
const indexSource = readFileSync(new URL("../index.js", import.meta.url), "utf8");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const DEBOUNCE = 350;

const loadSupplements = ({ convertImpl } = {}) => {
	const glossCalls = [];
	const glossResponders = [];
	const convertedTexts = [];
	const window = {};
	window.Spicetify = { Player: { data: { item: { uri: "spotify:track:TRACKAAA" } } } };
	window.CONFIG = {
		visual: {
			"translation-mode:japanese": "gemini_translate",
			"translate:target-language": "en",
			"translate:pronunciation-notation": "latin",
		},
	};
	window.ivLyricsTranslationModes = {
		normalizeLanguage: (value) => String(value ?? "").trim().toLowerCase(),
		isPronunciationMode: () => false,
		convertTraditional: async ({ texts }) => {
			convertedTexts.push([...texts]);
			return convertImpl ? convertImpl(texts) : texts.map(() => "");
		},
	};
	window.LyricsService = {
		getWordSupplements: async () => null,
		cacheWordSupplements: () => Promise.resolve(),
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
	vm.runInContext(suppSource, context);
	return { api: window.ivLyricsWordSupplements, glossCalls, glossResponders, convertedTexts };
};

const loadManager = async () => {
	const window = {};
	vm.runInNewContext(managerSource, {
		window,
		Spicetify: { LocalStorage: { get: () => null, set: () => {} } },
		console: { log: () => {}, warn: () => {}, error: () => {} },
		setTimeout, clearTimeout,
	});
	const manager = window.AIAddonManager;
	await manager._initPromise;
	return manager;
};

test("quoted units are queried by their bare core and mapped back", async () => {
	const { api, glossCalls, glossResponders } = loadSupplements();
	const units = [
		{ wordKey: 0, surface: "大切" },
		{ wordKey: 1, surface: "な" },
		{ wordKey: 2, surface: "“日々”" },
		{ wordKey: 3, surface: "が" },
	];
	const pending = api.getWordGlosses(units, "大切な “日々” が", "ja", { trackId: "T1" });
	await sleep(DEBOUNCE + 150);
	assert.equal(glossCalls.length, 1);
	assert.deepEqual(Array.from(glossCalls[0].words), ["大切", "な", "日々", "が"]);
	glossResponders[0].resolve(["precious", "[topic]", "days", "[subject]"]);
	assert.deepEqual(Array.from(await pending), ["precious", "[topic]", "days", "[subject]"]);
});

test("straight-quote debris and lone punctuation never reach the provider", async () => {
	const { api, glossCalls, glossResponders } = loadSupplements();
	const units = [
		{ wordKey: 0, surface: "な\"" },
		{ wordKey: 1, surface: "日々\"" },
		{ wordKey: 2, surface: "\"" },
	];
	const pending = api.getWordGlosses(units, "line", "ja", { trackId: "T1" });
	await sleep(DEBOUNCE + 150);
	assert.equal(glossCalls.length, 1);
	assert.deepEqual(Array.from(glossCalls[0].words), ["な", "日々"]);
	glossResponders[0].resolve(["[topic]", "days"]);
	assert.deepEqual(Array.from(await pending), ["[topic]", "days", ""]);
});

test("an AI echo of the core word is hidden instead of displayed", async () => {
	const { api, glossCalls, glossResponders } = loadSupplements();
	const units = [{ wordKey: 0, surface: "“日々”" }];
	const pending = api.getWordGlosses(units, "line", "ja", { trackId: "T1" });
	await sleep(DEBOUNCE + 150);
	assert.deepEqual(Array.from(glossCalls[0].words), ["日々"]);
	glossResponders[0].resolve(["日々"]);
	assert.deepEqual(Array.from(await pending), [""]);
});

test("local reading conversion receives cores so quoted words keep readings", async () => {
	const { api, convertedTexts } = loadSupplements({
		convertImpl: (texts) => texts.map((text) => (text === "日々" ? "hibi" : `${text}-r`)),
	});
	const units = [
		{ wordKey: 0, surface: "大切な" },
		{ wordKey: 1, surface: "“日々”" },
		{ wordKey: 2, surface: "が" },
	];
	const result = Array.from(await api.getWordReadings(units, "ja", "romaji", "line", { trackId: "T1" }));
	assert.deepEqual(convertedTexts[0], ["大切な", "日々", "が"]);
	assert.deepEqual(result, ["大切な-r", "hibi", "が-r"]);
});

test("word gloss strips echoes with normalized or dropped quotes", async () => {
	const manager = await loadManager();
	manager.getEnabledProvidersFor = () => [{ id: "fake", supports: { pronunciation: true }, translateLyrics: async () => ({}) }];
	const responses = new Map([
		["exact", ["“日々”: days"]],
		["normalized", ["日々: days"]],
		["straight", ["\"日々\": days"]],
	]);
	for (const [name, translation] of responses) {
		manager._callProvider = async () => ({ translation });
		assert.deepEqual(
			await manager.generateWordGloss({ words: ["“日々”"], lineText: "x", targetLang: "en" }),
			["days"],
			name
		);
	}
});

test("furigana kanji check keeps the 々 iteration mark with its word", () => {
	const match = indexSource.match(/const kanjiRegex = (\/.*?\/);/);
	assert.ok(match, "kanjiRegex found in index.js");
	const kanjiRegex = eval(match[1]);
	assert.equal(kanjiRegex.test("々"), true);
	assert.equal(kanjiRegex.test("日"), true);
	assert.equal(kanjiRegex.test("“"), false);
});
