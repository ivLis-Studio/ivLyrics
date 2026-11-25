import { createRuntimeDebugLogger } from "#ivlyrics/spicetify/runtimeDebug.mjs";
import { lyricsWordSegmenter } from "#ivlyrics/lyrics/LyricsWordSegmenter.js";
import { readSettingsPersistence } from "../core/settingsRuntime.mjs";
import { readSyncDataCodec } from "../features/sync/syncDataCodecRuntime.mjs";
import { getLyricFuriganaConverter } from "../lyrics/lyricsTextRuntime.mjs";
import { readLyricsAddonManager } from "../providers/lyrics/lyricsAddonRegistration.mjs";
import { getRuntimeService } from "./runtimeServices.mjs";

// The startup extension can finish initializing after the route loads.
// Resolve its services when called, using the same host as the route.
export function createSyncCreatorServices(host) {
  const read = (name) => getRuntimeService(name, host);
  return {
    readSyncCreatorCodec: () => readSyncDataCodec(host),
    readSyncCreatorSyncService: () => read("SyncDataService"),
    getLyricsService: () => read("LyricsService"),
    getLrclibTransport: () => read("IvLyricsLrclibTransport"),
    getSyncCreatorLyricsAddonManager: () => readLyricsAddonManager(host),
    getStoragePersistence: () => readSettingsPersistence(host),
    getSyncCreatorFuriganaConverter: () => getLyricFuriganaConverter(host),
    getSyncCreatorPronunciationAiManager: () => read("AIAddonManager"),
    getWordSegmenter: () => lyricsWordSegmenter,
    getSpotifyTrackData: (uri) => read("SpotifyDataHelper")?.extractSpotifyData?.(uri),
    debugSyncCreatorSource: createRuntimeDebugLogger(host),
  };
}
