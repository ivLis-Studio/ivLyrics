import {
    LRCLIB_PROVIDER_ID, buildLrclibSyncSource, getCandidateSyncLineMatch,
    getComparableCandidateText, getComparableLyricsLines, getLineCharCounts,
    getLyricsTextFingerprint, getSyncDataLrclibId, hasExactLineCharCountMatch,
} from "./lrclibSourceMatching.mjs";
import {
    LRCLIB_ARTIST_MATCH_THRESHOLD, LRCLIB_DURATION_TOLERANCE_SEC,
    LRCLIB_FALLBACK_TITLE_MATCH_THRESHOLD,
} from "./createLrclibSearch.mjs";
import { parseLyricsfileKaraoke } from "./lrclibLyricsfile.mjs";

function parsePlainLyrics(plainLyrics) {
    if (!plainLyrics || typeof plainLyrics !== 'string') return null;

    const lines = plainLyrics
        .split('\n')
        .map(line => ({ text: line.trim() }))
        .filter(line => line.text);

    return lines.length > 0 ? lines : null;
}

// Accept either decimal separator and include untagged text in the plain result.
function parseLRC(lrc) {
    if (!lrc || typeof lrc !== 'string') return { synced: null, unsynced: [] };

    const synced = [];
    const unsynced = [];

    for (const line of lrc.split('\n')) {
        const match = line.match(/\[(\d+):(\d+)(?:[.,](\d+))?\](.*)/);

        if (match) {
            const minutes = parseInt(match[1], 10);
            const seconds = parseInt(match[2], 10);
            const fraction = match[3] ? parseFloat('0.' + match[3]) : 0;
            const startTime = Math.floor((minutes * 60 + seconds + fraction) * 1000);
            const text = match[4].trim();

            synced.push({ startTime, text });
            unsynced.push({ text });
        } else if (line.trim() && !line.startsWith('[')) {
            unsynced.push({ text: line.trim() });
        }
    }

    return { synced: synced.length > 0 ? synced : null, unsynced };
}

