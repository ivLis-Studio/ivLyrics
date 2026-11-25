import { createSettingsBackupDatabase } from "./settingsBackupDatabase.mjs";
import { restoreSettingsSnapshot } from "./settingsRecoveryMerge.mjs";
import { applyStorageBatch, noteStorageWrite } from "./settingsStorageBatch.mjs";
import {
  applyPendingSettingsImportBaseline, beginSettingsImportBatch, hasInterruptedSettingsImport,
  recoverInterruptedSettingsImport, runSettingsImportLocked,
} from "./settingsImportJournal.mjs";
import { readTrackSyncImportReceipt } from "./trackSyncOffsetStore.mjs";
import {
  isRecoverableSettingKey as isManagedKey,
  SETTINGS_RECOVERY_RECORD_KEY as BACKUP_KEY,
  SETTINGS_RESET_RECORD_KEY,
} from "./settingsBackupPolicy.mjs";

function parseResetRevisions(raw) {
  const record = JSON.parse(raw || "{}");
  if (!record || typeof record !== "object" || Array.isArray(record)) return new Map();
  return new Map(Object.entries(record).filter(([, revision]) => Number.isSafeInteger(revision) && revision > 0));
}

export function createSettingsPersistence({
  getLocalStorage,
  getPlatformStorage,
  waitForInitialPlatformStorage,
  getIndexedDB,
  onRecovered,
  warn,
}) {
  const BACKUP_VERSION = 1;

  const moduleState = {
    writeQueue: Promise.resolve(),
    record: null,
    pendingIndexedRecords: new Map(),
    indexedWriteScheduled: false,
    indexedWriteFailed: false,
    synchronousWriteFailed: false,
  };
  let recoveryChanges = new Set();
  const recoverySeeds = new Map();
  const synchronousSeeds = new Map();
  let recoveryReadPending = true;
  let releaseRecoveryRead;
  const recoveryRead = new Promise(resolve => { releaseRecoveryRead = resolve; });
  let recoveryPromise;

  const getNamespace = () => {
    const namespace = getPlatformStorage()?.namespace;
    return typeof namespace === "string" && namespace ? namespace : "default";
  };
  let resetRecord = null;
  let resetRevisions = new Map();
  const refreshResetRevisions = () => {
    try {
      const raw = getLocalStorage().getItem(SETTINGS_RESET_RECORD_KEY);
      if (raw !== resetRecord) {
        resetRevisions = parseResetRevisions(raw);
        resetRecord = raw;
      }
    } catch {
      // Keep the last known reset when native storage is unavailable.
    }
  };
  const canRecoverRecord = (record, namespace = getNamespace()) => {
    // Older snapshots did not store a namespace. A named snapshot must match
    // the account asking for it, including before any reset has occurred.
    if (!record || (record.namespace != null && record.namespace !== namespace)) return false;
    refreshResetRevisions();
    const revision = resetRevisions.get(namespace);
    return !revision || record.resetRevision === revision;
  };

  const nextRevision = (current = 0) =>
    Math.max(Date.now(), Number(current) + 1 || 1);

  const normalizeSettings = (settings) => {
    if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
      return {};
    }

    return Object.entries(settings).reduce((result, [key, value]) => {
      if (isManagedKey(key) && typeof value === "string") {
        result[key] = value;
      }
      return result;
    }, {});
  };

  const normalizeRecord = (value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }

    const namespace = getNamespace();
    const resetRevision = Number(value.resetRevision) || 0;
    // Native storage retained the explicit reset. Older mirror snapshots
    // cannot reconstruct settings that the user intentionally cleared.
    if (!canRecoverRecord({ namespace: value.namespace, resetRevision }, namespace)) return null;
    const settings = normalizeSettings(value.settings || value);
    return {
      version: BACKUP_VERSION,
      namespace,
      revision: Number(value.revision) || 0,
      ...(resetRevision ? { resetRevision } : {}),
      updatedAt: Number(value.updatedAt) || 0,
      settings,
    };
  };

  const createRecord = (settings = {}, previousRevision = 0) => {
    const namespace = getNamespace();
    refreshResetRevisions();
    const resetRevision = resetRevisions.get(namespace);
    return {
      version: BACKUP_VERSION,
      namespace,
      revision: nextRevision(previousRevision),
      ...(resetRevision ? { resetRevision } : {}),
      updatedAt: Date.now(),
      settings: normalizeSettings(settings),
    };
  };

  const readSynchronousRecord = () => {
    try {
      return normalizeRecord(getPlatformStorage()?.getItem(BACKUP_KEY));
    } catch (error) {
      return null;
    }
  };

  const writeSynchronousRecord = (record) => {
    try {
      const storage = getPlatformStorage();
      if (typeof storage?.setItem !== "function") {
        moduleState.synchronousWriteFailed = true;
        return;
      }
      storage.setItem(BACKUP_KEY, record);
      moduleState.synchronousWriteFailed = false;
    } catch (error) {
      moduleState.synchronousWriteFailed = true;
      warn("[ivLyrics] Failed to save the settings recovery snapshot.", error);
    }
  };

  const collectLocalSettings = ({ includePendingImport = false } = {}) => {
    const settings = {};
    try {
      const storage = getLocalStorage();
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (!isManagedKey(key)) continue;

        const value = storage.getItem(key);
        if (typeof value === "string") {
          settings[key] = value;
        }
      }
      if (!includePendingImport) applyPendingSettingsImportBaseline(storage, settings);
    } catch (error) {
      warn("[ivLyrics] Failed to read settings for recovery.", error);
    }
    return settings;
  };

  const restoreSynchronousSettings = (settings, startupSeeds) => {
    const { written } = restoreSettingsSnapshot({ getStorage: getLocalStorage, settings, startupSeeds, warn });
    for (const [key, value] of written) synchronousSeeds.set(key, value);
    return written.size;
  };

  const backupDB = createSettingsBackupDatabase(getIndexedDB);

  const queueIndexedWrite = () => {
    if (recoveryReadPending) return recoveryRead.then(() => moduleState.writeQueue);
    if (!moduleState.record) {
      return moduleState.writeQueue;
    }

    // Records are replaced on each update. Keep only the newest waiting
    // snapshot per namespace; a transaction already in flight still finishes
    // in order, and switching accounts cannot discard the previous backup.
    moduleState.pendingIndexedRecords.set(moduleState.record.namespace, moduleState.record);
    if (moduleState.indexedWriteScheduled) return moduleState.writeQueue;

    moduleState.indexedWriteScheduled = true;
    moduleState.writeQueue = moduleState.writeQueue
      .catch(() => undefined)
      .then(async () => {
        try {
          while (moduleState.pendingIndexedRecords.size > 0) {
            const [namespace, pendingRecord] = moduleState.pendingIndexedRecords.entries().next().value;
            moduleState.pendingIndexedRecords.delete(namespace);
            if (!canRecoverRecord(pendingRecord, namespace)) continue;
            const record = {
              ...pendingRecord,
              settings: { ...pendingRecord.settings },
            };
            try {
              await backupDB.write(record, () => canRecoverRecord(record, namespace));
              moduleState.indexedWriteFailed = false;
            } catch (error) {
              moduleState.indexedWriteFailed = true;
              warn("[ivLyrics] Failed to save the IndexedDB settings backup.", error);
            }
          }
        } finally {
          // Clear this synchronously with the drain ending so a new update
          // cannot land between the last loop check and queue cleanup.
          moduleState.indexedWriteScheduled = false;
        }
      });
    return moduleState.writeQueue;
  };

  const persistRecord = () => {
    if (!moduleState.record) return moduleState.writeQueue;
    // Early native edits still apply immediately. Wait for the account's
    // snapshot before allowing them to replace its synchronous recovery copy.
    if (!waitForInitialPlatformStorage || !recoveryReadPending) writeSynchronousRecord(moduleState.record);
    return queueIndexedWrite();
  };

  const preserveRecoveryEdit = key => {
    recoveryChanges?.add(key);
    recoverySeeds.delete(key);
    synchronousSeeds.delete(key);
  };

  const updateRecord = (updates, isStartupSeed = false) => {
    const managed = updates.filter(([key]) => isManagedKey(key));
    if (!managed.length) return;
    if (recoveryChanges) {
      for (const [key, value] of managed) {
        if (isStartupSeed) {
          synchronousSeeds.delete(key);
          recoverySeeds.set(key, String(value));
        } else preserveRecoveryEdit(key);
      }
    }
    const namespace = getNamespace();
    const record = canRecoverRecord(moduleState.record, namespace) ? moduleState.record : null;
    if (record) {
      const unchanged = managed.every(([key, value]) => value === null
        ? !Object.prototype.hasOwnProperty.call(record.settings, key)
        : record.settings[key] === String(value));
      if (unchanged) {
        // A no-op still retries an earlier failed backup without creating a
        // new revision or delaying the caller's localStorage write.
        if (moduleState.synchronousWriteFailed) persistRecord();
        else if (moduleState.indexedWriteFailed) queueIndexedWrite();
        return;
      }
    }
    const current = record || (moduleState.record
      ? createRecord(collectLocalSettings(), moduleState.record.revision)
      : createRecord());
    const settings = { ...current.settings };
    for (const [key, value] of managed) {
      if (value === null) delete settings[key];
      else settings[key] = String(value);
    }
    moduleState.record = createRecord(settings, current.revision);
    if (!isStartupSeed || !recoveryReadPending) persistRecord();
  };

  const mergeIndexedBackup = async () => {
    let indexedRecord = null;
    try {
      while (true) {
        let requestedNamespace;
        const stored = await backupDB.read(() => {
          requestedNamespace = getNamespace();
          return requestedNamespace;
        });
        if (requestedNamespace !== getNamespace()) continue;
        indexedRecord = normalizeRecord(stored);
        break;
      }
    } catch (error) {
      warn("[ivLyrics] Settings recovery database is unavailable.", error);
    }

    // A snapshot synthesized from localStorage during startup has a fresh
    // revision but no authority over older values missing from localStorage.
    const currentSyncRecord = canRecoverRecord(synchronousRecord) ? synchronousRecord : null;
    const shouldRestore = indexedRecord && recoveryChanges
      && (!currentSyncRecord || indexedRecord.revision > currentSyncRecord.revision);
    const eligibleSettings = shouldRestore
      ? Object.fromEntries(Object.entries(indexedRecord.settings).filter(([key]) => !recoveryChanges.has(key)))
      : {};
    const { resolved, written } = restoreSettingsSnapshot({
      getStorage: getLocalStorage,
      settings: eligibleSettings,
      startupSeeds: recoverySeeds,
      supersededSyncValues: recoveryChanges && (shouldRestore || !currentSyncRecord) ? synchronousSeeds : null,
      warn,
    });
    const mergedSettings = {
      ...(canRecoverRecord(moduleState.record) ? moduleState.record.settings : {}),
      ...collectLocalSettings(),
    };
    for (const [key, value] of resolved) {
      if (value === null) delete mergedSettings[key];
      else mergedSettings[key] = value;
    }
    const currentRevision = Math.max(
      moduleState.record?.revision || 0,
      indexedRecord?.revision || 0
    );
    moduleState.record = createRecord(mergedSettings, currentRevision);
    writeSynchronousRecord(moduleState.record);
    return written.size;
  };

  let synchronousRecord = waitForInitialPlatformStorage ? null : readSynchronousRecord();
  moduleState.record = synchronousRecord;
  const hasPendingImport = () => {
    try { return hasInterruptedSettingsImport(getLocalStorage()); }
    catch { return false; }
  };

  const pendingAtStartup = hasPendingImport();
  if (!pendingAtStartup) {
    if (moduleState.record) restoreSynchronousSettings(moduleState.record.settings);

    const initialLocalSettings = collectLocalSettings();
    if (moduleState.record || Object.keys(initialLocalSettings).length > 0) {
      const currentRevision = moduleState.record?.revision || 0;
      moduleState.record = createRecord(
        { ...(moduleState.record?.settings || {}), ...initialLocalSettings },
        currentRevision
      );
    }
  }

  const recoverSynchronousSettings = () => {
    if (!recoveryChanges || !canRecoverRecord(synchronousRecord)) return 0;
    const eligible = Object.fromEntries(Object.entries(synchronousRecord.settings)
      .filter(([key]) => !recoveryChanges.has(key)));
    return restoreSynchronousSettings(eligible, recoverySeeds);
  };

  function setItem(key, value, isStartupSeed = false) {
    const stringValue = String(value);
    const storage = getLocalStorage();
    storage.setItem(key, stringValue);
    noteStorageWrite(storage, key);
    updateRecord([[key, stringValue]], isStartupSeed);
    return stringValue;
  }

  function readBatchStorage(entries) {
    const storage = getLocalStorage();
    for (const [key] of entries) {
      if (isManagedKey(key)) api.getItem(key);
    }
    return storage;
  }

  const api = {
    backupKey: BACKUP_KEY,
    isManagedKey,
    getItem(key) {
      try {
        const value = getLocalStorage().getItem(key);
        if (value !== null || !isManagedKey(key)) return value;
      } catch (error) {
        if (!isManagedKey(key)) return null;
      }

      if (!canRecoverRecord(moduleState.record)) return null;
      const backupValue = moduleState.record.settings[key];
      if (typeof backupValue !== "string") return null;
      try {
        getLocalStorage().setItem(key, backupValue);
        if (recoveryChanges && !recoveryChanges.has(key)
          && synchronousRecord?.settings[key] === backupValue && canRecoverRecord(synchronousRecord)) {
          synchronousSeeds.set(key, backupValue);
        }
      } catch (error) {
        // The recovered value can still be returned when localStorage is read-only.
      }
      return backupValue;
    },
    setItem(key, value) {
      return setItem(key, value);
    },
    seedItem(key, value) {
      return setItem(key, value, true);
    },
    removeItem(key) {
      const storage = getLocalStorage();
      storage.removeItem(key);
      noteStorageWrite(storage, key);
      updateRecord([[key, null]]);
    },
    noteNativeWrite(key) {
      noteStorageWrite(getLocalStorage(), key);
      if (recoveryChanges && isManagedKey(key)) preserveRecoveryEdit(key);
    },
    applyBatch(entries) {
      const storage = readBatchStorage(entries);
      const rollback = applyStorageBatch(storage, entries);
      updateRecord(entries);
      return () => {
        try { rollback(); }
        finally {
          updateRecord(entries.map(([key]) => [key, storage.getItem(key)]));
        }
      };
    },
    beginImportBatch(entries, { durable = false } = {}) {
      const storage = readBatchStorage(entries);
      const batch = beginSettingsImportBatch(storage, entries, durable);
      const namespace = getNamespace();
      refreshResetRevisions();
      const reset = resetRevisions.get(namespace);
      return {
        restoreId: batch.restoreId,
        commit() {
          updateRecord(entries.map(([key]) => [key, storage.getItem(key)]));
          batch.commit();
        },
        rollback() {
          refreshResetRevisions();
          if (reset === resetRevisions.get(namespace)) batch.rollback();
          else batch.commit();
        },
      };
    },
    clear(additionalKeys = []) {
      const storage = getLocalStorage();
      const namespace = getNamespace();
      refreshResetRevisions();
      const revisions = new Map(resetRevisions);
      const previousRevision = Math.max(moduleState.record?.revision || 0, revisions.get(namespace) || 0);
      const resetRevision = nextRevision(previousRevision);
      const keys = new Set([...Object.keys(collectLocalSettings({ includePendingImport: true })), ...additionalKeys]);
      keys.delete(SETTINGS_RESET_RECORD_KEY);
      revisions.set(namespace, resetRevision);
      const marker = JSON.stringify(Object.fromEntries(revisions));
      applyStorageBatch(storage, [
        [SETTINGS_RESET_RECORD_KEY, marker],
        ...Array.from(keys, key => [key, null]),
      ]);
      resetRevisions = revisions;
      resetRecord = marker;
      recoveryChanges = null;
      moduleState.record = createRecord({}, previousRevision);
      return persistRecord();
    },
    flush() {
      return recoveryReadPending ? recoveryRead.then(() => moduleState.writeQueue) : moduleState.writeQueue;
    },
    getSnapshot() {
      return canRecoverRecord(moduleState.record) ? { ...moduleState.record.settings } : {};
    },
  };

  return {
    api,
    startRecovery() {
      recoveryPromise ??= (async () => {
        let restoredCount = 0;
        try {
          if (waitForInitialPlatformStorage) {
            await waitForInitialPlatformStorage();
            synchronousRecord = readSynchronousRecord();
          }
          if (pendingAtStartup || hasPendingImport()) {
            try {
              restoredCount = await runSettingsImportLocked(() => recoverInterruptedSettingsImport(
                getLocalStorage(), () => readTrackSyncImportReceipt(getIndexedDB())
              ));
            } catch (error) {
              warn("[ivLyrics] Could not recover the interrupted settings import.", error);
              return { restoredCount };
            }
            restoredCount += recoverSynchronousSettings();
          } else if (waitForInitialPlatformStorage) restoredCount += recoverSynchronousSettings();
          restoredCount += await mergeIndexedBackup();
        } finally {
          recoveryReadPending = false;
          recoveryChanges = null;
          recoverySeeds.clear();
          synchronousSeeds.clear();
          releaseRecoveryRead();
          if (!hasPendingImport()) await queueIndexedWrite();
        }
        if (restoredCount > 0) {
          onRecovered({ namespace: getNamespace(), revision: moduleState.record?.revision || 0 });
        }
        return { restoredCount };
      })();
      return recoveryPromise;
    },
  };
}
