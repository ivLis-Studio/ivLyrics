import assert from 'node:assert/strict';
import test from 'node:test';
import { trackIdentity } from '#ivlyrics/core/trackIdentity.mjs';
import { captureSyncCreatorTrackInfo, resolveSyncCreatorTrack } from '#ivlyrics/features/sync/syncCreatorTrack.mjs';
import { useSyncCreatorVisibility } from '#ivlyrics/features/sync/syncCreatorVisibility.mjs';
import { setUpSyncCreatorLrclibActions } from './fixtures/sync-creator-lrclib.mjs';

const originalUri = 'spotify:track:AAAAAAAAAAAAAAAAAAAAAA';
const originalSong = {
    uri: originalUri, name: 'Original song', artists: [{ name: 'Original artist' }, { name: 'Guest artist' }],
    album: { name: 'Original album', images: [{ url: 'original-cover' }] },
    metadata: { isrc: 'USAAA2600001' }, duration: { milliseconds: 180_000 },
};
const nextSong = {
    uri: 'spotify:track:BBBBBBBBBBBBBBBBBBBBBB', name: 'Next song',
    artists: [{ name: 'Next artist' }], album: { name: 'Next album', images: [{ url: 'next-cover' }] },
    metadata: { isrc: 'USAAA2600002' }, duration: { milliseconds: 70_000 },
};

test('the editor resolves the opened song even after playback moves to another track', () => {
    let playerReads = 0;
    const track = resolveSyncCreatorTrack({ uri: originalUri }, {
        getPlayerItem: () => { playerReads++; return nextSong; },
        getPlayerDuration: () => 70_000,
        extractTrackId: trackIdentity.extractTrackId,
        getSpotifyTrackData: uri => {
            assert.equal(uri, originalUri);
            return { name: 'Original song', artists: ['Original artist'], album: 'Original album', isrc: 'USAAA2600001', duration_ms: 180_000 };
        },
        getSyncService: () => null,
    });
    assert.equal(track.trackUri, originalUri);
    assert.equal(track.trackName, 'Original song');
    assert.equal(track.artistName, 'Original artist');
    assert.equal(track.albumName, 'Original album');
    assert.equal(track.trackIsrc, 'USAAA2600001');
    assert.equal(track.trackDurationMs, 180_000);
    assert.equal(track.albumArt, '');
    assert.equal(playerReads, 1);
});

test('the toolbar never labels next-track ISRC and metadata with the displayed song URI', () => {
    const chosen = captureSyncCreatorTrackInfo(originalUri, nextSong, {
        uri: originalUri, title: 'Original song', artist: 'Original artist', coverUrl: 'original-cover',
    });
    assert.equal(chosen.uri, originalUri);
    assert.equal(chosen.name, 'Original song');
    assert.equal(chosen.artist, 'Original artist');
    assert.equal(chosen.image, 'original-cover');
    assert.deepEqual(chosen.metadata, {});
    assert.deepEqual(chosen.album, {});
    assert.equal(chosen.duration, undefined);
});

test('LRCLIB authoring sends the selected track identity and length through all provider entry points', async () => {
    const info = captureSyncCreatorTrackInfo(originalUri, originalSong, { uri: originalUri });
    const track = resolveSyncCreatorTrack(info, {
        getPlayerItem: () => nextSong,
        getPlayerDuration: () => assert.fail('the next song cannot provide a duration'),
        extractTrackId: trackIdentity.extractTrackId,
        getSpotifyTrackData: () => null,
        getSyncService: () => null,
    });
    const requested = [];
    const returnedLyrics = { unsynced: [{ text: '1st line' }, { text: '2nd line' }] };
    const request = args => { requested.push(args); return Promise.resolve(returnedLyrics); };
    for (const path of ['ranked', 'manager', 'legacy']) {
        const state = {
            ...track, useCallback: callback => callback,
            window: { LyricsAddonManager: path === 'ranked'
                ? { getAddon: () => ({ searchCandidates: async args => {
                    requested.push(args);
                    return { success: false, error: 'No lyrics found' };
                } }) }
                : path === 'manager' ? { getLyricsFrom: (_id, args) => request(args) } : null },
            Providers: { lrclib: request },
            Spicetify: { Player: { data: { item: nextSong } } },
            beginSyncCreatorSourceChange: () => 1,
            isCurrentSyncCreatorSourceChange: () => true,
            resetSyncCreatorLyricsLoadingState() {}, clearLrclibCandidateState() {},
            applyLoadedLyricsResult: async () => true,
            lrclibIdInputEditedRef: { current: false },
            I18n: { t: key => key }, Toast: {}, console: { error() {} },
        };
        await setUpSyncCreatorLrclibActions(state, () => {}).loadLyrics();
    }
    const expected = {
        uri: originalUri, title: 'Original song', name: 'Original song', artist: 'Original artist',
        album: 'Original album', duration: 180_000, lrclibOfficialOnly: true, isrc: 'USAAA2600001',
    };
    assert.deepEqual(requested, [expected, expected, expected]);
});

