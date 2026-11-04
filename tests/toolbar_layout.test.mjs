import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

// The lyrics-page floating toolbar, rendered from the real OptionsMenu.js with
// a small hook-aware renderer (no DOM): its layout, every action of the old
// toolbar in its new place, and the handlers each control still reaches.
const read = (name) => readFileSync(new URL("../" + name, import.meta.url), "utf8");
const optionsSource = read("OptionsMenu.js");
const indexSource = read("index.js");

const KO = (() => {
  const context = { window: {} };
  vm.runInNewContext(read("langs/LangKo.js"), context);
  return Object.values(context.window)[0];
})();
const t = (key) => key.split(".").reduce((value, part) => value?.[part], KO) ?? key;

const slice = (source, start, end) => {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, "missing source section: " + start);
  return source.slice(from, to);
};

const ACTION_NAMES = [
  "onSelectMode", "onSetModeLock", "onToggleModeLock", "getRegenerateChoices", "onRegenerate",
  "onOpenLyricsEditor", "getCurrentTrackInfo", "onSelectProvider", "onImportLocalLyricsFile",
  "onApplyLocalLyrics", "getHasLocalLyrics", "onDeleteLocalLyrics", "onSelectBackground", "onVideoSelect",
  "getSyncCreatorTrackInfo", "getShareTrackInfo", "onToggleMarketplace", "onToggleFullscreen",
  "onToggleMenu", "onCloseMenu", "onVisualConfigChange", "setEngaged", "setContentRef",
];

