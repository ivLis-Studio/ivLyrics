import { readSyncCreatorFixture } from "./fixtures/legacy-page-source.mjs";
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { createLockedEditor } from './sync_creator_lock_harness.mjs';
import { finishSyncCreatorRecordedTimes } from '#ivlyrics/features/sync/syncCreatorRecordingTiming.mjs';

for (const [name, start, end, editable] of [
	['prefix', 0, 1, [2, 3, 4, 5]],
	['middle', 2, 3, [0, 1, 4, 5]],
	['suffix', 4, 5, [0, 1, 2, 3]],
]) {
	test(`${name} lock: real ArrowRight listener records every editable character and completes`, () => {
		const h = createLockedEditor();
		assert.equal(h.arm(start, end), true);
		const before = h.times();
		for (const [tap, index] of editable.entries()) {
			h.press('ArrowRight', 20 + tap);
			if (tap < editable.length - 1) assert.equal(h.context.keyboardCharIndexRef.current, index);
		}
		assert.equal(h.advances, 1);
		assert.deepEqual(h.times().slice(start, end + 1), before.slice(start, end + 1));
		assert.ok(h.times().every((time, index, all) => time >= 0 && (index === 0 || time >= all[index - 1])));
		h.dispose();
	});
}

test('ArrowLeft crosses a middle lock without deleting it and can undo the editable prefix', () => {
	const h = createLockedEditor();
	h.arm(2, 3);
	h.press('ArrowRight', 9); h.press('ArrowRight', 10); h.press('ArrowRight', 14);
	assert.equal(h.context.keyboardCharIndexRef.current, 4);
	h.press('ArrowLeft');
	assert.equal(h.context.keyboardCharIndexRef.current, 1);
	assert.deepEqual(h.input().slice(2, 4), [12, 13]);
	assert.equal(h.input()[4], null);
	h.press('ArrowLeft'); h.press('ArrowLeft');
	assert.equal(h.context.isKeyboardSyncingRef.current, false);
	assert.deepEqual(h.input(), [null, null, 12, 13, null, null]);
	assert.deepEqual(h.times(), [10, 11, 12, 13, 14, 15]);
});

test('Enter completion and the complete production normalizer retain an exact middle lock', () => {
	const h = createLockedEditor();
	h.arm(2, 3);
	h.press('ArrowRight', 99);
	h.press('Enter', 100);
	assert.equal(h.advances, 1);
	assert.deepEqual(h.times().slice(2, 4), [12, 13]);
	assert.ok(h.times()[0] < 12 && h.times()[1] < 12);
	assert.ok(h.times()[4] > 13);
});

test('keyboard and pointer recorders do not commit while the editor playback clock is unavailable', t => {
	const keyboard = createLockedEditor();
	t.after(keyboard.dispose);
	const initialTimes = keyboard.times();
	keyboard.press('ArrowRight', NaN);
	assert.equal(keyboard.context.isKeyboardSyncingRef.current, false);
	keyboard.press('ArrowRight', 20);
	assert.equal(keyboard.context.isKeyboardSyncingRef.current, true);
	keyboard.press('Enter', NaN);
	assert.equal(keyboard.advances, 0);
	assert.deepEqual(keyboard.times(), initialTimes);

	const pointer = createLockedEditor();
	t.after(pointer.dispose);
	pointer.pointerStart(20, { button: 0, clientX: 0, clientY: 0 });
	pointer.pointerEvent('mousemove', 21, { buttons: 1, clientX: 4, clientY: 0 });
	assert.ok(pointer.context.pointerRecordingRef.current);
	pointer.pointerEvent('mouseup', NaN, { button: 0, clientX: 4, clientY: 0 });
	assert.equal(pointer.advances, 0);
	assert.equal(pointer.context.pointerRecordingRef.current, null);
	assert.deepEqual(pointer.times(), initialTimes);
});

test('a zero-time locked boundary survives commit without negative prefix marks', () => {
	const h = createLockedEditor({ saved: [0, 0, 0, 0, 1, 2] });
	h.arm(2, 3); h.press('ArrowRight', 20); h.press('Enter', 21);
	assert.deepEqual(h.times().slice(0, 4), [0, 0, 0, 0]);
	assert.ok(h.times().every(time => time >= 0));
});

