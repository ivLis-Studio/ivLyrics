const normalizeSettingsSearchText = (value) =>
  String(value || "")
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/\s+/g, " ")
    .trim();

export const SETTINGS_SEARCH_RESULT_LIMIT = 60;

export function buildSettingsSearchEntries(discoveredSearchSettings, getTranslations) {
  const translationsByKey = new Map();
  return discoveredSearchSettings.map((setting) => {
    const directTranslations = [];
    const contextTranslations = [];
    (setting.i18nKeys || []).forEach((key) => {
      // Section and tab keys repeat across many rows. A lookup walks all loaded languages.
      if (!translationsByKey.has(key)) translationsByKey.set(key, getTranslations(key) || []);
      const translations = translationsByKey.get(key);
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

  const tokens = [...new Set(query.split(" "))];
  const matches = [];
  for (const entry of searchableSettingEntries) {
    let directMatches = 0;
    for (const token of tokens) {
      if (entry.directSearchText.includes(token)) directMatches++;
    }
    if (directMatches === 0) continue;
    const directMatch = directMatches === tokens.length;
    if (!directMatch && !tokens.every((token) => entry.searchText.includes(token))) continue;

    let rank = directMatch ? 4 : 5;
    if (entry.normalizedName === query) rank = 0;
    else if (entry.normalizedName.startsWith(query)) rank = 1;
    else if (tokens.every((token) => entry.normalizedName.includes(token))) rank = 2;
    else if (tokens.every((token) => entry.normalizedDescription.includes(token))) rank = 3;
    matches.push({ entry, rank });
  }

  return matches
    .sort((a, b) => a.rank - b.rank || a.entry.setting.order - b.entry.setting.order)
    .map(({ entry }) => entry.setting);
}
