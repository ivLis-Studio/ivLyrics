import { createCdVisualizerApi } from "../src/features/player/CdVisualizer.js";
import assert from "node:assert/strict";
import test from "node:test";

const api = createCdVisualizerApi(globalThis);
const uri = index => `spotify:track:${String(index).padStart(22, "0")}`;
const raw = {
  track: { duration: 20 }, segments: [
    { start: 0, duration: 1, loudness_start: -20, loudness_max: 0, loudness_max_time: 0.25,
      loudness_end: -40, pitches: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
    { start: 1, duration: 19, loudness_start: -40, loudness_max: -3, loudness_max_time: 0.25,
      loudness_end: -40, pitches: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0] },
  ],
};
const analysis = api.normalizeAnalysis(raw);
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

function eventTarget() {
  const listeners = new Map();
  return {
    addEventListener(event, listener) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(listener);
    },
    removeEventListener: (event, listener) => listeners.get(event)?.delete(listener),
    emit: event => [...(listeners.get(event) || [])].forEach(callback => callback()),
    listenerCount: () => [...listeners.values()].reduce((sum, set) => sum + set.size, 0),
  };
}

function createHost({ contextAvailable = true, width = 400, height = 400 } = {}) {
  const frames = new Map(), attributes = {}, draws = [];
  const host = eventTarget(), document = { ...eventTarget(), hidden: false }, player = eventTarget();
  let clock = 0, serial = 0, layoutReads = 0, observer, frameCommands = [];
  const context = Object.fromEntries(["setTransform", "beginPath", "arc", "stroke", "fill", "moveTo", "lineTo", "closePath"]
    .map(name => [name, (...args) => frameCommands.push([name, ...args])]));
  context.clearRect = (...args) => {
    frameCommands = [["clearRect", ...args]];
    draws.push(frameCommands);
  };
  const canvas = {
    width: 0, height: 0,
    getContext: () => contextAvailable ? context : null,
    getBoundingClientRect: () => { layoutReads++; return { width, height }; },
    setAttribute: (name, value) => { attributes[name] = value; },
  };
  class ResizeObserver {
    constructor(callback) { this.callback = callback; observer = this; }
    observe(target) { assert.equal(target, canvas); this.connected = true; }
    disconnect() { this.connected = false; }
  }
  let currentUri = uri(1), position = 250, actualPlaying = true;
  host.document = document;
  host.devicePixelRatio = 4;
  host.setTimeout = setTimeout;
  host.clearTimeout = clearTimeout;
  host.performance = { now: () => clock };
  host.ResizeObserver = ResizeObserver;
  host.requestAnimationFrame = callback => { frames.set(++serial, callback); return serial; };
  host.cancelAnimationFrame = id => frames.delete(id);
  host.Utils = { getPlayerPlaybackSnapshot: () => ({ uri: currentUri, position, isPlaying: actualPlaying }) };
  host.Spicetify = { Player: player };
  return {
    host, document, player, canvas, context, attributes, frames, draws,
    get observer() { return observer; },
    get lastDrawing() { return frameCommands; },
    get layoutReads() { return layoutReads; },
    setPosition(value) { position = value; },
    setTrack(value) { currentUri = value; },
    setActualPlaying(value) { actualPlaying = value; },
    tick(time) {
      clock = time;
      const callbacks = [...frames.values()];
      frames.clear();
      callbacks.forEach(callback => callback(time));
    },
    resize(nextWidth, nextHeight) {
      width = nextWidth; height = nextHeight;
      observer?.callback();
    },
  };
}