export function createLrclibResults({ matcher, parseTrackMetadata, debug }) {
    const { getTitleScore, getBestArtistScore, splitArtists, hasExactDurationMatch } = matcher;

    function applyLyricsfileKaraokeToResult(result, candidate) {
        if (!result || !candidate?.lyricsfile) return false;

        const fallbackDurationMs = Number.isFinite(Number(candidate.duration))
            ? Math.max(0, Math.round(Number(candidate.duration) * 1000))
            : 0;
        const karaoke = parseLyricsfileKaraoke(candidate.lyricsfile, fallbackDurationMs, error => {
            debug(`[LR-DEBUG] Ignoring invalid Lyricsfile: ${error?.message || error}`);
        });
        if (!Array.isArray(karaoke) || karaoke.length === 0) return false;

        // Lyricsfile은 karaoke 표현만 보강합니다. 기존 sync-data의 줄 매칭 기준인
        // syncedLyrics/plainLyrics 결과를 이 데이터로 교체하면 안 됩니다.
        result.karaoke = karaoke;
        result.karaokeSource = 'lrclib-lyricsfile';
        result.karaokeGranularity = 'word';
        return true;
    }

    function applyCandidateLyricsToResult(result, candidate) {
        if (!result || !candidate) return false;

        if (candidate.id !== undefined && candidate.id !== null && String(candidate.id).trim()) {
            result.lrclibId = String(candidate.id).trim();
        }
        const syncSource = buildLrclibSyncSource(candidate);
        if (syncSource) {
            result.lrclibSource = syncSource;
        }

        if (candidate.instrumental) {
            result.synced = [{ startTime: 0, text: '♪ Instrumental ♪' }];
            result.unsynced = [{ text: '♪ Instrumental ♪' }];
            return true;
        }

        if (candidate.preferredLyricsSource === 'plain' && candidate.plainLyrics) {
            result.unsynced = parsePlainLyrics(candidate.plainLyrics);
        }
        else if (candidate.syncedLyrics) {
            const parsed = parseLRC(candidate.syncedLyrics);
            result.synced = parsed.synced;
            if (!result.unsynced) {
                result.unsynced = parsed.unsynced;
            }
        }
        else if (candidate.plainLyrics) {
            result.unsynced = parsePlainLyrics(candidate.plainLyrics);
        }

        if (!result.synced && candidate.plainLyrics && !result.unsynced) {
            result.unsynced = parsePlainLyrics(candidate.plainLyrics);
        }

        applyLyricsfileKaraokeToResult(result, candidate);

        return !!(result.karaoke || result.synced || result.unsynced);
    }

    function buildPlaybackOnlyResult(candidate, info, cacheVersion, apiSource, { syncDataSource = null, syncDataLineCharCounts = null } = {}) {
        if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
        if ((candidate.syncedLyrics != null && typeof candidate.syncedLyrics !== 'string')
            || (candidate.plainLyrics != null && typeof candidate.plainLyrics !== 'string')) return null;
        const { title, trackDurationSec, expectedArtists } = parseTrackMetadata(info);
        const sourceId = getSyncDataLrclibId(syncDataSource);
        const sourceCounts = syncDataSource?.lineCharCounts?.length ? syncDataSource.lineCharCounts : syncDataLineCharCounts;
        const lineMatch = getCandidateSyncLineMatch(candidate, sourceCounts);
        let preferredLyricsSource = syncDataSource?.preferredLyricsSource || lineMatch.preferredLyricsSource || candidate.preferredLyricsSource;
        if (syncDataSource?.lyricsFingerprint) {
            // Plain and timed lyrics can have different revisions in one row.
            // Find the version matching the saved source, not merely one with
            // equal character counts, before deciding to contact the next host.
            preferredLyricsSource = [...new Set([preferredLyricsSource, 'synced', 'plain'])].find(preference => {
                const text = getComparableCandidateText(candidate, preference);
                return getLyricsTextFingerprint(text) === syncDataSource.lyricsFingerprint
                    && (!sourceCounts?.length || hasExactLineCharCountMatch(sourceCounts, getLineCharCounts(getComparableLyricsLines(text))));
            }) || preferredLyricsSource;
        }
        const sourceTextMatches = !syncDataSource?.lyricsFingerprint
            || getLyricsTextFingerprint(getComparableCandidateText(candidate, preferredLyricsSource)) === syncDataSource.lyricsFingerprint;
        const sourceShapeMatches = !sourceCounts?.length || hasExactLineCharCountMatch(sourceCounts,
            getLineCharCounts(getComparableLyricsLines(getComparableCandidateText(candidate, preferredLyricsSource))));
        // A mirror's arbitrary ID is not an official identity. An already saved
        // canonical source can be reused only if its available content evidence
        // agrees; an ID alone never overrides a contradictory fingerprint.
        const sourceMatches = !!sourceId && sourceTextMatches && sourceShapeMatches
            && (String(candidate.id ?? '') === sourceId || !!syncDataSource?.lyricsFingerprint);
        if (sourceId && !sourceMatches) return null;
        const duration = Number(candidate.duration);
        if (!sourceMatches && (!Number.isFinite(duration) || duration <= 0 || Math.abs(duration - trackDurationSec) > LRCLIB_DURATION_TOLERANCE_SEC
            || getTitleScore(title, candidate.trackName || candidate.name || '') < LRCLIB_FALLBACK_TITLE_MATCH_THRESHOLD
            || (getBestArtistScore(expectedArtists, splitArtists(candidate.artistName)) <= LRCLIB_ARTIST_MATCH_THRESHOLD
                && !(candidate.titleDrivenMatch && hasExactDurationMatch(trackDurationSec, duration))))) return null;
        const parsedSynced = candidate.syncedLyrics ? parseLRC(candidate.syncedLyrics) : null;
        const playbackCandidate = { ...candidate, id: undefined, instrumental: candidate.instrumental === true,
            syncedLyrics: parsedSynced?.synced?.some(line => String(line?.text || '').trim()) ? candidate.syncedLyrics : null };
        const result = { uri: info.uri, provider: LRCLIB_PROVIDER_ID, cacheVersion, lrclibApiSource: apiSource,
            karaoke: null, synced: null, unsynced: null, copyright: null, error: null };
        // A local/mirror record is for playback, not an official editor source.
        applyCandidateLyricsToResult(result, { ...playbackCandidate, preferredLyricsSource });
        if (sourceMatches) {
            result.lrclibId = sourceId;
            result.lrclibSource = { ...syncDataSource };
        }
        return [result.karaoke, result.synced, result.unsynced]
            .some(lines => Array.isArray(lines) && lines.some(line => String(line?.text || '').trim())) ? result : null;
    }

    return { applyCandidateLyricsToResult, buildPlaybackOnlyResult };
}
