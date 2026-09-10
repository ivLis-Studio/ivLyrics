import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../Pages.js', import.meta.url), 'utf8');

for (const compact of [true, false]) {
  test(`${compact ? 'compact' : 'expanded'} layout notifications read the latest anchor once per frame and cancel on cleanup`, () => {
    const marker = compact
      ? '\tuseSyncedLayoutEffect(() => {\n\t\tif (!compact || isScrolling || typeof ResizeObserver'
      : '\tuseEffect(() => {\n\t\tif (compact || isScrolling || typeof ResizeObserver';
    const start = source.indexOf(marker);
    const end = source.indexOf(compact ? '\n\tuseEffect(() => {' : '\n\tconst stableLineStyles', start + marker.length);
    assert.ok(start >= 0 && end > start, 'layout observer effect exists');
    const pending = new Map();
    const observers = [];
    const reads = [];
    const containerRef = { current: { name: 'container' } };
    const activeLineRef = { current: { name: 'first anchor', height: 40 } };
    let requested = 0;
    let cancelled = 0;
    let cleanup;
    class Observer {
      constructor(callback) { this.callback = callback; this.targets = []; observers.push(this); }
      observe(target) { this.targets.push(target); }
      disconnect() { this.disconnected = true; }
    }
    const context = {
      compact, isScrolling: false, containerRef, activeLineRef,
      visualLineIndex: 1, trailingInterludeKey: null, containerReady: true,
      lyricsId: 'fixture', preparedLyrics: [], settingsRevision: false, anchorRevision: 0,
      ResizeObserver: Observer, MutationObserver: Observer,
      requestAnimationFrame(callback) { const id = ++requested; pending.set(id, callback); return id; },
      cancelAnimationFrame(id) { cancelled++; pending.delete(id); },
      syncCompactOffset() { reads.push([containerRef.current, activeLineRef.current]); },
      scrollSyncedContainerToActiveLine(container, line, behavior) {
        assert.equal(behavior, 'sync'); reads.push([container, line]);
      },
      useSyncedLayoutEffect(effect) { cleanup = effect(); },
      useEffect(effect) { cleanup = effect(); },
    };
    vm.runInNewContext(source.slice(start, end), context);
    assert.equal(observers.length, 2);
    const originalAnchor = activeLineRef.current;
    assert.equal(observers[0].targets[0], originalAnchor);
    assert.equal(observers[1].targets[0], originalAnchor);

    // A resize and multiple vocal attributes can change before the same frame.
    for (let i = 0; i < 100; i++) observers[i % 2].callback();
    assert.equal(requested, 1);
    assert.equal(cancelled, 0);
    assert.equal(reads.length, 0, 'measurement remains deferred to the next frame');
    activeLineRef.current = { name: 'latest anchor', height: 95 };
    const frame = pending.values().next().value;
    pending.clear();
    frame();
    assert.deepEqual(reads, [[containerRef.current, activeLineRef.current]]);

    observers[0].callback();
    assert.equal(requested, 2, 'later frames still receive new geometry');
    cleanup();
    assert.equal(pending.size, 0, 'unmount cancels the outstanding measurement');
    assert.equal(cancelled, 1);
    assert.ok(observers.every(observer => observer.disconnected));
    assert.equal(reads.length, 1);
  });
}
