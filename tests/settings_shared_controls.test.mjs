import { createSettingsServices } from "#ivlyrics/spicetify/settingsServices.mjs";
import { createSettingsHelperToggles } from "#ivlyrics/features/settings/settingsHelperToggles.mjs";
import { createSettingsProviderListView } from "#ivlyrics/features/settings/settingsProviderListView.mjs";
import { createSettingsLyricsProviderTab } from "#ivlyrics/features/settings/settingsLyricsProviderTab.mjs";
import { createSettingsAiProviderTab } from "#ivlyrics/features/settings/settingsAiProviderTab.mjs";
import { createSettingsEventChannel, createVisualSettingsActions } from "#ivlyrics/core/visualSettingsActions.mjs";
import { createSettingsSaveEffects } from "#ivlyrics/features/settings/settingsSaveEffects.mjs";
import { readSettingsFixture } from "./fixtures/legacy-page-source.mjs";
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import vm from 'node:vm';

const current = readSettingsFixture();
// Optional historical comparison; normal runs do not require Git history.
const revision = process.env.IVLYRICS_REFACTOR_TEST_REVISION;
const baseline = revision ? execFileSync('git', ['show', `${revision}:Settings.js`], {
  cwd: fileURLToPath(new URL('..', import.meta.url)), encoding: 'utf8',
}) : null;
const sources = [baseline, current].filter(Boolean);
const section = (source, start, end) => {
  const from = source.indexOf(start), until = source.indexOf(end, from);
  assert.ok(from >= 0 && until > from, `Missing source section: ${start}`);
  return source.slice(from, until);
};
const normalize = value => {
  if (typeof value === 'function') return '[function]';
  if (Array.isArray(value)) return Array.from(value, normalize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key, key === 'type' && typeof item === 'function' ? item.name : normalize(item),
  ]));
  return value;
};
const elements = value => Array.isArray(value) ? value.flatMap(elements)
  : value && typeof value === 'object' && 'type' in value ? [value, ...elements(value.props.children)] : [];
const named = name => ({ [name]: function () {} })[name];

