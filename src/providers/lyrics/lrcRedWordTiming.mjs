import { isPseudoKaraoke } from "./lyricsProviderSelection.mjs";

const ISRC_PATTERN = /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/;

export const normalizeLrcRedIsrc = (value) => {
    const isrc = String(value || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    return ISRC_PATTERN.test(isrc) ? isrc : '';
};

// /sync returns the new recording as JSON; the public TTML may still hold
// its original line timing. Words contain one or more timed fragments.
export const parseLrcRedWordSyncResponse = (payload, expectedIsrc) => {
    if (normalizeLrcRedIsrc(payload?.id) !== expectedIsrc) throw new Error('Word sync recording mismatch');
    const lyrics = payload.lyrics;
    if (!['word', 'syllable'].includes(String(lyrics?.timing || lyrics?.sync).toLowerCase())
        || !Array.isArray(lyrics.lines)) throw new Error('Word sync response has no word timing');
    const milliseconds = value => {
        if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error('Invalid word sync time');
        return Math.round(value * 1000);
    };
    let timedWords = 0;
    const karaoke = lyrics.lines.filter(line => typeof line?.text === 'string' && line.text.trim()).map(line => {
        const text = line.text;
        const syllables = [];
        let cursor = 0;
        for (const fragments of line.words || []) {
            if (!Array.isArray(fragments) || !fragments.length) throw new Error('Invalid word sync fragments');
            const word = fragments.map(fragment => {
                if (typeof fragment?.text !== 'string') throw new Error('Invalid word sync text');
                return fragment.text;
            }).join('');
            const whitespace = text.slice(cursor).match(/^\s*/u)[0];
            cursor += whitespace.length;
            if (!word || !text.startsWith(word, cursor)) throw new Error('Word sync text does not match its line');
            if (syllables.length) syllables[syllables.length - 1].text += whitespace;
            const startTime = milliseconds(fragments[0].begin);
            const endTime = milliseconds(fragments[fragments.length - 1].end);
            if (endTime < startTime || fragments.some(fragment => milliseconds(fragment.end) < milliseconds(fragment.begin))) {
                throw new Error('Invalid word sync range');
            }
            syllables.push({ text: (syllables.length ? '' : whitespace) + word, startTime, endTime });
            cursor += word.length;
            timedWords++;
        }
        if (syllables.length) {
            const remaining = text.slice(cursor);
            if (remaining.trim()) throw new Error('Word sync response has unmatched text');
            syllables[syllables.length - 1].text += remaining;
        }
        const startTime = milliseconds(line.begin);
        const endTime = milliseconds(line.end);
        if (endTime < startTime) throw new Error('Invalid word sync line range');
        return { text, startTime, endTime, syllables: syllables.length ? syllables : [{ text, startTime, endTime }] };
    });
    if (!timedWords) throw new Error('Word sync response has no timed words');
    return {
        karaoke,
        synced: karaoke.map(({ text, startTime, endTime }) => ({ text, startTime, endTime })),
        unsynced: karaoke.map(({ text }) => ({ text })),
    };
};

export const hasSameLrcRedLyrics = (left, right) => {
    const text = result => (result.synced?.length ? result.synced : result.unsynced?.length ? result.unsynced : result.karaoke || [])
        .map(line => String(line.originalText ?? line.text ?? '').normalize('NFC').trim()).filter(Boolean);
    const a = text(left), b = text(right);
    return a.length > 0 && a.length === b.length && a.every((line, index) => line === b[index]);
};

export function matchesLrcRedRecording(result, update) {
    const currentIsrc = normalizeLrcRedIsrc(result?.lrcred?.isrc);
    return !currentIsrc || currentIsrc === normalizeLrcRedIsrc(update.lrcred?.isrc);
}

export function hasCompatibleLrcRedTimingSource(result, update) {
    return result?.provider === 'lrcred' && !result.error && !result.syncDataApplied
        && (!result.cacheVersion || result.cacheVersion === update.cacheVersion)
        && matchesLrcRedRecording(result, update);
}

export function canApplyLrcRedWordTiming(result, update, isPseudoKaraoke) {
    return hasCompatibleLrcRedTimingSource(result, update)
        && (!result.karaoke?.length || isPseudoKaraoke(result))
        && hasSameLrcRedLyrics(result, update);
}

export function retainLrcRedWordTiming(result, timing, isPseudo = isPseudoKaraoke) {
    if (timing?.provider !== 'lrcred' || timing.karaokeSource !== 'lrcred' || timing.error
        || timing.syncDataApplied || !timing.karaoke?.length || !canApplyLrcRedWordTiming(result, timing, isPseudo)) {
        return result;
    }
    const { pseudoKaraokeCacheVersion, ...base } = result;
    return {
        ...base,
        synced: timing.synced || base.synced,
        unsynced: base.unsynced || timing.unsynced,
        karaoke: timing.karaoke,
        karaokeSource: timing.karaokeSource,
        karaokeGranularity: timing.karaokeGranularity || 'word',
        lrcred: { ...base.lrcred, ...timing.lrcred },
    };
}

export const withParsedLrcRedLyrics = (result, parsed) => ({
    ...result,
    karaoke: parsed.karaoke.length ? parsed.karaoke : null,
    synced: parsed.synced.length ? parsed.synced : null,
    unsynced: parsed.unsynced.length ? parsed.unsynced : null,
    karaokeSource: parsed.karaoke.length ? 'lrcred' : null,
    error: parsed.karaoke.length || parsed.synced.length || parsed.unsynced.length ? null : 'No usable lyrics',
    lrcred: { ...result.lrcred, syncType: parsed.karaoke.length ? 'word' : 'line', lines: parsed.synced.length },
});

