export function createRuntimeEffects({ scheduleTimer, cancelTimer, onCleanupError }) {
    const cleanup = [];
    const timers = new Set();
    let active = true;

    function runCleanup(dispose) {
        try {
            dispose();
        } catch (error) {
            onCleanupError(error);
        }
    }

    function add(dispose) {
        if (typeof dispose !== "function") return;
        if (active) cleanup.push(dispose);
        else runCleanup(dispose);
    }

    function subscribe(register, listener) {
        if (active) {
            add(register((...args) => {
                if (active) return listener(...args);
            }));
        }
    }

    function listen(target, type, listener) {
        if (!target?.addEventListener) return;
        subscribe((handler) => {
            target.addEventListener(type, handler);
            return () => target.removeEventListener?.(type, handler);
        }, listener);
    }

    function listenMedia(media, listener) {
        if (media?.addEventListener) listen(media, "change", listener);
        else if (media?.addListener) {
            subscribe((handler) => {
                media.addListener(handler);
                return () => media.removeListener?.(handler);
            }, listener);
        }
    }

    function schedule(callback, delay) {
        if (!active) return;
        const timer = scheduleTimer(() => {
            timers.delete(timer);
            if (active) callback();
        }, delay);
        timers.add(timer);
    }

    function dispose() {
        if (!active) return;
        active = false;
        for (const timer of timers) runCleanup(() => cancelTimer(timer));
        timers.clear();
        for (const release of cleanup.splice(0)) runCleanup(release);
    }

    return { add, subscribe, listen, listenMedia, schedule, dispose };
}
