import { readSettingsFixture } from "./legacy-page-source.mjs";
import { SETTINGS_DEFAULT_VALUES, SETTINGS_FALLBACK_DEFAULT_VALUES } from "../../src/features/settings/settingsDefaults.mjs";
import assert from "node:assert/strict";
import vm from "node:vm";

// Runs the production ConfigModal in a VM with a minimal React and host.
// Shared by the settings ownership and settings guide tests.
// options.translate replaces I18n.t, for example to see which i18n keys a
// menu uses; options.runEffects also builds the modal tree and its effects.
const source = readSettingsFixture();

export function harness(overrides = {}, initial = {}, options = {}) {
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
      handleSearchKeyDown: search.handleSearchKeyDown, renderSearchPanel: search.renderSearchPanel,
      searchQuery: search.searchQuery,
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
    I18n: { t: options.translate || ((key) => key), getAvailableLanguages: () => [] },
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
      // Row components by name, for tests that classify declared rows.
      controls: { ConfigSlider, ConfigSliderRange, ConfigFontWeightSlider, ConfigSelection,
        ConfigInstrumentalBreakIconPicker, ConfigColorPicker, ColorPresetSelector, ConfigFontSelector,
        ConfigHotkey, ConfigKaraokeFillCurveEditor, VideoHelperToggle, LyricsHelperToggle,
        ConfigButton, SettingsBackupButton, SettingsUpdateButton, ConfigInfo, ConfigWarning },
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

// Unlike buildSettingsRegistry, this deliberately does not deduplicate keys:
// a correct registry must not hide a second physical editor in another tab.
export function declarations(h, tree, tabId, sectionKey = null) {
  if (Array.isArray(tree)) return tree.flatMap((node) => declarations(h, node, tabId, sectionKey));
  if (!tree?.props) return [];
  const { props } = tree;
  if (tree.type === h.SettingsSection) sectionKey = props.sectionKey;
  const rows = [];
  const add = (item, onChange, column = null) => {
    if (item?.key) rows.push({ tabId, sectionKey, item, onChange: item.onChange || onChange, column });
  };
  if (tree.type === h.OptionList) Array.from(props.items || []).forEach((item) => add(item, props.onChange));
  if (tree.type === h.SettingsLayerMatrix) {
    for (const column of props.columns || []) {
      const onChange = column.onChange || props.onChange;
      if (column.toggle) add(column.toggle, onChange, column.label);
      Array.from(column.items || []).forEach((item) => add(item, onChange, column.label));
    }
  }
  const custom = typeof props.settingsRegistryItems === "function"
    ? props.settingsRegistryItems() : props.settingsRegistryItems;
  Array.from(custom || []).forEach(({ item, onChange }) => add(item, onChange));
  return [...rows, ...declarations(h, props.children, tabId, sectionKey)];
}

export const allDeclarations = (h) => Array.from(h.api.sidebarTabs).flatMap(({ id }) =>
  declarations(h, h.api.renderTabContent(id), id));
