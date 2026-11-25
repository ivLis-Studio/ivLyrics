import { createCdVisualizerApi } from "../src/features/player/CdVisualizer.js";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const api = createCdVisualizerApi(globalThis);
const uri = index => `spotify:track:${String(index).padStart(22, "0")}`;
const segment = (overrides = {}) => ({
  start: 0, duration: 1, loudness_start: -20, loudness_max: 0,
  loudness_max_time: 0.25, loudness_end: -40, pitches: [1, 0, 0, 0, 0.5, 0, 0, 0.4, 0, 0, 0, 0],
  ...overrides,
});
const raw = (segments = [segment()]) => ({ track: { duration: 3 }, segments });
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

test("CD defaults and every customizable value are finite, bounded, and allow-listed", () => {
  assert.deepEqual(api.normalizeSettings(), api.DEFAULTS);
  assert.deepEqual(api.STYLES, ["bars", "line", "dots", "wave", "blocks", "spikes", "aura", "pulse", "particles"]);
  assert.deepEqual(api.COLOR_MODES, ["album", "white", "custom", "rainbow"]);
  assert.deepEqual(api.normalizeSettings({
    style: "not-a-style", colorMode: "script", customColor: "url(javascript:bad)",
    sensitivity: Infinity, density: NaN, thickness: null, mirror: "yes",
  }), api.DEFAULTS);
  assert.deepEqual(api.normalizeSettings({
    style: "dots", colorMode: "custom", customColor: "#AcF", sensitivity: "999", density: "1", thickness: 55,
  }), { style: "dots", colorMode: "custom", customColor: "#aaccff", sensitivity: 200, density: 24, thickness: 6, mirror: false, albumGradient: true });
  for (const style of api.STYLES) assert.equal(api.normalizeSettings({ style }).style, style);
  assert.equal(api.normalizeSettings({ colorMode: "rainbow" }).colorMode, "rainbow");
  assert.equal(api.normalizeSettings({ mirror: true }).mirror, true);
  assert.equal(api.normalizeSettings({ mirror: "true" }).mirror, true, "stored string booleans keep the preference");
  assert.equal(api.normalizeSettings({ mirror: 1 }).mirror, false);
  assert.equal(api.normalizeSettings({ sensitivity: 0 }).sensitivity, 25);
  assert.equal(api.normalizeSettings({ density: 32.8 }).density, 33);
  assert.equal(api.normalizeSettings({ density: 1e9 }).density, 128);
  assert.equal(api.normalizeSettings({ sensitivity: "" }).sensitivity, 100);
  for (const invalid of [null, [], false, "oops"]) {
    assert.deepEqual(api.normalizeSettings(invalid), api.DEFAULTS);
  }
});

test("album, white, and custom colors are distinct and do not retain a previous canvas color on invalid input", () => {
  assert.equal(api.resolveColor(api.DEFAULTS, "#abc"), "#aabbcc");
  assert.equal(api.resolveColor({ colorMode: "white" }, "#123456"), "#ffffff");
  assert.equal(api.resolveColor({ colorMode: "custom", customColor: "#FEDCBA" }, "#123456"), "#fedcba");
  assert.equal(api.resolveColor({ colorMode: "rainbow" }, "#123456"), "#123456", "rainbow keeps the album colour as its solid fallback");
  assert.equal(api.resolveColor(api.DEFAULTS, "rgb(1, 5, 999)"), "rgb(1, 5, 255)");
  assert.equal(api.resolveColor(api.DEFAULTS, "rgba(0, 128, 255, 0.7)"), "rgb(0, 128, 255)");
  for (const invalid of ["url(x)", "var(--missing)", "#ffff", "<svg>", {}, null, "x".repeat(97)]) {
    assert.equal(api.normalizeColor(invalid), "#ffffff");
  }
});

test("only exact Spotify music track URIs can initiate an analysis lookup", () => {
  assert.equal(api.trackIdFromUri(uri(1)), "0000000000000000000001");
  assert.equal(api.trackIdFromUri("spotify:track:AbCdefGHI0123456789xyz"), "AbCdefGHI0123456789xyz");
  for (const invalid of [
    "spotify:local:Artist:Album:Title:123", "spotify:episode:0000000000000000000001",
    "spotify:ad:0000000000000000000001", "spotify:track:one", `${uri(1)}?x=1`,
    ` ${uri(1)}`, `${uri(1)}\n`, "https://open.spotify.com/track/0000000000000000000001", null, 123,
  ]) assert.equal(api.trackIdFromUri(invalid), null, String(invalid));
});

