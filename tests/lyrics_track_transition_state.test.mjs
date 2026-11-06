import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../index.js", import.meta.url), "utf8");
const { resolveStablePlayerItem } = createRequire(import.meta.url)("../PlaybackClock.js");
const extractMethod = (name) => {
  const start = source.search(new RegExp(`^  (?:async )?${name}\\(`, "m"));
  assert.ok(start >= 0, name);
  const next = source.slice(start + 1).search(/^  (?:async )?\w+\(/m);
  assert.ok(next >= 0, `end of ${name}`);
  return source.slice(start, start + 1 + next);
};
const names = [
  "isCurrentLyricsUri", "isCurrentLyricsState", "getLyricsLayoutHasLyrics",
  "getLoadingLyricsState", "fetchLyrics", "resolveLyricsForMode",
  "isPlaybackUriCurrent", "beginPlaybackTrackTransition",
  "clearPlaybackTrackResolutionTimer", "schedulePlaybackTrackResolution", "commitResolvedPlaybackTrack",
  "publishLyricsPresentation",
];
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};
const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};
const track = (id) => ({ uri: `spotify:track:${id}`, title: id, artist: "Artist" });
const lines = (text) => [{ text, startTime: 1000 }];

// Execute the production state/fetch methods. Collaborators model delayed
// provider requests, shared snapshots and playback identity independently.
const createHarness = () => {
  const requests = [];
  const snapshots = new Map();
  const publications = [];
  const presentations = [];
  const timers = new Map();
  let nextTimer = 0;
  let now = 0;
  let currentTrack = track("old");
  let stableTrack;
  const emptyState = vm.runInNewContext(`(${source.match(/const emptyState = (\{[\s\S]*?\n\});/)[1]})`);
  const config = { modes: ["karaoke", "synced", "unsynced"], visual: {} };
  const context = vm.createContext({
    console, emptyState, CONFIG: config, SYNCED: 1, CACHE: {},
    Utils: { extractTrackId: uri => uri?.split(":").at(-1), detectLanguage: () => "en" },
    Spicetify: { Player: { data: { item: currentTrack } } },
    getLyricsDataMode: mode => mode,
    getLyricsModeTypeKey: mode => config.modes[mode],
    isLyricsRenderCacheCurrent: () => true,
    hasInstrumentalMarker: lyrics => lyrics.some(line => line.text === "Instrumental"),
    getCurrentTranslationTargetLanguage: () => "ko",
    getCurrentLyricsPronunciationNotation: () => "translation",
    getNonSectionLyricsText: lyrics => lyrics.map(line => line.text).join("\n"),
    TrackBackgroundDB: { getOverride: async () => null },
    Date: { now: () => now },
    setTimeout(callback) { timers.set(++nextTimer, callback); return nextTimer; },
    clearTimeout(id) { timers.delete(id); },
    window: {
      Translator: { clearInflightRequests() {} },
      Utils: {
        getPlayerPlaybackSnapshot: () => ({ uri: currentTrack.uri }),
        resolveStablePlaybackTrack: (candidate, snapshot) => stableTrack !== undefined
          ? stableTrack
          : resolveStablePlayerItem(context.Spicetify.Player.data, snapshot, candidate),
      },
      ivLyricsPresentationPublisher: { publishLyricsReady: detail => presentations.push(detail) },
      LyricsService: {
        getTrackLanguageOverride: async () => null,
        getTrackLyricsProviderOverride: async () => null,
        getLyricsSnapshot: uri => snapshots.get(uri),
        publishLyricsSnapshot: snapshot => publications.push(snapshot),
        getLyricsFromProviders(info) {
          const pending = deferred();
          requests.push({ info, ...pending });
          return pending.promise;
        },
      },
    },
  });
  vm.runInContext(`class Container {\n${names.map(extractMethod).join("\n")}\n}\nglobalThis.Container = Container;`, context);
  const container = new context.Container();
  Object.assign(container, {
    state: {
      ...emptyState, ...currentTrack, synced: lines("Old lyric"),
      currentLyrics: lines("Old lyric"), lyricsDisplayUri: currentTrack.uri,
      isLoading: false, lyricsStatus: "ready", lockedMode: -1, explicitMode: -1,
    },
    currentTrackUri: currentTrack.uri,
    _lyricsFetchSeq: 0, _activeLyricsFetchSeq: 0, _lyricsTransitionSeq: 0,
    _playbackTrackResolutionSeq: 0, _isComponentMounted: true,
    setState(patch, callback) { this.state = { ...this.state, ...patch }; callback?.(); },
    infoFromTrack: value => value,
    clearPendingLyricsUpdates() {}, closeLyricsEditModal() {},
    lyricsSaved: () => false,
    fetchMetadataTranslation() {}, fetchColors() {}, fetchTempo() {}, resetDelay() {},
    loadSavedVideoForTrack() {},
    startLyricsLoading: () => 1, clearLyricsLoading() {},
    getCurrentMode: () => 1,
    isModeAvailable: () => false,
    getAutomaticMode: state => state.karaoke?.length ? 0 : state.synced?.length ? 1 : state.unsynced?.length ? 2 : -1,
    applyTranslationStates: () => ({}),
    getTranslationTargetLanguage: () => "ko",
  });
  return {
    container, context, requests, snapshots, publications, presentations, timers,
    play(nextTrack) { currentTrack = nextTrack; stableTrack = undefined; context.Spicetify.Player.data.item = nextTrack; },
    updateSnapshot(nextTrack) { currentTrack = nextTrack; stableTrack = undefined; },
    resolvePlayback(value) { stableTrack = value; },
    advance(ms) { now += ms; const pending = [...timers.values()]; timers.clear(); pending.forEach(callback => callback()); },
  };
};

