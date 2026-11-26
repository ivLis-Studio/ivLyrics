import { readPronunciationSlots } from "#ivlyrics/lyrics/pronunciationRuntime.mjs";
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { createPageRegenerationMenu, runPageLyricRegeneration } from '../src/lyrics/pageLyricRegeneration.mjs';
import { regeneratePageTranslation } from '../src/lyrics/pageTranslationRegeneration.mjs';
import {
  createToolbarRegeneration, getRegenerateTranslationChoiceItems,
} from '#ivlyrics/app/toolbar/createToolbarRegeneration.mjs';
import { getRuntimeService as getAppService } from '../src/spicetify/runtimeServices.mjs';

const source = readFileSync(new URL('../src/spicetify/index.js', import.meta.url), 'utf8');

const section = (text, start, end) => {
  const from = text.indexOf(start), to = text.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, start);
  return text.slice(from, to);
};
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};
const plain = value => JSON.parse(JSON.stringify(value));
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

const getChoiceItems = input => getRegenerateTranslationChoiceItems(key => key, input);

const regenerationChoiceRows = {
  phonetic: { key: 'regenerate-phonetic-only', target: 'phonetic', label: 'menu.regeneratePronunciationOnly' },
  translation: { key: 'regenerate-translation-only', target: 'translation', label: 'menu.regenerateTranslationOnly' },
  'cultural-annotations': { key: 'regenerate-cultural-annotations', target: 'cultural-annotations', label: 'settings.culturalAnnotations.label' },
  'word-supplements': { key: 'regenerate-word-supplements', target: 'word-supplements', label: 'menu.regenerateWordDetails' },
};

test('regeneration choices offer only enabled individual targets', async t => {
  for (const [needPhonetic, needTranslation, independentTargets] of [
    [false, false, []],
    [true, false, ['phonetic']],
    [false, true, ['translation']],
    [true, true, ['phonetic', 'translation']],
  ]) {
    for (const includeCulturalAnnotations of [false, true]) {
      for (const includeWordSupplements of [false, true]) {
        await t.test(`pronunciation=${needPhonetic}, translation=${needTranslation}, culture=${includeCulturalAnnotations}, words=${includeWordSupplements}`, () => {
          const targets = { needPhonetic, needTranslation };
          const menu = createPageRegenerationMenu({
            page: {
              getRegenerationTargets: () => targets,
              isCulturalAnnotationsEnabled: () => includeCulturalAnnotations,
            },
            getChoiceItems,
            readWordSupplements: () => includeWordSupplements ? {} : undefined,
          });
          const expected = [
            ...independentTargets,
            ...(includeCulturalAnnotations ? ['cultural-annotations'] : []),
            ...(includeWordSupplements ? ['word-supplements'] : []),
          ].map(target => regenerationChoiceRows[target]);
          assert.deepEqual(menu.getChoices(), expected);
        });
      }
    }
  }
});

test('regeneration choice helper defaults omit optional actions and disabled targets', () => {
  assert.deepEqual(getChoiceItems({}), []);
  assert.deepEqual(getChoiceItems({ targets: { needPhonetic: true, needTranslation: true } }), [
    regenerationChoiceRows.phonetic, regenerationChoiceRows.translation,
  ]);
});

test('the regeneration dialog keeps the lyrics request it was opened for', async () => {
  const calls = [];
  let select;
  const page = {
    state: { uri: 'track-a', lyricsRequestSeq: 1 },
    getRegenerationTargets: () => ({ needPhonetic: true, needTranslation: true }),
    isCulturalAnnotationsEnabled: () => false,
    isCurrentLyricsState(lyrics) {
      return lyrics.uri === this.state.uri && lyrics.lyricsRequestSeq === this.state.lyricsRequestSeq;
    },
    runRegenerateTranslationChoice: (...args) => calls.push(args),
  };
  const menu = createPageRegenerationMenu({
    page, getChoiceItems, openChoiceModal: ({ onSelect }) => { select = onSelect; },
    readWordSupplements: () => null,
  });

  menu.open();
  await select('phonetic');
  assert.deepEqual(calls, [['phonetic', 'track-a']]);

  menu.open();
  page.state = { uri: 'track-b', lyricsRequestSeq: 2 };
  await select('translation');
  page.state = { uri: 'track-a', lyricsRequestSeq: 3 };
  await select('translation');
  assert.deepEqual(calls, [['phonetic', 'track-a']]);
});

