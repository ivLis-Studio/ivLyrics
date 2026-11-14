import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../Addon_AI_ChatGPT.js', import.meta.url), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const connection = (id, overrides = {}) => ({
    id, name: id, baseUrl: `https://${id}.test/v1`, apiKeys: `${id}-key`,
    model: `${id}-model`, enabled: true, ...overrides
});
const endpoint = (id, overrides = {}) => ({
    id, label: id, baseUrl: `https://${id}.test/v1`, apiKey: `${id}-key`,
    model: `${id}-model`, ...overrides
});

function reactHarness() {
    const states = new WeakMap();
    let current;
    let cursor = 0;
    const React = {
        createElement: (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity).filter(child => child !== false && child != null) }),
        useState(initial) {
            const index = cursor++;
            if (!(index in current)) current[index] = typeof initial === 'function' ? initial() : initial;
            const state = current;
            return [state[index], value => { state[index] = typeof value === 'function' ? value(state[index]) : value; }];
        },
        useCallback: callback => callback,
        // Effects that discover remote model lists are verified separately
        // from these synchronous settings actions.
        useEffect() {},
    };
    return {
        React,
        render(Component, props = {}) {
            if (!states.has(Component)) states.set(Component, []);
            current = states.get(Component);
            cursor = 0;
            return Component(props);
        }
    };
}

function harness(values = {}, writeMode = 'normal') {
    const settings = new Map(Object.entries({
        'api-keys': 'primary-key', 'base-url': 'https://primary.test/v1', model: 'primary-model',
        'primary-capabilities': {}, 'fallback-providers': [], 'extra-endpoints': [], ...values
    }));
    const writes = [];
    const requests = [];
    const ui = reactHarness();
    let addon;
    const window = {
        AIAddonManager: {
            register(value) { addon = value; },
            getAddonSetting: (_id, key, fallback) => settings.get(key) ?? fallback,
            setAddonSetting(_id, key, value) {
                writes.push({ key, value: plain(value) });
                if (key === 'fallback-providers' && writeMode === 'throw') throw new Error('storage unavailable');
                if (key === 'fallback-providers' && writeMode === 'drop') return;
                settings.set(key, writeMode === 'serialized' ? JSON.stringify(value) : value);
            },
            getProviderRequestAttempts: () => 1
        },
        async ivLyricsFetch(url, options) {
            const request = { url, authorization: options.headers.Authorization, body: options.body && JSON.parse(options.body) };
            requests.push(request);
            if (url.includes('allowed')) {
                return new Response(JSON.stringify({ choices: [{ message: { content: '{"title":"Translated","artist":"Artist"}' }, finish_reason: 'stop' }] }));
            }
            return new Response(JSON.stringify({ error: { message: 'fixture failure' } }), { status: 503 });
        }
    };
    vm.runInNewContext(source.replace('    registerAddon();',
        '    window.hooks = { getFallbackProviders, getProviderConnections, getRequestTargets, callChatGPTAPIRaw };\n    registerAddon();'),
    { window, Spicetify: { React: ui.React }, URL, URLSearchParams, TextDecoder, setTimeout, clearTimeout, console });
    return { addon, hooks: window.hooks, window, settings, writes, requests, ui };
}

test('migration joins the two stores in existing order and preserves aliases, key lists and capabilities', () => {
    const legacy = connection('legacy', { apiKeys: ['first', 'second'], capabilities: { metadata: false } });
    const imported = endpoint('imported', { apiKey: undefined, api_key: ' imported-key ', model: '', custom_model: 'custom-model', capabilities: { wordSupplements: false } });
    const h = harness({ 'fallback-providers': JSON.stringify([legacy]), 'extra-endpoints': JSON.stringify([imported]) });
    const list = plain(h.hooks.getFallbackProviders());
    assert.deepEqual(list.map(item => item.id), ['legacy', 'imported']);
    assert.equal(list[0].apiKeys, '["first","second"]');
    assert.equal(list[0].capabilities.metadata, false);
    assert.equal(list[1].name, 'imported');
    assert.equal(list[1].apiKeys, 'imported-key');
    assert.equal(list[1].model, 'custom-model');
    assert.equal(list[1].capabilities.wordSupplements, false);
    assert.equal('api_key' in list[1], false);
    assert.equal('custom_model' in list[1], false);
    assert.deepEqual(plain(h.settings.get('fallback-providers')), list);
    assert.deepEqual(plain(h.settings.get('extra-endpoints')), []);
});

