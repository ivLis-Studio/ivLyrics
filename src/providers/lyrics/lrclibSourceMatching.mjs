export const LRCLIB_PROVIDER_ID = 'lrclib';

const LRCLIB_ORIGINAL_SCRIPT_REGEX = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]/;
const LRCLIB_MEANINGFUL_TEXT_REGEX = /\p{L}|\p{N}/u;
const LRCLIB_METADATA_LINE_REGEX = /^\s*\[(?:ar|al|ti|au|length|by|offset|re|ve):[^\]]*\]\s*$/i;

function stripLrcTimestamps(text) {
    if (!text || typeof text !== 'string') return '';
    return text.replace(/^\[\d+:\d+(?:[.,]\d+)?\]\s*/gm, '').trim();
}

function stripLeadingLrcTimestamp(text) {
    if (!text || typeof text !== 'string') return '';
    return text.replace(/^\[\d+:\d+(?:[.,]\d+)?\]\s*/, '').trim();
}

export function hasOriginalLyricsScript(text) {
    if (!text || typeof text !== 'string') return false;

    return LRCLIB_ORIGINAL_SCRIPT_REGEX.test(text);
}

function hasMeaningfulLyricsText(text) {
    if (!text || typeof text !== 'string') return false;
    return LRCLIB_MEANINGFUL_TEXT_REGEX.test(text);
}

function getMeaningfulLyricsLines(text) {
    if (!text || typeof text !== 'string') return [];

    return text
        .split('\n')
        .map(line => stripLeadingLrcTimestamp(line))
        .filter(line => hasMeaningfulLyricsText(line));
}

export function analyzeLyricsLanguageMix(text) {
    const lines = getMeaningfulLyricsLines(text);
    if (lines.length === 0) {
        return {
            meaningfulLineCount: 0,
            originalScriptLineCount: 0,
            nonOriginalLineCount: 0,
            alternatingScriptPairs: 0,
            comparablePairs: 0,
            hasInterleavedTranslations: false
        };
    }

    let originalScriptLineCount = 0;
    let nonOriginalLineCount = 0;
    let alternatingScriptPairs = 0;
    let comparablePairs = 0;

    const lineKinds = lines.map(line => {
        if (hasOriginalLyricsScript(line)) {
            originalScriptLineCount += 1;
            return 'original';
        }

        nonOriginalLineCount += 1;
        return 'other';
    });

    for (let index = 1; index < lineKinds.length; index += 1) {
        comparablePairs += 1;
        if (lineKinds[index] !== lineKinds[index - 1]) {
            alternatingScriptPairs += 1;
        }
    }

    const hasInterleavedTranslations = lines.length >= 6
        && originalScriptLineCount >= 2
        && nonOriginalLineCount >= 2
        && (originalScriptLineCount / lines.length) >= 0.25
        && (nonOriginalLineCount / lines.length) >= 0.25
        && comparablePairs > 0
        && (alternatingScriptPairs / comparablePairs) >= 0.6;

    return {
        meaningfulLineCount: lines.length,
        originalScriptLineCount,
        nonOriginalLineCount,
        alternatingScriptPairs,
        comparablePairs,
        hasInterleavedTranslations
    };
}

export function getCandidateLyricsText(candidate, preferredSource = null) {
    if (preferredSource === 'synced' && candidate?.syncedLyrics) {
        return stripLrcTimestamps(candidate.syncedLyrics);
    }
    if (preferredSource === 'plain' && candidate?.plainLyrics) {
        return candidate.plainLyrics;
    }
    if (candidate?.plainLyrics) return candidate.plainLyrics;
    if (candidate?.syncedLyrics) return stripLrcTimestamps(candidate.syncedLyrics);
    return '';
}

export function getComparableLyricsLines(text, { stripTimestamps = false } = {}) {
    if (!text || typeof text !== 'string') return [];

    return text
        .split('\n')
        .map(line => stripTimestamps ? stripLeadingLrcTimestamp(line) : line.trim())
        .filter(line => !LRCLIB_METADATA_LINE_REGEX.test(line))
        .filter(line => line.length > 0)
        .map(line => line.normalize('NFC'));
}

