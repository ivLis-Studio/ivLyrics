import { readI18nFixture } from "./fixtures/legacy-page-source.mjs";
import { readLanguageTable } from "./fixtures/language-source.mjs";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { createDebugSettingsPanel } from "../src/features/settings/debugSettingsPanel.mjs";
import { createSettingsColorControls } from "../src/features/settings/settingsColorControls.mjs";
import { createApiTracker } from "../src/core/createApiTracker.mjs";

const repo = new URL("../", import.meta.url);
const i18nSource = readI18nFixture();
const languages = readdirSync(new URL("src/i18n/langs/", repo)).filter((file) => /^Lang.*\.js$/.test(file))
  .map((file) => {
    const suffix = file.slice(4, -3);
    const code = ({ ZhCN: "zh-CN", ZhTW: "zh-TW" })[suffix] || suffix.toLowerCase();
    return { file, code, table: readLanguageTable(file) };
  });

const elements = (node) => Array.isArray(node) ? node.flatMap(elements)
  : node?.props ? [node, ...elements(node.props.children)] : [];
const text = (node) => Array.isArray(node) ? node.map(text).join("")
  : node?.props ? text(node.props.children)
    : node == null || typeof node === "boolean" ? "" : String(node);
const byClass = (tree, className) => elements(tree).filter((node) =>
  node.props.className?.split(" ").includes(className));
const find = (tree, predicate) => {
  const result = elements(tree).find(predicate);
  assert.ok(result, "Expected production element");
  return result;
};
const button = (tree, label) => find(tree, (node) => node.type === "button" && text(node) === label);
const json = (value) => JSON.parse(JSON.stringify(value));

// Evaluate the production panel, tracker, language files and I18n together.
// Only React hooks and the Spotify/browser host are faked; effects retain their
// dependencies and run after render, and log notifications use the real tracker.
function harness(language = "en", { withTracker = true } = {}) {
  const slots = [], pendingEffects = [], clipboard = [], toasts = [], opened = [], timers = [];
  let cursor = 0, dirty = false, clock = Date.parse("2026-10-16T02:03:04Z"), unsubscribeCalls = 0;
  const useState = (initial) => {
    const index = cursor++;
    if (!slots[index]) slots[index] = { value: typeof initial === "function" ? initial() : initial };
    return [slots[index].value, (next) => {
      const value = typeof next === "function" ? next(slots[index].value) : next;
      if (!Object.is(value, slots[index].value)) dirty = true;
      slots[index].value = value;
    }];
  };
  const useRef = (current) => slots[cursor++] ??= { current };
  const useEffect = (effect, deps) => {
    const index = cursor++, previous = slots[index];
    if (!previous || !deps || deps.some((value, i) => !Object.is(value, previous.deps[i]))) {
      slots[index] = { deps, cleanup: previous?.cleanup };
      pendingEffects.push(() => {
        slots[index].cleanup?.();
        slots[index].cleanup = effect();
      });
    }
  };
  const react = {
    useState, useRef, useEffect,
    Fragment: Symbol("Fragment"),
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
  };
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [clock])); }
    static now() { return clock; }
  }
  const config = { visual: { language } };
  const context = vm.createContext({
    react, ...react, CONFIG: config, Date: ClockDate,
    window: { CONFIG: config, open: (...args) => opened.push(args) },
    Spicetify: {
      Player: { data: { item: {
        uri: "spotify:track:fixture", name: "Fixture title", artists: [{ name: "Fixture artist" }],
        album: { name: "Fixture album" }, duration: { milliseconds: 123000 },
      } } },
      LocalStorage: { get: (key) => key === "ivLyrics:visual:language" ? language : "fixture-user", set() {} },
    },
    Utils: { currentVersion: "fixture-version", detectPlatform: () => "desktop" },
    navigator: { clipboard: { writeText: async (value) => { clipboard.push(value); } } },
    Toast: { success: (value) => toasts.push(["success", value]), error: (value) => toasts.push(["error", value]) },
    setTimeout: (callback) => timers.push(callback),
  });
  vm.runInContext(i18nSource, context, { filename: "I18n.js" });
  context.I18n = context.window.I18n;
  const tracker = context.window.ApiTracker = createApiTracker({ now: () => clock });
  const addListener = tracker.addListener;
  tracker.addListener = function (listener) {
    const unsubscribe = addListener.call(this, listener);
    return () => { unsubscribeCalls++; unsubscribe(); };
  };
  if (!withTracker) delete context.window.ApiTracker;
  const renderPanel = createDebugSettingsPanel({
    react, readTracker: () => context.window.ApiTracker,
    readTrack: () => context.Spicetify.Player.data?.item,
    readCachedLyrics: (uri) => context.window.CACHE?.[uri],
    readVisualSettings: () => context.CONFIG.visual,
    readAppVersion: () => context.Utils.currentVersion,
    readClientId: () => context.Spicetify.LocalStorage.get("ivLyrics:user-hash"),
    readPlatform: () => context.Utils.detectPlatform(),
    readLanguage: () => context.I18n.getCurrentLanguage(),
    translate: (...args) => context.I18n.t(...args),
    copyText: (value) => context.navigator.clipboard.writeText(value),
    openLink: (...args) => context.window.open(...args),
    scheduleTimeout: context.setTimeout,
    notifySuccess: context.Toast.success, notifyError: context.Toast.error,
  });
  return {
    context, tracker, clipboard, toasts, opened, timers,
    get unsubscribeCalls() { return unsubscribeCalls; },
    advance: (ms) => { clock += ms; },
    t: (key, params) => context.I18n.t(`settingsAdvanced.debugTab.${key}`, params),
    render() {
      let tree, renders = 0;
      do {
        cursor = 0; dirty = false;
        tree = renderPanel();
        pendingEffects.splice(0).forEach((effect) => effect());
        assert.ok(++renders < 10, "Panel effects must settle");
      } while (dirty);
      return tree;
    },
    unmount: () => slots.forEach((slot) => slot?.cleanup?.()),
  };
}

