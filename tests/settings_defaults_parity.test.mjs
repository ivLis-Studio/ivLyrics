import { readSettingsSource } from "./fixtures/legacy-page-source.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { createAppConfig, createDefaultVisualSettings } from "../src/spicetify/createAppConfig.mjs";
import {
  SETTINGS_DEFAULT_VALUES, SETTINGS_FALLBACK_DEFAULT_VALUES, SETTINGS_BACKGROUND_MODE_KEY,
  getSettingDefaultValue, hasSettingDefault,
} from "../src/features/settings/settingsDefaults.mjs";

const settingsSource = readSettingsSource();

// Settings without a fixed default (environment, per-song or account data,
// colours the theme decides) and the background presets, which the window
// treats as one choice with its own default.
const NOT_TRACKED = [
  /^language$/, /^delay$/, /^translate$/, /^synced-compact$/, /^global-sync-offset$/,
  /^(?:background|active|inactive|highlight)-color$/, /^font-size$/, /^font-family$/,
  /^(?:colorful|gradient-background|blur-gradient-background|solid-background|video-background)$/,
  /^translation-mode/, /^gemini-api-key/, /^community-video-/,
  /^translate:(?:translated-lyrics-source|display-mode|pronunciation-notation|detect-language-override)$/,
];

test("settings use startup defaults for every resettable value", () => {
  const visual = createDefaultVisualSettings();
  for (const [key, value] of Object.entries(visual)) {
    const resettable = !NOT_TRACKED.some(pattern => pattern.test(key));
    assert.equal(hasSettingDefault(key), resettable, key);
    if (resettable) assert.equal(getSettingDefaultValue(key), value, key);
  }
  assert.equal(getSettingDefaultValue(SETTINGS_BACKGROUND_MODE_KEY), "gradient-background");
  assert.equal(getSettingDefaultValue("panel-font-scale"), "100");
  assert.equal(getSettingDefaultValue("original-font-size"), 44);
  assert.equal(getSettingDefaultValue("fullscreen-vinyl-original-font-size"), 31);
  assert.equal(getSettingDefaultValue("fullscreen-video-stage-lyric-background-opacity"), 46);
});

test("fallback defaults cover keys startup does not load", () => {
  const visual = createDefaultVisualSettings();
  for (const [key, value] of Object.entries(SETTINGS_FALLBACK_DEFAULT_VALUES)) {
    assert.equal(Object.hasOwn(visual, key), false);
    assert.equal(hasSettingDefault(key), true);
    assert.equal(getSettingDefaultValue(key), value);
  }
  assert.equal(hasSettingDefault("not-a-setting"), false);
  assert.equal(hasSettingDefault(undefined), false);
});

test("stored settings retain their coercion, inheritance, and locale-dependent modes", () => {
  const initial = new Map(Object.entries({
    "language": "ko",
    "panel-lyrics-enabled": "false",
    "original-font-family": "  Noto Sans  ",
    "original-font-size": "50",
    "phonetic-font-size": "0",
    "fullscreen-vinyl-translation-font-size": "30",
    "fullscreen-focus-presentation": "standard",
    "fullscreen-video-stage-lyric-background-opacity": "false",
    "fullscreen-vinyl-rotation-speed": "1000",
    "pseudo-karaoke-render-advance": "-10",
    "fullscreen-cd-visualizer-density": "0",
    "video-scale": "0",
    "translation-mode-2:korean": "gemini_ko",
  }).map(([key, value]) => ["ivLyrics:visual:" + key, value]));
  const storage = {
    get(key, fallback = true) {
      const value = initial.get(key);
      return value === "true" || value === "false" ? value === "true" : fallback;
    },
    getItem: (key) => initial.get(key) ?? null,
    getPersisted: (key) => initial.get(key) ?? null,
    setItem: (key, value) => initial.set(key, String(value)),
  };
  let i18n;
  const config = createAppConfig({ storage, readI18n: () => i18n });
  assert.equal(config.visual.language, "ko");
  assert.equal(config.visual["panel-lyrics-enabled"], false);
  assert.equal(config.visual["original-font-family"], "  Noto Sans  ");
  assert.equal(config.visual["fullscreen-vinyl-original-font-size"], 35);
  assert.equal(config.visual["fullscreen-vinyl-phonetic-font-size"], 0);
  assert.equal(config.visual["fullscreen-vinyl-translation-font-size"], 30);
  assert.equal(config.visual["fullscreen-focus-presentation"], "vinyl");
  assert.equal(config.visual["fullscreen-video-stage-lyric-background-opacity"], 0);
  assert.equal(config.visual["fullscreen-vinyl-rotation-speed"], 200);
  assert.equal(config.visual["pseudo-karaoke-render-advance"], 0);
  assert.equal(config.visual["fullscreen-cd-visualizer-density"], 0);
  assert.equal(config.visual["video-scale"], 105);
  assert.equal(config.visual["translation-mode-2:korean"], "gemini_ko");
  assert.equal(config.visual["translation-mode:korean"], "none");
  assert.equal(initial.get("ivLyrics:visual:fullscreen-vinyl-original-font-family"), "Noto Sans");
  assert.equal(initial.get("ivLyrics:visual:fullscreen-video-stage-original-font-family"), "Noto Sans");
  assert.equal(getSettingDefaultValue("fullscreen-vinyl-original-font-family"), "Pretendard Variable");
  assert.equal(SETTINGS_DEFAULT_VALUES["fullscreen-vinyl-original-font-size"], 31);
  assert.deepEqual(config.modes, ["Karaoke", "Synced", "Unsynced"]);
  i18n = { t: (key) => "ko:" + key };
  assert.deepEqual(config.modes, ["ko:modes.karaoke", "ko:modes.synced", "ko:modes.unsynced"]);
});

test("stored values are compared the way they are shown", () => {
  const start = settingsSource.indexOf("const normalizeSettingComparable =");
  const end = settingsSource.indexOf("const getCurrentSettingValue =", start);
  assert.ok(start >= 0 && end > start);
  const equal = vm.runInNewContext(settingsSource.slice(start, end) + "\nsettingValuesEqual;");
  assert.equal(equal("16", 16), true);
  assert.equal(equal("0.50", 0.5), true);
  assert.equal(equal("-2", -2), true);
  assert.equal(equal("true", true), true);
  assert.equal(equal("false", false), true);
  assert.equal(equal("#ABCDEF", "#abcdef"), true);
  assert.equal(equal(" Pretendard Variable ", "Pretendard Variable"), true);
  assert.equal(equal(null, ""), true);
  assert.equal(equal(undefined, ""), true);
  assert.equal(equal("1", "2"), false);
  assert.equal(equal("", 0), false);
  assert.equal(equal(false, 0), false);
  assert.equal(equal("Roboto", "roboto"), false);
});

test("video-stage lyric background opacity reloads numeric values including zero", () => {
  const key = "ivLyrics:visual:fullscreen-video-stage-lyric-background-opacity";
  const setting = "fullscreen-video-stage-lyric-background-opacity";
  for (const [stored, opacity] of [["0", 0], ["28", 28], ["101", 100], ["", 46], ["invalid", 46], ["true", 1]]) {
    const storage = {
      get: (_key, fallback = true) => fallback,
      getItem: name => name === key ? stored : null,
      getPersisted: () => null,
      setItem() {},
    };
    assert.equal(createAppConfig({ storage }).visual[setting], opacity, stored);
  }
});
