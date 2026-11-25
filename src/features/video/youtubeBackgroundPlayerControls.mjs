import { wrapBrowserMethod } from "./browserPropertyPatch.mjs";

export function createYouTubeBackgroundPlayerControls({ document, registerRestore, forgetRestore }) {
    // The iframe API reports content time/duration even while an ad is playing.
    // Use forwarded ad events; seeking to getDuration() would skip the music video.
    const AD_STATE_CODES = new Set([105, 106, 107, 108, 109, 110, 111]);
    const ACTIVE_AD_STATES = new Set([1, 2, 3, 5]);
    const playerStates = new WeakMap();
    const getPlayerControlState = (player) => {
        if (!playerStates.has(player)) {
            const state = {
                adActive: false,
                adEventsInConfig: false,
                adCpn: null,
                mutedPlayback: false,
                mutedLoadOptions: null,
                mutedPlaybackIntent: null,
                cuePlayRequested: false,
                mutedLoadKind: "ById",
                pendingMutedSeek: null,
                requestedEndSeconds: 0,
                previewLimitTimers: new Set(),
                previewLimitGeneration: 0,
                previousMuted: null,
                hiddenIframe: null,
                previousOpacity: "",
                previousOpacityPriority: "",
                pendingSeek: null,
                restoreTimer: null,
                captionTimers: new Set(),
                wrappedMethods: new Map(),
                listeners: new Map(),
                disposed: false,
                cleanup: null,
            };
            playerStates.set(player, state);
            player.__ytAdControlState = state;
        }
        return playerStates.get(player);
    };

    const isAdPlayback = (player) => {
        if (!player) return false;
        if (playerStates.get(player)?.adActive) return true;
        try {
            if (typeof player.getAdState === "function" && player.getAdState() === 1) return true;
            return AD_STATE_CODES.has(player.getPlayerState?.());
        } catch (err) {
            return false;
        }
    };

    const restoreIframeOpacity = (state) => {
        const iframe = state.hiddenIframe;
        if (!iframe) return;
        // Leave a newer owner's style alone.
        if (iframe.style.getPropertyValue("opacity") === "0" &&
            iframe.style.getPropertyPriority("opacity") === "important") {
            if (state.previousOpacity) {
                iframe.style.setProperty("opacity", state.previousOpacity, state.previousOpacityPriority);
            } else {
                iframe.style.removeProperty("opacity");
            }
        }
        state.hiddenIframe = null;
    };

    // ivLyrics never plays YouTube audio: Spotify plays the song and the embed
    // is only a picture. Every patched player is created muted, so a "not
    // muted" reading is a race (an ad that starts before the initial mute
    // lands) or a muted-autoplay embed's own unmute click, never a choice to
    // keep. Restoring it after an ad switched the background's sound on by
    // itself; volume 0 also keeps an unmute inside the iframe silent.
    const keepPlayerSilent = (player) => {
        if (!player) return;
        try { if (player.isMuted?.() === false) player.mute?.(); } catch (err) { }
        try { if (Number(player.getVolume?.()) > 0) player.setVolume?.(0); } catch (err) { }
    };

    const restoreMutedState = (player, state) => {
        state.previousMuted = null;
        keepPlayerSilent(player);
    };

    const suppressAdPlayback = (player) => {
        const state = getPlayerControlState(player);
        if (state.disposed) return;
        if (state.restoreTimer !== null) {
            clearTimeout(state.restoreTimer);
            state.restoreTimer = null;
        }
        if (state.previousMuted === null) {
            try { state.previousMuted = player.isMuted?.() ?? null; } catch (err) { }
        }
        try { player.mute?.(); } catch (err) { }
        const iframe = player.getIframe?.();
        if (iframe?.style && state.hiddenIframe !== iframe) {
            restoreIframeOpacity(state);
            state.hiddenIframe = iframe;
            state.previousOpacity = iframe.style.getPropertyValue("opacity");
            state.previousOpacityPriority = iframe.style.getPropertyPriority("opacity");
        }
        // Opacity leaves the embed running so unskippable ads can finish. The
        // background's existing artwork/gradient layer stays visible underneath.
        if (state.hiddenIframe) state.hiddenIframe.style.setProperty("opacity", "0", "important");
        // Only use a real skip API when supplied by the player. The public iframe
        // API has no such method, nor does its seekTo() address the ad timeline.
        try { player.skipAd?.(); } catch (err) { }
    };

    const restoreNormalPlayback = (player) => {
        const state = getPlayerControlState(player);
        if (state.disposed || isAdPlayback(player)) return;
        const pendingSeek = state.pendingSeek;
        state.pendingSeek = null;
        if (pendingSeek) {
            try { player.seekTo?.(...pendingSeek); } catch (err) { }
        }
        if (!state.hiddenIframe && state.previousMuted === null) return;
        if (state.restoreTimer !== null) return;
        state.restoreTimer = setTimeout(() => {
            state.restoreTimer = null;
            if (state.disposed || isAdPlayback(player)) return;
            restoreMutedState(player, state);
            restoreIframeOpacity(state);
        }, 250);
    };

    const handleAdEvent = (player, name, event) => {
        if (!player) return;
        const state = getPlayerControlState(player);
        if (state.disposed) return;
        if (name === "onAdStart" ||
            (name === "onAdStateChange" && ACTIVE_AD_STATES.has(event?.data))) {
            state.adActive = true;
            if (name === "onAdStart") state.adCpn = typeof event?.data === "string" ? event.data : null;
            suppressAdPlayback(player);
        } else if (name === "onAdEnd" || name === "onAdStateChange" && event?.data === -1) {
            if (name === "onAdEnd" && state.adCpn && typeof event?.data === "string" &&
                state.adCpn !== event.data) return;
            state.adActive = false;
            state.adCpn = null;
            restoreNormalPlayback(player);
        }
    };

    const mutedVideoArgs = (method, args) => {
        const value = args[0];
        const key = method.endsWith("ByUrl") ? "mediaContentUrl" : "videoId";
        if (!value || typeof value !== "string" && typeof value !== "object") return null;
        const options = typeof value === "string"
            ? { [key]: value, startSeconds: args[1], suggestedQuality: args[2] }
            : { ...value };
        if (!options[key]) return null;
        options.playmuted = true;
        return options;
    };

    const seekMutedVideo = (player, state, target) => {
        const time = Number(target);
        if (!state.mutedLoadOptions || !Number.isFinite(time) || time < 0) return false;
        const now = Date.now();
        const pending = state.pendingMutedSeek;
        if (pending && now - pending.requestedAt < 5000) {
            const expected = pending.target + (pending.playing ? (now - pending.requestedAt) / 1000 : 0);
            if (Math.abs(time - expected) < 0.75) return true;
        }
        // Muted-autoplay embeds ignore seekTo. A positioned muted load preserves
        // the ad-free response. Coalesce sync ticks while that load is buffering.
        const playing = state.mutedPlaybackIntent ?? ![2, 5].includes(player.getPlayerState?.());
        const method = (playing ? "loadVideo" : "cueVideo") + state.mutedLoadKind;
        if (typeof player[method] !== "function") return false;
        const options = { ...state.mutedLoadOptions, startSeconds: time, playmuted: true };
        player[method](options);
        state.pendingMutedSeek = { target: time, requestedAt: now, playing };
        return true;
    };

    const applyMutedPlaybackIntent = (player, playerState) => {
        if (!player) return;
        const state = getPlayerControlState(player);
        if (state.disposed || !state.mutedPlayback || isAdPlayback(player)) return;
        // A play/pause sent during an asynchronous positioned cue can be ignored.
        // Reapply it once the new cue has actually arrived, without another load.
        if (state.mutedPlaybackIntent === true && playerState === 5 && !state.cuePlayRequested) {
            state.cuePlayRequested = true;
            player.playVideo?.();
        } else if (state.mutedPlaybackIntent === false && playerState === 1) {
            player.pauseVideo?.();
        }
    };

    const clearMutedPreviewTimers = (state) => {
        state.previewLimitGeneration++;
        state.previewLimitTimers.forEach(clearTimeout);
        state.previewLimitTimers.clear();
    };

    const scheduleMutedPreviewLimitRemoval = (player) => {
        if (!player) return;
        const state = getPlayerControlState(player);
        clearMutedPreviewTimers(state);
        if (state.disposed || !state.mutedPlayback || state.requestedEndSeconds > 0 ||
            isAdPlayback(player) || player.getPlayerState?.() !== 1 || typeof player.removeCueRange !== "function") return;
        const generation = state.previewLimitGeneration;
        // The embed does not consistently forward cue metadata. After PLAYING,
        // its unnamed muted-preview stop cue exists; removing it leaves the video
        // stream and named chapter/user cues unchanged. Never seek or reload here.
        for (const delay of [100, 500]) {
            const timer = setTimeout(() => {
                state.previewLimitTimers.delete(timer);
                if (state.disposed || generation !== state.previewLimitGeneration || !state.mutedPlayback ||
                    state.requestedEndSeconds > 0 || isAdPlayback(player) || player.getPlayerState?.() !== 1) return;
                try { player.removeCueRange(""); } catch (err) { }
            }, delay);
            state.previewLimitTimers.add(timer);
        }
    };

    const removeMutedPreviewLimit = (player, event) => {
        if (!player) return;
        const state = getPlayerControlState(player);
        if (state.disposed || !state.mutedPlayback || state.requestedEndSeconds > 0 || isAdPlayback(player)) return;
        // Muted autoplay carries an unnamed end cue (usually at 30 seconds).
        // Remove only this open-ended stop cue, preserving chapters and user cues.
        for (const range of Array.isArray(event?.data) ? event.data : []) {
            if (range?.id === "" && Number.isFinite(range.start) && range.start >= 0 && range.end === 0x7ffffffffffff) {
                try { player.removeCueRange?.(range.id); } catch (err) { }
            }
        }
    };

    const attachAdSkipper = (player, adEventsInConfig = false) => {
        if (!player) return;
        const state = getPlayerControlState(player);
        if (state.disposed) return;
        state.adEventsInConfig ||= adEventsInConfig;
        // Methods arrive with initialDelivery, after YT.Player returns. Revisit
        // them onReady instead of marking an incomplete instance as fully wrapped.
        for (const method of ["seekTo", "loadVideoById", "cueVideoById", "loadVideoByUrl", "cueVideoByUrl", "loadPlaylist", "cuePlaylist", "playVideo", "pauseVideo"]) {
            if (state.wrappedMethods.has(method)) continue;
            const registerMethodRestore = (_descriptor, restore) => state.wrappedMethods.set(method, restore);
            wrapBrowserMethod(player, method, registerMethodRestore, original => function (...args) {
                if (state.disposed) return original.apply(this, args);
                if (method === "playVideo" || method === "pauseVideo") {
                    state.mutedPlaybackIntent = method === "playVideo";
                    if (method === "pauseVideo") state.cuePlayRequested = false;
                    return original.apply(this, args);
                }
                if (method === "seekTo" && isAdPlayback(player)) {
                    state.pendingSeek = args;
                    return undefined;
                }
                if (method === "seekTo" && state.mutedPlayback && seekMutedVideo(player, state, args[0])) return undefined;
                if (method !== "seekTo") {
                    clearMutedPreviewTimers(state);
                    state.pendingMutedSeek = null;
                    state.adActive = false;
                    state.adCpn = null;
                    state.pendingSeek = null;
                    if (state.restoreTimer !== null) clearTimeout(state.restoreTimer);
                    state.restoreTimer = null;
                    restoreMutedState(player, state);
                    restoreIframeOpacity(state);
                    const options = method.endsWith("ById") || method.endsWith("ByUrl") ? mutedVideoArgs(method, args) : null;
                    state.mutedPlayback = Boolean(options);
                    state.mutedLoadOptions = options;
                    state.mutedPlaybackIntent = options ? method.startsWith("load") : null;
                    state.cuePlayRequested = false;
                    state.mutedLoadKind = method.endsWith("ByUrl") ? "ByUrl" : "ById";
                    state.requestedEndSeconds = Number(options?.endSeconds) || 0;
                    if (options) {
                        player.mute?.();
                        return original.call(this, options);
                    }
                }
                return original.apply(this, args);
            });
        }
        if (state.cleanup) return;
        player.__ytAdSkipperAttached = true;
        const listen = (name, callback) => {
            if (typeof player.addEventListener !== "function") return;
            player.addEventListener(name, callback);
            state.listeners.set(name, callback);
        };
        // Cover players constructed before our API patch (the iframe API ready
        // callback can create a background before our retry timer runs).
        if (!state.adEventsInConfig) {
            listen("onCueRangesAdded", event => removeMutedPreviewLimit(player, event));
            for (const name of ["onAdStart", "onAdEnd", "onAdStateChange"]) {
                listen(name, event => handleAdEvent(player, name, event));
            }
        }
        listen("onStateChange", event => {
            if (state.disposed) return;
            keepPlayerSilent(player);
            applyMutedPlaybackIntent(player, event?.data);
            scheduleMutedPreviewLimitRemoval(player);
            if (isAdPlayback(player)) suppressAdPlayback(player);
            else restoreNormalPlayback(player);
        });
        listen("onError", () => {
            state.adActive = false;
            state.adCpn = null;
            state.pendingSeek = null;
            restoreNormalPlayback(player);
        });
        const pollTimer = setInterval(() => {
            if (state.disposed) return;
            const iframe = player.getIframe?.();
            if (!iframe || !document.body.contains(iframe)) {
                state.cleanup();
                return;
            }
            attachAdSkipper(player);
            keepPlayerSilent(player);
            if (isAdPlayback(player)) suppressAdPlayback(player);
            else restoreNormalPlayback(player);
        }, 400);
        const cleanup = (destroying = false) => {
            if (state.disposed) return;
            state.disposed = true;
            clearInterval(pollTimer);
            if (state.restoreTimer !== null) clearTimeout(state.restoreTimer);
            clearMutedPreviewTimers(state);
            state.captionTimers.forEach(clearTimeout);
            state.captionTimers.clear();
            state.listeners.forEach((callback, name) => {
                try { player.removeEventListener?.(name, callback); } catch (err) { }
            });
            state.wrappedMethods.forEach(restore => restore());
            state.wrappedMethods.clear();
            if (!destroying) restoreMutedState(player, state);
            restoreIframeOpacity(state);
            state.adActive = false;
            state.pendingSeek = null;
            state.pendingMutedSeek = null;
            state.mutedLoadOptions = null;
            delete player.__ytAdSkipperAttached;
            forgetRestore(player);
        };
        state.cleanup = cleanup;
        wrapBrowserMethod(player, "destroy", (_descriptor, restore) => state.wrappedMethods.set("destroy", restore),
            original => function (...args) {
                cleanup(true);
                return original.apply(this, args);
            });
        registerRestore(player, cleanup);
    };

    const disableYouTubeCaptions = (player) => {
        if (!player) return;

        try {
            if (typeof player.unloadModule === "function") {
                player.unloadModule("captions");
                player.unloadModule("cc");
            }
        } catch (e) { }

        try {
            if (typeof player.setOption === "function") {
                player.setOption("captions", "track", {});
                player.setOption("cc", "track", {});
            }
        } catch (e) { }
    };

    const scheduleCaptionDisable = (player) => {
        if (!player) return;
        const state = getPlayerControlState(player);
        if (state.disposed) return;
        disableYouTubeCaptions(player);
        [250, 1000, 2500].forEach((delay) => {
            const timer = setTimeout(() => {
                state.captionTimers.delete(timer);
                if (!state.disposed) disableYouTubeCaptions(player);
            }, delay);
            state.captionTimers.add(timer);
        });
    };

    return {
        getPlayerControlState, isAdPlayback, attachAdSkipper, handleAdEvent, removeMutedPreviewLimit,
        scheduleMutedPreviewLimitRemoval, applyMutedPlaybackIntent, disableYouTubeCaptions, scheduleCaptionDisable,
    };
}
