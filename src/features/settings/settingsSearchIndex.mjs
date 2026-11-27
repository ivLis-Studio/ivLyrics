import { SETTINGS_TAB_TRANSLATION_KEYS } from "./settingsMenuMetadata.mjs";

// Menus the search index reads. The changed-settings view and the assistant
// chat repeat rows from other menus, so indexing them would duplicate results.
const SETTINGS_SEARCHABLE_TAB_SELECTOR =
  '.tab-content[data-tab-id]:not([data-tab-id="search"]):not([data-tab-id="changed"]):not([data-tab-id="assistant"])';

const STANDALONE_TABS = new Set(["lyrics-providers", "ai-providers"]);
const TAB_FALLBACK_LABELS = {
  "lyrics-providers": "Lyrics Providers",
  "ai-providers": "AI Providers",
};

const readOwnedText = (node, selector) => {
  const isSettingRow = node.classList.contains("setting-row");
  for (const candidate of node.querySelectorAll(selector)) {
    const owningRow = candidate.closest(".setting-row");
    const owned = isSettingRow ? owningRow === node
      : !owningRow && candidate.closest("[data-setting-key]") === node;
    if (owned) return candidate.textContent?.replace(/\s+/g, " ").trim() || "";
  }
  return "";
};

const readNodeTextWithoutNestedSettings = (node) => {
  // Use native textContent for branches without another setting. Keep the live
  // subtree intact, including custom elements that may react to being cloned.
  const readText = (branch) => {
    if (!branch.querySelector("[data-setting-key]")) return branch.textContent;
    let text = "";
    for (const child of branch.childNodes) {
      if (child.nodeType === 1) {
        if (!child.hasAttribute("data-setting-key")) text += readText(child);
      } else if (child.nodeType === 3 || child.nodeType === 4) {
        text += child.nodeValue;
      }
    }
    return text;
  };
  return readText(node)?.replace(/\s+/g, " ").trim() || "";
};

function mergeSearchSetting(settingsByResultKey, candidate) {
  const existing = settingsByResultKey.get(candidate.resultKey);
  if (!existing) {
    settingsByResultKey.set(candidate.resultKey, candidate);
    return;
  }

  settingsByResultKey.set(candidate.resultKey, {
    ...existing,
    name: (candidate.preferVisibleText && candidate.name) || existing.name,
    desc: (candidate.preferVisibleText && candidate.desc) || existing.desc,
    sectionLabel: existing.sectionLabel || candidate.sectionLabel || "",
    i18nKeys: [...new Set([...(existing.i18nKeys || []), ...(candidate.i18nKeys || [])])],
    directKeywords: [...new Set([...(existing.directKeywords || []), ...(candidate.directKeywords || [])])],
    contextKeywords: [...new Set([...(existing.contextKeywords || []), ...(candidate.contextKeywords || [])])],
  });
}

// Adds a candidate's search words to an existing result without changing
// where it leads or how it is named.
function addSearchWords(settingsByResultKey, resultKey, candidate) {
  const existing = settingsByResultKey.get(resultKey);
  if (!existing) return;
  settingsByResultKey.set(resultKey, {
    ...existing,
    i18nKeys: [...new Set([...(existing.i18nKeys || []), ...(candidate.i18nKeys || [])])],
    directKeywords: [...new Set([...(existing.directKeywords || []), ...(candidate.directKeywords || [])])],
  });
}

