import assert from "node:assert/strict";
import test from "node:test";
import { createVideoHelperService } from "../src/features/video/VideoHelperService.js";
import { readHelperVideoUrl } from "../src/features/video/helperVideoResponse.mjs";
import { startHelperBackgroundVideo } from "../src/features/video/helperBackgroundVideo.mjs";
import { startPreviewHelperVideoDownload } from "../src/features/video/communityVideoPreview.mjs";

const url = "http://localhost:15123/video/files/fixture.webm";
const makeResponse = chunks => new Response(new ReadableStream({
    start(controller) {
        const encoder = new TextEncoder();
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
    },
}), { headers: { "content-type": "text/event-stream" } });

test("helper stream accepts both field orders, split chunks, keepalives and a final frame without a blank line", async () => {
    const progress = [];
    const response = makeResponse([
        ': keep-alive\r\n\r\nevent: pro',
        'gress\r\ndata: {"status":"downloading","percent":24}\r',
        '\n\r\ndata: {"status":"processing","percent":85}\nevent: progress\n\n',
        'data: {"status":"error","message":"WARNING retried"}\nevent: complete\n\n',
        'event: complete\ndata: {"status":"completed","message":"' + url + '"}',
    ]);
    const result = await readHelperVideoUrl(response, {
        signal: new AbortController().signal,
        onProgress: update => progress.push([update.status, update.percent]),
        readCachedVideo: async () => { assert.fail("the stream already provided the file"); },
    });
    assert.equal(result, url);
    assert.deepEqual(progress, [["downloading", 24], ["processing", 85]]);
    assert.equal(response.body.locked, false);
});

test("a cached file reported without its URL is resolved from the helper status API", async () => {
    const paths = [];
    const helper = createVideoHelperService({ host: {}, request: async value => {
        const path = new URL(value).pathname;
        paths.push(path);
        if (path === "/video/status") return Response.json({ success: true, url });
        return makeResponse(['data: {"status":"alreadyexists","message":"Video already downloaded"}\nevent: complete\n\n']);
    } });
    const result = await new Promise((resolve, reject) => helper.requestVideo("fixture", {
        onComplete: resolve,
        onError: message => reject(new Error(message)),
    }));
    assert.equal(result, url);
    assert.deepEqual(paths, ["/video/request", "/video/status"]);
});

test("a stream that closes without a terminal download result reports an error", async () => {
    const response = makeResponse(['event: progress\ndata: {"status":"downloading","percent":42}\n\n']);
    await assert.rejects(readHelperVideoUrl(response, { signal: new AbortController().signal }), /ended without a playable file/);
    assert.equal(response.body.locked, false);
});

test("abort unlocks an open progress stream and suppresses subsequent callbacks", async () => {
    let started;
    let cancelled;
    const waiting = new Promise(resolve => { started = resolve; });
    const streamCancelled = new Promise(resolve => { cancelled = resolve; });
    const stream = new ReadableStream({
        pull() { started(); },
        cancel() { cancelled(); },
    }, { highWaterMark: 0 });
    const helper = createVideoHelperService({ host: {}, request: async () =>
        new Response(stream, { headers: { "content-type": "text/event-stream" } }) });
    const abort = helper.requestVideo("fixture", {
        onComplete: () => assert.fail("aborted request resolved"),
        onError: () => assert.fail("aborted request reported an error"),
    });
    await waiting;
    abort();
    await streamCancelled;
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(stream.locked, false);
});

test("background prefetch and playback share one download while keeping independent callbacks", async () => {
    const firstProgress = Promise.withResolvers();
    const secondProgress = Promise.withResolvers();
    const completed = Promise.withResolvers();
    const encoder = new TextEncoder();
    const calls = [];
    const signals = [];
    let source;
    const stream = new ReadableStream({
        start(controller) { source = controller; },
        cancel() { return new Promise(() => {}); },
    });
    const helper = createVideoHelperService({ host: {}, request: async (_, { signal }) => {
        signals.push(signal);
        return new Response(stream, { headers: { "content-type": "text/event-stream" } });
    } });
    const abortPrefetch = helper.requestVideo("fixture", {
        onProgress(progress) { calls.push(["prefetch", progress.percent]); firstProgress.resolve(); },
        onComplete: () => calls.push(["unexpected prefetch completion"]),
        onError: () => calls.push(["unexpected prefetch error"]),
    });
    source.enqueue(encoder.encode('event: progress\ndata: {"status":"downloading","percent":24}\n\n'));
    await firstProgress.promise;

    helper.requestVideo("fixture", {
        onProgress(progress) { calls.push(["playback", progress.percent]); secondProgress.resolve(); },
        onComplete: completed.resolve, onError: completed.reject,
    });
    await secondProgress.promise;
    abortPrefetch();
    assert.equal(signals.length, 1);
    assert.equal(signals[0].aborted, false);

    source.enqueue(encoder.encode('event: complete\ndata: ' + JSON.stringify({ status: "completed", url }) + '\n\n'));
    assert.equal(await completed.promise, url);
    assert.equal(stream.locked, false, "the body is released without awaiting a server-side acknowledgement");
    assert.deepEqual(calls, [["prefetch", 24], ["playback", 24]]);
});

