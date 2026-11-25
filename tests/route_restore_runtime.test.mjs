import assert from "node:assert/strict";
import test from "node:test";
import {
    queueSettingsReturn, requestAppRouteReload, ROUTE_RESTORE_KEY, SETTINGS_RETURN_KEY,
} from "#ivlyrics/spicetify/routeReload.mjs";
import { restorePendingRoute } from "#ivlyrics/spicetify/restorePendingRoute.mjs";
import { restoreSettingsModalAfterReload, restoreSettingsOnFirstLyricsMount } from "#ivlyrics/features/settings/settingsModalHost.mjs";
import { createDiscordAccountSession } from "#ivlyrics/features/account/discordAccountSession.mjs";
import { startRouteRestore } from "#ivlyrics/spicetify/startRouteRestore.mjs";
import { LYRICS_PAGE_READY_EVENT } from "#ivlyrics/spicetify/lyricsPageEffects.mjs";

function createStorage() {
    const values = new Map();
    return {
        getItem: key => values.get(key),
        removeItem: key => values.delete(key),
        setItem: (key, value) => values.set(key, value),
    };
}

function createHarness({ pathname = "/", documentReady = true, isRouterReady, routerWarmupPath } = {}) {
    const options = { path: "/ivLyrics", expiresAt: 25_000 };
    const values = new Map([
        [ROUTE_RESTORE_KEY, JSON.stringify(options)],
        [SETTINGS_RETURN_KEY, JSON.stringify({ initialTab: "about" })],
    ]);
    const routeChanges = [];
    const timers = [];
    let now = 10_000;
    let ready = false;
    let reloads = 0;
    const history = {
        location: { pathname },
        push(path) {
            this.location.pathname = path;
            routeChanges.push(["push", path]);
        },
        replace(path) {
            this.location.pathname = path;
            routeChanges.push(["replace", path]);
        },
    };
    return {
        values, routeChanges, timers,
        get reloads() { return reloads; },
        setDocumentReady() { documentReady = true; },
        setAppReady() { ready = true; },
        navigate(path) { history.location.pathname = path; },
        start() {
            restorePendingRoute({
                getStorage: () => ({
                    getItem: key => values.get(key),
                    setItem: (key, value) => values.set(key, value),
                    removeItem: key => values.delete(key),
                }),
                getHistory: () => history,
                isDocumentReady: () => documentReady,
                isRouterReady,
                routerWarmupPath,
                isAppReady: () => ready,
                schedule: (callback, delay) => timers.push({ callback, delay }),
                reload: () => { reloads++; },
                now: () => now,
            });
        },
        tick() {
            const timer = timers.shift();
            assert.ok(timer, "restore should have scheduled work");
            now += timer.delay;
            timer.callback();
        },
    };
}

test("restore waits for Spotify to register routes before opening the page and retains settings return", () => {
    const h = createHarness({ documentReady: false });
    h.start();
    assert.equal(h.timers[0].delay, 150);
    h.setDocumentReady();
    h.tick();
    assert.deepEqual(h.routeChanges, []);
    assert.equal(h.timers[0].delay, 1_000);
    h.tick();
    assert.deepEqual(h.routeChanges, [["push", "/ivLyrics"]]);
    assert.ok(h.values.has(ROUTE_RESTORE_KEY));
    h.setAppReady();
    h.tick();
    assert.equal(h.values.has(ROUTE_RESTORE_KEY), false);
    assert.equal(h.values.has(SETTINGS_RETURN_KEY), true);
    assert.equal(h.reloads, 0);
});

test("a missed webpack event still restores once the document and history settle", () => {
    const h = createHarness({ isRouterReady: () => false });
    h.start();
    assert.deepEqual(h.routeChanges, []);
    for (let retry = 0; !h.routeChanges.length && retry < 8; retry++) h.tick();
    assert.deepEqual(h.routeChanges, [["push", "/ivLyrics"]]);
    h.setAppReady();
    h.tick();
    assert.equal(h.values.has(SETTINGS_RETURN_KEY), true);
    assert.equal(h.values.has(ROUTE_RESTORE_KEY), false);
    assert.equal(h.reloads, 0);
});

