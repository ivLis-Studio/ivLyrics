import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { createLyricPrefetcher } from "../src/lyrics/createLyricPrefetcher.mjs";
import { readPronunciationSlots } from "../src/lyrics/pronunciationRuntime.mjs";
import { reloadPageLyrics } from "../src/lyrics/reloadPageLyrics.mjs";
import { createPageTranslationMemoryCache } from "../src/lyrics/pageMemoryCache.mjs";
import { readTranslationRuntimeFixture } from "./fixtures/legacy-page-source.mjs";
import { regeneratePageTranslation } from "../src/lyrics/pageTranslationRegeneration.mjs";
import { createPageTranslation } from "../src/spicetify/composePageTranslation.mjs";
import { createTranslator } from "../src/lyrics/createTranslator.mjs";

const source = readFileSync(new URL("../src/spicetify/index.js", import.meta.url), "utf8");
const section = (from, to) => {
  const start = source.indexOf(from);
  const end = source.indexOf(to, start + from.length);
  assert.ok(start >= 0 && end > start, `Missing production section: ${from}`);
  return source.slice(start, end);
};
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const modes = ["gemini_ko", "gemini_romaji"];

// Run production keys, cache, translation writers and the reload callback.
// Only provider requests and the fetchLyrics transport boundary are deferred.
function harness(mode = "gemini_ko") {
  const calls = [], reloads = [], progress = [], completions = [], writes = [];
  const detectedOnPage = [];
  const lines = [{ text: "こんにちは", startTime: 1000 }];
  const item = { uri: "spotify:track:race", title: "Song", artist: "Artist" };
  const config = { visual: { "translate:target-language": "en", "translation-mode:japanese": mode } };
  let style = "natural", token = 0;
  const window = {
    CONFIG: config,
    I18n: { getCurrentLanguage: () => "en" },
    AIAddonManager: { getTranslationStyle: () => style },
    ivLyricsTextComparison: { areEquivalent: (left, right) => left === right },
    LyricsCache: {
      getTranslation: async () => null,
      setTranslation: async (...args) => writes.push(args),
    },
    Translator: {
      clearInflightRequests() {},
      callGemini(params) {
        const request = { ...deferred(), params, language: params.lang ?? context.targetLanguage(), style };
        calls.push(request);
        return request.promise;
      },
    },
  };
  const context = vm.createContext({
    regeneratePageTranslation,
    window, CONFIG: config, APP_NAME: "ivLyrics",
    CacheManager: createPageTranslationMemoryCache(),
    Spicetify: { Player: { data: { item } } },
    localStorage: { getItem: () => null },
    StorageManager: { getPersisted() {} },
    Utils: {
      isSectionHeader: () => false,
      setDetectedLanguage() {},
      extractTrackId: uri => uri?.split(":").at(-1),
      getTranslationCacheId: uri => uri?.split(":").at(-1),
    },
    LyricsService: { detectLanguage: () => "ja" },
    SYNCED: 1, UNSYNCED: 2, isKaraokeRenderMode: value => value === 0,
    Toast: { show() {}, success() {}, error(message) { assert.fail(message); } },
    ivLyricsDebug() {}, I18n: { ...window.I18n, t: key => key },
  });
  vm.runInContext([
    readTranslationRuntimeFixture(),
    `class Container {
      ${section("  beginLyricsLoadRequest(", "  clearPendingLyricsUpdates(")}
      ${section("  getGeminiTranslation(", "  getTraditionalConversion(")}
      ${section("  async regenerateTranslation(", "  async selectLyricsProviderForCurrentTrack(")}
    }
    globalThis.Container = Container;
    globalThis.cache = CacheManager;
    globalThis.cacheKey = getDisplayModeCacheKey;
    globalThis.shapeSignature = getLyricsProcessingShapeSignature;
    globalThis.targetLanguage = getCurrentTranslationTargetLanguage;
`,
  ].join("\n"), context);
  const requests = new Map();
  const sourceCache = {};
  const prefetcher = createLyricPrefetcher({
    ...vm.runInContext(`({
      getDisplayModeCacheKey, getDisplayModeGenerationOptions, getNonSectionLyricsText,
      getLegacyNonSectionLyricsText, getCurrentTranslationTargetLanguage,
      getCachedTranslationForText, mapTranslationLinesToLyrics,
    })`, context),
    requests, sourceCache,
    translationCache: context.cache,
    readVisual: () => config.visual,
    getService: (name) => window[name] ?? context[name],
    getPronunciationSlots: () => readPronunciationSlots(window),
    getTranslationCacheId: context.Utils.getTranslationCacheId,
    setDetectedLanguage: language => detectedOnPage.push(language),
    debug: (...messages) => context.ivLyricsDebug(...messages),
    warn() {},
  });
  const app = new context.Container();
  context.app = app;
  Object.assign(app, {
    state: { ...item, synced: lines, currentLyrics: lines, provider: "lrclib", lyricsRequestSeq: 1, explicitMode: -1 },
    currentTrackUri: item.uri, _lyricsFetchSeq: 1, _activeLyricsFetchSeq: 1,
    _isComponentMounted: true, isPlaybackUriCurrent: uri => item.uri === uri,
    _inflightGemini: new Map(), _dmResults: {},
    getTranslationTargetLanguage: context.targetLanguage,
    provideLanguageCode: () => "ja",
    getCurrentMode: () => 1,
    getRegenerationTargets: () => ({
      provider: "gemini", mode1: mode, mode2: "none", isGeminiMode: true,
      needPhonetic: mode === "gemini_romaji", needTranslation: mode !== "gemini_romaji",
    }),
    applyStreamingTranslation: value => progress.push(value),
    invalidateSharedLyricsPresentation() {}, lyricsSource() {},
    startTranslationLoading: () => ++token, startPhoneticLoading: () => ++token,
    clearTranslationLoading: (...args) => completions.push(args),
    clearPhoneticLoading: (...args) => completions.push(args),
    infoFromTrack: track => track,
    getLoadingLyricsState: (info, seq) => ({ ...app.state, uri: info.uri, lyricsRequestSeq: seq }),
    setState(patch) { this.state = { ...this.state, ...patch }; },
    clearPendingLyricsUpdates() {}, updateVisualOnConfigChange() {}, forceUpdate() {},
    fetchLyrics(track, explicitMode, refresh) {
      const promise = this.getGeminiTranslation(this.state, lines, mode, (...args) => progress.push(args));
      reloads.push({ track, explicitMode, refresh, promise });
      return promise;
    },
  });
  const memoryCache = {};
  app.reloadLyrics = (clearCache = true) => reloadPageLyrics(app, clearCache, {
    readPlayerItem: () => item,
    extractTrackId: context.Utils.extractTrackId,
    memoryCache, translationCache: context.cache,
    getService: (name) => window[name], debug: () => {},
  });
  return {
    app, calls, reloads, progress, completions, writes, context, cache: context.cache, lines, window, detectedOnPage,
    usePersistentTranslator() {
      window.AIAddonManager.translateLyrics = window.Translator.callGemini;
      window.Translator = createTranslator({
        LocalLanguageConverter: class {},
        cache: window.LyricsCache,
        getTargetLanguage: context.targetLanguage,
        getPronunciationNotation: () => config.visual["translate:pronunciation-notation"],
        getAIManager: () => window.AIAddonManager,
        getPronunciationSlots: () => null,
        getApiTracker: () => null,
        detectLyricsLanguage: () => "ja",
        debug() {},
      });
    },
    prefetcher: { requests, sourceCache, ...prefetcher },
    prefetch: (options) => prefetcher.loadTranslations(item, app.state, options),
    key: (keyMode = mode) => context.cacheKey(app.state, keyMode),
    request: () => app.getGeminiTranslation(app.state, lines, mode, (...args) => progress.push(args)),
    setTarget: value => { config.visual["translate:target-language"] = value; },
    setStyle: value => { style = value; },
    setNotation: value => { config.visual["translate:pronunciation-notation"] = value; },
    setDisplayMode: value => { config.visual["translation-mode:japanese"] = value; },
    visual: config.visual,
    resolve(request, text) {
      request.resolve(request.params.wantSmartPhonetic ? { phonetic: [text] } : { translation: [text] });
    },
  };
}

