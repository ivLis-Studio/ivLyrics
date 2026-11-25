import { createYouTubeBackgroundTimeline } from "../src/features/video/youTubeBackgroundTimeline.mjs";
import { isYouTubeBackgroundAdPlaying } from "../src/features/video/youTubeBackgroundRuntime.mjs";
import { bundleInitializer } from "./fixtures/initializer-bundle.mjs";
import { sourceNames, sourceUrl } from "./fixtures/source-paths.mjs";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = bundleInitializer(new URL("../src/features/video/VideoBackgroundDepend.js", import.meta.url));

function createEnvironment({ delayedMethods = false, preExisting = false, apiUnavailable = false, startupUnavailable = false } = {}) {
    let nextTimer = 0;
    const timeouts = new Map();
    const intervals = new Map();
    const players = [];
    const fetches = [];
    const observers = [];
    const xhrCalls = [];
    class Style {
        values = new Map();
        getPropertyValue(name) { return this.values.get(name)?.value || ""; }
        getPropertyPriority(name) { return this.values.get(name)?.priority || ""; }
        setProperty(name, value, priority = "") { this.values.set(name, { value, priority }); }
        removeProperty(name) { this.values.delete(name); }
    }
    class Element {
        tagName = "IFRAME";
        attributes = new Map();
        style = new Style();
        getAttribute(name) { return this.attributes.get(name) ?? null; }
        setAttribute(name, value) { this.attributes.set(name, value); }
    }
    class Document {
        body = { contains: (iframe) => iframe.connected !== false };
        createElement() { return new Element(); }
        querySelectorAll() { return []; }
    }
    class Frame extends Element {
        get src() { return this.getAttribute("src"); }
        set src(value) { this.setAttribute("src", value); }
    }
    class ScriptElement extends Element {
        get src() { return this.getAttribute("src"); }
        set src(value) { this.setAttribute("src", value); }
    }
    class XHR extends EventTarget {
        open(...args) { xhrCalls.push(["open", ...args]); }
        send(...args) { xhrCalls.push(["send", ...args]); }
    }
    class ServiceWorkerContainer {
        register(...args) { return Promise.resolve(args); }
    }
    class MutationObserver {
        constructor(callback) { this.callback = callback; observers.push(this); }
        observe() { this.connected = true; }
        disconnect() { this.connected = false; }
    }
    function Player(element, config) {
        this.config = config;
        this.iframe = new Element();
        this.events = new Map();
        this.calls = [];
        this.muted = false;
        this.volume = 100;
        this.state = 1;
        this.time = 10;
        this.duration = 216;
        this.getIframe = () => this.iframe;
        this.addEventListener = (name, callback) => {
            if (!this.events.has(name)) this.events.set(name, new Set());
            this.events.get(name).add(callback);
        };
        this.removeEventListener = (name, callback) => this.events.get(name)?.delete(callback);
        this.destroy = () => { this.calls.push(["destroy"]); this.iframe.connected = false; };
        this.installMethods = () => {
            this.getPlayerState = () => this.state;
            this.getCurrentTime = () => this.time;
            this.getDuration = () => this.duration;
            this.getPlaybackRate = () => 1;
            this.isMuted = () => this.muted;
            this.getVolume = () => this.volume;
            for (const name of ["seekTo", "playVideo", "pauseVideo", "loadVideoById", "cueVideoById", "loadVideoByUrl", "cueVideoByUrl", "removeCueRange", "loadPlaylist", "cuePlaylist", "nextVideo", "setPlaybackRate", "mute", "unMute", "setVolume"]) {
                this[name] = (...args) => {
                    this.calls.push([name, ...args]);
                    if (name === "seekTo") this.time = args[0];
                    if (name === "mute") this.muted = true;
                    if (name === "unMute") this.muted = false;
                    if (name === "setVolume") this.volume = args[0];
                };
            }
        };
        if (!delayedMethods) this.installMethods();
        this.emit = (name, data) => {
            const event = { target: this, data };
            this.config.events?.[name]?.call(this, event);
            this.events.get(name)?.forEach(callback => callback(event));
        };
        players.push(this);
    }
    const window = {
        Spicetify: startupUnavailable ? {} : { Player: {} },
        location: { origin: "https://xpui.app.spotify.com" },
        YT: { Player, PlayerState: { PLAYING: 1, CUED: 5 }, get: id => players.find(p => p.iframe.id === id) },
        fetch: async (...args) => { fetches.push(args); return new Response("content"); },
        Document, Event, Response, DOMException, URL, MutationObserver,
        Node: { ELEMENT_NODE: 1 }, XMLHttpRequest: XHR, HTMLScriptElement: ScriptElement, HTMLIFrameElement: Frame,
        navigator: { language: "ko", serviceWorker: new ServiceWorkerContainer() },
        setTimeout(callback, delay) { const id = ++nextTimer; timeouts.set(id, { callback, delay }); return id; },
        clearTimeout: id => timeouts.delete(id),
    };
    const document = new Document();
    if (preExisting) {
        const existing = new Player(null, {});
        existing.iframe.id = "existing-player";
        existing.iframe.setAttribute("src", "https://www.youtube-nocookie.com/embed/abcdefghijk");
        document.querySelectorAll = () => [existing.iframe];
    }
    const context = vm.createContext({
        window, Spicetify: window.Spicetify, document, URL, Response, Event,
        console: { info() {}, error() {} },
        setTimeout: window.setTimeout, clearTimeout: window.clearTimeout,
        setInterval(callback, delay) { const id = ++nextTimer; intervals.set(id, { callback, delay }); return id; },
        clearInterval: id => intervals.delete(id),
    });
    const originalYt = window.YT;
    const originalDescriptors = {
        iframeSrc: Object.getOwnPropertyDescriptor(Frame.prototype, "src"),
        scriptSrc: Object.getOwnPropertyDescriptor(ScriptElement.prototype, "src"),
        fetch: Object.getOwnPropertyDescriptor(window, "fetch"),
        create: Object.getOwnPropertyDescriptor(Document.prototype, "createElement"),
    };
    if (apiUnavailable) delete window.YT;
    vm.runInContext(source, context);
    return {
        window, context, players, timeouts, intervals, fetches, originalYt, observers, xhrCalls, document, originalDescriptors,
        restart() { vm.runInContext(source, context); },
        player(config = {}) { return new window.YT.Player(null, config); },
        tickRestore() {
            for (const [id, timer] of [...timeouts]) {
                if (timer.delay === 250) { timeouts.delete(id); timer.callback(); }
            }
        },
        poll() { for (const timer of [...intervals.values()]) timer.callback(); },
    };
}

