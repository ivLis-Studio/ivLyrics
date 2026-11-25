import { readSettingsSource, readSettingsStylesFixture } from "./fixtures/legacy-page-source.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { createFullscreenPresentationPicker } from "#ivlyrics/features/settings/settingsFullscreenPresentationPicker.mjs";

const source = readSettingsSource();
const css = vm.runInNewContext(readSettingsStylesFixture()
  + "\nSETTINGS_MODAL_CSS;", { APP_NAME: "ivLyrics" });
const elements = node => Array.isArray(node) ? node.flatMap(elements)
  : node?.props ? [node, ...elements(node.props.children)] : [];

function harness() {
  const slots = [], effects = [], changes = [], focused = [];
  let cursor = 0;
  const useState = initial => {
    const index = cursor++;
    if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
    return [slots[index], next => { slots[index] = typeof next === "function" ? next(slots[index]) : next; }];
  };
  const useEffect = (effect, deps) => {
    const index = cursor++;
    if (!slots[index] || deps.some((value, i) => value !== slots[index][i])) effects.push(effect);
    slots[index] = deps;
  };
  const react = {
    useState, useEffect,
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
  };
  const Picker = createFullscreenPresentationPicker({ react, getSettingsText: (_key, fallback) => fallback });
  return {
    changes, focused,
    render(defaultValue = "vinyl") {
      cursor = 0;
      const tree = Picker({ defaultValue, onChange: (...args) => changes.push(args) });
      effects.splice(0).forEach(effect => effect());
      return elements(tree).filter(node => node.props.role === "radio");
    },
    event(key) {
      return { key, preventDefault() {}, currentTarget: { closest: () => ({
        querySelectorAll: () => [0, 1, 2, 3].map(index => ({ focus: () => focused.push(index) })),
      }) } };
    },
  };
}

test("changed settings use blue labels and fields instead of dot markup", () => {
  assert.doesNotMatch(source, /className: ["`]settings-changed-dot/);
  assert.doesNotMatch(css, /\.settings-changed-dot/);
  assert.match(css, /\.setting-row\.is-changed \.setting-name[^}]*color: var\(--accent-text\)/);
  assert.match(css, /\.settings-rail-item\.is-modified \.settings-rail-label[^}]*color: var\(--accent-text\)/);
  assert.match(css, /\.settings-matrix-cell\.is-changed[^}]*color: var\(--accent-text\)/);
});

test("LP presentation cards keep a single tab stop and support arrow/Home/End selection", () => {
  const h = harness();
  let cards = h.render();
  assert.deepEqual(cards.map(card => card.props.tabIndex), [-1, 0, -1, -1]);
  cards[1].props.onKeyDown(h.event("ArrowRight"));
  cards = h.render();
  assert.deepEqual(h.changes.at(-1), ["fullscreen-focus-presentation", "video"]);
  assert.deepEqual(cards.map(card => card.props["aria-checked"]), [false, false, true, false]);
  cards[2].props.onKeyDown(h.event("Home"));
  cards = h.render();
  assert.deepEqual(h.changes.at(-1), ["fullscreen-focus-presentation", "compact-vinyl"]);
  cards[0].props.onKeyDown(h.event("End"));
  assert.deepEqual(h.changes.at(-1), ["fullscreen-focus-presentation", "motion"]);
  assert.deepEqual(h.focused, [2, 0, 3]);
});

test("LP cards reflect an external default reset without saving it again", () => {
  const h = harness();
  h.render()[1].props.onClick();
  h.render("video");
  assert.equal(h.render("video")[2].props["aria-checked"], true);
  h.render("compact-vinyl");
  const cards = h.render("compact-vinyl");
  assert.deepEqual(cards.map(card => card.props["aria-checked"]), [true, false, false, false]);
  assert.equal(h.changes.length, 1, "only the explicit click invokes the save callback");
});
