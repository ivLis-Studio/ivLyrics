export function createTranslationStream(isCurrent) {
    const observers = new Set();
    const lines = new Map();
    const notifications = [];
    let lastReset = null;
    let closed = false;
    let delivering = false;
    const canDeliver = () => !closed && isCurrent();

    function publish(event) {
        if (!canDeliver()) return;
        notifications.push(event);
        if (delivering) return;
        delivering = true;
        try {
            // A callback can trigger a reset or subscribe another display.
            // All displays finish the current event before handling that change.
            for (let index = 0; index < notifications.length && canDeliver(); index++) {
                notifications[index]();
            }
        } finally {
            notifications.length = 0;
            delivering = false;
        }
    }

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
            if (!observer?.onLine && !observer?.onStreamReset) return;
            publish(() => {
                if (observers.has(observer)) return;
                observers.add(observer);
                if (lastReset) notify(observer.onStreamReset, lastReset);
                for (const args of lines.values()) notify(observer.onLine, args);
            });
        },
        onLine(index, text, detail) {
            if (!Number.isInteger(index) || index < 0) return;
            publish(() => {
                const args = [index, text, detail];
                lines.set(index, args);
                for (const observer of observers) notify(observer.onLine, args);
            });
        },
        onStreamReset(detail) {
            publish(() => {
                const previous = [...lines.keys()];
                lines.clear();
                lastReset = [detail];
                for (const observer of observers) {
                    if (observer.onStreamReset) notify(observer.onStreamReset, lastReset);
                    else for (const index of previous) notify(observer.onLine, [index, ""]);
                }
            });
        },
        close() {
            closed = true;
            lines.clear();
            observers.clear();
            lastReset = null;
        },
    };
}
