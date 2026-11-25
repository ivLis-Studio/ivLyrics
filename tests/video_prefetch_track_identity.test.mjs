import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { createYouTubeVideoLookup, createYouTubeVideoLookupRequest } from "../src/features/video/youTubeVideoLookupRequest.mjs";
import { createVideoBackgroundDiscovery } from "../src/features/video/videoBackgroundDiscovery.mjs";
import { createApiTracker } from "../src/core/createApiTracker.mjs";
import { createVideoMatchSession, getYouTubeVideoCandidates } from "../src/features/video/videoMatchSession.mjs";
import { createVideoDownloadPrefetcher, createVideoPrefetcher } from "../src/features/video/createVideoPrefetcher.mjs";
import { trackIdentity } from "../src/core/trackIdentity.mjs";
import { createSyncDataIdentityResolver } from "../src/lyrics/syncDataIdentity.mjs";
import { createTrackRevisions } from "../src/core/trackRevisions.mjs";

// Regression: while prefetching the next song, the video lookup borrowed the
// *playing* song's ISRC/title/artists and then remembered the ISRC echoed by
// the server, so the next song (Goosebumps) got the previous song's video.

const PLAYING_URI = "spotify:track:AAAAAAAAAAAAAAAAAAAAAA";
const NEXT_URI = "spotify:track:BBBBBBBBBBBBBBBBBBBBBB";
const NEXT_ID = "BBBBBBBBBBBBBBBBBBBBBB";
const PLAYING_ISRC = "AEA0D2400001";
const NEXT_ISRC = "USUM72300001";

const playingItem = () => ({
    uri: PLAYING_URI,
    name: "Arabic Song",
    artists: [{ name: "Arabic Artist" }],
    album: { name: "Arabic Album" },
    metadata: { isrc: PLAYING_ISRC },
});

function loadGetTrackIsrc() {
    return createSyncDataIdentityResolver({
        extractTrackId: trackIdentity.extractTrackId,
        getPlayer: () => ({ data: { item: playingItem() } }),
        getSpotifyTrackData: () => null,
    }).getTrackIsrc;
}

test("ISRC lookup for another track ignores the playing track's ISRC", () => {
    const getTrackIsrc = loadGetTrackIsrc();
    assert.equal(getTrackIsrc(NEXT_ID, { trackId: NEXT_ID }), "");
});

test("ISRC lookup for the playing track still uses the player's ISRC", () => {
    const getTrackIsrc = loadGetTrackIsrc();
    assert.equal(getTrackIsrc("AAAAAAAAAAAAAAAAAAAAAA", {}), PLAYING_ISRC);
    assert.equal(getTrackIsrc(null, {}), PLAYING_ISRC);
});

function loadPrefetcher({ responseIsrc, responseVideo = null, communityVideos = [], beforeResponse, fetchVideoLookup, makeLookupRequest, lyricsCache, prefetchDownload, matchSession }) {
    const calls = { resolveMetadata: null, remembered: [], urls: [], headers: [], downloads: [] };
    const context = vm.createContext({
        CONFIG: { visual: {} },
        Utils: {
            currentVersion: "6.6.30",
            extractTrackId: uri => uri.split(":")[2] || null,
            getUserHash: () => "user-hash",
        },
        // The next track is rarely in Spotify's local metadata cache.
        SpotifyDataHelper: { extractSpotifyData: () => null },
        Spicetify: { Player: { data: { item: playingItem() } } },
        window: {
            LyricsCache: lyricsCache,
            SyncDataService: {
                resolveTrackIsrc: async (_trackId, metadata) => {
                    calls.resolveMetadata = metadata;
                    return NEXT_ISRC;
                },
                normalizeSyncDataIsrc: value => (typeof value === "string" ? value : ""),
                rememberTrackIsrc: (trackId, isrc) => calls.remembered.push([trackId, isrc]),
            },
        },
        fetch: async (url, init = {}) => {
            calls.urls.push(new URL(url));
            calls.headers.push(init.headers || {});
            return {
                headers: { get: () => null },
                json: async () => {
                    await beforeResponse?.();
                    return {
                        success: true,
                        data: responseVideo || { youtubeVideoId: "video-id", isrc: responseIsrc },
                        communityVideos,
                    };
                },
            };
        },
        ivLyricsDebug: () => { },
        console: { warn: () => { }, log: () => { } },
        URL,
        Date,
        calls,
    });
    const cache = new Map();
    const { pickVideoForTrack, isRejectedVideoForTrack } = matchSession ?? createVideoMatchSession({
        normalizeIsrc: context.window.SyncDataService.normalizeSyncDataIsrc,
    });
    const prefetcher = createVideoPrefetcher({
        cache, requests: new Map(), maxAgeMs: 1800000,
        readVisual: () => context.CONFIG.visual,
        getService: (name) => context.window[name],
        extractTrackId: context.Utils.extractTrackId,
        readSpotifyData: context.SpotifyDataHelper.extractSpotifyData,
        readPlayerItem: () => context.Spicetify.Player.data.item,
        makeLookupRequest: makeLookupRequest ?? ((params) => createYouTubeVideoLookupRequest({
            ...params,
            clientVersion: context.Utils.currentVersion,
            shouldBypassCache: (isrc) => context.window.SyncDataService.shouldBypassServerCache?.(isrc),
        })),
        pickVideo: (track, data, uri) => pickVideoForTrack(
            track, getYouTubeVideoCandidates(data.data, data.communityVideos), uri,
        ),
        isRejectedVideoForTrack,
        fetchVideoLookup: fetchVideoLookup ?? createYouTubeVideoLookup(context.fetch),
        prefetchDownload: prefetchDownload ?? (id => calls.downloads.push(id)),
        debug() {},
        warn() {},
    });
    return { prefetcher: { ...prefetcher, cache }, calls };
}

