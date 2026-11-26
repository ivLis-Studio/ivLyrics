import { createSyncCreatorPointerGestures } from '#ivlyrics/features/sync/syncCreatorPointerSelection.mjs';
import { useSyncCreatorSelectionReset } from '#ivlyrics/features/sync/syncCreatorCharacterSelection.mjs';
import { createSyncCreatorSessionLifecycle, createSyncCreatorSessionRefs } from '#ivlyrics/features/sync/syncCreatorSessionLifecycle.mjs';
import { createSyncCreatorImportPicker } from '#ivlyrics/features/sync/syncCreatorFileTransfer.mjs';
import { isLeadingChar, isTrailingChar, isWordBoundary } from '#ivlyrics/features/sync/syncCreatorRecordingTiming.mjs';
import { createSyncCreatorDraftStore } from "#ivlyrics/features/sync/createSyncCreatorDraftStore.mjs";
import { createSyncCreatorLyricDocument } from "#ivlyrics/features/sync/syncCreatorLyricText.mjs";
import { readSyncCreatorFixture } from "./fixtures/legacy-page-source.mjs";
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import syncDataCodec from '#ivlyrics/features/sync/SyncDataCodec.mjs';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';

const fixtureUrl = new URL('./sync_creator_segment_offset.test.mjs', import.meta.url);
const fixture = readFileSync(fixtureUrl, 'utf8');
const fixtureStart = fixture.indexOf('const source =');
const fixtureEnd = fixture.indexOf("test('manual split offset");
assert.ok(fixtureStart >= 0 && fixtureEnd > fixtureStart);
const { createEditor } = new Function('assert', 'readFileSync', 'readSyncCreatorFixture', 'syncDataCodec', 'pathToFileURL', 'vm', 'createSyncCreatorLyricDocument', 'createSyncCreatorDraftStore', 'createSyncCreatorSessionLifecycle', 'createSyncCreatorSessionRefs', 'createSyncCreatorImportPicker',
	fixture.slice(fixtureStart, fixtureEnd).replaceAll('import.meta.url', JSON.stringify(fixtureUrl.href))
	+ '\nreturn { createEditor };')(assert, readFileSync, readSyncCreatorFixture, syncDataCodec, pathToFileURL, vm, createSyncCreatorLyricDocument, createSyncCreatorDraftStore, createSyncCreatorSessionLifecycle, createSyncCreatorSessionRefs, createSyncCreatorImportPicker);
const source = readSyncCreatorFixture();
const section = (start, end) => {
	const from = source.indexOf(start), to = source.indexOf(end, from + start.length);
	assert.ok(from >= 0 && to > from, start);
	return source.slice(from, to);
};

function createListenerRegistry() {
	const listeners = new Map();
	return {
		addEventListener(name, fn) {
			if (!listeners.has(name)) listeners.set(name, new Set());
			listeners.get(name).add(fn);
		},
		removeEventListener(name, fn) {
			listeners.get(name)?.delete(fn);
		},
		get(name) {
			return listeners.get(name)?.values().next().value;
		},
		dispatch(name, event) {
			listeners.get(name)?.forEach(listener => listener(event));
		},
	};
}

