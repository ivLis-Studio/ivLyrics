import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const OFFICIAL = 'https://lrclib.net/api';
const CUSTOM = 'https://lyrics.example.test/api';
const PROXY = 'https://cors-proxy.spicetify.app/';
const SETTING = 'custom_api_endpoint';
const STORAGE_KEY = `ivLyrics:lyrics:addon:lrclib:${SETTING}`;
const INPUT_ID = 'ivlyrics-lrclib-custom-api';
const addonSource = readFileSync(new URL('../Addon_Lyrics_Lrclib.js', import.meta.url), 'utf8');
const managerSource = readFileSync(new URL('../LyricsAddonManager.js', import.meta.url), 'utf8');
const editorSource = readFileSync(new URL('../SyncDataCreator.js', import.meta.url), 'utf8');
const track = {
    uri: 'spotify:track:fixture', title: 'Café & Rain?', artist: 'Fixture Artist',
    album: 'Album / 雨', duration: 180000
};
const record = {
    id: 18694795, trackName: track.title, artistName: track.artist, albumName: track.album,
    duration: 180, instrumental: false,
    syncedLyrics: '[00:01.00]Custom first line\n[00:02.00]Custom second line',
    plainLyrics: 'Custom first line\nCustom second line'
};
const officialRecord = {
    ...record, id: 90210, syncedLyrics: '[00:01.00]Official first line\n[00:02.00]Official second line',
    plainLyrics: 'Official first line\nOfficial second line'
};
const syncData = { source: { provider: 'lrclib', lrclibId: String(officialRecord.id), preferredLyricsSource: 'synced' } };
const deferred = () => {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
};
const flush = () => new Promise(resolve => setImmediate(resolve));
const plain = value => JSON.parse(JSON.stringify(value));
const texts = lines => Array.from(lines || [], line => line.text);
const CUSTOM_REQUEST_BUDGET_MS = 5000;
const CUSTOM_STAGE_BUDGET_MS = 20000;
const OLD_CACHE_SCHEMA = '2026-08-11-sync-source-identity-1';
const notFound = () => new Response('Not found', { status: 404 });
const noMatch = url => new URL(url).pathname.endsWith('/search') ? Response.json([]) : notFound();
const apiUrl = (base, path, params = {}) => {
    const query = new URLSearchParams(params).toString();
    return `${base}/${path}${query ? `?${query}` : ''}`;
};
const metadataGet = (base = CUSTOM, info = track) => apiUrl(base, 'get', {
    track_name: info.title, artist_name: info.artist, duration: String(info.duration / 1000),
    ...(info.album ? { album_name: info.album } : {})
});
const searchSequence = (base, info = track, { noAlbum = false } = {}) => {
    const urls = [apiUrl(base, 'search', {
        track_name: info.title, artist_name: info.artist,
        ...(info.album ? { album_name: info.album } : {})
    })];
    if (noAlbum && info.album) urls.push(apiUrl(base, 'search', { track_name: info.title, artist_name: info.artist }));
    urls.push(apiUrl(base, 'search', { q: `${info.title} ${info.artist}` }), apiUrl(base, 'search', { q: info.title }));
    return urls;
};
const customSequence = (info = track, { sourceId, english } = {}) => [
    ...(sourceId ? [apiUrl(CUSTOM, `get/${sourceId}`)] : []),
    metadataGet(CUSTOM, info), ...searchSequence(CUSTOM, info, { noAlbum: true }),
    ...(english ? searchSequence(CUSTOM, { ...info, ...english, album: '' }) : [])
];
const officialSequence = (info = track, options) => customSequence(info, options).map(url => url.replace(CUSTOM, OFFICIAL));
const canonicalUrl = url => {
    const parsed = new URL(url);
    parsed.searchParams.sort();
    return parsed.href;
};
const assertRequests = (h, expected) => assert.deepEqual(
    h.requests.map(request => canonicalUrl(request.url)), expected.map(canonicalUrl)
);
function assertPrivateSafety(h, base = CUSTOM) {
    const requests = h.requests.filter(request => request.url.startsWith(`${base}/`));
    assert.equal(new Set(requests.map(request => canonicalUrl(request.url))).size, requests.length, 'no duplicate private queries');
    assert.ok(h.requests.every(request => !request.url.startsWith(`${PROXY}${base}`)), 'private requests never use a third-party proxy');
    for (const { url, options } of requests) {
        const parsed = new URL(url);
        assert.equal(parsed.username, '');
        assert.equal(parsed.password, '');
        assert.ok([...parsed.searchParams.values()].every(value => value.trim()), 'never send empty query values');
        assert.equal(options.method, 'GET');
        assert.deepEqual([...new Headers(options.headers)], [['accept', 'application/json']]);
        assert.equal(options.credentials, 'omit');
        assert.equal(options.referrerPolicy, 'no-referrer');
        assert.equal(options.redirect, 'error');
        assert.equal(options.body, undefined);
    }
}

function officialResponse(url) {
    return Response.json(new URL(url.replace(PROXY, '')).pathname.endsWith('/search') ? [officialRecord] : officialRecord);
}

// Run both complete production modules. Only storage, React, time and network are synthetic.
function setup({ endpoint, custom = () => Response.json(record), official = officialResponse, savedSyncData, local, englishMetadata,
    managed = true, storedValues = [], cache = new Map() } = {}) {
    const stored = new Map(storedValues);
    if (endpoint !== undefined) stored.set(STORAGE_KEY, endpoint);
    const requests = [], writes = [], syncReads = [], cacheReads = [], reloadCalls = [], metadataReads = [];
    const timers = new Map();
    let now = 0, nextTimer = 0, registeredAddon, reloads = 0;
    class FakeDate extends Date {
        constructor(...args) { super(...(args.length ? args : [now])); }
        static now() { return now; }
    }
    const fetch = async (url, options = {}) => {
        url = String(url);
        const request = { url, options, at: now, syncReadCount: syncReads.length };
        requests.push(request);
        return (url.startsWith(`${OFFICIAL}/`) || url.startsWith(`${PROXY}${OFFICIAL}/`)
            ? official : custom)(url, options, requests.length);
    };
    const window = {
        IvLyricsLocalLrclib: local,
        fetch, reloadLyrics(...args) { reloads++; reloadCalls.push(args); },
        LyricsService: {
            extractTrackId: () => 'fixture',
            getCachedLyrics: async (id, provider) => {
                cacheReads.push([id, provider]);
                return cache.has(`${id}:${provider}`) ? plain(cache.get(`${id}:${provider}`)) : null;
            },
            cacheLyrics: (id, provider, value) => cache.set(`${id}:${provider}`, plain(value))
        },
        SyncDataService: { getSyncData: async (...args) => { syncReads.push(args); return savedSyncData; } }
    };
    const Spicetify = {
        Config: { version: 'synthetic-test' },
        LocalStorage: {
            get: key => stored.get(key) ?? null,
            set: (key, value) => { writes.push([key, value]); stored.set(key, value); }
        }
    };
    if (englishMetadata) Spicetify.GraphQL = {
        Definitions: { lookupEntity: {} },
        async Request(definition, { uri }) {
            metadataReads.push({ uri, at: now });
            return { data: { lookup: [{ data: {
                __typename: 'Track', name: englishMetadata.title,
                artists: { items: [{ profile: { name: englishMetadata.artist } }] }
            } }] } };
        }
    };
    const context = vm.createContext({
        window, Spicetify, fetch, URL, URLSearchParams, Headers, AbortController, Date: FakeDate,
        console: { log() {}, info() {}, warn() {}, error() {} }, performance: { now: () => now },
        setTimeout(callback, delay = 0) {
            const id = ++nextTimer;
            timers.set(id, { callback, deadline: now + delay });
            return id;
        },
        clearTimeout(id) { timers.delete(id); }
    });
    if (managed) vm.runInContext(managerSource, context, { filename: 'LyricsAddonManager.js' });
    else window.LyricsAddonManager = { register: addon => { registeredAddon = addon; } };
    vm.runInContext(addonSource, context, { filename: 'Addon_Lyrics_Lrclib.js' });
    const manager = window.LyricsAddonManager;
    const addon = registeredAddon || manager.getAddon('lrclib');
    assert.equal(addon?.id, 'lrclib', 'the production addon registered');
    return {
        addon, manager, window, Spicetify, requests, writes, stored, timers, cache, cacheReads, syncReads, reloadCalls, metadataReads,
        get reloads() { return reloads; },
        get endpointWrites() { return writes.filter(([key]) => key === STORAGE_KEY); },
        async advance(ms) {
            const target = now + ms;
            await flush();
            for (;;) {
                const due = [...timers].filter(([, timer]) => timer.deadline <= target)
                    .sort((left, right) => left[1].deadline - right[1].deadline)[0];
                if (!due) break;
                const [id, timer] = due;
                now = timer.deadline;
                timers.delete(id);
                timer.callback();
                await flush();
            }
            now = target;
            await flush();
        }
    };
}

