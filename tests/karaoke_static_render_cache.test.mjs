import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const currentSource = readFileSync(new URL('../Pages.js', import.meta.url), 'utf8');
let baselineSource = execFileSync('git', ['show', '6bb2348:Pages.js'], {
  cwd: new URL('..', import.meta.url), encoding: 'utf8',
});
const segmenterSource = readFileSync(new URL('../LyricsWordSegmenter.js', import.meta.url), 'utf8');
const serviceSource = readFileSync(new URL('../LyricsService.js', import.meta.url), 'utf8');
// The anchor lifecycle is intentionally fixed independently of caching and is
// covered by karaoke_vocal_render_cache. Compare every glyph and presentation
// value here without requiring the old release-time anchor reset.
const normalize = value => JSON.parse(JSON.stringify(value, (key, entry) => {
  if (['data-karaoke-vocal-anchor-position', 'data-karaoke-vocal-anchor-window-ms',
    'data-active-karaoke-vocal-row-index'].includes(key)) return undefined;
  if (key === 'className' && typeof entry === 'string') {
    return entry.split(' ').filter(name => name !== 'active-vocal-row').join(' ');
  }
  return entry;
}));
const slice = (source, startMarker, endMarker) => {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0 && end > start, startMarker);
  return source.slice(start, end);
};
// Compare cached and uncached rendering with the same intentional presentation
// changes. The animation tests independently check the new timing/edge math.
baselineSource = baselineSource
  .replace(slice(baselineSource, 'const KARAOKE_FILL_STEPS', 'const KaraokeLine = react.memo'),
    slice(currentSource, 'const KARAOKE_FILL_STEPS', 'const KaraokeLine = react.memo'))
  .replace(slice(baselineSource, 'const getKaraokeSegmentFill', 'const getKaraokeInstantWordFill'),
    slice(currentSource, 'const getKaraokeSegmentFill', 'const getKaraokeInstantWordFill'))
  .replace(/const softEdge = (10|16);/g, 'const softEdge = getKaraokeFillSoftEdge(fillValue, $1);');