test("normalization rejects malformed/oversized payloads and skips corrupt finite-time segments", () => {
  for (const payload of [null, false, [], "json", {}, { segments: [] }, { segments: Array(20001) }, raw([null])]) {
    assert.equal(api.normalizeAnalysis(payload), null);
  }
  for (const overrides of [
    { start: NaN }, { start: -1 }, { duration: 0 }, { duration: Infinity },
    { start: 50000 }, { loudness_max_time: -1 }, { loudness_max_time: 2 },
    { loudness_start: "-10" }, { loudness_max: NaN }, { pitches: [1, 2] },
    { pitches: [NaN, ...Array(11).fill(0)] },
  ]) assert.equal(api.normalizeAnalysis(raw([segment(overrides)])), null, JSON.stringify(overrides));
  const normalized = api.normalizeAnalysis(raw([
    segment(), segment({ start: 0 }), segment({ start: 2 }), segment({ start: 1 }),
  ]));
  assert.deepEqual(normalized.segments.map(value => value.start), [0, 2]);
  assert.equal(api.normalizeAnalysis({ body: raw() }).segments.length, 1);
  assert.equal(api.normalizeAnalysis({ ...raw(), track: { duration: 50000 } }), null);
  assert.equal(api.normalizeAnalysis({ ...raw(), track: { duration: Infinity } }), null);
  assert.equal(api.normalizeAnalysis({ ...raw(), track: { duration: "20" } }), null);
  assert.equal(api.normalizeAnalysis(raw([segment({ pitches: new Float32Array(12).fill(0.5) })])).segments.length, 1);
});

test("normalization preserves the input and clamps overlapping ends without losing a later segment", () => {
  const payload = raw([segment({ duration: 3, loudness_max_time: 2.5 }), segment({ start: 1 })]);
  const before = structuredClone(payload);
  const normalized = api.normalizeAnalysis(payload);
  assert.deepEqual(payload, before);
  assert.equal(normalized.segments[0].end, 1);
  assert.equal(normalized.segments[0].peak, 1);
  assert.equal(api.findSegmentIndex(normalized.segments, -1), -1);
  assert.equal(api.findSegmentIndex(normalized.segments, 0), 0);
  assert.equal(api.findSegmentIndex(normalized.segments, 0.9999), 0);
  assert.equal(api.findSegmentIndex(normalized.segments, 1), 1);
});

test("loudness interpolation uses actual start/peak/end values and handles zero-time peaks", () => {
  const current = api.normalizeAnalysis(raw()).segments[0];
  assert.ok(Math.abs(api.decibelsToAmplitude(-20) - 0.1) < 1e-12);
  assert.equal(api.decibelsToAmplitude(Infinity), 0);
  assert.equal(api.decibelsToAmplitude(50), 1);
  assert.ok(Math.abs(api.sampleLoudness(current, 0) - 0.1) < 1e-12);
  assert.ok(Math.abs(api.sampleLoudness(current, 0.125) - 0.55) < 1e-12);
  assert.equal(api.sampleLoudness(current, 0.25), 1);
  assert.ok(Math.abs(api.sampleLoudness(current, 1) - 0.01) < 1e-12);
  assert.equal(api.sampleLoudness(current, -0.1), 0);
  assert.equal(api.sampleLoudness(current, 1.1), 0);
  const instant = api.normalizeAnalysis(raw([segment({ loudness_max_time: 0 })])).segments[0];
  assert.equal(api.sampleLoudness(instant, 0), 1);
  assert.ok(Number.isFinite(api.sampleLoudness(instant, 0.5)));
});

test("spectrum is deterministic, pitch-sensitive, seekable, and uses a reusable bounded buffer", () => {
  const analysis = api.normalizeAnalysis(raw([
    segment(), segment({ start: 1, pitches: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0] }),
  ]));
  const output = new Float32Array(64);
  const initial = Array.from(api.sampleSpectrum(analysis, 0.25, 64, 100, output));
  assert.equal(api.sampleSpectrum(analysis, 0.25, 64, 100, output), output);
  assert.deepEqual(Array.from(output), initial);
  assert.ok(initial[0] > initial[16]);
  const later = Array.from(api.sampleSpectrum(analysis, 1.25));
  assert.notDeepEqual(later, initial);
  assert.deepEqual(Array.from(api.sampleSpectrum(analysis, 0.25)), initial, "backward seek samples the same musical instant");
  const louder = api.sampleSpectrum(analysis, 0.25, 64, 200);
  louder.forEach((value, index) => assert.ok(value >= initial[index] && value <= 1));
  const quieter = api.sampleSpectrum(analysis, 0.25, 64, 25);
  quieter.forEach((value, index) => assert.ok(value <= initial[index]));
  assert.equal(api.sampleSpectrum(analysis, 0.25, 1e9).length, 128);
  assert.equal(api.sampleSpectrum(analysis, 0.25, -100).length, 24);
});