const nextTrackInfo = {
    uri: NEXT_URI,
    title: "Goosebumps",
    artist: "Travis Scott, Kendrick Lamar",
    album: "Birds in the Trap Sing McKnight",
};

test("video prefetch describes the next track with its own metadata", async () => {
    const { prefetcher, calls } = loadPrefetcher({ responseIsrc: NEXT_ISRC });
    await prefetcher.loadVideo(NEXT_URI, nextTrackInfo);

    assert.equal(calls.resolveMetadata.isrc, "", "the playing track's ISRC must not be offered");
    assert.equal(calls.resolveMetadata.trackName, "Goosebumps");
    assert.equal(calls.urls.length, 1);
    const params = calls.urls[0].searchParams;
    assert.equal(params.get("isrc"), NEXT_ISRC);
    assert.equal(params.get("trackId"), NEXT_ID);
    assert.equal(params.get("trackName"), "Goosebumps");
    assert.equal(params.get("trackArtists"), "Travis Scott, Kendrick Lamar");
    assert.equal(params.get("album"), "Birds in the Trap Sing McKnight");
});

test("video prefetch sends the client parameters and headers the server requires", async () => {
    // Without them the server returns a placeholder video and the prefetch
    // always came back empty.
    const { prefetcher, calls } = loadPrefetcher({ responseIsrc: NEXT_ISRC });
    await prefetcher.loadVideo(NEXT_URI, nextTrackInfo);

    const params = calls.urls[0].searchParams;
    assert.equal(params.get("client"), "ivLyrics");
    assert.equal(params.get("requestVersion"), "2");
    assert.equal(params.get("useCommunity"), "true");
    assert.equal(params.get("clientVersion"), "6.6.30");
    assert.equal(calls.headers[0]["X-ivLyrics-Client"], "ivLyrics");
    assert.equal(calls.headers[0]["X-ivLyrics-Request-Version"], "2");
    assert.equal(calls.headers[0]["X-ivLyrics-Client-Version"], "6.6.30");
    assert.deepEqual([...prefetcher.cache.keys()], [`prefetch:video:${NEXT_ID}`]);
});

test("a mismatched ISRC in a video response is never remembered or cached", async () => {
    const { prefetcher, calls } = loadPrefetcher({ responseIsrc: PLAYING_ISRC });
    await prefetcher.loadVideo(NEXT_URI, nextTrackInfo);

    assert.deepEqual(calls.remembered, []);
    assert.deepEqual([...prefetcher.cache.keys()], []);
    assert.deepEqual(calls.downloads, [], "wrong recordings are not downloaded by the helper");
});

