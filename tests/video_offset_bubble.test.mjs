import { createToolbarSyncFixture } from "./fixtures/toolbar-sync-modules.mjs";
import { formatToolbarOffsetStep as format } from "../src/app/toolbar/createToolbarControls.mjs";
import { readLanguageTable } from "./fixtures/language-source.mjs";
import { sourceUrl } from "./fixtures/source-paths.mjs";
import { readPcStylesheet } from "../.github/scripts/pc_stylesheet.mjs";
import { renderLyricsPageQuickSync } from "../src/lyrics/lyricsPageQuickSyncView.mjs";
import { startPageMenus } from "../src/spicetify/composePageMenus.js";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

// The legacy video pill remains usable by fixtures, while production renders
// one unified Lyrics/Video pill. Both it and the Current-video panel retain the
// canonical absolute-anchor helpers. Evaluate the actual components with hooks
// and check production wiring, panel gating, locales and keyboard-focus CSS.
const read = (name) =>
  readFileSync(sourceUrl(name), "utf8").replace(/\r\n/g, "\n");
const controlsSource = readFileSync(new URL("../src/app/toolbar/sync/createSyncAdjustmentControls.mjs", import.meta.url), "utf8");
const indexSource = read("index.js");
const styleSource = readPcStylesheet();

const section = (text, startMarker, endMarker) => {
  const start = text.indexOf(startMarker);
  assert.ok(start >= 0, `missing source section: ${startMarker}`);
  const end = endMarker ? text.indexOf(endMarker, start + startMarker.length) : text.length;
  assert.ok(end > start, `missing source section end: ${endMarker}`);
  return text.slice(start, end);
};

const makeHooks = () => {
  const states = [];
  const refs = [];
  let stateIndex = 0;
  let refIndex = 0;
  return {
    useState: (initial) => {
      const index = stateIndex++;
      if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial;
      return [states[index], (next) => {
        states[index] = typeof next === "function" ? next(states[index]) : next;
      }];
    },
    useRef: (value) => {
      const index = refIndex++;
      if (!(index in refs)) refs[index] = { current: value };
      return refs[index];
    },
    useEffect: () => {},
    reset: () => {
      stateIndex = 0;
      refIndex = 0;
    },
  };
};

const createElement = (type, props, ...children) => ({ type, props: props || {}, children });

let bubbleContext = null;
const loadBubble = () => {
  if (bubbleContext) return bubbleContext;
  const dispatched = [];
  const win = {
    ivLyricsActiveCommunityVideoInfo: null,
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: (event) => {
      dispatched.push(event);
    },
  };
  const context = vm.createContext({
    react: { memo: (component) => component, createElement },
    createElement,
    useState: () => { throw new Error("hooks not installed"); },
    useRef: () => { throw new Error("hooks not installed"); },
    useEffect: () => {},
    I18n: { t: () => undefined },
    Utils: {
      getSelectedVideo: async () => null,
      saveSelectedVideo: async () => {},
      updateSelectedVideoSyncOffset: async () => true,
      submitCommunityVideo: async () => ({}),
    },
    window: win,
    CustomEvent: class {
      constructor(type, init) {
        this.type = type;
        this.detail = init?.detail;
      }
    },
    console: { error() {}, log() {}, warn() {} },
    formatSyncOffset: (value) => {
      const numeric = Number(value);
      const safe = Number.isFinite(numeric) ? Math.max(-10000, Math.min(10000, Math.round(numeric))) : 0;
      return `${safe > 0 ? "+" : ""}${safe}ms`;
    },
    joinToolbarClasses: (...parts) => parts.filter(Boolean).join(" "),
    ToolbarPanelSection: () => null,
    ToolbarPanelGroup: () => null,
    ToolbarPanelRow: () => null,
    ToolbarToggleRow: () => null,
    ToolbarOffsetSteps: () => null,
    ToolbarButton: "button",
    IvLyricsToolbarIcon: () => null,
    ToolbarRangeField: () => null,
  });
  context.__videoBubble = createToolbarSyncFixture(context);
  bubbleContext = { context, win, dispatched };
  return bubbleContext;
};

const renderWith = (win, props) => {
  const { context } = loadBubble();
  const hooks = makeHooks();
  context.useState = hooks.useState;
  context.useRef = hooks.useRef;
  return { tree: context.__videoBubble.CurrentVideoSyncPill(props), hooks };
};

