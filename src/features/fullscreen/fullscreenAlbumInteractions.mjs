import { normalizeFullscreenFocusPresentation, normalizeFullscreenPresentation } from "./fullscreenPresentation.mjs";

export function useFullscreenAlbumInteractions({
    react, host, document, readVisualSettings, getReactDOM, openTmiMode, onPresentationModeChange,
    normalizedPresentationMode, presentationModeActive, tvModeEnabled, vinylAnimationsEnabled, albumClickOpensMode,
}) {
    const { useRef, useState, useEffect, useCallback } = react;
    const [lpModeClosing, setLpModeClosing] = useState(false);
    const albumPressTimerRef = useRef(null);
    const albumPressStartRef = useRef(null);
    const suppressAlbumClickRef = useRef(false);
    const suppressAlbumClickTimerRef = useRef(null);
    const lpModeExitTimerRef = useRef(null);
    const lpViewTransitionRef = useRef(null);

    const runLpSharedTransition = useCallback((direction, updateMode) => {
        const reducedMotion = readVisualSettings()?.["reduce-motion"] === true
            || host.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
        const animationsEnabled = readVisualSettings()?.["fullscreen-vinyl-animations"] !== false;
        if (!animationsEnabled || reducedMotion || typeof document?.startViewTransition !== "function") return false;
        const root = document.documentElement;
        const directionClass = "is-lp-view-" + direction;
        // A second choice should win immediately, not be swallowed while
        // the previous album snapshot is still moving.
        lpViewTransitionRef.current?.skipTransition?.();
        lpViewTransitionRef.current = null;
        root.classList.remove("is-lp-view-enter", "is-lp-view-exit", "is-lp-view-switch");
        root.classList.add("is-lp-view-transition", directionClass);
        let committed = false;
        let transition = null;
        const cleanup = () => {
            if (lpViewTransitionRef.current !== transition) return;
            lpViewTransitionRef.current = null;
            root.classList.remove("is-lp-view-transition", directionClass);
        };

        try {
            transition = document.startViewTransition(() => {
                const reactDom = getReactDOM();
                if (typeof reactDom?.flushSync === "function") {
                    reactDom.flushSync(updateMode);
                    committed = true;
                    return undefined;
                }

                updateMode();
                committed = true;
                return new Promise((resolve) => host.requestAnimationFrame(resolve));
            });
            lpViewTransitionRef.current = transition;
            // Skipping/unmounting a transition rejects ready even when
            // its update and finished promises complete successfully.
            Promise.resolve(transition.ready).catch(() => undefined);
            Promise.resolve(transition.finished).catch(() => undefined).finally(cleanup);
            return true;
        } catch (_) {
            cleanup();
            if (!committed) updateMode();
            return true;
        }
    }, []);

    const clearAlbumPressTimer = useCallback(() => {
        if (albumPressTimerRef.current) {
            host.clearTimeout(albumPressTimerRef.current);
            albumPressTimerRef.current = null;
        }
        albumPressStartRef.current = null;
    }, []);

    const suppressNextAlbumClick = useCallback(() => {
        suppressAlbumClickRef.current = true;
        if (suppressAlbumClickTimerRef.current) {
            host.clearTimeout(suppressAlbumClickTimerRef.current);
        }
        suppressAlbumClickTimerRef.current = host.setTimeout(() => {
            suppressAlbumClickRef.current = false;
            suppressAlbumClickTimerRef.current = null;
        }, 800);
    }, []);

    const handleAlbumModeClick = useCallback((event) => {
        event?.preventDefault?.();
        event?.stopPropagation?.();

        // TV mode always uses the plain album artwork presentation.
        if (tvModeEnabled) return;
        const allowAlbumTransition = vinylAnimationsEnabled
            && readVisualSettings()?.["reduce-motion"] !== true
            && !host.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

        if (suppressAlbumClickRef.current) {
            suppressAlbumClickRef.current = false;
            if (suppressAlbumClickTimerRef.current) {
                host.clearTimeout(suppressAlbumClickTimerRef.current);
                suppressAlbumClickTimerRef.current = null;
            }
            return;
        }

        if (presentationModeActive) {
            if (lpModeClosing) return;
            if (!allowAlbumTransition) {
                setLpModeClosing(false);
                onPresentationModeChange?.("standard");
                return;
            }
            if (runLpSharedTransition("exit", () => {
                if (lpModeExitTimerRef.current) {
                    host.clearTimeout(lpModeExitTimerRef.current);
                    lpModeExitTimerRef.current = null;
                }
                setLpModeClosing(false);
                onPresentationModeChange?.("standard");
            })) return;

            setLpModeClosing(true);
            lpModeExitTimerRef.current = host.setTimeout(() => {
                lpModeExitTimerRef.current = null;
                setLpModeClosing(false);
                onPresentationModeChange?.("standard");
            }, 420);
            return;
        }

        // This preference gates only the artwork shortcut into a focused
        // mode. Existing LP/CD/video views can still exit through the cover,
        // and the explicit mode switcher remains available independently.
        if (!albumClickOpensMode) return;

        if (lpModeExitTimerRef.current) {
            host.clearTimeout(lpModeExitTimerRef.current);
            lpModeExitTimerRef.current = null;
        }
        setLpModeClosing(false);
        const nextPresentation = normalizeFullscreenFocusPresentation(readVisualSettings()?.["fullscreen-focus-presentation"]);
        if (!allowAlbumTransition) {
            onPresentationModeChange?.(nextPresentation);
            return;
        }
        if (runLpSharedTransition(
            "enter",
            () => onPresentationModeChange?.(nextPresentation)
        )) return;
        onPresentationModeChange?.(nextPresentation);
    }, [
        presentationModeActive,
        lpModeClosing,
        onPresentationModeChange,
        runLpSharedTransition,
        tvModeEnabled,
        vinylAnimationsEnabled,
        albumClickOpensMode
    ]);

    const handlePresentationModeChange = useCallback((nextMode) => {
        const normalized = normalizeFullscreenPresentation(nextMode);
        if (normalized === normalizedPresentationMode) return;
        if (normalized === "standard") {
            handleAlbumModeClick();
            return;
        }

        if (lpModeExitTimerRef.current) {
            host.clearTimeout(lpModeExitTimerRef.current);
            lpModeExitTimerRef.current = null;
        }
        setLpModeClosing(false);
        // The switcher uses the same album handoff as clicking a cover,
        // including CD <-> LP and either presentation <-> video stage.
        const direction = presentationModeActive ? "switch" : "enter";
        if (runLpSharedTransition(direction, () => onPresentationModeChange?.(normalized))) return;
        onPresentationModeChange?.(normalized);
    }, [handleAlbumModeClick, normalizedPresentationMode, onPresentationModeChange,
        presentationModeActive, runLpSharedTransition]);

    const handleAlbumContextMenu = useCallback((event) => {
        event.preventDefault();
        event.stopPropagation();
        clearAlbumPressTimer();
        suppressNextAlbumClick();
        openTmiMode();
    }, [clearAlbumPressTimer, openTmiMode, suppressNextAlbumClick]);

    const handleAlbumPointerDown = useCallback((event) => {
        if (event.button !== undefined && event.button !== 0) return;

        clearAlbumPressTimer();
        albumPressStartRef.current = {
            pointerId: event.pointerId,
            x: event.clientX,
            y: event.clientY
        };
        albumPressTimerRef.current = host.setTimeout(() => {
            albumPressTimerRef.current = null;
            albumPressStartRef.current = null;
            suppressNextAlbumClick();
            openTmiMode();
        }, 650);
    }, [clearAlbumPressTimer, openTmiMode, suppressNextAlbumClick]);

    const handleAlbumPointerMove = useCallback((event) => {
        const start = albumPressStartRef.current;
        if (!start || start.pointerId !== event.pointerId) return;
        if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 12) {
            clearAlbumPressTimer();
        }
    }, [clearAlbumPressTimer]);

    const handleAlbumPointerEnd = useCallback(() => {
        clearAlbumPressTimer();
    }, [clearAlbumPressTimer]);

    const handleAlbumKeyDown = useCallback((event) => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            handleAlbumModeClick(event);
            return;
        }

        if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
            handleAlbumContextMenu(event);
        }
    }, [handleAlbumContextMenu, handleAlbumModeClick]);

    useEffect(() => () => {
        clearAlbumPressTimer();
        if (suppressAlbumClickTimerRef.current) {
            host.clearTimeout(suppressAlbumClickTimerRef.current);
        }
        if (lpModeExitTimerRef.current) {
            host.clearTimeout(lpModeExitTimerRef.current);
        }
        lpViewTransitionRef.current?.skipTransition?.();
        lpViewTransitionRef.current = null;
        document.documentElement?.classList.remove(
            "is-lp-view-transition",
            "is-lp-view-enter",
            "is-lp-view-exit",
            "is-lp-view-switch"
        );
    }, [clearAlbumPressTimer]);

    return {
        lpModeClosing, handlePresentationModeChange, handleAlbumModeClick,
        handleAlbumContextMenu, handleAlbumPointerDown, handleAlbumPointerMove, handleAlbumPointerEnd, handleAlbumKeyDown,
    };
}
