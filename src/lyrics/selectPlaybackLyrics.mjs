const LYRICS_TYPES = ['karaoke', 'synced', 'unsynced'];

export function isKaraokePlaybackEnabled(value) {
    return value !== false && value !== 'false';
}

export function hasLyricsRows(result) {
    return LYRICS_TYPES.some(type => Array.isArray(result?.[type]) && result[type].length > 0);
}

export function selectPlaybackLyrics(result, karaokeEnabled) {
    for (const lyricsType of LYRICS_TYPES) {
        if (lyricsType === 'karaoke' && !karaokeEnabled) continue;
        const lyrics = result?.[lyricsType];
        if (Array.isArray(lyrics) && lyrics.length) return { lyrics, lyricsType };
    }
    return { lyrics: [], lyricsType: 'unsynced' };
}
