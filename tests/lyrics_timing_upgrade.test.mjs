import { resolveLyricsPageRenderMode } from "../src/lyrics/lyricsPageRenderState.mjs";
import { attachLyricsPageSettings } from "../src/spicetify/lyricsPageSettings.mjs";
import { createRuntimeEffects } from "../src/core/runtimeEffects.mjs";
import { INTERFACE_LANGUAGE_CHANGED } from "../src/i18n/interfaceLanguage.mjs";
import { commitLyricsPagePresentation } from "../src/lyrics/commitLyricsPagePresentation.mjs";
import { cancelPendingLyricsTimingUpgrade, createPageLyricsTimingUpgrade, getCommittedLyricsTimingUpgrade } from "#ivlyrics/lyrics/pageLyricsTimingUpgrade.mjs";
import { cancelPendingPageMetadataTranslation } from "#ivlyrics/lyrics/createPageMetadataTranslation.mjs";
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { createPageLyricsPresenter } from "../src/lyrics/pageLyricsPresenter.mjs";
import { mergeLyricsTiming } from "../src/lyrics/lyricsTimingMerge.mjs";
import { installLyricsReadySnapshotListener } from "../src/lyrics/installLyricsReadySnapshotListener.mjs";
import { publishLyricsReady } from "../src/lyrics/lyricsReadyPublisher.mjs";
import { createLyricsPresentationStore } from "../src/lyrics/lyricsPresentationStore.mjs";
import { readPageLyricsSource, writePageLyricsSource } from "#ivlyrics/lyrics/pageLyricsSourceCache.mjs";

const source = readFileSync(new URL('../src/spicetify/index.js', import.meta.url), 'utf8');
const section = (start, end) => {
    const from = source.indexOf(start), to = source.indexOf(end, from + start.length);
    assert.ok(from >= 0 && to > from, start);
    return source.slice(from, to);
};
const uri = 'spotify:track:AAAAAAAAAAAAAAAAAAAAAA';
const line = { text: 'Fixture lyric', startTime: 0, endTime: 10000 };
const word = { ...line, startTime: 1200, endTime: 2200, syllables: [
    { text: 'Fixture ', startTime: 1200, endTime: 1800 }, { text: 'lyric', startTime: 1800, endTime: 2200 },
] };

