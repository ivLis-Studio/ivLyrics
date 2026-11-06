import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

// Extend the established production renderer harness, including its real
// grapheme segmenter and word-timing service. No renderer is copied here.
const harnessUrl = new URL('./karaoke_static_render_cache.test.mjs', import.meta.url);
const fixture = readFileSync(harnessUrl, 'utf8');
const from = fixture.indexOf('const currentSource =');
const to = fixture.indexOf("test('vocal presence");
assert.ok(from >= 0 && to > from);
const harnessSource = fixture.slice(from, to)
  .replaceAll('import.meta.url', JSON.stringify(harnessUrl.href))
  .replace('getKaraokeVocalRows };', 'getKaraokeVocalRows, getKaraokeExpressiveUnitRanges, '
    + 'classifyKaraokeExpressiveUnits, buildKaraokeTimedChars, applyKaraokeWhitespaceCompensation, '
    + 'assignKaraokeWordIndexes, buildKaraokeWordElements, getKaraokeMotionProfile, '
    + 'createKaraokeLiveUnit, syncKaraokeLiveEntry, paintKaraokeLiveEntry };');
assert.ok(harnessSource.includes('getKaraokeExpressiveUnitRanges,'));
const { createHarness, makeLine, currentSource } = new Function('assert', 'execFileSync', 'readFileSync', 'vm',
  `${harnessSource}\nreturn { createHarness, makeLine, currentSource };`)(assert, execFileSync, readFileSync, vm);
const baseline = execFileSync('git', ['show', 'ca60f56:Pages.js'], {
  cwd: new URL('..', import.meta.url), encoding: 'utf8',
});
// Isolate the wrapper gate from the already reviewed punctuation splitter when
// checking that word display takes the same production rendering path.
const wrapperGate = source => {
  const start = source.indexOf('const shouldWrapKaraokeByWord =');
  const end = source.indexOf('\nconst ', start + 1);
  assert.ok(start >= 0 && end > start);
  return source.slice(start, end);
};
const beforeWrapperChange = currentSource.replace(wrapperGate(currentSource), wrapperGate(baseline));

// Live glyphs no longer sit in an empty cultural-marker Fragment (it rendered
// no DOM but remounted glyphs on live transitions). Compare what is beneath.
const unwrapEmptyMarkerFragments = tree => {
  if (Array.isArray(tree)) return tree.map(unwrapEmptyMarkerFragments);
  if (!tree || typeof tree !== 'object') return tree;
  if (tree.tag === 'fragment' && String(tree.props?.key).startsWith('karaoke-cultural-marker-')
    && Array.isArray(tree.children?.[1]) && tree.children[1].length === 0) {
    return unwrapEmptyMarkerFragments(tree.children[0]);
  }
  return Object.fromEntries(Object.entries(tree).map(([key, value]) => [key, unwrapEmptyMarkerFragments(value)]));
};
const plain = value => unwrapEmptyMarkerFragments(JSON.parse(JSON.stringify(value)));
const nodes = (tree, name = null, result = []) => {
  if (Array.isArray(tree)) tree.forEach(child => nodes(child, name, result));
  else if (tree && typeof tree === 'object') {
    if (!name || tree.props?.className?.split(' ').includes(name)) result.push(tree);
    nodes(tree.children, name, result);
  }
  return result;
};
const textOf = tree => Array.isArray(tree) ? tree.map(textOf).join('')
  : tree && typeof tree === 'object' ? textOf(tree.children) : String(tree ?? '');
const fillText = tree => nodes(tree, 'lyrics-karaoke-glyph-fill').map(textOf).join('');
const piecesOf = (chars, ranges) => Array.from(ranges, ({ startIndex, charCount }) =>
  chars.slice(startIndex, startIndex + charCount).map(info => info.char).join(''));
