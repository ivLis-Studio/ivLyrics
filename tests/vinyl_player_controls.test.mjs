import assert from "node:assert/strict";
import test from "node:test";
import { createAppConfig } from "../src/spicetify/createAppConfig.mjs";
import { startMotionLyrics } from "../src/features/motion/motionApi.mjs";
import { createHarness, elements, first, second } from "./fixtures/vinyl-controls-harness.mjs";

test("focused playback keeps timing on its own track and suppresses the outgoing motion stage", () => {
  const Stage = () => null;
  const ActiveLyric = () => null;
  const sampled = [];
  startMotionLyrics({ host: { ivLyricsMotionLyrics: {
    initialized: true, Stage, hasRealTiming(lyrics) { sampled.push(lyrics); return true; },
  } } });
  const oldLyrics = [{ text: "First", startTime: 2000 }];
  const newLyrics = [{ text: "Second", startTime: 1000 }];
  const h = createHarness({
    presentationMode: "motion", track: first, lyricsTrackUri: first.uri,
    activeLyrics: oldLyrics, activeLyricsKaraoke: true, karaokeRenderGranularity: "word",
    activeLyricRenderer: ActiveLyric,
  });
  const find = (component) => elements(h.tree).find(node => node.type === component);
  assert.equal(find(Stage).props.trackUri, first.uri);
  assert.deepEqual(sampled, [oldLyrics]);

  h.render({ track: second });
  assert.equal(find(Stage), undefined);
  assert.equal(find(ActiveLyric), undefined);
  assert.equal(elements(h.tree).some(node => node.props.className === "fullscreen-motion-notice"), false);
  assert.deepEqual(sampled, [oldLyrics]);

  h.render({ activeLyrics: newLyrics, lyricsTrackUri: second.uri });
  assert.equal(find(Stage).props.trackUri, second.uri);
  assert.equal(find(Stage).props.lyrics, newLyrics);
  h.render({ presentationMode: "video" });
  assert.equal(find(ActiveLyric).props.trackUri, second.uri);
  assert.equal(find(ActiveLyric).props.karaokeRenderGranularity, "word");
  h.unmount();
});

test("a track change cancels the tonearm drag and its pending pointer release", () => {
  const seeks = [];
  const h = createHarness({
    component: "VinylPlayer", trackUri: first.uri, tonearmStyle: "linear", animationsEnabled: false,
    position: 20000, duration: 200000, onSeek: position => seeks.push(position),
  });
  const tonearm = () => elements(h.tree).find(node => node.props.role === "slider").props;
  const pointer = (clientX, buttons = 1) => ({
    pointerId: 1, pointerType: "mouse", clientX, buttons,
    preventDefault() {}, stopPropagation() {},
  });
  tonearm().onPointerDown(pointer(170));
  h.render();
  tonearm().onPointerMove(pointer(122.5));
  h.render();
  assert.equal(tonearm()["aria-valuenow"], 120000);

  tonearm().onPointerMove(pointer(122.5, 0));
  assert.equal(h.timerCount, 1);
  h.render({ trackUri: second.uri, position: 8500 });
  h.advance(90);
  tonearm().onPointerUp(pointer(122.5, 0));
  h.render();
  assert.deepEqual(seeks, []);
  assert.equal(tonearm()["aria-valuenow"], 8500);
  assert.equal(h.timerCount, 0);
  h.unmount();
});

test("disabling track changes swaps metadata immediately while preserving the playing record", () => {
  const h = createHarness({ vinylSettings: { trackChangeAnimation: false, rotationSpeed: 150 } });
  h.render({ track: second });
  assert.equal(h.player().title, second.title);
  assert.equal(h.player().incomingTrack, null);
  assert.equal(h.player().isPlaying, true);
  assert.equal(h.player().animationsEnabled, true);
  assert.equal(h.player().rotationSpeed, 150);
  assert.equal(h.timerCount, 0);
  h.unmount();
});

