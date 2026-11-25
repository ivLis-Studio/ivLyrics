import assert from "node:assert/strict";
import { createVinylPlayerMode } from "../../src/features/player/VinylPlayerMode.js";
import { createVinylMotionHooks } from "../../src/features/player/vinylPlayback.mjs";
import { createVinylRecordPlayer } from "../../src/features/player/vinylRecordPlayer.mjs";

export const first = { uri: "spotify:track:one", title: "First", artist: "Artist", album: "Album", coverUrl: "one.png" };
export const second = { ...first, uri: "spotify:track:two", title: "Second", coverUrl: "two.png" };
export const elements = node => Array.isArray(node) ? node.flatMap(elements)
  : node && typeof node === "object" && "type" in node ? [node, ...elements(node.props.children)] : [];

export const createHarness = ({ component = "Mode", reducedMotion = false, clocks = [], activeLyricRenderer = null, ...initialProps } = {}) => {
  const slots = [], mediaListeners = new Set(), timers = new Map();
  let cursor = 0, dirty = false, effects = [], tree, now = 0, timerId = 0;
  let props = { track: first, isPlaying: true, vinylSettings: {}, ...initialProps };
  const sameDeps = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const useMemo = (factory, deps) => {
    const index = cursor++;
    if (!slots[index] || !sameDeps(slots[index].deps, deps)) slots[index] = { value: factory(), deps };
    return slots[index].value;
  };
  const useState = initial => {
    const index = cursor++;
    if (!slots[index]) slots[index] = { value: typeof initial === "function" ? initial() : initial };
    return [slots[index].value, next => {
      const value = typeof next === "function" ? next(slots[index].value) : next;
      if (!Object.is(value, slots[index].value)) { slots[index].value = value; dirty = true; }
    }];
  };
  const useEffect = (effect, deps) => {
    const index = cursor++;
    if (!slots[index] || !sameDeps(slots[index].deps, deps)) effects.push(() => {
      slots[index]?.cleanup?.();
      slots[index] = { deps, cleanup: effect() };
    });
  };
  const react = {
    useState, useMemo, useEffect, useLayoutEffect: useEffect,
    useCallback: (callback, deps) => useMemo(() => callback, deps),
    useRef: current => useMemo(() => ({ current }), []),
    memo: fn => fn,
    createElement: (type, elementProps, ...children) => ({ type, props: { ...elementProps, children } }),
  };
  const media = {
    matches: reducedMotion,
    addEventListener: (_, callback) => mediaListeners.add(callback),
    removeEventListener: (_, callback) => mediaListeners.delete(callback),
  };
  const host = {
    // Deliberately never resolve image loads. They cannot gate the animation.
    Image: class { complete = false; },
    matchMedia: () => media,
    setTimeout: (callback, delay) => { timers.set(++timerId, { callback, due: now + delay }); return timerId; },
    clearTimeout: id => timers.delete(id),
    requestAnimationFrame: callback => host.setTimeout(callback, 16),
    cancelAnimationFrame: id => timers.delete(id),
    addEventListener() {}, removeEventListener() {},
  };
  const document = { addEventListener() {}, removeEventListener() {} };
  const i18n = { t: key => key };
  const spicetify = { React: react, SVGIcons: {} };
  const Mode = createVinylPlayerMode({
    react, host, document, i18n, spicetify,
    getActiveLyricRenderer: () => activeLyricRenderer, getCdVisualizer: () => null,
  });
  const { useRotationSpeed } = createVinylMotionHooks({ react, host });
  const VinylPlayer = createVinylRecordPlayer({ react, host, document, i18n, useRotationSpeed });
  const components = { Mode, VinylPlayer, CompactAlbumVinyl: Mode.CompactAlbumVinyl };
  const element = { getAnimations: () => clocks, getBoundingClientRect: () => ({ left: 0, top: 0, width: 260, height: 620 }) };
  const render = (nextProps = {}) => {
    props = { ...props, ...nextProps };
    let passes = 0;
    do {
      assert.ok(++passes < 10, "LP updates must settle");
      dirty = false; cursor = 0; effects = [];
      tree = components[component](props);
      for (const node of elements(tree)) if (node.props.ref) node.props.ref.current = element;
      for (const effect of effects) effect();
    } while (dirty);
    return tree;
  };
  render();
  return {
    render, get tree() { return tree; }, get timerCount() { return timers.size; },
    player: () => elements(tree).find(node => node.props.className?.split(" ").includes("ivlyrics-vinyl-player--immersive"))?.props,
    advance(ms) {
      const end = now + ms;
      for (;;) {
        const next = [...timers].sort((a, b) => a[1].due - b[1].due).find(([, timer]) => timer.due <= end);
        if (!next) break;
        now = next[1].due; timers.delete(next[0]); next[1].callback();
        if (dirty) render();
      }
      now = end;
    },
    setReducedMotion(matches) { media.matches = matches; for (const listener of mediaListeners) listener(); return render(); },
    unmount() {
      for (const slot of slots) slot?.cleanup?.();
      assert.equal(timers.size, 0, "unmount cancels transition timers");
      assert.equal(mediaListeners.size, 0, "unmount releases reduced-motion subscription");
    },
  };
};

