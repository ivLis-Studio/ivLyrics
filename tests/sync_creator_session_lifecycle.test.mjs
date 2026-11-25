import assert from 'node:assert/strict';
import test from 'node:test';
import {
	createSyncCreatorSessionLifecycle, createSyncCreatorSessionRefs,
} from '#ivlyrics/features/sync/syncCreatorSessionLifecycle.mjs';
import { useSyncCreatorSessionCheckpoints } from '#ivlyrics/features/sync/syncCreatorSessionCheckpoints.mjs';
import { useSyncCreatorSessionPersistence } from '#ivlyrics/features/sync/syncCreatorSessionPersistence.mjs';
import { createSyncCreatorEditorLifetime } from '#ivlyrics/features/sync/syncCreatorEditorLifetime.mjs';
import { applySyncCreatorImportedSession } from '#ivlyrics/features/sync/syncCreatorSessionReplacement.mjs';

const sourceA = { draftKey: 'A', draft: { lines: ['original'] }, clientRevision: 10 };
const ref = current => ({ current });
const noop = () => {};
const deferred = () => {
	let resolve;
	const promise = new Promise(done => { resolve = done; });
	return { promise, resolve };
};
const settle = () => new Promise(setImmediate);

function createSession(store = {}, logger = console) {
	const events = [];
	const attrs = { isSessionAutosaveEnabled: true };
	const storage = new Map();
	const refs = createSyncCreatorSessionRefs({ now: () => 100 });
	const pendingPlaybackNavigationRef = ref(false);
	const ui = Object.fromEntries([
		'setIsRestoringCheckpoint', 'setSessionReadyDraftKey', 'setSessionHistory', 'setSessionHistoryCursorId',
		'setHistoryAnnouncement', 'setSessionSaveState', 'setSessionHydrationComplete', 'setIsSessionAutosaveEnabled',
		'setLastSessionSavedAt',
	].map(name => [name, value => {
		const property = name[3].toLowerCase() + name.slice(4);
		attrs[property] = typeof value === 'function' ? value(attrs[property]) : value;
		events.push([name, attrs[property]]);
	}]));
	const i18n = { t: key => key };
	const toast = { success: key => events.push(['success', key]), error: key => events.push(['error', key]) };
	const cancelTimer = timer => events.push(['cancel', timer]);
	const actions = createSyncCreatorSessionLifecycle({
		syncCreatorDraftStore: store, pendingPlaybackNavigationRef, refs, ui, cancelTimer, i18n, toast,
		scheduleFrame: callback => callback(), getStorage: () => ({ setItem: (key, value) => storage.set(key, value) }),
		now: () => 100, logger,
	});
	return { store, refs, attrs, events, pendingPlaybackNavigationRef, ui, i18n, toast, cancelTimer, actions, storage };
}

test('source change flushes the previous draft and invalidates its pending operations', () => {
	const saved = [];
	const baselines = [];
	const h = createSession({ saveDraft: async (record, options) => {
		saved.push(record);
		baselines.push(options.baselineSnapshot);
	} });
	h.refs.activeSessionDraftKeyRef.current = sourceA.draftKey;
	h.refs.latestSessionRecordRef.current = sourceA;
	h.refs.sessionBaselineDraftRef.current = { draftKey: 'A', snapshot: { syncData: null, editor: {} } };
	const originalBaseline = h.refs.sessionBaselineDraftRef.current.snapshot;
	h.refs.sessionAutosaveTimerRef.current = { id: 4 };
	const first = h.actions.beginDraftSourceChange();
	assert.equal(h.actions.isCurrentSyncCreatorSourceChange(first), true);
	assert.deepEqual(saved, [sourceA]);
	assert.deepEqual(baselines, [originalBaseline]);
	assert.equal(h.pendingPlaybackNavigationRef.current, true);
	assert.equal(h.refs.latestSessionRecordRef.current, null);
	assert.equal(h.refs.sessionRecoveryRequestRef.current, 1);
	assert.equal(h.refs.sessionCheckpointRestoreRequestRef.current, 1);
	assert.equal(h.refs.sessionWriteGenerationRef.current, 1);
	assert.equal(h.refs.sessionSkipNextSourceRecoveryRef.current, true);
	assert.equal(h.attrs.sessionSaveState, 'loading');

	h.actions.toggleSessionAutosave();
	assert.equal(h.attrs.sessionSaveState, 'disabled');
	assert.equal(h.storage.get('ivLyrics:syncCreator:autosave-enabled'), 'false');
	h.refs.latestSessionRecordRef.current = sourceA;
	h.actions.beginDraftSourceChange();
	assert.equal(h.actions.isCurrentSyncCreatorSourceChange(first), false);
	assert.deepEqual(saved, [sourceA], 'disabling autosave only stops implicit writes');
});

test('closing waits for the outgoing source even before its replacement has an active draft', async () => {
	const write = deferred();
	const saved = [];
	const h = createSession({
		async saveDraft(record) {
			await write.promise;
			saved.push(record);
		},
		async flush() {},
	});
	h.refs.activeSessionDraftKeyRef.current = 'A';
	h.refs.latestSessionRecordRef.current = sourceA;
	h.actions.beginDraftSourceChange();
	h.refs.activeSessionDraftKeyRef.current = '';

	let closed = false;
	const closing = h.actions.flushDraftBeforeClose().then(result => { closed = true; return result; });
	await settle();
	assert.equal(closed, false);
	write.resolve();
	assert.equal(await closing, true);
	assert.deepEqual(saved, [sourceA]);
});

