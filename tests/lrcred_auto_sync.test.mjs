import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../Addon_Lyrics_LrcRed.js', import.meta.url), 'utf8');
const ISRC = 'JPAAA2600001';
const info = { uri: 'spotify:track:AAAAAAAAAAAAAAAAAAAAAA', title: 'Fixture', artist: 'Artist', isrc: ISRC, durationMs: 200000 };
const flush = async () => { for (let i = 0; i < 3; i++) await new Promise(setImmediate); };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

function createProvider({ word = false, hold = false, status = 204, generatedWord = true, lrcOnly = false } = {}) {
    let addon, timerId = 0;
    const generated = new Set(word ? [ISRC] : []), requests = [], writes = [], refreshes = [], cleared = [], gates = [];
    const cache = new Map(), timers = new Map(), notices = [], statuses = [];
    const state = { uri: info.uri, provider: 'lrcred', isLoading: false };
    const player = { data: { item: { uri: info.uri } } };
    const h = { enabled: true, requests, writes, refreshes, cleared, cache, state, player, gates, notices, statuses };
    const line = { startTime: 1000, endTime: 2000, text: 'Fixture lyric' };
    const parsed = text => ({
        synced: [line],
        karaoke: text === 'word' ? [{ ...line, syllables: [{ text: 'Fixture lyric', startTime: 1000, endTime: 2000 }] }] : [],
    });
    const window = {
        CACHE: {},
        I18n: { t: key => `localized:${key}` },
        LyricsAddonManager: {
            register(value) { addon = value; }, getAddonSetting: () => h.enabled,
            emit: (event, detail) => { if (event === 'lyrics:word-sync:status') statuses.push(detail); },
        },
        LyricsService: {
            extractTrackId: uri => /^spotify:track:([A-Za-z0-9]{22})$/.exec(uri || '')?.[1] || '',
            getCachedLyrics: async key => cache.get(key),
            cacheLyrics: async (key, provider, value) => { cache.set(key, value); writes.push({ key, provider, value }); },
            clearLyricsPresentationSnapshot: uri => cleared.push(uri),
        },
        lyricContainer: {
            state, fetchLyrics() { assert.fail('Timing must not reload lyrics or translations'); },
            applyLyricsTimingUpgrade(value) { refreshes.push(value); window.CACHE[value.uri] = value; },
        },
        ivLyricsLyricsParser: { parseTtmlLyrics: parsed, parseLrcLyrics: () => parsed('line') },
    };
    const fetch = async (input, init = {}) => {
        const url = new URL(input);
        requests.push({ url, init });
        const isrc = /\/s\/([A-Z0-9]{12})/.exec(url.pathname)?.[1];
        if (init.method === 'POST') {
            if (hold) {
                const gate = deferred(); gates.push(gate);
                await new Promise((resolve, reject) => {
                    gate.promise.then(resolve);
                    init.signal.addEventListener('abort', () => reject(new DOMException('Timed out', 'AbortError')), { once: true });
                });
            }
            if (status >= 200 && status < 300 && generatedWord) generated.add(isrc);
            return new Response(null, { status, headers: { 'Retry-After': '60' } });
        }
        if (url.pathname.endsWith('.json')) return Response.json({ ...info, isrc, duration: 200 });
        if (url.pathname.endsWith('.ttml')) {
            if (lrcOnly && !generated.has(isrc)) return new Response(null, { status: 404 });
            return new Response(generated.has(isrc) ? 'word' : 'line');
        }
        if (url.pathname.endsWith('.lrc')) return new Response('[00:01.00]Fixture lyric');
        throw new Error(`Unexpected request: ${url}`);
    };
    const context = vm.createContext({
        window, fetch, AbortController, Spicetify: { Player: player, showNotification: text => notices.push(text) }, console: { warn() {} },
        setTimeout: (fn, delay) => { const id = ++timerId; timers.set(id, { fn, delay }); return id; },
        clearTimeout: id => timers.delete(id),
    });
    vm.runInContext(source, context, { filename: 'Addon_Lyrics_LrcRed.js' });
    return Object.assign(h, {
        addon, window,
        // Simulate the manager's explicit authorization after a complete
        // karaoke search. Direct addon reads do not start generation.
        lookup: async value => {
            const result = await addon.getLyrics(value);
            addon.requestWordSync(value, result);
            return result;
        },
        posts: () => requests.filter(request => request.init.method === 'POST'),
        runTimers: delay => { for (const [id, timer] of [...timers]) if (timer.delay === delay) { timers.delete(id); timer.fn(); } },
    });
}

