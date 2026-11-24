import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../Settings.js", import.meta.url), "utf8");
const indexSource = readFileSync(new URL("../index.js", import.meta.url), "utf8");
const section = (start, end) => {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `Missing production section: ${start}`);
  return source.slice(from, to);
};
const elements = (node) => Array.isArray(node) ? node.flatMap(elements)
  : node?.props ? [node, ...elements(node.props.children)] : [];
const costKeys = [
  "karaoke-bounce", "karaoke-line-transition", "karaoke-text-effects",
  "fade-blur", "highlight-mode", "text-shadow-enabled", "video-background",
];

// Evaluate the production tab and meter with only their host dependencies faked.
function harness(visual = {}) {
  const CONFIG = { visual: { ...visual } };
  const changes = [];
  const destinations = [];
  const handlePerformanceSettingChange = (...args) => changes.push(args);
  const context = vm.createContext({
    CONFIG, activeTab: "performance", handlePerformanceSettingChange,
    react: { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) },
    SettingsSection: "SettingsSection", OptionList: "OptionList",
    ConfigSlider: "ConfigSlider", ConfigSliderRange: "ConfigSliderRange",
    ConfigButton: "ConfigButton",
    navigateToDestination: (...args) => destinations.push(args),
    I18n: { t: (key) => key },
    getSettingsText: (_key, fallback) => fallback,
    useSettingsConfigRevision() {},
    getSettingsPreviewFlag: (key, fallback) => CONFIG.visual[key] ?? fallback,
    getSettingsPreviewNumber: (key, fallback) => Number(CONFIG.visual[key] ?? fallback),
  });
  vm.runInContext([
    section("const getPerformanceSettingsSections =", "const SettingsLoadMeter ="),
    section("const SettingsLoadMeter =", "const SettingsDock ="),
    section("  const renderPerformanceTab = () =>", "  const renderLyricsTab ="),
    "globalThis.render = renderPerformanceTab; globalThis.LoadMeter = SettingsLoadMeter;",
  ].join("\n"), context);
  const tree = context.render();
  const nodes = elements(tree);
  const meter = nodes.find((node) => node.type === context.LoadMeter);
  assert.ok(meter, "the Performance tab still renders its load meter");
  const lists = nodes.filter((node) => node.type === "OptionList");
  return {
    CONFIG, changes, destinations, handlePerformanceSettingChange, tree, meter, lists,
    items: lists.flatMap((node) => Array.from(node.props.items)),
    summary: () => elements(context.LoadMeter(meter.props))
      .find((node) => node.type === "small").props.children.join(""),
  };
}

test("Performance counts seven effects without duplicating the Appearance background editor", () => {
  const h = harness({ "blur-gradient-background": true });
  assert.equal(h.tree.props["data-tab-id"], "performance");
  assert.deepEqual(Array.from(h.meter.props.costKeys), costKeys);
  assert.equal(h.meter.props.frameKey, "performance-frame-rate");
  assert.deepEqual(h.items.filter((item) => item.cost).map((item) => item.key), costKeys.filter((key) => key !== "video-background"));
  assert.deepEqual(h.items.map((item) => item.key), [
    "performance-frame-rate", "reduce-motion", ...costKeys.filter((key) => key !== "video-background"),
    "video-background-settings",
    "prefetch-translation-enabled", "prefetch-video-enabled", "prefetch-word-details-enabled", "prefetch-motion-enabled", "prefetch-pronunciation-timing-enabled",
  ]);
  assert.ok(h.lists.every((list) => list.props.onChange === h.handlePerformanceSettingChange));
  const frameRate = h.items.find((item) => item.key === "performance-frame-rate");
  assert.equal(frameRate.defaultValue, 60);
  assert.equal(frameRate.min, 10);
  assert.equal(frameRate.max, 240);
  const videoLink = h.items.find((item) => item.key === "video-background-settings");
  assert.equal(videoLink.type, "ConfigButton");
  assert.equal(videoLink.searchable, false);
  videoLink.onChange();
  assert.deepEqual(h.destinations, [["appearance", "video-background"]]);
  assert.deepEqual(h.CONFIG.visual, { "blur-gradient-background": true });
  assert.deepEqual(h.changes, [], "rendering does not save or reset the background mode");
});

test("Performance summary reaches 7/7 and ignores the persisted Blur Gradient flag", () => {
  for (const blur of [false, true]) {
    for (let on = 0; on <= costKeys.length; on++) {
      const visual = Object.fromEntries(costKeys.map((key, index) => [key, index < on]));
      visual["blur-gradient-background"] = blur;
      visual["performance-frame-rate"] = 144;
      const h = harness(visual);
      assert.equal(h.summary(), `GPU-heavy effects on: ${on}/7 · 144 FPS`);
      assert.deepEqual(h.CONFIG.visual, visual);
      assert.deepEqual(h.changes, []);
    }
  }
});

test("Blur Gradient remains a background preset with its stored flag and false default", () => {
  const backgroundCode = [
    section("const SETTINGS_BACKGROUND_PRESETS =", "const FULLSCREEN_PRESENTATION_PRESETS ="),
    section("const getCurrentSettingsBackgroundMode =", "window.ivLyricsBackgroundPresets ="),
    "({ presets: SETTINGS_BACKGROUND_PRESETS, mode: getCurrentSettingsBackgroundMode() });",
  ].join("\n");
  const storedFlag = /"blur-gradient-background":\s*(StorageManager\.get\([\s\S]*?\)),/.exec(indexSource)?.[1];
  assert.ok(storedFlag, "CONFIG still loads the persisted Blur Gradient setting");
  for (const stored of [undefined, false, true]) {
    const flag = vm.runInNewContext(storedFlag, {
      StorageManager: { get(key, fallback) {
        assert.equal(key, "ivLyrics:visual:blur-gradient-background");
        assert.equal(fallback, false);
        return stored ?? fallback;
      } },
    });
    assert.equal(flag, stored ?? false);
    const background = vm.runInNewContext(backgroundCode, { CONFIG: { visual: { "blur-gradient-background": flag } } });
    assert.equal(background.presets.find((preset) => preset.id === "blur-gradient-background")?.fallbackLabel, "Blur Gradient");
    assert.equal(background.mode, flag ? "blur-gradient-background" : "none");
  }
});