function createToolbar(initialProps = {}) {
  const calls = [];
  const record = (name) => (...args) => {
    calls.push([name, ...args]);
  };
  const slots = new Map();
  let slot = null;
  const hook = () => slot.index++;
  const useState = (initial) => {
    const owner = slot;
    const index = hook();
    if (!(index in owner.hooks)) owner.hooks[index] = typeof initial === "function" ? initial() : initial;
    return [owner.hooks[index], (next) => {
      owner.hooks[index] = typeof next === "function" ? next(owner.hooks[index]) : next;
    }];
  };
  const useRef = (value) => {
    const owner = slot;
    const index = hook();
    if (!(index in owner.hooks)) owner.hooks[index] = { current: value };
    return owner.hooks[index];
  };
  const useMemo = (factory, deps) => {
    const owner = slot;
    const index = hook();
    const previous = owner.hooks[index];
    if (previous && deps && previous.deps.length === deps.length && deps.every((dep, i) => Object.is(dep, previous.deps[i]))) {
      return previous.value;
    }
    owner.hooks[index] = { value: factory(), deps: deps || [] };
    return owner.hooks[index].value;
  };
  const useCallback = (callback, deps) => useMemo(() => callback, deps);
  const useEffect = () => {
    hook();
  };
  const Fragment = Symbol("Fragment");
  const react = {
    Fragment,
    memo: (component) => component,
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
    useState,
    useRef,
    useMemo,
    useCallback,
    useEffect,
    useLayoutEffect: useEffect,
  };
  // Function components keep their hook slots by tree position, as in React.
  const expand = (node, path) => {
    if (Array.isArray(node)) {
      return node.flatMap((child, index) => expand(child, path + "." + (child?.props?.key ?? index)));
    }
    if (node === null || node === undefined || node === false || node === true) return [];
    if (typeof node !== "object") return [String(node)];
    if (node.type === Fragment) return expand(node.children, path);
    if (typeof node.type === "function") {
      let state = slots.get(path);
      if (!state || state.type !== node.type) {
        state = { type: node.type, hooks: [] };
        slots.set(path, state);
      }
      const previous = slot;
      slot = state;
      state.index = 0;
      const props = { ...node.props };
      if (node.children.length) props.children = node.children.length === 1 ? node.children[0] : node.children;
      const output = node.type(props);
      slot = previous;
      return expand(output, path + ">");
    }
    return [{ type: node.type, props: node.props, children: expand(node.children, path + "/" + node.type) }];
  };

  const learning = { open: false };
  const storage = new Map();
  const CONFIG = {
    visual: {
      "fullscreen-key": "ctrl+shift+f",
      "karaoke-mode-enabled": true,
      "quick-sync-controls-enabled": true,
      "translation-mode:japanese": "gemini_romaji",
      "translation-mode-2:japanese": "gemini_ko",
      "translate:target-language": "auto",
      "translate:display-mode": "below",
    },
  };
  const window = {
    innerWidth: 1440,
    innerHeight: 900,
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: record("dispatchEvent"),
    LyricsAddonManager: {
      getEnabledProviders: () => [{ id: "spotify", name: "Spotify" }, { id: "lrclib", name: "LRCLIB" }],
    },
    IvLyricsLearningMode: {
      isOpen: () => learning.open,
      subscribe: () => () => {},
      open: () => {
        learning.open = true;
        calls.push(["learning.open"]);
      },
      toggle: () => {
        learning.open = !learning.open;
        calls.push(["learning.toggle", learning.open]);
      },
    },
    TrackLanguageDB: { setLanguage: record("TrackLanguageDB.setLanguage"), clearLanguage: record("TrackLanguageDB.clearLanguage") },
    LyricsService: { clearLyricsSnapshot: record("clearLyricsSnapshot") },
    lyricContainer: null,
  };
  const context = vm.createContext({
    react, useState, useEffect, useCallback, useMemo, useRef,
    APP_NAME: "ivLyrics",
    CONFIG,
    I18n: { t, getCurrentLanguage: () => "ko" },
    StorageManager: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => {
        storage.set(key, value);
        calls.push(["setItem", key, value]);
      },
      saveConfig: record("saveConfig"),
    },
    Utils: {
      extractTrackId: (uri) => /^spotify:track:(\w+)$/.exec(uri || "")?.[1] || null,
      getTrackSyncOffset: async () => 0,
      getGlobalSyncOffset: () => 0,
      setGlobalSyncOffset: record("setGlobalSyncOffset"),
    },
    Toast: { show: record("toast"), success: record("toast"), error: record("toast") },
    lyricContainerUpdate: record("lyricContainerUpdate"),
    openConfig: record("openConfig"),
    getSettingsMotionDurationMs: () => 0,
    ConfigSlider: "ConfigSlider",
    ConfigButton: "ConfigButton",
    Spicetify: { Player: { data: { item: { uri: "spotify:track:abc" } } } },
    window,
    document: {
      addEventListener() {},
      removeEventListener() {},
      querySelector: () => null,
      getElementById: () => null,
      activeElement: null,
    },
    localStorage: { getItem: () => null },
    CustomEvent: class {
      constructor(type, init) {
        this.type = type;
        this.detail = init?.detail;
      }
    },
    Intl,
    console,
    setTimeout: (callback) => {
      callback();
      return 0;
    },
    clearTimeout() {},
    requestAnimationFrame: () => 0,
    cancelAnimationFrame() {},
  });
  vm.runInContext(optionsSource + "\n;globalThis.__toolbar = { IvLyricsFloatingToolbar, getRegenerateTranslationChoiceItems };", context);
  // Dialogs a panel hands over to (function declarations, so they can be watched).
  for (const name of ["openCommunityVideoSelector", "openShareImageModal", "openSyncDataCreator", "openLocalLyricsLrclibSearchModal"]) {
    context[name] = record(name);
  }

  let hasLocalLyrics = true;
  const actions = Object.fromEntries(ACTION_NAMES.map((name) => [name, record(name)]));
  actions.getRegenerateChoices = () => context.__toolbar.getRegenerateTranslationChoiceItems({
    targets: { needPhonetic: true, needTranslation: true },
    includeCulturalAnnotations: true,
    includeWordSupplements: true,
  });
  actions.getHasLocalLyrics = () => hasLocalLyrics;
  actions.getCurrentTrackInfo = () => ({ title: "Song", artist: "Artist" });
  actions.getSyncCreatorTrackInfo = () => ({ uri: "spotify:track:abc", name: "Song" });
  actions.getShareTrackInfo = () => ({ name: "Song", artist: "Artist", cover: "" });
  Object.freeze(actions);

  const lyrics = [{ text: "line" }];
  let props = {
    actions,
    isFullscreen: false,
    isMenuOpen: false,
    isMenuClosing: false,
    contentTopOffset: 0,
    modeKey: "synced",
    lockedModeKey: null,
    lockInEffect: false,
    hasKaraoke: true,
    karaokeEnabled: true,
    hasSynced: true,
    hasUnsynced: true,
    showConvert: true,
    friendlyLanguage: "japanese",
    detectedLanguage: "ja",
    canRegenerate: true,
    isRegenerating: false,
    hasLyrics: true,
    isLyricsLoading: false,
    isLyricsEditBusy: false,
    syncTrackUri: "spotify:track:abc",
    canAdjustTrackSync: true,
    quickSyncEnabled: true,
    trackUri: "spotify:track:abc",
    trackTitle: "Song",
    trackArtist: "Artist",
    isLocalTrack: false,
    currentProvider: "spotify",
    providerOverride: null,
    backgroundOverride: null,
    effectiveBackground: "video-background",
    videoEnabled: true,
    videoInfo: { youtubeVideoId: "vid" },
    videoStartTime: 12,
    lyrics,
    showMarketplace: false,
    canToggleFullscreen: true,
    ...initialProps,
  };
  let tree = [];
  const render = () => {
    tree = expand(react.createElement(context.__toolbar.IvLyricsFloatingToolbar, props), "root");
    return tree;
  };
  render();
  return {
    calls,
    CONFIG,
    lyrics,
    learning,
    get tree() {
      return tree;
    },
    render,
    setProps(next) {
      props = { ...props, ...next };
      return render();
    },
    setHasLocalLyrics(value) {
      hasLocalLyrics = value;
    },
  };
}

const nodesOf = (tree) => tree.flatMap((node) => (typeof node === "string" ? [] : [node, ...nodesOf(node.children)]));
// Values created inside the vm context have that realm's prototypes.
const plain = (value) => JSON.parse(JSON.stringify(value));
const textOf = (node) => (typeof node === "string" ? node : node.children.map(textOf).join(""));
const classes = (node) => String(node.props?.className || "").split(" ");
const hasClass = (node, name) => classes(node).includes(name);
const entryButton = (toolbar, id) => nodesOf(toolbar.tree).find((node) => hasClass(node, "ivl-tb-item") && node.props["data-entry"] === id);
const panel = (toolbar) => nodesOf(toolbar.tree).find((node) => hasClass(node, "ivl-tb-fly"));
const event = { preventDefault() {}, stopPropagation() {}, target: { closest: () => null }, clientX: 0, clientY: 0 };
const click = (toolbar, node) => {
  assert.ok(node, "control to click exists");
  node.props.onClick(event);
  return toolbar.render();
};
const openPanel = (toolbar, id) => click(toolbar, entryButton(toolbar, id));
const inPanel = (toolbar, predicate) => nodesOf(panel(toolbar) ? [panel(toolbar)] : []).filter(predicate);
const byText = (className, text) => (node) => hasClass(node, className) && textOf(node).trim() === text;
const rowLabel = (text) => byText("ivl-tb-row-label", text);
const menuItem = (text) => (node) => hasClass(node, "ivl-tb-mi") &&
  nodesOf([node]).some((child) => hasClass(child, "ivl-tb-mi-label") && textOf(child) === text);