test("real iframe ad events hide and mute ads without seeking the content to its end", () => {
    const env = createEnvironment();
    const player = env.player();
    player.iframe.style.setProperty("opacity", "0.75", "important");
    player.emit("onAdStart", "ad-a");
    env.poll();
    assert.equal(env.window.VideoBackgroundDepend.isAdPlayback(player), true);
    assert.equal(player.iframe.style.getPropertyValue("opacity"), "0");
    assert.equal(player.muted, true);
    assert.deepEqual(player.calls.filter(c => ["seekTo", "setPlaybackRate", "nextVideo", "loadVideoById"].includes(c[0])), []);
    player.emit("onAdEnd", "ad-a");
    env.tickRestore();
    assert.equal(env.window.VideoBackgroundDepend.isAdPlayback(player), false);
    assert.equal(player.iframe.style.getPropertyValue("opacity"), "0.75");
    assert.equal(player.iframe.style.getPropertyPriority("opacity"), "important");
    // The player was not muted yet when the ad began (the race that switched
    // the background's sound on by itself); it stays muted afterwards.
    assert.equal(player.muted, true);
    assert.equal(player.calls.some(([name]) => name === "unMute"), false, "an ad never unmutes a player");
});

test("a YouTube player is never left audible", () => {
    const env = createEnvironment();
    const player = env.player();
    env.poll();
    assert.equal(player.muted, true, "a poll mutes a player that is not muted");
    assert.equal(player.volume, 0, "and turns its volume down, so an unmute inside the iframe stays silent");
    // A muted-autoplay embed's own "unmute" click, or any later unmute.
    player.unMute();
    player.setVolume(100);
    player.emit("onStateChange", 1);
    assert.equal(player.muted, true, "the next state change mutes it again");
    assert.equal(player.volume, 0);
    player.unMute();
    env.poll();
    assert.equal(player.muted, true, "and so does the next poll");
});

