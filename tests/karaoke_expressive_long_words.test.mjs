import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

// Reuse the production renderer, grapheme segmenter and word-timing service.
// The hook/element doubles let us inspect React output and attach its actual
// live keys to the production painter without loading a Spotify session.
const harnessUrl = new URL('./karaoke_static_render_cache.test.mjs', import.meta.url);
const fixture = readFileSync(harnessUrl, 'utf8');
const from = fixture.indexOf('const currentSource =');
const to = fixture.indexOf("test('vocal presence");
assert.ok(from >= 0 && to > from);
const harnessSource = fixture.slice(from, to)
  .replaceAll('import.meta.url', JSON.stringify(harnessUrl.href))
  .replace('getKaraokeVocalRows };', 'getKaraokeVocalRows, buildKaraokeTimedChars, '
    + 'applyKaraokeWhitespaceCompensation, assignKaraokeWordIndexes, '
    + 'classifyKaraokeExpressiveUnits, getKaraokeMotionProfile, '
    + 'syncKaraokeLiveEntry, paintKaraokeLiveEntry };')
  .replace('createElement: (tag, props, ...children) => ({ tag, props: props || {}, children })',
    `createElement: (tag, props, ...children) => {
      if (String(props?.key || '').startsWith('karaoke-char-'))
        counts.glyphElements = (counts.glyphElements || 0) + 1;
      return { tag, props: props || {}, children };
    }`);
assert.ok(harnessSource.includes('paintKaraokeLiveEntry };'));
assert.ok(harnessSource.includes('counts.glyphElements'));
const { createHarness, currentSource } = new Function('assert', 'execFileSync', 'readFileSync', 'vm',
  `${harnessSource}\nreturn { createHarness, currentSource };`)(assert, execFileSync, readFileSync, vm);
const hasReleaseTag = (() => {
  try {
    execFileSync('git', ['rev-parse', '--verify', '--quiet', 'v7.0.10^{commit}'], {
      cwd: new URL('..', import.meta.url), stdio: ['ignore', 'pipe', 'ignore'],
    });
    return true;
  } catch {
    return false;
  }
})();
const releasedSource = hasReleaseTag ? execFileSync('git', ['show', 'v7.0.10:Pages.js'], {
  cwd: new URL('..', import.meta.url), encoding: 'utf8',
}) : null;
// Skip (not fail) comparisons against the released build when the tag is not fetched.
const skipWithoutReleaseTag = t => {
  if (releasedSource === null) t.skip('tag v7.0.10 not fetched');
  return releasedSource === null;
};

const harness = ({ visual = {}, locale = 'ru', reduced = false } = {}, source = currentSource) => {
  const marker = 'const classifyKaraokeExpressiveUnits = (timedChars, allowWordMotion = true) => {';
  assert.ok(source.includes(marker));
  const h = createHarness(source.replace(marker,
    `${marker} counts.classifications = (counts.classifications || 0) + 1;`), {
    locale, visual: { 'karaoke-motion-style': 'expressive', ...visual },
  });
  let now = 10_000;
  h.context.performance = { now: () => now };
  h.window.reducedMotion = reduced;
  h.advance = milliseconds => { now += milliseconds; };
  return h;
};
const plain = value => JSON.parse(JSON.stringify(value));
const graphemes = text => Array.from(new Intl.Segmenter('ru', { granularity: 'grapheme' }).segment(text),
  part => part.segment);
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
const hasClass = (node, name) => node.props.className?.split(' ').includes(name);
const movingWords = tree => nodes(tree, 'lyrics-karaoke-word').filter(node =>
  hasClass(node, 'is-expressive-unit') || hasClass(node, 'is-word-timed'));
const mapIn = (h, entries) => vm.runInContext(`new Map(${JSON.stringify(entries)})`, h.context);
const liveClock = { getPosition: () => NaN };
const bounceProperties = ['--karaoke-bounce-y', '--karaoke-bounce-scale', '--karaoke-motion-glow'];
// Ruby shares its glyph's intentional motion. Compare every annotation and
// fill property while excluding only the changed spring pose/active flag.
const withoutMotion = tree => JSON.parse(JSON.stringify(tree, (key, value) => {
  if (key === 'className' && typeof value === 'string')
    return value.split(' ').filter(name => name !== 'is-bouncing').join(' ');
  if (key === 'style' && value) return Object.fromEntries(Object.entries(value)
    .filter(([name]) => !bounceProperties.includes(name)));
  return value;
}));

