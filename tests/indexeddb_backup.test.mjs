import assert from "node:assert/strict";
import test from "node:test";
import { createIndexedDbBackup } from "#ivlyrics/core/indexedDbBackup.mjs";
import { DATABASE_BACKUP_RECEIPT_KEY } from "#ivlyrics/core/indexedDbBackupReceipt.mjs";
import { createIndexedDbBackupJournal } from "#ivlyrics/core/indexedDbBackupJournal.mjs";
import { createSettingsStorage } from "#ivlyrics/core/createSettingsStorage.mjs";
import { createSelectedVideoStore } from "#ivlyrics/features/video/selectedVideoStore.mjs";
import { runIdbTransaction } from "#ivlyrics/core/indexedDbTransaction.mjs";
import {
  createTrackSyncOffsetStore, migrateTrackSyncOffsets, TRACK_SYNC_IMPORT_RECEIPT_KEY,
  TRACK_SYNC_OFFSETS_RESTORED_KEY, TRACK_SYNC_OFFSETS_STORAGE_KEY,
} from "#ivlyrics/core/trackSyncOffsetStore.mjs";
import { runSettingsImportLocked, SETTINGS_IMPORT_JOURNAL_KEY } from "#ivlyrics/core/settingsImportJournal.mjs";

function fixture({ legacyVideos, disk } = {}) {
  const databases = disk?.databases ?? new Map(legacyVideos ? [["ivLyricsSelectedVideos", {
    version: 1,
    stores: new Map([["selectedVideos", { keyPath: null, records: new Map(legacyVideos), indexes: new Set() }]]),
  }]] : []);
  const settings = disk?.settings ?? new Map();
  const writes = [];
  const opens = [];
  const failures = new Map();
  const pauses = new Map();
  const indexedDB = {
    async databases() { return [...databases.keys()].map(name => ({ name })); },
    cmp(a, b) {
      const valid = key => typeof key === "string" || Number.isFinite(key);
      if (!valid(a) || !valid(b)) throw new TypeError("Invalid key");
      return a === b ? 0 : a > b ? 1 : -1;
    },
    open(name, version) {
      opens.push([name, version]);
      const request = {};
      queueMicrotask(() => {
        let record = databases.get(name);
        if (record && record.version > version) {
          request.error = new Error("VersionError");
          request.onerror();
          return;
        }
        const oldVersion = record?.version || 0;
        if (!record) {
          record = { version, stores: new Map() };
          databases.set(name, record);
        }
        record.version = version;
        const db = request.result = {
          name, version, close() {},
          objectStoreNames: { contains: store => record.stores.has(store) },
          createObjectStore(store, options) {
            const indexes = new Set();
            record.stores.set(store, { keyPath: options?.keyPath ?? null, records: new Map(), indexes });
            return { createIndex(name) { indexes.add(name); } };
          },
          deleteObjectStore: store => record.stores.delete(store),
          transaction(storeNames, mode) {
            const names = Array.isArray(storeNames) ? storeNames : [storeNames];
            const working = new Map(names.map(store => [store, new Map(record.stores.get(store).records)]));
            let aborted = false;
            const transaction = {
              abort() { aborted = true; transaction.onabort?.(); },
              objectStore(store) {
                const { keyPath, indexes } = record.stores.get(store);
                return {
                  keyPath,
                  indexNames: { contains: name => indexes.has(name) },
                  openCursor() {
                    const iter = working.get(store).entries();
                    const req = {};
                    const read = () => queueMicrotask(() => {
                      const { done, value } = iter.next();
                      req.result = done ? null : { key: value[0], value: value[1], continue: read };
                      req.onsuccess?.({ target: req });
                    });
                    read();
                    return req;
                  },
                  clear: () => working.get(store).clear(),
                  delete(key) {
                    const req = {};
                    working.get(store).delete(key);
                    queueMicrotask(() => req.onsuccess?.());
                    return req;
                  },
                  put(value, key) {
                    if (keyPath ? key !== undefined || value?.[keyPath] === undefined : key === undefined) {
                      throw new DOMException("Missing or unexpected record key", "DataError");
                    }
                    working.get(store).set(keyPath ? value[keyPath] : key, structuredClone(value));
                  },
                  get(key) {
                    const req = {};
                    queueMicrotask(() => { req.result = working.get(store).get(key); req.onsuccess?.(); });
                    return req;
                  },
                  getAllKeys() {
                    const req = {};
                    queueMicrotask(() => { req.result = [...working.get(store).keys()]; req.onsuccess?.(); });
                    return req;
                  },
                  getAll() {
                    const req = {};
                    queueMicrotask(() => { req.result = [...working.get(store).values()]; req.onsuccess?.(); });
                    return req;
                  },
                  count() {
                    const req = {};
                    queueMicrotask(() => { req.result = working.get(store).size; req.onsuccess?.(); });
                    return req;
                  },
                };
              },
            };
            if (mode === "readwrite") writes.push([name, names]);
            setImmediate(async () => {
              if (aborted) return;
              if (mode === "readwrite") {
                const pause = pauses.get(name);
                if (pause) {
                  pauses.delete(name);
                  pause.entered.resolve();
                  await pause.release.promise;
                }
                if (failures.has(name)) {
                  const onFailure = failures.get(name);
                  failures.delete(name);
                  onFailure?.();
                  transaction.error = new Error("fixture commit aborted");
                  transaction.onabort?.();
                  return;
                }
                for (const [store, rows] of working) record.stores.get(store).records = rows;
              }
              transaction.oncomplete?.();
            });
            return transaction;
          },
        };
        if (oldVersion !== version) request.onupgradeneeded?.({ oldVersion, target: { result: db } });
        request.onsuccess();
      });
      return request;
    },
  };
  const localStorage = {
    get length() { return settings.size; },
    key: index => [...settings.keys()][index] ?? null,
    getItem: key => settings.get(key) ?? null,
    removeItem: key => settings.delete(key),
  };
  const offsetStore = createTrackSyncOffsetStore({ getIndexedDB: () => indexedDB, debug() {} });
  return {
    backup: createIndexedDbBackup({
      readIndexedDb: () => indexedDB,
      readLocalStorage: () => localStorage,
    }),
    indexedDB, opens, writes, settings, localStorage,
    video: createSelectedVideoStore({ getIndexedDb: () => indexedDB }),
    offsetStore,
    migrateOffsets: () => migrateTrackSyncOffsets({ localStorage, offsetStore, debug() {} }),
    reject: (name, onFailure) => failures.set(name, onFailure),
    pause(name) {
      const pause = { entered: Promise.withResolvers(), release: Promise.withResolvers() };
      pauses.set(name, pause);
      return pause;
    },
    liveRows: (name, store) => databases.get(name).stores.get(store).records,
    snapshotDisk: () => structuredClone({ databases, settings }),
  };
}

