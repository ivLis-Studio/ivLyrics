import { createKaraokeHarnessFactory } from "./fixtures/karaoke-page-modules.mjs";
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { KaraokeWordTiming } from '../src/lyrics/karaokeWordTiming.mjs';

// Use the production renderer and the established hook/React doubles, including
// its real grapheme segmenter and word-timing service.
const harnessUrl = new URL('./karaoke_static_render_cache.test.mjs', import.meta.url);
const fixture = readFileSync(harnessUrl, 'utf8');
const from = fixture.indexOf('const currentSource =');
const to = fixture.indexOf("test('vocal presence");
assert.ok(from >= 0 && to > from);
const harnessSource = fixture.slice(from, to)
  .replaceAll('import.meta.url', JSON.stringify(harnessUrl.href))
  .replace('getKaraokeVocalRows };', 'getKaraokeVocalRows, classifyKaraokeExpressiveUnits, '
    + 'buildKaraokeTimedChars, assignKaraokeWordIndexes, buildKaraokeWordElements, '
    + 'createKaraokeLiveUnit, syncKaraokeLiveEntry, paintKaraokeLiveEntry };');
assert.ok(harnessSource.includes('classifyKaraokeExpressiveUnits,'));
const { createHarness, makeLine } = createKaraokeHarnessFactory('assert', 'execFileSync', 'readFileSync', 'vm', 'KaraokeWordTiming',
  `${harnessSource}\nreturn { createHarness, makeLine };`)(assert, execFileSync, readFileSync, vm, KaraokeWordTiming);
const baseline = execFileSync('git', ['show', '194645f:Pages.js'], {
  cwd: new URL('..', import.meta.url), encoding: 'utf8',
});

const nodes = (tree, name, result = []) => {
  if (Array.isArray(tree)) tree.forEach(child => nodes(child, name, result));
  else if (tree && typeof tree === 'object') {
    if (tree.props?.className?.split(' ').includes(name)) result.push(tree);
    nodes(tree.children, name, result);
  }
  return result;
};
const textOf = tree => Array.isArray(tree) ? tree.map(textOf).join('')
  : tree && typeof tree === 'object' ? textOf(tree.children) : String(tree ?? '');
const fillText = tree => nodes(tree, 'lyrics-karaoke-glyph-fill').map(textOf).join('');
const plain = value => JSON.parse(JSON.stringify(value));
// The live painter now keeps an empty cultural-marker Fragment from the first
// frame. It has no DOM/layout effect; compare the glyph/ruby output beneath it.
const visibleTree = tree => {
  if (Array.isArray(tree)) return tree.map(visibleTree);
  if (!tree || typeof tree !== 'object') return tree;
  if (tree.tag === 'fragment' && String(tree.props?.key).startsWith('karaoke-cultural-marker-')
    && Array.isArray(tree.children?.[1]) && tree.children[1].length === 0) return visibleTree(tree.children[0]);
  return { ...tree, children: visibleTree(tree.children) };
};
const mapIn = (h, entries) => vm.runInContext(`new Map(${JSON.stringify(entries)})`, h.context);
const liveClock = { getPosition: () => NaN };
const expressive = (locale = 'en') => createHarness(undefined, {
  locale, visual: { 'karaoke-motion-style': 'expressive' },
});
const sourceLine = (parts, locale = 'en') => ({
  text: parts.map(part => part[0]).join(''), karaokeGranularity: 'word',
  startTime: parts[0][1], endTime: parts.at(-1)[2], locale,
  syllables: parts.map(([text, startTime, endTime]) => ({ text, startTime, endTime })),
});
const timedCharsFor = (h, line, wordTimed = false) => {
  const chars = h.context.api.buildKaraokeTimedChars(line);
  return wordTimed ? h.context.api.assignKaraokeWordIndexes(chars, line.karaokeGranularity === 'word', h.window.locale) : chars;
};
const glyphStates = tree => nodes(tree, 'lyrics-karaoke-char').map(node => ({
  text: node.props['data-outline-text'], key: node.props.key,
  state: node.props.className.match(/char--(pending|active|done)/)?.[1],
  fill: node.props.style['--karaoke-char-fill'],
  softStart: node.props.style['--karaoke-char-fill-soft-start'],
  softEnd: node.props.style['--karaoke-char-fill-soft-end'],
}));
const movingWords = tree => nodes(tree, 'lyrics-karaoke-word').filter(node =>
  /\b(is-word-timed|is-expressive-unit)\b/.test(node.props.className));
