import { shiftSyncCreatorLineTiming } from "#ivlyrics/features/sync/syncCreatorOffsetTiming.mjs";
import { prepareSyncCreatorLineCommit } from "#ivlyrics/features/sync/syncCreatorLineCommit.mjs";
import { createSyncCreatorParallelEditing } from "#ivlyrics/features/sync/parallelTiming.mjs";
import { createSyncCreatorVocalStyles } from "#ivlyrics/features/sync/syncCreatorVocalStyles.mjs";
import { projectTimedUnits } from "#ivlyrics/features/sync/timingGranularity.mjs";
import assert from 'node:assert/strict';
import test from 'node:test';

function shift(data, delta) {
    const updated = shiftSyncCreatorLineTiming(data, {
        currentLineStart: 3,
        requestedDeltaSec: delta / 1000,
        activeParallelPart: null,
        currentParallelTemplate: null,
    }, {});
    return JSON.parse(JSON.stringify(updated));
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
    const line = data.lines[1];
    const lead = line.parallel.parts[0];
    const projectSyncCreatorUnitLayout = (source, target) => projectTimedUnits(source, target, () => null);
    const { clipSyncCreatorLineToBounds } = createSyncCreatorParallelEditing({ projectSyncCreatorUnitLayout });
    const vocalStyles = createSyncCreatorVocalStyles({
        getSpeakerColors: () => null, getActiveColor: () => null, translate: key => key,
    });
    const { nextSyncData, normalizedLineData } = prepareSyncCreatorLineCommit({
        rawChars: [84.9, 85.3, 85.7],
        syncData: data, version: data.version, syncGranularity: 'character',
        line: {
            start: line.start, charCount: line.chars.length, chars: ['a', 'b', 'c'],
            charRefs: line.chars.slice(0, 3).map((_, localIndex) => ({ localIndex })),
            meta: {}, styleRanges: [],
        },
        vocal: { activePart: lead, parallel: line.parallel, targetId: lead.id, multiVocalMode: true },
    }, {
        ...vocalStyles, projectSyncCreatorUnitLayout, clipSyncCreatorLineToBounds,
        normalizeCommittedLineChars: values => values,
        sanitizeSyncCreatorParallel: parallel => parallel,
        getRecordingLockRange: () => null,
    });
    assert.equal(nextSyncData.version, data.version);
    assert.equal(nextSyncData.lines[0], data.lines[0]);
    assert.equal(nextSyncData.lines[2], data.lines[2]);
    assert.deepEqual(normalizedLineData.parallel.parts[0].chars, [84.9, 85.3, 85.7]);
    assert.deepEqual(normalizedLineData.parallel.parts[1].chars, line.parallel.parts[1].chars);
    assert.equal(normalizedLineData.parallel.parts[2].chars, undefined);
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
