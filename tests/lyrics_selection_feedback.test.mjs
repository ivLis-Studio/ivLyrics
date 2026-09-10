import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../Pages.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
const section = (start, end) => {
  const from = source.indexOf(start), to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `missing ${start}`);
  return source.slice(from, to);
};
const clone = value => JSON.parse(JSON.stringify(value));

const harness = () => {
  const events = [], animations = [], hooks = [];
  const preference = { matches: false };
  const CONFIG = { visual: { 'reduce-motion': false, 'karaoke-line-transition': true } };
  let hookIndex = 0, supportsScale = true;
  const useMemo = (build, dependencies) => {
    const index = hookIndex++, previous = hooks[index];
    if (previous && dependencies.length === previous.dependencies.length
      && dependencies.every((dependency, i) => Object.is(dependency, previous.dependencies[i]))) return previous.value;
    const value = build(); hooks[index] = { value, dependencies }; return value;
  };
  const createElement = (type, props, ...children) => ({ type, props: props || {}, children });
  const noFrameWork = () => { throw new Error('Selection feedback must not read layout or schedule frame work'); };
  const content = {
    isConnected: true,
    animate(frames, timing) {
      events.push('animate');
      const listeners = [];
      const animation = {
        target: this, frames: clone(frames), timing: clone(timing), playState: 'running',
        addEventListener(type, callback, options) { assert.equal(type, 'finish'); assert.equal(options.once, true); listeners.push(callback); },
        finish() { this.playState = 'finished'; listeners.splice(0).forEach(callback => callback()); },
      };
      animations.push(animation); return animation;
    },
    getBoundingClientRect: noFrameWork,
  };
  const row = { firstElementChild: content, animate: noFrameWork, getBoundingClientRect: noFrameWork };
  const context = vm.createContext({
    CONFIG,
    window: { matchMedia: () => preference, Utils: { clearSafePlayerProgressCorrection: () => events.push('clear') } },
    CSS: { supports: (property, value) => supportsScale && property === 'scale' && value === '1' },
    Spicetify: { Player: { seek: time => events.push(['seek', time]) } },
    useMemo, useCallback: (callback, dependencies) => useMemo(() => callback, dependencies),
    useState: noFrameWork, requestAnimationFrame: noFrameWork, setTimeout: noFrameWork, getComputedStyle: noFrameWork,
    react: { memo: component => component, createElement },
    Utils: { formatLyricLineToCopy: text => text },
    normalizeDisplayedCulturalAnnotations: () => [],
    getRubySourceText: text => text,
    hasKaraokeVocalRows: line => !!line?.vocals,
    getInterludeInfo: () => ({ isInterlude: false }),
    createCopyHandler: () => () => events.push('copy'),
    renderAnnotatedLyricHTML: text => text,
    renderLyricMainContent: props => props.mainText,
    renderLyricSubLine: (className, text) => text ? createElement('p', { className }, text) : null,
    InterludeIndicator: 'InterludeIndicator',
  });
  vm.runInContext([
    section('const prefersReducedLyricsMotion', 'const animateSyncedLyricsScroll'),
    section('const lyricsLineSelectionAnimations', 'const renderLyricsItems'),
    'globalThis.renderBlock = LyricsLineBlock;',
  ].join('\n'), context);
  return {
    events, animations, content, row, CONFIG, preference, context,
    setSupportsScale: value => { supportsScale = value; },
    event: extra => ({ currentTarget: row, preventDefault: () => events.push('prevent'), stopPropagation: noFrameWork, ...extra }),
    render: (props = {}) => {
      hookIndex = 0;
      return context.renderBlock({ className: 'lyrics-lyricsContainer-LyricsLine', mainText: 'A lyric', seekTime: 1250, ...props });
    },
  };
};

