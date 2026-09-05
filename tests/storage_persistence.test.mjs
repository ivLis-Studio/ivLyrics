import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../StoragePersistence.js", import.meta.url), "utf8");
const backupKey = "ivLyrics:settings-backup:v1";
const settingKey = "ivLyrics:visual:font-size";
const clone = (value) => value == null ? value : JSON.parse(JSON.stringify(value));

const tickUntil = async (predicate) => {
  for (let index = 0; index < 100; index += 1) {
    if (predicate()) return;
    await Promise.resolve();
  }
  assert.fail("Expected asynchronous storage operation did not finish");
};

const createHarness = ({ local = {}, synchronous = null, indexed = null, deferRead = false } = {}) => {
  const values = new Map(Object.entries(local));
  const session = new Map();
  const syncWrites = [];
  const writes = [];
  const warnings = [];
  const timers = [];
  const historyChanges = [];
  let synchronousRecord = clone(synchronous);
  let indexedRecord = clone(indexed);
  let autoComplete = true;
  let failSync = false;
  let failOpen = false;
  let failLocal = false;
  let readRequest = null;
  let openConnections = 0;
  let maxConcurrentWrites = 0;

  const completeWrite = (write = writes.find((item) => !item.done), fail = false) => {
    assert.ok(write && !write.done, "An unfinished write is required");
    write.done = true;
    if (fail) {
      write.transaction.error = new Error("simulated transaction failure");
      write.transaction.onabort();
    } else {
      indexedRecord = clone(write.record);
      write.transaction.oncomplete();
    }
  };
  const completeRead = () => {
    assert.ok(readRequest);
    readRequest.result = clone(indexedRecord);
    readRequest.onsuccess();
    readRequest = null;
  };
  const localStorage = {
    get length() { return values.size; },
    key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      if (failLocal) throw new Error("simulated localStorage failure");
      values.set(key, String(value));
    },
    removeItem: (key) => values.delete(key),
  };
  const window = {
    Spicetify: {
      Platform: {
        LocalStorageAPI: {
          namespace: "test-user",
          getItem: () => clone(synchronousRecord),
          setItem: (key, record) => {
            assert.equal(key, backupKey);
            if (failSync) throw new Error("simulated synchronous backup failure");
            synchronousRecord = clone(record);
            syncWrites.push(clone(record));
          },
        },
        History: {
          location: { pathname: "/ivLyrics" },
          replace: (path) => historyChanges.push(path),
        },
      },
    },
    location: { reload: () => {} },
    indexedDB: {
      open: () => {
        const request = {};
        queueMicrotask(() => {
          if (failOpen) {
            request.error = new Error("simulated database open failure");
            request.onerror();
            return;
          }
          openConnections += 1;
          request.result = {
            close: () => { openConnections -= 1; },
            transaction: (_store, mode) => {
              const transaction = {
                objectStore: () => mode === "readonly" ? {
                  get: () => {
                    readRequest = {};
                    if (!deferRead) queueMicrotask(completeRead);
                    return readRequest;
                  },
                } : {
                  put: (record) => {
                    const write = { record: clone(record), transaction, done: false };
                    writes.push(write);
                    maxConcurrentWrites = Math.max(maxConcurrentWrites, writes.filter((item) => !item.done).length);
                    if (autoComplete) queueMicrotask(() => completeWrite(write));
                  },
                },
              };
              return transaction;
            },
          };
          request.onsuccess();
        });
        return request;
      },
    },
  };
  vm.runInNewContext(source, {
    window, localStorage, console: { warn: (...args) => warnings.push(args) },
    sessionStorage: { getItem: (key) => session.get(key) ?? null, setItem: (key, value) => session.set(key, value) },
    setTimeout: (callback, delay) => timers.push({ callback, delay }),
  });
  return {
    api: window.ivLyricsStoragePersistence, values, localStorage, writes, syncWrites, warnings, timers, historyChanges,
    get synchronousRecord() { return synchronousRecord; },
    get indexedRecord() { return indexedRecord; },
    get openConnections() { return openConnections; },
    get maxConcurrentWrites() { return maxConcurrentWrites; },
    get hasReadRequest() { return !!readRequest; },
    set autoComplete(value) { autoComplete = value; },
    set failSync(value) { failSync = value; },
    set failOpen(value) { failOpen = value; },
    set failLocal(value) { failLocal = value; },
    set namespace(value) { window.Spicetify.Platform.LocalStorageAPI.namespace = value; },
    completeWrite, completeRead,
  };
};

test("a settings burst keeps immediate local and synchronous backups but coalesces the waiting IndexedDB snapshot", async () => {
  const harness = createHarness();
  await harness.api.ready;
  const initialWrites = harness.writes.length;
  const initialSyncWrites = harness.syncWrites.length;
  for (let value = 1; value <= 100; value += 1) {
    harness.api.setItem(settingKey, value);
    assert.equal(harness.values.get(settingKey), String(value));
    assert.equal(harness.synchronousRecord.settings[settingKey], String(value));
  }
  assert.equal(harness.syncWrites.length - initialSyncWrites, 100);
  await harness.api.flush();
  assert.equal(harness.writes.length - initialWrites, 1);
  assert.equal(harness.indexedRecord.settings[settingKey], "100");
  assert.equal(harness.syncWrites[initialSyncWrites].settings[settingKey], "1");
  assert.equal(harness.openConnections, 0);
});

