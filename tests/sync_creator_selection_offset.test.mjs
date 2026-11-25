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
	'\nglobalThis.__selectionHelpers = { normalizeSyncCreatorLockRange, resolveSyncCreatorOffsetSelectionRange, shiftSyncCreatorSelectionTimes, clampSyncCreatorTimesToLockRange };',
	context
);
const {
	normalizeSyncCreatorLockRange,
	resolveSyncCreatorOffsetSelectionRange,
	shiftSyncCreatorSelectionTimes,
	clampSyncCreatorTimesToLockRange,
} = context.__selectionHelpers;
const plain = (value) => JSON.parse(JSON.stringify(value));

test('offset shift moves only the selected range', () => {
	const result = plain(shiftSyncCreatorSelectionTimes([1.0, 1.5, 2.0, 2.5], 1, 2, 0.3, 0.01));
	assert.equal(result.ok, true);
	assert.deepEqual(result.times, [1.0, 1.8, 2.3, 2.5]);
});

test('offset shift clamps at the unselected neighbor instead of overlapping it', () => {
	const result = plain(shiftSyncCreatorSelectionTimes([10, 11, 12, 20, 21], 0, 2, 9, 0.01));
	assert.deepEqual(result, { ok: true, times: [17.99, 18.99, 19.99, 20, 21] });
});

test('untimed selection is rejected without touching timing', () => {
	const result = plain(shiftSyncCreatorSelectionTimes([1.0, null, 2.0], 0, 2, 0.5, 0.01));
	assert.deepEqual(result, { ok: false, reason: 'untimed' });
});

test('lock range survives a re-record commit exactly', () => {
	const saved = [10, 11, 12, 13, 14, 15];
	const draft = [20, 20.5, 999, 999, 999, 20];
	const clamped = plain(clampSyncCreatorTimesToLockRange(draft, saved, { start: 2, end: 4 }, 0.01));
	assert.deepEqual(clamped, [11.98, 11.99, 12, 13, 14, 20]);
	assert.deepEqual(clamped.slice(2, 5), [12, 13, 14]);
	assert.deepEqual(plain(draft), [20, 20.5, 999, 999, 999, 20], 'input draft is not mutated');
});

test('offset drag resolves in either direction', () => {
	assert.deepEqual(plain(resolveSyncCreatorOffsetSelectionRange(1, 3, 6)), { start: 1, end: 3 });
	assert.deepEqual(plain(resolveSyncCreatorOffsetSelectionRange(3, 1, 6)), { start: 1, end: 3 });
});

test('full-line offset drag falls back to whole-line semantics', () => {
	assert.equal(resolveSyncCreatorOffsetSelectionRange(0, 5, 6), null);
});

test('single-click offset gesture is not a drag range', () => {
	assert.equal(resolveSyncCreatorOffsetSelectionRange(2, 2, 6), null);
	assert.equal(resolveSyncCreatorOffsetSelectionRange(1, 2, 0), null);
});

test('offset drag clamps out-of-range edges instead of rejecting', () => {
	assert.deepEqual(plain(resolveSyncCreatorOffsetSelectionRange(-1, 2, 6)), { start: 0, end: 2 });
});

test('shifted block keeps internal relative timing against the next neighbor', () => {
	const result = plain(shiftSyncCreatorSelectionTimes([10, 11, 12, 20, 21], 0, 2, 9, 0.01));
	assert.equal(result.ok, true);
	assert.deepEqual(result.times, [17.99, 18.99, 19.99, 20, 21]);
});

test('shifted block keeps internal relative timing against the previous neighbor', () => {
	const result = plain(shiftSyncCreatorSelectionTimes([0, 10, 11, 12], 1, 3, -12, 0.01));
	assert.equal(result.ok, true);
	assert.deepEqual(result.times, [0, 0.01, 1.01, 2.01]);
});

test('record lock range helper stays available to the offset wiring', () => {
	assert.deepEqual(plain(normalizeSyncCreatorLockRange(7, 3, 10)), { start: 3, end: 7 });
});
