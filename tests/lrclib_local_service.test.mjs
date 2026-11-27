import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import test from 'node:test';
import vm from 'node:vm';
import { bundleFixtureImports } from './fixtures/legacy-page-source.mjs';

const source = bundleFixtureImports(
    'import { installLocalLrclibDatabase } from "#ivlyrics/providers/lyrics/LrclibLocalDatabase.js";\n'
    + 'installLocalLrclibDatabase(window, "/* offline bundled SQL fixture */");',
    'fixtureLocalDatabaseModules',
);
const sqlite = Buffer.concat([Buffer.from('SQLite format 3\0'), Buffer.alloc(4096 - 16)]);
const candidate = { id: 1, trackName: 'Song', artistName: 'Artist', albumName: 'Album', duration: 180,
    instrumental: false, plainLyrics: 'private lyrics', syncedLyrics: '[00:01]private lyrics', lyricsfile: null };
const file = (name = 'official.sqlite3', bytes = sqlite, lastModified = 100) => new File([bytes], name, { lastModified });
const compressed = () => file('official.sqlite3.gz', gzipSync(sqlite));
const latch = () => {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
};
const flush = async () => { for (let i = 0; i < 5; i++) await new Promise(setImmediate); };
const memory = () => ({ record: null, pending: [], files: new Map(), hasStore: false, hasDirectory: false });

function mutationLocks() {
    const events = [];
    const waiting = [];
    let held = false;
    function grant() {
        if (held || !waiting.length) return;
        const entry = waiting.shift();
        entry.signal?.removeEventListener('abort', entry.abort);
        held = true;
        events.push(['grant', entry.name]);
        void Promise.resolve().then(() => entry.callback({ name: entry.name, mode: 'exclusive' }))
            .then(entry.resolve, entry.reject).finally(() => {
                events.push(['release', entry.name]);
                held = false;
                grant();
            });
    }
    return {
        events,
        request(name, { mode, signal }, callback) {
            assert.equal(name, 'ivLyricsLocalLrclib');
            assert.equal(mode, 'exclusive');
            events.push(['request', name]);
            return new Promise((resolve, reject) => {
                if (signal?.aborted) { reject(new DOMException('Canceled', 'AbortError')); return; }
                const entry = { name, signal, callback, resolve, reject };
                entry.abort = () => {
                    waiting.splice(waiting.indexOf(entry), 1);
                    reject(new DOMException('Canceled', 'AbortError'));
                };
                signal?.addEventListener('abort', entry.abort, { once: true });
                waiting.push(entry);
                grant();
            });
        }
    };
}

