import assert from 'node:assert/strict';
import test from 'node:test';
import {
	clearSyncCreatorPublishedCaches, createSyncCreatorPublicationActions, createSyncCreatorPublicationRunner, revertSyncCreatorEdits, submitSyncCreatorEdits,
} from '#ivlyrics/features/sync/syncCreatorPublication.mjs';
import { createSyncCreatorEditorLifetime } from '#ivlyrics/features/sync/syncCreatorEditorLifetime.mjs';
import { finishSyncCreatorPublication, restoreSyncCreatorPublishedSession } from '#ivlyrics/features/sync/syncCreatorSessionReplacement.mjs';
import { createSyncDataSubmission } from '#ivlyrics/lyrics/createSyncDataSubmission.mjs';
import { sendSyncCreatorSubmission } from '#ivlyrics/features/sync/syncCreatorSubmissionTransport.mjs';

function deferred() {
	let resolve;
	const promise = new Promise(done => { resolve = done; });
	return { promise, resolve };
}

const track = {
	id: 'track-id', isrc: 'GBARL1901205', provider: 'spotify', getProvider: () => 'spotify',
	title: 'Song', artist: 'Artist', album: 'Album', durationMs: 10_000,
};
const syncData = { version: 5, lines: [{ start: 0, end: 0, chars: [1] }] };

function submitOptions(dialog, transport, isDraftCurrent) {
	return {
		canEdit: true,
		track: { ...track, isrc: '' }, syncData, lyrics: { lines: ['A'], offsets: [0], chars: ['A'] },
		vocals: {
			multiVocalMode: false,
			coverage: { isLineCovered: () => false },
			metadata: { resolveSpeakerMeta: () => ({}), normalizeKind: () => '', defaultKind: 'vocal' },
		},
		timing: { materialize: data => data, attachSource: data => data, validate() {}, compact: data => data },
		transport, dialog, isDraftCurrent,
		onPublished: () => assert.fail('the stale draft must not be marked published'),
	};
}

test('publish and revert share one in-flight action, including the ISRC lookup', async () => {
	const pending = deferred();
	let isEditorOpen = true;
	let generation = 1;
	const run = createSyncCreatorPublicationRunner({
		isEditorOpen: () => isEditorOpen,
		captureDraftOwnership() {
			const initial = generation;
			return () => generation === initial;
		},
	});
	const observations = [];
	const submit = run(async current => {
		observations.push(current());
		await pending.promise;
		observations.push(current());
	});
	await run(() => assert.fail('a second action must wait for the first'));
	generation++;
	pending.resolve();
	await submit;
	await run(current => observations.push(current()));
	isEditorOpen = false;
	await run(() => assert.fail('a detached editor cannot submit'));
	assert.deepEqual(observations, [true, false, true]);
});

test('source changes during ISRC lookup prevent score work and publication', async () => {
	const lookup = deferred();
	const busy = [];
	let current = true;
	const submit = submitSyncCreatorEdits(submitOptions({
		setBusy: value => busy.push(value), translate: key => key,
		toast: { error: () => assert.fail('a superseded submission cannot show a lookup error') },
	}, {
		getSyncService: () => ({ resolveTrackIsrc: () => lookup.promise }),
		saveWork: () => assert.fail('a different source cannot supply submission work'),
		requireAuth: () => assert.fail('a superseded lookup cannot proceed to authentication'),
	}, () => current));
	assert.deepEqual(busy, [true]);
	current = false;
	lookup.resolve(track.isrc);
	await submit;
	assert.deepEqual(busy, [true, false]);
});

test('starting to close during submit cancels the old work even when saving the draft fails', async () => {
	const attached = createSyncCreatorEditorLifetime(() => true);
	const runPublication = createSyncCreatorPublicationRunner({
		isEditorOpen: attached.canStartOperation,
		captureDraftOwnership: () => attached.captureOperation(() => true),
	});
	const auth = deferred(), entered = deferred(), save = deferred();
	const calls = [];
	const options = submitOptions({
		translate: key => key,
		toast: { success: () => calls.push('published'), error: message => assert.fail(message) },
	}, {
		requireAuth: () => { entered.resolve(); return auth.promise; },
		saveWork: () => { calls.push('work'); return {}; },
		getSyncService: () => ({ submitSyncData() { calls.push('post'); return true; } }),
	});
	const actions = createSyncCreatorPublicationActions({
		...options, track, runPublication, isEditorOpen: attached.isOpen, hasHeldInput: () => false,
		draft: { deleteActiveSyncCreatorDraft: () => true, captureSourceOwnership: () => () => true },
		published: { updateBaseline() {} },
		editor: { setHasUnsubmittedSync() {}, onClose: () => calls.push('published and closed') },
		clearPublishedCaches: () => calls.push('cache'),
		dialog: { ...options.dialog, setSubmitting() {} },
	});
	const oldSubmit = actions.submit();
	await entered.promise;
	const close = attached.requestClose({
		stopRecording: () => calls.push('stop'), saveDraft: () => save.promise,
		onSaveError: () => calls.push('save failed'), onClosed: () => assert.fail('must keep the draft open'),
	});
	assert.equal(attached.isOpen(), true);
	assert.equal(attached.canStartOperation(), false);
	await actions.submit();
	save.resolve(false);
	await close;
	auth.resolve();
	await oldSubmit;
	assert.deepEqual(calls, ['stop', 'save failed']);

	await actions.submit();
	assert.deepEqual(calls, ['stop', 'save failed', 'work', 'post', 'published', 'cache', 'published and closed']);
});

