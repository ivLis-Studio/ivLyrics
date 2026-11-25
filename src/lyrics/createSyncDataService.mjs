import {
    createSyncDataIdentityResolver, getSyncDataIdentityCacheKey, normalizeSyncDataIsrc, normalizeSyncDataTrackId,
} from "./syncDataIdentity.mjs";
import { createSpotifySyncDataMetadata } from "./createSpotifySyncDataMetadata.mjs";
import { createSyncDataSubmission } from "./createSyncDataSubmission.mjs";
import { createSyncDataOpenDb } from "./createSyncDataOpenDb.mjs";
import { createSyncDataRuntimeCache } from "./createSyncDataRuntimeCache.mjs";
import { redactSyncDataForRuntimeCache, hasRedactedSyncDataContributorIdentity } from "./lyricsCachePrivacy.mjs";
import { createSyncDataRenderer } from "./createSyncDataRenderer.mjs";
import { normalizeSyncDataDurationMs } from "./syncRenderTiming.mjs";

const API_BASE = 'https://lyrics.api.ivl.is';
const SYNC_DATA_REQUEST_VERSION = '20260701';

export function createSyncDataService({
    extractTrackId, getPlayer, getPlatform, getUriApi, getCosmosApi, getSpotifyTrackData,
    getStorage, request, schedule, cancelScheduled, readSpotifyAccountKey, getCodec, getUserHash, getAuthUtils, readStoredAuthToken,
    getClientVersion, translate, log, reportWarning, debug, now = Date.now,
}) {
    const spotifyMetadata = createSpotifySyncDataMetadata({
        getPlatform, getUriApi, getCosmosApi, request, schedule, cancelScheduled, readSpotifyAccountKey, log, reportWarning,
    });
    const {
        getTrackIdFromInput, getTrackIsrc, resolveTrackIsrc, rememberTrackIsrc, rememberResolvedTrackIsrc,
        resolveSyncDataIdentity, normalizeSyncDataCacheIdentityKey,
    } = createSyncDataIdentityResolver({
        extractTrackId, getPlayer, getSpotifyTrackData, now, debug, log,
        toTrackGid: spotifyMetadata.toTrackGid,
        fetchTrackIsrc: spotifyMetadata.fetchTrackIsrc,
    });

    const {
        responses, inflight, reportedTrackMetadata, resetRequests, invalidate,
        getCacheGeneration, getRecentSyncDataResponse, rememberRecentSyncDataResponse, shouldBypassServerCache,
    } = createSyncDataRuntimeCache({ now, schedule });

    function normalizeSyncDataText(value, maxLength = 256) {
        if (typeof value !== 'string') return '';
        return value.trim().slice(0, maxLength);
    }

    function normalizeSyncDataArtistText(value, maxLength = 256) {
        if (Array.isArray(value)) {
            return normalizeSyncDataText(value.map(entry => {
                if (typeof entry === 'string') return entry;
                if (entry && typeof entry.name === 'string') return entry.name;
                return '';
            }).filter(Boolean).join(', '), maxLength);
        }

        return normalizeSyncDataText(value, maxLength);
    }

    function getSyncDataTrackMetadata(trackId, metadata = {}) {
        const currentItem = getPlayer()?.data?.item || null;
        const title = normalizeSyncDataText(
            metadata?.title ||
            metadata?.trackTitle ||
            metadata?.trackName ||
            metadata?.name ||
            metadata?.track?.name ||
            currentItem?.name
        );
        const artist = normalizeSyncDataArtistText(
            metadata?.artist ||
            metadata?.artists ||
            metadata?.trackArtist ||
            metadata?.artistName ||
            metadata?.track?.artists ||
            currentItem?.artists
        );
        const album = normalizeSyncDataText(
            metadata?.album ||
            metadata?.albumName ||
            metadata?.trackAlbum ||
            metadata?.albumTitle ||
            metadata?.track?.album?.name ||
            metadata?.track?.album ||
            currentItem?.album?.name ||
            currentItem?.metadata?.album_title
        );
        const durationMs = normalizeSyncDataDurationMs(
            metadata?.durationMs,
            metadata?.trackDurationMs,
            metadata?.duration_ms,
            metadata?.duration?.milliseconds,
            metadata?.duration,
            currentItem?.duration?.milliseconds,
            getPlayer()?.getDuration?.()
        );

        return {
            trackId: normalizeSyncDataTrackId(trackId),
            title,
            artist,
            album,
            durationMs
        };
    }

    function appendSyncDataQueryParams(url, identity, metadata = {}, provider = null) {
        const isrc = normalizeSyncDataIsrc(identity?.isrc);
        if (!isrc) {
            throw new Error(getMissingIsrcMessage());
        }
        url.searchParams.set('isrc', isrc);
        url.searchParams.set('request-version', SYNC_DATA_REQUEST_VERSION);
        url.searchParams.set('format', '6');
        if (provider) {
            url.searchParams.set('provider', provider);
        }

        const trackMetadata = getSyncDataTrackMetadata(identity.trackId, metadata);
        const metadataTrackId = trackMetadata.trackId;
        const identityKey = getSyncDataIdentityCacheKey(identity);
        const shouldReportMetadata = !reportedTrackMetadata.has(identityKey)
            && (metadataTrackId || trackMetadata.title || trackMetadata.artist || trackMetadata.album);

        if (shouldReportMetadata) {
            url.searchParams.set('metadata', '1');
            if (metadataTrackId) url.searchParams.set('trackId', metadataTrackId);
            if (trackMetadata.title) url.searchParams.set('title', trackMetadata.title);
            if (trackMetadata.artist) url.searchParams.set('artist', trackMetadata.artist);
            if (trackMetadata.album) url.searchParams.set('album', trackMetadata.album);
        }

        return shouldReportMetadata;
    }

    function getMissingIsrcMessage() {
        return '이 곡의 ISRC를 확인할 수 없어 sync-data를 사용할 수 없습니다.';
    }

    const {
        clearOpenDbStorage,
        getOpenDbCacheInfo,
        refreshOpenDbCache,
        getOpenDbProvidersForIsrc,
        hasOpenDbSyncDataEntry,
        isOpenDbUnavailable,
        rememberOpenDbSyncDataEntry,
    } = createSyncDataOpenDb({
        getStorage,
        fetch: request,
        now,
        normalizeIsrc: normalizeSyncDataIsrc,
        log: log,
        onRebuilt() {
            // Requests started against the prior index may still resolve after
            // this rebuild. Advance the generation before clearing references so
            // those responses cannot repopulate the runtime cache.
            resetRequests();
        },
    });

    async function getAvailableProviders(trackId, metadata = {}) {
        const identity = await resolveSyncDataIdentity(trackId, metadata);
        if (!identity) {
            log('providers:skip-missing-identity', {
                trackId: getTrackIdFromInput(trackId, metadata) || trackId || null
            }, 'warn');
            return [];
        }
        const identityKey = getSyncDataIdentityCacheKey(identity);
        const cacheKey = `${identityKey}:providers`;

        if (responses.has(cacheKey)) {
            const cachedProviders = responses.get(cacheKey);
            if (Array.isArray(cachedProviders) && cachedProviders.length === 0) {
                responses.delete(cacheKey);
            } else {
                log('providers:cache-hit', {
                    isrc: identity.isrc || null,
                    trackId: identity.trackId || null
                });
                return cachedProviders;
            }
        }

        const bypassServerCache = shouldBypassServerCache(identity.isrc);
        if (bypassServerCache && await isOpenDbUnavailable()) {
            log('providers:opendb-unavailable-skip', {
                isrc: identity.isrc || null,
                trackId: identity.trackId || null
            }, 'warn');
            return [];
        }

        if (!bypassServerCache) {
            const openDbProviders = await getOpenDbProvidersForIsrc(identity.isrc);
            if (openDbProviders) {
                log('providers:opendb', {
                    isrc: identity.isrc || null,
                    trackId: identity.trackId || null,
                    count: openDbProviders.length
                });
                if (openDbProviders.length > 0) {
                    responses.set(cacheKey, openDbProviders);
                }
                return openDbProviders;
            }
        }

        try {
            const inflightKey = `${cacheKey}:request`;
            if (inflight.has(inflightKey)) {
                log('providers:join-inflight', {
                    isrc: identity.isrc || null,
                    trackId: identity.trackId || null
                });
                return await inflight.get(inflightKey);
            }

            const requestGeneration = getCacheGeneration(identityKey);
            const fetchPromise = (async () => {
                const url = new URL(`${API_BASE}/lyrics/sync-data`);
                const reportsMetadata = appendSyncDataQueryParams(url, identity, metadata);
                let requestUrl = url.toString();
                if (identity.isrc && shouldBypassServerCache(identity.isrc)) {
                    requestUrl += '&bypassCache=1';
                }
                log('providers:request', {
                    isrc: identity.isrc || null,
                    trackId: identity.trackId || null,
                    url: requestUrl
                });
                const response = await request(requestUrl, { cache: 'no-store' });
                log('providers:response', {
                    isrc: identity.isrc || null,
                    trackId: identity.trackId || null,
                    status: response.status,
                    ok: response.ok
                }, response.ok ? 'info' : 'warn');
                if (!response.ok) {
                    if (response.status === 404) return [];
                    throw new Error(`API Error: ${response.status}`);
                }
                const result = await response.json();
                const resolvedIsrc = normalizeSyncDataIsrc(result?.isrc || result?.data?.isrc);
                if (resolvedIsrc && identity.trackId) {
                    rememberResolvedTrackIsrc(identity.trackId, resolvedIsrc);
                }
                if (reportsMetadata) {
                    reportedTrackMetadata.add(identityKey);
                }
                const providers = Array.isArray(result.providers) ? result.providers : [];
                if (requestGeneration === getCacheGeneration(identityKey)) {
                    responses.set(cacheKey, providers);
                }
                return providers;
            })();

            inflight.set(inflightKey, fetchPromise);
            try {
                return await fetchPromise;
            } finally {
                if (inflight.get(inflightKey) === fetchPromise) {
                    inflight.delete(inflightKey);
                }
            }
        } catch (e) {
            reportWarning(`[SyncDataService] Failed to fetch sync providers for ${identityKey}`, e);
            return [];
        }
    }

    async function getSyncData(trackId, provider = null, metadata = {}) {
        let forceContributorRefresh = metadata?.forceContributorRefresh === true;
        let redactedCachedFallback = null;
        log('getSyncData:called', {
            trackId: getTrackIdFromInput(trackId, metadata) || trackId || null,
            provider: provider || null,
            metadataIsrc: metadata?.isrc || null
        });
        const identity = await resolveSyncDataIdentity(trackId, metadata);
        if (!identity) {
            log('getSyncData:skip-missing-identity', {
                trackId: getTrackIdFromInput(trackId, metadata) || trackId || null,
                provider: provider || null
            }, 'warn');
            debug('[SyncDataService] Missing ISRC for sync-data lookup', { trackId, provider });
            return null;
        }
        const identityKey = getSyncDataIdentityCacheKey(identity);

        if (!provider) {
            const providers = await getAvailableProviders(trackId, metadata);
            if (providers.length === 0) return null;
            provider = providers[0].provider;
        }

        const queryProvider = provider === 'legacy' ? 'spotify' : provider;
        const specificKey = `${identityKey}:${queryProvider}`;

        // LRCLIB source matching, karaoke rendering, and cached contributor
        // hydration can all request the same live payload during one render.
        // Reuse only this very recent response; the longer-lived timing cache
        // below still strips contributor identity fields.
        const recentSyncData = getRecentSyncDataResponse(specificKey);
        if (recentSyncData) {
            log('getSyncData:recent-response-hit', {
                isrc: identity.isrc || null,
                trackId: identity.trackId || null,
                provider: queryProvider,
                contributorRefreshRequested: forceContributorRefresh
            });
            return recentSyncData;
        }

        if (!forceContributorRefresh && responses.has(specificKey)) {
            const cachedSyncData = responses.get(specificKey);
            if (!hasRedactedSyncDataContributorIdentity(cachedSyncData)) {
                log('getSyncData:cache-hit', {
                    isrc: identity.isrc || null,
                    trackId: identity.trackId || null,
                    provider: queryProvider
                });
                return cachedSyncData;
            }

            // Timing data may be cached for the whole session, but contributor
            // privacy can change at any time. The cache intentionally stores no
            // identity, so rehydrate the latest public/private state before it is
            // shown. If the refresh fails, the redacted copy remains the safe
            // fallback and never exposes stale identity.
            redactedCachedFallback = cachedSyncData;
            forceContributorRefresh = true;
            log('getSyncData:refresh-redacted-contributors', {
                isrc: identity.isrc || null,
                trackId: identity.trackId || null,
                provider: queryProvider
            });
        }

        const bypassServerCache = shouldBypassServerCache(identity.isrc);
        if (!forceContributorRefresh && bypassServerCache && await isOpenDbUnavailable()) {
            log('getSyncData:opendb-unavailable-skip', {
                isrc: identity.isrc || null,
                trackId: identity.trackId || null,
                provider: queryProvider
            }, 'warn');
            return null;
        }

        if (!forceContributorRefresh && !bypassServerCache) {
            const openDbHasEntry = await hasOpenDbSyncDataEntry(identity.isrc, queryProvider);
            if (openDbHasEntry === false) {
                log('getSyncData:opendb-skip', {
                    isrc: identity.isrc || null,
                    trackId: identity.trackId || null,
                    provider: queryProvider
                });
                return null;
            }
        }

        const requestGeneration = getCacheGeneration(identityKey);
        // A normal lookup and a contributor refresh hit the same endpoint.
        // Sharing one request is safe because either response contains the
        // current timing data and the current contributor privacy state.
        const inflightKey = specificKey;
        let fetchPromise = null;
        try {
            if (inflight.has(inflightKey)) {
                log('getSyncData:join-inflight', {
                    isrc: identity.isrc || null,
                    trackId: identity.trackId || null,
                    provider: queryProvider
                });
                return await inflight.get(inflightKey);
            }

            const runSyncDataFetch = async () => {
                const url = new URL(`${API_BASE}/lyrics/sync-data`);
                const reportsMetadata = appendSyncDataQueryParams(url, identity, metadata, queryProvider);
                let requestUrl = url.toString();
                if (identity.isrc && shouldBypassServerCache(identity.isrc)) {
                    requestUrl += '&bypassCache=1';
                }
                log('getSyncData:request', {
                    isrc: identity.isrc || null,
                    trackId: identity.trackId || null,
                    provider: queryProvider,
                    url: requestUrl
                });
                const response = await request(requestUrl, { cache: 'no-store' });
                log('getSyncData:response', {
                    isrc: identity.isrc || null,
                    trackId: identity.trackId || null,
                    provider: queryProvider,
                    status: response.status,
                    ok: response.ok
                }, response.ok ? 'info' : 'warn');

                if (!response.ok) {
                    if (response.status === 404) return null;
                    if (response.status === 426) {
                        const result = await response.json().catch(() => null);
                        reportWarning(result?.message || getMissingIsrcMessage());
                        return null;
                    }
                    throw new Error(`API Error: ${response.status}`);
                }

                const result = await response.json();
                log('getSyncData:json', {
                    isrc: identity.isrc || null,
                    trackId: identity.trackId || null,
                    provider: queryProvider,
                    hasData: !!(result?.data || result),
                    hasSyncData: !!(result?.data?.syncData || result?.syncData),
                    providerReturned: result?.data?.provider || result?.provider || null
                });
                if (reportsMetadata) {
                    reportedTrackMetadata.add(identityKey);
                }
                const data = result.data || result;

                if (data) {
                    let syncDataBody = null;

                    if (Array.isArray(data)) {
                        syncDataBody = { lines: data };
                    } else if (Array.isArray(data.lines)) {
                        syncDataBody = data;
                    } else if (data.syncData && Array.isArray(data.syncData.lines)) {
                        syncDataBody = data.syncData;
                    }

                    if (!syncDataBody?.lines) return null;

                    const resolvedIsrc = normalizeSyncDataIsrc(data.isrc) || identity.isrc;
                    const resolvedTrackId = identity.trackId || data.trackId || data.storedTrackId || null;
                    if (resolvedIsrc && resolvedTrackId) {
                        rememberResolvedTrackIsrc(resolvedTrackId, resolvedIsrc);
                    }
                    const syncData = {
                        isrc: resolvedIsrc,
                        trackId: resolvedTrackId,
                        storedTrackId: data.storedTrackId || data.trackId || null,
                        provider: data.provider || provider,
                        syncData: syncDataBody,
                        contributors: data.contributors || [],
                        syncType: data.syncType || 'unknown',
                        syncPoints: Number(data.syncPoints ?? 2),
                        syncTypeSource: data.syncTypeSource || 'legacy',
                        syncTypeBreakdown: data.syncTypeBreakdown || null,
                        createdAt: data.createdAt || null,
                        updatedAt: data.updatedAt || null
                    };
                    if (requestGeneration !== getCacheGeneration(identityKey)) {
                        return null;
                    }
                    rememberRecentSyncDataResponse(specificKey, syncData);
                    const cachedSyncData = redactSyncDataForRuntimeCache(syncData);
                    responses.set(specificKey, cachedSyncData);
                    if (resolvedIsrc) {
                        responses.set(`${resolvedIsrc}:${queryProvider}`, cachedSyncData);
                    }
                    if (resolvedTrackId) {
                        responses.set(`track:${resolvedTrackId}:${queryProvider}`, cachedSyncData);
                    }
                    return syncData;
                }
                return null;
            };

            fetchPromise = runSyncDataFetch();

            inflight.set(inflightKey, fetchPromise);
            const result = await fetchPromise;
            if (inflight.get(inflightKey) === fetchPromise) {
                inflight.delete(inflightKey);
            }
            return result;
        } catch (e) {
            reportWarning(`[SyncDataService] Failed to fetch sync data for ${identityKey}:${provider}`, e);
            const inflightRequest = inflight.get(inflightKey);
            if (!inflightRequest || inflightRequest === fetchPromise) {
                inflight.delete(inflightKey);
            }
            return redactedCachedFallback;
        }
    }

    async function hasSyncData(trackId, provider, metadata = {}) {
        const providers = await getAvailableProviders(trackId, metadata);
        return providers.some(p => p.provider === provider);
    }

    function clearCache(identityValue, metadata = {}) {
        const identityKey = normalizeSyncDataCacheIdentityKey(identityValue, metadata) || identityValue;
        // OpenDB is a global, versioned provider index. Clearing one track's
        // runtime sync cache must never evict the entire downloaded index.
        if (metadata?.clearOpenDb === true) {
            clearOpenDbStorage();
        }
        invalidate(identityKey);
    }

    /**
     * 싱크 데이터를 가사에 적용하여 karaoke 형식으로 변환
     * @param {Array} lyrics - 원본 가사 라인 배열 [{text: "..."}, ...]
     * @param {Object} syncData - 싱크 데이터 { provider, syncData: { lines: [...] } }
     * @returns {Array} - karaoke 형식의 가사
     */
    const { applySyncDataToLyrics, convertKaraokeToSynced } = createSyncDataRenderer({
        getCodec,
        getPlayer,
        debug,
    });

    const submitSyncData = createSyncDataSubmission({
        apiBase: API_BASE,
        requestVersion: SYNC_DATA_REQUEST_VERSION,
        request, translate, getCodec, resolveSyncDataIdentity, getUserHash,
        getAuthUtils, readStoredAuthToken, getSyncDataTrackMetadata,
        getCurrentSpotifyProfile: spotifyMetadata.getCurrentSpotifyProfile,
        getClientVersion, rememberResolvedTrackIsrc, rememberOpenDbSyncDataEntry, clearCache,
    });

    return {
        getSyncData,
        getAvailableProviders,
        hasSyncData,
        submitSyncData,
        applySyncDataToLyrics,
        convertKaraokeToSynced,
        getTrackIsrc,
        resolveTrackIsrc,
        rememberTrackIsrc,
        getSyncDataTrackMetadata,
        normalizeSyncDataIsrc,
        hasOpenDbSyncDataEntry,
        getOpenDbCacheInfo,
        refreshOpenDbCache,
        shouldBypassServerCache,
        clearCache
    };
}
