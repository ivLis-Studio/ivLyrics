export function restoreSettingsSnapshot({ getStorage, settings, startupSeeds, supersededSyncValues, warn }) {
  const keys = new Set([...Object.keys(settings), ...(supersededSyncValues?.keys() ?? [])]);
  const resolved = new Map();
  const written = new Map();

  for (const key of keys) {
    try {
      const storage = getStorage();
      const current = storage.getItem(key);
      if (current !== null && current !== startupSeeds?.get(key) && current !== supersededSyncValues?.get(key)) continue;

      const value = Object.hasOwn(settings, key) ? settings[key] : null;
      // A failed native write must not replace a newer backup with its stale seed.
      resolved.set(key, value);
      if (current === value) continue;
      if (value === null) storage.removeItem(key);
      else storage.setItem(key, value);
      written.set(key, value);
    } catch (error) {
      warn(`[ivLyrics] Failed to recover setting ${key}.`, error);
    }
  }
  return { resolved, written };
}
