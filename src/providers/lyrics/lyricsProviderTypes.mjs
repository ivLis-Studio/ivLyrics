export const LYRICS_TYPES = {
    CHARACTER: 'character', // 글자 단위 노래방 가사
    WORD: 'word',           // 단어 단위 노래방 가사
    KARAOKE: 'karaoke',     // 이전 Addon/설정 호환용 그룹 이름
    SYNCED: 'synced',       // 싱크 가사 (줄별 타이밍)
    UNSYNCED: 'unsynced'    // 일반 가사 (타이밍 없음)
};
export const LYRICS_TYPE_PRIORITY_ORDER = [
    LYRICS_TYPES.CHARACTER,
    LYRICS_TYPES.WORD,
    LYRICS_TYPES.SYNCED,
    LYRICS_TYPES.UNSYNCED
];
export const KARAOKE_GRANULARITIES = new Set([
    LYRICS_TYPES.CHARACTER,
    LYRICS_TYPES.WORD
]);

export const SYNC_DATA_RENDERER_VERSION = '2026-10-16-manual-merge-groups-1';

export function hasLyricsContent(lines) {
    return Array.isArray(lines) && lines.length > 0;
}

export function normalizeKaraokeGranularity(value) {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'char' || normalized === 'character' || normalized === 'letter') {
        return LYRICS_TYPES.CHARACTER;
    }
    if (normalized === 'word' || normalized === 'token') {
        return LYRICS_TYPES.WORD;
    }
    return '';
}

export function getDeclaredKaraokeGranularities(provider) {
    const declared = new Set(
        (Array.isArray(provider?.supports?.karaokeGranularities)
            ? provider.supports.karaokeGranularities
            : [])
            .map(normalizeKaraokeGranularity)
            .filter(Boolean)
    );
    if (provider?.supports?.character === true || provider?.supports?.karaokeCharacter === true) {
        declared.add(LYRICS_TYPES.CHARACTER);
    }
    if (provider?.supports?.word === true || provider?.supports?.karaokeWord === true) {
        declared.add(LYRICS_TYPES.WORD);
    }
    return declared;
}

function getKaraokeLineSyllables(line) {
    const syllables = [];
    if (Array.isArray(line?.syllables)) syllables.push(...line.syllables);
    if (Array.isArray(line?.vocals?.lead?.syllables)) syllables.push(...line.vocals.lead.syllables);
    if (Array.isArray(line?.vocals?.background)) {
        line.vocals.background.forEach(part => {
            if (Array.isArray(part?.syllables)) syllables.push(...part.syllables);
        });
    }
    return syllables;
}

export function inferKaraokeGranularity(result) {
    const explicit = normalizeKaraokeGranularity(
        result?.karaokeGranularity
        || result?.karaokeTimingType
        || result?.karaokeType
    );
    if (explicit) return explicit;

    const source = String(result?.karaokeSource || '').trim().toLowerCase();
    if (source === 'sync-data' || source === 'ivlyrics-sync') {
        return LYRICS_TYPES.CHARACTER;
    }
    if (source === 'lrclib-lyricsfile' || source === 'lyricsplus') {
        return LYRICS_TYPES.WORD;
    }

    let singleCharacterUnits = 0;
    let multiCharacterUnits = 0;
    for (const line of (Array.isArray(result?.karaoke) ? result.karaoke : [])) {
        for (const syllable of getKaraokeLineSyllables(line)) {
            const text = String(syllable?.text || '').trim();
            if (!text) continue;
            const characterCount = Array.from(text).length;
            if (characterCount <= 1) singleCharacterUnits++;
            else multiCharacterUnits++;
        }
    }

    // A word-timed source normally exposes several multi-character tokens.
    // Keep borderline/CJK data in character mode unless multi-character units
    // clearly dominate; this avoids turning real per-character sync into a
    // coarse renderer because of one punctuation or whitespace token.
    if (multiCharacterUnits > 0
        && multiCharacterUnits >= Math.max(2, Math.ceil(singleCharacterUnits * 0.35))) {
        return LYRICS_TYPES.WORD;
    }
    return LYRICS_TYPES.CHARACTER;
}

export function applyKaraokeGranularity(result, forcedGranularity = '') {
    if (!result || typeof result !== 'object' || !hasLyricsContent(result.karaoke)) {
        return result;
    }
    const granularity = normalizeKaraokeGranularity(forcedGranularity)
        || inferKaraokeGranularity(result);
    const karaoke = result.karaoke.map(line => (
        line && typeof line === 'object' && line.karaokeGranularity !== granularity
            ? { ...line, karaokeGranularity: granularity }
            : line
    ));
    return {
        ...result,
        karaoke,
        karaokeGranularity: granularity
    };
}

// Applies the user's lyrics-type permissions to a fully-processed provider
// result and derives the has*/granularity flags. Pure: reads `result` and
// the allow flags, returns a fresh `finalResult` (never mutates `result`).
// `isPseudoKaraoke` is passed in so this stays free of the manager instance.
export function filterProviderCandidateResult(result, allow, isPseudoKaraokeFn) {
    const { allowKaraoke, allowCharacter, allowWord, allowSynced, allowUnsynced } = allow;

    const finalResult = { ...result };
    if (finalResult.syncDataApplied) {
        finalResult.syncDataRendererVersion = SYNC_DATA_RENDERER_VERSION;
    }
    const finalKaraokeGranularity = hasLyricsContent(finalResult.karaoke)
        ? inferKaraokeGranularity(finalResult)
        : '';
    const karaokeGranularityAllowed = finalKaraokeGranularity === LYRICS_TYPES.CHARACTER
        ? allowCharacter
        : finalKaraokeGranularity === LYRICS_TYPES.WORD
            ? allowWord
            : false;
    if (!allowKaraoke || !karaokeGranularityAllowed) {
        finalResult.karaoke = null;
        finalResult.karaokeGranularity = null;
    }
    if (!allowSynced) finalResult.synced = null;
    if (!allowUnsynced) finalResult.unsynced = null;

    const hasKaraoke = hasLyricsContent(finalResult.karaoke);
    const hasCharacterKaraoke = hasKaraoke
        && finalKaraokeGranularity === LYRICS_TYPES.CHARACTER;
    const hasWordKaraoke = hasKaraoke
        && finalKaraokeGranularity === LYRICS_TYPES.WORD;
    const hasSynced = hasLyricsContent(finalResult.synced);
    const hasUnsynced = hasLyricsContent(finalResult.unsynced);
    const isPseudoKaraoke = hasKaraoke && isPseudoKaraokeFn(finalResult);

    return {
        finalResult,
        finalKaraokeGranularity,
        hasKaraoke,
        hasCharacterKaraoke,
        hasWordKaraoke,
        hasSynced,
        hasUnsynced,
        isPseudoKaraoke
    };
}
