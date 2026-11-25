import assert from "node:assert/strict";
import test from "node:test";
import { createPageTrackPresentation } from "../src/lyrics/pageTrackPresentation.mjs";

const track = "spotify:track:qa";
const defer = () => {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
};

const palette = (red, green, blue) => ({ minContrast: { backgroundBase: { red, green, blue } } });

function fixture({
    readTrackColorHex = async () => "#123456", readDynamicColors = async () => palette(1, 0.25, 0),
    fetchAudioFeatures = async () => null, deferUpdates = false,
} = {}) {
    const updates = [];
    const covers = [];
    const inputs = { mode: "blur-gradient-background", artwork: "current-cover", visual: {} };
    const pendingUpdates = [];
    const page = {
        _isComponentMounted: true,
        _lyricsTransitionSeq: 1,
        currentTrackUri: track,
        isPlaybackUriCurrent: (uri) => uri === page.currentTrackUri,
        getEffectiveBackgroundMode: () => inputs.mode,
        setState(updater) {
            const commit = () => {
                const patch = updater();
                if (patch) updates.push(patch);
            };
            if (deferUpdates) pendingUpdates.push(commit);
            else commit();
        },
    };
    const presentation = createPageTrackPresentation({
        page, fetchAudioFeatures,
        spotifyArtworkColors: {
            readTrackColorHex,
            readTrackColorSwatch: async () => assert.fail("color hex should be available"),
            readDynamicColors: (cover) => {
                covers.push(cover);
                return readDynamicColors(cover);
            },
        },
        readCurrentArtwork: () => inputs.artwork,
        readVisualSettings: () => inputs.visual,
        extractTrackId: () => "qa",
        convertIntToRGB: (color) => color.toString(16),
    });
    return { page, updates, covers, inputs, commitUpdates: () => pendingUpdates.splice(0).forEach(commit => commit()), ...presentation };
}

test("an obsolete color lookup does not read the current track's artwork", async () => {
    const old = defer();
    let reads = 0;
    const h = fixture({ readTrackColorHex: () => ++reads === 1 ? old.promise : Promise.resolve("#abcdef") });
    const pending = h.fetchColors(track);
    const next = "spotify:track:second";
    h.page.currentTrackUri = next;
    h.page._lyricsTransitionSeq++;
    await h.fetchColors(next);
    old.resolve("#111111");
    await pending;
    assert.deepEqual(h.covers, ["current-cover"]);
    assert.equal(h.updates.length, 1);
    assert.equal(h.updates[0].colorsUri, next);
    assert.equal(h.updates[0].colors.background, "abcdef");
    assert.equal(h.updates[0].dynamicColors.minContrast, "#ff4000");
});

test("track load and repeated background settings share the same artwork requests", async () => {
    const accent = defer(), gradient = defer();
    let accentReads = 0;
    const h = fixture({
        readTrackColorHex: () => { accentReads++; return accent.promise; },
        readDynamicColors: () => gradient.promise,
    });
    const first = h.fetchColors(track);
    assert.equal(h.fetchColors(track), first);
    accent.resolve("#123456");
    await Promise.resolve();
    await Promise.resolve();
    h.inputs.mode = "video-background";
    h.inputs.visual["video-fallback-background"] = "blur-gradient";
    assert.equal(h.fetchColors(track), first);
    gradient.resolve(palette(1, 0.25, 0));
    await first;
    await h.fetchColors(track);
    assert.equal(accentReads, 1);
    assert.deepEqual(h.covers, ["current-cover"]);
    assert.equal(h.updates.length, 1);
});

test("an artwork change reuses the accent and prevents an old gradient from being applied", async () => {
    const old = defer(), started = defer();
    let accentReads = 0;
    const h = fixture({
        readTrackColorHex: async () => { accentReads++; return "#123456"; },
        readDynamicColors: artwork => {
            if (artwork !== "current-cover") return Promise.resolve(palette(0, 1, 0));
            started.resolve();
            return old.promise;
        },
    });
    const previous = h.fetchColors(track);
    await started.promise;
    h.inputs.artwork = "new-cover";
    await h.fetchColors(track);
    old.resolve(palette(1, 0, 0));
    await previous;
    assert.equal(accentReads, 1);
    assert.deepEqual(h.covers, ["current-cover", "new-cover"]);
    assert.deepEqual(h.updates.map(update => update.dynamicColors.minContrast), ["#00ff00"]);
});

test("a background change during accent loading uses the latest setting", async () => {
    const accent = defer();
    const h = fixture({ readTrackColorHex: () => accent.promise });
    h.inputs.mode = "solid-background";
    const pending = h.fetchColors(track);
    h.inputs.mode = "blur-gradient-background";
    accent.resolve("#123456");
    await pending;
    assert.deepEqual(h.covers, ["current-cover"]);
    assert.equal(h.updates.length, 1);
    assert.equal(h.updates[0].dynamicColors.minContrast, "#ff4000");
});

test("queued React color and tempo updates recheck playback identity when they commit", async () => {
    const h = fixture({ deferUpdates: true });
    await Promise.all([h.fetchColors(track), h.fetchTempo(track)]);
    h.page.currentTrackUri = "spotify:track:second";
    h.page._lyricsTransitionSeq++;
    h.commitUpdates();
    assert.deepEqual(h.updates, []);
    await h.fetchColors(h.page.currentTrackUri);
    h.commitUpdates();
    assert.equal(h.updates[0].colorsUri, h.page.currentTrackUri);
});

test("audio-feature data from a prior presentation cannot repaint after navigation", async () => {
    const old = defer();
    let calls = 0;
    const h = fixture({ fetchAudioFeatures: () => ++calls === 1 ? old.promise : Promise.resolve(null) });
    const pending = h.fetchTempo(track);
    h.page._isComponentMounted = false;
    h.cancelPending();
    h.page._isComponentMounted = true;
    await h.fetchTempo(track);
    old.resolve({ tempo: 150 });
    await pending;
    assert.deepEqual(h.updates, [{ tempo: "0.2s" }]);
});
