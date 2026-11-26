import assert from "node:assert/strict";
import test from "node:test";
import { createNextTrackPrefetch } from "../src/lyrics/nextTrackPrefetch.mjs";
import { createLyricPrefetcher } from "../src/lyrics/createLyricPrefetcher.mjs";
import { createLyricsProviderRequests } from "../src/lyrics/lyricsProviderRequests.mjs";
import { createVideoDownloadPrefetcher } from "../src/features/video/createVideoPrefetcher.mjs";

const deferred = () => {
    let resolve;
    const promise = new Promise((done) => { resolve = done; });
    return { promise, resolve };
};

function createTimers() {
    const timers = new Map();
    return {
        timers,
        scheduleTimer(callback, delay) {
            const id = Symbol();
            timers.set(id, { callback, delay });
            return id;
        },
        cancelTimer(id) { timers.delete(id); },
        run() {
            const [id, { callback }] = timers.entries().next().value;
            timers.delete(id);
            return callback();
        },
    };
}

test("a queue update replaces the debounce and starts video alongside lyric loading", async () => {
    const fakeTimers = createTimers();
    const pendingLyrics = deferred();
    const calls = [];
    const visual = { "video-background": true };
    const nextTrack = { uri: "spotify:track:next", title: "Next" };
    const { createSession } = createNextTrackPrefetch({
        ...fakeTimers,
        cache: new Map(),
        readVisual: () => visual,
        wordMode: 3,
        lyrics: {
            loadLyrics: (track) => { calls.push(["lyrics", track]); return pendingLyrics.promise; },
            async loadTranslations(track, lyrics) { calls.push(["translation", track, lyrics]); },
            async loadWordSupplements(track, lyrics) { calls.push(["words", track, lyrics]); },
        },
        async loadVideo(uri, track) { calls.push(["video", uri, track]); },
        debug() {},
    });
    const session = createSession(() => 3);
    session.schedule({ uri: "spotify:track:obsolete" });
    session.schedule(nextTrack);
    assert.equal(fakeTimers.timers.size, 1);
    assert.equal(fakeTimers.timers.values().next().value.delay, 1500);
    const running = fakeTimers.run();
    assert.deepEqual(calls, [["video", nextTrack.uri, nextTrack], ["lyrics", nextTrack]]);
    const lyrics = { karaoke: [{ text: "A line" }] };
    pendingLyrics.resolve(lyrics);
    await running;
    assert.deepEqual(calls.slice(2), [["translation", nextTrack, lyrics], ["words", nextTrack, lyrics]]);
    session.schedule(nextTrack);
    assert.equal(fakeTimers.timers.size, 0);
});

test("a failed video lookup leaves the independently loaded lyrics available for translation", async () => {
    const fakeTimers = createTimers();
    const pendingLyrics = deferred();
    const calls = [];
    const { createSession } = createNextTrackPrefetch({
        ...fakeTimers,
        cache: new Map(),
        readVisual: () => ({ "video-background": true }),
        wordMode: 3,
        lyrics: {
            loadLyrics: () => pendingLyrics.promise,
            async loadTranslations() { calls.push("translation"); },
        },
        async loadVideo() { throw new Error("No ISRC response"); },
        debug() {},
        warn: (message) => calls.push(message),
    });
    createSession().schedule({ uri: "spotify:track:next" });
    const running = fakeTimers.run();
    await Promise.resolve();
    assert.deepEqual(calls, ["[Prefetcher] Video prefetch failed:"]);
    pendingLyrics.resolve({ synced: [{ text: "A line" }] });
    await running;
    assert.deepEqual(calls, ["[Prefetcher] Video prefetch failed:", "translation"]);
});

test("word details preload independently of the translation preload toggle", async () => {
    const timers = createTimers();
    const calls = [];
    const visual = { "prefetch-enabled": false, "prefetch-word-details-enabled": true, "karaoke-mode-enabled": true };
    const { createSession } = createNextTrackPrefetch({
        ...timers, readVisual: () => visual, wordMode: 3,
        lyrics: {
            async loadLyrics() { return { karaoke: [{ text: "A line" }] }; },
            async loadTranslations() { calls.push("translation"); },
            async loadWordSupplements() { calls.push("word details"); },
        },
        debug() {},
    });
    const session = createSession(() => 3);
    session.schedule({ uri: "spotify:track:next" });
    await timers.run();
    assert.deepEqual(calls, ["word details"]);
});

