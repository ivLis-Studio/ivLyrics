import assert from 'node:assert/strict';
import test from 'node:test';
import { renderSettingsAboutUpdateSection } from "../src/features/settings/settingsAboutUpdateSection.mjs";
import { createSettingsUpdateButton } from "../src/features/settings/settingsUpdateButton.mjs";
import { createAppUpdateMethods } from "../src/features/updates/appUpdates.mjs";
import { schedulePageUpdateCheck, waitForPageUpdateCheck } from "../src/features/updates/pageUpdateCheck.mjs";
import { setAppUpdateInfo, waitForAppUpdateDialogClose } from "../src/features/updates/updateDialogState.mjs";

function updateService(fetch, getStorage) {
  const timers = new Map();
  const cleared = [];
  const host = Object.assign(new EventTarget(), {
    fetch,
    AbortController,
    CustomEvent,
    setTimeout(callback, delay) {
      assert.equal(delay, 8000);
      const id = Symbol();
      timers.set(id, callback);
      return id;
    },
    clearTimeout(id) {
      cleared.push(id);
      timers.delete(id);
    },
  });
  const methods = createAppUpdateMethods({ host, t: key => key, getStorage });
  return { updates: { ...methods, currentVersion: '7.2.0' }, host, timers, cleared };
}

test('a stalled version response body times out and falls back in mirror order', async () => {
  const urls = [];
  let startBody;
  const readingBody = new Promise(resolve => { startBody = resolve; });
  const { updates, timers, cleared } = updateService(async (url, { signal }) => {
    urls.push(url);
    if (urls.length === 1) {
      return {
        ok: true,
        text: () => new Promise((_, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true });
          startBody();
        }),
      };
    }
    return { ok: true, text: async () => urls.length === 2 ? 'upstream HTML' : '7.2.1\r\n' };
  });

  const pending = updates.checkForUpdates();
  await readingBody;
  assert.equal(timers.size, 1);
  timers.values().next().value();

  assert.deepEqual(await pending, { hasUpdate: true, currentVersion: '7.2.0', latestVersion: '7.2.1' });
  assert.deepEqual(urls.map(url => new URL(url).hostname), ['raw.githubusercontent.com', 'cdn.jsdelivr.net', 'ghfast.top']);
  assert.equal(cleared.length, 3);
  assert.equal(timers.size, 0);
});

test('overlapping version checks share one request and a later check fetches again', async () => {
  let requests = 0;
  const { updates, host } = updateService(async () => {
    requests++;
    const version = requests === 1 ? '7.2.0' : '7.2.1';
    return { ok: true, text: async () => version };
  });
  const first = updates.checkForUpdates();
  assert.equal(updates.checkForUpdates(), first);
  assert.deepEqual(await first, { hasUpdate: false, currentVersion: '7.2.0', latestVersion: '7.2.0' });
  assert.equal(requests, 1);
  assert.equal((await updates.checkForUpdates()).latestVersion, '7.2.1');
  assert.equal(requests, 2);
  assert.equal(host.ivLyrics_updateInfo, undefined);
});

test('failed version checks clear all timers and can be retried', async () => {
  let requests = 0;
  const { updates, timers, cleared } = updateService(async () => {
    if (++requests <= 4) throw new TypeError('Failed to fetch');
    return { ok: true, text: async () => '7.2.1' };
  });
  assert.deepEqual(await updates.checkForUpdates(), {
    hasUpdate: false, currentVersion: '7.2.0', latestVersion: '7.2.0', error: 'utils.networkError',
  });
  assert.equal(timers.size, 0);
  assert.equal(cleared.length, 4);
  assert.equal((await updates.checkForUpdates()).hasUpdate, true);
  assert.equal(requests, 5);
});

test('update notifications change through their own events without refreshing the lyrics page', async () => {
  const storage = new Map();
  const { updates, host } = updateService(async () => ({ ok: true, text: async () => '7.2.1' }), () => ({
    getItem: key => storage.get(key),
    setItem: (key, value) => storage.set(key, value),
  }));
  let pageRenders = 0;
  host.lyricContainer = { forceUpdate: () => { pageRenders++; } };
  const states = [];
  host.addEventListener("ivLyrics:update-dialog-state", event => states.push(event.detail.open));
  await updates.showUpdateNotificationIfAvailable();
  assert.equal(host.ivLyrics_updateInfo.latestVersion, '7.2.1');
  updates.dismissUpdate('7.2.1');
  await updates.showUpdateNotificationIfAvailable();
  assert.deepEqual(states, [true, false]);
  assert.equal(storage.get('ivLyrics:update-dismissed:7.2.1'), 'dismissed');
  assert.equal(pageRenders, 0);
});