test("a pending Spotify router opens a native route before requesting the lyrics chunk", () => {
    let routerReady = false;
    const h = createHarness({
        routerWarmupPath: "/collection/tracks",
        isRouterReady: () => routerReady,
    });
    h.start();
    for (let retry = 0; !h.routeChanges.length && retry < 8; retry++) h.tick();
    assert.deepEqual(h.routeChanges, [["replace", "/collection/tracks"]]);
    h.tick();
    assert.equal(h.routeChanges.length, 1);
    assert.ok(h.values.has(ROUTE_RESTORE_KEY));
    routerReady = true;
    h.tick();
    assert.deepEqual(h.routeChanges, [
        ["replace", "/collection/tracks"], ["replace", "/"], ["push", "/ivLyrics"],
    ]);
    h.setAppReady();
    h.tick();
    assert.equal(h.values.has(ROUTE_RESTORE_KEY), false);
    assert.equal(h.values.has(SETTINGS_RETURN_KEY), true);
    assert.equal(h.reloads, 0);
});

test("manual navigation during the native-route warmup cancels the pending lyrics restore", () => {
    let routerReady = false;
    const h = createHarness({
        routerWarmupPath: "/collection/tracks",
        isRouterReady: () => routerReady,
    });
    h.start();
    for (let retry = 0; !h.routeChanges.length && retry < 8; retry++) h.tick();
    h.navigate("/search");
    routerReady = true;
    h.tick();
    assert.deepEqual(h.routeChanges, [["replace", "/collection/tracks"]]);
    assert.equal(h.values.size, 0);
    assert.equal(h.timers.length, 0);
});

test("a legacy host that never sends readiness only warms once and can still mount the page", () => {
    const h = createHarness({ routerWarmupPath: "/collection/tracks", isRouterReady: () => false });
    h.start();
    for (let retry = 0; h.routeChanges.length < 3 && retry < 32; retry++) h.tick();
    assert.deepEqual(h.routeChanges, [
        ["replace", "/collection/tracks"], ["replace", "/"], ["push", "/ivLyrics"],
    ]);
    h.setAppReady();
    h.tick();
    assert.equal(h.reloads, 0);
    assert.equal(h.values.has(ROUTE_RESTORE_KEY), false);
});

test("restore moves a stale custom-app route to Spotify before reload", () => {
    const h = createHarness({ pathname: "/ivLyrics" });
    h.start();
    h.tick();
    assert.deepEqual(h.routeChanges, [], "wait for the already-open page to mount");
    for (let ticks = 0; !h.routeChanges.length && ticks < 35; ticks++) h.tick();
    assert.deepEqual(h.routeChanges, [["replace", "/"]]);
    assert.equal(h.timers[0].delay, 150);
    h.tick();
    assert.equal(h.reloads, 1);
    assert.equal(JSON.parse(h.values.get(ROUTE_RESTORE_KEY)).recoveryAttempted, true);
});

test("an entry that stays unmounted gets one recovery reload across documents", () => {
    const h = createHarness();
    h.start();
    for (let ticks = 0; !h.reloads && ticks < 40; ticks++) h.tick();
    assert.deepEqual(h.routeChanges, [["push", "/ivLyrics"], ["replace", "/"]]);
    assert.equal(h.reloads, 1);
    h.start();
    for (let ticks = 0; h.timers.length && ticks < 45; ticks++) h.tick();
    assert.equal(h.reloads, 1);
    assert.deepEqual(h.routeChanges, [["push", "/ivLyrics"], ["replace", "/"], ["push", "/ivLyrics"]]);
    assert.equal(h.values.size, 0);
});

test("a user leaving a pending lyrics route cancels the restore and queued settings", () => {
    const h = createHarness();
    h.start();
    h.tick();
    h.navigate("/search");
    h.tick();
    assert.deepEqual(h.routeChanges, [["push", "/ivLyrics"]]);
    assert.equal(h.values.size, 0);
    assert.equal(h.timers.length, 0);
});

test("startup waits for Spotify's webpack signal and the mounted app before clearing recovery", () => {
    const storage = createStorage();
    storage.setItem(ROUTE_RESTORE_KEY, JSON.stringify({ path: "/ivLyrics", expiresAt: Date.now() + 15000 }));
    const timers = [];
    let onWebpackReady;
    let pushes = 0;
    const history = { location: { pathname: "/" }, push(pathname) { pushes++; this.location.pathname = pathname; } };
    const host = {
        document: { readyState: "complete" }, localStorage: storage,
        Spicetify: { Platform: { History: history }, Events: { webpackLoaded: { on: callback => { onWebpackReady = callback; } } } },
        setTimeout: (callback, delay) => timers.push({ callback, delay }),
        location: { reload: () => assert.fail("ready navigation must not reload") },
    };
    startRouteRestore(host);
    assert.equal(pushes, 0);
    onWebpackReady();
    timers.shift().callback();
    assert.equal(pushes, 1);
    assert.ok(storage.getItem(ROUTE_RESTORE_KEY));
    host.lyricContainer = { _isComponentMounted: true };
    timers.shift().callback();
    assert.equal(storage.getItem(ROUTE_RESTORE_KEY), undefined);
    assert.equal(timers.length, 0);
});

