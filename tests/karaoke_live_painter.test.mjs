import { readPcStylesheet } from "../.github/scripts/pc_stylesheet.mjs";
import { createKaraokeHarnessFactory } from "./fixtures/karaoke-page-modules.mjs";
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { KaraokeWordTiming } from '../src/lyrics/karaokeWordTiming.mjs';
import { createLyricsViewClock } from '../src/lyrics/lyricsPlaybackView.mjs';

// Reuse the source-extracted KaraokeLine harness, exporting the live painter
// alongside it. The harness never runs effects, so the painter is exercised
// directly with minimal element doubles below.
const pagesSource = readFileSync(new URL('../src/lyrics/Pages.js', import.meta.url), 'utf8');
const styles = readPcStylesheet();
const harnessUrl = new URL('./karaoke_static_render_cache.test.mjs', import.meta.url);
const fixtureSource = readFileSync(harnessUrl, 'utf8');
const fixtureStart = fixtureSource.indexOf('const currentSource =');
const fixtureEnd = fixtureSource.indexOf("test('vocal presence");
assert.ok(fixtureStart >= 0 && fixtureEnd > fixtureStart);
const exportLine = "'globalThis.api = { KaraokeLine, hasKaraokeVocalRows, getKaraokeVocalRows };',";
const elementFactory = 'createElement: (tag, props, ...children) => ({ tag, props: props || {}, children })';
let harnessSource = fixtureSource.slice(fixtureStart, fixtureEnd)
  .replaceAll('import.meta.url', JSON.stringify(harnessUrl.href))
  .replace('activeCharScans: 0,', 'glyphElements: 0, activeCharScans: 0,');
assert.ok(harnessSource.includes(exportLine) && harnessSource.includes(elementFactory));
harnessSource = harnessSource
  .replace(exportLine, "'globalThis.api = { KaraokeLine, hasKaraokeVocalRows, getKaraokeVocalRows, KaraokeLivePainter, syncKaraokeLiveEntry, paintKaraokeLiveEntry, getKaraokeCharFill, createKaraokeMotionProfile, KARAOKE_LIVE_ATTRIBUTE };',")
  .replace(elementFactory, `createElement: (tag, props, ...children) => {
    if (String(props?.key || '').startsWith('karaoke-char-')) counts.glyphElements++;
    return { tag, props: props || {}, children };
  }`);
const { createHarness, makeLine } = createKaraokeHarnessFactory('assert', 'execFileSync', 'readFileSync', 'vm', 'KaraokeWordTiming',
  harnessSource + '\nreturn { createHarness, makeLine };')(assert, execFileSync, readFileSync, vm, KaraokeWordTiming);

const nodes = (tree, out = []) => {
  if (Array.isArray(tree)) tree.forEach(child => nodes(child, out));
  else if (tree && typeof tree === 'object') { out.push(tree); nodes(tree.children, out); }
  return out;
};
const glyphNodes = tree => nodes(tree).filter(node => String(node.props?.key || '').startsWith('karaoke-char-'));
const continuousProperties = ['--karaoke-char-fill', '--karaoke-char-fill-soft-start', '--karaoke-char-fill-soft-end',
  '--karaoke-bounce-y', '--karaoke-bounce-scale', '--karaoke-motion-glow'];
const liveClock = { getPosition: () => NaN };

test('live rows keep discrete glyph states in React and leave continuous values to the painter', () => {
  const harness = createHarness();
  const line = makeLine('Hello long words here');
  const glyphs = glyphNodes(harness.render(line, 1150, { liveClock }));
  assert.ok(glyphs.length > 10);
  glyphs.forEach((glyph, index) => {
    assert.equal(glyph.props['data-karaoke-live'], `g:${index}`);
    for (const property of continuousProperties) assert.equal(glyph.props.style[property], undefined, property);
  });
  // Characters are timed 110 ms apart from 1000 ms; states follow that timing exactly.
  assert.match(glyphs[0].props.className, /--done\b/);
  assert.match(glyphs[1].props.className, /--active\b/);
  assert.match(glyphs[2].props.className, /--pending\b/);
  const rendered = nodes(harness.render(line, 1150, { liveClock }));
  assert.ok(rendered.some(node => node.props?.ref && String(node.props.className).startsWith('lyrics-karaoke-line')),
    'the live row exposes its root to the painter');
});

