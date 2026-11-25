import { createLyricsModeLockStore } from "../src/lyrics/lyricsRenderModes.mjs";
import { AUTOMATIC_LYRICS_MODE_PRIORITY, createLyricsPageModes } from "../src/lyrics/lyricsPageModes.mjs";
import assert from "node:assert/strict";
import test from "node:test";

const createSelector = (state = {}, karaokeEnabled = true, rememberModeLock = () => {}) => {
  const page = { state: { lockedMode: -1, explicitMode: -1, ...state } };
  const modes = createLyricsPageModes({
    page,
    readVisualSettings: () => ({ "karaoke-mode-enabled": karaokeEnabled }),
    rememberModeLock,
  });
  return { page, ...modes };
};

const lyrics = [{ text: "Test lyric", startTime: 1000, endTime: 2000 }];

test("defaults word-timed provider lyrics to character rendering without changing source metadata", () => {
  const state = {
    provider: "open-lyrics",
    karaokeGranularity: "word",
    karaoke: lyrics,
    synced: lyrics,
    unsynced: lyrics,
  };
  const selector = createSelector(state);
  assert.equal(selector.getAutomaticMode(), 0);
  assert.equal(selector.getCurrentMode(), 0);
  assert.equal(selector.page.state.karaokeGranularity, "word");
  assert.strictEqual(selector.page.state.karaoke, lyrics);
  assert.equal(selector.getAutomaticMode({ ...state, karaokeGranularity: "character" }), 0);
});

test("falls back to line, plain, or unavailable according to actual lyric data and karaoke setting", () => {
  const selector = createSelector();
  assert.equal(selector.getAutomaticMode({ synced: lyrics, unsynced: lyrics }), 1);
  assert.equal(selector.getAutomaticMode({ unsynced: lyrics }), 2);
  assert.equal(selector.getAutomaticMode({}), -1);
  assert.equal(selector.getAutomaticMode(null), -1);
  assert.equal(createSelector({ karaoke: lyrics, synced: lyrics, unsynced: lyrics }, false).getCurrentMode(), 1);
  assert.equal(createSelector({ karaoke: lyrics, unsynced: lyrics }, false).getCurrentMode(), 2);
});

test("uses word rendering before line or plain when only word rendering is available", () => {
  assert.deepEqual(AUTOMATIC_LYRICS_MODE_PRIORITY, [0, 3, 1, 2]);
});

test("keeps explicit choices and persistent locks ahead of automatic selection", () => {
  const state = { karaoke: lyrics, synced: lyrics, unsynced: lyrics, karaokeGranularity: "word" };
  assert.equal(createSelector({ ...state, explicitMode: 3 }).getCurrentMode(), 3);
  assert.equal(createSelector({ ...state, lockedMode: 1, explicitMode: 3 }).getCurrentMode(), 1);
  assert.equal(createSelector({ ...state, lockedMode: 3, explicitMode: 0 }).getCurrentMode(), 3);
  assert.equal(createSelector({ synced: lyrics, lockedMode: 3 }).getCurrentMode(), 1);
  assert.equal(createSelector({ ...state, explicitMode: 3 }, false).getCurrentMode(), 1);
});

test("choosing another mode while a lock is in effect moves the lock to that mode", () => {
  const remembered = [];
  const { rememberLyricsRenderModeLock } = createLyricsModeLockStore({
    storage: { setItem: (_key, value) => remembered.push(Number(value)) }, debug: () => {},
  });
  const selector = createSelector(
    { karaoke: lyrics, synced: lyrics, unsynced: lyrics, lockedMode: 0, explicitMode: 0 },
    true,
    rememberLyricsRenderModeLock,
  );
  const { page } = selector;
  page.resolveLyricsForMode = () => lyrics;
  page.setState = (update) => {
    page.state = { ...page.state, ...(typeof update === "function" ? update(page.state) : update) };
  };

  selector.switchTo(1);
  assert.equal(selector.page.state.lockedMode, 1);
  assert.equal(selector.getCurrentMode(), 1);
  assert.deepEqual(remembered, [1]);

  // Choosing the locked mode again keeps the lock as it is.
  selector.switchTo(1);
  assert.deepEqual(remembered, [1]);

  // A lock on a mode this track cannot show is left alone; the choice applies to this track only.
  remembered.length = 0;
  page.state = { synced: lyrics, unsynced: lyrics, lockedMode: 3, explicitMode: -1 };
  selector.switchTo(2);
  assert.equal(selector.page.state.lockedMode, 3);
  assert.equal(selector.getCurrentMode(), 2);
  assert.deepEqual(remembered, []);
});
