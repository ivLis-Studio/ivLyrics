import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isToolbarSurfaceEvent as inside } from "#ivlyrics/app/toolbar/toolbarSurfaceEvent.mjs";

const source = readFileSync(new URL("../src/app/toolbar/createToolbarInteraction.mjs", import.meta.url), "utf8");
const selectors = ".companion";
const root = { contains: target => target?.connectedToRoot === true };

test("connected toolbar controls remain inside without composedPath support", () => {
  assert.equal(inside({ target: { connectedToRoot: true } }, root, selectors), true);
});

test("a submenu replaced by a React click keeps its original toolbar event path", () => {
  const removedButton = { connectedToRoot: false, closest: () => null };
  assert.equal(inside({ target: removedButton, composedPath: () => [removedButton, {}, root, {}] }, root, selectors), true);
  assert.equal(inside({ target: removedButton }, root, selectors), false, "the old target-only test lost this click");
});

test("a companion popup removed during the same click is not an outside click", () => {
  const removedButton = { closest: () => null };
  const companion = { matches: selector => selector === selectors };
  assert.equal(inside({ target: removedButton, composedPath: () => [removedButton, companion, {}] }, root, selectors), true);
});

test("a connected companion popup stays inside", () => {
  assert.equal(inside({ target: { closest: selector => selector === selectors ? {} : null } }, root, selectors), true);
});

test("an actual outside click still closes the fullscreen menu", () => {
  const target = { closest: () => null };
  assert.equal(inside({ target, composedPath: () => [target, {}, {}] }, root, selectors), false);
  assert.equal(inside({ target: null }, root, selectors), false);
});

test("panel and fullscreen outside handlers both use the original event path", () => {
  assert.match(source, /isToolbarSurfaceEvent\(event, rootRef\.current, TOOLBAR_PANEL_COMPANION_SURFACES\)/);
  assert.match(source, /isToolbarSurfaceEvent\(event, rootRef\.current, TOOLBAR_FULLSCREEN_MENU_SURFACES\)/);
});
