import { refreshLyricsPage, requestLyricsReload } from "../src/spicetify/lyricsPageActions.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { createLyricsFullscreenController } from "../src/features/fullscreen/lyricsFullscreenController.mjs";
import { reloadPageLyrics } from "../src/lyrics/reloadPageLyrics.mjs";
import { EventEmitter } from "node:events";
import { getMountedLyricsPage } from "../src/spicetify/lyricsPageEffects.mjs";
import { createRuntimeEffects } from "../src/core/runtimeEffects.mjs";
import { createLyricsPageLifecycle } from "../src/spicetify/lyricsPageLifecycle.mjs";
import { getRuntimeService } from "../src/spicetify/runtimeServices.mjs";

test("disposing a lyrics page removes listeners and ignores queued callbacks", () => {
    const eventSource = new EventTarget();
    const timerCallbacks = new Map();
    const messages = [];
    const errors = [];
    const fakeTimers = {
        scheduleTimer(callback) {
            const timer = Symbol();
            timerCallbacks.set(timer, callback);
            return timer;
        },
        cancelTimer(timer) {
            timerCallbacks.delete(timer);
            throw new Error("fixture timer cleanup");
        },
    };
    let registeredCallback;
    let unsubscribed = false;
    const effects = createRuntimeEffects({ ...fakeTimers, onCleanupError: (error) => errors.push(error.message) });
    effects.add(() => { throw new Error("fixture cleanup"); });
    effects.listen(eventSource, "change", (event) => messages.push(event.type));
    effects.subscribe((callback) => {
        registeredCallback = callback;
        return () => { unsubscribed = true; };
    }, (message) => messages.push(message));
    effects.schedule(() => messages.push("timer"), 100);
    const [queuedTimer] = timerCallbacks.values();
    eventSource.dispatchEvent(new Event("change"));
    registeredCallback("addon");
    effects.dispose();
    effects.dispose();

    eventSource.dispatchEvent(new Event("change"));
    registeredCallback("stale addon");
    queuedTimer();
    assert.deepEqual(messages, ["change", "addon"]);
    assert.deepEqual(errors, ["fixture timer cleanup", "fixture cleanup"]);
    assert.equal(unsubscribed, true);
    assert.equal(timerCallbacks.size, 0);
});

test("a scheduled fullscreen close cannot remove a replacement portal", () => {
    const portals = new Set();
    const timers = new Map();
    const document = new EventTarget();
    document.body = { append: (portal) => { portal.parentNode = document.body; portals.add(portal); } };
    document.createElement = () => ({
        style: { setProperty() {} },
        remove() { this.parentNode = null; portals.delete(this); },
    });
    document.getElementById = (id) => [...portals].find((portal) => portal.id === id);
    document.querySelector = () => null;

    const state = { isFullscreen: false };
    let layout = { portal: null, usePageFullscreenUi: false };
    let closed = 0;
    const controller = createLyricsFullscreenController({
        document,
        readVisual: () => ({}),
        readState: () => state,
        writeLayout: (value) => { layout = value; },
        setState: (patch) => { Object.assign(state, patch); },
        readRememberedPresentation: () => "standard",
        rememberPresentation: (value) => value,
        normalizePresentation: (value) => value,
        onClosed: () => { closed++; },
        scheduleTimer: (callback) => {
            const id = Symbol();
            timers.set(id, callback);
            return id;
        },
        cancelTimer: (id) => { timers.delete(id); },
    });

    controller.toggle();
    const firstPortal = layout.portal;
    controller.setPresentation("motion");
    const pressEscape = (repeat = false) => {
        const event = Object.assign(new Event("keydown", { cancelable: true }), { key: "Escape", repeat });
        document.dispatchEvent(event);
        return event.defaultPrevented;
    };
    assert.equal(pressEscape(), true);
    assert.equal(state.fullscreenPresentation, "standard");
    assert.equal(state.isFullscreen, true);
    assert.equal(pressEscape(true), true);
    assert.equal(state.isFullscreen, true);
    assert.equal(pressEscape(), true);
    const [staleTimer] = timers.values();
    assert.deepEqual(portals, new Set([firstPortal]));
    assert.equal(closed, 1);
    assert.equal(pressEscape(), false);

    controller.toggle();
    const nextPortal = layout.portal;
    assert.notEqual(nextPortal, firstPortal);
    assert.equal(timers.size, 0);
    staleTimer();
    assert.deepEqual(portals, new Set([nextPortal]));

    controller.dispose();
    assert.equal(pressEscape(), false);
    assert.equal(portals.size, 0, "route teardown removes the active portal");
    assert.equal(layout.portal, null);
});

