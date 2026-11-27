import { harness } from "./fixtures/settings-modal-harness.mjs";
import {
  applySettingsAssistantChanges, buildSettingsAssistantCatalog, getSettingsAssistantLocation,
  normalizeSettingsAssistantValue, planSettingsAssistantChanges, readChangedSettingsForAssistant,
  SETTINGS_GUIDE_ENTRY_BY_KEY,
} from "../src/features/settings/settingsAssistantCatalog.mjs";
import { buildSettingsAssistantPrompt, readSettingsAssistantReply } from "../src/features/settings/settingsAssistantPrompt.mjs";
import { createSettingsAssistantSession } from "../src/features/settings/settingsAssistantSession.mjs";
import { createSettingsAssistantPanel } from "../src/features/settings/settingsAssistantPanel.mjs";
import { buildSettingsSearchCatalog } from "../src/features/settings/settingsSearchCatalog.mjs";
import { SETTINGS_GUIDE_SECTIONS, SETTINGS_GUIDE_SETTINGS } from "../src/features/settings/settingsGuide.mjs";
import assert from "node:assert/strict";
import test from "node:test";

const plain = (value) => JSON.parse(JSON.stringify(value));
const elements = (node) => Array.isArray(node) ? node.flatMap(elements)
  : node?.props ? [node, ...elements(node.props.children)] : [];

// The settings window's own registry and save handlers, as the assistant sees them.
function assistantRuntime(h, overrides = {}) {
  const readValue = (key) => (h.visual[key] === undefined ? h.getSettingDefaultValue(key) : h.visual[key]);
  return {
    readRegistry: () => Array.from(h.api.buildSettingsRegistry()),
    readValue,
    isSettingChanged: (key) => h.isSettingChanged(key),
    valuesEqual: (first, second) => String(first) === String(second),
    translate: (key) => key,
    readLanguage: () => ({ code: "ko", name: "한국어" }),
    hasProvider: () => true,
    onSaveError: (error) => { throw error; },
    ...overrides,
  };
}

const registryMap = (h) => new Map(Array.from(h.api.buildSettingsRegistry(), (entry) => [entry.key, entry]));

test("the AI catalog lists every guide setting with its limits and marks show-only rows", () => {
  const h = harness();
  const registryByKey = registryMap(h);
  const catalog = buildSettingsAssistantCatalog({ translate: (key) => key, registryByKey });
  for (const entry of SETTINGS_GUIDE_SETTINGS) {
    assert.ok(catalog.includes(`- ${entry.key} `), `${entry.key} is missing from the AI catalog`);
  }
  for (const section of SETTINGS_GUIDE_SECTIONS) assert.ok(catalog.includes(`## section ${section.key} `), section.key);
  const line = (key) => catalog.split("\n").find((candidate) => candidate.startsWith(`- ${key} `));
  assert.match(line("fullscreen-auto-hide-delay"), /number 1\.\.10 step 0\.5 s; default 3; shown when fullscreen-auto-hide-ui is on/);
  assert.match(line("fullscreen-focus-presentation"), /one of "compact-vinyl".*"motion"/);
  assert.doesNotMatch(line("fullscreen-auto-hide-ui"), /SHOW-ONLY/);
  assert.match(line("sync-creator-char-forward-key"), /SHOW-ONLY/);
  assert.match(line("language"), /SHOW-ONLY/);
  assert.match(line("prefer-sync-data-provider"), /SHOW-ONLY/);
});

test("proposed values are converted the way each control saves them", () => {
  const entry = (key) => SETTINGS_GUIDE_ENTRY_BY_KEY.get(key);
  const h = harness();
  const registryByKey = registryMap(h);
  const item = (key) => registryByKey.get(key).item;
  const check = (key, value) => plain(normalizeSettingsAssistantValue(entry(key), item(key), value));
  assert.deepEqual(check("fullscreen-auto-hide-ui", "off"), { ok: true, value: false });
  assert.deepEqual(check("fullscreen-auto-hide-ui", "maybe"), { ok: false, reason: "not-a-toggle" });
  assert.deepEqual(check("fullscreen-auto-hide-delay", 4.3), { ok: true, value: 4.5, adjusted: true });
  assert.deepEqual(check("fullscreen-auto-hide-delay", "30s"), { ok: true, value: 10, adjusted: true });
  assert.deepEqual(check("fullscreen-auto-hide-delay", 2), { ok: true, value: 2, adjusted: false });
  assert.deepEqual(check("fullscreen-auto-hide-delay", "fast"), { ok: false, reason: "not-a-number" });
  assert.deepEqual(check("fullscreen-focus-presentation", "MOTION"), { ok: true, value: "motion" });
  assert.deepEqual(check("fullscreen-focus-presentation", "vinyl.presentation.motion"), { ok: false, reason: "unknown-option" });
  // ConfigSelection stores numeric option keys as integers.
  assert.deepEqual(check("lines-before", "3"), { ok: true, value: 3 });
  assert.deepEqual(check("text-shadow-color", "F0A"), { ok: true, value: "#ff00aa" });
  assert.deepEqual(check("text-shadow-color", "red"), { ok: false, reason: "not-a-color" });
  assert.deepEqual(check("phonetic-font-family", "  Noto Sans KR; } body{ "), { ok: true, value: "Noto Sans KR body" });
  assert.deepEqual(check("phonetic-font-family", ""), { ok: false, reason: "not-a-font" });
});