const liveDataFor = (h, line, wordTimed = false) => {
  const timedChars = timedCharsFor(h, line, wordTimed);
  return { timedChars, wordTimed, motionProfiles: [], expressive: true,
    expressiveUnits: wordTimed ? null : h.context.api.classifyKaraokeExpressiveUnits(timedChars) };
};

test('Expressive classification splits ASCII, Unicode and nonbreaking hyphens and keeps every character', () => {
  const h = expressive();
  for (const [text, expected] of [
    ['blah-blah-blah', ['blah-', 'blah-', 'blah']],
    ['blah\u2010blah\u2011blah', ['blah\u2010', 'blah\u2011', 'blah']],
    ['--blah---blah--', ['--blah---', 'blah--']],
    ["don't-stop", ["don't-", 'stop']],
    ['rock’n’roll-go', ['rock’n’roll-', 'go']],
    ['one—two–three', ['one—two–three']],
    ['---', ['---']],
  ]) {
    const chars = Array.from(text, (char, index) => ({ char, startTime: 1000 + index * 40, endTime: 1040 + index * 40 }));
    const before = plain(chars);
    const units = h.context.api.classifyKaraokeExpressiveUnits(chars);
    const ranges = Array.from(units.wordRanges.values());
    const pieces = ranges.map(({ startIndex, charCount }) => chars.slice(startIndex, startIndex + charCount).map(char => char.char).join(''));
    assert.deepEqual(pieces, expected, text);
    assert.equal(pieces.join(''), text);
    assert.deepEqual(Array.from(units.wordStarts), ranges.map(range => range.startIndex));
    assert.ok(ranges.every(range => range.charCount > 0));
    assert.deepEqual(plain(chars), before, 'classification never changes source timing or indices');
  }
});

test('unspaced and spaced character-timed hyphens render separate motion units with unchanged fill and glyph indices', () => {
  for (const text of ['blah-blah-blah', 'blah\u2011blah blah', '--blah---blah--']) for (const live of [false, true]) {
    const h = expressive(), classic = createHarness(), line = makeLine(text);
    const props = live ? { liveClock } : {};
    const chars = timedCharsFor(h, line);
    const units = h.context.api.classifyKaraokeExpressiveUnits(chars);
    for (const position of [0, 1000, 1520, 1660, 2150, 6000, 1200]) {
      const tree = h.render(line, position, props);
      const expected = classic.render(line, position, props);
      assert.equal(fillText(tree), text);
      assert.deepEqual(glyphStates(tree), glyphStates(expected), `${text}/${live}/${position}`);
      const words = nodes(tree, 'is-expressive-unit');
      assert.deepEqual(words.map(fillText), Array.from(units.wordRanges.values()).map(({ startIndex, charCount }) =>
        chars.slice(startIndex, startIndex + charCount).map(char => char.char).join('')));
      if (live) assert.deepEqual(words.map(word => word.props['data-karaoke-live']),
        Array.from(units.wordRanges.values()).map(({ startIndex, charCount }) => `w:${startIndex}:${charCount}`));
    }
  }
});

test('a held character-timed hyphen piece retains per-glyph emphasis instead of suppressing glyph motion', () => {
  const h = expressive(), line = makeLine('gone-gone');
  line.syllables.forEach((syllable, index) => {
    syllable.startTime = 1000 + index * 300;
    syllable.endTime = 1300 + index * 300;
  });
  line.endTime = line.syllables.at(-1).endTime;
  const chars = timedCharsFor(h, line);
  const units = h.context.api.classifyKaraokeExpressiveUnits(chars);
  assert.ok(Array.from(units.charModes).every(mode => mode === 'emphasis'));
  assert.equal(units.wordStarts.size, 0);
  const tree = h.render(line, 1550);
  assert.equal(nodes(tree, 'lyrics-karaoke-word').length, 2);
  assert.equal(nodes(tree, 'is-expressive-unit').length, 0);
  assert.ok(nodes(tree, 'lyrics-karaoke-char').some(node => node.props.className.includes('is-bouncing')));
  assert.equal(fillText(tree), line.text);
});

