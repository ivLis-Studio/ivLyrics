import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const index = readFileSync(new URL("../index.js", import.meta.url), "utf8");
const motion = readFileSync(new URL("../MotionLyrics.js", import.meta.url), "utf8");
const pronunciation = readFileSync(new URL("../PronunciationFirst.js", import.meta.url), "utf8");

test("index.js threads the target track uri into motion direction prefetch", () => {
  assert.match(index, /this\._prefetchMotionDirection\(trackInfo,\s*lyrics\)/);
  assert.match(index, /await motion\.requestDirection\(\{\s*trackUri:\s*uri,/);
});

test("index.js threads the target track uri into pronunciation timing prefetch", () => {
  assert.match(index, /this\._prefetchPronunciationTiming\(trackInfo,\s*lyrics\)/);
  assert.match(index, /pf\.ensureTimed\(\{\s*trackUri:\s*uri,/);
});

test("motion requestDirection derives trackId from the captured trackUri", () => {
  assert.match(motion, /const trackId = trackIdOf\(trackUri\);/);
  assert.match(motion, /await cache\?\.setMotionDirection\?\.\(trackId,/);
});

test("pronunciation ensureTimed captures trackId from the captured trackUri before async work", () => {
  assert.match(pronunciation, /const trackId = window\.LyricsService\?\.extractTrackId\?\.\(trackUri\) \|\| trackUri;/);
  assert.match(pronunciation, /writeCache\(trackId,/);
});

test("motion and pronunciation prefetch are gated by their own toggles and the translation toggle", () => {
  assert.match(index, /CONFIG\.visual\["prefetch-translation-enabled"\] !== false/);
  assert.match(index, /CONFIG\.visual\["prefetch-motion-enabled"\] !== false/);
  assert.match(index, /CONFIG\.visual\["prefetch-pronunciation-timing-enabled"\] !== false/);
});
