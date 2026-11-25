import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { readTranslationRuntimeFixture } from "./fixtures/legacy-page-source.mjs";
import { createPageLyricsPresenter } from "../src/lyrics/pageLyricsPresenter.mjs";
import { createPageTranslationMemoryCache } from "../src/lyrics/pageMemoryCache.mjs";

const source = readFileSync(new URL("../src/spicetify/index.js", import.meta.url), "utf8");
const section = (from, to) => {
  const start = source.indexOf(from);
  const end = source.indexOf(to, start + from.length);
  assert.ok(start >= 0 && end > start, `Missing production section: ${from}`);
  return source.slice(start, end);
};
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };

// Exercise production presentation, mapping, memory and persistent-cache reads.
// All text is synthetic; an unexpected AI request fails instead of using a network.
function harness({ mode1 = "gemini_ko", mode2 = "none", target = "zh-CN" } = {}) {
  const lines = [{ text: "明日も一緒に歩こう", startTime: 1000, endTime: 3000 }];
  const item = { uri: "spotify:track:translation-identity", title: "Fixture", artist: "Fixture" };
  const config = { visual: {
    "translate:target-language": target,
    "translation-mode:japanese": mode1,
    "translation-mode-2:japanese": mode2,
  } };
  let locale = "zh-CN", style = "natural";
  const reads = [], presentations = [], timers = new Map();
  let timer = 0;
  const window = {
    CONFIG: config,
    I18n: { getCurrentLanguage: () => locale },
    AIAddonManager: { getTranslationStyle: () => style },
    ivLyricsTextComparison: {
      normalize: value => String(value || "").trim(),
      areEquivalent: (left, right) => left === right,
    },
    LyricsCache: {
      async getTranslation(id, lang, phonetic, provider, hash) {
        reads.push({ id, lang, phonetic, provider, hash });
        const value = phonetic ? `${lang}:reading` : `${lang}:${style}:meaning`;
        return phonetic ? { phonetic: [value] } : { translation: [value] };
      },
    },
    Translator: { callGemini() { assert.fail("Cached fixtures must not generate AI output"); } },
  };
  const context = vm.createContext({
    window, CONFIG: config, APP_NAME: "ivLyrics", console,
    CacheManager: createPageTranslationMemoryCache(),
    setTimeout(callback) { timers.set(++timer, callback); return timer; },
    clearTimeout(id) { timers.delete(id); },
    Spicetify: { Player: { data: { item } } },
    localStorage: { getItem: () => null },
    StorageManager: { getPersisted() {} },
    Utils: { isSectionHeader: () => false, getTranslationCacheId: uri => uri.split(":").at(-1) },
    SYNCED: 1, UNSYNCED: 2, isKaraokeRenderMode: value => value === 0,
    ivLyricsDebug() {}, I18n: { ...window.I18n, t: key => key },
    Toast: { error(message) { assert.fail(message); } },
  });
  vm.runInContext([
    readTranslationRuntimeFixture(),
    `class Container {
      ${section("  lyricsSource(", "  getTraditionalConversion(")}
    }
    globalThis.Container = Container;`,
  ].join("\n"), context);
  const app = new context.Container();
  Object.assign(app, {
    state: { ...item, synced: lines, currentLyrics: lines, provider: "fixture" },
    _lyricsPresentationSeq: 0, _dmResults: {}, _inflightGemini: new Map(),
    _sharedPresentationKeys: new Map(),
    isCurrentLyricsState: () => true,
    isCurrentLyricsUri: uri => uri === app.state.uri,
    isPlaybackUriCurrent: uri => uri === item.uri,
    getCurrentMode: () => 1,
    resolveLyricsForMode: state => state.synced,
    provideLanguageCode: () => "ja",
    requestCulturalAnnotations() {},
    applyCulturalAnnotations: lyrics => lyrics,
    setState(update, callback) {
      const patch = typeof update === "function" ? update(this.state) : update;
      if (patch) this.state = { ...this.state, ...patch };
      callback?.();
    },
    startTranslationLoading() {}, startPhoneticLoading() {},
    clearTranslationLoading() {}, clearPhoneticLoading() {},
  });
  // Use the same target resolver as the page (including auto/interface locale).
  const presentationDependencies = vm.runInContext(`({
    getCurrentTranslationTargetLanguage, getCurrentLyricsPronunciationNotation,
    getTranslationStyle,
    getDisplayModeGenerationOptions, getSyncDataRendererCacheVersion,
    getLyricsProcessingShapeSignature, getNonSectionLyricsText,
  })`, context);
  app.getTranslationTargetLanguage = presentationDependencies.getCurrentTranslationTargetLanguage;
  app.lyricPresenter = createPageLyricsPresenter({
    page: app,
    ...presentationDependencies,
    getVisualSettings: () => config.visual,
    getLyricsService: () => window.LyricsService,
    getLanguagePrompt: () => window.ivLyricsFirstLanguagePrompt,
    translate: context.I18n.t, notifyError: context.Toast.error, debug() {},
    scheduleTimer: context.setTimeout,
    cancelTimer: context.clearTimeout,
    publishReady: detail => presentations.push({ detail }),
  });
  return {
    app, reads, presentations, lines, timers, window,
    setTarget: value => { config.visual["translate:target-language"] = value; },
    setFirstMode: value => { config.visual["translation-mode:japanese"] = value; },
    setLocale: value => { locale = value; },
    setStyle: value => { style = value; },
    setNotation: value => { config.visual["translate:pronunciation-notation"] = value; },
    async present() { app.lyricsSource(app.state, 1); await flush(); return app.state.currentLyrics[0]; },
  };
}