function createHarness(initial = {}, hostOptions) {
  const h = createHost(hostOptions), statuses = [], requests = [], pending = new Map();
  let props = {
    trackUri: uri(1), accent: "#cc8844", enabled: true, playing: true,
    reducedMotion: false, settings: { ...api.DEFAULTS }, onStatusChange: status => statuses.push(status),
    ...initial,
  };
  const renderer = api.createRenderer(h.canvas, props, {
    root: h.host,
    loadAnalysis: requestedUri => {
      requests.push(requestedUri);
      const wait = deferred(); pending.set(requestedUri, wait); return wait.promise;
    },
  });
  return {
    ...h, get observer() { return h.observer; }, get lastDrawing() { return h.lastDrawing; },
    get layoutReads() { return h.layoutReads; }, renderer, statuses, requests, pending,
    update(next = {}) { props = { ...props, ...next }; renderer.update(props); },
    async ready(requestedUri = props.trackUri, data = analysis) {
      await flush();
      assert.ok(pending.has(requestedUri), `request exists for ${requestedUri}`);
      pending.get(requestedUri).resolve(data);
      await flush();
    },
    destroy() {
      renderer.destroy();
      assert.equal(h.frames.size, 0);
      assert.equal(h.document.listenerCount(), 0);
      assert.equal(h.host.listenerCount(), 0);
      assert.equal(h.player.listenerCount(), 0);
      assert.equal(h.observer.connected, false);
    },
  };
}

const lineEnds = drawing => drawing.filter(([name]) => name === "lineTo");
const assertStaticRing = h => {
  assert.equal(lineEnds(h.lastDrawing).length, 0);
  assert.equal(h.lastDrawing.filter(([name]) => name === "arc").length, 1);
};

test("only the active enabled valid track loads; disabled/local/episode/ad never start a frame loop", async () => {
  for (const props of [
    { enabled: false }, { trackUri: "spotify:local:artist:album:title:1" },
    { trackUri: "spotify:episode:0000000000000000000001" },
    { trackUri: "spotify:ad:0000000000000000000001" }, { trackUri: uri(2) },
  ]) {
    const h = createHarness(props);
    await flush();
    assert.equal(h.requests.length, 0);
    assert.equal(h.frames.size, 0);
    assert.equal(h.renderer.getStatus(), props.enabled === false ? "disabled" : "unavailable");
    assert.equal(h.attributes["data-state"], h.renderer.getStatus());
    h.destroy();
  }
});

test("a new track becoming authoritative after the initial React props can recover without another URI change", async () => {
  const h = createHarness({ trackUri: uri(2) });
  await flush();
  assert.equal(h.renderer.getStatus(), "unavailable");
  assert.equal(h.requests.length, 0);
  h.setTrack(uri(2));
  h.update({ accent: "#4488cc" });
  await h.ready(uri(2));
  assert.deepEqual(h.requests, [uri(2)]);
  assert.deepEqual(h.statuses, ["unavailable", "loading", "ready"]);
  assert.equal(h.frames.size, 1);
  h.destroy();
});

test("status callback and data-state change only at actual transitions, never once per frame or equal prop update", async () => {
  const h = createHarness();
  assert.deepEqual(h.statuses, ["loading"]);
  assertStaticRing(h);
  await h.ready();
  assert.deepEqual(h.statuses, ["loading", "ready"]);
  assert.equal(h.frames.size, 1);
  assert.equal(lineEnds(h.lastDrawing).length, 64);
  for (let tick = 1; tick <= 20; tick++) {
    h.update({ settings: { ...api.DEFAULTS } });
    h.tick(tick * 34);
  }
  assert.deepEqual(h.statuses, ["loading", "ready"]);
  assert.equal(h.attributes["data-state"], "ready");
  assert.equal(h.requests.length, 1);
  h.update({ enabled: false }); h.update({ enabled: false });
  assert.deepEqual(h.statuses, ["loading", "ready", "disabled"]);
  assert.equal(h.frames.size, 0);
  assert.equal(h.lastDrawing.length, 1, "off clears all decorations, not a placeholder ring");
  h.destroy();
});

test("the draw budget is at most 30 fps, has no frame-loop layout reads, and shares one RAF", async () => {
  const h = createHarness();
  await h.ready();
  const initialDraws = h.draws.length, initialReads = h.layoutReads;
  for (let tick = 1; tick <= 120; tick++) {
    h.setPosition(250 + tick * 1000 / 120);
    h.tick(tick * 1000 / 120);
    assert.equal(h.frames.size, 1);
  }
  assert.ok(h.draws.length - initialDraws <= 30, `${h.draws.length - initialDraws} paints in a second`);
  assert.ok(h.draws.length - initialDraws >= 29);
  assert.equal(h.layoutReads, initialReads);
  assert.equal(h.requests.length, 1);
  assert.equal(h.canvas.width, 800, "DPR is capped at two");
  h.destroy();
});

