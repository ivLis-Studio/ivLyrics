import {
  TRACK_SYNC_OFFSETS, TRACK_LANGUAGE_OVERRIDES, TRACK_LYRICS_PROVIDER_OVERRIDES,
  TRACK_BACKGROUND_OVERRIDES, openTrackPreferenceDatabase,
} from "./trackPreferenceDatabase.mjs";
import {
  LYRICS_CACHE_DB_NAME, LYRICS_CACHE_DB_VERSION, LYRICS_CACHE_STORES,
  openLyricsCacheDatabase,
} from "../lyrics/lyricsCacheDatabase.mjs";
import { runIdbTransaction } from "./indexedDbTransaction.mjs";
import { recoverBackupStores, replaceBackupStores, scanBackupStore } from "./indexedDbBackupRestore.mjs";
import { createIndexedDbBackupJournal } from "./indexedDbBackupJournal.mjs";
import { redactLyricsCacheDataForPersistence } from "../lyrics/lyricsCachePrivacy.mjs";
import { SELECTED_VIDEO_DATABASE, openSelectedVideoDatabase } from "../features/video/selectedVideoStore.mjs";
import {
  isPrivateTrackSyncOffsetKey, normalizeTrackSyncOffsets, readLegacyTrackSyncOffsets,
  TRACK_SYNC_OFFSETS_RESTORED_KEY,
} from "./trackSyncOffsetStore.mjs";
import { assertSettingsImportRecovered, runSettingsImportLocked } from "./settingsImportJournal.mjs";

const DATABASES = [
  ...[TRACK_SYNC_OFFSETS, TRACK_LANGUAGE_OVERRIDES, TRACK_BACKGROUND_OVERRIDES, TRACK_LYRICS_PROVIDER_OVERRIDES]
    .map(schema => ({
      name: schema.dbName, stores: [schema.storeName], open: indexedDB => openTrackPreferenceDatabase(indexedDB, schema),
    })),
  {
    name: LYRICS_CACHE_DB_NAME, stores: LYRICS_CACHE_STORES,
    open: indexedDB => openLyricsCacheDatabase(indexedDB, LYRICS_CACHE_DB_NAME, LYRICS_CACHE_DB_VERSION),
  },
  {
    name: SELECTED_VIDEO_DATABASE.name, stores: [SELECTED_VIDEO_DATABASE.storeName],
    open: openSelectedVideoDatabase,
  },
];

const isRecord = value => value !== null && typeof value === "object" && !Array.isArray(value);
const isPublicRecord = (storeName, record) => storeName !== TRACK_SYNC_OFFSETS.storeName
  || !isPrivateTrackSyncOffsetKey(record.key);

function sanitizeRecord(dbName, storeName, record) {
  const { key, value } = record;
  if (!isRecord(value)) return record;
  if (dbName === LYRICS_CACHE_DB_NAME && storeName === "lyrics") {
    return { key, value: { ...value, data: redactLyricsCacheDataForPersistence(value.data) } };
  }
  if (dbName === SELECTED_VIDEO_DATABASE.name && typeof key === "string" && value.trackUri == null) {
    return { key, value: { ...value, trackUri: key } };
  }
  return record;
}

function exportStoreRecords(name, records, readLocalStorage) {
  if (name !== TRACK_SYNC_OFFSETS.storeName) return records;
  // A restore marker is a row even when the user restored an empty backup.
  // Only an uninitialized store can still take its offsets from localStorage.
  const offsets = records.length === 0
    ? readLegacyTrackSyncOffsets(readLocalStorage()) ?? {}
    : normalizeTrackSyncOffsets(Object.fromEntries(
      records.filter(({ key }) => typeof key === "string").map(({ key, value }) => [key, value]),
    ), { ignoreInvalidEntries: true });
  return Object.entries(offsets).map(([key, value]) => ({ key, value }));
}

