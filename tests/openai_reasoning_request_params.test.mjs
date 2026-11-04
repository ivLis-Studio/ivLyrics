import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../Addon_AI_ChatGPT.js', import.meta.url), 'utf8');
// The settings screen saves this default patch the first time it opens, so
// most installs send it as an explicit setting.
const SAVED_DEFAULT_PATCH = JSON.stringify({ max_completion_tokens: 16000, temperature: 0.3 }, null, 2);

const json = (value, status = 200) => new Response(JSON.stringify(value), {
    status, headers: { 'content-type': 'application/json' }
});
const completion = text => json({ choices: [{ message: { content: text }, finish_reason: 'stop' }] });
const webSearchResult = text => json({ status: 'completed', output: [{ content: [{ type: 'output_text', text }] }] });
const sse = events => new Response(events.map(event => `data: ${typeof event === 'string' ? event : JSON.stringify(event)}\n\n`).join(''), {
    headers: { 'content-type': 'text/event-stream' }
});
const rejected = (param, message, code = 'unsupported_parameter') => json({
    error: { message, type: 'invalid_request_error', param, code }
}, 400);
const TEMPERATURE_REJECTED = "Unsupported value: 'temperature' does not support 0.3 with this model. Only the default (1) value is supported.";
const MAX_TOKENS_REJECTED = "Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.";

// Mirrors the OpenAI API: reasoning models reject sampling parameters.
function reasoningServer(request) {
    if ('temperature' in request.body) return rejected('temperature', TEMPERATURE_REJECTED, 'unsupported_value');
    if ('top_p' in request.body) return rejected('top_p', "Unsupported parameter: 'top_p' is not supported with this model.");
    if (request.url.endsWith('/responses')) return webSearchResult('OK');
    if (request.body.stream) {
        return sse([{ choices: [{ delta: { content: 'OK' } }] }, { choices: [{ delta: {}, finish_reason: 'stop' }] }, '[DONE]']);
    }
    return completion('OK');
}

function harness({ settings: values = {}, respond = reasoningServer } = {}) {
    const settings = new Map(Object.entries({
        'api-keys': 'primary-key', 'base-url': 'https://api.openai.com/v1', model: 'gpt-6.1-sol',
        'primary-capabilities': {}, 'fallback-providers': [], 'extra-endpoints': [],
        'adv-requestBodyMergeJson': SAVED_DEFAULT_PATCH, ...values
    }));
    const requests = [];
    let addon;
    const window = {
        AIAddonManager: {
            register(value) { addon = value; },
            getAddonSetting: (_id, key, fallback) => settings.get(key) ?? fallback,
            setAddonSetting(_id, key, value) { settings.set(key, value); },
            getProviderRequestAttempts: () => 1
        },
        async ivLyricsFetch(url, options) {
            const request = { url, body: JSON.parse(options.body) };
            requests.push(request);
            return respond(request, requests.length);
        }
    };
    vm.runInNewContext(source.replace('    registerAddon();',
        '    window.hooks = { callChatGPTAPIRaw, callChatGPTAPIStream, callResponsesAPIStream, isOpenAIReasoningModel };\n    registerAddon();'),
    { window, Spicetify: { React: {} }, URL, URLSearchParams, TextDecoder, setTimeout, clearTimeout, console });
    return { addon, hooks: window.hooks, settings, requests };
}

test('reasoning model detection covers o-series and GPT-5+ but not chat or older models', () => {
    const { hooks } = harness();
    for (const model of ['gpt-6.1-sol', 'gpt-5.5', 'gpt-5', 'gpt-5-mini', 'GPT-5.2', 'gpt-10', 'o1', 'o3-mini', 'o4-mini', 'openai/gpt-5.5']) {
        assert.equal(hooks.isOpenAIReasoningModel(model), true, model);
    }
    for (const model of ['gpt-5-chat-latest', 'gpt-4.1', 'gpt-4o-mini', 'chatgpt-4o-latest', 'gpt-oss-120b', 'openai/gpt-oss-20b', 'gpt-35-turbo', 'azure/gpt-35-turbo-16k', 'omni-moderation-latest', 'my-deployment', '', null]) {
        assert.equal(hooks.isOpenAIReasoningModel(model), false, String(model));
    }
});