test('word forward/back and syllable shortcuts use the same protected cursor', () => {
	const h = createLockedEditor({ text: 'AB CD EF', saved: [1, 2, 3, 4, 5, 6, 7, 8] });
	h.arm(3, 4);
	h.press('.', 0.5);
	assert.equal(h.context.keyboardCharIndexRef.current, 2);
	h.press(',', 0.6);
	assert.equal(h.context.isKeyboardSyncingRef.current, false);
	h.press(';', 0.7); h.press(';', 0.8); h.press(';', 0.9); h.press(';', 6);
	assert.equal(h.context.keyboardCharIndexRef.current, 5);
	assert.deepEqual(h.input().slice(3, 5), [4, 5]);
	h.press('Enter', 7);
	assert.deepEqual(h.times().slice(3, 5), [4, 5]);
});

test('held slash completes a suffix lock and stops its keyboard repeat loop', () => {
	const h = createLockedEditor();
	h.arm(3, 5); h.press('/', 9);
	assert.equal(h.advances, 1);
	assert.deepEqual(h.times().slice(3), [13, 14, 15]);
	assert.equal(h.intervals.size, 0);
	h.release('/');
});

test('a live custom hold shortcut starts from keypress and cancels its pending repeat on keyup', t => {
	const h = createLockedEditor();
	t.after(() => h.dispose());
	const saved = h.times();
	h.context.localStorage.getItem = key => key === 'ivLyrics:visual:sync-creator-drag-alt-key' ? 'q' : null;
	h.keypress('q', 9);
	assert.equal(h.context.keyboardCharIndexRef.current, 2);
	assert.equal(h.intervals.size, 1);
	const [lateRepeat] = h.intervals.values();
	h.release('q');
	assert.equal(h.intervals.size, 0);
	assert.equal(h.context.keyboardDragRef.current, null);
	lateRepeat();
	assert.equal(h.context.keyboardCharIndexRef.current, 2);
	assert.deepEqual(h.times(), saved);
});

test('releasing a modifier stops a held recording shortcut', t => {
	const h = createLockedEditor();
	t.after(h.dispose);
	h.context.localStorage.getItem = key => key === 'ivLyrics:visual:sync-creator-drag-alt-key' ? 'ctrl+q' : null;
	h.press('q', 9, { code: 'KeyQ', ctrlKey: true });
	assert.equal(h.intervals.size, 1);
	h.release('Control', { code: 'ControlLeft', ctrlKey: false });
	assert.equal(h.intervals.size, 0);
	h.release('q', { code: 'KeyQ' });
	h.press('q', 10, { code: 'KeyQ', ctrlKey: true, repeat: true });
	assert.equal(h.context.keyboardCharIndexRef.current, 2);
	assert.equal(h.intervals.size, 0);
});

test('same-line draft recovery stops a held recording before it can write into the restored timing', t => {
	const h = createLockedEditor();
	t.after(h.dispose);
	h.context.activeSessionDraftKey = 'saved-draft';
	const record = h.record();
	const before = h.times();
	h.press('/', 20);
	assert.equal(h.intervals.size, 1);
	const repeat = h.intervals.values().next().value;
	h.context.api.applySyncCreatorSessionRecord(record, { automatic: true, announce: false });
	assert.equal(h.context.mode, 'record');
	assert.equal(h.intervals.size, 0);
	repeat();
	assert.deepEqual(h.input(), []);
	assert.deepEqual(h.times(), before);
	h.release('/');
	h.press('ArrowRight', 21);
	assert.equal(h.input()[0], 21);
});

test('a pending editor close stops recording input until a failed save allows editing again', async t => {
	const h = createLockedEditor();
	t.after(h.dispose);
	let finishSave;
	h.context.flushDraftBeforeClose = () => new Promise(resolve => { finishSave = resolve; });
	h.press('/', 20);
	assert.equal(h.intervals.size, 1);
	const recorded = h.input();
	const repeat = h.intervals.values().next().value;
	const closing = h.context.closeEditor();
	assert.equal(h.intervals.size, 0);
	repeat();
	h.press('ArrowRight', 21);
	h.pointerStart(22, { button: 0, clientX: 4, clientY: 0 });
	assert.equal(h.context.isDragging, false);
	assert.deepEqual(h.input(), recorded);
	finishSave(false);
	await closing;
	assert.ok(h.toasts.includes('syncCreator.historySaveError'));
	h.release('/');
	h.press('ArrowRight', 23);
	assert.equal(h.input()[3], 23);
});

