import { createLyricMainContentRenderer } from "#ivlyrics/lyrics/lyricsLineComponents.mjs";
import assert from 'node:assert/strict';
import test from 'node:test';
import { hasKaraokeVocalRows } from "../src/lyrics/karaokeLinePresentation.mjs";

const renderMain = createLyricMainContentRenderer({
  react: { createElement: (type, props) => ({ type, props }) },
  getKaraokeLine: () => 'KaraokeLine',
  hasKaraokeVocalRows,
});
const single = { text: 'Same source', startTime: 1000, endTime: 5000,
  syllables: [{ text: 'Same source', startTime: 1000, endTime: 5000 }] };
const parallel = { ...single, vocals: { lead: single, background: [
  { text: 'Echo', syllables: [{ text: 'Echo', startTime: 1200, endTime: 4000 }] },
] } };
const render = (line, props = {}) => renderMain({
  isKara: true, line, position: 1500, isActive: true, ...props,
});

test('same-row vocal split/merge reconciles a new hook-compatible child only', () => {
  const before = render(single), split = render(parallel), merged = render({ ...single });
  assert.equal(before.type, split.type);
  assert.notEqual(before.props.key, split.props.key);
  assert.equal(before.props.key, merged.props.key);
  assert.equal(before.props.line, single);
  assert.equal(split.props.line, parallel);
  assert.equal(before.props.position, split.props.position);
});

test('AI supplements, timing and settings updates do not reset same-shape motion', () => {
  for (const line of [single, parallel]) {
    const before = render(line);
    const clock = { getPosition: () => 1600 };
    for (const update of [
      { subText: 'Reading' }, { subText2: 'Translation' },
      { culturalAnnotations: [{ marker: 1, note: 'Explanation' }] },
      { settingsRevision: 1 }, { position: 1600, liveClock: clock },
    ]) assert.equal(render({ ...line }, update).props.key, before.props.key);
    assert.equal(render({ ...line, startTime: 1100 }).props.key, before.props.key);
  }
});

test('empty backing voices keep the single-vocal rendering identity', () => {
  for (const vocals of [undefined, {}, { lead: single },
    { lead: single, background: [] }, { lead: single, background: [{ syllables: [] }] },
    { lead: { syllables: [] }, background: parallel.vocals.background },
  ]) assert.equal(render({ ...single, vocals }).props.key, render(single).props.key);
});