async function readStores(db, storeNames, readLocalStorage) {
  const entries = await runIdbTransaction(db, storeNames, "readonly", tx => Promise.all(
    storeNames.map(name => scanBackupStore(tx, tx.objectStore(name),
      records => [name, exportStoreRecords(name, records, readLocalStorage)],
      record => sanitizeRecord(db.name, name, record)))
  ));
  return Object.fromEntries(entries);
}

function parseRestorePlan(data) {
  if (!isRecord(data)) throw new TypeError("Invalid ivLyrics database backup.");
  const plan = [];
  for (const target of DATABASES) {
    if (!Object.hasOwn(data, target.name)) continue;
    const database = data[target.name];
    if (!isRecord(database)) throw new TypeError(`Invalid database backup for ${target.name}.`);
    const stores = target.stores.filter(name => Object.hasOwn(database, name)).map(name => {
      const records = database[name];
      if (!Array.isArray(records) || records.some(record => !isRecord(record) || !Object.hasOwn(record, "key")
        || !Object.hasOwn(record, "value"))) {
        throw new TypeError(`Invalid records for ${target.name}/${name}.`);
      }
      // Only this restore owns the marker. A receipt copied by an older exporter
      // has no authority to acknowledge an interrupted local settings import.
      const publicRecords = records.filter(record => isPublicRecord(name, record))
        .map(record => sanitizeRecord(target.name, name, record));
      if (name === TRACK_SYNC_OFFSETS.storeName) {
        if (publicRecords.some(({ key }) => typeof key !== "string")) {
          throw new TypeError("Track sync offsets backup has an invalid entry.");
        }
        const offsets = normalizeTrackSyncOffsets(Object.fromEntries(publicRecords.map(({ key, value }) => [key, value])));
        return { name, records: [
          ...publicRecords.map(({ key }) => ({ key, value: offsets[key] })),
          { key: TRACK_SYNC_OFFSETS_RESTORED_KEY, value: true },
        ] };
      }
      return { name, records: publicRecords };
    });
    if (stores.length) plan.push({ target, stores });
  }
  if (!plan.length) throw new TypeError("No supported object stores in the ivLyrics database backup.");
  return plan;
}

function validateStoreKeys(indexedDB, db, stores) {
  const tx = db.transaction(stores.map(store => store.name), "readonly");
  for (const { name, records } of stores) {
    const { keyPath } = tx.objectStore(name);
    for (const { key, value } of records) {
      try {
        indexedDB.cmp(key, key);
        if (keyPath != null && indexedDB.cmp(key, value?.[keyPath]) !== 0) {
          throw new TypeError("Object key does not match its backup record.");
        }
      } catch (error) {
        throw new TypeError(`Invalid record key for ${db.name}/${name}.`, { cause: error });
      }
    }
    const compare = indexedDB.cmp.bind(indexedDB);
    const keys = records.map(record => record.key).sort(compare);
    for (let index = 1; index < keys.length; index++) {
      if (compare(keys[index - 1], keys[index]) === 0) throw new TypeError(`Duplicate record key for ${db.name}/${name}.`);
    }
  }
}

