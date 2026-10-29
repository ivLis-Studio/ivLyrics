import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const { create } = require('../SyncCreatorScoreTracker.js');
const copy = value => structuredClone(value);
const creatorSource = readFileSync(new URL('../SyncDataCreator.js', import.meta.url), 'utf8');
const sourceContext = vm.createContext({});
vm.runInContext(creatorSource.slice(0, creatorSource.indexOf('const normalizeSyncCreatorPronunciationTargetMode ='))
  + '\nglobalThis.completeSource = isCompleteSyncCreatorLrclibSource;', sourceContext);
const isCompleteSyncCreatorLrclibSource = sourceContext.completeSource;
const snapshot = (count, granularity = 'character') => ({
  version: 5,
  source: { provider: 'lrclib', lrclibId: '1', preferredLyricsSource: 'plain', duration: 120,
    lyricsFingerprint: 'lrclib-abc-123', lineCharCounts: Array(50).fill(2), lineCount: 50, textCharCount: 100 },
  lines: Array.from({ length: count }, (_, index) => ({ start: index * 2, end: index * 2 + 1, granularity, chars: [index + 1, index + 1.5] }))
});
function fixture({ initial = snapshot(0), saved = null, request, load, save, repairSnapshot } = {}) {
  let clock = 0;
  let active = true;
  let authorized = true;
  let stored = saved;
  const sent = [];
  const tracker = create({
    accountId: 'account-A', isrc: 'USAAA2600001', initialSyncData: initial,
    now: () => clock, setInterval: false,
    repairSnapshot,
    isActive: () => active, isAuthorized: () => authorized,
    storage: {
      getScoreWork: async () => load ? load() : copy(stored),
      saveScoreWork: async (_, value) => {
        if (save) await save(copy(value));
        stored = copy(value);
      }
    },
    request: async event => {
      sent.push(copy(event));
      return request ? request(event) : { success: true, sessionId: event.sessionId || 'server-session', sequence: event.sequence };
    }
  });
  return { tracker, sent, setClock: value => { clock = value; }, setActive: value => { active = value; }, setAuthorized: value => { authorized = value; }, stored: () => copy(stored) };
}

test('two manual lines, full imported song and re-export retain exact FIFO provenance boundaries', async () => {
  const { tracker, sent } = fixture();
  tracker.enqueue('record', snapshot(1), { start: 0, end: 1, inputCount: 2, inputIndexes: [0, 1], ranges: [{ start: 0, end: 1 }] });
  tracker.enqueue('record', snapshot(2), { start: 2, end: 3, inputCount: 2, inputIndexes: [2, 3], ranges: [{ start: 2, end: 3 }] });
  tracker.enqueue('import', snapshot(50));
  tracker.enqueue('checkpoint', snapshot(50));
  tracker.enqueue('import', snapshot(50));
  const receipt = await tracker.submission(snapshot(50));
  assert.deepEqual(sent.map(event => event.action), ['start', 'record', 'record', 'import', 'checkpoint', 'import', 'checkpoint']);
  assert.deepEqual(sent.map(event => event.syncData.lines.length), [0, 1, 2, 50, 50, 50, 50]);
  assert.deepEqual(sent.map(event => event.sequence), [0, 1, 2, 3, 4, 5, 6]);
  assert.deepEqual(receipt, { workSessionId: 'server-session', workSequence: 6 });
  assert.equal(sent.filter(event => event.target).length, 2);
  tracker.stop();
});

test('snapshots and targets are immutable even while IndexedDB opens', async () => {
  let release;
  const opening = new Promise(resolve => { release = resolve; });
  const { tracker, sent } = fixture({ load: () => opening });
  const data = snapshot(1);
  const target = { start: 0, end: 1, inputCount: 1, ranges: [{ start: 0, end: 0 }] };
  tracker.enqueue('record', data, target);
  data.lines[0].chars[0] = 99;
  target.ranges[0].end = 99;
  release(null);
  await tracker.flush();
  assert.equal(sent[1].syncData.lines[0].chars[0], 1);
  assert.equal(sent[1].target.ranges[0].end, 0);
  tracker.stop();
});

test('loaded full data starts as baseline and same-count precision imports stay imports', async () => {
  const { tracker, sent } = fixture({ initial: snapshot(50, 'line') });
  tracker.enqueue('import', snapshot(50, 'character'));
  await tracker.submission(snapshot(50, 'character'));
  assert.deepEqual(sent.map(event => event.action), ['start', 'import', 'checkpoint']);
  assert.equal(sent.every(event => event.target === undefined), true);
  tracker.stop();
});

test('effect applied after external import is separate from timing evidence', async () => {
  const { tracker, sent } = fixture();
  tracker.enqueue('import', snapshot(50));
  const styled = snapshot(50);
  styled.lines[0].kind = 'whisper';
  tracker.enqueue('effect', styled, { start: 0, end: 1 });
  await tracker.flush();
  assert.deepEqual(sent.map(event => event.action), ['start', 'import', 'effect']);
  assert.equal(sent[2].target.inputCount, undefined);
  tracker.stop();
});

