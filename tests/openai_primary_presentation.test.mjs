import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../Addon_AI_ChatGPT.js', import.meta.url), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const backup = {
    id: 'backup', name: 'Backup', baseUrl: 'https://backup.test/v1',
    apiKeys: 'backup-key', model: 'backup-model', enabled: true, capabilities: { metadata: false }
};

function harness(values = {}, responder, translate = key => key) {
    const settings = new Map(Object.entries({
        'api-keys': 'primary-key', 'base-url': 'https://primary.test/v1',
        model: 'primary-model', 'custom-model': '', 'primary-capabilities': {},
        'fallback-providers': [plain(backup)], 'extra-endpoints': [], ...values
    }));
    const writes = [], requests = [], states = new WeakMap();
    let current, cursor, addon;
    const React = {
        createElement: (type, props, ...children) => ({
            type, props: props || {}, children: children.flat(Infinity).filter(child => child !== false && child != null)
        }),
        useState(initial) {
            const index = cursor++;
            if (!(index in current)) current[index] = typeof initial === 'function' ? initial() : initial;
            const state = current;
            return [state[index], value => { state[index] = typeof value === 'function' ? value(state[index]) : value; }];
        },
        useCallback: callback => callback,
        // Real model-discovery effects are exercised by the browser fixture.
        useEffect() {}
    };
    const window = {
        I18n: { t: translate },
        AIAddonManager: {
            register(value) { addon = value; },
            getAddonSetting: (_id, key, fallback) => settings.get(key) ?? fallback,
            setAddonSetting(_id, key, value) { writes.push({ key, value: plain(value) }); settings.set(key, value); },
            getProviderRequestAttempts: () => 1
        },
        async ivLyricsFetch(url, options) {
            const request = { url, authorization: options.headers.Authorization, body: JSON.parse(options.body) };
            requests.push(request);
            return responder ? responder(request) : Response.json({ choices: [{ message: { content: 'OK' }, finish_reason: 'stop' }] });
        }
    };
    vm.runInNewContext(source, { window, Spicetify: { React }, console, setTimeout, clearTimeout, TextDecoder });
    const Settings = addon.getSettingsUI();
    const render = (Component = Settings, props = {}) => {
        if (!states.has(Component)) states.set(Component, []);
        current = states.get(Component);
        cursor = 0;
        return Component(props);
    };
    return { settings, writes, requests, render };
}

function nodes(node, predicate) {
    if (!node || typeof node !== 'object') return [];
    return [...(predicate(node) ? [node] : []), ...node.children.flatMap(child => nodes(child, predicate))];
}
const hasClass = name => node => node.props.className?.split(' ').includes(name);
const one = (root, predicate) => {
    const matches = nodes(root, predicate);
    assert.equal(matches.length, 1);
    return matches[0];
};
const primary = root => one(root, hasClass('ai-addon-connection-card'));
const field = (root, suffix) => one(primary(root), node => node.props.id === `chatgpt-primary-${suffix}`);
const change = (root, suffix, value) => field(root, suffix).props.onChange({ target: { value } });
const testButton = root => one(primary(root), node => node.type === 'button' && node.children.includes('Test Connection'));
const status = root => one(primary(root), node => node.props.role === 'status');

