import assert from "node:assert/strict";
import test from "node:test";
import { beatGridOf, cachedBeatGridOf } from "#ivlyrics/features/motion/motionBeatGrid.mjs";
import { compose } from "#ivlyrics/features/motion/motionComposition.mjs";
import { buildModel } from "#ivlyrics/features/motion/motionLyricModel.mjs";
import { motionDirector } from "#ivlyrics/features/motion/MotionLyricsDirector.mjs";
import { motionType } from "#ivlyrics/features/motion/MotionLyricsType.mjs";
import { casedText } from "#ivlyrics/features/motion/motionTypesetting.mjs";

// Work motion lyrics repeats for every song and every composition of it: the
// results must stay exactly the same while the repeated work goes away.

const freshModule = (name, tag) => import(new URL("../src/features/motion/" + name + "?" + tag, import.meta.url).href);
const SAMPLES = ["", "Every", "사랑해요", "夢ならばどれほど", "naïve", "e\u0301", "👩‍👩‍👧‍👦 family", "🇰🇷🇯🇵", "\r\n", "गुरु", "a  b"];
const freshGraphemeCount = text => [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(String(text))].length;
const countSegmenters = () => {
	const Original = Intl.Segmenter;
	const counter = { constructed: 0, restore: () => { Intl.Segmenter = Original; } };
	Intl.Segmenter = class extends Original {
		constructor(...args) {
			super(...args);
			counter.constructed += 1;
		}
	};
	return counter;
};

const timed = (parts, start, step) => parts.map((text, index) => ({ text, startTime: start + index * step, endTime: start + (index + 1) * step }));
const song = () => {
	const texts = [
		["Every", "road", "will", "lead", "me", "back"], ["to", "you"],
		["Lanterns", "rising", "over", "quiet", "streets", "and", "every", "single", "window", "glows"],
		[..."夢ならばどれほど"], ["Hold", "on"], ["Every", "road", "will", "lead", "me", "back"], ["to", "you"],
		["月に", "話しかけてた"], ["君の", "横顔は"], ["まるで", "夜の", "花"],
	];
	let start = 2000;
	return texts.map((parts, index) => {
		const step = parts.length > 8 ? 180 : 420;
		const line = { startTime: start, originalText: parts.join(index >= 7 ? "" : " "), syllables: timed(parts, start, step), text2: "" };
		start += parts.length * step + 900;
		return line;
	});
};
const countCosines = (run) => {
	const cosine = Math.cos;
	let count = 0;
	Math.cos = (value) => {
		count += 1;
		return cosine(value);
	};
	try {
		return { result: run(), count };
	} finally {
		Math.cos = cosine;
	}
};

test("song analysis counts graphemes as before with one segmenter", async () => {
	const expected = SAMPLES.map(freshGraphemeCount);
	const segmenters = countSegmenters();
	try {
		const { graphemeCount } = await freshModule("motionSongAnalysis.mjs", "one-segmenter");
		assert.equal(graphemeCount(SAMPLES[1]), expected[1]);
		assert.equal(segmenters.constructed, 1, "the first count makes the segmenter");
		for (let round = 0; round < 3; round += 1) {
			SAMPLES.forEach((text, index) => assert.equal(graphemeCount(text), expected[index], JSON.stringify(text)));
		}
		assert.equal(graphemeCount(null), 0);
		assert.equal(graphemeCount(undefined), 0);
		assert.equal(segmenters.constructed, 1, "every count shares one segmenter");
	} finally {
		segmenters.restore();
	}
});

