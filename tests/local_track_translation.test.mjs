import assert from 'node:assert/strict';
import test from 'node:test';
import { createTranslator } from "#ivlyrics/lyrics/createTranslator.mjs";
import { trackIdentity } from '../src/core/trackIdentity.mjs';

const localA = 'spotify:local:Artist:Album:Song%20A:180';
const localB = 'spotify:local:Artist:Album:Song%20B:180';
const spotifyId = '6QDv6s76britJEg8L9tXvX';

function load(uri = localA) {
    const calls = [], reads = [], writes = [], cache = new Map();
    const key = args => JSON.stringify(args);
    const player = { data: { item: { uri } } };
    const window = {
        AIAddonManager: {
            getTranslationStyle: () => 'natural',
            async translateLyrics(params) {
                calls.push(params);
                return params.wantSmartPhonetic
                    ? { phonetic: ['hello', 'world'] }
                    : { translation: ['안녕', '세상'] };
            },
            async translateMetadata(params) {
                calls.push(params);
                return { translated: { title: '노래', artist: '가수' } };
            },
        },
    };
    const cacheService = {
        async getTranslation(...args) { reads.push(args); return cache.get(key(args)) ?? null; },
        async setTranslation(id, lang, phonetic, value, provider, hash, canWrite = () => true) {
            if (!canWrite()) return;
            writes.push([id, lang, phonetic, value, provider, hash]);
            cache.set(key([id, lang, phonetic, provider, hash]), value);
        },
        async getMetadata(id, lang) { return cache.get(key([id, lang])); },
        async setMetadata(id, lang, value, canWrite = () => true) {
            if (canWrite()) cache.set(key([id, lang]), value);
        },
        async getCulturalAnnotations(...args) { return cache.get(key(args)); },
        async setCulturalAnnotations(id, lang, sourceLang, provider, hash, value, canWrite = () => true) {
            if (canWrite()) cache.set(key([id, lang, sourceLang, provider, hash]), value);
        },
    };
    const api = createTranslator({
        LocalLanguageConverter: class {},
        getActiveTranslationCacheId: () => trackIdentity.getTranslationCacheId(player.data?.item?.uri),
        getTargetLanguage: () => 'ko',
        getPronunciationNotation: () => 'translation',
        getAIManager: () => window.AIAddonManager,
        getPronunciationSlots: () => undefined,
        getApiTracker: () => undefined,
        detectLyricsLanguage: () => 'auto',
        errorMessage: (_key, fallback) => fallback,
        debug() {},
        cache: cacheService,
    });
    return { api, identity: trackIdentity, calls, reads, writes, player, window, cacheService };
}

const request = { text: 'Hello\nWorld', title: 'Song', artist: 'Artist', provider: 'local' };

test('a slow cache read cannot attach a later translation style to an earlier cache key', async () => {
    const h = load();
    const read = Promise.withResolvers();
    const originalRead = h.cacheService.getTranslation;
    h.cacheService.getTranslation = () => read.promise;
    const natural = h.api.callGemini(request);
    h.window.AIAddonManager.getTranslationStyle = () => 'literal';
    h.cacheService.getTranslation = originalRead;
    await h.api.callGemini(request);
    read.resolve(null);
    await natural;
    assert.deepEqual(h.calls.map(params => params.translationStyle), ['literal', 'natural']);
    assert.equal(h.writes[0][5], `${h.writes[1][5]}:style=literal`);
});

test('legacy wrapped results are normalized once and incomplete responses are not cached', async () => {
    const h = load();
    h.window.AIAddonManager.translateLyrics = async () => ({ translation: ['{"translation":["one",""]}'] });
    assert.deepEqual((await h.api.callGemini(request)).translation, ['one', '']);
    assert.equal(h.writes.length, 0);
    h.window.AIAddonManager.translateLyrics = async () => ({ vi: ['{"translation":["one","two"]}'] });
    assert.deepEqual((await h.api.callGemini(request)).translation, ['one', 'two']);
    assert.deepEqual((await h.api.callGemini(request)).translation, ['one', 'two']);
    assert.equal(h.writes.length, 1);
});

test('clearing a track rejects a late translation write even after persistence has started', async () => {
    const h = load();
    const reachedWrite = Promise.withResolvers();
    const releaseWrite = Promise.withResolvers();
    const originalSet = h.cacheService.setTranslation;
    h.cacheService.setTranslation = async (...args) => {
        reachedWrite.resolve();
        await releaseWrite.promise;
        return originalSet(...args);
    };
    const obsolete = h.api.callGemini(request);
    await reachedWrite.promise;
    h.api.clearMemoryCache(h.identity.getTranslationCacheId(localA));
    h.cacheService.setTranslation = originalSet;
    h.window.AIAddonManager.translateLyrics = async () => ({ translation: ['current', 'result'] });
    await h.api.callGemini(request);
    releaseWrite.resolve();
    await obsolete;
    assert.equal(h.writes.length, 1);
    assert.deepEqual((await h.api.callGemini(request)).translation, ['current', 'result']);
});