function createStartupDocument({ storage, sessionStorage, pathname, navigation }) {
    const host = new EventTarget();
    const routes = [];
    const timers = [];
    const history = { location: { pathname }, push(pathname) {
        routes.push(pathname);
        this.location.pathname = pathname;
    } };
    Object.assign(host, {
        document: { readyState: "complete" },
        localStorage: storage,
        sessionStorage,
        Spicetify: { Platform: { History: history } },
        location: { reload: () => assert.fail("the working app route should mount without a second reload") },
        performance: { getEntriesByType: type => type === "navigation" ? [{ type: navigation }] : [] },
        setTimeout: (callback, delay) => timers.push({ callback, delay }),
    });
    return { host, routes, timers, history };
}

test("a native reload restores an open lyrics route using the existing startup recovery", () => {
    const storage = createStorage();
    const sessionStorage = createStorage();
    const previous = createStartupDocument({ storage, sessionStorage, pathname: "/ivLyrics", navigation: "navigate" });
    startRouteRestore(previous.host);
    assert.equal(previous.timers.length, 0);
    previous.host.dispatchEvent(new Event("pagehide"));

    const next = createStartupDocument({ storage, sessionStorage, pathname: "/", navigation: "reload" });
    let routesReady;
    next.host.Spicetify.Events = { webpackLoaded: { on: callback => { routesReady = callback; } } };
    startRouteRestore(next.host);
    assert.deepEqual(next.routes, []);
    assert.ok(storage.getItem(ROUTE_RESTORE_KEY));
    routesReady();
    next.timers.shift().callback();
    assert.deepEqual(next.routes, ["/ivLyrics"]);
    next.host.lyricContainer = { _isComponentMounted: true };
    next.timers.shift().callback();
    assert.equal(storage.getItem(ROUTE_RESTORE_KEY), undefined);
});

test("repeated startup in the same document shares one restore and pagehide listener", () => {
    const storage = createStorage();
    const sessionStorage = createStorage();
    storage.setItem(ROUTE_RESTORE_KEY, JSON.stringify({ path: "/ivLyrics", expiresAt: Date.now() + 15000 }));
    const h = createStartupDocument({ storage, sessionStorage, pathname: "/", navigation: "reload" });
    const pages = [];
    const recordRoute = sessionStorage.setItem;
    sessionStorage.setItem = (key, value) => { pages.push(value); recordRoute(key, value); };
    const listeners = [];
    h.host.Spicetify.Events = { webpackLoaded: { on: fn => listeners.push(fn) } };
    startRouteRestore(h.host);
    startRouteRestore(h.host);
    assert.equal(h.timers.length, 1);
    assert.equal(listeners.length, 1);
    listeners[0]();
    h.timers.shift().callback();
    assert.deepEqual(h.routes, ["/ivLyrics"]);
    h.host.lyricContainer = { _isComponentMounted: true };
    h.timers.shift().callback();
    assert.equal(h.timers.length, 0);
    h.host.dispatchEvent(new Event("pagehide"));
    assert.deepEqual(pages, ["/ivLyrics"]);
});

test("a throwing webpack subscription leaves the History fallback available", (context) => {
    const now = Date.now();
    context.mock.timers.enable({ apis: ["Date"], now });
    const storage = createStorage();
    storage.setItem(ROUTE_RESTORE_KEY, JSON.stringify({ path: "/ivLyrics", expiresAt: now + 15000 }));
    const h = createStartupDocument({ storage, pathname: "/", navigation: "reload" });
    h.host.Spicetify.Events = { webpackLoaded: { on() { throw new Error("fixture signal not ready"); } } };
    startRouteRestore(h.host);
    assert.equal(h.timers.length, 1);
    const retry = h.timers.shift();
    context.mock.timers.tick(retry.delay);
    retry.callback();
    assert.deepEqual(h.routes, ["/ivLyrics"]);
});

test("opening Spotify normally or reloading another page does not reopen lyrics", () => {
    for (const [previousPath, navigation] of [["/ivLyrics", "navigate"], ["/search", "reload"]]) {
        const storage = createStorage();
        const sessionStorage = createStorage();
        const previous = createStartupDocument({ storage, sessionStorage, pathname: previousPath, navigation: "navigate" });
        startRouteRestore(previous.host);
        previous.host.dispatchEvent(new Event("pagehide"));
        const next = createStartupDocument({ storage, sessionStorage, pathname: "/", navigation });
        startRouteRestore(next.host);
        assert.deepEqual(next.routes, []);
        assert.deepEqual(next.timers, []);
        assert.equal(storage.getItem(ROUTE_RESTORE_KEY), undefined);
    }
});

