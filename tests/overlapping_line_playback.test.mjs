import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const panelSource = readFileSync(new URL('../NowPlayingPanelLyrics.js', import.meta.url), 'utf8');
const pageSource = readFileSync(new URL('../Pages.js', import.meta.url), 'utf8');
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
  const context = vm.createContext({
    getLastSyllableEndTime: fillEnd, getKaraokeLineFillEndTime: fillEnd,
    toFiniteTime: value => Number.isFinite(Number(value)) ? Number(value) : null,
    isAutoInstrumentalBreakEnabled: () => true,
    isInterludeMarkerText: () => false, getInterludeCandidateText: line => line?.text ?? '',
    getCurrentTrackDurationMs: () => 20000,
    KARAOKE_TRAILING_INTERLUDE_DELAY_MS: 500, INTERLUDE_MIN_DURATION_MS: 1000,
  });
  vm.runInContext([
    slice(panelSource, '    const buildPanelLinePlaybackTimeline', '    const getInterludeInfo'),
    slice(panelSource, '    const getTrailingKaraokeInterludeInfo', '    // ============================================\n    // 노래방 단어'),
    'globalThis.panel = {buildPanelLinePlaybackTimeline, getPanelSingingLineIndices, createTrailingKaraokeInterludeResolver};',
  ].join('\n'), context);
  const pageContext = vm.createContext({...context});
  vm.runInContext([
    slice(pageSource, 'const buildKaraokeCumulativeEndTimes', 'const createBreakIconChildren'),
    'globalThis.page = {buildKaraokeCumulativeEndTimes, createActiveTrailingKaraokeInterludeLine};',
  ].join('\n'), pageContext);
  return {context, panel: context.panel, page: pageContext.page};
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
  assert.equal(resolvePanel(1).startTime, 10500);
  const args = {line: lyrics[1], nextLine: lyrics[2], lineIndex: 1, lineCount: 3,
    isActiveLine: true, isKara: true, precedingFillEndTime: ends[1]};
  assert.equal(page.createActiveTrailingKaraokeInterludeLine({...args, position: 4000}), null);
  assert.equal(page.createActiveTrailingKaraokeInterludeLine({...args, position: 10499}), null);
  const gap = page.createActiveTrailingKaraokeInterludeLine({...args, position: 10500});
  assert.equal(gap.startTime, resolvePanel(1).startTime);
  assert.equal(gap.endTime, 14000);
  assert.equal(page.createActiveTrailingKaraokeInterludeLine({...args, position: 14000}), null);
});

test('overlap panel rows remain active, unfinished, and visible beyond the usual window', () => {
  const {context} = helpers();
  const rows = [line('held', 1000, 10000), ...[2,3,4,5,6].map(n => line(`response${n}`, n * 1000, n * 1000 + 500))];
  Object.assign(context, {
    lyrics: rows, currentIndex: 5, visualIndex: 5, visibleLineCount: 3,
    activeTrailingInterludeKey: null, visualTrailingInterludeKey: null,
    singingLineIndices: [0,5], autoInstrumentalBreakEnabled: false,
    panelPlaybackTimeline: context.panel.buildPanelLinePlaybackTimeline(rows),
    getInterludeInfo: () => ({isInterlude: false}), getDistinctPanelSupplement: value => value ?? '',
  });
  const memo = slice(panelSource, '        const panelLines = useMemo(() => {', '        // currentTime은 더 이상 상태로 관리하지 않음');
  const body = memo.slice(memo.indexOf('{') + 1, memo.lastIndexOf('}, ['));
  const result = vm.runInContext(`(() => {${body}})()`, context);
  assert.equal(result[0].isActive, true);
  assert.equal(result[0].isPast, false);
  assert.equal(result[0].isLayoutHidden, false);
  assert.equal(result[5].isVisualAnchor, true);
  assert.equal(result[1].isPast, true);
  assert.equal(result[1].isLayoutHidden, true);
});

test('panel clock only publishes active row changes at vocal boundaries, including seeks', () => {
  const {context, panel} = helpers();
  const activeChanges = [];
  let tick, position = 0;
  Object.assign(context, {
    lyrics, panelPlaybackTimeline: panel.buildPanelLinePlaybackTimeline(lyrics),
    window: {dispatchEvent() {}}, Event: class {},
    Spicetify: {Player: {getProgress: () => position, data: {item: {uri: 'test'}}}, LocalStorage: {get: () => null}},
    currentIndex: 0, visualIndex: 0, isEnabled: true, trackOffset: 0, globalOffset: 0,
    karaokeSource: 'unison', pseudoKaraokeAdvanceMs: 0, PSEUDO_KARAOKE_SOURCES: new Set(),
    hasKaraokeTiming: true, reducePanelMotion: true, PANEL_LINE_TRANSITION_DURATION_MS: 520,
    getPanelTimedLineIndex: (_, p) => Math.max(0, lyrics.findLastIndex(row => row.startTime <= p)),
    getPanelTrailingInterludeState: () => ({activeKey: null, visualKey: null}),
    setSingingLineIndices: indices => activeChanges.push(plain(indices)),
    setCurrentIndex() {}, setVisualIndex() {}, setActiveTrailingInterludeKey() {}, setVisualTrailingInterludeKey() {},
    setInterval: callback => {tick = callback; return 1;}, clearInterval() {},
  });
  const effect = slice(panelSource, '        // 현재 재생 위치 추적 및 노래방 가사 타이밍 업데이트', '        }, [lyrics, isEnabled, trackOffset');
  const body = effect.slice(effect.indexOf('useEffect(() => {') + 'useEffect(() => {'.length);
  vm.runInContext(`(() => {${body}})()`, context);
  for (const p of [1000, 1100, 2000, 2200, 3000, 4000, 4000, 10000, 2500, 0]) {position = p; tick();}
  assert.deepEqual(activeChanges, [[], [0], [0,1], [0], [], [0,1], []]);
});