test("each track change clears the previous song immediately and ignores its late analysis", async () => {
  const h = createHarness();
  await flush();
  h.setTrack(uri(2));
  h.update({ trackUri: uri(2) });
  assertStaticRing(h);
  assert.equal(h.frames.size, 0);
  await h.ready(uri(2));
  assert.equal(h.frames.size, 1);
  const before = h.lastDrawing;
  h.pending.get(uri(1)).resolve(null);
  await flush();
  assert.equal(h.renderer.getStatus(), "ready");
  assert.equal(h.renderer.getState().trackUri, uri(2));
  assert.equal(h.lastDrawing, before, "an outgoing promise cannot repaint the current song");
  assert.equal(h.frames.size, 1);
  h.destroy();
});

test("turning off during loading rejects stale completion and re-enabling makes exactly one fresh subscription", async () => {
  const h = createHarness();
  await flush();
  const original = h.pending.get(uri(1));
  h.update({ enabled: false });
  original.resolve(analysis);
  await flush();
  assert.equal(h.renderer.getStatus(), "disabled");
  assert.equal(h.renderer.getState().hasAnalysis, false);
  assert.equal(h.frames.size, 0);
  h.update({ enabled: true });
  await h.ready();
  assert.equal(h.frames.size, 1);
  assert.deepEqual(h.statuses, ["loading", "disabled", "loading", "ready"]);
  h.destroy();
});

test("pause and motion reduction retain only a static ring and cancel RAF until explicitly resumed", async () => {
  const h = createHarness();
  await h.ready();
  for (const key of ["playing", "reducedMotion"]) {
    h.update({ [key]: key === "reducedMotion" });
    assert.equal(h.frames.size, 0);
    assertStaticRing(h);
    const draws = h.draws.length;
    h.tick(500);
    assert.equal(h.draws.length, draws);
    h.update({ [key]: key === "playing" });
    assert.equal(h.frames.size, 1);
    assert.equal(lineEnds(h.lastDrawing).length, 64);
  }
  assert.equal(h.requests.length, 1);
  h.destroy();
});

test("starting paused/reduced motion may prepare analysis but never schedules a continuous loop", async () => {
  for (const props of [{ playing: false }, { reducedMotion: true }]) {
    const h = createHarness(props);
    await h.ready();
    assert.equal(h.renderer.getStatus(), "ready");
    assert.equal(h.frames.size, 0);
    assertStaticRing(h);
    h.destroy();
  }
});

test("a hidden document cancels the pending frame, then restarts from actual position without elapsed-time catch-up", async () => {
  const h = createHarness();
  await h.ready();
  const initial = lineEnds(h.lastDrawing);
  h.document.hidden = true;
  h.document.emit("visibilitychange");
  assert.equal(h.frames.size, 0);
  const count = h.draws.length;
  h.tick(50000);
  assert.equal(h.draws.length, count);
  h.document.hidden = false;
  h.document.emit("visibilitychange");
  assert.equal(h.frames.size, 1);
  assert.deepEqual(lineEnds(h.lastDrawing), initial, "wall time is never mistaken for playback progress");
  h.setPosition(1250);
  h.player.emit("onseek");
  assert.notDeepEqual(lineEnds(h.lastDrawing), initial);
  assert.equal(h.requests.length, 1);
  h.destroy();
});

test("analysis completing while hidden does not start RAF until the document is visible", async () => {
  const h = createHarness();
  h.document.hidden = true;
  h.document.emit("visibilitychange");
  await h.ready();
  assert.equal(h.renderer.getStatus(), "ready");
  assert.equal(h.frames.size, 0);
  h.document.hidden = false;
  h.document.emit("visibilitychange");
  assert.equal(h.frames.size, 1);
  h.destroy();
});

test("forward/backward seeks sample the current song immediately without a stale smoothing trail", async () => {
  const h = createHarness();
  await h.ready();
  const initial = lineEnds(h.lastDrawing);
  h.setPosition(1250); h.player.emit("onseek");
  const later = lineEnds(h.lastDrawing);
  assert.notDeepEqual(later, initial);
  h.setPosition(250); h.player.emit("onseek");
  assert.deepEqual(lineEnds(h.lastDrawing), initial);
  assert.equal(h.frames.size, 1);
  h.update({ playing: false });
  h.setPosition(1250); h.player.emit("onseek");
  assertStaticRing(h);
  assert.equal(h.frames.size, 0);
  assert.equal(h.requests.length, 1);
  h.destroy();
});

