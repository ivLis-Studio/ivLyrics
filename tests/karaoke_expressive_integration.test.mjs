import { createKaraokeHarnessFactory } from "./fixtures/karaoke-page-modules.mjs";
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { KaraokeWordTiming } from '../src/lyrics/karaokeWordTiming.mjs';

// Compare against the exact reviewed #126 integration, including its readings.
const baseline = execFileSync('git', ['show', 'c6613feb3bad1be8752ea741276d8919e86879b9:Pages.js'], {
  cwd: new URL('..', import.meta.url), encoding: 'utf8',
});
const harnessUrl = new URL('./karaoke_static_render_cache.test.mjs', import.meta.url);
const fixture = readFileSync(harnessUrl, 'utf8');
const from = fixture.indexOf('const currentSource ='), to = fixture.indexOf("test('vocal presence");
assert.ok(from >= 0 && to > from);
const { createHarness, makeLine } = createKaraokeHarnessFactory('assert', 'execFileSync', 'readFileSync', 'vm', 'KaraokeWordTiming',
  fixture.slice(from, to).replaceAll('import.meta.url', JSON.stringify(harnessUrl.href))
    .replace('getKaraokeVocalRows };', 'getKaraokeVocalRows, getKaraokeExpressiveMotion, syncKaraokeLiveEntry, paintKaraokeLiveEntry };')
  + '\nreturn { createHarness, makeLine };')(assert, execFileSync, readFileSync, vm, KaraokeWordTiming);

// The baseline predates the expressive exports; use its original harness.
const { createHarness: baselineHarness } = createKaraokeHarnessFactory('assert', 'execFileSync', 'readFileSync', 'vm', 'KaraokeWordTiming',
  fixture.slice(from, to).replaceAll('import.meta.url', JSON.stringify(harnessUrl.href))
  + '\nreturn { createHarness };')(assert, execFileSync, readFileSync, vm, KaraokeWordTiming);
const nodes = (tree, name, found = []) => {
  if (Array.isArray(tree)) tree.forEach(child => nodes(child, name, found));
  else if (tree && typeof tree === 'object') {
    if (tree.props?.className?.split(' ').includes(name)) found.push(tree);
    nodes(tree.children, name, found);
  }
  return found;
};
const textOf = tree => Array.isArray(tree) ? tree.map(textOf).join('')
  : tree && typeof tree === 'object' ? textOf(tree.children) : String(tree ?? '');
const fills = tree => nodes(tree, 'lyrics-karaoke-glyph-fill').map(textOf);
const plain = value => JSON.parse(JSON.stringify(value));
const mapIn = (h, entries) => vm.runInContext(`new Map(${JSON.stringify(entries)})`, h.context);
const expressive = (locale = 'en') => {
  const h = createHarness(undefined, { locale, visual: { 'karaoke-motion-style': 'expressive' } });
  let now = 1000;
  h.context.performance = { now: () => now };
  h.advance = ms => { now += ms; };
  return h;
};

test('Classic and unset styles retain the exact reviewed #126 tree, readings, ruby and vocal anchors', () => {
  for (const style of [undefined, 'classic']) for (const locale of ['en', 'ja', 'ar', 'th', 'hi']) {
    const current = createHarness(undefined, { locale, visual: { 'karaoke-motion-style': style } });
    const previous = baselineHarness(baseline, { locale });
    for (const granularity of ['character', 'word']) for (const line of [
      makeLine('Hello'), makeLine('Hello styled voice', 4, true), makeLine('漢字の歌'),
      makeLine('مرحبا بالعالم'), makeLine('ภาษาไทย สวัสดี'), makeLine('अच्छा गाना'), makeLine('a\u0301longword voice'),
    ]) {
      const props = h => ({
        renderGranularity: granularity,
        charReadings: mapIn(h, [[0, { text: 'reading', dx: 12 }]]),
        furiganaMapOverride: mapIn(h, [[0, 'ruby']]),
      });
      const currentProps = props(current), previousProps = props(previous);
      for (const position of [0, 1000, 1080, 1500, 2800, 6000, 1200]) {
        assert.deepEqual(plain(current.render(line, position, currentProps)),
          plain(previous.render(line, position, previousProps)), `${style}/${locale}/${granularity}/${line.text}/${position}`);
      }
    }
  }
});

test('Expressive retains shaped text nodes, source fill timing, range indices and editor readings', () => {
  for (const [text, locale] of [
    ['Gooo\u0301oooosey voice', 'en'], ['مرحبا بالعالم', 'ar'],
    ['ภาษาไทย สวัสดี', 'th'], ['अच्छा गाना', 'hi'],
  ]) for (const live of [false, true]) {
    const current = expressive(locale), classic = createHarness(undefined, { locale });
    const line = makeLine(text);
    const props = h => ({
      charReadings: mapIn(h, [[0, { text: 'first reading', dx: 0 }], [Array.from(text.split(' ')[0]).length + 1, 'second reading']]),
      ...(live ? { liveClock: { getPosition: () => NaN } } : {}),
    });
    const currentProps = props(current), classicProps = props(classic);
    for (const position of [900, 1200, 1700, 4000, 1250]) {
      current.advance(16);
      const rendered = current.render(line, position, currentProps), expected = classic.render(line, position, classicProps);
      assert.deepEqual(fills(rendered), fills(expected), `${locale}: shaped nodes must remain intact`);
      assert.deepEqual(nodes(rendered, 'lyrics-karaoke-run-reading').map(textOf),
        nodes(expected, 'lyrics-karaoke-run-reading').map(textOf), `${locale}: #126 readings must survive`);
      const timing = tree => nodes(tree, 'lyrics-karaoke-text-run-segment').map(node => ({
        fill: node.props.style['--karaoke-char-fill'],
        range: node.props.style['--ivlyrics-range-index'], dir: node.props.dir,
        state: node.props.className.match(/segment--(pending|active|done)/)?.[1],
      }));
      assert.deepEqual(timing(rendered), timing(expected), `${locale}: source fill and selection ranges are unchanged`);
    }
  }
});

