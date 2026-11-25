import {
    noteVideoDriftSeek, planVideoDriftCorrection, recordVideoDriftTarget, wrapVideoSyncTime,
} from "./videoDriftCorrection.mjs";
import { watchVideoReadinessDeadline } from "./videoReadinessDeadline.mjs";

const PLAYBACK_FRAME_RETRY_MS = 250;

export function startHelperBackgroundVideo({
    video, url, document = video.ownerDocument, readFrame, setIsPlayerReady, reportVideoBackgroundStatus,
    showError, debug, isCurrent = () => true, schedule = setTimeout, cancel = clearTimeout, now = Date.now,
}) {
    let playbackFrameRetry = null;
    let initialized = false;
    let active = true;
    video.src = url;
    video.muted = true;
    video.loop = false;

    const stopFrameRetry = () => {
        document?.removeEventListener?.("visibilitychange", retryWhenVisible);
        if (playbackFrameRetry !== null) cancel(playbackFrameRetry);
        playbackFrameRetry = null;
    };

    const initializePlayback = () => {
        if (!active || initialized || !isCurrent()) return;
        const frame = readFrame();
        if (!frame) {
            // The video can buffer before Spotify publishes the matching track's position.
            if (document?.hidden) {
                document.addEventListener("visibilitychange", retryWhenVisible);
            } else {
                playbackFrameRetry = schedule(() => {
                    playbackFrameRetry = null;
                    initializePlayback();
                }, PLAYBACK_FRAME_RETRY_MS);
            }
            return;
        }
        initialized = true;
        stopFrameRetry();
        stopReadinessDeadline();
        // 영상이 준비되면 즉시 현재 Spotify 위치로 동기화
        const { syncState: readySyncState, isPlaying } = frame;
        if (readySyncState) {
            const targetVideoTime = wrapVideoSyncTime(readySyncState.targetVideoTime, video.duration);

            if (
                (!Number.isFinite(video.currentTime) || Math.abs(video.currentTime - targetVideoTime) > 0.05)
            ) {
                video.currentTime = targetVideoTime;
            }

            if (readySyncState.shouldHoldAtStart && !video.paused) {
                video.pause();
            }
        }

        setIsPlayerReady(true);
        reportVideoBackgroundStatus("complete");
        if (isPlaying && !readySyncState?.shouldHoldAtStart) {
            video.play().catch(() => { });
        } else if (!video.paused) {
            video.pause();
        }
    };

    function retryWhenVisible() {
        if (document.hidden) return;
        document.removeEventListener("visibilitychange", retryWhenVisible);
        initializePlayback();
    }

    const handleCanPlay = () => {
        video.removeEventListener('canplay', handleCanPlay);
        initializePlayback();
    };

    const handleError = (e) => {
        if (!active || !isCurrent()) return;
        console.error("[VideoBackground] Helper video error:", e, "src:", video.src);
        stop();
        setIsPlayerReady(false);
        showError();
    };

    const handleLoadStart = () => {
        debug("[VideoBackground] Video loadstart");
    };
    const handleLoadedMetadata = () => {
        debug("[VideoBackground] Video loadedmetadata, duration:", video.duration);
    };

    const stop = () => {
        if (!active) return;
        active = false;
        stopFrameRetry();
        stopReadinessDeadline();
        video.removeEventListener('canplay', handleCanPlay);
        video.removeEventListener('error', handleError);
        video.removeEventListener('loadstart', handleLoadStart);
        video.removeEventListener('loadedmetadata', handleLoadedMetadata);
        video.pause();
        video.removeAttribute('src');
        video.load();
    };

    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('error', handleError);
    video.addEventListener('loadstart', handleLoadStart);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);

    const stopReadinessDeadline = watchVideoReadinessDeadline({
        document, schedule, cancel, now,
        onTimeout() {
            if (!active || !isCurrent()) return;
            stop();
            setIsPlayerReady(false);
            showError();
        },
    });

    video.load();
    return stop;
}

export function syncHelperBackgroundVideo({
    video, syncState, isPlaying, getVideoDriftState, forceSeek = false, playbackOnly = false, now = Date.now(),
}) {
    const targetVideoTime = wrapVideoSyncTime(syncState.targetVideoTime, video.duration);
    const shouldPlayVideo = isPlaying && !syncState.shouldHoldAtStart;
    if (forceSeek) {
        video.playbackRate = 1;
        if (video.currentTime !== targetVideoTime) video.currentTime = targetVideoTime;
        if (video.seeking) {
            const driftState = getVideoDriftState();
            recordVideoDriftTarget(driftState, targetVideoTime, now, shouldPlayVideo, video.duration);
            noteVideoDriftSeek(driftState, now, false, targetVideoTime);
        }
    } else if (!playbackOnly) {
        // Local files can ease small drift out with the playback rate.
        const correction = planVideoDriftCorrection(getVideoDriftState(), {
            currentTime: video.currentTime, targetTime: targetVideoTime, now,
            isPlaying: shouldPlayVideo,
            isSteady: shouldPlayVideo && !video.paused && !video.seeking && video.readyState >= 3,
            canAdjustRate: true,
            durationSeconds: video.duration,
        });
        if (correction.type === "seek") {
            video.currentTime = wrapVideoSyncTime(correction.time, video.duration);
            video.playbackRate = 1;
        } else if (correction.type === "rate" && video.playbackRate !== correction.rate) {
            video.playbackRate = correction.rate;
        }
    }

    if (!shouldPlayVideo) {
        if (!video.paused) {
            video.pause();
        }
    } else if (video.paused) {
        video.play().catch(() => { });
    }
}