test('a failed outgoing write remains available to retry from the close action', async () => {
	let failing = true;
	const attempts = [];
	const h = createSession({
		async saveDraft(record) {
			attempts.push(record);
			if (failing) throw new Error('IndexedDB write aborted');
		},
		async flush() {},
	}, { warn: noop });
	h.refs.activeSessionDraftKeyRef.current = 'A';
	h.refs.latestSessionRecordRef.current = sourceA;
	h.actions.beginDraftSourceChange();
	h.refs.activeSessionDraftKeyRef.current = 'B';
	await settle();

	assert.equal(await h.actions.flushDraftBeforeClose(), false);
	assert.equal(h.attrs.sessionSaveState, 'error');
	failing = false;
	assert.equal(await h.actions.flushDraftBeforeClose(), true);
	assert.deepEqual(attempts, [sourceA, sourceA, sourceA]);
});

test('reopening a source can recover its newest outgoing edit and stored checkpoints after a write fails', async () => {
	const stored = {
		...sourceA, trackKey: 'spotify:track:1', updatedAt: 80, history: [{ id: 'checkpoint' }],
	};
	const latest = {
		...sourceA, trackKey: stored.trackKey, clientRevision: 11, updatedAt: 100,
		draft: { lines: ['last input'] },
	};
	const otherTrack = { ...sourceA, draftKey: 'other-source', trackKey: 'spotify:track:2' };
	let failRead = false;
	let storedDraft = stored;
	const h = createSession({
		async saveDraft() { throw new Error('IndexedDB write aborted'); },
		async getDraft(key) { return key === stored.draftKey ? storedDraft : null; },
		async getDraftsForTrack(trackKey) {
			if (failRead) throw new Error('IndexedDB unavailable');
			return trackKey === stored.trackKey ? [storedDraft] : [];
		},
	}, { warn: noop });
	for (const record of [latest, otherTrack]) {
		h.refs.activeSessionDraftKeyRef.current = record.draftKey;
		h.refs.latestSessionRecordRef.current = record;
		h.actions.beginDraftSourceChange();
	}
	await settle();

	const recovered = { ...stored, ...latest };
	assert.deepEqual(await h.actions.readSourceDraft('A'), recovered);
	assert.deepEqual(await h.actions.readTrackDrafts(stored.trackKey), [recovered]);
	storedDraft = { ...stored, clientRevision: 12 };
	assert.equal(await h.actions.readSourceDraft('A'), storedDraft);
	failRead = true;
	assert.deepEqual(await h.actions.readTrackDrafts(stored.trackKey), [latest]);
});

test('resetting a source after a failed outgoing write prevents a close retry from restoring it', async () => {
	const attempts = [];
	const written = [];
	const h = createSession({
		async saveDraft(record, { isCurrent }) {
			attempts.push(record);
			if (attempts.length === 1) throw new Error('IndexedDB write aborted');
			if (isCurrent()) written.push(record);
		},
		async deleteDraft() {},
		async flush() {},
	}, { warn: noop });
	h.refs.activeSessionDraftKeyRef.current = 'A';
	h.refs.latestSessionRecordRef.current = sourceA;
	h.actions.beginDraftSourceChange();
	await settle();
	assert.equal(await h.actions.deleteActiveSyncCreatorDraft(), true);
	assert.equal(await h.actions.flushDraftBeforeClose(), true);
	assert.deepEqual(written, []);
});

test('reset queues draft deletion immediately and releases autosave after it completes', async () => {
	const waiting = deferred();
	const removals = [];
	const h = createSession({
		deleteDraft(key) { removals.push(key); return waiting.promise; },
		flush() { assert.fail('deletion is already serialized with writes by the store'); },
	});
	h.refs.activeSessionDraftKeyRef.current = 'A';
	h.refs.latestSessionRecordRef.current = sourceA;
	const deletion = h.actions.deleteActiveSyncCreatorDraft({ resumeAutosave: true });
	assert.deepEqual(removals, ['A']);
	assert.equal(h.attrs.sessionReadyDraftKey, '');
	assert.equal(h.refs.sessionAutosaveSuppressedRef.current, true);
	assert.equal(h.refs.latestSessionRecordRef.current, sourceA, 'keep the draft until deletion commits');
	h.actions.claimSessionForLocalEditing();
	assert.equal(h.attrs.sessionReadyDraftKey, '', 'edits cannot reopen autosave before the queued reset finishes');
	waiting.resolve();
	assert.equal(await deletion, false, 'a newer edit owns the editor after deletion');
	assert.equal(h.refs.latestSessionRecordRef.current, sourceA);
	assert.equal(h.refs.sessionAutosaveSuppressedRef.current, false);
	assert.equal(h.attrs.sessionReadyDraftKey, 'A');
});