// Resolve nested KaraokeLine elements with separate hook state for each row.
// Counts describe actual helper calls and element construction, not browser cost.
const createHarness = (source = currentSource, options = {}) => {
  const counts = { graphemes: 0, textRuns: 0, furigana: 0, presentations: 0, leafRenders: 0,
    activeCharScans: 0, activeCharVisits: 0 };
  const states = new Map();
  let activeState;
  const CONFIG = { visual: {
    'karaoke-bounce': true,
    'karaoke-text-effects': true,
    'sync-data-custom-speaker-colors-enabled': true,
    'furigana-enabled': false,
    ...options.visual,
  } };
  const window = {
    locale: options.locale || 'en', furiganaReady: false, reducedMotion: false,
    Utils: { getDetectedLanguage: () => window.locale },
    matchMedia: () => ({ get matches() { return window.reducedMotion; } }),
    FuriganaConverter: { isAvailable: () => window.furiganaReady },
  };
  const context = vm.createContext({
    CONFIG, window, console, navigator: { language: 'en' },
    Utils: { applyFuriganaIfEnabled: text => {
      counts.furigana++;
      return CONFIG.visual['furigana-enabled'] && window.furiganaReady && window.locale === 'ja'
        ? text.replace(/漢/g, '<ruby>漢<rt>かん</rt></ruby>') : text;
    } },
    getCopyableText: value => Array.isArray(value) ? value.join('') : String(value ?? ''),
    toFiniteTime: value => Number.isFinite(Number(value)) ? Number(value) : null,
    KARAOKE_RELEASE_WINDOW_MS: 820, KARAOKE_COMPLETION_POSITION_OFFSET_MS: 900,
    useRef: initial => {
      const index = activeState.index++;
      return activeState.hooks[index] ??= { current: initial };
    },
    useMemo: (build, dependencies) => {
      const index = activeState.index++;
      const prior = activeState.hooks[index];
      if (prior && dependencies.length === prior.dependencies.length
        && dependencies.every((dependency, i) => Object.is(dependency, prior.dependencies[i]))) return prior.value;
      const value = build();
      activeState.hooks[index] = { value, dependencies };
      return value;
    },
    react: { Fragment: 'fragment', memo: component => component,
      createElement: (tag, props, ...children) => ({ tag, props: props || {}, children }) },
  });
  vm.runInContext(segmenterSource, context);
  window.LyricsWordSegmenter = { ...context.LyricsWordSegmenter };
  const segmentGraphemes = window.LyricsWordSegmenter.segmentGraphemes;
  window.LyricsWordSegmenter.segmentGraphemes = (...args) => {
    counts.graphemes++;
    return segmentGraphemes(...args);
  };
  const serviceContext = { module: { exports: {} } };
  vm.runInNewContext(serviceSource, serviceContext);
  window.LyricsService = { buildKaraokeWordSegments: (...args) => {
    counts.textRuns++;
    return serviceContext.module.exports.KaraokeWordTiming.buildTimedSegments(...args);
  } };
  source = source.replace('const getKaraokeSpeakerPresentation = (speaker, speakerColor = "", speakerFallback = "") => {',
    'const getKaraokeSpeakerPresentation = (speaker, speakerColor = "", speakerFallback = "") => { counts.presentations++;');
  source = source.replace('const getActiveKaraokeTimedCharIndex = (timedChars, position) => {',
    'const getActiveKaraokeTimedCharIndex = (timedChars, position) => { counts.activeCharScans++; counts.activeCharVisits += timedChars?.length || 0;');
  context.counts = counts;
  const reducedStart = source.indexOf('const prefersReducedLyricsMotion =');
  const reducedEnd = source.indexOf('\nconst ', reducedStart + 1);
  vm.runInContext([
    source.slice(reducedStart, reducedEnd),
    slice(source, 'const getTimedSyllablesFromLine', 'const getInterludeInfo'),
    slice(source, 'const KARAOKE_PRE_SPACE_MIN_DURATION_MS', 'const getSyncedAnimationIndex'),
    slice(source, 'const getKaraokeLineBounds', 'const SyncedLyricsPage = react.memo'),
    'globalThis.api = { KaraokeLine, hasKaraokeVocalRows, getKaraokeVocalRows };',
  ].join('\n'), context);
  const resolve = (node, path) => {
    if (Array.isArray(node)) return node.map((child, index) => resolve(child, `${path}/${index}`));
    if (!node || typeof node !== 'object') return node;
    if (typeof node.tag === 'function') return renderComponent(node.tag, node.props, `${path}/component`);
    return { ...node, children: resolve(node.children, `${path}/${node.props.key ?? node.tag}`) };
  };
  const renderComponent = (component, props, path) => {
    const state = states.get(path) || { hooks: [] };
    states.set(path, state);
    if (options.memo && state.props && Object.keys(state.props).length === Object.keys(props).length
      && Object.keys(props).every(key => Object.is(state.props[key], props[key]))) return state.tree;
    activeState = state;
    state.index = 0;
    if (!props.line?.vocals) counts.leafRenders++;
    const tree = resolve(component(props), path);
    state.props = props;
    state.tree = tree;
    return tree;
  };
  return {
    CONFIG, window, counts, context,
    resetCounts: () => Object.keys(counts).forEach(key => { counts[key] = 0; }),
    render: (line, position, props = {}) => renderComponent(context.api.KaraokeLine, {
      line, position, isActive: true, renderGranularity: 'character', ...props,
    }, 'root'),
    hasVocalRows: context.api.hasKaraokeVocalRows,
    buildVocalRows: context.api.getKaraokeVocalRows,
  };
};

