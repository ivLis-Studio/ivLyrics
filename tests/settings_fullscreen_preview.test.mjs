import assert from "node:assert/strict";
import test from "node:test";
import { createSettingsFullscreenPreview } from "#ivlyrics/features/settings/createSettingsFullscreenPreview.mjs";

const elements = node => Array.isArray(node) ? node.flatMap(elements)
  : node?.props ? [node, ...elements(node.props.children)] : [];
const hasClass = (node, value) => (node?.props.className || "").split(" ").includes(value);

function preview(values = {}, view = "normal") {
  const visual = { "fullscreen-tv-show-controls": false, "fullscreen-tv-show-progress": false, ...values };
  const saved = JSON.stringify(visual);
  const react = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) };
  const { SettingsFullscreenPreview } = createSettingsFullscreenPreview({ react, getVisual: () => visual, useSettingsConfigRevision() {},
    normalizeSettingsHexColor: value => value,
    getCurrentSettingsBackgroundMode: () => visual["solid-background"] ? "solid-background" : "gradient-background",
  });
  const tree = SettingsFullscreenPreview({ view }), all = elements(tree);
  assert.equal(JSON.stringify(visual), saved, "preview cannot change saved settings");
  const find = name => all.filter(node => hasClass(node, name));
  const within = (name, child) => find(name).flatMap(elements).filter(node => hasClass(node, child));
  return { tree, all, find, within };
}

test("normal preview keeps playback progress and volume inside its album controls, not a global bottom bar", () => {
  const p = preview();
  assert.equal(p.find("settings-fs-player").length, 1);
  assert.equal(p.within("settings-fs-col-art", "settings-fs-player").length, 1);
  assert.equal(p.within("is-left", "settings-fs-progress").length, 1);
  assert.equal(p.within("settings-fs-controls", "settings-fs-progress").length, 0);
  assert.equal(p.within("settings-fs-control-surface", "settings-fs-volume").length, 1);
  assert.equal(p.find("is-bottom").length, 0);
  assert.equal(p.find("settings-fs-info")[0].props.children.filter(Boolean).length, 3, "album name is on by default");
});

test("player, progress, volume and background switches have the same independent dependencies as playback", () => {
  for (const controls of [true, false]) for (const progress of [true, false]) for (const volume of [true, false]) {
    const p = preview({ "fullscreen-show-controls": controls, "fullscreen-show-progress": progress,
      "fullscreen-show-volume": volume, "fullscreen-controls-background": true });
    assert.equal(p.find("settings-fs-controls").length, Number(controls));
    assert.equal(p.find("settings-fs-progress").length, Number(progress));
    assert.equal(p.find("settings-fs-volume").length, Number(controls && volume));
    assert.equal(p.find("has-bg").length, Number(controls));
  }
});

test("the album player keeps its timeline inside the control surface", () => {
  const p = preview({ "fullscreen-controls-background": true });
  assert.equal(p.within("settings-fs-control-surface", "settings-fs-progress").length, 1);
  const rows = p.find("is-left").find(node => hasClass(node, "settings-fs-player")).props.children.filter(Boolean);
  assert.equal(rows.length, 1, "the timeline is a row of the surface, not a sibling above it");
  const timelineOnly = preview({ "fullscreen-show-controls": false });
  assert.equal(timelineOnly.find("settings-fs-progress").length, 1);
  assert.equal(timelineOnly.find("settings-fs-control-surface").length, 0,
    "without transport buttons the album column keeps its bare timeline row");
});

