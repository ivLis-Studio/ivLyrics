import { isIvLyricsPageMutationRelevant as relevant } from "#ivlyrics/lyrics/panelRouteObserver.mjs";
import { createNowPlayingPanelMount } from "#ivlyrics/lyrics/nowPlayingPanelMount.mjs";
import assert from "node:assert/strict";
import test from "node:test";

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
  assert.equal(relevant(attributeMutation(element({ classes: rootClass + " full" }), "class", rootClass)), false);
  assert.equal(relevant(attributeMutation(element({ testId: "control-new" }), "data-testid", "control-old")), false);
  assert.equal(relevant(attributeMutation(element(), "class", `${rootClass}-preview`)), false);
  assert.equal(relevant(childMutation([{ nodeType: 3 }, element({ children: [element({ classes: "setting" })] })])), false);
});

test("active ivLyrics page skips looking for a mount destination", () => {
  const mount = createNowPlayingPanelMount({
    containerClass: "panel",
    sectionClass: "section",
    barContainerClass: "bar",
    isIvLyricsPageActive: () => true,
    placement: { findNowPlayingPanel: () => assert.fail("should not search for the panel") },
    document: { querySelector: () => assert.fail("should not search for the theme or bar") },
  });
  assert.doesNotThrow(mount.insertPanelLyrics);
});
