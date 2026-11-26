import assert from 'node:assert/strict';
import { createKaraokeWordSupplementHook } from "#ivlyrics/lyrics/karaokeWordSupplementHook.mjs";
import test from 'node:test';

const tick = async () => { await Promise.resolve(); await Promise.resolve(); };

function harness() {
  const slots = [], effects = [], listeners = new Map(), requests = [], timers = new Map();
  const settings = { uri: 'spotify:track:A', target: 'en', notation: 'latin', language: 'ja',
    reading: 'gemini_romaji', gloss: true };
  let cursor = 0, nextTimer = 0;
  const request = (kind, args) => new Promise((resolve, reject) => requests.push({ kind, args, resolve, reject }));
  const api = {
    getSourceLanguage: () => settings.language, resolveSourceLanguage: () => settings.language,
    isSuitableSourceLanguage: lang => ['ja', 'ko', 'zh'].includes(lang),
    getWordUnits: chars => chars.map((char, wordKey) => ({ wordKey, surface: char.char })),
    resolveReadingMode: () => settings.reading, isGlossModeActive: () => settings.gloss,
    getLineKey: line => String(line.startTime), getGlossTargetLanguage: () => settings.target,
    getPronunciationNotation: () => settings.notation, isAiCoolingDown: () => true,
    getWordReadings: (...args) => request('reading', args),
    getWordGlosses: (...args) => request('gloss', args),
  };
  const renderWordStack = createKaraokeWordSupplementHook({
    getService: () => api, getTrackUri: () => settings.uri, getDetectedLanguage: () => settings.language,
    subscribeInvalidation(listener) {
      listeners.set('ivLyrics:word-supplements-invalidated', listener);
      return () => listeners.delete('ivLyrics:word-supplements-invalidated');
    },
    reportDebug() {},
    useMemo(build, deps) {
      const i = cursor++, old = slots[i];
      if (!old || deps.some((value, j) => !Object.is(value, old.deps[j]))) slots[i] = { value: build(), deps };
      return slots[i].value;
    },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useState(initial) {
      const i = cursor++; slots[i] ??= { value: initial };
      return [slots[i].value, value => { slots[i].value = typeof value === 'function' ? value(slots[i].value) : value; }];
    },
    useEffect(build, deps) {
      const i = cursor++, old = slots[i];
      if (old && deps.every((value, j) => Object.is(value, old.deps[j]))) return;
      const slot = slots[i] = { deps };
      effects.push(() => { old?.cleanup?.(); slot.cleanup = build(); });
    },
    schedule(callback) { timers.set(++nextTimer, callback); return nextTimer; },
    cancelTimer: id => timers.delete(id),
  });
  let input = { line: { startTime: 1000 }, timedChars: [{ char: '漢' }, { char: '字' }],
    timedText: '漢字', wordTimed: true, settingsRevision: 0 };
  const render = patch => { input = { ...input, ...patch }; cursor = 0; return renderWordStack(input); };
  const commit = () => { effects.splice(0).forEach(effect => effect()); };
  return { settings, requests, render, commit, api,
    invalidate: trackId => listeners.get('ivLyrics:word-supplements-invalidated')({ detail: { trackId } }),
    async ready() {
      render(); commit();
      requests[0].resolve(['kan', 'ji']); requests[1].resolve(['Chinese', 'character']); await tick();
      const stack = render(); commit(); return stack;
    } };
}

test('same-source settings refresh and invalidation retain the mounted word stack until replacement arrives', async () => {
  const h = harness(), before = await h.ready();
  assert.ok(before.hasReading && before.hasGloss);
  assert.equal(h.render({ settingsRevision: 1 }), before);
  h.commit();
  assert.equal(h.render(), before, 'starting a valid refresh cannot remove wrappers');
  h.requests[2].resolve(['new kan', 'new ji']); await tick();
  const partial = h.render(); h.commit();
  assert.equal(partial.supplementByKey.get(0).reading, 'new kan');
  assert.equal(partial.supplementByKey.get(0).gloss, 'Chinese', 'independent gloss remains while reading completes');
  h.requests[3].reject(new Error('transient refresh failure')); await tick();
  assert.equal(h.render(), partial, 'a failed refresh retains valid cached content');
  h.invalidate();
  assert.equal(h.render(), partial); h.commit();
  assert.equal(h.render(), partial, 'explicit same-source regeneration does not blink');
  h.requests[4].resolve(['new kan', 'new ji']); h.requests[5].resolve(['new gloss', 'character']); await tick();
  assert.equal(h.render().supplementByKey.get(0).gloss, 'new gloss');
});

