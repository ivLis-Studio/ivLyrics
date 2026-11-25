import { readSettingsSource } from "./fixtures/legacy-page-source.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { createDomHarness } from "./fixtures/playbar_harness.mjs";
import { mountSettingsModal, getSettingsModalClose } from "../src/features/settings/settingsModalHost.mjs";
import { useSettingsModalSearch } from "../src/features/settings/useSettingsModalSearch.mjs";

const source = readSettingsSource();
const start = source.indexOf("function openConfig(options = {}) {"), end = source.indexOf("\nfunction queueReloadIntoIvLyrics(", start);
assert.ok(start >= 0 && end > start);
const openConfigSource = source.slice(start, end);

for (const immediate of [false, true]) {
  for (const failUnmount of [false, true]) {
    test(`settings close cleans overlay, listener and visibility (immediate=${immediate}, unmount throws=${failUnmount})`, () => {
      const h = createDomHarness();
      const { document, window, context } = h;
      const profile = document.createElement("button"); document.body.appendChild(profile); profile.focus();
      const failure = new Error("fixture React unmount failure");
      let unmounts = 0;
      const visibility = [];
      window.addEventListener("ivLyrics:settings-visibility", (event) => visibility.push(event.detail.open));
      context.mountSettingsModal = mountSettingsModal;
      context.isSettingsEditableField = () => false;
      context.getEffectiveReducedMotionPreference = () => false;
      context.getSettingsMotionDurationMs = () => 140;
      context.react = { createElement: () => ({}) }; context.ConfigModal = function() {};
      context.readReactDom = () => context.reactDOM;
      context.reactDOM = { render() {}, unmountComponentAtNode() { unmounts++; if (failUnmount) throw failure; } };
      vm.runInContext(openConfigSource, context);
      context.openConfig(); h.advance(16);
      assert.ok(document.getElementById("ivLyrics-settings-overlay"));
      assert.equal(window.listeners.get("keydown").length, 1);
      assert.ok(document.documentElement.classList.contains("ivlyrics-settings-open"));
      const close = getSettingsModalClose(window);
      assert.equal(close, window.ivLyricsCloseConfig);
      const finish = () => { close(immediate); if (!immediate) h.advance(140); };
      if (failUnmount) assert.throws(finish, (error) => error === failure); else finish();
      assert.equal(document.getElementById("ivLyrics-settings-overlay"), null);
      assert.equal(document.body.classList.contains("ivlyrics-settings-open"), false);
      assert.equal(document.documentElement.classList.contains("ivlyrics-settings-open"), false);
      assert.equal(window.listeners.get("keydown").length, 0);
      assert.equal(window.ivLyricsCloseConfig, null);
      assert.equal(document.activeElement, profile);
      assert.deepEqual(visibility, [true, false]);
      close(true); assert.equal(unmounts, 1, "old close callback remains idempotent");
      context.openConfig(); h.advance(16);
      assert.ok(document.getElementById("ivLyrics-settings-overlay"), "failed React cleanup must not block reopening");
      assert.equal(window.listeners.get("keydown").length, 1);
      context.reactDOM.unmountComponentAtNode = () => {}; window.ivLyricsCloseConfig(true);
      assert.equal(document.getElementById("ivLyrics-settings-overlay"), null);
    });
  }
}

function mountFixture(h, { render = () => {}, renderer = { render }, renderContent = () => ({}), isEditableField = () => false } = {}) {
  mountSettingsModal({
    host: h.window,
    getRenderer: () => renderer,
    renderContent,
    isReducedMotion: () => false,
    getCloseDuration: () => 140,
    isEditableField,
  });
}