function fullscreenHarness({ deferState = false } = {}) {
    const portals = new Set();
    const timers = new Map();
    const enters = [];
    const exits = [];
    const document = new EventTarget();
    document.fullscreenElement = null;
    let rootHasFullscreenFlag = false;
    document.body = { append(portal) { portal.parentNode = this; portals.add(portal); } };
    document.createElement = () => ({
        style: { setProperty() {} },
        remove() { this.parentNode = null; portals.delete(this); },
    });
    document.getElementById = id => [...portals].find(portal => portal.id === id);
    document.querySelector = () => null;
    document.documentElement = {
        matches: selector => selector === ":fullscreen" && rootHasFullscreenFlag,
        requestFullscreen() {
            const enter = Promise.withResolvers();
            enters.push(enter);
            return enter.promise;
        },
    };
    document.exitFullscreen = () => {
        const exit = Promise.withResolvers();
        exits.push(exit);
        return exit.promise;
    };
    const setNativeElement = (element, rootStillFullscreen = element === document.documentElement) => {
        rootHasFullscreenFlag = rootStillFullscreen;
        document.fullscreenElement = element;
        document.dispatchEvent(new Event("fullscreenchange"));
    };
    const createController = () => {
        const state = { isFullscreen: false };
        const updates = [];
        let layout;
        let closes = 0;
        const controller = createLyricsFullscreenController({
            document,
            readVisual: () => ({}),
            readState: () => state,
            writeLayout: patch => { layout = patch; },
            setState: patch => deferState ? updates.push(patch) : Object.assign(state, patch),
            readRememberedPresentation: () => "standard",
            rememberPresentation: value => value,
            normalizePresentation: value => value,
            onClosed: () => { closes++; },
            scheduleTimer(callback) {
                const timer = Symbol();
                timers.set(timer, callback);
                return timer;
            },
            cancelTimer: timer => timers.delete(timer),
        });
        return {
            controller, state, updates,
            get layout() { return layout; },
            get closes() { return closes; },
        };
    };
    return { document, setNativeElement, createController, portals, timers, enters, exits };
}

const screen = { presentation: "screen" };

test("a rejected native exit stays owned so a later route can adopt and close it", async () => {
    const h = fullscreenHarness();
    const first = h.createController();
    first.controller.toggle(screen);
    h.setNativeElement(h.document.documentElement);
    h.enters[0].resolve();
    first.controller.dispose();
    h.exits[0].reject(new Error("native exit declined"));
    await Promise.resolve();
    assert.equal(h.exits.length, 1, "an exit rejection must not retry in a loop");

    const second = h.createController();
    second.controller.toggle(screen);
    assert.equal(h.enters.length, 1);
    second.controller.dispose();
    assert.equal(h.exits.length, 2);
    h.setNativeElement(null);
    h.exits[1].resolve();
    await Promise.resolve();
    assert.equal(h.portals.size, 0);
});

test("a nested fullscreen element leaves the lyrics session and its keyboard owner intact", async () => {
    const h = fullscreenHarness();
    const page = h.createController();
    page.controller.toggle(screen);
    h.setNativeElement(h.document.documentElement);
    h.enters[0].resolve();
    h.setNativeElement({ id: "media" }, true);
    const escape = new Event("keydown", { cancelable: true });
    Object.defineProperty(escape, "key", { value: "Escape" });
    h.document.dispatchEvent(escape);
    assert.equal(page.state.isFullscreen, true);
    assert.equal(escape.defaultPrevented, false);
    assert.equal(page.closes, 0);
    page.controller.dispose();
    assert.equal(h.exits.length, 0, "leave the media layer alone");
    h.setNativeElement(h.document.documentElement);
    assert.equal(h.exits.length, 1, "release lyrics fullscreen after the media layer closes");
    h.setNativeElement(null);
    h.exits[0].resolve();
    await Promise.resolve();
    assert.equal(h.portals.size, 0);
});

