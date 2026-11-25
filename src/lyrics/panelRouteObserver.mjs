import { isIvLyricsRoute } from "../spicetify/lyricsRoute.mjs";

const IVLYRICS_PAGE_ROOT_SELECTOR = '.lyrics-lyricsContainer-LyricsContainer, [data-testid="ivlyrics-page"]';
const IVLYRICS_PAGE_ROOT_CLASS_PATTERN = /(?:^|\s)lyrics-lyricsContainer-LyricsContainer(?:\s|$)/;
export const PANEL_LYRICS_PAGE_CLASS = "ivlyrics-panel-page-active";

const containsIvLyricsPageRoot = (node) => node?.nodeType === 1 && (
    node.classList?.contains('lyrics-lyricsContainer-LyricsContainer')
    || node.getAttribute?.('data-testid') === 'ivlyrics-page'
    || !!node.querySelector?.(IVLYRICS_PAGE_ROOT_SELECTOR)
);

export const isIvLyricsPageMutationRelevant = (mutation) => {
    if (mutation.type === 'childList') {
        for (const node of mutation.addedNodes) {
            if (containsIvLyricsPageRoot(node)) return true;
        }
        for (const node of mutation.removedNodes) {
            if (containsIvLyricsPageRoot(node)) return true;
        }
    } else if (mutation.type === 'attributes') {
        if (mutation.attributeName === 'data-testid') {
            return (mutation.target.getAttribute('data-testid') === 'ivlyrics-page')
                !== (mutation.oldValue === 'ivlyrics-page');
        }
        if (mutation.attributeName === 'class') {
            return mutation.target.classList.contains('lyrics-lyricsContainer-LyricsContainer')
                !== IVLYRICS_PAGE_ROOT_CLASS_PATTERN.test(mutation.oldValue || '');
        }
    }
    return false;
};

export function createPanelRouteObserver({
    host, document, getHistory, Observer, schedule, cancel, removePanelLyrics, scheduleInsertPanelLyrics,
}) {
    let observer = null;
    let observedHistory = null;
    let unlistenHistory = null;
    let pendingRefresh = null;

    const getCurrentPathname = () => {
        try {
            return getHistory()?.location?.pathname || host.location.pathname || "";
        } catch (error) {
            return host.location.pathname || "";
        }
    };

    const isIvLyricsPageActive = () => {
        return isIvLyricsRoute(getCurrentPathname())
            || document.querySelector('[data-testid="ivlyrics-page"]') !== null;
    };

    function updateRouteClass() {
        const isOnIvLyricsPage = isIvLyricsPageActive();
        document.body.classList.toggle(PANEL_LYRICS_PAGE_CLASS, isOnIvLyricsPage);
        return isOnIvLyricsPage;
    }

    function refreshPageStateAndPanel() {
        bindHistory();
        if (updateRouteClass()) {
            removePanelLyrics();
        } else {
            scheduleInsertPanelLyrics(150);
        }
    }

    function bindHistory() {
        const history = getHistory();
        const nextHistory = typeof history?.listen === "function" ? history : null;
        if (observedHistory === nextHistory) return;
        releaseHistory();
        if (nextHistory) {
            observedHistory = nextHistory;
            const release = nextHistory.listen(() => {
                if (observer && observedHistory === nextHistory && nextHistory === getHistory()) {
                    refreshPageStateAndPanel();
                }
            });
            if (typeof release === "function") unlistenHistory = release;
        }
    }

    function releaseHistory() {
        const release = unlistenHistory;
        observedHistory = unlistenHistory = null;
        try {
            release?.();
        } catch {
            // The disposed listener also checks the registered history identity.
        }
    }

    function setupPageDetection() {
        if (observer) return;
        const next = new Observer((mutations) => {
            if (observer !== next || pendingRefresh != null || !mutations.some(isIvLyricsPageMutationRelevant)) return;
            pendingRefresh = schedule(() => {
                if (observer !== next) return;
                pendingRefresh = null;
                refreshPageStateAndPanel();
            }, 50);
        });
        observer = next;
        bindHistory();
        updateRouteClass();

        const mainView = document.querySelector(".Root__main-view") || document.body;
        next.observe(mainView, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeOldValue: true,
            attributeFilter: ["data-testid", "class"],
        });
    }

    function teardownPageDetection() {
        if (pendingRefresh != null) cancel(pendingRefresh);
        pendingRefresh = null;
        observer?.disconnect();
        observer = null;
        releaseHistory();
        document.body?.classList.remove(PANEL_LYRICS_PAGE_CLASS);
    }

    return { isIvLyricsPageActive, setupPageDetection, teardownPageDetection };
}
