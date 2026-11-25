// Keep client identity and version headers consistent between playback and prefetch.
export function createYouTubeVideoLookupRequest({ trackIsrc, trackId, spotifyData, clientVersion, shouldBypassCache }) {
    const youtubeApiUrl = new URL('https://ivlis.kr/ivLyrics/openvideo/youtube');
    youtubeApiUrl.searchParams.set('isrc', trackIsrc);
    youtubeApiUrl.searchParams.set('trackId', trackId);
    youtubeApiUrl.searchParams.set('useCommunity', 'true');
    youtubeApiUrl.searchParams.set('client', 'ivLyrics');
    youtubeApiUrl.searchParams.set('clientVersion', clientVersion);
    youtubeApiUrl.searchParams.set('requestVersion', '2');

    if (spotifyData?.name) {
        youtubeApiUrl.searchParams.set('trackName', spotifyData.name);
        if (spotifyData.artists?.length) {
            youtubeApiUrl.searchParams.set('trackArtists', spotifyData.artists.join(', '));
        }
        if (spotifyData.album || spotifyData.albumName) {
            youtubeApiUrl.searchParams.set('album', spotifyData.album || spotifyData.albumName);
        }
    }
    if (shouldBypassCache?.(trackIsrc)) {
        youtubeApiUrl.searchParams.set('bypassCache', '1');
    }
    return {
        url: youtubeApiUrl.toString(),
        headers: {
            "X-ivLyrics-Client": "ivLyrics",
            "X-ivLyrics-Request-Version": "2",
            "X-ivLyrics-Client-Version": clientVersion,
        },
    };
}

export function createYouTubeVideoLookup(request) {
    const pending = new Map();

    return function fetchVideoLookup(url, { headers, signal, cacheRevision = 0 } = {}) {
        if (signal?.aborted) return Promise.reject(signal.reason);

        // A fresh lookup must not join a request that was sent before a clear.
        const key = JSON.stringify([url, cacheRevision]);
        let lookup = pending.get(key);
        if (!lookup) {
            const controller = new AbortController();
            lookup = { controller, consumers: 0, promise: null };
            lookup.promise = Promise.resolve().then(async () => {
                controller.signal.throwIfAborted();
                const response = await request(url, { cache: "no-store", headers, signal: controller.signal });
                return {
                    data: await response.json(),
                    isDecoy: response.headers?.get("X-ivLyrics-Decoy") === "1",
                };
            }).finally(() => {
                if (pending.get(key) === lookup) pending.delete(key);
            });
            pending.set(key, lookup);
        }

        lookup.consumers++;
        return new Promise((resolve, reject) => {
            let listening = true;
            const release = () => {
                if (!listening) return false;
                listening = false;
                signal?.removeEventListener("abort", onAbort);
                lookup.consumers--;
                if (lookup.consumers === 0 && pending.get(key) === lookup) {
                    pending.delete(key);
                    lookup.controller.abort();
                }
                return true;
            };
            const onAbort = () => {
                if (release()) reject(signal.reason);
            };
            signal?.addEventListener("abort", onAbort, { once: true });
            lookup.promise.then(value => {
                if (release()) resolve(value);
            }, error => {
                if (release()) reject(error);
            });
        });
    };
}
