import { bundleInitializer } from "./fixtures/initializer-bundle.mjs";
import { createLyricsProviderRequests } from "../src/lyrics/lyricsProviderRequests.mjs";
import { getLocalTrackUriFromCacheId, trackIdentity } from "../src/core/trackIdentity.mjs";
import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';

const source = bundleInitializer(new URL('../src/providers/lyrics/LyricsAddonManager.js', import.meta.url));
const info = { uri: 'spotify:track:AAAAAAAAAAAAAAAAAAAAAA', title: 'Fixture', artist: 'Artist' };
const line = { text: 'Fixture lyric', startTime: 1000, endTime: 3000 };
const missing = () => ({ error: 'No lyrics' });
const result = (type = 'synced') => ({
    synced: type === 'plain' ? null : [line], unsynced: [{ text: line.text }],
    ...(['character', 'word'].includes(type) ? {
        karaokeGranularity: type, karaokeSource: 'fixture', karaoke: [{ ...line, syllables: [
            { text: 'Fixture ', startTime: 1000, endTime: 2000 }, { text: 'lyric', startTime: 2000, endTime: 3000 },
        ] }],
    } : {}),
});
const deferred = () => { let resolve, reject; const promise = new Promise((done, fail) => { resolve = done; reject = fail; }); return { promise, resolve, reject }; };
const flush = async () => { for (let i = 0; i < 3; i++) await new Promise(setImmediate); };

function setup(t, {
    count = 6, preferTypes = true, ids = Array.from({ length: count }, (_, i) => `provider-${i}`),
    getResult, prepareLyricsLookup,
} = {}) {
    const gates = ids.map(deferred), calls = [], attempts = [], selected = [], cacheWrites = [], generations = [];
    let active = 0, maximum = 0;
    const stored = new Map([
        ['ivLyrics:visual:prefer-lyrics-type-over-provider-order', String(preferTypes)],
        ['ivLyrics:lyrics:provider-order', JSON.stringify(ids)],
    ]);
    const window = { LyricsService: {
        extractTrackId: () => 'AAAAAAAAAAAAAAAAAAAAAA',
        cacheLyrics: async (trackId, provider, value) => { cacheWrites.push({ trackId, provider, value }); },
    } };
    const context = vm.createContext({
        window, console: { info() {}, log() {}, warn() {}, error() {} },
        Spicetify: { LocalStorage: { get: key => stored.get(key) ?? null, set: (key, value) => stored.set(key, value) } },
        setTimeout, clearTimeout,
    });
    vm.runInContext(source, context);
    const manager = window.LyricsAddonManager;
    ids.forEach((id, index) => manager.register({
        id, name: id, author: 'fixture', description: 'Synthetic provider', version: '1.0.0', defaultEnabled: true,
        supports: { karaoke: true, karaokeCharacter: true, karaokeWord: true, synced: true, unsynced: true },
        supportsLocalTracks: true,
        prepareLyricsLookup: prepareLyricsLookup && (info => prepareLyricsLookup(info, id)),
        ...(id === 'lrcred' ? { requestWordSync: () => generations.push([...calls]) } : {}),
        async getLyrics(track) {
            calls.push(id); maximum = Math.max(maximum, ++active);
            try { return { uri: track.uri, provider: id, ...await (getResult ? getResult(track, id) : gates[index].promise) }; }
            finally { active--; }
        },
    }));
    manager.on('lyrics:provider:attempt', event => attempts.push(event));
    manager.on('lyrics:fetch:success', event => selected.push(event));
    t.after(async () => { gates.forEach(gate => gate.resolve(missing())); await flush(); });
    return { manager, gates, calls, attempts, selected, cacheWrites, generations, stored,
        get maximum() { return maximum; },
        resolve: (index, value = missing()) => gates[index].resolve(value),
    };
}

test('reentrant progress joins the request and an old refresh cannot alter the current progress or cache', async t => {
    const old = deferred(), fresh = deferred();
    t.after(() => { old.resolve(missing()); fresh.resolve(missing()); });
    let providerCalls = 0;
    const h = setup(t, { count: 1, getResult: () => ++providerCalls === 1 ? old.promise : fresh.promise });
    const requests = createLyricsProviderRequests(() => h.manager);
    const snapshots = [], joins = [];
    const lookup = () => requests.request({
        info, forcedProviderId: 'provider-0', getSnapshot: () => snapshots.at(-1),
        publishSnapshot: snapshot => snapshots.push(snapshot),
    });
    h.manager.on('lyrics:search:progress', () => { joins.push(lookup()); });

    const obsolete = lookup();
    await flush();
    assert.equal(providerCalls, 1);
    assert.ok(joins.length > 0);
    requests.invalidate(info.uri);
    assert.equal(h.manager.getActiveLyricsSearchProgress(info.uri, 'provider-0'), null);
    assert.equal((await obsolete).stale, true, 'invalidate releases everyone waiting on the old provider');
    const current = lookup();
    await flush();
    assert.equal(providerCalls, 2);
    const currentProgress = h.manager.getActiveLyricsSearchProgress(info.uri, 'provider-0');
    assert.equal(currentProgress.stage, 'provider');
    old.resolve(result());
    await flush();
    assert.deepEqual(h.manager.getActiveLyricsSearchProgress(info.uri, 'provider-0'), currentProgress);
    assert.deepEqual(h.cacheWrites, []);
    assert.deepEqual(snapshots, []);
    fresh.resolve(result('character'));
    const selected = await current;
    await Promise.all(joins);
    assert.equal(selected.karaokeGranularity, 'character');
    assert.equal(h.cacheWrites.length, 1);
    assert.equal(h.selected.length, 1);
    assert.equal(snapshots.length, 1);
    assert.equal(h.manager.getActiveLyricsSearchProgress(info.uri, 'provider-0'), null);
});