test("a replacement page presentation on the same source joins the existing progress", async () => {
  const h = harness();
  const oldState = h.app.state;
  const oldProgress = [];
  const previous = h.app.getGeminiTranslation(oldState, h.lines, "gemini_ko", (...args) => oldProgress.push(args));
  await flush();
  assert.equal(h.calls.length, 1);
  h.calls[0].params.onLine(0, "Replay this row");
  assert.equal(oldProgress.at(-1)[0][0].text, "Replay this row");
  h.app.beginLyricsLoadRequest();
  h.app.state = { ...oldState, lyricsRequestSeq: h.app._activeLyricsFetchSeq };
  const current = h.request();
  assert.equal(h.progress.at(-1)[0][0].text, "Replay this row");
  h.calls[0].params.onStreamReset({ reason: "retry" });
  h.calls[0].params.onLine(0, "After retry");
  assert.equal(oldProgress.length, 1);
  assert.equal(h.progress.at(-2)[1].reset, true);
  assert.equal(h.progress.at(-1)[0][0].text, "After retry");
  h.resolve(h.calls[0], "Complete");
  assert.equal((await current)[0].text, "Complete");
  await previous;
  assert.equal(h.calls.length, 1);
  assert.equal(h.completions.length, 1);
});

for (const mode of modes) {
  for (const order of ["old-first", "new-first"]) {
    test(`${mode}: regeneration supersedes an already running page request (${order})`, async () => {
      const h = harness(mode);
      const oldPromise = h.request();
      await flush();
      const regeneration = h.app.regenerateTranslation();
      await flush();
      assert.equal(h.calls.length, 2);
      h.calls[0].params.onLine(0, "obsolete Chinese stream");
      assert.equal(h.progress.length, 0, "the original page request no longer owns streaming");
      const settleOld = async () => { h.resolve(h.calls[0], "obsolete Chinese"); await oldPromise; };
      const settleNew = async () => { h.resolve(h.calls[1], "새 결과"); await regeneration; };
      if (order === "old-first") { await settleOld(); await settleNew(); }
      else { await settleNew(); await settleOld(); }
      assert.equal((await h.request())[0].text, "새 결과");
      assert.equal(h.calls.length, 2);
    });

    test(`${mode}: late prefetch cannot replace a regenerated memory result (${order})`, async () => {
      const h = harness(mode);
      const oldPromise = h.prefetch();
      await flush();
      const regeneration = h.app.regenerateTranslation();
      await flush();
      const settleOld = async () => { h.resolve(h.calls[0], "obsolete prefetch"); await oldPromise; };
      const settleNew = async () => { h.resolve(h.calls[1], "새 결과"); await regeneration; };
      if (order === "old-first") { await settleOld(); await settleNew(); }
      else { await settleNew(); await settleOld(); }
      assert.equal((await h.request())[0].text, "새 결과");
      assert.equal(h.calls.length, 2);
    });

    test(`${mode}: target switch and reload preserve Korean cache (${order})`, async () => {
      const h = harness(mode);
      const oldKey = h.key();
      const oldPromise = h.request();
      await flush();
      h.setTarget("ko");
      const newKey = h.key();
      assert.notEqual(newKey, oldKey, "target language is part of memory/in-flight identity");
      await h.app.reloadLyrics(false);
      const currentPromise = h.reloads.at(-1).promise;
      await flush();
      assert.deepEqual(h.calls.map(call => call.language), ["en", "ko"]);
      const currentInflight = h.app._inflightGemini.get(newKey);
      h.calls[0].params.onLine(0, "obsolete English stream");
      h.calls[0].params.onStreamReset();
      assert.equal(h.progress.length, 0);
      const settleOld = async () => { h.resolve(h.calls[0], "Hello"); await oldPromise; };
      const settleNew = async () => { h.resolve(h.calls[1], "안녕하세요"); await currentPromise; };
      if (order === "old-first") {
        await settleOld();
        assert.strictEqual(h.app._inflightGemini.get(newKey), currentInflight);
        assert.equal(h.cache.get(newKey), null);
        await settleNew();
      } else {
        await settleNew();
        await settleOld();
      }
      assert.equal(h.cache.get(newKey)[0].text, "안녕하세요");
      assert.equal(h.cache.get(oldKey), null, "a cancelled request cannot repopulate memory");
      assert.equal((await h.request())[0].text, "안녕하세요");
      assert.equal(h.calls.length, 2, "current target reuses its correct cached result");
      await h.app.reloadLyrics(false);
      await flush();
      assert.equal(h.calls[2].language, "ko", "a later reload still requests the current target");
      assert.equal(h.reloads.at(-1).refresh, true);
      h.resolve(h.calls[2], "새 결과");
      await h.reloads.at(-1).promise;
      assert.equal((await h.request())[0].text, "새 결과");
    });

    test(`${mode}: replaced same-key requests own cache writes and cleanup (${order})`, async () => {
      const h = harness(mode);
      const oldPromise = h.request();
      await flush();
      await h.app.reloadLyrics(false);
      await flush();
      const currentPromise = h.reloads.at(-1).promise;
      const currentInflight = h.app._inflightGemini.get(h.key());
      const settleOld = async () => { h.resolve(h.calls[0], "Obsolete"); await oldPromise; };
      const settleNew = async () => { h.resolve(h.calls[1], "Current"); await currentPromise; };
      if (order === "old-first") {
        await settleOld();
        assert.strictEqual(h.app._inflightGemini.get(h.key()), currentInflight);
        assert.equal(h.cache.get(h.key()), null);
        const joined = h.request();
        await flush();
        assert.equal(h.calls.length, 2, "old cleanup cannot break current request deduplication");
        await settleNew();
        assert.equal((await joined)[0].text, "Current");
      } else {
        await settleNew();
        await settleOld();
      }
      assert.equal(h.cache.get(h.key())[0].text, "Current");
      assert.equal((await h.request())[0].text, "Current");
      assert.equal(h.app._inflightGemini.size, 0);
    });

    test(`${mode}: late prefetch cannot use a new target's cache identity (${order})`, async () => {
      const h = harness(mode);
      const oldKey = h.key();
      const oldPromise = h.prefetch();
      await flush();
      h.setTarget("ko");
      const newPromise = h.prefetch();
      await flush();
      assert.deepEqual(h.calls.map(call => call.language), ["en", "ko"]);
      const settleOld = async () => { h.resolve(h.calls[0], "Hello"); await oldPromise; };
      const settleNew = async () => { h.resolve(h.calls[1], "안녕하세요"); await newPromise; };
      if (order === "old-first") {
        await settleOld();
        assert.equal(h.prefetcher.requests.size, 1);
        assert.equal(h.cache.get(h.key()), null);
        await settleNew();
      } else {
        await settleNew();
        await settleOld();
      }
      assert.equal(h.cache.get(oldKey), null);
      assert.equal((await h.request())[0].text, "안녕하세요");
      assert.equal(h.calls.length, 2, "prefetch and foreground use the same generation identity");
      await h.prefetch();
      assert.equal(h.calls.length, 2, "the per-mode translation cache also covers prefetch deduplication");
      assert.equal(h.prefetcher.requests.size, 0);
    });

    test(`${mode}: regeneration cannot stream or save into a newer target (${order})`, async () => {
      const h = harness(mode);
      h.usePersistentTranslator();
      const oldPromise = h.app.regenerateTranslation();
      await flush();
      h.setTarget("ko");
      await h.app.reloadLyrics(false);
      await flush();
      h.calls[0].params.onLine(0, "obsolete regeneration stream");
      h.calls[0].params.onStreamReset();
      assert.equal(h.progress.length, 0);
      const currentPromise = h.reloads.at(-1).promise;
      const settleOld = async () => { h.resolve(h.calls[0], "Hello"); await oldPromise; };
      const settleNew = async () => { h.resolve(h.calls[1], "안녕하세요"); await currentPromise; };
      if (order === "old-first") { await settleOld(); await settleNew(); }
      else { await settleNew(); await settleOld(); }
      const primaryText = value => (value.translation ?? value.phonetic)[0];
      assert.deepEqual(Object.fromEntries(h.writes.map(write => [write[1], primaryText(write[3])])), {
        en: "Hello", ko: "안녕하세요",
      });
      assert.equal((await h.request())[0].text, "안녕하세요");
      const regenerateCurrent = h.app.regenerateTranslation();
      await flush();
      assert.equal(h.calls[2].language, "ko");
      h.resolve(h.calls[2], "새 결과");
      await regenerateCurrent;
      assert.equal(h.writes.at(-1)[1], "ko");
      assert.equal(primaryText(h.writes.at(-1)[3]), "새 결과");
      assert.equal(h.cache.get(h.key())[0].text, "새 결과");
    });
  }
}

