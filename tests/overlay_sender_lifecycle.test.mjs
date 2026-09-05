import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../LyricsService.js', import.meta.url), 'utf8');
const baselineRevision = process.env.IVLYRICS_REFACTOR_TEST_REVISION;
const baseline = baselineRevision ? execFileSync('git', ['show', `${baselineRevision}:LyricsService.js`], {
  cwd: new URL('..', import.meta.url), encoding: 'utf8',
}) : null;
const section = (text, from, to) => text.slice(text.indexOf(from), text.indexOf(to, text.indexOf(from)));
const sharedMethods = ['teardownOffsetListener', 'stopProgressSync', 'scheduleConnectionCheck', 'syncRuntimeState',
  'setupRuntimeListener', 'teardownRuntimeListener', 'destroy'];
const serial = value => JSON.parse(JSON.stringify(value));

function load(text) {
  const trace = [], timers = new Map(), workers = [], values = new Map();
  let nextId = 0, removePlayerThrows = false;
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
    window, document, Blob, URL: {createObjectURL: () => 'blob:worker', revokeObjectURL() {}},
    Worker: class { constructor() { this.id = workers.length; workers.push(this); trace.push(['worker', this.id]); }
      postMessage(message) { trace.push(['worker-message', this.id, message]); }
      terminate() { this.terminated = true; trace.push(['terminate', this.id]); } },
    Spicetify: {Player: player, LocalStorage: {get: key => values.get(key), set: (key, value) => values.set(key, value)}},
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    setTimeout: timeout, clearTimeout: clear, setInterval: timeout, clearInterval: clear,
    helperDebug: (...args) => trace.push(['debug', ...args]), scheduleSenderBootstrap: (...args) => trace.push(['bootstrap', ...args]),
    Utils: {getPlayerPlaybackSnapshot: () => ({uri: player.data.item.uri})},
    // Keep connection probes pending: no external transport or asynchronous
    // recovery changes interfere with the lifecycle scheduling assertions.
    fetch: (url, options) => { trace.push(['fetch', url, JSON.parse(options.body)]); return new Promise(() => {}); },
    AbortSignal: {timeout: ms => ({timeout: ms})},
  });
  vm.runInContext(section(text, '    const cleanupWorker =', '    serviceDebug("[LyricsService] Initializing')
    + section(text, '    const LYRICS_SEND_RETRY_DELAYS =', '    window.LyricsService = LyricsService;')
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
  return {overlay, helper, window, player, trace, state, workers, values,
    removePlayerThrows: value => { removePlayerThrows = value; },
    runTimer(ms) { const entry = [...timers].find(([, t]) => t.ms === ms); assert.ok(entry); timers.delete(entry[0]); entry[1].fn(); },
  };
}

function lifecycle(text) {
  const h = load(text), {overlay, helper} = h, snapshots = [];
  overlay.init(); helper.init(); overlay.init(); helper.init(); snapshots.push(h.state());
  assert.equal(h.workers.length, 2, 'duplicate initialization must not create more workers');
  assert.equal(h.player.counts().songchange, 2, 'each sender owns exactly one track listener');
  assert.notStrictEqual(overlay._worker, helper._worker);
  assert.notStrictEqual(overlay._offsetCache, helper._offsetCache);
  assert.notStrictEqual(overlay._storageListener, helper._storageListener);
  helper.setSettingsOpen(true); helper.scheduleConnectionCheck(); helper.scheduleConnectionCheck();
  assert.equal(h.state().timers.filter(([, ms]) => ms === 1000).length, 2, 'connection checks coalesce per sender');
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
  if (baseline) assert.deepEqual(actual, lifecycle(baseline));
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
    '_storageListener', '_songChangeListener', '_runtimeStorageListener', '_runtimeEventListener']) {
    assert.equal(Object.getOwnPropertyDescriptor(after.helper, name)?.writable, true, `${name} must remain independently writable`);
  }
  if (baseline) assert.deepEqual(Object.getOwnPropertyNames(after.helper), Object.getOwnPropertyNames(load(baseline).helper));
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
    return serial({state: h.state(), songListenerRetained: !!h.helper._songChangeListener, trace: h.trace});
  };
  for (const missing of [false, true]) {
    const actual = run(source, missing);
    if (baseline) assert.deepEqual(actual, run(baseline, missing));
  }
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
