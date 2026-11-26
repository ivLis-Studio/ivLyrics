import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";

import inputs from "../src/spicetify/inputs.json" with { type: "json" };
import { bridgeScript, buildPage } from "../.github/scripts/build_pronunciation_lab_mobile.mjs";
import initializePronunciationLab from "../src/providers/ai/Addon_AI_PronunciationLab.js";
import {
    PRONUNCIATION_LAB_ERRORS,
    PRONUNCIATION_LAB_FALLBACK_MODULE_URL,
    PRONUNCIATION_LAB_LATEST_RELEASE_URL,
    createPronunciationLabEngine,
    resolvePronunciationLabModuleUrl,
    resolvePronunciationLabOutput,
    resolvePronunciationLabSource,
} from "../src/providers/ai/pronunciationLabEngine.mjs";
import { installPronunciationLabBridge } from "../src/providers/ai/pronunciationLabMobileBridge.mjs";
import { getPronunciationScriptRule } from "../src/providers/ai/pronunciationPolicy.mjs";
import { bundleInitializer } from "./fixtures/initializer-bundle.mjs";

// A stand-in for the pronunciation-lab module. Words are separated by
// spaces; a word starting with "?" is one the source dictionary cannot read
// (□), except in English, which reads everything. Korean IPA input answers
// with a romanization, as the library does.
const ROMANIZED = { "[같이]": "Gachi", "[가요]": "Gayo" };
function fakeLibrary() {
    const library = {
        calls: [],
        unavailableSources: [],
        async transcribe(text, options) {
            library.calls.push(["transcribe", text, { ...options }]);
            if (options.mode === "ipa") {
                const ipa = text.slice(1, -1);
                return { source: options.source, segments: [], ipa, unresolved: [], romanization: ROMANIZED[ipa] };
            }
            const segments = text.split(/( +)/u).filter(Boolean).map((part) => {
                if (/^ +$/u.test(part)) return { original: part, ipa: "", source: options.source, unresolved: false };
                const unresolved = options.source !== "english"
                    && (part.startsWith("?") || (part === "繁體" && options.variant === "hans"));
                return { original: part, ipa: unresolved ? "" : "[" + part + "]", source: options.source, unresolved };
            });
            return {
                source: options.source,
                segments,
                ipa: segments.map((segment) => (segment.unresolved ? "\u25A1" : segment.ipa || segment.original)).join(""),
                unresolved: segments.filter((segment) => segment.unresolved).map((segment) => segment.original),
                unknownPhones: [],
                unavailableSources: library.unavailableSources,
            };
        },
        async transliterate(text, options) {
            library.calls.push(["transliterate", text, { ...options }]);
            return text.split(/( +)/u).filter(Boolean).map((part) => {
                if (/^ +$/u.test(part)) return part;
                const unresolved = options.source !== "english"
                    && (part.startsWith("?") || (part === "繁體" && options.variant === "hans"));
                return unresolved ? "\u25A1" : options.target + "(" + part + ")";
            }).join("");
        },
    };
    return library;
}

function engineWith(library = fakeLibrary(), { version = "1.0.2" } = {}) {
    const loads = [];
    const engine = createPronunciationLabEngine({
        loadLibrary: async (url) => {
            loads.push(url);
            return library;
        },
        resolveModuleUrl: async () => ({ url: "https://cdn.example/@" + version + "/dist/pronunciation.mjs", version }),
        yieldToHost: async () => {},
    });
    return { engine, library, loads };
}

const transliterations = (library) => library.calls.filter(([kind]) => kind === "transliterate");