// These fixtures test coordinator boundaries, not the independently bundled SQL
// engine. IDB writes are staged until transaction completion, including failures
// after request.onsuccess. Real gzip streams exercise streaming/backpressure.
function setup(options = {}) {
    const persisted = options.persisted || memory();
    const events = [];
    const workers = [];
    const timers = new Map();
    const scheduled = [];
    let nextTimer = 0;
    let now = 0;
    let opens = 0;
    let storageCalls = 0;
    const fault = { commit: false, pending: false };
    const idb = {
        open() {
            opens++;
            const request = {};
            const db = {
                objectStoreNames: { contains: () => persisted.hasStore },
                createObjectStore() { persisted.hasStore = true; }, close() {},
                transaction(storeName, mode) {
                    assert.equal(storeName, 'references');
                    let aborted = false;
                    let finished = false;
                    let started = false;
                    let scheduledPump = false;
                    let snapshot;
                    let release;
                    const requests = [];
                    const mutations = new Map();
                    const preceding = persisted.transactionTail || Promise.resolve();
                    persisted.transactionTail = new Promise(done => { release = done; });
                    function schedulePump() {
                        if (!started || finished || scheduledPump) return;
                        scheduledPump = true;
                        queueMicrotask(() => { scheduledPump = false; pump(); });
                    }
                    function pump() {
                        if (finished) return;
                        if (aborted) {
                            finished = true;
                            tx.onabort?.();
                            release();
                            return;
                        }
                        const next = requests.shift();
                        if (next) {
                            const { kind, value, key, operation } = next;
                            if (kind !== 'get') {
                                mutations.set(key, kind === 'delete' ? undefined : value);
                                if (kind === 'delete') snapshot.delete(key);
                                else snapshot.set(key, value);
                            }
                            operation.result = kind === 'get' ? snapshot.get(key) : key;
                            operation.onsuccess?.();
                            options.afterRequest?.(kind, key, operation.result, tx);
                            schedulePump();
                            return;
                        }
                        if ((fault.commit && mutations.has('active')) || (fault.pending && mutations.has('pending'))) {
                            if (mutations.has('active')) fault.commit = false;
                            if (mutations.has('pending')) fault.pending = false;
                            tx.error = new Error('commit failed');
                            tx.abort();
                            return;
                        }
                        finished = true;
                        if (mutations.has('active')) {
                            persisted.record = mutations.get('active') ?? null;
                            events.push(['commit', persisted.record?.opfsName || persisted.record?.kind]);
                        }
                        if (mutations.has('pending')) {
                            persisted.pending = mutations.get('pending') || [];
                            events.push(['journal', persisted.pending.map(item => ({ ...item }))]);
                        }
                        if (mutations.has('active')) options.afterCommit?.(persisted.record);
                        tx.oncomplete?.();
                        release();
                    }
                    const tx = {
                        abort() { if (!finished) { aborted = true; schedulePump(); } },
                        objectStore() {
                            function perform(kind, value, key) {
                                assert.ok(['active', 'pending'].includes(key));
                                if (kind !== 'get') assert.equal(mode, 'readwrite');
                                const operation = {};
                                requests.push({ kind, value, key, operation });
                                schedulePump();
                                return operation;
                            }
                            return { get: key => perform('get', null, key),
                                put: (value, key) => perform('put', value, key), delete: key => perform('delete', null, key) };
                        }
                    };
                    void preceding.then(() => {
                        snapshot = new Map([['active', persisted.record], ['pending', persisted.pending || []]]);
                        started = true;
                        schedulePump();
                    });
                    return tx;
                }
            };
            queueMicrotask(() => {
                request.result = db;
                if (!persisted.hasStore) request.onupgradeneeded?.();
                request.onsuccess?.();
            });
            return request;
        }
    };
    const ownDirectory = {
        async getFileHandle(name, { create = false } = {}) {
            if (!persisted.files.has(name)) {
                if (!create) throw new DOMException('Missing', 'NotFoundError');
                persisted.files.set(name, new Uint8Array());
                events.push(['create', name]);
            }
            return {
                async getFile() { return file(name, persisted.files.get(name)); },
                async createWritable() {
                    const chunks = [];
                    return {
                        async write(chunk) {
                            events.push(['write', name, chunk.byteLength]);
                            await options.onWrite?.(chunk);
                            chunks.push(Uint8Array.from(chunk));
                        },
                        async close() {
                            persisted.files.set(name, Buffer.concat(chunks));
                            events.push(['close', name]);
                        },
                        async abort() { events.push(['abort', name]); }
                    };
                }
            };
        },
        async removeEntry(name) {
            events.push(['remove', name]);
            await options.onRemove?.(name);
            if (!persisted.files.delete(name)) throw new DOMException('Missing', 'NotFoundError');
        }
    };
    const storage = {
        async getDirectory() {
            storageCalls++;
            return {
                async getDirectoryHandle(name, { create = false } = {}) {
                    assert.equal(name, 'ivlyrics-lrclib-local');
                    if (!persisted.hasDirectory && !create) throw new DOMException('Missing', 'NotFoundError');
                    persisted.hasDirectory = true;
                    return ownDirectory;
                }
            };
        },
        async estimate() { return options.estimate ? options.estimate() : { quota: 1e9, usage: 0 }; }
    };
    class Worker {
        constructor(url) { this.url = url; this.terminated = false; this.messages = []; workers.push(this); }
        terminate() { this.terminated = true; events.push(['terminate', workers.indexOf(this)]); }
        reply(id, result, error) { if (!this.terminated) this.onmessage?.({ data: { id, result, error } }); }
        postMessage(message) {
            this.messages.push(message);
            events.push([message.action, message.file?.name]);
            if (options.onPost?.(message, this)) return;
            queueMicrotask(() => {
                if (message.action === 'open' && options.rejectOpen?.(message.file)) {
                    this.reply(message.id, undefined, { code: 'invalidDatabase', message: 'private detail' });
                } else this.reply(message.id, message.action === 'open' ? { size: message.file.size } : candidate);
            });
        }
    }
    const root = {
        indexedDB: idb, navigator: { storage, ...(options.locks ? { locks: options.locks } : {}) }, Worker, File, Blob, crypto: webcrypto,
        AbortController, DecompressionStream, TransformStream,
        URL: {
            createObjectURL() { events.push(['blob']); return `blob:fixture-${events.length}`; },
            revokeObjectURL(url) { events.push(['revoke', url]); }
        },
        setTimeout(callback, ms) {
            scheduled.push(ms);
            const id = options.manualTimers ? ++nextTimer : setTimeout(() => { timers.delete(id); callback(); }, ms);
            timers.set(id, { callback, deadline: now + ms });
            return id;
        },
        clearTimeout(id) { timers.delete(id); if (!options.manualTimers) clearTimeout(id); },
        fetch() { assert.fail('Coordinator must not fetch'); },
        localStorage: { setItem() { assert.fail('No settings persistence'); } }
    };
    Object.assign(root, options.root);
    const Clock = options.manualTimers ? class extends Date { static now() { return now; } } : Date;
    vm.runInNewContext(source, { window: root, Date: Clock, console });
    return { root, api: root.IvLyricsLocalLrclib, persisted, workers, events, fault, timers, scheduled,
        get opens() { return opens; }, get storageCalls() { return storageCalls; },
        advance(ms) {
            now += ms;
            for (const [id, timer] of [...timers]) {
                if (timer.deadline <= now && timers.has(id)) { timers.delete(id); timer.callback(); }
            }
        }
    };
}