test("accepted changes are saved through the menus' handlers and rejected ones explain why", () => {
  const h = harness();
  const runtime = assistantRuntime(h);
  const registryByKey = registryMap(h);
  const plan = planSettingsAssistantChanges([
    { key: "fullscreen-auto-hide-ui", value: false },
    { key: "fullscreen-auto-hide-delay", value: 12 },
    { key: "fullscreen-auto-hide-ui", value: true },
    { key: "sync-creator-char-forward-key", value: "x" },
    { key: "made-up-setting", value: 1 },
    { key: "noise", value: h.visual.noise },
  ], { registryByKey, readValue: runtime.readValue, valuesEqual: runtime.valuesEqual });
  assert.deepEqual(plain(plan.rejected), [
    { key: "sync-creator-char-forward-key", reason: "show-only" },
    { key: "made-up-setting", reason: "unknown-setting" },
  ]);
  assert.deepEqual(plan.accepted.map(({ key, value, adjusted, unchanged }) => ({ key, value, adjusted, unchanged })), [
    { key: "fullscreen-auto-hide-ui", value: false, adjusted: false, unchanged: false },
    { key: "fullscreen-auto-hide-delay", value: 10, adjusted: true, unchanged: false },
    { key: "noise", value: h.visual.noise, adjusted: false, unchanged: true },
  ]);
  h.clearCalls();
  const { applied, failed } = applySettingsAssistantChanges(plan.accepted, { registryByKey, onSaveError: runtime.onSaveError });
  assert.deepEqual(applied.map(({ key }) => key), ["fullscreen-auto-hide-ui", "fullscreen-auto-hide-delay"]);
  assert.deepEqual(failed, []);
  assert.equal(h.visual["fullscreen-auto-hide-ui"], false);
  assert.equal(h.visual["fullscreen-auto-hide-delay"], 10);
  assert.deepEqual(h.saves.filter(({ method }) => method === "saveConfig").map(({ key, value }) => [key, value]), [
    ["fullscreen-auto-hide-ui", false], ["fullscreen-auto-hide-delay", 10],
  ]);
  const changed = readChangedSettingsForAssistant({ registryByKey, isSettingChanged: h.isSettingChanged, readValue: runtime.readValue });
  assert.equal(changed["fullscreen-auto-hide-ui"], false);
  assert.equal(changed["fullscreen-auto-hide-delay"], 10);
});

test("the background mode is changed through its own handler", () => {
  const h = harness();
  const runtime = assistantRuntime(h, { readValue: (key) => (key === h.SETTINGS_BACKGROUND_MODE_KEY ? h.getCurrentSettingsBackgroundMode() : h.visual[key]) });
  const registryByKey = registryMap(h);
  const plan = planSettingsAssistantChanges([{ key: h.SETTINGS_BACKGROUND_MODE_KEY, value: "solid-background" }],
    { registryByKey, readValue: runtime.readValue, valuesEqual: runtime.valuesEqual });
  assert.equal(plan.accepted.length, 1);
  applySettingsAssistantChanges(plan.accepted, { registryByKey, onSaveError: runtime.onSaveError });
  assert.equal(h.getCurrentSettingsBackgroundMode(), "solid-background");
});