test("measuring motion type counts letters as before without a segmenter per text", async () => {
	const letters = SAMPLES.map(freshGraphemeCount);
	const segmenters = countSegmenters();
	try {
		const { motionType } = await freshModule("MotionLyricsType.mjs", "one-segmenter");
		// Without a canvas the measurer estimates a width per character, then adds the letter spacing per grapheme.
		const spec = { key: "spaced", canvasFont: "", spacing: 0.08, kind: "sans", script: "latin" };
		const measure = motionType.createMeasurer(undefined);
		measure("warm-up", 50, spec);
		const before = segmenters.constructed;
		assert.ok(before <= 1);
		SAMPLES.forEach((text, index) => {
			let estimate = 0;
			for (const char of text) estimate += /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(char) ? 100 : 56;
			assert.equal(measure(text, 50, spec), ((estimate + spec.spacing * 100 * letters[index]) * 50) / 100, JSON.stringify(text));
		});
		// A text that is not a string is measured as its string, as before ("undefined" has 9 letters).
		assert.equal(measure(undefined, 100, spec), 9 * 56 + spec.spacing * 100 * 9);
		const again = motionType.createMeasurer(undefined);
		SAMPLES.forEach(text => again(text + "!", 40, spec));
		assert.equal(segmenters.constructed, before, "no measurement makes a segmenter of its own");
	} finally {
		segmenters.restore();
	}
});

test("typesetting cases text with the type module's own rule", () => {
	assert.equal(casedText, motionType.casedText);
	assert.equal(casedText("hello", "latin", true), "HELLO");
	assert.equal(casedText("hello", "latin", false), "hello");
	assert.equal(casedText("안녕", "ko", true), "안녕");
	assert.equal(casedText(42, "latin", true), "42");
	assert.equal(casedText(null, "latin", false), "null");
});

test("the beat grid fitted to the words is fitted once for the same onsets", () => {
	const model = buildModel(song());
	const expected = beatGridOf(model, null);
	assert.ok(expected && expected.source === "words", "the words give a steady grid");
	const first = countCosines(() => cachedBeatGridOf(model, null));
	assert.ok(first.count > 600, "the first request fits the grid");
	assert.deepEqual(first.result, expected);
	const again = countCosines(() => [cachedBeatGridOf(model, null), cachedBeatGridOf(structuredClone(model), null)]);
	assert.equal(again.count, 0, "the same onsets are not fitted again");
	for (const grid of again.result) {
		assert.deepEqual(grid, expected);
		// Each plan owns its grid and arrays.
		assert.notEqual(grid, first.result);
		assert.notEqual(grid.times, first.result.times);
		assert.notEqual(grid.strengths, first.result.strengths);
	}
	again.result[0].times.push(1);
	again.result[0].strengths.fill(0);
	assert.deepEqual(cachedBeatGridOf(model, null), expected);
	// The fit follows the values, not the model object: moved words are fitted again.
	const moved = structuredClone(model);
	moved[0].words[1].start += 130;
	const movedExpected = beatGridOf(moved, null);
	const refit = countCosines(() => cachedBeatGridOf(moved, null));
	assert.ok(refit.count > 600);
	assert.deepEqual(refit.result, movedExpected);
	// Too few words and the analysis's own beats take the same paths as before.
	assert.equal(cachedBeatGridOf(model.slice(0, 2), null), beatGridOf(model.slice(0, 2), null));
	assert.equal(cachedBeatGridOf(null, null), null);
	const pulses = { times: Float64Array.from({ length: 20 }, (_, index) => 1000 + index * 480), strengths: Float32Array.from({ length: 20 }, (_, index) => (index % 4 ? 0.5 : 1)) };
	assert.deepEqual(cachedBeatGridOf(model, pulses), beatGridOf(model, pulses));
});

test("composing a song again does not fit its beat grid again", () => {
	const model = buildModel(song());
	const direction = motionDirector.localDirection(model, { seed: 3 });
	const first = countCosines(() => compose(model, direction, { width: 1440, height: 900, seed: 3 }));
	const second = countCosines(() => compose(model, direction, { width: 1280, height: 720, seed: 3 }));
	assert.ok(second.count < first.count / 10, first.count + " -> " + second.count);
	assert.deepEqual(second.result.grid, first.result.grid);
	assert.notEqual(second.result.grid.times, first.result.grid.times);
	assert.deepEqual(Array.from(second.result.pulses.times), first.result.grid.times);
});