function setup() {
    const CACHE = {}, snapshots = [], presentations = [], timers = [];
    const window = Object.assign(new EventTarget(), { CustomEvent });
    const store = createLyricsPresentationStore({ getPresentationKey: () => null,
        preserveAuxiliaryLyrics: (_previous, lyrics) => ({ lyrics }), onPublish: value => snapshots.push(value) });
    window.LyricsService = { getLyricsSnapshot: store.get, publishLyricsSnapshot: store.publish };
    installLyricsReadySnapshotListener(window, store.publish);
    window.addEventListener('ivLyrics:lyrics-ready', event => presentations.push(event.detail));
    const context = vm.createContext({ cancelPendingLyricsTimingUpgrade, cancelPendingPageMetadataTranslation,
        window,
        CACHE, clearTimeout() {}, ivLyricsDebug() {},
        setTimeout: fn => { timers.push(fn); return timers.length; },
    });
    context.pageTimingUpgrade = createPageLyricsTimingUpgrade({
        cache: CACHE,
        getLyricsService: () => context.window.LyricsService,
        getLyricsModeTypeKey: () => 'karaoke',
    });
    vm.runInContext(`class Container {
        ${section('  mergeCurrentLyricsTiming(', '  clearPendingLyricsUpdates()')}
        ${section('  clearPendingLyricsUpdates()', '  getLyricsLayoutHasLyrics(')}
    }; globalThis.Container = Container;`, context);
    const app = new context.Container();
    const pendingTranslation = Promise.resolve('existing request');
    const readings = [{ text: 'existing reading' }];
    const display = { ...line, originalText: line.text, text: 'phonetic', text2: 'translation',
        phoneticText: 'phonetic', translationText: 'translation', annotation: { keep: true } };
    Object.assign(app, {
        state: { uri, provider: 'lrcred', synced: [line], unsynced: [{ text: line.text }],
            currentLyrics: [display], lyricsRequestSeq: 7, romaji: readings },
        _lyricsPresentationSeq: 9, _inflightGemini: new Map([['request', pendingTranslation]]),
        _dmResults: { [uri]: { mode1: readings } },
        isCurrentLyricsState: state => state.uri === uri && state.lyricsRequestSeq === 7,
        isCurrentLyricsUri: value => value === uri,
        isPlaybackUriCurrent: value => value === uri,
        resolveLyricsForMode: state => state.synced,
        requestCulturalAnnotations() {},
        getTranslationTargetLanguage: () => 'ko',
        getCurrentMode: () => 0,
        setState(update, callback) {
            const patch = typeof update === 'function' ? update(this.state) : update;
            if (patch) this.state = { ...this.state, ...patch };
            callback?.();
        },
        clearLyricsLoading() {}, clearPhoneticLoading() {}, clearTranslationLoading() {},
        clearCulturalAnnotationsLoading() {}, clearWordSyncLoading() {}, restoreWordSyncLoading() {},
        clearPronunciationSyncLoading() {}, restorePronunciationSyncLoading() {},
        publishLyricsPresentation: (...args) => app.lyricPresenter.publish(...args),
        optimizeTranslations: () => [{ ...display, text2: 'finished translation', translationText: 'finished translation' }],
        provideLanguageCode: () => 'en',
    });
    app.lyricPresenter = createPageLyricsPresenter({
        page: app,
        getVisualSettings: () => ({ 'translation-mode:english': 'gemini_ko' }),
        getLyricsService: () => context.window.LyricsService,
        getLanguagePrompt: () => null,
        getCurrentTranslationTargetLanguage: () => 'ko',
        getCurrentLyricsPronunciationNotation: () => 'translation',
        getDisplayModeGenerationOptions: () => '',
        getSyncDataRendererCacheVersion: () => '',
        getLyricsProcessingShapeSignature: () => '',
        getNonSectionLyricsText: lyrics => lyrics.map(lyric => lyric.text).join('\n'),
        translate: key => key,
        notifyError: message => assert.fail(message),
        debug() {},
        scheduleTimer: context.setTimeout, cancelTimer: context.clearTimeout,
        publishReady: (detail, options) => publishLyricsReady(detail, window, options),
    });
    return { app, CACHE, snapshots, presentations, timers, pendingTranslation, readings, store, service: window.LyricsService };
}

const upgrade = () => ({ uri, provider: 'lrcred', karaokeSource: 'lrcred', karaoke: [word], synced: [word], lrcred: { syncType: 'word' } });

test('timing upgrade preserves translated text, phonetics, cache and in-flight request ownership', async () => {
    const h = setup(), originalMemory = h.app._dmResults, originalInflight = h.app._inflightGemini;
    assert.equal(await h.app.applyLyricsTimingUpgrade(upgrade()), true);
    const display = h.app.state.currentLyrics[0];
    assert.equal(display.text, 'phonetic');
    assert.equal(display.originalText, 'Fixture lyric');
    assert.equal(display.text2, 'translation');
    assert.equal(display.startTime, 1200);
    assert.strictEqual(display.syllables, word.syllables);
    assert.strictEqual(h.app.state.romaji, h.readings);
    assert.strictEqual(h.app._inflightGemini, originalInflight);
    assert.strictEqual(h.app._dmResults, originalMemory);
    assert.strictEqual(h.app._inflightGemini.get('request'), h.pendingTranslation);
    assert.equal(h.app._lyricsPresentationSeq, 9);
    assert.equal(h.app.state.lyricsRequestSeq, 7);
    assert.equal(h.CACHE[uri].karaokeSource, 'lrcred');
    assert.equal(h.snapshots.length, 1);
    assert.equal(h.presentations.length, 1);
    assert.equal(h.snapshots[0].source, 'lrcred-word-sync');
    assert.equal(h.snapshots[0].timingUpgradeApplied, true);
    assert.equal(h.snapshots[0].displayLyrics[0].text2, 'translation');
});

