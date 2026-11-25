import assert from "node:assert/strict";
import test from "node:test";
import { createSpotifyArtworkColors } from "../src/core/spotifyArtworkColors.mjs";
import { createPanelAlbumPalette, startPanelBackground } from "../src/lyrics/panelLyricsBackground.mjs";

test("panel album colors prefer Spotify artwork colors and retain the track swatch fallback", async () => {
    const calls = [];
    const graphQL = {
        Definitions: { getDynamicColorsByUris: "dynamic", fetchExtractedColorForTrackEntity: "track" },
        async Request(definition, variables) {
            calls.push([definition, variables]);
            if (definition === "track") throw new Error("No track color");
            return { data: { getDynamicColorsByUris: [{
                minContrast: { backgroundBase: { red: 1, green: 0.5 } },
            }] } };
        },
    };
    const artworkColors = createSpotifyArtworkColors({
        readGraphQL: () => graphQL,
        readCosmos: () => ({
            async get(url) {
                calls.push(["swatch", url]);
                return { entries: [{ color_swatches: [{ preset: "VIBRANT_NON_ALARMING", color: 0x5078a0 }] }] };
            },
        }),
    });
    const trackUri = "spotify:track:first";
    let artworkUrl = "https://i.scdn.co/image/cover";
    const loadAlbumPalette = createPanelAlbumPalette({ artworkColors, readArtworkUrl: () => artworkUrl });

    assert.deepEqual(await loadAlbumPalette(trackUri), {
        c1: { r: 255, g: 128, b: 0 }, c2: { r: 184, g: 92, b: 0 }, c3: { r: 122, g: 61, b: 0 },
    });
    assert.deepEqual(calls, [["dynamic", { imageUris: [artworkUrl] }]]);

    artworkUrl = "";
    calls.length = 0;
    assert.deepEqual((await loadAlbumPalette(trackUri)).c1, { r: 62, g: 94, b: 125 });
    assert.deepEqual(calls, [
        ["track", { uri: trackUri }],
        ["swatch", "https://spclient.wg.spotify.com/colorextractor/v1/extract-presets?uri=spotify:track:first&format=json"],
    ]);
});

test("background writes stay scoped to the current track, settings, and mounted panel", async () => {
    const playerEvents = new EventTarget();
    const settingsEvents = new EventTarget();
    const styles = new Map();
    const classes = new Map();
    const section = {
        isConnected: true,
        classList: { toggle: (name, enabled) => classes.set(name, enabled) },
        style: { setProperty: (name, value) => styles.set(name, value) },
    };
    let trackUri = "spotify:track:first";
    let mode = "album";
    let fontRefreshes = 0;
    const requests = [];
    const stop = startPanelBackground({
        playerEvents, settingsEvents,
        readTrackUri: () => trackUri,
        readSections: () => [section],
        readSetting: (key, fallback) => key.endsWith("panel-bg-type") ? mode : fallback,
        loadAlbumPalette(uri) {
            const { promise, resolve } = Promise.withResolvers();
            requests.push({ uri, resolve });
            return promise;
        },
        reinjectStyles() { fontRefreshes += 1; },
    });
    const palette = (red) => {
        const color = { r: red, g: 0, b: 0 };
        return { c1: color, c2: color, c3: color };
    };
    const changeSettings = (name) => settingsEvents.dispatchEvent(new CustomEvent("ivLyrics", { detail: { name } }));

    trackUri = "spotify:track:second";
    playerEvents.dispatchEvent(new Event("songchange"));
    assert.deepEqual(requests.map(({ uri }) => uri), ["spotify:track:first", trackUri]);
    requests[1].resolve(palette(80));
    await Promise.resolve();
    requests[0].resolve(palette(20));
    await Promise.resolve();
    assert.equal(styles.get("background"), "rgba(80, 0, 0, 0.3)");
    assert.equal(styles.get("--ivlyrics-panel-gradient-opacity"), "0.72");
    assert.equal(classes.get("blur-gradient-bg"), true);

    changeSettings("panel-lyrics-original-font");
    assert.equal(fontRefreshes, 1);
    mode = "transparent";
    changeSettings("panel-bg-type");
    requests[2].resolve(palette(80));
    await Promise.resolve();
    assert.equal(styles.get("background"), "transparent");
    assert.equal(styles.get("backdrop-filter"), "none");
    assert.equal(classes.get("blur-gradient-bg"), false);

    mode = "album";
    changeSettings("panel-bg-type");
    section.isConnected = false;
    requests[3].resolve(palette(40));
    await Promise.resolve();
    assert.equal(styles.get("background"), "transparent");

    section.isConnected = true;
    playerEvents.dispatchEvent(new Event("songchange"));
    stop();
    requests[4].resolve(palette(60));
    await Promise.resolve();
    playerEvents.dispatchEvent(new Event("songchange"));
    assert.equal(requests.length, 5);
    assert.equal(styles.get("background"), "transparent");
});