function createHarness(source, component, options = {}) {
  const slots = [], effects = [], calls = [], intervals = new Map(), timeouts = new Map(), listeners = new Map(), pendingHealth = [];
  let cursor = 0, intervalId = 0, language = 'ko';
  const useState = initial => {
    const index = cursor++;
    if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
    return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
  };
  const useEffect = (effect, deps) => {
    const index = cursor++, previous = slots[index];
    if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) {
      slots[index] = { deps, cleanup: previous?.cleanup };
      effects.push(() => { slots[index].cleanup?.(); slots[index].cleanup = effect(); });
    }
  };
  const react = { useState, useEffect, createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) };
  const makeManager = label => {
    let providers = options.providers || [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }];
    let order = ['b', 'missing', 'a'];
    const enabled = new Map([['b', false]]);
    const events = new Map();
    const emit = type => { for (const listener of events.get(type) || []) listener(); };
    return {
      getAddons: () => providers,
      getProviderOrder: () => order,
      isProviderEnabled: id => enabled.get(id) !== false,
      setProviderOrder(next) { order = Array.from(next); calls.push([label, 'order', order]); emit('provider:order:changed'); },
      setProviderEnabled(id, value) { enabled.set(id, value); calls.push([label, 'enabled', id, value]); emit('provider:enabled:changed'); },
      register(provider) { providers = [...providers, provider]; emit('addon:registered'); },
      unregister(id) { providers = providers.filter(provider => provider.id !== id); emit('addon:unregistered'); },
      on(type, listener) {
        if (!events.has(type)) events.set(type, new Set());
        events.get(type).add(listener);
        calls.push([label, 'subscribe', type]);
        return () => { events.get(type).delete(listener); calls.push([label, 'unsubscribe', type]); };
      },
    };
  };
  const health = label => { calls.push([label, 'health']); return new Promise(resolve => pendingHealth.push(resolve)); };
  const window = {
    LyricsAddonManager: makeManager('lyrics'), AIAddonManager: makeManager('ai'),
    lyricsHelperSender: { checkConnection: () => health('lyrics-helper'), enabled: false },
    dispatchEvent: event => calls.push(['event', event.type, normalize(event.detail)]),
    addEventListener: (name, callback) => listeners.set(name, callback),
    removeEventListener: (name, callback) => { if (listeners.get(name) === callback) listeners.delete(name); },
    open: (...args) => calls.push(['open', ...args]),
  };
  if (options.managerReady === false) {
    delete window.LyricsAddonManager;
    delete window.AIAddonManager;
  }
  const context = vm.createContext({
    react, useState, useEffect, window,
    readSettingsService: (name) => window[name],
    I18n: { t: key => options.emptyTranslations ? '' : `${language}:${key}` },
    CONFIG: { visual: {} },
    StorageManager: {
      saveConfig: (...args) => {
        if (options.denySave) throw new Error("storage unavailable");
        calls.push(['save', ...args]);
      },
    },
    Spicetify: { SVGIcons: { check: '<path />' } },
    VideoHelperService: { checkHealth: () => health('video-helper'), openDownloadPage: () => calls.push(['video-download']) },
    document: { querySelector: () => ({}) },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    setInterval: callback => { intervals.set(++intervalId, callback); return intervalId; },
    clearInterval: id => intervals.delete(id),
    setTimeout: (callback, delay) => { timeouts.set(++intervalId, { callback, delay }); return intervalId; },
    clearTimeout: id => timeouts.delete(id),
    OptionList: named('OptionList'), ConfigSlider: named('ConfigSlider'), ConfigSliderRange: named('ConfigSliderRange'),
    ConfigFontWeightSlider: named('ConfigFontWeightSlider'), ConfigFontSelector: named('ConfigFontSelector'),
    LyricsProviderCard: named('LyricsProviderCard'), AddonSettingsCard: named('AddonSettingsCard'),
    createTextOutlineSettingItems: () => [],
  });
  const services = createSettingsServices(window);
  const providerTab = component === 'LyricsProvidersTab' || component === 'AIProvidersTab';
  if (providerTab && source === current) {
    const translate = key => context.I18n.t(key);
    const listView = createSettingsProviderListView({ react, translate });
    const tabOptions = {
      react, translate, listView, OptionList: context.OptionList,
      schedule: context.setTimeout, cancel: context.clearTimeout,
    };
    context.component = component === 'LyricsProvidersTab'
      ? createSettingsLyricsProviderTab({
        ...tabOptions,
        readManager: services.readLyricsSettingsManager,
        getVisualSettings: () => context.CONFIG.visual,
        saveSetting: context.StorageManager.saveConfig,
        notifyConfigChange: (name, value) => window.dispatchEvent(new context.CustomEvent("ivLyrics", {
          detail: { type: "config", name, value },
        })),
        LyricsProviderCard: context.LyricsProviderCard,
        ConfigSlider: context.ConfigSlider,
      })
      : createSettingsAiProviderTab({
        ...tabOptions,
        readManager: services.readAiSettingsManager,
        requestFrame: (callback) => window.requestAnimationFrame?.(callback),
        findConnectionCard: (id) => context.document.getElementById?.(`ivlyrics-ai-connection-${id}`),
        AddonSettingsCard: context.AddonSettingsCard,
        ConfigSliderRange: context.ConfigSliderRange,
      });
  } else if (providerTab) {
    const providerStart = source.includes('const createSettingsProviderOrderControls =')
      ? 'const createSettingsProviderOrderControls =' : 'const LyricsProvidersTab =';
    vm.runInContext([
      section(source, 'function buildOrderedProviderList(', 'const SETTINGS_OUTLINE_ICONS ='),
      section(source, providerStart, source.includes('const readSettingsService =')
        ? 'const readSettingsService =' : 'const getSafeSettingsLocale ='),
      `globalThis.component = ${component};`,
    ].join('\n'), context);
  } else if (source === current) {
    const channel = createSettingsEventChannel(window, (type, detail) => new context.CustomEvent(type, { detail }));
    const visualSettingsActions = createVisualSettingsActions({
      getVisualSettings: () => context.CONFIG.visual,
      persistConfig: context.StorageManager.saveConfig,
      updateLyrics() {},
      publishConfigChange: channel.publishSettingsConfigChange,
    });
    const { saveLyricsHelperSetting } = createSettingsSaveEffects({
      visualSettingsActions, publishConfigChange: channel.publishSettingsConfigChange,
    });
    context.changeHelperSetting = component === 'LyricsHelperToggle'
      ? saveLyricsHelperSetting : visualSettingsActions.handleVisualConfigChange;
    context.component = createSettingsHelperToggles({
      react, translate: key => context.I18n.t(key),
      getCheckIcon: () => context.Spicetify.SVGIcons.check,
      getVideoHelper: () => context.VideoHelperService,
      getLyricsHelper: services.getSettingsLyricsHelper,
      isSettingsOpen: () => true,
      openDownload: () => window.open("https://ivlis.kr/ivLyrics/extensions/#helper", "_blank"),
      onSaveError: () => calls.push(['save-error']),
      listenForLyricsHelperConnection: (listener) => {
        window.addEventListener("ivLyrics:lyrics-helper-connection", listener);
        return () => window.removeEventListener("ivLyrics:lyrics-helper-connection", listener);
      },
      scheduleCheck: context.setInterval,
      cancelCheck: context.clearInterval,
    })[component];
  } else {
    const helperStart = source.includes('const renderSettingsHelperToggle =')
      ? 'const renderSettingsHelperToggle =' : 'const VideoHelperToggle =';
    const helperEnd = source.includes('\nconst ConfigSelection =')
      ? 'const ConfigSelection =' : 'const SettingsInterludeIndicator =';
    vm.runInContext(`${section(source, helperStart, helperEnd)}
      globalThis.component = ${component};`, context);
  }
  return {
    calls, window, context, intervals, timeouts, listeners, pendingHealth,
    makeManager,
    language: value => { language = value; },
    render(props = {}) { cursor = 0; return context.component(props); },
    flushEffects() { effects.splice(0).forEach(effect => effect()); },
    tick() { [...intervals.values()].forEach(callback => callback()); },
    tickTimeouts() {
      const pending = [...timeouts.values()];
      timeouts.clear();
      pending.forEach(({ callback }) => callback());
    },
    async healthResult(value) { pendingHealth.splice(0).forEach(resolve => resolve(value)); await Promise.resolve(); },
    unmount() { slots.forEach(slot => slot?.cleanup?.()); },
  };
}

