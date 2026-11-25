import { readPcStylesheet } from "../.github/scripts/pc_stylesheet.mjs";
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import * as lineMotion from '../src/lyrics/lyricsLineMotion.mjs';
import { createCompactLyricsLineController } from '../src/lyrics/lyricsCompactLineController.mjs';

const stylesheet = readPcStylesheet();
const createMotionHelpers = (linearSupport, readMatrix) => ({
  ...lineMotion,
  ...lineMotion.createLyricsLineMotion({
    supportsLinearEasing: () => linearSupport === true,
    readMatrix,
  }),
});
const motion = createMotionHelpers();
const native = createMotionHelpers(true);
const FRAME_MS = 1000 / 120;
const K = 7.5;
// The specified spring, written independently of the production helper.
const springProgress = (u, s) => (1 - (1 + (K - s) * u) * Math.exp(-K * u)) / (1 - (1 + K - s) * Math.exp(-K));
const springParameter = (slope) => Math.max(0, Math.min(K, slope * (1 - (1 + K) * Math.exp(-K)) / (1 - slope * Math.exp(-K))));
const springVelocity = (u, s) => (springProgress(u + 1e-6, s) - springProgress(u - 1e-6, s)) / 2e-6;

test('rows at or above the anchor start together and rows below cascade with shrinking steps', () => {
  const resting = motion.getAdaptiveLyricsCenteringTiming(null);
  assert.deepEqual({ ...resting }, { durationMs: 560, staggerMs: 50, maxStaggerMs: 260 });
  let expected = 0;
  for (let index = 1; index <= 8; index++) {
    expected = Math.min(260, expected + 50 / 1.05 ** (index - 1));
    assert.ok(Math.abs(motion.getLyricsLineStaggerDelay(index, resting) - expected) < 1e-9, `row +${index}`);
  }
  assert.deepEqual([1, 2, 3, 4].map(index => Math.round(motion.getLyricsLineStaggerDelay(index, resting))), [50, 98, 143, 186]);
  for (const window of [null, 40, 90, 120, 300, 520, 700, 844, 1500]) {
    const timing = motion.getAdaptiveLyricsCenteringTiming(window);
    const available = window ? Math.max(80, window - 24) : 820;
    for (const index of [-9, -2, -1, 0]) assert.equal(motion.getLyricsLineStaggerDelay(index, timing), 0, 'anchor and past rows start immediately');
    const delays = Array.from({ length: 24 }, (_, index) => motion.getLyricsLineStaggerDelay(index + 1, timing));
    delays.forEach((delay, index) => {
      const previous = index ? delays[index - 1] : 0;
      const step = delay - previous;
      assert.ok(delay <= timing.maxStaggerMs + 1e-9, 'cap respected');
      if (previous < timing.maxStaggerMs - 1e-9) assert.ok(step > 0, `window ${window}: row +${index + 1} starts after the row above`);
      else assert.equal(step, 0, 'capped rows wait together');
      if (index) assert.ok(step <= previous - (index > 1 ? delays[index - 2] : 0) + 1e-9, 'each step is no longer than the previous one');
    });
    assert.ok(timing.durationMs + Math.max(...delays) <= available + 1e-9, `window ${window}: the last row settles before the next line`);
  }
});

test('a resting row leaves with zero velocity and settles on the spring without overshoot', () => {
  for (const delta of [-180, 64, 600]) {
    const profile = native.createLyricsLineShiftMotion('matrix(1,0,0,1,0,0)', delta, 560);
    assert.equal(profile.initialSlope, 0);
    const offset = time => native.getLyricsLineShiftOffset({ ...profile, delay: 0 }, time);
    // Analytic curve and the sampled path the compositor plays.
    assert.ok(native.getLyricsLineMotionProgress(FRAME_MS / 560, 0) < 0.03);
    const firstFrame = 1 - offset(FRAME_MS) / delta;
    assert.ok(firstFrame > 0 && firstFrame < 0.03, `first 120Hz frame moves ${(firstFrame * 100).toFixed(2)}%`);
    const peak = Math.abs(delta) * springVelocity(1 / K, 0) / 560;
    assert.ok(Math.abs(native.getLyricsLineShiftVelocity(profile, 0)) < peak * 0.01, 'leaves rest without a velocity jump');
    let previous = Math.abs(delta);
    for (let time = 0; time <= 560; time += 0.5) {
      const remaining = offset(time);
      assert.ok(Math.sign(remaining) !== -Math.sign(delta), 'never passes the target');
      assert.ok(Math.abs(remaining) <= previous + 1e-9, 'never moves backwards');
      previous = Math.abs(remaining);
    }
    assert.equal(Math.abs(offset(560)), 0);
    assert.equal(profile.keyframes.at(-1).transform, 'matrix(1,0,0,1,0,0)');
    assert.equal(native.getLyricsLineShiftVelocity(profile, 560), 0);
    assert.equal(native.getLyricsLineShiftVelocity(profile, 20, 40), 0, 'waiting rows are stationary');
  }
  for (let index = 0; index <= 400; index++) {
    const u = index / 400;
    assert.ok(Math.abs(native.getLyricsLineMotionProgress(u, 0) - springProgress(u, 0)) < 1e-12);
  }
});

