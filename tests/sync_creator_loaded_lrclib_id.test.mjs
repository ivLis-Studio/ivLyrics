import { setUpSyncCreatorLrclibActions } from "./fixtures/sync-creator-lrclib.mjs";
import assert from 'node:assert/strict';
import test from 'node:test';

const TRACK_URI = 'spotify:track:fixture';

const createHarness = ({ snapshot = null, typedId = false, trackIsrc = '' } = {}) => {
	const calls = [];
	const applied = [];
	const providerInfo = [];
	const syncReads = [];
	const context = {
		console,
		I18n: { t: key => key },
		useCallback: fn => fn,
		SYNC_CREATOR_SOURCE_ADDON_ID: 'lrclib',
		Spicetify: { Player: { data: { item: { uri: TRACK_URI, duration: { milliseconds: 180000 } } } } },
		trackInfo: { uri: TRACK_URI, artists: [{ name: 'Artist' }], album: { name: 'Album' } },
		trackUri: TRACK_URI,
		trackIsrc,
		trackName: 'Title',
		artistName: 'Artist',
		albumName: 'Album',
		lrclibIdInputEditedRef: { current: typedId },
		window: {
			LyricsService: { getLyricsSnapshot: uri => (uri === TRACK_URI ? snapshot : null) },
			SyncDataService: { getSyncData: async (...args) => { syncReads.push(args); return null; } },
			LyricsAddonManager: { getLyricsFrom: (_id, info) => context.loadLrclib(info) }
		},
		loadLrclib: async info => {
			providerInfo.push(info);
			return { provider: 'lrclib', lrclibId: '222', synced: [{ startTime: 0, text: 'line' }] };
		},
		beginSyncCreatorSourceChange: () => 1,
		isCurrentSyncCreatorSourceChange: () => true,
		clearLrclibCandidateState() {}, resetSyncCreatorLyricsLoadingState() {},
		applyLoadedLyricsResult: async result => {
			applied.push(result);
			// The real callback mirrors the loaded entry's id unless an id was typed.
			if (!context.lrclibIdInputEditedRef.current && result.lrclibId) context.setLrclibIdInput(String(result.lrclibId));
			return true;
		}
	};
	context.loadCreatorLyrics = setUpSyncCreatorLrclibActions(context, (name, value) => calls.push([name, value])).loadLyrics;
	return {
		context,
		calls,
		applied,
		providerInfo,
		syncReads,
		boxValues: () => calls.filter(([name]) => name === 'setLrclibIdInput').map(([, value]) => value)
	};
};

const officialSnapshot = {
	provider: 'lrclib',
	rawResult: { provider: 'lrclib', lrclibSource: { provider: 'lrclib', lrclibId: '5206921' } }
};

test('the editor suggests the LRCLIB id of the lyrics the app is showing', async () => {
	const h = createHarness({ snapshot: officialSnapshot });
	await h.context.loadCreatorLyrics();
	assert.equal(h.applied.length, 1);
	// The metadata search still picks its own entry, but the box ends on the
	// id of the lyrics the app is currently showing.
	assert.deepEqual(h.boxValues(), ['222', '5206921']);
});

test('the suggestion uses the plain LRCLIB id when the loaded lyrics carry no source', async () => {
	const h = createHarness({
		snapshot: { provider: 'lrclib', rawResult: { provider: 'lrclib', lrclibId: '5206921' } }
	});
	await h.context.loadCreatorLyrics();
	assert.deepEqual(h.boxValues(), ['222', '5206921']);
});

test('a typed LRCLIB id is never replaced by the mirror or the suggestion', async () => {
	const h = createHarness({ typedId: true, snapshot: officialSnapshot });
	await h.context.loadCreatorLyrics();
	assert.equal(h.applied.length, 1);
	assert.deepEqual(h.boxValues(), [], 'the box keeps what the user typed');
});

test('lyrics that do not come from the official LRCLIB API never suggest an id', async () => {
	const h = createHarness({ snapshot: { provider: 'spotify', rawResult: { provider: 'spotify' } } });
	await h.context.loadCreatorLyrics();
	assert.deepEqual(h.boxValues(), ['222']);
});

test('local LRCLIB lyrics without an official id never suggest an id', async () => {
	const h = createHarness({ snapshot: { provider: 'lrclib', rawResult: { provider: 'lrclib', lrclibSource: null } } });
	await h.context.loadCreatorLyrics();
	assert.deepEqual(h.boxValues(), ['222']);
});

test('loading stays on the addon search: no editor-side pre-load and no previous entry forwarded', async () => {
	const h = createHarness({ snapshot: officialSnapshot, trackIsrc: 'USRC17607839' });
	await h.context.loadCreatorLyrics();
	assert.equal(h.syncReads.length, 0, 'the addon restores a published sync source itself');
	assert.equal(h.providerInfo.length, 1);
	const [info] = h.providerInfo;
	assert.equal(info.lrclibOfficialOnly, true);
	assert.equal(info.lrclibId, undefined, 'the ID box never steers the metadata search');
	assert.equal(info.lrclibSource, undefined, 'a reload never pins the previously loaded entry');
	assert.equal(info.isrc, 'USRC17607839', 'the addon resolves the same published sync as the editor');
});

test('metadata lookup failure opens a saved draft and keeps its LRCLIB ID', async () => {
	const h = createHarness({ snapshot: officialSnapshot });
	h.context.console = { error() {} };
	h.context.loadLrclib = async () => { throw new Error('fixture offline'); };
	let fallbackCalls = 0;
	h.context.captureOfflineDraftRecovery = requestId => async () => {
		assert.equal(requestId, 1);
		fallbackCalls++;
		h.context.setLrclibIdInput('233');
		h.context.setIsLoading(false);
		return { draftKey: 'draft' };
	};
	const { loadLyrics } = setUpSyncCreatorLrclibActions(h.context, (name, value) => h.calls.push([name, value]));
	await loadLyrics();
	assert.equal(fallbackCalls, 1);
	assert.deepEqual(h.boxValues(), ['233']);
	assert.equal(h.calls.some(([name]) => name === 'setError'), false);
});