function container() {
  const calls = [], snapshots = [], errors = [], memoryWrites = [];
  const cacheBarrier = { current: null };
  let generationOptions = 'stable-options';
  const context = vm.createContext({
    runPageLyricRegeneration, regeneratePageTranslation, getAppService, readPronunciationSlots,
    window: { Translator: {
      clearInflightRequests() {},
      callGemini(params) {
        const call = { params, ...deferred() };
        calls.push(call);
        return call.promise.then(async result => {
          call.resultReady = true;
          if (cacheBarrier.current) await cacheBarrier.current.promise;
          return result;
        });
      },
    } },
    Utils: { getTranslationCacheId: uri => uri },
    Toast: { show() {}, success() {}, error: message => errors.push(message) },
    I18n: { t: key => key }, ivLyricsDebug() {}, console,
    SYNCED: 1, UNSYNCED: 2, isKaraokeRenderMode: () => false,
    getNonSectionLyricsText: lines => lines.map(line => line.text).join('\n'),
    getDisplayModeCacheKey: (_state, mode) => mode,
    getDisplayModeGenerationOptions: () => generationOptions,
    getSyncDataRendererCacheVersion: () => 1,
    getLyricsProcessingShapeSignature: () => 'fixture-shape',
    getCurrentLyricsPronunciationNotation: () => 'latin',
    mapTranslationLinesToLyrics: (_lyrics, lines) => lines.map(text => ({ text })),
    CacheManager: { set: (key, value) => memoryWrites.push([key, plain(value)]) },
  });
  vm.runInContext(`class Container {
    ${section(source, '  async runRegenerateTranslationChoice(', '  regenerateCulturalAnnotations(')}
    ${section(source, '  async regenerateTranslation(', '  async selectLyricsProviderForCurrentTrack(')}
  }; globalThis.Container = Container;`, context);
  const app = new context.Container();
  Object.assign(app, {
    state: { uri: 'track-a', provider: 'lrclib', currentLyrics: [{ text: 'A' }] },
    currentTrackUri: 'track-a', _isComponentMounted: true, _dmResults: {},
    getRegenerationTargets: () => ({ provider: 'gemini', mode1: 'gemini_romaji', mode2: 'gemini_ko',
      needPhonetic: true, needTranslation: true, isGeminiMode: true }),
    getCurrentMode: () => 1, getTranslationTargetLanguage: () => 'en', provideLanguageCode: () => 'ja',
    isCurrentLyricsUri(uri) { return this.currentTrackUri === uri; },
    isCurrentLyricsState(state) { return this.currentTrackUri === state.uri; },
    isPlaybackUriCurrent(uri) { return (this.playbackUri ?? this.currentTrackUri) === uri; },
    applyStreamingTranslation: data => snapshots.push(plain(data)),
    invalidateSharedLyricsPresentation() {}, lyricsSource() {}, forceUpdate() {},
    startPhoneticLoading() { return 1; }, clearPhoneticLoading() {},
    startTranslationLoading() { return 2; }, clearTranslationLoading() {},
  });
  return { app, calls, snapshots, errors, cacheBarrier, memoryWrites,
    setGenerationOptions(value) { generationOptions = value; },
    resolve(call, text) { call.resolve(call.params.wantSmartPhonetic ? { phonetic: [text] } : { translation: [text] }); },
  };
}

test('different tasks start together while duplicates and overlapping combined requests are blocked', async () => {
  const h = container(), culture = deferred(), words = deferred();
  let cultureCalls = 0, wordCalls = 0;
  h.app.regenerateCulturalAnnotations = () => { cultureCalls++; return culture.promise; };
  h.app.regenerateWordSupplements = () => { wordCalls++; return words.promise; };
  const phonetic = h.app.runRegenerateTranslationChoice('phonetic');
  const translation = h.app.runRegenerateTranslationChoice('translation');
  const cultural = h.app.runRegenerateTranslationChoice('cultural-annotations');
  const word = h.app.runRegenerateTranslationChoice('word-supplements');
  assert.equal(h.calls.length, 2, 'both provider requests start without waiting');
  assert.equal(cultureCalls, 1); assert.equal(wordCalls, 1);
  await h.app.runRegenerateTranslationChoice('all');
  await h.app.runRegenerateTranslationChoice('phonetic');
  await h.app.runRegenerateTranslationChoice('word-supplements');
  assert.equal(h.calls.length, 2); assert.equal(wordCalls, 1);
  h.resolve(h.calls[0], 'pronunciation'); h.resolve(h.calls[1], 'translation');
  culture.resolve(); words.resolve();
  await Promise.all([phonetic, translation, cultural, word]);
  assert.equal(h.app._regenerationRequests.size, 0);
});

