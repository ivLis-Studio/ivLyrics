import { awaitIdbRequest, openIdbDatabase, runIdbTransaction } from "./indexedDbTransaction.mjs";
import { BACKUP_DURABILITY } from "./indexedDbBackupReceipt.mjs";

const DATABASE_NAME = "ivLyrics-database-backup-recovery";
const STORE_NAME = "rollback";
const ACTIVE_KEY = "active";

export function createIndexedDbBackupJournal(getIndexedDB) {
  let unsaved;

  async function withStore(mode, operation) {
    const db = await openIdbDatabase(getIndexedDB(), DATABASE_NAME, 1, database => {
      database.createObjectStore(STORE_NAME);
    });
    try {
      return await runIdbTransaction(db, STORE_NAME, mode, tx => operation(tx.objectStore(STORE_NAME)),
        undefined, mode === "readwrite" ? BACKUP_DURABILITY : undefined);
    } finally {
      db.close();
    }
  }

  return {
    async exists() {
      try {
        const databases = await getIndexedDB().databases?.();
        return !databases || databases.some(({ name }) => name === DATABASE_NAME);
      } catch {
        return true;
      }
    },
    read: async () => unsaved ?? withStore("readonly", store => awaitIdbRequest(store.get(ACTIVE_KEY))),
    async write(entries) {
      // Retain a legacy rollback plan in memory if saving it fails.
      // A new restore writes its durable plan before replacing any data.
      unsaved = Array.isArray(entries) ? entries : undefined;
      await withStore("readwrite", store => {
        if (entries && (!Array.isArray(entries) || entries.length)) store.put(entries, ACTIVE_KEY);
        else store.delete(ACTIVE_KEY);
      });
      unsaved = undefined;
    },
  };
}
