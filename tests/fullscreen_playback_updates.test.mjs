import assert from "node:assert/strict";
import { readFullscreenOverlayFixture } from "./fixtures/legacy-page-source.mjs";
import test from "node:test";
import vm from "node:vm";
import { artworkUtils } from './artwork_harness.mjs';
import { createFullscreenPlaybackContext } from "../src/features/fullscreen/fullscreenPlaybackContext.mjs";
import { renderLyricsFullscreenOverlay } from "../src/lyrics/lyricsPageFullscreenView.mjs";
import { getKaraokeRenderGranularity, KARAOKE, WORD_KARAOKE, SYNCED } from "../src/lyrics/lyricsRenderModes.mjs";

const source = readFullscreenOverlayFixture();

test("fullscreen context artwork follows the active playlist and shares its pending lookup across songs", async () => {
  const first = Promise.withResolvers();
  const second = Promise.withResolvers();
  const requests = [];
  const views = [];
  let context = {
    uri: "spotify:playlist:first",
    metadata: { context_description: "First playlist" },
  };
  const update = createFullscreenPlaybackContext({
    readContext: () => context,
    showImage: true,
    fetchPlaylistMetadata(uri) {
      requests.push(uri);
      return uri.endsWith(":first") ? first.promise : second.promise;
    },
    publish: view => views.push(view),
  });
  update.update();
  context = { ...context, metadata: { ...context.metadata } };
  update.update();
  assert.deepEqual(requests, ["spotify:playlist:first"]);
  context = { uri: "spotify:playlist-v2:second", metadata: { context_description: "Second playlist" } };
  update.update();

  first.resolve({ images: ["spotify:image:outdated"] });
  await first.promise;
  assert.equal(views.at(-1).name, "Second playlist");
  assert.equal(views.at(-1).image, "");
  second.resolve({ images: ["spotify:image:current"] });
  await second.promise;
  assert.deepEqual(requests, ["spotify:playlist:first", "spotify:playlist:second"]);
  assert.equal(views.at(-1).image, "https://i.scdn.co/image/current");
  context = null;
  update.update();
  assert.equal(views.at(-1).name, "");
});

test("fullscreen context ignores pending artwork after disposal and skips lookups when artwork is hidden", async () => {
  const pending = Promise.withResolvers();
  const views = [];
  const readContext = () => ({
    uri: "spotify:playlist:fixture",
    metadata: { context_description: "Fixture playlist" },
  });
  const source = createFullscreenPlaybackContext({
    readContext,
    showImage: true,
    fetchPlaylistMetadata: () => pending.promise,
    publish: view => views.push(view),
  });
  source.update();
  source.dispose();
  pending.resolve({ image: "spotify:image:outdated" });
  await pending.promise;
  source.update();
  assert.equal(views.length, 1);
  assert.equal(views[0].image, "");

  createFullscreenPlaybackContext({
    readContext,
    showImage: false,
    fetchPlaylistMetadata: () => assert.fail("hidden artwork does not require a lookup"),
    publish: view => views.push(view),
  }).update();
  assert.equal(views.at(-1).name, "Fixture playlist");
});

