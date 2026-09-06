import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const currentSource = readFileSync(new URL("../Settings.js", import.meta.url), "utf8");
// The released implementation is an independent oracle for the refactored controls.
const releasedSource = execFileSync("git", ["show", "98e6a4167c72f80b422ec77461852d9da12f97e9:Settings.js"], {
  cwd: new URL("..", import.meta.url), encoding: "utf8", maxBuffer: 2 * 1024 * 1024,
});

test("settings styles are bundled before their consumer", () => {
  const { subfiles } = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));
  assert.equal(subfiles.filter(file => file === "SettingsStyles.js").length, 1);
  assert.ok(subfiles.indexOf("SettingsStyles.js") < subfiles.indexOf("Settings.js"));
});

const section = (source, start, end) => {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `Missing source section: ${start}`);
  return source.slice(from, to);
};

const createHarness = (source, config = {}, initialLanguage = "ko") => {
  const slots = [];
  const calls = [];
  const links = new Map();
  let cursor = 0;
  let language = initialLanguage;
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
    Fragment: Symbol.for("Fragment"), useState, useMemo,
    useCallback: (callback, deps) => useMemo(() => callback, deps),
    useRef: (current) => useMemo(() => ({ current }), []),
    useEffect: () => { cursor++; }, useLayoutEffect: () => { cursor++; },
  };
  const placeholders = Object.fromEntries([...source.matchAll(/^const (\w+) =/gm)].map(([, name]) => {
    const component = () => null;
    Object.defineProperty(component, "name", { value: name });
    return [name, component];
  }));
  const context = vm.createContext({
    ...placeholders, react, ...react, APP_NAME: "ivLyrics",
    CONFIG: { visual: { "line-spacing": 8, ...config } },
    I18n: { t: (key) => `${language}:${key}`, getAvailableLanguages: () => [] },
    Utils: { currentVersion: "test" },
    KaraokeLine: function KaraokeLine() {},
    window: { dispatchEvent: (event) => calls.push(["event", event.type, event.detail]) },
    document: {
      getElementById: (id) => links.get(id) || null,
      createElement: (type) => ({ type }),
      head: { appendChild: (link) => { links.set(link.id, link); calls.push(["appendFont", link.id]); } },
    },
    localStorage: { getItem: () => null },
    StorageManager: {
      getItem: () => null,
      setItem: (...args) => calls.push(["setItem", ...args]),
      saveConfig: (...args) => calls.push(["saveConfig", ...args]),
    },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    syncSettingsLyricsPreviewStyles: () => calls.push(["preview"]),
    lyricContainerUpdate: () => calls.push(["lyrics"]),
    reloadLyrics: () => calls.push(["reload"]),
    getLyricsTypographyStyleVariables: () => ({}),
    GOOGLE_FONTS: ["Pretendard Variable", "Noto Sans", "Roboto"],
  });
  vm.runInContext(readFileSync(new URL("../SettingsStyles.js", import.meta.url), "utf8"), context);
  vm.runInContext([
    section(source, "const createTextOutlineSettingItems =", "const MULTI_VOCAL_COLOR_GROUPS ="),
    section(source, "const loadGoogleFontFamily =", "const SETTINGS_LYRICS_PREVIEW_TEXT ="),
    section(source, "const getEffectiveReducedMotionPreference =", "function openConfig("),
    "globalThis.ConfigModalUnderTest = ConfigModal;",
  ].join("\n"), context);
  return {
    context, calls, links,
    setLanguage(next) { language = next; },
    render(initialTab) { cursor = 0; return context.ConfigModalUnderTest({ initialTab }); },
  };
};

const elements = (node) => {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== "object" || !("type" in node)) return [];
  return [node, ...elements(node.props.children)];
};

const normalize = (value) => {
  if (typeof value === "function") return `[function:${value.name}]`;
  if (typeof value === "symbol") return String(value);
  if (Array.isArray(value)) return Array.from(value, normalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key, key.startsWith("on") && typeof item === "function" ? "[handler]" : normalize(item),
    ]));
  }
  return value;
};