const findOne = (toolbar, predicate, what) => {
  const found = inPanel(toolbar, predicate);
  assert.equal(found.length, 1, what + " appears once in the open panel");
  return found[0];
};

test("seven labelled entries sit in three groups, named after the current mode", () => {
  const toolbar = createToolbar();
  const groups = nodesOf(toolbar.tree).filter((node) => hasClass(node, "ivl-tb-cluster"));
  assert.deepEqual(groups.map((group) => nodesOf([group]).filter((node) => hasClass(node, "ivl-tb-item")).map((node) => node.props["data-entry"])),
    [["mode", "convert", "sync"], ["track", "more"], ["settings", "fullscreen"]]);
  const labels = nodesOf(toolbar.tree).filter((node) => hasClass(node, "ivl-tb-label")).map(textOf);
  assert.deepEqual(labels, [t("modes.synced"), t("menu.translation"), t("menu.syncAdjust"), t("menu.currentTrack"), t("menu.more"), t("menu.settings"), t("menu.fullscreen")]);
  for (const id of ["mode", "convert", "sync", "track", "more"]) {
    assert.equal(entryButton(toolbar, id).props["aria-haspopup"], "dialog");
    assert.equal(entryButton(toolbar, id).props["aria-expanded"], false);
  }
  toolbar.setProps({ modeKey: "word", lockedModeKey: "word", lockInEffect: true });
  assert.equal(textOf(entryButton(toolbar, "mode")), t("modes.word"));
  assert.equal(entryButton(toolbar, "mode").props["aria-label"], t("settings.lyricsMode.label") + " · " + t("modes.word") + " · " + t("modes.locked"));
  assert.ok(nodesOf([entryButton(toolbar, "mode")]).some((node) => hasClass(node, "ivl-tb-lock")));
  // Entries with nothing to offer disappear; an empty group goes with them.
  toolbar.setProps({ showConvert: false, canToggleFullscreen: false });
  assert.equal(entryButton(toolbar, "convert"), undefined);
  assert.equal(entryButton(toolbar, "fullscreen"), undefined);
  assert.equal(nodesOf(toolbar.tree).filter((node) => hasClass(node, "ivl-tb-cluster")).length, 3);
});

test("the toolbar shows state: changed sync and track settings, a running regeneration", () => {
  const toolbar = createToolbar();
  assert.ok(!nodesOf([entryButton(toolbar, "track")]).some((node) => hasClass(node, "ivl-tb-dot")));
  toolbar.setProps({ backgroundOverride: "colorful" });
  assert.ok(nodesOf([entryButton(toolbar, "track")]).some((node) => hasClass(node, "ivl-tb-dot")));
  toolbar.setProps({ backgroundOverride: null, providerOverride: "lrclib" });
  assert.ok(nodesOf([entryButton(toolbar, "track")]).some((node) => hasClass(node, "ivl-tb-dot")));
  toolbar.setProps({ isRegenerating: true });
  assert.ok(hasClass(entryButton(toolbar, "convert"), "is-busy"));
});

test("fullscreen folds every entry into one menu button", () => {
  const toolbar = createToolbar({ isFullscreen: true });
  assert.deepEqual(nodesOf(toolbar.tree).filter((node) => hasClass(node, "ivl-tb-item")).map((node) => node.props["data-entry"]), ["menu"]);
  const toggle = entryButton(toolbar, "menu");
  assert.equal(toggle.props["aria-label"], t("fullscreen.menuToggle"));
  assert.equal(textOf(toggle), t("fullscreen.menuToggleShort"));
  click(toolbar, toggle);
  assert.deepEqual(toolbar.calls.filter(([name]) => name === "onToggleMenu").length, 1);
  toolbar.setProps({ isMenuOpen: true });
  assert.equal(nodesOf(toolbar.tree).filter((node) => hasClass(node, "ivl-tb-item")).length, 8);
  assert.equal(textOf(entryButton(toolbar, "menu")), t("buttons.close"));
  assert.equal(entryButton(toolbar, "fullscreen").props["aria-label"], t("menu.exitFullscreen"));
  assert.equal(entryButton(toolbar, "fullscreen").props["aria-pressed"], true);
});

