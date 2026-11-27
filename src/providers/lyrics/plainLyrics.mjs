export function parsePlainLyrics(value, decodeLine) {
    const unsynced = [];
    for (const line of String(value || '').replace(/^\uFEFF/, '').split(/\r?\n/)) {
        const text = (decodeLine ? decodeLine(line) : line).trim();
        if (text) unsynced.push({ text });
    }
    return { karaoke: null, synced: null, unsynced };
}
