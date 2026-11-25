import { checkAbort, error, normalizeError } from './localLrclibErrors.mjs';

const OPEN_TIMEOUT = 15000;

export function createLocalLrclibWorker(root, workerSource) {
    let nextRequest = 0;

    function checkWorkerSupport() {
        if (typeof root.Worker !== 'function' || typeof root.Blob !== 'function'
            || !root.URL?.createObjectURL || !root.URL?.revokeObjectURL) throw error('unsupported');
        if (typeof workerSource !== 'string' || !workerSource.trim()) throw error('unavailable');
    }
    function revoke(session) {
        if (session.url) { root.URL.revokeObjectURL(session.url); session.url = null; }
    }
    function dispose(session, reason = error('unavailable')) {
        if (!session || session.closed) return;
        session.closed = true;
        session.worker.terminate();
        revoke(session);
        for (const pending of [...session.pending.values()]) pending.reject(reason);
        session.pending.clear();
    }
    function createSession() {
        checkWorkerSupport();
        const url = root.URL.createObjectURL(new root.Blob([workerSource], { type: 'text/javascript' }));
        let worker;
        try { worker = new root.Worker(url); }
        catch (reason) { root.URL.revokeObjectURL(url); throw normalizeError(reason); }
        const session = { worker, url, closed: false, pending: new Map() };
        worker.onmessage = event => {
            revoke(session);
            const message = event.data;
            const pending = session.pending.get(message?.id);
            if (!pending) return;
            if (message.error) pending.reject(normalizeError(message.error));
            else pending.resolve(message.result);
        };
        worker.onerror = event => { event.preventDefault?.(); dispose(session); };
        worker.onmessageerror = () => dispose(session);
        return session;
    }
    function request(session, action, payload, { signal, timeout = OPEN_TIMEOUT } = {}) {
        checkAbort(signal);
        if (session.closed) return Promise.reject(error('unavailable'));
        return new Promise((resolve, reject) => {
            const id = ++nextRequest;
            const cleanup = () => {
                root.clearTimeout(timer);
                signal?.removeEventListener('abort', abort);
                session.pending.delete(id);
            };
            const abort = () => dispose(session, error('canceled'));
            const timer = root.setTimeout(() => dispose(session), Math.max(1, timeout));
            session.pending.set(id, {
                resolve(value) { cleanup(); resolve(value); },
                reject(reason) { cleanup(); reject(reason); }
            });
            signal?.addEventListener('abort', abort, { once: true });
            try { session.worker.postMessage({ id, action, ...payload }); }
            catch (reason) { dispose(session, normalizeError(reason)); }
        });
    }
    return { checkWorkerSupport, createSession, request, dispose };
}
