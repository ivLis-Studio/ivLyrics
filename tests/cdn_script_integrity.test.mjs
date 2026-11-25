import assert from "node:assert/strict";
import test from "node:test";
import { createFuriganaConverter, loadFuriganaDictionary } from "../src/lyrics/furigana.mjs";

function loadKuromojiLoader(browser = {}) {
    const scripts = [];
    let initialized = 0;
    const document = {
        createElement(tag) {
            const element = { tag, remove() { element.removed = true; } };
            scripts.push(element);
            return element;
        },
        head: { appendChild() {} },
    };
    loadFuriganaDictionary({
        browser, document,
        converter: { async init() { initialized += 1; } },
    });
    return { scripts, initialized: () => initialized };
}

test("both Kuromoji mirrors require the same SRI hash and CORS mode", async () => {
    const { scripts, initialized } = loadKuromojiLoader();
    const [primary] = scripts;
    assert.equal(primary.src, "https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/build/kuromoji.js");
    assert.match(primary.integrity, /^sha(?:256|384|512)-[A-Za-z0-9+/=]+$/);
    assert.equal(primary.crossOrigin, "anonymous");
    assert.equal(initialized(), 0);
    primary.onerror();
    assert.equal(primary.removed, true);
    const [, fallback] = scripts;
    assert.equal(fallback.src, "https://unpkg.com/kuromoji@0.1.2/build/kuromoji.js");
    assert.equal(fallback.integrity, primary.integrity);
    assert.equal(fallback.crossOrigin, "anonymous");
    await fallback.onload();
    assert.equal(initialized(), 1);
});

test("an already-loaded Kuromoji does not request another script", () => {
    const { scripts, initialized } = loadKuromojiLoader({ kuromoji: {} });
    assert.deepEqual(scripts, []);
    assert.equal(initialized(), 1);
});

test("the dictionary publishes one readiness event after concurrent initialization", async () => {
    const browser = new EventTarget();
    let builds = 0;
    browser.CustomEvent = CustomEvent;
    browser.XMLHttpRequest = class MockXMLHttpRequest {};
    browser.kuromoji = { builder: () => ({
        build(callback) { builds++; callback(null, {}); },
    }) };
    const converter = createFuriganaConverter(browser);
    const availability = [];
    browser.addEventListener("furigana-ready", () => availability.push(converter.isAvailable()));
    await Promise.all([converter.init(), converter.init()]);
    await converter.init();
    assert.equal(builds, 1);
    assert.deepEqual(availability, [true]);
});