test("a new route can replace an active fullscreen controller before the old route unmounts", async () => {
    const h = fullscreenHarness();
    const first = h.createController();
    first.controller.toggle(screen);
    h.setNativeElement(h.document.documentElement);
    h.enters[0].resolve();
    const second = h.createController();
    second.controller.toggle(screen);
    assert.equal(first.state.isFullscreen, false);
    assert.equal(first.closes, 0, "handover never triggers navigation from an obsolete route");
    assert.equal(h.portals.size, 1);
    assert.equal(h.exits.length, 0);
    assert.equal(h.enters.length, 1);

    const escape = new Event("keydown", { cancelable: true });
    Object.defineProperty(escape, "key", { value: "Escape" });
    h.document.dispatchEvent(escape);
    assert.equal(first.closes, 0);
    assert.equal(second.closes, 1);
    assert.equal(h.exits.length, 1);
    first.controller.dispose();
    second.controller.dispose();
    h.setNativeElement(null);
    h.exits[0].resolve();
    await Promise.resolve();
    assert.equal(h.portals.size, 0);
    assert.equal(h.timers.size, 0);
});

test("disposing a fullscreen route before the browser enters releases a late native entry", async () => {
    const h = fullscreenHarness();
    const page = h.createController();
    page.controller.toggle(screen);
    assert.equal(h.enters.length, 1);
    page.controller.dispose();
    assert.equal(h.portals.size, 0);
    assert.equal(h.timers.size, 0);
    h.setNativeElement(h.document.documentElement);
    h.enters[0].resolve();
    await Promise.resolve();
    assert.equal(h.exits.length, 1);
    h.setNativeElement(null);
    h.exits[0].resolve();
    await Promise.resolve();
    assert.equal(page.closes, 0);
});

test("native fullscreen stays open when a replacement route adopts the pending request", async () => {
    const h = fullscreenHarness();
    const first = h.createController();
    first.controller.toggle(screen);
    first.controller.dispose();
    const second = h.createController();
    second.controller.toggle(screen);
    assert.equal(h.enters.length, 1);
    assert.equal(h.portals.size, 1);
    h.setNativeElement(h.document.documentElement);
    h.enters[0].resolve();
    await Promise.resolve();
    assert.equal(h.exits.length, 0);
    assert.equal(second.state.isFullscreen, true);
    h.setNativeElement(null);
    assert.equal(second.state.isFullscreen, false);
    assert.equal(second.closes, 1);
    second.controller.dispose();
    assert.equal(h.portals.size, 0);
    assert.equal(h.timers.size, 0);
});

test("reopening while the previous native exit is pending acquires fullscreen for the new route", async () => {
    const h = fullscreenHarness();
    const first = h.createController();
    first.controller.toggle(screen);
    h.setNativeElement(h.document.documentElement);
    h.enters[0].resolve();
    await Promise.resolve();
    first.controller.dispose();
    assert.equal(h.exits.length, 1);

    const second = h.createController();
    second.controller.toggle(screen);
    assert.equal(h.enters.length, 1);
    h.setNativeElement(null);
    assert.equal(second.state.isFullscreen, true);
    h.exits[0].resolve();
    await Promise.resolve();
    assert.equal(h.enters.length, 2);
    h.setNativeElement(h.document.documentElement);
    h.enters[1].resolve();
    await Promise.resolve();
    assert.equal(h.portals.size, 1);
    assert.equal(first.closes, 0);
    assert.equal(second.closes, 0);
    second.controller.dispose();
    assert.equal(h.portals.size, 0);
    assert.equal(h.exits.length, 2);
    h.setNativeElement(null);
    h.exits[1].resolve();
    await Promise.resolve();
});

test("closing fullscreen leaves external fullscreen alone and remembers the last batched presentation", () => {
    const h = fullscreenHarness({ deferState: true });
    const page = h.createController();
    h.setNativeElement({ id: "external-player" });
    page.controller.toggle(screen);
    page.controller.setPresentation("motion");
    page.controller.toggle();
    assert.equal(h.enters.length, 0);
    assert.equal(h.exits.length, 0);
    assert.deepEqual(page.updates.map(state => [state.isFullscreen, state.fullscreenPresentation]),
        [[true, "standard"], [undefined, "motion"], [false, "motion"]]);
    assert.equal(page.closes, 1);
    page.controller.dispose();
    assert.equal(h.portals.size, 0);
    assert.equal(h.timers.size, 0);
});