const event = (clientY = 0, data = '') => ({
  clientY, prevented: 0, preventDefault() { this.prevented++; },
  currentTarget: { getBoundingClientRect: () => ({ top: 0, height: 100 }) },
  dataTransfer: { effectAllowed: '', dropEffect: '', setData(type, value) { this.data = value; }, getData() { return data; } },
});
const row = (tree, id) => elements(tree).find(node => node.props.role === 'listitem' && node.props.key === id);
const handle = (tree, id) => elements(row(tree, id)).find(node => node.type.name === 'ProviderDragHandle').props;
const card = (tree, id) => elements(row(tree, id)).find(node => /^(LyricsProviderCard|AddonSettingsCard)$/.test(node.type.name)).props;
const checkbox = tree => elements(tree).find(node => node.props.role === 'checkbox');
const statusBadge = tree => elements(tree).find(node => node.type === 'span');
const downloadButton = tree => elements(tree).find(node => node.props.className === 'btn');
const treeContract = (before, after) => {
  if (after) assert.deepEqual(normalize(after), normalize(before));
};
const comparableCalls = calls => normalize(calls.filter(([, operation, event]) =>
  !(['subscribe', 'unsubscribe'].includes(operation) && ['addon:registered', 'addon:unregistered',
    'provider:order:changed', 'provider:enabled:changed', 'addon:setting:changed', 'provider:capability:changed',
    'provider:sync-data-priority:changed', 'provider:lyrics-type-priority:changed'].includes(event))));