function prepareSearchCatalog(searchableSettings, declaredIndex, translate) {
  const tabLabels = Object.fromEntries(Object.entries(SETTINGS_TAB_TRANSLATION_KEYS).map(([tabId, key]) => [
    tabId, translate(key) || TAB_FALLBACK_LABELS[tabId],
  ]));
  const baseSettings = new Map();
  const routedSettings = [];
  const manualByDestination = new Map(searchableSettings.map(setting => [
    `${setting.sectionKey}:${setting.settingKey}`, setting,
  ]));
  // Keep the complete guide-based index (settingsSearchCatalog.mjs) available
  // while only the active tab is mounted. Visible controls from the active tab
  // enrich the matching entries below without forcing every panel to exist.
  searchableSettings.forEach((setting) => {
    const resultKey = `${setting.sectionKey}:${setting.settingKey || "__tab__"}`;
    const candidate = {
      resultKey,
      section: setting.section,
      sectionKey: setting.sectionKey,
      settingKey: setting.settingKey || null,
      navItemId: setting.settingKey || setting.sectionKey,
      name: setting.name,
      desc: setting.desc || "",
      i18nKeys: setting.i18nKeys || [],
      directKeywords: [
        ...(setting.keywords || []),
        setting.name || "",
        setting.desc || "",
      ].filter(Boolean),
      contextKeywords: [setting.section || ""].filter(Boolean),
      preferVisibleText: false,
      ...(setting.isTabResult ? { isTabResult: true } : {}),
    };
    // A layer table cell is found through its column's single result.
    const groupKey = setting.settingKey ? declaredIndex.routing.get(resultKey) : undefined;
    if (groupKey && groupKey !== resultKey) routedSettings.push([groupKey, candidate]);
    else mergeSearchSetting(baseSettings, candidate);
  });

  // Only the active tab is mounted, so the DOM scan below cannot see rows in
  // other menus. The registry walks every menu's element tree and supplies
  // their search entries; the guide list above adds the aliases and the
  // translations in every language.
  for (const setting of declaredIndex.entries) mergeSearchSetting(baseSettings, setting);
  for (const [groupKey, candidate] of routedSettings) addSearchWords(baseSettings, groupKey, candidate);
  return { tabLabels, baseSettings, manualByDestination, routing: declaredIndex.routing };
}

function collectMountedSettings(container, { tabLabels, manualByDestination, routing }) {
  const rows = [];
  container
    .querySelectorAll(SETTINGS_SEARCHABLE_TAB_SELECTOR)
    .forEach((tabNode) => {
      const tabId = tabNode.getAttribute("data-tab-id");
      if (!tabId) return;

      const tabLabel = tabLabels[tabId] || tabId;
      if (!STANDALONE_TABS.has(tabId)) {
        rows.push({
          resultKey: `${tabId}:__tab__`,
          section: tabLabel,
          sectionKey: tabId,
          settingKey: null,
          navItemId: tabId,
          name: tabLabel,
          desc: "",
          i18nKeys: SETTINGS_TAB_TRANSLATION_KEYS[tabId] ? [SETTINGS_TAB_TRANSLATION_KEYS[tabId]] : [],
          directKeywords: [tabLabel],
          contextKeywords: [],
          isTabResult: true,
        });
      }

      let currentSectionKey = "";
      let currentSectionLabel = "";
      let currentSectionDescription = "";
      let unanchoredRowIndex = 0;

      tabNode.querySelectorAll("[data-setting-key], .setting-row").forEach((node) => {
        if (node.getAttribute("data-search-exclude") === "true") return;
        const explicitSettingKey = node.getAttribute("data-setting-key") || "";
        const isSectionTitle = node.classList.contains("section-title");
        if (isSectionTitle) {
          currentSectionKey = explicitSettingKey || currentSectionKey;
          currentSectionLabel = readOwnedText(node, "h3") || currentSectionLabel;
          currentSectionDescription =
            readOwnedText(node, "p") || currentSectionDescription;
        }

        const ancestorSettingKey = explicitSettingKey
          ? ""
          : node.closest("[data-setting-key]")?.getAttribute("data-setting-key") || "";
        const settingKey =
          explicitSettingKey || ancestorSettingKey || currentSectionKey || null;
        // Layer table cells and headers are indexed as their column.
        const groupResultKey = settingKey
          ? routing.get(`${tabId}:${settingKey}`)
          : undefined;
        const resultKey = groupResultKey || (explicitSettingKey
          ? `${tabId}:${explicitSettingKey}`
          : `${tabId}:${settingKey || "top"}:row-${unanchoredRowIndex++}`);

        const manualSetting = settingKey
          ? manualByDestination.get(`${tabId}:${settingKey}`)
          : null;
        const visibleName = readOwnedText(
          node,
          ".setting-name, .lyrics-provider-name, h3"
        );
        const visibleDescription = readOwnedText(
          node,
          ".setting-description, .lyrics-provider-summary, p"
        );
        const fallbackVisibleText = !visibleName && !visibleDescription
          ? readNodeTextWithoutNestedSettings(node)
          : "";
        const declaredSearchText = node.getAttribute("data-search-text") || "";
        if (
          !explicitSettingKey &&
          !visibleName &&
          !visibleDescription &&
          !fallbackVisibleText &&
          !declaredSearchText
        ) {
          return;
        }

        const name =
          visibleName ||
          manualSetting?.name ||
          fallbackVisibleText ||
          currentSectionLabel ||
          settingKey ||
          tabLabel;
        const description =
          visibleDescription ||
          manualSetting?.desc ||
          (isSectionTitle ? currentSectionDescription : currentSectionLabel) ||
          "";

        rows.push({
          resultKey,
          section: tabLabel,
          sectionKey: tabId,
          settingKey,
          navItemId: STANDALONE_TABS.has(tabId)
            ? tabId
            : currentSectionKey || tabId,
          name,
          desc: description,
          sectionLabel: groupResultKey || isSectionTitle ? "" : currentSectionLabel,
          i18nKeys: manualSetting?.i18nKeys || [],
          directKeywords: [
            ...(manualSetting?.keywords || []),
            manualSetting?.name || "",
            manualSetting?.desc || "",
            declaredSearchText,
            fallbackVisibleText,
          ].filter(Boolean),
          contextKeywords: [
            tabLabel,
            currentSectionLabel,
            currentSectionDescription,
          ].filter(Boolean),
          preferVisibleText: !isSectionTitle && !groupResultKey,
        });
      });
    });

  return rows;
}

