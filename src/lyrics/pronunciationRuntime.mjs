import { getRuntimeService, publishRuntimeService } from "../spicetify/runtimeServices.mjs";

const slotsService = "ivLyricsPronunciationSlots";
const firstService = "ivLyricsPronunciationFirst";
const notationService = "ivLyricsPronunciationNotation";

export const PRONUNCIATION_UPDATED_EVENT = "ivLyrics:pronunciation-first-updated";

export const readPronunciationSlots = (host) => getRuntimeService(slotsService, host);
export const readPronunciationFirst = (host) => getRuntimeService(firstService, host);
export const readPronunciationNotation = (host) => getRuntimeService(notationService, host);

export const publishPronunciationSlots = (host, service) => publishRuntimeService(slotsService, service, host);
export const publishPronunciationFirst = (host, service) => publishRuntimeService(firstService, service, host);
export const publishPronunciationNotation = (host, service) => publishRuntimeService(notationService, service, host);
