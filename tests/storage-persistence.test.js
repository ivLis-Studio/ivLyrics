const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(
  path.join(__dirname, "..", "StoragePersistence.js"),
  "utf8"
);
const manifest = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "manifest.json"), "utf8")
);

class MemoryStorage {
  constructor(entries = new Map()) {
    this.entries = entries;
  }

  get length() {
    return this.entries.size;
  }

  key(index) {
    return Array.from(this.entries.keys())[index] ?? null;
  }

  getItem(key) {
    return this.entries.has(String(key)) ? this.entries.get(String(key)) : null;
  }

  setItem(key, value) {
    this.entries.set(String(key), String(value));
  }

  removeItem(key) {
    this.entries.delete(String(key));
  }
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function createIndexedDb(state) {
  return {
    open() {
      const request = {};
      queueMicrotask(() => {
        const database = {
          objectStoreNames: {
            contains: (name) => state.stores.has(name),
          },
          createObjectStore(name) {
            if (!state.stores.has(name)) state.stores.set(name, new Map());
          },
          transaction(name, mode) {
            const transaction = { mode, error: null };
            const records = state.stores.get(name);
            transaction.objectStore = () => ({
              get(key) {
                const getRequest = {};
                queueMicrotask(() => {
                  getRequest.result = clone(records.get(key));
                  getRequest.onsuccess?.();
                });
                return getRequest;
              },
              put(value) {
                records.set(value.namespace, clone(value));
                queueMicrotask(() => transaction.oncomplete?.());
              },
            });
            return transaction;
          },
          close() {},
        };

        request.result = database;
        if (!state.stores.has("snapshots")) {
          request.onupgradeneeded?.({ target: request });
        }
        request.onsuccess?.();
      });
      return request;
    },
  };
}

async function runModule({
  localEntries = new Map(),
  indexedState = { stores: new Map() },
  sessionEntries = new Map(),
} = {}) {
  const localStorage = new MemoryStorage(localEntries);
  const sessionStorage = new MemoryStorage(sessionEntries);
  let reloadCount = 0;
  const namespace = "test-user";
  const platformStorage = {
    namespace,
    getItem(key) {
      const value = localStorage.getItem(`${namespace}:${key}`);
      return value === null ? null : JSON.parse(value);
    },
    setItem(key, value) {
      localStorage.setItem(`${namespace}:${key}`, JSON.stringify(value));
    },
    clearItem(key) {
      localStorage.removeItem(`${namespace}:${key}`);
    },
  };

  const context = {
    console: { warn() {} },
    indexedDB: createIndexedDb(indexedState),
    localStorage,
    location: { reload: () => { reloadCount += 1; } },
    Promise,
    sessionStorage,
    setTimeout(callback) {
      callback();
      return 1;
    },
    Spicetify: {
      Platform: { LocalStorageAPI: platformStorage },
    },
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "StoragePersistence.js" });

  await context.ivLyricsStoragePersistence.ready;
  await context.ivLyricsStoragePersistence.flush();

  return {
    api: context.ivLyricsStoragePersistence,
    indexedState,
    localEntries,
    localStorage,
    reloadCount: () => reloadCount,
    sessionEntries,
  };
}

test("migrates current settings to user-scoped and IndexedDB snapshots", async () => {
  const localEntries = new Map([
    ["ivLyrics:visual:language", "en"],
    ["ivLyrics:visual:fullscreen-browser-fullscreen", "true"],
    ["ivLyrics:setup-completed", "true"],
  ]);
  const result = await runModule({ localEntries });

  const synchronous = JSON.parse(
    result.localStorage.getItem("test-user:ivLyrics:settings-backup:v1")
  );
  assert.equal(synchronous.settings["ivLyrics:visual:language"], "en");
  assert.equal(synchronous.settings["ivLyrics:setup-completed"], "true");

  const indexed = result.indexedState.stores.get("snapshots").get("test-user");
  assert.equal(indexed.settings["ivLyrics:visual:fullscreen-browser-fullscreen"], "true");
  assert.equal(result.reloadCount(), 0);
});

test("loads recovery before the other global ivLyrics extensions", () => {
  assert.equal(manifest.subfiles_extension[0], "StoragePersistence.js");
  assert.equal(manifest.subfiles.includes("StoragePersistence.js"), false);
});

test("restores missing raw settings synchronously from the user snapshot", async () => {
  const backup = {
    version: 1,
    namespace: "test-user",
    revision: 10,
    updatedAt: 10,
    settings: {
      "ivLyrics:visual:language": "ja",
      "ivLyrics:setup-completed": "true",
    },
  };
  const localEntries = new Map([
    ["test-user:ivLyrics:settings-backup:v1", JSON.stringify(backup)],
  ]);
  const result = await runModule({ localEntries });

  assert.equal(result.localStorage.getItem("ivLyrics:visual:language"), "ja");
  assert.equal(result.localStorage.getItem("ivLyrics:setup-completed"), "true");
  assert.equal(result.reloadCount(), 0);
});

test("recovers from IndexedDB when local storage snapshots are gone", async () => {
  const indexedState = {
    stores: new Map([
      ["snapshots", new Map([
        ["test-user", {
          version: 1,
          namespace: "test-user",
          revision: 25,
          updatedAt: 25,
          settings: {
            "ivLyrics:visual:language": "de",
            "ivLyrics:visual:original-font-size": "48",
            "ivLyrics:setup-completed": "true",
          },
        }],
      ])],
    ]),
  };
  const result = await runModule({ indexedState });

  assert.equal(result.localStorage.getItem("ivLyrics:visual:language"), "de");
  assert.equal(result.localStorage.getItem("ivLyrics:visual:original-font-size"), "48");
  assert.equal(result.localStorage.getItem("ivLyrics:setup-completed"), "true");
  assert.equal(result.reloadCount(), 1);
});

test("an intentional reset clears both recovery snapshots", async () => {
  const localEntries = new Map([
    ["ivLyrics:visual:language", "fr"],
    ["ivLyrics:setup-completed", "true"],
  ]);
  const indexedState = { stores: new Map() };
  const sessionEntries = new Map();
  const firstRun = await runModule({ localEntries, indexedState, sessionEntries });

  await firstRun.api.clear();
  assert.equal(firstRun.localStorage.getItem("ivLyrics:visual:language"), null);
  assert.equal(JSON.stringify(firstRun.api.getSnapshot()), "{}");

  const secondRun = await runModule({ localEntries, indexedState, sessionEntries });
  assert.equal(secondRun.localStorage.getItem("ivLyrics:visual:language"), null);
  assert.equal(secondRun.reloadCount(), 0);
  assert.equal(JSON.stringify(secondRun.api.getSnapshot()), "{}");
});
