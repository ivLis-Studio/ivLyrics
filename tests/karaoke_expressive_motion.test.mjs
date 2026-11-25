import { readPcStylesheet } from "../.github/scripts/pc_stylesheet.mjs";
import { createKaraokeHarnessFactory } from "./fixtures/karaoke-page-modules.mjs";
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { KaraokeWordTiming } from '../src/lyrics/karaokeWordTiming.mjs';

// Reuse the established source-extracted karaoke renderer harness.
const harnessUrl = new URL('./karaoke_static_render_cache.test.mjs', import.meta.url);
const fixtureSource = readFileSync(harnessUrl, 'utf8');
const fixtureStart = fixtureSource.indexOf('const currentSource =');
const fixtureEnd = fixtureSource.indexOf("test('vocal presence");
assert.ok(fixtureStart >= 0 && fixtureEnd > fixtureStart);
// Also export the live painter, which drives expressive springs on live rows.
const exportLine = "'globalThis.api = { KaraokeLine, hasKaraokeVocalRows, getKaraokeVocalRows };',";
const harnessSource = fixtureSource.slice(fixtureStart, fixtureEnd)
  .replaceAll('import.meta.url', JSON.stringify(harnessUrl.href))
  .replace(exportLine, "'globalThis.api = { KaraokeLine, hasKaraokeVocalRows, getKaraokeVocalRows, syncKaraokeLiveEntry, paintKaraokeLiveEntry, classifyKaraokeExpressiveUnits };',");
assert.ok(harnessSource.includes('paintKaraokeLiveEntry'));
const { createHarness, makeLine } = createKaraokeHarnessFactory('assert', 'execFileSync', 'readFileSync', 'vm', 'KaraokeWordTiming',
  `${harnessSource}\nreturn { createHarness, makeLine };`)(assert, execFileSync, readFileSync, vm, KaraokeWordTiming);

const motionSource = readFileSync(new URL('../src/lyrics/karaokeMotion.mjs', import.meta.url), 'utf8');
const css = readPcStylesheet();

const nodes = (tree, result = []) => {
  if (Array.isArray(tree)) tree.forEach(child => nodes(child, result));
  else if (tree && typeof tree === 'object') {
    result.push(tree);
    nodes(tree.children, result);
  }
  return result;
};
const classOf = node => String(node?.props?.className || '');
const lineNode = tree => nodes(tree).find(node => classOf(node).split(' ').includes('lyrics-karaoke-line'));
const withClass = (tree, name) => nodes(tree).filter(node => classOf(node).split(' ').includes(name));
const exactTree = value => JSON.parse(JSON.stringify(value));

const expressiveHarness = (visual = {}, locale = 'en') => {
  const harness = createHarness(undefined, { locale, visual: { 'karaoke-motion-style': 'expressive', ...visual } });
  let now = 10_000;
  harness.context.performance = { now: () => now };
  harness.advance = (ms) => { now += ms; };
  return harness;
};

test('expressive springs are exact closed-form steps that overshoot slightly and settle inside the release window', () => {
  const context = vm.createContext({ Math });
  const start = motionSource.indexOf('const KARAOKE_EXPRESSIVE_MOTION_STYLE');
  const end = motionSource.indexOf('const getKaraokeExpressiveNow');
  assert.ok(start >= 0 && end > start);
  vm.runInContext(`${motionSource.slice(start, end)}
    globalThis.api = { stepKaraokeExpressiveSpring, sampleKaraokeExpressiveCurve, KARAOKE_EXPRESSIVE_SPRINGS,
      KARAOKE_EXPRESSIVE_CURVES, KARAOKE_EXPRESSIVE_SETTLE_MS };`, context);
  const { api } = context;

  for (const [property, parameters] of Object.entries(api.KARAOKE_EXPRESSIVE_SPRINGS)) {
    const spring = { position: 0, velocity: 0 };
    let peak = 0;
    for (let elapsed = 0; elapsed < api.KARAOKE_EXPRESSIVE_SETTLE_MS; elapsed += 16) {
      peak = Math.max(peak, api.stepKaraokeExpressiveSpring(spring, 1, 0.016, parameters));
    }
    assert.ok(peak > 1, `${property} spring should overshoot a little`);
    assert.ok(peak < 1.3, `${property} spring overshoot stays modest`);
    assert.ok(Math.abs(spring.position - 1) < 0.06, `${property} spring settles inside the release window`);

    // One large step equals many small ones: the update is frame-rate independent.
    const coarse = { position: 0, velocity: 0 };
    const fine = { position: 0, velocity: 0 };
    api.stepKaraokeExpressiveSpring(coarse, 1, 0.1, parameters);
    for (let index = 0; index < 100; index++) api.stepKaraokeExpressiveSpring(fine, 1, 0.001, parameters);
    assert.ok(Math.abs(coarse.position - fine.position) < 1e-9);
  }

  const { word, emphasis } = api.KARAOKE_EXPRESSIVE_CURVES;
  assert.equal(api.sampleKaraokeExpressiveCurve(word.scale, 0), 0.95);
  assert.equal(api.sampleKaraokeExpressiveCurve(word.scale, 0.7), 1.05);
  assert.equal(api.sampleKaraokeExpressiveCurve(word.scale, 1), 1);
  assert.ok(api.sampleKaraokeExpressiveCurve(emphasis.scale, 0.7) > api.sampleKaraokeExpressiveCurve(word.scale, 0.7));
});

