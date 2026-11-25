import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import test from 'node:test';
import { createTranslator } from '#ivlyrics/lyrics/createTranslator.mjs';
import { createAIAddonManager } from '#ivlyrics/providers/ai/createAIAddonManager.mjs';
import { createAIRequest } from '#ivlyrics/providers/ai/AIRequest.js';
import initializePollinationsAddon from '#ivlyrics/providers/ai/Addon_AI_Pollinations.js';
import { callAiProvider } from '#ivlyrics/providers/ai/aiProviderRequests.mjs';
import { runParallelBatches } from '#ivlyrics/providers/ai/pronunciationPolicy.mjs';

test('retiring a lyric translation closes its HTTP stream without retrying or starting fallback', { timeout: 5000 }, async context => {
    let posts = 0, fallbackCalls = 0;
    const disconnected = Promise.withResolvers();
    const server = createServer((request, response) => {
        request.resume();
        if (++posts === 1) {
            response.once('close', disconnected.resolve);
            response.writeHead(200, { 'Content-Type': 'text/event-stream' });
            response.write('data: {"choices":[{"delta":{"content":"Old line\\n"}}]}\n\n');
            return;
        }
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ choices: [{ message: { content: 'Fresh line' }, finish_reason: 'stop' }] }));
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    context.after(() => { server.closeAllConnections(); server.close(); });
    const host = { fetch: (_url, init) => fetch(`http://127.0.0.1:${server.address().port}`, init) };
    const request = createAIRequest({ host, getSpicetify: () => null });
    const storage = new Map();
    const manager = createAIAddonManager({
        getStoredValue: key => storage.get(key),
        setStoredValue: (key, value) => storage.set(key, value),
        getI18n: () => null, getAddonDebug: () => null, debug() {},
    });
    const services = {
        getManager: () => manager, getAiRequest: () => request,
        registerAiAddon: addon => manager.register(addon), debug() {},
    };
    initializePollinationsAddon(services);
    manager.setAddonSetting('pollinations', 'api-keys', ['fixture-key']);
    manager.setProviderEnabled('pollinations', true);
    manager.register({
        id: 'fixture-fallback', name: 'Fixture fallback', author: 'Fixture', description: 'Fixture', version: '1',
        supports: { translate: true }, getSettingsUI() {},
        translateLyrics() { fallbackCalls++; return { translation: ['Fallback'] }; },
    });
    manager.setProviderEnabled('fixture-fallback', true);
    manager.setProviderOrder(['pollinations', 'fixture-fallback']);
    const stored = [];
    const translator = createTranslator({
        LocalLanguageConverter: class {}, getAIManager: () => manager,
        getTargetLanguage: () => 'en', getPronunciationSlots: () => null,
        detectLyricsLanguage: () => 'ja', debug() {},
        cache: { getTranslation: async () => null, setTranslation: async (...args) => stored.push(args[3]) },
    });
    const started = Promise.withResolvers();
    const observed = [];
    const params = { trackId: 'fixture', text: 'テスト', onLine: (index, text) => {
        observed.push([index, text]);
        started.resolve();
    } };
    const obsolete = translator.callGemini(params);
    await started.promise;
    translator.clearMemoryCache(params.trackId);
    assert.equal(await obsolete, null);
    await disconnected.promise;
    assert.equal(posts, 1);
    assert.equal(fallbackCalls, 0);
    assert.deepEqual(observed, [[0, 'Old line']]);
    assert.deepEqual(stored, []);

    assert.deepEqual(await translator.callGemini({ ...params, onLine: null }), { translation: ['Fresh line'] });
    assert.deepEqual(stored, [{ translation: ['Fresh line'] }]);
    assert.equal(posts, 2);
});

test('a provider deadline with a caller signal also aborts the provider transport', async context => {
    context.mock.timers.enable({ apis: ['setTimeout'] });
    const caller = new AbortController();
    const started = Promise.withResolvers();
    const addon = { id: 'fixture', translateLyrics({ signal }) {
        started.resolve(signal);
        return new Promise(() => {});
    } };
    const value = callAiProvider(addon, 'translateLyrics', { signal: caller.signal });
    const providerSignal = await started.promise;
    context.mock.timers.tick(95_000);
    await assert.rejects(value, { name: 'TimeoutError', message: 'fixture translateLyrics timed out' });
    assert.equal(providerSignal.aborted, true);
    assert.equal(caller.signal.aborted, false);
});

