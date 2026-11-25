import { openIdbDatabase, runIdbTransaction } from "./indexedDbTransaction.mjs";

export function createSettingsBackupDatabase(getIndexedDB) {
  const DB_NAME = "ivLyrics-settings-backup";
  const DB_VERSION = 1;
  const STORE_NAME = "snapshots";

  const openDatabase = async () => {
    const indexedDB = getIndexedDB();
    if (!indexedDB) throw new Error("IndexedDB is unavailable.");
    return openIdbDatabase(indexedDB, DB_NAME, DB_VERSION, database => {
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "namespace" });
      }
    });
  };

  const withDatabase = async (run) => {
    const database = await openDatabase();
    try {
      return await run(database);
    } finally {
      database.close();
    }
  };

  const read = async (getNamespace) =>
    withDatabase(
      (database) =>
        new Promise((resolve, reject) => {
          const transaction = database.transaction(STORE_NAME, "readonly");
          const request = transaction.objectStore(STORE_NAME).get(getNamespace());
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error || new Error("Failed to read settings backup."));
        })
    );

  const write = (record, isCurrent) =>
    withDatabase(database => isCurrent()
      ? runIdbTransaction(database, STORE_NAME, "readwrite", transaction => {
        transaction.objectStore(STORE_NAME).put(record);
      }, "Settings backup was aborted.")
      : undefined);

  return { read, write };
}
