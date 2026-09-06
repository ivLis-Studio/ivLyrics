import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const { createPlaybackClock, createSpotifyPlaybackClock } = createRequire(import.meta.url)('../PlaybackClock.js');
const source = readFileSync(new URL('../Pages.js', import.meta.url), 'utf8');
const surface = () => {
  const listeners = new Map();
  return {
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
    emit(type) { for (const fn of listeners.get(type) || []) fn(); },
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
  const context = vm.createContext({ window, document, Spicetify: { Player: player },
    performance: { now: () => now }, DEFAULT_TRACK_POSITION_FPS: 60, getTrackPositionFPS: () => 60,
    requestAnimationFrame: fn => schedule(fn, 1000 / 60), cancelAnimationFrame: id => jobs.delete(id),
    setTimeout: schedule, clearTimeout: id => jobs.delete(id),
  });
  vm.runInContext(source.slice(source.indexOf('const AnimationManager ='), source.indexOf('// Enhanced visibility change manager'))
    + '\nglobalThis.manager = AnimationManager;', context);
  const manager = context.manager;
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