for (const [uri, trackId, expectedCacheKey] of [
    ["spotify:track:current", "current", "current"],
    ["spotify:local:artist:album:title:42", null, "local-uri:spotify:local:artist:album:title:42"],
]) {
    test(`reloading ${uri} clears its cache and fetches from current playback`, async () => {
        const item = { uri, name: "Song", artists: [], album: { name: "Album" } };
        const nextItem = { uri: "spotify:track:next" };
        let playerItem = item;
        const events = [];
        const memoryCache = { old: true };
        const page = {
            _isComponentMounted: true,
            state: { explicitMode: 1 },
            _dmResults: { [uri]: ["old"], [nextItem.uri]: ["keep"] },
            _inflightGemini: new Map([[uri + ":en", {}], [nextItem.uri + ":en", {}]]),
            infoFromTrack: (track) => ({ uri: track.uri }),
            beginLyricsLoadRequest: () => 1,
            isPlaybackUriCurrent: () => true,
            isCurrentLyricsState: () => true,
            clearPendingLyricsUpdates() {},
            clearCulturalAnnotationsForTrack: (trackUri) => events.push(["annotations", trackUri]),
            getLoadingLyricsState: (info, seq) => ({ info, seq }),
            setState: (patch) => events.push(["state", patch]),
            updateVisualOnConfigChange() {},
            forceUpdate() {},
            fetchLyrics: (...args) => events.push(["fetch", ...args]),
        };
        const services = {
            LyricsCache: {
                async clearTrack(cacheKey) {
                    events.push(["disk", cacheKey]);
                    playerItem = nextItem;
                },
            },
            Translator: {
                clearMemoryCache: (id) => events.push(["translation-memory", id]),
            },
            SyncDataService: {
                getTrackIsrc: (id, metadata) => {
                    assert.equal(id, trackId);
                    assert.deepEqual(metadata, { item, title: "Song", artist: [], album: "Album" });
                    return "USABC1234567";
                },
                clearCache: (...args) => events.push(["sync", ...args]),
            },
        };
        await reloadPageLyrics(page, true, {
            readPlayerItem: () => playerItem,
            extractTrackId: () => trackId,
            memoryCache,
            translationCache: { clearByUri: (trackUri) => events.push(["page-memory", trackUri]) },
            getService: (name) => services[name],
            debug() {},
        });

        assert.deepEqual(memoryCache, {});
        assert.deepEqual(page._dmResults, { [nextItem.uri]: ["keep"] });
        assert.deepEqual([...page._inflightGemini.keys()], [nextItem.uri + ":en"]);
        const providerEvents = trackId ? [
            ["sync", "USABC1234567", { isrc: "USABC1234567" }],
        ] : [];
        assert.deepEqual(events, [
            ["state", { info: { uri }, seq: 1 }],
            ["page-memory", uri],
            ["annotations", uri],
            ["translation-memory", expectedCacheKey],
            ["disk", expectedCacheKey],
            ...providerEvents,
            ["fetch", nextItem, 1, true],
        ]);
    });
}

for (const change of ["closed page", "newer track request"]) {
    test(`clearing disk cache cannot reload a ${change}`, async () => {
        const diskClear = Promise.withResolvers();
        const track = { uri: "spotify:track:fixture" };
        const page = {
            _isComponentMounted: true,
            state: { explicitMode: -1 },
            requestSeq: 1,
            infoFromTrack: item => item,
            beginLyricsLoadRequest() { return ++this.requestSeq; },
            isPlaybackUriCurrent: () => true,
            isCurrentLyricsState(state) { return state.lyricsRequestSeq === this.requestSeq; },
            clearPendingLyricsUpdates() {},
            clearCulturalAnnotationsForTrack() {},
            getLoadingLyricsState: () => ({}),
            setState() {},
            forceUpdate() { assert.fail("stale reload updated the page"); },
            fetchLyrics() { assert.fail("stale reload started a provider request"); },
        };
        const reloading = reloadPageLyrics(page, true, {
            readPlayerItem: () => track,
            extractTrackId: () => "fixture",
            memoryCache: {},
            translationCache: { clearByUri() {} },
            getService: name => name === "LyricsCache" ? { clearTrack: () => diskClear.promise } : null,
            debug() {},
        });
        if (change === "closed page") page._isComponentMounted = false;
        else page.beginLyricsLoadRequest();
        diskClear.resolve();
        await reloading;
    });
}