test('a foreground consumer joins the background lyrics stream without starting another provider', async () => {
    const h = load();
    const started = Promise.withResolvers();
    const output = Promise.withResolvers();
    h.window.AIAddonManager.translateLyrics = params => {
        h.calls.push(params);
        started.resolve(params);
        return output.promise;
    };
    const background = h.api.callGemini(request);
    const stream = await started.promise;
    stream.onLine(0, 'Discarded draft');
    stream.onStreamReset({ reason: 'provider-fallback' });
    stream.onLine(0, 'First line');

    const visible = [], legacy = [];
    const firstView = h.api.callGemini({
        ...request, onLine: (...args) => visible.push(args.slice(0, 2)),
        onStreamReset: detail => visible.push(detail.reason),
    });
    const secondView = h.api.callGemini({ ...request, onLine: (index, text) => legacy.push([index, text]) });
    assert.deepEqual(visible, ['provider-fallback', [0, 'First line']]);
    assert.deepEqual(legacy, [[0, 'First line']]);
    stream.onStreamReset({ reason: 'retry' });
    stream.onLine(1, 'Second line');
    assert.deepEqual(visible, ['provider-fallback', [0, 'First line'], 'retry', [1, 'Second line']]);
    assert.deepEqual(legacy, [[0, 'First line'], [0, ''], [1, 'Second line']]);

    const final = { translation: ['First final', 'Second final'] };
    output.resolve(final);
    assert.deepEqual(await Promise.all([background, firstView, secondView]), [final, final, final]);
    assert.equal(h.calls.length, 1);
    assert.equal(h.writes.length, 1);
    stream.onLine(0, 'After completion');
    assert.deepEqual(visible.at(-1), [1, 'Second line']);
});

test('an observer-triggered retry reaches every display before its replacement rows', async () => {
    const h = load();
    const started = Promise.withResolvers();
    const output = Promise.withResolvers();
    h.window.AIAddonManager.translateLyrics = params => {
        started.resolve(params);
        return output.promise;
    };

    let stream;
    const first = h.api.callGemini({
        ...request,
        onLine(_index, text) {
            if (text !== 'Discarded line') return;
            stream.onStreamReset({ reason: 'retry' });
            stream.onLine(0, 'Replacement line');
        },
    });
    stream = await started.promise;
    const observed = [];
    const second = h.api.callGemini({
        ...request,
        onLine: (_index, text) => observed.push(text),
        onStreamReset: detail => observed.push(detail.reason),
    });
    stream.onLine(0, 'Discarded line');
    output.resolve({ translation: ['Replacement line', 'Second final'] });
    await Promise.all([first, second]);
    assert.deepEqual(observed, ['Discarded line', 'retry', 'Replacement line']);
});

test('cache clearing settles all old readers even if the provider ignores cancellation', { timeout: 2000 }, async () => {
    const h = load();
    const started = Promise.withResolvers();
    const oldOutput = Promise.withResolvers();
    h.window.AIAddonManager.translateLyrics = params => {
        started.resolve(params);
        return oldOutput.promise;
    };
    const first = h.api.callGemini(request);
    const oldStream = await started.promise;
    const observed = [];
    const second = h.api.callGemini({ ...request, onLine: (...args) => observed.push(args) });
    h.api.clearMemoryCache(h.identity.getTranslationCacheId(localA));
    assert.deepEqual(await Promise.all([first, second]), [null, null]);
    assert.equal(oldStream.signal.aborted, true);
    oldStream.onLine(0, 'Late stream');
    assert.deepEqual(observed, []);
    h.window.AIAddonManager.translateLyrics = async () => ({ translation: ['New one', 'New two'] });
    const current = await h.api.callGemini(request);
    oldOutput.resolve({ translation: ['Old one', 'Old two'] });
    await Promise.resolve();
    assert.equal(h.writes.length, 1);
    assert.deepEqual(await h.api.callGemini(request), current);
});

test('cultural annotation regeneration shares its result with readers and exclusively owns storage', async () => {
    const h = load();
    const pending = [];
    const manager = h.window.AIAddonManager;
    manager.getEnabledProvidersFor = () => [{ id: 'provider' }];
    manager.generateCulturalAnnotations = () => {
        const call = Promise.withResolvers();
        pending.push(call);
        return call.promise;
    };
    const params = { ...request, provider: 'provider', lines: [{ text: 'Hello' }] };
    const old = h.api.generateCulturalAnnotations(params);
    await Promise.resolve();
    const refresh = h.api.generateCulturalAnnotations({ ...params, ignoreCache: true });
    const joined = h.api.generateCulturalAnnotations(params);
    assert.equal(pending.length, 2);
    const latest = { provider: 'provider', annotations: [{ text: 'new' }] };
    pending[1].resolve(latest);
    assert.deepEqual(await refresh, latest);
    assert.deepEqual(await joined, latest);
    pending[0].resolve({ provider: 'provider', annotations: [{ text: 'old' }] });
    await old;
    assert.deepEqual(await h.api.generateCulturalAnnotations(params), latest);
    assert.equal(pending.length, 2);
});

