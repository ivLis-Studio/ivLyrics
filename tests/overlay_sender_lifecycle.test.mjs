import { readOverlaySendersFixture } from "./fixtures/legacy-page-source.mjs";
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import test from 'node:test';
import vm from 'node:vm';
import { createOverlayOffsetResolver } from '../src/features/overlay/overlayOffsets.mjs';
import { createOverlayLyricPayload } from '../src/features/overlay/overlayLyricPayload.mjs';
import { getLyricSupplementVisibility as getOverlaySupplementVisibility } from '../src/lyrics/lyricSupplementPresentation.mjs';
import { normalizeProgressTiming as normalizeOverlayProgressTiming } from '../src/features/overlay/OverlayProtocol.js';
import { createOverlayPlaybackVisibility } from '../src/features/overlay/overlayPresentationHost.mjs';
import { createOverlayProgress } from '../src/features/overlay/overlayProgress.mjs';

const source = readOverlaySendersFixture();
const baselineRevision = process.env.IVLYRICS_REFACTOR_TEST_REVISION;
const baseline = baselineRevision ? execFileSync('git', ['show', `${baselineRevision}:LyricsService.js`], {
  cwd: new URL('..', import.meta.url), encoding: 'utf8',
}) : null;
const section = (text, from, to) => text.slice(text.indexOf(from), text.indexOf(to, text.indexOf(from)));
const sharedMethods = ['teardownOffsetListener', 'stopProgressSync', 'scheduleConnectionCheck', 'syncRuntimeState',
  'setupRuntimeListener', 'teardownRuntimeListener', 'destroy'];
const serial = value => JSON.parse(JSON.stringify(value));

function load(text) {
  const trace = [], timers = new Map(), workers = [], values = new Map(), pendingFetches = [];
  const clock = {now: 1_000_000};
  let nextId = 0, removePlayerThrows = false, playbackUri;
  const surface = name => {
    const listeners = new Map();
    return {
      addEventListener(type, fn) { const set = listeners.get(type) || new Set(); set.add(fn); listeners.set(type, set); trace.push(['add', name, type]); },
      removeEventListener(type, fn) { if (name === 'player' && removePlayerThrows) throw Error('player detached'); listeners.get(type)?.delete(fn); trace.push(['remove', name, type]); },
      dispatchEvent(event) { trace.push(['event', name, event.type, event.detail]); for (const fn of [...(listeners.get(event.type) || [])]) fn(event); },
      counts: () => Object.fromEntries([...listeners].map(([type, set]) => [type, set.size])),
    };
  };
  const window = surface('window'), document = surface('document'), player = surface('player');
  document.visibilityState = 'visible';
  player.data = {item: {uri: 'spotify:track:current'}};
  const timeout = (fn, ms) => { const id = ++nextId; timers.set(id, {fn, ms}); trace.push(['timer', id, ms]); return id; };
  const clear = id => { timers.delete(id); trace.push(['clear', id]); };
  const context = vm.createContext({
    createOverlayOffsetResolver, createOverlayLyricPayload, getOverlaySupplementVisibility, normalizeOverlayProgressTiming,
    window, document, Blob, URL: {createObjectURL: () => 'blob:worker', revokeObjectURL() {}},
    Worker: class { constructor() { this.id = workers.length; workers.push(this); trace.push(['worker', this.id]); }
      postMessage(message) { trace.push(['worker-message', this.id, message]); }
      terminate() { this.terminated = true; trace.push(['terminate', this.id]); } },
    Spicetify: {Player: player, LocalStorage: {get: key => values.get(key), set: (key, value) => values.set(key, value)}},
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    setTimeout: timeout, clearTimeout: clear, setInterval: timeout, clearInterval: clear,
    helperDebug: (...args) => trace.push(['debug', ...args]), scheduleSenderBootstrap: (...args) => trace.push(['bootstrap', ...args]),
    Utils: {getPlayerPlaybackSnapshot: () => ({uri: playbackUri ?? player.data.item.uri})},
    // Keep connection probes pending: no external transport or asynchronous
    // recovery changes interfere with the lifecycle scheduling assertions.
    fetch: (url, options) => {
      trace.push(['fetch', url, options.body ? JSON.parse(options.body) : options.method]);
      return new Promise((resolve, reject) => pendingFetches.push({resolve, reject}));
    },
    AbortSignal: {timeout: ms => ({timeout: ms})},
    Date: class extends Date { static now() { return clock.now; } },
  });
  vm.runInContext(text === source ? source : section(text, '    const cleanupWorker =', '    serviceDebug("[LyricsService] Initializing')
    + section(text, '    const LYRICS_SEND_RETRY_DELAYS =', '    if (window.__ivLyricsSnapshotReadyListener)')
    + '\nglobalThis.senders = [OverlaySender, lyricsHelperSender];', context);
  const [overlay, helper] = context.senders;
  const state = () => serial({
    sender: [overlay, helper].map(s => ({enabled: s.enabled, worker: s._worker?.id ?? null,
      connected: s.isConnected, generation: s._deliveryGeneration, pending: s._pendingLyricsSend,
      uri: s.lastSentUri, delivered: s.lastDeliveredUri, offset: s._offsetCache,
      presentation: s._lastPresentationContext, presentationKey: s._lastPresentationKey,
      offsetSetup: !!s._offsetListenerSetup, runtimeSetup: !!s._runtimeListenerSetup,
      runtimeEnabled: s._runtimeEnabledState, settingsOpen: s._isSettingsOpen})),
    listeners: [window.counts(), document.counts(), player.counts()], timers: [...timers].map(([id, t]) => [id, t.ms]),
  });
  return {overlay, helper, window, player, trace, state, workers, values, pendingFetches, clock,
    replacePlayer() {
      const replacement = surface('replacement-player');
      replacement.data = player.data;
      context.Spicetify.Player = replacement;
      return replacement;
    },
    setPlaybackUri: uri => { playbackUri = uri; },
    timerCallbacks: ms => [...timers.values()].filter(timer => timer.ms === ms).map(timer => timer.fn),
    removePlayerThrows: value => { removePlayerThrows = value; },
    runTimer(ms) { const entry = [...timers].find(([, t]) => t.ms === ms); assert.ok(entry); timers.delete(entry[0]); entry[1].fn(); },
  };
}

