import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import vm from 'node:vm';

// Reuse the real engine/settings harness, including its overlap/interlude helpers.
// Frozen source differs only by this optimization pass, so compare all props.
const helperUrl = new URL('./renderer_settings_equivalence.test.mjs', import.meta.url);
const helper = readFileSync(helperUrl, 'utf8');
let harness = helper.slice(helper.indexOf('const repoRoot'), helper.indexOf('test("renderer output'))
  .replaceAll('import.meta.url', JSON.stringify(helperUrl.href))
  .replace('6bb234835b0f5762876bbe521ddf665c8f952dfa', '3353a5d')
  .replace('const comparable = normalizePresentation(output);', 'const comparable = normalize(output);')
  .replace('if (props.compact && !props.isKara && !scrolling && !motionPreference.matches)', 'if (false)')
  .replace('const hooks = [];', 'const hooks = [];\nconst cache = { elementsByItem: new WeakMap() };\nlet creates = 0;')
  .replace('createElement: (tag, props, ...children) => ({ tag, props, children }),',
    'createElement: (tag, props, ...children) => { creates++; return { tag, props, children }; },')
  .replace('CONFIG, window, motionPreference,',
    'CONFIG, window, motionPreference, getCreates: () => creates, resetCreates: () => { creates = 0; },')
  .replace('items: result.renderItems, isKara: props.isKara, position,',
    'items: result.renderItems, isKara: props.isKara, position, cache,');
const { createEngine, currentSource, baselineSource, makeLyrics, lyric } = new Function(
  'assert', 'execFileSync', 'readFileSync', 'fileURLToPath', 'vm', harness +
  '\nreturn { createEngine, currentSource, baselineSource, makeLyrics, lyric };'
)(assert, execFileSync, readFileSync, fileURLToPath, vm);

test('cached row elements exactly preserve every baseline prop across boundaries, seeks and settings', () => {
  for (const compact of [false, true]) for (const bounce of [false, true]) {
    const candidate = createEngine(currentSource);
    const baseline = createEngine(baselineSource);
    for (const engine of [candidate, baseline]) engine.CONFIG.visual['karaoke-bounce'] = bounce;
    let lines = makeLyrics();
    const positions = Array.from({ length: 350 }, (_, frame) => frame * 53);
    positions.push(69.37 * 1000, 8000, 0, 2700, 3100, 3101, 3920, 3400, 3220);
    for (let pass = 0; pass < 5; pass++) {
      for (const engine of [candidate, baseline]) {
        engine.setScrolling(pass === 1);
        engine.CONFIG.visual['karaoke-bounce'] = pass === 2 ? !bounce : bounce;
        engine.CONFIG.visual['lines-before'] = pass === 3 ? 4 : 2;
        engine.CONFIG.visual['lines-after'] = pass === 3 ? 5 : 2;
        engine.CONFIG.visual['translate:display-mode'] = pass === 4 ? 'replace' : 'below';
        engine.motionPreference.matches = pass === 4;
        engine.setLocale(pass === 3 ? 'ja' : 'en');
      }
      if (pass === 3) lines = lines.map(line => ({ ...line, translationText: 'New translation' }));
      const options = { compact, isKara: true, settingsRevision: pass };
      for (const position of positions) assert.deepEqual(candidate.render(lines, position, options),
        baseline.render(lines, position, options), `compact=${compact} bounce=${bounce} pass=${pass} at ${position}`);
    }
  }
});

test('steady playback allocates elements only for live rows and keeps static elements identical', () => {
  const lines = Array.from({ length: 500 }, (_, index) => lyric(index * 1000, (index + 1) * 1000, `Line ${index}`));
  for (const scrolling of [false, true]) {
    const candidate = createEngine(currentSource);
    candidate.setScrolling(scrolling);
    const options = { compact: true, isKara: true };
    const first = candidate.render(lines, 250400, options, true);
    candidate.resetCreates();
    const next = candidate.render(lines, 250416, options, true);
    assert.equal(candidate.getCreates(), 1);
    assert.equal(first.elements.filter((element, index) => element !== next.elements[index]).length, 1);
    candidate.resetCreates();
    const paused = candidate.render(lines, 250416, options, true);
    assert.equal(candidate.getCreates(), 0);
    assert.equal(paused.elements, next.elements);
  }
});

test('time lookup preserves last source index with unordered and simultaneous lyric times', () => {
  const candidate = createEngine(currentSource);
  const baseline = createEngine(baselineSource);
  const times = [8000, 0, 3100, 700, 3100, 4000, 2200, 9000, 1000];
  const lines = times.map((start, index) => lyric(start, start + (index % 3 ? 1700 : 9000), `Voice ${index}`));
  for (const compact of [false, true]) for (const isKara of [false, true]) {
    for (let position = -100; position < 18000; position += 97) assert.deepEqual(
      candidate.render(lines, position, { compact, isKara }), baseline.render(lines, position, { compact, isKara }));
  }
});
