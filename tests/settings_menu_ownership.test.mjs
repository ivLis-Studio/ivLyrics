import { readSettingsFixture } from "./fixtures/legacy-page-source.mjs";
import { createSettingsTextControls } from "../src/features/settings/settingsTextControls.mjs";
import { createSettingsOptionList } from "../src/features/settings/settingsOptionList.mjs";
import { createSettingsLayerMatrix } from "../src/features/settings/settingsLayerMatrix.mjs";
import { createChangedSettingsView } from "../src/features/settings/settingsChangedView.mjs";
import { SETTINGS_BACKGROUND_MODE_KEY, SETTINGS_DEFAULT_VALUES, SETTINGS_FALLBACK_DEFAULT_VALUES } from "../src/features/settings/settingsDefaults.mjs";
import { createChangedSettingsTracker } from "../src/features/settings/createChangedSettingsTracker.mjs";
import { useChangedSettingsCounts } from "../src/features/settings/settingsChangedView.mjs";
import { useSettingsSearchIndex } from "../src/features/settings/settingsSearchIndex.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readSettingsFixture();
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

test("config notifications replace the changed setting keys when the menu counts stay the same", () => {
  const [first, second] = ["prefetch-video-enabled", "prefetch-word-details-enabled"];
  const registry = [first, second].map(key => ({ key, tabId: "performance" }));
  const states = [registry], effects = [], frames = new Map();
  let nextFrame = 0;
  const host = Object.assign(new EventTarget(), {
    requestAnimationFrame(callback) { frames.set(++nextFrame, callback); return nextFrame; },
    cancelAnimationFrame: id => frames.delete(id),
  });
  let stateIndex = 0;
  const react = {
    useState(initial) {
      const index = stateIndex++;
      states[index] ??= typeof initial === "function" ? initial() : initial;
      return [states[index], update => { states[index] = update(states[index]); }];
    },
    useEffect: effect => effects.push(effect),
  };
  let changedKey = first;
  useChangedSettingsCounts(react, {
    host, readSettingsRegistry: () => registry, isSettingChanged: key => key === changedKey, isChangedView: false,
  });
  const dispose = effects.at(-1)();
  try {
    const before = states[1];
    changedKey = second;
    for (const name of [first, second]) {
      host.dispatchEvent(new CustomEvent("ivLyrics", { detail: { type: "config", name } }));
    }
    assert.equal(frames.size, 1);
    frames.get(1)();
    assert.equal(states[1].total, before.total);
    assert.deepEqual(states[1].byTab, before.byTab);
    assert.deepEqual(states[1].keys, [second]);
  } finally {
    dispose();
  }
});

test("named settings changes only reread the affected values and aliases", () => {
  const reads = [];
  const changed = new Set();
  const registry = [
    { key: "font-size", tabId: "appearance" },
    { key: SETTINGS_BACKGROUND_MODE_KEY, tabId: "appearance" },
    { key: "prefetch-enabled", tabId: "performance" },
  ];
  const tracker = createChangedSettingsTracker(registry, key => {
    reads.push(key);
    return changed.has(key);
  });
  assert.equal(tracker.readCounts().total, 0);
  assert.deepEqual(reads.splice(0), registry.map(entry => entry.key));

  changed.add("prefetch-enabled");
  changed.add(SETTINGS_BACKGROUND_MODE_KEY);
  for (const key of ["prefetch-enabled", "video-background", "background-mode", "prefetch-enabled"]) {
    tracker.invalidate(key);
  }
  const counts = tracker.readCounts();
  assert.deepEqual(reads.splice(0), ["prefetch-enabled", SETTINGS_BACKGROUND_MODE_KEY]);
  assert.deepEqual(counts, {
    total: 2, byTab: { appearance: 1, performance: 1 }, keys: [SETTINGS_BACKGROUND_MODE_KEY, "prefetch-enabled"],
  });
  assert.equal(tracker.readCounts(), counts);
  assert.equal(reads.length, 0);

  changed.clear();
  tracker.invalidate("extension-bulk-settings");
  assert.equal(tracker.readCounts().total, 0);
  assert.deepEqual(reads, registry.map(entry => entry.key));
});