test('a cancelled interval cannot record or stop a later hold', t => {
	const h = createLockedEditor({ text: 'ABCDEFGHIJ', saved: Array.from({ length: 10 }, (_, index) => 10 + index) });
	t.after(h.dispose);
	h.press('/', 9);
	const [oldInterval] = h.intervals.values();
	h.release('/');
	h.press('/', 10);
	const [newInterval] = h.intervals.values();
	assert.equal(h.context.keyboardCharIndexRef.current, 5);
	oldInterval();
	assert.equal(h.context.keyboardCharIndexRef.current, 5);
	assert.deepEqual([...h.intervals.values()], [newInterval]);
	newInterval();
	assert.equal(h.context.keyboardCharIndexRef.current, 6);
});

test('losing window focus stops a held recording and editable controls keep their keys', t => {
	const h = createLockedEditor();
	t.after(h.dispose);
	for (const key of ['/', 'ArrowRight', 'Backspace', ' ']) {
		h.press(key, 9, { target: { tagName: 'INPUT' } });
	}
	assert.equal(h.context.keyboardCharIndexRef.current, -1);
	h.press('/', 9);
	assert.equal(h.intervals.size, 1);
	h.blur();
	assert.equal(h.intervals.size, 0);
	assert.equal(h.context.keyboardCharIndexRef.current, 2);
	h.press('/', 10, { repeat: true });
	assert.equal(h.context.keyboardCharIndexRef.current, 2);
});

test('switching tracks on the same line discards uncommitted keyboard timing', t => {
	const h = createLockedEditor();
	t.after(h.dispose);
	const before = h.times();
	h.press('/', 9);
	assert.equal(h.intervals.size, 1);
	const [oldInterval] = h.intervals.values();
	h.context.sessionTrackKey = 'track-b';
	h.refreshKeyboard();
	assert.equal(h.intervals.size, 0);
	assert.equal(h.context.keyboardCharIndexRef.current, -1);
	oldInterval();
	assert.deepEqual(h.times(), before);
});

test('changing the character range of the same vocal cancels a held recording', t => {
	const h = createLockedEditor();
	t.after(h.dispose);
	h.press('/', 9);
	assert.equal(h.intervals.size, 1);
	const [oldInterval] = h.intervals.values();
	const before = h.times();
	// A vocal can retain its ID and displayed text after moving to a different range.
	h.context.currentLineCharRefs = h.context.currentLineCharRefs.map(ref => ({ ...ref, absoluteIndex: ref.absoluteIndex + 2 }));
	h.refreshKeyboard();
	assert.equal(h.intervals.size, 0);
	assert.equal(h.context.keyboardCharIndexRef.current, -1);
	oldInterval();
	assert.deepEqual(h.times(), before);
});

test('a same-line render retains the listener and a held key can stop when an editor takes focus', t => {
	const h = createLockedEditor({ text: 'ABCDEFGHIJ', saved: Array.from({ length: 10 }, (_, index) => 10 + index) });
	t.after(h.dispose);
	const keydownListener = h.keydownListener();
	h.press('/', 9);
	const [interval] = h.intervals.values();
	h.refreshKeyboard();
	assert.equal(h.keydownListener(), keydownListener);
	assert.deepEqual([...h.intervals.values()], [interval]);
	h.press('/', 10, { repeat: true });
	assert.equal(h.context.keyboardCharIndexRef.current, 2);
	interval();
	assert.equal(h.context.keyboardCharIndexRef.current, 3);
	h.focus({ isContentEditable: true });
	assert.equal(h.intervals.size, 0);
	interval();
	assert.equal(h.context.keyboardCharIndexRef.current, 3);
});