test("prefetch selects a matching alternative before caching or helper download", async () => {
    const { prefetcher, calls } = loadPrefetcher({
        responseIsrc: PLAYING_ISRC,
        communityVideos: [{
            youtubeVideoId: "goosebumps1", youtubeTitle: "Travis Scott - Goosebumps",
            isrc: NEXT_ISRC, isAutoGenerated: true,
        }],
    });
    await prefetcher.loadVideo(NEXT_URI, nextTrackInfo);
    assert.equal(prefetcher.cache.get(`prefetch:video:${NEXT_ID}`).data.youtubeVideoId, "goosebumps1");
    assert.deepEqual(calls.downloads, ["goosebumps1"]);
    assert.equal(calls.urls.length, 1, "candidate filtering does not issue another lookup");
});

test("concurrent prefetches reuse one request and then the matching cached recording", async () => {
    const downloads = [];
    const prefetchDownload = createVideoDownloadPrefetcher({
        cache: new Map(), requests: new Map(),
        readVisual: () => ({ "video-helper-enabled": true }),
        getService: () => ({
            async isHelperAvailable() { return true; },
            requestVideo(id, callbacks) {
                downloads.push(id);
                queueMicrotask(() => callbacks.onComplete("http://localhost:15123/video"));
                return () => {};
            },
        }),
        scheduleTimer: setTimeout, cancelTimer: clearTimeout, debug() {},
    });
    const { prefetcher, calls } = loadPrefetcher({ responseIsrc: NEXT_ISRC, prefetchDownload });
    await Promise.all([prefetcher.loadVideo(NEXT_URI, nextTrackInfo),
        prefetcher.loadVideo(NEXT_URI, nextTrackInfo)]);
    await prefetcher.loadVideo(NEXT_URI, nextTrackInfo);
    assert.equal(calls.urls.length, 1);
    assert.deepEqual(downloads, ["video-id"]);
});

test("a cancelled queue entry can warm video metadata without starting a helper download", async () => {
    let releaseResponse;
    const response = new Promise(resolve => { releaseResponse = resolve; });
    const { prefetcher, calls } = loadPrefetcher({ responseIsrc: NEXT_ISRC, beforeResponse: () => response });
    let queued = true;
    const result = prefetcher.loadVideo(NEXT_URI, nextTrackInfo, { wanted: () => queued });
    await new Promise(setImmediate);
    assert.equal(calls.urls.length, 1);
    queued = false;
    releaseResponse();
    await result;
    assert.equal(prefetcher.cache.get(`prefetch:video:${NEXT_ID}`).data.youtubeVideoId, "video-id");
    assert.deepEqual(calls.downloads, []);
    await prefetcher.loadVideo(NEXT_URI, nextTrackInfo);
    assert.equal(calls.urls.length, 1);
    assert.deepEqual(calls.downloads, ["video-id"]);
});

async function runVideoResponse(data, cacheMode = "ready") {
    const calls = { writes: [], shown: [], errors: [] };
    const normalizeSyncDataIsrc = value => value || "";
    const cache = {
        getYouTube: async () => null,
        setYouTube: async (trackId, info, { isrc }) => { calls.writes.push([trackId, isrc, info.youtubeVideoId]); },
    };
    let currentCache = cacheMode === "ready" ? cache : null;
    const { beginLookup } = createVideoBackgroundDiscovery({
        readPlayerItem: playingItem,
        readVisualSettings: () => ({}),
        readSpotifyData: () => ({ name: "goosebumps", artists: ["Travis Scott"], duration_ms: 243_000 }),
        readSyncDataService: () => ({ normalizeSyncDataIsrc, resolveTrackIsrc: async () => NEXT_ISRC }),
        readApiTracker: () => null,
        extractTrackId: () => NEXT_ID,
        selectedVideoStore: { getSelectedVideo: async () => null },
        readLyricsCache: () => currentCache,
        matchSession: createVideoMatchSession({ normalizeIsrc: normalizeSyncDataIsrc }),
        makeVideoLookupRequest: () => ({ url: "https://example.test/fixture" }),
        fetchVideoLookup: async () => {
            if (cacheMode === "during-request") currentCache = cache;
            return { data };
        },
        translate: key => key,
        debug() {},
    });
    const finish = beginLookup({
        trackUri: NEXT_URI,
        playerRef: { current: null },
        videoSourceRef: { current: "" },
        setVideoInfo: info => calls.shown.push(info?.youtubeVideoId ?? null),
        setIsPlayerReady() {},
        reportVideoBackgroundStatus() {},
        showVideoBackgroundError: message => calls.errors.push(message),
    });
    await new Promise(setImmediate);
    finish();
    // The initial empty source is published before every lookup begins.
    assert.equal(calls.shown.shift(), null);
    return calls;
}

