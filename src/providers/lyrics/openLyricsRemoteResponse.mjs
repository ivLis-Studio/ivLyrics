import {
    decodeLyricTextEntities, getSpeakerPresentation, normalizeReferenceSpacingCharacters, parsePlainLyrics, parseTimedTokens,
} from "./openLyricsTokens.mjs";

export function getCandidateQuality(candidate) {
    const parsed = candidate?.parsed;
    const backgroundCount = parsed?.karaoke?.filter(line => line?.vocals?.background?.length).length || 0;
    const sourceBonus = candidate?.source === 'catalog_api' ? 2 : 0;
    if (parsed?.karaoke?.length) return 3000 + backgroundCount * 10 + sourceBonus + parsed.karaoke.length / 1000;
    if (parsed?.synced?.length) return 2000 + sourceBonus + parsed.synced.length / 1000;
    if (parsed?.unsynced?.length) return 1000 + sourceBonus + parsed.unsynced.length / 1000;
    return 0;
}

export function selectBestLyricsPayloadCandidate(candidates) {
    let best = null;
    let bestScore = 0;
    for (const candidate of candidates) {
        const score = getCandidateQuality(candidate);
        if (score > bestScore) {
            best = candidate;
            bestScore = score;
        }
    }
    return best;
}

// Both JSON APIs use absolute milliseconds. Missing values must not become
// zero: that would turn plain lyrics into a stack of synchronized lines.
function openTime(value) {
    if (value === null || value === undefined || (typeof value === 'string' && !value.trim()) || typeof value === 'boolean') return null;
    const time = Number(value);
    return Number.isFinite(time) && time >= 0 && time <= 86400000 ? Math.round(time) : null;
}

export function parseOpenTrack(track, source, durationMs) {
    const rows = source === 'server-a' ? track?.timed : track?.lines;
    const level = String(source === 'server-a' ? track?.syncLevel : track?.meta?.level).toLowerCase();
    if (!Array.isArray(rows) || !rows.length) return parsePlainLyrics(track?.plain || '');
    const plain = [], timed = [], agents = new Map();
    for (let index = 0; index < rows.length; index++) {
        const row = rows[index];
        if (!row || row.isInstrumental === true) continue;
        const text = decodeLyricTextEntities(row.text).trim();
        if (!text) continue;
        plain.push({ text });
        if (level === 'none' || level === 'plain') continue;
        const embedded = Array.isArray(row.words) && row.words.length ? row.words : null;
        const words = embedded || track?.words?.[row.id ?? index];
        const detailed = ['word', 'syllable', 'character'].includes(level) && Array.isArray(words)
            && words.length > 0 && words.every(word => typeof word?.text === 'string'
                && openTime(word.start) !== null && openTime(word.end) > openTime(word.start));
        const exactWords = detailed && normalizeReferenceSpacingCharacters(words.map(word => word.text).join(''))
            === normalizeReferenceSpacingCharacters(text);
        const startTime = openTime(row.start) ?? (exactWords ? openTime(words[0].start)
            : source === 'server-b' && openTime(row.end) > 0 ? 0 : null);
        if (startTime === null) continue;
        let endTime = openTime(row.end);
        if (!(endTime > startTime)) endTime = exactWords ? Math.max(...words.map(word => openTime(word.end))) : null;
        if (!(endTime > startTime)) endTime = openTime(rows[index + 1]?.start);
        if (!(endTime > startTime) && startTime > 0 && index === rows.length - 1) {
            endTime = durationMs > startTime ? durationMs : startTime + 3000;
        }
        // A line with only zero timestamps is not a timed result.
        if (!(endTime > startTime)) continue;
        if (durationMs > 0) endTime = Math.min(endTime, durationMs);
        if (!(endTime > startTime)) continue;
        const agent = String(row.agent || '');
        if (agent && !agents.has(agent)) agents.set(agent, agents.size);
        const line = { startTime, endTime, text, kind: 'vocal', ...getSpeakerPresentation(row, agents) };
        if (exactWords) {
            const tokens = words.map(word => ({ text: word.text, timestamp: word.start, endtime: word.end, part: true }));
            const syllables = parseTimedTokens(tokens, startTime, endTime, text)
                .filter(word => word.startTime >= startTime && word.startTime < endTime)
                .map(word => ({ ...word, endTime: Math.min(endTime, word.endTime) }));
            if (syllables.length === words.length) line.syllables = syllables;
        }
        timed.push(line);
    }
    timed.sort((a, b) => a.startTime - b.startTime);
    return {
        karaoke: timed.some(line => line.syllables?.length) ? timed : null,
        synced: timed.length ? timed.map(({ syllables, ...line }) => line) : null,
        unsynced: plain.length ? plain : null
    };
}

export function parseOpenResponse(body, source, durationMs) {
    if (!body || body.error) return null;
    if (source === 'server-a' && body.primary) {
        const primary = { source, payload: body.primary, parsed: parseOpenTrack(body.primary, source, durationMs) };
        if (getCandidateQuality(primary) > 0) return primary;
    }
    const tracks = source === 'server-a' ? [body.primary, ...(Array.isArray(body.tracks) ? body.tracks : [])] : [body];
    return selectBestLyricsPayloadCandidate(tracks.filter(Boolean).map(track => ({
        source, payload: track, parsed: parseOpenTrack(track, source, durationMs),
    })));
}
