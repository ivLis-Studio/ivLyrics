export function createLocalLyricsImportLifetime() {
  const active = new Map();

  function begin(uri, lifetime) {
    cancel(uri);
    const controller = new AbortController();
    const signal = lifetime ? AbortSignal.any([lifetime, controller.signal]) : controller.signal;
    const operation = {
      signal,
      isCurrent: () => active.get(uri) === operation && !signal.aborted,
      cancel: () => controller.abort(),
      finish() {
        if (active.get(uri) === operation) active.delete(uri);
        signal.removeEventListener('abort', operation.finish);
      },
    };
    active.set(uri, operation);
    signal.addEventListener('abort', operation.finish, { once: true });
    return operation;
  }

  function cancel(uri) {
    active.get(uri)?.cancel();
  }

  function dispose() {
    for (const operation of active.values()) operation.cancel();
  }

  return { begin, cancel, dispose };
}
