import { createRuntimeDebugLogger } from "#ivlyrics/spicetify/runtimeDebug.mjs";
import { createAddonSettingsStorage } from "../addonSettingsStorage.mjs";
import { installAiAddonManager } from "./builtinAiProviderServices.mjs";
import { getRuntimeService, publishRuntimeService } from "../../spicetify/runtimeServices.mjs";
import { createAIAddonManager } from "./createAIAddonManager.mjs";

// Spotify starts extensions before the app page finishes loading. Access the
// host values on demand, since storage, localization and debug adapters may
// not be installed at the moment this initializer runs.
export default function initializeAIAddonManager() {
    const debug = createRuntimeDebugLogger(window);
    const { getStoredValue, setStoredValue } = createAddonSettingsStorage(window);
    const manager = createAIAddonManager({
        getStoredValue,
        setStoredValue,
        getOwnStorage: () => localStorage,
        getI18n: () => getRuntimeService("I18n", window),
        getAddonDebug: () => window.AddonDebug,
        getMotionDirector: () => getRuntimeService("ivLyricsMotionDirector", window),
        debug,
    });
    // Supported external add-ons register through this API.
    publishRuntimeService("AIAddonManager", manager, window);
    installAiAddonManager(window, manager, setTimeout);

    const initWhenReady = () => {
        if (Spicetify?.LocalStorage) {
            manager.init().catch(error => console.error("[AIAddonManager] Init failed:", error));
        } else {
            setTimeout(initWhenReady, 100);
        }
    };
    initWhenReady();
    debug("[AIAddonManager] Module loaded");
}
