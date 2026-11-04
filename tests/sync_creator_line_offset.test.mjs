import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../SyncDataCreator.js', import.meta.url), 'utf8');
const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
function shift(data, delta) {
    const context = { useCallback: fn => fn, currentLineStart: 3, activeParallelPart: null, activeParallelTargetId: 'full',
        currentParallelTemplate: null,
        claimSessionForLocalEditing() {}, resetCurrentSyncInput() {},
        roundSyncTime: value => Math.round(value * 1000) / 1000,
        SYNC_CREATOR_MIN_SEQUENTIAL_STEP_SEC: 0.001,
        mode: 'idle', currentLineChars: new Array(5), Toast: { error() {} }, I18n: { t: key => key },
        offsetSelectionRangeRef: { current: null },
        get syncData() { return data; },
        setSyncData: update => { data = update(data); } };
    vm.runInNewContext(`${section('\tconst getSyncCreatorLineTimes =', '\tconst SYNC_CREATOR_SHORTCUTS =')}
        ${section('const shiftSyncCreatorSelectionTimes =', 'const getSyncCreatorLockedPlaybackProgressIndex =')}
        ${section('\tconst adjustCurrentLineOffset =', '\tconst resetFromStart =')}
        globalThis.adjust = adjustCurrentLineOffset;`, context);
    context.adjust(delta);
    return JSON.parse(JSON.stringify(data));
}
const fixture = () => ({ version: 5, lines: [
    { start: 0, end: 2, chars: [1, 2, 3] },
    { start: 3, end: 7, chars: [85, 85.4, 85.8, 86.2, 86.6], parallel: { layout: 'stack', parts: [
        { id: 'lead', ranges: [{ start: 3, end: 5 }], chars: [85, 85.4, 85.8] },
        { id: 'backing', ranges: [{ start: 6, end: 7 }], chars: [85.2, 86.6] },
        { id: 'pending', ranges: [{ start: 6, end: 7 }] },
    ] } },
    { start: 8, end: 9, chars: [100, 101] },
] });

test('line offset preserves independent sub-line times and repeated edits do not flatten them', () => {
    const original = fixture();
    let result = shift(original, 100);
    assert.deepEqual(result.lines[1].chars, [85.1, 85.5, 85.9, 86.3, 86.7]);
    assert.deepEqual(result.lines[1].parallel.parts[0].chars, [85.1, 85.5, 85.9]);
    assert.deepEqual(result.lines[1].parallel.parts[1].chars, [85.3, 86.7]);
    assert.equal(result.lines[1].parallel.parts[2].chars, undefined);
    result = shift(result, -100);
    assert.deepEqual(result, original);
    assert.deepEqual(original, fixture(), 'saved input was not mutated');
});

test('offsets can overlap adjacent lines and keep all part intervals when reaching zero', () => {
    const data = fixture();
    data.lines[0].chars = [85, 86, 87];
    data.lines[2].chars = [86, 87];
    const shifted = shift(data, 100);
    assert.deepEqual(shifted.lines[1].parallel.parts[1].chars, [85.3, 86.7]);
    assert.deepEqual(shifted.lines[0], data.lines[0]);
    assert.deepEqual(shifted.lines[2], data.lines[2]);
    const atZero = shift(data, -100000);
    assert.deepEqual(atZero.lines[1].chars, [0, 0.4, 0.8, 1.2, 1.6]);
    assert.deepEqual(atZero.lines[1].parallel.parts[1].chars, [0.2, 1.6]);
});

test('committing a vocal preserves overlapping earlier and later lines', () => {
    const data = fixture();
    data.lines[0].chars = [85, 86, 87];
    data.lines[2].chars = [86, 87];
    const context = { nextLines: structuredClone(data.lines), lineStart: 3, lineEnd: 7,
        lineData: structuredClone(data.lines[1]), currentLineMergedWithNext: false,
		currentParallelData: null, activeParallelPart: null, getActiveRecordingLockRange: () => null,
		SYNC_CREATOR_SYNC_DATA_VERSION: 10 };
    vm.runInNewContext(source.slice(0, source.indexOf('const SyncDataCreator =')) + '\n'
        + section('\t\tconst committedLineIndex = nextLines.findIndex', '\t\tconst scoreInput = scoreInputRef.current;')
        + '\nglobalThis.result = nextSyncData;', context);
    assert.deepEqual(JSON.parse(JSON.stringify(context.result)), data);
});

test('a held line end follows a whole-line offset', () => {
    const data = fixture();
    data.lines[1].lastCharEnd = 90;
    data.lines[1].parallel.parts[1].lastCharEnd = 88;
    const result = shift(data, 100);
    assert.equal(result.lines[1].lastCharEnd, 90.1);
    assert.equal(result.lines[1].parallel.parts[1].lastCharEnd, 88.1);
    assert.equal(shift(result, -100).lines[1].lastCharEnd, 90);
});
