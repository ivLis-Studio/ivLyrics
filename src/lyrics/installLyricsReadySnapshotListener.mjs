import { isLyricsReadySnapshotHandled } from "./lyricsReadyPublisher.mjs";

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
            trackUri,
            trackInfo: detail.trackInfo || { uri: trackUri },
            displayLyrics: detail.lyrics,
            provider: detail.provider,
            karaokeSource: detail.karaokeSource,
            lyricsType: detail.lyricsType,
            playbackPreferences: detail.playbackPreferences,
            displayMode1: detail.displayMode1,
            displayMode2: detail.displayMode2,
            pronunciationNotation: detail.pronunciationNotation,
            detectedLanguage: detail.detectedLanguage ?? undefined,
            translationTargetLanguage: detail.translationTargetLanguage,
            translationStyle: detail.translationStyle,
            translationSourceText: detail.translationSourceText,
            presentationComplete: detail.presentationComplete,
            source: 'ivlyrics-page'
        });
    };
    host.addEventListener('ivLyrics:lyrics-ready', host.__ivLyricsSnapshotReadyListener);
}
