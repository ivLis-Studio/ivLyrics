export function createSpotifyTrackMetadataLookup({ readSpicetify, fetchHost, debug }) {
    let legacyQueue = Promise.resolve();

    // Older Spicetify GraphQL wrappers do not expose the loader's request headers.
    // Serialize their temporary fetch override so two locales cannot overwrite each other.
    function requestLegacy(graphQLRequest, definition, uri, acceptLanguage) {
        const pending = legacyQueue.then(async () => {
            const originalFetch = fetchHost.fetch;
            if (typeof originalFetch !== 'function') return null;

            const localizedFetch = async (input, init = {}) => {
                const url = typeof input === 'string' ? input : input?.url || '';
                const body = typeof init?.body === 'string' ? init.body : '';
                if (!/graphql|pathfinder/i.test(url) || !/lookupEntity/.test(body)) {
                    return originalFetch(input, init);
                }
                const headers = new Headers(init?.headers || {});
                headers.set('accept-language', acceptLanguage);
                return originalFetch(input, { ...init, headers });
            };

            fetchHost.fetch = localizedFetch;
            try {
                return await graphQLRequest(definition, { uri });
            } finally {
                if (fetchHost.fetch === localizedFetch) fetchHost.fetch = originalFetch;
            }
        });
        legacyQueue = pending.catch(() => {});
        return pending;
    }

    return async function getTrackMetadata(uri, acceptLanguage) {
        if (!uri) return null;
        const spicetify = readSpicetify();
        const definition = spicetify?.GraphQL?.Definitions?.lookupEntity;
        const graphQLRequest = spicetify?.GraphQL?.Request;
        if (!definition || typeof graphQLRequest !== 'function') return null;

        try {
            // The loader's request builder stores header keys case-sensitively.
            // Match its default Accept-Language key to replace the client locale.
            const response = graphQLRequest === spicetify.Platform?.GraphQLLoader
                ? await graphQLRequest(definition, { uri }, {}, [{ key: 'Accept-Language', value: acceptLanguage }])
                : await requestLegacy(graphQLRequest, definition, uri, acceptLanguage);
            const track = response?.data?.lookup?.[0]?.data;
            if (track?.__typename !== 'Track') return null;
            return {
                title: track.name?.trim?.() || '',
                artist: track.artists?.items?.map(item => item?.profile?.name).filter(Boolean).join(', ') || '',
            };
        } catch (error) {
            debug(`[LR-DEBUG] 영어 메타데이터 조회 실패: ${error?.message || error}`);
            return null;
        }
    };
}
