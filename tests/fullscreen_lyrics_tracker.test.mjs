import assert from 'node:assert/strict';
import test from 'node:test';
import { createLyricsPageRenderer } from '../src/lyrics/createLyricsPageRenderer.mjs';
import { createSyncedLyricsPlaybackTracker } from '../src/lyrics/createSyncedLyricsPlaybackTracker.mjs';

const createHarness = () => {
  const slots = [], events = [];
  let cursor = 0, position = 0;
  let observePosition, trackerRenders = 0;
  const useMemo = (fn, deps) => {
    const index = cursor++, old = slots[index];
    if (!old || deps.length !== old.deps.length || deps.some((v, i) => !Object.is(v, old.deps[i]))) {
      slots[index] = { value: fn(), deps };
    }
    return slots[index].value;
  };
  const CONFIG = { visual: { 'synced-compact': true, 'pseudo-karaoke-render-advance': 150 } };
  const readCompactMode = () => CONFIG.visual['synced-compact'];
  const react = {
    memo: component => component,
    useMemo, useRef: value => useMemo(() => ({ current: value }), []),
    useCallback: (fn, deps) => useMemo(() => fn, deps),
    createElement: (type, props, ...children) => ({ type, props, children }),
    Fragment: 'fragment',
  };
  const tracker = createSyncedLyricsPlaybackTracker({
    react, readCompactMode,
    getPseudoKaraokeRenderAdvance: source => source === 'pseudo' ? CONFIG.visual['pseudo-karaoke-render-advance'] : 0,
    publishLyricIndex: (activeLineIndex, leadingEmptyLines, total) => events.push({
      index: Math.max(0, activeLineIndex - leadingEmptyLines), total,
    }),
    useLyricsPlaybackObserver(observe) { observePosition = observe; observe(position); },
  });
  const LyricsPageRenderer = createLyricsPageRenderer({
    react, readCompactMode, getMarketplacePage: () => 'marketplace', SyncedLyricsPlaybackTracker: tracker,
    SyncedLyricsPage: 'compact-page', SyncedExpandedLyricsPage: 'expanded-page',
    UnsyncedLyricsPage: 'unsynced-page', LyricsUnavailableView: 'unavailable', CreditFooter: 'footer',
  });
  return {
    CONFIG, events, tracker,
    get trackerRenders() { return trackerRenders; },
    sample(time) { observePosition(time); return events.at(-1); },
    tick(lyrics, time, options = {}) {
      cursor = 0; position = time;
      trackerRenders++;
      assert.equal(tracker({ lyrics, trackUri: '', ...options }), null);
      return events.at(-1);
    },
    render: LyricsPageRenderer,
  };
};

// Match the former page's reverse source scan, including padding before the
// first lyric. Sorting timestamps must never reorder simultaneous/overlap rows.
const legacyIndex = (lyrics, time) => Math.max(0, lyrics.findLastIndex(line => time >= (line.startTime || 0)));

test('fullscreen tracker preserves source indices across boundaries, gaps, overlaps and seeks', () => {
  const lyrics = [
    { text: 'first', startTime: 1000, endTime: 12000 },
    { text: 'later', startTime: 5000, endTime: 6000 },
    { text: 'overlap', startTime: 3000, endTime: 4000 },
    { text: 'same time', startTime: 5000 },
    { text: 'after gap', startTime: 14000 },
  ];
  for (const compact of [true, false]) for (const isKara of [true, false]) {
    const h = createHarness(); h.CONFIG.visual['synced-compact'] = compact;
    for (const time of [-100, 0, 999, 1000, 2999, 3000, 4999, 5000, 13000, 14000, 20000, 2000, 0]) {
      assert.deepEqual(h.tick(lyrics, time, { isKara }), { index: legacyIndex(lyrics, time), total: lyrics.length });
    }
  }
});

test('tracker retains pseudo karaoke advance and only publishes boundary or lyric-count changes', () => {
  const h = createHarness(), lyrics = [{ startTime: 1000 }, { startTime: 2000 }];
  const options = { isKara: true, karaokeSource: 'pseudo' };
  h.tick(lyrics, 1800, options);
  for (const time of [1810, 1820, 1849]) h.tick(lyrics, time, options);
  assert.deepEqual(h.events, [{ index: 0, total: 2 }]);
  assert.deepEqual(h.tick(lyrics, 1850, options), { index: 1, total: 2 });
  assert.deepEqual(h.tick(lyrics, 1900, { ...options, karaokeSource: 'real' }), { index: 0, total: 2 });
  assert.deepEqual(h.tick([...lyrics, { startTime: 3000 }], 1900), { index: 0, total: 3 });
  assert.deepEqual(h.tick([], 1900), { index: 0, total: 0 });
});

