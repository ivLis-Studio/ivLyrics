import { readLanguageTable } from "./fixtures/language-source.mjs";
import { readSettingsFixture } from "./fixtures/legacy-page-source.mjs";
import { SETTINGS_DEFAULT_VALUES, SETTINGS_FALLBACK_DEFAULT_VALUES } from "../src/features/settings/settingsDefaults.mjs";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readSettingsFixture();
const defaults = {
  "fullscreen-cd-disc-size": 100,
  "fullscreen-cd-rotation-enabled": true,
  "fullscreen-cd-rotation-speed": 100,
  "fullscreen-cd-visualizer-enabled": true,
  "fullscreen-cd-visualizer-style": "bars",
  "fullscreen-cd-visualizer-color-mode": "album",
  "fullscreen-cd-visualizer-album-gradient": true,
  "fullscreen-cd-visualizer-color": "#ffffff",
  "fullscreen-cd-visualizer-sensitivity": 100,
  "fullscreen-cd-visualizer-density": 64,
  "fullscreen-cd-visualizer-thickness": 2,
  "fullscreen-cd-visualizer-mirror": false,
};
const keys = Object.keys(defaults);
const plain = (value) => JSON.parse(JSON.stringify(value));
const elements = (node) => Array.isArray(node) ? node.flatMap(elements)
  : node?.props ? [node, ...elements(node.props.children)] : [];