test("a published sync reloads only its own track and retains other songs' caches", async () => {
    const published = { uri: "spotify:track:published" };
    const next = { uri: "spotify:track:next" };
    const memoryCache = { [published.uri]: "stale", [next.uri]: "keep" };
    const calls = [];
    let item = next;
    const page = {
        _isComponentMounted: true,
        state: { explicitMode: 1 },
        isPlaybackUriCurrent: (uri) => uri === item.uri,
        isCurrentLyricsState: ({ uri }) => uri === item.uri,
        infoFromTrack: (track) => track,
        beginLyricsLoadRequest: () => 1,
        clearPendingLyricsUpdates() {},
        clearCulturalAnnotationsForTrack: (uri) => calls.push(["annotations", uri]),
        getLoadingLyricsState: (info) => info,
        setState() {},
        forceUpdate() {},
        fetchLyrics: (...args) => calls.push(["fetch", ...args]),
    };
    const options = {
        expectedTrackUri: published.uri,
        readPlayerItem: () => item,
        extractTrackId: (uri) => uri.split(":")[2],
        memoryCache,
        translationCache: { clearByUri: (uri) => calls.push(["translation", uri]) },
        getService(name) {
            assert.equal(name, "Translator", "disk and sync caches were cleared by publication");
            return { clearMemoryCache: (id) => calls.push(["translator", id]) };
        },
        debug() {},
    };
    await reloadPageLyrics(page, false, options);
    assert.deepEqual(calls, []);
    assert.equal(memoryCache[next.uri], "keep");
    item = published;
    await reloadPageLyrics(page, false, options);
    assert.deepEqual(memoryCache, { [next.uri]: "keep" });
    assert.deepEqual(calls, [
        ["translation", published.uri],
        ["annotations", published.uri],
        ["translator", "published"],
        ["fetch", published, 1, false],
    ]);
});

