// The startup extension and the lyrics route have separate bundled module
// instances. Keep revision metadata on the cache that both instances use.
const SOURCE_REVISIONS = Symbol.for("ivLyrics.pageLyricsSourceRevisions");

export function readPageLyricsSource(cache, uri, revision) {
    const entry = cache?.[uri];
    const revisions = cache?.[SOURCE_REVISIONS];
    if (entry && revisions?.has(entry) && revisions.get(entry) !== revision) {
        delete cache[uri];
        return undefined;
    }
    return entry;
}

export function writePageLyricsSource(cache, uri, entry, revision) {
    if (revision !== undefined) {
        if (!cache[SOURCE_REVISIONS]) {
            Object.defineProperty(cache, SOURCE_REVISIONS, { value: new WeakMap() });
        }
        cache[SOURCE_REVISIONS].set(entry, revision);
    }
    cache[uri] = entry;
    return entry;
}

export function updatePageLyricsSource(cache, uri, revision, update) {
    if (!cache) return undefined;
    const previous = readPageLyricsSource(cache, uri, revision);
    const next = update(previous);
    if (next && next !== previous) return writePageLyricsSource(cache, uri, next, revision);
    return previous;
}

export function invalidatePageLyricsTrack(uri, { page, sourceCache, translationCache, service }) {
    page?.pageLyricsDataLoader?.cancelForUri(uri);
    delete sourceCache[uri];
    translationCache.clearByUri(uri);
    if (page?._dmResults) delete page._dmResults[uri];
    service?.clearLyricsSnapshot?.(uri);
}