test("ad state events work without getAdState and ignore normal PLAYING during an ad", () => {
    const env = createEnvironment();
    const player = env.player();
    for (const state of [1, 2, 3, 5]) {
        player.emit("onAdStateChange", state);
        player.emit("onStateChange", 1);
        env.poll();
        env.tickRestore();
        assert.equal(env.window.VideoBackgroundDepend.isAdPlayback(player), true);
        assert.equal(player.iframe.style.getPropertyValue("opacity"), "0");
    }
    player.emit("onAdStateChange", -1);
    env.tickRestore();
    assert.equal(player.iframe.style.getPropertyValue("opacity"), "");
});

test("only the latest requested seek is applied after an ad", () => {
    const env = createEnvironment();
    const player = env.player();
    player.emit("onAdStart", "ad-a");
    player.seekTo(12, true);
    player.seekTo(30, false);
    assert.equal(player.time, 10);
    player.emit("onAdEnd", "ad-a");
    assert.deepEqual(player.calls.filter(c => c[0] === "seekTo"), [["seekTo", 30, false]]);
    env.tickRestore();
    env.poll();
    assert.equal(player.calls.filter(c => c[0] === "seekTo").length, 1);
});

test("a second ad cancels pending reveal and a stale end cannot finish it", () => {
    const env = createEnvironment();
    const player = env.player();
    player.emit("onAdStart", "ad-a");
    player.emit("onAdEnd", "ad-a");
    player.emit("onAdStart", "ad-b");
    player.emit("onAdEnd", "ad-a");
    env.tickRestore();
    assert.equal(env.window.VideoBackgroundDepend.isAdPlayback(player), true);
    assert.equal(player.iframe.style.getPropertyValue("opacity"), "0");
    player.emit("onAdEnd", "ad-b");
    env.tickRestore();
    assert.equal(player.iframe.style.getPropertyValue("opacity"), "");
});

test("methods delivered after construction are wrapped onReady", () => {
    const env = createEnvironment({ delayedMethods: true });
    const player = env.player();
    player.installMethods();
    player.emit("onReady");
    player.emit("onAdStart", "ad-a");
    player.seekTo(42, true);
    assert.equal(player.time, 10);
    player.emit("onAdEnd", "ad-a");
    assert.equal(player.time, 42);
});

test("constructor event wrappers preserve callbacks and never mutate shared config", () => {
    const env = createEnvironment();
    const calls = [];
    function onAdStart(event) { calls.push([this, event.target]); }
    const config = { events: { onAdStart } };
    const one = env.player(config);
    const two = env.player(config);
    assert.equal(config.events.onAdStart, onAdStart);
    assert.equal(Object.hasOwn(config.events, "onReady"), false);
    one.emit("onAdStart", "one");
    two.emit("onAdStart", "two");
    assert.deepEqual(calls, [[one, one], [two, two]]);
});

test("video changes discard obsolete ad seeks and normal playback remains untouched", () => {
    const env = createEnvironment();
    const player = env.player();
    player.seekTo(15, true);
    assert.equal(player.time, 15);
    player.emit("onAdStart", "ad-a");
    player.seekTo(150, true);
    player.loadVideoById("new-video");
    env.tickRestore();
    assert.equal(player.iframe.style.getPropertyValue("opacity"), "");
    assert.equal(player.__ytAdControlState.pendingSeek, null);
    assert.equal(player.calls.filter(c => c[0] === "seekTo").length, 1);
});

test("a playback error is forwarded once without reload or skip loops", () => {
    const env = createEnvironment();
    let errors = 0;
    const player = env.player({ events: { onError() { errors++; } } });
    player.emit("onAdStart", "ad-a");
    player.emit("onError", 150);
    env.tickRestore();
    assert.equal(errors, 1);
    assert.equal(player.iframe.style.getPropertyValue("opacity"), "");
    assert.equal(player.calls.some(c => ["seekTo", "loadVideoById", "nextVideo"].includes(c[0])), false);
});

for (const action of ["destroy", "restore", "detach"]) {
    test(action + " clears player timers/listeners and cannot affect a replacement player", () => {
        const env = createEnvironment();
        const player = env.player();
        player.emit("onAdStart", "ad-a");
        player.emit("onAdEnd", "ad-a");
        const pending = [...env.timeouts.values()];
        if (action === "destroy") player.destroy();
        if (action === "restore") env.window.VideoBackgroundDepend.restore();
        if (action === "detach") { player.iframe.connected = false; env.poll(); }
        assert.equal(env.intervals.size, 0);
        assert.equal(env.timeouts.size, 0);
        assert.equal([...player.events.values()].some(listeners => listeners.size), false);
        const count = player.calls.length;
        pending.forEach(timer => timer.callback());
        player.emit("onAdStart", "late");
        assert.equal(player.calls.length, count);
        assert.equal(player.iframe.style.getPropertyValue("opacity"), "");
    });
}

