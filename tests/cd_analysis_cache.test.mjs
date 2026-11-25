import { createCdVisualizerApi } from "../src/features/player/CdVisualizer.js";
import assert from "node:assert/strict";
import test from "node:test";

const api = createCdVisualizerApi(globalThis);
const uri = index => `spotify:track:${String(index).padStart(22, "0")}`;
const raw = (count = 2) => ({
  track: { duration: count },
  beats: Array.from({ length: count }, (_, start) => ({ start, confidence: 0.8 })),
  segments: Array.from({ length: count }, (_, start) => ({
    start, duration: 1, loudness_start: -20, loudness_max: -3, loudness_max_time: 0.2,
    loudness_end: -40, pitches: Array.from({ length: 12 }, (_, pitch) => (pitch + start) % 4 / 3),
  })),
  unusedMetadata: "This must not be stored",
});
const flush = () => new Promise(resolve => setImmediate(resolve));

// A deliberately small IDB fake, like lrclib_local_service.test.mjs: requests
// run asynchronously, overlapping transactions serialize, and mutations become
// visible only on transaction completion. An abort rolls back request success.
function fakeIndexedDB() {
  const stores = new Map(), connections = [], opens = [], commits = [];
  const fault = {};
  let tail = Promise.resolve();
  function completeOpen(request) {
    const db = {
      closed: false,
      objectStoreNames: { contains: name => stores.has(name) },
      createObjectStore(name, options) {
        assert.equal(options.keyPath, "uri");
        stores.set(name, new Map());
      },
      close() { this.closed = true; },
      transaction(names, mode) {
        if (this.closed || fault.transaction === "throw") throw new Error("Database unavailable");
        assert.deepEqual(Array.from(names), ["analysis", "entries"]);
        assert.equal(mode, "readwrite");
        let release, snapshot, started = false, scheduled = false, finished = false, aborted = false;
        const preceding = tail, pending = [], mutations = [];
        tail = new Promise(resolve => { release = resolve; });
        const tx = {
          abort() { aborted = true; schedule(); },
          objectStore(name) {
            assert.ok(names.includes(name) && stores.has(name));
            function request(kind, key, value) {
              assert.equal(finished, false, "Cannot add requests to an inactive transaction");
              const operation = {};
              pending.push({ name, kind, key, value: structuredClone(value), operation });
              schedule();
              return operation;
            }
            return {
              get: key => request("get", key), getAll: () => request("getAll"),
              put: value => request("put", value.uri, value), delete: key => request("delete", key),
            };
          },
        };
        function schedule() {
          if (!started || scheduled || finished) return;
          scheduled = true;
          queueMicrotask(() => { scheduled = false; pump(); });
        }
        function pump() {
          if (finished) return;
          if (aborted) { finished = true; tx.onabort?.(); release(); return; }
          if (fault.transaction === "hang") return;
          const next = pending.shift();
          if (next) {
            const { name, kind, key, value, operation } = next;
            if (fault.hangRequest === kind) return;
            if (fault.request === kind) {
              operation.error = tx.error = new Error("Request failed");
              operation.onerror?.(); tx.onerror?.(); tx.abort(); return;
            }
            const table = snapshot.get(name);
            if (kind === "get") operation.result = structuredClone(table.get(key));
            else if (kind === "getAll") operation.result = [...table.values()].map(value => structuredClone(value));
            else {
              mutations.push([name, kind, key]);
              if (kind === "put") table.set(key, structuredClone(value));
              else table.delete(key);
              operation.result = key;
            }
            operation.onsuccess?.();
            fault.afterRequest?.(next, tx);
            schedule();
            return;
          }
          if (fault.abortWrites && mutations.some(([, kind]) => kind === "put")) {
            tx.error = new Error("Commit failed"); tx.abort(); return;
          }
          finished = true;
          for (const name of names) stores.set(name, snapshot.get(name));
          commits.push(mutations);
          tx.oncomplete?.();
          release();
        }
        void preceding.then(() => {
          snapshot = new Map(names.map(name => [name, new Map([...stores.get(name)]
            .map(([key, value]) => [key, structuredClone(value)]))]));
          started = true; schedule();
        });
        return tx;
      },
    };
    connections.push(db);
    request.result = db;
    if (!stores.size) request.onupgradeneeded?.();
    request.onsuccess?.();
    return db;
  }
  return {
    stores, fault, connections, opens, commits, completeOpen,
    open(name, version) {
      assert.equal(name, "ivLyricsCdAnalysis"); assert.equal(version, 1);
      if (fault.open === "throw") throw new Error("SecurityError");
      const request = {}; opens.push(request);
      queueMicrotask(() => {
        if (fault.open === "hang") return;
        if (fault.open === "blocked") { request.onblocked?.(); return; }
        if (fault.open === "error") { request.error = new Error("Open failed"); request.onerror?.(); return; }
        completeOpen(request);
      });
      return request;
    },
  };
}