const track = "spotify:track:fixture";
const lyricKey = "fixture:spotify";
const cache = text => ({
  ivLyricsCache: {
    lyrics: [{ key: lyricKey, value: { cacheKey: lyricKey, data: { synced: [{ text }], creator: { name: "Fixture" } } } }],
    metadata: [{ key: "fixture:ko", value: { cacheKey: "fixture:ko", data: { title: text } } }],
  },
});

test("startup recovery and route backups share one fallback lock without Web Locks", async () => {
  // The startup extension and route bundle each contain the module.
  const route = await import("../src/core/settingsImportJournal.mjs?route-fixture");
  const host = {};
  const entered = Promise.withResolvers();
  const fail = Promise.withResolvers();
  const events = [];
  const first = runSettingsImportLocked(async () => {
    events.push("recover");
    entered.resolve();
    await fail.promise;
    throw new Error("simulated interrupted recovery");
  }, host);
  const second = route.runSettingsImportLocked(() => events.push("import-database"), host);
  await entered.promise;
  await Promise.resolve();
  assert.deepEqual(events, ["recover"]);
  fail.resolve();
  await assert.rejects(first, /interrupted recovery/);
  await second;
  assert.deepEqual(events, ["recover", "import-database"]);
});

test("legacy backup opens the current cache layout, includes overrides, and retains selected-video keys", async () => {
  const h = fixture();
  await h.backup.importAllDBs({
    ...cache("Original"),
    "ivLyrics-provider-db": { "track-lyrics-provider-overrides": [{ key: track, value: "lrclib" }] },
    ivLyricsSelectedVideos: { selectedVideos: [{ key: track, value: { trackUri: track, youtubeVideoId: "fixture-video" } }] },
  });
  const exported = await h.backup.exportAllDBs();
  assert.ok(h.opens.filter(([name]) => name === "ivLyricsCache").every(([, version]) => version === 7));
  assert.equal(exported.ivLyricsCache.lyrics[0].value.data.creator.name, "Anonymous");
  assert.equal(exported.ivLyricsCache.metadata[0].value.data.title, "Original");
  assert.equal(exported["ivLyrics-provider-db"]["track-lyrics-provider-overrides"][0].value, "lrclib");
  assert.equal((await h.video.getSelectedVideo(track)).youtubeVideoId, "fixture-video");
});

