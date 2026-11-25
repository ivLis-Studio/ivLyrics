import { createLyricLineInteractionHarness as selectionHarness } from "./fixtures/lyric-line-interaction.mjs";
import assert from 'node:assert/strict';
import test from 'node:test';

// Spotify fades audio in after a seek, which can swallow the first syllable of
// a clicked line. The opt-in seek-fade-compensation setting lands 300 ms early.

test('seek fade compensation is opt-in and lands 300 ms before the line without going negative', () => {
  const h = selectionHarness();
  h.render().props.onClick(h.event());
  assert.deepEqual(h.events.filter(Array.isArray), [['seek', 1250]], 'default seeks exactly to the line');

  h.CONFIG.visual['seek-fade-compensation'] = true;
  h.events.length = 0;
  h.render().props.onClick(h.event());
  assert.deepEqual(h.events.filter(Array.isArray), [['seek', 950]]);

  h.events.length = 0;
  h.render({ seekTime: 120 }).props.onClick(h.event());
  assert.deepEqual(h.events.filter(Array.isArray), [['seek', 0]]);
});

test('keyboard and cached click handlers read the current opt-in setting without a rerender', () => {
  for (const isKara of [false, true]) for (const key of ['Enter', ' ', 'Spacebar']) {
    const h = selectionHarness(), tree = h.render({ isKara });
    h.CONFIG.visual['seek-fade-compensation'] = true;
    tree.props.onKeyDown(h.event({ key }));
    assert.deepEqual(h.events.filter(Array.isArray), [['seek', 950]]);
    assert.equal(h.events[0], 'prevent');
    h.CONFIG.visual['seek-fade-compensation'] = false;
    h.events.length = 0;
    tree.props.onClick();
    assert.deepEqual(h.events, ['clear', ['seek', 1250]]);
  }
});

test('only a true setting enables early seek and invalid or hidden rows remain noninteractive', () => {
  for (const setting of [undefined, null, false, 'false', 'true', 1]) {
    const h = selectionHarness();
    h.CONFIG.visual['seek-fade-compensation'] = setting;
    h.render({ seekTime: 0 }).props.onClick();
    assert.deepEqual(h.events, ['clear', ['seek', 0]]);
    h.events.length = 0;
    h.render().props.onClick();
    assert.deepEqual(h.events, ['clear', ['seek', 1250]]);
  }
  for (const props of [{ seekTime: NaN }, { seekTime: Infinity }, { seekTime: null }, { hiddenFromAccessibility: true }]) {
    const h = selectionHarness();
    h.CONFIG.visual['seek-fade-compensation'] = true;
    const tree = h.render(props);
    assert.equal(tree.props.onClick, null);
    assert.equal(tree.props.onKeyDown, undefined);
    assert.equal(tree.props.tabIndex, undefined);
  }
});
