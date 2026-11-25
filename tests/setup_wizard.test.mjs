import { readSetupWizardFixture } from "./fixtures/legacy-page-source.mjs";
import { createSettingsStorage } from "#ivlyrics/core/createSettingsStorage.mjs";
import { createI18n } from "#ivlyrics/i18n/createI18n.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";

const source = readSetupWizardFixture();

// Exercise the real wizard's buttons and storage with a small hook renderer.
// Browser validation covers the actual DOM, layout and keyboard navigation separately.
function harness({ stored = {}, visual = {} } = {}) {
  const storage = new Map(Object.entries(stored));
  const config = { visual: { language: "ko", alignment: "right", "translate:target-language": "auto",
    "panel-lyrics-enabled": false, ...visual } };
  let failingKey;
  const localStorage = {
    getItem: key => storage.get(key) ?? null,
    removeItem: key => storage.delete(key),
    setItem(key, value) {
      if (key === failingKey) throw new Error("setup setting write failed");
      storage.set(key, String(value));
    },
  };
  const I18n = createI18n({
    languages: new Map([["ko", {}], ["en", {}]]),
    languageNames: { ko: "Korean", en: "English" },
    readLanguage: () => localStorage.getItem("ivLyrics:visual:language"),
    writeLanguage: value => localStorage.setItem("ivLyrics:visual:language", value),
    onLanguageChanged: value => { config.visual.language = value; },
    debug() {},
  });
  const hooks = [];
  let cursor = 0;
  let completed = 0;
  let domTheme = "dark";
  const state = (initial) => {
    const index = cursor++;
    if (!(index in hooks)) hooks[index] = typeof initial === "function" ? initial() : initial;
    return [hooks[index], (next) => { hooks[index] = typeof next === "function" ? next(hooks[index]) : next; }];
  };
  const context = vm.createContext({
    window: {}, document: {},
    CONFIG: config,
    I18n: { ...I18n, t: key => key },
    StorageManager: createSettingsStorage({ localStorage }),
    localStorage, console: { error() {} },
    handleSettingsRadioKeys() {},
    setTimeout() {},
    react: {
      useState: state,
      memo: (fn) => fn,
      createElement: (type, props, ...children) => ({ type, props: { ...props, children: children.flat(Infinity) } }),
      useEffect() {},
      useRef: (initial) => state({ current: initial })[0],
    },
    useState: state,
  });
  context.window.CONFIG = config;
  vm.runInContext(source + "\nglobalThis.Wizard = SetupWizard;", context);
  const render = () => {
    cursor = 0;
    return context.Wizard({ onComplete: () => completed++, onThemeChange: (theme) => { domTheme = theme; } });
  };
  const flatten = (node, result = []) => {
    if (!node || typeof node !== "object") return result;
    if (typeof node.type === "function") return flatten(node.type(node.props), result);
    result.push(node);
    for (const child of node.props.children || []) flatten(child, result);
    return result;
  };
  const click = (key) => {
    const node = flatten(render()).find((item) => item.type === "button" && item.props.children?.includes(key));
    assert.ok(node, "missing button " + key);
    node.props.onClick();
  };
  return {
    render, flatten, click, config, storage, completed: () => completed, domTheme: () => domTheme,
    failWrite(key) { failingKey = key; },
  };
}

test("reopening and finishing preserves disabled backgrounds and the persisted overlay setting", () => {
  const h = harness({ stored: { "ivLyrics:overlay-enabled": "true" } });
  h.click("setupWizard.quick.playback");
  const switches = h.flatten(h.render()).filter((node) => node.props.role === "switch");
  assert.equal(switches[0].props["aria-checked"], false, "disabled panel stays disabled");
  assert.equal(switches[1].props["aria-checked"], true, "overlay reads its actual persistence key");
  h.click("setupWizard.complete.startNow");
  assert.equal(h.completed(), 1);
  assert.equal(h.storage.get("ivLyrics:overlay-enabled"), "true");
  assert.equal(h.storage.get("ivLyrics:visual:gradient-background"), "false");
  assert.equal(h.storage.get("ivLyrics:visual:alignment"), "right");
  assert.equal(h.storage.get("ivLyrics:setup-completed"), "true");
});