test("no activity is invented for silence, missing analysis, gaps, or out-of-range positions", () => {
  const silence = api.normalizeAnalysis(raw([segment({ pitches: Array(12).fill(0) })]));
  assert.ok(api.sampleSpectrum(silence, 0.25).every(value => value === 0));
  const gaps = api.normalizeAnalysis(raw([segment({ start: 1 }), segment({ start: 3 })]));
  for (const position of [-1, NaN, Infinity, 0, 2.5, 4.1, 999]) {
    assert.ok(api.sampleSpectrum(gaps, position).every(value => value === 0), `position ${position}`);
  }
  assert.ok(api.sampleSpectrum(null, 3).every(value => value === 0));
});

test("analysis loading prefers getAudioData, deduplicates requests, and caches successful data", async () => {
  const pending = deferred();
  let requests = 0, fallback = 0;
  const load = api.createAnalysisLoader({ getSpicetify: () => ({
    getAudioData(requested) { assert.equal(requested, uri(1)); requests++; return pending.promise; },
    CosmosAsync: { get() { fallback++; return raw(); } },
  }) });
  const first = load(uri(1)), duplicate = load(uri(1));
  assert.equal(first, duplicate);
  await flush();
  assert.equal(requests, 1);
  pending.resolve(raw());
  const result = await first;
  assert.equal(result.segments.length, 1);
  assert.equal(await load(uri(1)), result);
  assert.equal(requests, 1);
  assert.equal(fallback, 0);
});

test("invalid or rejected getAudioData never retries the identical Cosmos endpoint", async () => {
  for (const primary of [() => null, () => ({ error: 403 }), () => { throw new Error("denied"); }]) {
    const requests = [];
    const load = api.createAnalysisLoader({ getSpicetify: () => ({
      getAudioData: primary,
      CosmosAsync: { get: url => { requests.push(url); return raw(); } },
    }) });
    assert.equal(await load(uri(2)), null);
    assert.deepEqual(requests, []);
    await load(uri(2));
    assert.equal(requests.length, 0);
  }
});

test("missing getAudioData uses the pinned reference's direct Cosmos endpoint once", async () => {
  const requests = [];
  const load = api.createAnalysisLoader({ getSpicetify: () => ({ CosmosAsync: {
    get: url => { requests.push(url); return raw(); },
  } }) });
  assert.ok(await load(uri(2)));
  assert.deepEqual(requests, ["https://spclient.wg.spotify.com/audio-attributes/v1/audio-analysis/0000000000000000000002?format=json"]);
  await load(uri(2));
  assert.equal(requests.length, 1);
});

test("negative cache bounds retries, and a new attempt is allowed after its TTL", async () => {
  let clock = 0, requests = 0, available = false;
  const load = api.createAnalysisLoader({ now: () => clock, negativeTtlMs: 1000, getSpicetify: () => ({
    getAudioData() { requests++; return available ? raw() : null; },
    CosmosAsync: { get() { requests++; return null; } },
  }) });
  assert.equal(await load(uri(3)), null);
  assert.equal(requests, 1);
  for (clock of [1, 500, 999]) assert.equal(await load(uri(3)), null);
  assert.equal(requests, 1);
  clock = 1001; available = true;
  assert.ok(await load(uri(3)));
  assert.equal(requests, 2);
});

test("an absent API, unsupported URI, and malformed fallback do not throw or log credentials", async () => {
  let calls = 0;
  const load = api.createAnalysisLoader({ getSpicetify: () => ({ CosmosAsync: {
    get() { calls++; return { error: "unavailable" }; },
  } }) });
  for (const unsupported of ["spotify:local:a:b:c:1", "spotify:episode:0000000000000000000001", null]) {
    assert.equal(await load(unsupported), null);
  }
  assert.equal(calls, 0);
  assert.equal(await load(uri(4)), null);
  assert.equal(calls, 1);
  assert.equal(await api.createAnalysisLoader({ getSpicetify: () => undefined })(uri(1)), null);
});