test('a confirmed withdrawal clears an open banner and releases the startup dialog queue', async () => {
  let latest = '7.2.1';
  const { updates, host } = updateService(async () => {
    if (latest === null) throw new TypeError('Failed to fetch');
    return { ok: true, text: async () => latest };
  }, () => ({ getItem: () => null }));
  await updates.showUpdateNotificationIfAvailable();
  let closed = false;
  const waitForClose = waitForAppUpdateDialogClose(host).then(() => { closed = true; });
  latest = null;
  assert.ok((await updates.checkForUpdates()).error);
  assert.equal(closed, false);
  assert.equal(host.ivLyrics_updateInfo.latestVersion, '7.2.1');
  latest = '7.2.0';
  assert.equal((await updates.checkForUpdates()).hasUpdate, false);
  assert.equal(host.ivLyrics_updateInfo, null);
  await waitForClose;
  assert.equal(closed, true);
});

test('a manual version check reconciles an open banner with the current release marker', async () => {
  let latest = '7.2.3';
  const { updates, host } = updateService(async () => ({ ok: true, text: async () => latest }), () => ({
    getItem: key => key.endsWith(':7.2.1') ? 'dismissed' : null,
  }));
  await updates.showUpdateNotificationIfAvailable();
  assert.equal(host.ivLyrics_updateInfo.latestVersion, '7.2.3');

  latest = '7.2.2';
  assert.equal((await updates.checkForUpdates()).latestVersion, '7.2.2');
  assert.equal(host.ivLyrics_updateInfo.latestVersion, '7.2.2');
  assert.match(host.ivLyrics_updateInfo.releaseUrl, /\/v7\.2\.2$/);

  const closed = waitForAppUpdateDialogClose(host);
  latest = '7.2.1';
  assert.equal((await updates.checkForUpdates()).hasUpdate, true);
  assert.equal(host.ivLyrics_updateInfo, null);
  await closed;
});

test('an automatic check cannot clear a banner opened during its version lookup', async () => {
  let finishRequest;
  const pendingResponse = new Promise(resolve => { finishRequest = resolve; });
  const { updates, host } = updateService(() => pendingResponse);

  const check = updates.showUpdateNotificationIfAvailable();
  setAppUpdateInfo(host, { available: true, currentVersion: '7.2.0', latestVersion: '7.2.1' });
  finishRequest({ ok: true, text: async () => '7.2.0' });

  assert.equal((await check).hasUpdate, false);
  assert.equal(host.ivLyrics_updateInfo.latestVersion, '7.2.1');
});

test('version checks bypass mirrors whose marker is older than the open update', async () => {
  const urls = [];
  let primaryAvailable = true;
  const { updates, host } = updateService(async url => {
    const hostname = new URL(url).hostname;
    urls.push(hostname);
    if (hostname === 'raw.githubusercontent.com' && !primaryAvailable) throw new TypeError('Failed to fetch');
    const version = hostname === 'cdn.jsdelivr.net' ? '7.2.0' : '7.2.1';
    return { ok: true, text: async () => version };
  }, () => ({ getItem: () => null }));
  await updates.showUpdateNotificationIfAvailable();
  const displayedUpdate = host.ivLyrics_updateInfo;
  primaryAvailable = false;
  urls.length = 0;

  assert.deepEqual(await updates.showUpdateNotificationIfAvailable(), {
    hasUpdate: true, currentVersion: '7.2.0', latestVersion: '7.2.1',
  });
  assert.deepEqual(urls, ['raw.githubusercontent.com', 'cdn.jsdelivr.net', 'ghfast.top']);
  assert.equal(host.ivLyrics_updateInfo, displayedUpdate);
});