const arabicPick = { youtubeVideoId: "arabicVideo", youtubeTitle: "عمرو دياب - تملي معاك", isrc: PLAYING_ISRC, isAutoGenerated: true };

test("a server pick of another song is replaced by the matching community video", async () => {
    const calls = await runVideoResponse({
        success: true,
        data: arabicPick,
        communityVideos: [{
            id: 5, youtubeVideoId: "goosebumps1", youtubeTitle: "Travis Scott - goosebumps (Official Video)",
            isrc: NEXT_ISRC, submitterId: "system", isAutoGenerated: true, startTime: 12, skipSegments: [],
        }],
    });
    assert.deepEqual(calls.shown, ["goosebumps1"]);
    assert.deepEqual(calls.writes, [[NEXT_ID, NEXT_ISRC, "goosebumps1"]]);
});

test("a successful lookup with only community videos still selects and caches a match", async () => {
    const calls = await runVideoResponse({
        success: true,
        data: null,
        communityVideos: [{
            id: 5, youtubeVideoId: "community-match", youtubeTitle: "Travis Scott - goosebumps",
            isrc: NEXT_ISRC, startTime: 12,
        }],
    });
    assert.deepEqual(calls, {
        shown: ["community-match"], errors: [], writes: [[NEXT_ID, NEXT_ISRC, "community-match"]],
    });
});

test("the queue reloads a cached video rejected during playback and downloads the replacement", async () => {
    const matchSession = createVideoMatchSession({ normalizeIsrc: value => value || "" });
    const { prefetcher, calls } = loadPrefetcher({
        responseVideo: { youtubeVideoId: "original", isrc: NEXT_ISRC },
        communityVideos: [{ id: 5, youtubeVideoId: "replacement", isrc: NEXT_ISRC }],
        matchSession,
    });
    await prefetcher.loadVideo(NEXT_URI, nextTrackInfo);
    assert.equal(prefetcher.getVideoInfo(NEXT_URI)?.youtubeVideoId, "original");
    matchSession.rejectVideoForTrack(NEXT_URI, "original");
    assert.equal(prefetcher.getVideoInfo(NEXT_URI), null);
    await prefetcher.loadVideo(NEXT_URI, nextTrackInfo);
    assert.equal(prefetcher.getVideoInfo(NEXT_URI)?.youtubeVideoId, "replacement");
    assert.equal(calls.urls.length, 2);
    assert.deepEqual(calls.downloads, ["original", "replacement"]);
});

test("without a matching candidate the artwork stays and the user is told", async () => {
    const calls = await runVideoResponse({ success: true, data: arabicPick, communityVideos: [] });
    assert.deepEqual(calls.shown, [null]);
    assert.deepEqual(calls.writes, []);
    assert.deepEqual(calls.errors, ["videoBackground.noMatch"]);
});

test("video background caches a matching response for the track and its resolved ISRC", async () => {
    const calls = await runVideoResponse({
        success: true,
        data: { youtubeVideoId: "video-id", youtubeTitle: "goosebumps", isrc: "", isAutoGenerated: true },
    });
    assert.deepEqual(calls.writes, [[NEXT_ID, NEXT_ISRC, "video-id"]]);
    assert.deepEqual(calls.shown, ["video-id"]);
});

test("video playback starts with an unavailable cache and uses it if startup completes during lookup", async () => {
    const response = {
        success: true,
        data: { youtubeVideoId: "video-id", youtubeTitle: "goosebumps", isrc: NEXT_ISRC },
    };
    const withoutCache = await runVideoResponse(response, "unavailable");
    assert.deepEqual(withoutCache, { shown: ["video-id"], errors: [], writes: [] });
    const lateCache = await runVideoResponse(response, "during-request");
    assert.deepEqual(lateCache, { shown: ["video-id"], errors: [], writes: [[NEXT_ID, NEXT_ISRC, "video-id"]] });
});

