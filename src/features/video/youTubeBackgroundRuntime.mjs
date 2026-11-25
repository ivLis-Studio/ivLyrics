import { getRuntimeService, publishRuntimeService } from "../../spicetify/runtimeServices.mjs";

const SERVICE = "VideoBackgroundDepend";

export function publishYouTubeBackgroundService(host, service) {
    return publishRuntimeService(SERVICE, service, host);
}

export function isYouTubeBackgroundAdPlaying(host, player) {
    return getRuntimeService(SERVICE, host)?.isAdPlayback?.(player);
}
