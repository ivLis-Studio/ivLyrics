import { observeToolbarProgressClearance as observe } from "#ivlyrics/app/toolbar/toolbarProgressClearance.mjs";
import assert from "node:assert/strict";
import { createToolbarInteraction } from "#ivlyrics/app/toolbar/createToolbarInteraction.mjs";
import test from "node:test";
const property = "--iv-fullscreen-toolbar-width";

function createHarness({ width = 47.2, resizeObserver = true } = {}) {
  let nextFrame = 0;
  let reads = 0;
  const frames = new Map();
  const cancelled = [];
  const observers = [];
  const listeners = new Map();
  const properties = new Map([["--unrelated", "keep"]]);
  const writes = [];
  const removals = [];
  const lookups = [];
  const view = {
    requestAnimationFrame(callback) {
      const id = nextFrame++;
      frames.set(id, callback);
      return id;
    },
    cancelAnimationFrame(id) {
      cancelled.push(id);
      frames.delete(id);
    },
    addEventListener(name, callback) {
      assert.equal(name, "resize", "no polling or visibility listeners");
      assert.equal(listeners.has(name), false);
      listeners.set(name, callback);
    },
    removeEventListener(name, callback) {
      if (listeners.get(name) === callback) listeners.delete(name);
    },
  };
  if (resizeObserver) {
    view.ResizeObserver = class {
      targets = new Map();
      disconnects = 0;
      constructor(callback) {
        this.callback = callback;
        observers.push(this);
      }
      observe(target, options) { this.targets.set(target, options); }
      disconnect() {
        this.disconnects++;
        this.targets.clear();
      }
    };
  }
  const container = {
    isConnected: true,
    contains: (node) => node === column && column.container === container,
    style: {
      setProperty(name, value) {
        writes.push([name, value]);
        properties.set(name, value);
      },
      removeProperty(name) {
        removals.push(name);
        properties.delete(name);
      },
    },
  };
  const column = {
    isConnected: true,
    container,
    width,
    ownerDocument: { defaultView: view },
    closest(selector) {
      lookups.push(selector);
      return this.container;
    },
    getBoundingClientRect() {
      reads++;
      return { width: this.width };
    },
  };
  return {
    column, container, view, observe,
    frames, cancelled, observers, listeners, properties, writes, removals, lookups,
    reads: () => reads,
    start: () => observe(column),
    notify(width, { legacy = false } = {}) {
      observers[0].callback([{
        target: column,
        borderBoxSize: legacy ? { inlineSize: width } : [{ inlineSize: width }],
      }]);
    },
    resize() { listeners.get("resize")?.({ type: "resize" }); },
    flush() {
      const callbacks = [...frames.values()];
      frames.clear();
      callbacks.forEach((callback) => callback());
      assert.equal(frames.size, 0, "measurement must not schedule more frames");
    },
  };
}

test("measures before paint and observes only the toolbar column border box", () => {
  const h = createHarness();
  const stop = h.start();
  assert.equal(h.properties.get(property), "48px");
  assert.equal(h.reads(), 1);
  assert.equal(h.frames.size, 0, "initial measurement must be synchronous");
  assert.deepEqual(h.lookups, [".lyrics-lyricsContainer-LyricsContainer"]);
  assert.equal(h.observers.length, 1);
  assert.deepEqual([...h.observers[0].targets.keys()], [h.column]);
  assert.equal(h.observers[0].targets.get(h.column).box, "border-box");
  assert.equal(h.listeners.size, 0, "resize listener is only needed as a fallback");
  stop();
  assert.equal(h.properties.get("--unrelated"), "keep");
});

test("expanded, translated and collapsed widths follow resize entries without repeated reads", () => {
  const h = createHarness();
  const stop = h.start();
  for (const [width, expected] of [[184.2, "185px"], [238.75, "239px"], [47.2, "48px"]]) {
    h.notify(width, { legacy: width === 238.75 });
    assert.equal(h.frames.size, 1);
    h.flush();
    assert.equal(h.properties.get(property), expected);
  }
  assert.equal(h.reads(), 1, "border-box entries already contain the measured width");
  assert.equal(h.lookups.length, 1, "the closest root is resolved once");
  stop();
});

test("resize bursts coalesce to their latest width and unchanged rounded widths do not write", () => {
  const h = createHarness();
  const stop = h.start();
  for (let i = 0; i < 100; i++) h.notify(47.2 + (i % 2) * 0.2);
  assert.equal(h.frames.size, 1);
  h.flush();
  assert.equal(h.writes.length, 1);
  for (let i = 0; i < 100; i++) h.notify(100 + i / 2);
  assert.equal(h.frames.size, 1);
  h.flush();
  assert.deepEqual(h.writes, [[property, "48px"], [property, "150px"]]);
  assert.equal(h.reads(), 1);
  stop();
});

test("missing border-box data reads the actual box once and unrelated entries do nothing", () => {
  const h = createHarness();
  const stop = h.start();
  h.observers[0].callback([{ target: h.container, borderBoxSize: [{ inlineSize: 1000 }] }]);
  assert.equal(h.frames.size, 0);
  h.column.width = 82.25;
  for (let i = 0; i < 20; i++) {
    h.observers[0].callback([{ target: h.column, contentRect: { width: 50 } }]);
  }
  h.flush();
  assert.equal(h.properties.get(property), "83px", "content width excludes column padding and borders");
  assert.equal(h.reads(), 2);
  stop();
});