const collectText = (node, out = []) => {
  if (node === null || node === undefined || node === false || node === true) return out;
  if (typeof node === "string" || typeof node === "number") {
    out.push(String(node));
    return out;
  }
  if (Array.isArray(node)) {
    node.forEach((child) => collectText(child, out));
    return out;
  }
  if (typeof node === "object") {
    if (node.props) {
      for (const value of Object.values(node.props)) {
        if (typeof value === "string") out.push(value);
      }
    }
    collectText(node.children, out);
  }
  return out;
};

const findNode = (node, predicate) => {
  if (node === null || node === undefined || node === false || node === true) return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findNode(child, predicate);
      if (found) return found;
    }
    return null;
  }
  if (typeof node !== "object") return null;
  if (predicate(node)) return node;
  return findNode(node.children, predicate);
};

const TRACK_URI = "spotify:track:videobubble1";
const ACTIVE_VIDEO = {
  trackUri: TRACK_URI,
  youtubeVideoId: "dQw4w9WgXcQ",
  youtubeTitle: "Bubble Test Video",
  captionStartTime: 1.234,
  skipSegments: [],
};

test("video pill shows empty state when no video is active", () => {
  const { win } = loadBubble();
  win.ivLyricsActiveCommunityVideoInfo = null;
  const { tree } = renderWith(win, { trackUri: TRACK_URI });
  assert.equal(tree?.props?.["data-video-sync"], "empty");
  assert.ok(collectText(tree).join(" ").includes("No video playing"));
});

test("video pill renders nothing when empty and hidden-empty", () => {
  const { win } = loadBubble();
  win.ivLyricsActiveCommunityVideoInfo = null;
  const { tree } = renderWith(win, { trackUri: TRACK_URI, hideWhenEmpty: true });
  assert.equal(tree, null);
});

test("video pill renders active controls only with a matching video", () => {
  const { win } = loadBubble();
  win.ivLyricsActiveCommunityVideoInfo = { ...ACTIVE_VIDEO };
  const { tree } = renderWith(win, { trackUri: TRACK_URI, hideWhenEmpty: true });
  assert.equal(tree?.props?.["data-video-sync"], "active");
  const text = collectText(tree).join(" ");
  assert.ok(text.includes("1.234s"), `readout missing in: ${text}`);
  assert.ok(text.includes("−1s") && text.includes("+1s"), `steps missing in: ${text}`);
});

test("video pill ignores a video owned by another track", () => {
  const { win } = loadBubble();
  win.ivLyricsActiveCommunityVideoInfo = { ...ACTIVE_VIDEO, trackUri: "spotify:track:other" };
  const { tree } = renderWith(win, { trackUri: TRACK_URI });
  assert.equal(tree?.props?.["data-video-sync"], "empty");
});

test("video pill step updates the readout and notifies listeners", () => {
  const { context, win, dispatched } = loadBubble();
  win.ivLyricsActiveCommunityVideoInfo = { ...ACTIVE_VIDEO };
  const hooks = makeHooks();
  context.useState = hooks.useState;
  context.useRef = hooks.useRef;
  const first = context.__videoBubble.CurrentVideoSyncPill({ trackUri: TRACK_URI });
  const stepButton = findNode(
    first,
    (node) => node.type === "button" && node.children.flat(Infinity).includes("+100ms")
  );
  assert.ok(stepButton, "expected a +100ms step button");
  dispatched.length = 0;
  stepButton.props.onClick();
  const startEvent = dispatched.find((event) => event.type === "ivLyrics:community-video-start-changed");
  assert.ok(startEvent, "expected a community-video-start-changed event");
  assert.ok(Math.abs(startEvent.detail.captionStartTime - 1.334) < 1e-9);
  hooks.reset();
  const second = context.__videoBubble.CurrentVideoSyncPill({ trackUri: TRACK_URI });
  assert.ok(collectText(second).join(" ").includes("1.334s"));
});

test("community video sync helpers normalize, clamp and format", () => {
  const { context } = loadBubble();
  const {
    normalizeCommunityVideoSyncSeconds,
    clampCommunityVideoSyncSeconds,
    formatCommunityVideoSyncSeconds,
  } = context.__videoBubble;
  assert.equal(normalizeCommunityVideoSyncSeconds("1.23456"), 1.235);
  assert.equal(normalizeCommunityVideoSyncSeconds("nope"), 0);
  assert.equal(normalizeCommunityVideoSyncSeconds(9999), 3600);
  assert.equal(clampCommunityVideoSyncSeconds(99, 10), 10);
  assert.equal(clampCommunityVideoSyncSeconds(-5, 10), 0);
  assert.equal(formatCommunityVideoSyncSeconds(1.234), "1.234s");
});

