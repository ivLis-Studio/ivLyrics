import { openEventResponse, readAiProviderFixture } from "./fixtures/ai-provider.mjs";
import { isCloudSyncSettingKey } from "#ivlyrics/core/settingsBackupPolicy.mjs";
import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';

const source = readAiProviderFixture("Addon_AI_ChatGPT.js");
const backup = (id, enabled = true) => ({ id, name: id, baseUrl: `https://${id}.test/v1`, apiKeys: `${id}-key`, model: `${id}-model`, enabled });
const json = (status, value) => new Response(JSON.stringify(value), { status });
const success = text => json(200, { choices: [{ message: { content: text }, finish_reason: 'stop' }] });

test('connection credentials stay outside cloud settings', () => {
    assert.equal(isCloudSyncSettingKey('ivLyrics:ai:addon:chatgpt:fallback-providers'), false);
    assert.equal(isCloudSyncSettingKey('ivLyrics:ai:addon:chatgpt:api-keys'), false);
    assert.equal(isCloudSyncSettingKey('ivLyrics:ai:addon:chatgpt:model'), true);
    // Regression: serialized extra-endpoint arrays carry per-endpoint apiKey
    // values, so the container key itself must be excluded (all factory IDs).
    const fabricated = JSON.stringify([{ id: 'ep-1', label: 'Endpoint 2', baseUrl: 'https://extra.test/v1', apiKey: 'sk-extra-secret', model: 'extra-model' }]);
    assert.ok(fabricated.includes('sk-extra-secret'));
    assert.equal(isCloudSyncSettingKey('ivLyrics:ai:addon:chatgpt:extra-endpoints'), false);
    assert.equal(isCloudSyncSettingKey('ivLyrics:ai:addon:nvidia-nim:extra-endpoints'), false);
});

function harness(connections, responder, extra = {}) {
    let addon;
    const requests = [];
    const settings = new Map(Object.entries({ 'api-keys': 'primary-key', 'base-url': 'https://primary.test/v1', model: 'primary-model', 'fallback-providers': connections, ...extra }));
    const window = {
        AIAddonManager: {
            register(value) { addon = value; },
            getAddonSetting: (_id, key, fallback) => settings.get(key) ?? fallback,
            setAddonSetting: (_id, key, value) => settings.set(key, value),
            getProviderRequestAttempts: () => 1,
        },
        async ivLyricsFetch(url, options) {
            const request = { url, headers: options.headers, body: JSON.parse(options.body) };
            requests.push(request);
            return responder(request, requests.length);
        },
    };
    vm.runInNewContext(source.replace('    registerAddon();',
        '    window.hooks = { getProviderConnections: connections.getProviderConnections, callChatGPTAPIRaw, callChatGPTAPIStream, callResponsesAPIStream };\n    registerAddon();'),
    { window, URL, URLSearchParams, TextDecoder, setTimeout, clearTimeout, console });
    return { addon, requests, settings, hooks: window.hooks };
}

test('primary connection accepts the advertised key formats', () => {
    for (const keys of ['first\nsecond', ' ["first", "second"] ', ['first', 'second']]) {
        const h = harness([], () => success('OK'), { 'api-keys': keys });
        assert.deepEqual(Array.from(h.hooks.getProviderConnections()[0].apiKeys), ['first', 'second']);
    }
});

test('legacy primary remains first; disabled connections are skipped and success stops the chain', async () => {
    const h = harness([backup('disabled', false), backup('second'), backup('third')], request =>
        request.url.includes('primary') ? json(401, { error: { message: 'Invalid API key' } }) : success('OK'));
    await h.addon.testConnection();
    assert.deepEqual(h.requests.map(r => r.url), ['https://primary.test/v1/chat/completions', 'https://second.test/v1/chat/completions']);
    assert.deepEqual(h.requests.map(r => [r.headers.Authorization, r.body.model]), [['Bearer primary-key', 'primary-model'], ['Bearer second-key', 'second-model']]);
    assert.equal(h.settings.get('base-url'), 'https://primary.test/v1');
});

test('empty primary configuration still reaches a configured additional connection', async () => {
    const h = harness([backup('second')], () => success('OK'), { 'api-keys': '', model: '' });
    await h.addon.testConnection();
    assert.equal(h.requests.length, 1);
    assert.equal(h.requests[0].body.model, 'second-model');
});