// Run the actual overlay with persistent hooks, effects and event subscriptions.
// Child components stay as elements so only work scheduled by the root is counted.
const createHarness = ({ mode = "standard", visual = {}, windowOverrides = {}, documentOverrides = {}, timers = {} } = {}) => {
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
    useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
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
    repeat: 0,
    getRepeat() { return this.repeat; },
    setRepeat(mode) { this.repeat = mode; },
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
  vinyl.PresentationSwitcher = () => null;
  const config = { visual: { "fullscreen-auto-hide-ui": false, ...visual } };
  const context = vm.createContext({
    AbortController,
    Utils: artworkUtils,
    Spicetify: { React: react, Player: player },
    CONFIG: config,
    I18n: { t: (key) => key },
    window: { ivLyricsVinylPlayerMode: vinyl, ...windowOverrides },
    document: { documentElement: { classList: { remove() {} } }, ...documentOverrides },
    setInterval(callback, delay) { intervals.set(++timerId, { callback, delay }); return timerId; },
    clearInterval(id) { intervals.delete(id); },
    ...timers,
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
    flush,
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

test("the focused stage receives the same word, character or line mode selected by the lyrics page", () => {
  const h = createHarness({ mode: "vinyl" });
  const lyrics = [{ text: "Fixture", startTime: 1000 }];
  const state = { isFullscreen: true, uri: "spotify:track:one", karaoke: lyrics, currentLyrics: lyrics };
  for (const [mode, granularity] of [[KARAOKE, "character"], [WORD_KARAOKE, "word"], [SYNCED, null]]) {
    const props = renderLyricsFullscreenOverlay({
      react: { createElement: (_type, props) => props }, FullscreenOverlay: true,
      state, renderedCurrentLyrics: lyrics, fullscreenPresentation: "vinyl",
      karaokeRenderGranularity: getKaraokeRenderGranularity(mode), getPlainLyricsLineText: line => line.text,
    });
    h.update(props);
    const stage = elements(h.tree).find(node => node.type === h.vinyl);
    assert.equal(stage.props.karaokeRenderGranularity, granularity);
    assert.equal(stage.props.activeLyricsKaraoke, granularity !== null);
    assert.equal(stage.props.lyricsTrackUri, state.uri);
  }
  h.unmount();
});

test("local-track identity survives album metadata and song changes in fullscreen", () => {
  const h = createHarness({ mode: "vinyl" });
  const first = "spotify:local:Artist:Album:First:180";
  const second = "spotify:local:Artist:Album:Second:180";
  h.player.data.item = { uri: first, metadata: { title: "Shared title", artist_name: "Artist" } };
  h.update({ trackUri: first, coverUrl: "local-cover.png" });
  const stage = () => elements(h.tree).find(node => node.type === h.vinyl).props;
  assert.equal(stage().track.uri, first);
  assert.equal(stage().track.coverUrl, "local-cover.png");
  h.player.data.item = { ...h.player.data.item, uri: second };
  h.emit("songchange");
  assert.equal(stage().track.uri, second);
  assert.equal(stage().lyricsTrackUri, first);
  assert.equal(stage().track.coverUrl, "");
  h.unmount();
});

test("landscape, portrait and TV captions reject an outgoing track's titles and translations", () => {
  const layouts = [
    { name: "landscape", title: "lyrics-fullscreen-title", artist: "lyrics-fullscreen-artist" },
    { name: "portrait", title: "portrait-track-title", artist: "portrait-track-artist" },
    { name: "TV", title: "fullscreen-tv-title", artist: "fullscreen-tv-artist" },
  ];
  for (const { name, title, artist } of layouts) {
    const h = createHarness({
      visual: { "fullscreen-tv-mode": name === "TV", "translate-metadata-mode": "translated" },
      windowOverrides: { matchMedia: query => ({ matches: name === "portrait" && query.includes("orientation") }) },
    });
    h.update({
      trackUri: "spotify:track:one", title: "Route title", artist: "Route artist",
      translatedMetadata: { translated: { title: "번역 제목", artist: "번역 가수" } },
    });
    assert.equal(text(byClass(h.tree, title)), "번역 제목", name);
    assert.equal(text(byClass(h.tree, artist)), "번역 가수", name);

    h.player.data.item = {
      uri: "spotify:track:two", album: { uri: "spotify:album:two" },
      metadata: { title: "Live title", artist_name: "Live artist", album_title: "Live album" },
    };
    h.emit("songchange");
    assert.equal(text(byClass(h.tree, title)), "Live title", name);
    assert.equal(text(byClass(h.tree, artist)), "Live artist", name);
    h.update({
      trackUri: "spotify:track:two",
      translatedMetadata: { translated: { title: "새 제목", artist: "새 가수" } },
    });
    assert.equal(text(byClass(h.tree, title)), "새 제목", name);
    h.unmount();
  }
});

test("an idle fullscreen overlay stays hidden through a song change and releases its listener on exit", () => {
  const pointers = new Set();
  const timeouts = new Map();
  let nextTimer = 0;
  const h = createHarness({
    visual: { "fullscreen-auto-hide-ui": true, "fullscreen-auto-hide-delay": 2 },
    documentOverrides: {
      addEventListener(name, handle) { if (name === "mousemove") pointers.add(handle); },
      removeEventListener(name, handle) { if (name === "mousemove") pointers.delete(handle); },
    },
    timers: {
      setTimeout(handle, delay) {
        assert.equal(delay, 2000);
        timeouts.set(++nextTimer, handle);
        return nextTimer;
      },
      clearTimeout(id) { timeouts.delete(id); },
    },
  });
  const isHidden = () => byClass(h.tree, "fullscreen-top-right").props.className.includes("hidden");
  const move = (screenX, screenY) => {
    assert.equal(pointers.size, 1);
    for (const handle of pointers) handle({ screenX, screenY });
    h.flush();
  };

  assert.equal(isHidden(), false);
  move(20, 40);
  assert.equal(timeouts.size, 1);
  for (const [id, handle] of timeouts) {
    timeouts.delete(id);
    handle();
  }
  h.flush();
  assert.equal(isHidden(), true);
  h.player.data.item.metadata.title = "Second song";
  h.emit("songchange");
  move(20, 40);
  assert.equal(isHidden(), true);
  assert.equal(timeouts.size, 0);
  move(21, 40);
  assert.equal(isHidden(), false);
  assert.equal(timeouts.size, 1);
  h.update({ isFullscreen: false });
  assert.equal(pointers.size, 0);
  assert.equal(timeouts.size, 0);
  h.unmount();
});

test("LP labels follow existing metadata modes, simplification and track ownership", () => {
  const translatedMetadata = {
    translated: { title: "번역 제목 (리마스터)", artist: "번역 가수 [피처링]" },
    romanized: { title: "Beonyeok jemok - Live", artist: "Beonyeok gasu" },
  };
  for (const mode of ["vinyl", "compact-vinyl"]) {
    const h = createHarness({ mode, visual: {
      "translate-metadata": true, "fullscreen-trim-title": true,
      "fullscreen-vinyl-track-change-animation": false,
      "fullscreen-vinyl-rotation-speed": 175,
      "fullscreen-cd-rotation-speed": 75,
      "reduce-motion": true,
    } });
    h.player.data.item.metadata.title = "Song (Remastered)";
    h.player.data.item.metadata.artist_name = "Artist [feat. Guest]";
    const track = () => elements(h.tree).find(node =>
      node.type === (mode === "vinyl" ? h.vinyl : h.vinyl.CompactAlbumVinyl)).props.track;
    const expected = {
      translated: ["번역 제목", "번역 가수"],
      romanized: ["Beonyeok jemok", "Beonyeok gasu"],
      "original-translated": ["Song / 번역 제목", "Artist / 번역 가수"],
      "original-romanized": ["Song / Beonyeok jemok", "Artist / Beonyeok gasu"],
      all: ["Song / 번역 제목 / Beonyeok jemok", "Artist / 번역 가수 / Beonyeok gasu"],
    };
    for (const [displayMode, labels] of Object.entries(expected)) {
      h.config.visual["translate-metadata-mode"] = displayMode;
      h.update({ trackUri: "spotify:track:one", translatedMetadata });
      assert.deepEqual([track().title, track().artist], labels);
    }
    h.config.visual["translate-metadata"] = false;
    h.update();
    assert.deepEqual([track().title, track().artist], ["Song", "Artist"]);
    h.config.visual["translate-metadata"] = true;
    h.config.visual["translate-metadata-mode"] = "translated";
    h.update({ translatedMetadata: null });
    assert.equal(track().title, "Song", "missing translation falls back to original");
    h.update({ trackUri: "spotify:track:previous", translatedMetadata });
    assert.equal(track().title, "Song", "previous-track translation must not enter the LP label");
    h.config.visual["fullscreen-trim-title"] = false;
    h.update({ trackUri: "spotify:track:one" });
    assert.equal(track().title, "번역 제목 (리마스터)");
    const stage = elements(h.tree).find(node => node.type === h.vinyl || node.type === h.vinyl.CompactAlbumVinyl);
    assert.equal(mode === "vinyl" ? stage.props.vinylSettings.rotationSpeed : stage.props.cdSettings.rotationSpeed, mode === "vinyl" ? 175 : 75);
    assert.equal(mode === "vinyl" ? stage.props.vinylSettings.reducedMotion : stage.props.reducedMotion, true);
    if (mode === "vinyl") assert.equal(stage.props.vinylSettings.trackChangeAnimation, false);
    h.unmount();
  }
});

test("the bottom placement renders its timeline inside the control surface", () => {
  const h = createHarness({ visual: {
    "fullscreen-controls-position": "bottom", "fullscreen-controls-background": true,
  } });
  const rows = () => [byClass(h.tree, "fullscreen-bottom").props.children]
    .flat().filter(child => child && typeof child === "object");
  const surface = () => rows().find(child => child.type?.name === "PlayerControls");
  assert.equal(rows().some(child => child.type?.name === "ProgressBar"), false,
    "the timeline is no longer a sibling of the surface");
  assert.equal(surface().props.showProgress, true, "the surface owns the timeline");
  assert.equal(surface().props.showBackground, true);
  assert.equal(Boolean(surface().props.progressOnly), false);
  h.config.visual["fullscreen-show-controls"] = false;
  h.update();
  assert.equal(surface().props.progressOnly, true, "a timeline-only bottom bar reuses the same surface");
  assert.equal(surface().props.showProgress, true);
  assert.equal(surface().props.showVolume, false);
  h.unmount();
});

test("the under-album controller owns its timeline instead of a sibling row", () => {
  const h = createHarness({ visual: { "fullscreen-controls-background": true } });
  const rows = () => [byClass(h.tree, "fullscreen-left-controls").props.children]
    .flat().filter(child => child && typeof child === "object");
  const surface = () => rows().find(child => child.type?.name === "PlayerControls");
  assert.equal(rows().some(child => child.type?.name === "ProgressBar"), false,
    "the timeline is no longer a sibling of the surface");
  assert.equal(surface().props.showProgress, true, "the surface owns the timeline");
  assert.equal(surface().props.progressOnly, undefined, "transport buttons still render");
  h.config.visual["fullscreen-show-controls"] = false;
  h.update();
  assert.equal(byClass(h.tree, "left-controls-progress-only") !== undefined, true,
    "a timeline-only album column keeps its own bare row");
  h.unmount();
});

test("CD settings reach only the compact presentation and stay independent of LP animation switches", () => {
  const h = createHarness({ mode: "compact-vinyl", visual: {
    "fullscreen-vinyl-animations": false, "fullscreen-vinyl-center-rotation": false,
    "fullscreen-cd-visualizer-enabled": true, "fullscreen-cd-visualizer-style": "line",
    "fullscreen-cd-visualizer-color-mode": "custom", "fullscreen-cd-visualizer-color": "#aabbcc",
    "fullscreen-cd-visualizer-sensitivity": 125, "fullscreen-cd-visualizer-density": 80,
    "fullscreen-cd-visualizer-thickness": 3, "fullscreen-cd-rotation-enabled": true,
    "fullscreen-cd-visualizer-mirror": true,
  } });
  const stage = () => elements(h.tree).find(node => node.type === h.vinyl.CompactAlbumVinyl);
  assert.equal(stage().props.animationsEnabled, true);
  assert.equal(stage().props.cdSettings.enabled, true);
  assert.equal(stage().props.cdSettings.style, "line");
  assert.equal(stage().props.cdSettings.customColor, "#aabbcc");
  assert.equal(stage().props.cdSettings.density, 80);
  assert.equal(stage().props.cdSettings.mirror, true);
  h.config.visual["fullscreen-cd-visualizer-style"] = "particles";
  h.config.visual["fullscreen-cd-visualizer-color-mode"] = "rainbow";
  h.update();
  assert.deepEqual([stage().props.cdSettings.style, stage().props.cdSettings.colorMode], ["particles", "rainbow"]);
  h.config.visual["fullscreen-cd-visualizer-mirror"] = "true";
  h.update();
  assert.equal(stage().props.cdSettings.mirror, false, "only a saved boolean enables mirroring");
  h.config.visual["fullscreen-cd-visualizer-style"] = "line";
  h.config.visual["fullscreen-cd-visualizer-color-mode"] = "custom";
  h.config.visual["fullscreen-cd-visualizer-enabled"] = false;
  h.update();
  assert.equal(stage().props.cdSettings.enabled, false);
  assert.equal(stage().props.cdSettings.style, "line", "turning off a spectrum retains its preferences");
  h.unmount();
});

test("CD frames are larger and reserve their full spectrum extent without changing normal album size", () => {
  const h = createHarness({ mode: "compact-vinyl", visual: { "fullscreen-cd-disc-size": 140 } });
  const wrapper = () => byClass(h.tree, "lyrics-fullscreen-album-container");
  assert.equal(wrapper().props.style["--iv-cd-slot-size"], "500px");
  assert.equal(wrapper().props.style.width, "500px");
  assert.ok(Math.abs(wrapper().props.style["--iv-cd-overflow"] - .172) < .000001);
  for (const size of [70, 100, "invalid"]) {
    h.config.visual["fullscreen-cd-disc-size"] = size;
    h.update();
    assert.equal(wrapper().props.style["--iv-cd-overflow"], 0);
    assert.equal(wrapper().props.style.width, "500px");
  }
  h.update({ presentationMode: "standard" });
  assert.equal(wrapper().props.style["--iv-cd-overflow"], undefined, "normal album layout remains untouched");
  assert.equal(wrapper().props.style.width, "400px");
  h.unmount();
});

test("CD hover hints and native tooltips are hidden in landscape and portrait while album gestures remain available", () => {
  for (const portrait of [false, true]) {
    const h = createHarness({ mode: "compact-vinyl", windowOverrides: {
      matchMedia: query => ({ matches: query.includes("orientation") && portrait, addEventListener() {}, removeEventListener() {} }),
    } });
    const wrapper = () => byClass(h.tree, "clickable-album-container");
    assert.equal(byClass(h.tree, "album-mode-hint"), undefined);
    assert.equal(wrapper().props.title, undefined);
    assert.match(wrapper().props["aria-label"], /vinyl.tmiHint/);
    assert.equal(wrapper().props.tabIndex, 0);
    for (const gesture of ["onClick", "onContextMenu", "onPointerDown", "onKeyDown"]) {
      assert.equal(typeof wrapper().props[gesture], "function", `${gesture} is retained`);
    }
    h.update({ presentationMode: "standard" });
    assert.ok(byClass(h.tree, "album-mode-hint"), "normal albums retain their existing hover hint");
    assert.match(wrapper().props.title, /vinyl.tmiHint/);
    h.unmount();
  }
});

test("album shortcut preference blocks pointer and keyboard entry without advertising the disabled action", () => {
  for (const portrait of [false, true]) {
    const changes = [];
    const h = createHarness({ visual: { "fullscreen-album-open-lp": false, "reduce-motion": true },
      windowOverrides: { matchMedia: query => ({ matches: query.includes("orientation") && portrait,
        addEventListener() {}, removeEventListener() {} }) },
    });
    h.update({ onPresentationModeChange: next => changes.push(next) });
    const album = () => byClass(h.tree, "clickable-album-container");
    const event = key => ({ key, preventDefault() {}, stopPropagation() {} });
    album().props.onClick(event());
    for (const key of ["Enter", " "]) album().props.onKeyDown(event(key));
    assert.deepEqual(changes, []);
    assert.doesNotMatch(album().props["aria-label"], /vinyl.openHint/);
    assert.match(album().props["aria-label"], /vinyl.tmiHint/);
    assert.equal(album().props.role, "img");
    assert.equal(album().props["aria-keyshortcuts"], "Shift+F10");
    assert.equal(elements(h.tree).some(node => node.props.className === "album-mode-action is-primary"), false);

    h.config.visual["fullscreen-album-open-lp"] = true;
    h.update();
    assert.match(album().props["aria-label"], /vinyl.openHint/);
    assert.equal(album().props.role, "button");
    album().props.onClick(event());
    assert.deepEqual(changes, ["vinyl"], "enabling the preference works without a page reload");
    h.unmount();
  }
});

test("disabled artwork entry preserves manual mode selection and cover exits for every focused mode", () => {
  for (const mode of ["vinyl", "compact-vinyl", "video"]) {
    const changes = [];
    const h = createHarness({ visual: { "fullscreen-album-open-lp": false, "reduce-motion": true } });
    h.update({ onPresentationModeChange: next => changes.push(next) });
    const switcher = elements(h.tree).find(node => node.type === h.vinyl.PresentationSwitcher);
    switcher.props.onChange(mode);
    assert.deepEqual(changes, [mode], "explicit menu entry remains enabled");
    h.update({ presentationMode: mode });
    const focused = elements(h.tree).find(node => node.type === h.vinyl);
    const album = mode === "compact-vinyl" ? byClass(h.tree, "clickable-album-container")
      : { props: focused.props.interactionProps };
    assert.equal(album.props.role, "button");
    assert.match(album.props["aria-label"], /vinyl.closeHint/);
    album.props.onClick();
    assert.deepEqual(changes, [mode, "standard"], "turning off the shortcut never traps an existing focused view");
    h.unmount();
  }
});

test("disabled album shortcut preserves context-menu and long-press Research gestures", () => {
  for (const gesture of ["context", "long-press"]) {
    let timer = 0;
    const timers = new Map();
    const h = createHarness({ visual: { "fullscreen-album-open-lp": false }, windowOverrides: {
      AIAddonManager: { getEnabledProvidersFor: () => [{}] },
      setTimeout(callback, delay) { timers.set(++timer, { callback, delay }); return timer; },
      clearTimeout(id) { timers.delete(id); },
    } });
    const album = byClass(h.tree, "clickable-album-container");
    if (gesture === "context") album.props.onKeyDown({ key: "F10", shiftKey: true,
      preventDefault() {}, stopPropagation() {} });
    else {
      album.props.onPointerDown({ button: 0, pointerId: 1, clientX: 10, clientY: 10 });
      const press = [...timers.values()].find(value => value.delay === 650);
      assert.ok(press, "the normal long-press interval remains available");
      press.callback();
    }
    h.update();
    assert.ok(elements(h.tree).some(node => typeof node.props.onAgree === "function"
      && typeof node.props.onCancel === "function"), "Research consent still opens");
    h.unmount();
  }
});

test("CD size fits short and narrow windows without changing the saved size or other presentations", () => {
  const h = createHarness({ mode: "compact-vinyl", visual: { "fullscreen-cd-disc-size": 140 },
    windowOverrides: { innerWidth: 1200, innerHeight: 720 } });
  const width = () => Number.parseFloat(byClass(h.tree, "lyrics-fullscreen-album-container").props.style.width);
  assert.ok(width() < 330 && width() > 300);
  assert.equal(h.config.visual["fullscreen-cd-disc-size"], 140);
  h.update({ presentationMode: "standard" });
  assert.equal(width(), 400);
  h.unmount();
});

test("app and OS reduce-motion both enter and exit CD immediately without snapshots or delayed closing", () => {
  for (const [appReduced, osReduced] of [[true, false], [false, true]]) {
    for (const mode of ["standard", "compact-vinyl"]) {
      const changes = [];
      const h = createHarness({ mode, visual: { "reduce-motion": appReduced, "fullscreen-focus-presentation": "compact-vinyl" },
        windowOverrides: {
          matchMedia: query => ({ matches: query.includes("prefers-reduced-motion") && osReduced, addEventListener() {}, removeEventListener() {} }),
          setTimeout() { assert.fail("reduced motion must not wait for a closing animation"); },
        },
        documentOverrides: { startViewTransition() { assert.fail("reduced motion must not create album snapshots"); } },
      });
      h.update({ onPresentationModeChange: next => changes.push(next) });
      byClass(h.tree, "lyrics-fullscreen-album-container").props.onClick();
      assert.deepEqual(changes, [mode === "standard" ? "compact-vinyl" : "standard"]);
      h.unmount();
    }
  }
});

test("leaving a CD during a shared transition handles the normal ready rejection on unmount", async () => {
  let rejectReady, finish;
  let skipped = false;
  const changes = [];
  const transition = {
    ready: new Promise((resolve, reject) => { rejectReady = reject; }),
    finished: new Promise(resolve => { finish = resolve; }),
    skipTransition() { skipped = true; rejectReady(new Error("Transition was skipped")); finish(); },
  };
  const h = createHarness({ mode: "compact-vinyl",
    windowOverrides: { ReactDOM: { flushSync: update => update() } },
    documentOverrides: {
      documentElement: { classList: { add() {}, remove() {} } },
      startViewTransition(update) { update(); return transition; },
    },
  });
  h.update({ onPresentationModeChange: next => changes.push(next) });
  byClass(h.tree, "clickable-album-container").props.onClick();
  assert.deepEqual(changes, ["standard"]);
  h.unmount();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(skipped, true);
});

test("all four fullscreen presentations share their handoff, including focused-to-focused changes", async () => {
  const modes = ["standard", "compact-vinyl", "vinyl", "video"];
  for (const from of modes) for (const to of modes) {
    const classes = new Set(), changes = [];
    let snapshots = 0, finish;
    const h = createHarness({ mode: from,
      windowOverrides: { ReactDOM: { flushSync: update => update() } },
      documentOverrides: {
        documentElement: { classList: {
          add: (...names) => names.forEach(name => classes.add(name)),
          remove: (...names) => names.forEach(name => classes.delete(name)),
        } },
        startViewTransition(update) {
          snapshots++;
          update();
          return { ready: Promise.resolve(), finished: new Promise(resolve => { finish = resolve; }), skipTransition() { finish(); } };
        },
      },
    });
    h.update({ onPresentationModeChange: next => changes.push(next) });
    const switcher = elements(h.tree).find(node => node.type === h.vinyl.PresentationSwitcher);
    const focused = elements(h.tree).find(node => node.type === h.vinyl);
    (switcher?.props.onChange || focused.props.onPresentationModeChange)(to);
    assert.deepEqual(changes, from === to ? [] : [to], `${from} -> ${to}: selected mode`);
    assert.equal(snapshots, from === to ? 0 : 1, `${from} -> ${to}: shared handoff`);
    if (from !== to) {
      const direction = to === "standard" ? "exit" : from === "standard" ? "enter" : "switch";
      assert.ok(classes.has(`is-lp-view-${direction}`), `${from} -> ${to}: direction`);
      finish();
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(classes.size, 0, "transition classes must not affect later frames");
    }
    h.unmount();
  }
});

test("rapid mode changes keep the latest selection and old completion cannot clear the new handoff", async () => {
  const classes = new Set(), transitions = [], changes = [];
  const h = createHarness({ mode: "compact-vinyl",
    windowOverrides: { ReactDOM: { flushSync: update => update() } },
    documentOverrides: {
      documentElement: { classList: {
        add: (...names) => names.forEach(name => classes.add(name)),
        remove: (...names) => names.forEach(name => classes.delete(name)),
      } },
      startViewTransition(update) {
        let finish;
        const transition = { ready: Promise.resolve(), finished: new Promise(resolve => { finish = resolve; }),
          skipped: false, finish: () => finish(), skipTransition() { this.skipped = true; finish(); } };
        transitions.push(transition);
        update();
        return transition;
      },
    },
  });
  h.update({ onPresentationModeChange: next => { changes.push(next); h.update({ presentationMode: next }); } });
  const choose = next => {
    const node = elements(h.tree).find(node => node.type === h.vinyl || node.type === h.vinyl.PresentationSwitcher);
    (node.props.onChange || node.props.onPresentationModeChange)(next);
  };
  choose("vinyl"); choose("video"); choose("compact-vinyl");
  assert.deepEqual(changes, ["vinyl", "video", "compact-vinyl"]);
  assert.equal(transitions[0].skipped, true);
  assert.equal(transitions[1].skipped, true);
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(classes.has("is-lp-view-switch"), "stale completion must not remove the active direction");
  transitions.at(-1).finish();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(classes.size, 0);
  h.unmount();
});

for (const mode of ["standard", "compact-vinyl"]) {
  test(`${mode} avoids root progress renders while preserving track metadata and playback state`, () => {
    const h = createHarness({ mode });
    const initialRenders = h.renders;
    for (let i = 0; i < 20; i++) h.tick();
    assert.equal(h.renders, initialRenders);
    assert.equal(h.progressReads, 0);
    assert.equal(elements(h.tree).find((node) => node.type?.name === "PlayerControls")?.props.showProgress, true,
      "progress remains owned by an existing child");

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

test("fullscreen research opens with the complete cache identity of a local file", () => {
  const requests = [];
  const h = createHarness({ mode: "vinyl", windowOverrides: {
    localStorage: { getItem: () => "true" },
    AIAddonManager: { getEnabledProvidersFor: () => [{}] },
    SongInfoTMI: { fetchSongInfo(trackId, regenerate) {
      requests.push([trackId, regenerate]);
      return Promise.resolve(null);
    } },
    setTimeout: () => 1, clearTimeout() {},
  } });
  const uri = "spotify:local:Artist:Album:Road:180";
  h.player.data.item.uri = uri;
  h.update({ trackUri: uri });
  const stage = elements(h.tree).find(node => node.type === h.vinyl);
  stage.props.interactionProps.onContextMenu({ preventDefault() {}, stopPropagation() {} });
  assert.deepEqual(requests, [[`local-uri:${uri}`, false]]);
  h.unmount();
});

test("Research closes its stream and restores its repeat change as soon as playback moves", async () => {
  const requests = [];
  const h = createHarness({ mode: "vinyl", windowOverrides: {
    setTimeout: () => 1, clearTimeout() {},
    localStorage: { getItem: () => "true" },
    AIAddonManager: { getEnabledProvidersFor: () => [{}] },
    SongInfoTMI: { fetchSongInfo(trackId, _regenerate, options) {
      const operation = Promise.withResolvers();
      requests.push({ trackId, ...options, ...operation });
      return operation.promise;
    } },
  } });
  h.update({ trackUri: "spotify:track:one" });
  const stage = () => elements(h.tree).find(node => node.type === h.vinyl);
  const open = () => stage().props.interactionProps.onContextMenu({ preventDefault() {}, stopPropagation() {} });
  open();
  h.flush();
  assert.equal(h.player.repeat, 2);
  assert.equal(stage(), undefined);
  const [old] = requests;
  h.player.data.item.uri = "spotify:track:two";
  h.emit("songchange");
  assert.equal(old.signal.aborted, true);
  assert.equal(h.player.repeat, 0);
  assert.ok(stage());
  h.update({ trackUri: "spotify:track:two" });
  open();
  h.flush();
  assert.equal(requests.length, 2);
  old.onProgress({ title: "Old chunk" });
  old.resolve({ title: "Old final" });
  await Promise.resolve();
  h.flush();
  assert.equal(elements(h.tree).some(node => node.props.info?.title === "Old final"), false);
  h.player.repeat = 1;
  h.update({ isFullscreen: false });
  assert.equal(requests[1].signal.aborted, true);
  assert.equal(h.player.repeat, 1);
  h.unmount();
});

for (const mode of ["vinyl", "video"]) {
  test(`${mode} reports the actual focused lyric surface and restores TV/research/standard pages`, () => {
    const changes = [];
    const h = createHarness({ mode, windowOverrides: {
      localStorage: { getItem: () => "true" },
      AIAddonManager: { getEnabledProvidersFor: () => [{}] },
      SongInfoTMI: { fetchSongInfo: () => new Promise(() => {}) },
      setTimeout: () => 1, clearTimeout() {},
    } });
    h.update({ onFocusedLyricsChange: active => changes.push(active), trackUri: "spotify:track:one" });
    assert.deepEqual(changes, [true]);
    h.tick();
    assert.deepEqual(changes, [true], "clock updates must not notify unchanged visibility");
    h.config.visual["fullscreen-tv-mode"] = true;
    h.update();
    assert.equal(changes.at(-1), false);
    h.config.visual["fullscreen-tv-mode"] = false;
    h.update();
    assert.equal(changes.at(-1), true);
    const stage = elements(h.tree).find(node => node.type === h.vinyl);
    stage.props.interactionProps.onContextMenu({ preventDefault() {}, stopPropagation() {} });
    h.update();
    assert.equal(changes.at(-1), false, "research shows the regular lyrics beside its panel");
    h.update({ isFullscreen: false });
    assert.equal(changes.at(-1), false);
    h.unmount();
  });

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
  const progress = () => elements(h.tree).find(node => node.type?.name === "TvProgress");
  const renderProgress = () => progress().type(progress().props);
  const startRenders = h.renders;
  const localProgress = [];
  const unsubscribe = progress().props.tvPlayhead.subscribe(({ position, duration }) => localProgress.push([position, duration]));
  h.tick(45000);
  assert.equal(h.renders, startRenders, "the stage and metadata do not render on a playback-only tick");
  assert.deepEqual(localProgress, [[45000, 180000]], "only the TV progress subscribers receive a playback-only tick");
  assert.equal(text(byClass(renderProgress(), "current")), "0:45");
  assert.equal(byClass(renderProgress(), "fullscreen-tv-progress-fill").props.style.width, "25%");
  const clickAt = (clientX, width = 200) => byClass(renderProgress(), "fullscreen-tv-progress-bar").props.onClick({
    currentTarget: { getBoundingClientRect: () => ({ left: 10, width }) }, clientX,
  });
  h.player.data.item.metadata.duration_ms = "180000";
  h.emit("songchange");
  assert.equal(h.renders, startRenders, "duration updates stay with the progress bar");
  assert.deepEqual(localProgress.at(-1), [45000, "180000"]);
  clickAt(110);
  assert.equal(h.player.lastSeek, 90000);
  clickAt(110, 0);
  assert.equal(h.player.lastSeek, 90000, "a zero-width bar cannot seek");
  clickAt(0);
  assert.equal(h.player.lastSeek, 0, "negative pointer offsets seek to the start");
  clickAt(220);
  assert.equal(h.player.lastSeek, 180000, "pointer offsets beyond the end seek to the end");
  h.player.data.isPaused = true;
  h.emit("onplaypause");
  const pausedPath = elements(byClass(h.tree, "play-pause")).find((node) => node.type === "path").props.d;
  assert.match(pausedPath, /^M3 1\.713/);
  h.config.visual["fullscreen-tv-show-progress"] = false;
  h.update();
  const hiddenProgressRenders = h.renders;
  const hiddenProgressReads = h.progressReads;
  h.tick(50000);
  assert.equal(h.renders, hiddenProgressRenders);
  assert.equal(h.progressReads, hiddenProgressReads);
  assert.deepEqual(localProgress, [[45000, 180000], [45000, "180000"]]);
  assert.equal(progress(), undefined);
  h.config.visual["fullscreen-tv-show-progress"] = true;
  h.update();
  assert.equal(text(byClass(renderProgress(), "current")), "0:50");
  assert.equal(h.intervalCount, 1);
  assert.equal(h.listenerCount, 2);
  unsubscribe();
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
