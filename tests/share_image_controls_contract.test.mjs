import { createShareImageModal } from '../src/features/share/shareImageDialog.mjs';
import { createShareImageExportActions } from '../src/features/share/shareImageExportActions.mjs';
import { DEFAULT_SETTINGS, PRESETS } from '../src/features/share/shareImagePresets.mjs';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import vm from 'node:vm';

const root = fileURLToPath(new URL('..', import.meta.url));
const current = createShareImageModal;
const baseline = execFileSync('git', ['show', '98e6a4167c72f80b422ec77461852d9da12f97e9:OptionsMenu.js'], { cwd: root, encoding: 'utf8' });
const section = (source, start, end) => {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from);
  return source.slice(from, to);
};
const normalize = (value) => JSON.parse(JSON.stringify(value, (key, entry) => {
  if (key === 'ref') return undefined;
  return typeof entry === 'function' ? '[handler]' : entry;
}));
const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes) : tree?.type ? [tree, ...nodes(tree.children)] : [];
const byClass = (tree, value) => nodes(tree).find(node => node.props?.className?.split(' ').includes(value));

// Execute the complete modal with persistent state; existing preview lifecycle
// tests exercise its effects separately. No new component types hide DOM changes.
function harness(source, { defaults = DEFAULT_SETTINGS, templates = PRESETS, custom = {}, translated = true, image = {}, notify = () => {}, onClose = () => {}, canShare = false } = {}) {
  const hooks = [];
  const customSettingsIndex = typeof source === 'function' ? 4 : 5;
  let cursor = 0;
  const react = {
    createElement: (type, props, ...children) => ({ type, props, children }),
    useState(initial) {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = { value: index === customSettingsIndex ? custom : initial };
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
  const translate = key => translated ? `translated:${key}` : '';
  const imageApi = { DEFAULT_SETTINGS: defaults, PRESETS: templates, ...image };
  let renderModal;
  if (typeof source === 'function') {
    renderModal = source({
      react, translate, image: imageApi, notify, readTheme: () => 'dark', canShare: () => canShare,
    });
  } else {
    const context = vm.createContext({
      react, I18n: { t: translate }, LyricsShareImage: imageApi, navigator: {},
      Toast: { error() {} },
    });
    const start = source.includes('const renderShareImageControls =') ? 'const renderShareImageControls =' : 'const ShareImageModal =';
    vm.runInContext(`${section(source, start, '// Open Share Image Modal')}\n globalThis.renderModal = ShareImageModal;`, context);
    renderModal = context.renderModal;
  }
  const props = {
    lyrics: [{ originalText: 'Song line', text: 'Pronunciation', text2: 'Translation' }],
    trackInfo: { name: 'Song', artist: 'Artist' }, onClose,
  };
  return {
    render() { cursor = 0; return renderModal(props); },
    get settings() { return normalize(hooks[customSettingsIndex].value); },
    open() {
      // Idempotent: baseline has a collapsible toggle (open only when the
      // panel is closed); current renders the panel always open.
      let tree = this.render();
      const toggle = byClass(tree, 'share-image-advanced-toggle');
      if (toggle && !byClass(tree, 'share-image-advanced-panel')) toggle.props.onClick();
      return this.render();
    },
  };
}
const pair = (options) => [harness(baseline, options), harness(current, options)];
// Open every collapsed style group so control queries see all rows.
// Header clicks only open closed groups; already-open groups are untouched.
const expandAllGroups = (h) => {
  const panel = () => byClass(h.render(), 'share-image-advanced-panel');
  const groups = () => nodes(panel()).filter((node) =>
    String(node.props?.className ?? '').split(' ').includes('share-image-style-group'));
  for (const grp of groups()) {
    const isOpen = nodes(grp).some((node) => node.props?.className === 'share-image-style-group-body');
    if (!isOpen) {
      nodes(grp).find((node) => node.props?.className === 'share-image-style-group-header').props.onClick();
    }
  }
};
// New controls are intentional additions: exclude their rows so the guard
// still pins every other element, key, ordering, prop and style.
// Each new control is covered by dedicated tests below.
const NEW_CONTROL_PATTERNS = [
  /lyricsDetail|내보내기 방식|Export Type/,
  /fontSource|Font Source/,
  /^글꼴$/,
  /exportScale|내보내기 배율|Export Scale/,
  /origColor|원어 색상|Original Color/,
  /origWeight|원어 굵기|Original Weight/,
  /pronSize|발음 크기|Pronunciation Size/,
  /wordReadingSize|문자 발음 크기|Word Reading Size/,
  /pronColor|발음 색상|Pronunciation Color/,
  /pronWeight|발음 굵기|Pronunciation Weight/,
  /transSize|번역 크기|Translation Size/,
  /transColor|번역 색상|Translation Color/,
  /transWeight|번역 굵기|Translation Weight/,
  /wordGlossSize|단어 번역 크기|Word Translation Size/,
  /wordReadingColor|문자 발음 색상|Word Reading Color/,
  /wordReadingWeight|문자 발음 굵기|Word Reading Weight/,
  /wordGlossColor|문자 번역 색상|Word Gloss Color/,
  /wordGlossWeight|문자 번역 굵기|Word Gloss Weight/,
  /customFontFamily|글꼴 이름|Custom Font/,
  /trackTitleSize|곡 제목 크기|Track Title Size/,
  /trackTitleColor|곡 제목 색상|Track Title Color/,
  /trackTitleWeight|곡 제목 굵기|Track Title Weight/,
  /trackArtistSize|아티스트 크기|Artist Size/,
  /trackArtistColor|아티스트 색상|Artist Color/,
  /trackArtistWeight|아티스트 굵기|Artist Weight/,
];
const isNewControlField = (node) => {
  if (!node || typeof node !== 'object' || node.type !== 'div') return false;
  if (node.props?.style?.gridColumn !== 'span 2') return false;
  // Match only the field row itself (direct label child), never an ancestor:
  // a descendant check would also match every parent container.
  const children = Array.isArray(node.children) ? node.children.flat(Infinity) : [];
  return children.some((child) => {
    if (!child || typeof child !== 'object' || child.type !== 'label') return false;
    const labelTexts = Array.isArray(child.children) ? child.children.flat(Infinity) : [];
    return labelTexts.some((text) => typeof text === 'string'
      && NEW_CONTROL_PATTERNS.some((pattern) => pattern.test(text)));
  });
};
const stripNewControls = (node) => {
  // Drop conditional placeholders too: the word-mode-only slider renders
  // `false` in line mode with no baseline counterpart. Existing conditionals
  // stay symmetric since both sides drop their placeholders identically.
  // The removed advanced-settings toggle is likewise dropped from both trees.
  if (Array.isArray(node)) return node
    .filter((child) => child !== false && child !== null && child !== undefined && !isNewControlField(child) && !isRemovedToggle(child) && !isNewAlignButton(child))
    .map(stripNewControls);
  if (node && typeof node === 'object') return { ...node, children: stripNewControls(node.children) };
  return node;
};
const isRemovedToggle = (node) => node && typeof node === 'object'
  && String(node.props?.className ?? '').split(' ').includes('share-image-advanced-toggle');
// The right-alignment button is new but lives inside the legacy lyricsAlign
// row, so the row-level allowlist cannot strip it: drop the button itself.
const isNewAlignButton = (node) => node && typeof node === 'object'
  && String(node.props?.className ?? '').split(' ').includes('share-image-segment-btn')
  && node.props?.key === 'right';
// The ratioAuto label gained an i18n key; unify it so the unchanged row still compares.
const unifyRatioAuto = (tree) =>
  JSON.parse(JSON.stringify(tree).split('translated:shareImage.settings.ratioAuto').join('자동'));
const modalKids = (tree) => (Array.isArray(tree?.children) ? tree.children : []).filter((child) => child && typeof child === 'object');
const paneByClass = (parent, cls) => modalKids(parent)
  .find((child) => String(child.props?.className ?? '').split(' ').includes(cls));
const withoutPreviewPanel = (node) => {
  // Baseline embeds the preview inside the settings pane; the current layout
  // moved it to its own right-hand pane. Drop it for the settings comparison.
  if (Array.isArray(node)) return node
    .filter((child) => !(child && typeof child === 'object' && String(child.props?.className ?? '').split(' ').includes('share-image-preview-panel')))
    .map(withoutPreviewPanel);
  if (node && typeof node === 'object') return { ...node, children: withoutPreviewPanel(node.children) };
  return node;
};
// The 3-pane layout changed pane widths (45/55 → 30/36/34) and added a
// divider to the settings pane; unify them so the comparison still pins
// everything else about each pane.
const unifyPaneWidths = (tree) => JSON.parse(JSON.stringify(tree)
  .split('"width":"45%"').join('"width":"30%"')
  .split('"width":"55%"').join('"width":"36%"')
  .split(',"borderRight":"1px solid rgba(255,255,255,0.1)"').join(''));
// The always-open panel fills the middle column (flex) instead of the old
// 320px cap; normalize those layout props so the comparison pins the rest.
const unifyAdvancedPanel = (node) => {
  if (Array.isArray(node)) return node.map(unifyAdvancedPanel);
  if (node && typeof node === 'object') {
    if (String(node.props?.className ?? '').split(' ').includes('share-image-advanced-panel') && node.props?.style) {
      const { flex, maxHeight, minHeight, ...rest } = node.props.style;
      return { ...node, props: { ...node.props, style: rest }, children: unifyAdvancedPanel(node.children) };
    }
    return { ...node, children: unifyAdvancedPanel(node.children) };
  }
  return node;
};
const assertTrees = (harnesses) => {
  const trees = harnesses.map(h => unifyAdvancedPanel(unifyPaneWidths(unifyRatioAuto(stripNewControls(normalize(h.open()))))));
  const [base, cur] = trees;
  const curKids = modalKids(cur);
  const baseKids = modalKids(base);
  assert.deepEqual(curKids[0], baseKids[0], 'header must match');
  assert.deepEqual(curKids[2], baseKids[2], 'footer must match');
  const curContent = curKids[1];
  const baseContent = baseKids[1];
  assert.deepEqual(
    paneByClass(curContent, 'share-image-modal-selection-pane'),
    paneByClass(baseContent, 'share-image-modal-selection-pane'),
    'lyrics selection pane must match');
  assert.deepEqual(
    withoutPreviewPanel(paneByClass(curContent, 'share-image-modal-config-pane')),
    withoutPreviewPanel(paneByClass(baseContent, 'share-image-modal-config-pane')),
    'settings pane must match');
  return trees;
};

for (const translated of [true, false]) {
  test(`all real image presets preserve the complete modal tree (${translated ? 'translated' : 'fallback'} labels)`, () => {
    const hs = pair({ translated });
    assertTrees(hs);
    hs.forEach(h => h.open());
    for (const template of Object.keys(PRESETS)) {
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
  // Track sliders sit after the legacy cover rows; map legacy indices so
  // each baseline control meets its counterpart.
  const LEGACY_RANGE_INDICES = [0, 1, 2, 3, 4, 9, 10, 11, 12];
  const currentHarness = harness(current);
  currentHarness.open();
  expandAllGroups(currentHarness);
  const currentCount = nodes(byClass(currentHarness.render(), 'share-image-advanced-panel')).filter(node => node.props?.type === 'range').length;
  assert.equal(currentCount, 13);
  for (let index = 0; index < ranges.length; index++) {
    for (const value of ['0', '51.7', '0x10', '-3', 'invalid']) {
      const hs = pair();
      hs[0].open();
      const baselineInputs = nodes(byClass(hs[0].render(), 'share-image-advanced-panel')).filter(node => node.props?.type === 'range');
      hs[1].open();
      expandAllGroups(hs[1]);
      const currentInputs = nodes(byClass(hs[1].render(), 'share-image-advanced-panel')).filter(node => node.props?.type === 'range');
      baselineInputs[index].props.onChange({ target: { value } });
      currentInputs[LEGACY_RANGE_INDICES[index]].props.onChange({ target: { value } });
      assert.deepEqual(hs[1].settings, hs[0].settings);
      assertTrees(hs);
    }
  }
  const hs = pair();
  for (const h of hs) {
    h.open();
    if (h === hs[1]) expandAllGroups(h);
    const inputs = nodes(byClass(h.render(), 'share-image-advanced-panel')).filter(node => node.props?.type === 'range');
    inputs[1].props.onChange({ target: { value: '75' } });
    assert.equal(h.settings.backgroundOpacity, 0.75);
  }
});

test('every checkbox and segmented choice preserves stored values and dependent visibility', () => {
  for (const kind of ['checkbox', 'choice']) {
    const controls = (tree) => nodes(byClass(tree, 'share-image-advanced-panel')).filter(node => kind === 'checkbox'
      // New segmented choices are covered separately below; exclude them
      // here so button indices align with the pre-change baseline.
      ? node.props?.type === 'checkbox' : node.props?.className === 'share-image-segment-btn'
        && node.props?.key !== 'line' && node.props?.key !== 'word'
        && node.props?.key !== 'default' && node.props?.key !== 'settings' && node.props?.key !== 'custom'
        && node.props?.key !== 'right'
        && !/^[123]x$/.test(String((Array.isArray(node.children) ? node.children.flat(Infinity) : []).find((child) => typeof child === 'string') ?? ''))
        && !/^[4567]00$/.test(String(node.props?.key ?? '')));
    const initial = harness(baseline);
    const count = controls(initial.open()).length;
    assert.equal(count, kind === 'checkbox' ? 5 : 11);
    for (let index = 0; index < count; index++) {
      const hs = pair();
      for (const h of hs) {
        h.open();
        expandAllGroups(h);
        const control = controls(h.render())[index];
        if (kind === 'checkbox') control.props.onChange({ target: { checked: false } });
        else control.props.onClick();
      }
      assert.deepEqual(hs[1].settings, hs[0].settings);
      assertTrees(hs);
    }
  }
  const hs = pair({ custom: { aspectRatio: 1 } });
  for (const h of hs) {
    h.open();
    expandAllGroups(h);
    nodes(h.render()).find(node => node.props?.className === 'share-image-segment-btn' && node.props.key === 'auto').props.onClick();
    assert.equal(h.settings.aspectRatio, null);
  }
  assertTrees(hs);
});

test('lyrics detail toggle stores line/word and activates the matching segment', () => {
  for (const translated of [true, false]) {
    const h = harness(current, { translated });
    h.open();
    expandAllGroups(h);
    const buttons = () => nodes(byClass(h.render(), 'share-image-advanced-panel'))
      .filter(node => node.props?.className === 'share-image-segment-btn' && (node.props?.key === 'line' || node.props?.key === 'word'));
    assert.equal(buttons().length, 2);
    assert.equal(buttons().find(node => node.props.key === 'line').props['data-active'], true);
    buttons().find(node => node.props.key === 'word').props.onClick();
    assert.equal(h.settings.lyricsDetail, 'word');
    assert.equal(buttons().find(node => node.props.key === 'word').props['data-active'], true);
    assert.equal(buttons().find(node => node.props.key === 'line').props['data-active'], false);
    buttons().find(node => node.props.key === 'line').props.onClick();
    assert.equal(h.settings.lyricsDetail, 'line');
  }
});

test('export scale toggle stores 1x/2x/3x and activates the matching segment', () => {
  const h = harness(current, {});
  h.open();
  expandAllGroups(h);
  const buttons = () => nodes(byClass(h.render(), 'share-image-advanced-panel'))
    .filter(node => node.props?.className === 'share-image-segment-btn'
      && /^[123]x$/.test(String((Array.isArray(node.children) ? node.children.flat(Infinity) : []).find((child) => typeof child === 'string') ?? '')));
  assert.equal(buttons().length, 3);
  buttons().find(node => String(node.children.flat(Infinity).find((child) => typeof child === 'string')) === '2x').props.onClick();
  assert.equal(h.settings.exportScale, 2);
  buttons().find(node => String(node.children.flat(Infinity).find((child) => typeof child === 'string')) === '3x').props.onClick();
  assert.equal(h.settings.exportScale, 3);
});

test('per-type colour pickers store values', () => {
  const h = harness(current, {});
  h.open();
  expandAllGroups(h);
  const pickers = () => nodes(byClass(h.render(), 'share-image-advanced-panel')).filter(node => node.props?.type === 'color');
  assert.equal(pickers().length, 5);
  pickers()[0].props.onChange({ target: { value: '#111111' } });
  pickers()[1].props.onChange({ target: { value: '#222222' } });
  pickers()[2].props.onChange({ target: { value: '#123456' } });
  pickers()[3].props.onChange({ target: { value: '#abcdef' } });
  pickers()[4].props.onChange({ target: { value: '#654321' } });
  assert.equal(h.settings.trackTitleColor, '#111111');
  assert.equal(h.settings.trackArtistColor, '#222222');
  assert.equal(h.settings.pronColor, '#123456');
  assert.equal(h.settings.transColor, '#abcdef');
  assert.equal(h.settings.origColor, '#654321');
});

test('per-type weight toggles and size sliders store values', () => {
  const h = harness(current, {});
  h.open();
  expandAllGroups(h);
  const panel = () => byClass(h.render(), 'share-image-advanced-panel');
  const weights = () => nodes(panel()).filter(node => node.props?.className === 'share-image-segment-btn'
    && /^[4567]00$/.test(String(node.props?.key ?? '')));
  assert.equal(weights().length, 20);
  weights()[3].props.onClick();
  assert.equal(h.settings.trackTitleWeight, '700');
  weights()[7].props.onClick();
  assert.equal(h.settings.trackArtistWeight, '700');
  weights()[19].props.onClick();
  assert.equal(h.settings.origWeight, '700');
  weights()[11].props.onClick();
  assert.equal(h.settings.pronWeight, '700');
  assert.equal(h.settings.transWeight, undefined);
  weights()[15].props.onClick();
  assert.equal(h.settings.transWeight, '700');
  const sliders = () => nodes(panel()).filter(node => node.props?.type === 'range');
  assert.equal(sliders().length, 13);
  sliders()[5].props.onChange({ target: { value: '30' } });
  assert.equal(h.settings.trackTitleSize, 30);
  sliders()[6].props.onChange({ target: { value: '24' } });
  assert.equal(h.settings.trackArtistSize, 24);
  sliders()[7].props.onChange({ target: { value: '25' } });
  assert.equal(h.settings.pronSize, 25);
  sliders()[8].props.onChange({ target: { value: '26' } });
  assert.equal(h.settings.transSize, 26);
});

test('font source and right alignment store values', () => {
  const h = harness(current, {});
  h.open();
  expandAllGroups(h);
  const panel = () => byClass(h.render(), 'share-image-advanced-panel');
  const fontButtons = () => nodes(panel()).filter(node => node.props?.className === 'share-image-segment-btn'
    && ['default', 'settings', 'custom'].includes(node.props?.key));
  assert.equal(fontButtons().length, 3);
  fontButtons().find(node => node.props.key === 'settings').props.onClick();
  assert.equal(h.settings.fontSource, 'settings');
  fontButtons().find(node => node.props.key === 'custom').props.onClick();
  assert.equal(h.settings.fontSource, 'custom');
  const alignButtons = () => {
    const fields = nodes(panel()).filter((node) => node.props?.style?.gridColumn === 'span 2');
    const alignField = fields.find((field) => nodes(field).some((node) => node.type === 'label'
      && (Array.isArray(node.children) ? node.children.flat(Infinity) : [])
        .some((text) => typeof text === 'string' && /lyricsAlign|가사 정렬|Lyrics Alignment/.test(text))));
    return nodes(alignField).filter((node) => node.props?.className === 'share-image-segment-btn');
  };
  assert.equal(alignButtons().length, 3);
  alignButtons().find(node => node.props.key === 'right').props.onClick();
  assert.equal(h.settings.lyricsAlign, 'right');
});

test('preview lives in its own right-hand pane', () => {
  const h = harness(current, {});
  const content = paneByClass(h.render(), 'share-image-modal-content');
  const panes = modalKids(content);
  assert.deepEqual(panes.map((pane) => pane.props?.className), [
    'share-image-modal-selection-pane',
    'share-image-modal-config-pane',
    'share-image-preview-pane',
  ]);
  assert.deepEqual(panes.map((pane) => pane.props?.style?.width), ['30%', '36%', '34%']);
  assert.ok(!nodes(panes[1]).some((node) => node.props?.className === 'share-image-preview-panel'),
    'settings pane must not embed the preview');
  assert.ok(paneByClass(panes[2], 'share-image-preview-panel'), 'preview pane must host the preview');
  assert.ok(paneByClass(panes[2], 'share-image-preview-label'), 'preview pane must be labelled');
});

test('word gloss slider appears only in word mode and stores values', () => {
  const line = harness(current, {});
  line.open();
  expandAllGroups(line);
  const lineSliders = nodes(byClass(line.render(), 'share-image-advanced-panel')).filter((node) => node.props?.type === 'range');
  assert.equal(lineSliders.length, 13);
  const word = harness(current, { custom: { lyricsDetail: 'word' } });
  word.open();
  expandAllGroups(word);
  const wordSliders = nodes(byClass(word.render(), 'share-image-advanced-panel')).filter((node) => node.props?.type === 'range');
  assert.equal(wordSliders.length, 14);
  wordSliders[7].props.onChange({ target: { value: '24' } });
  assert.equal(word.settings.wordReadingSize, 24);
  wordSliders[8].props.onChange({ target: { value: '30' } });
  assert.equal(word.settings.wordGlossSize, 30);
});

test('lyrics controls render flat with mode-relevant rows', () => {
  const groupNodes = (h) => nodes(byClass(h.render(), 'share-image-advanced-panel'))
    .filter((node) => String(node.props?.className ?? '').split(' ').includes('share-image-style-group'));
  assert.equal(groupNodes(harness(current, {})).length, 0, 'no collapsible wrappers');
  assert.equal(groupNodes(harness(current, { custom: { lyricsDetail: 'word' } })).length, 0);
  const rowLabels = (h) => nodes(byClass(h.render(), 'share-image-advanced-panel'))
    .filter((node) => node.type === 'label')
    .flatMap((node) => (Array.isArray(node.children) ? node.children.flat(Infinity) : []))
    .filter((text) => typeof text === 'string');
  const lineLabels = rowLabels(harness(current, {}));
  assert.ok(!lineLabels.some((text) => /문자 발음|문자 번역|wordReadingSize|wordGlossSize/.test(text)), 'word rows hidden in line mode');
  const wordLabels = rowLabels(harness(current, { custom: { lyricsDetail: 'word' } }));
  assert.ok(wordLabels.some((text) => /문자 발음|wordReadingSize/.test(text)), 'word reading row shown in word mode');
  assert.ok(wordLabels.some((text) => /문자 번역|단어 번역|wordGlossSize/.test(text)), 'word gloss row shown in word mode');
});

test('custom font input appears only for the custom source and stores values', () => {
  const def = harness(current, {});
  def.open();
  const defInputs = () => nodes(byClass(def.render(), 'share-image-advanced-panel')).filter((node) => node.props?.type === 'text');
  assert.equal(defInputs().length, 0);
  const custom = harness(current, { custom: { fontSource: 'custom' } });
  custom.open();
  expandAllGroups(custom);
  const customInputs = () => nodes(byClass(custom.render(), 'share-image-advanced-panel')).filter((node) => node.props?.type === 'text');
  assert.equal(customInputs().length, 1);
  customInputs()[0].props.onChange({ target: { value: 'MyFont' } });
  assert.equal(custom.settings.customFontFamily, 'MyFont');
});

test('export uses the selected lyrics and confirms before copy, download or share', async () => {
  for (const action of ['copy', 'download', 'share']) {
    const calls = [], outputs = [];
    const blob = { type: 'image/png' };
    const dataUrl = 'data:image/png;base64,test';
    const h = harness(current, {
      canShare: true,
      onClose: () => calls.push(['closed']),
      notify: (...args) => calls.push(args),
      image: {
        generateImage: async options => {
          assert.equal(options.width, undefined);
          assert.equal(options.template, 'cover');
          assert.equal(options.trackName, 'Song');
          assert.equal(options.artistName, 'Artist');
          assert.equal(options.lyrics[0].originalText, 'Song line');
          assert.equal(options.lyrics[0].pronText, 'Pronunciation');
          assert.equal(options.lyrics[0].transText, 'Translation');
          outputs.push(options.output);
          return { blob, dataUrl };
        },
        copyToClipboard: async value => { calls.push(['copy', value]); return true; },
        download: (...args) => calls.push(['download', ...args]),
        share: async (...args) => { calls.push(['share', ...args]); return false; },
      },
    });
    const button = key => nodes(h.render()).find(node => node.type === 'button' && node.children.includes(`translated:${key}`));
    assert.equal(button(`shareImage.actions.${action}`).props.disabled, true);
    byClass(h.render(), 'share-image-modal-lyric-line').props.onClick();
    button(`shareImage.actions.${action}`).props.onClick();
    assert.deepEqual(outputs, [], 'image generation waits until copyright confirmation');
    await byClass(h.render(), 'share-image-copyright-confirm').props.onClick();
    if (action === 'copy') {
      assert.deepEqual(outputs, ['blob']);
      assert.deepEqual(calls, [['copy', blob], ['success', 'notifications.shareImageCopied'], ['closed']]);
    } else {
      assert.deepEqual(outputs, action === 'share' ? ['blob'] : ['dataUrl']);
      assert.deepEqual(calls, [
        ...(action === 'share' ? [['share', blob, 'Song', 'Artist', { rejectOnCancel: true }]] : []),
        ['download', dataUrl, 'Song - Artist.png'], ['success', 'notifications.shareImageDownloaded'], ['closed'],
      ]);
    }
  }
});

test('confirmation and rendering hold the selected lines and preset until export finishes', async () => {
  const generated = Promise.withResolvers();
  const requests = [];
  const h = harness(current, { image: {
    generateImage(options) { requests.push(options); return generated.promise; },
    download() {},
  } });
  const line = () => byClass(h.render(), 'share-image-modal-lyric-line');
  const choosePreset = () => nodes(h.render()).find(node => node.props?.className === 'share-image-chip' && node.props.key === 'minimal');
  const openDownload = () => nodes(h.render()).find(node => node.children.includes('translated:shareImage.actions.download')).props.onClick();
  line().props.onClick();
  openDownload();
  choosePreset().props.onClick();
  line().props.onClick();
  assert.equal(line().props['data-selected'], true);
  assert.equal(choosePreset().props['data-active'], false);

  const exporting = byClass(h.render(), 'share-image-copyright-confirm').props.onClick();
  choosePreset().props.onClick();
  assert.equal(choosePreset().props['data-active'], false);
  assert.equal(requests[0].template, 'cover');
  assert.equal(requests[0].lyrics[0].originalText, 'Song line');
  generated.resolve({ dataUrl: 'data:image/png;base64,ready' });
  await exporting;
});

test('share reuses the visible preview and survives cancellation, fallback, and closing', async () => {
  for (const outcome of ['cancel', 'fallback', 'closed']) {
    let finishShare;
    const calls = [];
    const operation = { current: false };
    let open = true;
    const dataUrl = 'data:image/png;base64,preview';
    const blob = { type: 'image/png' };
    const shareStarted = Promise.withResolvers();
    const { executeShare, executeDownload } = createShareImageExportActions({
      image: {
        generateImage: async () => assert.fail('the preview should be reused'),
        share: value => {
          assert.equal(value, blob);
          return new Promise((resolve, reject) => {
            finishShare = outcome === 'cancel' ? () => reject(new DOMException('Cancelled', 'AbortError')) : () => resolve(false);
            shareStarted.resolve();
          });
        },
        download: (...args) => calls.push(['download', ...args]),
      },
      selection: { trackInfo: { name: 'Song', artist: 'Artist' } },
      operation,
      isOpen: () => open,
      getRenderedPreview: () => ({ dataUrl, canvas: { toBlob: callback => callback(blob) } }),
      notify: (...args) => calls.push(args),
      onClose: () => calls.push(['close']),
      setIsGenerating: value => calls.push(['busy', value]),
    });
    const pending = executeShare();
    await shareStarted.promise;
    await executeDownload();
    assert.deepEqual(calls, [['busy', true]]);
    if (outcome === 'closed') open = false;
    finishShare();
    await pending;
    assert.equal(operation.current, false);
    assert.deepEqual(calls, outcome === 'fallback' ? [
      ['busy', true], ['download', dataUrl, 'Song - Artist.png'],
      ['success', 'notifications.shareImageDownloaded'], ['busy', false], ['close'],
    ] : outcome === 'cancel' ? [['busy', true], ['busy', false]] : [['busy', true]]);
  }
});