const makeLine = (text = 'Hello long words here', rowCount = 1, inlineStyle = false) => {
  const rows = Array.from({ length: rowCount }, (_, rowIndex) => {
    const startTime = 1000 + rowIndex * 1300;
    return {
      id: `row-${rowIndex}`, text, speaker: 'CUSTOM', 'speaker-color': '#aabbcc', 'speaker-fallback': 'FEMALE 1',
      kind: rowIndex === 2 ? 'wave' : 'vocal', startTime, endTime: startTime + text.length * 110,
      syllables: Array.from(text, (char, index) => ({
        text: char, startTime: startTime + index * 110, endTime: startTime + (index + 1) * 110,
        ...(inlineStyle ? { inlineStyle: true, styleKind: 'wave', styleSpeaker: 'CUSTOM',
          styleSpeakerColor: '#123456', styleSpeakerFallback: 'DUET 1' } : {}),
      })),
    };
  });
  if (rowCount === 1) return rows[0];
  return { text: rows.map(row => row.text).join(' / '), startTime: 1000,
    endTime: rows.at(-1).endTime, vocals: { lead: rows[0], background: rows.slice(1) } };
};

test('vocal presence predicate preserves malformed and sparse input behavior without building presentation', () => {
  const harness = createHarness();
  const fixtures = [null, {}, { vocals: {} }, { vocals: { lead: { syllables: [] }, background: [] } },
    { vocals: { lead: { syllables: [null] }, background: [null, {}, { syllables: [] }] } },
    { vocals: { lead: { syllables: [null] }, background: [{ syllables: [undefined] }] } },
    { vocals: { lead: { syllables: new Array(2) }, background: [, { syllables: new Array(3) }] } },
    makeLine(), makeLine('A B C', 2), makeLine('D E F', 8)];
  for (const line of fixtures) {
    const expected = Array.isArray(harness.buildVocalRows(line));
    harness.resetCounts();
    assert.equal(harness.hasVocalRows(line), expected);
    assert.equal(harness.counts.presentations, 0);
  }
});

test('character, word, ruby and joining-script output matches the baseline across seeks and hand-offs', () => {
  for (const [text, locale] of [['Hello long words here', 'en'], ['漢字の歌', 'ja'], ['مرحبا بالعالم', 'ar'], ['á voice 👨‍👩‍👧‍👦', 'en']]) {
    for (const rowCount of [1, 2, 4]) {
      const current = createHarness(currentSource, { locale, visual: { 'furigana-enabled': true } });
      const baseline = createHarness(baselineSource, { locale, visual: { 'furigana-enabled': true } });
      current.window.furiganaReady = baseline.window.furiganaReady = true;
      const line = makeLine(text, rowCount, true);
      const annotations = [{ expression: text.slice(0, 2), marker: 1 }, { expression: 'missing', marker: 2 }];
      for (const renderGranularity of ['character', 'word']) {
        for (const position of [0, 999, 1000, 1200, 2300, 3500, 5100, 8000, 1200, 1200]) {
          const props = { renderGranularity, isActive: position >= 1000 && position < 5100,
            isEffectFocused: position < 5100, isEffectLive: position < 6000,
            culturalAnnotations: annotations, phonetic: 'first / second', translation: 'meaning / other' };
          assert.deepEqual(normalize(current.render(line, position, props)), normalize(baseline.render(line, position, props)),
            `${locale}/${rowCount}/${renderGranularity}/${position}`);
        }
      }
    }
  }
});

test('four-row activation and release reuse prepared child timing and furigana', () => {
  const current = createHarness();
  const baseline = createHarness(baselineSource);
  const line = makeLine('a'.repeat(120), 4);
  current.render(line, 0, { isActive: false });
  baseline.render(line, 0, { isActive: false });
  for (const [position, isActive] of [[1000, true], [1500, false], [1600, true]]) {
    current.resetCounts(); baseline.resetCounts();
    assert.deepEqual(normalize(current.render(line, position, { isActive })), normalize(baseline.render(line, position, { isActive })));
    assert.equal(current.counts.graphemes, 0);
    assert.equal(current.counts.furigana, 0);
    assert.ok(baseline.counts.graphemes >= 960);
    assert.equal(baseline.counts.furigana, 4);
  }
});