test("blocked fetch returns a valid empty 204 response and ordinary fetch is unchanged", async () => {
    const env = createEnvironment();
    const response = await env.window.fetch("https://googleads.g.doubleclick.net/pagead/ads");
    assert.equal(response.status, 204);
    assert.equal(await response.text(), "");
    assert.equal(env.fetches.length, 0);
    const normal = await env.window.fetch("https://ivlis.kr/ivLyrics/openvideo/youtube");
    assert.equal(await normal.text(), "content");
    assert.equal(env.fetches.length, 1);
});

test("restoring browser hooks reinstates own and inherited properties", () => {
    const env = createEnvironment();
    const { window, originalDescriptors } = env;
    const scriptPrototype = window.HTMLScriptElement.prototype;
    const workerScope = window.navigator.serviceWorker;
    assert.equal(Object.hasOwn(scriptPrototype, "setAttribute"), true);
    assert.equal(Object.hasOwn(workerScope, "register"), true);
    assert.notStrictEqual(window.fetch, originalDescriptors.fetch.value);
    window.VideoBackgroundDepend.restore();

    assert.deepEqual(Object.getOwnPropertyDescriptor(window, "fetch"), originalDescriptors.fetch);
    assert.deepEqual(Object.getOwnPropertyDescriptor(window.Document.prototype, "createElement"), originalDescriptors.create);
    assert.deepEqual(Object.getOwnPropertyDescriptor(scriptPrototype, "src"), originalDescriptors.scriptSrc);
    assert.deepEqual(Object.getOwnPropertyDescriptor(window.HTMLIFrameElement.prototype, "src"), originalDescriptors.iframeSrc);
    assert.equal(Object.hasOwn(scriptPrototype, "setAttribute"), false);
    assert.equal(Object.hasOwn(workerScope, "register"), false);
    assert.equal(env.observers[0].connected, false);
});

test("a locked browser property leaves the remaining hooks usable", async () => {
    const env = createEnvironment();
    env.window.VideoBackgroundDepend.restore();
    const xhrPrototype = env.window.XMLHttpRequest.prototype;
    const original = xhrPrototype.open;
    Object.defineProperty(xhrPrototype, "open", { value: original, configurable: false, writable: false });
    env.restart();
    assert.strictEqual(xhrPrototype.open, original);
    assert.equal((await env.window.fetch("https://googleads.g.doubleclick.net/pagead/ads")).status, 204);
    assert.equal(env.observers.at(-1).connected, true);
    env.window.VideoBackgroundDepend.restore();
    assert.strictEqual(xhrPrototype.open, original);
    assert.strictEqual(env.window.fetch, env.originalDescriptors.fetch.value);
});

test("restoring ivLyrics preserves later browser hooks and deactivates captured wrappers", async () => {
    const env = createEnvironment();
    const { window } = env;
    const capturedFetch = window.fetch;
    const capturedOpen = window.XMLHttpRequest.prototype.open;
    const capturedSend = window.XMLHttpRequest.prototype.send;
    const capturedSetter = Object.getOwnPropertyDescriptor(window.HTMLScriptElement.prototype, "src");
    const replacementFetch = (...args) => capturedFetch(...args);
    const replacementOpen = function (...args) { return capturedOpen.apply(this, args); };
    const replacementSend = function (...args) { return capturedSend.apply(this, args); };
    const replacementSetter = function (value) { return capturedSetter.set.call(this, value); };
    const adUrl = "https://googleads.g.doubleclick.net/pagead/ads";
    window.fetch = replacementFetch;
    window.XMLHttpRequest.prototype.open = replacementOpen;
    window.XMLHttpRequest.prototype.send = replacementSend;
    Object.defineProperty(window.HTMLScriptElement.prototype, "src", { ...capturedSetter, set: replacementSetter });

    assert.equal((await window.fetch(adUrl)).status, 204, "a later wrapper can still delegate to active ivLyrics");
    window.VideoBackgroundDepend.restore();
    assert.strictEqual(window.fetch, replacementFetch);
    assert.strictEqual(window.XMLHttpRequest.prototype.open, replacementOpen);
    assert.strictEqual(window.XMLHttpRequest.prototype.send, replacementSend);
    assert.strictEqual(Object.getOwnPropertyDescriptor(window.HTMLScriptElement.prototype, "src").set, replacementSetter);
    assert.equal(await (await window.fetch(adUrl)).text(), "content");
    const xhr = new window.XMLHttpRequest();
    xhr.open("GET", adUrl);
    xhr.send("body");
    assert.deepEqual(env.xhrCalls, [["open", "GET", adUrl], ["send", "body"]]);
    const script = new window.HTMLScriptElement();
    script.src = adUrl;
    assert.equal(script.src, adUrl);
});