test('live rows do not rebuild glyph elements for each fill step', () => {
  const live = createHarness(undefined, { memo: true });
  const stepped = createHarness(undefined, { memo: true });
  const line = makeLine('la '.repeat(20));
  live.render(line, 1500, { liveClock });
  stepped.render(line, 1500);
  live.resetCounts(); stepped.resetCounts();
  for (let frame = 1; frame <= 120; frame++) {
    const position = 1500 + frame * 1000 / 120;
    live.render(line, position, { liveClock });
    stepped.render(line, position);
  }
  assert.ok(stepped.counts.glyphElements > 100, 'the React-painted path rebuilds glyphs for fill steps');
  // One element per glyph state change (pending -> active -> done) remains.
  assert.ok(live.counts.glyphElements <= 30,
    `live path built ${live.counts.glyphElements} glyph elements (React-painted: ${stepped.counts.glyphElements})`);
});

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

const createLiveFixture = (harness, { bounce = false } = {}) => {
  const timedChars = [0, 1, 2].map(index => ({ char: 'abc'[index], startTime: 1000 + index * 300, endTime: 1300 + index * 300 }));
  const motionProfiles = bounce
    ? timedChars.map(char => harness.context.api.createKaraokeMotionProfile(char.startTime, char.endTime, 300))
    : [];
  const elements = timedChars.map((_, index) => createElementDouble(`g:${index}`));
  const root = { querySelectorAll: () => elements };
  const entry = { units: new Map(), data: null, lastPosition: NaN };
  let pausedAt = null;
  const clock = { getPosition: frameTime => pausedAt ?? 1000 + frameTime };
  const data = { timedChars, motionProfiles, wordTimed: false, segmentsByStart: null };
  harness.context.api.syncKaraokeLiveEntry(entry, root, clock, null, data);
  return { entry, elements, timedChars, pause: value => { pausedAt = value; } };
};

test('the painter writes an unrounded fill on every display frame', () => {
  const harness = createHarness();
  const { paintKaraokeLiveEntry, getKaraokeCharFill } = harness.context.api;
  const { entry, elements } = createLiveFixture(harness);
  const fills = [];
  const stepped = [];
  for (let frame = 0; frame < 30; frame++) {
    const frameTime = 20 + frame * 1000 / 120;
    assert.equal(paintKaraokeLiveEntry(entry, frameTime), true);
    fills.push(Number.parseFloat(elements[0].values.get('--karaoke-char-fill')));
    stepped.push(getKaraokeCharFill(1000 + frameTime, true, 1000, 1300) * 100);
  }
  assert.ok(fills.every((value, index) => index === 0 || value > fills[index - 1]),
    'each 120 Hz frame advances the fill');
  assert.ok(stepped.some((value, index) => index > 0 && value === stepped[index - 1]),
    'the rounded React fill holds some frames');
  const softStart = Number.parseFloat(elements[0].values.get('--karaoke-char-fill-soft-start'));
  const softEnd = Number.parseFloat(elements[0].values.get('--karaoke-char-fill-soft-end'));
  assert.ok(softStart < fills.at(-1) && softEnd > fills.at(-1));
  assert.equal(elements[1].values.size, 0, 'future glyphs are untouched');
  assert.equal(paintKaraokeLiveEntry(entry, 20 + 29 * 1000 / 120), false, 'an unchanged clock writes nothing');
});

test('bounce values follow the frame and are removed after release or detach', () => {
  const harness = createHarness();
  const { paintKaraokeLiveEntry, KaraokeLivePainter } = harness.context.api;
  const { entry, elements } = createLiveFixture(harness, { bounce: true });
  paintKaraokeLiveEntry(entry, 120);
  assert.ok(Number.parseFloat(elements[0].values.get('--karaoke-bounce-y')) < 0);
  assert.ok(Number.parseFloat(elements[0].values.get('--karaoke-bounce-scale')) > 1);
  paintKaraokeLiveEntry(entry, 3000);
  assert.equal(elements[0].values.has('--karaoke-bounce-y'), false, 'a settled glyph has no transform values');
  paintKaraokeLiveEntry(entry, 450);
  assert.ok(elements[1].values.has('--karaoke-bounce-y'));
  KaraokeLivePainter.entries.add(entry);
  KaraokeLivePainter.release(entry);
  assert.equal(elements[1].values.has('--karaoke-bounce-y'), false, 'detached rows reset their motion');
});

