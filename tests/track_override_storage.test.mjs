import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import vm from "node:vm";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const source = readFileSync(new URL("../index.js", import.meta.url), "utf8");
const baseline = execFileSync("git", ["show", "98e6a4167c72f80b422ec77461852d9da12f97e9:index.js"], {
  cwd: repoRoot, encoding: "utf8",
});
const slice = (text, from, to) => {
  const start = text.indexOf(from);
  const end = text.indexOf(to, start);
  assert.ok(start >= 0 && end > start, `missing section ${from}`);
  return text.slice(start, end);
};
const serialize = (value) => value === undefined ? "[undefined]" : JSON.parse(JSON.stringify(value));
const databases = [
  ["TrackLanguageDB", "ivLyrics-lang-db", "track-language-overrides", "getLanguage", "setLanguage", "clearLanguage", "ja"],
  ["TrackLyricsProviderDB", "ivLyrics-provider-db", "track-lyrics-provider-overrides", "getProvider", "setProvider", "clearProvider", "paxsenix"],
  ["TrackBackgroundDB", "ivLyrics-background-db", "track-background-overrides", "getOverride", "setOverride", "clearOverride", "gradient-background"],
];

// Explicit event queues exercise request success/error separately from transaction
// completion, and allow concurrent opens to complete in either order.
const load = (text, { fault = "", seeded = [] } = {}) => {
  const trace = [];
  const tasks = [];
  const stores = new Map();
  let nextConnection = 0;
  let activeFault = fault;
  const fail = (stage) => {
    if (activeFault !== stage) return false;
    activeFault = "";
    return true;
  };
  const error = (stage) => new Error(`${stage} failed`);
  const schedule = (kind, callback) => tasks.push({ kind, callback });
  const indexedDB = {
    open(name, version) {
      trace.push(["open", name, version]);
      if (fail("open:throw")) throw error("open:throw");
      const request = {};
      const connection = ++nextConnection;
      schedule("open", () => {
        if (fail("open")) {
          request.error = error("open");
          request.onerror();
          return;
        }
        if (!stores.has(name)) stores.set(name, { name: null, values: new Map(seeded) });
        const state = stores.get(name);
        const db = {
          objectStoreNames: { contains: (storeName) => state.name === storeName },
          createObjectStore(storeName) { state.name = storeName; trace.push(["create", name, storeName]); },
          transaction(storeNames, mode) {
            trace.push(["transaction", name, connection, [...storeNames], mode]);
            if (fail("transaction")) throw error("transaction");
            const transaction = {
              objectStore(storeName) {
                trace.push(["store", storeName]);
                assert.equal(storeName, state.name);
                if (fail("objectStore")) throw error("objectStore");
                const run = (operation, args, result) => {
                  trace.push([operation, ...args.map(serialize)]);
                  if (fail(`${operation}:throw`)) throw error(`${operation}:throw`);
                  const request = {};
                  schedule(operation, () => {
                    if (fail(operation)) {
                      request.error = error(operation);
                      request.onerror();
                    } else {
                      request.result = result();
                      request.onsuccess();
                    }
                    if (operation === "put" || operation === "delete") {
                      schedule("complete", () => {
                        trace.push(["complete"]);
                        transaction.oncomplete?.();
                      });
                    }
                  });
                  return request;
                };
                return {
                  get: (key) => run("get", [key], () => state.values.get(key)),
                  put: (value, key) => run("put", [value, key], () => { state.values.set(key, value); return key; }),
                  delete: (key) => run("delete", [key], () => state.values.delete(key)),
                  getAllKeys: () => run("getAllKeys", [], () => [...state.values.keys()].sort()),
                  getAll: () => run("getAll", [], () => [...state.values.keys()].sort().map((key) => state.values.get(key))),
                };
              },
            };
            return transaction;
          },
        };
        request.result = db;
        request.onupgradeneeded({ target: request });
        request.onsuccess();
      });
      return request;
    },
  };
  const context = vm.createContext({
    indexedDB, window: {},
    ivLyricsDebug: (...args) => trace.push(["debug", ...args]),
    console: { error: (message, value) => trace.push(["error", message, value?.message]) },
  });
  const start = text.includes("const createTrackOverrideDB =")
    ? "// Track overrides share storage mechanics" : "// IndexedDB for track language overrides";
  vm.runInContext(
    slice(text, "const IVLYRICS_BACKGROUND_MODE_IDS =", "const IVLYRICS_BACKGROUND_FLAG_IDS")
      + slice(text, "function normalizeIvLyricsTrackBackgroundOverride", "function getIvLyricsTrackBackgroundMode")
      + slice(text, start, "// Migrate from localStorage to IndexedDB"), context,
  );
  const microtasks = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
  return {
    api: context.window, trace, tasks,
    observe(promise) {
      const outcome = { status: "pending" };
      promise.then((value) => {
        outcome.status = "fulfilled";
        outcome.value = serialize(value);
        trace.push(["fulfilled", outcome.value]);
      }, (reason) => {
        outcome.status = "rejected";
        outcome.error = reason?.message;
        trace.push(["rejected", outcome.error]);
      });
      return outcome;
    },
    async step(index = 0) {
      await microtasks();
      assert.ok(tasks[index], "expected a queued IndexedDB event");
      tasks.splice(index, 1)[0].callback();
      await microtasks();
    },
    async settle(promise) {
      const outcome = this.observe(promise);
      for (let i = 0; i < 20; i++) {
        await microtasks();
        if (tasks.length) await this.step();
        else if (outcome.status !== "pending") return outcome;
      }
      assert.fail("storage operation did not settle");
    },
  };
};