test("search updates live text and aliases without rebuilding the catalog across settings tabs", () => {
  let nextFrame = 0;
  const frames = new Map();
  let observer;
  const host = {
    requestAnimationFrame(callback) { frames.set(++nextFrame, callback); return nextFrame; },
    cancelAnimationFrame(id) { frames.delete(id); },
    MutationObserver: class {
      constructor(callback) { this.notify = callback; observer = this; }
      observe(_element, options) { this.options = options; }
      disconnect() { this.disconnected = true; }
    },
  };
  const refSlots = [];
  let refIndex;
  let activate;
  let results;
  const react = {
    useState: () => [results || [], value => { results = value; }],
    useRef: initial => refSlots[refIndex++] ??= { current: initial },
    useEffect: effect => { activate = effect; },
  };
  const attributes = new Map([["data-setting-key", "font-size"]]);
  const label = { textContent: "Live font", closest: () => row };
  const row = {
    classList: { contains: key => key === "setting-row" },
    getAttribute: key => attributes.get(key),
    querySelectorAll: selector => selector.includes(".setting-name") ? [label] : [],
  };
  const panel = { getAttribute: () => "appearance", querySelectorAll: () => [row] };
  const containerRef = { current: { querySelectorAll: () => [panel] } };
  const searchableSettings = [{ sectionKey: "appearance", settingKey: "font-size", name: "Catalog font" }];
  const declaredIndex = { entries: [], routing: new Map() };
  let translations = 0;
  const render = activeTab => {
    refIndex = 0;
    useSettingsSearchIndex(react, {
      host, activeTab, containerRef, searchableSettings, getDeclaredSearchIndex: () => declaredIndex,
      translate: key => { translations++; return key; },
    });
    return activate();
  };
  const flush = () => {
    const callbacks = [...frames.values()];
    frames.clear();
    callbacks.forEach(callback => callback());
  };
  const entry = () => results.find(result => result.resultKey === "appearance:font-size");

  const dispose = render("appearance");
  assert.equal(observer.options.characterData, true);
  assert.ok(observer.options.attributeFilter.includes("data-search-text"));
  flush();
  assert.equal(entry().name, "Live font");
  const initialTranslations = translations;
  const first = results;
  observer.notify();
  observer.notify();
  assert.equal(frames.size, 1);
  flush();
  assert.equal(results, first);

  label.textContent = "Live font revised";
  attributes.set("data-search-text", "new alias");
  observer.notify();
  flush();
  assert.equal(entry().name, "Live font revised");
  assert.ok(entry().directKeywords.includes("new alias"));

  observer.notify();
  dispose();
  assert.equal(observer.disconnected, true);
  assert.equal(frames.size, 0);
  attributes.set("data-search-exclude", "true");
  const disposeNext = render("performance");
  flush();
  assert.equal(entry().name, "Catalog font");
  assert.equal(entry().directKeywords.includes("new alias"), false);
  assert.equal(translations, initialTranslations);
  disposeNext();
});

