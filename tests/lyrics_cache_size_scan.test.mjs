import assert from "node:assert/strict";
import test from "node:test";
import { createLyricsCache } from "#ivlyrics/lyrics/createLyricsCache.mjs";

const DAY = 24 * 60 * 60 * 1000;

// A small IndexedDB stand-in: cursors visit records one request at a time and
// a transaction completes once its requests have settled.
function createDatabase(contents) {
    const stores = new Map(Object.entries(contents).map(([name, rows]) => [name, new Map(rows)]));
    const cursorsOpened = new Map();
    const db = {
        objectStoreNames: { contains: name => stores.has(name) },
        transaction(name, mode) {
            const tx = { pending: 0, done: false };
            const settle = () => queueMicrotask(() => {
                if (tx.pending > 0 || tx.done) return;
                tx.done = true;
                tx.oncomplete?.();
            });
            const later = (run) => {
                tx.pending++;
                queueMicrotask(() => {
                    tx.pending--;
                    run();
                    settle();
                });
            };
            tx.abort = () => {};
            tx.objectStore = (storeName) => {
                const records = stores.get(storeName);
                return {
                    openCursor() {
                        cursorsOpened.set(storeName, (cursorsOpened.get(storeName) || 0) + 1);
                        const keys = [...records.keys()].sort();
                        const request = {};
                        let index = 0;
                        const step = () => later(() => {
                            const key = keys[index];
                            request.result = index < keys.length ? {
                                primaryKey: key,
                                value: structuredClone(records.get(key)),
                                continue() { index++; step(); },
                                delete() {
                                    assert.equal(mode, "readwrite");
                                    records.delete(key);
                                },
                            } : null;
                            request.onsuccess?.({ target: request });
                        });
                        step();
                        return request;
                    },
                    get(key) {
                        const request = {};
                        later(() => {
                            request.result = structuredClone(records.get(key));
                            request.onsuccess?.();
                        });
                        return request;
                    },
                    delete(key) {
                        assert.equal(mode, "readwrite");
                        later(() => records.delete(key));
                    },
                };
            };
            settle();
            return tx;
        },
    };
    return { db, stores, cursorsOpened };
}

function createCache(db) {
    const cache = createLyricsCache({
        getIndexedDB: () => null,
        getKeyRange: () => null,
        getPersistentStorage: () => undefined,
        debug: () => {},
    });
    cache._db = db;
    return cache;
}

const record = (cacheKey, cachedAt, sizeBytes) => [cacheKey, { cacheKey, cachedAt, sizeBytes }];

// Every cache write used to queue a scan that read and deserialized all of
// the records on the main thread, about a second for a few thousand.
test("startup cleanup measures the cache in its expiry pass instead of reading it twice", async () => {
    const now = Date.now();
    const { db, stores, cursorsOpened } = createDatabase({
        lyrics: [record("a:spotify", now, 100), record("old:spotify", now - 400 * DAY, 50)],
        translations: [record("a:ko:translation", now, 30)],
    });
    const cache = createCache(db);
    await cache.cleanup();
    assert.deepEqual([...stores.get("lyrics").keys()], ["a:spotify"]);
    assert.deepEqual(Object.fromEntries(cursorsOpened), { lyrics: 1, translations: 1 });
    assert.equal(cache._sizeEstimate, 130);
});

test("cleanup still evicts the oldest records when the cache is over its limit", async () => {
    const now = Date.now();
    const { db, stores, cursorsOpened } = createDatabase({
        lyrics: [record("oldest", now - 3000, 100), record("newer", now - 2000, 50)],
        translations: [record("newest", now - 1000, 30)],
    });
    const cache = createCache(db);
    cache.MAX_TOTAL_BYTES = 120;
    await cache.cleanup();
    assert.deepEqual([...stores.get("lyrics").keys()], ["newer"]);
    assert.deepEqual([...stores.get("translations").keys()], ["newest"]);
    assert.deepEqual(Object.fromEntries(cursorsOpened), { lyrics: 2, translations: 2 });
    assert.equal(cache._sizeEstimate, 80);
});

test("writes queue a size scan only once they could reach the limit", (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const cache = createCache(null);
    let scans = 0;
    cache._enforceSizeLimit = async () => { scans++; };
    cache.MAX_TOTAL_BYTES = 1000;
    // Nothing measured yet: scan as before.
    cache._scheduleSizeEnforcement(10);
    t.mock.timers.tick(1000);
    assert.equal(scans, 1);
    cache._sizeEstimate = 900;
    cache._scheduleSizeEnforcement(60);
    t.mock.timers.tick(1000);
    assert.equal(scans, 1);
    assert.equal(cache._sizeEstimate, 960);
    cache._scheduleSizeEnforcement(60);
    t.mock.timers.tick(1000);
    assert.equal(scans, 2);
    // An unknown size makes the total unknown again.
    cache._sizeEstimate = 0;
    cache._scheduleSizeEnforcement(undefined);
    t.mock.timers.tick(1000);
    assert.equal(scans, 3);
    assert.equal(cache._sizeEstimate, null);
});

test("a size scan counts writes made while it reads", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const { db } = createDatabase({ lyrics: [record("a", Date.now(), 100)] });
    const cache = createCache(db);
    const scan = cache._enforceSizeLimit();
    cache._scheduleSizeEnforcement(40);
    await scan;
    assert.equal(cache._sizeEstimate, 140);
    // The write before the first measurement still queued its usual scan.
    assert.ok(cache._sizeEnforcementTimer);
});