test("a pending application reload retains its route deadline and settings destination", () => {
    const storage = createStorage();
    const sessionStorage = createStorage();
    const previous = createStartupDocument({ storage, sessionStorage, pathname: "/ivLyrics", navigation: "navigate" });
    startRouteRestore(previous.host);
    previous.host.dispatchEvent(new Event("pagehide"));
    const pending = JSON.stringify({ path: "/ivLyrics", expiresAt: Date.now() + 10_000, recoveryAttempted: true });
    storage.setItem(ROUTE_RESTORE_KEY, pending);
    queueSettingsReturn(storage, { initialTab: "advanced", initialSettingKey: "import-settings" });

    const next = createStartupDocument({ storage, sessionStorage, pathname: "/", navigation: "reload" });
    startRouteRestore(next.host);
    assert.equal(storage.getItem(ROUTE_RESTORE_KEY), pending);
    assert.deepEqual(JSON.parse(storage.getItem(SETTINGS_RETURN_KEY)), { initialTab: "advanced", initialSettingKey: "import-settings" });
    assert.deepEqual(next.routes, []);
});

test("reopening settings waits for the actual lyrics page mount and drops a stale mount", () => {
    const host = new EventTarget();
    const opened = [];
    const timers = [];
    host.localStorage = createStorage();
    host.document = { body: {} };
    host.setTimeout = (callback, delay) => timers.push({ callback, delay });
    queueSettingsReturn(host.localStorage, { initialTab: "about", initialSettingKey: "about-account" });
    restoreSettingsOnFirstLyricsMount(host, options => opened.push(options));
    assert.ok(host.localStorage.getItem(SETTINGS_RETURN_KEY));
    host.lyricContainer = {};
    host.dispatchEvent(new CustomEvent(LYRICS_PAGE_READY_EVENT, { detail: {} }));
    assert.equal(timers.length, 0);
    host.dispatchEvent(new CustomEvent(LYRICS_PAGE_READY_EVENT, { detail: host.lyricContainer }));
    assert.equal(timers[0].delay, 500);
    host.lyricContainer = null;
    timers.shift().callback();
    assert.deepEqual(opened, []);
    assert.equal(host.localStorage.getItem(SETTINGS_RETURN_KEY), undefined);
});

test("expired restore flags do not leave a queued settings dialog", () => {
    const h = createHarness();
    h.values.set(ROUTE_RESTORE_KEY, JSON.stringify({ path: "/ivLyrics", expiresAt: 5_000 }));
    h.start();
    assert.equal(h.values.size, 0);
    assert.deepEqual(h.routeChanges, []);
    assert.deepEqual(h.timers, []);
});

test("a Discord settings reload returns to the account row once the document is ready", () => {
    const storage = createStorage();
    const timers = [];
    const events = [];
    const schedule = (callback, delay) => timers.push({ callback, delay });
    let ready = false;
    const session = createDiscordAccountSession({
        host: { setTimeout: schedule, location: { reload: () => events.push("reload") } },
        readLocalStorage: () => storage,
        spicetify: { Platform: { History: { replace: path => events.push(path) } } },
    });
    session.restoreAccountSettings();
    assert.deepEqual(events, ["/"]);
    assert.equal(storage.getItem(ROUTE_RESTORE_KEY), undefined);
    assert.equal(storage.getItem(SETTINGS_RETURN_KEY), undefined);
    assert.equal(timers[0].delay, 300);
    timers.shift().callback();
    assert.deepEqual(events, ["/", "reload"]);
    assert.equal(JSON.parse(storage.getItem(ROUTE_RESTORE_KEY)).path, "/ivLyrics");

    const restoreOptions = {
        getStorage: () => storage, isDocumentReady: () => ready,
        schedule, open: options => events.push(options),
    };
    restoreSettingsModalAfterReload(restoreOptions);
    assert.equal(storage.getItem(SETTINGS_RETURN_KEY), undefined);
    assert.equal(timers[0].delay, 100);
    ready = true;
    timers.shift().callback();
    assert.equal(timers[0].delay, 500);
    timers.shift().callback();
    assert.deepEqual(events, ["/", "reload", { initialTab: "about", initialSettingKey: "about-account" }]);

    restoreSettingsModalAfterReload(restoreOptions);
    assert.deepEqual(timers, []);
});

