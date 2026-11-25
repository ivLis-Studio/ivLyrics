import { bundleFixtureImports } from "./fixtures/legacy-page-source.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { createPageTranslationMemoryCache, pageLyricsMemoryCache } from "../src/lyrics/pageMemoryCache.mjs";
import { readPageLyricsSource, writePageLyricsSource } from "../src/lyrics/pageLyricsSourceCache.mjs";

test("the shared source cache retains 100 recently used tracks through its legacy object interface", t => {
  const cache = pageLyricsMemoryCache;
  const uris = Array.from({ length: 102 }, (_, index) => `spotify:track:${String(index).padStart(22, "0")}`);
  const first = { provider: "spotify", synced: [{ text: "Keep the recently reread track" }] };
  t.after(() => { for (const uri of uris) delete cache[uri]; });

  writePageLyricsSource(cache, uris[0], first, 7);
  for (const uri of uris.slice(1, 100)) cache[uri] = { provider: "spotify" };
  assert.strictEqual(cache[uris[0]], first);

  Object.assign(cache, { [uris[100]]: { provider: "lrcred" } });
  assert.equal(Object.keys(cache).length, 100);
  assert.ok(!(uris[1] in cache));
  assert.strictEqual(readPageLyricsSource(cache, uris[0], 7), first);
  assert.equal(readPageLyricsSource(cache, uris[0], 8), undefined, "cached provider revisions still invalidate");

  delete cache[uris[2]];
  cache[uris[101]] = { provider: "spotify" };
  assert.equal(Object.keys(cache).length, 99);
  assert.ok(cache[uris[3]], "removing tracks directly leaves their positions available");
});

test("memory cache keeps lyric references, expiry and LRU without traversing lyric data", () => {
  let now = 0;
  let serializationReads = 0;
  const cache = createPageTranslationMemoryCache({ now: () => now });
  cache._ttl = 100;
  cache._maxSize = 4;
  const lyrics = [{ text: "original", syllables: [{ text: "word", startTime: 1 }] }];
  Object.defineProperty(lyrics, "toJSON", {
    get() {
      serializationReads += 1;
      return undefined;
    },
  });

  cache.set("track:lyrics", lyrics);
  assert.strictEqual(cache.get("track:lyrics"), lyrics);
  assert.equal(serializationReads, 0);
  now = 1;
  cache.set("oldest", []);
  now = 2;
  cache.set("newer", []);
  now = 3;
  cache.set("newest", []);
  now = 4;
  assert.strictEqual(cache.get("track:lyrics"), lyrics);
  cache.set("overflow", []);
  assert.equal(cache.get("oldest"), null);
  assert.strictEqual(cache.get("track:lyrics"), lyrics);
  now = 101;
  assert.equal(cache.get("track:lyrics"), null);
});

test("replacing a cached translation refreshes recency without evicting someone else's lyrics", () => {
  const cache = createPageTranslationMemoryCache({ now: () => 10 });
  cache._maxSize = 4;
  cache.enableStats();
  for (const key of ["one", "two", "three", "four"]) cache.set(key, [key]);

  const replacement = ["updated"];
  cache.set("one", replacement);
  assert.equal(cache.getStats().cacheSize, 4);
  assert.equal(cache.getStats().evictions, 0);
  cache.set("five", ["five"]);
  assert.equal(cache.get("two"), null);
  assert.strictEqual(cache.get("one"), replacement);
});

test("small translation caches also respect their size limit", () => {
  const cache = createPageTranslationMemoryCache();
  cache._maxSize = 2;
  for (const key of ["one", "two", "three"]) cache.set(key, [key]);
  assert.equal(cache.getStats().cacheSize, 2);
  assert.equal(cache.get("one"), null);
});

const progressFixture = bundleFixtureImports(
  'import { createOverlayProgress } from "#ivlyrics/features/overlay/overlayProgress.mjs";'
    + 'globalThis.sender = { enabled: true, isConnected: true, ...createOverlayProgress({ getSpicetify: () => ({}) }) };',
  "fixtureOverlayProgress",
);

const createSender = ({ failWorker = false } = {}) => {
  const urls = new Set();
  const workers = [];
  let createdCount = 0;
  const context = vm.createContext({
    Blob,
    URL: {
      createObjectURL() {
        const url = `blob:test-${++createdCount}`;
        urls.add(url);
        return url;
      },
      revokeObjectURL(url) { urls.delete(url); },
    },
    Worker: class {
      constructor(url) {
        assert.ok(urls.has(url), "the worker must receive a live URL");
        if (failWorker) throw new Error("worker startup failed");
        this.messages = [];
        workers.push(this);
      }
      postMessage(message) { this.messages.push(message); }
      terminate() { this.terminated = true; }
    },
  });
  vm.runInContext(progressFixture, context);
  return { sender: context.sender, urls, workers };
};

test("overlay worker starts once, restarts after stop, and releases each Blob URL", () => {
  const { sender, urls, workers } = createSender();
  sender.startProgressSync();
  sender.startProgressSync();
  assert.equal(workers.length, 1);
  assert.deepEqual(workers[0].messages, ["start"]);
  assert.equal(urls.size, 0);
  sender.stopProgressSync();
  assert.equal(workers[0].terminated, true);
  assert.deepEqual(workers[0].messages, ["start", "stop"]);
  sender.startProgressSync();
  assert.equal(workers.length, 2);
  assert.equal(urls.size, 0);
  sender.stopProgressSync();
});

test("overlay worker releases its Blob URL when startup fails", () => {
  const { sender, urls } = createSender({ failWorker: true });
  assert.throws(() => sender.startProgressSync(), /worker startup failed/);
  assert.equal(urls.size, 0);
  assert.equal(sender._worker, undefined);
});
