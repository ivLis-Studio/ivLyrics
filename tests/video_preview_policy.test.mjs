import assert from "node:assert/strict";
import test from "node:test";
import { createCommunityVideoPreviews } from "../src/features/video/communityVideoPreview.mjs";
import { createYouTubeBackgroundIframePolicy } from "../src/features/video/youtubeBackgroundIframePolicy.mjs";

test("the iframe observer handles direct, nested, and late YouTube sources without querying leaves", () => {
    let deliver;
    let observation;
    let disconnected = false;
    let queries = 0;
    const initial = { src: "https://www.youtube.com/watch?v=initial" };
    const element = (tagName, attrs, children = []) => ({
        nodeType: 1,
        tagName,
        childElementCount: children.length,
        getAttribute: name => attrs[name] ?? null,
        setAttribute: (name, value) => { attrs[name] = value; },
        querySelectorAll: selector => {
            assert.equal(selector, "iframe");
            queries += 1;
            return children;
        },
    });
    const body = {};
    const existing = element("IFRAME", initial);
    const document = { body, querySelectorAll: () => [existing] };
    const host = {
        location: { origin: "https://open.spotify.com" },
        Node: { ELEMENT_NODE: 1 },
        MutationObserver: class {
            constructor(callback) { deliver = callback; }
            observe(target, options) { observation = { target, options }; }
            disconnect() { disconnected = true; }
        },
    };
    const moduleState = { initialized: true, iframeObserver: null };
    const restores = new Map();
    const { observeIframes } = createYouTubeBackgroundIframePolicy({
        host, document, moduleState, registerRestore: (key, callback) => restores.set(key, callback),
    });
    observeIframes();
    assert.equal(observation.target, body);
    assert.deepEqual(observation.options.attributeFilter, ["src"]);
    assert.match(initial.src, /^https:\/\/www\.youtube-nocookie\.com\/embed\/initial\?/);

    const direct = { src: "https://youtu.be/direct" };
    const nested = { src: "https://www.youtube.com/embed/nested" };
    const late = {};
    const lateIframe = element("IFRAME", late);
    deliver([{
        type: "childList",
        addedNodes: [
            { nodeType: 3 },
            ...Array.from({ length: 80 }, () => element("SPAN", {})),
            element("IFRAME", direct),
            element("DIV", {}, [element("IFRAME", nested)]),
            lateIframe,
        ],
    }]);
    assert.equal(queries, 1);
    assert.match(direct.src, /^https:\/\/www\.youtube-nocookie\.com\/embed\/direct\?/);
    assert.match(nested.src, /^https:\/\/www\.youtube-nocookie\.com\/embed\/nested\?/);
    assert.equal(lateIframe.__ytAdBlockSanitized, undefined);

    late.src = "https://youtu.be/late";
    deliver([{ type: "attributes", target: lateIframe }]);
    assert.match(late.src, /^https:\/\/www\.youtube-nocookie\.com\/embed\/late\?/);
    assert.equal(late.referrerpolicy, "origin");
    assert.equal(late.allow, "autoplay; encrypted-media; picture-in-picture");
    assert.equal(new URL(late.src).searchParams.get("origin"), host.location.origin);
    assert.equal(queries, 1);
    restores.get("iframe-observer")();
    assert.equal(disconnected, true);
    assert.equal(moduleState.iframeObserver, null);
});

test("YouTube previews retain their distinct player options and only schedule skip checks when needed", t => {
    const intervals = t.mock.method(globalThis, "setInterval", (_callback, delay) => delay);
    const cleared = t.mock.method(globalThis, "clearInterval", () => {});
    const players = [];
    const host = {
        location: { origin: "https://open.spotify.com" },
        addEventListener() {},
        removeEventListener() {},
        YT: { Player: class {
            constructor(id, options) {
                Object.assign(this, { id, options, calls: [] });
                players.push(this);
            }
            seekTo(...args) { this.calls.push(["seek", ...args]); }
            playVideo() { this.calls.push(["play"]); }
            destroy() { this.calls.push(["destroy"]); }
        } },
    };
    const document = { createElement: () => ({}) };
    const effects = [];
    const react = {
        useState: initial => [typeof initial === "function" ? initial() : initial, () => {}],
        useMemo: callback => callback(),
        useRef: current => ({ current }),
        useEffect: callback => effects.push(callback),
        useLayoutEffect: callback => effects.push(callback),
        createElement(_name, props) {
            if (props?.ref) props.ref.current = { appendChild() {} };
        },
    };
    const { SyncedVideoPreview, SimpleVideoPreview } = createCommunityVideoPreviews({
        host, document, react, i18n: { t: key => key },
        spicetify: { Player: { addEventListener() {}, removeEventListener() {} } },
    });
    const mount = (Component, props) => {
        Component({ videoId: "preview1234", startTime: 5.9, ...props });
        const cleanups = effects.splice(0).map(setup => setup()).filter(Boolean);
        return () => cleanups.forEach(cleanup => cleanup());
    };
    const unmountSynced = mount(SyncedVideoPreview);
    const [synced] = players;
    assert.match(synced.id, /^preview-player-preview1234-/);
    assert.equal(synced.options.height, 200);
    assert.equal(synced.options.playerVars.autoplay, 0);
    assert.equal(Object.hasOwn(synced.options.playerVars, "start"), false);
    assert.equal(synced.options.playerVars.mute, 1);
    assert.deepEqual(intervals.mock.calls.map(call => call.arguments[1]), [500]);
    unmountSynced();
    assert.deepEqual(synced.calls, [["destroy"]]);

    const unmountSimple = mount(SimpleVideoPreview, { skipSegments: [] });
    const simple = players[1];
    assert.match(simple.id, /^simple-preview-preview1234-/);
    assert.equal(simple.options.height, "180");
    assert.equal(simple.options.playerVars.autoplay, 1);
    assert.equal(simple.options.playerVars.start, 5);
    assert.equal(simple.options.playerVars.mute, 1);
    assert.equal(simple.options.playerVars.origin, host.location.origin);
    simple.options.events.onReady();
    assert.deepEqual(simple.calls, [["seek", 5.9, true], ["play"], ["seek", 5.9, true], ["play"]]);
    assert.equal(intervals.mock.callCount(), 1);
    unmountSimple();
    simple.options.events.onReady();
    assert.deepEqual(simple.calls.at(-1), ["destroy"]);

    const unmountWithSegments = mount(SimpleVideoPreview, { skipSegments: [{ start: 20, end: 30 }] });
    assert.deepEqual(intervals.mock.calls.map(call => call.arguments[1]), [500, 250]);
    unmountWithSegments();
    assert.deepEqual(cleared.mock.calls.map(call => call.arguments[0]), [500, 250]);
});
