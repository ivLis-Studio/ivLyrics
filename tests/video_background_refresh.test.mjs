import assert from "node:assert/strict";
import test from "node:test";
import { watchVideoBackgroundRefresh } from "../src/features/video/videoBackgroundRefresh.mjs";

const trackUri = "spotify:track:current";

function fixture({ random = false, playbackId = "first", uid = "queue-first" } = {}) {
    const host = new EventTarget();
    const player = new EventTarget();
    const state = { uri: trackUri, playbackId, item: { uid }, random, count: 0 };
    const dispose = watchVideoBackgroundRefresh({
        host, player, trackUri, readPlaybackSnapshot: () => state,
        shouldRefreshOnReplay: () => state.random || state.failed,
        readActiveVideo: () => ({ trackUri, youtubeVideoId: "current-video" }),
        refresh: () => { state.count++; },
    });
    return {
        state, dispose,
        songchange(uri = trackUri) {
            player.dispatchEvent(Object.assign(new Event("songchange"), { data: { item: { uri } } }));
        },
        changeRandom() { host.dispatchEvent(new Event("ivLyrics:communityVideoRandomChanged")); },
        hide(uri, videoId) {
            host.dispatchEvent(new CustomEvent("ivLyrics:communityVideoCurrentHidden", {
                detail: { trackUri: uri, videoId },
            }));
        },
    };
}

test("a selected or matching video is reused when Spotify repeats or restarts the same song", () => {
    const h = fixture();
    h.songchange();
    h.state.playbackId = "second";
    h.songchange();
    assert.equal(h.state.count, 0);

    h.hide(trackUri, "other-video");
    h.hide("spotify:track:other", "current-video");
    assert.equal(h.state.count, 0);
    h.hide(trackUri, "current-video");
    h.changeRandom();
    assert.equal(h.state.count, 2, "explicit changes still refresh the selected video");

    h.dispose();
    h.changeRandom();
    h.hide(trackUri, "current-video");
    assert.equal(h.state.count, 2);
});

test("random videos are selected once per confirmed playback and ignore stale notifications", () => {
    const h = fixture({ random: true });
    h.songchange();
    h.songchange();
    assert.equal(h.state.count, 0);
    h.state.playbackId = "second";
    h.songchange("spotify:track:previous");
    h.state.djNarration = true;
    h.songchange();
    assert.equal(h.state.count, 0);
    h.state.djNarration = false;
    h.songchange();
    h.songchange();
    assert.equal(h.state.count, 1);
    h.dispose();
    h.state.playbackId = "third";
    h.songchange();
    assert.equal(h.state.count, 1);
});

test("when a playback ID is unavailable random selection can follow the queue item's UID", () => {
    const h = fixture({ random: true, playbackId: null });
    h.songchange();
    h.state.playbackId = "first";
    h.songchange();
    assert.equal(h.state.count, 0, "a late playback ID for this item is not a replay");
    h.state.playbackId = null;
    h.state.item = { uid: "queue-next" };
    h.songchange();
    assert.equal(h.state.count, 1);
    h.state.playbackId = "second";
    h.songchange();
    assert.equal(h.state.count, 1);
});

test("a failed fixed video can retry on a new playback without retrying on duplicate events", () => {
    const h = fixture();
    h.state.failed = true;
    h.songchange();
    h.songchange();
    assert.equal(h.state.count, 0);
    h.state.playbackId = "second";
    h.songchange();
    h.songchange();
    assert.equal(h.state.count, 1);
});
