import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import vm from 'node:vm';

const current = readFileSync(new URL('../Settings.js', import.meta.url), 'utf8');
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
  const react = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) };
  const makeManager = label => ({
    getAddons: () => options.providers || [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }],
    getProviderOrder: () => ['b', 'missing', 'a'],
    isProviderEnabled: id => id !== 'b',
    setProviderOrder: order => calls.push([label, 'order', Array.from(order)]),
    setProviderEnabled: (...args) => calls.push([label, 'enabled', ...args]),
    on: event => { calls.push([label, 'subscribe', event]); return () => calls.push([label, 'unsubscribe', event]); },
  });
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
    I18n: { t: key => options.emptyTranslations ? '' : `${language}:${key}` },
    CONFIG: { visual: {} },
    StorageManager: { saveConfig: (...args) => calls.push(['save', ...args]) },
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
  const providerStart = source.includes('const createSettingsProviderOrderControls =')
    ? 'const createSettingsProviderOrderControls =' : 'const LyricsProvidersTab =';
  const helperStart = source.includes('const renderSettingsHelperToggle =')
    ? 'const renderSettingsHelperToggle =' : 'const VideoHelperToggle =';
  vm.runInContext([
    section(source, 'function buildOrderedProviderList(', 'const SETTINGS_OUTLINE_ICONS ='),
    section(source, providerStart, 'const getSafeSettingsLocale ='),
    section(source, helperStart, 'const ConfigSelection ='),
    `globalThis.component = ${component};`,
  ].join('\n'), context);
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