test('starts three providers in order and fills each free slot without waiting for an earlier provider', async t => {
    const h = setup(t), lookup = h.manager.getLyrics(info);
    await flush();
    assert.deepEqual(h.calls, ['provider-0', 'provider-1', 'provider-2']);
    h.resolve(1); await flush();
    assert.deepEqual(h.calls, ['provider-0', 'provider-1', 'provider-2', 'provider-3']);
    h.resolve(2); await flush();
    assert.equal(h.calls.at(-1), 'provider-4');
    h.resolve(3); await flush();
    assert.equal(h.calls.at(-1), 'provider-5');
    assert.equal(h.maximum, 3);
    h.resolve(0); h.resolve(4); h.resolve(5);
    assert.ok((await lookup).error);
    assert.deepEqual(h.attempts.map(attempt => attempt.attempt), [1, 2, 3, 4, 5, 6]);
    assert.equal(h.calls.length, 6, 'no repeated fetches in later timing phases');
});

test('cancelling a speculative consumer preserves foreground progress, selection and cache writes', async t => {
    const h = setup(t, { count: 1 });
    const requests = createLyricsProviderRequests(() => h.manager);
    const cancelled = new AbortController();
    const snapshots = [];
    const lookup = signal => requests.request({
        info, forcedProviderId: 'provider-0', signal,
        getSnapshot: () => snapshots.at(-1), publishSnapshot: snapshot => snapshots.push(snapshot),
    });

    const speculative = lookup(cancelled.signal);
    await flush();
    const foreground = lookup();
    cancelled.abort();
    assert.equal((await speculative).stale, true);
    assert.equal(h.manager.getActiveLyricsSearchProgress(info.uri, 'provider-0').stage, 'provider');
    h.resolve(0, result('character'));
    assert.equal((await foreground).karaokeGranularity, 'character');
    assert.equal(h.calls.length, 1);
    assert.equal(h.cacheWrites.length, 1);
    assert.equal(snapshots.length, 1);
});

test('invalidating provider selection retires prepared and queued requests', async t => {
    const preparation = deferred();
    const h = setup(t, { prepareLyricsLookup: (_info, id) => id === 'provider-1' ? preparation.promise : undefined });
    t.after(() => preparation.resolve());
    const requests = createLyricsProviderRequests(() => h.manager);
    const snapshots = [];
    const obsolete = requests.request({ info, getSnapshot: () => null, publishSnapshot: value => snapshots.push(value) });
    await flush();
    assert.deepEqual(h.calls, ['provider-0', 'provider-2']);
    requests.invalidate();
    assert.equal((await obsolete).stale, true);
    preparation.resolve();
    h.resolve(0); h.resolve(2);
    await flush();
    assert.deepEqual(h.calls, ['provider-0', 'provider-2']);
    assert.deepEqual(h.selected, []);
    assert.deepEqual(h.cacheWrites, []);
    assert.deepEqual(snapshots, []);
});

test('replacing the provider manager changes the request revision and only the new manager publishes', async t => {
    const old = setup(t, { ids: ['old'] });
    const fresh = setup(t, { ids: ['fresh'] });
    let manager = old.manager;
    const snapshots = [];
    const requests = createLyricsProviderRequests(() => manager, () => { snapshots.length = 0; });
    const lookup = () => requests.request({ info, getSnapshot: () => snapshots.at(-1), publishSnapshot: value => snapshots.push(value) });
    const revision = requests.getRevision(info.uri);
    const obsolete = lookup();
    await flush();
    manager = fresh.manager;
    assert.notEqual(requests.getRevision(info.uri), revision);
    assert.equal((await obsolete).stale, true);
    const current = lookup();
    fresh.resolve(0, result('character'));
    assert.equal((await current).provider, 'fresh');
    old.resolve(0, result('character'));
    await flush();
    assert.deepEqual(snapshots.map(snapshot => snapshot.provider), ['fresh']);
    assert.deepEqual(old.cacheWrites, []);
});

