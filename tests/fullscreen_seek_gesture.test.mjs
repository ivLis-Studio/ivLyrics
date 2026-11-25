import assert from "node:assert/strict";
import test from "node:test";
import { getFullscreenSeekPosition } from "../src/features/fullscreen/fullscreenPlaybackTiming.mjs";
import { createFullscreenSeekGesture } from "../src/features/fullscreen/fullscreenSeekGesture.mjs";

function createHarness() {
    const progress = [];
    const preview = [];
    const capture = new Set();
    const scrubs = [];
    let resets = 0;
    let duration = 120000;
    const player = {
        data: { item: { uri: "spotify:track:one" } },
        getDuration: () => duration,
        seek(position) { scrubs.push([this.data.item.uri, position]); },
    };
    const bar = {
        getBoundingClientRect: () => ({ left: 20, width: 100 }),
        setPointerCapture: id => capture.add(id),
        hasPointerCapture: id => capture.has(id),
        releasePointerCapture: id => capture.delete(id),
    };
    let currentPlayer = player;
    const gesture = createFullscreenSeekGesture({
        getPlayer: () => currentPlayer,
        getPlaybackPosition: () => ({ clearSafePlayerProgressCorrection() { resets++; } }),
        setPreview: value => preview.push(value),
        setProgress: value => progress.push(value),
    });
    return {
        player, bar, gesture, preview, progress, capture, scrubs, resets: () => resets,
        updateDuration(value) { duration = value; },
        switchPlayer() { currentPlayer = { ...player }; },
        fire(type, clientX, patch = {}) {
            gesture.handlers[type]({ currentTarget: bar, clientX, pointerId: 8, isPrimary: true, button: 0, detail: 1, ...patch });
        },
    };
}

test("the shared seek mapping returns bounded integer milliseconds and rejects invalid geometry", () => {
    const bar = { getBoundingClientRect: () => ({ left: 20, width: 100 }) };
    assert.equal(getFullscreenSeekPosition(bar, 20.0005, 120000), 0);
    assert.equal(getFullscreenSeekPosition(bar, 70.003, "120000"), 60003);
    assert.equal(getFullscreenSeekPosition(bar, -100, 120000), 0);
    assert.equal(getFullscreenSeekPosition(bar, 700, 120000), 120000);
    assert.equal(getFullscreenSeekPosition(bar, 70, Infinity), null);
    assert.equal(getFullscreenSeekPosition(bar, NaN, 120000), null);
    assert.equal(getFullscreenSeekPosition({ getBoundingClientRect: () => ({ left: 20, width: 0 }) }, 20, 120000), null);
});

test("click and outside drag each commit once and read the live duration on release", () => {
    const h = createHarness();
    h.fire("onPointerDown", 70);
    assert.deepEqual([...h.capture], [8]);
    h.fire("onPointerUp", 70);
    h.fire("onClick", 70);
    assert.deepEqual(h.scrubs, [["spotify:track:one", 60000]]);
    h.fire("onPointerDown", 70);
    h.fire("onPointerMove", 90);
    assert.equal(h.preview.at(-1), 84000);
    h.fire("onPointerMove", 110, { pointerId: 9 });
    assert.equal(h.preview.at(-1), 84000, "other pointers cannot move the preview");
    h.updateDuration(180000);
    h.fire("onPointerUp", 150);
    h.fire("onClick", 150);
    assert.deepEqual(h.scrubs.at(-1), ["spotify:track:one", 180000]);
    assert.deepEqual(h.progress, [60000, 180000]);
    assert.equal(h.preview.at(-1), null);
    assert.equal(h.resets(), 2);
    assert.equal(h.capture.size, 0);
});

test("track changes, replaced players, and interrupted pointers cancel the gesture", () => {
    for (const interrupt of ["track", "player", "event", "capture", "cancel", "poll"]) {
        const h = createHarness();
        h.fire("onPointerDown", 70);
        h.fire("onPointerMove", 90);
        if (interrupt === "track" || interrupt === "poll") h.player.data.item.uri = "spotify:track:two";
        if (interrupt === "player") h.switchPlayer();
        if (interrupt === "event") h.fire("onPointerCancel", 90);
        if (interrupt === "capture") h.fire("onLostPointerCapture", 90);
        if (interrupt === "cancel") h.gesture.cancel();
        if (interrupt === "poll") assert.equal(h.gesture.isDragging(), false);
        h.fire("onPointerUp", 100);
        h.fire("onClick", 100);
        assert.deepEqual(h.scrubs, [], interrupt);
        assert.equal(h.preview.at(-1), null, interrupt);
        assert.equal(h.capture.size, 0, interrupt);
    }
});

test("secondary pointers cannot seek and direct click dispatch keeps working", () => {
    const h = createHarness();
    h.fire("onPointerDown", 70, { button: 2 });
    h.fire("onPointerUp", 70);
    h.fire("onPointerDown", 70, { isPrimary: false });
    h.fire("onPointerUp", 70);
    assert.equal(h.scrubs.length, 0);
    h.fire("onClick", 70, { detail: 0 });
    assert.deepEqual(h.scrubs, [["spotify:track:one", 60000]]);
});
