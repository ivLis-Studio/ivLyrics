import { readSettingsSource } from "./fixtures/legacy-page-source.mjs";
import { useSettingsConfigSignal } from "../src/features/settings/settingsSignals.mjs";
import { createSettingsLyricsPreview, getSettingsPreviewSupplementVisibility } from "#ivlyrics/features/settings/createSettingsLyricsPreview.mjs";
import { createSettingsPanelPreview } from "#ivlyrics/features/settings/createSettingsPanelPreview.mjs";
import { readSettingFlag, readSettingNumber } from "#ivlyrics/features/settings/settingsPreviewValues.mjs";
import { sourceUrl } from "./fixtures/source-paths.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { getPanelSupplementVisibility } from "../src/lyrics/panelLyricPresentation.mjs";
import { getPanelLineSlotHeight } from "../src/lyrics/panelLyricsStyles.mjs";

const read = (name) => readFileSync(sourceUrl(name), "utf8");
const settings = readSettingsSource();
const section = (source, start, end) => {
  const from = source.indexOf(start), to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, "missing production section: " + start);
  return source.slice(from, to);
};
const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === "object" ? [tree, ...nodes(tree.children || [])] : [];
const byClass = (tree, name) => nodes(tree).filter((node) => node.props.className?.split(" ").includes(name));
const originalParagraph = (tree) => byClass(tree, "lyrics-lyricsContainer-LyricsLine")[0].children[0];
const panelLayers = (tree) => nodes(tree).filter((node) => typeof node.props.style?.fontSize === "string");
const panelOriginals = (tree) => panelLayers(tree).filter((node) => node.props.style.fontWeight === 700);
const layerVisibility = (tree, isPanel) => isPanel
  ? [400, 500].map((weight) => panelLayers(tree).some((node) => node.props.style.fontWeight === weight))
  : ["phonetic", "translation"].map((role) => byClass(tree, "lyrics-lyricsContainer-LyricsLine-" + role).length > 0);

// Run the real sample components, their config subscription and the live
// presentation/typography helpers. No player, storage or network is available.
function createHarness({ component = "SettingsLyricsPreview", visual = {}, props = {} } = {}) {
  const slots = [], effects = [], listeners = new Map(), frames = new Map(), cancelled = [];
  let cursor = 0, nextFrame = 0, dirty = false, disposed = false, renders = 0, tree;
  const useState = (initial) => {
    const position = cursor++;
    const slot = slots[position] ??= { value: typeof initial === "function" ? initial() : initial };
    return [slot.value, (value) => {
      assert.equal(disposed, false, "an unmounted preview must not update state");
      slot.value = typeof value === "function" ? value(slot.value) : value;
      dirty = true;
    }];
  };
  const useEffect = (build, deps) => {
    const position = cursor++, previous = slots[position];
    if (previous && deps.every((value, i) => Object.is(value, previous.deps[i]))) return;
    const slot = slots[position] = { deps };
    effects.push(() => {
      previous?.cleanup?.();
      slot.cleanup = build();
    });
  };
  const forbidden = (name) => () => assert.fail("preview must not call " + name);
  const react = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
    memo: (render) => render, useState, useEffect,
  };
  const context = vm.createContext({
    useSettingsConfigSignal, react, useState, useEffect, CONFIG: { visual: { ...visual } },
    window: {
      addEventListener(name, callback) {
        if (!listeners.has(name)) listeners.set(name, new Set());
        listeners.get(name).add(callback);
      },
      removeEventListener(name, callback) { listeners.get(name)?.delete(callback); },
      Spicetify: { Player: new Proxy({}, { get: (_target, name) => forbidden("Player." + String(name)) }) },
    },
    requestAnimationFrame(callback) { const id = nextFrame++; frames.set(id, callback); return id; },
    cancelAnimationFrame(id) { cancelled.push(id); frames.delete(id); },
    setTimeout: forbidden("setTimeout"), setInterval: forbidden("setInterval"), fetch: forbidden("fetch"),
    StorageManager: new Proxy({}, { get: (_target, name) => forbidden("StorageManager." + String(name)) }),
    localStorage: new Proxy({}, { get: (_target, name) => forbidden("localStorage." + String(name)) }),
    Utils: { applyFuriganaIfEnabled: (text) => text, rubyTextToHTML: (text) => text },
    I18n: { t: (key) => ({
      "settingsAdvanced.livePreview.sampleTextPhonetic": "sample reading",
      "settingsAdvanced.livePreview.sampleText": "sample translation",
      "settingsUi.preview.annotationSample": "sample annotation",
    }[key] || key) },
    KaraokeLine: function KaraokeLine() {},
    SettingsInterludeIndicator: function InterludeIndicator() {},
    createSettingsLyricsPreview, createSettingsPanelPreview, getSettingsPreviewSupplementVisibility,
    getCurrentSettingsBackgroundMode: () => "none", SETTINGS_BACKGROUND_PRESETS: [],
    normalizeSettingsHexColor: (value) => value || null,
    getPanelSupplementVisibility, readSettingFlag, readSettingNumber,
  });
  vm.runInContext([
    section(settings, "const getSettingsText =", "// ---------------------------------------------------------------------------"),
    section(settings, "const settingsSignalHost =", "const SettingsSection ="),
    section(settings, "const getSettingsPreviewNumber =", "const { SettingsCdDiscPreview"),
    "globalThis.api = { SettingsLyricsPreview, NowPlayingPanelPreview, getPanelSupplementVisibility };",
  ].join("\n"), context);
  const render = () => {
    cursor = 0;
    dirty = false;
    renders++;
    tree = context.api[component](props);
    effects.splice(0).forEach((effect) => effect());
    return tree;
  };
  render();
  return {
    context, frames, cancelled, listeners,
    get visual() { return context.CONFIG.visual; },
    get tree() { return tree; },
    renders: () => renders,
    emit(name, detail) { for (const callback of listeners.get(name) || []) callback({ detail }); },
    flush() {
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach((callback) => callback());
      if (dirty) render();
      assert.equal(frames.size, 0, "preview notifications must not create a frame loop");
      return tree;
    },
    update(patch, detail = { type: "config" }) {
      Object.assign(context.CONFIG.visual, patch);
      this.emit("ivLyrics", detail);
      return this.flush();
    },
    unmount() {
      disposed = true;
      slots.forEach((slot) => slot?.cleanup?.());
    },
  };
}

