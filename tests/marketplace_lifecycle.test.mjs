import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { bundleInitializer } from './fixtures/initializer-bundle.mjs';
import { createMarketplaceCatalog } from '../src/features/marketplace/marketplaceCatalog.mjs';

const initializer = bundleInitializer(new URL('../src/features/marketplace/MarketplaceManager.js', import.meta.url));
const runtimeId = 'fixture-provider';
const catalogId = 'owner/fixture/fixture-addon';
const url = 'https://marketplace.example.test/fixture.js';
const catalogInfo = (version = '1') => ({ id: catalogId, name: 'Fixture', type: 'lyrics', downloadUrl: url, version });
const providerCode = (version = '1') => `
/** @addon-type lyrics
 * @id ${runtimeId}
 */
window.LyricsAddonManager.register({ id: '${runtimeId}', version: '${version}' });`;

function fixture(records = new Map()) {
  let abortNext;
  const indexedDB = { open() {
    const open = {};
    const db = { transaction(_name, mode) {
      const transaction = { objectStore: () => ({
        getAll() {
          const request = { result: [...records.values()] };
          queueMicrotask(() => request.onsuccess());
          return request;
        },
        put: entry => write('put', () => records.set(entry.id, structuredClone(entry))),
        delete: id => write('delete', () => records.delete(id)),
      }) };
      function write(action, commit) {
        assert.equal(mode, 'readwrite');
        const request = {};
        queueMicrotask(() => {
          request.onsuccess?.();
          queueMicrotask(() => {
            if (abortNext === action) {
              abortNext = undefined;
              transaction.error = new Error('fixture transaction aborted after request success');
              transaction.onabort?.();
              return;
            }
            commit();
            transaction.oncomplete?.();
          });
        });
        return request;
      }
      return transaction;
    } };
    queueMicrotask(() => open.onsuccess({ target: { result: db } }));
    return open;
  } };
  const addons = new Map(), listeners = new Set(), marked = new Set();
  let order = [];
  const provider = {
    getAddon: id => addons.get(id),
    register(addon) {
      addons.set(addon.id, addon);
      for (const listener of listeners) listener({ id: addon.id });
      return true;
    },
    unregister(id) { marked.delete(id); return addons.delete(id); },
    on(event, listener) {
      assert.equal(event, 'addon:registered');
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    markAsMarketplaceAddon: id => marked.add(id),
    getProviderOrder: () => [...new Set([...order, ...addons.keys()])].filter(id => addons.has(id)),
    setProviderOrder: value => { order = [...value]; },
  };
  const assets = new Set(), blobs = new Map(), requests = [], downloads = [];
  let sequence = 0;
  class FixtureURL extends URL {
    static createObjectURL(blob) { const key = `blob:fixture/${++sequence}`; blobs.set(key, blob); return key; }
    static revokeObjectURL(key) { blobs.delete(key); }
  }
  const document = {
    createElement: tag => {
      const element = {
        tag, dataset: {}, remove: () => assets.delete(element),
        get parentNode() { return assets.has(element) ? document.head : null; },
        get nextSibling() { const ordered = [...assets]; return ordered[ordered.indexOf(element) + 1] || null; },
      };
      return element;
    },
    head: { insertBefore(element, next) {
      const order = [...assets];
      order.splice(order.indexOf(next), 0, element);
      assets.clear();
      for (const item of order) assets.add(item);
    }, appendChild(element) {
      assets.add(element);
      if (element.tag === 'style' || element.started) return;
      element.started = true;
      const blob = blobs.get(element.src);
      void blob.text().then(source => {
        if (!assets.has(element)) return;
        document.currentScript = element;
        try { vm.runInContext(source, context); }
        catch { /* Classic script load can succeed even when execution fails. */ }
        finally { document.currentScript = null; }
        element.onload?.();
      });
    } },
  };
  const window = { Spicetify: { LocalStorage: {} }, document, indexedDB, LyricsAddonManager: provider };
  const context = vm.createContext({ window, URL: FixtureURL, Blob, AbortController,
    setTimeout: (callback, ms) => setTimeout(callback, ms === 1500 ? 35 : ms), clearTimeout,
    console: { error() {} }, fetch: async (target) => {
      requests.push(target);
      const next = downloads.shift();
      assert.ok(next, `unexpected download ${target}`);
      return typeof next === 'function' ? next() : next;
    },
  });
  vm.runInContext(initializer, context);
  return { manager: window.MarketplaceManager, records, provider, addons, assets, marked, requests,
    send: (...responses) => downloads.push(...responses.map(response => typeof response === 'string' ? new Response(response) : response)),
    abort: action => { abortNext = action; },
  };
}

test('a one-time Marketplace listener can emit again and register the next listener', async () => {
  const { manager } = fixture();
  await manager.readyPromise;
  const calls = [];
  manager.once('fixture', value => {
    calls.push(value);
    if (value !== 'first') return;
    manager.once('fixture', next => calls.push(next));
    manager.emit('fixture', 'nested');
  });
  manager.emit('fixture', 'first');
  manager.emit('fixture', 'later');
  assert.deepEqual(calls, ['first', 'nested']);
});

test('a legacy catalog record whose provider ID differs loads and uninstalls across startup', async () => {
  const entry = {
    id: catalogId, code: providerCode().split('*/').at(-1),
    metadata: { type: 'lyrics', name: 'Fixture', version: '1', runtimeId: catalogId }, installedAt: '2026-01-01',
  };
  const records = new Map([[catalogId, entry]]);
  const { manager, addons, assets, marked } = fixture(records);
  await manager.readyPromise;
  assert.equal(manager.getInstalledAddon(catalogId).runtimeId, runtimeId);
  assert.deepEqual([...marked], [runtimeId]);
  assert.equal(await manager.uninstallAddon(catalogId), true);
  assert.equal(addons.has(runtimeId), false);
  assert.equal(assets.size, 0);
  const restarted = fixture(records);
  await restarted.manager.readyPromise;
  assert.equal(restarted.manager.isInstalled(catalogId), false);
  assert.equal(restarted.addons.has(runtimeId), false);
});

test('installation and removal wait for IndexedDB to commit', async () => {
  const h = fixture();
  h.abort('put');
  h.send(providerCode(), providerCode());
  await assert.rejects(h.manager.installAddon(catalogInfo()), /aborted after request success/);
  assert.equal(h.manager.isInstalled(catalogId), false);
  assert.equal(h.addons.has(runtimeId), false);
  assert.equal(h.assets.size, 0);
  assert.equal(h.records.size, 0);
  await h.manager.installAddon(catalogInfo());
  h.abort('delete');
  await assert.rejects(h.manager.uninstallAddon(catalogId), /aborted after request success/);
  assert.equal(h.manager.isInstalled(catalogId), true);
  assert.equal(h.records.get(catalogId).metadata.runtimeId, runtimeId);
  assert.equal(h.addons.get(runtimeId).version, '1');
  await h.manager.uninstallAddon(catalogId);
  assert.equal(h.records.size, 0);
  assert.equal(h.addons.size, 0);
});

test('download, execution and storage errors keep the previous addon; a later update can succeed', async () => {
  const h = fixture();
  h.send(providerCode(), new Response(null, { status: 503 }), '/* No provider registration */', providerCode('2'), providerCode('2'));
  await h.manager.installAddon(catalogInfo());
  const original = h.addons.get(runtimeId);
  const oldRecord = h.records.get(catalogId);
  await assert.rejects(h.manager.updateAddon(catalogInfo('2')), /HTTP 503/);
  assert.strictEqual(h.addons.get(runtimeId), original);
  await assert.rejects(h.manager.updateAddon(catalogInfo('2')), /did not register/);
  assert.strictEqual(h.addons.get(runtimeId), original);
  assert.strictEqual(h.records.get(catalogId), oldRecord);
  h.abort('put');
  await assert.rejects(h.manager.updateAddon(catalogInfo('2')), /aborted after request success/);
  assert.strictEqual(h.addons.get(runtimeId), original);
  assert.strictEqual(h.records.get(catalogId), oldRecord);
  assert.equal(h.assets.size, 1);
  assert.equal(await h.manager.updateAddon(catalogInfo('2')), true);
  assert.equal(h.addons.get(runtimeId).version, '2');
  assert.equal(h.records.get(catalogId).metadata.version, '2');
  assert.equal(h.records.get(catalogId).installedAt, oldRecord.installedAt);
  assert.deepEqual([...h.marked], [runtimeId]);
});

test('a removal queued while an update downloads cannot leave a provider or record behind', async () => {
  const h = fixture();
  let finishDownload, beginDownload;
  const downloading = new Promise(resolve => { beginDownload = resolve; });
  h.send(providerCode(), () => new Promise(resolve => { finishDownload = resolve; beginDownload(); }));
  await h.manager.installAddon(catalogInfo());
  const update = h.manager.updateAddon(catalogInfo('2'));
  await downloading;
  const remove = h.manager.uninstallAddon(catalogId);
  assert.equal(h.addons.get(runtimeId).version, '1');
  finishDownload(new Response(providerCode('2')));
  assert.deepEqual(await Promise.all([update, remove]), [true, true]);
  assert.equal(h.records.size + h.assets.size + h.addons.size, 0);
});

test('duplicate direct downloads share the operation boundary and a load without registration stays uninstalled', async () => {
  const h = fixture();
  h.send(providerCode());
  const results = await Promise.allSettled([h.manager.installAddonFromUrl(url), h.manager.installAddonFromUrl(url + '#fragment')]);
  assert.equal(results[0].value.runtimeId, runtimeId);
  assert.equal(results[1].reason.code, 'ALREADY_INSTALLED');
  assert.equal(h.requests.length, 1);
  await h.manager.uninstallAddon(results[0].value.id);
  h.send('/* @addon-type lyrics\n * @id unregistered-fixture\n */');
  await assert.rejects(h.manager.installAddonFromUrl(url), { code: 'REGISTRATION_FAILED' });
  assert.equal(h.records.size + h.assets.size + h.addons.size, 0);
});

test('style updates preserve cascade order during storage failure and after a retry', async () => {
  const h = fixture();
  const info = { ...catalogInfo(), type: 'style', downloadUrl: 'https://marketplace.example.test/fixture.css' };
  h.send('.fixture { color: red; }', '.fixture { color: green; }', '.fixture { color: blue; }', '.fixture { color: blue; }');
  await h.manager.installAddon(info);
  await h.manager.installAddon({ ...info, id: 'z-another-style' });
  const [installed, nextStyle] = h.assets;
  assert.equal(installed.tag, 'style');
  h.abort('put');
  await assert.rejects(h.manager.updateAddon({ ...info, version: '2' }), /aborted/);
  assert.deepEqual([...h.assets], [installed, nextStyle]);
  assert.equal(installed.textContent, '.fixture { color: red; }');
  assert.equal(h.records.get(catalogId).metadata.version, '1');
  assert.equal(await h.manager.updateAddon({ ...info, version: '2' }), true);
  assert.deepEqual([...h.assets].map(element => element.textContent), [
    '.fixture { color: blue; }', '.fixture { color: green; }',
  ]);
  assert.equal(h.records.get(catalogId).metadata.version, '2');
});

test('styles retain their installation cascade when IndexedDB returns records in key order', async () => {
  const style = (id, installedAt) => ({ id, installedAt, code: `.fixture { --${id}: 1; }`, metadata: { type: 'style' } });
  const early = style('z-earlier', '2026-01-01T00:00:00.000Z');
  const late = style('a-later', '2026-01-01T00:00:00.001Z');
  const h = fixture(new Map([[late.id, late], [early.id, early]]));
  await h.manager.readyPromise;
  assert.deepEqual([...h.assets].map(element => element.dataset.marketplaceAddon), [early.id, late.id]);
});

test('catalog callers share discovery and read fresh installation state without refetching manifests', async () => {
  const h = fixture();
  const repo = { owner: { login: 'Owner' }, name: 'Fixture', stargazers_count: 1 };
  const name = 'Fixture Addon';
  const responses = [Response.json({}), Response.json({ items: [repo] }), Response.json({ addons: [{
    name, type: 'lyrics', version: '2', downloadUrl: url,
  }] })];
  h.send(...responses);
  const [initial, overlapping] = await Promise.all([h.manager.fetchAddonList(), h.manager.fetchAddonList(true)]);
  const [discovered] = initial.addons;
  assert.equal(discovered.id, catalogId);
  assert.equal(discovered.isInstalled, false);
  assert.equal(overlapping.addons[0].isInstalled, false);
  assert.equal(h.requests.length, 3);

  h.send(providerCode(), providerCode('2'));
  await h.manager.installAddon(catalogInfo());
  const [installed] = (await h.manager.fetchAddonList()).addons;
  assert.equal(installed.isInstalled, true);
  assert.equal(installed.installedVersion, '1');
  assert.equal(installed.hasUpdate, true);
  await h.manager.updateAddon(discovered);
  assert.equal((await h.manager.fetchAddonList()).addons[0].hasUpdate, false);
  await h.manager.uninstallAddon(catalogId);
  assert.equal((await h.manager.fetchAddonList()).addons[0].isInstalled, false);
  assert.deepEqual(h.requests.slice(3), [url, url]);
});

test('a stalled denylist response body times out and the catalog uses the bundled rules', async () => {
  const requests = [];
  const catalog = createMarketplaceCatalog({
    requestTimeout: 30, installedAddons: new Map(), debug() {},
    async request(target, { signal }) {
      requests.push(target);
      if (target.endsWith('blacklist.json')) {
        return { ok: true, json: () => new Promise((_, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        }) };
      }
      assert.match(target, /search\/repositories/);
      return Response.json({ items: [{ owner: { login: 'example-user' }, name: 'example-ivlyrics-addon' }] });
    },
  });
  assert.deepEqual((await catalog.fetchAddonList()).addons, []);
  assert.equal(requests.length, 2);
});

test('a legacy failed load remains visible and removable without unregistering other providers', async () => {
  const records = new Map([[catalogId, {
    id: catalogId,
    code: providerCode(),
    metadata: { type: 'lyrics', name: 'Fixture', runtimeId, version: '1' },
  }]]);
  const h = fixture(records);
  const builtIn = { id: runtimeId, version: 'built-in' };
  h.provider.register(builtIn);
  await h.manager.readyPromise;
  assert.equal(h.manager.getInstalledAddon(catalogId).loadStatus, 'failed');
  assert.equal(h.assets.size, 0);
  await h.manager.uninstallAddon(catalogId);
  assert.equal(h.records.size, 0);
  assert.strictEqual(h.provider.getAddon(runtimeId), builtIn);
});
