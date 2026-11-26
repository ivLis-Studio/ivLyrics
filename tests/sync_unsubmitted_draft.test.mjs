import { renderSyncCreatorHeader } from '#ivlyrics/features/sync/syncCreatorHeader.mjs';
import { TOSS_RED } from '#ivlyrics/features/sync/syncCreatorStyles.mjs';
import { readSyncCreatorFixture } from "./fixtures/legacy-page-source.mjs";
import assert from 'node:assert/strict';
import { bundleInitializer } from './fixtures/initializer-bundle.mjs';
import test from 'node:test';
import vm from 'node:vm';
import { useSyncCreatorDraftAutosave, readSyncCreatorWorkingRecord, cancelSyncCreatorAutosave } from '../src/features/sync/syncCreatorDraftAutosave.mjs';
import { finishSyncCreatorPublication } from '#ivlyrics/features/sync/syncCreatorSessionReplacement.mjs';

const source = readSyncCreatorFixture();
const helpersSource = source.slice(0, source.indexOf('const SyncDataCreator ='));

const loadHelpers = () => {
	const context = vm.createContext({ console, structuredClone, window: {} });
	vm.runInContext(`${helpersSource}\nglobalThis.compare = areSyncCreatorSyncBodiesEqual;`, context);
	return context.compare;
};

const renderHeader = props => renderSyncCreatorHeader({
	react: { createElement: (tag, options, ...children) => ({ tag, props: options, children }) },
	i18n: { t: key => key },
	isSubmitting: false, isReverting: false, hasUnsubmittedSync: false, hasPublishedSync: false,
	styles: { loadBtn: { background: 'original' }, submitBtn: { background: 'original' } },
	...props,
});
const headerButton = (header, name) => header.children.find(child => child?.props?.className === name);

const line = (start, chars, extra = {}) => ({ start, end: start + chars.length - 1, chars, ...extra });

test('identical sync bodies compare equal while timing changes do not', () => {
	const compare = loadHelpers();
	const left = { lines: [line(0, [1, 1.5, 2]), line(3, [3, 3.25])] };
	const right = structuredClone(left);
	assert.equal(compare(left, right), true);
	right.lines[0].chars[1] = 1.6;
	assert.equal(compare(left, right), false);
});

test('missing kind/speaker match their defaults and line count matters', () => {
	const compare = loadHelpers();
	const plain = { lines: [line(0, [1, 2])] };
	const explicit = { lines: [line(0, [1, 2], { kind: 'vocal', speaker: 'NORMAL' })] };
	assert.equal(compare(plain, explicit), true);
	assert.equal(compare(plain, { lines: [line(0, [1, 2]), line(2, [3])] }), false);
	assert.equal(compare({ lines: [] }, { lines: [] }), true);
	assert.equal(compare(null, { lines: [line(0, [1])] }), false);
});

test('sub-millisecond rounding is ignored but parallel timing is compared', () => {
	const compare = loadHelpers();
	assert.equal(
		compare({ lines: [line(0, [1.0004])] }, { lines: [line(0, [1.00049])] }),
		true
	);
	const left = { lines: [line(0, [1, 2], { parallel: { parts: [{ id: 'a', ranges: [{ start: 0, end: 1 }], chars: [1, 2] }] } })] };
	const right = structuredClone(left);
	right.lines[0].parallel.parts[0].chars[1] = 2.5;
	assert.equal(compare(left, right), false);
});

test('legacy compact line and vocal timing compare against their expanded editing marks', () => {
	const compare = loadHelpers();
	const compact = { version: 5, lines: [{ start: 0, end: 3, granularity: 'line', timing: 1, parallel: { parts: [
		{ id: 'a', ranges: [{ start: 0, end: 3 }], granularity: 'word', timing: [[1, 2], [3, 3]] },
	] } }] };
	const expanded = structuredClone(compact);
	expanded.lines[0].chars = [1, 1, 1, 1];
	delete expanded.lines[0].timing;
	expanded.lines[0].parallel.parts[0].chars = [2, 2, 3, 3];
	delete expanded.lines[0].parallel.parts[0].timing;
	assert.equal(compare(compact, expanded), true);
	const changed = structuredClone(compact);
	changed.lines[0].parallel.parts[0].timing[1][1] = 4;
	assert.equal(compare(compact, changed), false);
});