test('joining-script playback reuses segments and grapheme counts', () => {
  const line = makeLine('مرحبا بالعالم '.repeat(8));
  const current = createHarness(currentSource, { locale: 'ar' });
  const baseline = createHarness(baselineSource, { locale: 'ar' });
  current.render(line, 1000); baseline.render(line, 1000);
  current.resetCounts(); baseline.resetCounts();
  for (let frame = 1; frame <= 60; frame++) {
    const position = 1000 + frame * 16;
    assert.deepEqual(normalize(current.render(line, position)), normalize(baseline.render(line, position)));
  }
  assert.equal(current.counts.graphemes, 0);
  assert.equal(current.counts.textRuns, 0);
  assert.ok(baseline.counts.graphemes >= 60 * 16);
  assert.equal(baseline.counts.textRuns, 60);
});

test('vocal clocks preserve missing-end, fallback, overlapping and word-source glyphs through release and seeks', () => {
  const fixtures = [makeLine('held notes', 4), makeLine('漢 字の歌', 4), makeLine('A B C', 2)];
  fixtures[0].vocals.lead.syllables = [{ text: 'held notes', startTime: 1000 }];
  fixtures[0].vocals.background[0].syllables = [{ text: 'overlap', startTime: 1200, endTime: 6000 }];
  fixtures[0].vocals.background[1].syllables = [{ text: '', startTime: 0, endTime: 0 }];
  fixtures[1].vocals.lead.syllables = [{ text: '漢 ', startTime: 1000, endTime: 1010 }];
  fixtures[2].karaokeGranularity = 'word';
  for (const line of fixtures) {
    for (const renderGranularity of ['character', 'word']) {
      const current = createHarness();
      const baseline = createHarness(baselineSource);
      for (const position of [-100, 0, 999, 1000, 1009, 1039, 1100, 1499, 1500, 1700, 2300, 5900, 6000, 6699, 6899, 6900, 20000, 1200]) {
        const props = { renderGranularity, isActive: true, isEffectFocused: true, isEffectLive: true };
        assert.deepEqual(normalize(current.render(line, position, props)), normalize(baseline.render(line, position, props)),
          `${renderGranularity} at ${position}`);
      }
    }
  }
});

test('sequential vocal rows only render changing glyphs while future and settled rows retain their tree', () => {
  const current = createHarness(currentSource, { memo: true });
  const baseline = createHarness(baselineSource, { memo: true });
  const line = makeLine('hello', 4);
  current.render(line, 1100); baseline.render(line, 1100);
  current.resetCounts(); baseline.resetCounts();
  for (let frame = 1; frame <= 30; frame++) {
    const position = 1100 + frame * 10;
    assert.deepEqual(normalize(current.render(line, position)), normalize(baseline.render(line, position)));
  }
  assert.equal(current.counts.leafRenders, 30);
  assert.equal(baseline.counts.leafRenders, 120);
  current.render(line, 20000); baseline.render(line, 20000);
  current.resetCounts(); baseline.resetCounts();
  assert.deepEqual(normalize(current.render(line, 20010)), normalize(baseline.render(line, 20010)));
  assert.equal(current.counts.leafRenders, 0);
  assert.equal(baseline.counts.leafRenders, 4);
});

test('vocal anchor and child offsets share one character scan per row without changing playback output', () => {
  for (const rowCount of [2, 4, 8]) {
    const current = createHarness();
    const baseline = createHarness(baselineSource);
    const line = makeLine('a'.repeat(120), rowCount);
    current.render(line, 0); baseline.render(line, 0);
    const positions = [900, 1000, 1100, 1300, 2200, 3000, 9000, 15000, 25000, 1400];
    current.resetCounts(); baseline.resetCounts();
    for (const position of positions) {
      assert.deepEqual(normalize(current.render(line, position)), normalize(baseline.render(line, position)),
        `${rowCount} rows at ${position}`);
    }
    assert.equal(current.counts.activeCharScans, positions.length * rowCount);
    assert.equal(current.counts.activeCharVisits, positions.length * rowCount * 120);
    assert.equal(baseline.counts.activeCharScans, positions.length * rowCount * (rowCount >= 4 ? 2 : 1));
    assert.equal(baseline.counts.activeCharVisits, current.counts.activeCharVisits * (rowCount >= 4 ? 2 : 1));

    current.resetCounts();
    const props = { phonetic: 'new reading at a paused position' };
    assert.deepEqual(normalize(current.render(line, 1400, props)), normalize(baseline.render(line, 1400, props)));
    assert.equal(current.counts.activeCharScans, 0, 'a metadata refresh at the same position reuses its indices');
    current.resetCounts();
    assert.deepEqual(normalize(current.render(line, 1400, { ...props, settingsRevision: 1 })),
      normalize(baseline.render(line, 1400, { ...props, settingsRevision: 1 })));
    assert.equal(current.counts.activeCharScans, rowCount, 'source preparation invalidation refreshes every row index');
  }
});

