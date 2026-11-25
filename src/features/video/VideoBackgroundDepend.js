import { writeRuntimeDebug } from "#ivlyrics/spicetify/runtimeDebug.mjs";
import { publishYouTubeBackgroundService } from "./youTubeBackgroundRuntime.mjs";
import { installYouTubeBackgroundBrowserHooks } from "./youtubeBackgroundBrowserHooks.mjs";
import { createYouTubeBackgroundIframePolicy } from "./youtubeBackgroundIframePolicy.mjs";
import { createYouTubeBackgroundPlayerControls } from "./youtubeBackgroundPlayerControls.mjs";
import { createYouTubeBackgroundPlayerApi } from "./youtubeBackgroundPlayerApi.mjs";

const LIFECYCLE = Symbol.for("ivLyrics.videoBackground.lifecycle");

export default function initializeVideoBackgroundDepend() {
    if (window[LIFECYCLE]) return;
    const moduleState = window[LIFECYCLE] = {
        initialized: false,
        disposed: false,
        waitTimer: null,
        playerPatchTimer: null,
        iframeObserver: null,
        restoreCallbacks: new Map()
    };

    const registerRestore = (key, restore) => {
        if (!moduleState.restoreCallbacks.has(key)) {
            moduleState.restoreCallbacks.set(key, restore);
        }
    };

    const restoreAll = () => {
        if (moduleState.disposed) return;
        moduleState.disposed = true;
        moduleState.initialized = false;

        if (moduleState.waitTimer) {
            clearTimeout(moduleState.waitTimer);
            moduleState.waitTimer = null;
        }
        if (moduleState.playerPatchTimer) {
            clearTimeout(moduleState.playerPatchTimer);
            moduleState.playerPatchTimer = null;
        }
        [...moduleState.restoreCallbacks.values()].reverse().forEach((restore) => {
            try {
                restore();
            } catch (err) {
                // Ignore restore failures
            }
        });

        moduleState.restoreCallbacks.clear();
        if (window[LIFECYCLE] === moduleState) delete window[LIFECYCLE];
    };

    const service = publishYouTubeBackgroundService(window, {
        restore: restoreAll
    });

    // Request muted playback through the iframe API so the server omits ad slots.
    // Parent-window request hooks cannot filter a cross-origin iframe response.
    const waitForSpicetify = () => {
        if (moduleState.disposed) return;
        if (!window.Spicetify?.Player || !document.body) {
            if (!moduleState.waitTimer) {
                moduleState.waitTimer = setTimeout(() => {
                    moduleState.waitTimer = null;
                    waitForSpicetify();
                }, 250);
            }
            return;
        }
        moduleState.waitTimer = null;
        initialize();
    };

    const logPrefix = "[ivLyrics VBD]";

    const iframePolicy = createYouTubeBackgroundIframePolicy({
        host: window, document, moduleState, registerRestore,
    });
    const controls = createYouTubeBackgroundPlayerControls({
        document, registerRestore, forgetRestore: player => moduleState.restoreCallbacks.delete(player),
    });
    service.isAdPlayback = controls.isAdPlayback;
    const { patchYouTubeApiReady, patchYouTubePlayer } = createYouTubeBackgroundPlayerApi({
        host: window, document, moduleState, registerRestore, controls,
    });

    const initialize = () => {
        if (moduleState.initialized || moduleState.disposed) return;
        moduleState.initialized = true;
        try {
            installYouTubeBackgroundBrowserHooks({
                host: window, registerRestore, isActive: () => moduleState.initialized, ...iframePolicy,
            });
            iframePolicy.observeIframes();
            patchYouTubeApiReady();
            patchYouTubePlayer();
        } catch (error) {
            restoreAll();
            throw error;
        }
        writeRuntimeDebug(window, `${logPrefix} initialized`);
    };

    waitForSpicetify();
}
