import assert from 'node:assert/strict';
import test from 'node:test';

import { createSyncedLyricsScroller } from '../src/lyrics/lyricsScrollActivity.mjs';

function harness({ anchorRatio = 0.5, centers = [-700, -370, -110, 300, 650, 980] } = {}) {
  const listeners = new Map(), windowListeners = new Map(), playerListeners = new Map();
  const timers = new Map(), frames = new Map(), changes = [];
  let nextId = 0, reads = 0, blurWrites = 0;
  const style = () => ({
    setProperty(key, value) { this[key] = String(value); if (key === '--manual-blur-index') blurWrites++; },
    removeProperty(key) { delete this[key]; },
  });
  const classes = new Set();
  const root = { style: style(), children: [] };
  const container = {
    scrollTop: 0, clientHeight: 600,
    classList: { add: key => classes.add(key), remove: key => classes.delete(key), contains: key => classes.has(key) },
    querySelector: () => root, getBoundingClientRect: () => ({ top: 100 }),
    appendChild(node) { this.spacer = node; }, contains: element => root.children.includes(element),
    addEventListener(type, listener, options) { listeners.set(`${type}:${options === true}`, listener); },
    removeEventListener(type, listener, options) { listeners.delete(`${type}:${options === true}`); },
  };
  root.children = centers.map((center, index) => ({
    textContent: `Row ${index}`, style: style(), dataset: { lyricsSeekTime: String(index * 5000) },
    classList: { contains: () => true }, getAnimations: () => [],
    getBoundingClientRect() {
      reads++;
      const translate = Number.parseFloat((root.style.translate || '0 0').split(' ')[1]);
      return { top: 100 + center - 40 + translate - container.scrollTop, height: 80, width: 800, left: 20 };
    },
  }));
  const returns = new WeakMap();
  const scroller = createSyncedLyricsScroller({
    container, onActiveChange: active => changes.push(active),
    createSpacer: () => ({ style: style(), setAttribute() {}, remove() { container.spacer = null; } }),
    hostEvents: { addEventListener: (key, cb) => windowListeners.set(key, cb), removeEventListener: key => windowListeners.delete(key) },
    player: { addEventListener: (key, cb) => playerListeners.set(key, cb), removeEventListener: key => playerListeners.delete(key) },
    returnPositions: returns, getAnchorRatio: () => anchorRatio,
    scheduleTimer: cb => { timers.set(++nextId, cb); return nextId; }, cancelTimer: id => timers.delete(id),
    scheduleFrame: cb => { frames.set(++nextId, cb); return nextId; }, cancelFrame: id => frames.delete(id),
    now: () => 9000,
  });
  const emit = (type, data = {}, capture = false) => {
    const event = { type, deltaX: 0, deltaY: 0, deltaMode: 0, target: container,
      preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.propagationStopped = true; }, ...data };
    listeners.get(`${type}:${capture}`)?.(event); return event;
  };
  return { container, root, changes, timers, returns, scroller, listeners, windowListeners, playerListeners, emit,
    readCount: () => reads, blurWrites: () => blurWrites,
    flush() { emit('scroll'); for (const [id, callback] of frames) { frames.delete(id); callback(); } },
    idle() { const pending = [...timers.values()]; timers.clear(); pending.forEach(cb => cb()); },
  };
}

test('first wheel delta moves every existing row by that delta without a recenter or reflow', () => {
  for (const delta of [-23, 17, 240]) for (const anchorRatio of [0.35, 0.5, 0.65]) {
    const h = harness({ anchorRatio });
    const rows = [...h.root.children];
    const before = rows.map(row => row.getBoundingClientRect());
    assert.equal(h.emit('wheel', { deltaY: delta }).defaultPrevented, true);
    rows.forEach((row, i) => {
      const after = row.getBoundingClientRect();
      assert.equal(after.top, before[i].top - delta);
      for (const field of ['left', 'width', 'height']) assert.equal(after[field], before[i][field]);
      assert.equal(h.root.children[i], row);
    });
    assert.deepEqual(h.changes, [true]);
    h.flush();
    const reads = h.readCount();
    h.emit('wheel', { deltaY: 18 }); h.flush();
    assert.equal(h.readCount(), reads, 'scroll frames do not repeatedly measure all rows');
  }
});

test('scrolling preserves every row blur while skipping writes outside the changing focus bands', () => {
  const h = harness({ centers: Array.from({ length: 100 }, (_, index) => 100 * (index - 30)) });
  const checkFocus = () => {
    const distances = h.root.children.map(row => Math.abs(row.getBoundingClientRect().top + 40 - 400));
    const nearest = distances.indexOf(Math.min(...distances));
    h.root.children.forEach((row, index) => {
      assert.equal(Number(row.style['--manual-blur-index']), Math.min(Math.abs(nearest - index), 3));
    });
  };
  h.emit('wheel', { deltaY: 1 }); h.flush();
  assert.equal(h.blurWrites(), 100);
  checkFocus();
  h.emit('wheel', { deltaY: 1 }); h.flush();
  assert.equal(h.blurWrites(), 100);
  for (const delta of [100, -1000, 1985, 5130, -5000]) {
    const before = h.blurWrites();
    h.emit('wheel', { deltaY: delta }); h.flush();
    checkFocus();
    assert.ok(h.blurWrites() - before <= 10);
  }
});