test("missing settings keep the sample useful, with panel enabled and annotations disabled by default", () => {
  const lyrics = createHarness({ props: { kind: "annotation" } });
  assert.deepEqual(layerVisibility(lyrics.tree, false), [true, true]);
  assert.equal(byClass(lyrics.tree, "lyrics-lyricsContainer-LyricsLine-culturalNote").length, 0);
  assert.equal(byClass(lyrics.tree, "is-karaoke").length, 1);
  const h = createHarness({ component: "NowPlayingPanelPreview" });
  assert.notEqual(h.tree, null);
  assert.equal(panelOriginals(h.tree).length, 9);
  assert.deepEqual(layerVisibility(h.tree, true), [true, true]);
  assert.equal(panelOriginals(h.tree)[0].props.style.fontSize, "26px");
  assert.equal(h.visual["panel-lyrics-enabled"], undefined, "defaults must not be written to CONFIG");
  lyrics.unmount(); h.unmount();
});

test("disabled panel stays subscribed and can be enabled, disabled and reset while mounted", () => {
  for (const off of [false, "false"]) {
    const h = createHarness({ component: "NowPlayingPanelPreview", visual: { "panel-lyrics-enabled": off } });
    assert.equal(h.tree, null);
    h.update({ "panel-lyrics-enabled": true });
    assert.equal(panelOriginals(h.tree).length, 9);
    h.update({ "panel-lyrics-enabled": off });
    assert.equal(h.tree, null);
    delete h.visual["panel-lyrics-enabled"];
    h.emit("ivLyrics", { type: "config", source: "reset" }); h.flush();
    assert.notEqual(h.tree, null);
    h.unmount();
  }
});

test("annotation master switch updates its sample note on generic config notifications", () => {
  const h = createHarness({ props: { kind: "annotation" } });
  for (const value of [true, false, "true", "false"]) {
    h.update({ "cultural-annotations-enabled": value });
    assert.equal(byClass(h.tree, "lyrics-lyricsContainer-LyricsLine-culturalNote").length,
      value === true || value === "true" ? 1 : 0);
  }
  h.unmount();
});

