import { readPcStylesheet } from "../.github/scripts/pc_stylesheet.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { observeFullscreenControllerHeight } from "../src/features/fullscreen/fullscreenLayout.mjs";
import { createFullscreenPlaybackControls } from "../src/features/fullscreen/fullscreenPlaybackControls.mjs";

import { useFullscreenControlReveal } from "../src/features/fullscreen/fullscreenControlReveal.mjs";

const source = readFileSync(new URL("../src/features/fullscreen/FullscreenOverlay.js", import.meta.url), "utf8");
const styles = readPcStylesheet();
const normalize = value => value.trim().replace(/\s+/g, " ");
const rules = [...styles.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .map(([, selectors, body]) => ({
    selectors: selectors.split(",").map(normalize),
    declarations: [...body.matchAll(/(?:^|;)\s*([\w-]+)\s*:\s*([^;]+)/g)]
      .map(([, key, value]) => [key, normalize(value)]),
  }));
const declarations = selector => Object.fromEntries(rules
  .filter(rule => rule.selectors.includes(selector)).flatMap(rule => rule.declarations));
const bound = "--iv-fullscreen-controller-max-width";
const left = ".fullscreen-left-controls";
const controller = `${left} > .fullscreen-player-controls`;
const start = source.indexOf("        const renderLeftPanel =");
const end = source.indexOf("        const renderTopRightOverlay =", start);
assert.ok(start >= 0 && end > start, "exercise the production under-album renderer");
// The hover-gate derivation lives above the renderer, so pull it in too rather than
// stubbing the visibility decision the assertions below depend on.
const gateStart = source.indexOf("        const hoverGateControls =");
const gateEnd = source.indexOf("        const showContextInOverlay =", gateStart);
assert.ok(gateStart >= 0 && gateEnd > gateStart, "exercise the production hover-gate decision");
const panelSource = source.slice(gateStart, gateEnd) + "\n" + source.slice(start, end);

function render(overrides = {}) {
  const context = vm.createContext({
    react: { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) },
    uiVisible: true, showControlsInLeftPanel: true, tmiMode: false,
    autoHideUI: true, pointerCanHover: true, leftControlsRevealed: true,
    setControlsHoverSource() {}, beginControlsDragHold() {}, setControlsFocusHold() {},
    setAlbumLyricsPanelRef() {}, setControllerHeightRef() {}, infoGap: 24, showAlbum: true,
    albumSize: 400, cdAlbumActive: false, cdScale: 1, albumRadius: 12,
    albumInteractionProps: {}, cdSlotStyle: {}, albumShadow: true,
    renderAlbumVisual() {}, renderAlbumModeHint() {}, renderTmiModeView() {}, showInfoInOverlay: false,
    showProgress: true, showControls: true, ProgressBar: "ProgressBar",
    PlayerControls: "PlayerControls", leftPanelShowVolume: true,
    leftPanelControlButtonSize: 36, leftPanelControlsBackground: true,
    leftPlayerControlsClass: "fullscreen-left-controls left-controls-player",
    leftProgressOnlyClass: "fullscreen-left-controls left-controls-progress-only",
    ...overrides,
  });
  return vm.runInContext(`${panelSource}\nrenderLeftPanel();`, context);
}
const elements = node => Array.isArray(node) ? node.flatMap(elements)
  : node?.props ? [node, ...elements(node.props.children)] : [];
const findClass = (tree, name) => elements(tree).find(node => node.props.className?.split(" ").includes(name));

test("the background fits its contents with padding inside the available width", () => {
  const css = declarations(controller);
  assert.equal(css.width, "fit-content");
  assert.equal(css["box-sizing"], "border-box");
  assert.equal(css["min-width"], "0", "override the shared 350px minimum");
  assert.equal(css["max-width"], "100%");
  assert.equal(css["flex-shrink"], "0", "wrapped rows must not lose their background height");
  assert.equal(css["padding-inline"], "clamp(4px, 4%, 20px)", "small CDs retain room for actual button targets");
  assert.equal(declarations(".fullscreen-player-controls.with-background").padding, "16px 20px");
});

