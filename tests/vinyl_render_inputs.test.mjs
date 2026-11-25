import assert from "node:assert/strict";
import test from "node:test";
import { createLyricDisplayResolver, getEmbeddedAuxiliaryDisplayValues } from "../src/lyrics/lyricDisplayText.mjs";
import { createHarness as createOverflowHarness } from "./fixtures/vinyl-render-harness.mjs";

const createHarness = (props = {}) => {
  const counts = { inputs: 0, display: 0, furigana: 0 };
  const config = { visual: { "translate:display-mode": "below", "furigana-enabled": false } };
  const state = { ready: false, locale: "ja" };
  const { buildLyricDisplayState } = createLyricDisplayResolver({
    readDisplayMode: () => config.visual["translate:display-mode"],
    applyFurigana: (text) => {
      counts.furigana++;
      return config.visual["furigana-enabled"] && state.ready && state.locale === "ja"
        ? text.replace("漢", "<ruby>漢<rt>かん</rt></ruby>") : text;
    },
  });
  const h = createOverflowHarness({
    rows: [],
    ...props,
    adaptRenderer: (options) => ({
      ...options,
      primitives: {
        ...options.primitives,
        getEmbeddedAuxiliaryDisplayValues(...args) {
          counts.inputs++;
          return getEmbeddedAuxiliaryDisplayValues(...args);
        },
        buildLyricDisplayState(...args) {
          counts.display++;
          return buildLyricDisplayState(...args);
        },
      },
      getVisualSettings: () => config.visual,
      getLyricsLocale: () => state.locale,
      isFuriganaReady: () => state.ready,
    }),
  });
  return { ...h, counts, config, state, line: next => h.render(next)?.props.children[0]?.props };
};
const line = { text: "漢字の歌", phoneticText: "kanji no uta", translationText: "A song", startTime: 1000, endTime: 11000 };

test("LP display inputs and furigana are prepared once across playback ticks and seeks", () => {
  const h = createHarness({ lyrics: [line] });
  for (const positionOverride of [6500, 7000, 8500, 1500, 9000]) {
    const rendered = h.line({ positionOverride });
    assert.equal(rendered.mainText, line.text);
    assert.equal(rendered.subText, line.phoneticText);
    assert.equal(rendered.subText2, line.translationText);
    assert.equal(rendered.line, line);
  }
  assert.deepEqual(h.counts, { inputs: 1, display: 1, furigana: 1 });
  h.unmount();
});

test("display mode, furigana readiness and source language invalidate cached presentation", () => {
  const h = createHarness({ lyrics: [line] });
  h.config.visual["translate:display-mode"] = "replace";
  assert.equal(h.line({}).mainText, line.phoneticText);
  h.config.visual["translate:display-mode"] = "below";
  h.config.visual["furigana-enabled"] = true;
  assert.equal(h.line({}).mainText, line.text);
  h.state.ready = true;
  assert.match(h.line({}).mainText, /<ruby>/);
  h.state.locale = "zh";
  assert.equal(h.line({}).mainText, line.text);
  assert.equal(h.counts.display, 5);
  h.unmount();
});

test("new supplements, annotations and settings revisions refresh the active line", () => {
  const lyrics = [{ ...line }];
  const h = createHarness({ lyrics });
  lyrics[0].translationText = "Revised meaning";
  assert.equal(h.line({ settingsRevision: 1 }).subText2, "Revised meaning");
  const revised = { ...lyrics[0], phoneticText: "new reading", culturalNote: [{ expression: "漢字", note: "Characters" }] };
  const rendered = h.line({ lyrics: [revised] });
  assert.equal(rendered.subText, "new reading");
  assert.equal(rendered.line.culturalNote, revised.culturalNote);
  assert.equal(h.counts.display, 3);
  h.unmount();
});

test("karaoke retains vocal identity and live render positions across bidirectional seeks", () => {
  const held = { ...line, vocals: { lead: { text: line.text, syllables: [] }, background: [{ text: "echo", startTime: 2000, endTime: 10000 }] } };
  const lyrics = [held, { text: "response", startTime: 2000, endTime: 3000 }];
  const h = createHarness({ lyrics, isKara: true });
  for (const positionOverride of [2500, 6500, 3000, 9500]) {
    const rendered = h.line({ positionOverride });
    assert.equal(rendered.mainText, held);
    assert.equal(rendered.line.vocals, held.vocals);
    assert.equal(rendered.position, positionOverride);
    assert.equal(rendered.isActive, true);
  }
  assert.equal(h.counts.display, 1);
  h.unmount();
});

test("the focused renderer uses the selected karaoke granularity and its own track offset", () => {
  const referencedTracks = [];
  const h = createOverflowHarness({
    rows: [], lyrics: [{ ...line, karaokeGranularity: "word" }], isKara: true,
    positionOverride: null,
    adaptRenderer: options => ({
      ...options,
      primitives: {
        ...options.primitives,
        useLyricsPlaybackPosition(uri) { referencedTracks.push(uri); return 6500; },
      },
    }),
  });
  const uri = "spotify:track:focused";
  const character = h.render({ trackUri: uri, karaokeRenderGranularity: "character" }).props.children[0].props;
  assert.equal(character.position, 6500);
  assert.equal(character.karaokeRenderGranularity, "character");
  const word = h.render({ trackUri: uri, karaokeRenderGranularity: "word" }).props.children[0].props;
  assert.equal(word.karaokeRenderGranularity, "word");
  assert.deepEqual(referencedTracks.slice(-2), [uri, uri]);
  h.unmount();
});

test("empty lyrics, prelude and active-line changes preserve hook order and reset inputs", () => {
  const h = createHarness({ lyrics: [] });
  assert.equal(h.line({}), undefined);
  assert.equal(h.counts.display, 0);
  h.line({ lyrics: [line], positionOverride: 0 });
  assert.equal(h.line({ positionOverride: 1500 }).mainText, line.text);
  const next = { text: "Next line", startTime: 12000, endTime: 15000 };
  assert.equal(h.line({ lyrics: [line, next], activeLineIndex: 1, positionOverride: 12500 }).mainText, next.text);
  assert.equal(h.line({ lyrics: [], activeLineIndex: 0 }), undefined);
  assert.equal(h.line({ lyrics: [line], positionOverride: 1600 }).mainText, line.text);
  h.unmount();
});
