import assert from "node:assert/strict";
import test from "node:test";
import { createDiscordAccountSession } from "../src/features/account/discordAccountSession.mjs";
import { createCloudSettingsClient } from "../src/features/account/cloudSettingsClient.mjs";
import { createCreatorProfileClient } from "../src/features/account/creatorProfileClient.mjs";
import { createSettingsStorage } from "../src/core/createSettingsStorage.mjs";
import { createSettingsCloudSyncPanel } from "../src/features/settings/settingsCloudSyncPanel.mjs";

const userA = "100000000000000001";
const userB = "100000000000000002";
const nonce = letter => letter.repeat(64);
const expectedMoved = { code: "account_session_changed" };

function fixture() {
  const values = new Map([["ivLyrics:user-hash", userA], ["ivLyrics:auth-token", "test-session-a"]]);
  const read = key => values.get(key) ?? null;
  const storage = {
    getItem: read,
    setItem: (key, value) => values.set(key, String(value)),
  };
  const requests = [];
  const request = (url, options) => new Promise(resolve => requests.push({ url, options, resolve }));
  const opened = [];
  const announced = [];
  let reloads = 0;
  let time = 1_000_000;
  const host = {
    crypto: globalThis.crypto,
    CustomEvent,
    open: (...args) => opened.push(args),
    dispatchEvent: event => announced.push(event.detail),
  };
  const account = {
    ...createDiscordAccountSession({
      host,
      spicetify: { LocalStorage: { get: read, set: storage.setItem, remove: key => values.delete(key) } },
      readStorage: () => ({ getPersisted: read, setPersisted: storage.setItem }),
      readLocalStorage: () => storage,
      readLyricsService: () => null,
      invalidateSyncCache() {},
      request,
      now: () => time,
      translate: () => "",
    }),
    ...createCloudSettingsClient({ readLocalStorage: () => storage, getCrypto: () => globalThis.crypto, request }),
    ...createCreatorProfileClient({ readLocalStorage: () => storage, request, translate: () => "" }),
    restoreAccountSettings() { reloads++; },
  };
  function changeAccount(id, token) {
    account.setUserHash(id);
    account.setAuthToken(token);
  }
  return {
    account, requests, opened, announced, changeAccount, host,
    get reloads() { return reloads; },
    advance: ms => { time += ms; },
    respond(index, body, status = 200) { requests[index].resolve(Response.json(body, { status })); },
  };
}

test("an earlier login-start response cannot reset the account or replace the current browser tab", async () => {
  const h = fixture();
  const old = h.account.startDiscordLogin();
  const current = h.account.startDiscordLogin();
  const recentNonce = JSON.parse(h.requests[1].options.body).clientNonce;
  h.respond(0, { error: "Discord login is required for a Discord account ID" }, 401);
  assert.equal(await old, null);
  assert.equal(h.account.getPendingDiscordLogin().clientNonce, recentNonce);
  assert.equal(h.account.getUserHash(), userA);
  assert.equal(h.account.getAuthToken(), "test-session-a");
  h.respond(1, { success: true, authorizeUrl: "https://login.example.invalid/next" });
  await current;
  assert.equal(h.opened.length, 1);
  assert.equal(h.opened[0][0], "https://login.example.invalid/next");
});

test("a delayed callback can neither commit an earlier login nor clear the newer callback", async () => {
  const h = fixture();
  h.account.setPendingDiscordLogin(nonce("a"));
  const old = h.account.handleDiscordAuthCallback("test-old");
  h.account.setPendingDiscordLogin(nonce("b"));
  const recent = h.account.handleDiscordAuthCallback("test-new");
  assert.equal(await h.account.handleDiscordAuthCallback("test-new"), false);
  assert.equal(h.requests.length, 2);
  h.respond(0, {
    success: true,
    data: { userHash: userA, authToken: "old-completed-session", clientNonce: nonce("a") },
  });
  assert.equal(await old, false);
  assert.equal(h.account.getPendingDiscordLogin().clientNonce, nonce("b"));
  assert.equal(h.account.getAuthToken(), "test-session-a");
  h.respond(1, {
    success: true,
    data: { userHash: userB, authToken: "new-completed-session", clientNonce: nonce("b") },
  });
  assert.equal(await recent, true);
  assert.equal(h.account.getUserHash(), userB);
  assert.equal(h.account.getAuthToken(), "new-completed-session");
  assert.equal(h.account.getPendingDiscordLogin(), null);
  assert.deepEqual(h.announced, [{ userHash: userB }]);
  assert.equal(h.reloads, 1);
});

