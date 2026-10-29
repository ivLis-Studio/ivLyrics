import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../Addon_Lyrics_LyricsPlus.js', import.meta.url), 'utf8');
const track = { uri: 'spotify:track:fixture', title: 'Fixture', artist: 'Artist', duration: 120000 };
const payload = text => ({ type: 'Line', lyrics: [{ time: 0, duration: 1000, text }] });
const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const flush = async () => { for (let i = 0; i < 16; i++) await Promise.resolve(); };

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}

function observe(promise) {
    const state = { done: false, value: undefined, error: undefined };
    promise.then(value => { state.done = true; state.value = value; }, error => { state.done = true; state.error = error; });
    return state;
}

function harness({ abortController = true } = {}) {
    let now = 0;
    let nextTimer = 0;
    const timers = new Map();
    const calls = [];
    const window = { LyricsAddonManager: { register() {} } };
    const context = {
        window, URL, Map, AbortController: abortController ? AbortController : undefined,
        atob: value => Buffer.from(value, 'base64').toString('utf8'),
        console: { warn() {}, log() {} },
        setTimeout(callback, delay) {
            const id = ++nextTimer;
            timers.set(id, { callback, at: now + delay });
            return id;
        },
        clearTimeout(id) { timers.delete(id); },
        fetch(url, options) {
            const pending = deferred();
            const call = { ...pending, url: new URL(url), signal: options.signal, at: now };
            calls.push(call);
            // Intentionally do not auto-reject on abort: even a late transport
            // or response-body completion must not change the selected result.
            return pending.promise;
        }
    };
    vm.runInNewContext(source, context, { filename: 'Addon_Lyrics_LyricsPlus.js' });
    return {
        calls, timers,
        fetch: () => window.__ivLyricsPlusDebug.fetchLyricsData(track),
        getLyrics: () => window.LyricsPlusLyricsAddon.getLyrics(track),
        async advance(ms) {
            const target = now + ms;
            await flush();
            while (true) {
                const ready = [...timers].filter(([, timer]) => timer.at <= target)
                    .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
                if (!ready) break;
                const [id, timer] = ready;
                now = timer.at;
                timers.delete(id);
                timer.callback();
                await flush();
            }
            now = target;
            await flush();
        }
    };
}

test('a quick usable primary body makes one request and stays preferred on the next track', async () => {
    const h = harness();
    const first = observe(h.fetch());
    await flush();
    assert.equal(h.calls.length, 1);
    h.calls[0].resolve(response(payload('primary')));
    await flush();
    assert.equal(first.value.mirror, 1);
    assert.equal(h.calls[0].signal.aborted, false);
    assert.equal(h.timers.size, 0);
    await h.advance(20000);
    assert.equal(h.calls.length, 1);

    const second = observe(h.fetch());
    await flush();
    assert.equal(h.calls[1].url.host, h.calls[0].url.host, 'a success must not round-robin to an unproven mirror');
    h.calls[1].resolve(response(payload('next track')));
    await flush();
    assert.equal(second.value.mirror, 1);
    assert.equal(h.timers.size, 0);
});

test('a slow primary starts its alternate after 750 ms and a usable alternate cancels the primary', async () => {
    const h = harness();
    const state = observe(h.fetch());
    await h.advance(749);
    assert.equal(h.calls.length, 1);
    await h.advance(1);
    assert.equal(h.calls.length, 2);
    assert.equal(h.calls[1].at, 750);
    h.calls[1].resolve(response(payload('alternate')));
    await flush();
    assert.equal(state.value.mirror, 2);
    assert.equal(h.calls[0].signal.aborted, true);
    assert.equal(h.calls[1].signal.aborted, false);
    assert.equal(h.timers.size, 0);

    h.calls[0].resolve(response(payload('late primary')));
    await flush();
    const next = observe(h.fetch());
    await flush();
    assert.equal(h.calls[2].url.host, h.calls[1].url.host, 'late losers cannot replace the preferred successful mirror');
    h.calls[2].resolve(response(payload('next')));
    await flush();
    assert.equal(next.value.mirror, 2);
    assert.equal(h.timers.size, 0);
});

test('a fast primary failure launches its alternate immediately and cancels the stagger timer', async () => {
    const h = harness();
    const state = observe(h.fetch());
    await flush();
    h.calls[0].reject(new TypeError('Failed to fetch'));
    await flush();
    assert.equal(h.calls.length, 2);
    assert.equal(h.calls[1].at, 0);
    h.calls[1].resolve(response(payload('fallback')));
    await flush();
    assert.equal(state.value.mirror, 2);
    await h.advance(1000);
    assert.equal(h.calls.length, 2);
    assert.equal(h.timers.size, 0);
});

test('headers without a body cannot win or suppress the alternate', async () => {
    const h = harness();
    const body = deferred();
    const state = observe(h.fetch());
    await flush();
    h.calls[0].resolve({ ok: true, status: 200, json: () => body.promise });
    await h.advance(750);
    assert.equal(state.done, false);
    assert.equal(h.calls.length, 2);
    h.calls[1].resolve(response(payload('complete alternate')));
    await flush();
    assert.equal(state.value.mirror, 2);
    assert.equal(h.calls[0].signal.aborted, true);
    body.resolve(payload('late body'));
    await flush();
    assert.equal(state.value.data.lyrics[0].text, 'complete alternate');
    assert.equal(h.timers.size, 0);
});