const lineFromParts = (parts, wordSource = false) => {
  let cursor = 1000;
  const syllables = [];
  for (const [text, duration] of parts) {
    const cells = wordSource ? [text] : graphemes(text);
    cells.forEach((cell, index) => syllables.push({ text: cell,
      startTime: cursor + duration * index / cells.length,
      endTime: cursor + duration * (index + 1) / cells.length }));
    cursor += duration;
  }
  return { text: parts.map(([text]) => text).join(''), startTime: 1000, endTime: cursor,
    karaokeGranularity: wordSource ? 'word' : 'character', syllables };
};
// Always include another word: an isolated unspaced word already takes the
// per-glyph fallback and would conceal a broken long-word eligibility change.
const wordLine = (word, duration) => lineFromParts([[word, duration], [' ', 110], ['yo', 220]]);
const russianLine = () => lineFromParts([['длинный', 770], [' ', 110], ['красивый', 880]]);
const timedCharsFor = (h, line, wordTimed = false) => {
  const api = h.context.api;
  const chars = api.applyKaraokeWhitespaceCompensation(api.buildKaraokeTimedChars(line));
  return wordTimed ? api.assignKaraokeWordIndexes(chars, line.karaokeGranularity === 'word', h.window.locale) : chars;
};
const liveDataFor = (h, line, expressive = true) => {
  const timedChars = timedCharsFor(h, line);
  return { timedChars, wordTimed: false, segmentsByStart: null, expressive,
    motionProfiles: timedChars.map((_, index) => h.context.api.getKaraokeMotionProfile(timedChars, index)),
    expressiveUnits: expressive ? h.context.api.classifyKaraokeExpressiveUnits(timedChars) : null };
};
const attachLive = (h, line, expressive = true) => {
  let position = 900, frameTime = 10_000, writes = 0;
  const tree = h.render(line, position, { liveClock });
  const elements = new Map(nodes(tree).filter(node => node.props?.['data-karaoke-live']).map(node => {
    const key = node.props['data-karaoke-live'], values = new Map();
    return [key, { values, getAttribute: () => key, style: {
      setProperty: (name, value) => { writes++; values.set(name, String(value)); },
      removeProperty: name => { writes++; values.delete(name); },
    } }];
  }));
  assert.ok(elements.size > 0, 'attach keys emitted by the production React renderer');
  const root = { querySelectorAll: () => Array.from(elements.values()) };
  const clock = { getPosition: () => position };
  const data = liveDataFor(h, line, expressive);
  const entry = { units: new Map(), data: null, lastPosition: NaN };
  const sync = (next = entry.data || data) => h.context.api.syncKaraokeLiveEntry(entry, root, clock, null, next);
  sync(data);
  const paint = next => {
    position = next;
    frameTime += 1000 / 120;
    return h.context.api.paintKaraokeLiveEntry(entry, frameTime);
  };
  return { entry, elements, sync, paint,
    advanceTo(next) {
      assert.ok(next >= position);
      while (position + 1000 / 120 < next) paint(position + 1000 / 120);
      paint(next);
    },
    snapshot: () => plain(Array.from(elements, ([key, element]) => [key, [...element.values]])),
    get writes() { return writes; },
  };
};
const glyphStates = tree => nodes(tree, 'lyrics-karaoke-char').map(node => ({
  key: node.props.key, text: node.props['data-outline-text'], live: node.props['data-karaoke-live'],
  range: node.props.style?.['--ivlyrics-range-index'],
  state: node.props.className.match(/char--(pending|active|done)/)?.[1],
  fill: node.props.style?.['--karaoke-char-fill'],
  softStart: node.props.style?.['--karaoke-char-fill-soft-start'],
  softEnd: node.props.style?.['--karaoke-char-fill-soft-end'],
}));

