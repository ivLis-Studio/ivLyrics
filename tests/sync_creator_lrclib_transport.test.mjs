import { setUpSyncCreatorLrclibActions } from "./fixtures/sync-creator-lrclib.mjs";
import assert from 'node:assert/strict';
import test from 'node:test';

const candidate = { id: 18694795, syncedLyrics: '[00:01.00]Fixture', candidateKey: 'fixture' };

function harness(transport, lyricsManager) {
  const calls = [], messages = [];
  let requestId = 0;
  const window = { IvLyricsLrclibTransport: transport, LyricsAddonManager: lyricsManager };
  const context = {
    window,
    useCallback: callback => callback,
    I18n: { t: key => key },
    console: { error() {} },
    Toast: { error: value => messages.push(value), success: value => messages.push(value) },
    trackId: 'fixture', trackUri: 'spotify:track:fixture', trackName: 'Fixture', artistName: 'Fixture Artist',
    lrclibIdInput: '18694795', lrclibSearchQuery: 'Fixture & café', SYNC_CREATOR_SOURCE_ADDON_ID: 'lrclib',
    lrclibIdInputEditedRef: { current: true },
    selectedLrclibSourceRef: { current: null }, lyrics: null, syncCreatorDraftStore: null,
    beginSyncCreatorSourceChange: () => ++requestId,
    isCurrentSyncCreatorSourceChange: id => id === requestId,
    resetSyncCreatorLyricsLoadingState() {}, clearLrclibCandidateState() {},
    applyLoadedLyricsResult: async (...args) => { calls.push(['applyLoadedLyricsResult', ...args]); return true; },
  };
  const setUpActions = () => setUpSyncCreatorLrclibActions(context, (name, value) => calls.push([name, value]));
  const api = setUpActions();
  return { context, calls, messages, api, setUpActions, stale: () => { requestId++; } };
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((success, fail) => { resolve = success; reject = fail; });
  return { promise, resolve, reject };
}

test('editor ID loading and manual search both use the shared transport with a bounded timeout', async () => {
  const requests = [];
  const h = harness({ fetch: async (...args) => {
    requests.push(args);
    return Response.json(args[0].includes('/search?') ? [candidate] : candidate);
  } });
  await h.api.loadLrclibById();
  assert.equal(requests[0][0], 'https://lrclib.net/api/get/18694795');
  assert.equal(requests[0][2], 35000);
  assert.equal(h.calls.filter(([name]) => name === 'applyLoadedLyricsResult').length, 1);
  assert.ok(h.calls.some(([name, value]) => name === 'setIsLoadingLrclibId' && value === false));
  await h.api.searchLrclibByQuery();
  assert.equal(requests[1][0], 'https://lrclib.net/api/search?q=Fixture+%26+caf%C3%A9');
  assert.equal(requests[1][2], 35000);
  assert.ok(h.calls.some(([name, value]) => name === 'setLrclibSearchMeta' && value.success && value.totalResults === 1));
  assert.ok(h.calls.some(([name, value]) => name === 'setIsSearchingLrclib' && value === false));
});

test('a click event is never treated as an LRCLIB id', async () => {
  const requests = [];
  const h = harness({ fetch: async (...args) => {
    requests.push(args);
    return Response.json(candidate);
  } });
  // The "Load by ID" button wires the handler straight to onClick, so React
  // hands it the click event. That event must never become the requested id.
  await h.api.loadLrclibById({ type: 'click', target: {}, preventDefault() {} });
  assert.equal(h.calls.some(([name, value]) => name === 'setLrclibIdInput' && value === '[object Object]'), false);
  assert.equal(requests.length, 1);
  assert.equal(requests[0][0], 'https://lrclib.net/api/get/18694795');
  assert.equal(h.calls.filter(([name]) => name === 'applyLoadedLyricsResult').length, 1);
  assert.equal(h.context.lrclibIdInputEditedRef.current, false, 'a loaded typed id may be mirrored again');
});

test('missing transport, failed network, HTTP errors and invalid JSON stop editor loading cleanly', async () => {
  for (const transport of [
    undefined, { fetch: async () => null },
    { fetch: async () => new Response('Unavailable', { status: 503 }) },
    { fetch: async () => new Response('not json') },
  ]) {
    const h = harness(transport);
    await h.api.loadLrclibById();
    assert.equal(h.calls.some(([name]) => name === 'applyLoadedLyricsResult'), false);
    assert.ok(h.calls.some(([name, value]) => name === 'setIsLoadingLrclibId' && value === false));
    assert.ok(h.messages.length > 0);
    await h.api.searchLrclibByQuery();
    assert.ok(h.calls.some(([name, value]) => name === 'setLrclibSearchMeta' && value.success === false));
    assert.ok(h.calls.some(([name, value]) => name === 'setIsSearchingLrclib' && value === false));
  }
});

