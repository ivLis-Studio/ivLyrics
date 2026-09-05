import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../FullscreenOverlay.js", import.meta.url), "utf8");

// Run the actual overlay with persistent hooks, effects and event subscriptions.
// Child components stay as elements so only work scheduled by the root is counted.
const createHarness = ({ mode = "standard", visual = {} } = {}) => {
  const slots = [];
  const intervals = new Map();
  const listeners = new Map();
  let cursor = 0;
  let dirty = false;
  let renders = 0;
  let progressReads = 0;
  let timerId = 0;
  let tree;
  let effects = [];
  let props = { isFullscreen: true, presentationMode: mode };
  const sameDeps = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const useState = (initial) => {
    const index = cursor++;
    if (!(index in slots)) slots[index] = { value: typeof initial === "function" ? initial() : initial };
    return [slots[index].value, (next) => {
      const value = typeof next === "function" ? next(slots[index].value) : next;
      if (!Object.is(value, slots[index].value)) {
        slots[index].value = value;
        dirty = true;
      }
    }];
  };
  const useMemo = (factory, deps) => {
    const index = cursor++;
    if (!slots[index] || !sameDeps(slots[index].deps, deps)) slots[index] = { value: factory(), deps };
    return slots[index].value;
  };
  const react = {
    useState,
    useMemo,
    useCallback: (callback, deps) => useMemo(() => callback, deps),
    useRef: (current) => useMemo(() => ({ current }), []),
    useEffect: (effect, deps) => {
      const index = cursor++;
      if (!slots[index] || !sameDeps(slots[index].deps, deps)) {
        effects.push(() => {
          slots[index]?.cleanup?.();
          slots[index] = { deps, cleanup: effect() };
        });
      }
    },
    memo: (component) => component,
    Fragment: Symbol("Fragment"),
    createElement: (type, elementProps, ...children) => ({ type, props: { ...elementProps, children } }),
  };
  const player = {
    data: {
      isPaused: false,
      item: {
        uri: "spotify:track:one",
        artists: [{ uri: "spotify:artist:one" }],
        album: { uri: "spotify:album:one", images: [{ url: "album-image" }] },
        metadata: { title: "Song", artist_name: "Artist", album_title: "Album", duration_ms: 180000 },
      },
    },
    position: 1000,
    getProgress() { progressReads++; return this.position; },
    getDuration() { return this.data.item?.metadata?.duration_ms || 0; },
    addEventListener(name, callback) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(callback);
    },
    removeEventListener(name, callback) { listeners.get(name)?.delete(callback); },
    seek(position) { this.lastSeek = position; },
    togglePlay() { this.data.isPaused = !this.data.isPaused; },
  };
  const vinyl = () => null;
  vinyl.CompactAlbumVinyl = () => null;
  const config = { visual: { "fullscreen-auto-hide-ui": false, ...visual } };
  const context = vm.createContext({
    Spicetify: { React: react, Player: player },
    CONFIG: config,
    I18n: { t: (key) => key },
    window: { ivLyricsVinylPlayerMode: vinyl },
    document: { documentElement: { classList: { remove() {} } } },
    setInterval(callback, delay) { intervals.set(++timerId, { callback, delay }); return timerId; },
    clearInterval(id) { intervals.delete(id); },
    console,
  });
  vm.runInContext(source, context);
  const render = () => {
    let attempts = 0;
    do {
      assert.ok(++attempts < 10, "root updates should settle");
      dirty = false;
      cursor = 0;
      effects = [];
      tree = context.window.FullscreenOverlay(props);
      renders++;
      for (const effect of effects) effect();
    } while (dirty);
    return tree;
  };
  const flush = () => { if (dirty) render(); return tree; };
  const harness = {
    player, config, vinyl,
    get tree() { return tree; },
    get renders() { return renders; },
    get progressReads() { return progressReads; },
    tick(position = player.position + 500) {
      player.position = position;
      for (const { callback, delay } of [...intervals.values()]) {
        assert.equal(delay, 500);
        callback();
      }
      return flush();
    },
    emit(name) { for (const callback of listeners.get(name) || []) callback(); return flush(); },
    update(nextProps = {}) { props = { ...props, ...nextProps }; return render(); },
    unmount() { for (const slot of slots) slot?.cleanup?.(); },
    get intervalCount() { return intervals.size; },
    get listenerCount() { return [...listeners.values()].reduce((sum, set) => sum + set.size, 0); },
  };
  render();
  return harness;
};

const elements = (node) => {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== "object" || !("type" in node)) return [];
  return [node, ...elements(node.props.children)];
};
const byClass = (tree, className) => elements(tree).find((node) => node.props.className?.split(" ").includes(className));
const text = (node) => Array.isArray(node) ? node.map(text).join("") : node && typeof node === "object" ? text(node.props.children) : typeof node === "string" ? node : "";

