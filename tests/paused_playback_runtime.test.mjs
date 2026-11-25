import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { createLyricsFrameScheduler } from '../src/lyrics/lyricsFrameScheduler.mjs';
import { createLyricsPlaybackHooks, createLyricsViewClock } from '../src/lyrics/lyricsPlaybackView.mjs';
import { getPlaybackPositionService, installPlaybackPositionService } from '../src/core/playbackPositionService.mjs';

const { createPlaybackClock, createSpotifyPlaybackClock } = createRequire(import.meta.url)('../src/core/PlaybackClock.js');
const surface = () => {
  const listeners = new Map();
  return {
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
    emit(type, event) { for (const fn of listeners.get(type) || []) fn(event); },
    get listenerCount() { return [...listeners.values()].reduce((n, set) => n + set.size, 0); },
  };
};

function animationHarness() {
  let now = 0, next = 0, callbacks = 0;
  const jobs = new Map();
  const window = surface(), document = Object.assign(surface(), {
    hidden: false, documentElement: { classList: { contains: () => false } },
  });
  const player = Object.assign(surface(), {
    data: { isPaused: true, item: { uri: 'one' } }, position: 1000,
    getProgress() { return this.position; },
  });
  const schedule = (fn, delay) => { jobs.set(++next, { fn, time: now + delay }); return next; };
  const manager = createLyricsFrameScheduler({
    getPlayer: () => player, getPlatformPaused: () => undefined,
    hostEvents: window, documentEvents: document, isHidden: () => document.hidden, isSettingsOpen: () => false,
    getFrameRate: () => 60, now: () => now,
    requestFrame: fn => schedule(fn, 1000 / 60), cancelFrame: id => jobs.delete(id),
    scheduleTimer: schedule, cancelTimer: id => jobs.delete(id),
  });
  const callback = () => callbacks++;
  manager.addCallback(callback);
  return { manager, player, window, document, jobs, callback, get callbacks() { return callbacks; },
    advance(ms) {
      const until = now + ms;
      while (true) {
        const entry = [...jobs].sort((a, b) => a[1].time - b[1].time)[0];
        if (!entry || entry[1].time > until) break;
        jobs.delete(entry[0]); now = entry[1].time; entry[1].fn(now);
      }
      now = until;
    },
  };
}

test('paused callbacks settle, sleep, and immediately resume on play/settings/seek', () => {
  const h = animationHarness();
  h.advance(2000);
  const settled = h.callbacks;
  assert.ok(settled > 50, 'allow existing transitions to finish');
  h.advance(5000);
  assert.equal(h.callbacks, settled, 'no lyric work while position is unchanged');
  assert.equal(h.jobs.size, 1, 'only one seek safety timer');
  h.player.position = 5000; h.advance(300);
  assert.ok(h.callbacks > settled, 'seek without event is detected');
  h.advance(2000);
  const beforePlay = h.callbacks;
  h.player.data.isPaused = false; h.player.emit('onplaypause'); h.advance(20);
  assert.ok(h.callbacks > beforePlay, 'play wakes on the next frame');
  h.player.data.isPaused = true; h.player.emit('onplaypause'); h.advance(2000);
  const beforeSettings = h.callbacks;
  h.window.emit('ivLyrics'); h.advance(20);
  assert.ok(h.callbacks > beforeSettings);
  h.manager.removeCallback(h.callback);
  assert.equal(h.jobs.size, 0);
  assert.equal(h.player.listenerCount + h.window.listenerCount + h.document.listenerCount, 0);
});

test('hidden/visible and a newly mounted lyric subscriber wake an idle manager', () => {
  const h = animationHarness(); h.advance(2000);
  h.document.hidden = true; h.document.emit('visibilitychange'); h.advance(1000);
  const before = h.callbacks;
  h.document.hidden = false; h.document.emit('visibilitychange'); h.advance(300);
  assert.ok(h.callbacks > before);
  h.advance(2000);
  let mounted = 0; h.manager.addCallback(() => mounted++); h.advance(20);
  assert.ok(mounted > 0);
  h.manager.stop();
});