for (const status of [408, 429, 500, 503]) {
    test(`official pinned lookup HTTP ${status} stops the whole playback search stage`, async () => {
        const h = setup({ savedSyncData: syncData, englishMetadata: { title: 'English title', artist: 'English artist' },
            official: () => new Response('Busy', { status }) });
        const result = await h.addon.getLyrics(track);
        assert.match(result.error, new RegExp(String(status)));
        assertRequests(h, [apiUrl(OFFICIAL, `get/${officialRecord.id}`)]);
        assert.equal(h.metadataReads.length, 0, 'an outage must not trigger alternate metadata searches');
        assert.equal(h.timers.size, 0);
    });
}

test('official overload after a custom miss stops at metadata lookup without extra searches', async () => {
    const h = setup({ endpoint: CUSTOM, custom: noMatch, official: () => new Response('Busy', { status: 503 }) });
    const result = await h.addon.getLyrics(track);
    assert.match(result.error, /503/);
    assertRequests(h, [...customSequence(), metadataGet(OFFICIAL)]);
});

test('a genuine official pinned-record miss still searches for usable lyrics', async () => {
    const h = setup({ savedSyncData: syncData,
        official: url => new URL(url).pathname.includes('/get/') ? notFound() : officialResponse(url) });
    assertOfficial(await h.addon.getLyrics(track));
    assertRequests(h, [apiUrl(OFFICIAL, `get/${officialRecord.id}`), searchSequence(OFFICIAL)[0]]);
});

for (const [retryAfter, delay] of [['12', 12000], ['Thu, 01 Jan 1970 00:00:12 GMT', 12000], ['invalid', 5000]]) {
    test(`playback shares Retry-After backoff across tracks (${retryAfter}) without caching a missing lyric`, async () => {
        let busy = true;
        const h = setup({ savedSyncData: syncData, official: url => busy
            ? new Response('Busy', { status: 429, headers: { 'Retry-After': retryAfter } }) : officialResponse(url) });
        assert.match((await h.addon.getLyrics(track)).error, /429/);
        busy = false;
        await h.advance(delay - 1);
        assert.match((await h.addon.getLyrics({ ...track, uri: 'spotify:track:next' })).error, /429/);
        assert.equal(h.requests.length, 1, 'do not send more requests during the host cooldown');
        await h.advance(1);
        assertOfficial(await h.addon.getLyrics(track));
        assert.equal(h.requests.length, 2, 'recover automatically once the cooldown expires');
        assert.equal(h.timers.size, 0);
    });
}

test('a custom overload immediately falls back to official and only cools down the custom host', async () => {
    const h = setup({ endpoint: CUSTOM, custom: () => new Response('Busy', { status: 503 }) });
    assertOfficial(await h.addon.getLyrics(track));
    assertRequests(h, [metadataGet(CUSTOM), metadataGet(OFFICIAL)]);
    assertOfficial(await h.addon.getLyrics(track));
    assertRequests(h, [metadataGet(CUSTOM), metadataGet(OFFICIAL), metadataGet(OFFICIAL)]);
});

test('an official direct network failure tries its CORS relay once and never starts the search ladder', async () => {
    const h = setup({ savedSyncData: syncData, official: () => { throw new TypeError('Failed to fetch'); } });
    assert.match((await h.addon.getLyrics(track)).error, /network request failed/);
    assertRequests(h, [apiUrl(OFFICIAL, `get/${officialRecord.id}`), `${PROXY}${apiUrl(OFFICIAL, `get/${officialRecord.id}`)}`]);
    assert.equal(h.timers.size, 0);
});

test('playback cooldown leaves explicit editor searches independent', async () => {
    let busy = true;
    const h = setup({ savedSyncData: syncData, official: url => busy
        ? new Response('Busy', { status: 503 }) : officialResponse(url) });
    assert.match((await h.addon.getLyrics(track)).error, /503/);
    busy = false;
    const result = await h.addon.searchCandidatesByQuery('Fixture Artist', track);
    assert.equal(result.error, null);
    assert.equal(h.requests.length, 2);
    assert.equal(new URL(h.requests[1].url).pathname, '/api/search');
});

test('the creator official-only fallback also stays independent of playback cooldown', async () => {
    let busy = true;
    const h = setup({ savedSyncData: syncData, official: url => busy
        ? new Response('Busy', { status: 503 }) : officialResponse(url) });
    assert.match((await h.addon.getLyrics(track)).error, /503/);
    busy = false;
    assertOfficial(await h.addon.getLyrics({ ...track, lrclibOfficialOnly: true }));
    assert.equal(h.requests.length, 2);
    assert.match((await h.addon.getLyrics(track)).error, /503/, 'the editor does not clear the playback cooldown');
    assert.equal(h.requests.length, 2);
});

// Dispatch the production component's handlers and rerender its actual hook state.
function mountSettings(h) {
    const hooks = [];
    let cursor = 0;
    h.Spicetify.React = {
        useState(initial) {
            const index = cursor++;
            if (!(index in hooks)) hooks[index] = typeof initial === 'function' ? initial() : initial;
            return [hooks[index], value => { hooks[index] = typeof value === 'function' ? value(hooks[index]) : value; }];
        },
        useCallback: callback => callback,
        useEffect() {},
        createElement: (type, props, ...children) => ({ type, props: { ...props, children } })
    };
    const Component = h.addon.getSettingsUI();
    let tree;
    const render = () => { cursor = 0; tree = Component(); };
    const find = (node, id) => {
        if (!node || typeof node !== 'object') return null;
        if (node.props?.id === id) return node;
        for (const child of [node.props?.children].flat(Infinity)) {
            const found = find(child, id);
            if (found) return found;
        }
        return null;
    };
    const field = () => {
        const input = find(tree, INPUT_ID);
        assert.equal(input?.type, 'input', 'the actual custom API input exists');
        return input;
    };
    render();
    return {
        field,
        change(value) { field().props.onChange({ target: { value } }); render(); },
        commit(event = 'blur') {
            const input = field();
            const target = { value: input.props.value };
            if (event === 'blur') input.props.onBlur({ target, currentTarget: target });
            else input.props.onKeyDown({ key: event, target, currentTarget: target, preventDefault() {} });
            render();
        }
    };
}

function assertCustom(result, expected = ['Custom first line', 'Custom second line']) {
    assert.equal(result.error, null);
    assert.equal(result.provider, 'lrclib');
    assert.equal(result.uri, track.uri);
    assert.equal(result.lrclibApiSource, 'custom');
    assert.equal(Object.hasOwn(result, 'lrclibId'), false, 'private IDs cannot become official source IDs');
    assert.equal(Object.hasOwn(result, 'lrclibSource'), false, 'private records cannot become trusted official sources');
    if (expected) assert.deepEqual(texts(result.synced || result.unsynced), expected);
}

function assertOfficial(result) {
    assert.equal(result.error, null);
    assert.equal(result.provider, 'lrclib');
    assert.equal(result.lrclibId, String(officialRecord.id));
    assert.equal(result.lrclibSource?.lrclibId, String(officialRecord.id));
    assert.notEqual(result.lrclibApiSource, 'custom');
    assert.deepEqual(texts(result.synced), ['Official first line', 'Official second line']);
}

