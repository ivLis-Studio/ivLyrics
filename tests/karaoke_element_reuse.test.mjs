import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const currentSource = readFileSync(new URL('../Pages.js', import.meta.url), 'utf8');
const previousSource = execFileSync('git', ['show', '3353a5d:Pages.js'], {
  cwd: new URL('..', import.meta.url), encoding: 'utf8',
});

// Reuse the established source-extracted renderer and stable hook model. Keep
// the prior baseline tests unchanged; this comparison uses the exact release
// before element reuse and does not normalize away any visible output fields.
const harnessUrl = new URL('./karaoke_static_render_cache.test.mjs', import.meta.url);
const fixtureSource = readFileSync(harnessUrl, 'utf8');
const fixtureStart = fixtureSource.indexOf('const currentSource =');
const fixtureEnd = fixtureSource.indexOf("test('vocal presence");
assert.ok(fixtureStart >= 0 && fixtureEnd > fixtureStart);
let harnessSource = fixtureSource.slice(fixtureStart, fixtureEnd)
  .replaceAll('import.meta.url', JSON.stringify(harnessUrl.href))
  .replace('activeCharScans: 0,', 'elements: 0, glyphElements: 0, bounceCalls: 0, activeCharScans: 0,');
const elementFactory = 'createElement: (tag, props, ...children) => ({ tag, props: props || {}, children })';
assert.ok(harnessSource.includes(elementFactory));
harnessSource = harnessSource.replace(elementFactory, `createElement: (tag, props, ...children) => {
  counts.elements++;
  if (String(props?.key || '').startsWith('karaoke-char-')) counts.glyphElements++;
  return { tag, props: props || {}, children };
}`);
const { createHarness, makeLine } = new Function('assert', 'execFileSync', 'readFileSync', 'vm',
  harnessSource + '\nreturn { createHarness, makeLine };')(assert, execFileSync, readFileSync, vm);
const exactTree = value => JSON.parse(JSON.stringify(value));
const countMotion = source => source.replace(
  'const getKaraokeBounceValues = (position, isActive, startTime, endTime, attenuation = 1, motionProfile = null) => {',
  'const getKaraokeBounceValues = (position, isActive, startTime, endTime, attenuation = 1, motionProfile = null) => { counts.bounceCalls++;'
);
const pair = options => [createHarness(countMotion(currentSource), options), createHarness(countMotion(previousSource), options)];
const compare = (current, previous, line, position, props = {}) => {
  assert.deepEqual(exactTree(current.render(line, position, props)),
    exactTree(previous.render(line, position, props)), `position ${position}, ${props.renderGranularity || 'character'}`);
};

test('unchanged glyphs and words reuse elements while every playback output matches the previous release', () => {
  for (const renderGranularity of ['character', 'word']) {
    const [current, previous] = pair({ memo: true });
    const line = makeLine('la '.repeat(20));
    const props = { renderGranularity };
    compare(current, previous, line, 1500, props);
    current.resetCounts(); previous.resetCounts();
    for (let frame = 1; frame <= 120; frame++) {
      compare(current, previous, line, 1500 + frame * 1000 / 60, props);
    }
    assert.equal(previous.counts.elements, 16920);
    assert.equal(previous.counts.glyphElements, 7200);
    assert.ok(current.counts.elements < previous.counts.elements * 0.1,
      `${renderGranularity}: ${current.counts.elements} of ${previous.counts.elements} elements`);
    assert.ok(current.counts.glyphElements < previous.counts.glyphElements * 0.05);
    assert.equal(current.counts.graphemes, 0);
    assert.equal(current.counts.furigana, 0);
    if (renderGranularity === 'character') {
      assert.ok(current.counts.bounceCalls < previous.counts.bounceCalls * 0.1,
        'future and settled characters do not evaluate motion');
    }
  }
});

