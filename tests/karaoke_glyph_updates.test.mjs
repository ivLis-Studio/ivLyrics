import { createKaraokeHarnessFactory, expandHistoricalCulturalGlyphFragments, readKaraokePageHarnessSource } from "./fixtures/karaoke-page-modules.mjs";
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { KaraokeWordTiming } from '../src/lyrics/karaokeWordTiming.mjs';

const currentSource = readKaraokePageHarnessSource();
const previousSource = execFileSync('git', ['show', 'd725515:Pages.js'], {
  cwd: new URL('..', import.meta.url), encoding: 'utf8',
});
const harnessUrl = new URL('./karaoke_static_render_cache.test.mjs', import.meta.url);
const fixtureSource = readFileSync(harnessUrl, 'utf8');
const fixtureStart = fixtureSource.indexOf('const currentSource =');
const fixtureEnd = fixtureSource.indexOf("test('vocal presence");
assert.ok(fixtureStart >= 0 && fixtureEnd > fixtureStart);
const harnessSource = fixtureSource.slice(fixtureStart, fixtureEnd)
  .replaceAll('import.meta.url', JSON.stringify(harnessUrl.href))
  .replace('activeCharScans: 0,', 'charFills: 0, wordFills: 0, activeCharScans: 0,');
const { createHarness, makeLine } = createKaraokeHarnessFactory('assert', 'execFileSync', 'readFileSync', 'vm', 'KaraokeWordTiming',
  harnessSource + '\nreturn { createHarness, makeLine };')(assert, execFileSync, readFileSync, vm, KaraokeWordTiming);
const measured = source => source
  .replace('const getKaraokeCharFill = (position, isActive, startTime, endTime, isComplete = false) => {',
    'const getKaraokeCharFill = (position, isActive, startTime, endTime, isComplete = false) => { counts.charFills++;')
  .replace('const getKaraokeInstantWordFill = (segment, position, isActive, isComplete) => {',
    'const getKaraokeInstantWordFill = (segment, position, isActive, isComplete) => { counts.wordFills++;');
const pair = options => [createHarness(measured(currentSource), options), createHarness(measured(previousSource), options)];
// Legacy fragments did not produce a DOM node of their own.
const exactTree = value => JSON.parse(JSON.stringify(value, (_key, entry) =>
  Array.isArray(entry) ? expandHistoricalCulturalGlyphFragments(entry) : entry));
const compare = (current, previous, line, position, props = {}) => {
  assert.deepEqual(exactTree(current.render(line, position, props)),
    exactTree(previous.render(line, position, props)), `position ${position}, ${props.renderGranularity || 'character'}`);
};

test('playback only evaluates glyphs in changing intervals while keeping exact release output', t => {
  for (const renderGranularity of ['character', 'word']) {
    const [current, previous] = pair();
    const line = makeLine('la '.repeat(20));
    compare(current, previous, line, 1500, { renderGranularity });
    current.resetCounts(); previous.resetCounts();
    for (let frame = 1; frame <= 120; frame++) {
      compare(current, previous, line, 1500 + frame * 1000 / 60, { renderGranularity });
    }
    const counter = renderGranularity === 'character' ? 'charFills' : 'wordFills';
    assert.equal(previous.counts[counter], 7200);
    assert.ok(current.counts[counter] < previous.counts[counter] * 0.1,
      `${renderGranularity}: ${current.counts[counter]} vs ${previous.counts[counter]} fill evaluations`);
    t.diagnostic(`${renderGranularity}: ${previous.counts[counter]} -> ${current.counts[counter]} fill evaluations over 120 updates`);
    current.resetCounts();
    compare(current, previous, line, 12000, { renderGranularity });
    current.resetCounts();
    compare(current, previous, line, 12001, { renderGranularity });
    assert.equal(current.counts[counter], 0, 'settled rows no longer evaluate their glyph timing');
  }
});

test('equal, unordered, zero-duration and overlapping timings match through exact boundaries and seeks', () => {
  for (const renderGranularity of ['character', 'word']) {
    for (const [text, locale] of [['AB CD EF', 'en'], ['漢字の歌、聞こえる', 'ja'],
      ['مرحبا بالعالم', 'ar'], ['ภาษาไทย สวัสดี', 'th'], ['á 👨‍👩‍👧‍👦 sing', 'en']]) {
      for (const rowCount of [1, 4]) {
        const [current, previous] = pair({ locale, visual: { 'furigana-enabled': true } });
        current.window.furiganaReady = previous.window.furiganaReady = true;
        const line = makeLine(text, rowCount, true);
        const rows = line.vocals ? [line.vocals.lead, ...line.vocals.background] : [line];
        for (const row of rows) {
          row.syllables.forEach((syllable, index) => {
            const starts = [1000, 1000, 900, 1800, 1100, 2400, 1300, 3000];
            syllable.startTime = starts[index % starts.length];
            syllable.endTime = syllable.startTime + [0, 1600, 10, 200, 900][index % 5];
          });
        }
        const culturalAnnotations = [{ expression: text.slice(0, 2), marker: 1 }, { expression: 'absent', marker: 2 }];
        const positions = [-100, 0, 899, 900, 999, 1000, 1000, 1000.001, 1010, 1099, 1100,
          1299, 1300, 1799, 1800, 2200, 2399, 2400, 2599, 2600, 2600.001, 2999, 3000, 4000,
          9000, 9010, 1000, 1000.001, 2400, NaN, 2400, Infinity, -Infinity, 1001, 9000];
        for (const position of positions) compare(current, previous, line, position, {
          renderGranularity, culturalAnnotations, isActive: position >= 1000 && position < 3000,
          isEffectFocused: position < 4000, isEffectLive: position < 5000,
        });
      }
    }
  }
});