test('paused preview settings remain live without a settings revision prop', () => {
  for (const [text, locale] of [['漢字の歌', 'ja'], ['Hello world', 'en'], ['مرحبا بالعالم', 'ar']]) {
    const current = createHarness(currentSource, { locale });
    const baseline = createHarness(baselineSource, { locale });
    const line = makeLine(text, 1, true);
    for (const change of [
      h => { h.CONFIG.visual['karaoke-bounce'] = false; },
      h => { h.CONFIG.visual['karaoke-bounce'] = true; },
      h => { h.CONFIG.visual['karaoke-text-effects'] = false; },
      h => { h.CONFIG.visual['karaoke-text-effects'] = true; h.window.reducedMotion = true; },
      h => { h.window.reducedMotion = false; h.CONFIG.visual['sync-data-custom-speaker-colors-enabled'] = false; },
      h => { h.CONFIG.visual['sync-data-custom-speaker-colors-enabled'] = true; h.CONFIG.visual['furigana-enabled'] = true; },
      h => { h.window.furiganaReady = true; },
      h => { h.CONFIG.visual['furigana-enabled'] = false; },
      h => { h.window.ivLyricsSpeakerColors = { getPresentation: () => ({ speakerClass: 'duet-1', creatorColor: '#010203' }) }; },
    ]) {
      change(current); change(baseline);
      assert.deepEqual(normalize(current.render(line, 1320)), normalize(baseline.render(line, 1320)), locale);
    }
  }
});

test('cached annotation, locale and injected helper data refresh on their real dependencies', () => {
  const current = createHarness(currentSource, { locale: 'ar' });
  const baseline = createHarness(baselineSource, { locale: 'ar' });
  const line = makeLine('مرحبا بالعالم', 4);
  let culturalAnnotations = [{ expression: 'مرحبا', marker: 1 }];
  for (let settingsRevision = 0; settingsRevision < 4; settingsRevision++) {
    if (settingsRevision === 1) culturalAnnotations = [{ expression: 'بالعالم', marker: 2 }];
    if (settingsRevision === 2) {
      culturalAnnotations[0].expression = 'missing';
      line.vocals.lead.translation = 'updated meaning';
    }
    if (settingsRevision === 3) current.window.locale = baseline.window.locale = 'en';
    const props = { culturalAnnotations, settingsRevision, translation: 'new / old' };
    assert.deepEqual(normalize(current.render(line, 1500, props)), normalize(baseline.render(line, 1500, props)));
  }
  const leaf = createHarness(currentSource, { locale: 'ar' });
  const leafLine = makeLine('مرحبا بالعالم');
  leaf.render(leafLine, 1300); leaf.resetCounts();
  const oldBuilder = leaf.window.LyricsService.buildKaraokeWordSegments;
  leaf.window.LyricsService.buildKaraokeWordSegments = (...args) => oldBuilder(...args);
  leaf.render(leafLine, 1300);
  assert.equal(leaf.counts.textRuns, 1, 'late shared builder replacement must rebuild the prepared segments');
  leaf.resetCounts();
  const oldGraphemes = leaf.window.LyricsWordSegmenter.segmentGraphemes;
  leaf.window.LyricsWordSegmenter.segmentGraphemes = (...args) => oldGraphemes(...args);
  leaf.render(leafLine, 1300);
  assert.ok(leaf.counts.graphemes > 0, 'late segmentation helper replacement must rebuild character data');
});