test('a failed draft deletion keeps the active edit, history and pending autosave available for retry', async () => {
	let fail = true;
	const h = createSession({
		async deleteDraft(_key, { beforeDelete }) {
			if (!beforeDelete()) return false;
			if (fail) throw new Error('IndexedDB write aborted');
			return true;
		},
	}, { warn: noop });
	const history = [{ id: 'last-checkpoint' }];
	const pending = { draftKey: 'A', buildRecord: () => sourceA };
	h.refs.activeSessionDraftKeyRef.current = 'A';
	h.refs.latestSessionRecordRef.current = sourceA;
	h.refs.sessionPendingSnapshotRef.current = pending;
	h.ui.setSessionHistory(history);
	h.ui.setSessionHistoryCursorId(history[0].id);
	const revert = () => h.actions.deleteActiveSyncCreatorDraft({ resumeAutosave: true, isDraftCurrent: h.actions.captureDraftOwnership() });
	assert.equal(await revert(), false);
	assert.equal(h.refs.latestSessionRecordRef.current, sourceA);
	assert.equal(h.refs.sessionPendingSnapshotRef.current, pending);
	assert.equal(h.attrs.sessionHistory, history);
	assert.equal(h.attrs.sessionHistoryCursorId, history[0].id);
	assert.equal(h.attrs.sessionSaveState, 'error');
	assert.equal(h.attrs.sessionReadyDraftKey, 'A');
	assert.equal(h.refs.sessionAutosaveSuppressedRef.current, false);
	assert.deepEqual(h.events.at(-1), ['error', 'syncCreator.historySaveError']);

	fail = false;
	assert.equal(await revert(), true);
	assert.equal(h.refs.latestSessionRecordRef.current, null);
	assert.equal(h.refs.sessionPendingSnapshotRef.current, null);
	assert.deepEqual(h.attrs.sessionHistory, []);
});

test('closing waits for a pending deletion and saves the latest draft if deletion aborts', async () => {
	const removal = deferred();
	const saved = [];
	const h = createSession({
		async deleteDraft() {
			await removal.promise;
			throw new Error('IndexedDB write aborted');
		},
		async saveDraft(record) { saved.push(record); },
		async flush() {},
	}, { warn: noop });
	h.refs.activeSessionDraftKeyRef.current = 'A';
	h.refs.latestSessionRecordRef.current = sourceA;
	const deletion = h.actions.deleteActiveSyncCreatorDraft();
	let closed = false;
	const closing = h.actions.flushDraftBeforeClose().then(result => { closed = true; return result; });
	await settle();
	assert.equal(closed, false);
	assert.deepEqual(saved, []);
	removal.resolve();
	assert.equal(await deletion, false);
	assert.equal(await closing, true);
	assert.deepEqual(saved, [sourceA]);
});

test('an earlier reset does not clear suppression for a newer reset of the same source', async () => {
	const first = deferred();
	const second = deferred();
	const writes = [first, second];
	const h = createSession({ deleteDraft: () => writes.shift().promise });
	h.refs.activeSessionDraftKeyRef.current = 'A';
	const older = h.actions.deleteActiveSyncCreatorDraft({ resumeAutosave: true });
	const active = h.actions.deleteActiveSyncCreatorDraft({ resumeAutosave: true });
	first.resolve();
	await older;
	assert.equal(h.refs.sessionAutosaveSuppressedRef.current, true);
	assert.equal(h.attrs.sessionReadyDraftKey, '');
	second.resolve();
	await active;
	assert.equal(h.refs.sessionAutosaveSuppressedRef.current, false);
	assert.equal(h.attrs.sessionReadyDraftKey, 'A');
});

test('a source switch never writes a suppressed draft or a snapshot owned by another source', () => {
	const h = createSession({ saveDraft() { assert.fail('unexpected draft write'); } });
	h.refs.activeSessionDraftKeyRef.current = 'B';
	h.refs.latestSessionRecordRef.current = sourceA;
	h.actions.beginDraftSourceChange();
	h.refs.activeSessionDraftKeyRef.current = 'A';
	h.refs.latestSessionRecordRef.current = sourceA;
	h.refs.sessionAutosaveSuppressedRef.current = true;
	h.actions.beginDraftSourceChange();
});

