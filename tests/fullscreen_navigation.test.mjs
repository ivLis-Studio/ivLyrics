import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { createFullscreenNavigation } from "#ivlyrics/features/player/fullscreenNavigation.mjs";
import { createFullscreenShortcutBindings } from "#ivlyrics/features/player/fullscreenShortcutBindings.mjs";
import { captureKeyboardShortcut, formatKeyboardShortcut, parseKeyboardShortcut } from "#ivlyrics/core/keyboardShortcut.mjs";
import { createSyncCreatorShortcutSettings, getNormalizedHotkeyFromEvent } from "#ivlyrics/features/sync/syncCreatorShortcutSettings.mjs";
import { LYRICS_PAGE_READY_EVENT } from "#ivlyrics/spicetify/lyricsPageEffects.mjs";
import { createAppConfig } from "#ivlyrics/spicetify/createAppConfig.mjs";
import { buildToolbarEntries } from "#ivlyrics/app/toolbar/toolbarEntries.mjs";
import { bundleInitializer } from "./fixtures/initializer-bundle.mjs";

function fixture(pathname = "/collection/playlists") {
    const pathHistory = [];
    const previousPaths = [];
    const history = { location: { pathname }, push(path) {
        this.location.pathname = path;
        pathHistory.push(path);
        navigation.onRouteChange(path);
    } };
    let page, toggles = 0;
    const navigation = createFullscreenNavigation({
        getHistory: () => history,
        getPage: () => page,
        setPreviousPath: path => previousPaths.push(path),
    });
    return { navigation, history, pathHistory, previousPaths,
        mount() { return page = { toggleFullscreen: () => { toggles++; } }; },
        get toggles() { return toggles; },
    };
}

test("cold fullscreen entry uses the live page and restores the invoking route exactly once", () => {
    const h = fixture();
    h.history.location.search = "?filter=downloaded";
    h.history.location.hash = "#recent";
    h.navigation.toggleFromPlaybarOrShortcut();
    assert.deepEqual(h.pathHistory, ["/ivLyrics"]);
    const page = h.mount();
    h.navigation.onPageReady({ toggleFullscreen: () => assert.fail("stale page") });
    h.navigation.onPageReady(page);
    h.navigation.onPageReady(page);
    assert.equal(h.toggles, 1);
    h.navigation.goBackToPreviousPage();
    h.navigation.goBackToPreviousPage();
    assert.deepEqual(h.pathHistory, ["/ivLyrics", "/collection/playlists?filter=downloaded#recent"]);
    assert.deepEqual(h.previousPaths, ["/collection/playlists?filter=downloaded#recent", null]);
});

test("leaving a loading lyrics page cancels fullscreen without navigating again", () => {
    const h = fixture();
    h.navigation.toggleFromPlaybarOrShortcut();
    h.history.push("/search");
    h.navigation.onPageReady(h.mount());
    h.navigation.goBackToPreviousPage();
    h.history.push("/ivLyrics");
    h.navigation.onPageReady(h.mount());
    assert.equal(h.toggles, 0);
    assert.deepEqual(h.pathHistory, ["/ivLyrics", "/search", "/ivLyrics"]);
});

test("two toggles during route loading cancel and a mounted lyrics page toggles in place", () => {
    const h = fixture("/ivLyrics");
    h.navigation.toggleFromPlaybarOrShortcut();
    h.navigation.toggleFromPlaybarOrShortcut();
    h.navigation.onPageReady(h.mount());
    assert.equal(h.toggles, 0);
    h.navigation.toggleFromPlaybarOrShortcut();
    assert.equal(h.toggles, 1);
    h.navigation.goBackToPreviousPage();
    assert.deepEqual(h.pathHistory, []);
});

const startupSource = bundleInitializer(new URL("../src/features/player/GlobalShortcuts.js", import.meta.url));