const mapIn = (h, entries) => vm.runInContext(`new Map(${JSON.stringify(entries)})`, h.context);
const liveClock = { getPosition: () => NaN };
const expressive = (locale = 'en', source) => {
  const h = createHarness(source, { locale, visual: { 'karaoke-motion-style': 'expressive' } });
  h.context.performance = { now: () => 10_000 };
  return h;
};
const sourceLine = parts => ({
  text: parts.map(([text]) => text).join(''), karaokeGranularity: 'word',
  startTime: parts[0][1], endTime: parts.at(-1)[2],
  syllables: parts.map(([text, startTime, endTime]) => ({ text, startTime, endTime })),
});
const timedCharsFor = (h, line, wordTimed = false) => {
  const api = h.context.api;
  const chars = api.applyKaraokeWhitespaceCompensation(api.buildKaraokeTimedChars(line));
  return wordTimed ? api.assignKaraokeWordIndexes(chars, line.karaokeGranularity === 'word', h.window.locale) : chars;
};
const glyphStates = tree => nodes(tree, 'lyrics-karaoke-char').map(node => ({
  key: node.props.key, text: node.props['data-outline-text'], live: node.props['data-karaoke-live'],
  range: node.props.style?.['--ivlyrics-range-index'],
  state: node.props.className.match(/char--(pending|active|done)/)?.[1],
  fill: node.props.style?.['--karaoke-char-fill'],
  softStart: node.props.style?.['--karaoke-char-fill-soft-start'],
  softEnd: node.props.style?.['--karaoke-char-fill-soft-end'],
}));
// Ruby contains its moving glyph, so compare all annotation/fill properties
// while excluding only the intentional change from glyph to word motion.
const withoutMotion = tree => JSON.parse(JSON.stringify(tree, (key, value) => {
  if (key === 'className' && typeof value === 'string')
    return value.split(' ').filter(name => name !== 'is-bouncing').join(' ');
  if (key === 'style' && value) return Object.fromEntries(Object.entries(value)
    .filter(([name]) => !['--karaoke-bounce-y', '--karaoke-bounce-scale', '--karaoke-motion-glow'].includes(name)));
  return value;
}));
const movingWords = tree => nodes(tree, 'lyrics-karaoke-word').filter(node =>
  /\b(is-word-timed|is-expressive-unit)\b/.test(node.props.className));
const liveDataFor = (h, line, wordTimed = false, enabled = true) => {
  const timedChars = timedCharsFor(h, line, wordTimed);
  return { timedChars, wordTimed, expressive: enabled, segmentsByStart: null,
    motionProfiles: timedChars.map((_, index) => h.context.api.getKaraokeMotionProfile(timedChars, index)),
    expressiveUnits: enabled && !wordTimed ? h.context.api.classifyKaraokeExpressiveUnits(timedChars) : null };
};

test('ASCII periods use hyphen boundaries without dropping repeated, leading or trailing punctuation', () => {
  const h = expressive();
  for (const [text, expected] of [
    ['', []], [' ', []], ['.', ['.']], ['...', ['...']],
    ['.hi', ['.hi']], ['hi.', ['hi.']], ['hi.yo', ['hi.', 'yo']],
    ['...hi...yo...', ['...hi...', 'yo...']],
    ['hi..yo.go', ['hi..', 'yo.', 'go']],
    ['a.-b-.c\u2010.d\u2011.e', ['a.-', 'b-.', 'c\u2010.', 'd\u2011.', 'e']],
    ['--hi---yo--', ['--hi---', 'yo--']],
    ['3.14', ['3.', '14']], ['U.S.A.', ['U.', 'S.', 'A.']],
    ['hi…yo．go。on', ['hi…yo．go。on']],
    ['hi. yo\t..go\n.', ['hi.', 'yo', '..go', '.']],
  ]) {
    const chars = Object.freeze(Array.from(text, (char, index) => Object.freeze({
      char, startTime: 1000 + index * 40, endTime: 1040 + index * 40,
      sourceUnitIndex: index, karaokeWordIndex: 9,
    })));
    const before = plain(chars);
    const ranges = h.context.api.getKaraokeExpressiveUnitRanges(chars);
    const units = h.context.api.classifyKaraokeExpressiveUnits(chars);
    assert.deepEqual(piecesOf(chars, ranges), expected, text);
    assert.deepEqual(piecesOf(chars, units.wordRanges.values()), expected, text);
    assert.deepEqual(Array.from(units.wordStarts), Array.from(ranges, range => range.startIndex), text);
    assert.ok(Array.from(ranges).every(range => range.charCount > 0), text);
    assert.deepEqual(plain(chars), before, 'classification preserves every source field');
  }
  const old = expressive('en', baseline), chars = [{ char: 'hi' }, { char: '.' }, { char: 'yo' }];
  assert.deepEqual(piecesOf(chars, old.context.api.getKaraokeExpressiveUnitRanges(chars)), ['hi.yo']);
  assert.deepEqual(piecesOf(chars, h.context.api.getKaraokeExpressiveUnitRanges(chars)), ['hi.', 'yo']);
});

