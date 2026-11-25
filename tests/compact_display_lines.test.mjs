import assert from "node:assert/strict";
import test from "node:test";
import { createCompactLyricsDisplay } from "#ivlyrics/lyrics/compactLyricsDisplay.mjs";

const makeLine = (lineNumber, text, { interlude = false, translation = `${text} translation` } = {}) => ({
	lineNumber,
	startTime: lineNumber * 1000,
	endTime: lineNumber * 1000 + 900,
	text,
	originalText: `${text} original`,
	text2: translation,
	speaker: `speaker-${lineNumber}`,
	displayLineNumber: "source-slot-must-be-overridden",
	metadata: { source: text },
	interludeInfo: { isInterlude: interlude },
});

const baselineCompactDisplayLines = (paddedLyrics, activeLineIndex, visualLineIndex = activeLineIndex) =>
	paddedLyrics
		.filter((line) => !line.interludeInfo?.isInterlude
			|| line.lineNumber === activeLineIndex || line.lineNumber === visualLineIndex)
		.map((line, displayLineNumber) => ({
			...line,
			displayLineNumber,
		}));

const serializeLines = (lines) => JSON.stringify(lines);

test("reuses rows when their source line and display slot stay stable", () => {
	const paddedLyrics = [
		makeLine(0, "first"),
		makeLine(1, "second"),
		makeLine(2, "third"),
	];
	const cache = new WeakMap();

	const readDisplay = createCompactLyricsDisplay(paddedLyrics, cache);
	const initial = readDisplay(0).rows;
	const afterActiveLineChange = readDisplay(2).rows;
	assert.strictEqual(initial, afterActiveLineChange, "ordinary line changes reuse the same layout");

	assert.deepEqual(afterActiveLineChange.map((line) => line.displayLineNumber), [0, 1, 2]);
	assert.strictEqual(afterActiveLineChange[0], initial[0]);
	assert.strictEqual(afterActiveLineChange[1], initial[1]);
	assert.strictEqual(afterActiveLineChange[2], initial[2]);
	assert.notStrictEqual(initial[0], paddedLyrics[0]);
	assert.equal(initial[0].text, "first");
	assert.equal(initial[0].displayLineNumber, 0);
});

test("keeps filtering and slots correct as interludes disappear, reappear, and reorder", () => {
	const firstLine = makeLine(0, "first");
	const interlude = makeLine(1, "instrumental", { interlude: true });
	const secondLine = makeLine(2, "second");
	const thirdLine = makeLine(3, "third");
	const paddedLyrics = [firstLine, interlude, secondLine, thirdLine];
	const cache = new WeakMap();

	const readDisplay = createCompactLyricsDisplay(paddedLyrics, cache);
	const withInterlude = readDisplay(1).rows;
	assert.equal(serializeLines(withInterlude), serializeLines(baselineCompactDisplayLines(paddedLyrics, 1, 1)));

	const withoutInterlude = readDisplay(2).rows;
	assert.equal(serializeLines(withoutInterlude), serializeLines(baselineCompactDisplayLines(paddedLyrics, 2, 2)));
	assert.strictEqual(withoutInterlude[0], withInterlude[0]);
	assert.notStrictEqual(withoutInterlude[1], withInterlude[2], "a shifted line must receive its new display slot");
	assert.notStrictEqual(withoutInterlude[2], withInterlude[3], "every shifted line must avoid a stale display slot");

	const reordered = [firstLine, thirdLine, interlude, secondLine];
	const reorderedWithInterlude = createCompactLyricsDisplay(reordered, cache)(1).rows;
	assert.equal(serializeLines(reorderedWithInterlude), serializeLines(baselineCompactDisplayLines(reordered, 1, 1)));
	assert.equal(reorderedWithInterlude.map((line) => line.lineNumber).join(","), "0,3,1,2");
	assert.equal(reorderedWithInterlude.map((line) => line.displayLineNumber).join(","), "0,1,2,3");
	assert.notStrictEqual(reorderedWithInterlude[1], withoutInterlude[2], "reordering must update the cached display slot");
	assert.equal(reorderedWithInterlude[2].text, "instrumental");
});

test("does not reuse a cached row when its source or translation object is replaced", () => {
	const firstLine = makeLine(0, "first");
	const translatedLine = makeLine(1, "second", { translation: "old translation" });
	const lastLine = makeLine(2, "third");
	const paddedLyrics = [firstLine, translatedLine, lastLine];
	const cache = new WeakMap();

	const initial = createCompactLyricsDisplay(paddedLyrics, cache)(1).rows;
	const replacement = {
		...translatedLine,
		text2: "new translation",
		translationText: "new translation",
		metadata: { source: "second-replaced" },
	};
	const updated = createCompactLyricsDisplay([firstLine, replacement, lastLine], cache)(1).rows;

	assert.strictEqual(updated[0], initial[0]);
	assert.notStrictEqual(updated[1], initial[1]);
	assert.strictEqual(updated[2], initial[2]);
	assert.equal(updated[1].text2, "new translation");
	assert.equal(updated[1].translationText, "new translation");
	assert.deepEqual(updated[1].metadata, { source: "second-replaced" });
	assert.equal(serializeLines(updated), serializeLines(baselineCompactDisplayLines([firstLine, replacement, lastLine], 1, 1)));

	const otherEngine = createCompactLyricsDisplay([firstLine, replacement, lastLine], new WeakMap())(1).rows;
	assert.notStrictEqual(otherEngine[0], updated[0]);
});

test("an instrumental handoff can show both rows and reuse that layout through a reverse seek", () => {
	const paddedLyrics = [
		makeLine(0, "first"),
		makeLine(1, "interlude", { interlude: true }),
		makeLine(2, "second interlude", { interlude: true }),
		makeLine(3, "next lyric"),
	];
	const readDisplay = createCompactLyricsDisplay(paddedLyrics, new WeakMap());
	const approaching = readDisplay(0, 1);
	assert.deepEqual(approaching.rows.map(line => line.lineNumber), [0, 1, 3]);
	assert.equal(approaching.indexByLineNumber.get(3), 2);
	assert.equal(approaching.indexByLineNumber.has(2), false);
	assert.strictEqual(readDisplay(1, 3), approaching);
	const handoff = readDisplay(1, 2);
	assert.deepEqual(handoff.rows.map(line => line.lineNumber), [0, 1, 2, 3]);
	assert.equal(handoff.indexByLineNumber.get(3), 3);
	assert.strictEqual(readDisplay(2, 1), handoff);
	const resumed = readDisplay(3);
	assert.deepEqual(resumed.rows.map(line => line.lineNumber), [0, 3]);
	assert.equal(resumed.indexByLineNumber.get(3), 1);
});