const compare = async (options, exercise) => {
  const old = load(baseline, options);
  const current = load(source, options);
  const before = await exercise(old);
  const after = await exercise(current);
  assert.deepEqual(after, before);
  assert.deepEqual(current.trace, old.trace, "database calls, event ordering and diagnostics must match");
  return after;
};

for (const [apiName, dbName, storeName, get, set, clear, sample] of databases) {
  test(`${apiName}: reads, writes, empty values, missing values, enumeration and deletion match v6.6.5`, async () => {
    await compare({}, async (h) => {
      const api = h.api[apiName];
      assert.deepEqual(Object.keys(api), [get, set, clear, "getAllOverrides"]);
      const results = [await h.settle(api.getAllOverrides()), await h.settle(api[get]("missing"))];
      for (const [index, value] of [sample, "", false, 0, null, { mode: "video-background", extra: "discard" }].entries()) {
        results.push(await h.settle(api[set](`track-${index}`, value)));
        results.push(await h.settle(api[get](`track-${index}`)));
      }
      results.push(await h.settle(api.getAllOverrides()));
      results.push(await h.settle(api[clear]("track-0")), await h.settle(api[clear]("missing")));
      results.push(await h.settle(api[get]("track-0")));
      assert.equal(h.trace.filter(([type]) => type === "open").length, 1);
      assert.ok(h.trace.some((entry) => entry[0] === "create" && entry[1] === dbName && entry[2] === storeName));
      return results;
    });
  });

  test(`${apiName}: open and request failures preserve fallback versus rejection`, async () => {
    for (const method of [get, set, clear, "getAllOverrides"]) {
      const operation = { [get]: "get", [set]: "put", [clear]: "delete", getAllOverrides: "getAllKeys" }[method];
      const faults = ["open", "open:throw", "transaction", "objectStore", operation, `${operation}:throw`];
      if (method === "getAllOverrides") faults.push("getAll");
      for (const fault of faults) {
        const result = await compare({ fault }, async (h) => h.settle(h.api[apiName][method]("track", sample)));
        assert.equal(result.status, fault.startsWith("open") ? "fulfilled" : "rejected", `${method} ${fault}`);
      }
    }
  });

  test(`${apiName}: writes settle on request success before transaction completion`, async () => {
    await compare({}, async (h) => {
      const outcome = h.observe(h.api[apiName][set]("track", sample));
      await h.step(); // open
      await h.step(); // put success
      assert.equal(outcome.status, "fulfilled");
      assert.equal(h.tasks[0].kind, "complete");
      await h.step();
      return outcome;
    });
  });

  test(`${apiName}: concurrent opens, reverse completion, cached connection and retry retain ordering`, async () => {
    await compare({}, async (h) => {
      const first = h.observe(h.api[apiName][get]("first"));
      const second = h.observe(h.api[apiName][get]("second"));
      assert.equal(h.tasks.length, 2);
      await h.step(1); // second connection opens first
      await h.step(0); // first connection becomes the cached connection
      await h.step();
      await h.step();
      await h.settle(h.api[apiName][get]("cached"));
      assert.equal(h.trace.filter(([type]) => type === "open").length, 2);
      assert.equal(h.trace.filter(([type]) => type === "transaction").at(-1)[2], 1);
      return [first, second];
    });
    await compare({ fault: "open" }, async (h) => [
      await h.settle(h.api[apiName][get]("failed")),
      await h.settle(h.api[apiName][get]("retry")),
    ]);
  });
}

test("background enumeration normalizes legacy values and excludes invalid rows", async () => {
  const result = await compare({ seeded: [
    ["legacy", "colorful"], ["object", { mode: "none", extra: "ignored" }],
    ["invalid", "bogus"], ["empty", ""], ["null", null], ["zero", 0],
  ] }, async (h) => h.settle(h.api.TrackBackgroundDB.getAllOverrides()));
  assert.deepEqual(result.value, { legacy: { mode: "colorful" }, object: { mode: "none" } });
});

test("invalid background setter keeps its delegated-clear error handling", async () => {
  const result = await compare({ fault: "delete" }, async (h) => h.settle(h.api.TrackBackgroundDB.setOverride("track", "invalid")));
  assert.deepEqual(result, { status: "fulfilled", value: "[undefined]" });
});