test('a provider deadline also stops requests whose callers have no signal', async context => {
    context.mock.timers.enable({ apis: ['setTimeout'] });
    const started = Promise.withResolvers();
    const addon = { id: 'fixture', translateLyrics({ signal }) {
        started.resolve(signal);
        return new Promise(() => {});
    } };
    const value = callAiProvider(addon, 'translateLyrics', {});
    const providerSignal = await started.promise;
    context.mock.timers.tick(95_000);
    const error = await value.catch(reason => reason);
    assert.equal(error.name, 'TimeoutError');
    assert.equal(providerSignal?.reason, error);
});

test('cancelling Research stops the HTTP stream during search and generation without starting fallback', { timeout: 5000 }, async context => {
    for (const heldPhase of ['search', 'article']) {
        let fallbackCalls = 0;
        const phases = [];
        const started = Promise.withResolvers(), disconnected = Promise.withResolvers();
        const server = createServer(async (request, response) => {
            const chunks = [];
            for await (const chunk of request) chunks.push(chunk);
            const body = JSON.parse(Buffer.concat(chunks));
            const phase = body.model === 'gemini-search' ? 'search' : 'article';
            phases.push(phase);
            response.writeHead(200, { 'Content-Type': 'text/event-stream' });
            response.write('data: {"choices":[{"delta":{"content":"Fixture research"}}]}\n\n');
            if (phase === heldPhase) {
                response.once('close', disconnected.resolve);
                started.resolve();
            } else {
                response.end('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');
            }
        });
        server.listen(0, '127.0.0.1');
        await once(server, 'listening');
        context.after(() => { server.closeAllConnections(); server.close(); });
        const host = { fetch: (_url, init) => fetch(`http://127.0.0.1:${server.address().port}`, init) };
        const stored = new Map();
        const manager = createAIAddonManager({
            getStoredValue: key => stored.get(key),
            setStoredValue: (key, value) => stored.set(key, value),
            getI18n: () => null, getAddonDebug: () => null, debug() {},
        });
        initializePollinationsAddon({
            getManager: () => manager,
            getAiRequest: () => createAIRequest({ host, getSpicetify: () => null }),
            registerAiAddon: addon => manager.register(addon), debug() {},
        });
        manager.setAddonSetting('pollinations', 'api-keys', ['fixture-key']);
        manager.setProviderEnabled('pollinations', true);
        manager.register({
            id: 'fixture-fallback', name: 'Fixture fallback', author: 'Fixture', description: 'Fixture', version: '1',
            supports: { research: true }, getSettingsUI() {},
            generateTMI() { fallbackCalls++; return { title: 'Fallback' }; },
        });
        manager.setProviderEnabled('fixture-fallback', true);
        manager.setProviderOrder(['pollinations', 'fixture-fallback']);
        const controller = new AbortController();
        const pending = manager.generateResearch({ title: 'Test song', artist: 'Test artist', signal: controller.signal });
        await started.promise;
        controller.abort();
        await assert.rejects(pending, { name: 'AbortError' });
        await disconnected.promise;
        assert.deepEqual(phases, heldPhase === 'search' ? ['search'] : ['search', 'article']);
        assert.equal(fallbackCalls, 0);
    }
});

test('cancellation releases a pending Cosmos fallback with the original reason', async () => {
    const started = Promise.withResolvers();
    const controller = new AbortController();
    const host = { async fetch() { throw new TypeError('Failed to fetch'); } };
    const request = createAIRequest({ host, getSpicetify: () => ({ CosmosAsync: {
        request() {
            started.resolve();
            return new Promise(() => {});
        },
    } }) });
    const response = request('https://fixture.example.test/prompt', { signal: controller.signal });
    await started.promise;
    const error = new DOMException('Cancelled by caller', 'AbortError');
    controller.abort(error);
    await assert.rejects(response, reason => reason === error);
});

test('cancelling while a pronunciation batch waits for a retry does not launch more batches', async () => {
    const controller = new AbortController();
    const waiting = Promise.withResolvers();
    const called = [];
    const errors = runParallelBatches([1, 2], batch => {
        called.push(batch);
        throw Object.assign(new Error('rate limit'), { status: 429 });
    }, {
        limit: 1, signal: controller.signal,
        wait(_delay, signal) {
            waiting.resolve();
            return new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
        },
    });
    await waiting.promise;
    controller.abort();
    assert.equal((await errors)[0].superseded, true);
    assert.deepEqual(called, [1]);
});
