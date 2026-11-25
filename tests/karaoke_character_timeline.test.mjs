import assert from "node:assert/strict";
import test from "node:test";
import { createKaraokeGraphemes } from "../src/lyrics/karaokeGraphemes.mjs";
import { createKaraokeCharacterTimelineBuilder, queryGlobalCharTimeline } from "../src/lyrics/karaokeCharacterTimeline.mjs";

const prepare = createKaraokeCharacterTimelineBuilder(createKaraokeGraphemes());
const buildTimeline = () => prepare([
    {
        syllables: [
            { text: "a", startTime: 100, endTime: 400 },
            { text: "\u0301", startTime: 400, endTime: 500 },
        ],
        vocals: {
            lead: { syllables: [{ text: "字", startTime: 200, endTime: 500 }] },
            background: [{ syllables: [{ text: "💻", startTime: 260, endTime: 420 }] }],
        },
    },
    { syllables: [{ text: "B", startTime: 1000, endTime: 1120 }] },
]);
const active = (timeline, position) => queryGlobalCharTimeline(timeline, position).activeGlobalCharIndex;

test("multivocal ties, combined graphemes, gaps and seeks agree with the packed format", () => {
    const timeline = buildTimeline();
    assert.deepEqual(timeline.globalCharOffsets, [0, 3]);
    assert.deepEqual(timeline.chars.slice(0, 3), [100, 500, 400], "the accent and base share one timing interval");
    const legacy = { chars: timeline.chars, globalCharOffsets: timeline.globalCharOffsets };
    const cases = [[99, -1], [100, 0], [200, 1], [400, 2], [420, 1], [500, 1], [540, 2],
        [1000, 3], [1120, 4], [3119, 53], [3120, -1], [360, 2]];
    for (const [position, expected] of cases) {
        assert.equal(active(timeline, position), expected, String(position));
        assert.equal(active(legacy, position), expected, String(position));
    }
});

test("active characters bypass the completed-character search", () => {
    const timeline = buildTimeline();
    timeline.passedEntries = new Proxy(timeline.passedEntries, {
        get(target, key) {
            assert.equal(key, "length", "an active character already determines the result");
            return target.length;
        },
    });
    assert.equal(active(timeline, 400), 2);
    assert.equal(active(timeline, 1000), 3);
});