test('click keeps immediate seek and propagation while scaling only the existing main paragraph', () => {
  const h = harness(), lineRef = {}, style = { '--position-index': 2 };
  const tree = h.render({ style, lineRef, subText: 'Reading', subText2: 'Translation' });
  assert.equal(tree.type, 'div');
  assert.equal(tree.props.style, style);
  assert.equal(tree.props.ref, lineRef);
  assert.equal(tree.props.role, 'button');
  assert.equal(tree.props.tabIndex, 0);
  assert.deepEqual(tree.children.flat().filter(Boolean).map(child => child.type), ['p', 'p', 'p']);
  tree.props.onClick(h.event());
  assert.deepEqual(h.events, ['clear', ['seek', 1250], 'animate']);
  assert.deepEqual(h.animations[0].frames, [
    { offset: 0, scale: '1' }, { offset: 0.3, scale: '0.985' }, { offset: 1, scale: '1' },
  ]);
  assert.equal(h.animations[0].timing.duration, 160);
  assert.equal(h.animations[0].timing.composite, 'add', 'scale must compose with existing pulse effects');
  assert.equal(h.animations[0].timing.fill, 'none', 'completed feedback must leave no persistent presentation state');
  tree.children[0].props.onContextMenu();
  assert.equal(h.animations.length, 1, 'copying lyrics is not a seek selection');
});

test('Enter and both Space names share click feedback without changing existing key seek behavior', () => {
  for (const key of ['Enter', ' ', 'Spacebar']) {
    const h = harness(), tree = h.render();
    tree.props.onKeyDown(h.event({ key }));
    assert.deepEqual(h.events, ['prevent', 'clear', ['seek', 1250], 'animate']);
    h.animations[0].finish();
    h.events.length = 0;
    tree.props.onKeyDown(h.event({ key, repeat: true }));
    assert.deepEqual(h.events, ['prevent', 'clear', ['seek', 1250]], 'held keys preserve seek behavior without pulsing repeatedly');
    tree.props.onKeyDown(h.event({ key: 'ArrowDown' }));
    assert.equal(h.events.length, 3, 'scroll/navigation keys retain their existing handling');
  }
});

test('rapid selections reuse running feedback and late finish events cannot erase a newer pulse', () => {
  const h = harness(), tree = h.render();
  tree.props.onClick(h.event());
  tree.props.onClick(h.event());
  assert.equal(h.animations.length, 1);
  assert.equal(h.events.filter(event => Array.isArray(event)).length, 2, 'every click still seeks');
  const first = h.animations[0];
  first.playState = 'finished';
  tree.props.onClick(h.event());
  assert.equal(h.animations.length, 2);
  first.finish();
  tree.props.onClick(h.event());
  assert.equal(h.animations.length, 2, 'a delayed old finish must not allow duplicate feedback');
  h.animations[1].finish();
  tree.props.onClick(h.event());
  assert.equal(h.animations.length, 3, 'settled feedback is released for the next selection');
});

test('wrapped and direct four/eight vocal selections preserve every measured anchor and equal feedback', () => {
  for (const count of [4, 8]) for (const wrapped of [false, true]) {
    const h = harness();
    const targets = Array.from({ length: count }, () => ({
      className: 'lyrics-karaoke-line', isConnected: true, animate: h.content.animate,
    }));
    let anchorPosition = 0;
    const naturalHeights = Array.from({ length: count }, (_, index) => 48 + index * 7);
    const totalHeight = naturalHeights.reduce((sum, height) => sum + height, 0);
    const parts = naturalHeights.map((height, index) => ({
      className: 'lyrics-karaoke-part',
      getAttribute: () => String(index),
      // A scale on the common paragraph changes the descendant part rectangles;
      // scaling only the inner lyric leaves its parent's rectangle untouched.
      getBoundingClientRect: () => {
        const paragraphScale = h.animations.some(animation => animation.target === h.content) ? 0.985 : 1;
        const top = naturalHeights.slice(0, index).reduce((sum, value) => sum + value, 0);
        return { top: 20 + totalHeight / 2 * (1 - paragraphScale) + top * paragraphScale, height: height * paragraphScale };
      },
    }));
    targets.forEach((target, index) => {
      target.parentElement = wrapped
        ? { className: 'lyrics-vocal-main', parentElement: parts[index] }
        : parts[index];
    });
    const stack = {
      getAttribute: name => name === 'data-karaoke-vocal-row-count' ? String(count) : String(anchorPosition),
      querySelectorAll: () => parts,
    };
    h.content.querySelectorAll = selector => {
      // Evaluate the direct-child class paths against both real DOM shapes.
      // The old selector alone must yield no leaf for the new wrapper shape.
      const paths = selector.split(',').map(path => path.trim().split(/\s*>\s*/));
      return targets.filter(target => paths.some(path => {
        let node = target;
        for (const classSelector of [...path].reverse()) {
          if (!node || classSelector !== `.${node.className}`) return false;
          node = node.parentElement;
        }
        return true;
      }));
    };
    h.row.querySelector = () => stack;
    h.row.getBoundingClientRect = () => ({ top: 20, height: totalHeight });
    h.context.KARAOKE_VOCAL_STACK_CENTER_THRESHOLD = 4;
    vm.runInContext(section('const getKaraokeVocalAnchorCenterWithinLine', 'const getActiveLineAnchorCenter')
      + '\nglobalThis.anchorCenter = getKaraokeVocalAnchorCenterWithinLine;', h.context);
    const positions = [0, 0.5, 1.7, count - 1];
    const before = positions.map(position => { anchorPosition = position; return h.context.anchorCenter(h.row); });
    h.render({ isKara: true, line: { text: 'Vocals', vocals: {} } }).props.onClick(h.event());
    assert.equal(h.animations.length, count, `${count} ${wrapped ? 'wrapped' : 'direct'} vocals must not fall back to scaling the paragraph`);
    h.animations.forEach((animation, index) => {
      assert.equal(animation.target, targets[index], 'the measured part and outer paragraph must not scale');
      assert.deepEqual(animation.frames, h.animations[0].frames);
      assert.deepEqual(animation.timing, h.animations[0].timing);
      assert.equal(animation.timing.composite, 'add', 'existing pulse scale is multiplied, not replaced');
    });
    positions.forEach((position, index) => {
      anchorPosition = position;
      assert.equal(h.context.anchorCenter(h.row), before[index], 'an in-flight press must not shift the active vocal anchor');
    });
  }
});

