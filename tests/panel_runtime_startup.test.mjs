import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const moduleSource = readFileSync(new URL('../NowPlayingPanelLyrics.js', import.meta.url), 'utf8');
const containerClass = 'ivlyrics-panel-lyrics-container';
const sectionClass = 'ivlyrics-panel-lyrics-section';

// Execute the complete extension bootstrap. React's renderer is a boundary:
// it records the requested mount and supplies a rendered section, while the
// real startup, observers, insertion, timers and cleanup run unchanged.
class Element {
  constructor(tagName = 'div', { className = '', testId = null } = {}) {
    this.tagName = tagName;
    this.nodeType = 1;
    this.className = className;
    this.testId = testId;
    this.children = [];
    this.parentElement = null;
    this.style = { setProperty() {} };
    this.classList = {
      contains: value => this.className.split(/\s+/).includes(value),
      add: (...values) => { this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), ...values])].join(' '); },
      remove: (...values) => { this.className = this.className.split(/\s+/).filter(value => !values.includes(value)).join(' '); },
      toggle: (value, force) => {
        const enabled = force ?? !this.classList.contains(value);
        if (enabled) this.classList.add(value); else this.classList.remove(value);
        return enabled;
      },
    };
  }
  append(...nodes) { for (const node of nodes) this.appendChild(node); }
  appendChild(node) { return this.insertBefore(node, null); }
  insertBefore(node, reference) {
    node.remove();
    const index = reference ? this.children.indexOf(reference) : this.children.length;
    assert.ok(index >= 0, 'insertion reference belongs to the parent');
    this.children.splice(index, 0, node);
    node.parentElement = this;
    return node;
  }
  remove() {
    if (!this.parentElement) return;
    const siblings = this.parentElement.children;
    siblings.splice(siblings.indexOf(this), 1);
    this.parentElement = null;
  }
  contains(node) {
    for (let current = node; current; current = current.parentElement) if (current === this) return true;
    return false;
  }
  matches(selector) {
    return selector.split(',').some(part => {
      const simple = part.trim();
      if (simple.startsWith('.')) return this.classList.contains(simple.slice(1));
      if (simple.startsWith('#')) return this.id === simple.slice(1);
      const testId = simple.match(/^\[data-testid="([^"]+)"\]$/);
      if (testId) return this.testId === testId[1];
      return this.tagName === simple;
    });
  }
  querySelectorAll(selector) {
    return this.children.flatMap(child => [
      ...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector),
    ]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  closest(selector) {
    for (let current = this; current; current = current.parentElement) if (current.matches(selector)) return current;
    return null;
  }
  getAttribute(name) { return name === 'data-testid' ? this.testId : name === 'class' ? this.className : null; }
  get isConnected() { return this.tagName === 'html' || Boolean(this.parentElement?.isConnected); }
  get nextSibling() { return this.parentElement?.children[this.parentElement.children.indexOf(this) + 1] || null; }
  get nextElementSibling() { return this.nextSibling; }
  get previousElementSibling() { return this.parentElement?.children[this.parentElement.children.indexOf(this) - 1] || null; }
}

