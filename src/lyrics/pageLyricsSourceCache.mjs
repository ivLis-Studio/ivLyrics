const sourceRevisions = new WeakMap();

export function readPageLyricsSource(cache, uri, revision) {
    const entry = cache[uri];
    if (entry && sourceRevisions.has(entry) && sourceRevisions.get(entry) !== revision) {
        delete cache[uri];
        return undefined;
    }
    return entry;
}

export function writePageLyricsSource(cache, uri, entry, revision) {
    if (revision !== undefined) sourceRevisions.set(entry, revision);
    cache[uri] = entry;
    return entry;
}

export function invalidatePageLyricsTrack(uri, { page, sourceCache, translationCache, service }) {
    page?.pageLyricsDataLoader?.cancelForUri(uri);
    delete sourceCache[uri];
    translationCache.clearByUri(uri);
    if (page?._dmResults) delete page._dmResults[uri];
    service?.clearLyricsSnapshot?.(uri);
}
