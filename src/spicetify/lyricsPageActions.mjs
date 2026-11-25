import { getMountedLyricsPage } from "./lyricsPageEffects.mjs";
import { getRuntimeService } from "./runtimeServices.mjs";

export function refreshLyricsPage(host) {
    const page = getMountedLyricsPage(host);
    if (page?._isComponentMounted === false) return;
    const refresh = page?.queueLyricsViewRefresh ?? page?.refreshLyricsView;
    refresh?.call(page);
}

export function requestLyricsReload(host, ...args) {
    const page = getMountedLyricsPage(host);
    if (page?._isComponentMounted === false) return;
    if (typeof page?.reloadLyrics === "function") return page.reloadLyrics(...args);

    // A route loaded by an older startup bundle may only expose this alias.
    const reload = getRuntimeService("reloadLyrics", host);
    if (typeof reload === "function") return reload.apply(host, args);
}
