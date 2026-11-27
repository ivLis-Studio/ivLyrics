import assert from 'node:assert/strict';
import { createAIRequest } from "../src/providers/ai/AIRequest.js";
import test from 'node:test';

const BASE = 'https://integrate.api.nvidia.com/v1';
const DEFAULT_PROXY = 'https://cors-proxy.spicetify.app/';

function setup(responder, localStorage) {
    const requests = [];
    let cosmosCalls = 0;
    const window = {
        localStorage,
        fetch: async (url, options) => {
            requests.push({ url, options });
            return responder(url, options, requests.length);
        },
        Spicetify: { CosmosAsync: { request: async () => {
            cosmosCalls++;
            throw new Error('Resolver not found!');
        } } }
    };
    const fetch = createAIRequest({ host: window, getSpicetify: () => window.Spicetify });
    return { fetch, requests, get cosmosCalls() { return cosmosCalls; } };
}

function blockedDirectThen(reply) {
    return (url, options, count) => {
        if (count === 1) throw new TypeError('Failed to fetch (integrate.api.nvidia.com)');
        return reply;
    };
}

test('NIM model discovery retries through Spicetify with the API key in headers and cookies omitted', async () => {
    const h = setup(blockedDirectThen(Response.json({ data: [{ id: 'nvidia/chat-model' }] })));
    const response = await h.fetch(`${BASE}/models`, { method: 'GET', headers: { Authorization: 'Bearer synthetic-nim-key' } });
    assert.deepEqual(await response.json(), { data: [{ id: 'nvidia/chat-model' }] });
    const [direct, proxy] = h.requests;
    assert.equal(direct.url, `${BASE}/models`);
    assert.equal(proxy.url, `${DEFAULT_PROXY}${BASE}/models`);
    assert.equal(proxy.options.method, 'GET');
    assert.equal(proxy.options.headers.Authorization, 'Bearer synthetic-nim-key');
    assert.equal(proxy.options.credentials, 'omit');
    assert.equal(proxy.options.signal, direct.options.signal);
    assert.doesNotMatch(proxy.url, /synthetic-nim-key/);
    assert.equal(h.cosmosCalls, 0);
});

test('NIM proxy preserves chat request parameters and delivers SSE chunks before completion', async () => {
    let streamController;
    const upstream = new Response(new ReadableStream({ start(controller) { streamController = controller; } }), {
        headers: { 'Content-Type': 'text/event-stream' }
    });
    const h = setup(blockedDirectThen(upstream));
    const body = JSON.stringify({ model: 'nvidia/chat-model', messages: [{ role: 'user', content: 'test' }], stream: true, max_tokens: 16000 });
    const response = await h.fetch(`${BASE}/chat/completions`, {
        method: 'POST', headers: { Authorization: 'Bearer synthetic-nim-key', 'Content-Type': 'application/json' }, body
    });
    assert.equal(response, upstream);
    assert.equal(response.headers.get('content-type'), 'text/event-stream');
    const reader = response.body.getReader();
    const chunk = 'data: {"choices":[{"delta":{"content":"OK"}}]}\n\n';
    streamController.enqueue(new TextEncoder().encode(chunk));
    assert.equal(new TextDecoder().decode((await reader.read()).value), chunk);
    streamController.close();
    assert.equal((await reader.read()).done, true);
    const proxy = h.requests[1];
    assert.equal(proxy.url, `${DEFAULT_PROXY}${BASE}/chat/completions`);
    assert.equal(proxy.options.body, body);
    assert.equal(proxy.options.headers['Content-Type'], 'application/json');
    assert.equal(proxy.options.headers.Authorization, 'Bearer synthetic-nim-key');
    assert.equal(h.cosmosCalls, 0);
});

test('NIM honors the configured Spicetify CORS proxy and handles unavailable settings', async () => {
    for (const [storage, prefix] of [
        [{ getItem(name) { assert.equal(name, 'spicetify:corsProxyTemplate'); return 'https://proxy.example.test/{url}'; } }, 'https://proxy.example.test/'],
        [{ getItem() { throw new Error('Storage unavailable'); } }, DEFAULT_PROXY],
        [{ getItem: () => '' }, DEFAULT_PROXY]
    ]) {
        const h = setup(blockedDirectThen(Response.json({ data: [] })), storage);
        await h.fetch(`${BASE}/models`);
        assert.equal(h.requests[1].url, `${prefix}${BASE}/models`);
    }
});