async function canonicalSyncData() {
    const h = setup({ savedSyncData: syncData });
    const result = await h.addon.getLyrics(track);
    assertOfficial(result);
    return { source: plain(result.lrclibSource) };
}

function assertCanonicalCustom(result, source) {
    assert.equal(result.error, null);
    assert.equal(result.lrclibApiSource, 'custom');
    assert.equal(result.lrclibId, source.lrclibId, 'only the validated saved official ID is retained for sync application');
    assert.deepEqual(texts(result.synced || result.unsynced), ['Official first line', 'Official second line']);
    if (result.lrclibSource) {
        assert.equal(result.lrclibSource.lrclibId, source.lrclibId);
        assert.equal(result.lrclibSource.lyricsFingerprint, source.lyricsFingerprint);
    }
}

test('unavailable ISRC lookup cannot skip both lyric hosts', async () => {
    const h = setup({ endpoint: CUSTOM });
    h.window.SyncDataService.resolveTrackIsrc = async () => { throw new Error('ISRC unavailable'); };
    assertCustom(await h.addon.getLyrics(track));
    assertRequests(h, [metadataGet()]);
    assert.equal(h.timers.size, 0);
});

test('unset endpoint defaults to blank and keeps official playback unchanged', async () => {
    const h = setup();
    assert.equal(h.manager.getAddonSetting('lrclib', SETTING, ''), '');
    assert.equal(mountSettings(h).field().props.value, '');
    assert.equal(h.stored.has(STORAGE_KEY), false);
    assertOfficial(await h.addon.getLyrics(track));
    assert.equal(h.requests.length, 1);
    assert.equal(new URL(h.requests[0].url).pathname, '/api/search');
    assert.equal(h.timers.size, 0);
});

function localDatabase(candidate = record) {
    const calls = [];
    let ready = false;
    return {
        calls,
        async connect() { calls.push('connect'); ready = true; },
        getState: () => ({ phase: ready ? 'ready' : 'empty' }),
        getCacheVersion: () => ready ? 'local-fixture-revision' : '',
        async lookup(info) { calls.push(['lookup', plain(info)]); return typeof candidate === 'function' ? candidate() : candidate; }
    };
}

test('local database playback precedes configured custom API and never trusts its IDs as official sources', async () => {
    const local = localDatabase({ ...record, id: 123, lrclibId: '123', lrclibSource: syncData.source });
    const h = setup({ endpoint: CUSTOM, local, savedSyncData: syncData });
    const result = await h.addon.getLyrics(track);
    assert.equal(result.lrclibApiSource, 'local');
    assert.equal(Object.hasOwn(result, 'lrclibId'), false);
    assert.equal(Object.hasOwn(result, 'lrclibSource'), false);
    assert.equal(result.error, null);
    assert.deepEqual(texts(result.synced), ['Custom first line', 'Custom second line']);
    assert.equal(h.requests.length, 0);
    assert.equal(h.syncReads.length, 0);
    assert.equal(local.calls.filter(call => Array.isArray(call)).length, 1);
});

test('local miss, invalid data or failure proceeds to the custom API then official API', async () => {
    for (const candidate of [null, { ...record, duration: 900 }, () => { throw new Error('unavailable'); }]) {
        const local = localDatabase(candidate);
        const h = setup({ endpoint: CUSTOM, local });
        assertCustom(await h.addon.getLyrics(track));
        assert.equal(h.requests.length, 1);
        assert.equal(new URL(h.requests[0].url).origin, new URL(CUSTOM).origin);
        const fallback = setup({ endpoint: CUSTOM, local: localDatabase(candidate), custom: noMatch });
        assertOfficial(await fallback.addon.getLyrics(track));
        assertRequests(fallback, [...customSequence(), metadataGet(OFFICIAL)]);
        assert.equal(fallback.syncReads.length, 1);
        assertPrivateSafety(fallback);
    }
});

test('official-only loading and both editor searches never connect or query local files', async () => {
    const local = localDatabase();
    const h = setup({ endpoint: CUSTOM, local });
    assertOfficial(await h.addon.getLyrics({ ...track, lrclibOfficialOnly: true }));
    assert.equal((await h.addon.searchCandidates(track)).success, true);
    assert.equal((await h.addon.searchCandidatesByQuery('Fixture', track)).success, true);
    assert.deepEqual(local.calls, []);
    assert.equal(h.requests.length, 3);
    assert.ok(h.requests.every(request => request.url.startsWith(OFFICIAL)));
});

test('restored local source identity is ready before the manager can reuse an old online cache', async () => {
    const cached = setup();
    const previous = await cached.addon.getLyrics(track);
    const local = localDatabase();
    const cache = new Map([['fixture:lrclib', plain(previous)]]);
    const h = setup({ local, cache });
    assert.equal(h.addon.cacheVersion, previous.cacheVersion, 'local metadata is lazy at initial registration');
    const result = await h.manager.getLyrics(track, 'lrclib');
    assert.equal(result.lrclibApiSource, 'local');
    assert.notEqual(result.cacheVersion, previous.cacheVersion);
    assert.equal(h.requests.length, 0);
    const reads = local.calls.filter(call => Array.isArray(call)).length;
    assert.equal((await h.manager.getLyrics(track, 'lrclib')).lrclibApiSource, 'local');
    assert.equal(local.calls.filter(call => Array.isArray(call)).length, reads, 'matching local cache stays reusable');
});

test('an active import or restore never blocks cached playback or online fallback', async () => {
    const cached = setup();
    const previous = await cached.addon.getLyrics(track);
    for (const phase of ['importing', 'opening']) {
        const local = {
            getState: () => ({ phase }), getCacheVersion: () => '',
            connect() { assert.fail('Do not queue restoration behind a running import'); },
            lookup() { assert.fail('Do not query a busy database'); }
        };
        const h = setup({ local, cache: new Map([['fixture:lrclib', plain(previous)]]) });
        assertOfficial(await h.manager.getLyrics(track, 'lrclib'));
        assert.equal(h.requests.length, 0, 'cached playback stays immediate');
        assert.equal(h.timers.size, 0);
        const online = setup({ local });
        assertOfficial(await online.addon.getLyrics(track));
        assert.equal(online.requests.length, 1, 'the normal official fallback remains available');
        assert.equal(online.timers.size, 0);
    }
});

test('slow initial restoration has a bounded playback wait and later local identity invalidates online cache', async () => {
    const restoration = deferred();
    let phase = 'empty';
    const local = {
        getState: () => ({ phase }), getCacheVersion: () => phase === 'ready' ? 'restored-later' : '',
        connect() { phase = 'opening'; return restoration.promise; },
        lookup: async () => record
    };
    const h = setup({ local });
    const result = h.manager.getLyrics(track, 'lrclib');
    await h.advance(250);
    assertOfficial(await result);
    assert.equal(h.requests.length, 1);
    assert.equal(h.timers.size, 0);
    phase = 'ready'; restoration.resolve();
    await flush();
    assert.equal((await h.manager.getLyrics(track, 'lrclib')).lrclibApiSource, 'local');
    assert.equal(h.requests.length, 1, 'ready local data replaces the temporary online cache');
});

test('custom GET normalizes bases, encodes track metadata and returns lyrics before any official lookup', async t => {
    for (const [endpoint, base] of [
        ['https://lyrics.example.test', CUSTOM],
        ['  HTTPS://LYRICS.EXAMPLE.TEST:443///  ', CUSTOM],
        [`${CUSTOM}///`, CUSTOM],
        ['https://lyrics.example.test/nested/lrclib///', 'https://lyrics.example.test/nested/lrclib'],
        ['http://127.0.0.1:8088/', 'http://127.0.0.1:8088/api']
    ]) await t.test(endpoint, async () => {
        const h = setup({ endpoint });
        const result = await h.addon.getLyrics(track);
        assertCustom(result);
        assert.equal(result.cacheVersion, h.addon.cacheVersion);
        assert.equal(h.requests.length, 1);
        const { url, options } = h.requests[0];
        const parsed = new URL(url);
        assert.equal(`${parsed.origin}${parsed.pathname}`, `${base}/get`);
        assert.deepEqual(Object.fromEntries(parsed.searchParams), {
            track_name: track.title, artist_name: track.artist, album_name: track.album, duration: '180'
        });
        assert.equal(options.method, 'GET');
        assert.deepEqual([...new Headers(options.headers)], [['accept', 'application/json']]);
        assert.equal(options.credentials, 'omit');
        assert.equal(options.referrerPolicy, 'no-referrer');
        assert.equal(options.redirect, 'error');
        assert.equal(options.body, undefined);
        assert.equal(options.signal.aborted, false);
        assert.equal(h.syncReads.length, 1, 'saved source context is resolved before private lookup');
        assert.equal(h.requests[0].syncReadCount, 1);
        assert.equal(h.timers.size, 0);
    });
});