export function getLineCharCounts(lines) {
    return lines.map(line => {
        if (typeof line !== 'string') {
            return Array.from(line).length;
        }

        let count = line.length;
        for (let index = 1; index < line.length; index += 1) {
            const codeUnit = line.charCodeAt(index);
            if (codeUnit < 0xDC00 || codeUnit > 0xDFFF) continue;

            const previousCodeUnit = line.charCodeAt(index - 1);
            if (previousCodeUnit >= 0xD800 && previousCodeUnit <= 0xDBFF) {
                count -= 1;
            }
        }
        return count;
    });
}

export function getSyncDataLineCharCounts(syncData) {
    const body = syncData?.syncData;
    const sourceCounts = body?.source?.lineCharCounts;
    if (Array.isArray(sourceCounts) && sourceCounts.length > 0
        && sourceCounts.every(count => Number.isSafeInteger(count) && count > 0)) {
        return sourceCounts;
    }
    if (!Array.isArray(body?.lines) || body.lines.length === 0) return null;
    // A compact timing payload may have no chars array. Only infer source
    // rows from complete, contiguous legacy ranges; partial ranges are unknown.
    const counts = [];
    let nextStart = 0;
    for (const line of body.lines) {
        if (!Number.isSafeInteger(line?.start) || !Number.isSafeInteger(line?.end)
            || line.start !== nextStart || line.end < line.start) return null;
        counts.push(line.end - line.start + 1);
        nextStart = line.end + 1;
    }
    return counts;
}

export function hasExactLineCharCountMatch(expectedCounts, actualCounts) {
    if (!Array.isArray(expectedCounts) || !Array.isArray(actualCounts)) return false;
    if (expectedCounts.length === 0 || expectedCounts.length !== actualCounts.length) return false;
    return expectedCounts.every((count, index) => count === actualCounts[index]);
}

export function getCandidateSyncLineMatch(candidate, expectedCounts) {
    if (!Array.isArray(expectedCounts) || expectedCounts.length === 0) {
        return {
            syncLineExactMatch: false,
            exactSyncedLineMatch: false,
            exactPlainLineMatch: false,
            preferredLyricsSource: null
        };
    }

    const syncedLineCounts = candidate?.syncedLyrics
        ? getLineCharCounts(getComparableLyricsLines(candidate.syncedLyrics, { stripTimestamps: true }))
        : null;
    const plainLineCounts = candidate?.plainLyrics
        ? getLineCharCounts(getComparableLyricsLines(candidate.plainLyrics))
        : null;
    const exactSyncedLineMatch = hasExactLineCharCountMatch(expectedCounts, syncedLineCounts);
    const exactPlainLineMatch = hasExactLineCharCountMatch(expectedCounts, plainLineCounts);
    const preferredLyricsSource = exactSyncedLineMatch
        ? 'synced'
        : (exactPlainLineMatch
            ? 'plain'
            : null);

    return {
        syncLineExactMatch: exactSyncedLineMatch || exactPlainLineMatch,
        exactSyncedLineMatch,
        exactPlainLineMatch,
        preferredLyricsSource
    };
}

export function getLyricsTextFingerprint(text) {
    const value = String(text || '').normalize('NFC');
    let hash = 2166136261;
    let codePointLength = 0;
    for (const char of value) {
        hash ^= char.codePointAt(0) || 0;
        hash = Math.imul(hash, 16777619);
        codePointLength += 1;
    }
    return `lrclib-${(hash >>> 0).toString(36)}-${codePointLength.toString(36)}`;
}