test("native player pauses and song changes stop rendering even before React receives updated props", async () => {
  const h = createHarness();
  await h.ready();
  h.setActualPlaying(false);
  h.player.emit("onplaypause");
  assert.equal(h.frames.size, 0);
  assertStaticRing(h);
  h.setActualPlaying(true);
  h.player.emit("onplaypause");
  assert.equal(h.frames.size, 1);
  h.setTrack(uri(2));
  h.player.emit("songchange");
  assert.equal(h.frames.size, 0);
  assert.equal(h.renderer.getState().hasAnalysis, false);
  assertStaticRing(h);
  assert.equal(h.renderer.getStatus(), "unavailable");
  h.destroy();
});

test("a missing player event still replaces a paused/outgoing animated frame with a static ring", async () => {
  for (const kind of ["pause", "track"]) {
    const h = createHarness();
    await h.ready();
    if (kind === "pause") h.setActualPlaying(false);
    else h.setTrack(uri(2));
    h.tick(34);
    assert.equal(h.frames.size, 0);
    assertStaticRing(h);
    if (kind === "pause") h.setActualPlaying(true);
    else h.setTrack(uri(1));
    h.host.emit("focus");
    assert.equal(h.frames.size, 1);
    assert.equal(h.renderer.getStatus(), "ready");
    h.destroy();
  }
});

test("an initially disabled canvas never touches the guarded playback clock", () => {
  const h = createHost();
  let reads = 0, requests = 0;
  const renderer = api.createRenderer(h.canvas, { trackUri: uri(1), enabled: false }, {
    root: h.host,
    readPlayback() { reads++; return { matches: true, position: 0, playing: true }; },
    loadAnalysis() { requests++; return Promise.resolve(analysis); },
  });
  h.player.emit("onseek");
  h.host.emit("focus");
  assert.equal(reads, 0);
  assert.equal(requests, 0);
  assert.equal(h.frames.size, 0);
  renderer.destroy();
});

test("offscreen zero-size canvases do not animate and resize recovery has exactly one RAF", async () => {
  const h = createHarness({}, { width: 0, height: 0 });
  await h.ready();
  assert.equal(h.frames.size, 0);
  h.resize(500, 500);
  assert.equal(h.frames.size, 1);
  assert.equal(h.canvas.width, 1000);
  h.resize(0, 0);
  assert.equal(h.frames.size, 0);
  h.resize(300, 300);
  assert.equal(h.frames.size, 1);
  assert.equal(h.canvas.width, 600);
  h.destroy();
});

test("changing shape/color/density updates only drawing and never refetches analysis", async () => {
  const h = createHarness();
  await h.ready();
  h.update({ settings: { ...api.DEFAULTS, style: "dots", density: 32, thickness: 4, colorMode: "custom", customColor: "#0000ff" } });
  assert.equal(h.lastDrawing.filter(([name]) => name === "arc").length, 33);
  assert.equal(h.context.fillStyle, "#0000ff");
  h.update({ settings: { ...api.DEFAULTS, style: "line", colorMode: "white" } });
  assert.equal(h.lastDrawing.filter(([name]) => name === "closePath").length, 1);
  assert.equal(h.context.strokeStyle, "#ffffff");
  assert.equal(h.requests.length, 1);
  assert.deepEqual(h.statuses, ["loading", "ready"]);
  assert.equal(h.frames.size, 1);
  h.destroy();
});

test("switching between every effect, rainbow and mirror reuses the analysis and one frame loop", async () => {
  const h = createHarness();
  await h.ready();
  for (const style of api.STYLES) {
    for (const extra of [{}, { mirror: true, colorMode: "rainbow" }]) {
      h.update({ settings: { ...api.DEFAULTS, style, ...extra } });
      assert.equal(h.frames.size, 1, `${style}: one frame loop`);
      assert.ok(h.lastDrawing.filter(([name]) => name === "stroke" || name === "fill").length >= 2, `${style}: drew the effect`);
    }
  }
  assert.equal(h.requests.length, 1);
  assert.deepEqual(h.statuses, ["loading", "ready"]);
  h.destroy();
});