test('unused service and subscription schedule no work; snapshots cannot mutate state', () => {
    const h = setup();
    const snapshot = h.api.getState();
    assert.equal(snapshot.phase, 'empty');
    snapshot.phase = 'ready';
    const unsubscribe = h.api.subscribe(value => { value.name = 'changed'; });
    unsubscribe();
    assert.equal(h.api.getState().name, '');
    assert.equal(h.api.getCacheVersion(), '');
    assert.equal(h.opens, 0);
    assert.equal(h.storageCalls, 0);
    assert.equal(h.workers.length, 0);
    assert.equal(h.scheduled.length, 0);
});

test('SQLite uses the original File reference and only bounded header reads; raw records stay out of metadata/state', async () => {
    const h = setup();
    const original = file();
    original.arrayBuffer = () => assert.fail('Whole database read');
    const slice = original.slice.bind(original);
    original.slice = (start, end) => { assert.deepEqual([start, end], [0, 16]); return slice(start, end); };
    await h.api.importFile(original);
    assert.equal(h.workers[0].messages[0].file, original);
    const info = { title: 'Song', artist: 'Artist' };
    assert.equal(await h.api.lookup(info), candidate);
    assert.equal(h.workers[0].messages[1].info, info);
    assert.equal(h.api.getState().phase, 'ready');
    assert.match(h.api.getCacheVersion(), /^[a-f0-9]{32}$/);
    assert.equal(JSON.stringify(h.persisted.record).includes('lyrics'), false);
    assert.equal(JSON.stringify(h.api.getState()).includes('lyrics'), false);
    assert.equal(h.storageCalls, 0);
    assert.equal(h.timers.size, 0);
});

test('gzip streams to a uniquely owned OPFS file with progress and persists only a reference', async () => {
    const h = setup();
    const original = compressed();
    original.arrayBuffer = () => assert.fail('Whole compressed database read');
    const states = [];
    const unsubscribe = h.api.subscribe(value => states.push(value));
    await h.api.importFile(original);
    unsubscribe();
    assert.equal(h.persisted.record.kind, 'opfs');
    assert.match(h.persisted.record.opfsName, /^ivlyrics-lrclib-[a-f0-9]{32}\.sqlite3$/);
    assert.deepEqual(h.persisted.files.get(h.persisted.record.opfsName), sqlite);
    assert.equal(h.workers[0].messages[0].file.size, sqlite.length);
    assert.equal(h.api.getState().bytesWritten, sqlite.length);
    assert.equal(h.api.getState().size, sqlite.length);
    assert.equal(h.api.getState().name, original.name);
    assert.ok(states.some(value => value.phase === 'importing'));
    assert.ok(states.every(value => value.progress >= 0 && value.progress <= 1));
    assert.equal(h.persisted.record.handle, undefined);
    const restored = setup({ persisted: h.persisted });
    await restored.api.connect();
    assert.equal(restored.api.getState().phase, 'ready');
    assert.equal(restored.api.getCacheVersion(), h.api.getCacheVersion());
});

test('invalid headers, malformed gzip, and non-SQLite gzip payloads leave no temporary file', async () => {
    for (const input of [file('bad.sqlite3', Buffer.alloc(30)), file('bad.gz', Buffer.from([0x1f, 0x8b, 0, 0])),
        file('text.gz', gzipSync('not a database'))]) {
        const h = setup();
        await assert.rejects(h.api.importFile(input), { code: 'invalidFile' });
        assert.equal(h.workers.length, 0);
        assert.equal(h.persisted.files.size, 0);
        assert.equal(h.persisted.record, null);
    }
});

test('a non-SQLite gzip payload is rejected before writing its expanded contents', async () => {
    const h = setup();
    const input = file('not-sqlite.gz', gzipSync(Buffer.alloc(2 * 1024 * 1024)));
    await assert.rejects(h.api.importFile(input), { code: 'invalidFile' });
    assert.equal(h.events.filter(event => event[0] === 'write').length, 0);
    assert.equal(h.workers.length, 0);
    assert.equal(h.persisted.files.size, 0);
    assert.equal(h.persisted.record, null);
});

