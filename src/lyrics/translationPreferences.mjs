const LYRICS_PRONUNCIATION_NOTATION_STORAGE_KEY =
  "ivLyrics:visual:translate:pronunciation-notation";
const LYRICS_PHONETIC_PROMPT_CACHE_VERSION = 3;

const normalizeIvLyricsPronunciationNotation = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "latin" || normalized === "ipa"
    ? normalized
    : "translation";
};

const TARGET_LANGUAGE_KEY = "translate:target-language";
const PRONUNCIATION_NOTATION_KEY = "translate:pronunciation-notation";

function createTranslationPreferences({ getVisualSetting, readLocalSetting, getAppLanguage, getSpotifyLocale, getProviderStyle }) {
  const getCurrentTranslationTargetLanguage = () => {
    const targetLanguage = getVisualSetting(TARGET_LANGUAGE_KEY)
      || readLocalSetting(`ivLyrics:visual:${TARGET_LANGUAGE_KEY}`);
    if (targetLanguage && targetLanguage !== "auto") return targetLanguage;
    return getAppLanguage() || getSpotifyLocale()?.split("-")[0] || "en";
  };

  const getCurrentLyricsPronunciationNotation = () => normalizeIvLyricsPronunciationNotation(
    getVisualSetting(PRONUNCIATION_NOTATION_KEY) || readLocalSetting(LYRICS_PRONUNCIATION_NOTATION_STORAGE_KEY)
  );

  const getTranslationStyle = () => getProviderStyle() || "natural";
  const getPronunciationCacheTag = () =>
    `phonetic-prompt=${LYRICS_PHONETIC_PROMPT_CACHE_VERSION}:notation=${getCurrentLyricsPronunciationNotation()}`;

  return {
    getCurrentTranslationTargetLanguage,
    getCurrentLyricsPronunciationNotation,
    getTranslationStyle,
    getPronunciationCacheTag,
  };
}

export {
  createTranslationPreferences,
  LYRICS_PHONETIC_PROMPT_CACHE_VERSION,
  LYRICS_PRONUNCIATION_NOTATION_STORAGE_KEY,
  normalizeIvLyricsPronunciationNotation,
};