function startupFixture(path = "/", historyReady = true, persistence) {
    const window = new EventTarget();
    const document = new EventTarget();
    const timers = new Map();
    const values = new Map();
    const changes = [];
    let nextTimer = 0;
    const makeHistory = (pathname) => ({
        location: { pathname }, added: [], removed: [],
        listen(fn) {
            this.added.push(fn);
            return () => this.removed.push(fn);
        },
        push(pathname) {
            this.location = { pathname };
            for (const handler of this.added) {
                if (!this.removed.includes(handler)) handler(this.location);
            }
        },
    });
    const history = makeHistory(path);
    const { listen } = history;
    if (!historyReady) delete history.listen;
    window.Spicetify = {
        Platform: { History: history },
        LocalStorage: { get: (key) => values.get(key) ?? null, set: (key, value) => values.set(key, value) },
    };
    if (persistence) window.ivLyricsStoragePersistence = persistence;
    document.getElementById = () => null;
    document.querySelector = () => null;
    const context = vm.createContext({
        window, document, CustomEvent, console,
        setTimeout(fn, delay) {
            const id = ++nextTimer;
            timers.set(id, { fn, delay });
            return id;
        },
        clearTimeout: (timer) => timers.delete(timer),
    });
    const start = () => vm.runInContext(startupSource, context);
    const publish = detail => window.dispatchEvent(new CustomEvent("ivLyrics", { detail }));
    const set = (name, value) => values.set("ivLyrics:visual:" + name, value);
    window.addEventListener("ivLyrics", event => changes.push(event.detail));
    start();
    return {
        window, document, history, timers, changes, values, publish, set, start,
        replaceHistory(pathname) { return window.Spicetify.Platform.History = makeHistory(pathname); },
        enableHistoryListener() { history.listen = listen; },
        tick(delay) {
            for (const [id, timer] of [...timers]) {
                if (timer.delay !== delay || !timers.delete(id)) continue;
                timer.fn();
            }
        },
        press(key, options = {}) {
            const event = new Event("keydown", { cancelable: true });
            Object.assign(event, { key }, options);
            document.dispatchEvent(event);
            return event.defaultPrevented;
        },
    };
}

test("fullscreen startup works without Mousetrap and waits for the History listener", () => {
    const h = startupFixture("/ivLyrics-test", false);
    const { window, history } = h;
    assert.equal(window.__ivLyricsGlobalShortcuts.initialized, true);
    assert.ok([...h.timers.values()].some(timer => timer.delay === 100));

    h.publish({ type: "fullscreen-toggle" });
    assert.equal(history.location.pathname, "/ivLyrics");
    let entered = false;
    const page = window.lyricContainer = { toggleFullscreen() { entered = true; } };
    window.dispatchEvent(new CustomEvent(LYRICS_PAGE_READY_EVENT, { detail: page }));
    assert.equal(entered, true);
    window.dispatchEvent(new Event("ivLyrics:fullscreen-closed"));
    assert.equal(history.location.pathname, "/ivLyrics-test");
    assert.equal(window._ivLyricsPreviousPath, null);
    h.enableHistoryListener();
    h.tick(100);
    h.start();
    assert.equal(window.__ivLyricsGlobalShortcuts.initialized, true);
    assert.equal(history.added.length, 1);
    assert.deepEqual([...h.timers.values()].map(timer => timer.delay), [500]);
    assert.equal(h.press("F12"), true);
    assert.equal(history.location.pathname, "/ivLyrics");
});

test("reconfiguring shortcuts reconciles the two keys together and never restores explicitly cleared shortcuts", () => {
    const h = startupFixture("/ivLyrics");
    h.window.CONFIG = { visual: {} };
    const page = h.window.lyricContainer = {
        state: { isFullscreen: false },
        toggleFullscreen() { this.state.isFullscreen = !this.state.isFullscreen; },
        forceUpdate() {},
    };
    const duplicate = () => h.press("K", { ctrlKey: true, shiftKey: true });
    h.set("fullscreen-key", "Shift+Control+K");
    h.set("toggle-tv-mode-key", "ctrl+shift+k");
    h.publish({ name: "fullscreen-key" });
    h.window.dispatchEvent(new Event("focus"));
    h.document.visibilityState = "visible";
    h.document.dispatchEvent(new Event("visibilitychange"));
    assert.equal(h.press("F12"), false);
    assert.equal(duplicate(), true);
    assert.equal(page.state.isFullscreen, true);
    assert.equal(duplicate(), true);
    assert.equal(h.values.get("ivLyrics:visual:fullscreen-tv-mode"), "true");
    assert.equal(page.state.isFullscreen, true);
    assert.equal(h.changes.filter(change => change.name === "fullscreen-tv-mode").length, 1);
    for (const ignored of [{ repeat: true }, { isComposing: true }]) {
        assert.equal(h.press("K", { ctrlKey: true, shiftKey: true, ...ignored }), false);
    }
    h.document.activeElement = { tagName: "TEXTAREA" };
    assert.equal(duplicate(), false);
    assert.equal(h.values.get("ivLyrics:visual:fullscreen-tv-mode"), "true");
    h.document.activeElement = null;
    page.state.isFullscreen = false;
    h.document.getElementById = () => ({});
    assert.equal(duplicate(), true);
    assert.equal(page.state.isFullscreen, true, "a closing portal does not count as active fullscreen");
    assert.equal(h.values.get("ivLyrics:visual:fullscreen-tv-mode"), "true");

    h.set("fullscreen-key", "");
    h.set("toggle-tv-mode-key", "");
    h.publish({ name: "toggle-tv-mode-key" });
    assert.equal(duplicate(), false);
    h.window.Spicetify.LocalStorage.get = () => { throw new Error("storage unavailable"); };
    h.window.dispatchEvent(new Event("focus"));
    assert.equal(h.press("F12"), false);
    assert.equal(h.press("t"), false);
    const { visual } = createAppConfig({ storage: {
        getItem: (key) => h.values.get(key) ?? null, get: (_key, fallback) => fallback,
        getPersisted: (key) => h.values.get(key) ?? null, setItem() {},
    } });
    assert.equal(visual["fullscreen-key"], "");
    assert.equal(visual["toggle-tv-mode-key"], "");
    const entries = buildToolbarEntries({
        toolbar: { canToggleFullscreen: true }, trackLine: {}, offsets: {}, readVisualSettings: () => visual,
        getOptionsText: (_key, fallback) => fallback, translate: key => key,
    });
    assert.deepEqual(entries.fullscreen.keys, []);
});