test("same-timestamp API entries have unique IDs even when random values collide", () => {
  const h = harness();
  vm.runInContext("Math.random = () => 0;", h.context);
  const first = h.tracker.logRequest("lyrics", "first");
  const second = h.tracker.logRequest("translation", "second");
  for (let i = 0; i < 50; i++) h.tracker.logCacheHit("youtube", `cached-${i}`, {});
  const ids = h.tracker.getLogs().map(entry => entry.id);
  assert.equal(new Set(ids).size, ids.length);
  h.tracker.logResponse(second, { translated: true });
  assert.equal(h.tracker.getLogs().find(entry => entry.id === first).status, "pending");
  assert.equal(h.tracker.getLogs().find(entry => entry.id === second).status, "success");
  h.tracker.clear();
  h.tracker.logCacheHit("youtube", "new-track", {});
  assert.ok(!ids.includes(h.tracker.getLogs()[0].id), "clearing logs must not reuse IDs or expansion state");
});

test("five production YouTube cache hits render valid times, accurate counts and 0ms without raw zeros", () => {
  const h = harness();
  h.tracker.setCurrentTrack("fixture");
  for (let i = 0; i < 5; i++) h.tracker.logCacheHit("youtube", `video-${i}`, { videoId: `id-${i}` });
  const tree = h.render();
  assert.ok(text(tree).includes("API request logs (5)"));
  assert.equal(text(byClass(tree, "debug-info-inline-meta")), "Total: 5 · Cached: 5");
  assert.equal(byClass(tree, "debug-api-item").length, 5);
  assert.equal(byClass(tree, "debug-api-duration").length, 5);
  assert.ok(!text(tree).includes("Invalid Date"));
  assert.ok(!text(tree).includes("API 요청 로그"));
  assert.ok(!("totalRequests" in h.tracker.getSummary()));
  for (const [i, item] of byClass(tree, "debug-api-item").entries()) {
    assert.equal(text(byClass(item, "debug-api-duration")), "0ms");
    assert.equal(text(byClass(item, "debug-api-timestamp")), new Date(h.tracker.getLogs()[i].startTime).toLocaleTimeString("en"));
    assert.equal(text(byClass(item, "debug-api-endpoint")), `[CACHE] video-${i}`);
    assert.equal(text(byClass(item, "debug-api-status")), "Cached");
    assert.notEqual(byClass(item, "debug-api-status")[0].props.style.color, "#ef4444");
    assert.equal(byClass(item, "debug-api-category")[0].props.style.background, "#ef4444", "red denotes the YouTube category");
    assert.ok(!elements(item).some((node) => node.props.children.includes(0)), "no numeric && expression leaks a text node");
  }
  h.unmount();
});

