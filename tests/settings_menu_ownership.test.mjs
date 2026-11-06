import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../Settings.js", import.meta.url), "utf8");
const performanceKeys = [
  "reduce-motion", "performance-frame-rate", "karaoke-bounce",
  "karaoke-line-transition", "karaoke-text-effects", "fade-blur",
  "highlight-mode", "text-shadow-enabled", "prefetch-enabled",
  "prefetch-video-enabled", "prefetch-word-details-enabled",
];
const appearanceKeys = [
  "text-shadow-color", "text-shadow-opacity", "text-shadow-blur", "highlight-intensity",
];
const costKeys = [
  "karaoke-bounce", "karaoke-line-transition", "karaoke-text-effects",
  "fade-blur", "highlight-mode", "text-shadow-enabled", "video-background",
];
const plain = (value) => JSON.parse(JSON.stringify(value));
const elements = (node) => Array.isArray(node) ? node.flatMap(elements)
  : node?.props ? [node, ...elements(node.props.children)] : [];

function harness(overrides = {}, initial = {}) {
  // Only the modal's final return is instrumented. All menu definitions,
  // catalog/search construction, registry traversal and save/reset handlers
  // are production code; host APIs and React's renderer are replaced below.
  const end = source.indexOf("\nfunction openConfig(");
  const rootReturn = source.lastIndexOf("\n  return react.createElement(", end);
  assert.ok(end > rootReturn && rootReturn > source.indexOf("const ConfigModal ="));
  const modalApi = `
    return { sidebarTabs, renderTabContent, buildSettingsRegistry,
      resetChangedEntries, renderChangedView, searchableSettings,
      navigateToDestination, pickSearchResult, pendingTabScrollRef, activeTab,
      handlePerformanceSettingChange, handleVisualConfigChange,
      handleAppearancePreviewChange };
  `;
  let frame = { slots: [], cursor: 0 };
  const useState = (initialValue) => {
    const current = frame, index = current.cursor++;
    if (!(index in current.slots)) {
      current.slots[index] = typeof initialValue === "function" ? initialValue() : initialValue;
    }
    return [current.slots[index], (next) => {
      current.slots[index] = typeof next === "function" ? next(current.slots[index]) : next;
    }];
  };
  const useMemo = (factory, deps) => {
    const current = frame, index = current.cursor++, previous = current.slots[index];
    if (!previous || !deps || deps.some((value, i) => !Object.is(value, previous.deps[i]))) {
      current.slots[index] = { value: factory(), deps };
    }
    return current.slots[index].value;
  };
  const react = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    Fragment: Symbol("Fragment"), memo: (component) => component,
    useState, useMemo,
    useRef: (current) => useMemo(() => ({ current }), []),
    useCallback: (callback, deps) => useMemo(() => callback, deps),
    useEffect: () => { frame.cursor++; },
    useLayoutEffect: () => { frame.cursor++; },
  };
  const saves = [], events = [], errors = [], updates = [];
  const context = vm.createContext({
    react, ...react, CONFIG: { visual: {} }, APP_NAME: "ivLyrics",
    I18n: { t: (key) => key, getAvailableLanguages: () => [] },
    StorageManager: {
      saveConfig: (key, value) => saves.push({ method: "saveConfig", key, value }),
      setItem: (key, value) => saves.push({ method: "setItem", key, value }),
    },
    Spicetify: { LocalStorage: { get: () => null }, Player: { data: {} } },
    Utils: { currentVersion: "test" },
    window: {
      dispatchEvent: (event) => events.push(event),
      addEventListener() {}, removeEventListener() {}, confirm: () => true,
    },
    document: { getElementById: () => null, querySelector: () => null },
    localStorage: { getItem: () => "dark" },
    navigator: { language: "en-US", languages: ["en-US"], platform: "MacIntel" },
    thresholdSizeLimit: { min: 0, max: 100, step: 5 },
    lyricContainerUpdate: () => updates.push("lyrics"),
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    console: { warn: (...args) => errors.push(args), error: (...args) => errors.push(args) },
  });
  vm.runInContext(source.slice(0, rootReturn) + modalApi + source.slice(rootReturn, end) + `
    globalThis.fixture = { ConfigModal, OptionList, SettingsSection, SettingsLayerMatrix,
      ConfigButton, ConfigSlider, ConfigSliderRange, SettingsLoadMeter, SettingsChoiceCards,
      hasSettingDefault, getSettingDefaultValue, isSettingChanged,
      getCurrentSettingsBackgroundMode, SETTINGS_BACKGROUND_MODE_KEY,
      catalog: typeof getPerformanceSettingsSections === "function" ? getPerformanceSettingsSections : null,
      canonical: typeof getCanonicalSettingsDestination === "function" ? getCanonicalSettingsDestination : null };
    Object.assign(CONFIG.visual, SETTINGS_DEFAULT_VALUES, SETTINGS_FALLBACK_DEFAULT_VALUES,
      { "gradient-background": true, "line-spacing": 8 });
  `, context, { filename: "Settings.js" });
  Object.assign(context.CONFIG.visual, overrides);
  const modalFrame = frame;
  const h = {
    ...context.fixture, saves, events, errors, updates, visual: context.CONFIG.visual,
    render() {
      frame = modalFrame;
      frame.cursor = 0;
      h.api = context.fixture.ConfigModal(initial);
      return h.api;
    },
    component(type, props) {
      const previous = frame;
      frame = { slots: [], cursor: 0 };
      try { return type(props); } finally { frame = previous; }
    },
    clearCalls() { saves.length = events.length = updates.length = errors.length = 0; },
  };
  h.render();
  return h;
}

