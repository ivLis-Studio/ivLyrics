const MAX_CONCURRENT_PROVIDER_LOOKUPS = 3;

export function createOrderedLyricsProviderRequests({ onAttempt, loadCandidate, onError, isCurrent = () => true, signal }) {
    const requests = new Map();
    const results = new Map();
    const queue = [];
    const active = new Set();
    let attempts = 0;
    let stopped = false;

    function pump() {
        while (!stopped && isCurrent() && active.size < MAX_CONCURRENT_PROVIDER_LOOKUPS && queue.length) {
            const job = queue.shift();
            const { provider, lyricsType, resolve } = job;
            active.add(job);
            onAttempt(provider, lyricsType, ++attempts);

            Promise.resolve().then(() => isCurrent() ? loadCandidate(provider) : null).catch((error) => {
                if (isCurrent()) onError(provider, error);
                return null;
            }).then((candidate) => {
                if (!active.delete(job)) return;
                results.set(provider.id, candidate);
                resolve(candidate);
                // The ordered selector can stop queued requests before we
                // start another lookup in a freed slot.
                Promise.resolve().then(pump);
            });
        }
        if (!isCurrent()) cancelProviderQueue();
    }

    function loadProviderOnce(provider, lyricsType = null) {
        if (requests.has(provider.id)) return requests.get(provider.id);
        if (stopped) return Promise.resolve(null);
        if (!isCurrent()) {
            cancelProviderQueue();
            return Promise.resolve(null);
        }
        const result = new Promise(resolve => queue.push({ provider, lyricsType, resolve }));
        requests.set(provider.id, result);
        pump();
        return result;
    }

    function stopProviderQueue() {
        stopped = true;
        signal?.removeEventListener("abort", cancelProviderQueue);
        queue.splice(0).forEach(job => job.resolve(null));
    }

    function cancelProviderQueue() {
        stopProviderQueue();
        for (const job of active) job.resolve(null);
        active.clear();
    }

    signal?.addEventListener("abort", cancelProviderQueue, { once: true });

    return { loadProviderOnce, stopProviderQueue, readResult: (providerId) => results.get(providerId) };
}
