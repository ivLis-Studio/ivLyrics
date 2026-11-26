import { isPlaybackLyricsTargetCurrent } from "../../core/playbackPositionService.mjs";
import { syncHelperBackgroundVideo } from "./helperBackgroundVideo.mjs";
import { resetVideoDriftState, wrapVideoSyncTime } from "./videoDriftCorrection.mjs";
import { disableYouTubeCaptions } from "./youTubeBackgroundTimeline.mjs";

const VIDEO_SYNC_INTERVAL_MS = 250;
const VIDEO_START_CHANGED = "ivLyrics:community-video-start-changed";

export function isVideoTrackCurrent(player, trackUri, snapshot) {
    return snapshot?.uri !== "" && isPlaybackLyricsTargetCurrent(snapshot, player?.data?.item?.uri, trackUri);
}

export function readVideoTrackPlayback(player, trackUri, snapshot) {
    const data = player?.data;
    const publicUri = data?.item?.uri;
    if (!isVideoTrackCurrent(player, trackUri, snapshot)) return null;
    const publicCurrent = !publicUri || publicUri === trackUri;
    const hasClockPosition = Number.isFinite(snapshot?.position);
    if (!hasClockPosition && !publicCurrent) return null;
    const paused = data?.is_paused ?? data?.isPaused;
    const publicPlaying = typeof paused === "boolean" ? !paused : (data?.is_playing ?? data?.isPlaying);
    return {
        position: hasClockPosition ? snapshot.position : player?.getProgress?.() ?? 0,
        isPlaying: typeof snapshot?.isPlaying === "boolean" ? snapshot.isPlaying
            : publicCurrent && (typeof publicPlaying === "boolean" ? publicPlaying : player?.isPlaying?.() === true),
    };
}

export function watchVideoBackgroundPlayback({
    host, spotifyPlayer, source, readFrame, readPlayer, timing, onPlayingChange = () => {},
    now = Date.now, schedule = setInterval, cancel = clearInterval,
}) {
    const { trackUri, videoId, useHelper, isVisible, isCurrent } = source;
    const { getVideoDriftState, holdState, lastCaptionDisableRef, syncYouTubePlayerTimeline } = timing;
    let active = true;
    let reportedPlaying;
    let suspended = false;

    function reportPlaying(playing) {
        if (reportedPlaying === playing) return;
        reportedPlaying = playing;
        onPlayingChange(playing);
    }

    function suspendPlayback(player) {
        reportPlaying(false);
        const wasSuspended = suspended;
        suspended = true;
        if (useHelper) {
            if (!player.paused) player.pause();
            return;
        }
        holdState.isHolding = false;
        holdState.primePending = false;
        // An iframe can finish buffering after the initial pause command.
        if (!wasSuspended || [1, 3].includes(player.getPlayerState())) player.pauseVideo();
    }

    function sync({ forceSeek = false, refreshCaptions = false, playbackOnly = false } = {}) {
        if (!active || !isCurrent()) return;
        const player = readPlayer();
        if (!player || (!useHelper && typeof player.getPlayerState !== "function")) {
            reportPlaying(false);
            return;
        }
        try {
            const frame = readFrame();
            if (!frame) {
                suspendPlayback(player);
                return;
            }
            const { syncState, isPlaying } = frame;
            if (!isPlaying) reportPlaying(false);
            const time = now();
            forceSeek ||= suspended;
            if (forceSeek) resetVideoDriftState(getVideoDriftState());
            if (useHelper) {
                syncHelperBackgroundVideo({
                    video: player, syncState, isPlaying, getVideoDriftState, forceSeek, playbackOnly, now: time,
                });
            } else {
                if (refreshCaptions && time - lastCaptionDisableRef.current > 5000 && [1, 3].includes(player.getPlayerState())) {
                    lastCaptionDisableRef.current = time;
                    disableYouTubeCaptions(player);
                }
                syncYouTubePlayerTimeline({
                    player, targetVideoTime: wrapVideoSyncTime(syncState.targetVideoTime, player.getDuration?.()),
                    shouldHoldAtStart: syncState.shouldHoldAtStart, shouldPlay: isPlaying,
                    holdState, driftState: getVideoDriftState(), forceSeek, now: time,
                });
            }
            suspended = false;
            reportPlaying(isPlaying);
        } catch {
            // A media element or iframe can enter a non-seekable state between samples.
        }
    }

    const tick = () => sync({ refreshCaptions: true });
    const onPlayback = () => sync({ playbackOnly: !isVisible });
    // The local player can follow small scrubs immediately. With the iframe,
    // seeking reloads the embed, so keep using its drift and buffering checks.
    const onSeek = () => sync({ forceSeek: useHelper });
    const onStartChange = (event) => {
        const detail = event?.detail;
        if (detail?.trackUri === trackUri && detail.youtubeVideoId === videoId) sync({ forceSeek: true });
    };
    spotifyPlayer?.addEventListener?.("onplaypause", onPlayback);
    spotifyPlayer?.addEventListener?.("songchange", onPlayback);
    spotifyPlayer?.addEventListener?.("onseek", onSeek);
    host.addEventListener(VIDEO_START_CHANGED, onStartChange);
    if (isVisible) tick();
    else onPlayback();
    const interval = isVisible ? schedule(tick, VIDEO_SYNC_INTERVAL_MS) : null;
    return () => {
        active = false;
        if (interval !== null) cancel(interval);
        spotifyPlayer?.removeEventListener?.("onplaypause", onPlayback);
        spotifyPlayer?.removeEventListener?.("songchange", onPlayback);
        spotifyPlayer?.removeEventListener?.("onseek", onSeek);
        host.removeEventListener(VIDEO_START_CHANGED, onStartChange);
    };
}