for (const [outcome, nextDraftKey, expectsSave] of [
	['aborted', 'B', true], ['committed', 'B', false], ['aborted', 'A', false],
]) {
	test(`switching sources during a deletion that ${outcome}, then resetting ${nextDraftKey}`, async () => {
		const removal = deferred();
		const entered = deferred();
		const queued = [], written = [];
		let firstDelete = true;
		const h = createSession({
			async deleteDraft(key, { beforeDelete } = {}) {
				if (beforeDelete && !beforeDelete()) return false;
				if (!firstDelete) return true;
				firstDelete = false;
				assert.equal(key, 'A');
				entered.resolve();
				await removal.promise;
				if (outcome === 'aborted') throw new Error('IndexedDB write aborted');
				return true;
			},
			async saveDraft(record, { saveIf, isCurrent }) {
				queued.push(record);
				if (await saveIf && isCurrent()) written.push(record);
			},
		}, { warn: noop });
		const outgoingEdit = { ...sourceA, clientRevision: 11, draft: { lines: ['latest timing'] } };
		h.refs.activeSessionDraftKeyRef.current = 'A';
		h.refs.latestSessionRecordRef.current = sourceA;
		h.refs.sessionPendingSnapshotRef.current = { draftKey: 'A', buildRecord: () => outgoingEdit };
		const deletion = h.actions.deleteActiveSyncCreatorDraft({ isDraftCurrent: h.actions.captureDraftOwnership() });
		await entered.promise;
		h.actions.beginDraftSourceChange();
		h.refs.activeSessionDraftKeyRef.current = nextDraftKey;
		assert.deepEqual(queued, [outgoingEdit], 'enqueue before the new source can read the database');
		assert.deepEqual(written, []);
		assert.equal(await h.actions.deleteActiveSyncCreatorDraft({ resumeAutosave: true }), true);
		removal.resolve();
		assert.equal(await deletion, false, 'the departed source cannot update the new editor');
		await settle();
		assert.deepEqual(written, expectsSave ? [outgoingEdit] : []);
		assert.equal(h.attrs.sessionReadyDraftKey, nextDraftKey);
		assert.equal(h.attrs.sessionSaveState, 'idle');
	});
}

test('returning to the same source after a switch does not publish an older reset', async () => {
	const waiting = deferred();
	const h = createSession({ deleteDraft: () => waiting.promise });
	h.refs.activeSessionDraftKeyRef.current = 'A';
	const deletion = h.actions.deleteActiveSyncCreatorDraft({ resumeAutosave: true });
	h.actions.beginDraftSourceChange();
	h.refs.activeSessionDraftKeyRef.current = 'B';
	h.actions.beginDraftSourceChange();
	h.refs.activeSessionDraftKeyRef.current = 'A';
	waiting.resolve();
	await deletion;
	assert.equal(h.attrs.sessionReadyDraftKey, '');
	assert.equal(h.attrs.sessionSaveState, 'loading');
});

test('a capture belongs to the unchanged draft, even when a newer operation uses the same key', () => {
	const h = createSession();
	h.refs.activeSessionDraftKeyRef.current = 'A';
	const beforeEdit = h.actions.captureDraftOwnership();
	assert.equal(beforeEdit(), true);
	h.actions.claimSessionForLocalEditing();
	assert.equal(beforeEdit(), false);

	const beforeSourceChange = h.actions.captureDraftOwnership();
	h.actions.beginDraftSourceChange();
	h.refs.activeSessionDraftKeyRef.current = 'B';
	h.actions.beginDraftSourceChange();
	h.refs.activeSessionDraftKeyRef.current = 'A';
	assert.equal(beforeSourceChange(), false);
});

test('new edits during post-publication deletion can still autosave and retain the editor', async () => {
	const removal = deferred();
	const h = createSession({ deleteDraft: () => removal.promise });
	h.refs.activeSessionDraftKeyRef.current = 'A';
	const publication = h.actions.deleteActiveSyncCreatorDraft();
	h.actions.claimSessionForLocalEditing();
	removal.resolve();
	assert.equal(await publication, false);
	assert.equal(h.attrs.sessionReadyDraftKey, 'A');
	assert.equal(h.refs.sessionAutosaveSuppressedRef.current, false);
});

for (const replacement of ['none', 'edit', 'source switch']) {
	test(`automatic draft removal checks ownership at the write lock after ${replacement}`, async () => {
		const lock = deferred();
		const removed = [];
		const flushed = [];
		const h = createSession({
			async deleteDraft(key, { beforeDelete }) {
				await lock.promise;
				if (!beforeDelete()) return false;
				removed.push(key);
				return true;
			},
			async saveDraft(record) { flushed.push(record); },
		});
		h.refs.activeSessionDraftKeyRef.current = 'A';
		h.refs.latestSessionRecordRef.current = sourceA;
		const removal = h.actions.deleteActiveSyncCreatorDraft({ isDraftCurrent: h.actions.captureDraftOwnership() });
		assert.equal(h.refs.latestSessionRecordRef.current, sourceA);
		assert.equal(h.refs.sessionAutosaveSuppressedRef.current, false);

		if (replacement === 'edit') h.actions.claimSessionForLocalEditing();
		if (replacement === 'source switch') {
			h.actions.beginDraftSourceChange();
			h.refs.activeSessionDraftKeyRef.current = 'B';
		}
		lock.resolve();
		assert.equal(await removal, replacement === 'none');
		assert.deepEqual(removed, replacement === 'none' ? ['A'] : []);
		assert.deepEqual(flushed, replacement === 'source switch' ? [sourceA] : []);
		assert.equal(h.refs.sessionDraftResetRevisions.has('A'), replacement === 'none');
		if (replacement === 'edit') assert.equal(h.refs.latestSessionRecordRef.current, sourceA);
	});
}

