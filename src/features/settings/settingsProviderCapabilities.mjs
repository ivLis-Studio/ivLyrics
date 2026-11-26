const AI_ADDON_CAPABILITY_ORDER = Object.freeze([
  "pronunciation", "translate", "metadata", "tmi", "researchWebSearch",
  "lyricsStudy", "characterPronunciation", "culturalAnnotations", "wordSupplements", "motionDirection", "settingsAssistant",
]);

export const getOrderedAddonCapabilities = (supports) => {
  if (!supports || typeof supports !== "object") return [];
  const supported = Object.keys(supports).filter((capability) => supports[capability]);
  return [
    ...AI_ADDON_CAPABILITY_ORDER.filter((capability) => supported.includes(capability)),
    ...supported.filter((capability) => !AI_ADDON_CAPABILITY_ORDER.includes(capability)),
  ];
};

// Lyrics types a provider can be limited to, in lookup order.
export const LYRICS_PROVIDER_TYPE_COLUMNS = Object.freeze(["character", "word", "synced", "unsynced"]);

const SETTINGS_AI_CAPABILITY_LABELS = Object.freeze({
  pronunciation: ["settings.aiProviders.supports.pronunciation", "Pronunciation"],
  translate: ["settings.aiProviders.supports.translate", "Translation"],
  metadata: ["settings.aiProviders.supports.metadata", "Metadata"],
  tmi: ["settings.aiProviders.supports.tmi", "TMI"],
  researchWebSearch: ["settings.aiProviders.supports.researchWebSearch", "Research web search"],
  lyricsStudy: ["settings.aiProviders.supports.lyricsStudy", "Learning"],
  characterPronunciation: ["settings.aiProviders.supports.characterPronunciation", "Character pronunciation"],
  culturalAnnotations: ["settings.aiProviders.supports.culturalAnnotations", "Cultural context"],
  wordSupplements: ["settings.aiProviders.supports.wordSupplements", "Word details"],
  motionDirection: ["settings.aiProviders.supports.motionDirection", "Motion direction"],
  settingsAssistant: ["settings.aiProviders.supports.settingsAssistant", "Settings assistant"],
});

export const getSettingsAiCapabilityLabel = (translate, capability) => {
  const [key, fallback] = SETTINGS_AI_CAPABILITY_LABELS[capability]
    || [`settings.aiProviders.supports.${capability}`, capability];
  return translate(key) || fallback;
};

// Columns of the AI provider table: every capability an add-on declares, in
// the provider cards' order (pronunciation before translation).
export const getSettingsAiProviderColumns = (providers) => {
  const supports = {};
  (providers || []).forEach((provider) => {
    Object.keys(provider?.supports || {}).forEach((capability) => {
      if (provider.supports[capability]) supports[capability] = true;
    });
  });
  return getOrderedAddonCapabilities(supports);
};

export const getLyricsProviderGranularitySupport = (provider) => {
  const declared = new Set(
    (Array.isArray(provider?.supports?.karaokeGranularities)
      ? provider.supports.karaokeGranularities
      : [])
      .map(value => {
        const normalized = String(value || '').trim().toLowerCase();
        if (normalized === 'char' || normalized === 'letter') return 'character';
        if (normalized === 'token') return 'word';
        return normalized;
      })
  );
  if (provider?.supports?.character === true || provider?.supports?.karaokeCharacter === true) {
    declared.add('character');
  }
  if (provider?.supports?.word === true || provider?.supports?.karaokeWord === true) {
    declared.add('word');
  }
  const legacyGeneric = declared.size === 0 && provider?.supports?.karaoke === true;
  return {
    character: declared.has('character') || legacyGeneric,
    word: declared.has('word') || legacyGeneric
  };
};

// Return the existing DOM tree directly; do not introduce a remounting wrapper.

export function readLyricsProviderTypeSetting(manager, providerId, type) {
  if (typeof manager?.getAddonSetting !== "function") return true;
  let fallback = true;
  if (type === "character" || type === "word") {
    fallback = manager.getAddonSetting(providerId, "enable_karaoke", null) !== false;
  }
  return manager.getAddonSetting(providerId, `enable_${type}`, fallback) ?? true;
}

export function getLocalizedProviderDescription(description, readStoredLanguage, readCurrentLanguage) {
  if (!description) return "";
  if (typeof description === "string") return description;
  const locale = (readStoredLanguage() || readCurrentLanguage() || "en").replace(/"/g, "");
  const language = locale.split("-")[0] || "en";
  const chinese = language === "zh" ? (/tw|hant/i.test(locale) ? "zh-TW" : "zh-CN") : null;
  return description[locale] || (chinese && description[chinese]) || description[language]
    || description.en || Object.values(description)[0] || "";
}