test('publication cannot start or continue while a sync input is held', async () => {
	const lookup = deferred();
	const ready = deferred();
	let recording = true;
	const run = createSyncCreatorPublicationRunner({
		isEditorOpen: () => true,
		captureDraftOwnership: () => () => true,
	});
	const canContinue = () => !recording;
	const submit = () => run(isCurrent => submitSyncCreatorEdits(submitOptions({
		setBusy() {}, translate: key => key, toast: {},
	}, {
		getSyncService: () => ({ resolveTrackIsrc() { ready.resolve(); return lookup.promise; } }),
		requireAuth: () => assert.fail('recording timings are still in progress'),
	}, isCurrent)), canContinue);
	await submit();
	recording = false;
	const publishing = submit();
	await ready.promise;
	recording = true;
	lookup.resolve(track.isrc);
	await publishing;
});

for (const step of ['materialize', 'compact']) {
	test(`a ${step} error is shown without starting a request or locking the editor`, async t => {
		t.mock.method(console, 'error', () => {});
		const errors = [];
		const options = submitOptions({
			setBusy: () => assert.fail('invalid sync data must not lock the editor'),
			translate: key => key, toast: { error: message => errors.push(message) },
		}, { getSyncService: () => assert.fail('invalid sync data must not be sent') }, () => true);
		options.timing[step] = () => { throw new Error('Invalid lyric timing'); };
		await submitSyncCreatorEdits(options);
		assert.deepEqual(errors, ['Invalid lyric timing']);
	});
}

test('several timing entries on one source row do not cover a later unrecorded row', async () => {
	const dialogs = [];
	const options = submitOptions({
		confirm: message => { dialogs.push(message); return false; },
		setBusy: () => assert.fail('declining incomplete submission must not lock the editor'),
		translate: key => key,
	}, { getSyncService: () => assert.fail('declined submission must stop before transport') }, () => true);
	options.lyrics = { lines: ['AB', 'C'], offsets: [0, 2], chars: ['A', 'B', 'C'] };
	options.syncData = { version: 5, lines: [{ start: 0, end: 0, chars: [1] }, { start: 1, end: 1, chars: [2] }] };
	await submitSyncCreatorEdits(options);
	assert.deepEqual(dialogs, ['syncCreator.incompleteConfirm']);
});

for (const multiVocalMode of [true, false]) {
	test(`a materialized vocal with no timing blocks submission with multi-vocal mode ${multiVocalMode}`, async () => {
		const errors = [];
		const options = submitOptions({
			setBusy: () => assert.fail('an unrecorded vocal cannot enter the submission pipeline'),
			translate: key => key, toast: { error: message => errors.push(message) },
		}, { getSyncService: () => assert.fail('an unrecorded vocal must not be submitted') }, () => true);
		options.vocals.multiVocalMode = multiVocalMode;
		options.vocals.metadata.sanitizeParallel = value => value;
		Object.assign(options.vocals.coverage, {
			getMergedLineIndexes: () => [0], getParallelTemplate: () => null,
			getLineSpeaker: () => ({}), isSpeakerComplete: () => true,
		});
		options.timing.materialize = data => ({ ...data, lines: [{ ...data.lines[0], parallel: { parts: [
			{ id: 'lead', ranges: [{ start: 0, end: 0 }], chars: [1] },
			{ id: 'background', ranges: [{ start: 0, end: 0 }] },
		] } }] });
		await submitSyncCreatorEdits(options);
		assert.deepEqual(errors, ['syncCreator.lineAllPartsMissingSync']);
	});
}

test('the submitted provider is the same provider used to validate the snapshot', async () => {
	const errors = [];
	const options = submitOptions({
		setBusy: () => assert.fail('a missing LRCLIB source must stop submission'),
		translate: key => key, toast: { error: message => errors.push(message) },
	}, {}, () => true);
	options.track.provider = 'lrclib';
	await submitSyncCreatorEdits(options);
	assert.deepEqual(errors, ['syncCreator.lrclibIdInvalid']);
});

