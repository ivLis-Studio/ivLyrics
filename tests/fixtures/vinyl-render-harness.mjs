import assert from "node:assert/strict";
import { createVinylActiveLyricRenderer } from "../../src/features/player/createVinylActiveLyricRenderer.mjs";

export const OVERFLOW = "is-vinyl-lyric-overflowing";
export const MEASURING = "is-vinyl-lyric-measuring";

const classList = (...initial) => {
  const values = new Set(initial);
  return {
    add: (...names) => names.forEach(name => values.add(name)),
    remove: (...names) => names.forEach(name => values.delete(name)),
    contains: name => values.has(name),
  };
};

const createRow = ({ width = 300, naturalWidth = 600, direction = "ltr" } = {}, layoutAudit) => {
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
  if (layoutAudit) {
    for (const method of ["add", "remove"]) {
      const original = viewport.classList[method];
      viewport.classList[method] = (...names) => {
        const changed = names.some(name => viewport.classList.contains(name) !== (method === "add"));
        original(...names);
        if (changed) layoutAudit.dirty = true;
      };
    }
    const readLayout = () => {
      if (layoutAudit.dirty) layoutAudit.flushes++;
      layoutAudit.dirty = false;
    };
    Object.defineProperty(viewport, "clientWidth", {
      get() { readLayout(); return width; },
      set(value) { width = value; layoutAudit.dirty = true; },
    });
    Object.defineProperty(content, "scrollWidth", {
      get() { readLayout(); return measuredWidth(); },
    });
    content.getBoundingClientRect = () => { readLayout(); return { width: measuredWidth() }; };
  }
  let transform = "", transformWrites = 0;
  Object.defineProperty(content.style, "transform", {
    get: () => transform,
    set(value) { transform = value; transformWrites++; },
  });
  content.transformWriteCount = () => transformWrites;
  return { viewport, content };
};

export const createHarness = ({
  rows = [{}], reducedMotion = false, layoutAudit, liveClock = null, adaptRenderer = options => options, ...initialProps
} = {}) => {
  const slots = [];
  const frames = new Map();
  const mediaListeners = new Set();
  const observers = new Set();
  const lyricRows = rows.map(row => createRow(row, layoutAudit));
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
  const renderVinyl = createVinylActiveLyricRenderer(adaptRenderer({
    react,
    primitives: {
        LyricsLineBlock,
        IdlingIndicator: () => null,
        useLyricsPlaybackPosition: () => liveClock ? liveClock.position : 6000,
        getPseudoKaraokeRenderAdvance: () => 0,
        getInterludeInfo: () => ({ isInterlude: false }),
        createActiveTrailingKaraokeInterludeLine: () => null,
        getEmbeddedAuxiliaryDisplayValues: line => line,
        buildLyricDisplayState: (_isKara, line) => ({ mainText: line.text }),
        getKaraokeLineMetaClass: () => "",
        getKaraokeSpeakerStyle: () => ({}),
        ...(liveClock ? { getFrameAlignedLyricsPlaybackPosition: () => liveClock.position } : {}),
    },
    browser: {
      matchMedia: () => media,
      getComputedStyle: element => ({ direction: element.direction }),
      requestAnimationFrame: callback => { frames.set(++nextFrame, callback); return nextFrame; },
      cancelAnimationFrame: id => frames.delete(id),
      ResizeObserver: Observer,
      MutationObserver: Observer,
    },
    getFonts: () => undefined,
    getVisualSettings: () => undefined,
    isFuriganaReady: () => false,
    getLyricsLocale: () => "auto",
  }));
  // A live clock keeps one frame loop running until playback rests.
  const maxPasses = liveClock ? 40 : 10;
  const flushFrames = () => {
    let passes = 0;
    while (frames.size) {
      assert.ok(++passes < maxPasses, "overflow measurement must settle");
      const scheduled = [...frames.values()];
      frames.clear();
      scheduled.forEach(callback => callback());
    }
  };
  const render = (nextProps, flush = true) => {
    props = { ...props, ...nextProps };
    cursor = 0;
    effects = [];
    tree = renderVinyl(props);
    if (tree?.props.ref) tree.props.ref.current = root;
    const line = tree?.props.children.find(child => child?.type === LyricsLineBlock);
    root.viewports = line?.props.singleLineScroll ? lyricRows.map(row => row.viewport) : [];
    effects.forEach(effect => effect());
    if (flush) flushFrames();
    return tree;
  };
  render({});
  return {
    rows: lyricRows,
    scrollArea: root.parentElement,
    render,
    pendingFrames: () => frames.size,
    runFrame() {
      const scheduled = [...frames.values()];
      frames.clear();
      scheduled.forEach(callback => callback());
    },
    flushFrames,
    setReducedMotion(matches) {
      media.matches = matches;
      [...mediaListeners].forEach(callback => callback({ matches }));
      flushFrames();
    },
    notifyLayoutChange(flush = true) {
      [...observers].forEach(observer => observer.callback());
      if (flush) flushFrames();
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
