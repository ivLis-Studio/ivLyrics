import assert from "node:assert/strict";
import test from "node:test";
import { setImmediate } from "node:timers/promises";
import { createPageCulturalAnnotations } from "../src/lyrics/createPageCulturalAnnotations.mjs";

function harness() {
  const calls = [], errors = [], successes = [], completions = [], cacheClears = [], loading = [], clearOrder = [];
  let target = "en", enabled = true;
  const page = {
    state: { uri: "spotify:track:fixture", title: "Fixture", currentLyrics: [{ text: "original" }] },
    _isComponentMounted: true,
    getCurrentMode: () => -1,
    getTranslationTargetLanguage: () => target,
    provideLanguageCode: () => "ja",
    isCurrentLyricsUri: uri => uri === page.state.uri,
    startCulturalAnnotationsLoading: () => calls.length + 1,
    updateGenerationRequestLoading: (...args) => loading.push(args),
    clearCulturalAnnotationsLoading: (...args) => completions.push(args),
    setState(patch) { Object.assign(this.state, typeof patch === "function" ? patch(this.state) : patch); },
  };
  const translator = {
    clearCulturalAnnotationRequests: trackId => clearOrder.push(["pending", trackId]),
    generateCulturalAnnotations(params) {
      let resolve, reject;
      const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
      calls.push({ params, resolve, reject });
      return promise;
    },
  };
  const annotations = createPageCulturalAnnotations({
    page,
    getVisualSettings: () => ({ "cultural-annotations-enabled": enabled }),
    buildTranslationLineRequests: lyrics => lyrics.map((line, lineIndex) => ({ lineIndex, text: line.text })),
    getTranslator: () => translator,
    playbackUri: () => page.state.uri,
    extractTrackId: uri => uri.split(":").at(-1),
    getLyricsCache: () => ({
      clearCulturalAnnotationsForTrack: async trackId => {
        clearOrder.push(["disk", trackId]);
        cacheClears.push(trackId);
        return true;
      },
    }),
    toast: { show() {}, error: value => errors.push(value), success: value => successes.push(value) },
    translate: key => key,
  });
  return {
    page, annotations, calls, errors, successes, completions, cacheClears, loading, clearOrder,
    setTarget: value => { target = value; }, setEnabled: value => { enabled = value; },
    request: (options = {}) => annotations.request({
      lyricsState: page.state, lyrics: [{ text: "original" }], sourceLang: "ja", uri: page.state.uri, ...options,
    }),
    resolve: (index, note) => calls[index].resolve({ annotations: [{ lineIndex: 0, expression: "original", note }] }),
    note: () => page.state.currentLyrics[0].culturalNote?.[0]?.note,
  };
}

for (const order of ["old-first", "new-first"]) {
  for (const change of ["language", "source", "forced-refresh"]) {
    test(`cultural annotation ${change} cannot be overwritten by an older request (${order})`, async () => {
      const h = harness();
      const old = h.request();
      if (change === "language") h.setTarget("ko");
      const next = h.request(change === "source" ? { lyrics: [{ text: "new source" }] } : { ignoreCache: true });
      assert.equal(h.calls.length, 2);
      const finishOld = async () => { h.resolve(0, "obsolete"); await old; };
      const finishNew = async () => { h.resolve(1, "current"); await next; };
      if (order === "old-first") { await finishOld(); await finishNew(); }
      else { await finishNew(); await finishOld(); }
      assert.equal(h.note(), "current");
      assert.equal(h.errors.length, 0);
    });
  }
}

test("returning to a cached target invalidates the other language's pending request", async () => {
  const h = harness();
  const initial = h.request(); h.resolve(0, "cached English"); await initial;
  h.setTarget("ko"); const pending = h.request();
  h.setTarget("en"); await h.request();
  h.resolve(1, "obsolete Korean"); await pending;
  assert.equal(h.note(), "cached English");
});

test("returning to an inflight source reuses that request and its ownership", async () => {
  const h = harness();
  const english = h.request();
  h.setTarget("ko"); const korean = h.request();
  h.setTarget("en"); assert.equal(h.request(), english);
  assert.equal(h.calls.length, 2);
  h.resolve(0, "current English"); await english;
  h.resolve(1, "obsolete Korean"); await korean;
  assert.equal(h.note(), "current English");
});

