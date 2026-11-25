import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import {
    installPageUrlCallbacks, observeOverlayStartup, schedulePagePrefetchCleanup,
} from "../src/spicetify/pageStartup.mjs";
import { createGlobalSyncOffsetReader, GLOBAL_SYNC_OFFSET_STORAGE_KEY } from "../src/core/globalSyncOffset.mjs";
import { createSyncOffsetControls } from "../src/core/syncOffsetControls.mjs";
import { createPageTranslationMemoryCache } from "../src/lyrics/pageMemoryCache.mjs";
import { readI18nFixture, readTranslationRuntimeFixture } from "./fixtures/legacy-page-source.mjs";

function bundleStartupFixture(contents) {
    return buildSync({
        stdin: {
            contents,
            resolveDir: fileURLToPath(new URL("../", import.meta.url)),
        },
        bundle: true,
        write: false,
        format: "iife",
    }).outputFiles[0].text;
}

test("startup and page bundles receive the same per-track offset store", () => {
    const window = {};
    const context = vm.createContext({ window });
    for (const name of ["startup", "page"]) {
        vm.runInContext(bundleStartupFixture(`
            import { getTrackSyncOffsetStore } from "#ivlyrics/core/trackSyncOffsetRuntime.mjs";
            globalThis.${name}Offsets = getTrackSyncOffsetStore(window);
        `), context);
    }
    assert.equal(context.startupOffsets, context.pageOffsets);
    assert.equal(window.TrackSyncDB, context.pageOffsets);
});

test("startup and page bundles share their track preferences and concurrent database open", async () => {
    let opens = 0;
    const window = { indexedDB: { open() {
        opens++;
        const request = {};
        queueMicrotask(() => {
            request.result = {
                transaction: () => ({ objectStore: () => ({ get() {
                    const query = { result: "ja" };
                    queueMicrotask(() => query.onsuccess());
                    return query;
                } }) }),
            };
            request.onsuccess();
        });
        return request;
    } } };
    const context = vm.createContext({ window });
    for (const name of ["startup", "page"]) {
        vm.runInContext(bundleStartupFixture(`
            import { getTrackOverrideStores } from "#ivlyrics/core/trackOverrideRuntime.mjs";
            globalThis.${name}Overrides = getTrackOverrideStores(window);
        `), context);
    }
    assert.equal(context.startupOverrides, context.pageOverrides);
    assert.equal(window.TrackLanguageDB, context.pageOverrides.TrackLanguageDB);
    assert.equal(window.TrackLyricsProviderDB, context.pageOverrides.TrackLyricsProviderDB);
    assert.equal(window.TrackBackgroundDB, context.pageOverrides.TrackBackgroundDB);
    const uri = "spotify:track:stored-language";
    assert.deepEqual(await Promise.all([
        context.startupOverrides.readLanguage(uri), context.pageOverrides.readLanguage(uri),
    ]), ["ja", "ja"]);
    assert.equal(opens, 1);
});

test("global timing reads late config and survives a denied persistence backend", () => {
    let reads = 0;
    const stored = new Map([[GLOBAL_SYNC_OFFSET_STORAGE_KEY, "-125.7"]]);
    const events = [];
    const window = {
        ivLyricsStoragePersistence: { getItem() { throw new Error("Store unavailable"); } },
        Spicetify: { LocalStorage: { get: () => null } },
        localStorage: { getItem(key) { reads++; return stored.get(key); } },
        CustomEvent,
        dispatchEvent: event => events.push([event.type, event.detail]),
    };
    const reader = createGlobalSyncOffsetReader(window);
    assert.equal(reader(), -126);
    window.CONFIG = { visual: { "global-sync-offset": 0 } };
    assert.equal(reader(), 0, "a live zero wins over an older saved offset");
    assert.equal(reads, 1, "live timing never reads localStorage on each frame");

    const controls = createSyncOffsetControls({
        host: window,
        readVisualSettings: () => window.CONFIG.visual,
        localStorage: window.localStorage,
        readStorage: () => ({ saveConfig: (key, value) => stored.set("ivLyrics:visual:" + key, value) }),
    });
    controls.setGlobalSyncOffset("12001.5");
    assert.equal(controls.getGlobalSyncOffset(), 10000);
    assert.equal(reader(), 10000);
    assert.equal(stored.get(GLOBAL_SYNC_OFFSET_STORAGE_KEY), 10000);
    assert.deepEqual(events, [
        ["ivLyrics:global-offset-changed", { offset: 10000 }],
        ["ivLyrics", { type: "config", name: "global-sync-offset", value: 10000 }],
    ]);
});

