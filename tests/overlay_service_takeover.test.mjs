import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../OverlayService.js", import.meta.url), "utf8");
const indexSource = readFileSync(new URL("../index.js", import.meta.url), "utf8");

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
} = {}) => {
  const trace = [];
  const timers = new Map();
  const snapshots = new Map();
  const fallbackCalls = [];
  const sharedSends = [];
  const pendingFallbacks = new Map();
  const clock = {now: 0};
  let nextTimerId = 0;
  let currentTrack = trackFor(initialUri);

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
    sendLyrics() {
      trace.push(["send", name]);
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
            }
          }
          return true;
        },
      },
      Utils: {
        getPlayerPlaybackSnapshot: () => ({uri: currentTrack.uri}),
        resolveStablePlaybackTrack: () => currentTrack,
      },
    }),
    Spicetify: {Player: player, Platform: {History: history}},
    document,
    Date: {now: () => clock.now},
    setTimeout: setTimeoutInHarness,
    clearTimeout: clearTimeoutInHarness,
    console,
  });

  vm.runInContext(source, context);

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
    sharedSends,
    switchTrack,
    timers,
    trace,
    window,
  };
};

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

test("production mount prefix cleans the previous page before marking the replacement active", () => {
  const mountStart = indexSource.indexOf("  componentDidMount() {");
  const mountEnd = indexSource.indexOf("    this._unsubscribeLyricsProviderAttempt =", mountStart);
  const unmountStart = indexSource.indexOf("  componentWillUnmount() {");
  const unmountEnd = indexSource.indexOf("    // Core cleanup", unmountStart);
  assert.ok(mountStart >= 0 && mountEnd > mountStart);
  assert.ok(unmountStart >= 0 && unmountEnd > unmountStart);

  const mountPrefix = indexSource.slice(
    mountStart + "  componentDidMount() {".length,
    mountEnd,
  );
  const unmountPrefix = indexSource.slice(
    unmountStart + "  componentWillUnmount() {".length,
    unmountEnd,
  );
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
  const oldPage = {_isComponentMounted: true, _lyricsEditRequestSeq: 0};
  const context = vm.createContext({window: {lyricContainer: oldPage}, document});
  vm.runInContext(`
    globalThis.mountPrefix = function() {${mountPrefix}\n};
    globalThis.unmountPrefix = function() {${unmountPrefix}\n};
  `, context);
  oldPage.componentWillUnmount = context.unmountPrefix;
  const newPage = {};
  context.mountPrefix.call(newPage);

  assert.deepEqual(trace, [["remove", "ivlyrics-page-active"], ["add", "ivlyrics-page-active"]]);
  assert.equal(oldPage._isComponentMounted, false);
  assert.equal(newPage._isComponentMounted, true);
  assert.equal(context.window.lyricContainer, newPage);
  assert.equal(activeClasses.has("ivlyrics-page-active"), true);
});

test("home takeover starts translated fallback when the page snapshot is incomplete despite original delivery", async () => {
  const trackUri = "spotify:track:fixture";
  const h = createHarness({
    overlayDelivered: trackUri,
    snapshot: incompleteSnapshot(trackUri),
  });

  await h.runNextTimer();

  assert.equal(h.fallbackCalls.length, 1);
  assert.equal(h.fallbackCalls[0].trackInfo.uri, trackUri);
  assert.equal(h.fallbackCalls[0].options.skipTranslation, false);
  assert.equal(h.sharedSends.length, 0);
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
  h.window.lyricContainer = newPage;
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
  assert.equal(h.historyListeners.size, 1);

  h.service.destroy();
  h.service.destroy();
  assert.equal(h.timers.size, 0);
  assert.equal(h.player.listenerCount("songchange"), 0);
  assert.equal(h.window.listenerCount("ivLyrics:shared-lyrics-updated"), 0);
  assert.equal(h.window.listenerCount("ivLyrics:presentation-owner-released"), 0);
  assert.equal(h.historyListeners.size, 0);

  h.player.dispatchEvent({type: "songchange"});
  h.window.dispatchEvent({type: "ivLyrics:presentation-owner-released"});
  assert.equal(h.timers.size, 0);
  assert.equal(h.fallbackCalls.length, 0);
});
