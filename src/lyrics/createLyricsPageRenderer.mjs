import {
    KARAOKE, SYNCED, UNSYNCED, WORD_KARAOKE, getKaraokeRenderGranularity,
} from "./lyricsRenderModes.mjs";

const EMPTY_LYRICS = Object.freeze([]);

export function createLyricsPageRenderer({
    react, readCompactMode, getMarketplacePage, CreditFooter, LyricsUnavailableView,
    SyncedLyricsPage, SyncedExpandedLyricsPage, UnsyncedLyricsPage, SyncedLyricsPlaybackTracker,
}) {
    return react.memo(function LyricsPageRenderer(props) {
        const {
            playbackOnly = false,
            mode = -1,
            karaokeMode = KARAOKE,
            wordMode = WORD_KARAOKE,
            syncedMode = SYNCED,
            unsyncedMode = UNSYNCED,
            trackUri = "",
            currentLyrics = EMPTY_LYRICS,
            karaoke = null,
            karaokeSource = null,
            synced = null,
            unsynced = null,
            provider = null,
            contributors = null,
            syncType = null,
            syncPoints = null,
            isLoading = false,
            showMarketplace = false,
            marketplaceComponent = Object.hasOwn(props, "marketplaceComponent") ? null : getMarketplacePage(),
            onCloseMarketplace = null,
            reRenderLyricsPage = null,
            trackRevealKey = null,
        } = props;

        const sharedLyrics = Array.isArray(currentLyrics) ? currentLyrics : EMPTY_LYRICS;
        const pageProps = { trackUri, lyrics: sharedLyrics, reRenderLyricsPage, trackRevealKey };
        let content = null;
        if (showMarketplace && marketplaceComponent) {
            content = react.createElement(marketplaceComponent, { onClose: onCloseMarketplace });
        } else if ((mode === karaokeMode || mode === wordMode) && karaoke) {
            const karaokeLyrics = !Array.isArray(currentLyrics) && Array.isArray(karaoke) ? karaoke : sharedLyrics;
            content = react.createElement(playbackOnly ? SyncedLyricsPlaybackTracker : SyncedLyricsPage, {
                ...pageProps,
                lyrics: karaokeLyrics,
                isKara: true,
                karaokeSource,
                karaokeRenderGranularity: getKaraokeRenderGranularity(mode, karaokeMode, wordMode),
            });
        } else if (mode === syncedMode && synced) {
            const component = playbackOnly ? SyncedLyricsPlaybackTracker
                : readCompactMode() ? SyncedLyricsPage : SyncedExpandedLyricsPage;
            content = react.createElement(component, pageProps);
        } else if (!playbackOnly) {
            content = mode === unsyncedMode && unsynced
                ? react.createElement(UnsyncedLyricsPage, pageProps)
                : react.createElement(LyricsUnavailableView, { isLoading });
        }

        if (playbackOnly && !showMarketplace) return content;
        return react.createElement(
            react.Fragment,
            null,
            content,
            react.createElement(CreditFooter, { provider, contributors, syncType, syncPoints })
        );
    });
}
