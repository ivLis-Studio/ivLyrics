import { getRuntimeService, publishRuntimeService } from "../../spicetify/runtimeServices.mjs";
import { runWithAbortSignal } from "../../core/abortableOperation.mjs";

const serviceName = "MarketplaceManager";
export const readMarketplaceManager = (host) => getRuntimeService(serviceName, host);
export const publishMarketplaceManager = (host, manager) => publishRuntimeService(serviceName, manager, host);

const lyricsCacheRevisions = new WeakMap();

export function recordMarketplaceLyricsCacheRevision(provider, entry) {
    if (!provider || entry.metadata?.type !== "lyrics") return;
    // Existing installations keep one stable identity across Spotify restarts.
    const revision = entry.lyricsCacheRevision || JSON.stringify([entry.id, entry.updatedAt, entry.installedAt, entry.metadata?.version]);
    lyricsCacheRevisions.set(provider, revision);
}

export const readMarketplaceLyricsCacheRevision = provider => lyricsCacheRevisions.get(provider) ?? null;

export function waitForMarketplaceLyricsProviderChanges(host, signal) {
    const readPending = () => readMarketplaceManager(host)?.getPendingLyricsProviderChanges?.();
    const pending = readPending();
    if (!pending) return null;
    return runWithAbortSignal(signal, async () => {
        let changes = pending;
        while (changes && !signal?.aborted) {
            await changes;
            changes = readPending();
        }
        return !signal?.aborted;
    }).catch(error => {
        if (signal?.aborted) return false;
        throw error;
    });
}