test("a modern settings root opens and focuses only after its content commits", () => {
  const h = createDomHarness();
  const { document, window } = h;
  const opener = document.body.appendChild(document.createElement("button"));
  opener.focus();
  let renders = 0, unmounts = 0, shell, commit;
  mountFixture(h, {
    renderer: {
      createRoot(container) {
        shell = container;
        return { render() { renders++; }, unmount() { unmounts++; } };
      },
      render() { assert.fail("modern roots must own the settings view when available"); },
    },
    renderContent(_close, onReady) { commit = onReady; return {}; },
  });
  assert.equal(renders, 1);
  const overlay = document.getElementById("ivLyrics-settings-overlay");
  h.advance(32);
  assert.ok(overlay.classList.contains("is-entering"));
  assert.equal(document.activeElement, opener);

  const closeButton = shell.appendChild(document.createElement("button"));
  shell.querySelector = () => closeButton;
  commit();
  h.advance(16);
  assert.ok(overlay.classList.contains("is-open"));
  assert.equal(document.activeElement, closeButton);

  const close = getSettingsModalClose(window);
  close(true);
  close(true);
  commit();
  h.advance(16);
  assert.equal(unmounts, 1);
  assert.equal(document.getElementById("ivLyrics-settings-overlay"), null);
  assert.equal(document.activeElement, opener);
});

test("restored settings open after commit when Spotify's hidden webview cannot paint a frame", () => {
  const h = createDomHarness();
  const { document, window } = h;
  document.hidden = true;
  window.requestAnimationFrame = () => {};
  let commit;
  mountFixture(h, {
    renderer: { createRoot: () => ({ render() {}, unmount() {} }) },
    renderContent(_close, onReady) { commit = onReady; return {}; },
  });
  const overlay = document.getElementById("ivLyrics-settings-overlay");
  assert.ok(overlay.classList.contains("is-entering"));
  commit();
  assert.ok(overlay.classList.contains("is-open"));
  assert.equal(overlay.classList.contains("is-entering"), false);
  getSettingsModalClose(window)(true);
  assert.equal(document.getElementById("ivLyrics-settings-overlay"), null);
});

test("closing in the settings visibility event leaves no React root behind", () => {
  const h = createDomHarness();
  const visibility = [];
  h.window.addEventListener("ivLyrics:settings-visibility", event => {
    visibility.push(event.detail.open);
    if (event.detail.open) getSettingsModalClose(h.window)(true);
  });
  mountFixture(h, {
    renderer: { createRoot() { assert.fail("the modal has already been closed"); } },
  });
  h.advance(16);
  assert.equal(h.document.getElementById("ivLyrics-settings-overlay"), null);
  assert.equal(getSettingsModalClose(h.window), null);
  assert.deepEqual(visibility, [true, false]);
});

test("a render failure clears the host registration and leaves the original focus intact", () => {
  const h = createDomHarness();
  const { window, document } = h;
  const opener = document.body.appendChild(document.createElement("button"));
  opener.focus();
  const visibility = [];
  window.addEventListener("ivLyrics:settings-visibility", (event) => visibility.push(event.detail.open));
  const failure = new Error("fixture React render failure");

  assert.throws(() => mountFixture(h, { render() { throw failure; } }), (error) => error === failure);
  h.advance(16);
  assert.equal(document.getElementById("ivLyrics-settings-overlay"), null);
  assert.equal(document.activeElement, opener);
  assert.equal(getSettingsModalClose(window), null);
  assert.deepEqual(visibility, [true, false]);
  assert.equal(window.listeners.get("keydown").length, 0);

  mountFixture(h);
  assert.ok(document.getElementById("ivLyrics-settings-overlay"));
  getSettingsModalClose(window)(true);
});