test('schema validation failure preserves the previous worker, revision, metadata, and OPFS file', async () => {
    const h = setup({ rejectOpen: input => input.name === 'bad-schema.sqlite3' });
    await h.api.importFile(compressed());
    const previous = h.persisted.record;
    await assert.rejects(h.api.importFile(file('bad-schema.sqlite3')), { code: 'invalidDatabase' });
    assert.equal(h.persisted.record, previous);
    assert.equal(h.api.getCacheVersion(), previous.revision);
    assert.ok(h.persisted.files.has(previous.opfsName));
    assert.equal(h.workers[0].terminated, false);
    assert.equal(h.workers[1].terminated, true);
    assert.equal(h.api.getState().available, true);
    assert.equal(h.api.getState().name, 'official.sqlite3.gz');
    assert.equal(h.api.getState().errorCode, 'invalidDatabase');
    assert.equal(await h.api.lookup({}), candidate);
});

test('last-good local reads continue while a replacement is validating and after cancel', async () => {
    const validating = latch();
    const h = setup({
        onPost(message) {
            if (message.action !== 'open' || message.file.name !== 'replacement.sqlite3') return false;
            validating.resolve();
            return true;
        },
    });
    await h.api.importFile(file('original.sqlite3'));
    const revision = h.api.getCacheVersion();
    const replacing = assert.rejects(h.api.importFile(file('replacement.sqlite3')), { code: 'canceled' });
    await validating.promise;
    assert.equal(h.api.getState().phase, 'opening');
    assert.equal(h.api.getState().available, true);
    assert.equal(h.api.getCacheVersion(), revision);
    assert.equal(await h.api.lookup({}), candidate);
    assert.equal(h.workers[0].messages.filter(message => message.action === 'lookup').length, 1);

    h.api.cancelImport();
    await replacing;
    assert.equal(h.api.getState().name, 'original.sqlite3');
    assert.equal(h.api.getState().errorCode, 'canceled');
    assert.equal(h.api.getCacheVersion(), revision);
    assert.equal(await h.api.lookup({}), candidate);
    assert.equal(h.workers[0].terminated, false);
});

test('the committed replacement serves reads before cleanup and drops older pending results', async () => {
    const querying = latch();
    const removing = latch();
    const finishCleanup = latch();
    let originalWorker, previousFile;
    const nextCandidate = { ...candidate, id: 2 };
    const h = setup({
        onPost(message, worker) {
            if (message.action !== 'lookup') return false;
            if (worker === originalWorker) {
                querying.resolve();
                return true;
            }
            worker.reply(message.id, nextCandidate);
            return true;
        },
        async onRemove(name) {
            if (name !== previousFile) return;
            removing.resolve();
            await finishCleanup.promise;
        },
    });
    await h.api.importFile(compressed());
    previousFile = h.persisted.record.opfsName;
    originalWorker = h.workers[0];
    const previousLookup = h.api.lookup({});
    await querying.promise;
    const installing = h.api.importFile(compressed());
    await removing.promise;
    try {
        assert.equal(await previousLookup, null);
        assert.equal(originalWorker.terminated, true);
        assert.notEqual(h.persisted.record.opfsName, previousFile);
        assert.equal(h.api.getCacheVersion(), h.persisted.record.revision);
        assert.equal(await h.api.lookup({}), nextCandidate);
        assert.equal(h.api.getState().phase, 'ready');
    } finally {
        finishCleanup.resolve();
        await installing;
    }
    assert.equal(h.persisted.files.has(previousFile), false);
});

test('transaction abort after request success cleans only the new OPFS file', async () => {
    const h = setup();
    await h.api.importFile(compressed());
    const previous = h.persisted.record;
    h.fault.commit = true;
    await assert.rejects(h.api.importFile(compressed()), { code: 'unavailable' });
    assert.equal(h.persisted.record, previous);
    assert.deepEqual([...h.persisted.files.keys()], [previous.opfsName]);
    assert.equal(h.workers[0].terminated, false);
    assert.equal(h.workers[1].terminated, true);
});

test('successful replacement validates and commits before deleting the previous owned file', async () => {
    const h = setup();
    await h.api.importFile(compressed());
    const previous = h.persisted.record;
    await h.api.importFile(compressed());
    assert.notEqual(h.api.getCacheVersion(), previous.revision);
    const committed = h.events.findIndex(value => value[0] === 'commit' && value[1] === h.persisted.record.opfsName);
    const removed = h.events.findIndex(value => value[0] === 'remove' && value[1] === previous.opfsName);
    assert.ok(committed >= 0 && removed > committed);
    assert.equal(h.workers[0].terminated, true);
    assert.deepEqual([...h.persisted.files.keys()], [h.persisted.record.opfsName]);
});

test('external abort during a backpressured write keeps the original DB and removes the new temp', async () => {
    const writing = latch();
    const release = latch();
    const h = setup({ onWrite: async () => { writing.resolve(); await release.promise; } });
    await h.api.importFile(file());
    const previous = h.persisted.record;
    const controller = new AbortController();
    const importing = h.api.importFile(compressed(), { signal: controller.signal });
    const rejected = assert.rejects(importing, { code: 'canceled' });
    await writing.promise;
    controller.abort();
    release.resolve();
    await rejected;
    assert.equal(h.persisted.record, previous);
    assert.equal(h.persisted.files.size, 0);
    assert.equal(h.workers[0].terminated, false);
    assert.equal(h.api.getState().errorCode, 'canceled');
});

