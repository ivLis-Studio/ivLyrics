import { claimBrowserFullscreen } from "./browserFullscreenOwnership.mjs";
import { getResearchFontSize } from "../../app/researchReaderSettings.mjs";

const PORTAL_ID = "lyrics-fullscreen-container";
const OPEN_DIALOG_SELECTOR = '.ivlyrics-fluent-overlay:not([aria-hidden="true"]), .lyrics-sync-adjust-floating [role="dialog"], .ivl-tb-fly, .ivlyrics-settings-overlay.is-open, .community-video-overlay, .ivlyrics-cache-edit-overlay';
const activeSessions = new WeakMap();

export function resolveLyricsFullscreenLayout({ isEnabled, options, visual, currentPageLayout }) {
    const requestedPresentation = isEnabled
        && (options?.presentation === "page" || options?.presentation === "screen")
        ? options.presentation
        : null;
    const usePageFullscreenUi = isEnabled
        ? (requestedPresentation ? requestedPresentation === "page" : visual["fullscreen-page-ui-only"] === true)
        : currentPageLayout === true;
    const useBrowserFullscreen = requestedPresentation === "screen"
        || (!usePageFullscreenUi && visual["fullscreen-browser-fullscreen"] === true);
    return { requestedPresentation, usePageFullscreenUi, useBrowserFullscreen };
}

export function createLyricsFullscreenController({
    document, readVisual, readState, writeLayout, setState,
    readRememberedPresentation, rememberPresentation, normalizePresentation,
    onClosed,
    scheduleTimer, cancelTimer, onBrowserFullscreenError,
}) {
    let unbind = null;
    let closing = null;
    let active = null;
    let disposed = false;

    function removeClosingPortal() {
        if (!closing) return;
        const { portal, timer } = closing;
        closing = null;
        cancelTimer(timer);
        portal?.remove();
    }

    function detachKeys() {
        unbind?.();
        unbind = null;
    }

    function setPresentation(nextPresentation) {
        if (disposed) return normalizePresentation(nextPresentation);
        const normalized = rememberPresentation(nextPresentation);
        if (active) active.presentation = normalized;
        setState({ fullscreenPresentation: normalized });
        return normalized;
    }

    function exitPresentation() {
        if (!active || normalizePresentation(active.presentation) === "standard") return false;
        setPresentation("standard");
        return true;
    }

    function attachKeys() {
        detachKeys();
        const hasOpenDialog = () => Boolean(document.querySelector(OPEN_DIALOG_SELECTOR));
        const onEscape = (event) => {
            const fullscreenElement = document.fullscreenElement;
            if (event.key !== "Escape" || !active || event.defaultPrevented
                || event.isComposing || (fullscreenElement && fullscreenElement !== document.documentElement)
                || hasOpenDialog()) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            if (!event.repeat && !exitPresentation()) close();
        };
        const capture = { capture: true };
        document.addEventListener("keydown", onEscape, capture);
        unbind = () => document.removeEventListener("keydown", onEscape, capture);
    }

    function open(options) {
        const state = readState();
        const visual = readVisual();
        const layout = resolveLyricsFullscreenLayout({ isEnabled: true, options, visual });
        const presentation = readRememberedPresentation();

        // Release the old UI before opening the next one, while keeping native
        // fullscreen available for the new page to adopt in the same gesture.
        const releasePreviousBrowser = activeSessions.get(document)?.detachForReplacement();
        try {
            removeClosingPortal();
            document.getElementById(PORTAL_ID)?.remove();
            let portal = null;
            if (!layout.usePageFullscreenUi) {
                portal = document.createElement("div");
                portal.id = PORTAL_ID;
                portal.style.setProperty("--fullscreen-tmi-font-size", getResearchFontSize(visual) / 100);
                document.body.append(portal);
            }

            const session = { portal, presentation, releaseBrowserFullscreen: null, detachForReplacement };
            active = session;
            activeSessions.set(document, session);
            writeLayout({ ...layout, portal });
            attachKeys();
            setState({
                isFullscreen: true,
                fullscreenPresentation: presentation,
                fullscreenLyricsHidden: state.fullscreenLyricsHidden,
                justEnteredFullscreen: true,
                isFloatingMenuOpen: state.isFloatingMenuOpen,
                isFloatingMenuClosing: false,
            });
            if (active === session && layout.useBrowserFullscreen) {
                session.releaseBrowserFullscreen = claimBrowserFullscreen(document, {
                    onExit: () => { if (active === session) close(); },
                    onError: onBrowserFullscreenError,
                });
            }
        } finally {
            releasePreviousBrowser?.();
        }
    }

    function detachActive() {
        const session = active;
        active = null;
        if (activeSessions.get(document) === session) activeSessions.delete(document);
        detachKeys();
        writeLayout({ requestedPresentation: null, usePageFullscreenUi: false, useBrowserFullscreen: false, portal: null });
        return session;
    }

    function detachForReplacement() {
        const session = detachActive();
        session.portal?.remove();
        setClosedState(session.presentation);
        return session.releaseBrowserFullscreen;
    }

    function setClosedState(fullscreenPresentation) {
        setState({
            isFullscreen: false,
            fullscreenPresentation,
            fullscreenLyricsHidden: false,
            justEnteredFullscreen: false,
            isFloatingMenuOpen: false,
            isFloatingMenuClosing: false,
        });
    }

    function close({ immediate = false } = {}) {
        if (!active) return false;
        const { portal, presentation, releaseBrowserFullscreen } = detachActive();
        releaseBrowserFullscreen?.();
        if (immediate) portal?.remove();
        else if (portal?.parentNode) {
            // React can finish its portal commit during a normal close.
            const removal = { portal, timer: null };
            closing = removal;
            removal.timer = scheduleTimer(() => {
                if (closing !== removal) return;
                closing = null;
                portal.remove();
            }, 100);
        }
        setClosedState(rememberPresentation(presentation));
        onClosed();
        return true;
    }

    function toggle(options = null) {
        if (disposed) return;
        if (active) close();
        else open(options);
    }

    function dispose() {
        if (disposed) return;
        disposed = true;
        const session = detachActive();
        session?.releaseBrowserFullscreen?.();
        session?.portal?.remove();
        removeClosingPortal();
    }

    return { toggle, close, setPresentation, exitPresentation, dispose };
}

