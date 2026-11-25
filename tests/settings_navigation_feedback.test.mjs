import { useSettingsScrollNavigation } from '../src/features/settings/useSettingsScrollNavigation.mjs';
import { findSettingsTarget, scheduleSettingsDestination } from '../src/features/settings/settingsNavigationTarget.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';

function harness(reduced = false) {
  const timers = new Map(), listeners = new Map(), scrolls = [];
  let nextId = 0;
  const rows = ['first', 'second'].map((key, index) => {
    const classes = new Set();
    return { classes, getAttribute: () => key, getBoundingClientRect: () => ({ top: 200 + index * 100 }),
      classList: { add: name => classes.add(name), remove: name => classes.delete(name) } };
  });
  const panel = { querySelectorAll: () => rows, querySelector: () => null };
  const container = { scrollTop: 50, querySelector: () => panel, getBoundingClientRect: () => ({ top: 100 }),
    scrollTo: options => scrolls.push(options), addEventListener: (type, cb) => listeners.set(type, cb),
    removeEventListener: type => listeners.delete(type) };
  const react = { useRef: current => ({ current }), useCallback: callback => callback };
  const navigation = useSettingsScrollNavigation(react, {
    scheduleTimeout: (cb, delay) => { timers.set(++nextId, { cb, delay }); return nextId; },
    cancelTimeout: id => timers.delete(id),
    prefersReducedMotion: () => reduced,
  });
  navigation.settingsContentRef.current = container;
  return { ...navigation, rows, timers, listeners, scrolls };
}

test('rapid settings navigation removes the old highlight and cleans the latest one on expiry', () => {
  const h = harness();
  h.scrollToSetting('first');
  assert.equal(h.rows[0].classes.has('setting-highlight-flash'), true);
  h.scrollToSetting('second');
  assert.equal(h.rows[0].classes.size, 0);
  assert.equal(h.rows[1].classes.has('setting-highlight-flash'), true);
  assert.equal(h.listeners.size, 1, 'only the latest smooth scroll owns a scrollend listener');
  [...h.timers.values()].find(timer => timer.cb === h.clearSettingHighlight).cb();
  assert.equal(h.rows[1].classes.size, 0);
  h.scrollToSetting('first');
  h.scrollToSetting('second', { highlight: false });
  assert.ok(h.rows.every(row => row.classes.size === 0));
});

test('reduced motion settings navigation jumps directly without a smooth-scroll listener', () => {
  const h = harness(true);
  assert.equal(h.scrollToSetting('second'), true);
  assert.equal(h.scrolls[0].behavior, 'auto');
  assert.equal(h.scrolls[0].top, 238);
  assert.equal(h.listeners.size, 0);
  assert.equal(h.scrollToSetting('missing'), false);
  h.clearSettingHighlight();
  assert.ok(h.rows.every(row => row.classes.size === 0));
});

test('leaving a settings view releases its programmatic scroll feedback', () => {
  const h = harness();
  h.scrollToSetting('first');
  assert.equal(h.isProgrammaticScrollRef.current, true);
  h.disposeScrollNavigation();
  assert.equal(h.isProgrammaticScrollRef.current, false);
  assert.equal(h.listeners.size, 0);
  assert.equal(h.timers.size, 0);
  assert.equal(h.rows[0].classes.size, 0);
});

function navigationFrames() {
  let nextFrame = 0;
  let current = null;
  const frames = new Map(), trace = [];
  const rows = [];
  const container = {
    querySelector: () => ({ querySelectorAll: () => rows }),
    scrollTo: options => trace.push(['restore', options]),
  };
  function start(destination) {
    current = destination;
    return scheduleSettingsDestination({
      destination, isCurrent: () => current === destination,
      readContainer: () => container,
      selectFullscreenView: view => trace.push(['view', view]),
      revealSetting: key => trace.push(['reveal', key]),
      scrollToTarget(target, options) {
        if (!target || target.closest('[hidden]')) return false;
        trace.push(['target', target.getAttribute('data-setting-key'), options]);
        return true;
      },
      requestFrame: callback => { frames.set(++nextFrame, callback); return nextFrame; },
      cancelFrame: frame => frames.delete(frame),
      finish: () => { trace.push(['finish']); current = null; },
    });
  }
  return {
    start, rows, trace, frames, container,
    step() {
      const callbacks = [...frames.values()];
      frames.clear();
      callbacks.forEach(callback => callback());
    },
  };
}

function row(key, enclosingView = null) {
  return {
    hidden: Boolean(enclosingView),
    getAttribute: () => key,
    closest(selector) {
      if (!this.hidden) return null;
      if (selector === '[data-view][hidden]' && !enclosingView) return null;
      return { getAttribute: () => enclosingView };
    },
  };
}

test('a hidden fullscreen target reveals its layer after the enclosing view commits', () => {
  const h = navigationFrames();
  const target = row('translation-style', 'normal');
  h.rows.push(target);
  h.start({ settingKey: 'translation-style' });
  h.step();
  h.step();
  assert.deepEqual(h.trace, [['view', 'normal']]);
  target.hidden = false;
  h.step();
  assert.deepEqual(h.trace.at(-1), ['reveal', 'translation-style']);
  h.step();
  assert.deepEqual(h.trace.slice(-2), [['target', 'translation-style', { behavior: 'auto' }], ['finish']]);
  assert.equal(h.frames.size, 0);
});

test('layer anchors already present still reveal before scrolling and prefer a visible duplicate', () => {
  const h = navigationFrames();
  const visible = row('original-style');
  h.rows.push(row('original-style', 'normal'), visible);
  assert.equal(findSettingsTarget(h.container, 'original-style'), visible);
  h.start({ settingKey: 'original-style' });
  h.step();
  assert.deepEqual(h.trace, [['reveal', 'original-style']]);
  h.step();
  assert.deepEqual(h.trace.at(-2), ['target', 'original-style', { behavior: 'smooth' }]);
});

test('a fullscreen target that stays hidden stops queuing frames', () => {
  const h = navigationFrames();
  h.rows.push(row('unreachable', 'unsupported-view'));
  h.start({ settingKey: 'unreachable' });
  for (let index = 0; index < 20; index++) h.step();
  assert.deepEqual(h.trace, [['view', 'unsupported-view'], ['finish']]);
  assert.equal(h.frames.size, 0);
});

test('a replacement menu owns scroll restoration even before the older frame is cancelled', () => {
  const h = navigationFrames();
  h.start({ top: 380 });
  h.start({ top: 90 });
  h.step();
  assert.deepEqual(h.trace, [['restore', { top: 90, behavior: 'auto' }], ['finish']]);

  const cancel = h.start({ top: 150 });
  cancel();
  h.step();
  assert.equal(h.trace.length, 2);
  assert.equal(h.frames.size, 0);
});