test("the lyrics page renders one unified pill with independent lyric/video eligibility", () => {
  const render = (overrides = {}) => renderLyricsPageQuickSync({
    hasTrackSyncLyrics: true,
    state: { uri: TRACK_URI, showMarketplace: false },
    suppressStaleLyricsPage: false, shouldHideFullscreenLyrics: false, isSyncCreatorActive: false,
    shouldUseVideoBackground: true, renderTrackUri: TRACK_URI, visual: {},
    TrackSyncAdjustPill: "UnifiedSyncPill", react: { createElement }, ...overrides,
  });
  const both = render();
  const pill = result => result.quickSyncStack.children[0];
  assert.equal(both.quickSyncStack.props.className, "lyrics-quick-sync-stack");
  assert.equal(both.quickSyncStack.children.length, 1);
  assert.equal(pill(both).type, "UnifiedSyncPill");
  assert.equal(pill(both).props.lyricsAdjustable, true);
  assert.equal(pill(both).props.videoTrackUri, TRACK_URI);
  assert.equal(pill(render({ hasTrackSyncLyrics: false })).props.lyricsAdjustable, false);
  assert.equal(pill(render({ shouldUseVideoBackground: false })).props.videoTrackUri, null);
  for (const overrides of [
    { hasTrackSyncLyrics: false, shouldUseVideoBackground: false },
    { visual: { "quick-sync-controls-enabled": false } },
    { hasTrackSyncLyrics: false, renderTrackUri: "spotify:track:stale" },
    { isSyncCreatorActive: true },
  ]) assert.equal(render(overrides).quickSyncStack, null);
  const viewSource = readFileSync(new URL("../src/lyrics/lyricsPageView.mjs", import.meta.url), "utf8");
  assert.match(viewSource, /const timedLyrics = isKaraokeRenderMode\(mode\) \|\| mode === SYNCED\s*\? resolveModeSpecificLyrics\(page\.state, mode\)/);
  assert.match(viewSource, /generationStatusStack,\s*quickSyncStack,/);
});

test("the page menu composition supplies its real quick sync component", (t) => {
  const document = {};
  const localStorage = { getItem: () => null };
  for (const [name, value] of Object.entries({ document, localStorage })) {
    const original = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, value });
    t.after(() => {
      if (original) Object.defineProperty(globalThis, name, original);
      else delete globalThis[name];
    });
  }
  const menus = startPageMenus({
    host: { document, localStorage, __ivLyricsLearningModeModule: { initialized: true } },
    document, react: { memo: component => component },
    spicetify: {}, appName: "ivLyrics", i18n: { t: key => key },
    config: { visual: {} }, storage: {}, utils: {}, toast: {},
  });
  assert.equal(typeof menus.TrackSyncAdjustPill, "function");
  const pageSource = readFileSync(new URL("../src/spicetify/index.js", import.meta.url), "utf8");
  assert.match(pageSource, /MarketplacePage, TrackSyncAdjustPill,\s*} = startPageMenus\(/);
  assert.match(pageSource, /return renderLyricsPage\(this, \{[\s\S]*?\n\s+TrackSyncAdjustPill,/);
});

test("sync-adjust panel shows the Current-video section only with an active video", () => {
  const { context, win } = loadBubble();
  const offsets = {
    trackOffset: 120,
    isTrackOffsetLoaded: true,
    trackOffsetRef: { current: 120 },
    changeTrackOffset() {},
    globalOffset: 0,
    changeGlobalOffset() {},
  };
  const renderPanel = () => {
    const hooks = makeHooks();
    context.useState = hooks.useState;
    context.useRef = hooks.useRef;
    return context.__videoBubble.SyncAdjustButtonFluent({
      offsets,
      includeTrackOffset: true,
      quickSyncEnabled: true,
      trackUri: TRACK_URI,
      onQuickSyncChange() {},
    });
  };
  win.ivLyricsActiveCommunityVideoInfo = null;
  const hidden = renderPanel();
  assert.equal(findNode(hidden, (node) => node.props?.["data-section"] === "video-sync"), null);
  win.ivLyricsActiveCommunityVideoInfo = { ...ACTIVE_VIDEO };
  const shown = renderPanel();
  const videoSection = findNode(shown, (node) => node.props?.["data-section"] === "video-sync");
  assert.ok(videoSection, "expected a video-sync section while a video is active");
  const text = collectText(shown).join(" ");
  assert.ok(text.includes("Current video"), `video title missing in: ${text}`);
  assert.ok(
    text.includes("Fine-tune the current video's first-lyric time after auto-match."),
    `video info missing in: ${text}`
  );
});