test("loading carries only fullscreen layout, never outgoing lyric data or display identity", () => {
  const h = createHarness();
  const c = h.container;
  c.state.karaoke = lines("Old karaoke");
  c.beginPlaybackTrackTransition(track("next"));
  assert.equal(c.getLyricsLayoutHasLyrics(), true);
  for (const name of ["karaoke", "synced", "unsynced"]) assert.equal(c.state[name], null);
  assert.equal(c.state.currentLyrics.length, 0);
  assert.equal(c.state.lyricsDisplayUri, null);
  c.setState(c.getLoadingLyricsState(track("next"), 2));
  c.setState(c.getLoadingLyricsState(track("third"), 3));
  assert.equal(c.getLyricsLayoutHasLyrics(), true, "rapid skips preserve the original layout");
  assert.equal(c.state.lyricsDisplayUri, track("third").uri);
  assert.equal(c.state.currentLyrics.length, 0);
  c.setState({ isLoading: false, lyricsStatus: "empty" });
  assert.equal(c.getLyricsLayoutHasLyrics(), false, "confirmed empty releases the old layout");
});

test("a display-only shared snapshot cannot inherit outgoing karaoke or suppress fresh lyrics", async () => {
  const h = createHarness();
  const next = track("next");
  h.container.state.karaoke = lines("Old karaoke");
  h.snapshots.set(next.uri, { trackUri: next.uri, displayLyrics: lines("Incoming snapshot") });
  h.play(next);
  const completion = h.container.fetchLyrics(next);
  assert.equal(h.container.state.currentLyrics[0].text, "Incoming snapshot");
  assert.equal(h.container.state.karaoke, null);
  assert.equal(h.container.state.lyricsDisplayUri, next.uri);
  await flush();
  h.requests[0].resolve({ uri: next.uri, provider: "fixture", synced: lines("Incoming lyric") });
  await completion;
  assert.equal(h.container.state.currentLyrics[0].text, "Incoming lyric");
  assert.equal(h.container.state.karaoke, null);
  assert.equal(h.container.state.isLoading, false);
  assert.equal(h.container.state.lyricsStatus, "ready");
  assert.equal(h.container.state.lyricsDisplayUri, next.uri);
});