test('retargeted rows hand their velocity to the new spring up to the no-overshoot clamp', () => {
  const maxSlope = K / (1 - Math.exp(-K));
  assert.ok(Math.abs(native.LYRICS_LINE_MOTION_MAX_SLOPE - maxSlope) < 1e-12);
  for (const slope of [0, 0.4, 1, 2.2, 4, 7, maxSlope, 9, 40, Infinity]) {
    const s = Number.isFinite(slope) && slope * Math.exp(-K) < 1 ? springParameter(slope) : K;
    let previous = 0;
    for (let index = 0; index <= 400; index++) {
      const u = index / 400;
      const value = native.getLyricsLineMotionProgress(u, slope);
      assert.ok(Math.abs(value - springProgress(u, s)) < 1e-12, `slope ${slope} at ${u}`);
      assert.ok(value >= previous - 1e-15 && value <= 1, 'monotonic without overshoot');
      previous = value;
    }
    assert.equal(native.getLyricsLineMotionProgress(0, slope), 0);
    assert.equal(native.getLyricsLineMotionProgress(1, slope), 1);
    const initialSlope = native.getLyricsLineMotionProgress(1e-7, slope) / 1e-7;
    assert.ok(Math.abs(initialSlope - Math.min(slope, maxSlope)) < 1e-4 * Math.max(1, Math.min(slope, maxSlope)), `dp/du(0) ${initialSlope}`);
  }
  const old = native.createLyricsLineShiftMotion('none', 120, 560);
  for (const elapsed of [8, 40, 80, 160, 240, 320, 400, 480]) {
    const velocity = native.getLyricsLineShiftVelocity(old, elapsed);
    const offset = native.getLyricsLineShiftOffset({ ...old, delay: 0 }, elapsed);
    for (const extra of [120, 30, 2, 0.25]) {
      // Another line, an anchor correction, and a correction smaller than one
      // frame of travel. The last one shortens the curve instead of braking.
      const next = native.createLyricsLineShiftMotion('none', offset + extra, 560 - elapsed, velocity);
      assert.ok(next.durationMs <= 560 - elapsed);
      assert.ok(Math.abs(next.initialSlope * (offset + extra) / next.durationMs + velocity) <= Math.abs(velocity) * 1e-9,
        'the new spring starts at the incoming velocity');
      const sampled = native.getLyricsLineShiftVelocity(next, 0);
      assert.ok(Math.abs(sampled - velocity) <= Math.abs(velocity) * 0.01 + 0.02 * (offset + extra) / next.durationMs,
        `elapsed ${elapsed}, extra ${extra}: ${velocity} -> ${sampled}`);
    }
    // A target behind the moving row: clamp to rest rather than reverse first.
    const back = native.createLyricsLineShiftMotion('none', -30, 560 - elapsed, velocity);
    assert.equal(back.initialSlope, 0);
    let previous = -30;
    for (let time = 0; time <= back.durationMs; time += back.durationMs / 200) {
      const remaining = native.getLyricsLineShiftOffset({ ...back, delay: 0 }, time);
      assert.ok(remaining <= 1e-9 && remaining >= previous - 1e-9);
      previous = remaining;
    }
  }
});

// Model the browser's linear() easing independently of the production curve,
// including explicit input percentages and evenly spread omitted inputs.
const parseLinearEasing = (easing) => {
  assert.match(easing, /^linear\(.+\)$/);
  const points = easing.slice(7, -1).split(',').map((part) => {
    const [output, ...inputs] = part.trim().split(/\s+/);
    assert.ok(inputs.length <= 1 && (!inputs.length || inputs[0].endsWith('%')));
    return { output: Number(output), input: inputs.length ? Number.parseFloat(inputs[0]) / 100 : null };
  });
  points[0].input ??= 0;
  points.at(-1).input ??= 1;
  let largest = -Infinity;
  for (const point of points) if (point.input !== null) largest = point.input = Math.max(point.input, largest);
  for (let index = 1; index < points.length; index++) {
    if (points[index].input !== null) continue;
    let end = index;
    while (points[end].input === null) end++;
    const from = points[index - 1].input;
    for (let fill = index; fill < end; fill++) points[fill].input = from + (points[end].input - from) * (fill - index + 1) / (end - index + 1);
    index = end;
  }
  assert.ok(points.length >= 2 && points.every(point => Number.isFinite(point.output) && Number.isFinite(point.input)));
  return points;
};
const sampleEasing = (easing, progress) => {
  if (!easing || easing === 'linear') return progress;
  const points = parseLinearEasing(easing);
  let index = 0;
  while (index < points.length - 2 && points[index + 1].input <= progress) index++;
  const from = points[index];
  const to = points[index + 1];
  return to.input === from.input ? to.output
    : from.output + (to.output - from.output) * (progress - from.input) / (to.input - from.input);
};
const matrix = y => `matrix(1,0,0,1,0,${y})`;
const translateY = transform => Number(transform.match(/matrix\([^,]+,[^,]+,[^,]+,[^,]+,[^,]+,([^\)]+)\)/)?.[1] || 0)
  + Number(transform.match(/translateY\(([^p]+)px\)/)?.[1] || 0);
const sampleFrames = (frames, timing, elapsed) => {
  const progress = Math.max(0, Math.min(1, (elapsed - (timing.delay || 0)) / timing.duration));
  const eased = sampleEasing(timing.easing, progress);
  const right = Math.max(1, frames.findIndex(frame => frame.offset >= eased));
  const left = right - 1;
  const fraction = (eased - frames[left].offset) / (frames[right].offset - frames[left].offset);
  return translateY(frames[left].transform) * (1 - fraction) + translateY(frames[right].transform) * fraction;
};

test('fake WAAPI interpolates numeric linear easing stops before transform keyframes', () => {
  const frames = [{ offset: 0, transform: matrix(100) }, { offset: 1, transform: matrix(0) }];
  for (const easing of ['linear(0, 0.2, 1)', 'linear(0 0%, 0.2 50%, 1 100%)', 'linear(0, 0.2 50%, 1)']) {
    const timing = { duration: 100, delay: 20, easing };
    for (const [elapsed, expected] of [[0,100],[20,100],[45,90],[70,80],[95,40],[120,0],[160,0]]) {
      assert.ok(Math.abs(sampleFrames(frames, timing, elapsed) - expected) < 1e-10, `${easing} at ${elapsed}`);
    }
  }
  const uneven = { duration: 100, easing: 'linear(0 0%, 0.5 20%, 1 100%)' };
  assert.ok(Math.abs(sampleFrames(frames, uneven, 10) - 75) < 1e-10);
  assert.ok(Math.abs(sampleFrames(frames, uneven, 60) - 25) < 1e-10);
});