test('an exact imported duplicate keeps the existing name, ID, position and explicit capability choices', () => {
    const h = harness({
        'fallback-providers': [connection('legacy', { name: 'My existing provider', capabilities: { translate: false } }), connection('other')],
        'extra-endpoints': [endpoint('renamed', { baseUrl: ' https://legacy.test/v1/// ', apiKey: 'legacy-key', model: 'legacy-model', enabled: false, capabilities: { translate: true, metadata: false } })]
    });
    const list = plain(h.hooks.getFallbackProviders());
    assert.deepEqual(list.map(item => item.id), ['legacy', 'other']);
    assert.equal(list[0].name, 'My existing provider');
    assert.equal(list[0].enabled, false);
    assert.deepEqual(list[0].capabilities, { translate: false, metadata: false });
});

test('different keys and models remain separate connections even on the same API URL', () => {
    const h = harness({
        'fallback-providers': [connection('legacy')],
        'extra-endpoints': [
            endpoint('new-model', { baseUrl: 'https://legacy.test/v1', apiKey: 'legacy-key', model: 'different-model' }),
            endpoint('new-key', { baseUrl: 'https://legacy.test/v1', apiKey: 'different-key', model: 'legacy-model' })
        ]
    });
    assert.deepEqual(Array.from(h.hooks.getFallbackProviders(), item => item.id), ['legacy', 'new-model', 'new-key']);
});

test('only PR endpoints with an omitted model keep inheriting the primary model', () => {
    const h = harness({
        'fallback-providers': [connection('blank-legacy', { model: '' })],
        'extra-endpoints': [endpoint('inherited', { model: '' })]
    });
    let list = plain(h.hooks.getProviderConnections());
    assert.equal(list[1].model, '');
    assert.equal(list[2].model, 'primary-model');
    h.settings.set('model', 'updated-primary');
    list = plain(h.hooks.getProviderConnections());
    assert.equal(list[1].model, '');
    assert.equal(list[2].model, 'updated-primary');
});

test('incomplete drafts survive migration and ID collisions get stable distinct IDs', () => {
    const h = harness({
        'fallback-providers': [connection('same', { apiKeys: '', model: '' })],
        'extra-endpoints': [endpoint('same', { apiKey: '', model: '' }), endpoint('same', { apiKey: '', model: '' })]
    });
    const first = plain(h.hooks.getFallbackProviders());
    const second = plain(h.hooks.getFallbackProviders());
    assert.deepEqual(first.map(item => item.id), ['same', 'same-imported', 'same-imported-imported']);
    assert.deepEqual(second, first);
});

test('successful migration retires the PR store once, without writes on later reads', () => {
    const h = harness({ 'extra-endpoints': [endpoint('imported')] });
    h.hooks.getFallbackProviders();
    const count = h.writes.length;
    h.hooks.getFallbackProviders();
    h.hooks.getRequestTargets('metadata');
    assert.equal(h.writes.length, count);
    assert.deepEqual(h.writes.map(write => write.key), ['fallback-providers', 'extra-endpoints']);
});

for (const writeMode of ['throw', 'drop']) {
    test(`a ${writeMode} canonical write retains the PR source and still makes the endpoint available`, () => {
        const imported = [endpoint('imported')];
        const h = harness({ 'fallback-providers': [connection('legacy')], 'extra-endpoints': imported }, writeMode);
        assert.deepEqual(Array.from(h.hooks.getFallbackProviders(), item => item.id), ['legacy', 'imported']);
        assert.deepEqual(plain(h.settings.get('extra-endpoints')), imported);
        assert.equal(h.writes.some(write => write.key === 'extra-endpoints'), false);
        assert.deepEqual(Array.from(h.hooks.getFallbackProviders(), item => item.id), ['legacy', 'imported']);
    });
}

test('a storage adapter that serializes values can confirm the canonical write before clearing the source', () => {
    const h = harness({ 'extra-endpoints': [endpoint('imported')] }, 'serialized');
    h.hooks.getFallbackProviders();
    assert.deepEqual(JSON.parse(h.settings.get('extra-endpoints')), []);
    assert.equal(JSON.parse(h.settings.get('fallback-providers'))[0].id, 'imported');
});

