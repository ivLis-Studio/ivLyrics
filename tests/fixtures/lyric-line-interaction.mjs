import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { getPlaybackPositionService } from "#ivlyrics/core/playbackPositionService.mjs";
import { createLyricLineActions } from "#ivlyrics/lyrics/createLyricLineActions.mjs";
import { createLyricsLineBlock } from "#ivlyrics/lyrics/lyricsLineComponents.mjs";

const source = readFileSync(new URL("../../src/lyrics/Pages.js", import.meta.url), "utf8");
const section = (start, end) => {
  const from = source.indexOf(start), to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `missing ${start}`);
  return source.slice(from, to);
};
const clone = value => JSON.parse(JSON.stringify(value));

export function createLyricLineInteractionHarness() {
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
  });
  vm.runInContext(section('const prefersReducedLyricsMotion', 'const { getLyricsAnchorRatio')
    + '\nglobalThis.prefersReduced = prefersReducedLyricsMotion;', context);
  const actions = createLyricLineActions({
    getVisualSettings: () => CONFIG.visual,
    prefersReducedLyricsMotion: context.prefersReduced,
    supportsScale: () => context.CSS?.supports?.('scale', '1'),
    clearPlaybackCorrection: () => getPlaybackPositionService(context.window)?.clearSafePlayerProgressCorrection?.(),
    seek: time => events.push(['seek', time]),
    translateSeekTitle: () => '',
  });
  const renderBlock = createLyricsLineBlock({
    react: { memo: component => component, createElement, useMemo,
      useCallback: (callback, dependencies) => useMemo(() => callback, dependencies) },
    formatLyricLineToCopy: text => text,
    hasKaraokeVocalRows: line => !!line?.vocals,
    getInterludeInfo: () => ({ isInterlude: false }),
    actions: { ...actions, createCopyHandler: () => () => events.push('copy') },
    renderMainHtml: text => text,
    renderLyricMainContent: props => props.mainText,
    renderLyricSubLine: (className, text) => text ? createElement('p', { className }, text) : null,
    InterludeIndicator: 'InterludeIndicator',
  });
  return {
    events, animations, content, row, CONFIG, preference, context,
    setSupportsScale: value => { supportsScale = value; },
    event: extra => ({ currentTarget: row, preventDefault: () => events.push('prevent'), stopPropagation: noFrameWork, ...extra }),
    render: (props = {}) => {
      hookIndex = 0;
      return renderBlock({ className: 'lyrics-lyricsContainer-LyricsLine', mainText: 'A lyric', seekTime: 1250, ...props });
    },
  };
}