// Run the shipping event listeners, lock callbacks and complete commit pipeline.
// Only React state/effect hosting, playback time and document events are replaced.
export function createLockedEditor({ text = 'ABCDEF', saved = [10, 11, 12, 13, 14, 15] } = {}) {
	const editor = createEditor({ rows: ['PRE', text, 'TAIL'] });
	const { context } = editor;
	editor.line().chars = [...saved];
	editor.render();
	let progress = 0, advances = 0, nextInterval = 0;
	const events = createListenerRegistry(), windowEvents = createListenerRegistry();
	const intervals = new Map(), toasts = [], setters = [];
	const extra = [
		section('\tconst getSyncCreatorLineTimes =', '\t// 상태 관리'),
		section('\tconst setRecordingLockIndexValue =', '\t// 트랙 정보'),
		section('\tconst getCurrentSyncTargetSavedChars =', '\tconst {\n\t\tcurrentLineText,'),
		section('\tconst [offsetSelectionRange, setOffsetSelectionRange]', '\tconst applyRecordingLockRange ='),
		section('\tconst applyRecordingLockRange =', '\n\tconst lastCharEndShortcutRef'),
		`const readPointerRecorder = () => {
			${section('\tconst { start: handleDragStart,', '\tconst closeEditor =')}
			return { handleDragStart, handleDragMove, handleDragEnd, handleDragCancel };
		};
		const handleDragStart = (...args) => readPointerRecorder().handleDragStart(...args);
		const handleDragMove = (...args) => readPointerRecorder().handleDragMove(...args);
		const handleDragEnd = (...args) => readPointerRecorder().handleDragEnd(...args);
		const handleDragCancel = (...args) => readPointerRecorder().handleDragCancel(...args);`,
		section('\tconst resetCurrentSyncInput =', '\t// Offset-selection range for preview/idle'),
		section('\tconst lifetimeRef =', '\tconst captureEditorDraftOwnership ='),
		section('\tconst closeEditor =', '\tuseLayoutEffect(() => registerCloseRequest'),
	].join('\n');
	const effect = section('\t// Refresh the recording target', '\tconst handleContainerMouseDown =');
	Object.assign(context, {
		isLeadingChar, isTrailingChar, isWordBoundary,
		mode: 'record', currentLineText: text, syncGranularity: 'character', sessionTrackKey: 'track-a',
		localStorage: { getItem: () => null },
		isDragging: false,
		currentLineEffectiveSyllableSegments: Array.from(text, (_, index) => ({ start: index, end: index })),
		currentGranularityRanges: [], interpolationEnabledRef: { current: true },
		Spicetify: { Player: { getProgress: () => progress * 1000, getDuration: () => 180000 } },
		Toast: { success: value => toasts.push(value), error: value => toasts.push(value) },
		advanceAfterCompletedTarget: () => { advances++; },
		flushDraftBeforeClose: async () => true,
		containerRef: { current: { isConnected: true } },
		lrclibSearchRequests: { cancel() {}, dispose() {} },
		cancelImport() {},
		cancelSourceLoading() {},
		markScoreTimingInput() {},
		cacheCharHitBoxes() {}, getGranularityEndIndex: index => index,
		getGranularityRangeForIndex: index => ({ start: index, end: index }),
		getCharIndexFromPoint: x => Math.max(0, Math.min(Math.round(x), context.currentLineChars.length - 1)),
		useState: initial => [initial, value => { context.offsetSelectionRange = value; }],
		useRef: initial => ({ current: initial }),
		setRecordingProgressIndex: index => { context.recordingCharIndexRef.current = index; },
		setInterval: fn => { const id = ++nextInterval; intervals.set(id, fn); return id; },
		clearInterval: id => intervals.delete(id),
		useLayoutEffect: setup => setup(),
	});
	Object.assign(context.document, events, { defaultView: windowEvents });
	for (const [, name] of (extra + effect).matchAll(/\b(\w+Ref)\.current/g)) context[name] ??= { current: null };
	Object.assign(context, {
		recordingLockIndexRef: { current: -1 }, recordingLockRangeRef: { current: null },
		recordingCharIndexRef: { current: -1 }, isKeyboardSyncingRef: { current: false },
		keyboardCharIndexRef: { current: -1 }, charTimesRef: { current: [] },
		charHitBoxesRef: { current: [] }, charScrollMetricsRef: { current: [] },
		prevKeyboardTargetRef: { current: null },
		lastCharEndShortcutRef: { current: null }, keyboardShortcutContextRef: { current: null },
		pendingWordSyncRef: { current: null }, pendingSyllableSyncRef: { current: null },
		keyboardDragRef: { current: null },
		pointerRecordingRef: { current: null },
		pointerGestureRef: { current: null },
		suppressNextLockContextMenuRef: { current: false },
		scoreInputRef: { current: null },
	});
	context.clearPointerRecording = () => {
		context.pointerRecordingRef.current = context.pointerGestureRef.current = null;
		context.isDragging = false;
	};
	for (const [, name] of extra.matchAll(/\b(set[A-Z]\w*)\b/g)) {
		if (context[name]) continue;
		const property = name[3].toLowerCase() + name.slice(4);
		context[name] = value => { setters.push(name); context[property] = typeof value === 'function' ? value(context[property]) : value; };
	}
	vm.runInContext(`Object.assign(globalThis, (() => { ${extra}
		return { getActiveRecordingLockRange, getActiveRecordingLockIndex, getCurrentSyncTargetSavedChars,
			buildLockedCharTimes, createRecordingTimeClamp, clearRecordingLock, applyRecordingLockRange,
			resetCurrentSyncInput,
			closeEditor, isRecordingInputOpen,
			handleDragStart, handleDragMove, handleDragEnd, handleDragCancel,
			applyOffsetSelectionRange, handleCharacterContextMenu, offsetSelectionRangeRef, offsetSelectionTargetRef, clearOffsetSelection, clearLyricTextSelection,
			isLeadingChar, isTrailingChar, isWordBoundary };
	})());`, context);
	const refreshKeyboard = () => {
		const previousEffect = context.useEffect;
		context.useEffect = (setup, deps) => {
			if (deps?.length === 0) context.disposeKeyboard ??= setup();
			else setup();
		};
		try {
			vm.runInContext(`(() => { ${effect} })()`, context);
		} finally {
			context.useEffect = previousEffect;
		}
	};
	refreshKeyboard();
	const gestures = createSyncCreatorPointerGestures({
		document: context.document,
		gestureRef: context.pointerGestureRef,
		suppressContextMenuRef: context.suppressNextLockContextMenuRef,
		getContext: () => ({ ...context, hasLine: context.currentLineIndex < context.lyricsLines.length,
			isEditorOpen: context.isRecordingInputOpen }),
	});
	context.handleContainerMouseDown = gestures.start;
	const disposePointer = gestures.bind();
	const event = (key, changes = {}) => ({ key, code: key, target: {}, preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {}, ...changes });
	return {
		...editor, context, toasts, setters, intervals,
		get advances() { return advances; },
		arm: (start, end = start) => context.applyRecordingLockRange(start, end),
		press: (key, at = progress, changes) => { progress = at; events.get('keydown')(event(key, changes)); },
		keypress: (key, at) => { progress = at; events.get('keypress')(event(key)); },
		release: (key, changes) => events.get('keyup')(event(key, changes)),
		blur: () => windowEvents.dispatch('blur'),
		focus: target => events.get('focusin')?.({ target }),
		keydownListener: () => events.get('keydown'),
		select: (start, end) => context.applyOffsetSelectionRange(start, end),
		contextMenu: index => context.handleCharacterContextMenu(index, event('ContextMenu')),
		pointerStart: (at, changes) => { progress = at; gestures.start(event('', changes)); },
		pointerEvent: (type, at, changes) => { progress = at; events.get(type)?.(event('', { type, ...changes })); },
		hide: () => {
			context.document.visibilityState = 'hidden';
			events.dispatch('visibilitychange');
		},
		rightDrag: (start, end) => {
			gestures.start(event('mousedown', { button: 2, clientX: start, clientY: 0 }));
			events.get('mousemove')(event('mousemove', { type: 'mousemove', buttons: 2, clientX: end, clientY: 0 }));
			events.get('mouseup')(event('mouseup', { type: 'mouseup', button: 2, clientX: end, clientY: 0 }));
			context.handleCharacterContextMenu(end, event('ContextMenu'));
		},
		resetSelection: changes => {
			gestures.cancel(false);
			Object.assign(context, changes);
			useSyncCreatorSelectionReset({ react: context, clearLyricTextSelection: context.clearLyricTextSelection,
				clearOffsetSelection: context.clearOffsetSelection });
		},
		drag: (start, moves, at = 9) => {
			progress = at; context.handleDragStart(start, event('mousedown'));
			for (const [index, time] of moves) { progress = time; context.handleDragMove(index, event('mousemove')); }
			context.handleDragEnd(event('mouseup'));
		},
		refreshKeyboard,
		dispose: () => { context.disposeKeyboard?.(); disposePointer(); },
		input: () => JSON.parse(JSON.stringify(context.charTimesRef.current)),
		times: () => JSON.parse(JSON.stringify(editor.line().chars)),
	};
}