test('failed network response retries the same event ID and sequence after crash recovery', async () => {
  let failure = true;
  const first = fixture({ request: event => {
    if (event.action === 'record' && failure) throw new Error('offline');
    return { success: true, sessionId: 'server-session', sequence: event.sequence };
  } });
  await first.tracker.flush();
  first.tracker.enqueue('record', snapshot(1), { start: 0, end: 1, inputCount: 1 });
  await assert.rejects(first.tracker.flush(), /offline/);
  const event = first.sent.at(-1);
  const restored = fixture({ saved: first.stored(), initial: snapshot(1) });
  await restored.tracker.flush();
  assert.equal(restored.sent[0].action, 'record');
  assert.equal(restored.sent[0].eventId, event.eventId);
  assert.equal(restored.sent[0].sequence, event.sequence);
  failure = false;
  first.tracker.stop();
  restored.tracker.stop();
});

test('a rejected work event is retained but never repeatedly posted by heartbeat, edits, flush or close', async () => {
  const rejection = Object.assign(new Error('Bad Request'), { status: 400 });
  const value = fixture({ request: () => { throw rejection; } });
  await assert.rejects(value.tracker.flush(), error => error === rejection);
  const rejected = copy(value.tracker.__test.getState().queue[0]);
  assert.equal(value.sent.length, 1);
  value.tracker.interact();
  for (let tick = 1; tick <= 20; tick++) {
    value.setClock(tick * 20000);
    value.tracker.heartbeat();
  }
  value.tracker.enqueue('record', snapshot(1), { start: 0, end: 1, inputCount: 1 });
  await assert.rejects(value.tracker.flush(), error => error === rejection);
  await assert.rejects(value.tracker.submission(snapshot(1)), error => error === rejection);
  value.tracker.stop();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(value.sent.length, 1);
  assert.deepEqual(value.tracker.__test.getState().queue[0], rejected);
  assert.equal(value.tracker.__test.getState().queue[1].action, 'record');
  assert.equal(value.stored().queue.length, 2);
  assert.equal(value.tracker.__test.getState().sequence, 0);
});

test('transient server errors remain retryable with the same durable event', async () => {
  let fail = true;
  const value = fixture({ request: event => {
    if (fail) throw Object.assign(new Error('Unavailable'), { status: 503 });
    return { success: true, sessionId: 'server-session', sequence: event.sequence };
  } });
  await assert.rejects(value.tracker.flush(), /Unavailable/);
  const event = copy(value.sent[0]);
  fail = false;
  await value.tracker.flush();
  assert.deepEqual(value.sent.at(-1), event);
  assert.equal(value.tracker.__test.getState().queue.length, 0);
  value.tracker.stop();
});

test('the actual work transport preserves HTTP 400 when its error body is not JSON', async () => {
  const source = readFileSync(new URL('../SyncDataCreator.js', import.meta.url), 'utf8');
  const start = source.indexOf('\tconst ensureScoreTracker =');
  const end = source.indexOf('\tconst captureScoreWork =', start);
  let request;
  let cleared = 0;
  const sent = [];
  const context = vm.createContext({
    useCallback: callback => callback,
    isCompleteSyncCreatorLrclibSource,
    scoreContextRef: { current: { ready: true, accountId: 'account', isrc: 'USAAA2600001',
      trackUri: 'spotify:track:abc', initialSyncData: snapshot(0) } },
    scoreTrackerRef: { current: null }, scorePendingEventsRef: { current: [] },
    Utils: { getUserHash: () => 'account', getApiHeaders: value => value },
    I18n: { t: (key, { status }) => `Server returned HTTP ${status}` },
    window: { SyncCreatorScoreTracker: { create(options) {
      request = options.request;
      return { scope: 'account:USAAA2600001:lrclib' };
    } } },
    AbortController, setTimeout: () => 1, clearTimeout: () => { cleared++; },
    fetch: async (url, options) => {
      sent.push({ url, payload: JSON.parse(options.body), signal: options.signal });
      return { ok: false, status: 400, json: async () => { throw new SyntaxError('Bad Request'); } };
    }
  });
  vm.runInContext(`${source.slice(start, end)}\nensureScoreTracker();`, context);
  const payload = { action: 'start', eventId: 'transport-test', syncData: snapshot(0) };
  await assert.rejects(request(payload), error => error.status === 400 && /HTTP 400/.test(error.message));
  assert.equal(sent.length, 1);
  assert.equal(sent[0].url, 'https://lyrics.api.ivl.is/lyrics/sync-data/work');
  assert.deepEqual(sent[0].payload, payload);
  assert.equal(sent[0].signal.aborted, false);
  assert.equal(cleared, 1);
});

