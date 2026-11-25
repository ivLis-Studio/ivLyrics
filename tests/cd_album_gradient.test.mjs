import { createCdVisualizerApi } from "../src/features/player/CdVisualizer.js";
import assert from "node:assert/strict";
import test from "node:test";

const api = createCdVisualizerApi(globalThis);
const palette = Object.freeze(["#ed3434", "#36cb69", "#345aed", "#e8c731"]);
const url = index => `https://i.scdn.co/image/album-${index}`;
const uri = index => `spotify:track:${String(index).padStart(22, "0")}`;
const flush = () => new Promise(resolve => setImmediate(resolve));
const pixels = (colors = palette) => Uint8ClampedArray.from(colors.flatMap(color => {
  const rgb = [1, 3, 5].map(offset => parseInt(color.slice(offset, offset + 2), 16));
  return Array.from({ length: 100 }, () => [...rgb, 255]).flat();
}));

function imageHarness(options = {}) {
  const images = [], timers = new Map(), reads = [], canvases = [];
  let serial = 0, clock = 0;
  const load = api.createPaletteLoader({
    now: () => clock,
    setTimeout(callback, ms) { timers.set(++serial, { callback, ms }); return serial; },
    clearTimeout: id => timers.delete(id),
    createImage() {
      const image = { naturalWidth: 300, naturalHeight: 300,
        set src(value) {
          if (value) assert.equal(this.crossOrigin, "anonymous", "CORS is configured before starting the image");
          this.url = value;
        },
      };
      images.push(image); return image;
    },
    createCanvas(width, height) {
      assert.equal(width, 48); assert.equal(height, 48);
      canvases.push([width, height]);
      return { getContext: () => ({ drawImage() {}, getImageData() { reads.push(true); return { data: pixels() }; } }) };
    },
    ...options,
  });
  return { load, images, timers, reads, canvases, setClock(value) { clock = value; },
    expire() { [...timers.values()].forEach(({ callback }) => callback()); } };
}

function textureHarness() {
  const canvases = [], patterns = [], commands = [], gradients = [];
  const context = Object.fromEntries(["setTransform", "clearRect", "setLineDash", "beginPath", "arc", "stroke", "fill",
    "moveTo", "lineTo", "closePath", "quadraticCurveTo"].map(name => [name, (...args) => commands.push([name, ...args])]));
  context.createPattern = (canvas, repetition) => {
    assert.equal(repetition, "no-repeat");
    const pattern = { canvas, setTransform(value) { this.transform = value; } };
    patterns.push(pattern); return pattern;
  };
  for (const name of ["createConicGradient", "createRadialGradient"]) context[name] = (...args) => {
    const gradient = { kind: name, args, stops: [], addColorStop(...stop) { this.stops.push(stop); } };
    gradients.push(gradient); return gradient;
  };
  function createCanvas(width, height) {
    const canvas = { width, height, writes: 0, getContext() {
      return {
        createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
        putImageData(image) { canvas.image = image; canvas.writes++; },
      };
    } };
    canvases.push(canvas); return canvas;
  }
  return { context, commands, canvases, patterns, gradients, createCanvas };
}

test("album gradients default on and honor boolean and persisted string opt-outs", () => {
  assert.equal(api.DEFAULTS.albumGradient, true);
  for (const value of [undefined, null, true, "true", "invalid"]) assert.equal(api.normalizeSettings({ albumGradient: value }).albumGradient, true);
  for (const value of [false, "false"]) assert.equal(api.normalizeSettings({ albumGradient: value }).albumGradient, false);
});

test("palette extraction selects distinct real artwork pixels, ignoring neutral backgrounds and speckles", () => {
  const rgba = [...pixels(), ...pixels(["#080808", "#efefef"])];
  rgba.push(255, 0, 255, 255, 0, 255, 255, 0); // JPEG speckle and a transparent pixel.
  const result = api.extractAlbumPalette(Uint8ClampedArray.from(rgba));
  assert.deepEqual(new Set(result), new Set(palette));
  assert.equal(Object.isFrozen(result), true);
  assert.deepEqual(api.extractAlbumPalette(Uint8ClampedArray.from(rgba)), result);
  assert.equal(api.extractAlbumPalette(pixels(), 2).length, 2);
  for (const invalid of [null, [], [1, 2, 3], new Uint8ClampedArray(64 * 64 * 4 + 4), pixels(["#333333"]), pixels(["#ed3434"])]) {
    assert.equal(api.extractAlbumPalette(invalid), null);
  }
});