test('a track invalidation releases every joined lookup for that track and leaves other tracks running', async () => {
    const other = { ...info, uri: 'spotify:track:BBBBBBBBBBBBBBBBBBBBBB' };
    const gates = new Map([[info.uri, deferred()], [other.uri, deferred()]]);
    const signals = new Map();
    const manager = {
        getLyrics({ uri }, _provider, { signal }) {
            signals.set(uri, signal);
            return gates.get(uri).promise;
        },
    };
    const snapshots = [];
    const requests = createLyricsProviderRequests(() => manager);
    const lookup = (track) => requests.request({ info: track, getSnapshot: () => null, publishSnapshot: value => snapshots.push(value) });
    const obsolete = lookup(info), joined = lookup(info), current = lookup(other);
    await flush();
    requests.invalidate(info.uri);
    assert.equal(signals.get(info.uri)?.aborted, true);
    assert.equal(signals.get(other.uri)?.aborted, false);
    assert.deepEqual(await Promise.all([obsolete, joined]), [
        { uri: info.uri, error: 'Lyrics request superseded', stale: true },
        { uri: info.uri, error: 'Lyrics request superseded', stale: true },
    ]);
    gates.get(other.uri).resolve({ uri: other.uri, provider: 'fixture', ...result() });
    assert.equal((await current).uri, other.uri);
    gates.get(info.uri).reject(new Error('provider stopped late'));
    await flush();
    assert.deepEqual(snapshots.map(({ trackUri }) => trackUri), [other.uri]);
});

test('disk cache keys retire the corresponding Spotify or local lookup without cancelling a different track', async () => {
    const localUri = 'spotify:local:Artist:Album:Title:180';
    const webUri = 'https://open.spotify.com/track/AAAAAAAAAAAAAAAAAAAAAA';
    const otherUri = 'spotify:track:BBBBBBBBBBBBBBBBBBBBBB';
    const signals = new Map();
    const response = deferred();
    const manager = {
        getLyrics({ uri }, _provider, { signal }) {
            signals.set(uri, signal);
            return response.promise;
        },
    };
    const getScope = value => trackIdentity.extractTrackId(value) || getLocalTrackUriFromCacheId(value) || value;
    const requests = createLyricsProviderRequests(() => manager, undefined, getScope);
    const snapshots = [];
    const load = uri => requests.request({
        info: { uri }, getSnapshot: () => null, publishSnapshot: snapshot => snapshots.push(snapshot),
    });
    const spotify = load(info.uri);
    const web = load(webUri);
    const local = load(localUri);
    const other = load(otherUri);
    await flush();
    requests.invalidate(trackIdentity.extractTrackId(info.uri));
    requests.invalidate(trackIdentity.getTranslationCacheId(localUri));
    const retired = [info.uri, webUri, localUri];
    assert.ok(retired.every(uri => signals.get(uri)?.aborted));
    assert.equal(signals.get(otherUri)?.aborted, false);
    assert.equal(requests.getRevision(webUri), requests.getRevision(info.uri));
    assert.notEqual(requests.getRevision(otherUri), requests.getRevision(info.uri));
    assert.deepEqual((await Promise.all([spotify, web, local])).map(result => result.stale), [true, true, true]);
    response.resolve({ ...result(), provider: 'fixture' });
    await other;
    await flush();
    assert.deepEqual(snapshots.map(snapshot => snapshot.trackUri), [otherUri]);
});

test('a faster lower-priority response cannot win over an earlier provider', async t => {
    const h = setup(t), lookup = h.manager.getLyrics(info);
    let settled = false; lookup.then(() => { settled = true; });
    await flush(); h.resolve(1, result('character')); await flush();
    assert.equal(settled, false);
    h.resolve(0, result('character'));
    assert.equal((await lookup).provider, 'provider-0');
    h.resolve(2, result('character')); h.resolve(3, result('character')); await flush();
    assert.equal(h.selected.length, 1, 'late responses only warm their provider caches');
    assert.ok(h.cacheWrites.some(write => write.provider === 'provider-2'));
    assert.ok(h.cacheWrites.every(write => write.trackId === 'AAAAAAAAAAAAAAAAAAAAAA'));
    assert.equal(h.manager.getActiveLyricsSearchProgress(info.uri), null);
    assert.equal(h.calls.length, 4, 'unstarted providers are discarded once selection finishes');
});

test('an immediately successful first provider stops queued work before the next slot is spent', async t => {
    const h = setup(t), lookup = h.manager.getLyrics(info);
    await flush(); h.resolve(0, result('character'));
    assert.equal((await lookup).provider, 'provider-0');
    h.resolve(1); h.resolve(2); await flush();
    assert.deepEqual(h.calls, ['provider-0', 'provider-1', 'provider-2']);
    assert.equal(h.selected.length, 1);
});