// Unlike buildSettingsRegistry, this deliberately does not deduplicate keys:
// a correct registry must not hide a second physical editor in another tab.
function declarations(h, tree, tabId, sectionKey = null) {
  if (Array.isArray(tree)) return tree.flatMap((node) => declarations(h, node, tabId, sectionKey));
  if (!tree?.props) return [];
  const { props } = tree;
  if (tree.type === h.SettingsSection) sectionKey = props.sectionKey;
  const rows = [];
  const add = (item, onChange) => {
    if (item?.key) rows.push({ tabId, sectionKey, item, onChange: item.onChange || onChange });
  };
  if (tree.type === h.OptionList) Array.from(props.items || []).forEach((item) => add(item, props.onChange));
  if (tree.type === h.SettingsLayerMatrix) {
    for (const column of props.columns || []) {
      const onChange = column.onChange || props.onChange;
      if (column.toggle) add(column.toggle, onChange);
      Array.from(column.items || []).forEach((item) => add(item, onChange));
    }
  }
  const custom = typeof props.settingsRegistryItems === "function"
    ? props.settingsRegistryItems() : props.settingsRegistryItems;
  Array.from(custom || []).forEach(({ item, onChange }) => add(item, onChange));
  return [...rows, ...declarations(h, props.children, tabId, sectionKey)];
}

const allDeclarations = (h) => Array.from(h.api.sidebarTabs).flatMap(({ id }) =>
  declarations(h, h.api.renderTabContent(id), id));
const settingRows = (h, tree) => elements(tree).filter((node) => node.type === h.OptionList)
  .flatMap((node) => Array.from(node.props.items || []));

test("album-art mode shortcut has one LP settings owner, persistent saving and the normal reset path", () => {
  const key = "fullscreen-album-open-lp", h = harness();
  const physical = allDeclarations(h).filter(({ item }) => item.key === key);
  assert.equal(physical.length, 1);
  assert.equal(physical[0].tabId, "fullscreen");
  assert.equal(physical[0].sectionKey, "vinyl-mode");
  assert.equal(physical[0].item.defaultValue, true);
  assert.equal(h.getSettingDefaultValue(key), true);
  h.clearCalls();
  physical[0].onChange(key, false);
  assert.equal(h.visual[key], false);
  assert.deepEqual(h.saves, [{ method: "saveConfig", key, value: false }]);
  h.render();
  const registry = Array.from(h.api.buildSettingsRegistry()).filter(item => item.key === key);
  assert.equal(registry.length, 1);
  assert.equal(registry[0].tabId, "fullscreen");
  const search = Array.from(h.api.searchableSettings).filter(item => item.settingKey === key);
  assert.equal(search.length, 1);
  assert.equal(search[0].sectionKey, "fullscreen");
  h.clearCalls();
  h.api.resetChangedEntries(registry);
  assert.equal(h.visual[key], true);
  assert.deepEqual(h.saves, [{ method: "saveConfig", key, value: true }]);
});