test("restoring the browser hooks cancels late iframe checks and observer callbacks", () => {
    const env = createEnvironment();
    const iframe = env.document.createElement("iframe");
    const src = "https://www.youtube.com/embed/abcdefghijk";
    iframe.setAttribute("src", src);
    const [queued] = env.timeouts.values();
    const [observer] = env.observers;
    env.window.VideoBackgroundDepend.restore();
    assert.equal(env.timeouts.size, 0);
    queued.callback();
    observer.callback([{ type: "attributes", target: iframe }]);
    assert.equal(iframe.getAttribute("src"), src);
});

test("a restored startup callback cannot install hooks over a replacement runtime", () => {
    const env = createEnvironment({ startupUnavailable: true });
    const oldService = env.window.VideoBackgroundDepend;
    const [oldWaiter] = env.timeouts.values();
    env.restart();
    assert.strictEqual(env.window.VideoBackgroundDepend, oldService);
    assert.equal(env.timeouts.size, 1);
    oldService.restore();
    env.window.Spicetify.Player = {};
    env.restart();
    const newService = env.window.VideoBackgroundDepend;
    const activeFetch = env.window.fetch;
    oldWaiter.callback();
    oldService.restore();
    assert.notStrictEqual(newService, oldService);
    assert.strictEqual(env.window.VideoBackgroundDepend, newService);
    assert.strictEqual(env.window.fetch, activeFetch);
    assert.equal(env.observers.length, 1);
    newService.restore();
});

test("a restored constructor and retained player method forward calls without ivLyrics side effects", () => {
    const env = createEnvironment();
    const player = env.player();
    const retainedPlayer = env.window.YT.Player;
    const retainedLoad = player.loadVideoById;
    const laterLoad = function (...args) { return retainedLoad.apply(this, args); };
    player.loadVideoById = laterLoad;
    env.window.YT.Player = function LaterPlayer(...args) { return new retainedPlayer(...args); };
    const laterConstructor = env.window.YT.Player;
    env.window.VideoBackgroundDepend.restore();
    assert.strictEqual(player.loadVideoById, laterLoad);
    assert.strictEqual(env.window.YT.Player, laterConstructor);
    player.calls.length = 0;
    player.loadVideoById("abcdefghijk");
    assert.deepEqual(player.calls, [["loadVideoById", "abcdefghijk"]]);
    const config = { videoId: "abcdefghijk" };
    const laterPlayer = env.player(config);
    assert.strictEqual(laterPlayer.config, config);
    assert.equal(laterPlayer.__ytAdSkipperAttached, undefined);
});

test("a fresh runtime can attach to a previously restored player", () => {
    const env = createEnvironment({ preExisting: true });
    const player = env.players[0];
    const firstState = player.__ytAdControlState;
    env.window.VideoBackgroundDepend.restore();
    assert.equal(firstState.disposed, true);
    env.restart();
    assert.notStrictEqual(player.__ytAdControlState, firstState);
    assert.equal(player.__ytAdSkipperAttached, true);
    player.emit("onAdStart", "next");
    assert.equal(env.window.VideoBackgroundDepend.isAdPlayback(player), true);
    env.window.VideoBackgroundDepend.restore();
});

