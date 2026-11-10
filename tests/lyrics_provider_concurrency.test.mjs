import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../LyricsAddonManager.js', import.meta.url), 'utf8');
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

function setup(t, { count = 6, preferTypes = true, ids = Array.from({ length: count }, (_, i) => `provider-${i}`) } = {}) {
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
        ...(id === 'lrcred' ? { requestWordSync: () => generations.push([...calls]) } : {}),
        async getLyrics() {
            calls.push(id); maximum = Math.max(maximum, ++active);
            try { return { uri: info.uri, provider: id, ...await gates[index].promise }; }
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
