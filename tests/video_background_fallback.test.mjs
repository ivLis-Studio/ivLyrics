import { readVideoBackgroundFixture } from "./fixtures/legacy-page-source.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { artworkUtils } from './artwork_harness.mjs';

const source = readVideoBackgroundFixture();
const createVideo = (props) => {
  const context = vm.createContext({
    Utils: artworkUtils,
    window: {},
    CONFIG: { visual: {} },
    Spicetify: { Player: {
      isPlaying: () => true,
      data: { item: { metadata: { image_xlarge_url: "https://example.test/cover.jpg" } } },
    } },
    react: {
      Fragment: "fragment",
      createElement: (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity).filter(Boolean) }),
      useState: (initial) => [typeof initial === "function" ? initial() : initial, () => {}],
      useRef: (value) => ({ current: value }),
      useEffect() {},
      useLayoutEffect() {},
      useMemo: (build) => build(),
      useCallback: (fn) => fn,
    },
  });
  vm.runInContext(source, context);
  return context.window.VideoBackground({
    trackUri: "spotify:track:test", brightness: 50, blurAmount: 5,
    ...props,
  });
};
const nodes = (tree) => [tree, ...tree.children.filter((c) => typeof c === "object").flatMap(nodes)];
const fallback = (tree) => nodes(tree).find((n) => n.props["data-fallback-background"]);

test("missing and failed video keeps the chosen cover, gradient or solid fallback mounted", () => {
  const cover = fallback(createVideo({}));
  assert.equal(cover.props["data-fallback-background"], "album-cover");
  assert.equal(cover.props.style.backgroundImage, "url(https://example.test/cover.jpg)");
  assert.equal(cover.props.style.filter, "blur(5px)");
  assert.equal(fallback(createVideo({ fallbackBackground: "invalid" })).props["data-fallback-background"], "album-cover");

  const gradient = fallback(createVideo({
    fallbackBackground: "blur-gradient",
    fallbackGradientStyle: { "--ivLyrics-c1": "120, 60, 40", filter: "brightness(0.5) saturate(2.5)" },
  }));
  assert.match(gradient.props.className, /color-gradient-bg/);
  assert.equal(gradient.children.length, 6);
  assert.equal(gradient.props.style["--ivLyrics-c1"], "120, 60, 40");
  assert.equal(gradient.props.style.backgroundImage, undefined);
  assert.equal(gradient.props.style.filter, "saturate(2.5)");

  const solid = fallback(createVideo({ fallbackBackground: "solid", fallbackSolidColor: "#345678" }));
  assert.equal(solid.props.style.backgroundColor, "#345678");
  assert.equal(solid.props.style.backgroundImage, undefined);
  assert.equal(solid.children.length, 0);
});

test("brightness dims both fallback and video once and 100% leaves them at native brightness", () => {
  for (const mode of ["album-cover", "blur-gradient", "solid"]) {
    for (const brightness of [0, 50, 100]) {
      const tree = createVideo({ fallbackBackground: mode, brightness });
      const layer = fallback(tree);
      assert.doesNotMatch(layer.props.style.filter || "", /brightness/, mode + ": artwork must not be dimmed twice");
      const overlay = nodes(tree).find((n) => n.props.style?.backgroundColor === "black");
      assert.equal(overlay.props.style.opacity, 1 - brightness / 100);
      const media = nodes(tree).find((n) => n.props.className === "ivlyrics-video-background-media");
      assert.doesNotMatch(media.props.style.filter || "", /brightness/);
    }
  }
});

