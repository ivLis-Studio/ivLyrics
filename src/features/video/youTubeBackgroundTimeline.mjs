import {
    VIDEO_SYNC_SEEK_THRESHOLD_SECONDS, VIDEO_DRIFT_SEEK_GRACE_MS,
    recordVideoDriftTarget, noteVideoDriftSeek, planVideoDriftCorrection, wrapVideoSyncTime,
} from "./videoDriftCorrection.mjs";

export function createYouTubeBackgroundTimeline({ isYouTubeAdPlaying }) {
    const syncYouTubePlayerTimeline = ({
        player,
        targetVideoTime,
        shouldHoldAtStart,
        shouldPlay,
        holdState,
        forceSeek = false,
        driftState = null,
        now = Date.now(),
    }) => {
        if (!player || !holdState) return;
        if (isYouTubeAdPlaying(player)) {
            // The public iframe timeline describes the music video during ads. Keep
            // ads muted/hidden, let them finish, then sync against Spotify again.
            if (shouldPlay) player.playVideo();
            else player.pauseVideo();
            return;
        }

        const wasHoldingAtStart = holdState.isHolding === true;
        holdState.isHolding = shouldHoldAtStart === true;

        const playerState = player.getPlayerState();
        if (shouldHoldAtStart) {
            const currentVideoTime = player.getCurrentTime();
            const isAtStart = Number.isFinite(currentVideoTime) &&
                Math.abs(currentVideoTime) <= VIDEO_SYNC_SEEK_THRESHOLD_SECONDS;
            if (!wasHoldingAtStart || (!holdState.primePending && !isAtStart)) {
                // A paused YouTube iframe can keep painting its previous decoded frame
                // after seekTo(0). Let it reach PLAYING once so the frame is refreshed;
                // onStateChange pauses it again as soon as that frame is available.
                holdState.primePending = true;
                player.seekTo(0, true);
                player.playVideo();
                return;
            }

            if (holdState.primePending) {
                // Buffering can outlast a sync tick. Pausing here would cancel the
                // refresh and leave the previous frame visible for the whole intro.
                if (!settleYouTubeHoldPrime({ player, playerState, holdState }) &&
                    playerState !== 1 && playerState !== 3) {
                    if (!isAtStart) player.seekTo(0, true);
                    player.playVideo();
                }
                return;
            }

            if (playerState === 1 || playerState === 3) {
                player.pauseVideo();
            }
            return;
        }

        holdState.primePending = false;
        const currentVideoTime = player.getCurrentTime();
        if (driftState) {
            if (forceSeek || wasHoldingAtStart) {
                // Leaving the held pre-roll lands exactly on the mapped position.
                recordVideoDriftTarget(driftState, targetVideoTime, now, shouldPlay);
                driftState.seekGraceMs = VIDEO_DRIFT_SEEK_GRACE_MS;
                noteVideoDriftSeek(driftState, now, shouldPlay, targetVideoTime);
                player.seekTo(targetVideoTime, true);
            } else {
                const correction = planVideoDriftCorrection(driftState, {
                    currentTime: currentVideoTime,
                    targetTime: targetVideoTime,
                    now,
                    isPlaying: shouldPlay,
                    isSteady: shouldPlay && playerState === 1,
                    // VideoBackgroundDepend turns a seek into a positioned reload (a
                    // muted-autoplay embed ignores seekTo), which blanks the picture
                    // for 0.3-0.9 s. Correcting a 0.2 s drift that way costs far more
                    // than the drift, and every such reload lags a little again.
                    allowSoftSeek: false,
                    reloadsOnSeek: true,
                    durationSeconds: Number(player.getDuration?.()) || 0,
                });
                if (correction.type === "seek") player.seekTo(wrapVideoSyncTime(correction.time, player.getDuration?.()), true);
            }
        } else if (
            forceSeek || wasHoldingAtStart ||
            !Number.isFinite(currentVideoTime) ||
            Math.abs(currentVideoTime - targetVideoTime) > VIDEO_SYNC_SEEK_THRESHOLD_SECONDS
        ) {
            player.seekTo(targetVideoTime, true);
        }

        if (!shouldPlay) {
            if (playerState === 1 || playerState === 3) {
                player.pauseVideo();
            }
        } else if (playerState !== 1 && playerState !== 3) {
            player.playVideo();
        }
    };

    const settleYouTubeHoldPrime = ({ player, playerState, holdState }) => {
        if (
            !player ||
            isYouTubeAdPlaying(player) ||
            playerState !== 1 ||
            holdState?.primePending !== true ||
            holdState?.isHolding !== true
        ) {
            return false;
        }

        // PLAYING may be queued from before seekTo(0). Wait until the player also
        // reports the start position, rather than freezing that stale frame again.
        const currentVideoTime = player.getCurrentTime();
        if (!Number.isFinite(currentVideoTime) ||
            Math.abs(currentVideoTime) > VIDEO_SYNC_SEEK_THRESHOLD_SECONDS) {
            return false;
        }

        holdState.primePending = false;
        player.pauseVideo();
        return true;
    };

    return { syncYouTubePlayerTimeline, settleYouTubeHoldPrime };
}

export const disableYouTubeCaptions = (player) => {
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
