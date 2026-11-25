import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import test from "node:test";
import { createFullscreenTrackLibrary } from "../src/features/fullscreen/fullscreenTrackLibrary.mjs";

const a = "spotify:track:first";
const b = "spotify:track:second";

function createHarness() {
    const reads = [];
    const writes = [];
    const recordWrite = (method, { uris }) => {
        const request = Promise.withResolvers();
        writes.push({ method, uri: uris[0], ...request });
        return request.promise;
    };
    const library = {
        contains(uri) {
            const request = Promise.withResolvers();
            reads.push({ uri, ...request });
            return request.promise;
        },
        add: payload => recordWrite("add", payload),
        remove: payload => recordWrite("remove", payload),
    };
    let uri = a;
    const pendingWrites = new Map();
    function createView() {
        const view = { snapshot: null, errors: [] };
        const control = createFullscreenTrackLibrary({
            readTrackUri: () => uri,
            readLibrary: () => library,
            pendingWrites,
            publish: snapshot => { view.snapshot = snapshot; },
            reportError: error => view.errors.push(error),
        });
        return Object.assign(view, control);
    }
    return {
        current: createView(), createView, reads, writes,
        select(next) { uri = next; },
    };
}

test("new-track clicks use the new library status and share simultaneous reads and writes", async () => {
    const h = createHarness();
    h.current.syncTrack();
    await setImmediate();
    h.reads[0].resolve([true]);
    await setImmediate();
    assert.deepEqual(h.current.snapshot, { uri: a, liked: true });

    h.select(b);
    await h.current.toggle(a);
    assert.deepEqual(h.current.snapshot, { uri: b, liked: null });
    const clicked = h.current.toggle(b);
    const duplicateClick = h.current.toggle(b);
    h.current.syncTrack({ refresh: true });
    h.current.syncTrack();
    await setImmediate();
    assert.deepEqual(h.reads.map(({ uri }) => uri), [a, b]);
    assert.equal(h.writes.length, 0);
    h.reads[1].resolve([false]);
    await setImmediate();
    assert.deepEqual(h.writes.map(({ method, uri }) => [method, uri]), [["add", b]]);
    h.writes[0].resolve();
    await Promise.all([clicked, duplicateClick]);
    assert.deepEqual(h.current.snapshot, { uri: b, liked: true });

    const remove = h.current.toggle(b);
    await setImmediate();
    assert.deepEqual(h.writes.map(({ method, uri }) => [method, uri]), [["add", b], ["remove", b]]);
    h.writes[1].resolve();
    await remove;
    assert.deepEqual(h.current.snapshot, { uri: b, liked: false });
});

test("a late result after a song change cannot change the new heart or apply a queued click", async () => {
    const h = createHarness();
    h.current.syncTrack();
    const clicked = h.current.toggle(a);
    await setImmediate();
    h.select(b);
    h.current.syncTrack({ refresh: true });
    await setImmediate();
    h.reads[1].resolve(false);
    h.reads[0].resolve(true);
    await clicked;
    assert.deepEqual(h.current.snapshot, { uri: b, liked: false });
    assert.equal(h.writes.length, 0);
});

test("reopening the control for the same track waits for its in-flight write", async () => {
    const h = createHarness();
    h.current.syncTrack();
    await setImmediate();
    h.reads[0].resolve(true);
    await setImmediate();
    const removing = h.current.toggle(a);
    await setImmediate();
    assert.equal(h.writes[0].method, "remove");
    h.current.dispose();
    const reopened = h.createView();
    reopened.syncTrack();
    await setImmediate();
    assert.equal(h.reads.length, 1);
    await reopened.toggle(a);
    h.writes[0].resolve();
    await removing;
    await setImmediate();
    assert.deepEqual(h.reads.map(({ uri }) => uri), [a, a]);
    h.reads[1].resolve(false);
    await setImmediate();
    assert.deepEqual(reopened.snapshot, { uri: a, liked: false });
    assert.deepEqual(h.current.snapshot, { uri: a, liked: true }, "the closed control never receives updates");
});

test("unavailable status and failed writes leave the heart safe to retry", async () => {
    const h = createHarness();
    h.current.syncTrack();
    const unknown = h.current.toggle(a);
    await setImmediate();
    h.reads[0].reject(new Error("contains failed"));
    await unknown;
    assert.equal(h.writes.length, 0);
    assert.deepEqual(h.current.snapshot, { uri: a, liked: null });

    const retry = h.current.toggle(a);
    await setImmediate();
    h.reads[1].resolve(true);
    await setImmediate();
    const failure = new Error("remove failed");
    h.writes[0].reject(failure);
    await retry;
    assert.deepEqual(h.current.errors, [failure]);
    assert.deepEqual(h.current.snapshot, { uri: a, liked: true });
    const remove = h.current.toggle(a);
    await setImmediate();
    h.writes[1].resolve();
    await remove;
    assert.deepEqual(h.writes.map(({ method }) => method), ["remove", "remove"]);
    assert.deepEqual(h.current.snapshot, { uri: a, liked: false });
});
