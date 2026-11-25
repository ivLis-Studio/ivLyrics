import { IVLYRICS_ROUTE, isIvLyricsRoute } from "./lyricsRoute.mjs";
import { navigateToSafeReloadRoute, ROUTE_RESTORE_KEY, ROUTE_RESTORE_TTL_MS, SETTINGS_RETURN_KEY } from "./routeReload.mjs";

const ROUTE_MOUNT_TIMEOUT_MS = 5000;
const ROUTER_SETTLE_MS = 1000;
const ROUTE_POLL_MS = 150;
const ROUTER_WARMUP_TIMEOUT_MS = 3000;

export function restorePendingRoute({
    getStorage,
    getHistory,
    isDocumentReady,
    isRouterReady = () => null,
    routerWarmupPath,
    isAppReady,
    schedule,
    reload,
    now = Date.now,
    reportError = console.error,
}) {
    const fallbackExpiresAt = now() + ROUTE_RESTORE_TTL_MS;
    let attempt = null;

    function clearRestore(storage, keepSettings = false) {
        try {
            storage.removeItem(ROUTE_RESTORE_KEY);
            if (!keepSettings) storage.removeItem(SETTINGS_RETURN_KEY);
        } catch (error) {
            reportError("[ivLyrics] Failed to clear route restore:", error);
        }
    }

    function queueRetry(storage, expiresAt, delay = ROUTE_POLL_MS) {
        const remaining = expiresAt - now();
        if (remaining <= 0) clearRestore(storage);
        else schedule(tryRestore, Math.min(remaining, delay));
    }

    function recoverOnSafeRoute(storage, history, payload, expiresAt) {
        if (payload.recoveryAttempted || expiresAt - now() <= ROUTE_POLL_MS) {
            clearRestore(storage);
            return;
        }
        const next = JSON.stringify({ path: IVLYRICS_ROUTE, expiresAt, recoveryAttempted: true });
        try {
            storage.setItem(ROUTE_RESTORE_KEY, next);
            navigateToSafeReloadRoute(history);
        } catch (error) {
            reportError("[ivLyrics] Failed to prepare route recovery:", error);
            clearRestore(storage);
            return;
        }
        schedule(() => {
            try {
                if (storage.getItem(ROUTE_RESTORE_KEY) !== next) return;
                if (getHistory()?.location?.pathname === "/" && now() < expiresAt) reload();
                else clearRestore(storage);
            } catch (error) {
                reportError("[ivLyrics] Failed to reload the safe route:", error);
                clearRestore(storage);
            }
        }, ROUTE_POLL_MS);
    }

    function requestLyricsRoute(history, from, method = "push") {
        attempt.request = { from, at: now() };
        try {
            history[method](IVLYRICS_ROUTE);
            if (isIvLyricsRoute(history.location?.pathname)) attempt.enteredAt = now();
        } catch (error) {
            reportError("[ivLyrics] Failed to restore the lyrics route:", error);
        }
    }

    function startRouterWarmup(history, from) {
        const warmup = { from, startedAt: now(), arrived: from === routerWarmupPath };
        if (!warmup.arrived) {
            try {
                history.replace(routerWarmupPath);
                warmup.arrived = history.location?.pathname === routerWarmupPath;
            } catch (error) {
                reportError("[ivLyrics] Failed to open a native route before restoring lyrics:", error);
                return false;
            }
        }
        attempt.warmup = warmup;
        return true;
    }

    function finishRouterWarmup(history, warmup) {
        attempt.warmup = null;
        if (isIvLyricsRoute(warmup.from)) {
            requestLyricsRoute(history, routerWarmupPath, "replace");
            return;
        }
        try {
            if (history.location?.pathname !== warmup.from) history.replace(warmup.from);
        } catch (error) {
            reportError("[ivLyrics] Failed to restore Spotify's previous history entry:", error);
        }
        requestLyricsRoute(history, history.location?.pathname || warmup.from);
    }

    function tryRestore() {
        let raw, storage, payload;
        try {
            storage = getStorage();
            raw = storage.getItem(ROUTE_RESTORE_KEY);
        } catch (error) {
            reportError("[ivLyrics] Failed to read route restore:", error);
            return;
        }
        if (!raw) return;
        try {
            payload = JSON.parse(raw);
        } catch {
            clearRestore(storage);
            return;
        }
        const configuredExpiry = Number(payload?.expiresAt);
        const expiresAt = Number.isFinite(configuredExpiry) ? configuredExpiry : fallbackExpiresAt;
        if (payload?.path !== IVLYRICS_ROUTE || expiresAt <= now()) {
            clearRestore(storage);
            return;
        }
        if (attempt?.raw !== raw) attempt = { raw, routerSince: null, enteredAt: null, request: null };

        const history = getHistory();
        const pathname = history?.location?.pathname;
        if (isIvLyricsRoute(pathname) && isAppReady()) {
            clearRestore(storage, true);
            return;
        }
        const warmup = attempt.warmup;
        if (warmup && pathname) {
            if (pathname === routerWarmupPath) warmup.arrived = true;
            else if (warmup.arrived || pathname !== warmup.from) {
                clearRestore(storage);
                return;
            }
        }
        if (pathname && !isIvLyricsRoute(pathname)
            && (attempt.enteredAt != null || (attempt.request && pathname !== attempt.request.from))) {
            clearRestore(storage);
            return;
        }
        const routerReady = isRouterReady();
        if (typeof history?.push !== "function" || !pathname || !isDocumentReady()) {
            attempt.routerSince = null;
            queueRetry(storage, expiresAt);
            return;
        }
        if (warmup) {
            if ((routerReady === true && warmup.arrived) || now() - warmup.startedAt >= ROUTER_WARMUP_TIMEOUT_MS) {
                finishRouterWarmup(history, warmup);
            }
            queueRetry(storage, expiresAt);
            return;
        }
        if (routerReady !== true) {
            // Older hosts do not expose a reliable readiness event.
            attempt.routerSince ??= now();
            const settleRemaining = ROUTER_SETTLE_MS - (now() - attempt.routerSince);
            if (settleRemaining > 0) {
                queueRetry(storage, expiresAt, routerReady === false ? Math.min(ROUTE_POLL_MS, settleRemaining) : settleRemaining);
                return;
            }
            // Spicetify's lazy custom-app route needs webpackLoaded. On a cold
            // reload a native page can load the chunks still pending on Home.
            if (routerReady === false && routerWarmupPath && typeof history.replace === "function"
                && !attempt.request && attempt.enteredAt === null && startRouterWarmup(history, pathname)) {
                queueRetry(storage, expiresAt);
                return;
            }
        }

        if (isIvLyricsRoute(pathname)) {
            // The History pathname changes before Spotify's route is mounted.
            attempt.enteredAt ??= now();
        } else if (!attempt.request) {
            requestLyricsRoute(history, pathname);
        }

        const since = attempt.enteredAt ?? attempt.request?.at;
        if (since != null && now() - since >= ROUTE_MOUNT_TIMEOUT_MS) {
            recoverOnSafeRoute(storage, history, payload, expiresAt);
            return;
        }
        queueRetry(storage, expiresAt);
    }

    tryRestore();
}