test("pronunciation-lab: imports the newest release jsDelivr reports, falling back to @latest", async () => {
    const requests = [];
    const answer = (response) => async (url, options) => {
        requests.push({ url, signal: options?.signal });
        return typeof response === "function" ? response() : response;
    };

    const newest = await resolvePronunciationLabModuleUrl({ fetch: answer(Response.json({ version: "1.0.2" })) });
    assert.deepEqual(newest, {
        url: "https://cdn.jsdelivr.net/gh/ivLis-Studio/pronunciation-lab@1.0.2/dist/pronunciation.mjs",
        version: "1.0.2",
    });
    assert.equal(requests[0].url, PRONUNCIATION_LAB_LATEST_RELEASE_URL);
    assert.ok(requests[0].signal, "the lookup can be timed out");

    const fallback = { url: PRONUNCIATION_LAB_FALLBACK_MODULE_URL, version: "latest" };
    assert.match(PRONUNCIATION_LAB_FALLBACK_MODULE_URL, /pronunciation-lab@latest\/dist\/pronunciation\.mjs$/u);
    for (const response of [
        Response.json({ version: null }),
        Response.json({ version: "main" }),
        Response.json({ version: "1.0.2\"><script>" }),
        new Response("busy", { status: 503 }),
        () => { throw new TypeError("offline"); },
    ]) {
        assert.deepEqual(await resolvePronunciationLabModuleUrl({ fetch: answer(response) }), fallback);
    }
    assert.deepEqual(await resolvePronunciationLabModuleUrl({ fetch: null }), fallback);

    // A lookup that never answers gives up after the timeout.
    const hanging = (url, { signal }) => new Promise((resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    });
    assert.deepEqual(await resolvePronunciationLabModuleUrl({ fetch: hanging, timeoutMs: 10 }), fallback);
});

test("pronunciation-lab: one release per engine, and a failed load is retried", async () => {
    const library = fakeLibrary();
    let resolves = 0;
    let failNext = true;
    const loads = [];
    const engine = createPronunciationLabEngine({
        resolveModuleUrl: async () => {
            resolves++;
            return { url: "https://cdn.example/module.mjs", version: "1.0.2" };
        },
        loadLibrary: async (url) => {
            loads.push(url);
            if (failNext) {
                failNext = false;
                throw new Error("network down");
            }
            return library;
        },
        yieldToHost: async () => {},
    });
    assert.equal(engine.version(), null);
    await assert.rejects(engine.convertLines({ lines: ["猫"], sourceLang: "ja", lang: "ko" }),
        (error) => error.code === PRONUNCIATION_LAB_ERRORS.LOAD_FAILED && /network down/u.test(error.message));
    assert.deepEqual(await engine.convertLines({ lines: ["猫"], sourceLang: "ja", lang: "ko" }), ["korean(猫)"]);
    assert.deepEqual(await engine.convertLines({ lines: ["犬"], sourceLang: "ja", lang: "ko" }), ["korean(犬)"]);
    assert.equal(engine.version(), "1.0.2");
    assert.equal(resolves, 2);
    assert.deepEqual(loads, ["https://cdn.example/module.mjs", "https://cdn.example/module.mjs"]);
});

test("pronunciation-lab: keeps every line in place and leaves non-lyric lines alone", async () => {
    const { engine } = engineWith();
    const streamed = [];
    // Parenthesized backing vocals are sung, so they are converted too.
    const lines = ["君 夢", "", "  ", "♪", "[Chorus]", "…", "(愛してる)", "愛\r"];
    const result = await engine.convertLines({
        lines, sourceLang: "ja", lang: "ko", onLine: (index, text) => streamed.push([index, text]),
    });
    assert.deepEqual(result, ["korean(君) korean(夢)", "", "", "♪", "[Chorus]", "…", "korean((愛してる))", "korean(愛)"]);
    assert.deepEqual(streamed, result.map((text, index) => [index, text]));
});

test("pronunciation-lab: picks the reading language per line and per output", async () => {
    const { engine, library } = engineWith();
    // Kana and Hangul decide on their own; Latin words follow a Latin-script song.
    assert.deepEqual(await engine.convertLines({ lines: ["あい", "사랑", "amor"], sourceLang: "es", lang: "ja" }),
        ["あい", "japanese(사랑)", "japanese(amor)"]);
    const sources = transliterations(library).map(([, text, options]) => [text, options.source]);
    assert.deepEqual(sources, [["사랑", "korean"], ["amor", "spanish"]]);

    // Latin notation: a Latin-script song is already written in Latin letters;
    // Korean is romanized from its sounds (같이 → gachi), others spelled plainly.
    assert.deepEqual(await engine.convertLines({ lines: ["Despacito", "같이 가요", "夢"], sourceLang: "es", lang: "ko", notation: "latin" }),
        ["Despacito", "gachi gayo", "jamaican(夢)"]);
    assert.deepEqual(await engine.convertLines({ lines: ["君 ?Yeah"], sourceLang: "ja", lang: "ko", notation: "ipa" }),
        ["[君] [?Yeah]"]);

    assert.deepEqual(resolvePronunciationLabOutput("pt-BR", "translation"), { kind: "script", target: "portuguese" });
    assert.deepEqual(resolvePronunciationLabOutput("tr", "translation"), { kind: "latin" });
    assert.deepEqual(resolvePronunciationLabOutput("en", "translation"), { kind: "latin" });
    assert.deepEqual(resolvePronunciationLabOutput("zh-CN", "latin"), { kind: "latin" });
    assert.equal(resolvePronunciationLabOutput("zh-TW", "translation"), null);
    assert.equal(resolvePronunciationLabOutput("ru", "translation"), null);
    assert.deepEqual(resolvePronunciationLabSource("zh-hant"), { source: "mandarin", variant: "hant" });
    assert.deepEqual(resolvePronunciationLabSource("zh-hans"), { source: "mandarin", variant: "hans" });
    assert.deepEqual(resolvePronunciationLabSource("zh"), { source: "mandarin", variant: "" });
    assert.deepEqual(resolvePronunciationLabSource("en-GB"), { source: "english", variant: "UK" });
    assert.equal(resolvePronunciationLabSource("auto"), null);
});