test('bounded ranges retain source indices and never inspect adjacent source words', () => {
  const h = expressive(), chars = Array.from('head...tail.end', char => ({ char }));
  for (const [start, count, expected] of [
    [4, 7, [{ startIndex: 4, charCount: 7 }]],
    [7, 5, [{ startIndex: 7, charCount: 5 }]],
    [5, 9, [{ startIndex: 5, charCount: 7 }, { startIndex: 12, charCount: 2 }]],
    [12, 99, [{ startIndex: 12, charCount: 3 }]],
    [4, 0, []], [chars.length, 10, []],
  ]) assert.deepEqual(plain(h.context.api.getKaraokeExpressiveUnitRanges(chars, start, count)), expected);

  const cells = ['hi', '.-', '..', 'yo', null, '', 'go', '.', 'on'].map(char => ({ char }));
  assert.deepEqual(piecesOf(cells, h.context.api.getKaraokeExpressiveUnitRanges(cells)),
    ['hi.-..', 'yo', 'go.', 'on']);
});

test('straight/curly apostrophes and Japanese prolonged sound marks stay attached', () => {
  for (const [text, expected, locale] of [
    ["isn't.don't", ["isn't.", "don't"], 'en'],
    ['isn’t.don’t', ['isn’t.', 'don’t'], 'en'],
    ["'tis.rock’n’roll", ["'tis.", 'rock’n’roll'], 'en'],
    ['パーティー.ゴー-イェー', ['パーティー.', 'ゴー-', 'イェー'], 'ja'],
    ['パーティーゴー', ['パーティーゴー'], 'ja'],
  ]) {
    const h = expressive(locale), chars = Array.from(text, (char, index) => ({
      char, startTime: 1000 + index * 40, endTime: 1040 + index * 40,
    }));
    assert.deepEqual(piecesOf(chars, h.context.api.getKaraokeExpressiveUnitRanges(chars)), expected);
    const modes = Array.from(h.context.api.classifyKaraokeExpressiveUnits(chars).charModes);
    assert.ok(modes.every(mode => mode === (locale === 'ja' ? 'char' : 'word')));
    const line = sourceLine([[text, 1000, 2400]]);
    const tree = h.render(line, 1300, { renderGranularity: 'word', liveClock });
    assert.deepEqual(movingWords(tree).map(fillText), expected);
    assert.equal(fillText(tree), text);
  }
});

test('period pieces keep the existing held/long-word classifier and punctuation budget', () => {
  const h = expressive(), previous = expressive('en', baseline);
  for (const text of ['planet.abcdefg yo', 'abcdefg...planet yo', 'planet....yo ok',
    'abcdefghijklmnopqrstuvwx.yo ok', "isn't.1234567 yo"]) {
    const chars = timedCharsFor(h, makeLine(text));
    const hyphenChars = chars.map(info => ({ ...info, char: info.char === '.' ? '-' : info.char }));
    const actual = h.context.api.classifyKaraokeExpressiveUnits(chars);
    const expected = previous.context.api.classifyKaraokeExpressiveUnits(hyphenChars);
    assert.deepEqual(Array.from(actual.charModes), Array.from(expected.charModes), text);
    assert.deepEqual(plain([...actual.wordRanges]), plain([...expected.wordRanges]), text);
  }
  const units = h.context.api.classifyKaraokeExpressiveUnits(timedCharsFor(h, makeLine('planet.abcdefg yo')));
  assert.deepEqual(Array.from(units.charModes),
    [...Array(7).fill('word'), ...Array(7).fill('emphasis'), null, 'word', 'word']);
  assert.deepEqual(plain(units.wordRanges.get(0)), { startIndex: 0, charCount: 7 },
    'a period cannot count as the seventh sung letter');
  const fallback = h.context.api.classifyKaraokeExpressiveUnits(timedCharsFor(h, makeLine('hi.yo')), false);
  assert.deepEqual(Array.from(fallback.charModes), Array(5).fill('char'));
  assert.equal(fallback.wordRanges.size, 0, 'the caller still controls whether word wrappers are available');
});

test('period motion uses existing corrected fill windows without rewriting source timing', () => {
  const h = expressive();
  const chars = Object.freeze(Array.from('hi.yo', (char, index) => Object.freeze({
    char, startTime: 0, endTime: 20_000, sourceUnitIndex: index,
    karaokeFillStartTime: 1000 + index * 40, karaokeFillEndTime: 1040 + index * 40,
  })));
  const before = plain(chars), units = h.context.api.classifyKaraokeExpressiveUnits(chars);
  assert.deepEqual(Array.from(units.charModes), Array(5).fill('word'));
  const data = { timedChars: chars, wordTimed: false, expressive: true, expressiveUnits: units };
  assert.deepEqual(plain(h.context.api.createKaraokeLiveUnit('w:0:3', data).expressive),
    { startTime: 1000, endTime: 1120, emphasis: false });
  assert.deepEqual(plain(h.context.api.createKaraokeLiveUnit('w:3:2', data).expressive),
    { startTime: 1120, endTime: 1200, emphasis: false });
  assert.deepEqual(plain(chars), before);
});