test('steady fullscreen playback observes the clock without rendering tracker or preparing display rows', () => {
  const h = createHarness();
  const makeLine = startTime => ({
    startTime,
    get text() { assert.fail('a hidden renderer must only read timing'); },
  });
  const lyrics = [makeLine(1000), makeLine(3000)];
  h.tick(lyrics, 1100);
  for (let time = 1100; time < 3000; time += 17) h.sample(time);
  assert.deepEqual(h.events, [{ index: 0, total: 2 }]);
  assert.deepEqual(h.sample(3000), { index: 1, total: 2 });
  assert.deepEqual(h.sample(1500), { index: 0, total: 2 });
  assert.equal(h.trackerRenders, 1);
});

test('focused lyric tracking retains the existing notifications for preroll and empty rows', () => {
  for (const compact of [true, false]) {
    const h = createHarness();
    h.CONFIG.visual['synced-compact'] = compact;
    const lyrics = [{ startTime: '-100' }, , undefined, { startTime: 'invalid' }, { startTime: 500 }];
    const lead = compact ? 2 : 1;
    const padded = Array.from({ length: lead }, () => ({ startTime: 0 })).concat(lyrics)
      .map(line => ({ ...line }));
    const expected = [];
    let previous = null;
    h.tick(lyrics, -300);
    for (const time of [-300, -100, -50, 0, 499, 500, 0, -300]) {
      h.sample(time);
      const active = Math.max(0, padded.findLastIndex(line => line && time >= (line.startTime || 0)));
      if (active !== previous) expected.push({ index: Math.max(0, active - lead), total: lyrics.length });
      previous = active;
    }
    assert.deepEqual(h.events, expected);
  }
});

test('a new track publishes its current lyric even when the index and line count match', () => {
  const h = createHarness();
  const lyrics = [{ startTime: 1000 }, { startTime: 2000 }];
  h.tick(lyrics, 3000, { trackUri: 'first' });
  h.tick(lyrics, 3000, { trackUri: 'second' });
  assert.deepEqual(h.events, [{ index: 1, total: 2 }, { index: 1, total: 2 }]);
});

test('focused presentations mount only the tracker and restore the normal renderer on exit', () => {
  for (const mode of [0, 1, 3]) {
    const h = createHarness(), lyrics = [{ text: 'line', startTime: 0 }];
    const props = { mode, currentLyrics: lyrics, karaoke: lyrics, synced: lyrics, reRenderLyricsPage: 2 };
    assert.equal(h.render({ ...props, playbackOnly: true }).type, h.tracker);
    const normal = h.render({ ...props, playbackOnly: false });
    assert.equal(normal.children[0].type, 'compact-page');
    assert.equal(normal.children[1].type, 'footer');
    h.CONFIG.visual['synced-compact'] = false;
    const expanded = h.render({ ...props, mode: 1, playbackOnly: true });
    assert.equal(expanded.type, h.tracker);
    assert.equal(h.render({ ...props, mode: 1 }).children[0].type, 'expanded-page');
  }
});

test('hidden unsynced/unavailable pages do not mount rows while marketplace stays accessible', () => {
  const h = createHarness();
  assert.equal(h.render({ playbackOnly: true, mode: 2, unsynced: [{}] }), null);
  assert.equal(h.render({ playbackOnly: true, mode: -1 }), null);
  assert.equal(h.render({ playbackOnly: true, showMarketplace: true }).children[0].type, 'marketplace');
});

test('renderer keeps custom mode mapping, provider credits and marketplace overrides', () => {
  const h = createHarness();
  const karaoke = [{ startTime: 0 }];
  const common = { karaoke, currentLyrics: null, karaokeMode: 8, wordMode: 9, provider: 'source', syncPoints: 25 };
  const { children: [karaokePage, footer] } = h.render({ ...common, mode: 9 });
  assert.equal(karaokePage.props.karaokeRenderGranularity, 'word');
  assert.equal(karaokePage.props.lyrics, karaoke);
  assert.equal(footer.props.provider, 'source');
  assert.equal(footer.props.syncPoints, 25);
  const close = () => {};
  const { children: [marketplace] } = h.render({ showMarketplace: true, marketplaceComponent: 'other', onCloseMarketplace: close });
  assert.deepEqual(marketplace, { type: 'other', props: { onClose: close }, children: [] });
  assert.equal(h.render({ showMarketplace: true, marketplaceComponent: null }).children[0].type, 'unavailable');
});
