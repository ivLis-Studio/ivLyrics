import { readSettingsSource, readSettingsStylesFixture } from "./fixtures/legacy-page-source.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { createSettingsUiTheme } from "../src/features/settings/settingsUiTheme.mjs";
import { settingsTabModules, installSettingsFixtureBindings } from "./fixtures/settings-tab-modules.mjs";

const source = readSettingsSource();
const section = (start, end) => {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from);
  return source.slice(from, to);
};

// Exercise the real render functions and preserve hook state between renders.
// A changed element type at the same position makes React remount that subtree.
const createHarness = () => {
  const slots = [];
  let cursor = 0;
  const useState = (initial) => {
    const index = cursor++;
    if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
    return [slots[index], (next) => {
      slots[index] = typeof next === "function" ? next(slots[index]) : next;
    }];
  };
  const useMemo = (factory, deps) => {
    const index = cursor++;
    const previous = slots[index];
    if (!previous || !deps || deps.some((value, i) => !Object.is(value, previous.deps[i]))) {
      slots[index] = { value: factory(), deps };
    }
    return slots[index].value;
  };
  const react = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    Fragment: Symbol("Fragment"),
    useState,
    useMemo,
    useCallback: (callback, deps) => useMemo(() => callback, deps),
    useRef: (current) => useMemo(() => ({ current }), []),
    useEffect: () => { cursor++; },
    useLayoutEffect: () => { cursor++; },
  };
  const placeholder = () => null;
  const context = vm.createContext({
    createSettingsUiTheme,
    ...settingsTabModules,
    react, ...react,
    CONFIG: { visual: { "line-spacing": 8 } },
    APP_NAME: "ivLyrics",
    I18n: { t: (key) => key, getAvailableLanguages: () => [] },
    Utils: { currentVersion: "test" },
    window: {},
    document: { getElementById: () => null },
    localStorage: { getItem: () => null },
    settingsInputContext: { onSaveError: placeholder },
    OptionList: placeholder,
    ConfigSelection: placeholder,
    ColorPresetSelector: placeholder,
    ConfigWarning: placeholder,
    openSettingsHelperDownload: placeholder,
    VideoHelperToggle: placeholder,
    SettingsChoiceCards: placeholder,
    ConfigSlider: placeholder,
    ConfigSliderRange: placeholder,
    ConfigColorPicker: placeholder,
    ConfigButton: placeholder,
    OverlaySettings: placeholder,
    SettingsOutlineIcon: placeholder,
    SettingsSegmented: placeholder,
    handleSettingsRadioKeys: placeholder,
    ProviderSupportIconChip: placeholder,
    ConfigKaraokeFillCurveEditor: placeholder, SettingsHotkeyTable: placeholder, ConfigHotkey: placeholder,
    LocalCacheManager: placeholder, LyricsHelperToggle: placeholder, ConfigInfo: placeholder,
    createTextOutlineSettingItems: () => [],
    getInstrumentalBreakLabelStyleDefault: () => ({}), getMultiVocalRegistryItems: () => [],
    buildLyricsTypographyColumns: () => [], getLyricsTypographyRows: () => [],
    thresholdSizeLimit: {}, backupActions: {},
    ConfigFontSelector: placeholder, ConfigFontWeightSlider: placeholder, ConfigInstrumentalBreakIconPicker: placeholder,
    DebugInfoPanel: placeholder, ConfigMultiVocalColorSettings: placeholder,
    SettingsBackupButton: placeholder, ConfigCloudSync: placeholder, ConfigSettingsPresets: placeholder,
    SettingsUpdateButton: placeholder, AccountSection: placeholder,
  });
  installSettingsFixtureBindings(context);
  vm.runInContext(readSettingsStylesFixture(), context);
  vm.runInContext(`${section("const getEffectiveReducedMotionPreference =", "function openConfig(")}
    globalThis.components = { ConfigModal, AddonSettingsCard, LyricsProviderCard };`, context);
  return {
    slots,
    render(name, props = {}) {
      cursor = 0;
      return context.components[name](props);
    },
  };
};

const elements = (node) => {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== "object" || !("type" in node)) return [];
  return [node, ...elements(node.props.children)];
};

const assertStableTypes = (before, after) => {
  const oldElements = elements(before);
  const newElements = elements(after);
  assert.equal(newElements.length, oldElements.length);
  oldElements.forEach((element, index) => {
    assert.strictEqual(newElements[index].type, element.type, `Element ${index} changed type`);
  });
};

test("settings navigation updates retain header, sidebar, and section component types", () => {
  const harness = createHarness();
  const first = harness.render("ConfigModal");
  assertStableTypes(first, harness.render("ConfigModal"));
  const themeButton = elements(first).find((element) => element.props["aria-label"] === "Dark");
  assert.ok(themeButton);
  themeButton.props.onClick();
  assertStableTypes(first, harness.render("ConfigModal"));
});

// The header's search box is its own component. Render it after the modal,
// as React would, continuing the same hook order.
const renderSearchField = (tree) => {
  const field = elements(tree).find((element) => element.props.search && element.props.translate);
  assert.ok(field, "the header renders the search field component");
  return field.type(field.props);
};

test("search renders retain their element types between parent updates", () => {
  const harness = createHarness();
  const initial = harness.render("ConfigModal");
  const field = renderSearchField(initial);
  const modalState = harness.slots.slice();
  elements(field).find((element) => element.props.className === "settings-search-input")
    .props.onChange({ target: { value: "unmatched query" } });
  // Typing changes only the search field's own state; the window around it,
  // its menu and the changed view are not scheduled to render again.
  assert.equal(harness.slots.length, modalState.length);
  harness.slots.forEach((slot, index) => assert.ok(Object.is(slot, modalState[index]), `hook ${index} changed`));
  const first = harness.render("ConfigModal");
  const firstField = renderSearchField(first);
  assert.ok(elements(firstField).some((element) => element.props.className === "search-no-results"));
  const second = harness.render("ConfigModal");
  assertStableTypes(first, second);
  assertStableTypes(firstField, renderSearchField(second));
});

for (const [component, prop] of [["AddonSettingsCard", "addon"], ["LyricsProviderCard", "provider"]]) {
  test(`${component} preserves custom settings until the provider or factory changes`, () => {
    const harness = createHarness();
    let factoryCalls = 0;
    const factory = () => {
      factoryCalls++;
      return function CustomProviderSettings() {};
    };
    const provider = { id: "test", name: "Test", description: "Test", supports: {}, getSettingsUI: factory };
    const props = { [prop]: provider, isEnabled: true, isExpanded: true };
    const first = harness.render(component, props);
    assertStableTypes(first, harness.render(component, { ...props, isEnabled: false }));
    assert.equal(factoryCalls, 1);
    const replacement = { ...provider };
    harness.render(component, { ...props, [prop]: replacement });
    assert.equal(factoryCalls, 2);
    replacement.getSettingsUI = () => { factoryCalls++; return null; };
    harness.render(component, { ...props, [prop]: replacement });
    assert.equal(factoryCalls, 3);
  });
}