test("the pure texture blends circular artwork sources, preserves vivid local colors and transparent margins", () => {
  const texture = api.blendAlbumTexture(palette);
  assert.equal(texture.width, 128); assert.equal(texture.height, 128);
  assert.deepEqual(api.blendAlbumTexture(palette), texture, "no random/time-dependent colours");
  const at = (x, y) => Array.from(texture.data.slice((y * 128 + x) * 4, (y * 128 + x) * 4 + 4));
  assert.equal(at(64, 64)[3], 0);
  assert.equal(at(0, 0)[3], 0);
  assert.equal(at(127, 64)[3], 0);
  const top = at(64, 10), right = at(117, 64), bottom = at(64, 117), left = at(10, 64);
  assert.ok(top[0] > top[1] * 2 && top[0] > top[2] * 2, "actual red source at the top");
  assert.ok(right[1] > right[0] * 2 && right[1] > right[2], "actual green source at the right");
  assert.ok(bottom[2] > bottom[0] * 2 && bottom[2] > bottom[1], "actual blue source at the bottom");
  assert.ok(left[0] > 180 && left[1] > 150 && left[2] < 100, "actual yellow source at the left");
  for (const point of [top, right, bottom, left]) assert.equal(point[3], 255);
  const angularInner = at(101, 30), angularOuter = at(108, 23);
  assert.notDeepEqual(angularInner.slice(0, 3), angularOuter.slice(0, 3), "radial distance affects the blend, unlike a conic wheel");
  const restricted = api.blendAlbumTexture(["#ff0000", "#0000ff"]);
  for (let index = 0; index < restricted.data.length; index += 4) assert.equal(restricted.data[index + 1], 0, "no invented green/rainbow hues");
  assert.equal(api.blendAlbumTexture(palette, 1).width, 32);
  assert.equal(api.blendAlbumTexture(palette, 10000).width, 192);
  for (const invalid of [null, [], ["#ff0000"], ["#ff0000", "#ff0000"], ["#ff0000", "url(x)"]]) assert.equal(api.blendAlbumTexture(invalid), null);
});

test("album paint reuses a small texture/pattern per palette and geometry, including non-square centering", () => {
  const h = textureHarness(), metrics = api.getCanvasMetrics(400, 300);
  const paint = api.prepareAlbumPaint(h.context, metrics, palette, h);
  assert.ok(paint);
  assert.deepEqual(paint.transform, { a: 300 / 128, b: 0, c: 0, d: 300 / 128, e: 50, f: 0 });
  for (let frame = 0; frame < 120; frame++) {
    api.drawSpectrum(h.context, metrics, new Float32Array(64).fill(0.7), api.DEFAULTS, "#123456", undefined, { palette });
  }
  assert.equal(h.canvases.length, 1); assert.equal(h.patterns.length, 1);
  assert.equal(h.canvases[0].writes, 1);
  assert.equal(h.context.strokeStyle, paint);
  assert.equal(h.context.fillStyle, paint);
  assert.equal(api.prepareAlbumPaint(h.context, metrics, [...palette], h), paint, "equal palette values also reuse the texture");
  assert.notEqual(api.prepareAlbumPaint(h.context, api.getCanvasMetrics(500, 300), palette, h), paint);
  assert.equal(h.canvases.length, 2);
  assert.equal(h.gradients.length, 0, "album colour never delegates to a conic/linear hue wheel");
  assert.equal(h.commands.some(([name]) => ["drawImage", "putImageData", "getImageData"].includes(name)), false,
    "the destination only paints visualizer paths, preserving transparency elsewhere");
});

