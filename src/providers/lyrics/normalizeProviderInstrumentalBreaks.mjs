import { LYRICS_TYPES } from "./lyricsProviderTypes.mjs";

const CANONICAL_INSTRUMENTAL_BREAK_MARKER = '♪';
const NOTE_INSTRUMENTAL_BREAK_CHARACTER_PATTERN = /[\u2669-\u266F\u{1D100}-\u{1D1FF}\u{1F3B5}-\u{1F3BC}]/u;
const NOTE_ONLY_INSTRUMENTAL_BREAK_PATTERN = /^[\s\u00A0\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFE0E\uFE0F\uFEFF\u2669-\u266F\u{1D100}-\u{1D1FF}\u{1F3B5}-\u{1F3BC}·•・。.、,，…⋯~〜～\-–—_|/\\:：]+$/u;

export function createProviderInstrumentalBreakNormalizer(readMarkers) {
    function decodeInstrumentalBreakEntities(value) {
        const markers = readMarkers();
        if (markers?.decodeEntities) return markers.decodeEntities(value);
        const text = String(value ?? '');
        if (!text.includes('&')) return text;
        return text
            .replace(/&lt;|&#0*60;|&#x0*3c;/giu, '<')
            .replace(/&gt;|&#0*62;|&#x0*3e;/giu, '>')
            .replace(/&nbsp;|&#0*160;|&#x0*a0;/giu, ' ');
    }

    function getInstrumentalBreakMarker(value) {
        const markers = readMarkers();
        if (markers?.getMarker) return markers.getMarker(value);
        const normalized = decodeInstrumentalBreakEntities(value).trim();
        if (!normalized) return null;
        if (NOTE_INSTRUMENTAL_BREAK_CHARACTER_PATTERN.test(normalized)
            && NOTE_ONLY_INSTRUMENTAL_BREAK_PATTERN.test(normalized)) {
            return CANONICAL_INSTRUMENTAL_BREAK_MARKER;
        }

        const wrapped = normalized.match(/^[<＜〈《]\s*(.*?)\s*[>＞〉》]$/u);
        if (!wrapped) return null;

        const label = wrapped[1].normalize('NFKC').trim();
        return NOTE_INSTRUMENTAL_BREAK_CHARACTER_PATTERN.test(label)
            && NOTE_ONLY_INSTRUMENTAL_BREAK_PATTERN.test(label)
            ? CANONICAL_INSTRUMENTAL_BREAK_MARKER
            : null;
    }

    function getSyllableText(syllables) {
        return Array.isArray(syllables)
            ? syllables.map((syllable) => syllable?.text || '').join('')
            : '';
    }

    function getLineInstrumentalBreakMarker(line) {
        const { originalText, text } = line;
        const hasOriginalText = decodeInstrumentalBreakEntities(originalText).trim();
        const hasText = decodeInstrumentalBreakEntities(text).trim();
        if (hasOriginalText || hasText) {
            if ((hasOriginalText && !getInstrumentalBreakMarker(originalText))
                || (hasText && !getInstrumentalBreakMarker(text))) return null;
            return CANONICAL_INSTRUMENTAL_BREAK_MARKER;
        }

        const syllableText = getSyllableText(line?.syllables);
        if (syllableText.trim()) {
            return getInstrumentalBreakMarker(syllableText);
        }

        const vocalParts = [
            line?.vocals?.lead,
            ...(Array.isArray(line?.vocals?.background) ? line.vocals.background : [])
        ].filter((part) => part && (
            decodeInstrumentalBreakEntities(part.text).trim()
            || getSyllableText(part.syllables).trim()
        ));
        if (vocalParts.length === 0) return null;

        return vocalParts.every((part) => (
            getInstrumentalBreakMarker(part.text)
            || getInstrumentalBreakMarker(getSyllableText(part.syllables))
        ))
            ? CANONICAL_INSTRUMENTAL_BREAK_MARKER
            : null;
    }

    function toFiniteLyricsTime(value) {
        const numeric = Number(value);
        return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
    }

    function getLyricsDurationMs(info) {
        for (const value of [info?.durationMs, info?.duration_ms, info?.duration]) {
            const duration = toFiniteLyricsTime(value);
            if (duration !== null && duration > 0) return duration;
        }
        return null;
    }

    function normalizeInstrumentalBreakSyllables(syllables, marker, startTime, endTime) {
        if (!Array.isArray(syllables) || syllables.length === 0) {
            return { syllables, changed: false };
        }

        const first = syllables[0];
        const last = syllables[syllables.length - 1];
        const syllableStart = startTime ?? toFiniteLyricsTime(first?.startTime);
        const syllableEnd = endTime ?? toFiniteLyricsTime(last?.endTime);
        const normalizedSyllable = {
            ...first,
            text: marker
        };
        if (syllableStart !== null) {
            normalizedSyllable.startTime = syllableStart;
        }
        if (syllableEnd !== null && (syllableStart === null || syllableEnd > syllableStart)) {
            normalizedSyllable.endTime = syllableEnd;
        }

        const isAlreadyNormalized = syllables.length === 1
            && first?.text === normalizedSyllable.text
            && first?.startTime === normalizedSyllable.startTime
            && first?.endTime === normalizedSyllable.endTime;
        return {
            syllables: isAlreadyNormalized ? syllables : [normalizedSyllable],
            changed: !isAlreadyNormalized
        };
    }

    function normalizeInstrumentalVocalPart(part, startTime, endTime) {
        if (!part || typeof part !== 'object') {
            return { part, changed: false };
        }

        const marker = getInstrumentalBreakMarker(part.text)
            || getInstrumentalBreakMarker(getSyllableText(part.syllables));
        if (!marker) return { part, changed: false };

        const normalizedSyllables = normalizeInstrumentalBreakSyllables(
            part.syllables,
            marker,
            startTime,
            endTime
        );
        const textChanged = part.text !== marker;
        if (!textChanged && !normalizedSyllables.changed) {
            return { part, changed: false };
        }

        return {
            part: {
                ...part,
                text: marker,
                ...(normalizedSyllables.changed ? { syllables: normalizedSyllables.syllables } : {})
            },
            changed: true
        };
    }

    function normalizeInstrumentalBreakLine(line, index, lines, durationMs, timed) {
        const marker = getLineInstrumentalBreakMarker(line);
        if (!marker) return line;

        const startTime = toFiniteLyricsTime(line.startTime);
        const nextStartTime = toFiniteLyricsTime(lines[index + 1]?.startTime);
        const directEndTime = toFiniteLyricsTime(line.endTime);
        const resolvedEndTime = timed && startTime !== null
            ? (
                nextStartTime !== null && nextStartTime > startTime
                    ? nextStartTime
                    : (directEndTime !== null && directEndTime > startTime
                        ? directEndTime
                        : (durationMs !== null && durationMs > startTime ? durationMs : null))
            )
            : null;
        const textChanged = line.text !== marker
            || (line.originalText !== undefined && line.originalText !== marker);
        const endTimeChanged = resolvedEndTime !== null && line.endTime !== resolvedEndTime;
        const lineSyllableMarker = getInstrumentalBreakMarker(getSyllableText(line.syllables));
        const normalizedSyllables = lineSyllableMarker
            ? normalizeInstrumentalBreakSyllables(
                line.syllables,
                lineSyllableMarker,
                startTime,
                resolvedEndTime
            )
            : { syllables: line.syllables, changed: false };
        const normalizedLead = normalizeInstrumentalVocalPart(
            line.vocals?.lead,
            startTime,
            resolvedEndTime
        );
        const normalizedBackground = Array.isArray(line.vocals?.background)
            ? line.vocals.background.map((part) => (
                normalizeInstrumentalVocalPart(part, startTime, resolvedEndTime)
            ))
            : [];
        const backgroundChanged = normalizedBackground.some((entry) => entry.changed);
        const vocalsChanged = normalizedLead.changed || backgroundChanged;
        if (!textChanged && !endTimeChanged && !normalizedSyllables.changed && !vocalsChanged) {
            return line;
        }

        const normalizedLine = {
            ...line,
            text: marker,
            ...(normalizedSyllables.changed ? { syllables: normalizedSyllables.syllables } : {})
        };
        if (line.originalText !== undefined) {
            normalizedLine.originalText = marker;
        }
        if (resolvedEndTime !== null) {
            normalizedLine.endTime = resolvedEndTime;
        }
        if (vocalsChanged) {
            normalizedLine.vocals = {
                ...line.vocals,
                ...(normalizedLead.changed ? { lead: normalizedLead.part } : {}),
                ...(backgroundChanged
                    ? { background: normalizedBackground.map((entry) => entry.part) }
                    : {})
            };
        }
        return normalizedLine;
    }

    function normalizeInstrumentalBreakLines(lines, durationMs, timed) {
        if (!Array.isArray(lines)) return lines;

        let normalizedLines = lines;
        for (let index = 0; index < lines.length; index++) {
            const line = lines[index];
            if (!line || typeof line !== 'object') continue;
            const normalizedLine = normalizeInstrumentalBreakLine(line, index, lines, durationMs, timed);
            if (normalizedLine === line) continue;
            if (normalizedLines === lines) normalizedLines = lines.slice();
            normalizedLines[index] = normalizedLine;
        }
        return normalizedLines;
    }

    return function normalizeProviderInstrumentalBreaks(result, info = {}) {
        if (!result || typeof result !== 'object') {
            return { result, changed: false };
        }

        const durationMs = getLyricsDurationMs(info);
        let normalizedResult = result;
        for (const type of [LYRICS_TYPES.KARAOKE, LYRICS_TYPES.SYNCED, LYRICS_TYPES.UNSYNCED]) {
            const lines = result[type];
            const normalized = normalizeInstrumentalBreakLines(lines, durationMs, type !== LYRICS_TYPES.UNSYNCED);
            if (normalized === lines) continue;
            if (normalizedResult === result) normalizedResult = { ...result };
            normalizedResult[type] = normalized;
        }

        return { result: normalizedResult, changed: normalizedResult !== result };
    };
}