test('unreadable existing settings are preserved instead of overwritten by migration', () => {
    const h = harness({ 'fallback-providers': '{invalid', 'extra-endpoints': [endpoint('imported')] });
    assert.equal(h.hooks.getFallbackProviders()[0].id, 'imported');
    assert.equal(h.settings.get('fallback-providers'), '{invalid');
    assert.equal(h.writes.length, 0);
    assert.equal(h.settings.get('extra-endpoints').length, 1);
});

test('unreadable PR settings do not disturb valid existing providers', () => {
    const h = harness({ 'fallback-providers': [connection('legacy')], 'extra-endpoints': '{invalid' });
    assert.equal(h.hooks.getFallbackProviders()[0].id, 'legacy');
    assert.equal(h.settings.get('extra-endpoints'), '{invalid');
    assert.equal(h.writes.length, 0);
});

test('capability selection routes metadata to the allowed additional provider', async () => {
    const h = harness({
        'primary-capabilities': { metadata: false },
        'fallback-providers': [connection('blocked', { capabilities: { metadata: false } }), connection('disabled', { enabled: false })],
        'extra-endpoints': [endpoint('allowed', { capabilities: { translate: false, metadata: true } })]
    });
    const result = await h.addon.translateMetadata({ title: 'Song', artist: 'Artist', metadataPrompt: 'fixture' });
    assert.equal(result.translated.title, 'Translated');
    assert.deepEqual(h.requests.map(request => request.url), ['https://allowed.test/v1/chat/completions']);
    assert.equal(h.requests[0].authorization, 'Bearer allowed-key');
    assert.equal(h.requests[0].body.model, 'allowed-model');
    assert.deepEqual(Array.from(h.hooks.getRequestTargets('translate'), target => target.label), ['Primary', 'blocked']);
});

test('failover tries existing providers before migrated endpoints', async () => {
    const h = harness({ 'fallback-providers': [connection('legacy')], 'extra-endpoints': [endpoint('allowed')] });
    await h.hooks.callChatGPTAPIRaw('fixture');
    assert.deepEqual(h.requests.map(request => request.url), [
        'https://primary.test/v1/chat/completions', 'https://legacy.test/v1/chat/completions', 'https://allowed.test/v1/chat/completions'
    ]);
});

test('identical request targets are tried only once while distinct keys and models still fail over', async () => {
    const h = harness({ 'fallback-providers': [
        connection('duplicate', { baseUrl: 'https://primary.test/v1/', apiKeys: 'primary-key', model: 'primary-model' }),
        connection('other-model', { baseUrl: 'https://primary.test/v1', apiKeys: 'primary-key', model: 'other-model' }),
        connection('other-key', { baseUrl: 'https://primary.test/v1', apiKeys: 'other-key', model: 'primary-model' })
    ] });
    await assert.rejects(h.hooks.callChatGPTAPIRaw('fixture'), /fixture failure/);
    assert.deepEqual(h.requests.map(request => [request.authorization, request.body.model]), [
        ['Bearer primary-key', 'primary-model'], ['Bearer primary-key', 'other-model'], ['Bearer other-key', 'primary-model']
    ]);
});

test('Research keeps separate web-search and plain-chat routes for otherwise identical targets', () => {
    const h = harness({ 'fallback-providers': [connection('plain', {
        baseUrl: 'https://primary.test/v1', apiKeys: 'primary-key', model: 'primary-model', capabilities: { researchWebSearch: false }
    })] });
    assert.deepEqual(Array.from(h.hooks.getRequestTargets('tmi'), target => target.researchWebSearch), [true, false]);
    assert.equal(h.hooks.getRequestTargets('translate').length, 1);
});

test('factory instances migrate their own settings without changing another provider', () => {
    const h = harness();
    const stores = new Map([
        ['chatgpt:extra-endpoints', [endpoint('chatgpt-only')]],
        ['nvidia-nim:extra-endpoints', [endpoint('nim-only')]]
    ]);
    h.window.AIAddonManager.getAddonSetting = (id, key, fallback) => stores.get(`${id}:${key}`) ?? fallback;
    h.window.AIAddonManager.setAddonSetting = (id, key, value) => stores.set(`${id}:${key}`, value);
    h.window.createOpenAICompatibleAddon({ info: { id: 'nvidia-nim' }, baseUrl: 'https://nim.test/v1' });
    assert.equal(h.window.hooks.getFallbackProviders()[0].id, 'nim-only');
    assert.equal(stores.get('chatgpt:extra-endpoints')[0].id, 'chatgpt-only');
    assert.deepEqual(plain(stores.get('nvidia-nim:extra-endpoints')), []);
    assert.equal(stores.get('nvidia-nim:fallback-providers')[0].id, 'nim-only');
});

