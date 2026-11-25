import { readAiProviderFixture } from "./fixtures/ai-provider.mjs";
import assert from 'node:assert/strict';
import vm from 'node:vm';
import test from 'node:test';

function setup(responder) {
    const addons = {}, requests = [];
    const settings = {
        chatgpt: { 'api-keys': 'openai-secret', model: 'gpt-test' },
        'nvidia-nim': { 'api-keys': 'nim-secret', model: 'vendor/custom-model' }
    };
    const window = {
        AIAddonManager: {
            register(addon) { addons[addon.id] = addon; },
            getAddonSetting(id, key, fallback) { return settings[id]?.[key] ?? fallback; },
            getProviderRequestAttempts: () => 1
        },
        async ivLyricsFetch(url, options) {
            const request = { url, ...options, body: options.body && JSON.parse(options.body) };
            requests.push(request);
            return responder(request);
        }
    };
    const context = vm.createContext({ window, console, setTimeout, clearTimeout, TextDecoder });
    for (const file of ['Addon_AI_ChatGPT.js', 'Addon_AI_NvidiaNim.js']) {
        const source = readAiProviderFixture(file).replace('    return ChatGPTAddon;', '    ChatGPTAddon.fetchModelsForTest = getModels; return ChatGPTAddon;');
        vm.runInContext(source, context);
    }
    return { addons, requests };
}
const reply = text => new Response(JSON.stringify({ choices: [{ message: { content: text }, finish_reason: 'stop' }] }));

test('NIM registers independently and uses its own endpoint, model, key and token parameter', async () => {
    const h = setup(() => reply('OK'));
    await h.addons['nvidia-nim'].testConnection();
    await h.addons.chatgpt.testConnection();
    assert.equal(h.requests[0].url, 'https://integrate.api.nvidia.com/v1/chat/completions');
    assert.equal(h.requests[0].headers.Authorization, 'Bearer nim-secret');
    assert.equal(h.requests[0].body.model, 'vendor/custom-model');
    assert.equal(h.requests[0].body.max_tokens, 16000);
    assert.equal(h.requests[0].body.max_completion_tokens, undefined);
    assert.equal(h.requests[1].headers.Authorization, 'Bearer openai-secret');
    assert.equal(h.requests[1].body.max_completion_tokens, 16000);
    assert.equal(h.addons['nvidia-nim'].supports.researchWebSearch, false);
});

test('NIM translation preserves line count and rejects incomplete model responses', async () => {
    const h = setup(() => reply('첫 줄\n둘째 줄'));
    const output = await h.addons['nvidia-nim'].translateLyrics({ text: 'one\ntwo', translationPrompt: 'translate' });
    assert.deepEqual(Array.from(output.translation), ['첫 줄', '둘째 줄']);
    const bad = setup(() => reply('only one'));
    await assert.rejects(bad.addons['nvidia-nim'].translateLyrics({ text: 'one\ntwo', translationPrompt: 'translate' }), /line count/);
});


test('NIM model discovery preserves vendor model IDs and uses NIM credentials', async () => {
    const h = setup(() => Response.json({ data: [{ id: 'z-ai/glm-5.2' }, { id: 'meta/llama-3.3-70b-instruct' }] }));
    const models = await h.addons['nvidia-nim'].fetchModelsForTest();
    assert.deepEqual(Array.from(models, model => model.id), ['meta/llama-3.3-70b-instruct', 'z-ai/glm-5.2']);
    assert.equal(h.requests[0].url, 'https://integrate.api.nvidia.com/v1/models');
    assert.equal(h.requests[0].headers.Authorization, 'Bearer nim-secret');
});
