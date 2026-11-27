import assert from "node:assert/strict";
import test from "node:test";

// The page bundle and the startup bundle each contain their own copy of this
// module. Distinct URLs give two module instances, like the two bundles.
const pageCopy = await import("../src/core/settingsStorageBatch.mjs?bundle=page");
const startupCopy = await import("../src/core/settingsStorageBatch.mjs?bundle=startup");

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

test("the two bundle copies are separate module instances", () => {
  assert.notEqual(pageCopy.beginStorageBatch, startupCopy.beginStorageBatch);
});

test("a write noted by the other bundle releases that key from an open batch", () => {
  const storage = memoryStorage({ "ivLyrics:a": "old-a", "ivLyrics:b": "old-b" });
  const released = [];
  const batch = pageCopy.beginStorageBatch(
    storage,
    [["ivLyrics:a", "new-a"], ["ivLyrics:b", "new-b"]],
    (key) => released.push(key),
  );

  // Settings code in the startup bundle writes the value the import also wrote.
  storage.setItem("ivLyrics:a", "new-a");
  startupCopy.noteStorageWrite(storage, "ivLyrics:a");
  assert.deepEqual(released, ["ivLyrics:a"]);

  batch.rollback();
  assert.equal(storage.getItem("ivLyrics:a"), "new-a", "a key written elsewhere is not rolled back");
  assert.equal(storage.getItem("ivLyrics:b"), "old-b", "keys still owned by the batch are restored");
});

test("a committed batch no longer hears writes from either bundle", () => {
  const storage = memoryStorage({ "ivLyrics:c": "old-c" });
  const released = [];
  const batch = startupCopy.beginStorageBatch(storage, [["ivLyrics:c", "new-c"]], (key) => released.push(key));
  batch.commit();
  pageCopy.noteStorageWrite(storage, "ivLyrics:c");
  startupCopy.noteStorageWrite(storage, "ivLyrics:c");
  assert.deepEqual(released, []);
  assert.equal(storage.getItem("ivLyrics:c"), "new-c");
});
