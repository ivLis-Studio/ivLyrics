import { firstNormalizedSyncDataIsrc, normalizeSyncDataTrackId } from "./syncDataIdentity.mjs";
import { getNonEmptyString, getSpotifyAccountKey } from "../core/spotifyFields.mjs";
import {
    readSpotifyResponseBody, readSpotifyResponseStatus, sendSpotifyPlatformRequest,
} from "../core/spotifyPlatformRequest.mjs";

export function createSpotifySyncDataMetadata({
    getPlatform, getUriApi, getCosmosApi, request, schedule = setTimeout, cancelScheduled = clearTimeout,
    readSpotifyAccountKey = () => getSpotifyAccountKey({ Platform: getPlatform?.() }),
    log, reportWarning,
}) {
    let profileRequest = null;

    function spotifyTrackIdToGid(trackId) {
        const normalizedTrackId = normalizeSyncDataTrackId(trackId);
        if (!normalizedTrackId) return '';

        try {
            const spotifyUriHelper = getUriApi();
            const idToHex = spotifyUriHelper?.idToHex;
            if (typeof idToHex === 'function') {
                const gid = idToHex(normalizedTrackId);
                if (typeof gid === 'string' && /^[a-f0-9]{32}$/i.test(gid)) {
                    return gid.toLowerCase();
                }
            }
        } catch (error) {
            log('resolveTrackIsrc:idToHex-failed', {
                trackId: normalizedTrackId,
                message: error?.message || String(error)
            }, 'warn');
        }

        const alphabet = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
        let value = 0n;
        for (const char of normalizedTrackId) {
            const digit = alphabet.indexOf(char);
            if (digit < 0) return '';
            value = value * 62n + BigInt(digit);
        }

        return value.toString(16).padStart(32, '0');
    }

    function getSpicetifySessionAccessToken() {
        const session = getPlatform()?.Session;
        const token = session?.accessToken || session?.access_token;
        return typeof token === 'string' ? token.replace(/^Bearer\s+/i, '').trim() : '';
    }

    function findIsrcFromSpclientMetadataBytes(bytes) {
        if (!bytes || typeof TextDecoder === 'undefined') return '';
        const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
        return firstNormalizedSyncDataIsrc(
            text.match(/isrc[\s\S]{0,20}([A-Z]{2}[A-Z0-9]{3}\d{7})/i)?.[1],
            text.match(/[A-Z]{2}[A-Z0-9]{3}\d{7}/)?.[0]
        );
    }

    function findIsrcFromSpclientMetadataJson(payload) {
        if (!payload || typeof payload !== 'object') return '';

        const candidates = [
            payload?.isrc,
            payload?.external_ids?.isrc,
            payload?.externalIds?.isrc,
            payload?.external_id?.isrc
        ];

        const externalIdEntries = [
            ...(Array.isArray(payload?.external_id) ? payload.external_id : []),
            ...(Array.isArray(payload?.external_ids) ? payload.external_ids : []),
            ...(Array.isArray(payload?.externalIds) ? payload.externalIds : [])
        ];

        for (const entry of externalIdEntries) {
            const type = typeof entry?.type === 'string' ? entry.type.toLowerCase() : '';
            if (type === 'isrc') {
                candidates.push(entry?.id, entry?.value);
            }
        }

        return firstNormalizedSyncDataIsrc(...candidates);
    }

    async function fetchSpclientTrackMetadataIsrcWithRequestBuilder(trackGid, trackIdForLog) {
        log('resolveTrackIsrc:metadata-request', {
            trackId: trackIdForLog,
            gid: trackGid,
            transport: 'platform-request-builder-json'
        });

        const response = await sendSpotifyPlatformRequest(getPlatform(), {
            host: 'https://spclient.wg.spotify.com/metadata/4',
            path: `/track/${trackGid}`,
            endpointIdentifier: '/track/{hexId}',
            queryParameters: { 'response-format': 'json' },
            withoutMarket: true,
        });
        const status = readSpotifyResponseStatus(response);
        const ok = status >= 200 && status < 300;
        const isrc = ok ? findIsrcFromSpclientMetadataJson(await readSpotifyResponseBody(response)) : '';

        log('resolveTrackIsrc:metadata-json-response', {
            trackId: trackIdForLog,
            gid: trackGid,
            status,
            isrc: isrc || null
        }, ok && isrc ? 'info' : 'warn');

        if (!ok) {
            throw new Error(`metadata request failed: ${status}`);
        }

        return isrc;
    }

    async function fetchSpclientTrackMetadataIsrcWithLegacyFetch(trackGid, trackIdForLog) {
        const token = getSpicetifySessionAccessToken();
        if (!token) {
            throw new Error('Spicetify session access token missing');
        }

        const httpsUrl = `https://spclient.wg.spotify.com/metadata/4/track/${trackGid}?market=from_token`;
        log('resolveTrackIsrc:metadata-request', {
            trackId: trackIdForLog,
            gid: trackGid,
            url: httpsUrl,
            transport: 'fetch-protobuf'
        });
        const response = await request(httpsUrl, {
            method: 'GET',
            cache: 'no-store',
            headers: {
                Authorization: `Bearer ${token}`,
                'App-Platform': 'WebPlayer',
                Accept: 'application/x-protobuf'
            }
        });
        log('resolveTrackIsrc:metadata-fetch-response', {
            trackId: trackIdForLog,
            gid: trackGid,
            status: response.status,
            ok: response.ok,
            contentType: response.headers.get('content-type') || null,
            fromCache: response.headers.get('age') !== null
        }, response.ok ? 'info' : 'warn');
        if (!response.ok) {
            const body = await response.text().catch(() => '');
            throw new Error(`metadata request failed: ${response.status}${body ? ` ${body.slice(0, 120)}` : ''}`);
        }
        const bytes = new Uint8Array(await response.arrayBuffer());
        const isrc = findIsrcFromSpclientMetadataBytes(bytes);
        log('resolveTrackIsrc:metadata-protobuf-response', {
            trackId: trackIdForLog,
            gid: trackGid,
            byteLength: bytes.byteLength,
            isrc: isrc || null
        }, isrc ? 'info' : 'warn');
        return isrc;
    }

    async function fetchSpclientTrackMetadataIsrc(trackGid, trackIdForLog) {
        try {
            const isrc = await fetchSpclientTrackMetadataIsrcWithRequestBuilder(trackGid, trackIdForLog);
            if (isrc) return isrc;

            log('resolveTrackIsrc:metadata-json-missing-isrc', {
                trackId: trackIdForLog,
                gid: trackGid
            }, 'warn');
        } catch (error) {
            log('resolveTrackIsrc:metadata-requestbuilder-error', {
                trackId: trackIdForLog,
                gid: trackGid,
                message: error?.message || String(error)
            }, 'warn');
        }

        return await fetchSpclientTrackMetadataIsrcWithLegacyFetch(trackGid, trackIdForLog);
    }

    function normalizeSpotifyProfile(profile) {
        if (!profile || typeof profile !== 'object') return null;

        const uriUserId = typeof profile.uri === 'string' && profile.uri.startsWith('spotify:user:')
            ? profile.uri.split(':').pop()
            : '';
        const id = getNonEmptyString(profile.id, profile.username, profile.userId, uriUserId);
        if (!id) return null;

        return {
            id,
            displayName: getNonEmptyString(profile.display_name, profile.displayName, profile.name, profile.username),
        };
    }

    async function readWebApiProfile(response) {
        const status = readSpotifyResponseStatus(response);
        if (status < 200 || status >= 300) {
            throw new Error(`Spotify Web API request failed: ${status}`);
        }
        return readSpotifyResponseBody(response);
    }

    async function loadSpotifyProfile(isCurrent) {
        const sources = [
            ['Platform.UserAPI', () => getPlatform()?.UserAPI?.getUser?.()],
            ['RequestBuilder', async () => readWebApiProfile(await sendSpotifyPlatformRequest(getPlatform(), {
                host: 'https://api.spotify.com', path: '/v1/me', endpointIdentifier: '/v1/me', withoutMarket: true,
            }))],
            ['CosmosAsync', async () => readWebApiProfile(await getCosmosApi()?.get?.('https://api.spotify.com/v1/me'))],
        ];
        for (const [source, read] of sources) {
            if (!isCurrent()) break;
            try {
                const profile = normalizeSpotifyProfile(await read());
                if (profile) return profile;
            } catch (error) {
                if (isCurrent()) reportWarning(`[SyncDataService] Failed to read Spotify profile from ${source}`, error);
            }
        }
        return null;
    }

    async function readCurrentProfile(entry) {
        let timer;
        let expired = false;
        let profile = null;
        const isCurrent = () => !expired && profileRequest === entry && entry.account === readSpotifyAccountKey();
        try {
            const timeout = new Promise(resolve => {
                timer = schedule(() => {
                    expired = true;
                    resolve(null);
                }, 1200);
            });
            const result = await Promise.race([loadSpotifyProfile(isCurrent), timeout]);
            if (isCurrent()) profile = result;
            return profile;
        } finally {
            if (timer != null) cancelScheduled(timer);
            if (profileRequest === entry && (!profile || !entry.account)) profileRequest = null;
        }
    }

    function getCurrentSpotifyProfile() {
        const account = readSpotifyAccountKey();
        if (profileRequest?.account === account) return profileRequest.result;
        const entry = { account, result: null };
        profileRequest = entry;
        entry.result = readCurrentProfile(entry);
        return entry.result;
    }

    return {
        toTrackGid: spotifyTrackIdToGid,
        fetchTrackIsrc: fetchSpclientTrackMetadataIsrc,
        getCurrentSpotifyProfile,
    };
}