test("the album column can shrink and the controller respects both album and column bounds", () => {
  for (const selector of [".lyrics-fullscreen-left-panel", ".lyrics-fullscreen-left-content", left]) {
    assert.equal(declarations(selector)["min-width"], "0", selector);
  }
  assert.equal(declarations(left)["max-width"], `min(100%, var(${bound}, 100%))`);
  assert.equal(declarations(left)["align-items"], "center", "centering works on either side of the lyrics");
  assert.equal(declarations(".lyrics-lyricsContainer-LyricsContainer.fullscreen-active.layout-reversed").direction, "rtl");
  assert.equal(declarations(".lyrics-lyricsContainer-LyricsContainer.fullscreen-active.layout-reversed>*").direction, "ltr");
});

test("small covers and scaled CDs provide their visible width without constraining an absent album", () => {
  for (const [albumSize, cdAlbumActive, cdScale, expected] of [
    [400, false, 1, "400px"], [200, false, 1, "200px"],
    [320, true, 0.7, "224px"], [500, true, 1.4, "700px"],
    [100, true, 0.7, "70px"],
  ]) {
    const tree = render({ albumSize, cdAlbumActive, cdScale });
    assert.equal(findClass(tree, "lyrics-fullscreen-left-content").props.style[bound], expected);
  }
  assert.equal(findClass(render({ showAlbum: false }), "lyrics-fullscreen-left-content").props.style[bound], undefined);
});

test("configured button sizes wrap without shrinking or clipping the playlist popover", () => {
  assert.equal(declarations(`${left} .fullscreen-control-main-row`)["flex-wrap"], "wrap");
  for (const selector of [`${left} .fullscreen-control-btn`, `${left} .fullscreen-playlist-control`]) {
    assert.equal(declarations(selector)["flex-shrink"], "0", selector);
    assert.equal(declarations(selector)["box-sizing"], "border-box", selector);
  }
  assert.equal(declarations(left).overflow, "visible");
  assert.equal(declarations(`${left}:has(.fullscreen-playlist-popover)`).overflow, "visible");
  const volume = declarations(`${left} .fullscreen-volume-wrapper`);
  assert.equal(volume["max-width"], "100%");
  assert.equal(volume["flex-wrap"], "wrap", "the transient volume percentage stays within the controller");
});

test("volume, progress, background and 28-48px button preferences still reach the player", () => {
  for (const buttonSize of [28, 36, 48]) for (const showVolume of [false, true]) {
    for (const showProgress of [false, true]) for (const showBackground of [false, true]) {
      const tree = render({ leftPanelControlButtonSize: buttonSize,
        leftPanelShowVolume: showVolume, showProgress, leftPanelControlsBackground: showBackground });
      const player = elements(tree).find(node => node.type === "PlayerControls");
      assert.equal(player.props.buttonSize, buttonSize);
      assert.equal(player.props.showVolume, showVolume);
      assert.equal(player.props.showBackground, showBackground);
      assert.equal(player.props.showProgress, showProgress, "the surface owns its timeline");
    }
  }
  const progressOnly = render({ showControlsInLeftPanel: false, showControls: false });
  assert.ok(findClass(progressOnly, "left-controls-progress-only"));
  assert.equal(elements(progressOnly).some(node => node.type === "PlayerControls"), false);
});

