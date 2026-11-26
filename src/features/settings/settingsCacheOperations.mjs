export function createSettingsCacheOperations({
  cache, readTrackUri, extractTrackId, getTranslationCacheId, getSettingsText, translate,
  confirm, reloadLyrics, notifySuccess, notifyError,
}) {
  const listeners = new Set();
  let state = { stats: null, loading: true, clearing: false, openDbInfo: null, openDbUpdating: false, openDbError: "" };
  let statsRead = 0;
  let openDbRefresh = 0;

  function update(patch) {
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  }

  async function loadStats() {
    const read = ++statsRead;
    const refreshAtStart = state.openDbUpdating ? null : openDbRefresh;
    update({ loading: true });
    let stats = null;
    try {
      stats = await cache.getStats();
    } catch (error) {
      console.error("[LocalCacheManager] Failed to load stats:", error);
    }
    if (read !== statsRead) return;
    const patch = { stats, loading: false };
    if (refreshAtStart === openDbRefresh) patch.openDbInfo = cache.getOpenDbInfo();
    update(patch);
  }

  async function clear({ run, reload, success, failure }) {
    if (state.clearing) return;
    update({ clearing: true });
    try {
      const result = await run();
      await loadStats();
      reload();
      notifySuccess(success(result));
    } catch (error) {
      console.error(failure, error);
      notifyError(translate("messages.error"));
    } finally {
      update({ clearing: false });
    }
  }

  function clearAll() {
    return clear({
      run: () => cache.clearAll(),
      reload: () => reloadLyrics(false),
      success: () => translate("notifications.localCacheCleared"),
      failure: "[LocalCacheManager] Clear all failed:",
    });
  }

  async function clearCurrent() {
    if (state.clearing) return;
    const trackUri = readTrackUri();
    const spotifyTrackId = extractTrackId(trackUri);
    const trackId = spotifyTrackId || getTranslationCacheId(trackUri);
    if (!trackId) {
      notifyError(translate("notifications.noTrackPlaying"));
      return;
    }
    const removeLocalLyrics = !spotifyTrackId
      && cache.hasSavedLocalLyrics(trackUri)
      && confirm(getSettingsText(
        "menu.localLyricsDeleteConfirm",
        "Delete the local lyrics saved for this track? This can't be undone."
      ));
    await clear({
      run: () => cache.clearTrack(trackUri, trackId, removeLocalLyrics),
      reload: () => reloadLyrics(false, trackUri),
      success: (removed) => removed
        ? getSettingsText("notifications.localLyricsDeleted", "Local lyrics deleted")
        : translate("notifications.localCacheTrackCleared"),
      failure: "[LocalCacheManager] Clear track failed:",
    });
  }

  async function refreshOpenDb() {
    if (state.openDbUpdating) return;
    const refresh = cache.getOpenDbRefresh();
    if (typeof refresh !== "function") {
      update({ openDbError: getSettingsText(
        "settingsAdvanced.cacheManagement.openDb.unavailable",
        "OpenDB 캐시 서비스를 사용할 수 없습니다."
      ) });
      return;
    }

    openDbRefresh++;
    update({ openDbUpdating: true, openDbError: "" });
    try {
      const openDbInfo = await refresh();
      update({ openDbInfo });
      notifySuccess(getSettingsText(
        "settingsAdvanced.cacheManagement.openDb.updateSuccess",
        "OpenDB base와 delta를 다시 가져왔습니다."
      ));
    } catch (error) {
      console.error("[LocalCacheManager] OpenDB refresh failed:", error);
      const openDbInfo = error?.cacheInfo || cache.getOpenDbInfo();
      const message = openDbInfo?.available
        ? getSettingsText("settingsAdvanced.cacheManagement.openDb.updateFailed", "OpenDB를 갱신하지 못했습니다. 기존 캐시는 유지됩니다.")
        : getSettingsText("settingsAdvanced.cacheManagement.openDb.updateFailedNoCache", "OpenDB를 갱신하지 못했고 사용할 기존 캐시가 없습니다.");
      update({ openDbInfo, openDbError: message });
      notifyError(message);
    } finally {
      update({ openDbUpdating: false });
    }
  }

  return {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    loadStats, clearAll, clearCurrent, refreshOpenDb,
  };
}
