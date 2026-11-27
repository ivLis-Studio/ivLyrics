import { isLyricFuriganaReady, readLyricRenderingLocale } from "#ivlyrics/lyrics/lyricsTextRuntime.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { createLyricsScrollGeometry } from "../src/lyrics/lyricsScrollGeometry.mjs";
import { syncCompactLyricsViewport } from "../src/lyrics/syncedLyricsViewport.mjs";
import { createLyricsTrackRevealHook, playLyricsTrackReveal } from "../src/lyrics/lyricsTrackReveal.mjs";
import { createSyncedLyricsPages } from "../src/lyrics/createSyncedLyricsPages.mjs";

const source = readFileSync(new URL("../src/lyrics/Pages.js", import.meta.url), "utf8");
const section = (start, end) => {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `missing source section: ${start}`);
  return source.slice(from, to);
};
const serial = value => JSON.parse(JSON.stringify(value));

function eventSurface() {
  const listeners = new Map();
  return {
    addEventListener(type, callback, options) {
      const entries = listeners.get(type) || new Map();
      entries.set(callback, options);
      listeners.set(type, entries);
    },
    removeEventListener(type, callback) { listeners.get(type)?.delete(callback); },
    dispatch(type) {
      for (const [callback, options] of [...(listeners.get(type) || [])]) {
        if (options?.once) listeners.get(type).delete(callback);
        callback({ type });
      }
    },
    listenerCount() {
      return [...listeners.values()].reduce((total, entries) => total + entries.size, 0);
    },
  };
}

function makeRow(id, top, options = {}) {
  const animations = [];
  const row = {
    id,
    animations,
    classList: { contains: name => options.padding && name.endsWith("-paddingLine") },
    getAttribute: name => name === "aria-hidden" && options.hidden ? "true" : null,
    getBoundingClientRect: () => ({
      top, bottom: top + (options.height ?? 30), height: options.height ?? 30,
      width: options.width ?? 400,
    }),
    animate(frames, timing) {
      const animation = {
        ...eventSurface(), frames: serial(frames), timing: serial(timing), cancelled: false,
        cancel() { this.cancelled = true; },
      };
      animations.push(animation);
      return animation;
    },
  };
  if (options.noAnimation) delete row.animate;
  return row;
}

function makePage(rows = [makeRow("first", 100), makeRow("second", 200)]) {
  return {
    ...eventSurface(), rows, isConnected: true,
    getBoundingClientRect: () => ({ top: 0, bottom: 600, height: 600, width: 800 }),
    querySelectorAll(selector) {
      assert.equal(selector, ".lyrics-lyricsContainer-LyricsLine");
      return this.rows;
    },
  };
}

function createRevealHarness(page = makePage()) {
  const refs = [];
  const effects = [];
  const frames = new Map();
  const pendingEffects = [];
  const player = eventSurface();
  const motionQuery = eventSurface();
  const window = { ...eventSurface(), matchMedia: () => motionQuery };
  let refIndex = 0, effectIndex = 0, nextFrame = 0, reduced = false;
  const react = {
    useRef(initial) { return refs[refIndex++] ??= { current: initial }; },
    useLayoutEffect(callback, dependencies) {
      const index = effectIndex++;
      const previous = effects[index];
      if (previous && dependencies.every((value, i) => Object.is(value, previous.dependencies[i]))) return;
      pendingEffects.push(() => {
        previous?.cleanup?.();
        effects[index] = { dependencies, cleanup: callback() };
      });
    },
  };
  const useLyricsTrackReveal = createLyricsTrackRevealHook({
    react, host: window, readPlayer: () => player, prefersReducedMotion: () => reduced,
    requestFrame(callback) { const id = ++nextFrame; frames.set(id, callback); return id; },
    cancelFrame(id) { frames.delete(id); },
  });
  const pageRef = { current: page };
  return {
    page, pageRef, player, window, motionQuery, frames,
    play: playLyricsTrackReveal,
    render(key, hasLyrics = true) {
      refIndex = effectIndex = 0;
      useLyricsTrackReveal(pageRef, key, hasLyrics);
      while (pendingEffects.length) pendingEffects.shift()();
    },
    flushFrame() {
      const callbacks = [...frames.values()];
      frames.clear();
      callbacks.forEach(callback => callback(1000));
    },
    reduceMotion(value) { reduced = value; },
    unmount() { effects.forEach(effect => effect.cleanup?.()); effects.length = 0; },
    animations: () => page.rows.flatMap(row => row.animations),
  };
}