test("cold ivLyrics links deliver each callback once and decode the alert as a query value", () => {
    const host = {};
    const token = "token+/=";
    const text = "Update complete 100% (새 버전)";
    const location = { pathname: "/ivLyrics/", search: new URLSearchParams({
        alert: text, action: "discord-auth", loginToken: token,
    }).toString() };
    let listener;
    const history = { location, listen: (callback) => { listener = callback; } };
    const events = [];
    const callbacks = {
        getHistory: () => history,
        onAlert: message => events.push(["alert", message]),
        onDiscordLogin: value => events.push(["login", value]),
        onError: error => events.push(["error", error.message]),
    };
    installPageUrlCallbacks(host, callbacks);
    listener();
    installPageUrlCallbacks(host, callbacks);
    assert.deepEqual(events, [["alert", text], ["login", token]]);

    location.pathname = "/home";
    listener();
    location.pathname = "/ivLyrics/";
    location.search = "?action=discord-auth&loginToken=token%2B%2F%3D";
    listener();
    assert.equal(events.length, 2, "reopening the same OAuth link does not redeem its token again");
});

test("route startup uses the latest handlers and releases replaced History subscriptions", () => {
    const host = {};
    const events = [];
    function createHistory(location) {
        return {
            location,
            listens: 0,
            unlistens: 0,
            listen(listener) {
                this.listens++;
                this.listener = listener;
                return () => this.unlistens++;
            },
        };
    }
    const originalHistory = createHistory({ pathname: "/home" });
    let history = originalHistory;
    const install = (owner) => installPageUrlCallbacks(host, {
        getHistory: () => history,
        onAlert: message => events.push([owner, "alert", message]),
        onDiscordLogin: token => events.push([owner, "login", token]),
        onError: assert.fail,
    });

    install("initial");
    install("current");
    assert.equal(originalHistory.listens, 1);
    originalHistory.location = {
        pathname: "/ivLyrics",
        search: "?alert=first&action=discord-auth&loginToken=test",
    };
    originalHistory.listener();
    assert.deepEqual(events, [["current", "alert", "first"], ["current", "login", "test"]]);

    history = createHistory({ ...originalHistory.location });
    install("replacement");
    assert.equal(originalHistory.unlistens, 1);
    assert.equal(history.listens, 1);
    assert.equal(events.length, 2, "replacing History preserves the current link's deduplication");

    originalHistory.location.search = "?alert=retired";
    originalHistory.listener();
    history.location.search = "?alert=second&action=discord-auth&loginToken=test";
    history.listener();
    assert.deepEqual(events.slice(2), [["replacement", "alert", "second"]]);
});

test("a failed History subscription can be retried", () => {
    const host = {};
    const errors = [];
    const alerts = [];
    const error = new Error("History is initializing");
    const history = { location: { pathname: "/ivLyrics", search: "?alert=ready" } };
    const callbacks = {
        getHistory: () => history,
        onAlert: message => alerts.push(message),
        onDiscordLogin: assert.fail,
        onError: failure => errors.push(failure),
    };
    installPageUrlCallbacks(host, callbacks);
    history.listen = () => { throw error; };
    installPageUrlCallbacks(host, callbacks);
    history.listen = () => () => {};
    installPageUrlCallbacks(host, callbacks);
    assert.deepEqual(errors, [error]);
    assert.deepEqual(alerts, ["ready"]);
});

test("prefetch cleanup follows the current cache without scheduling a second interval", () => {
    const intervals = [];
    const host = { setInterval: (tick, delay) => intervals.push({ tick, delay }) };
    const cleanups = [];
    schedulePagePrefetchCleanup(host, () => cleanups.push("initial"));
    schedulePagePrefetchCleanup(host, () => cleanups.push("current"));
    assert.equal(intervals.length, 1);
    assert.equal(intervals[0].delay, 600000);
    intervals[0].tick();
    assert.deepEqual(cleanups, ["current"]);
});

test("overlay startup refreshes pending callbacks and retires both of its timers", () => {
    const intervals = new Map();
    const timeouts = new Map();
    let id = 0;
    const host = {
        setInterval: (tick, delay) => (intervals.set(++id, { tick, delay }), id),
        clearInterval: timer => intervals.delete(timer),
        setTimeout: (tick, delay) => (timeouts.set(++id, { tick, delay }), id),
        clearTimeout: timer => timeouts.delete(timer),
    };
    const events = [];
    let ready = false;
    const observe = (owner, getSender) => observeOverlayStartup(host, {
        getSender,
        onWaiting: () => events.push([owner, "waiting"]),
        onAvailable: () => events.push([owner, "available"]),
    });

    observe("initial", () => false);
    observe("current", () => ready);
    assert.equal(intervals.size, 1);
    assert.equal(timeouts.size, 1);
    const [interval] = intervals.values();
    const [timeout] = timeouts.values();
    assert.equal(interval.delay, 100);
    assert.equal(timeout.delay, 5000);
    ready = true;
    interval.tick();
    assert.deepEqual(events, [["initial", "waiting"], ["current", "available"]]);
    assert.equal(intervals.size, 0);
    assert.equal(timeouts.size, 0);

    ready = false;
    observe("new", () => ready);
    timeout.tick();
    interval.tick();
    assert.equal(intervals.size, 1, "an already queued timeout cannot cancel a newer wait");
    const [nextTimeout] = timeouts.values();
    nextTimeout.tick();
    assert.equal(intervals.size, 0);
    assert.equal(timeouts.size, 0);
    assert.deepEqual(events.slice(2), [["new", "waiting"]]);
});