test('source validation rejects metadata the backend cannot accept before creating work', () => {
  const valid = snapshot(0).source;
  assert.equal(isCompleteSyncCreatorLrclibSource(valid), true);
  for (const duration of ['120', null, undefined, NaN, Infinity, -1, 86401]) {
    assert.equal(isCompleteSyncCreatorLrclibSource({ ...valid, duration }), false);
  }
  assert.equal(isCompleteSyncCreatorLrclibSource({ ...valid, lineCharCounts: [2001], lineCount: 1, textCharCount: 2001 }), false);
  assert.equal(isCompleteSyncCreatorLrclibSource({ ...valid, lineCharCounts: Array(5001).fill(0), lineCount: 5001, textCharCount: 0 }), false);
  const start = creatorSource.indexOf('\tconst ensureScoreTracker =');
  const end = creatorSource.indexOf('\tconst captureScoreWork =', start);
  let creates = 0;
  const context = vm.createContext({
    useCallback: callback => callback, isCompleteSyncCreatorLrclibSource,
    scoreContextRef: { current: { ready: true, accountId: 'account', isrc: 'USAAA2600001',
      initialSyncData: { ...snapshot(0), source: { ...valid, duration: '120' } } } },
    window: { SyncCreatorScoreTracker: { create() { creates++; } } }
  });
  vm.runInContext(`${creatorSource.slice(start, end)}\nglobalThis.result = ensureScoreTracker();`, context);
  assert.equal(creates, 0);
  assert.equal(context.result, null);
});

const backwardsSnapshot = () => {
  const data = snapshot(1);
  data.lines[0].chars = [2, 1];
  return data;
};
const backwardsSnapshotError = () => Object.assign(
  new Error('Invalid work snapshot: Line 1, char 1: time goes backwards'), { status: 400 }
);
const legacyWork = (queue) => ({
  version: 1, scope: 'account-A:USAAA2600001:lrclib', sessionId: 'server-session', sequence: 2,
  lastSnapshot: snapshot(0), queue
});
const legacyEvent = (action = 'record') => ({
  eventId: 'legacy-invalid-event', action, syncData: backwardsSnapshot(), activeSeconds: 40,
  target: { start: 0, end: 1, partId: 'b', granularity: 'character', inputCount: 2,
    inputIndexes: [0, 1], ranges: [{ start: 0, end: 1 }] }
});

test('a rejected historical snapshot repairs in FIFO order before a valid checkpoint', async () => {
  const original = legacyEvent();
  const checkpoint = { eventId: 'later-valid-checkpoint', action: 'checkpoint', syncData: snapshot(2), activeSeconds: 0 };
  const repaired = snapshot(1);
  repaired.source = { ...original.syncData.source, lrclibId: 'historical-source' };
  original.syncData.source = copy(repaired.source);
  let repairCalls = 0;
  const value = fixture({ saved: legacyWork([original, checkpoint]), initial: snapshot(3),
    repairSnapshot: data => {
      repairCalls++;
      assert.deepEqual(data, original.syncData);
      return repaired;
    },
    request: event => {
      if (event.action === 'record') throw backwardsSnapshotError();
      if (event.action === 'import') {
        const durable = value.stored().queue[0];
        assert.equal(durable.snapshotRepaired, true);
        assert.equal(durable.action, 'import');
        assert.deepEqual(durable.syncData, repaired);
        assert.equal(durable.target, undefined);
        assert.equal(durable.activeSeconds, 0);
      }
      return { success: true, sessionId: 'server-session', sequence: event.sequence };
    }
  });
  await value.tracker.flush();
  assert.equal(repairCalls, 1);
  assert.deepEqual(value.sent.map(event => event.action), ['record', 'import', 'checkpoint']);
  assert.deepEqual(value.sent.map(event => event.eventId), [original.eventId, original.eventId, checkpoint.eventId]);
  assert.deepEqual(value.sent.map(event => event.sequence), [3, 3, 4]);
  assert.deepEqual(value.sent[1].syncData, repaired);
  assert.deepEqual(value.sent[2].syncData, checkpoint.syncData);
  assert.equal(value.sent[1].target, undefined);
  assert.equal(value.sent[1].activeSeconds, 0);
  assert.equal(value.sent.every(event => event.snapshotRepaired === undefined), true);
  assert.equal(value.tracker.__test.getState().sequence, 4);
  assert.equal(value.tracker.__test.getState().queue.length, 0);
  value.tracker.stop();
});

test('repaired start stays a baseline start with the same ID and zero sequence', async () => {
  const original = legacyEvent('start');
  let repairCalls = 0;
  const value = fixture({ saved: { ...legacyWork([original]), sessionId: '', sequence: 0 },
    repairSnapshot: () => { repairCalls++; return snapshot(1); },
    request: event => {
      if (event.syncData.lines[0].chars[1] === 1) throw backwardsSnapshotError();
      return { success: true, sessionId: 'server-session', sequence: event.sequence };
    }
  });
  const receipt = await value.tracker.submission(snapshot(2));
  assert.equal(repairCalls, 1);
  assert.deepEqual(value.sent.map(event => event.action), ['start', 'start', 'checkpoint']);
  assert.deepEqual(value.sent.map(event => event.sequence), [0, 0, 1]);
  assert.equal(value.sent[0].eventId, value.sent[1].eventId);
  assert.equal(value.sent[1].target, undefined);
  assert.equal(value.sent[1].activeSeconds, 0);
  assert.deepEqual(receipt, { workSessionId: 'server-session', workSequence: 1 });
  value.tracker.stop();
});