test("a version-one video store created by the old backup manager can save and retime selections", async () => {
  const legacy = fixture({ legacyVideos: [[track, { youtubeVideoId: "old-video", captionStartTime: 1 }]] });
  const previous = await legacy.video.getSelectedVideo(track);
  assert.equal(previous.youtubeVideoId, "old-video");
  assert.equal(await legacy.video.updateSelectedVideoSyncOffset(track, { ...previous, captionStartTime: 2 }), true);
  assert.equal((await legacy.video.getSelectedVideo(track)).captionStartTime, 2);
  assert.equal(await legacy.video.replaceHiddenSelectedVideo(track, await legacy.video.getSelectedVideo(track),
    { youtubeVideoId: "replacement" }, () => true), true);
  assert.equal((await legacy.video.getSelectedVideo(track)).youtubeVideoId, "replacement");
  assert.equal(await legacy.video.saveSelectedVideo(track, { youtubeVideoId: "new-video" }), true);
  assert.equal((await legacy.video.getSelectedVideo(track)).youtubeVideoId, "new-video");
  assert.equal(await legacy.video.removeSelectedVideo(track), true);
  assert.equal(await legacy.video.getSelectedVideo(track), null);
  assert.ok(legacy.opens.every(([, version]) => version === 1));
});

test("an old selected-video backup can restore external keys into the current inline-key store", async () => {
  const value = { youtubeVideoId: "legacy-video", captionStartTime: 1 };
  const legacy = fixture({ legacyVideos: [[track, value]] });
  const fresh = fixture();
  const before = await legacy.backup.exportAllDBs();
  const oldFile = { ivLyricsSelectedVideos: { selectedVideos: [{ key: track, value }] } };
  await fresh.backup.importAllDBs(oldFile);
  const expected = { ...value, trackUri: track };
  assert.deepEqual(await fresh.video.getSelectedVideo(track), expected);
  assert.deepEqual(before.ivLyricsSelectedVideos.selectedVideos, [{ key: track, value: expected }]);
});

test("an invalid key in a later database is rejected before changing any live store", async () => {
  const h = fixture();
  await h.backup.importAllDBs({ "ivLyrics-db": { "track-sync-offsets": [{ key: track, value: 25 }] } });
  const writes = h.writes.length;
  await assert.rejects(h.backup.importAllDBs({
    "ivLyrics-db": { "track-sync-offsets": [{ key: track, value: 100 }] },
    ivLyricsCache: { metadata: [{ key: "original", value: { cacheKey: "other" } }] },
  }), /Invalid record key for ivLyricsCache\/metadata/);
  assert.equal(h.writes.length, writes);
  assert.equal((await h.backup.exportAllDBs())["ivLyrics-db"]["track-sync-offsets"][0].value, 25);
});

test("database backup files cannot export or replace a private settings restore receipt", async () => {
  const h = fixture();
  const records = [{ key: track, value: 25 }];
  await h.backup.importAllDBs({ "ivLyrics-db": { "track-sync-offsets": records } });
  h.liveRows("ivLyrics-db", "track-sync-offsets").set(TRACK_SYNC_IMPORT_RECEIPT_KEY, "internal");
  assert.deepEqual((await h.backup.exportAllDBs())["ivLyrics-db"]["track-sync-offsets"], records);
  await h.backup.importAllDBs({
    "ivLyrics-db": { "track-sync-offsets": [
      { key: track, value: 50 },
      { key: TRACK_SYNC_IMPORT_RECEIPT_KEY, value: "incoming" },
      { key: TRACK_SYNC_OFFSETS_RESTORED_KEY, value: false },
    ] },
  });
  assert.equal(h.liveRows("ivLyrics-db", "track-sync-offsets").has(TRACK_SYNC_IMPORT_RECEIPT_KEY), false);
  assert.equal(h.liveRows("ivLyrics-db", "track-sync-offsets").get(TRACK_SYNC_OFFSETS_RESTORED_KEY), true);
  assert.equal(h.liveRows("ivLyrics-db", "track-sync-offsets").get(track), 50);
});

