import { IVLYRICS_ROUTE, isIvLyricsRoute } from "../../spicetify/lyricsRoute.mjs";

export function createFullscreenNavigation({ getHistory, getPage, setPreviousPath }) {
    let pending = false;
    let previousPath = null;

    const rememberPreviousPath = path => {
        previousPath = path;
        setPreviousPath(path);
    };

    function toggleFromPlaybarOrShortcut() {
        const history = getHistory();
        const { pathname, search = "", hash = "" } = history?.location ?? {};
        if (!pathname) return false;
        const page = getPage();
        if (isIvLyricsRoute(pathname) && typeof page?.toggleFullscreen === "function") {
            pending = false;
            page.toggleFullscreen();
            return true;
        }
        if (pending) {
            pending = false;
            rememberPreviousPath(null);
            return true;
        }
        pending = true;
        if (!isIvLyricsRoute(pathname)) {
            rememberPreviousPath(pathname + search + hash);
            history.push(IVLYRICS_ROUTE);
        }
        return true;
    }

    function onPageReady(page) {
        if (!pending || page !== getPage() || typeof page?.toggleFullscreen !== "function"
            || !isIvLyricsRoute(getHistory()?.location?.pathname)) return;
        pending = false;
        page.toggleFullscreen();
    }

    function onRouteChange(pathname) {
        if (isIvLyricsRoute(pathname)) return;
        pending = false;
        if (previousPath !== null) rememberPreviousPath(null);
    }

    function goBackToPreviousPage() {
        if (previousPath === null) return;
        const destination = previousPath;
        rememberPreviousPath(null);
        getHistory()?.push(destination);
    }

    return { toggleFromPlaybarOrShortcut, onPageReady, onRouteChange, goBackToPreviousPage };
}
