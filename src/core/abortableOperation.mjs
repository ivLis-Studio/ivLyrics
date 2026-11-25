export async function runWithAbortSignal(signal, run, abortReason = () => signal.reason) {
  if (!signal) return run();
  if (signal.aborted) throw abortReason();

  let rejectOnAbort;
  const cancelled = new Promise((_, reject) => { rejectOnAbort = () => reject(abortReason()); });
  signal.addEventListener('abort', rejectOnAbort, { once: true });
  try {
    return await Promise.race([Promise.resolve().then(() => {
      if (signal.aborted) throw abortReason();
      return run();
    }), cancelled]);
  } finally {
    signal.removeEventListener('abort', rejectOnAbort);
  }
}