test('classic style and an unset style render the exact same karaoke tree', () => {
  const unset = createHarness();
  const classic = createHarness(undefined, { visual: { 'karaoke-motion-style': 'classic' } });
  for (const text of ['Hello long words here', '漢字のうた']) {
    const line = makeLine(text);
    for (const position of [0, 1000, 1150, 1500, 2600, 5000]) {
      const left = exactTree(unset.render(line, position));
      const right = exactTree(classic.render(line, position));
      assert.deepEqual(right, left, `${text} at ${position}`);
      assert.ok(!classOf(lineNode(right)).includes('is-motion-expressive'));
    }
  }
});

test('expressive Latin words move as one unit: pending words rest, the sung word springs in em units', () => {
  const harness = expressiveHarness();
  const line = makeLine('Hi yo');
  const units = tree => nodes(tree).filter(node => classOf(node).split(' ').includes('is-expressive-unit'));

  const pending = harness.render(line, 0);
  assert.ok(classOf(lineNode(pending)).includes('is-motion-expressive'));
  assert.equal(units(pending).length, 2, 'each word gets a moving wrapper');
  for (const word of units(pending)) {
    assert.ok(classOf(word).includes('is-expressive-pending'));
    assert.equal(word.props.style, undefined, 'pending rest pose comes from CSS');
  }

  harness.render(line, 1000);
  harness.advance(80);
  const active = harness.render(line, 1080);
  const moving = units(active).filter(word => classOf(word).includes('is-bouncing'));
  assert.equal(moving.length, 1, 'only the sung word moves');
  assert.match(moving[0].props.style['--karaoke-bounce-y'], /em$/);
  const scale = moving[0].props.style['--karaoke-bounce-scale'];
  assert.ok(scale > 0.9 && scale < 1.12);
  // Glyphs inside a moving word only paint their fill.
  for (const glyph of withClass(moving[0], 'lyrics-karaoke-char')) {
    assert.equal(glyph.props.style['--karaoke-bounce-y'], undefined);
  }

  harness.advance(5000);
  const settled = harness.render(line, line.endTime + 900);
  assert.equal(withClass(settled, 'is-bouncing').length, 0, 'motion ends after the settle window');
  assert.ok(units(settled).every(word => !classOf(word).includes('is-expressive-pending')));
});

test('expressive text runs spring whole segments for joined scripts', () => {
  const harness = expressiveHarness({}, 'ar');
  const line = makeLine('مرحبا يا');
  const pending = harness.render(line, 0);
  const pendingSegments = withClass(pending, 'lyrics-karaoke-text-run-segment--pending');
  assert.ok(pendingSegments.length > 0);
  assert.ok(pendingSegments.every(segment => segment.props.style['--karaoke-bounce-y'] === undefined));
  harness.render(line, 1000);
  harness.advance(60);
  const active = harness.render(line, 1060);
  const moving = withClass(active, 'is-bouncing');
  assert.ok(moving.length >= 1);
  assert.ok(moving.every(segment => /em$/.test(segment.props.style['--karaoke-bounce-y'])));
  assert.equal(withClass(active, 'lyrics-karaoke-emphasis-run').length, 0, 'joined scripts are never split');
});

test('expressive glyph lines move each glyph and leave pending glyphs to the CSS rest pose', () => {
  const harness = expressiveHarness({}, 'ja');
  const line = makeLine('漢字のうた');
  const pending = harness.render(line, 0);
  for (const glyph of withClass(pending, 'lyrics-karaoke-char--pending')) {
    assert.equal(glyph.props.style['--karaoke-bounce-y'], undefined);
  }
  harness.render(line, 1000);
  harness.advance(60);
  const active = harness.render(line, 1060);
  const moving = withClass(active, 'is-bouncing');
  assert.ok(moving.length >= 1);
  assert.ok(moving.every(glyph => /em$/.test(glyph.props.style['--karaoke-bounce-y'])));
});

