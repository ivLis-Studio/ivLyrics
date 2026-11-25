import assert from "node:assert/strict";
import test from "node:test";
import { createPageTrackPreferences } from "../src/lyrics/pageTrackPreferences.mjs";
import { createLyricsProviderRequests } from "../src/lyrics/lyricsProviderRequests.mjs";

const originalUri = "spotify:track:original";
const nextUri = "spotify:track:next";

function createStorageFixture() {
  const saved = new Map();
  const writes = [];
  const save = kind => (uri, value) => {
    const { promise, resolve, reject } = Promise.withResolvers();
    writes.push({ uri, value, reject, finish() { saved.set(kind + uri, value); resolve(); } });
    return promise;
  };
  const saveProvider = save("provider");
  const saveBackground = save("background");
  return {
    saved, writes,
    providerStore: { setProvider: saveProvider, clearProvider: uri => saveProvider(uri, null) },
    backgroundStore: { setOverride: saveBackground, clearOverride: uri => saveBackground(uri, null) },
  };
}

function createFixture({ notifyError = assert.fail, clearLyricsSnapshot = () => {}, storage = createStorageFixture(), readActivePreferences } = {}) {
  const { providerStore, backgroundStore, saved, writes } = storage;
  const changes = [];
  const updates = [];
  let playerItem = { uri: originalUri };
  let requestSeq = 0;
  let mounted = true;
  const page = {
    state: { uri: originalUri, explicitMode: 1 },
    setState(patch, callback) { updates.push([patch, callback]); },
    beginLyricsLoadRequest: () => ++requestSeq,
    isCurrentLyricsState: state => state.uri === playerItem.uri && state.lyricsRequestSeq === requestSeq,
    fetchLyrics: (item, mode, force = false) => changes.push(["fetch", item.uri, mode, force]),
    getEffectiveBackgroundMode: value => value?.mode || "none",
    fetchColors: uri => changes.push(["colors", uri]),
  };
  const preferences = createPageTrackPreferences({
    page,
    readPlayerItem: () => playerItem,
    isTrackCurrent: uri => mounted && playerItem.uri === uri,
    providerStore, backgroundStore, readActivePreferences,
    lyricsCache: {},
    clearLyricsSnapshot,
    translationCache: { clearByUri: uri => changes.push(["translation cleared", uri]) },
    onBackgroundChanged: detail => changes.push(["background changed", detail.trackUri]),
    translate: key => key,
    toast: { success() {}, error: notifyError },
  });
  const flushUpdates = () => {
    for (const [patch, callback] of updates.splice(0)) {
      Object.assign(page.state, patch(page.state));
      callback?.();
    }
  };
  const playNext = () => {
    playerItem = { uri: nextUri };
    page.state = { uri: nextUri, explicitMode: -1 };
    page.trackLyricsProviderOverride = null;
    page.trackBackgroundOverride = null;
    page.beginLyricsLoadRequest();
  };
  return { ...preferences, page, writes, saved, changes, flushUpdates, playNext, deactivate: () => { mounted = false; },
    changePlayerBeforePage: () => { playerItem = { uri: nextUri }; },
  };
}

test("a menu event during a playback handoff cannot edit either track's preferences", async () => {
  const errors = [];
  const f = createFixture({ notifyError: message => errors.push(message) });
  f.changePlayerBeforePage();
  await Promise.all([f.selectProvider("lrclib"), f.selectBackground("gradient-background")]);
  assert.deepEqual(f.writes, []);
  assert.deepEqual(f.changes, []);
  assert.deepEqual(errors, Array(2).fill("notifications.noTrackPlaying"));
});

test("a retained menu choice cannot change the next song", async () => {
  const errors = [];
  const f = createFixture({ notifyError: message => errors.push(message) });
  f.playNext();
  const provider = f.selectProvider("lrclib", originalUri);
  const background = f.selectBackground("gradient-background", originalUri);
  await Promise.resolve();
  assert.deepEqual(f.writes, []);
  await Promise.all([provider, background]);
  assert.deepEqual(errors, Array(2).fill("notifications.noTrackPlaying"));
});

test("preferences saved via a reopened lyrics route share the previous route's write order", async () => {
  const storage = createStorageFixture();
  let active;
  const makePage = () => createFixture({ storage, readActivePreferences: () => active });
  const old = active = makePage();
  const first = old.selectProvider("lrclib", originalUri);
  await Promise.resolve();
  old.deactivate();
  const replacement = active = makePage();
  const second = replacement.selectProvider("open-lyrics", originalUri);
  await Promise.resolve();
  assert.deepEqual(storage.writes.map(write => write.value), ["lrclib"]);
  storage.writes[0].finish();
  await first;
  assert.deepEqual(old.changes, []);
  assert.deepEqual(storage.writes.map(write => write.value), ["lrclib", "open-lyrics"]);
  storage.writes[1].finish();
  await second;
  replacement.flushUpdates();
  assert.equal(storage.saved.get("provider" + originalUri), "open-lyrics");
  assert.equal(replacement.page.state.trackLyricsProviderOverride, "open-lyrics");
  assert.deepEqual(replacement.changes, [["translation cleared", originalUri], ["fetch", originalUri, 1, false]]);
});

