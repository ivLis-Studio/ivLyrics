import assert from "node:assert/strict";
import test from "node:test";
import { buildVocalCandidates, getAnalysisHints } from "../src/lyrics/pseudo-karaoke/audioVocalAnalysis.mjs";

const segment = i => ({
    start: i * 0.09, duration: i % 5 ? 0.085 : 0.57, confidence: 0.92,
    loudness_start: -24, loudness_max: -3, loudness_max_time: 0.02,
    timbre: Array.from({ length: 6 }, (_, k) => (k * 5 + i) % 33),
    pitches: [0.03, 0.03, 0.03, 1, 0.09, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03],
});

test("candidate lookup includes an earlier overlapping segment even after the following segment ends", () => {
    const hints = getAnalysisHints({
        segments: Array.from({ length: 5 }, (_, i) => segment(i)),
        sections: [{ start: 0, duration: 13 }],
    });
    const indexed = buildVocalCandidates(200, 400, hints);
    assert.deepEqual(indexed, buildVocalCandidates(200, 400, { ...hints, indexedEnds: null }));
    assert.deepEqual(indexed.map(({ time, segmentStart, segmentEnd }) => [time, segmentStart, segmentEnd]),
        [[200, 200, 265], [290, 270, 355], [380, 360, 400]]);
});

test("out-of-order analysis retains source order and uses the linear window", () => {
    const hints = getAnalysisHints({ segments: [segment(2), segment(0), segment(1)] });
    assert.equal(hints.indexedEnds, null);
    assert.deepEqual(hints.scoredSegments.map(candidate => candidate.segmentStart), [180, 0, 90]);
    assert.equal(buildVocalCandidates(600, 700, hints).length, 0);
});