test("successful analysis is bounded by LRU capacity rather than growing per song forever", async () => {
  const calls = [];
  const load = api.createAnalysisLoader({ capacity: 2, getSpicetify: () => ({
    getAudioData: requested => { calls.push(requested); return raw(); },
  }) });
  await load(uri(1)); await load(uri(2)); await load(uri(1)); await load(uri(3));
  assert.equal(load.getStats().cached, 2);
  await load(uri(2));
  assert.deepEqual(calls, [uri(1), uri(2), uri(3), uri(2)]);
  assert.equal(load.getStats().cached, 2);
});

test("rapid skips bound concurrent requests and only keep the newest waiting track", async () => {
  const pending = new Map(), requested = [];
  const load = api.createAnalysisLoader({ maxInflight: 2, getSpicetify: () => ({ getAudioData: requestedUri => {
    requested.push(requestedUri);
    const wait = deferred(); pending.set(requestedUri, wait); return wait.promise;
  } }) });
  const first = load(uri(1)), second = load(uri(2)), displaced = load(uri(3)), latest = load(uri(4));
  assert.equal(await displaced, null);
  assert.equal(load(uri(4)), latest);
  await flush();
  assert.deepEqual(load.getStats(), { cached: 0, inflight: 2, waiting: 1 });
  assert.deepEqual(requested, [uri(1), uri(2)]);
  pending.get(uri(1)).resolve(raw());
  await first; await flush();
  assert.deepEqual(requested, [uri(1), uri(2), uri(4)]);
  pending.get(uri(2)).resolve(raw()); pending.get(uri(4)).resolve(raw());
  await Promise.all([second, latest]);
  assert.deepEqual(load.getStats(), { cached: 3, inflight: 0, waiting: 0 });
});

test("hung getAudioData has one deadline and never retries Cosmos or applies a late primary response", async () => {
  const timers = new Map(); let serial = 0;
  let cosmosRequests = 0;
  const primary = deferred();
  const load = api.createAnalysisLoader({
    setTimeout: callback => { timers.set(++serial, callback); return serial; },
    clearTimeout: id => timers.delete(id), timeoutMs: 100,
    getSpicetify: () => ({ getAudioData: () => primary.promise, CosmosAsync: { get() { cosmosRequests++; return raw(); } } }),
  });
  const request = load(uri(1));
  await flush();
  assert.equal(timers.size, 1);
  [...timers.values()][0]();
  const result = await request;
  assert.equal(result, null);
  assert.equal(cosmosRequests, 0);
  primary.resolve(raw());
  await flush();
  assert.equal(await load(uri(1)), null);
  assert.equal(timers.size, 0);
});

const recordingContext = () => {
  const commands = [];
  const context = Object.fromEntries(["setTransform", "clearRect", "beginPath", "arc", "stroke", "fill", "moveTo", "lineTo", "closePath"]
    .map(name => [name, (...args) => commands.push([name, ...args])]));
  return { context, commands };
};

// Records every primitive the richer styles use, including gradients and dashes.
const fullContext = ({ conic = true } = {}) => {
  const commands = [], gradients = [];
  const context = Object.fromEntries(["setTransform", "clearRect", "beginPath", "arc", "stroke", "fill", "moveTo", "lineTo",
    "closePath", "quadraticCurveTo", "setLineDash"].map(name => [name, (...args) => commands.push([name, ...args, {
      alpha: context.globalAlpha, composite: context.globalCompositeOperation, width: context.lineWidth,
    }])]));
  const gradient = (kind, args) => {
    const value = { kind, args, stops: [], addColorStop(offset, color) { this.stops.push([offset, color]); } };
    gradients.push(value);
    return value;
  };
  context.createRadialGradient = (...args) => gradient("radial", args);
  if (conic) context.createConicGradient = (...args) => gradient("conic", args);
  return { context, commands, gradients };
};
const beatAnalysis = ({ loudness = -5, beats = Array.from({ length: 24 }, (_, index) => ({ start: index * 0.5, confidence: 0.8 })) } = {}) =>
  api.normalizeAnalysis({ track: { duration: 12 }, beats, segments: Array.from({ length: 48 }, (_, index) => segment({
    start: index * 0.25, duration: 0.25, loudness_start: loudness - 15, loudness_max: loudness, loudness_max_time: 0.04,
    loudness_end: loudness - 15, pitches: Array.from({ length: 12 }, (_, pitch) => 0.25 + 0.75 * Math.abs(Math.sin(index * 0.4 + pitch))),
  })) });
