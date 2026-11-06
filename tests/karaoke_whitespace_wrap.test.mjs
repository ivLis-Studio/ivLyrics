import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const url = new URL('./karaoke_static_render_cache.test.mjs', import.meta.url);
const source = readFileSync(url, 'utf8');
const harness = source.slice(source.indexOf('const currentSource ='), source.indexOf("test('vocal presence"))
  .replaceAll('import.meta.url', JSON.stringify(url.href))
  .replace('const tree = resolve(component(props), path);',
    'window.lastRawTree = component(props); const tree = resolve(window.lastRawTree, path);');
const { createHarness } = new Function('assert', 'execFileSync', 'readFileSync', 'vm',
  harness + '\nreturn { createHarness };')(assert, execFileSync, readFileSync, vm);
const nodes = (tree, name) => {
  if (Array.isArray(tree)) return tree.flatMap(child => nodes(child, name));
  if (!tree || typeof tree !== 'object') return [];
  return [...(tree.props?.className?.split(' ').includes(name) ? [tree] : []), ...nodes(tree.children, name)];
};
const textOf = tree => Array.isArray(tree) ? tree.map(textOf).join('')
  : tree && typeof tree === 'object' ? textOf(tree.children) : String(tree ?? '');
const makeLine = text => ({ text, startTime: 1000, endTime: 9000, karaokeGranularity: 'word',
  syllables: Array.from(text, (text, i) => ({ text, startTime: 1000 + i * 150, endTime: 1150 + i * 150 })) });
const texts = [
  ['ko', '안녕하세요 반갑습니다 만나서반갑습니다정말반갑습니다'],
  ['ja', 'こんにちは お会いできて 嬉しいですまた明日も歩きましょう'],
  ['zh', '你好世界 很高兴见到你 希望我们能够一直一起走下去'],
];

for (const [locale, text] of texts) test(`${locale}: spaces own wrapping while native word fill keeps every source unit`, () => {
  const h = createHarness(undefined, { locale });
  const line = makeLine(text);
  const shapes = [];
  for (const [position, isActive] of [[0, false], [1400, true], [99999, false], [0, false]]) {
    const tree = h.render(line, position, { renderGranularity: 'word', isActive, isEffectFocused: isActive });
    const groups = nodes(tree, 'lyrics-karaoke-wrap-group');
    assert.deepEqual(groups.map(textOf), text.split(' '));
    const glyphs = nodes(tree, 'lyrics-karaoke-glyph-fill');
    assert.equal(glyphs.map(textOf).join(''), text);
    assert.equal(nodes(tree, 'is-word-timed').length, 1 + Array.from(text.replace(/\s/g, '')).length,
      'each source unit keeps its own word-timing wrapper');
    shapes.push(groups.map(group => nodes(group, 'lyrics-karaoke-glyph-fill').map(textOf)));
  }
  shapes.slice(1).forEach(shape => assert.deepEqual(shape, shapes[0], 'focus and completion keep the same wrap groups'));
});

test('character, expressive, full-width-space and shaped CJK paths preserve complete tokens and paint identity', () => {
  for (const [locale, base] of texts) for (const renderGranularity of ['word', 'character']) {
    for (const text of [base.replace(/ /g, '　'), base + ' cafe\u0301']) {
      const h = createHarness(undefined, { locale, visual: { 'karaoke-motion-style': 'expressive' } });
      const line = makeLine(text);
      const props = { renderGranularity };
      const first = h.render(line, 1400, props);
      const firstRaw = h.window.lastRawTree;
      assert.equal(textOf(first), text, 'shaped runs retain their separate whitespace nodes');
      for (const group of nodes(first, 'lyrics-karaoke-wrap-group')) assert.equal(/\s/u.test(textOf(group)), false);
      h.render(line, 1400, props);
      nodes(firstRaw, 'lyrics-karaoke-wrap-group').forEach((group, i) =>
        assert.equal(nodes(h.window.lastRawTree, 'lyrics-karaoke-wrap-group')[i], group, 'unchanged wrapper output is reused'));
    }
  }
});

test('unspaced CJK and non-CJK keep their existing break opportunities', () => {
  for (const text of [texts[0][1].replace(/ /g, ''), 'Native word timing stays intact']) {
    const h = createHarness();
    const tree = h.render(makeLine(text), 1400, { renderGranularity: 'word' });
    assert.equal(nodes(tree, 'lyrics-karaoke-wrap-group').length, 0);
    assert.equal(nodes(tree, 'lyrics-karaoke-glyph-fill').map(textOf).join(''), text);
  }
});