test("block peak caps hold above a falling level and a seek starts a new peak history", async () => {
  const h = createHarness({ settings: { ...api.DEFAULTS, style: "blocks", density: 24 } });
  await h.ready();
  const strokes = () => h.lastDrawing.filter(([name]) => name === "stroke").length;
  assert.equal(strokes(), 2, "no caps while the live level is the peak");
  let clock = 0;
  for (let position = 280; position <= 640; position += 30) {
    h.setPosition(position);
    h.tick(clock += 34);
  }
  assert.equal(strokes(), 3, "caps stay above the falling level");
  h.player.emit("onseek");
  assert.equal(strokes(), 2, "a seek snaps the caps to the new level");
  h.destroy();
});

test("missing analysis or 2D context degrades to unavailable without a hot retry/render loop", async () => {
  const unavailable = createHarness();
  await unavailable.ready(uri(1), null);
  assert.deepEqual(unavailable.statuses, ["loading", "unavailable"]);
  assert.equal(unavailable.frames.size, 0);
  assertStaticRing(unavailable);
  for (let index = 0; index < 20; index++) unavailable.update({ settings: { ...api.DEFAULTS } });
  assert.equal(unavailable.requests.length, 1);
  assert.deepEqual(unavailable.statuses, ["loading", "unavailable"]);
  unavailable.destroy();
  const noContext = createHarness({}, { contextAvailable: false });
  await flush();
  assert.deepEqual(noContext.statuses, ["unavailable"]);
  assert.equal(noContext.requests.length, 0);
  assert.equal(noContext.frames.size, 0);
  noContext.destroy();
});

test("unmount removes all events/observers/RAF and ignores both fulfilled and rejected late results", async () => {
  for (const reject of [false, true]) {
    const h = createHarness();
    await flush();
    assert.equal(h.observer.connected, true);
    h.destroy();
    const count = h.draws.length;
    const reads = h.layoutReads;
    h.observer.callback();
    assert.equal(h.layoutReads, reads, "a queued ResizeObserver delivery cannot measure an unmounted canvas");
    if (reject) h.pending.get(uri(1)).reject(new Error("cancelled network"));
    else h.pending.get(uri(1)).resolve(analysis);
    await flush();
    assert.equal(h.draws.length, count);
    assert.deepEqual(h.statuses, ["loading"]);
    assert.equal(h.frames.size, 0);
    h.renderer.destroy();
  }
  const ready = createHarness();
  await ready.ready();
  ready.destroy();
  ready.tick(30000);
  assert.equal(ready.frames.size, 0);
});

function createReactHarness(initial = {}, setup = () => {}) {
  const h = createHost(), slots = [], notifications = [];
  let cursor = 0, dirty = false, effects = [], tree, renderCount = 0;
  let props = { trackUri: uri(1), accent: "#aabbcc", enabled: true, playing: true, settings: { ...api.DEFAULTS }, ...initial };
  const equal = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const react = {
    useRef(value) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { ref: { current: value } };
      return slots[index].ref;
    },
    useState(initialValue) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { value: initialValue };
      return [slots[index].value, next => {
        const value = typeof next === "function" ? next(slots[index].value) : next;
        if (!Object.is(value, slots[index].value)) { slots[index].value = value; dirty = true; }
      }];
    },
    useEffect(effect, deps) {
      const index = cursor++;
      if (!slots[index] || !equal(slots[index].deps, deps)) effects.push(() => {
        slots[index]?.cleanup?.();
        slots[index] = { deps, cleanup: effect() };
      });
    },
    createElement: (type, elementProps) => ({ type, props: elementProps }),
  };
  let requests = 0;
  h.host.Spicetify.React = react;
  h.host.Spicetify.getAudioData = () => { requests++; return raw; };
  setup(h);
  const visualizer = createCdVisualizerApi(h.host);
  function render(next = {}) {
    props = { ...props, ...next };
    let passes = 0;
    do {
      assert.ok(++passes < 10, "status updates settle without a React effect/callback loop");
      renderCount++; cursor = 0; dirty = false; effects = [];
      tree = visualizer.Visualizer({ ...props, onStatusChange: status => notifications.push(status) });
      tree.props.ref.current = h.canvas;
      effects.forEach(effect => effect());
    } while (dirty);
    return tree;
  }
  render();
  return {
    ...h, render, notifications,
    get tree() { return tree; }, get renderCount() { return renderCount; }, get requests() { return requests; },
    async settle() { await flush(); if (dirty) render(); },
    unmount() { slots.forEach(slot => slot.cleanup?.()); },
  };
}

