import assert from "node:assert/strict";
import test from "node:test";
import { createSpotifyPlaybackClock } from "../src/core/PlaybackClock.js";

test("the Spotify clock reads public progress only for fallback or jump confirmation", () => {
    let sampledAt = 0;
    let publicReads = 0;
    let publicProgress = 0;
    const item = { uri: "spotify:track:test", metadata: {} };
    const state = { item, positionAsOfTimestamp: 2000, timestamp: 1000, isPaused: false };
    const clock = createSpotifyPlaybackClock({
        Player: { data: state, getProgress: () => { publicReads++; return publicProgress; } },
        Platform: { PlayerAPI: { _state: state } }
    }, { autoStart: false, now: () => sampledAt, wallNow: () => 1000 + sampledAt });

    assert.equal(clock.getProgress(), 2000);
    const first = clock.getLastSnapshot();
    for (let frame = 1; frame <= 60; frame++) {
        sampledAt = frame * 16;
        assert.equal(clock.getSnapshot().position, 2000 + sampledAt);
    }
    assert.equal(publicReads, 0);
    assert.equal(first.position, 2000);
    first.source = "caller-write";
    assert.equal(clock.getLastSnapshot().source, "player-state");

    sampledAt = 1000;
    state.positionAsOfTimestamp = publicProgress = 11000;
    state.timestamp = 2000;
    const seek = clock.getSnapshot();
    assert.equal(seek.position, 11000);
    assert.equal(publicReads, 1);

    sampledAt += 16;
    delete state.positionAsOfTimestamp;
    publicProgress += 16;
    const fallback = clock.getSnapshot();
    assert.equal(fallback.position, 11016);
    assert.equal(fallback.source, "public-progress");
    assert.equal(publicReads, 2);

    // Spicetify can update metadata in place, even for the same playback ID.
    item.metadata.agentic_product_type = "DJ";
    state.restrictions = { disallowSkippingPrevReasons: ["dj_narration"] };
    const narration = clock.getSnapshot();
    assert.equal(narration.automix, true);
    assert.equal(narration.djNarration, true);
});