test("changing or clearing the queue prevents stale work without retaining a previous page", async () => {
    const fakeTimers = createTimers();
    const pending = deferred();
    const loads = [];
    const supplements = [];
    const { createSession } = createNextTrackPrefetch({
        ...fakeTimers,
        cache: new Map(),
        readVisual: () => ({}),
        wordMode: 3,
        lyrics: {
            loadLyrics: ({ uri }) => { loads.push(uri); return pending.promise; },
            async loadTranslations(track) { supplements.push(["translation", track.uri]); },
            async loadWordSupplements(track) { supplements.push(["words", track.uri]); },
        },
        debug() {},
    });
    const first = createSession(() => assert.fail("a closed page's mode must never be read"));
    first.schedule({ uri: "spotify:track:first" });
    const running = fakeTimers.run();
    first.schedule({ uri: "spotify:track:replaced" });
    const lateTimer = fakeTimers.timers.values().next().value.callback;
    first.schedule(null);
    assert.equal(fakeTimers.timers.size, 0);
    await lateTimer();
    first.schedule({ uri: "spotify:track:closed" });
    first.dispose();
    assert.equal(fakeTimers.timers.size, 0);
    first.schedule({ uri: "spotify:track:after-close" });
    assert.equal(fakeTimers.timers.size, 0);

    const second = createSession(() => 3);
    second.schedule({ uri: "spotify:track:second" });
    const fresh = fakeTimers.run();
    pending.resolve({ karaoke: [{ text: "A line" }] });
    await Promise.all([running, fresh]);
    assert.deepEqual(loads, ["spotify:track:first", "spotify:track:second"]);
    assert.deepEqual(supplements, [
        ["translation", "spotify:track:second"], ["words", "spotify:track:second"],
    ]);
});

test("queue video work survives promotion and is released on replacement or page close", async () => {
    const fakeTimers = createTimers();
    const signals = new Map();
    const { createSession } = createNextTrackPrefetch({
        ...fakeTimers, cache: new Map(), readVisual: () => ({ "video-background": true }),
        lyrics: { async loadLyrics() {} },
        async loadVideo(uri, _track, { signal }) { signals.set(uri, signal); },
        debug() {},
    });
    const session = createSession();
    const abandoned = { uri: "spotify:track:abandoned" };
    const promoted = { uri: "spotify:track:promoted" };
    const next = { uri: "spotify:track:next" };
    session.schedule(abandoned);
    await fakeTimers.run();
    session.schedule(promoted);
    assert.equal(signals.get(abandoned.uri)?.aborted, true);
    await fakeTimers.run();
    session.updatePlayingTrack(promoted.uri);
    session.schedule(next);
    assert.equal(signals.get(promoted.uri)?.aborted, false);
    await fakeTimers.run();
    session.updatePlayingTrack("spotify:track:playing");
    assert.equal(signals.get(promoted.uri).aborted, true);
    assert.equal(signals.get(next.uri)?.aborted, false);
    session.updatePlayingTrack(next.uri);
    session.schedule(null);
    assert.equal(signals.get(next.uri).aborted, false);
    session.dispose();
    assert.equal(signals.get(next.uri).aborted, true);
});

test("an abandoned queued lookup retires immediately and cannot cache a late response", async () => {
    const fakeTimers = createTimers();
    const sourceCache = {};
    const snapshots = new Map();
    const calls = [];
    const manager = {
        getLyrics(info, _provider, { signal, isCurrent }) {
            const gate = deferred();
            calls.push({ info, signal, isCurrent, gate });
            return gate.promise;
        },
    };
    const providerRequests = createLyricsProviderRequests(() => manager);
    const service = {
        getLyricsRequestRevision: providerRequests.getRevision,
        getLyricsFromProviders(info, _order, _mode, forcedProviderId, { signal } = {}) {
            return providerRequests.request({
                info, forcedProviderId, signal,
                getSnapshot: uri => snapshots.get(uri),
                publishSnapshot: value => snapshots.set(info.uri, value),
            });
        },
    };
    const lyrics = createLyricPrefetcher({ sourceCache, getService: () => service, debug() {} });
    const videos = [];
    const prefetch = createNextTrackPrefetch({
        ...fakeTimers, lyrics, readVisual: () => ({ "video-background": true, "prefetch-enabled": false }),
        async loadVideo(uri, _info, interest) { videos.push({ uri, ...interest }); }, debug() {},
    });
    const session = prefetch.createSession();
    const a = { uri: "spotify:track:a" };
    const b = { uri: "spotify:track:b" };
    const result = text => ({ provider: "lyrics", synced: [{ text }] });
    const flush = () => new Promise(setImmediate);

    session.schedule(a);
    const abandoned = fakeTimers.run();
    await flush();
    session.schedule(b);
    assert.equal(calls[0].signal.aborted, true);
    assert.equal(calls[0].isCurrent(), false);
    assert.equal(videos[0].signal.aborted, true);
    await abandoned;

    const promoted = fakeTimers.run();
    await flush();
    session.updatePlayingTrack(b.uri);
    const foreground = service.getLyricsFromProviders(b);
    session.schedule(a);
    assert.equal(calls[1].signal.aborted, false);
    assert.equal(videos[1].wanted(), true);
    assert.equal(calls.length, 2, "foreground joins the in-progress lookup");
    calls[1].gate.resolve(result("Playing"));
    await Promise.all([promoted, foreground]);
    assert.equal(sourceCache[b.uri].synced[0].text, "Playing");
    session.updatePlayingTrack(null);
    assert.equal(videos[1].signal.aborted, true);

    const retry = fakeTimers.run();
    await flush();
    calls[0].gate.resolve(result("Obsolete"));
    await flush();
    assert.equal(snapshots.has(a.uri), false);
    assert.equal(sourceCache[a.uri], undefined);
    calls[2].gate.resolve(result("Fresh"));
    await retry;
    assert.equal(sourceCache[a.uri].synced[0].text, "Fresh");
    session.dispose();
});