function lifecycle(text) {
  const h = load(text), {overlay, helper} = h, snapshots = [];
  overlay.init(); helper.init(); overlay.init(); helper.init(); snapshots.push(h.state());
  assert.equal(h.workers.length, 0, 'disconnected senders must not create progress workers');
  overlay.isConnected = true; helper.isConnected = true;
  assert.equal(h.workers.length, 2, 'duplicate initialization must not create more workers');
  assert.equal(h.player.counts().songchange, 2, 'each sender owns exactly one track listener');
  assert.notStrictEqual(overlay._worker, helper._worker);
  assert.notStrictEqual(overlay._offsetCache, helper._offsetCache);
  assert.notStrictEqual(overlay._storageListener, helper._storageListener);
  helper.setSettingsOpen(true); helper.scheduleConnectionCheck(); helper.scheduleConnectionCheck();
  assert.equal(h.state().timers.filter(([, ms]) => ms === 1000).length, 1, 'connected senders cancel probes; explicit checks still coalesce');
  helper._lastTrackInfo = {uri: 'old'}; helper._lastLyrics = [{text: 'original'}];
  helper._lastPresentationContext = {displayMode2: 'translated'}; helper._lastPresentationKey = 'presentation';
  helper.lastSentUri = 'old'; helper.lastDeliveredUri = 'old'; helper._pendingLyricsSend = {payload: 'old'};
  const overlayWorker = overlay._worker;
  helper.enabled = false; snapshots.push(h.state());
  assert.strictEqual(overlay._worker, overlayWorker, 'disabling helper must not stop overlay worker');
  assert.equal(helper._worker, null); assert.equal(helper._pendingLyricsSend, null);
  assert.equal(helper.lastSentUri, null); assert.equal(helper.lastDeliveredUri, null);
  assert.equal(helper._settingsTimer, null); assert.equal(helper._isSettingsOpen, false);
  assert.equal(h.player.counts().songchange, 1);
  assert.deepEqual(serial(helper._lastPresentationContext), {displayMode2: 'translated'}, 'disable keeps the existing presentation retention policy');
  const disabledGeneration = helper._deliveryGeneration;
  helper.enabled = false; snapshots.push(h.state());
  assert.equal(helper._deliveryGeneration, disabledGeneration, 'repeated disable does not invalidate delivery twice');
  helper.enabled = true; snapshots.push(h.state());
  h.player.dispatchEvent({type: 'songchange'}); snapshots.push(h.state());
  assert.equal(helper._lastPresentationContext, null, 'song change clears presentation unlike disable');
  helper.destroy(); const destroyedState = h.state(); helper.destroy(); snapshots.push(h.state());
  assert.deepEqual(h.state(), destroyedState, 'destroy is idempotent');
  assert.equal(helper._worker, null); assert.equal(helper._connectionCheckTimer, null);
  assert.equal(helper._runtimeListenerSetup, false); assert.equal(helper._offsetListenerSetup, false);
  assert.equal(helper._runtimeStorageListener, null); assert.equal(helper._runtimeEventListener, null);
  assert.strictEqual(overlay._worker, overlayWorker, 'destroy must affect only its sender');
  helper.enabled = false; helper.init(); helper.enabled = true; helper.init(); snapshots.push(h.state());
  helper.isConnected = true;
  assert.ok(helper._worker, 'sender can resume after destroy and reinitialization');
  assert.notStrictEqual(helper._worker, overlayWorker);
  assert.equal(h.player.counts().songchange, 2);
  overlay.enabled = false; helper.enabled = false; snapshots.push(h.state());
  assert.equal(h.player.counts().songchange, 0);
  assert.ok(h.workers.every(worker => worker.terminated), 'all created workers terminate after disable');
  return serial({snapshots, trace: h.trace});
}