test("the prompt carries the language, changed values and recent turns; replies are normalized", () => {
  const prompt = buildSettingsAssistantPrompt({
    catalog: "CATALOG", language: { code: "ko", name: "한국어" }, changedValues: { "font-size": 40 },
    history: [
      { role: "user", text: "글자 키워 줘" },
      { role: "assistant", text: "키웠어요", changes: [{ key: "font-size", value: 40 }], rejected: [{ key: "x", reason: "unknown-setting" }], show: ["lyric-layers"], undone: true },
    ],
    message: "조금 더",
  });
  assert.ok(prompt.systemPrompt.endsWith("CATALOG"));
  assert.match(prompt.systemPrompt, /Answer with one JSON object/);
  assert.equal(prompt.cacheSystemPrompt, true);
  assert.match(prompt.userPrompt, /Interface language: 한국어 \(ko\)/);
  assert.match(prompt.userPrompt, /"font-size":40/);
  assert.match(prompt.userPrompt, /HOW-TO TOPICS: none were sent with this message\./);
  assert.match(prompt.userPrompt, /User: 글자 키워 줘/);
  assert.match(prompt.userPrompt, /Assistant: 키웠어요 \[changed, then undone by the user: font-size=40; not changed: x \(unknown-setting\); shown: lyric-layers\]/);
  assert.match(prompt.userPrompt, /New message from the user:\n조금 더$/);

  assert.deepEqual(readSettingsAssistantReply({ reply: "**완료**", changes: { "font-size": 44 }, show: "lyric-layers" }),
    { reply: "**완료**", changes: [{ key: "font-size", value: 44 }], show: ["lyric-layers"] });
  assert.deepEqual(readSettingsAssistantReply({ message: "hi", changes: [{ key: "a" }, { key: " b ", value: 1 }] }),
    { reply: "hi", changes: [{ key: "b", value: 1 }], show: [] });
  // Asking for how-to topics is a usable reply on its own.
  assert.deepEqual(readSettingsAssistantReply({ reply: "", guide: ["video-submit", "video-submit", " sync-creator ", "a", "b"] }),
    { reply: "", changes: [], show: [], guide: ["video-submit", "sync-creator", "a"] });
  assert.equal(readSettingsAssistantReply({}), null);
  assert.equal(readSettingsAssistantReply([]), null);
  assert.equal(readSettingsAssistantReply("text"), null);
});

test("a conversation applies the reply, records what happened and can be undone", async () => {
  const h = harness();
  const requests = [];
  const runtime = assistantRuntime(h, {
    request: async (prompt, signal) => {
      requests.push({ prompt, signal });
      return {
        reply: "컨트롤러 자동 숨김을 껐어요.",
        changes: [
          { key: "fullscreen-auto-hide-ui", value: false },
          { key: "fullscreen-auto-hide-delay", value: 0 },
          { key: "sync-creator-char-forward-key", value: "x" },
        ],
        show: ["auto-hide", "lyrics-provider-list"],
      };
    },
  });
  let id = 0;
  const session = createSettingsAssistantSession({ createId: () => `m${++id}` });
  const snapshots = [];
  session.subscribe((state) => snapshots.push(state.pending));
  assert.equal(await session.send("  컨트롤러 숨기기 꺼 줘 ", runtime), true);
  assert.deepEqual(snapshots, [true, false]);
  assert.equal(requests.length, 1);
  assert.match(requests[0].prompt.userPrompt, /컨트롤러 숨기기 꺼 줘$/);
  assert.match(requests[0].prompt.systemPrompt, /- fullscreen-auto-hide-ui /);
  const [question, answer] = session.getState().messages;
  assert.deepEqual(plain(question), { id: "m1", role: "user", text: "컨트롤러 숨기기 꺼 줘" });
  assert.equal(answer.status, "done");
  assert.equal(answer.text, "컨트롤러 자동 숨김을 껐어요.");
  assert.deepEqual(plain(answer.changes), [
    { key: "fullscreen-auto-hide-ui", value: false, previous: true, adjusted: false },
    { key: "fullscreen-auto-hide-delay", value: 1, previous: 3, adjusted: true },
  ]);
  assert.deepEqual(plain(answer.rejected), [{ key: "sync-creator-char-forward-key", reason: "show-only" }]);
  assert.deepEqual(plain(answer.show), ["auto-hide", "lyrics-provider-list"]);
  assert.equal(h.visual["fullscreen-auto-hide-ui"], false);

  assert.equal(session.undo(answer.id, runtime), true);
  assert.equal(h.visual["fullscreen-auto-hide-ui"], true);
  assert.equal(h.visual["fullscreen-auto-hide-delay"], 3);
  assert.equal(session.getState().messages[1].undone, true);
  assert.equal(session.undo(answer.id, runtime), false, "a reply is undone once");

  // The next prompt tells the AI what happened before.
  await session.send("다시 해 줘", runtime);
  assert.match(requests[1].prompt.userPrompt, /changed, then undone by the user: fullscreen-auto-hide-ui=false/);
});