test('plain lyrics, synced lyrics and a true instrumental are usable without trusting supplied identity fields', async t => {
    for (const [name, fields, expected] of [
        ['synced only', { plainLyrics: null }, ['Custom first line', 'Custom second line']],
        ['plain only', { syncedLyrics: null }, ['Custom first line', 'Custom second line']],
        ['plain fallback for invalid LRC', { syncedLyrics: 'not LRC', plainLyrics: 'Plain fallback' }, ['Plain fallback']],
        ['instrumental', { syncedLyrics: null, plainLyrics: null, instrumental: true }, ['♪ Instrumental ♪']]
    ]) await t.test(name, async () => {
        const h = setup({ endpoint: CUSTOM, custom: () => Response.json({
            ...record, ...fields, lrclibId: '90210', lrclibSource: syncData.source, lrclibApiSource: 'official'
        }) });
        assertCustom(await h.addon.getLyrics(track), expected);
        assert.equal(h.requests.length, 1);
        assert.equal(h.timers.size, 0);
    });
});

test('stored endpoint is honored through direct storage before the full manager is available', async () => {
    const h = setup({ managed: false, endpoint: JSON.stringify('https://lyrics.example.test/') });
    assertCustom(await h.addon.getLyrics(track));
    assert.equal(new URL(h.requests[0].url).pathname, '/api/get');
    assert.equal(h.requests.length, 1);
});

test('failed private hosts fall back to official metadata lookup without duplicate requests or a proxy', async t => {
    const failures = [
        ['network', () => { throw new TypeError('Failed to fetch'); }],
        ['redirect rejection', () => { throw new TypeError('Redirect is not allowed'); }],
        ['empty response', () => null],
        ['empty body', () => new Response(null, { status: 204 })],
        ['invalid JSON', () => new Response('{broken JSON')],
        ['body read rejection', () => ({ ok: true, json: async () => { throw new TypeError('Body read failed'); } })],
        ...[301, 401, 403, 404, 429, 500, 503].map(status => [String(status), () => new Response('Unavailable', { status })])
    ];
    const baseline = setup();
    const expected = plain(await baseline.addon.getLyrics(track));
    for (const [name, custom] of failures) await t.test(name, async () => {
        const h = setup({ endpoint: CUSTOM, custom });
        const result = await h.addon.getLyrics(track);
        assertOfficial(result);
        assert.deepEqual({ ...plain(result), cacheVersion: expected.cacheVersion }, expected);
        const privateRequests = h.requests.filter(request => request.url.startsWith(`${CUSTOM}/`));
        assert.ok(privateRequests.length > 0 && privateRequests.length <= customSequence().length);
        assertRequests({ requests: privateRequests }, customSequence().slice(0, privateRequests.length));
        assertRequests({ requests: h.requests.slice(privateRequests.length) }, [metadataGet(OFFICIAL)]);
        if (name === '404') assertRequests(h, [...customSequence(), metadataGet(OFFICIAL)]);
        assert.equal(h.syncReads.length, 1);
        assertPrivateSafety(h);
        assert.equal(h.timers.size, 0);
    });
});

test('malformed, empty, unparseable and mismatched records cannot short-circuit official loading', async t => {
    for (const [name, value] of [
        ['null', null], ['array', [record]], ['string', 'lyrics'], ['empty object', {}],
        ['missing title', { ...record, trackName: undefined }],
        ['missing artist', { ...record, artistName: undefined }],
        ['missing duration', { ...record, duration: undefined }],
        ['invalid duration', { ...record, duration: 'not-a-number' }],
        ['zero duration', { ...record, duration: 0 }],
        ['wrong title', { ...record, trackName: 'Completely Unrelated Song' }],
        ['wrong artist', { ...record, artistName: 'An Entirely Different Performer' }],
        ['wrong duration', { ...record, duration: 250 }],
        ['no lyrics', { ...record, syncedLyrics: null, plainLyrics: null }],
        ['empty lyrics', { ...record, syncedLyrics: '', plainLyrics: '' }],
        ['whitespace lyrics', { ...record, syncedLyrics: ' \n\t', plainLyrics: ' \n\t' }],
        ['untimed synced lyrics only', { ...record, syncedLyrics: 'not LRC', plainLyrics: null }],
        ['unparseable synced lyrics', { ...record, syncedLyrics: '[invalid:timestamp]No usable LRC line', plainLyrics: null }],
        ['metadata without lyrics', { ...record, syncedLyrics: '[ar:Fixture Artist]\n[ti:Café & Rain?]', plainLyrics: null }],
        ['empty synced line', { ...record, syncedLyrics: '[00:01.00]   ', plainLyrics: null }],
        ['object synced lyrics', { ...record, syncedLyrics: {} }],
        ['array plain lyrics', { ...record, plainLyrics: ['not a string'] }],
        ['truthy instrumental string', { ...record, syncedLyrics: null, plainLyrics: null, instrumental: 'true' }],
        ['mismatched instrumental', { ...record, syncedLyrics: null, plainLyrics: null, instrumental: true, duration: 900 }]
    ]) await t.test(name, async () => {
        const h = setup({ endpoint: CUSTOM, custom: url => new URL(url).pathname.endsWith('/search')
            ? Response.json([]) : Response.json(value) });
        assertOfficial(await h.addon.getLyrics(track));
        assertRequests(h, [...customSequence(), metadataGet(OFFICIAL)]);
        assert.equal(h.syncReads.length, 1);
        assertPrivateSafety(h);
        assert.equal(h.timers.size, 0);
    });
});

test('the whole custom stage precedes saved official ID loading and official CORS recovery', async () => {
    const h = setup({
        endpoint: CUSTOM, savedSyncData: syncData, custom: noMatch,
        official: url => {
            if (!url.startsWith(PROXY)) throw new TypeError('Failed to fetch');
            return Response.json(officialRecord);
        }
    });
    assertOfficial(await h.addon.getLyrics(track));
    assertRequests(h, [
        ...customSequence(track, { sourceId: officialRecord.id }),
        `${OFFICIAL}/get/${officialRecord.id}`, `${PROXY}${OFFICIAL}/get/${officialRecord.id}`
    ]);
    assert.equal(h.syncReads.length, 1);
    assert.ok(h.requests.every(request => request.syncReadCount === 1));
    assertPrivateSafety(h);
    assert.equal(h.timers.size, 0);
});

test('custom miss runs the full official metadata, no-album and free-text fallback sequence', async () => {
    const official = url => Response.json(new URL(url).searchParams.has('q') ? [officialRecord] : []);
    const baseline = setup({ official });
    const expected = await baseline.addon.getLyrics(track);
    assertOfficial(expected);
    assert.ok(baseline.requests.some(request => new URL(request.url).searchParams.has('q')));
    const h = setup({ endpoint: CUSTOM, custom: noMatch, official });
    const result = await h.addon.getLyrics(track);
    assert.deepEqual({ ...plain(result), cacheVersion: expected.cacheVersion }, plain(expected));
    assertRequests(h, [...customSequence(), ...officialSequence().slice(0, 4)]);
    assertPrivateSafety(h);
});

test('custom metadata 404 continues through each search fallback before contacting official LRCLIB', async t => {
    const sequence = customSequence();
    for (let hit = 1; hit < sequence.length; hit++) await t.test(sequence[hit], async () => {
        const h = setup({ endpoint: CUSTOM, custom: url => canonicalUrl(url) === canonicalUrl(sequence[hit])
            ? Response.json([record]) : noMatch(url) });
        assertCustom(await h.addon.getLyrics(track));
        assertRequests(h, sequence.slice(0, hit + 1));
        assert.equal(h.syncReads.length, 1);
        assertPrivateSafety(h);
        assert.equal(h.timers.size, 0);
    });
});

