const VIDEO_READINESS_TIMEOUT_MS = 15000;

// A hidden webview may defer loading video until the window becomes visible.
export function watchVideoReadinessDeadline({ document, schedule, cancel, onTimeout, now = Date.now }) {
    let remaining = VIDEO_READINESS_TIMEOUT_MS;
    let pending = null;

    function cancelPending() {
        if (pending === null) return;
        const { timerId, deadline } = pending;
        pending = null;
        cancel(timerId);
        remaining = Math.max(0, deadline - now());
    }

    function stop() {
        document?.removeEventListener?.("visibilitychange", update);
        cancelPending();
    }

    function update() {
        if (document?.hidden) {
            cancelPending();
            return;
        }
        if (pending !== null) return;
        const current = { deadline: now() + remaining, timerId: null };
        pending = current;
        current.timerId = schedule(() => {
            if (pending !== current) return;
            cancel(current.timerId);
            pending = null;
            if (document?.hidden) return;
            stop();
            onTimeout();
        }, remaining);
    }

    document?.addEventListener?.("visibilitychange", update);
    update();
    return stop;
}