test('Backspace cancels the draft and clears the lock without changing saved timings', () => {
	const h = createLockedEditor();
	h.arm(2, 3); h.press('ArrowRight', 9); h.press('Backspace');
	assert.equal(h.context.getActiveRecordingLockRange(), null);
	assert.equal(h.context.isKeyboardSyncingRef.current, false);
	assert.deepEqual(h.times(), [10, 11, 12, 13, 14, 15]);
});

test('a target change removes the range before the next vocal can receive keyboard input', () => {
	const h = createLockedEditor();
	h.arm(2, 3); h.press('ArrowRight', 9);
	h.context.activeParallelTargetId = 'other'; h.refreshKeyboard();
	assert.equal(h.context.getActiveRecordingLockRange(), null);
	assert.equal(h.context.isKeyboardSyncingRef.current, false);
	assert.deepEqual(h.times(), [10, 11, 12, 13, 14, 15]);
});

test('mouse drag across a middle lock uses the same complete commit pipeline', () => {
	const h = createLockedEditor();
	h.arm(2, 3); h.drag(0, [[1, 10], [4, 14], [5, 15]]);
	assert.equal(h.advances, 1);
	assert.deepEqual(h.times(), [9, 10, 12, 13, 14, 15]);
});

test('a mouse drag continuing keyboard input before a middle lock keeps the recorded prefix', t => {
	const h = createLockedEditor();
	t.after(h.dispose);
	h.arm(3, 4);
	h.press('ArrowRight', 2);
	h.drag(1, [[2, 3], [5, 16]], 2.5);
	assert.equal(h.advances, 1);
	assert.deepEqual(h.times(), [2, 2.5, 3, 13, 14, 16]);
});

test('an unrecorded gap after a zero-second mark is filled relative to that mark', () => {
	assert.deepEqual(finishSyncCreatorRecordedTimes([0, null, 0.5], { endIndex: 2, charCount: 3, endTime: 2 }), [0, 0.02, 0.5]);
});

for (const input of ['mouse', 'touch']) {
	test(`a ${input} release records its last character even when the move event was coalesced`, t => {
		const h = createLockedEditor();
		t.after(h.dispose);
		const point = clientX => ({ identifier: 9, clientX, clientY: 0 });
		if (input === 'mouse') {
			h.pointerStart(9, { button: 0, ...point(0) });
			h.pointerEvent('mouseup', 11, { button: 0, ...point(5) });
		} else {
			h.pointerStart(9, { changedTouches: [point(0)] });
			h.pointerEvent('touchend', 11, { changedTouches: [point(5)] });
		}
		assert.equal(h.advances, 1);
		assert.equal(h.times().at(-1) >= 11 && h.times().at(-1) < 11.2, true);
	});
}

test('word interpolation remains enabled around a protected suffix', () => {
	const h = createLockedEditor({ text: 'AB CD EF', saved: [1, 2, 3, 4, 5, 6, 7, 8] });
	h.arm(6, 7); h.press('.', 1); h.press('.', 3);
	assert.equal(h.advances, 1);
	assert.ok(h.times()[1] - h.times()[0] > 0.1, 'word timings retain interpolation rather than collapsing to sequential millisecond marks');
	assert.deepEqual(h.times().slice(6), [7, 8]);
});

test('plain context menu selects one character; another click inside clears selection', () => {
	const h = createLockedEditor(); h.context.mode = 'idle';
	h.contextMenu(2);
	assert.deepEqual(JSON.parse(JSON.stringify(h.context.offsetSelectionRangeRef.current)), { start: 2, end: 2 });
	h.api.adjustCurrentLineOffset(100);
	assert.deepEqual(h.times(), [10, 11, 12.1, 13, 14, 15]);
	h.contextMenu(2);
	assert.equal(h.context.offsetSelectionRangeRef.current, null);
});

