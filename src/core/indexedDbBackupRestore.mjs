import { putIdbRecord, runIdbTransaction } from "./indexedDbTransaction.mjs";
import { DATABASE_BACKUP_RECEIPT_KEY, putBackupReceipt } from "./indexedDbBackupReceipt.mjs";

// The cursor's final callback is still inside the transaction. Queue writes
// there so capturing the previous rows and replacing them are indivisible.
export function scanBackupStore(tx, store, complete, project = record => record) {
  return new Promise((resolve, reject) => {
    const records = [];
    const request = store.openCursor();
    request.onsuccess = () => {
      try {
        const cursor = request.result;
        if (cursor) {
          records.push(project({ key: cursor.key, value: cursor.value }));
          cursor.continue();
        } else {
          resolve(complete(records));
        }
      } catch (error) {
        try { tx.abort(); } catch { /* already aborted */ }
        reject(error);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

export function replaceBackupStores(db, stores, receipt) {
  const undo = new Map();
  const names = stores.map(store => store.name);
  if (receipt && !names.includes(receipt.store)) names.push(receipt.store);
  let remaining = stores.length;
  return runIdbTransaction(db, names, "readwrite", tx => Promise.all(
    stores.map(({ name, records }) => {
      const store = tx.objectStore(name);
      const replace = () => {
        store.clear();
        for (const { key, value } of records) putIdbRecord(store, key, value);
        if (--remaining === 0 && receipt) {
          // The receipt commits with the replacement. Only stores before
          // the final transaction need to carry their previous rows.
          putBackupReceipt(tx.objectStore(receipt.store), {
            id: receipt.id,
            ...(receipt.keepUndo ? { undo, stores } : {}),
          });
        }
      };
      if (!receipt?.keepUndo) return replace();
      return scanBackupStore(tx, store, previous => {
        undo.set(name, previous.filter(record => record.key !== DATABASE_BACKUP_RECEIPT_KEY));
        replace();
      });
    })
  ));
}

function matchesBackupValue(current, imported) {
  if (Object.is(current, imported)) return true;
  if (!current || !imported || typeof current !== "object" || typeof imported !== "object"
      || Object.getPrototypeOf(current) !== Object.getPrototypeOf(imported)) return false;
  if (Object.getPrototypeOf(imported) !== Object.prototype && !Array.isArray(imported)) return false;
  const keys = Object.keys(imported);
  return Object.keys(current).length === keys.length
    && keys.every(key => Object.hasOwn(current, key) && matchesBackupValue(current[key], imported[key]));
}

function recoverStore(store, before, imported, current, compareKeys) {
  // IndexedDB keys may be structured values. Group them with the same
  // comparator the store uses, so independently decoded keys still match.
  const rows = [
    ...before.map(record => ({ previous: record, key: record.key })),
    ...imported.map(record => ({ imported: record, key: record.key })),
    ...current.map(record => ({ current: record, key: record.key })),
  ].sort((left, right) => compareKeys(left.key, right.key));

  const recoverKey = ({ key, previous, imported, current }) => {
    if (!previous && !imported) return;
    if (!!current !== !!imported || (current && !matchesBackupValue(current.value, imported.value))) return;
    if (previous) putIdbRecord(store, previous.key, previous.value);
    else store.delete(key);
  };

  let group = null;
  for (const row of rows) {
    if (group && compareKeys(group.key, row.key) === 0) Object.assign(group, row);
    else {
      if (group) recoverKey(group);
      group = row;
    }
  }
  if (group) recoverKey(group);
}

export function recoverBackupStores(db, stores, undo, compareKeys) {
  return runIdbTransaction(db, stores.map(store => store.name), "readwrite", tx => Promise.all(
    stores.map(({ name, records }) => {
      const store = tx.objectStore(name);
      return scanBackupStore(tx, store, current => recoverStore(store, undo.get(name), records, current, compareKeys));
    })
  ));
}

export function rollbackBackupReceipt(db, target, id, compareKeys) {
  const { store: receiptStore, names } = target;
  return runIdbTransaction(db, names, "readwrite", tx => new Promise((resolve, reject) => {
    const receipts = tx.objectStore(receiptStore);
    const request = receipts.get(DATABASE_BACKUP_RECEIPT_KEY);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      try {
        const receipt = request.result;
        if (receipt?.id !== id) return resolve();
        const recovery = receipt.stores.map(({ name, records }) => {
          const store = tx.objectStore(name);
          return scanBackupStore(tx, store, current =>
            recoverStore(store, receipt.undo.get(name), records, current, compareKeys));
        });
        // The receipt is removed only if every recovery write commits.
        receipts.delete(DATABASE_BACKUP_RECEIPT_KEY);
        resolve(Promise.all(recovery));
      } catch (error) {
        reject(error);
      }
    };
  }));
}