test('overlay/helper lifecycle isolates enable, duplicate init, disable, songchange, destroy and reinitialize', () => {
  const actual = lifecycle(source);
  if (baseline) {
    // The seek subscription is a new behavior, exercised separately below.
    for (const {listeners} of actual.snapshots) delete listeners[2].onseek;
    actual.trace = actual.trace.filter(([action, target, event]) =>
      !(target === 'player' && event === 'onseek' && (action === 'add' || action === 'remove')));
    assert.deepEqual(actual, lifecycle(baseline));
  }
});

test('connection loss stops only its worker and reconnect resumes exactly once', () => {
  const h = load(source);
  h.overlay.init(); h.helper.init();
  h.overlay.isConnected = true; h.helper.isConnected = true;
  const previous = h.helper._worker;
  h.helper.isConnected = false;
  assert.equal(previous.terminated, true);
  assert.equal(h.helper._worker, null);
  assert.ok(h.overlay._worker);
  assert.equal(h.state().timers.filter(([, ms]) => ms === 5000).length, 1);
  h.helper.isConnected = true; h.helper.isConnected = true;
  assert.equal(h.workers.length, 3);
  assert.equal(h.state().timers.filter(([, ms]) => ms === 5000).length, 0);
  h.overlay.enabled = false; h.helper.enabled = false;
  assert.ok(h.workers.every(worker => worker.terminated));
});

test('late probes and progress responses cannot revive a destroyed or replaced sender runtime', async () => {
  for (const senderName of ['overlay', 'helper']) {
    for (const method of ['checkConnection', 'sendToEndpoint']) {
      for (const outcome of ['success', 'failure', 'rejected']) {
        for (const reinitialize of [false, true]) {
          const h = load(source), sender = h[senderName]; sender.init();
          const request = method === 'checkConnection' ? sender.checkConnection()
            : sender.sendToEndpoint('/lyrics/progress', {position: 123, isPlaying: false});
          sender.destroy();
          if (reinitialize) { sender.init(); sender.isConnected = true; }
          const before = h.state(), traceCount = h.trace.length;
          if (outcome === 'rejected') h.pendingFetches[0].reject(Error('old request'));
          else h.pendingFetches[0].resolve({ok: outcome === 'success', text: async () => 'old failure'});
          await request;
          assert.deepEqual(h.state(), before, `${senderName}/${method}/${outcome} must preserve replacement state`);
          assert.equal(h.trace.length, traceCount, 'stale transport must not emit recovery events or schedule work');
        }
      }
    }
  }
});

test('late error-body reads and queued recovery callbacks preserve the new runtime', async () => {
  for (const senderName of ['overlay', 'helper']) {
    const h = load(source), sender = h[senderName]; sender.init(); sender.isConnected = true;
    const oldRecovery = [...h.timerCallbacks(100), ...h.timerCallbacks(150)];
    let finishBody;
    const request = sender.sendToEndpoint('/lyrics/progress', {position: 123});
    h.pendingFetches[0].resolve({ok: false, text: () => new Promise(resolve => { finishBody = resolve; })});
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(typeof finishBody, 'function');
    sender.destroy();
    assert.equal(sender._connectionRecoveryTimer, null);
    assert.equal(sender._connectionRecoveryBootstrapTimer, null);
    assert.equal(h.state().timers.length, 0, 'destroy cancels both recovery timers');
    sender.init(); sender.isConnected = true;
    const before = h.state(), traceCount = h.trace.length;
    for (const callback of oldRecovery) callback(); // Already dequeued before clearTimeout.
    finishBody('late response body'); await request;
    assert.deepEqual(h.state(), before);
    assert.equal(h.trace.length, traceCount);
  }
});

test('disable/re-enable invalidates probes while the other sender remains live', async () => {
  const h = load(source); h.overlay.init(); h.helper.init(); h.overlay.isConnected = true;
  const overlayWorker = h.overlay._worker;
  const request = h.helper.checkConnection();
  h.helper.enabled = false; h.helper.enabled = true;
  const before = h.state();
  h.pendingFetches[0].resolve({ok: true}); await request;
  assert.deepEqual(h.state(), before);
  assert.strictEqual(h.overlay._worker, overlayWorker);
  assert.notEqual(h.helper._runtimeGeneration, h.overlay._runtimeGeneration, 'epochs belong to each sender');
});

test('concurrent checks share one probe, and a late timeout cannot undo a newer reply', async () => {
  const h = load(source);
  h.overlay.init();
  const probe = h.overlay.checkConnection();
  assert.strictEqual(h.overlay.checkConnection(), probe);
  assert.equal(h.pendingFetches.length, 1);
  const progress = h.overlay.sendToEndpoint('/progress', {position: 123, isPlaying: false});
  h.pendingFetches[1].resolve({ok: true});
  assert.equal(await progress, true);
  const connectedWorker = h.overlay._worker;
  h.pendingFetches[0].reject(Error('old probe timed out'));
  assert.equal(await probe, true);
  assert.equal(h.overlay.isConnected, true);
  assert.strictEqual(h.overlay._worker, connectedWorker);
});