test("an in-flight write remains immutable and flush waits for the latest queued snapshot", async () => {
  const harness = createHarness();
  await harness.api.ready;
  harness.autoComplete = false;
  const initialWrites = harness.writes.length;
  harness.api.setItem(settingKey, "first");
  await tickUntil(() => harness.writes.length === initialWrites + 1);
  const firstWrite = harness.writes.at(-1);
  for (let value = 0; value < 50; value += 1) harness.api.setItem(settingKey, value);
  let flushed = false;
  const flush = harness.api.flush().then(() => { flushed = true; });
  assert.equal(firstWrite.record.settings[settingKey], "first");
  harness.completeWrite(firstWrite);
  await tickUntil(() => harness.writes.length === initialWrites + 2);
  assert.equal(flushed, false);
  assert.equal(harness.writes.at(-1).record.settings[settingKey], "49");
  harness.completeWrite();
  await flush;
  assert.equal(harness.maxConcurrentWrites, 1);
  assert.equal(harness.indexedRecord.settings[settingKey], "49");
});

test("equal settings and absent removals avoid backup revisions while still applying localStorage writes", async () => {
  const harness = createHarness();
  await harness.api.ready;
  harness.api.setItem(settingKey, 42);
  await harness.api.flush();
  const revision = harness.synchronousRecord.revision;
  const syncCount = harness.syncWrites.length;
  const writeCount = harness.writes.length;
  harness.values.delete(settingKey);
  harness.api.setItem(settingKey, "42");
  harness.api.removeItem("ivLyrics:visual:absent");
  harness.api.setItem("unmanaged-key", "untouched");
  await harness.api.flush();
  assert.equal(harness.values.get(settingKey), "42");
  assert.equal(harness.synchronousRecord.revision, revision);
  assert.equal(harness.syncWrites.length, syncCount);
  assert.equal(harness.writes.length, writeCount);
  assert.equal(harness.api.getSnapshot()["unmanaged-key"], undefined);
});

test("an absent removal before initialization still creates a recovery record", async () => {
  const harness = createHarness({ deferRead: true });
  harness.api.removeItem(settingKey);
  assert.deepEqual(harness.synchronousRecord.settings, {});
  assert.ok(harness.synchronousRecord.revision > 0);
  await tickUntil(() => harness.hasReadRequest);
  harness.completeRead();
  await harness.api.ready;
  await harness.api.flush();
  assert.deepEqual(harness.indexedRecord.settings, {});
});

test("equal-value writes refresh a changed storage namespace", async () => {
  const harness = createHarness();
  await harness.api.ready;
  harness.api.setItem(settingKey, "same");
  await harness.api.flush();
  const revision = harness.synchronousRecord.revision;
  harness.namespace = "different-user";
  harness.api.setItem(settingKey, "same");
  assert.equal(harness.synchronousRecord.namespace, "different-user");
  assert.ok(harness.synchronousRecord.revision > revision);
  await harness.api.flush();
  assert.equal(harness.indexedRecord.namespace, "different-user");
});

test("coalescing keeps the latest pending snapshot for each storage namespace", async () => {
  const harness = createHarness();
  await harness.api.ready;
  const initialWrites = harness.writes.length;
  harness.api.setItem(settingKey, "first account value");
  harness.api.setItem(settingKey, "first account latest");
  harness.namespace = "different-user";
  harness.api.setItem(settingKey, "second account latest");
  await harness.api.flush();
  assert.deepEqual(harness.writes.slice(initialWrites).map(({ record }) => [record.namespace, record.settings[settingKey]]), [
    ["test-user", "first account latest"],
    ["different-user", "second account latest"],
  ]);
});

test("a failed transaction does not block a newer pending snapshot or later equal-value retries", async () => {
  const harness = createHarness();
  await harness.api.ready;
  harness.autoComplete = false;
  harness.api.setItem(settingKey, "older");
  await tickUntil(() => harness.writes.some((write) => !write.done));
  harness.api.setItem(settingKey, "newer");
  harness.completeWrite(undefined, true);
  await tickUntil(() => harness.writes.some((write) => !write.done));
  assert.equal(harness.writes.at(-1).record.settings[settingKey], "newer");
  harness.completeWrite(undefined, true);
  await harness.api.flush();
  const revision = harness.synchronousRecord.revision;
  const syncCount = harness.syncWrites.length;
  harness.autoComplete = true;
  harness.api.setItem(settingKey, "newer");
  await harness.api.flush();
  assert.equal(harness.indexedRecord.settings[settingKey], "newer");
  assert.equal(harness.synchronousRecord.revision, revision);
  assert.equal(harness.syncWrites.length, syncCount);
  assert.equal(harness.openConnections, 0);
  assert.equal(harness.warnings.length, 2);
});

