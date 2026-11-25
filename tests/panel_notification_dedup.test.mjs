import assert from 'node:assert/strict';
import test from 'node:test';
import { startPanelPlaybackSubscription } from '../src/lyrics/panelPlaybackSubscription.mjs';

import { observePanelVocalAnchor } from "../src/lyrics/panelVocalLayout.mjs";

function positionHarness({sourceType = 'open-lyrics', trackOffset = 0, globalOffset = 0, snapshot = null,
  reducePanelMotion = false, getPronunciationLead = () => 0, storedTrackDelay = () => null,
  lyrics = [{startTime: 0}, {startTime: 1000}]} = {}) {
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
  const cleanup = startPanelPlaybackSubscription({
    lyrics,
    timeline: [], enabled: true, hasKaraokeTiming: true, reduceMotion: reducePanelMotion,
    startIndex: -1, startVisualIndex: -1, transitionMs: 520,
    offsetMs: {track: trackOffset, global: globalOffset, pseudo: sourceType === 'pseudo' ? 150 : 0},
    resolveTrailingInterlude: () => null,
    read: {
      snapshot: () => window.Utils?.getPlayerPlaybackSnapshot?.(),
      fallbackPlayback: () => ({position: player.getProgress(), isPlaying: false}),
      trackUri: () => player.data.item.uri,
      storedTrackDelay,
      pronunciationLead: getPronunciationLead,
    },
    on: {
      position: value => {window._ivLyricsPanelCurrentTime = value; polls.push(value);},
      positionChanged: () => window.dispatchEvent({type: 'ivlyrics-panel-time-update'}),
      activeLineChanged: value => updates.push(['current', value]),
      visualLineChanged: value => updates.push(['visual', value]),
      singingLinesChanged() {},
      activeInterludeChanged: value => updates.push(['trailing', value]),
      visualInterludeChanged: value => updates.push(['visualTrailing', value]),
    },
    scheduler: {
      visibilityTarget: document,
      isHidden: () => document.hidden,
      scheduleTimer: (callback, delay) => {assert.equal(poll, null); poll = {id: nextId++, callback, delay}; return poll.id;},
      cancelTimer: id => {cancelled.push(['poll', id]); if (poll?.id === id) poll = null;},
      requestFrame: callback => {assert.equal(frame, null); frame = {id: nextId++, callback}; return frame.id;},
      cancelFrame: id => {cancelled.push(['frame', id]); if (frame?.id === id) frame = null;},
    },
  });
  const runPoll = () => {const {callback, delay} = poll; assert.equal(delay, 30); poll = null; callback();};
  return {
    events, updates, polls, window, player, document, cancelled,
    pending: () => ({poll: poll && poll.delay, frame: Boolean(frame)}),
    getCallback: () => (poll || frame)?.callback,
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

test('panel delay uses the sampled track even when the public Spotify item is late', () => {
  const reads = [];
  const snapshot = {position: 2000, isPlaying: false, uri: 'track-b'};
  const h = positionHarness({ snapshot, storedTrackDelay: uri => {reads.push(uri); return '125';} });
  assert.equal(h.player.data.item.uri, 'track-a');
  assert.deepEqual(reads, ['track-b']);
  assert.equal(h.polls[0], 2125);
  snapshot.djNarration = true;
  h.tick();
  assert.deepEqual(reads, ['track-b']);
  assert.equal(h.polls.at(-1), 2000);
  h.cleanup();
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
  let position = 0;
  const host = {
    Event: class { constructor(type) { this.type = type; } },
    dispatchEvent: event => events.push([event.type, attrs.get('data-panel-vocal-anchor-position')]),
    addEventListener: (_, callback) => { update = callback; },
    removeEventListener: () => { removedListener = true; },
  };
  const cleanup = observePanelVocalAnchor({
    host, stackElement: stack, readPlaybackPosition: () => position,
    vocalAnchorStateRef: { current: { key: "", anchorPosition: -1, lastPlaybackPosition: NaN } },
    vocalRows: [0, 1000, 2000, 3000].map(startTime => ({ syllables: [{ startTime, endTime: startTime + 1000 }] })),
    shouldUseVocalRowAnchor: true,
  });
  for (const time of [0, 0, 250, 250, 1000, 1000, 2000, 3000, 3000, 0]) { position = time; update(); }
  assert.deepEqual(events.map(event => event[1]), ['0', '1', '2', '3', '0']);
  assert.equal(toggles.length, 20);
  cleanup(); assert.ok(removedListener); assert.equal(attrs.size, 0);
});

test('obsolete panel frame callbacks cannot publish after visibility changes or unmount', () => {
  const h = positionHarness({snapshot: {position: 3000, isPlaying: true, sampledAt: 1010}});
  const fromVisible = h.getCallback();
  h.setVisibility(true);
  const fromHidden = h.getCallback();
  assert.deepEqual(h.pending(), {poll: 30, frame: false});
  assert.equal(h.polls.length, 2);
  fromVisible(1000);
  assert.equal(h.polls.length, 2);
  h.cleanup();
  const writesAfterUnmount = h.polls.length;
  fromHidden();
  assert.equal(h.polls.length, writesAfterUnmount);
  assert.equal(h.window._ivLyricsPanelCurrentTime, 0);
  assert.deepEqual(h.pending(), {poll: null, frame: false});
});

test('pronunciation lead is sampled separately from track and provider offsets', () => {
  let lead = 200;
  const h = positionHarness({
    sourceType: 'pseudo', trackOffset: 100, globalOffset: -50, getPronunciationLead: () => lead,
  });
  assert.equal(h.events[0][1], 400);
  lead = 0;
  h.tick();
  assert.equal(h.events.at(-1)[1], 200);
  h.cleanup();
});

test('panel advances to the same source row as the main lyrics when starts overlap out of order', () => {
  const h = positionHarness({lyrics: [{startTime: 1000}, {startTime: 7000}, {startTime: 3000}]});
  for (const p of [2479, 2480, 2999, 3000, 1000]) h.tick(p);
  assert.deepEqual(h.updates, [
    ['current', 0], ['visual', 0], ['visual', 1], ['current', 2], ['visual', 2],
    ['current', 0], ['visual', 0],
  ]);
  h.cleanup();
});
