import { publishRuntimeService as publishDraftStoreService } from "#ivlyrics/spicetify/runtimeServices.mjs";
import { editorDraftStore as draftStorePublicApi } from "#ivlyrics/features/sync/syncCreatorDraftStoreRuntime.mjs";

export function installPageSyncCreatorDraftStore(host) {
  publishDraftStoreService("SyncCreatorDraftStore", draftStorePublicApi, host);
}
