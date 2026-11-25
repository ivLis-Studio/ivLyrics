import {
    readSpotifyResponseBody, readSpotifyResponseStatus, sendSpotifyPlatformRequest,
} from '../../core/spotifyPlatformRequest.mjs';
import { getSpotifyAccountKey } from '../../core/spotifyFields.mjs';

const HOST = 'https://spclient.wg.spotify.com/color-lyrics/v2';
const QUERY = { format: 'json', vocalRemoval: 'false', market: 'from_token' };
const NO_LYRICS = new Set([204, 404]);
const isClientError = status => status >= 400 && status < 500;

const requestError = (status, cause) =>
    Object.assign(new Error(`Spotify lyrics request failed (${status})`, { cause }), { status });

async function readLyricsResponse(response) {
    const status = readSpotifyResponseStatus(response);
    if (NO_LYRICS.has(status)) return null;
    if (status < 200 || status >= 300) throw requestError(status);
    return readSpotifyResponseBody(response);
}

export function createSpotifyLyricsTransport({
    readSpotify, setTimer, clearTimer, timeoutMs = 6000,
}) {
    const inFlight = new Map();

    async function fetchLyrics(operation) {
        let timer;
        try {
            const deadline = new Promise((_, reject) => {
                timer = setTimer(() => reject(requestError(408)), timeoutMs);
            });
            return await Promise.race([
                Promise.resolve().then(operation).then(readLyricsResponse),
                deadline,
            ]);
        } finally {
            if (timer != null) clearTimer(timer);
        }
    }

    async function readTrack(spotify, trackId) {
        const path = `/track/${trackId}`;
        let platformError;
        if (typeof spotify?.Platform?.RequestBuilder?.build === 'function') {
            try {
                return await fetchLyrics(() => sendSpotifyPlatformRequest(spotify.Platform, {
                    host: HOST, path, endpointIdentifier: '/track/{trackId}', queryParameters: { ...QUERY },
                }));
            } catch (error) {
                const status = readSpotifyResponseStatus(error, null);
                if (NO_LYRICS.has(status)) return null;
                if (isClientError(status)) throw requestError(status, error);
                platformError = error;
            }
        }
        if (typeof spotify?.CosmosAsync?.get === 'function') {
            const query = new URLSearchParams(QUERY);
            try {
                return await fetchLyrics(() => spotify.CosmosAsync.get(`${HOST}${path}?${query}`));
            } catch (error) {
                const status = readSpotifyResponseStatus(error, null);
                if (NO_LYRICS.has(status)) return null;
                if (status) throw requestError(status, error);
                throw error;
            }
        }
        throw platformError || new Error('Spotify lyrics request API unavailable');
    }

    return function requestSpotifyLyrics(trackId) {
        const spotify = readSpotify();
        const account = getSpotifyAccountKey(spotify);
        const key = `${account}:${trackId}`;
        const pending = inFlight.get(key);
        if (pending) return pending;
        const request = readTrack(spotify, trackId).finally(() => inFlight.delete(key));
        inFlight.set(key, request);
        return request;
    };
}
