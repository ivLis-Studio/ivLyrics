import assert from "node:assert/strict";
import test from "node:test";
import { getSyncCreatorLineCharCountsFromText, getSyncCreatorLrclibTextShape } from "#ivlyrics/features/sync/lrclibSyncSource.mjs";

// Sync timings are code-point positions in each line. The line lengths come
// from the shared LRCLIB counter; they must stay the code-point counts the
// editor always used (Array.from), surrogate edge cases included.
const codePointCounts = text => String(text || "").normalize("NFC").split("\n")
	.map(line => line.trim().normalize("NFC")).filter(Boolean).map(line => Array.from(line).length);

test("LRCLIB line lengths are code-point counts", () => {
	const texts = [
		"Every road\n will lead me back \n\n to you",
		"사랑해요\n夢ならば\ne\u0301te\u0301",
		"👩‍👩‍👧‍👦 family\n🇰🇷🇯🇵\nsmile 😀!",
		"\uD800 lone high\nlone low \uDC00\npair then low \uD83D\uDE00\uDC00\nhigh then pair \uD800\uD83D\uDE00",
		"",
	];
	for (const text of texts) {
		const expected = codePointCounts(text);
		assert.deepEqual(getSyncCreatorLineCharCountsFromText(text), expected, JSON.stringify(text));
		assert.deepEqual(getSyncCreatorLrclibTextShape(text).lineCharCounts, expected, JSON.stringify(text));
	}
});

