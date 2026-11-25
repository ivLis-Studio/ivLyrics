import assert from "node:assert/strict";
import test from "node:test";
import { createSongResearchClient } from "../src/app/songResearchClient.mjs";
import { createTrackRevisions } from "../src/core/trackRevisions.mjs";
import { createLyricsResearch } from "../src/lyrics/createLyricsResearch.mjs";
import { trackIdentity } from "../src/core/trackIdentity.mjs";

test("subscribers share Research until the last closes and a reopened request cannot receive retired progress", async () => {
    const calls = [], writes = [], delivered = [];
    const getResearch = createLyricsResearch({
        cache: {
            getTMI: async () => null,
            setTMI: async (_track, _language, result, canWrite) => { if (canWrite()) writes.push(result); },
        },
        getAIManager: () => ({ generateResearch(input) {
            const { promise, resolve } = Promise.withResolvers();
            calls.push({ ...input, resolve });
            return promise;
        } }),
        debug() {},
    });
    const { fetchResearch, researchCache } = createSongResearchClient({
        spicetify: { Player: { data: {} } }, config: { visual: { language: "ko" } },
        getLyricsService: () => ({ getResearch }), getAiManager: () => null,
    });
    const first = new AbortController(), second = new AbortController();
    const request = (subscriber, signal) => fetchResearch("track", false, {
        signal, onProgress: result => delivered.push([subscriber, result.title]),
    });
    const a = request("A", first.signal);
    await new Promise(setImmediate);
    calls[0].onProgress({ title: "Draft" });
    const b = request("B", second.signal);
    assert.deepEqual(delivered, [["A", "Draft"], ["B", "Draft"]]);

    first.abort();
    assert.equal(await a, null);
    assert.equal(calls[0].signal.aborted, false);
    calls[0].onProgress({ title: "Updated draft" });
    assert.deepEqual(delivered.at(-1), ["B", "Updated draft"]);

    second.abort();
    assert.equal(calls[0].signal.aborted, true);
    const reopened = request("Reopened");
    assert.equal(await b, null);
    await new Promise(setImmediate);
    assert.equal(calls.length, 2);
    calls[0].onProgress({ title: "Retired progress" });
    calls[0].resolve({ title: "Retired final" });
    await new Promise(setImmediate);
    assert.equal(researchCache.size, 0);
    assert.deepEqual(writes, []);
    assert.equal(delivered.length, 3);
    calls[1].resolve({ title: "Fresh final" });
    assert.deepEqual(await reopened, { title: "Fresh final" });
    assert.deepEqual(writes, [{ title: "Fresh final" }]);
    assert.deepEqual(await request("Cached"), { title: "Fresh final" });
    assert.equal(calls.length, 2);
});

test("clearing research permits a fresh request while suppressing old memory and disk writes", async () => {
    const { getRevision, invalidate } = createTrackRevisions();
    const calls = [];
    const persisted = new Map();
    const cache = {
        getRevision,
        getTMI: async (id) => persisted.get(id),
        setTMI: async (id, lang, result, canWrite) => {
            if (canWrite()) persisted.set(id, result);
        },
    };
    const manager = {
        generateResearch({ trackId }) {
            const request = Promise.withResolvers();
            calls.push({ trackId, ...request });
            return request.promise;
        },
    };
    const getResearch = createLyricsResearch({ cache, getAIManager: () => manager, debug() {} });
    const service = { getCacheRevision: getRevision, getResearch };
    const { fetchResearch, researchCache } = createSongResearchClient({
        spicetify: { Player: { data: {} } }, config: { visual: { language: "ko" } },
        getLyricsService: () => service, getAiManager: () => manager,
    });

    const other = fetchResearch("other");
    const old = fetchResearch("track");
    await new Promise(setImmediate);
    assert.deepEqual(calls.map(call => call.trackId), ["other", "track"]);
    calls[0].resolve({ title: "Other" });
    assert.deepEqual(await other, { title: "Other" });

    invalidate("track");
    const fresh = fetchResearch("track");
    await new Promise(setImmediate);
    assert.deepEqual(calls.map(call => call.trackId), ["other", "track", "track"]);
    calls[1].resolve({ title: "Old" });
    await old;
    assert.equal(persisted.has("track"), false);
    assert.deepEqual([...researchCache.values()], [{ title: "Other" }]);
    const joined = fetchResearch("track");
    calls[2].resolve({ title: "New" });
    assert.deepEqual(await fresh, { title: "New" });
    assert.deepEqual(await joined, { title: "New" });
    assert.deepEqual(persisted.get("track"), { title: "New" });
    assert.deepEqual(await fetchResearch("other"), { title: "Other" });
    assert.equal(calls.length, 3);

    invalidate();
    persisted.clear();
    const afterClear = fetchResearch("other");
    await new Promise(setImmediate);
    assert.equal(calls.length, 4);
    calls[3].resolve({ title: "After clear" });
    assert.deepEqual(await afterClear, { title: "After clear" });
});