for (const component of ['LyricsProvidersTab', 'AIProvidersTab']) {
  test(`${component}: live manager updates reconcile the list and a drop onto a removed provider is ignored`, () => {
    const h = createHarness(current, component);
    const manager = h.window[component === 'LyricsProvidersTab' ? 'LyricsAddonManager' : 'AIAddonManager'];
    const order = tree => elements(tree).filter(node => node.props.role === 'listitem').map(node => node.props.key);
    h.render(); h.flushEffects();
    manager.register({ id: 'late-provider', name: 'Late provider' });
    manager.setProviderEnabled('late-provider', false);
    manager.setProviderOrder(['late-provider', 'c', 'a', 'b']);
    let tree = h.render();
    assert.deepEqual(order(tree), ['late-provider', 'c', 'a', 'b']);
    assert.equal(card(tree, 'late-provider').isEnabled, false);
    handle(tree, 'c').onDragStart(event(), 'c');
    const staleRow = row(h.render(), 'a');
    manager.unregister('a');
    const writesBeforeDrop = h.calls.filter(([, operation]) => operation === 'order').length;
    staleRow.props.onDrop(event(80));
    tree = h.render();
    assert.equal(h.calls.filter(([, operation]) => operation === 'order').length, writesBeforeDrop);
    assert.deepEqual(order(tree), ['late-provider', 'c', 'b']);
    h.unmount();
    assert.ok(h.calls.some(([, operation, type]) => operation === 'unsubscribe' && type === 'addon:registered'));
  });

  test(`${component}: leaving before addon registration cancels readiness polling`, () => {
    const h = createHarness(current, component, { managerReady: false });
    h.render(); h.flushEffects();
    assert.equal(h.timeouts.size, 1);
    h.unmount();
    assert.equal(h.timeouts.size, 0);
    h.tickTimeouts();
    assert.equal(h.timeouts.size, 0, 'a closed provider tab must not keep polling');
  });

  test(`${component}: provider tree, ordering gestures, expansion and persistence`, () => {
    const before = baseline && createHarness(baseline, component), after = createHarness(current, component);
    const pair = [before, after].filter(Boolean);
    let trees = pair.map(harness => harness.render());
    treeContract(...trees);
    pair.forEach(harness => harness.flushEffects());
    const check = () => {
      trees = pair.map(harness => harness.render());
      treeContract(...trees);
      if (before) assert.deepEqual(comparableCalls(after.calls), comparableCalls(before.calls));
      return trees;
    };
    check();
    assert.deepEqual(elements(trees.at(-1)).filter(node => node.props.role === 'listitem').map(node => node.props.key), ['b', 'a', 'c']);
    const initialTypes = elements(trees.at(-1)).map(node => node.type);
    check();
    assert.deepEqual(elements(trees.at(-1)).map(node => node.type), initialTypes);
    trees.forEach(tree => card(tree, 'a').onExpandToggle()); check();
    assert.equal(card(trees.at(-1), 'a').isExpanded, true);
    trees.forEach(tree => card(tree, 'b').onToggle(true)); check();
    assert.equal(card(trees.at(-1), 'b').isEnabled, true);
    trees.forEach(tree => handle(tree, 'b').onMove('b', 'up')); check(); // first-row boundary
    trees.forEach(tree => handle(tree, 'a').onMove('a', 'up')); check();
    trees.forEach(tree => handle(tree, 'c').onDragStart(event(), 'c')); check();
    trees.forEach(tree => row(tree, 'a').props.onDragOver(event(90))); check();
    assert.match(row(trees.at(-1), 'a').props.className, /drag-over-after/);
    trees.forEach(tree => row(tree, 'a').props.onDrop(event(90))); check();
    trees.forEach(tree => row(tree, 'a').props.onDrop(event(5, 'b'))); check(); // dataTransfer fallback
    trees.forEach(tree => handle(tree, 'a').onDragStart(event(), 'a')); check();
    trees.forEach(tree => handle(tree, 'a').onDragEnd()); check();
    pair.forEach(harness => {
      const name = component === 'LyricsProvidersTab' ? 'LyricsAddonManager' : 'AIAddonManager';
      harness.window[name] = harness.makeManager('replacement');
    });
    trees.forEach(tree => handle(tree, 'a').onMove('a', 'up')); check();
    assert.equal(after.calls.at(-1)[0], 'replacement', 'event handlers must use the current manager');
    pair.forEach(harness => harness.language('zh-TW')); check();
    pair.forEach(harness => harness.unmount());
    if (before) assert.deepEqual(comparableCalls(after.calls), comparableCalls(before.calls));
  });

  test(`${component}: late user addon registration retains arbitrary ids, object props and manager calls`, () => {
    const addon = { id: 'community/user-addon:한글.v2', name: '', getSettingsUI() {} };
    const providers = [{ id: 'b', name: 'Built-in' }, addon, { id: 'another-custom-id' }];
    const pair = sources.map(source => createHarness(source, component, { providers, managerReady: false }));
    const managerName = component === 'LyricsProvidersTab' ? 'LyricsAddonManager' : 'AIAddonManager';
    const providerProp = component === 'LyricsProvidersTab' ? 'provider' : 'addon';
    let trees = pair.map(harness => harness.render());
    treeContract(...trees);
    pair.forEach(harness => harness.flushEffects());
    assert.equal(pair.at(-1).timeouts.size, 1);
    assert.equal([...pair.at(-1).timeouts.values()][0].delay, 100);
    pair.forEach(harness => {
      harness.window[managerName] = harness.makeManager('community-manager');
      harness.tickTimeouts();
    });
    const check = () => {
      trees = pair.map(harness => harness.render());
      treeContract(...trees);
      if (baseline) assert.deepEqual(comparableCalls(pair.at(-1).calls), comparableCalls(pair[0].calls));
    };
    check();
    assert.strictEqual(card(trees.at(-1), addon.id)[providerProp], addon);
    assert.ok(handle(trees.at(-1), addon.id).label.startsWith(`${addon.id}: `));
    trees.forEach(tree => card(tree, addon.id).onToggle(false)); check();
    assert.equal(card(trees.at(-1), addon.id).isEnabled, false);
    assert.deepEqual(pair.at(-1).calls.at(-1), ['community-manager', 'enabled', addon.id, false]);
    trees.forEach(tree => handle(tree, addon.id).onMove(addon.id, 'up')); check();
    assert.deepEqual(pair.at(-1).calls.at(-1), ['community-manager', 'order', [addon.id, 'b', 'another-custom-id']]);
    trees.forEach(tree => card(tree, addon.id).onExpandToggle()); check();
    assert.equal(card(trees.at(-1), addon.id).isExpanded, true);
    trees.forEach(tree => handle(tree, addon.id).onDragStart(event(), addon.id)); check();
    trees.forEach(tree => row(tree, 'another-custom-id').props.onDrop(event(90))); check();
    assert.deepEqual(pair.at(-1).calls.at(-1), ['community-manager', 'order', ['b', 'another-custom-id', addon.id]]);
    pair.forEach(harness => harness.unmount());
    if (baseline) assert.deepEqual(comparableCalls(pair.at(-1).calls), comparableCalls(pair[0].calls));
  });
}

