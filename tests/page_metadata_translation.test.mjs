import assert from "node:assert/strict";
import test from "node:test";
import { cancelPendingPageMetadataTranslation, createPageMetadataTranslation } from "#ivlyrics/lyrics/createPageMetadataTranslation.mjs";
import { createPageLyricsPresenter } from "#ivlyrics/lyrics/pageLyricsPresenter.mjs";
import { createTranslator } from "#ivlyrics/lyrics/createTranslator.mjs";

function applyState(update, callback) {
  const patch = typeof update === "function" ? update(this.state) : update;
  if (patch) this.state = { ...this.state, ...patch };
  callback?.();
}

test("a late title translation cannot publish over the next track", async () => {
  const requests = new Map();
  const published = [];
  const loading = [];
  let token = 0;
  const page = {
    currentTrackUri: "spotify:track:first",
    state: { uri: "spotify:track:first" },
    startTranslationLoading: () => ++token,
    clearTranslationLoading: (id, options) => loading.push([id, options.completed]),
    setState: applyState,
  };
  const fetchMetadata = createPageMetadataTranslation({
    isEnabled: () => true,
    getTranslationCacheId: (uri) => uri.split(":").at(-1),
    getTranslator: () => ({
      translateMetadata(request) {
        const pending = Promise.withResolvers();
        requests.set(request.trackId, { request, ...pending });
        return pending.promise;
      },
    }),
    publishMetadata: (metadata, uri) => published.push({ metadata, uri }),
  });

  const first = fetchMetadata(page, page.currentTrackUri, "First", "Artist");
  page.currentTrackUri = "spotify:track:second";
  page.state = { uri: page.currentTrackUri };
  const second = fetchMetadata(page, page.currentTrackUri, "Second", "Artist");
  const result = { translated: { title: "Second title", artist: "Artist name" } };
  requests.get("second").resolve(result);
  await second;
  requests.get("first").resolve({ translated: { title: "First title" } });
  await first;

  assert.equal(page.state.translatedMetadata, result);
  assert.deepEqual(published, [{ metadata: result, uri: "spotify:track:second" }]);
  assert.deepEqual(loading, [[1, false], [2, true]]);
  assert.deepEqual(requests.get("second").request, {
    trackId: "second", title: "Second", artist: "Artist", ignoreCache: false,
  });
});

test("a title translation for a superseded language cannot republish on the same track", async () => {
  const pending = [];
  const published = [];
  const finished = [];
  let language = "en";
  const page = {
    currentTrackUri: "spotify:track:same",
    state: { uri: "spotify:track:same" },
    startTranslationLoading: () => pending.length + 1,
    clearTranslationLoading: (token, options) => finished.push([token, options]),
    setState: applyState,
  };
  const translator = {
    translateMetadata() {
      const request = Promise.withResolvers();
      pending.push(request);
      return request.promise;
    },
  };
  const fetchMetadata = createPageMetadataTranslation({
    isEnabled: () => true,
    getTranslationCacheId: () => "same",
    getTranslator: () => translator,
    getTargetLanguage: () => language,
    publishMetadata: result => published.push(result),
  });
  const older = fetchMetadata(page, page.currentTrackUri, "Title", "Artist");
  language = "ko";
  const current = fetchMetadata(page, page.currentTrackUri, "Title", "Artist");
  const result = { translated: { title: "제목" } };
  pending[1].resolve(result);
  await current;
  pending[0].resolve({ translated: { title: "Title" } });
  await older;
  assert.strictEqual(page.state.translatedMetadata, result);
  assert.deepEqual(published, [result]);
  assert.deepEqual(finished, [[1, { completed: false, cancelled: true }], [2, { completed: true, cancelled: false }]]);
});

