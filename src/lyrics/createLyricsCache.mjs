import { redactLyricsCacheDataForPersistence } from "./lyricsCachePrivacy.mjs";
import { awaitIdbRequest } from "../core/indexedDbTransaction.mjs";
import { getLocalTrackUriFromCacheId, trackIdentity } from "../core/trackIdentity.mjs";
import { isUserEditedTranslation } from "./translationCache.mjs";
import { createLyricsCacheAccess } from "./lyricsCacheAccess.mjs";

import {
    openLyricsCacheDatabase, writeLyricsCacheTransaction, LYRICS_CACHE_DB_NAME, LYRICS_CACHE_DB_VERSION,
} from './lyricsCacheDatabase.mjs';
import {
    clearLyricsCacheStores, countLyricsCacheRecords, deleteLyricsCacheTrack, deleteLyricsCacheTranslations,
    enforceLyricsCacheSizeLimit, removeExpiredLyricsCacheRecords,
} from './lyricsCacheMaintenance.mjs';

async function readUnexpiredRecord(cache, db, storeName, key, expiryType) {
    const tx = db.transaction(storeName, 'readonly');
    const result = await awaitIdbRequest(tx.objectStore(storeName).get(key));
    return result && !cache._isExpired(result.cachedAt, expiryType) ? result : null;
}

async function writeCacheRecord(cache, db, storeName, record) {
    await writeLyricsCacheTransaction(db, storeName, tx => {
        tx.objectStore(storeName).put(cache._withSize({ ...record, cachedAt: Date.now() }));
    });
    cache._scheduleSizeEnforcement();
}

function createLyricsRecord(cacheKey, trackId, provider, data) {
    return { cacheKey, trackId, provider, data: redactLyricsCacheDataForPersistence(data) };
}

export const LYRICS_CACHE_INVALIDATED_EVENT = "ivLyrics:lyrics-cache-invalidated";