test('a saved ivSync source ID is resolved once before custom ID lookup and never requires official lyrics on a hit', async () => {
    const saved = await canonicalSyncData();
    const h = setup({ endpoint: CUSTOM, savedSyncData: saved, custom: () => Response.json(officialRecord) });
    const sourceReady = deferred();
    h.window.SyncDataService.getSyncData = async (...args) => { h.syncReads.push(args); return sourceReady.promise; };
    const pending = h.addon.getLyrics(track);
    await flush();
    assert.equal(h.syncReads.length, 1);
    assert.equal(h.requests.length, 0, 'no private request may race ahead of saved-source resolution');
    sourceReady.resolve(saved);
    assertCanonicalCustom(await pending, saved.source);
    assertRequests(h, [`${CUSTOM}/get/${officialRecord.id}`]);
    assert.equal(h.requests[0].syncReadCount, 1);
    assert.equal(h.syncReads.length, 1);
    assertPrivateSafety(h);
});

test('a missing custom source ID falls through to metadata without losing validated canonical identity', async () => {
    const saved = await canonicalSyncData();
    const h = setup({ endpoint: CUSTOM, savedSyncData: saved, custom: url =>
        new URL(url).pathname.endsWith(`/get/${officialRecord.id}`) ? notFound() : Response.json(officialRecord) });
    assertCanonicalCustom(await h.addon.getLyrics(track), saved.source);
    assertRequests(h, [`${CUSTOM}/get/${officialRecord.id}`, metadataGet()]);
    assert.equal(h.syncReads.length, 1);
    assertPrivateSafety(h);
});

test('a mirror with a different private ID preserves only the canonical ID when its saved fingerprint matches', async () => {
    const saved = await canonicalSyncData();
    const h = setup({ endpoint: CUSTOM, savedSyncData: saved, custom: () => Response.json({
        ...officialRecord, id: record.id, lrclibId: String(record.id),
        lrclibSource: { provider: 'lrclib', lrclibId: String(record.id), lyricsFingerprint: 'forged' }
    }) });
    const result = await h.addon.getLyrics(track);
    assertCanonicalCustom(result, saved.source);
    assertRequests(h, [`${CUSTOM}/get/${officialRecord.id}`]);
    assert.notEqual(result.lrclibId, String(record.id));
    assert.equal(result.lrclibSource.lyricsFingerprint, saved.source.lyricsFingerprint);
    assertPrivateSafety(h);
});

test('a legacy saved source without text evidence accepts only its exact ID on the custom host', async t => {
    for (const sameId of [true, false]) await t.test(sameId ? 'same ID' : 'foreign ID', async () => {
        const candidate = { ...officialRecord, id: sameId ? officialRecord.id : record.id };
        const h = setup({ endpoint: CUSTOM, savedSyncData: syncData, custom: url => Response.json(
            new URL(url).pathname.endsWith('/search') ? [candidate] : candidate
        ) });
        const result = await h.addon.getLyrics(track);
        if (sameId) {
            assertCanonicalCustom(result, syncData.source);
            assertRequests(h, [`${CUSTOM}/get/${officialRecord.id}`]);
        } else {
            assertOfficial(result);
            assertRequests(h, [...customSequence(track, { sourceId: officialRecord.id }), `${OFFICIAL}/get/${officialRecord.id}`]);
        }
        assert.equal(h.syncReads.length, 1);
        assertPrivateSafety(h);
    });
});

test('canonical fingerprint validation selects the matching timed or plain revision before leaving the custom host', async t => {
    for (const matching of ['synced', 'plain']) await t.test(matching, async () => {
        const saved = await canonicalSyncData();
        saved.source.preferredLyricsSource = 'plain';
        const candidate = { ...officialRecord, ...(matching === 'plain' ? {
            syncedLyrics: officialRecord.syncedLyrics.replaceAll('Official', 'Tampered')
        } : { plainLyrics: officialRecord.plainLyrics.replaceAll('Official', 'Tampered') }) };
        const h = setup({ endpoint: CUSTOM, savedSyncData: saved, custom: () => Response.json(candidate) });
        const result = await h.addon.getLyrics(track);
        assertCanonicalCustom(result, saved.source);
        if (matching === 'plain') assert.equal(result.synced, null, 'a different timed revision must not replace the validated plain text');
        else assert.deepEqual(texts(result.synced), ['Official first line', 'Official second line']);
        assertRequests(h, [`${CUSTOM}/get/${officialRecord.id}`]);
        assert.equal(h.syncReads.length, 1);
        assertPrivateSafety(h);
    });
});

test('matching row lengths in the wrong revision cannot validate the saved preferred plain source', async () => {
    const saved = await canonicalSyncData();
    saved.source.preferredLyricsSource = 'plain';
    delete saved.source.lyricsFingerprint;
    const candidate = { ...officialRecord, plainLyrics: 'Official first line Official second line' };
    const h = setup({ endpoint: CUSTOM, savedSyncData: saved, custom: url => Response.json(
        new URL(url).pathname.endsWith('/search') ? [candidate] : candidate
    ) });
    const result = await h.addon.getLyrics(track);
    assert.equal(result.error, null);
    assert.notEqual(result.lrclibApiSource, 'custom');
    assert.equal(result.lrclibId, saved.source.lrclibId);
    assert.deepEqual(texts(result.synced || result.unsynced), ['Official first line', 'Official second line']);
    assertRequests(h, [...customSequence(track, { sourceId: officialRecord.id }), `${OFFICIAL}/get/${officialRecord.id}`]);
    assertPrivateSafety(h);
});

test('a missing known ID exhausts private metadata and searches before the official ID lookup', async () => {
    const saved = await canonicalSyncData();
    const h = setup({ endpoint: CUSTOM, savedSyncData: saved, custom: noMatch });
    assertOfficial(await h.addon.getLyrics(track));
    assertRequests(h, [...customSequence(track, { sourceId: officialRecord.id }), `${OFFICIAL}/get/${officialRecord.id}`]);
    assert.equal(h.syncReads.length, 1);
    assertPrivateSafety(h);
});

test('mismatched IDs, line counts or fingerprints cannot replace the pinned official source', async t => {
    const saved = await canonicalSyncData();
    for (const [name, candidate] of [
        ['different record', record],
        ['same ID, different fingerprint with identical row lengths', {
            ...officialRecord, syncedLyrics: officialRecord.syncedLyrics.replaceAll('Official', 'Tampered'),
            plainLyrics: officialRecord.plainLyrics.replaceAll('Official', 'Tampered')
        }],
        ['same ID, changed row boundaries', {
            ...officialRecord, syncedLyrics: '[00:01.00]Official first line Official second line',
            plainLyrics: 'Official first line Official second line'
        }]
    ]) await t.test(name, async () => {
        const h = setup({ endpoint: CUSTOM, savedSyncData: saved, custom: url => Response.json(
            new URL(url).pathname.endsWith('/search') ? [candidate] : candidate
        ) });
        assertOfficial(await h.addon.getLyrics(track));
        assertRequests(h, [...customSequence(track, { sourceId: officialRecord.id }), `${OFFICIAL}/get/${officialRecord.id}`]);
        assert.equal(h.syncReads.length, 1);
        assertPrivateSafety(h);
    });
});

test('a poisoned direct-ID response cannot hide a later validated custom search result', async () => {
    const saved = await canonicalSyncData();
    const h = setup({ endpoint: CUSTOM, savedSyncData: saved, custom: url => {
        const path = new URL(url).pathname;
        if (path.endsWith(`/get/${officialRecord.id}`)) return Response.json({ ...record, id: officialRecord.id });
        return path.endsWith('/search') ? Response.json([officialRecord]) : notFound();
    } });
    assertCanonicalCustom(await h.addon.getLyrics(track), saved.source);
    assertRequests(h, [`${CUSTOM}/get/${officialRecord.id}`, metadataGet(), searchSequence(CUSTOM)[0]]);
    assert.equal(h.syncReads.length, 1);
    assertPrivateSafety(h);
});