test("track reveal excludes padding, hidden and offscreen rows before assigning top-to-bottom stagger", () => {
  const rows = [
    makeRow("bottom", 400), makeRow("padding", 20, { padding: true }),
    makeRow("hidden", 40, { hidden: true }), makeRow("above", -40),
    makeRow("below", 600), makeRow("zero-height", 60, { height: 0 }),
    makeRow("zero-width", 80, { width: 0 }), makeRow("top", 100), makeRow("middle", 200),
  ];
  const h = createRevealHarness(makePage(rows));
  h.play(h.page);
  const animated = rows.filter(row => row.animations.length);
  assert.deepEqual(animated.map(row => row.id).sort(), ["bottom", "middle", "top"]);
  assert.deepEqual(["top", "middle", "bottom"].map(id =>
    rows.find(row => row.id === id).animations[0].timing.delay), [0, 26, 52]);
});

test("track reveal bounds animation work to twelve visible rows and preserves existing transform and scale", () => {
  const rows = Array.from({ length: 40 }, (_, index) => makeRow(`row-${index}`, index * 10));
  const h = createRevealHarness(makePage(rows));
  const cancel = h.play(h.page);
  assert.equal(h.animations().length, 12);
  for (const animation of h.animations()) {
    assert.equal(animation.timing.fill, "backwards", "the finished effect must not pin a transform layer");
    assert.ok(animation.timing.delay <= 170);
    for (const frame of animation.frames) {
      assert.equal("transform" in frame, false, "centering owns the row transform");
      assert.equal("scale" in frame, false, "entrance must not alter vocal anchor geometry");
      assert.ok(Object.keys(frame).every(key => ["translate", "offset"].includes(key)));
    }
  }
  const first = h.animations()[0];
  first.dispatch("finish");
  assert.equal(first.cancelled, true, "finished effects are removed");
  assert.equal(h.animations()[1].cancelled, false, "finishing one row must not stop its neighbours");
  cancel();
  assert.ok(h.animations().every(animation => animation.cancelled));
});

test("hidden or reduced-motion pages do not start reveal animations", () => {
  const h = createRevealHarness();
  h.reduceMotion(true);
  h.render("reduced");
  h.flushFrame();
  assert.equal(h.animations().length, 0);
  assert.equal(h.player.listenerCount(), 0);
  h.reduceMotion(false);
  h.page.getBoundingClientRect = () => ({ top: 0, bottom: 0, height: 0, width: 800 });
  assert.equal(h.play(h.page), null);
  assert.equal(h.animations().length, 0);
});

test("track reveal waits for the committed frame and does not restart for late lyrics on the same track", () => {
  const h = createRevealHarness();
  h.render(null);
  h.render("A", false);
  assert.equal(h.frames.size, 0);
  h.render("A", true);
  assert.equal(h.frames.size, 1);
  assert.equal(h.animations().length, 0, "the centering effects must finish first");
  h.flushFrame();
  const before = h.animations();
  h.page.rows.push(makeRow("late-translation-or-window-row", 300));
  h.render("A", true);
  h.flushFrame();
  assert.deepEqual(h.animations(), before);
  h.render("A", false);
  assert.ok(before.every(animation => animation.cancelled));
  h.render("A", true);
  h.flushFrame();
  assert.equal(h.animations().length, before.length, "a temporary presentation update is not a new track");
});

test("new track cancels the previous reveal and unmount removes every listener", () => {
  const h = createRevealHarness();
  h.render("A");
  h.flushFrame();
  const oldAnimations = h.animations();
  h.render("B");
  assert.ok(oldAnimations.every(animation => animation.cancelled));
  assert.equal(h.frames.size, 1);
  assert.equal(h.player.listenerCount(), 1);
  h.flushFrame();
  assert.equal(h.animations().length, oldAnimations.length * 2);
  h.unmount();
  assert.ok(h.animations().every(animation => animation.cancelled));
  assert.equal(h.frames.size, 0);
  for (const target of [h.page, h.player, h.window, h.motionQuery]) assert.equal(target.listenerCount(), 0);
});

test("a finished reveal releases every cancellation listener without waiting for another track", () => {
  const h = createRevealHarness();
  h.render("A");
  h.flushFrame();
  const [first, second] = h.animations();
  first.dispatch("finish");
  assert.equal(h.player.listenerCount(), 1);
  second.dispatch("finish");
  for (const target of [h.page, h.player, h.window, h.motionQuery]) assert.equal(target.listenerCount(), 0);
  assert.equal(first.cancelled && second.cancelled, true);
  h.render("A");
  assert.equal(h.frames.size, 0);
  h.unmount();
});

