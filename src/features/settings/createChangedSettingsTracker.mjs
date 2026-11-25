import { IVLYRICS_BACKGROUND_FLAG_IDS } from "../../lyrics/backgroundModes.mjs";
import { SETTINGS_BACKGROUND_MODE_KEY } from "./settingsDefaults.mjs";

const backgroundNotifications = new Set(["background-mode", ...IVLYRICS_BACKGROUND_FLAG_IDS]);

export function createChangedSettingsTracker(registry, isSettingChanged) {
  const entries = new Map(registry.map(entry => [entry.key, entry]));
  const changedKeys = new Set();
  const pendingKeys = new Set();
  let scanAll = true;
  let counts = { total: 0, byTab: {}, keys: [] };

  function invalidate(name) {
    const key = backgroundNotifications.has(name) ? SETTINGS_BACKGROUND_MODE_KEY : name;
    if (entries.has(key)) pendingKeys.add(key);
    // A bulk update or another integration may report a setting group.
    else scanAll = true;
  }

  function readCounts() {
    let membershipChanged = false;
    for (const key of scanAll ? entries.keys() : pendingKeys) {
      const changed = isSettingChanged(key);
      if (changedKeys.has(key) === changed) continue;
      if (changed) changedKeys.add(key);
      else changedKeys.delete(key);
      membershipChanged = true;
    }
    scanAll = false;
    pendingKeys.clear();
    if (!membershipChanged) return counts;

    const keys = [];
    const byTab = {};
    for (const { key, tabId } of entries.values()) {
      if (!changedKeys.has(key)) continue;
      keys.push(key);
      byTab[tabId] = (byTab[tabId] || 0) + 1;
    }
    counts = { total: keys.length, byTab, keys };
    return counts;
  }

  return { invalidate, readCounts };
}