test('English metadata search completes on the custom host before any official lyric request', async () => {
    const english = { title: 'English Fixture Title', artist: 'English Fixture Artist' };
    const candidate = { ...record, trackName: english.title, artistName: english.artist };
    const sequence = customSequence(track, { english });
    const h = setup({ endpoint: CUSTOM, englishMetadata: english, custom: url =>
        canonicalUrl(url) === canonicalUrl(sequence.at(-1)) ? Response.json([candidate]) : noMatch(url) });
    assertCustom(await h.addon.getLyrics(track));
    assertRequests(h, sequence);
    assert.equal(h.syncReads.length, 1);
    assert.equal(h.metadataReads.length, 1);
    assertPrivateSafety(h);
});

test('both complete host ladders share one lazy English metadata lookup', async () => {
    const english = { title: 'English Fixture Title', artist: 'English Fixture Artist' };
    const officialQueries = officialSequence(track, { english });
    const candidate = { ...officialRecord, trackName: english.title, artistName: english.artist };
    const h = setup({ endpoint: CUSTOM, englishMetadata: english, custom: noMatch, official: url =>
        canonicalUrl(url) === canonicalUrl(officialQueries.at(-1)) ? Response.json([candidate]) : noMatch(url) });
    assertOfficial(await h.addon.getLyrics(track));
    assertRequests(h, [...customSequence(track, { english }), ...officialQueries]);
    assert.equal(h.metadataReads.length, 1, 'the second host reuses the first host stage\'s metadata');
    assert.equal(h.syncReads.length, 1);
    assertPrivateSafety(h);
    assert.equal(h.timers.size, 0);
});

test('empty albums and unchanged English metadata never cause empty or duplicate private queries', async t => {
    for (const info of [track, { ...track, album: '' }]) await t.test(info.album || 'no album', async () => {
        const h = setup({ endpoint: CUSTOM, englishMetadata: { title: info.title, artist: info.artist }, custom: noMatch });
        assertOfficial(await h.addon.getLyrics(info));
        assertRequests(h, [...customSequence(info), metadataGet(OFFICIAL, info)]);
        assert.equal(h.syncReads.length, 1);
        assertPrivateSafety(h);
    });
});

test('private fallbacks honor disabled free-text settings without skipping structured no-album search', async () => {
    const h = setup({ endpoint: CUSTOM, custom: noMatch, storedValues: [
        ['ivLyrics:lyrics:addon:lrclib:enable_fallback_title_artist', 'false'],
        ['ivLyrics:lyrics:addon:lrclib:enable_fallback_title_only', 'false']
    ] });
    assertOfficial(await h.addon.getLyrics(track));
    assertRequests(h, [...customSequence().slice(0, 3), metadataGet(OFFICIAL)]);
    assertPrivateSafety(h);
});

test('the next provider starts only after both complete LRCLIB host stages are exhausted', async t => {
    for (const pinned of [false, true]) await t.test(pinned ? 'with saved source ID' : 'without saved source ID', async () => {
        const options = pinned ? { sourceId: officialRecord.id } : {};
        const lastOfficialResponse = deferred();
        const privateQueries = customSequence(track, options);
        const officialQueries = officialSequence(track, options);
        const h = setup({ endpoint: CUSTOM, custom: noMatch, savedSyncData: pinned ? syncData : undefined, official: url =>
            canonicalUrl(url) === canonicalUrl(officialQueries.at(-1)) ? lastOfficialResponse.promise : noMatch(url) });
        let nextCalls = 0;
        assert.equal(h.manager.register({
            id: 'next-fixture', name: 'Next fixture', author: 'Tests', description: 'Fallback fixture', version: '1',
            supports: { synced: true, unsynced: true },
            async getLyrics(info) {
                nextCalls++;
                assertRequests(h, [...privateQueries, ...officialQueries]);
                return { uri: info.uri, provider: 'next-fixture', synced: [{ startTime: 0, text: 'Next provider' }], error: null };
            }
        }), true);
        h.manager.setProviderOrder(['lrclib', 'next-fixture']);
        const pending = h.manager.getLyrics(track);
        await flush();
        assertRequests(h, [...privateQueries, ...officialQueries]);
        assert.equal(nextCalls, 0, 'the next provider must wait for the last official response');
        lastOfficialResponse.resolve(Response.json([]));
        const result = await pending;
        assert.equal(result.provider, 'next-fixture');
        assert.equal(nextCalls, 1);
        assert.equal(h.syncReads.filter(([, provider]) => provider === 'lrclib').length, 1);
        assert.ok(h.requests.every(request => request.syncReadCount === 1));
        assertPrivateSafety(h);
        assert.equal(h.timers.size, 0);
    });
});

test('redirect responses across the private stage cannot leak requests, cookies or credentials to another host', async () => {
    const h = setup({ endpoint: CUSTOM, custom: () => new Response(null, {
        status: 302, headers: { Location: 'https://redirect-target.example.test/collect' }
    }) });
    assertOfficial(await h.addon.getLyrics(track));
    assertPrivateSafety(h);
    assert.ok(h.requests.every(request => [new URL(CUSTOM).origin, new URL(OFFICIAL).origin].includes(new URL(request.url).origin)));
    assert.equal(h.timers.size, 0);
});

test('invalid persisted URLs are ignored and equivalent official URLs skip the custom step', async t => {
    const defaultVersion = setup().addon.cacheVersion;
    for (const endpoint of [
        '', '   ', 'not a URL', '//lyrics.example.test/api', 'ftp://lyrics.example.test/api',
        'file:///tmp/lyrics', 'javascript:alert(1)', 'data:application/json,{}',
        'https://user:password@lyrics.example.test/api', 'https://user@lyrics.example.test/api',
        `${CUSTOM}?token=synthetic`, `${CUSTOM}#fragment`, `${CUSTOM}?`, `${CUSTOM}#`,
        OFFICIAL, `${OFFICIAL}///`, 'https://lrclib.net', 'https://LRCLIB.NET:443/'
    ]) await t.test(endpoint || '(blank)', async () => {
        const h = setup({ endpoint });
        assert.equal(h.addon.cacheVersion, defaultVersion);
        assertOfficial(await h.addon.getLyrics(track));
        assert.equal(h.requests.length, 1);
        assert.equal(h.requests[0].url.startsWith(`${OFFICIAL}/search?`), true);
        assert.equal(h.endpointWrites.length, 0, 'ignored stored values are not rewritten during playback');
        assert.equal(h.timers.size, 0);
    });
});

test('official-only playback bypasses even a successful custom server, including saved official sources', async () => {
    for (const savedSyncData of [undefined, syncData]) {
        const h = setup({ endpoint: CUSTOM, savedSyncData });
        assertOfficial(await h.addon.getLyrics({ ...track, lrclibOfficialOnly: true }));
        assert.equal(h.requests.length, 1);
        assert.equal(h.requests[0].url.startsWith(`${OFFICIAL}/`), true);
        assert.equal(h.timers.size, 0);
    }
});

test('official-only manager loading cannot reuse or overwrite local/custom playback cache', async () => {
    for (const source of ['local', 'custom']) {
        const h = setup({ endpoint: CUSTOM, local: source === 'local' ? localDatabase() : undefined });
        assert.equal((await h.manager.getLyrics(track, 'lrclib')).lrclibApiSource, source);
        const cached = plain(h.cache.get('fixture:lrclib'));
        const before = h.requests.length;
        assertOfficial(await h.manager.getLyrics({ ...track, lrclibOfficialOnly: true }, 'lrclib'));
        assert.equal(h.requests.length, before + 1);
        assert.ok(h.requests.at(-1).url.startsWith(`${OFFICIAL}/`));
        assert.deepEqual(h.cache.get('fixture:lrclib'), cached, 'editor loading leaves playback cache intact');
        assert.equal((await h.manager.getLyrics(track, 'lrclib')).lrclibApiSource, source);
        assert.equal(h.requests.length, before + 1, 'playback keeps using its own cached source');
    }
});

