import { createRuntimeDebugLogger } from "#ivlyrics/spicetify/runtimeDebug.mjs";
import { readTrackIdentityService } from "../../core/trackIdentity.mjs";
import { readSettingsStorage } from "../../core/settingsRuntime.mjs";
import { createAddonSettingsStorage } from "../addonSettingsStorage.mjs";
import { getRuntimeService, publishRuntimeService } from "../../spicetify/runtimeServices.mjs";
import { getMountedLyricsPage } from "../../spicetify/lyricsPageEffects.mjs";
import { createLyricsAddonManager } from "./createLyricsAddonManager.mjs";
import { installLyricsAddonManager } from "./lyricsAddonRegistration.mjs";

// This entry point runs before the custom app creates CONFIG or mounts a page.
export default function initializeLyricsAddonManager() {
    const readService = (name) => getRuntimeService(name, window);
    const debug = createRuntimeDebugLogger(window);
    const { getStoredValue, setStoredValue } = createAddonSettingsStorage(window);
    const manager = createLyricsAddonManager({
        getStoredValue,
        setStoredValue,
        readTrackItem: () => Spicetify.Player.data?.item,
        readTrackIdentity: () => readTrackIdentityService(window),
        readVisualSettings: () => readService("CONFIG")?.visual,
        readAppStorage: () => readSettingsStorage(window),
        readLyricsPage: () => getMountedLyricsPage(window),
        readLyricsService: () => readService("LyricsService"),
        readSyncDataService: () => readService("SyncDataService"),
        readPseudoKaraoke: () => readService("PseudoKaraokeService"),
        readInstrumentalBreaks: () => readService("ivLyricsInstrumentalBreaks"),
        readAddonDebug: () => readService("AddonDebug"),
        debug,
    });
    // Marketplace and legacy add-ons still register through the public API.
    publishRuntimeService("LyricsAddonManager", manager, window);
    installLyricsAddonManager(window, manager, setTimeout);

    const initWhenReady = () => {
        if (typeof Spicetify !== "undefined" && Spicetify?.LocalStorage) {
            manager.init().catch(error => console.error("[LyricsAddonManager] Init failed:", error));
        } else {
            setTimeout(initWhenReady, 100);
        }
    };
    initWhenReady();
    debug("[LyricsAddonManager] Module loaded");
}
