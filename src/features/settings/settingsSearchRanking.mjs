const normalizeSettingsSearchText = (value) =>
  String(value || "")
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/\s+/g, " ")
    .trim();

export const SETTINGS_SEARCH_RESULT_LIMIT = 60;

export function buildSettingsSearchEntries(discoveredSearchSettings, getTranslations) {
  return discoveredSearchSettings.map((setting) => {
    const directTranslations = [];
    const contextTranslations = [];
    (setting.i18nKeys || []).forEach((key) => {
      const translations = getTranslations(key) || [];
      if (setting.isTabResult || !/^(tabs|sections)\./.test(key)) {
        directTranslations.push(...translations);
      } else {
        contextTranslations.push(...translations);
      }
    });
    const directKeywords = (setting.directKeywords || []).join(" ");
    const contextKeywords = (setting.contextKeywords || []).join(" ");
    const directSearchText = normalizeSettingsSearchText([
      setting.name,
      setting.desc,
      setting.settingKey,
      directTranslations.join(" "),
      directKeywords,
    ].join(" "));
    const contextSearchText = normalizeSettingsSearchText([
      setting.section,
      contextTranslations.join(" "),
      contextKeywords,
    ].join(" "));

    return {
      setting,
      directSearchText,
      searchText: `${directSearchText} ${contextSearchText}`.trim(),
      normalizedName: normalizeSettingsSearchText(setting.name),
      normalizedDescription: normalizeSettingsSearchText(setting.desc),
    };
  });
}

export function rankSettingsSearchEntries(searchQuery, searchableSettingEntries) {
  const query = normalizeSettingsSearchText(searchQuery);
  if (!query) return [];

  const tokens = [...new Set(query.split(" ").filter(Boolean))];
  const rankEntry = (entry) => {
    if (entry.normalizedName === query) return 0;
    if (entry.normalizedName.startsWith(query)) return 1;
    if (tokens.every((token) => entry.normalizedName.includes(token))) return 2;
    if (tokens.every((token) => entry.normalizedDescription.includes(token))) return 3;
    if (tokens.every((token) => entry.directSearchText.includes(token))) return 4;
    return 5;
  };

  return searchableSettingEntries
    .filter(({ directSearchText, searchText }) => {
      const directMatch = tokens.every((token) => directSearchText.includes(token));
      if (directMatch) return true;

      return (
        tokens.length > 1 &&
        tokens.some((token) => directSearchText.includes(token)) &&
        tokens.every((token) => searchText.includes(token))
      );
    })
    .map((entry) => ({ entry, rank: rankEntry(entry) }))
    .sort((a, b) =>
      a.rank - b.rank || a.entry.setting.order - b.entry.setting.order
    )
    .map(({ entry }) => entry.setting);
}
