import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../FullscreenOverlay.js", import.meta.url), "utf8");
const from = source.indexOf("    const observeFullscreenAlbumLyricsRegion =");
const to = source.indexOf("    // Main Overlay Component", from);
assert.ok(from >= 0 && to > from);

const createHarness = () => {
  let nextFrame = 0;
  const frames = new Map();
  const mutations = [];
  const resizes = [];
  const config = { visual: { alignment: "center" } };
  const events = () => ({
    handlers: new Map(),
    addEventListener(name, handler) { this.handlers.set(name, handler); },
    removeEventListener(name) { this.handlers.delete(name); },
    emit(name) { this.handlers.get(name)?.(); },
  });
  const notify = (target, type = "attributes", attributeName = "class") => {
    for (const observer of mutations) {
      if (observer.targets.some(([node, options]) =>
        (node === target || (options.subtree && target.parent === node)) &&
        (type === "childList" ? options.childList :
          options.attributes && options.attributeFilter.includes(attributeName)))) observer.callback();
    }
  };
  const view = {
    ...events(),
    requestAnimationFrame(callback) { frames.set(++nextFrame, callback); return nextFrame; },
    cancelAnimationFrame(id) { frames.delete(id); },
    getComputedStyle(node) { return node.computed || { display: "block", visibility: "visible" }; },
    MutationObserver: class {
      targets = [];
      constructor(callback) { this.callback = callback; mutations.push(this); }
      observe(node, options) { this.targets.push([node, options]); }
      disconnect() { this.targets = []; }
    },
    ResizeObserver: class {
      targets = new Set();
      constructor(callback) { this.callback = callback; resizes.push(this); }
      observe(node) { this.targets.add(node); }
      unobserve(node) { this.targets.delete(node); }
      disconnect() { this.targets.clear(); }
    },
  };
  const rootClasses = new Set(["fullscreen-active"]);
  const panelClasses = new Set();
  const properties = new Map();
  const attributes = new Map();
  const root = {
    isConnected: true,
    rect: { left: 120, right: 1320, width: 1200, height: 900 },
    writes: 0,
    classList: { contains: name => rootClasses.has(name) },
    getBoundingClientRect() { return this.rect; },
    hasAttribute(name) { return attributes.has(name); },
    getAttribute(name) { return attributes.get(name) ?? null; },
    setAttribute(name, value) { attributes.set(name, value); this.writes++; notify(this, "attributes", name); },
    removeAttribute(name) { attributes.delete(name); this.writes++; notify(this, "attributes", name); },
    style: {
      getPropertyValue(name) { return properties.get(name) || ""; },
      setProperty(name, value) { properties.set(name, value); root.writes++; notify(root, "attributes", "style"); },
      removeProperty(name) { properties.delete(name); root.writes++; notify(root, "attributes", "style"); },
    },
  };
  const panel = {
    ...events(),
    isConnected: true,
    ownerDocument: { defaultView: view },
    classList: { contains: name => panelClasses.has(name) },
    closest() { return root; },
    querySelector() { return this.album; },
  };
  const album = {
    parent: panel,
    rect: { left: 220, right: 620, width: 400, height: 400 },
    getBoundingClientRect() { return this.rect; },
  };
  panel.album = album;
  const context = vm.createContext({ window: view, CONFIG: config });
  vm.runInContext(`${source.slice(from, to)}\nglobalThis.observe = observeFullscreenAlbumLyricsRegion;`, context);
  const stop = context.observe(panel);
  const flush = () => {
    let count = 0;
    while (frames.size) {
      assert.ok(++count <= 4, "measurement must settle after its own CSS mutations");
      const callbacks = [...frames.values()];
      frames.clear();
      callbacks.forEach(callback => callback());
    }
  };
  return {
    root, panel, album, config, view, rootClasses, panelClasses,
    frames, mutations, resizes, properties, stop, flush, notify,
    enabled: () => root.getAttribute("data-album-centered-lyrics") === "true",
    insets: () => ["left", "right"].map(side => Number.parseFloat(properties.get(`--lyrics-fullscreen-region-${side}`))),
  };
};

test("centers from the actual album edge inside an embedded fullscreen viewport", () => {
  const h = createHarness();
  h.flush();
  assert.equal(h.enabled(), true);
  assert.deepEqual(h.insets(), [500, 0]);
  const [left, right] = h.insets();
  assert.equal(h.root.rect.left + (left + h.root.rect.width - right) / 2,
    (h.album.rect.right + h.root.rect.right) / 2);
  const writes = h.root.writes;
  h.notify(h.root, "attributes", "style");
  h.flush();
  assert.equal(h.root.writes, writes, "unchanged geometry must not rewrite styles");
  h.stop();
});

test("mirrors the measured area when the album is on the right", () => {
  const h = createHarness();
  h.rootClasses.add("layout-reversed");
  h.album.rect = { left: 820, right: 1220, width: 400, height: 400 };
  h.flush();
  assert.deepEqual(h.insets(), [0, 500]);
  const [left, right] = h.insets();
  assert.equal(h.root.rect.left + (left + h.root.rect.width - right) / 2,
    (h.root.rect.left + h.album.rect.left) / 2);
  h.stop();
});

