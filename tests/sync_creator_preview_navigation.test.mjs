import assert from 'node:assert/strict';
import { createSyncCreatorEditorLifetime } from '#ivlyrics/features/sync/syncCreatorEditorLifetime.mjs';
import { useSyncCreatorNavigation } from "#ivlyrics/features/sync/syncCreatorNavigation.mjs";
import test from 'node:test';

// Run the shipping manual-navigation callbacks and the production arrow-key
// listener. Only React hosting, playback state and scroll nodes are replaced.
const createEditor = ({
	mode = 'preview',
	currentLineIndex = 0,
	previousNavigableLineIndex = -1,
	nextNavigableLineIndex = 1,
	lines = ['Line 1', 'Line 2', 'Line 3'],
	parallelParts = [],
	activeParallelTargetId = '',
} = {}) => {
	let keydown = null;
	const seeks = [];
	const lifetime = createSyncCreatorEditorLifetime(() => true);
	const context = {
		console,
		useCallback: callback => callback,
		useEffect: callback => { callback(); },
		window: {
			addEventListener: (name, callback) => { if (name === 'keydown') keydown = callback; },
			removeEventListener: () => {},
		},
		lyricsScrollRef: { current: { scrollLeft: 40 } },
		pendingParallelNavigationRef: { current: null },
		manualPreviewExitRef: { current: false },
		lyricsText: lines.join('\n'),
		lyricsLines: lines,
		previousNavigableLineIndex,
		nextNavigableLineIndex,
		currentParallelParts: parallelParts,
		currentLineIndex,
		mode,
		activeParallelTargetId,
		claimSessionForLocalEditing() {},
		resetCurrentSyncInput() {},
		selectParallelPart(partId) { context.activeParallelTargetId = partId; },
		Spicetify: { Player: { seek: position => seeks.push(position) } },
	};
	context.setMode = value => {
		context.mode = typeof value === 'function' ? value(context.mode) : value;
	};
	context.setCurrentLineIndex = value => {
		context.currentLineIndex = typeof value === 'function' ? value(context.currentLineIndex) : value;
	};
	context.setActiveParallelPartId = value => { context.activeParallelTargetId = value; };
	const api = useSyncCreatorNavigation({
		react: { useCallback: context.useCallback, useEffect: context.useEffect },
		host: context.window, getPlayer: () => context.Spicetify.Player, canStartOperation: lifetime.canStartOperation,
		editor: context, refs: context, actions: context,
	});
	const press = (key, event = {}) => {
		const called = { preventDefault: 0, stopPropagation: 0 };
		keydown({
			key,
			target: {},
			...event,
			preventDefault: () => { called.preventDefault++; },
			stopPropagation: () => { called.stopPropagation++; },
		});
		return called;
	};
	return { context, api, press, seeks, lifetime };
};

test('line navigation buttons leave preview and change the edited line', () => {
	const next = createEditor({ currentLineIndex: 0, nextNavigableLineIndex: 1 });
	next.api.goToNextLine();
	assert.equal(next.context.mode, 'idle');
	assert.equal(next.context.currentLineIndex, 1);
	assert.equal(next.context.manualPreviewExitRef.current, true,
		'the polling loop must stop snapping to the playback line before cleanup');

	const previous = createEditor({ currentLineIndex: 2, previousNavigableLineIndex: 1 });
	previous.api.goToPrevLine();
	assert.equal(previous.context.mode, 'idle');
	assert.equal(previous.context.currentLineIndex, 1);

	const first = createEditor({ currentLineIndex: 2 });
	first.api.goToFirstLine();
	assert.equal(first.context.mode, 'idle');
	assert.equal(first.context.currentLineIndex, 0);
});

test('arrow keys leave preview while navigating lines', () => {
	const down = createEditor({ currentLineIndex: 0, nextNavigableLineIndex: 1 });
	const consumed = down.press('ArrowDown');
	assert.equal(down.context.mode, 'idle');
	assert.equal(down.context.currentLineIndex, 1);
	assert.equal(consumed.preventDefault, 1);

	const up = createEditor({ currentLineIndex: 2, previousNavigableLineIndex: 1 });
	up.press('ArrowUp');
	assert.equal(up.context.mode, 'idle');
	assert.equal(up.context.currentLineIndex, 1);
});

test('an arrow press with no target still leaves preview', () => {
	const editor = createEditor({ currentLineIndex: 0, previousNavigableLineIndex: -1 });
	editor.press('ArrowUp');
	assert.equal(editor.context.mode, 'idle');
	assert.equal(editor.context.currentLineIndex, 0);
});