test("every visualizer style uses the album texture, while opt-out/white/custom/rainbow retain their paints", () => {
  const h = textureHarness(), metrics = api.getCanvasMetrics(400, 400);
  const paint = api.prepareAlbumPaint(h.context, metrics, palette, h);
  for (const style of api.STYLES) {
    api.drawSpectrum(h.context, metrics, new Float32Array(64).fill(0.5), { ...api.DEFAULTS, style }, "#123456", undefined, { palette });
    assert.equal(h.context.strokeStyle, paint, style);
  }
  for (const settings of [{ albumGradient: false }, { colorMode: "white" }, { colorMode: "custom", customColor: "#bc1234" }]) {
    const normalized = api.normalizeSettings(settings), color = api.resolveColor(normalized, "#123456");
    api.drawSpectrum(h.context, metrics, null, normalized, color, undefined, { palette });
    assert.equal(h.context.strokeStyle, color);
  }
  api.drawSpectrum(h.context, metrics, null, { ...api.DEFAULTS, colorMode: "rainbow" }, "#123456", undefined, { palette });
  assert.equal(h.context.strokeStyle.kind, "createConicGradient");
  assert.equal(h.patterns.length, 1);
});

test("missing pattern support and failed texture allocation fall back without hot per-frame retries", () => {
  for (const failure of ["canvas", "pattern", "transform"]) {
    const h = textureHarness(); let attempts = 0;
    h.createCanvas = () => { attempts++; if (failure === "canvas") throw new Error("Allocation denied"); return textureHarness().createCanvas(128, 128); };
    if (failure === "pattern") h.context.createPattern = () => null;
    if (failure === "transform") h.context.createPattern = () => ({});
    const metrics = api.getCanvasMetrics(400, 400);
    assert.equal(api.prepareAlbumPaint(h.context, metrics, palette, h), null);
    for (let frame = 0; frame < 20; frame++) api.drawSpectrum(h.context, metrics, null, api.DEFAULTS, "#123456", undefined, { palette });
    assert.equal(attempts, 1); assert.equal(h.context.strokeStyle, "#123456");
  }
});

test("palette loads deduplicate, set CORS before src, and share extraction across independent subscribers", async () => {
  const h = imageHarness(), firstAbort = new AbortController(), secondAbort = new AbortController();
  const first = h.load(url(1), firstAbort.signal), second = h.load(url(1), secondAbort.signal);
  assert.equal(h.images.length, 1);
  firstAbort.abort(); assert.equal(await first, null);
  assert.equal(h.load.getStats().inflight, 1, "one component unmount cannot cancel another's image");
  h.images[0].onload();
  const result = await second;
  assert.deepEqual(new Set(result), new Set(palette));
  assert.equal(await h.load(url(1)), result);
  assert.equal(h.images.length, 1); assert.equal(h.reads.length, 1); assert.equal(h.canvases.length, 1);
  assert.equal(h.timers.size, 0);
});

test("rapid artwork changes bound parallel images and retain only the newest queued artwork", async () => {
  const h = imageHarness({ maxInflight: 2, capacity: 2 });
  const first = h.load(url(1)), second = h.load(url(2)), displaced = h.load(url(3)), latest = h.load(url(4));
  assert.equal(await displaced, null);
  assert.deepEqual(h.load.getStats(), { cached: 0, inflight: 2, waiting: 1 });
  h.images[0].onload(); await first;
  assert.equal(h.images[2].url, url(4));
  h.images[1].onload(); h.images[2].onload(); await Promise.all([second, latest]);
  assert.deepEqual(h.load.getStats(), { cached: 2, inflight: 0, waiting: 0 });
  assert.equal(h.timers.size, 0);
});