for (const changesDuringPost of [false, true]) {
	test(`a successful POST refreshes the published song ${changesDuringPost ? 'after the editor moves on' : 'even if local cleanup fails'}`, async t => {
		t.mock.method(console, 'warn', () => {});
		const postStarted = deferred();
		const post = deferred();
		const observed = [];
		let current = true;
		const service = {
			submitSyncData(id, provider) {
				observed.push(['post', id, provider]);
				postStarted.resolve();
				return post.promise;
			},
		};
		const options = submitOptions({
			setBusy() {}, translate: key => key,
			toast: {
				success: message => observed.push(['success', message]),
				error: () => assert.fail('the successful POST cannot become a submission error'),
			},
		}, {
			requireAuth: async () => {}, saveWork: async () => ({}), getSyncService: () => service,
		}, () => current);
		options.track.isrc = track.isrc;
		options.onPublished = (isrc, _data, provider) => {
			observed.push(['refresh', isrc, provider]);
			throw new Error('Fixture: local cache unavailable');
		};
		const request = submitSyncCreatorEdits(options);
		await postStarted.promise;
		current = !changesDuringPost;
		post.resolve(true);
		await request;
		assert.deepEqual(observed, [
			['post', track.id, track.provider],
			...(changesDuringPost ? [] : [['success', 'syncCreator.submitSuccess']]),
			['refresh', track.isrc, track.provider],
		]);
	});
}

test('publication still invalidates lyrics after a sync cache error and signals the matching track', async () => {
	const observed = [];
	const trackUri = `spotify:track:${track.id}`;
	await clearSyncCreatorPublishedCaches(track.isrc.toLowerCase(), {
		trackId: track.id, trackUri, provider: track.provider,
		readSyncCreatorSyncService: () => ({
			clearCache(isrc, options) {
				assert.equal(isrc, track.isrc);
				assert.deepEqual(options, { isrc });
				throw new Error('Fixture: sync cache unavailable');
			},
		}),
		getLyricsService: () => ({
			clearLyricsSnapshot: uri => observed.push(['snapshot', uri]),
			clearTrackCache: async id => { observed.push(['disk', id]); },
		}),
		invalidatePageCache: uri => observed.push(['page', uri]),
		dispatchSyncDataUpdated: detail => observed.push(['updated', detail]),
		warn: () => observed.push(['warning']),
	});
	assert.deepEqual(observed, [
		['warning'], ['snapshot', trackUri], ['disk', track.id], ['page', trackUri],
		['updated', { isrc: track.isrc, trackId: track.id, trackUri, provider: track.provider }],
	]);
});

test('publication clears the persistent cache and notifies listeners after independent cache failures', async () => {
	const observed = [];
	const trackUri = `spotify:track:${track.id}`;
	await clearSyncCreatorPublishedCaches(track.isrc, {
		trackId: track.id, trackUri,
		readSyncCreatorSyncService: () => ({
			clearCache: async () => { throw new Error('sync'); },
		}),
		getLyricsService: () => ({
			clearLyricsSnapshot: () => { throw new Error('snapshot'); },
			clearTrackCache: async id => { observed.push(['disk', id]); },
		}),
		invalidatePageCache: () => { throw new Error('page'); },
		dispatchSyncDataUpdated: detail => observed.push(['updated', detail.trackUri]),
		warn: (_message, error) => observed.push(['warning', error.message]),
	});
	assert.deepEqual(observed, [
		['warning', 'sync'], ['warning', 'snapshot'], ['disk', track.id],
		['warning', 'page'], ['updated', trackUri],
	]);
});

for (const phase of ['authentication', 'work snapshot']) {
	test(`publication stops before POST if the source changes during ${phase}`, async () => {
		const paused = deferred();
		const entered = deferred();
		const calls = [];
		let current = true;
		const submit = sendSyncCreatorSubmission({
			syncData, trackId: track.id, provider: track.provider, isrc: track.isrc,
			async requireAuth() {
				calls.push('authenticate');
				if (phase === 'authentication') { entered.resolve(); await paused.promise; }
			},
			async saveWork() {
				calls.push('work');
				if (phase === 'work snapshot') { entered.resolve(); await paused.promise; }
			},
			getSyncService: () => assert.fail('a superseded draft cannot call the submit service'),
			isDraftCurrent: () => current,
		});
		await entered.promise;
		current = false;
		paused.resolve();
		assert.deepEqual(await submit, { cancelled: true });
		assert.deepEqual(calls, phase === 'authentication' ? ['authenticate'] : ['authenticate', 'work']);
	});
}