test("an empty database backup stays empty when legacy offsets are still on disk", async () => {
  const h = fixture();
  h.settings.set(TRACK_SYNC_OFFSETS_STORAGE_KEY, JSON.stringify({ [track]: 150 }));
  await h.backup.importAllDBs({ "ivLyrics-db": { "track-sync-offsets": [] } });
  await h.migrateOffsets();
  assert.equal(await h.offsetStore.getOffset(track), 0);
  assert.deepEqual((await h.backup.exportAllDBs())["ivLyrics-db"]["track-sync-offsets"], []);
});

test("both backups include pending legacy offsets without changing either store", async () => {
  const h = fixture();
  const legacy = JSON.stringify({ [track]: "151.4" });
  h.settings.set(TRACK_SYNC_OFFSETS_STORAGE_KEY, legacy);
  const copy = await h.backup.exportAllDBs();
  assert.deepEqual(copy["ivLyrics-db"]["track-sync-offsets"], [{ key: track, value: 151 }]);
  const settings = createSettingsStorage({ localStorage: h.localStorage, offsetStore: h.offsetStore });
  assert.deepEqual(JSON.parse((await settings.exportConfig())[TRACK_SYNC_OFFSETS_STORAGE_KEY]), { [track]: 151 });
  assert.equal(h.settings.get(TRACK_SYNC_OFFSETS_STORAGE_KEY), legacy);
  assert.equal(h.liveRows("ivLyrics-db", "track-sync-offsets").size, 0);
  assert.deepEqual(h.writes, []);
});

test("invalid offsets in a database backup are rejected before other stores are changed", async () => {
  const h = fixture();
  await h.backup.importAllDBs({
    "ivLyrics-db": { "track-sync-offsets": [{ key: track, value: 25 }] },
    ...cache("Before"),
  });
  const writes = h.writes.length;
  await assert.rejects(h.backup.importAllDBs({
    "ivLyrics-db": { "track-sync-offsets": [{ key: track, value: "invalid offset" }] },
    ...cache("After"),
  }), /invalid entry/);
  assert.equal(h.writes.length, writes);
  assert.equal(await h.offsetStore.getOffset(track), 25);
  assert.equal((await h.backup.exportAllDBs()).ivLyricsCache.metadata[0].value.data.title, "Before");
});

test("database export normalizes previously stored offsets so its own backup can be restored", async t => {
  t.mock.method(console, "warn", () => {});
  const h = fixture();
  const offsetBackup = records => ({ "ivLyrics-db": { "track-sync-offsets": records } });
  await h.backup.importAllDBs(offsetBackup([]));
  const stored = h.liveRows("ivLyrics-db", "track-sync-offsets");
  stored.set(track, "55.8");
  stored.set("spotify:track:legacy-invalid", "invalid");

  const copy = await h.backup.exportAllDBs();
  assert.deepEqual(copy["ivLyrics-db"]["track-sync-offsets"], [{ key: track, value: 56 }]);
  assert.equal(stored.get(track), "55.8");
  assert.equal(stored.get("spotify:track:legacy-invalid"), "invalid");
  await h.backup.importAllDBs(copy);
  assert.equal(await h.offsetStore.getOffset(track), 56);
  assert.equal(await h.offsetStore.getOffset("spotify:track:legacy-invalid"), 0);
});

test("a rolled-back track offset or video deletion remains in the next database backup", async t => {
  const h = fixture();
  const video = { trackUri: track, youtubeVideoId: "before" };
  await h.backup.importAllDBs({
    "ivLyrics-db": { "track-sync-offsets": [{ key: track, value: 25 }] },
    ivLyricsSelectedVideos: { selectedVideos: [{ key: track, value: video }] },
  });
  h.reject("ivLyrics-db");
  await assert.rejects(h.offsetStore.clearOffset(track), /fixture commit aborted/);
  h.reject("ivLyricsSelectedVideos");
  t.mock.method(console, "error", () => {});
  assert.equal(await h.video.removeSelectedVideo(track), false);
  const exported = await h.backup.exportAllDBs();
  assert.deepEqual(exported["ivLyrics-db"]["track-sync-offsets"], [{ key: track, value: 25 }]);
  assert.deepEqual(exported.ivLyricsSelectedVideos.selectedVideos, [{ key: track, value: video }]);
});