for (const kind of ["foreground", "prefetch"]) {
  test(`${kind}: a deliberately empty reading is cached without starting a provider`, async () => {
    const h = harness("gemini_romaji");
    h.window.LyricsCache.getTranslation = async () => ({ phonetic: [""], userEdited: true });
    await (kind === "foreground" ? h.request() : h.prefetch());
    assert.equal(h.calls.length, 0);
    assert.equal(h.cache.get(h.key())[0].text, "");
    assert.equal(h.cache.get(h.key())[0].originalText, "こんにちは");
  });

  test(`${kind}: clearing a track detaches the next request from an obsolete result`, async () => {
    const h = harness();
    h.usePersistentTranslator();
    const start = kind === "foreground" ? h.request : h.prefetch;
    const obsolete = start();
    await flush();
    h.window.Translator.clearMemoryCache("race");
    const current = start();
    await flush();
    assert.equal(h.calls.length, 2);
    h.resolve(h.calls[1], "Current");
    await current;
    h.resolve(h.calls[0], "Obsolete");
    await obsolete;
    assert.equal(h.writes.length, 1);
    assert.deepEqual(h.writes[0][3].translation, ["Current"]);
    assert.equal(h.cache.get(h.key())[0].text, "Current");
  });
}

test("memory identity matches persistent translation style and pronunciation options", () => {
  const h = harness();
  const translation = h.key("gemini_ko"), phonetic = h.key("gemini_romaji");
  h.setStyle("literal");
  assert.notEqual(h.key("gemini_ko"), translation);
  assert.equal(h.key("gemini_romaji"), phonetic, "translation style does not affect pronunciation");
  const literal = h.key("gemini_ko");
  h.setNotation("ipa");
  assert.notEqual(h.key("gemini_romaji"), phonetic);
  assert.equal(h.key("gemini_ko"), literal, "pronunciation notation does not affect translation");
  assert.match(h.key("gemini_romaji"), /phonetic-prompt=\d+:notation=ipa/);
});