test("a different callback token cannot interrupt verification for the pending login", async () => {
  const h = fixture();
  h.account.setPendingDiscordLogin(nonce("b"));
  const current = h.account.handleDiscordAuthCallback("test-current");
  const unrelated = h.account.handleDiscordAuthCallback("test-unrelated");
  h.respond(0, {
    success: true,
    data: { userHash: userB, authToken: "new-completed-session", clientNonce: nonce("b") },
  });
  h.respond(1, { error: "No matching login" }, 404);
  assert.equal(await current, true);
  assert.equal(await unrelated, false);
  assert.equal(h.account.getUserHash(), userB);
  assert.equal(h.account.getAuthToken(), "new-completed-session");
});

test("an expired pending login or a response without a session token cannot link an account", async () => {
  for (const expired of [false, true]) {
    const h = fixture();
    h.account.setPendingDiscordLogin(nonce("a"));
    const callback = h.account.handleDiscordAuthCallback("test-token");
    if (expired) h.advance(10 * 60 * 1000 + 1);
    h.respond(0, {
      success: true,
      data: { userHash: userB, clientNonce: nonce("a"), ...(expired ? { authToken: "test-session-b" } : {}) },
    });
    assert.equal(await callback, false);
    assert.equal(h.account.getUserHash(), userA);
    assert.equal(h.account.getAuthToken(), "test-session-a");
    assert.equal(h.reloads, 0);
  }
});

test("a late profile error or logout cannot clear a newer account", async () => {
  const h = fixture();
  const profile = h.account.fetchAccountProfile();
  const logout = h.account.logoutDiscordSession({ resetIdentity: true });
  h.changeAccount(userB, "test-session-b");
  h.respond(0, { error: "Discord login is required" }, 401);
  await assert.rejects(profile, expectedMoved);
  h.respond(1, { success: true });
  assert.equal(await logout, false);
  assert.equal(h.account.getUserHash(), userB);
  assert.equal(h.account.getAuthToken(), "test-session-b");
  assert.deepEqual(h.announced, []);
  const current = h.account.logoutDiscordSession({ resetIdentity: true });
  h.respond(2, { error: "Already logged out" }, 401);
  assert.equal(await current, true);
  assert.equal(h.account.getAuthToken(), null);
  assert.ok(!h.account.isDiscordUserHash(h.account.getUserHash()));
  assert.equal(h.announced.length, 1);
});

const capability = token => ({ success: true, data: {
  token, apiBaseUrl: "https://cloud.example.invalid/v1", expiresAt: Math.floor(Date.now() / 1000) + 600,
} });
const nextTick = () => new Promise(resolve => setImmediate(resolve));

test("a capability response for a previous account never starts the settings request", async () => {
  const h = fixture();
  const upload = h.account.saveCloudSettings({ "ivLyrics:visual:font-size": "36" }, 2);
  h.changeAccount(userB, "test-session-b");
  h.respond(0, capability("test-old-cloud-token"));
  await assert.rejects(upload, expectedMoved);
  assert.equal(h.requests.length, 1);
});

test("cloud capabilities are shared by scope and an obsolete download is rejected after reading its body", async () => {
  const h = fixture();
  const first = h.account.requestCloudSaveCapability();
  const second = h.account.requestCloudSaveCapability();
  assert.equal(h.requests.length, 1);
  h.respond(0, capability("test-cloud-a"));
  assert.strictEqual(await first, await second);
  const download = h.account.fetchCloudSettings();
  await nextTick();
  assert.equal(h.requests[1].options.headers.Authorization, "Bearer test-cloud-a");
  assert.equal(h.requests[1].options.method, "GET");
  h.changeAccount(userB, "test-session-b");
  h.respond(1, { success: true, data: { revision: 3, settings: {} } });
  await assert.rejects(download, expectedMoved);
  const remove = h.account.deleteCloudSettings();
  assert.equal(h.requests[2].options.headers.Authorization, "Bearer test-session-b");
  assert.deepEqual(JSON.parse(h.requests[2].options.body), { scope: "delete" });
  h.respond(2, capability("test-cloud-b-delete"));
  await nextTick();
  assert.equal(h.requests[3].options.headers.Authorization, "Bearer test-cloud-b-delete");
  assert.equal(h.requests[3].options.method, "DELETE");
  h.respond(3, { success: true, data: { revision: 0 } });
  await remove;
});