test('a page timing merge keeps cache ownership through the next provider selection', async () => {
    const h = setup();
    h.service.getLyricsRequestRevision = () => 3;
    writePageLyricsSource(h.CACHE, uri, { uri, provider: 'lrcred', synced: [line] }, 3);
    assert.equal(await h.app.applyLyricsTimingUpgrade(upgrade()), true);
    assert.equal(readPageLyricsSource(h.CACHE, uri, 3).karaokeSource, 'lrcred');
    assert.equal(readPageLyricsSource(h.CACHE, uri, 4), undefined);
});

test('a page timing commit retains the shared translation and the original timing revision', async () => {
    const h = setup();
    const value = upgrade();
    const sharedLyrics = [{ ...line, text2: 'newer translation', phoneticText: 'shared pronunciation' }];
    const original = h.store.publish({ trackUri: uri, provider: 'lrcred',
        rawResult: { provider: 'lrcred', synced: [line] }, displayLyrics: sharedLyrics,
        displayMode1: 'gemini_ko', displayMode2: 'gemini_romaji',
        translationTargetLanguage: 'ko', pronunciationNotation: 'latin', presentationComplete: true });
    const cacheOnly = h.store.publish({ ...original, rawResult: value, source: 'lrcred-word-sync',
        timingUpgradeFromRevision: original.revision, timingUpgradeApplied: false });
    h.snapshots.length = 0;
    assert.equal(await h.app.applyLyricsTimingUpgrade(value), true);
    assert.equal(h.snapshots.length, 1);
    const latest = h.store.get(uri);
    assert.equal(latest.revision, cacheOnly.revision + 1);
    assert.equal(latest.source, 'lrcred-word-sync');
    assert.equal(latest.timingUpgradeFromRevision, original.revision);
    assert.equal(latest.timingUpgradeApplied, true);
    assert.equal(latest.displayLyrics[0].text2, 'newer translation');
    assert.equal(latest.displayLyrics[0].phoneticText, 'shared pronunciation');
    assert.deepEqual(latest.displayLyrics[0].syllables, word.syllables);
    assert.equal(latest.pronunciationNotation, 'latin');
    assert.equal(h.presentations[0].lyrics[0].text2, 'translation', 'the public event still describes the page');
});

test('a page timing commit cannot take over the shared snapshot from another provider', async () => {
    const h = setup();
    const shared = h.store.publish({ trackUri: uri, provider: 'spotify',
        rawResult: { provider: 'spotify', synced: [line] }, displayLyrics: [line] });
    assert.equal(await h.app.applyLyricsTimingUpgrade(upgrade()), true);
    assert.strictEqual(h.store.get(uri), shared);
    assert.equal(h.presentations.length, 1);
    assert.deepEqual(h.app.state.currentLyrics[0].syllables, word.syllables);
});

test('the page and cache reject incompatible timing versions before changing the display', () => {
    const h = setup();
    h.app.state.cacheVersion = 'latest';
    assert.equal(h.app.applyLyricsTimingUpgrade({ ...upgrade(), cacheVersion: 'retired' }), false);
    assert.equal(h.app.state.karaoke, undefined);
    assert.equal(h.CACHE[uri], undefined);
    assert.equal(h.snapshots.length, 0);
});

