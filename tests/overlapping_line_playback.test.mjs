import { buildPanelDisplayRows, preparePanelDisplayRows } from "#ivlyrics/lyrics/panelDisplayRows.mjs";
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import test from 'node:test';
import vm from 'node:vm';
import { getPanelSingingLineIndices, preparePanelLinePlaybackTimeline } from '../src/lyrics/lyricPlaybackTimeline.mjs';
import { startPanelPlaybackSubscription, getTrailingKaraokeInterludeKey } from '../src/lyrics/panelPlaybackSubscription.mjs';
import { createLyricInterludeTiming, toFiniteTime } from '../src/lyrics/lyricInterludeTiming.mjs';

const panelSource = readFileSync(new URL('../src/lyrics/NowPlayingPanelLyrics.js', import.meta.url), 'utf8');
const slice = (source, start, end) => {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  assert.ok(a >= 0 && b > a, start);
  return source.slice(a, b);
};
const plain = value => JSON.parse(JSON.stringify(value));
const tokens = line => line?.vocals
  ? [line.vocals.lead, ...line.vocals.background].flatMap(part => part.syllables)
  : line?.syllables ?? [];
const fillEnd = line => tokens(line).length ? Math.max(...tokens(line).map(word => word.endTime)) : null;
const line = (text, startTime, endTime) => ({text, startTime, endTime, syllables: [{text, startTime, endTime}]});
const lyrics = [line('held', 1000, 10000), line('response', 2000, 3000), line('next', 14000, 15000)];

function helpers() {
  const timing = createLyricInterludeTiming({
    readLineFillEndTime: fillEnd,
    readTrackDuration: () => 20000,
    readAutoBreakEnabled: () => true,
  });
  const context = vm.createContext({
    getLastSyllableEndTime: fillEnd, toFiniteTime,
    preparePanelLinePlaybackTimeline, getPanelSingingLineIndices, getTrailingKaraokeInterludeKey,
    isAutoInstrumentalBreakEnabled: () => true,
    getCurrentTrackDurationMs: () => 20000,
    getTrailingKaraokeInterludeInfo: timing.getTrailingKaraokeInterludeInfo,
  });
  vm.runInContext([
    slice(panelSource, '    const buildPanelLinePlaybackTimeline', '    const { getInterludeInfo'),
    slice(panelSource, '    const createTrailingKaraokeInterludeResolver', '    // ============================================\n    // 노래방 단어'),
    'globalThis.panel = {buildPanelLinePlaybackTimeline, getPanelSingingLineIndices, createTrailingKaraokeInterludeResolver};',
  ].join('\n'), context);
  return {context, panel: context.panel, page: timing};
}

test('independent held lines remain singing across later short lines and bidirectional seeks', () => {
  const {panel} = helpers();
  const rows = [line('one', 1000, 10000), ...[2, 3, 4, 5, 6].map(n => line(`voice${n}`, n * 1000, n * 1000 + 500))];
  const timeline = panel.buildPanelLinePlaybackTimeline(rows);
  for (const [position, latest, expected] of [[0, 0, []], [2200, 1, [0,1]], [6200, 5, [0,5]], [6500, 5, [0]], [10000, 5, []], [3200, 2, [0,2]], [999, 0, []]]) {
    assert.deepEqual(plain(panel.getPanelSingingLineIndices(timeline, position, latest)), expected);
  }
});

test('explicit background timing survives a later primary line ending', () => {
  const {panel} = helpers();
  const rows = [{...line('lead', 1000, 2000), vocals: {
    lead: line('lead', 1000, 2000), background: [line('echo', 900, 9000)],
  }}, line('next lead', 3000, 4000)];
  const timeline = panel.buildPanelLinePlaybackTimeline(rows);
  assert.equal(timeline[0].endTime, 9000);
  assert.deepEqual(plain(panel.getPanelSingingLineIndices(timeline, 5000, 1)), [0]);
});

test('main page and panel wait for all preceding vocals before showing the same real gap', () => {
  const {panel, page} = helpers();
  const ends = page.buildKaraokeCumulativeEndTimes(lyrics);
  assert.deepEqual(plain(ends), [10000, 10000, 15000]);
  const resolvePanel = panel.createTrailingKaraokeInterludeResolver(lyrics);
  assert.equal(resolvePanel(1).startTime, 12500);
  const args = {line: lyrics[1], nextLine: lyrics[2], lineIndex: 1, lineCount: 3,
    isActiveLine: true, isKara: true, precedingFillEndTime: ends[1]};
  assert.equal(page.createActiveTrailingKaraokeInterludeLine({...args, position: 4000}), null);
  assert.equal(page.createActiveTrailingKaraokeInterludeLine({...args, position: 12499}), null);
  const gap = page.createActiveTrailingKaraokeInterludeLine({...args, position: 12500});
  assert.equal(gap.startTime, resolvePanel(1).startTime);
  assert.equal(gap.endTime, 14000);
  assert.equal(page.createActiveTrailingKaraokeInterludeLine({...args, position: 14000}), null);
});