function harness(overrides = {}, initial = {}) {
  const end = source.indexOf("\nfunction openConfig(");
  const rootReturn = source.lastIndexOf("\n  return react.createElement(", end);
  assert.ok(rootReturn > source.indexOf("const ConfigModal ="));
  let frame = { slots: [], cursor: 0 };
  const useState = (initial) => {
    const current = frame, index = current.cursor++;
    if (!(index in current.slots)) current.slots[index] = typeof initial === "function" ? initial() : initial;
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
    useState, useMemo, useRef: (current) => useMemo(() => ({ current }), []),
    useCallback: (callback, deps) => useMemo(() => callback, deps),
    useEffect: () => { frame.cursor++; }, useLayoutEffect: () => { frame.cursor++; },
  };
  const saves = [], events = [], errors = [];
  const context = vm.createContext({
    SETTINGS_DEFAULT_VALUES, SETTINGS_FALLBACK_DEFAULT_VALUES,
    react, ...react, CONFIG: { visual: {} }, APP_NAME: "ivLyrics",
    I18n: { t: (key) => key, getAvailableLanguages: () => [] },
    StorageManager: {
      saveConfig: (key, value) => saves.push({ key, value }),
      setItem: (key, value) => saves.push({ key, value }),
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
    thresholdSizeLimit: { min: 0, max: 100, step: 5 }, lyricContainerUpdate() {},
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    console: { warn: (...args) => errors.push(args), error: (...args) => errors.push(args) },
  });
  vm.runInContext(source.slice(0, rootReturn) + `
    return { sidebarTabs, renderTabContent, buildSettingsRegistry, resetChangedEntries: changedSettings.resetChangedEntries,
      renderChangedView: changedSettings.renderChangedView, searchableSettings: search.searchableSettings,
      navigateToDestination, pickSearchResult: search.pickSearchResult,
      pendingNavigationRef: navigation.pendingNavigationRef, activeTab, fullscreenView, fullscreenViews: menus.fullscreenViews, selectFullscreenView: navigation.selectFullscreenView };
  ` + source.slice(rootReturn, end) + `
    globalThis.fixture = { ConfigModal, OptionList, SettingsSection, SettingsLayerMatrix,
      ConfigSlider, ConfigSliderRange, ConfigSelection, ConfigColorPicker, SettingsChoiceCards,
      FullscreenPresentationPicker, SettingsFullscreenPreview, SettingsCdDiscPreview,
      getCdSettingsSections, getCanonicalSettingsDestination, getSettingDefaultValue };
    Object.assign(CONFIG.visual, SETTINGS_DEFAULT_VALUES, SETTINGS_FALLBACK_DEFAULT_VALUES);
  `, context, { filename: "Settings.js" });
  Object.assign(context.CONFIG.visual, overrides);
  const modalFrame = frame;
  const h = {
    ...context.fixture, saves, events, errors, visual: context.CONFIG.visual,
    render() {
      frame = modalFrame; frame.cursor = 0;
      return h.api = context.fixture.ConfigModal(initial);
    },
    component(type, props) {
      const previous = frame; frame = { slots: [], cursor: 0 };
      try { return type(props); } finally { frame = previous; }
    },
    lists(tree = h.api.renderTabContent("fullscreen")) {
      return elements(tree).filter((node) => node.type === h.OptionList);
    },
    control(key) {
      const list = h.lists().find((node) => node.props.items.some((item) => item.key === key));
      assert.ok(list, key);
      const row = elements(h.component(h.OptionList, list.props)).find((node) => node.props["data-setting-key"] === key);
      return row && elements(row).find((node) => node.props.settingKey === key);
    },
  };
  h.render();
  return h;
}

test("CD controls have one canonical Fullscreen owner and keep all defaults", () => {
  const h = harness();
  const physical = Array.from(h.api.sidebarTabs).flatMap(({ id }) => h.lists(h.api.renderTabContent(id))
    .flatMap((node) => Array.from(node.props.items || []).map((item) => ({ tab: id, item }))));
  const registry = Array.from(h.api.buildSettingsRegistry());
  for (const key of keys) {
    assert.equal(h.getSettingDefaultValue(key), defaults[key], key);
    assert.deepEqual(physical.filter(({ item }) => item.key === key).map(({ tab }) => tab), ["fullscreen"], key);
    const entries = registry.filter((entry) => entry.key === key);
    assert.equal(entries.length, 1, key);
    assert.equal(entries[0].tabId, "fullscreen", key);
    assert.equal(entries[0].sectionKey, key.includes("visualizer") ? "cd-visualizer" : "cd-mode", key);
    for (const tab of ["appearance", "performance", "fullscreen", "lyrics"]) {
      assert.deepEqual(plain(h.getCanonicalSettingsDestination(tab, key)), { tabId: "fullscreen", settingKey: key });
    }
  }
  assert.deepEqual(h.errors, []);
  assert.deepEqual(h.saves, [], "constructing a catalog must not write configuration");
});

test("CD is a distinct view before LP, with hidden sections still searchable", () => {
  const h = harness();
  assert.deepEqual(Array.from(h.api.fullscreenViews, ({ value }) => value), ["basic", "normal", "tv", "cd", "vinyl"]);
  let sections = elements(h.api.renderTabContent("fullscreen")).filter((node) => node.type === h.SettingsSection && node.props.view === "cd");
  assert.equal(sections.length, 2);
  assert.ok(sections.every((node) => node.props.hidden));
  for (const key of ["cd-mode", "cd-visualizer", ...keys]) {
    const entries = Array.from(h.api.searchableSettings).filter((entry) => entry.settingKey === key);
    assert.equal(entries.length, 1, key);
    assert.equal(entries[0].sectionKey, "fullscreen", key);
    assert.ok(entries[0].i18nKeys.includes("vinyl.cd.mode"), key);
    h.api.pickSearchResult(entries[0]); h.render();
    assert.equal(h.api.activeTab, "fullscreen");
    assert.equal(h.api.pendingNavigationRef.current?.settingKey, key);
    assert.equal(h.api.fullscreenView, "cd", "conditional targets reveal the CD view even without a DOM anchor");
  }
  sections = elements(h.api.renderTabContent("fullscreen")).filter((node) => node.type === h.SettingsSection && node.props.view === "cd");
  assert.ok(sections.every((node) => node.props.hidden === false));
  assert.deepEqual(h.saves, [], "navigation alone does not change presentation or settings");
  const linked = harness({}, { initialTab: "appearance", initialSettingKey: "fullscreen-cd-visualizer-color" });
  assert.equal(linked.api.activeTab, "fullscreen");
  assert.equal(linked.api.fullscreenView, "cd");
});

test("CD sliders use the runtime contract ranges and fractional thickness", () => {
  const h = harness();
  const rows = Array.from(h.getCdSettingsSections()).flatMap((section) => Array.from(section.items));
  for (const [key, min, max, step, unit] of [
    ["disc-size", 70, 140, 5, "%"], ["rotation-speed", 25, 200, 5, "%"],
    ["visualizer-sensitivity", 25, 200, 5, "%"], ["visualizer-density", 24, 128, 8, ""],
    ["visualizer-thickness", 1, 6, 0.5, "px"],
  ]) {
    const row = rows.find((item) => item.key === `fullscreen-cd-${key}`);
    assert.equal(row.type, h.ConfigSliderRange);
    assert.deepEqual(plain([row.min, row.max, row.step, row.unit]), [min, max, step, unit]);
  }
});

test("shape and colour cards expose accessible radio groups and save exactly once", () => {
  const h = harness();
  const styles = ["bars", "blocks", "spikes", "line", "wave", "dots", "aura", "pulse", "particles"];
  for (const [key, values, selected, className] of [
    ["fullscreen-cd-visualizer-style", styles, "particles", "settings-cd-style-cards"],
    ["fullscreen-cd-visualizer-color-mode", ["album", "white", "custom", "rainbow"], "rainbow", "settings-cd-color-cards"],
  ]) {
    const control = h.control(key);
    assert.equal(control.type, h.ConfigSelection);
    assert.deepEqual(Object.keys(control.props.options), values);
    const cards = h.component(control.type, control.props);
    assert.equal(cards.type, h.SettingsChoiceCards);
    assert.equal(cards.props.className, className);
    const group = h.component(cards.type, cards.props);
    assert.equal(group.props.role, "radiogroup");
    assert.ok(group.props["aria-label"]);
    const radios = elements(group).filter((node) => node.props.role === "radio");
    assert.equal(radios.length, values.length);
    assert.equal(radios.filter((node) => node.props.tabIndex === 0).length, 1);
    assert.ok(radios.every((node) => node.type === "button" && typeof node.props.onKeyDown === "function"));
    radios.forEach((radio, index) => {
      const visual = radio.props.children[0];
      if (key.endsWith("style")) {
        assert.equal(visual.type, h.SettingsCdDiscPreview, "each shape card previews its own effect");
        assert.deepEqual(plain([visual.props.variant, visual.props.style, visual.props.color]), ["mini", values[index], "currentColor"]);
        const thumb = h.component(visual.type, visual.props);
        assert.equal(thumb.props.className, "settings-cd-style-thumb", "thumbnails never masquerade as the live preview");
        assert.equal(thumb.props["aria-hidden"], "true");
      } else {
        assert.equal(visual.props.className, "settings-cd-color-swatch");
        assert.equal(visual.props["aria-hidden"], "true");
      }
    });
    radios[values.indexOf(selected)].props.onClick();
    assert.equal(h.visual[key], selected);
    assert.deepEqual(h.saves.filter((save) => save.key === key), [{ key, value: selected }]);
    assert.equal(h.events.filter((event) => event.type === "ivLyrics" && event.detail.name === key).length, 1);
  }
});

test("mirror is a saved toggle, and Pulse disables only the controls it cannot use", () => {
  const h = harness({ "fullscreen-cd-visualizer-density": 96 });
  const mirror = h.control("fullscreen-cd-visualizer-mirror");
  assert.equal(mirror.type, h.ConfigSlider);
  assert.equal(mirror.props.defaultValue, false);
  mirror.props.onChange(true); h.render();
  assert.deepEqual(h.saves.filter((save) => save.key === "fullscreen-cd-visualizer-mirror"), [{ key: "fullscreen-cd-visualizer-mirror", value: true }]);
  const thumbs = h.control("fullscreen-cd-visualizer-style").props.visualMap;
  assert.ok(Object.values(thumbs).every((thumb) => thumb.props.mirror === true), "shape cards follow the mirror toggle");
  h.control("fullscreen-cd-visualizer-style").props.onChange("pulse"); h.render();
  assert.equal(h.control("fullscreen-cd-visualizer-density").props.disabled, true);
  assert.equal(h.control("fullscreen-cd-visualizer-mirror").props.disabled, true);
  for (const suffix of ["style", "color-mode", "sensitivity", "thickness"]) {
    assert.equal(h.control(`fullscreen-cd-visualizer-${suffix}`).props.disabled, false, suffix);
  }
  assert.equal(h.visual["fullscreen-cd-visualizer-density"], 96, "the disabled density keeps its saved value");
  assert.equal(h.visual["fullscreen-cd-visualizer-mirror"], true);
  h.control("fullscreen-cd-visualizer-style").props.onChange("wave"); h.render();
  assert.equal(h.control("fullscreen-cd-visualizer-density").props.disabled, false);
  assert.equal(h.control("fullscreen-cd-visualizer-mirror").props.disabled, false);
});

test("album gradient defaults on, persists off, and is offered only for the album palette", () => {
  const h = harness();
  const key = "fullscreen-cd-visualizer-album-gradient";
  assert.equal(h.control(key).props.defaultValue, true);
  let preview = elements(h.component(h.SettingsFullscreenPreview, { view: "cd" }))
    .find(node => node.type === h.SettingsCdDiscPreview);
  assert.equal(preview.props.albumGradient, true);
  const svg = h.component(preview.type, preview.props);
  assert.equal(elements(svg).filter(node => node.type === "radialGradient").length, 4,
    "preview uses several radial color fields from the illustrated album");
  h.control(key).props.onChange(false); h.render();
  preview = elements(h.component(h.SettingsFullscreenPreview, { view: "cd" }))
    .find(node => node.type === h.SettingsCdDiscPreview);
  assert.equal(preview.props.albumGradient, false);
  assert.equal(h.control(key).props.defaultValue, false);
  for (const mode of ["white", "custom", "rainbow"]) {
    h.control("fullscreen-cd-visualizer-color-mode").props.onChange(mode); h.render();
    assert.equal(h.control(key), undefined);
    assert.equal(h.visual[key], false, "another color mode retains the saved toggle");
  }
  h.control("fullscreen-cd-visualizer-color-mode").props.onChange("album"); h.render();
  assert.equal(h.control(key).props.defaultValue, false);
  assert.deepEqual(h.saves.filter(save => save.key === key), [{ key, value: false }]);
});

test("every shape previews distinctly, with mirroring and the rainbow wheel", () => {
  const h = harness();
  const styles = ["bars", "blocks", "spikes", "line", "wave", "dots", "aura", "pulse", "particles"];
  const markup = new Set();
  for (const style of styles) {
    for (const variant of ["full", "mini"]) {
      const svg = h.component(h.SettingsCdDiscPreview, { style, variant, color: "#123456", density: 24 });
      assert.equal(svg.props["data-cd-style"], style);
      const group = elements(svg).find((node) => node.type === "g");
      const shapes = elements(group).slice(1);
      assert.ok(shapes.length >= ({ line: 1, wave: 2 }[style] || 3), `${style}/${variant}: draws an effect`);
      if (variant === "full") markup.add(JSON.stringify(plain(group)));
    }
    const mirrored = h.component(h.SettingsCdDiscPreview, { style, mirror: true, density: 24, color: "#123456" });
    assert.equal(mirrored.props["data-cd-mirror"], "true");
    const rainbow = h.component(h.SettingsCdDiscPreview, { style, rainbow: true, density: 24 });
    const gradient = elements(rainbow).find((node) => node.type === "linearGradient");
    assert.ok(gradient, `${style}: rainbow defines its wheel`);
    const colours = new Set(elements(rainbow).flatMap((node) => [node.props.fill, node.props.stroke])
      .filter((value) => typeof value === "string" && /^(hsl|url)/.test(value)));
    assert.ok(colours.size >= 1, `${style}: rainbow colours are applied`);
  }
  assert.equal(markup.size, styles.length, "every shape has its own schematic");
  const dots = h.component(h.SettingsCdDiscPreview, { style: "dots", rainbow: true, density: 24 });
  const hues = new Set(elements(dots).filter((node) => node.type === "circle" && /^hsl/.test(node.props.fill || "")).map((node) => node.props.fill));
  assert.ok(hues.size >= 6, "discrete rainbow shapes take the hue at their angle");
  const mirrorDots = h.component(h.SettingsCdDiscPreview, { style: "dots", rainbow: true, mirror: true, density: 24 });
  const fills = elements(mirrorDots).filter((node) => node.type === "circle" && /^hsl/.test(node.props.fill || "")).map((node) => node.props.fill);
  for (let index = 1; index < 24; index++) assert.equal(fills[index], fills[24 - index], "mirrored hues match left and right");
});

test("disabling motion or visualizer preserves every tuned value and hides custom colour only", () => {
  const h = harness({
    "fullscreen-cd-visualizer-style": "dots", "fullscreen-cd-visualizer-color-mode": "custom",
    "fullscreen-cd-visualizer-color": "#123456", "fullscreen-cd-visualizer-thickness": 4.5,
  });
  assert.ok(h.control("fullscreen-cd-visualizer-color"));
  h.control("fullscreen-cd-visualizer-enabled").props.onChange(false);
  h.render();
  assert.equal(h.control("fullscreen-cd-visualizer-color"), undefined);
  for (const suffix of ["style", "mirror", "color-mode", "sensitivity", "density", "thickness"]) {
    assert.equal(h.control(`fullscreen-cd-visualizer-${suffix}`).props.disabled, true, suffix);
  }
  assert.equal(h.visual["fullscreen-cd-visualizer-color"], "#123456");
  assert.equal(h.visual["fullscreen-cd-visualizer-style"], "dots");
  assert.equal(h.visual["fullscreen-cd-visualizer-thickness"], 4.5);
  h.control("fullscreen-cd-rotation-enabled").props.onChange(false); h.render();
  assert.equal(h.control("fullscreen-cd-rotation-speed").props.disabled, true);
  h.control("fullscreen-cd-visualizer-enabled").props.onChange(true); h.render();
  assert.equal(h.control("fullscreen-cd-visualizer-color").props.defaultValue, "#123456");
  assert.equal(h.control("fullscreen-cd-visualizer-thickness").props.defaultValue, 4.5);
  assert.deepEqual(h.saves.map(({ key }) => key), [
    "fullscreen-cd-visualizer-enabled", "fullscreen-cd-rotation-enabled", "fullscreen-cd-visualizer-enabled",
  ]);
});

test("hidden custom values remain in Changed settings with correct jump and reset handlers", () => {
  const h = harness({ "fullscreen-cd-visualizer-color": "#123456", "fullscreen-cd-visualizer-enabled": false });
  const changed = h.api.renderChangedView();
  const group = elements(changed).find((node) => node.props.className === "settings-changed-menu" && node.props.key === "fullscreen");
  const items = h.lists(group).flatMap((node) => Array.from(node.props.items));
  const color = items.find((item) => item.key === "fullscreen-cd-visualizer-color");
  assert.ok(color);
  assert.equal(color.when, undefined, "the changed editor does not inherit conditional visibility");
  color.jump.onClick(); h.render();
  assert.equal(h.api.activeTab, "fullscreen");
  assert.equal(h.api.pendingNavigationRef.current?.settingKey, color.key);
  assert.equal(h.api.fullscreenView, "cd");
  h.api.resetChangedEntries(Array.from(h.api.buildSettingsRegistry()).filter((entry) => keys.includes(entry.key)));
  for (const key of keys) assert.equal(h.visual[key], defaults[key], key);
  assert.equal(h.events.filter((event) => event.type === "ivLyrics:settings-refresh").length, 1);
});

test("presentation picker retains compact-vinyl storage identity but displays a CD", () => {
  const h = harness();
  const saves = [];
  const picker = h.component(h.FullscreenPresentationPicker, { defaultValue: "compact-vinyl", onChange: (...args) => saves.push(args) });
  const radio = elements(picker).find((node) => node.props.role === "radio" && node.props.key === "compact-vinyl");
  assert.equal(radio.props["aria-checked"], true);
  const thumbnail = elements(radio).find((node) => node.type === "svg" && node.props.className === "settings-cd-presentation-preview");
  assert.ok(thumbnail.props.dangerouslySetInnerHTML.__html.includes('fill-rule="evenodd"'));
  assert.ok(elements(radio).some((node) => node.props.children?.includes("CD mode")), "missing translations fall back to the new CD label, never Compact vinyl");
  radio.props.onClick();
  assert.deepEqual(plain(saves), [["fullscreen-focus-presentation", "compact-vinyl"]]);
});

test("CD preview has a real centre hole, follows shape, density and colour, and never uses LP tonearm", () => {
  const h = harness({
    "fullscreen-focus-presentation": "compact-vinyl", "fullscreen-tv-mode": true,
    "fullscreen-cd-visualizer-style": "dots", "fullscreen-cd-visualizer-density": 24,
    "fullscreen-cd-visualizer-thickness": 3, "fullscreen-cd-visualizer-color-mode": "custom",
    "fullscreen-cd-visualizer-color": "#123456",
  });
  const cd = h.component(h.SettingsFullscreenPreview, { view: "cd" });
  assert.ok(!elements(cd).some((node) => /settings-fs-(record|arm|tv-)/.test(node.props.className || "")));
  const preview = elements(cd).find((node) => node.type === h.SettingsCdDiscPreview);
  assert.deepEqual(plain([preview.props.style, preview.props.density, preview.props.thickness, preview.props.color]), ["dots", 24, 3, "#123456"]);
  const svg = h.component(preview.type, preview.props);
  assert.equal(svg.props["aria-hidden"], "true");
  const ring = elements(svg).find((node) => node.type === "path" && node.props.fillRule === "evenodd");
  assert.ok(ring.props.d.includes("M 24 100") && ring.props.d.includes("M 81 100"));
  const dots = elements(svg).find((node) => node.type === "g");
  assert.equal(dots.props.fill, "#123456");
  assert.equal(elements(dots).filter((node) => node.type === "circle").length, 24);
  const line = h.component(h.SettingsCdDiscPreview, { style: "line" });
  assert.equal(elements(line).find((node) => node.type === "g").props.children.flat().filter((node) => node.type === "path").length, 1);
  const bars = h.component(h.SettingsCdDiscPreview, { style: "bars", density: 128 });
  assert.equal(elements(bars).filter((node) => node.type === "line").length, 128);
  const off = h.component(h.SettingsCdDiscPreview, { visualizer: false });
  assert.ok(!elements(off).some((node) => node.type === "g"));
});

const localeDirectory = new URL("../src/i18n/langs/", import.meta.url);
const locales = readdirSync(localeDirectory).filter((name) => /^Lang.*\.js$/.test(name));
const english = readLanguageTable("LangEn.js");
const flatten = (value, prefix = "") => Object.entries(value).flatMap(([key, text]) =>
  typeof text === "string" ? [[`${prefix}${key}`, text]] : flatten(text, `${prefix}${key}.`));
test("CD strings cover all 22 supported languages", () => assert.equal(locales.length, 22));
for (const file of locales) test(`${file}: every CD key is translated and compact presentation is renamed`, () => {
  const locale = readLanguageTable(file), actual = flatten(locale.vinyl.cd), expected = flatten(english.vinyl.cd);
  assert.equal(actual.length, 43);
  assert.deepEqual(actual.map(([key]) => key).sort(), expected.map(([key]) => key).sort());
  for (const [key, text] of actual) {
    assert.ok(text.trim(), key);
    assert.ok(!/vinyl\.cd\.|TODO|FIXME/.test(text), key);
  }
  assert.equal(locale.vinyl.presentation.compactLabel, locale.vinyl.cd.mode);
  assert.ok(locale.vinyl.presentation.compactDescription.trim());
  if (file !== "LangEn.js") {
    for (const key of ["subtitle", "visualizerDesc", "discSizeDesc", "enabledDesc", "styleDesc", "colorModeDesc", "mirrorDesc", "loading", "unavailable"]) {
      assert.notEqual(locale.vinyl.cd[key], english.vinyl.cd[key], `${key} is not an English fallback`);
    }
    assert.notEqual(locale.vinyl.presentation.compactDescription, english.vinyl.presentation.compactDescription);
  }
});
