(function (root, factory) {
  const api = factory(root);
  root.SyncCreatorScoreTracker = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  const clone = value => JSON.parse(JSON.stringify(value));
  const eventId = () => root.crypto?.randomUUID?.()
    || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  const GRACE_MS = 60000;
  const HEARTBEAT_MS = 20000;
  const comparable = value => {
    if (Array.isArray(value)) return value.map(comparable);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.keys(value).sort().filter(key => !['searchSource', 'candidateKey'].includes(key))
      .map(key => [key, comparable(value[key])]));
  };
  const sameSnapshot = (left, right) => Boolean(left && right)
    && JSON.stringify(comparable(left)) === JSON.stringify(comparable(right));

  // This queue records editor actions, never decides points. Imported files and
  // recovered drafts contain no trusted evidence; only the server owns credit.
  function create(options) {
    const now = options.now || Date.now;
    const scope = `${options.accountId}:${options.isrc}:lrclib`;
    let state = { version: 1, scope, sessionId: '', sequence: 0, queue: [] };
    let latest = clone(options.initialSyncData);
    let loading = true;
    let stopped = false;
    let processing = null;
    let persistChain = Promise.resolve();
    let lastSample = now();
    let lastInteraction = -Infinity;
    let pendingSeconds = 0;
    let lastError = null;
    let conflictError = null;
    const isAuthorized = () => options.isAuthorized?.() !== false;
    const persist = () => {
      const snapshot = clone(state);
      persistChain = persistChain.catch(() => undefined).then(() => options.storage?.saveScoreWork?.(scope, snapshot));
      // Persistence failure never loses the in-memory queue or blocks editing.
      persistChain.catch(() => undefined);
      return persistChain;
    };
    const ready = Promise.resolve(options.storage?.getScoreWork?.(scope)).catch(() => null).then(saved => {
      const pending = state.queue;
      if (saved?.version === 1 && saved.scope === scope && Array.isArray(saved.queue)) {
        state = { ...saved, queue: [...saved.queue, ...pending] };
      }
      if (!state.sessionId && !state.queue.some(event => event.action === 'start')) {
        state.queue.unshift({ eventId: eventId(), action: 'start', syncData: clone(options.initialSyncData), activeSeconds: 0 });
      }
      loading = false;
      persist();
    });

    const sample = () => {
      const time = now();
      const elapsed = time - lastSample;
      // A suspended renderer cannot turn hours of sleep into editing time.
      if (elapsed >= 0 && elapsed <= HEARTBEAT_MS * 2 && options.isActive?.() === true && isAuthorized()) {
        pendingSeconds += Math.max(0, Math.min(time, lastInteraction + GRACE_MS) - Math.max(lastSample, lastInteraction)) / 1000;
      }
      lastSample = time;
      return pendingSeconds;
    };
    const interact = () => {
      sample();
      if (options.isActive?.() === true && isAuthorized()) lastInteraction = now();
    };
    const enqueue = (action, syncData = latest, target) => {
      if (stopped || !isAuthorized()) return false;
      sample();
      latest = clone(syncData);
      const activeSeconds = Math.min(HEARTBEAT_MS * 2 / 1000, Math.floor(pendingSeconds));
      pendingSeconds -= activeSeconds;
      state.queue.push({ eventId: eventId(), action, syncData: clone(latest), ...(target ? { target: clone(target) } : {}), activeSeconds });
      if (!loading) persist();
      flush().catch(error => { lastError = error; });
      return true;
    };
    async function flush() {
      await ready;
      if (conflictError) throw conflictError;
      if (processing) {
        await processing;
        if (state.queue.length) return flush();
        return;
      }
      processing = (async () => {
        const recoveredEvents = new Set();
        while (state.queue.length) {
          if (!isAuthorized()) throw new Error('Sync scoring account changed.');
          const next = state.queue[0];
          const payload = {
            ...clone(next), isrc: options.isrc, provider: 'lrclib',
            ...(state.sessionId ? { sessionId: state.sessionId } : {}),
            sequence: next.action === 'start' ? 0 : state.sequence + 1
          };
          // Persist before sending. Retried requests retain the same event ID.
          await persist();
          let result;
          try {
            result = await options.request(payload);
          } catch (error) {
            if (error?.status !== 409) throw error;
            const failure = new Error('다른 작업 상태와 충돌했습니다. 현재 초안은 보존됩니다. 다른 편집기를 닫고 이 작업을 다시 열어 주세요.');
            failure.status = 409;
            if (recoveredEvents.has(next.eventId)) {
              conflictError = failure;
              throw failure;
            }
            let resumed;
            try {
              resumed = await options.request({ action: 'resume', eventId: eventId(),
                isrc: options.isrc, provider: 'lrclib', ...(state.sessionId ? { sessionId: state.sessionId } : {}) });
            } catch (resumeError) {
              if (resumeError?.status === 409) conflictError = failure;
              throw conflictError || resumeError;
            }
            if (!resumed?.success || !resumed.sessionId || !Number.isSafeInteger(resumed.sequence) || !resumed.syncData) {
              conflictError = failure;
              throw failure;
            }
            // Only acknowledged events may be discarded. Similar data alone
            // cannot erase an import boundary or assert that a record was saved.
            const acknowledged = state.queue.findIndex(event => event.eventId === resumed.lastEventId
              && sameSnapshot(event.syncData, resumed.syncData));
            const unchanged = sameSnapshot(state.lastSnapshot || (!state.sequence ? options.initialSyncData : null), resumed.syncData);
            if (acknowledged < 0 && !unchanged) {
              conflictError = failure;
              throw failure;
            }
            recoveredEvents.add(next.eventId);
            if (acknowledged >= 0) state.queue.splice(0, acknowledged + 1);
            state.lastSnapshot = clone(resumed.syncData);
            state.sessionId = resumed.sessionId;
            state.sequence = resumed.sequence;
            if (resumed.sameSession === false) {
              // An idle other session may be handed over, always using its
              // unchanged server snapshot as the new baseline.
              state.sessionId = '';
              state.sequence = 0;
              state.queue.unshift({ eventId: eventId(), action: 'start', syncData: clone(resumed.syncData), activeSeconds: 0 });
            }
            await persist();
            continue;
          }
          if (!result?.success || !result.sessionId || !Number.isInteger(result.sequence)) {
            throw new Error(result?.error || 'Sync work could not be saved.');
          }
          if (next.action !== 'start' && (result.sessionId !== state.sessionId || result.sequence !== payload.sequence)) {
            throw new Error('Sync work acknowledgement did not match the queued edit.');
          }
          state.sessionId = result.sessionId;
          state.sequence = result.sequence;
          state.lastSnapshot = clone(next.syncData);
          state.queue.shift();
          lastError = null;
          await persist();
        }
      })();
      try { await processing; } finally { processing = null; }
    }
    const heartbeat = () => {
      if (stopped || conflictError || !isAuthorized()) return;
      sample();
      if (pendingSeconds >= 1) enqueue('heartbeat');
      else if (state.queue.length) flush().catch(error => { lastError = error; });
    };
    const timer = options.setInterval === false ? null : (options.setInterval || root.setInterval)(heartbeat, HEARTBEAT_MS);
    ready.then(() => flush()).catch(error => { lastError = error; });
    return {
      scope, ready, interact, enqueue, flush, heartbeat,
      suspend() { sample(); lastInteraction = -Infinity; },
      observe(syncData) { latest = clone(syncData); },
      async submission(syncData) {
        if (conflictError) throw conflictError;
        if (!enqueue('checkpoint', syncData)) throw new Error('Sync scoring account changed.');
        await flush();
        if (state.queue.length || !state.sessionId) throw lastError || new Error('Sync work could not be saved.');
        return { workSessionId: state.sessionId, workSequence: state.sequence };
      },
      stop() {
        if (stopped) return;
        heartbeat();
        stopped = true;
        if (timer !== null) (options.clearInterval || root.clearInterval)(timer);
        persist();
      },
      __test: { sample, getState: () => clone(state), getPendingSeconds: () => pendingSeconds }
    };
  }
  return { create, GRACE_MS, HEARTBEAT_MS };
});
