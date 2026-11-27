import assert from "node:assert/strict";
import test from "node:test";
import { createSyncCreatorLyricDocument } from "#ivlyrics/features/sync/syncCreatorLyricText.mjs";
import { createSyncCreatorMergedLayout } from "#ivlyrics/features/sync/syncCreatorMergedLayout.mjs";
import { countSyncCreatorCompletedLines, isSyncCreatorLineSynced } from "#ivlyrics/features/sync/syncCreatorLineCompletion.mjs";
import { buildSyncCreatorPlaybackTimeline } from "#ivlyrics/features/sync/syncCreatorPlaybackTimeline.mjs";

test("the editor preserves Unicode code-point offsets and separately trims the submitted text", () => {
    const document = createSyncCreatorLyricDocument("  e\u0301😀 \n\n한글\n");
    assert.deepEqual(document.lyricsLines, ["  é😀 ", "한글"]);
    assert.deepEqual(document.lineChars, [[" ", " ", "é", "😀", " "], ["한", "글"]]);
    assert.deepEqual(document.lineCharOffsets, [0, 5]);
    assert.deepEqual(document.lyricsFullTextChars, ["é", "😀", "한", "글"]);
    assert.equal(document.totalChars, 7);
    assert.equal(document.getLineEndAtIndex(0), 4);
    assert.equal(document.getLineEndAtIndex(1), 6);
    assert.equal(document.getLineEndAtIndex(-1), -1);
});

test("merged navigation and playback address the same normalized source rows", () => {
    const document = createSyncCreatorLyricDocument("a\u0301😀\n歌詞\nnext");
    const syncData = {
        lines: [{
            start: 0, end: 3, chars: [2, 2.2, 2.4, 2.6],
            mergedLineContinuationStarts: [2],
            parallel: { parts: [{ chars: [1.5, 1.7] }] },
        }],
    };
    const layout = createSyncCreatorMergedLayout(document, {}, syncData);
    const source = [
        { text: "a\u0301😀", startTime: 1000 },
        { text: "歌詞", startTime: 2200 },
        { text: "next", startTime: 3300 },
    ];
    const timeline = buildSyncCreatorPlaybackTimeline(
        document.lyricsLines, syncData, source, document.lineIndexByStart,
    );
    assert.deepEqual(layout.getMergedLineIndexesForStart(0), [0, 1]);
    assert.deepEqual(layout.getAutoMergeSplitPointsForLine(0), [2]);
    assert.equal(layout.findMergedOwnerLineIndex(1), 0);
    assert.equal(layout.findNavigableLineIndex(0, 1), 2);
    assert.deepEqual(timeline.filter(row => !layout.isLineCoveredByMergedPrevious(row.lineIndex)), [
        { lineIndex: 0, startTime: 1500 },
        { lineIndex: 2, startTime: 3300 },
    ]);
});

test("merged continuation progress uses saved marks while the owner follows the current vocal layout", () => {
    const lyricDocument = createSyncCreatorLyricDocument("a\u0301😀\n歌詞\nplain\nunrecorded");
    const lead = { id: "lead", ranges: [{ start: 0, end: 1 }], chars: [0, 1] };
    const second = { id: "second", ranges: [{ start: 2, end: 3 }], chars: [0.5, 1.5] };
    const saved = { start: 0, end: 3, mergedLineContinuationStarts: [2], parallel: { parts: [lead, second] } };
    const syncData = { lines: [saved, { start: 4, end: 8, chars: [] }] };
    const mergedLayout = createSyncCreatorMergedLayout(lyricDocument, {}, syncData);
    const templateCalls = [];
    const result = countSyncCreatorCompletedLines({
        lyricDocument, syncData, mergedLayout, multiVocalMode: true,
        getParallelTemplateForLineData(line, chars, start, merged) {
            templateCalls.push([chars.join(""), start, merged]);
            return line.parallel;
        },
        mergeParallelTemplate(template) {
            if (!template) return null;
            return { parts: [lead, { ...second, chars: [] }] };
        },
    });
    assert.equal(result, 2);
    assert.deepEqual(templateCalls, [["á😀歌詞", 0, true], ["plain", 4, false]]);
    assert.equal(countSyncCreatorCompletedLines({ syncData, multiVocalMode: false }), 2);
    assert.equal(countSyncCreatorCompletedLines({ syncData: null }), 0);
    assert.equal(isSyncCreatorLineSynced(saved, { ...second, chars: [] }, false), true);
    assert.equal(isSyncCreatorLineSynced(saved, { ...second, ranges: [{ start: 1, end: 2 }], chars: [] }, false), false);
    assert.equal(isSyncCreatorLineSynced(null, null, true), true);
    assert.equal(isSyncCreatorLineSynced(null, null, false), false);
});

test('merge lookups stay isolated from preview overrides and caller-owned arrays', () => {
    const document = createSyncCreatorLyricDocument('A\nB\nC\nD');
    const saved = { start: 0, end: 1, mergedLineContinuationStarts: [1] };
    const layout = createSyncCreatorMergedLayout(document, {}, { lines: [saved] });
    assert.equal(layout.findMergedOwnerLineIndex(1), 0);
    assert.equal(layout.findMergedOwnerLineIndex(2), -1);
    const indexes = layout.getMergedLineIndexesForStart(0);
    indexes.push(2);
    assert.deepEqual(layout.getMergedLineIndexesForStart(0), [0, 1]);

    const preview = new Map([[1, { start: 1, end: 2, mergedLineContinuationStarts: [2] }]]);
    assert.equal(layout.findMergedOwnerLineIndex(1, preview), -1);
    assert.equal(layout.findMergedOwnerLineIndex(2, preview), 1);
    preview.set(1, { start: 1, end: 3, mergedLineContinuationStarts: [2, 3] });
    assert.deepEqual(layout.getMergedLineIndexesForStart(1, preview), [1, 2, 3]);
    assert.equal(layout.findMergedOwnerLineIndex(1), 0);
    assert.equal(layout.findMergedOwnerLineIndex(2), -1);
});
