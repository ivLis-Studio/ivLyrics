import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

// Perplexity retired Sonar Chat Completions on 2026-09-27; the addon speaks the Agent API.
const source = readFileSync(new URL('../Addon_AI_Perplexity.js', import.meta.url), 'utf8');
const AGENT_URL = 'https://api.perplexity.ai/v1/agent';
const MODELS_URL = 'https://api.perplexity.ai/v1/models';

const json = (value, status = 200) => new Response(JSON.stringify(value), {
    status, headers: { 'Content-Type': 'application/json' }
});
const sse = events => new Response(events.map(event => 'data: ' + JSON.stringify(event) + '\n\n').join(''), {
    headers: { 'Content-Type': 'text/event-stream' }
});
const completed = (...texts) => ({
    id: 'resp_test', object: 'response', status: 'completed',
    output: [
        { type: 'search_results', queries: [], results: [] },
        { type: 'message', role: 'assistant', content: texts.map(text => ({ type: 'output_text', text, annotations: [] })) }
    ]
});
const flush = async () => { for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve)); };

function harness(initial = {}, agent = () => json(completed('OK')), models = () => json({ object: 'list', data: [] })) {
    const settings = new Map(Object.entries({ 'api-keys': 'key-1', ...initial }));
    const requests = [];
    let addon;
    const states = [], effects = [], pending = [];
    let stateIndex = 0, effectIndex = 0;
    const React = {
        useState(value) {
            const index = stateIndex++;
            if (!(index in states)) states[index] = value;
            return [states[index], next => { states[index] = typeof next === 'function' ? next(states[index]) : next; }];
        },
        useCallback: fn => fn,
        useEffect(fn, deps) {
            const index = effectIndex++;
            if (!effects[index] || deps.some((dep, i) => dep !== effects[index].deps[i])) {
                pending.push(() => { effects[index] = { deps, cleanup: fn() }; });
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
            const request = { url, ...options, body: options.body ? JSON.parse(options.body) : undefined };
            requests.push(request);
            if (url === MODELS_URL) return models(request);
            if (url === AGENT_URL) return agent(request, requests.filter(item => item.url === AGENT_URL).length);
            throw new Error('Unexpected URL ' + url);
        },
    };
    vm.runInNewContext(source, { window, Spicetify: { React }, TextDecoder, setTimeout, clearTimeout, console });
    const Component = addon.getSettingsUI();
    return {
        settings, addon,
        agentRequests: () => requests.filter(item => item.url === AGENT_URL),
        modelRequests: () => requests.filter(item => item.url === MODELS_URL),
        render() {
            stateIndex = 0; effectIndex = 0;
            const tree = Component();
            pending.splice(0).forEach(run => run());
            return tree;
        },
    };
}
function nodes(tree, predicate) {
    if (!tree || typeof tree !== 'object') return [];
    return [...(predicate(tree) ? [tree] : []), ...tree.children.flatMap(child => nodes(child, predicate))];
}

test('a saved Sonar model migrates and requests use the Agent API contract', async () => {
    const h = harness({ model: 'sonar-pro' }, () => json(completed('{"translatedTitle":"Titre",', '"translatedArtist":"Artiste"}')));
    assert.equal(h.settings.get('model'), 'perplexity/sonar');

    const result = await h.addon.translateMetadata({
        title: 'Title', artist: 'Artist',
        metadataPrompt: { systemPrompt: 'Translate.', userPrompt: 'Title by Artist' }
    });
    assert.deepEqual({ ...result.translated }, { title: 'Titre', artist: 'Artiste' });

    const [request] = h.agentRequests();
    assert.equal(request.method, 'POST');
    assert.equal(request.headers.Authorization, 'Bearer key-1');
    // Strict mode: Sonar fields (messages, max_tokens, search options) would be a 400.
    assert.deepEqual({ ...request.body }, {
        model: 'perplexity/sonar', input: 'Title by Artist', instructions: 'Translate.',
        max_output_tokens: 16000, temperature: 0.3, store: false
    });
});

test('403 and 429 keep the server message and fall through to the next key', async () => {
    const limited = request => request.headers.Authorization === 'Bearer key-1'
        ? json({ error: { message: 'Access to this model is not enabled for this key', type: 'forbidden', code: 403 } }, 403)
        : json(completed('Hello'));
    const rotated = harness({ 'api-keys': '["key-1","key-2"]' }, limited);
    assert.deepEqual([...await rotated.addon.translateLyrics({ text: 'hi', lang: 'ko', translationPrompt: 'p' }).then(r => r.translation)], ['Hello']);
    assert.deepEqual(rotated.agentRequests().map(r => r.headers.Authorization), ['Bearer key-1', 'Bearer key-2']);

    const single = harness({}, limited);
    await assert.rejects(single.addon.translateLyrics({ text: 'hi', lang: 'ko', translationPrompt: 'p' }),
        error => /not enabled for this key \(HTTP 403\)/.test(error.message) && !/exhausted/.test(error.message));
});

test('401, HTTP-200 failures and truncation reject with their reason', async () => {
    const unauthorized = harness({ 'api-keys': '["key-1","key-2"]' }, () => json({ error: { message: 'Invalid API key provided.', code: 401 } }, 401));
    await assert.rejects(unauthorized.addon.translateLyrics({ text: 'x', lang: 'ko', translationPrompt: 'p' }), /Invalid API key provided/);
    assert.equal(unauthorized.agentRequests().length, 1);

    const failed = harness({}, () => json({ status: 'failed', error: { message: 'model not supported' }, output: [] }));
    await assert.rejects(failed.addon.translateLyrics({ text: 'x', lang: 'ko', translationPrompt: 'p' }), /model not supported/);

    const truncated = harness({}, () => json({ status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output: [] }));
    await assert.rejects(truncated.addon.translateLyrics({ text: 'x', lang: 'ko', translationPrompt: 'p' }), /max_output_tokens/);
});

test('a model that rejects temperature is sent once more without it', async () => {
    const h = harness({}, (request, count) => count === 1
        ? json({ error: { message: 'Unsupported parameter: temperature', type: 'invalid_parameter', code: 400 } }, 400)
        : json(completed('Hi')));
    await h.addon.translateLyrics({ text: 'x', lang: 'ko', translationPrompt: 'p' });
    const [first, second] = h.agentRequests();
    assert.equal(first.body.temperature, 0.3);
    assert.equal('temperature' in second.body, false);
});

test('streamed translations read typed events and need a terminal event', async () => {
    const events = [
        { type: 'response.created' },
        { type: 'response.output_text.delta', delta: 'First\n' },
        { type: 'response.output_text.delta', delta: 'Second' },
        { type: 'response.output_text.done', text: 'First\nSecond' },
        { type: 'response.completed', response: completed('First\nSecond') }
    ];
    const h = harness({}, () => sse(events));
    const lines = [];
    const result = await h.addon.translateLyrics({ text: 'a\nb', lang: 'ko', translationPrompt: 'p', onLine: (i, line) => lines.push([i, line]) });
    assert.deepEqual([...result.translation], ['First', 'Second']);
    assert.deepEqual(lines, [[0, 'First'], [1, 'Second']]);
    assert.equal(h.agentRequests()[0].body.stream, true);
    assert.equal('tools' in h.agentRequests()[0].body, false);

    const cut = harness({}, () => sse(events.slice(0, 3)));
    await assert.rejects(cut.addon.translateLyrics({ text: 'a\nb', lang: 'ko', translationPrompt: 'p', onLine() {} }), /missing_completion/);

    const failed = harness({}, () => sse([events[1], { type: 'response.failed', response: { status: 'failed', error: { message: 'upstream model error' } } }]));
    await assert.rejects(failed.addon.translateLyrics({ text: 'a\nb', lang: 'ko', translationPrompt: 'p', onLine() {} }), /upstream model error/);

    // ivLyricsFetch's CORS fallback answers a stream with one buffered Response object.
    const buffered = harness({}, () => json(completed('First\nSecond')));
    const bufferedResult = await buffered.addon.translateLyrics({ text: 'a\nb', lang: 'ko', translationPrompt: 'p', onLine() {} });
    assert.deepEqual([...bufferedResult.translation], ['First', 'Second']);
});

test('research offers web search only when asked and drops citation markers', async () => {
    const answer = () => sse([
        { type: 'response.output_text.delta', delta: '{"trivia":["Recorded in 2006.[web:1][web:3]"]}' },
        { type: 'response.completed', response: completed('') }
    ]);
    const h = harness({}, answer);
    const research = await h.addon.generateTMI({ title: 'T', artist: 'A', tmiPrompt: 'p' });
    assert.equal(research.trivia[0], 'Recorded in 2006.');
    const body = h.agentRequests()[0].body;
    assert.deepEqual([...body.tools].map(tool => ({ ...tool })), [{ type: 'web_search' }]);
    for (const sonarField of ['search_mode', 'web_search_options', 'disable_search', 'return_images', 'messages', 'max_tokens']) {
        assert.equal(sonarField in body, false, sonarField);
    }

    const offline = harness({}, answer);
    await offline.addon.generateTMI({ title: 'T', artist: 'A', tmiPrompt: 'p', webSearch: false });
    assert.equal('tools' in offline.agentRequests()[0].body, false);
});

test('models load from /v1/models and a retired saved model gives way to the default', async () => {
    const catalog = () => json({ object: 'list', data: [
        { id: 'openai/gpt-6-luna', object: 'model', owned_by: 'openai' },
        { id: 'anthropic/claude-sonnet-5-5', display_name: 'Claude Sonnet 5.5' },
        { id: 'perplexity/kimi-k3' },
        { id: 'perplexity/sonar' },
        { id: 'sonar' },
        { id: 'perplexity/sonar' }
    ] });
    const h = harness({ model: 'openai/gpt-5' }, undefined, catalog);
    h.render();
    await flush();
    const tree = h.render();
    const [modelRequest] = h.modelRequests();
    assert.equal(modelRequest.headers.Authorization, 'Bearer key-1');
    const select = nodes(tree, node => node.type === 'select')[0];
    assert.deepEqual(select.children.map(option => option.props.value),
        ['perplexity/sonar', 'perplexity/kimi-k3', 'anthropic/claude-sonnet-5-5', 'openai/gpt-6-luna']);
    assert.equal(select.props.value, 'perplexity/sonar');
    assert.equal(h.settings.get('model'), 'perplexity/sonar');

    const kept = harness({ model: 'openai/gpt-6-luna' }, undefined, catalog);
    kept.render();
    await flush();
    assert.equal(nodes(kept.render(), node => node.type === 'select')[0].props.value, 'openai/gpt-6-luna');
    assert.equal(kept.settings.get('model'), 'openai/gpt-6-luna');
});