test("failed, unreadable and stopped requests leave a message and no changes", async () => {
  const h = harness();
  let release;
  const session = createSettingsAssistantSession();
  const fail = assistantRuntime(h, { request: async () => { throw new Error("quota exceeded"); } });
  await session.send("a", fail);
  assert.deepEqual(plain(session.getState().messages.at(-1)), {
    ...plain(session.getState().messages.at(-1)), status: "error", text: "quota exceeded", changes: [],
  });
  await session.send("b", assistantRuntime(h, { request: async () => ({ nothing: true }) }));
  assert.equal(session.getState().messages.at(-1).status, "invalid");

  const slow = assistantRuntime(h, {
    request: (prompt, signal) => new Promise((resolve, reject) => {
      release = resolve;
      signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
    }),
  });
  const pending = session.send("c", slow);
  assert.equal(session.getState().pending, true);
  assert.equal(await session.send("d", slow), false, "one request at a time");
  session.cancel();
  await pending;
  assert.equal(session.getState().messages.at(-1).status, "stopped");
  assert.equal(session.getState().pending, false);

  // Starting a new chat drops a late answer.
  const late = session.send("e", assistantRuntime(h, { request: () => new Promise((resolve) => { release = resolve; }) }));
  session.clear();
  release({ reply: "late", changes: [{ key: "fullscreen-auto-hide-ui", value: false }] });
  assert.equal(await late, false);
  assert.deepEqual(session.getState().messages, []);
  assert.equal(h.visual["fullscreen-auto-hide-ui"], true);
});

// Minimal hooks for rendering the panel function once.
function renderOnce(component, props) {
  const slots = [];
  let cursor = 0;
  const react = {
    createElement: (type, elementProps, ...children) => ({ type, props: { ...elementProps, children } }),
    Fragment: Symbol("Fragment"),
    useState: (initial) => {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
      return [slots[index], (next) => { slots[index] = next; }];
    },
    useMemo: (factory) => factory(),
    useRef: (current) => ({ current }),
    useEffect: () => {},
  };
  return { react, render: () => component(react)(props) };
}

test("the chat shows changed settings as the menus' own rows and other targets as links", () => {
  const h = harness();
  const OptionList = function OptionList() {};
  const navigations = [];
  const messages = [
    { id: "u", role: "user", text: "hide it" },
    {
      id: "a", role: "assistant", status: "done", text: "Done.", undone: false,
      changes: [{ key: "fullscreen-auto-hide-ui", value: false, previous: true, adjusted: true }],
      rejected: [{ key: "sync-creator-char-forward-key", reason: "show-only" }],
      show: ["fullscreen-auto-hide-delay", "controller-style", "lyrics-provider-list", "prefer-sync-data-provider", "lyric-layers", "nonexistent"],
    },
  ];
  const session = { getState: () => ({ messages, pending: false }), subscribe: () => () => {}, undo() {}, cancel() {}, clear() {}, send() {} };
  const { render } = renderOnce((react) => createSettingsAssistantPanel({
    react, session, translate: (key) => key, getSettingsText: (key, fallback) => fallback || key,
    SettingsUiIcon: () => null, SettingsOutlineIcon: () => null, OptionList,
    getCurrentSettingsBackgroundMode: () => "gradient-background",
  }), {
    runtime: assistantRuntime(h),
    navigateToDestination: (tabId, key) => navigations.push([tabId, key]),
  });
  const tree = render();
  assert.equal(tree.props["data-tab-id"], "assistant");
  const lists = elements(tree).filter((node) => node.type === OptionList);
  assert.equal(lists.length, 1);
  const items = lists[0].props.items;
  // A small section is shown as its rows; a large one (the layer table) as a card.
  const controllerRows = Array.from(h.api.buildSettingsRegistry())
    .filter((entry) => entry.tabId === "fullscreen" && entry.sectionKey === "controller-style").map((entry) => entry.key);
  assert.ok(controllerRows.length > 1 && controllerRows.length <= 6, String(controllerRows.length));
  assert.deepEqual(items.map((item) => item.key),
    ["fullscreen-auto-hide-ui", "fullscreen-auto-hide-delay", ...controllerRows].slice(0, 10));
  assert.ok(items.every((item) => item.when === undefined), "rows the user asked about are always shown");
  assert.equal(items[0].jump.label, getSettingsAssistantLocation("fullscreen", "auto-hide", (key) => key));
  items[0].jump.onClick();
  assert.deepEqual(navigations.pop(), ["fullscreen", "fullscreen-auto-hide-ui"]);
  h.clearCalls();
  items[0].onChange("fullscreen-auto-hide-ui", false);
  assert.equal(h.visual["fullscreen-auto-hide-ui"], false, "chat rows save through the registry handler");
  const links = elements(tree).filter((node) => node.props.className === "settings-assistant-link");
  assert.deepEqual(links.map((node) => node.key ?? node.props.key),
    ["link-lyrics-provider-list", "link-prefer-sync-data-provider", "link-lyric-layers"]);
  const openButton = elements(links[0]).find((node) => node.type === "button");
  openButton.props.onClick();
  assert.deepEqual(navigations.pop(), ["lyrics-providers", "lyrics-provider-list"]);
  const notes = elements(tree).filter((node) => typeof node.props.className === "string" && node.props.className.startsWith("settings-assistant-note"));
  assert.equal(notes.length, 2, "adjusted and skipped notes");
});