test("cancelling the last observer aborts only its download and permits a new request", async () => {
    const responses = [Promise.withResolvers(), Promise.withResolvers()];
    const signals = [];
    let staleCallbacks = 0;
    const helper = createVideoHelperService({ host: {}, request: (_, { signal }) => {
        signals.push(signal);
        return responses[signals.length - 1].promise;
    } });
    const cancelled = {
        onProgress: () => staleCallbacks++,
        onComplete: () => staleCallbacks++,
        onError: () => staleCallbacks++,
    };
    const left = helper.requestVideo("same", cancelled);
    const right = helper.requestVideo("same", cancelled);
    left();
    assert.equal(signals[0].aborted, false);
    right();
    assert.equal(signals[0].aborted, true);
    const completed = Promise.withResolvers();
    helper.requestVideo("same", { onComplete: completed.resolve, onError: completed.reject });
    responses[0].resolve(Response.json({ success: true, url: url + "?old" }));
    responses[1].resolve(Response.json({ success: true, url }));
    assert.equal(await completed.promise, url);
    assert.equal(signals.length, 2);
    assert.equal(signals[1].aborted, false);
    assert.equal(staleCallbacks, 0);
});

test("concurrent helper checks share one promise through the end of the response body", async () => {
    let calls = 0;
    let finish;
    const body = new Promise(resolve => { finish = resolve; });
    const helper = createVideoHelperService({ host: {}, request: async (_, options) => {
        calls++;
        assert.ok(options.signal);
        return { ok: true, text: () => body };
    } });
    const first = helper.checkHealth();
    assert.strictEqual(helper.isHelperAvailable(), first);
    assert.strictEqual(helper.checkHealth(), first);
    assert.equal(calls, 1);
    finish("OK");
    assert.equal(await first, true);
    assert.equal(await helper.isHelperAvailable(), true);
    assert.equal(calls, 1);
});

test("an expired helper player releases its source and ignores a late canplay event", () => {
    const listeners = new Map();
    const states = [];
    let startAttempts = 0;
    let errors = 0;
    let timeout;
    const video = {
        paused: true, currentTime: 0, duration: 30,
        addEventListener: (name, callback) => listeners.set(name, callback),
        removeEventListener: name => listeners.delete(name),
        removeAttribute(name) { if (name === "src") this.src = ""; },
        pause() { this.paused = true; },
        async play() { this.paused = false; startAttempts++; },
        load() {},
    };
    const stop = startHelperBackgroundVideo({
        video, url, readFrame: () => ({ syncState: null, isPlaying: true }),
        setIsPlayerReady: value => states.push(value),
        reportVideoBackgroundStatus() {},
        showError: () => { errors++; },
        debug() {},
        schedule(callback) { timeout = callback; return 1; },
        cancel() {},
    });
    const oldCanPlay = listeners.get("canplay");
    timeout();
    oldCanPlay();
    stop();
    assert.equal(errors, 1);
    assert.equal(startAttempts, 0);
    assert.equal(video.src, "");
    assert.equal(listeners.size, 0);
    assert.deepEqual(states, [false]);
});

