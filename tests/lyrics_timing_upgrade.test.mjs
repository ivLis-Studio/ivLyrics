import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
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
    const context = vm.createContext({
        window: { LyricsService: {
            getLyricsSnapshot: () => ({ displayMode1: 'gemini_ko', presentationComplete: false }),
            publishLyricsSnapshot: value => snapshots.push(value),
        } },
        CACHE, isTranslationNoteLine: text => text.startsWith('Note:'),
        getLyricsModeTypeKey: () => 'word', ivLyricsDebug() {},
        setTimeout: fn => { timers.push(fn); return timers.length; },
    });
    vm.runInContext(`class Container {
        ${section('  mergeCurrentLyricsTiming(', '  clearPendingLyricsUpdates()')}
        ${section('  clearPendingLyricsUpdates()', '  getLyricsLayoutHasLyrics(')}
        ${section('  applyStreamingTranslation({', '\n  /**\n   * 번역 재생성')}
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
        getCurrentMode: () => 0,
        setState(update, callback) {
            const patch = typeof update === 'function' ? update(this.state) : update;
            if (patch) this.state = { ...this.state, ...patch };
            callback?.();
        },
        clearLyricsLoading() {}, clearPhoneticLoading() {}, clearTranslationLoading() {},
        clearCulturalAnnotationsLoading() {}, clearWordSyncLoading() {}, restoreWordSyncLoading() {},
        publishLyricsPresentation: (...args) => presentations.push(args),
        optimizeTranslations: () => [{ ...display, text2: 'finished translation', translationText: 'finished translation' }],
        provideLanguageCode: () => 'en',
    });
    return { app, context, CACHE, snapshots, presentations, timers, pendingTranslation, readings };
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
    assert.equal(h.snapshots[0].displayLyrics[0].text2, 'translation');
});

for (const interrupt of [false, 'track', 'cleanup']) {
    test(`a queued React timing update is acknowledged only after commit (interrupt ${interrupt})`, async () => {
        const h = setup();
        let commit, settled = false;
        const setState = h.app.setState.bind(h.app);
        h.app.setState = (update, callback) => { commit = () => setState(update, callback); };
        const pending = h.app.applyLyricsTimingUpgrade(upgrade());
        pending.then(() => { settled = true; });
        await Promise.resolve();
        assert.equal(settled, false);
        assert.equal(h.app.state.karaoke, undefined);
        assert.equal(h.CACHE[uri], undefined);
        assert.equal(h.snapshots.length, 0);
        if (interrupt === 'track') h.app.state = { ...h.app.state, uri: 'track-b' };
        if (interrupt === 'cleanup') {
            h.app.clearPendingLyricsUpdates();
            assert.equal(await pending, false, 'cleanup settles even if React discards the callback');
        }
        commit();
        assert.equal(await pending, !interrupt);
        assert.equal(h.snapshots.length, interrupt ? 0 : 1);
        assert.equal(!!h.app.state.karaoke, !interrupt);
        assert.equal(!!h.CACHE[uri], !interrupt);
    });
}

test('already scheduled streaming translation updates retain newly installed word timings', () => {
    const h = setup();
    h.app.applyStreamingTranslation({ uri, presentationSeq: 9, lyrics: [line], lyricsMode1: null, lyricsMode2: null });
    h.app.applyLyricsTimingUpgrade(upgrade());
    h.timers[0]();
    assert.equal(h.app.state.currentLyrics[0].text2, 'finished translation');
    assert.equal(h.app.state.currentLyrics[0].startTime, 1200);
    assert.strictEqual(h.app.state.currentLyrics[0].syllables, word.syllables);
    assert.equal(h.app._lyricsPresentationSeq, 9);
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

test('the production completion callback also retains word timing after translation finishes', () => {
    const h = setup(); h.app.applyLyricsTimingUpgrade(upgrade());
    Object.assign(h.context, {
        isActivePresentation: () => true, lyrics: [line], lyricsMode1: [], lyricsMode2: null,
        displayMode1: 'gemini_ko', displayMode2: null, currentUri: uri, currentProvider: 'lrcred',
        mode1Active: true, mode2Active: false, publishCurrentPresentation() {}, app: h.app,
    });
    vm.runInContext(`(function() {
        ${section('    const updateCombinedLyrics = () => {', '    // 스마트 로딩 전략:')}
        updateCombinedLyrics();
    }).call(app);`, h.context);
    assert.equal(h.app.state.currentLyrics[0].text2, 'finished translation');
    assert.equal(h.app.state.currentLyrics[0].startTime, 1200);
});

test('an automatic render-mode switch alone does not restart the existing presentation', () => {
    const h = setup(); h.app.applyLyricsTimingUpgrade(upgrade());
    Object.assign(h.app, { lastProcessedUri: uri, lastProcessedMode: '1_gemini_ko_none' });
    h.context.app = h.app; h.context.currentModeKey = '0_gemini_ko_none';
    vm.runInContext(`(function() { ${section('    // Timing alone must not restart', '    // Only call lyricsSource')} }).call(app);`, h.context);
    assert.equal(h.app.lastProcessedMode, '0_gemini_ko_none');
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
