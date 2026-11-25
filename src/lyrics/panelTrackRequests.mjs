export function createPanelTrackRequests(initialUri, readCurrentTrackUri) {
    let loadedUri = initialUri;
    let loading = false;
    let loadRevision = 0;
    let offsetRevision = 0;

    const invalidateLyrics = () => {
        loadRevision++;
        loading = false;
    };
    const invalidateOffset = () => { offsetRevision++; };
    const invalidate = () => {
        invalidateLyrics();
        invalidateOffset();
    };

    return {
        get trackUri() { return loadedUri; },
        adopt(uri) { loadedUri = uri; },
        reset() {
            invalidate();
            loadedUri = null;
        },
        beginLyrics(uri, force) {
            if (!force && (loading || uri === loadedUri)) return null;
            loading = true;
            loadedUri = uri;
            return ++loadRevision;
        },
        endLyrics(revision) {
            if (revision === loadRevision) loading = false;
        },
        ownsLyrics: (revision, uri) => revision === loadRevision && uri === readCurrentTrackUri(),
        beginOffset: () => ++offsetRevision,
        ownsOffset: (revision, uri) => revision === offsetRevision && uri === readCurrentTrackUri(),
        invalidate, invalidateLyrics, invalidateOffset,
    };
}
