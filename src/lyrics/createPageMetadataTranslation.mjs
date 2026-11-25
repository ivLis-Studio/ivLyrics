const pending = new WeakMap();
const METADATA_COMMIT = Symbol("page metadata translation commit");

export function cancelPendingPageMetadataTranslation(page) {
  pending.get(page)?.finish(false, true);
}

export function createPageMetadataTranslation({ isEnabled, getTranslationCacheId, getTranslator, getTargetLanguage, publishMetadata }) {
  return async function fetchMetadataTranslation(page, uri, title, artist) {
    if (!isEnabled() || page._isComponentMounted === false || page.currentTrackUri !== uri
      || page.isPlaybackUriCurrent?.(uri) === false) return;
    const trackId = getTranslationCacheId(uri);
    if (!trackId || !title || !artist) return;

    const translator = getTranslator();
    if (!translator) return;
    cancelPendingPageMetadataTranslation(page);
    const targetLanguage = getTargetLanguage?.();
    const revision = translator.getCacheRevision?.(trackId);
    const requestSeq = page._activeLyricsFetchSeq;
    const loadingToken = page.startTranslationLoading();
    const request = {};
    const completion = new Promise(resolve => {
      request.finish = (completed, cancelled) => {
        if (pending.get(page) !== request) return;
        pending.delete(page);
        if (page._isComponentMounted !== false) page.clearTranslationLoading(loadingToken, { completed, cancelled });
        resolve();
      };
    });
    const { finish } = request;
    pending.set(page, request);

    const isCurrent = () => pending.get(page) === request && page._isComponentMounted !== false
      && page.currentTrackUri === uri && page._activeLyricsFetchSeq === requestSeq
      && page.isPlaybackUriCurrent?.(uri) !== false && isEnabled() && getTargetLanguage?.() === targetLanguage
      && translator.getCacheRevision?.(trackId) === revision;
    const canCommit = state => isCurrent() && state.uri === uri && state.lyricsRequestSeq === requestSeq;
    const reportError = error => console.warn("[ivLyrics] Metadata translation failed:", error);

    async function load() {
      try {
        const result = await translator.translateMetadata({ trackId, title, artist, ignoreCache: false });
        if (!result || !isCurrent()) {
          finish(false, !isCurrent());
          return;
        }

        const commit = {};
        page.setState(previous => canCommit(previous) ? {
          [METADATA_COMMIT]: commit,
          translatedMetadata: result,
        } : null, () => {
          const committed = canCommit(page.state) && page.state[METADATA_COMMIT] === commit;
          finish(committed, !committed);
          if (!committed) return;

          // Track-ready events can publish metadata first. If lyrics are
          // already on the overlay, send the committed title update directly.
          try {
            Promise.resolve(publishMetadata(result, uri)).catch(reportError);
          } catch (error) {
            reportError(error);
          }
        });
      } catch (error) {
        const cancelled = !isCurrent();
        if (!cancelled) reportError(error);
        finish(false, cancelled);
      }
    }
    void load();
    return completion;
  };
}
