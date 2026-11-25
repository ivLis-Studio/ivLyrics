import { clampVinylProgress, clampVinylSeekPosition } from "./vinylPlayback.mjs";

const VINYL_TONEARM_MIN_ANGLE = -5.4;
const VINYL_TONEARM_MAX_ANGLE = 18;
const VINYL_TONEARM_EJECT_ANGLE = -8.2;
const VINYL_TONEARM_REST_ANGLE = -14;
const VINYL_TONEARM_CUE_PLAY_ANGLE = -7.2;
export const VINYL_TONEARM_LINEAR_REST_PROGRESS = -0.44;
const VINYL_TONEARM_LINEAR_EJECT_PROGRESS = -0.2;
const VINYL_TONEARM_LINEAR_CUE_PLAY_PROGRESS = -0.08;
export const VINYL_TONEARM_LINEAR_TRAVEL = 95;
const VINYL_POINTER_RELEASE_GRACE_MS = 90;

export function useVinylTonearm({
    react, host, document, trackUri, phase, isPlaying, position, duration, tonearmStyle,
    onSeek, onStopPlayback, onTogglePlayback, setVisualPhase,
}) {
    const { useState, useEffect, useRef, useCallback, useLayoutEffect = useEffect } = react;
    const [scrubPosition, setScrubPosition] = useState(null);
    const [dragTonearmAngle, setDragTonearmAngle] = useState(null);
    const [dragTonearmProgress, setDragTonearmProgress] = useState(null);
    const [cueReady, setCueReady] = useState(false);
    const [optimisticPosition, setOptimisticPosition] = useState(null);
    const tonearmRef = useRef(null);
    const activePointerRef = useRef(null);
    const interactionModeRef = useRef(null);
    const dragStateRef = useRef(null);
    const dragAngleOffsetRef = useRef(0);
    const dragLinearOffsetRef = useRef(0);
    const pointerReleaseTimerRef = useRef(null);
    const optimisticSeekTimerRef = useRef(null);
    const cancelTonearmInteractionRef = useRef(null);
    const finishTonearmInteractionRef = useRef(null);
    const moveTonearmRef = useRef(null);
    const previousTrackUri = useRef(trackUri);

    const clearPointerReleaseTimer = useCallback(() => {
        if (pointerReleaseTimerRef.current === null) return;
        host.clearTimeout(pointerReleaseTimerRef.current);
        pointerReleaseTimerRef.current = null;
    }, []);

    const setTonearmPreview = useCallback((dragState, interactionMode = interactionModeRef.current) => {
        dragStateRef.current = dragState;
        setDragTonearmAngle(dragState.angle);
        setDragTonearmProgress(dragState.progress);
        if (interactionMode === "seek") {
            setScrubPosition(dragState.position);
        } else {
            setCueReady(!!dragState.shouldPlay);
        }
    }, []);

    const clearTonearmPreview = useCallback(() => {
        dragStateRef.current = null;
        setScrubPosition(null);
        setDragTonearmAngle(null);
        setDragTonearmProgress(null);
        setCueReady(false);
    }, []);

    const releaseTonearmPointer = useCallback((pointerId) => {
        clearPointerReleaseTimer();
        activePointerRef.current = null;
        interactionModeRef.current = null;
        if (pointerId === null || pointerId === undefined) return;

        try {
            if (tonearmRef.current?.hasPointerCapture?.(pointerId)) {
                tonearmRef.current.releasePointerCapture(pointerId);
            }
        } catch (_) {
            // Pointer capture may already have been released by the browser.
        }
    }, [clearPointerReleaseTimer]);

    const cancelTonearmInteraction = useCallback((pointerId = activePointerRef.current) => {
        if (activePointerRef.current === null) return;
        releaseTonearmPointer(pointerId);
        clearTonearmPreview();
    }, [clearTonearmPreview, releaseTonearmPointer]);
    cancelTonearmInteractionRef.current = cancelTonearmInteraction;

    const clearOptimisticSeekTimer = useCallback(() => {
        if (optimisticSeekTimerRef.current === null) return;
        host.clearTimeout(optimisticSeekTimerRef.current);
        optimisticSeekTimerRef.current = null;
    }, []);

    const resetOptimisticPosition = useCallback(() => {
        clearOptimisticSeekTimer();
        setOptimisticPosition(null);
    }, [clearOptimisticSeekTimer]);

    useLayoutEffect(() => {
        if (previousTrackUri.current === trackUri) return;
        previousTrackUri.current = trackUri;
        cancelTonearmInteraction();
        resetOptimisticPosition();
    }, [trackUri, cancelTonearmInteraction, resetOptimisticPosition]);

    useEffect(() => {
        if (!isPlaying) {
            cancelTonearmInteraction();
            clearTonearmPreview();
            resetOptimisticPosition();
        }
    }, [cancelTonearmInteraction, clearTonearmPreview, isPlaying, resetOptimisticPosition]);

    useEffect(() => {
        if (optimisticPosition === null) return;
        const externalPosition = Math.max(Number(position) || 0, 0);
        if (Math.abs(externalPosition - optimisticPosition) <= 1500) {
            resetOptimisticPosition();
        }
    }, [optimisticPosition, position, resetOptimisticPosition]);

    useEffect(() => () => {
        clearPointerReleaseTimer();
        clearOptimisticSeekTimer();
    }, [clearPointerReleaseTimer, clearOptimisticSeekTimer]);

    const safeDuration = Math.max(Number(duration) || 0, 0);
    const safePosition = Math.min(
        Math.max(Number(scrubPosition ?? optimisticPosition ?? position) || 0, 0),
        safeDuration || Infinity
    );
    const playbackProgress = safeDuration > 0 ? clampVinylProgress(safePosition / safeDuration) : 0;
    const tonearmRange = VINYL_TONEARM_MAX_ANGLE - VINYL_TONEARM_MIN_ANGLE;
    const playbackTonearmAngle = VINYL_TONEARM_MIN_ANGLE + playbackProgress * tonearmRange;
    const tonearmAngle = dragTonearmAngle ?? playbackTonearmAngle;
    const tonearmProgress = dragTonearmProgress ?? playbackProgress;
    const canScrub = isPlaying && phase === "playing" && safeDuration > 0;
    const canCuePlay = !isPlaying && (phase === "paused" || phase === "sleeved");
    const canControlTonearm = canScrub || canCuePlay;

    const getPointerAngle = useCallback((event) => {
        const bounds = tonearmRef.current?.getBoundingClientRect();
        if (!bounds) return 0;
        const pivotX = bounds.left + (183 / 260) * bounds.width;
        const pivotY = bounds.top + (64 / 620) * bounds.height;
        return Math.atan2(event.clientY - pivotY, event.clientX - pivotX) * 180 / Math.PI;
    }, []);

    const getPointerLinearProgress = useCallback((event) => {
        const bounds = tonearmRef.current?.getBoundingClientRect();
        if (!bounds || bounds.width <= 0) return 0;
        const svgX = ((event.clientX - bounds.left) / bounds.width) * 260;
        return (170 - svgX) / VINYL_TONEARM_LINEAR_TRAVEL;
    }, []);

    const getTonearmDragState = useCallback((event, interactionMode = interactionModeRef.current) => {
        if (tonearmStyle === "linear") {
            const rawProgress = getPointerLinearProgress(event) + dragLinearOffsetRef.current;
            if (interactionMode === "cue-play") {
                const cueProgress = Math.min(
                    Math.max(rawProgress, VINYL_TONEARM_LINEAR_REST_PROGRESS),
                    0
                );
                return {
                    angle: VINYL_TONEARM_REST_ANGLE,
                    progress: cueProgress,
                    isOutside: false,
                    shouldPlay: cueProgress >= VINYL_TONEARM_LINEAR_CUE_PLAY_PROGRESS,
                    position: null
                };
            }

            const seekProgress = clampVinylProgress(rawProgress);
            return {
                angle: VINYL_TONEARM_MIN_ANGLE + seekProgress * tonearmRange,
                progress: Math.min(Math.max(rawProgress, VINYL_TONEARM_LINEAR_REST_PROGRESS), 1),
                isOutside: rawProgress <= VINYL_TONEARM_LINEAR_EJECT_PROGRESS,
                shouldPlay: false,
                position: seekProgress * safeDuration
            };
        }

        const rawAngle = getPointerAngle(event) + dragAngleOffsetRef.current;
        if (interactionMode === "cue-play") {
            const cueAngle = Math.min(
                Math.max(rawAngle, VINYL_TONEARM_REST_ANGLE),
                VINYL_TONEARM_MIN_ANGLE
            );
            return {
                angle: cueAngle,
                progress: (cueAngle - VINYL_TONEARM_MIN_ANGLE) / tonearmRange,
                isOutside: false,
                shouldPlay: cueAngle >= VINYL_TONEARM_CUE_PLAY_ANGLE,
                position: null
            };
        }

        const seekAngle = Math.min(
            Math.max(rawAngle, VINYL_TONEARM_MIN_ANGLE),
            VINYL_TONEARM_MAX_ANGLE
        );
        const displayAngle = Math.min(
            Math.max(rawAngle, VINYL_TONEARM_REST_ANGLE),
            VINYL_TONEARM_MAX_ANGLE
        );
        const nextProgress = (seekAngle - VINYL_TONEARM_MIN_ANGLE) / tonearmRange;
        return {
            angle: displayAngle,
            progress: (displayAngle - VINYL_TONEARM_MIN_ANGLE) / tonearmRange,
            isOutside: rawAngle <= VINYL_TONEARM_EJECT_ANGLE,
            shouldPlay: false,
            position: clampVinylProgress(nextProgress) * safeDuration
        };
    }, [getPointerAngle, getPointerLinearProgress, safeDuration, tonearmRange, tonearmStyle]);

    const commitSeek = useCallback((nextPosition) => {
        const clampedPosition = clampVinylSeekPosition(nextPosition, safeDuration);
        clearTonearmPreview();
        setOptimisticPosition(clampedPosition);
        onSeek?.(clampedPosition);

        clearOptimisticSeekTimer();
        optimisticSeekTimerRef.current = host.setTimeout(() => {
            optimisticSeekTimerRef.current = null;
            setOptimisticPosition(null);
        }, 1600);
    }, [clearOptimisticSeekTimer, clearTonearmPreview, onSeek, safeDuration]);

    const stopFromTonearm = useCallback((pointerId) => {
        releaseTonearmPointer(pointerId);
        clearTonearmPreview();
        resetOptimisticPosition();
        setVisualPhase("pausing");
        onStopPlayback?.();
    }, [clearTonearmPreview, onStopPlayback, releaseTonearmPointer, resetOptimisticPosition, setVisualPhase]);

    const beginTonearmInteraction = useCallback((event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!canControlTonearm || event.isPrimary === false || (event.button ?? 0) !== 0) return;

        resetOptimisticPosition();
        clearPointerReleaseTimer();
        const interactionMode = canScrub ? "seek" : "cue-play";
        activePointerRef.current = event.pointerId;
        interactionModeRef.current = interactionMode;
        const initialAngle = interactionMode === "seek"
            ? playbackTonearmAngle
            : VINYL_TONEARM_REST_ANGLE;
        const initialProgress = interactionMode === "seek"
            ? playbackProgress
            : VINYL_TONEARM_LINEAR_REST_PROGRESS;
        if (tonearmStyle === "linear") {
            dragLinearOffsetRef.current = initialProgress - getPointerLinearProgress(event);
        } else {
            dragAngleOffsetRef.current = initialAngle - getPointerAngle(event);
        }
        try {
            tonearmRef.current?.setPointerCapture?.(event.pointerId);
        } catch (_) {
            // Window-level pointer listeners continue the gesture if capture is unavailable.
        }
        setTonearmPreview(
            getTonearmDragState(event, interactionMode),
            interactionMode
        );
    }, [
        canControlTonearm,
        canScrub,
        clearPointerReleaseTimer,
        getPointerAngle,
        getPointerLinearProgress,
        getTonearmDragState,
        playbackTonearmAngle,
        playbackProgress,
        resetOptimisticPosition,
        setTonearmPreview,
        tonearmStyle
    ]);

    const finishTonearmInteraction = useCallback((event, shouldCommit = true, useLastPreview = false) => {
        if (activePointerRef.current !== event.pointerId) return;
        clearPointerReleaseTimer();
        event.preventDefault?.();
        event.stopPropagation?.();
        const interactionMode = interactionModeRef.current;

        if (!shouldCommit) {
            releaseTonearmPointer(event.pointerId);
            clearTonearmPreview();
            return;
        }

        const dragState = useLastPreview
            ? dragStateRef.current
            : getTonearmDragState(event, interactionMode);
        if (!dragState) {
            releaseTonearmPointer(event.pointerId);
            clearTonearmPreview();
            return;
        }

        if (interactionMode === "cue-play") {
            const shouldStartPlayback = !!dragState.shouldPlay;
            releaseTonearmPointer(event.pointerId);
            clearTonearmPreview();
            if (shouldStartPlayback) onTogglePlayback?.();
            return;
        }

        if (dragState.isOutside) {
            stopFromTonearm(event.pointerId);
            return;
        }

        releaseTonearmPointer(event.pointerId);
        commitSeek(dragState.position);
    }, [
        clearPointerReleaseTimer,
        clearTonearmPreview,
        commitSeek,
        getTonearmDragState,
        onTogglePlayback,
        releaseTonearmPointer,
        stopFromTonearm
    ]);
    finishTonearmInteractionRef.current = finishTonearmInteraction;

    const schedulePointerReleaseFallback = useCallback((pointerId) => {
        if (pointerReleaseTimerRef.current !== null) return;
        pointerReleaseTimerRef.current = host.setTimeout(() => {
            pointerReleaseTimerRef.current = null;
            if (activePointerRef.current !== pointerId) return;
            finishTonearmInteractionRef.current?.({
                pointerId,
                preventDefault: () => undefined,
                stopPropagation: () => undefined
            }, true, true);
        }, VINYL_POINTER_RELEASE_GRACE_MS);
    }, []);

    const moveTonearm = useCallback((event) => {
        if (activePointerRef.current !== event.pointerId) return;

        const isTransientMouseReleaseFrame = event.pointerType === "mouse"
            && (Number(event.buttons) & 1) !== 1;
        if (isTransientMouseReleaseFrame) {
            schedulePointerReleaseFallback(event.pointerId);
            return;
        }

        clearPointerReleaseTimer();
        event.preventDefault();
        event.stopPropagation();
        const interactionMode = interactionModeRef.current;
        setTonearmPreview(
            getTonearmDragState(event, interactionMode),
            interactionMode
        );
    }, [
        clearPointerReleaseTimer,
        getTonearmDragState,
        schedulePointerReleaseFallback,
        setTonearmPreview
    ]);
    moveTonearmRef.current = moveTonearm;

    useEffect(() => {
        const handleWindowPointerMove = (event) => moveTonearmRef.current?.(event);
        const handleWindowPointerUp = (event) => finishTonearmInteractionRef.current?.(event, true);
        const handleWindowPointerCancel = (event) => finishTonearmInteractionRef.current?.(event, false);
        const handleInteractionInterrupted = () => cancelTonearmInteractionRef.current?.();
        const pointerMoveOptions = { capture: true, passive: false };
        const handleVisibilityChange = () => {
            if (document.visibilityState === "hidden") cancelTonearmInteractionRef.current?.();
        };

        // Capture-phase listeners keep the drag alive when Electron releases
        // pointer capture or another Spotify surface stops propagation.
        host.addEventListener("pointermove", handleWindowPointerMove, pointerMoveOptions);
        host.addEventListener("pointerup", handleWindowPointerUp, true);
        host.addEventListener("pointercancel", handleWindowPointerCancel, true);
        host.addEventListener("blur", handleInteractionInterrupted);
        document.addEventListener("visibilitychange", handleVisibilityChange);

        return () => {
            host.removeEventListener("pointermove", handleWindowPointerMove, pointerMoveOptions);
            host.removeEventListener("pointerup", handleWindowPointerUp, true);
            host.removeEventListener("pointercancel", handleWindowPointerCancel, true);
            host.removeEventListener("blur", handleInteractionInterrupted);
            document.removeEventListener("visibilitychange", handleVisibilityChange);
            const pointerId = activePointerRef.current;
            activePointerRef.current = null;
            interactionModeRef.current = null;
            dragStateRef.current = null;
            clearPointerReleaseTimer();
            if (pointerId !== null && tonearmRef.current?.hasPointerCapture?.(pointerId)) {
                try {
                    tonearmRef.current.releasePointerCapture(pointerId);
                } catch (_) { }
            }
        };
    }, [clearPointerReleaseTimer]);

    const handleTonearmKeyDown = useCallback((event) => {
        if (event.key === " " || event.key === "Enter") {
            event.preventDefault();
            onTogglePlayback?.();
            return;
        }
        if (!canScrub) return;

        let nextPosition = null;
        if (event.key === "ArrowLeft") nextPosition = safePosition - 5000;
        if (event.key === "ArrowRight") nextPosition = safePosition + 5000;
        if (event.key === "Home") nextPosition = 0;
        if (event.key === "End") nextPosition = safeDuration;
        if (nextPosition === null) return;

        event.preventDefault();
        commitSeek(nextPosition);
    }, [canScrub, commitSeek, onTogglePlayback, safeDuration, safePosition]);


    const isDragging = dragTonearmAngle !== null || dragTonearmProgress !== null;
    const interactionMode = interactionModeRef.current;
    return {
        tonearmRef, safePosition, safeDuration, tonearmAngle, tonearmProgress, canControlTonearm, cueReady,
        isScrubbing: scrubPosition !== null,
        isCueing: isDragging && interactionMode === "cue-play",
        isEjecting: isDragging && interactionMode === "seek" && !!dragStateRef.current?.isOutside,
        events: {
            onPointerDown: beginTonearmInteraction,
            onPointerMove: moveTonearm,
            onPointerUp: (event) => finishTonearmInteraction(event, true),
            onPointerCancel: (event) => finishTonearmInteraction(event, false),
            onClick: (event) => event.stopPropagation(),
            onKeyDown: handleTonearmKeyDown,
        },
    };
}