test("settings reopens General for the legacy flag and passes explicit destinations through", () => {
    const storage = createStorage();
    const opened = [];
    const restore = () => restoreSettingsModalAfterReload({
        getStorage: () => storage, isDocumentReady: () => true,
        schedule: callback => callback(), open: options => opened.push(options),
    });
    storage.setItem(SETTINGS_RETURN_KEY, "true");
    restore();
    queueSettingsReturn(storage, { initialTab: "appearance", initialSettingKey: "text-shadow" });
    restore();
    assert.deepEqual(opened, [
        { initialTab: "general" }, { initialTab: "appearance", initialSettingKey: "text-shadow" },
    ]);
});

test("unavailable route storage cannot prevent navigation and a failed router cannot prevent reload", () => {
    const events = [];
    const unavailable = new Error("storage unavailable");
    const navigationError = new Error("router unavailable");
    requestAppRouteReload({
        host: {},
        getStorage() { throw unavailable; },
        getHistory: () => ({ replace(path) { events.push(path); throw navigationError; } }),
        schedule(callback, delay) { events.push(delay); callback(); },
        reload: () => events.push("reload"),
        delay: 0,
        reportError: (_message, error) => events.push(error),
    });
    assert.deepEqual(events, ["/", navigationError, 150, unavailable, "reload"]);
    restoreSettingsModalAfterReload({
        getStorage() { throw unavailable; },
        schedule: () => assert.fail("unavailable state must not retry reading storage"),
        reportError: (_message, error) => events.push(error),
    });
    assert.equal(events.at(-1), unavailable);
});

test("overlapping reload requests share one timer across bundles and retain the latest explicit destination", async () => {
    const { requestAppRouteReload: requestFromStartup } = await import("../src/spicetify/routeReload.mjs?startup-fixture");
    const storage = createStorage();
    const active = new Map();
    const navigation = [];
    let now = 2000, id = 0, reloads = 0;
    const history = {
        location: { pathname: "/ivLyrics" },
        replace(pathname) { this.location.pathname = pathname; navigation.push(pathname); },
    };
    const host = {
        localStorage: storage,
        Spicetify: { Platform: { History: history } },
        setTimeout(callback, delay) { active.set(++id, { callback, delay }); return id; },
        clearTimeout(timer) { active.delete(timer); },
        location: { reload() { reloads++; } },
    };
    const options = {
        host, now: () => now, getStorage: () => storage, getHistory: () => history,
        schedule: host.setTimeout, cancel: host.clearTimeout, reload: host.location.reload,
    };
    requestAppRouteReload({ ...options, delay: 1500, settingsReturn: { initialTab: "general" } });
    const obsolete = active.get(1);
    now += 50;
    requestAppRouteReload({ ...options, delay: 300, settingsReturn: { initialTab: "about", initialSettingKey: "about-account" } });
    now += 20;
    requestFromStartup({ ...options, delay: 150, restoreLyrics: false });
    assert.deepEqual(navigation, ["/"]);
    assert.equal(active.size, 1);
    assert.equal(storage.getItem(SETTINGS_RETURN_KEY), undefined, "the outgoing document cannot consume the new return marker");
    obsolete.callback();
    assert.equal(reloads, 0);
    active.get(3).callback();
    assert.equal(reloads, 1);
    assert.equal(JSON.parse(storage.getItem(ROUTE_RESTORE_KEY)).path, "/ivLyrics");
    assert.deepEqual(JSON.parse(storage.getItem(SETTINGS_RETURN_KEY)), { initialTab: "about", initialSettingKey: "about-account" });
});

test("a lyrics route revisited during the delay settles on Home before the new document reloads", () => {
    const storage = createStorage();
    const steps = [], timers = [];
    const history = {
        location: { pathname: "/ivLyrics" },
        replace(pathname) { this.location.pathname = pathname; steps.push(pathname); },
    };
    const host = {
        localStorage: storage,
        Spicetify: { Platform: { History: history } },
        setTimeout(callback, delay) { timers.push({ callback, delay }); },
        location: { reload() { steps.push("reload"); } },
    };
    requestAppRouteReload({ host, delay: 700, settingsReturn: { initialTab: "advanced" } });
    history.location.pathname = "/ivLyrics";
    const firstTimer = timers.shift();
    assert.equal(firstTimer.delay, 700);
    firstTimer.callback();
    assert.deepEqual(steps, ["/", "/"]);
    assert.equal(storage.getItem(SETTINGS_RETURN_KEY), undefined);
    assert.equal(timers[0].delay, 150);
    timers.shift().callback();
    assert.deepEqual(steps, ["/", "/", "reload"]);
    assert.deepEqual(JSON.parse(storage.getItem(SETTINGS_RETURN_KEY)), { initialTab: "advanced" });
});