test('production character rendering splits periods with identical fill, source text and live glyph keys', () => {
  for (const text of ['hi.yo', 'hi..yo', '...hi...yo...', 'hi.yo go', '...hi...yo... go',
    "hi.-isn't..go-yes ok", 'hi.yo-go']) {
    for (const live of [false, true]) {
      const h = expressive(), classic = createHarness(), line = makeLine(text), before = plain(line);
      const chars = timedCharsFor(h, line), units = h.context.api.classifyKaraokeExpressiveUnits(chars);
      const props = live ? { liveClock } : {};
      for (const position of [900, 1000, 1330, 1550, 2150, 6000, 1200]) {
        const tree = h.render(line, position, props), words = nodes(tree, 'is-expressive-unit');
        assert.ok(words.length > 0, `${text}: the production renderer must use moving word wrappers`);
        assert.ok(nodes(tree, 'lyrics-karaoke-line')[0].props.className.split(' ').includes('has-word-wrap'), text);
        if (text === 'hi.yo') assert.deepEqual(words.map(fillText), ['hi.', 'yo']);
        if (text === 'hi..yo') assert.deepEqual(words.map(fillText), ['hi..', 'yo']);
        if (text === '...hi...yo...') assert.deepEqual(words.map(fillText), ['...hi...', 'yo...']);
        assert.equal(fillText(tree), text);
        assert.deepEqual(glyphStates(tree), glyphStates(classic.render(line, position, props)), `${text}/${live}/${position}`);
        assert.deepEqual(words.map(fillText), piecesOf(chars, units.wordRanges.values()));
        if (live) assert.deepEqual(words.map(word => word.props['data-karaoke-live']),
          Array.from(units.wordRanges.values(), ({ startIndex, charCount }) => `w:${startIndex}:${charCount}`));
      }
      assert.deepEqual(plain(line), before);
    }
  }
});

test('period-only, edge-only and apostrophe/prolonged-mark lines do not acquire word wrappers', () => {
  for (const text of ['.', '...', 'hi.', '...hi', 'hi...', "isn't", 'isn’t', 'パーティー', 'hi…yo', 'hi．yo']) {
    for (const live of [false, true]) {
      const h = expressive(), previous = expressive('en', baseline), line = makeLine(text);
      const props = live ? { liveClock } : {};
      for (const position of [900, 1100, 1500, 5000, 1200]) {
        const tree = h.render(line, position, props);
        assert.equal(nodes(tree, 'lyrics-karaoke-word').length, 0, text);
        assert.deepEqual(plain(tree), plain(previous.render(line, position, props)), `${text}/${live}/${position}`);
      }
    }
  }
});

test('word display retains the exact production tree when the period wrapper gate is enabled', () => {
  for (const live of [false, true]) for (const text of ['hi.yo', 'hi..yo', '...hi...yo...', "isn't.go"]) {
    for (const wordSource of [false, true]) {
      const h = expressive(), previous = expressive('en', beforeWrapperChange);
      const line = wordSource ? sourceLine([[text, 1000, 2600]]) : makeLine(text);
      const before = plain(line);
      const props = { renderGranularity: 'word', ...(live ? { liveClock } : {}) };
      for (const position of [900, 1000, 1100, 1550, 5000, 1200]) {
        assert.deepEqual(plain(h.render(line, position, props)), plain(previous.render(line, position, props)),
          `${text}/${wordSource}/${live}/${position}`);
      }
      assert.deepEqual(plain(line), before);
    }
  }
});