test('Home/End bound the first and last row at the same configured anchor', () => {
  const h = harness({ anchorRatio: 0.4 });
  h.emit('keydown', { key: 'End' });
  assert.equal(h.root.children.at(-1).getBoundingClientRect().top + 40 - 100, 240);
  h.emit('keydown', { key: 'Home' });
  assert.equal(h.root.children[0].getBoundingClientRect().top + 40 - 100, 240);
  h.emit('wheel', { deltaY: -99999 });
  assert.equal(h.container.scrollTop, 0);
});

test('selecting a lyric captures its displayed position and requested time before auto-follow resumes', () => {
  const h = harness();
  h.emit('wheel', { deltaY: 125 }); h.flush();
  const row = h.root.children[3], top = row.getBoundingClientRect().top;
  h.emit('click', { target: { closest: () => row } }, true);
  const handoff = h.returns.get(h.container);
  assert.equal(handoff.positions.get(row), top);
  assert.equal(handoff.seekTime, 15000);
  assert.equal(handoff.pending, true);
  assert.deepEqual(h.changes, [true, false]);
  assert.equal(h.container.scrollTop, 0);
  assert.equal(h.root.style.translate, undefined);
  assert.equal(h.container.spacer, null);
  // A synchronous seek event following the click must keep that same origin.
  h.playerListeners.get('onseek')();
  assert.equal(h.returns.get(h.container), handoff);
});

test('idle return, Escape, resize, song change, and unmount release native scroll state and listeners', () => {
  for (const stop of ['idle', 'escape', 'resize', 'songchange', 'destroy']) {
    const h = harness();
    h.emit('wheel', { deltaY: 100 }); h.flush();
    if (stop === 'idle') h.idle();
    if (stop === 'escape') h.emit('keydown', { key: 'Escape' });
    if (stop === 'resize') h.windowListeners.get('resize')();
    if (stop === 'songchange') h.playerListeners.get('songchange')();
    if (stop === 'destroy') h.scroller.destroy();
    assert.equal(h.container.scrollTop, 0);
    assert.equal(h.container.spacer, null);
    assert.equal(h.timers.size, 0);
    assert.ok(h.root.children.every(row => row.style['--manual-blur-index'] === undefined));
    if (stop === 'destroy') {
      assert.equal(h.listeners.size, 0);
      assert.equal(h.windowListeners.size, 0);
      assert.equal(h.playerListeners.size, 0);
      assert.equal(h.returns.has(h.container), false);
    }
  }
});

test('song changes and unmount discard pending return coordinates after a lyric click', () => {
  for (const stop of ['songchange', 'destroy']) {
    const h = harness();
    h.emit('wheel', { deltaY: 100 });
    h.emit('click', { target: { closest: () => h.root.children[3] } }, true);
    assert.equal(h.returns.has(h.container), true);
    if (stop === 'songchange') h.playerListeners.get('songchange')();
    else h.scroller.destroy();
    assert.equal(h.returns.has(h.container), false);
  }
});

test('pinch, horizontal gestures and interactive keys do not start lyric browsing', () => {
  const h = harness();
  h.emit('wheel', { deltaY: 100, ctrlKey: true });
  h.emit('wheel', { deltaY: 10, deltaX: 100 });
  h.emit('keydown', { key: ' ', target: { closest: () => ({}) } });
  assert.deepEqual(h.changes, []);
});

test('focused lyrics allow navigation keys while activation and modified shortcuts keep their own actions', () => {
  const h = harness();
  const row = h.root.children[3];
  const target = { closest: () => row };
  const before = row.getBoundingClientRect().top;
  assert.equal(h.emit('keydown', { key: 'ArrowDown', target }).defaultPrevented, true);
  assert.equal(row.getBoundingClientRect().top, before - 80);
  const scrolled = h.container.scrollTop;
  for (const key of ['Enter', ' ', 'Spacebar']) {
    assert.equal(h.emit('keydown', { key, target }).defaultPrevented, undefined);
  }
  for (const modifier of ['metaKey', 'ctrlKey', 'altKey']) {
    assert.equal(h.emit('keydown', { key: 'Home', [modifier]: true, target }).defaultPrevented, undefined);
  }
  const input = {};
  h.emit('keydown', { key: 'ArrowDown', target: { closest: selector => selector === '[data-lyrics-seek-time]' ? row : input } });
  assert.equal(h.container.scrollTop, scrolled, 'nested controls and browser shortcuts must not move lyrics');
  const escape = h.emit('keydown', { key: 'Escape', target });
  assert.equal(escape.defaultPrevented, true);
  assert.equal(escape.propagationStopped, true, 'returning to playback must not also exit fullscreen');
  assert.deepEqual(h.changes, [true, false]);
  assert.equal(h.emit('keydown', { key: 'Escape', target }).propagationStopped, undefined,
    'a separate Escape after returning may reach the fullscreen handler');
});

test('touch movement retains the same surface and returns only after release', () => {
  const h = harness();
  h.emit('touchstart', { touches: [{ clientY: 300 }] });
  const before = h.root.children[3].getBoundingClientRect().top;
  h.emit('touchmove', { touches: [{ clientY: 240 }] }); h.flush();
  assert.equal(h.root.children[3].getBoundingClientRect().top, before - 60);
  assert.equal(h.timers.size, 0);
  h.emit('touchend');
  assert.equal(h.timers.size, 1);
  h.idle();
  assert.deepEqual(h.changes, [true, false]);
});