test('a plain right-click arms the whole word under the cursor; a second right-click disarms it', () => {
	const h = createLockedEditor({ text: 'AB CD EF', saved: [1, 2, 3, 4, 5, 6, 7, 8] });
	h.context.mode = 'idle'; h.context.syncGranularity = 'word';
	const words = [{ start: 0, end: 1 }, { start: 3, end: 4 }, { start: 6, end: 7 }];
	h.context.getGranularityRangeForIndex = index => words.find(word => index >= word.start && index <= word.end) || null;
	h.contextMenu(4);
	assert.deepEqual(JSON.parse(JSON.stringify(h.context.offsetSelectionRangeRef.current)), { start: 3, end: 4 });
	assert.equal(h.context.offsetSelectionTargetRef.current?.lineStart, h.context.currentLineStart, 'the armed range records its target');
	h.api.adjustCurrentLineOffset(100);
	assert.deepEqual(h.times(), [1, 2, 3, 4.1, 5.1, 6, 7, 8]);
	h.contextMenu(3);
	assert.equal(h.context.offsetSelectionRangeRef.current, null);
	h.contextMenu(7);
	assert.deepEqual(JSON.parse(JSON.stringify(h.context.offsetSelectionRangeRef.current)), { start: 6, end: 7 },
		'a click on the last glyph still arms the word from its first glyph');
});

test('plain right-click arming stays single-glyph outside word mode', () => {
	const h = createLockedEditor({ text: 'AB CD EF', saved: [1, 2, 3, 4, 5, 6, 7, 8] });
	h.context.mode = 'idle'; h.context.syncGranularity = 'line';
	h.context.getGranularityRangeForIndex = () => ({ start: 0, end: 7 });
	h.contextMenu(4);
	assert.deepEqual(JSON.parse(JSON.stringify(h.context.offsetSelectionRangeRef.current)), { start: 4, end: 4 });
});

test('character spans take the right-click in character mode and, outside record mode, in word mode', () => {
	const h = createLockedEditor();
	const enabled = vm.runInContext('isSyncCreatorCharContextMenuEnabled', h.context);
	assert.equal(enabled('character', 'record'), true, 'record-mode locks stay on character spans');
	assert.equal(enabled('character', 'idle'), true);
	assert.equal(enabled('word', 'idle'), true, 'a plain right-click can arm a word');
	assert.equal(enabled('word', 'record'), false, 'record-mode locks are character-only');
	assert.equal(enabled('line', 'idle'), false);
	const source = readSyncCreatorFixture();
	assert.match(source, /onContextMenu: options\.wordSpacer \|\| !isSyncCreatorCharContextMenuEnabled\(syncGranularity, mode\)/,
		'the character span wiring uses the shared rule');
});

test('a selection armed for another vocal never shifts the current one', () => {
	const h = createLockedEditor(); h.context.mode = 'idle'; h.select(1, 2);
	const before = h.times();
	h.context.activeParallelTargetId = 'another-part';
	h.api.adjustCurrentLineOffset(100);
	assert.deepEqual(h.times(), before, 'a stale target is ignored before the clearing effect runs');
	h.context.activeParallelTargetId = 'full';
	h.api.adjustCurrentLineOffset(100);
	assert.deepEqual(h.times(), [10, 11.1, 12.1, 13, 14, 15]);
});

test('queued repeated selection offsets compute from the latest functional state', () => {
	const h = createLockedEditor(); h.context.mode = 'idle'; h.select(1, 2);
	const queued = [], apply = h.context.setSyncData;
	h.context.setSyncData = updater => queued.push(updater);
	h.api.adjustCurrentLineOffset(100); h.api.adjustCurrentLineOffset(100);
	for (const updater of queued) apply(updater);
	assert.deepEqual(h.times(), [10, 11.2, 12.2, 13, 14, 15]);
});

test('selection offsets reject untimed targets and leave other timing marks unchanged', () => {
	const h = createLockedEditor(); h.context.mode = 'idle'; h.select(1, 2);
	h.context.syncData.lines.find(line => line.start === h.context.currentLineStart).chars[1] = null;
	const before = h.times(); h.api.adjustCurrentLineOffset(100);
	assert.deepEqual(h.times(), before);
	assert.ok(h.toasts.includes('syncCreator.selectionOffsetRequiresTiming'));
});

test('locking an untimed middle span never converts missing marks into zero', () => {
	const h = createLockedEditor({ saved: [10, 11, null, 13, 14, 15] });
	assert.equal(h.arm(2, 3), false);
	assert.equal(h.context.getActiveRecordingLockRange(), null);
	assert.ok(h.toasts.includes('settings.syncLockRequiresTiming'));
});

