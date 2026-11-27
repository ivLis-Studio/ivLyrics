const IV_LYRICS_DEFAULT_SPEAKER_TEXT_COLORS = {
  "MALE 1": "#a8ccff",
  "MALE 2": "#9ae8d4",
  "MALE 3": "#bfe8ff",
  "MALE 4": "#7fb5e6",
  "MALE 5": "#6cb8b8",
  "FEMALE 1": "#ffb8c7",
  "FEMALE 2": "#ffd6b3",
  "FEMALE 3": "#f6c8ff",
  "FEMALE 4": "#e6b4d4",
  "FEMALE 5": "#f6e5a5",
  "DUET 1": "#e4d8ff",
  "DUET 2": "#d6e4ff",
  "DUET 3": "#ffddf2",
  "DUET 4": "#bfaeff",
  "DUET 5": "#9d8cf2",
};
const IV_LYRICS_LEGACY_CUSTOM_SPEAKER_FALLBACKS = {
  "MALE CUSTOM": "MALE 1",
  "FEMALE CUSTOM": "FEMALE 1",
  "DUET CUSTOM": "DUET 1",
};
const IV_LYRICS_CUSTOM_SPEAKER_FALLBACK_OPTIONS = ["MALE 1", "FEMALE 1", "DUET 1"];
const IV_LYRICS_DEFAULT_CUSTOM_SPEAKER_FALLBACK = "MALE 1";
const IV_LYRICS_SPEAKER_COLOR_OPTIONS = Object.keys(IV_LYRICS_DEFAULT_SPEAKER_TEXT_COLORS);
const IV_LYRICS_SPEAKER_COLOR_KEY_PREFIX = "multi-vocal-speaker-color-";
const IV_LYRICS_SPEAKER_COLOR_STORAGE_PREFIX = "ivLyrics:visual:";
const IV_LYRICS_CREATOR_SPEAKER_COLOR_SETTING = "sync-data-custom-speaker-colors-enabled";
const IV_LYRICS_SPEAKER_CLASS_CACHE_LIMIT = 64;

export const getBuiltInSpeakerColorSettingKey = speaker =>
  IV_LYRICS_SPEAKER_COLOR_KEY_PREFIX + speaker.toLowerCase().replace(/\s+/g, "-");

export const IV_LYRICS_DEFAULT_SPEAKER_COLOR_SETTINGS = Object.freeze(Object.fromEntries(
  Object.entries(IV_LYRICS_DEFAULT_SPEAKER_TEXT_COLORS)
    .map(([speaker, color]) => [getBuiltInSpeakerColorSettingKey(speaker), color]),
));

