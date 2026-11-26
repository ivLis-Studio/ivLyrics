import { buildSyncCreatorPlaybackTimeline, getSyncCreatorPlaybackLineIndex } from '#ivlyrics/features/sync/syncCreatorPlaybackTimeline.mjs';
import { useSyncCreatorSourceChange } from '#ivlyrics/features/sync/syncCreatorSourceChange.mjs';
import { createSyncCreatorSessionLifecycle, createSyncCreatorSessionRefs } from '#ivlyrics/features/sync/syncCreatorSessionLifecycle.mjs';
import { createSyncCreatorEditorLifetime } from '#ivlyrics/features/sync/syncCreatorEditorLifetime.mjs';
import { createSyncCreatorEditorCommands } from '#ivlyrics/features/sync/syncCreatorEditorCommands.mjs';
import { buildSyntheticLrclibResult } from '#ivlyrics/features/sync/syncCreatorLrclibLyrics.mjs';
import { readSyncCreatorFixture } from "./fixtures/legacy-page-source.mjs";
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

import { createSyncCreatorLyricDocument } from "#ivlyrics/features/sync/syncCreatorLyricText.mjs";

const source = readSyncCreatorFixture();
const slice = (startMarker, endMarker) => {
	const start = source.indexOf(startMarker);
	const end = source.indexOf(endMarker, start + startMarker.length);
	assert.ok(start >= 0 && end > start, `missing production section: ${startMarker}`);
	return source.slice(start, end);
};
const helpersSource = source.slice(0, source.indexOf('const SyncDataCreator ='));
const callbackSources = slice('\tconst applySyncCreatorSessionRecord =', '\tconst scheduleSessionAutosave =');
const playbackSource = slice('\tconst playbackTimeline =', '\tconst { setRecordingProgressIndex, applyRecordingProgressVisual, invalidateRecordingPaint }');
const plain = value => JSON.parse(JSON.stringify(value));
const deferred = () => {
	let resolve;
	const promise = new Promise(done => { resolve = done; });
	return { promise, resolve };
};

