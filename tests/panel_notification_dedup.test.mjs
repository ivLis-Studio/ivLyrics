import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../NowPlayingPanelLyrics.js', import.meta.url), 'utf8');
function effectBetween(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const body = source.indexOf('useEffect(() => {', start) + 'useEffect(() => {'.length;
  const end = source.indexOf(endMarker, body);
  assert.ok(start >= 0 && body > start && end > body);
  return source.slice(body, end);
}

function positionHarness({sourceType = 'paxsenix', trackOffset = 0, globalOffset = 0} = {}) {
  const events = [], updates = [], polls = [];
  let position = 0, tick, stopped = false;
  const player = {data: {item: {uri: 'track-a'}}, getProgress: () => position};
  const window = {dispatchEvent: e => events.push([e.type, window._ivLyricsPanelCurrentTime, player.data.item.uri])};
  const context = vm.createContext({
    window, Spicetify: {Player: player, LocalStorage: {get: () => null}}, Event: class {constructor(type) {this.type = type;}},
    lyrics: [{startTime: 0}, {startTime: 1000}], isEnabled: true,
    currentIndex: -1, visualIndex: -1, trackOffset, globalOffset,
    karaokeSource: sourceType, pseudoKaraokeAdvanceMs: 150, PSEUDO_KARAOKE_SOURCES: new Set(['pseudo']),
    hasKaraokeTiming: true, reducePanelMotion: false, PANEL_LINE_TRANSITION_DURATION_MS: 520,
    createTrailingKaraokeInterludeResolver: () => () => null,
    getPanelTimedLineIndex: (_, p) => {polls.push(p); return p >= 1000 ? 1 : 0;},
    getPrecenteredPanelLineIndex: (_, p) => p >= 480 ? 1 : 0,
    getPanelTrailingInterludeState: () => ({activeKey: null, visualKey: null}),
    setCurrentIndex: value => updates.push(['current', value]),
    setVisualIndex: value => updates.push(['visual', value]),
    setActiveTrailingInterludeKey: value => updates.push(['trailing', value]),
    setVisualTrailingInterludeKey: value => updates.push(['visualTrailing', value]),
    setInterval: callback => {tick = callback; return 1;}, clearInterval: () => {stopped = true;},
  });
  const body = effectBetween('// 현재 재생 위치 추적 및 노래방 가사 타이밍 업데이트', '        }, [lyrics, isEnabled, trackOffset');
  const cleanup = vm.runInContext(`(() => {${body}})()`, context);
  return {events, updates, polls, window, player, tick: (p = position) => {position = p; tick();}, cleanup, stopped: () => stopped};
}

test('paused panel retains position polling but sends one notification for an unchanged time', () => {
  const h = positionHarness();
  for (let i = 0; i < 133; i++) h.tick(0);
  assert.equal(h.polls.length, 134);
  assert.deepEqual(h.events, [['ivlyrics-panel-time-update', 0, 'track-a']]);
  assert.deepEqual(h.updates, [['current', 0], ['visual', 0]]);
  h.cleanup(); assert.ok(h.stopped()); assert.equal(h.window._ivLyricsPanelCurrentTime, 0);
});

test('seek, resume, reverse seek and same-position track changes all notify', () => {
  const h = positionHarness();
  for (const p of [0, 0, 450, 480, 480, 1000, 1030, 0, 0]) h.tick(p);
  h.player.data.item.uri = 'track-b'; h.tick(0);
  assert.deepEqual(h.events.map(e => [e[1], e[2]]), [
    [0, 'track-a'], [450, 'track-a'], [480, 'track-a'], [1000, 'track-a'],
    [1030, 'track-a'], [0, 'track-a'], [0, 'track-b'],
  ]);
  assert.deepEqual(h.updates, [['current', 0], ['visual', 0], ['visual', 1], ['current', 1], ['current', 0], ['visual', 0]]);
});

test('initial mount and timing-setting remount publish the adjusted time immediately', () => {
  const h = positionHarness({sourceType: 'pseudo', trackOffset: 100, globalOffset: -50});
  assert.equal(h.events[0][1], 200);
  h.tick(0); assert.equal(h.events.length, 1);
  h.cleanup();
  const remounted = positionHarness({sourceType: 'pseudo', trackOffset: 200, globalOffset: -50});
  assert.equal(remounted.events[0][1], 300);
});

test('vocal anchor notifications preserve every position change and skip identical anchors', () => {
  let update, removedListener = false;
  const attrs = new Map(), toggles = [], events = [];
  const stack = {setAttribute: (k,v) => attrs.set(k,v), removeAttribute: k => attrs.delete(k), querySelectorAll: () => [0,1,2,3].map(i => ({getAttribute: () => String(i), classList: {toggle: (_, active) => toggles.push([i,active]), remove: () => {}}}))};
  const window = {_ivLyricsPanelCurrentTime: 0, dispatchEvent: e => events.push([e.type, attrs.get('data-panel-vocal-anchor-position')]), addEventListener: (_, fn) => {update = fn;}, removeEventListener: () => {removedListener = true;}};
  const context = vm.createContext({window, vocalStackRef: {current: stack}, vocalAnchorStateRef: {}, vocalRows: [], shouldUseVocalRowAnchor: true,
    Event: class {constructor(type) {this.type = type;}}, buildVocalAnchorTimeline: () => ({key: 'fixture'}),
    getVocalAnchorPosition: (_, time) => time / 1000, getStableVocalAnchorPosition: (_,__,___,position) => position,
  });
  const body = effectBetween('    const KaraokeLine = memo(', '        }, [shouldUseVocalRowAnchor, vocalRows, textEffectRevision]);');
  const cleanup = vm.runInContext(`(() => {${body}})()`, context);
  for (const time of [0,0,250,250,1000,1000,2000,3000,3000,0]) {window._ivLyricsPanelCurrentTime = time; update();}
  assert.deepEqual(events.map(e => e[1]), ['0','0.25','1','2','3','0']);
  assert.equal(toggles.length, 24);
  cleanup(); assert.ok(removedListener); assert.equal(attrs.size, 0);
});