export function buildLrclibSyncSource(candidate) {
    if (!candidate) return null;

    const lrclibId = candidate.id === undefined || candidate.id === null
        ? ''
        : String(candidate.id).trim();
    if (!/^[1-9]\d*$/.test(lrclibId)) return null;

    const preferredLyricsSource = candidate.preferredLyricsSource
        || (candidate.syncedLyrics ? 'synced' : (candidate.plainLyrics ? 'plain' : 'unknown'));
    const comparableLines = getComparableLyricsLines(
        getCandidateLyricsText(candidate, preferredLyricsSource)
    );
    if (comparableLines.length === 0) return null;

    const comparableText = comparableLines.join('\n');
    const lineCharCounts = getLineCharCounts(comparableLines);

    return {
        provider: LRCLIB_PROVIDER_ID,
        lrclibId,
        searchSource: candidate.searchSource || '',
        preferredLyricsSource,
        trackName: candidate.trackName || candidate.name || '',
        artistName: candidate.artistName || '',
        albumName: candidate.albumName || '',
        duration: Number(candidate.duration || 0) || 0,
        lyricsFingerprint: getLyricsTextFingerprint(comparableText),
        lineCharCounts,
        lineCount: lineCharCounts.length,
        textCharCount: lineCharCounts.reduce((sum, count) => sum + count, 0)
    };
}

export function getSyncDataLrclibSource(syncData) {
    const body = syncData?.syncData || syncData;
    const source = body?.source || body?.lyricsSource || null;
    if (!source || source.provider !== LRCLIB_PROVIDER_ID) return null;
    return source;
}

export function getComparableCandidateText(candidate, preferredSource) {
    return getComparableLyricsLines(getCandidateLyricsText(candidate, preferredSource)).join('\n');
}

export function getCandidateSourceMatch(candidate, source) {
    if (!source) {
        return {
            syncSourceMatchScore: 0,
            syncSourceIdMatch: false,
            syncSourceTextMatch: false,
            syncSourceLineCountMatch: false
        };
    }

    const candidateId = candidate?.id === undefined || candidate?.id === null ? '' : String(candidate.id);
    const sourceId = source.lrclibId === undefined || source.lrclibId === null ? '' : String(source.lrclibId);
    const preferredSource = candidate?.preferredLyricsSource || source.preferredLyricsSource || null;
    const candidateText = getComparableCandidateText(candidate, preferredSource);
    const candidateFingerprint = getLyricsTextFingerprint(candidateText);
    const candidateLineCounts = getLineCharCounts(getComparableLyricsLines(candidateText));
    const sourceLineCounts = Array.isArray(source.lineCharCounts) ? source.lineCharCounts : null;
    const sourceIdMatch = !!sourceId && !!candidateId && sourceId === candidateId;
    const sourceTextMatch = !!source.lyricsFingerprint && source.lyricsFingerprint === candidateFingerprint;
    const sourceLineCountMatch = hasExactLineCharCountMatch(sourceLineCounts, candidateLineCounts);
    const score = sourceIdMatch
        ? 100
        : (sourceTextMatch
            ? 90
            : (sourceLineCountMatch ? 60 : 0));

    return {
        syncSourceMatchScore: score,
        syncSourceIdMatch: sourceIdMatch,
        syncSourceTextMatch: sourceTextMatch,
        syncSourceLineCountMatch: sourceLineCountMatch
    };
}

export function getSyncDataLrclibId(source) {
    if (!source || source.provider !== LRCLIB_PROVIDER_ID) return '';
    const id = source.lrclibId ?? source.id;
    if (id === undefined || id === null) return '';
    return String(id).trim();
}

export function createLrclibCandidateIdentifiers(normalize) {
    function buildLrclibCandidateSignature(candidate) {
        const text = getComparableCandidateText(candidate, candidate?.preferredLyricsSource);
        return [
            candidate?.id ?? '',
            normalize(candidate?.trackName || candidate?.name || ''),
            normalize(candidate?.artistName || ''),
            Number(candidate?.duration || 0).toFixed(3),
            getLyricsTextFingerprint(text)
        ].join('|');
    }

    function buildLrclibCandidateKey(candidate, sourceLabel, index) {
        return `${sourceLabel}:${index}:${buildLrclibCandidateSignature(candidate)}`;
    }

    return { buildLrclibCandidateSignature, buildLrclibCandidateKey };
}
