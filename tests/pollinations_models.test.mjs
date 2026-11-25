import { readAiProviderFixture } from "./fixtures/ai-provider.mjs";
import { createPollinationsConnection } from "../src/providers/ai/createPollinationsConnection.mjs";
import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';

const source = readAiProviderFixture("Addon_AI_Pollinations.js");
const fixtureModels = { data: [
    { id: 'anthropic/claude-test', title: 'Claude Test', category: 'text', output_modalities: ['text'], supported_endpoints: ['/v1/chat/completions'] },
    { id: 'google/gemini-test', category: 'text', output_modalities: ['text'] },
    { id: 'google/gemini-test', category: 'text' },
    { id: 'image-model', category: 'image', output_modalities: ['image'] },
    { id: 'speech-model', output_modalities: ['audio'] },
    { id: 'response-only', supported_endpoints: ['/v1/responses'] },
] };
const json = value => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
const flush = async () => { await new Promise(resolve => setImmediate(resolve)); };

function harness(initial = {}, modelFetch = () => json(fixtureModels)) {
    const settings = new Map(Object.entries({ 'api-keys': 'fixture-key', ...initial }));
    const requests = [];
    let addon;
    const states = [], effects = [];
    let stateIndex = 0, effectIndex = 0;
    const pending = [];
    const React = {
        useState(initial) {
            const index = stateIndex++;
            if (!(index in states)) states[index] = initial;
            return [states[index], next => { states[index] = typeof next === 'function' ? next(states[index]) : next; }];
        },
        useCallback: fn => fn,
        useEffect(fn, deps) {
            const index = effectIndex++;
            if (!effects[index] || deps.some((dep, i) => dep !== effects[index].deps[i])) {
                pending.push(() => {
                    effects[index]?.cleanup?.();
                    effects[index] = { deps, cleanup: fn() };
                });
            }
        },
        createElement: (type, props, ...children) => ({ type, props: props || {}, children: children.flat().filter(Boolean) }),
    };
    const window = {
        AIAddonManager: {
            register(value) { addon = value; },
            getAddonSetting: (_id, key, fallback) => settings.get(key) ?? fallback,
            setAddonSetting: (_id, key, value) => settings.set(key, value),
            getProviderRequestAttempts: () => 1,
        },
        async ivLyricsFetch(url, options = {}) {
            requests.push({ url, ...options });
            if (url.endsWith('/models')) return await modelFetch(options);
            if (url.endsWith('/account/key')) return json({ valid: true });
            const body = JSON.parse(options.body);
            if (body.stream) {
                const event = { choices: [{ delta: { content: 'translated line' }, finish_reason: 'stop' }] };
                return new Response(`data: ${JSON.stringify(event)}\n\ndata: [DONE]\n\n`);
            }
            return json({ choices: [{ message: { content: 'OK' }, finish_reason: 'stop' }] });
        },
    };
    vm.runInNewContext(source, { window, Spicetify: { React }, URLSearchParams, TextDecoder, setTimeout, clearTimeout, console });
    const Component = addon.getSettingsUI();
    return {
        settings, requests, addon,
        render() {
            stateIndex = 0; effectIndex = 0;
            const tree = Component();
            pending.splice(0).forEach(run => run());
            return tree;
        },
        unmount() { effects.forEach(effect => effect?.cleanup?.()); },
    };
}
function nodes(tree, predicate) {
    if (!tree || typeof tree !== 'object') return [];
    return [...(predicate(tree) ? [tree] : []), ...tree.children.flatMap(child => nodes(child, predicate))];
}

test('device login requests all models while retaining device code, budget and expiry', async () => {
    const connection = createPollinationsConnection({
        getAiRequest: () => (url, request) => {
            assert.equal(url, 'https://enter.pollinations.ai/api/device/code');
            assert.match(JSON.parse(request.body).client_id, /^pk_/);
            return json({ user_code: 'AB CD', device_code: 'fixture-device' });
        },
    });
    const device = await connection.requestDeviceCode();
    assert.equal(device.device_code, 'fixture-device');
    const url = new URL(device.verificationUrl);
    assert.equal(url.origin, 'https://enter.pollinations.ai');
    assert.equal(url.searchParams.has('models'), false);
    assert.equal(url.searchParams.get('user_code'), 'AB CD');
    assert.equal(url.searchParams.get('budget'), '999');
    assert.equal(url.searchParams.get('expiry'), '365');
});