test("Escape clears search, closes on the next press, and guards native Escape until release", () => {
  const h = createDomHarness();
  const { window, document, CustomEvent } = h;
  const press = (type, target) => {
    const event = new CustomEvent(type, { key: "Escape", target });
    window.dispatchEvent(event);
    return event;
  };

  let search;
  mountFixture(h, {
    render(_content, shell) {
      const wrapper = shell.appendChild(document.createElement("div"));
      wrapper.className = "settings-search-wrapper";
      search = wrapper.appendChild(document.createElement("input"));
      search.className = "settings-search-input";
      search.value = "translation";
      const clear = wrapper.appendChild(document.createElement("button"));
      clear.className = "settings-search-clear";
      clear.onclick = () => { search.value = ""; };
    },
  });

  assert.equal(press("keydown", search).defaultPrevented, true);
  assert.equal(search.value, "");
  assert.ok(document.getElementById("ivLyrics-settings-overlay"));
  assert.equal(press("keyup", search).defaultPrevented, true);
  assert.equal(press("keydown", search).defaultPrevented, true);
  assert.equal(document.getElementById("ivLyrics-settings-overlay"), null);

  let nativeKeys = 0;
  window.addEventListener("keydown", () => { nativeKeys++; });
  assert.equal(press("keydown").defaultPrevented, true);
  assert.equal(nativeKeys, 0);
  assert.equal(press("keyup").defaultPrevented, true);
  press("keydown");
  assert.equal(nativeKeys, 1);
});

test("Tab wraps focus in both directions and delayed focus cannot follow an immediate close", () => {
  const h = createDomHarness();
  const { window, document, CustomEvent } = h;
  const opener = document.body.appendChild(document.createElement("button"));
  opener.focus();
  let first, last;
  mountFixture(h, {
    render(_content, shell) {
      first = shell.appendChild(document.createElement("button"));
      last = shell.appendChild(document.createElement("button"));
      // The harness handles basic selectors. The native selector contract
      // is unchanged and the focus decision is exercised with these controls.
      shell.querySelectorAll = () => [first, last];
    },
  });
  first.focus();
  window.dispatchEvent(new CustomEvent("keydown", { key: "Tab", shiftKey: true }));
  assert.equal(document.activeElement, last);
  window.dispatchEvent(new CustomEvent("keydown", { key: "Tab" }));
  assert.equal(document.activeElement, first);
  first.className = "config-hotkey-recorder recording";
  window.dispatchEvent(new CustomEvent("keydown", { key: "Tab", target: first, shiftKey: true }));
  assert.equal(document.activeElement, first, "the recorder receives Shift+Tab before focus moves");
  getSettingsModalClose(window)(true);
  h.advance(16);
  assert.equal(document.activeElement, opener);
});

test("settings search respects the active hotkey recorder's focus", () => {
  const { window, document, CustomEvent } = createDomHarness();
  const effects = [];
  const search = useSettingsModalSearch({
    useState: value => [value, () => {}],
    useRef: current => ({ current }),
    useMemo: create => create(),
    useEffect: effect => effects.push(effect),
  }, {
    host: window, document, settingsContentRef: { current: null },
    getPerformanceSettingsSections: () => [], getCdSettingsSections: () => [],
    getSettingsText: (_key, fallback) => fallback, translate: key => key,
  });
  const input = search.searchInputRef.current = document.body.appendChild(document.createElement("input"));
  input.select = () => {};
  const recorder = document.body.appendChild(document.createElement("button"));
  recorder.className = "config-hotkey-recorder recording";
  const child = recorder.appendChild(document.createElement("span"));
  const cleanup = effects.map(effect => effect()).filter(Boolean);
  const press = (target, key, ctrlKey) => {
    const event = new CustomEvent("keydown", { target, key, ctrlKey });
    window.dispatchEvent(event);
    return Boolean(event.defaultPrevented);
  };

  for (const [key, ctrlKey] of [["k", true], ["/", false]]) {
    recorder.focus();
    assert.equal(press(child, key, ctrlKey), false);
    assert.equal(document.activeElement, recorder);
  }
  recorder.className = "config-hotkey-recorder";
  assert.equal(press(recorder, "k", true), true);
  assert.equal(document.activeElement, input);
  for (const dispose of cleanup) dispose();
});
