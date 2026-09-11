import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const utilsSource = readFileSync(new URL('../Utils.js', import.meta.url), 'utf8');
const serviceSource = readFileSync(new URL('../LyricsService.js', import.meta.url), 'utf8');
const editorSource = readFileSync(new URL('../SyncDataCreator.js', import.meta.url), 'utf8');
const method = utilsSource.slice(utilsSource.indexOf('  async requireDiscordAuth('), utilsSource.indexOf('  promptDiscordLoginRequired('));
const declarations = utilsSource.slice(utilsSource.indexOf('const discordAuthOperations'), utilsSource.indexOf('const Utils ='));
function fixture() {
  let token = 'session-a', user = 'user-a', base = 'api-a', now = 0, calls = 0, afterFetch;
  const profile = { authenticated: true, linked: true, account: { id: 'a' } };
  const utils = vm.runInNewContext(`${declarations}\n({${method}})`, { Date: { now: () => now }, Toast: {}, I18n: { t: () => 'login required' } });
  Object.assign(utils, {
    getAuthToken: () => token, getUserHash: () => user, getAccountApiBase: () => base,
    clearAuthToken: () => { token = ''; },
    fetchAccountProfile: async () => { calls++; await afterFetch?.(); return profile; }
  });
  return { utils, profile, get calls() { return calls; }, get token() { return token; },
    change: (values) => { token = values.token ?? token; user = values.user ?? user; base = values.base ?? base; now = values.now ?? now; },
    after: callback => { afterFetch = callback; } };
}

test('one submission verifies once; unrelated operations and direct callers verify again', async () => {
  const f = fixture(), operation = {};
  await f.utils.requireDiscordAuth('', { operation });
  await f.utils.requireDiscordAuth('', { operation });
  assert.equal(f.calls, 1);
  await f.utils.requireDiscordAuth('', { operation: {} });
  await f.utils.requireDiscordAuth();
  await f.utils.requireDiscordAuth();
  assert.equal(f.calls, 4);
});
for (const changed of [{ token: 'session-b' }, { user: 'user-b' }, { base: 'api-b' }, { now: 30_000 }]) {
  test(`submission revalidates when ${JSON.stringify(changed)} changes`, async () => {
    const f = fixture(), operation = {};
    await f.utils.requireDiscordAuth('', { operation });
    f.change(changed);
    await f.utils.requireDiscordAuth('', { operation });
    assert.equal(f.calls, 2);
  });
}
test('logout never reuses an earlier success', async () => {
  const f = fixture(), operation = {};
  await f.utils.requireDiscordAuth('', { operation });
  f.change({ token: '' });
  await assert.rejects(f.utils.requireDiscordAuth('', { operation }), /login required/);
});
test('session change during verification rejects old identity and keeps the new token', async () => {
  const f = fixture(), operation = {};
  f.after(() => f.change({ token: 'session-b' }));
  await assert.rejects(f.utils.requireDiscordAuth('', { operation }), /login required/);
  assert.equal(f.token, 'session-b');
  f.after(null);
  await f.utils.requireDiscordAuth('', { operation });
  assert.equal(f.calls, 2);
});
test('failed verification is retried and cannot clear a newer session', async () => {
  const f = fixture(), operation = {};
  f.after(() => { f.change({ token: 'session-b' }); throw Object.assign(new Error('expired'), { status: 401 }); });
  await assert.rejects(f.utils.requireDiscordAuth('', { operation }), /login required/);
  assert.equal(f.token, 'session-b');
  f.after(null);
  await f.utils.requireDiscordAuth('', { operation });
  assert.equal(f.calls, 2);
});
test('shipping submit service consumes operation separately from the posted metadata', async () => {
  const f = fixture(), operation = {};
  await f.utils.requireDiscordAuth('', { operation });
  const start = serviceSource.indexOf('        async function submitSyncData(');
  const end = serviceSource.indexOf('        /**', start);
  let posted;
  const context = { Utils: f.utils, I18n: { t: () => 'login required' },
    resolveSyncDataIdentity: async () => ({ isrc: 'USABC1234567', trackId: 'track' }),
    getUserHash: () => 'user-a', getSyncDataTrackMetadata: () => ({}), getCurrentSpotifyProfile: async () => null,
    API_BASE: 'https://api.example', SYNC_DATA_REQUEST_VERSION: '20260701', Spicetify: { Config: { version: 'test' } },
    fetch: async (url, init) => { posted = JSON.parse(init.body); return new Response('{"success":true}'); },
    rememberOpenDbSyncDataEntry() {}, clearCache() {}, normalizeIsrc: value => value,
    normalizeSyncDataIsrc: value => value, normalizeTrackIsrc: value => value, Date, console,
  };
  // The transport reply is deliberately rejected after capture: no cache/update side effects are required here.
  context.fetch = async (url, init) => { posted = JSON.parse(init.body); return new Response('{"error":"captured"}', { status: 400 }); };
  const submit = vm.runInNewContext(`${serviceSource.slice(start, end)}\nsubmitSyncData`, context);
  await assert.rejects(submit('track', 'provider', { lines: [] }, { isrc: 'USABC1234567' }, { authOperation: operation }), /captured/);
  assert.equal(f.calls, 1);
  assert.equal('authOperation' in posted, false);
  assert.equal(JSON.stringify(posted).includes('session-a'), false);
  assert.ok(editorSource.includes('submitMetadata, { authOperation })'));
});
