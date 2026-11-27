import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { formatKaraokePercent, getKaraokeTextRunFill } from "../src/lyrics/panelKaraokeText.mjs";

const source = readFileSync(new URL("../src/lyrics/panelLyricLines.mjs", import.meta.url), "utf8");
const start = source.indexOf("    const KaraokeTextRunSegment = memo(");
const end = source.indexOf("    // ============================================", start);
assert.ok(start >= 0 && end > start);

const createRenderer = (element = null) => {
  const speakerCalls = [];
  const host = new EventTarget();
  let position = 0;
  const context = vm.createContext({
    memo: (component) => component,
    useRef: () => ({ current: element }),
    useLayoutEffect: (effect) => effect(),
    readPlaybackPosition: () => position,
    formatKaraokePercent,
    getKaraokeTextRunFill,
    host,
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
    advance(nextPosition) {
      position = nextPosition;
      host.dispatchEvent(new Event("ivlyrics-panel-time-update"));
    },
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

test("shaped panel fill only rewrites changed CSS values and clears them at the end", () => {
  const values = new Map();
  const classes = new Set();
  const writes = [];
  const { render, advance } = createRenderer({
    classList: { toggle: (key, on) => on ? classes.add(key) : classes.delete(key) },
    style: {
      setProperty: (key, value) => { writes.push(key); values.set(key, value); },
      removeProperty: (key) => values.delete(key),
    },
  });
  render({ text: "مرحبا", type: "text", startTime: 100, endTime: 10100 }, { isLineActive: true });
  advance(2101.23);
  assert.deepEqual(Object.fromEntries(values), {
    "--ivlyrics-panel-karaoke-gradient-direction": "to left",
    "--ivlyrics-panel-karaoke-fill": "20.01%",
    "--ivlyrics-panel-karaoke-fill-soft-start": "10.01%",
    "--ivlyrics-panel-karaoke-fill-soft-end": "30.01%",
  });
  writes.length = 0;
  advance(2101.24);
  assert.deepEqual(writes, [], "two samples format to the same CSS values");
  advance(10100);
  assert.deepEqual([...classes], ["sung"]);
  assert.equal(values.size, 0);
  advance(500);
  assert.deepEqual([...classes], ["active"]);
  assert.equal(values.get("--ivlyrics-panel-karaoke-fill"), "4%");
});