function manualTimers() {
  const pending = new Map(); let serial = 0;
  return {
    pending,
    setTimeout(callback, ms) { pending.set(++serial, { callback, ms }); return serial; },
    clearTimeout(id) { pending.delete(id); },
    fire(ms) {
      const matches = [...pending.values()].filter(timer => timer.ms === ms);
      assert.ok(matches.length, `Expected a ${ms}ms timer`);
      matches.forEach(timer => timer.callback());
    },
  };
}

function loader(idb, options = {}) {
  const requests = [];
  const load = api.createAnalysisLoader({
    indexedDB: idb,
    getSpicetify: () => ({ getAudioData(requested) { requests.push(requested); return raw(); } }),
    ...options,
  });
  return { load, requests };
}

test("a fresh script/renderer reload reads durable analysis and beats before contacting Spotify", async () => {
  const idb = fakeIndexedDB(); let requests = 0;
  function reload() {
    const window = { indexedDB: idb, setTimeout, clearTimeout,
      Spicetify: { getAudioData() { requests++; return raw(); } } };
    return createCdVisualizerApi(window);
  }
  const first = reload(), original = await first.loadAnalysis(uri(1));
  assert.equal(requests, 1);
  assert.equal(idb.stores.get("analysis").size, 1, "load resolves after durable commit");
  const record = idb.stores.get("analysis").get(uri(1));
  assert.equal(record.unusedMetadata, undefined);
  assert.equal(record.data.unusedMetadata, undefined);
  const second = reload(), restored = await second.loadAnalysis(uri(1));
  assert.equal(requests, 1, "reload must not repeat even a failing network request");
  assert.deepEqual(Array.from(restored.pulses.times), Array.from(original.pulses.times));
  assert.deepEqual(Array.from(restored.pulses.strengths), Array.from(original.pulses.strengths));
  for (const time of [0, 0.15, 0.4, 0.9, 1.2, 1.9, 5]) {
    assert.deepEqual(Array.from(second.sampleSpectrum(restored, time)), Array.from(first.sampleSpectrum(original, time)));
  }
  assert.equal(await second.loadAnalysis(uri(1)), restored, "subsequent activations reuse hydrated memory");
});

test("disk lookup, Spotify request, and durable write share one concurrent load promise", async () => {
  const idb = fakeIndexedDB(); let resolve;
  const request = new Promise(done => { resolve = done; }); let calls = 0;
  const { load } = loader(idb, { getSpicetify: () => ({ getAudioData() { calls++; return request; } }) });
  const first = load(uri(1));
  assert.equal(load(uri(1)), first);
  await flush(); assert.equal(calls, 1);
  assert.equal(load(uri(1)), first);
  resolve(raw()); await first;
  assert.equal(calls, 1);
  assert.equal(idb.opens.length, 1);
  assert.equal(idb.stores.get("analysis").size, 1);
  assert.deepEqual(load.getStats(), { cached: 1, inflight: 0, waiting: 0 });
});

test("memory evictions hydrate from disk; disk LRU reads and entry pruning survive reload", async () => {
  const idb = fakeIndexedDB();
  const { load, requests } = loader(idb, { capacity: 1, persistentCapacity: 2, now: () => 0 });
  await load(uri(1)); await load(uri(2)); await load(uri(1)); await load(uri(3));
  assert.deepEqual(requests, [uri(1), uri(2), uri(3)]);
  assert.equal(load.getStats().cached, 1);
  assert.deepEqual([...idb.stores.get("analysis").keys()].sort(), [uri(1), uri(3)]);
  assert.deepEqual([...idb.stores.get("entries").keys()].sort(), [uri(1), uri(3)]);
  const fresh = loader(idb, { persistentCapacity: 2 });
  assert.ok(await fresh.load(uri(1)));
  assert.deepEqual(fresh.requests, []);
  await fresh.load(uri(2));
  assert.deepEqual(fresh.requests, [uri(2)]);
});

test("the packed-byte disk budget prunes atomically and oversized songs stay memory-only", async () => {
  const idb = fakeIndexedDB();
  const { load } = loader(idb, { capacity: 1, persistentCapacity: 10, maxPersistentBytes: 1024 });
  for (let index = 1; index <= 6; index++) {
    await load(uri(index));
    assert.ok([...idb.stores.get("entries").values()].reduce((sum, entry) => sum + entry.sizeBytes, 0) <= 1024);
    assert.equal(idb.stores.get("analysis").size, idb.stores.get("entries").size);
  }
  assert.equal(idb.stores.get("analysis").size, 1);
  const big = loader(idb, { maxPersistentBytes: 1024, getSpicetify: () => ({ getAudioData: () => raw(10) }) });
  const result = await big.load(uri(9));
  assert.equal(result.segments.length, 10);
  assert.equal(await big.load(uri(9)), result);
  assert.equal(idb.stores.get("analysis").has(uri(9)), false);
});