// Execute the shipping helpers, load/restore/mode callbacks and navigation effects.
// React setters and player/storage I/O are controlled here; the already-validated
// sync fixture passes through the sanitizer boundary without migration.
const createEditor = ({ progress = 0, playing = true, draftStore = null } = {}) => {
	const lifetime = createSyncCreatorEditorLifetime(() => true);
	const calls = { seek: [], play: 0, selections: [], positions: [], toasts: [] };
	const timers = new Map();
	const layoutEffects = [], refs = [];
	const draftGenerationRef = { current: null };
	let layoutIndex = 0, refIndex = 0;
	let timerId = 0;
	let cleanup;
	const context = vm.createContext({
		console, structuredClone, buildSyntheticLrclibResult, lifetime,
		useCallback: callback => callback,
		useMemo: callback => callback(),
		useEffect: callback => { cleanup = callback(); },
		useRef: initial => refs[refIndex++] ??= { current: initial },
		useLayoutEffect(callback, dependencies) {
			const index = layoutIndex++;
			const previous = layoutEffects[index];
			if (previous && dependencies.every((dep, key) => Object.is(dep, previous.dependencies[key]))) return;
			previous?.cleanup?.();
			layoutEffects[index] = { dependencies, cleanup: callback() };
		},
		resetCurrentSyncInput() {},
		clearTimeout: () => {},
		setInterval: (callback, delay) => { const id = ++timerId; timers.set(id, { callback, delay }); return id; },
		clearInterval: id => timers.delete(id),
		Spicetify: { Player: {
			getProgress: () => progress,
			isPlaying: () => playing,
			seek: value => calls.seek.push(value),
			play: () => { calls.play++; playing = true; },
		} },
		window: {},
		Toast: { success: value => calls.toasts.push(value) },
		I18n: { t: key => key },
		trackId: 'fixture', trackIsrc: '', trackName: 'Fixture', artistName: '', albumName: '',
		lyrics: null, lyricsLines: [], lyricsText: '', syncData: null, currentLineIndex: 0,
		isLoading: true, pendingMultiVocalDecision: null, mode: 'idle', position: 0,
		isCurrentSyncTargetMetaComplete: true,
		findMergedOwnerLineIndex: () => -1,
		showMissingMetaToast: () => calls.toasts.push('missing metadata'),
		clearRecordingLock: () => {}, syncSessionUiFromRecord: () => {}, announceHistoryStatus: () => {},
		clearLyricTextSelection: () => {}, clearOffsetSelection: () => {},
		syncCreatorDraftStore: draftStore,
	});
	for (const [, name] of callbackSources.matchAll(/\b(\w+Ref)\.current/g)) context[name] ??= { current: null };
	Object.assign(context, {
		pendingPlaybackNavigationRef: { current: true },
		manualPreviewExitRef: { current: false },
		lyricsScrollRef: { current: { scrollLeft: 50 } },
		scoreInputRef: { current: null },
		scorePendingEffectsRef: { current: new Map() },
		serverBaselineSyncDataRef: { current: null },
		lrclibIdInputEditedRef: { current: false },
		sessionTrackKey: 'fixture',
		lrclibCandidates: [],
	});
	const sessionRefs = createSyncCreatorSessionRefs({ now: () => 0 });
	Object.assign(context, sessionRefs);
	const setters = new Set([
		...Array.from(callbackSources.matchAll(/\b(set[A-Z]\w*)\b/g), ([, name]) => name),
		'setLyrics', 'setLyricsText', 'setSyncData', 'setCurrentLineIndex',
		'setLrclibCandidates', 'setSelectedLrclibCandidateKey', 'setSelectedLrclibSourceValue', 'setPreviewLrclibCandidateKey',
		'setLrclibSearchMeta', 'setIsLoadingLrclibId', 'setLrclibIdInput', 'setProviderValue', 'setAddonId',
		'setPendingMultiVocalDecision', 'setMultiVocalMode', 'setActiveParallelPartId', 'setError', 'setIsLoading', 'setMode',
		'setManualParallelSplitDrafts', 'setParentheticalLayoutDrafts', 'setPendingParentheticalLayoutDecision', 'setMergedLineDrafts',
		'setIsRestoringCheckpoint', 'setSessionReadyDraftKey', 'setSessionHistory',
		'setSessionHistoryCursorId', 'setHistoryAnnouncement', 'setSessionSaveState', 'setSessionHydrationComplete',
	]);
	for (const setter of setters) {
		const property = setter.slice(3, 4).toLowerCase() + setter.slice(4);
		context[setter] = value => {
			context[property] = typeof value === 'function' ? value(context[property]) : value;
			if (setter === 'setCurrentLineIndex') calls.selections.push(context.currentLineIndex);
			if (setter === 'setLyricsText') context.lyricsLines = context.lyricsText.split('\n').filter(line => line.trim()).map(line => line.normalize('NFC'));
		};
	}
	const session = createSyncCreatorSessionLifecycle({
		refs: sessionRefs, ui: context, pendingPlaybackNavigationRef: context.pendingPlaybackNavigationRef,
		cancelTimer: context.clearTimeout, syncCreatorDraftStore: context.syncCreatorDraftStore,
	});
	const { beginDraftSourceChange, isCurrentSyncCreatorSourceChange, claimSessionForLocalEditing } = session;
	Object.assign(context, { beginDraftSourceChange, isCurrentSyncCreatorSourceChange, claimSessionForLocalEditing });
	context.setPosition = value => { context.position = value; calls.positions.push(value); };
	context.updatePublishedBaseline = data => {
		context.serverBaselineSyncDataRef.current = data ? structuredClone(data) : null;
		context.hasPublishedSync = Boolean(data?.lines?.length);
	};
	vm.runInContext(helpersSource, context);
	context.api = { buildSyncCreatorPlaybackTimeline, getSyncCreatorPlaybackLineIndex };
	context.react = context;
	vm.runInContext(`globalThis.makeCallbacks = () => {
		const { mode, pendingMultiVocalDecision } = globalThis;
		${callbackSources}
		return { applySyncCreatorSessionRecord };
	};`, context);
	for (const name of Object.keys(context.makeCallbacks())) {
		context[name] = (...args) => context.makeCallbacks()[name](...args);
	}
	context.toggleMode = requested => createSyncCreatorEditorCommands({
		lifetime, mode: context.mode, isCurrentSyncTargetMetaComplete: context.isCurrentSyncTargetMetaComplete,
		getPlayer: () => context.Spicetify.Player, refs: context, draft: session, editor: context, dialog: context,
	}).toggleMode(requested);
	const services = vm.runInContext(`({
		readSyncCreatorSyncService, readSyncCreatorCodec, sanitizeSyncCreatorSyncData, debugSyncCreatorSource,
	})`, context);
	context.announceRecoveredSession = () => {};
	const sourceChange = () => useSyncCreatorSourceChange({
		react: { ...context, useRef: () => draftGenerationRef }, i18n: context.I18n, toast: context.Toast,
		track: context, lrclib: { ...context, searchRequests: { cancel() {} } }, editor: context, session: context, services,
		canStartOperation: lifetime.canStartOperation,
	});
	for (const name of ['beginSyncCreatorSourceChange', 'applyLoadedLyricsResult', 'resolveMultiVocalDecision', 'captureOfflineDraftRecovery']) {
		context[name] = (...args) => sourceChange()[name](...args);
	}
	const render = (changes = {}) => {
		Object.assign(context, changes);
		context.lineIndexByStart = createSyncCreatorLyricDocument(context.lyricsLines.join('\n')).lineIndexByStart;
		layoutIndex = refIndex = 0;
		vm.runInContext(`(() => { ${playbackSource}\nglobalThis.playbackTimeline = playbackTimeline; })();`, context);
	};
	return {
		context, calls, timers, lifetime,
		setProgress: value => { progress = value; },
		setPlaying: value => { playing = value; },
		render,
		startPolling: render,
		poll: () => { assert.equal(timers.size, 1); timers.values().next().value.callback(); },
		dispose: () => {
			for (const effect of layoutEffects) effect.cleanup?.();
			cleanup?.();
		},
		setLyrics: (lines, syncData = null) => {
			context.setLyrics({ synced: lines });
			context.setLyricsText(lines.map(line => line.text).join('\n'));
			context.setSyncData(syncData);
		},
	};
};
const timedLines = count => Array.from({ length: count }, (_, index) => ({ text: `Line ${index + 1}`, startTime: index * 1000 }));
const draftRecord = (lines, syncData = null) => ({
	provider: 'lrclib', addonId: 'lrclib', draftKey: 'draft', lyricsText: lines.map(line => line.text).join('\n'),
	draft: { syncData, editor: { currentLineIndex: 1, activeParallelPartId: 'full' } },
});