test("pending provider and background writes can reach the replacement route for the same song", async () => {
  const storage = createStorageFixture();
  let active;
  const makePage = () => createFixture({ storage, readActivePreferences: () => active });
  const old = active = makePage();
  const actions = [old.selectProvider("lrclib"), old.selectBackground("gradient-background")];
  await Promise.resolve();
  old.deactivate();
  const replacement = active = makePage();
  storage.writes.forEach(write => write.finish());
  await Promise.all(actions);
  old.flushUpdates();
  replacement.flushUpdates();
  assert.equal(old.page.state.trackLyricsProviderOverride, undefined);
  assert.equal(old.page.state.trackBackgroundOverride, undefined);
  assert.equal(replacement.page.state.trackLyricsProviderOverride, "lrclib");
  assert.deepEqual(replacement.page.state.trackBackgroundOverride, { mode: "gradient-background" });
});

test("a delayed provider and background save belong to the original track after a skip", async () => {
  const f = createFixture();
  const providerSaved = f.selectProvider("lrclib");
  const backgroundSaved = f.selectBackground("gradient-background");
  await Promise.resolve();
  f.playNext();
  f.writes.forEach(write => write.finish());
  await Promise.all([providerSaved, backgroundSaved]);
  f.flushUpdates();
  assert.equal(f.saved.get("provider" + originalUri), "lrclib");
  assert.deepEqual(f.saved.get("background" + originalUri), { mode: "gradient-background" });
  assert.deepEqual(f.page.state, { uri: nextUri, explicitMode: -1 });
  assert.equal(f.page.trackLyricsProviderOverride, null);
  assert.equal(f.page.trackBackgroundOverride, null);
  assert.deepEqual(f.changes, [["translation cleared", originalUri], ["background changed", originalUri]]);
});

test("rapid provider choices save in order and reload once with the final selection", async () => {
  const f = createFixture();
  const first = f.selectProvider("lrclib");
  const last = f.selectProvider("open-lyrics");
  await Promise.resolve();
  assert.equal(f.writes.length, 1);
  f.writes[0].finish();
  await first;
  assert.deepEqual(f.changes, []);
  assert.deepEqual(f.writes.slice(1).map(write => write.value), ["open-lyrics"]);
  f.writes[1].finish();
  await last;
  f.flushUpdates();
  assert.equal(f.saved.get("provider" + originalUri), "open-lyrics");
  assert.equal(f.page.state.trackLyricsProviderOverride, "open-lyrics");
  assert.deepEqual(f.changes, [["translation cleared", originalUri], ["fetch", originalUri, 1, false]]);
});

test("a playback transition can overtake a queued provider state commit", async () => {
  const f = createFixture();
  const saved = f.selectProvider("lrclib");
  await Promise.resolve();
  f.writes[0].finish();
  await saved;
  f.playNext();
  f.flushUpdates();
  assert.deepEqual(f.page.state, { uri: nextUri, explicitMode: -1 });
  assert.deepEqual(f.changes, [["translation cleared", originalUri]]);
});

test("saving a provider for a previous track retires its pending shared lyrics without invalidating the new track", async () => {
  const old = Promise.withResolvers();
  const manager = { getLyrics: () => old.promise };
  const requests = createLyricsProviderRequests(() => manager);
  const snapshots = [];
  const lookup = requests.request({ info: { uri: originalUri }, getSnapshot: () => null,
    publishSnapshot: value => snapshots.push(value) });
  const nextRevision = requests.getRevision(nextUri);
  const f = createFixture({ clearLyricsSnapshot: requests.invalidate });
  const saved = f.selectProvider('lrclib');
  await Promise.resolve();
  f.playNext();
  f.writes[0].finish();
  await saved;
  old.resolve({ provider: 'open-lyrics', uri: originalUri });
  await lookup;
  assert.deepEqual(snapshots, []);
  assert.equal(requests.getRevision(nextUri), nextRevision);
  assert.deepEqual(f.page.state, { uri: nextUri, explicitMode: -1 });
});

test("a failed final selection leaves the most recently persisted provider active", async (t) => {
  t.mock.method(console, "error", () => {});
  const errors = [];
  const f = createFixture({ notifyError: message => errors.push(message) });
  const first = f.selectProvider("lrclib");
  const last = f.selectProvider("open-lyrics");
  await Promise.resolve();
  f.writes[0].finish();
  await first;
  f.writes[1].reject(new Error("Storage unavailable"));
  await last;
  f.flushUpdates();
  assert.equal(f.saved.get("provider" + originalUri), "lrclib");
  assert.equal(f.page.state.trackLyricsProviderOverride, "lrclib");
  assert.deepEqual(f.changes, [["translation cleared", originalUri], ["fetch", originalUri, 1, false]]);
  assert.deepEqual(errors, ["notifications.lyricsProviderSaveFailed"]);
});
