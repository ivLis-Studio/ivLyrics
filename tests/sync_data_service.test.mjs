import assert from "node:assert/strict";
import test from "node:test";
import { trackIdentity } from "../src/core/trackIdentity.mjs";
import { createSyncDataService } from "../src/lyrics/createSyncDataService.mjs";
import { createSpotifySyncDataMetadata } from "../src/lyrics/createSpotifySyncDataMetadata.mjs";

const trackId = "BBBBBBBBBBBBBBBBBBBBBB";
const isrc = "USUM72300001";
const flush = () => new Promise(resolve => setImmediate(resolve));
const liveResponse = (name) => Response.json({ data: {
    provider: "spotify",
    isrc,
    syncData: { version: 2, lines: [{ start: 0, end: 1, chars: [1, 1.3] }] },
    contributors: [{ name, spotifyUserId: name, syncType: "word", syncPoints: 5 }],
} });

function serviceHarness() {
    let clock = 0;
    const requests = [], warnings = [];
    const service = createSyncDataService({
        extractTrackId: trackIdentity.extractTrackId,
        getPlayer: () => null,
        getSpotifyTrackData: () => null,
        getStorage: () => null,
        request: (url, options) => new Promise(resolve => requests.push({ url: new URL(url), options, resolve })),
        schedule() {},
        reportWarning: (...args) => warnings.push(args),
        debug() {},
        log() {},
        now: () => clock,
    });
    return {
        service, requests, warnings,
        advance: (ms) => { clock += ms; },
        read: (forceContributorRefresh = false) => service.getSyncData(trackId, "spotify", {
            isrc, forceContributorRefresh, title: "Fixture track",
        }),
    };
}

test("concurrent readers share a live response and an expired identity falls back to redacted timing", async () => {
    const h = serviceHarness();
    const first = h.read(true);
    const second = h.read(true);
    await flush();
    assert.equal(h.requests.length, 1);
    const [pending] = h.requests;
    assert.deepEqual(Object.fromEntries(pending.url.searchParams), {
        isrc, "request-version": "20260701", format: "6", provider: "spotify",
        metadata: "1", trackId, title: "Fixture track",
    });
    pending.resolve(liveResponse("Author"));
    const live = await first;
    assert.strictEqual(await second, live);
    assert.strictEqual(await h.read(), live);
    assert.equal(live.contributors[0].spotifyUserId, "Author");

    h.advance(15_000);
    const expired = h.read();
    await flush();
    assert.equal(h.requests.length, 2);
    assert.equal(h.requests[1].url.searchParams.has("metadata"), false);
    h.requests[1].resolve(new Response(null, { status: 503 }));
    const redacted = await expired;
    assert.equal(redacted.contributors[0].name, "Anonymous");
    assert.equal(redacted.contributors[0].spotifyUserId, null);
    assert.equal(redacted.contributors[0].identityRedacted, true);
    assert.equal(redacted.contributors[0].syncPoints, 5);
    assert.deepEqual(redacted.syncData, live.syncData);
    assert.equal(h.warnings.length, 1);
});

test("clearing one ISRC invalidates its running request without displacing the replacement", async () => {
    const h = serviceHarness();
    const previous = h.read(true);
    await flush();
    h.service.clearCache(isrc);
    assert.equal(h.service.shouldBypassServerCache(isrc), true);

    const replacement = h.read(true);
    await flush();
    assert.equal(h.requests.length, 2);
    assert.equal(h.requests[1].url.searchParams.get("bypassCache"), "1");

    h.requests[0].resolve(liveResponse("Old author"));
    assert.equal(await previous, null);
    const joined = h.read(true);
    await flush();
    assert.equal(h.requests.length, 2);
    h.requests[1].resolve(liveResponse("New author"));
    const current = await replacement;
    assert.strictEqual(await joined, current);
    assert.equal(current.contributors[0].name, "New author");
});