for (const action of ['record', 'effect', 'checkpoint', 'heartbeat', 'import']) {
  test(`repaired legacy ${action} carries only import provenance, preserving later manual evidence`, async () => {
    const original = legacyEvent(action);
    const later = { ...legacyEvent('record'), eventId: 'later-manual-event', syncData: snapshot(2), activeSeconds: 10 };
    const value = fixture({ saved: legacyWork([original, later]), repairSnapshot: () => snapshot(1),
      request: event => {
        if (event.syncData.lines[0].chars[1] === 1) throw backwardsSnapshotError();
        return { success: true, sessionId: 'server-session', sequence: event.sequence };
      }
    });
    await value.tracker.flush();
    assert.equal(value.sent[1].action, 'import');
    assert.equal(value.sent[1].target, undefined);
    assert.equal(value.sent[1].activeSeconds, 0);
    assert.equal(value.sent[1].eventId, original.eventId);
    assert.deepEqual(value.sent[2].target, later.target);
    assert.equal(value.sent[2].action, 'record');
    assert.equal(value.sent[2].activeSeconds, 10);
    assert.equal(value.sent[2].sequence, 4);
    value.tracker.stop();
  });
}

test('a lost repaired acknowledgement reloads the identical durable request without repairing again', async () => {
  const original = legacyEvent();
  const checkpoint = { eventId: 'later-valid-checkpoint', action: 'checkpoint', syncData: snapshot(2), activeSeconds: 0 };
  let acceptedPayload;
  let repairCalls = 0;
  const first = fixture({ saved: legacyWork([original, checkpoint]),
    repairSnapshot: () => { repairCalls++; return snapshot(1); },
    request: event => {
      if (event.action === 'record') throw backwardsSnapshotError();
      acceptedPayload = copy(event);
      assert.equal(first.stored().queue[0].snapshotRepaired, true);
      throw new Error('lost acknowledgement');
    }
  });
  await assert.rejects(first.tracker.flush(), /lost acknowledgement/);
  const saved = first.stored();
  assert.equal(saved.sequence, 2);
  assert.equal(saved.queue[0].eventId, original.eventId);
  assert.equal(saved.queue[0].action, 'import');
  assert.equal(saved.queue[0].target, undefined);
  first.setAuthorized(false);
  first.tracker.stop();
  const restored = fixture({ saved, repairSnapshot: () => { repairCalls++; throw new Error('must not repair twice'); },
    request: event => {
      if (event.eventId === original.eventId) assert.deepEqual(event, acceptedPayload);
      return { success: true, sessionId: 'server-session', sequence: event.sequence };
    }
  });
  await restored.tracker.flush();
  assert.equal(repairCalls, 1);
  assert.deepEqual(restored.sent.map(event => event.action), ['import', 'checkpoint']);
  assert.deepEqual(restored.sent.map(event => event.sequence), [3, 4]);
  assert.equal(restored.tracker.__test.getState().queue.length, 0);
  restored.tracker.stop();
});

test('repair can happen only once per event, including after a storage reload', async () => {
  let repairCalls = 0;
  const repairSnapshot = () => { repairCalls++; return snapshot(repairCalls + 1); };
  const first = fixture({ saved: legacyWork([legacyEvent()]), repairSnapshot,
    request: () => { throw backwardsSnapshotError(); }
  });
  await assert.rejects(first.tracker.flush(), /time goes backwards/);
  await assert.rejects(first.tracker.flush(), /time goes backwards/);
  assert.equal(repairCalls, 1);
  assert.equal(first.tracker.__test.getState().queue[0].action, 'import');
  const saved = first.stored();
  first.setAuthorized(false);
  first.tracker.stop();
  const restored = fixture({ saved, repairSnapshot, request: () => { throw backwardsSnapshotError(); } });
  await assert.rejects(restored.tracker.flush(), /time goes backwards/);
  assert.equal(repairCalls, 1);
  assert.deepEqual(restored.tracker.__test.getState().queue, saved.queue);
  restored.setAuthorized(false);
  restored.tracker.stop();
});

test('failed repair persistence prevents retrying until the repaired event is durably saved', async () => {
  let blockSave = false;
  const value = fixture({ saved: legacyWork([legacyEvent()]),
    repairSnapshot: () => { blockSave = true; return snapshot(1); },
    save: () => { if (blockSave) throw new Error('storage unavailable'); },
    request: event => {
      if (event.action === 'record') throw backwardsSnapshotError();
      return { success: true, sessionId: 'server-session', sequence: event.sequence };
    }
  });
  await assert.rejects(value.tracker.flush(), /storage unavailable/);
  assert.deepEqual(value.sent.map(event => event.action), ['record']);
  assert.equal(value.stored().queue[0].action, 'record');
  assert.equal(value.tracker.__test.getState().queue[0].action, 'import');
  blockSave = false;
  await value.tracker.flush();
  assert.equal(value.sent[1].action, 'import');
  assert.equal(value.sent[1].eventId, value.sent[0].eventId);
  assert.equal(value.sent[1].sequence, value.sent[0].sequence);
  value.tracker.stop();
});