test("the default sleeve handoff still runs, and metadata updates never restart it", () => {
  const h = createHarness();
  h.render({ track: second });
  assert.match(h.tree.props.className, /is-track-record-clearing/);
  assert.equal(h.player().title, first.title);
  h.advance(190);
  assert.match(h.tree.props.className, /is-track-record-sleeving/);
  h.render({ track: { ...second, title: "Translated second" } });
  assert.match(h.tree.props.className, /is-track-record-sleeving/);
  assert.equal(h.player().incomingTrack.title, "Translated second");
  h.advance(3100);
  assert.equal(h.player().title, "Translated second");
  assert.equal(h.player().incomingTrack, null);
  assert.doesNotMatch(h.tree.props.className, /is-track-/);
  h.render({ track: { ...second, title: "Simplified title" } });
  assert.equal(h.player().title, "Simplified title");
  assert.equal(h.timerCount, 0);
  h.unmount();
});

test("disabling track changes mid-handoff cancels all delayed stale-track work", () => {
  const h = createHarness();
  h.render({ track: second });
  h.advance(1000);
  h.render({ vinylSettings: { trackChangeAnimation: false } });
  assert.equal(h.player().title, second.title);
  assert.equal(h.player().incomingTrack, null);
  assert.equal(h.timerCount, 0);
  h.advance(5000);
  assert.equal(h.player().title, second.title);
  h.unmount();
});

test("master, app and live OS reduced-motion settings override track transitions", () => {
  for (const setting of [{ animations: false }, { reducedMotion: true }, {}]) {
    const h = createHarness({ vinylSettings: setting });
    if (setting.animations !== false && !setting.reducedMotion) {
      h.render({ track: second });
      assert.ok(h.timerCount > 0);
      h.setReducedMotion(true);
    } else h.render({ track: second });
    assert.match(h.tree.props.className, /is-motion-disabled/);
    assert.equal(h.player().title, second.title);
    assert.equal(h.timerCount, 0);
    h.unmount();
  }
});

test("LP and CD speed updates retain their independent CSS clocks without changing entrance animations", () => {
  for (const component of ["VinylPlayer", "CompactAlbumVinyl"]) {
    const clock = { animationName: component === "VinylPlayer" ? "ivlyrics-vinyl-spin-clock" : "ivlyrics-cd-spin", currentTime: 1375, playbackRate: 1,
      updatePlaybackRate(rate) { this.playbackRate = rate; } };
    const entrance = { animationName: "fullscreen-compact-vinyl-in", updatePlaybackRate() { assert.fail("entrance speed must remain independent"); } };
    const h = createHarness({ component, clocks: [clock, entrance], centerRotationEnabled: false });
    for (const [value, rate] of [[150, 1.5], ["50", 0.5], [999, 2], [-10, 0.25], [0, 0.25], [NaN, 1], [undefined, 1]]) {
      h.render({ rotationSpeed: value, cdSettings: { rotationSpeed: value }, isPlaying: false });
      assert.equal(clock.playbackRate, rate);
      assert.equal(clock.currentTime, 1375, "speed changes retain paused rotation phase");
    }
    h.render({ isPlaying: true });
    assert.equal(clock.currentTime, 1375);
    h.unmount();
  }
});

test("the former compact presentation renders the CD face without a sleeve, groove label or tonearm", () => {
  const h = createHarness({ component: "CompactAlbumVinyl" });
  assert.match(h.tree.props.className, /ivlyrics-cd-stage/);
  assert.equal(elements(h.tree).filter(node => node.type === "img").length, 1);
  assert.equal(elements(h.tree).find(node => node.type === "img").props.src, first.coverUrl);
  assert.ok(elements(h.tree).some(node => node.props.className === "ivlyrics-cd-hub"));
  assert.ok(elements(h.tree).some(node => node.props.className === "ivlyrics-cd-rim"));
  assert.equal(elements(h.tree).some(node => /ivlyrics-vinyl-(sleeve|record|label|tonearm)/.test(node.props.className || "")), false);
  assert.equal(h.tree.props["data-visualizer-status"], "unavailable", "a missing optional module must not break the album view");
  h.render({ cdSettings: { enabled: false, discSize: 140, rotationEnabled: false } });
  assert.equal(h.tree.props["data-visualizer-status"], "disabled");
  assert.equal(h.tree.props.style["--iv-cd-scale"], 1.4);
  assert.match(h.tree.props.className, /is-motion-disabled/);
  assert.equal(elements(h.tree).some(node => node.props.className === "ivlyrics-cd-status"), false);
  h.render({ cdSettings: { discSize: "invalid" }, reducedMotion: true });
  assert.equal(h.tree.props.style["--iv-cd-scale"], 1);
  assert.match(h.tree.props.className, /is-motion-disabled/);
  h.unmount();
});