test('linear() stops reproduce the analytic spring, including its soft start', () => {
  const segments = native.LYRICS_LINE_MOTION_SEGMENTS;
  for (const slope of [0, 0.3, 1, 2.2, 5, native.LYRICS_LINE_MOTION_MAX_SLOPE]) {
    const { stops, easing } = native.getLyricsLineMotionCurve(slope);
    assert.equal(native.getLyricsLineMotionEasing(slope), easing);
    const points = parseLinearEasing(easing);
    assert.equal(points.length, segments + 1);
    points.forEach((point, index) => {
      assert.ok(Math.abs(point.input - stops[index][0]) < 1e-12, 'CSS inputs are the stops used for retargeting');
      assert.equal(point.output, stops[index][1]);
      if (index) assert.ok(point.input > points[index - 1].input && point.output >= points[index - 1].output);
    });
    assert.deepEqual([points[0].input, points[0].output, points.at(-1).input, points.at(-1).output], [0, 0, 1, 1]);
    assert.ok(points.filter(point => point.input > 0 && point.input <= 1 / 24).length >= 6,
      'the first 24th of the curve is several segments, not one chord');
    let maxError = 0;
    for (let index = 0; index <= 4800; index++) {
      const u = index / 4800;
      maxError = Math.max(maxError, Math.abs(sampleEasing(easing, u) - native.getLyricsLineMotionProgress(u, slope)));
    }
    assert.ok(maxError < 1e-3, `slope ${slope}: sampled path differs by ${maxError}`);
  }
  // At rest, the first frames follow the spring's slow start. A single
  // 1/24 chord would move 1.42% in the first 120Hz frame at 560ms, not 0.58%.
  const rest = native.getLyricsLineMotionCurve(0).easing;
  const points = parseLinearEasing(rest);
  assert.ok(points[1].output / points[1].input < 0.05, 'a resting row does not start on a full-speed chord');
  for (let frame = 1; frame <= 5; frame++) {
    const u = frame * FRAME_MS / 560;
    const analytic = native.getLyricsLineMotionProgress(u, 0);
    assert.ok(Math.abs(sampleEasing(rest, u) - analytic) <= analytic * 0.05, `frame ${frame}`);
  }
  assert.equal(motion.getLyricsLineMotionEasing(0), null, 'unsupported engines use keyframes');
});

test('two transform frames and the stop-keyframe fallback follow the same positions and measured offsets', (t) => {
  const keyframeCount = native.LYRICS_LINE_MOTION_SEGMENTS + 1;
  let samples = 0, maxPathError = 0, maxOffsetError = 0;
  for (const fallback of [createMotionHelpers(), createMotionHelpers(false)]) {
    for (const delta of [-1234.567, -180, -0.5, 0.5, 37.25, 1234.567]) {
      for (const duration of [1, 80, 420, 560]) for (const slope of [null, 0, 0.25, 1, 2.2, 7.5]) {
        const velocity = slope === null ? null : -slope * delta / duration;
        const target = matrix(137.125);
        const compact = native.createLyricsLineShiftMotion(target, delta, duration, velocity);
        const expanded = fallback.createLyricsLineShiftMotion(target, delta, duration, velocity);
        assert.equal(compact.keyframes.length, 2);
        assert.equal(parseLinearEasing(compact.easing).length, keyframeCount);
        assert.equal(expanded.keyframes.length, keyframeCount);
        assert.equal(expanded.easing, 'linear');
        assert.equal(compact.durationMs, expanded.durationMs);
        assert.deepEqual([...expanded.keyframes.map(frame => frame.offset)], [...compact.stops.map(([offset]) => offset)]);
        for (const delay of [0, 50, 260]) for (let sample = -1; sample <= 241; sample++) {
          const elapsed = delay + compact.durationMs * sample / 240;
          const timing = { duration: compact.durationMs, delay };
          const actual = sampleFrames(compact.keyframes, { ...timing, easing: compact.easing }, elapsed);
          const reference = sampleFrames(expanded.keyframes, { ...timing, easing: expanded.easing }, elapsed);
          const measured = 137.125 + native.getLyricsLineShiftOffset({ ...compact, delay }, elapsed);
          samples++;
          maxPathError = Math.max(maxPathError, Math.abs(actual - reference));
          maxOffsetError = Math.max(maxOffsetError, Math.abs(measured - actual));
          assert.ok(Math.abs(actual - reference) <= 0.02, `delta=${delta}, slope=${slope}, elapsed=${elapsed}: ${actual} vs ${reference}`);
          assert.ok(Math.abs(measured - actual) <= 0.02, 'retarget offset must match the compositor at sub-keyframe times');
        }
      }
    }
  }
  t.diagnostic(`${samples} positions; maximum two/fallback difference ${maxPathError.toFixed(6)}px; maximum retarget offset error ${maxOffsetError.toFixed(6)}px`);
});

