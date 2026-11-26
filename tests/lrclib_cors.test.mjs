import { createSyncCreatorLrclibClient } from '#ivlyrics/features/sync/syncCreatorLrclibClient.mjs';
import { getRuntimeService as getEditorRuntimeService } from '../src/spicetify/runtimeServices.mjs';
import { bundleInitializer } from "./fixtures/initializer-bundle.mjs";
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getEventListeners } from 'node:events';
import test from 'node:test';
import vm from 'node:vm';

const BASE = 'https://lrclib.net/api';
const GET_URL = `${BASE}/get/18694795`;
const PROXY = 'https://cors-proxy.spicetify.app/';
// Expose the private ID parser only in the VM harness.
const addonSource = bundleInitializer(new URL('../src/providers/lyrics/Addon_Lyrics_Lrclib.js', import.meta.url), {
    transformSource(source) {
        const marker = '    registerLyricsAddon(LrclibLyricsAddon, window);';
        assert.ok(source.includes(marker));
        return 'import initializeManager from "./LyricsAddonManager.js";\n'
            + source.replace(marker, `    window.fetchCandidateById = fetchLrclibCandidateById;\n${marker}`)
            + '\nwindow.initializeFixtureLyricsManager = initializeManager;\n';
    }
});
import inputs from '../src/spicetify/inputs.json' with { type: 'json' };
import { sourcePath } from './fixtures/source-paths.mjs';
const track = { uri: 'spotify:track:test', title: 'Test Song', artist: 'Test Artist', album: 'Test Album', duration: 180000 };
const candidate = {
    id: 18694795, trackName: track.title, artistName: track.artist, albumName: track.album,
    duration: 180, instrumental: false, syncedLyrics: '[00:01.00]First line\n[00:02.00]Second line',
    plainLyrics: 'First line\nSecond line'
};

function setup(responder, { localStorage, syncData, managerReady = true, storedValues = [] } = {}) {
    const requests = [];
    const timers = new Map();
    const stored = new Map(storedValues);
    let now = 0;
    let nextTimer = 0;
    let addon;
    const fetch = async (url, options) => {
        requests.push({ url, options });
        return responder(url, options, requests.length);
    };
    const window = {
        fetch, localStorage,
        LyricsAddonManager: managerReady ? { register(value) {
            assert.equal(typeof window.IvLyricsLrclibTransport?.fetch, 'function', 'transport exists before registration');
            addon = value;
        } } : undefined,
        LyricsService: { extractTrackId: () => 'test' },
        SyncDataService: { getSyncData: async () => syncData }
    };
    const context = vm.createContext({
        window, fetch, console, getEditorRuntimeService, Spicetify: {
            Config: { version: 'test' },
            LocalStorage: { get: key => stored.get(key) ?? null, set: (key, value) => stored.set(key, value) }
        },
        URL, URLSearchParams, Headers, AbortController, AbortSignal, performance,
        setTimeout(callback, delay) {
            const id = ++nextTimer;
            timers.set(id, { callback, deadline: now + delay });
            return id;
        },
        clearTimeout(id) { timers.delete(id); }
    });
    vm.runInContext(addonSource, context);
    return {
        get addon() { return addon || window.LyricsAddonManager?.getAddon?.('lrclib'); },
        window, requests, timers, fetch: window.IvLyricsLrclibTransport.fetch, fetchCandidate: window.fetchCandidateById,
        loadManager() {
            window.initializeFixtureLyricsManager();
            return window.LyricsAddonManager;
        },
        loadEditorWrapper() {
            const { fetchLrclib } = createSyncCreatorLrclibClient({
                getTransport: () => getEditorRuntimeService('IvLyricsLrclibTransport', window),
            });
            return fetchLrclib;
        },
        elapse(ms) {
            now += ms;
            for (const [id, timer] of timers) {
                if (timer.deadline <= now) {
                    timers.delete(id);
                    timer.callback();
                }
            }
        }
    };
}

