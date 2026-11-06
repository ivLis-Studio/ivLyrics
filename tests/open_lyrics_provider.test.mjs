import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../Addon_Lyrics_OpenLyrics.js', import.meta.url), 'utf8');
const fixtures = JSON.parse(readFileSync(new URL('./fixtures/open-lyrics.json', import.meta.url)));
const encoded = ['aHR0cHM6Ly9hcGkubGlyaXFvLWFsZmFycml6aS5teS5pZC92MS9seXJpY3M=', 'aHR0cHM6Ly9hcGkubHJjbXV4LmRldi9nZXQ='];
const endpoints = encoded.map(value => Buffer.from(value, 'base64').toString());
const track = { uri: 'spotify:track:0123456789012345678901', isrc: 'USAT21703595', title: 'Fixture Song', artist: 'Fixture Artist', durationMs: 10000 };
function load(fetch = async () => Response.json(null, { status: 404 })) {
    const window = { LyricsAddonManager: { register() {} } };
    vm.runInNewContext(source, { window, fetch, URL, AbortController, setTimeout, clearTimeout, atob, console: { warn() {} } });
    return { addon: window.OpenLyricsAddon, debug: window.__ivLyricsOpenLyricsDebug };
}

for (const fixture of fixtures) test(`Open Lyrics parses ${fixture.name}`, () => {
    const { debug } = load();
    const parsed = debug.parseOpenTrack(fixture.track, fixture.source, 10000);
    const kind = parsed.karaoke?.length ? 'karaoke' : parsed.synced?.length ? 'synced' : 'plain';
    assert.equal(kind, fixture.kind);
    const best = parsed.karaoke || parsed.synced || parsed.unsynced;
    assert.deepEqual(Array.from(best, x => x.text), fixture.texts);
    if (fixture.starts.length) assert.deepEqual(Array.from(best, x => x.startTime), fixture.starts);
    if (kind === 'karaoke') {
        assert.equal(best[0].syllables.map(x => x.text).join('').trim(), fixture.texts[0]);
        assert.equal(best[0].syllables[0].startTime, 1000, 'milliseconds stay milliseconds');
    }
});

function raceHarness() {
    const requests = [], pending = new Map();
    let ready;
    const started = new Promise(resolve => { ready = resolve; });
    const fetch = (url, options) => new Promise((resolve, reject) => {
        const value = String(url); requests.push(value);
        options.signal?.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')), { once: true });
        const service = endpoints.findIndex(endpoint => value.startsWith(endpoint + '?'));
        if (service >= 0) pending.set(service, value => resolve(Response.json(value)));
        if (pending.size === 2) ready();
    });
    return { ...load(fetch), requests, pending, started };
}
const lineBody = text => ({ meta: { level: 'line' }, lines: [{ text, start: 1000, end: 3000 }] });

test('three services start together; first usable result returns without waiting for slow losers', async () => {
    const h = raceHarness();
    const result = h.addon.getLyrics(track);
    await h.started;
    assert.equal(h.requests.length, 4, 'two existing searches and two additional services');
    h.pending.get(1)(lineBody('First response'));
    const loaded = await result;
    assert.equal(loaded.provider, 'open-lyrics', 'new provider identity is independent');
    assert.equal(loaded.synced[0].text, 'First response');
    assert.equal(loaded.karaoke, null);
    assert.equal(loaded.openLyrics.upstream, 'server-b');
});

test('an empty first response does not win; another service can supply native word timing', async () => {
    const h = raceHarness(), result = h.addon.getLyrics(track);
    await h.started;
    h.pending.get(1)({ lines: [] });
    h.pending.get(0)({ primary: fixtures[3].track });
    const loaded = await result;
    assert.equal(loaded.openLyrics.upstream, 'server-a');
    assert.equal(loaded.karaoke[0].text, '안녕 세상');
});

test('mismatched returned ISRC is ignored', async () => {
    const h = raceHarness(), result = h.addon.getLyrics(track);
    await h.started;
    h.pending.get(1)({ ...lineBody('Wrong recording'), track: { isrc: 'JPU901800227' } });
    h.pending.get(0)({ primary: fixtures[3].track });
    assert.equal((await result).openLyrics.upstream, 'server-a');
});

test('cancelling a race resolves even while transports are pending', async () => {
    const h = raceHarness(), controller = new AbortController();
    const result = h.debug.fetchBestLyrics(track, controller.signal);
    await h.started;
    controller.abort();
    assert.equal(await result, null);
});

test('an upstream primary is preserved and empty primary can fall back to other tracks', () => {
    const { debug } = load();
    const primary = { syncLevel: 'line', timed: [{ text: 'Selected upstream', start: 1000, end: 3000 }] };
    const response = debug.parseOpenResponse({ primary, tracks: [fixtures[3].track] }, 'server-a', 10000);
    assert.equal(response.parsed.synced[0].text, 'Selected upstream');
    assert.equal(response.parsed.karaoke, null);
    const fallback = debug.parseOpenResponse({ primary: {}, tracks: [fixtures[3].track] }, 'server-a', 10000);
    assert.equal(fallback.parsed.karaoke[0].text, '안녕 세상');
});

test('renamed provider has no plaintext service endpoint literals', () => {
    assert.equal(load().addon.name, 'Open Lyrics');
    for (const endpoint of endpoints) assert.equal(source.includes(endpoint), false);
});