test('only a one-line advance from the previous scripted line cascades its travel', () => {
  const base = { visualLineIndex: 6, settingsRevision: 3, nextLineStart: 9000, leadMs: 300, position: 4000, now: 1000 };
  const previousContext = { visualLineIndex: 5, settingsRevision: 3 };
  const advance = motion.getLyricsLineMotionPlan({ ...base, previousContext });
  assert.equal(advance.cascade, true);
  assert.equal(advance.durationMs, 560);
  for (const index of [-3, -1, 0]) assert.equal(motion.getLyricsLineMotionStyle(index, advance)['--line-motion-delay'], '0ms');
  for (const index of [1, 2, 4, 9]) {
    const style = motion.getLyricsLineMotionStyle(index, advance);
    assert.equal(Number.parseFloat(style['--line-motion-delay']), motion.getLyricsLineStaggerDelay(index, advance));
    assert.equal(style['--line-motion-duration'], '560ms');
    assert.deepEqual(Object.keys(style).sort(), ['--line-motion-delay', '--line-motion-duration'],
      'rows carry only the travel timing; presentation keeps its own transitions');
  }
  assert.equal(motion.getLyricsLineMotionPlan({ ...base, previousContext, manualReturn: { expiresAt: 900 } }).cascade, true,
    'an expired manual return no longer holds the rows together');
  for (const [label, overrides] of [
    ['first line or reset after a seek', { previousContext: null }],
    ['forward jump', { previousContext: { visualLineIndex: 3, settingsRevision: 3 } }],
    ['backward seek', { previousContext: { visualLineIndex: 7, settingsRevision: 3 } }],
    ['same line', { previousContext: { visualLineIndex: 6, settingsRevision: 3 } }],
    ['settings change', { previousContext: { visualLineIndex: 5, settingsRevision: 2 } }],
    ['manual-scroll return', { previousContext, manualReturn: { expiresAt: 1800 } }],
    ['no revision without context', { previousContext: null, settingsRevision: undefined }],
  ]) {
    const plan = motion.getLyricsLineMotionPlan({ ...base, ...overrides });
    assert.equal(plan.cascade, false, label);
    for (const index of [-2, 0, 1, 4]) assert.equal(motion.getLyricsLineMotionStyle(index, plan)['--line-motion-delay'], '0ms', label);
  }
  for (const window of [70, 200, 400, 900]) {
    const plan = motion.getLyricsLineMotionPlan({ ...base, previousContext, nextLineStart: base.position + base.leadMs + window });
    assert.deepEqual({ ...plan, cascade: undefined }, { ...motion.getAdaptiveLyricsCenteringTiming(window), cascade: undefined });
  }
});

const makeEffectHarness = (linearSupport, { vocalWindowMs = null } = {}) => {
  const queued = [];
  const animationsCreated = [];
  const styleReads = [];
  let cleanup;
  let context;
  class Row {
    constructor(index) {
      this.index=index; this.targetY=index*100; this.layoutTop=0; this.padding=false; this.inline={};
      this.style={getPropertyValue:name=>this.inline[name] ?? ''};
      this.classList={contains:name=>name==='lyrics-lyricsContainer-LyricsLine'};
    }
    getBoundingClientRect() { return { top: this.targetY }; }
    animate(frames,timing) {
      const row=this;
      const animation={frames,timing,startTime:context.document.timeline.currentTime,cancelled:false,cancellations:0,
        get currentTime(){return context.document.timeline.currentTime-this.startTime;},
        set currentTime(time){this.startTime=context.document.timeline.currentTime-time;},
        pause(){this.paused=true;},cancel(){this.cancelled=true;this.cancellations++;},play(){this.cancelled=false;row.animation=this;},addEventListener(){},
      };
      animation.effect={setKeyframes:frames=>{animation.frames=frames;}};
      row.animation=animation; animationsCreated.push(animation); return animation;
    }
  }
  const rows=Array.from({length:7},(_,i)=>new Row(i));
  const vocalStack = vocalWindowMs === null ? null : { getAttribute: () => String(vocalWindowMs) };
  class Matrix {
    constructor(transform) { this.m42 = translateY(transform || 'none'); }
    toString() { return matrix(this.m42); }
  }
  context = {
    motionApi: createMotionHelpers(linearSupport, () => Matrix),
    isScrolling:false, compact:true, syncedManualScrollReturns:new WeakMap(),
    Element:Row, document:{timeline:{currentTime:1000}},
    containerRef:{current:{querySelector:()=>({children:rows})}},
    activeLineRef:{current:{querySelector:()=>vocalStack}},
    compactLinePlaybackPositionRef:{current:1000},
    usesScriptedCompactLineShift:true, suppressLayoutShiftAnimation:false,
    visualLineIndex:1,settingsRevision:false,compactOffset:0,trailingInterludeKey:'',container:null,lyricsId:'fixture',
    paddedLyrics:Array.from({length:30},(_,i)=>({startTime:i*1500})),shouldPrecenterKaraokeTransitions:true,
    getComputedStyle(row){
      const a=row.animation;
      styleReads.push({ row, animated: !!a && !a.cancelled });
      if (!a || a.cancelled) return {transform:matrix(row.targetY)};
      return {transform:matrix(sampleFrames(a.frames, a.timing, a.currentTime))};
    },
  };
  const controller = createCompactLyricsLineController({
    motion: context.motionApi,
    manualReturns: context.syncedManualScrollReturns,
    isElement: (element) => element instanceof Row,
    readTransform: (element) => context.getComputedStyle(element).transform,
    readTimelineTime: () => context.document.timeline.currentTime,
    scheduleUpdate: (callback) => queued.push(callback),
  });
  // Mirror the engine render: one plan per line transition, written to every
  // row's inline style in the commit that precedes the scheduled shift. Row 2
  // is the anchor of line 1; each advance moves the anchor one row down.
  let planKey = null;
  let plan = null;
  const commit = () => {
    const key = JSON.stringify([context.usesScriptedCompactLineShift, context.visualLineIndex, context.settingsRevision, context.lyricsId]);
    if (key !== planKey) {
      planKey = key;
      plan = context.usesScriptedCompactLineShift ? context.motionApi.getLyricsLineMotionPlan({
        previousContext: controller.readContext(),
        visualLineIndex: context.visualLineIndex,
        settingsRevision: context.settingsRevision,
        nextLineStart: context.paddedLyrics[context.visualLineIndex + 1]?.startTime,
        leadMs: context.shouldPrecenterKaraokeTransitions ? context.motionApi.LYRICS_CENTERING_LEAD_MS : 0,
        position: context.compactLinePlaybackPositionRef.current,
        manualReturn: context.syncedManualScrollReturns.get(context.containerRef.current),
      }) : null;
    }
    rows.forEach(row => { row.inline = plan ? context.motionApi.getLyricsLineMotionStyle(row.index - context.visualLineIndex - 1, plan) : {}; });
  };
  return {rows,context,animationsCreated,styleReads,
    plan: () => plan,
    activeAnimations: () => rows.map((row) => row.animation).filter((animation) => animation && !animation.cancelled),
    run() {
      styleReads.length = 0;
      commit();
      cleanup?.();
      cleanup = controller.update({
        ...context,
        readContainer: () => context.containerRef.current,
        readActiveLine: () => context.activeLineRef.current,
        nextLineStart: context.paddedLyrics[context.visualLineIndex + 1]?.startTime,
        leadMs: context.shouldPrecenterKaraokeTransitions ? context.motionApi.LYRICS_CENTERING_LEAD_MS : 0,
        readPlaybackPosition: () => context.compactLinePlaybackPositionRef.current,
      });
      while (queued.length) queued.shift()();
    },
    y:row=>translateY(context.getComputedStyle(row).transform),
  };
};

