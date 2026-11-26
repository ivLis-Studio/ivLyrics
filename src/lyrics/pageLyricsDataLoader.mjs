import { loadLyricsForPresentation, readReusableLyricSource } from "./loadLyricsForPresentation.mjs";
import { readPageLyricsSource, writePageLyricsSource } from "./pageLyricsSourceCache.mjs";
import { retainLrcRedWordTiming } from "../providers/lyrics/lrcRedWordTiming.mjs";

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
            signal,
            close() {
                if (inFlight.get(uri) === controller) inFlight.delete(uri);
            },
            async read({
                info, mode, refresh, hasSpotifyTrackId, sharedSnapshot, providerOverride,
                lyricsSaved, getSavedLocalLyrics, isCurrent, isSourceCurrent = () => true, onTrackPrepared, onProviderLoad,
            }) {
                const canUseSource = () => !signal.aborted && isSourceCurrent();
                const canContinue = () => canUseSource() && isCurrent();
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
                        if (canUseSource()) cache[uri] = localResult;
                        isCached = true;
                    }
                }
                if (!canContinue()) return null;
                onTrackPrepared();
                if (!canContinue()) return null;

                const cacheRevision = readRevision();
                const sharedRaw = !refresh && sharedSnapshot && getLyricsService()?.getLyricsSnapshot?.(uri) === sharedSnapshot
                    ? readReusableLyricSource(sharedSnapshot, uri, providerOverride) : null;
                const sharedSource = sharedRaw && { ...sharedRaw, uri, trackLyricsProviderOverride: providerOverride || null };
                const reusable = !!sharedSource && isCacheCurrent(sharedSource);
                if (reusable) writePageLyricsSource(cache, uri, sharedSource, cacheRevision);
                const candidate = readPageLyricsSource(cache, uri, cacheRevision);
                if (candidate && !isCacheCurrent(candidate)) delete cache[uri];

                const cached = cache[uri];
                if (cached && (mode === -1 || cached[getModeKey(mode)])) {
                    return { result: cached, isCached, reusesSharedSnapshot: reusable };
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
                    service, info, getDataMode(mode), providerOverride, { signal },
                );
                if (!lookup) return null;
                const { result: response, revision: providerRevision } = lookup;
                const revisionMatches = providerRevision === readRevision();
                const result = revisionMatches
                    ? retainLrcRedWordTiming(response, service.getLyricsSnapshot?.(uri)?.rawResult)
                    : response;
                // A superseded request for a different song may warm its own
                // cache. An earlier request for this URI cannot replace it.
                if (result.provider && !result.error && canUseSource() && revisionMatches) {
                    writePageLyricsSource(cache, uri, { ...result, trackLyricsProviderOverride: providerOverride || null }, providerRevision);
                }

                if (!canContinue()) return null;
                isCached = lyricsSaved(response.uri);
                return { result, isCached, reusesSharedSnapshot: reusable && revisionMatches };
            },
        };
    }

    function cancelPending() {
        const retired = [...inFlight.values()];
        inFlight.clear();
        for (const controller of retired) controller.abort();
    }

    return { begin, cancelForUri, cancelPending, hasPending: uri => inFlight.has(uri) };
}