function createLyricsLifecycleFixture() {
    const trace = [];
    const classes = new Set();
    const timers = new Map();
    const addonHandlers = new Map();
    const queueEvents = new EventEmitter();
    const browser = new EventTarget();
    const player = new EventTarget();
    const document = new EventTarget();
    document.body = { classList: {
        add: (name) => classes.add(name),
        remove: (name) => classes.delete(name),
    } };
    document.getElementById = () => null;
    document.querySelector = () => null;
    browser.document = document;
    browser.CustomEvent = CustomEvent;
    browser.setTimeout = (callback, delay) => {
        const timer = Symbol();
        timers.set(timer, { callback, delay });
        return timer;
    };
    browser.clearTimeout = (timer) => timers.delete(timer);
    player.data = { item: { uri: "spotify:track:initial" } };
    player.origin = { _events: queueEvents };
    browser.addEventListener("ivLyrics:presentation-owner-released", (event) => {
        trace.push(["released", event.detail.trackUri]);
        assert.equal(getMountedLyricsPage(browser), undefined);
    });

    const visual = { "font-size": 32 };
    const translationCache = { init() {}, clear: () => assert.fail("page teardown must retain the shared cache") };
    const createPage = (name, overrides = {}) => {
        const record = (...event) => trace.push([name, ...event]);
        const noOp = () => {};
        const page = {
            _isComponentMounted: false,
            _lyricsPresentationSeq: 0,
            currentTrackUri: name,
            state: { explicitMode: 1 },
            setState(patch) {
                Object.assign(this.state, typeof patch === "function" ? patch(this.state) : patch);
            },
            playback: {
                resolver: { schedule: (item) => record("song", item.uri) },
                deactivate: () => record("cancel transition"),
            },
            pointerControls: { attach: noOp },
            generationStatus: { dispose: () => record("dispose generation status") },
            videoBackgroundLoading: { dispose: () => record("dispose video loading") },
            lyricsCacheEditor: { cancelPending: () => record("cancel editor") },
            handleLyricsProviderAttempt: () => record("provider progress"),
            handleWordSyncLoading: noOp,
            handlePronunciationSyncStatus: noOp,
            handlePronunciationFirstUpdate: noOp,
            handleMotionDirectionStatus: noOp,
            restoreWordSyncLoading: noOp,
            restorePronunciationSyncLoading: noOp,
            getCurrentMode: () => 1,
            getPlaybackPaused: () => true,
            infoFromTrack: (item) => item,
            updateVisualOnConfigChange: noOp,
            forceUpdate: () => record("refresh"),
            clearFloatingMenuCloseTimer: noOp,
        };
        const lifecycle = createLyricsPageLifecycle({
            page, browser, document, getPlayer: () => player,
            getLyricsAddonManager: () => ({
                on(event, handler) {
                    addonHandlers.set(event, handler);
                    return () => addonHandlers.delete(event);
                },
            }),
            getAIManager: () => ({
                on(event, handler) {
                    addonHandlers.set(event, handler);
                    return () => addonHandlers.delete(event);
                },
            }),
            prefetch: {
                createSession: () => ({
                    schedule: (track, mode) => record("prefetch", track?.uri, mode),
                    dispose: () => record("dispose prefetch"),
                }),
            },
            translationCache, needsSetup: () => true, showSetup: () => record("setup"),
            checkForUpdates: async () => {},
            createConfigButton: () => ({
                register: () => record("menu added"),
                deregister: () => record("menu removed"),
            }),
            reloadLyrics: (...args) => record("reload", ...args),
            getVisualSettings: () => visual,
            saveConfig: (key, value) => record(key, value),
            ...overrides,
        });
        page.componentWillUnmount = lifecycle.unmount;
        return { page, mount: lifecycle.mount };
    };
    return { browser, trace, classes, timers, addonHandlers, queueEvents, visual, createPage };
}

test("page settings refreshes coalesce and a replacement page discards old refresh callbacks", async () => {
    const { browser, trace, classes, timers, addonHandlers, queueEvents, visual, createPage } = createLyricsLifecycleFixture();
    const first = createPage("first");
    first.mount();
    first.mount();
    assert.equal(queueEvents.listenerCount("queue_update"), 1);
    queueEvents.emit("queue_update", undefined);
    first.page.onFontSizeChange({ ctrlKey: true, deltaY: -1 });
    first.page.onFontSizeChange({ ctrlKey: true, deltaY: -1 });
    assert.equal(visual["font-size"], 36);

    const oldProviderHandler = addonHandlers.get("lyrics:search:progress");
    const oldStyleHandler = addonHandlers.get("translation:style:changed");
    const oldRefresh = first.page.refreshLyricsView;
    const oldReload = first.page.reloadLyrics;
    const oldFontResize = first.page.onFontSizeChange;
    const oldSetupTimer = [...timers.values()].find(({ delay }) => delay === 500).callback;
    refreshLyricsPage(browser);
    const second = createPage("second");
    second.mount();
    first.page.componentWillUnmount();
    oldProviderHandler();
    oldStyleHandler();
    oldRefresh();
    oldReload();
    oldFontResize({ ctrlKey: true, deltaY: -1 });
    oldSetupTimer();
    queueEvents.emit("queue_update", { data: { queued: [{ uri: "spotify:track:next" }] } });
    queueEvents.emit("queue_update", { data: { queued: [] } });
    refreshLyricsPage(browser);
    refreshLyricsPage(browser);
    requestLyricsReload(browser);
    browser.dispatchEvent(new CustomEvent("ivLyrics:sync-data-updated", { detail: { trackUri: "spotify:track:initial" } }));
    browser.dispatchEvent(new CustomEvent("ivLyrics", { detail: { name: "pseudo-karaoke-render-advance" } }));
    addonHandlers.get("translation:style:changed")();
    await Promise.resolve();
    assert.equal(second.page.reRenderLyricsPage, 1);

    assert.equal(getMountedLyricsPage(browser), second.page);
    assert.equal(queueEvents.listenerCount("queue_update"), 1);
    assert.equal(addonHandlers.size, 3);
    assert.ok(classes.has("ivlyrics-page-active"));
    assert.deepEqual(trace, [
        ["first", "song", "spotify:track:initial"], ["first", "menu added"],
        ["first", "font-size", 36], ["first", "refresh"],
        ["first", "dispose prefetch"], ["first", "menu removed"], ["first", "cancel editor"], ["first", "cancel transition"],
        ["first", "dispose video loading"], ["first", "dispose generation status"],
        ["released", "first"],
        ["second", "song", "spotify:track:initial"], ["second", "menu added"],
        ["second", "prefetch", "spotify:track:next", 1], ["second", "prefetch", undefined, 1],
        ["second", "reload", true],
        ["second", "reload", false, "spotify:track:initial"],
        ["second", "refresh"],
    ]);

    second.page.componentWillUnmount();
    assert.equal(getMountedLyricsPage(browser), undefined);
    assert.equal(getRuntimeService("reloadLyrics", browser), undefined);
    assert.equal(classes.size, 0);
    assert.equal(addonHandlers.size, 0);
    assert.equal(queueEvents.listenerCount("queue_update"), 0);
    assert.deepEqual(trace.at(-1), ["released", "second"]);
});