test("live production notifications update pending, success, cache and error states and preserve response plus error details", () => {
  const h = harness();
  assert.equal(text(byClass(h.render(), "debug-api-empty")), h.t("apiLogs.empty"));
  const id = h.tracker.logRequest("lyrics", "https://example.test/lyrics", { trackId: "fixture" });
  let tree = h.render();
  assert.equal(text(byClass(tree, "debug-api-status")), "Pending");
  assert.equal(byClass(tree, "debug-api-duration").length, 0);
  assert.equal(text(byClass(tree, "debug-api-endpoint")), "/lyrics");
  assert.equal(byClass(tree, "debug-api-endpoint")[0].props.title, "https://example.test/lyrics");
  h.advance(27);
  h.tracker.logResponse(id, { message: "response payload" }, "error", "Request failed");
  tree = h.render();
  assert.equal(text(byClass(tree, "debug-api-status")), "Error");
  assert.equal(text(byClass(tree, "debug-api-duration")), "27ms");
  assert.equal(byClass(tree, "debug-api-status")[0].props.style.color, "#ef4444");
  byClass(tree, "debug-api-header")[0].props.onClick();
  tree = h.render();
  assert.deepEqual(byClass(tree, "debug-json-label").map(text), ["Request:", "Response:", "Error:"]);
  assert.deepEqual(byClass(tree, "debug-json-block").map(text), [
    JSON.stringify({ trackId: "fixture" }, null, 2), JSON.stringify({ message: "response payload" }, null, 2), "Request failed",
  ]);

  const success = h.tracker.logRequest("metadata", "https://example.test/metadata", 0);
  h.tracker.logResponse(success, false);
  tree = h.render();
  assert.equal(text(byClass(tree, "debug-api-status").at(-1)), "Success");
  byClass(tree, "debug-api-header").at(-1).props.onClick();
  assert.deepEqual(byClass(byClass(h.render(), "debug-api-item").at(-1), "debug-json-block").map(text), ["0", "false"]);
  h.tracker.logResponse(success, false, "success", null, true);
  assert.equal(text(byClass(h.render(), "debug-api-status").at(-1)), "Cached");
  assert.equal(text(byClass(h.render(), "debug-info-inline-meta")), "Total: 2 · Cached: 1");
  h.tracker.logResponse(success, null, "error", "Cached lookup failed", true);
  tree = h.render();
  assert.equal(text(byClass(tree, "debug-api-status").at(-1)), "Error", "actual errors take precedence over cache metadata");
  assert.deepEqual(byClass(byClass(tree, "debug-api-item").at(-1), "debug-json-block").map(text), ["0", "Cached lookup failed"]);
  h.unmount();
});

test("timestamps prefer startTime, validate fallbacks, and copy all raw fields with the actual request time", async () => {
  const h = harness();
  const start = Date.parse("2026-10-15T12:13:14Z");
  const legacy = "2026-10-14T12:13:14Z";
  const end = start + 123;
  h.tracker.logCacheHit("youtube", "fixture", { videoId: "cached" });
  Object.assign(h.tracker.getLogs()[0], { id: 0, startTime: start, endTime: end, timestamp: legacy, extraDebugField: { source: "fixture" } });
  // Malformed/legacy fixtures deliberately bypass the production constructor.
  h.tracker._logs.push(
    { category: "lyrics", startTime: "invalid", timestamp: legacy, endTime: end, request: 0, response: false },
    { category: "lyrics", startTime: NaN, timestamp: "invalid", endTime: end },
    { category: "lyrics", startTime: 0, timestamp: legacy, endTime: end },
    { category: "lyrics", startTime: null, timestamp: undefined, endTime: null },
    { category: "lyrics", startTime: false, timestamp: "  ", endTime: true },
    { category: "lyrics", startTime: Infinity, timestamp: "invalid", endTime: "invalid" },
  );
  const tree = h.render();
  const times = byClass(tree, "debug-api-timestamp").map(text);
  assert.deepEqual(times, [start, Date.parse(legacy), end, 0].map((time) => new Date(time).toLocaleTimeString("en"))
    .concat(Array(3).fill("Time unavailable")));
  await button(tree, h.t("copyToClipboard")).props.onClick();
  const copied = JSON.parse(h.clipboard[0]);
  assert.equal(copied.appVersion, "fixture-version");
  assert.equal(copied.track.id, "fixture");
  assert.equal(copied.client.clientId, "fixture-user");
  assert.deepEqual(copied.apiSummary, json(h.tracker.getSummary()));
  const raw = h.tracker.getLogs();
  raw.forEach((entry, index) => {
    for (const [key, value] of Object.entries(json(entry))) {
      if (key !== "timestamp") assert.deepEqual(copied.apiLogs[index][key], value, `Raw field ${index}.${key}`);
    }
  });
  assert.deepEqual(copied.apiLogs.map((entry) => entry.timestamp), [start, Date.parse(legacy), end, 0]
    .map((time) => new Date(time).toISOString()).concat([null, null, null]));
  assert.equal(raw[0].timestamp, legacy, "export normalization must not mutate tracked fields");
  assert.deepEqual(h.toasts, [["success", h.t("copied")]]);
  assert.equal(text(button(h.render(), h.t("copied"))), h.t("copied"));
  h.timers[0]();
  const discord = button(h.render(), h.t("sendToDiscord"));
  await discord.props.onClick();
  assert.deepEqual(JSON.parse(h.clipboard[1]), copied, "Discord action retains the full debug copy");
  assert.deepEqual(h.opened, [["https://ivlis.kr/ivLyrics/discord.php", "_blank"]]);
  h.unmount();
});

