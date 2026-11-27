import { bundleInitializer } from "./fixtures/initializer-bundle.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";

// The lyrics manager retires a lookup when the track changes (or provider
// settings change) and aborts the signal it passed to getLyrics(info, { signal }).
// A retired result is always discarded, so a provider that keeps fetching only
// wastes requests. These tests pin that lrc.red, Unison and LyricsPlus stop
// their request chains on that signal, and behave exactly as before without one.

const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

function deferred() {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}

// fetch stub: records every request and lets the test settle it. An aborted
// signal rejects like the browser does, before or during the request.
function createFetch() {
    const calls = [];
    const fetch = (input, options = {}) => {
        const call = { url: new URL(String(input)), signal: options.signal, ...deferred() };
        calls.push(call);
        const abortError = () => Object.assign(new Error("The operation was aborted."), { name: "AbortError" });
        if (call.signal?.aborted) call.reject(abortError());
        else call.signal?.addEventListener("abort", () => call.reject(abortError()), { once: true });
        return call.promise;
    };
    return { calls, fetch };
}

const json = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });

function loadLrcRed() {
    const source = bundleInitializer(new URL("../src/providers/lyrics/Addon_Lyrics_LrcRed.js", import.meta.url));
    let addon;
    const warnings = [];
    const { calls, fetch } = createFetch();
    const window = {
        LyricsAddonManager: { register(value) { addon = value; }, getAddonSetting: () => false },
        LyricsService: { extractTrackId: uri => /^spotify:track:([A-Za-z0-9]{22})$/.exec(uri || "")?.[1] || "" },
        SyncDataService: { resolveTrackIsrc: async () => "JPAAA2600002" },
        ivLyricsLyricsParser: {
            parseTtmlLyrics: () => ({ karaoke: [], synced: [{ startTime: 1000, text: "Fixture lyric" }] }),
            parseLrcLyrics: () => ({ karaoke: [], synced: [{ startTime: 1000, text: "Fixture lyric" }] }),
        },
    };
    const context = vm.createContext({
        window, fetch, AbortController, setTimeout, clearTimeout,
        Spicetify: { Player: { data: { item: null } } },
        console: { warn: (...args) => warnings.push(args) },
    });
    vm.runInContext(source, context, { filename: "Addon_Lyrics_LrcRed.js" });
    return { addon, calls, warnings };
}

const lrcRedTrack = {
    uri: "spotify:track:BBBBBBBBBBBBBBBBBBBBBB", title: "Requested Song", artist: "Fixture Artist", durationMs: 200000,
};

test("lrc.red declares abort support so the manager passes its lookup signal", () => {
    assert.equal(loadLrcRed().addon.supportsAbortSignal, true);
});

test("lrc.red aborts the request in flight and starts no further request once retired", async () => {
    const h = loadLrcRed();
    const controller = new AbortController();
    const pending = h.addon.getLyrics(lrcRedTrack, { signal: controller.signal });
    await flush();
    assert.equal(h.calls.length, 1, "the ISRC lookup is the first request");
    assert.match(h.calls[0].url.pathname, /\.json$/);
    controller.abort();
    await flush();
    assert.equal(h.calls[0].signal.aborted, true, "the request in flight is aborted");
    const result = await pending;
    // Without abort support the four search fallbacks, TTML and LRC requests
    // would follow; the retired lookup issues none of them.
    assert.equal(h.calls.length, 1);
    assert.ok(result.error);
    assert.deepEqual(h.warnings, []);
});

test("lrc.red keeps its complete lookup chain without a signal", async () => {
    const h = loadLrcRed();
    const pending = h.addon.getLyrics(lrcRedTrack);
    await flush();
    h.calls[0].resolve(json({ isrc: "JPAAA2600002", title: lrcRedTrack.title, artist: lrcRedTrack.artist, duration: 200 }));
    await flush();
    assert.equal(h.calls.length, 2);
    assert.match(h.calls[1].url.pathname, /\.ttml$/);
    assert.equal(h.calls[1].signal.aborted, false);
    h.calls[1].resolve({ ok: true, status: 200, text: async () => "<fixture/>" });
    const result = await pending;
    assert.equal(result.error, null);
    assert.equal(result.lrcred.isrc, "JPAAA2600002");
    assert.equal(result.synced.length, 1);
});

function loadUnison() {
    const source = bundleInitializer(new URL("../src/providers/lyrics/Addon_Lyrics_Unison.js", import.meta.url));
    const warnings = [];
    const { calls, fetch } = createFetch();
    const window = { LyricsAddonManager: { register() {} } };
    const context = vm.createContext({
        window, fetch, URL, AbortController, setTimeout, clearTimeout,
        console: { warn: (...args) => warnings.push(args) },
    });
    vm.runInContext(source, context, { filename: "Addon_Lyrics_Unison.js" });
    return { addon: window.UnisonLyricsAddon, calls, warnings };
}

