import assert from "node:assert/strict";
import test from "node:test";
import { createAIAddonManager } from "#ivlyrics/providers/ai/createAIAddonManager.mjs";
import { requestSettingsAssistant } from "#ivlyrics/providers/ai/settingsAssistantRequests.mjs";

const PROMPT = Object.freeze({ systemPrompt: "You edit ivLyrics settings.", userPrompt: "Make the lyrics bigger." });

function createManager() {
    const storage = new Map();
    return createAIAddonManager({
        getStoredValue: key => storage.get(key),
        setStoredValue: (key, value) => storage.set(key, value),
        getI18n: () => null, getAddonDebug: () => null, debug() {},
    });
}

function assistantAddon(id, generateSettingsAssistant, supports) {
    return {
        id, name: id, author: "fixture", description: "fixture", version: "1",
        ...(supports ? { supports } : {}),
        getSettingsUI() {},
        ...(generateSettingsAssistant ? { generateSettingsAssistant } : {}),
    };
}

function enable(manager, ...addons) {
    for (const addon of addons) {
        assert.equal(manager.register(addon), true);
        manager.setProviderEnabled(addon.id, true);
    }
    manager.setProviderOrder(addons.map(addon => addon.id));
}

test("register() derives supports.settingsAssistant from generateSettingsAssistant", () => {
    const manager = createManager();
    const withoutSupports = assistantAddon("no-supports", () => ({}));
    const legacySupports = assistantAddon("legacy", () => ({}), { translate: false });
    const translatorOnly = { ...assistantAddon("translator", null, { translate: true }), translateLyrics() {} };
    const optedOut = assistantAddon("opted-out", () => ({}), { settingsAssistant: false });
    for (const addon of [withoutSupports, legacySupports, translatorOnly, optedOut]) {
        assert.equal(manager.register(addon), true);
    }
    assert.equal(withoutSupports.supports.settingsAssistant, true);
    assert.equal(legacySupports.supports.settingsAssistant, true);
    assert.equal(translatorOnly.supports.settingsAssistant, false);
    assert.equal(optedOut.supports.settingsAssistant, false);
    assert.deepEqual(manager.validate(assistantAddon("only-assistant", () => ({}))), { valid: true, errors: [] });
    assert.equal(manager.supportsCapability("no-supports", "settingsAssistant"), true);
});

test("getEnabledProvidersFor('settingsAssistant') honours the per-provider capability toggle", () => {
    const manager = createManager();
    enable(manager, assistantAddon("first", () => ({})), assistantAddon("second", () => ({})));
    assert.deepEqual(manager.getEnabledProvidersFor("settingsAssistant").map(addon => addon.id), ["first", "second"]);
    manager.setCapabilityEnabled("first", "settingsAssistant", false);
    assert.deepEqual(manager.getEnabledProvidersFor("settingsAssistant").map(addon => addon.id), ["second"]);
    assert.equal(manager.isCapabilityEnabled("first", "motionDirection"), true);
});

test("requestSettingsAssistant passes the prompt to the add-on and parses a JSON string reply", async () => {
    const manager = createManager();
    const received = [];
    enable(manager, assistantAddon("json-text", params => {
        received.push(params);
        return '```json\n{"reply":"Done","changes":[{"key":"font-size","value":40}]}\n```';
    }));
    const events = [];
    manager.on("ai:request:start", event => events.push(["start", event]));
    manager.on("ai:request:success", event => events.push(["success", event]));
    const result = await manager.generateSettingsAssistant({ prompt: PROMPT });
    assert.deepEqual(result, { reply: "Done", changes: [{ key: "font-size", value: 40 }] });
    assert.equal(received.length, 1);
    assert.deepEqual(received[0].settingsAssistantPrompt, PROMPT);
    assert.ok(received[0].signal instanceof AbortSignal);
    assert.deepEqual(events, [
        ["start", { type: "settingsAssistant", providers: ["json-text"], params: { promptLength: PROMPT.systemPrompt.length + PROMPT.userPrompt.length } }],
        ["success", { type: "settingsAssistant", provider: "json-text" }],
    ]);
    assert.doesNotMatch(JSON.stringify(events), /bigger/);
});

test("requestSettingsAssistant falls back to the next provider when a reply is not a JSON object", async context => {
    context.mock.method(console, "warn", () => {});
    const manager = createManager();
    const calls = [];
    enable(manager,
        assistantAddon("array", () => { calls.push("array"); return [{ reply: "no" }]; }),
        assistantAddon("prose", () => { calls.push("prose"); return "Sure! I changed it."; }),
        assistantAddon("object", () => { calls.push("object"); return { reply: "ok" }; }),
    );
    const result = await requestSettingsAssistant(manager, { prompt: PROMPT }, { debug() {} });
    assert.deepEqual(result, { reply: "ok" });
    assert.deepEqual(calls, ["array", "prose", "object"]);
});

test("requestSettingsAssistant reports missing prompts and missing providers", async () => {
    const manager = createManager();
    await assert.rejects(manager.generateSettingsAssistant({}), /No settings assistant prompt/);
    await assert.rejects(manager.generateSettingsAssistant({ prompt: { systemPrompt: "x" } }), /missing userPrompt/);
    await assert.rejects(
        manager.generateSettingsAssistant({ prompt: PROMPT }),
        { message: "No AI providers enabled. Please enable at least one provider in settings." },
    );
    enable(manager, assistantAddon("disabled", () => ({})));
    manager.setCapabilityEnabled("disabled", "settingsAssistant", false);
    await assert.rejects(manager.generateSettingsAssistant({ prompt: PROMPT }), /No AI providers enabled/);
});
