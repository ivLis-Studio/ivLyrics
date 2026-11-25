import assert from "node:assert/strict";
import test from "node:test";
import { createLyricsCache } from "#ivlyrics/lyrics/createLyricsCache.mjs";
import { DATABASE_BACKUP_RECEIPT_KEY } from "#ivlyrics/core/indexedDbBackupReceipt.mjs";

function createCacheFixture({ clearGate, onInvalidating, onInvalidated } = {}) {
    const stores = new Map(["lyrics", "translations", "metadata", "youtube", "sync", "tmi"]
        .map(name => [name, new Map()]));
    const transactions = [];
    const db = {
        version: 7,
        closed: false,
        close() { this.closed = true; },
        objectStoreNames: { contains: name => stores.has(name) },
        transaction(name, mode) {
            if (Array.isArray(name)) {
                if (mode === "readwrite") {
                    const requests = [];
                    const tx = { objectStore: storeName => ({
                        keyPath: "cacheKey",
                        clear: () => requests.push(() => stores.get(storeName).clear()),
                        get(key) {
                            const request = {};
                            requests.push(() => {
                                request.result = structuredClone(stores.get(storeName).get(key));
                                request.onsuccess();
                            });
                            return request;
                        },
                        put(record) {
                            requests.push(() => stores.get(storeName).set(record.cacheKey, structuredClone(record)));
                        },
                    }) };
                    Promise.resolve(clearGate).then(() => {
                        for (const request of requests) request();
                        tx.oncomplete();
                    });
                    return tx;
                }
                assert.equal(mode, "readonly");
                assert.deepEqual([...name].sort(), [...stores.keys()].sort());
                const schema = {
                    objectStore(storeName) {
                        return {
                            keyPath: ["youtube", "sync"].includes(storeName) ? "trackId" : "cacheKey",
                            indexNames: {
                                contains: index => index === "cachedAt" ||
                                    (index === "trackId" && ["lyrics", "tmi"].includes(storeName)),
                            },
                        };
                    },
                };
                queueMicrotask(() => schema.oncomplete());
                return schema;
            }
            const records = stores.get(name);
            assert.ok(records, `unknown store ${name}`);
            transactions.push({ name, mode });
            let read = false;
            let settled = false;
            const pending = new Map();
            const complete = () => {
                if (settled) return;
                settled = true;
                for (const [key, record] of pending) records.set(key, record);
                tx.oncomplete?.();
            };
            const tx = {
                abort() {
                    settled = true;
                    queueMicrotask(() => tx.onabort?.());
                },
                objectStore(storeName) {
                    assert.equal(storeName, name);
                    return {
                        get(key) {
                            read = true;
                            const request = { result: structuredClone(records.get(key)) };
                            queueMicrotask(() => {
                                request.onsuccess();
                                complete();
                            });
                            return request;
                        },
                        put(record) {
                            assert.equal(mode, "readwrite");
                            pending.set(record.cacheKey ?? record.trackId, structuredClone(record));
                            if (!read) queueMicrotask(complete);
                        },
                    };
                },
            };
            return tx;
        },
    };
    const cache = createLyricsCache({
        getIndexedDB: () => ({
            open(name, version) {
                assert.equal(name, "ivLyricsCache");
                assert.equal(version, 7);
                const request = { result: db };
                queueMicrotask(() => request.onsuccess());
                return request;
            },
        }),
        getPersistentStorage: () => undefined,
        onInvalidating, onInvalidated,
        debug: () => {},
    });
    cache._scheduleSizeEnforcement = () => {};
    return { cache, db, stores, transactions };
}

test("reads existing lyrics cache records and anonymizes old contributor metadata", async () => {
    const { cache, stores } = createCacheFixture();
    const lyrics = stores.get("lyrics");
    const original = {
        synced: [{ text: "Hello" }],
        creator: { name: "Creator" },
        creatorUserHash: "identifier",
        syncData: { authors: [{ name: "Another creator", profilePublic: false }] },
    };
    lyrics.set("track:spotify", { cachedAt: Date.now(), data: original });

    const result = await cache.getLyrics("track", "spotify");
    assert.deepEqual(result.synced, original.synced);
    assert.equal(result.creator.name, "Anonymous");
    assert.equal(result.syncData.authors[0].isPrivate, true);
    assert.equal(result.creatorUserHash, undefined);
    assert.equal(original.creator.name, "Creator");

    assert.equal(await cache.setLyrics("track", "open-lyrics", original), true);
    const record = lyrics.get("track:open-lyrics");
    assert.equal(record.data.creator.identityRedacted, true);
    assert.equal(record.data.creatorUserHash, undefined);
    assert.ok(record.sizeBytes > 0);

    lyrics.get("track:spotify").cachedAt = Date.now() - 366 * 24 * 60 * 60 * 1000;
    assert.equal(await cache.getLyrics("track", "spotify"), null);
});

