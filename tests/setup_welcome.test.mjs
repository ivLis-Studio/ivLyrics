import { createSetupWizardWelcome } from "../src/app/setupWizardWelcome.mjs";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

const source = readFileSync(new URL("../src/app/setupWizardStyles.mjs", import.meta.url), "utf8");

function harness({ language = "ko", reduced = false, hidden = false } = {}) {
  const slots = [], timers = new Map(), events = new Map(), motionEvents = new Map(), mutations = [];
  let cursor = 0, pending = [], timerID = 0;
  let props = { active: true, language, settled: false };
  const add = (map, name, fn) => {
    if (!map.has(name)) map.set(name, new Set());
    map.get(name).add(fn);
  };
  const document = {
    hidden,
    addEventListener: (name, fn) => add(events, name, fn),
    removeEventListener: (name, fn) => events.get(name)?.delete(fn),
  };
  const motion = {
    matches: reduced,
    addEventListener: (name, fn) => add(motionEvents, name, fn),
    removeEventListener: (name, fn) => motionEvents.get(name)?.delete(fn),
  };
  const useState = (initial) => {
    const index = cursor++;
    if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
    return [slots[index], (next) => {
      slots[index] = typeof next === "function" ? next(slots[index]) : next;
    }];
  };
  const react = {
    createElement: (type, attrs, ...children) => ({ type, props: attrs, children: children.flat() }),
    useEffect: (effect, deps) => {
      const index = cursor++;
      if (slots[index]?.deps?.every((dep, i) => Object.is(dep, deps[i]))) return;
      pending.push(() => {
        slots[index]?.cleanup?.();
        slots[index] = { deps, cleanup: effect() };
      });
    },
  };
  const api = createSetupWizardWelcome({
    document, react: { ...react, useState },
    host: { matchMedia: (query) => {
      assert.equal(query, "(prefers-reduced-motion: reduce)");
      return motion;
    } },
    schedule: (fn, delay) => {
      assert.equal(delay, 3500);
      const id = ++timerID;
      timers.set(id, fn);
      return id;
    },
    cancel: (id) => timers.delete(id),
  });
  const render = (next = {}) => {
    props = { ...props, ...next };
    cursor = 0;
    pending = [];
    const result = api.useWizardWelcomeLanguage(props.active, props.language, props.settled);
    for (const effect of pending) effect();
    return result;
  };
  return {
    render, timers, events, motionEvents, mutations,
    tick: () => { for (const fn of [...timers.values()]) fn(); return render(); },
    setHidden(value) { document.hidden = value; for (const fn of events.get("visibilitychange") || []) fn(); return render(); },
    setReduced(value) { motion.matches = value; for (const fn of motionEvents.get("change") || []) fn(); return render(); },
    unmount() { for (const slot of slots) slot?.cleanup?.(); },
    text: (props) => api.WizardWelcomeText(props),
  };
}

test("welcome alternates only its greeting every 3.5s, without changing any language preference", () => {
  const h = harness();
  assert.equal(h.render(), "ko");
  assert.equal(h.timers.size, 1);
  assert.equal(h.tick(), "en");
  assert.equal(h.tick(), "ko");
  assert.equal(h.timers.size, 1, "rerendering never duplicates the timer");
  assert.deepEqual(h.mutations, []);
  h.unmount();
});

test("explicit language selection fixes the greeting and never restarts on a later page or Back", () => {
  const h = harness();
  h.render();
  h.tick();
  assert.equal(h.render({ language: "en", settled: true }), "en");
  assert.equal(h.timers.size, 0);
  assert.equal(h.render({ active: false }), "en");
  assert.equal(h.render({ active: true }), "en");
  assert.equal(h.timers.size, 0);
  assert.equal(h.render({ language: "ko-KR" }), "ko");
  assert.equal(h.render({ language: "de" }), "en", "other UI languages stay supported; greeting alone uses English");
  assert.deepEqual(h.mutations, []);
});

test("reduced motion stays static, including when the OS preference changes", () => {
  const h = harness({ reduced: true });
  assert.equal(h.render(), "ko");
  assert.equal(h.timers.size, 0);
  h.setReduced(false);
  assert.equal(h.timers.size, 1);
  assert.equal(h.tick(), "en");
  assert.equal(h.setReduced(true), "ko");
  assert.equal(h.timers.size, 0);
  h.unmount();
});

test("hidden pages pause the cycle; leaving or unmounting removes the timer and listeners", () => {
  const h = harness({ hidden: true });
  h.render();
  assert.equal(h.timers.size, 0);
  h.setHidden(false);
  assert.equal(h.timers.size, 1);
  h.tick();
  h.setHidden(true);
  assert.equal(h.timers.size, 0);
  h.setHidden(false);
  h.render({ active: false });
  assert.equal(h.timers.size, 0);
  assert.equal(h.events.get("visibilitychange").size, 0);
  assert.equal(h.motionEvents.get("change").size, 0);
  h.render({ active: true });
  assert.equal(h.timers.size, 1);
  h.unmount();
  assert.equal(h.timers.size, 0);
  assert.equal(h.events.get("visibilitychange").size, 0);
  assert.equal(h.motionEvents.get("change").size, 0);
});

test("both measured greetings reserve space and keep the localized accessible heading stable", () => {
  const h = harness();
  const heading = h.text({ tag: "h1", field: "greeting", language: "ko", "aria-label": "언어 선택" });
  assert.equal(heading.type, "h1");
  assert.equal(heading.props["aria-label"], "언어 선택");
  assert.equal(heading.children.length, 2);
  assert.equal(heading.children[0].children[0], "Hello");
  assert.equal(heading.children[1].children[0], "안녕하세요");
  assert.equal(heading.children[0].props.lang, "en");
  assert.equal(heading.children[1].props.lang, "ko");
  for (const child of heading.children) assert.equal(child.props["aria-hidden"], true);
  assert.equal(heading.children[1].props.className, "is-current");
  assert.match(source, /\.wizard-welcome-copy > span \{ grid-area: 1 \/ 1;/);
});
