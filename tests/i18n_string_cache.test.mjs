import assert from "node:assert/strict";
import test from "node:test";
import { createI18n } from "../src/i18n/createI18n.mjs";

// Interface strings are resolved once per language and reused, so a language
// switch must drop every resolved string, including fallbacks and misses.
const languages = new Map([
  ["ko", { greeting: "안녕", only: { ko: "한국어 전용" }, research: { title: "곡 정보" }, count: "{n}개" }],
  ["en", { greeting: "Hello", count: "{n} items" }],
  ["ja", { greeting: "こんにちは", later: "後で追加" }],
]);

const createFixture = (stored = "ko") => createI18n({
  languages, languageNames: { ko: "한국어", en: "English", ja: "日本語" },
  readLanguage: () => stored, writeLanguage() {}, onLanguageChanged() {}, debug() {},
});

test("resolved strings follow language switches, fallbacks and misses", async () => {
  const i18n = createFixture("en");
  assert.equal(i18n.t("greeting"), "Hello");
  assert.equal(i18n.t("only.ko"), "한국어 전용", "missing keys fall back to the default language");
  assert.equal(i18n.t("later"), "", "unknown keys return an empty string");
  assert.equal(i18n.t("tmi.title"), "곡 정보", "aliases resolve through the fallback too");
  assert.equal(i18n.t("count", { n: 3 }), "3 items");
  assert.equal(i18n.t("only"), "", "sections are not strings");

  assert.equal(await i18n.setLanguage("ja"), true);
  assert.equal(i18n.t("greeting"), "こんにちは");
  assert.equal(i18n.t("later"), "後で追加", "a key missing before the switch is found after it");
  assert.equal(i18n.t("count", { n: 2 }), "2개");

  assert.equal(await i18n.setLanguage("ko", { persist: false }), true);
  assert.equal(i18n.t("greeting"), "안녕");
  assert.equal(i18n.t("later"), "");
});

test("the language list and all-language search text come from the catalog once", () => {
  const i18n = createFixture();
  assert.deepEqual(i18n.getAvailableLanguages(), [
    { code: "ko", name: "한국어" }, { code: "en", name: "English" }, { code: "ja", name: "日本語" },
  ]);
  assert.notStrictEqual(i18n.getAvailableLanguages(), i18n.getAvailableLanguages(), "callers get their own list");
  assert.deepEqual(i18n.getAllTranslations("greeting"), ["안녕", "Hello", "こんにちは"]);
  assert.deepEqual(i18n.getAllTranslations("tmi.title"), ["곡 정보"]);
  assert.deepEqual(i18n.getAllTranslations(""), []);
});
