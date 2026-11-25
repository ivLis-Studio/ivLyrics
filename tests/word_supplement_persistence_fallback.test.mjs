import { createFixtureWordSupplementService } from "./fixtures/word-supplement-service.mjs";
import assert from "node:assert/strict";
import test from "node:test";


// Harness: CONFIG and localStorage lack the keys, but the persistence
// layer holds recovered values (e.g. restored after a storage wipe).
// The supplements module must observe the recovered values without
// requiring a page reload.
const loadSupplements = ({ persisted = {} } = {}) => {
  const store = new Map(Object.entries(persisted));
  const localValues = new Map();
  const localStorage = {
    getItem: (key) => localValues.get(key) ?? null,
    setItem: (key, value) => localValues.set(key, String(value)),
    removeItem: (key) => localValues.delete(key),
  };
  const persistenceReads = [];
  const window = {};
  window.CONFIG = { visual: {} };
  window.ivLyricsStoragePersistence = {
    getItem: (key) => {
      persistenceReads.push(key);
      return store.get(key) ?? null;
    },
  };
  const api = createFixtureWordSupplementService(window, { localStorage });
  return { api, persistenceReads, localValues };
};

test("gloss target language observes the recovered persistence value without a reload", () => {
  const { api, persistenceReads } = loadSupplements({
    persisted: { "ivLyrics:visual:translate:target-language": "ja" },
  });
  assert.equal(api.getGlossTargetLanguage(), "ja");
  assert.ok(
    persistenceReads.includes("ivLyrics:visual:translate:target-language"),
    "expected a persistence read for the target language"
  );
});

test("pronunciation notation observes the recovered persistence value without a reload", () => {
  const { api, persistenceReads } = loadSupplements({
    persisted: { "ivLyrics:visual:translate:pronunciation-notation": "ipa" },
  });
  assert.equal(api.getPronunciationNotation(), "ipa");
  assert.ok(
    persistenceReads.includes("ivLyrics:visual:translate:pronunciation-notation"),
    "expected a persistence read for the pronunciation notation"
  );
});

test("explicit CONFIG values still take precedence over persistence", () => {
  const store = new Map([
    ["ivLyrics:visual:translate:target-language", "ja"],
    ["ivLyrics:visual:translate:pronunciation-notation", "ipa"],
  ]);
  const localValues = new Map();
  const window = {};
  window.CONFIG = {
    visual: {
      "translate:target-language": "ko",
      "translate:pronunciation-notation": "latin",
    },
  };
  window.ivLyricsStoragePersistence = {
    getItem: (key) => store.get(key) ?? null,
  };
  const api = createFixtureWordSupplementService(window, {
    localStorage: { getItem: key => localValues.get(key) ?? null },
  });
  // "latin" normalizes to non-ipa, so the notation resolves to "latin".
  assert.equal(api.getGlossTargetLanguage(), "ko");
  assert.equal(api.getPronunciationNotation(), "latin");
});
