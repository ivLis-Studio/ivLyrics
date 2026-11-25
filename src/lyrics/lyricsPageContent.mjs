import { KARAOKE, WORD_KARAOKE, SYNCED, UNSYNCED } from "./lyricsRenderModes.mjs";

export function renderLyricsCacheEditor({ react, page, LyricsCacheEditModal }) {
  const { state } = page;
  return state.isLyricsEditModalOpen &&
    react.createElement(LyricsCacheEditModal, {
      isOpen: state.isLyricsEditModalOpen,
      isLoading: state.isLyricsEditLoading,
      isSaving: state.isLyricsEditSaving,
      originalLines: state.lyricsEditOriginalLines,
      pronunciationText: state.lyricsEditPronunciationText,
      pronunciationSlots: state.lyricsEditPronunciationSlots,
      translationText: state.lyricsEditTranslationText,
      expectedLineCount: state.lyricsEditOriginalLines.length,
      hasPronunciationCache: state.lyricsEditHasPronunciationCache,
      hasTranslationCache: state.lyricsEditHasTranslationCache,
      trackTitle: state.title,
      trackArtist: state.artist,
      provider: state.provider,
      error: state.lyricsEditError,
      onClose: () => page.closeLyricsEditModal(),
      onSave: () => page.saveLyricsEditModal(),
      onPronunciationChange: (value, slots) =>
        page.setState({
          lyricsEditPronunciationText: value,
          ...(Array.isArray(slots) ? { lyricsEditPronunciationSlots: slots } : null),
          lyricsEditError: "",
        }),
      onTranslationChange: (value) =>
        page.setState({ lyricsEditTranslationText: value, lyricsEditError: "" }),
    });
}

export function renderLyricsBehindSyncCreator({ react, page, translate, isSyncCreatorActive, syncCreatorPlainLyrics }) {
  const syncCreatorPlainPage = isSyncCreatorActive
    ? react.createElement(
      "div",
      {
        className: "lyrics-lyricsContainer-UnsyncedLyricsPage ivlyrics-sync-creator-plain-page",
        style: {
          position: "relative",
          zIndex: 1,
          minHeight: "100%",
          padding: "96px 48px 120px",
          color: "var(--spice-text, #ffffff)",
          fontFamily: "var(--lyrics-font-family, var(--font-family))",
          fontSize: "18px",
          lineHeight: 1.8,
          opacity: 0.72,
          whiteSpace: "pre-wrap",
        },
      },
      syncCreatorPlainLyrics.length > 0
        ? syncCreatorPlainLyrics.map((line, index) => react.createElement(
          "div",
          { key: `sync-creator-plain-${index}` },
          line.text
        ))
        : react.createElement("div", null, translate("messages.noLyrics"))
    )
    : null;
  const lineCounterOverlay = isSyncCreatorActive && page.state.showLineCounter
    ? react.createElement(
      "div",
      {
        className: "ivlyrics-line-counter-overlay",
        style: {
          position: "absolute",
          bottom: "20px",
          right: "20px",
          zIndex: 10,
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "8px 14px",
          borderRadius: "10px",
          background: "rgba(0, 0, 0, 0.65)",
          backdropFilter: "blur(12px)",
          border: "1px solid rgba(255, 255, 255, 0.1)",
          color: "#fff",
          fontSize: "13px",
          fontWeight: "600",
          cursor: "pointer",
          userSelect: "none",
        },
        onClick: () => {
          const currentIndex = page.state.currentLyricIndex || 0;
          page.setState((prev) => {
            const newMarked = new Set(prev.markedLines || []);
            if (newMarked.has(currentIndex)) {
              newMarked.delete(currentIndex);
            } else {
              newMarked.add(currentIndex);
            }
            return { markedLines: newMarked };
          });
        },
        onContextMenu: (e) => {
          e.preventDefault();
          page.setState({ markedLines: new Set() });
        },
        title: translate("syncCreator.markLineHint") || undefined,
      },
      react.createElement("span", null, `${(page.state.currentLyricIndex || 0) + 1} / ${syncCreatorPlainLyrics.length || 0}`),
      react.createElement("span", {
        style: {
          fontSize: "10px",
          opacity: 0.6,
          marginLeft: "4px",
        }
      }, "≡")
    )
    : null;
  return { syncCreatorPlainPage, lineCounterOverlay };
}

export function renderLyricsPageRows({
  react, page, LyricsPageRenderer, MarketplacePage, isFocusedFullscreenPresentation, mode, isSyncCreatorActive,
  renderedCurrentLyrics, renderedUnsyncedLyrics,
}) {
  return react.createElement(LyricsPageRenderer, {
    playbackOnly: isFocusedFullscreenPresentation && page.state.fullscreenFocusedLyricsActive,
    mode,
    karaokeMode: KARAOKE,
    wordMode: WORD_KARAOKE,
    syncedMode: SYNCED,
    unsyncedMode: UNSYNCED,
    trackUri: page.state.uri,
    currentLyrics: renderedCurrentLyrics,
    karaoke: isSyncCreatorActive ? null : page.state.karaoke,
    karaokeSource: isSyncCreatorActive ? null : page.state.karaokeSource,
    synced: isSyncCreatorActive ? null : page.state.synced,
    unsynced: renderedUnsyncedLyrics,
    provider: page.state.provider,
    contributors: page.state.contributors,
    syncType: page.state.syncType,
    syncPoints: page.state.syncPoints,
    syncTypeBreakdown: page.state.syncTypeBreakdown,
    copyright: page.state.copyright,
    isLoading: page.state.isLoading,
    trackRevealKey: !page.state.isLoading && renderedCurrentLyrics?.length > 0
      ? page.state.uri
      : null,
    showMarketplace: page.state.showMarketplace,
    marketplaceComponent: MarketplacePage,
    onCloseMarketplace: () => page.setState({ showMarketplace: false }),
    reRenderLyricsPage: page.reRenderLyricsPage,
  });
}