test('LRCLIB-only timeline locates the 28th line, intro, exact boundaries and backward seeks', () => {
	const { api } = createEditor().context;
	const lines = timedLines(40).map(line => ({ ...line, startTime: line.startTime + 10000 }));
	const timeline = api.buildSyncCreatorPlaybackTimeline(lines.map(line => line.text), null, lines);
	for (const [position, expected] of [[0, 0], [9999, 0], [10000, 0], [37000, 27], [37999, 27], [38000, 28], [11000, 1], [999999, 39]]) {
		assert.equal(api.getSyncCreatorPlaybackLineIndex(timeline, position), expected);
	}
	for (const position of [NaN, Infinity, -1]) assert.equal(api.getSyncCreatorPlaybackLineIndex(timeline, position), -1);
	assert.equal(api.getSyncCreatorPlaybackLineIndex([], 10000), -1);
});

test('saved timings override matching source rows while partial sync retains unrecorded source timing', () => {
	const { api } = createEditor().context;
	const lines = [{ text: '😀é', startTime: 1000 }, { text: 'B', startTime: 2000 }, { text: 'C', startTime: 3000 }];
	const sync = { lines: [{ start: 0, end: 1, chars: [1.5, 1.6] }, { start: 3, end: 3, chars: [5] }] };
	const before = JSON.stringify(sync);
	const timeline = api.buildSyncCreatorPlaybackTimeline(lines.map(line => line.text), sync, lines);
	assert.deepEqual(plain(timeline), [{ lineIndex: 0, startTime: 1500 }, { lineIndex: 1, startTime: 2000 }, { lineIndex: 2, startTime: 5000 }]);
	assert.equal(api.getSyncCreatorPlaybackLineIndex(timeline, 2200), 1);
	assert.equal(JSON.stringify(sync), before, 'navigation does not change persisted timings');
});

test('parallel lines start at the earliest finite vocal timing and ties have deterministic line order', () => {
	const { api } = createEditor().context;
	const sync = { lines: [
		{ start: 1, chars: [8], parallel: { parts: [{ chars: [null, -1, NaN, 2] }, { chars: [4] }] } },
		{ start: 0, chars: [2] },
		{ start: 999, chars: [0] },
	] };
	const timeline = api.buildSyncCreatorPlaybackTimeline(['A', 'B'], sync, null);
	assert.deepEqual(plain(timeline), [{ lineIndex: 0, startTime: 2000 }, { lineIndex: 1, startTime: 2000 }]);
	assert.equal(api.getSyncCreatorPlaybackLineIndex(timeline, 2000), 1);
});

test('timing from a different lyric text or repeated-line order is rejected', () => {
	const { api } = createEditor().context;
	const sourceLines = [{ text: 'A', startTime: 1 }, { text: 'B', startTime: 2 }, { text: 'A', startTime: 3 }];
	assert.deepEqual(plain(api.buildSyncCreatorPlaybackTimeline(['A', 'A', 'B'], null, sourceLines)), []);
	assert.deepEqual(plain(api.buildSyncCreatorPlaybackTimeline(['A', 'B'], null, sourceLines)), []);
	assert.deepEqual(plain(api.buildSyncCreatorPlaybackTimeline(['é', 'B'], null, [{ text: '(e\u0301)', startTime: 1000 }, { text: 'B', startTime: 2000 }])),
		[{ lineIndex: 0, startTime: 1000 }, { lineIndex: 1, startTime: 2000 }]);
});

test('synthetic LRCLIB results retain fractions, repeated lines and timing/text alignment', () => {
	const editor = createEditor();
	const result = editor.context.buildSyntheticLrclibResult({ id: 123, preferredLyricsSource: 'synced',
		syncedLyrics: '[ar:Artist]\n[00:00.000]\n[00:01,250]A\n[00:02.5](B)\n[01:01]A' });
	assert.deepEqual(plain(result.synced), [{ text: 'A', startTime: 1250 }, { text: 'B', startTime: 2500 }, { text: 'A', startTime: 61000 }]);
	const plainResult = editor.context.buildSyntheticLrclibResult({ id: 123, preferredLyricsSource: 'plain', plainLyrics: 'Other\nText', syncedLyrics: '[00:01]A\n[00:02]B' });
	assert.equal(plainResult.synced, null, 'plain selection must not inherit an unrelated synced variant');
});

