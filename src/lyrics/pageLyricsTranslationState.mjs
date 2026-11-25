const TRANSLATION_FIELDS = ["romaji", "furigana", "hiragana", "katakana", "hangul", "romaja", "cn", "hk", "tw"];
const PRESENTATION_FIELDS = [...TRANSLATION_FIELDS, "currentLyrics", "language"];
export const emptyPageTranslationFields = Object.freeze(
  Object.fromEntries(TRANSLATION_FIELDS.map(field => [field, null])),
);

export function createPageLyricsTranslationState({
  page, translationCache, readLanguageOverride, detectLanguage, publishDetectedLanguage, translate, notifySuccess,
}) {
  function provideLanguageCode(lyrics, { publish = true } = {}) {
    if (!lyrics) return null;
    let language = page.trackLanguageOverride;
    if (!language) {
      const override = readLanguageOverride();
      language = override === "off" ? page.state.language || detectLanguage(lyrics) : override;
    }
    if (publish) publishDetectedLanguage(language);
    return language;
  }

  function getTranslationStates() {
    return Object.fromEntries(PRESENTATION_FIELDS.map((field) => [field, page.state[field]]));
  }

  function applyTranslationStates(states, additional = {}) {
    const patch = { ...additional };
    for (const field of PRESENTATION_FIELDS) {
      if (states[field]) patch[field] = states[field];
    }
    return patch;
  }

  function clearTranslationRequestsForCacheRemoval(trackUri = null) {
    page.traditionalConversion.clear(trackUri);
    if (!trackUri) {
      if (page._dmResults) page._dmResults = {};
      page._inflightGemini?.clear();
      return;
    }

    if (page._dmResults?.[trackUri]) delete page._dmResults[trackUri];
    if (page._inflightGemini) {
      for (const [key] of page._inflightGemini) {
        if (key.includes(trackUri)) page._inflightGemini.delete(key);
      }
    }
  }

  function resetTranslationCache(uri) {
    // Clear translation cache for this URI
    const clearedCount = translationCache.clearByUri(uri);
    page.traditionalConversion.clear(uri);

    // Clear progressive results for this track
    if (page._dmResults && page._dmResults[uri]) {
      delete page._dmResults[uri];
    }

    // Clear inflight Gemini requests for this track
    if (page._inflightGemini) {
      const keysToDelete = [];
      for (const [key] of page._inflightGemini) {
        if (key.startsWith(`${uri}:`)) {
          keysToDelete.push(key);
        }
      }
      keysToDelete.forEach((key) => page._inflightGemini.delete(key));
    }

    const previousState = page.state;
    const hasTranslations = TRANSLATION_FIELDS.some((field) => previousState[field]);
    page.setState(emptyPageTranslationFields);

    // Force re-process lyrics with current display modes
    const currentMode = page.getCurrentMode();
    page.lyricsSource(page.state, currentMode);

    if (hasTranslations) {
      notifySuccess(translate("notifications.translationCacheReset").replace("{count}", clearedCount));
    } else {
      notifySuccess(translate("notifications.translationCacheRemoved"));
    }
  }

  return {
    provideLanguageCode, getTranslationStates, applyTranslationStates,
    clearTranslationRequestsForCacheRemoval, resetTranslationCache,
  };
}
