import { fixtureFullLyricsRequest } from "./fixtures/full-lyrics-request.mjs";
import { getRuntimeService } from "#ivlyrics/spicetify/runtimeServices.mjs";
import assert from 'node:assert/strict';
import test from 'node:test';
import { createLyricsProviderLookup, createLyricsProviderRequests } from "#ivlyrics/lyrics/lyricsProviderRequests.mjs";
import { createLyricsPresentationStore } from "#ivlyrics/lyrics/lyricsPresentationStore.mjs";
import { createPageLyricsTimingUpgrade } from "#ivlyrics/lyrics/pageLyricsTimingUpgrade.mjs";
import { installLyricsReadySnapshotListener } from "#ivlyrics/lyrics/installLyricsReadySnapshotListener.mjs";
import { publishLyricsReady } from "#ivlyrics/lyrics/lyricsReadyPublisher.mjs";

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
function load(readSavedLocalLyrics) {
    const snapshots = new Map(), published = [], sent = [], loaded = [], errors = [];
    const values = new Map([['ivLyrics:visual:translation-mode-2:english', 'gemini_ko']]);
    let provider = async () => result(), translator = async () => ({ translation: 'Translated' });
    let send = async () => {};
    let target = 'ko', notation = 'translation', currentUri = track.uri, djNarration = false;
    const context = {
        getRuntimeService,
        readSavedLocalLyrics,
        window: {
            LyricsAddonManager: { getLyrics: (...args) => provider(...args) },
            Translator: { callGemini: (...args) => translator(...args) },
        },
        Spicetify: { Player: { data: { item: track } }, LocalStorage: { get: key => values.get(key) } },
        Utils: { getPlayerPlaybackSnapshot: () => ({ uri: currentUri, djNarration }), detectLanguage: () => 'en',
            extractTrackId: uri => uri.split(':').at(-1),
            getTranslationCacheId: uri => uri.startsWith('spotify:local:') ? `local-uri:${uri}` : uri.split(':').at(-1),
            isSectionHeader: () => false },
        getTranslationTargetLanguage: () => target,
        getServicePronunciationNotation: () => notation,
        serviceDebug() {}, console: { warn() {}, error() {} },
        sendLyricsToConsumers: async payload => { sent.push(payload); await send(payload); },
        reportError: (_message, error) => errors.push(error),
    };
    context.providerRequests = createLyricsProviderRequests(() => context.window.LyricsAddonManager);
    const service = { getLyricsFromProviders: createLyricsProviderLookup(context.window, context.providerRequests) };
    service.getFullLyrics = fixtureFullLyricsRequest(context);
    service.getLyricsSnapshot = uri => snapshots.get(uri) || null;
    service.publishLyricsSnapshot = update => {
        const prior = snapshots.get(update.trackUri);
        const next = { ...prior, ...update, revision: (prior?.revision || 0) + 1 };
        snapshots.set(update.trackUri, next);
        published.push(next);
        return next;
    };
    service.emit = (event, payload) => loaded.push({ event, payload });
    return { service, snapshots, published, sent, loaded, values, errors, host: context.window,
        setSend: fn => { send = fn; },
        setProvider: fn => { provider = fn; }, setTranslator: fn => { translator = fn; },
        setTarget: value => { target = value; }, setNotation: value => { notation = value; },
        setCurrentUri: value => { currentUri = value; }, bumpGeneration: uri => context.providerRequests.invalidate(uri),
        setNarration: value => { djNarration = value; },
        publishPage: () => service.publishLyricsSnapshot({ trackUri: track.uri, provider: 'page-provider',
            source: 'ivlyrics-page', displayLyrics: [{ text: 'Original', text2: 'Page translation' }], presentationComplete: true }),
    };
}