test('parenthetical-only rows removed from the editor do not discard or shift LRCLIB timing', () => {
	const editor = createEditor();
	for (const syncedLyrics of [
		'[00:00]()\n[00:01]A\n[00:02]B',
		'[00:00](\n[00:01]A\n[00:02]B\n[00:03])',
	]) {
		const result = editor.context.buildSyntheticLrclibResult({ id: 123, preferredLyricsSource: 'synced', syncedLyrics });
		assert.deepEqual(plain(result.synced), [{ text: 'A', startTime: 1000 }, { text: 'B', startTime: 2000 }]);
	}
});

test('async existing-sync loading selects the latest player position after the 28th line becomes ready', async () => {
	const editor = createEditor({ progress: 5000 });
	const waiting = deferred();
	editor.context.window.SyncDataService = { getSyncData: () => waiting.promise };
	const request = editor.context.beginSyncCreatorSourceChange();
	const loading = editor.context.applyLoadedLyricsResult({ provider: 'lrclib', synced: timedLines(40) }, 'lrclib', request);
	editor.render();
	assert.deepEqual(editor.calls.selections, []);
	editor.setProgress(27500);
	waiting.resolve(null);
	assert.equal(await loading, true);
	editor.render({ isLoading: false });
	assert.equal(editor.context.currentLineIndex, 27);
	assert.equal(editor.context.position, 5000, 'the previous timer sample is deliberately stale');
	assert.equal(editor.context.lyricsScrollRef.current.scrollLeft, 0);
	editor.setProgress(35000);
	editor.render();
	assert.deepEqual(editor.calls.selections, [27], 'idle navigation initializes only once');
	assert.deepEqual(editor.calls.seek, []);
});

test('stale source completions cannot overwrite the newer lyric source or initialize its old line', async () => {
	const editor = createEditor({ progress: 2500 });
	const first = deferred();
	const second = deferred();
	let count = 0;
	editor.context.window.SyncDataService = { getSyncData: () => (++count === 1 ? first.promise : second.promise) };
	const firstRequest = editor.context.beginSyncCreatorSourceChange();
	const firstLoad = editor.context.applyLoadedLyricsResult({ provider: 'lrclib', synced: [{ text: 'Old', startTime: 0 }] }, 'lrclib', firstRequest);
	const secondRequest = editor.context.beginSyncCreatorSourceChange();
	const secondLoad = editor.context.applyLoadedLyricsResult({ provider: 'lrclib', synced: timedLines(4) }, 'lrclib', secondRequest);
	second.resolve(null);
	assert.equal(await secondLoad, true);
	editor.render({ isLoading: false });
	first.resolve(null);
	assert.equal(await firstLoad, false);
	editor.render();
	assert.equal(editor.context.lyricsText, 'Line 1\nLine 2\nLine 3\nLine 4');
	assert.deepEqual(editor.calls.selections, [2]);
});

test('loading a different LRCLIB source clears incompatible saved and previously selected timings', async () => {
	const editor = createEditor();
	const oldBody = { version: 2, lines: [{ start: 0, end: 7, chars: [1, 2, 3, 4, 5, 6, 7, 8] }] };
	editor.context.setSyncData(oldBody);
	editor.context.window.SyncDataService = { getSyncData: async () => ({ syncData: oldBody }) };
	const request = editor.context.beginSyncCreatorSourceChange();
	await editor.context.applyLoadedLyricsResult({ provider: 'lrclib', synced: [{ text: 'New', startTime: 0 }, { text: 'Text', startTime: 2000 }] }, 'lrclib', request);
	assert.equal(editor.context.syncData, null);
	assert.equal(editor.context.hasPublishedSync, false);
	assert.equal(editor.context.serverBaselineSyncDataRef.current, null);
	assert.equal(editor.context.lyricsText, 'New\nText');
});

test('matching legacy sync still loads as the published editor baseline', async () => {
	const editor = createEditor();
	const body = { version: 2, lines: [{ start: 0, end: 2, chars: [1, 2, 3] }, { start: 3, end: 6, chars: [4, 5, 6, 7] }] };
	editor.context.window.SyncDataService = { getSyncData: async () => ({ syncData: body }) };
	const request = editor.context.beginSyncCreatorSourceChange();
	await editor.context.applyLoadedLyricsResult({ provider: 'lrclib', synced: [{ text: 'New', startTime: 0 }, { text: 'Text', startTime: 2000 }] }, 'lrclib', request);
	const normalized = { ...body, lines: body.lines.map(line => ({ ...line, granularity: 'character' })) };
	assert.deepEqual(plain(editor.context.syncData), normalized);
	assert.equal(editor.context.hasPublishedSync, true);
	assert.deepEqual(plain(editor.context.serverBaselineSyncDataRef.current), normalized);
	assert.ok(body.lines.every(line => !Object.hasOwn(line, 'granularity')));
});