const blockedThen = response => (url, options, count) => {
    if (count === 1) throw new TypeError('Failed to fetch');
    return response;
};
const waitForAbort = signal => new Promise((resolve, reject) => {
    if (signal.aborted) reject(signal.reason);
    else signal.addEventListener('abort', () => reject(signal.reason), { once: true });
});
const deferred = () => {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
};

test('frozen transport and actual editor wrapper work before delayed manager registration', async () => {
    const h = setup(blockedThen(Response.json(candidate)), { managerReady: false });
    const transport = h.window.IvLyricsLrclibTransport;
    assert.equal(Object.isFrozen(transport), true);
    assert.deepEqual(Object.keys(transport), ['fetch']);
    assert.equal(h.window.LyricsAddonManager, undefined);
    assert.equal(h.addon, undefined);
    const editorFetch = h.loadEditorWrapper();
    assert.deepEqual(await (await editorFetch(GET_URL)).json(), candidate);
    assert.equal(h.requests.length, 2);
    assert.equal(h.requests[1].url, `${PROXY}${GET_URL}`);
    assert.equal(h.window.LyricsAddonManager, undefined, 'transport never waits for the manager');
    assert.equal(h.timers.size, 0, 'no registration timer while the manager is absent');

    const manager = h.loadManager();
    assert.equal(manager.getAddon('lrclib'), null);
    h.elapse(100);
    assert.equal(manager.getAddon('lrclib').id, 'lrclib');
    assert.equal(h.window.IvLyricsLrclibTransport, transport);
    assert.equal(h.timers.size, 0);
});

test('actual disabled manager leaves editor ID/search CORS recovery available through the manifest extension', async () => {
    assert.ok(inputs.startup.includes(sourcePath('Addon_Lyrics_Lrclib.js')));
    assert.ok(inputs.startup.indexOf(sourcePath('Addon_Lyrics_Lrclib.js'))
        < inputs.startup.indexOf(sourcePath('LyricsAddonManager.js')));
    const composePath = sourcePath('composePageMenus.js');
    const page = readFileSync(new URL("../" + sourcePath("index.js"), import.meta.url), "utf8");
    assert.match(page, /import \{ startPageMenus \} from "#ivlyrics\/spicetify\/composePageMenus.js"/);
    assert.match(page, /} = startPageMenus\(/);
    const compose = readFileSync(new URL('../' + composePath, import.meta.url), 'utf8');
    assert.match(compose, /import \{ createSyncDataCreator \} from "#ivlyrics\/features\/sync\/SyncDataCreator.js"/);
    const h = setup(url => {
        if (!url.startsWith(PROXY)) throw new TypeError('Failed to fetch');
        return Response.json(url.includes('/search?') ? [candidate] : candidate);
    }, { managerReady: false, storedValues: [['ivLyrics:lyrics:enabled:lrclib', 'false']] });
    const transport = h.window.IvLyricsLrclibTransport;
    const manager = h.loadManager();
    h.elapse(100);
    assert.equal(manager.isProviderEnabled('lrclib'), false);
    assert.equal(manager.getEnabledProviders().length, 0);
    const editorFetch = h.loadEditorWrapper();
    assert.deepEqual(await (await editorFetch(GET_URL)).json(), candidate);
    const searchUrl = `${BASE}/search?q=Fixture+%26+caf%C3%A9`;
    assert.deepEqual(await (await editorFetch(searchUrl)).json(), [candidate]);
    assert.equal(h.requests.length, 4);
    assert.equal(h.requests[1].url, `${PROXY}${GET_URL}`);
    assert.equal(h.requests[3].url, `${PROXY}${searchUrl}`);
    assert.equal(manager.isProviderEnabled('lrclib'), false);
    manager.setProviderEnabled('lrclib', true);
    assert.equal(manager.getEnabledProviders().length, 1);
    manager.setProviderEnabled('lrclib', false);
    assert.equal(manager.getEnabledProviders().length, 0);
    assert.equal(h.window.IvLyricsLrclibTransport, transport);
    assert.equal(h.timers.size, 0);
});

