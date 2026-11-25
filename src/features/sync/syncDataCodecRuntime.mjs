import { getRuntimeService, publishRuntimeService } from "../../spicetify/runtimeServices.mjs";

const SERVICE_NAME = "SyncDataCodec";

export const readSyncDataCodec = (host) => getRuntimeService(SERVICE_NAME, host);
export const publishSyncDataCodec = (host, codec) => publishRuntimeService(SERVICE_NAME, codec, host);
