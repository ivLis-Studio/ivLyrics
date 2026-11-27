import assert from "node:assert/strict";
import test from "node:test";
import { instrumentalMarkers } from "../src/lyrics/InstrumentalBreaks.js";
import { createProviderInstrumentalBreakNormalizer } from "../src/providers/lyrics/normalizeProviderInstrumentalBreaks.mjs";

const normalize = createProviderInstrumentalBreakNormalizer(() => instrumentalMarkers);

test("instrumental normalization copies changed rows and keeps ordinary lyrics by reference", () => {
    const lyric = Object.freeze({ text: "The song continues", startTime: 7000 });
    const unsynced = Object.freeze([lyric]);
    const breakLine = Object.freeze({
        text: "【&sung;】", startTime: 2000, endTime: 3000,
        syllables: Object.freeze([Object.freeze({ text: "【&sung;】", startTime: 2050, endTime: 2900 })])
    });
    const karaoke = Object.freeze([breakLine, lyric]);
    const raw = Object.freeze({ karaoke, unsynced });
    const { result, changed } = normalize(raw, { durationMs: 9000 });

    assert.equal(changed, true);
    assert.deepEqual(result.karaoke[0], {
        text: "♪", startTime: 2000, endTime: 7000,
        syllables: [{ text: "♪", startTime: 2000, endTime: 7000 }]
    });
    assert.equal(result.karaoke[1], lyric);
    assert.equal(result.unsynced, unsynced);
    assert.equal(raw.karaoke[0], breakLine);

    const secondPass = normalize(result, { durationMs: 9000 });
    assert.equal(secondPass.changed, false);
    assert.equal(secondPass.result, result);
});