test('cancelImport terminates candidate validation or restoration without exposing an uncommitted database', async () => {
    const opened = latch();
    const h = setup({ onPost: message => { if (message.action === 'open') { opened.resolve(); return true; } } });
    const importing = assert.rejects(h.api.importFile(compressed()), { code: 'canceled' });
    await opened.promise;
    assert.equal(await h.api.lookup({}), null);
    h.api.cancelImport();
    await importing;
    assert.equal(h.workers[0].terminated, true);
    assert.equal(h.persisted.files.size, 0);

    const base = setup();
    await base.api.importFile(compressed());
    const restoringOpen = latch();
    const restored = setup({ persisted: base.persisted, onPost: () => { restoringOpen.resolve(); return true; } });
    const connecting = restored.api.connect();
    await restoringOpen.promise;
    restored.api.cancelImport();
    await connecting;
    assert.equal(restored.api.getState().errorCode, 'canceled');
    assert.equal(restored.workers[0].terminated, true);
    assert.ok(restored.persisted.files.has(base.persisted.record.opfsName));
});

test('handle restore preserves revision for unchanged mtime, refreshes same-size changes and legacy metadata', async () => {
    let current = file();
    let requested = 0;
    const handle = { kind: 'file', queryPermission: async () => 'granted', getFile: async () => current,
        requestPermission() { requested++; assert.fail('Restore cannot prompt'); } };
    const first = setup();
    await first.api.importFile(current, { handle });
    const originalRevision = first.api.getCacheVersion();
    assert.equal(first.persisted.record.lastModified, 100);
    const unchanged = setup({ persisted: first.persisted });
    await unchanged.api.connect();
    assert.equal(unchanged.api.getCacheVersion(), originalRevision);
    current = file('official.sqlite3', sqlite, 200);
    const changed = setup({ persisted: first.persisted });
    await changed.api.connect();
    assert.equal(changed.api.getState().phase, 'ready');
    assert.notEqual(changed.api.getCacheVersion(), originalRevision);
    assert.equal(first.persisted.record.lastModified, 200);
    const changedRevision = changed.api.getCacheVersion();
    delete first.persisted.record.lastModified;
    const legacy = setup({ persisted: first.persisted });
    await legacy.api.connect();
    assert.notEqual(legacy.api.getCacheVersion(), changedRevision);
    assert.equal(requested, 0);
});

test('denied/prompt permissions and missing original handle are distinguished without prompting', async () => {
    for (const permission of ['denied', 'prompt', 'missing']) {
        const first = setup();
        const handle = { kind: 'file', queryPermission: async () => permission === 'missing' ? 'granted' : permission,
            getFile: async () => { throw new DOMException('Removed original', 'NotFoundError'); },
            requestPermission: () => assert.fail('Unexpected prompt') };
        await first.api.importFile(file(), { handle });
        const next = setup({ persisted: first.persisted });
        await next.api.connect();
        assert.equal(next.api.getState().errorCode, permission === 'missing' ? 'unavailable' : 'permission');
        assert.equal(next.workers.length, 0);
    }
});

test('plain File references require reselection after restart and never persist the File', async () => {
    const first = setup();
    await first.api.importFile(file());
    assert.equal(first.persisted.record.file, undefined);
    const next = setup({ persisted: first.persisted });
    await next.api.connect();
    assert.equal(next.api.getState().phase, 'permission');
    assert.equal(next.workers.length, 0);
});

test('quota preflight and streaming checks reject noSpace without replacing the active record', async () => {
    for (const quota of [0, 10]) {
        const h = setup({ estimate: () => ({ quota, usage: 0 }) });
        await h.api.importFile(file());
        const previous = h.persisted.record;
        await assert.rejects(h.api.importFile(compressed()), { code: 'noSpace' });
        assert.equal(h.persisted.record, previous);
        assert.equal(h.persisted.files.size, 0);
        assert.equal(h.workers.length, 1);
    }
});

test('a retired queued lookup skips SQLite while the active query and session finish normally', async () => {
    const querying = latch();
    let heldRequest;
    const h = setup({
        onPost(message, worker) {
            if (message.action !== 'lookup' || message.info.uri !== 'active') return false;
            heldRequest = () => worker.reply(message.id, candidate);
            querying.resolve();
            return true;
        }
    });
    await h.api.importFile(file());
    const active = h.api.lookup({ uri: 'active' });
    await querying.promise;
    const controller = new AbortController();
    const queued = h.api.lookup({ uri: 'retired' }, { signal: controller.signal });
    const next = h.api.lookup({ uri: 'next' });
    controller.abort();
    assert.equal(await queued, null);
    heldRequest();
    assert.equal(await active, candidate);
    assert.equal(await next, candidate);
    assert.deepEqual(h.workers[0].messages.filter(message => message.action === 'lookup')
        .map(message => message.info.uri), ['active', 'next']);
    assert.equal(h.workers.length, 1);
    assert.equal(h.workers[0].terminated, false);
    assert.equal(h.api.getState().phase, 'ready');
    assert.equal(h.timers.size, 0);
});

