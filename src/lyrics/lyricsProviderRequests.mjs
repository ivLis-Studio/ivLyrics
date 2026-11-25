import { createTrackRevisions } from "../core/trackRevisions.mjs";

export const LYRICS_PROVIDER_SELECTION_CHANGED = "ivLyrics:lyrics-provider-selection-changed";

export const supersededLyricsRequest = uri => ({ uri, error: 'Lyrics request superseded', stale: true });

export function isLyricsProviderSelectionSetting(name) {
    return typeof name === "string" && (name === "prefer-sync-data-provider"
        || name === "prefer-lyrics-type-over-provider-order" || name.includes("lyrics-provider"));
}

export function createLyricsProviderRequests(getManager, onManagerChange = () => {}, getScope = uri => uri) {
    const pending = new Map();
    const { getRevision: readRevision, invalidate: bumpRevision } = createTrackRevisions();
    function invalidate(trackUri) {
        const scope = trackUri ? getScope(trackUri) : null;
        bumpRevision(scope);
        for (const request of [...pending.values()]) {
            if (!scope || request.scope === scope) request.retire();
        }
    }
    let activeManager = getManager();
    const syncManager = () => {
        const manager = getManager();
        if (manager !== activeManager) {
            activeManager = manager;
            invalidate();
            onManagerChange();
        }
        return manager;
    };
    const getRevision = trackUri => {
        syncManager();
        return readRevision(getScope(trackUri));
    };

    return {
        getRevision,

        invalidate,

        async request({ info, forcedProviderId, getSnapshot, publishSnapshot, signal }) {
            const trackUri = info?.uri || '';
            if (signal?.aborted) return supersededLyricsRequest(trackUri);
            const manager = syncManager();
            if (!manager) return { error: 'No lyrics providers registered', uri: trackUri };

            const scope = getScope(trackUri);
            const revision = readRevision(scope);
            const key = JSON.stringify([trackUri, forcedProviderId || null]);
            const existing = pending.get(key);
            if (existing?.revision === revision && existing.manager === manager) {
                const joined = existing.join(signal);
                manager.replayActiveLyricsSearchProgress?.(trackUri, forcedProviderId);
                return joined;
            }

            const initialSnapshot = getSnapshot(trackUri);
            const controller = typeof AbortController === "function" ? new AbortController() : null;
            let isRetired = false;
            let hasUnboundConsumer = false;
            let cancellableConsumers = 0;
            let resolveRetired;
            const retired = new Promise(resolve => { resolveRetired = resolve; });
            const stale = () => supersededLyricsRequest(trackUri);
            const isCurrent = () => !isRetired && syncManager() === manager && readRevision(scope) === revision;
            const request = { scope, revision, manager, join, retire };
            function release() {
                if (pending.get(key) === request) pending.delete(key);
            }
            function retire() {
                if (isRetired) return;
                isRetired = true;
                release();
                controller?.abort();
                resolveRetired(stale());
            }
            function retireIfUnused() {
                if (!hasUnboundConsumer && cancellableConsumers === 0) retire();
            }
            function join(consumerSignal) {
                if (!consumerSignal) {
                    hasUnboundConsumer = true;
                    return promise;
                }
                if (consumerSignal.aborted) {
                    retireIfUnused();
                    return stale();
                }
                cancellableConsumers++;
                let onAbort;
                const cancelled = new Promise(resolve => {
                    onAbort = () => {
                        cancellableConsumers--;
                        retireIfUnused();
                        resolve(stale());
                    };
                    consumerSignal.addEventListener('abort', onAbort, { once: true });
                });
                return Promise.race([promise, cancelled])
                    .finally(() => consumerSignal.removeEventListener('abort', onAbort));
            }
            // The manager can emit progress synchronously. Register before an
            // event listener or another surface can ask for the same lyrics.
            const lookup = Promise.resolve().then(() => isCurrent()
                ? manager.getLyrics(info, forcedProviderId, { isCurrent, signal: controller?.signal })
                : stale());
            const promise = Promise.race([lookup, retired])
                .then(result => {
                    if (!isCurrent()) return stale();
                    if (trackUri && result && !result.error
                        && (!result.uri || result.uri === trackUri) && getSnapshot(trackUri) === initialSnapshot) {
                        const published = publishSnapshot({
                            trackUri,
                            trackInfo: info,
                            rawResult: result,
                            provider: result.provider || null,
                            karaokeSource: result.karaokeSource || null,
                            trackLyricsProviderOverride: forcedProviderId || null,
                            source: 'lyrics-service',
                        });
                        // Publication may retain already accepted word timing.
                        // Return the same canonical source read by every surface.
                        if (!isCurrent()) return stale();
                        return published?.rawResult ?? result;
                    }
                    return result;
                }, error => {
                    if (!isCurrent()) return stale();
                    throw error;
                })
                .finally(release);

            pending.set(key, request);
            return join(signal);
        },
    };
}