test("corrupt, foreign-version, oversized, and wrong-track records never bypass validation", async () => {
  const corruptions = [
    record => { record.cacheVersion++; }, record => { record.uri = uri(2); },
    record => { record.data.duration = Infinity; }, record => { record.data.duration = 0.5; },
    record => { record.data.segments = Array.from(record.data.segments); },
    record => { record.data.segments = new Float64Array(20001 * 20); },
    record => { record.data.segments = record.data.segments.slice(1); },
    record => { record.data.segments[0] = -1; }, record => { record.data.segments[3] = NaN; },
    record => { record.data.segments[4] = 2; }, record => { record.data.segments[8] = 5; },
    record => { record.data.segments[20] = 0.5; }, record => { record.data.pulses = undefined; },
    record => { record.data.pulses[0] = -1; }, record => { record.data.pulses[1] = 2; },
    record => { record.data.pulses[2] = record.data.pulses[0]; },
  ];
  for (const corrupt of corruptions) {
    const idb = fakeIndexedDB(); await loader(idb).load(uri(1));
    corrupt(idb.stores.get("analysis").get(uri(1)));
    const fresh = loader(idb);
    assert.equal((await fresh.load(uri(1))).segments.length, 2);
    assert.deepEqual(fresh.requests, [uri(1)], corrupt.toString());
    assert.equal(idb.stores.get("analysis").get(uri(1)).cacheVersion, 1);
  }
});

test("absent, denied, blocked, and failed storage preserve successful in-memory loading", async () => {
  for (const mode of [null, "throw", "error", "blocked", "transaction", "request", "commit"]) {
    const idb = mode ? fakeIndexedDB() : null;
    if (["throw", "error", "blocked"].includes(mode)) idb.fault.open = mode;
    if (mode === "transaction") idb.fault.transaction = "throw";
    if (mode === "request") idb.fault.request = "get";
    if (mode === "commit") idb.fault.abortWrites = true;
    const { load, requests } = loader(idb);
    const data = await load(uri(1));
    assert.ok(data, String(mode));
    assert.equal(await load(uri(1)), data);
    assert.deepEqual(requests, [uri(1)]);
    if (mode === "commit") assert.equal(idb.stores.get("analysis").size, 0, "request success cannot masquerade as commit");
  }
});

test("a failed disk LRU touch still returns the validated song without a network failure", async () => {
  const idb = fakeIndexedDB(); await loader(idb).load(uri(1));
  idb.fault.abortWrites = true;
  const fresh = loader(idb, { getSpicetify: () => { throw new Error("Spotify must not be read"); } });
  assert.ok(await fresh.load(uri(1)));
  assert.equal(idb.stores.get("analysis").size, 1);
});

test("hung storage opens/transactions/writes have deadlines and late opens are closed", async () => {
  for (const kind of ["open", "transaction", "put"]) {
    const idb = fakeIndexedDB(), timers = manualTimers();
    if (kind === "open") idb.fault.open = "hang";
    else if (kind === "transaction") idb.fault.transaction = "hang";
    else idb.fault.hangRequest = "put";
    const { load, requests } = loader(idb, { ...timers, storageTimeoutMs: 50 });
    const pending = load(uri(1));
    await flush(); timers.fire(50);
    assert.ok(await pending, kind);
    assert.deepEqual(requests, [uri(1)]);
    assert.equal(timers.pending.size, 0);
    assert.equal(load.getStats().inflight, 0);
    if (kind === "open") {
      const late = idb.completeOpen(idb.opens[0]);
      assert.equal(late.closed, true);
    }
  }
});

test("version changes and closed connections reopen lazily without stale connection failures", async () => {
  for (const event of ["onversionchange", "onclose"]) {
    const idb = fakeIndexedDB(), { load } = loader(idb, { capacity: 1 });
    await load(uri(1));
    const original = idb.connections[0]; original[event]();
    await load(uri(2)); await load(uri(1));
    assert.equal(idb.opens.length, 2);
    assert.equal(idb.stores.get("analysis").size, 2);
    if (event === "onversionchange") assert.equal(original.closed, true);
  }
});

test("network failures remain memory-only with a TTL and are never retried through identical Cosmos", async () => {
  const idb = fakeIndexedDB(); let clock = 0, calls = 0, cosmos = 0;
  const { load } = loader(idb, { now: () => clock, negativeTtlMs: 1000,
    getSpicetify: () => ({ getAudioData() { calls++; return null; }, CosmosAsync: { get() { cosmos++; return raw(); } } }),
  });
  assert.equal(await load(uri(1)), null);
  assert.equal(await load(uri(1)), null); assert.equal(calls, 1);
  clock = 1001; assert.equal(await load(uri(1)), null); assert.equal(calls, 2);
  assert.equal(cosmos, 0);
  assert.equal(idb.stores.get("analysis").size, 0);
  assert.equal(idb.stores.get("entries").size, 0);
});
