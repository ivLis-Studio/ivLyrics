import { publishRuntimeService } from "#ivlyrics/spicetify/runtimeServices.mjs";
import { bundleInitializer } from "./fixtures/initializer-bundle.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { activateLyricsPage, getMountedLyricsPage, releaseLyricsPage } from "../src/spicetify/lyricsPageEffects.mjs";
import { LYRICS_PROVIDER_SELECTION_CHANGED } from "#ivlyrics/lyrics/lyricsProviderRequests.mjs";
import { registerPanelLyricPresentationOwner } from "#ivlyrics/lyrics/lyricPresentationOwnership.mjs";
import { LOCAL_LYRICS_UPDATED_EVENT } from "#ivlyrics/lyrics/localLyricsStore.mjs";

const source = bundleInitializer(new URL("../src/features/overlay/OverlayService.js", import.meta.url));
const indexSource = readFileSync(new URL("../src/spicetify/index.js", import.meta.url), "utf8");

const flush = async () => {
  for (let i = 0; i < 4; i++) await new Promise((resolve) => setImmediate(resolve));
};

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return {promise, resolve, reject};
};

const trackFor = (uri) => ({
  uri,
  name: uri.split(":").at(-1),
  metadata: {title: "Fixture song", artist_name: "Fixture artist"},
});

const incompleteSnapshot = (trackUri) => ({
  trackUri,
  source: "ivlyrics-page",
  displayLyrics: [{text: "Original", startTime: 1000}],
  displayMode2: "gemini_ko",
  presentationComplete: false,
});

const completeSnapshot = (trackUri) => ({
  ...incompleteSnapshot(trackUri),
  displayLyrics: [{text: "Original", text2: "Translated", startTime: 1000}],
  presentationComplete: true,
});

const createEventTarget = (name, trace) => {
  const listeners = new Map();
  return {
    addEventListener(type, callback) {
      const set = listeners.get(type) || new Set();
      set.add(callback);
      listeners.set(type, set);
      trace.push(["add", name, type]);
    },
    removeEventListener(type, callback) {
      listeners.get(type)?.delete(callback);
      trace.push(["remove", name, type]);
    },
    dispatchEvent(event) {
      trace.push(["event", name, event.type, event.detail]);
      for (const callback of [...(listeners.get(event.type) || [])]) callback(event);
    },
    listenerCount(type) {
      return listeners.get(type)?.size || 0;
    },
    listenerTypes() {
      return [...listeners].flatMap(([type, set]) => set.size ? [type] : []);
    },
  };
};