test('older mirror markers alone cannot withdraw an open update', async () => {
  let primaryAvailable = true;
  const { updates, host } = updateService(async url => {
    if (new URL(url).hostname === 'raw.githubusercontent.com' && !primaryAvailable) {
      throw new TypeError('Failed to fetch');
    }
    return { ok: true, text: async () => primaryAvailable ? '7.2.1' : '7.2.0' };
  }, () => ({ getItem: () => null }));
  await updates.showUpdateNotificationIfAvailable();
  const displayedUpdate = host.ivLyrics_updateInfo;
  primaryAvailable = false;

  assert.equal((await updates.showUpdateNotificationIfAvailable()).error, 'utils.networkError');
  assert.equal(host.ivLyrics_updateInfo, displayedUpdate);
});

test('an old mirror cannot hide a newer release when the primary marker is unavailable', async () => {
  const urls = [];
  const { updates } = updateService(async url => {
    const hostname = new URL(url).hostname;
    urls.push(hostname);
    if (hostname === 'raw.githubusercontent.com') throw new TypeError('Failed to fetch');
    return { ok: true, text: async () => hostname === 'cdn.jsdelivr.net' ? '7.2.0' : '7.2.1' };
  });

  assert.deepEqual(await updates.checkForUpdates(), {
    hasUpdate: true, currentVersion: '7.2.0', latestVersion: '7.2.1',
  });
  assert.deepEqual(urls, ['raw.githubusercontent.com', 'cdn.jsdelivr.net', 'ghfast.top']);
});

test('a valid mirror still answers the update check when no mirror has a newer release', async () => {
  const { updates } = updateService(async url => {
    const hostname = new URL(url).hostname;
    if (hostname === 'cdn.jsdelivr.net') return { ok: true, text: async () => '7.2.0' };
    if (hostname === 'ghfast.top') return { ok: true, text: async () => '7.1.17' };
    throw new TypeError('Failed to fetch');
  });

  assert.deepEqual(await updates.checkForUpdates(), {
    hasUpdate: false, currentVersion: '7.2.0', latestVersion: '7.2.0',
  });
});

test('dismissing the previously rendered update keeps a newer notification open', async () => {
  let latest = '7.2.1';
  const storage = new Map();
  const { updates, host } = updateService(async () => ({ ok: true, text: async () => latest }), () => ({
    getItem: key => storage.get(key),
    setItem: (key, value) => storage.set(key, value),
  }));
  await updates.showUpdateNotificationIfAvailable();
  latest = '7.2.2';
  await updates.showUpdateNotificationIfAvailable();
  let closed = false;
  const waitForClose = waitForAppUpdateDialogClose(host).then(() => { closed = true; });
  updates.dismissUpdate('7.2.1');
  await Promise.resolve();
  assert.equal(host.ivLyrics_updateInfo?.latestVersion, '7.2.2');
  assert.equal(closed, false);
  assert.equal(storage.get('ivLyrics:update-dismissed:7.2.1'), 'dismissed');
  assert.equal(storage.get('ivLyrics:update-dismissed:7.2.2'), undefined);
  updates.dismissUpdate('7.2.2');
  await waitForClose;
  assert.equal(closed, true);
  assert.equal(host.ivLyrics_updateInfo, null);
});

test('concurrent notifications publish once and a withdrawn release closes over a dismissed version', async () => {
  let latest = '7.2.2';
  const { updates, host } = updateService(async () => ({ ok: true, text: async () => latest }), () => ({
    getItem: key => key.endsWith(':7.2.1') ? 'dismissed' : null,
  }));
  const states = [];
  host.addEventListener('ivLyrics:update-dialog-state', event => states.push(event.detail.open));
  await Promise.all([updates.showUpdateNotificationIfAvailable(), updates.showUpdateNotificationIfAvailable()]);
  assert.deepEqual(states, [true]);
  const close = waitForAppUpdateDialogClose(host);
  latest = '7.2.1';
  assert.equal((await updates.showUpdateNotificationIfAvailable()).hasUpdate, true);
  await close;
  assert.deepEqual(states, [true, false]);
  assert.equal(host.ivLyrics_updateInfo, null);
});