test("instrumental previous-lyrics option has a persistent appearance owner and resets to off", () => {
  const key = "instrumental-break-keep-previous", h = harness();
  const physical = allDeclarations(h).filter(({ item }) => item.key === key);
  assert.equal(physical.length, 1);
  assert.equal(physical[0].tabId, "appearance");
  assert.equal(physical[0].sectionKey, "instrumental-break");
  assert.equal(physical[0].item.defaultValue, false);
  assert.equal(h.getSettingDefaultValue(key), false);
  h.clearCalls();
  physical[0].onChange(key, true);
  assert.equal(h.visual[key], true);
  assert.deepEqual(h.saves, [{ method: "saveConfig", key, value: true }]);
  h.render();
  const registry = Array.from(h.api.buildSettingsRegistry()).filter(entry => entry.key === key);
  assert.equal(registry.length, 1);
  assert.equal(registry[0].tabId, "appearance");
  h.clearCalls();
  h.api.resetChangedEntries(registry);
  assert.equal(h.visual[key], false);
  assert.deepEqual(h.saves, [{ method: "saveConfig", key, value: false }]);
});

test("Song Controls groups visibility and appearance under one searchable section without changing values", () => {
  const values = {
    "fullscreen-show-controls": false,
    "fullscreen-show-volume": false,
    "fullscreen-show-progress": false,
    "fullscreen-control-button-size": 44,
    "fullscreen-controls-background": true,
  };
  const keys = Object.keys(values), h = harness(values);
  const rows = allDeclarations(h).filter(({ item }) => keys.includes(item.key));
  assert.deepEqual(rows.map(({ item }) => item.key), keys);
  for (const { item, tabId, sectionKey, onChange } of rows) {
    assert.equal(tabId, "fullscreen", item.key);
    assert.equal(sectionKey, "controller-style", item.key);
    assert.equal(onChange, h.api.handleVisualConfigChange, item.key);
    assert.equal(item.defaultValue, values[item.key], item.key);
  }
  const sections = elements(h.api.renderTabContent("fullscreen"))
    .filter((node) => node.type === h.SettingsSection && node.props.sectionKey === "controller-style");
  assert.equal(sections.length, 1);
  assert.equal(sections[0].props.title, "settingsAdvanced.controllerStyle.title");
  const list = elements(sections[0]).find((node) => node.type === h.OptionList);
  const renderedKeys = () => elements(h.component(h.OptionList, list.props))
    .map((node) => node.props["data-setting-key"]).filter(Boolean);
  assert.deepEqual(renderedKeys(), [keys[0], ...keys.slice(3)], "hidden controls retain their dependent choices");
  h.visual[keys[0]] = true;
  assert.deepEqual(renderedKeys(), keys);
  h.visual[keys[0]] = values[keys[0]];
  assert.deepEqual(h.saves, [], "regrouping does not rewrite saved choices");

  const registry = Array.from(h.api.buildSettingsRegistry()).filter(({ key }) => keys.includes(key));
  assert.deepEqual(registry.map(({ key }) => key), keys);
  for (const entry of registry) {
    assert.equal(entry.tabId, "fullscreen");
    assert.equal(entry.sectionKey, "controller-style");
  }
  // The manual section anchor is unchanged; individual rows are discovered
  // from the mounted DOM (covered by the browser replay).
  const search = Array.from(h.api.searchableSettings).filter((entry) => entry.settingKey === "controller-style");
  assert.equal(search.length, 1);
  assert.equal(search[0].sectionKey, "fullscreen");
  h.api.pickSearchResult(search[0]);
  h.render();
  assert.equal(h.api.activeTab, "fullscreen");
  assert.equal(h.api.pendingTabScrollRef.current, "controller-style");
  const changed = h.api.renderChangedView();
  const group = elements(changed).find((node) =>
    node.props.className === "settings-changed-menu" && node.props.key === "fullscreen");
  const changedRows = settingRows(h, group).filter(({ key }) => keys.includes(key));
  assert.deepEqual(changedRows.map(({ key }) => key), keys);
  for (const row of changedRows) {
    assert.equal(row.jump.label, "settingsAdvanced.controllerStyle.title");
    row.jump.onClick();
    h.render();
    assert.equal(h.api.activeTab, "fullscreen");
    assert.equal(h.api.pendingTabScrollRef.current, row.key);
  }
  h.clearCalls();
  h.api.resetChangedEntries(registry);
  for (const key of keys) {
    assert.equal(h.visual[key], h.getSettingDefaultValue(key), key);
    assert.deepEqual(h.saves.filter((save) => save.key === key),
      [{ method: "saveConfig", key, value: h.getSettingDefaultValue(key) }]);
  }
});

