import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../Pages.js', import.meta.url), 'utf8');
const helpers = source.slice(source.indexOf('const LYRICS_CENTERING_DURATION_MS'), source.indexOf('const cubicBezierCoordinate'));
const effectStart = source.indexOf('\t// Position-index and anchor-offset still commit together.');
const effectEnd = source.indexOf('\n\tuseEffect(() => () => {\n\t\tcompactLineShiftAnimationsRef', effectStart);
const createMotionHelpers = (linearSupport) => {
  const context = vm.createContext(linearSupport === undefined ? {} : {
    CSS: { supports: (property, value) => linearSupport
      && property === 'animation-timing-function' && value === 'linear(0, 1)' },
  });
  vm.runInContext(`${helpers}\nglobalThis.motion = { getAdaptiveLyricsCenteringTiming, getLyricsLineStaggerDelay, getLyricsLineMotionProgress, createLyricsLineShiftMotion, getLyricsLineShiftOffset, getLyricsLineShiftVelocity };`, context);
  return context.motion;
};
const motion = createMotionHelpers();

for (const count of [3, 7, 21]) {
  test(`${count} visible rows start in sequence within the available transition window`, () => {
    for (const window of [null, 120, 300, 1500]) {
      const timing = motion.getAdaptiveLyricsCenteringTiming(window);
      const delays = Array.from({length:count}, (_, index) => motion.getLyricsLineStaggerDelay(index,count,timing));
      assert.equal(delays[0],0);
      assert.ok(delays.every((delay,index) => index === 0 || delay > delays[index-1]), 'last rows must not start as one batch');
      assert.ok(delays.at(-1) <= timing.maxStaggerMs + 1e-8);
      assert.ok(timing.durationMs + delays.at(-1) <= (window ? Math.min(600, Math.max(80,window-24)) : 600) + 1e-8);
    }
  });
}

test('row motion settles monotonically and retargets in either direction without overshoot', () => {
  for (const delta of [-180, 180]) for (const incoming of [null, 0, -delta/200, -delta/10, delta/100]) {
    const profile = motion.createLyricsLineShiftMotion('matrix(1,0,0,1,0,0)',delta,420,incoming);
    const values = Array.from({length:101},(_,i)=>motion.getLyricsLineMotionProgress(i/100,profile.initialSlope));
    assert.ok(Math.abs(values[0])<1e-8 && Math.abs(values.at(-1)-1)<1e-8);
    assert.ok(values.every((v,i)=>v>=-1e-8 && v<=1+1e-8 && (i===0 || v>=values[i-1]-1e-8)));
    assert.equal(profile.keyframes.at(-1).transform,'matrix(1,0,0,1,0,0)');
    assert.equal(motion.getLyricsLineShiftVelocity(profile,420),0);
    assert.equal(motion.getLyricsLineShiftVelocity(profile,20,40),0,'waiting rows are stationary');
  }
});

const matrix = y => `matrix(1,0,0,1,0,${y})`;
const translateY = transform => Number(transform.match(/matrix\([^,]+,[^,]+,[^,]+,[^,]+,[^,]+,([^\)]+)\)/)?.[1] || 0)
  + Number(transform.match(/translateY\(([^p]+)px\)/)?.[1] || 0);
// Model the browser's numeric linear() stops independently of the production
// curve. Treating this as plain linear would hide an incorrect two-frame path.
const sampleEasing = (easing, progress) => {
  if (!easing || easing === 'linear') return progress;
  assert.match(easing, /^linear\([^()]+\)$/);
  const stops = easing.slice(7, -1).split(',').map(Number);
  assert.ok(stops.length >= 2 && stops.every(Number.isFinite));
  const position = progress * (stops.length - 1);
  const left = Math.min(stops.length - 2, Math.floor(position));
  return stops[left] + (stops[left + 1] - stops[left]) * (position - left);
};
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
  const timing = { duration: 100, delay: 20, easing: 'linear(0, 0.2, 1)' };
  for (const [elapsed, expected] of [[0,100],[20,100],[45,90],[70,80],[95,40],[120,0],[160,0]]) {
    assert.ok(Math.abs(sampleFrames(frames, timing, elapsed) - expected) < 1e-10);
  }
});

