const SERVER_CACHE_BYPASS_MS = 30 * 1000;
// The complete live response is shared briefly by independent consumers.
// Longer-lived responses retain timing and redact contributor identity.
const RECENT_SYNC_DATA_RESPONSE_TTL_MS = 15 * 1000;

export function createSyncDataRuntimeCache({ now, schedule }) {
    const responses = new Map();
    const inflight = new Map();
    const recentResponses = new Map();
    const trackGenerations = new Map();
    const reportedTrackMetadata = new Set();
    const serverCacheBypassUntil = new Map();
    let globalGeneration = 0;
    let globalServerCacheBypassUntil = 0;

    function rememberRecentSyncDataResponse(cacheKey, syncData) {
        if (!cacheKey || !syncData) return;

        const recent = {
            syncData,
            expiresAt: now() + RECENT_SYNC_DATA_RESPONSE_TTL_MS
        };
        recentResponses.set(cacheKey, recent);
        schedule(() => {
            if (recentResponses.get(cacheKey) === recent) {
                recentResponses.delete(cacheKey);
            }
        }, RECENT_SYNC_DATA_RESPONSE_TTL_MS);
    }

    function getRecentSyncDataResponse(cacheKey) {
        const recent = recentResponses.get(cacheKey);
        if (!recent) return null;
        if (recent.expiresAt <= now()) {
            recentResponses.delete(cacheKey);
            return null;
        }
        return recent.syncData;
    }

    function getCacheGeneration(identityKey) {
        return `${globalGeneration}:${trackGenerations.get(identityKey) || 0}`;
    }

    function bumpCacheGeneration(identityKey) {
        if (!identityKey) {
            globalGeneration += 1;
            return;
        }
        trackGenerations.set(identityKey, (trackGenerations.get(identityKey) || 0) + 1);
    }

    function clearInflightRequests(identityKey) {
        for (const key of inflight.keys()) {
            if (key === identityKey || key.startsWith(`${identityKey}:`)) {
                inflight.delete(key);
            }
        }
    }

    function markServerCacheBypass(identityKey) {
        const expiresAt = now() + SERVER_CACHE_BYPASS_MS;
        if (!identityKey) {
            globalServerCacheBypassUntil = expiresAt;
            return;
        }
        serverCacheBypassUntil.set(identityKey, expiresAt);
    }

    function shouldBypassServerCache(identityKey) {
        if (globalServerCacheBypassUntil > now()) {
            return true;
        }
        if (globalServerCacheBypassUntil > 0) {
            globalServerCacheBypassUntil = 0;
        }
        if (!identityKey) {
            return false;
        }
        const expiresAt = serverCacheBypassUntil.get(identityKey) || 0;
        if (expiresAt <= now()) {
            serverCacheBypassUntil.delete(identityKey);
            return false;
        }
        return true;
    }

    function resetRequests() {
        bumpCacheGeneration();
        inflight.clear();
        responses.clear();
        recentResponses.clear();
    }

    function invalidate(identityKey) {
        if (identityKey) {
            bumpCacheGeneration(identityKey);
            clearInflightRequests(identityKey);
            responses.delete(identityKey);
            for (const key of responses.keys()) {
                if (key.startsWith(`${identityKey}:`)) responses.delete(key);
            }
            for (const key of recentResponses.keys()) {
                if (key === identityKey || key.startsWith(`${identityKey}:`)) recentResponses.delete(key);
            }
            reportedTrackMetadata.delete(identityKey);
        } else {
            resetRequests();
            reportedTrackMetadata.clear();
            serverCacheBypassUntil.clear();
        }
        markServerCacheBypass(identityKey);
    }

    return {
        responses, inflight, reportedTrackMetadata, resetRequests, invalidate,
        getCacheGeneration, getRecentSyncDataResponse, rememberRecentSyncDataResponse, shouldBypassServerCache,
    };
}
