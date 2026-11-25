import { putIdbRecord, runIdbTransaction } from "./indexedDbTransaction.mjs";

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

export function replaceBackupStores(db, stores, keepUndo) {
  const undo = new Map();
  return runIdbTransaction(db, stores.map(store => store.name), "readwrite", tx => Promise.all(
    stores.map(({ name, records }) => {
      const store = tx.objectStore(name);
      const replace = () => {
        store.clear();
        for (const { key, value } of records) putIdbRecord(store, key, value);
      };
      if (!keepUndo) return replace();
      return scanBackupStore(tx, store, previous => {
        undo.set(name, previous);
        replace();
      });
    })
  )).then(() => undo);
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