function playbackLookup({ request = () => { throw new Error("unexpected background request"); }, ...overrides } = {}, isCurrent = () => true) {
    const seen = [];
    const errors = [];
    const provider = createVideoBackgroundDiscovery({
        readPlayerItem: playingItem,
        readVisualSettings: () => ({}),
        readSpotifyData: () => ({ name: "goosebumps", artists: ["Travis Scott"], duration_ms: 243_000 }),
        readSyncDataService: () => ({ resolveTrackIsrc: async () => NEXT_ISRC }),
        readApiTracker: () => null,
        extractTrackId: () => NEXT_ID,
        selectedVideoStore: { getSelectedVideo: async () => null },
        readLyricsCache: () => null,
        matchSession: createVideoMatchSession({ normalizeIsrc: value => value || "" }),
        makeVideoLookupRequest: () => ({ url: "https://example.test/fixture" }),
        fetchVideoLookup: createYouTubeVideoLookup(request),
        translate: key => key,
        debug() {},
        ...overrides,
    });
    const stop = provider.beginLookup({
        trackUri: NEXT_URI, isCurrent,
        setVideoInfo: info => seen.push(info),
        reportVideoBackgroundStatus() {},
        showVideoBackgroundError: error => errors.push(error),
    });
    return { stop, seen, errors };
}

test("video selection honors a new track rejection while its lookup is in flight", async () => {
    const started = Promise.withResolvers();
    const pendingResponse = Promise.withResolvers();
    const matchSession = createVideoMatchSession({ normalizeIsrc: value => value || "" });
    const lookup = playbackLookup({
        matchSession,
        fetchVideoLookup() {
            started.resolve();
            return pendingResponse.promise;
        },
    });
    await started.promise;
    matchSession.rejectVideoForTrack(NEXT_URI, "rejected-primary");
    pendingResponse.resolve({ data: {
        success: true,
        data: { youtubeVideoId: "rejected-primary", youtubeTitle: "Travis Scott - goosebumps", isrc: NEXT_ISRC },
        communityVideos: [{ id: 5, youtubeVideoId: "replacement", isrc: NEXT_ISRC }],
    } });
    await new Promise(setImmediate);
    lookup.stop();
    assert.equal(lookup.seen.at(-1)?.youtubeVideoId, "replacement");
    assert.deepEqual(lookup.errors, []);
});

for (const replacement of [null, { youtubeVideoId: "visible", captionStartTime: 2 }]) {
    test(`saved community video waits for dislike validation ${replacement ? "and plays the replacement" : "and falls back to artwork"}`, async () => {
        const validation = Promise.withResolvers();
        const saved = { youtubeVideoId: "hidden", communityEntryId: "entry", captionStartTime: 3 };
        const validated = [], stored = [];
        const lookup = playbackLookup({
            selectedVideoStore: {
                getSelectedVideo: async () => saved,
                async replaceHiddenSelectedVideo(uri, previous, next, isCurrent) {
                    assert.equal(isCurrent(), true);
                    stored.push([uri, previous, next]);
                    return true;
                },
            },
            resolveHiddenCommunityVideo(uri, selected, _skipCache, { signal }) {
                validated.push([uri, selected, signal]);
                return validation.promise;
            },
        });
        await new Promise(setImmediate);
        assert.deepEqual(lookup.seen, [null]);
        assert.equal(validated.length, 1);
        assert.equal(validated[0][0], NEXT_URI);
        assert.equal(validated[0][1], saved);
        assert.equal(validated[0][2].aborted, false);
        validation.resolve({ hidden: true, replacement });
        await new Promise(setImmediate);
        lookup.stop();
        assert.deepEqual(stored, [[NEXT_URI, saved, replacement]]);
        assert.equal(lookup.seen.at(-1)?.youtubeVideoId ?? null, replacement?.youtubeVideoId ?? null);
        assert.deepEqual(lookup.errors, []);
    });
}

test("changing tracks during saved-video validation cannot write or start the old replacement", async () => {
    const validation = Promise.withResolvers();
    const started = Promise.withResolvers();
    const lookup = playbackLookup({
        selectedVideoStore: {
            getSelectedVideo: async () => ({ youtubeVideoId: "hidden", communityEntryId: "entry" }),
            replaceHiddenSelectedVideo() { assert.fail("retired validation must not update the saved video"); },
        },
        resolveHiddenCommunityVideo(_uri, _selected, _skipCache, { signal }) {
            started.resolve(signal);
            return validation.promise;
        },
    });
    const signal = await started.promise;
    lookup.stop();
    validation.resolve({ hidden: true, replacement: { youtubeVideoId: "old-replacement" } });
    await new Promise(setImmediate);
    assert.equal(signal.aborted, true);
    assert.deepEqual(lookup.seen, [null]);
    assert.deepEqual(lookup.errors, []);
});