test("furigana readiness and a pronunciation preset refresh the existing lyric rows once", async () => {
    const { browser, trace, visual, createPage } = createLyricsLifecycleFixture();
    const { page, mount } = createPage("settings");
    const lyrics = [{ text: "原文" }];
    page.state.currentLyrics = lyrics;
    page.state.currentLyricIndex = 3;
    page.pronunciationPresentation = { invalidateTiming: () => trace.push(["invalidate timing"]) };
    mount();
    trace.length = 0;
    browser.dispatchEvent(new Event("furigana-ready"));
    await Promise.resolve();
    assert.deepEqual(trace, []);

    visual["furigana-enabled"] = true;
    browser.dispatchEvent(new Event("furigana-ready"));
    await Promise.resolve();
    assert.equal(page.reRenderLyricsPage, 1);

    for (const name of ["pronunciation-first", "pronunciation-karaoke-fill", "synced-pronunciation"]) {
        browser.dispatchEvent(new CustomEvent("ivLyrics", { detail: { type: "config", name } }));
    }
    refreshLyricsPage(browser);
    await Promise.resolve();
    assert.equal(page.reRenderLyricsPage, 2);
    assert.deepEqual(trace, [["settings", "refresh"], ["invalidate timing"], ["settings", "refresh"]]);
    assert.equal(page.state.currentLyrics, lyrics);
    assert.equal(page.state.currentLyricIndex, 3);
    page.componentWillUnmount();
});

test("page settings direct mode, background and fullscreen changes to their own actions", () => {
    const { browser, trace, visual, createPage } = createLyricsLifecycleFixture();
    const { page, mount } = createPage("settings");
    page.getEffectiveBackgroundMode = () => visual.mode;
    page.fetchColors = uri => trace.push(["colors", uri]);
    mount();
    page.setFullscreenPresentation = value => trace.push(["presentation", value]);
    trace.length = 0;

    const publish = detail => browser.dispatchEvent(new CustomEvent("ivLyrics", { detail }));
    publish({ name: "karaoke-mode-enabled" });
    assert.equal(page.state.explicitMode, -1);
    publish({ name: "spotify-fake-karaoke-enabled" });
    visual.mode = "video-background";
    publish({ name: "background-mode" });
    visual["video-fallback-background"] = "blur-gradient";
    publish({ name: "video-fallback-background" });
    publish({ type: "fullscreen-presentation", value: "motion" });
    page.state.isFullscreen = true;
    publish({ type: "fullscreen-presentation", value: "motion" });
    assert.deepEqual(trace, [["settings", "reload", false], ["colors", "settings"], ["presentation", "motion"]]);
    page.componentWillUnmount();
});