function nodes(root, predicate) {
    const found = [];
    function visit(node) {
        if (!node || typeof node !== 'object') return;
        if (predicate(node)) found.push(node);
        node.children?.forEach(visit);
    }
    visit(root);
    return found;
}

function settingsList(h) {
    const Settings = h.addon.getSettingsUI();
    const root = h.ui.render(Settings);
    const lists = nodes(root, node => node.type?.name === 'FallbackProvidersSection');
    assert.equal(lists.length, 1);
    const Component = lists[0].type;
    return { root, render: () => h.ui.render(Component, lists[0].props) };
}

test('the settings UI exposes one add control and preserves credentials/capabilities when editing, moving and deleting', () => {
    const h = harness({ 'fallback-providers': [connection('first', { capabilities: { wordSupplements: false } }), connection('second')] });
    const list = settingsList(h);
    let tree = list.render();
    const editors = () => nodes(tree, node => node.type?.name === 'ConnectionEditor');
    const add = nodes(tree, node => node.type === 'button' && node.children.includes('Add provider'));
    assert.equal(add.length, 1);
    assert.equal(nodes(list.root, node => node.children.includes('Additional OpenAI-compatible endpoints')).length, 0);
    editors()[0].props.onChange({ name: 'Updated name' });
    editors()[0].props.onMove(1);
    tree = list.render();
    assert.deepEqual(editors().map(node => node.props.connection.id), ['second', 'first']);
    const saved = plain(h.settings.get('fallback-providers'));
    assert.equal(saved[1].apiKeys, 'first-key');
    assert.equal(saved[1].model, 'first-model');
    assert.equal(saved[1].name, 'Updated name');
    assert.equal(saved[1].capabilities.wordSupplements, false);
    add[0].props.onClick();
    tree = list.render();
    assert.equal(editors().length, 3);
    editors()[2].props.onRemove();
    tree = list.render();
    assert.deepEqual(editors().map(node => node.props.connection.id), ['second', 'first']);
    assert.deepEqual(Array.from(h.hooks.getRequestTargets(), target => target.label), ['Primary', 'second', 'Updated name']);
});

test('connection controls respect order boundaries, mask keys and route toggles into saved capability flags', () => {
    const h = harness({ 'fallback-providers': [connection('first'), connection('second')] });
    const list = settingsList(h);
    let tree = list.render();
    let editor = nodes(tree, node => node.type?.name === 'ConnectionEditor')[0];
    let card = h.ui.render(editor.type, editor.props);
    const buttons = nodes(card, node => node.type === 'button');
    assert.equal(buttons.find(node => node.props['aria-label'] === 'Move up').props.disabled, false,
        'the first additional provider promotes itself into the primary slot');
    assert.equal(buttons.find(node => node.props['aria-label'] === 'Move down').props.disabled, false);
    const key = nodes(card, node => node.type === 'input' && node.props.id?.endsWith('-apiKeys'))[0];
    assert.equal(key.props.type, 'password');
    const capabilityNode = nodes(card, node => node.type?.name === 'CapabilityControls')[0];
    const chips = h.ui.render(capabilityNode.type, capabilityNode.props);
    nodes(chips, node => node.type === 'button' && node.children.includes('Word details'))[0].props.onClick();
    assert.equal(h.settings.get('fallback-providers')[0].capabilities.wordSupplements, false);
    nodes(card, node => node.type === 'input' && node.props.type === 'checkbox')[0].props.onChange({ target: { checked: false } });
    assert.equal(h.settings.get('fallback-providers')[0].enabled, false);
    assert.equal(h.hooks.getRequestTargets('wordSupplements').some(target => target.label === 'first'), false);
    tree = list.render();
    editor = nodes(tree, node => node.type?.name === 'ConnectionEditor')[1];
    card = h.ui.render(editor.type, editor.props);
    assert.equal(nodes(card, node => node.props['aria-label'] === 'Move down')[0].props.disabled, true);
});

