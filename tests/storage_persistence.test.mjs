import assert from "node:assert/strict";
import { bundleInitializer } from "./fixtures/initializer-bundle.mjs";
import test from "node:test";
import vm from "node:vm";
import { createSettingsStorage } from "#ivlyrics/core/createSettingsStorage.mjs";

const persistenceModule = new URL("../src/core/StoragePersistence.js", import.meta.url);
const source = bundleInitializer(persistenceModule);
const backupKey = "ivLyrics:settings-backup:v1";
const resetKey = "ivLyrics:settings-reset-revisions";
const pendingImportKey = "ivLyrics:pending-settings-import";
const settingKey = "ivLyrics:visual:font-size";
const clone = (value) => value == null ? value : JSON.parse(JSON.stringify(value));

const tickUntil = async (predicate) => {
  for (let index = 0; index < 100; index += 1) {
    if (predicate()) return;
    await Promise.resolve();
  }
  assert.fail("Expected asynchronous storage operation did not finish");
};

const createHarness = ({
  local = {}, synchronous = null, indexed = null, deferRead = false, deferPlatformStorage = false, namespace = "test-user", receipt,
  deferDatabaseCheck = false,
  initialBundle = source,
} = {}) => {
  const values = local instanceof Map ? local : new Map(Object.entries(local));
  const session = new Map();
  const syncWrites = [];
  const writes = [];
  const warnings = [];
  const timers = [];
  const historyChanges = [];
  let synchronousRecord = clone(synchronous);
  const databaseCheck = deferDatabaseCheck ? Promise.withResolvers() : null;
  let indexedRecord = clone(indexed);
  let autoComplete = true;
  let failSync = false;
  let failOpen = false;
  let failLocal = false;
  let failResetRecord = false;
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
  const completeRead = (value = indexedRecord) => {
    assert.ok(readRequest);
    readRequest.result = clone(value);
    readRequest.onsuccess();
    readRequest = null;
  };
  const localStorage = {
    get length() { return values.size; },
    key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      if (failResetRecord && key === resetKey) throw new Error("simulated reset record write failure");
      if (failLocal) throw new Error("simulated localStorage failure");
      values.set(key, String(value));
    },
    removeItem: (key) => values.delete(key),
  };
  const window = {
    Spicetify: {
      Platform: {
        LocalStorageAPI: {
          namespace,
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
          replace(path) { this.location.pathname = path; historyChanges.push(path); },
        },
      },
    },
    localStorage,
    location: { reload: () => {} },
    setTimeout: (callback, delay) => timers.push({ callback, delay }),
    indexedDB: {
      databases: async () => databaseCheck ? databaseCheck.promise : [],
      open: name => {
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
                    if (name === "ivLyrics-db") {
                      const receiptRequest = { result: receipt };
                      queueMicrotask(() => receiptRequest.onsuccess());
                      return receiptRequest;
                    }
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
  const platformStorage = window.Spicetify.Platform.LocalStorageAPI;
  if (deferPlatformStorage) delete window.Spicetify.Platform.LocalStorageAPI;
  const context = vm.createContext({
    window, localStorage, console: { warn: (...args) => warnings.push(args) },
    sessionStorage: { getItem: (key) => session.get(key) ?? null, setItem: (key, value) => session.set(key, value) },
    setTimeout: (callback, delay) => timers.push({ callback, delay }),
  });
  vm.runInContext(initialBundle, context);
  return {
    values, localStorage, writes, syncWrites, warnings, timers, historyChanges,
    get api() { return window.ivLyricsStoragePersistence; },
    get synchronousRecord() { return synchronousRecord; },
    get indexedRecord() { return indexedRecord; },
    get openConnections() { return openConnections; },
    get maxConcurrentWrites() { return maxConcurrentWrites; },
    get hasReadRequest() { return !!readRequest; },
    get routePersistence() { return window.fixtureRoutePersistence; },
    runStartup() { vm.runInContext(source, context); },
    completeDatabaseCheck() { databaseCheck.resolve([]); },
    makePlatformStorageReady() { window.Spicetify.Platform.LocalStorageAPI = platformStorage; },
    set autoComplete(value) { autoComplete = value; },
    set failSync(value) { failSync = value; },
    set failOpen(value) { failOpen = value; },
    set failLocal(value) { failLocal = value; },
    set failResetRecord(value) { failResetRecord = value; },
    set namespace(value) { window.Spicetify.Platform.LocalStorageAPI.namespace = value; },
    completeWrite, completeRead,
  };
};

test("the route can acquire persistence before the startup bundle with one recovery read", async () => {
  const routeBundle = bundleInitializer(persistenceModule, {
    transformSource: body => body + "\nwindow.fixtureRoutePersistence = initialize();",
  });
  const harness = createHarness({
    initialBundle: routeBundle,
    deferRead: true,
    indexed: { revision: 42, settings: { [settingKey]: "37" } },
  });
  assert.strictEqual(harness.routePersistence, harness.api);
  const storage = createSettingsStorage({ persistence: harness.routePersistence, localStorage: harness.localStorage });
  storage.seedItem(settingKey, "24");
  await tickUntil(() => harness.hasReadRequest);
  harness.runStartup();
  assert.strictEqual(harness.routePersistence, harness.api);
  assert.strictEqual(harness.routePersistence.ready, harness.api.ready);
  assert.equal(harness.openConnections, 1);
  harness.completeRead();
  await harness.api.ready;
  assert.equal(storage.getItem(settingKey), "37");
  storage.setItem(settingKey, "41");
  await harness.api.flush();
  assert.equal(harness.indexedRecord.settings[settingKey], "41");
});

test("settings recovery does not navigate or reload before database rollback has finished", async () => {
  const h = createHarness({
    deferDatabaseCheck: true,
    indexed: { revision: 42, settings: { [settingKey]: "37" } },
  });
  await tickUntil(() => h.values.get(settingKey) === "37");
  assert.deepEqual(h.historyChanges, []);
  assert.deepEqual(h.timers, []);
  h.completeDatabaseCheck();
  await h.api.ready;
  assert.deepEqual(h.historyChanges, ["/"]);
  assert.equal(h.timers.length, 1);
});

test("clean database startup does not wait for the Spotify settings namespace", async () => {
  const h = createHarness({ deferPlatformStorage: true });
  let databasesReady = false;
  h.api.databasesReady.then(() => { databasesReady = true; });
  await tickUntil(() => databasesReady);
  assert.equal(h.openConnections, 0);
  h.makePlatformStorageReady();
  h.timers.shift().callback();
  await h.api.ready;
});

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

test("a settings batch writes one recovery snapshot and its rollback respects later writes", async () => {
  const family = "ivLyrics:visual:font-family";
  const harness = createHarness({ local: { [settingKey]: "24" } });
  await harness.api.ready;
  const before = harness.syncWrites.length;
  const rollback = harness.api.applyBatch([[settingKey, "32"], [family, "Fixture"]]);
  assert.equal(harness.syncWrites.length, before + 1);
  assert.equal(harness.synchronousRecord.settings[family], "Fixture");
  harness.api.setItem(settingKey, "40");
  rollback();
  await harness.api.flush();
  assert.equal(harness.values.get(settingKey), "40");
  assert.equal(harness.values.has(family), false);
  assert.equal(harness.indexedRecord.settings[settingKey], "40");
  assert.equal(harness.indexedRecord.settings[family], undefined);
});

test("settings import exposes only committed data to backup mirrors and preserves a later batch edit", async () => {
  const family = "ivLyrics:visual:font-family";
  const harness = createHarness({ local: { [settingKey]: "24" } });
  await harness.api.ready;
  const before = harness.syncWrites.length;
  const importing = harness.api.beginImportBatch([[settingKey, "32"], [family, "Fixture"]]);
  assert.equal(harness.values.get(settingKey), "32");
  assert.equal(harness.syncWrites.length, before);
  await harness.api.flush();
  assert.deepEqual(harness.indexedRecord.settings, { [settingKey]: "24" });
  harness.api.applyBatch([[settingKey, "32"]]);
  importing.rollback();
  await harness.api.flush();
  assert.equal(harness.values.get(settingKey), "32");
  assert.equal(harness.values.has(family), false);
  assert.deepEqual(harness.indexedRecord.settings, { [settingKey]: "32" });

  const second = harness.api.beginImportBatch([[settingKey, "42"], [family, "Committed"]]);
  harness.api.setItem(settingKey, "25");
  second.commit();
  await harness.api.flush();
  assert.deepEqual(harness.indexedRecord.settings, { [settingKey]: "25", [family]: "Committed" });
});

test("rebuilding the settings mirror after an account change excludes a pending import", async () => {
  const family = "ivLyrics:visual:font-family";
  const edited = "ivLyrics:visual:alignment";
  const harness = createHarness({ local: { [settingKey]: "24" } });
  await harness.api.ready;
  const entered = Promise.withResolvers();
  const result = Promise.withResolvers();
  const storage = createSettingsStorage({
    persistence: harness.api, localStorage: harness.localStorage,
    offsetStore: { importOffsets: () => { entered.resolve(); return result.promise; } },
  });
  const restoring = storage.importConfig({ [settingKey]: "32", [family]: "Temporary", "ivLyrics:track-sync-offsets": {} });
  await entered.promise;
  harness.namespace = "different-user";
  harness.api.setItem(edited, "right");
  await harness.api.flush();
  const synchronous = harness.synchronousRecord;
  const indexed = harness.indexedRecord;
  result.resolve(false);
  await assert.rejects(restoring, /restore track sync offsets/);
  assert.equal(synchronous.namespace, "different-user");
  assert.deepEqual(synchronous.settings, { [settingKey]: "24", [edited]: "right" });
  assert.deepEqual(indexed.settings, synchronous.settings);
  harness.values.delete(settingKey);
  assert.equal(harness.api.getItem(settingKey), "24");
  assert.equal(harness.api.getItem(family), null);
});

test("the route's raw writes invalidate a rollback owned by the startup persistence service", async () => {
  const harness = createHarness({ local: { [settingKey]: "24" } });
  await harness.api.ready;
  const entered = Promise.withResolvers();
  const pending = Promise.withResolvers();
  const storage = createSettingsStorage({
    persistence: harness.api, localStorage: harness.localStorage,
    offsetStore: { importOffsets: () => { entered.resolve(); return pending.promise; } },
  });
  const restoring = storage.importConfig({ [settingKey]: "32", "ivLyrics:track-sync-offsets": {} });
  await entered.promise;
  storage.setItemRaw(settingKey, "49");
  storage.setItemRaw(settingKey, "32");
  pending.resolve(false);
  await assert.rejects(restoring, /restore track sync offsets/);
  assert.equal(storage.getItemRaw(settingKey), "32");
});

for (const offsetsCommitted of [false, true]) {
  test(`reopening after ${offsetsCommitted ? "committed" : "uncommitted"} offsets recovers the correct settings`, async () => {
    const family = "ivLyrics:visual:font-family";
    const harness = createHarness({ local: { [settingKey]: "24" } });
    await harness.api.ready;
    const batch = harness.api.beginImportBatch([[settingKey, "32"], [family, "Imported"]], { durable: true });
    const journal = JSON.parse(harness.values.get(pendingImportKey));
    assert.equal(journal.id, batch.restoreId);
    const reopened = createHarness({
      local: Object.fromEntries(harness.values), synchronous: harness.synchronousRecord, indexed: harness.indexedRecord,
      receipt: offsetsCommitted ? batch.restoreId : "an-earlier-import",
    });
    assert.equal((await reopened.api.ready).restoredCount, offsetsCommitted ? 0 : 2);
    assert.equal(reopened.values.get(settingKey), offsetsCommitted ? "32" : "24");
    assert.equal(reopened.values.has(family), offsetsCommitted);
    assert.equal(reopened.values.has(pendingImportKey), false);
    assert.equal(reopened.synchronousRecord.settings[settingKey], offsetsCommitted ? "32" : "24");
  });
}

test("export waits for the startup snapshot and includes settings recovered from IndexedDB", async () => {
  const family = "ivLyrics:visual:font-family";
  const harness = createHarness({
    deferRead: true,
    indexed: { revision: 42, settings: { [family]: "Recovered" } },
  });
  let offsetReads = 0;
  const storage = createSettingsStorage({
    persistence: harness.api, localStorage: harness.localStorage,
    offsetStore: { getAllOffsets: async () => { offsetReads++; return {}; } },
  });
  const exported = storage.exportConfig();
  await tickUntil(() => harness.hasReadRequest);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(offsetReads, 0);
  harness.completeRead();
  assert.equal((await exported)[family], "Recovered");
  assert.equal(offsetReads, 1);
});

test("reset waits for startup recovery before clearing imported settings", async () => {
  const family = "ivLyrics:visual:font-family";
  const harness = createHarness({
    local: { [settingKey]: "24" }, deferRead: true,
    indexed: { revision: 42, settings: { [family]: "Recovered" } },
  });
  const storage = createSettingsStorage({ persistence: harness.api, localStorage: harness.localStorage });
  const resetting = storage.clearConfig();
  await tickUntil(() => harness.hasReadRequest);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(harness.values.get(settingKey), "24");
  harness.completeRead();
  await resetting;
  assert.equal(harness.values.has(settingKey), false);
  assert.equal(harness.values.has(family), false);
  assert.deepEqual(harness.indexedRecord.settings, {});
});

test("settings backup and reset leave a pending import alone when its receipt could not be read", async () => {
  const journal = JSON.stringify({ id: "fixture-import", changes: [
    { key: settingKey, value: "32", previous: "24" },
  ] });
  const harness = createHarness({ local: { [pendingImportKey]: journal, [settingKey]: "32" } });
  harness.failOpen = true;
  await harness.api.ready;
  const storage = createSettingsStorage({ persistence: harness.api, localStorage: harness.localStorage });
  await assert.rejects(storage.exportCloudConfig(), /interrupted settings import/);
  await assert.rejects(storage.importCloudConfig({ [settingKey]: "52" }), /interrupted settings import/);
  await assert.rejects(storage.clearConfig(), /interrupted settings import/);
  assert.throws(() => harness.api.clear([pendingImportKey]), /interrupted settings import/);
  assert.equal(harness.values.get(pendingImportKey), journal);
  assert.equal(harness.values.get(settingKey), "32");
  assert.equal(harness.values.has(resetKey), false);
});

test("a later explicit edit with the same value survives recovery from an interrupted import", async () => {
  const family = "ivLyrics:visual:font-family";
  const harness = createHarness({ local: { [settingKey]: "24" } });
  await harness.api.ready;
  harness.api.beginImportBatch([[settingKey, "32"], [family, "Imported"]], { durable: true });
  harness.api.setItem(settingKey, "49");
  harness.api.setItem(settingKey, "32");
  await harness.api.flush();
  assert.deepEqual(JSON.parse(harness.values.get(pendingImportKey)).changes.map(change => change.key), [family]);

  const reopened = createHarness({
    local: Object.fromEntries(harness.values), synchronous: harness.synchronousRecord, indexed: harness.indexedRecord,
  });
  assert.equal((await reopened.api.ready).restoredCount, 1);
  assert.equal(reopened.values.get(settingKey), "32");
  assert.equal(reopened.values.has(family), false);
  assert.equal(reopened.values.has(pendingImportKey), false);
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
    indexed: { revision: Date.now() - 60_000, settings: { [settingKey]: "backup", [recoveredKey]: "blue", "foreign-key": "ignore" } },
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

test("a newer IndexedDB backup corrects provisional synchronous settings and respects live values", async () => {
  const setup = "ivLyrics:setup-completed";
  const removed = "ivLyrics:visual:font-family";
  const local = "ivLyrics:visual:alignment";
  const edited = "ivLyrics:visual:phonetic-font-size";
  const harness = createHarness({
    deferRead: true,
    local: { [local]: "right" },
    synchronous: { revision: 10, settings: { [setup]: "true", [settingKey]: "24", [removed]: "Old", [edited]: "19" } },
    indexed: { revision: 11, settings: { [setup]: "true", [settingKey]: "48", [local]: "left", [edited]: "22" } },
  });
  assert.equal(harness.values.get(settingKey), "24");
  assert.equal(harness.values.get(removed), "Old");
  const storage = createSettingsStorage({ persistence: harness.api, localStorage: harness.localStorage });
  storage.setItemRaw(edited, "19");

  await tickUntil(() => harness.hasReadRequest);
  harness.completeRead();
  assert.equal((await harness.api.ready).restoredCount, 2);
  const expected = { [setup]: "true", [settingKey]: "48", [local]: "right", [edited]: "19" };
  assert.deepEqual(harness.indexedRecord.settings, expected);
  assert.deepEqual(harness.synchronousRecord.settings, expected);
  assert.equal(harness.api.getItem(removed), null);
  assert.equal(harness.values.has(removed), false);
  assert.equal(harness.values.get(settingKey), "48");
  assert.deepEqual(harness.historyChanges, ["/"]);
});

test("cold startup waits for Spotify's storage namespace before reading or replacing its backups", async () => {
  const localKey = "ivLyrics:visual:alignment";
  const harness = createHarness({
    deferPlatformStorage: true, deferRead: true,
    synchronous: { namespace: "test-user", revision: 10, settings: { [settingKey]: "24", [localKey]: "left" } },
    indexed: { namespace: "test-user", revision: 11, settings: { [settingKey]: "48", [localKey]: "center" } },
  });
  assert.equal(harness.hasReadRequest, false);
  harness.api.setItem(localKey, "right");
  assert.equal(harness.values.get(localKey), "right");
  harness.makePlatformStorageReady();
  harness.api.setItem(localKey, "left");
  assert.equal(harness.syncWrites.length, 0);
  harness.timers.shift().callback();

  await tickUntil(() => harness.hasReadRequest);
  harness.completeRead();
  await harness.api.ready;
  assert.equal(harness.values.get(settingKey), "48");
  assert.equal(harness.values.get(localKey), "left");
  assert.equal(harness.synchronousRecord.namespace, "test-user");
  assert.deepEqual(harness.indexedRecord.settings, { [settingKey]: "48", [localKey]: "left" });
});

test("startup without Spotify's native storage still loads the default backup after the bounded wait", async () => {
  const harness = createHarness({
    deferPlatformStorage: true,
    indexed: { namespace: "default", revision: 10, settings: { [settingKey]: "36" } },
  });
  let elapsed = 0;
  while (harness.timers.length) {
    const { delay, callback } = harness.timers.shift();
    elapsed += delay;
    callback();
  }
  await harness.api.ready;
  assert.equal(elapsed, 3000);
  assert.equal(harness.values.get(settingKey), "36");
  assert.equal(harness.indexedRecord.namespace, "default");
});

test("an older IndexedDB backup cannot resurrect settings deleted from the synchronous snapshot", async () => {
  const removed = "ivLyrics:visual:font-family";
  const harness = createHarness({
    synchronous: { revision: 21, settings: { [settingKey]: "48" } },
    indexed: { revision: 20, settings: { [settingKey]: "24", [removed]: "Old" } },
  });
  assert.equal((await harness.api.ready).restoredCount, 0);
  assert.deepEqual(harness.indexedRecord.settings, { [settingKey]: "48" });
  assert.equal(harness.api.getItem(removed), null);
});

test("a failed native recovery write still leaves the latest backup intact", async () => {
  const harness = createHarness({
    deferRead: true,
    synchronous: { revision: 10, settings: { [settingKey]: "24" } },
    indexed: { revision: 11, settings: { [settingKey]: "48" } },
  });
  await tickUntil(() => harness.hasReadRequest);
  harness.failLocal = true;
  harness.completeRead();
  assert.equal((await harness.api.ready).restoredCount, 0);
  assert.equal(harness.values.get(settingKey), "24");
  assert.deepEqual(harness.synchronousRecord.settings, { [settingKey]: "48" });
  assert.deepEqual(harness.indexedRecord.settings, { [settingKey]: "48" });
  assert.match(harness.warnings[0][0], /Failed to recover setting/);
});

test("startup keeps changes made during the backup read and recovers other missing settings", async () => {
  const removed = "ivLyrics:visual:original-font-family";
  const recovered = "ivLyrics:visual:panel-bg-color";
  const harness = createHarness({
    deferRead: true,
    indexed: { revision: Date.now() - 60_000, settings: { [settingKey]: "24", [removed]: "old", [recovered]: "blue" } },
  });
  harness.api.setItem(settingKey, "40");
  harness.api.removeItem(removed);
  const flush = harness.api.flush();
  await tickUntil(() => harness.hasReadRequest);
  assert.equal(harness.writes.length, 0, "startup writes must not replace the unread snapshot");
  harness.completeRead();
  assert.deepEqual(clone(await harness.api.ready), { restoredCount: 1 });
  await flush;
  assert.equal(harness.values.get(settingKey), "40");
  assert.equal(harness.values.has(removed), false);
  assert.equal(harness.values.get(recovered), "blue");
  assert.deepEqual(harness.indexedRecord.settings, { [settingKey]: "40", [recovered]: "blue" });
});

test("startup typography defaults yield to recovered settings while an explicit edit stays authoritative", async () => {
  const untouched = "ivLyrics:visual:fullscreen-vinyl-original-font-size";
  const edited = "ivLyrics:visual:fullscreen-vinyl-phonetic-font-size";
  const harness = createHarness({
    deferRead: true,
    indexed: { revision: Date.now() - 60_000, settings: { [untouched]: "36", [edited]: "29" } },
  });
  harness.api.seedItem(untouched, 31);
  harness.api.seedItem(edited, 19);
  assert.equal(harness.values.get(untouched), "31");
  assert.equal(harness.synchronousRecord, null);
  harness.api.setItem(edited, 19);

  await tickUntil(() => harness.hasReadRequest);
  harness.completeRead();
  assert.deepEqual(clone(await harness.api.ready), { restoredCount: 1 });
  assert.deepEqual(harness.indexedRecord.settings, { [untouched]: "36", [edited]: "19" });
});

test("reset while the first backup read is pending cannot resurrect deleted settings", async () => {
  const harness = createHarness({
    deferRead: true,
    local: { [settingKey]: "local" },
    indexed: { revision: Date.now() + 60_000, settings: { [settingKey]: "backup" } },
  });
  const clear = harness.api.clear();
  assert.equal(harness.values.has(settingKey), false);
  await tickUntil(() => harness.hasReadRequest);
  harness.completeRead();
  await clear;
  assert.deepEqual(clone(await harness.api.ready), { restoredCount: 0 });
  assert.deepEqual(harness.indexedRecord.settings, {});
  assert.equal(harness.values.has(settingKey), false);
});

test("switching namespaces during recovery does not restore the previous account backup", async () => {
  const harness = createHarness({
    deferRead: true,
    indexed: { revision: Date.now() + 60_000, settings: { [settingKey]: "old account" } },
  });
  await tickUntil(() => harness.hasReadRequest);
  harness.namespace = "different-user";
  harness.completeRead();
  await tickUntil(() => harness.hasReadRequest);
  assert.equal(harness.writes.length, 0);
  harness.completeRead({ revision: Date.now() - 60_000, settings: { [settingKey]: "current account" } });
  assert.deepEqual(clone(await harness.api.ready), { restoredCount: 1 });
  assert.equal(harness.values.get(settingKey), "current account");
  assert.equal(harness.indexedRecord.namespace, "different-user");
});

test("a missing setting is never recovered or exported from the previous namespace", async () => {
  const harness = createHarness({ local: { [settingKey]: "previous account" } });
  await harness.api.ready;
  harness.namespace = "different-user";
  harness.values.delete(settingKey);
  const storage = createSettingsStorage({ persistence: harness.api, localStorage: harness.localStorage });

  assert.deepEqual(clone(harness.api.getSnapshot()), {});
  assert.equal(harness.api.getItem(settingKey), null);
  assert.deepEqual(await storage.exportCloudConfig(), {});
  assert.equal(harness.values.has(settingKey), false);
});

test("startup ignores a recovery snapshot explicitly belonging to another namespace", async () => {
  const other = { namespace: "different-user", revision: Date.now(), settings: { [settingKey]: "other account" } };
  const harness = createHarness({ synchronous: other, indexed: other });
  assert.equal(harness.values.has(settingKey), false);
  assert.deepEqual(clone(await harness.api.ready), { restoredCount: 0 });
  assert.deepEqual(harness.indexedRecord.settings, {});
});

test("an account change during startup excludes the earlier account from the rebuilt snapshot", async () => {
  const first = { namespace: "test-user", revision: Date.now(), settings: { [settingKey]: "previous account" } };
  const otherKey = "ivLyrics:visual:font-family";
  const harness = createHarness({ synchronous: first, deferRead: true });
  assert.equal(harness.values.get(settingKey), "previous account");
  await tickUntil(() => harness.hasReadRequest);
  harness.namespace = "different-user";
  harness.completeRead(first);
  await tickUntil(() => harness.hasReadRequest);
  harness.completeRead({ namespace: "different-user", revision: first.revision + 1, settings: { [otherKey]: "Current" } });

  assert.deepEqual(clone(await harness.api.ready), { restoredCount: 2 });
  assert.deepEqual(harness.indexedRecord.settings, { [otherKey]: "Current" });
  assert.equal(harness.values.has(settingKey), false);
  assert.equal(harness.api.getItem(settingKey), null);
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

test("a completed reset suppresses both old mirrors when both reset mirror writes fail", async () => {
  const harness = createHarness({ local: { [settingKey]: "previous" } });
  await harness.api.ready;
  harness.failSync = true;
  harness.failOpen = true;
  await harness.api.clear();

  assert.equal(harness.synchronousRecord.settings[settingKey], "previous");
  assert.equal(harness.indexedRecord.settings[settingKey], "previous");
  const reopened = createHarness({
    local: Object.fromEntries(harness.values),
    synchronous: harness.synchronousRecord,
    indexed: harness.indexedRecord,
  });
  assert.equal(reopened.api.getItem(settingKey), null, "synchronous recovery cannot undo a reset");
  assert.equal((await reopened.api.ready).restoredCount, 0, "IndexedDB recovery cannot undo a reset");
  assert.equal(reopened.values.has(settingKey), false);
  assert.ok(reopened.indexedRecord.resetRevision > 0);
});

test("the reset record retains new edits and leaves independent accounts eligible for recovery", async () => {
  const oldOnly = "ivLyrics:visual:old-setting";
  const harness = createHarness({ local: { [oldOnly]: "old", [settingKey]: "old" } });
  await harness.api.ready;
  harness.failSync = true;
  await harness.api.clear();
  harness.api.setItem(settingKey, "after reset");
  await harness.api.flush();
  const marker = { [resetKey]: harness.values.get(resetKey) };
  const reopened = createHarness({
    local: marker, synchronous: harness.synchronousRecord, indexed: harness.indexedRecord,
  });
  assert.equal((await reopened.api.ready).restoredCount, 1);
  assert.equal(reopened.api.getItem(settingKey), "after reset");
  assert.equal(reopened.api.getItem(oldOnly), null);

  const otherAccount = createHarness({
    local: marker,
    namespace: "other-user",
    indexed: { revision: Date.now(), settings: { [settingKey]: "other account" } },
  });
  assert.equal((await otherAccount.api.ready).restoredCount, 1);
  assert.equal(otherAccount.api.getItem(settingKey), "other account");
});

test("another live settings owner cannot restore deleted values after the same account resets", async () => {
  const other = "ivLyrics:visual:other-setting";
  const primary = createHarness({ local: { [settingKey]: "original" } });
  await primary.api.ready;
  const secondary = createHarness({
    local: primary.values, synchronous: primary.synchronousRecord, indexed: primary.indexedRecord,
  });
  await secondary.api.ready;
  await primary.api.clear();
  assert.equal(secondary.api.getItem(settingKey), null);
  assert.equal(primary.values.has(settingKey), false);
  secondary.api.setItem(other, "new");
  await secondary.api.flush();
  assert.deepEqual(secondary.indexedRecord.settings, { [other]: "new" });
  assert.equal(secondary.indexedRecord.resetRevision, primary.indexedRecord.resetRevision);
});

test("a failed native reset record write rolls back the reset and preserves its recovery snapshots", async () => {
  const custom = "ivLyrics:legacy-option";
  const local = { [settingKey]: "original", [custom]: "also original" };
  const harness = createHarness({ local });
  await harness.api.ready;
  const writes = harness.writes.length;
  harness.failResetRecord = true;
  assert.throws(() => harness.api.clear([custom]), /simulated reset record write failure/);
  assert.deepEqual(Object.fromEntries(harness.values), local);
  assert.equal(harness.writes.length, writes);
  assert.equal(harness.synchronousRecord.settings[settingKey], "original");
  assert.equal(harness.indexedRecord.settings[settingKey], "original");
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
