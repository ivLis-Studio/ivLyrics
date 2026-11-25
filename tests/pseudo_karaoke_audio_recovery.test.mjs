import assert from "node:assert/strict";
import test from "node:test";
import { createPseudoKaraokeService } from "#ivlyrics/lyrics/pseudo-karaoke/createPseudoKaraokeService.mjs";

test("estimated karaoke recovers when Spotify audio analysis becomes available", async () => {
    let fetchAudioData = null;
    let calls = 0;
    const service = createPseudoKaraokeService({
        getSetting: () => "true",
        getAudioDataFetcher: () => fetchAudioData,
        extractTrackId: () => "fixture",
        getPlaybackDuration: () => 5_000,
        debug() {},
    });
    const result = {
        uri: "spotify:track:fixture",
        synced: [{ startTime: 0, endTime: 5_000, text: "Follow the song" }],
    };

    const fallback = await service.applyToResult(result);
    assert.equal(fallback.karaokeSource, "line-timing-pseudo");
    assert.equal(fallback.karaoke[0].syllables.map(unit => unit.text).join(""), "Follow the song");

    fetchAudioData = async (uri) => {
        calls++;
        assert.equal(uri, result.uri);
        return { segments: [], beats: [], sections: [] };
    };
    const [first, second] = await Promise.all([
        service.applyToResult(structuredClone(fallback)),
        service.applyToResult(structuredClone(fallback)),
    ]);
    assert.equal(first.karaokeSource, "audio-analysis-pseudo");
    assert.deepEqual(first, second);
    assert.equal(calls, 1);
});
