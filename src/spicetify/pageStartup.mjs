import { GOOGLE_FONTS, lyricsFontStylesheet } from "../core/lyricsFontCatalog.mjs";

const startupKey = Symbol.for("ivLyrics.pageStartup");
const getStartup = (host) => host[startupKey] ??= {};

const GOOGLE_FONT_SET = new Set(GOOGLE_FONTS.filter((font) => font !== "Pretendard Variable"));
const FONT_SETTINGS = [
    "font-family",
    "original-font-family",
    "phonetic-font-family",
    "translation-font-family",
    "cultural-annotations-font-family",
    "cultural-annotations-vinyl-font-family",
    "instrumental-break-label-font-family",
    "fullscreen-vinyl-original-font-family",
    "fullscreen-vinyl-phonetic-font-family",
    "fullscreen-vinyl-translation-font-family",
    "fullscreen-video-stage-original-font-family",
    "fullscreen-video-stage-phonetic-font-family",
    "fullscreen-video-stage-translation-font-family",
    "fullscreen-video-stage-cultural-font-family",
];

export function loadPageFonts(document, visualSettings) {
    const fonts = new Set();
    for (const key of FONT_SETTINGS) {
        if (!visualSettings[key]) continue;
        for (const entry of visualSettings[key].split(",")) {
            const font = entry.trim().replace(/['"]/g, "");
            if (font && GOOGLE_FONT_SET.has(font)) fonts.add(font);
        }
    }

    for (const font of fonts) {
        const id = `ivLyrics-google-font-${font.replace(/ /g, "-")}`;
        if (document.getElementById(id)) continue;
        const link = document.createElement("link");
        link.id = id;
        link.rel = "stylesheet";
        link.href = lyricsFontStylesheet(font);
        document.head.appendChild(link);
    }
}

export function installPageUrlCallbacks(host, { getHistory, onAlert, onDiscordLogin, onError }) {
    const startup = getStartup(host);
    const history = getHistory();
    if (!history?.location || typeof history.listen !== "function") return;

    const handlers = { onAlert, onDiscordLogin, onError };
    const previous = startup.urlCallbacks;
    if (previous?.history === history) {
        previous.handlers = handlers;
        return;
    }

    const binding = { history, handlers };
    startup.urlCallbacks = binding;
    const checkUrl = () => {
        if (startup.urlCallbacks !== binding) return;
        const { onAlert, onDiscordLogin, onError } = binding.handlers;
        try {
            const { pathname, search = "" } = history.location;
            const currentSearch = search || "";
            const routeKey = `${pathname}?${currentSearch}`;
            if (startup.lastRouteKey === routeKey) return;
            startup.lastRouteKey = routeKey;
            const params = new URLSearchParams(currentSearch);
            if (!/^\/ivLyrics\/?$/i.test(pathname)) return;

            const alert = params.get("alert");
            if (alert) onAlert(alert);
            if (params.get("action") !== "discord-auth") return;

            const token = params.get("loginToken");
            if (token && startup.lastLoginToken !== token) {
                startup.lastLoginToken = token;
                Promise.resolve(onDiscordLogin(token)).catch(onError);
            }
        } catch (error) {
            onError(error);
        }
    };

    try {
        if (typeof previous?.unlisten === "function") previous.unlisten();
    } catch (error) {
        onError(error);
    }
    try {
        binding.unlisten = history.listen(checkUrl);
    } catch (error) {
        if (startup.urlCallbacks === binding) startup.urlCallbacks = null;
        onError(error);
        return;
    }
    checkUrl();
}

export function observeOverlayStartup(host, { getSender, onWaiting, onAvailable }) {
    const startup = getStartup(host);
    const pending = startup.overlayWait;
    if (pending) {
        pending.getSender = getSender;
        pending.onAvailable = onAvailable;
        pending.check();
        return;
    }
    if (getSender()) return;

    const wait = { getSender, onAvailable };
    const stop = () => {
        if (startup.overlayWait !== wait) return;
        startup.overlayWait = null;
        host.clearInterval(wait.interval);
        host.clearTimeout(wait.timeout);
    };
    wait.check = () => {
        if (startup.overlayWait !== wait || !wait.getSender()) return;
        stop();
        wait.onAvailable();
    };
    startup.overlayWait = wait;
    wait.interval = host.setInterval(wait.check, 100);
    wait.timeout = host.setTimeout(stop, 5000);
    onWaiting();
}

export function schedulePagePrefetchCleanup(host, cleanup) {
    const startup = getStartup(host);
    startup.cleanPrefetch = cleanup;
    startup.prefetchCleanupTimer ??= host.setInterval(() => startup.cleanPrefetch(), 10 * 60 * 1000);
}

export function schedulePageNotice(host, showNotice) {
    const startup = getStartup(host);
    if (!startup.noticeTimer) {
        startup.noticeTimer = host.setTimeout(() => {
            startup.noticeTimer = null;
            showNotice();
        }, 3000);
    }
}

export function schedulePageToastCleanup(host, startCleanup) {
    const startup = getStartup(host);
    if (!startup.toastCleanupTimer) {
        startup.toastCleanupTimer = host.setTimeout(() => {
            startup.toastCleanupTimer = null;
            startCleanup();
        }, 100);
    }
}