test("helper downloads reserve the request before checking availability and cancel finished timers", async () => {
    const fakeTimers = createTimers();
    const available = deferred();
    const cache = new Map();
    const requests = new Map();
    const downloads = [];
    let checkCount = 0;
    let aborted = 0;
    const helper = {
        isHelperAvailable() { checkCount++; return available.promise; },
        requestVideo(_id, callbacks) {
            downloads.push(callbacks);
            return () => { aborted++; };
        },
    };
    const download = createVideoDownloadPrefetcher({
        ...fakeTimers, cache, requests,
        readVisual: () => ({ "video-helper-enabled": true }),
        getService: () => helper,
        debug() {},
        warn() {},
    });

    const first = download("same-video");
    await download("same-video");
    assert.equal(checkCount, 1);
    available.resolve(true);
    await first;
    assert.equal(downloads.length, 1);
    const firstTimeout = fakeTimers.timers.values().next().value.callback;
    downloads[0].onError("network");
    assert.equal(fakeTimers.timers.size, 0);

    await download("same-video");
    assert.equal(downloads.length, 2);
    firstTimeout();
    downloads[0].onComplete("obsolete");
    assert.equal(aborted, 0);
    assert.equal(cache.size, 0);
    downloads[1].onComplete("fresh");
    assert.equal(cache.get("prefetch:helper:same-video").url, "fresh");
    assert.equal(requests.size, 0);
    assert.equal(fakeTimers.timers.size, 0);
});

test("leaving the queue while checking helper availability does not start a video download", async () => {
    const available = deferred();
    const requests = new Map();
    let queued = true;
    const prefetch = createVideoDownloadPrefetcher({
        ...createTimers(), cache: new Map(), requests,
        readVisual: () => ({ "video-helper-enabled": true }),
        getService: () => ({
            isHelperAvailable: () => available.promise,
            requestVideo: () => assert.fail("the next track changed during the availability check"),
        }),
        debug() {},
    });
    const result = prefetch("obsolete-video", { wanted: () => queued });
    assert.equal(requests.size, 1);
    queued = false;
    available.resolve(true);
    await result;
    assert.equal(requests.size, 0);
});

test("turning off the video helper while checking availability skips the download", async () => {
    const available = deferred();
    const visual = { "video-helper-enabled": true };
    const requests = new Map();
    const prefetch = createVideoDownloadPrefetcher({
        ...createTimers(), cache: new Map(), requests, readVisual: () => visual,
        getService: () => ({
            isHelperAvailable: () => available.promise,
            requestVideo: () => assert.fail("a disabled helper must not start a download"),
        }),
        debug() {}, warn: (_message, error) => assert.fail(error),
    });
    const pending = prefetch("queued-video");
    visual["video-helper-enabled"] = false;
    available.resolve(true);
    await pending;
    assert.equal(requests.size, 0);
});

test("abandoning the last queue interest cancels the active helper subscription", async () => {
    const first = new AbortController();
    const second = new AbortController();
    const timers = createTimers();
    const cache = new Map();
    let callbacks;
    let aborted = 0;
    const prefetch = createVideoDownloadPrefetcher({
        ...timers, cache, requests: new Map(), readVisual: () => ({ "video-helper-enabled": true }),
        getService: () => ({
            async isHelperAvailable() { return true; },
            requestVideo(_id, handler) {
                callbacks = handler;
                return () => { aborted++; };
            },
        }),
        debug() {},
    });
    await prefetch("video", { signal: first.signal });
    await prefetch("video", { signal: second.signal });
    first.abort();
    assert.equal(aborted, 0);
    second.abort();
    assert.equal(aborted, 1);
    assert.equal(timers.timers.size, 0);
    callbacks.onComplete("late-url");
    assert.equal(cache.size, 0);
});
