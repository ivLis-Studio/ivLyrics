import { createCdSettingsCatalog } from "#ivlyrics/features/settings/settingsCdCatalog.mjs";
import { createCdVisualizerApi } from "../src/features/player/CdVisualizer.js";
import { readI18nFixture } from "./fixtures/legacy-page-source.mjs";
import { readLanguageTable } from "./fixtures/language-source.mjs";
import { SETTINGS_CD_STYLE_ORDER } from "#ivlyrics/features/settings/createSettingsFullscreenPreview.mjs";
import { sourceUrl } from "./fixtures/source-paths.mjs";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const root = new URL("../", import.meta.url);
const localeDirectory = new URL("src/i18n/langs/", root);
const localeFiles = readdirSync(localeDirectory).filter((name) => /^Lang.*\.js$/.test(name)).sort();
const read = (path) => readFileSync(sourceUrl(path), "utf8");
const runtime = vm.createContext({
  window: {},
  localStorage: { getItem: () => "en", setItem() {} },
});
const locales = new Map(localeFiles.map(file => [file, readLanguageTable(file)]));
vm.runInContext(readI18nFixture(), runtime, { filename: "I18n.js" });
const i18n = runtime.window.I18n;
const { STYLES, COLOR_MODES } = createCdVisualizerApi({});
const settingNames = [
  "discSize", "rotation", "rotationSpeed", "enabled", "style", "mirror",
  "colorMode", "albumGradient", "color", "sensitivity", "density", "thickness",
];
const cdKeys = [
  "mode", "subtitle", "visualizerTitle", "visualizerDesc", "loading", "unavailable",
  ...settingNames.flatMap((name) => [`${name}Label`, `${name}Desc`]),
  ...Array.from(STYLES, (style) => `styles.${style}`),
  ...Array.from(COLOR_MODES, (mode) => `colorModes.${mode}`),
].sort();
const auditedKeys = [
  ...cdKeys.map((key) => `vinyl.cd.${key}`),
  "vinyl.presentation.compactLabel", "vinyl.presentation.compactDescription",
];

function ownValue(object, path) {
  for (const part of path.split(".")) {
    if (!object || !Object.hasOwn(object, part)) return undefined;
    object = object[part];
  }
  return object;
}

function leafKeys(object, prefix = "") {
  return Object.entries(object).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return value && typeof value === "object" ? leafKeys(value, path) : [path];
  }).sort();
}

// Include named interpolation, printf parameters and markup so translated
// entries cannot introduce or drop formatting even when the source has none.
const formatTokens = (text) => text.match(/\$\{[^}]+\}|\{\{[^}]+\}\}|\{[^{}]+\}|%(?:\d+\$)?[sdif]|<\/?[A-Za-z][^>]*>/g) || [];
const normalize = (text) => text.normalize("NFKC").trim().toLocaleLowerCase("en");
const technicalToken = /^(?:CD|LED|Spotify|px|Hz|BPM|FFT)$/i;
const english = locales.get("LangEn.js");

test("CD localization covers 22 locales, 12 settings, nine shapes and four color modes", () => {
  assert.equal(locales.size, 22);
  assert.equal(settingNames.length, 12);
  assert.equal(STYLES.length, 9);
  assert.equal(COLOR_MODES.length, 4);
  assert.equal(cdKeys.length, 43);
  assert.equal(auditedKeys.length, 45);
  assert.deepEqual(leafKeys(english.vinyl.cd), cdKeys);
  assert.deepEqual(
    Array.from(i18n.getAvailableLanguages(), ({ code }) => code).sort(),
    Array.from(locales.values(), ({ meta }) => meta.code).sort(),
  );
});

test("CD settings catalog and literal UI lookups only request existing translations", () => {
  const requested = new Set();
  const sections = createCdSettingsCatalog({
    readVisualSettings: () => ({}),
    translate: key => { requested.add(key); return key; },
    getSettingsPreviewFlag: (_key, fallback) => fallback,
    components: {},
  })({ controls: false });
  for (const section of sections) {
    requested.add(section.titleKey);
    requested.add(section.subtitleKey);
  }
  for (const file of ["Settings.js", "FullscreenOverlay.js", "VinylPlayerMode.js", "CdVisualizer.js", "src/features/player/vinylCompactDisc.mjs", "src/features/player/vinylStageControls.mjs"]) {
    for (const [, key] of read(file).matchAll(/["'](vinyl\.cd\.[A-Za-z0-9_.]+)["']/g)) requested.add(key);
  }
  assert.deepEqual([...requested].sort(), cdKeys.map((key) => `vinyl.cd.${key}`), "all CD strings are wired to the UI");
  for (const [file, locale] of locales) {
    for (const key of requested) assert.equal(typeof ownValue(locale, key), "string", `${file}: ${key}`);
  }
});

test("album-art entry preference resolves in all 22 languages without English fallback", async () => {
  for (const [file, locale] of locales) {
    assert.equal(await i18n.setLanguage(locale.meta.code), true);
    for (const suffix of ["Label", "Desc"]) {
      const key = `vinyl.settings.albumClickOpensMode${suffix}`;
      const value = ownValue(locale, key), reference = ownValue(english, key);
      assert.equal(typeof value, "string", `${file}: ${key}`);
      assert.ok(value.trim(), `${file}: ${key}`);
      assert.equal(i18n.t(key), value, `${file}: no fallback`);
      assert.deepEqual(formatTokens(value), formatTokens(reference));
      if (file !== "LangEn.js") assert.notEqual(normalize(value), normalize(reference), `${file}: translated copy`);
    }
  }
});

for (const [file, locale] of locales) {
  test(`${file}: every CD string resolves locally with intact formatting and no English fallback`, async () => {
    assert.deepEqual(leafKeys(locale.vinyl.cd), cdKeys);
    assert.equal(locale.vinyl.presentation.compactLabel, locale.vinyl.cd.mode);
    assert.equal(await i18n.setLanguage(locale.meta.code), true);
    assert.equal(i18n.getCurrentLanguage(), locale.meta.code);
    for (const key of auditedKeys) {
      const text = ownValue(locale, key);
      const reference = ownValue(english, key);
      assert.equal(typeof text, "string", key);
      assert.ok(text.trim(), `${key}: empty translation`);
      assert.doesNotMatch(text, /vinyl\.cd\.|\b(?:TODO|FIXME)\b/, `${key}: unfinished translation`);
      assert.deepEqual(formatTokens(text).sort(), formatTokens(reference).sort(), `${key}: formatting tokens`);
      assert.doesNotMatch(text.replace(/\$\{[^}]+\}|\{\{[^}]+\}\}|\{[^{}]+\}/g, ""), /[{}]/, `${key}: malformed placeholder`);
      if (file !== "LangEn.js" && !technicalToken.test(reference)) {
        assert.notEqual(normalize(text), normalize(reference), `${key}: copied English`);
      }
      assert.equal(i18n.t(key), text, `${key}: resolved through another locale`);
    }
  });
}