test('line lyrics return immediately, then a bodyless POST upgrades cache and the current track', async () => {
    const h = createProvider({ hold: true });
    const result = await h.lookup(info);
    await flush();
    assert.equal(result.lrcred.syncType, 'line');
    assert.equal(result.synced[0].text, 'Fixture lyric');
    assert.equal(h.writes.length, 0, 'generation has not completed');
    assert.equal(h.posts().length, 1);
    assert.equal(h.posts()[0].url.pathname, `/s/${ISRC}/sync`);
    assert.equal(h.posts()[0].init.body, undefined);
    assert.equal(h.posts()[0].init.headers['X-Client-ID'], undefined, 'sync has no OPTIONS handler: avoid a preflight');
    assert.ok(h.requests.some(({ init }) => /ivLyrics.*github\.com/.test(init.headers['X-Client-ID'] || '')));
    h.gates[0].resolve();
    await flush();
    assert.equal(h.writes[0].key, 'AAAAAAAAAAAAAAAAAAAAAA');
    assert.equal(h.writes[0].value.lrcred.syncType, 'word');
    assert.ok(h.requests.some(({ url, init }) => url.searchParams.has('t') && init.cache === 'no-store'));
    assert.equal(h.refreshes.length, 1);
    assert.equal(h.window.CACHE[info.uri].karaokeSource, 'lrcred');
    assert.deepEqual(h.cleared, [], 'presentation/translation snapshots are retained');
    assert.deepEqual(h.notices, [], 'the shared status stack replaces toasts');
    assert.deepEqual(h.statuses.map(status => status.phase), ['generating', 'complete']);
    assert.equal(h.statuses[0].uri, info.uri);
    assert.equal(result.karaoke, null, 'the returned line result is not mutated later');
});

test('existing word timing never submits a generation request', async () => {
    const h = createProvider({ word: true });
    const result = await h.lookup(info);
    await flush();
    assert.equal(result.lrcred.syncType, 'word');
    assert.equal(h.posts().length, 0);
});

test('concurrent requests for the same recording share one generation and one delivery', async () => {
    const h = createProvider({ hold: true });
    await Promise.all([h.lookup(info), h.lookup(info)]);
    await flush();
    assert.equal(h.posts().length, 1);
    assert.equal(h.statuses.filter(status => status.phase === 'generating').length, 1);
    h.gates[0].resolve();
    await flush();
    assert.equal(h.writes.length, 1);
    assert.equal(h.refreshes.length, 1);
});

for (const status of [429, 503]) {
    test(`HTTP ${status} preserves line lyrics and cools down generation across tracks`, async () => {
        const h = createProvider({ status });
        const result = await h.lookup(info);
        await flush();
        await h.lookup(info);
        await h.lookup({ ...info, isrc: 'JPAAA2600002' });
        await flush();
        assert.equal(result.error, null);
        assert.equal(result.lrcred.syncType, 'line');
        assert.equal(h.posts().length, 1);
        assert.equal(h.writes.length, 0);
        assert.deepEqual(h.statuses.map(status => status.phase), ['generating', 'failed']);
    });
}

test('a sync timeout aborts the POST without losing existing lyrics or retrying immediately', async () => {
    const h = createProvider({ hold: true });
    const result = await h.lookup(info);
    await flush();
    h.runTimers(75000);
    await flush();
    assert.equal(h.posts()[0].init.signal.aborted, true);
    assert.equal(result.synced[0].text, 'Fixture lyric');
    await h.lookup(info);
    await flush();
    assert.equal(h.posts().length, 1);
    assert.equal(h.writes.length, 0);
    assert.deepEqual(h.statuses.map(status => status.phase), ['generating', 'failed']);
});

test('a successful POST with no usable word timing retains line lyrics', async () => {
    const h = createProvider({ generatedWord: false });
    const result = await h.lookup(info);
    await flush();
    assert.equal(result.lrcred.syncType, 'line');
    assert.equal(h.writes.length, 0);
    await h.lookup(info);
    await flush();
    assert.equal(h.posts().length, 1);
});

test('cached line lyrics check fresh TTML and reuse timing generated by another client', async () => {
    const h = createProvider();
    h.enabled = false;
    const result = await h.lookup(info);
    h.cache.set('AAAAAAAAAAAAAAAAAAAAAA', result);
    // Switch the read response to a word-timed fixture without requesting AI.
    const parsed = h.window.ivLyricsLyricsParser.parseTtmlLyrics;
    h.window.ivLyricsLyricsParser.parseTtmlLyrics = () => parsed('word');
    h.enabled = true;
    await h.addon.prepareLyricsLookup(info);
    h.addon.requestWordSync(info, result);
    await flush();
    assert.equal(h.posts().length, 0);
    assert.equal(h.writes[0].value.lrcred.syncType, 'word');
});

