import { awaitIdbRequest, openIdbDatabase, runIdbTransaction } from "./indexedDbTransaction.mjs";

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
      return await runIdbTransaction(db, STORE_NAME, mode, tx => operation(tx.objectStore(STORE_NAME)));
    } finally {
      db.close();
    }
  }

  return {
    read: async () => unsaved ?? withStore("readonly", store => awaitIdbRequest(store.get(ACTIVE_KEY))),
    async write(entries) {
      // Quota errors can prevent journaling. Retain the undo while this
      // manager is active so it still refuses to back up a partial restore.
      unsaved = entries;
      await withStore("readwrite", store => {
        if (entries.length) store.put(entries, ACTIVE_KEY);
        else store.delete(ACTIVE_KEY);
      });
      unsaved = undefined;
    },
  };
}
