export function createTranslationStream(isCurrent) {
    const observers = new Set();
    const lines = new Map();
    let lastReset = null;
    let closed = false;
    const canDeliver = () => !closed && isCurrent();

    function notify(callback, args) {
        if (!callback || !canDeliver()) return;
        try {
            callback(...args);
        } catch (error) {
            // A display failure cannot interrupt generation for the other displays.
            console.warn("[ivLyrics] Translation stream observer failed:", error);
        }
    }

    return {
        subscribe(observer) {
            if ((!observer?.onLine && !observer?.onStreamReset) || !canDeliver()) return;
            observers.add(observer);
            if (lastReset) notify(observer.onStreamReset, lastReset);
            for (const args of [...lines.values()]) notify(observer.onLine, args);
        },
        onLine(index, text, detail) {
            if (!canDeliver() || !Number.isInteger(index) || index < 0) return;
            const args = [index, text, detail];
            lines.set(index, args);
            for (const observer of [...observers]) notify(observer.onLine, args);
        },
        onStreamReset(detail) {
            if (!canDeliver()) return;
            const previous = [...lines.keys()];
            lines.clear();
            lastReset = [detail];
            for (const observer of [...observers]) {
                if (observer.onStreamReset) notify(observer.onStreamReset, lastReset);
                else for (const index of previous) notify(observer.onLine, [index, ""]);
            }
        },
        close() {
            closed = true;
            lines.clear();
            observers.clear();
            lastReset = null;
        },
    };
}
