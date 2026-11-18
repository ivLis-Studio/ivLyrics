import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../SyncDataCreator.js', import.meta.url), 'utf8');
const start = source.indexOf('\t// Preview follows playback on its own.');
const end = source.indexOf('\tconst handleSeek =', start);
assert.ok(start >= 0 && end > start, 'missing preview navigation section');

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
	const context = vm.createContext({
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
		Spicetify: { Player: { seek() {} } },
	});
	context.setMode = value => {
		context.mode = typeof value === 'function' ? value(context.mode) : value;
	};
	context.setCurrentLineIndex = value => {
		context.currentLineIndex = typeof value === 'function' ? value(context.currentLineIndex) : value;
	};
	context.setActiveParallelPartId = value => { context.activeParallelTargetId = value; };
	vm.runInContext(`globalThis.api = (() => {
		${source.slice(start, end)}
		return { goToPrevLine, goToNextLine, goToFirstLine, goToPreviousSyncTarget, goToNextSyncTarget,
			leavePreviewForLineNavigation };
	})();`, context);
	const press = (key) => {
		const called = { preventDefault: 0, stopPropagation: 0 };
		keydown({
			key,
			target: {},
			preventDefault: () => { called.preventDefault++; },
			stopPropagation: () => { called.stopPropagation++; },
		});
		return called;
	};
	return { context, api: context.api, press };
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
