import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

// A held final note: "lastCharEnd" ends a line's (or vocal part's) last
// character at an explicit time instead of the natural, capped duration.
const require = createRequire(import.meta.url);
const { KaraokeWordTiming, SyncDataSourceCompatibility } = require('../LyricsService.js');
const readSource = name => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const section = (source, startMarker, endMarker) => {
    const start = source.indexOf(startMarker);
    const end = source.indexOf(endMarker, start + startMarker.length);
    assert.ok(start >= 0 && end > start, `missing production section: ${startMarker}`);
    return source.slice(start, end);
};
const editor = vm.createContext({ window: {}, Spicetify: {}, console });
vm.runInContext(`${section(readSource('SyncDataCreator.js'), 'const SYNC_CREATOR_', 'const SyncDataCreator =')}
    globalThis.api = {
        validate: getSyncCreatorSyncDataValidationError, sanitize: sanitizeSyncCreatorLastCharEnds,
        slice: sliceSyncCreatorLineTiming, clip: clipSyncCreatorLineToBounds,
        runs: preserveSyncCreatorParallelTimingRuns, follow: followSyncCreatorLastCharShift,
    };`, editor);
const renderer = vm.createContext({ window: {}, Spicetify: {}, console, KaraokeWordTiming, SyncDataSourceCompatibility });
vm.runInContext(`${section(readSource('LyricsService.js'), 'const SyncDataService = (() => {', 'window.SyncDataService = SyncDataService;')}
    globalThis.apply = SyncDataService.applySyncDataToLyrics;`, renderer);
const plain = value => JSON.parse(JSON.stringify(value));
const { validate, sanitize, slice, clip, runs, follow } = editor.api;
const rows = ['ABC', 'DEFG'];
const render = (lines) => plain(renderer.apply(rows.map(text => ({ text })), { provider: 'spotify', syncData: { version: 5, lines } }));

test('a held last character ends at lastCharEnd instead of the 1.5 second cap', () => {
    const base = [{ start: 0, end: 2, chars: [1, 1.2, 1.4] }, { start: 3, end: 6, chars: [10, 10.2, 10.4, 10.6] }];
    const natural = render(base)[0].syllables.at(-1).endTime;
    assert.ok(natural <= 1400 + 1500, 'without it the last character keeps its capped duration');
    const held = render([{ ...base[0], lastCharEnd: 6 }, base[1]])[0];
    assert.equal(held.syllables.at(-1).endTime, 6000);
    assert.equal(held.endTime, 6000);
    const word = render([{ start: 0, end: 2, granularity: 'word', chars: [1, 1, 1], lastCharEnd: 5.5 }, base[1]])[0];
    assert.equal(word.syllables.at(-1).endTime, 5500, 'word timing keeps the held end too');
    const ignored = render([{ ...base[0], lastCharEnd: 1.3 }, base[1]])[0];
    assert.equal(ignored.syllables.at(-1).endTime, natural, 'an end before the character itself is ignored');
});

test('a vocal part can hold its own last character', () => {
    const line = { start: 3, end: 6, chars: [10, 10.2, 10.4, 10.6], parallel: { layout: 'stack', parts: [
        { id: 'a', role: 'lead', ranges: [{ start: 3, end: 4 }], join: [], chars: [10, 10.2], lastCharEnd: 14 },
        { id: 'b', role: 'background', ranges: [{ start: 5, end: 6 }], join: [], chars: [10.4, 10.6] },
    ] } };
    const rendered = render([{ start: 0, end: 2, chars: [1, 1.2, 1.4] }, line])[1];
    assert.equal(rendered.vocals.lead.syllables.at(-1).endTime, 14000);
    assert.ok(rendered.vocals.background[0].syllables.at(-1).endTime < 14000);
    assert.ok(rendered.endTime >= 14000);
});

