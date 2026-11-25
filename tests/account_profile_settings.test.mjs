import assert from "node:assert/strict";
import test from "node:test";
import { setImmediate as nextTurn } from "node:timers/promises";
import { createAccountProfileSettingsActions } from "#ivlyrics/features/settings/accountProfileSettingsActions.mjs";

function fixture() {
  let session = { userHash: "account-one" };
  const reads = [], writes = [], effects = [];
  const operation = (requests, field, args) => {
    const { promise, resolve, reject } = Promise.withResolvers();
    requests.push({ field, args, resolve, reject });
    return promise;
  };
  const getActions = createAccountProfileSettingsActions({
    accountApi: {
      captureAccountSession: () => session,
      isAccountSessionCurrent: candidate => candidate === session,
      fetchAccountProfile: () => operation(reads, "profile", [session.userHash]),
      fetchSyncCreatorPrivacy: () => operation(reads, "privacy", [session.userHash]),
      saveOwnNickname: (...args) => operation(writes, "nickname", args),
      setSyncCreatorPrivacy: (...args) => operation(writes, "privacy", args),
    },
    clearSyncCache: () => effects.push("clear"),
    publishPrivacyChange: detail => effects.push(detail),
  });
  return {
    getActions, reads, writes, effects,
    switchAccount(userHash) { session = { userHash }; },
  };
}

test("two clicks share one nickname save and refresh reads the canonical nickname after the commit", async () => {
  const h = fixture();
  const actions = h.getActions();
  const save = actions.saveNickname("New nickname");
  assert.equal(actions.saveNickname("Duplicate"), null);
  const replacement = h.getActions();
  assert.equal(replacement, actions);
  const profile = replacement.readProfile();
  await Promise.resolve();
  assert.equal(h.reads.length, 0);
  assert.deepEqual(h.writes.map(request => request.args), [["account-one", "New nickname"]]);
  h.writes[0].resolve({ ok: true, data: { success: true, nickname: "Canonical nickname" } });
  assert.equal((await save).data.nickname, "Canonical nickname");
  await Promise.resolve();
  h.reads[0].resolve({ nickname: "Canonical nickname" });
  assert.deepEqual(await profile, { nickname: "Canonical nickname" });
  assert.deepEqual(h.effects, ["clear"]);
});

test("a privacy read started before a settings change retries after the write commits", async () => {
  const h = fixture();
  const actions = h.getActions();
  const read = actions.readPrivacy();
  const save = actions.savePrivacy(true);
  assert.equal(actions.savePrivacy(true), null);
  await Promise.resolve();
  h.reads[0].resolve({ profilePublic: true });
  h.writes[0].resolve({ profilePublic: false });
  assert.deepEqual(await save, { isPrivate: true });
  await nextTurn();
  h.reads[1].resolve({ profilePublic: false });
  assert.deepEqual(await read, { profilePublic: false });
  assert.deepEqual(h.effects, ["clear", { isPrivate: true, profilePublic: false }]);
});

test("switching sessions does not wait for or publish the previous account's privacy write", async () => {
  const h = fixture();
  const previous = h.getActions();
  const pending = previous.savePrivacy(true);
  await Promise.resolve();
  h.switchAccount("account-two");
  const current = h.getActions();
  assert.equal(previous.isCurrent(), false);
  assert.equal(previous.savePrivacy(false), null);
  const read = current.readPrivacy();
  assert.deepEqual(h.reads[0].args, ["account-two"]);
  h.reads[0].resolve({ profilePublic: true });
  h.writes[0].resolve({ profilePublic: false });
  assert.deepEqual(await read, { profilePublic: true });
  assert.equal(await pending, null);
  assert.deepEqual(h.effects, []);
});

test("failed profile changes release the write slot and do not publish cache invalidation", async () => {
  const h = fixture();
  const actions = h.getActions();
  const failed = actions.savePrivacy(true);
  const profile = actions.readPrivacy();
  await Promise.resolve();
  h.writes[0].reject(new Error("Unavailable"));
  await assert.rejects(failed, /Unavailable/);
  h.reads[0].resolve({ isPrivate: false });
  assert.deepEqual(await profile, { isPrivate: false });
  assert.deepEqual(h.effects, []);
  const retry = actions.savePrivacy(true);
  await Promise.resolve();
  h.writes[1].resolve({ isPrivate: true });
  assert.deepEqual(await retry, { isPrivate: true });
});