for (const [surface, event] of [["player", "onseek"], ["page", "pointerdown"], ["page", "wheel"],
  ["window", "ivLyrics"], ["motionQuery", "change"]]) {
  for (const beforeFrame of [true, false]) {
    test(`${event} cancels ${beforeFrame ? "scheduled" : "running"} track reveal`, () => {
      const h = createRevealHarness();
      h.render("A");
      if (!beforeFrame) h.flushFrame();
      const startedCount = h.animations().length;
      h[surface].dispatch(event);
      h.flushFrame();
      assert.equal(h.frames.size, 0);
      assert.equal(h.animations().length, startedCount, "cancelled work must not start on a later frame");
      assert.ok(h.animations().every(animation => animation.cancelled));
      for (const target of [h.page, h.player, h.window, h.motionQuery]) assert.equal(target.listenerCount(), 0);
      h.render("A");
      h.flushFrame();
      assert.equal(h.animations().length, startedCount, "ordinary playback must not replay a cancelled entrance");
      h.unmount();
    });
  }
}

test("queued reveal cannot run against a detached or replaced lyric page", () => {
  for (const action of ["detach", "replace", "unmount"]) {
    const h = createRevealHarness();
    h.render("A");
    if (action === "detach") h.page.isConnected = false;
    else if (action === "replace") h.pageRef.current = makePage();
    else h.unmount();
    h.flushFrame();
    assert.equal(h.animations().length, 0, action);
    h.unmount();
  }
});

function createCompactOffsetHarness({ isScrolling = false, compact = true, height = 600, scrollTop = 0 } = {}) {
  const container = { clientHeight: height, scrollTop };
  const activeLine = {};
  const trace = [];
  let offset = 240;
  const options = {
    compact, isScrolling,
    containerRef: { current: container },
    activeLineRef: { current: activeLine },
    layoutObserverRef: { current: { cancelPending() { trace.push(["cancel-observer"]); } } },
    setCompactOffset(next) {
      offset = typeof next === "function" ? next(offset) : next;
      trace.push(["offset", offset]);
    },
    getCompactSyncedOffset(measuredContainer, measuredLine, manual) {
      assert.equal(measuredContainer, container);
      assert.equal(measuredLine, activeLine);
      trace.push(["measure", measuredContainer.scrollTop, manual]);
      return manual ? 0 : 280;
    },
  };
  return { container, trace, sync: () => syncCompactLyricsViewport(options), get offset() { return offset; } };
}

test("compact auto-follow clears native scroll before measuring its transform offset", () => {
  for (const scrollTop of [384, -12, 0]) {
    const h = createCompactOffsetHarness({ scrollTop });
    h.sync();
    assert.equal(h.container.scrollTop, 0, "native scrolling must not displace already-centered rows");
    assert.deepEqual(h.trace, [["cancel-observer"], ["measure", 0, false], ["offset", 280]],
      "an observer queued before native scrolling is consumed before the corrected measurement");
    assert.equal(h.offset, 280);
  }
});

test("compact centering reads the container height once for visibility and anchor geometry", () => {
  let heightReads = 0;
  const container = { scrollTop: 28, get clientHeight() { heightReads++; return 600; } };
  const activeLine = { offsetTop: 170, offsetParent: container, clientHeight: 60 };
  const { getCompactSyncedOffset } = createLyricsScrollGeometry(() => ({ getPropertyValue: () => "0.6" }));
  let offset = 0;
  syncCompactLyricsViewport({
    compact: true, isScrolling: false,
    containerRef: { current: container }, activeLineRef: { current: activeLine },
    layoutObserverRef: { current: null }, getCompactSyncedOffset,
    setCompactOffset(update) { offset = update(offset); },
  });
  assert.equal(container.scrollTop, 0);
  assert.equal(heightReads, 1);
  assert.equal(offset, 160);
});

test("manual lyric scrolling keeps its native scroll position when compact offset updates", () => {
  const h = createCompactOffsetHarness({ isScrolling: true, scrollTop: 384 });
  h.sync();
  assert.equal(h.container.scrollTop, 384);
  assert.equal(h.offset, 240, "native scrolling preserves the existing transform origin");
  assert.deepEqual(h.trace, []);
});

test("hidden compact pages preserve measured offset until a visible layout can be measured", () => {
  const h = createCompactOffsetHarness({ height: 0, scrollTop: 384 });
  h.sync();
  h.sync();
  assert.equal(h.offset, 240, "zero-height geometry must not overwrite the previous valid anchor");
  assert.deepEqual(h.trace, [["cancel-observer"], ["cancel-observer"]]);
  h.container.clientHeight = 600;
  h.sync();
  assert.equal(h.container.scrollTop, 0);
  assert.equal(h.offset, 280, "showing the page resumes centering using visible geometry");
});

