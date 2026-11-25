import { IVLYRICS_ROUTE, isIvLyricsRoute } from "./lyricsRoute.mjs";

export const ROUTE_RESTORE_KEY = "ivLyrics:restore-route-after-reload";
export const SETTINGS_RETURN_KEY = "ivLyrics:return-to-settings";
export const ROUTE_RESTORE_TTL_MS = 15000;
const SAFE_RELOAD_DELAY_MS = 150;
// The startup extension and route bundle each have their own module instance.
const pendingReloadKey = Symbol.for("ivLyrics.pendingDocumentReload");

export function queueAppRouteRestore(storage) {
    storage.setItem(ROUTE_RESTORE_KEY, JSON.stringify({
        path: IVLYRICS_ROUTE,
        expiresAt: Date.now() + ROUTE_RESTORE_TTL_MS,
    }));
}

export function navigateToSafeReloadRoute(history) {
    if (history?.replace) history.replace("/");
    else history?.push?.("/");
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
    const request = host[pendingReloadKey] ??= { deadline: Infinity, timer: null, restoreLyrics: false, settingsReturn: null };
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

    function navigateSafely(onlyFromLyrics = false) {
        try {
            const history = getHistory();
            if (onlyFromLyrics && !isIvLyricsRoute(history?.location?.pathname)) return false;
            navigateToSafeReloadRoute(history);
            return true;
        } catch (error) {
            reportError("[ivLyrics] Failed to navigate to a safe reload route:", error);
            return false;
        }
    }

    function finish() {
        if (host[pendingReloadKey] !== request) return;
        delete host[pendingReloadKey];
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

    if (prepareRoute) navigateSafely();
    if (!scheduleEarlier || request.deadline !== deadline) return;
    request.timer = schedule(() => {
        if (host[pendingReloadKey] !== request || request.deadline !== deadline) return;
        if (request.restoreLyrics && navigateSafely(true)) schedule(finish, SAFE_RELOAD_DELAY_MS);
        else finish();
    }, wait);
}