test("all locales provide the quick-sync video strings", () => {
  const files = readdirSync(new URL("../src/i18n/langs/", import.meta.url)).filter((name) => /^Lang.*\.js$/.test(name));
  assert.equal(files.length, 22, `expected 22 locale files, saw ${files.length}`);
  for (const file of files) {
    const bundle = readLanguageTable(file);
    const strings = bundle.syncAdjust;
    for (const key of ["noVideo", "quickLyricsLabel", "quickVideoLabel", "videoTitle", "videoInfo"]) {
      assert.ok(
        typeof strings?.[key] === "string" && strings[key].trim(),
        `${file}: missing syncAdjust.${key}`
      );
    }
    for (const key of ["share", "shareInfo", "shared", "shareFailed", "cannotShare"]) {
      assert.ok(typeof bundle?.videoSync?.[key] === "string" && bundle.videoSync[key].trim(),
        `${file}: missing videoSync.${key}`);
    }
  }
});

test("quick-sync stack styles exist without restyling the pill", () => {
  assert.ok(styleSource.includes(".lyrics-quick-sync-stack"), "style.css missing: .lyrics-quick-sync-stack");
});

test("unified mode and share buttons reuse visible keyboard-focus styles", () => {
  for (const selector of [".lyrics-track-sync-mode-button:focus-visible", ".lyrics-track-sync-share:focus-visible"]) {
    assert.ok(styleSource.includes(selector), `missing focus selector: ${selector}`);
  }
  assert.match(styleSource, /\.lyrics-track-sync-share:focus-visible\s*\{[^}]*outline:\s*2px/);
  assert.ok(styleSource.includes('.lyrics-track-sync-mode-button[aria-pressed="true"]'));
});

test("video panel control follows the global sync structure", () => {
  const panelSource = section(
    controlsSource,
    "const CurrentVideoSyncPanelControl",
    "\n  const TrackSyncAdjustPill"
  );
  for (const token of [
    "ivl-tb-offset",
    "ivl-tb-offset-value",
    "ToolbarOffsetSteps",
    "[-1000, -100, -10, 10, 100, 1000]",
    "formatCommunityVideoSyncSeconds",
  ]) {
    assert.ok(panelSource.includes(token), `panel control missing: ${token}`);
  }
  assert.ok(
    !panelSource.includes("lyrics-track-sync-pill"),
    "panel control must not reuse the floating pill markup"
  );
});

test("video panel control renders the current start time like the global value", () => {
  const { context, win } = loadBubble();
  const renderControl = (info) => {
    win.ivLyricsActiveCommunityVideoInfo = info;
    const hooks = makeHooks();
    context.useState = hooks.useState;
    context.useRef = hooks.useRef;
    return context.__videoBubble.CurrentVideoSyncPanelControl({ trackUri: TRACK_URI });
  };
  assert.equal(renderControl(null), null);
  const shown = renderControl({ ...ACTIVE_VIDEO });
  const value = findNode(
    shown,
    (node) => node.type === "output" && String(node.props?.className || "").includes("ivl-tb-offset-value")
  );
  assert.ok(value, "expected an ivl-tb-offset-value output in the panel control");
  const expected = context.__videoBubble.formatCommunityVideoSyncSeconds(ACTIVE_VIDEO.captionStartTime);
  assert.ok(
    collectText(value).join(" ").includes(expected),
    `expected formatted start time ${expected}, got: ${collectText(value).join(" ")}`
  );
});

test("offset step labels never bleed past their button edges", () => {
  assert.match(
    styleSource,
    /\.ivl-tb-offset-quick\s*\.ivl-tb-btn\s*\{[^}]*overflow:\s*hidden/,
    "quick step buttons must clip overflowing labels"
  );
  assert.match(
    styleSource,
    /\.ivl-tb-offset-quick\s*\.ivl-tb-btn\s*\{[^}]*text-overflow:\s*ellipsis/,
    "clipped labels must degrade with an ellipsis"
  );
});

test("second-scale steps render as seconds", () => {
  assert.equal(format(1000), "+1s");
  assert.equal(format(-1000), "−1s");
  assert.equal(format(100), "+100ms");
  assert.equal(format(-10), "−10ms");
});