test("committed helper settings publish the same playback notifications as direct toggles", () => {
  const host = new EventTarget();
  const events = [];
  for (const type of ["ivLyrics", "ivLyrics:videoHelperChanged", "ivLyrics:lyricsHelperChanged"]) {
    host.addEventListener(type, event => events.push([type, event.detail]));
  }
  const { publishSettingsConfigChange } = createSettingsEventChannel(host, (type, detail) => new CustomEvent(type, { detail }));
  publishSettingsConfigChange("video-helper-enabled", "true");
  publishSettingsConfigChange("lyrics-helper-enabled", false);
  assert.deepEqual(events, [
    ["ivLyrics", { type: "config", name: "video-helper-enabled", value: "true" }],
    ["ivLyrics:videoHelperChanged", { enabled: true }],
    ["ivLyrics", { type: "config", name: "lyrics-helper-enabled", value: false }],
    ["ivLyrics:lyricsHelperChanged", { enabled: false }],
  ]);
});

test("the lyrics helper keeps one pending check and ignores it after disabling", async () => {
  const h = createHarness(current, "LyricsHelperToggle");
  const render = defaultValue => h.render({ settingKey: "lyrics-helper-enabled", defaultValue });
  render(true);
  h.flushEffects();
  h.tick();
  h.tick();
  assert.equal(h.pendingHealth.length, 1);
  render(false);
  h.flushEffects();
  await h.healthResult(true);
  assert.equal(statusBadge(render(false)), undefined);
  assert.equal(h.intervals.size, 0);
  assert.equal(h.listeners.has("ivLyrics:lyrics-helper-connection"), false);
  const tree = render(true);
  assert.equal(statusBadge(tree).props.style.color, "#ef4444");
  h.unmount();
});