test('the editor validates held ends exactly like the server', () => {
    const ok = { lines: [{ start: 0, end: 2, chars: [1, 2, 3], lastCharEnd: 7 }] };
    assert.equal(validate(ok), null);
    for (const lastCharEnd of [3, 2, -1, '7', 63.5]) {
        assert.match(validate({ lines: [{ start: 0, end: 2, chars: [1, 2, 3], lastCharEnd }] }), /Line 1: lastCharEnd/);
    }
    const part = { lines: [{ start: 0, end: 3, chars: [1, 2, 3, 4], parallel: { parts: [
        { id: 'a', ranges: [{ start: 0, end: 1 }], chars: [1, 2], lastCharEnd: 1.5 },
        { id: 'b', ranges: [{ start: 2, end: 3 }], lastCharEnd: 9 },
    ] } }] };
    assert.match(validate(part), /parallel part a: lastCharEnd/);
    part.lines[0].parallel.parts[0].lastCharEnd = 5;
    assert.match(validate(part), /parallel part b: lastCharEnd needs character timing/);
});

test('stale held ends are dropped, valid ones and untouched data stay as they are', () => {
    const clean = { lines: [{ start: 0, end: 2, chars: [1, 2, 3] }] };
    assert.equal(sanitize(clean), clean);
    const data = { lines: [
        { start: 0, end: 2, chars: [1, 2, 3], lastCharEnd: 2.5 },
        { start: 3, end: 5, granularity: 'line', timing: 4, lastCharEnd: 6 },
        { start: 6, end: 9, chars: [7, 7.5, 8, 8.5], parallel: { parts: [
            { id: 'a', ranges: [{ start: 6, end: 7 }], chars: [7, 7.5], lastCharEnd: 9 },
            { id: 'b', ranges: [{ start: 8, end: 9 }], chars: [8, 8.5], lastCharEnd: 8 },
        ] } },
    ] };
    const result = plain(sanitize(data));
    assert.equal('lastCharEnd' in result.lines[0], false);
    assert.equal(result.lines[1].lastCharEnd, 6, 'compact line timing is decoded before checking');
    assert.equal(result.lines[2].parallel.parts[0].lastCharEnd, 9);
    assert.equal('lastCharEnd' in result.lines[2].parallel.parts[1], false);
});

test('splitting, clipping and timing runs keep a held end only with its last character', () => {
    const line = { start: 0, end: 5, chars: [1, 1.1, 1.2, 1.3, 1.4, 1.5], lastCharEnd: 4 };
    assert.equal('lastCharEnd' in plain(slice(line, 0, 2)), false);
    assert.equal(plain(slice(line, 3, 5)).lastCharEnd, 4);
    const parallel = { start: 0, end: 5, chars: [1, 1.1, 1.2, 1.3, 1.4, 1.5], parallel: { parts: [
        { id: 'a', ranges: [{ start: 0, end: 2 }], join: [], chars: [1, 1.1, 1.2], lastCharEnd: 3 },
        { id: 'b', ranges: [{ start: 3, end: 5 }], join: [], chars: [1.3, 1.4, 1.5], lastCharEnd: 5 },
    ] } };
    const sliced = plain(slice(parallel, 0, 4));
    assert.equal(sliced.parallel.parts[0].lastCharEnd, 3);
    assert.equal('lastCharEnd' in sliced.parallel.parts[1], false);
    const clipped = plain(clip({ ...parallel, end: 4, chars: parallel.chars.slice(0, 5) }));
    assert.equal(clipped.parallel.parts[0].lastCharEnd, 3);
    assert.equal('lastCharEnd' in clipped.parallel.parts[1], false);
    const split = plain(runs({ parts: [{ id: 'a', ranges: [{ start: 0, end: 3 }], join: [], chars: [2, 2.1, 1, 1.1], lastCharEnd: 6 }] }));
    assert.equal(split.parts.length, 2);
    assert.equal('lastCharEnd' in split.parts[0], false);
    assert.equal(split.parts[1].lastCharEnd, 6);
});

test('a held end moves with its last character', () => {
    assert.deepEqual(plain(follow({ lastCharEnd: 5 }, [1, 2], [1.1, 2.1])), { lastCharEnd: 5.1 });
    assert.deepEqual(plain(follow({ lastCharEnd: 5 }, [1, 2], [1.1, 2])), {}, 'moving earlier characters leaves it');
    assert.deepEqual(plain(follow({}, [1, 2], [1.1, 2.1])), {});
});