test("choosing a theme previews it without committing it before completion", () => {
  const h = harness({ stored: { "ivLyrics:settings-ui-theme": "auto" } });
  const light = h.flatten(h.render()).find((node) => node.props["aria-label"] === "settingsUi.theme.light");
  light.props.onClick();
  assert.equal(h.domTheme(), "light");
  assert.equal(h.storage.get("ivLyrics:settings-ui-theme"), "auto");
  assert.equal(h.storage.has("ivLyrics:setup-completed"), false);
  h.click("setupWizard.quick.playback");
  h.click("setupWizard.complete.startNow");
  assert.equal(h.storage.get("ivLyrics:settings-ui-theme"), "light");
});

test("returning to a previous page keeps draft choices and completion writes them once", () => {
  const h = harness({ visual: { "gradient-background": true } });
  h.click("setupWizard.quick.appearance");
  const background = h.flatten(h.render()).find((node) => node.props.role === "radio" && node.props.children?.includes("setupWizard.theme.backgrounds.video"));
  background.props.onClick();
  h.click("setupWizard.quick.language");
  h.click("setupWizard.quick.appearance");
  const selected = h.flatten(h.render()).filter((node) => node.props.role === "radio" && node.props["aria-checked"]);
  assert.ok(selected.some((node) => node.props.children?.includes("setupWizard.theme.backgrounds.video")));
  assert.equal(h.storage.has("ivLyrics:setup-completed"), false);
  h.click("setupWizard.quick.playback");
  h.click("setupWizard.complete.startNow");
  h.click("setupWizard.complete.startNow");
  assert.equal(h.completed(), 1);
  assert.equal(h.storage.get("ivLyrics:visual:video-background"), "true");
  assert.equal(h.storage.get("ivLyrics:visual:gradient-background"), "false");
});

test("a failed completion leaves the original settings intact and can be retried", () => {
  const h = harness({ stored: {
    "ivLyrics:visual:panel-lyrics-enabled": "false",
    "ivLyrics:overlay-enabled": "false",
    "ivLyrics:settings-ui-theme": "dark",
  } });
  const button = h.flatten(h.render()).find(node => node.props["aria-label"] === "settingsUi.theme.light");
  button.props.onClick();
  h.click("setupWizard.quick.playback");
  for (const toggle of h.flatten(h.render()).filter(node => node.props.role === "switch").slice(0, 2)) {
    toggle.props.onClick();
  }
  const storedBefore = Object.fromEntries(h.storage);
  const visualBefore = { ...h.config.visual };
  h.failWrite("ivLyrics:setup-completed");
  h.click("setupWizard.complete.startNow");
  assert.equal(h.completed(), 0);
  assert.deepEqual(Object.fromEntries(h.storage), storedBefore);
  assert.deepEqual(h.config.visual, visualBefore);
  assert.ok(h.flatten(h.render()).some(node => node.props.role === "alert"));

  h.failWrite(undefined);
  h.click("setupWizard.complete.startNow");
  assert.equal(h.completed(), 1);
  assert.equal(h.storage.get("ivLyrics:setup-completed"), "true");
  assert.equal(h.storage.get("ivLyrics:visual:panel-lyrics-enabled"), "true");
  assert.equal(h.storage.get("ivLyrics:overlay-enabled"), "true");
  assert.equal(h.storage.get("ivLyrics:settings-ui-theme"), "light");
});

test("previewing a different interface language only saves it after completion", () => {
  const key = "ivLyrics:visual:language";
  const h = harness({ stored: { [key]: "ko" } });
  const language = h.flatten(h.render()).find(node => node.type === "select" && node.props.value === "ko");
  language.props.onChange({ target: { value: "en" } });
  assert.equal(h.config.visual.language, "en");
  assert.equal(h.storage.get(key), "ko");
  h.click("setupWizard.quick.playback");
  h.click("setupWizard.complete.startNow");
  assert.equal(h.storage.get(key), "en");
});

