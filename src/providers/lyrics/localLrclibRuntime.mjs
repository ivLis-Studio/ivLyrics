import { getRuntimeService, publishRuntimeService } from "../../spicetify/runtimeServices.mjs";

const SERVICE_NAME = "IvLyricsLocalLrclib";

export const readLocalLrclib = (host) => getRuntimeService(SERVICE_NAME, host);
export const publishLocalLrclib = (host, database) => publishRuntimeService(SERVICE_NAME, database, host);
