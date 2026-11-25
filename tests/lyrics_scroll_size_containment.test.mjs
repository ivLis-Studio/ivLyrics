import { readPcStylesheet } from "../.github/scripts/pc_stylesheet.mjs";
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const viewSource = readFileSync(new URL('../src/lyrics/lyricsPageView.mjs', import.meta.url), 'utf8');
const styles = readPcStylesheet();

test('lyric DOM changes do not make the main view re-measure its scroll size', () => {
  // Spotify's OverlayScrollbars wrapper ignores mutations inside an element
  // marked data-scroll-size-contained. Otherwise every glyph state commit,
  // painted karaoke frame and row motion step made it measure scrollWidth in
  // a microtask, forcing a synchronous style and layout pass.
  const start = viewSource.indexOf('className: `lyrics-lyricsContainer-LyricsContainer');
  assert.ok(start >= 0);
  const props = viewSource.slice(start, viewSource.indexOf('ref: page.setLyricsContainerElement', start));
  assert.match(props, /"data-scroll-size-contained": ""/);
  // The marker is only truthful while the page cannot change the main view's
  // scroll size: it is absolutely positioned, clipped and layout-contained.
  const containerRule = styles.match(/\n\.lyrics-lyricsContainer-LyricsContainer\s*\{([^}]*)\}/)[1];
  assert.match(containerRule, /position: absolute;/);
  assert.match(containerRule, /height: 100%;/);
  assert.match(containerRule, /overflow: hidden;/);
  assert.match(containerRule, /contain: layout paint;/);
});
