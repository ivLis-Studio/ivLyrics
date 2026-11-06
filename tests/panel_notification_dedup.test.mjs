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

function positionHarness({sourceType = 'open-lyrics', trackOffset = 0, globalOffset = 0, snapshot = null, reducePanelMotion = false} = {}) {
  const events = [], updates = [], polls = [];
  let position = 0, nextId = 1, poll = null, frame = null, stopped = false;
  const cancelled = [];
  const player = {data: {item: {uri: 'track-a'}}, getProgress: () => position};
  const window = {dispatchEvent: e => events.push([e.type, window._ivLyricsPanelCurrentTime, player.data.item.uri])};
  if (snapshot) window.Utils = {getPlayerPlaybackSnapshot: () => ({...snapshot})};
  const visibilityListeners = new Set();
  const document = {
    hidden: false,
    addEventListener: (type, fn) => {if (type === 'visibilitychange') visibilityListeners.add(fn);},
    removeEventListener: (type, fn) => {if (type === 'visibilitychange') visibilityListeners.delete(fn);},
  };
  const context = vm.createContext({
    window, document, Spicetify: {Player: player, LocalStorage: {get: () => null}}, Event: class {constructor(type) {this.type = type;}},
    lyrics: [{startTime: 0}, {startTime: 1000}], isEnabled: true,
    panelPlaybackTimeline: [], getPanelSingingLineIndices: () => [], setSingingLineIndices: () => {},
    currentIndex: -1, visualIndex: -1, trackOffset, globalOffset,
    karaokeSource: sourceType, pseudoKaraokeAdvanceMs: 150, PSEUDO_KARAOKE_SOURCES: new Set(['pseudo']),
    hasKaraokeTiming: true, reducePanelMotion, PANEL_LINE_TRANSITION_DURATION_MS: 520,
    createTrailingKaraokeInterludeResolver: () => () => null,
    getPanelTimedLineIndex: (_, p) => {polls.push(p); return p >= 1000 ? 1 : 0;},
    getPrecenteredPanelLineIndex: (_, p) => p >= 480 ? 1 : 0,
    getPanelTrailingInterludeState: () => ({activeKey: null, visualKey: null}),
    setCurrentIndex: value => updates.push(['current', value]),
    setVisualIndex: value => updates.push(['visual', value]),
    setActiveTrailingInterludeKey: value => updates.push(['trailing', value]),
    setVisualTrailingInterludeKey: value => updates.push(['visualTrailing', value]),
    setTimeout: (callback, delay) => {assert.equal(poll, null); poll = {id: nextId++, callback, delay}; return poll.id;},
    clearTimeout: id => {cancelled.push(['poll', id]); if (poll?.id === id) poll = null;},
    requestAnimationFrame: callback => {assert.equal(frame, null); frame = {id: nextId++, callback}; return frame.id;},
    cancelAnimationFrame: id => {cancelled.push(['frame', id]); if (frame?.id === id) frame = null;},
  });
  const body = effectBetween('// 현재 재생 위치 추적 및 노래방 가사 타이밍 업데이트', '        }, [lyrics, isEnabled, trackOffset');
  const cleanup = vm.runInContext(`(() => {${body}})()`, context);
  const runPoll = () => {const {callback, delay} = poll; assert.equal(delay, 30); poll = null; callback();};
  return {
    events, updates, polls, window, player, document, cancelled,
    pending: () => ({poll: poll && poll.delay, frame: Boolean(frame)}),
    tick: (p = position) => {position = p; runPoll();},
    poll: runPoll,
    frame: (frameTime) => {const {callback} = frame; frame = null; callback(frameTime);},
    setVisibility: (hidden) => {document.hidden = hidden; for (const fn of visibilityListeners) fn();},
    listenerCount: () => visibilityListeners.size,
    cleanup: () => {cleanup(); stopped = !poll && !frame;},
    stopped: () => stopped,
  };
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

test('playing panel publishes each display frame at that frame start time', () => {
  const snapshot = {position: 5000, isPlaying: true, sampledAt: 1010};
  const h = positionHarness({snapshot, trackOffset: 100, globalOffset: -50});
  // The mount update has no frame time, so it keeps the sampled position.
  assert.equal(h.events[0][1], 5050);
  assert.deepEqual(h.pending(), {poll: null, frame: true});
  // Sampled 10 ms into the frame: publish the time at the frame start.
  h.frame(1000);
  assert.equal(h.events.at(-1)[1], 5040);
  assert.deepEqual(h.pending(), {poll: null, frame: true});
  Object.assign(snapshot, {position: 5008, sampledAt: 1018});
  h.frame(1008.25);
  assert.ok(Math.abs(h.events.at(-1)[1] - 5048.25) < 1e-9);
  // A sample from before the frame start is never moved forward.
  Object.assign(snapshot, {position: 5020, sampledAt: 1010});
  h.frame(1016.5);
  assert.equal(h.events.at(-1)[1], 5070);
  assert.deepEqual(h.events.map(e => e[0]).filter(type => type !== 'ivlyrics-panel-time-update'), []);
  h.cleanup();
  assert.ok(h.stopped());
  assert.deepEqual(h.cancelled.map(e => e[0]), ['frame']);
});

test('pausing returns to the 30 ms poll and resuming returns to display frames', () => {
  const snapshot = {position: 5000, isPlaying: true, sampledAt: 1010};
  const h = positionHarness({snapshot});
  h.frame(1000);
  Object.assign(snapshot, {isPlaying: false, position: 5100, sampledAt: 1110});
  h.frame(1100);
  assert.equal(h.events.at(-1)[1], 5100);
  assert.deepEqual(h.pending(), {poll: 30, frame: false});
  h.poll();
  h.poll();
  assert.equal(h.events.filter(e => e[1] === 5100).length, 1);
  snapshot.isPlaying = true;
  h.poll();
  assert.deepEqual(h.pending(), {poll: null, frame: true});
});

test('a hidden window keeps polling and showing it resumes display frames at once', () => {
  const snapshot = {position: 5000, isPlaying: true, sampledAt: 1010};
  const h = positionHarness({snapshot});
  assert.equal(h.listenerCount(), 1);
  snapshot.position = 6000;
  h.setVisibility(true);
  assert.equal(h.events.at(-1)[1], 6000);
  assert.deepEqual(h.pending(), {poll: 30, frame: false});
  snapshot.position = 6030;
  h.poll();
  assert.equal(h.events.at(-1)[1], 6030);
  assert.deepEqual(h.pending(), {poll: 30, frame: false});
  snapshot.position = 7000;
  h.setVisibility(false);
  assert.equal(h.events.at(-1)[1], 7000);
  assert.deepEqual(h.pending(), {poll: null, frame: true});
  h.cleanup();
  assert.ok(h.stopped());
  assert.equal(h.listenerCount(), 0);
  assert.equal(h.window._ivLyricsPanelCurrentTime, 0);
});

test('reduced panel motion keeps the 30 ms cadence while playing', () => {
  const snapshot = {position: 5000, isPlaying: true, sampledAt: 1010};
  const h = positionHarness({snapshot, reducePanelMotion: true});
  assert.deepEqual(h.pending(), {poll: 30, frame: false});
  snapshot.position = 5030;
  h.poll();
  assert.equal(h.events.at(-1)[1], 5030);
  assert.deepEqual(h.pending(), {poll: 30, frame: false});
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
