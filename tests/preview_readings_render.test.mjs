import { createKaraokeHarnessFactory } from "./fixtures/karaoke-page-modules.mjs";
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { KaraokeWordTiming } from '../src/lyrics/karaokeWordTiming.mjs';

const harnessUrl = new URL('./karaoke_static_render_cache.test.mjs', import.meta.url);
const fixture = readFileSync(harnessUrl, 'utf8');
const from = fixture.indexOf('const currentSource ='), to = fixture.indexOf("test('vocal presence");
assert.ok(from >= 0 && to > from);
const { createHarness, makeLine } = createKaraokeHarnessFactory('assert', 'execFileSync', 'readFileSync', 'vm', 'KaraokeWordTiming',
  fixture.slice(from, to).replaceAll('import.meta.url', JSON.stringify(harnessUrl.href))
  + '\nreturn { createHarness, makeLine };')(assert, execFileSync, readFileSync, vm, KaraokeWordTiming);
const nodes = (tree, className, result = []) => {
  if (Array.isArray(tree)) tree.forEach(node => nodes(node, className, result));
  else if (tree && typeof tree === 'object') {
    if (tree.props?.className?.split(' ').includes(className)) result.push(tree);
    nodes(tree.children, className, result);
  }
  return result;
};
const textOf = tree => Array.isArray(tree) ? tree.map(textOf).join('')
  : tree && typeof tree === 'object' ? textOf(tree.children) : String(tree ?? '');
const mapIn = (h, entries) => vm.runInContext(`new Map(${JSON.stringify(entries)})`, h.context);
const fillText = tree => nodes(tree, 'lyrics-karaoke-glyph-fill').map(textOf);

for (const [text, locale] of [
  ['مرحبا بالعالم', 'ar'], ['ภาษาไทย สวัสดี', 'th'], ['अच्छा गाना', 'hi'], ['a\u0301 voice', 'en'],
]) {
  test(`${locale}: readings keep the production renderer's contiguous shaping runs intact`, () => {
    const h = createHarness(undefined, { locale }), baseline = createHarness(undefined, { locale });
    const line = makeLine(text);
    const entries = Array.from(text, (_, index) => [index, { text: `r${index}`, dx: 0 }]);
    const rendered = h.render(line, 1200, { charReadings: mapIn(h, entries) });
    const plain = baseline.render(line, 1200);
    const readings = nodes(rendered, 'lyrics-karaoke-run-reading');
    assert.equal(nodes(rendered, 'lyrics-karaoke-char-reading').length, 0, 'joining/combining scripts must never be split into glyph DOM');
    assert.ok(nodes(plain, 'lyrics-karaoke-text-run-segment').length > 0);
    assert.equal(nodes(rendered, 'lyrics-karaoke-text-run-segment').length, nodes(plain, 'lyrics-karaoke-text-run-segment').length);
    assert.deepEqual(fillText(rendered), fillText(plain), 'each original shaped text node remains intact');
    assert.ok(readings.length > 0, 'pronunciation must not disappear in text-run mode');
    const words = text.split(' ');
    const secondWordCodePoint = Array.from(words[0]).length + 1;
    assert.ok(readings.some(node => textOf(node).startsWith(`r${secondWordCodePoint}`)), 'code-point indices align after multi-code-point graphemes');
  });
}

test('Japanese glyph readings coexist with ruby and refresh in a paused cached row', () => {
  const h = createHarness(undefined, { locale: 'ja' }), line = makeLine('漢字の歌');
  const furigana = mapIn(h, [[0, 'かん']]);
  const first = h.render(line, 1200, { furiganaMapOverride: furigana, charReadings: mapIn(h, [[0, { text: 'kan', dx: 16 }]]) });
  const second = h.render(line, 1200, { furiganaMapOverride: furigana, charReadings: mapIn(h, [[0, { text: 'new', dx: 0 }]]) });
  assert.equal(nodes(first, 'lyrics-karaoke-char-reading')[0].props.style.transform, 'translateX(calc(-50% + 16px))');
  assert.equal(textOf(nodes(first, 'lyrics-karaoke-char-reading')[0]), 'kan');
  assert.equal(textOf(nodes(second, 'lyrics-karaoke-char-reading')[0]), 'new');
  assert.equal(nodes(second, 'lyrics-karaoke-ruby').length, 1);
  assert.deepEqual(fillText(first), fillText(second));
});

test('shaped run cache refreshes readings at a fixed paused position', () => {
  const h = createHarness(undefined, { locale: 'ar' }), line = makeLine('مرحبا');
  const first = h.render(line, 1200, { charReadings: mapIn(h, [[0, 'first']]) });
  const second = h.render(line, 1200, { charReadings: mapIn(h, [[0, 'second']]) });
  assert.equal(textOf(nodes(first, 'lyrics-karaoke-run-reading')[0]), 'first');
  assert.equal(textOf(nodes(second, 'lyrics-karaoke-run-reading')[0]), 'second');
  assert.deepEqual(fillText(first), fillText(second));
});
