import { hasLyricsRows } from "./selectPlaybackLyrics.mjs";

export function readReusableLyricSource(snapshot, uri, providerOverride) {
    const raw = snapshot?.rawResult;
    if (!hasLyricsRows(raw) || raw.error || (raw.uri && raw.uri !== uri)
        || (snapshot.trackUri && snapshot.trackUri !== uri)) return null;
    if (providerOverride ? (raw.provider || snapshot.provider) !== providerOverride : snapshot.trackLyricsProviderOverride) {
        return null;
    }
    return raw;
}

// A caller may retry with the same inputs if it still owns the current view.
// Callers that must reread inputs restart from their presentation entry point.
export async function loadLyricsForPresentation(service, info, mode, providerOverride, { shouldRetry = () => false, signal } = {}) {
    do {
        if (signal?.aborted) return null;
        const revision = service.getLyricsRequestRevision?.(info.uri);
        const revisionMatches = () => revision === service.getLyricsRequestRevision?.(info.uri);
        try {
            const result = await service.getLyricsFromProviders(info, [], mode, providerOverride, { signal });
            if (signal?.aborted) return null;
            if (!revisionMatches()) continue;
            const validResult = result && (!result.uri || result.uri === info.uri);
            return {
                revision,
                result: validResult
                    ? (result.uri ? result : { ...result, uri: info.uri })
                    : { uri: info.uri, error: 'No lyrics found' },
            };
        } catch (error) {
            if (signal?.aborted) return null;
            if (revisionMatches()) throw error;
        }
    } while (shouldRetry());
    return null;
}
