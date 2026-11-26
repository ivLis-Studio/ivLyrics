import { normalizeFullscreenFocusPresentation, normalizeFullscreenPresentation } from "./fullscreenPresentation.mjs";
import { createFullscreenAlbumViewTransition } from "./fullscreenAlbumViewTransition.mjs";

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
    const [albumTransition] = useState(() => createFullscreenAlbumViewTransition({
        document, host, getReactDOM,
        canAnimate: () => readVisualSettings()?.["fullscreen-vinyl-animations"] !== false
            && readVisualSettings()?.["reduce-motion"] !== true
            && !host.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches,
    }));

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
                albumTransition.cancel();
                setLpModeClosing(false);
                onPresentationModeChange?.("standard");
                return;
            }
            if (albumTransition.run("exit", () => {
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
            albumTransition.cancel();
            onPresentationModeChange?.(nextPresentation);
            return;
        }
        if (albumTransition.run(
            "enter",
            () => onPresentationModeChange?.(nextPresentation)
        )) return;
        onPresentationModeChange?.(nextPresentation);
    }, [
        presentationModeActive,
        lpModeClosing,
        onPresentationModeChange,
        albumTransition,
        tvModeEnabled,
        vinylAnimationsEnabled,
        albumClickOpensMode
    ]);

    const handlePresentationModeChange = useCallback((nextMode) => {
        const normalized = normalizeFullscreenPresentation(nextMode);
        if (normalized === normalizedPresentationMode) {
            albumTransition.cancel({ pendingOnly: true });
            return;
        }
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
        if (albumTransition.run(direction, () => onPresentationModeChange?.(normalized))) return;
        onPresentationModeChange?.(normalized);
    }, [handleAlbumModeClick, normalizedPresentationMode, onPresentationModeChange,
        presentationModeActive, albumTransition]);

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
        albumTransition.cancel();
    }, [clearAlbumPressTimer, albumTransition]);

    return {
        lpModeClosing, handlePresentationModeChange, handleAlbumModeClick,
        handleAlbumContextMenu, handleAlbumPointerDown, handleAlbumPointerMove, handleAlbumPointerEnd, handleAlbumKeyDown,
    };
}