test("settings search is built from the guide and drops removed settings", () => {
  const catalog = buildSettingsSearchCatalog({ translate: (key) => key });
  const keys = new Set(catalog.map((entry) => `${entry.sectionKey}:${entry.settingKey}`));
  for (const stale of ["auto-scroll", "animation", "karaoke", "blur-inactive", "synced-fallback", "unsynced-fallback"]) {
    assert.ok(!catalog.some((entry) => entry.settingKey === stale), `${stale} is not a setting anymore`);
  }
  for (const entry of SETTINGS_GUIDE_SETTINGS) {
    assert.equal(keys.has(`${entry.tab}:${entry.key}`), entry.searchable !== false, entry.key);
  }
  for (const section of SETTINGS_GUIDE_SECTIONS) assert.ok(keys.has(`${section.tab}:${section.key}`), section.key);
  const assistantMenu = catalog.find((entry) => entry.sectionKey === "assistant" && entry.settingKey === null);
  assert.equal(assistantMenu?.isTabResult, true);
  const lpFont = catalog.find((entry) => entry.settingKey === "fullscreen-vinyl-phonetic-font-family");
  assert.ok(lpFont.i18nKeys.includes("vinyl.mode"), "fullscreen view labels find their settings");
  const autoHide = catalog.find((entry) => entry.settingKey === "fullscreen-auto-hide-ui");
  assert.ok(autoHide.keywords.includes("자동숨김"));
});

test("without a provider the chat explains what to enable and does not send", () => {
  const h = harness();
  const navigations = [];
  const sent = [];
  const session = {
    getState: () => ({ messages: [], pending: false }), subscribe: () => () => {},
    send: (...args) => sent.push(args), undo() {}, cancel() {}, clear() {},
  };
  const { render } = renderOnce((react) => createSettingsAssistantPanel({
    react, session, translate: (key) => key, getSettingsText: (key, fallback) => fallback || key,
    SettingsUiIcon: () => null, SettingsOutlineIcon: () => null, OptionList: () => null,
    getCurrentSettingsBackgroundMode: () => "gradient-background",
  }), {
    runtime: assistantRuntime(h, { hasProvider: () => false }),
    navigateToDestination: (tabId, key) => navigations.push([tabId, key]),
  });
  const tree = render();
  const notice = elements(tree).find((node) => node.props.className === "settings-assistant-notice");
  assert.ok(notice, "the provider notice is shown");
  elements(notice).find((node) => node.type === "button").props.onClick();
  assert.deepEqual(navigations, [["ai-providers", "ai-tasks"]]);
  const input = elements(tree).find((node) => node.type === "textarea");
  assert.equal(input.props.disabled, true);
  const examples = elements(tree).filter((node) => node.props.className === "settings-assistant-example");
  assert.ok(examples.length > 0 && examples.every((node) => node.props.disabled));
  examples[0].props.onClick();
  input.props.onKeyDown({ key: "Enter", shiftKey: false, preventDefault() {} });
  assert.deepEqual(sent, []);
});

test("a search with no results can be sent to the assistant", () => {
  const h = harness({}, {}, { runEffects: true });
  h.runEffects();
  h.render();
  h.api.handleSearchChange({ target: { value: "zzzz-nothing-matches" } });
  h.render();
  assert.equal(h.api.searchResults.length, 0);
  const panel = h.api.renderSearchPanel();
  const ask = elements(panel).find((node) => node.props.className === "settings-search-result settings-search-ask");
  assert.ok(ask, "the no-results panel offers the assistant");
  assert.equal(h.api.activeTab, "general");
  h.api.handleSearchKeyDown({ key: "Enter", preventDefault() {} });
  h.render();
  assert.equal(h.api.activeTab, "assistant");
  assert.equal(h.api.searchQuery, "");
});