for (const phonetic of [false, true]) {
    test(`${phonetic ? 'pronunciation' : 'translation'} readers join regeneration ahead of an older stored result`, async () => {
        const h = load();
        const field = phonetic ? 'phonetic' : 'translation';
        const params = { ...request, wantSmartPhonetic: phonetic };
        await h.api.callGemini(params);
        let finish;
        h.window.AIAddonManager.translateLyrics = () => new Promise(resolve => { finish = resolve; });
        const regeneration = h.api.callGemini({ ...params, ignoreCache: true });
        const joined = h.api.callGemini(params);
        finish({ [field]: ['새 결과', '새 결과'] });
        await regeneration;
        assert.equal((await joined)[field][0], '새 결과');
    });

    for (const order of ['old-first', 'regeneration-first']) {
        test(`${phonetic ? 'pronunciation' : 'translation'} regeneration owns persistent cache and pending cleanup (${order})`, async () => {
            const h = load();
            const pending = [];
            const field = phonetic ? 'phonetic' : 'translation';
            h.window.AIAddonManager.translateLyrics = () => new Promise(resolve => pending.push(resolve));
            const params = { ...request, wantSmartPhonetic: phonetic };
            const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
            const old = h.api.callGemini(params);
            await flush();
            const regeneration = h.api.callGemini({ ...params, ignoreCache: true });
            await flush();
            assert.equal(pending.length, 2);
            const settleOld = async () => { pending[0]({ [field]: ['obsolete', 'obsolete'] }); await old; };
            const settleRegeneration = async () => { pending[1]({ [field]: ['새 결과', '새 결과'] }); await regeneration; };
            if (order === 'old-first') {
                await settleOld();
                assert.equal(h.writes.length, 0, 'an obsolete request cannot persist over a running regeneration');
                const joined = h.api.callGemini(params);
                await flush();
                assert.equal(pending.length, 2, 'old cleanup must retain regeneration deduplication');
                await settleRegeneration();
                assert.equal((await joined)[field][0], '새 결과');
            } else {
                await settleRegeneration();
                await settleOld();
            }
            assert.equal((await h.api.callGemini(params))[field][0], '새 결과');
            assert.equal(h.writes.length, 1, 'only the current generation is saved');
        });
    }
}

test('local translation identities retain the whole URI and do not become Spotify IDs', () => {
    const { identity } = load();
    assert.equal(identity.extractTrackId(localA), null);
    assert.equal(identity.getTranslationCacheId(localA), `local-uri:${localA}`);
    assert.notEqual(identity.getTranslationCacheId(localA), identity.getTranslationCacheId(localB));
    assert.equal(identity.getTranslationCacheId(`spotify:track:${spotifyId}`), spotifyId);
    assert.equal(identity.getTranslationCacheId(`https://open.spotify.com/track/${spotifyId}`), spotifyId);
    for (const uri of [null, '', 'spotify:episode:other', 'spotify:ad:other']) {
        assert.equal(identity.getTranslationCacheId(uri), null);
    }
});

test('local lyrics and AI pronunciation reach providers and reuse independent persistent caches', async () => {
    const h = load();
    const translation = await h.api.callGemini(request);
    const phonetic = await h.api.callGemini({ ...request, wantSmartPhonetic: true });
    assert.equal(translation.translation[0], '안녕');
    assert.equal(phonetic.phonetic[0], 'hello');
    await h.api.callGemini(request);
    await h.api.callGemini({ ...request, wantSmartPhonetic: true });
    assert.equal(h.calls.length, 2);
    assert.ok(h.calls.every(call => call.trackId === `local-uri:${localA}`));
    assert.ok(h.reads.every(args => args[0] === `local-uri:${localA}`));
    assert.deepEqual(h.writes.map(args => args[2]), [false, true]);
});

test('songs with identical durations do not share translations; regeneration bypasses cache', async () => {
    const h = load();
    await h.api.callGemini(request);
    h.player.data.item.uri = localB;
    await h.api.callGemini(request);
    await h.api.callGemini({ ...request, ignoreCache: true });
    assert.deepEqual(h.calls.map(call => call.trackId), [`local-uri:${localA}`, `local-uri:${localB}`, `local-uri:${localB}`]);
});

test('an explicit local identity stays attached to its request when playback changes', async () => {
    const h = load(`spotify:track:${spotifyId}`);
    const trackId = h.identity.getTranslationCacheId(localA);
    await h.api.callGemini({ ...request, trackId });
    assert.equal(h.calls[0].trackId, trackId);
    assert.equal(h.writes[0][0], trackId);
});

test('local title and artist translation use the same identity and metadata cache', async () => {
    const h = load();
    assert.equal((await h.api.translateMetadata(request)).translated.title, '노래');
    await h.api.translateMetadata(request);
    assert.equal(h.calls.length, 1);
    assert.equal(h.calls[0].trackId, `local-uri:${localA}`);
});

test('missing playback still rejects lyrics translation before a provider request', async () => {
    const h = load('');
    await assert.rejects(h.api.callGemini(request), /No track ID available/);
    assert.equal(await h.api.translateMetadata(request), null);
    assert.equal(h.calls.length, 0);
});