test('spaced Russian seven/eight-letter words swell successively before either reaches one second', t => {
  if (skipWithoutReleaseTag(t)) return;
  const h = harness(), line = russianLine();
  const previous = harness({}, releasedSource);
  assert.deepEqual(movingWords(previous.render(line, 900)).map(fillText), ['длинный', 'красивый']);
  const chars = timedCharsFor(h, line), before = plain(chars);
  const units = h.context.api.classifyKaraokeExpressiveUnits(chars);
  assert.deepEqual(Array.from(units.charModes), [...Array(7).fill('emphasis'), null, ...Array(8).fill('emphasis')]);
  assert.equal(units.wordRanges.size, 0);
  assert.deepEqual(plain(chars), before, 'classification cannot rewrite source glyphs or timing');
  h.render(line, 900);
  for (const [position, start, count] of [[1250, 0, 7], [2150, 8, 8]]) {
    h.advance(80);
    const tree = h.render(line, position);
    assert.equal(fillText(tree), line.text);
    assert.equal(movingWords(tree).length, 0);
    const letters = nodes(tree, 'lyrics-karaoke-char').slice(start, start + count);
    const sung = letters.filter(node => hasClass(node, 'is-bouncing'));
    assert.ok(sung.length > 0 && sung.length < count, 'only letters already reached may spring');
    assert.ok(letters.some(node => hasClass(node, 'lyrics-karaoke-char--pending')));
    assert.ok(sung.every(node => /em$/.test(node.props.style['--karaoke-bounce-y'])));
  }
});

test('duration and length boundaries select visible glyph motion rather than a moving word wrapper', () => {
  const cases = [
    ['длинный', 599, false], ['длинный', 600, true], ['красивый', 880, true],
    ['extraordinary', 599, false], ['extraordinary', 600, true],
    ['characteristic', 629, false], ['characteristic', 630, true],
    ['abcdefghijklmnopqrstuvw', 1000, false], ['abcdefghijklmnopqrstuvw', 1035, true],
    ['abcdefghijklmnopqrstuvwx', 1079, false], ['abcdefghijklmnopqrstuvwx', 1080, true],
    ['abcdefghijklmnopqrstuvwxy', 2000, false],
    ['planet', 999, false], ['planet', 1000, true],
    ['abcdefghijkl', 1000, true],
  ];
  for (const [word, duration, eligible] of cases) {
    const label = `${word}/${duration}ms`, h = harness(), line = wordLine(word, duration);
    const chars = timedCharsFor(h, line), count = graphemes(word).length;
    const units = h.context.api.classifyKaraokeExpressiveUnits(chars);
    assert.deepEqual(Array.from(units.charModes).slice(0, count),
      Array(count).fill(eligible ? 'emphasis' : 'word'), label);
    assert.equal(units.wordRanges.has(0), !eligible, label);
    if (!eligible) assert.deepEqual(plain(units.wordRanges.get(0)), { startIndex: 0, charCount: count }, label);
    h.render(line, 900);
    h.advance(80);
    const tree = h.render(line, 1000 + duration / 3);
    assert.equal(movingWords(tree).some(node => fillText(node) === word), !eligible, label);
    const letters = nodes(tree, 'lyrics-karaoke-char').slice(0, count);
    const moving = letters.filter(node => hasClass(node, 'is-bouncing'));
    if (eligible) {
      assert.ok(moving.length > 0 && moving.length < count, `${label}: successive letters move independently`);
      assert.ok(moving.every(node => /em$/.test(node.props.style['--karaoke-bounce-y'])), label);
    } else assert.equal(moving.length, 0, `${label}: the wrapper owns motion`);
    assert.equal(fillText(tree), line.text, label);
  }
});

test('letters/numbers qualify while punctuation and emoji cannot inflate the sung-letter count', () => {
  for (const [word, duration, eligible] of [
    ['planet!', 880, false], ['planet---', 880, false], ['plan😀et', 880, false],
    ["plan'et", 880, false], ['123456!', 880, false], ['1234567', 600, true],
    ['abcdefg!', 600, true], ['abcdefg😀', 600, true],
    // The astral symbol is one grapheme: the first range is 24 cells, not
    // 25 UTF-16 code units, whereas the second really is over the cap.
    ['abcdefghijklmnopqrstuvw😀', 1080, true], ['abcdefghijklmnopqrstuvwx😀', 2000, false],
    // Punctuation still consumes draw/motion budget even though it is not sung.
    ['abcdefg.................', 1079, false], ['abcdefg.................', 1080, true],
  ]) {
    const h = harness(), line = wordLine(word, duration), label = `${word}/${duration}`;
    const units = h.context.api.classifyKaraokeExpressiveUnits(timedCharsFor(h, line));
    assert.equal(units.charModes[0], eligible ? 'emphasis' : 'word', label);
    const tree = h.render(line, 1200);
    assert.equal(movingWords(tree).some(node => fillText(node) === word), !eligible, label);
    assert.equal(fillText(tree), line.text, label);
  }
});