function checkpoints(h, {
	apply = noop, build = () => sourceA, isEditorOpen = () => true,
	history = [], cursor = 'old',
	lifetime = createSyncCreatorEditorLifetime(isEditorOpen),
} = {}) {
	return useSyncCreatorSessionCheckpoints({
		react: { useMemo: fn => fn(), useCallback: fn => fn, useRef: ref },
		syncCreatorDraftStore: h.store,
		source: { activeSessionDraftKey: 'A', lyricsLines: ['First lyric'], lyricsText: 'First lyric' },
		editor: { currentLineIndex: 0, activeParallelTargetId: 'full', syncData: null, mode: 'idle', isKeyboardSyncingRef: ref(false) },
		state: { sessionHistory: history, sessionHistoryCursorId: cursor },
		refs: h.refs, ui: h.ui, cancelTimer: h.cancelTimer, i18n: h.i18n, toast: h.toast,
		buildSyncCreatorSessionRecord: build, applySyncCreatorSessionRecord: apply,
		...h.actions, lifetime,
	});
}

test('undo follows the cursor created by flushing the pending edit', async () => {
	const history = [{ id: 'source' }, { id: 'manual' }];
	const saved = { ...sourceA, history: [...history, { id: 'working' }], historyCursorId: 'working' };
	const requested = [];
	const saving = deferred();
	const h = createSession({
		saveDraft: () => saving.promise,
		flush: async () => {},
		getCheckpointCandidate: async (draftKey, historyCursorId) => {
			requested.push(historyCursorId);
			return { draftKey, historyCursorId, draft: {}, clientRevision: saved.clientRevision };
		},
		async restoreCheckpoint(draftKey, historyCursorId, draft, _revision, { expectedClientRevision }) {
			assert.equal(expectedClientRevision, saved.clientRevision);
			return { draftKey, historyCursorId, draft };
		},
	});
	h.refs.activeSessionDraftKeyRef.current = 'A';
	h.refs.sessionPendingSnapshotRef.current = { draftKey: 'A', buildRecord: () => sourceA };
	const editor = checkpoints(h, { history, cursor: 'manual', apply: record => record });
	const undo = editor.moveHistoryCursor(-1);
	await editor.moveHistoryCursor(-1);
	saving.resolve(saved);
	await undo;
	assert.deepEqual(requested, ['manual']);
});

test('undo does not apply a target chosen before another window changed the history', async () => {
	const history = [{ id: 'source' }, { id: 'working' }];
	const h = createSession({
		async flush() {},
		async getDraft() { return { ...sourceA, history, historyCursorId: 'working' }; },
		async getCheckpointCandidate(draftKey, historyCursorId) {
			assert.equal(historyCursorId, 'source');
			return { draftKey, historyCursorId, draft: {}, clientRevision: sourceA.clientRevision + 1 };
		},
		restoreCheckpoint() { assert.fail('the selected cursor is stale'); },
	});
	h.refs.activeSessionDraftKeyRef.current = 'A';
	const editor = checkpoints(h, { history, cursor: 'working', apply: () => assert.fail('a stale checkpoint must not apply') });
	await editor.moveHistoryCursor(-1);
	assert.equal(h.attrs.sessionSaveState, 'error');
	assert.equal(h.attrs.isRestoringCheckpoint, false);
	assert.ok(h.events.some(([name, key]) => name === 'error' && key === 'syncCreator.historyRestoreError'));
});

test('manual checkpoints use only the active source baseline', async () => {
	const saved = [];
	const h = createSession({
		async appendCheckpoint(record, options) { saved.push(options); return record; },
	});
	h.refs.activeSessionDraftKeyRef.current = 'A';
	h.refs.sessionBaselineDraftRef.current = { draftKey: 'B', snapshot: { syncData: null, editor: {} } };
	await checkpoints(h).addManualCheckpoint();
	assert.equal(saved.length, 1);
	assert.equal(saved[0].baselineSnapshot, undefined);
});

test('manual checkpoint captures the active line and the original source baseline', async () => {
	const records = [];
	const baseline = { unchanged: true };
	const h = createSession({
		async appendCheckpoint(record, meta) {
			records.push([record, meta]);
			return { ...record, history: [{ id: 'saved' }], historyCursorId: 'saved', updatedAt: 200 };
		},
	});
	h.refs.activeSessionDraftKeyRef.current = 'A';
	h.refs.sessionBaselineDraftRef.current = { draftKey: 'A', snapshot: baseline };
	await checkpoints(h).addManualCheckpoint();
	assert.deepEqual(records, [[sourceA, {
		kind: 'manual', lineIndex: 0, lineText: 'First lyric', partId: 'full',
		snapshot: sourceA.draft, baselineSnapshot: baseline,
	}]]);
	assert.equal(h.attrs.sessionHistoryCursorId, 'saved');
	assert.equal(h.attrs.sessionSaveState, 'saved');
	assert.equal(h.attrs.historyAnnouncement, 'syncCreator.historyCheckpointSaved');
	assert.equal(h.attrs.lastSessionSavedAt, 200);
});

