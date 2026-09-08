import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../VinylActiveLyricRenderer.js", import.meta.url), "utf8");
const OVERFLOW = "is-vinyl-lyric-overflowing";
const MEASURING = "is-vinyl-lyric-measuring";

const classList = (...initial) => {
  const values = new Set(initial);
  return {
    add: (...names) => names.forEach(name => values.add(name)),
    remove: (...names) => names.forEach(name => values.delete(name)),
    contains: name => values.has(name),
  };
};

const createRow = ({ width = 300, naturalWidth = 600, direction = "ltr" } = {}) => {
  const viewport = {
    classList: classList("ivlyrics-vinyl-lyric-scroll-viewport"),
    clientWidth: width,
    naturalWidth,
    direction,
    querySelector: () => content,
  };
  // A wrapped baseline measures only the available width. The production hook
  // must temporarily request the natural width before choosing to scroll.
  const measuredWidth = () => viewport.classList.contains(OVERFLOW)
    ? viewport.naturalWidth + 40
    : viewport.classList.contains(MEASURING)
      ? viewport.naturalWidth
      : Math.min(viewport.clientWidth, viewport.naturalWidth);
  const content = {
    classList: classList("ivlyrics-vinyl-lyric-scroll-content"),
    style: { transform: "" },
    parentElement: viewport,
    get scrollWidth() { return measuredWidth(); },
    getBoundingClientRect: () => ({ width: measuredWidth() }),
  };
  return { viewport, content };
};

const createHarness = ({ rows = [{}], reducedMotion = false, ...initialProps } = {}) => {
  const slots = [];
  const frames = new Map();
  const mediaListeners = new Set();
  const observers = new Set();
  const lyricRows = rows.map(createRow);
  let cursor = 0;
  let nextFrame = 0;
  let effects = [];
  let tree;
  let props = {
    lyrics: [{ text: "A long original lyric", startTime: 1000, endTime: 11000 }],
    positionOverride: 6000,
    ...initialProps,
  };
  const root = {
    isConnected: true,
    parentElement: { scrollTop: 0 },
    viewports: [],
    querySelectorAll: () => root.viewports,
  };
  const sameDeps = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const useMemo = (factory, deps) => {
    const index = cursor++;
    if (!slots[index] || !sameDeps(slots[index].deps, deps)) slots[index] = { value: factory(), deps };
    return slots[index].value;
  };
  const react = {
    memo: component => component,
    useMemo,
    useRef: current => useMemo(() => ({ current }), []),
    useLayoutEffect: (effect, deps) => {
      const index = cursor++;
      if (!slots[index] || !sameDeps(slots[index].deps, deps)) {
        effects.push(() => {
          slots[index]?.cleanup?.();
          slots[index] = { deps, cleanup: effect() };
        });
      }
    },
    createElement: (type, elementProps, ...children) => ({ type, props: { ...elementProps, children } }),
  };
  const LyricsLineBlock = () => null;
  const media = {
    matches: reducedMotion,
    addEventListener: (_, callback) => mediaListeners.add(callback),
    removeEventListener: (_, callback) => mediaListeners.delete(callback),
  };
  class Observer {
    constructor(callback) { this.callback = callback; observers.add(this); }
    observe() {}
    disconnect() { observers.delete(this); }
  }
  const context = vm.createContext({
    Spicetify: { React: react },
    window: {
      ivLyricsLyricRendererPrimitives: {
        LyricsLineBlock,
        IdlingIndicator: () => null,
        useLyricsPlaybackPosition: () => 6000,
        getPseudoKaraokeRenderAdvance: () => 0,
        prepareGlobalCharTimeline: () => null,
        EMPTY_GLOBAL_CHAR_STATE: { globalCharOffsets: [], activeGlobalCharIndex: -1 },
        getInterludeInfo: () => ({ isInterlude: false }),
        createActiveTrailingKaraokeInterludeLine: () => null,
        getEmbeddedAuxiliaryDisplayValues: line => line,
        buildLyricDisplayState: (_isKara, line) => ({ mainText: line.text }),
        getKaraokeLineMetaClass: () => "",
        getKaraokeSpeakerStyle: () => ({}),
      },
      matchMedia: () => media,
      getComputedStyle: element => ({ direction: element.direction }),
      requestAnimationFrame: callback => { frames.set(++nextFrame, callback); return nextFrame; },
      cancelAnimationFrame: id => frames.delete(id),
      ResizeObserver: Observer,
      MutationObserver: Observer,
    },
    document: {},
    console,
  });
  vm.runInContext(source, context);
  const flushFrames = () => {
    let passes = 0;
    while (frames.size) {
      assert.ok(++passes < 10, "overflow measurement must settle");
      const scheduled = [...frames.values()];
      frames.clear();
      scheduled.forEach(callback => callback());
    }
  };
  const render = nextProps => {
    props = { ...props, ...nextProps };
    cursor = 0;
    effects = [];
    tree = context.window.ivLyricsActiveLyricLineRenderer(props);
    if (tree?.props.ref) tree.props.ref.current = root;
    const line = tree?.props.children.find(child => child?.type === LyricsLineBlock);
    root.viewports = line?.props.singleLineScroll ? lyricRows.map(row => row.viewport) : [];
    effects.forEach(effect => effect());
    flushFrames();
    return tree;
  };
  render({});
  return {
    rows: lyricRows,
    scrollArea: root.parentElement,
    render,
    setReducedMotion(matches) {
      media.matches = matches;
      [...mediaListeners].forEach(callback => callback({ matches }));
      flushFrames();
    },
    notifyLayoutChange() {
      [...observers].forEach(observer => observer.callback());
      flushFrames();
    },
    unmount() {
      slots.forEach(slot => slot?.cleanup?.());
      root.isConnected = false;
      assert.equal(frames.size, 0, "unmount cancels queued measurement");
      assert.equal(observers.size, 0, "unmount disconnects observers");
      assert.equal(mediaListeners.size, 0, "unmount removes motion preference listener");
    },
  };
};

