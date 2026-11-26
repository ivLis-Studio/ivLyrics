import {
    getLyricDisplayModes, getLyricLanguageMode, matchesLyricPresentation, resolveLyricSourceLanguage,
} from "./lyricPresentationIdentity.mjs";
import { loadLyricsForPresentation } from "./loadLyricsForPresentation.mjs";
import { hasLyricsRows } from "./selectPlaybackLyrics.mjs";
import { readPageLyricsSource, writePageLyricsSource } from "./pageLyricsSourceCache.mjs";
import { retainLrcRedWordTiming } from "../providers/lyrics/lrcRedWordTiming.mjs";

function canReuseRawSnapshot(snapshot, uri, override, isCacheCurrent) {
    const raw = snapshot?.rawResult;
    if (!hasLyricsRows(raw) || (raw.uri && raw.uri !== uri) || (snapshot.trackUri && snapshot.trackUri !== uri)) return false;
    const provider = raw.provider || snapshot.provider || null;
    if (override ? provider !== override : snapshot.trackLyricsProviderOverride) return false;
    return isCacheCurrent({ ...raw, trackLyricsProviderOverride: override || null });
}

export function getPageLyricsSnapshotDisplay({
    snapshot, displayLyrics, lyrics, modeKey, visual, trackLanguageOverride,
    detectLanguage, getTargetLanguage, getPronunciationNotation, getTranslationStyle, getSourceText,
}) {
    if (!displayLyrics || snapshot?.presentationComplete !== true || snapshot.lyricsType !== modeKey) return null;

    const language = resolveLyricSourceLanguage(
        trackLanguageOverride, visual["translate:detect-language-override"], () => detectLanguage(lyrics || [])
    );
    const [displayMode1, displayMode2] = getLyricDisplayModes(visual, getLyricLanguageMode(language));
    return matchesLyricPresentation(snapshot, {
        lyricsType: modeKey, displayMode1, displayMode2, detectedLanguage: language,
        getTargetLanguage, getPronunciationNotation, getTranslationStyle,
        getSourceText: () => getSourceText(lyrics || []),
    }) ? displayLyrics : null;
}

export function createPageLyricsDataLoader({
    cache, getLyricsService, getPseudoKaraoke, getMarketplaceReady,
    isCacheCurrent, getDataMode, getModeKey,
}) {
    const inFlight = new Map();

    function cancelForUri(uri) {
        const controller = inFlight.get(uri);
        inFlight.delete(uri);
        controller?.abort();
    }

    function begin(uri) {
        cancelForUri(uri);
        const controller = new AbortController();
        const { signal } = controller;
        inFlight.set(uri, controller);

        return {
            close() {
                if (inFlight.get(uri) === controller) inFlight.delete(uri);
            },
            async read({
                info, mode, refresh, hasSpotifyTrackId, sharedSnapshot, providerOverride,
                lyricsSaved, getSavedLocalLyrics, isCurrent, onTrackPrepared, onProviderLoad,
            }) {
                const canContinue = () => !signal.aborted && isCurrent();
                if (!canContinue()) return null;
                const readRevision = () => getLyricsService()?.getLyricsRequestRevision?.(uri);
                const cachedProvider = readPageLyricsSource(cache, uri, readRevision())?.trackLyricsProviderOverride || null;
                if (refresh || (hasSpotifyTrackId && cachedProvider !== (providerOverride || null))) {
                    delete cache[uri];
                }

                let isCached = lyricsSaved(uri);
                if (!hasSpotifyTrackId) {
                    const saved = getSavedLocalLyrics(uri);
                    if (saved) {
                        const localResult = { ...saved, provider: "local", uri, trackLyricsProviderOverride: null };
                        const pseudoKaraoke = getPseudoKaraoke();
                        if (pseudoKaraoke?.applyToResult) await pseudoKaraoke.applyToResult(localResult, info);
                        if (!signal.aborted) cache[uri] = localResult;
                        isCached = true;
                    }
                }
                if (!canContinue()) return null;
                onTrackPrepared();
                if (!canContinue()) return null;

                const cacheRevision = readRevision();
                const reusable = !refresh && sharedSnapshot && getLyricsService()?.getLyricsSnapshot?.(uri) === sharedSnapshot
                    && canReuseRawSnapshot(sharedSnapshot, uri, providerOverride, isCacheCurrent);
                if (reusable) {
                    writePageLyricsSource(cache, uri, {
                        ...sharedSnapshot.rawResult,
                        uri,
                        trackLyricsProviderOverride: providerOverride || null,
                    }, cacheRevision);
                }
                const candidate = readPageLyricsSource(cache, uri, cacheRevision);
                if (candidate && !isCacheCurrent(candidate)) delete cache[uri];

                const cached = cache[uri];
                if (cached && (mode === -1 || cached[getModeKey(mode)])) {
                    return { result: cached, providerRevision: cacheRevision, fromCache: true, isCached, reusesSharedSnapshot: reusable };
                }

                onProviderLoad();
                if (!canContinue()) return null;
                const ready = getMarketplaceReady();
                if (ready) {
                    await ready;
                    if (!canContinue()) return null;
                }
                const service = getLyricsService();
                const lookup = await loadLyricsForPresentation(
                    service, info, getDataMode(mode), providerOverride,
                    { shouldRetry: canContinue, signal },
                );
                if (!lookup) return null;
                const { result: response, revision: providerRevision } = lookup;
                const revisionMatches = providerRevision === readRevision();
                const result = revisionMatches
                    ? retainLrcRedWordTiming(response, service.getLyricsSnapshot?.(uri)?.rawResult)
                    : response;
                // A superseded request for a different song may warm its own
                // cache. An earlier request for this URI cannot replace it.
                if (result.provider && !result.error && !signal.aborted && revisionMatches) {
                    writePageLyricsSource(cache, uri, { ...result, trackLyricsProviderOverride: providerOverride || null }, providerRevision);
                }

                if (!canContinue()) return null;
                isCached = lyricsSaved(response.uri);
                return { result, providerRevision, fromCache: false, isCached, reusesSharedSnapshot: reusable && revisionMatches };
            },
        };
    }

    function cancelPending() {
        const retired = [...inFlight.values()];
        inFlight.clear();
        for (const controller of retired) controller.abort();
    }

    return { begin, cancelForUri, cancelPending };
}
