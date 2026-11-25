import {
    getActiveTimedLineIndex, getSyncedLeadingEmptyLineCount, prepareSyncedLineStartIndex,
} from "./lyricPlaybackTimeline.mjs";

export function createSyncedLyricsPlaybackTracker({
    react, readCompactMode, getPseudoKaraokeRenderAdvance, useLyricsPlaybackObserver, publishLyricIndex,
}) {
    const { useMemo, useRef, useCallback } = react;

    return react.memo(function SyncedLyricsPlaybackTracker({ lyrics, trackUri, isKara = false, karaokeSource = null }) {
        const renderAdvance = isKara ? getPseudoKaraokeRenderAdvance(karaokeSource) : 0;
        const leadingEmptyLines = getSyncedLeadingEmptyLineCount(isKara || readCompactMode());
        const lineStartIndex = useMemo(
            () => prepareSyncedLineStartIndex(lyrics, leadingEmptyLines),
            [lyrics, leadingEmptyLines]
        );
        const lastNotification = useRef(null);
        const total = lyrics.length;
        const observe = useCallback(position => {
            const activeLineIndex = getActiveTimedLineIndex(lyrics, position + renderAdvance, lineStartIndex);
            const previous = lastNotification.current;
            if (previous?.activeLineIndex === activeLineIndex
                && previous.leadingEmptyLines === leadingEmptyLines && previous.total === total && previous.trackUri === trackUri) return;
            lastNotification.current = { activeLineIndex, leadingEmptyLines, total, trackUri };
            publishLyricIndex(activeLineIndex, leadingEmptyLines, total);
        }, [lyrics, lineStartIndex, renderAdvance, leadingEmptyLines, total, trackUri]);
        useLyricsPlaybackObserver(observe, trackUri || undefined);
        return null;
    });
}
