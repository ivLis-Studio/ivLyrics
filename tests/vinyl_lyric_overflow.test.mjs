import assert from "node:assert/strict";
import test from "node:test";
import { createHarness, OVERFLOW, MEASURING } from "./fixtures/vinyl-render-harness.mjs";

const assertWrapped = row => {
  assert.equal(row.viewport.classList.contains(OVERFLOW), false, "wrapped text must have no clipping mask");
  assert.equal(row.viewport.classList.contains(MEASURING), false, "natural-width measurement must not persist");
  assert.equal(row.content.style.transform, "", "wrapped text must have no retained scroll offset");
};
const assertScrolling = (row, offset) => {
  assert.equal(row.viewport.classList.contains(OVERFLOW), true);
  assert.equal(row.viewport.classList.contains(MEASURING), false);
  assert.equal(row.content.style.transform, `translate3d(${offset.toFixed(3)}px, 0, 0)`);
};

test("original and auxiliary geometry uses two layout batches regardless of row count", () => {
  for (const count of [1, 3, 8]) {
    const layoutAudit = { dirty: false, flushes: 0 };
    const h = createHarness({ rows: Array.from({ length: count }, () => ({ naturalWidth: 600 })), layoutAudit });
    assert.equal(layoutAudit.flushes, 2, "natural and padded widths each share one layout across rows");
    h.rows.forEach(row => assertScrolling(row, -170));
    layoutAudit.flushes = 0;
    h.render({ positionOverride: 7000 });
    assert.equal(layoutAudit.flushes, 0, "playback transforms do not measure layout");
    h.notifyLayoutChange();
    assert.equal(layoutAudit.flushes, 2, "resize remeasurement also batches all rows");
    h.unmount();
  }
});

test("timed original and auxiliary rows retain hold, traversal, end hold, and RTL direction", () => {
  const h = createHarness({ rows: [
    { naturalWidth: 600 },
    { naturalWidth: 400, direction: "rtl" },
    { naturalWidth: 200 },
  ] });
  for (const [positionOverride, progress] of [[1000, 0], [4000, 0], [6000, 0.5], [8000, 1], [11000, 1]]) {
    h.render({ positionOverride });
    assertScrolling(h.rows[0], -340 * progress);
    assertScrolling(h.rows[1], 140 * progress);
    assertWrapped(h.rows[2]);
  }
  // Seeking back restores the beginning, rather than continuing a wall-clock marquee.
  h.render({ positionOverride: 2000 });
  assertScrolling(h.rows[0], 0);
  h.unmount();
  h.rows.forEach(assertWrapped);
});

test("disabling and restoring LP animations clears clipping and resumes at current progress", () => {
  const h = createHarness();
  assertScrolling(h.rows[0], -170);
  h.render({ motionEnabled: false });
  assertWrapped(h.rows[0]);
  h.render({ positionOverride: 8000 });
  assertWrapped(h.rows[0]);
  h.render({ motionEnabled: true });
  assertScrolling(h.rows[0], -340);
  h.unmount();
});

test("OS reduced motion wraps immediately and can be toggled without a React render", () => {
  const h = createHarness({ reducedMotion: true });
  assertWrapped(h.rows[0]);
  h.setReducedMotion(false);
  assertScrolling(h.rows[0], -170);
  h.setReducedMotion(true);
  assertWrapped(h.rows[0]);
  h.unmount();
});

test("missing or invalid line intervals remain wrapped and recover when timing arrives", () => {
  for (const endTime of [undefined, NaN, 1000, 500]) {
    const h = createHarness({ lyrics: [{ text: "Long lyric", startTime: 1000, endTime }] });
    assertWrapped(h.rows[0]);
    // Same index, start time and settings revision: end-time correction must remeasure.
    h.render({ lyrics: [{ text: "Long lyric", startTime: 1000, endTime: 11000 }] });
    assertScrolling(h.rows[0], -170);
    h.render({ lyrics: [{ text: "Long lyric", startTime: 1000 }] });
    assertWrapped(h.rows[0]);
    h.unmount();
  }
});

test("switching to wrapped video or plain fallback presentation drops old scroll state", () => {
  const h = createHarness();
  assertScrolling(h.rows[0], -170);
  h.render({ singleLineScroll: false });
  assertWrapped(h.rows[0]);
  h.render({ positionOverride: 8000, singleLineScroll: true });
  assertScrolling(h.rows[0], -340);
  h.unmount();
});

