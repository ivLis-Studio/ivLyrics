import { openIdbDatabase, runIdbTransaction } from "../core/indexedDbTransaction.mjs";
import { redactLyricsCacheDataForPersistence } from "./lyricsCachePrivacy.mjs";

const STORE_KEYS = {
    lyrics: 'cacheKey',
    translations: 'cacheKey',
    youtube: 'trackId',
    metadata: 'cacheKey',
    sync: 'trackId',
    tmi: 'cacheKey',
};

export const LYRICS_CACHE_DB_NAME = 'ivLyricsCache';
export const LYRICS_CACHE_DB_VERSION = 7;
const LYRICS_CACHE_REPAIR_VERSION = 8;
export const LYRICS_CACHE_STORES = Object.keys(STORE_KEYS);

const cacheIndexes = name => name === 'lyrics' || name === 'tmi' ? ['cachedAt', 'trackId'] : ['cachedAt'];
const hasInlineKey = (store, name) => store.keyPath === STORE_KEYS[name] && !store.autoIncrement;

function createCacheStore(db, name) {
    const store = db.createObjectStore(name, { keyPath: STORE_KEYS[name] });
    for (const index of cacheIndexes(name)) store.createIndex(index, index, { unique: false });
    return store;
}

function repairCacheStore(db, tx, name) {
    const legacy = tx.objectStore(name);
    if (hasInlineKey(legacy, name)) {
        for (const index of cacheIndexes(name)) {
            if (!legacy.indexNames.contains(index)) legacy.createIndex(index, index, { unique: false });
        }
        return;
    }

    // Rename and copy in one upgrade transaction so large caches do not have
    // to be collected in memory or exposed with only part of their data.
    let temporaryName = `ivLyrics-legacy-${name}`;
    while (db.objectStoreNames.contains(temporaryName)) temporaryName += '-';
    legacy.name = temporaryName;
    const restored = createCacheStore(db, name);
    const request = legacy.openCursor();
    request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
            db.deleteObjectStore(temporaryName);
            return;
        }
        const value = cursor.value;
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            const record = { ...value, [STORE_KEYS[name]]: cursor.primaryKey };
            if (name === 'lyrics') record.data = redactLyricsCacheDataForPersistence(record.data);
            restored.put(record);
        }
        cursor.continue();
    };
}

function upgradeLyricsCache(db, oldVersion, tx) {
    // Discard pre-v7 lyrics written before contributor identities were redacted.
    if (oldVersion < 7 && db.objectStoreNames.contains('lyrics')) db.deleteObjectStore('lyrics');
    for (const name of LYRICS_CACHE_STORES) {
        if (db.objectStoreNames.contains(name)) repairCacheStore(db, tx, name);
        else createCacheStore(db, name);
    }
}

async function hasLyricsCacheSchema(db) {
    if (LYRICS_CACHE_STORES.some(name => !db.objectStoreNames.contains(name))) return false;
    return runIdbTransaction(db, LYRICS_CACHE_STORES, 'readonly', tx =>
        LYRICS_CACHE_STORES.every(name => {
            const store = tx.objectStore(name);
            return hasInlineKey(store, name) && cacheIndexes(name).every(index => store.indexNames.contains(index));
        }));
}

export async function openLyricsCacheDatabase(indexedDB, name, version) {
    const open = targetVersion => openIdbDatabase(indexedDB, name, targetVersion, upgradeLyricsCache);
    let db;
    try {
        try {
            db = await open(version);
        } catch (error) {
            if (error?.name !== 'VersionError' || version !== LYRICS_CACHE_DB_VERSION) throw error;
            db = await open(LYRICS_CACHE_REPAIR_VERSION);
        }
        // Healthy v7 databases keep their version so older clients can still read them.
        if (await hasLyricsCacheSchema(db)) return db;
        if (db.version < LYRICS_CACHE_REPAIR_VERSION) {
            db.close();
            db = await open(LYRICS_CACHE_REPAIR_VERSION);
            if (await hasLyricsCacheSchema(db)) return db;
        }
        throw new Error(`Invalid lyrics cache schema in ${name}.`);
    } catch (error) {
        db?.close();
        throw error;
    }
}

export function writeLyricsCacheTransaction(db, storeNames, queueRequests) {
    return runIdbTransaction(db, storeNames, 'readwrite', queueRequests, 'Lyrics cache transaction aborted.');
}

export function visitLyricsCacheRecords(source, keyRange, visit, complete) {
    const request = source.openCursor(keyRange ?? undefined);
    request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
            visit(cursor);
            cursor.continue();
        } else {
            complete?.();
        }
    };
    return request;
}