for (const clear of ["clearTrack", "clearAll"]) {
  test(`${clear} keeps late requests from restoring removed notes`, async () => {
    const h = harness(); const pending = h.request();
    if (clear === "clearTrack") h.annotations.clearTrack(h.page.state.uri);
    else h.annotations.clearAll();
    h.resolve(0, "obsolete");
    assert.equal(await pending, null);
    assert.equal(h.note(), undefined);
    const next = h.request();
    assert.equal(h.calls.length, 2, "an invalidated result must never serve a later request");
    h.resolve(1, "current");
    await next;
  });
}

test("disabled annotations and stale failures never update or notify the page", async () => {
  const h = harness(); const old = h.request();
  h.setTarget("ko"); const current = h.request();
  h.calls[0].reject(new Error("obsolete failure")); await old;
  h.setEnabled(false); h.resolve(1, "disabled"); await current;
  assert.equal(h.note(), undefined); assert.equal(h.errors.length, 0);
  assert.equal(h.completions.length, 2, "all loading tokens are released");
});

async function startManualRegeneration(h) {
  const pending = h.annotations.regenerate();
  // Drain the asynchronous cache clear before superseding its request.
  await setImmediate();
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].params.ignoreCache, true);
  return { pending };
}

for (const change of ["target-change", "same-key forced request"]) {
  for (const order of ["old-first", "new-first"]) {
    for (const outcome of ["success", "failure"]) {
      test(`manual annotation regeneration stays quiet after ${change} (${order}, stale ${outcome})`, async () => {
        const h = harness();
        const { pending: manual } = await startManualRegeneration(h);
        if (change === "target-change") h.setTarget("ko");
        // Supersede through the real request method, without a second manual
        // regeneration clearing the cache or advancing the invalidation epoch.
        const current = h.request({ ignoreCache: change === "same-key forced request" });
        assert.equal(h.calls.length, 2);
        assert.deepEqual(h.cacheClears, ["fixture"]);
        const finishOld = async () => {
          if (outcome === "failure") h.calls[0].reject(new Error("obsolete provider failure"));
          else h.resolve(0, "obsolete");
          await manual;
        };
        const finishNew = async () => { h.resolve(1, "current"); await current; };
        if (order === "old-first") { await finishOld(); await finishNew(); }
        else { await finishNew(); await finishOld(); }
        assert.equal(h.note(), "current");
        assert.deepEqual(h.errors, [], "the superseded caller must not report a failure");
        assert.deepEqual(h.successes, [], "the superseded caller must not report success");
      });
    }
  }
}

test("current manual annotation regeneration still announces success", async () => {
  const h = harness();
  const { pending } = await startManualRegeneration(h);
  h.resolve(0, "current");
  await pending;
  assert.equal(h.note(), "current");
  assert.deepEqual(h.errors, []);
  assert.deepEqual(h.successes, ["notifications.culturalAnnotationsRegenerated"]);
  assert.deepEqual(h.clearOrder, [["pending", "fixture"], ["disk", "fixture"]]);
});

test("a superseded provider cannot update another language's loading banner", async () => {
  const h = harness();
  const older = h.request();
  h.calls[0].params.onProviderLoading({ providerName: "Obsolete" });
  h.setTarget("ko");
  const current = h.request();
  h.calls[1].params.onProviderLoading({ providerName: "Current" });
  await setImmediate();
  assert.equal(h.loading.length, 1);
  assert.match(h.loading[0][1].description, /Current$/);
  h.resolve(0, "obsolete");
  h.resolve(1, "current");
  await Promise.all([older, current]);
});

test("current manual annotation provider failure still notifies exactly once", async () => {
  const h = harness();
  const { pending } = await startManualRegeneration(h);
  h.calls[0].reject(new Error("current provider failure"));
  await pending;
  assert.equal(h.note(), undefined);
  assert.deepEqual(h.successes, []);
  assert.equal(h.errors.length, 1);
  assert.match(h.errors[0], /^notifications\.culturalAnnotationsRegenerateFailed:/);
});