function harness({ panelInitially = true, headerInitially = true, failPlayerSubscriptions = 0 } = {}) {
  let time = 0, nextTimer = 1;
  const timers = new Map(), observers = [], renders = [], errors = [];
  const windowListeners = new Map(), playerListeners = new Map(), historyListeners = new Set();
  const add = (registry, name, listener) => {
    if (!registry.has(name)) registry.set(name, new Set());
    registry.get(name).add(listener);
  };
  const remove = (registry, name, listener) => registry.get(name)?.delete(listener);
  const html = new Element('html'), head = new Element('head'), body = new Element('body');
  html.append(head, body);
  const document = {
    body, head, documentElement: html,
    createElement: name => new Element(name),
    querySelector: selector => html.querySelector(selector),
    querySelectorAll: selector => html.querySelectorAll(selector),
    getElementById: id => html.querySelector(`#${id}`),
  };
  const panel = new Element('div', { testId: 'NPV_Panel_OpenDiv' });
  const grid = new Element('div', { className: 'unmapped-grid' });
  grid.append(new Element('div', { testId: 'track-visual-enhancement' }));
  panel.append(grid);
  const info = new Element('div', { className: 'unmapped-track-info' });
  info.append(new Element('div', { testId: 'minimized-track-visual-enhancement' }));
  const addHeader = () => { if (!info.parentElement) grid.append(info); };
  const addPanel = () => { if (!panel.parentElement) body.append(panel); };
  if (headerInitially) addHeader();
  if (panelInitially) addPanel();
  const player = {
    data: { item: { uri: 'spotify:track:fixture' } },
    addEventListener(name, listener) {
      if (failPlayerSubscriptions > 0) { failPlayerSubscriptions--; throw new Error('Player subscription is not ready'); }
      add(playerListeners, name, listener);
    },
    removeEventListener: (name, listener) => remove(playerListeners, name, listener),
  };
  const render = (element, container) => {
    renders.push({ time, element, container });
    if (!container.querySelector(`.${sectionClass}`)) container.append(new Element('section', { className: sectionClass }));
  };
  const ReactDOM = {
    createRoot: container => ({ render: element => render(element, container), unmount: () => { container.children = []; } }),
    render,
    unmountComponentAtNode: container => { container.children = []; },
  };
  const Spicetify = {
    React: { Component: class {}, memo: component => component, createElement: (type, props, ...children) => ({ type, props, children }) },
    ReactDOM, Player: player, LocalStorage: { get: () => null, set() {} },
    Platform: { History: { location: { pathname: '/' }, listen(listener) { historyListeners.add(listener); return () => historyListeners.delete(listener); } } },
  };
  const window = {
    Spicetify, location: { pathname: '/' },
    addEventListener: (name, listener) => add(windowListeners, name, listener),
    removeEventListener: (name, listener) => remove(windowListeners, name, listener),
  };
  const context = vm.createContext({
    window, document, Spicetify, localStorage: { getItem: () => null, setItem() {} },
    console: { log() {}, warn: (...args) => errors.push(args), error: (...args) => errors.push(args) },
    CSS: { supports: () => false },
    Date: class extends Date { static now() { return time; } },
    performance: { now: () => time },
    setTimeout(callback, delay = 0) {
      const id = nextTimer++;
      timers.set(id, { callback, due: time + Math.max(0, Number(delay) || 0) });
      return id;
    },
    clearTimeout: id => timers.delete(id),
    MutationObserver: class {
      constructor(callback) { this.callback = callback; this.active = false; observers.push(this); }
      observe(target, options) { assert.ok(target); this.active = true; this.options = options; }
      disconnect() { this.active = false; }
    },
  });
  const advance = ms => {
    const until = time + ms;
    let iterations = 0;
    for (;;) {
      const next = [...timers.entries()].filter(([, timer]) => timer.due <= until).sort((a, b) => a[1].due - b[1].due || a[0] - b[0])[0];
      if (!next) break;
      assert.ok(++iterations < 1000, 'timer execution terminates');
      time = next[1].due;
      timers.delete(next[0]);
      next[1].callback();
    }
    time = until;
  };
  const mutate = () => {
    const mutations = [{ type: 'childList', addedNodes: [new Element('span')], removedNodes: [] }];
    for (const observer of [...observers]) if (observer.active) observer.callback(mutations);
  };
  return {
    window, document, Spicetify, player, ReactDOM, body, panel, grid, info, timers, errors, renders,
    addPanel, addHeader, advance, mutate,
    load: () => vm.runInContext(moduleSource, context, { filename: 'NowPlayingPanelLyrics.js' }),
    state: () => window.__ivLyricsNowPlayingPanelModule,
    container: () => document.querySelector(`.${containerClass}`),
    subscriptions: () => ({
      settings: windowListeners.get('ivLyrics')?.size || 0,
      songchange: playerListeners.get('songchange')?.size || 0,
      history: historyListeners.size,
      observers: observers.filter(observer => observer.active).length,
    }),
  };
}