test("production menus give persisted controls one tab owner, with Performance flags exclusive", () => {
  const h = harness();
  const rows = allDeclarations(h);
  const owners = new Map();
  for (const { item, tabId } of rows) {
    if (!h.hasSettingDefault(item.key) && item.key !== h.SETTINGS_BACKGROUND_MODE_KEY) continue;
    if (!owners.has(item.key)) owners.set(item.key, new Set());
    owners.get(item.key).add(tabId);
  }
  assert.deepEqual([...owners].filter(([, tabs]) => tabs.size > 1)
    .map(([key, tabs]) => [key, [...tabs]]), [], "registry deduplication cannot mask physical duplicates");
  for (const key of performanceKeys) {
    const editors = rows.filter(({ item }) => item.key === key);
    assert.equal(editors.length, 1, `${key} has one editable declaration`);
    assert.equal(editors[0].tabId, "performance", key);
    assert.equal(editors[0].onChange, h.api.handlePerformanceSettingChange, key);
  }
  for (const key of appearanceKeys) assert.deepEqual([...owners.get(key) || []], ["appearance"], key);
  assert.ok(!elements(h.api.renderTabContent("lyrics")).some((node) => node.props.sectionKey === "prefetch"));
  assert.deepEqual(h.saves, [], "building the menus does not persist values");
});

test("shared catalog, actual Performance rows and manual search agree on canonical owners", () => {
  const h = harness();
  assert.equal(typeof h.catalog, "function");
  assert.equal(typeof h.canonical, "function");
  const catalog = Array.from(h.catalog());
  const items = catalog.flatMap((section) => Array.from(section.items));
  assert.deepEqual(items.filter((item) => h.hasSettingDefault(item.key)).map((item) => item.key).sort(),
    [...performanceKeys].sort());
  assert.deepEqual(settingRows(h, h.api.renderTabContent("performance")).map((item) => item.key),
    items.map((item) => item.key));
  for (const section of catalog) {
    assert.ok(section.titleKey && section.subtitleKey, section.sectionKey);
    const searchSection = Array.from(h.api.searchableSettings).filter((entry) => entry.settingKey === section.sectionKey);
    assert.equal(searchSection.length, 1, `${section.sectionKey} has one manual section destination`);
    assert.equal(searchSection[0].sectionKey, "performance");
    for (const incomingTab of ["appearance", "lyrics", "performance"]) {
      assert.deepEqual(plain(h.canonical(incomingTab, section.sectionKey)),
        { tabId: "performance", settingKey: section.sectionKey });
    }
  }
  for (const key of performanceKeys) {
    for (const incomingTab of ["appearance", "lyrics", "performance"]) {
      assert.deepEqual(plain(h.canonical(incomingTab, key)), { tabId: "performance", settingKey: key });
    }
    const entries = Array.from(h.api.searchableSettings).filter((entry) => entry.settingKey === key);
    assert.equal(entries.length, 1, `${key} has one manual search destination`);
    assert.equal(entries[0].sectionKey, "performance", key);
    assert.ok(entries[0].i18nKeys.includes("tabs.performance"), `${key} has Performance search context`);
    assert.ok(!entries[0].i18nKeys.includes("tabs.appearance") && !entries[0].i18nKeys.includes("tabs.behavior"), key);
    h.api.pickSearchResult(entries[0]);
    h.render();
    assert.equal(h.api.activeTab, "performance");
    assert.equal(h.api.pendingTabScrollRef.current, key);
  }
  assert.ok(!Array.from(h.api.searchableSettings).some((entry) =>
    entry.settingKey === "video-background-settings" || entry.settingKey === "prefetch"));
  const video = Array.from(h.api.searchableSettings).filter((entry) => entry.settingKey === "video-background");
  assert.equal(video.length, 1);
  assert.equal(video[0].sectionKey, "appearance");
});