export function createSpeakerColors({ getVisualSettings, getStorage, getStorageManager, getDefaultTarget }) {
  const ivLyricsSpeakerClassCache = new Map();
  let ivLyricsSpeakerClassCacheSize = 0;

  const normalizeIvLyricsSpeakerLabel = (value) => {
    const normalized = String(value || "")
      .trim()
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .toUpperCase();
    return IV_LYRICS_DEFAULT_SPEAKER_TEXT_COLORS[normalized]
      || normalized === "CUSTOM"
      || IV_LYRICS_LEGACY_CUSTOM_SPEAKER_FALLBACKS[normalized]
      ? normalized
      : "";
  };

  const normalizeIvLyricsSpeakerFallback = (fallback, sourceSpeaker = "") => {
    const normalized = String(fallback || "")
      .trim()
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .toUpperCase();
    if (IV_LYRICS_CUSTOM_SPEAKER_FALLBACK_OPTIONS.includes(normalized)) return normalized;
    const source = normalizeIvLyricsSpeakerLabel(sourceSpeaker);
    return IV_LYRICS_LEGACY_CUSTOM_SPEAKER_FALLBACKS[source] || "";
  };

  const getIvLyricsSpeakerFallback = (speaker, speakerFallback = "") => {
    const normalized = normalizeIvLyricsSpeakerLabel(speaker);
    if (normalized === "CUSTOM") {
      return normalizeIvLyricsSpeakerFallback(speakerFallback, speaker)
        || IV_LYRICS_DEFAULT_CUSTOM_SPEAKER_FALLBACK;
    }
    return IV_LYRICS_LEGACY_CUSTOM_SPEAKER_FALLBACKS[normalized] || normalized;
  };

  const getIvLyricsSpeakerClassName = (speaker, speakerFallback = "") => {
    const speakerKey = String(speaker || "");
    const fallbackKey = String(speakerFallback || "");
    const cachedFallbacks = ivLyricsSpeakerClassCache.get(speakerKey);
    if (cachedFallbacks?.has(fallbackKey)) {
      return cachedFallbacks.get(fallbackKey);
    }

    const normalized = normalizeIvLyricsSpeakerLabel(speakerKey);
    const effectiveSpeaker = getIvLyricsSpeakerFallback(normalized, fallbackKey);
    const speakerClass = String(effectiveSpeaker || "")
      .trim()
      .toLowerCase()
      .replace(/[_\s]+/g, "-")
      .replace(/[^a-z0-9-]/g, "");

    if (ivLyricsSpeakerClassCacheSize >= IV_LYRICS_SPEAKER_CLASS_CACHE_LIMIT) {
      ivLyricsSpeakerClassCache.clear();
      ivLyricsSpeakerClassCacheSize = 0;
    }
    let fallbackCache = ivLyricsSpeakerClassCache.get(speakerKey);
    if (!fallbackCache) {
      fallbackCache = new Map();
      ivLyricsSpeakerClassCache.set(speakerKey, fallbackCache);
    }
    fallbackCache.set(fallbackKey, speakerClass);
    ivLyricsSpeakerClassCacheSize += 1;
    return speakerClass;
  };

  const isIvLyricsCustomSpeaker = (speaker) => (
    normalizeIvLyricsSpeakerLabel(speaker) === "CUSTOM"
    || !!IV_LYRICS_LEGACY_CUSTOM_SPEAKER_FALLBACKS[normalizeIvLyricsSpeakerLabel(speaker)]
  );

  const getIvLyricsSpeakerColorSettingKey = (speaker) => {
    const normalized = getIvLyricsSpeakerFallback(speaker);
    return normalized ? getBuiltInSpeakerColorSettingKey(normalized) : "";
  };

  const getIvLyricsSpeakerColorCssVariable = (speaker) => {
    const settingKey = getIvLyricsSpeakerColorSettingKey(speaker);
    return settingKey ? `--ivlyrics-${settingKey}` : "";
  };

  const normalizeIvLyricsHexColor = (value) => {
    const color = String(value || "").trim();
    if (/^#[0-9a-f]{6}$/i.test(color)) return color.toLowerCase();
    if (/^#[0-9a-f]{3}$/i.test(color)) {
      return `#${color.slice(1).split("").map((char) => char + char).join("")}`.toLowerCase();
    }
    return "";
  };

  const readIvLyricsSpeakerColorConfig = (speaker) => {
    const normalized = getIvLyricsSpeakerFallback(speaker);
    if (!normalized) return "";

    const settingKey = getIvLyricsSpeakerColorSettingKey(normalized);
    const configured = normalizeIvLyricsHexColor(getVisualSettings()?.[settingKey]);
    if (configured) return configured;

    try {
      const stored = normalizeIvLyricsHexColor(getStorage().getItem(`${IV_LYRICS_SPEAKER_COLOR_STORAGE_PREFIX}${settingKey}`));
      if (stored) return stored;
    } catch {
      // localStorage may be unavailable in restricted contexts.
    }

    return IV_LYRICS_DEFAULT_SPEAKER_TEXT_COLORS[normalized];
  };

  const setIvLyricsSpeakerColorConfig = (speaker, color) => {
    const normalized = getIvLyricsSpeakerFallback(speaker);
    const normalizedColor = normalizeIvLyricsHexColor(color);
    if (!normalized || !normalizedColor) return "";

    const settingKey = getIvLyricsSpeakerColorSettingKey(normalized);
    const visual = getVisualSettings();
    if (visual) {
      visual[settingKey] = normalizedColor;
    }

    try {
      const storageManager = getStorageManager();
      if (storageManager?.saveConfig) {
        storageManager.saveConfig(settingKey, normalizedColor);
      } else {
        getStorage().setItem(`${IV_LYRICS_SPEAKER_COLOR_STORAGE_PREFIX}${settingKey}`, normalizedColor);
      }
    } catch {
      // Ignore persistence errors; the live CSS variable is still applied below.
    }

    return normalizedColor;
  };

  const isIvLyricsCreatorSpeakerColorEnabled = () => {
    const configured = getVisualSettings()?.[IV_LYRICS_CREATOR_SPEAKER_COLOR_SETTING];
    if (typeof configured === "boolean") return configured;
    if (configured !== undefined && configured !== null) {
      return !["false", "0", "off", "no"].includes(String(configured).trim().toLowerCase());
    }

    try {
      const stored = getStorage().getItem(`${IV_LYRICS_SPEAKER_COLOR_STORAGE_PREFIX}${IV_LYRICS_CREATOR_SPEAKER_COLOR_SETTING}`);
      if (stored === null) return true;
      try {
        return JSON.parse(stored) !== false;
      } catch {
        return !["false", "0", "off", "no"].includes(String(stored).trim().toLowerCase());
      }
    } catch {
      return true;
    }
  };

  const getIvLyricsSpeakerPresentation = (speaker, speakerColor, speakerFallback = "") => {
    const normalized = normalizeIvLyricsSpeakerLabel(speaker);
    const effectiveSpeaker = getIvLyricsSpeakerFallback(normalized, speakerFallback);
    const creatorColor = isIvLyricsCustomSpeaker(normalized) && isIvLyricsCreatorSpeakerColorEnabled()
      ? normalizeIvLyricsHexColor(speakerColor)
      : "";
    const speakerClass = String(effectiveSpeaker || "")
      .trim()
      .toLowerCase()
      .replace(/[_\s]+/g, "-")
      .replace(/[^a-z0-9-]/g, "");

    return {
      speaker: normalized,
      effectiveSpeaker,
      speakerClass,
      creatorColor,
      color: creatorColor || readIvLyricsSpeakerColorConfig(effectiveSpeaker),
    };
  };

  const UTILS_IV_LYRICS_SPEAKER_CLASS_CONTRACT = Symbol.for("ivLyrics.speakerColors.classNameContract");

  const resetIvLyricsSpeakerColorConfig = () => {
    IV_LYRICS_SPEAKER_COLOR_OPTIONS.forEach((speaker) => {
      const settingKey = getIvLyricsSpeakerColorSettingKey(speaker);
      const visual = getVisualSettings();
      if (visual) {
        visual[settingKey] = IV_LYRICS_DEFAULT_SPEAKER_TEXT_COLORS[speaker];
      }

      try {
        const storageManager = getStorageManager();
        if (storageManager?.removeItem) {
          storageManager.removeItem(`${IV_LYRICS_SPEAKER_COLOR_STORAGE_PREFIX}${settingKey}`);
        } else {
          getStorage().removeItem(`${IV_LYRICS_SPEAKER_COLOR_STORAGE_PREFIX}${settingKey}`);
        }
      } catch {
        // Ignore persistence errors.
      }
    });
  };

  const applyIvLyricsSpeakerColorCssVariables = (target = getDefaultTarget()) => {
    if (!target?.style) return;
    IV_LYRICS_SPEAKER_COLOR_OPTIONS.forEach((speaker) => {
      const cssVariable = getIvLyricsSpeakerColorCssVariable(speaker);
      const color = readIvLyricsSpeakerColorConfig(speaker);
      if (cssVariable && color) {
        target.style.setProperty(cssVariable, color);
      }
    });
  };

  const ivLyricsSpeakerColors = {
    defaultColors: IV_LYRICS_DEFAULT_SPEAKER_TEXT_COLORS,
    customFallbacks: IV_LYRICS_LEGACY_CUSTOM_SPEAKER_FALLBACKS,
    customFallbackOptions: IV_LYRICS_CUSTOM_SPEAKER_FALLBACK_OPTIONS,
    options: IV_LYRICS_SPEAKER_COLOR_OPTIONS,
    normalizeSpeaker: normalizeIvLyricsSpeakerLabel,
    normalizeFallback: normalizeIvLyricsSpeakerFallback,
    normalizeColor: normalizeIvLyricsHexColor,
    isCustomSpeaker: isIvLyricsCustomSpeaker,
    getFallbackSpeaker: getIvLyricsSpeakerFallback,
    isCreatorColorEnabled: isIvLyricsCreatorSpeakerColorEnabled,
    getPresentation: getIvLyricsSpeakerPresentation,
    getSettingKey: getIvLyricsSpeakerColorSettingKey,
    getCssVariableName: getIvLyricsSpeakerColorCssVariable,
    getTextColor: readIvLyricsSpeakerColorConfig,
    setTextColor(speaker, color) {
      const savedColor = setIvLyricsSpeakerColorConfig(speaker, color);
      if (savedColor) applyIvLyricsSpeakerColorCssVariables();
      return savedColor;
    },
    resetToDefaults() {
      resetIvLyricsSpeakerColorConfig();
      applyIvLyricsSpeakerColorCssVariables();
    },
    applyCssVariables: applyIvLyricsSpeakerColorCssVariables,
  };
  Object.defineProperty(ivLyricsSpeakerColors, UTILS_IV_LYRICS_SPEAKER_CLASS_CONTRACT, {
    value: Object.freeze({
      getClassName: getIvLyricsSpeakerClassName,
      getPresentation: getIvLyricsSpeakerPresentation,
    }),
  });
  return ivLyricsSpeakerColors;
}