// The service is evaluated as-is. Only browser, player, sender, snapshot and
// clock collaborators are replaced with deterministic in-memory objects.
const createHarness = ({
  initialUri = "spotify:track:fixture",
  playerReady = true,
  pathname = "/home",
  panelActive = false,
  overlayEnabled = true,
  helperEnabled = false,
  overlayConnected = true,
  helperConnected = false,
  overlayDelivered = null,
  helperDelivered = null,
  snapshot = null,
  getFullLyricsResult = null,
  failHistoryRegistration = false,
} = {}) => {
  const trace = [];
  const timers = new Map();
  const snapshots = new Map();
  const fallbackCalls = [];
  const sharedSends = [];
  const emptySends = [];
  const pendingFallbacks = new Map();
  const clock = {now: 0};
  let nextTimerId = 0;
  let currentTrack = trackFor(initialUri);
  let djNarration = false;

  if (snapshot) snapshots.set(snapshot.trackUri, snapshot);

  const setTimeoutInHarness = (callback, delay) => {
    const handle = ++nextTimerId;
    const ms = Math.max(0, Number(delay) || 0);
    timers.set(handle, {callback, ms, due: clock.now + ms});
    trace.push(["timer", handle, ms]);
    return handle;
  };
  const clearTimeoutInHarness = (handle) => {
    timers.delete(handle);
    trace.push(["clear", handle]);
  };

  const window = createEventTarget("window", trace);
  const document = createEventTarget("document", trace);
  document.body = {
    classList: {
      contains: (className) => className === "ivlyrics-panel-lyrics-active"
        && panelActive,
    },
  };
  const player = createEventTarget("player", trace);
  player.data = {item: currentTrack};
  player.getDuration = () => 180000;
  const playerAddEventListener = player.addEventListener;
  if (!playerReady) player.addEventListener = undefined;

  const historyListeners = new Set();
  const history = {
    location: {pathname},
    listen(callback) {
      if (failHistoryRegistration) {
        failHistoryRegistration = false;
        throw new Error("fixture History not ready");
      }
      historyListeners.add(callback);
      trace.push(["history-add"]);
      return () => {
        historyListeners.delete(callback);
        trace.push(["history-remove"]);
      };
    },
  };

  const sender = (name, enabled, isConnected, lastDeliveredUri) => ({
    name,
    enabled,
    isConnected,
    lastDeliveredUri,
    sendLyrics(trackInfo, lyrics, force, reason) {
      trace.push(["send", name]);
      emptySends.push({ name, trackInfo, lyrics, force, reason });
      this.lastDeliveredUri = trackInfo.uri;
      this.lastDeliveredIsDjNarration = trackInfo.isDjNarration === true;
      return Promise.resolve();
    },
  });
  const overlay = sender("overlay", overlayEnabled, overlayConnected, overlayDelivered);
  const helper = sender("helper", helperEnabled, helperConnected, helperDelivered);

  const defaultFallbackResult = () => {
    const pending = deferred();
    pendingFallbacks.set(currentTrack.uri, pending);
    return pending.promise;
  };

  const context = vm.createContext({
    window: Object.assign(window, {
      Spicetify: {Player: player, Platform: {History: history}},
      OverlaySender: overlay,
      lyricsHelperSender: helper,
      LyricsService: {
        getFullLyrics(trackInfo, options) {
          fallbackCalls.push({trackInfo, options});
          trace.push(["fallback", trackInfo.uri, options]);
          return typeof getFullLyricsResult === "function"
            ? getFullLyricsResult(trackInfo, options)
            : defaultFallbackResult();
        },
        getLyricsSnapshot(trackUri) {
          return snapshots.get(trackUri) || null;
        },
        async sendLyricsSnapshotToConsumers(trackInfo, currentSnapshot, options) {
          sharedSends.push({trackInfo, snapshot: currentSnapshot, options});
          trace.push(["shared", trackInfo.uri, currentSnapshot.presentationComplete, options]);
          for (const consumer of [overlay, helper]) {
            if (consumer.enabled && consumer.isConnected) {
              consumer.lastDeliveredUri = trackInfo.uri;
              consumer.lastDeliveredIsDjNarration = trackInfo.isDjNarration === true;
            }
          }
          return true;
        },
      },
      Utils: {
        getPlayerPlaybackSnapshot: () => ({uri: currentTrack.uri, djNarration}),
        resolveStablePlaybackTrack: () => currentTrack,
      },
    }),
    Spicetify: {Player: player, Platform: {History: history}},
    document,
    Date: {now: () => clock.now},
    setTimeout: setTimeoutInHarness,
    clearTimeout: clearTimeoutInHarness,
    console: { ...console, warn: (...args) => trace.push(["warn", ...args]) },
  });

  const start = () => vm.runInContext(source, context);
  start();

  const runTimer = async (handle) => {
    const entry = timers.get(handle);
    assert.ok(entry, `expected timer ${handle} to be scheduled`);
    timers.delete(handle);
    clock.now = Math.max(clock.now, entry.due);
    await entry.callback();
    await flush();
  };

  const runNextTimer = async () => {
    const next = [...timers.entries()].sort(([, a], [, b]) => a.due - b.due)[0];
    assert.ok(next, "expected a timer to be scheduled");
    await runTimer(next[0]);
  };

  const runDueTimers = async (limit = 20) => {
    let runs = 0;
    while (runs < limit) {
      const next = [...timers.entries()].sort(([, a], [, b]) => a.due - b.due)[0];
      if (!next || next[1].due > clock.now) break;
      await runTimer(next[0]);
      runs++;
    }
    return runs;
  };

  const advance = async (milliseconds, limit = 20) => {
    clock.now += milliseconds;
    return runDueTimers(limit);
  };

  const publish = (nextSnapshot) => {
    snapshots.set(nextSnapshot.trackUri, nextSnapshot);
    window.dispatchEvent({
      type: "ivLyrics:shared-lyrics-updated",
      detail: nextSnapshot,
    });
  };

  const navigate = async (nextPathname) => {
    pathname = nextPathname;
    history.location.pathname = nextPathname;
    for (const callback of [...historyListeners]) callback({pathname: nextPathname});
    await flush();
  };

  const releaseOwner = async () => {
    window.dispatchEvent({type: "ivLyrics:presentation-owner-released"});
    await flush();
  };

  const switchTrack = async (nextUri) => {
    currentTrack = trackFor(nextUri);
    player.data.item = currentTrack;
    player.dispatchEvent({type: "songchange"});
    await flush();
  };

  return {
    clock,
    document,
    fallbackCalls,
    emptySends,
    history,
    historyListeners,
    helper,
    navigate,
    overlay,
    pendingFallbacks,
    player,
    publish,
    releaseOwner,
    runDueTimers,
    runNextTimer,
    runTimer,
    advance,
    makePlayerReady() {
      player.addEventListener = playerAddEventListener;
    },
    service: window.ivLyricsOverlayService,
    start,
    sharedSends,
    setNarration(value) { djNarration = value; },
    switchTrack,
    timers,
    trace,
    window,
  };
};