test('overlap panel rows remain active, unfinished, and visible beyond the usual window', () => {
  const {context} = helpers();
  const rows = [line('held', 1000, 10000), ...[2,3,4,5,6].map(n => line(`response${n}`, n * 1000, n * 1000 + 500))];
  const getInterludeInfo = () => ({isInterlude: false});
  const preparedRows = preparePanelDisplayRows(rows, rows, getInterludeInfo, value => value ?? '');
  const result = buildPanelDisplayRows({
    lyrics: rows, preparedRows, currentIndex: 5, visualIndex: 5, visibleLineCount: 3,
    activeTrailingInterludeKey: null, visualTrailingInterludeKey: null,
    singingLineIndices: [0,5], autoInstrumentalBreakEnabled: false,
    panelPlaybackTimeline: context.panel.buildPanelLinePlaybackTimeline(rows),
    getInterludeInfo,
    getTrailingKaraokeInterludeInfo: () => null,
  });
  assert.equal(result[0].isActive, true);
  assert.equal(result[0].isPast, false);
  assert.equal(result[0].isLayoutHidden, false);
  assert.equal(result[5].isVisualAnchor, true);
  assert.equal(result[1].isPast, true);
  assert.equal(result[1].isLayoutHidden, true);
});

test('panel clock only publishes active row changes at vocal boundaries, including seeks', () => {
  const {panel} = helpers();
  const activeChanges = [];
  let tick, position = 0;
  const cleanup = startPanelPlaybackSubscription({
    lyrics, timeline: panel.buildPanelLinePlaybackTimeline(lyrics),
    enabled: true, hasKaraokeTiming: true, reduceMotion: true,
    startIndex: -1, startVisualIndex: -1,
    offsetMs: {track: 0, global: 0, pseudo: 0},
    transitionMs: 280,
    resolveTrailingInterlude: panel.createTrailingKaraokeInterludeResolver(lyrics),
    read: {
      snapshot: () => ({position, isPlaying: false}),
      trackUri: () => 'track', storedTrackDelay: () => null, pronunciationLead: () => 0,
    },
    on: {
      position() {}, positionChanged() {}, activeLineChanged() {}, visualLineChanged() {},
      activeInterludeChanged() {}, visualInterludeChanged() {},
      singingLinesChanged: (indices) => activeChanges.push(indices),
    },
    scheduler: {
      visibilityTarget: {addEventListener() {}, removeEventListener() {}},
      isHidden: () => false,
      scheduleTimer: (callback) => {tick = callback; return 1;}, cancelTimer() {},
    },
  });
  for (const p of [1000, 1100, 2000, 2200, 3000, 4000, 4000, 10000, 2500, 0]) {position = p; tick();}
  assert.deepEqual(activeChanges, [[], [0], [0,1], [0], [], [0,1], []]);
  cleanup();
});

test('panel postlude reuses lyric bounds and refreshes late duration, settings, seeks and new lyrics', () => {
  const previousSource = execFileSync('git', ['show', 'aae1e95:NowPlayingPanelLyrics.js'], {
    cwd: new URL('..', import.meta.url), encoding: 'utf8',
  });
  const build = source => {
    let scans = 0;
    const state = { duration: null, enabled: true };
    const readLineFillEndTime = (row) => { scans++; return fillEnd(row); };
    const readTrackDuration = () => state.duration;
    const readAutoBreakEnabled = () => state.enabled;
    const currentSource = source === panelSource;
    const context = vm.createContext({
      toFiniteTime, preparePanelLinePlaybackTimeline, getTrailingKaraokeInterludeKey,
      getLastSyllableEndTime: readLineFillEndTime,
      isAutoInstrumentalBreakEnabled: readAutoBreakEnabled,
      isInterludeMarkerText: () => false, getInterludeCandidateText: row => row?.text ?? '',
      getCurrentTrackDurationMs: readTrackDuration,
      KARAOKE_TRAILING_INTERLUDE_DELAY_MS: 2500, INTERLUDE_MIN_DURATION_MS: 500,
    });
    if (currentSource) {
      context.getTrailingKaraokeInterludeInfo = createLyricInterludeTiming({
        readLineFillEndTime, readTrackDuration, readAutoBreakEnabled,
      }).getTrailingKaraokeInterludeInfo;
    }
    vm.runInContext([
      slice(source, '    const buildPanelLinePlaybackTimeline', currentSource ? '    const { getInterludeInfo' : '    const getInterludeInfo'),
      slice(source, currentSource ? '    const createTrailingKaraokeInterludeResolver' : '    const getTrailingKaraokeInterludeInfo', '    // ============================================\n    // 노래방 단어'),
      'globalThis.makeResolver = createTrailingKaraokeInterludeResolver;',
    ].join('\n'), context);
    return { state, makeResolver: rows => context.makeResolver(rows), count: () => scans, reset: () => { scans = 0; } };
  };
  const current = build(panelSource), previous = build(previousSource);
  let resolve = current.makeResolver(lyrics), oldResolve = previous.makeResolver(lyrics);
  const compare = index => assert.deepEqual(plain(resolve(index)), plain(oldResolve(index)));
  compare(2);
  current.reset(); previous.reset();
  for (let frame = 0; frame < 120; frame++) compare(2);
  assert.equal(current.count(), 0);
  assert.equal(previous.count(), 120);
  for (const duration of [20000, 16000, null, 24000]) {
    current.state.duration = previous.state.duration = duration;
    compare(2);
    for (let frame = 0; frame < 10; frame++) compare(2);
  }
  for (const enabled of [false, true]) {
    current.state.enabled = previous.state.enabled = enabled;
    compare(2);
  }
  for (const index of [1, 0, 2, 1, 2]) compare(index);
  const replacement = [...lyrics.slice(0, -1), line('edited ending', 14000, 19000)];
  resolve = current.makeResolver(replacement); oldResolve = previous.makeResolver(replacement);
  compare(2);
  assert.equal(resolve(2).startTime, 21500);
});