test("timeouts/cancellation clear image handlers and timers; taint/low-colour errors are negatively cached", async () => {
  const h = imageHarness({ negativeTtlMs: 1000 });
  const request = h.load(url(1)), late = h.images[0].onload;
  h.expire(); assert.equal(await request, null);
  assert.equal(h.images[0].url, ""); assert.equal(h.images[0].onload, null);
  late(); assert.equal(h.reads.length, 0); assert.equal(h.timers.size, 0);
  assert.equal(await h.load(url(1)), null); assert.equal(h.images.length, 1);
  h.setClock(1001);
  const retry = h.load(url(1)); h.images[1].onload(); assert.ok(await retry);
  const abort = new AbortController(), cancelled = h.load(url(2), abort.signal);
  abort.abort(); assert.equal(await cancelled, null);
  assert.equal(h.images[2].url, ""); assert.equal(h.timers.size, 0);
  const reactivation = h.load(url(2)); h.images[3].onload(); assert.ok(await reactivation, "cancellation must not poison a later activation");
  for (const failure of ["taint", "low-color", "context", "dimensions", "image"]) {
    const bad = imageHarness({ createCanvas: () => ({ getContext: () => failure === "context" ? null : {
      drawImage() {}, getImageData() {
        if (failure === "taint") throw new Error("SecurityError: tainted canvas");
        return { data: pixels(["#121212"]) };
      },
    } }) });
    const pending = bad.load(url(1));
    if (failure === "dimensions") bad.images[0].naturalWidth = 0;
    if (failure === "image") bad.images[0].onerror(); else bad.images[0].onload();
    assert.equal(await pending, null, failure);
    assert.equal(await bad.load(url(1)), null);
    assert.equal(bad.images.length, 1); assert.equal(bad.timers.size, 0);
  }
});

test("unsupported artwork never starts an image and Spotify artwork URIs reuse their HTTPS cache key", async () => {
  const h = imageHarness();
  for (const value of [null, "", "javascript:alert(1)", "spotify:track:bad", url(1) + "\n", "x".repeat(4097)]) assert.equal(await h.load(value), null);
  assert.equal(h.images.length, 0);
  const id = "ab".repeat(20), request = h.load(`spotify:image:${id}`);
  assert.equal(h.images[0].url, `https://i.scdn.co/image/${id}`);
  h.images[0].onload(); const result = await request;
  assert.equal(await h.load(`https://i.scdn.co/image/${id}`), result);
  assert.equal(h.images.length, 1);
});

function rendererHarness({ loadPalette, initial = {} } = {}) {
  const h = textureHarness(), frames = new Map(), listeners = new Map(), imageRequests = [], statuses = [];
  let currentUri = uri(1), position = 250, serial = 0, clock = 0, reads = 0, width = 400;
  const root = {
    document: { hidden: false }, AbortController,
    performance: { now: () => clock },
    addEventListener(event, callback) { listeners.set(event, callback); },
    removeEventListener(event) { listeners.delete(event); },
    requestAnimationFrame(callback) { frames.set(++serial, callback); return serial; },
    cancelAnimationFrame: id => frames.delete(id),
    Utils: { getPlayerPlaybackSnapshot: () => ({ uri: currentUri, position, isPlaying: true }) },
  };
  const analysis = api.normalizeAnalysis({ track: { duration: 100 }, segments: [{ start: 0, duration: 100,
    loudness_start: -10, loudness_max: -3, loudness_max_time: 0.1, pitches: Array(12).fill(0.8) }] });
  const canvas = { getContext: () => h.context, setAttribute() {}, getBoundingClientRect() { reads++; return { width, height: width }; } };
  let props = { trackUri: uri(1), artworkUrl: url(1), enabled: true, playing: true, accent: "#123456", settings: { ...api.DEFAULTS },
    onStatusChange: status => statuses.push(status), ...initial };
  const renderer = api.createRenderer(canvas, props, { root, createCanvas: h.createCanvas,
    loadAnalysis: () => Promise.resolve(analysis),
    loadPalette: loadPalette || ((artwork, signal) => new Promise(resolve => { imageRequests.push({ artwork, signal, resolve }); })),
  });
  return { ...h, frames, imageRequests, statuses, renderer,
    get reads() { return reads; },
    update(next) { props = { ...props, ...next }; renderer.update(props); },
    setTrack(value) { currentUri = value; },
    resize(value) { width = value; listeners.get("resize")(); },
    tick(time) { clock = time; position = 250 + time; const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback(time)); },
    destroy() { renderer.destroy(); assert.equal(frames.size, 0); assert.equal(listeners.size, 0); },
  };
}