test('switching ports twice invalidates old probes and late receipt parsing', async () => {
  const h = load(source);
  h.overlay.init();
  const oldProbe = h.overlay.checkConnection();
  let finishReceipt;
  const oldPost = h.overlay.sendToEndpoint('/progress', {position: 123}, {receipt: true});
  h.pendingFetches[1].resolve({ok: true, json: () => new Promise(resolve => { finishReceipt = resolve; })});
  await new Promise(resolve => setImmediate(resolve));
  h.overlay.port = 15001;
  h.overlay.port = 15000;
  const currentProbe = h.overlay.checkConnection();
  assert.equal(h.pendingFetches.length, 4);
  h.pendingFetches[3].resolve({ok: true, json: async () => ({protocol: 3})});
  assert.equal(await currentProbe, true);
  const currentWorker = h.overlay._worker;
  finishReceipt({ok: true, hasLyrics: false});
  assert.equal(await oldPost, false);
  h.pendingFetches[0].resolve({ok: false, status: 405});
  assert.equal(await oldProbe, false);
  h.pendingFetches[2].reject(Error('other port closed'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.overlay._receiverProtocol, 3);
  assert.equal(h.overlay.isConnected, true);
  assert.strictEqual(h.overlay._worker, currentWorker);
});

test('reconnecting on a new port resends the current lyrics while the old response is pending', async () => {
  const h = load(source), sender = h.overlay;
  const settle = () => new Promise(setImmediate);
  const lyricsPosts = () => h.trace.filter(([kind, url, body]) => kind === 'fetch' && url.endsWith('/lyrics') && typeof body === 'object');
  const uri = h.player.data.item.uri;
  h.player.getDuration = () => 180000;
  sender.getSyncOffset = async () => 0;
  sender.init();
  sender.isConnected = true;
  const firstSend = sender.sendLyrics({uri, title: 'Current song'}, [{text: 'Current verse', startTime: 200}]);
  await settle();
  assert.equal(lyricsPosts().length, 1);

  sender.port = 15001;
  const probe = sender.checkConnection();
  h.pendingFetches[1].resolve({ok: true, json: async () => ({protocol: 3})});
  assert.equal(await probe, true);
  assert.equal(h.timerCallbacks(100).length, 1, 'an obsolete POST must not suppress recovery for the new receiver');
  h.runTimer(100);
  await settle();
  h.pendingFetches[0].resolve({ok: true});
  await settle();

  assert.deepEqual(lyricsPosts().map(([, url]) => url), ['http://localhost:15000/lyrics', 'http://localhost:15001/lyrics']);
  assert.equal(lyricsPosts()[1][2].lyrics[0].text, 'Current verse');
  h.pendingFetches[2].resolve({ok: true});
  await firstSend;
  assert.equal(sender.lastDeliveredUri, uri);
});

test('paused progress is deduplicated without losing heartbeat, seek, track or queue changes', async () => {
  const h = load(source), sent = [];
  Object.defineProperty(h.helper, 'sendToEndpoint', {value: async (endpoint, payload) => { sent.push([endpoint, payload]); return true; }});
  const payload = {position: 1000, isPlaying: false, nextTrack: null};
  await h.helper.sendProgressPayload('/lyrics/progress', payload, 'one');
  for (let i = 0; i < 20; i++) await h.helper.sendProgressPayload('/lyrics/progress', payload, 'one');
  assert.equal(sent.length, 1);
  h.helper._lastProgress.sentAt -= 2000;
  await h.helper.sendProgressPayload('/lyrics/progress', payload, 'one');
  assert.equal(sent.length, 2, 'heartbeat arrives before receiver timeout');
  await h.helper.sendProgressPayload('/lyrics/progress', {...payload, position: 5000}, 'one');
  await h.helper.sendProgressPayload('/lyrics/progress', payload, 'two');
  await h.helper.sendProgressPayload('/lyrics/progress', {...payload, nextTrack: {title: 'next'}}, 'two');
  assert.equal(sent.length, 5);
  for (let i = 0; i < 4; i++) await h.helper.sendProgressPayload('/lyrics/progress', {...payload, isPlaying: true}, 'two');
  assert.equal(sent.length, 9, 'playing keeps all 250ms anchors');
  assert.equal(h.overlay._lastProgress, null, 'helper dedupe state stays independent');
  h.helper.stopProgressSync();
  await h.helper.sendProgressPayload('/lyrics/progress', payload, 'one');
  assert.equal(sent.length, 10);
});

test('a long pause keeps the overlay heartbeat and still sends paused seeks at once', async () => {
  const h = load(source), sent = [];
  Object.defineProperty(h.overlay, 'sendToEndpoint', {value: async (endpoint, payload) => { sent.push(payload); return true; }});
  const paused = {source: 'ivlyrics', position: 1000, isPlaying: false};
  await h.overlay.sendProgressPayload('/progress', paused, 'one');
  for (let elapsed = 250; elapsed <= 10000; elapsed += 250) {
    h.clock.now += 250;
    await h.overlay.sendProgressPayload('/progress', paused, 'one');
  }
  assert.equal(sent.length, 6, 'the overlay keeps a paused display while its two-second heartbeat continues');
  h.clock.now += 250;
  await h.overlay.sendProgressPayload('/progress', {...paused, position: 20000}, 'one');
  assert.equal(sent.length, 7);
  assert.equal(sent.at(-1).position, 20000, 'a seek during a long pause reaches the overlay at once');
});

test('an explicit small seek bypasses heartbeat deduplication without resending track metadata', async () => {
  const h = load(source), sent = [];
  const { overlay, helper } = h;
  overlay.init();
  overlay.isConnected = true;
  overlay._receiverProtocol = 3;
  Object.defineProperty(overlay, 'sendToEndpoint', {value: async (_endpoint, body) => { sent.push(body); return true; }});
  const uri = h.player.data.item.uri;
  const playing = {source: 'ivlyrics', trackUri: uri, position: 1000, isPlaying: true, currentTrack: {title: 'Fixture'}};
  await overlay.sendProgressPayload('/progress', playing, uri);
  h.player.dispatchEvent({type: 'onseek'});
  const nudged = {...playing, position: 1110, currentTrack: null};
  await overlay.sendProgressPayload('/progress', nudged, uri);
  assert.deepEqual(sent.map(body => [body.position, body.currentTrack?.title]), [[1000, 'Fixture'], [1110, undefined]]);
  assert.equal(overlay._lastProgressUri, uri);
  assert.equal(helper._lastProgress, null);
  overlay.destroy();
  assert.equal(h.player.counts().onseek, 0);
});

test('a small paused seek without an event is sent, while a hidden playing clock stays on its heartbeat', async () => {
  const h = load(source), sent = [];
  h.overlay._receiverProtocol = 3;
  h.overlay.sendToEndpoint = async (_endpoint, body) => { sent.push(body); return true; };
  const uri = h.player.data.item.uri;
  const paused = {source: 'ivlyrics', trackUri: uri, position: 1000, isPlaying: false};
  await h.overlay.sendProgressPayload('/progress', paused, uri);
  await h.overlay.sendProgressPayload('/progress', {...paused, position: 1110}, uri);
  await h.overlay.sendProgressPayload('/progress', {...paused, position: 1110}, uri);
  assert.deepEqual(sent.map(body => body.position), [1000, 1110]);

  const start = h.clock.now;
  for (let elapsed = 0; elapsed <= 3000; elapsed += 250) {
    h.clock.now = start + elapsed;
    await h.overlay.sendProgressPayload('/progress', {...paused, position: 1110 + elapsed}, uri, true);
  }
  assert.deepEqual(sent.slice(2).map(body => [body.position, body.isPlaying]), [[1110, false]]);
});

test('the progress worker retired with a connection cannot send ticks through its replacement', async () => {
  const h = load(source), sent = [];
  const { overlay } = h;
  overlay.init();
  overlay.isConnected = true;
  const retiredTick = overlay._worker.onmessage;
  overlay.isConnected = false;
  overlay.isConnected = true;
  overlay.buildProgressPayload = () => ({trackUri: 'fixture', payload: {position: 1000, isPlaying: true}});
  overlay.sendProgressPayload = async (...args) => { sent.push(args); };
  await retiredTick();
  assert.equal(sent.length, 0);
  await overlay._worker.onmessage();
  assert.equal(sent.length, 1);
  assert.equal(h.player.counts().onseek, 1);
  overlay.destroy();
  assert.equal(h.player.counts().onseek, 0);
});

test('a confirmed missing playback track never sends the old public item or its timings', async () => {
  const h = load(source);
  const previous = h.player.data.item;
  h.setPlaybackUri('');
  assert.equal(h.overlay.isStaleTrackSend(previous), true);
  const progress = createOverlayProgress({
    playback: {
      getPlayerPlaybackSnapshot: () => ({uri: '', isPlaying: true, position: 1100, duration: 15000}),
      resolveStablePlaybackTrack: () => ({...previous, name: 'Previous track'}),
    },
    getSpicetify: () => ({ Player: h.player }),
    getOverlayProgressIsPlaying: () => true,
  });
  const { trackUri, payload } = progress.buildProgressPayload.call(h.overlay);
  assert.equal(trackUri, '');
  assert.deepEqual([payload.trackUri, payload.currentTrack, payload.isPlaying, payload.position, payload.duration],
    [null, null, false, 0, 0]);
});

test('overlay visibility uses the playback snapshot and both ivLyrics fullscreen layouts', () => {
  let pageFullscreen = false, portalFullscreen = false, hideOverlay = true, publicPlaying = true;
  const document = {
    getElementById: () => portalFullscreen ? {querySelector: () => ({})} : null,
    body: {contains: () => true},
    querySelector: () => pageFullscreen ? {} : null,
  };
  const isPlaying = createOverlayPlaybackVisibility({
    document, getVisualSettings: () => ({'fullscreen-hide-overlay': hideOverlay}),
    getStorageItem: () => null,
    isPlayerPlaying: () => publicPlaying,
  });
  assert.equal(isPlaying({isPlaying: false}), false);
  publicPlaying = false;
  assert.equal(isPlaying({isPlaying: true}), true);
  pageFullscreen = true;
  assert.equal(isPlaying({isPlaying: true}), false);
  pageFullscreen = false;
  portalFullscreen = true;
  assert.equal(isPlaying({isPlaying: true}), false);
  hideOverlay = false;
  assert.equal(isPlaying({isPlaying: true}), true);
});

test('probes are GET requests that back off while nothing answers and return sooner on focus', async () => {
  const h = load(source);
  h.overlay.init();
  const flushAll = () => new Promise(resolve => setImmediate(resolve));
  const connectionTimer = () => [...h.state().timers].map(([, ms]) => ms).filter(ms => ms >= 1000 || ms === 0);
  assert.deepEqual(connectionTimer(), [1000], 'the first probe runs a second after startup');
  const delays = [];
  for (const ms of [1000, 5000, 10000, 20000, 40000, 60000]) {
    h.runTimer(ms);
    const fetch = h.trace.filter(([kind]) => kind === 'fetch').at(-1);
    assert.deepEqual(fetch, ['fetch', 'http://localhost:15000/progress', 'GET'], 'a probe never posts fake progress');
    h.pendingFetches.at(-1).reject(Error('connection refused'));
    await flushAll();
    delays.push(...connectionTimer());
  }
  assert.deepEqual(delays, [5000, 10000, 20000, 40000, 60000, 60000]);
  assert.equal(h.trace.filter(([kind, , method]) => kind === 'fetch' && method !== 'GET').length, 0);

  h.window.dispatchEvent({type: 'focus'});
  assert.deepEqual(connectionTimer(), [60000], 'focus right after a probe waits for the backoff');
  h.clock.now += 10000;
  h.window.dispatchEvent({type: 'focus'});
  assert.deepEqual(connectionTimer(), [0], 'focus probes at once when the last probe is not recent');
});

test('any HTTP answer connects, and only a status body announces protocol 2', async () => {
  const flushAll = () => new Promise(resolve => setImmediate(resolve));
  for (const [response, protocol] of [
    [{ok: false, status: 405}, 1],
    [{ok: true, json: async () => 'Lyrics Server OK'}, 1],
    [{ok: true, json: async () => ({app: 'ivLyrics Overlay', protocol: 2})}, 2],
  ]) {
    const h = load(source);
    h.overlay.init();
    const probe = h.overlay.checkConnection();
    h.pendingFetches.at(-1).resolve(response);
    assert.equal(await probe, true);
    await flushAll();
    assert.equal(h.overlay.isConnected, true);
    assert.equal(h.overlay._receiverProtocol, protocol);
    assert.ok(h.overlay._worker, 'progress starts once the receiver answers');
  }
  const h = load(source);
  h.helper.init();
  void h.helper.checkConnection();
  assert.deepEqual(h.trace.filter(([kind]) => kind === 'fetch').at(-1), ['fetch', 'http://localhost:15123/lyrics/health', 'GET']);
});

test('protocol 3 overlays get progress on changes, jumps and announced heartbeats only', async () => {
  const run = async protocol => {
    const h = load(source), sent = [];
    h.overlay._receiverProtocol = protocol;
    Object.defineProperty(h.overlay, 'sendToEndpoint', {value: async (endpoint, payload, options) => {
      sent.push({payload, receipt: options?.receipt});
      return options?.receipt ? {ok: true, active: true, hasLyrics: true, lyricsTrackUri: 'one'} : true;
    }});
    const start = h.clock.now;
    const base = {source: 'ivlyrics', trackUri: 'one', isPlaying: true, duration: 180000, currentTrack: null, nextTrack: null};
    const send = (elapsed, fields) => {
      h.clock.now = start + elapsed;
      return h.overlay.sendProgressPayload('/progress', {...base, remaining: 1, ...fields}, 'one');
    };
    for (let t = 0; t < 10000; t += 250) await send(t, {position: t});
    const playing = sent.length;
    await send(10000, {position: 60000});
    await send(10250, {position: 60250, isPlaying: false});
    for (let t = 10500; t <= 35000; t += 250) await send(t, {position: 60250, isPlaying: false});
    return {playing, sent};
  };
  const modern = await run(3);
  assert.equal(modern.playing, 5, 'ten seconds of playback need a heartbeat every two seconds');
  assert.deepEqual(modern.sent.slice(5, 7).map(({payload}) => [payload.position, payload.isPlaying, payload.heartbeatMs]),
    [[60000, true, 2000], [60250, false, 10000]], 'a seek and a pause go out at once');
  assert.equal(modern.sent.length, 9, 'a long pause repeats every ten seconds');
  assert.ok(modern.sent.every(({receipt}) => receipt === true));

  // 1.3.0 and 1.3.1 move line-timed lyrics only when progress arrives.
  const interim = await run(2);
  assert.equal(interim.playing, 40, 'protocol 2 overlays keep every 250 ms anchor while playing');
  assert.ok(interim.sent.slice(0, 40).every(({payload, receipt}) => payload.heartbeatMs === 0 && receipt === true));
  assert.equal(interim.sent.length, 44, 'and still pause on the ten-second heartbeat with receipts');

  const legacy = await run(1);
  assert.equal(legacy.playing, 40, 'older overlays still get every 250 ms anchor while playing');
  assert.ok(legacy.sent.every(({payload, receipt}) => !('heartbeatMs' in payload) && !receipt));
});

test('a receipt without the delivered lyrics resends them, at most every five seconds', () => {
  const h = load(source), resends = [];
  Object.defineProperty(h.overlay, 'resendWithNewOffset', {value: reason => { resends.push(reason); }});
  h.overlay._lastTrackInfo = {uri: 'one'};
  h.overlay.lastDeliveredUri = 'one';
  h.overlay.handleReceipt({hasLyrics: true, lyricsTrackUri: 'one'}, 'one');
  assert.deepEqual(resends, []);
  h.overlay.handleReceipt({hasLyrics: false, lyricsTrackUri: null}, 'one');
  assert.deepEqual(resends, ['receiver-missing-lyrics'], 'a restarted overlay gets the lyrics back');
  assert.equal(h.overlay.lastDeliveredUri, null);
  h.overlay.lastDeliveredUri = 'one';
  h.overlay.handleReceipt({hasLyrics: true, lyricsTrackUri: 'zero'}, 'one');
  assert.equal(resends.length, 1, 'repeated receipts wait for the resend gap');
  h.clock.now += 5000;
  h.overlay._activeLyricsSend = {generation: h.overlay._deliveryGeneration};
  h.overlay.handleReceipt({hasLyrics: true, lyricsTrackUri: 'zero'}, 'one');
  assert.equal(resends.length, 1, 'a delivery already in flight is not duplicated');
  h.overlay._activeLyricsSend = null;
  h.overlay.handleReceipt({hasLyrics: true, lyricsTrackUri: 'zero'}, 'one');
  assert.equal(resends.length, 2);
});

test('receiver recovery for one song does not rate-limit missing lyrics after a track change', () => {
  const h = load(source), resends = [];
  h.overlay.init();
  Object.defineProperty(h.overlay, 'resendWithNewOffset', {value: reason => resends.push(reason)});
  const missingLyrics = {hasLyrics: false, lyricsTrackUri: null};
  h.overlay._lastTrackInfo = {uri: 'one'};
  h.overlay.lastDeliveredUri = 'one';
  h.overlay.handleReceipt(missingLyrics, 'one');
  assert.equal(resends.length, 1);

  h.player.dispatchEvent({type:'songchange'});
  h.overlay._lastTrackInfo = {uri: 'two'};
  h.overlay.lastDeliveredUri = 'two';
  h.overlay.handleReceipt(missingLyrics, 'two');
  assert.equal(resends.length, 2);
  h.overlay.destroy();
});


test('helper reuses lifecycle methods without changing its own property descriptors or state isolation', () => {
  const after = load(source);
  for (const name of sharedMethods) {
    const right = Object.getOwnPropertyDescriptor(after.helper, name);
    assert.ok(right, `${name} must remain an own property`);
    assert.deepEqual([right.writable, right.enumerable, right.configurable], [false, false, false]);
    assert.strictEqual(after.helper[name], after.overlay[name]);
  }
  for (const name of ['_worker', '_offsetCache', '_settingsTimer', '_pendingLyricsSend', '_deliveryGeneration',
    '_storageListener', '_songChangeListener', '_runtimeStorageListener', '_runtimeEventListener',
    '_runtimeGeneration', '_connectionRecoveryTimer', '_connectionRecoveryBootstrapTimer']) {
    assert.equal(Object.getOwnPropertyDescriptor(after.helper, name)?.writable, true, `${name} must remain independently writable`);
  }
  if (baseline) assert.deepEqual(Object.getOwnPropertyNames(after.helper).filter(name => name !== '_removeProgressSeekListener'),
    Object.getOwnPropertyNames(load(baseline).helper));
});

test('teardown retains the detached-player exception path and missing-remove-listener behavior', () => {
  const run = (text, missing) => {
    const h = load(text); h.helper.init();
    if (missing) delete h.player.removeEventListener; else h.removePlayerThrows(true);
    h.helper.teardownOffsetListener(); h.helper.teardownOffsetListener();
    assert.equal(h.helper._offsetListenerSetup, false);
    assert.equal(!!h.helper._songChangeListener, missing, 'only a missing remove API retains the listener reference');
    assert.equal(h.helper._storageListener, null); assert.equal(h.helper._visibilityChangeListener, null);
    assert.equal(h.window.counts()['ivLyrics:lyrics-ready'], 0);
    assert.equal(h.player.counts().songchange, 1, 'the detached player retains its inaccessible listener');
    const result = serial({state: h.state(), songListenerRetained: !!h.helper._songChangeListener, trace: h.trace});
    if (text === source) {
      const generation = h.helper._deliveryGeneration;
      h.player.dispatchEvent({type: 'songchange'});
      assert.equal(h.helper._deliveryGeneration, generation, 'callbacks left in a detached player are inert');
    }
    return result;
  };
  for (const missing of [false, true]) {
    const actual = run(source, missing);
    if (baseline) assert.deepEqual(actual, run(baseline, missing));
  }
});

test('teardown removes subscriptions from the player that registered them', () => {
  const h = load(source);
  h.overlay.init();
  h.helper.init();
  const replacement = h.replacePlayer();
  h.overlay.destroy();
  assert.equal(h.player.counts().songchange, 1, 'only the helper still owns a listener on the original player');
  h.overlay.init();
  assert.equal(replacement.counts().songchange, 1);
  h.helper.destroy();
  assert.equal(h.player.counts().songchange, 0);
  assert.equal(replacement.counts().songchange, 1);
  h.overlay.destroy();
  assert.equal(replacement.counts().songchange, 0);
});

test('offset duplicates and edits for another track do not resend the playing track', async () => {
  const h = load(source);
  const sender = h.overlay;
  h.player.getDuration = () => 120000;
  const uri = h.player.data.item.uri;
  const pending = () => new Promise(setImmediate);
  const event = (type, detail) => h.window.dispatchEvent({type, detail});
  const packets = () => h.trace.filter(([kind, url, body]) => kind === 'fetch' && url.endsWith('/lyrics') && typeof body === 'object');
  let reads = 0;
  sender.getSyncOffset = async function (trackUri) {
    ++reads;
    return -(this._offsetCache[trackUri] || 0);
  };
  sender.init();
  sender.isConnected = true;
  const initial = sender.sendLyrics({uri}, [{startTime: 1000, text: 'Lyric'}]);
  await pending();
  assert.equal(packets().length, 1);
  h.pendingFetches[0].resolve({ok: true});
  await initial;

  event('ivLyrics:offset-changed', {trackUri: 'spotify:track:next', offset: 300});
  h.window.dispatchEvent({type: 'storage', key: 'lyrics-delay:spotify:track:next'});
  await pending();
  assert.equal(reads, 1, 'another track does not require reading the current offset');
  assert.equal(packets().length, 1);
  assert.equal(sender._offsetCache['spotify:track:next'], 300);

  event('ivLyrics:offset-changed', {trackUri: uri, offset: 100});
  await pending();
  assert.equal(packets().length, 2, 'a changed active offset is sent');
  h.pendingFetches[1].resolve({ok: true});
  await pending();
  event('ivLyrics:offset-changed', {trackUri: uri, offset: 100});
  event('ivLyrics:delay-changed', {trackUri: uri});
  event('ivLyrics:global-offset-changed', {offset: 0});
  await pending();
  assert.equal(packets().length, 2, 'duplicate offset notifications do not repeat the packet');
  sender.destroy();
});

test('disabling helper invalidates its queued delivery without altering the overlay delivery', async () => {
  const run = async text => {
    const h = load(text), resolvers = [], sent = [];
    h.overlay.init(); h.helper.init();
    for (const [name, sender] of [['overlay', h.overlay], ['helper', h.helper]]) {
      Object.defineProperty(sender, 'sendToEndpoint', {value: (endpoint, payload) => {
        sent.push([name, endpoint, payload]); return new Promise(resolve => resolvers.push(resolve));
      }});
    }
    const overlayRequest = h.overlay.queueLyricsSend('/lyrics', 'spotify:track:current', {originalText: 'original'});
    const helperRequest = h.helper.queueLyricsSend('/lyrics/sender', 'spotify:track:current', {originalText: 'original'});
    await h.helper.queueLyricsSend('/lyrics/sender', 'spotify:track:current', {originalText: 'newer'});
    assert.ok(h.helper._pendingLyricsSend, 'a newer helper payload is queued while its request is active');
    h.helper.enabled = false;
    for (const resolve of resolvers) resolve(true);
    await Promise.all([overlayRequest, helperRequest]);
    assert.equal(h.helper.lastDeliveredUri, null);
    assert.equal(h.helper._pendingLyricsSend, null);
    assert.equal(h.overlay.lastDeliveredUri, 'spotify:track:current');
    assert.equal(sent.length, 2, 'disable drops the queued newer helper payload');
    return serial({state: h.state(), sent, trace: h.trace});
  };
  const actual = await run(source);
  if (baseline) assert.deepEqual(actual, await run(baseline));
});
