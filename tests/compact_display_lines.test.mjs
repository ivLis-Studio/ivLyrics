import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../Pages.js", import.meta.url), "utf8");
const helperStart = source.indexOf("const shouldIncludeSyncedLineInCompactView");
const helperBoundary = source.indexOf("const getActiveTimedLineIndex", helperStart);
assert.ok(helperStart > 0, "compact display-line helpers must remain in Pages.js");
assert.ok(helperBoundary > helperStart, "compact display-line helpers must precede the active-line helper");

const context = vm.createContext({});
vm.runInContext(
	`${source.slice(helperStart, helperBoundary)}\n` +
	"globalThis.__compactDisplayLinesTest = { shouldIncludeSyncedLineInCompactView, createCompactDisplayLineCache, buildCompactDisplayLines };",
	context
);

const {
	shouldIncludeSyncedLineInCompactView,
	createCompactDisplayLineCache,
	buildCompactDisplayLines,
} = context.__compactDisplayLinesTest;

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
		.filter((line) => shouldIncludeSyncedLineInCompactView(line, activeLineIndex, visualLineIndex))
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
	const cache = createCompactDisplayLineCache();

	const initial = buildCompactDisplayLines(paddedLyrics, 0, 0, cache);
	const afterActiveLineChange = buildCompactDisplayLines(paddedLyrics, 2, 2, cache);

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
	const cache = createCompactDisplayLineCache();

	const withInterlude = buildCompactDisplayLines(paddedLyrics, 1, 1, cache);
	assert.equal(serializeLines(withInterlude), serializeLines(baselineCompactDisplayLines(paddedLyrics, 1, 1)));

	const withoutInterlude = buildCompactDisplayLines(paddedLyrics, 2, 2, cache);
	assert.equal(serializeLines(withoutInterlude), serializeLines(baselineCompactDisplayLines(paddedLyrics, 2, 2)));
	assert.strictEqual(withoutInterlude[0], withInterlude[0]);
	assert.notStrictEqual(withoutInterlude[1], withInterlude[2], "a shifted line must receive its new display slot");
	assert.notStrictEqual(withoutInterlude[2], withInterlude[3], "every shifted line must avoid a stale display slot");

	const reordered = [firstLine, thirdLine, interlude, secondLine];
	const reorderedWithInterlude = buildCompactDisplayLines(reordered, 1, 1, cache);
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
	const cache = createCompactDisplayLineCache();

	const initial = buildCompactDisplayLines(paddedLyrics, 1, 1, cache);
	const replacement = {
		...translatedLine,
		text2: "new translation",
		translationText: "new translation",
		metadata: { source: "second-replaced" },
	};
	const updated = buildCompactDisplayLines([firstLine, replacement, lastLine], 1, 1, cache);

	assert.strictEqual(updated[0], initial[0]);
	assert.notStrictEqual(updated[1], initial[1]);
	assert.strictEqual(updated[2], initial[2]);
	assert.equal(updated[1].text2, "new translation");
	assert.equal(updated[1].translationText, "new translation");
	assert.deepEqual(updated[1].metadata, { source: "second-replaced" });
	assert.equal(serializeLines(updated), serializeLines(baselineCompactDisplayLines([firstLine, replacement, lastLine], 1, 1)));

	const otherEngine = buildCompactDisplayLines([firstLine, replacement, lastLine], 1, 1, createCompactDisplayLineCache());
	assert.notStrictEqual(otherEngine[0], updated[0]);
});
