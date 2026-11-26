const DISPLAY_COMMIT = Symbol("lyrics display commit");

export function createPageLyricsDisplay(page) {
  function ownsTrack(uri) {
    return page._isComponentMounted !== false && page.isCurrentLyricsUri(uri) && page.isPlaybackUriCurrent(uri);
  }

  function commit({ lyrics, uri, provider, isCurrent, patch }, onCommit) {
    const marker = {};
    const ownsDisplay = state => state.uri === uri && state.provider === provider && ownsTrack(uri) && isCurrent();
    page.setState(previous => {
      if (!ownsDisplay(previous)) return null;
      return {
        ...patch,
        [DISPLAY_COMMIT]: marker,
        currentLyrics: page.mergeCurrentLyricsTiming?.(lyrics, uri, provider, previous) || lyrics,
      };
    }, () => {
      const committed = page.state;
      if (onCommit && committed[DISPLAY_COMMIT] === marker && ownsDisplay(committed)) {
        onCommit(committed.currentLyrics);
      }
    });
  }

  return { ownsTrack, commit };
}
