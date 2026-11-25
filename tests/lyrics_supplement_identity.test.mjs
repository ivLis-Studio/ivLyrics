import { applyCulturalAnnotationsToLyrics } from "../src/lyrics/lyricCulturalAnnotations.mjs";
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { readTranslationRuntimeFixture } from './fixtures/legacy-page-source.mjs';
import { createPageTranslationMemoryCache } from '../src/lyrics/pageMemoryCache.mjs';
import { reuseLyricsPresentation, withoutVocalSupplementField, mergeVocalTranslationFields } from '../src/lyrics/translationPresentation.mjs';

const source = readFileSync(new URL('../src/spicetify/index.js', import.meta.url), 'utf8');
const section = (from, to) => {
  const start = source.indexOf(from), end = source.indexOf(to, start + from.length);
  assert.ok(start >= 0 && end > start, from);
  return source.slice(start, end);
};
const context = vm.createContext({
  console, CONFIG: { visual: {} }, CacheManager: createPageTranslationMemoryCache(),
  window: { ivLyricsTextComparison: {
    normalize: text => String(text || '').trim(), areEquivalent: (a, b) => a === b,
  } },
  Utils: { isSectionHeader: () => false },
});
vm.runInContext([
  readTranslationRuntimeFixture(),
  `class Container {
    ${section('  optimizeTranslations(', '  getGeminiTranslation(')}
  }
  globalThis.Container = Container;`,
].join('\n'), context);
const { Container } = context;
const line = (text, startTime = 1000) => ({ text, originalText: text, startTime,
  endTime: startTime + 1000, syllables: [{ text, startTime, endTime: startTime + 1000 }] });

test('one streamed row changes without replacing the other 239 rows or their timing', () => {
  const before = Array.from({ length: 240 }, (_, index) => line(`source ${index}`, index * 1000));
  const next = before.map((item, index) => ({ ...item, ...(index === 70 ? { text2: 'meaning' } : {}) }));
  const result = reuseLyricsPresentation(before, next);
  assert.notEqual(result, before);
  result.forEach((item, index) => {
    assert.equal(item === before[index], index !== 70);
    assert.equal(item.syllables, before[index].syllables);
  });
  assert.equal(reuseLyricsPresentation(result, result.map(item => ({ ...item }))), result);
});

test('identical cloned vocal supplements retain rows and arrays without adding absent fields', () => {
  const lead = { ...line('lead'), phonetic: 'reading' }, background = [line('back')];
  const before = [{ ...line('combined'), vocals: { lead, background } }];
  const next = [{ ...before[0], vocals: { lead: { ...lead }, background: [{ ...background[0] }] } }];
  assert.equal(reuseLyricsPresentation(before, next), before);
  const solo = [{ ...line('solo'), vocals: { lead } }];
  assert.equal(reuseLyricsPresentation(solo, [{ ...solo[0], vocals: { lead: { ...lead } } }]), solo);
  assert.equal(Object.hasOwn(solo[0].vocals, 'background'), false);
});

test('new timing, original text, speaker colors and removed fields are never suppressed', () => {
  const before = [line('source')];
  for (const patch of [{ syllables: [...before[0].syllables] }, { originalText: 'edited' },
    { startTime: 1100 }, { 'speaker-color': '#ff0000' }]) {
    assert.notEqual(reuseLyricsPresentation(before, [{ ...before[0], ...patch }])[0], before[0]);
  }
  const translated = [{ ...before[0], text2: 'stale' }];
  assert.equal(Object.hasOwn(reuseLyricsPresentation(translated, before)[0], 'text2'), false);
});

test('unchanged vocal fields do not clone the timing-bearing tree', () => {
  const vocals = { lead: { ...line('voice'), phonetic: 'reading' }, background: [] };
  assert.equal(withoutVocalSupplementField(vocals, 'translation'), vocals);
  assert.equal(mergeVocalTranslationFields(vocals, vocals, 'phonetic'), vocals);
  const changed = mergeVocalTranslationFields(vocals, { lead: { phonetic: 'new reading' } }, 'phonetic');
  assert.notEqual(changed, vocals);
  assert.equal(changed.lead.syllables, vocals.lead.syllables);
  assert.equal(vocals.lead.phonetic, 'reading');
});

test('cultural annotations preserve the unmodified array and affect only their own row', () => {
  const before = [line('first'), line('second')];
  assert.equal(applyCulturalAnnotationsToLyrics(before, null), before);
  const notes = [{ marker: 1, expression: 'second', note: 'context' }];
  const notesByIndex = new Map([[1, notes]]);
  const annotated = applyCulturalAnnotationsToLyrics(before, notesByIndex);
  assert.equal(annotated[0], before[0]);
  assert.equal(annotated[1].syllables, before[1].syllables);
  assert.equal(applyCulturalAnnotationsToLyrics(annotated, notesByIndex), annotated);
  assert.equal(applyCulturalAnnotationsToLyrics(annotated, null)[1].culturalNote, undefined);
});

test('production optimization shares unchanged stream rows and still clears disabled output', () => {
  const app = new Container();
  app.state = { uri: 'fixture' };
  app.applyCulturalAnnotations = lyrics => lyrics;
  const base = [line('first'), line('second')];
  const present = (mode1, mode2, display1 = 'gemini_romaji', display2 = 'gemini_ko') => {
    const result = app.optimizeTranslations(base, mode1, mode2, display1, display2);
    app.state.currentLyrics = result;
    return result;
  };
  const initial = present(null, null);
  const partial = present(['reading'], null);
  assert.notEqual(partial[0], initial[0]);
  assert.equal(partial[1], initial[1]);
  assert.equal(present(['reading'], null), partial);
  const translated = present(['reading'], ['meaning']);
  assert.equal(translated[1], partial[1]);
  assert.equal(translated[0].syllables, base[0].syllables);
  const disabled = present(null, null, 'none', 'none');
  assert.equal(disabled[0].phoneticText, null);
  assert.equal(disabled[0].translationText, null);
});