test("a synchronous backup failure is retried by an equal-value write", async () => {
  const harness = createHarness();
  await harness.api.ready;
  harness.failSync = true;
  harness.api.setItem(settingKey, "saved locally");
  const snapshot = harness.api.getSnapshot();
  assert.equal(harness.values.get(settingKey), "saved locally");
  assert.equal(harness.synchronousRecord.settings[settingKey], undefined);
  harness.failSync = false;
  harness.api.setItem(settingKey, "saved locally");
  assert.deepEqual(harness.synchronousRecord.settings, clone(snapshot));
  await harness.api.flush();
  assert.equal(harness.indexedRecord.revision, harness.synchronousRecord.revision);
});

test("clear replaces waiting snapshots with an empty record and waits past an older in-flight write", async () => {
  const harness = createHarness({ local: { "unmanaged-key": "keep" } });
  await harness.api.ready;
  harness.autoComplete = false;
  harness.api.setItem(settingKey, "old");
  await tickUntil(() => harness.writes.some((write) => !write.done));
  harness.api.setItem(settingKey, "waiting");
  let cleared = false;
  const clear = harness.api.clear().then(() => { cleared = true; });
  assert.equal(harness.values.has(settingKey), false);
  assert.equal(harness.values.get("unmanaged-key"), "keep");
  assert.deepEqual(harness.synchronousRecord.settings, {});
  harness.completeWrite();
  await tickUntil(() => harness.writes.some((write) => !write.done));
  assert.equal(cleared, false);
  assert.deepEqual(harness.writes.at(-1).record.settings, {});
  harness.completeWrite();
  await clear;
  assert.deepEqual(harness.indexedRecord.settings, {});
});

test("ready restores missing IndexedDB values without overwriting local settings and preserves recovery reload", async () => {
  const recoveredKey = "ivLyrics:visual:color";
  const harness = createHarness({
    local: { [settingKey]: "local" },
    indexed: { revision: Date.now() + 10000, settings: { [settingKey]: "backup", [recoveredKey]: "blue", "foreign-key": "ignore" } },
  });
  const result = await harness.api.ready;
  assert.equal(result.restoredCount, 1);
  assert.equal(harness.values.get(settingKey), "local");
  assert.equal(harness.values.get(recoveredKey), "blue");
  assert.equal(harness.values.has("foreign-key"), false);
  assert.equal(harness.indexedRecord.settings[settingKey], "local");
  assert.equal(harness.indexedRecord.settings[recoveredKey], "blue");
  assert.equal(harness.timers[0].delay, 150);
  assert.deepEqual(harness.historyChanges, ["/"]);
});

test("a failed clear keeps its synchronous empty snapshot and retries an absent removal", async () => {
  const harness = createHarness();
  await harness.api.ready;
  harness.api.setItem(settingKey, "old");
  await harness.api.flush();
  harness.autoComplete = false;
  const clear = harness.api.clear();
  await tickUntil(() => harness.writes.some((write) => !write.done));
  harness.completeWrite(undefined, true);
  await clear;
  assert.deepEqual(harness.synchronousRecord.settings, {});
  assert.equal(harness.values.has(settingKey), false);
  assert.equal(harness.indexedRecord.settings[settingKey], "old");
  harness.autoComplete = true;
  harness.api.removeItem(settingKey);
  await harness.api.flush();
  assert.deepEqual(harness.indexedRecord.settings, {});
});

test("database open failures settle ready and flush, and a later write recovers", async () => {
  const harness = createHarness();
  harness.failOpen = true;
  await harness.api.ready;
  await harness.api.flush();
  harness.failOpen = false;
  harness.api.setItem(settingKey, "recovered");
  await harness.api.flush();
  assert.equal(harness.indexedRecord.settings[settingKey], "recovered");
  assert.equal(harness.warnings.length, 2);
});

test("writes queued at transaction completion are not lost and localStorage failures stay synchronous", async () => {
  const harness = createHarness();
  await harness.api.ready;
  harness.autoComplete = false;
  harness.api.setItem(settingKey, "first");
  await tickUntil(() => harness.writes.some((write) => !write.done));
  harness.completeWrite();
  queueMicrotask(() => harness.api.setItem(settingKey, "at completion"));
  await tickUntil(() => harness.writes.some((write) => !write.done));
  assert.equal(harness.writes.at(-1).record.settings[settingKey], "at completion");
  harness.completeWrite();
  await harness.api.flush();
  const revision = harness.synchronousRecord.revision;
  harness.failLocal = true;
  assert.throws(() => harness.api.setItem(settingKey, "must fail"), /localStorage failure/);
  assert.equal(harness.synchronousRecord.revision, revision);
  assert.equal(harness.indexedRecord.settings[settingKey], "at completion");
});