test('primary and additional providers share a card layout with each test inside its own footer', () => {
    const h = harness();
    const root = h.render();
    const card = primary(root);
    const list = one(root, node => node.type?.name === 'FallbackProvidersSection');
    const editor = one(h.render(list.type), node => node.type?.name === 'ConnectionEditor');
    const additional = h.render(editor.type, editor.props);
    const layout = node => node.children.map(child => child.type?.name || child.props.className);
    assert.deepEqual(layout(card), layout(additional));
    assert.deepEqual(layout(card), [
        'ai-addon-connection-header', 'ai-addon-connection-fields', 'CapabilityControls', 'ai-addon-connection-footer'
    ]);
    assert.ok(hasClass('ai-addon-setting')(root.children[0]));
    assert.strictEqual(root.children[0].children[0], card);
    assert.strictEqual(root.children[1], list);
    assert.equal(root.children[2].type.name, 'AdvancedParamsSection');
    assert.equal(root.children.length, 3, 'no test row remains after additional providers or advanced settings');
    assert.equal(one(card, hasClass('ai-addon-connection-header')).children[0].children[0].children[0], '1. Default');
    assert.strictEqual(one(card, hasClass('ai-addon-connection-footer')).children[0], testButton(root));
    assert.equal(testButton(root).props.className, one(additional, node => node.children.includes('Test this provider')).props.className);
    assert.equal(nodes(card, node => node.props.type === 'checkbox' || hasClass('ai-addon-connection-actions')(node)).length, 0);
    const fields = one(card, hasClass('ai-addon-connection-fields')).children;
    assert.deepEqual(fields.map(row => row.children[0].children[0]), ['API Key(s)', 'Base URL', 'Model', 'Custom Model ID']);
    assert.ok(fields.every(hasClass('ai-addon-connection-field')));
    for (const control of nodes(card, node => node.type === 'input' || node.type === 'select')) {
        assert.equal(one(card, node => node.type === 'label' && node.props.htmlFor === control.props.id).props.htmlFor, control.props.id);
    }
    assert.equal(field(root, 'apiKeys').props.type, 'password');
    assert.equal(field(root, 'apiKeys').props.autoComplete, 'off');
    assert.deepEqual(h.writes, [], 'presenting saved cards does not migrate primary settings');
});

test('primary key formats and legacy api-key fallback display without rewriting settings', () => {
    for (const keys of ['first\nsecond', '["first","second"]', ['first', 'second']]) {
        const h = harness({ 'api-keys': keys });
        const root = h.render();
        assert.equal(field(root, 'apiKeys').props.value, Array.isArray(keys) ? JSON.stringify(keys) : keys);
        assert.deepEqual(h.settings.get('api-keys'), keys);
        assert.deepEqual(h.writes, []);
    }
    const h = harness({ 'api-keys': '', 'api-key': 'legacy-key' });
    assert.equal(field(h.render(), 'apiKeys').props.value, 'legacy-key');
    assert.deepEqual(h.writes, []);
});

test('primary edits keep the original setting keys and custom-model selection semantics', () => {
    const h = harness({ 'api-key': 'legacy-key' });
    const savedConnections = plain(h.settings.get('fallback-providers'));
    change(h.render(), 'apiKeys', 'changed-key,second-key');
    change(h.render(), 'baseUrl', ' https://changed.test/v1/ ');
    change(h.render(), 'models', 'listed-model');
    change(h.render(), 'customModel', 'custom/model');
    assert.equal(field(h.render(), 'customModel').props.value, 'custom/model');
    assert.equal(h.settings.get('model'), 'custom/model');
    change(h.render(), 'customModel', '');
    assert.equal(h.settings.get('model'), 'custom/model', 'clearing custom ID retains the selected model');
    change(h.render(), 'models', 'another-listed-model');
    assert.equal(h.settings.get('custom-model'), '');
    assert.equal(h.settings.get('model'), 'another-listed-model');
    assert.equal(h.settings.get('base-url'), ' https://changed.test/v1/ ', 'presentation does not introduce URL normalization');
    assert.equal(h.settings.get('api-key'), 'legacy-key');
    assert.deepEqual(h.writes.map(write => write.key), [
        'api-keys', 'base-url', 'model', 'custom-model', 'model', 'custom-model', 'model'
    ]);
    assert.deepEqual(plain(h.settings.get('fallback-providers')), savedConnections);
    assert.deepEqual(plain(h.settings.get('extra-endpoints')), []);
});

test('primary capability order, inherited pronunciation and saved additional capabilities are preserved', () => {
    const h = harness({ 'primary-capabilities': { translate: false, metadata: false } });
    const chips = () => {
        const controls = one(primary(h.render()), node => node.type?.name === 'CapabilityControls');
        return nodes(h.render(controls.type, controls.props), node => node.type === 'button');
    };
    const before = chips();
    assert.deepEqual(before.map(chip => chip.children[0]), [
        'Pronunciation', 'Translation', 'Metadata', 'TMI', 'Research web search', 'Learning',
        'Character pronunciation', 'Cultural context', 'Word details', 'Motion direction'
    ]);
    assert.equal(before[0].props['aria-pressed'], false);
    before[1].props.onClick();
    assert.deepEqual(plain(h.settings.get('primary-capabilities')), { translate: true, metadata: false, pronunciation: false });
    chips()[0].props.onClick();
    assert.equal(h.settings.get('primary-capabilities').pronunciation, true);
    assert.deepEqual(plain(h.settings.get('fallback-providers')[0].capabilities), { metadata: false });
    assert.deepEqual(h.writes.map(write => write.key), ['primary-capabilities', 'primary-capabilities']);
});

