import assert from "node:assert/strict";
import test from "node:test";
import initializeBingTranslate from "../src/providers/ai/Addon_AI_BingTranslate.js";
import initializeGoogleTranslate from "../src/providers/ai/Addon_AI_GoogleTranslate.js";
import { createWebTranslationTransport } from "../src/providers/ai/webTranslationTransport.mjs";

const providers = {
    "bing-translate": { initialize: initializeBingTranslate, limit: 2800, target: "zh-Hant" },
    "google-translate": { initialize: initializeGoogleTranslate, limit: 3500, target: "zh-TW" },
};
const bingSession = (number, key = Date.now(), expiry = 60000) =>
    new Response(`<div data-iid="fixture"></div><script>IG:"fixture"; params_AbusePreventionHelper = [${key},"fixture-${number}",${expiry}]</script>`);
const bingOutput = text => Response.json([{ translations: [{ text }] }]);
const googleOutput = text => Response.json([[[text]]]);

function fixture(id, { getSession = bingSession, output = text => text, onTranslation } = {}) {
    const calls = [];
    const storage = new Map([["spicetify:corsProxyTemplate", "https://proxy.example.invalid/{url}"]]);
    const host = {
        localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
        async fetch(_url, options) {
            if (options.method === "GET") {
                calls.push({ method: "GET" });
                return getSession(calls.filter(call => call.method === "GET").length);
            }
            const params = new URLSearchParams(options.body);
            const text = params.get("q") ?? params.get("text");
            const target = params.get("tl") ?? params.get("to");
            calls.push({ method: "POST", text, target, token: params.get("token") });
            if (onTranslation) return onTranslation(text, params.get("token"));
            const translated = output(text);
            return id === "bing-translate" ? bingOutput(translated) : googleOutput(translated);
        },
    };
    let addon;
    providers[id].initialize({ host, debug() {}, registerAiAddon: value => { addon = value; } });
    return { addon, calls, posts: () => calls.filter(call => call.method === "POST") };
}

for (const [id, { limit, target }] of Object.entries(providers)) {
    test(`${id}: preserves protected lines, blank indices, and simultaneous vocals when paragraphs merge`, async () => {
        const { addon, posts } = fixture(id, {
            output: text => text.includes("\n") || text === "Lead / Echo" ? "Merged paragraph" : `T(${text})`,
        });
        const streamed = [];
        const translation = await addon.translateLyrics({
            text: "[Verse]\r\nHello\r\n\r\nLead / Echo\r\n♪\r\n(Backing)\r\nLast",
            lang: "zh_TW",
            onLine: (...args) => streamed.push(args),
        });
        const expected = ["[Verse]", "T(Hello)", "", "T(Lead) / T(Echo)", "♪", "(Backing)", "T(Last)"];
        assert.deepEqual(translation, { translation: expected });
        assert.deepEqual(streamed, expected.map((line, index) => [index, line, { provider: id, final: true }]));
        assert.ok(posts().every(call => call.target === target));
        assert.ok(posts().every(call => !/\[Verse\]|♪|\(Backing\)|\n\n/.test(call.text)));
    });

    test(`${id}: bounds requests for long lyrics without splitting a Unicode pair or output line`, async () => {
        const { addon, posts } = fixture(id);
        const song = [...Array.from({ length: 81 }, (_, i) => `row ${i}`), "x".repeat(limit - 1) + "😀end"];
        const { translation } = await addon.translateLyrics({ text: song.join("\n") });
        assert.equal(translation.length, song.length);
        assert.deepEqual(translation.slice(0, -1), song.slice(0, -1));
        assert.equal(translation.at(-1).replace(" ", ""), song.at(-1));
        assert.equal(posts().length, 5);
        assert.ok(posts().every(({ text }) => text.length <= limit && text.split("\n").length <= 40 && text.isWellFormed()));
    });

    test(`${id}: retains the translation-only settings and metadata output contract`, async () => {
        const { addon, posts } = fixture(id, { output: text => text.includes("\n") ? "Merged" : `T(${text})` });
        assert.equal(addon.id, id);
        assert.equal(addon.supports.pronunciation, false);
        assert.equal(addon.getSettingsUI(), null);
        assert.deepEqual(await addon.translateLyrics({ text: "♪\n\n[Intro]" }), { translation: ["♪", "", "[Intro]"] });
        await assert.rejects(addon.translateLyrics({ text: "line", wantSmartPhonetic: true }), /Pronunciation generation is not supported/);
        assert.equal(posts().length, 0);
        assert.deepEqual(await addon.translateMetadata({ title: " Title ", artist: " Artist ", lang: "en-GB" }), {
            translated: { title: "T(Title)", artist: "T(Artist)" },
            romanized: { title: "Title", artist: "Artist" },
        });
        assert.deepEqual(posts().map(call => call.text), ["Title\nArtist", "Title", "Artist"]);
        assert.ok(posts().every(call => call.target === "en"));
        assert.equal(await addon.testConnection(), true);
    });
}

test("Bing coalesces session fetches and ignores a rejected response from an older session", async () => {
    let resolveOldRejection;
    const heldRejection = new Promise(resolve => { resolveOldRejection = resolve; });
    let bothInProgress;
    const firstRequestsArrived = new Promise(resolve => { bothInProgress = resolve; });
    const { addon, calls, posts } = fixture("bing-translate", {
        onTranslation(text, token) {
            if (token !== "fixture-1") return bingOutput(text.toUpperCase());
            if (text === "late") {
                bothInProgress();
                return heldRejection;
            }
            return Response.json({ StatusCode: 401 });
        },
    });
    const first = addon.translateLyrics({ text: "first" });
    const second = addon.translateLyrics({ text: "late" });
    await firstRequestsArrived;
    assert.deepEqual(await first, { translation: ["FIRST"] });
    resolveOldRejection(Response.json({ StatusCode: 401 }, { status: 401 }));
    assert.deepEqual(await second, { translation: ["LATE"] });
    assert.equal(calls.filter(call => call.method === "GET").length, 2);
    assert.deepEqual(posts().map(call => call.token), ["fixture-1", "fixture-1", "fixture-2", "fixture-2"]);
});

test("Bing stops retrying when each issued token is already expired", async () => {
    const { addon, calls, posts } = fixture("bing-translate", { getSession: number => bingSession(number, Date.now() - 60000, 1) });
    await assert.rejects(addon.testConnection(), /Translator token already expired/);
    assert.equal(calls.filter(call => call.method === "GET").length, 2);
    assert.equal(posts().length, 0);
});

test("Bing surfaces a CAPTCHA or a rate limit immediately", async () => {
    for (const [payload, status, message] of [
        [{ ShowCaptcha: true, StatusCode: 401 }, 200, /captcha/],
        [{ StatusCode: 401 }, 429, /limit exceeded/],
    ]) {
        const { addon, calls } = fixture("bing-translate", { onTranslation: () => Response.json(payload, { status }) });
        await assert.rejects(addon.testConnection(), message);
        assert.deepEqual(calls.map(call => call.method), ["GET", "POST"]);
    }
});

test("transport deadline remains active while the response body is being read", async () => {
    let signal;
    const transport = createWebTranslationTransport({
        name: "Fixture",
        timeoutMs: 10,
        async fetch(_url, options) {
            signal = options.signal;
            return {
                text: () => new Promise((_, reject) => {
                    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
                }),
            };
        },
    });
    await assert.rejects(transport.read("https://example.invalid", {}, response => response.text()), {
        message: "[Fixture] Request timed out", retryable: true,
    });
    assert.equal(signal.aborted, true);
});