test('unsubmitted comparison includes speaker styling, granularity and vocal part layout', () => {
	const compare = loadHelpers();
	for (const extra of [
		{ granularity: 'word' }, { 'speaker-color': '#ff0000' }, { 'speaker-fallback': 'FEMALE 1' }
	]) {
		assert.equal(compare({ lines: [line(0, [1, 2], { speaker: 'CUSTOM' })] },
			{ lines: [line(0, [1, 2], { speaker: 'CUSTOM', ...extra })] }), false, JSON.stringify(extra));
	}
	for (const extra of [{ 'speaker-color': '#ff0000' }, { 'speaker-fallback': 'FEMALE 1' }]) {
		const left = { lines: [line(0, [1, 2], { styleRanges: [{ start: 0, end: 1, speaker: 'CUSTOM' }] })] };
		const right = structuredClone(left);
		Object.assign(right.lines[0].styleRanges[0], extra);
		assert.equal(compare(left, right), false);
	}
	for (const extra of [
		{ role: 'background' }, { join: [2] }, { granularity: 'word' },
		{ 'speaker-color': '#ff0000' }, { 'speaker-fallback': 'FEMALE 1' }
	]) {
		const left = { lines: [line(0, [1, 2], { parallel: { parts: [{
			id: 'a', ranges: [{ start: 0, end: 0 }, { start: 1, end: 1 }], chars: [1, 2],
			role: 'lead', join: [1], speaker: 'CUSTOM'
		}] } })] };
		const right = structuredClone(left);
		Object.assign(right.lines[0].parallel.parts[0], extra);
		assert.equal(compare(left, right), false, JSON.stringify(extra));
	}
});

test('deleting the final published line stays marked as unsubmitted', () => {
	const start = source.indexOf('\tuseEffect(() => {\n\t\tconst previous = latestSessionRecordRef.current;\n\t\tsetHasUnsubmittedSync(');
	const end = source.indexOf('\n\tconst isSourceLoading =', start + 1);
	assert.ok(start >= 0 && end > start);
	const effect = source.slice(start, end);
	const baseline = { lines: [line(0, [1])] };
	let result;
	const context = vm.createContext({
		window: {}, structuredClone, console,
		useEffect: callback => callback(), publishedBaseline: baseline,
		syncData: { lines: [] }, setHasUnsubmittedSync: value => { result = value; },
		activeSessionDraftKey: 'fixture', hasPublishedSync: true,
		latestSessionRecordRef: { current: null },
		manualParallelSplitDrafts: {}, parentheticalLayoutDrafts: {}, mergedLineDrafts: {},
		materializeSyncCreatorParallelDrafts: () => assert.fail('no layouts to project'),
	});
	vm.runInContext(helpersSource + '\n' + effect, context);
	assert.equal(result, true);
});

test('submit updates the baseline, clears the unsubmitted flag and closes the editor', async () => {
	const data = { lines: [line(0, [1])] };
	const serverBaselineSyncDataRef = { current: null };
	const calls = [];
	await finishSyncCreatorPublication('GBARL1901205', data, {
		clearPublishedCaches: async isrc => { calls.push(['clear', isrc]); },
		isDraftCurrent: () => true,
		isEditorOpen: () => true,
		isSourceCurrent: () => true,
		updatePublishedBaseline: value => {
			serverBaselineSyncDataRef.current = structuredClone(value);
			calls.push(['published', true]);
		},
		draft: {
			deleteActiveSyncCreatorDraft: async () => { calls.push('delete'); return true; },
		},
		editor: {
			setHasUnsubmittedSync: value => calls.push(['unsubmitted', value]),
			onClose: () => calls.push('close'),
		},
	});
	assert.deepEqual(calls, [['published', true], ['clear', 'GBARL1901205'], 'delete', ['unsubmitted', false], 'close']);
	assert.deepEqual(serverBaselineSyncDataRef.current, data);
	assert.notEqual(serverBaselineSyncDataRef.current, data);
});

test('submit button turns red while sync changes are unsubmitted', () => {
	const red = headerButton(renderHeader({ hasUnsubmittedSync: true, syncData: {} }), 'sync-creator-submit');
	assert.equal(red.props.style.background, TOSS_RED);
	assert.equal(red.props.title, 'syncCreator.unsubmittedChanges');
	assert.equal(red.props.disabled, false);
	const clean = headerButton(renderHeader({ hasUnsubmittedSync: false, syncData: {} }), 'sync-creator-submit');
	assert.equal(clean.props.style.background, 'original');
	assert.equal(clean.props.title, undefined);
});

