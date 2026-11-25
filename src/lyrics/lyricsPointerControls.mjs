const HIDDEN_CLASSES = ["controls-hidden", "ui-hidden"];

export function createLyricsPointerControls({ isToolbarEngaged, onActivityChange, onWheel, scheduleTimer, cancelTimer }) {
    let container = null;
    let idleTimer = null;
    let lastPointer = null;

    function cancelIdle() {
        if (!idleTimer) return;
        const timer = idleTimer;
        idleTimer = null;
        cancelTimer(timer.id);
    }

    function updateActivity(active) {
        onActivityChange(active);
        for (const name of HIDDEN_CLASSES) container?.classList.toggle(name, !active);
    }

    function scheduleIdle(delay) {
        const timer = { id: null };
        idleTimer = timer;
        timer.id = scheduleTimer(() => {
            if (idleTimer !== timer || !container) return;
            idleTimer = null;
            if (isToolbarEngaged()) scheduleIdle(1200);
            else updateActivity(false);
        }, delay);
    }

    function wake() {
        updateActivity(true);
        cancelIdle();
        if (container) scheduleIdle(2500);
    }

    function move(event) {
        // A reflow under a stationary pointer must leave the controls hidden.
        if (Number.isFinite(event?.screenX) && Number.isFinite(event?.screenY)) {
            const { screenX: x, screenY: y } = event;
            if (lastPointer?.x === x && lastPointer?.y === y) return;
            lastPointer = { x, y };
        }
        wake();
    }

    function leave() {
        cancelIdle();
        if (!isToolbarEngaged()) updateActivity(false);
    }

    function attach(nextContainer) {
        if (nextContainer === container) return;
        cancelIdle();
        if (container) {
            container.removeEventListener("mousemove", move);
            container.removeEventListener("mouseleave", leave);
            if (container.onmousewheel === onWheel) container.onmousewheel = null;
        }
        container = nextContainer;
        lastPointer = null;
        if (!container) return;
        container.onmousewheel = onWheel;
        container.addEventListener("mousemove", move);
        container.addEventListener("mouseleave", leave);
        wake();
    }

    return { attach, wake };
}
