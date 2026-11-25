import { readI18nFixture } from "./fixtures/legacy-page-source.mjs";
import { readLanguageTable } from "./fixtures/language-source.mjs";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

test("Song Controls has a localized title and description in all 22 languages", async () => {
  const directory = new URL("../src/i18n/langs/", import.meta.url);
  const files = readdirSync(directory).filter((file) => /^Lang.*\.js$/.test(file));
  assert.equal(files.length, 22);
  const runtime = vm.createContext({ window: {}, localStorage: { getItem: () => "en", setItem() {} } });
  const locales = files.map(file => ({ file, locale: readLanguageTable(file) }));
  vm.runInContext(readI18nFixture(), runtime);
  const english = locales.find(({ file }) => file === "LangEn.js").locale.settingsAdvanced.controllerStyle;
  const korean = locales.find(({ file }) => file === "LangKo.js").locale.settingsAdvanced.controllerStyle;
  assert.equal(english.title, "Song Controls");
  assert.equal(korean.title, "곡 컨트롤");
  for (const { file, locale } of locales) {
    assert.equal(await runtime.window.I18n.setLanguage(locale.meta.code), true);
    for (const suffix of ["title", "subtitle"]) {
      const key = `settingsAdvanced.controllerStyle.${suffix}`, value = locale.settingsAdvanced.controllerStyle[suffix];
      assert.equal(typeof value, "string", `${file}: ${key}`);
      assert.ok(value.trim(), `${file}: empty ${key}`);
      assert.equal(runtime.window.I18n.t(key), value, `${file}: no fallback`);
      if (file !== "LangEn.js") assert.notEqual(value, english[suffix], `${file}: translated ${key}`);
    }
  }
});
