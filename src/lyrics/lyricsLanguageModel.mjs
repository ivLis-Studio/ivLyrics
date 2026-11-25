// The language detector can run offline. A pinned, verified model improves
// detection for lyrics that use scripts shared by several languages.
const VERSION = "1.3.4";
const SOURCES = [
  `https://cdn.jsdelivr.net/npm/tinyld@${VERSION}/dist/tinyld.normal.browser.js`,
  `https://unpkg.com/tinyld@${VERSION}/dist/tinyld.normal.browser.js`,
];
const MODEL_INTEGRITY = "sha384-HZ4mCkPvCb4DthgWSbUqAcqiTTLDXHcrlUObinK25mtROSFSZKva3PSlrnmsKHiu";
const FETCH_TIMEOUT_MS = 5000;

export function createLyricsLanguageModel({
  onReady,
  getRuntime = () => globalThis,
  importModule = (url) => import(url),
  warn = (...args) => console.warn(...args),
  integrity = MODEL_INTEGRITY,
  fetchTimeoutMs = FETCH_TIMEOUT_MS,
}) {
  let model = null;
  let loading = null;

  const importVerified = async (url, runtime) => {
    const { crypto, btoa, fetch, AbortController, Blob, URL, setTimeout, clearTimeout } = runtime;
    const controller = new AbortController();
    let timer;
    let bytes;
    try {
      bytes = await Promise.race([
        (async () => {
          const response = await fetch(url, {
            cache: "force-cache", credentials: "omit", integrity, signal: controller.signal,
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return response.arrayBuffer();
        })(),
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new Error("language model download timed out"));
          }, fetchTimeoutMs);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }

    const digest = new Uint8Array(await crypto.subtle.digest("SHA-384", bytes));
    if (`sha384-${btoa(String.fromCharCode(...digest))}` !== integrity) {
      throw new Error("integrity check failed");
    }
    const blobUrl = URL.createObjectURL(new Blob([bytes], { type: "text/javascript" }));
    try {
      // Import only the verified bytes. If the host rejects blob modules,
      // the language detector continues with its offline rules.
      return await importModule(blobUrl);
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  };

  const load = () => {
    if (model) return Promise.resolve(model);
    if (loading) return loading;
    const runtime = getRuntime();
    if (typeof runtime.fetch !== "function" || !runtime.crypto?.subtle || !runtime.AbortController
        || !runtime.Blob || typeof runtime.URL?.createObjectURL !== "function") {
      return Promise.resolve(null);
    }
    loading = (async () => {
      for (const url of SOURCES) {
        try {
          const loaded = await importVerified(url, runtime);
          if (typeof loaded?.detectAll === "function") {
            model = loaded;
            onReady();
            return model;
          }
        } catch (error) {
          warn("[ivLyrics] Language model unavailable from", url, error?.message || error);
        }
      }
      return null;
    })();
    return loading;
  };

  return {
    get: () => model,
    load,
    whenReady(timeoutMs = 0) {
      if (model) return Promise.resolve(model);
      const pending = load();
      if (!(timeoutMs > 0)) return pending;
      const { setTimeout, clearTimeout } = getRuntime();
      let timer;
      return Promise.race([pending, new Promise((resolve) => {
        timer = setTimeout(() => resolve(null), timeoutMs);
      })]).finally(() => clearTimeout(timer));
    },
  };
}