function harness(overrides = {}, initial = {}, options = {}) {
  // Only the modal's final return is instrumented. All menu definitions,
  // catalog/search construction, registry traversal and save/reset handlers
  // are production code; host APIs and React's renderer are replaced below.
  const end = source.indexOf("\nfunction openConfig(");
  const rootReturn = source.lastIndexOf("\n  return react.createElement(", end);
  assert.ok(end > rootReturn && rootReturn > source.indexOf("const ConfigModal ="));
  const modalApi = `
    return { sidebarTabs, renderTabContent, buildSettingsRegistry,
      resetChangedEntries: changedSettings.resetChangedEntries, renderChangedView: changedSettings.renderChangedView,
      searchableSettings: search.searchableSettings,
      getDeclaredSearchIndex,
      searchResults: search.searchResults, handleSearchChange: search.handleSearchChange,
      tree: globalThis.__settingsTree,
      navigateToDestination, pickSearchResult: search.pickSearchResult, pendingNavigationRef: navigation.pendingNavigationRef, activeTab,
      handlePerformanceSettingChange, handleVisualConfigChange,
      handleAppearancePreviewChange };
  `;
  // Effects only run when the modal tree is built, because refs and the DOM
  // scan live in that tree. The default harness stops before building it.
  const injected = options.runEffects
    ? (() => {
      const treeSource = source.slice(rootReturn, end);
      const closing = treeSource.lastIndexOf("\n};");
      const assignment = treeSource.slice(0, closing).replace(
        "\n  return ",
        "\n  globalThis.__settingsTree = "
      );
      return assignment + modalApi + treeSource.slice(closing);
    })()
    : modalApi + source.slice(rootReturn, end);
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
  const effects = [];
  const searchContainer = {
    querySelectorAll: () => [],
    addEventListener() {}, removeEventListener() {},
    scrollTo() {}, getBoundingClientRect: () => ({ top: 0, height: 0 }),
  };
  const react = {
    createElement: (type, props, ...children) => {
      if (options.runEffects && props?.ref) props.ref.current = searchContainer;
      return { type, props: { ...props, children } };
    },
    Fragment: Symbol("Fragment"), memo: (component) => component,
    useState, useMemo,
    useRef: (current) => useMemo(() => ({ current }), []),
    useCallback: (callback, deps) => useMemo(() => callback, deps),
    useEffect: (effect) => { frame.cursor++; if (options.runEffects) effects.push(effect); },
    useLayoutEffect: () => { frame.cursor++; },
  };
  const saves = [], events = [], errors = [], updates = [];
  const context = vm.createContext({
    SETTINGS_DEFAULT_VALUES, SETTINGS_FALLBACK_DEFAULT_VALUES,
    react, ...react, CONFIG: { visual: {} }, APP_NAME: "ivLyrics",
    I18n: { t: (key) => key, getAvailableLanguages: () => [] },
    StorageManager: {
      saveConfig: (key, value) => saves.push({ method: "saveConfig", key, value }),
      saveConfigs(values) {
        for (const [key, value] of Object.entries(values)) this.saveConfig(key, value);
      },
      setItem: (key, value) => saves.push({ method: "setItem", key, value }),
    },
    Spicetify: { LocalStorage: { get: () => null }, Player: { data: {} } },
    Utils: { currentVersion: "test" },
    window: {
      dispatchEvent: (event) => events.push(event),
      addEventListener() {}, removeEventListener() {}, confirm: () => true,
      requestAnimationFrame(callback) { callback(); return 0; },
      cancelAnimationFrame() {},
      MutationObserver: class { observe() {} disconnect() {} },
      lyricContainer: { refreshLyricsView: () => updates.push("lyrics") },
    },
    document: {
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: () => ({
        style: {}, classList: { add() {}, remove() {}, toggle() {} },
        setAttribute() {}, appendChild() {}, addEventListener() {}, removeEventListener() {},
      }),
      addEventListener() {}, removeEventListener() {},
    },
    localStorage: { getItem: () => "dark", setItem() {}, removeItem() {} },
    MutationObserver: class { observe() {} disconnect() {} },
    navigator: { language: "en-US", languages: ["en-US"], platform: "MacIntel" },
    requestAnimationFrame: (callback) => { callback(); return 0; },
    cancelAnimationFrame: () => {},
    thresholdSizeLimit: { min: 0, max: 100, step: 5 },
    SETTINGS_MODAL_CSS: "",
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    console: { warn: (...args) => errors.push(args), error: (...args) => errors.push(args) },
  });
  vm.runInContext(source.slice(0, rootReturn) + injected + `
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
    runEffects() {
      for (const effect of effects.splice(0)) {
        try { effect(); } catch (error) { errors.push(error); }
      }
    },
    clearCalls() { saves.length = events.length = updates.length = errors.length = 0; },
  };
  h.render();
  return h;
}

// The search panel can only read settings from the active tab's DOM, so the
// hand-maintained index is the only cross-tab source. Anything missing there
// cannot be found without first opening its menu.
test("search index reaches every setting from any tab", () => {
  const h = harness();
  const indexed = new Map(
    [...h.api.searchableSettings, ...h.api.getDeclaredSearchIndex().entries]
      .map((entry) => [`${entry.sectionKey}:${entry.settingKey}`, entry])
  );
  const routing = h.api.getDeclaredSearchIndex().routing;
  const missing = [...new Set(allDeclarations(h)
    .filter(({ item }) => item.key && item.searchable !== false && h.hasSettingDefault(item.key))
    .filter(({ item, tabId }) => {
      const entry = indexed.get(`${tabId}:${item.key}`);
      if (entry && (entry.name || entry.desc)) return false;
      // Layer table cells are searchable through their column's group entry.
      const group = indexed.get(routing.get(`${tabId}:${item.key}`));
      return !group || !(group.name || group.desc);
    })
    .map(({ item, tabId }) => `${tabId}:${item.key}`))].sort();
  assert.deepEqual(missing, [], `settings missing from search: ${missing.join(", ")}`);
});

test("every layer table collapses into one search entry per layer", () => {
  const h = harness();
  const entries = Array.from(h.api.getDeclaredSearchIndex().entries);
  const routing = h.api.getDeclaredSearchIndex().routing;
  const tables = [
    { tabId: "appearance", sectionKey: "lyric-layers" },
    { tabId: "fullscreen", sectionKey: "vinyl-typography" },
    { tabId: "nowplaying", sectionKey: "panel-lyrics-general" },
    { tabId: "ai-providers", sectionKey: "cultural-annotations" },
  ];
  for (const { tabId, sectionKey } of tables) {
    const matrices = elements(h.api.renderTabContent(tabId))
      .filter((node) => node.type === h.SettingsLayerMatrix);
    assert.ok(matrices.length > 0, `${tabId} has no layer table`);
    for (const matrix of matrices) {
      for (const column of matrix.props.columns) {
        const groupEntries = entries.filter((entry) => entry.settingKey === column.anchor);
        assert.equal(groupEntries.length, 1, `${column.anchor} should have exactly one search entry`);
        const entry = groupEntries[0];
        assert.ok(entry.name.endsWith(` - ${column.label}`), `${entry.name} should name its layer`);
        assert.equal(entry.navItemId, sectionKey);
        const searchText = [entry.name, entry.desc, ...entry.directKeywords].join(" ").toLowerCase();
        for (const item of column.items) {
          assert.ok(!entries.some((candidate) => candidate.settingKey === item.key),
            `${item.key} must not have its own search entry`);
          assert.equal(routing.get(`${tabId}:${item.key}`), entry.resultKey,
            `${item.key} should route to ${entry.resultKey}`);
          assert.ok(searchText.includes(item.key.toLowerCase()),
            `${entry.resultKey} should keep ${item.key} searchable`);
        }
        assert.equal(routing.get(`${tabId}:${column.anchor}`), entry.resultKey);
        if (column.toggle) {
          assert.equal(routing.get(`${tabId}:${column.toggle.key}`), entry.resultKey);
        }
      }
    }
  }
});

test("layer table search entries use the table title and selected layer", () => {
  const h = harness();
  const entries = new Map(Array.from(h.api.getDeclaredSearchIndex().entries)
    .map((entry) => [entry.settingKey, entry]));
  assert.equal(entries.get("pronunciation-style").name, "Lyric layers - Pronunciation");
  assert.equal(entries.get("furigana-style").name, "Lyric layers - Furigana");
  assert.equal(entries.get("vinyl-pronunciation-style").name, "Vinyl typography - Pronunciation");
  assert.equal(entries.get("vinyl-original-style").name, "Vinyl typography - Original");
  assert.match(entries.get("pronunciation-style").desc, /pronunciationStyle\.subtitle/);
});

test("search panel lists one result per layer and still matches property words", () => {
  const h = harness({}, {}, { runEffects: true });
  h.runEffects();
  h.render();
  const search = (query) => {
    h.api.handleSearchChange({ target: { value: query } });
    h.render();
    return h.api.searchResults;
  };
  const names = (results) => results.map((result) => result.name);

  const pronunciation = search("pronun");
  assert.ok(names(pronunciation).includes("Lyric layers - Pronunciation"), names(pronunciation).join(" | "));
  assert.equal(names(pronunciation).filter((name) => name === "Lyric layers - Pronunciation").length, 1);

  // The layer table cells themselves must not surface as separate results.
  const matrix = elements(h.api.renderTabContent("appearance"))
    .find((node) => node.type === h.SettingsLayerMatrix);
  const cellKeys = new Set(matrix.props.columns.flatMap((column) => column.items.map((item) => item.key)));
  assert.ok(!pronunciation.some((result) => cellKeys.has(result.settingKey)),
    "layer cells must not be separate results");

  const outline = search("outline");
  assert.ok(names(outline).some((name) => name.startsWith("Lyric layers - ")), names(outline).join(" | "));

  // Panel and annotation tables group the same way.
  const panelMatrix = elements(h.api.renderTabContent("nowplaying"))
    .find((node) => node.type === h.SettingsLayerMatrix);
  const panelCellKeys = new Set(panelMatrix.props.columns.flatMap((column) => column.items.map((item) => item.key)));
  assert.ok(!outline.some((result) => panelCellKeys.has(result.settingKey)),
    "panel cells must not be separate results");
  assert.ok(names(outline).includes("Panel Lyrics - Pronunciation"), names(outline).join(" | "));

  const vinyl = search("vinyl");
  assert.ok(names(vinyl).includes("Vinyl typography - Pronunciation"), names(vinyl).join(" | "));
});

test("off-tab search entries carry a readable name, section and destination", () => {
  const h = harness();
  const entries = new Map(h.api.getDeclaredSearchIndex().entries
    .map((entry) => [`${entry.sectionKey}:${entry.settingKey}`, entry]));
  for (const key of ["synced-pronunciation", "pronunciation-karaoke-fill"]) {
    const entry = entries.get(`lyrics:${key}`);
    assert.ok(entry, `${key} has no search entry`);
    assert.match(entry.name, /pronunciation/i, `${key} name is not searchable`);
    assert.equal(entry.navItemId, "karaoke-mode");
    assert.equal(entry.section, h.api.sidebarTabs.find((tab) => tab.id === "lyrics").label);
  }
});

test("manual and generated search entries merge into one result per destination", () => {
  const h = harness();
  const resultKeysByDestination = new Map();
  for (const entry of [...h.api.searchableSettings, ...h.api.getDeclaredSearchIndex().entries]) {
    if (!entry.settingKey) continue;
    const destination = h.canonical(entry.sectionKey, entry.settingKey);
    const destinationKey = `${destination.tabId}:${destination.settingKey}`;
    const resultKeys = resultKeysByDestination.get(destinationKey) || new Set();
    resultKeys.add(`${entry.sectionKey}:${entry.settingKey}`);
    resultKeysByDestination.set(destinationKey, resultKeys);
  }
  const duplicates = [...resultKeysByDestination]
    .filter(([, resultKeys]) => resultKeys.size > 1)
    .map(([destination]) => destination);
  assert.deepEqual(duplicates, [], `duplicate search destinations: ${duplicates.join(", ")}`);
});

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
  assert.equal(h.api.pendingNavigationRef.current?.settingKey, "controller-style");
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
    assert.equal(h.api.pendingNavigationRef.current?.settingKey, row.key);
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
    assert.equal(h.api.pendingNavigationRef.current?.settingKey, key);
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
    assert.equal(h.api.pendingNavigationRef.current?.settingKey, "performance-background-work");
  }
  for (const [initialTab, initialSettingKey] of [
    ["lyrics", "prefetch"], ["appearance", "reduce-motion"], ["lyrics", "prefetch-enabled"],
  ]) {
    const linked = harness({}, { initialTab, initialSettingKey });
    assert.equal(linked.api.activeTab, "performance");
    assert.equal(linked.api.pendingNavigationRef.current?.settingKey,
      initialSettingKey === "prefetch" ? "performance-background-work" : initialSettingKey);
  }
  for (const key of [...appearanceKeys, "video-background", "__background-mode"]) {
    assert.deepEqual(plain(h.canonical("appearance", key)), { tabId: "appearance", settingKey: key });
  }
  assert.deepEqual(plain(h.canonical("performance", "video-background")),
    { tabId: "appearance", settingKey: "video-background" });
  const linkedVideo = harness({}, { initialTab: "performance", initialSettingKey: "video-background" });
  assert.equal(linkedVideo.api.activeTab, "appearance");
  assert.equal(linkedVideo.api.pendingNavigationRef.current?.settingKey, "video-background");
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
      assert.equal(h.api.pendingNavigationRef.current?.settingKey, item.key);
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
  assert.equal(h.api.pendingNavigationRef.current?.settingKey, "video-background");
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

test("an already mounted option list uses the new declarations in the same render", () => {
  let cursor = 0;
  const slots = [];
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], next => { slots[index] = next; }];
    },
    useEffect() {},
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
  };
  const optionList = createSettingsOptionList({
    react, controls: {}, ownRowControls: [], getSettingsText: key => key,
  });
  const render = keys => {
    cursor = 0;
    return optionList({ items: keys.map(key => ({ type: "info", key, desc: key })) });
  };
  assert.deepEqual(render(["first", "second"]).props.children.map(row => row.props.key), ["first", "second"]);
  assert.deepEqual(render(["second"]).props.children.map(row => row.props.key), ["second"]);
});

test("typography table and narrow list use the same setting owner and reset failure handling", context => {
  context.mock.method(console, "error", () => {});
  const calls = [], refreshes = [], errors = [];
  const ConfigColorPicker = () => null;
  const ConfigSlider = () => null;
  const OptionList = () => null;
  const controls = { ConfigColorPicker, ConfigSlider, OptionList };
  const visual = { "show-layer": true };
  let layout = "table";
  let currentColor = "#123456";
  let saveFails = false;
  const react = {
    useRef: current => ({ current }),
    useState: initial => [initial === "table" ? layout : initial, () => {}],
    useEffect() {},
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
  };
  const matrix = createSettingsLayerMatrix({
    react, getControls: () => controls, getVisualSettings: () => visual, useSettingsConfigRevision() {},
    getSettingsText: key => key, getSettingDefaultValue: () => "#ffffff",
    hasSettingDefault: () => true, isSettingChanged: () => true,
    publishSettingsRefresh: key => refreshes.push(key), onSaveError: error => errors.push(error.message),
  });
  const item = {
    key: "original-outline-color", type: ConfigColorPicker, row: "outlineColor",
    readConfiguredValue: () => currentColor,
    onChange(key, value) {
      if (saveFails) throw new Error("storage unavailable");
      calls.push([key, value]);
      currentColor = value;
    },
  };
  const props = {
    columns: [{ id: "original", label: "Original", toggle: { key: "show-layer" }, items: [item] }],
    rows: [{ id: "outlineColor", label: "Outline color" }],
    onChange: () => assert.fail("the cell's save handler owns the setting"),
  };
  const rows = () => elements(matrix(props));
  const colorEditor = rows().find(node => node.type === ConfigColorPicker);
  colorEditor.props.onChange("#001122");
  assert.deepEqual(calls, [[item.key, "#001122"]]);
  const reset = rows().find(node => node.props.className === "settings-reset-btn is-cell");
  saveFails = true;
  reset.props.onClick();
  assert.equal(currentColor, "#001122");
  assert.deepEqual(refreshes, []);
  assert.deepEqual(errors, ["storage unavailable"]);
  saveFails = false;
  reset.props.onClick();
  assert.equal(currentColor, "#ffffff");
  assert.deepEqual(refreshes, [item.key]);

  visual["show-layer"] = false;
  const disabledEditor = rows().find(node => node.type === ConfigColorPicker);
  assert.equal(disabledEditor.props.disabled, true);
  assert.equal(disabledEditor.props.onChange("#334455"), false);
  layout = "tabs";
  assert.equal(rows().find(node => node.type === OptionList).props.items[1].when(), false);
  visual["show-layer"] = true;
  const narrowItem = rows().find(node => node.type === OptionList).props.items[1];
  assert.equal(narrowItem.when(), true);
  assert.equal(narrowItem.defaultValue, "#ffffff");
  assert.equal(narrowItem.onChange, item.onChange);
});

test("resetting changed settings reports storage errors once and keeps other successful writes", context => {
  context.mock.method(console, "error", () => {});
  const saved = [], errors = [];
  let refreshes = 0;
  const view = createChangedSettingsView({}, {
    publishReset: () => { refreshes++; },
    onSaveError: error => errors.push(error.message),
  });
  const entry = (key, { onChange, ...attributes } = {}) => ({
    key, item: { key, ...attributes }, onChange: onChange || ((name, value) => saved.push([name, value])),
  });
  const failed = () => { throw new Error("write rejected"); };
  const resettable = entry("performance-frame-rate");
  const untouched = [
    entry("prefetch-enabled", { disabled: () => true }),
    entry("highlight-mode", { noReset: true }),
    entry("fade-blur", { onChange: () => false }),
    entry("karaoke-line-transition", { onChange: failed }),
    entry("karaoke-text-effects", { onChange: failed }),
  ];

  view.resetChangedEntries(untouched);
  assert.deepEqual(saved, []);
  assert.deepEqual(errors, ["write rejected"]);
  assert.equal(refreshes, 0);
  errors.length = 0;
  view.resetChangedEntries([...untouched, resettable]);
  assert.deepEqual(saved, [["performance-frame-rate", 60]]);
  assert.deepEqual(errors, ["write rejected"]);
  assert.equal(refreshes, 1);
});

test("toggles persist once per input event without replayable state-updater side effects", () => {
  const calls = [], states = [], effects = [];
  const react = {
    memo: (component) => component,
    createElement: (type, props) => ({ type, props }),
    useState: (initial) => [initial, (next) => states.push(next)],
    useRef: (current) => ({ current }), useEffect: (effect) => effects.push(effect),
    useCallback: (callback) => callback,
  };
  const { ConfigSlider } = createSettingsTextControls({ react, getCheckIcon: () => "check" });
  const button = ConfigSlider({ defaultValue: false, onChange: (value) => calls.push(value) });
  effects.splice(0).forEach((effect) => effect());
  states.length = 0;
  button.props.onClick();
  button.props.onClick();
  assert.deepEqual(calls, [true, false], "rapid inputs use the latest toggle state");
  assert.deepEqual(states, [true, false], "queued state updates contain values, not persistence callbacks");
  const disabled = ConfigSlider({ defaultValue: false, disabled: true, onChange: (value) => calls.push(value) });
  disabled.props.onClick();
  assert.deepEqual(calls, [true, false]);
});

test("a toggle keeps its last saved value when a write fails and retries the same change", (context) => {
  const calls = [], states = [], errors = [];
  const react = {
    memo: component => component,
    createElement: (type, props) => ({ type, props }),
    useState: initial => [initial, next => states.push(next)],
    useRef: current => ({ current }),
    useEffect: () => {},
    useCallback: callback => callback,
  };
  const failure = new Error("Storage is full");
  context.mock.method(console, "error", () => {});
  const { ConfigSlider } = createSettingsTextControls({
    react, getCheckIcon: () => "check", onSaveError: error => errors.push(error),
  });
  const button = ConfigSlider({ defaultValue: false, onChange(value) {
    calls.push(value);
    if (calls.length === 1) throw failure;
  } });

  button.props.onClick();
  assert.deepEqual(states, []);
  assert.deepEqual(errors, [failure]);
  button.props.onClick();
  assert.deepEqual(calls, [true, true]);
  assert.deepEqual(states, [true]);
});