test("a same-URI narration replaces delivered lyrics and restores the song once without an extra event", async () => {
  const trackUri = "spotify:track:fixture";
  const h = createHarness({ overlayDelivered: trackUri, snapshot: completeSnapshot(trackUri) });
  await h.runNextTimer();
  h.setNarration(true);
  h.player.dispatchEvent({ type: "songchange" });
  await h.runNextTimer();
  assert.deepEqual(h.emptySends.map(({name, reason}) => [name, reason]), [["overlay", "dj-narration"]]);
  assert.equal(h.emptySends[0].lyrics.length, 0);
  assert.equal(h.overlay.lastDeliveredIsDjNarration, true);
  h.publish({ ...completeSnapshot(trackUri), source: "now-playing-panel" });
  await h.runNextTimer();
  assert.equal(h.sharedSends.length, 0);
  assert.equal(h.emptySends.length, 1);
  h.setNarration(false);
  await h.runNextTimer();
  assert.equal(h.sharedSends.length, 1);
  assert.equal(h.overlay.lastDeliveredIsDjNarration, false);
  assert.equal(h.fallbackCalls.length, 0);
  assert.equal(h.timers.size, 0);
});

test("dependency gate waits for a callable player event API before wiring the service", async () => {
  const h = createHarness({playerReady: false});

  assert.equal(h.window.ivLyricsOverlayService, undefined);
  assert.equal(h.player.listenerCount("songchange"), 0);
  assert.deepEqual([...h.timers.values()].map(({ms}) => ms), [300]);

  h.makePlayerReady();
  await h.runNextTimer();

  assert.ok(h.window.ivLyricsOverlayService);
  assert.equal(h.player.listenerCount("songchange"), 1);
  h.window.ivLyricsOverlayService.destroy();
});

test("partial overlay setup rolls back its subscriptions and one startup retry mounts it", async () => {
  const h = createHarness({ failHistoryRegistration: true });
  assert.equal(h.window.ivLyricsOverlayService, undefined);
  assert.equal(h.player.listenerCount("songchange"), 0);
  assert.deepEqual(h.window.listenerTypes(), []);
  assert.deepEqual([...h.timers.values()].map(({ ms }) => ms), [300]);
  assert.equal(h.trace.filter(([kind]) => kind === "warn").length, 1);

  const queuedRetry = [...h.timers.values()][0].callback;
  h.start();
  const service = h.window.ivLyricsOverlayService;
  assert.ok(service);
  queuedRetry();
  assert.equal(h.window.ivLyricsOverlayService, service);
  assert.equal(h.player.listenerCount("songchange"), 1);
  assert.equal(h.historyListeners.size, 1);
  assert.deepEqual([...h.timers.values()].map(({ ms }) => ms), [1200]);
});

