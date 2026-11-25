import { normalizeIvLyricsTrackBackgroundOverride } from "../lyrics/backgroundModes.mjs";
import { getRuntimeService, publishRuntimeService } from "../spicetify/runtimeServices.mjs";
import { createRuntimeDebugLogger } from "../spicetify/runtimeDebug.mjs";
import { createTrackOverrideStores } from "./trackOverrideStore.mjs";

const serviceKey = Symbol.for("ivLyrics.trackOverrideStores");

export function getTrackOverrideStores(host, options = {}) {
    const installed = getRuntimeService(serviceKey, host);
    if (installed) return installed;

    const {
        getIndexedDB = () => host.indexedDB,
        debug = createRuntimeDebugLogger(host),
        logger = console,
    } = options;
    const stores = createTrackOverrideStores({
        getIndexedDB, sharePendingOpen: true, debug, logger,
        normalizeBackground: normalizeIvLyricsTrackBackgroundOverride,
    });
    for (const [name, store] of Object.entries(stores)) {
        stores[name] = publishRuntimeService(name, getRuntimeService(name, host) ?? store, host);
    }

    // Playback can continue with the other overrides if one storage request fails.
    const readForPlayback = (name, getValue) => async (trackUri) => {
        if (!trackUri) return null;
        try {
            return await getValue(trackUri);
        } catch (error) {
            logger.warn(`[ivLyrics] Failed to read the track ${name} override:`, error);
            return null;
        }
    };
    const { TrackLanguageDB, TrackLyricsProviderDB, TrackBackgroundDB } = stores;
    return publishRuntimeService(serviceKey, {
        ...stores,
        readLanguage: readForPlayback("language", (uri) => TrackLanguageDB.getLanguage(uri)),
        readProvider: readForPlayback("provider", (uri) => TrackLyricsProviderDB.getProvider(uri)),
        readBackground: readForPlayback("background", (uri) => TrackBackgroundDB.getOverride(uri)),
    }, host);
}