test('loading prefers unsubmitted local timings and remembers the published baseline', async () => {
	const published = { version: 2, lines: [{ start: 0, end: 2, chars: [1, 2, 3] }] };
	const local = { version: 2, lines: [{ start: 0, end: 2, chars: [2, 3, 4] }] };
	const lyrics = [{ text: 'New', startTime: 0 }];
	const record = draftRecord(lyrics, local);
	const draftStore = {
		createDraftKey: () => record.draftKey,
		cloneValue: structuredClone,
		getDraft: async () => record,
		getDraftsForTrack: async () => [],
	};
	const editor = createEditor({ draftStore });
	editor.context.window.SyncDataService = { getSyncData: async () => ({ syncData: published }) };
	const request = editor.context.beginSyncCreatorSourceChange();
	assert.equal(await editor.context.applyLoadedLyricsResult({ provider: 'lrclib', synced: lyrics }, 'lrclib', request), true);
	assert.deepEqual(plain(editor.context.syncData.lines[0].chars), local.lines[0].chars);
	assert.deepEqual(plain(editor.context.serverBaselineSyncDataRef.current.lines[0].chars), published.lines[0].chars);
	assert.equal(editor.context.hasPublishedSync, true);
});

test('an exact untimed draft restores editor choices and keeps the provider timestamps', async () => {
	const lyrics = [{ text: 'New', startTime: 2400 }, { text: 'Text', startTime: 4200 }];
	const lrclibSource = { lrclibId: '321' };
	const record = draftRecord(lyrics);
	record.lrclibSource = lrclibSource;
	Object.assign(record.draft.editor, {
		syncGranularity: 'word', multiVocalMode: true, activeParallelPartId: 'lead',
	});
	const editor = createEditor({ draftStore: {
		createDraftKey: () => record.draftKey,
		cloneValue: structuredClone,
		getDraft: async () => record,
		getDraftsForTrack() { assert.fail('an exact draft needs no fallback query'); },
	} });
	const request = editor.context.beginSyncCreatorSourceChange();
	await editor.context.applyLoadedLyricsResult({ provider: 'lrclib', synced: lyrics, lrclibSource }, 'lrclib', request);
	assert.equal(editor.context.syncGranularity, 'word');
	assert.equal(editor.context.activeParallelPartId, 'lead');
	assert.equal(editor.context.multiVocalMode, true);
	assert.equal(editor.context.lyrics.synced, lyrics);
	assert.equal(editor.context.syncData, null);
});

test('an older untimed draft cannot hide usable published timing', async () => {
	const lyrics = [{ text: 'New', startTime: 1000 }];
	const record = draftRecord(lyrics);
	const published = { version: 2, lines: [{ start: 0, end: 2, chars: [1, 2, 3] }] };
	const editor = createEditor({ draftStore: {
		createDraftKey: () => record.draftKey,
		cloneValue: structuredClone,
		getDraft: async () => record,
		getDraftsForTrack: async () => [],
	} });
	editor.context.window.SyncDataService = { getSyncData: async () => ({ syncData: published }) };
	const request = editor.context.beginSyncCreatorSourceChange();
	await editor.context.applyLoadedLyricsResult({ provider: 'lrclib', synced: lyrics }, 'lrclib', request);
	assert.deepEqual(plain(editor.context.syncData.lines[0].chars), published.lines[0].chars);
	assert.equal(editor.context.hasPublishedSync, true);
});

test('a draft that cleared all timing keeps the edit and retains published timing for revert', async () => {
	const lyrics = [{ text: 'New', startTime: 1000 }];
	const published = { version: 2, lines: [{ start: 0, end: 2, chars: [1, 2, 3] }] };
	for (const legacy of [false, true]) {
		const record = draftRecord(lyrics);
		if (legacy) record.history = [{ kind: 'source', snapshot: { syncData: published } }];
		else record.draft.timingCleared = true;
		const editor = createEditor({ draftStore: {
			createDraftKey: () => record.draftKey,
			cloneValue: structuredClone,
			getDraft: async () => record,
			getDraftsForTrack() { assert.fail('the exact clear must be restored'); },
		} });
		editor.context.window.SyncDataService = { getSyncData: async () => ({ syncData: published }) };
		const request = editor.context.beginSyncCreatorSourceChange();
		await editor.context.applyLoadedLyricsResult({ provider: 'lrclib', synced: lyrics }, 'lrclib', request);
		assert.equal(editor.context.syncData, null);
		assert.equal(editor.context.hasPublishedSync, true);
		assert.deepEqual(plain(editor.context.serverBaselineSyncDataRef.current.lines[0].chars), published.lines[0].chars);
	}
});