test("a buffered helper video initializes when the matching playback frame arrives without another canplay", () => {
    const video = new EventTarget();
    const timers = new Map();
    const ready = [];
    const statuses = [];
    let frame = null;
    let playAttempts = 0;
    let nextTimer = 0;
    Object.assign(video, {
        paused: true, currentTime: 0, duration: 30,
        removeAttribute(name) { if (name === "src") this.src = ""; },
        pause() { this.paused = true; },
        async play() { this.paused = false; playAttempts++; },
        load() {},
    });
    const stop = startHelperBackgroundVideo({
        video, url, readFrame: () => frame,
        setIsPlayerReady: value => ready.push(value),
        reportVideoBackgroundStatus: value => statuses.push(value),
        showError: () => assert.fail("ready video reported an error"),
        debug() {},
        schedule(callback, delay) {
            const id = nextTimer++;
            timers.set(id, { callback, delay });
            return id;
        },
        cancel: id => timers.delete(id),
    });
    video.dispatchEvent(new Event("canplay"));
    video.dispatchEvent(new Event("canplay"));
    assert.equal(video.currentTime, 0);
    assert.deepEqual(ready, []);
    const retries = [...timers].filter(([, timer]) => timer.delay < 15000);
    assert.equal(retries.length, 1);

    frame = { syncState: { targetVideoTime: 9.25, shouldHoldAtStart: false }, isPlaying: true };
    const [id, { callback }] = retries[0];
    timers.delete(id);
    callback();
    video.dispatchEvent(new Event("canplay"));
    assert.equal(video.currentTime, 9.25);
    assert.equal(playAttempts, 1);
    assert.deepEqual(ready, [true]);
    assert.deepEqual(statuses, ["complete"]);
    assert.equal(timers.size, 0);
    stop();
});

test("a helper video defers its deadline and playback-frame retry while Spotify is hidden", () => {
    const document = Object.assign(new EventTarget(), { hidden: true });
    const video = Object.assign(new EventTarget(), {
        duration: 30, currentTime: 0, paused: true,
        load() {}, pause() {}, removeAttribute() {},
    });
    const timers = new Map();
    const states = [];
    let nextTimer = 0;
    let time = 0;
    let frame;
    const setHidden = hidden => {
        document.hidden = hidden;
        document.dispatchEvent(new Event("visibilitychange"));
    };
    const stop = startHelperBackgroundVideo({
        video, url, document, readFrame: () => frame,
        setIsPlayerReady: value => states.push(value),
        reportVideoBackgroundStatus() {},
        showError: () => assert.fail("hidden window consumed its video deadline"),
        debug() {}, now: () => time,
        schedule(callback, delay) {
            const id = nextTimer++;
            timers.set(id, { callback, delay });
            return id;
        },
        cancel: id => timers.delete(id),
    });
    assert.equal(timers.size, 0);
    video.dispatchEvent(new Event("canplay"));
    assert.equal(timers.size, 0);

    setHidden(false);
    const expiredDeadline = [...timers.values()].find(timer => timer.delay === 15000);
    assert.ok(expiredDeadline);
    time += 5000;
    setHidden(true);
    expiredDeadline.callback();
    assert.deepEqual(states, []);
    time += 60000;

    // The retry scheduled before hiding waits for the new track's frame.
    for (const [id, timer] of timers) {
        timers.delete(id);
        timer.callback();
    }
    assert.equal(timers.size, 0);
    setHidden(false);
    assert.ok([...timers.values()].some(timer => timer.delay === 10000));
    frame = { syncState: { targetVideoTime: 4 }, isPlaying: false };
    const [id, retry] = [...timers].find(([, timer]) => timer.delay === 250);
    timers.delete(id);
    retry.callback();
    assert.deepEqual(states, [true]);
    assert.equal(video.currentTime, 4);
    assert.equal(timers.size, 0);
    stop();
    setHidden(true);
    setHidden(false);
    assert.equal(timers.size, 0);
});

test("closing a video preview while health is pending releases the timer and never starts a download", async () => {
    let resolveHealth;
    let timer;
    let cleared = false;
    let requests = 0;
    const health = new Promise(resolve => { resolveHealth = resolve; });
    const stop = startPreviewHelperVideoDownload({
        videoId: "closed", translate: key => key,
        toast: {
            progress() { assert.fail("stale progress toast"); },
            dismissProgress() { assert.fail("unowned toast dismissed"); },
        },
        videoHelper: {
            isHelperAvailable: () => health,
            requestVideo() { requests++; },
        },
        onReady() { assert.fail("closed preview published a file"); },
        schedule(callback) { timer = callback; return 1; },
        cancel() { cleared = true; },
    });
    stop();
    assert.equal(cleared, true);
    timer();
    resolveHealth(true);
    await health;
    assert.equal(requests, 0);
});