test('long held words swell letter by letter instead of moving as one unit', () => {
  const harness = expressiveHarness();
  // 11 letters x 110 ms: one word lasting over a second.
  const line = makeLine('Gooooooosey');
  harness.render(line, 900);
  harness.advance(16);
  const tree = harness.render(line, 1400);
  assert.equal(nodes(tree).filter(node => classOf(node).includes('is-expressive-unit')).length, 0);
  const letters = withClass(tree, 'lyrics-karaoke-char');
  assert.equal(letters.length, 11);
  const moving = letters.filter(letter => classOf(letter).includes('is-bouncing'));
  assert.ok(moving.length >= 1, 'the letters being sung move');
  assert.ok(moving.length < letters.length, 'letters move one after another');
  assert.ok(letters.some(letter => classOf(letter).includes('lyrics-karaoke-char--pending')));

  // A combining mark requires a shaped text run. Keep its text and source
  // timing intact instead of synthesizing per-letter fill windows.
  const marked = expressiveHarness();
  const markedLine = makeLine('Gooóoooosey');
  marked.render(markedLine, 900);
  marked.advance(16);
  const runs = withClass(marked.render(markedLine, 1400), 'lyrics-karaoke-text-run-segment');
  assert.equal(runs.length, 1);
  assert.equal(runs[0].props['data-outline-text'], markedLine.text);
  assert.equal(withClass(runs[0], 'lyrics-karaoke-char').length, 0);
});

test('expressive word-timed lines move whole words and mark pending words for the rest pose', () => {
  const harness = expressiveHarness();
  const line = makeLine('Hello long words here');
  const pending = harness.render(line, 0, { renderGranularity: 'word' });
  const pendingWords = nodes(pending).filter(node => classOf(node).includes('is-expressive-pending'));
  const runs = nodes(pending).filter(node => classOf(node).includes('lyrics-karaoke-text-run-segment'));
  // Word-timed lines use either word wrappers or word-timed text runs.
  assert.ok(pendingWords.length > 0 || runs.length > 0);
  harness.render(line, 1000, { renderGranularity: 'word' });
  harness.advance(50);
  const active = harness.render(line, 1050, { renderGranularity: 'word' });
  assert.ok(withClass(active, 'is-bouncing').length >= 1);
});

test('reduced motion and disabled bounce keep the classic presentation', () => {
  for (const harness of [expressiveHarness({ 'karaoke-bounce': false }), expressiveHarness()]) {
    if (harness.CONFIG.visual['karaoke-bounce'] !== false) harness.window.reducedMotion = true;
    const tree = harness.render(makeLine('Hi yo'), 1050);
    assert.ok(!classOf(lineNode(tree)).includes('is-motion-expressive'));
  }
});

// Live rows (the lyric pages) are painted per display frame by KaraokeLivePainter.
const liveClock = { getPosition: () => NaN };
const continuousProperties = ['--karaoke-char-fill', '--karaoke-bounce-y', '--karaoke-bounce-scale', '--karaoke-motion-glow'];
const hasNoContinuousValues = node => continuousProperties.every(name => node.props.style?.[name] === undefined);
const createElementDouble = (key) => {
  const values = new Map();
  return {
    values,
    getAttribute: () => key,
    style: {
      setProperty: (name, value) => values.set(name, String(value)),
      removeProperty: (name) => values.delete(name),
    },
  };
};
const attachLiveEntry = (harness, keys, data) => {
  const elements = keys.map(createElementDouble);
  const entry = { units: new Map(), data: null, lastPosition: NaN };
  const clock = { getPosition: frameTime => 1000 + frameTime };
  harness.context.api.syncKaraokeLiveEntry(entry, { querySelectorAll: () => elements }, clock, null, data);
  return { entry, elements: Object.fromEntries(keys.map((key, index) => [key, elements[index]])) };
};

test('live expressive rows mark moving units in React and leave their spring values to the painter', () => {
  const harness = expressiveHarness();
  const line = makeLine('Hi yo');
  const words = tree => nodes(tree).filter(node => classOf(node).split(' ').includes('is-expressive-unit'));
  const pending = words(harness.render(line, 0, { liveClock }));
  assert.deepEqual(pending.map(word => word.props['data-karaoke-live']), ['w:0:2', 'w:3:2']);
  assert.ok(pending.every(word => classOf(word).includes('is-expressive-pending') && word.props.style === undefined));

  const active = harness.render(line, 1080, { liveClock });
  const moving = words(active).filter(word => classOf(word).includes('is-bouncing'));
  assert.equal(moving.length, 1);
  assert.equal(moving[0].props.style, undefined, 'the painter writes the spring values');
  const glyphs = withClass(active, 'lyrics-karaoke-char');
  assert.ok(glyphs.length > 0 && glyphs.every(hasNoContinuousValues));
  assert.ok(glyphs.every((glyph, index) => /^g:\d+$/.test(glyph.props['data-karaoke-live'])));

  // Shaped held notes retain one production live segment and its original fill.
  const held = harness.render(makeLine('Gooo\u0301oooosey'), 1400, { liveClock });
  const runs = withClass(held, 'lyrics-karaoke-text-run-segment');
  assert.equal(runs.length, 1);
  assert.equal(runs[0].props['data-karaoke-live'], 's:0');
  assert.ok(runs.every(hasNoContinuousValues));
});

