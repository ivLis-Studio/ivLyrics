import { createPageLyricsPresenter } from "../src/lyrics/pageLyricsPresenter.mjs";
import { publishLyricsReady } from "#ivlyrics/lyrics/lyricsReadyPublisher.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import { createLyricsPagePlayback } from "../src/spicetify/lyricsPagePlayback.mjs";
import { createLyricsPageLifecycle } from "../src/spicetify/lyricsPageLifecycle.mjs";
import { getRuntimeService as getAppService } from "../src/spicetify/runtimeServices.mjs";
import { readMarketplaceManager as readAppMarketplaceManager } from "../src/features/marketplace/marketplaceRuntime.mjs";
import { getPlaybackPositionService } from "../src/core/playbackPositionService.mjs";
import { getTrackOverrideStores } from "../src/core/trackOverrideRuntime.mjs";
import { createPageLyricsDataLoader } from "../src/lyrics/pageLyricsDataLoader.mjs";
import { createPageLyricsLoad } from "../src/lyrics/createPageLyricsLoad.mjs";
import { createPageTrackPreferences } from "../src/lyrics/pageTrackPreferences.mjs";
import { createToolbarTranslationPreferences } from "../src/app/toolbar/toolbarTranslationPreferences.mjs";
import { buildLyricsLoadingState, emptyLyricsState as emptyState, hasLyricsLayout } from "../src/lyrics/pageLyricsLoadState.mjs";