test('structured and manual candidate searches always query official LRCLIB', async () => {
    for (const method of ['searchCandidates', 'searchCandidatesByQuery']) {
        const h = setup({ endpoint: CUSTOM });
        // searchCandidatesByQuery is the addon's existing public manual-search entry point.
        const result = method === 'searchCandidates'
            ? await h.addon.searchCandidates(track)
            : await h.addon.searchCandidatesByQuery('Café & Fixture Artist', track);
        assert.equal(result.success, true);
        assert.equal(result.candidates[0].id, officialRecord.id);
        assert.equal(result.candidates[0].previewText, officialRecord.plainLyrics);
        assert.equal(h.requests.length, 1);
        const url = new URL(h.requests[0].url);
        assert.equal(`${url.origin}${url.pathname}`, `${OFFICIAL}/search`);
        if (method === 'searchCandidatesByQuery') assert.equal(url.searchParams.get('q'), 'Café & Fixture Artist');
        assert.equal(h.timers.size, 0);
    }
});

test('the actual creator fallback passes official-only metadata through the manager and legacy provider paths', async () => {
    const start = editorSource.indexOf('const loadLyrics = useCallback(');
    const end = editorSource.indexOf('// 제작기에 진입하면', start);
    assert.ok(start >= 0 && end > start, 'the production creator load callback exists');
    const callback = editorSource.slice(start, end);
    for (const path of ['manager', 'legacy']) {
        const h = setup({ endpoint: CUSTOM });
        const calls = [], applied = [], errors = [];
        const load = async info => {
            calls.push(info);
            return path === 'manager'
                ? h.manager.getLyricsFrom('lrclib', info)
                : h.addon.getLyrics(info);
        };
        const context = vm.createContext({
            window: { ...h.window, LyricsAddonManager: path === 'manager' ? { getLyricsFrom: (id, info) => {
                assert.equal(id, 'lrclib');
                return load(info);
            } } : undefined },
            Providers: { lrclib: load },
            Spicetify: { Player: { data: { item: { duration: { milliseconds: track.duration } } } } },
            console: { error: (...args) => errors.push(args) }, I18n: { t: key => key },
            useCallback: fn => fn, SYNC_CREATOR_SOURCE_ADDON_ID: 'lrclib',
            trackInfo: { uri: track.uri, artists: [{ name: track.artist }], album: { name: track.album } },
            trackUri: track.uri, trackIsrc: '',
            lrclibIdInputEditedRef: { current: false }, resolveSyncCreatorLoadedLyricsLrclibId: () => '',
            trackName: track.title, artistName: track.artist, albumName: track.album,
            beginSyncCreatorSourceChange: () => 1, isCurrentSyncCreatorSourceChange: () => true,
            clearLrclibCandidateState() {}, buildSyntheticLrclibResult() { assert.fail('candidate branch was not selected'); },
            applyLoadedLyricsResult: async result => { applied.push(result); }
        });
        for (const [, setter] of callback.matchAll(/\b(set[A-Z]\w*)\b/g)) context[setter] = () => {};
        vm.runInContext(`${callback}\nglobalThis.loadCreatorLyrics = loadLyrics;`, context);
        await context.loadCreatorLyrics();
        assert.equal(errors.length, 0, path);
        assert.equal(calls.length, 1, path);
        assert.equal(calls[0].lrclibOfficialOnly, true, path);
        assert.equal(applied.length, 1, path);
        assertOfficial(applied[0]);
        assert.equal(h.requests.length, 1, path);
        assert.equal(h.requests[0].url.startsWith(`${OFFICIAL}/search?`), true, path);
    }
});

test('exported transport remains frozen and official-only with a custom endpoint configured', async () => {
    const h = setup({ endpoint: CUSTOM });
    const transport = h.window.IvLyricsLrclibTransport;
    assert.equal(Object.isFrozen(transport), true);
    assert.deepEqual(Object.keys(transport), ['fetch']);
    const version = h.addon.cacheVersion;
    for (const url of [
        `${CUSTOM}/get?track_name=Fixture&artist_name=Artist&duration=180`,
        `${CUSTOM}/search?q=Fixture`, `${CUSTOM}/get/18694795`,
        `${OFFICIAL}/publish`, `${OFFICIAL}/request-challenge`
    ]) {
        assert.equal(await transport.fetch(url), null);
        assert.equal(h.requests.length, 0);
        assert.equal(h.timers.size, 0);
    }
    for (const url of [`${OFFICIAL}/get/${officialRecord.id}`, `${OFFICIAL}/search?q=Fixture`]) {
        const response = await transport.fetch(url);
        assert.deepEqual(await response.json(), url.includes('/search?') ? [officialRecord] : officialRecord);
    }
    assert.equal(h.requests.length, 2);
    assert.equal(h.addon.cacheVersion, version);
    assert.equal(h.timers.size, 0);
});

test('cache versions follow normalized endpoints, including changes and clearing', async () => {
    const blank = setup().addon.cacheVersion;
    const version = setup({ endpoint: CUSTOM }).addon.cacheVersion;
    assert.notEqual(version, blank);
    for (const endpoint of ['https://lyrics.example.test', `${CUSTOM}///`, '  HTTPS://LYRICS.EXAMPLE.TEST:443/  ']) {
        assert.equal(setup({ endpoint }).addon.cacheVersion, version);
    }
    assert.notEqual(setup({ endpoint: 'https://other.example.test/api' }).addon.cacheVersion, version);
    assert.notEqual(setup({ endpoint: 'https://lyrics.example.test/other-api' }).addon.cacheVersion, version);
    const h = setup({ endpoint: CUSTOM });
    const settings = mountSettings(h);
    settings.change('https://other.example.test/');
    settings.commit();
    const changed = h.addon.cacheVersion;
    assert.notEqual(changed, version);
    assert.equal((await h.addon.getLyrics(track)).cacheVersion, changed);
    settings.change('');
    settings.commit();
    assert.equal(h.addon.cacheVersion, blank);
});

test('the old metadata-only cache schema cannot hide the new full custom lookup stage', async () => {
    const seed = setup({ endpoint: CUSTOM });
    const previous = plain(await seed.addon.getLyrics(track));
    previous.cacheVersion = previous.cacheVersion.replace(/^[^:]+/, OLD_CACHE_SCHEMA);
    previous.synced = [{ startTime: 0, text: 'Stale metadata-only cache' }];
    const h = setup({ endpoint: CUSTOM, cache: new Map([['fixture:lrclib', previous]]) });
    assert.notEqual(h.addon.cacheVersion, previous.cacheVersion, 'the lookup semantics require a cache schema bump');
    assertCustom(await h.manager.getLyrics(track, 'lrclib'));
    assertRequests(h, [metadataGet()]);
    assert.equal(h.cache.get('fixture:lrclib').cacheVersion, h.addon.cacheVersion);
});

test('manager cache reuses the same endpoint, refetches after editing it and returns to official after clearing', async () => {
    const cache = new Map([['unrelated:translation', { text: 'keep me' }]]);
    const h = setup({ endpoint: CUSTOM, cache, custom: url => Response.json({
        ...record, syncedLyrics: `[00:01.00]${new URL(url).hostname}`, plainLyrics: null
    }) });
    const load = () => h.manager.getLyrics(track, 'lrclib');
    const first = await load();
    assertCustom(first, ['lyrics.example.test']);
    assert.equal(h.cacheReads.length, 1);
    assert.equal(h.cache.get('fixture:lrclib')?.cacheVersion, first.cacheVersion);
    assertCustom(await load(), ['lyrics.example.test']);
    assert.equal(h.requests.length, 1, 'the real manager reused the provider cache');
    const settings = mountSettings(h);
    settings.change('https://other.example.test');
    settings.commit();
    assert.deepEqual(h.cache.get('unrelated:translation'), { text: 'keep me' });
    const second = await load();
    assertCustom(second, ['other.example.test']);
    assert.notEqual(second.cacheVersion, first.cacheVersion);
    assert.equal(h.requests.length, 2, 'the old endpoint cache was rejected');
    await load();
    assert.equal(h.requests.length, 2, 'the replacement endpoint cache is reusable');
    settings.change('');
    settings.commit();
    assertOfficial(await load());
    assert.equal(h.requests.length, 3);
    assert.deepEqual(h.cache.get('unrelated:translation'), { text: 'keep me' });
    assert.equal(h.timers.size, 0);
});