test('scheduled travel reuses the delay and duration each row was rendered with', () => {
  for (const linearSupport of [false, true]) {
    const h = makeEffectHarness(linearSupport);
    h.run();
    h.context.visualLineIndex = 2;
    h.rows.forEach(row => { row.targetY -= 100; });
    h.run();
    assert.equal(h.plan().cascade, true);
    h.rows.forEach((row) => {
      const index = row.index - 3;
      assert.equal(row.animation.timing.delay, Number.parseFloat(row.inline['--line-motion-delay']), `row ${index}`);
      assert.equal(row.animation.timing.duration, Number.parseFloat(row.inline['--line-motion-duration']));
      assert.equal(row.animation.timing.delay, index > 0 ? motion.getLyricsLineStaggerDelay(index, h.plan()) : 0);
      assert.equal(row.animation.timing.duration, 560);
    });
    const below = h.rows.filter(row => row.index > 3).map(row => row.animation.timing.delay);
    assert.ok(below.every((delay, index) => delay > (index ? below[index - 1] : 0)), 'rows below the anchor cascade');
  }
});

test('a shorter vocal window compresses rendered delays and durations together', () => {
  const h = makeEffectHarness(true, { vocalWindowMs: 300 });
  h.run();
  h.context.visualLineIndex = 2;
  h.rows.forEach(row => { row.targetY -= 100; });
  h.run();
  const compressed = motion.getAdaptiveLyricsCenteringTiming(300).durationMs;
  const scale = compressed / 560;
  h.rows.forEach((row) => {
    assert.equal(Number.parseFloat(row.inline['--line-motion-duration']), 560, 'the line window owns the CSS timing');
    assert.ok(Math.abs(row.animation.timing.duration - compressed) < 1e-9);
    assert.ok(Math.abs(row.animation.timing.delay - Number.parseFloat(row.inline['--line-motion-delay']) * scale) < 1e-9);
    assert.ok(row.animation.timing.delay + row.animation.timing.duration <= 300 - 24 + 1e-9);
  });
});

test('native linear easing and fallback retarget without snapping or reading animated row styles', () => {
  const pair = [makeEffectHarness(false), makeEffectHarness(true)];
  const run = (h) => {
    h.run();
    assert.equal(h.styleReads.length, h.rows.length, 'only one target style read per row');
    assert.ok(h.styleReads.every(read => !read.animated), 'current travel is read from the curve before the target style pass');
  };
  const compare = () => {
    pair[0].rows.forEach((row, index) => {
      assert.ok(Math.abs(pair[0].y(row) - pair[1].y(pair[1].rows[index])) <= 0.02, `row ${index} must follow the same visual path`);
    });
  };
  pair.forEach(h => {
    run(h);
    h.context.visualLineIndex = 2;
    h.rows.forEach(row => { row.targetY -= 100; });
    run(h);
  });
  compare();
  // Correct the anchor while some rows are still delayed, then reverse the
  // target and advance to another line before the current movement settles.
  for (const { elapsed, correction, advance = false } of [
    { elapsed: 35.25, correction: -20 },
    { elapsed: 42.75, correction: 180 },
    { elapsed: 63.5, correction: -12 },
    { elapsed: 106.25, correction: -100, advance: true },
  ]) {
    pair.forEach(h => { h.context.document.timeline.currentTime += elapsed; });
    compare();
    pair.forEach(h => {
      const before = h.rows.map(h.y);
      if (advance) h.context.visualLineIndex++;
      h.context.compactOffset += correction;
      h.rows.forEach(row => { row.targetY += correction; });
      run(h);
      h.rows.forEach((row, index) => {
        assert.ok(Math.abs(h.y(row) - before[index]) <= 0.02, `retarget row ${index}: ${before[index]} -> ${h.y(row)}`);
      });
    });
    compare();
  }
  const keyframeCount = motion.LYRICS_LINE_MOTION_SEGMENTS + 1;
  pair.forEach((h, pathIndex) => {
    assert.ok(h.animationsCreated.every(animation => animation.frames.length === (pathIndex ? 2 : keyframeCount)));
    assert.ok(h.animationsCreated.every(animation => pathIndex ? animation.timing.easing.startsWith('linear(') : animation.timing.easing === 'linear'));
    const before = h.rows.map(h.y);
    const animations = h.rows.map(row => row.animation);
    h.context.compactLinePlaybackPositionRef.current = h.context.paddedLyrics[h.context.visualLineIndex + 1].startTime - 300 - 70;
    run(h);
    h.rows.forEach((row, index) => {
      assert.equal(row.animation, animations[index], 'short remaining window retains an unchanged animation');
      assert.ok(Math.abs(h.y(row) - before[index]) <= 0.02, 'unchanged target must not snap to rest');
    });
  });
  for (let step = 0; step < 60; step++) {
    pair.forEach(h => { h.context.document.timeline.currentTime += 16.667; });
    compare();
  }
  pair.forEach(h => h.rows.forEach(row => assert.ok(Math.abs(h.y(row) - row.targetY) <= 0.02)));
});