test("enabling random video before the background rerenders retires an in-flight fixed selection", async () => {
    const validation = Promise.withResolvers();
    const started = Promise.withResolvers();
    const writes = [];
    let random = false;
    const lookup = playbackLookup({
        readVisualSettings: () => ({ "community-video-random": random }),
        selectedVideoStore: {
            getSelectedVideo: async () => ({ youtubeVideoId: "hidden", communityEntryId: "entry" }),
            async replaceHiddenSelectedVideo(_uri, _previous, _next, isCurrent) {
                if (!isCurrent()) return false;
                writes.push("fixed video replacement");
                return true;
            },
        },
        resolveHiddenCommunityVideo() {
            started.resolve();
            return validation.promise;
        },
    });
    await started.promise;
    random = true;
    validation.resolve({ hidden: true, replacement: { youtubeVideoId: "old-fixed-video" } });
    await new Promise(setImmediate);
    lookup.stop();
    assert.deepEqual(writes, []);
    assert.deepEqual(lookup.seen, [null]);
    assert.deepEqual(lookup.errors, []);
});

test("a retired source stops after the stored video read, even before its React effect cleanup", async () => {
    const saved = Promise.withResolvers();
    let current = true;
    let identityCalls = 0;
    const lookup = playbackLookup({
        selectedVideoStore: { getSelectedVideo: () => saved.promise },
        readSyncDataService() { identityCalls++; return null; },
    }, () => current);
    current = false;
    saved.resolve(null);
    await new Promise(setImmediate);
    lookup.stop();
    assert.equal(identityCalls, 0);
    assert.deepEqual(lookup.seen, [null]);
    assert.deepEqual(lookup.errors, []);
});

test("a cancelled background request aborts its body, discards the pending API log and publishes nothing", async () => {
    const request = Promise.withResolvers();
    const body = Promise.withResolvers();
    const tracker = createApiTracker();
    let signal;
    let cached = 0;
    const lookup = playbackLookup({
        readApiTracker: () => tracker,
        readLyricsCache: () => ({ getYouTube: async () => null, setYouTube: async () => { cached++; } }),
        request(_url, options) {
            signal = options.signal;
            return request.promise;
        },
    });
    await new Promise(setImmediate);
    assert.equal(tracker.getLogs()[0].status, "pending");
    request.resolve({ json: () => body.promise });
    await Promise.resolve();
    lookup.stop();
    assert.equal(signal.aborted, true);
    assert.deepEqual(tracker.getLogs(), []);
    body.resolve({ success: true, data: { youtubeVideoId: "late", youtubeTitle: "goosebumps" } });
    await new Promise(setImmediate);
    assert.deepEqual(lookup.seen, [null]);
    assert.deepEqual(lookup.errors, []);
    assert.equal(cached, 0);
});

test("clearing the track retires playback and queue video results and starts a fresh request", async () => {
    const revisions = createTrackRevisions();
    const writes = [];
    const calls = [];
    const lyricsCache = {
        getRevision: revisions.getRevision,
        getYouTube: async () => null,
        async setYouTube(trackId, video, { canWrite }) {
            if (canWrite()) writes.push([trackId, video.youtubeVideoId]);
        },
    };
    const makeLookupRequest = () => ({ url: "https://example.test/fixture" });
    const fetchVideoLookup = createYouTubeVideoLookup(() => {
        const response = Promise.withResolvers();
        calls.push(response);
        return response.promise;
    });
    const tracker = createApiTracker();
    const { prefetcher } = loadPrefetcher({ lyricsCache, fetchVideoLookup, makeLookupRequest });
    const options = {
        readLyricsCache: () => lyricsCache, makeVideoLookupRequest: makeLookupRequest,
        fetchVideoLookup, readApiTracker: () => tracker,
    };
    const oldPrefetch = prefetcher.loadVideo(NEXT_URI, nextTrackInfo);
    const oldPlayback = playbackLookup(options);
    await new Promise(setImmediate);
    assert.equal(calls.length, 1, "playback and queue share the original request");
    revisions.invalidate(NEXT_ID);
    const freshPrefetch = prefetcher.loadVideo(NEXT_URI, nextTrackInfo);
    const freshPlayback = playbackLookup(options);
    await new Promise(setImmediate);
    assert.equal(calls.length, 2, "the new revision cannot join the old request");

    const response = videoId => ({ json: async () => ({ success: true, data: {
        youtubeVideoId: videoId, youtubeTitle: "goosebumps", isrc: NEXT_ISRC,
    } }) });
    calls[0].resolve(response("retired"));
    await oldPrefetch;
    await new Promise(setImmediate);
    assert.deepEqual(writes, []);
    assert.deepEqual(oldPlayback.seen, [null]);
    assert.deepEqual(oldPlayback.errors, []);
    assert.equal(prefetcher.getVideoInfo(NEXT_URI), null);
    assert.equal(tracker.getLogs().length, 1, "the retired request is removed from the tracker");

    calls[1].resolve(response("fresh"));
    await freshPrefetch;
    await new Promise(setImmediate);
    assert.equal(freshPlayback.seen.at(-1).youtubeVideoId, "fresh");
    assert.deepEqual(writes, [[NEXT_ID, "fresh"]]);
    assert.equal(prefetcher.getVideoInfo(NEXT_URI).youtubeVideoId, "fresh");
    revisions.invalidate();
    assert.equal(prefetcher.getVideoInfo(NEXT_URI), null);
    oldPlayback.stop();
    freshPlayback.stop();
});