for (const [storedProvider, expected] of [["removed-provider", null], ["open-lyrics", "open-lyrics"]]) {
  test(`track selection ${storedProvider} resolves only against registered providers`, async () => {
    const h = createHarness(), next = track("provider-identity");
    h.context.window.LyricsAddonManager = { getAddon: id => id === "open-lyrics" ? { id } : null };
    h.context.window.LyricsService.getTrackLyricsProviderOverride = async () => storedProvider;
    h.play(next);
    const completion = h.container.fetchLyrics(next);
    await flush();
    assert.equal(h.container.trackLyricsProviderOverride, expected);
    h.requests[0].resolve({ uri: next.uri, provider: "fixture", synced: lines("Incoming lyric") });
    await completion;
    assert.equal(h.container.state.lyricsStatus, "ready");
  });
}

for (const staleOutcome of ["resolve", "reject"]) {
  test(`a late ${staleOutcome} from a skipped song cannot hide, replace or publish over the current lyrics`, async () => {
    const h = createHarness();
    const first = track("first");
    const second = track("second");
    h.play(first);
    const oldCompletion = h.container.fetchLyrics(first);
    await flush();
    h.play(second);
    const completion = h.container.fetchLyrics(second);
    await flush();
    h.requests[1].resolve({ uri: second.uri, provider: "fixture", synced: lines("Current lyric") });
    await completion;
    if (staleOutcome === "resolve") h.requests[0].resolve({ uri: first.uri, provider: "fixture", karaoke: lines("Stale lyric") });
    else h.requests[0].reject(new Error("Stale provider failure"));
    await oldCompletion;
    assert.equal(h.container.state.currentLyrics[0].text, "Current lyric");
    assert.equal(h.container.state.uri, second.uri);
    assert.equal(h.container.state.lyricsDisplayUri, second.uri);
    assert.equal(h.container.state.isLoading, false);
    assert.deepEqual(h.publications.map(item => item.trackUri), [second.uri]);
    h.container.publishLyricsPresentation(lines("Stale translation"), { uri: first.uri });
    assert.equal(h.presentations.length, 0);
  });
}

test("instrumental and failed requests clear lyric data and finish the pending layout", async () => {
  for (const failure of [false, true]) {
    const h = createHarness();
    const next = track("empty");
    h.play(next);
    const completion = h.container.fetchLyrics(next);
    await flush();
    if (failure) h.requests[0].reject(new Error("Provider unavailable"));
    else h.requests[0].resolve({ uri: next.uri, provider: "fixture", synced: lines("Instrumental") });
    await completion;
    assert.equal(h.container.state.isLoading, false);
    assert.equal(h.container.state.lyricsStatus, "empty");
    assert.equal(h.container.state.synced, null);
    assert.equal(h.container.state.currentLyrics?.length || 0, 0);
    assert.equal(h.container.getLyricsLayoutHasLyrics(), false);
  }
});

test("refreshing the same URI cannot be overwritten by the earlier provider request", async () => {
  const h = createHarness();
  const sameTrack = track("old");
  const oldCompletion = h.container.fetchLyrics(sameTrack);
  await flush();
  const completion = h.container.fetchLyrics(sameTrack, -1, true);
  await flush();
  h.requests[1].resolve({ uri: sameTrack.uri, provider: "fixture", synced: lines("Updated lyric") });
  await completion;
  const activeRequest = h.container.state.lyricsRequestSeq;
  h.requests[0].resolve({ uri: sameTrack.uri, provider: "fixture", synced: lines("Obsolete lyric") });
  await oldCompletion;
  assert.equal(h.container.state.currentLyrics[0].text, "Updated lyric");
  assert.equal(h.container.state.lyricsRequestSeq, activeRequest);
  assert.equal(h.container.state.isLoading, false);
  assert.equal(h.publications.length, 1);
});

test("loading from a genuinely empty song keeps its centered layout until new lyrics arrive", async () => {
  const h = createHarness();
  h.container.setState({ synced: [], currentLyrics: [], lyricsStatus: "empty" });
  const next = track("next");
  h.play(next);
  const completion = h.container.fetchLyrics(next);
  await flush();
  assert.equal(h.container.getLyricsLayoutHasLyrics(), false);
  h.requests[0].resolve({ uri: next.uri, provider: "fixture", synced: lines("Incoming lyric") });
  await completion;
  assert.equal(h.container.getLyricsLayoutHasLyrics(), true);
});

