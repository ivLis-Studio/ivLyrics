import assert from "node:assert/strict";
import test from "node:test";
import { lyricsWordSegmenter as segmenter } from "../src/lyrics/LyricsWordSegmenter.js";

// Ports of the two consumers that turn tokens into per-word annotations:
// assignKaraokeWordIndexes (Pages.js) and the word-run split inside
// buildKaraokeWordElements (Pages.js). Both are reproduced here because the
// regression is only observable end to end: a token that is not a substring of
// the source produces no range, and a character without a word index merges the
// following annotated words into one annotation-less run.
const assignWordIndexes = (line, locale) => {
	const chars = [...line];
	const offsets = [];
	let offset = 0;
	for (const char of chars) {
		offsets.push(offset);
		offset += char.length;
	}
	const wordIndexes = new Array(chars.length).fill(null);
	segmenter.segmentRanges(line, locale).forEach((range, wordIndex) => {
		offsets.forEach((charStart, charIndex) => {
			if (charStart >= range.start && charStart < range.end) wordIndexes[charIndex] = wordIndex;
		});
	});
	return { chars, wordIndexes };
};

const splitWordRuns = (line, locale) => {
	const { chars, wordIndexes } = assignWordIndexes(line, locale);
	const runs = [];
	let current = [];
	let currentUnit = null;
	const flush = () => {
		if (current.length === 0) return;
		runs.push({ text: current.join(""), unit: currentUnit });
		current = [];
	};
	chars.forEach((char, index) => {
		const unitIndex = Number.isInteger(wordIndexes[index]) ? wordIndexes[index] : null;
		const isWhitespace = /^\s+$/u.test(char);
		const unitChanged = current.length > 0 && unitIndex !== null && currentUnit !== null && unitIndex !== currentUnit;
		if (unitChanged) flush();
		if (!isWhitespace && current.length === 0) currentUnit = unitIndex;
		if (isWhitespace) {
			flush();
			return;
		}
		current.push(char);
	});
	flush();
	return runs;
};

const nonWhitespaceLength = (text) => text.replace(/\s/gu, "").length;

test("quoted word after punctuation keeps its own word run and annotations", () => {
	// Regression: '"' was appended to the previous token across the space, so the
	// token was not a substring of the line. The unmatched range left the opening
	// quote without a word index, which swallowed the following words into a
	// single run whose supplement lookup used a null key and returned nothing.
	const line = 'And you? "普通"って 何 それ';
	// Spread into host arrays: the segmenter builds its values inside a vm realm.
	assert.deepEqual([...segmenter.segmentLyrics(line, "ja")], ["And", "you?", '"普通"', "って", "何", "それ"]);

	const runs = splitWordRuns(line, "ja");
	assert.deepEqual(runs, [
		{ text: "And", unit: 0 },
		{ text: "you?", unit: 1 },
		{ text: '"普通"', unit: 2 },
		{ text: "って", unit: 3 },
		{ text: "何", unit: 4 },
		{ text: "それ", unit: 5 },
	]);
	// Every word the lyrics ask about gets a key the supplement map can answer.
	assert.ok(runs.every((run) => run.unit !== null));
});

test("ranges cover the whole line and stay in source order", () => {
	const lines = [
		'And you? "普通"って 何 それ',
		'you? "normal" is what',
		"何ですか？“通常”って",
		'He said "hi" , then left',
		"a \" , b",
		'Hello , world',
		"line — with — dashes",
		'。「、」は同じ',
		'ended with a quote "',
		"สาม “คำ”อี่",
	];
	lines.forEach((line) => {
		const ranges = segmenter.segmentRanges(line, "ja");
		assert.ok(ranges.length > 0, line);
		ranges.forEach((range, index) => {
			assert.equal(line.slice(range.start, range.end), range.text, `range ${index} of ${line}`);
			if (index > 0) assert.ok(range.start >= ranges[index - 1].end, `overlap in ${line}`);
		});
		const covered = ranges
			.filter((range) => !/^\s+$/u.test(range.text))
			.reduce((total, range) => total + range.text.length, 0);
		assert.equal(covered, nonWhitespaceLength(line), `coverage of ${line}`);
	});
});

test("every token is a literal substring of the line", () => {
	// Word indexes come from indexOf(token), so a token that was stitched across
	// whitespace or across a glued punctuation mark silently lost its characters.
	const lines = [
		'And you? "普通"って 何 それ',
		"。I你1“。“普通",
		"?って、「？、。 って.それ",
		"“... 2“--x?",
		"a \" , b",
		"何』“普通”",
		"!!! yes",
		"no punctuation here",
	];
	lines.forEach((line) => {
		segmenter.segmentLyrics(line, "ja").forEach((token) => {
			assert.ok(token && line.includes(token), `token ${JSON.stringify(token)} missing from ${JSON.stringify(line)}`);
		});
	});
});
