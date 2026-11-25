import { createFixtureWordSupplementService } from "./fixtures/word-supplement-service.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const hookSource = readFileSync(new URL("../src/lyrics/karaokeWordSupplementHook.mjs", import.meta.url), "utf8");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const DEBOUNCE = 350;

// The real single-line detector votes by per-character majority, so a kanji
// hook with an English tail resolves to "en". Stub that behavior exactly.
const loadSupplements = ({ globalLang = "auto", visual = null } = {}) => {
	const glossCalls = [];
	const glossResponders = [];
	const window = {};
	window.Spicetify = { Player: { data: { item: { uri: "spotify:track:TRACKAAA" } } } };
	window.Utils = { getDetectedLanguage: () => globalLang };
	window.CONFIG = {
		visual: visual ?? {
			"translation-mode:japanese": "gemini_translate",
			"translate:target-language": "en",
		},
	};
	window.ivLyricsTranslationModes = {
		normalizeLanguage: (value) => String(value ?? "").trim().toLowerCase(),
		isPronunciationMode: () => false,
	};
	window.LyricsService = {
		detectLanguage: () => "en",
		getWordSupplements: async () => null,
		cacheWordSupplements: () => Promise.resolve(),
	};
	window.AIAddonManager = {
		generateWordGloss: (params) => {
			glossCalls.push(params);
			return new Promise((resolve, reject) => { glossResponders.push({ resolve, reject }); });
		},
	};
	createFixtureWordSupplementService(window);
	return { api: window.ivLyricsWordSupplements, glossCalls, glossResponders };
};

test("kanji-only hook with English tail is not filtered as English", () => {
	const { api } = loadSupplements({ globalLang: "auto" });
	const inferred = api.inferLanguageFromText("限界突破 I'm goin' nonstop");
	assert.notEqual(inferred.toLowerCase(), "en");
	assert.ok(api.isSuitableSourceLanguage(inferred), `expected suitable, got ${inferred}`);
	assert.equal(api.resolveSourceLanguage("限界突破 I'm goin' nonstop"), "ja");
});

test("kana lines still resolve to Japanese and English lines stay filtered", () => {
	const { api } = loadSupplements({ globalLang: "auto" });
	assert.equal(api.inferLanguageFromText("尽きない energy"), "ja");
	assert.ok(api.isSuitableSourceLanguage(api.resolveSourceLanguage("尽きない energy")));
	const english = api.resolveSourceLanguage("Breaking limits, I'm goin' nonstop");
	assert.ok(!api.isSuitableSourceLanguage(english), `expected unsuitable, got ${english}`);
});

test("song-level Japanese wins for the mixed line once detection lands", () => {
	const { api } = loadSupplements({ globalLang: "ja" });
	assert.equal(api.resolveSourceLanguage("限界突破 I'm goin' nonstop"), "ja");
});

test("an all-empty AI reply is not cached, so the retry resends", async () => {
	const { api, glossCalls, glossResponders } = loadSupplements({ globalLang: "ja" });
	const units = [
		{ wordKey: 0, surface: "限界" },
		{ wordKey: 1, surface: "突破" },
	];
	const first = api.getWordGlosses(units, "限界突破 I'm goin' nonstop", "ja", { trackId: "T1" });
	await sleep(DEBOUNCE + 150);
	assert.equal(glossCalls.length, 1);
	assert.deepEqual(Array.from(glossCalls[0].words), ["限界", "突破"]);
	glossResponders[0].resolve(["限界", "突破"]); // echoes -> filtered to empty
	assert.deepEqual(Array.from(await first), ["", ""]);

	const second = api.getWordGlosses(units, "限界突破 I'm goin' nonstop", "ja", { trackId: "T1" });
	await sleep(DEBOUNCE + 150);
	assert.equal(glossCalls.length, 2);
	glossResponders[1].resolve(["limit", "breakthrough"]);
	assert.deepEqual(Array.from(await second), ["limit", "breakthrough"]);
});

test("karaoke line re-resolves the source language when detection lands", () => {
	assert.match(hookSource, /globalLangTick/);
	assert.match(hookSource, /\[supplementsApi, timedText, globalLangTick, settingsRevision\]/);
});
