import { createKaraokeWordSupplementHook } from "#ivlyrics/lyrics/karaokeWordSupplementHook.mjs";
import { createFixtureWordSupplementService } from "./fixtures/word-supplement-service.mjs";
import assert from "node:assert/strict";
import test from "node:test";

const units = [{ wordKey: 0, surface: "生" }];
const shape = value => JSON.parse(JSON.stringify(value));
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
const drain = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

function load({ read, pronunciation, gloss, convert } = {}) {
  const timers = new Map();
  const requests = [], writes = [], reads = [], events = [];
  const persisted = new Map();
  let timerId = 0;
  const window = {
    CONFIG: { visual: { "translation-mode:japanese": "gemini_translate", "translate:target-language": "en" } },
    Spicetify: { Player: { data: { item: { uri: "spotify:track:T1" } } } },
    dispatchEvent: event => events.push(event.detail),
    LyricsService: {
      getWordSupplements: async (...args) => {
        reads.push(shape(args));
        return read ? read(...args) : persisted.get(JSON.stringify(args)) || null;
      },
      cacheWordSupplements: async (...args) => {
        writes.push(shape(args));
        persisted.set(JSON.stringify(args.slice(0, 5)), args[5]);
      },
    },
    ivLyricsTranslationModes: {
      normalizeLanguage: value => String(value).toLowerCase(),
      isPronunciationMode: mode => mode !== "gemini_translate",
      convertTraditional: convert || (async ({ texts }) => texts.map(() => "sei")),
    },
    AIAddonManager: {
      generateWordPronunciation: args => {
        requests.push(shape(args));
        return pronunciation ? pronunciation(args) : Promise.resolve(args.words.map(() => "sei"));
      },
      generateWordGloss: args => {
        requests.push(shape(args));
        return gloss ? gloss(args) : Promise.resolve(args.words.map(() => "life"));
      },
    },
  };
  createFixtureWordSupplementService(window, {
    getDetectedLanguage: () => "ja",
    schedule: fn => { timers.set(++timerId, fn); return timerId; },
    cancelTimer: id => timers.delete(id),
  });
  const flush = async () => {
    await drain();
    const queued = [...timers.values()];
    timers.clear();
    queued.forEach(fn => fn());
    await drain();
  };
  return { api: window.ivLyricsWordSupplements, window, requests, writes, reads, events, flush };
}

test("word language detection reads the detected language supplied by the host", () => {
  const { api } = load();
  assert.equal(api.getSourceLanguage(), "ja");
  assert.equal(api.resolveSourceLanguage("生"), "ja");
});

test("AI readings isolate track, full lyric context and target language in both caches", async () => {
  const h = load();
  const fetch = async (trackId, lineText) => {
    const pending = h.api.getWordReadings(units, "ja", "gemini_romaji", lineText, { trackId });
    await h.flush();
    assert.deepEqual(shape(await pending), ["sei"]);
  };
  await fetch("T1", "人生");
  await fetch("T2", "人生");
  await fetch("T2", "生きる");
  h.window.CONFIG.visual["translate:target-language"] = "ko";
  await fetch("T2", "生きる");
  assert.equal(h.requests.length, 4);
  assert.equal(h.writes.length, 4);
  h.api.clearCaches();
  await fetch("T2", "生きる");
  assert.equal(h.requests.length, 4, "unchanged context is restored from persistent cache");
  assert.equal(new Set(h.reads.map(JSON.stringify)).size, 4);
});

test("debounced pronunciation keeps the request's target and notation after settings change", async () => {
  const h = load();
  const pending = h.api.getWordReadings(units, "ja", "gemini_romaji", "人生", { trackId: "T1" });
  await drain();
  h.window.CONFIG.visual["translate:target-language"] = "ko";
  h.window.CONFIG.visual["translate:pronunciation-notation"] = "ipa";
  await h.flush();
  await pending;
  assert.equal(h.requests[0].targetLang, "en");
  assert.equal(h.requests[0].notation, "latin");
  assert.equal(h.writes[0][1], "latin");
});

