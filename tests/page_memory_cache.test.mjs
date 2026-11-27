import assert from "node:assert/strict";
import test from "node:test";
import { createPageTranslationMemoryCache } from "../src/lyrics/pageMemoryCache.mjs";

test("init schedules one expiry sweep and does not observe the window's performance entries", (t) => {
  const observed = [];
  const originalObserver = globalThis.PerformanceObserver;
  globalThis.PerformanceObserver = class {
    constructor() { observed.push("created"); }
    observe(options) { observed.push(options); }
  };
  t.after(() => { globalThis.PerformanceObserver = originalObserver; });
  const intervals = [];
  t.mock.method(globalThis, "setInterval", (callback, delay) => {
    intervals.push(delay);
    return intervals.length;
  });

  const cache = createPageTranslationMemoryCache();
  cache.init();
  cache.init();

  assert.deepEqual(intervals, [5 * 60 * 1000]);
  assert.deepEqual(observed, []);
});

test("entries still expire after the TTL and the least recently used entry is evicted at the limit", () => {
  let time = 0;
  const cache = createPageTranslationMemoryCache({ now: () => time });
  cache.set("a", 1);
  time = 30 * 60 * 1000;
  assert.equal(cache.get("a"), 1);
  time += 1;
  assert.equal(cache.get("a"), null);

  for (let index = 0; index < 100; index++) cache.set("key-" + index, index);
  assert.equal(cache.get("key-0"), 0);
  cache.set("key-100", 100);
  assert.equal(cache.get("key-0"), 0, "a recently read entry survives eviction");
  assert.equal(cache.get("key-1"), null, "the least recently used entry is evicted");
});