test('period splits preserve astral glyph indices, inline selection ranges, ruby and editor readings', () => {
  for (const live of [false, true]) {
    const h = expressive(), classic = createHarness(), line = makeLine("A😀.B..C-isn't");
    Object.assign(line.syllables[3], { inlineStyle: true, styleKind: 'wave', styleSpeaker: 'FEMALE 1' });
    const before = plain(line);
    const props = harness => ({ ...(live ? { liveClock } : {}), globalCharOffset: 7,
      furiganaMapOverride: mapIn(harness, [[3, 'ruby-B'], [6, 'ruby-C']]),
      charReadings: mapIn(harness, [[0, 'first'], [3, { text: 'reading-B', dx: 12 }], [6, 'reading-C']]),
    });
    const currentProps = props(h), classicProps = props(classic);
    for (const position of [900, 1300, 1700, 5000, 1200]) {
      const tree = h.render(line, position, currentProps), expected = classic.render(line, position, classicProps);
      assert.deepEqual(movingWords(tree).map(fillText), ['A😀.', 'B..', 'C-', "isn't"]);
      assert.deepEqual(glyphStates(tree), glyphStates(expected));
      const ranges = rendered => nodes(rendered).filter(node => node.props.style?.['--ivlyrics-range-index'] !== undefined)
        .map(node => [node.props.style['--ivlyrics-range-index'], fillText(node)]);
      assert.ok(ranges(tree).some(([index]) => index === 3), 'styled glyph index survives the astral symbol');
      assert.deepEqual(ranges(tree), ranges(expected));
      for (const name of ['lyrics-karaoke-ruby', 'lyrics-karaoke-char-reading']) {
        assert.ok(nodes(tree, name).length > 0);
        assert.deepEqual(withoutMotion(nodes(tree, name)), withoutMotion(nodes(expected, name)), `${name}/${live}/${position}`);
      }
      assert.equal(fillText(tree), line.text);
    }
    assert.deepEqual(plain(line), before);
  }
});

test('word display retains its original shared source onset/end and fill after period splitting', () => {
  for (const live of [false, true]) {
    const h = expressive(), previous = expressive('en', baseline);
    const line = sourceLine([["hi..yo-isn't.go", 1000, 2600]]), before = plain(line);
    const data = liveDataFor(h, line, true), timedBefore = plain(data.timedChars);
    const props = { renderGranularity: 'word', ...(live ? { liveClock } : {}) };
    for (const position of [999, 1000, 1100, 1700, 2599, 5000, 1100]) {
      const tree = h.render(line, position, props), words = movingWords(tree);
      assert.deepEqual(words.map(fillText), ['hi..', 'yo-', "isn't.", 'go']);
      assert.deepEqual(glyphStates(tree), glyphStates(previous.render(line, position, props)));
      if (live) for (const word of words) {
        const unit = h.context.api.createKaraokeLiveUnit(word.props['data-karaoke-live'], data);
        assert.deepEqual(plain(unit.expressive), { startTime: 1000, endTime: 2600, emphasis: false });
      }
    }
    assert.deepEqual(plain(data.timedChars), timedBefore);
    assert.deepEqual(plain(line), before);
  }
});

test('separately timed period pieces keep their source windows and a shared word annotation is not duplicated', () => {
  const h = expressive(), line = sourceLine([['hi.', 1000, 1500], ['yo..', 1600, 2100], ["isn't", 2200, 2600]]);
  const data = liveDataFor(h, line, true);
  const tree = h.render(line, 1650, { renderGranularity: 'word', liveClock }), words = movingWords(tree);
  assert.deepEqual(words.map(fillText), ['hi.', 'yo..', "isn't"]);
  assert.deepEqual(words.map(word => word.props['data-karaoke-live']), ['w:0:3', 'w:3:4', 'w:7:5']);
  assert.deepEqual(words.map(word => plain(h.context.api.createKaraokeLiveUnit(word.props['data-karaoke-live'], data).expressive)),
    line.syllables.map(({ startTime, endTime }) => ({ startTime, endTime, emphasis: false })));

  const shared = sourceLine([["hi..yo-isn't.go", 1000, 2600]]), sharedData = liveDataFor(h, shared, true);
  const glyphs = nodes(h.render(shared, 1100, { renderGranularity: 'word' }), 'lyrics-karaoke-char');
  const stacked = h.context.api.buildKaraokeWordElements(sharedData.timedChars, glyphs, {
    position: 1100, isActive: true, wordTimed: true, livePaint: true, motionStyle: 'expressive',
    wordSupplementByKey: mapIn(h, [[0, { reading: 'one reading', gloss: 'one gloss' }]]),
  });
  assert.equal(nodes(stacked, 'lyrics-karaoke-word-stack').length, 1);
  assert.deepEqual(movingWords(stacked).map(fillText), ['hi..', 'yo-', "isn't.", 'go']);
  assert.deepEqual(nodes(stacked, 'lyrics-karaoke-word-reading').map(textOf), ['one reading']);
  assert.deepEqual(nodes(stacked, 'lyrics-karaoke-word-gloss').map(textOf), ['one gloss']);
});