// Where each action of the previous toolbar (17 buttons, their popups and the
// right-click lock, minus the redundant combined regeneration) lives now.
// In-panel controls live in the panel; dialogs are reached through their entry.
const PLACEMENT = {
  mode: ["mode.character", "mode.word", "mode.synced", "mode.unsynced", "mode.lock"],
  convert: [
    "translation", "translation.pronunciation", "translation.notation", "translation.translation", "translation.target",
    "translation.detected", "translation.override", "translation.aiSettings", "regenerate", "regenerate.phonetic",
    "regenerate.translation", "regenerate.cultural", "regenerate.words", "cacheEdit", "cacheEdit.shift", "cacheEdit.save",
  ],
  sync: ["syncAdjust", "syncAdjust.track", "syncAdjust.global", "syncAdjust.reset", "quickSync"],
  track: [
    "provider", "provider.current", "provider.select", "local.current", "local.import", "local.search", "local.delete",
    "trackBackground", "trackBackground.current", "trackBackground.select", "communityVideo", "communityVideo.random",
    "communityVideo.hideDisliked", "communityVideo.apply", "communityVideo.preview", "communityVideo.add", "syncCreator",
  ],
  more: [
    "study", "study.panel", "shareImage", "shareImage.copyright", "shareImage.select", "shareImage.preset", "shareImage.advanced",
    "shareImage.copy", "shareImage.download", "shareImage.share", "marketplace",
  ],
  settings: ["settings"],
  fullscreen: ["fullscreen", "menuToggle"],
};

test("every retained toolbar action has exactly one place in the new layout", () => {
  const ids = Object.values(PLACEMENT).flat();
  assert.equal(ids.length, 57);
  assert.equal(new Set(ids).size, 57, "no action is placed twice");

  // Each in-panel control: which panel view shows it.
  const views = {};
  const snapshot = (name, toolbar) => {
    views[name] = nodesOf(panel(toolbar) ? [panel(toolbar)] : []);
  };
  const toolbar = createToolbar();
  for (const id of ["mode", "convert", "sync", "track", "more"]) {
    openPanel(toolbar, id);
    snapshot(id, toolbar);
    if (id === "track") {
      click(toolbar, findOne(toolbar, menuItem(t("menu.lyricsProviderSelect")), "provider item"));
      snapshot("track/provider", toolbar);
      click(toolbar, nodesOf([panel(toolbar)]).find((node) => hasClass(node, "ivl-tb-fly-back")));
      click(toolbar, findOne(toolbar, menuItem(t("menu.trackBackground")), "background item"));
      snapshot("track/background", toolbar);
    }
    openPanel(toolbar, id === "track" ? "track" : id);
  }
  const local = createToolbar({ isLocalTrack: true, trackUri: "spotify:local:a:b:c:1" });
  openPanel(local, "track");
  click(local, findOne(local, menuItem(t("menu.localLyricsTools")), "local lyrics item"));
  snapshot("track/local", local);

  const label = (text, className = "ivl-tb-row-label") => (node) => hasClass(node, className) && textOf(node).trim() === text;
  const chip = (text) => (node) => hasClass(node, "ivl-tb-chip") && textOf(node).trim() === text;
  const title = (text) => (node) => hasClass(node, "ivl-tb-fly-title") && textOf(node) === text;
  const sectionTitle = (text) => label(text, "ivl-tb-sec-title");
  const listbox = (text) => (node) => node.props?.role === "listbox" && node.props["aria-label"] === text;
  const radio = (text) => (node) => node.props?.role === "radio" && textOf(node).startsWith(text);
  const menu = (text) => menuItem(text);
  const locate = {
    "mode.character": radio(t("modes.character")),
    "mode.word": radio(t("modes.word")),
    "mode.synced": radio(t("modes.synced")),
    "mode.unsynced": radio(t("modes.unsynced")),
    "mode.lock": label(t("modes.lockSelected")),
    translation: title(t("menu.translationSettings")),
    "translation.pronunciation": label(t("menu.pronunciation")),
    "translation.notation": label(t("menu.pronunciationNotation")),
    "translation.translation": label(t("menu.translationLabel")),
    "translation.target": label(t("menu.translationTargetLang")),
    "translation.detected": label(t("menu.detectedLanguageInfo"), "ivl-tb-row-desc"),
    "translation.override": label(t("menu.overrideLanguage")),
    "translation.aiSettings": label(t("menu.apiKeySettings")),
    regenerate: sectionTitle(t("menu.regenerateTranslation")),
    "regenerate.phonetic": chip(t("menu.regeneratePronunciationOnly")),
    "regenerate.translation": chip(t("menu.regenerateTranslationOnly")),
    "regenerate.cultural": chip(t("settings.culturalAnnotations.label")),
    "regenerate.words": chip(t("menu.regenerateWordDetails")),
    cacheEdit: label(t("lyricsCacheEditor.button")),
    syncAdjust: title(t("menu.syncAdjustTitle")),
    "syncAdjust.track": sectionTitle(t("syncAdjust.trackTitle")),
    "syncAdjust.global": sectionTitle(t("syncAdjust.globalTitle")),
    "syncAdjust.reset": (node) => node.type === "button" && textOf(node).trim() === t("syncAdjust.reset"),
    quickSync: label(t("settingsAdvanced.playback.quickSyncControls.label")),
    provider: menu(t("menu.lyricsProviderSelect")),
    "provider.current": label(t("menu.lyricsProviderCurrent")),
    "provider.select": listbox(t("menu.lyricsProviderSelect")),
    "local.current": label(t("menu.localLyricsCurrent")),
    "local.import": label(t("menu.importLrcFile")),
    "local.search": label(t("menu.searchLrclibLocal")),
    "local.delete": label(t("menu.localLyricsDelete")),
    trackBackground: menu(t("menu.trackBackground")),
    "trackBackground.current": label(t("menu.trackBackgroundCurrent")),
    "trackBackground.select": listbox(t("menu.trackBackgroundSelect")),
    communityVideo: menu(t("communityVideo.selectVideo")),
    syncCreator: menu(t("syncCreator.buttonTooltip")),
    study: menu(t("learningMode.button")),
    shareImage: menu(t("menu.shareImage")),
    marketplace: menu(t("marketplace.title")),
  };
  const viewOwner = (view) => view.split("/")[0];
  for (const [entry, actions] of Object.entries(PLACEMENT)) {
    for (const id of actions) {
      if (!locate[id]) continue;
      const homes = Object.entries(views).flatMap(([view, nodes]) => nodes.filter(locate[id]).map(() => view));
      assert.equal(homes.length, 1, id + " is shown exactly once (found in " + JSON.stringify(homes) + ")");
      assert.equal(viewOwner(homes[0]), entry, id + " lives under " + entry);
    }
  }

  // Actions inside dialogs: the dialog keeps them; the panel reaches the dialog.
  const dialogActions = {
    "cacheEdit.shift": () => assert.match(slice(indexSource, "const LyricsCacheEditModal =", "const GENERATION_PILL_TIMING"), /lyricsCacheEditor\.shiftDown/),
    "cacheEdit.save": () => assert.match(slice(indexSource, "const LyricsCacheEditModal =", "const GENERATION_PILL_TIMING"), /lyricsCacheEditor\.save/),
    "study.panel": () => assert.match(indexSource, /window\.IvLyricsLearningMode\.StudyPanel/),
  };
  const videoSource = read("CommunityVideoSelector.js");
  for (const [id, key] of [["communityVideo.random", "randomSelectionLabel"], ["communityVideo.hideDisliked", "hideDislikedLabel"],
    ["communityVideo.apply", "apply"], ["communityVideo.preview", "preview"], ["communityVideo.add", "addVideoNoEmoji"]]) {
    dialogActions[id] = () => assert.ok(videoSource.includes('"communityVideo.' + key + '"'), id + " stays in the video dialog");
  }
  const shareSource = slice(optionsSource, "const ShareImageModal =", "// Open Share Image Modal");
  for (const [id, key] of [["shareImage.copyright", "shareImage.copyrightTitle"], ["shareImage.select", "shareImage.selectLyrics"],
    ["shareImage.preset", "shareImage.template"], ["shareImage.advanced", "share-image-advanced-panel"], ["shareImage.copy", "shareImage.actions.copy"],
    ["shareImage.download", "shareImage.actions.download"], ["shareImage.share", "shareImage.actions.share"]]) {
    dialogActions[id] = () => assert.ok(shareSource.includes(key), id + " stays in the share dialog");
  }
  for (const id of ids) {
    if (locate[id] || ["settings", "fullscreen", "menuToggle"].includes(id)) continue;
    assert.ok(dialogActions[id], id + " is accounted for");
    dialogActions[id]();
  }
});

