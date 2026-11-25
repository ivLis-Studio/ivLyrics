import { beginStorageBatch } from "./settingsStorageBatch.mjs";

export const SETTINGS_IMPORT_JOURNAL_KEY = "ivLyrics:pending-settings-import";
const SETTINGS_IMPORT_LOCK = "ivLyrics:settings-import";
const LOCAL_IMPORT_QUEUE = Symbol.for("ivLyrics.settingsImportQueue");

function readJournal(storage) {
  const raw = storage.getItem(SETTINGS_IMPORT_JOURNAL_KEY);
  if (!raw) return null;
  const journal = JSON.parse(raw);
  if (typeof journal?.id !== "string" || !Array.isArray(journal.changes)
    || journal.changes.some(change => typeof change?.key !== "string" || !change.key.startsWith("ivLyrics:")
      || change.key === SETTINGS_IMPORT_JOURNAL_KEY || typeof change.value !== "string"
      || (change.previous !== null && typeof change.previous !== "string"))) {
    throw new TypeError("Invalid interrupted settings import record.");
  }
  return journal;
}

export function hasInterruptedSettingsImport(storage) {
  return storage.getItem(SETTINGS_IMPORT_JOURNAL_KEY) != null;
}

export function assertSettingsImportRecovered(storage) {
  if (storage && hasInterruptedSettingsImport(storage)) {
    throw new Error("Recover the interrupted settings import before retrying.");
  }
}

export function applyPendingSettingsImportBaseline(storage, settings) {
  const journal = readJournal(storage);
  for (const { key, value, previous } of journal?.changes ?? []) {
    // Compare against the live copy so a separate edit during import survives.
    if (!Object.hasOwn(settings, key) || settings[key] !== value) continue;
    if (previous === null) delete settings[key];
    else settings[key] = previous;
  }
}

export function runSettingsImportLocked(operation, host = globalThis) {
  const locks = host.navigator?.locks;
  if (typeof locks?.request === "function") return locks.request(SETTINGS_IMPORT_LOCK, operation);

  // Startup and the route can load separate copies of this module. They still
  // need one queue in a Spotify window where Web Locks are unavailable.
  const request = (host[LOCAL_IMPORT_QUEUE] ?? Promise.resolve()).then(operation);
  const tail = request.catch(() => {});
  host[LOCAL_IMPORT_QUEUE] = tail;
  void tail.then(() => {
    if (host[LOCAL_IMPORT_QUEUE] === tail) delete host[LOCAL_IMPORT_QUEUE];
  });
  return request;
}

function createSettingsImportJournal(storage, entries) {
  assertSettingsImportRecovered(storage);
  const changes = [...new Map(entries)].map(([key, value]) => ({
    key, value, previous: storage.getItem(key) ?? null,
  })).filter(change => change.previous !== change.value);
  if (!changes.length) return null;

  const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
  const save = changes => storage.setItem(SETTINGS_IMPORT_JOURNAL_KEY, JSON.stringify({ id, changes }));
  save(changes);
  return {
    id,
    relinquish(key) {
      const current = readJournal(storage);
      if (current?.id === id) save(current.changes.filter(change => change.key !== key));
    },
    clear() {
      if (readJournal(storage)?.id === id) storage.removeItem(SETTINGS_IMPORT_JOURNAL_KEY);
    },
  };
}

export function beginSettingsImportBatch(storage, entries, durable) {
  const journal = durable ? createSettingsImportJournal(storage, entries) : null;
  let batch;
  try {
    batch = beginStorageBatch(storage, entries, key => journal?.relinquish(key));
  } catch (error) {
    // If native rollback itself failed, keep the record for the next startup.
    if (!(error instanceof AggregateError)) journal?.clear();
    throw error;
  }
  return {
    restoreId: journal?.id,
    commit() {
      batch.commit();
      journal?.clear();
    },
    rollback() {
      batch.rollback();
      journal?.clear();
    },
  };
}

export async function recoverInterruptedSettingsImport(storage, readCommittedId) {
  const journal = readJournal(storage);
  if (!journal) return 0;
  const completed = await readCommittedId();
  const current = readJournal(storage);
  let restored = 0;
  if (current?.id !== journal.id) return restored;
  if (completed !== journal.id) {
    for (const { key, value, previous } of current.changes) {
      if (storage.getItem(key) !== value) continue;
      if (previous === null) storage.removeItem(key);
      else storage.setItem(key, previous);
      restored++;
    }
  }
  storage.removeItem(SETTINGS_IMPORT_JOURNAL_KEY);
  return restored;
}

