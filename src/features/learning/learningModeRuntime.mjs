import { getRuntimeService, publishRuntimeService } from "../../spicetify/runtimeServices.mjs";

const serviceName = "IvLyricsLearningMode";
export const readLearningMode = (host) => getRuntimeService(serviceName, host);
export const publishLearningMode = (host, mode) => publishRuntimeService(serviceName, mode, host);