export function createLyricsCache({
    getIndexedDB,
    waitForDatabaseRecovery,
    getKeyRange,
    getPersistentStorage,
    onInvalidating,
    onInvalidated,
    debug,
}) {
    const access = createLyricsCacheAccess();

    async function runCacheOperation(cache, trackId, type, method, unavailable, action) {
        const { isCurrent, pendingClear } = access.capture(trackId, type);
        try {
            if (pendingClear) await pendingClear;
            const db = await cache._openDB();
            if (!isCurrent()) return unavailable;
            const result = await action(db, isCurrent);
            return isCurrent() ? result : unavailable;
        } catch (error) {
            console.error(`[LyricsCache] ${method} error:`, error);
            return unavailable;
        }
    }

    function readCacheData(cache, trackId, store, key, type, method) {
        return runCacheOperation(cache, trackId, type, method, null, async db => {
            if (!db.objectStoreNames.contains(store)) return null;
            const result = await readUnexpiredRecord(cache, db, store, key, type);
            return result ? result.data : null;
        });
    }

    function putCacheData(cache, store, record, type, method, canWrite) {
        return runCacheOperation(cache, record.trackId, type, method, false, async db => {
            if (!db.objectStoreNames.contains(store) || (canWrite && !canWrite())) return false;
            await writeCacheRecord(cache, db, store, record);
            return true;
        });
    }

    function clearSupplement(cache, trackId, type, method) {
        if (!trackId) return false;
        return access.clear(trackId, type, async () => {
            try {
                const db = await cache._openDB();
                return deleteLyricsCacheTranslations(db, trackId, cache._getTrackCacheKeyRange(trackId), type);
            } catch (error) {
                console.error(`[LyricsCache] ${method} error:`, error);
                return false;
            }
        });
    }

    function clearCache(trackId, remove, errorLabel) {
        const clear = access.clear(trackId, 'track', remove).then(() => true, error => {
            console.error(`[LyricsCache] ${errorLabel} error:`, error);
            return false;
        }).finally(() => onInvalidated?.(trackId));
        onInvalidating?.(trackId);
        return clear;
    }

    return {
        DB_NAME: LYRICS_CACHE_DB_NAME,
        DB_VERSION: LYRICS_CACHE_DB_VERSION,
        MAX_TOTAL_BYTES: 10 * 1024 * 1024 * 1024,

        EXPIRY: {
            lyrics: 365,
            translation: 365,
            phonetic: 365,
            cultural: 365,
            word: 365,
            metadata: 365,
            sync: 365,
            youtube: 365,
            tmi: 365,
            motion: 365
        },

        _db: null,
        _dbPromise: null,
        _sizeEnforcementTimer: null,
        _persistentStorageRequested: false,

        getRevision: access.getRevision,
        getTranslationRevision: access.getTranslationRevision,

        async _openDB() {
            if (this._db) return this._db;
            if (this._dbPromise) return this._dbPromise;

            const open = () => openLyricsCacheDatabase(getIndexedDB(), this.DB_NAME, this.DB_VERSION);
            const pending = waitForDatabaseRecovery?.();
            this._dbPromise = (pending ? Promise.resolve(pending).then(open) : open())
                .then(db => {
                    const reset = () => {
                        if (this._db !== db) return;
                        this._db = null;
                        this._dbPromise = null;
                    };
                    this._db = db;
                    db.onversionchange = () => {
                        db.close();
                        reset();
                    };
                    db.onclose = reset;
                    this._requestPersistentStorage();
                    return db;
                })
                .catch(error => {
                    console.error('[LyricsCache] Failed to open database:', error);
                    this._dbPromise = null;
                    throw error;
                });

            return this._dbPromise;
        },

        _requestPersistentStorage() {
            if (this._persistentStorageRequested) return;
            this._persistentStorageRequested = true;
            Promise.resolve().then(() => getPersistentStorage?.()?.persist?.()).catch(() => {});
        },

        _withSize(record) {
            const sized = { ...record, sizeBytes: 0 };
            try {
                const encoded = JSON.stringify(sized);
                sized.sizeBytes = typeof TextEncoder === 'function'
                    ? new TextEncoder().encode(encoded).byteLength
                    : encoded.length * 2;
            } catch {
                sized.sizeBytes = 0;
            }
            return sized;
        },

        _scheduleSizeEnforcement() {
            if (this._sizeEnforcementTimer) return;
            this._sizeEnforcementTimer = setTimeout(() => {
                this._sizeEnforcementTimer = null;
                this._enforceSizeLimit().catch((error) => {
                    console.error('[LyricsCache] size enforcement error:', error);
                });
            }, 1000);
        },

        async _enforceSizeLimit() {
            const db = await this._openDB();
            await enforceLyricsCacheSizeLimit(db, this.MAX_TOTAL_BYTES, record => this._withSize(record).sizeBytes);
        },

        _isExpired(cachedAt, type) {
            if (!cachedAt) return true;
            const expiryDays = this.EXPIRY[type] || 365;
            const expiryMs = expiryDays * 24 * 60 * 60 * 1000;
            return Date.now() - cachedAt > expiryMs;
        },

        _getLyricsKey(trackId, provider) {
            return `${trackId}:${provider || 'unknown'}`;
        },

        async getLyrics(trackId, provider) {
            return runCacheOperation(this, trackId, 'lyrics', 'getLyrics', null, async db => {
                const cacheKey = this._getLyricsKey(trackId, provider);
                const result = await readUnexpiredRecord(this, db, 'lyrics', cacheKey, 'lyrics');
                return result ? redactLyricsCacheDataForPersistence(result.data) : null;
            });
        },

        async setLyrics(trackId, provider, data, canWrite = () => true) {
            return runCacheOperation(this, trackId, 'lyrics', 'setLyrics', false, async db => {
                if (!canWrite()) return false;
                const cacheKey = this._getLyricsKey(trackId, provider);
                await writeCacheRecord(this, db, 'lyrics', createLyricsRecord(cacheKey, trackId, provider, data));
                return true;
            });
        },

        // The updater must run synchronously so its write is queued while the
        // IndexedDB readwrite transaction is active. Returning null keeps the record.
        async updateLyrics(trackId, provider, update) {
            return runCacheOperation(this, trackId, 'lyrics', 'updateLyrics', false, async (db, isCurrent) => {
                const cacheKey = this._getLyricsKey(trackId, provider);
                const written = await writeLyricsCacheTransaction(db, 'lyrics', tx => new Promise((resolve, reject) => {
                    const store = tx.objectStore('lyrics');
                    const request = store.get(cacheKey);
                    request.onerror = () => reject(request.error);
                    request.onsuccess = () => {
                        try {
                            if (!isCurrent()) return resolve(false);
                            const record = request.result;
                            const current = record && !this._isExpired(record.cachedAt, 'lyrics')
                                ? redactLyricsCacheDataForPersistence(record.data)
                                : null;
                            const data = update(current);
                            if (data == null || !isCurrent()) {
                                resolve(false);
                                return;
                            }
                            const next = createLyricsRecord(cacheKey, trackId, provider, data);
                            store.put(this._withSize({ ...next, cachedAt: Date.now() }));
                            resolve(true);
                        } catch (error) {
                            reject(error);
                        }
                    };
                }));
                if (written) this._scheduleSizeEnforcement();
                return written;
            });
        },

        _getTranslationKey(trackId, lang, isPhonetic, provider, sourceHash = null) {
            const providerSuffix = provider ? `:${provider}` : '';
            const sourceSuffix = sourceHash ? `:${sourceHash}` : '';
            return `${trackId}:${lang}:${isPhonetic ? 'phonetic' : 'translation'}${providerSuffix}${sourceSuffix}`;
        },

        _getTrackCacheKeyRange(trackId) {
            return typeof trackId === 'string'
                ? getKeyRange().bound(`${trackId}:`, `${trackId};`, false, true)
                : null;
        },

        async getTranslation(trackId, lang, isPhonetic = false, provider = null, sourceHash = null) {
            const cacheKey = this._getTranslationKey(trackId, lang, isPhonetic, provider, sourceHash);
            const type = isPhonetic ? 'phonetic' : 'translation';
            return readCacheData(this, trackId, 'translations', cacheKey, type, 'getTranslation');
        },

        async setTranslation(trackId, lang, isPhonetic, data, provider = null, sourceHash = null, canWrite, options) {
            return this.setTranslations(trackId, lang, provider, [{ isPhonetic, data, sourceHash }], canWrite, options);
        },

        async setTranslations(trackId, lang, provider, entries, canWrite = () => true, { preserveUserEdits = false } = {}) {
            return runCacheOperation(this, trackId, 'translation', 'setTranslation', false, async (db, isCurrent) => {
                if (!canWrite()) return false;
                let written = false;
                const cachedAt = Date.now();
                await writeLyricsCacheTransaction(db, 'translations', tx => {
                    const store = tx.objectStore('translations');
                    for (const { isPhonetic, sourceHash, data } of entries) {
                        const cacheKey = this._getTranslationKey(trackId, lang, isPhonetic, provider, sourceHash);
                        const write = () => {
                            store.put(this._withSize({ cacheKey, trackId, lang, isPhonetic, provider, sourceHash, data, cachedAt }));
                            written = true;
                        };
                        if (!preserveUserEdits) {
                            write();
                            continue;
                        }
                        // The edit and the background write share a transaction boundary.
                        const existing = store.get(cacheKey);
                        existing.onsuccess = () => {
                            const record = existing.result;
                            const type = isPhonetic ? 'phonetic' : 'translation';
                            if (isCurrent() && canWrite()
                                && !(isUserEditedTranslation(record?.data) && !this._isExpired(record.cachedAt, type))) {
                                write();
                            }
                        };
                    }
                });
                if (written) this._scheduleSizeEnforcement();
                return written;
            });
        },

        _getCulturalAnnotationsKey(trackId, targetLang, sourceLang, provider, sourceHash) {
            return `${trackId}:${targetLang}:cultural:${sourceLang || 'auto'}:${provider || 'auto'}:${sourceHash || 'unknown'}`;
        },

        async getCulturalAnnotations(trackId, targetLang, sourceLang, provider, sourceHash) {
            const key = this._getCulturalAnnotationsKey(trackId, targetLang, sourceLang, provider, sourceHash);
            return readCacheData(this, trackId, 'translations', key, 'cultural', 'getCulturalAnnotations');
        },

        async setCulturalAnnotations(trackId, targetLang, sourceLang, provider, sourceHash, data, canWrite = () => true) {
            const cacheKey = this._getCulturalAnnotationsKey(trackId, targetLang, sourceLang, provider, sourceHash);
            return putCacheData(this, 'translations', {
                cacheKey, trackId, lang: targetLang, sourceLang, provider, sourceHash, type: 'cultural', data,
            }, 'cultural', 'setCulturalAnnotations', canWrite);
        },

        _getWordSupplementsKey(trackId, targetLang, sourceLang, kind, sourceHash) {
            return `${trackId}:${targetLang}:word:${kind}:${sourceLang || 'auto'}:${sourceHash || 'unknown'}`;
        },

        // The key starts with the track ID so clearing a track clears its direction.
        _getMotionDirectionKey(trackId, sourceHash) {
            return `${trackId}:motion:${sourceHash || 'unknown'}`;
        },

        async getMotionDirection(trackId, sourceHash) {
            const key = this._getMotionDirectionKey(trackId, sourceHash);
            return readCacheData(this, trackId, 'translations', key, 'motion', 'getMotionDirection');
        },

        async setMotionDirection(trackId, sourceHash, data, canWrite = () => true) {
            return putCacheData(this, 'translations', {
                cacheKey: this._getMotionDirectionKey(trackId, sourceHash),
                trackId, sourceHash, type: 'motion', data,
            }, 'motion', 'setMotionDirection', canWrite);
        },

        async getWordSupplements(trackId, targetLang, sourceLang, kind, sourceHash) {
            const key = this._getWordSupplementsKey(trackId, targetLang, sourceLang, kind, sourceHash);
            return readCacheData(this, trackId, 'translations', key, 'word', 'getWordSupplements');
        },

        async setWordSupplements(trackId, targetLang, sourceLang, kind, sourceHash, data, canWrite = () => true) {
            const cacheKey = this._getWordSupplementsKey(trackId, targetLang, sourceLang, kind, sourceHash);
            return putCacheData(this, 'translations', {
                cacheKey, trackId, lang: targetLang, sourceLang, provider: `word:${kind}`, sourceHash, type: 'word', data,
            }, 'word', 'setWordSupplements', canWrite);
        },

        async clearWordSupplementsForTrack(trackId) {
            return clearSupplement(this, trackId, 'word', 'clearWordSupplementsForTrack');
        },

        async clearCulturalAnnotationsForTrack(trackId) {
            return clearSupplement(this, trackId, 'cultural', 'clearCulturalAnnotationsForTrack');
        },

        async getMetadata(trackId, lang) {
            return readCacheData(this, trackId, 'metadata', `${trackId}:${lang}`, 'metadata', 'getMetadata');
        },

        async setMetadata(trackId, lang, data, canWrite = () => true) {
            return putCacheData(this, 'metadata', {
                cacheKey: `${trackId}:${lang}`, trackId, lang, data,
            }, 'metadata', 'setMetadata', canWrite);
        },

        async getYouTube(trackId, isrc = null) {
            return runCacheOperation(this, trackId, 'youtube', 'getYouTube', null, async db => {
                const record = await readUnexpiredRecord(this, db, 'youtube', trackId, 'youtube');
                if (record) return !isrc || !record.isrc || record.isrc === isrc ? record.data : null;
                if (!isrc || trackId === isrc) return null;
                const [cleared, legacy] = await Promise.all([
                    readUnexpiredRecord(this, db, 'youtube', [trackId], 'youtube'),
                    readUnexpiredRecord(this, db, 'youtube', isrc, 'youtube'),
                ]);
                return cleared ? null : legacy?.data ?? null;
            });
        },

        async setYouTube(trackId, data, { isrc, canWrite = () => true } = {}) {
            return putCacheData(this, 'youtube', { trackId, ...(isrc ? { isrc } : {}), data },
                'youtube', 'setYouTube', canWrite);
        },

        async getSync(trackId) {
            return readCacheData(this, trackId, 'sync', trackId, 'sync', 'getSync');
        },

        async setSync(trackId, data) {
            return putCacheData(this, 'sync', { trackId, data }, 'sync', 'setSync');
        },

        async deleteSync(trackId) {
            if (!trackId) return false;
            return access.clear(trackId, 'sync', async () => {
                try {
                    const db = await this._openDB();
                    if (!db.objectStoreNames.contains('sync')) return false;
                    await writeLyricsCacheTransaction(db, 'sync', tx => tx.objectStore('sync').delete(trackId));
                    return true;
                } catch (error) {
                    console.error('[LyricsCache] deleteSync error:', error);
                    return false;
                }
            });
        },

        async getTMI(trackId, lang) {
            return readCacheData(this, trackId, 'tmi', `${trackId}:${lang}`, 'tmi', 'getTMI');
        },

        async setTMI(trackId, lang, data, canWrite = () => true) {
            return putCacheData(this, 'tmi', {
                cacheKey: `${trackId}:${lang}`, trackId, lang, data,
            }, 'tmi', 'setTMI', canWrite);
        },

        async cleanup() {
            try {
                const db = await this._openDB();
                await removeExpiredLyricsCacheRecords(db, (cachedAt, type) => this._isExpired(cachedAt, type));
                await this._enforceSizeLimit();
                debug('[LyricsCache] Cleanup completed');
            } catch (error) {
                console.error('[LyricsCache] cleanup error:', error);
            }
        },

        async clearTranslationForTrack(trackId) {
            if (!trackId) return false;
            return access.clear(trackId, 'translation', async () => {
                try {
                    const db = await this._openDB();
                    return await deleteLyricsCacheTranslations(db, trackId, this._getTrackCacheKeyRange(trackId));
                } catch (error) {
                    console.error('[LyricsCache] clearTranslationForTrack error:', error);
                    return false;
                }
            });
        },

        async clearTrack(trackId) {
            if (!trackId) return false;
            return clearCache(trackId, async () => {
                const db = await this._openDB();
                // Older timing entries use the raw local URI as their track ID.
                const rawUri = getLocalTrackUriFromCacheId(trackId);
                const legacyTiming = rawUri ? { trackId: rawUri, range: this._getTrackCacheKeyRange(rawUri) } : null;
                const keyRange = getKeyRange();
                await deleteLyricsCacheTrack(db, trackId, this._getTrackCacheKeyRange(trackId), keyRange.only(trackId), {
                    legacyTiming, blockLegacyVideo: trackIdentity.isSpotifyTrackId(trackId),
                });
            }, 'clearTrack');
        },

        async clearAll() {
            return clearCache(null, async () => {
                const db = await this._openDB();
                await clearLyricsCacheStores(db);
            }, 'clearAll');
        },

        async getStats() {
            try {
                const db = await this._openDB();
                return await countLyricsCacheRecords(db, getKeyRange());
            } catch (error) {
                console.error('[LyricsCache] getStats error:', error);
                return null;
            }
        }
    };
}
