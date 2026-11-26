import { awaitIdbRequest } from "../core/indexedDbTransaction.mjs";
import { DATABASE_BACKUP_RECEIPT_KEY, putBackupReceipt } from "../core/indexedDbBackupReceipt.mjs";
import {
    LYRICS_CACHE_STORES, visitLyricsCacheRecords, writeLyricsCacheTransaction,
} from './lyricsCacheDatabase.mjs';

const hasStore = (db, name) => db.objectStoreNames.contains(name);
const presentStores = db => LYRICS_CACHE_STORES.filter(name => hasStore(db, name));

function deleteTrackRecords(source, trackId, keyRange, type) {
    const prefix = `${trackId}:`;
    visitLyricsCacheRecords(source, keyRange, cursor => {
        const record = cursor.value;
        if ((!keyRange || record?.trackId != null) && record?.trackId !== trackId) return;
        if (type) {
            const key = String(record?.cacheKey || '');
            const recordType = record?.type || (key.startsWith(prefix) ? key.slice(prefix.length).split(':', 2)[1] : null);
            if (recordType !== type) return;
        }
        cursor.delete();
    });
}

export async function deleteLyricsCacheTranslations(db, trackId, keyRange, type) {
    await writeLyricsCacheTransaction(db, 'translations', tx => {
        deleteTrackRecords(tx.objectStore('translations'), trackId, keyRange, type);
    });
    return true;
}

export function deleteLyricsCacheTrack(db, trackId, keyRange, indexRange, { legacyTiming, blockLegacyVideo } = {}) {
    const stores = ['lyrics', 'translations', 'youtube', 'metadata'];
    if (hasStore(db, 'sync')) stores.push('sync');
    if (hasStore(db, 'tmi')) stores.push('tmi');
    return writeLyricsCacheTransaction(db, stores, tx => {
        deleteTrackRecords(tx.objectStore('lyrics').index('trackId'), trackId, indexRange);
        const translations = tx.objectStore('translations');
        deleteTrackRecords(translations, trackId, keyRange);
        if (legacyTiming) deleteTrackRecords(translations, legacyTiming.trackId, legacyTiming.range, 'word');
        const videos = tx.objectStore('youtube');
        videos.delete(trackId);
        if (blockLegacyVideo) {
            // ISRC-only records can still serve other editions of the same recording.
            // Remember this track's clear independently of those shared records.
            videos.put({ trackId: [trackId], cachedAt: Date.now() });
        }
        deleteTrackRecords(tx.objectStore('metadata'), trackId, keyRange);
        if (stores.includes('sync')) tx.objectStore('sync').delete(trackId);
        if (stores.includes('tmi')) {
            deleteTrackRecords(tx.objectStore('tmi').index('trackId'), trackId, indexRange);
        }
    });
}

export async function clearLyricsCacheStores(db) {
    const stores = presentStores(db);
    if (!stores.length) return;
    await writeLyricsCacheTransaction(db, stores, tx => {
        for (const name of stores) {
            const store = tx.objectStore(name);
            if (name !== 'metadata') {
                store.clear();
                continue;
            }
            const receipt = store.get(DATABASE_BACKUP_RECEIPT_KEY);
            receipt.onsuccess = () => {
                store.clear();
                if (receipt.result) putBackupReceipt(store, receipt.result);
            };
        }
    });
}

export async function countLyricsCacheRecords(db, keyRange) {
    const stats = {};
    for (const name of LYRICS_CACHE_STORES) {
        stats[name] = 0;
        if (!hasStore(db, name)) continue;
        const store = db.transaction(name, 'readonly').objectStore(name);
        const total = awaitIdbRequest(store.count(name === 'youtube' ? keyRange.upperBound([], true) : undefined));
        const internal = name === 'metadata' ? awaitIdbRequest(store.count(DATABASE_BACKUP_RECEIPT_KEY)) : 0;
        const [rows, receiptRows] = await Promise.all([total, internal]);
        stats[name] = rows - receiptRows;
    }
    return stats;
}

function expiryType(storeName, record) {
    if (storeName !== 'translations') return storeName;
    if (record.type === 'cultural' || record.type === 'word' || record.type === 'motion') return record.type;
    return record.isPhonetic ? 'phonetic' : 'translation';
}

const measuredSize = (record, measure) => Number(record.sizeBytes) > 0 ? Number(record.sizeBytes) : measure(record);

// With measure, also returns the bytes of the records it keeps, so the same
// pass can stand in for a size scan.
export async function removeExpiredLyricsCacheRecords(db, isExpired, measure = null) {
    let keptBytes = 0;
    for (const name of presentStores(db)) {
        await writeLyricsCacheTransaction(db, name, tx => {
            visitLyricsCacheRecords(tx.objectStore(name), null, cursor => {
                if (cursor.primaryKey === DATABASE_BACKUP_RECEIPT_KEY) return;
                const record = cursor.value;
                if (isExpired(record.cachedAt, expiryType(name, record))) cursor.delete();
                else if (measure) keptBytes += measuredSize(record, measure);
            });
        });
    }
    return measure ? keptBytes : null;
}

// Returns an upper bound of the bytes left after any eviction.
export async function enforceLyricsCacheSizeLimit(db, limit, measure) {
    const sizeOf = record => measuredSize(record, measure);
    const entries = [];
    let totalBytes = 0;
    for (const name of presentStores(db)) {
        const store = db.transaction(name, 'readonly').objectStore(name);
        await new Promise((resolve, reject) => {
            const request = visitLyricsCacheRecords(store, null, cursor => {
                if (cursor.primaryKey === DATABASE_BACKUP_RECEIPT_KEY) return;
                const record = cursor.value;
                const sizeBytes = sizeOf(record);
                totalBytes += sizeBytes;
                entries.push({ name, key: cursor.primaryKey, cachedAt: Number(record.cachedAt) || 0, sizeBytes });
            }, resolve);
            request.onerror = () => reject(request.error);
        });
    }
    if (totalBytes <= limit) return totalBytes;

    const removalsByStore = new Map();
    for (const entry of entries.sort((a, b) => a.cachedAt - b.cachedAt)) {
        if (totalBytes <= limit) break;
        if (!removalsByStore.has(entry.name)) removalsByStore.set(entry.name, []);
        removalsByStore.get(entry.name).push(entry);
        totalBytes -= entry.sizeBytes;
    }
    for (const [name, removals] of removalsByStore) {
        await writeLyricsCacheTransaction(db, name, tx => {
            const store = tx.objectStore(name);
            for (const { key, cachedAt, sizeBytes } of removals) {
                const request = store.get(key);
                request.onsuccess = () => {
                    const record = request.result;
                    // A refresh committed during the scan may now own this key.
                    if (record && (Number(record.cachedAt) || 0) === cachedAt && sizeOf(record) === sizeBytes) store.delete(key);
                    else if (record) totalBytes += sizeOf(record);
                };
            }
        });
    }
    return totalBytes;
}