test('a committed zero-boundary lock retains its exact marks through export and reload', async () => {
	const h = createLockedEditor({ saved: [0, 0, 0, 0, 1, 2] });
	h.arm(2, 3); h.press('ArrowRight', 20); h.press('Enter', 21);
	const result = await h.export();
	const saved = result.lines.find(line => line.start === h.context.currentLineStart);
	assert.deepEqual(saved.chars.slice(0, 4), [0, 0, 0, 0]);
	await h.import(result);
	assert.deepEqual(h.times().slice(0, 4), [0, 0, 0, 0]);
});

test('dragging back inside a prefix lock cancels all editable input without committing', () => {
	const h = createLockedEditor();
	h.arm(0, 1); h.drag(2, [[4, 14], [1, 15]], 12);
	assert.equal(h.advances, 0);
	assert.deepEqual(h.times(), [10, 11, 12, 13, 14, 15]);
	assert.deepEqual(h.input(), [10, 11, null, null, null, null]);
});

for (const mode of ['record', 'idle', 'preview']) {
	for (const [start, end] of [[2, 3], [3, 2]]) {
		test(`${mode}: actual right-drag listeners select ${start} to ${end} and suppress the trailing context menu`, () => {
			const h = createLockedEditor(); h.context.mode = mode;
			h.rightDrag(start, end);
			const range = mode === 'record' ? h.context.getActiveRecordingLockRange() : h.context.offsetSelectionRangeRef.current;
			assert.deepEqual(JSON.parse(JSON.stringify(range)), { start: 2, end: 3 });
		});
	}
}

test('navigation or mode changes clear selection and cancel an in-flight right drag', () => {
	const h = createLockedEditor(); h.context.mode = 'preview';
	h.rightDrag(1, 2);
	assert.ok(h.context.offsetSelectionRangeRef.current);
	h.pointerStart(9, { button: 2, clientX: 1, clientY: 0 });
	assert.equal(h.context.pointerGestureRef.current?.kind, 'offset');
	h.resetSelection({ currentLineIndex: 2, mode: 'idle' });
	h.pointerEvent('mouseup', 10, { button: 2, clientX: 4, clientY: 0 });
	assert.equal(h.context.offsetSelectionRangeRef.current, null);
	assert.equal(h.context.pointerGestureRef.current, null);
});

test('mouse completion advances after the last editable character before a suffix lock', () => {
	const h = createLockedEditor();
	h.arm(4, 5); h.drag(0, [[1, 10], [2, 11], [3, 12]]);
	assert.equal(h.advances, 1);
	assert.deepEqual(h.times().slice(4), [14, 15]);
});

test('only releasing the mouse button that began recording can commit its edits', t => {
	const h = createLockedEditor();
	t.after(h.dispose);
	const before = h.times();
	h.pointerStart(9, { button: 1, clientX: 0, clientY: 0 });
	assert.equal(h.context.isDragging, false);
	h.pointerStart(9, { button: 0, clientX: 0, clientY: 0 });
	h.pointerEvent('mousemove', 10, { buttons: 1, clientX: 2, clientY: 0 });
	h.pointerEvent('mouseup', 11, { button: 2, clientX: 2, clientY: 0 });
	h.press('ArrowRight', 11);
	assert.equal(h.context.recordingCharIndexRef.current, 2);
	assert.equal(h.context.isDragging, true);
	assert.deepEqual(h.times(), before);
	h.pointerEvent('mousemove', 12, { buttons: 1, clientX: 5, clientY: 0 });
	h.pointerEvent('mouseup', 13, { button: 0, clientX: 5, clientY: 0 });
	assert.equal(h.advances, 1);
	assert.equal(h.context.isDragging, false);
	assert.deepEqual(h.times(), [9, 10, 10.001, 12, 12.001, 12.002]);
});