test('autosave writes the latest revision and flushes it when the editor closes', async () => {
	const effects = [], timers = new Map(), writes = [], saves = [];
	const ref = current => ({ current });
	const refs = {
		sessionAutosaveTimerRef: ref(null), latestSessionRecordRef: ref(null),
		activeSessionDraftKeyRef: ref('first'), sessionAppliedDraftKeyRef: ref(''),
		sessionBaselineDraftRef: ref(null),
		sessionAutosaveEnabledRef: ref(true), sessionAutosaveSuppressedRef: ref(false),
		sessionWriteGenerationRef: ref(0), sessionDraftResetRevisions: new Map(), sessionPendingSnapshotRef: ref(null),
	};
	const windowEvents = new EventTarget();
	const documentEvents = Object.assign(new EventTarget(), { visibilityState: 'visible' });
	let revision = 1;
	let serialized = 0;
	let queuedWrite;
	const cancelledWrites = [];
	useSyncCreatorDraftAutosave({
		useCallback: callback => callback,
		useEffect: callback => effects.push(callback),
		useLayoutEffect: callback => effects.push(callback),
		store: {
			async saveDraft(record, { isCurrent }) {
				writes.push(record);
				if (queuedWrite) await queuedWrite;
				if (!isCurrent()) {
					cancelledWrites.push(record.clientRevision);
					return null;
				}
				return record;
			},
		},
		draftKey: 'first', readyDraftKey: 'first', hydrated: true, lyricsText: 'fixture', enabled: true,
		buildRecord: () => { serialized++; return { draftKey: 'first', clientRevision: revision }; },
		setSaveState() {},
		onSave: record => saves.push(record),
		refs,
		host: {
			windowEvents, documentEvents,
			scheduleTimer(callback, delay) {
				assert.equal(delay, 3000);
				timers.set(1, callback);
				return 1;
			},
			cancelTimer: id => timers.delete(id),
		},
	});
	const [autosave, subscribe] = effects;
	const cleanup = subscribe();

	autosave();
	revision = 2;
	autosave();
	assert.equal(timers.size, 1);
	assert.equal(serialized, 0, 'renders only stage the editor state');
	const firstTimer = timers.get(1);
	timers.delete(1);
	await firstTimer();
	assert.deepEqual(writes.map(record => record.clientRevision), [2]);
	assert.deepEqual(saves.map(record => record.clientRevision), [2]);
	assert.equal(serialized, 1);

	revision = 3;
	autosave();
	const write = Promise.withResolvers();
	queuedWrite = write.promise;
	const olderSave = timers.get(1);
	timers.delete(1);
	const olderSaveInProgress = olderSave();
	revision = 4;
	autosave();
	write.resolve();
	await olderSaveInProgress;
	assert.equal(readSyncCreatorWorkingRecord(refs).clientRevision, 4);
	assert.deepEqual(saves.map(record => record.clientRevision), [2]);

	const currentSave = timers.get(1);
	timers.delete(1);
	await currentSave();
	assert.deepEqual(writes.map(record => record.clientRevision), [2, 3, 4]);
	assert.deepEqual(saves.map(record => record.clientRevision), [2, 4]);

	revision = 5;
	autosave();
	const sourceWrite = Promise.withResolvers();
	queuedWrite = sourceWrite.promise;
	const saveBeforeSwitch = timers.get(1);
	timers.delete(1);
	const sourceSaveInProgress = saveBeforeSwitch();
	refs.activeSessionDraftKeyRef.current = 'other';
	refs.sessionWriteGenerationRef.current++;
	refs.latestSessionRecordRef.current = { draftKey: 'other', clientRevision: 6 };
	sourceWrite.resolve();
	await sourceSaveInProgress;
	assert.deepEqual(saves.map(record => record.clientRevision), [2, 4]);

	documentEvents.dispatchEvent(new Event('visibilitychange'));
	assert.deepEqual(writes.map(record => record.clientRevision), [2, 3, 4, 5]);
	documentEvents.visibilityState = 'hidden';
	documentEvents.dispatchEvent(new Event('visibilitychange'));
	assert.deepEqual(writes.map(record => record.clientRevision), [2, 3, 4, 5, 6]);

	refs.activeSessionDraftKeyRef.current = 'first';
	revision = 7;
	autosave();
	cleanup();
	assert.equal(timers.size, 0);
	assert.equal(refs.sessionAutosaveTimerRef.current, null);
	windowEvents.dispatchEvent(new Event('beforeunload'));
	documentEvents.dispatchEvent(new Event('visibilitychange'));
	assert.deepEqual(writes.map(record => record.clientRevision), [2, 3, 4, 5, 6, 7]);

	revision = 8;
	autosave();
	const cancelled = timers.get(1);
	cancelSyncCreatorAutosave(refs.sessionAutosaveTimerRef, id => timers.delete(id));
	revision = 9;
	autosave();
	const currentTimer = refs.sessionAutosaveTimerRef.current;
	await cancelled();
	assert.equal(refs.sessionAutosaveTimerRef.current, currentTimer);
	assert.deepEqual(writes.map(record => record.clientRevision), [2, 3, 4, 5, 6, 7]);
	await timers.get(1)();
	assert.deepEqual(writes.map(record => record.clientRevision), [2, 3, 4, 5, 6, 7, 9]);

	revision = 10;
	autosave();
	const pendingReset = Promise.withResolvers();
	queuedWrite = pendingReset.promise;
	const waitForWrite = timers.get(1)();
	refs.sessionDraftResetRevisions.set('first', 1);
	pendingReset.resolve();
	await waitForWrite;
	assert.deepEqual(cancelledWrites, [10], 'a queued write cannot recreate a discarded draft');
});

