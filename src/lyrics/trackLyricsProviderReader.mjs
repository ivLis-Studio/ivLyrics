import { runWithAbortSignal } from "../core/abortableOperation.mjs";
import { trackIdentity } from "../core/trackIdentity.mjs";
import { getTrackOverrideStores } from "../core/trackOverrideRuntime.mjs";
import { readMarketplaceManager, waitForMarketplaceLyricsProviderChanges } from "../features/marketplace/marketplaceRuntime.mjs";
import { getRuntimeService } from "../spicetify/runtimeServices.mjs";

export function createTrackLyricsProviderReader(host, extractTrackId = trackIdentity.extractTrackId) {
    const { readProvider } = getTrackOverrideStores(host);
    const getAddonManager = () => getRuntimeService("LyricsAddonManager", host);

    return async function readTrackLyricsProviderOverride(uri, { signal } = {}) {
        if (!extractTrackId(uri) || signal?.aborted) return null;
        const provider = await readProvider(uri);
        if (!provider || signal?.aborted) return null;
        const pendingChange = waitForMarketplaceLyricsProviderChanges(host, signal);
        if (pendingChange && !await pendingChange) return null;

        let manager = getAddonManager();
        if (manager?.getAddon?.(provider)) return provider;

        // The saved provider may still be loading from the installed add-ons.
        // Known providers and tracks without an override can proceed immediately.
        const ready = readMarketplaceManager(host)?.readyPromise;
        if (ready) {
            try {
                await runWithAbortSignal(signal, () => ready);
            } catch (error) {
                if (!signal?.aborted) throw error;
            }
            if (signal?.aborted) return null;
            manager = getAddonManager();
        }
        return manager?.getAddon && !manager.getAddon(provider) ? null : provider;
    };
}
