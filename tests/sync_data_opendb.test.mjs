import assert from 'node:assert/strict';
import test from 'node:test';
import { createSyncDataOpenDb } from '#ivlyrics/lyrics/createSyncDataOpenDb.mjs';

const isrcA = 'USAAA2600001';
const isrcB = 'USAAA2600002';
const isrcC = 'USAAA2600003';
const day = '2026-11-20';
const fixture = () => {
    const data = new Map();
    const requests = [];
    let rebuilds = 0;
    const manifest = {
        schema: 1, format: 'provider-map',
        base: { url: 'data/base.json', count: 3, distinctIsrc: 2 },
        deltas: [{ url: 'data/delta.json', date: day }],
        current: { url: 'data/current.json' },
    };
    const payloads = new Map([
        ['manifest.json', manifest],
        ['base.json', { schema: 1, type: 'base', format: 'provider-map', items: {
            spotify: [isrcB, isrcA], lrclib: [isrcA],
        } }],
        ['delta.json', { schema: 1, type: 'delta', format: 'provider-map-delta', date: day,
            add: { spotify: [isrcC] }, remove: { spotify: [isrcB] } }],
        ['current.json', { schema: 1, type: 'delta-current', format: 'provider-map-delta',
            add: { lrclib: [isrcB] }, remove: {} }],
    ]);
    const db = createSyncDataOpenDb({
        getStorage: () => ({
            getItem: key => data.get(key),
            setItem: (key, value) => data.set(key, value),
            removeItem: key => data.delete(key),
        }),
        fetch: async (url) => {
            const name = new URL(url).pathname.split('/').at(-1);
            requests.push(name);
            return { ok: payloads.has(name), status: 404, json: async () => payloads.get(name) };
        },
        now: () => 1_000_000,
        normalizeIsrc: value => typeof value === 'string' && /^[A-Z0-9]{12}$/i.test(value) ? value.toUpperCase() : '',
        createTimeoutSignal: () => undefined,
        onRebuilt: () => { rebuilds++; },
    });
    return { db, data, requests, payloads, get rebuilds() { return rebuilds; } };
};

test('OpenDB applies base, dated delta and current delta once to the shared provider index', async () => {
    const f = fixture();
    const [added, removed, providerFallback] = await Promise.all([
        f.db.getOpenDbProvidersForIsrc(isrcC.toLowerCase()),
        f.db.getOpenDbProvidersForIsrc(isrcB),
        f.db.hasOpenDbSyncDataEntry(isrcA, 'spotify-ko'),
    ]);
    assert.deepEqual(added.map(({ provider }) => provider), ['spotify']);
    assert.deepEqual(removed.map(({ provider }) => provider), ['lrclib']);
    assert.equal(providerFallback, true);
    assert.deepEqual(f.requests, ['manifest.json', 'base.json', 'delta.json', 'current.json']);
    assert.equal(f.db.getOpenDbCacheInfo().entryCount, 4);

    f.db.rememberOpenDbSyncDataEntry(isrcB, 'spotify');
    f.db.rememberOpenDbSyncDataEntry(isrcB, 'spotify');
    assert.equal(await f.db.hasOpenDbSyncDataEntry(isrcB, 'spotify'), true);
    assert.equal(f.db.getOpenDbCacheInfo().entryCount, 5);
    assert.equal(f.db.getOpenDbCacheInfo().distinctIsrcCount, 3);
});

test('OpenDB rebuild invalidates the runtime cache once on success and keeps its last index on failure', async () => {
    const f = fixture();
    await Promise.all([f.db.refreshOpenDbCache(), f.db.refreshOpenDbCache()]);
    assert.equal(f.rebuilds, 1);
    f.payloads.delete('current.json');
    await assert.rejects(f.db.refreshOpenDbCache(), { message: 'OpenDB cache refresh failed' });
    assert.equal(f.rebuilds, 1);
    assert.equal(await f.db.hasOpenDbSyncDataEntry(isrcA, 'lrclib'), true);
    assert.equal(await f.db.hasOpenDbSyncDataEntry(isrcC, 'lrclib'), null);
    assert.equal(f.db.getOpenDbCacheInfo().stale, true);
});