test('switching vocal parts with the arrow keys leaves preview', () => {
	const parts = [{ id: 'lead' }, { id: 'background' }];
	const editor = createEditor({
		currentLineIndex: 1,
		nextNavigableLineIndex: 2,
		parallelParts: parts,
		activeParallelTargetId: 'lead',
	});
	editor.press('ArrowDown');
	assert.equal(editor.context.mode, 'idle');
	assert.equal(editor.context.activeParallelTargetId, 'background');
	assert.equal(editor.context.currentLineIndex, 1, 'a part switch is not a line change');
});

test('navigation outside preview keeps the current mode', () => {
	for (const mode of ['idle', 'record']) {
		const editor = createEditor({ mode, currentLineIndex: 0, nextNavigableLineIndex: 1 });
		editor.api.goToNextLine();
		assert.equal(editor.context.mode, mode);
		assert.equal(editor.context.currentLineIndex, 1);
		assert.equal(editor.context.manualPreviewExitRef.current, false);
		editor.press('ArrowDown');
		assert.equal(editor.context.mode, mode);
	}
});

test('arrow shortcuts respect composition, native controls and prior handlers', () => {
	const editor = createEditor();
	for (const event of [
		{ isComposing: true }, { keyCode: 229 }, { shiftKey: true }, { defaultPrevented: true },
		{ target: { isContentEditable: true } }, { target: { tagName: 'SELECT' } },
		{ target: { closest: () => ({}) } },
	]) {
		assert.deepEqual(editor.press('ArrowDown', event), { preventDefault: 0, stopPropagation: 0 });
	}
	assert.equal(editor.context.mode, 'preview');
	assert.equal(editor.context.currentLineIndex, 0);
});

test('navigation and seeking stay suspended while close saves and recover on failure', async () => {
	const editor = createEditor({ currentLineIndex: 1, previousNavigableLineIndex: 0, nextNavigableLineIndex: 2 });
	const { Player: player } = editor.context.Spicetify;
	player.getProgress = () => 5000;
	player.getDuration = () => 10000;
	let finishSave;
	const saving = new Promise(resolve => { finishSave = resolve; });
	const close = {
		stopRecording() {}, saveDraft: () => saving, onSaveError() {}, onClosed() {},
	};
	const attempt = editor.lifetime.requestClose(close);
	try {
		editor.api.goToNextLine();
		editor.api.goToPrevLine();
		editor.api.goToFirstLine();
		editor.api.handleSeek({ clientX: 100, currentTarget: { getBoundingClientRect: () => ({ left: 0, width: 200 }) } });
		editor.api.handleSeekOffset(500);
		assert.deepEqual(editor.press('ArrowDown'), { preventDefault: 0, stopPropagation: 0 });
		assert.equal(editor.context.currentLineIndex, 1);
		assert.equal(editor.context.mode, 'preview');
		assert.deepEqual(editor.seeks, []);
	} finally {
		finishSave(false);
		await attempt;
	}

	assert.equal(editor.press('ArrowDown').preventDefault, 1);
	assert.equal(editor.context.currentLineIndex, 2);
	editor.api.handleSeekOffset(500);
	assert.deepEqual(editor.seeks, [5500]);
	await editor.lifetime.requestClose({ ...close, saveDraft: () => true });
	assert.equal(editor.press('ArrowUp').preventDefault, 0);
	editor.api.goToFirstLine();
	assert.equal(editor.context.currentLineIndex, 2);
});

test('seek controls accept the zero pixel boundary and ignore unavailable geometry or playback', () => {
	const editor = createEditor();
	const { Player: player } = editor.context.Spicetify;
	player.getProgress = () => 9000;
	player.getDuration = () => 10000;
	player.data = { item: { duration: { milliseconds: 10000 } } };
	const currentTarget = { getBoundingClientRect: () => ({ left: 0, width: 200 }) };
	editor.api.handleSeek({ currentTarget, clientX: 0 });
	editor.api.handleSeek({ currentTarget, changedTouches: [{ clientX: 100 }] });
	editor.api.handleSeek({ currentTarget, clientX: 300 });
	editor.api.handleSeekOffset(3000);
	player.getProgress = () => 500;
	editor.api.handleSeekOffset(-3000);
	assert.deepEqual(editor.seeks, [0, 5000, 10000, 10000, 0]);

	editor.api.handleSeek({ currentTarget });
	editor.api.handleSeek({ currentTarget: { getBoundingClientRect: () => ({ left: 0, width: 0 }) }, clientX: 100 });
	player.getProgress = () => undefined;
	editor.api.handleSeekOffset(10);
	player.getDuration = () => NaN;
	player.data = null;
	editor.api.handleSeek({ currentTarget, clientX: 100 });
	assert.equal(editor.seeks.length, 5);
});
