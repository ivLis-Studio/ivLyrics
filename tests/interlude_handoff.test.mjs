import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { LYRICS_CENTERING_LEAD_MS } from "../src/lyrics/lyricsLineMotion.mjs";
import { createVinylActiveLyricRenderer } from "../src/features/player/createVinylActiveLyricRenderer.mjs";

const pages = readFileSync(new URL("../src/lyrics/Pages.js", import.meta.url), "utf8");
const slice = (source, start, end) => {
  const from = source.indexOf(start), to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from);
  return source.slice(from, to);
};

const createHarness = () => {
  const CONFIG = { visual: { "karaoke-line-transition": true } };
  const media = { matches: false };
  const context = vm.createContext({ CONFIG, LYRICS_CENTERING_LEAD_MS, window: { matchMedia: () => media } });
  vm.runInContext([
    slice(pages, "const prefersReducedLyricsMotion =", "const { getLyricsAnchorRatio"),
    slice(pages, "const getInterludeHandoffState =", "const getLyricsLineDetailClass ="),
    "globalThis.handoff = getInterludeHandoffState; globalThis.motion = isInterludeMotionEnabled;",
  ].join("\n"), context);
  const slots = [];
  let cursor = 0;
  const useMemo = (factory, deps) => {
    const index = cursor++, previous = slots[index];
    if (!previous || !deps.every((value, i) => Object.is(value, previous.deps[i])))
      slots[index] = { value: factory(), deps };
    return slots[index].value;
  };
  const react = {
    memo: component => component, useMemo,
    useRef: current => useMemo(() => ({ current }), []),
    useLayoutEffect: () => {},
    createElement: (type, props, ...children) => ({ type, props, children }),
  };
  const primitives = {
    LyricsLineBlock: "line", IdlingIndicator: "prelude",
    useLyricsPlaybackPosition: () => 0, getPseudoKaraokeRenderAdvance: () => 0,
    prepareGlobalCharTimeline: () => null,
    getInterludeInfo: line => line.interludeInfo || { isInterlude: false },
    createActiveTrailingKaraokeInterludeLine: () => null,
    getEmbeddedAuxiliaryDisplayValues: line => line,
    buildLyricDisplayState: (_isKara, line) => ({ mainText: line.text }),
    getKaraokeLineMetaClass: () => "", getKaraokeSpeakerStyle: () => ({}),
    getInterludeHandoffState: context.handoff,
    isInterludeMotionEnabled: context.motion,
  };
  const renderVinyl = createVinylActiveLyricRenderer({
    react, primitives, browser: context.window,
    getFonts: () => undefined, getVisualSettings: () => CONFIG.visual,
    isFuriganaReady: () => false, getLyricsLocale: () => "auto",
  });
  return {
    CONFIG, media, handoff: context.handoff,
    render(props) {
      cursor = 0;
      return renderVinyl({ singleLineScroll: false, ...props })?.children[0];
    },
  };
};

test("handoff fade fits the remaining interval, including coarse clocks and near-boundary seeks", () => {
  const { handoff } = createHarness();
  for (const [position, duration] of [[7699, null], [7700, 220], [7800, 184], [7980, 4], [7995, 0], [8000, null]]) {
    const result = handoff({ position, startTime: 3000, nextStartTime: 8000 });
    assert.equal(result.fadeDurationMs, duration);
    assert.equal(result.isDeparting, duration !== null);
  }
  for (const values of [{ nextStartTime: null }, { position: NaN }, { nextStartTime: 2000 }, { enabled: false }]) {
    assert.equal(handoff({ position: 7800, startTime: 3000, nextStartTime: 8000, ...values }).isDeparting, false);
  }
});

test("LP prelude exits before first lyric, with a stable fade and unchanged source time", () => {
  const h = createHarness(), lyrics = [{ text: "First lyric", startTime: 1000 }];
  const render = positionOverride => h.render({ lyrics, positionOverride });
  assert.equal(render(650).props.detailClassName, "");
  assert.match(render(750).props.detailClassName, /lyrics-interlude-departing/);
  assert.equal(render(750).props.fadeDurationMs, 220);
  assert.equal(render(950).props.fadeDurationMs, 220, "clock updates must not restart the exit");
  const first = render(1000);
  assert.equal(first.type, "line");
  assert.equal(first.props.mainText, "First lyric");
  assert.equal(first.props.line.startTime, 1000);
  assert.doesNotMatch(first.props.className, /lyrics-interlude-departing/);
  assert.equal(render(650).props.detailClassName, "", "backward seeks must restore the indicator");
});

test("LP explicit break exits in synced, word and character surfaces without changing the lyric", () => {
  for (const isKara of [false, true]) {
    const h = createHarness(), lyrics = [
      { text: "♪", startTime: 3000, interludeInfo: { isInterlude: true, kind: "break", durationMs: 5000 } },
      { text: "Next lyric", startTime: 8000 },
    ];
    const render = (positionOverride, activeLineIndex = 0, other = {}) => h.render({ lyrics, isKara, positionOverride, activeLineIndex, ...other });
    assert.doesNotMatch(render(7600).props.className, /lyrics-interlude-departing/);
    const departing = render(7800);
    assert.match(departing.props.className, /lyrics-interlude-departing/);
    assert.equal(departing.props.style["--lyrics-interlude-fade-duration"], "184ms");
    assert.equal(render(7900).props.style["--lyrics-interlude-fade-duration"], "184ms");
    assert.doesNotMatch(render(7900, 0, { motionEnabled: false }).props.className, /lyrics-interlude-departing/);
    h.CONFIG.visual["reduce-motion"] = true;
    assert.doesNotMatch(render(7900).props.className, /lyrics-interlude-departing/);
    h.CONFIG.visual["reduce-motion"] = false;
    h.media.matches = true;
    assert.doesNotMatch(render(7900).props.className, /lyrics-interlude-departing/);
    h.media.matches = false;
    h.CONFIG.visual["karaoke-line-transition"] = false;
    assert.equal(/lyrics-interlude-departing/.test(render(7900).props.className), !isKara);
    const next = render(8000, 1);
    assert.equal(next.props.mainText, "Next lyric");
    assert.equal(next.props.line.startTime, 8000);
  }
});

test("postludes do not fade merely because the track is ending", () => {
  const h = createHarness();
  const line = { text: "♪", startTime: 3000, interludeInfo: { isInterlude: true, kind: "postlude", durationMs: 5000 } };
  const result = h.render({ lyrics: [line], positionOverride: 7900, durationMs: 8000 });
  assert.doesNotMatch(result.props.className, /lyrics-interlude-departing/);
});
