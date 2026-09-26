import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../AIAddonManager.js", import.meta.url), "utf8");

const loadManager = async () => {
	const window = {};
	vm.runInNewContext(source, {
		window,
		Spicetify: { LocalStorage: { get: () => null, set: () => {} } },
		console: { log: () => {}, warn: () => {}, error: () => {} },
		setTimeout, clearTimeout,
	});
	const manager = window.AIAddonManager;
	await manager._initPromise;
	return manager;
};

// buildLyricsPhoneticPrompt returns { systemPrompt, userPrompt }; the other
// builders return a plain string or { systemPrompt }.
const asPromptText = (result) => (
	typeof result === "string"
		? result
		: `${result?.systemPrompt ?? ""}\n${result?.userPrompt ?? ""}`
);

const managerPromise = loadManager();

test("chinese detection uses the language code first", async () => {
	const manager = await managerPromise;
	assert.equal(manager.isChinesePronunciationTask("zh-hans", ""), true);
	assert.equal(manager.isChinesePronunciationTask("zh-hant", ""), true);
	assert.equal(manager.isChinesePronunciationTask("zh", ""), true);
	assert.equal(manager.isChinesePronunciationTask("ja", "東京"), false);
	assert.equal(manager.isChinesePronunciationTask("ko", "안녕"), false);
});

test("auto detection accepts han-only lyrics and rejects kana/hangul", async () => {
	const manager = await managerPromise;
	assert.equal(manager.isChinesePronunciationTask("auto", "你好吗"), true);
	assert.equal(manager.isChinesePronunciationTask("auto", "東京タワー"), false);
	assert.equal(manager.isChinesePronunciationTask("auto", "안녕하세요"), false);
	assert.equal(manager.isChinesePronunciationTask("auto", "hello world"), false);
});

test("line pronunciation prompt asks for tone marks for a chinese song", async () => {
	const manager = await managerPromise;
	const prompt = asPromptText(manager.buildLyricsPhoneticPrompt({
		text: "你好吗",
		lang: "en",
		sourceLang: "zh-hans",
	}));
	assert.match(prompt, /Hanyu Pinyin with tone marks/);
	assert.match(prompt, /tone marks/);
});

test("line pronunciation prompt picks up chinese from auto detection", async () => {
	const manager = await managerPromise;
	const chinese = asPromptText(manager.buildLyricsPhoneticPrompt({
		text: "我愛你",
		lang: "en",
		sourceLang: "auto",
	}));
	assert.match(chinese, /Hanyu Pinyin with tone marks/);

	const japanese = asPromptText(manager.buildLyricsPhoneticPrompt({
		text: "きみのことが好きだ",
		lang: "en",
		sourceLang: "auto",
	}));
	assert.doesNotMatch(japanese, /Hanyu Pinyin|Mandarin is tonal/);
});

test("non-chinese prompts carry no tone rule", async () => {
	const manager = await managerPromise;
	for (const sourceLang of ["ja", "ko", "en", "auto"]) {
		const prompt = asPromptText(manager.buildLyricsPhoneticPrompt({
			text: "sakura no ki ni saku",
			lang: "en",
			sourceLang,
		}));
		assert.doesNotMatch(prompt, /Hanyu Pinyin|Mandarin is tonal/, `sourceLang=${sourceLang}`);
	}
});

test("chinese-character output is unchanged (tones are inherent in hanzi)", async () => {
	const manager = await managerPromise;
	const prompt = asPromptText(manager.buildLyricsPhoneticPrompt({
		text: "你好吗",
		lang: "zh-cn",
		sourceLang: "zh-hans",
	}));
	assert.doesNotMatch(prompt, /Hanyu Pinyin with tone marks|Mandarin is tonal/);
});

test("ipa notation asks for tones on chinese songs", async () => {
	const manager = await managerPromise;
	const prompt = asPromptText(manager.buildLyricsPhoneticPrompt({
		text: "你好吗",
		lang: "en",
		pronunciationNotation: "ipa",
		sourceLang: "zh-hans",
	}));
	assert.match(prompt, /Mandarin is tonal/);
	assert.doesNotMatch(prompt, /Hanyu Pinyin with tone marks/);
});

test("character pronunciation prompt gets the tone rule only for chinese", async () => {
	const manager = await managerPromise;
	const chinese = manager.buildCharacterPronunciationPrompt({
		lines: ["你好吗"],
		lang: "en",
		sourceLang: "zh-hans",
		unitMode: "char",
	});
	assert.match(chinese, /Hanyu Pinyin with tone marks/);

	const chineseKoreanTarget = manager.buildCharacterPronunciationPrompt({
		lines: ["你好吗"],
		lang: "ko",
		sourceLang: "zh-hans",
		unitMode: "char",
	});
	assert.doesNotMatch(chineseKoreanTarget, /Hanyu Pinyin|Mandarin is tonal/);

	const japanese = manager.buildCharacterPronunciationPrompt({
		lines: ["こんにちは"],
		lang: "en",
		sourceLang: "ja",
		unitMode: "char",
	});
	assert.doesNotMatch(japanese, /Hanyu Pinyin|Mandarin is tonal/);
});

test("word pronunciation prompt gets the tone rule only for chinese", async () => {
	const manager = await managerPromise;
	const chinese = manager.buildWordPronunciationPrompt({
		words: ["你好"],
		lineText: "你好吗",
		targetLang: "en",
		sourceLang: "zh-hans",
		notation: "latin",
	});
	assert.match(chinese.systemPrompt, /Hanyu Pinyin with tone marks/);

	const chineseIpa = manager.buildWordPronunciationPrompt({
		words: ["你好"],
		lineText: "你好吗",
		targetLang: "en",
		sourceLang: "zh-hans",
		notation: "ipa",
	});
	assert.match(chineseIpa.systemPrompt, /Mandarin is tonal/);

	const japanese = manager.buildWordPronunciationPrompt({
		words: ["こんにちは"],
		lineText: "こんにちは",
		targetLang: "en",
		sourceLang: "ja",
		notation: "latin",
	});
	assert.doesNotMatch(japanese.systemPrompt, /Hanyu Pinyin|Mandarin is tonal/);
});