for (const [mode, change] of [["gemini_ko", h => h.setStyle("literal")], ["gemini_romaji", h => h.setNotation("ipa")]]) {
  test(`${mode}: changing generation options discards a pending result`, async () => {
    const h = harness(mode);
    const pending = h.request();
    await flush();
    change(h);
    h.calls[0].params.onLine(0, "obsolete stream");
    h.resolve(h.calls[0], "Obsolete");
    assert.equal(await pending, null);
    assert.equal(h.progress.length, 0);
    assert.equal(h.cache._cache.size, 0);
    const current = h.request();
    await flush();
    h.resolve(h.calls[1], "Current");
    assert.equal((await current)[0].text, "Current");
    assert.equal(h.cache.get(h.key())[0].text, "Current");
  });
}

test("a target switch during persistent-cache lookup cannot launch a stale request", async () => {
  const h = harness();
  const read = deferred();
  h.window.LyricsCache.getTranslation = () => read.promise;
  const pending = h.request();
  h.setTarget("ko");
  read.resolve(null);
  assert.equal(await pending, null);
  assert.equal(h.calls.length, 0);
  assert.equal(h.cache._cache.size, 0);
});

test("a track transition during persistent-cache lookup stops the departed page before it calls AI", async () => {
  const h = harness();
  const read = deferred();
  let reads = 0;
  h.window.LyricsCache.getTranslation = () => { reads++; return read.promise; };
  const pending = h.request();
  await flush();
  assert.equal(reads, 1);
  const previousState = h.app.state;
  h.app.beginLyricsLoadRequest(true);
  h.app.state = { ...previousState, title: "Next song", artist: "Next artist" };
  h.app.trackLanguageOverride = "es";
  read.resolve(null);
  assert.equal(await pending, null);
  assert.equal(await h.app.getGeminiTranslation(previousState, h.lines, "gemini_ko"), null);
  assert.equal(h.calls.length, 0);
  assert.equal(reads, 1);
  assert.equal(h.cache._cache.size, 0);
  assert.equal(h.app._inflightGemini.size, 0);
  assert.equal(h.completions.length, 1);
  const [[loadingToken, completion]] = h.completions;
  assert.equal(loadingToken, 1);
  assert.equal(completion.completed, false);
  assert.equal(completion.cancelled, true);
});

