import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildSyncCreatorPreviewCharReadings as buildReadings,
  getSyncCreatorPreviewFuriganaMap as furigana,
} from '#ivlyrics/features/sync/syncCreatorPreviewReadings.mjs';

const mapIn = entries => new Map(entries);
const plain = (map) => (map ? JSON.parse(JSON.stringify([...map.entries()])) : null);

test('per-char readings keyed by glyph index, no shift', () => {
  const chars = Array.from('愛してどうして');
  const pronMap = mapIn([[0, 'あい'], [1, 'し'], [2, 'て'], [3, 'ど'], [4, 'う'], [5, 'し'], [6, 'て']]);
  assert.deepEqual(plain(buildReadings(chars, pronMap, [], 32)), [
    [0, { text: 'あい', dx: 0 }], [1, { text: 'し', dx: 0 }], [2, { text: 'て', dx: 0 }],
    [3, { text: 'ど', dx: 0 }], [4, { text: 'う', dx: 0 }], [5, { text: 'し', dx: 0 }], [6, { text: 'て', dx: 0 }],
  ]);
});

test('even-width unit shifts right by half a glyph, covered members stay blank', () => {
  const chars = Array.from('思いも');
  const pronMap = mapIn([[0, 'おも'], [1, 'い'], [2, 'も']]);
  const units = [{ start: 0, end: 1, pronunciation: 'おもい' }];
  assert.deepEqual(plain(buildReadings(chars, pronMap, units, 32)), [
    [0, { text: 'おもい', dx: 16 }], [2, { text: 'も', dx: 0 }],
  ]);
});

test('odd-width unit needs no shift', () => {
  const chars = Array.from('違った');
  const units = [{ start: 0, end: 2, pronunciation: 'chigat' }];
  assert.deepEqual(plain(buildReadings(chars, mapIn([]), units, 32)), [[1, { text: 'chigat', dx: 0 }]]);
});

test('returns null without readings', () => {
  assert.equal(buildReadings(['a'], mapIn([]), [], 32), null);
  assert.equal(buildReadings([], mapIn([]), [], 32), null);
});

test('cached empty furigana refreshes when converter readiness, revision or builder changes', () => {
  const cache = { maps: new Map() };
  let ready = false, calls = 0;
  const build = () => { calls++; return new Map(ready ? [[0, 'かん']] : []); };
  assert.equal(furigana(cache, '漢字', build, 0, false), null);
  ready = true;
  assert.equal(furigana(cache, '漢字', build, 0, false), null, 'unchanged dependencies reuse a negative result');
  assert.equal(calls, 1);
  assert.equal(furigana(cache, '漢字', build, 0, true).get(0), 'かん');
  assert.equal(calls, 2);
  furigana(cache, '漢字', build, 1, true);
  assert.equal(calls, 3);
  const replacement = () => new Map([[0, 'new converter']]);
  assert.equal(furigana(cache, '漢字', replacement, 1, true).get(0), 'new converter');
});

test('furigana cache retains only the latest forty row texts', () => {
  const cache = { maps: new Map() }, build = text => new Map([[0, text]]);
  for (let index = 0; index < 50; index++) furigana(cache, `row-${index}`, build, 0, true);
  assert.equal(cache.maps.size, 40);
  assert.equal(cache.maps.has('row-0'), false);
  assert.equal(cache.maps.has('row-49'), true);
});