test("overlay destruction removes listeners from their original targets and cannot retire its replacement", () => {
  const h = createHarness();
  const replacementPlayer = createEventTarget("new player", h.trace);
  replacementPlayer.data = h.player.data;
  h.window.Spicetify.Player = replacementPlayer;
  const previous = h.service;
  previous.destroy();
  assert.equal(h.window.ivLyricsOverlayService, undefined);
  assert.equal(h.player.listenerCount("songchange"), 0);
  assert.equal(h.historyListeners.size, 0);
  assert.deepEqual(h.window.listenerTypes(), []);
  assert.equal(h.timers.size, 0);

  h.start();
  const replacement = h.window.ivLyricsOverlayService;
  assert.notEqual(replacement, previous);
  previous.destroy();
  previous.syncNow();
  h.start();
  assert.equal(h.window.ivLyricsOverlayService, replacement);
  assert.equal(previous.getState().initialized, false);
  assert.equal(replacement.getState().initialized, true);
  assert.equal(replacementPlayer.listenerCount("songchange"), 1);
  assert.equal(h.historyListeners.size, 1);
  assert.deepEqual([...h.timers.values()].map(({ ms }) => ms), [1200]);
});

test("one broken overlay disposer does not strand the other subscriptions or the next mount", () => {
  const h = createHarness();
  h.player.removeEventListener = () => { throw new Error("fixture detached Player"); };
  h.service.destroy();
  assert.equal(h.window.ivLyricsOverlayService, undefined);
  assert.equal(h.historyListeners.size, 0);
  assert.deepEqual(h.window.listenerTypes(), []);
  h.player.dispatchEvent({ type: "songchange" });
  assert.equal(h.timers.size, 0);
  h.start();
  assert.ok(h.window.ivLyricsOverlayService);
  assert.equal(h.historyListeners.size, 1);
  assert.equal(h.trace.filter(([kind]) => kind === "warn").length, 1);
});