test('catalog supports different text providers and excludes incompatible endpoints', async () => {
    const h = harness({ model: 'anthropic/claude-test' });
    h.render();
    await flush();
    const select = nodes(h.render(), item => item.type === 'select')[0];
    assert.deepEqual(Array.from(select.children, item => item.props.value).sort(),
        ['anthropic/claude-test', 'google/gemini-test']);
    assert.deepEqual(Array.from(select.children.find(item => item.props.value === 'anthropic/claude-test').children),
        ['Claude Test · anthropic/claude-test']);
    assert.equal(h.requests.find(request => request.url.endsWith('/models')).headers.Authorization, 'Bearer fixture-key');
});

test('picker keeps a saved model absent from the catalog and persists a new choice', async () => {
    const h = harness({ model: 'saved-custom-model' });
    h.render();
    await flush();
    const tree = h.render();
    const select = nodes(tree, item => item.type === 'select')[0];
    assert.equal(select.props.value, 'saved-custom-model');
    assert.equal(select.props.disabled, false);
    assert.ok(select.children.some(item => item.props.value === 'saved-custom-model'));
    select.props.onChange({ target: { value: 'anthropic/claude-test' } });
    assert.equal(h.settings.get('model'), 'anthropic/claude-test');
    await h.addon.testConnection();
    assert.equal(JSON.parse(h.requests.at(-1).body).model, 'anthropic/claude-test');
    const lines = [];
    await h.addon.translateLyrics({ text: 'original line', translationPrompt: 'translate', onLine: (i, text) => lines.push(text) });
    assert.equal(JSON.parse(h.requests.at(-1).body).model, 'anthropic/claude-test');
    assert.ok(lines.includes('translated line'));
    h.unmount();
});

test('failed catalog leaves existing model editable and does not silently switch it', async () => {
    const h = harness({ model: 'custom' }, () => new Response('{}', { status: 401 }));
    h.render(); await flush();
    const tree = h.render();
    const select = nodes(tree, item => item.type === 'select')[0];
    assert.equal(select.props.disabled, true);
    assert.equal(select.props.value, 'custom');
    const input = nodes(tree, item => item.props['aria-label'] === 'Model ID')[0];
    input.props.onChange({ target: { value: 'google/gemini-test' } });
    await h.addon.testConnection();
    assert.equal(JSON.parse(h.requests.at(-1).body).model, 'google/gemini-test');
    h.unmount();
});

test('new credentials cannot receive a stale catalog from the old request', async () => {
    let resolveOld;
    const h = harness({}, options => options.headers.Authorization === 'Bearer fixture-key'
        ? new Promise(resolve => { resolveOld = resolve; })
        : json({ data: [{ id: 'new-account-model', category: 'text' }] }));
    let tree = h.render();
    const manualToggle = nodes(tree, item => item.type === 'div' && item.props.onClick && item.children.some(child => child.type === 'label' && child.children.includes('API Key')))[0];
    manualToggle.props.onClick();
    tree = h.render();
    nodes(tree, item => item.type === 'input' && item.props.type === 'password')[0].props.onChange({ target: { value: 'new-key' } });
    h.render(); await flush();
    resolveOld(json(fixtureModels)); await flush();
    tree = h.render();
    const options = nodes(tree, item => item.type === 'option').map(item => item.props.value);
    assert.ok(options.includes('new-account-model'));
    assert.ok(!options.includes('anthropic/claude-test'));
    h.unmount();
});

test('unset and blank model settings keep the original default', async () => {
    for (const model of [undefined, '  ']) {
        const h = harness({ model });
        await h.addon.testConnection();
        assert.equal(JSON.parse(h.requests.at(-1).body).model, 'openai');
    }
});