test("playback joins pending queue prefetch while both keep their own cancellation and match decisions", async () => {
    const body = Promise.withResolvers();
    const responseVideo = { youtubeVideoId: "video-id", youtubeTitle: "goosebumps", isrc: NEXT_ISRC };
    const makeLookupRequest = ({ trackIsrc, trackId }) => createYouTubeVideoLookupRequest({
        trackIsrc, trackId, spotifyData: { name: "goosebumps", artists: ["Travis Scott"] }, clientVersion: "7.2.0",
    });
    const signals = [];
    let bodyReads = 0;
    const fetchVideoLookup = createYouTubeVideoLookup(async (_url, { signal }) => {
        signals.push(signal);
        return { json: () => { bodyReads++; return body.promise; } };
    });
    const { prefetcher } = loadPrefetcher({ fetchVideoLookup, makeLookupRequest });
    const prefetch = prefetcher.loadVideo(NEXT_URI, nextTrackInfo);
    await new Promise(setImmediate);
    const first = playbackLookup({ fetchVideoLookup, makeVideoLookupRequest: makeLookupRequest });
    const second = playbackLookup({ fetchVideoLookup, makeVideoLookupRequest: makeLookupRequest });
    await new Promise(setImmediate);
    assert.equal(signals.length, 1);
    assert.equal(bodyReads, 1);
    first.stop();
    assert.equal(signals[0].aborted, false);
    body.resolve({ success: true, data: responseVideo });
    await prefetch;
    await new Promise(setImmediate);
    second.stop();
    assert.deepEqual(first.seen, [null]);
    assert.deepEqual(second.seen, [null, responseVideo]);
    assert.equal(prefetcher.cache.get(`prefetch:video:${NEXT_ID}`).data, responseVideo);
});

test("abandoning the queue releases its video lookup without interrupting active playback", async () => {
    const requests = [];
    const makeLookupRequest = () => ({ url: "https://example.test/fixture" });
    const fetchVideoLookup = createYouTubeVideoLookup(async (_url, { signal }) => {
        const body = Promise.withResolvers();
        requests.push({ signal, body });
        return { json: () => body.promise };
    });
    const { prefetcher, calls } = loadPrefetcher({ fetchVideoLookup, makeLookupRequest });
    const first = new AbortController();
    const abandoned = prefetcher.loadVideo(NEXT_URI, nextTrackInfo, { signal: first.signal });
    await new Promise(setImmediate);
    assert.equal(requests.length, 1);
    first.abort();
    assert.equal(requests[0].signal.aborted, true);
    assert.equal(await abandoned, null);

    const second = new AbortController();
    const prefetch = prefetcher.loadVideo(NEXT_URI, nextTrackInfo, { signal: second.signal });
    const playback = playbackLookup({ fetchVideoLookup, makeVideoLookupRequest: makeLookupRequest });
    await new Promise(setImmediate);
    assert.equal(requests.length, 2, "playback joins the second lookup");
    second.abort();
    assert.equal(await prefetch, null);
    assert.equal(requests[1].signal.aborted, false);
    const video = { youtubeVideoId: "active-video", youtubeTitle: "goosebumps", isrc: NEXT_ISRC };
    for (const { body } of requests) body.resolve({ success: true, data: video });
    await new Promise(setImmediate);
    assert.deepEqual(playback.seen, [null, video]);
    assert.equal(prefetcher.getVideoInfo(NEXT_URI), null);
    assert.deepEqual(calls.downloads, []);
    playback.stop();
});