test('a late initial cache write is corrected before the next cached lookup', async () => {
    const h = createProvider();
    const lineResult = await h.lookup(info);
    await flush();
    h.cache.set('AAAAAAAAAAAAAAAAAAAAAA', lineResult);
    await h.addon.prepareLyricsLookup(info);
    assert.equal(h.cache.get('AAAAAAAAAAAAAAAAAAAAAA').lrcred.syncType, 'word');
    assert.equal(h.posts().length, 1);
});

test('LRC-only results also trigger the word timing upgrade', async () => {
    const h = createProvider({ lrcOnly: true });
    const result = await h.lookup(info);
    await flush();
    assert.equal(result.lrcred.syncType, 'line');
    assert.equal(h.posts().length, 1);
    assert.equal(h.writes[0].value.lrcred.syncType, 'word');
});

test('disabling word lyrics disables automatic generation', async () => {
    const h = createProvider(); h.enabled = false;
    await h.lookup(info);
    await flush();
    assert.equal(h.posts().length, 0);
});

for (const change of ['track', 'provider', 'community timing']) {
    test(`completion cannot replace a changed ${change}`, async () => {
        const h = createProvider({ hold: true });
        await h.lookup(info);
        await flush();
        if (change === 'track') h.player.data.item = { uri: 'spotify:track:BBBBBBBBBBBBBBBBBBBBBB' };
        else if (change === 'provider') h.state.provider = 'spotify';
        else h.state.syncDataApplied = true;
        h.gates[0].resolve();
        await flush();
        assert.equal(h.writes[0].value.uri, info.uri);
        assert.equal(h.refreshes.length, 0);
        assert.equal(h.window.CACHE[info.uri], undefined);
    });
}

test('a fast generation waits for the initial lyric view before refreshing', async () => {
    const h = createProvider(); h.state.isLoading = true;
    await h.lookup(info);
    await flush();
    assert.equal(h.refreshes.length, 0);
    h.state.isLoading = false;
    h.runTimers(100);
    await flush();
    assert.equal(h.refreshes.length, 1);
});

test('generations are serialized and the waiting queue is bounded', async () => {
    const h = createProvider({ hold: true });
    await Promise.all(Array.from({ length: 5 }, (_, index) => h.lookup({ ...info, isrc: `JPAAA260000${index + 1}` })));
    await flush();
    assert.equal(h.posts().length, 1);
    for (let i = 0; i < 4; i++) { h.gates[i].resolve(); await flush(); }
    assert.equal(h.posts().length, 4);
});

test('reading a provider or its cache never starts AI without manager authorization', async () => {
    const h = createProvider();
    const result = await h.addon.getLyrics(info);
    h.cache.set('AAAAAAAAAAAAAAAAAAAAAA', result);
    await h.addon.prepareLyricsLookup(info);
    await flush();
    assert.equal(h.posts().length, 0);
    assert.equal(h.notices.length, 0);
});

test('changed text from generation is never applied over translations of the original', async () => {
    const h = createProvider();
    const parse = h.window.ivLyricsLyricsParser.parseTtmlLyrics;
    h.window.ivLyricsLyricsParser.parseTtmlLyrics = text => text === 'word'
        ? { karaoke: [{ text: 'Different lyric' }], synced: [{ text: 'Different lyric' }] } : parse(text);
    await h.lookup(info);
    await flush();
    assert.equal(h.posts().length, 1);
    assert.equal(h.writes.length, 0);
    assert.equal(h.refreshes.length, 0);
});

test('prefetching another track never shows a generation notice for the playing track', async () => {
    const h = createProvider();
    await h.lookup({ ...info, uri: 'spotify:track:BBBBBBBBBBBBBBBBBBBBBB' });
    await flush();
    assert.equal(h.posts().length, 1);
    assert.equal(h.notices.length, 0);
    assert.equal(h.refreshes.length, 0);
    assert.ok(h.statuses.every(status => status.uri === 'spotify:track:BBBBBBBBBBBBBBBBBBBBBB'));
});

test('in-flight status is replayable when opening the lyrics page, and clears after delivery', async () => {
    const h = createProvider({ hold: true });
    await h.lookup(info);
    await flush();
    const active = h.addon.getWordSyncStatuses(info.uri);
    assert.equal(active.length, 1);
    assert.equal(active[0].phase, 'generating');
    assert.equal(h.addon.getWordSyncStatuses('spotify:track:BBBBBBBBBBBBBBBBBBBBBB').length, 0);
    h.gates[0].resolve();
    await flush();
    assert.equal(h.addon.getWordSyncStatuses(info.uri).length, 0);
    assert.equal(h.statuses[0].requestId, h.statuses[1].requestId);
});