test("resizing or replacing text clears obsolete overflow and later detects longer content", () => {
  const h = createHarness();
  const row = h.rows[0];
  row.viewport.clientWidth = 800;
  h.notifyLayoutChange();
  assertWrapped(row);
  row.viewport.clientWidth = 300;
  h.notifyLayoutChange();
  assertScrolling(row, -170);
  row.viewport.naturalWidth = 250;
  h.notifyLayoutChange();
  assertWrapped(row);
  row.viewport.naturalWidth = 800;
  h.notifyLayoutChange();
  assertScrolling(row, -270);
  h.unmount();
});

test("hidden and near-fitting rows do not retain measurement or mask classes", () => {
  const h = createHarness({ rows: [{ width: 0 }, { naturalWidth: 300.5 }] });
  h.rows.forEach(assertWrapped);
  h.unmount();
});

test("wrapped lyrics preserve manual scrolling within a line and reset after delayed arrival or line change", () => {
  // Keep valid fallback timing before and after arrival so mounting the first
  // startTime:0 lyric must initialize the hook independently of timing changes.
  const h = createHarness({ lyrics: [], durationMs: 20000, motionEnabled: false });
  assert.equal(h.render({}), null);
  h.scrollArea.scrollTop = 80;
  h.render({ lyrics: [
    { text: "First long wrapped lyric", startTime: 0, endTime: 10000 },
    { text: "Second long wrapped lyric", startTime: 10000, endTime: 20000 },
  ] });
  assert.equal(h.scrollArea.scrollTop, 0, "delayed lyrics initialize at their beginning");
  assertWrapped(h.rows[0]);

  h.scrollArea.scrollTop = 120;
  h.render({ positionOverride: 7000 });
  h.notifyLayoutChange();
  assert.equal(h.scrollArea.scrollTop, 120, "playback and remeasurement must not undo manual reading position");

  h.render({ activeLineIndex: 1, positionOverride: 12000 });
  assert.equal(h.scrollArea.scrollTop, 0, "the next lyric starts at the top");
  h.unmount();
});

test("overflow holds skip repeated transforms while resize and seek still apply current geometry", () => {
  const h = createHarness({ positionOverride: 1000 });
  const row = h.rows[0];
  let writes = row.content.transformWriteCount();
  for (let positionOverride = 1017; positionOverride < 4000; positionOverride += 17) h.render({ positionOverride });
  assert.equal(row.content.transformWriteCount(), writes);
  assertScrolling(row, 0);
  h.render({ positionOverride: 6000 });
  assertScrolling(row, -170);
  row.viewport.naturalWidth = 800;
  h.notifyLayoutChange();
  assertScrolling(row, -270);
  h.render({ positionOverride: 6100 });
  assertScrolling(row, -283.5);
  h.render({ positionOverride: 8000 });
  writes = row.content.transformWriteCount();
  for (let positionOverride = 8017; positionOverride < 11000; positionOverride += 17) h.render({ positionOverride });
  assert.equal(row.content.transformWriteCount(), writes);
  assertScrolling(row, -540);
  h.render({ positionOverride: 2000 });
  assertScrolling(row, 0);
  h.unmount();
});

test("live LP playback slides overflowing rows on every display frame and rests during holds", () => {
  const clock = { position: 1000 };
  const h = createHarness({ positionOverride: null, liveClock: clock });
  assertScrolling(h.rows[0], 0);
  assert.equal(h.pendingFrames(), 0, "the start hold does not keep a frame loop alive");
  // The slide runs from 30% to 70% of the 10 s line (4 s to 8 s): 340 px.
  // A playback commit wakes the frame loop; each display frame then samples the clock.
  clock.position = 4000;
  h.render({}, false);
  const offsets = [];
  for (let frame = 1; frame <= 12; frame++) {
    clock.position = 4000 + frame * 1000 / 120;
    h.runFrame();
    offsets.push(h.rows[0].content.style.transform);
  }
  assert.equal(new Set(offsets).size, offsets.length, "each 120 Hz frame advances the slide");
  assertScrolling(h.rows[0], -340 * (12 * 1000 / 120) / 4000);
  // Paused playback: the clock stops, the loop rests after its quiet frames.
  h.flushFrames();
  assert.equal(h.pendingFrames(), 0);
  const writes = h.rows[0].content.transformWriteCount();
  h.render({});
  h.flushFrames();
  assert.equal(h.rows[0].content.transformWriteCount(), writes, "a resting clock writes nothing");
  // A seek wakes the loop and applies the new position.
  clock.position = 9000;
  h.render({});
  assertScrolling(h.rows[0], -340);
  h.unmount();
});