test('offline draft recovery retains the saved source timeline and stays owned by the load', async () => {
	const lines = [{ text: 'A', startTime: 2000 }, { text: 'B', startTime: 3100 }, { text: 'C', startTime: 4900 }];
	const record = { ...draftRecord(lines), sourceLineStarts: lines.map(line => line.startTime) };
	for (const end of ['apply', 'new edit', 'new source']) {
		const waiting = deferred();
		const editor = createEditor({ draftStore: { getDraftsForTrack: () => waiting.promise, cloneValue: structuredClone } });
		const request = editor.context.beginSyncCreatorSourceChange();
		const recover = editor.context.captureOfflineDraftRecovery(request);
		const loading = recover();
		if (end === 'new edit') editor.context.claimSessionForLocalEditing();
		if (end === 'new source') editor.context.beginSyncCreatorSourceChange();
		waiting.resolve([record]);
		const result = await loading;
		if (end === 'apply') {
			assert.equal(result.draftKey, record.draftKey);
			assert.deepEqual(plain(editor.context.lyrics.synced), lines);
			assert.equal(editor.context.currentLineIndex, 1);
			assert.equal(editor.context.isLoading, false);
		} else {
			assert.equal(result, null);
			assert.equal(editor.context.lyrics, null);
		}
	}
});

test('pending vocal choice defers initialization and uses progress when the choice is resolved', async () => {
	const editor = createEditor({ progress: 500 });
	const request = editor.context.beginSyncCreatorSourceChange();
	await editor.context.applyLoadedLyricsResult({ provider: 'lrclib', synced: [{ text: 'A (B)', startTime: 0 }, { text: 'C', startTime: 2000 }] }, 'lrclib', request);
	assert.ok(editor.context.pendingMultiVocalDecision);
	editor.render({ isLoading: false });
	assert.equal(editor.context.pendingPlaybackNavigationRef.current, true);
	editor.setProgress(2500);
	editor.context.resolveMultiVocalDecision(true);
	editor.render();
	assert.deepEqual(editor.calls.selections, [1]);
});

test('manual editing cancels pending initialization even when the load finishes later', async () => {
	const editor = createEditor({ progress: 25000 });
	const waiting = deferred();
	editor.context.window.SyncDataService = { getSyncData: () => waiting.promise };
	const request = editor.context.beginSyncCreatorSourceChange();
	const loading = editor.context.applyLoadedLyricsResult({ provider: 'lrclib', synced: timedLines(40) }, 'lrclib', request);
	editor.context.claimSessionForLocalEditing();
	editor.context.setCurrentLineIndex(3);
	editor.context.setLyricsText('Local changes');
	waiting.resolve(null);
	assert.equal(await loading, false);
	editor.render({ isLoading: false });
	assert.deepEqual(editor.calls.selections, [3]);
	assert.equal(editor.context.lyricsText, 'Local changes');
	assert.equal(editor.context.lyrics, null);
});

test('a background save changing the write generation does not cancel the current source load', async () => {
	const editor = createEditor({ progress: 1500 });
	const waiting = deferred();
	editor.context.window.SyncDataService = { getSyncData: () => waiting.promise };
	const request = editor.context.beginSyncCreatorSourceChange();
	const loading = editor.context.applyLoadedLyricsResult({ provider: 'lrclib', synced: timedLines(4) }, 'lrclib', request);
	editor.context.sessionWriteGenerationRef.current++;
	waiting.resolve(null);
	assert.equal(await loading, true);
	assert.equal(editor.context.lyricsText, 'Line 1\nLine 2\nLine 3\nLine 4');
});

test('merged continuation rows are excluded from the production timeline memo', () => {
	const editor = createEditor({ progress: 2500 });
	editor.setLyrics(timedLines(4));
	editor.render({ isLoading: false, findMergedOwnerLineIndex: index => index === 1 || index === 2 ? 0 : -1 });
	assert.deepEqual(plain(editor.context.playbackTimeline).map(entry => entry.lineIndex), [0, 3]);
	assert.equal(editor.context.currentLineIndex, 0);
	editor.context.mode = 'preview';
	editor.startPolling();
	editor.setProgress(3500);
	editor.poll();
	assert.equal(editor.context.currentLineIndex, 3);
	editor.startPolling();
	editor.setProgress(500);
	editor.poll();
	assert.equal(editor.context.currentLineIndex, 0);
	editor.dispose();
	assert.equal(editor.timers.size, 0);
});

test('preview follows LRCLIB-only timing without seeking; idle and record retain the chosen line', () => {
	for (const mode of ['idle', 'record', 'preview']) {
		const editor = createEditor({ progress: 1500 });
		editor.setLyrics(timedLines(4));
		editor.context.pendingPlaybackNavigationRef.current = false;
		editor.render({ mode, isLoading: false, currentLineIndex: 0 });
		editor.startPolling();
		editor.setProgress(3500);
		editor.poll();
		assert.equal(editor.context.currentLineIndex, mode === 'preview' ? 3 : 0);
		assert.deepEqual(editor.calls.seek, []);
		assert.equal(editor.timers.values().next().value.delay, { idle: 500, record: 50, preview: 100 }[mode]);
		editor.dispose();
	}
});

