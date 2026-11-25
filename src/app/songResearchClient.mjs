import { asText } from "./researchText.mjs";
import { getLocalTrackUriFromCacheId, trackIdentity } from "../core/trackIdentity.mjs";
import { runWithAiRequestSignal, supersededAiRequest } from "../providers/ai/aiRequestCancellation.mjs";

export function createSongResearchClient({ spicetify: Spicetify, config: CONFIG, i18n: I18n, getLyricsService, getAiManager }) {
    const researchCache = new Map();
    const cacheRevisions = new Map();
    const researchInFlight = new Map();
    const MAX_RESEARCH_CACHE_ENTRIES = 100;

    const getCachedResearch = (key, revision) => {
        if (!researchCache.has(key)) return null;
        if (cacheRevisions.get(key) !== revision) {
            researchCache.delete(key);
            cacheRevisions.delete(key);
            return null;
        }
        const value = researchCache.get(key);
        researchCache.delete(key);
        researchCache.set(key, value);
        return value;
    };

    const cacheResearch = (key, value, revision) => {
        researchCache.delete(key);
        researchCache.set(key, value);
        cacheRevisions.set(key, revision);
        while (researchCache.size > MAX_RESEARCH_CACHE_ENTRIES) {
            const oldestKey = researchCache.keys().next().value;
            researchCache.delete(oldestKey);
            cacheRevisions.delete(oldestKey);
        }
    };

    function notifySubscriber(subscriber, partial, details) {
        try {
            subscriber.onProgress?.(partial, details);
        } catch (error) {
            console.warn("[SongResearch] Progress listener failed:", error);
        }
    }

    function retireRequest(key, request) {
        if (researchInFlight.get(key) !== request) return;
        researchInFlight.delete(key);
        request.controller.abort(supersededAiRequest());
    }

    async function subscribeToResearchRequest(key, request, { onProgress, signal }) {
        const subscriber = { onProgress };
        request.subscribers.add(subscriber);
        const unsubscribe = () => {
            request.subscribers.delete(subscriber);
            if (!request.subscribers.size) retireRequest(key, request);
        };
        signal?.addEventListener("abort", unsubscribe, { once: true });
        if (signal?.aborted) unsubscribe();
        try {
            if (!signal?.aborted && request.hasProgress) {
                notifySubscriber(subscriber, request.latestProgress, request.latestDetails);
            }
            return await runWithAiRequestSignal(signal, () => request.promise);
        } catch (error) {
            if (signal?.aborted) return null;
            throw error;
        } finally {
            signal?.removeEventListener("abort", unsubscribe);
            unsubscribe();
        }
    }

    const publishResearchProgress = (entry, partial, details = {}) => {
        entry.hasProgress = true;
        entry.latestProgress = partial;
        entry.latestDetails = details;
        for (const subscriber of [...entry.subscribers]) {
            if (entry.subscribers.has(subscriber)) notifySubscriber(subscriber, partial, details);
        }
    };

    const getTrackContext = (trackId, context, playerItem, lyricsService) => {
        const trackUri = getLocalTrackUriFromCacheId(trackId) || (trackId ? `spotify:track:${trackId}` : "");
        const item = playerItem && trackUri && playerItem.uri === trackUri ? playerItem : {};
        const metadata = item.metadata || {};
        const snapshot = trackUri ? lyricsService?.getLyricsSnapshot?.(trackUri) : null;
        const track = snapshot?.trackInfo;
        const snapshotLyrics = snapshot?.currentLyrics
            || snapshot?.displayLyrics
            || snapshot?.synced
            || snapshot?.karaoke
            || snapshot?.rawResult?.synced
            || snapshot?.rawResult?.karaoke
            || snapshot?.rawResult?.unsynced
            || [];
        const artists = Array.isArray(item.artists)
            ? item.artists.map((artist) => artist?.name).filter(Boolean).join(", ")
            : "";
        return {
            trackId,
            title: asText(context.title || item.name || metadata.title || track?.title),
            artist: asText(context.artist || artists || metadata.artist_name || track?.artist),
            album: asText(context.album || item.album?.name || metadata.album_title || track?.album),
            releaseDate: asText(context.releaseDate || metadata.release_date || metadata.album_release_date || track?.releaseDate),
            isrc: asText(context.isrc || metadata.isrc || track?.isrc),
            spotifyUrl: asText(context.spotifyUrl || (trackIdentity.isSpotifyTrackId(trackId) ? `https://open.spotify.com/track/${trackId}` : "")),
            lyrics: Array.isArray(context.lyrics) && context.lyrics.length > 0
                ? context.lyrics
                : (Array.isArray(snapshotLyrics) ? snapshotLyrics : [])
        };
    };

    async function fetchResearch(trackId, regenerate = false, context = {}) {
        if (context.signal?.aborted) return null;
        const configuredTargetLang = CONFIG.visual["translate:target-language"];
        const lang = configuredTargetLang && configuredTargetLang !== "auto"
            ? configuredTargetLang
            : (I18n?.getCurrentLanguage?.() || CONFIG.visual.language || Spicetify.Locale?.getLocale()?.split("-")[0] || "en");
        const schema = getAiManager()?.RESEARCH_CACHE_VERSION || "research-v7";
        const cacheKey = `${schema}:${trackId}:${lang || "auto"}`;
        const readRevision = () => getLyricsService()?.getCacheRevision?.(trackId);
        const revision = readRevision();

        const activeRequest = researchInFlight.get(cacheKey);
        if (activeRequest && activeRequest.revision === revision) {
            return subscribeToResearchRequest(cacheKey, activeRequest, context);
        }
        if (activeRequest) retireRequest(cacheKey, activeRequest);

        if (!regenerate) {
            const cached = getCachedResearch(cacheKey, revision);
            if (cached) return cached;
        }

        const request = {
            revision,
            subscribers: new Set(),
            controller: new AbortController(),
            latestProgress: null,
            latestDetails: {},
            hasProgress: false,
            promise: null
        };
        const { signal } = request.controller;
        const isCurrent = () => !signal.aborted && readRevision() === revision && researchInFlight.get(cacheKey) === request;
        const trackContext = getTrackContext(trackId, context, Spicetify.Player.data?.item, getLyricsService());
        request.promise = runWithAiRequestSignal(signal, async () => {
            if (!isCurrent()) return null;
            const lyricsService = getLyricsService();
            if (!lyricsService?.getResearch && !lyricsService?.getTMI) {
                return { error: true, message: "LyricsService.getResearch is not available." };
            }
            const input = {
                ...trackContext,
                lang,
                ignoreCache: regenerate,
                signal,
                onProgress: (partial, details = {}) => {
                    if (isCurrent()) publishResearchProgress(request, partial, details);
                },
            };
            const result = lyricsService.getResearch
                ? await lyricsService.getResearch(input)
                : await lyricsService.getTMI(input);
            if (!isCurrent()) return null;
            if (!result) return { error: true, message: "Research data is unavailable." };
            const manager = getAiManager();
            const normalized = manager?.normalizeResearchResult
                ? manager.normalizeResearchResult(result, input) : result;
            if (!isCurrent()) return null;
            cacheResearch(cacheKey, normalized, revision);
            return normalized;
        }).catch(error => {
            if (!isCurrent()) return null;
            console.warn("[SongResearch] fetchResearch failed:", error);
            return { error: true, message: error.message || "Research generation failed" };
        }).finally(() => {
            if (researchInFlight.get(cacheKey) === request) researchInFlight.delete(cacheKey);
        });
        researchInFlight.set(cacheKey, request);
        return subscribeToResearchRequest(cacheKey, request, context);
    }

    return { fetchResearch, researchCache };
}