test('hyphen pieces retain their own windows and a six-letter piece stays a whole word', () => {
  for (const hyphen of ['-', '\u2010', '\u2011']) {
    const h = harness(), text = `planet${hyphen}красивый`, line = wordLine(text, 1650);
    const data = liveDataFor(h, line), before = plain(data.timedChars);
    assert.deepEqual(Array.from(data.expressiveUnits.charModes).slice(0, 15),
      [...Array(7).fill('word'), ...Array(8).fill('emphasis')]);
    assert.deepEqual(plain(data.expressiveUnits.wordRanges.get(0)), { startIndex: 0, charCount: 7 });
    assert.equal(data.expressiveUnits.wordStarts.has(7), false);
    const live = attachLive(h, line);
    assert.ok(live.elements.has('w:0:7'));
    assert.equal(live.elements.has('w:7:8'), false);
    assert.deepEqual(plain(live.entry.units.get('w:0:7').expressive),
      { startTime: 1000, endTime: 1770, emphasis: false });
    assert.deepEqual(plain(live.entry.units.get('g:7').expressive),
      { startTime: 1770, endTime: 1880, emphasis: true });
    live.advanceTo(1850);
    assert.ok(live.elements.get('g:7').values.has('--karaoke-bounce-scale'));
    assert.equal(live.elements.get('g:14').values.has('--karaoke-bounce-scale'), false);
    assert.deepEqual(plain(data.timedChars), before);
  }
});

test('the live painter animates separate Russian and 13-to-24-cell words on their existing glyph windows', () => {
  for (const [word, duration] of [['длинный', 770], ['красивый', 880],
    ['extraordinary', 900], ['abcdefghijklmnopqrstuvwx', 1200]]) {
    const h = harness(), line = wordLine(word, duration), live = attachLive(h, line);
    const count = graphemes(word).length, data = live.entry.data;
    assert.equal(live.elements.has(`w:0:${count}`), false, word);
    for (let index = 0; index < count; index++) {
      const char = data.timedChars[index];
      assert.deepEqual(plain(live.entry.units.get(`g:${index}`).expressive), {
        startTime: char.karaokeFillStartTime ?? char.startTime,
        endTime: char.karaokeFillEndTime ?? char.endTime, emphasis: true,
      }, `${word}/${index}: do not invent a different onset or duration`);
    }
    live.advanceTo(1000 + duration / 3);
    const first = live.elements.get('g:0').values, last = live.elements.get(`g:${count - 1}`).values;
    assert.match(first.get('--karaoke-bounce-y'), /em$/, word);
    assert.equal(last.has('--karaoke-bounce-scale'), false, `${word}: unreached letters remain at rest`);
    const scales = Array.from({ length: count }, (_, index) =>
      live.elements.get(`g:${index}`).values.get('--karaoke-bounce-scale')).filter(value => value !== undefined);
    assert.ok(new Set(scales).size > 1, `${word}: sung glyphs have independent spring poses`);
    live.advanceTo(line.endTime + 900);
    assert.ok(Array.from(live.elements.values()).every(element =>
      bounceProperties.every(name => !element.values.has(name))), `${word}: every spring settles`);
  }
});