test('initial line selection waits for the first valid player position after lyrics are ready', t => {
	const editor = createEditor({ progress: undefined });
	t.after(editor.dispose);
	editor.setLyrics(timedLines(4));
	editor.setProgress(undefined);
	editor.render({ isLoading: false, currentLineIndex: 1 });
	assert.equal(editor.context.pendingPlaybackNavigationRef.current, true);
	assert.equal(editor.context.currentLineIndex, 1);
	assert.deepEqual(editor.calls.positions, []);
	editor.setProgress(2300);
	editor.poll();
	assert.deepEqual(editor.calls.selections, [2]);
	assert.deepEqual(editor.calls.positions, [2300]);
	assert.equal(editor.context.pendingPlaybackNavigationRef.current, false);
});

test('preview retains the same timer across line and timeline changes and rejects stale samples', t => {
	const editor = createEditor({ progress: 1250 });
	t.after(editor.dispose);
	editor.setLyrics(timedLines(5));
	editor.render({ mode: 'preview', isLoading: false });
	const [previewTimerId] = editor.timers.keys();
	const samplePreview = editor.timers.get(previewTimerId).callback;
	editor.setProgress(2100);
	editor.poll();
	editor.poll();
	assert.deepEqual(editor.calls.selections, [1, 2]);
	editor.render();
	assert.deepEqual([...editor.timers.keys()], [previewTimerId]);

	editor.setProgress(NaN);
	editor.poll();
	editor.setProgress(null);
	editor.poll();
	assert.equal(editor.context.currentLineIndex, 2);
	assert.equal(editor.calls.positions.at(-1), 2100);

	editor.setLyrics(timedLines(5).map(line => ({ ...line, startTime: line.startTime + 1000 })));
	editor.render();
	editor.setProgress(2350);
	editor.poll();
	assert.deepEqual([...editor.timers.keys()], [previewTimerId]);
	assert.equal(editor.context.currentLineIndex, 1);

	editor.context.manualPreviewExitRef.current = true;
	editor.setProgress(4900);
	editor.poll();
	assert.equal(editor.context.currentLineIndex, 1);
	editor.render({ mode: 'record' });
	assert.equal(editor.timers.values().next().value.delay, 50);
	editor.setProgress(7000);
	samplePreview();
	assert.equal(editor.calls.positions.at(-1), 4900);
	assert.equal(editor.context.currentLineIndex, 1);
});

test('mode toggles retain paused play, stop and recording metadata checks without seek(0)', () => {
	const editor = createEditor({ progress: 27000, playing: false });
	editor.context.toggleMode('preview');
	assert.equal(editor.context.mode, 'preview');
	assert.equal(editor.calls.play, 1);
	editor.context.toggleMode('preview');
	assert.equal(editor.context.mode, 'idle');
	assert.equal(editor.calls.play, 1);
	editor.context.isCurrentSyncTargetMetaComplete = false;
	editor.context.toggleMode('record');
	assert.equal(editor.context.mode, 'idle');
	assert.ok(editor.calls.toasts.includes('missing metadata'));
	editor.context.isCurrentSyncTargetMetaComplete = true;
	editor.setPlaying(false);
	editor.context.toggleMode('record');
	assert.equal(editor.context.mode, 'record');
	assert.equal(editor.calls.play, 2);
	assert.deepEqual(editor.calls.seek, []);
});

test('stopping preview prevents an already scheduled playback sample from moving the editor', () => {
	const editor = createEditor({ progress: 1000 });
	editor.setLyrics(timedLines(7));
	editor.startPolling({ mode: 'preview', isLoading: false, currentLineIndex: 1 });
	editor.context.toggleMode('preview');
	assert.equal(editor.context.mode, 'idle');
	editor.setProgress(5300);
	editor.poll();
	assert.equal(editor.context.currentLineIndex, 1);
	editor.dispose();
});

test('playback keeps its clock but defers line selection during close and resumes after save failure', async t => {
	const editor = createEditor({ progress: 1000 });
	t.after(editor.dispose);
	const { context, lifetime } = editor;
	editor.setLyrics(timedLines(5));
	editor.render({ mode: 'preview', isLoading: false, currentLineIndex: 1 });
	const save = deferred();
	const closing = lifetime.requestClose({
		stopRecording() {}, saveDraft: () => save.promise, onSaveError() {}, onClosed: () => assert.fail('save was rejected'),
	});
	try {
		editor.setProgress(3500);
		editor.poll();
		assert.equal(context.position, 3500);
		assert.equal(context.currentLineIndex, 1);
		assert.deepEqual(editor.calls.selections, []);
	} finally {
		save.resolve(false);
		await closing;
	}
	editor.poll();
	assert.deepEqual(editor.calls.selections, [3]);
});

test('a source change cannot retire a working draft while close is saving it', async () => {
	const editor = createEditor();
	const save = deferred();
	const { context, lifetime } = editor;
	const generation = context.sessionWriteGenerationRef.current;
	const closing = lifetime.requestClose({
		stopRecording() {}, saveDraft: () => save.promise, onSaveError() {}, onClosed: () => assert.fail('save was rejected'),
	});
	try {
		assert.equal(context.beginSyncCreatorSourceChange(), null);
		assert.equal(context.sessionWriteGenerationRef.current, generation);
	} finally {
		save.resolve(false);
		await closing;
	}
	assert.equal(typeof context.beginSyncCreatorSourceChange(), 'number');
});