test('direct success returns the untouched response and keeps public client identification without credentials', async () => {
    const upstream = Response.json(candidate);
    const h = setup(() => upstream);
    const controller = new AbortController();
    const response = await h.fetch(GET_URL, {
        signal: controller.signal, credentials: 'include',
        headers: { 'x-user-agent': 'spicetify test', Authorization: 'Bearer synthetic-spotify-token', Cookie: 'synthetic-cookie' }
    });
    assert.equal(response, upstream);
    assert.equal(response.bodyUsed, false);
    assert.deepEqual(await response.json(), candidate);
    assert.equal(h.requests.length, 1);
    assert.equal(h.requests[0].url, GET_URL);
    assert.deepEqual([...new Headers(h.requests[0].options.headers)], [
        ['accept', 'application/json'], ['x-user-agent', 'spicetify vtest']
    ]);
    assert.equal(h.requests[0].options.credentials, 'omit');
    assert.equal(h.requests[0].options.referrerPolicy, 'no-referrer');
    assert.equal(h.timers.size, 0);
    assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
});

test('CORS/network failures retry once through the Spicetify URL with no auth or cookies', async () => {
    for (const failure of [new TypeError('Failed to fetch'), new DOMException('Network error', 'NetworkError'), new Error('Load failed')]) {
        const upstream = Response.json(candidate);
        const h = setup((url, options, count) => {
            if (count === 1) throw failure;
            return upstream;
        });
        assert.equal(await h.fetch(GET_URL, { headers: new Headers({
            authorization: 'Bearer synthetic-spotify-token', cookie: 'synthetic-cookie',
            'x-spotify-app-version': 'synthetic-private-data'
        }), credentials: 'include' }), upstream);
        assert.equal(h.requests.length, 2);
        const [direct, proxy] = h.requests;
        assert.equal(proxy.url, `${PROXY}${GET_URL}`);
        assert.equal(proxy.options.signal, direct.options.signal);
        assert.equal(proxy.options.credentials, 'omit');
        assert.deepEqual([...new Headers(proxy.options.headers)], [
            ['accept', 'application/json'], ['x-user-agent', 'spicetify vtest']
        ]);
        assert.doesNotMatch(proxy.url + JSON.stringify(proxy.options), /synthetic-/);
        assert.equal(h.timers.size, 0);
    }
});

test('configured Spicetify proxies are honored and inaccessible/empty settings use the default', async () => {
    for (const [localStorage, prefix] of [
        [{ getItem(key) { assert.equal(key, 'spicetify:corsProxyTemplate'); return 'https://relay.example.test/{url}'; } }, 'https://relay.example.test/'],
        [{ getItem() { throw new Error('Storage denied'); } }, PROXY],
        [{ getItem: () => '' }, PROXY],
        [undefined, PROXY]
    ]) {
        const h = setup(blockedThen(Response.json([])), { localStorage });
        await h.fetch(GET_URL);
        assert.equal(h.requests[1].url, `${prefix}${GET_URL}`);
    }
});

test('invalid proxy templates cannot send relay requests', async () => {
    for (const template of [
        'https://relay.example.test/', 'file:///{url}', 'javascript:{url}',
        'https://user:password@relay.example.test/{url}', '{url}', 'https://relay.example.test/{url}/{url}'
    ]) {
        const h = setup(blockedThen(Response.json([])), { localStorage: { getItem: () => template } });
        assert.equal(await h.fetch(GET_URL), null);
        assert.equal(h.requests.length, 1);
        assert.equal(h.timers.size, 0);
    }
});