test('a provider lookup held by Marketplace does not start with an obsolete provider selection', async () => {
    const h = load();
    const gate = deferred();
    let pending = gate.promise;
    h.host.MarketplaceManager = { getPendingLyricsProviderChanges: () => pending };
    let calls = 0;
    h.setProvider(async () => { calls++; return result(); });

    const oldLookup = h.service.getLyricsFromProviders(track, [], 1, 'old-override');
    await flush();
    assert.equal(calls, 0);
    h.bumpGeneration(track.uri);
    pending = null;
    gate.resolve();
    assert.equal((await oldLookup).stale, true);
    assert.equal(calls, 0);
    assert.deepEqual(h.published, []);

    const fresh = await h.service.getLyricsFromProviders(track, [], 1, 'current-override');
    assert.equal(fresh.provider, 'fixture');
    assert.equal(h.published[0].trackLyricsProviderOverride, 'current-override');
    assert.equal(calls, 1);
});

test('fallback accepts its own raw snapshot and publishes captured target and notation', async () => {
    const h = load(); h.setNotation('ipa');
    const output = await h.service.getFullLyrics(track);
    assert.equal(output.error, null);
    assert.equal(h.published.length, 3);
    assert.equal(h.sent.length, 2);
    assert.equal(h.sent[0].sendReason, 'translation-pending');
    assert.equal(h.sent[1].lyrics[0].text2, 'Translated');
    assert.strictEqual(h.published[1].displayLyrics, h.sent[0].lyrics);
    assert.equal(h.published[1].presentationComplete, false);
    for (const packet of h.sent) {
        assert.equal(packet.presentationContext.translationTargetLanguage, 'ko');
        assert.equal(packet.presentationContext.pronunciationNotation, 'ipa');
    }
    assert.equal(h.published.at(-1).translationTargetLanguage, 'ko');
    assert.equal(h.published.at(-1).presentationComplete, true);
});

test('fallback presents retained word timing when the provider refreshes the same recording with line timing', async () => {
    const h = load();
    const store = createLyricsPresentationStore({
        getPresentationKey: () => 'recording',
        preserveAuxiliaryLyrics: (_previous, lyrics) => ({ lyrics }),
        onPublish: snapshot => h.published.push(snapshot),
    });
    h.service.getLyricsSnapshot = store.get;
    h.service.publishLyricsSnapshot = store.publish;
    const base = { ...result(), provider: 'lrcred', lrcred: { isrc: 'JPAAA2600001' } };
    const karaoke = base.synced.map(line => ({ ...line, startTime: 1200,
        syllables: [{ text: line.text, startTime: 1200, endTime: line.endTime }] }));
    store.publish({ trackUri: track.uri, rawResult: { ...base, karaoke, karaokeSource: 'lrcred' } });
    h.setProvider(async () => base);

    const output = await h.service.getFullLyrics(track);
    assert.equal(output.error, null);
    assert.equal(output.lyrics[0]?.startTime, 1200);
    assert.equal(output.lyrics[0]?.text2, 'Translated');
    assert.strictEqual(store.get(track.uri).rawResult.karaoke, karaoke);
    assert.equal(h.sent.at(-1)?.presentationContext.lyricsType, 'karaoke');
});