for (const [mode1, mode2] of [["gemini_ko", "none"], ["none", "gemini_ko"], ["gemini_ko", "gemini_romaji"]]) {
  test(`${mode1}/${mode2}: a completed Chinese presentation cannot override the Korean cache`, async () => {
    const h = harness({ mode1, mode2 });
    assert.equal((await h.present()).text2, "zh-CN:natural:meaning");
    h.setTarget("ko");
    const result = await h.present();
    assert.equal(result.text2, "ko:natural:meaning");
    if (mode2 === "gemini_romaji") assert.equal(result.phoneticText, "ko:reading");
    const reads = h.reads.length;
    assert.equal((await h.present()).text2, "ko:natural:meaning");
    assert.equal(h.reads.length, reads, "unchanged presentation reuses its completed results");
    assert.equal(h.presentations.at(-1).detail.translationSourceText, h.lines[0].text);
  });
}

test("auto target follows the interface locale even when both display modes stay the same", async () => {
  const h = harness({ target: "auto", mode2: "gemini_romaji" });
  await h.present();
  h.setLocale("ko");
  const result = await h.present();
  assert.equal(result.text2, "ko:natural:meaning");
  assert.equal(result.phoneticText, "ko:reading");
});

test("translation style invalidates only the completed translation slot", async () => {
  const h = harness({ target: "ko", mode2: "gemini_romaji" });
  await h.present();
  const phoneticReads = h.reads.filter(read => read.phonetic).length;
  h.setStyle("literal");
  assert.equal((await h.present()).text2, "ko:literal:meaning");
  assert.equal(h.reads.filter(read => read.phonetic).length, phoneticReads);
  assert.equal(h.presentations.at(-1).detail.translationStyle, "literal");
});

test("a remounted page rejects a completed shared snapshot from the previous translation style", async () => {
  const h = harness({ target: "ko", mode2: "gemini_romaji" });
  await h.present();
  const { lyrics, trackInfo, ...context } = h.presentations.at(-1).detail;
  const snapshot = { ...context, displayLyrics: lyrics, trackUri: trackInfo.uri };
  h.window.LyricsService = { getLyricsSnapshot: () => snapshot };
  h.app._dmResults = {};

  const initialReads = h.reads.length;
  assert.equal((await h.present()).text2, "ko:natural:meaning");
  assert.equal(h.reads.length, initialReads);
  h.setStyle("literal");
  assert.equal((await h.present()).text2, "ko:literal:meaning");
  assert.ok(h.reads.slice(initialReads).some(read => !read.phonetic && read.hash.includes("style=literal")));
});

test("pronunciation notation preserves the completed translation slot", async () => {
  const h = harness({ target: "ko", mode2: "gemini_romaji" });
  await h.present();
  const translationReads = h.reads.filter(read => !read.phonetic).length;
  h.setNotation("ipa");
  assert.equal((await h.present()).text2, "ko:natural:meaning");
  assert.equal(h.reads.filter(read => !read.phonetic).length, translationReads);
  assert.ok(h.reads.filter(read => read.phonetic).at(-1).hash.includes("notation=ipa"));
});

test("provider translation fields cannot replace the selected cached AI translation", async () => {
  const h = harness({ target: "ko" });
  Object.assign(h.lines[0], { translation: "供应商翻译", translationText: "供应商翻译", text2: "供应商翻译" });
  const result = await h.present();
  assert.equal(result.text2, "ko:natural:meaning");
  assert.equal(result.translationText, "ko:natural:meaning");
  assert.equal(result.originalText, h.lines[0].text);
  assert.equal(h.lines[0].translation, "供应商翻译", "provider input is not mutated");
});

test("a queued partial cannot overwrite the completed translation", async () => {
  const h = harness();
  let stream, complete;
  h.app.getGeminiTranslation = (_state, _lines, _mode, onProgress) => {
    stream = onProgress;
    return new Promise(resolve => { complete = resolve; });
  };

  h.app.lyricsSource(h.app.state, 1);
  stream([{ text: "Intermediate text" }]);
  assert.equal(h.timers.size, 1);
  const [staleFlush] = h.timers.values();

  complete([{ text: "Completed text" }]);
  await flush();
  assert.equal(h.timers.size, 0);
  assert.equal(h.app.state.currentLyrics[0].text2, "Completed text");
  assert.equal(h.presentations.at(-1).detail.presentationComplete, true);

  const published = h.presentations.length;
  staleFlush();
  assert.equal(h.app.state.currentLyrics[0].text2, "Completed text");
  assert.equal(h.presentations.length, published);
});