test("mode panel: choices, unavailable modes with the reason, and the lock switch", () => {
  const toolbar = createToolbar({ hasKaraoke: false, hasSynced: true, modeKey: "synced" });
  openPanel(toolbar, "mode");
  const radios = inPanel(toolbar, (node) => node.props?.role === "radio");
  assert.deepEqual(radios.map((node) => node.props.disabled), [true, true, false, false]);
  assert.deepEqual(radios.map((node) => node.props["aria-checked"]), [false, false, true, false]);
  assert.ok(textOf(radios[0]).includes(t("modes.unavailableNoKaraoke")));
  click(toolbar, radios[3]);
  assert.deepEqual(toolbar.calls.find(([name]) => name === "onSelectMode"), ["onSelectMode", "unsynced"]);
  const lockSwitch = inPanel(toolbar, (node) => node.type === "input" && node.props.role === "switch")[0];
  assert.equal(lockSwitch.props.checked, false);
  lockSwitch.props.onChange({ target: { checked: true } });
  assert.deepEqual(toolbar.calls.find(([name]) => name === "onSetModeLock"), ["onSetModeLock", true]);

  toolbar.setProps({ hasKaraoke: true, karaokeEnabled: false, hasSynced: false });
  const reasons = inPanel(toolbar, (node) => node.props?.role === "radio").map(textOf);
  assert.ok(reasons[0].includes(t("modes.unavailableKaraokeOff")));
  assert.ok(reasons[2].includes(t("modes.unavailableNoSynced")));
  // Right-clicking the entry still toggles the lock.
  entryButton(toolbar, "mode").props.onContextMenu(event);
  assert.ok(toolbar.calls.some(([name]) => name === "onToggleModeLock"));
});