test('public URL validation rejects unsafe targets before any direct request or timer', async () => {
    for (const url of [
        'https://api.spotify.com/v1/me', 'https://lrclib.net.evil.test/api/search?q=test',
        'http://lrclib.net/api/search?q=test', 'https://lrclib.net:8443/api/search?q=test',
        'https://user:password@lrclib.net/api/search?q=test', `${BASE}/publish`, `${BASE}/request-challenge`,
        `${BASE}/get/not-an-id`, `${BASE}/get/123%2Fpublish`, `${BASE}/get/1/../../publish`,
        `${BASE}/search?q=test#fragment`, `${BASE}/search?access_token=synthetic-private-token`,
        `${GET_URL}?authorization=synthetic-private-token`, 'not a URL', undefined
    ]) {
        const h = setup(() => assert.fail('unsafe direct request'));
        assert.equal(await h.fetch(url), null);
        assert.equal(h.requests.length, 0);
        assert.equal(h.timers.size, 0);
    }
});

test('unsupported methods or bodies are rejected before any direct request', async () => {
    for (const options of [
        { method: 'POST', body: 'private-body' }, { method: 'put' }, { method: 'DELETE' },
        { method: 'PATCH' }, { method: 'HEAD' }, { method: 'OPTIONS' }, { method: '' },
        { method: null }, { method: 1 }, { body: '' }, { method: 'GET', body: 'private-body' }
    ]) {
        const h = setup(() => assert.fail('unsupported write'));
        assert.equal(await h.fetch(GET_URL, options), null);
        assert.equal(h.requests.length, 0);
        assert.equal(h.timers.size, 0);
    }
});

test('public reads accept supported URLs and only send fixed GET options', async () => {
    for (const url of [GET_URL, `${BASE}/search?q=Test+Song`,
        `${BASE}/search?track_name=Test+Song&artist_name=Test+Artist&album_name=Test+Album`,
        `${BASE}/get?track_name=Test+Song&artist_name=Test+Artist&album_name=Test+Album&duration=180`]) {
        const upstream = Response.json(candidate);
        const h = setup(() => upstream);
        assert.equal(await h.fetch(url, { method: 'get', body: null, mode: 'no-cors', referrer: 'https://private.example.test/' }), upstream);
        assert.equal(h.requests.length, 1);
        assert.equal(h.requests[0].url, url);
        const options = h.requests[0].options;
        assert.equal(options.method, 'GET');
        assert.equal('body' in options, false);
        assert.equal('mode' in options, false);
        assert.equal('referrer' in options, false);
    }
});

test('HTTP error status, headers and body stay visible without an extra retry', async () => {
    for (const status of [401, 403, 404, 429, 500, 503]) {
        for (const throughProxy of [false, true]) {
            const upstream = new Response('upstream status body', { status, headers: { 'Retry-After': '30' } });
            const h = setup(throughProxy ? blockedThen(upstream) : () => upstream);
            const response = await h.fetch(GET_URL);
            assert.equal(response, upstream);
            assert.equal(response.status, status);
            assert.equal(response.headers.get('Retry-After'), '30');
            assert.equal(await response.text(), 'upstream status body');
            assert.equal(h.requests.length, throughProxy ? 2 : 1);
            assert.equal(h.timers.size, 0);
        }
    }
});

test('pre-cancellation prevents both requests; cancelling either pending attempt stops without retrying', async () => {
    const alreadyAborted = new AbortController();
    alreadyAborted.abort();
    const unused = setup(() => assert.fail('fetch after cancellation'));
    assert.equal(await unused.fetch(GET_URL, { signal: alreadyAborted.signal }), null);
    assert.equal(unused.requests.length, 0);
    assert.equal(unused.timers.size, 0);

    for (const throughProxy of [false, true]) {
        const started = deferred();
        const controller = new AbortController();
        const reason = new Error('Track changed');
        const h = setup((url, options, count) => {
            if (throughProxy && count === 1) throw new TypeError('Failed to fetch');
            started.resolve();
            return waitForAbort(options.signal);
        });
        const pending = h.fetch(GET_URL, { signal: controller.signal });
        await started.promise;
        controller.abort(reason);
        assert.equal(await pending, null);
        assert.equal(h.requests.at(-1).options.signal.reason, reason);
        assert.equal(h.requests.length, throughProxy ? 2 : 1);
        assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
        assert.equal(h.timers.size, 0);
    }
});

