import assert from "node:assert/strict";
import test from "node:test";
import initializeGroqAddon from "../src/providers/ai/Addon_AI_Groq.js";
import initializeOpenRouterAddon from "../src/providers/ai/Addon_AI_OpenRouter.js";
import initializePaxsenixAddon from "../src/providers/ai/Addon_AI_Paxsenix.js";
import initializePollinationsAddon from "../src/providers/ai/Addon_AI_Pollinations.js";
import { openEventResponse } from "./fixtures/ai-provider.mjs";

const providers = [
    [initializeGroqAddon, "Groq", "https://api.groq.com/openai/v1/chat/completions", {}],
    [initializeOpenRouterAddon, "OpenRouter", "https://openrouter.ai/api/v1/chat/completions",
        { "HTTP-Referer": "https://github.com/ivLis-STUDIO/ivLyrics", "X-Title": "ivLyrics" }],
    [initializePaxsenixAddon, "Paxsenix", "https://api.paxsenix.org/v1/chat/completions", {}, true],
    [initializePollinationsAddon, "Pollinations", "https://gen.pollinations.ai/v1/chat/completions", {}, true],
];
const lyrics = { text: "First line\nSecond line", translationPrompt: "Translate these lyrics." };
const event = choice => "data: " + JSON.stringify({ choices: [choice] }) + "\r\n\r\n";

function loadAddon(initialize, getResponse, apiKeys = ["first-key", "second-key"]) {
    let addon;
    const requests = [];
    const settings = new Map([["api-keys", apiKeys], ["model", "fixture-model"]]);
    const manager = {
        getAddonSetting: (_id, key, fallback) => settings.get(key) ?? fallback,
        getProviderRequestAttempts: () => 1,
    };
    initialize({
        getManager: () => manager,
        getAiRequest: () => (url, options, timeout) => {
            const request = { url, ...options, body: JSON.parse(options.body), timeout };
            requests.push(request);
            return getResponse(request);
        },
        registerAiAddon: (value) => { addon = value; },
        debug() {},
    });
    return { addon, requests };
}

for (const [initialize, name, endpoint, providerHeaders, textOnly] of providers) {
    test(`${name} forwards cancellation without rotating to the next key`, async () => {
        const controller = new AbortController();
        const { addon, requests } = loadAddon(initialize, ({ signal }) => {
            assert.strictEqual(signal, controller.signal);
            return new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
        });
        const result = addon.translateLyrics({ ...lyrics, signal: controller.signal });
        const cancelled = new DOMException('Request cancelled', 'AbortError');
        controller.abort(cancelled);
        await assert.rejects(result, error => error === cancelled);
        assert.equal(requests.length, 1);
    });

    test(`${name} sends its provider headers and rotates keys on rate limits`, async () => {
        const { addon, requests } = loadAddon(initialize, ({ headers }) => {
            if (headers.Authorization === "Bearer first-key") return new Response("", { status: 429 });
            return Response.json({ choices: [{
                message: { content: textOnly ? "Uno\nDos" : ["Uno\n", { text: "Dos" }] }, finish_reason: "stop",
            }] });
        });
        assert.deepEqual(await addon.translateLyrics(lyrics), { translation: ["Uno", "Dos"] });
        assert.deepEqual(requests.map(request => request.headers.Authorization), ["Bearer first-key", "Bearer second-key"]);
        for (const request of requests) {
            assert.equal(request.url, endpoint);
            assert.equal(request.body.model, "fixture-model");
            assert.equal(request.body.messages.at(-1).content, lyrics.translationPrompt);
            assert.equal(request.body.stream, undefined);
            for (const [key, value] of Object.entries(providerHeaders)) assert.equal(request.headers[key], value);
        }
    });

    test(`${name} streams UTF-8 lines across response chunks and clears rejected output`, async () => {
        let finishReason = "stop";
        const { addon, requests } = loadAddon(initialize, () => {
            const encoder = new TextEncoder();
            const first = encoder.encode(event({ delta: { content: "一行目\n" } }));
            const second = encoder.encode(event({ delta: { content: textOnly ? "二行目" : [{ text: "二行目" }] } })
                + event({ finish_reason: finishReason }));
            return new Response(new ReadableStream({
                start(controller) {
                    const split = first.findIndex(byte => byte > 127) + 1;
                    controller.enqueue(first.slice(0, split));
                    controller.enqueue(first.slice(split));
                    controller.enqueue(second);
                    controller.close();
                },
            }));
        });
        const lines = [];
        const resets = [];
        const input = { ...lyrics, onLine: (...line) => lines.push(line), onStreamReset: (reset) => resets.push(reset) };
        assert.deepEqual(await addon.translateLyrics(input), { translation: ["一行目", "二行目"] });
        assert.deepEqual(lines, [[0, "一行目"], [1, "二行目"]]);
        assert.equal(requests[0].body.stream, true);
        assert.equal(requests[0].timeout, 90_000);
        assert.deepEqual(resets, []);

        finishReason = "length";
        lines.length = 0;
        await assert.rejects(addon.translateLyrics(input), { reason: "length" });
        assert.deepEqual(lines, [[0, "一行目"], [0, "一行目"]]);
        assert.deepEqual(resets.map(reset => reset.reason), ["failed", "failed"]);
    });
}