const assertWrapped = row => {
  assert.equal(row.viewport.classList.contains(OVERFLOW), false, "wrapped text must have no clipping mask");
  assert.equal(row.viewport.classList.contains(MEASURING), false, "natural-width measurement must not persist");
  assert.equal(row.content.style.transform, "", "wrapped text must have no retained scroll offset");
};
const assertScrolling = (row, offset) => {
  assert.equal(row.viewport.classList.contains(OVERFLOW), true);
  assert.equal(row.viewport.classList.contains(MEASURING), false);
  assert.equal(row.content.style.transform, `translate3d(${offset.toFixed(3)}px, 0, 0)`);
};

test("timed original and auxiliary rows retain hold, traversal, end hold, and RTL direction", () => {
  const h = createHarness({ rows: [
    { naturalWidth: 600 },
    { naturalWidth: 400, direction: "rtl" },
    { naturalWidth: 200 },
  ] });
  for (const [positionOverride, progress] of [[1000, 0], [4000, 0], [6000, 0.5], [8000, 1], [11000, 1]]) {
    h.render({ positionOverride });
    assertScrolling(h.rows[0], -340 * progress);
    assertScrolling(h.rows[1], 140 * progress);
    assertWrapped(h.rows[2]);
  }
  // Seeking back restores the beginning, rather than continuing a wall-clock marquee.
  h.render({ positionOverride: 2000 });
  assertScrolling(h.rows[0], 0);
  h.unmount();
  h.rows.forEach(assertWrapped);
});

test("disabling and restoring LP animations clears clipping and resumes at current progress", () => {
  const h = createHarness();
  assertScrolling(h.rows[0], -170);
  h.render({ motionEnabled: false });
  assertWrapped(h.rows[0]);
  h.render({ positionOverride: 8000 });
  assertWrapped(h.rows[0]);
  h.render({ motionEnabled: true });
  assertScrolling(h.rows[0], -340);
  h.unmount();
});

test("OS reduced motion wraps immediately and can be toggled without a React render", () => {
  const h = createHarness({ reducedMotion: true });
  assertWrapped(h.rows[0]);
  h.setReducedMotion(false);
  assertScrolling(h.rows[0], -170);
  h.setReducedMotion(true);
  assertWrapped(h.rows[0]);
  h.unmount();
});

test("missing or invalid line intervals remain wrapped and recover when timing arrives", () => {
  for (const endTime of [undefined, NaN, 1000, 500]) {
    const h = createHarness({ lyrics: [{ text: "Long lyric", startTime: 1000, endTime }] });
    assertWrapped(h.rows[0]);
    // Same index, start time and settings revision: end-time correction must remeasure.
    h.render({ lyrics: [{ text: "Long lyric", startTime: 1000, endTime: 11000 }] });
    assertScrolling(h.rows[0], -170);
    h.render({ lyrics: [{ text: "Long lyric", startTime: 1000 }] });
    assertWrapped(h.rows[0]);
    h.unmount();
  }
});

test("switching to wrapped video or plain fallback presentation drops old scroll state", () => {
  const h = createHarness();
  assertScrolling(h.rows[0], -170);
  h.render({ singleLineScroll: false });
  assertWrapped(h.rows[0]);
  h.render({ positionOverride: 8000, singleLineScroll: true });
  assertScrolling(h.rows[0], -340);
  h.unmount();
});

test("resizing or replacing text clears obsolete overflow and later detects longer content", () => {
  const h = createHarness();
  const row = h.rows[0];
  row.viewport.clientWidth = 800;
  h.notifyLayoutChange();
  assertWrapped(row);
  row.viewport.clientWidth = 300;
  h.notifyLayoutChange();
  assertScrolling(row, -170);
  row.viewport.naturalWidth = 250;
  h.notifyLayoutChange();
  assertWrapped(row);
  row.viewport.naturalWidth = 800;
  h.notifyLayoutChange();
  assertScrolling(row, -270);
  h.unmount();
});

test("hidden and near-fitting rows do not retain measurement or mask classes", () => {
  const h = createHarness({ rows: [{ width: 0 }, { naturalWidth: 300.5 }] });
  h.rows.forEach(assertWrapped);
  h.unmount();
});

test("wrapped lyrics preserve manual scrolling within a line and reset after delayed arrival or line change", () => {
  // Keep valid fallback timing before and after arrival so mounting the first
  // startTime:0 lyric must initialize the hook independently of timing changes.
  const h = createHarness({ lyrics: [], durationMs: 20000, motionEnabled: false });
  assert.equal(h.render({}), null);
  h.scrollArea.scrollTop = 80;
  h.render({ lyrics: [
    { text: "First long wrapped lyric", startTime: 0, endTime: 10000 },
    { text: "Second long wrapped lyric", startTime: 10000, endTime: 20000 },
  ] });
  assert.equal(h.scrollArea.scrollTop, 0, "delayed lyrics initialize at their beginning");
  assertWrapped(h.rows[0]);

  h.scrollArea.scrollTop = 120;
  h.render({ positionOverride: 7000 });
  h.notifyLayoutChange();
  assert.equal(h.scrollArea.scrollTop, 120, "playback and remeasurement must not undo manual reading position");

  h.render({ activeLineIndex: 1, positionOverride: 12000 });
  assert.equal(h.scrollArea.scrollTop, 0, "the next lyric starts at the top");
  h.unmount();
});