test('word-timed pieces retain one shared source window and shared onset without invented timing', () => {
  for (const live of [false, true]) {
    const h = expressive(), classic = createHarness();
    const line = sourceLine([['blah-blah-blah', 1000, 2400]]);
    const data = liveDataFor(h, line, true);
    const props = { renderGranularity: 'word', ...(live ? { liveClock } : {}) };
    for (const position of [999, 1000, 1100, 1550, 2399, 3000, 1100]) {
      const tree = h.render(line, position, props), words = movingWords(tree);
      assert.deepEqual(words.map(fillText), ['blah-', 'blah-', 'blah']);
      assert.deepEqual(glyphStates(tree), glyphStates(classic.render(line, position, props)));
      if (position === 1100) assert.ok(words.every(word => word.props.className.includes('is-bouncing')));
      if (live) for (const word of words) {
        const unit = h.context.api.createKaraokeLiveUnit(word.props['data-karaoke-live'], data);
        assert.deepEqual(plain(unit.expressive), { startTime: 1000, endTime: 2400, emphasis: false });
      }
    }
  }
});

test('separately timed source pieces keep their individual start/end windows and live ranges', () => {
  const h = expressive();
  const line = sourceLine([['blah-', 1000, 1500], ['blah\u2011', 1600, 2100], ['blah', 2200, 2600]]);
  const data = liveDataFor(h, line, true);
  const tree = h.render(line, 1650, { renderGranularity: 'word', liveClock });
  const words = movingWords(tree);
  assert.deepEqual(words.map(fillText), ['blah-', 'blah\u2011', 'blah']);
  assert.deepEqual(words.map(word => word.props['data-karaoke-live']), ['w:0:5', 'w:5:5', 'w:10:4']);
  assert.deepEqual(words.map(word => plain(h.context.api.createKaraokeLiveUnit(word.props['data-karaoke-live'], data).expressive)),
    line.syllables.map(({ startTime, endTime }) => ({ startTime, endTime, emphasis: false })));
});

test('hyphens preserve astral glyph indices, ruby, editor readings and Japanese prolonged sound marks', () => {
  const h = expressive(), classic = createHarness(), line = makeLine('A😀-B\u2011C');
  const props = harness => ({ liveClock,
    furiganaMapOverride: mapIn(harness, [[3, 'ruby-B'], [5, 'ruby-C']]),
    charReadings: mapIn(harness, [[0, 'first'], [3, { text: 'reading-B', dx: 12 }], [5, 'reading-C']]),
  });
  const tree = h.render(line, 1300, props(h));
  const expected = classic.render(line, 1300, props(classic));
  assert.deepEqual(nodes(tree, 'is-expressive-unit').map(fillText), ['A😀-', 'B\u2011', 'C']);
  assert.deepEqual(nodes(tree, 'is-expressive-unit').map(node => node.props['data-karaoke-live']), ['w:0:3', 'w:3:2', 'w:5:1']);
  assert.deepEqual(glyphStates(tree), glyphStates(expected));
  assert.deepEqual(plain(nodes(tree, 'lyrics-karaoke-ruby')), plain(nodes(expected, 'lyrics-karaoke-ruby')));
  assert.deepEqual(plain(nodes(tree, 'lyrics-karaoke-char-reading')), plain(nodes(expected, 'lyrics-karaoke-char-reading')));
  assert.equal(fillText(tree), line.text);

  const japanese = expressive('ja'), japaneseLine = sourceLine([['パーティー-ゴー', 1000, 2400]]);
  const japaneseTree = japanese.render(japaneseLine, 1200, { renderGranularity: 'word', liveClock });
  assert.deepEqual(movingWords(japaneseTree).map(fillText), ['パーティー-', 'ゴー']);
  assert.equal(fillText(japaneseTree), japaneseLine.text);
});

test('one shared word annotation stack covers all motion pieces without repeating its reading or gloss', () => {
  const h = expressive(), line = sourceLine([['blah-blah-blah', 1000, 2400]]);
  const data = liveDataFor(h, line, true);
  const glyphs = nodes(h.render(line, 1100, { renderGranularity: 'word' }), 'lyrics-karaoke-char');
  const tree = h.context.api.buildKaraokeWordElements(data.timedChars, glyphs, {
    position: 1100, isActive: true, wordTimed: true, livePaint: true, motionStyle: 'expressive',
    wordSupplementByKey: mapIn(h, [[0, { reading: 'one reading', gloss: 'one gloss' }]]),
  });
  assert.equal(nodes(tree, 'lyrics-karaoke-word-stack').length, 1);
  assert.deepEqual(movingWords(tree).map(fillText), ['blah-', 'blah-', 'blah']);
  assert.deepEqual(nodes(tree, 'lyrics-karaoke-word-reading').map(textOf), ['one reading']);
  assert.deepEqual(nodes(tree, 'lyrics-karaoke-word-gloss').map(textOf), ['one gloss']);
  assert.equal(fillText(tree), line.text);
});

