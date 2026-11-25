import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const { createSpotifyPlaybackClock } = createRequire(import.meta.url)("../src/core/PlaybackClock.js");

const createHarness = () => {
  let now = 0;
  const listeners = new Map();
  const state = {
    item: { uri: "spotify:track:one", metadata: {} },
    playbackId: "playback-one", isPaused: false, duration: 180000,
    positionAsOfTimestamp: 10000, timestamp: 1000000,
    context: { uri: "spotify:playlist:dj", metadata: { agentic_product_type: "dj" } },
  };
  const player = {
    data: state,
    getProgress: () => NaN, // Exercise the state guard without corroboration.
    addEventListener(event, callback) { listeners.set(event, callback); },
    removeEventListener(event) { listeners.delete(event); },
  };
  const clock = createSpotifyPlaybackClock({ Player: player, Platform: { PlayerAPI: { _state: state } } }, {
    autoStart: false, now: () => now, wallNow: () => 1000000 + now,
  });
  return {
    state, clock, listeners,
    advance(ms) { now += ms; },
    setPosition(position) { state.positionAsOfTimestamp = position; state.timestamp = 1000000 + now; },
    seek(position) {
      this.setPosition(position);
      listeners.get("onseek")();
      return clock.getSnapshot();
    },
    destroy() { clock.destroy(); assert.equal(listeners.size, 0); },
  };
};

test("explicit DJ seeks snap immediately and never become retained handoff offsets", () => {
  const h = createHarness();
  const initial = h.clock.getSnapshot();
  assert.equal(initial.automix, true);
  assert.equal(initial.position, 10000);
  for (const target of [0, 80000, 2500]) {
    h.advance(16);
    const snapshot = h.seek(target);
    assert.equal(snapshot.position, target);
    assert.equal(snapshot.identityKey, initial.identityKey);
    assert.equal(snapshot.source, "player-state");
    h.advance(100);
    assert.equal(h.clock.getSnapshot().position, target + 100);
  }
  h.destroy();
});

test("unannounced same-URI DJ discontinuities retain the existing confirmation guard", () => {
  const h = createHarness();
  h.clock.getSnapshot();
  h.advance(16);
  h.setPosition(0);
  assert.equal(h.clock.getSnapshot().source, "guarded-player-state");
  assert.equal(h.clock.getSnapshot().position, 10016);
  h.advance(120);
  const confirmed = h.clock.getSnapshot();
  assert.equal(confirmed.source, "player-state");
  assert.equal(confirmed.position, 120, "confirmed native position has no synthetic DJ offset");
  h.destroy();
});

test("DJ narration to a known ordinary context uses the new URI and native position", () => {
  const h = createHarness();
  h.state.item = { uri: "spotify:media:narration", provider: "narration", metadata: {} };
  const narration = h.clock.getSnapshot();
  assert.equal(narration.djNarration, true);
  h.advance(16);
  h.state.item = { uri: "spotify:track:two", metadata: {} };
  h.state.context = { uri: "spotify:album:ordinary", metadata: {} };
  h.setPosition(250);
  const song = h.clock.getSnapshot();
  assert.equal(song.position, 250);
  assert.equal(song.automix, false);
  assert.equal(song.djNarration, false);
  assert.notEqual(song.identityKey, narration.identityKey);
  h.destroy();
});

test("a new playback ID for the same URI discards prediction and pending discontinuities", () => {
  const h = createHarness();
  const first = h.clock.getSnapshot();
  h.advance(16);
  h.setPosition(0);
  assert.equal(h.clock.getSnapshot().source, "guarded-player-state");
  h.state.playbackId = "playback-two";
  const replay = h.clock.getSnapshot();
  assert.equal(replay.uri, first.uri);
  assert.notEqual(replay.identityKey, first.identityKey);
  assert.equal(replay.position, 0);
  assert.equal(replay.source, "player-state");
  h.destroy();
});