test('a seek from a running lyric callback leaves only one scheduled frame', () => {
  const h = animationHarness();
  const seek = () => h.player.emit('onseek');
  h.manager.addCallback(seek);
  h.advance(20);
  assert.equal(h.jobs.size, 1);
  h.manager.removeCallback(seek);
  h.manager.removeCallback(h.callback);
  assert.equal(h.jobs.size, 0);
});

test('the visible clock uses fresh offsets after edits, stale disk reads and track switches', async () => {
  const host = surface(), hooks = [], queued = [];
  const callbacks = new Set(), visibilityListeners = new Set(), disk = new Map(), samples = [];
  let cursor = 0;
  const useState = (defaultValue) => {
    const index = cursor++;
    const slot = hooks[index] ??= { value: typeof defaultValue === 'function' ? defaultValue() : defaultValue };
    slot.set ??= value => { slot.value = value; };
    return [slot.value, slot.set];
  };
  const useRef = (value) => hooks[cursor++] ??= { current: value };
  const useEffect = (effect, deps) => {
    const index = cursor++;
    const previous = hooks[index];
    if (previous && deps.every((value, i) => Object.is(value, previous.deps[i]))) return;
    queued.push(() => {
      previous?.cleanup?.();
      hooks[index] = { deps, cleanup: effect() };
    });
  };
  const clock = createLyricsViewClock({
    getSafePlayerProgress: () => 1000, getPublicProgress: () => 1000,
    getSnapshot: () => ({ position: 1000 }),
    getDelay: () => 0, getPronunciationLead: () => 0, readGlobalOffset: () => 0,
  });
  const { useLyricsPlaybackObserver } = createLyricsPlaybackHooks({
    react: { useState, useRef, useEffect },
    hostEvents: host, clock,
    frameScheduler: { addCallback: fn => callbacks.add(fn), removeCallback: fn => callbacks.delete(fn) },
    visibilityManager: { addListener: fn => visibilityListeners.add(fn), removeListener: fn => visibilityListeners.delete(fn) },
    readTrackUri: () => assert.fail('explicit lyric URI owns track offsets'),
    readTrackOffset: uri => new Promise(resolve => disk.set(uri, resolve)),
    readGlobalOffset: () => 0,
  });
  const observe = position => samples.push(position);
  const render = uri => {
    cursor = 0;
    useLyricsPlaybackObserver(observe, uri);
    for (const effect of queued.splice(0)) effect();
  };
  const settle = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
  render('old-track');
  await settle();
  assert.equal(samples.at(-1), 1000);
  host.emit('ivLyrics:offset-changed', { detail: { trackUri: 'old-track', offset: 250 } });
  render('old-track');
  assert.equal(samples.at(-1), 1250);
  disk.get('old-track')(-400);
  await settle();
  render('old-track');
  assert.equal(clock.getFrameAlignedLyricsPlaybackPosition(), 1250);
  render('new-track');
  for (const callback of callbacks) callback();
  assert.equal(samples.at(-1), 1000);
  assert.equal(clock.getFrameAlignedLyricsPlaybackPosition(), 1000);
  await settle();
  disk.get('new-track')(90);
  await settle();
  render('new-track');
  assert.equal(clock.getFrameAlignedLyricsPlaybackPosition(), 1090);
  assert.equal(callbacks.size, 1);
  for (const slot of hooks) slot?.cleanup?.();
  assert.equal(host.listenerCount + callbacks.size + visibilityListeners.size, 0);
});