// Album and featured-artist variants produce a ladder of up to six requests.
const unisonTrack = {
    uri: "spotify:track:fixture", title: "Fixture", artist: "Lead feat. Guest", album: "Album", duration: 120000,
};

test("Unison declares abort support and stops its request ladder once retired", async () => {
    const h = loadUnison();
    assert.equal(h.addon.supportsAbortSignal, true);
    const controller = new AbortController();
    const pending = h.addon.getLyrics(unisonTrack, { signal: controller.signal });
    await flush();
    assert.equal(h.calls.length, 1);
    controller.abort();
    const result = await pending;
    assert.equal(h.calls[0].signal.aborted, true, "the request in flight is aborted");
    assert.equal(h.calls.length, 1, "no further ladder request starts");
    assert.equal(result.error, "Request timed out");
    assert.deepEqual(h.warnings, [], "an expected cancellation is not reported as a failure");
});

test("Unison walks the same request ladder without a signal", async () => {
    const h = loadUnison();
    const pending = h.addon.getLyrics(unisonTrack);
    for (let index = 0; index < 6; index++) {
        await flush();
        assert.equal(h.calls.length, index + 1);
        h.calls[index].resolve(json({ success: false }, 404));
    }
    const result = await pending;
    assert.equal(h.calls.length, 6);
    assert.equal(result.error, "No lyrics");
});

function loadLyricsPlus() {
    const source = bundleInitializer(new URL("../src/providers/lyrics/Addon_Lyrics_LyricsPlus.js", import.meta.url));
    const warnings = [];
    const timers = new Map();
    let nextTimer = 0;
    const { calls, fetch } = createFetch();
    const window = { LyricsAddonManager: { register() {} } };
    const context = vm.createContext({
        window, fetch, URL, Map, AbortController,
        atob: value => Buffer.from(value, "base64").toString("utf8"),
        console: { warn: (...args) => warnings.push(args), log() {} },
        setTimeout(callback, delay) { const id = ++nextTimer; timers.set(id, { callback, delay }); return id; },
        clearTimeout(id) { timers.delete(id); },
    });
    vm.runInContext(source, context, { filename: "Addon_Lyrics_LyricsPlus.js" });
    return { addon: window.LyricsPlusLyricsAddon, calls, warnings, timers };
}

const lyricsPlusTrack = { uri: "spotify:track:fixture", title: "Fixture", artist: "Artist", duration: 120000 };

test("LyricsPlus declares abort support and aborts its mirrors once retired", async () => {
    const h = loadLyricsPlus();
    assert.equal(h.addon.supportsAbortSignal, true);
    const controller = new AbortController();
    const pending = h.addon.getLyrics(lyricsPlusTrack, { signal: controller.signal });
    await flush();
    assert.equal(h.calls.length, 1, "the preferred mirror starts first");
    controller.abort();
    const result = await pending;
    assert.equal(h.calls[0].signal.aborted, true, "the mirror request is aborted");
    assert.equal(h.calls.length, 1, "the fallback mirror never starts");
    assert.equal(h.timers.size, 0, "the shared budget and fallback timers are cleared");
    assert.equal(result.error, "Request timed out");
    assert.deepEqual(h.warnings, [], "an expected cancellation is not reported as a failure");
});

test("LyricsPlus starts no mirror request for an already retired lookup", async () => {
    const h = loadLyricsPlus();
    const controller = new AbortController();
    controller.abort();
    const result = await h.addon.getLyrics(lyricsPlusTrack, { signal: controller.signal });
    assert.equal(h.calls.length, 0);
    assert.equal(result.error, "Request timed out");
    assert.deepEqual(h.warnings, []);
});

test("LyricsPlus keeps its mirror timing without a signal", async () => {
    const h = loadLyricsPlus();
    const pending = h.addon.getLyrics(lyricsPlusTrack);
    await flush();
    assert.equal(h.calls.length, 1);
    assert.deepEqual([...h.timers.values()].map(timer => timer.delay).sort((a, b) => a - b), [750, 10000]);
    h.calls[0].resolve(json({ type: "Line", lyrics: [{ time: 0, duration: 1000, text: "primary" }] }));
    const result = await pending;
    assert.equal(result.error, null);
    assert.equal(result.lyricsPlus.mirror, 1);
    assert.equal(h.calls[0].signal.aborted, false);
});