test("pending settings recovery cannot activate missing default shortcuts and applies restored keys without refocus", async () => {
    const recovery = Promise.withResolvers();
    const stored = new Map([["ivLyrics:visual:toggle-tv-mode-key", "y"]]);
    const h = startupFixture("/ivLyrics", true, {
        ready: recovery.promise,
        getItem: key => stored.get(key) ?? null,
        setItem: (key, value) => stored.set(key, value),
    });
    const page = h.window.lyricContainer = {
        state: { isFullscreen: true },
        toggleFullscreen() { this.state.isFullscreen = !this.state.isFullscreen; },
    };
    assert.equal(h.press("F12"), false, "missing local values are not defaults until recovery finishes");
    assert.equal(h.press("y"), true, "a setting already read from disk works while other values recover");
    stored.set("ivLyrics:visual:fullscreen-key", "f8");
    stored.set("ivLyrics:visual:toggle-tv-mode-key", "");
    recovery.resolve();
    await recovery.promise;
    assert.equal(h.press("y"), false);
    assert.equal(h.press("t"), false);
    assert.equal(h.press("F12"), false);
    assert.equal(h.press("F8"), true);
    assert.equal(page.state.isFullscreen, false);
});

test("shortcut recovery falls back to defaults on failure and ignores a replaced source", async () => {
    const previous = Promise.withResolvers();
    const current = Promise.withResolvers();
    const h = startupFixture("/", true, { ready: previous.promise, getItem: () => null });
    h.window.ivLyricsStoragePersistence = { ready: current.promise, getItem: () => null };
    h.window.dispatchEvent(new Event("focus"));
    previous.resolve();
    await previous.promise;
    assert.equal(h.press("F12"), false);
    current.reject(new Error("unavailable recovery"));
    await current.promise.catch(() => undefined);
    assert.equal(h.press("F12"), true);
    assert.equal(h.history.location.pathname, "/ivLyrics");
});

test("an unreadable replacement storage cannot leave obsolete bindings active", () => {
    const h = startupFixture("/ivLyrics");
    let toggles = 0;
    h.window.lyricContainer = { toggleFullscreen: () => toggles++ };
    h.set("fullscreen-key", "f8");
    h.publish({ name: "fullscreen-key" });
    assert.equal(h.press("F8"), true);

    const replacement = { getItem() { throw new Error("new storage is unavailable"); } };
    h.window.ivLyricsStoragePersistence = replacement;
    assert.equal(h.press("F8"), false);
    assert.equal(h.press("F12"), false);
    assert.equal(toggles, 1);

    replacement.getItem = key => key.endsWith(":fullscreen-key") ? "f9" : "";
    h.window.dispatchEvent(new Event("focus"));
    assert.equal(h.press("F8"), false);
    assert.equal(h.press("F9"), true);
    assert.equal(toggles, 2);
});

test("shortcut defaults wait for Spotify storage to become available", () => {
    const h = startupFixture("/");
    const storage = h.window.Spicetify.LocalStorage;
    delete h.window.Spicetify.LocalStorage;
    h.window.dispatchEvent(new Event("focus"));
    assert.equal(h.press("F12"), false);
    assert.equal(h.history.location.pathname, "/");

    h.window.Spicetify.LocalStorage = storage;
    assert.equal(h.press("F12"), true);
    assert.equal(h.history.location.pathname, "/ivLyrics");
});

