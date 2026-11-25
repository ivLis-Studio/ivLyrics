export function renderLyricsPageQuickSync({
  react, TrackSyncAdjustPill, state, visual, hasTrackSyncLyrics,
  suppressStaleLyricsPage, shouldHideFullscreenLyrics, isSyncCreatorActive, shouldUseVideoBackground, renderTrackUri,
}) {
  const canAdjustTrackSync = hasTrackSyncLyrics &&
    !suppressStaleLyricsPage &&
    !state.showMarketplace &&
    !shouldHideFullscreenLyrics &&
    !isSyncCreatorActive &&
    Boolean(renderTrackUri);
  const quickSyncControlsEnabled =
    visual["quick-sync-controls-enabled"] !== false;
  // The same pill adjusts the background video's timing (Lyrics/Video
  // switch), so it also shows for a video without synced lyrics.
  const canAdjustVideoSync = shouldUseVideoBackground &&
    Boolean(state.uri) &&
    renderTrackUri === state.uri &&
    !suppressStaleLyricsPage &&
    !isSyncCreatorActive &&
    !state.showMarketplace;
  const trackSyncAdjustPill = (canAdjustTrackSync || canAdjustVideoSync) &&
    quickSyncControlsEnabled &&
    Boolean(renderTrackUri) &&
    TrackSyncAdjustPill
    ? react.createElement(TrackSyncAdjustPill, {
      key: renderTrackUri,
      trackUri: renderTrackUri,
      lyricsAdjustable: canAdjustTrackSync,
      videoTrackUri: canAdjustVideoSync ? state.uri : null,
    })
    : null;
  // A single accessible Lyrics/Video control replaces the two duplicate
  // floating rows. The toolbar's video panel uses the same local anchor.
  const quickSyncStack = trackSyncAdjustPill
    ? react.createElement(
      "div",
      { className: "lyrics-quick-sync-stack" },
      trackSyncAdjustPill
    )
    : null;
  return { canAdjustTrackSync, quickSyncControlsEnabled, quickSyncStack };
}