test('checkpoint restore validates before writing and publishes only when the source stays current', async () => {
	for (const switchSource of [false, true]) {
		const waiting = deferred();
		const published = [];
		const h = createSession({
			saveDraft: async () => {},
			flush: () => waiting.promise,
			getCheckpointCandidate: async (key, checkpoint) => ({ draftKey: key, checkpoint }),
			restoreCheckpoint: async (key, checkpoint, verified, revision) => {
				published.push(['write', key, checkpoint, verified, revision]);
				return { draftKey: key, historyCursorId: checkpoint };
			},
		});
		h.refs.activeSessionDraftKeyRef.current = 'A';
		h.refs.latestSessionRecordRef.current = sourceA;
		const api = checkpoints(h, {
			apply(record, options = {}) {
				if (options.validateOnly) {
					published.push(['validate', record.checkpoint]);
					return { draft: { verified: true } };
				}
				published.push(['apply', record.historyCursorId]);
				return record;
			},
		});
		const restore = api.restoreHistoryCheckpoint('checkpoint');
		assert.equal(h.attrs.isRestoringCheckpoint, true);
		if (switchSource) {
			h.actions.beginDraftSourceChange();
			h.refs.activeSessionDraftKeyRef.current = 'B';
		}
		waiting.resolve();
		await restore;
		assert.equal(h.attrs.isRestoringCheckpoint, false);
		assert.deepEqual(published, switchSource ? [] : [
			['validate', 'checkpoint'],
			['write', 'A', 'checkpoint', { verified: true }, 100001],
			['apply', 'checkpoint'],
		]);
		assert.equal(h.events.some(([name]) => name === 'success'), !switchSource);
	}
});

test('a checkpoint loaded after the editor changes cannot allocate a revision or write old data', async () => {
	for (const invalidate of ['new edit', 'source switch', 'close']) {
		let open = true;
		const waiting = deferred();
		const h = createSession({
			saveDraft: async () => {},
			flush: async () => {},
			getCheckpointCandidate: () => waiting.promise,
			restoreCheckpoint() { assert.fail('stale checkpoint must not write'); },
		});
		h.refs.activeSessionDraftKeyRef.current = sourceA.draftKey;
		h.refs.latestSessionRecordRef.current = sourceA;
		const restore = checkpoints(h, {
			apply() { assert.fail('stale checkpoint must not apply'); },
			isEditorOpen: () => open,
		}).restoreHistoryCheckpoint('checkpoint');
		await settle();
		if (invalidate === 'new edit') {
			h.actions.claimSessionForLocalEditing();
		} else if (invalidate === 'source switch') {
			h.actions.beginDraftSourceChange();
			h.refs.activeSessionDraftKeyRef.current = 'B';
		} else {
			open = false;
		}
		const revision = h.refs.sessionClientRevisionRef.current;
		waiting.resolve({ draftKey: 'A', draft: {} });
		await restore;
		assert.equal(h.refs.sessionClientRevisionRef.current, revision);
		assert.equal(h.events.some(([event]) => event === 'success' || event === 'error'), false);
	}
});

for (const interruptedBy of ['candidate read', 'queued write']) {
	test(`closing retires a checkpoint restore during the ${interruptedBy}, including a failed close`, async () => {
		const lifetime = createSyncCreatorEditorLifetime(() => true);
		const candidateReady = deferred(), writeReady = deferred(), closeSave = deferred();
		const applied = [], writes = [];
		const h = createSession({
			saveDraft: async () => {}, flush: async () => {},
			async getCheckpointCandidate(draftKey, historyCursorId) {
				const candidate = { draftKey, historyCursorId, draft: {} };
				if (interruptedBy === 'candidate read') await candidateReady.promise;
				return candidate;
			},
			async restoreCheckpoint(draftKey, historyCursorId, draft, revision, { isCurrent }) {
				if (interruptedBy === 'queued write') await writeReady.promise;
				if (!isCurrent()) return null;
				const record = { draftKey, historyCursorId, draft, clientRevision: revision };
				writes.push(record);
				return record;
			},
		});
		h.refs.activeSessionDraftKeyRef.current = 'A';
		const api = checkpoints(h, { lifetime, apply(record, { validateOnly } = {}) {
			if (!validateOnly) applied.push(record.historyCursorId);
			return record;
		} });
		const pending = api.restoreHistoryCheckpoint('previous');
		await settle();
		const closing = lifetime.requestClose({
			stopRecording: noop, saveDraft: () => closeSave.promise,
			onSaveError: noop, onClosed: () => assert.fail('failed save must leave the editor open'),
		});
		const requestedWhileClosing = api.restoreHistoryCheckpoint('new while closing');
		closeSave.resolve(false);
		await closing;
		candidateReady.resolve();
		writeReady.resolve();
		await Promise.all([pending, requestedWhileClosing]);
		assert.deepEqual(writes, []);
		assert.deepEqual(applied, []);
		assert.equal(h.attrs.isRestoringCheckpoint, false);

		await api.restoreHistoryCheckpoint('retry');
		assert.deepEqual(writes.map(record => record.historyCursorId), ['retry']);
		assert.deepEqual(applied, ['retry']);
	});
}

