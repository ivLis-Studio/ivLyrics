import { IVLYRICS_ROUTE, isIvLyricsRoute } from "./lyricsRoute.mjs";

export const ROUTE_RESTORE_KEY = "ivLyrics:restore-route-after-reload";
export const SETTINGS_RETURN_KEY = "ivLyrics:return-to-settings";
export const ROUTE_RESTORE_TTL_MS = 15000;
const SAFE_RELOAD_DELAY_MS = 150;
// The startup extension and route bundle each have their own module instance.
const documentReloadKey = Symbol.for("ivLyrics.pendingDocumentReload");

export function hasRequestedAppRouteReload(host) {
    return Boolean(host[documentReloadKey]);
}

export function queueAppRouteRestore(storage) {
    storage.setItem(ROUTE_RESTORE_KEY, JSON.stringify({
        path: IVLYRICS_ROUTE,
        expiresAt: Date.now() + ROUTE_RESTORE_TTL_MS,
    }));
}

export function navigateToSafeReloadRoute(history) {
    if (typeof history?.replace === "function") history.replace("/");
    else if (typeof history?.push === "function") history.push("/");
    else return false;
    return true;
}

export function queueSettingsReturn(storage, { initialTab = "general", initialSettingKey } = {}) {
    const options = { initialTab };
    if (initialSettingKey) options.initialSettingKey = initialSettingKey;
    storage.setItem(SETTINGS_RETURN_KEY, JSON.stringify(options));
}

export function takeSettingsReturn(storage) {
    const raw = storage.getItem(SETTINGS_RETURN_KEY);
    if (!raw) return null;
    storage.removeItem(SETTINGS_RETURN_KEY);
    try {
        const options = JSON.parse(raw);
        if (options && typeof options === "object" && !Array.isArray(options)) return options;
    } catch {
        // Older versions used a flag, and a damaged value can still reopen General.
    }
    return { initialTab: "general" };
}

export function requestAppRouteReload({
    host, getStorage = () => host.localStorage, getHistory = () => host.Spicetify?.Platform?.History,
    schedule = (callback, delay) => host.setTimeout(callback, delay), cancel = timer => host.clearTimeout?.(timer),
    reload = () => host.location.reload(), now = Date.now, delay = SAFE_RELOAD_DELAY_MS,
    restoreLyrics = true, settingsReturn, reportError = console.error,
}) {
    let request = host[documentReloadKey];
    if (!request || request.finished) {
        request = { deadline: Infinity, timer: null, restoreLyrics: false, settingsReturn: null };
        host[documentReloadKey] = request;
    }
    const prepareRoute = restoreLyrics && !request.restoreLyrics;
    request.restoreLyrics ||= restoreLyrics;
    if (settingsReturn) request.settingsReturn = settingsReturn;

    const requestedDelay = Number(delay);
    const wait = Number.isFinite(requestedDelay) ? Math.max(SAFE_RELOAD_DELAY_MS, requestedDelay) : SAFE_RELOAD_DELAY_MS;
    const deadline = now() + wait;
    const scheduleEarlier = deadline < request.deadline;
    if (scheduleEarlier) {
        request.deadline = deadline;
        if (request.timer !== null) cancel(request.timer);
        request.timer = null;
    }
    const ownsTimer = () => host[documentReloadKey] === request && !request.finished && request.deadline === deadline;

    function returnToSpotify() {
        try {
            navigateToSafeReloadRoute(getHistory());
        } catch (error) {
            reportError("[ivLyrics] Failed to navigate to a safe reload route:", error);
        }
    }

    function finish() {
        // Keep ownership visible to startup recovery until this document exits.
        request.finished = true;
        // The return markers belong to the next document, even if the old
        // document's lyrics route mounts again during the delay.
        if (request.restoreLyrics) {
            try {
                queueAppRouteRestore(getStorage());
            } catch (error) {
                reportError("[ivLyrics] Failed to queue ivLyrics route restore:", error);
            }
        }
        if (request.settingsReturn) {
            try {
                queueSettingsReturn(getStorage(), request.settingsReturn);
            } catch (error) {
                reportError("[ivLyrics] Failed to queue settings reopen:", error);
            }
        }
        reload();
    }

    function leaveLyricsRoute(stalledAt) {
        try {
            const history = getHistory();
            const { pathname, key } = history?.location || {};
            if (!isIvLyricsRoute(pathname)) return null;
            // A background reload can be requested before the user opens lyrics.
            request.restoreLyrics = true;
            if (stalledAt?.pathname === pathname && stalledAt.key === key) return null;
            if (!navigateToSafeReloadRoute(history)) return null;
            return isIvLyricsRoute(history.location?.pathname) ? { pathname, key } : {};
        } catch (error) {
            reportError("[ivLyrics] Failed to navigate to a safe reload route:", error);
            return null;
        }
    }

    function settle(stalledAt) {
        if (!ownsTimer()) return;
        const navigation = leaveLyricsRoute(stalledAt);
        if (!ownsTimer()) return;
        if (navigation) {
            request.timer = schedule(() => settle(navigation), SAFE_RELOAD_DELAY_MS);
        } else {
            finish();
        }
    }

    if (prepareRoute) returnToSpotify();
    if (!scheduleEarlier || !ownsTimer()) return;
    request.timer = schedule(() => settle(), wait);
}