test("ad playback bypasses content seeks and pre-roll holds, then resyncs to Spotify", () => {
    const env = createEnvironment();
    const player = env.player();
    const { syncYouTubePlayerTimeline, settleYouTubeHoldPrime } = createYouTubeBackgroundTimeline({
        isYouTubeAdPlaying: (target) => isYouTubeBackgroundAdPlaying(env.window, target),
    });
    const holdState = { isHolding: false, primePending: false };
    player.emit("onAdStart", "ad-a");
    syncYouTubePlayerTimeline({ player, targetVideoTime: 0, shouldHoldAtStart: true, shouldPlay: true, holdState });
    assert.deepEqual(holdState, { isHolding: false, primePending: false });
    assert.equal(player.calls.some(c => c[0] === "seekTo"), false);
    assert.equal(player.calls.at(-1)[0], "playVideo");
    syncYouTubePlayerTimeline({ player, targetVideoTime: 30, shouldPlay: false, holdState });
    assert.equal(player.calls.at(-1)[0], "pauseVideo");
    assert.equal(settleYouTubeHoldPrime({ player, playerState: 1, holdState: { isHolding: true, primePending: true } }), false);
    player.emit("onAdEnd", "ad-a");
    syncYouTubePlayerTimeline({ player, targetVideoTime: 42, shouldPlay: true, holdState });
    assert.deepEqual(player.calls.filter(c => c[0] === "seekTo"), [["seekTo", 42, true]]);
});

test("an iframe created before the API patch also gets real ad event handlers", () => {
    const env = createEnvironment({ preExisting: true });
    const player = env.players[0];
    assert.equal(player.__ytAdSkipperAttached, true);
    player.emit("onAdStart", "ad-a");
    assert.equal(env.window.VideoBackgroundDepend.isAdPlayback(player), true);
    assert.equal(player.iframe.style.getPropertyValue("opacity"), "0");
    player.emit("onAdEnd", "ad-a");
    env.tickRestore();
    assert.equal(player.iframe.style.getPropertyValue("opacity"), "");
});

test("API-ready patches the constructor before a chained app callback creates the first player", () => {
    const env = createEnvironment({ apiUnavailable: true });
    let ready = 0;
    env.window.onYouTubeIframeAPIReady = () => { ready++; env.player(); };
    const previous = env.window.onYouTubeIframeAPIReady;
    const next = function () { previous(); ready++; };
    env.window.onYouTubeIframeAPIReady = next;
    env.window.YT = env.originalYt;
    env.window.onYouTubeIframeAPIReady();
    assert.equal(ready, 2);
    assert.equal(env.players.length, 1);
    assert.equal(env.players[0].__ytAdSkipperAttached, true);
    assert.equal(env.players[0].__ytAdControlState.adEventsInConfig, true);
    env.window.VideoBackgroundDepend.restore();
    assert.equal(env.window.onYouTubeIframeAPIReady, next);
    assert.equal(env.timeouts.size, 0);
    assert.equal(env.intervals.size, 0);
});

const recordedCalls = player => JSON.parse(JSON.stringify(player.calls));

test("muted seeks load the requested position once while repeated sync ticks are buffering", () => {
    const env = createEnvironment();
    const player = env.player();
    player.loadVideoById("abcdefghijk", 0, "hd720");
    player.calls.length = 0;
    player.seekTo(100, true);
    player.seekTo(100.25, true);
    player.seekTo(100.5, true);
    assert.deepEqual(recordedCalls(player).filter(c => c[0] === "loadVideoById"), [
        ["loadVideoById", { videoId: "abcdefghijk", startSeconds: 100, suggestedQuality: "hd720", playmuted: true }],
    ]);
    assert.equal(player.calls.some(c => c[0] === "seekTo"), false);
    player.seekTo(40, true);
    assert.equal(recordedCalls(player).at(-1)[1].startSeconds, 40);
});

test("paused muted seeks cue the requested frame instead of starting playback", () => {
    const env = createEnvironment();
    const player = env.player();
    player.loadVideoById("abcdefghijk");
    player.state = 2;
    player.pauseVideo();
    player.calls.length = 0;
    player.seekTo(80, true);
    assert.deepEqual(recordedCalls(player).filter(c => c[0] === "cueVideoById"), [
        ["cueVideoById", { videoId: "abcdefghijk", startSeconds: 80, playmuted: true }],
    ]);
    assert.equal(player.calls.some(c => c[0] === "playVideo" || c[0] === "loadVideoById"), false);
});