test("mount cleans the previous page before marking the replacement active", () => {
  assert.match(indexSource, /componentDidMount\(\) \{\s+this\.lifecycle\.mount\(\)/);
  assert.match(indexSource, /componentWillUnmount\(\) \{\s+this\.lifecycle\.unmount\(\)/);
  const trace = [];
  const activeClasses = new Set();
  const document = {
    body: {
      classList: {
        add(name) { activeClasses.add(name); trace.push(["add", name]); },
        remove(name) { activeClasses.delete(name); trace.push(["remove", name]); },
      },
    },
  };
  const oldPage = { _isComponentMounted: true };
  const host = { document, lyricContainer: oldPage };
  oldPage.componentWillUnmount = () => {
    oldPage._isComponentMounted = false;
    releaseLyricsPage(host, oldPage);
  };
  const newPage = { _isComponentMounted: true };
  activateLyricsPage(host, newPage);
  releaseLyricsPage(host, oldPage);

  assert.deepEqual(trace, [["remove", "ivlyrics-page-active"], ["add", "ivlyrics-page-active"]]);
  assert.equal(oldPage._isComponentMounted, false);
  assert.equal(getMountedLyricsPage(host), newPage);
  assert.equal(host.lyricContainer, newPage);
  assert.equal(activeClasses.has("ivlyrics-page-active"), true);
});

test("a similarly named route permits translated overlay fallback for an incomplete snapshot", async () => {
  const trackUri = "spotify:track:fixture";
  const h = createHarness({
    pathname: "/ivLyrics-test",
    overlayDelivered: trackUri,
    snapshot: incompleteSnapshot(trackUri),
  });

  await h.runNextTimer();

  assert.equal(h.fallbackCalls.length, 1);
  assert.equal(h.fallbackCalls[0].trackInfo.uri, trackUri);
  assert.equal(h.fallbackCalls[0].options.skipTranslation, false);
  assert.equal(h.sharedSends.length, 0);
});

test("native preview suppression alone does not claim the overlay presentation", async () => {
  const h = createHarness({panelActive: true});
  await h.runNextTimer();
  assert.equal(h.fallbackCalls.length, 1);
  assert.equal(h.fallbackCalls[0].options.skipTranslation, false);
});

test("a mounted panel delays fallback until its last presentation owner closes", async () => {
  const trackUri = "spotify:track:fixture";
  const h = createHarness({panelActive: true, overlayDelivered: trackUri, snapshot: incompleteSnapshot(trackUri)});
  const releaseOld = registerPanelLyricPresentationOwner(h.window, () => trackUri);
  const releaseNew = registerPanelLyricPresentationOwner(h.window, () => trackUri);
  await h.runNextTimer();
  assert.equal(h.fallbackCalls.length, 0);

  releaseOld();
  await h.runDueTimers();
  assert.equal(h.fallbackCalls.length, 0);

  releaseNew();
  await h.runDueTimers();
  assert.equal(h.fallbackCalls.length, 1);
  assert.equal(h.fallbackCalls[0].options.skipTranslation, false);
});

test("panel removal does not release a page still opening on its own route", async () => {
  const trackUri = "spotify:track:fixture";
  const h = createHarness({pathname: "/ivLyrics", snapshot: incompleteSnapshot(trackUri)});
  const releasePanel = registerPanelLyricPresentationOwner(h.window, () => trackUri);
  releasePanel();
  await h.runDueTimers();
  assert.equal(h.fallbackCalls.length, 0);
  assert.equal(h.sharedSends.length, 1);
});

test("a complete snapshot already delivered to the connected consumer is not retranslated", async () => {
  const trackUri = "spotify:track:fixture";
  const h = createHarness({
    overlayDelivered: trackUri,
    snapshot: completeSnapshot(trackUri),
  });

  await h.runNextTimer();
  h.service.syncNow();
  await h.runNextTimer();

  assert.equal(h.fallbackCalls.length, 0);
  assert.equal(h.sharedSends.length, 0);
});

test("a complete snapshot observed before delivery is sent once and never retransmitted by polling", async () => {
  const trackUri = "spotify:track:fixture";
  const h = createHarness({snapshot: completeSnapshot(trackUri)});

  await h.runNextTimer();
  assert.equal(h.fallbackCalls.length, 0);
  assert.equal(h.sharedSends.length, 1);
  assert.equal(h.overlay.lastDeliveredUri, trackUri);

  h.service.syncNow();
  await h.runNextTimer();
  assert.equal(h.sharedSends.length, 1);
  assert.equal(h.fallbackCalls.length, 0);
});

test("an active page may finish its incomplete presentation during bounded grace without an AI duplicate", async () => {
  const trackUri = "spotify:track:fixture";
  const h = createHarness({
    pathname: "/ivLyrics",
    overlayDelivered: trackUri,
    snapshot: incompleteSnapshot(trackUri),
  });

  await h.runNextTimer();
  assert.equal(h.fallbackCalls.length, 0);
  assert.ok(h.timers.size > 0, "active producer should remain observable while incomplete");

  await h.runNextTimer();
  assert.equal(h.fallbackCalls.length, 0);
  await h.advance(10000, 20);
  assert.equal(h.fallbackCalls.length, 0, "an existing incomplete page snapshot remains the producer's responsibility");
  await h.advance(10000, 20);
  assert.equal(h.fallbackCalls.length, 0, "polling an incomplete active page must not start an AI request");
});

test("active page keeps watching after original delivery and hands off its completed snapshot once", async () => {
  const trackUri = "spotify:track:fixture";
  const h = createHarness({
    pathname: "/ivLyrics",
    overlayDelivered: trackUri,
    snapshot: incompleteSnapshot(trackUri),
  });

  await h.runNextTimer();
  assert.equal(h.fallbackCalls.length, 0);
  assert.ok(h.timers.size > 0, "original delivery must not end an active-page watch");

  h.publish(completeSnapshot(trackUri));
  await h.runNextTimer();
  assert.equal(h.fallbackCalls.length, 0);
  assert.equal(h.sharedSends.length, 0, "a complete snapshot already delivered by the page needs no retransmit");

  h.service.syncNow();
  await h.runNextTimer();
  assert.equal(h.sharedSends.length, 0, "completed snapshot polling must not retransmit");
});

test("leaving after an original-only fallback has started waits for it before translated takeover", async () => {
  const original = deferred();
  const translated = deferred();
  const h = createHarness({
    pathname: "/ivLyrics",
    getFullLyricsResult: (_trackInfo, options) => options.skipTranslation
      ? original.promise
      : translated.promise,
  });

  await h.runNextTimer();
  await h.advance(10000, 20);
  assert.deepEqual(h.fallbackCalls.map(({options}) => options.skipTranslation), [true]);

  await h.releaseOwner();
  const handoffRun = h.runNextTimer();
  await flush();
  assert.deepEqual(h.fallbackCalls.map(({options}) => options.skipTranslation), [true],
    "translated fallback must wait while the same-URI original request is pending");

  original.resolve({ok: true});
  await handoffRun;
  await flush();
  for (let attempts = 0; h.fallbackCalls.length < 2 && attempts < 3; attempts++) {
    if (!h.timers.size) break;
    await h.runNextTimer();
  }
  assert.deepEqual(h.fallbackCalls.map(({options}) => options.skipTranslation), [true, false]);

  translated.resolve({ok: true});
  await flush();
  assert.equal(h.fallbackCalls.filter(({options}) => options.skipTranslation === false).length, 1);
});

test("route history release schedules immediate translated takeover after an active page unmounts", async () => {
  const trackUri = "spotify:track:fixture";
  const h = createHarness({
    pathname: "/ivLyrics",
    overlayDelivered: trackUri,
    snapshot: incompleteSnapshot(trackUri),
  });

  await h.runNextTimer();
  assert.equal(h.fallbackCalls.length, 0);

  await h.navigate("/home");
  assert.ok([...h.timers.values()].some((timer) => timer.ms === 0), "route release should schedule immediately");
  await h.runNextTimer();

  assert.equal(h.fallbackCalls.length, 1);
  assert.equal(h.fallbackCalls[0].options.skipTranslation, false);
});

test("explicit presentation-owner release event triggers the same immediate handoff", async () => {
  const trackUri = "spotify:track:fixture";
  const h = createHarness({
    pathname: "/ivLyrics",
    snapshot: incompleteSnapshot(trackUri),
  });

  await h.runNextTimer();
  assert.equal(h.fallbackCalls.length, 0);

  // The producer may emit its release signal before Spotify's pathname has
  // settled; the release event itself is the ownership boundary.
  await h.releaseOwner();
  assert.ok([...h.timers.values()].some((timer) => timer.ms === 0), "owner release event should schedule immediately");
  await h.runNextTimer();

  assert.equal(h.fallbackCalls.length, 1);
  assert.equal(h.fallbackCalls[0].options.skipTranslation, false);
});

test("a newly mounted owner on the same route survives the previous owner's release until it unmounts", async () => {
  const trackUri = "spotify:track:fixture";
  const h = createHarness({
    pathname: "/ivLyrics",
    overlayDelivered: trackUri,
    snapshot: incompleteSnapshot(trackUri),
  });
  const oldPage = {_isComponentMounted: true};
  h.window.lyricContainer = oldPage;

  await h.runNextTimer();
  oldPage._isComponentMounted = false;
  await h.releaseOwner();

  const newPage = {_isComponentMounted: true};
  publishRuntimeService("lyricContainer", newPage, h.window);
  h.window.lyricContainer = oldPage;
  await h.runNextTimer();
  assert.equal(h.fallbackCalls.length, 0, "the replacement owner must suppress takeover on the same route");
  assert.ok(h.timers.size > 0, "the replacement owner should keep the incomplete snapshot under watch");

  newPage._isComponentMounted = false;
  await h.releaseOwner();
  await h.runNextTimer();
  assert.equal(h.fallbackCalls.length, 1);
  assert.equal(h.fallbackCalls[0].options.skipTranslation, false);
});

test("enabled senders without a connected consumer do not start fallback or shared requests", async () => {
  const trackUri = "spotify:track:fixture";
  const h = createHarness({
    helperEnabled: true,
    overlayConnected: false,
    helperConnected: false,
    snapshot: incompleteSnapshot(trackUri),
  });

  await h.runNextTimer();

  assert.equal(h.fallbackCalls.length, 0);
  assert.equal(h.sharedSends.length, 0);
  assert.equal(h.timers.size, 0);
});

test("song switches do not let a stale chain block the new track and dedupe its in-flight fallback", async () => {
  const firstUri = "spotify:track:first";
  const secondUri = "spotify:track:second";
  const pending = new Map();
  const h = createHarness({
    initialUri: firstUri,
    getFullLyricsResult: (trackInfo) => {
      const request = deferred();
      pending.set(trackInfo.uri, request);
      return request.promise;
    },
  });

  await h.runNextTimer();
  assert.deepEqual(h.fallbackCalls.map(({trackInfo}) => trackInfo.uri), [firstUri]);

  await h.switchTrack(secondUri);
  await h.runNextTimer();
  assert.deepEqual(h.fallbackCalls.map(({trackInfo}) => trackInfo.uri), [
    firstUri,
    secondUri,
  ]);

  h.service.syncNow();
  await h.runNextTimer();
  h.service.syncNow();
  await h.runNextTimer();
  assert.deepEqual(h.fallbackCalls.map(({trackInfo}) => trackInfo.uri), [
    firstUri,
    secondUri,
  ], "repeated scheduling shares the second track's in-flight request");

  pending.get(firstUri)?.resolve({stale: true});
  pending.get(secondUri)?.resolve({ok: true});
  await flush();
  assert.equal(h.service.getState().inFlight, false);
});

test("destroy removes player, window, history and pending timer listeners", async () => {
  const h = createHarness({snapshot: incompleteSnapshot("spotify:track:fixture")});
  assert.ok(h.timers.size > 0);
  assert.equal(h.player.listenerCount("songchange"), 1);
  assert.equal(h.window.listenerCount("ivLyrics:shared-lyrics-updated"), 1);
  assert.equal(h.window.listenerCount("ivLyrics:presentation-owner-released"), 1);
  assert.equal(h.window.listenerCount(LYRICS_PROVIDER_SELECTION_CHANGED), 1);
  assert.equal(h.historyListeners.size, 1);

  h.service.destroy();
  h.service.destroy();
  assert.equal(h.timers.size, 0);
  assert.equal(h.player.listenerCount("songchange"), 0);
  assert.equal(h.window.listenerCount("ivLyrics:shared-lyrics-updated"), 0);
  assert.equal(h.window.listenerCount("ivLyrics:presentation-owner-released"), 0);
  assert.equal(h.window.listenerCount(LYRICS_PROVIDER_SELECTION_CHANGED), 0);
  assert.equal(h.historyListeners.size, 0);

  h.player.dispatchEvent({type: "songchange"});
  h.window.dispatchEvent({type: "ivLyrics:presentation-owner-released"});
  assert.equal(h.timers.size, 0);
  assert.equal(h.fallbackCalls.length, 0);
});

test("provider settings replace a delivered result and a pending fallback with the page closed", async () => {
  const trackUri = "spotify:track:fixture";
  const h = createHarness({ overlayDelivered: trackUri });
  const invalidated = [];
  h.overlay.invalidateLyricsPresentation = () => {
    h.overlay.lastDeliveredUri = null;
    invalidated.push(trackUri);
  };
  let revision = 0;
  h.window.LyricsService.getLyricsRequestRevision = () => revision;
  await h.runNextTimer();
  assert.equal(h.fallbackCalls.length, 0);

  const change = () => {
    revision++;
    h.window.dispatchEvent({ type: LYRICS_PROVIDER_SELECTION_CHANGED });
  };
  change();
  await h.runDueTimers();
  assert.equal(h.fallbackCalls.length, 1);
  const obsolete = h.pendingFallbacks.get(trackUri);
  change();
  await h.runDueTimers();
  assert.equal(h.fallbackCalls.length, 2);
  assert.deepEqual(invalidated, [trackUri, trackUri]);
  const current = h.pendingFallbacks.get(trackUri);
  obsolete.resolve();
  await flush();
  assert.equal(h.service.getState().inFlight, true);
  current.resolve();
  await flush();
  assert.equal(h.service.getState().inFlight, false);
});

test("deleting the playing song's saved lyrics refreshes overlay fallback without a presentation owner", async () => {
  const trackUri = "spotify:local:Artist:Album:Track:180";
  const h = createHarness({ initialUri: trackUri, overlayDelivered: trackUri });
  let invalidated = 0;
  h.overlay.invalidateLyricsPresentation = () => {
    invalidated++;
    h.overlay.lastDeliveredUri = null;
  };
  await h.runNextTimer();
  assert.equal(h.fallbackCalls.length, 0);

  const deletion = uri => h.window.dispatchEvent({
    type: LOCAL_LYRICS_UPDATED_EVENT, detail: { trackUri: uri, deleted: true },
  });
  deletion("spotify:local:Artist:Album:Other:45");
  assert.equal(await h.runDueTimers(), 0);
  assert.equal(invalidated, 0);

  deletion(trackUri);
  await h.runDueTimers();
  assert.equal(invalidated, 1);
  assert.equal(h.fallbackCalls.length, 1);
  assert.equal(h.fallbackCalls[0].trackInfo.uri, trackUri);
  h.pendingFallbacks.get(trackUri).resolve();
  await flush();
});

test("publishing the playing song refreshes both connected senders when the page and panel are closed", async () => {
  const trackUri = "spotify:track:fixture";
  const h = createHarness({
    overlayDelivered: trackUri, helperEnabled: true, helperConnected: true, helperDelivered: trackUri,
  });
  const invalidated = [];
  for (const sender of [h.overlay, h.helper]) {
    sender.invalidateLyricsPresentation = function () {
      this.lastDeliveredUri = null;
      invalidated.push(this.name);
    };
  }
  await h.runNextTimer();
  assert.equal(h.fallbackCalls.length, 0);

  const publish = detail => h.window.dispatchEvent({ type: "ivLyrics:sync-data-updated", detail });
  publish({ trackUri: "spotify:track:other", trackId: "fixture" });
  publish({});
  assert.equal(await h.runDueTimers(), 0);
  assert.deepEqual(invalidated, []);

  publish({ trackId: "fixture" });
  await h.runDueTimers();
  assert.deepEqual(invalidated, ["overlay", "helper"]);
  assert.equal(h.fallbackCalls.length, 1);
  const prior = h.fallbackCalls[0];
  const priorFallback = h.pendingFallbacks.get(trackUri);
  assert.equal(prior.trackInfo.uri, trackUri);
  assert.equal(prior.options.isRequestCurrent(), true);

  publish({ trackUri });
  await h.runDueTimers();
  assert.equal(prior.options.isRequestCurrent(), false);
  assert.equal(h.fallbackCalls.length, 2);
  const current = h.fallbackCalls[1];
  assert.equal(current.options.isRequestCurrent(), true);

  priorFallback.resolve();
  h.pendingFallbacks.get(trackUri).resolve();
  await flush();
});