test('a failed HTTP status starts fallback without waiting for its error body', async () => {
    const h = harness();
    const state = observe(h.fetch());
    let errorBodyRead = false;
    await flush();
    h.calls[0].resolve({
        ok: false, status: 503,
        json() { errorBodyRead = true; return new Promise(() => {}); }
    });
    await flush();
    assert.equal(h.calls.length, 2);
    assert.equal(h.calls[1].at, 0);
    assert.equal(errorBodyRead, false);
    assert.equal(h.calls[0].signal.aborted, true);
    h.calls[1].resolve(response(payload('fallback')));
    await flush();
    assert.equal(state.value.mirror, 2);
    assert.equal(h.timers.size, 0);
});

test('the primary may still win after the hedge and cancels the pending alternate', async () => {
    const h = harness();
    const state = observe(h.fetch());
    await h.advance(750);
    h.calls[0].resolve(response(payload('primary')));
    await flush();
    assert.equal(state.value.mirror, 1);
    assert.equal(h.calls[1].signal.aborted, true);
    assert.equal(h.timers.size, 0);
});

test('an alternate miss waits for the still pending primary', async () => {
    const h = harness();
    const state = observe(h.fetch());
    await h.advance(750);
    h.calls[1].resolve(response({ lyrics: [] }));
    await flush();
    assert.equal(state.done, false);
    h.calls[0].resolve(response(payload('late but usable')));
    await flush();
    assert.equal(state.value.mirror, 1);
    assert.equal(h.timers.size, 0);
});

test('404 and valid empty lyrics produce a genuine miss only when every mirror misses', async () => {
    const h = harness();
    const state = observe(h.fetch());
    await flush();
    h.calls[0].resolve(response({ error: 'not found' }, 404));
    await flush();
    assert.equal(h.calls.length, 2);
    h.calls[1].resolve(response({ lyrics: [{ text: '  ', syllabus: [] }] }));
    await flush();
    assert.equal(state.done, true);
    assert.equal(state.value, null);
    assert.equal(state.error, undefined);
    assert.equal(h.timers.size, 0);
});

test('a transient response is retained when the other mirror reports no lyrics', async t => {
    for (const transientFirst of [true, false]) {
        await t.test(transientFirst ? '503 then 404' : '404 then 503', async () => {
            const h = harness();
            const state = observe(h.fetch());
            await flush();
            h.calls[0].resolve(response({ error: 'unavailable' }, transientFirst ? 503 : 404));
            await flush();
            h.calls[1].resolve(response({ error: 'unavailable' }, transientFirst ? 404 : 503));
            await flush();
            assert.equal(state.done, true);
            assert.equal(state.error.status, 503);
            assert.equal(h.timers.size, 0);
        });
    }
});

test('an empty, malformed or errored response never wins over usable lyrics', async t => {
    const cases = [
        ['empty', response({ lyrics: [] })],
        ['missing lyrics', response({})],
        ['JSON failure', { ok: true, status: 200, json: async () => { throw new SyntaxError('bad JSON'); } }],
        ['error with lyrics', response({ ...payload('untrusted'), error: 'failed' })],
        ['HTTP error with lyrics', response(payload('untrusted'), 503)]
    ];
    for (const [label, invalid] of cases) {
        await t.test(label, async () => {
            const h = harness();
            const state = observe(h.fetch());
            await flush();
            h.calls[0].resolve(invalid);
            await flush();
            assert.equal(state.done, false);
            assert.equal(h.calls.length, 2, 'an unusable response should immediately try the alternate');
            h.calls[1].resolve(response(payload('usable')));
            await flush();
            assert.equal(state.value.data.lyrics[0].text, 'usable');
            assert.equal(h.timers.size, 0);
        });
    }
});

test('one ten-second deadline covers stalled headers and bodies on both mirrors', async t => {
    for (const bodyStalled of [false, true]) {
        await t.test(bodyStalled ? 'bodies stalled' : 'headers stalled', async () => {
            const h = harness();
            const state = observe(h.fetch());
            await flush();
            if (bodyStalled) h.calls[0].resolve({ ok: true, status: 200, json: () => new Promise(() => {}) });
            await h.advance(750);
            if (bodyStalled) h.calls[1].resolve({ ok: true, status: 200, json: () => new Promise(() => {}) });
            await h.advance(9249);
            assert.equal(state.done, false);
            await h.advance(1);
            assert.equal(state.error.name, 'TimeoutError');
            assert.equal(h.calls.length, 2);
            assert.ok(h.calls.every(call => call.signal.aborted));
            assert.equal(h.timers.size, 0);
        });
    }
});

test('the provider exits at the deadline even when AbortController is unavailable', async () => {
    const h = harness({ abortController: false });
    const state = observe(h.getLyrics());
    await h.advance(10000);
    assert.equal(state.done, true);
    assert.equal(state.value.error, 'Request timed out');
    assert.equal(h.calls.length, 2);
    assert.equal(h.timers.size, 0);
});
