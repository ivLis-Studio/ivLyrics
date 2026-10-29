import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const { create } = require('../SyncCreatorScoreTracker.js');
const creator = readFileSync(new URL('../SyncDataCreator.js', import.meta.url), 'utf8');
const service = readFileSync(new URL('../LyricsService.js', import.meta.url), 'utf8');
const slice = (source, start, end) => {
  const from = source.indexOf(start), to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, start);
  return source.slice(from, to);
};
const messages = {
  'syncCreator.submitError': 'Could not submit',
  'syncCreator.submitNetworkError': 'Connection failed; edits remain',
  'syncCreator.submitTimeoutError': 'Request timed out; edits remain',
  'syncCreator.submitServerError': 'Server returned HTTP {status}; edits remain',
};
const I18n = { t: (key, values = {}) => String(messages[key] || key).replace('{status}', values.status) };
const messageFor = vm.runInNewContext(slice(creator, 'const getSyncCreatorSubmitErrorMessage =', 'const SYNC_CREATOR_RTL_STRONG_CHAR_REGEX')
  + '\ngetSyncCreatorSubmitErrorMessage', { I18n });
const workMethod = slice(creator, '\t\t\t\trequest: async payload => {', '\n\t\t\t});').trim().slice('request: '.length);
function workHarness(fetchImpl) {
  const deadlines = [], cleared = [];
  const request = vm.runInNewContext(`(${workMethod})`, {
    AbortController, I18n, Utils: { getApiHeaders: headers => headers },
    setTimeout: (callback, delay) => { const timer = { callback, delay }; deadlines.push(timer); return timer; },
    clearTimeout: timer => cleared.push(timer),
    fetch: (url, options) => fetchImpl(url, options, deadlines.at(-1)),
  });
  return { request, deadlines, cleared };
}
function submissionHarness(fetchImpl) {
  const calls = [], cacheWrites = [];
  const submit = vm.runInNewContext(slice(service, '        async function submitSyncData(', '        /**')
    + '\nsubmitSyncData', {
    I18n, Utils: { getAuthToken: () => 'session', requireDiscordAuth: async () => {} },
    resolveSyncDataIdentity: async () => ({ isrc: 'USABC1234567', trackId: 'track' }),
    getUserHash: () => 'user', getSyncDataTrackMetadata: () => ({}), getCurrentSpotifyProfile: async () => null,
    API_BASE: 'https://lyrics.api.ivl.is', SYNC_DATA_REQUEST_VERSION: '20260701',
    Spicetify: { Config: { version: 'test' } },
    fetch: (...args) => { calls.push(args); return fetchImpl(...args); },
    normalizeSyncDataIsrc: value => value,
    rememberOpenDbSyncDataEntry: (...args) => cacheWrites.push(args), clearCache: (...args) => cacheWrites.push(args),
  });
  return { submit: () => submit('track', 'lrclib', { source: { provider: 'lrclib', lrclibId: '123' }, lines: [] }), calls, cacheWrites };
}

test('submission distinguishes connectivity and timeout failures without hiding server or coding errors', () => {
  for (const message of ['Failed to fetch', 'Failed to fetch https://lyrics.api.ivl.is/lyrics/sync-data', 'fetch failed', 'Network request failed', 'Load failed']) {
    assert.equal(messageFor(new TypeError(message)), messages['syncCreator.submitNetworkError']);
  }
  assert.equal(messageFor({ name: 'NetworkError', message: 'Connection lost' }), messages['syncCreator.submitNetworkError']);
  for (const name of ['AbortError', 'TimeoutError']) assert.equal(messageFor({ name }), messages['syncCreator.submitTimeoutError']);
  const upstream = { status: 503, message: 'Failed to fetch the LRCLIB source: upstream timed out.' };
  assert.equal(messageFor(upstream), upstream.message);
  assert.equal(messageFor(new TypeError('Cannot read properties of undefined')), 'Cannot read properties of undefined');
  assert.equal(messageFor(null), messages['syncCreator.submitError']);
});

