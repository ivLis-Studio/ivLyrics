import assert from 'node:assert/strict';
import test from "node:test";
import { createSettingsKaraokeFillCurveEditor } from "../src/features/settings/settingsKaraokeFillCurveEditor.mjs";

const elements = node => Array.isArray(node) ? node.flatMap(elements) : node?.props ? [node, ...elements(node.children)] : [];
function harness(changed = false) {
  const hooks = [], effects = [], listeners = new Map(), commits = [];
  let cursor = 0;
  const useRef = initial => { const i = cursor++; return hooks[i] ??= { current: initial }; };
  const useState = initial => {
    const i = cursor++;
    if (!(i in hooks)) hooks[i] = typeof initial === 'function' ? initial() : initial;
    return [hooks[i], value => { hooks[i] = value; }];
  };
  const useEffect = (effect, deps) => {
    const i = cursor++, previous = hooks[i];
    if (!previous || deps.some((dep, j) => dep !== previous.deps[j])) {
      hooks[i] = { deps, cleanup: previous?.cleanup };
      effects.push(() => { hooks[i].cleanup?.(); hooks[i].cleanup = effect(); });
    }
  };
  const useMemo = (factory, deps) => {
    const i = cursor++, previous = hooks[i];
    if (previous && deps.every((dep, j) => Object.is(dep, previous.deps[j]))) return previous.value;
    const value = factory();
    hooks[i] = { deps, value };
    return value;
  };
  const renderEditor = createSettingsKaraokeFillCurveEditor({
    react: {
      useRef, useState, useEffect, useMemo,
      createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
    },
    host: { addEventListener: (type, cb) => listeners.set(type, cb), removeEventListener: type => listeners.delete(type) },
    getSettingsText: (_, fallback) => fallback,
    isSettingChanged: () => changed,
  });
  const render = (props = {}) => {
    cursor = 0;
    const tree = renderEditor({ name: 'Fill', onChange: (...args) => commits.push(args), ...props });
    elements(tree).find(node => node.type === 'svg').props.ref.current = { getBoundingClientRect: () => ({ top: 0, height: 180 }) };
    effects.splice(0).forEach(effect => effect());
    return elements(tree);
  };
  const event = (extra = {}) => ({ pointerId: 1, button: 0, clientY: 50, preventDefault() {}, ...extra });
  return { listeners, commits, render, event,
    start() { render().filter(node => node.type === 'g')[2].props.onPointerDown(event()); },
    unmount() { hooks.forEach(hook => hook?.cleanup?.()); },
  };
}

test('a changed fill curve marks its setting row for the shared blue label style', () => {
  assert.match(harness(true).render()[0].props.className, /\bis-changed\b/);
  assert.doesNotMatch(harness(false).render()[0].props.className, /\bis-changed\b/);
});

test('curve dragging commits only on release by the initiating pointer', () => {
  const h = harness();
  h.start();
  assert.equal(h.listeners.size, 4);
  h.listeners.get('pointerup')(h.event({ pointerId: 2 }));
  assert.equal(h.commits.length, 0);
  h.listeners.get('pointermove')(h.event({ clientY: 70 }));
  h.listeners.get('pointerup')(h.event());
  assert.equal(h.commits.length, 1);
  assert.equal(h.listeners.size, 0);
});

test('cancel, focus loss, disabling, and unmount do not leave a curve drag or commit its draft', () => {
  for (const stop of ['pointercancel', 'blur', 'disabled', 'unmount']) {
    const h = harness();
    const before = h.render().find(node => node.props.className === 'karaoke-fill-curve-path').props.d;
    h.start();
    if (stop === 'disabled') {
      const tree = h.render({ disabled: true });
      assert.equal(tree.find(node => node.type === 'button').props.disabled, true);
    } else if (stop === 'unmount') h.unmount();
    else h.listeners.get(stop)(h.event({ type: stop }));
    assert.equal(h.listeners.size, 0, stop);
    assert.equal(h.commits.length, 0, stop);
    if (stop !== 'unmount') assert.equal(h.render().find(node => node.props.className === 'karaoke-fill-curve-path').props.d, before);
  }
});