test('expanded motion retains source fill, ruby, readings and selection/live indices across seeks', t => {
  if (skipWithoutReleaseTag(t)) return;
  const line = lineFromParts([['A😀', 220], [' ', 110], ['длинный', 770], [' ', 110],
    ['abcdefghijklmnopqrstuvwx', 1200]]);
  // Selection indices are emitted for styled runs. An unstyled fixture would
  // only compare two empty range lists and miss an index regression.
  Object.assign(line.syllables[3], { inlineStyle: true, styleKind: 'wave', styleSpeaker: 'FEMALE 1' });
  const original = plain(line);
  for (const live of [false, true]) {
    const current = harness(), released = harness({}, releasedSource);
    const props = h => ({ ...(live ? { liveClock } : {}), globalCharOffset: 7,
      furiganaMapOverride: mapIn(h, [[3, 'ruby']]),
      charReadings: mapIn(h, [[3, { text: 'reading', dx: 12 }], [11, 'second']]),
    });
    const currentProps = props(current), previousProps = props(released);
    for (const position of [900, 1000, 1200, 1450, 1900, 2400, 5000, 1450]) {
      current.advance(16); released.advance(16);
      const actual = current.render(line, position, currentProps);
      const expected = released.render(line, position, previousProps);
      assert.deepEqual(glyphStates(actual), glyphStates(expected), `fill/state/live keys at ${position}/${live}`);
      assert.ok(nodes(actual, 'lyrics-karaoke-ruby').length > 0);
      assert.deepEqual(nodes(actual, 'lyrics-karaoke-char-reading').map(textOf), ['reading', 'second']);
      for (const name of ['lyrics-karaoke-ruby', 'lyrics-karaoke-char-reading'])
        assert.deepEqual(withoutMotion(nodes(actual, name)), withoutMotion(nodes(expected, name)), `${name}/${position}/${live}`);
      const ranges = tree => nodes(tree).filter(node => node.props?.style?.['--ivlyrics-range-index'] !== undefined)
        .map(node => [node.props.key, node.props.style['--ivlyrics-range-index']]);
      assert.ok(ranges(actual).some(([, index]) => index === 3), 'the styled glyph retains its index after an astral symbol');
      assert.deepEqual(ranges(actual), ranges(expected), `selection ranges at ${position}/${live}`);
      assert.equal(fillText(actual), line.text);
    }
  }
  assert.deepEqual(plain(line), original, 'rendering cannot modify the submitted timing source');
  const expressive = attachLive(harness(), line), classic = attachLive(harness({ visual: { 'karaoke-motion-style': 'classic' } }), line, false);
  const fills = live => Array.from(live.elements, ([key, element]) => [key,
    ...['--karaoke-char-fill', '--karaoke-char-fill-soft-start', '--karaoke-char-fill-soft-end']
      .map(name => element.values.get(name))]).filter(([key]) => key.startsWith('g:'));
  for (const position of [900, 1050, 1450, 2100, 5000, 1450]) {
    expressive.paint(position); classic.paint(position);
    assert.deepEqual(fills(expressive), fills(classic), `live fill remains source-driven at ${position}`);
  }
});

test('shaped scripts and combining/ZWJ clusters retain the released React trees', t => {
  if (skipWithoutReleaseTag(t)) return;
  for (const [word, locale] of [['длинныи\u0306', 'ru'], ['مرحبابالعالم', 'ar'],
    ['अच्छागाना', 'hi'], ['abcdefg👩‍👩‍👧‍👦', 'en']]) for (const live of [false, true]) {
    const line = wordLine(word, 1400), current = harness({ locale }), released = harness({ locale }, releasedSource);
    const props = live ? { liveClock } : {};
    for (const position of [900, 1200, 1800, 5000, 1250]) {
      current.advance(16); released.advance(16);
      const actual = current.render(line, position, props);
      assert.ok(nodes(actual, 'lyrics-karaoke-text-run-segment').length > 0, word);
      assert.deepEqual(plain(actual), plain(released.render(line, position, props)), `${locale}/${live}/${position}`);
    }
  }
});

test('word display and Classic/motion-off settings keep their released behavior on longer words', t => {
  if (skipWithoutReleaseTag(t)) return;
  const cases = [
    ['word display', {}, 'word'], ['Classic', { visual: { 'karaoke-motion-style': 'classic' } }, 'character'],
    ['unset style', { visual: { 'karaoke-motion-style': undefined } }, 'character'],
    ['Bounce off', { visual: { 'karaoke-bounce': false } }, 'character'],
    ['app reduced motion', { visual: { 'reduce-motion': true } }, 'character'],
    ['OS reduced motion', { reduced: true }, 'character'],
  ];
  for (const [label, options, renderGranularity] of cases) for (const live of [false, true]) {
    const line = lineFromParts([['длинный', 770], [' ', 110], ['abcdefghijklmnopqrstuvwx', 1200]], true);
    const current = harness(options), released = harness(options, releasedSource);
    const props = { renderGranularity, ...(live ? { liveClock } : {}) };
    for (const position of [900, 1250, 2100, 5000, 1200]) {
      current.advance(16); released.advance(16);
      assert.deepEqual(plain(current.render(line, position, props)),
        plain(released.render(line, position, props)), `${label}/${live}/${position}`);
    }
  }
});

