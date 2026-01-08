// IndexedDB utilities for track sync offsets and language overrides

const APP_NAME = "ivLyrics";

// IndexedDB for track sync offsets
const DB_NAME = "ivLyrics-db";
const DB_VERSION = 1;
const STORE_NAME = "track-sync-offsets";

let dbInstance = null;

const initDB = () => {
  return new Promise((resolve, reject) => {
    if (dbInstance) {
      resolve(dbInstance);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error("[ivLyrics] IndexedDB error:", request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      console.log("[ivLyrics] IndexedDB initialized");
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
        console.log("[ivLyrics] IndexedDB object store created");
      }
    };
  });
};

const TrackSyncDB = {
  async getOffset(trackUri) {
    try {
      const db = await initDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], "readonly");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(trackUri);

        request.onsuccess = () => resolve(request.result || 0);
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error("[ivLyrics] Failed to get offset:", error);
      return 0;
    }
  },

  async setOffset(trackUri, offset) {
    try {
      const db = await initDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(offset, trackUri);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error("[ivLyrics] Failed to set offset:", error);
    }
  },

  async clearOffset(trackUri) {
    try {
      const db = await initDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(trackUri);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error("[ivLyrics] Failed to clear offset:", error);
    }
  },

  async getAllOffsets() {
    try {
      const db = await initDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], "readonly");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAllKeys();

        request.onsuccess = () => {
          const keys = request.result;
          const getAllRequest = store.getAll();

          getAllRequest.onsuccess = () => {
            const values = getAllRequest.result;
            const result = {};
            keys.forEach((key, index) => {
              result[key] = values[index];
            });
            resolve(result);
          };

          getAllRequest.onerror = () => reject(getAllRequest.error);
        };

        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error("[ivLyrics] Failed to get all offsets:", error);
      return {};
    }
  },

  async importOffsets(offsetsObj) {
    try {
      const db = await initDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], "readwrite");
        const store = transaction.objectStore(STORE_NAME);

        // Clear existing data first
        const clearRequest = store.clear();

        clearRequest.onsuccess = () => {
          // Add all new offsets
          Object.entries(offsetsObj).forEach(([trackUri, offset]) => {
            store.put(offset, trackUri);
          });
        };

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
    } catch (error) {
      console.error("[ivLyrics] Failed to import offsets:", error);
    }
  },
};

// IndexedDB for track language overrides (곡별 언어 오버라이드)
const LANG_DB_NAME = "ivLyrics-lang-db";
const LANG_DB_VERSION = 1;
const LANG_STORE_NAME = "track-language-overrides";

let langDbInstance = null;

const initLangDB = () => {
  return new Promise((resolve, reject) => {
    if (langDbInstance) {
      resolve(langDbInstance);
      return;
    }

    const request = indexedDB.open(LANG_DB_NAME, LANG_DB_VERSION);

    request.onerror = () => {
      console.error("[ivLyrics] Language IndexedDB error:", request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      langDbInstance = request.result;
      console.log("[ivLyrics] Language IndexedDB initialized");
      resolve(langDbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(LANG_STORE_NAME)) {
        db.createObjectStore(LANG_STORE_NAME);
        console.log("[ivLyrics] Language IndexedDB object store created");
      }
    };
  });
};

const TrackLanguageDB = {
  async getLanguage(trackUri) {
    try {
      const db = await initLangDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([LANG_STORE_NAME], "readonly");
        const store = transaction.objectStore(LANG_STORE_NAME);
        const request = store.get(trackUri);

        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error("[ivLyrics] Failed to get language override:", error);
      return null;
    }
  },

  async setLanguage(trackUri, language) {
    try {
      const db = await initLangDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([LANG_STORE_NAME], "readwrite");
        const store = transaction.objectStore(LANG_STORE_NAME);
        const request = store.put(language, trackUri);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error("[ivLyrics] Failed to set language override:", error);
    }
  },

  async clearLanguage(trackUri) {
    try {
      const db = await initLangDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([LANG_STORE_NAME], "readwrite");
        const store = transaction.objectStore(LANG_STORE_NAME);
        const request = store.delete(trackUri);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error("[ivLyrics] Failed to clear language override:", error);
    }
  },

  async getAllOverrides() {
    try {
      const db = await initLangDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([LANG_STORE_NAME], "readonly");
        const store = transaction.objectStore(LANG_STORE_NAME);
        const request = store.getAllKeys();

        request.onsuccess = () => {
          const keys = request.result;
          const getAllRequest = store.getAll();

          getAllRequest.onsuccess = () => {
            const values = getAllRequest.result;
            const result = {};
            keys.forEach((key, index) => {
              result[key] = values[index];
            });
            resolve(result);
          };

          getAllRequest.onerror = () => reject(getAllRequest.error);
        };

        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error("[ivLyrics] Failed to get all language overrides:", error);
      return {};
    }
  },
};

// Migrate from localStorage to IndexedDB
(async () => {
  try {
    const oldOffsets = localStorage.getItem("ivLyrics:track-sync-offsets");
    if (oldOffsets) {
      console.log("[ivLyrics] Migrating track-sync-offsets to IndexedDB");
      const offsetsObj = JSON.parse(oldOffsets);
      await TrackSyncDB.importOffsets(offsetsObj);
      localStorage.removeItem("ivLyrics:track-sync-offsets");
      console.log("[ivLyrics] Migration complete");
    }
  } catch (error) {
    console.error("[ivLyrics] Migration failed:", error);
  }
})();

// Export to window for global access
window.TrackSyncDB = TrackSyncDB;
window.TrackLanguageDB = TrackLanguageDB;
