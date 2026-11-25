export function createPronunciationTimingClient(readApi, consumer) {
  let active = null;

  function release() {
    const previous = active;
    active = null;
    previous?.api.releaseTimed?.(previous.trackUri, previous.entry, consumer);
  }

  return {
    ensure(options) {
      const api = readApi();
      const { trackUri } = options;
      const entry = api?.ensureTimed?.({ ...options, consumer });
      if (active?.entry === entry && active?.api === api && active?.trackUri === trackUri) return;
      release();
      if (entry) active = { api, trackUri, entry };
    },
    releaseUnless(trackUri) {
      if (active && active.trackUri !== trackUri) release();
    },
    release,
  };
}
