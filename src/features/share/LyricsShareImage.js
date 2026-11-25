import { publishRuntimeService as publishShareImageRuntimeService } from "#ivlyrics/spicetify/runtimeServices.mjs";
import { lyricsShareImage as shareImagePublicApi } from "#ivlyrics/features/share/shareImageApi.mjs";

export function installPageShareImage(host) {
  publishShareImageRuntimeService("LyricsShareImage", shareImagePublicApi, host);
}
