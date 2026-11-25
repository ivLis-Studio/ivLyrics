export const LOCAL_LYRICS_STORAGE_KEY = "ivLyrics:local-lyrics";
export const LOCAL_LYRICS_UPDATED_EVENT = "ivLyrics:local-lyrics-updated";

export function createLocalLyricsStore({ readStorage, onReadError }) {
  function readAll() {
    try {
      const store = JSON.parse(readStorage().getItem(LOCAL_LYRICS_STORAGE_KEY) || "{}");
      return store && typeof store === "object" ? store : {};
    } catch (error) {
      onReadError?.(error);
      return {};
    }
  }

  function get(uri) {
    return uri ? readAll()[uri] || null : null;
  }

  function write(uri, lyrics) {
    const store = readAll();
    store[uri] = lyrics;
    readStorage().setItem(LOCAL_LYRICS_STORAGE_KEY, JSON.stringify(store));
  }

  function remove(uri) {
    const store = readAll();
    delete store[uri];
    readStorage().setItem(LOCAL_LYRICS_STORAGE_KEY, JSON.stringify(store));
  }

  return { readAll, get, has: (uri) => !!get(uri), write, remove };
}
