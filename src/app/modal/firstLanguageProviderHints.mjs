const FIRST_LANGUAGE_KEYLESS_PROVIDER_IDS = new Set(["bing-translate", "google-translate"]);

// Translation and pronunciation are separate provider capabilities, so each
// one is checked on its own: keyless-only translation, and whether any enabled
// provider still has pronunciation turned on.
export function getFirstLanguageAIProviderHintState(manager) {
  try {
    const enabledProviders = manager?.getEnabledProviders?.() || [];
    const getProvidersFor = (capability) => (typeof manager?.getEnabledProvidersFor === "function"
      ? manager.getEnabledProvidersFor(capability) || []
      : enabledProviders.filter((provider) => provider?.supports?.[capability] === true));
    const translationProviders = getProvidersFor("translate");
    return {
      missingTranslation: translationProviders.length === 0,
      keylessTranslationOnly: translationProviders.length > 0
        && translationProviders.every((provider) => FIRST_LANGUAGE_KEYLESS_PROVIDER_IDS.has(provider?.id)),
      missingPronunciation: getProvidersFor("pronunciation").length === 0,
      hasPronunciationCapableProvider: enabledProviders.some((provider) => provider?.supports?.pronunciation === true),
    };
  } catch {
    return { missingTranslation: false, keylessTranslationOnly: false, missingPronunciation: false, hasPronunciationCapableProvider: false };
  }
}

export function getFirstLanguageAIProviderHintKey(state, wantsPronunciation) {
  if (wantsPronunciation && state.missingPronunciation) {
    // An enabled provider that can pronounce only needs its Pronunciation chip.
    return state.hasPronunciationCapableProvider
      ? "settings.aiProviders.noPronunciationProviders"
      : "firstLanguagePrompt.pronunciationAiProviderHint";
  }
  return state.keylessTranslationOnly ? "firstLanguagePrompt.aiProviderHint" : null;
}