test('a checkpoint already accepted by storage can finish during a close save', async () => {
	const lifetime = createSyncCreatorEditorLifetime(() => true);
	const commitStarted = deferred(), commitFinished = deferred(), closeSave = deferred();
	const applied = [];
	const h = createSession({
		flush: async () => {},
		getCheckpointCandidate: async (draftKey, historyCursorId) => ({ draftKey, historyCursorId, draft: {} }),
		async restoreCheckpoint(draftKey, historyCursorId, draft, clientRevision, { isCurrent }) {
			assert.equal(isCurrent(), true);
			commitStarted.resolve();
			await commitFinished.promise;
			return { draftKey, historyCursorId, draft, clientRevision };
		},
	});
	h.refs.activeSessionDraftKeyRef.current = 'A';
	const api = checkpoints(h, { lifetime, apply(record, { validateOnly } = {}) {
		if (!validateOnly) applied.push(record.historyCursorId);
		return record;
	} });
	const restore = api.restoreHistoryCheckpoint('committed');
	await commitStarted.promise;
	const closing = lifetime.requestClose({
		stopRecording: noop, saveDraft: () => closeSave.promise,
		onSaveError: noop, onClosed: () => assert.fail('failed save must leave the editor open'),
	});
	commitFinished.resolve();
	await restore;
	assert.deepEqual(applied, ['committed']);
	assert.equal(h.attrs.isRestoringCheckpoint, false);
	closeSave.resolve(false);
	await closing;
});

test('a late automatic restore does not replace local edits or their ready draft', async () => {
	const waiting = deferred();
	const h = createSession({ getDraftsForTrack: () => waiting.promise });
	const effects = [];
	const applied = [];
	const windowEvents = new EventTarget();
	const documentEvents = new EventTarget();
	useSyncCreatorSessionPersistence({
		react: { useCallback: fn => fn, useEffect: fn => effects.push(fn), useLayoutEffect: fn => effects.push(fn) },
		syncCreatorDraftStore: h.store,
		source: { sessionTrackKey: 'track', activeSessionDraftKey: 'A', lyricsText: 'First lyric' },
		state: { sessionHydrationComplete: false, sessionReadyDraftKey: '', isSessionAutosaveEnabled: true },
		refs: h.refs, ui: h.ui,
		host: { windowEvents, documentEvents, scheduleTimer: () => 1, cancelTimer: h.cancelTimer },
		buildSyncCreatorSessionRecord: () => sourceA,
		applySyncCreatorSessionRecord: (record, options) => { applied.push([record, options]); return record; },
		...h.actions,
	});
	const cleanup = effects.map(effect => effect());
	assert.equal(h.attrs.sessionHydrationComplete, false);
	h.refs.activeSessionDraftKeyRef.current = 'A';
	h.actions.claimSessionForLocalEditing();
	assert.equal(h.attrs.sessionReadyDraftKey, 'A');
	assert.equal(h.attrs.sessionHydrationComplete, true);
	waiting.resolve([sourceA]);
	await settle();
	assert.deepEqual(applied, []);
	assert.equal(h.attrs.sessionReadyDraftKey, 'A');
	cleanup.forEach(clean => clean?.());
});

test('import adopts its own draft key and closing saves only that ready draft', async () => {
	const writes = [];
	const h = createSession({
		saveDraft: async record => { writes.push(record.draftKey); },
		flush: async () => { writes.push('flush'); },
	});
	h.refs.activeSessionDraftKeyRef.current = sourceA.draftKey;
	h.refs.latestSessionRecordRef.current = sourceA;
	h.refs.sessionAutosaveTimerRef.current = { id: 2 };
	h.actions.beginDraftImport();
	h.actions.adoptImportedDraftKey('B');
	h.actions.markDraftDirty();
	assert.equal(h.refs.sessionSourceChangeRequestRef.current, 0);
	assert.equal(h.refs.sessionRecoveryRequestRef.current, 1);
	assert.equal(h.refs.sessionAutosaveTimerRef.current, null);
	assert.equal(h.attrs.sessionSaveState, 'dirty');
	assert.equal(h.attrs.sessionReadyDraftKey, 'B');
	assert.equal(h.refs.sessionSkipRecoveryDraftKeyRef.current, 'B');
	assert.equal(h.refs.latestSessionRecordRef.current, null);

	h.refs.activeSessionDraftKeyRef.current = 'B';
	h.refs.latestSessionRecordRef.current = sourceA;
	await h.actions.flushDraftBeforeClose();
	assert.deepEqual(writes, []);
	h.refs.latestSessionRecordRef.current = { ...sourceA, draftKey: 'B' };
	await h.actions.flushDraftBeforeClose();
	assert.deepEqual(writes, ['B', 'flush']);
	assert.equal(h.refs.latestSessionRecordRef.current, null);
});