test('AbortError/TimeoutError and unrelated failures never trigger the relay', async () => {
    for (const error of [new DOMException('Aborted', 'AbortError'), new DOMException('Timed out', 'TimeoutError'), new Error('Unexpected failure')]) {
        const h = setup(() => { throw error; });
        assert.equal(await h.fetch(GET_URL), null);
        assert.equal(h.requests.length, 1);
        assert.equal(h.timers.size, 0);
    }
});

test('direct timeout aborts once and does not extend the request through the relay', async () => {
    const h = setup((url, options) => waitForAbort(options.signal));
    const pending = h.fetch(GET_URL, {}, 35000);
    h.elapse(35000);
    assert.equal(await pending, null);
    assert.equal(h.requests.length, 1);
    assert.equal(h.requests[0].options.signal.aborted, true);
    assert.equal(h.timers.size, 0);
});

test('public callers cannot extend the 35-second timeout cap', async () => {
    for (const timeout of [60000, Infinity, NaN]) {
        const h = setup((url, options) => waitForAbort(options.signal));
        const pending = h.fetch(GET_URL, {}, timeout);
        h.elapse(34999);
        assert.equal(h.requests[0].options.signal.aborted, false);
        h.elapse(1);
        assert.equal(await pending, null);
        assert.equal(h.requests.length, 1);
        assert.equal(h.timers.size, 0);
    }
});

test('proxy shares the original timeout budget instead of starting another 35 seconds', async () => {
    const started = deferred();
    const h = setup((url, options, count) => {
        if (count === 1) {
            h.elapse(20000);
            throw new TypeError('Failed to fetch');
        }
        started.resolve();
        return waitForAbort(options.signal);
    });
    const pending = h.fetch(GET_URL);
    await started.promise;
    assert.equal(h.timers.size, 1);
    h.elapse(14999);
    assert.equal(h.requests[1].options.signal.aborted, false);
    h.elapse(1);
    assert.equal(await pending, null);
    assert.equal(h.requests[1].options.signal.aborted, true);
    assert.equal(h.requests.length, 2);
    assert.equal(h.timers.size, 0);
});

test('proxy network failure ends at two attempts and keeps the provider null-failure contract', async () => {
    const h = setup(() => { throw new TypeError('Failed to fetch'); });
    assert.equal(await h.fetch(GET_URL), null);
    assert.equal(h.requests.length, 2);
    assert.equal(h.timers.size, 0);
});

test('JSON errors remain with the caller and cannot trigger another network request', async () => {
    for (const throughProxy of [false, true]) {
        const malformed = new Response('{broken JSON', { headers: { 'Content-Type': 'application/json' } });
        const h = setup(throughProxy ? blockedThen(malformed) : () => malformed);
        assert.equal(await h.fetch(GET_URL), malformed);
        await assert.rejects(malformed.json(), SyntaxError);
        assert.equal(h.requests.length, throughProxy ? 2 : 1);
        assert.equal(h.timers.size, 0);
    }
});

test('manual and structured candidate searches recover through the relay without changing matching', async () => {
    for (const manual of [false, true]) {
        const h = setup((url) => {
            if (!url.startsWith(PROXY)) throw new TypeError('Failed to fetch');
            return Response.json([candidate]);
        });
        const result = manual
            ? await h.addon.searchCandidatesByQuery('Test Song & Test Artist', track)
            : await h.addon.searchCandidates(track);
        assert.equal(result.success, true);
        assert.equal(result.candidates[0].id, candidate.id);
        assert.equal(result.candidates[0].previewText, candidate.plainLyrics);
        assert.equal(h.requests.length, 2);
        assert.equal(h.requests[1].url, `${PROXY}${h.requests[0].url}`);
        assert.equal(new URL(h.requests[0].url).pathname, '/api/search');
        if (manual) assert.equal(new URL(h.requests[0].url).searchParams.get('q'), 'Test Song & Test Artist');
        assert.equal(h.timers.size, 0);
    }
});