for (const component of ['VideoHelperToggle', 'LyricsHelperToggle']) {
  const isLyricsHelper = component === 'LyricsHelperToggle';
  const settingKey = isLyricsHelper ? 'lyrics-helper-enabled' : 'video-helper-enabled';
  const namespace = isLyricsHelper ? 'lyricsHelper' : 'videoHelper';

  test(`${component}: a rejected write leaves the switch and connection unchanged`, (t) => {
    t.mock.method(console, "error", () => {});
    const h = createHarness(current, component, { denySave: true });
    h.context.CONFIG.visual[settingKey] = false;
    const render = () => h.render({
      settingKey,
      defaultValue: h.context.CONFIG.visual[settingKey],
      onChange: h.context.changeHelperSetting,
    });
    checkbox(render()).props.onClick();
    h.flushEffects();
    assert.equal(checkbox(render()).props["aria-checked"], false);
    assert.deepEqual(h.calls, [["save-error"]]);
    assert.equal(h.pendingHealth.length, 0);
    h.unmount();
  });

  test(`${component}: connection states, styles, disabled toggles and one committed change`, async () => {
    for (const defaultValue of [undefined, false, true, 'true', 'false']) {
      for (const emptyTranslations of [false, true]) {
        const before = baseline && createHarness(baseline, component, { emptyTranslations });
        const after = createHarness(current, component, { emptyTranslations });
        const pair = [before, after].filter(Boolean);
        const props = { name: 'helper-name', settingKey, defaultValue };
        const initiallyEnabled = defaultValue === true || defaultValue === 'true';
        const render = (harness, extra = {}) => harness.render({
          ...props,
          defaultValue: harness.context.CONFIG.visual[settingKey] ?? defaultValue,
          onChange: (...args) => {
            harness.calls.push(['change', ...args]);
            harness.context.changeHelperSetting?.(...args);
          },
          ...extra,
        });
        const legacyEventTrace = harness => normalize(harness.calls.filter(call =>
          !['save', 'change'].includes(call[0]) && !(call[0] === 'event' && call[1] === 'ivLyrics')));
        const check = () => {
          const trees = pair.map(harness => render(harness));
          treeContract(...trees);
          if (before) assert.deepEqual(legacyEventTrace(after), legacyEventTrace(before));
          return trees;
        };
        let trees = check();
        assert.equal(trees.at(-1).props['data-setting-key'], settingKey);
        assert.equal(checkbox(trees.at(-1)).props['aria-checked'], initiallyEnabled);
        assert.equal(Boolean(statusBadge(trees.at(-1))), initiallyEnabled);
        assert.equal(Boolean(downloadButton(trees.at(-1))), initiallyEnabled);
        assert.deepEqual(elements(trees.at(-1)).filter(node => typeof node.type === 'string').map(node => node.type), [
          'div', 'div', 'div', 'div', ...(initiallyEnabled ? ['span'] : []), 'div', 'div',
          ...(initiallyEnabled ? ['button'] : []), 'button', 'svg',
        ]);
        pair.forEach(harness => harness.flushEffects()); check();
        await Promise.all(pair.map(harness => harness.healthResult(false))); trees = check();
        for (const tree of trees) elements(tree).find(node => node.props.className === 'btn')?.props.onClick();
        if (initiallyEnabled) assert.deepEqual(after.calls.at(-1), isLyricsHelper
          ? ['open', 'https://ivlis.kr/ivLyrics/extensions/#helper', '_blank'] : ['video-download']);
        check();
        const disabled = pair.map(harness => render(harness, { disabled: true }));
        const callsBeforeDisabledClick = after.calls.length;
        disabled.forEach(tree => elements(tree).find(node => node.props.role === 'checkbox').props.onClick()); check();
        assert.equal(after.calls.length, callsBeforeDisabledClick);
        trees = check();
        if (!initiallyEnabled) {
          trees.forEach(tree => elements(tree).find(node => node.props.role === 'checkbox').props.onClick());
          check(); pair.forEach(harness => harness.flushEffects()); check();
        }
        if (after.pendingHealth.length === 0) pair.forEach(harness => harness.tick());
        await Promise.all(pair.map(harness => harness.healthResult(true))); trees = check();
        assert.equal(checkbox(trees.at(-1)).props['aria-checked'], true);
        assert.equal(downloadButton(trees.at(-1)), undefined);
        assert.deepEqual(normalize(statusBadge(trees.at(-1)).props.style), {
          marginLeft: '10px', fontSize: '10px', padding: '2px 8px', borderRadius: '12px',
          backgroundColor: 'rgba(74, 222, 128, 0.2)', color: '#4ade80',
          border: '1px solid rgba(74, 222, 128, 0.3)', fontWeight: '600', verticalAlign: 'middle',
        });
        assert.deepEqual(statusBadge(trees.at(-1)).props.children, [
          `✓ ${emptyTranslations ? (isLyricsHelper ? 'Connected' : '') : `ko:settings.${namespace}.status.connected`}`,
        ]);
        pair.forEach(harness => harness.tick()); check();
        await Promise.all(pair.map(harness => harness.healthResult(false))); trees = check();
        assert.equal(statusBadge(trees.at(-1)).props.style.color, '#ef4444');
        assert.ok(downloadButton(trees.at(-1)));
        pair.forEach(harness => harness.window.dispatchEvent({ type: 'unrelated', detail: {} }));
        pair.forEach(harness => harness.listeners.get('ivLyrics:lyrics-helper-connection')?.({ detail: { connected: true } })); check();
        pair.forEach(harness => harness.language('zh-TW')); trees = check();
        trees.forEach(tree => elements(tree).find(node => node.props.role === 'checkbox').props.onClick()); check();
        pair.forEach(harness => harness.flushEffects()); trees = check();
        assert.equal(checkbox(trees.at(-1)).props['aria-checked'], false);
        assert.equal(statusBadge(trees.at(-1)), undefined);
        assert.equal(downloadButton(trees.at(-1)), undefined);
        const values = initiallyEnabled ? [false] : [true, false];
        assert.deepEqual(after.calls.filter(call =>
          ['change', 'save'].includes(call[0]) || (call[0] === 'event' && call[1] !== 'unrelated')
        ), values.flatMap(value => [
          ['change', settingKey, value],
          ['save', settingKey, value],
          ['event', 'ivLyrics', { type: 'config', name: settingKey, value }],
          ['event', `ivLyrics:${namespace}Changed`, { enabled: value }],
        ]));
        assert.deepEqual(normalize(after.context.CONFIG.visual), { [settingKey]: false });
        pair.forEach(harness => harness.unmount());
        assert.equal(after.intervals.size, 0);
        assert.equal(after.listeners.size, 0);
        if (before) assert.deepEqual(legacyEventTrace(after), legacyEventTrace(before));
      }
    }
  });
}
