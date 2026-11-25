import { createStudyNavigation } from "#ivlyrics/features/learning/studyNavigation.mjs";
import assert from "node:assert/strict";
import test from "node:test";

function harness() {
  const frames = [], state = { open: false, listeners: new Set() }, calls = [];
  const document = { activeElement: null, querySelector: () => state.open ? panel : null };
  const trigger = { isConnected: true, focus() { document.activeElement = trigger; calls.push("trigger.focus"); } };
  const panel = {
    contains: element => element === panel,
    focus() { document.activeElement = panel; calls.push("panel.focus"); },
  };
  document.activeElement = trigger;
  const api = createStudyNavigation({
    state, document, requestAnimationFrame: fn => frames.push(fn),
    enablePlaybackGuard: () => calls.push("guard.enable"),
    disablePlaybackGuard: () => calls.push("guard.disable"),
  });
  api.subscribe(() => calls.push("notify"));
  return { api, state, calls, document, trigger, panel, flush() { while (frames.length) frames.shift()(); } };
}

test("opening learning twice keeps it open, focuses the dialog and closing returns to its original trigger", () => {
  const h = harness();
  h.api.open(); h.flush();
  assert.equal(h.state.open, true);
  assert.equal(h.document.activeElement, h.panel);
  h.api.open(); h.flush();
  assert.equal(h.state.open, true);
  h.api.close();
  assert.equal(h.state.open, false);
  assert.equal(h.document.activeElement, h.trigger);
  assert.equal(h.calls.filter(value => value === "guard.disable").length, 1);
});

test("closing before the next frame cannot focus the dismissed dialog", () => {
  const h = harness();
  h.api.open(); h.api.close(); h.flush();
  assert.equal(h.calls.includes("panel.focus"), false);
  assert.equal(h.document.activeElement, h.trigger);
});

test("legacy toggle uses the same open/close path without retaining a disconnected trigger", () => {
  const h = harness();
  h.api.toggle(); h.flush();
  h.trigger.isConnected = false;
  h.api.toggle();
  assert.equal(h.state.open, false);
  assert.equal(h.calls.includes("trigger.focus"), false);
});

test("external closure never steals focus from a different control", () => {
  const h = harness();
  h.api.open(); h.flush();
  const other = {};
  h.document.activeElement = other;
  h.api.close();
  assert.equal(h.document.activeElement, other);
});