test('word timing received during language lookup is used in the initial overlay packet', async () => {
    const h = load(), language = deferred(), lookup = deferred();
    const base = { ...result(), provider: 'lrcred', lrcred: { isrc: 'JPAAA2600001' } };
    const karaoke = base.synced.map(line => ({ ...line, startTime: 1200,
        syllables: [{ text: line.text, startTime: 1200, endTime: line.endTime }] }));
    h.setProvider(async () => base);
    h.service.getTrackLanguageOverride = () => { lookup.resolve(); return language.promise; };
    const work = h.service.getFullLyrics(track);
    await lookup.promise;
    const original = h.snapshots.get(track.uri);
    h.service.publishLyricsSnapshot({ trackUri: track.uri, source: 'lrcred-word-sync',
        rawResult: { ...base, karaoke, karaokeSource: 'lrcred' },
        timingUpgradeFromRevision: original.revision, timingUpgradeApplied: false });
    language.resolve('en');
    const output = await work;
    assert.equal(output.lyrics[0].text2, 'Translated');
    assert.equal(h.sent.length, 2);
    for (const entry of h.sent) {
        assert.equal(entry.presentationContext.lyricsType, 'karaoke');
        assert.strictEqual(entry.lyrics[0].syllables, karaoke[0].syllables);
    }
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

test('clearing a different song leaves the active fallback and its provider lookup intact', async () => {
    const h = load(), pending = deferred();
    let calls = 0;
    h.setProvider(() => { calls++; return pending.promise; });
    const active = h.service.getFullLyrics(track, { skipTranslation: true });
    h.bumpGeneration('spotify:track:elsewhere');
    const joined = h.service.getLyricsFromProviders(track);
    pending.resolve(result());
    assert.equal((await active).lyrics[0].text, 'Original');
    assert.equal((await joined).provider, 'fixture');
    assert.equal(calls, 1);
    assert.equal(h.sent.length, 1);
});

test('fallback follows the selected track provider and the karaoke setting', async () => {
    const h = load();
    h.service.getTrackLyricsProviderOverride = async () => 'forced';
    h.values.set('ivLyrics:visual:karaoke-mode-enabled', 'false');
    h.setProvider(async (_info, provider) => {
        assert.equal(provider, 'forced');
        return { ...result(), provider, karaoke: [{ text: 'Karaoke alternative', startTime: 1000 }] };
    });
    const output = await h.service.getFullLyrics(track, { skipTranslation: true });
    assert.equal(output.provider, 'forced');
    assert.equal(output.lyrics[0].text, 'Original');
    assert.equal(h.published.at(-1).trackLyricsProviderOverride, 'forced');
    assert.equal(h.sent[0].presentationContext.lyricsType, 'synced');
});

test('fallback can present a saved local lyric without contacting providers', async () => {
    const localTrack = { ...track, uri: 'spotify:local:Artist:Album:Song:215' };
    const saved = { uri: localTrack.uri, provider: 'local', synced: [{ text: 'Imported lyric', startTime: 1000 }] };
    const h = load(() => saved);
    h.setCurrentUri(localTrack.uri);
    h.setProvider(() => { assert.fail('the saved local result takes priority'); });
    const output = await h.service.getFullLyrics(localTrack, { skipTranslation: true });
    assert.equal(output.provider, 'local');
    assert.equal(output.lyrics[0].text, 'Imported lyric');
    assert.equal(h.published.at(-1).rawResult, saved);
    assert.equal(h.sent[0].trackInfo.uri, localTrack.uri);
});

test('same-URI narration prevents new provider requests and discards pending song translations', async () => {
    const h = load(), translation = deferred();
    let providerCalls = 0;
    h.setProvider(async () => { providerCalls++; return result(); });
    h.setTranslator(() => translation.promise);
    const pending = h.service.getFullLyrics(track);
    await flush();
    assert.equal(h.sent.length, 1);
    h.setNarration(true);
    assert.equal((await h.service.getFullLyrics(track)).stale, true);
    assert.equal(providerCalls, 1);
    translation.resolve({ translation: 'Late song translation' });
    assert.equal((await pending).stale, true);
    assert.equal(h.sent.length, 1);
    assert.equal(h.loaded.length, 0);
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

for (const scenario of ['cache only', 'page commit', 'different recording']) {
    test(`an overlay translation follows timing only from its own recording (${scenario})`, async () => {
        const sameRecording = scenario !== 'different recording';
        const h = load(), pending = deferred();
        const base = { ...result(), provider: 'lrcred', lrcred: { isrc: 'JPAAA2600001' } };
        h.setProvider(async () => base);
        h.setTranslator(() => pending.promise);
        const work = h.service.getFullLyrics(track);
        await flush();
        const original = h.snapshots.get(track.uri);
        const karaoke = base.synced.map(line => ({ ...line, startTime: 1200, syllables: [{ text: line.text }] }));
        const rawResult = { ...base, karaoke, karaokeSource: 'lrcred',
            lrcred: { isrc: sameRecording ? 'JPAAA2600001' : 'JPAAA2600002' } };
        h.service.publishLyricsSnapshot({ trackUri: track.uri, rawResult,
            source: 'lrcred-word-sync', timingUpgradeFromRevision: original.revision, timingUpgradeApplied: false });
        if (scenario === 'page commit') {
            const host = Object.assign(new EventTarget(), { CustomEvent });
            installLyricsReadySnapshotListener(host, h.service.publishLyricsSnapshot);
            const page = {
                state: { ...base, currentLyrics: base.synced },
                isCurrentLyricsState: () => true,
                getCurrentMode: () => 0,
                setState(update, commit) {
                    this.state = { ...this.state, ...update(this.state) };
                    commit();
                },
                publishLyricsPresentation(lyrics, options, deliveryOptions) {
                    publishLyricsReady({ ...options, trackInfo: track, lyrics }, host, deliveryOptions);
                },
            };
            const timing = createPageLyricsTimingUpgrade({
                cache: {}, getLyricsService: () => h.service, getLyricsModeTypeKey: () => 'karaoke',
            });
            assert.equal(await timing.applyLyricsTimingUpgrade(page, rawResult), true);
            assert.equal(h.snapshots.get(track.uri).timingUpgradeApplied, true);
        }
        pending.resolve({ translation: 'Retained translation' });
        const output = await work;
        if (sameRecording) {
            assert.equal(output.lyrics[0].text2, 'Retained translation');
            assert.equal(output.lyrics[0].startTime, 1200);
            assert.equal(h.sent.at(-1).presentationContext.lyricsType, 'karaoke');
        } else {
            assert.equal(output.stale, true);
            assert.equal(h.sent.length, 1);
        }
    });
}

test('clearing and recreating a snapshot with the same revision does not revive an old request', async () => {
    const h = load(), pending = deferred(); h.setTranslator(() => pending.promise);
    const work = h.service.getFullLyrics(track); await flush();
    const oldRevision = h.snapshots.get(track.uri).revision;
    h.snapshots.delete(track.uri);
    h.service.publishLyricsSnapshot({ trackUri: track.uri, rawResult: result(), source: 'lyrics-service' });
    const page = h.publishPage();
    assert.equal(page.revision, oldRevision);
    pending.resolve({ translation: 'Obsolete translation' });
    assert.equal((await work).stale, true);
    assert.equal(h.sent.length, 1); assert.equal(h.snapshots.get(track.uri), page);
});

test('mode, target language and notation changes invalidate pending translation without publishing a completion', async () => {
    for (const invalidate of [h => h.values.set('ivLyrics:visual:translation-mode-2:english', 'none'),
        h => h.setTarget('ja'), h => h.setNotation('latin'), h => h.bumpGeneration(),
        h => h.values.set('ivLyrics:visual:karaoke-mode-enabled', 'false')]) {
        const h = load(), pending = deferred(); h.setTranslator(() => pending.promise);
        const work = h.service.getFullLyrics(track); await flush();
        const original = h.snapshots.get(track.uri);
        invalidate(h); pending.resolve({ translation: 'Obsolete translation' });
        assert.equal((await work).stale, true);
        assert.equal(h.sent.length, 1);
        assert.strictEqual(h.snapshots.get(track.uri), original);
        assert.equal(original.presentationComplete, false);
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

test('empty fallback returns stale if playback changes while the display is clearing', async () => {
    for (const providerResult of [{ error: 'No lyrics found' }, { provider: 'fixture', synced: [], unsynced: [] }]) {
        const h = load(), packet = deferred();
        h.setProvider(async () => providerResult);
        h.setSend(() => packet.promise);
        const work = h.service.getFullLyrics(track);
        await flush();
        assert.equal(h.sent.length, 1);
        assert.equal(h.sent[0].lyrics.length, 0);

        h.setCurrentUri('spotify:track:other');
        packet.resolve();
        assert.equal((await work).stale, true);
        assert.equal(h.loaded.length, 0);
    }
});

test('errors from a superseded fallback are silent and current failures still surface', async () => {
    for (const changeTrack of [true, false]) {
        const language = deferred();
        const h = load();
        const failure = new Error('Language lookup failed');
        h.service.getTrackLanguageOverride = async () => { await language.promise; throw failure; };
        const work = h.service.getFullLyrics(track);
        await flush();
        assert.equal(h.published.length, 1);

        if (changeTrack) h.setCurrentUri('spotify:track:other');
        language.resolve();
        const output = await work;
        if (changeTrack) {
            assert.equal(output.stale, true);
            assert.deepEqual(h.errors, []);
        } else {
            assert.equal(output.error, failure.message);
            assert.deepEqual(h.errors, [failure]);
        }
        assert.deepEqual(h.sent, []);
    }
});
