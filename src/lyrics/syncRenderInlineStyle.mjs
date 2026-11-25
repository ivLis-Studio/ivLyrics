const SYNC_DATA_MAX_STYLE_RANGES_PER_LINE = 256;
const SYNC_DATA_INLINE_STYLE_KINDS = new Set([
    'vocal',
    'effect',
    'adlib',
    'pulse',
    'wave',
    'sparkle',
    'echo',
    'whisper',
    'bounce',
    'sway',
    'glow',
    'glitch',
    'flicker',
    'float',
    'blur',
    'pop'
]);
const SYNC_DATA_STYLE_SPEAKER_REGEX = /^(?:NORMAL|(?:MALE|FEMALE|DUET) [1-5]|(?:MALE|FEMALE|DUET) CUSTOM|CUSTOM)$/;
const SYNC_DATA_STYLE_CUSTOM_SPEAKER_REGEX = /^(?:(?:MALE|FEMALE|DUET) CUSTOM|CUSTOM)$/;
const SYNC_DATA_STYLE_FALLBACKS = new Set(['MALE 1', 'FEMALE 1', 'DUET 1']);

const normalizeSyncDataInlineStyleRanges = (ranges, lineStart, lineEnd) => {
    if (!Array.isArray(ranges)
        || !Number.isInteger(lineStart)
        || !Number.isInteger(lineEnd)
        || lineEnd < lineStart) {
        return [];
    }

    const normalized = [];
    let previousEnd = lineStart - 1;
    for (const range of ranges) {
        if (normalized.length >= SYNC_DATA_MAX_STYLE_RANGES_PER_LINE) break;

        const start = Number(range?.start);
        const end = Number(range?.end);
        if (!Number.isInteger(start)
            || !Number.isInteger(end)
            || start < lineStart
            || end > lineEnd
            || end < start
            || start <= previousEnd) {
            continue;
        }

        const rawKind = String(range?.kind || '').trim().toLowerCase();
        const kind = SYNC_DATA_INLINE_STYLE_KINDS.has(rawKind) ? rawKind : '';
        const rawSpeaker = String(range?.speaker || '')
            .trim()
            .replace(/[_-]+/g, ' ')
            .replace(/\s+/g, ' ')
            .toUpperCase();
        let speaker = SYNC_DATA_STYLE_SPEAKER_REGEX.test(rawSpeaker) ? rawSpeaker : '';
        const speakerColor = /^#[0-9a-f]{6}$/i.test(String(range?.['speaker-color'] || '').trim())
            ? String(range['speaker-color']).trim().toLowerCase()
            : '';
        const rawSpeakerFallback = String(range?.['speaker-fallback'] || '')
            .trim()
            .replace(/[_-]+/g, ' ')
            .replace(/\s+/g, ' ')
            .toUpperCase();
        const speakerFallback = SYNC_DATA_STYLE_FALLBACKS.has(rawSpeakerFallback)
            ? rawSpeakerFallback
            : '';

        if (SYNC_DATA_STYLE_CUSTOM_SPEAKER_REGEX.test(speaker) && !speakerColor) {
            speaker = '';
        }
        if (!kind && !speaker) continue;

        normalized.push({
            start,
            end,
            kind,
            speaker,
            speakerColor: speaker ? speakerColor : '',
            speakerFallback: speaker ? speakerFallback : ''
        });
        previousEnd = end;
    }
    return normalized;
};

const findSyncDataInlineStyleRange = (ranges, absoluteIndex) => {
    let low = 0;
    let high = Array.isArray(ranges) ? ranges.length - 1 : -1;
    while (low <= high) {
        const middle = (low + high) >> 1;
        const range = ranges[middle];
        if (absoluteIndex < range.start) {
            high = middle - 1;
        } else if (absoluteIndex > range.end) {
            low = middle + 1;
        } else {
            return range;
        }
    }
    return null;
};

export {
    normalizeSyncDataInlineStyleRanges,
    findSyncDataInlineStyleRange,
};
