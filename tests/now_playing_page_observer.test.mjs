import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../NowPlayingPanelLyrics.js", import.meta.url), "utf8");
const helperStart = source.indexOf("    const IVLYRICS_PAGE_ROOT_SELECTOR =");
const helperEnd = source.indexOf("    const setupPageDetection =", helperStart);
assert.ok(helperStart >= 0 && helperEnd > helperStart);
const context = vm.createContext({});
vm.runInContext(`${source.slice(helperStart, helperEnd)}\nglobalThis.relevant = isIvLyricsPageMutationRelevant;`, context);
const relevant = context.relevant;
const rootClass = "lyrics-lyricsContainer-LyricsContainer";

const element = ({ classes = "", testId = null, children = [] } = {}) => ({
  nodeType: 1,
  classList: { contains: (name) => classes.split(/\s+/).includes(name) },
  getAttribute: (name) => name === "data-testid" ? testId : null,
  querySelector(selector) {
    assert.equal(selector, `.${rootClass}, [data-testid="ivlyrics-page"]`);
    return children.find((child) => child.classList?.contains(rootClass)
      || child.getAttribute?.("data-testid") === "ivlyrics-page"
      || child.querySelector?.(selector)) || null;
  },
});
const childMutation = (addedNodes = [], removedNodes = []) => ({ type: "childList", addedNodes, removedNodes });
const attributeMutation = (target, attributeName, oldValue) => ({ type: "attributes", target, attributeName, oldValue });

test("detects either page root marker added or removed directly or in a subtree", () => {
  for (const root of [element({ classes: rootClass }), element({ testId: "ivlyrics-page" })]) {
    for (const node of [root, element({ children: [element({ children: [root] })] })]) {
      assert.equal(relevant(childMutation([node])), true);
      assert.equal(relevant(childMutation([], [node])), true);
    }
  }
});

test("detects page root marker attribute addition and removal", () => {
  assert.equal(relevant(attributeMutation(element({ classes: `app ${rootClass}` }), "class", "app")), true);
  assert.equal(relevant(attributeMutation(element({ classes: "app" }), "class", `app\t${rootClass}\n`)), true);
  assert.equal(relevant(attributeMutation(element({ testId: "ivlyrics-page" }), "data-testid", "other")), true);
  assert.equal(relevant(attributeMutation(element(), "data-testid", "ivlyrics-page")), true);
});

test("ignores settings controls, lyric state changes and unrelated inserted content", () => {
  assert.equal(relevant(attributeMutation(element({ classes: "setting selected" }), "class", "setting")), false);
  assert.equal(relevant(attributeMutation(element({ classes: "karaoke sung" }), "class", "karaoke active")), false);
  assert.equal(relevant(attributeMutation(element({ testId: "control-new" }), "data-testid", "control-old")), false);
  assert.equal(relevant(attributeMutation(element(), "class", `${rootClass}-preview`)), false);
  assert.equal(relevant(childMutation([{ nodeType: 3 }, element({ children: [element({ classes: "setting" })] })])), false);
});

test("active ivLyrics page skips panel searches while still removing stale panel content", () => {
  const observerStart = source.indexOf("    const setupObserver = () => {");
  const observerEnd = source.indexOf("    const teardownObserver =", observerStart);
  assert.ok(observerStart >= 0 && observerEnd > observerStart);
  let callback;
  let onLyricsPage = true;
  let container = null;
  let panelSearches = 0;
  let removals = 0;
  const insertDelays = [];
  const observerContext = vm.createContext({
    moduleState: {},
    PANEL_CONTAINER_CLASS: "panel",
    PANEL_SECTION_CLASS: "section",
    NOWPLAYING_BAR_CONTAINER_CLASS: "bar",
    isIvLyricsPageActive: () => onLyricsPage,
    findNowPlayingPanel: () => { panelSearches += 1; return { contains: () => true }; },
    removePanelLyrics: () => { removals += 1; },
    scheduleInsertPanelLyrics: (delay) => insertDelays.push(delay),
    document: { body: {}, querySelector: (selector) => selector === ".panel" ? container : null },
    MutationObserver: class {
      constructor(handler) { callback = handler; }
      observe() {}
    },
  });
  vm.runInContext(`let panelObserver = null; ${source.slice(observerStart, observerEnd)} setupObserver();`, observerContext);
  callback([]);
  assert.equal(panelSearches, 0);
  container = { querySelector: () => ({}) };
  callback([]);
  assert.equal(removals, 1);
  assert.equal(panelSearches, 0);
  onLyricsPage = false;
  callback([]);
  assert.equal(panelSearches, 1);
  assert.deepEqual(insertDelays, []);
  container = null;
  callback([]);
  assert.equal(panelSearches, 2);
  assert.deepEqual(insertDelays, [100]);
});
