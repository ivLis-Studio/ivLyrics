import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../NowPlayingPanelLyrics.js", import.meta.url), "utf8");
const start = source.indexOf("    const KaraokeTextRunSegment = memo(");
const end = source.indexOf("    // ============================================", start);
assert.ok(start >= 0 && end > start);

const createRenderer = () => {
  const speakerCalls = [];
  const context = vm.createContext({
    memo: (component) => component,
    useRef: () => ({ current: null }),
    useLayoutEffect: () => {},
    getKaraokeTextDirection: (text) => /[\u0600-\u06ff]/.test(text) ? "rtl" : null,
    getPanelSpeakerPresentation: (...args) => {
      speakerCalls.push(args);
      return { speakerClass: args[0] ? "speaker2" : "" };
    },
    getPanelSpeakerStyle: () => ({ "--ivlyrics-panel-karaoke-color": "#abcdef" }),
    getTextEffectKindClassParts: (kind) => kind ? [`effect-${kind}`] : [],
    react: { createElement: (tag, props, text) => ({ tag, props, text }) },
  });
  vm.runInContext(`${source.slice(start, end)}\nglobalThis.renderSegment = KaraokeTextRunSegment;`, context);
  return {
    render: (segment, extra = {}) => context.renderSegment({
      segment, idx: 2, isLinePast: false, isLineActive: false, ...extra,
    }),
    speakerCalls,
  };
};

test("NowPlaying text runs render RTL lyrics and keep their speaker/effect presentation", () => {
  const { render, speakerCalls } = createRenderer();
  const result = render({
    text: "مرحبا", type: "text", styleSpeaker: "vocal2",
    styleSpeakerColor: "#abcdef", styleSpeakerFallback: "vocal1", styleKind: "glow",
  }, { isLinePast: true });
  assert.equal(result.tag, "span");
  assert.equal(result.text, "مرحبا");
  assert.equal(result.props.dir, "rtl");
  for (const token of ["sung", "ivlyrics-panel-range-style", "speaker-speaker2", "effect-glow"]) {
    assert.ok(result.props.className.split(" ").includes(token));
  }
  assert.equal(result.props.style["--ivlyrics-panel-karaoke-color"], "#abcdef");
  assert.equal(result.props.style["--ivlyrics-range-color"], "var(--ivlyrics-panel-karaoke-color)");
  assert.equal(result.props.style["--ivlyrics-range-index"], 2);
  assert.deepEqual(speakerCalls, [["vocal2", "#abcdef", "vocal1"]]);
});

test("NowPlaying plain text runs use fallback direction without a speaker override", () => {
  const { render } = createRenderer();
  const result = render({ text: "joined text", type: "text" }, { textDirection: "ltr" });
  assert.equal(result.props.dir, "ltr");
  assert.equal(result.props.className, "ivlyrics-panel-karaoke-text-run-segment");
  assert.equal(result.props.style["--ivlyrics-range-color"], undefined);
});

test("NowPlaying empty and space text runs do not need speaker presentation", () => {
  const { render, speakerCalls } = createRenderer();
  assert.equal(render({ text: "", type: "text" }), null);
  const result = render({ text: " ", type: "space" });
  assert.equal(result.text, " ");
  assert.equal(result.props.className, "ivlyrics-panel-karaoke-text-run-space");
  assert.deepEqual(speakerCalls, []);
});