const variedLevels = (count = 64) => Float32Array.from({ length: count }, (_, index) => 0.2 + 0.8 * Math.abs(Math.sin(index * 0.37)));
const drawStyle = (style, { values = variedLevels(), extras, settings = {}, size = 400, context } = {}) => {
  const recorder = context || fullContext();
  api.drawSpectrum(recorder.context, api.getCanvasMetrics(size, size), values, { ...api.DEFAULTS, ...settings, style }, "#123456",
    undefined, extras);
  return recorder;
};
const radiusOf = (x, y, size = 400) => Math.hypot(x - size / 2, y - size / 2);

test("canvas resolution and radial geometry stay bounded on high-DPI or zero-sized hosts", () => {
  assert.deepEqual(api.getCanvasMetrics(400, 400, 4), {
    width: 400, height: 400, pixelWidth: 800, pixelHeight: 800, scaleX: 2, scaleY: 2,
  });
  const huge = api.getCanvasMetrics(100000, 100000, 100);
  assert.equal(huge.pixelWidth, 1536);
  assert.equal(huge.pixelHeight, 1536);
  const empty = api.getCanvasMetrics(NaN, -5, Infinity);
  assert.equal(empty.width, 0); assert.equal(empty.height, 0);
  assert.equal(empty.pixelWidth, 1); assert.equal(empty.pixelHeight, 1);
  const geometry = api.createRadialGeometry(64);
  for (let index = 0; index < 64; index++) assert.ok(Math.abs(Math.hypot(geometry[index * 2], geometry[index * 2 + 1]) - 1) < 1e-6);
});

test("bars, a closed line, and dots issue genuinely different drawing primitives outside the CD", () => {
  for (const style of ["bars", "line", "dots"]) {
    const { context, commands } = recordingContext();
    api.drawSpectrum(context, api.getCanvasMetrics(400, 400, 2), new Float32Array(64).fill(1), { ...api.DEFAULTS, style }, "#123456");
    assert.equal(context.strokeStyle, "#123456");
    assert.equal(context.globalAlpha, 1);
    const arcs = commands.filter(([name]) => name === "arc");
    assert.equal(arcs[0][3], 160, "ring base radius is .40 and CD radius is .38");
    assert.equal(arcs.length, style === "dots" ? 65 : 1);
    assert.equal(commands.filter(([name]) => name === "closePath").length, style === "line" ? 1 : 0);
    assert.equal(commands.filter(([name]) => name === "fill").length, style === "dots" ? 1 : 0);
    assert.equal(commands.filter(([name]) => name === "lineTo").length, style === "bars" ? 64 : style === "line" ? 63 : 0);
    for (const [name, x, y] of commands) {
      if (name !== "lineTo" && name !== "moveTo") continue;
      const radius = Math.hypot(x - 200, y - 200);
      assert.ok(radius >= 159 && radius <= 192, `${style} stays outside the CD and inside the wrapper`);
    }
  }
});

test("every style draws a distinct, bounded effect between the CD edge and the wrapper", () => {
  const analysis = beatAnalysis();
  const values = variedLevels();
  const peaks = Float32Array.from(values, value => Math.min(1, value + 0.3));
  const signatures = new Map();
  for (const style of api.STYLES) {
    for (const thickness of [1, 6]) {
      const { context, commands } = drawStyle(style, { values, settings: { thickness }, extras: { analysis, position: 10.1, peaks } });
      assert.equal(context.globalAlpha, 1, `${style}: alpha restored`);
      assert.equal(context.globalCompositeOperation, "source-over", `${style}: compositing restored`);
      assert.equal(context.lineCap, "round", `${style}: caps restored`);
      const dashes = commands.filter(([name]) => name === "setLineDash");
      assert.deepEqual(dashes.at(-1)[1], [], `${style}: dash pattern reset for the next style`);
      const drawn = commands.filter(([name]) => ["stroke", "fill"].includes(name));
      assert.ok(drawn.length >= 2, `${style}: draws more than the static ring`);
      for (const [name, ...args] of commands) {
        if (name === "moveTo" || name === "lineTo") {
          const radius = radiusOf(args[0], args[1]);
          assert.ok(radius >= 400 * 0.38 - 1e-6 && radius <= 400 * 0.48 + 1e-6, `${style}: ${name} at ${radius}`);
        } else if (name === "quadraticCurveTo") {
          for (const [x, y] of [[args[0], args[1]], [args[2], args[3]]]) {
            const radius = radiusOf(x, y);
            assert.ok(radius >= 159.99 && radius <= 192, `${style}: contour at ${radius}`);
          }
        } else if (name === "arc") {
          const [x, y, radius] = args, state = args.at(-1);
          const centre = radiusOf(x, y);
          if (centre < 1e-6) {
            // Concentric rings: the static/breathing/ripple rings and fill limits.
            assert.ok(radius >= 400 * 0.38 - 1e-6, `${style}: ring inside the CD`);
            if (state.composite !== "destination-out") {
              assert.ok(radius + state.width / 2 <= 400 * 0.48 + 1e-6, `${style}: ring ${radius} + ink exceeds the wrapper`);
            }
          } else {
            assert.ok(centre - radius >= 160 - 1e-6 && centre + radius <= 400 * 0.48 + 1e-6, `${style}: dot/particle outside bounds`);
          }
        }
      }
      if (thickness === 1) signatures.set(style, JSON.stringify(commands.map(([name, ...args]) =>
        [name, ...args.filter(value => typeof value === "number").map(value => Math.round(value * 10) / 10)])));
    }
  }
  assert.equal(new Set(signatures.values()).size, api.STYLES.length, "every style renders different geometry");
});