test("both samples honor typed Japanese conversion modes, including explicit none and swapped slots", () => {
  const cases = [
    ["none", "none"], ["romaji", "none"], ["none", "gemini_ko"],
    ["gemini_ko", "romaji"], ["hiragana", "gemini_en"], ["none", "pinyin"],
  ];
  for (const component of ["SettingsLyricsPreview", "NowPlayingPanelPreview"]) {
    const h = createHarness({ component });
    for (const [reading, translation] of cases) {
      h.update({ "translation-mode:japanese": reading, "translation-mode-2:japanese": translation });
      const expected = h.context.api.getPanelSupplementVisibility(reading, translation);
      assert.deepEqual(layerVisibility(h.tree, component === "NowPlayingPanelPreview"),
        [expected.pronunciation, expected.translation], `${component}: ${reading}/${translation}`);
    }
    h.update({ "translation-mode:japanese": "none", "translation-mode-2:japanese": undefined });
    assert.deepEqual(layerVisibility(h.tree, component === "NowPlayingPanelPreview"), [false, true]);
    delete h.visual["translation-mode:japanese"];
    delete h.visual["translation-mode-2:japanese"];
    h.emit("ivLyrics", { type: "config", source: "reset" }); h.flush();
    assert.deepEqual(layerVisibility(h.tree, component === "NowPlayingPanelPreview"), [true, true]);
    h.unmount();
  }
});

test("non-karaoke samples use live replace rules for both supplements or a translation alone", () => {
  const h = createHarness({ visual: {
    "karaoke-mode-enabled": false, "translate:display-mode": "below",
    "translation-mode:japanese": "romaji", "translation-mode-2:japanese": "gemini_ko",
  } });
  assert.equal(originalParagraph(h.tree).props.dangerouslySetInnerHTML.__html, "此処に歌詞があります");
  assert.deepEqual(layerVisibility(h.tree, false), [true, true]);
  assert.equal(byClass(h.tree, "is-karaoke").length, 0);
  assert.equal(nodes(h.tree).filter((node) => node.type === h.context.KaraokeLine).length, 0);
  h.update({ "translate:display-mode": "replace" });
  assert.equal(originalParagraph(h.tree).props.dangerouslySetInnerHTML.__html, "sample reading");
  const reading = byClass(h.tree, "lyrics-lyricsContainer-LyricsLine-phonetic");
  assert.equal(reading[0].props.dangerouslySetInnerHTML.__html, "sample translation");
  assert.equal(byClass(h.tree, "lyrics-lyricsContainer-LyricsLine-translation").length, 0);
  h.update({ "translation-mode:japanese": "none" });
  assert.equal(originalParagraph(h.tree).props.dangerouslySetInnerHTML.__html, "sample translation");
  assert.deepEqual(layerVisibility(h.tree, false), [false, false]);
  h.update({ "translation-mode-2:japanese": "none" });
  assert.equal(originalParagraph(h.tree).props.dangerouslySetInnerHTML.__html, "此処に歌詞があります");
  h.update({ "karaoke-mode-enabled": true });
  assert.equal(byClass(h.tree, "is-karaoke").length, 1);
  assert.equal(nodes(h.tree).filter((node) => node.type === h.context.KaraokeLine).length, 1);
  h.unmount();
});

test("panel retains its live original-first presentation when the main-page mode is replace", () => {
  const h = createHarness({ component: "NowPlayingPanelPreview", visual: {
    "karaoke-mode-enabled": false, "translate:display-mode": "replace",
  } });
  assert.deepEqual(panelLayers(h.tree).slice(0, 3).map((node) => node.props.style.fontWeight), [700, 400, 500]);
  assert.equal(panelOriginals(h.tree)[4].children[0], "君と過ごす時間");
  h.unmount();
});

test("panel slot height and active original weight match production defaults and configured sizes", () => {
  const panelStyles = readFileSync(new URL("../src/lyrics/panelLyricsStyles.mjs", import.meta.url), "utf8");
  const weight = Number(/\.ivlyrics-panel-line\.active \.ivlyrics-panel-line-text\s*\{[^}]*font-weight:\s*(\d+)/.exec(panelStyles)[1]);
  for (const [size, scale, expected] of [[26, 100, 72], [10, 50, 52], [20, 100, 58], [12, 150, 52], [26, 200, 72], [0, 0, 72]]) {
    const h = createHarness({ component: "NowPlayingPanelPreview", visual: {
      "panel-lyrics-original-size": size, "panel-font-scale": scale,
    } });
    assert.equal(getPanelLineSlotHeight(size, scale), expected);
    const row = nodes(h.tree).find((node) => node.props.style?.flex?.startsWith("0 0 "));
    assert.equal(row.props.style.flex, `0 0 ${expected}px`);
    assert.equal(panelOriginals(h.tree).find((node) => node.props.style.color === "#ffffff").props.style.fontWeight, weight);
    h.unmount();
  }
});

