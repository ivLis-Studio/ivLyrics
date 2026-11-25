import {
  GLOBAL_SYNC_OFFSET_SETTING, GLOBAL_SYNC_OFFSET_STORAGE_KEY, clampSyncOffset, createGlobalSyncOffsetReader,
} from "./globalSyncOffset.mjs";

export function createSyncOffsetControls({
  host, localStorage, readVisualSettings, readStorage, trackSyncStore,
}) {
  return {
    getGlobalSyncOffset: createGlobalSyncOffsetReader(host, { readVisualSettings, readLocalStorage: () => localStorage }),

    setGlobalSyncOffset(offset) {
      const safeOffset = clampSyncOffset(offset);

      const visual = readVisualSettings();
      if (visual) visual[GLOBAL_SYNC_OFFSET_SETTING] = safeOffset;

      try {
        const storage = readStorage();
        if (storage?.saveConfig) {
          storage.saveConfig(GLOBAL_SYNC_OFFSET_SETTING, safeOffset);
        } else {
          localStorage.setItem(GLOBAL_SYNC_OFFSET_STORAGE_KEY, String(safeOffset));
        }
      } catch (error) {
        console.error("[ivLyrics] Failed to save global sync offset:", error);
      }

      host.dispatchEvent(new host.CustomEvent("ivLyrics:global-offset-changed", {
        detail: { offset: safeOffset }
      }));
      host.dispatchEvent(new host.CustomEvent("ivLyrics", {
        detail: { type: "config", name: GLOBAL_SYNC_OFFSET_SETTING, value: safeOffset }
      }));
    },

    // Track-specific sync offset management (using IndexedDB)
    async getTrackSyncOffset(trackUri) {
      if (!trackUri) return 0;
      try {
        return await trackSyncStore.getOffset(trackUri);
      } catch (error) {
        console.error("[ivLyrics] Failed to get track sync offset:", error);
        return 0;
      }
    },

    async setTrackSyncOffset(trackUri, offset, options = {}) {
      if (!trackUri) return false;
      const shouldDispatch = options.dispatch !== false;
      try {
        const persisted = await trackSyncStore.setOffset(trackUri, offset);
        if (!persisted) return false;
        if (shouldDispatch) {
          // Dispatch custom event to notify offset change
          host.dispatchEvent(new host.CustomEvent('ivLyrics:offset-changed', {
            detail: { trackUri, offset }
          }));
        }
        return true;
      } catch (error) {
        console.error("[ivLyrics] Failed to set track sync offset:", error);
        return false;
      }
    },

    async clearTrackSyncOffset(trackUri) {
      if (!trackUri) return;
      try {
        await trackSyncStore.clearOffset(trackUri);
      } catch (error) {
        console.error("[ivLyrics] Failed to clear track sync offset:", error);
      }
    },
  };
}