// Render the real components so their own hooks decide what they start.
// Effects write into the slot store, so the returned tree carries their state.
function renderComponent(component, props, extra = {}) {
  const intervals = [];
  const slots = [];
  let cursor = 0;
  const react = {
    useState: (initial) => {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
      return [slots[index], (next) => {
        slots[index] = typeof next === "function" ? next(slots[index]) : next;
      }];
    },
    useRef: (current) => ({ current }),
    useMemo: (factory) => factory(),
    useCallback: (callback) => callback,
    useEffect: (effect) => { effect(); },
    createElement: (type, elementProps, ...children) => (type === context.window.PlaylistPicker.PlaylistPickerButton
      ? type(elementProps)
      : { type, props: { ...elementProps, children } }),
  };
  const context = {
    react, console,
    // The playlist menu now lives in its own module; mirror its wrapper shape so
    // the control row renders exactly what production renders.
    window: {
      PlaylistPicker: {
        PlaylistPickerButton: (props) => react.createElement(
          "div",
          { className: props.wrapperClassName || "fullscreen-playlist-control" },
          react.createElement("button", { className: props.buttonClassName, style: props.buttonStyle })
        )
      }
    },
    document: { addEventListener() {}, removeEventListener() {} },
    I18n: { t: (key) => key },
    Spicetify: {
      Player: { data: { item: { uri: "spotify:track:one" } }, getVolume: () => 1, getShuffle: () => false,
        getRepeat: () => 0, getProgress: () => 90000, getDuration: () => 180000,
        addEventListener() {}, removeEventListener() {} },
      SVGIcons: new Proxy({}, { get: () => "" }),
    },
    setInterval(callback, delay) { intervals.push(delay); return intervals.length; },
    clearInterval() {}, setTimeout: () => 0, clearTimeout() {},
    ...extra,
  };
  const controls = createFullscreenPlaybackControls({
    react: context.react, spotify: context.Spicetify, translate: (key) => context.I18n.t(key),
    getPlaybackPosition: () => context.window.Utils, getPlaylistPicker: () => context.window.PlaylistPicker,
    getDocument: () => context.document, timers: context,
  });
  const run = () => {
    cursor = 0;
    return controls[component]({ show: true, ...props });
  };
  intervals.length = 0;
  run();
  return { tree: run(), intervals };
}

test("the timeline spans its new surface and both of its ends stay round at any thickness", () => {
  const nested = declarations(".fullscreen-player-controls > .fullscreen-progress-standalone");
  assert.equal(nested["margin-bottom"], "0", "the surface gap replaces the standalone margin");
  assert.equal(nested["max-width"], "none", "the timeline spans the surface instead of a 400px cap");
  assert.equal(nested.width, "100%");
  assert.doesNotMatch(styles, /\.fullscreen-bottom\.hidden \.fullscreen-progress-standalone/,
    "the hidden surface animates as a whole now");
  for (const selector of [".fullscreen-progress-bar", ".fullscreen-progress-fill"]) {
    assert.equal(declarations(selector)["border-radius"], "999px", selector);
  }
  const clip = declarations(".fullscreen-progress-clip");
  assert.equal(clip.overflow, "hidden", "the rounded clip shapes the fill's leading edge");
  assert.equal(clip["border-radius"], "inherit", "the clip follows the track radius at any thickness");
  const fillTransition = declarations(".fullscreen-progress-fill").transition;
  assert.match(fillTransition, /^transform /, "progress animates a compositor transform");
  assert.doesNotMatch(fillTransition, /width/, "a width transition re-runs layout on every frame of playback");
  const tree = renderComponent("ProgressBar").tree;
  const fill = findClass(tree, "fullscreen-progress-fill");
  assert.ok(findClass(tree, "fullscreen-progress-clip").props.children.flat().includes(fill),
    "the fill slides inside the rounded clip");
  assert.equal(fill.props.style.transform, "translateX(-50%)", "a full-width pill slides; scaleX would squash its caps");
  assert.equal(fill.props.style.width, undefined, "no width-driven fill");
  assert.equal(findClass(tree, "fullscreen-progress-handle").props.style.left, "50%",
    "the handle still tracks the fill");
});

test("a timeline-only bottom surface keeps the control background without polling the player", () => {
  const timelineOnly = renderComponent("PlayerControls",
    { showVolume: false, showProgress: true, progressOnly: true, showBackground: true });
  const surface = findClass(timelineOnly.tree, "fullscreen-player-controls");
  assert.ok(surface.props.className.split(" ").includes("with-background"),
    "the timeline-only surface keeps the controls background");
  assert.ok(elements(timelineOnly.tree).some(node => node.type?.name === "ProgressBar"),
    "the timeline is a row of that surface");
  assert.equal(elements(timelineOnly.tree).some(node => node.props.className === "fullscreen-control-main-row"), false,
    "no transport buttons in a timeline-only surface");
  assert.deepEqual(timelineOnly.intervals, [], "a timeline-only surface never polls the player");
  assert.ok(renderComponent("PlayerControls").intervals.includes(500),
    "the transport buttons still follow playback");
  assert.equal(findClass(renderComponent("PlayerControls").tree, "fullscreen-player-controls")
    .props.className.split(" ").includes("with-background"), false, "no background unless it is asked for");
});

