import { awaitIdbRequest, putIdbRecord, runIdbTransaction } from "./indexedDbTransaction.mjs";

export const DATABASE_BACKUP_RECEIPT_KEY = "ivLyrics:database-backup-receipt";
export const DATABASE_BACKUP_RECOVERY_HINT_KEY = "ivLyrics:database-backup-recovery-needed";

export function putBackupReceipt(store, receipt) {
  const value = store.keyPath == null ? receipt : { ...receipt, [store.keyPath]: DATABASE_BACKUP_RECEIPT_KEY };
  putIdbRecord(store, DATABASE_BACKUP_RECEIPT_KEY, value);
}

export function readBackupReceipt(db, storeName) {
  const store = db.transaction(storeName, "readonly").objectStore(storeName);
  return awaitIdbRequest(store.get(DATABASE_BACKUP_RECEIPT_KEY));
}

export function clearBackupReceipt(db, storeName, id) {
  return runIdbTransaction(db, storeName, "readwrite", tx => {
    const store = tx.objectStore(storeName);
    const request = store.get(DATABASE_BACKUP_RECEIPT_KEY);
    request.onsuccess = () => {
      if (request.result?.id === id) store.delete(DATABASE_BACKUP_RECEIPT_KEY);
    };
  });
}