for (const [label, error] of [
  ['network failure', new Error('Invalid work snapshot: Line 1, char 1: time goes backwards')],
  ['another validation error', Object.assign(new Error('Invalid work snapshot: Line 1, char 1: invalid time value'), { status: 400 })],
  ['another endpoint', Object.assign(new Error('Invalid sync data: Line 1, char 1: time goes backwards'), { status: 400 })],
  ['server failure', Object.assign(backwardsSnapshotError(), { status: 500 })],
  ['session conflict', Object.assign(backwardsSnapshotError(), { status: 409 })],
  ['untyped status', Object.assign(backwardsSnapshotError(), { status: '400' })]
]) {
  test(`snapshot recovery refuses ${label} and preserves the original queue`, async () => {
    const saved = legacyWork([legacyEvent()]);
    let repairCalls = 0;
    const value = fixture({ saved, repairSnapshot: () => { repairCalls++; return snapshot(1); },
      request: () => { throw error; }
    });
    await assert.rejects(value.tracker.flush());
    assert.equal(repairCalls, 0);
    assert.deepEqual(value.tracker.__test.getState().queue, saved.queue);
    assert.equal(value.tracker.__test.getState().sequence, saved.sequence);
    value.setAuthorized(false);
    value.tracker.stop();
  });
}

for (const [label, repair] of [
  ['missing callback', null],
  ['null result', () => null],
  ['identical result', data => data],
  ['only transient source changes', data => ({ ...data, source: { ...data.source, searchSource: 'changed' } })],
  ['invalid result shape', () => ({})],
  ['throwing callback', data => { data.lines[0].chars[1] = 3; throw new Error('cannot repair'); }]
]) {
  test(`snapshot recovery refuses ${label} without changing rejected evidence`, async () => {
    const saved = legacyWork([legacyEvent()]);
    let repairCalls = 0;
    const value = fixture({ saved,
      repairSnapshot: repair && (data => { repairCalls++; return repair(data); }),
      request: () => { throw backwardsSnapshotError(); }
    });
    await assert.rejects(value.tracker.flush(), /time goes backwards/);
    await assert.rejects(value.tracker.flush(), /time goes backwards/);
    assert.equal(repairCalls, repair ? 1 : 0);
    assert.deepEqual(value.tracker.__test.getState().queue, saved.queue);
    assert.equal(value.tracker.__test.getState().sequence, saved.sequence);
    value.setAuthorized(false);
    value.tracker.stop();
  });
}

test('submission fails closed when pending work cannot be acknowledged', async () => {
  const { tracker } = fixture({ request: () => { throw new Error('offline'); } });
  await assert.rejects(tracker.submission(snapshot(1)), /offline/);
  assert.equal(tracker.__test.getState().queue.at(-1).action, 'checkpoint');
  tracker.stop();
});

test('idle editor earns no time and a real interaction grants at most 60 seconds without another input', async () => {
  const { tracker, setClock, sent } = fixture();
  await tracker.flush();
  setClock(20000); tracker.heartbeat();
  assert.equal(sent.length, 1);
  tracker.interact();
  for (const clock of [40000, 60000, 80000, 100000, 120000]) {
    setClock(clock); tracker.heartbeat(); await tracker.flush();
  }
  assert.equal(sent.reduce((total, event) => total + event.activeSeconds, 0), 60);
  tracker.stop();
});

test('hidden/suspended intervals and closing/reopening never invent active work time', async () => {
  const { tracker, setClock, setActive, sent, stored } = fixture();
  await tracker.flush();
  tracker.interact();
  setClock(10000); tracker.heartbeat(); await tracker.flush();
  setActive(false); tracker.suspend();
  setClock(20000); setActive(true); tracker.heartbeat(); await tracker.flush();
  setClock(40000); tracker.interact();
  setClock(3600000); tracker.heartbeat(); await tracker.flush();
  assert.equal(sent.reduce((total, event) => total + event.activeSeconds, 0), 10);
  const restored = fixture({ saved: stored() });
  restored.setClock(20000); restored.tracker.heartbeat(); await restored.tracker.flush();
  assert.equal(restored.sent.length, 0);
  tracker.stop(); restored.tracker.stop();
});

test('account switch cannot send or claim queued work under another identity', async () => {
  const { tracker, setAuthorized, sent } = fixture();
  await tracker.flush();
  setAuthorized(false);
  assert.equal(tracker.enqueue('import', snapshot(50)), false);
  await assert.rejects(tracker.submission(snapshot(50)), /account changed/);
  assert.equal(sent.length, 1);
  tracker.stop();
});

test('unexpected acknowledgement preserves the pending event', async () => {
  const { tracker } = fixture({ request: event => ({ success: true, sessionId: 'server-session', sequence: event.action === 'start' ? 0 : 500 }) });
  await tracker.flush();
  tracker.enqueue('record', snapshot(1), { start: 0, end: 1, inputCount: 1 });
  await assert.rejects(tracker.flush(), /acknowledgement/);
  assert.equal(tracker.__test.getState().queue.length, 1);
  tracker.stop();
});