test("a matching presentation can take ownership before the persistent-cache lookup returns", async () => {
  const h = harness();
  const read = deferred();
  h.window.LyricsCache.getTranslation = () => read.promise;
  const previousProgress = [];
  const previous = h.app.getGeminiTranslation(h.app.state, h.lines, "gemini_ko", (...args) => previousProgress.push(args));
  await flush();
  h.app.beginLyricsLoadRequest();
  h.app.state = { ...h.app.state, lyricsRequestSeq: h.app._activeLyricsFetchSeq, title: "Updated title" };
  const current = h.request();
  read.resolve(null);
  await flush();
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].params.title, "Updated title");
  h.calls[0].params.onLine(0, "Live row");
  assert.equal(previousProgress.length, 0);
  assert.equal(h.progress.at(-1)[0][0].text, "Live row");
  h.resolve(h.calls[0], "Complete");
  assert.equal((await current)[0].text, "Complete");
  await previous;
  assert.equal(h.completions.length, 1);
});

test("departure stops page writes while an already dispatched request finishes for another display", async () => {
  const h = harness();
  h.usePersistentTranslator();
  const previous = h.request();
  await flush();
  assert.equal(h.calls.length, 1);
  const otherProgress = [];
  const otherDisplay = h.window.Translator.callGemini({
    ...h.calls[0].params, onLine: (...args) => otherProgress.push(args),
  });
  h.app.beginLyricsLoadRequest(true);
  h.app.currentTrackUri = "spotify:track:next";
  h.calls[0].params.onLine(0, "Shared row");
  assert.equal(h.progress.length, 0);
  assert.equal(otherProgress[0][1], "Shared row");
  h.resolve(h.calls[0], "Saved result");
  assert.equal((await otherDisplay).translation[0], "Saved result");
  assert.equal(await previous, null);
  assert.equal(h.calls.length, 1);
  assert.equal(h.cache._cache.size, 0);
  assert.equal(h.writes.length, 1);
  assert.equal(h.writes[0][0], "race");
});

test("obsolete requests cannot recreate in-flight state after teardown", async () => {
  const h = harness();
  const pending = h.request();
  await flush();
  h.app._inflightGemini = null;
  h.resolve(h.calls[0], "Obsolete");
  await pending;
  assert.equal(h.app._inflightGemini, null);
  assert.equal(h.cache.get(h.key()), null);
});

test("prefetch failure before its first await resolves cleanly and allows retry", async () => {
  const h = harness();
  h.context.ivLyricsDebug = message => {
    if (message.includes("Fetching translation")) throw new Error("synchronous setup failure");
  };
  assert.equal(await h.prefetch(), null);
  assert.equal(h.prefetcher.requests.size, 0);
  h.context.ivLyricsDebug = () => {};
  const retry = h.prefetch();
  await flush();
  assert.equal(h.calls.length, 1);
  h.resolve(h.calls[0], "Current");
  await retry;
  assert.equal(h.cache.get(h.key())[0].text, "Current");
  assert.equal(h.prefetcher.requests.size, 0);
});