for (const mode of ["standard", "compact-vinyl"]) {
  test(`${mode} avoids root progress renders while preserving track metadata and playback state`, () => {
    const h = createHarness({ mode });
    const initialRenders = h.renders;
    for (let i = 0; i < 20; i++) h.tick();
    assert.equal(h.renders, initialRenders);
    assert.equal(h.progressReads, 0);
    assert.ok(elements(h.tree).some((node) => node.type?.name === "ProgressBar"), "progress remains owned by the existing child");

    h.player.data.isPaused = true;
    h.emit("onplaypause");
    assert.equal(h.renders, initialRenders + 1);
    if (mode === "compact-vinyl") {
      assert.equal(elements(h.tree).find((node) => node.type === h.vinyl.CompactAlbumVinyl).props.isPlaying, false);
    }

    // Song changes still refresh the root when paused at the same duration.
    h.player.data.item.uri = "spotify:track:two";
    h.player.data.item.metadata.title = "Second song";
    h.emit("songchange");
    assert.match(text(h.tree), /Second song/);
    // Metadata may arrive after the event, with the same item object.
    h.player.data.item.metadata.title = "Completed title";
    h.player.data.item.metadata.artist_name = "Completed artist";
    h.player.data.item.metadata.album_title = "Completed album";
    h.player.data.item.metadata.image_xlarge_url = "completed-cover";
    h.player.data.item.artists[0].uri = "spotify:artist:two";
    h.player.data.item.album.uri = "spotify:album:two";
    const beforeMetadata = h.renders;
    h.tick();
    assert.equal(h.renders, beforeMetadata + 1);
    assert.match(text(h.tree), /Completed title/);
    assert.match(text(h.tree), /Completed artist/);
    assert.match(text(h.tree), /Completed album/);
    if (mode === "compact-vinyl") {
      const track = elements(h.tree).find((node) => node.type === h.vinyl.CompactAlbumVinyl).props.track;
      assert.equal(track.coverUrl, "completed-cover");
      assert.equal(track.uri, "spotify:track:two");
    } else {
      assert.equal(byClass(h.tree, "lyrics-fullscreen-album-art").props.src, "completed-cover");
    }
    const settledRenders = h.renders;
    h.tick();
    assert.equal(h.renders, settledRenders);
    h.unmount();
    assert.equal(h.intervalCount, 0);
    assert.equal(h.listenerCount, 0);
  });
}

for (const mode of ["vinyl", "video"]) {
  test(`${mode} keeps 500 ms playback updates and seeks against the current duration`, () => {
    const h = createHarness({ mode });
    const initialRenders = h.renders;
    h.tick(32000);
    assert.equal(h.renders, initialRenders + 1);
    let stage = elements(h.tree).find((node) => node.type === h.vinyl);
    assert.equal(stage.props.position, 32000);
    assert.equal(stage.props.duration, 180000);
    assert.equal(stage.props.isPlaying, true);
    h.player.data.isPaused = true;
    h.emit("onplaypause");
    stage = elements(h.tree).find((node) => node.type === h.vinyl);
    assert.equal(stage.props.isPlaying, false);
    h.player.data.item.metadata.duration_ms = 120000;
    stage.props.onSeek(130000);
    assert.equal(h.player.lastSeek, 119500);
    h.tick(9000);
    stage = elements(h.tree).find((node) => node.type === h.vinyl);
    assert.equal(stage.props.position, 9000);
    assert.equal(stage.props.duration, 120000);
    h.update({ presentationMode: "standard" });
    assert.equal(h.intervalCount, 1);
    assert.equal(h.listenerCount, 2);
    const standardRenders = h.renders;
    h.tick(10000);
    assert.equal(h.renders, standardRenders);
    h.update({ presentationMode: mode });
    assert.equal(elements(h.tree).find((node) => node.type === h.vinyl).props.position, 10000);
    h.unmount();
    assert.equal(h.intervalCount, 0);
    assert.equal(h.listenerCount, 0);
  });
}

test("TV progress preserves clock, fill, seek, pause and hidden-progress behavior", () => {
  const h = createHarness({ visual: { "fullscreen-tv-mode": true } });
  h.tick(45000);
  assert.equal(text(byClass(h.tree, "current")), "0:45");
  assert.equal(byClass(h.tree, "fullscreen-tv-progress-fill").props.style.width, "25%");
  byClass(h.tree, "fullscreen-tv-progress-bar").props.onClick({
    currentTarget: { getBoundingClientRect: () => ({ left: 10, width: 200 }) }, clientX: 110,
  });
  assert.equal(h.player.lastSeek, 90000);
  h.player.data.isPaused = true;
  h.emit("onplaypause");
  const pausedPath = elements(byClass(h.tree, "play-pause")).find((node) => node.type === "path").props.d;
  assert.match(pausedPath, /^M3 1\.713/);
  h.config.visual["fullscreen-tv-show-progress"] = false;
  h.update();
  const hiddenProgressRenders = h.renders;
  h.tick(50000);
  assert.equal(h.renders, hiddenProgressRenders);
  assert.equal(byClass(h.tree, "fullscreen-tv-progress"), undefined);
  h.config.visual["fullscreen-tv-show-progress"] = true;
  h.update();
  assert.equal(text(byClass(h.tree, "current")), "0:50");
  h.unmount();
  assert.equal(h.intervalCount, 0);
  assert.equal(h.listenerCount, 0);
});


test("polling detects each late metadata field, including in-place artist and album updates", () => {
  const mutations = [
    (item) => { item.uri = "spotify:track:changed"; },
    (item) => { item.artists[0].uri = "spotify:artist:changed"; },
    (item) => { item.album.uri = "spotify:album:changed"; },
    (item) => { item.metadata.title = "Changed title"; },
    (item) => { item.metadata.artist_name = "Changed artist"; },
    (item) => { item.metadata.album_title = "Changed album"; },
    (item) => { item.metadata.album_disc_number = "2"; },
    (item) => { item.metadata.year = "2026"; },
    (item) => { item.metadata.image_xlarge_url = "new-xlarge"; },
    (item) => { item.metadata.image_large_url = "new-large"; },
    (item) => { item.album.images[0].url = "new-album-image"; },
    (item) => { item.metadata.image_url = "new-image"; },
  ];
  for (const mutate of mutations) {
    const h = createHarness();
    const previousRenders = h.renders;
    mutate(h.player.data.item);
    h.tick();
    assert.equal(h.renders, previousRenders + 1, String(mutate));
    h.tick();
    assert.equal(h.renders, previousRenders + 1);
    h.unmount();
  }
});