test("expanded page offset synchronization leaves native scrolling untouched", () => {
  const h = createCompactOffsetHarness({ compact: false, scrollTop: 384 });
  h.sync();
  assert.equal(h.container.scrollTop, 384);
  assert.equal(h.offset, 0);
  assert.deepEqual(h.trace, [["offset", 0]], "expanded mode must not perform compact geometry work");
});

function loadPageRenderers() {
  const createElement = (type, props, ...children) => ({ type, props: props || {}, children });
  const context = vm.createContext({
    react: {
      memo: component => component, createElement,
      useRef: initial => ({ current: initial }),
      useState: initial => [initial, () => {}],
      useCallback: callback => callback,
      useMemo: callback => callback(),
      useEffect() {},
    },
    useRef: initial => ({ current: initial }),
    useMemo: callback => callback(),
    useLyricsTrackReveal() {},
    useLyricsPlaybackPosition: () => 3000,
    getPseudoKaraokeRenderAdvance: () => 0,
    isLyricFuriganaReady, readLyricRenderingLocale,
    useSyncedLyricsEngine: () => ({
      isScrolling: false, handleContainerClick() {}, renderItems: [], compactOffset: 320,
    }),
    renderLyricsItems: () => [],
    CONFIG: { visual: {} },
    window: {},
    I18n: { t: value => value },
    SearchBar() {}, LyricsLineBlock() {}, LyricsBackdropLayer() {},
    normalizeUnsyncedLyrics: lyrics => lyrics,
    getEmbeddedAuxiliaryDisplayValues: line => ({ originalText: line.text }),
    getUnsyncedLineRenderData: (_lyrics, _text, originalText) => ({ lineText: originalText }),
    getUtils: () => ({ formatLyricLineToCopy: line => line }),
  });
  vm.runInContext(
    section("const UnsyncedLyricsPage", "const { renderLyricsUnavailable")
    + "\nglobalThis.UnsyncedLyricsPage = UnsyncedLyricsPage;",
    context,
  );
  return {
    ...createSyncedLyricsPages({
      ...context, translate: key => key, prefersReducedLyricsMotion: () => false,
      readKaraokeLineTransition: () => false,
    }),
    UnsyncedLyricsPage: context.UnsyncedLyricsPage,
  };
}

for (const name of ["SyncedLyricsPage", "SyncedExpandedLyricsPage", "UnsyncedLyricsPage"]) {
  test(`${name} keeps DOM reconciliation keys stable when reveal readiness changes`, () => {
    const component = loadPageRenderers()[name];
    const lyrics = [{ text: "same opening line", startTime: 0 }, { text: "next line", startTime: 4000 }];
    const identity = node => ({
      type: typeof node.type === "function" ? node.type.name : node.type,
      key: node.props.key ?? null,
      children: node.children.filter(child => child && typeof child === "object").map(identity),
    });
    const render = trackRevealKey => component({ lyrics, trackRevealKey });
    const initial = serial(identity(render(null)));
    for (const key of [1, null, 2, 2]) {
      const next = render(key);
      assert.deepEqual(serial(identity(next)), initial, "entrance must not remount rows or the scroll root");
      assert.doesNotMatch(next.props.className, /lyrics-track-enter/,
        "persistent CSS entrance would animate later virtual rows and translations");
    }
  });
}

for (const name of ["SyncedLyricsPage", "SyncedExpandedLyricsPage"]) {
  test(`${name}: supplements do not change page identity, but a real track change does`, () => {
    const component = loadPageRenderers()[name];
    const key = tree => name === "SyncedLyricsPage" ? tree.children[0].props.key : tree.props.key;
    const base = [{ text: "original", originalText: "original", startTime: 1000 }];
    const first = key(component({ lyrics: base, trackUri: "spotify:track:first" }));
    const translated = [{ ...base[0], text: "reading", text2: "meaning", culturalNote: [{ note: "context" }] }];
    assert.equal(key(component({ lyrics: translated, trackUri: "spotify:track:first", trackRevealKey: "ready" })), first);
    assert.notEqual(key(component({ lyrics: translated, trackUri: "spotify:track:second" })), first);
    assert.equal(key(component({ lyrics: translated })), key(component({ lyrics: base })),
      "source-only previews use the original text, not a generated pronunciation");
  });
}

test("a queued auto-follow callback cannot reset the first manual wheel before React commits", () => {
  const h = createCompactOffsetHarness({ scrollTop: 1200 });
  h.container.classList = { contains: name => name === "scrolling-active" };
  h.sync();
  assert.equal(h.container.scrollTop, 1200);
  assert.equal(h.offset, 240);
  assert.deepEqual(h.trace, []);
});