test("pronunciation-lab: writes pronunciation in the same writing system as the AI rules", () => {
    // Library spellings that use Latin letters (a language's phonetic spelling).
    const latinSpellings = new Set([
        "spanish", "french", "german", "italian", "portuguese", "swedish", "dutch", "norwegian",
        "finnish", "icelandic", "romanian", "vietnamese", "malay", "swahili", "esperanto",
    ]);
    const languages = [
        "ko", "en", "ja", "zh-CN", "zh-TW", "hi", "es", "fr", "ar", "fa", "de", "ru", "sv", "pt", "bn",
        "cs", "it", "th", "vi", "id", "ms", "tr", "en-GB", "pt-BR", "ru-RU", "zh", "zh-hans", "uk", "el",
        "he", "ka", "km", "or", "nl", "fi", "ro", "pl", "ta", "my",
    ];
    for (const lang of languages) {
        const rule = getPronunciationScriptRule(lang);
        const output = resolvePronunciationLabOutput(lang, "translation");
        if (rule.id === "latin") {
            assert.ok(output?.kind === "latin" || latinSpellings.has(output?.target), lang + " reads Latin letters");
        } else {
            assert.ok(output === null || ["korean", "japanese", "arabic", "persian"].includes(output.target),
                lang + " reads " + rule.name + " or is unsupported");
        }
    }
});

test("pronunciation-lab: fills parts the dictionary cannot read without breaking the script", async () => {
    const { engine } = engineWith();
    // An English word in a Japanese song reads as English; other parts keep
    // their text in a target spelling and drop out of Latin notation.
    assert.deepEqual(await engine.convertLines({ lines: ["君 ?Yeah", "君 ?漢"], sourceLang: "ja", lang: "ko" }),
        ["korean(君) korean(?Yeah)", "korean(君) ?漢"]);
    assert.deepEqual(await engine.convertLines({ lines: ["君 ?Yeah", "君 ?漢"], sourceLang: "ja", lang: "ko", notation: "latin" }),
        ["jamaican(君) ?Yeah", "jamaican(君)"]);
});

test("pronunciation-lab: Latin notation keeps words already written in Latin letters", async () => {
    const { engine, library } = engineWith();
    assert.deepEqual(await engine.convertLines({
        lines: ["Hold me tight 君 夢", "(Ooh, ah) 愛", "5000 夢"], sourceLang: "ja", lang: "en", notation: "latin",
    }), ["Hold me tight jamaican(君) jamaican(夢)", "(Ooh, ah) jamaican(愛)", "jamaican(5000) jamaican(夢)"]);
    // Only the other parts reach the library, without the brackets around them.
    assert.deepEqual(transliterations(library).map(([, text]) => text), ["君 夢", "愛", "5000 夢"]);
});

test("pronunciation-lab: an unknown Chinese character table keeps the one that reads more", async () => {
    const { engine, library } = engineWith();
    assert.deepEqual(await engine.convertLines({ lines: ["繁體"], sourceLang: "auto", lang: "ko" }), ["korean(繁體)"]);
    const tables = library.calls.map(([kind, , options]) => [kind, options.variant]);
    assert.deepEqual(tables, [["transcribe", "hans"], ["transcribe", "hant"], ["transliterate", "hant"]]);
});

