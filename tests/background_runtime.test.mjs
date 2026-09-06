import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const indexSource = readFileSync(new URL("../index.js", import.meta.url), "utf8");
const cacheStart = indexSource.indexOf("const CacheManager = {");
const cacheEnd = indexSource.indexOf("\n// window에 등록", cacheStart);
assert.ok(cacheStart >= 0 && cacheEnd > cacheStart);

test("memory cache keeps lyric references, expiry and LRU without traversing lyric data", () => {
  let now = 0;
  let serializationReads = 0;
  const context = vm.createContext({ Date: { now: () => now } });
  vm.runInContext(`${indexSource.slice(cacheStart, cacheEnd)}\nglobalThis.cache = CacheManager;`, context);
  const cache = context.cache;
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

const serviceSource = readFileSync(new URL("../LyricsService.js", import.meta.url), "utf8");
const senderStart = serviceSource.indexOf("const OverlaySender = {");
const workerStart = serviceSource.indexOf("        startProgressSync() {", senderStart);
const workerEnd = serviceSource.indexOf("        setupOffsetListener() {", workerStart);
assert.ok(senderStart >= 0 && workerStart > senderStart && workerEnd > workerStart);

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
  vm.runInContext(`
    const cleanupWorker = (worker) => { worker.postMessage('stop'); worker.terminate(); };
    globalThis.sender = { enabled: true, isConnected: true, ${serviceSource.slice(workerStart, workerEnd)} };
  `, context);
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
