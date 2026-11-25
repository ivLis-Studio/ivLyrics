export function createCoalescedCallback(callback, schedule = queueMicrotask) {
    let queued = false;
    return () => {
        if (queued) return;
        queued = true;
        schedule(() => {
            queued = false;
            callback();
        });
    };
}
