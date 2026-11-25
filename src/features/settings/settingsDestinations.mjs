import { isCdSettingsKey } from './settingsCdCatalog.mjs';

export function createSettingsDestinationResolver(getPerformanceSettingsSections) {
  let performanceKeys = null;
  return (tabId, settingKey) => {
    if (!settingKey) return { tabId, settingKey };
    if (isCdSettingsKey(settingKey)) {
      return { tabId: "fullscreen", settingKey };
    }
    if (settingKey === "video-background") return { tabId: "appearance", settingKey };
    if (settingKey === "prefetch") {
      return { tabId: "performance", settingKey: "performance-background-work" };
    }
    // Ownership is static; don't rebuild translated controls for every row in
    // the registry or every navigation event.
    performanceKeys ??= new Set(getPerformanceSettingsSections().flatMap((section) => [
      section.sectionKey,
      ...section.items.filter((item) => item.searchable !== false).map((item) => item.key),
    ]));
    return { tabId: performanceKeys.has(settingKey) ? "performance" : tabId, settingKey };
  };
}