export function useSettingsSearchIndex(react, {
  host, activeTab, changedView, containerRef, searchableSettings, translate, getDeclaredSearchIndex,
}) {
  const [discoveredSettings, setDiscoveredSettings] = react.useState([]);
  const catalogRef = react.useRef(null);
  const snapshotRef = react.useRef(null);

  // Keep catalog entries across tabs. Mounted labels and aliases can change
  // without recreating the search catalog or walking unmounted settings.
  react.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const declaredIndex = getDeclaredSearchIndex();
    const previousCatalog = catalogRef.current;
    if (!previousCatalog || previousCatalog.searchableSettings !== searchableSettings
        || previousCatalog.declaredIndex !== declaredIndex) {
      catalogRef.current = {
        searchableSettings, declaredIndex,
        catalog: prepareSearchCatalog(searchableSettings, declaredIndex, translate),
      };
    }
    const { catalog } = catalogRef.current;
    let frameId = null;
    let disposed = false;

    const scanMountedSettings = () => {
      frameId = null;
      if (disposed) return;
      const rows = collectMountedSettings(container, catalog);
      const signature = JSON.stringify(rows);
      if (snapshotRef.current?.catalog === catalog && snapshotRef.current.signature === signature) return;

      const settingsByResultKey = new Map(catalog.baseSettings);
      for (const row of rows) mergeSearchSetting(settingsByResultKey, row);
      snapshotRef.current = { catalog, signature };
      setDiscoveredSettings(Array.from(settingsByResultKey.values(), (setting, order) => ({ ...setting, order })));
    };

    const scheduleScan = () => {
      if (frameId == null) frameId = host.requestAnimationFrame(scanMountedSettings);
    };

    const observer = new host.MutationObserver(scheduleScan);
    container.querySelectorAll(SETTINGS_SEARCHABLE_TAB_SELECTOR).forEach((tabNode) => {
      observer.observe(tabNode, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["data-setting-key", "data-search-text", "data-search-exclude"],
      });
    });
    scheduleScan();

    return () => {
      disposed = true;
      observer.disconnect();
      if (frameId != null) host.cancelAnimationFrame(frameId);
    };
  }, [activeTab, changedView, searchableSettings]);

  return discoveredSettings;
}