test('real row effect preserves individual travel and pending delays through anchor corrections', () => {
  const h=makeEffectHarness(); h.run();
  h.context.visualLineIndex=2; h.rows.forEach(row=>row.targetY-=100); h.run();
  const firstAnimations=h.rows.map(row=>row.animation);
  assert.equal(firstAnimations.length,7);
  assert.ok(firstAnimations.slice(0,4).every(a=>a.timing.delay===0),'anchor and past rows start together');
  assert.ok(firstAnimations.slice(4).every((a,i)=>a.timing.delay>(i ? firstAnimations[3+i].timing.delay : 0)),'rows below cascade');
  h.context.document.timeline.currentTime+=100;
  const before=h.rows.map(h.y);
  h.rows.forEach(row=>row.targetY-=20); h.context.compactOffset=-20; h.run();
  const after=h.rows.map(h.y);
  before.forEach((value,index)=>assert.ok(Math.abs(value-after[index])<1e-7,`row ${index}: ${value} -> ${after[index]}`));
  assert.equal(h.rows[0].animation.timing.delay,0,'moving row must continue immediately');
  assert.ok(h.rows.at(-1).animation.timing.delay>0,'waiting row retains remaining delay');
  const corrected=h.rows.map(row=>row.animation);
  h.context.document.timeline.currentTime+=20; h.run();
  assert.ok(h.rows.every((row,i)=>row.animation===corrected[i]),'unchanged targets retain the original animation timeline');
  h.context.document.timeline.currentTime+=1000;
  h.rows.forEach(row=>assert.ok(Math.abs(h.y(row)-row.targetY)<1e-7));
});

for (const linearSupport of [false, true]) {
  test(`supplement-only commits keep row travel, delay and velocity (${linearSupport ? 'native linear' : 'fallback'})`, () => {
    const h = makeEffectHarness(linearSupport);
    h.run(); h.context.visualLineIndex = 2; h.rows.forEach(row => { row.targetY -= 100; }); h.run();
    h.context.document.timeline.currentTime += 100;
    const animations = h.rows.map(row => row.animation);
    const poses = h.rows.map(h.y);
    const originalCurves = animations.map(animation => ({
      frames: animation.frames.map(frame => ({ ...frame })), timing: { ...animation.timing },
    }));
    const times = animations.map(animation => animation.currentTime);
    const created = h.animationsCreated.length;
    // A remote streamed row changed, without changing any measured geometry.
    h.context.suppressLayoutShiftAnimation = true; h.run();
    h.context.suppressLayoutShiftAnimation = false; h.run();
    h.rows.forEach((row, i) => {
      assert.equal(row.animation, animations[i]);
      assert.equal(row.animation.currentTime, times[i]);
      assert.equal(row.animation.cancellations, 0, 'the in-flight effect is never interrupted');
      assert.ok(Math.abs(h.y(row) - poses[i]) < 1e-8);
    });
    assert.equal(h.animationsCreated.length, created);
    // A preceding row now grows 40px. Re-centering exactly cancels that
    // natural displacement while every row keeps its original travel curve.
    h.rows.forEach(row => { row.layoutTop += 40; row.targetY -= 40; });
    h.context.compactOffset -= 40;
    h.context.suppressLayoutShiftAnimation = true; h.run();
    h.context.suppressLayoutShiftAnimation = false; h.run();
    h.rows.forEach((row, i) => {
      assert.equal(row.animation, animations[i]);
      assert.equal(row.animation.cancellations, 0);
      assert.equal(row.animation.currentTime, times[i]);
      assert.ok(Math.abs(row.layoutTop + h.y(row) - poses[i]) < 1e-8, 'content cannot add a visible jump');
    });
    h.context.document.timeline.currentTime += 80;
    h.rows.forEach((row, i) => {
      const expected = sampleFrames(originalCurves[i].frames, originalCurves[i].timing, times[i] + 80) - 40;
      assert.ok(Math.abs(h.y(row) - expected) < 1e-8);
      assert.equal(row.animation.timing.duration, 560);
    });
    assert.equal(h.animationsCreated.length, created);
    h.context.document.timeline.currentTime += 1000;
    h.rows.forEach(row => assert.ok(Math.abs(h.y(row) - row.targetY) < 1e-8, 'same destination and deadline'));
  });

  test(`a lyric boundary during supplement correction still starts normal travel (${linearSupport ? 'native linear' : 'fallback'})`, () => {
    const h = makeEffectHarness(linearSupport); h.run();
    h.context.suppressLayoutShiftAnimation = true;
    h.context.visualLineIndex++; h.rows.forEach(row => { row.targetY -= 100; }); h.run();
    assert.equal(h.activeAnimations().length, 7);
    assert.equal(h.rows[0].animation.timing.duration, 560);
    assert.ok(h.rows.at(-1).animation.timing.delay > 0);
  });
}

test('reverse seek, motion disable, and settings changes cancel live row movement', () => {
  for (const change of [h=>{h.context.visualLineIndex=1;},h=>{h.context.usesScriptedCompactLineShift=false;},h=>{h.context.settingsRevision=true;}]) {
    const h=makeEffectHarness();h.run();h.context.visualLineIndex=2;h.rows.forEach(row=>row.targetY-=100);h.run();
    assert.equal(h.activeAnimations().length,7);
    change(h);h.run();
    assert.equal(h.activeAnimations().length,0);
    h.rows.forEach(row=>assert.equal(h.y(row),row.targetY));
    h.rows.forEach(row=>assert.ok([undefined,'0ms'].includes(row.inline['--line-motion-delay']),'snapped rows also present together'));
  }
});

