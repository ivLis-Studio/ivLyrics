/**
 * Local LRCLIB coordinator. The runtime extension supplies the bundled worker
 * source; this service never downloads code, opens a server, or reads a whole DB.
 * Only references/metadata live in this private IndexedDB, never settings/cloud.
 */
import { publishLocalLrclib, readLocalLrclib } from './localLrclibRuntime.mjs';
import { checkAbort, error, normalizeError } from './localLrclibErrors.mjs';
import { createLocalLrclibWorker } from './localLrclibWorker.mjs';
import { createLocalLrclibFiles } from './localLrclibFiles.mjs';
import { createLocalLrclibReferenceStore, LOCAL_LRCLIB_DATABASE_NAME, isOwnedFile, isLocalDatabaseRecord } from './localLrclibReferenceStore.mjs';

const QUERY_TIMEOUT = 3000;

function createTaskQueue() {
    let tail = Promise.resolve();
    return task => {
        const result = tail.then(task);
        tail = result.then(() => undefined, () => undefined);
        return result;
    };
}

export function installLocalLrclibDatabase(root, workerSource) {
    const existing = readLocalLrclib(root);
    if (existing) return existing;

    const { checkWorkerSupport, createSession, request, dispose } = createLocalLrclibWorker(root, workerSource);

    const references = createLocalLrclibReferenceStore(root);
    const { getDirectory, fileType, decompress, removeOwned, uniqueId } =
        createLocalLrclibFiles(root, { stage: references.stage });
    const emptyState = () => ({
        phase: 'empty', name: '', size: 0, progress: 0,
        bytesWritten: 0, errorCode: null, revision: ''
    });
    let state = emptyState();
    let active = null;
    const enqueueControl = createTaskQueue();
    let controls = 0;
    let connecting = null;
    let restoreController = null;
    const subscribers = new Set();
    const imports = new Set();

    const getState = () => ({ ...state, available: active !== null });
    const recordStatus = record => ({
        name: record.name, size: record.size, revision: record.revision,
        progress: 1, bytesWritten: record.kind === 'opfs' ? record.size : 0
    });

    function publish(update) {
        state = { ...state, ...update };
        for (const fn of [...subscribers]) {
            try { fn(getState()); } catch (_) { /* Observers cannot break an import. */ }
        }
    }
    function report(value) {
        const failure = normalizeError(value);
        publish({
            ...(active ? recordStatus(active.record) : {}),
            phase: failure.code === 'permission' ? 'permission' : 'error', errorCode: failure.code
        });
        return failure;
    }
    function control(task, { signal, waiting, returnStateOnError = false } = {}) {
        controls++;
        return enqueueControl(async () => {
            try {
                checkAbort(signal);
                waiting?.();
                const locks = root.navigator?.locks;
                if (typeof locks?.request !== 'function') return await task(false);
                return await locks.request(LOCAL_LRCLIB_DATABASE_NAME, { mode: 'exclusive', ...(signal ? { signal } : {}) }, () => {
                    checkAbort(signal);
                    return task(true);
                });
            } catch (reason) {
                const failure = report(reason);
                if (returnStateOnError) return getState();
                throw failure;
            } finally {
                controls--;
            }
        });
    }
    async function cleanupPending(exclusive, signal) {
        const snapshot = await references.snapshot(signal);
        for (const record of snapshot.pending) {
            checkAbort(signal);
            if (snapshot.record?.kind === 'opfs' && snapshot.record.opfsName === record.opfsName) continue;
            // Only an exclusive cross-context lock proves an unfinished import
            // is abandoned. Without it, another tab may still be writing.
            if (record.status === 'importing' && !exclusive) continue;
            if (await removeOwned(record)) await references.forget(record, signal);
        }
    }
    async function discardTemporary(temporary) {
        if (!isOwnedFile(temporary.record)) return;
        try {
            await references.retire(temporary.record);
            if (await removeOwned(temporary.record, temporary.directory)) await references.forget(temporary.record);
        } catch (_) { /* The durable import entry is retried under the next exclusive lock. */ }
    }

    function ready(record) {
        publish({ ...recordStatus(record), phase: 'ready', errorCode: null });
    }

    function replaceActive(record, file, session) {
        const previous = active;
        active = record ? { record, file, session, enqueue: createTaskQueue() } : null;
        dispose(previous?.session);
    }
    function importFile(file, { handle, signal } = {}) {
        const controller = new root.AbortController();
        const abort = () => controller.abort();
        if (signal?.aborted) abort();
        else signal?.addEventListener('abort', abort, { once: true });
        imports.add(controller);
        return control(async exclusive => {
            const temporary = {};
            let candidate = null;
            let committed = false;
            try {
                checkAbort(controller.signal);
                checkWorkerSupport();
                const type = await fileType(file);
                checkAbort(controller.signal);
                await cleanupPending(exclusive, controller.signal);
                checkAbort(controller.signal);
                let databaseFile = file;
                if (type === 'gzip') {
                    publish({ phase: 'importing' });
                    databaseFile = await decompress(file, controller.signal, temporary, publish);
                    if (await fileType(databaseFile) !== 'sqlite') throw error('invalidFile');
                }
                checkAbort(controller.signal);
                candidate = createSession();
                publish({ phase: 'opening' });
                await request(candidate, 'open', { file: databaseFile }, { signal: controller.signal });
                checkAbort(controller.signal);
                const record = {
                    kind: type === 'gzip' ? 'opfs' : handle ? 'handle' : 'file',
                    name: file.name, size: databaseFile.size, revision: uniqueId(),
                    lastModified: databaseFile.lastModified,
                    ...(type === 'gzip' ? { opfsName: temporary.record.opfsName } : handle ? { handle } : {})
                };
                // Read the actual persisted predecessor and journal its cleanup
                // in the same transaction that activates the new source.
                await references.install(record, controller.signal);
                // Cancellation after the IDB commit must not delete the new DB.
                committed = true;
                replaceActive(record, databaseFile, candidate);
                candidate = null;
                ready(record);
                await cleanupPending(exclusive).catch(() => {});
                return getState();
            } finally {
                dispose(candidate);
                if (!committed) await discardTemporary(temporary);
            }
        }, {
            signal: controller.signal,
            waiting: () => publish({ phase: 'opening', name: file?.name || '', size: file?.size || 0,
                progress: 0, bytesWritten: 0, errorCode: null }),
        })
            .finally(() => {
                imports.delete(controller);
                signal?.removeEventListener('abort', abort);
            });
    }
    function connect() {
        if (connecting) return connecting;
        const controller = new root.AbortController();
        restoreController = controller;
        connecting = control(async exclusive => {
            let candidate = null;
            try {
                checkAbort(controller.signal);
                await cleanupPending(exclusive, controller.signal);
                const record = root.indexedDB ? await references.read(controller.signal) : active?.record;
                checkAbort(controller.signal);
                if (!record) {
                    replaceActive(null);
                    publish(emptyState());
                    return getState();
                }
                const sameSource = active?.record.revision === record.revision;
                if (active && !sameSource) replaceActive(null);
                if (!isLocalDatabaseRecord(record)) throw error('invalidDatabase');
                if (sameSource && !active.session?.closed) { ready(active.record); return getState(); }
                publish({ phase: 'opening', name: record.name, size: record.size,
                    progress: 0, bytesWritten: 0, errorCode: null, revision: record.revision });
                let file = sameSource ? active.file : null;
                if (!file && record.kind === 'handle') {
                    // Restore must never request permission without a user gesture.
                    if (!record.handle.queryPermission || await record.handle.queryPermission({ mode: 'read' }) !== 'granted') {
                        throw error('permission');
                    }
                    file = await record.handle.getFile();
                } else if (!file && record.kind === 'opfs') {
                    const directory = await getDirectory();
                    file = await (await directory.getFileHandle(record.opfsName)).getFile();
                } else if (!file) {
                    throw error('permission'); // An input-selected File must be reselected after a restart.
                }
                checkAbort(controller.signal);
                if (await fileType(file) !== 'sqlite') throw error('invalidFile');
                checkAbort(controller.signal);
                candidate = createSession();
                await request(candidate, 'open', { file }, { signal: controller.signal });
                checkAbort(controller.signal);
                // A changed original invalidates caches; no full-file hashing/read.
                const changed = file.size !== record.size || record.kind === 'handle' && file.lastModified !== record.lastModified;
                const restored = changed ? { ...record, size: file.size, lastModified: file.lastModified, revision: uniqueId() } : record;
                if (restored !== record && !await references.refresh(record, restored, controller.signal)) {
                    throw error('unavailable');
                }
                if (!exclusive && root.indexedDB) {
                    const current = await references.read(controller.signal);
                    if (current?.revision !== restored.revision) throw error('unavailable');
                }
                replaceActive(restored, file, candidate);
                candidate = null;
                ready(restored);
                return getState();
            } finally { dispose(candidate); }
        }, { signal: controller.signal, returnStateOnError: true }).finally(() => {
            connecting = null;
            if (restoreController === controller) restoreController = null;
        });
        return connecting;
    }
    function cancelImport() {
        for (const controller of imports) controller.abort();
        restoreController?.abort();
    }
    function remove() {
        cancelImport();
        return control(async exclusive => {
            await references.install(null);
            replaceActive(null);
            publish(emptyState());
            await cleanupPending(exclusive).catch(() => {});
            return getState();
        });
    }
    function lookup(info) {
        if (!active) return Promise.resolve(null);
        const expected = active;
        const started = Date.now();
        const controller = new root.AbortController();
        return new Promise(resolve => {
            let finished = false;
            const finish = result => {
                if (finished) return;
                finished = true;
                root.clearTimeout(timer);
                resolve(result);
            };
            // Includes queueing and reopening time, not just worker execution.
            const timer = root.setTimeout(() => { controller.abort(); finish(null); }, QUERY_TIMEOUT);
            expected.enqueue(async () => {
                if (finished || active !== expected) return null;
                try {
                    const remaining = () => Math.max(1, QUERY_TIMEOUT - (Date.now() - started));
                    if (expected.session?.closed) {
                        expected.session = createSession();
                        await request(expected.session, 'open', { file: expected.file }, { signal: controller.signal, timeout: remaining() });
                    }
                    checkAbort(controller.signal);
                    return await request(expected.session, 'lookup', { info }, { signal: controller.signal, timeout: remaining() });
                } catch (reason) {
                    if (!controls && active === expected) {
                        report(controller.signal.aborted ? error('unavailable') : reason);
                    }
                    return null;
                }
            }).then(result => finish(active === expected ? result ?? null : null), () => finish(null));
        });
    }
    async function pickFile() {
        try {
            if (typeof root.showOpenFilePicker === 'function') {
                // Call immediately, retaining the caller's user activation.
                const [handle] = await root.showOpenFilePicker({
                    multiple: false,
                    types: [{ description: 'LRCLIB SQLite', accept: { 'application/octet-stream': ['.sqlite3', '.gz'] } }]
                });
                if (!handle) throw error('canceled');
                return importFile(await handle.getFile(), { handle });
            }
            if (!root.document?.createElement) throw error('unsupported');
            const file = await new Promise((resolve, reject) => {
                const input = root.document.createElement('input');
                input.type = 'file';
                input.accept = '.sqlite3,.sqlite3.gz,.gz';
                input.style.display = 'none';
                const cleanup = () => {
                    input.removeEventListener('change', change);
                    input.removeEventListener('cancel', cancel);
                    input.remove();
                };
                const change = () => {
                    const selected = input.files?.[0];
                    cleanup();
                    if (selected) resolve(selected); else reject(error('canceled'));
                };
                const cancel = () => { cleanup(); reject(error('canceled')); };
                input.addEventListener('change', change);
                input.addEventListener('cancel', cancel);
                root.document.body?.appendChild(input);
                try { input.click(); } catch (reason) { cleanup(); reject(reason); }
            });
            return importFile(file);
        } catch (reason) { throw report(reason); }
    }

    return publishLocalLrclib(root, Object.freeze({
        getState,
        subscribe(fn) {
            if (typeof fn !== 'function') return () => {};
            subscribers.add(fn);
            try { fn(getState()); } catch (_) { /* Same isolation as publish(). */ }
            return () => subscribers.delete(fn);
        },
        connect, pickFile, importFile, cancelImport,
        disconnect: remove, remove, lookup,
        getCacheVersion: () => active?.record.revision || ''
    }));
}
