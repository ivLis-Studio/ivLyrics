import { checkAbort, error, normalizeError } from './localLrclibErrors.mjs';

export const LOCAL_LRCLIB_DATABASE_NAME = 'ivLyricsLocalLrclib';
const STORE = 'references';
const ACTIVE = 'active';
const PENDING = 'pending';
const OWN_FILE = /^ivlyrics-lrclib-[a-f0-9]{32}\.sqlite3$/;

export const isOwnedFile = record => record?.kind === 'opfs'
    && typeof record.opfsName === 'string' && OWN_FILE.test(record.opfsName);

export function isLocalDatabaseRecord(record) {
    return record && typeof record.name === 'string' && Number.isSafeInteger(record.size) && record.size > 0
        && typeof record.revision === 'string' && /^[a-f0-9]{32}$/.test(record.revision)
        && (record.kind === 'file' || record.kind === 'handle' && record.handle?.kind === 'file'
            || isOwnedFile(record));
}

export function createLocalLrclibReferenceStore(root) {
    let databasePromise = null;

    function getDatabase() {
        if (databasePromise) return databasePromise;
        const pending = new Promise((resolve, reject) => {
            let finished = false;
            const request = root.indexedDB.open(LOCAL_LRCLIB_DATABASE_NAME, 1);
            const timeout = root.setTimeout(() => fail(error('unavailable')), 5000);
            function fail(reason) {
                if (finished) return;
                finished = true;
                root.clearTimeout(timeout);
                reject(reason);
            }
            request.onupgradeneeded = () => {
                if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
            };
            request.onerror = () => fail(request.error);
            request.onblocked = () => fail(error('unavailable'));
            request.onsuccess = () => {
                const db = request.result;
                if (finished) { db.close(); return; }
                finished = true;
                root.clearTimeout(timeout);
                const forgetConnection = () => { if (databasePromise === opening) databasePromise = null; };
                db.onclose = forgetConnection;
                db.onversionchange = () => { db.close(); forgetConnection(); };
                resolve(db);
            };
        });
        const opening = pending.catch(reason => {
            if (databasePromise === opening) databasePromise = null;
            throw normalizeError(reason);
        });
        databasePromise = opening;
        return opening;
    }

    async function transaction(mode, signal, prepare) {
        checkAbort(signal);
        const db = await getDatabase();
        checkAbort(signal);
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, mode);
            const store = tx.objectStore(STORE);
            let result;
            const abort = () => { try { tx.abort(); } catch (_) { /* Already committed. */ } };
            const cleanup = () => signal?.removeEventListener('abort', abort);
            tx.oncomplete = () => { cleanup(); resolve(result); };
            tx.onabort = tx.onerror = (event) => {
                cleanup();
                reject(signal?.aborted ? error('canceled') : normalizeError(tx.error || event?.target?.error));
            };
            signal?.addEventListener('abort', abort, { once: true });
            const guarded = task => {
                try { task(); } catch (reason) {
                    abort();
                    cleanup();
                    reject(normalizeError(reason));
                }
            };
            const read = (key, receive) => {
                const request = store.get(key);
                request.onsuccess = () => guarded(() => receive(request.result));
            };
            // The caller sees changes only after the transaction commits.
            guarded(() => prepare({ store, read, setResult: value => { result = value; } }));
        });
    }

    function withJournal(mode, signal, prepare) {
        return transaction(mode, signal, ({ read, store, setResult }) => {
            read(ACTIVE, current => read(PENDING, records => {
                const pending = new Map();
                for (const record of Array.isArray(records) ? records : []) {
                    if (isOwnedFile(record) && ['importing', 'cleanup'].includes(record.status)) {
                        pending.set(record.opfsName, record);
                    }
                }
                prepare({ current: current ?? null, pending, store, setResult });
                if (mode === 'readwrite') {
                    if (pending.size) store.put([...pending.values()], PENDING);
                    else store.delete(PENDING);
                }
            }));
        });
    }

    function updateJournal(record, status, signal) {
        if (!root.indexedDB) return Promise.reject(error('unsupported'));
        return withJournal('readwrite', signal, ({ current, pending }) => {
            if (!isOwnedFile(record)) return;
            if (status === null) pending.delete(record.opfsName);
            else if (current?.kind !== 'opfs' || current.opfsName !== record.opfsName) {
                pending.set(record.opfsName, { kind: 'opfs', opfsName: record.opfsName, status });
            }
        });
    }

    return {
        read(signal) {
            if (!root.indexedDB) return Promise.resolve(null);
            return transaction('readonly', signal, ({ read, setResult }) =>
                read(ACTIVE, current => setResult(current ?? null)));
        },
        snapshot(signal) {
            if (!root.indexedDB) return Promise.resolve({ record: null, pending: [] });
            return withJournal('readonly', signal, ({ current, pending, setResult }) =>
                setResult({ record: current, pending: [...pending.values()] }));
        },
        install(record, signal) {
            if (!root.indexedDB) {
                if (record === null || record.kind === 'file') return Promise.resolve(null);
                return Promise.reject(error('unsupported'));
            }
            return withJournal('readwrite', signal, ({ current, pending, store, setResult }) => {
                setResult(current);
                if (record === null) store.delete(ACTIVE);
                else store.put(record, ACTIVE);
                if (isOwnedFile(record)) pending.delete(record.opfsName);
                if (isOwnedFile(current) && current.opfsName !== record?.opfsName) {
                    pending.set(current.opfsName, { kind: 'opfs', opfsName: current.opfsName, status: 'cleanup' });
                }
            });
        },
        refresh(previous, next, signal) {
            if (!root.indexedDB) return Promise.reject(error('unsupported'));
            return transaction('readwrite', signal, ({ store, read, setResult }) => {
                read(ACTIVE, current => {
                    const unchanged = current?.revision === previous.revision;
                    if (unchanged) store.put(next, ACTIVE);
                    setResult(unchanged);
                });
            });
        },
        stage: (record, signal) => updateJournal(record, 'importing', signal),
        retire: record => updateJournal(record, 'cleanup'),
        forget: (record, signal) => updateJournal(record, null, signal),
    };
}