test('primary test retains ordered failover and announces pending/success within its card', async () => {
    const h = harness({}, request => request.url.includes('primary')
        ? Response.json({ error: { message: 'fixture failure' } }, { status: 503 })
        : Response.json({ choices: [{ message: { content: 'OK' }, finish_reason: 'stop' }] }));
    const pending = testButton(h.render()).props.onClick();
    assert.equal(status(h.render()).children[0], 'Testing...');
    await pending;
    const root = h.render();
    assert.deepEqual(h.requests.map(request => [request.url, request.authorization, request.body.model]), [
        ['https://primary.test/v1/chat/completions', 'Bearer primary-key', 'primary-model'],
        ['https://backup.test/v1/chat/completions', 'Bearer backup-key', 'backup-model']
    ]);
    assert.equal(status(root).children[0], '✓ Connection successful.');
    assert.equal(status(root).props['aria-live'], 'polite');
    assert.ok(hasClass('success')(status(root)));
    assert.ok(one(primary(root), hasClass('ai-addon-connection-footer')).children.includes(status(root)));
    assert.deepEqual(h.writes, []);
});

test('primary test reports exhausted errors inside the primary card', async () => {
    const h = harness({ 'fallback-providers': [] }, () => Response.json({ error: { message: 'fixture failure' } }, { status: 503 }));
    await testButton(h.render()).props.onClick();
    const root = h.render();
    assert.match(status(root).children[0], /^✗ .*fixture failure/);
    assert.ok(hasClass('error')(status(root)));
    assert.equal(h.requests.length, 1);
});

test('an unconfigured primary still permits testing the existing fallback chain', async () => {
    const h = harness({ 'api-keys': '', model: '' });
    assert.notEqual(testButton(h.render()).props.disabled, true);
    await testButton(h.render()).props.onClick();
    assert.deepEqual(h.requests.map(request => request.url), ['https://backup.test/v1/chat/completions']);
    assert.equal(status(h.render()).children[0], '✓ Connection successful.');
});

test('primary heading and controls use existing I18n keys', () => {
    const h = harness({}, undefined, key => `localized:${key}`);
    const root = h.render();
    const card = primary(root);
    assert.equal(one(card, hasClass('ai-addon-connection-header')).children[0].children[0].children[0], '1. localized:misc.default');
    assert.equal(one(card, node => node.type === 'label' && node.props.htmlFor === 'chatgpt-primary-apiKeys').children[0], 'localized:settings.aiProviders.apiKey');
    assert.equal(one(card, hasClass('ai-addon-connection-footer')).children[0].children[0], 'localized:settings.aiProviders.testConnection');
});

test('primary heading and test labels resolve from the existing locale files', () => {
    const directory = new URL('../langs/', import.meta.url);
    const files = readdirSync(directory).filter(name => /^Lang.*\.js$/.test(name));
    assert.ok(files.length >= 22);
    for (const file of files) {
        const context = { window: {} };
        vm.runInNewContext(readFileSync(new URL(file, directory), 'utf8'), context);
        const messages = Object.values(context.window)[0];
        const h = harness({}, undefined, key => key.split('.').reduce((value, part) => value?.[part], messages));
        const card = primary(h.render());
        assert.ok(messages.misc.default, `${file}: missing existing Default label`);
        assert.equal(one(card, hasClass('ai-addon-connection-header')).children[0].children[0].children[0], `1. ${messages.misc.default}`, file);
        assert.equal(one(card, hasClass('ai-addon-connection-footer')).children[0].children[0], messages.settings.aiProviders.testConnection, file);
    }
});
