export function createPanelTrackRequests(initialUri, readCurrentTrackUri) {
    let loadedUri = initialUri;
    let providerController = null;
    let loadRevision = 0;
    let offsetRevision = 0;

    const invalidateLyrics = () => {
        loadRevision++;
        const retired = providerController;
        providerController = null;
        retired?.abort();
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
            if (!force && (providerController || uri === loadedUri)) return null;
            const retired = providerController;
            const controller = new AbortController();
            providerController = controller;
            loadedUri = uri;
            const revision = ++loadRevision;
            retired?.abort();
            return { revision, signal: controller.signal };
        },
        endLyrics(revision) {
            if (revision === loadRevision) providerController = null;
        },
        ownsLyrics: (revision, uri) => revision === loadRevision && uri === readCurrentTrackUri(),
        beginOffset: () => ++offsetRevision,
        ownsOffset: (revision, uri) => revision === offsetRevision && uri === readCurrentTrackUri(),
        invalidate, invalidateLyrics, invalidateOffset,
    };
}
