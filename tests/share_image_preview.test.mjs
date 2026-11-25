import { useShareImagePreview } from '../src/features/share/useShareImagePreview.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';

function createPreviewHarness({ signal, abortRender = false, settings = {} } = {}) {
  const queue = {current: {running: false, pending: null}};
  const frames = new Map();
  const requests = [];
  const previews = [];
  const busy = [];
  const errors = [];
  const rendered = [];
  let cleanup, effect, frameId = 0;
  const react = {useRef: () => queue, useEffect: callback => {effect = callback;}};
  const trackInfo = {name: 'Song', artist: 'Artist'};
  const render = selectedLines => useShareImagePreview(react, {
    selectedLines, trackInfo, template: 'cover', customSettings: settings, signal,
    setPreviewUrl: value => previews.push(value),
    onRendered: result => rendered.push(result?.dataUrl ?? null),
    setIsGenerating: value => busy.push(value),
    scheduleFrame: callback => {frames.set(++frameId, callback); return frameId;},
    cancelFrame: id => frames.delete(id),
    reportError: error => errors.push(error),
    generateImage: (options, { signal } = {}) => new Promise((resolve, reject) => {
      requests.push({options, signal, resolve, reject});
      if (abortRender) signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
    }),
  });
  return {
    requests, previews, busy, errors, rendered,
    render(lines = [{originalText: 'A'}]) {
      cleanup?.(); render(lines); cleanup = effect();
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
  const h = createPreviewHarness({ settings: { imageWidth: 1440 } });
  h.render(); h.render([{originalText: 'B'}]); h.render([{originalText: 'C'}]);
  assert.equal(h.pendingFrames(), 1);
  const run = h.frame();
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].options.lyrics[0].originalText, 'C');
  assert.equal(h.requests[0].options.width, undefined);
  assert.equal(h.requests[0].options.customSettings.imageWidth, 1440);
  assert.equal(h.requests[0].options.output, 'dataUrl');
  h.requests[0].resolve({dataUrl: 'C.png'}); await run;
  assert.deepEqual(h.previews, ['C.png']);
  assert.deepEqual(h.rendered, ['C.png']);
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
  assert.deepEqual(h.rendered, ['C.png']);
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
  assert.deepEqual(h.previews, [null, 'retry.png']);
});

test('a newer selection releases an obsolete preview that is still preparing resources', async () => {
  const h = createPreviewHarness({ abortRender: true });
  h.render();
  const rendering = h.frame();
  h.render([{ originalText: 'New selection' }]);
  assert.equal(h.requests[0].signal?.aborted, true);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.requests.length, 2);
  h.requests[1].resolve({ dataUrl: 'new.png' });
  await rendering;
  assert.deepEqual(h.previews, ['new.png']);
  assert.deepEqual(h.errors, []);
  assert.equal(h.busy.at(-1), false);
});

test('closing the dialog cancels both an active render and a queued frame', async () => {
  const active = new AbortController();
  const h = createPreviewHarness({ signal: active.signal, abortRender: true });
  h.render();
  const rendering = h.frame();
  active.abort();
  assert.equal(h.requests[0].signal?.aborted, true);
  await rendering;
  assert.deepEqual(h.previews, []);
  assert.deepEqual(h.errors, []);

  const queued = new AbortController();
  const k = createPreviewHarness({ signal: queued.signal });
  k.render();
  queued.abort();
  assert.equal(k.pendingFrames(), 0);
  await k.frame();
  assert.equal(k.requests.length, 0);
});
