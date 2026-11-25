import { getRuntimeService, publishRuntimeService, releaseRuntimeService } from "./runtimeServices.mjs";

const PAGE_SERVICE = "lyricContainer";
const PAGE_BODY_CLASS = "ivlyrics-page-active";
export const LYRICS_PAGE_READY_EVENT = "ivLyrics:page-ready";

export function getMountedLyricsPage(host) {
    return getRuntimeService(PAGE_SERVICE, host);
}

export function activateLyricsPage(host, page) {
    const previous = getMountedLyricsPage(host);
    if (previous !== page) previous?.componentWillUnmount?.();
    publishRuntimeService(PAGE_SERVICE, page, host);
    host.document.body.classList.add(PAGE_BODY_CLASS);
}

export function releaseLyricsPage(host, page) {
    if (!releaseRuntimeService(PAGE_SERVICE, page, host)) return false;
    host.document.body.classList.remove(PAGE_BODY_CLASS);
    return true;
}