test('settings persist normalized endpoints only on blur or Enter and blank clears them', async t => {
    for (const event of ['blur', 'Enter']) await t.test(event, async () => {
        const h = setup();
        const initialVersion = h.addon.cacheVersion;
        const settings = mountSettings(h);
        settings.change('  https://lyrics.example.test///  ');
        assert.equal(h.stored.has(STORAGE_KEY), false, 'typing does not persist an incomplete address');
        assert.equal(h.addon.cacheVersion, initialVersion);
        settings.commit('Escape');
        assert.equal(h.endpointWrites.length, 0);
        settings.commit(event);
        assert.equal(h.stored.get(STORAGE_KEY), CUSTOM);
        assert.deepEqual(h.endpointWrites, [[STORAGE_KEY, CUSTOM]]);
        assert.equal(settings.field().props.value, CUSTOM);
        assert.notEqual(settings.field().props['aria-invalid'], true);
        assert.notEqual(h.addon.cacheVersion, initialVersion);
        assert.equal(h.reloads, 1);
        assert.deepEqual(h.reloadCalls, [[false]], 'saving refreshes lyrics without the default persistent-cache purge');
        settings.commit('blur');
        assert.equal(h.endpointWrites.length, 1, 'the following blur does not duplicate an Enter save');
        assert.equal(h.reloads, 1);
        settings.change(' \n ');
        settings.commit(event);
        assert.equal(h.stored.get(STORAGE_KEY), '');
        assert.equal(h.addon.cacheVersion, initialVersion);
        assert.equal(h.reloads, 2);
        assert.deepEqual(h.reloadCalls, [[false], [false]]);
        assert.equal(mountSettings(h).field().props.value, '', 'a remounted component reads the persisted clear');
    });
});

test('invalid UI addresses leave the previous endpoint and cache version intact', async t => {
    for (const value of ['not a URL', 'ftp://lyrics.example.test/api', 'https://user:secret@lyrics.example.test/api',
        `${CUSTOM}?key=synthetic`, `${CUSTOM}#fragment`, `${CUSTOM}?`, `${CUSTOM}#`]) await t.test(value, () => {
        for (const event of ['blur', 'Enter']) {
            const h = setup({ endpoint: CUSTOM });
            const version = h.addon.cacheVersion;
            const settings = mountSettings(h);
            settings.change(value);
            settings.commit(event);
            assert.equal(settings.field().props['aria-invalid'], true);
            assert.equal(h.stored.get(STORAGE_KEY), CUSTOM);
            assert.equal(h.endpointWrites.length, 0);
            assert.equal(h.addon.cacheVersion, version);
            assert.equal(h.reloads, 0);
            settings.change('https://replacement.example.test/');
            settings.commit(event);
            assert.equal(h.stored.get(STORAGE_KEY), 'https://replacement.example.test/api');
            assert.notEqual(settings.field().props['aria-invalid'], true);
            assert.equal(h.reloads, 1);
        }
    });
});

test('an unresponsive private host times out each request and exits within the twenty-second stage ceiling', async () => {
    const network = deferred();
    const h = setup({ endpoint: CUSTOM, custom: () => network.promise });
    let result, failure;
    const pending = h.addon.getLyrics(track).then(value => { result = value; }, error => { failure = error; });
    await h.advance(CUSTOM_REQUEST_BUDGET_MS - 1);
    assert.equal(h.requests.length, 1);
    assert.equal(h.requests[0].options.signal.aborted, false);
    assert.equal(result, undefined);
    await h.advance(1);
    assert.equal(failure, undefined);
    assert.equal(result, undefined, 'search fallbacks remain available after metadata times out');
    assert.equal(h.requests[0].options.signal.aborted, true);
    assert.equal(h.requests[1].at, CUSTOM_REQUEST_BUDGET_MS);
    await h.advance(CUSTOM_REQUEST_BUDGET_MS - 1);
    assert.equal(result, undefined);
    assert.equal(h.requests.length, 2);
    await h.advance(1);
    assert.ok(result, 'the stage settles even when fetch ignores abort');
    await pending;
    assertOfficial(result);
    assertRequests(h, [...customSequence().slice(0, 2), metadataGet(OFFICIAL)]);
    assert.deepEqual(h.requests.map(request => request.at), [0, CUSTOM_REQUEST_BUDGET_MS, CUSTOM_REQUEST_BUDGET_MS * 2]);
    assert.ok(h.requests.at(-1).at <= CUSTOM_STAGE_BUDGET_MS);
    assert.ok(h.requests.slice(0, 2).every(request => request.options.signal.aborted));
    assertPrivateSafety(h);
    assert.equal(h.timers.size, 0);
    network.resolve(Response.json(record));
    await flush();
    assertOfficial(result);
    assert.equal(h.requests.length, 3);
    assert.equal(h.timers.size, 0);
});

test('headers and JSON body share the request budget and a timed-out body still permits custom search', async () => {
    const headers = deferred(), body = deferred();
    let readingBody = false, result, failure;
    const h = setup({ endpoint: CUSTOM, custom: url => new URL(url).pathname.endsWith('/search')
        ? Response.json([record]) : headers.promise });
    const pending = h.addon.getLyrics(track).then(value => { result = value; }, error => { failure = error; });
    await h.advance(3000);
    headers.resolve({ ok: true, json() { readingBody = true; return body.promise; } });
    await flush();
    assert.equal(readingBody, true);
    await h.advance(1999);
    assert.equal(h.requests.length, 1);
    assert.equal(h.requests[0].options.signal.aborted, false);
    assert.equal(result, undefined);
    await h.advance(1);
    assert.equal(failure, undefined);
    assert.ok(result, 'body consumption is bounded by the original deadline');
    await pending;
    assertCustom(result);
    assert.equal(h.requests[0].options.signal.aborted, true);
    assert.equal(h.requests[1].at, CUSTOM_REQUEST_BUDGET_MS, 'receiving headers did not restart the timeout');
    assertRequests(h, [metadataGet(), searchSequence(CUSTOM)[0]]);
    assertPrivateSafety(h);
    assert.equal(h.requests.length, 2);
    assert.equal(h.timers.size, 0);
    body.resolve(record);
    await flush();
    assertCustom(result);
    assert.equal(h.requests.length, 2);
    assert.equal(h.timers.size, 0);
});

test('the remaining private-stage budget clips the last request rather than granting another five seconds', async () => {
    const responses = [];
    const h = setup({ endpoint: CUSTOM, custom: () => {
        const response = deferred();
        responses.push(response);
        return response.promise;
    } });
    let result;
    const pending = h.addon.getLyrics(track).then(value => { result = value; });
    await flush();
    for (let attempt = 0; attempt < 4; attempt++) {
        assert.equal(h.requests.length, attempt + 1);
        await h.advance(4500);
        responses[attempt].resolve(noMatch(h.requests[attempt].url));
        await flush();
    }
    assertRequests(h, customSequence());
    assert.equal(h.requests.at(-1).at, 18000);
    const body = deferred();
    let readingBody = false;
    responses.at(-1).resolve({ ok: true, status: 200, json() { readingBody = true; return body.promise; } });
    await flush();
    assert.equal(readingBody, true);
    await h.advance(1999);
    assert.equal(result, undefined);
    await h.advance(1);
    await pending;
    assertOfficial(result);
    assertRequests(h, [...customSequence(), metadataGet(OFFICIAL)]);
    assert.equal(h.requests.at(-1).at, CUSTOM_STAGE_BUDGET_MS);
    assert.equal(h.requests.at(-2).options.signal.aborted, true);
    assert.equal(h.timers.size, 0);
    body.resolve([record]);
    await flush();
    assertOfficial(result);
    assert.equal(h.requests.length, 6, 'late private responses cannot restart an exhausted stage');
    assertPrivateSafety(h);
});