test('stale sequence resumes only from the acknowledged server snapshot and retains pending edits', async () => {
  const initial = snapshot(2);
  let lastSequence = 7;
  const fixtureValue = fixture({ saved: { version: 1, scope: 'account-A:USAAA2600001:lrclib', sessionId: 'server-session', sequence: 2, queue: [], lastSnapshot: initial },
    initial, request: event => {
      if (event.action === 'resume') return { success: true, sessionId: 'server-session', sequence: lastSequence, syncData: initial, lastEventId: 'other-checkpoint', sameSession: true };
      if (event.sequence !== lastSequence + 1) throw Object.assign(new Error('stale'), { status: 409 });
      lastSequence = event.sequence;
      return { success: true, sessionId: 'server-session', sequence: lastSequence };
    } });
  fixtureValue.tracker.enqueue('import', snapshot(50));
  const receipt = await fixtureValue.tracker.submission(snapshot(50));
  assert.equal(receipt.workSequence, 9);
  assert.deepEqual(fixtureValue.sent.map(event => event.action), ['import', 'resume', 'import', 'checkpoint']);
  assert.equal(fixtureValue.sent[0].eventId, fixtureValue.sent[2].eventId);
  fixtureValue.tracker.stop();
});

test('resume acknowledges an exact event ID and snapshot without replaying a saved record', async () => {
  const completed = snapshot(1);
  const fixtureValue = fixture({ saved: { version: 1, scope: 'account-A:USAAA2600001:lrclib', sessionId: 'server-session', sequence: 2,
    lastSnapshot: snapshot(0), queue: [{ eventId: 'already-saved-event', action: 'record', syncData: completed, target: { start: 0, end: 1 }, activeSeconds: 0 }] },
    request: event => {
      if (event.action === 'resume') return { success: true, sessionId: 'server-session', sequence: 3, syncData: completed, lastEventId: 'already-saved-event', sameSession: true };
      throw Object.assign(new Error('stale'), { status: 409 });
    } });
  await fixtureValue.tracker.flush();
  assert.deepEqual(fixtureValue.sent.map(event => event.action), ['record', 'resume']);
  assert.equal(fixtureValue.tracker.__test.getState().queue.length, 0);
  fixtureValue.tracker.stop();
});

test('divergent server work leaves the queue intact and stops repeated background conflicts', async () => {
  const fixtureValue = fixture({ saved: { version: 1, scope: 'account-A:USAAA2600001:lrclib', sessionId: 'server-session', sequence: 2, queue: [], lastSnapshot: snapshot(1) },
    request: event => {
      if (event.action === 'resume') return { success: true, sessionId: 'server-session', sequence: 20, syncData: snapshot(49), lastEventId: 'another-editor', sameSession: true };
      throw Object.assign(new Error('stale'), { status: 409 });
    } });
  fixtureValue.tracker.enqueue('import', snapshot(50));
  await assert.rejects(fixtureValue.tracker.flush(), /현재 초안은 보존/);
  const count = fixtureValue.sent.length;
  fixtureValue.tracker.heartbeat();
  await assert.rejects(fixtureValue.tracker.submission(snapshot(50)), /현재 초안은 보존/);
  assert.equal(fixtureValue.sent.length, count);
  assert.equal(fixtureValue.tracker.__test.getState().queue[0].action, 'import');
  assert.equal(fixtureValue.tracker.__test.getState().queue.length, 1);
  fixtureValue.tracker.stop();
});

test('an idle other session is handed over using its unchanged server baseline', async () => {
  const baseline = snapshot(1);
  const fixtureValue = fixture({ saved: { version: 1, scope: 'account-A:USAAA2600001:lrclib', sessionId: 'old-session', sequence: 2, queue: [], lastSnapshot: baseline },
    request: event => {
      if (event.action === 'resume') return { success: true, sessionId: 'other-session', sequence: 8, syncData: baseline, lastEventId: 'other-event', sameSession: false };
      if (event.sessionId === 'old-session') throw Object.assign(new Error('stale'), { status: 409 });
      return { success: true, sessionId: 'new-session', sequence: event.sequence };
    } });
  fixtureValue.tracker.enqueue('import', snapshot(50));
  await fixtureValue.tracker.flush();
  assert.deepEqual(fixtureValue.sent.map(event => event.action), ['import', 'resume', 'start', 'import']);
  assert.deepEqual(fixtureValue.sent[2].syncData, baseline);
  fixtureValue.tracker.stop();
});

test('same contents with a different event ID cannot silently discard pending manual evidence', async () => {
  const after = snapshot(2);
  const fixtureValue = fixture({ saved: { version: 1, scope: 'account-A:USAAA2600001:lrclib', sessionId: 'server-session', sequence: 2,
    lastSnapshot: snapshot(1), queue: [{ eventId: 'my-record-event', action: 'record', syncData: after, target: { start: 2, end: 3 }, activeSeconds: 0 }] },
    request: event => {
      if (event.action === 'resume') return { success: true, sessionId: 'server-session', sequence: 3, syncData: after, lastEventId: 'different-record-event', sameSession: true };
      throw Object.assign(new Error('stale'), { status: 409 });
    } });
  await assert.rejects(fixtureValue.tracker.flush(), /현재 초안은 보존/);
  assert.equal(fixtureValue.tracker.__test.getState().queue[0].eventId, 'my-record-event');
  fixtureValue.tracker.stop();
});