test('automatic draft recovery aligns to playback while manual and validation-only restores retain their contract', () => {
	for (const automatic of [true, false]) {
		const editor = createEditor({ progress: 2500 });
		const lines = [{ text: 'A', startTime: 0 }, { text: 'B', startTime: 1000 }, { text: 'C', startTime: 2000 }];
		const syncData = { lines: lines.map((line, index) => ({ start: index, end: index, chars: [line.startTime / 1000] })) };
		const record = draftRecord(lines, syncData);
		editor.context.applySyncCreatorSessionRecord(record, { validateOnly: true });
		assert.deepEqual(editor.calls.selections, []);
		editor.context.applySyncCreatorSessionRecord(record, { automatic, announce: false });
		assert.equal(editor.context.currentLineIndex, 1);
		editor.render();
		assert.equal(editor.context.currentLineIndex, automatic ? 2 : 1);
		assert.deepEqual(editor.calls.seek, []);
	}
});

test('manual edits block late automatic draft recovery and preserve the current source', () => {
	const editor = createEditor();
	editor.setLyrics(timedLines(5));
	editor.context.claimSessionForLocalEditing();
	assert.equal(editor.context.applySyncCreatorSessionRecord(draftRecord(timedLines(3)), { automatic: true }), null);
	assert.equal(editor.context.lyricsLines.length, 5);
	assert.deepEqual(editor.calls.selections, []);
});

test('automatic recovery preserves matching LRCLIB timing for empty and partially recorded drafts', () => {
	for (const syncData of [null, { lines: [{ start: 0, end: 0, chars: [0.5] }] }]) {
		const editor = createEditor({ progress: 2500 });
		const lines = [{ text: 'A', startTime: 0 }, { text: 'B', startTime: 1000 }, { text: 'C', startTime: 2000 }];
		const lrclibSource = { lrclibId: '123' };
		editor.context.setLyrics({ provider: 'lrclib', synced: lines, lrclibSource });
		editor.context.mode = 'preview';
		const record = { ...draftRecord(lines, syncData), lrclibSource };
		editor.context.applySyncCreatorSessionRecord(record, { automatic: true, announce: false });
		assert.equal(editor.context.lyrics.synced, lines, 'keep timing only for the same provider, source ID and text');
		assert.equal(editor.context.mode, 'preview');
		editor.render();
		assert.equal(editor.context.currentLineIndex, 2);
		assert.equal(editor.context.playbackTimeline.length, 3);
	}
});

test('restore rejects timing from a different provider, LRCLIB ID, text or a manual checkpoint', () => {
	for (const mismatch of ['provider', 'id', 'text', 'manual']) {
		const editor = createEditor({ progress: 2500 });
		const lines = [{ text: 'A', startTime: 0 }, { text: 'B', startTime: 1000 }, { text: 'C', startTime: 2000 }];
		editor.context.setLyrics({
			provider: mismatch === 'provider' ? 'other' : 'lrclib',
			synced: mismatch === 'text' ? lines.map(line => ({ ...line, text: `Other ${line.text}` })) : lines,
			lrclibSource: { lrclibId: mismatch === 'id' ? '456' : '123' },
		});
		const record = { ...draftRecord(lines), lrclibSource: { lrclibId: '123' } };
		editor.context.applySyncCreatorSessionRecord(record, { automatic: mismatch !== 'manual', announce: false });
		assert.deepEqual(plain(editor.context.lyrics.synced), lines.map(({ text }) => ({ text })));
		editor.render();
		assert.equal(editor.context.currentLineIndex, 1);
		assert.equal(editor.context.playbackTimeline.length, 0);
	}
});

test('preview follows a merged line whose only source timestamp is on its continuation', () => {
	const editor = createEditor({ progress: 3500 });
	const lines = [
		{ text: 'Before merge', startTime: 1000 },
		{ text: 'Merged lead', startTime: null },
		{ text: 'Merged continuation', startTime: 3000 },
		{ text: 'After merge', startTime: 5500 },
	];
	editor.setLyrics(lines);
	editor.render({
		isLoading: false, mode: 'preview',
		findMergedOwnerLineIndex: index => index === 2 ? 1 : -1,
	});
	assert.deepEqual(plain(editor.context.playbackTimeline), [
		{ lineIndex: 0, startTime: 1000 }, { lineIndex: 1, startTime: 3000 }, { lineIndex: 3, startTime: 5500 },
	]);
	assert.equal(editor.context.currentLineIndex, 1);

	const start = createSyncCreatorLyricDocument(editor.context.lyricsText).lineCharOffsets[1];
	editor.render({ syncData: { lines: [{ start, chars: [4.2] }] } });
	assert.equal(editor.context.playbackTimeline[1].startTime, 4200, 'the committed merged head replaces the source fallback');
	for (const [position, index] of [[3500, 0], [4500, 1], [6000, 3], [4500, 1]]) {
		editor.setProgress(position);
		editor.poll();
		assert.equal(editor.context.currentLineIndex, index);
	}
	editor.dispose();
});
