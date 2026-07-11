(function IvLyricsStoragePersistenceModule() {
  "use strict";

  const MODULE_KEY = "__ivLyricsStoragePersistenceModule";
  if (window[MODULE_KEY]?.initialized) {
    return;
  }

  const BACKUP_KEY = "ivLyrics:settings-backup:v1";
  const BACKUP_VERSION = 1;
  const DB_NAME = "ivLyrics-settings-backup";
  const DB_VERSION = 1;
  const STORE_NAME = "snapshots";
  const MANAGED_PREFIXES = [
    "ivLyrics:visual:",
    "ivLyrics:ai:",
    "ivLyrics:lyrics:",
    "ivLyrics:marketplace:",
    "ivLyrics:learningMode:",
  ];
  const MANAGED_KEYS = new Set([
    "ivLyrics:setup-completed",
    "ivLyrics:settings-ui-theme",
    "ivLyrics:settings-presets",
    "ivLyrics:overlay-enabled",
    "ivLyrics:overlay-port",
    "ivLyrics:storage-keys",
  ]);

  const moduleState = window[MODULE_KEY] || {};
  moduleState.initialized = true;
  moduleState.writeQueue = moduleState.writeQueue || Promise.resolve();
  moduleState.record = null;
  window[MODULE_KEY] = moduleState;

  const isManagedKey = (key) =>
    typeof key === "string" &&
    (MANAGED_KEYS.has(key) || MANAGED_PREFIXES.some((prefix) => key.startsWith(prefix)));

  const getPlatformStorage = () =>
    window.Spicetify?.Platform?.LocalStorageAPI || null;

  const getNamespace = () => {
    const namespace = getPlatformStorage()?.namespace;
    return typeof namespace === "string" && namespace ? namespace : "default";
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

    const settings = normalizeSettings(value.settings || value);
    return {
      version: BACKUP_VERSION,
      namespace: getNamespace(),
      revision: Number(value.revision) || 0,
      updatedAt: Number(value.updatedAt) || 0,
      settings,
    };
  };

  const createRecord = (settings = {}, previousRevision = 0) => ({
    version: BACKUP_VERSION,
    namespace: getNamespace(),
    revision: nextRevision(previousRevision),
    updatedAt: Date.now(),
    settings: normalizeSettings(settings),
  });

  const readSynchronousRecord = () => {
    try {
      return normalizeRecord(getPlatformStorage()?.getItem(BACKUP_KEY));
    } catch (error) {
      return null;
    }
  };

  const writeSynchronousRecord = (record) => {
    try {
      getPlatformStorage()?.setItem(BACKUP_KEY, record);
    } catch (error) {
      console.warn("[ivLyrics] Failed to save the settings recovery snapshot.", error);
    }
  };

  const collectLocalSettings = () => {
    const settings = {};
    try {
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (!isManagedKey(key)) continue;

        const value = localStorage.getItem(key);
        if (typeof value === "string") {
          settings[key] = value;
        }
      }
    } catch (error) {
      console.warn("[ivLyrics] Failed to read settings for recovery.", error);
    }
    return settings;
  };

  const restoreMissingSettings = (settings) => {
    let restored = 0;
    Object.entries(normalizeSettings(settings)).forEach(([key, value]) => {
      try {
        if (localStorage.getItem(key) === null) {
          localStorage.setItem(key, value);
          restored += 1;
        }
      } catch (error) {
        console.warn(`[ivLyrics] Failed to recover setting ${key}.`, error);
      }
    });
    return restored;
  };

  const openDatabase = () =>
    new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error("IndexedDB is unavailable."));
        return;
      }

      const request = window.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (event) => {
        const database = event.target.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME, { keyPath: "namespace" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Failed to open settings backup."));
    });

  const readIndexedRecord = async () => {
    const database = await openDatabase();
    try {
      return await new Promise((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, "readonly");
        const request = transaction.objectStore(STORE_NAME).get(getNamespace());
        request.onsuccess = () => resolve(normalizeRecord(request.result));
        request.onerror = () => reject(request.error || new Error("Failed to read settings backup."));
      });
    } finally {
      database.close();
    }
  };

  const writeIndexedRecord = async (record) => {
    const database = await openDatabase();
    try {
      await new Promise((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, "readwrite");
        transaction.objectStore(STORE_NAME).put(record);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error || new Error("Failed to save settings backup."));
        transaction.onabort = () => reject(transaction.error || new Error("Settings backup was aborted."));
      });
    } finally {
      database.close();
    }
  };

  const queueIndexedWrite = () => {
    if (!moduleState.record) {
      return moduleState.writeQueue;
    }

    const record = {
      ...moduleState.record,
      settings: { ...moduleState.record.settings },
    };
    moduleState.writeQueue = moduleState.writeQueue
      .catch(() => undefined)
      .then(() => writeIndexedRecord(record))
      .catch((error) => {
        console.warn("[ivLyrics] Failed to save the IndexedDB settings backup.", error);
      });
    return moduleState.writeQueue;
  };

  const persistRecord = () => {
    if (!moduleState.record) return;
    writeSynchronousRecord(moduleState.record);
    queueIndexedWrite();
  };

  const updateRecord = (key, value) => {
    const current = moduleState.record || createRecord();
    const settings = { ...current.settings };
    if (value === null) {
      delete settings[key];
    } else {
      settings[key] = String(value);
    }
    moduleState.record = createRecord(settings, current.revision);
    persistRecord();
  };

  const reloadAfterRecovery = (restoredCount) => {
    if (restoredCount <= 0 || typeof window.location?.reload !== "function") {
      return;
    }

    const marker = `ivLyrics:settings-recovered:${getNamespace()}:${moduleState.record?.revision || 0}`;
    try {
      if (sessionStorage.getItem(marker) === "true") return;
      sessionStorage.setItem(marker, "true");
    } catch (error) {
      // Reloading once is still safer than leaving CONFIG initialized with defaults.
    }
    setTimeout(() => window.location.reload(), 0);
  };

  const initializeIndexedBackup = async (hadSynchronousRecord) => {
    let indexedRecord = null;
    try {
      indexedRecord = await readIndexedRecord();
    } catch (error) {
      console.warn("[ivLyrics] Settings recovery database is unavailable.", error);
    }

    const localSettings = collectLocalSettings();
    const hasCompletedSetup = localSettings["ivLyrics:setup-completed"] === "true";
    let restoredCount = 0;

    if (
      indexedRecord &&
      (!moduleState.record || indexedRecord.revision > moduleState.record.revision) &&
      (!hadSynchronousRecord || !hasCompletedSetup)
    ) {
      moduleState.record = indexedRecord;
      restoredCount = restoreMissingSettings(indexedRecord.settings);
    }

    const mergedSettings = {
      ...(moduleState.record?.settings || {}),
      ...collectLocalSettings(),
    };
    const currentRevision = Math.max(
      moduleState.record?.revision || 0,
      indexedRecord?.revision || 0
    );
    moduleState.record = createRecord(mergedSettings, currentRevision);
    writeSynchronousRecord(moduleState.record);
    await queueIndexedWrite();
    reloadAfterRecovery(restoredCount);

    return { restoredCount };
  };

  const synchronousRecord = readSynchronousRecord();
  const hadSynchronousRecord = Boolean(synchronousRecord);
  moduleState.record = synchronousRecord;

  if (moduleState.record) {
    restoreMissingSettings(moduleState.record.settings);
  }

  const initialLocalSettings = collectLocalSettings();
  if (moduleState.record || Object.keys(initialLocalSettings).length > 0) {
    const currentRevision = moduleState.record?.revision || 0;
    moduleState.record = createRecord(
      { ...(moduleState.record?.settings || {}), ...initialLocalSettings },
      currentRevision
    );
    writeSynchronousRecord(moduleState.record);
  }

  const api = {
    backupKey: BACKUP_KEY,
    isManagedKey,
    getItem(key) {
      try {
        const value = localStorage.getItem(key);
        if (value !== null || !isManagedKey(key)) return value;
      } catch (error) {
        if (!isManagedKey(key)) return null;
      }

      const backupValue = moduleState.record?.settings?.[key];
      if (typeof backupValue !== "string") return null;
      try {
        localStorage.setItem(key, backupValue);
      } catch (error) {
        // The recovered value can still be returned when localStorage is read-only.
      }
      return backupValue;
    },
    setItem(key, value) {
      const stringValue = String(value);
      localStorage.setItem(key, stringValue);
      if (isManagedKey(key)) {
        updateRecord(key, stringValue);
      }
      return stringValue;
    },
    removeItem(key) {
      localStorage.removeItem(key);
      if (isManagedKey(key)) {
        updateRecord(key, null);
      }
    },
    async clear() {
      const keysToRemove = Object.keys(collectLocalSettings());
      keysToRemove.forEach((key) => localStorage.removeItem(key));
      moduleState.record = createRecord({}, moduleState.record?.revision || 0);
      writeSynchronousRecord(moduleState.record);
      await queueIndexedWrite();
    },
    flush() {
      return moduleState.writeQueue;
    },
    getSnapshot() {
      return { ...(moduleState.record?.settings || {}) };
    },
  };

  window.ivLyricsStoragePersistence = api;
  api.ready = initializeIndexedBackup(hadSynchronousRecord);
})();