test('the live painter accepts every split range and springs later pieces at their own source times', () => {
  const h = expressive(), line = makeLine('blah-blah-blah');
  const data = liveDataFor(h, line);
  const tree = h.render(line, 0, { liveClock });
  const keys = [...nodes(tree, 'lyrics-karaoke-char'), ...nodes(tree, 'is-expressive-unit')]
    .map(node => node.props['data-karaoke-live']);
  const elements = new Map(keys.map(key => {
    const values = new Map();
    return [key, { values, getAttribute: () => key,
      style: { setProperty: (name, value) => values.set(name, value), removeProperty: name => values.delete(name) } }];
  }));
  const entry = { units: new Map(), data: null, lastPosition: NaN };
  let position = 1050;
  const root = { querySelectorAll: () => Array.from(elements.values()) };
  const clock = { getPosition: () => position };
  h.context.api.syncKaraokeLiveEntry(entry, root, clock, null, data);
  assert.deepEqual(Array.from(entry.units.keys()), keys);
  assert.equal(h.context.api.createKaraokeLiveUnit('w:5:9', data), null, 'a stale unsplit range must not animate another piece');
  const expectedWindows = [[1000, 1550], [1550, 2100], [2100, 2540]];
  for (const [index, key] of ['w:0:5', 'w:5:5', 'w:10:4'].entries()) {
    const { startTime, endTime } = entry.units.get(key).expressive;
    assert.deepEqual([startTime, endTime], expectedWindows[index]);
  }
  h.context.api.paintKaraokeLiveEntry(entry, 0);
  assert.ok(elements.get('w:0:5').values.has('--karaoke-bounce-scale'));
  assert.equal(elements.get('w:5:5').values.size, 0);
  assert.equal(elements.get('w:10:4').values.size, 0);
  assert.ok(elements.get('g:0').values.has('--karaoke-char-fill'));
  position = 1600;
  h.context.api.paintKaraokeLiveEntry(entry, 550);
  assert.ok(elements.get('w:5:5').values.has('--karaoke-bounce-scale'));
  assert.equal(elements.get('w:10:4').values.size, 0);
  for (const key of keys.filter(key => key.startsWith('g:'))) {
    assert.equal(elements.get(key).values.has('--karaoke-bounce-scale'), false, 'word glyphs paint fill only');
  }
  const retained = entry.units.get('w:5:5');
  h.context.api.syncKaraokeLiveEntry(entry, root, clock, null, data);
  assert.equal(entry.units.get('w:5:5'), retained);
  position = 4000;
  h.context.api.paintKaraokeLiveEntry(entry, 2950);
  assert.ok(['w:0:5', 'w:5:5', 'w:10:4'].every(key => !elements.get(key).values.has('--karaoke-bounce-scale')));
});

test('Classic and unset hyphen trees retain the exact pre-change text, timing, ruby and readings', () => {
  for (const style of [undefined, 'classic']) for (const live of [false, true]) {
    const h = createHarness(undefined, { visual: { 'karaoke-motion-style': style } });
    const previous = createHarness(baseline, { visual: { 'karaoke-motion-style': style } });
    for (const line of [makeLine("blah-blah\u2011don't-stop"), sourceLine([['blah-blah-blah', 1000, 2400]])]) {
      for (const renderGranularity of ['character', 'word']) {
        const props = harness => ({ renderGranularity, ...(live ? { liveClock } : {}),
          charReadings: mapIn(harness, [[5, { text: 'reading', dx: 12 }]]),
          furiganaMapOverride: mapIn(harness, [[5, 'ruby']]),
        });
        const currentProps = props(h), previousProps = props(previous);
        for (const position of [0, 1000, 1150, 1550, 2600, 5000, 1200]) {
          assert.deepEqual(plain(visibleTree(h.render(line, position, currentProps))),
            plain(visibleTree(previous.render(line, position, previousProps))), `${style}/${live}/${renderGranularity}/${position}`);
        }
      }
    }
  }
});