test("unavailable or motion-reduced output keeps every new style to the static ring", () => {
  for (const style of api.STYLES) {
    const { context, commands, gradients } = drawStyle(style, { values: null, extras: { analysis: beatAnalysis(), position: 10.1 } });
    assert.equal(commands.filter(([name]) => name === "arc").length, 1, style);
    assert.equal(commands.filter(([name]) => name === "stroke").length, 1, style);
    assert.equal(commands.filter(([name]) => ["fill", "lineTo", "quadraticCurveTo"].includes(name)).length, 0, style);
    assert.equal(gradients.filter(({ kind }) => kind === "radial").length, 0, style);
    assert.equal(context.globalAlpha, 1);
  }
});

test("beat styles never invent ripples or bursts without an analysed beat in the window", () => {
  const values = variedLevels();
  const quietAnalysis = beatAnalysis();
  for (const extras of [undefined, { analysis: { ...quietAnalysis, pulses: null }, position: 10.1 },
    { analysis: quietAnalysis, position: null }, { analysis: quietAnalysis, position: -1 }]) {
    const pulse = drawStyle("pulse", { values, extras }).commands;
    assert.equal(pulse.filter(([name]) => name === "arc").length, 2, "static ring plus the level-driven ring only");
    const particles = drawStyle("particles", { values, extras }).commands;
    assert.equal(particles.filter(([name]) => name === "fill").length, 0, "no particles without a beat");
  }
  const silent = beatAnalysis({ loudness: -60 });
  assert.equal(silent.pulses, null, "beats inside silence do not become events");
});

test("ripples and bursts are deterministic, expand with playback and expire after their lifetime", () => {
  const analysis = beatAnalysis({ beats: [{ start: 5, confidence: 1 }] });
  const values = variedLevels();
  const rippleAt = position => drawStyle("pulse", { values, extras: { analysis, position } }).commands
    .filter(([name]) => name === "arc").slice(2).map(command => ({ radius: command[3], alpha: command.at(-1).alpha }));
  assert.deepEqual(rippleAt(5.2), rippleAt(5.2), "the same playback instant draws the same frame");
  const early = rippleAt(5.1)[0], late = rippleAt(5.6)[0];
  assert.ok(late.radius > early.radius && late.alpha < early.alpha, "ripples travel outward and fade");
  assert.equal(rippleAt(4.99).length, 0, "nothing before the beat");
  assert.equal(rippleAt(5 + api.PULSE_SECONDS + 0.01).length, 0, "ripples expire");
  const burst = position => drawStyle("particles", { values, extras: { analysis, position } }).commands;
  const first = burst(5.15), second = burst(5.15);
  assert.deepEqual(first, second);
  const centres = commands => commands.filter(([name]) => name === "arc").slice(1).map(([, x, y]) => radiusOf(x, y));
  assert.ok(centres(first).length > 0, "a loud beat emits particles");
  assert.ok(Math.max(...centres(burst(5.8))) > Math.max(...centres(first)), "particles move outward over time");
  assert.equal(centres(burst(5 + api.PARTICLE_SECONDS + 0.01)).length, 0, "particles expire");
  const louder = drawStyle("pulse", { values, settings: { sensitivity: 200 }, extras: { analysis, position: 5.3 } }).commands;
  const softer = drawStyle("pulse", { values, settings: { sensitivity: 25 }, extras: { analysis, position: 5.3 } }).commands;
  const alphaOf = commands => commands.filter(([name]) => name === "arc").slice(2)[0].at(-1).alpha;
  assert.ok(alphaOf(louder) > alphaOf(softer), "sensitivity scales beat strength");
});

