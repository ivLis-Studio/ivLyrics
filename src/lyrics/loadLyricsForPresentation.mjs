// A caller may retry with the same inputs if it still owns the current view.
// Callers that must reread inputs restart from their presentation entry point.
export async function loadLyricsForPresentation(service, info, mode, providerOverride, shouldRetry = () => false) {
    do {
        const revision = service.getLyricsRequestRevision?.(info.uri);
        const revisionMatches = () => revision === service.getLyricsRequestRevision?.(info.uri);
        try {
            const result = await service.getLyricsFromProviders(info, [], mode, providerOverride);
            if (!revisionMatches()) continue;
            const validResult = result && (!result.uri || result.uri === info.uri);
            return {
                revision,
                result: validResult
                    ? (result.uri ? result : { ...result, uri: info.uri })
                    : { uri: info.uri, error: 'No lyrics found' },
            };
        } catch (error) {
            if (revisionMatches()) throw error;
        }
    } while (shouldRetry());
    return null;
}