test('HTTP authentication and quota failures remain visible without resending through the proxy', async () => {
    for (const status of [401, 403, 404, 429]) {
        const upstream = Response.json({ error: { message: 'NVIDIA error' } }, { status });
        const h = setup(() => upstream);
        assert.equal(await h.fetch(`${BASE}/models`), upstream);
        assert.equal(h.requests.length, 1);
        assert.equal(h.cosmosCalls, 0);
    }
});

test('NIM aborts and proxy errors do not fall back to the unresolved Cosmos host', async () => {
    const aborted = new DOMException('Aborted', 'AbortError');
    const nativeAbort = setup(() => { throw aborted; });
    await assert.rejects(nativeAbort.fetch(`${BASE}/models`), error => error === aborted);
    assert.equal(nativeAbort.requests.length, 1);
    const proxyFailure = setup((url, options, count) => {
        throw new TypeError(count === 1 ? 'Failed to fetch' : 'Relay unavailable');
    });
    await assert.rejects(proxyFailure.fetch(`${BASE}/models`), /Spicetify CORS proxy failed: Relay unavailable/);
    assert.equal(proxyFailure.requests.length, 2);
    assert.equal(proxyFailure.cosmosCalls, 0);
});

test('NIM validates the proxy template before attempting the relay request', async () => {
    for (const template of ['https://proxy.example.test/', 'file:///{url}']) {
        const h = setup(blockedDirectThen(Response.json({})), { getItem: () => template });
        await assert.rejects(h.fetch(`${BASE}/models`), /Spicetify CORS proxy/);
        assert.equal(h.requests.length, 1);
        assert.equal(h.cosmosCalls, 0);
    }
});

test('other provider requests that work directly keep their URL and transport', async () => {
    const upstream = Response.json({ choices: [{ message: { content: 'OK' } }] });
    const h = setup(() => upstream);
    const url = 'https://api.openai.com/v1/chat/completions';
    assert.equal(await h.fetch(url, { method: 'POST' }), upstream);
    assert.equal(h.requests.length, 1);
    assert.equal(h.requests[0].url, url);
});

test('invalid or throwing diagnostics cannot prevent the Cosmos transport fallback', async () => {
    for (const logger of [true, () => { throw new Error('Diagnostics hook failed'); }]) {
        const host = {
            __ivLyricsDebugLog: logger,
            fetch: async () => { throw new TypeError('Failed to fetch'); },
        };
        let calls = 0;
        const spicetify = { CosmosAsync: { request: async () => {
            calls++;
            return { status: 200, body: { answer: 'ok' } };
        } } };
        const request = createAIRequest({ host, getSpicetify: () => spicetify });
        const response = await request('https://provider.example.test/v1/chat/completions');
        assert.deepEqual(await response.json(), { answer: 'ok' });
        assert.equal(calls, 1);
    }
});

test('Cosmos fallback diagnostics avoid logging credentials from the request URL', async () => {
    const logs = [];
    const url = 'https://provider.example.test/v1/models/test:streamGenerateContent?alt=sse&key=fixture-secret';
    const host = {
        __ivLyricsDebugLog: (...args) => logs.push(args.join(' ')),
        fetch: async () => { throw new TypeError('Failed to fetch'); },
    };
    const request = createAIRequest({ host, getSpicetify: () => ({ CosmosAsync: {
        async request(_method, actualUrl) {
            assert.equal(actualUrl, url);
            return { status: 200, body: { answer: 'ok' } };
        },
    } }) });

    assert.deepEqual(await (await request(url)).json(), { answer: 'ok' });
    assert.equal(logs.length, 1);
    assert.match(logs[0], /provider\.example\.test/);
    assert.doesNotMatch(logs[0], /fixture-secret/);
});

test('signal composition without AbortSignal.any releases the surviving listener', async t => {
    const caller = new AbortController();
    const deadline = new AbortController();
    t.mock.method(AbortSignal, 'timeout', () => deadline.signal);
    const any = Object.getOwnPropertyDescriptor(AbortSignal, 'any');
    Object.defineProperty(AbortSignal, 'any', { ...any, value: undefined });
    t.after(() => Object.defineProperty(AbortSignal, 'any', any));

    const callerRemove = t.mock.method(caller.signal, 'removeEventListener');
    const deadlineRemove = t.mock.method(deadline.signal, 'removeEventListener');
    const h = setup(() => new Response('stream'));

    await h.fetch(`${BASE}/chat/completions`, { signal: caller.signal });
    const { signal } = h.requests[0].options;
    assert.equal(signal.aborted, false);

    const timeout = new DOMException('Timed out', 'TimeoutError');
    deadline.abort(timeout);
    assert.equal(signal.reason, timeout);
    assert.equal(callerRemove.mock.callCount(), 1);
    assert.equal(deadlineRemove.mock.callCount(), 1);
});
