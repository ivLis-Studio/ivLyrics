import { readAiProviderFixture } from "./fixtures/ai-provider.mjs";
import assert from 'node:assert/strict';
import vm from 'node:vm';
import test from 'node:test';
function harness(responder, key = 'fake-key:fx', localStorage) {
    let addon;
    const requests = [];
    const window = { localStorage, AIAddonManager: { register: value => addon = value, getAddonSetting: () => key },
        async ivLyricsFetch(url, options) {
            const request = { url, ...options, body: JSON.parse(options.body) }; requests.push(request);
            return responder ? responder(request) : Response.json({ translations: request.body.text.map(text => ({ text: `T:${text}` })) });
        } };
    vm.runInNewContext(readAiProviderFixture("Addon_AI_DeepL.js"), { window, TextEncoder, setTimeout });
    return { get addon() { return addon; }, requests };
}
test('DeepL only exposes translation and preserves blanks, instrumental markers and vocal parts', async () => {
    const h = harness();
    const output = await h.addon.translateLyrics({ text: '\none / two\n[Instrumental]\nthree\n', lang: 'zh-TW' });
    assert.deepEqual(Array.from(output.translation), ['', 'T:one / T:two', '[Instrumental]', 'T:three', '']);
    assert.equal(h.requests[0].body.target_lang, 'ZH-HANT');
    assert.deepEqual(h.requests[0].body.text, ['one', 'two', 'three']);
    assert.equal(h.requests[0].headers.Authorization, 'DeepL-Auth-Key fake-key:fx');
    for (const feature of ['pronunciation', 'tmi', 'researchWebSearch', 'lyricsStudy', 'characterPronunciation', 'culturalAnnotations']) assert.equal(h.addon.supports[feature], false);
    await assert.rejects(h.addon.translateLyrics({ text: 'one', wantSmartPhonetic: true }), /not supported/);
});
test('large sets batch at 50 and retain their order', async () => {
    const h = harness();
    const output = await h.addon.translateLyrics({ text: Array.from({ length: 104 }, (_, i) => String(i)).join('\n'), lang: 'ko' });
    assert.deepEqual(h.requests.map(r => r.body.text.length), [50, 50, 4]);
    assert.equal(output.translation[103], 'T:103');
});
test('Free and Pro keys select their DeepL API through the default Spicetify CORS proxy', async () => {
    for (const [key, host] of [['fake-key:fx', 'api-free.deepl.com'], ['fake-pro-key', 'api.deepl.com']]) {
        const h = harness(null, key);
        assert.equal(await h.addon.testConnection(), true);
        const request = h.requests[0];
        assert.equal(request.url, `https://cors-proxy.spicetify.app/https://${host}/v2/translate`);
        assert.equal(request.url.includes(key), false);
        assert.equal(request.method, 'POST');
        assert.equal(request.credentials, 'omit');
        assert.equal(request.headers.Authorization, `DeepL-Auth-Key ${key}`);
        assert.equal(request.headers['Content-Type'], 'application/json');
        assert.deepEqual(request.body, { text: ['Hello'], target_lang: 'KO', preserve_formatting: true });
    }
});
test('DeepL honors the user-configured Spicetify CORS proxy', async () => {
    const h = harness(null, 'fake-key:fx', { getItem(name) {
        assert.equal(name, 'spicetify:corsProxyTemplate');
        return 'https://proxy.example.test/{url}';
    } });
    await h.addon.translateMetadata({ title: 'Title', artist: 'Artist', lang: 'en' });
    assert.equal(h.requests[0].url, 'https://proxy.example.test/https://api-free.deepl.com/v2/translate');
    assert.deepEqual(h.requests[0].body.text, ['Title', 'Artist']);
});
test('an unavailable or empty proxy setting falls back to Spicetify while invalid templates fail before sending', async () => {
    for (const localStorage of [{ getItem() { throw new Error('Storage unavailable'); } }, { getItem: () => '' }]) {
        const h = harness(null, 'fake-key:fx', localStorage);
        await h.addon.testConnection();
        assert.equal(h.requests[0].url, 'https://cors-proxy.spicetify.app/https://api-free.deepl.com/v2/translate');
    }
    const invalid = harness(null, 'fake-key:fx', { getItem: () => 'https://proxy.example.test/' });
    await assert.rejects(invalid.addon.testConnection(), /Invalid Spicetify CORS proxy template/);
    assert.equal(invalid.requests.length, 0);
});
test('missing key, quota errors and malformed partial responses fail without claiming completion', async () => {
    await assert.rejects(harness(null, '').addon.testConnection(), /key is required/);
    await assert.rejects(harness(() => Response.json({}, { status: 456 })).addon.testConnection(), /456/);
    await assert.rejects(harness(() => Response.json({ translations: [] })).addon.testConnection(), /Invalid/);
});

test('DeepL settings use the shared field row with an associated password label and help text', () => {
    let addon;
    const saved = [];
    const React = {
        createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
        useState: value => [typeof value === 'function' ? value() : value, () => {}],
    };
    const window = { AIAddonManager: {
        register: value => { addon = value; },
        getAddonSetting: () => 'fixture-key',
        setAddonSetting: (...args) => saved.push(args),
    } };
    vm.runInNewContext(readAiProviderFixture("Addon_AI_DeepL.js"), {
        window, Spicetify: { React }, TextEncoder, setTimeout,
    });
    const tree = addon.getSettingsUI()();
    const row = tree.props.children[0];
    assert.equal(row.props.className, 'ai-addon-setting');
    const [label, input, help] = row.props.children;
    assert.equal(label.props.htmlFor, input.props.id);
    assert.equal(input.props['aria-describedby'], help.props.id);
    assert.equal(input.props.type, 'password');
    assert.equal(input.props.value, 'fixture-key');
    input.props.onChange({ target: { value: ' new-key ' } });
    assert.equal(saved.length, 1);
    assert.equal(saved[0][1], 'api-key');
    assert.equal(saved[0][2], 'new-key');
});