test("queued language detection stays local and traditional conversion never invokes the AI provider", async () => {
  const h = harness("romaji");
  await h.prefetch();
  assert.deepEqual(h.calls, []);
  assert.deepEqual(h.detectedOnPage, []);

  h.setDisplayMode("gemini_romaji");
  const prefetch = h.prefetch();
  await flush();
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].params.sourceLang, "ja");
  assert.deepEqual(h.detectedOnPage, []);
  h.resolve(h.calls[0], "konnichiwa");
  assert.equal(await prefetch, true);
});

test("queued translation honors the track language override and the selected line mode", async () => {
  const h = harness("none");
  h.context.LyricsService.getTrackLanguageOverride = async () => "zh";
  h.visual["translate:detect-language-override"] = "ko";
  h.visual["translation-mode:chinese"] = "gemini_romaji";
  h.app.state.karaoke = [{ text: "Karaoke variant" }];
  const pending = h.prefetch({ mode: 1 });
  await flush();
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].params.sourceLang, "zh");
  assert.equal(h.calls[0].params.text, "こんにちは");
  h.resolve(h.calls[0], "fixture pronunciation");
  assert.equal(await pending, true);
});

test("queued translation ignores an output after its display mode has been disabled", async () => {
  const h = harness();
  const pending = h.prefetch();
  await flush();
  assert.equal(h.calls.length, 1);
  h.setDisplayMode("none");
  h.resolve(h.calls[0], "Old result");
  assert.equal(await pending, null);
  assert.equal(h.cache.get(h.key()), null);
});

test("queued pronunciation can finish while translation is switched off", async () => {
  const h = harness("gemini_romaji");
  h.visual["translation-mode-2:japanese"] = "gemini_ko";
  const pending = h.prefetch();
  await flush();
  assert.equal(h.calls.length, 2);
  h.visual["translation-mode-2:japanese"] = "none";
  h.resolve(h.calls.find(call => !call.params.wantSmartPhonetic), "Disabled output");
  h.resolve(h.calls.find(call => call.params.wantSmartPhonetic), "Kept pronunciation");
  await pending;
  assert.equal(h.cache.get(h.key("gemini_ko")), null);
  assert.equal(h.cache.get(h.key("gemini_romaji"))[0].text, "Kept pronunciation");
});

test("cancelled lookahead cannot start AI after the shared cache lookup", async () => {
  const h = harness();
  const stored = deferred();
  h.window.LyricsCache.getTranslation = () => stored.promise;
  let wanted = true;
  const obsolete = h.prefetch({ wanted: () => wanted });
  await flush();
  wanted = false;
  stored.resolve(null);
  assert.equal(await obsolete, null);
  assert.equal(h.calls.length, 0);
});

test("a newer session can join a shared queued lookup for the same song", async () => {
  const h = harness();
  const stored = deferred();
  h.window.LyricsCache.getTranslation = () => stored.promise;
  let firstActive = true;
  const oldRequest = h.prefetch({ wanted: () => firstActive });
  await flush();
  firstActive = false;
  const currentRequest = h.prefetch();
  stored.resolve(null);
  await flush();
  assert.equal(h.calls.length, 1);
  h.resolve(h.calls[0], "Warm result");
  assert.deepEqual(await Promise.all([oldRequest, currentRequest]), [true, true]);
  assert.equal(h.cache.get(h.key())[0].text, "Warm result");
});

test("a provider output failure remains retryable by prefetch", async () => {
  const h = harness();
  const failed = h.prefetch();
  await flush();
  h.calls[0].reject(new Error("temporary provider failure"));
  assert.equal(await failed, null);
  assert.equal(h.cache.get(h.key()), null);
  const retry = h.prefetch();
  await flush();
  h.resolve(h.calls[1], "Retry succeeded");
  assert.equal(await retry, true);
  assert.equal(h.cache.get(h.key())[0].text, "Retry succeeded");
});

test("queued raw lyrics cannot replace a foreground result for the same song", async () => {
  const h = harness();
  const queued = deferred();
  h.context.LyricsService.getLyricsFromProviders = () => queued.promise;
  const track = { uri: h.app.state.uri };
  const prefetch = h.prefetcher.loadLyrics(track);
  await flush();
  const foreground = { uri: track.uri, provider: "local", synced: [{ text: "Current" }] };
  h.prefetcher.sourceCache[track.uri] = foreground;
  queued.resolve({ provider: "lrclib", synced: [{ text: "Obsolete" }] });
  assert.strictEqual(await prefetch, foreground);
  assert.strictEqual(h.prefetcher.sourceCache[track.uri], foreground);
});

