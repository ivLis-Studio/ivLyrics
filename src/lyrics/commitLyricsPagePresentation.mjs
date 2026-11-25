import { getCommittedLyricsTimingUpgrade } from "./pageLyricsTimingUpgrade.mjs";

export function commitLyricsPagePresentation(page, { lyricsState, mode, requestKey, isSyncCreatorActive }) {
  if (lyricsState !== page.state || isSyncCreatorActive || lyricsState.isLoading) return;

  // A timing upgrade can change the render mode while retaining the same work.
  const timingUpgrade = getCommittedLyricsTimingUpgrade(lyricsState);
  if (page._processedLyricsTimingUpgrade !== timingUpgrade) {
    page._processedLyricsTimingUpgrade = timingUpgrade;
    const context = (key) => typeof key === "string" ? key.slice(key.indexOf("_")) : null;
    if (timingUpgrade && page.lastProcessedUri === lyricsState.uri && context(page.lastProcessedMode) === context(requestKey)) {
      page.lastProcessedMode = requestKey;
    }
  }

  if (page.lastProcessedUri === lyricsState.uri && page.lastProcessedMode === requestKey) return;
  page.lastProcessedUri = lyricsState.uri;
  page.lastProcessedMode = requestKey;
  page.lyricsSource(lyricsState, mode);
}