test("a songchange without metadata resumes the current track instead of stranding it in loading", () => {
  const h = createHarness();
  const calls = [];
  h.container.fetchLyrics = (...args) => calls.push(args);
  h.container.schedulePlaybackTrackResolution(null);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0].uri, track("old").uri);
  assert.equal(h.timers.size, 1, "keep observing in case the item update follows songchange");
  h.advance(100);
  h.advance(100);
  assert.equal(calls.length, 1, "the same current track is recovered only once");
  h.advance(4000);
  assert.equal(h.timers.size, 0);
});

test("a cancelled skip resolves back to the original song with a fresh request", () => {
  const h = createHarness();
  const calls = [];
  h.container.fetchLyrics = (...args) => calls.push(args);
  h.resolvePlayback(null);
  h.container.schedulePlaybackTrackResolution(track("cancelled"));
  assert.equal(h.container.state.currentLyrics.length, 0);
  h.resolvePlayback(track("old"));
  h.advance(100);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0].uri, track("old").uri);
  assert.equal(h.timers.size, 1);
  h.advance(4000);
  assert.equal(calls.length, 1);
  assert.equal(h.timers.size, 0);
});

for (const eventTrackId of ["next", "old", null]) {
  test(`a single songchange with ${eventTrackId || "missing"} metadata observes the delayed player item`, async () => {
    const h = createHarness();
    const next = track("next");
    h.container.schedulePlaybackTrackResolution(eventTrackId ? track(eventTrackId) : null);
    await flush();
    assert.equal(h.container.currentTrackUri, track("old").uri,
      "the real playback resolver still sees the old public item and snapshot");
    assert.equal(h.timers.size, 1);
    h.advance(100);
    await flush();
    assert.equal(h.requests.length, eventTrackId === "old" ? 0 : 1,
      "same-URI recovery does not refetch on each resolution poll");
    h.play(next);
    h.advance(100);
    await flush();
    const incoming = h.requests.find(request => request.info.uri === next.uri);
    assert.ok(incoming, "the delayed item starts the new track without another songchange");
    incoming.resolve({ uri: next.uri, provider: "fixture", synced: lines("New track lyric") });
    await flush();
    const recovered = h.requests.find(request => request.info.uri === track("old").uri);
    recovered?.resolve({ uri: track("old").uri, provider: "fixture", synced: lines("Late recovered lyric") });
    await flush();
    assert.equal(h.container.state.uri, next.uri);
    assert.equal(h.container.state.currentLyrics[0].text, "New track lyric");
    assert.equal(h.container.state.isLoading, false);
    assert.equal(h.timers.size, 0);
    assert.deepEqual(h.publications.map(item => item.trackUri), [next.uri]);
  });
}

test("a new snapshot invalidates the recovered old track while its public item is still delayed", async () => {
  const h = createHarness();
  const next = track("next");
  h.container.schedulePlaybackTrackResolution(next);
  await flush();
  const recovered = h.requests[0];
  assert.equal(recovered.info.uri, track("old").uri);
  h.updateSnapshot(next);
  h.advance(100);
  assert.equal(h.container.state.currentLyrics.length, 0);
  assert.equal(h.container.state.isLoading, true);
  recovered.resolve({ uri: track("old").uri, provider: "fixture", synced: lines("Late old lyric") });
  await flush();
  assert.equal(h.container.state.currentLyrics.length, 0);
  assert.equal(h.publications.length, 0);
  h.play(next);
  h.advance(100);
  await flush();
  h.requests[1].resolve({ uri: next.uri, provider: "fixture", synced: lines("Current lyric") });
  await flush();
  assert.equal(h.container.state.currentLyrics[0].text, "Current lyric");
  assert.equal(h.container.state.isLoading, false);
  assert.equal(h.timers.size, 0);
});

test("an unresolved transition releases loading without exposing retained lyrics", () => {
  const h = createHarness();
  h.resolvePlayback(null);
  h.container.schedulePlaybackTrackResolution(track("unknown"));
  h.advance(4100);
  assert.equal(h.container.state.isLoading, false);
  assert.equal(h.container.state.lyricsStatus, "empty");
  assert.equal(h.container.state.currentLyrics, null);
  assert.equal(h.container.getLyricsLayoutHasLyrics(), false);
  assert.equal(h.timers.size, 0);
});