test("beat events prefer the analysed beat grid, follow loudness and fall back to loud attacks", () => {
  const loud = beatAnalysis();
  assert.equal(loud.pulses.times.length, 24);
  assert.deepEqual(Array.from(loud.pulses.times.slice(0, 3)), [0, 0.5, 1]);
  assert.ok(Array.from(loud.pulses.strengths).every(value => value > 0.12 && value <= 1));
  const segments = loud.segments;
  const messy = api.normalizePulses([{ start: 1, confidence: 1 }, { start: 1 }, { start: NaN }, null, { start: -1 },
    { start: 0.5 }, { start: 2, confidence: 0 }, { start: 99999 }], segments);
  assert.deepEqual(Array.from(messy.times), [1, 2], "invalid, duplicate and out-of-order beats are skipped");
  assert.ok(messy.strengths[0] > messy.strengths[1], "confidence weights strength");
  assert.equal(api.normalizePulses([{ start: 20 }], segments), null, "beats after the analysed audio have no strength");
  const attacks = api.normalizePulses(undefined, segments);
  assert.ok(attacks.times.length > 0, "segment attacks are used without a beat grid");
  for (let index = 1; index < attacks.times.length; index++) assert.ok(attacks.times[index] - attacks.times[index - 1] >= 0.18);
  assert.ok(Array.from(attacks.times).every(time => segments.some(item => Math.abs(item.peak - time) < 1e-9)), "attacks start at loudness peaks");
  assert.ok(api.normalizePulses(Array(20001).fill({ start: 1 }), segments).times.length > 1, "oversized beat grids fall back to attacks");
  const quietAttacks = beatAnalysis({ loudness: -40, beats: undefined });
  assert.equal(quietAttacks.pulses, null, "quiet passages do not create attack events");
  assert.equal(api.firstPulseAfter(loud.pulses.times, 0.5), 2);
  assert.equal(api.firstPulseAfter(loud.pulses.times, -1), 0);
  assert.equal(api.firstPulseAfter(null, 1), 0);
});

test("mirroring lays pitch channels symmetrically without changing the default layout", () => {
  const analysis = beatAnalysis();
  for (const count of [24, 33, 64, 128]) {
    const plainLayout = Array.from(api.sampleSpectrum(analysis, 3.1, count, 100));
    assert.deepEqual(Array.from(api.sampleSpectrum(analysis, 3.1, count, 100, undefined, false)), plainLayout);
    const mirrored = api.sampleSpectrum(analysis, 3.1, count, 100, undefined, true);
    assert.equal(mirrored[0], plainLayout[0], "both layouts start at the same channel at the top");
    for (let index = 1; index < count; index++) assert.equal(mirrored[index], mirrored[count - index], `${count}:${index}`);
    assert.notDeepEqual(Array.from(mirrored), plainLayout);
  }
});

test("blocks quantize to LED levels and hold peak caps above the live level", () => {
  const count = 32;
  const values = new Float32Array(count).fill(0.5);
  const peaks = new Float32Array(count).fill(1);
  const { commands } = drawStyle("blocks", { values, settings: { density: count }, extras: { peaks } });
  const dash = commands.find(([name, value]) => name === "setLineDash" && value.length === 2)[1];
  const strokes = commands.reduce((groups, command) => {
    if (command[0] === "beginPath") groups.push([]);
    else groups.at(-1)?.push(command);
    return groups;
  }, []);
  const lengths = group => group.filter(([name]) => name === "lineTo").map(([, x, y], index) => {
    const start = group.filter(([name]) => name === "moveTo")[index];
    return Math.hypot(x - start[1], y - start[2]);
  });
  const [pitch] = [dash[0] + dash[1]];
  const levels = lengths(strokes[1]);
  assert.equal(levels.length, count);
  levels.forEach(length => assert.ok(Math.abs(length - (Math.round(0.5 * api.BLOCK_LEVELS) * pitch - dash[1])) < 1e-6));
  const caps = lengths(strokes[2]);
  assert.equal(caps.length, count, "one held cap per band");
  caps.forEach(length => assert.ok(Math.abs(length - dash[0]) < 1e-6, "a cap is exactly one block"));
  const noCaps = drawStyle("blocks", { values, settings: { density: count }, extras: { peaks: values } }).commands;
  assert.equal(noCaps.filter(([name]) => name === "stroke").length, 2, "caps at the live level are not drawn twice");
});