test("a queued lyric cannot start provider requests after it is removed during provider preference lookup", async () => {
  const h = harness(), stored = deferred();
  const service = h.context.LyricsService;
  let queued = true;
  let lookedUp = false;
  service.getTrackLyricsProviderOverride = () => { lookedUp = true; return stored.promise; };
  service.getLyricsFromProviders = () => assert.fail("the retired queue item started a provider request");
  const track = { uri: h.app.state.uri };
  const retired = h.prefetcher.loadLyrics(track, { wanted: () => queued });
  await flush();
  assert.equal(lookedUp, true);
  queued = false;
  stored.resolve(null);
  assert.equal(await retired, null);
  assert.equal(h.prefetcher.requests.size, 0);
  assert.equal(h.prefetcher.sourceCache[track.uri], undefined);
});

test("clearing a queued song's cache retires the pending prefetch and lets it be requested again", async () => {
  const h = harness(), obsolete = deferred(), current = deferred();
  const service = h.context.LyricsService;
  let revision = 0;
  service.getLyricsRequestRevision = () => revision;
  service.getLyricsFromProviders = () => revision === 0 ? obsolete.promise : current.promise;
  const track = { uri: h.app.state.uri };
  const old = h.prefetcher.loadLyrics(track);
  await flush();
  revision++;
  const fresh = h.prefetcher.loadLyrics(track);
  await flush();
  obsolete.resolve({ provider: "lrclib", synced: [{ text: "Obsolete" }] });
  assert.equal(await old, null);
  assert.equal(h.prefetcher.sourceCache[track.uri], undefined);
  current.resolve({ provider: "lrclib", synced: [{ text: "Fresh" }] });
  assert.equal((await fresh).synced[0].text, "Fresh");
  assert.equal(h.prefetcher.requests.size, 0);
});

test("queued lyrics honor the saved provider and do not reuse completed prefetches after invalidation", async () => {
  const h = harness();
  const service = h.context.LyricsService;
  const track = { uri: h.app.state.uri };
  const providers = [];
  let revision = 0;
  service.getLyricsRequestRevision = () => revision;
  service.getTrackLyricsProviderOverride = async () => revision === 0 ? "spotify" : "lrclib";
  service.getLyricsFromProviders = async (_track, _order, _mode, provider) => {
    providers.push(provider);
    return { provider, synced: [{ text: provider }] };
  };
  const initial = await h.prefetcher.loadLyrics(track);
  assert.equal(initial.trackLyricsProviderOverride, "spotify");
  assert.strictEqual(await h.prefetcher.loadLyrics(track), initial);
  revision++;
  assert.equal((await h.prefetcher.loadLyrics(track)).synced[0].text, "lrclib");
  assert.deepEqual(providers, ["spotify", "lrclib"]);
});

test("prefetch early failure cannot clear a same-key replacement", async () => {
  const h = harness();
  let replacement;
  h.context.ivLyricsDebug = message => {
    if (!message.includes("Fetching translation")) return;
    h.context.ivLyricsDebug = () => {};
    const key = h.prefetcher.requests.keys().next().value;
    assert.ok(key, "ownership must be registered before synchronous callbacks run");
    h.prefetcher.requests.delete(key);
    replacement = h.prefetch();
    throw new Error("obsolete synchronous setup failure");
  };
  assert.equal(await h.prefetch(), null);
  await flush();
  assert.equal(h.prefetcher.requests.size, 1);
  assert.equal(h.calls.length, 1);
  h.resolve(h.calls[0], "Replacement");
  await replacement;
  assert.equal(h.cache.get(h.key())[0].text, "Replacement");
  assert.equal(h.prefetcher.requests.size, 0);
});

for (const kind of ["foreground", "prefetch"]) {
  test(`${kind}: synchronous provider failure preserves a reentrant replacement`, async () => {
    const h = harness();
    const requests = kind === "foreground" ? h.app._inflightGemini : h.prefetcher.requests;
    const start = kind === "foreground" ? h.request : h.prefetch;
    const provider = h.window.Translator.callGemini;
    let replacement;
    h.window.Translator.callGemini = () => {
      h.window.Translator.callGemini = provider;
      const key = requests.keys().next().value;
      requests.delete(key);
      replacement = start();
      throw new Error("synchronous provider failure");
    };
    const obsolete = start();
    if (kind === "foreground") await assert.rejects(obsolete, /^Error: synchronous provider failure$/);
    else assert.equal(await obsolete, null);
    await flush();
    assert.equal(requests.size, 1);
    assert.equal(h.calls.length, 1);
    h.resolve(h.calls[0], "Replacement");
    await replacement;
    assert.equal(h.cache.get(h.key())[0].text, "Replacement");
    assert.equal(requests.size, 0);
  });
}

