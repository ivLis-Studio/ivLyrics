import { createSettingsPerformanceControls } from "#ivlyrics/features/settings/settingsPerformanceControls.mjs";
import { readSettingsSource } from "./fixtures/legacy-page-source.mjs";
import { SETTINGS_BACKGROUND_PRESETS } from "#ivlyrics/features/settings/settingsBackgroundPresets.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { createPlaybackSettingsTabs } from "../src/features/settings/settingsPlaybackTabs.mjs";
import { createAppConfig } from "../src/spicetify/createAppConfig.mjs";
import { resolveGlobalBackgroundMode as resolveSettingsBackgroundMode } from "../src/lyrics/backgroundModes.mjs";

const source = readSettingsSource();
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
  const react = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) };
  const controls = { ConfigSlider: "ConfigSlider", ConfigSliderRange: "ConfigSliderRange", ConfigButton: "ConfigButton" };
  const { getPerformanceSettingsSections, SettingsLoadMeter } = createSettingsPerformanceControls({
    react, translate: key => key, getSettingsText: (_key, fallback) => fallback,
    readVisualSettings: () => CONFIG.visual, useSettingsConfigRevision() {},
    getSettingsPreviewFlag: (key, fallback) => CONFIG.visual[key] ?? fallback,
    getSettingsPreviewNumber: (key, fallback) => Number(CONFIG.visual[key] ?? fallback),
    controls,
  });
  const tree = createPlaybackSettingsTabs({
    react, activeTab: "performance", t: key => key, getPerformanceSettingsSections, handlePerformanceSettingChange,
    navigateToDestination: (...args) => destinations.push(args),
    controls: { ...controls, SettingsSection: "SettingsSection", OptionList: "OptionList", SettingsLoadMeter },
  }).renderPerformanceTab();
  const nodes = elements(tree);
  const meter = nodes.find((node) => node.type === SettingsLoadMeter);
  assert.ok(meter, "the Performance tab still renders its load meter");
  const lists = nodes.filter((node) => node.type === "OptionList");
  return {
    CONFIG, changes, destinations, handlePerformanceSettingChange, tree, meter, lists,
    items: lists.flatMap((node) => Array.from(node.props.items)),
    summary: () => elements(SettingsLoadMeter(meter.props))
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
    "prefetch-enabled", "prefetch-video-enabled", "prefetch-word-details-enabled",
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
    section("const getCurrentSettingsBackgroundMode =", "publishSettingsBackgroundCompatibility("),
    "({ presets: SETTINGS_BACKGROUND_PRESETS, mode: getCurrentSettingsBackgroundMode() });",
  ].join("\n");
  for (const stored of [undefined, false, true]) {
    const CONFIG = createAppConfig({
      storage: {
        get: (key, fallback) => key === "ivLyrics:visual:blur-gradient-background" ? stored ?? fallback : fallback,
        getItem: () => null,
        getPersisted: () => null,
        setItem() {},
      },
    });
    const flag = CONFIG.visual["blur-gradient-background"];
    assert.equal(flag, stored ?? false);
    const background = vm.runInNewContext(backgroundCode, {
      CONFIG: { visual: { "blur-gradient-background": flag } },
      resolveSettingsBackgroundMode, SETTINGS_BACKGROUND_PRESETS,
    });
    assert.equal(background.presets.find((preset) => preset.id === "blur-gradient-background")?.fallbackLabel, "Blur Gradient");
    assert.equal(background.mode, flag ? "blur-gradient-background" : "none");
  }
});