test("the settings, presentation and lyrics visibility actions keep their route and dialog restrictions", () => {
    const h = startupFixture();
    let visibilityChanges = 0;
    h.window.lyricContainer = {
        state: { isFullscreen: false },
        toggleFullscreenLyricsHidden: () => visibilityChanges++,
    };
    let settingsOpened = 0;
    h.window.ivLyricsOpenConfig = () => settingsOpened++;
    assert.equal(h.press("S", { code: "KeyS" }), false);
    h.history.push("/ivLyrics");
    assert.equal(h.press("s", { code: "KeyS", ctrlKey: true }), false);
    assert.equal(h.press("s", { code: "KeyS" }), true);
    assert.equal(settingsOpened, 1);
    assert.equal(h.press("5", { code: "Digit5" }), false);
    assert.equal(h.press("l", { code: "KeyL" }), false);
    h.window.lyricContainer.state.isFullscreen = true;
    h.set("fullscreen-tv-mode", "true");
    h.document.querySelector = (selectors) => selectors.includes("#ivLyrics-settings-overlay") ? {} : null;
    assert.equal(h.press("5", { code: "Numpad5" }), false);
    assert.equal(h.press("F12"), false);
    assert.equal(h.press("t"), false);
    assert.equal(h.press("l", { code: "KeyL" }), false);
    assert.equal(visibilityChanges, 0);
    h.document.querySelector = () => null;
    assert.equal(h.press("l", { code: "KeyL", metaKey: true }), false);
    assert.equal(h.press("L", { code: "KeyL", shiftKey: true }), true);
    assert.equal(visibilityChanges, 1);
    assert.equal(h.press("5", { code: "Numpad5" }), true);
    assert.equal(h.values.get("ivLyrics:visual:fullscreen-tv-mode"), "false");
    assert.deepEqual(h.changes.map(detail => [detail.name ?? detail.type, detail.value]), [
        ["fullscreen-tv-mode", false], ["fullscreen-presentation", "motion"],
    ]);
});

test("a saved sequence can begin with a shortcut reserved for settings, presentation or lyrics visibility", () => {
    const h = startupFixture("/ivLyrics");
    const page = h.window.lyricContainer = {
        state: { isFullscreen: false },
        toggleFullscreen() { this.state.isFullscreen = !this.state.isFullscreen; },
        toggleFullscreenLyricsHidden() { assert.fail("the configured sequence owns this action"); },
    };
    h.window.ivLyricsOpenConfig = () => assert.fail("the sequence prefix must not open settings");
    h.set("fullscreen-key", "s f");
    h.set("toggle-tv-mode-key", "5 t");
    h.publish({ name: "fullscreen-key" });
    assert.equal(h.press("s", { code: "KeyS" }), false);
    assert.equal(h.press("f"), true);
    assert.equal(page.state.isFullscreen, true);
    assert.equal(h.press("5", { code: "Digit5" }), false);
    assert.equal(h.press("t"), true);
    assert.equal(h.values.get("ivLyrics:visual:fullscreen-tv-mode"), "true");
    assert.equal(h.changes.filter(change => change.type === "fullscreen-presentation").length, 0);
    h.set("fullscreen-key", "l f");
    h.publish({ name: "fullscreen-key" });
    assert.equal(h.press("l", { code: "KeyL" }), false);
    assert.equal(h.press("f"), true);
    assert.equal(page.state.isFullscreen, false);
});

test("configured chords take priority over page shortcuts and stay disabled in recording dialogs", () => {
    const h = startupFixture("/ivLyrics");
    let settingsOpened = 0;
    h.window.ivLyricsOpenConfig = () => settingsOpened++;
    const page = h.window.lyricContainer = {
        state: { isFullscreen: false },
        toggleFullscreen() { this.state.isFullscreen = !this.state.isFullscreen; },
    };
    h.set("fullscreen-key", "s");
    h.set("toggle-tv-mode-key", "5");
    h.publish({ name: "fullscreen-key" });
    assert.equal(h.press("5", { code: "Digit5" }), false);
    assert.equal(h.press("s", { code: "KeyS" }), true);
    assert.equal(settingsOpened, 0);
    assert.equal(page.state.isFullscreen, true);
    assert.equal(h.press("5", { code: "Numpad5" }), true);
    assert.equal(h.values.get("ivLyrics:visual:fullscreen-tv-mode"), "true");
    assert.equal(h.changes.filter(change => change.type === "fullscreen-presentation").length, 0);

    h.document.querySelector = selectors => selectors.includes("#ivLyrics-sync-creator-overlay") ? {} : null;
    assert.equal(h.press("s", { code: "KeyS" }), false);
    assert.equal(page.state.isFullscreen, true);
});