test("conditional cache writes read and write in one transaction and preserve record privacy", async () => {
    const { cache, stores, transactions } = createCacheFixture();
    const records = stores.get("lyrics");
    const stored = { cachedAt: Date.now(), data: { creator: { name: "Creator" }, synced: [] } };
    records.set("track:lrcred", stored);

    const skipped = await cache.updateLyrics("track", "lrcred", current => {
        assert.equal(current.creator.name, "Anonymous");
        return null;
    });
    assert.equal(skipped, false);
    assert.strictEqual(records.get("track:lrcred"), stored);
    assert.deepEqual(transactions, [{ name: "lyrics", mode: "readwrite" }]);

    const written = await cache.updateLyrics("track", "lrcred", current => ({
        ...current, creatorUserHash: "identifier", synced: [{ text: "Hello" }],
    }));
    assert.equal(written, true);
    assert.deepEqual(records.get("track:lrcred").data.synced, [{ text: "Hello" }]);
    assert.equal(records.get("track:lrcred").data.creatorUserHash, undefined);
    assert.ok(records.get("track:lrcred").sizeBytes > 0);
    assert.equal(transactions.length, 2);
});

test("a provider invalidated while IndexedDB opens cannot enqueue a lyric write", async () => {
    const { cache, stores, transactions } = createCacheFixture();
    let current = true;
    const write = cache.setLyrics("fixture", "spotify", { synced: [{ text: "Obsolete" }] }, () => current);
    current = false;
    assert.equal(await write, false);
    assert.deepEqual(transactions, []);
    assert.equal(stores.get("lyrics").size, 0);
});

test("clearing the cache retires older lyric reads and writes and holds fresh work until disk deletion", async () => {
    const clearGate = Promise.withResolvers();
    const notifications = [];
    const { cache, stores } = createCacheFixture({
        clearGate: clearGate.promise,
        onInvalidating: key => notifications.push(["start", key]),
        onInvalidated: key => notifications.push(["end", key]),
    });
    const old = { synced: [{ text: "Old" }] };
    const fresh = { synced: [{ text: "Fresh" }] };
    await cache.setLyrics("track", "provider", old);
    const oldRead = cache.getLyrics("track", "provider");
    const oldWrite = cache.setLyrics("track", "provider", old);
    const oldUpdate = cache.updateLyrics("track", "provider", () => old);
    const clearing = cache.clearAll();
    assert.deepEqual(await Promise.all([oldRead, oldWrite, oldUpdate]), [null, false, false]);
    assert.deepEqual(notifications, [["start", null]]);

    const read = cache.getLyrics("track", "provider");
    const write = cache.setLyrics("track", "provider", fresh);
    let readFinished = false;
    read.then(() => { readFinished = true; });
    await new Promise(setImmediate);
    assert.equal(readFinished, false);
    assert.deepEqual(stores.get("lyrics").get("track:provider").data, old);

    clearGate.resolve();
    assert.equal(await clearing, true);
    assert.equal(await read, null);
    assert.equal(await write, true);
    assert.deepEqual(await cache.getLyrics("track", "provider"), fresh);
    assert.deepEqual(notifications, [["start", null], ["end", null]]);
});

test("clearing the cache preserves an unresolved database restore receipt", async () => {
    const { cache, stores } = createCacheFixture();
    const metadata = stores.get("metadata");
    const receipt = { id: "interrupted-restore", cacheKey: DATABASE_BACKUP_RECEIPT_KEY };
    metadata.set(DATABASE_BACKUP_RECEIPT_KEY, receipt);
    metadata.set("track:ko", { cacheKey: "track:ko", data: { title: "Old" } });
    assert.equal(await cache.clearAll(), true);
    assert.deepEqual([...metadata], [[DATABASE_BACKUP_RECEIPT_KEY, receipt]]);
});