test('connection tests use the edited provider rather than falling back through other providers', async () => {
    const h = harness({ 'fallback-providers': [connection('allowed')] });
    const list = settingsList(h);
    const editor = nodes(list.render(), node => node.type?.name === 'ConnectionEditor')[0];
    const card = h.ui.render(editor.type, editor.props);
    const button = nodes(card, node => node.type === 'button' && node.children.includes('Test this provider'))[0];
    await button.props.onClick();
    assert.deepEqual(h.requests.map(request => request.url), ['https://allowed.test/v1/chat/completions']);
    assert.equal(h.requests[0].body.model, 'allowed-model');
    const updated = h.ui.render(editor.type, editor.props);
    assert.equal(nodes(updated, node => node.props.role === 'status')[0].children[0], '✓ Connection successful.');
});

test('the primary card can be moved down the chain by swapping with the next provider', () => {
    const h = harness({
        'fallback-providers': [connection('next', { capabilities: { metadata: false } })]
    });
    const Settings = h.addon.getSettingsUI();
    const primaryCard = () => nodes(h.ui.render(Settings), node => node.props.className?.split(' ').includes('ai-addon-connection-card'))[0];
    const control = (label, root = primaryCard()) => nodes(root, node => node.props['aria-label'] === label)[0];
    assert.equal(control('Move up').props.disabled, true, 'the primary is already first');
    assert.equal(control('Move down').props.disabled, false);

    control('Move down').props.onClick();

    assert.equal(h.settings.get('api-keys'), 'next-key');
    assert.equal(h.settings.get('base-url'), 'https://next.test/v1');
    assert.equal(h.settings.get('model'), 'next-model');
    assert.equal(h.settings.get('custom-model'), '');
    assert.deepEqual(plain(h.settings.get('primary-capabilities')), { metadata: false });
    const demoted = plain(h.settings.get('fallback-providers'));
    assert.equal(demoted.length, 1);
    assert.equal(demoted[0].apiKeys, 'primary-key');
    assert.equal(demoted[0].baseUrl, 'https://primary.test/v1');
    assert.equal(demoted[0].model, 'primary-model');
    assert.equal(demoted[0].enabled, true);
    assert.equal(demoted[0].inheritPrimaryModel, false);
    assert.deepEqual(demoted[0].capabilities, {});
    assert.ok(demoted[0].id && demoted[0].id !== 'next');
    assert.deepEqual(Array.from(h.hooks.getRequestTargets(), target => target.baseUrl),
        ['https://next.test/v1', 'https://primary.test/v1'], 'request order follows the swap');

    control('Move down').props.onClick();
    assert.equal(h.settings.get('api-keys'), 'primary-key');
    assert.deepEqual(plain(h.settings.get('primary-capabilities')), {});
    assert.deepEqual(Array.from(h.hooks.getRequestTargets(), target => target.baseUrl),
        ['https://primary.test/v1', 'https://next.test/v1'], 'the swap is reversible');
});

test('the primary move and remove controls stay disabled until an additional provider exists', () => {
    const h = harness();
    const Settings = h.addon.getSettingsUI();
    const primaryCard = nodes(h.ui.render(Settings), node => node.props.className?.split(' ').includes('ai-addon-connection-card'))[0];
    assert.equal(nodes(primaryCard, node => node.props['aria-label'] === 'Move down')[0].props.disabled, true);
    assert.equal(nodes(primaryCard, node => node.props['aria-label'] === 'Remove provider')[0].props.disabled, true,
        'the chain must always keep at least one provider');

    const list = settingsList(h);
    const add = nodes(list.render(), node => node.type === 'button' && node.children.includes('Add provider'))[0];
    add.props.onClick();
    const again = nodes(h.ui.render(Settings), node => node.props.className?.split(' ').includes('ai-addon-connection-card'))[0];
    assert.equal(nodes(again, node => node.props['aria-label'] === 'Move down')[0].props.disabled, false);
    assert.equal(nodes(again, node => node.props['aria-label'] === 'Remove provider')[0].props.disabled, false);
});

