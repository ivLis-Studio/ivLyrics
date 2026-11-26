import assert from "node:assert/strict";
import test from "node:test";
import { getTrackSyncOffsetStore } from "#ivlyrics/core/trackSyncOffsetRuntime.mjs";
import {
  createTrackSyncOffsetStore, migrateTrackSyncOffsets, TRACK_SYNC_IMPORT_RECEIPT_KEY,
  TRACK_SYNC_OFFSETS_RESTORED_KEY, TRACK_SYNC_OFFSETS_STORAGE_KEY,
} from "#ivlyrics/core/trackSyncOffsetStore.mjs";
import { createSettingsStorage } from "#ivlyrics/core/createSettingsStorage.mjs";
import { publishSettingsPersistence } from "#ivlyrics/core/settingsRuntime.mjs";

// Minimal fake IndexedDB that properly simulates transaction completion
const createFakeIndexedDB = (initialData = {}) => {
  const data = new Map(Object.entries(initialData));
  let dbInstance = null;
  let opens = 0;

  const createStore = () => ({
    count: () => {
      const req = {};
      queueMicrotask(() => {
        req.result = data.size;
        req.onsuccess?.();
      });
      return req;
    },
    clear: () => {
      const req = {};
      queueMicrotask(() => {
        data.clear();
        req.onsuccess?.();
      });
      return req;
    },
    put: (value, key) => {
      data.set(key, value);
      const req = {};
      queueMicrotask(() => {
        req.onsuccess?.();
      });
      return req;
    },
    getAllKeys: () => {
      const req = {};
      queueMicrotask(() => {
        req.result = [...data.keys()];
        req.onsuccess?.();
      });
      return req;
    },
    getAll: () => {
      const req = {};
      queueMicrotask(() => {
        req.result = [...data.values()];
        req.onsuccess?.();
      });
      return req;
    },
    get: (key) => {
      const req = {};
      queueMicrotask(() => {
        req.result = data.has(key) ? data.get(key) : undefined;
        req.onsuccess?.();
      });
      return req;
    },
  });

  const open = () => {
    opens++;
    const request = {};
    queueMicrotask(() => {
      if (!dbInstance) {
        dbInstance = {
          objectStoreNames: { contains: () => true },
          createObjectStore: () => createStore(),
          transaction: (_storeName, _mode) => {
            const transaction = {
              objectStore: createStore,
              oncomplete: null,
              onerror: null,
              onabort: null,
            };
            // Real IndexedDB fires oncomplete after requests settle.
            // Fire on a macrotask so handlers assigned synchronously
            // after transaction() returns are observed.
            setTimeout(() => {
              try {
                transaction.oncomplete?.();
              } catch {
                // Handlers own their errors; never break the mock.
              }
            }, 0);
            return transaction;
          },
          close: () => {},
        };
      }
      request.result = dbInstance;
      request.onsuccess?.();
    });
    return request;
  };

  return { open, data, get opens() { return opens; } };
};

const createHarness = ({ existingOffsets = null, legacyOffsets = null } = {}) => {
  const values = new Map();
  if (legacyOffsets !== null) {
    values.set("ivLyrics:track-sync-offsets", legacyOffsets);
  }

  const localStorage = {
    get length() { return values.size; },
    key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };

  const indexedDB = createFakeIndexedDB(existingOffsets || {});

  const warnings = [];
  const errors = [];
  const logs = [];

  const logger = { warn: (...args) => warnings.push(args), error: (...args) => errors.push(args) };
  const debug = (...args) => logs.push(args);
  const offsetStore = createTrackSyncOffsetStore({ getIndexedDB: () => indexedDB, debug, logger });
  return {
    values,
    localStorage,
    offsetStore,
    indexedDB,
    indexedDBData: indexedDB.data,
    warnings,
    errors,
    logs,
    migration: migrateTrackSyncOffsets({ localStorage, offsetStore, debug, logger }),
  };
};

test("the startup and page offset APIs wait for legacy migration before reading or writing", async () => {
  const key = "ivLyrics:track-sync-offsets";
  const firstTrack = "spotify:track:first";
  const otherTrack = "spotify:track:other";
  const values = new Map([[key, JSON.stringify({ [firstTrack]: 100, [otherTrack]: 250 })]]);
  const host = {
    indexedDB: createFakeIndexedDB(),
    localStorage: { getItem: (key) => values.get(key), removeItem: (key) => values.delete(key) },
  };
  const startup = getTrackSyncOffsetStore(host);
  const page = getTrackSyncOffsetStore(host);
  const pendingRead = startup.getOffset(otherTrack);
  const pendingWrite = page.setOffset(firstTrack, 600);
  assert.equal(startup, page);
  assert.equal(host.TrackSyncDB, startup);
  assert.deepEqual(await Promise.all([pendingRead, pendingWrite]), [250, true]);
  assert.deepEqual(await page.getAllOffsets(), { [firstTrack]: 600, [otherTrack]: 250 });
  assert.equal(host.indexedDB.opens, 1);
  assert.equal(values.has(key), false);
});

test("offset playback and legacy migration wait for rollback of an interrupted database restore", async () => {
  const track = "spotify:track:fixture";
  const values = new Map([[TRACK_SYNC_OFFSETS_STORAGE_KEY, JSON.stringify({ [track]: 125 })]]);
  const indexedDB = createFakeIndexedDB({ [track]: 900, [TRACK_SYNC_OFFSETS_RESTORED_KEY]: true });
  const host = {
    indexedDB,
    localStorage: { getItem: key => values.get(key), removeItem: key => values.delete(key) },
  };
  const recovery = Promise.withResolvers();
  publishSettingsPersistence(host, { databasesReady: recovery.promise });
  const store = getTrackSyncOffsetStore(host);
  const read = store.getOffset(track);
  try {
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(indexedDB.opens, 0);
    assert.equal(values.has(TRACK_SYNC_OFFSETS_STORAGE_KEY), true);
  } finally {
    indexedDB.data.clear();
    recovery.resolve();
  }
  assert.equal(await read, 125);
  assert.equal(values.has(TRACK_SYNC_OFFSETS_STORAGE_KEY), false);
});

