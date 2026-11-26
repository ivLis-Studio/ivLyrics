import { KARAOKE, WORD_KARAOKE, SYNCED, UNSYNCED } from "./lyricsRenderModes.mjs";

const TOOLBAR_MODES = Object.freeze({
  character: KARAOKE,
  word: WORD_KARAOKE,
  synced: SYNCED,
  unsynced: UNSYNCED,
});
export const FLOATING_TOOLBAR_MODE_KEYS = Object.freeze(
  Object.fromEntries(Object.entries(TOOLBAR_MODES).map(([key, mode]) => [mode, key])),
);

export function isLyricsShortcutInputFocused(document) {
  const activeElement = document.activeElement;
  const tagName = activeElement?.tagName?.toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select" || activeElement?.isContentEditable;
}

export function createLyricsPageToolbar({
  page, modes, document, readVisualSettings, changeVisualSetting, togglePronunciationFirst,
  scheduleTimer, cancelTimer, requestFrame, translate, notify, wakeControls,
}) {
  let closeTimer = null;
  let contentElement;
  let engaged = false;

  function clearCloseTimer() {
    if (!closeTimer) return;
    cancelTimer(closeTimer);
    closeTimer = null;
  }

  function resetMenuScroll() {
    requestFrame(() => {
      if (contentElement) contentElement.scrollTop = 0;
    });
  }

  function openMenu() {
    clearCloseTimer();
    page.setState({ isFloatingMenuOpen: true, isFloatingMenuClosing: false }, resetMenuScroll);
  }

  function closeMenu() {
    if (!page.state.isFloatingMenuOpen && !page.state.isFloatingMenuClosing) return;
    clearCloseTimer();
    page.setState({ isFloatingMenuOpen: false, isFloatingMenuClosing: true });
    closeTimer = scheduleTimer(() => {
      page.setState({ isFloatingMenuClosing: false });
      closeTimer = null;
    }, readVisualSettings()["reduce-motion"] === true ? 24 : 280);
  }

  function isEngaged() {
    if (engaged) return true;
    const toolbar = page.containerRef.current?.querySelector?.(".ivl-tb");
    return !!toolbar?.querySelector?.(":focus-visible");
  }

  function getContentTopOffset() {
    if (!page.state?.isFullscreen || !document) return 0;
    const isBrowserFullscreen =
      (page.fullscreenRequestedPresentation
        ? page.fullscreenUsesBrowser === true
        : readVisualSettings()["fullscreen-browser-fullscreen"] === true) ||
      !!document.fullscreenElement;
    return isBrowserFullscreen ? 0 : 130;
  }

  function toggleCurrentModeLock() {
    const locking = !modes.isModeAvailable(page.state.lockedMode);
    const mode = locking ? modes.getCurrentMode() : page.state.lockedMode;
    const key = FLOATING_TOOLBAR_MODE_KEYS[mode];
    if (!key) return;
    modes.setCurrentModeLock(locking);
    const label = translate(`modes.${key}`);
    const status = page.getText(locking ? "modes.locked" : "modes.unlocked", locking ? "Locked" : "Unlocked");
    notify(`${label} · ${status}`);
  }

  function toggleMarketplace() {
    clearCloseTimer();
    page.setState((prevState) => ({
      showMarketplace: !prevState.showMarketplace,
      isFloatingMenuOpen: false,
      isFloatingMenuClosing: false,
    }));
  }

  // Stable callbacks let unrelated lyric updates skip rendering the toolbar.
  const actions = Object.freeze({
    onSelectMode: (key) => {
      const mode = TOOLBAR_MODES[key];
      if (mode !== undefined) modes.switchTo(mode);
    },
    onSetModeLock: modes.setCurrentModeLock,
    onToggleModeLock: toggleCurrentModeLock,
    onTogglePronunciationFirst: togglePronunciationFirst,
    getRegenerateChoices: () => page.getRegenerateTranslationChoices(),
    onRegenerate: (target, trackUri) => page.runRegenerateTranslationChoice(target, trackUri),
    onOpenLyricsEditor: () => page.openLyricsEditModal(),
    getCurrentTrackInfo: () => page.getCurrentPlayerTrackInfo(),
    onSelectProvider: page.selectLyricsProviderForCurrentTrack,
    onImportLocalLyricsFile: page.importLocalLyricsFile,
    onApplyLocalLyrics: page.applyLocalLyricsFromLrclibCandidate,
    getHasLocalLyrics: page.hasLocalLyricsForCurrentTrack,
    onDeleteLocalLyrics: page.removeLocalLyricsForCurrentTrack,
    onSelectBackground: page.selectBackgroundForCurrentTrack,
    onVideoSelect: (videoInfo, trackUri) => page.selectCommunityVideoForCurrentTrack(videoInfo, trackUri),
    getSyncCreatorTrackInfo: () => page.getSyncCreatorTrackInfo(),
    getShareTrackInfo: lyrics => page.getShareImageTrackInfo(lyrics),
    onToggleMarketplace: toggleMarketplace,
    onToggleFullscreen: (options) => {
      if (page.state.isFullscreen) closeMenu();
      page.toggleFullscreen(options);
    },
    onToggleMenu: () => {
      if (page.state.isFloatingMenuOpen) closeMenu();
      else openMenu();
    },
    onCloseMenu: closeMenu,
    onVisualConfigChange: changeVisualSetting,
    setEngaged: (nextEngaged) => {
      if (engaged === !!nextEngaged) return;
      engaged = !!nextEngaged;
      // Opening reveals the controls. Closing restarts the idle timer.
      wakeControls();
    },
    setContentRef: (element) => {
      contentElement = element;
    },
  });

  return { actions, clearCloseTimer, getContentTopOffset, isEngaged };
}