test('Expressive preserves existing wrapper and line-break opportunities on unspaced lines', () => {
  for (const text of ['Hello', 'Yo', '...', '漢字Hello', 'Hello long words']) {
    const current = expressive(), classic = createHarness(), line = makeLine(text);
    const rendered = current.render(line, 1080), expected = classic.render(line, 1080);
    assert.deepEqual(fills(rendered), fills(expected));
    assert.equal(nodes(rendered, 'lyrics-karaoke-word').length, nodes(expected, 'lyrics-karaoke-word').length, text);
  }
});

test('paused Expressive word motion freezes across unrelated React commits', () => {
  const h = expressive(), line = makeLine('Hi yo');
  h.render(line, 1000);
  h.advance(80);
  const first = h.render(line, 1080);
  h.advance(120);
  const second = h.render(line, 1080);
  assert.deepEqual(plain(second), plain(first), 'a fixed playback position must not advance the spring');
});

test('backward seeks within an Expressive unit discard the old spring velocity', () => {
  const h = expressive(), motion = h.context.api.getKaraokeExpressiveMotion, key = {};
  motion(key, 1000, 1000, 2000, false, 0);
  motion(key, 1400, 1000, 2000, false, 400);
  assert.deepEqual(plain(motion(key, 1300, 1000, 2000, false, 416)),
    plain(motion({}, 1300, 1000, 2000, false, 416)));
});

const liveFixture = (h, expressive = true) => {
  const values = new Map(), element = {
    getAttribute: () => 'w:0:2',
    style: { setProperty: (key, value) => values.set(key, value), removeProperty: key => values.delete(key) },
  };
  const entry = { units: new Map(), data: null, lastPosition: NaN };
  let position = 1000;
  h.context.api.syncKaraokeLiveEntry(entry, { querySelectorAll: () => [element] }, { getPosition: () => position }, null, {
    timedChars: [{ char: 'H', startTime: 1000, endTime: 1500 }, { char: 'i', startTime: 1500, endTime: 2000 }],
    motionProfiles: [], wordTimed: true, segmentsByStart: null, expressive,
  });
  const paint = (next, time) => { position = next; return h.context.api.paintKaraokeLiveEntry(entry, time); };
  paint(1000, 0); paint(1400, 400);
  assert.ok(Number(values.get('--karaoke-motion-glow')) > 0);
  return { values, paint };
};

for (const [label, update] of [
  ['Bounce', h => { h.CONFIG.visual['karaoke-bounce'] = false; }],
  ['system reduced motion', h => { h.window.reducedMotion = true; }],
  ['application reduced motion', h => { h.CONFIG.visual['reduce-motion'] = true; }],
  ['Classic style', h => { h.CONFIG.visual['karaoke-motion-style'] = 'classic'; }],
]) test(`live Expressive motion clears immediately when changing ${label} while paused`, () => {
  const h = expressive(), live = liveFixture(h);
  update(h);
  live.paint(1400, 416);
  for (const property of ['--karaoke-bounce-y', '--karaoke-bounce-scale', '--karaoke-motion-glow']) {
    assert.equal(live.values.has(property), false, property);
  }
});

test('Text Effects removes live Expressive glow at a fixed clock without removing bounce or fill', () => {
  const h = expressive(), live = liveFixture(h);
  const scale = live.values.get('--karaoke-bounce-scale');
  h.CONFIG.visual['karaoke-text-effects'] = false;
  live.paint(1400, 416);
  assert.equal(Number(live.values.get('--karaoke-motion-glow')), 0);
  assert.equal(live.values.get('--karaoke-bounce-scale'), scale);
});

test('an older RAF sample cannot rewind Expressive springs after a commit-time paint', () => {
  const h = expressive(), live = liveFixture(h);
  live.paint(1416, 416);
  const committed = plain([...live.values]);
  // RAF's timestamp is the beginning of the frame; a layout effect may already
  // have painted at performance.now() several milliseconds later in that frame.
  assert.equal(live.paint(1411, 411), false, 'discard the obsolete frame, not the spring velocity');
  assert.deepEqual(plain([...live.values]), committed, 'all continuously painted values keep the committed pose');
  assert.equal(live.paint(1433, 433), true, 'the next display frame advances normally');
  assert.ok(Number(live.values.get('--karaoke-bounce-scale')) > 0.98,
    'a 5ms timestamp inversion must not reset the unit to its 0.95 pending scale');
  assert.equal(live.paint(1200, 450), true, 'a real backward seek at a newer timestamp is still painted');
  assert.equal(Number(live.values.get('--karaoke-bounce-scale')), 0.95,
    'real backward seeks retain their existing reset behavior');
});

for (const system of [false, true]) test(`the Classic live fallback honors ${system ? 'OS' : 'app'} reduced motion after Expressive is disabled`, () => {
  const h = expressive(), live = liveFixture(h, false);
  if (system) h.window.reducedMotion = true;
  else h.CONFIG.visual['reduce-motion'] = true;
  live.paint(1401, 416);
  for (const property of ['--karaoke-bounce-y', '--karaoke-bounce-scale', '--karaoke-motion-glow']) {
    assert.equal(live.values.has(property), false, property);
  }
});