test("Paxsenix stops on DONE and retains the status and message of the final rejected key", async () => {
    const content = event({ delta: { content: "Uno\nDos" }, finish_reason: "stop" });
    const { addon } = loadAddon(initializePaxsenixAddon, () => new Response(content + "data: [DONE]\n\ndata: invalid\n"));
    assert.deepEqual(await addon.translateLyrics({ ...lyrics, onLine() {} }), { translation: ["Uno", "Dos"] });

    const blocked = loadAddon(initializePaxsenixAddon, () => Response.json({ message: "Quota exhausted" }, { status: 429 }));
    await assert.rejects(blocked.addon.translateLyrics(lyrics), { status: 429, message: "[Paxsenix] Quota exhausted" });
    assert.equal(blocked.requests.length, 2);

    const unauthorized = loadAddon(initializePaxsenixAddon, () => Response.json({ message: "Token rejected" }, { status: 401 }));
    await assert.rejects(unauthorized.addon.translateLyrics(lyrics), { status: 401, message: "[Paxsenix] Token rejected" });
    assert.equal(unauthorized.requests.length, 1);
});

for (const [initialize, name] of providers) {
    test(`${name} accepts DONE even when the server keeps the body open`, { timeout: 1500 }, async () => {
        const events = event({ delta: { content: "Uno\nDos" }, finish_reason: "stop" }) + "data: [DONE]\n\n";
        const { response, cancelled } = openEventResponse(events);
        const { addon } = loadAddon(initialize, () => response);
        const lines = [];
        assert.deepEqual(await addon.translateLyrics({ ...lyrics, onLine: (...line) => lines.push(line) }),
            { translation: ["Uno", "Dos"] });
        assert.deepEqual(lines, [[0, "Uno"], [1, "Dos"]]);
        await cancelled;
        assert.equal(response.body.locked, false);
    });
}

test("compatible streaming clients read the buffered JSON returned by the proxy", async () => {
    const { addon, requests } = loadAddon(initializeGroqAddon, () => Response.json({
        choices: [{ message: { content: "Uno\nDos" }, finish_reason: "stop" }],
    }));
    const lines = [];
    assert.deepEqual(await addon.translateLyrics({ ...lyrics, onLine: (...line) => lines.push(line) }),
        { translation: ["Uno", "Dos"] });
    assert.deepEqual(lines, [[0, "Uno"], [1, "Dos"]]);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].body.stream, true);
});

test("Pollinations requires login and discards an incomplete final line before the stream reset", async () => {
    const disconnected = loadAddon(initializePollinationsAddon, () => assert.fail("Unexpected network request"), []);
    await assert.rejects(disconnected.addon.translateLyrics(lyrics), /Connect your Pollinations account in settings first/);
    const content = event({ delta: { content: "Uno\nIncomplete" } });
    const { addon } = loadAddon(initializePollinationsAddon, () => new Response(content + "data: [DONE]"), ["first-key"]);
    const lines = [];
    const resets = [];
    await assert.rejects(addon.translateLyrics({
        ...lyrics, onLine: (...line) => lines.push(line), onStreamReset: (reset) => resets.push(reset.reason),
    }), { reason: "missing_finish_reason" });
    assert.deepEqual(lines, [[0, "Uno"]]);
    assert.deepEqual(resets, ["failed"]);
});
