import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import baseline from "./fixtures/ai-providers-golden.json" with { type: "json" };

// Captured from 3d6c0026, with all HTTP and runtime imports intercepted.
const providers = [
    "ChatGPT", "Claude", "Gemini", "Groq", "OpenRouter", "Paxsenix", "Perplexity",
    "Pollinations", "NvidiaNim", "DeepL", "GoogleTranslate", "BingTranslate",
    "LocalModel", "PronunciationLab",
];

const React = {
    createElement: (type, props, ...children) => ({ type, props, children }),
    useState: initial => [typeof initial === "function" ? initial() : initial, () => {}],
    useCallback: callback => callback,
    useEffect() {},
};

function renderTree(node) {
    if (Array.isArray(node)) return node.map(renderTree);
    if (!node || typeof node !== "object") return node;
    const { type, props, children } = node;
    if (typeof type === "function") return renderTree(type({ ...props, children }));
    return {
        type,
        props: props && Object.fromEntries(Object.entries(props).map(([key, value]) =>
            [key, typeof value === "function" ? "callback" : value])),
        children: children?.map(renderTree),
    };
}

const lines = ["First line", "Second line"];
const prompt = name => ({ systemPrompt: `System for ${name}`, userPrompt: `User for ${name}` });
const input = {
    text: lines.join("\r\n"), lines, title: "Fixture song", artist: "Fixture artist",
    lang: "ko", sourceLang: "en", requestTimeoutMs: 2500,
    translationPrompt: prompt("translation"), phoneticPrompt: prompt("pronunciation"),
    metadataPrompt: prompt("metadata"), tmiPrompt: prompt("research"),
    characterPronunciationPrompt: prompt("characters"), motionDirectionPrompt: prompt("motion"),
    lyricsStudyPrompt: prompt("study"), culturalAnnotationsPrompt: prompt("culture"),
    settingsAssistantPrompt: { ...prompt("settings"), cacheSystemPrompt: true },
};
const resultJson = JSON.stringify({ lines: [], translatedTitle: "Translated title" });

function fixture(name, initialize, mode, capability) {
    let addon;
    const requests = [];
    const reads = [];
    const writes = [];
    const isLyrics = capability === "translation" || capability === "pronunciation"
        || capability === "streamedTranslation";
    const answer = isLyrics ? "First result\nSecond result" : resultJson;
    const settings = new Map([
        ...mode === "empty" ? [] : [["api-key", "fixture-key:fx"], ["api-keys", '["fixture-key", "fallback-key"]']],
        ["idle-unload-minutes", 0],
        ...capability ? [["model", "fixture-model"]] : [],
        ...mode === "expanded" ? [
            ["adv-expanded", true], ["adv-temperature-enabled", false],
            ["adv-maxTokens-value", 2300], ["custom-model", "fixture-custom-model"],
        ] : [],
    ]);
    const manager = {
        getAddonSetting(id, key, fallback) { reads.push([id, key]); return settings.get(key) ?? fallback; },
        setAddonSetting(id, key, value) { writes.push([id, key, value]); settings.set(key, value); },
        getProviderRequestAttempts: () => 1,
    };
    const record = (url, options = {}, timeout) => {
        const { signal, ...init } = options;
        requests.push({ url: String(url), ...init, signal: signal && "present", timeout });
    };
    async function request(url, options, timeout) {
        record(url, options, timeout);
        if (options?.method !== "POST") {
            return Response.json({ data: [], models: [] });
        }
        const modelResponse = { choices: [{ message: { content: answer }, finish_reason: "stop" }] };
        if (name === "Claude") {
            return Response.json({ content: [{ type: "text", text: answer }], stop_reason: "end_turn" });
        }
        if (name === "Gemini") {
            return Response.json({ candidates: [{ content: { parts: [{ text: answer }] }, finishReason: "STOP" }] });
        }
        if (name === "Perplexity" || new URL(url).pathname.endsWith("/responses")) {
            return Response.json({ status: "completed", output_text: answer,
                output: [{ type: "message", content: [{ type: "output_text", text: answer }] }] });
        }
        if (name === "DeepL") {
            return Response.json({ translations: JSON.parse(options.body).text.map(text => ({ text: `T(${text})` })) });
        }
        return Response.json(modelResponse);
    }
    class FakeWllama {
        modelManager = {
            getModels: async () => [{
                url: "https://huggingface.co/tencent/Hy-MT2-1.8B-GGUF/resolve/main/Hy-MT2-1.8B-Q8_0.gguf",
                validate: () => "valid",
            }],
        };
        async loadModel(model) { record(model.url); }
        isModelLoaded() { return true; }
        getChatTemplate() { return "{{ messages }}"; }
        async createChatCompletion({ onData }) {
            onData({ choices: [{ delta: { content: answer }, finish_reason: "stop" }] });
        }
    }
    const host = {
        localStorage: { getItem: key => ({
            "spicetify:corsProxyTemplate": "https://proxy.example.invalid/{url}",
            "ivLyrics:ai:bing-translate:proxy-client-address": "2001:db8:1:2:3:4:5:6",
        })[key] },
        __ivLyricsLocalModelImport: async url => {
            record(url);
            return { Wllama: FakeWllama };
        },
        __ivLyricsPronunciationLabImport: async url => {
            record(url);
            return { transliterate: async () => "Read", transcribe: async (text, options) => ({
                source: options.source, segments: [{ original: text, ipa: "[a]" }],
                ipa: "[a]", unresolved: [], romanization: "Read",
            }) };
        },
        async fetch(url, options) {
            record(url, options);
            if (name === "PronunciationLab") return Response.json({ version: "1.0.2" });
            if (options.method === "GET") {
                return new Response('<div data-iid="fixture"></div><script>IG:"fixture"; params_AbusePreventionHelper = [4102444800000,"fixture-token",60000]</script>');
            }
            const body = new URLSearchParams(options.body);
            const text = body.get("q") ?? body.get("text");
            return name === "BingTranslate"
                ? Response.json([{ translations: [{ text }] }])
                : Response.json([[[text]]]);
        },
    };
    initialize({
        host, getManager: () => manager, getAiRequest: () => request,
        getI18n: () => null, getConfig: () => ({}), getSpicetify: () => ({ React }),
        getTrackIdentity: () => null, debug() {},
        registerAiAddon(value) { addon = value; },
    });
    return { addon, requests, reads, writes };
}