test("tracks image resizing and settled transforms without a playback timer", () => {
  const h = createHarness();
  h.flush();
  h.album.rect.right = 720;
  h.album.rect.width = 500;
  h.resizes[0].callback();
  h.flush();
  assert.deepEqual(h.insets(), [600, 0]);
  h.album.rect.right = 716;
  h.panel.emit("transitionend");
  h.flush();
  assert.deepEqual(h.insets(), [596, 0]);
  assert.equal(h.frames.size, 0);
  h.stop();
});

test("leaves left/right alignment and nonstandard fullscreen modes untouched", () => {
  const h = createHarness();
  h.flush();
  for (const name of ["tv-mode-active", "portrait-mode", "fullscreen-single-column",
    "fullscreen-focus-active", "fullscreen-no-lyrics", "marketplace-active"]) {
    h.rootClasses.add(name);
    h.notify(h.root);
    h.flush();
    assert.equal(h.enabled(), false, name);
    assert.equal(h.properties.size, 0);
    h.rootClasses.delete(name);
    h.notify(h.root);
    h.flush();
    assert.equal(h.enabled(), true);
  }
  for (const alignment of ["left", "right"]) {
    h.config.visual.alignment = alignment;
    h.notify(h.root, "attributes", "style");
    h.flush();
    assert.equal(h.enabled(), false, alignment);
  }
  h.config.visual.alignment = "center";
  h.rootClasses.delete("fullscreen-active");
  h.notify(h.root);
  h.flush();
  assert.equal(h.enabled(), false);
  h.stop();
});

test("resets for TMI, hidden albums, album removal and reattaches to replacement covers", () => {
  const h = createHarness();
  h.flush();
  h.panelClasses.add("tmi-mode");
  h.notify(h.panel);
  h.flush();
  assert.equal(h.enabled(), false);
  h.panelClasses.delete("tmi-mode");
  h.panel.album = null;
  h.notify(h.panel, "childList");
  h.flush();
  assert.equal(h.resizes[0].targets.has(h.album), false);
  const nextAlbum = { ...h.album, computed: { display: "block", visibility: "hidden" } };
  h.panel.album = nextAlbum;
  h.notify(h.panel, "childList");
  h.flush();
  assert.equal(h.enabled(), false);
  assert.equal(h.resizes[0].targets.has(nextAlbum), true);
  nextAlbum.computed.visibility = "visible";
  h.notify(nextAlbum, "attributes", "style");
  h.flush();
  assert.equal(h.enabled(), true);
  h.stop();
});

test("observes only the root attributes and album panel subtree, then cleans up", () => {
  const h = createHarness();
  h.flush();
  const [rootObservation, panelObservation] = h.mutations[0].targets;
  assert.equal(rootObservation[0], h.root);
  assert.equal(rootObservation[1].subtree, undefined);
  assert.equal(rootObservation[1].childList, undefined);
  assert.equal(panelObservation[0], h.panel);
  assert.equal(panelObservation[1].subtree, true);
  h.notify(h.root);
  assert.equal(h.frames.size, 1);
  h.stop();
  assert.equal(h.frames.size, 0);
  assert.equal(h.enabled(), false);
  assert.equal(h.properties.size, 0);
  assert.equal(h.mutations[0].targets.length, 0);
  assert.equal(h.resizes[0].targets.size, 0);
  assert.equal(h.panel.handlers.size, 0);
  assert.equal(h.view.handlers.size, 0);
});

test("the panel callback ref owns attachment, replacement and removal cleanup", () => {
  const start = source.indexOf("        const albumLyricsRegionCleanupRef =");
  const end = source.indexOf("        const [isPortraitViewport", start);
  assert.ok(start >= 0 && end > start);
  const calls = [];
  const context = vm.createContext({
    useRef: current => ({ current }),
    useCallback: callback => callback,
    observeFullscreenAlbumLyricsRegion(panel) {
      assert.equal(panel.isConnected, true, "React attaches the panel before measuring its ancestor");
      calls.push(["attach", panel]);
      return () => calls.push(["detach", panel]);
    },
  });
  vm.runInContext(`${source.slice(start, end)}\nglobalThis.ref = setAlbumLyricsPanelRef;`, context);
  const first = { isConnected: true };
  const replacement = { isConnected: true };
  assert.deepEqual(calls, [], "rendering without an attached panel does no DOM work");
  context.ref(first);
  context.ref(null);
  context.ref(replacement);
  context.ref(null);
  context.ref(null);
  assert.deepEqual(calls, [["attach", first], ["detach", first],
    ["attach", replacement], ["detach", replacement]]);
  assert.match(source, /className: `lyrics-fullscreen-left-panel[^\n]+\n\s+ref: setAlbumLyricsPanelRef/);
});
