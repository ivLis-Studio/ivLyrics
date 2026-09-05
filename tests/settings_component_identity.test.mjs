import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../Settings.js", import.meta.url), "utf8");
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
    react, ...react,
    CONFIG: { visual: { "line-spacing": 8 } },
    APP_NAME: "ivLyrics",
    I18n: { t: (key) => key, getAvailableLanguages: () => [] },
    Utils: { currentVersion: "test" },
    window: {},
    document: { getElementById: () => null },
    localStorage: { getItem: () => null },
    OptionList: placeholder,
    ConfigSelection: placeholder,
    OverlaySettings: placeholder,
    SettingsOutlineIcon: placeholder,
    ProviderSupportIconChip: placeholder,
  });
  vm.runInContext(readFileSync(new URL("../SettingsStyles.js", import.meta.url), "utf8"), context);
  vm.runInContext(`${section("const getEffectiveReducedMotionPreference =", "function openConfig(")}
    ${section("const AddonSettingsCard =", "// 가사 제공자 설정 탭 컴포넌트")}
    globalThis.components = { ConfigModal, AddonSettingsCard, LyricsProviderCard };`, context);
  return {
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

test("search renders retain their element types between parent updates", () => {
  const harness = createHarness();
  const initial = harness.render("ConfigModal");
  elements(initial).find((element) => element.props.className === "settings-search-input")
    .props.onChange({ target: { value: "unmatched query" } });
  const first = harness.render("ConfigModal");
  assert.ok(elements(first).some((element) => element.props.className === "search-no-results"));
  assertStableTypes(first, harness.render("ConfigModal"));
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
