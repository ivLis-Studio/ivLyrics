import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../LyricsService.js', import.meta.url), 'utf8');
const section = (start, end) => {
    const from = source.indexOf(start), to = source.indexOf(end, from + start.length);
    assert.ok(from >= 0 && to > from);
    return source.slice(from, to);
};
const method = (start, end) => section(start, end).trim().replace(/,\s*$/, '');
const deferred = () => {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
};
const flush = async () => { for (let i = 0; i < 4; i++) await new Promise(resolve => setImmediate(resolve)); };
const track = { uri: 'spotify:track:fixture', title: 'Song', artist: 'Artist' };
const result = () => ({ uri: track.uri, provider: 'fixture', synced: [{ text: 'Original', startTime: 1000, endTime: 2000 }] });

// Execute both production request methods. Only providers, translation transport,
// settings and the snapshot store are deterministic in-memory collaborators.
function load() {
    const snapshots = new Map(), published = [], sent = [], loaded = [];
    const values = new Map([['ivLyrics:visual:translation-mode-2:english', 'gemini_ko']]);
    let provider = async () => result(), translator = async () => ({ translation: 'Translated' });
    let target = 'ko', notation = 'translation', currentUri = track.uri;
    const context = vm.createContext({
        window: {
            LyricsAddonManager: { getLyrics: (...args) => provider(...args) },
            Translator: { callGemini: (...args) => translator(...args) },
        },
        Spicetify: { Player: { data: { item: track } }, LocalStorage: { get: key => values.get(key) } },
        Utils: { getPlayerPlaybackSnapshot: () => ({ uri: currentUri }), detectLanguage: () => 'en',
            extractTrackId: uri => uri.split(':').at(-1), isSectionHeader: () => false },
        getTranslationTargetLanguage: () => target,
        getServicePronunciationNotation: () => notation,
        getDisplayedVocalParts: () => null,
        getTranslationRequestLineText: line => line.originalText || line.text || '',
        serviceDebug() {}, console: { warn() {}, error() {} },
        sendLyricsToConsumers: async payload => { sent.push(payload); },
    });
    vm.runInContext(`let lyricsProviderRequestGeneration = 0;
        const lyricsProviderInflightRequests = new Map();
        globalThis.bumpGeneration = () => ++lyricsProviderRequestGeneration;
        globalThis.service = {
            ${method('        async getLyricsFromProviders(', '\n        /**\n         * 싱크 데이터 서비스 접근')},
            ${method('        async getFullLyrics(', '\n        /**\n         * 커뮤니티 싱크 데이터 가져오기')}
        };`, context);
    const service = context.service;
    service.getLyricsSnapshot = uri => snapshots.get(uri) || null;
    service.publishLyricsSnapshot = update => {
        const prior = snapshots.get(update.trackUri);
        const next = { ...prior, ...update, revision: (prior?.revision || 0) + 1 };
        snapshots.set(update.trackUri, next);
        published.push(next);
        return next;
    };
    service.emit = (event, payload) => loaded.push({ event, payload });
    return { service, snapshots, published, sent, loaded, values,
        setProvider: fn => { provider = fn; }, setTranslator: fn => { translator = fn; },
        setTarget: value => { target = value; }, setNotation: value => { notation = value; },
        setCurrentUri: value => { currentUri = value; }, bumpGeneration: context.bumpGeneration,
        publishPage: () => service.publishLyricsSnapshot({ trackUri: track.uri, provider: 'page-provider',
            source: 'ivlyrics-page', displayLyrics: [{ text: 'Original', text2: 'Page translation' }], presentationComplete: true }),
    };
}

test('fallback accepts its own raw snapshot and publishes captured target and notation', async () => {
    const h = load(); h.setNotation('ipa');
    const output = await h.service.getFullLyrics(track);
    assert.equal(output.error, null);
    assert.equal(h.published.length, 2);
    assert.equal(h.sent.length, 2);
    assert.equal(h.sent[0].sendReason, 'translation-pending');
    assert.equal(h.sent[1].lyrics[0].text2, 'Translated');
    for (const packet of h.sent) {
        assert.equal(packet.presentationContext.translationTargetLanguage, 'ko');
        assert.equal(packet.presentationContext.pronunciationNotation, 'ipa');
    }
    assert.equal(h.published.at(-1).translationTargetLanguage, 'ko');
    assert.equal(h.published.at(-1).presentationComplete, true);
});