test("mounted panel reads current CONFIG on generic, reset, preset and legacy notifications", () => {
  const h = createHarness({ component: "NowPlayingPanelPreview" });
  h.update({
    "panel-lyrics-original-size": 17, "panel-lyrics-original-font": "Custom Original",
    "panel-lyrics-phonetic-size": 10, "panel-lyrics-translation-size": 12,
    "panel-font-scale": 150, "panel-bg-type": "transparent", "panel-border-enabled": true,
  }, { type: "config", name: "panel-lyrics-original-size", value: 99 });
  assert.equal(panelOriginals(h.tree)[0].props.style.fontSize, "25.5px");
  assert.match(panelOriginals(h.tree)[0].props.style.fontFamily, /^Custom Original,/);
  assert.equal(panelLayers(h.tree)[1].props.style.fontSize, "15px");
  assert.equal(panelLayers(h.tree)[2].props.style.fontSize, "18px");
  assert.equal(h.tree.children[0].props.style.background, "transparent");
  assert.notEqual(h.tree.children[0].props.style.border, "none");
  h.context.CONFIG.visual = { "panel-lyrics-original-size": 19, "panel-bg-type": "custom", "panel-bg-color": "#ff0000" };
  h.emit("ivLyrics:panel-preview-update", { source: "settings-preset" }); h.flush();
  assert.equal(panelOriginals(h.tree)[0].props.style.fontSize, "19px");
  assert.match(h.tree.children[0].props.style.background, /rgba\(255, 0, 0,/);
  delete h.visual["panel-lyrics-original-size"];
  h.emit("ivLyrics", { type: "config", source: "reset" }); h.flush();
  assert.equal(panelOriginals(h.tree)[0].props.style.fontSize, "26px");
  h.visual["panel-lyrics-original-size"] = 18;
  h.emit("ivLyrics:panel-preview-update", { name: "panel-lyrics-original-size", value: 99 }); h.flush();
  assert.equal(panelOriginals(h.tree)[0].props.style.fontSize, "18px", "event payload must not become a stale config copy");
  h.unmount();
});

test("config and preview bursts coalesce, non-config events are ignored, and unmount cancels late work", () => {
  const h = createHarness({ component: "NowPlayingPanelPreview" });
  h.emit("ivLyrics", { type: "songchange" });
  assert.equal(h.frames.size, 0);
  for (let i = 0; i < 100; i++) {
    h.visual["panel-lyrics-original-size"] = 15 + i / 100;
    h.emit("ivLyrics", { type: "config" });
    h.emit("ivLyrics:panel-preview-update", { source: "settings-preset" });
  }
  assert.equal(h.frames.size, 1);
  h.flush();
  assert.equal(h.renders(), 2);
  const staleListener = [...h.listeners.get("ivLyrics:panel-preview-update")][0];
  h.emit("ivLyrics", { type: "config" });
  const staleFrame = [...h.frames.values()][0];
  h.unmount();
  assert.equal(h.frames.size, 0);
  assert.ok([...h.listeners.values()].every((callbacks) => callbacks.size === 0));
  staleListener(); staleFrame();
  assert.equal(h.frames.size, 0);
  assert.equal(h.renders(), 2);
});

test("sample components preserve CONFIG and perform no storage, player or API actions", () => {
  for (const component of ["SettingsLyricsPreview", "NowPlayingPanelPreview"]) {
    const h = createHarness({ component, props: { kind: "annotation" }, visual: {
      "panel-lyrics-enabled": true, "panel-border-enabled": true,
      "cultural-annotations-enabled": true, "karaoke-mode-enabled": false,
      "translate:display-mode": "replace", "translation-mode:japanese": "none",
      "translation-mode-2:japanese": "gemini_ko", "panel-lyrics-original-size": 17,
    } });
    const before = JSON.stringify(h.visual);
    Object.freeze(h.visual);
    h.emit("ivLyrics", { type: "config" }); h.flush();
    assert.equal(JSON.stringify(h.visual), before);
    h.unmount();
  }
});