test('two transform frames and 25-frame fallback follow the same positions and measured offsets', (t) => {
  const native = createMotionHelpers(true);
  let samples = 0, maxPathError = 0, maxOffsetError = 0;
  for (const fallback of [createMotionHelpers(), createMotionHelpers(false)]) {
    for (const delta of [-1234.567, -180, -0.5, 0.5, 37.25, 1234.567]) {
      for (const duration of [1, 80, 420]) for (const slope of [null, 0, 0.25, 1, 2.2, 2.5]) {
        const velocity = slope === null ? null : -slope * delta / duration;
        const target = matrix(137.125);
        const compact = native.createLyricsLineShiftMotion(target, delta, duration, velocity);
        const expanded = fallback.createLyricsLineShiftMotion(target, delta, duration, velocity);
        assert.equal(compact.keyframes.length, 2);
        assert.equal(compact.easing.slice(7, -1).split(',').length, 25);
        assert.equal(expanded.keyframes.length, 25);
        assert.equal(expanded.easing, 'linear');
        assert.equal(compact.durationMs, expanded.durationMs);
        for (const delay of [0, 38, 180]) for (let sample = -1; sample <= 241; sample++) {
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

const makeEffectHarness = (linearSupport) => {
  const queued = [];
  const animationsCreated = [];
  const styleReads = [];
  let cleanup;
  let context;
  class Row {
    constructor(index) { this.targetY=index*100; this.padding=false; this.classList={contains:name=>name==='lyrics-lyricsContainer-LyricsLine'}; }
    animate(frames,timing) {
      const row=this;
      const animation={frames,timing,startTime:context.document.timeline.currentTime,cancelled:false,
        get currentTime(){return context.document.timeline.currentTime-this.startTime;},
        set currentTime(time){this.startTime=context.document.timeline.currentTime-time;},
        cancel(){this.cancelled=true;},play(){this.cancelled=false;row.animation=this;},addEventListener(){},
      };
      row.animation=animation; animationsCreated.push(animation); return animation;
    }
  }
  const rows=Array.from({length:7},(_,i)=>new Row(i));
  context=vm.createContext({
    ...(linearSupport === undefined ? {} : { CSS: { supports: () => linearSupport } }),
    Element:Row, document:{timeline:{currentTime:1000}},
    containerRef:{current:{querySelector:()=>({children:rows})}},
    activeLineRef:{current:{querySelector:()=>null}},
    compactLineShiftAnimationsRef:{current:new Map()},
    compactLineTransformSnapshotsRef:{current:new WeakMap()},
    compactLineMotionDataRef:{current:new WeakMap()},
    compactLineMotionContextRef:{current:null},
    compactLinePlaybackPositionRef:{current:1000},
    usesScriptedCompactLineShift:true, suppressLayoutShiftAnimation:false,
    visualLineIndex:1,settingsRevision:false,compactOffset:0,trailingInterludeKey:'',containerReady:true,lyricsId:'fixture',
    paddedLyrics:Array.from({length:30},(_,i)=>({startTime:i*1500})),shouldPrecenterKaraokeTransitions:true,
    useSyncedLayoutEffect(effect){cleanup=effect();},queueMicrotask:callback=>queued.push(callback),
    getComputedStyle(row){
      const a=row.animation;
      styleReads.push({ row, animated: !!a && !a.cancelled });
      if (!a || a.cancelled) return {transform:matrix(row.targetY)};
      return {transform:matrix(sampleFrames(a.frames, a.timing, a.currentTime))};
    },
  });
  vm.runInContext(helpers,context);
  return {rows,context,animationsCreated,styleReads,
    run(){styleReads.length=0;cleanup?.();vm.runInContext(source.slice(effectStart,effectEnd),context);while(queued.length)queued.shift()();},
    y:row=>translateY(context.getComputedStyle(row).transform),
  };
};

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
  pair.forEach((h, pathIndex) => {
    assert.ok(h.animationsCreated.every(animation => animation.frames.length === (pathIndex ? 2 : 25)));
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
  for (let step = 0; step < 50; step++) {
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
  assert.ok(firstAnimations.every((a,i)=>i===0 || a.timing.delay>firstAnimations[i-1].timing.delay));
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

test('reverse seek, motion disable, and settings changes cancel live row movement', () => {
  for (const change of [h=>{h.context.visualLineIndex=1;},h=>{h.context.usesScriptedCompactLineShift=false;},h=>{h.context.settingsRevision=true;}]) {
    const h=makeEffectHarness();h.run();h.context.visualLineIndex=2;h.rows.forEach(row=>row.targetY-=100);h.run();
    assert.equal(h.context.compactLineShiftAnimationsRef.current.size,7);
    change(h);h.run();
    assert.equal(h.context.compactLineShiftAnimationsRef.current.size,0);
    h.rows.forEach(row=>assert.equal(h.y(row),row.targetY));
  }
});

test('small same-direction retargets retain incoming velocity instead of restarting a full-duration curve', () => {
  const old=motion.createLyricsLineShiftMotion('matrix(1,0,0,1,0,0)',100,420);
  for(const elapsed of [80,160,240,320]) {
    const velocity=motion.getLyricsLineShiftVelocity(old,elapsed);
    const remaining=100*(1-motion.getLyricsLineMotionProgress(elapsed/420,old.initialSlope));
    const next=motion.createLyricsLineShiftMotion('matrix(1,0,0,1,0,0)',remaining+1,420-elapsed,velocity);
    const nextVelocity=motion.getLyricsLineShiftVelocity(next,0);
    assert.ok(Math.abs(nextVelocity-velocity)<Math.abs(velocity)*0.025,'small anchor corrections keep incoming speed within keyframe discretization tolerance');
    assert.ok(next.durationMs<=420-elapsed);
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
      assert.equal(h.context.compactLineShiftAnimationsRef.current.size, h.rows.length);
      assert.ok(completed.every(animation => animation.currentTime >= animation.timing.delay + animation.timing.duration));
      const before = h.rows.map(h.y);
      h.context.compactOffset = -20;
      h.rows.forEach(row => { row.targetY -= 20; });
      h.run();
      const expectedDuration = motion.getAdaptiveLyricsCenteringTiming(null).durationMs;
      h.rows.forEach((row, index) => {
        assert.notEqual(row.animation, completed[index]);
        assert.equal(row.animation.frames.length, linearSupport ? 2 : 25);
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
