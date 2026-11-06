import assert from 'node:assert/strict';
import test from 'node:test';
import { createLockedEditor } from './sync_creator_lock_harness.mjs';

const freeze = value => {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        Object.values(value).forEach(freeze);
        Object.freeze(value);
    }
    return value;
};

test('recording replaces one row without copying or mutating other timings and vocal layouts', () => {
    const h = createLockedEditor();
    const before = h.context.syncData;
    const prior = before.lines[0];
    prior.parallel = { layout: 'stack', parts: [{
        id: 'lead', role: 'lead', speaker: 'MALE', kind: 'pulse',
        ranges: [{ start: prior.start, end: prior.end }], join: [], chars: [...prior.chars],
    }] };
    const snapshot = JSON.stringify(before);
    freeze(before);
    h.api.commitCurrentLineSync([20, 21, 22, 23, 24, 25]);
    assert.notEqual(h.context.syncData, before);
    assert.notEqual(h.context.syncData.lines, before.lines);
    assert.notEqual(h.context.syncData.lines[1], before.lines[1]);
    assert.equal(h.context.syncData.lines[0], prior, 'previous vocal layout retains its identity');
    assert.equal(h.context.syncData.lines[2], before.lines[2], 'following row retains its identity');
    assert.equal(JSON.stringify(before), snapshot, 'previous state remains usable for history and score comparisons');
    assert.deepEqual(h.times(), [20, 21, 22, 23, 24, 25]);
    h.dispose();
});

test('a recording does not traverse other rows\' character or parallel arrays', () => {
    const h = createLockedEditor();
    // A long imported song must cost only one row of timing/parallel work.
    const untouched = Array.from({ length: 500 }, (_, index) => ({
        start: 1000 + index * 50, end: 1049 + index * 50,
        get chars() { throw new Error('unrelated timing array read'); },
        get parallel() { throw new Error('unrelated vocal layout read'); },
    }));
    h.context.syncData.lines.push(...untouched);
    assert.doesNotThrow(() => h.api.commitCurrentLineSync([20, 21, 22, 23, 24, 25]));
    untouched.forEach((row, index) => assert.equal(h.context.syncData.lines[index + 3], row));
    h.dispose();
});
