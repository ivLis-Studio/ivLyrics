import { bundleInitializer } from "./fixtures/initializer-bundle.mjs";
import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';

const source = bundleInitializer(new URL('../src/providers/lyrics/Addon_Lyrics_Spotify.js', import.meta.url));
const id = '6QDv6s76britJEg8L9tXvX';
const track = { uri: `spotify:track:${id}`, title: 'Song', artist: 'Artist' };
const payload = {
    lyrics: { provider: 'MusixMatch', syncType: 'LINE_SYNCED', lines: [
        { startTimeMs: '1000', words: 'First' },
        { startTimeMs: '2500', words: 'Second' },
    ] },
};

function load({ platformResponse, legacyResponse, platformError, legacyError } = {}) {
    let addon;
    const calls = [];
    const timers = new Map();
    const builder = {};
    for (const method of ['withHost', 'withPath', 'withEndpointIdentifier', 'withQueryParameters']) {
        builder[method] = value => { calls.push([method, value]); return builder; };
    }
    builder.send = async () => {
        calls.push(['send']);
        if (platformError) throw platformError;
        return typeof platformResponse === 'function' ? platformResponse() : platformResponse;
    };
    const Spicetify = {
        Platform: platformResponse !== undefined || platformError
            ? { RequestBuilder: { build: () => builder } } : {},
        ...(legacyResponse !== undefined || legacyError ? { CosmosAsync: {
            async get(url) {
                calls.push(['cosmos', url]);
                if (legacyError) throw legacyError;
                return legacyResponse;
            },
        } } : {}),
    };
    const window = {
        Spicetify,
        setTimeout(callback, delay) {
            const id = Symbol();
            timers.set(id, { callback, delay });
            return id;
        },
        clearTimeout(id) { timers.delete(id); },
        LyricsService: { extractTrackId: uri => /^spotify:track:([A-Za-z0-9]{22})$/.exec(uri)?.[1] || null },
        LyricsAddonManager: { register(value) { addon = value; } },
    };
    vm.runInNewContext(source, { window, URLSearchParams, console: { warn() {} } });
    return { addon, calls, timers, Spicetify };
}

test('Spotify lyrics work through authenticated RequestBuilder when CosmosAsync is absent', async () => {
    const h = load({ platformResponse: { status: 200, body: payload } });
    const result = await h.addon.getLyrics(track);
    assert.equal(result.error, null);
    assert.equal(result.provider, 'spotify-MusixMatch');
    assert.equal(result.synced[0].startTime, 1000);
    assert.equal(result.synced[1].text, 'Second');
    assert.equal(result.unsynced, result.synced);
    assert.deepEqual(h.calls.find(call => call[0] === 'withHost'), ['withHost', 'https://spclient.wg.spotify.com/color-lyrics/v2']);
    assert.deepEqual(h.calls.find(call => call[0] === 'withPath'), ['withPath', `/track/${id}`]);
    assert.equal(h.calls.some(call => call[0] === 'cosmos'), false);
});

test('JSON text responses and unsynced lyrics are supported', async () => {
    const body = { lyrics: { ...payload.lyrics, syncType: 'UNSYNCED' } };
    const h = load({ platformResponse: { status: 200, body: JSON.stringify(body) } });
    const result = await h.addon.getLyrics(track);
    assert.equal(result.error, null);
    assert.equal(result.synced, null);
    assert.equal(result.unsynced[1].text, 'Second');
});

test('legacy CosmosAsync remains usable without RequestBuilder or after a transport failure', async () => {
    for (const platformError of [undefined, new Error('platform transport unavailable')]) {
        const h = load({ platformError, legacyResponse: payload });
        assert.equal((await h.addon.getLyrics(track)).synced.length, 2);
        assert.equal(h.calls.filter(call => call[0] === 'cosmos').length, 1);
    }
});

test('no-lyrics and restricted responses do not trigger duplicate legacy requests', async () => {
    for (const status of [204, 404, 401, 403, 429]) {
        const h = load({ platformResponse: { status }, legacyResponse: payload });
        const result = await h.addon.getLyrics(track);
        assert.equal(result.error, [204, 404].includes(status) ? 'No lyrics' : `Request error (${status})`);
        assert.equal(h.calls.some(call => call[0] === 'cosmos'), false);
    }
});

test('terminal errors thrown by RequestBuilder preserve status without a fallback call', async () => {
    for (const status of [204, 404, 401, 403, 429]) {
        for (const shape of [{ statusCode: String(status) }, { response: { status } }]) {
            const h = load({ platformError: Object.assign(new Error('request failed'), shape), legacyResponse: payload });
            const result = await h.addon.getLyrics(track);
            assert.equal(result.error, [204, 404].includes(status) ? 'No lyrics' : `Request error (${status})`);
            assert.deepEqual(h.calls.map(([method]) => method), [
                'withHost', 'withPath', 'withEndpointIdentifier', 'withQueryParameters', 'send',
            ]);
            assert.equal(h.timers.size, 0);
        }
    }
});