test("native disclosure buttons keep IDs and independent expansion for missing IDs, zero IDs, reordering and track clears", () => {
  const h = harness();
  for (let i = 0; i < 3; i++) h.tracker.logCacheHit("youtube", "same-key", { value: i });
  const original = h.tracker.getLogs();
  delete original[0].id;
  delete original[1].id;
  original[2].id = 0;
  let tree = h.render();
  const headers = byClass(tree, "debug-api-header");
  const ids = headers.map((header) => header.props.id);
  assert.equal(new Set(ids).size, 3);
  assert.equal(new Set(byClass(tree, "debug-api-item").map((item) => item.props.key)).size, 3);
  for (const header of headers) {
    assert.equal(header.type, "button", "native buttons supply Enter/Space activation");
    assert.equal(header.props.type, "button");
    assert.equal(header.props["aria-expanded"], false);
    assert.ok(!elements(header).some((node) => node.type === "div"), "button contents are phrasing elements");
    const details = find(tree, (node) => node.props.id === header.props["aria-controls"]);
    assert.equal(details.props["aria-labelledby"], header.props.id);
    assert.equal(details.props.hidden, true);
    find(tree, (node) => node.props.id === header.props["aria-describedby"]);
  }
  headers[0].props.onClick();
  tree = h.render();
  assert.deepEqual(byClass(tree, "debug-api-details").map((node) => node.props.hidden), [false, true, true]);
  h.tracker.logCacheHit("youtube", "prepended", {});
  h.tracker._logs.unshift(h.tracker._logs.pop());
  h.tracker.logResponse(0, { updated: true }, "success", null, true);
  tree = h.render();
  assert.deepEqual(byClass(tree, "debug-api-header").slice(1).map((header) => header.props.id), ids);
  assert.equal(find(tree, (node) => node.props.id === ids[0]).props["aria-expanded"], true);
  assert.equal(find(tree, (node) => node.props.id === ids[1]).props["aria-expanded"], false);
  find(tree, (node) => node.props.id === ids[0]).props.onClick();
  assert.ok(byClass(h.render(), "debug-api-details").every((node) => node.props.hidden));
  h.tracker.setCurrentTrack("another-track");
  h.tracker.logCacheHit("youtube", "same-key", {});
  delete h.tracker.getLogs()[0].id;
  tree = h.render();
  assert.ok(!ids.includes(byClass(tree, "debug-api-header")[0].props.id));
  assert.equal(byClass(tree, "debug-api-header")[0].props["aria-expanded"], false);
  h.unmount();
});

test("unmount calls the returned unsubscribe on the original tracker and preserves other listeners", () => {
  const h = harness();
  const sibling = () => {};
  h.tracker.addListener(sibling);
  h.render(); h.render();
  assert.equal(h.tracker._listeners.length, 2, "rerenders do not resubscribe");
  h.context.window.ApiTracker = {};
  h.unmount();
  assert.equal(h.unsubscribeCalls, 1, "use the public cleanup instead of mutating _listeners");
  assert.deepEqual([...h.tracker._listeners], [sibling]);
});

test("refresh collects current track information and logs; absence of a tracker renders an honest empty summary", async () => {
  const h = harness();
  let tree = h.render();
  h.context.Spicetify.Player.data.item.name = "Updated title";
  h.tracker.logCacheHit("youtube", "new-cache", {});
  button(tree, h.t("refresh")).props.onClick();
  tree = h.render();
  assert.ok(text(tree).includes("Updated title"));
  assert.equal(text(byClass(tree, "debug-info-inline-meta")), "Total: 1 · Cached: 1");
  h.unmount();
  const absent = harness("en", { withTracker: false });
  tree = absent.render();
  assert.equal(text(byClass(tree, "debug-api-empty")), absent.t("apiLogs.empty"));
  assert.equal(text(byClass(tree, "debug-info-inline-meta")), "Total: 0 · Cached: 0");
  await button(tree, absent.t("copyToClipboard")).props.onClick();
  assert.deepEqual(JSON.parse(absent.clipboard[0]).apiSummary, { total: 0, cached: 0 });
  absent.unmount();
});