test('interleaved streams and resets preserve the other task results', async () => {
  const h = container();
  const phonetic = h.app.runRegenerateTranslationChoice('phonetic');
  const translation = h.app.runRegenerateTranslationChoice('translation');
  h.calls[0].params.onLine(0, 'pronunciation stream');
  h.calls[1].params.onLine(0, 'translation stream');
  assert.deepEqual(h.snapshots.at(-1).lyricsMode1, [{ text: 'pronunciation stream' }]);
  assert.deepEqual(h.snapshots.at(-1).lyricsMode2, [{ text: 'translation stream' }]);
  h.calls[0].params.onStreamReset();
  assert.deepEqual(h.snapshots.at(-1).lyricsMode2, [{ text: 'translation stream' }]);
  h.resolve(h.calls[0], 'pronunciation final'); await phonetic;
  h.calls[1].params.onLine(0, 'translation next');
  assert.deepEqual(h.snapshots.at(-1).lyricsMode1, [{ text: 'pronunciation final' }]);
  h.resolve(h.calls[1], 'translation final'); await translation;
  assert.deepEqual(plain(h.app._dmResults['track-a'].mode1), [{ text: 'pronunciation final' }]);
  assert.deepEqual(plain(h.app._dmResults['track-a'].mode2), [{ text: 'translation final' }]);
});

test('a cache-write await cannot restore an obsolete snapshot of the other field', async () => {
  const h = container(), barrier = deferred();
  const phonetic = h.app.runRegenerateTranslationChoice('phonetic');
  const translation = h.app.runRegenerateTranslationChoice('translation');
  h.cacheBarrier.current = barrier;
  h.resolve(h.calls[0], 'pronunciation final'); await flush();
  assert.equal(h.calls[0].resultReady, true);
  h.calls[1].params.onLine(0, 'latest translation');
  barrier.resolve(); await phonetic;
  assert.equal(h.app._dmResults['track-a'].mode2, null);
  assert.deepEqual(h.snapshots.at(-1).lyricsMode2, [{ text: 'latest translation' }]);
  h.resolve(h.calls[1], 'translation final'); await translation;
  assert.deepEqual(plain(h.app._dmResults['track-a'].mode1), [{ text: 'pronunciation final' }]);
});

test('a failed task unlocks only itself and cannot discard another task', async () => {
  const h = container();
  const phonetic = h.app.runRegenerateTranslationChoice('phonetic');
  const translation = h.app.runRegenerateTranslationChoice('translation');
  h.calls[0].reject(new Error('fixture failure')); await phonetic;
  assert.equal(h.errors.length, 1);
  assert.equal(h.app._regenerationRequests.size, 1);
  const retry = h.app.runRegenerateTranslationChoice('phonetic');
  assert.equal(h.calls.length, 3);
  h.resolve(h.calls[1], 'translation final'); h.resolve(h.calls[2], 'retried pronunciation');
  await Promise.all([translation, retry]);
  assert.deepEqual(plain(h.app._dmResults['track-a'].mode2), [{ text: 'translation final' }]);
});

for (const failure of ['rejected', 'empty']) {
  test(`combined regeneration keeps the original translation after a ${failure} provider result`, async () => {
    const h = container();
    const seed = h.app.runRegenerateTranslationChoice('translation');
    h.resolve(h.calls[0], 'committed translation');
    await seed;
    h.memoryWrites.length = 0;

    const regenerate = h.app.runRegenerateTranslationChoice('all');
    h.calls[2].params.onLine(0, 'uncommitted translation');
    assert.deepEqual(h.snapshots.at(-1).lyricsMode2, [{ text: 'uncommitted translation' }]);
    assert.deepEqual(plain(h.app._dmResults['track-a'].mode2), [{ text: 'committed translation' }]);
    h.resolve(h.calls[1], 'new pronunciation');
    if (failure === 'rejected') h.calls[2].reject(new Error('provider disconnected'));
    else h.calls[2].resolve(null);
    await regenerate;

    assert.deepEqual(h.snapshots.at(-1).lyricsMode2, [{ text: 'committed translation' }]);
    assert.deepEqual(h.snapshots.at(-1).lyricsMode1, [{ text: 'new pronunciation' }]);
    assert.deepEqual(h.memoryWrites, [['gemini_romaji', [{ text: 'new pronunciation' }]]]);
    assert.equal(h.errors.length, 1);
    assert.equal(h.app._regenerationRequests.size, 0);
  });
}

test('new regeneration settings exclude a sibling preview from a retired generation', async () => {
  const h = container();
  const translation = h.app.runRegenerateTranslationChoice('translation');
  h.calls[0].params.onLine(0, 'old translation style');
  assert.deepEqual(h.snapshots.at(-1).lyricsMode2, [{ text: 'old translation style' }]);

  h.setGenerationOptions('new options');
  const phonetic = h.app.runRegenerateTranslationChoice('phonetic');
  h.calls[1].params.onLine(0, 'new pronunciation');
  assert.deepEqual(h.snapshots.at(-1).lyricsMode1, [{ text: 'new pronunciation' }]);
  assert.equal(h.snapshots.at(-1).lyricsMode2, null);

  h.resolve(h.calls[0], 'obsolete');
  h.resolve(h.calls[1], 'final pronunciation');
  await Promise.all([translation, phonetic]);
  assert.equal(h.app._dmResults['track-a'].mode2, null);
});