test('the production live painter follows period source windows and leaves fill identical to Classic across seeks', () => {
  const line = makeLine('hi.yo-go');
  const attach = (h, enabled) => {
    const tree = h.render(line, 900, { liveClock }), data = liveDataFor(h, line, false, enabled);
    const elements = new Map(nodes(tree).filter(node => node.props?.['data-karaoke-live']).map(node => {
      const key = node.props['data-karaoke-live'], values = new Map();
      return [key, { values, getAttribute: () => key, style: {
        setProperty: (name, value) => values.set(name, value), removeProperty: name => values.delete(name),
      } }];
    }));
    let position = 900, frameTime = 10_000;
    const entry = { units: new Map(), data: null, lastPosition: NaN };
    const sync = () => h.context.api.syncKaraokeLiveEntry(entry,
      { querySelectorAll: () => Array.from(elements.values()) }, { getPosition: () => position }, null, data);
    sync();
    return { data, entry, elements, sync, paint(next) {
      position = next;
      return h.context.api.paintKaraokeLiveEntry(entry, frameTime += 16);
    } };
  };
  const h = expressive(), live = attach(h, true), classic = attach(createHarness(), false);
  assert.deepEqual(Array.from(live.entry.units).filter(([key]) => key.startsWith('w:')).map(([key, unit]) =>
    [key, unit.expressive.startTime, unit.expressive.endTime]),
  [['w:0:3', 1000, 1330], ['w:3:3', 1330, 1660], ['w:6:2', 1660, 1880]]);
  assert.equal(h.context.api.createKaraokeLiveUnit('w:0:8', live.data), null, 'stale unsplit ranges cannot animate');
  const fills = attached => Array.from(attached.elements, ([key, element]) => [key,
    ...['--karaoke-char-fill', '--karaoke-char-fill-soft-start', '--karaoke-char-fill-soft-end']
      .map(name => element.values.get(name))]).filter(([key]) => key.startsWith('g:'));
  for (const position of [999, 1050, 1350, 1700, 5000, 1100]) {
    live.paint(position); classic.paint(position);
    assert.deepEqual(fills(live), fills(classic), `live fill at ${position}`);
    if (position === 1050) {
      assert.ok(live.elements.get('w:0:3').values.has('--karaoke-bounce-scale'));
      assert.equal(live.elements.get('w:3:3').values.size, 0);
    }
    if (position === 1350) assert.ok(live.elements.get('w:3:3').values.has('--karaoke-bounce-scale'));
    if (position === 1700) assert.ok(live.elements.get('w:6:2').values.has('--karaoke-bounce-scale'));
  }
  const retained = live.entry.units.get('w:0:3');
  const snapshot = plain(Array.from(live.elements, ([key, element]) => [key, [...element.values]]));
  live.sync();
  assert.equal(live.entry.units.get('w:0:3'), retained);
  live.paint(1100);
  assert.deepEqual(plain(Array.from(live.elements, ([key, element]) => [key, [...element.values]])), snapshot);
});

test('Classic, unset and motion-off settings retain the exact pre-change character/word trees', () => {
  for (const visual of [
    { 'karaoke-motion-style': 'classic' }, {},
    { 'karaoke-motion-style': 'expressive', 'karaoke-bounce': false },
    { 'karaoke-motion-style': 'expressive', 'reduce-motion': true },
  ]) for (const live of [false, true]) for (const renderGranularity of ['character', 'word']) {
    const h = createHarness(undefined, { visual }), previous = createHarness(baseline, { visual });
    for (const line of [makeLine('hi.yo'), makeLine('hi..yo'), makeLine('...hi...yo...'),
      makeLine("hi..isn't.-go yo"), sourceLine([['hi.yo', 1000, 2600]]), sourceLine([["hi..isn't.-go", 1000, 2600]])]) {
      const props = harness => ({ renderGranularity, ...(live ? { liveClock } : {}),
        furiganaMapOverride: mapIn(harness, [[4, 'ruby']]),
        charReadings: mapIn(harness, [[4, { text: 'reading', dx: 12 }]]),
      });
      const currentProps = props(h), previousProps = props(previous);
      for (const position of [900, 1100, 1550, 5000, 1200]) assert.deepEqual(
        plain(h.render(line, position, currentProps)), plain(previous.render(line, position, previousProps)),
        `${JSON.stringify(visual)}/${live}/${renderGranularity}/${position}`);
    }
  }
});