test('revert prefers the published sync, falls back to the cached baseline, and discards the draft', async () => {
	const revert = `
		globalThis.revert = createSyncCreatorPublicationActions({
			runPublication, track: { id: 'fixture', isrc: 'GBARL1901205', title: 'Track', artist: 'Artist', album: 'Album',
				provider: '', getProvider: () => 'lrclib' },
			canEdit: true, isRecording: () => false, lyrics: { text: 'ABC\\nDEF' },
			syncData: cached, hasUnsubmittedSync: true, isEditorOpen: () => true,
			draft: { deleteActiveSyncCreatorDraft },
			published: { readBaseline: () => serverBaselineSyncDataRef.current, updateBaseline: updatePublishedBaseline },
			layout, editor, transport: { getSyncService: readSyncCreatorSyncService },
			timing: { getCodec: readSyncCreatorCodec, sanitize: sanitizeSyncCreatorSyncData },
			dialog: { confirm: window.confirm, setReverting, translate: key => key, toast },
		}).revert;
	`;
	for (const networkAvailable of [true, false]) {
		const calls = [];
		const sync = { version: 2, lines: [line(0, [1, 2, 3]), line(3, [4, 5, 6])] };
		const cached = { version: 2, lines: [line(0, [9, 10, 11]), line(3, [12, 13, 14])] };
		const context = vm.createContext({
			console, structuredClone, cached,
			runPublication: operation => operation(() => true),
			window: {
				confirm: message => { calls.push(['confirm', message]); return true; },
				SyncDataService: { async getSyncData(...args) {
					calls.push(['published', ...args]);
					return networkAvailable ? { syncData: sync } : null;
				} },
			},
			serverBaselineSyncDataRef: { current: cached },
			syncCreatorDraftStore: { cloneValue: structuredClone },
			deleteActiveSyncCreatorDraft: async options => { calls.push(['deleteDraft', options]); return true; },
			toast: { success: key => calls.push(['success', key]), error: key => calls.push(['error', key]) },
		});
		const record = (...names) => Object.fromEntries(names.map(name => [name, value => calls.push([name, value])]));
		context.updatePublishedBaseline = value => {
			context.serverBaselineSyncDataRef.current = structuredClone(value);
			calls.push(['setHasPublishedSync', Boolean(value?.lines?.length)]);
		};
		context.layout = record('setParallelPartMetaDrafts', 'setManualParallelSplitDrafts', 'setParentheticalLayoutDrafts',
			'setMergedLineDrafts', 'setLineMetaDrafts', 'setLineStyleDrafts', 'setPendingParentheticalLayoutDecision',
			'setPendingMultiVocalDecision', 'setMultiVocalMode', 'setActiveParallelPartId', 'setGlobalOffset');
		context.editor = {
			...record('setCurrentLineIndex', 'setSyncData', 'setMode', 'setHasUnsubmittedSync'),
			resetCurrentSyncInput: () => calls.push(['resetRecordingInput']),
		};
		context.setReverting = value => calls.push(['setIsReverting', value]);
		vm.runInContext(helpersSource + '\n' + revert, context);
		await context.revert();
		const summary = Object.fromEntries(JSON.parse(JSON.stringify(calls)).map(([key, value]) => [key, value]));
		const expected = networkAvailable ? sync : cached;
		const normalized = { ...expected, lines: expected.lines.map(row => ({ ...row, granularity: 'character' })) };
		assert.deepEqual(summary.setSyncData, normalized);
		assert.deepEqual(context.serverBaselineSyncDataRef.current, normalized);
		assert.notEqual(calls.find(([key]) => key === 'setSyncData')[1], context.serverBaselineSyncDataRef.current);
		for (const field of ['ParallelPartMeta', 'ManualParallelSplit', 'ParentheticalLayout', 'MergedLine', 'LineMeta', 'LineStyle']) {
			assert.deepEqual(summary[`set${field}Drafts`], {});
		}
		assert.equal(summary.confirm, 'syncCreator.revertConfirm');
		assert.equal(summary.setHasUnsubmittedSync, false);
		assert.equal(summary.setHasPublishedSync, true);
		assert.equal(summary.setIsReverting, false);
		assert.equal(summary.success, 'syncCreator.reverted');
		assert.equal(summary.error, undefined);
		assert.deepEqual(JSON.parse(JSON.stringify(calls.find(([key]) => key === 'published'))), [
			'published', 'fixture', 'lrclib', { isrc: 'GBARL1901205', title: 'Track', artist: 'Artist', album: 'Album' },
		]);
		assert.deepEqual(summary.deleteDraft, { resumeAutosave: true });
		const resetIndex = calls.findIndex(([key]) => key === 'resetRecordingInput');
		assert.ok(calls.findIndex(([key]) => key === 'deleteDraft') < resetIndex);
		assert.ok(resetIndex < calls.findIndex(([key]) => key === 'setSyncData'));
	}
});

