import { awaitIdbRequest, runIdbTransaction } from "../../core/indexedDbTransaction.mjs";
import { hashValue } from "./studyIdentity.mjs";
import { prepareStudyPackForDisplay } from "./studyPack.mjs";

const DB_NAME = "ivLyricsLearningMode";
const DB_VERSION = 1;
const SESSION_STORES = ["studyPacks", "progress"];

function quizRevisionOf(pack) {
    if (pack.quizRevision) return pack.quizRevision;
    return hashValue(JSON.stringify([
        pack.updatedAt ?? null,
        (pack.quiz || []).map(item => [item?.id, item?.question, item?.choices, item?.answerIndex]),
    ]));
}

function progressRecord(pack, answers) {
    const quiz = pack.quiz || [];
    return {
        cacheKey: pack.cacheKey,
        trackId: pack.trackId,
        quizRevision: quizRevisionOf(pack),
        answers,
        score: Object.values(answers).filter(answer => answer?.correct).length,
        total: quiz.length,
        updatedAt: Date.now(),
    };
}

export function createStudyRepository(getIndexedDB) {
    let dbPromise = null;

    const createDb = () => {
        if (dbPromise) return dbPromise;

        const opening = new Promise((resolve, reject) => {
            const request = getIndexedDB().open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains("studyPacks")) {
                    const store = db.createObjectStore("studyPacks", { keyPath: "cacheKey" });
                    store.createIndex("trackId", "trackId", { unique: false });
                    store.createIndex("updatedAt", "updatedAt", { unique: false });
                }
                if (!db.objectStoreNames.contains("wordbook")) {
                    const store = db.createObjectStore("wordbook", { keyPath: "id" });
                    store.createIndex("trackId", "trackId", { unique: false });
                    store.createIndex("expression", "expression", { unique: false });
                }
                if (!db.objectStoreNames.contains("progress")) {
                    const store = db.createObjectStore("progress", { keyPath: "cacheKey" });
                    store.createIndex("trackId", "trackId", { unique: false });
                    store.createIndex("updatedAt", "updatedAt", { unique: false });
                }
            };

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        }).then(db => {
            const forgetConnection = () => {
                if (dbPromise === opening) dbPromise = null;
            };
            db.onclose = forgetConnection;
            db.onversionchange = () => {
                db.close();
                forgetConnection();
            };
            return db;
        }, error => {
            if (dbPromise === opening) dbPromise = null;
            throw error;
        });
        dbPromise = opening;
        return opening;
    };

    const runRequest = async (storeName, mode, run, result) => {
        const db = await createDb();
        const value = await runIdbTransaction(db, storeName, mode, tx => awaitIdbRequest(run(tx.objectStore(storeName))));
        return result(value);
    };

    const dbPut = (store, value) => runRequest(store, "readwrite", objectStore => objectStore.put(value), () => true);
    const dbGetAll = (store) => runRequest(store, "readonly", objectStore => objectStore.getAll(), value => Array.isArray(value) ? value : []);
    const dbDelete = (store, key) => runRequest(store, "readwrite", objectStore => objectStore.delete(key), () => true);

    const readStudySession = async (cacheKey) => {
        const db = await createDb();
        const [storedPack, progress] = await runIdbTransaction(db, SESSION_STORES, "readonly", tx =>
            Promise.all(SESSION_STORES.map(name => awaitIdbRequest(tx.objectStore(name).get(cacheKey)))));
        const pack = prepareStudyPackForDisplay(storedPack ?? null);
        const compatible = pack && progress && (progress.quizRevision
            ? progress.quizRevision === quizRevisionOf(pack)
            : pack === storedPack && !pack.quizRevision);
        return { pack, answers: compatible ? progress.answers || {} : {} };
    };

    const replaceStudySession = async (pack) => {
        const db = await createDb();
        const quizRevision = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
        const nextPack = { ...pack, quizRevision };
        await runIdbTransaction(db, SESSION_STORES, "readwrite", tx => {
            tx.objectStore("studyPacks").put(nextPack);
            tx.objectStore("progress").put(progressRecord(nextPack, {}));
        });
        return nextPack;
    };

    const saveProgress = async ({ pack, answers }) => {
        const db = await createDb();
        const progress = progressRecord(pack, answers);
        let saved = false;
        let writeError;
        await runIdbTransaction(db, SESSION_STORES, "readwrite", tx => {
            const request = tx.objectStore("studyPacks").get(pack.cacheKey);
            request.onsuccess = () => {
                try {
                    const current = prepareStudyPackForDisplay(request.result);
                    if (!current || current.trackId !== pack.trackId || quizRevisionOf(current) !== progress.quizRevision) return;
                    tx.objectStore("progress").put(progress);
                    saved = true;
                } catch (error) {
                    writeError = error;
                    tx.abort();
                }
            };
        }).catch(error => {
            throw writeError || error;
        });
        return saved;
    };

    return { dbPut, dbGetAll, dbDelete, readStudySession, replaceStudySession, saveProgress };
}