test("renderer prewarms one album texture outside RAF and preserves the 30fps/no-layout-read budget", async () => {
  const h = rendererHarness(); await flush();
  assert.equal(h.context.strokeStyle, "#123456");
  h.imageRequests[0].resolve(palette); await flush();
  assert.equal(h.patterns.length, 1); assert.equal(h.context.strokeStyle, h.patterns[0]);
  const commands = h.commands.length, reads = h.reads;
  for (let frame = 1; frame <= 120; frame++) h.tick(frame * 1000 / 120);
  const paints = h.commands.slice(commands).filter(([name]) => name === "clearRect").length;
  assert.ok(paints >= 29 && paints <= 30, String(paints));
  assert.equal(h.patterns.length, 1); assert.equal(h.canvases.length, 1); assert.equal(h.reads, reads);
  assert.equal(h.frames.size, 1);
  for (let index = 0; index < 10; index++) h.update({ settings: { ...api.DEFAULTS, density: 32, style: "dots" }, accent: "#654321" });
  assert.equal(h.imageRequests.length, 1); assert.equal(h.patterns.length, 1);
  h.resize(500); assert.equal(h.patterns.length, 2);
  h.destroy();
});

test("track/artwork/enabled/mode changes cancel ownership and never apply late palettes", async () => {
  const h = rendererHarness(); await flush();
  const first = h.imageRequests[0];
  h.setTrack(uri(2)); h.update({ trackUri: uri(2), artworkUrl: url(2) }); await flush();
  assert.equal(first.signal.aborted, true);
  first.resolve(palette); await flush(); assert.equal(h.patterns.length, 0);
  const second = h.imageRequests[1]; second.resolve(palette); await flush();
  assert.equal(h.patterns.length, 1);
  h.update({ artworkUrl: url(3) }); await flush();
  assert.equal(h.context.strokeStyle, "#123456", "new artwork never reuses the outgoing texture while loading");
  const third = h.imageRequests[2];
  h.update({ settings: { ...api.DEFAULTS, albumGradient: false } });
  assert.equal(third.signal.aborted, true);
  third.resolve([...palette].reverse()); await flush(); assert.equal(h.patterns.length, 1);
  h.update({ settings: { ...api.DEFAULTS } }); await flush();
  const fourth = h.imageRequests[3]; h.update({ enabled: false });
  assert.equal(fourth.signal.aborted, true);
  fourth.resolve(palette); await flush(); assert.equal(h.frames.size, 0);
  h.update({ enabled: true, settings: { ...api.DEFAULTS, colorMode: "white" } }); await flush();
  assert.equal(h.imageRequests.length, 4);
  assert.equal(h.context.strokeStyle, "#ffffff");
  h.update({ settings: { ...api.DEFAULTS } }); await flush();
  const fifth = h.imageRequests[4]; h.destroy();
  assert.equal(fifth.signal.aborted, true);
  fifth.resolve(palette); await flush(); assert.equal(h.patterns.length, 1);
});

test("unavailable/monochrome art keeps the actual accent without retrying unrelated settings", async () => {
  const h = rendererHarness(); await flush(); h.imageRequests[0].resolve(null); await flush();
  for (let index = 0; index < 20; index++) h.update({ accent: "#ef1234", settings: { ...api.DEFAULTS, thickness: 3 } });
  assert.equal(h.imageRequests.length, 1); assert.equal(h.patterns.length, 0);
  assert.equal(h.context.strokeStyle, "#ef1234");
  assert.deepEqual(h.statuses, ["loading", "ready"], "artwork failure does not mark valid analysis unavailable");
  h.destroy();
  for (const initial of [{ enabled: false }, { settings: { ...api.DEFAULTS, albumGradient: false } },
    { artworkUrl: "" }, { trackUri: "spotify:local:a:b:c:1" }]) {
    const idle = rendererHarness({ initial }); await flush(); assert.equal(idle.imageRequests.length, 0); idle.destroy();
  }
});