test("empty or malformed prefetch sources leave active requests intact", async () => {
  const h = harness();
  const active = Promise.resolve("active");
  h.prefetcher.requests.set("protected", active);
  for (const lyrics of [null, undefined, {}, { synced: [] }, { synced: {} }, { synced: "bad" },
    { synced: [null, {}, { text: "" }] }]) {
    assert.equal(await h.prefetcher.loadTranslations({ uri: h.app.state.uri }, lyrics), undefined);
    assert.strictEqual(h.prefetcher.requests.get("protected"), active);
    assert.equal(h.prefetcher.requests.size, 1);
  }
  assert.equal(h.calls.length, 0);
});

test("foreground malformed input rejects without changing in-flight state", async () => {
  const h = harness();
  const active = Promise.resolve("active");
  h.app._inflightGemini.set(h.key(), active);
  for (const lyrics of [null, undefined, {}, [], "bad"]) {
    await assert.rejects(h.app.getGeminiTranslation(h.app.state, lyrics, "gemini_ko"), /Gemini API key missing/);
    assert.strictEqual(h.app._inflightGemini.get(h.key()), active);
    assert.equal(h.app._inflightGemini.size, 1);
  }
  assert.equal(h.calls.length, 0);
});

test("blank lyric rows handle synchronous provider validation errors", async () => {
  const h = harness();
  h.lines.splice(0, h.lines.length, null, {}, { text: "" });
  h.window.Translator.callGemini = () => { throw new Error("No text provided for translation"); };
  await assert.rejects(h.request(), /^Error: No text provided for translation$/);
  assert.equal(h.app._inflightGemini.size, 0);
  assert.equal(h.cache._cache.size, 0);
});

test("generation options add no text scans beyond the existing lyric shape signature", () => {
  const h = harness();
  let reads = 0;
  const lines = [{ get text() { reads++; return "こんにちは"; } }];
  h.context.shapeSignature(lines);
  const shapeReads = reads;
  assert.ok(shapeReads > 0);
  for (const mode of modes) {
    reads = 0;
    h.context.cacheKey({ ...h.app.state, currentLyrics: lines }, mode);
    assert.equal(reads, shapeReads, "only the existing shape calculation reads source text");
  }
});

test("stream ownership checks do not rescan the cached lyric source", async () => {
  const h = harness();
  let reads = 0;
  h.app.state.currentLyrics = [{ get text() { reads++; return "こんにちは"; } }];
  const pending = h.request();
  await flush();
  const initialReads = reads;
  h.calls[0].params.onLine(0, "Current");
  h.calls[0].params.onStreamReset();
  h.resolve(h.calls[0], "Current");
  await pending;
  assert.equal(reads, initialReads, "stream and completion guards only compare generation options");
});

test("the route shares the existing per-mode request window with its cache and late-loaded providers", async () => {
  const host = {};
  let time = 0;
  const calls = [];
  const legacyReads = [];
  const { requestLyricsTranslation } = createPageTranslation({
    host, memoryCache: createPageTranslationMemoryCache(),
    readVisualSettings: () => ({ "translate:target-language": "en" }),
    readLocalSetting: () => null,
    readPersistedSetting: key => legacyReads.push(key),
    readAppLanguage: () => "en",
    readSpotifyLocale: () => "en-US",
    getTranslationCacheId: uri => uri.split(":").at(-1),
    translate: key => key,
    now: () => time,
  });
  host.Translator = {
    async callGemini(params) {
      calls.push([params.trackId, params.wantSmartPhonetic]);
      return params.wantSmartPhonetic ? { phonetic: ["reading"] } : { translation: ["meaning"] };
    },
  };
  const lyrics = [{ text: "source", startTime: 1000 }];
  const inflight = new Map();
  const request = (id, mode = "gemini_ko") => {
    const lyricsState = { uri: `spotify:track:${id}`, synced: lyrics };
    return requestLyricsTranslation({ lyricsState, lyrics, mode, session: {
      getState: () => lyricsState,
      getTargetLanguage: () => "en",
      getSourceLanguage: () => "es",
      getInflightRequests: () => inflight,
      ensureInflightRequests: () => inflight,
      isCurrentLyricsState: state => state === lyricsState,
      startLoading() {},
      finishLoading() {},
    } });
  };

  for (let id = 0; id < 5; id++) await request(id);
  await assert.rejects(request(5), /notifications\.tooManyTranslationRequests/);
  await request(5, "gemini_romaji");
  time = 1999;
  await assert.rejects(request(5), /notifications\.tooManyTranslationRequests/);
  time = 2000;
  await request(5);
  await request(5);
  assert.deepEqual(calls, [["0", false], ["1", false], ["2", false], ["3", false], ["4", false], ["5", true], ["5", false]]);
  assert.equal(inflight.size, 0);
  assert.equal(legacyReads.length, 20);
  assert.deepEqual([...new Set(legacyReads)], ["ivLyrics:visual:gemini-api-key", "ivLyrics:visual:gemini-api-key-romaji"]);
});