const retiredFullscreenMarginKey = "fullscreen-lyrics-right-padding";
const normalizeReleasedTree = (tree) => {
  const expected = normalize(tree);
  // The right-margin slider was intentionally retired. Keep the rest of the
  // released tree as the oracle, including every other item and its defaults.
  for (const element of elements(expected)) {
    if (element.type === "[function:OptionList]" && Array.isArray(element.props.items)) {
      element.props.items = element.props.items.filter(item => item.key !== retiredFullscreenMarginKey);
    }
  }
  return expected;
};

test("fullscreen no longer exposes the right-margin slider, including with a saved value", () => {
  for (const value of [undefined, 0, 280]) {
    const tree = createHarness(currentSource, { [retiredFullscreenMarginKey]: value }).render("fullscreen");
    const items = elements(tree).filter(element => element.type.name === "OptionList")
      .flatMap(element => element.props.items || []);
    assert.ok(items.length > 0, "fullscreen settings are rendered");
    assert.equal(items.some(item => item.key === retiredFullscreenMarginKey), false);
  }
});

const typographyControls = (tree) => elements(tree).flatMap((element) => {
  if (element.type.name === "OptionList") {
    return (element.props.items || []).filter((item) => /^(?:fullscreen-vinyl-)?(?:original|phonetic|translation)-/.test(item.key))
      .map((item) => ({ key: item.key, onChange: element.props.onChange, item }));
  }
  if (element.type.name === "ConfigFontSelector" && element.props.name === "") {
    return [{ key: "font-row", onChange: element.props.onChange, item: element.props }];
  }
  return [];
});

for (const tab of ["appearance", "fullscreen"]) {
  test(`${tab} typography retains the released tree, defaults, and language updates`, () => {
    for (const value of [undefined, null, false, 0, "", 27, "Roboto"]) {
      const config = {};
      for (const prefix of ["original", "phonetic", "translation", "fullscreen-vinyl-original", "fullscreen-vinyl-phonetic", "fullscreen-vinyl-translation"]) {
        for (const suffix of ["font-family", "font-size", "font-weight", "opacity", "spacing", "letter-spacing", "outline-width", "outline-color"]) {
          config[`${prefix}-${suffix}`] = value;
        }
      }
      const before = createHarness(releasedSource, config);
      const after = createHarness(currentSource, config);
      const first = after.render(tab);
      assert.deepEqual(normalize(first), normalizeReleasedTree(before.render(tab)));
      const next = after.render(tab);
      assert.deepEqual(elements(next).map((element) => element.type), elements(first).map((element) => element.type));
      before.setLanguage("zh-TW");
      after.setLanguage("zh-TW");
      assert.deepEqual(normalize(after.render(tab)), normalizeReleasedTree(before.render(tab)));
    }
  });

  test(`${tab} typography retains storage, preview, font, reload, and event side effects`, () => {
    const baseline = createHarness(releasedSource);
    const candidate = createHarness(currentSource);
    const oldControls = typographyControls(baseline.render(tab));
    const newControls = typographyControls(candidate.render(tab));
    assert.ok(oldControls.length >= 20);
    assert.equal(newControls.length, oldControls.length);
    for (let index = 0; index < oldControls.length; index++) {
      assert.equal(newControls[index].key, oldControls[index].key);
      const key = oldControls[index].key;
      const values = key.includes("font") && (key.endsWith("family") || key === "font-row")
        ? ["'Noto Sans', Pretendard Variable, unknown", "Roboto", "Roboto", ""]
        : key === "phonetic-hyphen-replace" ? ["keep", "space", "remove"] : [0, 2, false];
      for (const value of values) {
        oldControls[index].onChange(key, value);
        newControls[index].onChange(key, value);
        assert.deepEqual(normalize(candidate.calls), normalize(baseline.calls), `${key}: calls`);
        assert.deepEqual(normalize(candidate.context.CONFIG), normalize(baseline.context.CONFIG), `${key}: config`);
        assert.deepEqual(normalize([...candidate.links]), normalize([...baseline.links]), `${key}: font links`);
      }
    }
  });
}