for (const component of ['LyricsProvidersTab', 'AIProvidersTab']) {
  test(`${component}: provider tree, ordering gestures, expansion and persistence`, () => {
    const before = baseline && createHarness(baseline, component), after = createHarness(current, component);
    const pair = [before, after].filter(Boolean);
    let trees = pair.map(harness => harness.render());
    treeContract(...trees);
    pair.forEach(harness => harness.flushEffects());
    const check = () => {
      trees = pair.map(harness => harness.render());
      treeContract(...trees);
      if (before) assert.deepEqual(normalize(after.calls), normalize(before.calls));
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
    if (before) assert.deepEqual(normalize(after.calls), normalize(before.calls));
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
      if (baseline) assert.deepEqual(normalize(pair.at(-1).calls), normalize(pair[0].calls));
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
    if (baseline) assert.deepEqual(normalize(pair.at(-1).calls), normalize(pair[0].calls));
  });
}

test('result panels preserve all ten existing container ids, sibling insertion and row marker timing', () => {
  const blocks = baseline ? [...baseline.matchAll(/const settingRow = button\.closest\("\.setting-row"\);\n\s*let resultContainer = settingRow\?\.nextElementSibling;\n\n\s*if \(\n\s*!resultContainer \|\|\n\s*!resultContainer.id \|\|\n\s*resultContainer.id !== "([a-z-]+)"\n\s*\) \{\n[\s\S]*?\n\s*\}/g)] : null;
  const calls = [...current.matchAll(/const resultContainer = getSettingsResultContainer\(button, "([a-z-]+)"(?:, "([a-z-]+)")?\);/g)];
  const ids = ['export-result-container', 'export-result-container', 'export-result-container', 'export-result-container',
    'db-export-result-container', 'db-export-result-container', 'db-import-result-container', 'db-import-result-container',
    'reset-result-container', 'update-result-container'];
  assert.deepEqual(calls.map(call => call[1]), ids);
  assert.deepEqual(calls.map(call => call[2]), [...Array(9).fill(undefined), 'has-update-result']);
  if (blocks) assert.deepEqual(blocks.map(block => block[1]), ids);
  const helper = section(current, 'const getSettingsResultContainer =', 'const ConfigModal =');
  for (let i = 0; i < calls.length; i++) {
    for (const state of ['missing', 'matching', 'other-id', 'empty-id', 'no-row', 'detached-row']) {
      const run = (code) => {
        const operations = [];
        const existing = { id: state === 'matching' ? calls[i][1] : state === 'other-id' ? 'unrelated-panel' : '', style: { cssText: 'preserved' } };
        const nextSibling = { type: 'text-node-before-next-element' };
        const row = state === 'no-row' ? null : {
          nextElementSibling: state === 'missing' ? null : existing,
          nextSibling,
          parentNode: state === 'detached-row' ? null : {
            insertBefore(node, sibling) { operations.push(['insert', node.id, sibling === nextSibling]); },
          },
          classList: { add(name) { operations.push(['class', name]); } },
        };
        const context = vm.createContext({
          button: { closest(selector) { operations.push(['closest', selector]); return row; } },
          document: { createElement(tag) { operations.push(['create', tag]); return { style: {} }; } },
        });
        const result = vm.runInContext(code, context);
        return { result: normalize(result), reused: result === existing, operations };
      };
      const before = blocks && run(`(() => { ${blocks[i][0]} return resultContainer; })()`);
      const after = run(`${helper}\ngetSettingsResultContainer(button, ${JSON.stringify(calls[i][1])}, ${JSON.stringify(calls[i][2])});`);
      const reused = state === 'matching';
      const operations = [['closest', '.setting-row']];
      if (!reused) {
        operations.push(['create', 'div']);
        if (!['no-row', 'detached-row'].includes(state)) operations.push(['insert', calls[i][1], true]);
        if (calls[i][2] && state !== 'no-row') operations.push(['class', calls[i][2]]);
      }
      assert.deepEqual(after, {
        result: { id: calls[i][1], style: { cssText: reused ? 'preserved' : 'margin-top: -1px;' } },
        reused, operations,
      }, `${calls[i][1]} / ${state}`);
      if (before) assert.deepEqual(after, before, `${calls[i][1]} / ${state}`);
    }
  }
});

for (const component of ['VideoHelperToggle', 'LyricsHelperToggle']) {
  test(`${component}: connection states, styles, disabled toggles and distinct storage contracts`, async () => {
    for (const defaultValue of [undefined, false, true, 'true', 'false']) {
      for (const emptyTranslations of [false, true]) {
        const before = baseline && createHarness(baseline, component, { emptyTranslations });
        const after = createHarness(current, component, { emptyTranslations });
        const pair = [before, after].filter(Boolean);
        const props = { name: 'helper-name', settingKey: 'helper-key', defaultValue };
        const isLyricsHelper = component === 'LyricsHelperToggle';
        const initiallyEnabled = defaultValue === true || defaultValue === 'true';
        const namespace = isLyricsHelper ? 'lyricsHelper' : 'videoHelper';
        const render = (harness, extra = {}) => harness.render({ ...props, onChange: (...args) => harness.calls.push(['change', ...args]), ...extra });
        const check = () => {
          const trees = pair.map(harness => render(harness));
          treeContract(...trees);
          if (before) assert.deepEqual(normalize(after.calls), normalize(before.calls));
          return trees;
        };
        let trees = check();
        assert.equal(trees.at(-1).props['data-setting-key'], 'helper-key');
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
        assert.deepEqual(after.calls.filter(call => call[0] === 'change'), values.map(value => [
          'change', isLyricsHelper ? 'helper-name' : 'helper-key', value,
        ]));
        assert.deepEqual(after.calls.filter(call => call[0] === 'save'), isLyricsHelper
          ? values.map(value => ['save', 'helper-name', value]) : []);
        assert.deepEqual(after.calls.filter(call => call[0] === 'event' && call[1] !== 'unrelated'), values.map(value => [
          'event', `ivLyrics:${namespace}Changed`, { enabled: value },
        ]));
        assert.deepEqual(normalize(after.context.CONFIG.visual), isLyricsHelper ? { 'helper-name': false } : {});
        assert.equal(after.window.lyricsHelperSender.enabled, false);
        pair.forEach(harness => harness.unmount());
        assert.equal(after.intervals.size, 0);
        assert.equal(after.listeners.size, 0);
        if (before) assert.deepEqual(normalize(after.calls), normalize(before.calls));
        if (before) assert.deepEqual(normalize(after.context.CONFIG), normalize(before.context.CONFIG));
        if (before) assert.equal(after.window.lyricsHelperSender.enabled, before.window.lyricsHelperSender.enabled);
      }
    }
  });
}
