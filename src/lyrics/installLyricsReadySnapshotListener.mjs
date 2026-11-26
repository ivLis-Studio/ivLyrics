import { isLyricsReadySnapshotHandled } from "./lyricsReadyPublisher.mjs";
import { readLyricPresentationContext } from "./lyricPresentationContext.mjs";

export function installLyricsReadySnapshotListener(host, publishSnapshot) {
    if (host.__ivLyricsSnapshotReadyListener) {
        host.removeEventListener('ivLyrics:lyrics-ready', host.__ivLyricsSnapshotReadyListener);
    }
    host.__ivLyricsSnapshotReadyListener = (event) => {
        if (isLyricsReadySnapshotHandled(event)) return;
        const detail = event.detail || {};
        const trackUri = detail.trackInfo?.uri || detail.trackUri;
        if (!trackUri || !Array.isArray(detail.lyrics)) return;

        publishSnapshot({
            ...readLyricPresentationContext(detail),
            trackUri,
            trackInfo: detail.trackInfo || { uri: trackUri },
            displayLyrics: detail.lyrics,
            detectedLanguage: detail.detectedLanguage ?? undefined,
            source: 'ivlyrics-page'
        });
    };
    host.addEventListener('ivLyrics:lyrics-ready', host.__ivLyricsSnapshotReadyListener);
}