test('ruby, styled runs, joining scripts and vocal stacks preserve all children through completion and seeks', () => {
  const fixtures = [
    ['Hello  styled world!', 'en'], ['漢字の歌、聞こえる', 'ja'],
    ['مرحبا بالعالم', 'ar'], ['ภาษาไทย สวัสดี', 'th'],
    ['á voice 👨‍👩‍👧‍👦', 'en'], ['a'.repeat(28), 'en'],
  ];
  for (const [text, locale] of fixtures) for (const rowCount of [1, 4]) {
    for (const renderGranularity of ['character', 'word']) {
      const [current, previous] = pair({ locale, visual: { 'furigana-enabled': true } });
      current.window.furiganaReady = previous.window.furiganaReady = true;
      const line = makeLine(text, rowCount, true);
      const annotations = [{ expression: text.slice(0, 2), marker: 1 }, { expression: 'missing', marker: 2 }];
      for (const position of [-10, 0, 999, 1000, 1001, 1071, 1350, 2300, 3499, 3500, 4000, 9000, 1200, 1200]) {
        compare(current, previous, line, position, {
          renderGranularity, culturalAnnotations: annotations, phonetic: 'first / second / third / fourth',
          translation: 'one / two / three / four', isActive: position >= 1000 && position < 3500,
          isEffectFocused: position < 4000, isEffectLive: position < 5000,
        });
      }
    }
  }
});

test('cached settled output refreshes for paused preferences, annotation changes and edited source timing', () => {
  for (const [text, locale] of [['漢字の歌', 'ja'], ['hello long words', 'en'], ['مرحبا بالعالم', 'ar']]) {
    for (const renderGranularity of ['character', 'word']) {
      const [current, previous] = pair({ locale });
      let line = makeLine(text, 1, true);
      let revision = 0;
      let culturalAnnotations = [{ expression: text.slice(0, 2), marker: 1 }];
      const changes = [
        () => {},
        h => { h.CONFIG.visual['karaoke-bounce'] = false; },
        h => { h.CONFIG.visual['karaoke-bounce'] = true; h.CONFIG.visual['karaoke-text-effects'] = false; },
        h => { h.CONFIG.visual['karaoke-text-effects'] = true; h.window.reducedMotion = true; },
        h => { h.window.reducedMotion = false; h.CONFIG.visual['furigana-enabled'] = true; h.window.furiganaReady = true; },
        h => { h.CONFIG.visual['karaoke-fill-correction-curve'] = '[[0,0],[0.25,0.1],[0.5,0.2],[0.75,0.9],[1,1]]'; },
        h => { h.window.ivLyricsSpeakerColors = { getPresentation: () => ({ speakerClass: 'duet-1', creatorColor: '#123456' }) }; },
      ];
      for (const change of changes) {
        change(current); change(previous);
        for (const position of [1320, 1320, 9000, 9000]) {
          compare(current, previous, line, position, { renderGranularity, culturalAnnotations, settingsRevision: revision });
        }
      }
      culturalAnnotations = [{ expression: text.slice(0, 2), marker: 2 }];
      compare(current, previous, line, 9000, { renderGranularity, culturalAnnotations });
      culturalAnnotations[0].marker = 3;
      line.syllables[0].endTime += 1000;
      line.syllables[0].styleKind = 'glow';
      revision++;
      compare(current, previous, line, 1320, { renderGranularity, culturalAnnotations, settingsRevision: revision });
      line = makeLine(`${text} new`);
      compare(current, previous, line, 1320, { renderGranularity, culturalAnnotations });
    }
  }
});

test('joining-script runs retain their shaping and reduce stable segment element allocation', () => {
  for (const renderGranularity of ['character', 'word']) {
    const [current, previous] = pair({ locale: 'ar' });
    const line = makeLine('مرحبا بالعالم '.repeat(8));
    compare(current, previous, line, 1500, { renderGranularity });
    current.resetCounts(); previous.resetCounts();
    for (let frame = 1; frame <= 120; frame++) {
      compare(current, previous, line, 1500 + frame * 1000 / 60, { renderGranularity });
    }
    assert.ok(current.counts.elements < previous.counts.elements * 0.2);
    assert.equal(current.counts.textRuns, 0);
    assert.equal(current.counts.graphemes, 0);
  }
});