test("observer remeasurement between playback commits preserves the latest live slide", () => {
  const clock = { position: 4000 };
  const h = createHarness({ positionOverride: null, liveClock: clock, rows: [
    { naturalWidth: 600 },
    { naturalWidth: 400, direction: "rtl" },
  ] });
  clock.position = 5000;
  h.render({}, false);
  clock.position = 5033.333;
  h.runFrame();
  assertScrolling(h.rows[0], -87.833305);
  assertScrolling(h.rows[1], 36.166655);
  const offsets = h.rows.map(row => row.content.style.transform);

  // The live tick is already queued when the observer schedules measurement.
  // Inspect this frame before another tick can hide a one-frame rollback.
  h.notifyLayoutChange(false);
  h.runFrame();
  assert.deepEqual(h.rows.map(row => row.content.style.transform), offsets);
  h.runFrame();
  assert.deepEqual(h.rows.map(row => row.content.style.transform), offsets);
  h.unmount();
});

test("paused live remeasurement retains its pose and follows real seeks without a playback commit", () => {
  const clock = { position: 4000 };
  const h = createHarness({ positionOverride: null, liveClock: clock });
  clock.position = 5000;
  h.render({}, false);
  clock.position = 6000;
  h.runFrame();
  h.flushFrames();
  assertScrolling(h.rows[0], -170);
  assert.equal(h.pendingFrames(), 0, "the frozen playback clock lets the loop rest");

  for (const [position, offset] of [[6000, -170], [4500, -42.5], [2000, 0], [9000, -340]]) {
    clock.position = position;
    h.notifyLayoutChange(false);
    h.runFrame();
    assertScrolling(h.rows[0], offset);
    h.flushFrames();
    assertScrolling(h.rows[0], offset);
    assert.equal(h.pendingFrames(), 0, "remeasurement must settle at the paused or sought position");
  }
  h.unmount();
});

test("remeasurement uses revised valid timing with a live clock or an explicit position", () => {
  for (const live of [false, true]) {
    const clock = { position: 5000 };
    const h = createHarness({ positionOverride: live ? null : 5000, liveClock: clock });
    assertScrolling(h.rows[0], -85);
    // Same index/start/settings and valid timing: the measuring effect stays mounted.
    h.render({ lyrics: [{ text: "A long original lyric", startTime: 1000, endTime: 21000 }] }, false);
    clock.position = 10000;
    h.notifyLayoutChange(false);
    h.runFrame();
    assertScrolling(h.rows[0], live ? -127.5 : 0);
    h.flushFrames();
    assertScrolling(h.rows[0], live ? -127.5 : 0);
    h.unmount();
  }
});

test("live remeasurement keeps motion disabled and resumes at the current clock position", () => {
  const clock = { position: 5000 };
  const h = createHarness({ positionOverride: null, liveClock: clock });
  h.render({ motionEnabled: false });
  clock.position = 6000;
  h.notifyLayoutChange();
  assertWrapped(h.rows[0]);
  assert.equal(h.pendingFrames(), 0);
  h.render({ motionEnabled: true });
  assertScrolling(h.rows[0], -170);

  h.setReducedMotion(true);
  clock.position = 7000;
  h.notifyLayoutChange();
  assertWrapped(h.rows[0]);
  assert.equal(h.pendingFrames(), 0);
  h.setReducedMotion(false);
  assertScrolling(h.rows[0], -255);
  h.unmount();
});

test("live LP playback runs no frame loop for rows that fit", () => {
  const clock = { position: 4000 };
  const h = createHarness({ rows: [{ naturalWidth: 200 }], positionOverride: null, liveClock: clock });
  for (const position of [4000, 5000, 6000, 9000]) {
    clock.position = position;
    h.render({}, false);
    assert.equal(h.pendingFrames(), 0);
  }
  assert.equal(h.rows[0].content.transformWriteCount(), 0);
  h.unmount();
});