test("a partial page mount releases its menu, subscriptions, and runtime services before retry", () => {
    const { browser, trace, classes, timers, addonHandlers, queueEvents, createPage } = createLyricsLifecycleFixture();
    const failure = new Error("failed while registering the Spotify menu item");
    const ready = [];
    const motionStatuses = [];
    const emitMotionStatus = phase => browser.dispatchEvent(new CustomEvent("ivLyrics:motion-direction:status", {
        detail: { phase },
    }));
    browser.addEventListener("ivLyrics:page-ready", event => ready.push(event.detail));
    let failRegistration = true;
    let registeredMenu = false;
    let oldProviderCallback;
    let oldSetupCallback;
    const { page, mount } = createPage("retry", {
        createConfigButton: () => ({
            register() {
                registeredMenu = true;
                if (!failRegistration) return;
                oldProviderCallback = addonHandlers.get("lyrics:search:progress");
                oldSetupCallback = [...timers.values()].find(({ delay }) => delay === 500).callback;
                throw failure;
            },
            deregister() { registeredMenu = false; },
        }),
    });
    page.handleMotionDirectionStatus = event => motionStatuses.push(event.detail.phase);

    assert.throws(mount, error => error === failure);
    assert.equal(page._isComponentMounted, false);
    assert.equal(getMountedLyricsPage(browser), undefined);
    assert.equal(getRuntimeService("reloadLyrics", browser), undefined);
    assert.equal(classes.size, 0);
    assert.equal(addonHandlers.size, 0);
    assert.equal(queueEvents.listenerCount("queue_update"), 0);
    assert.equal(registeredMenu, false);
    assert.equal(ready.length, 0);
    assert.equal(timers.size, 1, "only the shared update check remains scheduled");

    const previouslyRecorded = trace.length;
    oldProviderCallback();
    oldSetupCallback();
    emitMotionStatus("after-failed-mount");
    assert.equal(trace.length, previouslyRecorded);
    failRegistration = false;
    mount();
    assert.equal(getMountedLyricsPage(browser), page);
    assert.equal(registeredMenu, true);
    assert.equal(queueEvents.listenerCount("queue_update"), 1);
    assert.deepEqual(ready, [page]);
    emitMotionStatus("active");
    page.componentWillUnmount();
    assert.equal(registeredMenu, false);
    emitMotionStatus("after-close");
    assert.deepEqual(motionStatuses, ["active"]);
});

test("a cleanup error does not strand page subscriptions or prevent overlay handoff", (context) => {
    const { browser, trace, classes, addonHandlers, queueEvents, createPage } = createLyricsLifecycleFixture();
    const { page, mount } = createPage("closing");
    const warning = context.mock.method(console, "warn", () => {});
    const failure = new Error("fixture import cleanup failure");
    mount();
    const previousProviderCallback = addonHandlers.get("lyrics:search:progress");
    page.cancelPendingLocalLyricsImports = () => {
        previousProviderCallback();
        throw failure;
    };
    page.componentWillUnmount();
    page.componentWillUnmount();
    assert.equal(page._isComponentMounted, false);
    assert.equal(getMountedLyricsPage(browser), undefined);
    assert.equal(getRuntimeService("reloadLyrics", browser), undefined);
    assert.equal(classes.size, 0);
    assert.equal(addonHandlers.size, 0);
    assert.equal(queueEvents.listenerCount("queue_update"), 0);
    assert.equal(trace.some((entry) => entry.includes("provider progress")), false);
    assert.deepEqual(warning.mock.calls.map(({ arguments: args }) => args), [["[ivLyrics] Page cleanup failed:", failure]]);
    assert.deepEqual(trace.slice(-3), [
        ["closing", "dispose video loading"],
        ["closing", "dispose generation status"],
        ["released", "closing"],
    ]);
});

test("reload requests prefer the mounted owner and preserve the legacy startup fallback", () => {
    const page = {
        _isComponentMounted: true,
        reloadLyrics(clearCache) {
            assert.equal(this, page);
            return ["page", clearCache];
        },
    };
    const host = {
        lyricContainer: page,
        reloadLyrics(...args) {
            assert.equal(this, host);
            return ["legacy", ...args];
        },
    };
    assert.deepEqual(requestLyricsReload(host, false), ["page", false]);
    page._isComponentMounted = false;
    assert.equal(requestLyricsReload(host, true), undefined);
    delete host.lyricContainer;
    assert.deepEqual(requestLyricsReload(host), ["legacy"]);
});