test('header offers revert next to submit and both lock while reverting', () => {
	const revertAction = () => {};
	const submitAction = () => {};
	const options = {
		handleSubmit: submitAction, handleRevertToPublished: revertAction, lyricsText: 'ABC', syncData: {},
	};
	assert.equal(headerButton(renderHeader(options), 'sync-creator-revert'), undefined);
	const header = renderHeader({ ...options, hasPublishedSync: true, isReverting: true });
	const revert = headerButton(header, 'sync-creator-revert');
	const submit = headerButton(header, 'sync-creator-submit');
	assert.equal(header.children.indexOf(submit), header.children.indexOf(revert) + 1);
	assert.equal(revert.props.onClick, revertAction);
	assert.equal(submit.props.onClick, submitAction);
	assert.equal(revert.props.disabled, true);
	assert.equal(submit.props.disabled, true);
	assert.equal(revert.props.title, 'syncCreator.revertDesc');
	const loading = renderHeader({ ...options, hasPublishedSync: true, isSourceLoading: true });
	assert.equal(headerButton(loading, 'sync-creator-revert').props.disabled, true);
	assert.equal(headerButton(loading, 'sync-creator-submit').props.disabled, true);
});

test('a v6 published baseline equals its expanded editor view and remains dirty after a unit or held-end change',()=>{
  const context=vm.createContext({console,structuredClone,window:{}});
  vm.runInContext(bundleInitializer(new URL('../src/spicetify/startSyncDataCodec.js', import.meta.url)), context);
  vm.runInContext(helpersSource+';globalThis.compare = areSyncCreatorSyncBodiesEqual;globalThis.expand = prepareSyncCreatorWorkSnapshot;',context);
  const codec=context.window.SyncDataCodec;
  for(const granularity of ['line','word','character']){
    const before={version:5,lines:[{start:0,end:3,granularity,...(granularity==='line'?{timing:1}:granularity==='word'?{timing:[[1,1],[3,2]]}:{chars:[1,1.1,2,2.1]})}]};
    const wire=codec.encode(before),editor=structuredClone(context.expand(wire));
    assert.equal(context.compare(wire,editor),true,granularity);
    editor.lines[0].lastCharEnd=3;assert.equal(context.compare(wire,editor),false,granularity);
  }
});
