import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import vm from 'node:vm';

const root = fileURLToPath(new URL('..', import.meta.url));
const current = readFileSync(new URL('../OptionsMenu.js', import.meta.url), 'utf8');
const baseline = execFileSync('git', ['show', '98e6a4167c72f80b422ec77461852d9da12f97e9:OptionsMenu.js'], { cwd: root, encoding: 'utf8' });
const section = (source, start, end) => {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from);
  return source.slice(from, to);
};
const presetsSource = readFileSync(new URL('../LyricsShareImage.js', import.meta.url), 'utf8');
const presets = vm.runInNewContext(`(() => {
  ${section(presetsSource, '  const DEFAULT_SETTINGS =', '  // TEMPLATES')}
  return { DEFAULT_SETTINGS, PRESETS };
})()`);
const normalize = (value) => JSON.parse(JSON.stringify(value, (_key, entry) => typeof entry === 'function' ? '[handler]' : entry));
const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes) : tree?.type ? [tree, ...nodes(tree.children)] : [];
const byClass = (tree, value) => nodes(tree).find(node => node.props?.className?.split(' ').includes(value));

// Execute the complete modal with persistent state; existing preview lifecycle
// tests exercise its effects separately. No new component types hide DOM changes.
function harness(source, { defaults = presets.DEFAULT_SETTINGS, templates = presets.PRESETS, custom = {}, translated = true } = {}) {
  const hooks = [];
  let cursor = 0;
  const react = {
    createElement: (type, props, ...children) => ({ type, props, children }),
    useState(initial) {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = { value: index === 5 ? custom : initial };
      return [hooks[index].value, value => { hooks[index].value = typeof value === 'function' ? value(hooks[index].value) : value; }];
    },
    useMemo(factory, deps) {
      const index = cursor++;
      if (!hooks[index] || deps.some((value, i) => !Object.is(value, hooks[index].deps[i]))) hooks[index] = { value: factory(), deps };
      return hooks[index].value;
    },
    useRef(value) { const index = cursor++; hooks[index] ||= { value: { current: value } }; return hooks[index].value; },
    useEffect() { cursor++; },
  };
  const context = vm.createContext({
    react, I18n: { t: key => translated ? `translated:${key}` : '' },
    LyricsShareImage: { DEFAULT_SETTINGS: defaults, PRESETS: templates }, navigator: {},
    Toast: { error() {} },
  });
  const start = source.includes('const renderShareImageControls =') ? 'const renderShareImageControls =' : 'const ShareImageModal =';
  vm.runInContext(`${section(source, start, '// Open Share Image Modal')}\nglobalThis.renderModal = ShareImageModal;`, context);
  const props = { lyrics: [{ originalText: 'Song line', text: 'Pronunciation', text2: 'Translation' }], trackInfo: { name: 'Song', artist: 'Artist' }, onClose() {} };
  return {
    render() { cursor = 0; return context.renderModal(props); },
    get settings() { return normalize(hooks[5].value); },
    open() {
      byClass(this.render(), 'share-image-advanced-toggle').props.onClick();
      return this.render();
    },
  };
}
const pair = (options) => [harness(baseline, options), harness(current, options)];
const assertTrees = (harnesses) => {
  const trees = harnesses.map(h => h.render());
  assert.deepEqual(normalize(trees[1]), normalize(trees[0]), 'element types, keys, ordering, props and styles must match');
  return trees;
};

for (const translated of [true, false]) {
  test(`all real image presets preserve the complete modal tree (${translated ? 'translated' : 'fallback'} labels)`, () => {
    const hs = pair({ translated });
    assertTrees(hs);
    hs.forEach(h => h.open());
    for (const template of Object.keys(presets.PRESETS)) {
      for (const h of hs) nodes(h.render()).find(node => node.props?.className === 'share-image-chip' && node.props.key === template).props.onClick();
      assertTrees(hs);
    }
  });
}

test('conditional cover controls, defaults, zero values and ratio selection preserve exact output', () => {
  for (const backgroundType of ['coverBlur', 'gradient', 'solid', undefined]) {
    for (const showCover of [true, false, 0, null, undefined, 'false']) {
      for (const aspectRatio of [null, 1, 9 / 16, 16 / 9, undefined]) {
        const hs = pair({ templates: {}, defaults: {
          backgroundType, showCover, aspectRatio, backgroundOpacity: 0, coverRadius: 0,
          showTrackInfo: false, showPronunciation: false, showTranslation: true, showWatermark: null,
        } });
        hs.forEach(h => h.open());
        assertTrees(hs);
      }
    }
  }
});

test('every range preserves limits, step, integer parsing and percent conversion', () => {
  const initial = harness(baseline);
  const ranges = nodes(byClass(initial.open(), 'share-image-advanced-panel')).filter(node => node.props?.type === 'range');
  assert.equal(ranges.length, 9);
  for (let index = 0; index < ranges.length; index++) {
    for (const value of ['0', '51.7', '0x10', '-3', 'invalid']) {
      const hs = pair();
      for (const h of hs) {
        const inputs = nodes(byClass(h.open(), 'share-image-advanced-panel')).filter(node => node.props?.type === 'range');
        inputs[index].props.onChange({ target: { value } });
      }
      assert.deepEqual(hs[1].settings, hs[0].settings);
      assertTrees(hs);
    }
  }
  const hs = pair();
  for (const h of hs) {
    const inputs = nodes(byClass(h.open(), 'share-image-advanced-panel')).filter(node => node.props?.type === 'range');
    inputs[1].props.onChange({ target: { value: '75' } });
    assert.equal(h.settings.backgroundOpacity, 0.75);
  }
});

test('every checkbox and segmented choice preserves stored values and dependent visibility', () => {
  for (const kind of ['checkbox', 'choice']) {
    const controls = (tree) => nodes(byClass(tree, 'share-image-advanced-panel')).filter(node => kind === 'checkbox'
      ? node.props?.type === 'checkbox' : node.props?.className === 'share-image-segment-btn');
    const initial = harness(baseline);
    const count = controls(initial.open()).length;
    assert.equal(count, kind === 'checkbox' ? 5 : 11);
    for (let index = 0; index < count; index++) {
      const hs = pair();
      for (const h of hs) {
        const control = controls(h.open())[index];
        if (kind === 'checkbox') control.props.onChange({ target: { checked: false } });
        else control.props.onClick();
      }
      assert.deepEqual(hs[1].settings, hs[0].settings);
      assertTrees(hs);
    }
  }
  const hs = pair({ custom: { aspectRatio: 1 } });
  for (const h of hs) {
    nodes(h.open()).find(node => node.props?.className === 'share-image-segment-btn' && node.props.key === 'auto').props.onClick();
    assert.equal(h.settings.aspectRatio, null);
  }
  assertTrees(hs);
});

test('preview scheduling and export handlers remain byte-for-byte unchanged', () => {
  assert.equal(
    section(current, '  const previewGenerationRef =', '  return react.createElement("div", {\n    className: "share-image-modal"'),
    section(baseline, '  const previewGenerationRef =', '  return react.createElement("div", {\n    className: "share-image-modal"'),
  );
});
