import { finite, settingNumber } from "./cdVisualizerSettings.mjs";
import {
    ANALYSIS_CACHE_VERSION, CACHE_RECORD_OVERHEAD, MAX_ANALYSIS_RECORD_BYTES, analysisRecordBytes, normalizeAnalysis,
    packAnalysis, trackIdFromUri, unpackAnalysis,
} from "./cdAudioAnalysis.mjs";

const ANALYSIS_DB_NAME = "ivLyricsCdAnalysis";

export function createCdAnalysisLoader(root, options = {}) {
    const getSpicetify = options.getSpicetify || (() => root?.Spicetify);
    const now = options.now || Date.now;
    const schedule = options.setTimeout || ((callback, ms) => root.setTimeout(callback, ms));
    const cancel = options.clearTimeout || (id => root.clearTimeout(id));
    const timeoutMs = settingNumber(options.timeoutMs, 5000, 100, 10000);
    const negativeTtlMs = settingNumber(options.negativeTtlMs, 60000, 1000, 10 * 60000);
    const capacity = Math.round(settingNumber(options.capacity, 8, 1, 16));
    const maxInflight = Math.round(settingNumber(options.maxInflight, 4, 1, 8));
    const persistentCapacity = Math.round(settingNumber(options.persistentCapacity, 64, 1, 128));
    const maxPersistentBytes = settingNumber(options.maxPersistentBytes, 32 * 1024 * 1024, 1024, 64 * 1024 * 1024);
    const storageTimeoutMs = settingNumber(options.storageTimeoutMs, 1000, 50, 5000);
    const cache = new Map(), inflight = new Map();
    let waiting = null, database = null, databasePromise = null, storageRetryAfter = 0;

    function storageFailed(db) {
        storageRetryAfter = now() + negativeTtlMs;
        if (database === db) { database = null; databasePromise = null; }
        try { db?.close(); } catch (_) { /* Storage is optional. */ }
    }

    function getDatabase() {
        if (storageRetryAfter > now()) return Promise.resolve(null);
        if (databasePromise) return databasePromise;
        let factory;
        try {
            factory = Object.prototype.hasOwnProperty.call(options, "indexedDB") ? options.indexedDB : root?.indexedDB;
            if (typeof factory?.open !== "function") return Promise.resolve(null);
        } catch (_) { storageFailed(null); return Promise.resolve(null); }
        const opening = new Promise(resolve => {
            let finished = false, request;
            const finish = db => {
                if (finished) return;
                finished = true;
                cancel(timer);
                if (!db) storageFailed(null);
                resolve(db);
            };
            const timer = schedule(() => finish(null), storageTimeoutMs);
            try {
                request = factory.open(ANALYSIS_DB_NAME, 1);
                request.onupgradeneeded = () => {
                    if (finished) { try { request.transaction?.abort(); } catch (_) { /* Late open. */ } return; }
                    try {
                        const db = request.result;
                        if (!db.objectStoreNames.contains("analysis")) db.createObjectStore("analysis", { keyPath: "uri" });
                        // Keep LRU metadata separate: pruning must not clone all
                        // cached multi-megabyte analyses on every song change.
                        if (!db.objectStoreNames.contains("entries")) db.createObjectStore("entries", { keyPath: "uri" });
                    } catch (_) {
                        try { request.transaction?.abort(); } catch (_) { /* Failed upgrade. */ }
                        finish(null);
                    }
                };
                request.onerror = request.onblocked = () => finish(null);
                request.onsuccess = () => {
                    const db = request.result;
                    if (finished) { db.close(); return; }
                    database = db;
                    const reset = () => {
                        if (database === db) { database = null; databasePromise = null; }
                    };
                    db.onversionchange = () => { db.close(); reset(); };
                    db.onclose = reset;
                    finish(db);
                };
            } catch (_) { finish(null); }
        });
        databasePromise = opening;
        opening.then(db => { if (!db && databasePromise === opening) databasePromise = null; });
        return opening;
    }

    async function persistentAccess(uri, data) {
        let record = null;
        if (data) {
            record = packAnalysis(uri, data);
            if (analysisRecordBytes(record) > maxPersistentBytes || !unpackAnalysis(record, uri)) return null;
        }
        const db = await getDatabase();
        if (!db) return null;
        return new Promise(resolve => {
            let transaction, result = null, finished = false;
            const finish = failed => {
                if (finished) return;
                finished = true;
                cancel(timer);
                if (failed) {
                    try { transaction?.abort(); } catch (_) { /* Already aborted/committed. */ }
                    storageFailed(db);
                }
                // A failed LRU touch must not discard valid data already
                // read from disk and trigger a needless Spotify request.
                resolve(result);
            };
            const timer = schedule(() => finish(true), storageTimeoutMs);
            try {
                transaction = db.transaction(["analysis", "entries"], "readwrite");
                transaction.oncomplete = () => finish(false);
                transaction.onabort = transaction.onerror = () => finish(true);
                const store = transaction.objectStore("analysis"), entries = transaction.objectStore("entries");
                const touch = stored => {
                    const request = entries.getAll();
                    request.onsuccess = () => {
                        if (finished) return;
                        try {
                            let accessedAt = Math.max(0, Math.floor(finite(now(), 0)));
                            const retained = [];
                            for (const entry of request.result) {
                                const valid = trackIdFromUri(entry.uri) && entry.cacheVersion === ANALYSIS_CACHE_VERSION
                                    && Number.isSafeInteger(entry.sizeBytes) && entry.sizeBytes >= CACHE_RECORD_OVERHEAD
                                    && entry.sizeBytes <= MAX_ANALYSIS_RECORD_BYTES
                                    && Number.isSafeInteger(entry.accessedAt) && entry.accessedAt >= 0
                                    && entry.accessedAt < Number.MAX_SAFE_INTEGER;
                                if (entry.uri === uri) {
                                    if (valid) accessedAt = Math.max(accessedAt, entry.accessedAt + 1);
                                } else if (valid) {
                                    retained.push(entry);
                                    accessedAt = Math.max(accessedAt, entry.accessedAt + 1);
                                } else { entries.delete(entry.uri); store.delete(entry.uri); }
                            }
                            const entry = { uri, cacheVersion: ANALYSIS_CACHE_VERSION,
                                accessedAt, sizeBytes: analysisRecordBytes(stored) };
                            entries.put(entry);
                            retained.sort((a, b) => a.accessedAt - b.accessedAt);
                            let bytes = entry.sizeBytes + retained.reduce((sum, item) => sum + item.sizeBytes, 0);
                            while (retained.length && (retained.length + 1 > persistentCapacity || bytes > maxPersistentBytes)) {
                                const removed = retained.shift();
                                bytes -= removed.sizeBytes;
                                entries.delete(removed.uri);
                                store.delete(removed.uri);
                            }
                        } catch (_) { finish(true); }
                    };
                };
                if (record) { store.put(record); touch(record); }
                else {
                    const request = store.get(uri);
                    request.onsuccess = () => {
                        if (finished) return;
                        try {
                            result = unpackAnalysis(request.result, uri);
                            if (result && analysisRecordBytes(request.result) <= maxPersistentBytes) touch(request.result);
                            else { result = null; store.delete(uri); entries.delete(uri); }
                        } catch (_) { finish(true); }
                    };
                }
            } catch (_) { finish(true); }
        });
    }

    function boundedRequest(request) {
        return new Promise(resolve => {
            let finished = false, timer;
            const finish = value => {
                if (finished) return;
                finished = true;
                if (timer !== undefined) cancel(timer);
                resolve(value);
            };
            timer = schedule(() => finish(null), timeoutMs);
            Promise.resolve().then(request).then(finish, () => finish(null));
        });
    }

    async function fetchAnalysis(uri, id) {
        const spicetify = getSpicetify();
        if (typeof spicetify?.getAudioData === "function") {
            // Spicetify's implementation calls this very same Cosmos URL.
            // Retrying it directly after a 403/404, bad payload, rejection,
            // or timeout only duplicates the failure and doubles the wait.
            return normalizeAnalysis(await boundedRequest(() => spicetify.getAudioData(uri)));
        }
        if (typeof spicetify?.CosmosAsync?.get === "function") {
            return normalizeAnalysis(await boundedRequest(() => spicetify.CosmosAsync.get(
                `https://spclient.wg.spotify.com/audio-attributes/v1/audio-analysis/${id}?format=json`
            )));
        }
        return null;
    }

    function start(job) {
        inflight.set(job.uri, job.promise);
        Promise.resolve().then(async () => {
            const stored = await persistentAccess(job.uri).catch(() => null);
            if (stored) return stored;
            const data = await fetchAnalysis(job.uri, job.id);
            // Complete the bounded write before releasing deduplication:
            // a re-mounted/reloaded renderer can immediately reuse it.
            if (data) await persistentAccess(job.uri, data).catch(() => null);
            return data;
        }).catch(() => null).then(data => {
            cache.delete(job.uri);
            cache.set(job.uri, { data, expires: data ? Infinity : now() + negativeTtlMs });
            while (cache.size > capacity) cache.delete(cache.keys().next().value);
            inflight.delete(job.uri);
            job.resolve(data);
            if (waiting) {
                const next = waiting;
                waiting = null;
                start(next);
            }
        });
    }

    function load(uri) {
        const id = trackIdFromUri(uri);
        if (!id) return Promise.resolve(null);
        const cached = cache.get(uri);
        if (cached && cached.expires > now()) {
            cache.delete(uri);
            cache.set(uri, cached);
            return Promise.resolve(cached.data);
        }
        cache.delete(uri);
        if (inflight.has(uri)) return inflight.get(uri);
        if (waiting?.uri === uri) return waiting.promise;
        const job = { uri, id };
        job.promise = new Promise(resolve => { job.resolve = resolve; });
        if (inflight.size < maxInflight) start(job);
        else {
            // Rapid skips cannot create an unbounded network queue. Retain
            // the newest waiting track, rather than making it permanently
            // unavailable simply because stale requests occupy the slots.
            waiting?.resolve(null);
            waiting = job;
        }
        return job.promise;
    }

    load.getStats = () => ({ cached: cache.size, inflight: inflight.size, waiting: waiting ? 1 : 0 });
    return load;
}