test('work requests allow 30 seconds and clear their deadline on success and timeout', async () => {
  const success = workHarness(async () => Response.json({ success: true, sessionId: 'work', sequence: 0 }));
  assert.equal((await success.request({ action: 'start' })).success, true);
  assert.equal(success.deadlines[0].delay, 30_000);
  assert.deepEqual(success.cleared, success.deadlines);
  const timeout = workHarness(async (url, options, timer) => {
    timer.callback();
    options.signal.throwIfAborted();
  });
  await assert.rejects(timeout.request({ action: 'start' }), error => {
    assert.equal(messageFor(error), messages['syncCreator.submitTimeoutError']);
    return true;
  });
  assert.deepEqual(timeout.cleared, timeout.deadlines);
});

test('work and final submission preserve upstream errors and show HTTP status for non-JSON failures', async () => {
  for (const response of [
    () => Response.json({ error: 'Failed to fetch LRCLIB; retry after the upstream service recovers.' }, { status: 503 }),
    () => Response.json({ message: 'Account needs attention' }, { status: 403 }),
    () => new Response('<html>Gateway failure</html>', { status: 502 }),
  ]) {
    for (const path of ['work', 'submit']) {
      const harness = path === 'work' ? workHarness(async () => response()) : submissionHarness(async () => response());
      const call = path === 'work' ? () => harness.request({ action: 'start' }) : harness.submit;
      const expectedResponse = response(), expected = await expectedResponse.json().catch(() => null);
      await assert.rejects(call(), error => {
        assert.equal(error.status, expectedResponse.status);
        assert.equal(messageFor(error), expected?.error || expected?.message || I18n.t('syncCreator.submitServerError', { status: expectedResponse.status }));
        return true;
      });
      if (path === 'submit') {
        assert.equal(harness.calls.length, 1, 'mutation POST is never automatically retried');
        assert.deepEqual(harness.cacheWrites, [], 'failed submission never marks a source as published');
      }
    }
  }
});

test('a final submission network failure is sent once and leaves publication caches untouched', async () => {
  const h = submissionHarness(async () => { throw new TypeError('Failed to fetch'); });
  await assert.rejects(h.submit(), error => {
    assert.equal(messageFor(error), messages['syncCreator.submitNetworkError']);
    return true;
  });
  assert.equal(h.calls.length, 1);
  assert.deepEqual(h.cacheWrites, []);
});

test('a work-service outage preserves the queued snapshot and reuses its event after recovery', async () => {
  let unavailable = true, stored;
  const sent = [];
  const transport = workHarness(async (url, options) => {
    const event = JSON.parse(options.body);
    sent.push(event);
    return unavailable
      ? Response.json({ error: 'LRCLIB is temporarily unavailable.' }, { status: 503 })
      : Response.json({ success: true, sessionId: 'work', sequence: event.sequence });
  });
  const snapshot = { source: { provider: 'lrclib', lrclibId: '123' }, lines: [{ start: 0, end: 1, chars: [1, 2] }] };
  const tracker = create({
    accountId: 'user', isrc: 'USABC1234567', initialSyncData: snapshot, setInterval: false,
    storage: { saveScoreWork: async (_, data) => { stored = structuredClone(data); } },
    request: transport.request,
  });
  await assert.rejects(tracker.flush(), error => error.status === 503);
  const failedEvent = sent[0];
  assert.deepEqual(stored.queue[0].syncData, snapshot);
  assert.equal(stored.queue[0].eventId, failedEvent.eventId);
  unavailable = false;
  const receipt = await tracker.submission(snapshot);
  assert.equal(sent.find(event => event.eventId === failedEvent.eventId && event !== failedEvent).sequence, failedEvent.sequence);
  assert.deepEqual(receipt, { workSessionId: 'work', workSequence: 1 });
  assert.deepEqual(stored.queue, []);
  tracker.stop();
});