test('character quality still outranks a faster word result', async t => {
    const h = setup(t, { count: 3 }), lookup = h.manager.getLyrics(info);
    let settled = false; lookup.then(() => { settled = true; });
    await flush(); h.resolve(0, result('word')); h.resolve(1); await flush();
    assert.equal(settled, false);
    h.resolve(2, result('character'));
    assert.equal((await lookup).provider, 'provider-2');
    assert.equal(h.calls.length, 3);
});

test('word selection reuses completed lookups and retains configured provider priority', async t => {
    const h = setup(t, { count: 3 }), lookup = h.manager.getLyrics(info);
    await flush(); h.resolve(2, result('word')); h.resolve(1); await flush();
    h.resolve(0, result('word'));
    assert.equal((await lookup).provider, 'provider-0');
    assert.equal(h.calls.length, 3);
});

test('provider-first mode retains its original choice while fetching in parallel', async t => {
    const h = setup(t, { count: 3, preferTypes: false }), lookup = h.manager.getLyrics(info);
    await flush(); h.resolve(1, result('character')); h.resolve(2); h.resolve(0, result());
    assert.equal((await lookup).provider, 'provider-0');
    assert.equal(h.maximum, 3);
});

test('an explicit provider override fetches only that provider', async t => {
    const h = setup(t), lookup = h.manager.getLyrics(info, 'provider-4');
    await flush(); assert.deepEqual(h.calls, ['provider-4']);
    h.resolve(4, result());
    assert.equal((await lookup).provider, 'provider-4');
    assert.equal(h.maximum, 1);
});

test('a rejected provider frees its slot and does not reject the whole lookup', async t => {
    const h = setup(t, { count: 4 }), lookup = h.manager.getLyrics(info);
    await flush(); h.gates[1].reject(new Error('Synthetic network failure')); await flush();
    assert.equal(h.calls.at(-1), 'provider-3');
    h.resolve(0); h.resolve(2); h.resolve(3, result('word'));
    assert.equal((await lookup).provider, 'provider-3');
    assert.equal(h.maximum, 3);
});

test('lrc.red waits for slower native karaoke providers before authorizing AI', async t => {
    const h = setup(t, { ids: ['provider-0', 'provider-1', 'lrcred'] }), lookup = h.manager.getLyrics(info);
    await flush(); h.resolve(2, result()); h.resolve(0, result()); await flush();
    assert.equal(h.generations.length, 0);
    h.resolve(1, result('word'));
    assert.equal((await lookup).provider, 'provider-1');
    assert.equal(h.generations.length, 0);
});

test('lrc.red generates only after every pending karaoke lookup finishes without a match', async t => {
    const h = setup(t, { ids: ['provider-0', 'provider-1', 'lrcred'] }), lookup = h.manager.getLyrics(info);
    await flush(); h.resolve(2, result()); h.resolve(0, result()); await flush();
    assert.equal(h.generations.length, 0);
    h.resolve(1);
    assert.equal((await lookup).provider, 'lrcred');
    assert.equal(h.generations.length, 1);
    assert.deepEqual(h.generations[0], ['provider-0', 'provider-1', 'lrcred']);
});

test('disabled providers never consume a lookup slot', async t => {
    const h = setup(t, { count: 4 });
    h.stored.set('ivLyrics:lyrics:enabled:provider-1', 'false');
    const lookup = h.manager.getLyrics(info);
    await flush();
    assert.deepEqual(h.calls, ['provider-0', 'provider-2', 'provider-3']);
    h.resolve(0); h.resolve(2); h.resolve(3);
    assert.ok((await lookup).error);
    assert.equal(h.maximum, 3);
});

test('mixed provider capabilities retain the original phase and provider start order', async t => {
    const h = setup(t, { count: 4 });
    h.manager.getAddon('provider-0').supports = { synced: true, unsynced: true };
    h.manager.getAddon('provider-1').supports = { karaoke: true, karaokeWord: true, synced: true };
    h.manager.getAddon('provider-2').supports = { karaoke: true, karaokeCharacter: true, synced: true };
    h.manager.getAddon('provider-3').supports = { karaoke: true, karaokeWord: true, synced: true };
    const lookup = h.manager.getLyrics(info);
    await flush(); assert.deepEqual(h.calls, ['provider-2']);
    h.resolve(2); await flush();
    assert.deepEqual(h.calls, ['provider-2', 'provider-1', 'provider-3']);
    h.resolve(1); h.resolve(3); await flush();
    assert.deepEqual(h.calls, ['provider-2', 'provider-1', 'provider-3', 'provider-0']);
    h.resolve(0, result());
    assert.equal((await lookup).provider, 'provider-0');
});