assert.equal(languages.length, 22);
for (const { file, code } of languages) {
  test(`${file}: production panel uses its own translations for heading, empty, summary, statuses, time and detail labels`, () => {
    const h = harness(code);
    assert.equal(h.context.I18n.getCurrentLanguage(), code);
    const own = languages.find(entry => entry.code === code).table.settingsAdvanced.debugTab.apiLogs;
    for (const key of ["title", "empty", "summary", "unknownTime", "request", "response", "error"]) {
      assert.equal(typeof own[key], "string");
      assert.ok(own[key].trim());
      assert.equal(h.t(`apiLogs.${key}`), own[key], "translation exists in this language, not a fallback");
    }
    for (const key of ["pending", "success", "error", "cached"]) {
      assert.equal(typeof own.status[key], "string");
      assert.ok(own.status[key].trim());
      assert.equal(h.t(`apiLogs.status.${key}`), own.status[key]);
    }
    if (code !== "en") {
      const english = languages.find(entry => entry.code === "en").table.settingsAdvanced.debugTab.apiLogs;
      for (const key of ["title", "empty", "summary"]) assert.notEqual(own[key], english[key], `${key} must be translated`);
    }
    assert.equal(text(byClass(h.render(), "debug-api-empty")), own.empty);
    const pending = h.tracker.logRequest("lyrics", "pending");
    const success = h.tracker.logRequest("metadata", "success", 0);
    h.tracker.logResponse(success, false);
    const error = h.tracker.logRequest("translation", "error", {});
    h.tracker.logResponse(error, {}, "error", "fixture-error");
    h.tracker.logCacheHit("youtube", "cached", {});
    const pendingEntry = h.tracker.getLogs().find((entry) => entry.id === pending);
    delete pendingEntry.startTime;
    let tree = h.render();
    assert.ok(text(tree).includes(h.t("apiLogs.title", { count: 4 })));
    assert.equal(text(byClass(tree, "debug-info-inline-meta")), h.t("apiLogs.summary", { total: 4, cached: 1 }));
    assert.deepEqual(byClass(tree, "debug-api-status").map(text), [own.status.pending, own.status.success, own.status.error, own.status.cached]);
    assert.equal(text(byClass(tree, "debug-api-timestamp")[0]), own.unknownTime);
    byClass(tree, "debug-api-header")[1].props.onClick();
    byClass(tree, "debug-api-header")[2].props.onClick();
    tree = h.render();
    assert.deepEqual(byClass(tree, "debug-json-label").map(text), [own.request, own.response, own.request, own.response, own.error]);
    assert.ok(!/\{(?:count|total|cached)\}/.test(text(tree)), "real I18n substitutes every count placeholder");
    h.unmount();
  });

  test(`${file}: ConfigColorControl localizes both ARIA labels with the control name`, () => {
    const h = harness(code);
    const own = languages.find(entry => entry.code === code).table.settingsUi.controls;
    const { ConfigColorControl } = createSettingsColorControls({
      react: h.context.react, translate: (...args) => h.context.I18n.t(...args),
    });
    const keys = ["colorPickerAriaLabel", "colorHexAriaLabel"];
    for (const key of keys) {
      assert.equal(typeof own[key], "string");
      assert.deepEqual(own[key].match(/\{\w+\}/g), ["{name}"]);
      assert.equal(h.context.I18n.t(`settingsUi.controls.${key}`), own[key], "use this language's template, not a fallback");
      if (code !== "en") assert.notEqual(own[key], key === keys[0] ? "{name} color picker" : "{name} HEX value");
    }
    for (const label of ["MALE 1", "FEMALE 2", "DUET 1", "Custom <&> $& {name}", "", undefined]) {
      const tree = ConfigColorControl({ value: "#abcdef", label });
      const picker = find(tree, (node) => node.props.type === "color");
      const hex = find(tree, (node) => node.props.type === "text");
      const expected = keys.map((key) => own[key].replace("{name}", () => label || "").trim());
      assert.equal(picker.props["aria-label"], expected[0]);
      assert.equal(picker.props.title, expected[0]);
      assert.equal(hex.props["aria-label"], expected[1]);
      assert.ok(expected.every((value) => value.trim()), "unnamed controls keep generic localized labels");
      if (code === "en" && label === "MALE 1") {
        assert.equal(picker.props["aria-label"], "MALE 1 color picker");
        assert.equal(hex.props["aria-label"], "MALE 1 HEX value");
      }
    }
    h.unmount();
  });
}