test("rollback removes a newly written restore marker so legacy migration can still run", async () => {
  const h = fixture();
  h.settings.set(TRACK_SYNC_OFFSETS_STORAGE_KEY, JSON.stringify({ [track]: 150 }));
  h.reject("ivLyricsCache");
  await assert.rejects(h.backup.importAllDBs({
    "ivLyrics-db": { "track-sync-offsets": [] }, ...cache("Rollback"),
  }), /Could not restore ivLyricsCache/);
  assert.equal(h.liveRows("ivLyrics-db", "track-sync-offsets").has(TRACK_SYNC_OFFSETS_RESTORED_KEY), false);
  await h.migrateOffsets();
  assert.equal(await h.offsetStore.getOffset(track), 150);
});

test("replacing track offsets waits for an interrupted settings import to be resolved", async () => {
  const h = fixture();
  const backup = value => ({ "ivLyrics-db": { "track-sync-offsets": [{ key: track, value }] } });
  await h.backup.importAllDBs(backup(25));
  h.liveRows("ivLyrics-db", "track-sync-offsets").set(TRACK_SYNC_IMPORT_RECEIPT_KEY, "committed");
  h.settings.set(SETTINGS_IMPORT_JOURNAL_KEY, JSON.stringify({ id: "committed", changes: [] }));
  const writes = h.writes.length;
  await assert.rejects(h.backup.importAllDBs(backup(50)), /interrupted settings import/);
  assert.equal(h.writes.length, writes);
  assert.equal(h.liveRows("ivLyrics-db", "track-sync-offsets").get(TRACK_SYNC_IMPORT_RECEIPT_KEY), "committed");
  h.settings.delete(SETTINGS_IMPORT_JOURNAL_KEY);
  await h.backup.importAllDBs(backup(50));
  assert.equal(h.liveRows("ivLyrics-db", "track-sync-offsets").get(track), 50);
});

test("duplicate keys in a backup are rejected before replacing any store", async () => {
  const h = fixture();
  await h.backup.importAllDBs({ "ivLyrics-db": { "track-sync-offsets": [{ key: track, value: 25 }] } });
  const writes = h.writes.length;
  const first = cache("Imported");
  first.ivLyricsCache.lyrics.push(cache("Duplicate").ivLyricsCache.lyrics[0]);
  await assert.rejects(h.backup.importAllDBs({
    "ivLyrics-db": { "track-sync-offsets": [{ key: track, value: 100 }] },
    ...first,
  }), /Duplicate record key for ivLyricsCache\/lyrics/);
  assert.equal(h.writes.length, writes);
  assert.equal(h.liveRows("ivLyrics-db", "track-sync-offsets").get(track), 25);
});

test("an asynchronous request error waits for the transaction abort before reporting failure", async () => {
  const failure = new Error("Invalid backup record");
  const abortStarted = Promise.withResolvers();
  const transaction = {
    abort() { abortStarted.resolve(); },
  };
  const result = runIdbTransaction({ transaction: () => transaction }, "lyrics", "readwrite", async () => {
    throw failure;
  });
  const inspected = assert.rejects(result, failure);
  let reported = false;
  inspected.then(() => { reported = true; });
  await abortStarted.promise;
  await Promise.resolve();
  assert.equal(reported, false);
  transaction.onabort();
  await inspected;
});

test("an aborted database restore recovers earlier databases and keeps all stores in the failing database", async () => {
  const h = fixture();
  await h.backup.importAllDBs({
    "ivLyrics-db": { "track-sync-offsets": [{ key: track, value: 25 }] },
    ...cache("Before"),
  });
  h.reject("ivLyricsCache");
  await assert.rejects(h.backup.importAllDBs({
    "ivLyrics-db": { "track-sync-offsets": [{ key: track, value: 125 }] },
    ...cache("After"),
  }), /Could not restore ivLyricsCache\./);
  const after = await h.backup.exportAllDBs();
  assert.deepEqual(after["ivLyrics-db"]["track-sync-offsets"], [{ key: track, value: 25 }]);
  assert.equal(after.ivLyricsCache.lyrics[0].value.data.synced[0].text, "Before");
  assert.equal(after.ivLyricsCache.metadata[0].value.data.title, "Before");
  assert.ok(h.writes.some(([db, stores]) => db === "ivLyricsCache" && stores.length === 2));
});