test("invalid or hidden geometry cannot publish a width and valid geometry can recover", () => {
  const invalid = [0, -12, NaN, Infinity, -Infinity, undefined, null, "80"];
  for (const width of invalid) {
    const h = createHarness();
    h.column.width = width;
    const stop = h.start();
    assert.equal(h.properties.has(property), false);
    h.notify(width);
    h.flush();
    assert.equal(h.properties.has(property), false);
    h.notify(108.3);
    h.flush();
    assert.equal(h.properties.get(property), "109px");
    h.notify(width);
    h.flush();
    assert.equal(h.properties.get(property), "109px", "invalid geometry must retain the last valid width");
    assert.equal(h.writes.length, 1);
    stop();
  }
});

test("detached columns, detached roots and reparented columns clean up without another read", () => {
  for (const detach of [
    (h) => { h.column.isConnected = false; },
    (h) => { h.container.isConnected = false; },
    (h) => { h.column.container = {}; },
  ]) {
    const h = createHarness();
    const stop = h.start();
    h.observers[0].callback([{ target: h.column }]);
    const staleFrame = [...h.frames.values()][0];
    detach(h);
    h.flush();
    assert.equal(h.reads(), 1);
    assert.equal(h.properties.has(property), false);
    assert.equal(h.observers[0].targets.size, 0);
    assert.equal(h.observers[0].disconnects, 1);
    staleFrame();
    h.notify(300);
    assert.equal(h.frames.size, 0);
    assert.equal(h.writes.length, 1);
    stop();
    assert.equal(h.observers[0].disconnects, 1);
  }
});

test("unmount cleanup cancels frame zero, disconnects and rejects late callbacks", () => {
  const h = createHarness();
  const stop = h.start();
  h.notify(220);
  const staleFrame = [...h.frames.values()][0];
  assert.equal(h.frames.has(0), true);
  stop();
  stop();
  assert.deepEqual(h.cancelled, [0]);
  assert.equal(h.observers[0].disconnects, 1);
  assert.deepEqual(h.removals, [property]);
  assert.equal(h.properties.has(property), false);
  assert.equal(h.listeners.size, 0);
  staleFrame();
  h.notify(300);
  assert.equal(h.frames.size, 0);
  assert.equal(h.reads(), 1);
  assert.equal(h.writes.length, 1);
});

test("unavailable ResizeObserver falls back to one geometry read per resize burst", () => {
  const h = createHarness({ resizeObserver: false });
  const stop = h.start();
  assert.equal(h.observers.length, 0);
  assert.equal(h.listeners.size, 1);
  for (let i = 0; i < 100; i++) {
    h.column.width = 100 + i + 0.2;
    h.resize();
  }
  assert.equal(h.frames.size, 1);
  assert.equal(h.reads(), 1);
  h.flush();
  assert.equal(h.reads(), 2);
  assert.equal(h.properties.get(property), "200px");
  h.resize();
  h.flush();
  assert.equal(h.writes.length, 2, "unchanged fallback measurements must not rewrite styles");
  stop();
  assert.equal(h.listeners.size, 0);
  assert.equal(h.properties.has(property), false);
});

test("fallback resize burst cleanup removes the listener and cancels queued work", () => {
  const h = createHarness({ resizeObserver: false });
  const stop = h.start();
  const staleResize = h.listeners.get("resize");
  for (let i = 0; i < 100; i++) h.resize();
  const staleFrame = [...h.frames.values()][0];
  stop();
  assert.deepEqual(h.cancelled, [0]);
  assert.equal(h.listeners.size, 0);
  staleResize({ type: "resize" });
  staleFrame();
  h.resize();
  assert.equal(h.frames.size, 0);
  assert.equal(h.reads(), 1);
  assert.equal(h.properties.has(property), false);
});

test("missing or initially detached columns do not attach observers or schedule work", () => {
  const h = createHarness();
  assert.equal(h.observe(null), undefined);
  h.column.container = null;
  assert.equal(h.start(), undefined);
  h.column.container = h.container;
  h.column.isConnected = false;
  const stop = h.start();
  stop();
  assert.equal(h.observers.length, 0);
  assert.equal(h.listeners.size, 0);
  assert.equal(h.frames.size, 0);
  assert.equal(h.reads(), 0);
});

test("the toolbar layout effect only measures in fullscreen and cleans up on exit", () => {
  const h = createHarness();
  const toolbar = { isFullscreen: false };
  let cleanup;
  let refIndex;
  const useToolbarInteraction = createToolbarInteraction({
    host: h.view,
    readTheme: () => "dark",
    useToolbarSyncOffsets: () => ({}),
    react: {
      useState: initial => [typeof initial === "function" ? initial() : initial, () => {}],
      useRef: initial => ({ current: ++refIndex === 2 ? h.column : initial }),
      useCallback: callback => callback,
      useEffect() {},
      useLayoutEffect(callback, dependencies) {
        assert.deepEqual(dependencies, [toolbar.isFullscreen]);
        cleanup = callback();
      },
    },
  });
  const runEffect = () => {
    refIndex = 0;
    useToolbarInteraction(toolbar);
  };
  runEffect();
  assert.equal(cleanup, undefined);
  assert.equal(h.observers.length, 0);
  toolbar.isFullscreen = true;
  runEffect();
  assert.equal(h.properties.get(property), "48px", "fullscreen entry measures before paint");
  h.notify(220);
  cleanup();
  toolbar.isFullscreen = false;
  runEffect();
  assert.equal(cleanup, undefined);
  assert.equal(h.frames.size, 0);
  assert.equal(h.observers[0].disconnects, 1);
  assert.equal(h.properties.has(property), false);
});
