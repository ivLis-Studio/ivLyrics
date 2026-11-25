import { getMountedLyricsPage } from "./lyricsPageEffects.mjs";
import { IVLYRICS_ROUTE, isIvLyricsRoute } from "./lyricsRoute.mjs";
import { ROUTE_RESTORE_KEY, queueAppRouteRestore } from "./routeReload.mjs";
import { restorePendingRoute } from "./restorePendingRoute.mjs";

const NATIVE_RELOAD_ROUTE_KEY = "ivLyrics:native-reload-route";
const SPOTIFY_LIBRARY_TRACKS_ROUTE = "/collection/tracks";
const routeRestoreStartupKey = Symbol.for("ivLyrics.routeRestoreStartup");

function trackNativeReload(host, getHistory) {
    try {
        const storage = host.sessionStorage;
        const previousRoute = storage?.getItem(NATIVE_RELOAD_ROUTE_KEY);
        storage?.removeItem(NATIVE_RELOAD_ROUTE_KEY);
        // Spotify resets its in-memory History to Home on a document reload.
        const navigation = host.performance?.getEntriesByType?.("navigation")?.[0];
        if (previousRoute === IVLYRICS_ROUTE && navigation?.type === "reload"
            && !host.localStorage.getItem(ROUTE_RESTORE_KEY)) {
            queueAppRouteRestore(host.localStorage);
        }
    } catch {
        // An unavailable browser session store cannot block queued restores.
    }

    host.addEventListener?.("pagehide", () => {
        try {
            const storage = host.sessionStorage;
            if (isIvLyricsRoute(getHistory()?.location?.pathname)) storage?.setItem(NATIVE_RELOAD_ROUTE_KEY, IVLYRICS_ROUTE);
            else storage?.removeItem(NATIVE_RELOAD_ROUTE_KEY);
        } catch {
            // Leaving the document does not require a successful save.
        }
    });
}

export function startRouteRestore(host) {
    if (host[routeRestoreStartupKey]) return;
    host[routeRestoreStartupKey] = true;
    const getHistory = () => host.Spicetify?.Platform?.History;
    trackNativeReload(host, getHistory);
    let observedEvent;
    let webpackReady = false;
    const isRouterReady = () => {
        const event = host.Spicetify?.Events?.webpackLoaded;
        if (typeof event?.on !== "function") return null;
        if (observedEvent !== event) {
            observedEvent = event;
            webpackReady = false;
            try {
                event.on(() => {
                    if (observedEvent === event) webpackReady = true;
                });
            } catch {
                // Keep the timed History fallback when Spotify's signal is unavailable.
                webpackReady = null;
            }
        }
        return webpackReady;
    };

    restorePendingRoute({
        getStorage: () => host.localStorage,
        getHistory,
        isDocumentReady: () => host.document.readyState === "complete",
        isRouterReady,
        routerWarmupPath: SPOTIFY_LIBRARY_TRACKS_ROUTE,
        isAppReady: () => getMountedLyricsPage(host)?._isComponentMounted === true,
        schedule: (callback, delay) => host.setTimeout(callback, delay),
        reload: () => host.location.reload(),
    });
}