test('a failed dismissal write still closes the dialog for this session', async () => {
  const { updates, host } = updateService(async () => ({ ok: true, text: async () => '7.2.1' }), () => ({
    getItem() { throw new Error('Storage unavailable'); },
    setItem() { throw new Error('Storage unavailable'); },
  }));
  await updates.showUpdateNotificationIfAvailable();
  assert.equal(host.ivLyrics_updateInfo?.latestVersion, '7.2.1');
  const close = waitForAppUpdateDialogClose(host);
  updates.dismissUpdate('7.2.1');
  await close;
  await updates.showUpdateNotificationIfAvailable();
  assert.equal(host.ivLyrics_updateInfo, null);
});

test('route remounts wait for the same startup update check until it settles', async () => {
  const callbacks = [];
  const events = [];
  const host = {
    CustomEvent,
    setTimeout(callback) { callbacks.push(callback); },
    dispatchEvent(event) { events.push(event.type); },
  };
  let rejectCheck;
  let checks = 0;
  const check = () => {
    checks++;
    return new Promise((_, reject) => { rejectCheck = reject; });
  };
  assert.equal(waitForPageUpdateCheck(host), null);
  schedulePageUpdateCheck(host, check);
  const pending = waitForPageUpdateCheck(host);
  schedulePageUpdateCheck(host, check);
  assert.equal(callbacks.length, 1);
  callbacks.shift()();
  await Promise.resolve();
  assert.equal(checks, 1);
  schedulePageUpdateCheck(host, check);
  assert.equal(waitForPageUpdateCheck(host), pending);
  assert.equal(callbacks.length, 0);
  rejectCheck(new Error('offline'));
  await pending;
  assert.equal(waitForPageUpdateCheck(host), null);
  assert.deepEqual(events, ['ivLyrics:update-check-complete']);
  schedulePageUpdateCheck(host, check);
  assert.equal(callbacks.length, 0);
});

test('the About update check retains its pending state and result when the settings window reopens', async () => {
  const lookup = Promise.withResolvers();
  let requests = 0;
  let state, mountEffect;
  const react = {
    Fragment: Symbol('Fragment'),
    createElement: (type, props, ...children) => ({ type, props, children }),
    useState: (initial) => [state ??= initial(), (value) => { state = value; }],
    useLayoutEffect: (effect) => { mountEffect = effect; },
  };
  const ConfigButton = () => null;
  const translate = key => key;
  const SettingsUpdateButton = createSettingsUpdateButton({
    react, ConfigButton, translate,
    checkForUpdates: () => { requests++; return lookup.promise; },
  });
  const view = renderSettingsAboutUpdateSection(react, {
    OptionList: () => null,
    ConfigButton, SettingsUpdateButton, translate,
    getCurrentVersion: () => '6.6.24',
  });
  const setting = view.props.items.find(item => item.key === 'check-update');
  const render = () => setting.type({ settingKey: setting.key, text: setting.text }).children;
  const [button] = render();
  assert.equal(button.type, ConfigButton);
  const unmount = mountEffect();
  const pending = button.props.onChange();
  assert.equal(render()[0].props.disabled, true);
  assert.equal(render()[0].props.text, 'settingsAdvanced.aboutTab.update.checkUpdate.checking');
  unmount();

  state = undefined;
  const [reopenedButton, pendingResult] = render();
  const closeReopened = mountEffect();
  assert.equal(reopenedButton.props.disabled, true);
  assert.equal(pendingResult.props['aria-busy'], true);
  assert.equal(pendingResult.props.id, 'update-result-container');
  await reopenedButton.props.onChange();
  assert.equal(requests, 1);
  lookup.resolve({ hasUpdate: true, currentVersion: '6.6.24', latestVersion: '6.6.25' });
  await pending;

  const [restoredButton, result] = render();
  const walk = node => Array.isArray(node?.children) ? [node, ...node.children.flatMap(walk)] : [node];
  const content = walk(result);
  assert.ok(content.includes('notifications.updateAvailable'));
  assert.ok(content.includes('update.versionChange 6.6.24 → 6.6.25'));
  assert.deepEqual(content.filter(node => node?.type === 'a').map(node => node.props.href), [
    'https://lyrics.ivl.is/update', 'https://github.com/ivLis-Studio/ivLyrics/releases/tag/v6.6.25',
  ]);
  assert.equal(result.props.role, 'status');
  assert.equal(restoredButton.props.disabled, false);
  assert.equal(restoredButton.props.text, setting.text);
  closeReopened();
});
