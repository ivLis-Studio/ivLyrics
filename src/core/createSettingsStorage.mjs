import {
  SETTINGS_NAMESPACE,
  SETTINGS_RESET_RECORD_KEY,
  STORAGE_KEYS_METADATA_KEY,
  isSettingsBackupKey,
  isCloudSyncSettingKey,
  isRecoverableSettingKey,
  isSettingsBackupFile,
  normalizeImportedConfig,
} from "./settingsBackupPolicy.mjs";
import {
  TRACK_SYNC_OFFSETS_STORAGE_KEY,
  normalizeTrackSyncOffsets,
} from "./trackSyncOffsetStore.mjs";
import { applyStorageBatch, noteStorageWrite } from "./settingsStorageBatch.mjs";
import { assertSettingsImportRecovered, beginSettingsImportBatch, runSettingsImportLocked } from "./settingsImportJournal.mjs";
import { DATABASE_BACKUP_RECOVERY_HINT_KEY } from "./indexedDbBackupReceipt.mjs";

function collectLocalKeys(storage) {
  const keys = [];
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (typeof key === "string") keys.push(key);
  }
  return keys;
}

export function createSettingsStorage({
  persistence,
  localStorage,
  getSpicetifyStorage,
  offsetStore,
  getI18n,
  debug,
  logger = console,
}) {
  const readPersistentSetting = (key) =>
    persistence?.getItem(key) ?? localStorage.getItem(key);
  const noteNativeWrite = key => {
    if (persistence?.noteNativeWrite) persistence.noteNativeWrite(key);
    else noteStorageWrite(localStorage, key);
  };
  const writeNativeSetting = (key, value) => {
    localStorage.setItem(key, value);
    noteNativeWrite(key);
  };
  const removeNativeSetting = (key) => {
    localStorage.removeItem(key);
    noteNativeWrite(key);
  };
  const writePersistentSetting = (key, value) => {
    if (persistence) return persistence.setItem(key, value);
    return writeNativeSetting(key, value);
  };
  const removePersistentSetting = (key) => {
    if (persistence) return persistence.removeItem(key);
    return removeNativeSetting(key);
  };

  const storageKeys = new Set();
  try {
    const savedStorageKeys = readPersistentSetting(STORAGE_KEYS_METADATA_KEY);
    const parsedStorageKeys = savedStorageKeys ? JSON.parse(savedStorageKeys) : [];
    if (Array.isArray(parsedStorageKeys)) {
      for (const key of parsedStorageKeys) {
        if (isSettingsBackupKey(key)) storageKeys.add(key);
      }
    }
    if (JSON.stringify(parsedStorageKeys) !== JSON.stringify([...storageKeys])) {
      writePersistentSetting(
        STORAGE_KEYS_METADATA_KEY,
        JSON.stringify([...storageKeys])
      );
    }
  } catch (error) {
    logger.warn("[ivLyrics] Ignoring invalid storage key metadata.", error);
    try {
      writePersistentSetting(STORAGE_KEYS_METADATA_KEY, "[]");
    } catch {
      // Keep the in-memory metadata safe when storage is read-only.
    }
  }
  // Keep the old metadata format for existing installs. The key index is
  // discovery metadata, so a burst of reads only needs one snapshot.
  let keysDirty = false;
  let keyWriteScheduled = false;
  const flushStorageKeys = () => {
    if (!keysDirty) return;
    try {
      writePersistentSetting(STORAGE_KEYS_METADATA_KEY, JSON.stringify([...storageKeys]));
      keysDirty = false;
    } catch (e) {
      logger.error("Failed to save storage keys:", e);
    }
  };
  const rememberStorageKey = (key) => {
    if (!isSettingsBackupKey(key)) return;
    if (!storageKeys.has(key)) {
      storageKeys.add(key);
      keysDirty = true;
    }
    if (!keysDirty || keyWriteScheduled) return;
    keyWriteScheduled = true;
    Promise.resolve().then(() => {
      keyWriteScheduled = false;
      flushStorageKeys();
    });
  };
  const readTrackedSetting = (key) => {
    const value = readPersistentSetting(key);
    if (value != null) rememberStorageKey(key);
    return value;
  };
  const writeTrackedSetting = (key, value) => {
    const result = writePersistentSetting(key, value);
    rememberStorageKey(key);
    return result;
  };
  const buildExportKeySet = (snapshotWarning) => {
    const exportKeys = new Set(storageKeys);
    // Startup extensions and add-ons can write settings without using this
    // facade. Include native storage as well as the recovery snapshot.
    try {
      for (const key of collectLocalKeys(localStorage)) {
        if (isRecoverableSettingKey(key)) exportKeys.add(key);
      }
    } catch (error) {
      logger.warn("[ivLyrics] Failed to list local settings.", error);
    }
    try {
      Object.keys(persistence?.getSnapshot?.() || {}).forEach((key) => {
        exportKeys.add(key);
      });
    } catch (error) {
      logger.warn(snapshotWarning, error);
    }
    return exportKeys;
  };

  let backupQueue = Promise.resolve();
  const runBackupOperation = (operation) => {
    const request = backupQueue.then(operation);
    backupQueue = request.catch(() => {});
    return request;
  };
  const applySettingsBatch = (entries) => persistence?.applyBatch
    ? persistence.applyBatch(entries)
    : applyStorageBatch(localStorage, entries);
  const beginImportBatch = (entries, durable) => {
    if (persistence?.beginImportBatch) return persistence.beginImportBatch(entries, { durable });
    if (persistence?.applyBatch) return { rollback: persistence.applyBatch(entries), commit() {} };
    return beginSettingsImportBatch(localStorage, entries, durable);
  };
  const restoreSettings = async (config, cloud, beforeApply) => {
    beforeApply?.();
    assertSettingsImportRecovered(localStorage);
    if (!cloud && !isSettingsBackupFile(config)) throw new TypeError("Invalid ivLyrics settings backup.");
    const normalized = normalizeImportedConfig(config, { getI18n, logger });
    const { [TRACK_SYNC_OFFSETS_STORAGE_KEY]: rawOffsets, ...settings } = normalized;
    const offsets = cloud || !Object.hasOwn(normalized, TRACK_SYNC_OFFSETS_STORAGE_KEY)
      ? null
      : normalizeTrackSyncOffsets(typeof rawOffsets === "string" ? JSON.parse(rawOffsets) : rawOffsets, { logger });
    const entries = Object.entries(settings).filter(([key]) => !cloud || isCloudSyncSettingKey(key));
    const batch = entries.length ? beginImportBatch(entries, offsets !== null) : null;

    try {
      if (offsets) {
        const options = batch?.restoreId ? { restoreId: batch.restoreId } : undefined;
        if (!await offsetStore.importOffsets(offsets, options)) throw new Error("Could not restore track sync offsets.");
        debug?.("[ivLyrics] Imported track-sync-offsets to IndexedDB");
      }
    } catch (error) {
      try { batch?.rollback(); }
      catch (rollbackError) {
        throw new AggregateError([error, rollbackError], "Settings import and recovery failed.");
      } finally {
        await persistence?.flush?.();
      }
      throw error;
    }
    batch?.commit();
    for (const [key] of entries) rememberStorageKey(key);
    flushStorageKeys();
    await persistence?.flush?.();
  };
  const importSettings = (config, cloud, beforeApply) => runBackupOperation(async () => {
    await persistence?.ready;
    return runSettingsImportLocked(() => restoreSettings(config, cloud, beforeApply));
  });

  const readExportSettings = async (cloud) => {
    assertSettingsImportRecovered(localStorage);
    const config = {};
    const exportKeys = buildExportKeySet(cloud
      ? "[ivLyrics] Failed to read the cloud settings snapshot."
      : "[ivLyrics] Failed to read the settings recovery snapshot.");
    const isExportable = cloud ? isCloudSyncSettingKey : isSettingsBackupKey;
    for (const key of exportKeys) {
      if (!isExportable(key)) continue;
      const value = readPersistentSetting(key);
      if (value != null) config[key] = value;
    }
    if (cloud) return config;

    const offsets = await offsetStore.getAllOffsets({ throwOnError: true, legacyStorage: localStorage });
    const normalizedOffsets = normalizeTrackSyncOffsets(offsets, { ignoreInvalidEntries: true, logger });
    // A backup taken with no offsets should still be able to restore that state.
    config[TRACK_SYNC_OFFSETS_STORAGE_KEY] = JSON.stringify(normalizedOffsets);
    debug?.("[ivLyrics] Exported config keys:", Object.keys(config));
    return config;
  };
  const exportSettings = (cloud) => runBackupOperation(async () => {
    await persistence?.ready;
    return runSettingsImportLocked(() => readExportSettings(cloud));
  });

  const StorageManager = {
    get(key, defaultVal = true) {
      try {
        const value = readTrackedSetting(key);
        if (value === "true") return true;
        if (value === "false") return false;
        return defaultVal;
      } catch (error) {
        return defaultVal;
      }
    },

    getPersisted(key) {
      try {
        return readTrackedSetting(key);
      } catch (error) {
        // Error ignored
      }

      return null;
    },

    /**
     *
     * @deprecated Use saveConfig instead for unified saving
     */
    setPersisted(key, value) {
      const stringValue = String(value);
      try {
        writeTrackedSetting(key, stringValue);
      } catch {
        // Existing callers treat this deprecated API as a best-effort write.
      }
    },

    // Unified config save method to reduce duplication
    saveConfig(name, value) {
      writeTrackedSetting(`${SETTINGS_NAMESPACE}:visual:${name}`, value);
    },
    saveConfigs(values, additionalItems = {}) {
      const entries = [
        ...Object.entries(values).map(([name, value]) => [`${SETTINGS_NAMESPACE}:visual:${name}`, String(value)]),
        ...Object.entries(additionalItems).map(([key, value]) => [key, String(value)]),
      ];
      applySettingsBatch(entries);
      for (const [key] of entries) rememberStorageKey(key);
    },
    resetConfigs(names) {
      applySettingsBatch(names.map(name => [`${SETTINGS_NAMESPACE}:visual:${name}`, null]));
    },

    getItem(key) {
      return readTrackedSetting(key);
    },
    setItem(key, value) {
      return writeTrackedSetting(key, value);
    },
    seedItem(key, value) {
      if (!persistence?.seedItem) return writeTrackedSetting(key, value);
      const result = persistence.seedItem(key, value);
      rememberStorageKey(key);
      return result;
    },
    removeItem(key) {
      return removePersistentSetting(key);
    },
    getItemRaw(key) {
      return localStorage.getItem(key);
    },
    setItemRaw(key, value) {
      return writeNativeSetting(key, value);
    },
    removeItemRaw(key) {
      return removeNativeSetting(key);
    },
    SpicetifyLocalStorageGet(key) {
      const value = getSpicetifyStorage().get(key);
      if (value != null) rememberStorageKey(key);
      return value;
    },
    SpicetifyLocalStorageGetRaw(key) {
      return getSpicetifyStorage().get(key);
    },

    exportConfig() {
      return exportSettings(false);
    },
    exportCloudConfig() {
      return exportSettings(true);
    },
    importCloudConfig(config, beforeApply) {
      return importSettings(config, true, beforeApply);
    },
    importConfig(config) {
      return importSettings(config, false);
    },
    clearConfig() {
      return runBackupOperation(async () => {
        await persistence?.ready;
        return runSettingsImportLocked(async () => {
          const keys = collectLocalKeys(localStorage).filter(key =>
            key.startsWith(`${SETTINGS_NAMESPACE}:`) && key !== SETTINGS_RESET_RECORD_KEY
              && key !== DATABASE_BACKUP_RECOVERY_HINT_KEY);
          let finished;
          if (persistence?.clear) finished = persistence.clear(keys);
          else applyStorageBatch(localStorage, keys.map(key => [key, null]));
          storageKeys.clear();
          keysDirty = false;
          await finished;
        });
      });
    },
  };

  return StorageManager;
}