test("recovery preserves writes made after a database's restore committed", async () => {
  const h = fixture();
  const a = "spotify:track:a", b = "spotify:track:b", c = "spotify:track:c", d = "spotify:track:d", e = "spotify:track:e";
  const offsets = entries => ({ "ivLyrics-db": { "track-sync-offsets": entries.map(([key, value]) => ({ key, value })) } });
  await h.backup.importAllDBs(offsets([[a, 25], [b, 50], [d, 75]]));
  h.reject("ivLyricsCache", () => {
    const live = h.liveRows("ivLyrics-db", "track-sync-offsets");
    live.set(b, 52); // changed value after import
    live.set(c, 80); // inserted by live settings
    live.delete(d); // removed by live settings
  });
  await assert.rejects(h.backup.importAllDBs({ ...offsets([[b, 150], [d, 175], [e, 80]]), ...cache("After") }));
  assert.deepEqual(Object.fromEntries(h.liveRows("ivLyrics-db", "track-sync-offsets")),
    { [a]: 25, [b]: 52, [c]: 80, [TRACK_SYNC_OFFSETS_RESTORED_KEY]: true });
});

test("an export requested during a restore reads the result of recovery", async () => {
  const h = fixture();
  await h.backup.importAllDBs({ "ivLyrics-db": { "track-sync-offsets": [{ key: track, value: 25 }] } });
  const pause = h.pause("ivLyricsCache");
  h.reject("ivLyricsCache");
  const request = h.backup.importAllDBs({
    "ivLyrics-db": { "track-sync-offsets": [{ key: track, value: 125 }] }, ...cache("After"),
  });
  await pause.entered.promise;
  assert.equal(h.liveRows("ivLyrics-db", "track-sync-offsets").get(track), 125);
  const opensBefore = h.opens.length;
  const exported = h.backup.exportAllDBs();
  await Promise.resolve();
  assert.equal(h.opens.length, opensBefore);
  pause.release.resolve();
  await assert.rejects(request);
  assert.equal((await exported)["ivLyrics-db"]["track-sync-offsets"][0].value, 25);
});

test("a second failure during recovery reports every database that could not be recovered", async () => {
  const h = fixture();
  await h.backup.importAllDBs({ "ivLyrics-db": { "track-sync-offsets": [{ key: track, value: 25 }] } });
  h.reject("ivLyricsCache", () => h.reject("ivLyrics-db"));
  await assert.rejects(h.backup.importAllDBs({
    "ivLyrics-db": { "track-sync-offsets": [{ key: track, value: 125 }] }, ...cache("After"),
  }), error => error instanceof AggregateError && error.errors.length === 2
    && error.message === "Could not restore ivLyricsCache. Recovery failed for ivLyrics-db.");
});

test("the next backup retries an unfinished recovery even after the backup manager is recreated", async () => {
  const h = fixture();
  await h.backup.importAllDBs({ "ivLyrics-db": { "track-sync-offsets": [{ key: track, value: 25 }] } });
  h.reject("ivLyricsCache", () => h.reject("ivLyrics-db"));
  await assert.rejects(h.backup.importAllDBs({
    "ivLyrics-db": { "track-sync-offsets": [{ key: track, value: 125 }] }, ...cache("After"),
  }), AggregateError);
  const live = h.liveRows("ivLyrics-db", "track-sync-offsets");
  assert.equal(live.get(track), 125);
  const concurrentTrack = "spotify:track:concurrent";
  live.set(concurrentTrack, 45);

  const reopened = createIndexedDbBackup({ readIndexedDb: () => h.indexedDB, readLocalStorage: () => h.localStorage });
  const exportedOffsets = () => reopened.exportAllDBs().then(file => Object.fromEntries(
    file["ivLyrics-db"]["track-sync-offsets"].map(({ key, value }) => [key, value]),
  ));
  h.reject("ivLyrics-db");
  await assert.rejects(exportedOffsets(), /Could not finish recovering ivLyrics-db/);
  assert.deepEqual(await exportedOffsets(), { [track]: 25, [concurrentTrack]: 45 });
  const afterRecovery = h.liveRows("ivLyrics-db", "track-sync-offsets");
  afterRecovery.set(track, 60);
  assert.equal((await exportedOffsets())[track], 60);
});