for (const interrupt of [false, 'track', 'cleanup', 'same-track replacement', 'request invalidated', 'cache version changed', 'provider selection changed']) {
    test(`a queued React timing update is acknowledged only after commit (interrupt ${interrupt})`, async () => {
        const h = setup();
        let commit, settled = false;
        const setState = h.app.setState.bind(h.app);
        h.app.setState = (update, callback) => { commit = () => setState(update, callback); };
        let ownsRequest = true;
        const pending = h.app.applyLyricsTimingUpgrade(upgrade(), () => ownsRequest);
        pending.then(() => { settled = true; });
        await Promise.resolve();
        assert.equal(settled, false);
        assert.equal(h.app.state.karaoke, undefined);
        assert.equal(h.CACHE[uri], undefined);
        assert.equal(h.snapshots.length, 0);
        const before = h.app.state.currentLyrics;
        assert.strictEqual(h.app.mergeCurrentLyricsTiming(before, uri, 'lrcred'), before,
            'queued timings must be invisible to concurrent lyric updates');
        if (interrupt === 'track') h.app.state = { ...h.app.state, uri: 'track-b' };
        if (interrupt === 'same-track replacement') h.app.state = { ...h.app.state, synced: [{ text: 'New source' }] };
        if (interrupt === 'cache version changed') h.app.state = { ...h.app.state, cacheVersion: 'latest' };
        if (interrupt === 'provider selection changed') h.service.getLyricsRequestRevision = () => 1;
        if (interrupt === 'request invalidated') ownsRequest = false;
        if (interrupt === 'cleanup') {
            h.app.clearPendingLyricsUpdates();
            assert.equal(await pending, false, 'cleanup settles even if React discards the callback');
        }
        commit();
        assert.equal(await pending, !interrupt);
        assert.equal(h.snapshots.length, interrupt ? 0 : 1);
        assert.equal(!!h.app.state.karaoke, !interrupt);
        assert.equal(!!h.CACHE[uri], !interrupt);
        assert.equal(!!getCommittedLyricsTimingUpgrade(h.app.state), !interrupt);
    });
}

test('timing follows each backing vocal after a reorder and leaves note rows in place', () => {
    const note = { text: '♪', startTime: 1, endTime: 20 };
    const voiceA = { text: 'first backing line', text2: 'translation A', speaker: 'a' };
    const voiceB = { text: 'shown pronunciation', originalText: 'second backing line', text2: 'translation B', speaker: 'b' };
    const voices = [voiceA, voiceB];
    const newestVoices = [
        { text: 'second backing line', speaker: 'b', startTime: 2000, syllables: [{ text: 'second' }] },
        { text: 'first backing line', speaker: 'a', startTime: 2100, syllables: [{ text: 'first' }] },
        { text: 'a new backing line', startTime: 2150 },
    ];
    const current = { ...line, vocals: { lead: line, background: voices } };
    const incoming = { ...word, vocals: { lead: word, background: newestVoices } };
    const [head, merged] = mergeLyricsTiming([note, current], [note, incoming]);
    assert.strictEqual(head, note);
    assert.deepEqual(merged.vocals.background.map(part => [part.text, part.text2, part.startTime]), [
        ['shown pronunciation', 'translation B', 2000],
        ['first backing line', 'translation A', 2100],
        ['a new backing line', undefined, 2150],
    ]);
    assert.strictEqual(voices[1], voiceB);
    assert.equal(voiceB.startTime, undefined);
});

for (const order of ['timing then translation', 'translation then timing']) {
    test(`a React batch keeps timing and text together when enqueued as ${order}`, async () => {
        const h = setup();
        let complete;
        h.app.getGeminiTranslation = () => new Promise(resolve => { complete = resolve; });
        h.app.lyricPresenter.present(h.app.state, 1);
        h.presentations.length = 0;

        const changes = [];
        h.app.setState = (patch, callback) => changes.push({ patch, callback });
        let pending;
        if (order.startsWith('timing')) pending = h.app.applyLyricsTimingUpgrade(upgrade());
        complete([{ text: 'finished translation' }]);
        await new Promise(resolve => setImmediate(resolve));
        if (!pending) pending = h.app.applyLyricsTimingUpgrade(upgrade());
        assert.equal(changes.length, 2);
        for (const change of changes) {
            const patch = change.patch(h.app.state);
            if (patch) h.app.state = { ...h.app.state, ...patch };
        }
        for (const change of changes) change.callback();
        assert.equal(await pending, true);
        assert.strictEqual(h.app.state.currentLyrics[0].syllables, word.syllables);
        assert.equal(h.app.state.currentLyrics[0].text2, 'finished translation');
        assert.equal(h.presentations.length, 2);
        for (const presentation of h.presentations) {
            assert.equal((presentation.lyrics ?? presentation[0])[0].startTime, 1200);
        }
    });
}