const source = readFileSync(new URL("../src/spicetify/index.js", import.meta.url), "utf8");
const { resolveStablePlayerItem } = createRequire(import.meta.url)("../src/core/PlaybackClock.js");
const extractMethod = (name) => {
  const start = source.search(new RegExp(`^  (?:async )?${name}\\(`, "m"));
  assert.ok(start >= 0, name);
  const next = source.slice(start + 1).search(/^  (?:async )?\w+\(/m);
  assert.ok(next >= 0, `end of ${name}`);
  return source.slice(start, start + 1 + next);
};
const names = [
  "beginLyricsLoadRequest", "isCurrentLyricsUri", "isCurrentLyricsState", "getLyricsLayoutHasLyrics",
  "getLoadingLyricsState", "createPageLyricsDataLoader", "fetchLyrics", "resolveLyricsForMode",
  "isPlaybackUriCurrent",
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
  let djNarration = false;
  let stableTrack;
  const config = { modes: ["karaoke", "synced", "unsynced"], visual: {} };
  const context = vm.createContext({
    console, emptyState, CONFIG: config, SYNCED: 1, CACHE: {}, getPlaybackPositionService, getAppService, publishLyricsReady,
    createPageLyricsDataLoader, buildLyricsLoadingState, hasLyricsLayout, readAppMarketplaceManager,
    Utils: { extractTrackId: uri => uri?.startsWith("spotify:track:") ? uri.split(":").at(-1) : null, detectLanguage: () => "en" },
    Spicetify: { Player: { data: { item: currentTrack } } },
    getLyricsDataMode: mode => mode,
    getLyricsModeTypeKey: mode => config.modes[mode],
    isLyricsRenderCacheCurrent: () => true,
    getCurrentTranslationTargetLanguage: () => "ko",
    getCurrentLyricsPronunciationNotation: () => "translation",
    getNonSectionLyricsText: lyrics => lyrics.map(line => line.text).join("\n"),
    Date: { now: () => now },
    setTimeout(callback) { timers.set(++nextTimer, callback); return nextTimer; },
    clearTimeout(id) { timers.delete(id); },
    window: {
      TrackLanguageDB: { getLanguage: async () => null },
      TrackLyricsProviderDB: { getProvider: async () => null },
      TrackBackgroundDB: { getOverride: async () => null },
      Translator: { clearInflightRequests() {} },
      Utils: {
        getPlayerPlaybackSnapshot: () => ({ uri: currentTrack?.uri, djNarration }),
        resolveStablePlaybackTrack: (candidate, snapshot) => stableTrack !== undefined
          ? stableTrack
          : resolveStablePlayerItem(context.Spicetify.Player.data, snapshot, candidate),
      },
      CustomEvent: class { constructor(type, { detail }) { this.type = type; this.detail = detail; } },
      dispatchEvent(event) { if (event.type === "ivLyrics:lyrics-ready") presentations.push(event.detail); },
      LyricsService: {
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
  const trackOverrides = getTrackOverrideStores(context.window, { logger: { warn() {} } });
  context.fetchLyricsForTrack = createPageLyricsLoad({
    extractTrackId: context.Utils.extractTrackId,
    getLyricsService: () => getAppService("LyricsService", context.window),
    getLyricsAddonManager: () => getAppService("LyricsAddonManager", context.window),
    readStoredTrackLanguage: trackOverrides.readLanguage,
    readStoredTrackProvider: trackOverrides.readProvider,
    readStoredTrackBackground: trackOverrides.readBackground,
    getVisualSettings: () => config.visual,
    getModeKey: context.getLyricsModeTypeKey,
    syncedMode: context.SYNCED,
    detectLanguage: context.Utils.detectLanguage,
    getTargetLanguage: context.getCurrentTranslationTargetLanguage,
    getPronunciationNotation: context.getCurrentLyricsPronunciationNotation,
    getTranslationStyle: () => "natural",
    getSourceText: context.getNonSectionLyricsText,
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
    _isComponentMounted: true,
    setState(update, callback) {
      const patch = typeof update === "function" ? update(this.state) : update;
      if (patch) this.state = { ...this.state, ...patch };
      callback?.();
    },
    infoFromTrack: value => value,
    clearPendingLyricsUpdates() {}, closeLyricsEditModal() {},
    lyricsSaved: () => false, getSavedLocalLyrics: () => null,
    fetchMetadataTranslation() {}, fetchColors() {}, fetchTempo() {}, resetDelay() {},
    loadSavedVideoForTrack() { assert.fail("a track transition must leave the saved-video read to the mounted background"); },
    startLyricsLoading: () => 1, clearLyricsLoading() {},
    getCurrentMode: () => 1,
    isModeAvailable: () => false,
    getAutomaticMode: state => state.karaoke?.length ? 0 : state.synced?.length ? 1 : state.unsynced?.length ? 2 : -1,
    applyTranslationStates: () => ({}),
    getTranslationTargetLanguage: () => "ko",
  });
  container.lyricPresenter = createPageLyricsPresenter({
    page: container,
    getCurrentLyricsPronunciationNotation: context.getCurrentLyricsPronunciationNotation,
    getNonSectionLyricsText: context.getNonSectionLyricsText,
    scheduleTimer: context.setTimeout, cancelTimer: context.clearTimeout,
    publishReady: payload => publishLyricsReady(payload, context.window),
  });
  container.playback = createLyricsPagePlayback({
    page: container, emptyState,
    getPlayer: () => context.Spicetify.Player,
    getPlaybackPosition: () => getPlaybackPositionService(context.window),
    extractTrackId: (uri) => context.Utils.extractTrackId(uri),
    getTranslator: () => getAppService("Translator", context.window),
    now: context.Date.now,
    scheduleTimer: context.setTimeout,
    cancelTimer: context.clearTimeout,
  });
  return {
    container, context, requests, snapshots, publications, presentations, timers,
    play(nextTrack) { currentTrack = nextTrack; stableTrack = undefined; context.Spicetify.Player.data.item = nextTrack; },
    updateSnapshot(nextTrack) { currentTrack = nextTrack; stableTrack = undefined; },
    setNarration(value) { djNarration = value; },
    resolvePlayback(value) { stableTrack = value; },
    advance(ms) { now += ms; const pending = [...timers.values()]; timers.clear(); pending.forEach(callback => callback()); },
  };
};

test("loading carries only fullscreen layout, never outgoing lyric data or display identity", () => {
  const h = createHarness();
  const c = h.container;
  c.state.karaoke = lines("Old karaoke");
  c.state.karaokeSource = "lrcred";
  c.state.lrcred = { isrc: "JPAAA2600001" };
  c.state.syncDataApplied = true;
  c.state.furigana = lines("Old reading");
  c.playback.beginPlaybackTrackTransition(track("next"));
  assert.equal(c.getLyricsLayoutHasLyrics(), true);
  for (const name of ["karaoke", "synced", "unsynced"]) assert.equal(c.state[name], null);
  assert.equal(c.state.currentLyrics.length, 0);
  assert.equal(c.state.lyricsDisplayUri, null);
  c.setState(c.getLoadingLyricsState(track("next"), 2));
  assert.equal(c.state.karaokeSource, null);
  assert.equal(c.state.lrcred, null);
  assert.equal(c.state.syncDataApplied, false);
  assert.equal(c.state.furigana, null);
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

test("late provider loading cannot clear a title translation that already committed", async () => {
  const h = createHarness();
  const trackInfo = track("translated");
  const metadata = { translated: { title: "번역 제목" } };
  const providerStart = deferred();
  const providerResult = deferred();
  h.container.fetchMetadataTranslation = uri => {
    assert.equal(uri, trackInfo.uri);
    h.container.setState({ translatedMetadata: metadata });
  };
  h.container.pageLyricsDataLoader = {
    begin() {
      return {
        async read({ onProviderLoad }) {
          await providerStart.promise;
          onProviderLoad();
          assert.equal(h.container.state.translatedMetadata, metadata);
          return providerResult.promise;
        },
        close() {},
      };
    },
  };
  h.play(trackInfo);
  const done = h.container.fetchLyrics(trackInfo);
  await flush();
  assert.equal(h.container.state.translatedMetadata, metadata);
  providerStart.resolve();
  providerResult.resolve({ result: { uri: trackInfo.uri, provider: "fixture", synced: lines("Lyric") } });
  await done;
  assert.equal(h.container.state.translatedMetadata, metadata);
  assert.equal(h.container.state.lyricsStatus, "ready");
});

test("remounting during a lyric load restarts the same track and retires the previous request", async () => {
  const { container: page, context, requests } = createHarness();
  const item = context.Spicetify.Player.data.item;
  const browser = Object.assign(context.window, {
    setTimeout: context.setTimeout,
    clearTimeout: context.clearTimeout,
    document: {
      body: { classList: { add() {}, remove() {} } },
      getElementById: () => null,
      querySelector: () => null,
    },
  });
  let cancelledImports = 0;
  Object.assign(page, {
    getPlaybackPaused: page.playback.getPlaybackPaused,
    cancelPendingLocalLyricsImports() { cancelledImports++; },
    lyricsCacheEditor: { cancelPending() {} },
    generationStatus: { dispose() {} },
    videoBackgroundLoading: { dispose() {} },
    pointerControls: { attach() {} },
    clearFloatingMenuCloseTimer() {},
    restoreWordSyncLoading() {},
    restorePronunciationSyncLoading() {},
  });
  const lifecycle = createLyricsPageLifecycle({
    page, browser, document: browser.document,
    getPlayer: () => context.Spicetify.Player,
    getLyricsAddonManager: () => null,
    prefetch: { createSession: () => ({ dispose() {} }) },
    translationCache: { init() {} }, needsSetup: () => false,
    createConfigButton: () => ({ register() {}, deregister() {} }),
  });
  const firstLoad = page.fetchLyrics(item);
  await flush();
  assert.equal(requests.length, 1);
  const firstState = { uri: item.uri, lyricsRequestSeq: page._activeLyricsFetchSeq };

  lifecycle.unmount();
  assert.equal(cancelledImports, 1);
  assert.equal(page.isCurrentLyricsState(firstState), false);
  lifecycle.mount();
  await flush();
  assert.equal(requests.length, 2);
  assert.equal(requests[1].info.uri, item.uri);
  requests[0].resolve({ uri: item.uri, provider: "fixture", synced: lines("Stale lyric") });
  await firstLoad;
  assert.equal(page.state.isLoading, true);
  requests[1].resolve({ uri: item.uri, provider: "fixture", synced: lines("Current lyric") });
  await flush();
  assert.equal(page.state.synced[0].text, "Current lyric");
  assert.equal(page.state.isLoading, false);
  lifecycle.unmount();
});

test("a cache clear during a page lookup triggers a fresh lookup without displaying or caching the old result", async () => {
  const h = createHarness(), current = track("cache-clear");
  let revision = 0;
  h.context.window.LyricsService.getLyricsRequestRevision = () => revision;
  h.play(current);
  const work = h.container.fetchLyrics(current);
  await flush();
  assert.equal(h.requests.length, 1);
  revision++;
  h.requests[0].resolve({ uri: current.uri, provider: "fixture", synced: lines("Before the clear") });
  await flush();
  assert.equal(h.requests.length, 2);
  assert.equal(h.container.state.isLoading, true);
  assert.equal(h.context.CACHE[current.uri], undefined);
  assert.deepEqual(h.publications, []);
  h.requests[1].resolve({ uri: current.uri, provider: "fixture", synced: lines("After the clear") });
  await work;
  assert.equal(h.container.state.currentLyrics[0].text, "After the clear");
  assert.equal(h.context.CACHE[current.uri].synced[0].text, "After the clear");
  assert.equal(h.publications.length, 1);
});

test("a page revisiting a cached track selects lyrics again after a provider settings change", async () => {
  const h = createHarness(), current = track("provider-settings-cache");
  let revision = 0;
  h.context.window.LyricsService.getLyricsRequestRevision = () => revision;
  h.play(current);
  const initial = h.container.fetchLyrics(current);
  await flush();
  h.requests[0].resolve({ uri: current.uri, provider: "first", synced: lines("First provider") });
  await initial;
  assert.equal(h.context.CACHE[current.uri].provider, "first");

  revision++;
  const updated = h.container.fetchLyrics(current);
  await flush();
  assert.equal(h.requests.length, 2);
  assert.equal(h.context.CACHE[current.uri], undefined);
  h.requests[1].resolve({ uri: current.uri, provider: "second", synced: lines("Second provider") });
  await updated;
  assert.equal(h.container.state.currentLyrics[0].text, "Second provider");
});

test("late word timing stays attached when the page was still waiting for language detection", async () => {
  const h = createHarness(), current = track("late-timing");
  const model = deferred();
  let waiting = false;
  h.context.window.LyricsService.whenLanguageModelReady = () => { waiting = true; return model.promise; };
  h.play(current);
  const work = h.container.fetchLyrics(current);
  await flush();
  const lineResult = { uri: current.uri, provider: "lrcred", synced: lines("One line"), lrcred: { isrc: "JPAAA2600001" } };
  h.requests[0].resolve(lineResult);
  await flush();
  assert.equal(waiting, true);
  const timing = [{ text: "One line", startTime: 1200, endTime: 2400, syllables: [{ text: "One ", startTime: 1200, endTime: 1700 }] }];
  h.snapshots.set(current.uri, { trackUri: current.uri, rawResult: { ...lineResult, karaokeSource: "lrcred", karaoke: timing } });
  model.resolve();
  await work;
  assert.strictEqual(h.container.state.karaoke, timing);
  assert.strictEqual(h.container.state.currentLyrics, timing);
  assert.strictEqual(h.publications.at(-1).rawResult.karaoke, timing);
});

test("provider results cannot reach the page after their revision changes during language startup", async () => {
  const h = createHarness(), current = track("provider-change-during-language-startup");
  const model = deferred();
  let revision = 0, waiting = false;
  let delayResets = 0;
  h.container.resetDelay = () => delayResets++;
  h.context.window.LyricsService.getLyricsRequestRevision = () => revision;
  h.context.window.LyricsService.whenLanguageModelReady = () => { waiting = true; return model.promise; };
  h.play(current);
  const work = h.container.fetchLyrics(current);
  await flush();
  h.requests[0].resolve({ uri: current.uri, provider: "old", synced: lines("Old provider") });
  await flush();
  assert.equal(waiting, true);
  revision++;
  model.resolve();
  await flush();
  assert.equal(h.requests.length, 2);
  assert.equal(h.publications.length, 0);
  assert.equal(h.context.CACHE[current.uri], undefined);
  assert.equal(delayResets, 1, "a provider retry must not reset the user's current sync offset");
  h.requests[1].resolve({ uri: current.uri, provider: "new", synced: lines("New provider") });
  await work;
  assert.equal(h.container.state.currentLyrics[0].text, "New provider");
  assert.deepEqual(h.publications.map(snapshot => snapshot.provider), ["new"]);
  assert.equal(h.context.CACHE[current.uri].provider, "new");
});

for (const [storedProvider, expected] of [["removed-provider", null], ["open-lyrics", "open-lyrics"]]) {
  test(`track selection ${storedProvider} resolves only against registered providers`, async () => {
    const h = createHarness(), next = track("provider-identity");
    h.context.window.LyricsAddonManager = { getAddon: id => id === "open-lyrics" ? { id } : null };
    h.context.window.TrackLyricsProviderDB.getProvider = async () => storedProvider;
    h.play(next);
    const completion = h.container.fetchLyrics(next);
    await flush();
    assert.equal(h.container.trackLyricsProviderOverride, expected);
    h.requests[0].resolve({ uri: next.uri, provider: "fixture", synced: lines("Incoming lyric") });
    await completion;
    assert.equal(h.container.state.lyricsStatus, "ready");
  });
}

test("a failed background lookup preserves the current track's saved language and provider", async () => {
  const h = createHarness(), next = track("independent-preferences");
  h.context.window.TrackLanguageDB.getLanguage = async () => "ja";
  h.context.window.TrackLyricsProviderDB.getProvider = async () => "open-lyrics";
  h.context.window.TrackBackgroundDB.getOverride = async () => { throw new Error("Background DB request failed"); };
  h.play(next);
  const completion = h.container.fetchLyrics(next);
  await flush();
  assert.equal(h.container.trackLanguageOverride, "ja");
  assert.equal(h.container.trackLyricsProviderOverride, "open-lyrics");
  assert.equal(h.container.trackBackgroundOverride, null);
  h.requests[0].resolve({ uri: next.uri, provider: "open-lyrics", synced: lines("Incoming lyric") });
  await completion;
  assert.equal(h.container.state.lyricsStatus, "ready");
});

test("finishing a lyric request preserves a newer background saved for the same song", async () => {
  const h = createHarness();
  const item = track("background-selection");
  const backgroundRead = Promise.withResolvers();
  h.context.window.TrackBackgroundDB.getOverride = () => backgroundRead.promise;
  h.play(item);
  const page = h.container;
  page.setState = (update) => Object.assign(page.state, typeof update === "function" ? update(page.state) : update);
  page.getEffectiveBackgroundMode = value => value?.mode || "none";
  const preferences = createPageTrackPreferences({
    page,
    readPlayerItem: () => item,
    isTrackCurrent: uri => page.currentTrackUri === uri,
    backgroundStore: { setOverride: async () => {} },
    onBackgroundChanged() {}, toast: { success() {}, error: assert.fail },
    translate: key => key,
  });
  const loading = page.fetchLyrics(item);
  await preferences.selectBackground("gradient-background");
  backgroundRead.resolve({ mode: "colorful" });
  await flush();
  await preferences.selectBackground("blur-gradient-background");
  h.requests[0].resolve({ uri: item.uri, provider: "fixture", synced: lines("Loaded lyric") });
  await loading;
  assert.equal(page.state.trackBackgroundOverride.mode, "blur-gradient-background");
  assert.equal(page.trackBackgroundOverride.mode, "blur-gradient-background");
  assert.equal(page.state.lyricsStatus, "ready");
});

test("a pending lyric load cannot restore the language override that the toolbar just replaced", async () => {
  const h = createHarness(), item = track("language-selection");
  const languageRead = deferred();
  h.context.window.TrackLanguageDB.getLanguage = () => languageRead.promise;
  h.play(item);
  const page = h.container;
  let committed;
  const toolbar = createToolbarTranslationPreferences({
    readCurrentTrackUri: () => item.uri,
    readMountedPage: () => page,
    readTrackLanguageStore: () => ({ setLanguage: async (_uri, language) => { committed = language; } }),
    clearTrackSnapshot() {}, refreshLyrics() {},
  });
  const loading = page.fetchLyrics(item);
  await toolbar.save("track-language-override", "ja", item.uri);
  assert.equal(committed, "ja");
  assert.equal(page.trackLanguageOverride, "ja");
  languageRead.resolve("zh");
  await flush();
  h.requests[0].resolve({ uri: item.uri, provider: "fixture", synced: lines("Loaded lyric") });
  await loading;
  assert.equal(page.trackLanguageOverride, "ja");
  assert.equal(page.state.lyricsStatus, "ready");
});

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
  assert.equal(h.context.CACHE[sameTrack.uri].synced[0].text, "Updated lyric", "reopening uses the fresh cache");
  await h.container.fetchLyrics(sameTrack);
  assert.equal(h.requests.length, 2);
  assert.equal(h.container.state.currentLyrics[0].text, "Updated lyric");
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
  h.container.playback.resolver.schedule(null);
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
  h.container.playback.resolver.schedule(track("cancelled"));
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
    h.container.playback.resolver.schedule(eventTrackId ? track(eventTrackId) : null);
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
  h.container.playback.resolver.schedule(next);
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
  h.container.setState({ title: "Old title", provider: "spotify", videoInfo: { id: "old" } });
  h.resolvePlayback(null);
  h.container.playback.resolver.schedule(track("unknown"));
  h.advance(4100);
  assert.equal(h.container.state.isLoading, false);
  assert.equal(h.container.state.lyricsStatus, "empty");
  assert.equal(h.container.state.currentLyrics, null);
  assert.equal(h.container.currentTrackUri, "");
  assert.equal(h.container.state.lyricsDisplayUri, null);
  assert.equal(h.container.state.title, "");
  assert.equal(h.container.state.provider, "");
  assert.equal(h.container.state.videoInfo, null);
  assert.equal(h.container.getLyricsLayoutHasLyrics(), false);
  assert.equal(h.timers.size, 0);
});

test("the main page clears a same-URI narration and recovers the song without another event", async () => {
  const h = createHarness();
  const song = track("old");
  const { container } = h;
  container.setState({ provider: "spotify", videoInfo: { id: "old" }, trackLyricsProviderOverride: "lrclib" });
  h.setNarration(true);
  container.playback.resolver.schedule(song);
  const narrationSeq = container.state.lyricsRequestSeq;
  assert.equal(container.state.lyricsStatus, "empty");
  assert.equal(container.state.provider, "");
  assert.equal(container.state.trackLyricsProviderOverride, null);
  assert.equal(container.state.currentLyrics, null);
  assert.equal(container.state.videoInfo, null);
  assert.equal(container.isPlaybackUriCurrent(song.uri), false);
  await container.fetchLyrics(song);
  h.advance(100);
  assert.equal(h.requests.length, 0);
  assert.equal(container.state.lyricsRequestSeq, narrationSeq, "polling the narration does not reset the page");
  h.setNarration(false);
  h.advance(100);
  await flush();
  assert.equal(h.requests.length, 1);
  h.requests[0].resolve({ uri: song.uri, provider: "spotify", synced: lines("Recovered song") });
  await flush();
  assert.equal(container.state.currentLyrics[0].text, "Recovered song");
  assert.equal(container.state.lyricsStatus, "ready");
  assert.equal(h.timers.size, 0);
});

test("only the latest committed playback track can start a deferred React load callback", () => {
  const h = createHarness();
  const callbacks = [];
  const loadedUris = [];
  const { container } = h;
  container.setState = (patch, callback) => {
    container.state = { ...container.state, ...patch };
    if (callback) callbacks.push(callback);
  };
  container.fetchLyrics = (item) => loadedUris.push(item.uri);

  for (const item of [track("first-commit"), track("second-commit")]) {
    h.play(item);
    container.playback.commitResolvedPlaybackTrack(item, { uri: item.uri });
  }
  assert.equal(callbacks.length, 2);
  for (const callback of callbacks) callback();
  assert.deepEqual(loadedUris, [track("second-commit").uri]);
});

test("a late local timing result cannot reset the active track's playback settings", async () => {
  const h = createHarness();
  const local = { ...track("local"), uri: "spotify:local:Artist:Album:Song:180" };
  const next = track("after-local");
  const pseudo = deferred();
  const colorRequests = [];
  let delayResets = 0;
  h.context.window.PseudoKaraokeService = { applyToResult: () => pseudo.promise };
  h.container.getSavedLocalLyrics = () => ({ synced: lines("Saved local lyrics") });
  h.container.fetchColors = uri => colorRequests.push(uri);
  h.container.resetDelay = () => delayResets++;
  h.play(local);
  const first = h.container.fetchLyrics(local);
  await flush();
  assert.equal(h.requests.length, 0);

  h.play(next);
  const second = h.container.fetchLyrics(next);
  await flush();
  h.requests[0].resolve({ uri: next.uri, provider: "fixture", synced: lines("Incoming lyric") });
  await second;
  pseudo.resolve();
  await first;
  assert.deepEqual(colorRequests, [next.uri]);
  assert.equal(delayResets, 1);
  assert.equal(h.container.state.currentLyrics[0].text, "Incoming lyric");
});

for (const [notation, expected] of [["translation", "Warm translated display"], ["latin", "Raw matching lyric"]]) {
  test(`shared display reuse honors stored pronunciation notation ${notation}`, async () => {
    const h = createHarness();
    const item = track("warm-snapshot");
    const text = "Raw matching lyric";
    let modelWaits = 0;
    h.context.window.LyricsService.whenLanguageModelReady = async () => { modelWaits++; };
    h.snapshots.set(item.uri, {
      rawResult: { uri: item.uri, provider: "fixture", synced: lines(text) },
      displayLyrics: lines("Warm translated display"),
      lyricsType: "synced",
      displayMode1: "none",
      displayMode2: "none",
      detectedLanguage: "en",
      translationTargetLanguage: "ko",
      pronunciationNotation: notation,
      translationSourceText: text,
      presentationComplete: true,
    });
    h.play(item);
    await h.container.fetchLyrics(item);
    assert.equal(h.requests.length, 0, "raw timing remains reusable");
    assert.equal(h.container.state.currentLyrics[0].text, expected);
    assert.equal(modelWaits, notation === "translation" ? 0 : 1);
  });
}

test("a warm display waits for the saved provider before entering the page", async () => {
  const h = createHarness();
  const item = track("warm-provider-mismatch");
  const savedProvider = Promise.withResolvers();
  h.context.window.TrackLyricsProviderDB.getProvider = () => savedProvider.promise;
  h.snapshots.set(item.uri, {
    rawResult: { uri: item.uri, provider: "previous", synced: lines("Previous provider lyric") },
    displayLyrics: lines("Previous provider translation"),
    lyricsType: "synced",
    translationTargetLanguage: "ko",
    detectedLanguage: "en",
    presentationComplete: true,
  });
  h.play(item);
  const load = h.container.fetchLyrics(item);
  assert.equal(h.container.state.currentLyrics.length, 0);
  assert.equal(h.container.state.synced, null);
  savedProvider.resolve("chosen");
  await flush();
  assert.equal(h.requests.length, 1);
  assert.equal(h.container.state.currentLyrics.length, 0);
  h.requests[0].resolve({ uri: item.uri, provider: "chosen", synced: lines("Chosen provider lyric") });
  await load;
  assert.equal(h.container.state.currentLyrics[0].text, "Chosen provider lyric");
});

test("a React update queued by a completed request is discarded after a song change", async () => {
  const h = createHarness();
  const first = track("batched-first"), second = track("batched-second");
  h.play(first);
  const load = h.container.fetchLyrics(first);
  await flush();
  const updates = [];
  h.container.setState = update => updates.push(update);
  h.requests[0].resolve({ uri: first.uri, provider: "fixture", synced: lines("First") });
  await load;
  assert.equal(updates.length, 1);
  h.play(second);
  const newer = h.container.fetchLyrics(second);
  assert.equal(updates[0](h.container.state), null);
  await flush();
  h.requests[1].resolve({ uri: second.uri, provider: "fixture", synced: lines("Second") });
  await newer;
  assert.equal(updates.at(-1)(h.container.state).currentLyrics[0].text, "Second");
});

test("loading a track with a mismatched translation style reuses raw timing without showing the old translation", async () => {
  const h = createHarness();
  const item = track("warm-stale-style");
  const synced = lines("Raw matching lyric");
  h.context.CONFIG.visual["translation-mode:english"] = "gemini_ko";
  h.snapshots.set(item.uri, {
    rawResult: { uri: item.uri, provider: "fixture", synced },
    displayLyrics: lines("Old literal translation"),
    lyricsType: "synced",
    displayMode1: "gemini_ko",
    detectedLanguage: "en",
    translationTargetLanguage: "ko",
    pronunciationNotation: "translation",
    translationStyle: "literal",
    presentationComplete: true,
  });
  h.play(item);
  const load = h.container.fetchLyrics(item);
  assert.notEqual(h.container.state.currentLyrics?.[0]?.text, "Old literal translation");
  await load;
  assert.equal(h.requests.length, 0);
  assert.equal(h.container.state.currentLyrics[0].text, synced[0].text);
});

test("cancelled and queued resolver callbacks cannot take over a newer playback attempt", () => {
  const h = createHarness();
  const calls = [];
  h.container.fetchLyrics = item => calls.push(item.uri);
  h.resolvePlayback(null);
  h.container.playback.resolver.schedule(track("cancelled"));
  const [stale] = h.timers.values();
  h.container.playback.resolver.cancel();
  assert.equal(h.timers.size, 0);

  const current = track("current");
  h.play(current);
  h.container.playback.resolver.schedule(current);
  stale();
  assert.deepEqual(calls, [current.uri]);
  assert.equal(h.container.currentTrackUri, current.uri);
  assert.equal(h.timers.size, 0);
});

test("a departing lyrics page cannot publish a late result or write into the next page's cache", async () => {
  const h = createHarness();
  const item = track("departing-page");
  h.play(item);
  const load = h.container.fetchLyrics(item);
  await flush();
  assert.equal(h.requests.length, 1);
  h.container._isComponentMounted = false;
  h.container.pageLyricsDataLoader.cancelPending();
  h.requests[0].resolve({ uri: item.uri, provider: "fixture", synced: lines("Old page result") });
  await load;
  assert.equal(h.context.CACHE[item.uri], undefined);
  assert.equal(h.publications.length, 0);
  assert.equal(h.container.state.currentLyrics?.length, 0);
});

test("a callback for a stale playback URI cannot start a provider request or replace loading state", async () => {
  const h = createHarness();
  const before = h.container.state;
  h.play(track("current"));
  await h.container.fetchLyrics(track("skipped"));
  assert.equal(h.container.state, before);
  assert.equal(h.requests.length, 0);
  assert.equal(h.publications.length, 0);
});
