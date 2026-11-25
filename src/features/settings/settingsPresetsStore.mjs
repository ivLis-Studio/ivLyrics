const SETTINGS_PRESETS_STORAGE_KEY = "ivLyrics:settings-presets";
const SETTINGS_PRESET_EXCLUDED_KEYS = new Set([
  "gemini-api-key",
  "gemini-api-key-romaji",
  "__proto__",
]);

const isPresetSetting = (key) => Boolean(key) && !SETTINGS_PRESET_EXCLUDED_KEYS.has(key);

export function formatSettingsPresetTimestamp(value, getLocale) {
  if (!value) return "";
  try {
    return new Intl.DateTimeFormat(getLocale() || undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch (error) {
    return String(value);
  }
}

export function createSettingsPresetsStore({
  readItem, writeItem, readVisualSettings, applyVisualSettings, onApplied, randomUUID,
}) {
  const createSettingsPresetId = () => {
    const uuid = randomUUID();
    if (uuid) return `preset-${uuid}`;
    return `preset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  };

  const normalizeSettingsPreset = (preset) => {
    if (!preset || typeof preset !== "object" || Array.isArray(preset)) return null;
    if (!preset.settings || typeof preset.settings !== "object" || Array.isArray(preset.settings)) return null;

    const name = String(preset.name || "").trim();
    if (!name) return null;

    const now = new Date().toISOString();
    return {
      id: String(preset.id || createSettingsPresetId()),
      name,
      createdAt: preset.createdAt || preset.updatedAt || now,
      updatedAt: preset.updatedAt || preset.createdAt || now,
      settings: Object.fromEntries(Object.entries(preset.settings).filter(([key]) => isPresetSetting(key))),
    };
  };

  const prepareSettingsPresets = (presets) => presets
    .map(normalizeSettingsPreset)
    .filter(Boolean)
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));

  const loadSettingsPresets = () => {
    try {
      const rawValue = readItem(SETTINGS_PRESETS_STORAGE_KEY);
      if (!rawValue) return [];

      const parsed = JSON.parse(rawValue);
      if (!Array.isArray(parsed)) return [];

      return prepareSettingsPresets(parsed);
    } catch (error) {
      console.error("[ivLyrics] Failed to load settings presets:", error);
      return [];
    }
  };

  const saveSettingsPresets = (presets) => {
    const prepared = prepareSettingsPresets(presets);
    writeItem(SETTINGS_PRESETS_STORAGE_KEY, JSON.stringify(prepared));
    return prepared;
  };

  const captureSettingsPresetValues = () => {
    const snapshot = {};
    Object.entries(readVisualSettings() || {}).forEach(([key, value]) => {
      if (!isPresetSetting(key)) return;
      if (typeof value === "undefined" || typeof value === "function") return;

      try {
        snapshot[key] = JSON.parse(JSON.stringify(value));
      } catch (error) {
        snapshot[key] = String(value);
      }
    });
    return snapshot;
  };

  const applySettingsPresetValues = (settings) => {
    const entries = Object.entries(settings || {}).filter(([name]) => isPresetSetting(name));
    const current = readVisualSettings?.() || {};
    const changed = entries.filter(([name, value]) => !Object.is(current[name], value));
    applyVisualSettings(Object.fromEntries(entries));
    if (changed.length) onApplied(changed);
  };

  return {
    createSettingsPresetId,
    loadSettingsPresets,
    saveSettingsPresets,
    captureSettingsPresetValues,
    applySettingsPresetValues,
  };
}