test('page and startup position consumers reuse the same guarded clock and player listeners', t => {
  const legacy = { getSafePlayerProgress: () => 900 };
  const host = { Utils: legacy };
  assert.equal(getPlaybackPositionService(host), legacy);
  const player = Object.assign(surface(), {
    data: { item: { uri: 'spotify:track:example' }, isPaused: true },
    getProgress: () => 4200,
    getDuration: () => 9000,
  });
  const spicetify = { Player: player };
  const first = installPlaybackPositionService(host, spicetify);
  t.after(() => host.__ivLyricsPlaybackProgressGuard?.destroy());
  assert.equal(getPlaybackPositionService(host), first);
  assert.equal(first.getSafePlayerProgress(), 4200);
  const guard = host.__ivLyricsPlaybackProgressGuard;
  assert.equal(player.listenerCount, 3);
  const second = installPlaybackPositionService(host, spicetify);
  assert.equal(getPlaybackPositionService(host), second);
  assert.equal(second.getPlayerPlaybackSnapshot().uri, 'spotify:track:example');
  assert.equal(host.__ivLyricsPlaybackProgressGuard, guard);
  assert.equal(player.listenerCount, 3);
  guard.destroy();
  assert.equal(player.listenerCount, 0);
});

test('precise local samples use idle cadence when paused and preserve fresh seek samples', async () => {
  let paused = true, next = 0, position = 1000, resolveSample;
  const jobs = new Map();
  const clock = createPlaybackClock({
    getPlayerData: () => ({ item: { uri: 'one' }, isPaused: paused }), isLocalPlayback: () => true,
    getLocalPositionState: () => new Promise(resolve => { resolveSample = resolve; }),
    schedule: (fn, delay) => { jobs.set(++next, { fn, delay }); return next; }, cancel: id => jobs.delete(id),
    getPublicProgress: () => position,
  });
  clock.start(); resolveSample({ position }); await Promise.resolve();
  assert.equal([...jobs.values()][0].delay, 500);
  paused = false; clock.invalidate();
  assert.equal([...jobs.values()][0].delay, 0);
  const runNext = () => { const [id, job] = [...jobs][0]; jobs.delete(id); job.fn(); };
  runNext();
  position = 8000; clock.invalidate();
  resolveSample({ position: 1000 }); await Promise.resolve();
  assert.equal(clock.getSnapshot().position, 8000, 'invalidated in-flight sample cannot overwrite seek');
  assert.equal([...jobs.values()][0].delay, 50);
  runNext(); resolveSample({ position }); await Promise.resolve();
  clock.destroy(); assert.equal(jobs.size, 0);
});

test('Spotify pause/seek subscription wakes clock and is removed on destroy', () => {
  const player = Object.assign(surface(), { data: { item: { uri: 'one' }, isPaused: true } });
  const jobs = new Map(); let id = 0;
  const clock = createSpotifyPlaybackClock({ Player: player }, {
    schedule: (fn, delay) => { jobs.set(++id, { fn, delay }); return id; }, cancel: key => jobs.delete(key),
  });
  clock.start(); assert.equal([...jobs.values()][0].delay, 500);
  player.emit('onplaypause'); assert.equal([...jobs.values()][0].delay, 0);
  clock.destroy(); assert.equal(player.listenerCount, 0); assert.equal(jobs.size, 0);
});

test('Spotify clock survives public playback methods becoming available before the player', () => {
  const read = method => () => {
    if (!ready) throw new TypeError('PlayerAPI is still starting');
    return ready[method];
  };
  let ready;
  const player = Object.assign(surface(), {
    getProgress: read('position'), getDuration: read('duration'), isPlaying: read('playing'),
  });
  const clock = createSpotifyPlaybackClock({ Player: player }, { autoStart: false });
  assert.equal(clock.getSnapshot().position, 0);

  ready = { position: 4200, duration: 9000, playing: true };
  player.data = { item: { uri: 'spotify:track:example' } };
  const recovered = clock.getSnapshot();
  assert.equal(recovered.uri, 'spotify:track:example');
  assert.equal(recovered.position, 4200);
  assert.equal(recovered.isPlaying, true);
  assert.equal(recovered.duration, 9000);
  clock.destroy();
});
