export const KARAOKE = 0;
export const SYNCED = 1;
export const UNSYNCED = 2;
export const WORD_KARAOKE = 3;
const LYRICS_MODE_TYPE_KEYS = ['karaoke', 'synced', 'unsynced'];
const IVLYRICS_RENDER_MODE_LOCK_STORAGE_KEY = "ivLyrics:visual:render-mode-lock";
export const getLyricsDataMode = (mode) => mode === WORD_KARAOKE ? KARAOKE : mode;
export const isKaraokeRenderMode = (mode) => mode === KARAOKE || mode === WORD_KARAOKE;
export const getKaraokeRenderGranularity = (mode, karaokeMode = KARAOKE, wordMode = WORD_KARAOKE) =>
  mode === wordMode ? "word" : mode === karaokeMode ? "character" : null;
// Returns the mode-specific lyrics array held on a LyricsContainer state when
// it exists for the given render mode, otherwise undefined so callers can pick
// their own fallback. Mirrors the if-chain the karaoke/synced/unsynced getters
// used to repeat verbatim.
export const resolveModeSpecificLyrics = (state, currentMode) => {
  if (isKaraokeRenderMode(currentMode) && Array.isArray(state.karaoke)) {
    return state.karaoke;
  }
  if (currentMode === SYNCED && Array.isArray(state.synced)) {
    return state.synced;
  }
  if (currentMode === UNSYNCED && Array.isArray(state.unsynced)) {
    return state.unsynced;
  }
  return undefined;
};
export const getLyricsModeTypeKey = (mode) => LYRICS_MODE_TYPE_KEYS[getLyricsDataMode(mode)] || null;
const normalizeLyricsRenderModeLock = (value) => {
  if (value === null || value === undefined || value === "") return -1;
  const mode = Number(value);
  return [KARAOKE, WORD_KARAOKE, SYNCED, UNSYNCED].includes(mode) ? mode : -1;
};

export function createLyricsModeLockStore({ storage, debug }) {
  const getRememberedLyricsRenderModeLock = () => {
    try {
      return normalizeLyricsRenderModeLock(
        storage.getItem(IVLYRICS_RENDER_MODE_LOCK_STORAGE_KEY)
      );
    } catch {
      return -1;
    }
  };
  const rememberLyricsRenderModeLock = (mode) => {
    const normalizedMode = normalizeLyricsRenderModeLock(mode);
    try {
      storage.setItem(
        IVLYRICS_RENDER_MODE_LOCK_STORAGE_KEY,
        String(normalizedMode)
      );
    } catch (error) {
      debug("[ivLyrics] Failed to remember lyrics render mode lock:", error);
    }
    return normalizedMode;
  };
  return { getRememberedLyricsRenderModeLock, rememberLyricsRenderModeLock };
}