for (const failure of ['timeout', 'quota', 'server', 'empty', 'invalid-json']) {
    test(`${failure} falls through in the saved order`, async () => {
        const h = harness([backup('second'), backup('third')], request => {
            if (!request.url.includes('primary')) return success('{"ok":true}');
            if (failure === 'timeout') throw new DOMException('Request timed out', 'AbortError');
            if (failure === 'quota') return json(429, {});
            if (failure === 'server') return json(503, {});
            if (failure === 'empty') return success('');
            return success('not json');
        });
        assert.deepEqual(await h.hooks.callChatGPTAPIRaw('fixture', 1, JSON.parse), { ok: true });
        assert.equal(h.requests.length, 2);
    });
}

test('exhausted connections propagate an error rather than reporting success', async () => {
    const h = harness([backup('second')], () => json(503, { error: { message: 'server unavailable' } }));
    await assert.rejects(h.addon.testConnection(), /server unavailable/);
    assert.equal(h.requests.length, 2);
});

test('stream fallback resets failed provisional output before the next connection', async () => {
    const trace = [];
    const h = harness([backup('second')], request => {
        const primary = request.url.includes('primary');
        const event = { choices: [{ delta: { content: primary ? 'wrong\n' : 'correct\n' }, finish_reason: primary ? null : 'stop' }] };
        return new Response(`data: ${JSON.stringify(event)}\n\ndata: [DONE]\n\n`, { headers: { 'Content-Type': 'text/event-stream' } });
    });
    const result = await h.hooks.callChatGPTAPIStream('fixture', (i, value) => trace.push(value), () => trace.push('RESET'), 1);
    assert.equal(result, 'correct\n');
    assert.ok(trace.indexOf('RESET') > trace.indexOf('wrong'));
    assert.ok(trace.indexOf('correct') > trace.indexOf('RESET'));
    assert.equal(h.requests[1].body.model, 'second-model');
});

test('a rejected stream cancels the live body and unlocks it before using the next connection', async () => {
    const trace = [];
    const encoder = new TextEncoder();
    const data = (text, finish_reason) => encoder.encode('data: ' + JSON.stringify({
        choices: [{ delta: { content: text }, finish_reason }],
    }) + '\n\n');
    const rejected = new Response(new ReadableStream({
        start(controller) {
            controller.enqueue(data('wrong\n', null));
            controller.enqueue(data('', 'content_filter'));
        },
        cancel() {
            trace.push('cancel');
            return new Promise(() => {});
        },
    }), { headers: { 'Content-Type': 'text/event-stream' } });
    const h = harness([backup('second')], request => {
        if (request.url.includes('primary')) return rejected;
        assert.equal(rejected.body.locked, false);
        trace.push('next');
        return success('correct');
    });

    assert.equal(await h.hooks.callChatGPTAPIStream(
        'fixture', (_index, line) => trace.push(line), () => trace.push('reset'), 1,
    ), 'correct');
    assert.deepEqual(trace, ['wrong', 'cancel', 'reset', 'next']);
});

test('research Responses API fails over and finishes on response.completed even with an open body', { timeout: 1500 }, async () => {
    const events = [
        { type: 'response.output_text.delta', delta: '{"ok":true}' },
        { type: 'response.completed', response: { status: 'completed' } },
    ];
    const { response, cancelled } = openEventResponse(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''));
    const h = harness([backup('second')], request => {
        if (request.url.includes('primary')) return json(404, { error: { message: 'unsupported' } });
        return response;
    });
    const result = await h.hooks.callResponsesAPIStream('fixture', null, null, 1, JSON.parse);
    assert.deepEqual(result, { ok: true });
    assert.equal(h.requests[1].url, 'https://second.test/v1/responses');
    assert.equal(h.requests[1].body.model, 'second-model');
    await cancelled;
    assert.equal(response.body.locked, false);
});

test('concurrent requests keep their own credentials and ordered connection snapshots', async () => {
    const h = harness([backup('second')], async request => {
        await new Promise(resolve => setImmediate(resolve));
        if (request.url.includes('primary') && request.body.messages[0].content === 'first') return json(500, {});
        return success(request.headers.Authorization + ':' + request.body.model);
    });
    const [first, second] = await Promise.all([h.hooks.callChatGPTAPIRaw('first'), h.hooks.callChatGPTAPIRaw('second')]);
    assert.equal(first, 'Bearer second-key:second-model');
    assert.equal(second, 'Bearer primary-key:primary-model');
});