test('the sync service checks editor ownership after its own asynchronous preparation', async () => {
	const profile = deferred();
	const entered = deferred();
	let current = true;
	const submit = createSyncDataSubmission({
		getCodec: () => ({ encode: data => data }),
		resolveSyncDataIdentity: async () => ({ trackId: track.id, isrc: track.isrc }),
		getUserHash: () => 'fixture',
		getAuthUtils: () => ({
			getAuthToken: () => 'fixture-token',
			requireDiscordAuth: () => assert.fail('the stale source should stop after reading the player profile'),
		}),
		getSyncDataTrackMetadata: () => track,
		getCurrentSpotifyProfile() { entered.resolve(); return profile.promise; },
		request: () => assert.fail('the stale source should not produce a POST'),
	});
	const result = submit(track.id, track.provider, syncData, {}, { isDraftCurrent: () => current });
	await entered.promise;
	current = false;
	profile.resolve(null);
	assert.equal(await result, null);
});

test('a published response still clears its track cache without touching a replacement editor', async () => {
	for (const change of ['replaced before response', 'during cache cleanup', 'during deletion', 'closed during deletion', 'source changed during deletion']) {
		const calls = [];
		const pending = deferred();
		const deleting = deferred();
		let current = true;
		let open = true;
		let currentSource = change !== 'replaced before response';
		const result = finishSyncCreatorPublication(track.isrc, syncData, {
			async clearPublishedCaches(isrc) {
				calls.push(['cache', isrc]);
				if (change === 'during cache cleanup') await pending.promise;
			},
			isDraftCurrent: () => current,
			isEditorOpen: () => open,
			isSourceCurrent: () => currentSource,
			updatePublishedBaseline: data => calls.push(['baseline', data]),
			draft: {
				async deleteActiveSyncCreatorDraft() {
					calls.push(['delete']);
					deleting.resolve();
					return pending.promise;
				},
			},
			editor: new Proxy({}, { get() { assert.fail('the old result must not update the editor'); } }),
		});
		if (change === 'during cache cleanup') current = false;
		if (change.endsWith('during deletion')) await deleting.promise;
		if (change === 'closed during deletion') open = false;
		if (change === 'source changed during deletion') currentSource = false;
		pending.resolve(change !== 'during deletion');
		await result;
		assert.deepEqual(calls, [
			...(change === 'replaced before response' ? [] : [['baseline', syncData]]),
			['cache', track.isrc],
			...(change.endsWith('during deletion') ? [['delete']] : []),
		]);
	}
});

test('an acknowledged submission becomes the revert baseline while newer edits are kept', async () => {
	const pending = deferred();
	const calls = [];
	const local = { version: 5, lines: [{ start: 0, end: 0, chars: [3] }] };
	let baseline = { version: 5, lines: [{ start: 0, end: 0, chars: [1] }] };
	let currentDraft = true;
	const posted = { version: 5, lines: [{ start: 0, end: 0, chars: [2] }] };
	const result = finishSyncCreatorPublication(track.isrc, posted, {
		async clearPublishedCaches(isrc) { calls.push(['cache', isrc]); await pending.promise; },
		isDraftCurrent: () => currentDraft,
		isEditorOpen: () => true,
		isSourceCurrent: () => true,
		updatePublishedBaseline(data) { baseline = data; calls.push(['baseline', data]); },
		draft: { deleteActiveSyncCreatorDraft: () => assert.fail('must keep the newer edits') },
		editor: new Proxy({}, { get() { assert.fail('the result must not reset newer edits'); } }),
	});
	currentDraft = false;
	pending.resolve();
	await result;
	assert.equal(baseline, posted);
	assert.deepEqual(local.lines[0].chars, [3]);
	assert.deepEqual(calls, [['baseline', posted], ['cache', track.isrc]]);
});

test('a revert fetched for a previous source cannot read the new baseline or replace the editor', async () => {
	const lookup = deferred();
	const busy = [];
	let current = true;
	const result = revertSyncCreatorEdits({
		track, canEdit: true, recording: () => false, lyricsText: 'A',
		readBaseline: () => assert.fail('the captured source no longer owns the live baseline'),
		getSyncService: () => ({ getSyncData: () => lookup.promise }),
		isDraftCurrent: () => current,
		dialog: {
			setBusy: value => busy.push(value), translate: key => key,
			toast: new Proxy({}, { get() { assert.fail('the old request must not report a result for the new source'); } }),
		},
		onReverted: () => assert.fail('the old result must not replace the editor'),
	});
	assert.deepEqual(busy, [true]);
	current = false;
	lookup.resolve({ syncData });
	await result;
	assert.deepEqual(busy, [true, false]);
});

test('an earlier revert cannot install timings after the user edits during draft removal', async () => {
	const removal = deferred();
	const result = restoreSyncCreatorPublishedSession(syncData, {
		draft: { deleteActiveSyncCreatorDraft: () => removal.promise },
		isEditorOpen: () => true,
		editor: new Proxy({}, { get() { assert.fail('the old result must not overwrite newer edits'); } }),
	});
	removal.resolve(false);
	assert.equal(await result, false);
});