test('timing windows refresh paused motion settings, source edits and cultural markers', () => {
  for (const renderGranularity of ['character', 'word']) {
    const [current, previous] = pair({ locale: 'ja' });
    let line = makeLine('漢字の長い歌', 1, true);
    let settingsRevision = 0;
    let culturalAnnotations = [{ expression: '漢字', marker: 1 }];
    const changes = [
      () => {},
      h => { h.CONFIG.visual['karaoke-bounce'] = false; },
      h => { h.CONFIG.visual['karaoke-bounce'] = true; h.CONFIG.visual['karaoke-text-effects'] = false; },
      h => { h.CONFIG.visual['karaoke-text-effects'] = true; h.window.reducedMotion = true; },
      h => { h.window.reducedMotion = false; h.CONFIG.visual['furigana-enabled'] = true; h.window.furiganaReady = true; },
      h => { h.CONFIG.visual['karaoke-fill-correction-curve'] = '[[0,0],[0.25,0.1],[0.5,0.2],[0.75,0.9],[1,1]]'; },
    ];
    for (const change of changes) {
      change(current); change(previous);
      for (const position of [0, 1320, 1320, 1800, 9000, 9000]) {
        compare(current, previous, line, position, { renderGranularity, settingsRevision, culturalAnnotations });
      }
    }
    culturalAnnotations = [{ expression: '漢字', marker: 2 }];
    compare(current, previous, line, 9000, { renderGranularity, settingsRevision, culturalAnnotations });
    culturalAnnotations[0].marker = 3;
    line.syllables[0].endTime += 1200;
    settingsRevision++;
    compare(current, previous, line, 1320, { renderGranularity, settingsRevision, culturalAnnotations });
    line = makeLine('別の歌');
    compare(current, previous, line, 1320, { renderGranularity, settingsRevision, culturalAnnotations });
  }
});

test('interval scheduler preserves original calculations for malformed and boundary timing values', () => {
  const harness = createHarness();
  const api = vm.runInContext('({ prepareKaraokeGlyphUpdates, getKaraokeGlyphUpdates, getKaraokeCharFill, getKaraokeBounceValues })', harness.context);
  const timedChars = [
    { char: 'a', startTime: 10, endTime: 10 },
    { char: 'b', startTime: 10, endTime: -10 },
    { char: 'c', startTime: -10, endTime: 100 },
    { char: 'd', startTime: NaN, endTime: 100 },
    { char: 'e', startTime: 40, endTime: Infinity },
    { char: 'f', startTime: 50, endTime: 60 },
  ];
  const profiles = timedChars.map((charInfo, index) => index % 2 === 0 ? {
    startTime: -20, endTime: 20 + index * 10, releaseDuration: 20,
    riseDuration: 10, amplitude: 2, scaleAmount: 0.02, glow: 0.1,
  } : null);
  const state = api.prepareKaraokeGlyphUpdates(timedChars, profiles, false, new Map());
  const cached = [];
  const evaluate = (index, position, complete) => ({
    fill: api.getKaraokeCharFill(position, true, timedChars[index].startTime, timedChars[index].endTime, complete),
    bounce: profiles[index] ? api.getKaraokeBounceValues(position, true, 0, 0, 1, profiles[index]) : null,
  });
  for (const position of [-100, -20, -10, 0, 10, 10, 10.001, 20, 39.99, 40, 40.001, 50, 60, 80,
    100, 100.001, 1000, 10, NaN, 50, Infinity, 80, -Infinity, 1000]) {
    const complete = position >= 100;
    const updates = api.getKaraokeGlyphUpdates(state, position, complete);
    for (const index of updates || timedChars.keys()) cached[index] = evaluate(index, position, complete);
    for (let index = 0; index < timedChars.length; index++) {
      assert.deepEqual(cached[index], evaluate(index, position, complete), `index ${index}, position ${position}`);
    }
  }
});