const capabilities = {
    translation: ["translate", "translateLyrics"],
    streamedTranslation: ["translate", "translateLyrics", { onLine() {} }],
    pronunciation: ["pronunciation", "translateLyrics", { wantSmartPhonetic: true }],
    metadata: ["metadata", "translateMetadata"],
    research: ["tmi", "generateTMI", { webSearch: false }],
    researchWithSearch: ["researchWebSearch", "generateTMI"],
    characterPronunciation: ["characterPronunciation", "generateCharacterPronunciation"],
    motionDirection: ["motionDirection", "generateMotionDirection"],
    lyricsStudy: ["lyricsStudy", "generateLyricsStudy"],
    culturalAnnotations: ["culturalAnnotations", "generateCulturalAnnotations"],
    settingsAssistant: ["settingsAssistant", "generateSettingsAssistant"],
    testConnection: [null, "testConnection"],
};

function digest(data) {
    // Snapshots cover raw URLs and serialized bodies without storing endpoint
    // addresses that providers intentionally keep obfuscated.
    return createHash("sha256").update(JSON.stringify(data)).digest("hex");
}

for (const name of providers) {
    test(`${name} settings and requests match the pre-refactor provider`, async () => {
        const { default: initialize } = await import(`../src/providers/ai/Addon_AI_${name}.js`);
        const actual = {};
        for (const mode of ["empty", "default", "expanded"]) {
            const { addon, reads, writes } = fixture(name, initialize, mode);
            const Settings = addon.getSettingsUI?.();
            actual[mode] = digest({
                id: addon.id, supports: addon.supports, tree: Settings ? renderTree(React.createElement(Settings)) : null,
                reads, writes,
            });
        }
        for (const [capability, [support, method, extra]] of Object.entries(capabilities)) {
            const { addon, requests } = fixture(name, initialize, "default", capability);
            if (support && !addon.supports[support] || typeof addon[method] !== "function") continue;
            const signal = new AbortController().signal;
            let result;
            try {
                result = await addon[method]({ ...input, signal, ...extra });
            } catch (error) {
                throw new Error(`${name} ${capability}: ${error.message}`, { cause: error });
            }
            actual[capability] = { count: requests.length, digest: digest({ requests, result }) };
        }
        assert.deepEqual(actual, baseline[name]);
    });
}
