const DB_NAME = 'ivLyrics_marketplace';
const DB_VERSION = 1;
const STORE_NAME = 'addons';

export function createMarketplaceRepository(getIndexedDB) {
    let db = null;

    function open() {
        return new Promise((resolve, reject) => {
            const request = getIndexedDB().open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                    store.createIndex('type', 'metadata.type', { unique: false });
                    store.createIndex('installedAt', 'installedAt', { unique: false });
                }
            };

            request.onsuccess = (event) => {
                db = event.target.result;
                resolve();
            };

            request.onerror = (event) => {
                console.error('[MarketplaceManager] IndexedDB open error:', event.target.error);
                reject(event.target.error);
            };
        });
    }

    function write(operation) {
        return new Promise((resolve, reject) => {
            if (!db) { reject(new Error('DB not open')); return; }
            const tx = db.transaction(STORE_NAME, 'readwrite');
            tx.oncomplete = () => resolve();
            tx.onabort = () => reject(tx.error || new Error('Marketplace storage transaction aborted'));
            operation(tx.objectStore(STORE_NAME));
        });
    }

    const put = data => write(store => store.put(data));
    const remove = id => write(store => store.delete(id));

    function getAll() {
        return new Promise((resolve, reject) => {
            if (!db) { resolve([]); return; }
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    }

    return { open, put, remove, getAll };
}