test('removing the primary promotes the next provider without leaving an empty chain', () => {
    const h = harness({
        'fallback-providers': [connection('next', { capabilities: { metadata: false } }), connection('later')]
    });
    const Settings = h.addon.getSettingsUI();
    const primaryCard = () => nodes(h.ui.render(Settings), node => node.props.className?.split(' ').includes('ai-addon-connection-card'))[0];
    const control = label => nodes(primaryCard(), node => node.props['aria-label'] === label)[0];

    control('Remove provider').props.onClick();

    assert.equal(h.settings.get('api-keys'), 'next-key');
    assert.equal(h.settings.get('base-url'), 'https://next.test/v1');
    assert.equal(h.settings.get('model'), 'next-model');
    assert.equal(h.settings.get('custom-model'), '');
    assert.deepEqual(plain(h.settings.get('primary-capabilities')), { metadata: false });
    const remaining = plain(h.settings.get('fallback-providers'));
    assert.deepEqual(remaining.map(item => item.id), ['later'], 'the removed primary is not kept as a provider');
    assert.deepEqual(Array.from(h.hooks.getRequestTargets(), target => target.baseUrl),
        ['https://next.test/v1', 'https://later.test/v1']);
    assert.equal(h.hooks.getProviderConnections().length, 2);
    assert.equal(nodes(primaryCard(), node => node.props['aria-label'] === 'Remove provider')[0].props.disabled, false);
});

test('the primary can be moved back up from the first additional provider', () => {
    const h = harness({
        'fallback-providers': [connection('next', { capabilities: { metadata: false } })]
    });
    const Settings = h.addon.getSettingsUI();
    const primaryCard = () => nodes(h.ui.render(Settings), node => node.props.className?.split(' ').includes('ai-addon-connection-card'))[0];
    nodes(primaryCard(), node => node.props['aria-label'] === 'Move down')[0].props.onClick();
    assert.equal(h.settings.get('api-keys'), 'next-key');

    const list = settingsList(h);
    const first = nodes(list.render(), node => node.type?.name === 'ConnectionEditor')[0];
    const card = h.ui.render(first.type, first.props);
    const up = nodes(card, node => node.props['aria-label'] === 'Move up')[0];
    assert.equal(up.props.disabled, false);

    up.props.onClick();

    assert.equal(h.settings.get('api-keys'), 'primary-key');
    assert.equal(h.settings.get('base-url'), 'https://primary.test/v1');
    assert.equal(h.settings.get('model'), 'primary-model');
    assert.deepEqual(plain(h.settings.get('primary-capabilities')), {});
    const demoted = plain(h.settings.get('fallback-providers'));
    assert.equal(demoted.length, 1);
    assert.equal(demoted[0].apiKeys, 'next-key');
    assert.deepEqual(demoted[0].capabilities, { metadata: false });
    assert.deepEqual(Array.from(h.hooks.getRequestTargets(), target => target.baseUrl),
        ['https://primary.test/v1', 'https://next.test/v1'], 'moving up restores the original order');
});

test('removing the primary while it is the only provider is a no-op', () => {
    const h = harness();
    const Settings = h.addon.getSettingsUI();
    const card = nodes(h.ui.render(Settings), node => node.props.className?.split(' ').includes('ai-addon-connection-card'))[0];
    nodes(card, node => node.props['aria-label'] === 'Remove provider')[0].props.onClick();
    assert.deepEqual(h.writes, []);
    assert.equal(h.hooks.getProviderConnections().length, 1);
    assert.equal(h.settings.get('api-keys'), 'primary-key');
});

