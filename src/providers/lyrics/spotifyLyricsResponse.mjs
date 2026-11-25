const SYNC_TYPES = new Set(['LINE_SYNCED', 'SYLLABLE_SYNCED']);

export function createSpotifyLyricsResult(uri, error = null) {
    return {
        uri, provider: 'spotify', karaoke: null, synced: null, unsynced: null,
        copyright: null, error, spotifyLyricsProvider: null,
    };
}

function readTime(value) {
    if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return null;
    const time = Number(value);
    return time >= 0 && time <= Number.MAX_SAFE_INTEGER ? Math.trunc(time) : null;
}

function readRowStart(line) {
    const lineStart = readTime(line.startTimeMs);
    if (lineStart !== null) return lineStart;
    if (Array.isArray(line.syllables)) {
        for (const syllable of line.syllables) {
            const start = readTime(syllable?.startTimeMs);
            if (start !== null) return start;
        }
    }
    return null;
}

export function parseSpotifyLyrics(uri, response) {
    const lyrics = response?.lyrics;
    const lines = Array.isArray(lyrics?.lines)
        ? lyrics.lines.filter(line => line && typeof line === 'object' && !Array.isArray(line))
        : [];
    if (!lines.some(line => typeof line.words === 'string' && line.words.trim())) {
        return createSpotifyLyricsResult(uri, 'No lyrics');
    }

    const provider = typeof lyrics.provider === 'string' && lyrics.provider ? lyrics.provider : 'unknown';
    const result = {
        ...createSpotifyLyricsResult(uri), provider: `spotify-${provider}`, spotifyLyricsProvider: provider,
    };
    const textLines = lines.map(line => ({ text: typeof line.words === 'string' ? line.words : '' }));
    if (SYNC_TYPES.has(lyrics.syncType)) {
        const times = lines.map(readRowStart);
        if (times.some(time => time !== null)) {
            result.synced = textLines.map((line, index) => ({ startTime: times[index] ?? 0, ...line }));
            result.unsynced = result.synced;
            return result;
        }
    }
    result.unsynced = textLines;
    return result;
}
