import { isUsablePayload, normalizeDurationSeconds, normalizeMetadataText } from "./lyricsPlusInput.mjs";

const ENCODED_API_BASES = Object.freeze([
    'YUhSMGNITTZMeTlzZVhKcFkzTndiSFZ6TG5CeWFtdDBiR0V1YlhrdWFXUT0=',
    'YUhSMGNITTZMeTlzZVhKcFkzTXVaMlZsYTJWa0xuZDBaZz09'
]);
const API_PATH = '/v2/lyrics/get';
const REQUEST_TIMEOUT_MS = 10000;
const MIRROR_FALLBACK_DELAY_MS = 750;

export function decodeBase64Twice(value) {
    return globalThis.atob(globalThis.atob(String(value || '')));
}

export function getApiBases() {
    return ENCODED_API_BASES.map(decodeBase64Twice);
}

export function buildLyricsUrl(apiBase, info, isrc) {
    const url = new URL(API_PATH, apiBase);
    const title = normalizeMetadataText(info?.title || info?.name);
    const artist = normalizeMetadataText(info?.artist || info?.artists);
    const album = normalizeMetadataText(info?.album || info?.albumName);
    const duration = normalizeDurationSeconds(info);

    if (isrc) {
        url.searchParams.set('isrc', isrc);
    } else if (title && artist) {
        url.searchParams.set('title', title);
        url.searchParams.set('artist', artist);
        if (album && album !== 'undefined') url.searchParams.set('album', album);
        if (duration) url.searchParams.set('duration', duration);
    }

    return url;
}

export function createLyricsPlusTransport({ readSyncDataService, readTrackId, debug }) {
    let preferredApiBaseIndex = 0;

    function reserveApiAttemptOrder(apiBases = getApiBases()) {
        if (!Array.isArray(apiBases) || apiBases.length === 0) return [];
        const startIndex = preferredApiBaseIndex % apiBases.length;

        return apiBases.map((_apiBase, offset) => {
            const mirrorIndex = (startIndex + offset) % apiBases.length;
            return { apiBase: apiBases[mirrorIndex], mirrorIndex };
        });
    }

    function normalizeIsrc(value) {
        const serviceValue = readSyncDataService()?.normalizeSyncDataIsrc?.(value);
        const normalized = String(serviceValue || value || '')
            .replace(/[^A-Za-z0-9]/g, '')
            .toUpperCase();
        return /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(normalized) ? normalized : '';
    }

    function extractTrackId(uri) {
        return readTrackId(uri)
            || String(uri || '').match(/^spotify:track:([^:]+)$/)?.[1]
            || '';
    }

    async function resolveTrackIsrc(info) {
        const directCandidates = [
            info?.isrc,
            info?.external_ids?.isrc,
            info?.externalIds?.isrc,
            info?.metadata?.isrc,
            info?.track?.external_ids?.isrc
        ];
        for (const candidate of directCandidates) {
            const isrc = normalizeIsrc(candidate);
            if (isrc) return isrc;
        }

        const trackId = extractTrackId(info?.uri);
        const syncDataService = readSyncDataService();
        if (!trackId || !syncDataService) return '';

        const cached = normalizeIsrc(syncDataService.getTrackIsrc?.(trackId, info));
        if (cached) return cached;

        try {
            return normalizeIsrc(await syncDataService.resolveTrackIsrc?.(trackId, info));
        } catch (error) {
            console.warn('[LyricsPlus Lyrics Addon] ISRC lookup failed:', error);
            return '';
        }
    }

    async function fetchJson(url, mirrorIndex, signal) {
        const response = await fetch(url.toString(), {
            headers: { Accept: 'application/json' },
            signal
        });
        if (!response.ok) {
            const error = new Error(`LyricsPlus mirror ${mirrorIndex + 1}: request failed (${response.status})`);
            error.status = response.status;
            error.notFound = response.status === 404;
            throw error;
        }
        const body = await response.json().catch(() => null);

        if (!isUsablePayload(body)) {
            const message = body?.error?.message
                || body?.error?.details?.message
                || (typeof body?.error === 'string' ? body.error : '')
                || `request failed (${response.status})`;
            const error = new Error(`LyricsPlus mirror ${mirrorIndex + 1}: ${message}`);
            error.status = response.status;
            error.notFound = !!(body && !body.error && Array.isArray(body.lyrics));
            throw error;
        }

        return body;
    }

    async function fetchLyricsData(info) {
        const isrc = await resolveTrackIsrc(info);
        const title = normalizeMetadataText(info?.title || info?.name);
        const artist = normalizeMetadataText(info?.artist || info?.artists);
        if (!isrc && (!title || !artist)) {
            throw new Error('Missing ISRC or track metadata');
        }

        const apiAttempts = reserveApiAttemptOrder();
        return new Promise((resolve, reject) => {
            const errors = [];
            const activeRequests = new Map();
            let nextAttempt = 0;
            let settled = false;
            let fallbackTimer = null;

            const finish = (value, error, winnerIndex = null) => {
                if (settled) return;
                settled = true;
                clearTimeout(deadlineTimer);
                clearTimeout(fallbackTimer);
                for (const [mirrorIndex, controller] of activeRequests) {
                    if (mirrorIndex !== winnerIndex) controller?.abort();
                }
                activeRequests.clear();
                if (error) reject(error);
                else resolve(value);
            };

            // One budget covers both mirrors, including response bodies. Settle
            // explicitly even if a fetch implementation does not honor abort.
            const deadlineTimer = setTimeout(() => {
                const error = new Error('LyricsPlus request timed out');
                error.name = 'TimeoutError';
                finish(null, error);
            }, REQUEST_TIMEOUT_MS);

            const startNext = () => {
                if (settled || nextAttempt >= apiAttempts.length) return;
                clearTimeout(fallbackTimer);
                fallbackTimer = null;
                const { apiBase, mirrorIndex } = apiAttempts[nextAttempt++];
                const controller = typeof AbortController === 'function' ? new AbortController() : null;
                activeRequests.set(mirrorIndex, controller);
                fetchJson(buildLyricsUrl(apiBase, info, isrc), mirrorIndex, controller?.signal)
                    .then(data => {
                        if (settled) return;
                        preferredApiBaseIndex = mirrorIndex;
                        finish({ data, isrc, mirror: mirrorIndex + 1 }, null, mirrorIndex);
                    })
                    .catch(error => {
                        if (settled) return;
                        controller?.abort();
                        activeRequests.delete(mirrorIndex);
                        errors.push(error);
                        debug(`[LyricsPlus Lyrics Addon] Mirror ${mirrorIndex + 1} failed`, {
                            status: error?.status || null,
                            error: error?.name || 'Error'
                        });
                        if (nextAttempt < apiAttempts.length) {
                            startNext();
                        } else if (activeRequests.size === 0) {
                            const failure = [...errors].reverse().find(item => item?.notFound !== true);
                            finish(null, failure);
                        }
                    });

                // Fast successful responses use one mirror. A slow response
                // allows the alternate to provide lyrics without a full timeout.
                if (nextAttempt < apiAttempts.length) {
                    fallbackTimer = setTimeout(startNext, MIRROR_FALLBACK_DELAY_MS);
                }
            };

            startNext();
        });
    }

    return { normalizeIsrc, resolveTrackIsrc, fetchLyricsData };
}
