import {
  TRACK_SYNC_OFFSETS, TRACK_LANGUAGE_OVERRIDES, TRACK_LYRICS_PROVIDER_OVERRIDES,
  TRACK_BACKGROUND_OVERRIDES, openTrackPreferenceDatabase,
} from "./trackPreferenceDatabase.mjs";
import {
  LYRICS_CACHE_DB_NAME, LYRICS_CACHE_DB_VERSION, LYRICS_CACHE_STORES,
  openLyricsCacheDatabase,
} from "../lyrics/lyricsCacheDatabase.mjs";
import { runIdbTransaction } from "./indexedDbTransaction.mjs";
import { recoverBackupStores, replaceBackupStores, rollbackBackupReceipt, scanBackupStore } from "./indexedDbBackupRestore.mjs";
import { clearBackupReceipt, DATABASE_BACKUP_RECEIPT_KEY, readBackupReceipt } from "./indexedDbBackupReceipt.mjs";
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
const isPublicRecord = (storeName, record) => record.key !== DATABASE_BACKUP_RECEIPT_KEY
  && (storeName !== TRACK_SYNC_OFFSETS.storeName || !isPrivateTrackSyncOffsetKey(record.key));

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
      records => [name, exportStoreRecords(name,
        records.filter(record => record.key !== DATABASE_BACKUP_RECEIPT_KEY), readLocalStorage)],
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

  async function resolveDatabases(plan, withDatabase, resolve) {
    const failed = [];
    for (const entry of plan) {
      try {
        await withDatabase(entry.name, db => resolve(db, entry));
      } catch (error) {
        failed.push({ entry, error });
      }
    }
    return failed;
  }

  const openForRecovery = indexedDB => async (name, recover) => {
    const target = DATABASES.find(database => database.name === name);
    if (!target) throw new Error(`Unknown database in the backup recovery record: ${name}.`);
    const db = await target.open(indexedDB);
    try {
      return await recover(db);
    } finally {
      db.close();
    }
  };
  const assertOffsetsReady = entries => {
    if (entries.some(entry => entry.name === TRACK_SYNC_OFFSETS.dbName)) {
      assertSettingsImportRecovered(readLocalStorage());
    }
  };

  async function recoverLegacyRollback(pending, indexedDB) {
    assertOffsetsReady(pending);
    const compareKeys = indexedDB.cmp.bind(indexedDB);
    const failed = await resolveDatabases(pending, openForRecovery(indexedDB),
      (db, entry) => recoverBackupStores(db, entry.stores, entry.undo, compareKeys));
    const saveError = await saveRecoveryPlan(failed.map(({ entry }) => entry));
    if (failed.length) {
      throw new AggregateError([...failed.map(({ error }) => error), ...(saveError ? [saveError] : [])],
        `Could not finish recovering ${failed.map(({ entry }) => entry.name).join(", ")}.`);
    }
    if (saveError) throw new Error("Could not clear the database backup recovery record.", { cause: saveError });
  }

  async function resolveRestore(plan, indexedDB, withDatabase) {
    const final = plan.targets.at(-1);
    const committed = await withDatabase(final.name, db => readBackupReceipt(db, final.store))
      .then(receipt => receipt?.id === plan.id);
    const previous = plan.targets.slice(0, -1).reverse();
    const compareKeys = indexedDB.cmp.bind(indexedDB);
    const failed = await resolveDatabases(previous, withDatabase, (db, entry) => committed
      ? clearBackupReceipt(db, entry.store, plan.id)
      : rollbackBackupReceipt(db, entry, plan.id, compareKeys));
    if (failed.length) return { committed, failed };

    const saveError = await saveRecoveryPlan(null);
    if (!saveError && committed) {
      // The final receipt must survive until the journal is cleared.
      await withDatabase(final.name, db => clearBackupReceipt(db, final.store, plan.id)).catch(() => {});
    }
    return { committed, failed, saveError };
  }

  function assertRecoveryComplete({ failed, saveError }, message, cause) {
    if (failed.length) {
      const names = failed.map(({ entry }) => entry.name).join(", ");
      const errors = [...failed.map(({ error }) => error), ...(saveError ? [saveError] : [])];
      throw new AggregateError(cause ? [cause, ...errors] : errors,
        message ? `${message} Recovery failed for ${names}.` : `Could not finish recovering ${names}.`);
    }
    if (saveError) throw new Error("Could not clear the database backup recovery record.", { cause: saveError });
  }

  async function recoverInterruptedRestore(indexedDB) {
    const pending = await journal.read();
    if (!pending) return;
    if (Array.isArray(pending)) return recoverLegacyRollback(pending, indexedDB);
    assertOffsetsReady(pending.targets);
    assertRecoveryComplete(await resolveRestore(pending, indexedDB, openForRecovery(indexedDB)));
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
    try {
      // Preflight every database before any store is cleared.
      for (const { target, stores } of plan) {
        const db = await target.open(indexedDB);
        opened.push({ db, stores });
        validateStoreKeys(indexedDB, db, stores);
      }

      if (opened.length === 1) {
        const [{ db, stores }] = opened;
        try {
          await replaceBackupStores(db, stores);
        } catch (error) {
          throw new Error(`Could not restore ${db.name}.`, { cause: error });
        }
        return;
      }

      const recovery = {
        id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
        targets: opened.map(({ db, stores }) => ({
          name: db.name,
          store: db.name === LYRICS_CACHE_DB_NAME ? "metadata" : stores[0].name,
          names: stores.map(store => store.name),
        })),
      };
      // Establish recovery before any target database can commit.
      await journal.write(recovery);
      const useOpen = (name, operation) => operation(opened.find(({ db }) => db.name === name).db);
      for (const [index, { db, stores }] of opened.entries()) {
        try {
          await replaceBackupStores(db, stores, {
            id: recovery.id,
            store: recovery.targets[index].store,
            keepUndo: index < opened.length - 1,
          });
        } catch (error) {
          const message = `Could not restore ${db.name}.`;
          assertRecoveryComplete(await resolveRestore(recovery, indexedDB, useOpen), message, error);
          throw new Error(message, { cause: error });
        }
      }
      // A failure to remove receipts does not undo a completed restore.
      await resolveRestore(recovery, indexedDB, useOpen).catch(() => {});
    } finally {
      for (const { db } of opened) db.close();
    }
  }

  const runAfterRecovery = operation => runBackupOperation(() => runSettingsImportLocked(async () => {
    const indexedDB = readIndexedDb();
    await recoverInterruptedRestore(indexedDB);
    return operation(indexedDB);
  }));

  return {
    recover: () => runBackupOperation(() => runSettingsImportLocked(async () => {
      if (await journal.exists()) await recoverInterruptedRestore(readIndexedDb());
    })),
    exportAllDBs: () => runAfterRecovery(exportDatabases),
    importAllDBs: data => runAfterRecovery(indexedDB => restore(data, indexedDB)),
  };
}
