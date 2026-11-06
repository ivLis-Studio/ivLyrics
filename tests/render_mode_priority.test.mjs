import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../index.js", import.meta.url), "utf8");
const constantsStart = source.indexOf("const KARAOKE =");
const constantsEnd = source.indexOf("const VINYL_TYPOGRAPHY_DEFAULT_SCALE", constantsStart);
const methodsStart = source.indexOf("  isModeAvailable(mode,");
const methodsEnd = source.indexOf("\n  render() {", methodsStart);
assert.ok(constantsStart >= 0 && constantsEnd > constantsStart);
assert.ok(methodsStart >= 0 && methodsEnd > methodsStart);

const createSelector = (state = {}, karaokeEnabled = true) => {
  const context = vm.createContext({
    CONFIG: { visual: { "karaoke-mode-enabled": karaokeEnabled } },
  });
  vm.runInContext(
    `${source.slice(constantsStart, constantsEnd)}
     class ModeSelector { ${source.slice(methodsStart, methodsEnd)} }
     globalThis.selector = new ModeSelector();`,
    context
  );
  context.selector.state = { lockedMode: -1, explicitMode: -1, ...state };
  return context.selector;
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
  assert.equal(selector.state.karaokeGranularity, "word");
  assert.strictEqual(selector.state.karaoke, lyrics);
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
  const selector = createSelector();
  const available = new Set([3, 1, 2]);
  selector.isModeAvailable = (mode) => available.has(mode);
  assert.equal(selector.getAutomaticMode(), 3);
  available.add(0);
  assert.equal(selector.getAutomaticMode(), 0);
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
  const switchStart = source.indexOf("  switchTo(mode) {");
  const switchEnd = source.indexOf("\n  toggleModeLock(", switchStart);
  assert.ok(switchStart >= 0 && switchEnd > switchStart);
  const remembered = [];
  const context = vm.createContext({
    CONFIG: { visual: { "karaoke-mode-enabled": true } },
    StorageManager: { setItem: (_key, value) => remembered.push(Number(value)) },
    ivLyricsDebug: () => {},
  });
  vm.runInContext(
    `${source.slice(constantsStart, constantsEnd)}
     class ModeSelector { ${source.slice(methodsStart, methodsEnd)} ${source.slice(switchStart, switchEnd)} }
     globalThis.selector = new ModeSelector();`,
    context
  );
  const selector = context.selector;
  selector.resolveLyricsForMode = () => lyrics;
  selector.setState = (update) => {
    selector.state = { ...selector.state, ...(typeof update === "function" ? update(selector.state) : update) };
  };

  selector.state = { karaoke: lyrics, synced: lyrics, unsynced: lyrics, lockedMode: 0, explicitMode: 0 };
  selector.switchTo(1);
  assert.equal(selector.state.lockedMode, 1);
  assert.equal(selector.getCurrentMode(), 1);
  assert.deepEqual(remembered, [1]);

  // Choosing the locked mode again keeps the lock as it is.
  selector.switchTo(1);
  assert.deepEqual(remembered, [1]);

  // A lock on a mode this track cannot show is left alone; the choice applies to this track only.
  remembered.length = 0;
  selector.state = { synced: lyrics, unsynced: lyrics, lockedMode: 3, explicitMode: -1 };
  selector.switchTo(2);
  assert.equal(selector.state.lockedMode, 3);
  assert.equal(selector.getCurrentMode(), 2);
  assert.deepEqual(remembered, []);
});