for (const dependency of ['Player', 'Player.addEventListener', 'document.body', 'ReactDOM renderer']) {
  test(`panel bootstrap waits for ${dependency} and mounts when it becomes ready`, () => {
    const h = harness();
    let restore;
    if (dependency === 'Player') {
      delete h.Spicetify.Player;
      restore = () => { h.Spicetify.Player = h.player; };
    } else if (dependency === 'Player.addEventListener') {
      const subscribe = h.player.addEventListener;
      delete h.player.addEventListener;
      restore = () => { h.player.addEventListener = subscribe; };
    } else if (dependency === 'document.body') {
      h.document.body = null;
      restore = () => { h.document.body = h.body; };
    } else {
      h.Spicetify.ReactDOM = { createPortal() {} };
      restore = () => { h.Spicetify.ReactDOM = h.ReactDOM; };
    }
    assert.doesNotThrow(h.load);
    assert.doesNotThrow(h.load);
    assert.equal(h.state().initialized, false);
    assert.equal(h.state().runtimeStarted, false);
    assert.equal(h.timers.size, 1, 'repeated script evaluation shares one readiness retry');
    assert.deepEqual(h.subscriptions(), { settings: 0, songchange: 0, history: 0, observers: 0 });
    restore();
    h.advance(1000);
    assert.equal(h.state().runtimeStarted, true);
    assert.ok(h.window.NowPlayingPanelLyrics);
    assert.ok(h.container()?.querySelector(`.${sectionClass}`));
    assert.deepEqual(h.subscriptions(), { settings: 1, songchange: 1, history: 1, observers: 2 });
  });
}

test('a setup failure releases partial subscriptions and retries successfully without a permanent initialization latch', () => {
  const h = harness({ failPlayerSubscriptions: 1 });
  assert.doesNotThrow(h.load);
  assert.equal(h.state().runtimeStarted, false);
  const failed = h.subscriptions();
  assert.equal(failed.songchange, 0);
  assert.equal(failed.history, 0);
  assert.equal(failed.observers, 0);
  assert.equal(h.body.classList.contains('ivlyrics-panel-lyrics-active'), false);
  h.advance(1500);
  assert.equal(h.state().runtimeStarted, true);
  assert.ok(h.container());
  assert.deepEqual(h.subscriptions(), { settings: 1, songchange: 1, history: 1, observers: 2 });
});

for (const action of ['disable', 'destroy']) {
  test(`${action} cancels a pending setup retry without reviving listeners or the panel`, () => {
    const h = harness({ failPlayerSubscriptions: 1 });
    h.load();
    assert.equal(h.state().runtimeStarted, false);
    if (action === 'disable') h.window.NowPlayingPanelLyrics.setEnabled(false);
    else h.window.NowPlayingPanelLyrics.destroy();
    h.advance(2000);
    assert.equal(h.container(), null);
    assert.equal(h.renders.length, 0);
    assert.deepEqual(h.subscriptions(), { settings: action === 'disable' ? 1 : 0, songchange: 0, history: 0, observers: 0 });
    assert.equal(h.body.classList.contains('ivlyrics-panel-lyrics-active'), false);
  });
}

test('repeated module loads and enable calls keep one runtime and disabling cleans it up', () => {
  const h = harness();
  h.load();
  const api = h.window.NowPlayingPanelLyrics;
  h.load();
  api.setEnabled(true);
  api.setEnabled(true);
  assert.deepEqual(h.subscriptions(), { settings: 1, songchange: 1, history: 1, observers: 2 });
  assert.equal(h.document.querySelectorAll(`.${containerClass}`).length, 1);
  api.setEnabled(false);
  assert.deepEqual(h.subscriptions(), { settings: 1, songchange: 0, history: 0, observers: 0 });
  assert.equal(h.container(), null);
  h.advance(1500);
  assert.equal(h.container(), null, 'old delayed insertions do not revive a disabled panel');
  api.setEnabled(true);
  assert.deepEqual(h.subscriptions(), { settings: 1, songchange: 1, history: 1, observers: 2 });
  assert.ok(h.container());
});

test('frequent native panel mutations cannot postpone the first lyrics mount indefinitely', () => {
  const h = harness({ panelInitially: false });
  h.load();
  assert.equal(h.container(), null);
  h.advance(100);
  h.addPanel();
  h.mutate();
  for (let index = 0; index < 5; index++) {
    h.advance(25);
    h.mutate();
  }
  assert.ok(h.container()?.querySelector(`.${sectionClass}`), 'mount completes while Spotify continues changing the DOM every 25 ms');
  assert.ok(h.renders[0].time <= 225, 'the first mutation establishes a bounded mount time');
  assert.equal(h.container().previousElementSibling, h.info);
});

test('the startup 1000 ms follow-up does not delay an earlier missing-header insertion retry', () => {
  const h = harness({ headerInitially: false });
  h.load();
  assert.equal(h.container(), null);
  h.advance(50);
  h.addHeader();
  h.advance(100);
  assert.ok(h.container()?.querySelector(`.${sectionClass}`), 'the existing 150 ms header retry is retained');
  assert.ok(h.renders[0].time <= 150);
  assert.equal(h.container().previousElementSibling, h.info);
});