test('small same-direction retargets retain incoming velocity instead of restarting a full-duration curve', () => {
  const old=motion.createLyricsLineShiftMotion('matrix(1,0,0,1,0,0)',100,560);
  for(const elapsed of [80,160,240,320,400]) {
    const velocity=motion.getLyricsLineShiftVelocity(old,elapsed);
    const remaining=motion.getLyricsLineShiftOffset({...old,delay:0},elapsed);
    const next=motion.createLyricsLineShiftMotion('matrix(1,0,0,1,0,0)',remaining+1,560-elapsed,velocity);
    const nextVelocity=motion.getLyricsLineShiftVelocity(next,0);
    assert.ok(Math.abs(nextVelocity-velocity)<Math.abs(velocity)*0.025,'small anchor corrections keep incoming speed within keyframe discretization tolerance');
    assert.ok(next.durationMs<=560-elapsed);
  }
});

test('a short remaining window does not snap an unchanged running row to its target', () => {
  const h=makeEffectHarness();h.run();h.context.visualLineIndex=2;h.rows.forEach(row=>row.targetY-=100);h.run();
  h.context.document.timeline.currentTime+=160;
  const before=h.rows.map(h.y),animations=h.rows.map(row=>row.animation);
  h.context.compactLinePlaybackPositionRef.current=h.context.paddedLyrics[3].startTime-300-70;
  h.run();
  h.rows.forEach((row,i)=>{
    assert.equal(row.animation,animations[i]);
    assert.ok(Math.abs(h.y(row)-before[i])<1e-8);
  });
});

for (const linearSupport of [false, true]) {
  test(`late finish notification does not collapse a new 20px shift to 1ms (${linearSupport ? 'native linear' : 'fallback'})`, () => {
    for (const finishLag of [0, 16.667, 100]) {
      const h = makeEffectHarness(linearSupport);
      h.run();
      h.context.visualLineIndex = 2;
      h.rows.forEach(row => { row.targetY -= 100; });
      h.run();
      const completed = h.rows.map(row => row.animation);
      h.context.document.timeline.currentTime = Math.max(...completed.map(animation => (
        animation.startTime + animation.timing.delay + animation.timing.duration
      ))) + finishLag;
      // The fake does not dispatch finish automatically: reproduce the window
      // where playback has ended but the finish callback has not cleared Map.
      assert.equal(h.activeAnimations().length, h.rows.length);
      assert.ok(completed.every(animation => animation.currentTime >= animation.timing.delay + animation.timing.duration));
      const before = h.rows.map(h.y);
      h.context.compactOffset = -20;
      h.rows.forEach(row => { row.targetY -= 20; });
      h.run();
      const expectedDuration = motion.getAdaptiveLyricsCenteringTiming(null).durationMs;
      h.rows.forEach((row, index) => {
        assert.notEqual(row.animation, completed[index]);
        assert.equal(row.animation.frames.length, linearSupport ? 2 : motion.LYRICS_LINE_MOTION_SEGMENTS + 1);
        assert.equal(row.animation.timing.duration, expectedDuration, 'completed travel must receive a fresh duration budget');
        assert.equal(row.animation.timing.delay, 0);
        assert.ok(Math.abs(h.y(row) - before[index]) <= 0.02, 'new travel begins at the settled position');
      });
      h.context.document.timeline.currentTime += 1;
      h.rows.forEach((row, index) => {
        assert.ok(Math.abs(h.y(row) - before[index]) < 1, 'the new 20px shift must not finish after 1ms');
        assert.ok(Math.abs(h.y(row) - row.targetY) > 19);
      });
      h.context.document.timeline.currentTime += expectedDuration;
      h.rows.forEach(row => assert.ok(Math.abs(h.y(row) - row.targetY) <= 0.02));
    }
  });
}

test('manual scroll selection begins at the exact displayed row position and centers without a stagger', () => {
  for (const distance of [-450, -80, 75, 480]) {
    const h = makeEffectHarness(true);
    h.run();
    const displayed = new Map(h.rows.map(row => [row, row.targetY + distance]));
    h.context.syncedManualScrollReturns.set(h.context.containerRef.current, {
      positions: displayed, pending: true, expiresAt: Date.now() + 800,
    });
    // Seeking may jump several source lines. The measured handoff still wins.
    h.context.visualLineIndex = 10;
    h.rows.forEach(row => { row.targetY -= 900; });
    h.run();
    assert.equal(h.plan().cascade, false, 'the returning presentation does not cascade either');
    for (const row of h.rows) {
      assert.equal(row.animation.timing.delay, 0);
      assert.equal(row.inline['--line-motion-delay'], '0ms');
      assert.equal(row.animation.timing.duration, Number.parseFloat(row.inline['--line-motion-duration']));
      assert.ok(Math.abs(h.y(row) - displayed.get(row)) < 0.001);
      h.context.document.timeline.currentTime += row.animation.timing.duration;
      assert.ok(Math.abs(h.y(row) - row.targetY) < 0.001);
      h.context.document.timeline.currentTime -= row.animation.timing.duration;
    }
  }
});

test('entering manual scroll pauses an in-flight row handoff instead of snapping to its end', () => {
  const h = makeEffectHarness(true);
  h.run(); h.rows.forEach(row => row.targetY -= 150); h.context.visualLineIndex++; h.run();
  h.context.isScrolling = true;
  h.context.usesScriptedCompactLineShift = false;
  const animations = h.activeAnimations();
  h.run();
  assert.ok(animations.length > 0);
  assert.ok(animations.every(animation => animation.paused && !animation.cancelled));
});

test('idle return uses native scroll displacement even when the existing row animation target is unchanged', () => {
  const h = makeEffectHarness(true);
  h.run(); h.rows.forEach(row => row.targetY -= 120); h.context.visualLineIndex++; h.run();
  const displayed = new Map(h.rows.map(row => [row, row.targetY - 275]));
  h.context.syncedManualScrollReturns.set(h.context.containerRef.current, {
    positions: displayed, pending: true, expiresAt: Date.now() + 800,
  });
  h.run();
  for (const row of h.rows) assert.ok(Math.abs(h.y(row) - displayed.get(row)) < 0.001);
});

