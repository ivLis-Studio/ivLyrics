export function normalizeSyncDataIsrc(value) {
    if (typeof value !== 'string') return '';
    const normalized = value.trim().replace(/[\s-]/g, '').toUpperCase();
    return /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(normalized) ? normalized : '';
}

export function normalizeSyncDataTrackId(value) {
    if (typeof value !== 'string') return '';
    const trackId = value.trim();
    return /^[A-Za-z0-9]{22}$/.test(trackId) ? trackId : '';
}

export function firstNormalizedSyncDataIsrc(...values) {
    for (const value of values) {
        const isrc = normalizeSyncDataIsrc(value);
        if (isrc) return isrc;
    }
    return '';
}

export function getSyncDataIdentityCacheKey(identity) {
    if (!identity) return '';
    return normalizeSyncDataIsrc(identity.isrc);
}

const ISRC_LOOKUP_SUCCESS_TTL_MS = 24 * 60 * 60 * 1000;

export function createSyncDataIdentityResolver({
    extractTrackId, getPlayer, getSpotifyTrackData, toTrackGid, fetchTrackIsrc,
    now = Date.now, debug = () => {}, log = () => {},
}) {
    const lookupCache = new Map();
    const inflightRequests = new Map();

    function rememberResolvedTrackIsrc(trackId, isrc) {
        lookupCache.set(trackId, { isrc, expiresAt: now() + ISRC_LOOKUP_SUCCESS_TTL_MS });
    }

    function getTrackIdFromInput(trackId, metadata = {}) {
        return normalizeSyncDataTrackId(trackId)
            || normalizeSyncDataTrackId(metadata?.trackId)
            || normalizeSyncDataTrackId(metadata?.id)
            || normalizeSyncDataTrackId(extractTrackId(metadata?.uri))
            || normalizeSyncDataTrackId(metadata?.track?.id)
            || normalizeSyncDataTrackId(extractTrackId(metadata?.track?.uri));
    }

    function getTrackIsrc(trackId, metadata = {}) {
        const playerData = getPlayer()?.data;
        const playerItem = playerData?.item || null;
        const playerTrack = playerData?.track || null;
        // The player's ISRC only describes the track that is playing. A
        // lookup for any other track (the next song while prefetching, a
        // queue item) must not inherit it: resolveTrackIsrc caches the
        // answer, which would map that track to the wrong recording and
        // fetch the wrong video and community sync data for it.
        const requestedTrackId = getTrackIdFromInput(trackId, metadata);
        const playerTrackId = normalizeSyncDataTrackId(extractTrackId(playerItem?.uri))
            || normalizeSyncDataTrackId(extractTrackId(playerTrack?.uri));
        const playerIsRequestedTrack = !requestedTrackId || requestedTrackId === playerTrackId;
        const explicitIsrc = firstNormalizedSyncDataIsrc(
            metadata?.isrc,
            metadata?.metadata?.isrc,
            metadata?.external_ids?.isrc,
            metadata?.externalIds?.isrc,
            metadata?.track?.isrc,
            metadata?.track?.metadata?.isrc,
            metadata?.track?.external_ids?.isrc,
            metadata?.track?.externalIds?.isrc,
            metadata?.item?.metadata?.isrc,
            metadata?.item?.external_ids?.isrc,
            metadata?.item?.externalIds?.isrc,
            ...(playerIsRequestedTrack ? [
                playerItem?.metadata?.isrc,
                playerItem?.external_ids?.isrc,
                playerItem?.externalIds?.isrc,
                playerTrack?.metadata?.isrc,
                playerTrack?.external_ids?.isrc,
                playerTrack?.externalIds?.isrc
            ] : [])
        );
        if (explicitIsrc) return explicitIsrc;

        try {
            const currentUri = getPlayer()?.data?.item?.uri || '';
            const targetUri = trackId
                ? (currentUri.includes(trackId) ? currentUri : `spotify:track:${trackId}`)
                : currentUri;
            const spotifyData = getSpotifyTrackData(targetUri);
            return normalizeSyncDataIsrc(spotifyData?.isrc || spotifyData?.external_ids?.isrc);
        } catch {
            return '';
        }
    }

    async function resolveTrackIsrc(trackId, metadata = {}) {
        const localIsrc = getTrackIsrc(trackId, metadata);
        const normalizedTrackId = getTrackIdFromInput(trackId, metadata);
        log('resolveTrackIsrc:start', {
            trackId: normalizedTrackId || trackId || null,
            metadataIsrc: metadata?.isrc || metadata?.metadata?.isrc || null,
            hasLocalIsrc: !!localIsrc
        });
        if (localIsrc) {
            if (normalizedTrackId) {
                rememberResolvedTrackIsrc(normalizedTrackId, localIsrc);
            }
            log('resolveTrackIsrc:local-hit', {
                trackId: normalizedTrackId || trackId || null,
                isrc: localIsrc
            });
            return localIsrc;
        }

        if (!normalizedTrackId) {
            log('resolveTrackIsrc:missing-track-id', {
                trackId: trackId || null,
                metadataUri: metadata?.uri || null
            }, 'warn');
            return '';
        }

        const cached = lookupCache.get(normalizedTrackId);
        if (cached && cached.expiresAt > now()) {
            if (cached.isrc) {
                log('resolveTrackIsrc:cache-hit', {
                    trackId: normalizedTrackId,
                    isrc: cached.isrc,
                    success: true
                });
                return cached.isrc;
            }
            log('resolveTrackIsrc:ignore-failed-cache', {
                trackId: normalizedTrackId
            }, 'warn');
            lookupCache.delete(normalizedTrackId);
        }
        if (cached) {
            lookupCache.delete(normalizedTrackId);
        }

        if (inflightRequests.has(normalizedTrackId)) {
            log('resolveTrackIsrc:join-inflight', {
                trackId: normalizedTrackId
            });
            return await inflightRequests.get(normalizedTrackId);
        }

        const promise = (async () => {
            try {
                const trackGid = toTrackGid(normalizedTrackId);
                if (!trackGid) {
                    log('resolveTrackIsrc:gid-failed', {
                        trackId: normalizedTrackId
                    }, 'warn');
                    return '';
                }

                const resolvedIsrc = await fetchTrackIsrc(trackGid, normalizedTrackId);
                log('resolveTrackIsrc:metadata-response', {
                    trackId: normalizedTrackId,
                    gid: trackGid,
                    isrc: resolvedIsrc || null
                }, resolvedIsrc ? 'info' : 'warn');
                if (resolvedIsrc) {
                    rememberResolvedTrackIsrc(normalizedTrackId, resolvedIsrc);
                }
                return resolvedIsrc;
            } catch (error) {
                log('resolveTrackIsrc:metadata-error', {
                    trackId: normalizedTrackId,
                    status: error?.status || error?.statusCode || null,
                    message: error?.message || String(error)
                }, 'warn');
                debug('[SyncDataService] Failed to resolve ISRC from Spotify spclient metadata', {
                    trackId: normalizedTrackId,
                    status: error?.status || error?.statusCode,
                    message: error?.message || String(error)
                });
                return '';
            } finally {
                inflightRequests.delete(normalizedTrackId);
            }
        })();

        inflightRequests.set(normalizedTrackId, promise);
        return await promise;
    }

    function rememberTrackIsrc(trackId, isrcValue) {
        const normalizedTrackId = getTrackIdFromInput(trackId, {});
        const isrc = normalizeSyncDataIsrc(isrcValue);
        if (!normalizedTrackId || !isrc) return '';

        rememberResolvedTrackIsrc(normalizedTrackId, isrc);
        return isrc;
    }

    function buildSyncDataIdentity(trackId, metadata = {}, isrcValue = '') {
        const trackIdentity = getTrackIdFromInput(trackId, metadata);
        const isrc = normalizeSyncDataIsrc(isrcValue);
        if (!isrc) {
            return null;
        }
        return {
            isrc,
            trackId: trackIdentity || null
        };
    }

    function getSyncDataIdentity(trackId, metadata = {}) {
        return buildSyncDataIdentity(trackId, metadata, getTrackIsrc(trackId, metadata));
    }

    async function resolveSyncDataIdentity(trackId, metadata = {}) {
        const localIsrc = getTrackIsrc(trackId, metadata);
        const resolvedIsrc = localIsrc || await resolveTrackIsrc(trackId, metadata);
        return buildSyncDataIdentity(trackId, metadata, resolvedIsrc);
    }

    function getSyncDataIdentityKey(trackId, metadata = {}) {
        return getSyncDataIdentityCacheKey(getSyncDataIdentity(trackId, metadata));
    }

    function normalizeSyncDataCacheIdentityKey(identityValue, metadata = {}) {
        const isrc = normalizeSyncDataIsrc(identityValue);
        if (isrc) return isrc;
        const trackId = normalizeSyncDataTrackId(identityValue);
        if (trackId) return `track:${trackId}`;
        if (typeof identityValue === 'string' && identityValue.startsWith('track:')) {
            const prefixedTrackId = normalizeSyncDataTrackId(identityValue.slice('track:'.length));
            if (prefixedTrackId) return `track:${prefixedTrackId}`;
        }
        return getSyncDataIdentityKey(identityValue, metadata) || '';
    }

    return {
        getTrackIdFromInput, getTrackIsrc, resolveTrackIsrc, rememberTrackIsrc,
        rememberResolvedTrackIsrc, resolveSyncDataIdentity, normalizeSyncDataCacheIdentityKey,
    };
}