test("all cache stores abandon stale reads and writes during a clear and admit fresh work after commit", async () => {
    const clearGate = Promise.withResolvers();
    const { cache } = createCacheFixture({ clearGate: clearGate.promise });
    const operations = [
        { type: 'Translation', read: ['track', 'ko', false, 'provider', 'hash'],
            write: value => ['track', 'ko', false, value, 'provider', 'hash'] },
        ...[
            ['CulturalAnnotations', ['track', 'ko', 'en', 'provider', 'hash']],
            ['WordSupplements', ['track', 'ko', 'en', 'reading', 'hash']],
            ['MotionDirection', ['track', 'hash']],
            ['Metadata', ['track', 'ko']],
            ['YouTube', ['track']],
            ['Sync', ['track']],
            ['TMI', ['track', 'ko']],
        ].map(([type, read]) => ({ type, read, write: value => [...read, value] })),
    ];
    const operationsFor = value => operations.map(({ type, read, write }) => ({
        get: () => cache[`get${type}`](...read),
        set: () => cache[`set${type}`](...write(value)),
    }));
    const old = operationsFor({ source: 'old' });
    await Promise.all(old.map(item => item.set()));
    const retired = old.flatMap(item => [item.get(), item.set()]);
    const clearing = cache.clearAll();
    const fresh = operationsFor({ source: 'new' });
    let completed = 0;
    const freshReads = fresh.map(item => item.get().then(value => { completed++; return value; }));
    const freshWrites = fresh.map(item => item.set().then(value => { completed++; return value; }));
    await new Promise(setImmediate);
    const completedBeforeClear = completed;
    clearGate.resolve();
    assert.equal(await clearing, true);
    assert.deepEqual(await Promise.all(retired), operations.flatMap(() => [null, false]));
    assert.equal(completedBeforeClear, 0);
    assert.deepEqual(await Promise.all(freshReads), operations.map(() => null));
    assert.deepEqual(await Promise.all(freshWrites), operations.map(() => true));
    assert.deepEqual(await Promise.all(fresh.map(item => item.get())), operations.map(() => ({ source: 'new' })));
});

test("supplement writes check ownership after opening IndexedDB", async () => {
    const { cache, stores, transactions } = createCacheFixture();
    let current = true;
    const isCurrent = () => current;
    const writes = [
        cache.setTranslation("fixture", "ko", false, { translation: ["old"] }, "provider", "hash", isCurrent),
        cache.setMetadata("fixture", "ko", { translated: { title: "old" } }, isCurrent),
        cache.setCulturalAnnotations("fixture", "ko", "ja", "provider", "hash", { annotations: [] }, isCurrent),
        cache.setWordSupplements("fixture", "ko", "ja", "timed-pronunciation-v1", "hash", { entries: {} }, isCurrent),
    ];
    current = false;
    assert.deepEqual(await Promise.all(writes), [false, false, false, false]);
    assert.deepEqual(transactions, []);
    assert.equal(stores.get("translations").size, 0);
    assert.equal(stores.get("metadata").size, 0);
});

test("research and motion writes check ownership after opening IndexedDB", async () => {
    const { cache, stores, transactions } = createCacheFixture();
    let current = true;
    const isCurrent = () => current;
    const writes = [
        cache.setTMI("fixture", "ko", { title: "Obsolete" }, isCurrent),
        cache.setMotionDirection("fixture", "hash", { shots: [] }, isCurrent),
    ];
    current = false;
    assert.deepEqual(await Promise.all(writes), [false, false]);
    assert.deepEqual(transactions, []);
    assert.equal(stores.get("tmi").size, 0);
    assert.equal(stores.get("translations").size, 0);
});

test("video cache reads old ISRC records, prefers the track record, and rejects stale writes", async () => {
    const { cache } = createCacheFixture();
    const track = "0123456789ABCDEFGHIJKL";
    const isrc = "USUM72300001";
    const legacy = { youtubeVideoId: "legacy" };
    const current = { youtubeVideoId: "current" };
    assert.equal(await cache.setYouTube(isrc, legacy), true);
    assert.deepEqual(await cache.getYouTube(track, isrc), legacy);
    assert.equal(await cache.setYouTube(track, current, { isrc }), true);
    assert.deepEqual(await cache.getYouTube(track, isrc), current);
    assert.equal(await cache.getYouTube(track, "USUM72300002"), null);
    let canWrite = true;
    const write = cache.setYouTube(track, { youtubeVideoId: "obsolete" }, { isrc, canWrite: () => canWrite });
    canWrite = false;
    assert.equal(await write, false);
    assert.deepEqual(await cache.getYouTube(track, isrc), current);
});