test("playback and prefetch send the same track facts when Spotify only supplies the playing item after transition", async () => {
    const makeLookupRequest = params => createYouTubeVideoLookupRequest({ ...params, clientVersion: "7.2.0" });
    const { prefetcher, calls } = loadPrefetcher({ responseIsrc: NEXT_ISRC, makeLookupRequest });
    await prefetcher.loadVideo(NEXT_URI, { ...nextTrackInfo, isrc: NEXT_ISRC });
    assert.equal(calls.resolveMetadata.isrc, NEXT_ISRC);

    const requests = [];
    const resolved = [];
    const lookup = playbackLookup({
        readSpotifyData: () => null,
        readPlayerItem: () => ({
            uri: NEXT_URI,
            metadata: { title: nextTrackInfo.title, artist_name: nextTrackInfo.artist, album_title: nextTrackInfo.album, isrc: NEXT_ISRC },
        }),
        readSyncDataService: () => ({
            async resolveTrackIsrc(_id, metadata) { resolved.push(metadata); return NEXT_ISRC; },
        }),
        makeVideoLookupRequest: makeLookupRequest,
        async request(url) {
            requests.push(url);
            return { json: async () => ({ success: true, data: { youtubeVideoId: "video-id", youtubeTitle: nextTrackInfo.title } }) };
        },
    });
    await new Promise(setImmediate);
    lookup.stop();
    assert.deepEqual(requests, [String(calls.urls[0])]);
    assert.equal(resolved[0].isrc, NEXT_ISRC);
    assert.equal(lookup.seen[1].youtubeVideoId, "video-id");
});

test("video lookup retries after abort and keeps bypass-cache requests independent", async () => {
    const abort = new AbortController();
    const requests = [];
    const fetchVideoLookup = createYouTubeVideoLookup((url, { signal }) => {
        const body = Promise.withResolvers();
        requests.push({ url, signal, body });
        return { json: () => body.promise };
    });
    const { url } = createYouTubeVideoLookupRequest({ trackIsrc: NEXT_ISRC, trackId: NEXT_ID, clientVersion: "7.2.0" });
    const bypassUrl = `${url}&bypassCache=1`;
    const first = fetchVideoLookup(url, { signal: abort.signal });
    await new Promise(setImmediate);
    abort.abort();
    assert.equal(requests[0].signal.aborted, true);
    await assert.rejects(first, { name: "AbortError" });
    const retried = fetchVideoLookup(url);
    const bypass = fetchVideoLookup(bypassUrl);
    await new Promise(setImmediate);
    requests[0].body.resolve("obsolete");
    await new Promise(setImmediate);
    const joined = fetchVideoLookup(url);
    assert.deepEqual(requests.map(({ url }) => url), [url, url, bypassUrl]);
    requests[1].body.resolve("retry");
    requests[2].body.resolve("fresh");
    assert.deepEqual((await Promise.all([retried, bypass, joined])).map(({ data }) => data), ["retry", "fresh", "retry"]);
});

test("playback ignores a placeholder returned by the video lookup server", async () => {
    const lookup = playbackLookup({
        request: async () => ({
            headers: new Headers({ "X-ivLyrics-Decoy": "1" }),
            json: async () => ({ success: true, data: { youtubeVideoId: "placeholder", youtubeTitle: "goosebumps" } }),
        }),
    });
    await new Promise(setImmediate);
    lookup.stop();
    assert.deepEqual(lookup.seen, [null, null]);
    assert.deepEqual(lookup.errors, ["videoBackground.notFound"]);
});

test("random community lookup receives the active signal and never falls through after a source is cancelled", async () => {
    const random = Promise.withResolvers();
    let receivedSignal;
    let reads = 0;
    const lookup = playbackLookup({
        readVisualSettings: () => ({ "community-video-random": true }),
        getRandomCommunityVideo(_uri, { signal }) { receivedSignal = signal; return random.promise; },
        selectedVideoStore: { async getSelectedVideo() { reads++; return null; } },
    });
    lookup.stop();
    random.resolve(null);
    await new Promise(setImmediate);
    assert.equal(receivedSignal.aborted, true);
    assert.equal(reads, 0);
    assert.deepEqual(lookup.seen, [null]);
});