test("conversion panel writes the same settings and reaches the same tools", () => {
  const toolbar = createToolbar();
  openPanel(toolbar, "convert");
  const switches = inPanel(toolbar, (node) => node.type === "input" && node.props.role === "switch");
  switches[0].props.onChange({ target: { checked: false } });
  assert.equal(toolbar.CONFIG.visual["translation-mode:japanese"], "none");
  assert.ok(toolbar.calls.some(([name, key, value]) => name === "setItem" && key === "ivLyrics:visual:translation-mode:japanese" && value === "none"));
  assert.ok(toolbar.calls.some(([name]) => name === "lyricContainerUpdate"));
  toolbar.render();
  assert.equal(inPanel(toolbar, rowLabel(t("menu.pronunciationNotation"))).length, 0, "notation hides with pronunciation off");
  inPanel(toolbar, (node) => node.type === "input" && node.props.role === "switch")[1].props.onChange({ target: { checked: true } });
  assert.equal(toolbar.CONFIG.visual["translation-mode-2:japanese"], "gemini_ko");

  click(toolbar, findOne(toolbar, (node) => hasClass(node, "ivl-tb-chip") && textOf(node).trim() === t("settings.culturalAnnotations.label"), "cultural chip"));
  assert.deepEqual(toolbar.calls.find(([name]) => name === "onRegenerate"), ["onRegenerate", "cultural-annotations"]);
  click(toolbar, findOne(toolbar, (node) => node.type === "button" && textOf(node) === t("buttons.edit"), "cache editor button"));
  assert.ok(toolbar.calls.some(([name]) => name === "onOpenLyricsEditor"));

  openPanel(toolbar, "convert");
  click(toolbar, findOne(toolbar, (node) => node.type === "button" && textOf(node) === t("menu.openSettings"), "AI settings button"));
  assert.deepEqual(plain(toolbar.calls.filter(([name]) => name === "openConfig").at(-1)), ["openConfig", { initialTab: "ai-providers" }]);
  assert.equal(panel(toolbar), undefined, "the panel closes when the settings open");
});

test("sync panel edits the global offset, the quick sync switch and resets", () => {
  const toolbar = createToolbar();
  openPanel(toolbar, "sync");
  const steps = inPanel(toolbar, (node) => node.type === "button" && node.props["aria-label"] === t("syncAdjust.globalTitle") + " +100ms");
  click(toolbar, steps[0]);
  assert.deepEqual(toolbar.calls.find(([name]) => name === "setGlobalSyncOffset"), ["setGlobalSyncOffset", 100]);
  inPanel(toolbar, (node) => node.type === "input" && node.props.role === "switch")[0].props.onChange({ target: { checked: false } });
  assert.deepEqual(toolbar.calls.find(([name]) => name === "onVisualConfigChange"), ["onVisualConfigChange", "quick-sync-controls-enabled", false]);
  const range = inPanel(toolbar, (node) => node.type === "input" && node.props.type === "range")[0];
  assert.deepEqual([range.props.min, range.props.max, range.props.step], [-10000, 10000, 10]);
  assert.ok(nodesOf([entryButton(toolbar, "sync")]).some((node) => hasClass(node, "ivl-tb-dot")), "a changed offset marks the entry");
  const reset = inPanel(toolbar, (node) => node.type === "button" && textOf(node).trim() === t("syncAdjust.reset"))[0];
  assert.equal(reset.props.disabled, false);
  click(toolbar, reset);
  assert.deepEqual(toolbar.calls.filter(([name]) => name === "setGlobalSyncOffset").at(-1), ["setGlobalSyncOffset", 0]);
  assert.ok(!nodesOf([entryButton(toolbar, "sync")]).some((node) => hasClass(node, "ivl-tb-dot")));
  toolbar.setProps({ canAdjustTrackSync: false });
  assert.equal(inPanel(toolbar, (node) => hasClass(node, "ivl-tb-sec-title") && textOf(node) === t("syncAdjust.trackTitle")).length, 0);
});

test("current-track panel drills into provider and background views and opens the right dialogs", () => {
  const toolbar = createToolbar();
  openPanel(toolbar, "track");
  click(toolbar, findOne(toolbar, menuItem(t("menu.lyricsProviderSelect")), "provider item"));
  assert.equal(textOf(nodesOf([panel(toolbar)]).find((node) => hasClass(node, "ivl-tb-fly-title"))), t("menu.lyricsProviderSelect"));
  const lrclib = inPanel(toolbar, (node) => node.props?.role === "option" && textOf(node) === "LRCLIB")[0];
  click(toolbar, lrclib);
  return new Promise((resolve) => setImmediate(resolve)).then(() => {
    toolbar.render();
    assert.deepEqual(toolbar.calls.find(([name]) => name === "onSelectProvider"), ["onSelectProvider", "lrclib"]);
    assert.equal(textOf(nodesOf([panel(toolbar)]).find((node) => hasClass(node, "ivl-tb-fly-title"))), t("menu.currentTrack"), "back to 현재 곡 after choosing");

    click(toolbar, findOne(toolbar, menuItem(t("menu.trackBackground")), "background item"));
    click(toolbar, inPanel(toolbar, (node) => node.props?.role === "option" && textOf(node) === t("settings.colorful.label"))[0]);
    assert.deepEqual(toolbar.calls.find(([name]) => name === "onSelectBackground"), ["onSelectBackground", "colorful"]);
    click(toolbar, inPanel(toolbar, (node) => node.props?.role === "option" && textOf(node) === t("menu.trackBackgroundUseGlobal"))[0]);
    assert.deepEqual(toolbar.calls.filter(([name]) => name === "onSelectBackground").at(-1), ["onSelectBackground", null]);

    click(toolbar, nodesOf([panel(toolbar)]).find((node) => hasClass(node, "ivl-tb-fly-back")));
    click(toolbar, findOne(toolbar, menuItem(t("communityVideo.selectVideo")), "video item"));
    const video = toolbar.calls.find(([name]) => name === "openCommunityVideoSelector");
    assert.deepEqual(video.slice(0, 3), ["openCommunityVideoSelector", "spotify:track:abc", "vid"]);
    assert.equal(video[4], 12);
    openPanel(toolbar, "track");
    click(toolbar, findOne(toolbar, menuItem(t("syncCreator.buttonTooltip")), "sync creator item"));
    assert.deepEqual(plain(toolbar.calls.find(([name]) => name === "openSyncDataCreator")), ["openSyncDataCreator", { uri: "spotify:track:abc", name: "Song" }, null]);
  });
});

