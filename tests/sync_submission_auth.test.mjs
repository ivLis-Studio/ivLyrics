import SyncDataCodec from '#ivlyrics/features/sync/SyncDataCodec.mjs';
import { createDiscordAccountSession } from "#ivlyrics/features/account/discordAccountSession.mjs";
import assert from 'node:assert/strict';
import test from 'node:test';
import { createSyncDataSubmission } from '#ivlyrics/lyrics/createSyncDataSubmission.mjs';
import { sendSyncCreatorSubmission } from '#ivlyrics/features/sync/syncCreatorSubmissionTransport.mjs';

function fixture(toast = {}) {
  let token = 'session-a', user = 'user-a', base = 'api-a', now = 0, calls = 0, afterFetch;
  const profile = { authenticated: true, linked: true, account: { id: 'a' } };
  const utils = createDiscordAccountSession({ translate: () => 'login required', toast, now: () => now });
  Object.assign(utils, {
    getAuthToken: () => token, getUserHash: () => user, getAccountApiBase: () => base,
    clearAuthToken: () => { token = ''; },
    fetchAccountProfile: async () => { calls++; await afterFetch?.(); return profile; }
  });
  return { utils, profile, get calls() { return calls; }, get token() { return token; },
    change: (values) => { token = values.token ?? token; user = values.user ?? user; base = values.base ?? base; now = values.now ?? now; },
    after: callback => { afterFetch = callback; } };
}

test('the checking toast is dismissed on successful and rejected verification', async () => {
  const events = [];
  const f = fixture({
    progress: (...args) => events.push(args),
    dismissProgress: () => events.push(['dismiss']),
  });

  await f.utils.requireDiscordAuth('', { checkingMessage: 'Checking' });
  f.change({ token: '' });
  await assert.rejects(f.utils.requireDiscordAuth('', { checkingMessage: 'Checking' }), /login required/);
  assert.deepEqual(events, [['Checking', 0], ['dismiss'], ['Checking', 0], ['dismiss']]);
});

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
  const f = fixture();
  let posted;
  const submit = createSyncDataSubmission({
    getCodec: () => SyncDataCodec,
    getAuthUtils: () => assert.fail('the route and startup must share the same verification context'),
    translate: () => 'login required',
    resolveSyncDataIdentity: async () => ({ isrc: 'USABC1234567', trackId: 'track' }),
    getUserHash: () => 'user-a',
    getSyncDataTrackMetadata: () => ({}),
    getCurrentSpotifyProfile: async () => null,
    apiBase: 'https://api.example',
    requestVersion: '20260701',
    getClientVersion: () => 'test',
    request: async (_url, init) => {
      posted = JSON.parse(init.body);
      return new Response('{"error":"captured"}', { status: 400 });
    },
    rememberOpenDbSyncDataEntry: () => assert.fail('Rejected submission must not update OpenDB'),
    clearCache: () => assert.fail('Rejected submission must not clear the cache'),
  });
  const saveWork = async () => {
    assert.equal(f.calls, 1, 'verify before storing the work snapshot');
    return { workToken: 'work-a' };
  };
  await assert.rejects(sendSyncCreatorSubmission({
    syncData: { lines: [] }, trackId: 'track', provider: 'provider', isrc: 'USABC1234567',
    account: f.utils,
    saveWork, getSyncService: () => ({ submitSyncData: submit }),
    requireAuth: operation => f.utils.requireDiscordAuth('', { operation }),
  }), /captured/);
  assert.equal(f.calls, 1);
  assert.equal('authOperation' in posted, false);
  assert.equal(JSON.stringify(posted).includes('session-a'), false);
});

test('an account change while saving score work cannot submit with the new account', async () => {
  const f = fixture();
  await assert.rejects(sendSyncCreatorSubmission({
    syncData: { lines: [] }, trackId: 'track', provider: 'provider', isrc: 'USABC1234567',
    account: f.utils, translate: () => 'login required',
    requireAuth: operation => f.utils.requireDiscordAuth('', { operation }),
    async saveWork() {
      f.change({ user: 'user-b', token: 'session-b' });
      return { workSessionId: 'old-account-work' };
    },
    getSyncService: () => assert.fail('the old work must not be submitted'),
  }), /login required/);
  assert.equal(f.token, 'session-b');
});

test('a caller without the editor cannot change accounts while the Spotify profile is loading', async () => {
  const f = fixture();
  const submit = createSyncDataSubmission({
    getCodec: () => SyncDataCodec,
    getAuthUtils: () => f.utils,
    translate: () => 'login required',
    resolveSyncDataIdentity: async () => ({ isrc: 'USABC1234567', trackId: 'track' }),
    getSyncDataTrackMetadata: () => ({}),
    getCurrentSpotifyProfile: async () => {
      f.change({ user: 'user-b', token: 'session-b' });
      return null;
    },
    request: () => assert.fail('account change must stop the submission'),
  });
  await assert.rejects(submit('track', 'provider', { lines: [] }), /login required/);
  assert.equal(f.calls, 0);
});