test('late ID responses cannot replace lyrics after the editor source changes', async () => {
  let resolve;
  const pending = new Promise(done => { resolve = done; });
  const h = harness({ fetch: () => pending });
  const loading = h.api.loadLrclibById();
  h.stale(); resolve(Response.json(candidate));
  await loading;
  assert.equal(h.calls.some(([name]) => name === 'applyLoadedLyricsResult'), false);
  assert.equal(h.calls.some(([name]) => name === 'setAddonId'), false);
});

test('a direct ID load owns the editor after an earlier ranked search finishes late', async () => {
  let resolveSearch;
  const search = new Promise(done => { resolveSearch = done; });
  const h = harness(
    { fetch: async () => Response.json(candidate) },
    { getAddon: () => ({ searchCandidates: () => search }) },
  );
  const automatic = h.api.loadLyrics();
  await h.api.loadLrclibById();
  const callsAfterId = h.calls.slice();
  resolveSearch({
    success: true,
    selectedCandidateKey: 'earlier',
    candidates: [{ id: 123, candidateKey: 'earlier', preferredLyricsSource: 'plain', plainLyrics: 'Earlier' }],
  });
  await automatic;
  assert.deepEqual(h.calls, callsAfterId);
  const applied = h.calls.filter(([name]) => name === 'applyLoadedLyricsResult');
  assert.equal(applied.length, 1);
  assert.equal(applied[0][1].lrclibSource.lrclibId, '18694795');
  assert.equal(applied[0][1].synced[0].text, 'Fixture');
});

test('a newer manual search aborts and replaces the previous search without clearing its pending flag', async () => {
  const requests = [];
  const h = harness({ fetch: (url, options) => {
    const request = deferred();
    requests.push({ url, signal: options.signal, ...request });
    return request.promise;
  } });
  const old = h.api.searchLrclibByQuery();
  h.context.lrclibSearchQuery = 'Newest request';
  const recent = h.setUpActions().searchLrclibByQuery();
  assert.equal(requests[0].signal.aborted, true);
  assert.equal(requests[1].signal.aborted, false);
  requests[0].reject(new Error('old network error'));
  await old;
  assert.deepEqual(h.calls.filter(([name]) => name === 'setIsSearchingLrclib').map(([, value]) => value), [true, true]);
  requests[1].resolve(Response.json([candidate]));
  await recent;
  assert.deepEqual(h.calls.filter(([name]) => name === 'setLrclibSearchMeta').map(([, value]) => value.manualQuery), ['Newest request']);
  assert.deepEqual(h.calls.filter(([name]) => name === 'setIsSearchingLrclib').map(([, value]) => value), [true, true, false]);
});

test('loading an ID invalidates older manual candidates, uses one published read and preserves newer typed input', async () => {
  const search = deferred();
  const record = deferred();
  let signal, publishedRequests = 0;
  const h = harness({ fetch: (url, options) => {
    if (!url.includes('/search?')) return record.promise;
    signal = options.signal;
    return search.promise;
  } });
  h.context.window.SyncDataService = { getSyncData: async () => {
    publishedRequests++;
    return null;
  } };
  const searching = h.api.searchLrclibByQuery();
  const loading = h.api.loadLrclibById();
  assert.equal(signal.aborted, true);
  h.context.lrclibIdInputRevisionRef.current++;
  h.context.lrclibIdInput = '9999';
  record.resolve(Response.json(candidate));
  await loading;
  assert.equal(publishedRequests, 1);
  assert.equal(h.calls.some(([name]) => name === 'setLrclibIdInput'), false);
  assert.equal(h.context.lrclibIdInputEditedRef.current, true);
  const applied = h.calls.find(([name]) => name === 'applyLoadedLyricsResult');
  assert.deepEqual(applied[4], { publishedSync: null }, 'the same published snapshot is passed on to the editor');
  const before = h.calls.slice();
  search.resolve(Response.json([{ ...candidate, id: 444 }]));
  await searching;
  assert.deepEqual(h.calls, before);
});

test('a newer manual search keeps its candidates after an older automatic source becomes ready', async () => {
  const automatic = deferred();
  const h = harness(
    { fetch: async () => Response.json([candidate]) },
    { getAddon: () => ({ searchCandidates: () => automatic.promise }) },
  );
  const loading = h.api.loadLyrics();
  await h.api.searchLrclibByQuery();
  automatic.resolve({
    success: true, selectedCandidateKey: candidate.candidateKey,
    candidates: [{ ...candidate, preferredLyricsSource: 'synced' }],
  });
  await loading;
  assert.deepEqual(h.calls.filter(([name]) => name === 'setLrclibSearchMeta').map(([, value]) => value.searchMode), ['manual']);
  assert.equal(h.calls.filter(([name]) => name === 'applyLoadedLyricsResult').length, 1);
});

test('closing aborts the search without a late state update or toast', async () => {
  const result = deferred();
  let signal;
  const h = harness({ fetch: (_url, options) => { signal = options.signal; return result.promise; } });
  const search = h.api.searchLrclibByQuery();
  const before = h.calls.slice();
  h.context.searchRequests.dispose();
  assert.equal(signal.aborted, true);
  result.resolve(Response.json([candidate]));
  await search;
  assert.deepEqual(h.calls, before);
  assert.deepEqual(h.messages, []);
});