test("the bottom player keeps its timeline inside the control surface", () => {
  const p = preview({ "fullscreen-controls-position": "bottom", "fullscreen-controls-background": true });
  assert.equal(p.within("settings-fs-control-surface", "settings-fs-progress").length, 1);
  const rows = p.find("is-bottom").find(node => hasClass(node, "settings-fs-player")).props.children.filter(Boolean);
  assert.equal(rows.length, 1, "the timeline is a row of the surface, not a sibling above it");
  assert.ok(hasClass(rows[0], "settings-fs-control-surface"));
  const timelineOnly = preview({ "fullscreen-controls-position": "bottom", "fullscreen-show-controls": false,
    "fullscreen-controls-background": true });
  assert.equal(timelineOnly.find("settings-fs-controls").length, 0);
  assert.equal(timelineOnly.find("settings-fs-control-surface").length, 1);
  assert.equal(timelineOnly.within("settings-fs-control-surface", "settings-fs-progress").length, 1);
  assert.equal(timelineOnly.find("has-bg").length, 1, "the timeline-only surface follows the background setting");
  assert.equal(preview({ "fullscreen-controls-position": "bottom", "fullscreen-show-controls": false })
    .find("has-bg").length, 0);
});

test("reversed and single-column layouts keep actual album/control ownership", () => {
  for (const view of ["normal", "cd"]) {
    const reversed = preview({ "fullscreen-layout-reverse": true }, view);
    assert.ok(hasClass(reversed.find("settings-fs-col-art")[0], "is-right"));
    assert.ok(hasClass(reversed.find("settings-fs-col-lyrics")[0], "is-left"));
    const single = preview({ "fullscreen-two-column": false }, view);
    assert.equal(single.find("settings-fs-col-art").length, 0);
    assert.equal(single.find("settings-fs-player").length, 0);
    assert.ok(hasClass(single.find("settings-fs-col-lyrics")[0], "is-single"));
    const bottom = preview({ "fullscreen-controls-position": "bottom" }, view);
    assert.equal(bottom.within("settings-fs-col-art", "settings-fs-player").length, 0);
    assert.equal(bottom.within("is-bottom", "settings-fs-progress").length, 1);
  }
});

test("CD artwork and metadata obey their toggles without disabling the independent controls", () => {
  const p = preview({ "fullscreen-show-album": false, "fullscreen-show-info": false }, "cd");
  assert.equal(p.find("settings-fs-cd").length, 0);
  assert.equal(p.find("settings-fs-info").length, 0);
  assert.equal(p.find("settings-fs-controls").length, 1);
  assert.equal(p.find("settings-fs-progress").length, 1);
});

test("CD rotation follows its own switch/speed and stops for reduced motion without moving the spectrum", () => {
  for (const [settings, spinning] of [[{}, true], [{ "fullscreen-cd-rotation-enabled": false }, false],
    [{ "reduce-motion": true }, false]]) {
    const p = preview({ ...settings, "fullscreen-cd-rotation-speed": 150 }, "cd");
    const disc = p.all.find(node => node.type?.name === "SettingsCdDiscPreview");
    assert.ok(disc);
    assert.equal(disc.props.rotation, spinning);
    assert.equal(disc.props.rotationSpeed, 150);
    const tree = disc.type(disc.props), nodes = elements(tree);
    assert.equal(nodes.find(node => hasClass(node, "settings-cd-artwork")).props.style["--cd-rotation-period"], "16s",
      "150% uses the production 24-second base period");
    assert.equal(nodes.filter(node => hasClass(node, "is-spinning")).length, Number(spinning));
    assert.equal(nodes.filter(node => hasClass(node, "is-spinning") && node.type === "g").length, 0,
      "the visualizer group must not rotate with the album artwork");
  }
});

test("clock and next-track share the top-right rail while context and lyric progress have their own corners", () => {
  const p = preview({ "fullscreen-clock-show-seconds": true, "fullscreen-show-lyrics-progress": true });
  assert.equal(p.within("settings-fs-top-right", "settings-fs-clock").length, 1);
  assert.equal(p.find("settings-fs-clock")[0].props.children[0], "21:47:08");
  assert.equal(p.within("settings-fs-top-right", "settings-fs-next").length, 1);
  assert.equal(p.find("settings-fs-context").length, 1);
  assert.equal(p.find("settings-fs-lprog").length, 1);
  for (const [key, className] of [["clock", "clock"], ["next-track", "next"], ["context", "context"],
    ["lyrics-progress", "lprog"], ["queue", "queue"]]) {
    const off = preview({ "fullscreen-show-lyrics-progress": true, [`fullscreen-show-${key}`]: false });
    assert.equal(off.find(`settings-fs-${className}`).length, 0, key);
  }
});