test('current motion settings gate feedback even without a render and preserve seeking', () => {
  const h = harness(), tree = h.render({ isKara: true });
  h.CONFIG.visual['reduce-motion'] = true;
  tree.props.onClick(h.event());
  h.CONFIG.visual['reduce-motion'] = false;
  h.preference.matches = true;
  tree.props.onClick(h.event());
  h.preference.matches = false;
  h.CONFIG.visual['karaoke-line-transition'] = false;
  tree.props.onClick(h.event());
  assert.equal(h.animations.length, 0);
  assert.equal(h.events.filter(event => Array.isArray(event)).length, 3);
  h.CONFIG.visual['karaoke-line-transition'] = true;
  tree.props.onClick(h.event());
  assert.equal(h.animations.length, 1);
  h.animations[0].finish();
  h.CONFIG.visual['karaoke-line-transition'] = false;
  h.render({ isKara: false }).props.onClick(h.event());
  assert.equal(h.animations.length, 2, 'the karaoke-only transition setting does not disable plain synced interaction');
});

test('unavailable animation support and detached content keep the original seek path', () => {
  for (const change of [
    h => h.setSupportsScale(false),
    h => { delete h.context.CSS; },
    h => { h.content.animate = null; },
    h => { h.content.isConnected = false; },
    h => { h.row.firstElementChild = null; },
  ]) {
    const h = harness(), tree = h.render(); change(h);
    tree.props.onClick(h.event());
    assert.deepEqual(h.events, ['clear', ['seek', 1250]]);
  }
});

test('hidden and untimed rows remain noninteractive, and programmatic seeks need no DOM event', () => {
  for (const props of [{ hiddenFromAccessibility: true }, { seekTime: null }, { seekTime: NaN }]) {
    const h = harness(), tree = h.render(props);
    assert.equal(tree.props.onClick, null);
    assert.equal(tree.props.onKeyDown, undefined);
    assert.equal(tree.props.role, undefined);
    assert.equal(h.animations.length, 0);
  }
  const h = harness(); h.render().props.onClick();
  assert.deepEqual(h.events, ['clear', ['seek', 1250]]);
});

test('feedback stylesheet changes only the main paragraph scale origin', () => {
  const rule = css.match(/\.lyrics-lyricsContainer-LyricsLine\[role="button"\] > p:first-child \{([^}]+)\}/)?.[1];
  assert.ok(rule);
  assert.match(rule, /transform-origin:\s*var\(--lyrics-align-text, center\) center/);
  assert.doesNotMatch(rule, /(?:^|[;\n])\s*(?:transform|transition|opacity|animation|will-change)\s*:/);
});