test("supporter lookup reads the current role and subsequent calls use the cached result", async () => {
  const h = fixture();
  const lookup = h.account.fetchDiscordSupportTier(userA, { forceRefresh: true });
  assert.equal(h.requests.length, 1);
  h.respond(0, { data: { roles: [{ id: "1530978173590966282" }] } });
  assert.equal(await lookup, "monthly");
  assert.equal(await h.account.fetchDiscordSupportTier(userA), "monthly");
  assert.equal(h.requests.length, 1);
});

test("a queued cloud import rechecks its account before writing settings", async () => {
  const h = fixture();
  const font = "ivLyrics:visual:font-size";
  const values = new Map([[font, "24"]]);
  let release;
  const wait = new Promise(resolve => { release = resolve; });
  const storage = createSettingsStorage({
    localStorage: {
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: key => values.delete(key),
    },
    offsetStore: { importOffsets: async () => { await wait; return true; } },
    debug() {},
  });
  const local = storage.importConfig({ [font]: 29, "ivLyrics:track-sync-offsets": { "spotify:track:one": 20 } });
  const captured = h.account.captureAccountSession();
  const old = storage.importCloudConfig({ [font]: 55 }, () => {
    if (!h.account.isAccountSessionCurrent(captured)) throw new Error("stale cloud import");
  });
  h.changeAccount(userB, "test-session-b");
  release();
  await local;
  await assert.rejects(old, /stale cloud import/);
  assert.equal(values.get(font), "29");
});

function cloudRestoreFixture() {
  const font = "ivLyrics:visual:font-size";
  const values = new Map([[font, "24"]]);
  const entries = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
  const ready = Promise.withResolvers();
  const flushed = Promise.withResolvers();
  const committed = Promise.withResolvers();
  const storage = createSettingsStorage({
    localStorage: entries,
    persistence: { ...entries, ready: ready.promise, flush() { committed.resolve(); return flushed.promise; } },
  });
  const reloads = [], messages = [], slots = [];
  let cursor = 0, effect, onAccountChange, session = userA;
  const Component = createSettingsCloudSyncPanel({
    react: {
      useState(initial) {
        const index = cursor++;
        if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
        return [slots[index], update => {
          slots[index] = typeof update === "function" ? update(slots[index]) : update;
        }];
      },
      useEffect: callback => { effect = callback; },
      createElement: (type, props, ...children) => ({ type, props, children }),
    },
    translate: key => key,
    account: {
      getAuthToken: () => "fixture-token",
      captureAccountSession: () => ({ userHash: session, authToken: "fixture-token" }),
      isAccountSessionCurrent: captured => captured.userHash === session,
      isDiscordUserHash: () => true,
      fetchDiscordSupportTier: async () => "monthly",
      fetchCloudSettings: async () => ({ exists: true, revision: 1, data: { settings: { [font]: 52 } } }),
    },
    confirm: () => true,
    notifyError: message => messages.push(message),
    importConfig: storage.importCloudConfig,
    reloadSettings: options => reloads.push(options),
    listenForAccountChange(callback) { onAccountChange = callback; return () => { onAccountChange = null; }; },
  });
  function render() { cursor = 0; return Component(); }
  const findButton = (node, name) => node && typeof node === "object" &&
    (node.type === "button" && node.children.includes(`settingsAdvanced.cloudSync.${name}`)
      ? node : node.children.map(child => findButton(child, name)).find(Boolean));
  render();
  const cleanup = effect();
  return {
    ready, flushed, committed, reloads, messages,
    get font() { return entries.getItem(font); },
    close: cleanup,
    switchAccount() { session = userB; onAccountChange?.(); },
    press(name) { return findButton(render(), name).props.onClick(); },
  };
}

test("leaving the cloud panel before a queued restore commits cancels the write", async () => {
  for (const leave of ["close", "switchAccount"]) {
    const h = cloudRestoreFixture();
    await h.press("refresh");
    const restore = h.press("download");
    await nextTick();
    h[leave]();
    h.ready.resolve();
    h.flushed.resolve();
    await restore;
    assert.equal(h.font, "24");
    assert.deepEqual(h.reloads, []);
    assert.deepEqual(h.messages, []);
  }
});

test("a committed cloud restore reloads the saved settings after its panel or account is gone", async () => {
  for (const leave of ["close", "switchAccount"]) {
    const h = cloudRestoreFixture();
    await h.press("refresh");
    const restore = h.press("download");
    h.ready.resolve();
    await h.committed.promise;
    assert.equal(h.font, "52");
    h[leave]();
    h.flushed.resolve();
    await restore;
    assert.equal(h.reloads.length, 1);
    assert.equal(h.reloads[0].reopenSettings, false);
    assert.deepEqual(h.messages, []);
  }
});