test('the painter springs a live expressive word in em units and clears it once settled', () => {
  const harness = expressiveHarness();
  const timedChars = [...'Hi'].map((char, index) => ({ char, startTime: 1000 + index * 110, endTime: 1110 + index * 110 }));
  const { entry, elements } = attachLiveEntry(harness, ['g:0', 'g:1', 'w:0:2'], {
    timedChars, motionProfiles: [], wordTimed: false, segmentsByStart: null,
    expressive: true, expressiveUnits: harness.context.api.classifyKaraokeExpressiveUnits(timedChars),
  });
  const word = elements['w:0:2'];
  const scales = [];
  for (let frame = 1; frame <= 60; frame++) {
    harness.context.api.paintKaraokeLiveEntry(entry, frame * 1000 / 120);
    assert.match(word.values.get('--karaoke-bounce-y'), /em$/);
    scales.push(Number.parseFloat(word.values.get('--karaoke-bounce-scale')));
  }
  assert.ok(scales[0] >= 0.95 && scales[0] < 0.96, `springs start from the rest pose (${scales[0]})`);
  assert.ok(Math.max(...scales) > 1, 'the sung word swells past full size');
  assert.ok(new Set(scales).size > 30, 'the spring moves on every 120 Hz frame');
  assert.ok(elements['g:0'].values.size === 0 || !elements['g:0'].values.has('--karaoke-bounce-y'),
    'glyphs of a moving word only paint their fill');

  harness.context.api.paintKaraokeLiveEntry(entry, 2500);
  assert.equal(word.values.has('--karaoke-bounce-y'), false, 'a settled word has no transform values');
});

test('the painter fills and swells held-note letters one after another', () => {
  const harness = expressiveHarness();
  const timedChars = [...'gone'].map((char, index) => ({ char, startTime: 1000 + index * 400, endTime: 1400 + index * 400 }));
  const { entry, elements } = attachLiveEntry(harness, ['g:0', 'g:1', 'g:2', 'g:3'], {
    timedChars, motionProfiles: [], wordTimed: false, segmentsByStart: null,
    expressive: true, expressiveUnits: harness.context.api.classifyKaraokeExpressiveUnits(timedChars),
  });
  harness.context.api.paintKaraokeLiveEntry(entry, 500); // 1500 ms: second letter (1400-1800) is sung
  assert.ok(elements['g:0'].values.has('--karaoke-bounce-scale'), 'the first letter is still settling');
  assert.ok(Number.parseFloat(elements['g:1'].values.get('--karaoke-char-fill')) > 0);
  assert.match(elements['g:1'].values.get('--karaoke-bounce-y'), /em$/);
  assert.equal(elements['g:2'].values.size, 0, 'later letters rest in the CSS pose');
  assert.equal(elements['g:3'].values.size, 0);
});

test('expressive CSS defines the rest pose and disables motion immediately for the OS preference', () => {
  // The rest pose only applies on the live line, so idle glyphs elsewhere keep
  // no transform (the lyric pages' paint-chunk rule).
  const live = '.lyrics-karaoke-line.is-motion-expressive.is-effect-live:not(.is-complete)';
  const pose = css.slice(css.indexOf(`${live} .lyrics-karaoke-char.lyrics-karaoke-char--pending`));
  assert.match(pose, /^[^{]*\.lyrics-karaoke-text-run-segment\.lyrics-karaoke-text-run-segment--pending[^{]*\.lyrics-karaoke-word\.is-word-timed\.is-expressive-pending[^{]*\{[^}]*--karaoke-bounce-scale: 0\.95;[^}]*transform: translateY/);
  assert.match(css, /\.lyrics-karaoke-word\.is-expressive-unit \.lyrics-karaoke-char \{\s*--karaoke-bounce-y: 0;\s*--karaoke-bounce-scale: 1;\s*\}/);
  const reduced = css.slice(css.indexOf('/* Honor an OS preference change immediately'));
  assert.match(reduced, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?transform: none !important;[\s\S]*?transition: none !important;/);
});