test("legacy prefetch and stale owner links resolve through real navigation and modal initialization", () => {
  const h = harness();
  assert.equal(typeof h.canonical, "function");
  for (const incomingTab of ["lyrics", "appearance", "performance"]) {
    assert.deepEqual(plain(h.canonical(incomingTab, "prefetch")),
      { tabId: "performance", settingKey: "performance-background-work" });
    h.api.navigateToDestination(incomingTab, "prefetch");
    h.render();
    assert.equal(h.api.activeTab, "performance");
    assert.equal(h.api.pendingTabScrollRef.current, "performance-background-work");
  }
  for (const [initialTab, initialSettingKey] of [
    ["lyrics", "prefetch"], ["appearance", "reduce-motion"], ["lyrics", "prefetch-enabled"],
  ]) {
    const linked = harness({}, { initialTab, initialSettingKey });
    assert.equal(linked.api.activeTab, "performance");
    assert.equal(linked.api.pendingTabScrollRef.current,
      initialSettingKey === "prefetch" ? "performance-background-work" : initialSettingKey);
  }
  for (const key of [...appearanceKeys, "video-background", "__background-mode"]) {
    assert.deepEqual(plain(h.canonical("appearance", key)), { tabId: "appearance", settingKey: key });
  }
  assert.deepEqual(plain(h.canonical("performance", "video-background")),
    { tabId: "appearance", settingKey: "video-background" });
  const linkedVideo = harness({}, { initialTab: "performance", initialSettingKey: "video-background" });
  assert.equal(linkedVideo.api.activeTab, "appearance");
  assert.equal(linkedVideo.api.pendingTabScrollRef.current, "video-background");
  assert.deepEqual(plain(h.canonical("lyrics", "karaoke-motion-style")),
    { tabId: "lyrics", settingKey: "karaoke-motion-style" });
});

