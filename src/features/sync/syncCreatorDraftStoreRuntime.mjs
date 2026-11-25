import { readSyncDataCodec } from "./syncDataCodecRuntime.mjs";
import { createSyncCreatorDraftStore } from "./createSyncCreatorDraftStore.mjs";

export const editorDraftStore = createSyncCreatorDraftStore({
  getCodec: readSyncDataCodec,
});
