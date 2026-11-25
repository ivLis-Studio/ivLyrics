import assert from "node:assert/strict";
import test from "node:test";
import initializeClaudeAddon from "../src/providers/ai/Addon_AI_Claude.js";
import { openEventResponse } from "./fixtures/ai-provider.mjs";

const lyrics = { text: "First line\nSecond line", translationPrompt: "Translate." };
const frame = (type, data) => `event: ${type}\r\ndata: ${JSON.stringify({ type, ...data })}\r\n\r\n`;
const delta = (text) => frame("content_block_delta", { delta: { type: "text_delta", text } });
const stop = (reason) => frame("message_delta", { delta: { stop_reason: reason } });

function loadAddon(getResponse, apiKeys = ["first-key"]) {
    const requests = [];
    let addon;
    const manager = {
        getAddonSetting: (_id, key, fallback) => ({
            "api-keys": apiKeys, model: "fixture-model",
        })[key] ?? fallback,
        getProviderRequestAttempts: () => 1,
    };
    initializeClaudeAddon({
        getManager: () => manager,
        getAiRequest: () => (url, options) => {
            const request = { url, ...options, body: JSON.parse(options.body) };
            requests.push(request);
            return getResponse(request);
        },
        registerAiAddon: (value) => { addon = value; },
        debug() {},
    });
    return { addon, requests };
}

function stream(...chunks) {
    const encoder = new TextEncoder();
    return new Response(new ReadableStream({
        start(controller) {
            for (const chunk of chunks) controller.enqueue(typeof chunk === "string" ? encoder.encode(chunk) : chunk);
            controller.close();
        },
    }));
}

test("Claude rotates rate-limited keys and streams complete UTF-8 messages", async () => {
    const first = new TextEncoder().encode(delta("一行目\n"));
    const split = first.findIndex(byte => byte > 127) + 1;
    const { addon, requests } = loadAddon(({ headers }) => headers["x-api-key"] === "first-key"
        ? new Response(null, { status: 429 })
        : stream(first.slice(0, split), first.slice(split), delta("二行目"), stop("end_turn")),
    ["first-key", "second-key"]);

    const lines = [];
    assert.deepEqual(await addon.translateLyrics({ ...lyrics, onLine: (...line) => lines.push(line) }),
        { translation: ["一行目", "二行目"] });
    assert.deepEqual(lines, [[0, "一行目"], [1, "二行目"]]);
    assert.deepEqual(requests.map(request => request.headers["x-api-key"]), ["first-key", "second-key"]);
    assert.ok(requests.every(request => request.url === "https://api.anthropic.com/v1/messages"
        && request.body.model === "fixture-model" && request.body.stream === true));
});

test("Claude retracts provisional lines when the terminal message rejects the response", async () => {
    const { addon } = loadAddon(() => stream(delta("一行目\n"), delta("二行目"), stop("max_tokens")));
    const lines = [];
    await assert.rejects(addon.translateLyrics({ ...lyrics, onLine: (...line) => lines.push(line) }),
        { reason: "max_tokens" });
    assert.deepEqual(lines, [[0, "一行目"], [0, ""]]);
});

test("Claude validates buffered proxy responses before emitting any lines", async () => {
    let stopReason = "end_turn";
    const { addon } = loadAddon(() => Response.json({
        stop_reason: stopReason,
        content: [{ type: "thinking", text: "hidden" }, { type: "text", text: "Uno\nDos" }],
    }));
    const lines = [];
    const input = { ...lyrics, onLine: (...line) => lines.push(line) };
    assert.deepEqual(await addon.translateLyrics(input), { translation: ["Uno", "Dos"] });
    assert.deepEqual(lines, [[0, "Uno"], [1, "Dos"]]);

    stopReason = "max_tokens";
    lines.length = 0;
    await assert.rejects(addon.translateLyrics(input), { reason: "max_tokens" });
    assert.deepEqual(lines, []);
});

test("Claude completes at message_stop without waiting for the body to close", { timeout: 1500 }, async () => {
    const { response, cancelled } = openEventResponse(delta("Uno\nDos") + stop("end_turn") + frame("message_stop"));
    const { addon } = loadAddon(() => response);
    const lines = [];
    assert.deepEqual(await addon.translateLyrics({ ...lyrics, onLine: (...line) => lines.push(line) }),
        { translation: ["Uno", "Dos"] });
    assert.deepEqual(lines, [[0, "Uno"], [1, "Dos"]]);
    await cancelled;
    assert.equal(response.body.locked, false);
});