test("a new presentation cannot reuse a still-streaming partial as a completed translation", async () => {
  const h = harness();
  const requests = [];
  h.app.getGeminiTranslation = (_state, _lines, _mode, onProgress) =>
    new Promise(resolve => requests.push({ onProgress, resolve }));

  h.app.lyricsSource(h.app.state, 1);
  requests[0].onProgress([{ text: "Incomplete text" }]);
  [...h.timers.values()][0]();
  assert.equal(h.app.state.currentLyrics[0].text2, "Incomplete text");
  assert.equal(h.presentations.at(-1).detail.presentationComplete, false);

  h.app.lyricsSource(h.app.state, 1);
  assert.equal(requests.length, 2);
  requests[0].resolve(null);
  await flush();
  assert.equal(h.app.state.currentLyrics[0].text2 ?? null, null);
  assert.equal(h.presentations.at(-1).detail.presentationComplete, false);

  requests[0].onProgress([{ text: "Late output from the retired stream" }]);
  requests[1].resolve([{ text: "Retried final text" }]);
  await flush();
  assert.equal(h.app.state.currentLyrics[0].text2, "Retried final text");
  assert.equal(h.presentations.at(-1).detail.presentationComplete, true);
});

test("a completed pronunciation can be reused while an interrupted translation is retried", async () => {
  const h = harness({ mode1: "gemini_romaji", mode2: "gemini_ko" });
  const requests = [];
  h.app.getGeminiTranslation = (_state, _lines, mode, onProgress) =>
    new Promise(resolve => requests.push({ mode, onProgress, resolve }));

  h.app.lyricsSource(h.app.state, 1);
  requests[1].onProgress([{ text: "Partial translation" }]);
  requests[0].resolve([{ text: "Final pronunciation" }]);
  await flush();
  assert.equal(h.app.state.currentLyrics[0].phoneticText, "Final pronunciation");
  assert.equal(h.app.state.currentLyrics[0].text2, "Partial translation");
  assert.equal(h.presentations.at(-1).detail.presentationComplete, false);

  requests[1].resolve(null);
  await flush();
  assert.equal(h.app.state.currentLyrics[0].phoneticText, "Final pronunciation");
  assert.equal(h.app.state.currentLyrics[0].text2 ?? null, null);
  assert.equal(h.presentations.at(-1).detail.presentationComplete, false);

  h.app.lyricsSource(h.app.state, 1);
  assert.deepEqual(requests.map(({ mode }) => mode), ["gemini_romaji", "gemini_ko", "gemini_ko"]);
  requests[2].resolve([{ text: "Final translation" }]);
  await flush();
  assert.equal(h.app.state.currentLyrics[0].phoneticText, "Final pronunciation");
  assert.equal(h.app.state.currentLyrics[0].text2, "Final translation");
  assert.equal(h.presentations.at(-1).detail.presentationComplete, true);
});

test("manually regenerated partials reach the page and stay owned by the current request", () => {
  const h = harness();
  let ownsRequest = true;
  const payload = {
    uri: h.app.state.uri, lyrics: h.lines, lyricsMode1: [{ text: "Manually regenerated text" }],
    displayMode1: "gemini_ko", canApply: () => ownsRequest,
  };
  h.app.lyricPresenter.enqueueStreamingTranslation(payload);
  assert.equal(h.timers.size, 1);
  let [flushPartial] = h.timers.values();
  h.timers.clear();
  flushPartial();
  assert.equal(h.app.state.currentLyrics[0].text2, "Manually regenerated text");
  assert.equal(h.presentations.at(-1).detail.presentationComplete, false);

  h.app.lyricPresenter.enqueueStreamingTranslation({
    ...payload, lyricsMode1: [{ text: "Stale regeneration" }],
  });
  [flushPartial] = h.timers.values();
  ownsRequest = false;
  flushPartial();
  assert.equal(h.app.state.currentLyrics[0].text2, "Manually regenerated text");
});

for (const [setting, change] of [["target language", h => h.setTarget("ko")], ["display mode", h => h.setFirstMode("none")]]) {
  test(`queued output is ignored after changing ${setting} before a new presentation runs`, async () => {
    const h = harness();
    let stream, complete;
    h.app.getGeminiTranslation = (_state, _lines, _mode, onProgress) => {
      stream = onProgress;
      return new Promise(resolve => { complete = resolve; });
    };

    h.app.lyricsSource(h.app.state, 1);
    stream([{ text: "Old streamed text" }]);
    assert.equal(h.timers.size, 1);
    const [flushPartial] = h.timers.values();
    const original = h.app.state.currentLyrics;
    const published = h.presentations.length;

    change(h);
    flushPartial();
    complete([{ text: "Old completed text" }]);
    await flush();
    assert.equal(h.app.state.currentLyrics, original);
    assert.equal(h.presentations.length, published);
  });
}
