import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../OptionsMenu.js', import.meta.url), 'utf8');
const start = source.indexOf('  const previewGenerationRef =');
const end = source.indexOf('  const toggleLine =', start);

function createPreviewHarness() {
  const queue = {current: {running: false, pending: null}};
  const frames = new Map();
  const requests = [];
  const previews = [];
  const busy = [];
  const errors = [];
  let cleanup, effect, frameId = 0;
  const context = vm.createContext({
    react: {useRef: () => queue, useEffect: callback => {effect = callback;}},
    selectedLines: [{originalText: 'A'}], template: 'cover', customSettings: {},
    trackInfo: {name: 'Song', artist: 'Artist'},
    setPreviewUrl: value => previews.push(value),
    setIsGenerating: value => busy.push(value),
    requestAnimationFrame: callback => {frames.set(++frameId, callback); return frameId;},
    cancelAnimationFrame: id => frames.delete(id),
    console: {error: (...args) => errors.push(args)},
    LyricsShareImage: {generateImage: options => new Promise((resolve, reject) => requests.push({options, resolve, reject}))},
  });
  const render = vm.runInContext(`(function render() {${source.slice(start, end)}})`, context);
  return {
    requests, previews, busy, errors,
    render(lines = [{originalText: 'A'}]) {
      cleanup?.(); context.selectedLines = lines; render(); cleanup = effect();
    },
    frame() {
      const callbacks = [...frames.values()]; frames.clear();
      return Promise.all(callbacks.map(callback => callback()));
    },
    unmount() {cleanup?.();},
    pendingFrames: () => frames.size,
  };
}

test('preview changes in one frame render only the latest full-size image', async () => {
  const h = createPreviewHarness();
  h.render(); h.render([{originalText: 'B'}]); h.render([{originalText: 'C'}]);
  assert.equal(h.pendingFrames(), 1);
  const run = h.frame();
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].options.lyrics[0].originalText, 'C');
  assert.equal(h.requests[0].options.width, 1080);
  assert.equal(h.requests[0].options.output, 'dataUrl');
  h.requests[0].resolve({dataUrl: 'C.png'}); await run;
  assert.deepEqual(h.previews, ['C.png']);
});

test('in-flight previews serialize work, discard stale results, and skip superseded requests', async () => {
  const h = createPreviewHarness(); h.render();
  const run = h.frame();
  h.render([{originalText: 'B'}]); await h.frame();
  h.render([{originalText: 'C'}]); await h.frame();
  assert.equal(h.requests.length, 1);
  h.requests[0].resolve({dataUrl: 'A.png'});
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.requests.length, 2);
  assert.equal(h.requests[1].options.lyrics[0].originalText, 'C');
  assert.deepEqual(h.previews, []);
  h.requests[1].resolve({dataUrl: 'C.png'}); await run;
  assert.deepEqual(h.previews, ['C.png']);
  assert.equal(h.busy.at(-1), false);
});

test('clearing selection or closing cancels queued work and ignores late results', async () => {
  const h = createPreviewHarness(); h.render(); const run = h.frame();
  h.render([{originalText: 'B'}]); h.render([]);
  assert.deepEqual(h.previews, [null]);
  h.requests[0].resolve({dataUrl: 'A.png'}); await run;
  assert.equal(h.requests.length, 1);
  h.render(); const next = h.frame(); h.unmount();
  h.requests[1].resolve({dataUrl: 'late.png'}); await next;
  assert.deepEqual(h.previews, [null]);
  assert.equal(h.pendingFrames(), 0);
});

test('failed generation releases the queue so a later preview can succeed', async () => {
  const h = createPreviewHarness(); h.render(); const run = h.frame();
  h.requests[0].reject(new Error('image failed')); await run;
  assert.equal(h.errors.length, 1); assert.equal(h.busy.at(-1), false);
  h.render(); const retry = h.frame();
  h.requests[1].resolve({dataUrl: 'retry.png'}); await retry;
  assert.deepEqual(h.previews, ['retry.png']);
});
