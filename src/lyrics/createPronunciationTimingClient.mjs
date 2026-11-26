import { getPronunciationTimingContextKey } from "./pronunciationTimingSource.mjs";

export function createPronunciationTimingClient(readApi, consumer) {
  let active = null;

  function release() {
    const previous = active;
    active = null;
    previous?.api.releaseTimed?.(previous.trackUri, previous.entry, consumer);
  }

  return {
    read(trackUri, lines, context) {
      return readApi()?.getTimed?.(trackUri, lines, consumer, context) ?? null;
    },
    ensure(options) {
      const api = readApi();
      const { trackUri } = options;
      const entry = api?.ensureTimed?.({ ...options, consumer });
      if (active?.entry === entry && active?.api === api && active?.trackUri === trackUri) return;
      release();
      if (entry) active = { api, trackUri, entry, contextKey: getPronunciationTimingContextKey(options) };
    },
    releaseUnless(trackUri, contextKey) {
      if (active && (active.trackUri !== trackUri || active.contextKey !== contextKey)) release();
    },
    release,
  };
}