test("TV preview uses its own controls, progress and album-name switches, independent of normal-mode options", () => {
  for (const controls of [true, false]) for (const progress of [true, false]) {
    const p = preview({ "fullscreen-show-controls": !controls, "fullscreen-show-progress": !progress,
      "fullscreen-tv-show-controls": controls, "fullscreen-tv-show-progress": progress,
      "fullscreen-tv-show-album-name": false, "fullscreen-show-album-name": true }, "tv");
    assert.equal(p.tree.props["data-preview-mode"], "tv");
    assert.equal(p.find("settings-fs-controls").length, Number(controls));
    assert.equal(p.find("settings-fs-progress").length, Number(progress));
    assert.equal(p.find("settings-fs-context").length, 0);
    assert.equal(p.find("settings-fs-volume").length, 0);
    assert.equal(p.find("settings-fs-info")[0].props.children.filter(Boolean).length, 2);
  }
  assert.equal(preview({ "fullscreen-tv-mode": true }, "basic").tree.props["data-preview-mode"], "tv");
  assert.equal(preview({ "fullscreen-tv-mode": true }, "normal").tree.props["data-preview-mode"], "normal");
  const p = preview({ "fullscreen-tv-show-controls": true, "fullscreen-tv-show-progress": true,
    "fullscreen-show-lyrics-progress": true }, "tv");
  assert.equal(p.within("settings-fs-tv-stack", "settings-fs-lprog").length, 1);
  const rows = p.find("is-tv").find(node => hasClass(node, "settings-fs-player")).props.children.filter(Boolean);
  assert.ok(hasClass(rows[0], "settings-fs-control-surface"));
  assert.ok(hasClass(rows[1], "settings-fs-progress-row"), "TV timeline is below its transport, not above it");
});

test("LP preview excludes normal overlays and keeps stage progress independent from transport controls", () => {
  const p = preview({ "fullscreen-show-controls": false, "fullscreen-show-progress": true,
    "fullscreen-show-lyrics-progress": true, "fullscreen-vinyl-lyrics-enabled": false }, "vinyl");
  assert.equal(p.within("is-stage", "settings-fs-progress").length, 1);
  assert.equal(p.find("settings-fs-controls").length, 0);
  for (const name of ["clock", "context", "next", "lprog", "queue", "vinyl-lyrics", "volume"]) {
    assert.equal(p.find(`settings-fs-${name}`).length, 0, name);
  }
  const off = preview({ "fullscreen-show-progress": false }, "vinyl");
  assert.equal(off.find("settings-fs-progress").length, 0);
  assert.equal(off.find("settings-fs-controls").length, 1);
});

test("LP central artwork rotation is independent from the record animation switch", () => {
  for (const animations of [true, false]) for (const center of [true, false]) {
    const p = preview({ "fullscreen-vinyl-animations": animations, "fullscreen-vinyl-center-rotation": center }, "vinyl");
    assert.equal(hasClass(p.find("settings-fs-record")[0], "is-spin"), animations);
    assert.equal(hasClass(p.find("settings-fs-record-label")[0], "is-spin"), animations && center);
  }
});

test("fullscreen backdrop follows the selected mode, colour, brightness and noise without mutating settings", () => {
  const p = preview({ "solid-background": true, "solid-background-color": "#123456", noise: true });
  assert.ok(hasClass(p.tree, "bg-solid-background"));
  assert.ok(hasClass(p.tree, "has-noise"));
  assert.equal(p.tree.props.style["--preview-solid"], "#123456");
  assert.equal(p.tree.props.style["--preview-dim"], 0);
  assert.equal(preview({ "background-brightness": 100 }).tree.props.style["--preview-dim"], 0);
});