test("keyboard recording, rendering and dispatch agree on plus, aliases and the numeric keypad", () => {
    const h = startupFixture("/ivLyrics");
    const page = h.window.lyricContainer = {
        state: { isFullscreen: false },
        toggleFullscreen() { this.state.isFullscreen = !this.state.isFullscreen; },
    };
    const plus = { key: "+", shiftKey: true };
    assert.equal(captureKeyboardShortcut(plus), "shift+plus");
    assert.deepEqual(formatKeyboardShortcut(captureKeyboardShortcut(plus)), ["⇧", "+"]);
    assert.deepEqual(parseKeyboardShortcut("Shift++"), ["shift+="]);
    assert.deepEqual(parseKeyboardShortcut("Mod + K g", "meta"), ["meta+k", "g"]);
    assert.deepEqual(formatKeyboardShortcut("num /"), ["Num /"]);
    h.set("fullscreen-key", captureKeyboardShortcut(plus));
    h.set("toggle-tv-mode-key", "numpaddivide");
    h.publish({ name: "fullscreen-key" });
    assert.equal(h.press("+", plus), true);
    assert.equal(page.state.isFullscreen, true);
    assert.equal(h.press("/", { code: "Slash" }), false);
    assert.equal(h.press("/", { code: "NumpadDivide" }), true);

    const syncCreator = createSyncCreatorShortcutSettings({
        readStoredSetting: key => key === "sync-creator-drag-key" ? "shift++" : null,
    });
    assert.equal(syncCreator.findAction(getNormalizedHotkeyFromEvent(plus)), "drag");
    assert.equal(syncCreator.getDisplay("drag"), "Shift++ / Num /");
    assert.equal(syncCreator.findAction(getNormalizedHotkeyFromEvent({ key: "/", code: "NumpadDivide" })), "drag");
});

test("saved key sequences expire and reset after focus changes", () => {
    let time = 0;
    const bindings = createFullscreenShortcutBindings({ now: () => time });
    bindings.configure({ "fullscreen-key": "g f", "toggle-tv-mode-key": "" });
    assert.equal(bindings.match("g", false), null);
    time = 1001;
    assert.equal(bindings.match("f", false), null);

    const h = startupFixture("/");
    h.set("fullscreen-key", "g f");
    h.publish({ name: "fullscreen-key" });
    assert.equal(h.press("g"), false);
    h.window.dispatchEvent(new Event("blur"));
    assert.equal(h.press("f"), false);
    for (const composition of [{ keyCode: 229 }, { getModifierState: name => name === "AltGraph" }]) {
        assert.equal(h.press("g"), false);
        assert.equal(h.press("f", composition), false);
        assert.equal(h.press("f"), false, "text composition must reset the sequence");
    }
    assert.equal(h.press("g"), false);
    assert.equal(h.press("f"), true);
    assert.equal(h.history.location.pathname, "/ivLyrics");
});

test("history replacement ignores old callbacks and coalesces route cleanup", () => {
    const h = startupFixture("/ivLyrics");
    const replacement = h.replaceHistory("/ivLyrics");
    h.window.dispatchEvent(new Event("focus"));
    assert.deepEqual(h.history.removed, h.history.added);
    assert.equal(replacement.added.length, 1);
    h.history.added[0]({ pathname: "/search" });
    assert.equal(h.timers.size, 1);
    replacement.push("/search");
    replacement.push("/collection");
    assert.deepEqual([...h.timers.values()].map(timer => timer.delay), [100]);

    let removed = 0;
    let closed = 0;
    h.document.getElementById = (id) => id === "lyrics-fullscreen-container" && !removed ? { remove: () => removed++ } : null;
    h.document.body = { classList: { remove() {} } };
    h.window.addEventListener("ivLyrics:fullscreen-closed", () => closed++);
    delete h.window.Spicetify.Platform.History;
    h.tick(100);
    assert.equal(removed, 0);
    h.window.Spicetify.Platform.History = replacement;
    h.window.dispatchEvent(new Event("focus"));
    assert.equal(removed, 1);
    assert.equal(closed, 1);
});
