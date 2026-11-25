import { createKaraokeHarnessFactory } from "./fixtures/karaoke-page-modules.mjs";
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { KaraokeWordTiming } from '../src/lyrics/karaokeWordTiming.mjs';

const url = new URL('./karaoke_static_render_cache.test.mjs', import.meta.url);
const source = readFileSync(url, 'utf8');
const harness = source.slice(source.indexOf('const currentSource ='), source.indexOf("test('vocal presence"))
  .replaceAll('import.meta.url', JSON.stringify(url.href))
  .replace('getKaraokeVocalRows };', 'getKaraokeVocalRows, syncKaraokeLiveEntry, paintKaraokeLiveEntry, classifyKaraokeExpressiveUnits };');
const { createHarness } = createKaraokeHarnessFactory('assert', 'execFileSync', 'readFileSync', 'vm', 'KaraokeWordTiming',
  harness + '\nreturn { createHarness };')(assert, execFileSync, readFileSync, vm, KaraokeWordTiming);
const element = key => {
  const values = new Map();
  return { values, getAttribute: () => key, style: {
    setProperty: (name, value) => values.set(name, value), removeProperty: name => values.delete(name),
  } };
};
const fixture = (shaped = false) => {
  const h = createHarness(undefined, { visual: { 'karaoke-motion-style': 'expressive' } });
  const timedChars = Array.from('Hello', (char, index) => ({ char, startTime: 1000 + index * 120, endTime: 1120 + index * 120 }));
  const data = { timedChars, wordTimed: false, expressive: true, motionProfiles: [],
    expressiveUnits: h.context.api.classifyKaraokeExpressiveUnits(timedChars),
    segmentsByStart: shaped ? new Map([[0, { text: 'Hello', charCount: 5, startTime: 1000, endTime: 1600 }]]) : null };
  const key = shaped ? 's:0' : 'w:0:5';
  const nodes = [element(key)], root = { querySelectorAll: () => nodes };
  const entry = { units: new Map(), data: null, lastPosition: NaN };
  let position = 1100;
  const clock = { getPosition: () => position };
  const sync = next => h.context.api.syncKaraokeLiveEntry(entry, root, clock, null, next);
  const paint = time => h.context.api.paintKaraokeLiveEntry(entry, time);
  sync(data); paint(0); position = 1350; paint(250);
  assert.ok(nodes[0].values.has('--karaoke-bounce-scale'));
  return { data, entry, key, nodes, sync, paint };
};

test('equivalent regenerated timing retains the moving spring and paused pose', () => {
  const f = fixture(), unit = f.entry.units.get(f.key), pose = [...f.nodes[0].values];
  f.sync({ ...f.data, timedChars: f.data.timedChars.map(char => ({ ...char })) });
  f.paint(300);
  assert.equal(f.entry.units.get(f.key), unit);
  assert.deepEqual([...f.nodes[0].values], pose);
});

test('a reading/ruby DOM rebind preserves velocity and paints the same pose on the new element', () => {
  const f = fixture(), unit = f.entry.units.get(f.key), old = f.nodes[0], pose = [...old.values];
  f.nodes[0] = element(f.key);
  f.sync({ ...f.data }); f.paint(300);
  assert.equal(f.entry.units.get(f.key), unit);
  assert.deepEqual([...f.nodes[0].values], pose);
  assert.equal(old.values.size, 0, 'detached elements do not retain painter-owned properties');
});

test('real source text edits invalidate a motion unit with otherwise equal timing', () => {
  const f = fixture(), unit = f.entry.units.get(f.key);
  f.sync({ ...f.data, timedChars: f.data.timedChars.map((char, index) => ({ ...char, char: index === 0 ? 'Y' : char.char })) });
  assert.notEqual(f.entry.units.get(f.key), unit);
});

test('real timing edits invalidate a motion unit instead of retaining stale motion', () => {
  const f = fixture(), unit = f.entry.units.get(f.key);
  f.sync({ ...f.data, timedChars: f.data.timedChars.map(char => ({ ...char, endTime: char.endTime + 50 })) });
  assert.notEqual(f.entry.units.get(f.key), unit);
});

test('shaped-run shortening invalidates motion even when the glyph array and timing window are shared', () => {
  const f = fixture(true), unit = f.entry.units.get(f.key);
  f.sync({ ...f.data, segmentsByStart: new Map([[0, { ...f.data.segmentsByStart.get(0), text: 'Hell', charCount: 4 }]]) });
  assert.notEqual(f.entry.units.get(f.key), unit);
});

test('prepared and padded rows reuse unchanged source nodes while neighboring layout updates remain live', () => {
  const pages = readFileSync(new URL('../src/lyrics/Pages.js', import.meta.url), 'utf8');
  const start = pages.indexOf('const buildPreparedSyncedLyrics =');
  const end = pages.indexOf('const buildSyncedLinePlaybackWindows', start);
  let preparations = 0;
  const c = vm.createContext({ emptyLine: {}, getEmbeddedAuxiliaryDisplayValues: line => ({ originalText: line.text }),
    buildLyricDisplayState: () => { preparations++; return {}; }, getInterludeInfo: () => ({ isInterlude: false }) });
  vm.runInContext(pages.slice(start, end) + '\nglobalThis.api={buildPreparedSyncedLyrics,buildPaddedSyncedLyrics};', c);
  const cache = new WeakMap(), paddedCache = new WeakMap();
  const lyrics = Array.from({ length: 5 }, (_, index) => ({ text: 'source ' + index }));
  const before = c.api.buildPreparedSyncedLyrics(lyrics, true, cache);
  const padded = c.api.buildPaddedSyncedLyrics(before, 2, paddedCache);
  const next = [...lyrics]; next[1] = { ...next[1], text2: 'meaning' };
  const after = c.api.buildPreparedSyncedLyrics(next, true, cache);
  assert.equal(preparations, 7, 'one changed row and its preceding interlude boundary, not all five rows');
  assert.notEqual(after[0], before[0]);
  assert.notEqual(after[1], before[1]);
  assert.equal(after[2], before[2]);
  assert.equal(c.api.buildPaddedSyncedLyrics(after, 2, paddedCache)[4], padded[4]);
});