test('reasoning models send no temperature on chat, stream, web search and connection test requests', async () => {
    const h = harness({ settings: { 'adv-requestBodyMergeJson': JSON.stringify({ max_completion_tokens: 16000, temperature: 0.3, top_p: 0.9 }) } });

    assert.equal(await h.hooks.callChatGPTAPIRaw('hello', 1), 'OK');
    const lines = [];
    assert.equal(await h.hooks.callChatGPTAPIStream('hello', (index, line) => lines.push([index, line]), null, 1), 'OK');
    assert.equal(await h.hooks.callResponsesAPIStream('hello', null, null, 1), 'OK');
    await h.addon.testConnection();

    assert.equal(h.requests.length, 4, 'no request needed a retry');
    for (const { body } of h.requests) {
        assert.equal('temperature' in body, false);
        assert.equal('top_p' in body, false);
        assert.equal(body.model, 'gpt-6.1-sol');
    }
    assert.equal(h.requests[0].body.max_completion_tokens, 16000);
    assert.equal(h.requests[1].body.stream, true);
    assert.equal(h.requests[2].body.max_output_tokens, 16000);
    assert.equal('max_completion_tokens' in h.requests[2].body, false);
    assert.equal(h.requests[3].body.max_completion_tokens, 16000);
    assert.deepEqual(lines, [[0, 'OK']]);
});

test('older and chat-tuned models keep the saved temperature', async () => {
    for (const model of ['gpt-4.1', 'gpt-5-chat-latest']) {
        const h = harness({ settings: { model }, respond: () => completion('OK') });
        assert.equal(await h.hooks.callChatGPTAPIRaw('hello', 1), 'OK');
        assert.equal(h.requests[0].body.temperature, 0.3, model);
        assert.equal(h.requests[0].body.max_completion_tokens, 16000, model);
    }
});

test('an unsupported temperature on an unrecognized model is dropped once and remembered per endpoint and model', async () => {
    const h = harness({ settings: { 'base-url': 'https://azure.test/openai/v1', model: 'my-deployment' } });

    assert.equal(await h.hooks.callChatGPTAPIRaw('hello', 1), 'OK');
    assert.deepEqual(h.requests.map(request => 'temperature' in request.body), [true, false]);

    assert.equal(await h.hooks.callChatGPTAPIRaw('again', 1), 'OK');
    await h.addon.testConnection();
    assert.deepEqual(h.requests.map(request => 'temperature' in request.body), [true, false, false, false]);

    h.settings.set('model', 'other-deployment');
    assert.equal(await h.hooks.callChatGPTAPIRaw('hello', 1), 'OK');
    assert.deepEqual(h.requests.slice(4).map(request => 'temperature' in request.body), [true, false]);
});

test('a rejected max_tokens is re-sent as max_completion_tokens', async () => {
    const h = harness({
        settings: { 'base-url': 'https://azure.test/openai/v1', model: 'my-deployment', 'adv-requestBodyMergeJson': '{"max_tokens": 12000}' },
        respond: request => 'max_tokens' in request.body ? rejected('max_tokens', MAX_TOKENS_REJECTED) : completion('OK')
    });

    assert.equal(await h.hooks.callChatGPTAPIRaw('hello', 1), 'OK');
    assert.equal(h.requests.length, 2);
    assert.equal(h.requests[0].body.max_tokens, 12000);
    assert.equal('max_tokens' in h.requests[1].body, false);
    assert.equal(h.requests[1].body.max_completion_tokens, 12000);
});

test('other HTTP 400 responses are not re-sent and keep the provider message', async () => {
    const invalidValue = "Invalid 'temperature': decimal above maximum value. Expected a value <= 2, but got 3 instead.";
    const h = harness({
        settings: { model: 'gpt-4.1', 'adv-requestBodyMergeJson': '{"temperature": 3}' },
        respond: () => rejected('temperature', invalidValue, 'decimal_above_max_value')
    });
    await assert.rejects(h.hooks.callChatGPTAPIRaw('hello', 1), error => error.message.includes(invalidValue));
    assert.equal(h.requests.length, 1);

    const plainText = harness({ settings: { model: 'gpt-4.1' }, respond: () => new Response('bad request', { status: 400 }) });
    await assert.rejects(plainText.hooks.callChatGPTAPIRaw('hello', 1), /bad request/);
    assert.equal(plainText.requests.length, 1);
});

test('a re-sent streaming request emits each line once without a stream reset', async () => {
    const h = harness({
        settings: { 'base-url': 'https://azure.test/openai/v1', model: 'my-deployment' },
        respond: request => 'temperature' in request.body
            ? rejected('temperature', TEMPERATURE_REJECTED, 'unsupported_value')
            : sse([{ choices: [{ delta: { content: 'first\nsecond' } }] }, { choices: [{ delta: {}, finish_reason: 'stop' }] }, '[DONE]'])
    });
    const lines = [];
    const chunks = [];
    let resets = 0;
    const result = await h.hooks.callChatGPTAPIStream(
        'hello',
        (index, line) => lines.push([index, line]),
        () => { resets += 1; },
        1, null, undefined,
        chunk => chunks.push(chunk)
    );
    assert.equal(result, 'first\nsecond');
    assert.deepEqual(lines, [[0, 'first'], [1, 'second']]);
    assert.deepEqual(chunks, ['first\nsecond']);
    assert.equal(resets, 0);
    assert.equal(h.requests.length, 2);
});
