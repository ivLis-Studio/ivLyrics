export function watchVideoBackgroundRefresh({
    host, player, trackUri, readPlaybackSnapshot, shouldRefreshOnReplay, readActiveVideo, refresh,
}) {
    const readPlayback = () => {
        const snapshot = readPlaybackSnapshot();
        const data = player?.data;
        const uri = snapshot?.uri ?? data?.item?.uri;
        if (!trackUri || uri !== trackUri || snapshot?.djNarration) return null;
        const publicPlayback = data?.item?.uri === uri ? data : null;
        return {
            playbackId: snapshot?.playbackId || publicPlayback?.playbackId,
            itemUid: snapshot?.item?.uid || publicPlayback?.item?.uid,
        };
    };
    let { playbackId, itemUid } = readPlayback() ?? {};

    function onSongChange(event) {
        const eventUri = event?.data?.item?.uri;
        if (eventUri && eventUri !== trackUri) return;
        const current = readPlayback();
        if (!current) return;
        const changed = playbackId && current.playbackId
            ? current.playbackId !== playbackId
            : itemUid && current.itemUid && current.itemUid !== itemUid;
        // If a new queue entry already identified this play, its ID can
        // arrive later without signifying an additional play.
        playbackId = current.playbackId || (changed ? undefined : playbackId);
        itemUid = current.itemUid || itemUid;
        if (changed && shouldRefreshOnReplay()) refresh();
    }

    function onHiddenVideo(event) {
        const { trackUri: hiddenUri, videoId } = event.detail ?? {};
        if (hiddenUri !== trackUri || !videoId) return;
        const active = readActiveVideo();
        if (active?.trackUri === trackUri && active.youtubeVideoId === videoId) refresh();
    }

    player?.addEventListener?.("songchange", onSongChange);
    host.addEventListener("ivLyrics:communityVideoRandomChanged", refresh);
    host.addEventListener("ivLyrics:communityVideoCurrentHidden", onHiddenVideo);
    return () => {
        player?.removeEventListener?.("songchange", onSongChange);
        host.removeEventListener("ivLyrics:communityVideoRandomChanged", refresh);
        host.removeEventListener("ivLyrics:communityVideoCurrentHidden", onHiddenVideo);
    };
}
