const YOUTUBE_RESOLUTIONS = {
    hd2160: '3840x2160', hd1440: '2560x1440',
    hd1080: '1920x1080', hd720: '1280x720',
    large: '854x480', medium: '640x360',
    small: '426x240', tiny: '256x144',
};

function readHelperStats(videoInfo, video, isPlayerReady, helperStatus) {
    const source = {
        videoId: videoInfo.youtubeVideoId || '-',
        videoHelper: 'Helper (Local)',
        helperStatus,
    };
    if (!isPlayerReady || !video) {
        return { quality: '-', resolution: '-', buffered: '-', ...source };
    }
    const buffered = video.buffered;
    const bufferedPercent = buffered.length > 0
        ? Math.round((buffered.end(buffered.length - 1) / video.duration) * 100)
        : 0;
    return {
        quality: 'local',
        resolution: `${video.videoWidth}x${video.videoHeight}`,
        buffered: `${bufferedPercent}%`,
        ...source,
    };
}

function readYouTubeStats(player) {
    if (typeof player?.getPlaybackQuality !== 'function') return null;
    const quality = player.getPlaybackQuality();
    const videoData = player.getVideoData();
    const videoLoadedFraction = player.getVideoLoadedFraction();
    return {
        quality: quality || '-',
        resolution: YOUTUBE_RESOLUTIONS[quality] || '-',
        buffered: `${Math.round(videoLoadedFraction * 100)}%`,
        videoId: videoData?.video_id || '-',
        videoHelper: 'YouTube (Iframe)',
        helperStatus: 'off',
    };
}

export function createVideoBackgroundDiagnostics({ react, host, document }) {
    const { useState, useCallback, useEffect } = react;

    function useVideoBackgroundDiagnosticsState() {
        const [stats, setStats] = useState({
            quality: '-',
            resolution: '-',
            buffered: '-',
            videoId: '-',
            videoHelper: '-',
            helperStatus: 'off',
        });
        const [helperStatus, setHelperStatus] = useState('off');
        const [showStats, setShowStats] = useState(false);
        const updateStats = useCallback((next) => {
            setStats((prev) => (
                prev.quality === next.quality &&
                prev.resolution === next.resolution &&
                prev.buffered === next.buffered &&
                prev.videoId === next.videoId &&
                prev.videoHelper === next.videoHelper &&
                prev.helperStatus === next.helperStatus
            ) ? prev : next);
        }, []);

        return { stats, showStats, setShowStats, helperStatus, setHelperStatus, updateStats };
    }

    function useVideoBackgroundDiagnostics({
        useHelper, videoInfo, videoRef, playerRef, isPlayerReady, isVisible, helperStatus, showStats, setShowStats, updateStats,
    }) {
        useEffect(() => {
            if (!showStats || !isVisible) return undefined;

            const refreshStats = () => {
                try {
                    const next = useHelper
                        ? videoInfo && readHelperStats(videoInfo, videoRef.current, isPlayerReady, helperStatus)
                        : isPlayerReady && readYouTubeStats(playerRef.current);
                    if (next) updateStats(next);
                } catch {
                    // An unavailable player or incomplete media metadata can be retried on the next tick.
                }
            };
            const interval = setInterval(refreshStats, 1000);
            refreshStats();
            return () => clearInterval(interval);
        }, [useHelper, isPlayerReady, isVisible, videoInfo, helperStatus, showStats, updateStats]);

        useEffect(() => {
            const handleKeyPress = (event) => {
                const activeElement = document.activeElement;
                const tagName = activeElement?.tagName?.toLowerCase();
                if (tagName === 'input' || tagName === 'textarea' || activeElement?.isContentEditable) return;
                if (event.repeat) return;
                if (event.shiftKey && event.code === 'KeyS') setShowStats(previous => !previous);
            };
            host.addEventListener('keydown', handleKeyPress);
            return () => host.removeEventListener('keydown', handleKeyPress);
        }, []);
    }

    return { useVideoBackgroundDiagnosticsState, useVideoBackgroundDiagnostics };
}