test("coarse pointers keep 44px touch targets without reducing the configured buttons", () => {
  assert.match(styles, /@media\s*\(pointer:\s*coarse\)\s*\{\s*\.fullscreen-left-controls \.fullscreen-control-btn\s*\{\s*min-width:\s*44px;\s*min-height:\s*44px;/);
});

test("hide animations and the separate portrait, bottom and TV layouts retain their owners", () => {
  for (const selector of [`${left}.hidden`, `.lyrics-fullscreen-left-panel.controls-hidden ${left}`]) {
    const css = declarations(selector);
    assert.equal(css.opacity, "0", selector);
    assert.equal(css["max-height"], "0", selector);
    assert.equal(css["pointer-events"], "none", selector);
    assert.match(css.transform, /translateY\(var\(--iv-motion-distance-md\)\) scale\(0\.985\)/);
  }
  assert.match(declarations(left).transition, /max-height var\(--iv-motion-duration-slow\)/);
  assert.ok(findClass(render({ leftControlsRevealed: false }), "controls-hidden"));
  assert.ok(!findClass(render({ leftControlsRevealed: true }), "controls-hidden"),
    "hovering the album column reveals the controller");
  assert.equal(declarations(".portrait-overlay-bottom .fullscreen-player-controls").width, "100%");
  assert.equal(declarations(".portrait-overlay-bottom .fullscreen-player-controls.with-background").background, "transparent !important");
  assert.equal(declarations(".fullscreen-bottom").position, "fixed");
  assert.equal(declarations(".fullscreen-tv-controls").display, "flex");
  assert.equal(source.slice(start, end).match(/"--iv-fullscreen-controller-max-width"/g)?.length, 1,
    "the under-album content publishes its album width bound");
});

test("only the album column gates the left-panel controller, and only for hover-capable pointers", () => {
  const gated = overrides => !!findClass(render(overrides), "controls-hidden");
  // Hovering the column is the single trigger once auto-hide UI is on.
  assert.equal(gated({ leftControlsRevealed: true, uiVisible: true }), false);
  assert.equal(gated({ leftControlsRevealed: true, uiVisible: false }), false,
    "the global idle timer must no longer hide the controller");
  assert.equal(gated({ leftControlsRevealed: false, uiVisible: true }), true,
    "mouse movement in the lyrics pane must not reveal the controller");
  // Auto-hide off, TMI, or a touch-only pointer fall back to the pinned behaviour.
  assert.equal(gated({ leftControlsRevealed: false, uiVisible: true, autoHideUI: false }), false);
  assert.equal(gated({ leftControlsRevealed: false, uiVisible: true, pointerCanHover: false }), false);
  assert.equal(gated({ leftControlsRevealed: false, uiVisible: true, tmiMode: true, autoHideUI: true }), false);
  // Every non-gating combination still follows the idle timer.
  assert.equal(gated({ leftControlsRevealed: false, uiVisible: false, autoHideUI: false }), true);
  assert.equal(gated({ leftControlsRevealed: false, uiVisible: false, pointerCanHover: false }), true);

  // The hover strip is 115% of the album, full height, and only exists when gating.
  const zoneOf = overrides => findClass(render(overrides), "lyrics-fullscreen-hover-zone");
  assert.equal(zoneOf({ albumSize: 400 }).props.style.width, "460px");
  assert.equal(zoneOf({ albumSize: 200 }).props.style.width, "230px");
  assert.equal(zoneOf({ autoHideUI: false }), undefined, "no strip when nothing is hover-gated");
  assert.equal(zoneOf({ pointerCanHover: false }), undefined, "a touch device cannot use the strip");
  const zone = declarations(".lyrics-fullscreen-hover-zone");
  assert.equal(zone.position, "absolute");
  assert.equal(zone.height, "100%");
  assert.equal(zone["z-index"], "-1", "the strip must sit behind the album and metadata links");

  // Asymmetric reveal: quick in, unhurried out.
  const hide = declarations(`.lyrics-fullscreen-left-panel.controls-hidden ${left}`).transition;
  const show = declarations(`.lyrics-fullscreen-left-panel:not(.controls-hidden) ${left}`).transition;
  assert.match(hide, /opacity 1000ms/);
  assert.match(show, /opacity 150ms/);
  // `max-height` collapses alongside `overflow: hidden`, so it must track the
  // opacity. Clipping early made a 1s fade read as instant.
  assert.match(hide, /max-height 1000ms/,
    "the collapse must not outrun the fade or the fade looks instantaneous");
});

test("hover gating ignores the (hover: none) media query Spotify's CEF gets wrong", () => {
  const { pointer, fire } = gateRuntime();
  assert.equal(pointer.value, true, "gating starts on until a touch pointer is seen");
  fire("pointerdown", { pointerType: "touch" });
  assert.equal(pointer.value, false);
  fire("pointerdown", { pointerType: "mouse" });
  assert.equal(pointer.value, true);
});

test("the album art and metadata re-arm the reveal the hover strip drops", () => {
  // The strip sits behind the panel content, so crossing onto the cover fires the
  // strip's leave. The content stack must carry its own hover source.
  const tree = render({ albumSize: 400 });
  const content = findClass(tree, "lyrics-fullscreen-left-content");
  assert.equal(typeof content.props.onMouseEnter, "function");
  assert.equal(typeof content.props.onMouseLeave, "function");
  assert.equal(typeof findClass(tree, "lyrics-fullscreen-hover-zone").props.onMouseEnter, "function");
  assert.equal(typeof findClass(tree, "left-controls-player").props.onFocus, "function");
});

test("running a hover handler actually flips the reveal (catches a misspelled setter)", () => {
  const { api, revealed, timers } = gateRuntime();
  api.setControlsHoverSource("zone", true);
  assert.equal(revealed.value, true);
  api.setControlsHoverSource("zone", false);
  assert.equal(timers.size, 1);
});

function gateRuntime() {
  const revealed = { value: false };
  const pointer = { value: true };
  const states = [revealed, pointer];
  const timers = new Map();
  let nextTimer = 0;
  let nextState = 0;
  const listeners = new Map();
  const listenersOf = type => listeners.get(type) || [];
  const api = useFullscreenControlReveal({
    react: {
      useRef: initial => ({ current: initial }),
      useState: initial => {
        const state = states[nextState++];
        state.value = initial;
        return [initial, value => { state.value = value; }];
      },
      useCallback: fn => fn,
      useEffect: fn => fn(),
    },
    schedule: (fn, ms) => { const id = ++nextTimer; timers.set(id, { fn, ms }); return id; },
    cancel: id => timers.delete(id),
    host: {
      addEventListener: (type, fn) => listeners.set(type, [...listenersOf(type), fn]),
      removeEventListener: (type, fn) => listeners.set(type, listenersOf(type).filter(entry => entry !== fn)),
    },
  });
  const fire = (type, event) => [...listenersOf(type)].forEach(fn => fn(event));
  return { api, revealed, pointer, timers, listenersOf, fire };
}

test("a press inside the controls holds them only until that button is released", () => {
  // Regression: the release used to be registered by an effect keyed on the reveal
  // state, which never changes when a press lands on already-visible controls, so
  // one click kept the controller up for good.
  const { api, revealed, timers, listenersOf, fire } = gateRuntime();
  api.setControlsHoverSource("controls", true);
  api.beginControlsDragHold();
  assert.equal(listenersOf("mouseup").length, 1, "the press registers its own release");
  api.beginControlsDragHold();
  assert.equal(listenersOf("mouseup").length, 1, "a second press does not stack listeners");
  api.setControlsHoverSource("controls", false);
  assert.equal(timers.size, 0, "no hide while the press is held, even outside the column");
  assert.equal(revealed.value, true);
  fire("mouseup");
  assert.equal(listenersOf("mouseup").length + listenersOf("blur").length, 0, "and removes its listeners");
  assert.equal(timers.size, 1, "then the normal hide hold runs");
  [...timers.values()][0].fn();
  assert.equal(revealed.value, false, "the controller hides after a click and a leave");
  api.beginControlsDragHold();
  fire("blur");
  assert.equal(listenersOf("mouseup").length, 0, "losing the window also releases the press");
});

test("only keyboard focus pins the controls; the focus a click leaves behind does not", () => {
  const { api, revealed, timers, fire } = gateRuntime();
  let focusVisible = false;
  const button = { matches: selector => selector === ":focus-visible" && focusVisible };
  api.setControlsHoverSource("controls", true);
  api.beginControlsDragHold();
  api.setControlsFocusHold(button, true);
  fire("mouseup");
  api.setControlsHoverSource("controls", false);
  const [timer] = timers.keys();
  const hide = timers.get(timer).fn;
  timers.delete(timer);
  hide();
  assert.equal(revealed.value, false, "the clicked button keeps focus, but the controller still hides");
  focusVisible = true;
  api.setControlsFocusHold(button, true);
  assert.equal(timers.size, 0, "keyboard focus cancels the hide timer");
  assert.equal(revealed.value, true, "and reveals it without hover");
  api.setControlsFocusHold(null, false);
  assert.equal(timers.size, 1, "focus leaving the controls releases the pin");
  focusVisible = false;
  api.setControlsFocusHold(button, true);
  assert.equal(timers.size, 1, "programmatic focus after a pointer interaction does not pin");
});

test("the controls linger briefly before the hide is committed", () => {
  const { api, revealed, timers } = gateRuntime();
  api.setControlsHoverSource("zone", true);
  assert.equal(revealed.value, true, "entering the column reveals immediately");

  api.setControlsHoverSource("zone", false);
  assert.equal(revealed.value, true, "leaving must not hide on the spot");
  assert.equal(timers.size, 1, "a single hold timer is armed");
  const [id] = [...timers.keys()];
  assert.equal(timers.get(id).ms, 500, "hold is 500ms");

  // Re-entering during the hold cancels it - brushing past must not hide anything.
  api.setControlsHoverSource("zone", true);
  assert.equal(timers.size, 0, "re-entry cancels the pending hide");
  assert.equal(revealed.value, true);

  api.setControlsHoverSource("zone", false);
  assert.equal(timers.size, 1, "the hold re-arms after a real leave");
  timers.get([...timers.keys()][0]).fn();
  assert.equal(revealed.value, false, "the hide lands once the hold expires");
});

test("the drag release also waits out the hold", () => {
  const { api, revealed, timers, fire } = gateRuntime();
  api.setControlsHoverSource("zone", true);
  api.beginControlsDragHold();
  api.setControlsHoverSource("zone", false);
  assert.equal(timers.size, 0, "drag still holds the controls open");
  fire("mouseup");
  assert.equal(revealed.value, true, "still revealed before the hold expires");
  assert.equal(timers.size, 1, "after the release, the last hold is cleared");
});

test("an oversized album stack scrolls from its top instead of hiding its first or last controls", () => {
  const panel = declarations(".lyrics-fullscreen-left-panel:has(.left-controls-player)");
  assert.equal(panel["overflow-y"], "auto");
  assert.equal(panel["justify-content"], "flex-start");
  assert.equal(declarations(".lyrics-fullscreen-left-panel")["min-height"], "0",
    "the grid row must stay bounded by the fullscreen viewport");
  const content = declarations(".lyrics-fullscreen-left-panel:has(.left-controls-player) > .lyrics-fullscreen-left-content");
  assert.equal(content["margin-block"], "auto", "positive free space still centers the stack");
  assert.equal(content["flex-shrink"], "0", "overflow is scrollable rather than compressed over the metadata");
});

function heightHarness({ resizeObserver = true } = {}) {
  const frames = new Map(), resizes = [], mutations = [], listeners = new Map();
  const properties = new Map(), writes = [], cancelled = [];
  let nextFrame = 0;
  const progress = { offsetHeight: 18, css: { marginBottom: "12px" } };
  const controls = { offsetHeight: 280, css: {} };
  const container = {
    isConnected: true, offsetHeight: 0, children: [progress, controls], css: {},
    style: {
      getPropertyValue: name => properties.get(name) || "",
      setProperty(name, value) { properties.set(name, value); writes.push([name, value]); },
      removeProperty: name => properties.delete(name),
    },
    getBoundingClientRect() { assert.fail("hidden transforms must not affect the measured collapse height"); },
  };
  const view = {
    getComputedStyle: node => node.css,
    requestAnimationFrame(callback) { frames.set(++nextFrame, callback); return nextFrame; },
    cancelAnimationFrame(id) { cancelled.push(id); frames.delete(id); },
    addEventListener: (name, callback) => listeners.set(name, callback),
    removeEventListener: name => listeners.delete(name),
    MutationObserver: class {
      targets = [];
      constructor(callback) { this.callback = callback; mutations.push(this); }
      observe(node, options) { this.targets.push([node, options]); }
      disconnect() { this.targets = []; }
    },
  };
  if (resizeObserver) view.ResizeObserver = class {
    targets = new Set();
    constructor(callback) { this.callback = callback; resizes.push(this); }
    observe(node) { this.targets.add(node); }
    disconnect() { this.targets.clear(); }
  };
  const stop = observeFullscreenControllerHeight(container, view);
  return {
    frames, resizes, mutations, listeners, properties, writes, cancelled, progress, controls, container, stop,
    height: () => properties.get("--iv-fullscreen-controls-height"),
    flush() { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback()); },
  };
}

test("wrapped controls reserve their full height before paint even above the old 228px limit", () => {
  const h = heightHarness();
  assert.equal(h.height(), "310px");
  assert.equal(h.frames.size, 0, "initial attachment measures synchronously");
  assert.deepEqual([...h.resizes[0].targets], [h.progress, h.controls]);
  assert.equal(h.mutations[0].targets[0][0], h.container);
  assert.deepEqual({ ...h.mutations[0].targets[0][1] }, { childList: true },
    "nested playlist/lyric mutations must not drive the height observer");
  for (const selector of [`${left} > .fullscreen-progress-container`, `${left} > .fullscreen-progress-standalone`]) {
    assert.equal(declarations(selector)["flex-shrink"], "0");
  }
  h.stop();
});

test("width, button and volume changes coalesce and can reduce the collapse height again", () => {
  const h = heightHarness();
  h.controls.offsetHeight = 128;
  for (let i = 0; i < 30; i++) h.resizes[0].callback();
  assert.equal(h.frames.size, 1);
  h.flush();
  assert.equal(h.height(), "158px", "small rows must not retain a stale large maximum");
  h.resizes[0].callback(); h.flush();
  assert.equal(h.writes.length, 2, "identical geometry does not rewrite CSS");
  h.stop();
});

test("progress insertion/removal rebinds children without losing or clipping pending height changes", () => {
  const h = heightHarness();
  h.resizes[0].callback();
  h.container.children = [h.controls];
  h.mutations[0].callback();
  assert.equal(h.height(), "280px");
  assert.equal(h.frames.size, 0, "child replacement cancels the older scheduled measurement");
  assert.deepEqual([...h.resizes[0].targets], [h.controls]);
  h.container.children = [h.progress, h.controls];
  h.mutations[0].callback();
  assert.equal(h.height(), "310px");
  h.stop();
});

test("unmount cancels work, disconnects and ignores late observer callbacks", () => {
  const h = heightHarness();
  h.resizes[0].callback();
  const stale = [...h.frames.values()][0];
  h.stop();
  h.resizes[0].callback(); h.mutations[0].callback(); stale();
  assert.equal(h.frames.size, 0);
  assert.equal(h.properties.size, 0);
  assert.equal(h.resizes[0].targets.size, 0);
  assert.equal(h.mutations[0].targets.length, 0);
  assert.equal(h.writes.length, 1);
});

test("older hosts can remeasure on resize without polling", () => {
  const h = heightHarness({ resizeObserver: false });
  assert.deepEqual([...h.listeners.keys()], ["resize"]);
  h.controls.offsetHeight = 340;
  h.listeners.get("resize")(); h.flush();
  assert.equal(h.height(), "370px");
  h.container.isConnected = false;
  h.controls.offsetHeight = 400;
  h.listeners.get("resize")(); h.flush();
  assert.equal(h.height(), "370px");
  h.stop();
  assert.equal(h.listeners.size, 0);
});