test('lookup timeout includes queue time, terminates the worker, and can reopen through connect', async () => {
    let hang = true;
    const h = setup({ manualTimers: true, onPost: message => message.action === 'lookup' && hang });
    await h.api.importFile(file());
    const first = h.api.lookup({});
    const queued = h.api.lookup({});
    await flush();
    h.advance(3000);
    assert.equal(await first, null);
    assert.equal(await queued, null);
    await flush();
    assert.equal(h.workers[0].terminated, true);
    assert.equal(h.workers[0].messages.filter(value => value.action === 'lookup').length, 1);
    assert.equal(h.api.getState().errorCode, 'unavailable');
    hang = false;
    await h.api.connect();
    assert.equal(await h.api.lookup({}), candidate);
    assert.equal(h.timers.size, 0);
});

test('remove/disconnect forget references and delete only the exact owned cache, never original handles', async () => {
    const h = setup();
    await h.api.importFile(compressed());
    h.persisted.files.set('unrelated.sqlite3', sqlite);
    await h.api.remove();
    assert.equal(h.persisted.record, null);
    assert.deepEqual([...h.persisted.files.keys()], ['unrelated.sqlite3']);
    assert.equal(h.api.getState().phase, 'empty');
    assert.equal(h.api.getCacheVersion(), '');
    const handle = { kind: 'file', getFile: async () => file(), remove: () => assert.fail('Source deleted') };
    await h.api.importFile(file(), { handle });
    await h.api.disconnect();
    assert.equal(h.api.getState().phase, 'empty');
});

test('picker invokes native selection immediately and fallback input cleans itself up', async () => {
    const native = setup();
    let picked = false;
    native.root.showOpenFilePicker = async options => {
        picked = true;
        assert.equal(options.multiple, false);
        return [{ kind: 'file', getFile: async () => file() }];
    };
    const selecting = native.api.pickFile();
    assert.equal(picked, true);
    await selecting;
    assert.equal(native.api.getState().phase, 'ready');

    const fallback = setup();
    const listeners = new Map();
    let removed = 0;
    fallback.root.document = { body: { appendChild() {} }, createElement(type) {
        assert.equal(type, 'input');
        return { style: {}, files: [file()],
            addEventListener: (type, fn) => listeners.set(type, fn),
            removeEventListener: type => listeners.delete(type), remove() { removed++; },
            click() { queueMicrotask(() => listeners.get('change')()); } };
    } };
    await fallback.api.pickFile();
    assert.equal(fallback.api.getState().phase, 'ready');
    assert.equal(removed, 1);
    assert.equal(listeners.size, 0);
});

test('the pending import commits before OPFS creation and activation consumes it atomically', async () => {
    let h;
    h = setup({ afterCommit: record => {
        if (record?.kind === 'opfs') {
            assert.equal(h.persisted.pending.some(item => item.opfsName === record.opfsName), false);
        }
    } });
    await h.api.importFile(compressed());
    const created = h.events.findIndex(event => event[0] === 'create');
    const journaled = h.events.findIndex(event => event[0] === 'journal'
        && event[1].some(item => item.opfsName === h.persisted.record.opfsName && item.status === 'importing'));
    assert.ok(journaled >= 0 && journaled < created);
    assert.equal(h.persisted.pending.length, 0);
});

