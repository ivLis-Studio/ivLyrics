export function useFullscreenAutoHide({
    react: { useState, useEffect, useRef }, document, enabled, delay, timers = globalThis,
}) {
    const [visible, setVisible] = useState(true);
    const visibleRef = useRef(true);

    useEffect(() => {
        function updateVisibility(next) {
            if (visibleRef.current === next) return;
            visibleRef.current = next;
            setVisible(next);
        }

        if (!enabled) {
            updateVisibility(true);
            return;
        }

        let lastPointer = null;
        let timer = null;
        function scheduleHide() {
            if (timer !== null) timers.clearTimeout(timer);
            timer = timers.setTimeout(() => {
                timer = null;
                updateVisibility(false);
            }, delay);
        }

        function handleMouseMove(event) {
            // A song change under a stationary pointer is not user activity.
            const { screenX, screenY } = event ?? {};
            if (Number.isFinite(screenX) && Number.isFinite(screenY)) {
                if (lastPointer?.x === screenX && lastPointer.y === screenY) return;
                lastPointer = { x: screenX, y: screenY };
            }
            updateVisibility(true);
            scheduleHide();
        }

        scheduleHide();
        document.addEventListener("mousemove", handleMouseMove, { passive: true });
        return () => {
            document.removeEventListener("mousemove", handleMouseMove);
            if (timer !== null) timers.clearTimeout(timer);
        };
    }, [document, enabled, delay, timers]);

    return visible;
}

export function useFullscreenControlReveal({
    react: { useState, useEffect, useLayoutEffect = useEffect, useCallback, useRef }, host: window,
    enabled = true, schedule: setTimeout = globalThis.setTimeout, cancel: clearTimeout = globalThis.clearTimeout,
}) {
    // Left-panel controls are revealed by hover, not by global mouse activity.
    // Multiple sources can hold the panel open at once (hover strip + the panel
    // content + the controls themselves + keyboard focus + an in-progress drag),
    // so each source is tracked independently and OR'd together.
    const CONTROLS_HIDE_HOLD_MS = 500;
    const controlsHoverSourcesRef = useRef(new Set());
    const controlsFocusHeldRef = useRef(false);
    const controlsDragHeldRef = useRef(false);
    const controlsHideTimerRef = useRef(null);
    const controlsDragReleaseRef = useRef(null);
    const [leftControlsRevealed, setLeftControlsRevealed] = useState(false);

    const cancelControlsHideHold = useCallback(() => {
        if (controlsHideTimerRef.current === null) return;
        clearTimeout(controlsHideTimerRef.current);
        controlsHideTimerRef.current = null;
    }, [clearTimeout]);

    useLayoutEffect(() => {
        if (!enabled) setLeftControlsRevealed(false);
        return () => {
            controlsHoverSourcesRef.current.clear();
            controlsFocusHeldRef.current = false;
            controlsDragHeldRef.current = false;
            controlsDragReleaseRef.current?.();
            cancelControlsHideHold();
        };
    }, [enabled, cancelControlsHideHold]);

    // Losing the last source does not hide the panel straight away - it lingers
    // briefly, so brushing past the column on the way somewhere else does not
    // throw the controls away. Every path (hover, focus, drag) goes through here.
    const syncLeftControlsReveal = useCallback(() => {
        const revealed = controlsHoverSourcesRef.current.size > 0
            || controlsFocusHeldRef.current
            || controlsDragHeldRef.current;
        if (revealed) {
            cancelControlsHideHold();
            setLeftControlsRevealed(true);
            return;
        }
        if (controlsHideTimerRef.current === null) {
            controlsHideTimerRef.current = setTimeout(() => {
                controlsHideTimerRef.current = null;
                setLeftControlsRevealed(false);
            }, CONTROLS_HIDE_HOLD_MS);
        }
    }, [cancelControlsHideHold, setTimeout]);

    const setControlsHoverSource = useCallback((source, active) => {
        if (!enabled) return;
        const sources = controlsHoverSourcesRef.current;
        if (active) {
            if (sources.has(source)) return;
            sources.add(source);
        } else {
            if (!sources.has(source)) return;
            sources.delete(source);
        }
        syncLeftControlsReveal();
    }, [enabled, syncLeftControlsReveal]);

    // A press can start inside the controls and finish outside them (timeline or
    // volume drag), so the hold is taken on the press and dropped by the first
    // release anywhere. The release listener is registered by the press itself:
    // the panel is already revealed when a press lands, so nothing re-renders
    // that could register it later.
    const beginControlsDragHold = useCallback(() => {
        if (!enabled || controlsDragReleaseRef.current) return;
        if (typeof window === "undefined" || typeof window.addEventListener !== "function") return;
        const detach = () => {
            window.removeEventListener("mouseup", release, true);
            window.removeEventListener("blur", release);
            controlsDragReleaseRef.current = null;
        };
        const release = () => {
            detach();
            controlsDragHeldRef.current = false;
            syncLeftControlsReveal();
        };
        controlsDragReleaseRef.current = detach;
        controlsDragHeldRef.current = true;
        window.addEventListener("mouseup", release, true);
        window.addEventListener("blur", release);
        syncLeftControlsReveal();
    }, [enabled, syncLeftControlsReveal, window]);

    // Only keyboard focus pins the controls. A mouse press also focuses the
    // button it lands on, and that focus must not keep the panel up once the
    // pointer has left the column. A press in progress marks pointer focus;
    // :focus-visible rules out programmatic focus after a pointer interaction.
    const setControlsFocusHold = useCallback((target, focused) => {
        if (!enabled) return;
        let keyboardFocus = false;
        if (focused && !controlsDragHeldRef.current) {
            try {
                keyboardFocus = typeof target?.matches === "function" ? target.matches(":focus-visible") : true;
            } catch {
                keyboardFocus = true;
            }
        }
        if (controlsFocusHeldRef.current === keyboardFocus) return;
        controlsFocusHeldRef.current = keyboardFocus;
        syncLeftControlsReveal();
    }, [enabled, syncLeftControlsReveal]);

    // Spotify's CEF reports "(hover: none)" even with a mouse attached, so that
    // media query cannot be trusted to mean "touch". Assume hover works and only
    // give up once a touch-only pointer is actually seen.
    const [pointerCanHover, setPointerCanHover] = useState(true);

    useEffect(() => {
        if (typeof window === "undefined" || typeof window.addEventListener !== "function") return;
        const seenTouchPointer = event => {
            if (event?.pointerType === "touch") setPointerCanHover(false);
        };
        const seenMouse = event => {
            if (event?.pointerType === "mouse") setPointerCanHover(true);
        };
        window.addEventListener("pointerdown", seenTouchPointer, true);
        window.addEventListener("pointerdown", seenMouse, true);
        return () => {
            window.removeEventListener("pointerdown", seenTouchPointer, true);
            window.removeEventListener("pointerdown", seenMouse, true);
        };
    }, [window]);

    return { leftControlsRevealed, pointerCanHover, setControlsHoverSource, beginControlsDragHold, setControlsFocusHold };
}
