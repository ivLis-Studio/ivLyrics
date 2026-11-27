import assert from "node:assert/strict";
import test from "node:test";
import { splitLongSoloVocalLine } from "../src/providers/lyrics/lyricsPlusSoloLineLayout.mjs";
import { splitLongJapaneseLine } from "../src/providers/lyrics/openLyricsJapaneseWrap.mjs";

function createLine(parts) {
    const syllables = parts.map((text, index) => ({
        text, startTime: 1000 + index * 300, endTime: 1300 + index * 300
    }));
    return {
        text: parts.join('').trim(), startTime: 900, endTime: 1100 + 300 * parts.length, syllables
    };
}

test("both line-wrap providers keep the chosen split, source tokens and outer timing", () => {
    const line = createLine(['星の ', '夜に ', '君の ', '声が ', '遠く ', 'まで ', '届く ', 'ように ', '歌う ', 'よ ']);
    for (const split of [splitLongJapaneseLine, splitLongSoloVocalLine]) {
        const segments = split(line);
        assert.deepEqual(segments.map(({ text, startTime, endTime }) => [text, startTime, endTime]), [
            ['星の 夜に 君の 声が 遠く', 900, 2500],
            ['まで 届く ように 歌う よ', 2500, 4100],
        ]);
        assert.ok(segments.flatMap(segment => segment.syllables)
            .every((syllable, index) => syllable === line.syllables[index]));
    }
});

test("Open Lyrics requires whitespace while LyricsPlus can wrap unspaced Japanese", () => {
    const line = createLine(Array(24).fill('歌'));
    assert.deepEqual(splitLongJapaneseLine(line), [line]);
    assert.deepEqual(splitLongSoloVocalLine(line).map(segment => segment.text), Array(2).fill('歌'.repeat(12)));
});
