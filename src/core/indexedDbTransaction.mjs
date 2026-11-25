export function openIdbDatabase(indexedDB, name, version, upgrade, { onRequestError } = {}) {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(name, version);
        let abandoned = false;
        request.onblocked = () => {
            abandoned = true;
            reject(new Error(`Close the other window using ${name} and retry.`));
        };
        request.onupgradeneeded = (event) => {
            const tx = request.transaction;
            if (abandoned) {
                // A rejected request may still reach its upgrade after the blocker closes.
                tx.abort();
                return;
            }
            try {
                upgrade(request.result ?? event.target.result, event.oldVersion, tx);
            } catch (error) {
                abandoned = true;
                try { tx?.abort(); } catch {}
                reject(error);
            }
        };
        request.onsuccess = () => {
            const db = request.result;
            if (abandoned) db.close();
            else resolve(db);
        };
        request.onerror = () => {
            if (abandoned) return;
            const error = request.error || new Error(`Could not open ${name}.`);
            reject(error);
            onRequestError?.(error);
        };
    });
}

export function awaitIdbRequest(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

export function putIdbRecord(store, key, value) {
    return store.keyPath == null ? store.put(value, key) : store.put(value);
}

export function awaitIdbTransaction(tx, abortMessage = "IndexedDB transaction aborted.") {
    return new Promise((resolve, reject) => {
        let requestError;
        tx.oncomplete = () => resolve();
        tx.onerror = event => { requestError ??= event?.target?.error; };
        tx.onabort = () => reject(tx.error || requestError || new Error(abortMessage));
    });
}

export async function runIdbTransaction(db, storeNames, mode, queueRequests, abortMessage) {
    const tx = db.transaction(storeNames, mode);
    const done = awaitIdbTransaction(tx, abortMessage);
    try {
        const [result] = await Promise.all([queueRequests(tx), done]);
        return result;
    } catch (error) {
        try { tx.abort(); } catch {}
        await done.catch(() => {});
        throw error;
    }
}