test("pronunciation-lab: unsupported languages fail before anything downloads", async () => {
    const { engine, loads } = engineWith();
    await assert.rejects(engine.convertLines({ lines: ["猫"], sourceLang: "ja", lang: "zh-TW" }),
        (error) => error.code === PRONUNCIATION_LAB_ERRORS.UNSUPPORTED_TARGET);
    await assert.rejects(engine.convertLines({ lines: ["Я тебя люблю"], sourceLang: "ru", lang: "ko" }),
        (error) => error.code === PRONUNCIATION_LAB_ERRORS.UNSUPPORTED_SOURCE);
    // One Cyrillic line cannot be shown in Latin or IPA notation...
    await assert.rejects(engine.convertLines({ lines: ["夢", "Я тебя люблю"], sourceLang: "ja", lang: "ko", notation: "latin" }),
        (error) => error.code === PRONUNCIATION_LAB_ERRORS.UNSUPPORTED_SOURCE && /Я тебя люблю/u.test(error.message));
    assert.deepEqual(loads, []);
    // ...while a target spelling keeps it and reads the rest of the song.
    assert.deepEqual(await engine.convertLines({ lines: ["夢", "Я тебя люблю"], sourceLang: "ja", lang: "ko" }),
        ["korean(夢)", "Я тебя люблю"]);
    assert.equal(engine.supports("ko", "translation"), true);
    assert.equal(engine.supports("th", "translation"), false);
    assert.equal(engine.supports("th", "latin"), true);
});

test("pronunciation-lab: remembers converted lines, but not readings with missing data", async () => {
    const { engine, library } = engineWith();
    await engine.convertLines({ lines: ["夢", "夢"], sourceLang: "ja", lang: "ko" });
    await engine.convertLines({ lines: ["夢"], sourceLang: "ja", lang: "ko" });
    assert.equal(transliterations(library).length, 1);

    library.unavailableSources = ["korean"];
    await assert.rejects(engine.convertLines({ lines: ["君 사랑"], sourceLang: "ja", lang: "ja" }),
        (error) => error.code === PRONUNCIATION_LAB_ERRORS.LOAD_FAILED && /korean/u.test(error.message));
    library.unavailableSources = [];
    assert.deepEqual(await engine.convertLines({ lines: ["君 사랑"], sourceLang: "ja", lang: "ja" }), ["japanese(君) japanese(사랑)"]);
});

test("pronunciation-lab: stops when the request is cancelled", async () => {
    const { engine } = engineWith();
    const controller = new AbortController();
    controller.abort(new Error("superseded"));
    await assert.rejects(engine.convertLines({ lines: ["夢"], sourceLang: "ja", lang: "ko", signal: controller.signal }), /superseded/u);
});

function addonFixture(library = fakeLibrary(), { getI18n } = {}) {
    const releaseLookups = [];
    let addon;
    initializePronunciationLab({
        host: {
            fetch: async (url) => {
                releaseLookups.push(url);
                return Response.json({ version: "1.0.2" });
            },
            __ivLyricsPronunciationLabImport: async (url) => {
                assert.equal(url, "https://cdn.jsdelivr.net/gh/ivLis-Studio/pronunciation-lab@1.0.2/dist/pronunciation.mjs");
                return library;
            },
        },
        debug() {},
        getI18n,
        registerAiAddon: (value) => { addon = value; },
    });
    return { addon, library, releaseLookups };
}

test("pronunciation-lab addon: a keyless, pronunciation-only provider", async () => {
    const { addon, library, releaseLookups } = addonFixture();
    assert.equal(addon.id, "pronunciation-lab");
    assert.equal(addon.name, "Pronunciation Lab");
    assert.equal(addon.getSettingsUI(), null);
    assert.equal(Object.keys(addon.description).length, 22);
    assert.deepEqual(addon.supports, {
        translate: false, pronunciation: true, metadata: false, tmi: false, lyricsStudy: false,
        characterPronunciation: false, culturalAnnotations: false, wordSupplements: false,
        motionDirection: false, settingsAssistant: false,
    });
    await assert.rejects(addon.translateLyrics({ text: "夢", lang: "ko", wantSmartPhonetic: false }), /Translation is not supported/u);
    assert.deepEqual(library.calls, []);
    assert.deepEqual(releaseLookups, []);

    const streamed = [];
    const result = await addon.translateLyrics({
        text: "夢\r\n\r\n♪", lang: "ko", sourceLang: "ja", wantSmartPhonetic: true, pronunciationNotation: "translation",
        onLine: (...args) => streamed.push(args),
    });
    assert.deepEqual(result, { phonetic: ["korean(夢)", "", "♪"] });
    assert.deepEqual(streamed, result.phonetic.map((line, index) => [index, line, { provider: "pronunciation-lab", final: true }]));
    assert.equal(await addon.testConnection(), true);
    assert.deepEqual(releaseLookups, [PRONUNCIATION_LAB_LATEST_RELEASE_URL]);
});