test('the painter loop follows display frames and idles while playback is paused', () => {
  const harness = createHarness();
  const { KaraokeLivePainter } = harness.context.api;
  const queue = [];
  Object.assign(harness.context, {
    requestAnimationFrame: callback => { queue.push(callback); return queue.length; },
    getTrackPositionFPS: () => 60,
    document: { documentElement: { classList: { contains: () => false } }, body: null },
  });
  const { entry, elements, pause } = createLiveFixture(harness);
  KaraokeLivePainter.attach(entry);
  let frameTime = 20;
  const runFrame = () => { const callback = queue.shift(); frameTime += 1000 / 120; callback(frameTime); };
  const seen = new Set();
  for (let frame = 0; frame < 24; frame++) {
    runFrame();
    seen.add(elements[0].values.get('--karaoke-char-fill'));
  }
  assert.equal(seen.size, 24, 'a 60 fps setting still paints every 120 Hz frame');
  // Paused: the playback clock returns the same position on every frame.
  pause(1150);
  let frames = 0;
  while (queue.length && frames < 200) {
    runFrame();
    frames++;
  }
  assert.equal(queue.length, 0, 'the loop stops after quiet frames');
  assert.ok(frames <= 31, `stopped after ${frames} frames`);
  KaraokeLivePainter.release(entry);
});

test('the live clock samples playback at the display frame timestamp', () => {
  let snapshot = { position: 5000, isPlaying: true, sampledAt: 1012 };
  let delay = 0;
  const clock = createLyricsViewClock({
    getSnapshot: () => snapshot,
    getDelay: () => delay,
    getPronunciationLead: () => 0,
    getSafePlayerProgress: () => null,
    getPublicProgress: () => 4200.4,
    readGlobalOffset: () => -15,
  });
  assert.equal(clock.getFrameAlignedLyricsPlaybackPosition(1000), 4988);
  clock.updateOffsets(40, -15);
  delay = 5;
  assert.equal(clock.getFrameAlignedLyricsPlaybackPosition(1000), 5018);
  snapshot = { position: 5000, isPlaying: false, sampledAt: 1012 };
  assert.equal(clock.getFrameAlignedLyricsPlaybackPosition(1000), 5030, 'a paused clock does not move backwards');
  snapshot = null;
  assert.equal(clock.getFrameAlignedLyricsPlaybackPosition(1000), 4230.4, 'no guarded sample falls back to the public player');
  assert.equal(clock.getDiscretePosition(), 4190, 'React state rounds the initial position with the stored global offset');
});

test('rows outside the visible window stop painting after their fade-out', () => {
  const rule = selector => {
    const match = styles.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*')}\\s*\\{([^}]*)\\}`));
    assert.ok(match, selector);
    return match[1].replace(/\s+/g, ' ');
  };
  const hidden = rule('.lyrics-lyricsContainer-SyncedLyrics>.lyrics-lyricsContainer-LyricsLine-paddingLine');
  assert.match(hidden, /opacity: 0 !important;/);
  assert.match(hidden, /visibility: hidden;/);
  const transitions = rule('.lyrics-lyricsContainer-SyncedLyricsPage .lyrics-lyricsContainer-SyncedLyrics > .lyrics-lyricsContainer-LyricsLine-paddingLine');
  assert.match(transitions, /transition-property: transform, color, opacity, visibility !important;/);
  assert.match(transitions, /420ms, 0s !important;/);
  assert.match(transitions, /0s, 0s, 420ms !important;/);
});

test('off-window glyphs skip fill work while motion clears across a forward or backward seek', () => {
  const harness = createHarness();
  const { paintKaraokeLiveEntry } = harness.context.api;
  const { entry, elements } = createLiveFixture(harness, { bounce: true });
  let fillReads = 0;
  // Count the same reads as the live painter without changing its fill curve.
  for (const unit of entry.units.values()) {
    const { startTime } = unit.fill;
    Object.defineProperty(unit.fill, 'startTime', { get() { fillReads++; return startTime; } });
  }
  paintKaraokeLiveEntry(entry, 80);
  fillReads = 0;
  paintKaraokeLiveEntry(entry, 100);
  assert.equal(fillReads, 1);
  assert.ok(elements[0].values.has('--karaoke-bounce-y'));

  paintKaraokeLiveEntry(entry, 3000);
  assert.equal(elements[0].values.has('--karaoke-bounce-y'), false);
  fillReads = 0;
  paintKaraokeLiveEntry(entry, 3008);
  assert.equal(fillReads, 0);

  paintKaraokeLiveEntry(entry, 420);
  assert.ok(elements[1].values.has('--karaoke-bounce-y'));
  paintKaraokeLiveEntry(entry, -20);
  assert.equal(elements[1].values.has('--karaoke-bounce-y'), false);
});