test('closing a manual search aborts the response body after the headers arrive', async () => {
    const controller = new AbortController();
    const reading = deferred();
    const body = deferred();
    const h = setup(() => ({ ok: true, json() { reading.resolve(); return body.promise; } }));
    const search = h.addon.searchCandidatesByQuery('Test Song', track, { signal: controller.signal });
    await reading.promise;
    controller.abort();
    body.resolve([candidate]);
    assert.equal((await search).success, false);
    assert.equal(h.requests[0].options.signal.aborted, true);
    assert.equal(h.requests.length, 1);
    assert.equal(h.timers.size, 0);
});

test('manual 404 and manual/structured 429 retain existing errors and do not invoke the relay', async () => {
    for (const [manual, status, message] of [[true, 404, 'No lyrics found'], [true, 429, 'API error: 429'], [false, 429, 'Rate limit exceeded (429)']]) {
        const h = setup(() => new Response('edge error, not JSON', { status }));
        const result = manual ? await h.addon.searchCandidatesByQuery('test', track) : await h.addon.searchCandidates(track);
        assert.equal(result.success, false);
        assert.equal(result.error, message);
        assert.equal(h.requests.length, 1);
    }
});

test('saved-source ID lookup recovers playback and creator candidate previews with the same cache version', async () => {
    const syncData = { source: { provider: 'lrclib', lrclibId: String(candidate.id), preferredLyricsSource: 'synced' } };
    for (const preview of [false, true]) {
        const h = setup(blockedThen(Response.json(candidate)), { syncData });
        const cacheVersion = h.addon.cacheVersion;
        const result = preview ? await h.addon.searchCandidates(track) : await h.addon.getLyrics(track);
        assert.equal(h.requests[0].url, GET_URL);
        assert.equal(h.requests[1].url, `${PROXY}${GET_URL}`);
        assert.equal(h.requests.length, 2);
        assert.equal(result.error, null);
        assert.equal(h.addon.cacheVersion, cacheVersion);
        if (preview) {
            assert.equal(result.success, true);
            assert.equal(result.selectedSource, 'source-direct');
            assert.equal(result.candidates[0].id, candidate.id);
        } else {
            assert.equal(result.lrclibId, String(candidate.id));
            assert.equal(result.cacheVersion, cacheVersion);
            assert.deepEqual(Array.from(result.synced, row => row.text), ['First line', 'Second line']);
        }
    }
});

test('ID lookup keeps missing/invalid response handling and malformed JSON outside transport retry', async () => {
    const syncSource = { provider: 'lrclib', lrclibId: '18694795' };
    for (const upstream of [new Response('not found', { status: 404 }), Response.json({ id: 18694795 })]) {
        const h = setup(() => upstream);
        assert.equal(await h.fetchCandidate(syncSource), null);
        assert.equal(h.requests.length, 1);
    }
    const h = setup(() => new Response('{broken JSON'));
    await assert.rejects(h.fetchCandidate(syncSource), SyntaxError);
    assert.equal(h.requests.length, 1);
});

for (const restoreById of [true, false]) {
    test(`cancelling an automatic candidate lookup stops its ${restoreById ? 'saved ID request' : 'ranked search'} and its fallbacks`, async () => {
        const controller = new AbortController();
        const started = deferred();
        const syncData = restoreById ? {
            source: { provider: 'lrclib', lrclibId: String(candidate.id), preferredLyricsSource: 'synced' },
        } : null;
        const h = setup((_url, { signal }) => {
            started.resolve(signal);
            return waitForAbort(signal);
        }, { syncData });
        const lookup = h.addon.searchCandidates(track, { signal: controller.signal });
        const fetchSignal = await started.promise;

        controller.abort();
        assert.equal((await lookup).success, false);
        assert.equal(fetchSignal.aborted, true);
        assert.equal(h.requests.length, 1);
        assert.equal(h.requests[0].url === GET_URL, restoreById);
        assert.equal(h.timers.size, 0);
    });
}