test('track changes ignore late streams and completions without unlocking a newer track request', async () => {
  const h = container();
  const old = h.app.runRegenerateTranslationChoice('translation');
  h.app.state = { ...h.app.state, uri: 'track-b' }; h.app.currentTrackUri = 'track-b';
  const next = h.app.runRegenerateTranslationChoice('translation');
  h.calls[0].params.onLine(0, 'obsolete'); h.resolve(h.calls[0], 'obsolete'); await old;
  assert.equal(h.snapshots.length, 0); assert.equal(h.app._dmResults['track-a'].mode2, null);
  assert.equal(h.app._regenerationRequests.size, 1);
  h.resolve(h.calls[1], 'current'); await next;
  assert.deepEqual(plain(h.app._dmResults['track-b'].mode2), [{ text: 'current' }]);
});

test('a regeneration click from the old track cannot start work for the next track', async () => {
  const h = container();
  h.app.state = { ...h.app.state, uri: 'track-b' };
  h.app.currentTrackUri = 'track-b';
  const stale = h.app.runRegenerateTranslationChoice('translation', 'track-a');
  assert.equal(h.calls.length, 0);
  await stale;
});

test('regeneration is blocked while the lyrics page still shows the previous track', async () => {
  const h = container();
  h.app.playbackUri = 'track-b';
  const stale = h.app.runRegenerateTranslationChoice('translation', 'track-a');
  assert.equal(h.calls.length, 0);
  await stale;
});

test('an older regeneration cannot stream or overwrite a newer request for the same field', async () => {
  const h = container();
  const older = h.app.regenerateTranslation('translation');
  const newer = h.app.regenerateTranslation('translation');
  h.calls[0].params.onLine(0, 'obsolete');
  assert.equal(h.snapshots.length, 0);
  h.calls[1].params.onLine(0, 'current');
  h.resolve(h.calls[1], 'latest');
  await newer;
  h.calls[0].params.onStreamReset();
  h.resolve(h.calls[0], 'obsolete');
  await older;
  assert.deepEqual(plain(h.app._dmResults['track-a'].mode2), [{ text: 'latest' }]);
  assert.deepEqual(h.snapshots.at(-1).lyricsMode2, [{ text: 'current' }]);
});

function buttons() {
  const hooks = []; let cursor;
  const react = {
    memo: value => value, createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
    useState(initial) { const i = cursor++; if (!(i in hooks)) hooks[i] = initial; return [hooks[i], value => { hooks[i] = value; }]; },
    useRef(value) { const i = cursor++; return hooks[i] ||= { current: value }; },
    useEffect() {},
  };
  const { RegenerateTranslationButton } = createToolbarRegeneration({
    react, translate: key => key, ToolbarPanelRow: 'row', ToolbarButton: 'button', ToolbarGlyph: 'glyph',
  });
  const requests = new Map(), calls = [];
  const props = { isEnabled: true, busyTargets: [],
    choices: ['phonetic', 'translation', 'all', 'cultural-annotations', 'word-supplements'].map(target => ({ key: target, target, label: target })),
    onRegenerate(target) { calls.push(target); const pending = deferred(); requests.set(target, pending); return pending.promise; },
  };
  const render = () => { cursor = 0; const root = RegenerateTranslationButton(props); return Object.fromEntries(root.props.control.children[0].map(node => [node.props.key, node.props])); };
  return { render, calls, requests, props };
}

test('toolbar blocks only matching/overlapping tasks, including rapid clicks before React rerenders', async () => {
  const h = buttons(), first = h.render();
  const phonetic = first.phonetic.onClick();
  await first.phonetic.onClick(); await first.all.onClick();
  assert.deepEqual(h.calls, ['phonetic']);
  const pending = h.render();
  assert.equal(pending.phonetic.disabled, true); assert.equal(pending.all.disabled, true);
  assert.equal(pending.translation.disabled, false); assert.equal(pending['cultural-annotations'].disabled, false);
  const translation = pending.translation.onClick();
  assert.deepEqual(h.calls, ['phonetic', 'translation']);
  h.requests.get('phonetic').resolve(); await phonetic;
  assert.equal(h.render().translation.disabled, true); assert.equal(h.render().phonetic.disabled, false);
  h.requests.get('translation').reject(new Error('fixture failure')); await translation;
  assert.equal(h.render().translation.disabled, false);
  h.props.busyTargets = ['word-supplements'];
  assert.equal(h.render()['word-supplements']['aria-busy'], true);
  assert.equal(h.render().translation.disabled, false);
});
