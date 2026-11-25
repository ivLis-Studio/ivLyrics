import { KARAOKE, WORD_KARAOKE, SYNCED, UNSYNCED, isKaraokeRenderMode } from "./lyricsRenderModes.mjs";

export const AUTOMATIC_LYRICS_MODE_PRIORITY = Object.freeze([KARAOKE, WORD_KARAOKE, SYNCED, UNSYNCED]);

export function createLyricsPageModes({ page, readVisualSettings, rememberModeLock }) {
  function isModeAvailable(mode, lyricsState = page.state) {
    if (!lyricsState || mode === -1) return false;
    if (isKaraokeRenderMode(mode)) {
      return !!lyricsState.karaoke && readVisualSettings()["karaoke-mode-enabled"];
    }
    if (mode === SYNCED) return !!lyricsState.synced;
    if (mode === UNSYNCED) return !!lyricsState.unsynced;
    return false;
  }

  function getAutomaticMode(lyricsState = page.state) {
    // Word-timed karaoke also supports character rendering.
    return AUTOMATIC_LYRICS_MODE_PRIORITY.find((mode) => isModeAvailable(mode, lyricsState)) ?? -1;
  }

  function getCurrentMode() {
    const { lockedMode, explicitMode } = page.state;
    if (isModeAvailable(lockedMode)) return lockedMode;
    if (isModeAvailable(explicitMode)) return explicitMode;
    return getAutomaticMode();
  }

  function switchTo(mode) {
    page.lastProcessedMode = null;
    const { lockedMode } = page.state;
    // An active lock follows the user's selection.
    const movesLock = lockedMode !== mode && isModeAvailable(lockedMode);
    if (movesLock) rememberModeLock(mode);
    page.setState((prevState) => ({
      ...(movesLock ? { lockedMode: mode } : {}),
      explicitMode: mode,
      currentLyrics: page.resolveLyricsForMode(prevState, mode) || prevState.currentLyrics || [],
    }));
  }

  function toggleModeLock(mode, event = null) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    const nextLockedMode = page.state.lockedMode === mode ? -1 : mode;
    rememberModeLock(nextLockedMode);
    page.lastProcessedMode = null;
    page.setState((prevState) => ({
      lockedMode: nextLockedMode,
      explicitMode: nextLockedMode === -1 ? -1 : mode,
      currentLyrics: nextLockedMode === -1
        ? prevState.currentLyrics
        : page.resolveLyricsForMode(prevState, mode) || prevState.currentLyrics || [],
    }), () => {
      page.lyricsSource(page.state, getCurrentMode());
    });
  }

  function setCurrentModeLock(locked) {
    const isLockInEffect = isModeAvailable(page.state.lockedMode);
    if (!!locked === isLockInEffect) return;
    const mode = locked ? getCurrentMode() : page.state.lockedMode;
    if (mode !== -1) toggleModeLock(mode);
  }

  return { isModeAvailable, getAutomaticMode, getCurrentMode, switchTo, toggleModeLock, setCurrentModeLock };
}
