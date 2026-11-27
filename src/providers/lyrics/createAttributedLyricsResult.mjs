export function createAttributedLyricsResult(info, { id, cacheVersion }, copyright, { skipCache = false } = {}) {
    return {
        uri: info?.uri || '',
        provider: id,
        cacheVersion,
        ...(skipCache ? { skipCache: true } : {}),
        karaoke: null,
        synced: null,
        unsynced: null,
        karaokeSource: null,
        copyright,
        error: null
    };
}