test('a second touch cannot move or finish the recording and cancelling the owning touch leaves saved timing intact', t => {
	const h = createLockedEditor();
	t.after(h.dispose);
	const before = h.times();
	const touch = (identifier, clientX) => ({ identifier, clientX, clientY: 0 });
	h.pointerStart(9, { changedTouches: [touch(11, 0)], touches: [touch(11, 0)] });
	h.pointerEvent('touchmove', 10, { changedTouches: [touch(12, 5)], touches: [touch(12, 5), touch(11, 0)] });
	h.pointerEvent('touchend', 11, { changedTouches: [touch(12, 5)] });
	assert.equal(h.context.recordingCharIndexRef.current, 0);
	assert.equal(h.context.isDragging, true);
	h.pointerEvent('touchmove', 12, { changedTouches: [touch(11, 3)] });
	assert.equal(h.context.recordingCharIndexRef.current, 3);
	h.pointerEvent('touchcancel', 13, { changedTouches: [touch(11, 3)] });
	h.pointerEvent('touchend', 14, { changedTouches: [touch(11, 3)] });
	assert.equal(h.context.isDragging, false);
	assert.deepEqual(h.times(), before);
	assert.deepEqual(h.input(), []);
});

test('abandoning a mouse drag restores the keyboard draft and its score input', t => {
	const h = createLockedEditor();
	t.after(h.dispose);
	const before = h.times();
	h.press('ArrowRight', 9);
	const keyboardDraft = h.input();
	const score = { key: 'track-a', indexes: new Set([0]), anchors: new Set([0]), inputCount: 1 };
	h.context.scoreInputRef.current = score;
	h.pointerStart(10, { button: 0, clientX: 4, clientY: 0 });
	score.indexes.add(4);
	h.blur();
	assert.equal(h.context.isDragging, false);
	assert.equal(h.context.isKeyboardSyncingRef.current, true);
	assert.equal(h.context.keyboardCharIndexRef.current, 0);
	assert.deepEqual(h.input(), keyboardDraft);
	assert.deepEqual([...h.context.scoreInputRef.current.indexes], [0]);
	h.pointerEvent('mouseup', 11, { button: 0, clientX: 4, clientY: 0 });
	assert.deepEqual(h.times(), before);
	h.pointerStart(12, { button: 0, clientX: 1, clientY: 0 });
	h.pointerEvent('mousemove', 13, { buttons: 0, clientX: 3, clientY: 0 });
	assert.equal(h.context.isDragging, false);
	assert.deepEqual(h.input(), keyboardDraft);
	h.pointerStart(14, { button: 0, clientX: 3, clientY: 0 });
	assert.equal(h.context.isDragging, true);
	h.hide();
	assert.equal(h.context.isDragging, false);
	assert.deepEqual(h.input(), keyboardDraft);
});

test('changing targets discards the pending mouse recording and ignores its late release', t => {
	const h = createLockedEditor();
	t.after(h.dispose);
	const before = h.times();
	h.pointerStart(9, { button: 0, clientX: 0, clientY: 0 });
	h.pointerEvent('mousemove', 10, { buttons: 1, clientX: 3, clientY: 0 });
	h.resetSelection({ sessionTrackKey: 'track-b' });
	h.pointerEvent('mouseup', 11, { button: 0, clientX: 5, clientY: 0 });
	assert.equal(h.context.isDragging, false);
	assert.equal(h.context.pointerGestureRef.current, null);
	assert.deepEqual(h.times(), before);
	assert.deepEqual(h.input(), []);
});

test('a locked selected vocal commits without moving its sibling or protected marks', () => {
	const h = createLockedEditor();
	h.split(3); h.render('b'); h.refreshKeyboard();
	const siblingBefore = JSON.parse(JSON.stringify(h.context.currentParallelData.parts[0].chars));
	const selectedBefore = JSON.parse(JSON.stringify(h.context.activeParallelPart.chars));
	assert.equal(h.arm(1, 2), true); h.press('ArrowRight', 20);
	const parts = h.line().parallel.parts;
	assert.deepEqual(JSON.parse(JSON.stringify(parts[0].chars)), siblingBefore);
	assert.deepEqual(JSON.parse(JSON.stringify(parts[1].chars.slice(1))), selectedBefore.slice(1));
	assert.equal(h.advances, 1);
});