test("a play requested during a positioned cue is reapplied after CUED without loading twice", () => {
    const env = createEnvironment();
    const player = env.player();
    player.loadVideoById("abcdefghijk");
    player.state = 2;
    player.pauseVideo();
    player.seekTo(0, true);
    player.playVideo();
    player.emit("onStateChange", 5);
    assert.equal(player.calls.filter(c => c[0] === "cueVideoById").length, 1);
    assert.equal(player.calls.filter(c => c[0] === "playVideo").length, 2);
});

test("a pause requested during a muted load survives a late PLAYING event", () => {
    const env = createEnvironment();
    const player = env.player();
    player.loadVideoById("abcdefghijk");
    player.seekTo(90, true);
    player.pauseVideo();
    player.emit("onStateChange", 1);
    assert.equal(player.__ytAdControlState.mutedPlaybackIntent, false);
    assert.equal(player.calls.at(-1)[0], "pauseVideo");
    assert.equal(player.calls.filter(c => c[0] === "loadVideoById").length, 2);
});

test("a muted URL seek preserves its URL and end options", () => {
    const env = createEnvironment();
    const player = env.player();
    player.loadVideoByUrl({ mediaContentUrl: "https://www.youtube.com/embed/abcdefghijk", endSeconds: 80 });
    player.calls.length = 0;
    player.seekTo(50, true);
    assert.deepEqual(recordedCalls(player).at(-1), ["loadVideoByUrl", {
        mediaContentUrl: "https://www.youtube.com/embed/abcdefghijk", endSeconds: 80, startSeconds: 50, playmuted: true,
    }]);
});

test("bootstraps an empty embed and loads the initial video muted before the app callback", () => {
    const env = createEnvironment({ delayedMethods: true });
    let readyCalls;
    const config = { videoId: "abcdefghijk", playerVars: { autoplay: 1, start: 8 },
        events: { onReady(event) { readyCalls = recordedCalls(event.target); } } };
    const player = env.player(config);
    assert.equal(player.config.videoId, "");
    assert.equal(config.videoId, "abcdefghijk");
    assert.equal(config.playerVars.playmuted, undefined);
    assert.equal(player.config.playerVars.playmuted, 1);
    player.installMethods();
    player.emit("onReady");
    assert.deepEqual(readyCalls.filter(c => c[0] === "loadVideoById"), [
        ["loadVideoById", { videoId: "abcdefghijk", startSeconds: 8, playmuted: true }],
    ]);
    player.emit("onReady");
    assert.equal(player.calls.filter(c => c[0] === "loadVideoById").length, 1);
});

test("a paused initial embed cues its muted video and preserves the requested end time", () => {
    const env = createEnvironment();
    const player = env.player({ videoId: "abcdefghijk", playerVars: { autoplay: 0, start: 5, end: 18 } });
    player.emit("onReady");
    assert.deepEqual(recordedCalls(player).filter(c => c[0] === "cueVideoById"), [
        ["cueVideoById", { videoId: "abcdefghijk", startSeconds: 5, endSeconds: 18, playmuted: true }],
    ]);
    assert.equal(player.calls.some(c => c[0] === "playVideo"), false);
});

test("subsequent positional loads and URL loads request muted playback without losing options", () => {
    const env = createEnvironment();
    const player = env.player();
    player.loadVideoById("abcdefghijk", 12, "hd720");
    player.cueVideoByUrl("https://www.youtube.com/embed/abcdefghijk", 9, "large");
    assert.deepEqual(recordedCalls(player).filter(c => /By(Id|Url)$/.test(c[0])), [
        ["loadVideoById", { videoId: "abcdefghijk", startSeconds: 12, suggestedQuality: "hd720", playmuted: true }],
        ["cueVideoByUrl", { mediaContentUrl: "https://www.youtube.com/embed/abcdefghijk", startSeconds: 9, suggestedQuality: "large", playmuted: true }],
    ]);
});

test("object loads are copied and their explicit end time is never removed", () => {
    const env = createEnvironment();
    const player = env.player();
    const options = { videoId: "abcdefghijk", startSeconds: 5, endSeconds: 80, playmuted: false };
    player.loadVideoById(options);
    assert.equal(options.playmuted, false);
    assert.equal(recordedCalls(player).at(-1)[1].playmuted, true);
    player.emit("onStateChange", 1);
    player.emit("onCueRangesAdded", [{ id: "", start: 80000, end: 0x7ffffffffffff }]);
    assert.equal(player.__ytAdControlState.previewLimitTimers.size, 0);
    assert.equal(player.calls.some(c => c[0] === "removeCueRange"), false);
});