test("the production React wrapper settles even if the parent supplies a new status callback/settings object every render", async () => {
  const h = createReactHarness({ className: "fixture-visualizer" });
  await h.settle();
  assert.equal(h.tree.type, "canvas");
  assert.equal(h.tree.props.className, "ivlyrics-cd-visualizer fixture-visualizer");
  assert.equal(h.tree.props["aria-hidden"], true);
  assert.equal(h.tree.props.role, "presentation");
  assert.equal(h.tree.props["data-state"], "ready");
  assert.equal(h.tree.props.style.pointerEvents, "none");
  assert.deepEqual(h.notifications, ["loading", "ready"]);
  for (let index = 0; index < 20; index++) h.render({ settings: { ...api.DEFAULTS } });
  assert.deepEqual(h.notifications, ["loading", "ready"]);
  assert.equal(h.requests, 1);
  const renders = h.renderCount;
  for (let index = 1; index <= 20; index++) h.tick(index * 34);
  assert.equal(h.renderCount, renders, "canvas frames never update React state");
  h.render({ enabled: false });
  assert.equal(h.tree.props["data-state"], "disabled");
  assert.deepEqual(h.notifications, ["loading", "ready", "disabled"]);
  assert.equal(h.frames.size, 0);
  h.unmount();
  assert.equal(h.player.listenerCount(), 0);
  assert.equal(h.document.listenerCount(), 0);
  assert.equal(h.host.listenerCount(), 0);
});

test("React artworkUrl and albumGradient prop changes reach the renderer without reloading analysis", async () => {
  const images = [], patterns = [];
  const rgba = Uint8ClampedArray.from(Array.from({ length: 100 }, () => [230, 35, 35, 255, 35, 75, 230, 255]).flat());
  const secondRgba = Uint8ClampedArray.from(Array.from({ length: 100 }, () => [35, 230, 65, 255, 230, 180, 35, 255]).flat());
  const h = createReactHarness({ artworkUrl: "https://i.scdn.co/image/first" }, host => {
    host.host.AbortController = AbortController;
    host.host.Image = class {
      constructor() { this.naturalWidth = this.naturalHeight = 300; images.push(this); }
      set src(value) { this.url = value; }
    };
    host.document.createElement = () => ({ getContext: () => {
      let artwork;
      return {
        drawImage(image) { artwork = image.url; },
        getImageData: () => ({ data: artwork?.endsWith("/second") ? secondRgba : rgba }),
        createImageData: (width, height) => ({ data: new Uint8ClampedArray(width * height * 4) }), putImageData() {},
      };
    } });
    host.context.createPattern = () => {
      const pattern = { setTransform() {} }; patterns.push(pattern); return pattern;
    };
  });
  await h.settle(); assert.equal(images.length, 1);
  images[0].onload(); await h.settle(); assert.equal(patterns.length, 1);
  h.render({ artworkUrl: "https://i.scdn.co/image/second" });
  await h.settle(); assert.equal(images.length, 2);
  images[1].onload(); await h.settle(); assert.equal(patterns.length, 2);
  h.render({ settings: { ...api.DEFAULTS, albumGradient: false } });
  assert.equal(h.context.strokeStyle, "#aabbcc");
  h.render({ settings: { ...api.DEFAULTS } }); await h.settle();
  assert.equal(images.length, 2, "re-enabling uses the cached second artwork");
  assert.equal(patterns.length, 2);
  assert.equal(h.context.strokeStyle, patterns[1]);
  assert.equal(h.requests, 1);
  assert.deepEqual(h.notifications, ["loading", "ready"]);
  h.unmount(); assert.equal(h.frames.size, 0);
});