test("metadata reaches the overlay only after a matching React commit", async () => {
  const uri = "spotify:track:metadata";
  const next = "spotify:track:next";
  const result = { translated: { title: "번역 제목" } };
  const jobs = [];
  const delivered = [];
  const finished = [];
  let playback = uri;
  let language = "ko";
  let revision = 1;
  const page = {
    currentTrackUri: uri, _activeLyricsFetchSeq: 1, _isComponentMounted: true,
    state: { uri, lyricsRequestSeq: 1 },
    isPlaybackUriCurrent: requestedUri => playback === requestedUri,
    startTranslationLoading: () => jobs.length + 1,
    clearTranslationLoading: (_token, status) => finished.push(status),
    setState(update, callback) { jobs.push({ update, callback }); },
  };
  const fetchMetadata = createPageMetadataTranslation({
    isEnabled: () => true,
    getTranslationCacheId: () => "metadata",
    getTranslator: () => ({ getCacheRevision: () => revision, translateMetadata: async () => result }),
    getTargetLanguage: () => language,
    publishMetadata(data, requestUri) {
      assert.equal(page.state.translatedMetadata, data, "delivery sees the committed state");
      delivered.push([requestUri, data]);
    },
  });
  async function start() {
    const promise = fetchMetadata(page, uri, "Title", "Artist");
    await Promise.resolve();
    const entry = jobs.at(-1);
    assert.ok(entry);
    return { promise, commit: () => applyState.call(page, entry.update, entry.callback) };
  }

  const valid = await start();
  assert.deepEqual(delivered, []);
  valid.commit();
  await valid.promise;
  assert.deepEqual(delivered, [[uri, result]]);
  assert.deepEqual(finished.at(-1), { completed: true, cancelled: false });

  for (const invalidation of ["playback", "same-track reload", "language", "cache", "unmount"]) {
    page.state = { uri, lyricsRequestSeq: page._activeLyricsFetchSeq };
    const obsolete = await start();
    if (invalidation === "playback") playback = next;
    if (invalidation === "same-track reload") page._activeLyricsFetchSeq++;
    if (invalidation === "language") language = "en";
    if (invalidation === "cache") revision++;
    if (invalidation === "unmount") {
      page._isComponentMounted = false;
      cancelPendingPageMetadataTranslation(page);
      // React may never call the discarded update's callback after unmount.
      await obsolete.promise;
    }
    obsolete.commit();
    await obsolete.promise;
    assert.equal(page.state.translatedMetadata, undefined, invalidation);
    assert.equal(delivered.length, 1, invalidation);
    assert.deepEqual(finished.at(-1), { completed: false, cancelled: true }, invalidation);
    playback = uri;
    language = "ko";
    page._isComponentMounted = true;
  }
});

test("a metadata response retired during generation or disk write is never returned as current", async () => {
  for (const retireAt of ["generation", "cache write"]) {
    const generated = Promise.withResolvers();
    const diskWrite = Promise.withResolvers();
    const started = Promise.withResolvers();
    const writing = Promise.withResolvers();
    const Translator = createTranslator({
      LocalLanguageConverter: class {}, getTargetLanguage: () => "ko",
      getAIManager: () => ({
        translateMetadata() {
          started.resolve();
          return generated.promise;
        },
      }),
      cache: {
        getMetadata: async () => null,
        setMetadata() {
          writing.resolve();
          return diskWrite.promise;
        },
      },
    });
    const translation = Translator.translateMetadata({ trackId: "metadata", title: "Song", artist: "Artist" });
    await started.promise;
    const result = { translated: { title: "번역" } };
    if (retireAt === "cache write") {
      generated.resolve(result);
      await writing.promise;
    }
    Translator.clearMetadataCache();
    generated.resolve(result);
    diskWrite.resolve();
    assert.equal(await translation, null, retireAt);
    assert.equal(Translator.getMetadataFromCache("metadata"), null);
  }
});

test("the first lyrics publication carries an already translated title only for its owning track", () => {
  const uri = "spotify:track:current";
  const translatedMetadata = { translated: { title: "현재 곡" } };
  const page = {
    state: { uri, title: "Song", artist: "Artist", translatedMetadata },
    getCurrentMode: () => 1,
    getTranslationTargetLanguage: () => "ko",
    isCurrentLyricsUri: value => value === uri,
    isPlaybackUriCurrent: value => value === uri,
  };
  const visual = { "translate-metadata": true };
  const { publish } = createPageLyricsPresenter({
    page, getVisualSettings: () => visual,
    getCurrentLyricsPronunciationNotation: () => "translation",
    publishReady: detail => detail,
  });
  const lines = [{ text: "Line" }];
  assert.equal(publish(lines).trackInfo.translatedMetadata, translatedMetadata);
  visual["translate-metadata"] = false;
  assert.equal(publish(lines).trackInfo.translatedMetadata, undefined);
  visual["translate-metadata"] = true;
  page.state.uri = "spotify:track:outgoing";
  assert.equal(publish(lines, { uri }).trackInfo.translatedMetadata, undefined);
});
