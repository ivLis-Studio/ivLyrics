export function resolveSpotifyImageUrl(imageUrl) {
    if (!imageUrl || imageUrl.indexOf("localfile") !== -1) {
        return null;
    }
    if (imageUrl.startsWith("spotify:image:")) {
        return `https://i.scdn.co/image/${imageUrl.substring(imageUrl.lastIndexOf(":") + 1)}`;
    }
    if (imageUrl.startsWith("http")) {
        return imageUrl;
    }
    return null;
}

export function createOverlayPlaybackVisibility({ document, getVisualSettings, getStorageItem, isPlayerPlaying }) {
    function shouldHideOverlayForIvLyricsFullscreen() {
        const configuredValue = getVisualSettings()?.["fullscreen-hide-overlay"];
        const enabled = configuredValue !== undefined
            ? configuredValue !== false && configuredValue !== "false"
            : getStorageItem('ivLyrics:visual:fullscreen-hide-overlay') !== 'false';
        if (!enabled) return false;

        const fullscreenContainer = document.getElementById('lyrics-fullscreen-container');
        const portalActive = !!(
            fullscreenContainer &&
            document.body.contains(fullscreenContainer) &&
            fullscreenContainer.querySelector('.lyrics-lyricsContainer-LyricsContainer.fullscreen-active')
        );
        return portalActive || !!document.querySelector?.(
            '.lyrics-lyricsContainer-LyricsContainer.fullscreen-active.fullscreen-page-ui'
        );
    }

    function getOverlayProgressIsPlaying(snapshot) {
        const isPlaying = typeof snapshot?.isPlaying === 'boolean' ? snapshot.isPlaying : !!isPlayerPlaying();
        return isPlaying && !shouldHideOverlayForIvLyricsFullscreen();
    }

    return getOverlayProgressIsPlaying;
}