test("registry and Changed settings retain real owners, jump targets and reset save paths", () => {
  const h = harness();
  for (const key of [...performanceKeys, ...appearanceKeys]) {
    const fallback = h.getSettingDefaultValue(key);
    h.visual[key] = typeof fallback === "boolean" ? !fallback
      : typeof fallback === "number" ? fallback + 1 : "#abcdef";
  }
  const registry = Array.from(h.api.buildSettingsRegistry());
  assert.deepEqual(h.errors, [], "every production tab was included in the registry");
  const physical = allDeclarations(h);
  for (const key of performanceKeys) {
    const entries = registry.filter((entry) => entry.key === key);
    assert.equal(entries.length, 1, key);
    assert.equal(entries[0].tabId, "performance", key);
    assert.equal(entries[0].onChange, h.api.handlePerformanceSettingChange, key);
    assert.equal(entries[0].sectionKey, physical.find(({ item }) => item.key === key).sectionKey, key);
  }
  for (const key of appearanceKeys) assert.equal(registry.find((entry) => entry.key === key)?.tabId, "appearance", key);
  const changed = h.api.renderChangedView();
  for (const tabId of ["performance", "appearance"]) {
    const group = elements(changed).find((node) => node.props.className === "settings-changed-menu" && node.props.key === tabId);
    assert.ok(group, `${tabId} changed group exists`);
    const keys = tabId === "performance" ? performanceKeys : appearanceKeys;
    const rows = settingRows(h, group);
    assert.deepEqual(rows.map((item) => item.key).sort(), [...keys].sort());
    for (const item of rows) {
      item.jump.onClick();
      h.render();
      assert.equal(h.api.activeTab, tabId);
      assert.equal(h.api.pendingTabScrollRef.current, item.key);
    }
  }
  // Exercise the actual OptionList row-reset button for the FPS control.
  const list = elements(changed).filter((node) => node.type === h.OptionList)
    .find((node) => node.props.items.some((item) => item.key === "performance-frame-rate"));
  const rendered = h.component(h.OptionList, list.props);
  const fps = elements(rendered).find((node) => node.props["data-setting-key"] === "performance-frame-rate");
  const reset = elements(fps).find((node) => node.props.className === "settings-reset-btn");
  assert.ok(reset);
  h.clearCalls();
  reset.props.onClick();
  assert.deepEqual(h.saves, [{ method: "saveConfig", key: "performance-frame-rate", value: 60 }]);
  h.clearCalls();
  h.api.resetChangedEntries(registry.filter((entry) => performanceKeys.includes(entry.key) || appearanceKeys.includes(entry.key)));
  for (const key of performanceKeys) {
    const fallback = h.getSettingDefaultValue(key);
    assert.equal(h.visual[key], fallback, key);
    assert.deepEqual(h.saves.filter((save) => save.key === key), [{ method: "saveConfig", key, value: fallback }]);
  }
  for (const key of appearanceKeys) {
    assert.equal(h.visual[key], h.getSettingDefaultValue(key), key);
    const saveKey = key.startsWith("text-shadow-") ? `ivLyrics:visual:${key}` : key;
    assert.ok(h.saves.some((save) => save.key === saveKey && save.value === h.getSettingDefaultValue(key)), key);
  }
  assert.equal(h.updates.length, performanceKeys.length + appearanceKeys.length);
  assert.ok(h.events.some((event) => event.type === "ivLyrics:settings-refresh" && event.detail.reset));
  assert.deepEqual(h.errors, []);
});

test("video row only navigates and is excluded from both the registry and rendered search", () => {
  const h = harness({ "video-background": true, "gradient-background": false });
  const tree = h.api.renderTabContent("performance");
  const rows = settingRows(h, tree);
  assert.ok(!rows.some((item) => item.key === "video-background"));
  const nav = rows.filter((item) => item.key === "video-background-settings");
  assert.equal(nav.length, 1);
  assert.equal(nav[0].type, h.ConfigButton);
  assert.equal(nav[0].searchable, false);
  assert.equal(h.hasSettingDefault(nav[0].key), false);
  const registry = Array.from(h.api.buildSettingsRegistry());
  assert.ok(!registry.some((entry) => ["video-background-settings", "video-background"].includes(entry.key)));
  const mode = registry.filter((entry) => entry.key === h.SETTINGS_BACKGROUND_MODE_KEY);
  assert.equal(mode.length, 1);
  assert.equal(mode[0].tabId, "appearance");
  const rendered = h.component(h.OptionList, { items: nav, onChange: h.api.handlePerformanceSettingChange });
  const configButton = elements(rendered).find((node) => node.type === h.ConfigButton);
  const buttonTree = h.component(h.ConfigButton, configButton.props);
  assert.equal(buttonTree.props["data-search-exclude"], "true", "the rendered navigation row is excluded from DOM search");
  const button = elements(buttonTree).find((node) => node.type === "button");
  h.clearCalls();
  const before = plain(h.visual);
  button.props.onClick({ target: {} });
  h.render();
  assert.equal(h.api.activeTab, "appearance");
  assert.equal(h.api.pendingTabScrollRef.current, "video-background");
  assert.deepEqual(plain(h.visual), before);
  assert.deepEqual(h.saves, []);
  assert.deepEqual(h.events, []);
  assert.ok(!Object.hasOwn(h.visual, "video-background-settings"));
  assert.deepEqual(h.errors, []);
});