test("a local track gets the local lyrics tools; deletion is offered only with saved lyrics", () => {
  const toolbar = createToolbar({ isLocalTrack: true, trackUri: "spotify:local:a:b:c:1", hasKaraoke: false });
  openPanel(toolbar, "track");
  const creator = findOne(toolbar, menuItem(t("syncCreator.buttonTooltip")), "sync creator item");
  assert.equal(creator.props.disabled, true);
  assert.ok(textOf(creator).includes(t("syncCreator.trackIdRequired")));
  click(toolbar, findOne(toolbar, menuItem(t("menu.localLyricsTools")), "local lyrics item"));
  click(toolbar, inPanel(toolbar, (node) => node.type === "button" && textOf(node) === t("menu.search"))[0]);
  assert.deepEqual(plain(toolbar.calls.find(([name]) => name === "openLocalLyricsLrclibSearchModal")[1].trackInfo), { title: "Song", artist: "Artist" });
  openPanel(toolbar, "track");
  click(toolbar, findOne(toolbar, menuItem(t("menu.localLyricsTools")), "local lyrics item"));
  click(toolbar, inPanel(toolbar, (node) => node.type === "button" && textOf(node) === t("buttons.delete"))[0]);
  assert.ok(toolbar.calls.some(([name]) => name === "onDeleteLocalLyrics"));
  toolbar.setHasLocalLyrics(false);
  openPanel(toolbar, "track");
  click(toolbar, findOne(toolbar, menuItem(t("menu.localLyricsTools")), "local lyrics item"));
  assert.equal(inPanel(toolbar, rowLabel(t("menu.localLyricsDelete"))).length, 0);
});

test("more panel: learning is an open action, alongside sharing and marketplace navigation", () => {
  const toolbar = createToolbar();
  openPanel(toolbar, "more");
  const study = findOne(toolbar, menuItem(t("learningMode.button")), "study item");
  assert.equal(study.props.role, "menuitem");
  assert.equal(study.props["aria-checked"], undefined);
  assert.equal(study.props["aria-haspopup"], "dialog");
  assert.equal(nodesOf([study]).some((node) => hasClass(node, "ivl-tb-mi-state")), false);
  click(toolbar, study);
  assert.deepEqual(toolbar.calls.find(([name]) => name === "learning.open"), ["learning.open"]);
  assert.equal(panel(toolbar), undefined, "opening learning closes the menu");
  assert.equal(toolbar.learning.open, true);
  openPanel(toolbar, "more");
  click(toolbar, findOne(toolbar, menuItem(t("learningMode.button")), "study item"));
  assert.equal(toolbar.learning.open, true, "opening an already-open study panel never closes it");
  assert.equal(toolbar.calls.some(([name]) => name === "learning.toggle"), false);
  assert.equal(panel(toolbar), undefined);
  openPanel(toolbar, "more");
  click(toolbar, findOne(toolbar, menuItem(t("menu.shareImage")), "share item"));
  const share = toolbar.calls.find(([name]) => name === "openShareImageModal");
  assert.equal(share[1], toolbar.lyrics);
  assert.deepEqual(plain(share[2]), { name: "Song", artist: "Artist", cover: "" });
  openPanel(toolbar, "more");
  click(toolbar, findOne(toolbar, menuItem(t("marketplace.title")), "marketplace item"));
  assert.ok(toolbar.calls.some(([name]) => name === "onToggleMarketplace"));

  click(toolbar, entryButton(toolbar, "settings"));
  assert.deepEqual(toolbar.calls.filter(([name]) => name === "openConfig").at(-1), ["openConfig"]);
  click(toolbar, entryButton(toolbar, "fullscreen"));
  assert.ok(toolbar.calls.some(([name]) => name === "onToggleFullscreen"));
});

