import { observeActiveKaraokeVocalRows } from "./activeKaraokeVocalRows.mjs";

export function createSyncedLyricsPages({
    react, translate, readInterfaceLanguage, readKaraokeLineTransition, prefersReducedLyricsMotion,
    useLyricsPlaybackPosition, getFrameAlignedLyricsPlaybackPosition, getPseudoKaraokeRenderAdvance,
    useSyncedLyricsEngine, renderLyricsItems, useLyricsTrackReveal, renderLyricsUnavailable,
    LyricsBackdropLayer, SearchBar,
}) {
    const { useCallback, useEffect, useMemo, useRef, useState } = react;

    function useKaraokeLiveClock(isKara, renderAdvance) {
        const advanceRef = useRef(0);
        advanceRef.current = renderAdvance;
        const enabled = isKara && !prefersReducedLyricsMotion();
        // Read the current offset at frame time without invalidating memoized rows.
        return useMemo(() => enabled ? {
            getPosition: frameTime => getFrameAlignedLyricsPlaybackPosition(frameTime) + advanceRef.current,
        } : null, [enabled]);
    }

    function useSyncedPage({
        lyrics, trackUri, isKara, karaokeSource, karaokeRenderGranularity,
        reRenderLyricsPage, trackRevealKey,
    }, { compact, activeLineRef, attachActiveLine, anchorRevision }) {
        // Geometry uses the committed ref. State keeps observers attached to the current host.
        const pageRef = useRef(null);
        const [container, setContainer] = useState(null);
        const attachContainer = useCallback(node => {
            pageRef.current = node;
            setContainer(node);
        }, []);

        const position = useLyricsPlaybackPosition(trackUri || undefined);
        const advance = isKara ? getPseudoKaraokeRenderAdvance(karaokeSource) : 0;
        const karaokePosition = isKara ? position + advance : position;
        const liveClock = useKaraokeLiveClock(isKara, advance);
        const transitionClass = isKara && readKaraokeLineTransition() ? " karaoke-line-transition-enabled" : "";
        const lyricsId = trackUri || lyrics[0]?.originalText || lyrics[0]?.text || "no-lyrics";
        const { isScrolling, handleContainerClick, renderItems, compactOffset } = useSyncedLyricsEngine({
            lyrics,
            position: karaokePosition,
            compact,
            isKara,
            containerRef: pageRef,
            container,
            activeLineRef,
            lyricsId,
            settingsRevision: reRenderLyricsPage,
            anchorRevision,
        });
        useEffect(() => compact && isKara ? observeActiveKaraokeVocalRows(container) : undefined, [compact, isKara, container]);
        const itemPosition = isKara ? karaokePosition : 0;
        const renderCache = useMemo(() => ({ elementsByItem: new WeakMap() }), [lyricsId]);
        const renderedItems = useMemo(() => renderLyricsItems({
            items: renderItems,
            isKara,
            karaokeRenderGranularity,
            position: itemPosition,
            liveClock,
            activeLineRef: attachActiveLine,
            settingsRevision: reRenderLyricsPage,
            cache: renderCache,
        }), [renderItems, isKara, karaokeRenderGranularity, itemPosition, liveClock, attachActiveLine, reRenderLyricsPage, renderCache]);
        const hasLyrics = Array.isArray(lyrics) && lyrics.length > 0;
        useLyricsTrackReveal(pageRef, trackRevealKey, hasLyrics);
        return {
            pageRef, attachContainer, lyricsId, isScrolling, handleContainerClick, renderedItems, compactOffset, transitionClass, hasLyrics,
        };
    }

    const SyncedLyricsPage = react.memo(function SyncedLyricsPage({
        lyrics = [], trackUri = "", isKara, karaokeSource = null, karaokeRenderGranularity = null,
        reRenderLyricsPage = null, trackRevealKey = null,
    }) {
        const activeLineRef = useRef(null);
        const [anchorRevision, setAnchorRevision] = useState(0);
        const attachActiveLine = useCallback(node => {
            if (activeLineRef.current === node) return;
            activeLineRef.current = node;
            if (node) setAnchorRevision(revision => revision + 1);
        }, []);
        const page = useSyncedPage({
            lyrics, trackUri, isKara, karaokeSource, karaokeRenderGranularity, reRenderLyricsPage, trackRevealKey,
        }, { compact: true, activeLineRef, attachActiveLine, anchorRevision });
        const className = "lyrics-lyricsContainer-SyncedLyricsPage";
        const labelLanguage = page.hasLyrics ? readInterfaceLanguage?.() : null;
        const localizedLabel = useMemo(() => labelLanguage ? translate("lyricsTitle") : null,
            [labelLanguage, reRenderLyricsPage]);
        if (!page.hasLyrics) return react.createElement("div", { className }, renderLyricsUnavailable(translate("messages.noLyrics")));
        return react.createElement(
            "div",
            {
                className: `${className}${isKara ? " is-karaoke" : ""}${page.transitionClass}${page.isScrolling ? " scrolling-active" : ""}`,
                ref: page.attachContainer,
                onClick: page.handleContainerClick,
                tabIndex: 0,
                role: "region",
                "aria-label": (localizedLabel ?? translate("lyricsTitle")) || "Synced lyrics",
            },
            react.createElement("div", {
                className: "lyrics-lyricsContainer-SyncedLyrics",
                // Rows carry --offset. Keep the inspected viewport offset separate from styling.
                "data-compact-offset": page.compactOffset,
                key: page.lyricsId,
            }, ...page.renderedItems),
            react.createElement(LyricsBackdropLayer, null)
        );
    });

    const SyncedExpandedLyricsPage = react.memo(function SyncedExpandedLyricsPage({
        lyrics = [], trackUri = "", isKara, karaokeSource = null, reRenderLyricsPage = null, trackRevealKey = null,
    }) {
        const activeLineRef = useRef(null);
        const page = useSyncedPage({
            lyrics, trackUri, isKara, karaokeSource, reRenderLyricsPage, trackRevealKey,
        }, { compact: false, activeLineRef, attachActiveLine: activeLineRef });
        const className = "lyrics-lyricsContainer-UnsyncedLyricsPage";
        if (!page.hasLyrics) return react.createElement("div", { className }, renderLyricsUnavailable(translate("messages.noLyrics")));
        return react.createElement(
            "div",
            {
                className: `${className}${isKara ? " is-karaoke" : ""}${page.transitionClass}`,
                key: page.lyricsId,
                ref: page.attachContainer,
                onClick: page.handleContainerClick,
            },
            react.createElement("p", { className: "lyrics-lyricsContainer-LyricsUnsyncedPadding" }),
            ...page.renderedItems,
            react.createElement("p", { className: "lyrics-lyricsContainer-LyricsUnsyncedPadding" }),
            react.createElement(SearchBar, { key: trackUri, lyricsRoot: page.pageRef, lyricsRevision: lyrics }),
            react.createElement(LyricsBackdropLayer, null)
        );
    });

    return { SyncedLyricsPage, SyncedExpandedLyricsPage, useKaraokeLiveClock };
}