test('an older install keeps its keys, custom model and disabled capability choices when the primary moves down', () => {
    const legacyPrimaryKeys = JSON.stringify(['primary-key-one', 'primary-key-two']);
    const h = harness({
        'api-keys': legacyPrimaryKeys,
        'custom-model': 'primary-custom-model',
        model: 'primary-custom-model',
        'primary-capabilities': { metadata: false, translate: false },
        'fallback-providers': [
            connection('next', { apiKeys: JSON.stringify(['next-key-one', 'next-key-two']), capabilities: { wordSupplements: false } }),
            connection('paused', { enabled: false, capabilities: { tmi: false }, 'legacy-note': 'keep-me' })
        ],
        'extra-endpoints': [endpoint('imported', { apiKey: undefined, api_key: 'imported-key', model: '', custom_model: 'imported-custom', capabilities: { pronunciation: false } })]
    });
    const Settings = h.addon.getSettingsUI();
    const primaryCard = () => nodes(h.ui.render(Settings), node => node.props.className?.split(' ').includes('ai-addon-connection-card'))[0];
    nodes(primaryCard(), node => node.props['aria-label'] === 'Move down')[0].props.onClick();

    assert.equal(h.settings.get('api-keys'), JSON.stringify(['next-key-one', 'next-key-two']),
        'the promoted provider brings its whole key list');
    assert.equal(h.settings.get('base-url'), 'https://next.test/v1');
    assert.equal(h.settings.get('model'), 'next-model');
    assert.deepEqual(plain(h.settings.get('primary-capabilities')), { wordSupplements: false });

    const saved = plain(h.settings.get('fallback-providers'));
    assert.equal(saved[0].apiKeys, legacyPrimaryKeys, 'the demoted primary keeps both of its keys');
    assert.equal(saved[0].baseUrl, 'https://primary.test/v1');
    assert.equal(saved[0].model, 'primary-custom-model', 'a custom model stays explicit instead of blanking out');
    assert.deepEqual(saved[0].capabilities, { metadata: false, translate: false },
        'capability choices turned off on the old primary stay off');
    assert.equal(saved[0].enabled, true);

    assert.equal(saved[1].id, 'paused');
    assert.equal(saved[1].enabled, false, 'a disabled provider is not re-enabled by the move');
    assert.equal(saved[1].apiKeys, 'paused-key');
    assert.deepEqual(saved[1].capabilities, { tmi: false });
    assert.equal(saved[1]['legacy-note'], 'keep-me', 'unknown saved fields survive the round trip');
    assert.equal(saved[2].apiKeys, 'imported-key');
    assert.equal(saved[2].model, 'imported-custom');
    assert.deepEqual(saved[2].capabilities, { pronunciation: false });
    assert.deepEqual(plain(h.settings.get('extra-endpoints')), [],
        'the retired store is cleared only after its entries are merged');

    assert.deepEqual(Array.from(h.hooks.getRequestTargets(), target => target.apiKey),
        ['next-key-one', 'next-key-two', 'primary-key-one', 'primary-key-two', 'imported-key'],
        'the moved chain keeps every key of every enabled provider in order');
    assert.deepEqual(Array.from(h.hooks.getRequestTargets('translate'), target => target.apiKey),
        ['next-key-one', 'next-key-two', 'imported-key'],
        'a capability the old primary had turned off is not re-enabled by the move');
});

test('an older install keeps every remaining provider when the primary is removed', () => {
    const h = harness({
        'api-keys': JSON.stringify(['primary-key-one', 'primary-key-two']),
        'custom-model': 'primary-custom-model',
        model: 'primary-custom-model',
        'primary-capabilities': { metadata: false },
        'fallback-providers': [
            connection('next', { capabilities: { metadata: false } }),
            connection('paused', { enabled: false })
        ],
        'extra-endpoints': [endpoint('imported', { apiKey: undefined, api_key: 'imported-key', model: '', custom_model: 'imported-custom' })]
    });
    const Settings = h.addon.getSettingsUI();
    const primaryCard = () => nodes(h.ui.render(Settings), node => node.props.className?.split(' ').includes('ai-addon-connection-card'))[0];
    nodes(primaryCard(), node => node.props['aria-label'] === 'Remove provider')[0].props.onClick();

    assert.equal(h.settings.get('api-keys'), 'next-key');
    assert.equal(h.settings.get('base-url'), 'https://next.test/v1');
    assert.equal(h.settings.get('model'), 'next-model');
    assert.deepEqual(plain(h.settings.get('primary-capabilities')), { metadata: false });

    const saved = plain(h.settings.get('fallback-providers'));
    assert.deepEqual(saved.map(item => item.id), ['paused', 'imported'],
        'only the removed primary disappears; the rest keep their order');
    assert.equal(saved[0].enabled, false, 'the disabled provider stays disabled');
    assert.equal(saved[0].apiKeys, 'paused-key');
    assert.equal(saved[1].apiKeys, 'imported-key');
    assert.equal(saved[1].model, 'imported-custom');
    assert.deepEqual(plain(h.settings.get('extra-endpoints')), []);
    assert.deepEqual(Array.from(h.hooks.getProviderConnections(), item => item.id), ['primary', 'imported'],
        'the disabled provider stays saved but out of the request chain');
    assert.deepEqual(Array.from(h.hooks.getRequestTargets(), target => target.baseUrl),
        ['https://next.test/v1', 'https://imported.test/v1']);
});