test('an unrelated repeated 409 stops after one resume instead of looping forever', async () => {
  const initial = snapshot(1);
  const fixtureValue = fixture({ saved: { version: 1, scope: 'account-A:USAAA2600001:lrclib', sessionId: 'server-session', sequence: 2, queue: [], lastSnapshot: initial },
    request: event => {
      if (event.action === 'resume') return { success: true, sessionId: 'server-session', sequence: 2, syncData: initial, lastEventId: 'last-event', sameSession: true };
      throw Object.assign(new Error('conflict'), { status: 409 });
    } });
  fixtureValue.tracker.enqueue('import', snapshot(50));
  await assert.rejects(fixtureValue.tracker.flush(), /현재 초안은 보존/);
  assert.deepEqual(fixtureValue.sent.map(event => event.action), ['import', 'resume', 'import']);
  fixtureValue.tracker.stop();
});

test('login before submit claims only anonymous import provenance, never anonymous manual actions', () => {
  const source = readFileSync(new URL('../SyncDataCreator.js', import.meta.url), 'utf8');
  const start = source.indexOf('\tconst ensureScoreTracker =');
  const end = source.indexOf('\tconst markScoreTimingInput =', start);
  let token = '';
  const events = [];
  let initial;
  const context = vm.createContext({
    useCallback: callback => callback,
    isCompleteSyncCreatorLrclibSource,
    scoreContextRef: { current: { ready: true, accountId: '', isrc: 'USAAA2600001', trackUri: 'spotify:track:abc', initialSyncData: snapshot(0), buildSnapshot: data => copy(data) } },
    scoreTrackerRef: { current: null }, scorePendingEventsRef: { current: [] },
    Utils: { getAuthToken: () => token, getUserHash: () => token ? 'account' : '' },
    window: { SyncCreatorScoreTracker: { create(options) { initial = options.initialSyncData; return { scope: `${options.accountId}:${options.isrc}:lrclib`, enqueue: (...args) => events.push(copy(args)) }; } } }
  });
  vm.runInContext(`${source.slice(start, end)}\nglobalThis.capture = captureScoreWork; globalThis.ensure = ensureScoreTracker;`, context);
  context.capture('import', snapshot(50));
  context.capture('record', snapshot(50), { start: 0, end: 1, inputCount: 2 });
  assert.equal(context.scorePendingEventsRef.current.length, 1);
  token = 'token';
  context.scoreContextRef.current.accountId = 'account';
  context.scoreContextRef.current.initialSyncData = snapshot(50);
  context.ensure();
  assert.equal(initial.lines.length, 0);
  assert.deepEqual(events.map(event => event[0]), ['import']);
  assert.equal(events[0][1].lines.length, 50);
  assert.equal(context.scorePendingEventsRef.current.length, 0);
});

test('restored anonymous import hint only recreates an import event from the verified draft', () => {
  const source = readFileSync(new URL('../SyncDataCreator.js', import.meta.url), 'utf8');
  const start = source.indexOf('\t\tif (editor.scoreImportBaseline && restoredSyncData)');
  const end = source.indexOf('\n\t\tsetProviderValue(restoredProvider);', start);
  const pending = [];
  const context = vm.createContext({
    editor: { scoreImportBaseline: snapshot(2), action: 'record', inputCount: 1000 },
    restoredSyncData: snapshot(50), flatLyricsChars: [], trackUri: 'spotify:track:abc',
    sanitizeSyncCreatorSyncData: value => copy(value),
    scorePendingEventsRef: { current: pending }
  });
  vm.runInContext(source.slice(start, end), context);
  assert.equal(pending[0].action, 'import');
  assert.equal(pending[0].accountId, '');
  assert.equal(pending[0].target, undefined);
  assert.equal(pending[0].baseline.lines.length, 2);
  assert.equal(pending[0].syncData.lines.length, 50);
  vm.runInContext(source.slice(start, end), context);
  assert.equal(pending.length, 1);
});

test('creator emits import before replacing data and exports never attach trusted credit fields', () => {
  const source = readFileSync(new URL('../SyncDataCreator.js', import.meta.url), 'utf8');
  const importCode = source.slice(source.indexOf('const importSyncData ='), source.indexOf('// 가사 전체 복사'));
  assert.ok(importCode.indexOf("captureScoreWork('import', sanitizedData)") < importCode.indexOf('setSyncData(sanitizedData)'));
  assert.match(source, /workMetadata = await tracker\.submission\(compactSyncDataToSubmit\)/);
  const exportCode = source.slice(source.indexOf('const exportSyncData ='), source.indexOf('const importSyncData ='));
  assert.match(exportCode, /JSON\.stringify\(exportData, null, 2\)/);
  assert.doesNotMatch(exportCode, /workSessionId|workSequence|manualCredit/);
});

