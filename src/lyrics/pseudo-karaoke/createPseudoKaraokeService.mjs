import { buildPseudoKaraokeLine, buildLineTimingPseudoKaraokeLine } from "./lyricAlignment.mjs";

export function createPseudoKaraokeService({ getSetting, getAudioDataFetcher, extractTrackId, getPlaybackDuration, debug }) {
    const SETTING_KEY = 'ivLyrics:visual:spotify-fake-karaoke-enabled';
    const CACHE_VERSION_BASE = 'pseudo-karaoke-v11';
    const LINE_TIMING_PSEUDO_SOURCE = 'line-timing-pseudo';
    const analysisCache = new Map();
    const inflightAnalysis = new Map();
    const PSEUDO_SOURCES = new Set([
        'audio-analysis-pseudo',
        'spotify-audio-analysis',
        LINE_TIMING_PSEUDO_SOURCE
    ]);

    function parseMs(value) {
        if (typeof value === 'number' && Number.isFinite(value)) return value;
        const parsed = parseInt(value, 10);
        return Number.isFinite(parsed) ? parsed : null;
    }

    function isEnabled() {
        try {
            return getSetting(SETTING_KEY) === 'true';
        } catch (error) {
            return false;
        }
    }

    function getCacheVersion() {
        return `${CACHE_VERSION_BASE}:${isEnabled() ? 'on' : 'off'}`;
    }

    function clearPseudoKaraoke(result) {
        if (!result || !PSEUDO_SOURCES.has(result.karaokeSource)) return result;
        result.karaoke = null;
        delete result.karaokeSource;
        delete result.pseudoKaraokeCacheVersion;
        return result;
    }

    async function loadAudioAnalysis(trackId) {
        try {
            const fetchAudioData = getAudioDataFetcher();
            if (!fetchAudioData) return null;
            const analysis = await fetchAudioData(`spotify:track:${trackId}`);
            analysisCache.set(trackId, analysis);
            return analysis;
        } catch (error) {
            debug('[PseudoKaraokeService] Audio analysis fetch failed', error);
            return null;
        }
    }

    function getAudioAnalysis(trackId) {
        if (analysisCache.has(trackId)) return analysisCache.get(trackId);
        if (inflightAnalysis.has(trackId)) return inflightAnalysis.get(trackId);

        const request = loadAudioAnalysis(trackId).finally(() => {
            inflightAnalysis.delete(trackId);
        });
        inflightAnalysis.set(trackId, request);
        return request;
    }

    function normalizeSyncedLines(lines, fallbackDurationMs) {
        if (!Array.isArray(lines)) return [];

        return lines
            .map((line, index) => {
                const startTime = parseMs(line?.startTime);
                if (startTime === null) return null;

                const directEnd = parseMs(line?.endTime);
                const nextStart = parseMs(lines[index + 1]?.startTime);
                const endTime = directEnd && directEnd > startTime
                    ? directEnd
                    : (nextStart && nextStart > startTime
                        ? nextStart
                        : (Number.isFinite(fallbackDurationMs) && fallbackDurationMs > startTime ? fallbackDurationMs : startTime + 4000));

                return {
                    startTime,
                    endTime,
                    text: line?.text || ''
                };
            })
            .filter(Boolean);
    }

    async function applyToResult(result, info = {}) {
        if (!result) return result;

        if (!isEnabled()) {
            return clearPseudoKaraoke(result);
        }

        if (result.karaoke && !PSEUDO_SOURCES.has(result.karaokeSource)) {
            return result;
        }

        const trackUri = result.uri || info?.uri || '';
        const trackId = extractTrackId(trackUri);
        const fallbackDurationMs = Number.isFinite(info?.duration)
            ? info.duration
            : parseMs(getPlaybackDuration());
        const baseLyrics = normalizeSyncedLines(result.synced, fallbackDurationMs);

        if (!baseLyrics.length) {
            return clearPseudoKaraoke(result);
        }

        if (
            result.karaoke &&
            PSEUDO_SOURCES.has(result.karaokeSource) &&
            result.pseudoKaraokeCacheVersion === getCacheVersion() &&
            (result.karaokeSource !== LINE_TIMING_PSEUDO_SOURCE || !trackId)
        ) {
            return result;
        }

        const analysis = trackId ? await getAudioAnalysis(trackId) : null;
        const karaoke = baseLyrics
            .map((line) => analysis
                ? buildPseudoKaraokeLine(line, analysis)
                : buildLineTimingPseudoKaraokeLine(line))
            .filter(Boolean);
        if (!karaoke.length) {
            return clearPseudoKaraoke(result);
        }

        result.karaoke = karaoke;
        result.karaokeSource = analysis ? 'audio-analysis-pseudo' : LINE_TIMING_PSEUDO_SOURCE;
        result.pseudoKaraokeCacheVersion = getCacheVersion();
        return result;
    }

    return {
        isEnabled,
        isPseudoSource: (source) => PSEUDO_SOURCES.has(source),
        getCacheVersion,
        applyToResult,
        clearPseudoKaraoke
    };
}