test('malformed windows fall back and unspaced/script glyph behavior is preserved', () => {
  const h = harness(), api = h.context.api;
  for (const [startTime, endTime] of [[1000, 1000], [1000, 999], [NaN, NaN], [Infinity, Infinity]]) {
    const chars = graphemes('красивый').map(char => Object.freeze({ char, startTime, endTime }));
    Object.freeze(chars);
    assert.ok(Array.from(api.classifyKaraokeExpressiveUnits(chars).charModes).every(mode => mode === 'word'));
  }
  const isolated = lineFromParts([['длинный', 599]]), chars = timedCharsFor(h, isolated);
  assert.ok(Array.from(api.classifyKaraokeExpressiveUnits(chars, false).charModes).every(mode => mode === 'char'));
  assert.equal(nodes(h.render(isolated, 1200), 'lyrics-karaoke-word').length, 0);
  for (const word of ['漢字Hello', '가나다라마바사', 'ภาษาไทย']) {
    const units = api.classifyKaraokeExpressiveUnits(timedCharsFor(h, wordLine(word, 300)));
    assert.ok(Array.from(units.charModes).slice(0, graphemes(word).length).every(mode => mode === 'char'), word);
  }
});

test('live glyph playback reuses preparation and paused React commits cannot advance letter springs', () => {
  const line = russianLine(), h = harness(), props = { liveClock };
  h.render(line, 1200, props);
  h.resetCounts();
  for (let frame = 1; frame <= 120; frame++) h.render(line, 1200 + frame * 1000 / 120, props);
  assert.equal(h.counts.classifications, 0, 'word eligibility is not recalculated on each playback frame');
  assert.equal(h.counts.graphemes, 0, 'grapheme segmentation is prepared once');
  assert.ok(h.counts.glyphElements <= graphemes(line.text).length * 3,
    `only glyph state changes rebuild elements, not all 120 fills (${h.counts.glyphElements})`);
  const paused = plain(h.render(line, 2200, props)), count = h.counts.glyphElements;
  h.advance(1000);
  assert.deepEqual(plain(h.render(line, 2200, props)), paused);
  assert.equal(h.counts.glyphElements, count);
  const rendered = harness();
  rendered.render(line, 1000);
  rendered.advance(80);
  const first = plain(rendered.render(line, 1250));
  rendered.advance(1000);
  assert.deepEqual(plain(rendered.render(line, 1250)), first, 'paused non-live glyph springs also freeze');
});

test('live glyph springs survive equivalent data refreshes and write nothing while paused', () => {
  const h = harness(), line = russianLine(), live = attachLive(h, line);
  live.advanceTo(1250);
  const values = live.snapshot(), writes = live.writes, units = new Map(live.entry.units);
  assert.equal(live.paint(1250), false);
  assert.deepEqual(live.snapshot(), values);
  assert.equal(live.writes, writes);
  const timedChars = live.entry.data.timedChars.map(char => ({ ...char }));
  live.sync({ ...live.entry.data, timedChars,
    expressiveUnits: h.context.api.classifyKaraokeExpressiveUnits(timedChars) });
  for (const [key, unit] of units) assert.equal(live.entry.units.get(key), unit, key);
  live.paint(1250);
  assert.deepEqual(live.snapshot(), values, 'a data refresh at the same clock retains every spring pose');
  assert.equal(live.writes, writes, 'unchanged values do not repaint styles');
  live.paint(1260);
  assert.notDeepEqual(live.snapshot(), values, 'the retained glyph springs resume with playback');
});

test('paused longer-word glyph motion responds to effects/style/bounce/reduced-motion settings', () => {
  for (const [label, disable] of [
    ['Classic', h => { h.CONFIG.visual['karaoke-motion-style'] = 'classic'; }],
    ['Bounce', h => { h.CONFIG.visual['karaoke-bounce'] = false; }],
    ['app reduced motion', h => { h.CONFIG.visual['reduce-motion'] = true; }],
    ['OS reduced motion', h => { h.window.reducedMotion = true; }],
  ]) {
    const h = harness(), live = attachLive(h, russianLine());
    live.advanceTo(1250);
    const glyph = live.elements.get('g:2').values;
    assert.ok(Number(glyph.get('--karaoke-motion-glow')) > 0, label);
    const scale = glyph.get('--karaoke-bounce-scale'), fill = glyph.get('--karaoke-char-fill');
    h.CONFIG.visual['karaoke-text-effects'] = false;
    live.paint(1250);
    assert.equal(Number(glyph.get('--karaoke-motion-glow')), 0);
    assert.equal(glyph.get('--karaoke-bounce-scale'), scale);
    assert.equal(glyph.get('--karaoke-char-fill'), fill);
    disable(h);
    live.paint(1250);
    assert.ok(Array.from(live.elements.values()).every(element =>
      bounceProperties.every(name => !element.values.has(name))), label);
    assert.equal(glyph.get('--karaoke-char-fill'), fill, `${label}: fill remains at its paused source time`);
  }
});