test('a positional file import with a different draft key saves the departing edit before replacing it', async () => {
	const saved = [];
	const latestEdit = { ...sourceA, clientRevision: 11, draft: { lines: ['last edit'] } };
	const h = createSession({
		createDraftKey({ lrclibId }) { return lrclibId === 22 ? 'B' : 'A'; },
		async saveDraft(record, options) { saved.push([record, options.baselineSnapshot]); },
		async flush() {},
	});
	h.refs.activeSessionDraftKeyRef.current = 'A';
	h.refs.latestSessionRecordRef.current = sourceA;
	h.refs.sessionBaselineDraftRef.current = { draftKey: 'A', snapshot: sourceA.draft };
	h.refs.sessionPendingSnapshotRef.current = { draftKey: 'A', buildRecord: () => latestEdit };
	const imported = { lines: [{ start: 1, end: 2 }], source: { provider: 'lrclib', lrclibId: 22 } };
	let applied;
	applySyncCreatorImportedSession(imported, { provider: 'lrclib', addonId: 'lrclib' }, {
		draft: { ...h.actions, syncCreatorDraftStore: h.store, sessionTrackKey: 'track', activeSessionDraftKey: 'A' },
		layout: new Proxy({}, { get: () => noop }),
		editor: { resetCurrentSyncInput: noop, setSyncData: value => { applied = value; }, setSelectedLrclibSourceValue: noop },
	});
	assert.deepEqual(saved, [[latestEdit, sourceA.draft]]);
	assert.equal(applied, imported);
	assert.equal(h.attrs.sessionReadyDraftKey, 'B');

	h.refs.activeSessionDraftKeyRef.current = 'B';
	const next = { draftKey: 'B', clientRevision: 12, draft: { syncData: imported } };
	h.refs.sessionPendingSnapshotRef.current = { draftKey: 'B', buildRecord: () => next };
	assert.equal(await h.actions.flushDraftBeforeClose(), true);
	assert.deepEqual(saved, [[latestEdit, sourceA.draft], [next, undefined]]);
});

test('closing materializes the latest committed editor state without waiting for its autosave timer', async () => {
	const writes = [];
	const h = createSession({
		saveDraft: async record => writes.push(record),
		flush: async () => writes.push('flush'),
	});
	const lastEdit = { ...sourceA, clientRevision: 42 };
	h.refs.activeSessionDraftKeyRef.current = sourceA.draftKey;
	h.refs.latestSessionRecordRef.current = sourceA;
	h.refs.sessionPendingSnapshotRef.current = { draftKey: lastEdit.draftKey, buildRecord: () => lastEdit };
	h.refs.sessionAutosaveTimerRef.current = { id: 7 };
	assert.equal(await h.actions.flushDraftBeforeClose(), true);
	assert.deepEqual(writes, [lastEdit, 'flush']);
	assert.equal(h.refs.sessionPendingSnapshotRef.current, null);
	assert.equal(h.refs.latestSessionRecordRef.current, null);
	assert.equal(h.refs.sessionAutosaveTimerRef.current, null);
});

test('closing waits for an edit committed while the first draft write is pending', async () => {
	const firstWrite = deferred();
	const writes = [];
	const h = createSession({
		async saveDraft(record) {
			writes.push(record);
			if (record === sourceA) await firstWrite.promise;
		},
		flush: async () => {},
	});
	h.refs.activeSessionDraftKeyRef.current = sourceA.draftKey;
	h.refs.latestSessionRecordRef.current = sourceA;
	const closing = h.actions.flushDraftBeforeClose();
	assert.deepEqual(writes, [sourceA]);

	const lastEdit = { ...sourceA, clientRevision: 42 };
	h.refs.sessionPendingSnapshotRef.current = { draftKey: lastEdit.draftKey, buildRecord: () => lastEdit };
	h.refs.sessionAutosaveTimerRef.current = { id: 12 };
	firstWrite.resolve();

	assert.equal(await closing, true);
	assert.deepEqual(writes, [sourceA, lastEdit]);
	assert.equal(h.refs.latestSessionRecordRef.current, null);
	assert.equal(h.refs.sessionPendingSnapshotRef.current, null);
	assert.ok(h.events.some(([event, id]) => event === 'cancel' && id === 12));
});

test('a failed close save retains the draft and a retry writes the same revision', async () => {
	const warnings = [];
	const writes = [];
	const h = createSession({
		async saveDraft(record) {
			writes.push(record);
			if (writes.length === 1) throw new Error('IndexedDB temporarily unavailable');
		},
		flush: async () => {},
	}, { warn: (...args) => warnings.push(args) });
	h.refs.activeSessionDraftKeyRef.current = sourceA.draftKey;
	h.refs.latestSessionRecordRef.current = sourceA;

	assert.equal(await h.actions.flushDraftBeforeClose(), false);
	assert.equal(h.attrs.sessionSaveState, 'error');
	assert.equal(h.refs.latestSessionRecordRef.current, sourceA);
	assert.equal(warnings.length, 1);
	assert.equal(await h.actions.flushDraftBeforeClose(), true);
	assert.deepEqual(writes, [sourceA, sourceA]);
	assert.equal(h.refs.latestSessionRecordRef.current, null);
});

test('a queued close save cannot write after its draft was reset', async () => {
	const writeLock = deferred();
	const writes = [];
	const h = createSession({
		async saveDraft(record, { isCurrent }) {
			await writeLock.promise;
			if (isCurrent()) writes.push(record);
		},
		flush: async () => {},
		deleteDraft: async () => {},
	});
	h.refs.activeSessionDraftKeyRef.current = sourceA.draftKey;
	h.refs.latestSessionRecordRef.current = sourceA;
	const closing = h.actions.flushDraftBeforeClose();
	await h.actions.deleteActiveSyncCreatorDraft();
	writeLock.resolve();
	assert.equal(await closing, true);
	assert.deepEqual(writes, []);
});