test('already scheduled streaming translation updates retain newly installed word timings', () => {
    const h = setup();
    h.app.getGeminiTranslation = (_state, _lyrics, _mode, onProgress) => {
        onProgress([{ text: 'streamed translation' }]);
        return new Promise(() => {});
    };
    h.app.lyricPresenter.present(h.app.state, 1);
    h.app.applyLyricsTimingUpgrade(upgrade());
    h.timers[0]();
    assert.equal(h.app.state.currentLyrics[0].text2, 'finished translation');
    assert.equal(h.app.state.currentLyrics[0].startTime, 1200);
    assert.strictEqual(h.app.state.currentLyrics[0].syllables, word.syllables);
    assert.equal(h.app._lyricsPresentationSeq, 10);
});

for (const existing of [false, true]) {
    test(`vocal timing keeps source captions and existing translations (existing part ${existing})`, () => {
        const h = setup();
        if (existing) h.app.state.currentLyrics[0].vocals = { lead: {
            ...line, originalText: line.text, text: 'lead phonetic', text2: 'lead translation',
        } };
        const value = upgrade();
        value.karaoke = [{ ...word, vocals: { lead: word, background: [] } }];
        h.app.applyLyricsTimingUpgrade(value);
        const lead = h.app.state.currentLyrics[0].vocals.lead;
        assert.equal(lead.text, existing ? 'lead phonetic' : 'Fixture lyric');
        if (existing) assert.equal(lead.text2, 'lead translation');
        assert.equal(lead.startTime, 1200);
    });
}

test('the production completion callback also retains word timing after translation finishes', async () => {
    const h = setup();
    let complete;
    h.app.getGeminiTranslation = () => new Promise(resolve => { complete = resolve; });
    h.app.lyricPresenter.present(h.app.state, 1);
    await h.app.applyLyricsTimingUpgrade(upgrade());
    complete([{ text: 'finished translation' }]);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(h.app.state.currentLyrics[0].text2, 'finished translation');
    assert.equal(h.app.state.currentLyrics[0].startTime, 1200);
    assert.equal(h.presentations.at(-1).lyricsType, 'karaoke');
    assert.equal(h.presentations.at(-1).presentationComplete, true);
});

test('an automatic render-mode switch alone does not restart the existing presentation', async () => {
    const h = setup();
    const resolve = () => resolveLyricsPageRenderMode(h.app, {
        visual: { 'translation-mode:english': 'gemini_ko' },
        isSyncCreatorActive: false,
        getDisplayModeGenerationOptions: () => '',
        getCurrentLyricsPronunciationNotation: () => 'translation',
        getSyncDataRendererCacheVersion: () => '',
    });
    h.app.isCulturalAnnotationsEnabled = () => false;
    h.app.getCurrentMode = () => h.app.state.karaoke ? 0 : 1;
    const previous = resolve();
    assert.equal(previous.mode, 1);
    assert.equal(await h.app.applyLyricsTimingUpgrade(upgrade()), true);
    Object.assign(h.app, {
        lastProcessedUri: uri, lastProcessedMode: previous.presentation.requestKey,
        lyricsSource: () => assert.fail('The timing upgrade must reuse the existing presentation'),
    });
    const view = resolve();
    assert.equal(view.mode, 0);
    const timing = getCommittedLyricsTimingUpgrade(h.app.state);
    assert.ok(timing);
    assert.notEqual(h.app._processedLyricsTimingUpgrade, timing, 'rendering must not mark the timing as processed');
    commitLyricsPagePresentation(h.app, view.presentation);
    assert.equal(h.app.lastProcessedMode, view.presentation.requestKey);
    assert.equal(h.app._processedLyricsTimingUpgrade, timing);
});

