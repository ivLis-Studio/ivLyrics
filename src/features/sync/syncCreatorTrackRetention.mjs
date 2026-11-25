import { readSyncCreatorDuration, readSyncCreatorPosition } from "./syncCreatorSeek.mjs";

const PLAYBACK_CHECK_INTERVAL_MS = 200;
const PLAYBACK_RETRY_INTERVAL_MS = 1000;
const LOOP_MARGIN_MS = 250;

export function watchSyncCreatorTrackRetention({
    trackUri, getPlayer, keepsTrack,
    scheduleInterval = setInterval, cancelInterval = clearInterval, now = Date.now,
}) {
    if (!trackUri) return () => {};

    let disposed = false;
    let boundPlayer;
    let removeSongChange;
    let ownsPlayback = false;
    let restoredAt = null;
    let soughtAt = null;

    function attempt(action) {
        try {
            Promise.resolve(action()).catch(() => {});
        } catch {
            // The player can be unavailable during a transition. Poll again.
        }
    }

    function reconcile(player, checkProgress) {
        if (!keepsTrack()) {
            ownsPlayback = false;
            restoredAt = null;
            soughtAt = null;
            return;
        }
        const item = player?.data?.item;
        if (!item?.uri) return;
        if (item.uri !== trackUri) {
            // Opening an editor for a different song must not itself
            // interrupt playback. Continue after a songchange or a match.
            if (checkProgress && !ownsPlayback) return;
            ownsPlayback = true;
            soughtAt = null;
            if (typeof player.playUri !== "function") return;
            const time = now();
            if (restoredAt !== null && time - restoredAt < PLAYBACK_RETRY_INTERVAL_MS) return;
            restoredAt = time;
            attempt(() => player.playUri(trackUri));
            return;
        }

        ownsPlayback = true;
        restoredAt = null;
        if (!checkProgress || typeof player.seek !== "function") return;
        const duration = readSyncCreatorPosition(item.duration?.milliseconds) || readSyncCreatorDuration(player);
        const position = readSyncCreatorPosition(player.getProgress?.());
        if (!duration || position === null) return;
        if (position < duration - LOOP_MARGIN_MS) {
            soughtAt = null;
            return;
        }
        const time = now();
        if (soughtAt !== null && time - soughtAt < PLAYBACK_RETRY_INTERVAL_MS) return;
        soughtAt = time;
        attempt(() => player.seek(0));
    }

    function bindPlayer(player) {
        if (boundPlayer === player) return;
        removeSongChange?.();
        boundPlayer = player;
        restoredAt = null;
        soughtAt = null;
        removeSongChange = undefined;
        if (typeof player?.addEventListener !== "function") return;
        const onSongChange = () => {
            if (!disposed && boundPlayer === player && getPlayer() === player) reconcile(player, false);
        };
        player.addEventListener("songchange", onSongChange);
        removeSongChange = () => player.removeEventListener?.("songchange", onSongChange);
    }

    bindPlayer(getPlayer());
    const timer = scheduleInterval(() => {
        if (disposed) return;
        const player = getPlayer();
        bindPlayer(player);
        // Spotify may announce a change before Player.data contains the new item.
        reconcile(player, true);
    }, PLAYBACK_CHECK_INTERVAL_MS);
    return () => {
        disposed = true;
        cancelInterval(timer);
        removeSongChange?.();
    };
}