test('legacy wrapped JSON and no-content errors are normalized consistently', async () => {
    const h = load({ platformResponse: { status: 503 }, legacyResponse: { statusCode: 200, body: JSON.stringify(payload) } });
    assert.equal((await h.addon.getLyrics(track)).synced[1].text, 'Second');
    assert.equal(h.calls.filter(([method]) => method === 'cosmos').length, 1);
    assert.equal(h.timers.size, 0);
    const missing = load({ legacyError: Object.assign(new Error(), { response: { status: 404 } }) });
    assert.equal((await missing.addon.getLyrics(track)).error, 'No lyrics');
    assert.equal(missing.timers.size, 0);
});

test('a stalled response body stops after the request deadline and releases the next attempt', async () => {
    let finishBody;
    let waitingForBody;
    const started = new Promise(resolve => { waitingForBody = resolve; });
    const body = new Promise(resolve => { finishBody = resolve; });
    let requestCount = 0;
    const h = load({
        platformResponse: () => ++requestCount === 1
            ? { status: 200, json() { waitingForBody(); return body; } }
            : { status: 200, body: payload },
        legacyResponse: payload,
    });
    const stalled = h.addon.getLyrics(track);
    const reentrant = h.addon.getLyrics(track);
    await started;
    assert.equal(requestCount, 1);
    assert.equal(h.timers.size, 1);
    const deadline = [...h.timers.values()][0];
    assert.equal(deadline.delay, 6000);
    deadline.callback();
    for (const result of await Promise.all([stalled, reentrant])) assert.equal(result.error, 'Request error (408)');
    assert.equal(h.timers.size, 0);
    assert.equal(h.calls.some(([method]) => method === 'cosmos'), false);
    const fresh = await h.addon.getLyrics(track);
    finishBody({ lyrics: { provider: 'Delayed' } });
    assert.equal(fresh.synced[0].text, 'First');
    assert.equal(requestCount, 2);
});

test('simultaneous lookups share raw lyrics only within the same session', async () => {
    let resolveFirst;
    const first = new Promise(resolve => { resolveFirst = resolve; });
    let queries = 0;
    const h = load({ platformResponse: () => ++queries === 1 ? first : { status: 200, body: payload } });
    h.Spicetify.Platform.LocalStorageAPI = { namespace: 'account-a' };
    const a = h.addon.getLyrics(track);
    const alsoA = h.addon.getLyrics(track);
    h.Spicetify.Platform.LocalStorageAPI.namespace = 'account-b';
    const b = await h.addon.getLyrics(track);
    assert.equal(queries, 2);
    assert.equal(b.synced[0].text, 'First');
    resolveFirst({ status: 200, body: payload });
    const [one, two] = await Promise.all([a, alsoA]);
    one.synced[0].text = 'mutated';
    assert.equal(two.synced[0].text, 'First');
    assert.equal(h.timers.size, 0);
});

test('syllable-timed responses preserve line view, skip malformed records, and retain blank rows', async () => {
    const h = load({ platformResponse: {
        status: 200,
        body: { lyrics: {
            syncType: 'SYLLABLE_SYNCED',
            lines: [
                null,
                { startTimeMs: '-5', words: 'First', syllables: [null, { startTimeMs: '701' }] },
                { startTimeMs: '1700', words: '' },
                { startTimeMs: '2000', words: 'Second', syllables: [{ startTimeMs: '1999' }] },
            ],
        } },
    } });
    const result = await h.addon.getLyrics(track);
    assert.equal(result.karaoke, null);
    assert.equal(result.provider, 'spotify-unknown');
    assert.deepEqual(JSON.parse(JSON.stringify(result.synced)), [
        { startTime: 701, text: 'First' }, { startTime: 1700, text: '' }, { startTime: 2000, text: 'Second' },
    ]);
    assert.strictEqual(result.synced, result.unsynced);
});

test('invalid timing still leaves readable lyrics without claiming line synchronization', async () => {
    const h = load({ platformResponse: { lyrics: { syncType: 'LINE_SYNCED',
        lines: [{ startTimeMs: '', words: 'Kept' }, { startTimeMs: 'invalid', words: 'Even here' }],
    } } });
    const result = await h.addon.getLyrics(track);
    assert.equal(result.synced, null);
    assert.deepEqual(result.unsynced.map(line => line.text).join(' '), 'Kept Even here');
});

test('missing APIs and malformed or empty lyrics produce provider errors instead of exceptions', async () => {
    assert.equal((await load().addon.getLyrics(track)).error, 'Request error');
    for (const body of ['', {}, { lyrics: {} }, { lyrics: { lines: [] } }, { lyrics: { lines: [null, {}, { words: ' ' }] } }]) {
        assert.equal((await load({ platformResponse: { status: 200, body } }).addon.getLyrics(track)).error, 'No lyrics');
    }
});

test('Spotify provider still rejects local tracks without sending them to Spotify', async () => {
    const h = load({ platformResponse: { status: 200, body: payload } });
    assert.equal((await h.addon.getLyrics({ uri: 'spotify:local:Artist:Album:Song:180' })).error, 'Missing Spotify track ID');
    assert.equal(h.calls.length, 0);
});