test('only the mounted track refetches after targeted word detail invalidation', async () => {
  const h = harness();
  h.settings.uri = 'spotify:local:artist:album:title:205';
  await h.ready();
  const trackId = 'local-uri:spotify:local:artist:album:title:205';
  assert.equal(h.requests[0].args[4].trackId, trackId);
  h.invalidate('local-uri:spotify:local:artist:album:other:205');
  h.render(); h.commit();
  assert.equal(h.requests.length, 2);
  h.invalidate(trackId);
  h.render(); h.commit();
  assert.equal(h.requests.length, 4);
});

for (const change of ['uri', 'target', 'source', 'language', 'units']) {
  test(`${change} changes hide incompatible content before effect cleanup and ignore older requests`, async () => {
    const h = harness(); await h.ready();
    h.render({ settingsRevision: 1 }); h.commit();
    const old = h.requests.slice(2);
    let patch = {};
    if (change === 'uri') h.settings.uri = 'spotify:track:B';
    if (change === 'target') h.settings.target = 'ko';
    if (change === 'language') h.settings.language = 'ko';
    if (change === 'source') patch = { timedText: '別の歌' };
    if (change === 'units') patch = { timedChars: [{ char: '漢字' }] };
    assert.equal(h.render(patch), null);
    // Resolve before cleanup as well as after it: neither may render stale text.
    old[0].resolve(['obsolete reading']); await tick();
    assert.equal(h.render(), null); h.commit();
    old[1].resolve(['obsolete gloss']); await tick();
    assert.equal(h.render(), null);
    h.requests[4].resolve(['fresh reading']); h.requests[5].resolve(['fresh gloss']); await tick();
    assert.equal(h.render().supplementByKey.get(0).reading, 'fresh reading');
    if (change === 'uri') assert.equal(h.requests[4].args[4].trackId, 'B', 'capture the requesting URI for the service cache');
  });
}

test('notation and reading-mode changes replace only the incompatible slot; disabling modes removes the stack immediately', async () => {
  const h = harness(); await h.ready();
  h.settings.notation = 'ipa';
  let stack = h.render();
  assert.equal(stack.hasReading, false);
  assert.equal(stack.supplementByKey.get(0).gloss, 'Chinese'); h.commit();
  h.requests[2].resolve(['IPA']); await tick();
  assert.equal(h.render().supplementByKey.get(0).reading, 'IPA');
  h.settings.reading = 'romaji';
  stack = h.render({ settingsRevision: 1 });
  assert.equal(stack.hasReading, false); h.commit();
  h.settings.reading = null; h.settings.gloss = false;
  assert.equal(h.render({ settingsRevision: 2 }), null); h.commit();
  h.requests[4].resolve(['late romaji']); h.requests[5].resolve(['late gloss']); await tick();
  assert.equal(h.render(), null);
});

test('a late result also checks URI, target and notation when no new render has happened yet', async () => {
  for (const field of ['uri', 'target', 'notation']) {
    const h = harness(); h.render(); h.commit();
    const original = h.settings[field];
    h.settings[field] = 'other';
    h.requests[0].resolve(['obsolete']); await tick();
    h.settings[field] = original;
    assert.equal(h.render(), null, `${field}: the stale result must not have been cached in hook state`);
  }
});

test('a successful empty refresh removes obsolete annotations and late cancelled refreshes cannot replace a newer result', async () => {
  const h = harness(); await h.ready();
  h.render({ settingsRevision: 1 }); h.commit();
  h.render({ settingsRevision: 2 }); h.commit();
  h.requests[4].resolve(['newest']); h.requests[5].resolve(['newest gloss']); await tick();
  const newest = h.render();
  h.requests[2].resolve(['old']); h.requests[3].resolve(['old gloss']); await tick();
  assert.equal(h.render(), newest);
  h.render({ settingsRevision: 3 }); h.commit();
  h.requests[6].resolve([]); h.requests[7].resolve([]); await tick();
  assert.equal(h.render(), null);
});
