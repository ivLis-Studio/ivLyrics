export function normalizeInlineText(value) {
    return String(value ?? '').replace(/[\r\n\t\f\v ]+/g, ' ');
}

export function normalizeDisplayText(value) {
    return normalizeInlineText(value).trim();
}

export function normalizeMetadataText(value) {
    if (Array.isArray(value)) {
        return value
            .map(item => normalizeMetadataText(item))
            .filter(Boolean)
            .join(', ');
    }
    if (value && typeof value === 'object') {
        return normalizeDisplayText(value.name || value.title || '');
    }
    return normalizeDisplayText(value);
}

export function toFiniteMilliseconds(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? Math.round(number) : null;
}

export function toPositiveMilliseconds(value) {
    const number = toFiniteMilliseconds(value);
    return Number.isFinite(number) && number > 0 ? number : null;
}

export function normalizeDurationMs(info) {
    const duration = Number(info?.durationMs ?? info?.duration_ms ?? info?.duration ?? 0);
    if (!Number.isFinite(duration) || duration <= 0) return 0;
    return duration > 10000 ? Math.round(duration) : Math.round(duration * 1000);
}

export function normalizeDurationSeconds(info) {
    const durationMs = normalizeDurationMs(info);
    if (!durationMs) return '';
    return String(Math.round(durationMs) / 1000);
}

export function isUsablePayload(payload) {
    return payload
        && !payload.error
        && Array.isArray(payload.lyrics)
        && payload.lyrics.some(line => normalizeDisplayText(line?.text)
            || (Array.isArray(line?.syllabus) && line.syllabus.some(item => normalizeDisplayText(item?.text))));
}


export function joinSyllableText(syllables) {
    return normalizeDisplayText((syllables || []).map(syllable => syllable?.text || '').join(''));
}
