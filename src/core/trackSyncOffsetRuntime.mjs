import { getRuntimeService, publishRuntimeService } from "../spicetify/runtimeServices.mjs";
import { createRuntimeDebugLogger } from "../spicetify/runtimeDebug.mjs";
import { createTrackSyncOffsetStore, migrateTrackSyncOffsets } from "./trackSyncOffsetStore.mjs";
import { readSettingsDatabaseRecovery } from "./settingsRuntime.mjs";

const SERVICE_NAME = "TrackSyncDB";

export function getTrackSyncOffsetStore(host, options = {}) {
    const installed = getRuntimeService(SERVICE_NAME, host);
    if (installed) return installed;

    const {
        getIndexedDB = () => host.indexedDB,
        readLocalStorage = () => host.localStorage,
        debug = createRuntimeDebugLogger(host),
        logger = console,
    } = options;
    const store = createTrackSyncOffsetStore({ getIndexedDB, debug, logger });
    const localStorage = {
        getItem: (key) => readLocalStorage()?.getItem(key),
        removeItem: (key) => readLocalStorage()?.removeItem(key),
    };
    const migration = Promise.resolve(readSettingsDatabaseRecovery(host))
        .then(() => migrateTrackSyncOffsets({ localStorage, offsetStore: store, debug, logger }));
    const afterMigration = (operation) => async (...args) => {
        await migration;
        return operation(...args);
    };

    return publishRuntimeService(SERVICE_NAME, {
        getOffset: afterMigration(store.getOffset),
        setOffset: afterMigration(store.setOffset),
        clearOffset: afterMigration(store.clearOffset),
        getAllOffsets: afterMigration(store.getAllOffsets),
        importOffsets: afterMigration(store.importOffsets),
    }, host);
}