test("rainbow uses one cached conic wheel per canvas size and falls back to the album colour", () => {
  const recorder = fullContext();
  drawStyle("bars", { settings: { colorMode: "rainbow" }, context: recorder });
  drawStyle("bars", { settings: { colorMode: "rainbow" }, context: recorder });
  const conic = recorder.gradients.filter(({ kind }) => kind === "conic");
  assert.equal(conic.length, 1, "the wheel is reused between frames");
  assert.equal(recorder.context.strokeStyle, conic[0]);
  assert.deepEqual(conic[0].args, [-Math.PI / 2, 200, 200], "the hue wheel starts at the top like the bands");
  assert.equal(conic[0].stops.length, api.RAINBOW_HUES.length);
  drawStyle("bars", { settings: { colorMode: "rainbow", mirror: true }, context: recorder });
  const mirrored = recorder.gradients.filter(({ kind }) => kind === "conic")[1];
  for (const [offset, color] of mirrored.stops) {
    assert.ok(mirrored.stops.some(([other, value]) => Math.abs(other - (1 - offset)) < 1e-9 && value === color), "mirrored hues");
  }
  const fallback = drawStyle("bars", { settings: { colorMode: "rainbow" }, context: fullContext({ conic: false }) });
  assert.equal(fallback.context.strokeStyle, "#123456");
});

test("unavailable or motion-reduced output is just a static ring, never simulated bars", () => {
  for (const style of api.STYLES) {
    const { context, commands } = recordingContext();
    api.drawSpectrum(context, api.getCanvasMetrics(400, 400), null, { ...api.DEFAULTS, style });
    assert.equal(commands.filter(([name]) => name === "arc").length, 1);
    assert.equal(commands.filter(([name]) => name === "stroke").length, 1);
    assert.equal(commands.filter(([name]) => name === "lineTo").length, 0);
  }
});

test("thick dots include their ink radius in the .48 outer boundary at every UI density", () => {
  for (const density of [24, 64, 128]) {
    const { context, commands } = recordingContext();
    api.drawSpectrum(context, api.getCanvasMetrics(400, 400), new Float32Array(density).fill(1), {
      ...api.DEFAULTS, style: "dots", density, thickness: 6,
    });
    for (const [, x, y, radius] of commands.filter(([name]) => name === "arc").slice(1)) {
      assert.ok(Math.hypot(x - 200, y - 200) + radius <= 400 * 0.48 + 1e-4);
    }
  }
});

test("playback reads the existing guarded clock in milliseconds and does not create another poller", () => {
  const state = api.readPlayback(uri(1), {
    Utils: { getPlayerPlaybackSnapshot: () => ({ uri: uri(1), position: 12345, isPlaying: true }) },
    ivLyricsPlaybackClock: { createSpotifyPlaybackClock() { assert.fail("must reuse existing clock"); } },
    Spicetify: { Player: { getProgress() { assert.fail("guarded position is authoritative"); } } },
  });
  assert.deepEqual(state, { matches: true, position: 12.345, playing: true });
  assert.equal(api.readPlayback(uri(1), { Utils: { getPlayerPlaybackSnapshot: () => ({ uri: uri(1), position: 0 }) } }).position, 0);
});

test("playback rejects wrong tracks/ads/narration and never invents progress when APIs fail", () => {
  for (const snapshot of [{ uri: uri(2), position: 123 }, { uri: uri(1), djNarration: true },
    { uri: uri(1), item: { metadata: { is_ad: "true" } } }]) {
    assert.equal(api.readPlayback(uri(1), { Utils: { getPlayerPlaybackSnapshot: () => snapshot } }).matches, false);
  }
  assert.equal(api.readPlayback(uri(1), { Spicetify: { Player: { getProgress() { throw new Error("unavailable"); } } } }).position, null);
  assert.equal(api.readPlayback(uri(1), { Spicetify: { Player: { data: { item: { uri: uri(1) } }, getProgress: () => 2500, isPlaying: () => false } } }).playing, false);
});

test("adapted source ships the full MIT notice in both the runtime and standalone license", () => {
  const runtime = readFileSync(new URL("../src/features/player/CdVisualizer.js", import.meta.url), "utf8");
  const license = readFileSync(new URL("../third_party/spicetify-visualizer.LICENSE", import.meta.url), "utf8");
  assert.match(runtime, /12cb2a9066690b4e023bccc9466ae784ebb62364/);
  assert.match(runtime, /Copyright \(c\) 2026 Konsl/);
  assert.match(license, /Copyright \(c\) 2026 Konsl/);
  assert.match(license, /THE SOFTWARE IS PROVIDED "AS IS"/);
  assert.match(runtime, /THE SOFTWARE IS PROVIDED "AS IS"/);
});
