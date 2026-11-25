export function collectSettingsRegistry({
  sidebarTabs, renderTabContent, SettingsSection, OptionList, SettingsLayerMatrix, ConfigSlider,
  backgroundModeKey, hasSettingDefault, getCanonicalSettingsDestination, onRenderError,
}) {
  const entries = [];
  const seen = new Set();
  const add = (tabId, section, item, onChange, labelPrefix, matrix) => {
    if (!item || !item.key || seen.has(item.key)) return;
    if (item.key !== backgroundModeKey && !hasSettingDefault(item.key)) return;
    if (getCanonicalSettingsDestination(tabId, item.key).tabId !== tabId) return;
    seen.add(item.key);
    entries.push({
      key: item.key,
      tabId,
      sectionKey: section?.sectionKey || null,
      sectionTitle: section?.title || "",
      matrix: matrix || null,
      item: labelPrefix && !String(item.desc || "").startsWith(labelPrefix)
        ? { ...item, desc: `${labelPrefix} · ${item.desc}` }
        : item,
      onChange: item.onChange || onChange,
    });
  };
  const walk = (node, tabId, section) => {
    if (Array.isArray(node)) {
      node.forEach((child) => walk(child, tabId, section));
      return;
    }
    if (!node || typeof node !== "object" || !node.props) return;
    const props = node.props;
    let nextSection = section;
    if (node.type === SettingsSection) {
      nextSection = { sectionKey: props.sectionKey, title: props.title };
    }
    if (node.type === OptionList) {
      (props.items || []).forEach((item) => add(tabId, nextSection, item, props.onChange));
    }
    if (node.type === SettingsLayerMatrix) {
      (props.columns || []).forEach((column) => {
        const handler = column.onChange || props.onChange;
        // Search groups the whole column, so its cells share this identity.
        const matrix = {
          anchor: column.anchor,
          label: column.label,
          title: column.groupTitle || "",
          subtitle: column.subtitle || "",
        };
        if (column.toggle) add(tabId, nextSection, { ...column.toggle, type: ConfigSlider }, handler, "", matrix);
        (column.items || []).forEach((item) => add(tabId, nextSection, item, handler, column.label, matrix));
      });
    }
    // A function is evaluated only here, when the registry is built.
    const registryItems = typeof props.settingsRegistryItems === "function"
      ? props.settingsRegistryItems()
      : props.settingsRegistryItems;
    if (Array.isArray(registryItems)) {
      registryItems.forEach(({ item, onChange }) => add(tabId, nextSection, item, onChange));
    }
    walk(props.children, tabId, nextSection);
  };
  sidebarTabs.forEach((tab) => {
    try {
      walk(renderTabContent(tab.id), tab.id, null);
    } catch (error) {
      onRenderError(tab.id, error);
    }
  });
  return entries;
}

// Search text is read from item metadata before it reaches the DOM, so markup
// such as the <b> tags in option descriptions has to be flattened by hand.
const settingsSearchPlainText = (value) =>
  typeof value === "string"
    ? value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
    : "";

export function indexSettingsSearch(sidebarTabs, registry) {
  const tabLabels = new Map(sidebarTabs.map((tab) => [tab.id, tab.label]));
  const groups = new Map();
  const routing = new Map();
  const entries = [];
  registry.forEach((entry) => {
    if (entry.item.searchable === false) return;
    const tabLabel = tabLabels.get(entry.tabId) || entry.tabId;
    const name = settingsSearchPlainText(entry.item.desc);
    const desc = settingsSearchPlainText(entry.item.info);
    const matrix = entry.matrix;
    if (matrix && matrix.anchor) {
      // One result per layer: the whole table column is the destination, so
      // its cells and header only contribute search words.
      const resultKey = `${entry.tabId}:${matrix.anchor}`;
      routing.set(`${entry.tabId}:${entry.key}`, resultKey);
      routing.set(`${entry.tabId}:${matrix.anchor}`, resultKey);
      let group = groups.get(resultKey);
      if (!group) {
        const groupTitle = matrix.title || entry.sectionTitle || "";
        group = {
          resultKey,
          section: tabLabel,
          sectionKey: entry.tabId,
          settingKey: matrix.anchor,
          navItemId: entry.sectionKey || entry.tabId,
          name: `${groupTitle} - ${matrix.label}`.trim(),
          desc: matrix.subtitle || "",
          sectionLabel: "",
          i18nKeys: [],
          directKeywords: [groupTitle, matrix.label, matrix.anchor],
          contextKeywords: [tabLabel, entry.sectionTitle || ""],
          preferVisibleText: true,
        };
        groups.set(resultKey, group);
        entries.push(group);
      }
      group.i18nKeys.push(...(entry.item.i18nKeys || []));
      group.directKeywords.push(name, desc, entry.key);
      return;
    }
    entries.push({
      resultKey: `${entry.tabId}:${entry.key}`,
      section: tabLabel,
      sectionKey: entry.tabId,
      settingKey: entry.key,
      navItemId: entry.sectionKey || entry.tabId,
      name,
      desc,
      sectionLabel: entry.sectionTitle || "",
      i18nKeys: entry.item.i18nKeys || [],
      directKeywords: [
        ...(entry.item.keywords || []),
        name,
        desc,
        entry.key,
      ].filter(Boolean),
      contextKeywords: [tabLabel, entry.sectionTitle || ""].filter(Boolean),
      preferVisibleText: false,
    });
  });
  const finalized = entries
    .map((entry) => ({
      ...entry,
      i18nKeys: [...new Set(entry.i18nKeys.filter(Boolean))],
      directKeywords: [...new Set(entry.directKeywords.filter(Boolean))],
      contextKeywords: [...new Set(entry.contextKeywords.filter(Boolean))],
    }))
    .filter((entry) => entry.name || entry.desc);
  return { entries: finalized, routing };
}
