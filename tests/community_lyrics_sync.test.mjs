import assert from "node:assert/strict";
import test from "node:test";
import { createCommunityLyricsSync } from "../src/lyrics/createCommunityLyricsSync.mjs";

const trackId = "fixture";
const uri = "spotify:track:" + trackId;
const isrc = "GBARL1901205";
const normalizeSyncDataIsrc = (value) => value?.trim().toUpperCase() || "";

for (const [storedProvider, applies] of [["spotify", true], ["lrclib", false]]) {
    test(`community sync ${applies ? "accepts the Spotify alias" : "rejects an unrelated provider"}`, async () => {
        const result = {
            uri, provider: "spotify-synced", durationMs: 4000,
            synced: [{ text: "Original" }],
        };
        const karaoke = [{ text: "Original", syllables: [{ text: "Original", startTime: 100 }] }];
        const synced = [{ text: "Original", startTime: 100 }];
        const syncData = { provider: storedProvider, syncType: "word", syncPoints: 5, contributors: ["Author"] };
        const service = createCommunityLyricsSync({
            syncDataService: {
                normalizeSyncDataIsrc,
                async resolveTrackIsrc(_id, metadata) {
                    assert.equal(metadata.title, "Fixture");
                    return isrc;
                },
                async getSyncData(id, provider, metadata) {
                    assert.equal(id, trackId);
                    assert.equal(provider, result.provider);
                    assert.deepEqual(metadata, { isrc, trackId, title: "Fixture", artist: "Artist", album: "Album" });
                    return syncData;
                },
                applySyncDataToLyrics(lines, data, context) {
                    assert.equal(applies, true);
                    assert.strictEqual(lines, result.synced);
                    assert.strictEqual(data, syncData);
                    assert.strictEqual(context.result, result);
                    assert.equal(context.durationMs, 4000);
                    return karaoke;
                },
                convertKaraokeToSynced(lines) {
                    assert.strictEqual(lines, karaoke);
                    return synced;
                },
            },
            extractTrackId: () => trackId,
            getSpotifyTrackData: () => ({ name: "Fixture", artists: "Artist", album: "Album" }),
            request: () => assert.fail("Use the live sync data service"),
            reportWarning: (...args) => assert.fail(args.join(" ")),
        });
        const before = { ...result };
        assert.strictEqual(await service.applyIvLyricsSyncData(result), result);
        if (!applies) {
            assert.deepEqual(result, before);
            return;
        }
        assert.strictEqual(result.karaoke, karaoke);
        assert.strictEqual(result.synced, synced);
        assert.deepEqual(result.contributors, ["Author"]);
        assert.equal(result.syncDataProvider, "spotify-synced");
        assert.equal(result.syncType, "word");
        assert.equal(result.syncPoints, 5);
    });
}

test("legacy community sync lookup keeps normalized ISRC, metadata and cache bypass", async () => {
    let requested;
    const service = createCommunityLyricsSync({
        syncDataService: { normalizeSyncDataIsrc, shouldBypassServerCache: (id) => id === isrc },
        async request(url, options) {
            requested = new URL(url);
            assert.deepEqual(options, { cache: "no-store" });
            return { ok: true, json: async () => ({ data: { provider: "spotify", trackId: "stored" } }) };
        },
        reportWarning: (...args) => assert.fail(args.join(" ")),
    });
    const data = await service.getIvLyricsSyncData(trackId, "spotify-synced", {
        isrc: isrc.toLowerCase(), trackName: "Title", artists: ["A", "B"], albumName: "Album",
    });
    assert.equal(requested.pathname, "/lyrics/sync-data");
    assert.deepEqual(Object.fromEntries(requested.searchParams), {
        isrc, "request-version": "20260701", trackId, provider: "spotify-synced",
        title: "Title", artist: "A, B", album: "Album", bypassCache: "1",
    });
    assert.deepEqual(data, { isrc, trackId: "stored", storedTrackId: "stored", provider: "spotify" });
});