test("reopening after an interruption between database commits restores the previous rows", async () => {
  const h = fixture();
  const offsets = value => ({ "ivLyrics-db": { "track-sync-offsets": [{ key: track, value }] } });
  await h.backup.importAllDBs({ ...offsets(25), ...cache("Before") });
  const last = h.pause("ivLyricsCache");
  const restore = h.backup.importAllDBs({ ...offsets(125), ...cache("After") });
  await last.entered.promise;
  const disk = h.snapshotDisk();
  last.release.resolve();
  await restore;

  const reopened = fixture({ disk });
  const previous = reopened.liveRows("ivLyrics-db", "track-sync-offsets");
  assert.equal(previous.get(track), 125);
  assert.equal(previous.has(DATABASE_BACKUP_RECEIPT_KEY), true);
  previous.set("spotify:track:added-later", 75);
  await reopened.backup.recover();
  const after = await reopened.backup.exportAllDBs();
  assert.deepEqual(after["ivLyrics-db"]["track-sync-offsets"], [
    { key: track, value: 25 }, { key: "spotify:track:added-later", value: 75 },
  ]);
  assert.equal(after.ivLyricsCache.metadata[0].value.data.title, "Before");
});

test("reopening after the final database commits keeps the restore and removes its receipts", async () => {
  const h = fixture();
  const offsets = value => ({ "ivLyrics-db": { "track-sync-offsets": [{ key: track, value }] } });
  await h.backup.importAllDBs({ ...offsets(25), ...cache("Before") });
  const last = h.pause("ivLyricsCache");
  const restore = h.backup.importAllDBs({ ...offsets(125), ...cache("After") });
  await last.entered.promise;
  const cleanup = h.pause("ivLyrics-db");
  last.release.resolve();
  await cleanup.entered.promise;
  const disk = h.snapshotDisk();
  cleanup.release.resolve();
  await restore;

  const reopened = fixture({ disk });
  assert.deepEqual(await reopened.offsetStore.getAllOffsets(), { [track]: 125 });
  assert.equal(reopened.liveRows("ivLyricsCache", "metadata").has(DATABASE_BACKUP_RECEIPT_KEY), true);
  await reopened.backup.recover();
  const after = await reopened.backup.exportAllDBs();
  assert.deepEqual(after["ivLyrics-db"]["track-sync-offsets"], [{ key: track, value: 125 }]);
  assert.deepEqual(after.ivLyricsCache.metadata, cache("After").ivLyricsCache.metadata);
  assert.equal(reopened.liveRows("ivLyricsCache", "metadata").has(DATABASE_BACKUP_RECEIPT_KEY), false);
});

test("a failed recovery journal write leaves all target databases untouched", async () => {
  const h = fixture();
  const offsets = value => ({ "ivLyrics-db": { "track-sync-offsets": [{ key: track, value }] } });
  await h.backup.importAllDBs({ ...offsets(25), ...cache("Before") });
  h.reject("ivLyrics-database-backup-recovery");
  await assert.rejects(h.backup.importAllDBs({ ...offsets(125), ...cache("After") }), /fixture commit aborted/);
  const after = await h.backup.exportAllDBs();
  assert.deepEqual(after["ivLyrics-db"]["track-sync-offsets"], [{ key: track, value: 25 }]);
  assert.equal(after.ivLyricsCache.metadata[0].value.data.title, "Before");
});

test("startup recovery still reads the earlier rollback journal format", async () => {
  const h = fixture();
  const name = "ivLyrics-db";
  const store = "track-sync-offsets";
  await h.backup.importAllDBs({ [name]: { [store]: [{ key: track, value: 125 }] } });
  const journal = createIndexedDbBackupJournal(() => h.indexedDB);
  await journal.write([{
    name,
    stores: [{ name: store, records: [{ key: track, value: 125 }] }],
    undo: new Map([[store, [{ key: track, value: 25 }]]]),
  }]);
  await h.backup.recover();
  assert.equal(await h.offsetStore.getOffset(track), 25);
  assert.equal(await journal.read(), undefined);
});
