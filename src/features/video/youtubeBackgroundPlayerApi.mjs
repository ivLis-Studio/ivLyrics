import { wrapBrowserMethod } from "./browserPropertyPatch.mjs";

export function createYouTubeBackgroundPlayerApi({ host: window, document, moduleState, registerRestore, controls }) {
    const {
        getPlayerControlState, attachAdSkipper, handleAdEvent, removeMutedPreviewLimit,
        scheduleMutedPreviewLimitRemoval, applyMutedPlaybackIntent, disableYouTubeCaptions, scheduleCaptionDisable,
    } = controls;
    let activeConstructor;

    const mergeFeatureFlags = (existing = "", forcedFlags = []) => {
        const map = new Map();
        const pushFlag = (flag) => {
            if (!flag) return;
            const [key, value = "true"] = flag.split("=");
            if (!key) return;
            map.set(key.trim(), value.trim());
        };
        existing.split("&").forEach(pushFlag);
        forcedFlags.forEach(pushFlag);
        return [...map.entries()].map(([key, value]) => `${key}=${value}`).join("&");
    };

    const patchYouTubeApiReady = () => {
        const key = "onYouTubeIframeAPIReady";
        const descriptor = Object.getOwnPropertyDescriptor(window, key);
        if (descriptor && (!descriptor.configurable || !("value" in descriptor))) return;
        let callback = window[key];
        const wrap = original => function (...args) {
            if (moduleState.initialized) patchYouTubePlayer();
            if (typeof original === "function") return original.apply(this, args);
        };
        let handler = wrap(callback);
        const get = () => handler;
        const set = next => { callback = next; handler = wrap(next); };
        const installed = { configurable: true, enumerable: descriptor?.enumerable ?? true, get, set };
        Object.defineProperty(window, key, installed);
        registerRestore("youtube-api-ready", () => {
            const current = Object.getOwnPropertyDescriptor(window, key);
            if (!current || !Object.entries(installed).every(([name, value]) => current[name] === value)) return;
            if (descriptor) Object.defineProperty(window, key, { ...descriptor, value: callback });
            else {
                delete window[key];
                if (callback !== undefined) window[key] = callback;
            }
        });
    };

    const patchYouTubePlayer = () => {
        if (!moduleState.initialized) return;
        const api = window.YT;
        if (typeof api?.Player !== "function") {
            if (!moduleState.playerPatchTimer) {
                moduleState.playerPatchTimer = setTimeout(() => {
                    moduleState.playerPatchTimer = null;
                    patchYouTubePlayer();
                }, 500);
            }
            return;
        }

        if (moduleState.playerPatchTimer) clearTimeout(moduleState.playerPatchTimer);
        moduleState.playerPatchTimer = null;
        if (api.Player === activeConstructor) return;
        const OriginalPlayer = api.Player;
        const PatchedPlayer = function patchedPlayer(element, config = {}) {
            if (!moduleState.initialized || activeConstructor !== PatchedPlayer) {
                return Reflect.construct(OriginalPlayer, arguments, new.target || OriginalPlayer);
            }
            const mergedConfig = { ...config };
            mergedConfig.host = "https://www.youtube-nocookie.com";
            // Bootstrap an empty embed. The first real video request is made with
            // playmuted onReady, before an ordinary load can acquire pre-roll ads.
            const initialVideoId = config.videoId;
            const hasInitialVideo = typeof initialVideoId === "string" && initialVideoId.length > 0;
            if (hasInitialVideo) mergedConfig.videoId = "";
            const forcedPlayerVars = {
                rel: 0,
                iv_load_policy: 3,
                modestbranding: 1,
                playsinline: 1,
                disablekb: 1,
                fs: 0,
                origin: window.location.origin,
                enablecastapi: 0,
                cc_load_policy: 0,
                hl: window.navigator?.language || "en",
                host_language: window.navigator?.language || "en",
                adformat: "0_0",
                allowfullscreen: 0,
                disable_polymer: 1,
                suppress_ads: 1
            };
            mergedConfig.playerVars = {
                ...forcedPlayerVars,
                ...config.playerVars,
                cc_load_policy: 0,
                playmuted: 1,
                mute: 1
            };
            const forcedFeatureFlags = [
                "disable_persistent_ads=true",
                "kevlar_allow_multistep_video_ads=false",
                "enable_desktop_ad_controls=false",
                "html5_disable_ads=true",
                "disable_new_pause_state3_player_ads=true",
                "player_ads_enable_gcf=false",
                "web_player_disable_afa=true",
                "kevlar_miniplayer_play_pause_on_scrim=true",
                "preskip_button_style_ads_backend=false",
                "html5_player_enable_ads_client=false"
            ];
            mergedConfig.playerVars.fflags = mergeFeatureFlags(mergedConfig.playerVars.fflags, forcedFeatureFlags);
            mergedConfig.events = { ...config.events };
            for (const name of ["onAdStart", "onAdEnd", "onAdStateChange"]) {
                const original = mergedConfig.events[name];
                mergedConfig.events[name] = function (event) {
                    if (moduleState.initialized) {
                        attachAdSkipper(event?.target, true);
                        handleAdEvent(event?.target, name, event);
                    }
                    if (typeof original === "function") return original.call(this, event);
                };
            }
            const originalOnCueRangesAdded = mergedConfig.events.onCueRangesAdded;
            mergedConfig.events.onCueRangesAdded = function (event) {
                removeMutedPreviewLimit(event?.target, event);
                if (typeof originalOnCueRangesAdded === "function") return originalOnCueRangesAdded.call(this, event);
            };
            let initialVideoLoaded = false;
            const originalOnReady = mergedConfig.events.onReady;
            mergedConfig.events.onReady = function (event) {
                if (moduleState.initialized) {
                    attachAdSkipper(event?.target, true);
                    scheduleCaptionDisable(event?.target);
                    const player = event?.target;
                    if (player && hasInitialVideo && !initialVideoLoaded && !getPlayerControlState(player).disposed) {
                        initialVideoLoaded = true;
                        const options = {
                            videoId: initialVideoId,
                            startSeconds: Number(config.playerVars?.start) || 0,
                            endSeconds: Number(config.playerVars?.end) || undefined,
                            playmuted: true,
                        };
                        const method = Number(config.playerVars?.autoplay) === 1 ? "loadVideoById" : "cueVideoById";
                        player[method]?.(options);
                    }
                }
                if (typeof originalOnReady === "function") {
                    originalOnReady.call(this, event);
                }
            };
            const originalOnStateChange = mergedConfig.events.onStateChange;
            mergedConfig.events.onStateChange = function (event) {
                if (moduleState.initialized && event?.target && !getPlayerControlState(event.target).disposed) {
                    const state = event.data;
                    if (state === api.PlayerState?.PLAYING || state === api.PlayerState?.CUED) {
                        disableYouTubeCaptions(event.target);
                    }
                    attachAdSkipper(event.target, true);
                    applyMutedPlaybackIntent(event.target, state);
                    scheduleMutedPreviewLimitRemoval(event.target);
                }
                if (typeof originalOnStateChange === "function") {
                    return originalOnStateChange.call(this, event);
                }
                return undefined;
            };

            const instance = new OriginalPlayer(element, mergedConfig);
            attachAdSkipper(instance, true);
            scheduleCaptionDisable(instance);
            return instance;
        };

        PatchedPlayer.prototype = OriginalPlayer.prototype;
        Object.setPrototypeOf(PatchedPlayer, OriginalPlayer);
        if (!wrapBrowserMethod(api, "Player", registerRestore, () => PatchedPlayer)) return;
        activeConstructor = PatchedPlayer;
        document.querySelectorAll("iframe").forEach(iframe => {
            try {
                const url = new URL(iframe.getAttribute("src"), window.location.origin);
                if (!/(^|\.)youtube(?:-nocookie)?\.com$/.test(url.hostname)) return;
                attachAdSkipper(api.get?.(iframe.id));
            } catch (err) { }
        });
    };

    return { patchYouTubeApiReady, patchYouTubePlayer };
}