test('restart reclaims an abandoned closed import, preserves the active DB, and ignores foreign names', async () => {
    const locks = mutationLocks();
    const base = setup({ locks });
    await base.api.importFile(compressed());
    const previous = base.persisted.record;
    const opened = latch();
    const interrupted = setup({ persisted: base.persisted, locks, onPost: message => {
        if (message.action === 'open') { opened.resolve(); return true; }
    } });
    const importing = assert.rejects(interrupted.api.importFile(compressed()), { code: 'canceled' });
    await opened.promise;
    const abandoned = interrupted.persisted.pending.find(item => item.status === 'importing');
    assert.ok(abandoned);
    assert.deepEqual(interrupted.persisted.files.get(abandoned.opfsName), sqlite, 'the output was already closed');
    // Capture exactly the durable state left by a terminated context, then
    // cancel the live fixture so no worker promise/timer survives this test.
    const crashed = { ...memory(), record: previous, pending: [...interrupted.persisted.pending],
        files: new Map(interrupted.persisted.files), hasStore: true, hasDirectory: true };
    interrupted.api.cancelImport();
    await importing;
    const foreignNames = ['original.sqlite3', `ivlyrics-lrclib-${'a'.repeat(31)}.sqlite3`,
        `ivlyrics-lrclib-${'A'.repeat(32)}.sqlite3`, `../ivlyrics-lrclib-${'b'.repeat(32)}.sqlite3`];
    for (const name of foreignNames) {
        crashed.files.set(name, sqlite);
        crashed.pending.push({ kind: 'opfs', opfsName: name, status: 'cleanup' });
    }
    crashed.pending.push({ kind: 'handle', opfsName: `ivlyrics-lrclib-${'c'.repeat(32)}.sqlite3`, status: 'cleanup' });
    crashed.files.set(`ivlyrics-lrclib-${'c'.repeat(32)}.sqlite3`, sqlite);
    crashed.pending.push({ kind: 'opfs', opfsName: previous.opfsName, status: 'importing' });
    const restored = setup({ persisted: crashed, locks });
    await restored.api.connect();
    assert.equal(restored.api.getState().phase, 'ready');
    assert.equal(restored.api.getCacheVersion(), previous.revision);
    assert.equal(await restored.api.lookup({}), candidate);
    assert.equal(crashed.files.has(abandoned.opfsName), false);
    assert.equal(crashed.files.has(previous.opfsName), true);
    assert.ok(foreignNames.every(name => crashed.files.has(name)));
    assert.equal(crashed.files.has(`ivlyrics-lrclib-${'c'.repeat(32)}.sqlite3`), true);
    assert.deepEqual(restored.events.filter(event => event[0] === 'remove').map(event => event[1]), [abandoned.opfsName]);
    await restored.api.connect();
    assert.equal(crashed.files.has(previous.opfsName), true, 'repeated recovery never deletes the active file');
});

test('failed owned-file cleanup remains durable after removal and retries on restart', async () => {
    const locks = mutationLocks();
    const h = setup({ locks, onRemove: () => { throw new DOMException('Busy', 'NoModificationAllowedError'); } });
    await h.api.importFile(compressed());
    const previous = h.persisted.record;
    await h.api.remove();
    assert.equal(h.persisted.record, null);
    assert.equal(h.api.getState().phase, 'empty');
    assert.equal(h.persisted.files.has(previous.opfsName), true);
    assert.equal(h.persisted.pending.length, 1);
    assert.equal(h.persisted.pending[0].status, 'cleanup');
    const restored = setup({ persisted: h.persisted, locks });
    await restored.api.connect();
    assert.equal(restored.api.getState().phase, 'empty');
    assert.equal(h.persisted.files.size, 0);
    assert.equal(h.persisted.pending.length, 0);
});

test('stale contexts replace and remove the actual persisted predecessor with and without Web Locks', async t => {
    for (const supported of [true, false]) await t.test(supported ? 'Web Locks' : 'no Web Locks', async () => {
        const locks = supported ? mutationLocks() : undefined;
        const first = setup({ locks });
        await first.api.importFile(compressed());
        const stale = first.persisted.record;
        const second = setup({ persisted: first.persisted, locks });
        await second.api.connect();
        assert.equal(second.api.getCacheVersion(), stale.revision);
        await first.api.importFile(compressed());
        const middle = first.persisted.record;
        assert.notEqual(middle.opfsName, stale.opfsName);
        assert.equal(second.api.getCacheVersion(), stale.revision, 'the other context still holds A');
        await second.api.importFile(compressed());
        const latest = first.persisted.record;
        assert.notEqual(latest.opfsName, middle.opfsName);
        assert.deepEqual([...first.persisted.files.keys()], [latest.opfsName]);
        assert.equal(first.api.getCacheVersion(), middle.revision, 'the removing context still holds B');
        await first.api.remove();
        assert.equal(first.persisted.record, null);
        assert.equal(first.persisted.files.size, 0);
        assert.equal(first.persisted.pending.length, 0);
        if (locks) {
            assert.equal(locks.events.filter(event => event[0] === 'grant').length, 5);
        }
    });
});

test('competing imports serialize with Web Locks and protect live pending output without them', async t => {
    for (const supported of [true, false]) await t.test(supported ? 'Web Locks' : 'no Web Locks', async () => {
        const locks = supported ? mutationLocks() : undefined;
        const base = setup({ locks });
        await base.api.importFile(compressed());
        const previous = base.persisted.record;
        const writing = latch();
        const release = latch();
        const first = setup({ persisted: base.persisted, locks, onWrite: async () => {
            writing.resolve();
            await release.promise;
        } });
        const second = setup({ persisted: base.persisted, locks });
        const firstImport = first.api.importFile(compressed());
        await writing.promise;
        const inFlight = base.persisted.pending.find(item => item.status === 'importing').opfsName;
        const secondImport = second.api.importFile(compressed());
        try {
            if (supported) {
                await flush();
                assert.equal(second.events.some(event => event[0] === 'create'), false);
                assert.equal(second.api.getState().phase, 'opening');
                assert.equal(base.persisted.record, previous);
                assert.equal(locks.events.filter(event => event[0] === 'request').length, 3);
                assert.equal(locks.events.filter(event => event[0] === 'grant').length, 2);
            } else {
                await secondImport;
                assert.equal(base.persisted.files.has(inFlight), true, 'recovery must not delete another live import');
                assert.equal(base.persisted.pending.some(item => item.opfsName === inFlight && item.status === 'importing'), true);
            }
        } finally {
            release.resolve();
            await Promise.all([firstImport, secondImport]);
        }
        assert.deepEqual([...base.persisted.files.keys()], [base.persisted.record.opfsName]);
        assert.equal(base.persisted.pending.length, 0);
    });
});

