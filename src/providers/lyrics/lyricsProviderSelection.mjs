import { LYRICS_TYPES, KARAOKE_GRANULARITIES, getDeclaredKaraokeGranularities } from "./lyricsProviderTypes.mjs";
import { getLyricsAddonIdForSyncProvider } from "./syncDataProviderPriority.mjs";

const PSEUDO_KARAOKE_SOURCES = new Set([
    'audio-analysis-pseudo',
    'spotify-audio-analysis',
    'line-timing-pseudo'
]);

export function getProviderTypeSettings(provider, getAddonSetting) {
    const legacyKaraoke = getAddonSetting(provider.id, 'enable_karaoke', null);
    const karaokeFallback = legacyKaraoke === null || legacyKaraoke === undefined
        ? true
        : legacyKaraoke !== false;
    const declaredGranularities = getDeclaredKaraokeGranularities(provider);
    const hasNativeCharacterLyrics = declaredGranularities.has(LYRICS_TYPES.CHARACTER)
        || (declaredGranularities.size === 0 && provider?.supports?.karaoke === true);
    return {
        [LYRICS_TYPES.CHARACTER]: hasNativeCharacterLyrics
            ? getAddonSetting(provider.id, 'enable_character', karaokeFallback) !== false
            : true,
        [LYRICS_TYPES.WORD]: getAddonSetting(
            provider.id,
            'enable_word',
            karaokeFallback
        ) !== false,
        [LYRICS_TYPES.SYNCED]: getAddonSetting(provider.id, 'enable_synced', true) !== false,
        [LYRICS_TYPES.UNSYNCED]: getAddonSetting(provider.id, 'enable_unsynced', true) !== false
    };
}

export function canProviderParticipateInType(provider, lyricsType, typeSettings, syncDataProviderIds) {
    if (!typeSettings?.[lyricsType]) return false;

    if (KARAOKE_GRANULARITIES.has(lyricsType)) {
        const addonId = getLyricsAddonIdForSyncProvider(provider?.id);
        const hasKnownSyncData = syncDataProviderIds instanceof Set
            && syncDataProviderIds.has(addonId);
        if (lyricsType === LYRICS_TYPES.CHARACTER && hasKnownSyncData) {
            return true;
        }
        const declaredGranularities = getDeclaredKaraokeGranularities(provider);
        return declaredGranularities.size > 0
            ? declaredGranularities.has(lyricsType)
            : provider?.supports?.karaoke === true;
    }

    return provider?.supports?.[lyricsType] === true;
}

export function isPseudoKaraoke(result, readPseudoKaraoke) {
    const source = result?.karaokeSource;
    if (!source) return false;
    return readPseudoKaraoke?.()?.isPseudoSource?.(source) === true
        || PSEUDO_KARAOKE_SOURCES.has(source);
}

export function selectProviderCandidateForType(candidate, lyricsType) {
    if (!candidate) return null;

    if (lyricsType === LYRICS_TYPES.CHARACTER) {
        return candidate.hasCharacterKaraoke && !candidate.isPseudoKaraoke
            ? { ...candidate.result }
            : null;
    }

    if (lyricsType === LYRICS_TYPES.WORD) {
        return candidate.hasWordKaraoke && !candidate.isPseudoKaraoke
            ? { ...candidate.result }
            : null;
    }

    if (lyricsType === LYRICS_TYPES.SYNCED) {
        const hasSyncedGradeResult = candidate.hasSynced
            || (candidate.hasKaraoke && candidate.isPseudoKaraoke);
        if (!hasSyncedGradeResult) return null;
        const result = { ...candidate.result };
        if (candidate.hasKaraoke && !candidate.isPseudoKaraoke) {
            result.karaoke = null;
            result.karaokeSource = null;
        }
        return result;
    }

    if (lyricsType === LYRICS_TYPES.UNSYNCED && candidate.hasUnsynced) {
        return {
            ...candidate.result,
            karaoke: null,
            karaokeSource: null,
            synced: null
        };
    }

    return null;
}

export function getProviderCandidateType(candidate) {
    if (candidate.hasCharacterKaraoke) return LYRICS_TYPES.CHARACTER;
    if (candidate.hasWordKaraoke) return LYRICS_TYPES.WORD;
    if (candidate.hasSynced) return LYRICS_TYPES.SYNCED;
    if (candidate.hasUnsynced) return LYRICS_TYPES.UNSYNCED;
    return null;
}