test("Appearance's special background key keeps the editable preset and the default reset handler", () => {
  const h = harness({ "video-background": true, "gradient-background": false });
  const mode = Array.from(h.api.buildSettingsRegistry()).filter((entry) => entry.key === h.SETTINGS_BACKGROUND_MODE_KEY);
  assert.equal(mode.length, 1);
  assert.equal(mode[0].tabId, "appearance");
  const appearance = h.api.renderTabContent("appearance");
  const background = elements(appearance).find((node) => typeof node.props.settingsRegistryItems === "function"
    && node.props.settingsRegistryItems().some(({ item }) => item.key === h.SETTINGS_BACKGROUND_MODE_KEY));
  assert.ok(background);
  const cards = elements(h.component(background.type, background.props)).find((node) => node.type === h.SettingsChoiceCards);
  assert.ok(cards.props.options.some((option) => option.value === "video-background" && option.anchor === "video-background"));
  cards.props.onChange("video-background");
  assert.equal(h.getCurrentSettingsBackgroundMode(), "video-background");
  assert.ok(h.saves.some((save) => save.key === "video-background" && save.value === true));
  h.api.resetChangedEntries(mode);
  assert.equal(h.getCurrentSettingsBackgroundMode(), "gradient-background");
  assert.equal(h.visual["video-background"], false);
  assert.deepEqual(h.errors, []);
});

test("the meter still counts the seven original effects including Appearance's video mode", () => {
  const h = harness(Object.fromEntries(costKeys.map((key) => [key, true])));
  const meter = elements(h.api.renderTabContent("performance")).find((node) => node.type === h.SettingsLoadMeter);
  assert.ok(meter);
  assert.deepEqual(Array.from(meter.props.costKeys), costKeys);
  assert.equal(meter.props.frameKey, "performance-frame-rate");
  const summary = () => elements(h.component(h.SettingsLoadMeter, meter.props))
    .find((node) => node.type === "small").props.children.join("");
  assert.match(summary(), /7\/7/);
  h.visual["video-background"] = false;
  h.visual["blur-gradient-background"] = true;
  assert.match(summary(), /6\/7/);
  assert.deepEqual(h.saves, []);
});

test("changed rows retain setting identities when preceding rows disappear", () => {
  const h = harness();
  const items = performanceKeys.map((key) => ({ key, desc: key, type: h.ConfigSlider }));
  const rowKeys = (rows) => Array.from(h.component(h.OptionList, { items: rows, onChange() {} }).props.children)
    .flat().map((node) => node.props.key);
  assert.deepEqual(rowKeys(items), performanceKeys);
  assert.deepEqual(rowKeys(items.slice(1)), performanceKeys.slice(1));
});

test("toggles persist once per input event without replayable state-updater side effects", () => {
  const calls = [], states = [], effects = [];
  const context = vm.createContext({
    react: { memo: (component) => component, createElement: (type, props) => ({ type, props }) },
    useState: (initial) => [initial, (next) => states.push(next)],
    useRef: (current) => ({ current }), useEffect: (effect) => effects.push(effect),
    useCallback: (callback) => callback, ButtonSVG: "ButtonSVG", Spicetify: { SVGIcons: { check: "check" } },
  });
  vm.runInContext(source.slice(source.indexOf("const ConfigSlider ="), source.indexOf("const ConfigSliderRange ="))
    + "\nglobalThis.toggle = ConfigSlider;", context);
  const button = context.toggle({ defaultValue: false, onChange: (value) => calls.push(value) });
  effects.splice(0).forEach((effect) => effect());
  states.length = 0;
  button.props.onClick();
  button.props.onClick();
  assert.deepEqual(calls, [true, false], "rapid inputs use the latest toggle state");
  assert.deepEqual(states, [true, false], "queued state updates contain values, not persistence callbacks");
  const disabled = context.toggle({ defaultValue: false, disabled: true, onChange: (value) => calls.push(value) });
  disabled.props.onClick();
  assert.deepEqual(calls, [true, false]);
});