test("index.js gives the toolbar every action it calls, from one stable object", () => {
  const toolbarSource = slice(optionsSource, "// Lyrics-page floating toolbar", "// 전역으로 노출");
  const used = new Set([...toolbarSource.matchAll(/(?<![.\w])actions\??\.(\w+)/g)].map((match) => match[1]));
  assert.ok(used.size > 15);
  const block = slice(indexSource, "this.floatingToolbarActions = Object.freeze({", "\n    });");
  const defined = new Set([...block.matchAll(/^ {6}(\w+):/gm)].map((match) => match[1]));
  for (const name of used) assert.ok(defined.has(name), "index.js defines toolbar action " + name);
  assert.match(indexSource, /react\.createElement\(IvLyricsFloatingToolbar, \{\n\s+actions: this\.floatingToolbarActions,/);
});

test("the mode lock switch locks the mode on screen and releases the lock in effect", () => {
  const constants = slice(indexSource, "const KARAOKE =", "const VINYL_TYPOGRAPHY_DEFAULT_SCALE");
  const modeMethods = slice(indexSource, "  isModeAvailable(mode,", "\n  render() {");
  const lockMethods = slice(indexSource, "  setCurrentModeLock(locked) {", "  // Right-clicking the mode entry");
  const toggle = slice(indexSource, "  toggleModeLock(mode, event = null) {", "\n}\n");
  const remembered = [];
  const context = vm.createContext({
    CONFIG: { visual: { "karaoke-mode-enabled": true } },
    StorageManager: { setItem: (_key, value) => remembered.push(Number(value)) },
    ivLyricsDebug: () => {},
  });
  vm.runInContext(constants + "\nclass Page {" + modeMethods + lockMethods + toggle + "}\nglobalThis.page = new Page();", context);
  const page = context.page;
  const lines = [{ text: "a" }];
  page.resolveLyricsForMode = () => lines;
  page.lyricsSource = () => {};
  page.setState = (update, done) => {
    page.state = { ...page.state, ...(typeof update === "function" ? update(page.state) : update) };
    done?.();
  };
  page.state = { karaoke: lines, synced: lines, unsynced: lines, lockedMode: -1, explicitMode: 1 };
  page.setCurrentModeLock(true);
  assert.equal(page.state.lockedMode, 1, "locks the mode on screen");
  page.setCurrentModeLock(true);
  assert.deepEqual(remembered, [1], "locking again changes nothing");
  page.setCurrentModeLock(false);
  assert.equal(page.state.lockedMode, -1);
  // A lock on a mode this song cannot show is not in effect: the switch is off,
  // and turning it on locks the mode on screen instead.
  page.state = { synced: lines, unsynced: lines, lockedMode: 0, explicitMode: 2 };
  page.setCurrentModeLock(false);
  assert.equal(page.state.lockedMode, 0);
  page.setCurrentModeLock(true);
  assert.equal(page.state.lockedMode, 2);
});

test("panels open beside the toolbar, level with their entry and inside the lyrics page", () => {
  const helper = slice(optionsSource, "const SYNC_ADJUST_PANEL_GAP = 10;", "\nconst useToolbarSyncOffsets");
  const context = vm.createContext({});
  vm.runInContext(helper + "\nglobalThis.compute = computeSyncAdjustPanelPosition;", context);
  const page = { left: 240, top: 64, right: 1440, bottom: 810 };
  const entry = (top) => ({ left: 1376, top, width: 60, height: 54 });
  const place = (anchor, size, bounds = page, edge = 1372) =>
    plain(context.compute(anchor, size, 1440, 900, { align: "start", edge, bounds }));
  // 10px left of the toolbar edge, header level with the entry.
  assert.deepEqual(place(entry(500), { width: 376, height: 200 }), { left: 986, top: 494 });
  // A tall panel moves up to stay 12px inside the page, and never above it.
  assert.deepEqual(place(entry(700), { width: 376, height: 500 }), { left: 986, top: 298 });
  assert.deepEqual(place(entry(700), { width: 376, height: 900 }), { left: 986, top: 76 });
  // A narrow page: the panel covers part of the toolbar instead of leaving the page.
  assert.deepEqual(place(entry(500), { width: 376, height: 200 }, { left: 600, top: 0, right: 1000, bottom: 900 }, 920), { left: 612, top: 494 });
  // Without options the sync panel's original centring is unchanged.
  assert.deepEqual(plain(context.compute({ left: 1800, top: 400, width: 44, height: 44 }, { width: 410, height: 500 }, 1920, 1080)), { left: 1380, top: 172 });
});



test("an optional second fullscreen button opens the other presentation", () => {
  const toolbar = createToolbar();
  assert.equal(entryButton(toolbar, "fullscreenAlt"), undefined, "hidden unless the setting is on");
  toolbar.CONFIG.visual["fullscreen-separate-buttons"] = true;
  toolbar.render();
  const lastToggle = () => plain(toolbar.calls.filter(([name]) => name === "onToggleFullscreen").at(-1));
  const screen = entryButton(toolbar, "fullscreenAlt");
  assert.equal(textOf(screen), t("menu.fullscreenScreen"), "the main button stays in Spotify, so the extra one fills the monitor");
  click(toolbar, screen);
  assert.deepEqual(lastToggle(), ["onToggleFullscreen", { presentation: "screen" }]);
  toolbar.CONFIG.visual["fullscreen-browser-fullscreen"] = true;
  toolbar.render();
  const page = entryButton(toolbar, "fullscreenAlt");
  assert.equal(textOf(page), t("menu.fullscreenInPage"), "the main button fills the monitor, so the extra one stays in the page");
  click(toolbar, page);
  assert.deepEqual(lastToggle(), ["onToggleFullscreen", { presentation: "page" }]);
  toolbar.CONFIG.visual["fullscreen-page-ui-only"] = true;
  toolbar.render();
  assert.equal(textOf(entryButton(toolbar, "fullscreenAlt")), t("menu.fullscreenScreen"));
  click(toolbar, entryButton(toolbar, "fullscreen"));
  assert.deepEqual(lastToggle(), ["onToggleFullscreen"], "the main button keeps following the settings");
  toolbar.setProps({ isFullscreen: true });
  assert.equal(entryButton(toolbar, "fullscreenAlt"), undefined);
  toolbar.setProps({ isFullscreen: false, canToggleFullscreen: false });
  assert.equal(entryButton(toolbar, "fullscreenAlt"), undefined);
});