test("pronunciation-lab addon: explains unsupported languages in the app language", async () => {
    const korean = {
        "settings.aiProviders.pronunciationLab.errors.unsupportedSource": "Pronunciation Lab은 이 언어의 가사를 읽을 수 없습니다.",
    };
    const { addon } = addonFixture(fakeLibrary(), { getI18n: () => ({ t: (key) => korean[key] ?? key }) });
    const request = { text: "Я тебя люблю", lang: "ko", sourceLang: "ru", wantSmartPhonetic: true };
    await assert.rejects(addon.translateLyrics(request), (error) => error.message === korean["settings.aiProviders.pronunciationLab.errors.unsupportedSource"]
        && error.code === PRONUNCIATION_LAB_ERRORS.UNSUPPORTED_SOURCE && /language ru/u.test(error.cause.message));
    // A missing translation falls back to English.
    await assert.rejects(addon.translateLyrics({ ...request, text: "猫", sourceLang: "ja", lang: "zh-TW" }),
        { message: "Pronunciation Lab can't write pronunciation in this language." });
    // Cancellation is not reworded.
    const controller = new AbortController();
    const superseded = Object.assign(new Error("AI request superseded"), { name: "AbortError", superseded: true });
    controller.abort(superseded);
    await assert.rejects(addon.translateLyrics({ ...request, text: "猫", sourceLang: "ja", signal: controller.signal }), (error) => error === superseded);
});

test("pronunciation-lab addon: registered last among AI providers, on by default, used only for pronunciation", async () => {
    const aiAddons = inputs.startup.filter((path) => path.startsWith("src/providers/ai/Addon_AI_"));
    assert.equal(aiAddons.at(-1), "src/providers/ai/Addon_AI_PronunciationLab.js");

    const storage = new Map();
    const window = {};
    vm.runInNewContext(bundleInitializer(new URL("../src/providers/ai/AIAddonManager.js", import.meta.url)), {
        window,
        AbortController,
        Spicetify: { LocalStorage: { get: (key) => storage.get(key) ?? null, set: (key, value) => storage.set(key, value) } },
        console: { log() {}, warn() {}, error() {} },
        setTimeout, clearTimeout,
    });
    const manager = window.AIAddonManager;
    await manager._initPromise;
    const { addon } = addonFixture();
    assert.equal(manager.register(addon), true);

    const ids = (providers) => Array.from(providers, (provider) => provider.id);
    assert.equal(manager.isProviderEnabled("pronunciation-lab"), true);
    assert.deepEqual(ids(manager.getEnabledProvidersFor("pronunciation")), ["pronunciation-lab"]);
    assert.deepEqual(ids(manager.getEnabledProvidersFor("translate")), []);
    assert.deepEqual(ids(manager.getEnabledProvidersFor("characterPronunciation")), []);

    // The manager's line-count and writing-system checks accept the result.
    const latin = await manager.translateLyrics({
        trackId: "track", text: "같이 가요\n\n♪", lang: "en", sourceLang: "ko", wantSmartPhonetic: true, pronunciationNotation: "latin",
    });
    assert.deepEqual(Array.from(latin.phonetic), ["gachi gayo", "", "♪"]);

    manager.setProviderEnabled("pronunciation-lab", false);
    await assert.rejects(manager.translateLyrics({ trackId: "track", text: "夢", lang: "ko", sourceLang: "ja", wantSmartPhonetic: true }),
        /can generate pronunciation/u);
});

