import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import test from "node:test";
import { deflateSync } from "fflate";
import { buildLanguageCatalog } from "../.github/scripts/build_language_catalog.mjs";
import { initializeRuntimeI18n } from "../src/i18n/I18n.js";
import { createI18n } from "../src/i18n/createI18n.mjs";
import { INTERFACE_LANGUAGE_CHANGED, INTERFACE_LANGUAGE_STORAGE_KEY } from "../src/i18n/interfaceLanguage.mjs";
import { LANGUAGE_DATA } from "../src/i18n/languageCatalog.mjs";
import { createLazyLanguageCatalog } from "../src/i18n/lazyLanguageCatalog.mjs";

function createHost(language) {
    const values = new Map([[INTERFACE_LANGUAGE_STORAGE_KEY, language]]);
    const host = Object.assign(new EventTarget(), { CustomEvent, localStorage: {
        getItem: key => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value),
    }});
    return { host, values };
}

test("startup and route share the current locale and attach it to a later config", async () => {
    const { host } = createHost("ja");
    const changes = [];
    host.addEventListener(INTERFACE_LANGUAGE_CHANGED, ({ detail }) => changes.push(detail.language));
    const startup = initializeRuntimeI18n({ host });
    assert.equal(host.t("syncCreator.noLyrics"), LANGUAGE_DATA.get("ja").syncCreator.noLyrics);
    await startup.setLanguage("es");
    host.CONFIG = { visual: { language: "ko" } };
    const route = initializeRuntimeI18n({ host });
    assert.strictEqual(route, startup);
    assert.equal(host.CONFIG.visual.language, "es");
    assert.equal(route.t("syncCreator.noLyrics"), LANGUAGE_DATA.get("es").syncCreator.noLyrics);
    assert.deepEqual(changes, ["ja", "es"]);
});

test("explicitly saving the current preview writes it without another language change", async () => {
    const { host, values } = createHost("ko");
    const i18n = initializeRuntimeI18n({ host });
    await i18n.setLanguage("fr", { persist: false });
    assert.equal(values.get(INTERFACE_LANGUAGE_STORAGE_KEY), "ko");
    await i18n.setLanguage("fr");
    assert.equal(values.get(INTERFACE_LANGUAGE_STORAGE_KEY), "fr");
});

test("starting and listing languages does not decode unused locale dictionaries", async () => {
    const languages = createLazyLanguageCatalog({
        ko: deflateRawSync(JSON.stringify({ example: "한글" })).toString("base64"),
        ja: deflateRawSync(JSON.stringify({ example: "日本語" })).toString("base64"),
        en: "invalid-encoded-language",
    });
    const i18n = createI18n({ languages, languageNames: {}, readLanguage: () => "ko", writeLanguage() {},
        onLanguageChanged() {}, debug() {} });
    i18n.initSync();
    assert.deepEqual(i18n.getAvailableLanguages().map(({ code }) => code), ["ko", "ja", "en"]);
    assert.equal(i18n.t("example"), "한글");
    await i18n.setLanguage("ja");
    assert.equal(i18n.t("example"), "日本語");
    assert.strictEqual(languages.get("ja"), languages.get("ja"));
});

test("the bundled locale catalog is independent of the host zlib implementation", () => {
    const declaration = buildLanguageCatalog().match(/createLazyLanguageCatalog\(([^\n]*)\);$/);
    assert.ok(declaration);
    const encoded = JSON.parse(declaration[1]);
    const catalog = createLazyLanguageCatalog(encoded);
    assert.deepEqual([...catalog.keys()], [...LANGUAGE_DATA.keys()]);
    for (const [code, dictionary] of LANGUAGE_DATA) {
        const bytes = new TextEncoder().encode(JSON.stringify(dictionary));
        assert.deepEqual(Buffer.from(encoded[code], "base64"), Buffer.from(deflateSync(bytes)), code);
        assert.deepEqual(catalog.get(code), dictionary, code);
    }
});
