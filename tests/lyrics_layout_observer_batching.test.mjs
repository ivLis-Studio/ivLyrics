import assert from 'node:assert/strict';
import test from 'node:test';

import { createLyricsLayoutObserver } from '../src/lyrics/lyricsLayoutObserver.mjs';

function harness({ mutations = true } = {}) {
  const frames = new Map(), observers = [], reads = [];
  let requested = 0, cancelled = 0;
  class Observer {
    targets = new Set();
    observations = 0;
    removals = 0;
    constructor(callback) { this.callback = callback; observers.push(this); }
    options = new Map();
    observe(target, options) { this.targets.add(target); this.options.set(target, options); this.observations++; }
    unobserve(target) { this.targets.delete(target); this.removals++; }
    disconnect() { this.targets.clear(); }
  }
  const manager = createLyricsLayoutObserver({
    ResizeObserver: Observer, MutationObserver: mutations ? Observer : undefined,
    scheduleFrame(callback) { const id = ++requested; frames.set(id, callback); return id; },
    cancelFrame(id) { cancelled++; frames.delete(id); },
  });
  return { manager, observers, reads, frames,
    counters: () => ({ requested, cancelled }),
    flush() { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback()); },
  };
}

test('layout notifications read the latest geometry once per frame and dispose queued callbacks', () => {
  const h = harness(), container = {}, row = { height: 40 };
  h.manager.update(container, row, () => h.reads.push(row.height));
  for (let i = 0; i < 100; i++) h.observers[i % 2].callback();
  assert.deepEqual(h.counters(), { requested: 1, cancelled: 0 });
  assert.equal(h.reads.length, 0);
  row.height = 95;
  h.flush();
  assert.deepEqual(h.reads, [95]);
  h.observers[0].callback();
  const queued = [...h.frames.values()][0];
  h.manager.disconnect();
  assert.equal(h.frames.size, 0);
  assert.ok(h.observers.every(observer => observer.targets.size === 0));
  queued();
  h.manager.update({}, {}, () => assert.fail("a disposed observer cannot reconnect"));
  assert.ok(h.observers.every(observer => observer.targets.size === 0));
  h.observers[0].callback();
  assert.deepEqual(h.reads, [95], 'callbacks delivered after unmount cannot measure');
  assert.equal(h.frames.size, 0);
});

test('settings and vocal-anchor changes retain observers and line transitions retarget only the row', () => {
  const h = harness(), container = {}, row = {}, nextRow = {};
  for (let revision = 0; revision < 100; revision++) {
    h.manager.update(container, row, () => h.reads.push(revision));
  }
  assert.equal(h.observers.length, 2);
  assert.equal(h.observers[0].observations, 2, 'container and row are each observed only once');
  assert.equal(h.observers[1].observations, 2, 'one content subtree plus the vocal anchor');
  h.observers[1].callback();
  h.flush();
  assert.deepEqual(h.reads, [99], 'notifications call the latest compact/expanded callback');
  h.manager.update(container, nextRow, () => h.reads.push('next row'));
  assert.deepEqual([...h.observers[0].targets], [container, nextRow]);
  assert.equal(h.observers[0].observations, 3);
  assert.equal(h.observers[0].removals, 1);
  assert.deepEqual([...h.observers[1].targets], [container, nextRow]);
  h.observers[0].callback();
  h.flush();
  assert.deepEqual(h.reads, [99, 'next row'], 'initial resize delivery for a new row is honored');
});

test('a synchronous layout measurement consumes queued work but preserves later resize notifications', () => {
  const h = harness(), container = {}, row = { height: 40 };
  h.manager.update(container, row, () => h.reads.push(row.height));
  h.observers[0].callback();
  h.manager.cancelPending();
  h.reads.push(row.height);
  h.flush();
  assert.deepEqual(h.reads, [40]);
  row.height = 70;
  h.observers[0].callback();
  h.flush();
  assert.deepEqual(h.reads, [40, 70]);
  assert.deepEqual(h.counters(), { requested: 2, cancelled: 1 });
});

test('replaced roots and missing MutationObserver retain resize support', () => {
  const h = harness({ mutations: false }), first = {}, second = {}, row = {};
  h.manager.update(first, row, () => h.reads.push('old'));
  h.observers[0].callback();
  h.manager.update(second, row, () => h.reads.push('new'));
  assert.deepEqual([...h.observers[0].targets], [row, second]);
  h.flush();
  assert.deepEqual(h.reads, ['new']);
  h.manager.disconnect();
  assert.equal(h.observers[0].targets.size, 0);
});

test('expanded content changes can recenter an offscreen anchor without a target resize', () => {
  const h = harness(), container = {}, row = { top: 40 };
  const sync = () => h.reads.push(row.top);
  h.manager.update(container, row, sync);
  h.manager.scheduleSync();
  h.flush();
  row.top = 900; // Streaming text enlarged previous rows, not the observed row.
  h.manager.update(container, row, sync);
  h.manager.scheduleSync();
  h.flush();
  assert.deepEqual(h.reads, [40, 900]);
  assert.equal(h.observers[0].observations, 2, 'content corrections need no observer reattachment');
});

test('predecessor word-stack mutations recenter once per frame without observing each row or glyph styles', () => {
  const h = harness(), container = {}, active = { top: 200 }, predecessor = {};
  h.manager.update(container, active, contentChanged => h.reads.push({ top: active.top, contentChanged }));
  const [resize, mutation] = h.observers;
  assert.equal(h.observers.length, 2);
  assert.deepEqual([...resize.targets], [container, active]);
  assert.equal(resize.targets.has(predecessor), false);
  assert.deepEqual({ ...mutation.options.get(container) }, { childList: true, characterData: true, subtree: true });
  assert.equal(mutation.options.get(container).attributes, undefined, 'per-frame glyph styles/classes are excluded');
  for (let i = 0; i < 1000; i++) {
    mutation.callback([{ type: i % 2 ? 'childList' : 'characterData', target: predecessor }]);
    resize.callback();
  }
  active.top += 40;
  assert.equal(h.frames.size, 1);
  h.flush();
  assert.deepEqual(h.reads, [{ top: 240, contentChanged: true }]);
  mutation.callback([{ type: 'attributes', attributeName: 'data-karaoke-vocal-anchor-position' }]);
  h.flush();
  assert.deepEqual(h.reads.at(-1), { top: 240, contentChanged: false }, 'vocal travel keeps its ordinary animation path');
});

test('consumed content notifications cannot mark later vocal movement as a supplement correction', () => {
  const h = harness(), container = {}, row = {};
  h.manager.update(container, row, changed => h.reads.push(changed));
  h.observers[1].callback([{ type: 'childList' }]);
  h.manager.cancelPending();
  h.observers[1].callback([{ type: 'attributes' }]);
  h.flush();
  assert.deepEqual(h.reads, [false]);
  h.observers[1].callback([{ type: 'characterData' }]);
  h.manager.disconnect();
  h.flush();
  assert.equal(h.frames.size, 0);
  assert.deepEqual(h.reads, [false]);
});