test('canceling a queued Web Lock request leaves the last-good database and releases the local queue', async () => {
    const locks = mutationLocks();
    const h = setup({ locks });
    await h.api.importFile(compressed());
    const previous = h.persisted.record;
    const holding = latch();
    const release = latch();
    const blocker = locks.request('ivLyricsLocalLrclib', { mode: 'exclusive' }, async () => {
        holding.resolve();
        await release.promise;
    });
    await holding.promise;
    const importing = assert.rejects(h.api.importFile(compressed()), { code: 'canceled' });
    await flush();
    h.api.cancelImport();
    try {
        await importing;
        assert.equal(h.api.getState().errorCode, 'canceled');
        assert.equal(h.persisted.record, previous);
        assert.equal(h.persisted.pending.length, 0);
        assert.deepEqual([...h.persisted.files.keys()], [previous.opfsName]);
    } finally {
        release.resolve();
        await blocker;
    }
    await h.api.connect();
    assert.equal(await h.api.lookup({}), candidate);
});

test('late cancellation after activation cannot delete the newly committed output', async () => {
    const controller = new AbortController();
    let cancelOnCommit = false;
    const h = setup({ locks: mutationLocks(), afterCommit: () => { if (cancelOnCommit) controller.abort(); } });
    await h.api.importFile(compressed());
    const previous = h.persisted.record;
    cancelOnCommit = true;
    await h.api.importFile(compressed(), { signal: controller.signal });
    assert.equal(controller.signal.aborted, true);
    assert.equal(h.api.getState().phase, 'ready');
    assert.notEqual(h.persisted.record.opfsName, previous.opfsName);
    assert.deepEqual([...h.persisted.files.keys()], [h.persisted.record.opfsName]);
    assert.equal(h.persisted.pending.length, 0);
    assert.equal(await h.api.lookup({}), candidate);
});

test('an aborted pending-journal commit creates no OPFS output and preserves the last-good source', async () => {
    const h = setup({ locks: mutationLocks() });
    await h.api.importFile(compressed());
    const previous = h.persisted.record;
    const creates = h.events.filter(event => event[0] === 'create').length;
    h.fault.pending = true;
    await assert.rejects(h.api.importFile(compressed()), { code: 'unavailable' });
    assert.equal(h.persisted.record, previous);
    assert.equal(h.events.filter(event => event[0] === 'create').length, creates);
    assert.deepEqual([...h.persisted.files.keys()], [previous.opfsName]);
    assert.equal(h.persisted.pending.length, 0);
    assert.equal(h.workers[0].terminated, false);
});

test('a failed import from the file picker reports its error once', async () => {
    const h = setup();
    await h.api.importFile(compressed());
    h.root.showOpenFilePicker = async () => [{ kind: 'file', getFile: async () => file('broken.sqlite3', Buffer.alloc(32)) }];
    const states = [];
    const unsubscribe = h.api.subscribe(state => states.push(state));
    try {
        await assert.rejects(h.api.pickFile(), { code: 'invalidFile' });
        assert.equal(states.filter(state => state.errorCode === 'invalidFile').length, 1);
        assert.equal(h.api.getState().name, 'official.sqlite3.gz');
        assert.equal(await h.api.lookup({}), candidate);
    } finally {
        unsubscribe();
    }
});

test('a stale handle restore without Web Locks cannot overwrite a newer committed source', async () => {
    let current = file();
    const handle = { kind: 'file', queryPermission: async () => 'granted', getFile: async () => current };
    const base = setup();
    await base.api.importFile(current, { handle });
    current = file('official.sqlite3', sqlite, 200);
    const opening = latch();
    let finishOpen;
    const stale = setup({ persisted: base.persisted, onPost: (message, worker) => {
        if (message.action === 'open') {
            finishOpen = () => worker.reply(message.id, { size: message.file.size });
            opening.resolve();
            return true;
        }
    } });
    const restoring = stale.api.connect();
    await opening.promise;
    await base.api.importFile(compressed());
    const replacement = base.persisted.record;
    finishOpen();
    await restoring;
    assert.equal(stale.api.getState().errorCode, 'unavailable');
    assert.equal(base.persisted.record, replacement);
    assert.deepEqual([...base.persisted.files.keys()], [replacement.opfsName]);
});
