import {
    readActiveCommunityVideo, readActiveCommunityVideoOwner,
    writeActiveCommunityVideo, writeActiveCommunityVideoOwner,
} from "./videoSyncRuntimeState.mjs";

export function publishVideoBackground({ host, owner, trackUri, videoInfo, isPlayerReady, notifyChange }) {
    writeActiveCommunityVideoOwner(host, owner);
    writeActiveCommunityVideo(host, videoInfo?.youtubeVideoId
        ? { ...videoInfo, trackUri, playerReady: isPlayerReady === true }
        : null);
    notifyChange(trackUri);
}

export function updateVideoBackgroundReadiness({
    host, owner, trackUri, videoInfo, isPlayerReady, readDuration, notifyChange,
}) {
    const current = readActiveCommunityVideo(host);
    if (readActiveCommunityVideoOwner(host) !== owner ||
        current?.trackUri !== trackUri || current.youtubeVideoId !== videoInfo?.youtubeVideoId) return;

    let durationSeconds = 0;
    try {
        durationSeconds = Number(readDuration()) || 0;
    } catch {}
    if (current.playerReady === isPlayerReady &&
        (!(durationSeconds > 0) || current.videoDurationSeconds === durationSeconds)) return;

    // Keep the live anchor if it changed after the current source was loaded.
    writeActiveCommunityVideo(host, {
        ...current,
        playerReady: isPlayerReady === true,
        ...(durationSeconds > 0 ? { videoDurationSeconds: durationSeconds } : {}),
    });
    notifyChange(trackUri);
}

export function clearVideoBackground({ host, owner, trackUri, notifyChange }) {
    if (readActiveCommunityVideoOwner(host) !== owner) return;
    const outgoingTrackUri = readActiveCommunityVideo(host)?.trackUri || trackUri;
    writeActiveCommunityVideo(host, null);
    writeActiveCommunityVideoOwner(host, null);
    notifyChange(outgoingTrackUri);
}
