const openBatches = new WeakMap();

export function noteStorageWrite(storage, key) {
  const batches = openBatches.get(storage);
  if (batches) for (const batch of batches) {
    if (batch.keys.delete(key)) batch.onWrite?.(key);
  }
}

function writeStorageBatch(storage, entries, watchWrites, onWrite) {
  const updates = [...new Map(entries)].map(([key, value]) => ({
    key, value: value === null ? null : String(value), previous: storage.getItem(key) ?? null,
  }));
  const applied = [];
  const owned = watchWrites ? new Set() : null;
  const watcher = owned && { keys: owned, onWrite };
  let batches;

  const write = (key, value) => value === null ? storage.removeItem(key) : storage.setItem(key, value);
  const stopTracking = () => {
    if (!batches) return;
    batches.delete(watcher);
    if (!batches.size) openBatches.delete(storage);
    batches = null;
  };
  const rollback = () => {
    stopTracking();
    const errors = [];
    while (applied.length) {
      const { key, value, previous } = applied.pop();
      try {
        // A separate settings action may have changed this value while a database write was pending.
        if ((!owned || owned.has(key)) && storage.getItem(key) === value) {
          write(key, previous);
          noteStorageWrite(storage, key);
        }
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length) throw new AggregateError(errors, "Could not restore previous settings.");
  };

  try {
    for (const entry of updates) {
      if (entry.value === entry.previous) continue;
      write(entry.key, entry.value);
      applied.push(entry);
      owned?.add(entry.key);
    }
  } catch (error) {
    try { rollback(); }
    catch (rollbackError) {
      throw new AggregateError([error, rollbackError], "Settings write and recovery failed.");
    }
    throw error;
  }
  for (const { key } of updates) noteStorageWrite(storage, key);
  if (owned?.size) {
    batches = openBatches.get(storage) || new Set();
    batches.add(watcher);
    openBatches.set(storage, batches);
  }
  return {
    rollback,
    commit() {
      stopTracking();
      applied.length = 0;
    },
  };
}

export const applyStorageBatch = (storage, entries) => writeStorageBatch(storage, entries, false).rollback;
export const beginStorageBatch = (storage, entries, onWrite) => writeStorageBatch(storage, entries, true, onWrite);