test('the end-of-track loop ignores the next song while the editor returns to its own track', t => {
    t.mock.timers.enable({ apis: ['setInterval'] });
    const effects = [];
    const seeks = [];
    const requestedUris = [];
    const player = Object.assign(new EventTarget(), {
        data: { item: nextSong }, getProgress: () => player.data.item.duration.milliseconds - 100,
        seek: value => seeks.push(value), playUri: uri => requestedUris.push(uri),
    });
    useSyncCreatorVisibility({
        react: { useRef: initial => ({ current: initial === false ? true : initial }), useEffect: effect => effects.push(effect) },
        containerRef: { current: null }, preventNextTrackRef: { current: true }, trackUri: originalUri, getPlayer: () => player,
    });
    const cleanup = effects.at(-1)();
    try {
        t.mock.timers.tick(200);
        assert.deepEqual(seeks, []);
        assert.deepEqual(requestedUris, [], 'opening an editor for another track does not start it');
        player.dispatchEvent(new Event('songchange'));
        assert.deepEqual(requestedUris, [originalUri]);
        player.data.item = originalSong;
        t.mock.timers.tick(200);
        assert.deepEqual(seeks, [0]);
    } finally {
        cleanup();
    }
});

function retentionHarness(t, initialItem = originalSong) {
    t.mock.timers.enable({ apis: ['setInterval', 'Date'] });
    const actions = [];
    const createPlayer = item => Object.assign(new EventTarget(), {
        data: { item },
        progress: 1_000,
        getProgress() { return this.progress; },
        seek(position) { actions.push(['seek', position]); },
        playUri(uri) { actions.push(['restore', uri]); },
    });
    let player = initialItem ? createPlayer(initialItem) : null;
    const effects = [];
    useSyncCreatorVisibility({
        react: { useRef: initial => ({ current: initial === false ? true : initial }), useEffect: effect => effects.push(effect) },
        containerRef: { current: null }, preventNextTrackRef: { current: true },
        trackUri: originalUri, getPlayer: () => player,
    });
    t.after(effects.at(-1)());
    return {
        actions,
        get player() { return player; },
        replacePlayer(item) { return player = createPlayer(item); },
        tick: milliseconds => t.mock.timers.tick(milliseconds),
    };
}

test('the editor corrects a late track transition once and waits for confirmation before retrying', t => {
    const h = retentionHarness(t);
    h.player.dispatchEvent(new Event('songchange'));
    assert.deepEqual(h.actions, []);
    h.player.data.item = nextSong;
    h.tick(200);
    assert.deepEqual(h.actions, [['restore', originalUri]]);
    h.player.dispatchEvent(new Event('songchange'));
    h.player.dispatchEvent(new Event('songchange'));
    h.tick(600);
    assert.deepEqual(h.actions, [['restore', originalUri]]);
    h.tick(400);
    assert.deepEqual(h.actions, [['restore', originalUri], ['restore', originalUri]]);
    h.player.data.item = originalSong;
    h.tick(200);
    h.player.data.item = nextSong;
    h.player.dispatchEvent(new Event('songchange'));
    assert.equal(h.actions.length, 3, 'a later skip can be handled immediately after a confirmed return');
});

test('the editor binds a late or replaced player and stops listening to the previous instance', t => {
    const h = retentionHarness(t, null);
    const old = h.replacePlayer(originalSong);
    h.tick(200);
    h.replacePlayer(originalSong);
    h.tick(200);
    h.player.data.item = nextSong;
    old.dispatchEvent(new Event('songchange'));
    assert.deepEqual(h.actions, []);
    h.player.dispatchEvent(new Event('songchange'));
    assert.deepEqual(h.actions, [['restore', originalUri]]);
});

test('the editor waits for a loop seek to take effect before issuing another one', t => {
    const h = retentionHarness(t);
    h.player.progress = originalSong.duration.milliseconds - 100;
    h.tick(600);
    assert.deepEqual(h.actions, [['seek', 0]]);
    h.player.progress = 0;
    h.tick(200);
    h.player.progress = originalSong.duration.milliseconds - 100;
    h.tick(200);
    assert.deepEqual(h.actions, [['seek', 0], ['seek', 0]]);
});