test("muted playback removes the preview stop cue without seeking, changing rate or reloading", () => {
    const env = createEnvironment();
    const player = env.player();
    player.loadVideoById("abcdefghijk");
    player.emit("onStateChange", 1);
    assert.equal(player.__ytAdControlState.previewLimitTimers.size, 2);
    const before = player.calls.length;
    for (const id of [...player.__ytAdControlState.previewLimitTimers]) env.timeouts.get(id).callback();
    assert.deepEqual(recordedCalls(player).slice(before), [["removeCueRange", ""], ["removeCueRange", ""]]);
    assert.equal(player.time, 10);
});

test("forwarded cue metadata preserves named markers and finite ranges", () => {
    const env = createEnvironment();
    const player = env.player();
    player.loadVideoById("abcdefghijk");
    player.emit("onCueRangesAdded", [
        { id: "chapter", start: 0, end: 0x7ffffffffffff },
        { id: "", start: 0, end: 60000 },
        { id: "", start: 30000, end: 0x7ffffffffffff },
    ]);
    assert.deepEqual(recordedCalls(player).filter(c => c[0] === "removeCueRange"), [["removeCueRange", ""]]);
});

test("preview stop cleanup never touches an active ad or an ordinary playlist", () => {
    const env = createEnvironment();
    const player = env.player();
    player.loadVideoById("abcdefghijk");
    player.emit("onStateChange", 1);
    const timers = [...player.__ytAdControlState.previewLimitTimers].map(id => env.timeouts.get(id));
    player.emit("onAdStart", "ad-a");
    timers.forEach(t => t.callback());
    player.emit("onCueRangesAdded", [{ id: "", start: 30000, end: 0x7ffffffffffff }]);
    assert.equal(player.calls.some(c => c[0] === "removeCueRange"), false);
    player.loadPlaylist(["abcdefghijk"]);
    player.emit("onStateChange", 1);
    assert.equal(player.__ytAdControlState.mutedPlayback, false);
    assert.equal(player.__ytAdControlState.previewLimitTimers.size, 0);
});

for (const action of ["load", "destroy", "restore"]) {
    test(`stale preview-limit timers after ${action} cannot affect another playback`, () => {
        const env = createEnvironment();
        const player = env.player();
        player.loadVideoById("abcdefghijk");
        player.emit("onStateChange", 1);
        const timers = [...player.__ytAdControlState.previewLimitTimers].map(id => env.timeouts.get(id));
        if (action === "load") player.loadVideoById("bcdefghijkl");
        if (action === "destroy") player.destroy();
        if (action === "restore") env.window.VideoBackgroundDepend.restore();
        const count = player.calls.length;
        timers.forEach(t => t.callback());
        assert.equal(player.calls.length, count);
        assert.equal(player.__ytAdControlState.previewLimitTimers.size, 0);
    });
}

test("no YouTube player or background video in the app is created or left audible", () => {
    // The song is Spotify's; every video ivLyrics shows is only a picture. The
    // video picker's previews used to start unmuted (mute: 0, a <video> with
    // muted: false), playing over the song.
    const sources = sourceNames
        .filter(name => name.endsWith(".js") && !name.startsWith("langs/"))
        .map(name => [name, readFileSync(sourceUrl(name), "utf8")]);
    for (const name of ["app/setupWizardVideoSteps.mjs", "features/video/communityVideoPreview.mjs"]) {
        sources.push([name, readFileSync(new URL("../src/" + name, import.meta.url), "utf8")]);
    }
    assert.ok(sources.length > 50, "scanned the app's source files");
    const audible = [];
    for (const [name, text] of sources) {
        for (const [pattern, what] of [
            [/\bmute:\s*0\b/, "YT.Player with mute: 0"],
            [/\bplaymuted:\s*(?:0|false)\b/, "playmuted off"],
            [/createElement\(\s*["']video["'][\s\S]{0,400}?\bmuted:\s*false/, "<video> with muted: false"],
            [/\.muted\s*=\s*false/, "video.muted = false"],
            [/\.unMute\b/, "unMute()"],
        ]) {
            if (pattern.test(text)) audible.push(`${name}: ${what}`);
        }
    }
    assert.deepEqual(audible, []);
});
