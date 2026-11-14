import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

// The lyrics page caches two pure computations: grapheme segmentation and a
// karaoke line's fill end. Both must return exactly what the uncached
// computation returns, for every input change that can reach them.

const pageSource = readFileSync(new URL("../Pages.js", import.meta.url), "utf8");
const segmenterSource = readFileSync(new URL("../LyricsWordSegmenter.js", import.meta.url), "utf8");
const slice = (start, end) => {
	const from = pageSource.indexOf(start);
	const to = pageSource.indexOf(end, from);
	assert.ok(from >= 0 && to > from, start);
	return pageSource.slice(from, to);
};
const quiet = { log: () => {}, warn: () => {}, error: () => {} };
// Arrays created inside a vm context have that context's prototype.
const plain = (value) => JSON.parse(JSON.stringify(value));

const loadSegmenter = () => {
	const module = { exports: {} };
	vm.runInContext(segmenterSource, vm.createContext({ module, console: quiet }));
	return module.exports;
};

const loadFillEnd = (segmenter) => {
	const state = { locale: "ja" };
	const context = vm.createContext({
		console: quiet,
		window: { Utils: { getDetectedLanguage: () => state.locale }, LyricsWordSegmenter: segmenter },
	});
	vm.runInContext([
		...pageSource.match(/const KARAOKE_PRE_SPACE_[A-Z_]+ = [\d.]+;/g),
		slice("const getCopyableText", "const INTERLUDE_MIN_DURATION_MS"),
		slice("const toFiniteTime", "const getFiniteLyricsStyleNumber"),
		slice("const getTimedSyllablesFromLine", "const getKaraokeSpeakerPresentation"),
		slice("const KARAOKE_COMBINING_MARK_REGEX", "const getKaraokeSyllableCharCount"),
		slice("const getLastSyllableEndTime", "const getInterludeInfo"),
		slice("const getKaraokeLineBounds", "const buildKaraokeFuriganaMap"),
		slice("const buildKaraokeTimedChars", "const getActiveKaraokeTimedCharIndex"),
		"globalThis.api = { computeKaraokeLineFillEndTime, getKaraokeLineFillEndTime };",
	].join("\n"), context);
	return { ...context.api, state };
};

const loadFillEndCacheWithSpy = () => {
	const state = { locale: "en", calls: 0 };
	const context = vm.createContext({
		window: { Utils: { getDetectedLanguage: () => state.locale } },
		computeKaraokeLineFillEndTime: (line) => {
			state.calls++;
			return [line?.startTime, line?.endTime, line?.text, line?.originalText, state.locale].join("|");
		},
	});
	vm.runInContext([
		slice("const karaokeLineFillEndTimeCache", "const getInterludeInfo"),
		"globalThis.getKaraokeLineFillEndTime = getKaraokeLineFillEndTime;",
	].join("\n"), context);
	return { get: context.getKaraokeLineFillEndTime, state };
};

const syllable = (text, startTime, endTime) => ({ text, startTime, endTime });
const sampleLines = () => [
	{ text: "こんにちは 世界", startTime: 1000, endTime: 4000,
		syllables: [syllable("こんにちは", 1000, 1020), syllable(" ", 1020, 1100), syllable("世界", 1100, 3000)] },
	{ text: "Hello world", startTime: 5000, endTime: 7000,
		syllables: [syllable("Hel", 5000, 5010), syllable("lo ", 5010, 5030), syllable("world", 5030, 6400)] },
	{ text: "lead", startTime: 8000, endTime: 9000, vocals: {
		lead: { syllables: [syllable("lead", 8000, 8600)] },
		background: [{ syllables: [syllable("echo", 8100, 9800)] }],
	} },
	{ text: "pronunciation", originalText: "原文の行", startTime: 10000, endTime: 12000 },
	{ text: "👩‍👩‍👧 ok", startTime: 13000, endTime: 13500, syllables: [syllable("👩‍👩‍👧", 13000, 13100), syllable(" ok", 13100, 13500)] },
	{ text: "", startTime: Number.NaN, endTime: undefined, syllables: [syllable("", 0, 0)] },
	{ text: "only line timing", startTime: 15000 },
];