test('page settings refresh metadata and presentation while leaving the source rows in place', async () => {
    const h = setup();
    const host = new EventTarget();
    const effects = createRuntimeEffects({ scheduleTimer: setTimeout, cancelTimer: clearTimeout, onCleanupError: assert.fail });
    const metadata = [];
    const visual = { 'translate:target-language': 'ko' };
    let refreshes = 0;
    let interfaceLanguage = 'en';
    h.app.state = { ...h.app.state, title: 'Title', artist: 'Artist', translatedMetadata: { translated: { title: 'Old' } } };
    h.app.getTranslationTargetLanguage = () => visual['translate:target-language'] === 'auto'
        ? interfaceLanguage : visual['translate:target-language'];
    h.app.fetchMetadataTranslation = (...args) => metadata.push(args);
    h.app.forceUpdate = () => refreshes++;
    h.app.reloadLyrics = () => assert.fail('Display settings must keep the current source');
    const { synced, currentLyrics } = h.app.state;
    attachLyricsPageSettings({ page: h.app, browser: host, effects, isCurrentMount: () => true,
        getVisualSettings: () => visual, saveConfig() {} });
    const choose = (name, value) => {
        visual[name] = value;
        host.dispatchEvent(new CustomEvent('ivLyrics', { detail: { type: 'config', name, value } }));
    };
    choose('translate:target-language', 'auto');
    choose('translate:pronunciation-notation', 'latin');
    await Promise.resolve();
    assert.equal(refreshes, 1);
    assert.deepEqual(metadata, [[uri, 'Title', 'Artist']]);
    assert.equal(h.app.state.translatedMetadata, null);
    assert.strictEqual(h.app.state.synced, synced);
    assert.strictEqual(h.app.state.currentLyrics, currentLyrics);
    interfaceLanguage = 'ja';
    host.dispatchEvent(new Event(INTERFACE_LANGUAGE_CHANGED));
    await Promise.resolve();
    assert.equal(metadata.length, 2);
    effects.dispose();
});

test('a lyrics presentation starts once after a current, visible render commits', () => {
    const requests = [];
    const page = {
        state: { uri, explicitMode: -1, currentLyrics: [word] },
        getCurrentMode: () => 1, provideLanguageCode: () => 'en',
        isCulturalAnnotationsEnabled: () => false,
        lyricsSource: (state, mode) => requests.push([state, mode]),
    };
    const resolve = (isSyncCreatorActive = false) => resolveLyricsPageRenderMode(page, {
        visual: { 'translation-mode:english': 'gemini_ko' }, isSyncCreatorActive,
        getDisplayModeGenerationOptions: () => '',
        getCurrentLyricsPronunciationNotation: () => 'translation',
        getSyncDataRendererCacheVersion: () => '',
    }).presentation;
    const stale = resolve();
    page.state = { ...page.state, uri: 'spotify:track:next', isLoading: true };
    commitLyricsPagePresentation(page, stale);
    commitLyricsPagePresentation(page, resolve());
    page.state = { ...page.state, isLoading: false };
    commitLyricsPagePresentation(page, resolve(true));
    const current = resolve();
    assert.deepEqual(requests, []);
    assert.equal(page.lastProcessedMode, undefined);

    commitLyricsPagePresentation(page, current);
    commitLyricsPagePresentation(page, resolve());
    assert.deepEqual(requests, [[page.state, 1]]);
});

for (const change of ['text', 'line count', 'source', 'community sync']) {
    test(`a different ${change} cannot receive a timing-only upgrade`, () => {
        const h = setup(), value = upgrade(), before = h.app.state;
        if (change === 'text') value.karaoke = [{ ...word, text: 'Different text' }];
        if (change === 'line count') value.karaoke = [word, word];
        if (change === 'source') value.provider = 'spotify';
        if (change === 'community sync') h.app.state.syncDataApplied = true;
        assert.equal(h.app.applyLyricsTimingUpgrade(value), false);
        assert.strictEqual(h.app.state, before);
        assert.equal(h.snapshots.length, 0);
    });
}
