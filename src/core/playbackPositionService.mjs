import { createSpotifyPlaybackClock, resolveStablePlayerItem } from "./PlaybackClock.js";
import { getRuntimeService, publishRuntimeService } from "../spicetify/runtimeServices.mjs";

const GUARD_KEY = "__ivLyricsPlaybackProgressGuard";
const GUARD_VERSION = 3;
const SERVICE_KEY = "ivLyricsPlaybackPosition";

// The custom app and its startup extension share a single guarded clock.
export function getPlaybackPositionService(host) {
    return getRuntimeService(SERVICE_KEY, host) ?? getRuntimeService("Utils", host);
}

export function isPlaybackLyricsTargetCurrent(snapshot, fallbackUri, uri, isNarration = false) {
    if (!uri || (snapshot && (snapshot.djNarration === true) !== isNarration)) return false;
    const currentUri = snapshot?.uri || fallbackUri;
    return !currentUri || currentUri === uri;
}

export function getPlayableLyricsUri(snapshot, fallbackUri) {
    return snapshot?.djNarration === true ? null : (snapshot?.uri ?? fallbackUri) || null;
}

export function installPlaybackPositionService(host, spicetify, onError) {
    const getGuard = () => {
        const existing = host[GUARD_KEY];
        if (existing?.version === GUARD_VERSION) return existing;
        existing?.destroy?.();

        const clock = createSpotifyPlaybackClock(spicetify, { onError });
        const guard = {
            version: GUARD_VERSION,
            initialized: false,
            songChangeListener: null,
            playbackClock: clock,
            ensureInitialized() {
                if (this.initialized || typeof spicetify.Player?.addEventListener !== "function") return;
                this.initialized = true;
                this.songChangeListener = () => clock.handleSongChange();
                spicetify.Player.addEventListener("songchange", this.songChangeListener);
                clock.start();
            },
            clearCorrection() {
                clock.invalidate();
            },
            getAdjustedProgress() {
                this.ensureInitialized();
                return clock.getProgress();
            },
            getSnapshot() {
                this.ensureInitialized();
                return clock.getSnapshot();
            },
            destroy() {
                if (this.songChangeListener) spicetify.Player?.removeEventListener?.("songchange", this.songChangeListener);
                this.songChangeListener = null;
                clock.destroy();
                this.initialized = false;
            },
        };

        // Older visualizers and add-ons recognize this guard during a hot reload.
        host[GUARD_KEY] = guard;
        return guard;
    };

    return publishRuntimeService(SERVICE_KEY, {
        getSafePlayerProgress: () => getGuard().getAdjustedProgress(),
        getPlayerPlaybackSnapshot: () => getGuard().getSnapshot(),
        isSpotifyAutomixPlayback: () => getGuard().getSnapshot().automix === true,
        isSpotifyDjNarrationPlayback: () => getGuard().getSnapshot().djNarration === true,
        resolveStablePlaybackTrack(candidateItem = null, snapshot = null) {
            return resolveStablePlayerItem(spicetify.Player?.data || null, snapshot || getGuard().getSnapshot(), candidateItem);
        },
        clearSafePlayerProgressCorrection: () => getGuard().clearCorrection(),
    }, host);
}