test("startup and page share the current diagnostics hook without resetting user overrides", () => {
    const output = [];
    const window = {};
    const context = vm.createContext({ window, console: { log: (...args) => output.push(args) } });
    vm.runInContext(bundleStartupFixture(`
        import { createRuntimeDebugLogger } from "#ivlyrics/spicetify/runtimeDebug.mjs";
        globalThis.startupLog = createRuntimeDebugLogger(window);
    `), context);
    const page = bundleStartupFixture(`
        import { initializeRuntimeDebug } from "#ivlyrics/spicetify/runtimeDebug.mjs";
        initializeRuntimeDebug(window);
    `);

    assert.equal(context.startupLog("before the route"), false);
    vm.runInContext(page, context);
    const defaultLogger = window.__ivLyricsDebugLog;
    assert.equal(window.__IVLYRICS_DEBUG__, false);
    context.startupLog("disabled");
    assert.deepEqual(output, []);
    window.__IVLYRICS_DEBUG__ = true;
    context.startupLog("enabled", 1);
    vm.runInContext(page, context);
    assert.equal(window.__ivLyricsDebugLog, defaultLogger);
    assert.equal(window.__IVLYRICS_DEBUG__, true);

    const customLog = function (...args) {
        assert.equal(this, window);
        output.push(args);
    };
    window.__ivLyricsDebugLog = customLog;
    window.__IVLYRICS_DEBUG__ = false;
    vm.runInContext(page, context);
    assert.equal(window.__ivLyricsDebugLog, customLog);
    context.startupLog("external logger");
    assert.deepEqual(output, [["enabled", 1], ["external logger"]]);
});

test("independent startup and page bundles share storage, localization, and compatible public APIs", async () => {
    const key = "ivLyrics:visual:language";
    const writes = [];
    const fixturePersistence = {
        getItem(name) {
            assert.equal(name, key);
            return "unsupported-language";
        },
        setItem(name, value) {
            writes.push([name, value]);
        },
    };
    const window = { CONFIG: { visual: { language: "unsupported-language" } } };
    const context = vm.createContext({ window, fixturePersistence, console });
    vm.runInContext(bundleStartupFixture(`
        import { getRuntimeService, publishRuntimeService } from "#ivlyrics/spicetify/runtimeServices.mjs";
        publishRuntimeService("ivLyricsStoragePersistence", fixturePersistence, window);
        globalThis.getStartupI18n = () => getRuntimeService("I18n", window);
    `), context);
    assert.equal(context.getStartupI18n(), undefined);
    window.ivLyricsStoragePersistence = undefined;

    vm.runInContext(readI18nFixture(), context);
    const i18n = context.getStartupI18n();
    assert.equal(i18n, window.I18n);
    assert.equal(i18n.getCurrentLanguage(), "ko");
    assert.equal(window.CONFIG.visual.language, "ko");
    assert.deepEqual(writes, [[key, "ko"]]);
    assert.equal(i18n.getAvailableLanguages().length, 22);
    assert.equal(Object.keys(window).some(name => name.startsWith("LANG_")), false);
    assert.equal(window.t("tabs.general"), "일반");

    assert.equal(await i18n.setLanguage("en"), true);
    assert.equal(window.CONFIG.visual.language, "en");
    assert.equal(window.t("tabs.general"), "General");
    assert.deepEqual(writes, [[key, "ko"], [key, "en"]]);
});

test("lyrics startup reads the live pronunciation notation from the independently bundled page", () => {
    const notationKey = "ivLyrics:visual:translate:pronunciation-notation";
    const window = { CONFIG: { visual: {} } };
    const localStorage = { getItem: (key) => key === notationKey ? "latin" : null };
    const context = vm.createContext({ window, localStorage, CONFIG: window.CONFIG, CacheManager: createPageTranslationMemoryCache() });
    vm.runInContext(bundleStartupFixture(`
        import { createLyricsServicePreferences } from "#ivlyrics/lyrics/lyricsServicePreferences.mjs";
        import { readPronunciationNotation } from "#ivlyrics/lyrics/pronunciationRuntime.mjs";
        import { getRuntimeService } from "#ivlyrics/spicetify/runtimeServices.mjs";
        const preferences = createLyricsServicePreferences({
            readNotation: () => readPronunciationNotation(window),
            getVisualSettings: () => getRuntimeService("CONFIG", window)?.visual,
            getSettingsStorage: () => undefined,
            getStoragePersistence: () => undefined,
            readSpotifySetting: () => null,
            readLocalSetting: (key) => localStorage.getItem(key),
        });
        globalThis.readStartupNotation = preferences.getServicePronunciationNotation;
    `), context);
    assert.equal(context.readStartupNotation(), "latin");

    vm.runInContext(readTranslationRuntimeFixture(), context);
    assert.equal(window.ivLyricsPronunciationNotation.storageKey, notationKey);
    assert.equal(window.ivLyricsPronunciationNotation.getCurrent(), "latin");
    delete window.ivLyricsPronunciationNotation;
    window.CONFIG.visual["translate:pronunciation-notation"] = "ipa";
    assert.equal(context.readStartupNotation(), "ipa");
});
