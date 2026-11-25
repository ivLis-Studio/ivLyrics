import { publishRuntimeService } from "#ivlyrics/spicetify/runtimeServices.mjs";
import { bundleInitializer } from "./fixtures/initializer-bundle.mjs";
import { createLyricsProviderCandidateLoader } from "#ivlyrics/providers/lyrics/loadLyricsProviderCandidate.mjs";
import { LYRICS_TYPES, SYNC_DATA_RENDERER_VERSION } from "#ivlyrics/providers/lyrics/lyricsProviderTypes.mjs";
import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';

const source = bundleInitializer(new URL('../src/providers/lyrics/Addon_Lyrics_LrcRed.js', import.meta.url));
const ISRC = 'JPAAA2600001';
const CACHE_ID = 'AAAAAAAAAAAAAAAAAAAAAA';
const info = { uri: 'spotify:track:AAAAAAAAAAAAAAAAAAAAAA', title: 'Fixture', artist: 'Artist', isrc: ISRC, durationMs: 200000 };
const flush = async () => { for (let i = 0; i < 3; i++) await new Promise(setImmediate); };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

function createProvider({ word = false, hold = false, holdBody = false, holdFresh = false, status = 200, generatedWord = true, lrcOnly = false, syncResponse, text = 'Fixture lyric' } = {}) {
    let addon, timerId = 0;
    const generated = new Set(word ? [ISRC] : []), requests = [], writes = [], refreshes = [], cleared = [], gates = [];
    const cache = new Map(), timers = new Map(), notices = [], statuses = [];
    const state = { uri: info.uri, provider: 'lrcred', isLoading: false };
    const player = { data: { item: { uri: info.uri } } };
    const h = { enabled: true, requests, writes, refreshes, cleared, cache, state, player, gates, notices, statuses, bodyReads: 0,
        revisions: new Map(), pendingFresh: [] };
    const line = { startTime: 1000, endTime: 2000, text };
    const parsed = text => ({
        synced: [line],
        karaoke: text === 'word' ? [{ ...line, syllables: [{ text: line.text, startTime: 1000, endTime: 2000 }] }] : [],
    });
    const window = {
        CACHE: {},
        I18n: { t: key => `localized:${key}` },
        LyricsAddonManager: {
            register(value) { addon = value; }, getAddonSetting: () => h.enabled,
            emit: (event, detail) => { if (event === 'lyrics:word-sync:status') statuses.push(detail); },
        },
        LyricsService: {
            getLyricsRequestRevision: uri => h.revisions.get(uri) || 0,
            extractTrackId: uri => /^spotify:track:([A-Za-z0-9]{22})$/.exec(uri || '')?.[1] || '',
            getCachedLyrics: async key => cache.get(key),
            cacheLyrics: async (key, provider, value) => { cache.set(key, value); writes.push({ key, provider, value }); },
            async updateCachedLyrics(key, provider, update) {
                const value = update(cache.get(key) ?? null);
                if (value != null) await this.cacheLyrics(key, provider, value);
            },
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
            const words = line.text.split(/\s+/u).filter(Boolean);
            const payload = syncResponse || { id: isrc, lyrics: {
                sync: generatedWord ? 'word' : 'line', timing: generatedWord ? 'word' : 'line',
                lines: [{ text: line.text, begin: 1, end: 2,
                    words: words.map((text, index) => [{ text, begin: 1 + index / words.length, end: 1 + (index + 1) / words.length }]),
                }],
            } };
            if (holdBody) return {
                ok: status >= 200 && status < 300, status, headers: new Headers(),
                json: async () => {
                    h.bodyReads++;
                    const gate = deferred(); gates.push(gate);
                    await new Promise((resolve, reject) => {
                        gate.promise.then(resolve);
                        init.signal.addEventListener('abort', () => reject(new DOMException('Timed out', 'AbortError')), { once: true });
                    });
                    return payload;
                },
            };
            // Generation output exists only in this response. The public
            // TTML deliberately remains line-timed to catch stale re-fetches.
            return Response.json(payload, { status, headers: { 'Retry-After': '60' } });
        }
        if (url.pathname.endsWith('.json')) return Response.json({ ...info, isrc, duration: 200 });
        if (url.pathname.endsWith('.ttml')) {
            if (holdFresh && url.searchParams.has('t')) {
                const gate = deferred();
                h.pendingFresh.push(gate);
                await gate.promise;
            }
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
    const postIndex = h.requests.findIndex(request => request.init.method === 'POST');
    assert.equal(h.requests.slice(postIndex + 1).length, 0, 'use the JSON response rather than re-fetching stale TTML');
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

test('a failed display can reuse the generated timing without starting another POST', async () => {
    const h = createProvider();
    const apply = h.window.lyricContainer.applyLyricsTimingUpgrade;
    h.window.lyricContainer.applyLyricsTimingUpgrade = () => false;
    const base = await h.lookup(info);
    await flush();
    assert.equal(h.posts().length, 1);
    assert.equal(h.refreshes.length, 0);
    assert.deepEqual(h.statuses.map(({ phase }) => phase), ['generating', 'failed']);

    h.window.lyricContainer.applyLyricsTimingUpgrade = apply;
    h.addon.requestWordSync(info, base);
    await flush();
    assert.equal(h.posts().length, 1);
    assert.equal(h.refreshes.length, 1);
    assert.equal(h.refreshes[0].karaoke[0].syllables.length, 2);
    h.addon.requestWordSync(info, base);
    await flush();
    assert.equal(h.refreshes.length, 1, 'a delivered upgrade remains deduplicated');
});

test('an invalidated word-sync request cannot refill a cleared cache even inside the pending write transaction', async () => {
    const h = createProvider({ hold: true });
    const transaction = deferred();
    const service = h.window.LyricsService;
    const update = service.updateCachedLyrics.bind(service);
    let entered = false;
    service.updateCachedLyrics = async (...args) => {
        entered = true;
        await transaction.promise;
        return update(...args);
    };
    await h.lookup(info); await flush();
    h.gates[0].resolve(); await flush();
    assert.equal(entered, true);
    h.revisions.set(info.uri, 1);
    transaction.resolve(); await flush();
    assert.equal(h.cache.has(CACHE_ID), false);
    assert.equal(h.refreshes.length, 0);
    assert.deepEqual(h.statuses.map(({ phase }) => phase), ['generating', 'cancelled']);
});

test('a new revision can adopt an ongoing word-sync response without starting another generation', async () => {
    const h = createProvider({ hold: true });
    const base = await h.lookup(info); await flush();
    h.revisions.set(info.uri, 1);
    assert.equal(h.addon.getWordSyncStatuses(info.uri).length, 0);
    h.addon.requestWordSync(info, base);
    assert.equal(h.addon.getWordSyncStatuses(info.uri).length, 1);
    h.gates[0].resolve(); await flush();
    assert.equal(h.posts().length, 1);
    assert.equal(h.writes.length, 1);
    assert.equal(h.refreshes.length, 1);
    assert.deepEqual(h.statuses.map(({ phase }) => phase), ['generating', 'complete']);
});

test('disabling word sync during the fresh TTML check prevents the queued POST', async () => {
    const h = createProvider({ holdFresh: true });
    await h.lookup(info); await flush();
    assert.equal(h.pendingFresh.length, 1);
    h.enabled = false;
    h.pendingFresh[0].resolve(); await flush();
    assert.equal(h.posts().length, 0);
    assert.deepEqual(h.statuses, []);
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
    assert.deepEqual(h.statuses.map(status => status.phase), ['generating', 'failed']);
});

test('HTTP 422 reports failure instead of completion and keeps the line lyrics', async () => {
    const h = createProvider({ status: 422 });
    const result = await h.lookup(info); await flush();
    assert.equal(result.synced[0].text, 'Fixture lyric');
    assert.equal(h.writes.length, 0);
    assert.equal(h.refreshes.length, 0);
    assert.deepEqual(h.statuses.map(status => status.phase), ['generating', 'failed']);
});

for (const failure of ['rejected apply', 'missing apply', 'cache error']) {
    test(`${failure} cannot show word sync completion`, async () => {
        const h = createProvider();
        if (failure === 'rejected apply') h.window.lyricContainer.applyLyricsTimingUpgrade = async () => false;
        else if (failure === 'missing apply') delete h.window.lyricContainer.applyLyricsTimingUpgrade;
        else h.window.LyricsService.cacheLyrics = async () => { throw new Error('Cache unavailable'); };
        await h.lookup(info); await flush();
        assert.equal(h.refreshes.length, 0);
        assert.deepEqual(h.statuses.map(status => status.phase), ['generating', 'failed']);
    });
}

test('giving up on a stuck initial lyric view reports failure, not completion', async () => {
    const h = createProvider(); h.state.isLoading = true;
    await h.lookup(info); await flush();
    for (let i = 0; i < 200; i++) { h.runTimers(100); await flush(); }
    assert.equal(h.refreshes.length, 0);
    assert.deepEqual(h.statuses.map(status => status.phase), ['generating', 'failed']);
});

for (const applied of [true, false]) {
    test(`POST completion waits for the React commit acknowledgment (applied ${applied})`, async () => {
        const h = createProvider(), gate = deferred();
        h.window.lyricContainer.applyLyricsTimingUpgrade = () => gate.promise;
        await h.lookup(info); await flush();
        assert.equal(h.writes.length, 1);
        assert.deepEqual(h.statuses.map(status => status.phase), ['generating']);
        gate.resolve(applied); await flush();
        assert.deepEqual(h.statuses.map(status => status.phase), ['generating', applied ? 'complete' : 'failed']);
    });
}

test('late word timing is delivered to the registered page even if the compatibility alias is stale', async () => {
    const h = createProvider({ hold: true });
    publishRuntimeService("lyricContainer", h.window.lyricContainer, h.window);
    await h.lookup(info);
    await flush();
    h.window.lyricContainer = {
        state: h.state,
        applyLyricsTimingUpgrade() { assert.fail('Late timing must not reach the stale page'); },
    };
    h.gates[0].resolve();
    await flush();
    assert.equal(h.refreshes.length, 1);
    assert.deepEqual(h.statuses.map(status => status.phase), ['generating', 'complete']);
});

test('generation without a mounted page upgrades the visible snapshot and retains supplements', async () => {
    const h = createProvider({ hold: true });
    const result = await h.lookup(info); await flush();
    h.window.CACHE[info.uri] = result;
    const translated = [{ ...result.synced[0], text2: 'existing translation', phoneticText: 'existing pronunciation' }];
    let snapshot = { trackUri: info.uri, rawResult: result, displayLyrics: translated,
        displayMode1: 'existing-mode', presentationComplete: true, revision: 3 };
    h.window.LyricsService.getLyricsSnapshot = () => snapshot;
    h.window.LyricsService.publishLyricsSnapshot = value => { snapshot = value; };
    delete h.window.lyricContainer;
    h.gates[0].resolve(); await flush();
    assert.equal(h.window.CACHE[info.uri].karaoke.length, 1);
    assert.equal(snapshot.rawResult.karaoke.length, 1);
    assert.equal(snapshot.displayLyrics[0].text2, 'existing translation');
    assert.equal(snapshot.displayLyrics[0].phoneticText, 'existing pronunciation');
    assert.equal(snapshot.displayLyrics[0].syllables.length, 2);
    assert.equal(translated[0].syllables, undefined);
    assert.equal(snapshot.lyricsType, 'karaoke');
    assert.equal(snapshot.timingUpgradeFromRevision, 3);
    assert.equal(snapshot.timingUpgradeApplied, true);
    assert.equal(snapshot.displayMode1, 'existing-mode');
    assert.equal(snapshot.presentationComplete, true);
    assert.equal(h.refreshes.length, 0);
    assert.deepEqual(h.statuses.map(status => status.phase), ['generating', 'complete']);
});

test('generation respects the saved karaoke preference before the lyrics page has loaded', async () => {
    const h = createProvider({ hold: true });
    const result = await h.lookup(info); await flush();
    delete h.window.lyricContainer;
    h.window.Spicetify = { LocalStorage: { get: key => key === 'ivLyrics:visual:karaoke-mode-enabled' ? 'false' : null } };
    let snapshot = { trackUri: info.uri, rawResult: result, displayLyrics: result.synced, lyricsType: 'synced' };
    h.window.LyricsService.getLyricsSnapshot = () => snapshot;
    h.window.LyricsService.publishLyricsSnapshot = value => { snapshot = value; };
    h.gates[0].resolve(); await flush();

    assert.equal(snapshot.rawResult.karaoke.length, 1);
    assert.strictEqual(snapshot.displayLyrics, result.synced);
    assert.equal(snapshot.timingUpgradeApplied, false);
    assert.equal(snapshot.lyricsType, 'synced');
});

for (const phase of ['initial load', 'React commit']) {
    test(`closing the page during ${phase} delivers the same timing to the shared presentation`, async () => {
        const h = createProvider({ hold: true }), commit = deferred();
        h.state.isLoading = phase === 'initial load';
        h.window.lyricContainer.applyLyricsTimingUpgrade = () => commit.promise;
        const result = await h.lookup(info); await flush();
        let snapshot = { trackUri: info.uri, provider: 'lrcred', rawResult: result, lyricsType: 'synced', revision: 3,
            displayLyrics: result.synced.map(line => ({ ...line, text2: 'existing translation' })) };
        h.window.LyricsService.getLyricsSnapshot = () => snapshot;
        h.window.LyricsService.publishLyricsSnapshot = value => { snapshot = { ...value, revision: snapshot.revision + 1 }; };
        h.gates[0].resolve(); await flush();
        assert.equal(snapshot.timingUpgradeApplied, false);
        assert.deepEqual(h.statuses.map(status => status.phase), ['generating']);

        delete h.window.lyricContainer;
        if (h.state.isLoading) h.runTimers(100);
        else commit.resolve(false);
        await flush();
        assert.equal(snapshot.timingUpgradeFromRevision, 3);
        assert.equal(snapshot.timingUpgradeApplied, true);
        assert.equal(snapshot.displayLyrics[0].syllables.length, 2);
        assert.equal(snapshot.displayLyrics[0].text2, 'existing translation');
        assert.deepEqual(h.statuses.map(status => status.phase), ['generating', 'complete']);
    });
}

for (const newer of ['other provider', 'different recording', 'changed text', 'cache version', 'community sync', 'native timing']) {
    test(`generation cannot overwrite newer raw caches with ${newer}`, async () => {
        const h = createProvider({ hold: true });
        const result = await h.lookup(info); await flush();
        const cached = { ...result };
        if (newer === 'other provider') cached.provider = 'spotify';
        else if (newer === 'different recording') cached.lrcred = { isrc: 'JPAAA2600002' };
        else if (newer === 'changed text') cached.synced = [{ ...result.synced[0], text: 'Edited lyric' }];
        else if (newer === 'cache version') cached.cacheVersion = 'newer-cache-version';
        else if (newer === 'community sync') cached.syncDataApplied = true;
        else { cached.karaoke = [result.synced[0]]; cached.karaokeSource = 'lrcred'; }
        h.window.CACHE[info.uri] = cached;
        h.cache.set(CACHE_ID, cached);
        delete h.window.lyricContainer;
        h.gates[0].resolve(); await flush();
        assert.strictEqual(h.window.CACHE[info.uri], cached);
        assert.strictEqual(h.cache.get(CACHE_ID), cached);
        assert.equal(h.writes.length, 0);
    });
}

test('a word upgrade for the same URI during DJ narration warms only raw timing', async () => {
    const h = createProvider({ hold: true });
    const result = await h.lookup(info); await flush();
    publishRuntimeService("ivLyricsPlaybackPosition", {
        getPlayerPlaybackSnapshot: () => ({ uri: info.uri, djNarration: true }),
    }, h.window);
    const lyrics = [{ ...result.synced[0], text2: 'prior translation' }];
    let snapshot = { trackUri: info.uri, rawResult: result, displayLyrics: lyrics, lyricsType: 'synced' };
    h.window.LyricsService.getLyricsSnapshot = () => snapshot;
    h.window.LyricsService.publishLyricsSnapshot = value => { snapshot = value; };
    h.gates[0].resolve(); await flush();
    assert.equal(snapshot.rawResult.karaoke.length, 1);
    assert.strictEqual(snapshot.displayLyrics, lyrics);
    assert.equal(snapshot.lyricsType, 'synced');
    assert.equal(snapshot.timingUpgradeApplied, false);
    assert.equal(h.refreshes.length, 0);
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

test('cache repair checks the latest record before applying prepared timing', async () => {
    const h = createProvider();
    const lineResult = await h.lookup(info);
    await flush();
    h.cache.set(CACHE_ID, lineResult);
    const service = h.window.LyricsService;
    const community = { ...lineResult, syncDataApplied: true, karaoke: lineResult.synced };
    service.getCachedLyrics = async () => {
        h.cache.set(CACHE_ID, community);
        return lineResult;
    };

    await h.addon.prepareLyricsLookup(info);
    assert.strictEqual(h.cache.get(CACHE_ID), community);
    assert.equal(h.writes.length, 1, 'only the initial generation wrote to the cache');
});

for (const timing of ['word', 'community', 'different recording']) {
    test(`a slow line lyrics lookup respects cache ownership after ${timing}`, async () => {
        const h = createProvider();
        const lineResult = await h.addon.getLyrics(info);
        const syncRequestStarted = deferred();
        const syncResponse = deferred();
        const loadCandidate = createLyricsProviderCandidateLoader({
            readLyricsService: () => h.window.LyricsService,
            readSyncDataService: () => ({
                getSyncData() {
                    syncRequestStarted.resolve();
                    return syncResponse.promise;
                },
            }),
            readPseudoKaraoke: () => null,
            normalizeProviderInstrumentalBreaks: result => ({ result, changed: false }),
            readAddonDebug: () => null,
            debug() {},
        });
        const loading = loadCandidate(h.addon, info, {
            lyricsCacheId: CACHE_ID, trackId: CACHE_ID, trackIsrc: ISRC,
        }, {
            [LYRICS_TYPES.SYNCED]: true, [LYRICS_TYPES.CHARACTER]: true, [LYRICS_TYPES.WORD]: true,
        }, () => false);
        await syncRequestStarted.promise;
        const updated = { ...lineResult, karaoke: lineResult.synced, karaokeSource: 'lrcred' };
        if (timing === 'community') {
            updated.syncDataApplied = true;
            updated.syncDataRendererVersion = SYNC_DATA_RENDERER_VERSION;
        } else if (timing === 'different recording') {
            updated.lrcred = { ...updated.lrcred, isrc: 'JPAAA2600002' };
        }
        h.cache.set(CACHE_ID, updated);
        syncResponse.resolve(null);
        await loading;
        const final = h.cache.get(CACHE_ID);
        if (timing === 'different recording') {
            assert.equal(final.lrcred.isrc, ISRC);
            assert.equal(final.karaoke, null);
        } else {
            assert.strictEqual(final, updated);
            assert.equal(h.writes.length, 0);
        }
    });
}

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

for (const change of ['track', 'provider', 'community timing', 'cache version', 'error']) {
    test(`completion cannot replace a changed ${change}`, async () => {
        const h = createProvider({ hold: true });
        await h.lookup(info);
        await flush();
        if (change === 'track') h.player.data.item = { uri: 'spotify:track:BBBBBBBBBBBBBBBBBBBBBB' };
        else if (change === 'provider') h.state.provider = 'spotify';
        else if (change === 'community timing') h.state.syncDataApplied = true;
        else if (change === 'cache version') h.state.cacheVersion = 'newly selected result';
        else h.state.error = 'New result unavailable';
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
    assert.deepEqual(h.statuses.map(status => status.phase), ['generating']);
    h.state.isLoading = false;
    h.runTimers(100);
    await flush();
    assert.equal(h.refreshes.length, 1);
    assert.deepEqual(h.statuses.map(status => status.phase), ['generating', 'complete']);
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
    const h = createProvider({ syncResponse: { id: ISRC, lyrics: { timing: 'word', lines: [{
        text: 'Different lyric', begin: 1, end: 2, words: [[{ text: 'Different lyric', begin: 1, end: 2 }]],
    }] } } });
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

test('response headers do not complete generation before the full JSON body arrives', async () => {
    const h = createProvider({ holdBody: true });
    await h.lookup(info); await flush();
    assert.equal(h.bodyReads, 1);
    assert.equal(h.writes.length, 0);
    assert.deepEqual(h.statuses.map(status => status.phase), ['generating']);
    assert.equal(h.addon.getWordSyncStatuses(info.uri).length, 1);
    h.gates[0].resolve(); await flush();
    assert.equal(h.writes[0].value.lrcred.syncType, 'word');
    assert.deepEqual(h.statuses.map(status => status.phase), ['generating', 'complete']);
});

test('body download remains under the generation timeout', async () => {
    const h = createProvider({ holdBody: true });
    await h.lookup(info); await flush();
    h.runTimers(75000); await flush();
    assert.equal(h.posts()[0].init.signal.aborted, true);
    assert.equal(h.writes.length, 0);
    assert.deepEqual(h.statuses.map(status => status.phase), ['generating', 'failed']);
});

test('timed word fragments join without inserting spaces inside a word', async () => {
    const h = createProvider({ text: 'Bodies moving', syncResponse: { id: ISRC, lyrics: { timing: 'word', lines: [{
        text: 'Bodies moving', begin: 1, end: 2,
        words: [[{ text: 'Bod', begin: 1, end: 1.2 }, { text: 'ies', begin: 1.2, end: 1.5 }],
            [{ text: 'moving', begin: 1.5, end: 2 }]],
    }] } } });
    await h.lookup(info); await flush();
    const words = h.writes[0].value.karaoke[0].syllables;
    assert.equal(words[0].text, 'Bodies ');
    assert.equal(words[0].startTime, 1000);
    assert.equal(words[0].endTime, 1500);
    assert.equal(words[1].text, 'moving');
});

test('unspaced Japanese words retain the original text', async () => {
    const h = createProvider({ text: 'テスト歌詞', syncResponse: { id: ISRC, lyrics: { timing: 'word', lines: [{
        text: 'テスト歌詞', begin: 1, end: 2,
        words: [[{ text: 'テスト', begin: 1, end: 1.5 }], [{ text: '歌詞', begin: 1.5, end: 2 }]],
    }] } } });
    await h.lookup(info); await flush();
    assert.equal(h.writes[0].value.karaoke[0].syllables.map(word => word.text).join(''), 'テスト歌詞');
});

for (const [name, response] of [
    ['another recording', { id: 'JPAAA2600099', lyrics: { timing: 'word', lines: [] } }],
    ['invalid timing', { id: ISRC, lyrics: { timing: 'word', lines: [{
        text: 'Fixture lyric', begin: 2, end: 1, words: [[{ text: 'Fixture lyric', begin: 2, end: 1 }]],
    }] } }],
]) {
    test(`a response with ${name} cannot replace existing lyrics`, async () => {
        const h = createProvider({ syncResponse: response });
        await h.lookup(info); await flush();
        assert.equal(h.writes.length, 0);
        assert.deepEqual(h.statuses.map(status => status.phase), ['generating', 'failed']);
    });
}