export function createIndexedDbBackup({
  readIndexedDb = () => indexedDB,
  readLocalStorage = () => globalThis.window?.localStorage,
} = {}) {
  const journal = createIndexedDbBackupJournal(readIndexedDb);
  let backupQueue = Promise.resolve();
  const runBackupOperation = operation => {
    const request = backupQueue.then(operation);
    backupQueue = request.catch(() => {});
    return request;
  };

  async function saveRecoveryPlan(plan) {
    try {
      await journal.write(plan);
      return null;
    } catch (error) {
      return error;
    }
  }

  async function rollbackDatabases(plan, indexedDB, withDatabase) {
    const failed = [];
    const compareKeys = indexedDB.cmp.bind(indexedDB);
    for (const entry of plan) {
      try {
        await withDatabase(entry.name, db => recoverBackupStores(db, entry.stores, entry.undo, compareKeys));
      } catch (error) {
        failed.push({ entry, error });
      }
    }
    return failed;
  }

  async function recoverInterruptedRollback(indexedDB) {
    const pending = await journal.read();
    if (!pending) return;
    if (pending.some(entry => entry.name === TRACK_SYNC_OFFSETS.dbName)) {
      assertSettingsImportRecovered(readLocalStorage());
    }
    const failed = await rollbackDatabases(pending, indexedDB, async (name, recover) => {
      const target = DATABASES.find(database => database.name === name);
      if (!target) throw new Error(`Unknown database in the backup recovery record: ${name}.`);
      const db = await target.open(indexedDB);
      try {
        await recover(db);
      } finally {
        db.close();
      }
    });
    const saveError = await saveRecoveryPlan(failed.map(({ entry }) => entry));
    if (failed.length) {
      throw new AggregateError([...failed.map(({ error }) => error), ...(saveError ? [saveError] : [])],
        `Could not finish recovering ${failed.map(({ entry }) => entry.name).join(", ")}.`);
    }
    if (saveError) throw new Error("Could not clear the database backup recovery record.", { cause: saveError });
  }

  async function exportDatabases(indexedDB) {
    const result = {};
    for (const target of DATABASES) {
      let db;
      try {
        db = await target.open(indexedDB);
        result[target.name] = await readStores(db, target.stores, readLocalStorage);
      } catch (error) {
        throw new Error(`Could not export ${target.name}.`, { cause: error });
      } finally {
        db?.close();
      }
    }
    return result;
  }

  async function restore(data, indexedDB) {
    const plan = parseRestorePlan(data);
    if (plan.some(({ target }) => target.name === TRACK_SYNC_OFFSETS.dbName)) {
      // The offset store carries the receipt needed for startup recovery.
      assertSettingsImportRecovered(readLocalStorage());
    }
    // The potentially large lyrics cache is last. Its own transaction rolls
    // back on failure, so it never needs a second in-memory copy for recovery.
    plan.sort((left, right) => Number(left.target.name === LYRICS_CACHE_DB_NAME)
      - Number(right.target.name === LYRICS_CACHE_DB_NAME));
    const opened = [];
    const committed = [];
    try {
      // Preflight every database before any store is cleared.
      for (const { target, stores } of plan) {
        const db = await target.open(indexedDB);
        opened.push({ db, stores });
        validateStoreKeys(indexedDB, db, stores);
      }
      for (const [index, { db, stores }] of opened.entries()) {
        try {
          const undo = await replaceBackupStores(db, stores, index < opened.length - 1);
          if (index < opened.length - 1) committed.push({ name: db.name, stores, undo });
        } catch (error) {
          const message = `Could not restore ${db.name}.`;
          if (!committed.length) throw new Error(message, { cause: error });
          const pending = committed.reverse();
          // Save the undo before compensation so closing Spotify while a
          // rollback is running leaves enough information to retry it.
          await saveRecoveryPlan(pending);
          const failed = await rollbackDatabases(pending, indexedDB, (name, recover) =>
            recover(opened.find(database => database.db.name === name).db));
          const saveError = await saveRecoveryPlan(failed.map(({ entry }) => entry));
          if (failed.length) {
            throw new AggregateError([error, ...failed.map(item => item.error), ...(saveError ? [saveError] : [])],
              `${message} Recovery failed for ${failed.map(({ entry }) => entry.name).join(", ")}.`);
          }
          if (saveError) throw new AggregateError([error, saveError], `${message} Could not clear the recovery record.`);
          throw new Error(message, { cause: error });
        }
      }
    } finally {
      for (const { db } of opened) db.close();
    }
  }

  const runAfterRecovery = operation => runBackupOperation(() => runSettingsImportLocked(async () => {
    const indexedDB = readIndexedDb();
    await recoverInterruptedRollback(indexedDB);
    return operation(indexedDB);
  }));

  return {
    exportAllDBs: () => runAfterRecovery(exportDatabases),
    importAllDBs: data => runAfterRecovery(indexedDB => restore(data, indexedDB)),
  };
}
