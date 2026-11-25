import { createRuntimeDebugLogger } from "#ivlyrics/spicetify/runtimeDebug.mjs";
import { readTrackIdentityService } from "../../core/trackIdentity.mjs";
import { readSettingsPersistence, readSettingsStorage } from "../../core/settingsRuntime.mjs";
import { getRuntimeService, publishRuntimeService } from "../../spicetify/runtimeServices.mjs";
import { getMountedLyricsPage } from "../../spicetify/lyricsPageEffects.mjs";
import { createLyricsAddonManager } from "./createLyricsAddonManager.mjs";
import { installLyricsAddonManager } from "./lyricsAddonRegistration.mjs";

// This entry point runs before the custom app creates CONFIG or mounts a page.
export default function initializeLyricsAddonManager() {
    const readService = (name) => getRuntimeService(name, window);
    const debug = createRuntimeDebugLogger(window);
    const manager = createLyricsAddonManager({
        getStoredValue: (key) => {
            const persistence = readSettingsPersistence(window);
            return persistence ? persistence.getItem(key) : Spicetify.LocalStorage.get(key);
        },
        setStoredValue: (key, value) => {
            const persistence = readSettingsPersistence(window);
            return persistence ? persistence.setItem(key, value) : Spicetify.LocalStorage.set(key, value);
        },
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