test('new page presentation during provider lookup wins over raw, missing and empty fallback results', async () => {
    for (const response of [result(), { error: 'No lyrics' }, { provider: 'fixture', synced: [] }]) {
        const h = load(), pending = deferred(); h.setProvider(() => pending.promise);
        const work = h.service.getFullLyrics(track, { skipTranslation: true });
        const page = h.publishPage(); pending.resolve(response);
        assert.equal((await work).stale, true);
        assert.equal(h.snapshots.get(track.uri), page);
        assert.equal(h.published.length, 1);
        assert.equal(h.sent.length, 0);
    }
});

test('shared provider promise never overwrites a presentation published after its start', async () => {
    const h = load(), pending = deferred(); let calls = 0;
    h.setProvider(() => { calls++; return pending.promise; });
    const a = h.service.getLyricsFromProviders(track), b = h.service.getLyricsFromProviders(track);
    const page = h.publishPage(), raw = result(); pending.resolve(raw);
    assert.equal(await a, raw); assert.equal(await b, raw);
    assert.equal(calls, 1); assert.equal(h.snapshots.get(track.uri), page);
});

test('provider generation change and track switch suppress stale empty deliveries', async () => {
    for (const invalidate of [h => h.bumpGeneration(), h => h.setCurrentUri('spotify:track:next')]) {
        const h = load(), pending = deferred(); h.setProvider(() => pending.promise);
        const work = h.service.getFullLyrics(track);
        invalidate(h); pending.resolve({ error: 'Missing old lyrics' });
        assert.equal((await work).stale, true); assert.equal(h.sent.length, 0);
    }
});

test('completed page presentation supersedes an already running translation fallback', async () => {
    const h = load(), pending = deferred(); h.setTranslator(() => pending.promise);
    const work = h.service.getFullLyrics(track); await flush();
    assert.equal(h.sent.length, 1);
    const page = h.publishPage(); pending.resolve({ translation: 'Obsolete translation' });
    assert.equal((await work).stale, true);
    assert.equal(h.sent.length, 1); assert.equal(h.snapshots.get(track.uri), page);
    assert.equal(h.loaded.length, 0);
});

test('clearing and recreating a snapshot with the same revision does not revive an old request', async () => {
    const h = load(), pending = deferred(); h.setTranslator(() => pending.promise);
    const work = h.service.getFullLyrics(track); await flush();
    const oldRevision = h.snapshots.get(track.uri).revision;
    h.snapshots.delete(track.uri);
    const page = h.publishPage();
    assert.equal(page.revision, oldRevision);
    pending.resolve({ translation: 'Obsolete translation' });
    assert.equal((await work).stale, true);
    assert.equal(h.sent.length, 1); assert.equal(h.snapshots.get(track.uri), page);
});

test('mode, target language and notation changes invalidate pending translation without a new snapshot', async () => {
    for (const invalidate of [h => h.values.set('ivLyrics:visual:translation-mode-2:english', 'none'),
        h => h.setTarget('ja'), h => h.setNotation('latin'), h => h.bumpGeneration()]) {
        const h = load(), pending = deferred(); h.setTranslator(() => pending.promise);
        const work = h.service.getFullLyrics(track); await flush();
        invalidate(h); pending.resolve({ translation: 'Obsolete translation' });
        assert.equal((await work).stale, true);
        assert.equal(h.sent.length, 1); assert.equal(h.published.length, 1);
    }
});

test('superseded mode-one translation does not start a second translation request', async () => {
    const h = load(), pending = deferred(); let calls = 0;
    h.values.set('ivLyrics:visual:translation-mode:english', 'gemini_romaji');
    h.setTranslator(() => { calls++; return pending.promise; });
    const work = h.service.getFullLyrics(track); await flush();
    h.publishPage(); pending.resolve({ phonetic: 'Obsolete pronunciation' });
    assert.equal((await work).stale, true);
    assert.equal(calls, 1); assert.equal(h.sent.length, 1);
});

test('original-only fallback remains available when no newer owner publishes', async () => {
    const h = load();
    const output = await h.service.getFullLyrics(track, { skipTranslation: true });
    assert.equal(output.error, null); assert.equal(h.sent.length, 1);
    assert.equal(h.sent[0].lyrics[0].text, 'Original');
    assert.equal(h.sent[0].presentationContext.presentationComplete, false);
    assert.equal(h.published.at(-1).source, 'lyrics-service-original-fallback');
});