test('creator waits for draft hydration before starting a server work session', () => {
  const source = readFileSync(new URL('../SyncDataCreator.js', import.meta.url), 'utf8');
  const start = source.indexOf('\tconst ensureScoreTracker =');
  const end = source.indexOf('\tconst captureScoreWork =', start);
  let created = 0;
  const context = vm.createContext({
    useCallback: callback => callback,
    isCompleteSyncCreatorLrclibSource,
    scoreContextRef: { current: { ready: false, accountId: 'account', isrc: 'USAAA2600001', initialSyncData: snapshot(0) } },
    scoreTrackerRef: { current: null }, scorePendingEventsRef: { current: [] },
    window: { SyncCreatorScoreTracker: { create(options) { created++; return { scope: `${options.accountId}:${options.isrc}:lrclib` }; } } }
  });
  vm.runInContext(`${source.slice(start, end)}\nglobalThis.ensure = ensureScoreTracker;`, context);
  assert.equal(context.ensure(), null);
  assert.equal(created, 0);
  context.scoreContextRef.current.ready = true;
  context.scoreContextRef.current.initialSyncData = snapshot(50);
  assert.ok(context.ensure());
  assert.equal(created, 1);
});

function recordingHarness({ indexes = [0, 1, 2, 3], partId = null, pendingEffects = [] } = {}) {
  const source = readFileSync(new URL('../SyncDataCreator.js', import.meta.url), 'utf8');
  const capture = [];
  const refs = indexes.map(absoluteIndex => ({ absoluteIndex }));
  const lineStart = Math.min(...indexes);
  const lineEnd = Math.max(...indexes);
  const part = partId ? { id: partId, kind: 'whisper', ranges: [{ start: lineStart, end: lineEnd }], chars: indexes.map((_, i) => i + 1) } : null;
  const line = { start: lineStart, end: lineEnd, kind: 'whisper', chars: Array.from({ length: lineEnd - lineStart + 1 }, (_, i) => i + 1), ...(part ? { parallel: { parts: [part] } } : {}) };
  const context = vm.createContext({
    useCallback: callback => callback,
    scoreInputContextRef: { current: { key: `${lineStart}:${partId || 'full'}`, refs } },
    scoreInputRef: { current: null },
    scorePendingEffectsRef: { current: new Map(pendingEffects.map((value, index) => [String(index), value])) },
    ensureScoreTracker: () => ({ interact() {} }),
    currentLineCharRefs: refs,
    lineStart, lineEnd,
    activeParallelTargetId: partId || 'full', activeParallelPart: part,
    existingLine: null,
    nextSyncData: { version: 5, lines: [line] },
    rawChars: indexes.map((_, i) => i + 1),
    isFiniteSyncCreatorTime: value => Number.isFinite(value),
    captureScoreWork: (...args) => capture.push(copy(args)),
    recordingCharIndexRef: { current: indexes.length - 1 }
  });
  const markStart = source.indexOf('\tconst markScoreTimingInput =');
  const markEnd = source.indexOf('\tconst nextSessionClientRevision =', markStart);
  vm.runInContext(`${source.slice(markStart, markEnd)}\nglobalThis.mark = markScoreTimingInput;`, context);
  const commitStart = source.indexOf('\t\tconst scoreInput = scoreInputRef.current;');
  const commitEnd = source.indexOf('\t\tsetSyncData(nextSyncData);', commitStart);
  const commit = () => vm.runInContext(`(() => { ${source.slice(commitStart, commitEnd)} })()`, context);
  const trimStart = source.indexOf('\t\tif (normalizedIndex < recordingCharIndexRef.current && scoreInputRef.current)');
  const trimEnd = source.indexOf('\t\trecordingCharIndexRef.current = normalizedIndex;', trimStart);
  const trim = index => vm.runInContext(`(() => { const normalizedIndex = ${index}; ${source.slice(trimStart, trimEnd)} })()`, context);
  return { mark: context.mark, commit, trim, capture };
}

test('actual creator input evidence excludes locked prefixes and interpolated unrecorded tails', () => {
  const harness = recordingHarness({ indexes: Array.from({ length: 10 }, (_, index) => 40 + index) });
  harness.mark(5, 6, 'character');
  harness.commit();
  assert.deepEqual(harness.capture[0][2].ranges, [{ start: 45, end: 46 }]);
  assert.deepEqual(harness.capture[0][2].inputIndexes, [45]);
  assert.equal(harness.capture[0][2].inputCount, 1);
});

test('actual creator backtracking removes canceled input and selected vocals keep noncontiguous ranges', () => {
  const harness = recordingHarness({ indexes: [10, 11, 20, 21], partId: 'b' });
  harness.mark(0, 1, 'word');
  harness.mark(2, 3, 'word');
  harness.trim(2);
  harness.commit();
  assert.deepEqual(harness.capture[0][2].ranges, [{ start: 10, end: 11 }, { start: 20, end: 20 }]);
  assert.equal(harness.capture[0][2].partId, 'b');
  assert.equal(harness.capture[0][2].granularity, 'word');
});

test('actual creator effect drafts commit independently and arbitrary existing sync data has no recording evidence', () => {
  const external = recordingHarness();
  external.commit();
  assert.equal(external.capture.length, 0);
  const manual = recordingHarness({ pendingEffects: [{ start: 0, expectedKind: 'whisper' }] });
  manual.mark(0, 3, 'character');
  manual.commit();
  assert.equal(manual.capture[0][0], 'record');
  assert.equal(manual.capture[0][1].lines[0].kind, undefined);
  manual.commit();
  assert.equal(manual.capture.length, 1);
});