test("cached grapheme segmentation matches uncached segmentation and returns independent copies", () => {
	const segmenter = loadSegmenter();
	const uncached = (text, locale) => [...new Intl.Segmenter(locale, { granularity: "grapheme" }).segment(text)].map((item) => item.segment);
	for (const [text, locale] of [["こんにちは世界", "ja"], ["👩‍👩‍👧 é", "auto"], ["สวัสดีครับ", "th"], ["नमस्ते", "hi"], ["가나다", "ko"]]) {
		const first = segmenter.segmentGraphemes(text, locale);
		assert.deepEqual(plain(first), uncached(text, locale === "auto" ? undefined : locale));
		first.push("mutated");
		const second = segmenter.segmentGraphemes(text, locale);
		assert.notEqual(first, second);
		assert.deepEqual(plain(second), uncached(text, locale === "auto" ? undefined : locale));
	}
	assert.deepEqual(plain(segmenter.segmentGraphemes("", "ja")), []);
	assert.deepEqual(plain(segmenter.segmentGraphemes(null)), []);
});

test("grapheme cache stays correct beyond its size limit", () => {
	const segmenter = loadSegmenter();
	for (let index = 0; index < 5000; index++) {
		const text = "line " + index + " é";
		assert.equal(segmenter.segmentGraphemes(text, "en").join(""), text);
	}
	assert.deepEqual(plain(segmenter.segmentGraphemes("line 1 é", "en")), ["l", "i", "n", "e", " ", "1", " ", "é"]);
});

test("cached karaoke fill ends equal the uncached computation for originals, display copies and edits", () => {
	const { computeKaraokeLineFillEndTime, getKaraokeLineFillEndTime, state } = loadFillEnd(loadSegmenter());
	for (const locale of ["ja", "en", "auto"]) {
		state.locale = locale;
		for (const line of sampleLines()) {
			const expected = computeKaraokeLineFillEndTime(line);
			assert.equal(getKaraokeLineFillEndTime(line), expected);
			assert.equal(getKaraokeLineFillEndTime(line), expected);
			assert.equal(getKaraokeLineFillEndTime({ ...line, lineNumber: 7 }), expected);
			for (const edited of [
				{ ...line, startTime: (line.startTime || 0) + 250 },
				{ ...line, endTime: 99999 },
				{ ...line, text: "changed text" },
				{ ...line, originalText: "変更" },
				{ ...line, syllables: line.syllables?.map((item) => ({ ...item, endTime: item.endTime + 40 })) },
			]) {
				assert.equal(getKaraokeLineFillEndTime(edited), computeKaraokeLineFillEndTime(edited));
				assert.equal(getKaraokeLineFillEndTime(line), expected);
			}
		}
	}
	assert.equal(getKaraokeLineFillEndTime(null), computeKaraokeLineFillEndTime(null));
});

test("fill end cache reuses work only while every input is unchanged", () => {
	const { get, state } = loadFillEndCacheWithSpy();
	const syllables = [syllable("a", 0, 10)];
	const line = { text: "a", originalText: "A", startTime: 0, endTime: 10, syllables };
	get(line);
	get(line);
	get({ ...line, lineNumber: 3 });
	assert.equal(state.calls, 1);
	for (const change of [{ startTime: 1 }, { endTime: 11 }, { text: "b" }, { originalText: "B" }, { syllables: [...syllables] }, { vocals: {} }]) {
		const before = state.calls;
		assert.equal(get({ ...line, ...change }), [change.startTime ?? 0, change.endTime ?? 10,
			change.text ?? "a", change.originalText ?? "A", "en"].join("|"));
		assert.equal(state.calls, before + 1);
	}
	state.locale = "ja";
	const before = state.calls;
	assert.equal(get(line), "0|10|a|A|ja");
	assert.equal(state.calls, before + 1);
	const lineOnly = { text: "x", startTime: 5 };
	get(lineOnly);
	get(lineOnly);
	assert.equal(state.calls, before + 2);
	get({ ...lineOnly });
	assert.equal(state.calls, before + 3);
});