test("CD motion follows playback, its own toggle and live OS reduce-motion preference", () => {
  const h = createHarness({ component: "CompactAlbumVinyl", isPlaying: true });
  assert.match(h.tree.props.className, /is-playing/);
  assert.doesNotMatch(h.tree.props.className, /is-motion-disabled/);
  h.setReducedMotion(true);
  assert.match(h.tree.props.className, /is-motion-disabled/);
  h.setReducedMotion(false);
  h.render({ isPlaying: false, cdSettings: { rotationEnabled: true } });
  assert.match(h.tree.props.className, /is-paused/);
  h.unmount();
});

test("the CD shares only its fixed disc bounds with album view transitions", () => {
  const h = createHarness({ component: "CompactAlbumVinyl", coverClassName: "lyrics-fullscreen-album-art ivlyrics-fullscreen-shared-album with-shadow" });
  const shared = elements(h.tree).filter(node => node.props.className?.split(/\s+/).includes("ivlyrics-fullscreen-shared-album"));
  assert.equal(shared.length, 1);
  assert.equal(shared[0].type, "div");
  assert.equal(shared[0].props.className, "ivlyrics-cd-disc ivlyrics-fullscreen-shared-album");
  assert.equal(elements(h.tree).some(node => /lyrics-fullscreen-album-art|with-shadow/.test(node.props.className || "")), false);
  h.unmount();
});

test("CD analysis failure dismisses once, survives settings updates, and resets only on a new track", () => {
  const h = createHarness({ component: "CompactAlbumVinyl" });
  const notice = () => elements(h.tree).find(node => node.props.className?.startsWith("ivlyrics-cd-status"));
  assert.equal(notice().props.className, "ivlyrics-cd-status");
  h.advance(3199);
  assert.equal(notice().props.className, "ivlyrics-cd-status");
  h.advance(1);
  assert.match(notice().props.className, /is-dismissed/);
  h.render({ cdSettings: { style: "line", albumGradient: false } });
  assert.match(notice().props.className, /is-dismissed/, "changing settings must not repeat an unavailable notice");
  assert.equal(h.timerCount, 0);
  h.render({ track: second });
  assert.equal(notice().props.className, "ivlyrics-cd-status");
  h.render({ cdSettings: { enabled: false } });
  assert.equal(notice(), undefined);
  assert.equal(h.timerCount, 0);
  h.render({ cdSettings: { enabled: true } });
  assert.equal(notice().props.className, "ivlyrics-cd-status");
  h.unmount();
});

test("saved LP preferences reload with bounded speeds and unchanged defaults", () => {
  const readVisual = (speed, animation) => createAppConfig({
    storage: {
      get: (key, fallback = true) =>
        key === "ivLyrics:visual:fullscreen-vinyl-track-change-animation" ? animation ?? fallback : fallback,
      getItem: (key) => key === "ivLyrics:visual:fullscreen-vinyl-rotation-speed" ? speed : null,
      getPersisted: () => null,
      setItem() {},
    },
  }).visual;
  for (const [stored, speed] of [[null, 100], ["175", 175], ["-10", 25], ["400", 200], ["invalid", 100]]) {
    const config = readVisual(stored);
    assert.equal(config["fullscreen-vinyl-rotation-speed"], speed);
    assert.equal(config["fullscreen-vinyl-track-change-animation"], true);
  }
  const config = readVisual("50", false);
  assert.equal(config["fullscreen-vinyl-track-change-animation"], false);
  assert.equal(config["fullscreen-vinyl-rotation-speed"], 50);
});