function bridgeFixture(engine) {
    const posted = [];
    const root = {};
    const bridge = installPronunciationLabBridge({ root, engine, post: (message) => posted.push(message) });
    return { bridge, posted, root };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

test("pronunciation-lab mobile bridge: answers each request by id", async () => {
    const { engine } = engineWith();
    const { bridge, posted, root } = bridgeFixture(engine);
    assert.equal(root.ivLyricsPronunciationLab, bridge);
    assert.deepEqual(posted.splice(0), [{ type: "ready" }]);
    assert.equal(bridge.supports("ko"), true);
    assert.equal(bridge.supports("zh-CN", "translation"), false);
    assert.equal(bridge.version(), null);

    await bridge.convert("a", JSON.stringify({ lines: ["夢", ""], sourceLang: "ja", lang: "ko" }));
    await bridge.convert("b", { lines: ["猫"], sourceLang: "ja", lang: "ko", stream: true });
    await bridge.convert("c", { lines: ["Я"], sourceLang: "ru", lang: "ko" });
    await bridge.convert("d", "{not json");
    assert.deepEqual(posted, [
        { type: "result", id: "a", lines: ["korean(夢)", ""], version: "1.0.2" },
        { type: "line", id: "b", index: 0, text: "korean(猫)" },
        { type: "result", id: "b", lines: ["korean(猫)"], version: "1.0.2" },
        { type: "error", id: "c", code: PRONUNCIATION_LAB_ERRORS.UNSUPPORTED_SOURCE, message: "[Pronunciation Lab] Cannot read lyrics in language ru" },
        { type: "error", id: "d", code: "PRONUNCIATION_LAB_BAD_REQUEST", message: "[Pronunciation Lab] A request needs a lines array" },
    ]);
});

test("pronunciation-lab mobile bridge: cancelled and replaced requests", async () => {
    const pending = [];
    const engine = {
        convertLines: ({ lines, signal }) => new Promise((resolve, reject) => {
            pending.push({ resolve: () => resolve(lines.map((line) => "read:" + line)), signal });
            signal.addEventListener("abort", () => reject(signal.reason), { once: true });
        }),
        supports: () => true,
        version: () => "1.0.2",
    };
    const { bridge, posted } = bridgeFixture(engine);
    posted.length = 0;

    const cancelled = bridge.convert("x", { lines: ["one"], lang: "ko" });
    bridge.cancel("x");
    await cancelled;
    assert.deepEqual(posted.splice(0), [{ type: "error", id: "x", code: PRONUNCIATION_LAB_ERRORS.ABORTED, message: "[Pronunciation Lab] Request cancelled" }]);

    // A newer request with the same id answers; the one it replaced stays silent.
    const first = bridge.convert("y", { lines: ["old"], lang: "ko" });
    const second = bridge.convert("y", { lines: ["new"], lang: "ko" });
    pending.at(-1).resolve();
    await Promise.all([first, second]);
    assert.deepEqual(posted.splice(0), [{ type: "result", id: "y", lines: ["read:new"], version: "1.0.2" }]);

    const failing = installPronunciationLabBridge({
        root: {},
        engine: { convertLines: async () => { throw new RangeError("odd input"); }, supports: () => true, version: () => null },
        post: (message) => posted.push(message),
    });
    posted.length = 0;
    await failing.convert(7, { lines: ["x"], lang: "ko" });
    assert.deepEqual(posted, [{ type: "error", id: "7", code: "PRONUNCIATION_LAB_FAILED", message: "odd input" }]);
});

test("pronunciation-lab mobile page: the bridge only, reporting ready to either app", async () => {
    const page = buildPage();
    assert.equal(buildPage(), page, "the page depends only on its sources");
    assert.match(page, /data-pronunciation-lab-build="[0-9a-f]{16}"/u);
    assert.match(page, /data\.jsdelivr\.com\/v1\/packages\/gh\//u);
    // The library is imported at run time, never copied into the page.
    assert.ok(Buffer.byteLength(page) < 64 * 1024);
    assert.doesNotMatch(page, /kuromoji|espeak|transliterateAll/iu);

    for (const app of ["android", "ios"]) {
        const messages = [];
        const window = app === "ios"
            ? { webkit: { messageHandlers: { ivLyricsPronunciationLab: { postMessage: (message) => messages.push(message) } } } }
            : { ivLyricsPronunciationLabNative: { postMessage: (message) => messages.push(JSON.parse(message)) } };
        const context = vm.createContext({ ...window, AbortController, setTimeout, clearTimeout, console });
        context.globalThis = context;
        vm.runInContext(bridgeScript(), context);
        // Copied out of the page's realm before comparing.
        assert.deepEqual(messages.map((message) => ({ ...message })), [{ type: "ready" }], app);
        assert.equal(context.ivLyricsPronunciationLab.supports("ja", "translation"), true);
        assert.equal(context.ivLyricsPronunciationLab.version(), null);
    }
    await settle();
});