test("Spotify ISRC resolution joins concurrent metadata requests and caches only their success", async () => {
    const lookups = [];
    const spicetifyRequestBuilder = {
        build() {
            const request = {};
            return {
                withHost(value) { request.host = value; return this; },
                withPath(value) { request.path = value; return this; },
                withEndpointIdentifier(value) { request.endpoint = value; return this; },
                withQueryParameters(value) { request.query = value; return this; },
                withoutMarket() { request.market = false; return this; },
                send: () => new Promise(resolve => lookups.push({ request, resolve })),
            };
        },
    };
    const gid = "a".repeat(32);
    const service = createSyncDataService({
        extractTrackId: trackIdentity.extractTrackId,
        getPlayer: () => ({ data: { item: { uri: "spotify:track:" + "A".repeat(22), metadata: { isrc: "AEA0D2400001" } } } }),
        getSpotifyTrackData: () => null,
        getUriApi: () => ({ idToHex: () => gid.toUpperCase() }),
        getPlatform: () => ({ RequestBuilder: spicetifyRequestBuilder }),
        request: () => assert.fail("The RequestBuilder should provide the ISRC"),
        log() {},
    });
    const first = service.resolveTrackIsrc(trackId);
    const second = service.resolveTrackIsrc(trackId);
    assert.equal(lookups.length, 1);
    assert.deepEqual(lookups[0].request, {
        host: "https://spclient.wg.spotify.com/metadata/4",
        path: "/track/" + gid,
        endpoint: "/track/{hexId}",
        query: { "response-format": "json" },
        market: false,
    });
    lookups[0].resolve({ statusCode: 200, body: { external_ids: [{ type: "ISRC", id: isrc.toLowerCase() }] } });
    assert.deepEqual(await Promise.all([first, second]), [isrc, isrc]);
    assert.equal(await service.resolveTrackIsrc(trackId), isrc);
    assert.equal(lookups.length, 1);
});

function profileHarness({ makePlatform, getCosmosApi = () => null }) {
    let account = "current";
    const timers = new Set();
    const warnings = [];
    const metadata = createSpotifySyncDataMetadata({
        getPlatform: () => ({ ...makePlatform(), LocalStorageAPI: { namespace: account } }),
        getCosmosApi,
        schedule(callback, delay) {
            assert.equal(delay, 1200);
            timers.add(callback);
            return callback;
        },
        cancelScheduled: (timer) => timers.delete(timer),
        reportWarning: (...args) => warnings.push(args),
    });
    return {
        read: metadata.getCurrentSpotifyProfile,
        changeAccount: (value) => { account = value; },
        expire: () => [...timers].forEach(callback => callback()),
        timers,
        warnings,
    };
}

test("Spotify profile timeout releases the pending lookup and skips stale fallback requests", async () => {
    const attempts = [];
    let fallbacks = 0;
    const h = profileHarness({
        makePlatform: () => ({
            UserAPI: { getUser: () => new Promise(resolve => attempts.push(resolve)) },
            RequestBuilder: { build() { fallbacks++; } },
        }),
    });
    const initial = h.read();
    assert.strictEqual(h.read(), initial);
    h.expire();
    assert.equal(await initial, null);
    assert.equal(h.timers.size, 0);

    const replacement = h.read();
    attempts[0]({});
    await flush();
    assert.equal(fallbacks, 0);
    assert.strictEqual(h.read(), replacement);
    attempts[1]({ id: " current ", display_name: {}, displayName: " Author " });
    assert.deepEqual(await replacement, { id: "current", displayName: "Author" });
    assert.strictEqual(h.read(), replacement);
    assert.equal(h.timers.size, 0);
});

test("Spotify profile lookup drops results after switching accounts", async () => {
    const attempts = [];
    const h = profileHarness({
        makePlatform: () => ({ UserAPI: { getUser: () => new Promise(resolve => attempts.push(resolve)) } }),
    });
    const previous = h.read();
    h.changeAccount("replacement");
    const current = h.read();
    attempts[1]({ id: "replacement", name: "New Author" });
    assert.deepEqual(await current, { id: "replacement", displayName: "New Author" });
    attempts[0]({ id: "current", name: "Prior Author" });
    assert.equal(await previous, null);
    assert.strictEqual(h.read(), current);
});

test("Spotify profile retries after the authenticated fallbacks have no result", async () => {
    const requests = [];
    let response = { status: 503 };
    const h = profileHarness({
        makePlatform: () => ({
            UserAPI: { getUser: () => ({ id: {} }) },
            RequestBuilder: {
                build() {
                    return {
                        withHost(host) { requests.push(host); return this; },
                        withPath(path) { requests.push(path); return this; },
                        withEndpointIdentifier(endpoint) { requests.push(endpoint); return this; },
                        withoutMarket() { requests.push("no market"); return this; },
                        send: () => response,
                    };
                },
            },
        }),
        getCosmosApi: () => ({ get: (url) => { requests.push(url); } }),
    });
    assert.equal(await h.read(), null);
    assert.deepEqual(requests, [
        "https://api.spotify.com", "/v1/me", "/v1/me", "no market", "https://api.spotify.com/v1/me",
    ]);
    assert.equal(h.warnings.length, 1);

    response = { statusCode: 200, body: { id: " ", uri: "spotify:user:current", displayName: " Author " } };
    assert.deepEqual(await h.read(), { id: "current", displayName: "Author" });
    assert.equal(requests.length, 9);
});
