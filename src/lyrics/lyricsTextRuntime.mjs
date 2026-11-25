import { getRuntimeService, publishRuntimeService } from "../spicetify/runtimeServices.mjs";

const routeLyricLanguages = new WeakMap();
const FURIGANA_SERVICE = "FuriganaConverter";

export function setRouteDetectedLyricLanguage(host, language) {
    routeLyricLanguages.set(host, language);
}

export function readRouteDetectedLyricLanguage(host) {
    if (routeLyricLanguages.has(host)) return routeLyricLanguages.get(host);
    return host.Utils?.getDetectedLanguage?.();
}

// The startup utility and the route's detected language have distinct callers.
// Keep renderer segmentation on the existing automatic path when startup
// does not supply a locale. Furigana uses the route's detected value.
export function readLyricRenderingLocale(host) {
    return String(host.Utils?.getDetectedLanguage?.() || "auto");
}

export function registerLyricFuriganaConverter(host, converter) {
    return publishRuntimeService(FURIGANA_SERVICE, converter, host);
}

export function getLyricFuriganaConverter(host) {
    return getRuntimeService(FURIGANA_SERVICE, host);
}

export function isLyricFuriganaReady(host) {
    return getLyricFuriganaConverter(host)?.isAvailable?.() === true;
}