// A small reader for the stylesheet contract: style rules with their at-rule
// chain, top-level selector lists, declarations, and selector specificity.
const splitTopLevel = (text, separator = ',') => {
  const parts = [];
  let depth = 0, quote = null, start = 0;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quote) { if (char === quote && text[index - 1] !== '\\') quote = null; continue; }
    if (char === '"' || char === "'") quote = char;
    else if (char === '(' || char === '[') depth++;
    else if (char === ')' || char === ']') depth--;
    else if (char === separator && depth === 0) { parts.push(text.slice(start, index).trim()); start = index + 1; }
  }
  parts.push(text.slice(start).trim());
  return parts.filter(Boolean);
};
const readStylesheet = (text) => {
  const clean = text.replace(/\/\*[\s\S]*?\*\//g, comment => ' '.repeat(comment.length));
  const rules = [];
  const stack = [];
  let start = 0, quote = null;
  for (let index = 0; index < clean.length; index++) {
    const char = clean[index];
    if (quote) { if (char === quote && clean[index - 1] !== '\\') quote = null; continue; }
    if (char === '"' || char === "'") quote = char;
    else if (char === '{') { stack.push({ prelude: clean.slice(start, index).trim().replace(/\s+/g, ' '), body: index + 1 }); start = index + 1; }
    else if (char === '}') {
      const block = stack.pop();
      const body = clean.slice(block.body, index);
      if (!body.includes('{')) {
        rules.push({
          prelude: block.prelude,
          selectors: block.prelude.startsWith('@') ? [] : splitTopLevel(block.prelude),
          declarations: Object.fromEntries(splitTopLevel(body, ';').map((declaration) => {
            const colon = declaration.indexOf(':');
            return [declaration.slice(0, colon).trim(), declaration.slice(colon + 1).trim().replace(/\s+/g, ' ')];
          })),
          atRules: stack.map(entry => entry.prelude),
        });
      }
      start = index + 1;
    } else if (char === ';' && !stack.length) start = index + 1;
  }
  return rules;
};
const compareSpecificity = (left, right) => left[0] - right[0] || left[1] - right[1] || left[2] - right[2];
const specificity = (selector) => {
  const total = [0, 0, 0];
  const identEnd = (index) => { while (index < selector.length && /[\w-]/.test(selector[index])) index++; return index; };
  const closing = (index) => { let depth = 0; for (; index < selector.length; index++) { if (selector[index] === '(') depth++; else if (selector[index] === ')' && --depth === 0) return index; } return index; };
  for (let index = 0; index < selector.length;) {
    const char = selector[index];
    if (char === '#') { total[0]++; index = identEnd(index + 1); }
    else if (char === '.') { total[1]++; index = identEnd(index + 1); }
    else if (char === '[') { total[1]++; index = selector.indexOf(']', index) + 1; }
    else if (char === ':' && selector[index + 1] === ':') { total[2]++; index = identEnd(index + 2); }
    else if (char === ':') {
      const nameEnd = identEnd(index + 1);
      const name = selector.slice(index + 1, nameEnd);
      if (selector[nameEnd] === '(') {
        const end = closing(nameEnd);
        if (['is', 'not', 'has'].includes(name)) {
          splitTopLevel(selector.slice(nameEnd + 1, end)).map(specificity)
            .reduce((best, next) => compareSpecificity(next, best) > 0 ? next : best, [0, 0, 0])
            .forEach((part, slot) => { total[slot] += part; });
        } else if (name !== 'where') total[1]++;
        index = end + 1;
      } else { total[1]++; index = nameEnd; }
    } else if (/[a-zA-Z]/.test(char)) { total[2]++; index = identEnd(index); }
    else index++;
  }
  return total;
};
const lastCompound = selector => selector.split(/\s*(?:>|\+|~|\s)\s*(?![^(]*\))/).filter(Boolean).at(-1);

test('row presentation keeps its 6.6.27 transitions while only the travel follows the spring', () => {
  assert.deepEqual(specificity('.a > p:first-child'), [0, 2, 1]);
  assert.deepEqual(specificity(':is(.a, .b.c) > .d:not(.e, .f.g):has(.h.i)'), [0, 7, 0]);
  const rules = readStylesheet(stylesheet);
  for (const name of ['--line-motion-delay', '--line-motion-duration']) {
    const registration = rules.find(rule => rule.prelude === `@property ${name}`);
    assert.ok(registration, `${name} is registered`);
    assert.equal(registration.declarations.inherits, 'false', 'a changing row delay must not restyle every glyph');
  }
  // The row travel reads its timing back from each row. Color, opacity, blur
  // and the detail fades stay on their own clocks: moving them onto the
  // travel's longer, staggered clock kept the GPU saturated through every
  // line change and dropped frames on a 120 Hz display.
  assert.ok(!rules.some(rule => rule.prelude.includes('scripted-line-motion')));
  assert.ok(!rules.some(rule => Object.values(rule.declarations).some(value => value.includes('var(--line-motion-'))),
    'no transition follows the travel clock');
  const baseline = readStylesheet(execFileSync('git', ['show', '47eb965:style.css'], {
    cwd: fileURLToPath(new URL('..', import.meta.url)), encoding: 'utf8',
  }));
  const presentation = list => list.filter(rule => rule.selectors.some(selector => selector.includes('.lyrics-line-detail')));
  assert.ok(presentation(rules).length >= 10);
  assert.deepEqual(presentation(rules), presentation(baseline), 'row and detail fades are unchanged from 6.6.27');
  const rowRule = presentation(rules).find(rule => rule.atRules.length === 0 && 'transition-property' in rule.declarations);
  assert.deepEqual(splitTopLevel(rowRule.declarations['transition-property'].replace(/\s*!important$/, '')),
    ['transform', 'color', 'opacity', 'text-shadow'], 'blur snaps instead of animating every visible row');
});
