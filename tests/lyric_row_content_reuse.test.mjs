import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const repo = new URL('../', import.meta.url);
const current = readFileSync(new URL('Pages.js', repo), 'utf8');
const baseline = execFileSync('git', ['show', '3353a5d:Pages.js'], { cwd: repo, encoding: 'utf8' });
const plain = value => JSON.parse(JSON.stringify(value, (_, entry) =>
  typeof entry === 'function' ? { callback: entry.copyArguments || 'handler' } : entry));

function renderer(source) {
  const slots = [];
  let cursor = 0;
  const memo = (make, dependencies) => {
    const index = cursor++;
    const previous = slots[index];
    if (previous && previous.dependencies.length === dependencies.length &&
      dependencies.every((value, offset) => Object.is(value, previous.dependencies[offset]))) return previous.value;
    const value = make();
    slots[index] = { value, dependencies };
    return value;
  };
  const counts = { copy: 0, html: 0, elements: 0 };
  const context = vm.createContext({
    CONFIG: { visual: { 'inactive-color': '#999' } },
    react: { memo: fn => fn, createElement: (type, props, ...children) => {
      counts.elements++;
      return { type, props, children };
    } },
    useMemo: memo, useCallback: (fn, deps) => memo(() => fn, deps),
    normalizeDisplayedCulturalAnnotations: notes => notes || [],
    getRubySourceText: text => text,
    getCulturalMarkerRawOffset: text => text.length,
    getCulturalMarkerHTML: marker => `<sup>${marker}</sup>`,
    hasKaraokeVocalRows: line => !!line.vocals?.background?.length,
    getInterludeInfo: () => ({ isInterlude: false }),
    InterludeIndicator: 'InterludeIndicator',
    renderLyricMainContent: props => ({ type: 'main', props }),
    createCopyHandler: (...args) => Object.assign(() => {}, { copyArguments: args }),
    Utils: {
      formatLyricLineToCopy: (...args) => { counts.copy++; return JSON.stringify(args); },
      rubyTextToHTML: text => { counts.html++; return text; },
    },
  });
  const part = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
  vm.runInContext(part('const renderAnnotatedLyricHTML', 'const renderLyricMainContent') +
    part('const LyricsLineBlock =', 'const renderLyricsItems') + ';globalThis.render=LyricsLineBlock;', context);
  return { context, counts, render(props) { cursor = 0; return context.render(props); } };
}

test('row movement reuses text and supplements while preserving baseline DOM, copy and accessibility props', () => {
  for (const isKara of [false, true]) for (const singleLineScroll of [false, true]) {
    const old = renderer(baseline), next = renderer(current);
    const line = { text: '日本語', interludeInfo: { isInterlude: false } };
    const props = { line, mainText: line.text, subText: 'nihongo', subText2: '일본어',
      isKara, singleLineScroll, seekTime: 1500, culturalNote: [{ marker: 1, expression: '日本語', note: 'Japanese' }] };
    let last;
    for (let frame = 0; frame < 60; frame++) {
      const input = { ...props, className: `line row-${frame}`, style: { '--position-index': 30 - frame } };
      const result = next.render(input);
      assert.deepEqual(plain(result), plain(old.render(input)));
      if (last) result.children.forEach((child, index) => assert.equal(child, last.children[index]));
      last = result;
    }
    assert.equal(next.counts.copy, 1);
    assert.equal(old.counts.copy, 60);
    assert.equal(next.counts.html * 60, old.counts.html);
    assert.equal(last.props.role, 'button');
  }
});

test('text, copy, annotations, settings, interludes and vocal rows invalidate only when needed', () => {
  const old = renderer(baseline), next = renderer(current);
  let props = { mainText: 'Original', subText: 'Reading', subText2: 'Translation', seekTime: 500, isKara: false };
  const changes = [
    { subText: 'New reading', subCopyText: 'Copied reading' },
    { mainText: '<ruby>漢<rt>かん</rt></ruby>', originalText: 'Original copy' },
    { singleLineScroll: true },
    { culturalNote: [{ marker: 2, expression: 'Translation', note: 'Meaning' }] },
    { settingsRevision: 1 },
    { hiddenFromAccessibility: true },
    { isKara: true, position: 1800, isActive: true },
    { line: { text: 'Voices', vocals: { background: [{}] }, interludeInfo: { isInterlude: false } } },
    { line: { interludeInfo: { isInterlude: true, durationMs: 5000 } }, isCurrentLine: true },
    { isCurrentLine: false },
    { line: null, culturalNote: null, mainText: 'New song', isKara: false },
  ];
  for (const change of changes) {
    props = { ...props, ...change };
    if (change.settingsRevision) for (const renderer of [old, next]) renderer.context.CONFIG.visual['inactive-color'] = '#123456';
    assert.deepEqual(plain(next.render(props)), plain(old.render(props)));
  }
});

test('a settings revision refreshes vocal row detection after an in-place metadata edit', () => {
  const old = renderer(baseline), next = renderer(current);
  const line = { text: 'Voices', vocals: { background: [] }, interludeInfo: { isInterlude: false } };
  const props = { line, mainText: line.text, subText: 'Reading', subText2: 'Translation', isKara: true };
  assert.deepEqual(plain(next.render(props)), plain(old.render(props)));
  line.vocals.background.push({ text: 'Background voice' });
  assert.deepEqual(plain(next.render({ ...props, settingsRevision: 1 })),
    plain(old.render({ ...props, settingsRevision: 1 })));
  line.vocals.background.length = 0;
  assert.deepEqual(plain(next.render({ ...props, settingsRevision: 2 })),
    plain(old.render({ ...props, settingsRevision: 2 })));
});