test("research keeps the requested metadata and lyrics during a playback change", async () => {
    const firstId = "0123456789ABCDEFGHIJKL";
    const secondId = "0123456789ABCDEFGHIJKM";
    const firstUri = `spotify:track:${firstId}`;
    const secondUri = `spotify:track:${secondId}`;
    const firstLines = [{ text: "First lyrics" }];
    const secondLines = [{ text: "Second lyrics" }];
    const item = { uri: firstUri, name: "First title", metadata: { artist_name: "First artist", isrc: "FIRST" } };
    const snapshots = new Map([
        [firstUri, { trackInfo: { title: "First snapshot title", artist: "First snapshot artist" }, displayLyrics: firstLines }],
        [secondUri, { displayLyrics: secondLines }],
    ]);
    const inputs = [];
    const service = {
        getLyricsSnapshot: uri => snapshots.get(uri),
        async getResearch(input) {
            inputs.push(input);
            return { title: input.title };
        },
    };
    const { fetchResearch } = createSongResearchClient({
        spicetify: { Player: { data: { item } } }, config: { visual: { language: "ko" } },
        getLyricsService: () => service, getAiManager: () => null,
    });

    const first = fetchResearch(firstId);
    Object.assign(item, { uri: secondUri, name: "Second title", metadata: { artist_name: "Second artist", isrc: "SECOND" } });
    assert.deepEqual(await first, { title: "First title" });
    assert.deepEqual([inputs[0].artist, inputs[0].isrc, inputs[0].lyrics], ["First artist", "FIRST", firstLines]);

    assert.deepEqual(await fetchResearch(firstId, true), { title: "First snapshot title" });
    assert.deepEqual([inputs[1].artist, inputs[1].isrc, inputs[1].lyrics], ["First snapshot artist", "", firstLines]);
    assert.equal(inputs[1].spotifyUrl, `https://open.spotify.com/track/${firstId}`);
    assert.deepEqual(await fetchResearch(secondId), { title: "Second title" });
    assert.deepEqual([inputs[2].artist, inputs[2].isrc, inputs[2].lyrics], ["Second artist", "SECOND", secondLines]);
});

test("research for local tracks uses a per-file cache identity and omits catalog links", async () => {
    const river = "spotify:local:Artist:Album:River:180";
    const road = "spotify:local:Artist:Album:Road:180";
    const spicetify = { Player: { data: { item: { uri: river, name: "River" } } } };
    const di = { spicetify, config: { visual: { language: "ko" } }, getAiManager: () => null };
    const calls = [];
    const service = {
        getLyricsSnapshot: uri => ({ displayLyrics: [{ text: uri === river ? "River lyrics" : "Road lyrics" }] }),
        async getResearch(input) {
            calls.push(input);
            return { title: input.title };
        },
    };
    const { fetchResearch } = createSongResearchClient({ ...di, getLyricsService: () => service });
    assert.deepEqual(await fetchResearch(trackIdentity.getTranslationCacheId(river)), { title: "River" });
    spicetify.Player.data.item = { uri: road, name: "Road" };
    assert.deepEqual(await fetchResearch(trackIdentity.getTranslationCacheId(road)), { title: "Road" });
    assert.deepEqual(calls.map(call => [call.trackId, call.spotifyUrl, call.lyrics[0].text]), [
        [`local-uri:${river}`, "", "River lyrics"],
        [`local-uri:${road}`, "", "Road lyrics"],
    ]);
});
