import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../SyncDataCreator.js', import.meta.url), 'utf8');
const slice = (startMarker, endMarker) => {
	const start = source.indexOf(startMarker);
	const end = source.indexOf(endMarker, start + startMarker.length);
	assert.ok(start >= 0 && end > start, `missing production section: ${startMarker}`);
	return source.slice(start, end);
};
const helpersSource = source.slice(0, source.indexOf('const SyncDataCreator ='));
const callbackSources = [
	slice('\tconst stripLrclibTimestamp =', '\tconst clearLrclibCandidateState ='),
	slice('\tconst isCurrentSyncCreatorSourceChange =', '\tconst previewLrclibCandidate ='),
	slice('\tconst claimSessionForLocalEditing =', '\tconst toggleSessionAutosave ='),
	slice('\tconst toggleMode =', '\tconst adjustGlobalOffset ='),
	slice('\tconst applySyncCreatorSessionRecord =', '\tconst saveSessionCheckpoint ='),
].join('\n');
const navigationSource = slice('\tconst playbackTimeline =', '\t// 재생 위치 업데이트 + 미리보기 자동 줄 이동');
const pollingSource = slice('\t// 재생 위치 업데이트 + 미리보기 자동 줄 이동', '\tconst autoScroll =');
const plain = value => JSON.parse(JSON.stringify(value));
const deferred = () => {
	let resolve;
	const promise = new Promise(done => { resolve = done; });
	return { promise, resolve };
};

// Execute the shipping helpers, load/restore/mode callbacks and navigation effects.
// React setters and player/storage I/O are controlled here; the already-validated
// sync fixture passes through the sanitizer boundary without migration.
const createEditor = ({ progress = 0, playing = true } = {}) => {
	const calls = { seek: [], play: 0, selections: [], positions: [], toasts: [] };
	const timers = new Map();
	let timerId = 0;
	let cleanup;
	const context = vm.createContext({
		console, structuredClone,
		useCallback: callback => callback,
		useMemo: callback => callback(),
		useEffect: callback => { cleanup = callback(); },
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
		isLineCoveredByMergedPrevious: () => false,
		showMissingMetaToast: () => calls.toasts.push('missing metadata'),
		clearRecordingLock: () => {}, syncSessionUiFromRecord: () => {}, announceHistoryStatus: () => {},
		sanitizeSyncCreatorSyncData: data => structuredClone(data),
		syncCreatorDraftStore: null,
	});
	for (const [, name] of callbackSources.matchAll(/\b(\w+Ref)\.current/g)) context[name] ??= { current: null };
	Object.assign(context, {
		pendingPlaybackNavigationRef: { current: true },
		positionUpdateTimerRef: { current: null },
		lyricsScrollRef: { current: { scrollLeft: 50 } },
		sessionSourceChangeRequestRef: { current: 0 },
		sessionRecoveryRequestRef: { current: 0 },
		sessionCheckpointRestoreRequestRef: { current: 0 },
		sessionWriteGenerationRef: { current: 0 },
		sessionClientRevisionRef: { current: 0 },
		sessionAutoRecoveryBlockedRef: { current: false },
	});
	for (const [, setter] of callbackSources.matchAll(/\b(set[A-Z]\w*)\b/g)) {
		const property = setter.slice(3, 4).toLowerCase() + setter.slice(4);
		context[setter] = value => {
			context[property] = typeof value === 'function' ? value(context[property]) : value;
			if (setter === 'setCurrentLineIndex') calls.selections.push(context.currentLineIndex);
			if (setter === 'setLyricsText') context.lyricsLines = context.lyricsText.split('\n').filter(line => line.trim()).map(line => line.normalize('NFC'));
		};
	}
	context.setPosition = value => { context.position = value; calls.positions.push(value); };
	vm.runInContext(helpersSource, context);
	vm.runInContext(`globalThis.api = { buildSyncCreatorPlaybackTimeline, getSyncCreatorPlaybackLineIndex };`, context);
	vm.runInContext(`globalThis.makeCallbacks = () => {
		const { mode, pendingMultiVocalDecision } = globalThis;
		${callbackSources}
		return { buildSyntheticLrclibResult, beginSyncCreatorSourceChange, applyLoadedLyricsResult,
			resolveMultiVocalDecision, claimSessionForLocalEditing, toggleMode, applySyncCreatorSessionRecord };
	};`, context);
	for (const name of Object.keys(context.makeCallbacks())) {
		context[name] = (...args) => context.makeCallbacks()[name](...args);
	}
	const render = (changes = {}) => {
		Object.assign(context, changes);
		vm.runInContext(`(() => { ${navigationSource}\nglobalThis.playbackTimeline = playbackTimeline; })();`, context);
	};
	return {
		context, calls, timers,
		setProgress: value => { progress = value; },
		setPlaying: value => { playing = value; },
		render,
		startPolling: () => { cleanup?.(); vm.runInContext(pollingSource, context); },
		poll: () => { assert.equal(timers.size, 1); timers.values().next().value.callback(); },
		dispose: () => { cleanup?.(); },
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
	assert.equal(editor.context.position, 0, 'the uncommitted React position was deliberately stale');
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
	waiting.resolve(null);
	await loading;
	editor.render({ isLoading: false });
	assert.deepEqual(editor.calls.selections, [3]);
});

test('merged continuation rows are excluded from the production timeline memo', () => {
	const editor = createEditor({ progress: 2500 });
	editor.setLyrics(timedLines(4));
	editor.render({ isLoading: false, isLineCoveredByMergedPrevious: index => index === 1 || index === 2 });
	assert.deepEqual(plain(editor.context.playbackTimeline).map(entry => entry.lineIndex), [0, 3]);
	assert.equal(editor.context.currentLineIndex, 0);
	editor.context.mode = 'preview';
	editor.startPolling();
	editor.setProgress(3500);
	editor.poll();
	assert.equal(editor.context.currentLineIndex, 3);
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
