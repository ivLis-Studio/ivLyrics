import { readSyncCreatorFixture } from "./fixtures/legacy-page-source.mjs";
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readSyncCreatorFixture();
const slice = (startMarker, endMarker) => {
	const start = source.indexOf(startMarker);
	const end = source.indexOf(endMarker, start + startMarker.length);
	assert.ok(start >= 0 && end > start, `missing source section: ${startMarker}`);
	return source.slice(start, end);
};

const context = vm.createContext({});
vm.runInContext(
	slice('const normalizeSyncCreatorLockRange =', 'const getSyncCreatorLockedPlaybackProgressIndex =') +
	'\nglobalThis.__lockHelpers = { normalizeSyncCreatorLockRange, isSyncCreatorIndexLocked, resolveSyncCreatorLockDragRange, buildSyncCreatorLockedCharTimesForRange, getSyncCreatorNextEditableIndex, clampSyncCreatorTimesToLockRange, shiftSyncCreatorSelectionTimes };',
	context
);
const {
	normalizeSyncCreatorLockRange,
	isSyncCreatorIndexLocked,
	resolveSyncCreatorLockDragRange,
	buildSyncCreatorLockedCharTimesForRange,
	getSyncCreatorNextEditableIndex,
	clampSyncCreatorTimesToLockRange,
	shiftSyncCreatorSelectionTimes,
} = context.__lockHelpers;

test('right-drag in either direction normalizes to a single range', () => {
	assert.deepEqual(JSON.parse(JSON.stringify(normalizeSyncCreatorLockRange(3, 7, 10))), { start: 3, end: 7 });
	assert.deepEqual(JSON.parse(JSON.stringify(normalizeSyncCreatorLockRange(7, 3, 10))), { start: 3, end: 7 });
	assert.deepEqual(JSON.parse(JSON.stringify(resolveSyncCreatorLockDragRange(7, 3, 10))), { start: 3, end: 7 });
});

test('single click stays backward compatible with prefix lock', () => {
	assert.deepEqual(JSON.parse(JSON.stringify(normalizeSyncCreatorLockRange(4, 4, 10))), { start: 0, end: 4 });
});

test('invalid and full-line ranges are rejected', () => {
	assert.equal(normalizeSyncCreatorLockRange(-1, 2, 10), null);
	assert.equal(normalizeSyncCreatorLockRange(0, 9, 10), null);
	assert.equal(normalizeSyncCreatorLockRange(5, 5, 1), null);
});

test('middle lock only marks inside the range as locked', () => {
	const range = { start: 3, end: 5 };
	assert.equal(isSyncCreatorIndexLocked(2, range), false);
	assert.equal(isSyncCreatorIndexLocked(3, range), true);
	assert.equal(isSyncCreatorIndexLocked(5, range), true);
	assert.equal(isSyncCreatorIndexLocked(6, range), false);
	assert.equal(isSyncCreatorIndexLocked(0, null), false);
});

test('locked char times preserve only the locked span', () => {
	const saved = [1, 2, 3, 4, 5, 6];
	const times = buildSyncCreatorLockedCharTimesForRange(saved, { start: 2, end: 4 });
	assert.deepEqual(JSON.parse(JSON.stringify(times)), [null, null, 3, 4, 5, null]);
});

test('forward drag skips over the locked region, backward stops at its edge', () => {
	const range = { start: 3, end: 5 };
	assert.equal(getSyncCreatorNextEditableIndex(2, range, 10, 1), 2);
	assert.equal(getSyncCreatorNextEditableIndex(3, range, 10, 1), 6);
	assert.equal(getSyncCreatorNextEditableIndex(5, range, 10, 1), 6);
	assert.equal(getSyncCreatorNextEditableIndex(6, range, 10, 1), 6);
	assert.equal(getSyncCreatorNextEditableIndex(6, range, 10, -1), 6);
	assert.equal(getSyncCreatorNextEditableIndex(5, range, 10, -1), 2);
	assert.equal(getSyncCreatorNextEditableIndex(3, range, 10, -1), 2);
});

test('commit clamp restores the locked span exactly and caps overlapping prefix', () => {
	const saved = [10, 11, 12, 13, 14, 15];
	const draft = [20, 20.5, 999, 999, 999, 20];
	const clamped = clampSyncCreatorTimesToLockRange(draft, saved, { start: 2, end: 4 }, 0.01);
	assert.deepEqual(JSON.parse(JSON.stringify(clamped)), [11.98, 11.99, 12, 13, 14, 20]);
	assert.deepEqual(JSON.parse(JSON.stringify(draft)), [20, 20.5, 999, 999, 999, 20], 'input draft is not mutated');
});

test('commit clamp floors a suffix recorded before the locked end', () => {
	const saved = [10, 11, 12, 13, 14, 15];
	const draft = [9, 9.5, 12, 13, 14, 5];
	const clamped = clampSyncCreatorTimesToLockRange(draft, saved, { start: 2, end: 4 }, 0.01);
	assert.deepEqual(JSON.parse(JSON.stringify(clamped)), [9, 9.5, 12, 13, 14, 14.01]);
});

test('commit clamp leaves nulls and in-order times alone', () => {
	const saved = [10, 11, 12, 13, 14, 15, 16];
	const draft = [1, 2, null, null, 12, 13, 20];
	const clamped = clampSyncCreatorTimesToLockRange(draft, saved, { start: 4, end: 5 }, 0.01);
	assert.deepEqual(JSON.parse(JSON.stringify(clamped)), [1, 2, null, null, 14, 15, 20]);
});

test('commit clamp with no range returns an unchanged copy', () => {
	const draft = [5, 1, 3];
	const clamped = clampSyncCreatorTimesToLockRange(draft, [5, 1, 3], null, 0.01);
	assert.deepEqual(JSON.parse(JSON.stringify(clamped)), [5, 1, 3]);
});

test('shift rejects untimed selections', () => {
	const result = shiftSyncCreatorSelectionTimes([1, null, 3], 0, 2, 0.5, 0.001);
	assert.equal(result.ok, false);
	assert.equal(result.reason, 'untimed');
});

test('shift rejects noop deltas', () => {
	const noop = shiftSyncCreatorSelectionTimes([1, 2, 3], 0, 1, 0, 0.001);
	assert.equal(noop.ok, false);
	assert.equal(noop.reason, 'noop');
});

test('shift moves timed selections without going negative and rounds to ms', () => {
	const result = shiftSyncCreatorSelectionTimes([1, 2, 3], 0, 1, -5, 0.001);
	assert.equal(result.ok, true);
	assert.deepEqual(JSON.parse(JSON.stringify(result.times)), [0, 1, 3]);
	const rounded = shiftSyncCreatorSelectionTimes([1, 2, 3], 0, 0, 0.00055, 0.001);
	assert.equal(rounded.ok, true);
	assert.deepEqual(JSON.parse(JSON.stringify(rounded.times)), [1.001, 2, 3]);
});