test("cache edits commit together and newer automatic results cannot replace them", async context => {
    context.mock.method(console, "error", () => {});
    const { cache, stores, transactions } = createCacheFixture();
    const entries = [
        { isPhonetic: true, sourceHash: "reading", data: { phonetic: ["", ""], userEdited: true } },
        { isPhonetic: false, sourceHash: "meaning", data: { translation: ["new", ""], userEdited: true } },
    ];
    const invalid = [entries[0], { ...entries[1], data: () => {} }];
    assert.equal(await cache.setTranslations("track", "ko", "provider", invalid), false);
    assert.equal(stores.get("translations").size, 0);
    assert.deepEqual(transactions.splice(0), [{ name: "translations", mode: "readwrite" }]);
    assert.equal(await cache.setTranslations("track", "ko", "provider", entries), true);
    assert.deepEqual(transactions.splice(0), [{ name: "translations", mode: "readwrite" }]);
    const automated = { phonetic: ["first", "second"] };
    const auto = { preserveUserEdits: true };
    assert.equal(await cache.setTranslation("track", "ko", true, automated, "provider", "reading", undefined, auto), false);
    assert.deepEqual(await cache.getTranslation("track", "ko", true, "provider", "reading"), entries[0].data);
    assert.deepEqual(await cache.getTranslation("track", "ko", false, "provider", "meaning"), entries[1].data);
    assert.equal(await cache.setTranslation("track", "ko", true, automated, "provider", "reading"), true);
    assert.deepEqual(await cache.getTranslation("track", "ko", true, "provider", "reading"), automated);
});

test("retains the existing cache keys and values for all persisted supplement types", async () => {
    const { cache, stores } = createCacheFixture();
    const cases = [
        ["Translation", "translations", "track:ko:translation", ["track", "ko", false], "hello"],
        ["CulturalAnnotations", "translations", "track:ko:cultural:en:provider:hash", ["track", "ko", "en", "provider", "hash"], []],
        ["WordSupplements", "translations", "track:ko:word:reading:en:hash", ["track", "ko", "en", "reading", "hash"], ["reading"]],
        ["MotionDirection", "translations", "track:motion:hash", ["track", "hash"], { scenes: [] }],
        ["Metadata", "metadata", "track:ko", ["track", "ko"], ""],
        ["YouTube", "youtube", "track", ["track"], { id: "video" }],
        ["Sync", "sync", "track", ["track"], { version: 6 }],
        ["TMI", "tmi", "track:ko", ["track", "ko"], false],
    ];
    for (const [type, store, key, args, value] of cases) {
        assert.equal(await cache[`set${type}`](...args, value), true);
        assert.deepEqual(stores.get(store).get(key).data, value);
        assert.deepEqual(await cache[`get${type}`](...args), value);
    }
    assert.equal(await cache.setTranslation("track", "ko", true, "reading", "provider", "hash"), true);
    assert.equal(stores.get("translations").get("track:ko:phonetic:provider:hash").data, "reading");
    assert.equal(await cache.getTranslation("track", "ko", true, "provider", "hash"), "reading");
    assert.equal(await cache.getTranslation("track", "ko", true, "provider", "other"), null);

    stores.delete("tmi");
    assert.equal(await cache.setTMI("track", "ko", false), false);
    assert.equal(await cache.getTMI("track", "ko"), null);
});

test("subsequent requests reopen IndexedDB after a synchronous failure or version change", async context => {
    context.mock.method(console, "error", () => {});
    const databases = [];
    let openCalls = 0;
    const cache = createLyricsCache({
        getIndexedDB: () => ({
            open() {
                openCalls++;
                if (openCalls === 1) throw new Error("temporarily unavailable");
                const { db } = createCacheFixture();
                databases.push(db);
                const request = { result: db };
                queueMicrotask(() => request.onsuccess());
                return request;
            },
        }),
    });
    await assert.rejects(cache._openDB(), /temporarily unavailable/);
    const [initial, shared] = await Promise.all([cache._openDB(), cache._openDB()]);
    assert.equal(initial, shared);
    assert.equal(openCalls, 2);
    initial.onversionchange();
    assert.equal(initial.closed, true);
    assert.equal(await cache._openDB(), databases[1]);
    assert.equal(openCalls, 3);
});

test("failure to request persistent storage does not hold up cache access", async () => {
    const { db: database } = createCacheFixture();
    let requests = 0;
    const cache = createLyricsCache({
        getIndexedDB: () => ({
            open() {
                const request = { result: database };
                queueMicrotask(() => request.onsuccess());
                return request;
            },
        }),
        getPersistentStorage: () => ({
            persist() {
                requests++;
                throw new Error("unavailable in this context");
            },
        }),
    });
    assert.equal(await cache._openDB(), database);
    assert.equal(await cache._openDB(), database);
    assert.equal(requests, 1);
});