for (const kind of ["reading", "gloss"]) {
  test(`invalidating an in-flight ${kind} drops stale results and preserves the new loading state`, async () => {
    const old = deferred(), fresh = deferred();
    let calls = 0;
    const respond = () => (++calls === 1 ? old.promise : fresh.promise);
    const h = load({ pronunciation: respond, gloss: respond });
    const fetch = () => kind === "reading"
      ? h.api.getWordReadings(units, "ja", "gemini_romaji", "人生")
      : h.api.getWordGlosses(units, "人生", "ja");
    const first = fetch();
    await h.flush();
    h.api.clearCaches();
    const second = fetch();
    await h.flush();
    assert.equal(h.events.at(-1).active, true);
    old.resolve(["old"]);
    assert.deepEqual(shape(await first), [""]);
    assert.equal(h.writes.length, 0);
    assert.equal(h.events.at(-1).active, true, "old completion cannot settle the fresh batch");
    fresh.resolve(["new"]);
    assert.deepEqual(shape(await second), ["new"]);
    assert.equal(h.writes.length, 1);
    assert.equal(h.events.at(-1).active, false);
    assert.deepEqual(shape(await fetch()), ["new"]);
  });
}

test("invalidation during a persistent read cannot restore old values or enqueue AI", async () => {
  const stale = deferred();
  const h = load({ read: () => stale.promise });
  const pending = h.api.getWordReadings(units, "ja", "gemini_romaji", "人生");
  h.api.clearCaches();
  stale.resolve(["old"]);
  await h.flush();
  assert.deepEqual(shape(await pending), [""]);
  assert.equal(h.requests.length, 0);
  assert.equal(h.writes.length, 0);
});

test("local reading caches respect track and notation and discard old conversions", async () => {
  const conversion = deferred();
  const h = load({ convert: () => conversion.promise });
  const pending = h.api.getWordReadings(units, "ja", "romaji", "人生");
  await drain();
  h.api.clearCaches();
  conversion.resolve(["sei"]);
  assert.deepEqual(shape(await pending), [""]);
  assert.equal(h.writes.length, 0);

  const local = load();
  await local.api.getWordReadings(units, "ja", "romaji", "", { trackId: "T1" });
  await local.api.getWordReadings(units, "ja", "romaji", "", { trackId: "T2" });
  local.window.CONFIG.visual["translate:pronunciation-notation"] = "ipa";
  await local.api.getWordReadings(units, "ja", "romaji", "", { trackId: "T2" });
  assert.equal(local.writes.length, 3);
});

test("glosses with identical first 120 context characters remain distinct", async () => {
  const h = load();
  for (const ending of ["人生", "生きる"]) {
    const pending = h.api.getWordGlosses(units, "a".repeat(120) + ending, "ja");
    await h.flush();
    await pending;
  }
  assert.equal(h.requests.length, 2);
});

test("mounted word stacks use changed reading and gloss settings on the next revision", () => {
  const memos = [];
  let cursor = 0, readingMode = "romaji", glossActive = false;
  const readingCalls = [], glossCalls = [];
  const api = {
    getSourceLanguage: () => "ja", resolveSourceLanguage: () => "ja",
    isSuitableSourceLanguage: () => true, getWordUnits: () => units,
    resolveReadingMode: () => readingMode, isGlossModeActive: () => glossActive,
    getLineKey: () => "line-1", isAiCoolingDown: () => true,
    getWordReadings: async (_units, _lang, mode) => { readingCalls.push(mode); return []; },
    getWordGlosses: async () => { glossCalls.push(true); return []; },
  };
  const renderWordStack = createKaraokeWordSupplementHook({
    getService: () => api, getTrackUri: () => "", getDetectedLanguage: () => "ja",
    subscribeInvalidation: () => undefined, reportDebug: () => {},
    useRef: initial => { const slot = cursor++; return memos[slot] ??= { current: initial }; },
    useMemo: (compute, deps) => {
      const slot = cursor++;
      const previous = memos[slot];
      if (!previous || deps.some((value, index) => !Object.is(value, previous.deps[index]))) {
        memos[slot] = { value: compute(), deps };
      }
      return memos[slot].value;
    },
    useState: initial => [initial, () => {}], useEffect: effect => effect(),
  });
  const input = { line: {}, timedChars: [], timedText: "生", wordTimed: true, settingsRevision: 0 };
  renderWordStack(input);
  cursor = 0;
  readingMode = "gemini_romaji";
  glossActive = true;
  renderWordStack({ ...input, settingsRevision: 1 });
  assert.deepEqual(readingCalls, ["romaji", "gemini_romaji"]);
  assert.equal(glossCalls.length, 1);
});
