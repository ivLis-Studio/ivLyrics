import { getRuntimeService, publishRuntimeService } from "../spicetify/runtimeServices.mjs";

const PERSISTENCE_SERVICE = "ivLyricsStoragePersistence";
const STORAGE_SERVICE = "StorageManager";

export const readSettingsPersistence = (host) => getRuntimeService(PERSISTENCE_SERVICE, host);
export const readSettingsDatabaseRecovery = (host) => readSettingsPersistence(host)?.databasesReady;
export const publishSettingsPersistence = (host, service) => publishRuntimeService(PERSISTENCE_SERVICE, service, host);
export const readSettingsStorage = (host) => getRuntimeService(STORAGE_SERVICE, host);
export const publishSettingsStorage = (host, service) => publishRuntimeService(STORAGE_SERVICE, service, host);