test("concurrent reads reuse a single connection and reopen after a failed attempt", async () => {
  const uri = "spotify:track:offset";
  const indexedDB = createFakeIndexedDB({ [uri]: -500 });
  let attempts = 0;
  const host = { indexedDB: {
    open() {
      attempts++;
      if (attempts > 1) return indexedDB.open();
      const request = { error: new Error("Database temporarily unavailable") };
      queueMicrotask(() => request.onerror());
      return request;
    },
  } };
  const store = getTrackSyncOffsetStore(host, { logger: { warn() {}, error() {} } });
  assert.deepEqual(await Promise.all([store.getOffset(uri), store.getOffset(uri)]), [0, 0]);
  assert.equal(attempts, 1);
  assert.deepEqual(await Promise.all([store.getOffset(uri), store.getOffset(uri)]), [-500, -500]);
  assert.equal(attempts, 2);
  assert.equal(indexedDB.opens, 1);
});

test("migration does not overwrite existing IndexedDB offsets with older localStorage data", async () => {
  const harness = createHarness({
    existingOffsets: { "spotify:track:abc": 5000 },
    legacyOffsets: JSON.stringify({ "spotify:track:abc": 1000 }),
  });

  await harness.migration;

  // The existing IndexedDB offset (5000) should NOT be overwritten by the legacy localStorage value (1000)
  assert.equal(
    harness.indexedDBData.get("spotify:track:abc"),
    5000,
    "Existing IndexedDB offsets must not be overwritten by legacy localStorage data"
  );
});

test("migration proceeds when IndexedDB has no existing offsets", async () => {
  const harness = createHarness({
    existingOffsets: null,
    legacyOffsets: JSON.stringify({ "spotify:track:abc": 1000 }),
  });

  await harness.migration;

  assert.equal(
    harness.indexedDBData.get("spotify:track:abc"),
    1000,
    "Legacy offsets should be migrated when IndexedDB is empty"
  );
  assert.equal(
    harness.values.has("ivLyrics:track-sync-offsets"),
    false,
    "Legacy localStorage key should be removed after successful migration"
  );
});

test("migration preserves offsets saved before its write transaction gets the store", async () => {
  const uri = "spotify:track:abc";
  const legacyOffsets = JSON.stringify({ [uri]: 1000 });
  const harness = createHarness({ legacyOffsets });
  queueMicrotask(() => harness.indexedDBData.set(uri, 5000));

  await harness.migration;

  assert.equal(harness.indexedDBData.get(uri), 5000);
  assert.equal(harness.values.get("ivLyrics:track-sync-offsets"), legacyOffsets);
});

test("an intentionally empty settings backup stays empty after startup migrates legacy offsets", async () => {
  const track = "spotify:track:fixture";
  const h = createHarness({
    existingOffsets: { [track]: 320 },
    legacyOffsets: JSON.stringify({ [track]: 190 }),
  });
  await h.migration;
  assert.equal(h.values.has(TRACK_SYNC_OFFSETS_STORAGE_KEY), true);
  const config = createSettingsStorage({ localStorage: h.localStorage, offsetStore: h.offsetStore });
  await config.importConfig({ [TRACK_SYNC_OFFSETS_STORAGE_KEY]: "{}" });
  const startup = getTrackSyncOffsetStore({ indexedDB: h.indexedDB, localStorage: h.localStorage });
  assert.equal(await startup.getOffset(track), 0);
  assert.deepEqual(await startup.getAllOffsets(), {});
  assert.deepEqual(await config.exportConfig(), { [TRACK_SYNC_OFFSETS_STORAGE_KEY]: "{}" });
  assert.equal(h.indexedDBData.get(TRACK_SYNC_OFFSETS_RESTORED_KEY), true);
  assert.equal(h.indexedDBData.has(TRACK_SYNC_IMPORT_RECEIPT_KEY), false, "an offset-only backup has no settings journal");
});

test("an earlier import receipt is enough to keep a restored empty store authoritative", async () => {
  const h = createHarness({
    existingOffsets: { [TRACK_SYNC_IMPORT_RECEIPT_KEY]: "earlier-settings-import" },
    legacyOffsets: '{"spotify:track:old":170}',
  });
  await h.migration;
  assert.deepEqual(await h.offsetStore.getAllOffsets(), {});
  assert.equal(h.indexedDBData.get(TRACK_SYNC_IMPORT_RECEIPT_KEY), "earlier-settings-import");
});

test("migration keeps legacy data when IndexedDB import fails", async () => {
  const values = new Map();
  values.set("ivLyrics:track-sync-offsets", JSON.stringify({ "spotify:track:abc": 1000 }));

  const localStorage = {
    get length() { return values.size; },
    key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };

  const indexedDB = {
    open() {
      throw new Error("IndexedDB unavailable");
    },
  };

  const logger = { warn() {}, error() {} };
  const debug = () => {};
  const offsetStore = createTrackSyncOffsetStore({ getIndexedDB: () => indexedDB, debug, logger });
  await migrateTrackSyncOffsets({ localStorage, offsetStore, debug, logger });

  assert.equal(
    values.has("ivLyrics:track-sync-offsets"),
    true,
    "Legacy localStorage key must be preserved when IndexedDB import fails"
  );
});
