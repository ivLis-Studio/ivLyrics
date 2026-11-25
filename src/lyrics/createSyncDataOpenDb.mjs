const OPENDB_BASE_URL = 'https://ivlis.kr/ivLyrics/opendb/';
const OPENDB_MANIFEST_URL = `${OPENDB_BASE_URL}data/manifest.json`;
const OPENDB_STORAGE_KEY = 'ivLyrics:sync-data-opendb:v1';
const OPENDB_FRESH_MS = 60 * 1000;
const OPENDB_UNAVAILABLE_RETRY_MS = 5 * 60 * 1000;

function getOpenDbProviderMapStats(providerMap) {
    const lists = Object.values(providerMap);
    let entryCount = 0;
    const uniqueIsrcs = new Set();
    for (const list of lists) {
        entryCount += list.length;
        for (const isrc of list) uniqueIsrcs.add(isrc);
    }
    return { entryCount, distinctIsrcCount: uniqueIsrcs.size, providerCount: lists.length };
}

function hasOpenDbIsrc(list, isrc) {
    if (!Array.isArray(list)) return false;
    // Every list is sorted during validation, merge or storage recovery.
    let start = 0;
    let end = list.length - 1;
    while (start <= end) {
        const middle = Math.floor((start + end) / 2);
        const candidate = list[middle];
        if (candidate === isrc) return true;
        if (candidate < isrc) start = middle + 1;
        else end = middle - 1;
    }
    return false;
}

export function createSyncDataOpenDb({
    getStorage,
    fetch,
    normalizeIsrc,
    now = Date.now,
    createTimeoutSignal = milliseconds => typeof globalThis.AbortSignal?.timeout === 'function'
        ? globalThis.AbortSignal.timeout(milliseconds) : undefined,
    log = () => {},
    onRebuilt = () => {},
}) {
    let _openDbState = null;
    let _openDbLoadPromise = null;
    let _openDbRefreshPromise = null;

    function readOpenDbStorage() {
        try {
            const storage = getStorage();
            if (!storage) return null;
            const raw = storage.getItem(OPENDB_STORAGE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? parsed : null;
        } catch (e) {
            return null;
        }
    }

    function writeOpenDbStorage(state) {
        try {
            const storage = getStorage();
            if (!storage || !state?.providerMap) return;
            const lastCheckedAt = Number(state.lastCheckedAt ?? state.fetchedAt) || 0;
            storage.setItem(OPENDB_STORAGE_KEY, JSON.stringify({
                fetchedAt: lastCheckedAt,
                lastCheckedAt,
                rebuiltAt: state.rebuiltAt || 0,
                signature: state.signature || '',
                schemaVersion: state.schemaVersion || 0,
                format: state.format || '',
                generatedAt: state.generatedAt || '',
                baseDate: state.baseDate || '',
                baseCount: state.baseCount || 0,
                baseDistinctIsrc: state.baseDistinctIsrc || 0,
                latestDeltaDate: state.latestDeltaDate || '',
                deltaCount: state.deltaCount || 0,
                currentUpdatedAt: state.currentUpdatedAt || '',
                dataVersionAt: state.dataVersionAt || '',
                providerMap: state.providerMap
            }));
        } catch (e) {
        }
    }

    function clearOpenDbStorage() {
        _openDbState = null;
        _openDbLoadPromise = null;
        try {
            const storage = getStorage();
            if (storage) {
                storage.removeItem(OPENDB_STORAGE_KEY);
            }
        } catch (e) {
        }
    }

    function isOpenDbStateFresh(state) {
        const lastCheckedAt = Number(state?.lastCheckedAt ?? state?.fetchedAt);
        if (!state || !Number.isFinite(lastCheckedAt) || lastCheckedAt <= 0) {
            return false;
        }
        const age = now() - lastCheckedAt;
        return state.unavailable || state.networkUnavailable
            ? age < OPENDB_UNAVAILABLE_RETRY_MS
            : age < OPENDB_FRESH_MS;
    }

    function normalizeOpenDbProviderMap(value, label = '') {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            if (label) throw new Error(`OpenDB ${label} provider map is invalid`);
            return {};
        }

        const map = {};
        for (const [providerValue, list] of Object.entries(value)) {
            const provider = providerValue.trim();
            if (!provider || !Array.isArray(list)) {
                if (label) throw new Error(`OpenDB ${label} provider map is invalid`);
                continue;
            }
            const isrcs = new Set();
            for (const value of list) {
                const isrc = !label || typeof value === 'string' ? normalizeIsrc(value) : '';
                if (isrc) isrcs.add(isrc);
                else if (label) throw new Error(`OpenDB ${label} contains an invalid ISRC`);
            }
            map[provider] = [...isrcs].sort();
        }
        return map;
    }

    function validateOpenDbBasePayload(payload, manifestBase) {
        if (
            Number(payload?.schema) !== 1
            || payload?.type !== 'base'
            || payload?.format !== 'provider-map'
        ) {
            throw new Error('OpenDB base payload is not supported');
        }

        const providerMap = normalizeOpenDbProviderMap(payload.items, 'base');
        const stats = getOpenDbProviderMapStats(providerMap);
        const declaredCount = Number(manifestBase?.count);
        const declaredDistinctIsrc = Number(manifestBase?.distinctIsrc);
        if (!Number.isInteger(declaredCount) || declaredCount < 0) {
            throw new Error('OpenDB manifest base count is invalid');
        }
        if (!Number.isInteger(declaredDistinctIsrc) || declaredDistinctIsrc < 0) {
            throw new Error('OpenDB manifest base ISRC count is invalid');
        }
        if (stats.entryCount !== declaredCount) {
            throw new Error('OpenDB base row count does not match the manifest');
        }
        if (stats.distinctIsrcCount !== declaredDistinctIsrc) {
            throw new Error('OpenDB base ISRC count does not match the manifest');
        }
        if (payload.totalRows != null && Number(payload.totalRows) !== declaredCount) {
            throw new Error('OpenDB base payload row count is invalid');
        }
        if (payload.distinctIsrc != null && Number(payload.distinctIsrc) !== declaredDistinctIsrc) {
            throw new Error('OpenDB base payload ISRC count is invalid');
        }

        return { items: providerMap };
    }

    function validateOpenDbDeltaPayload(payload, expectedType, expectedDate = '') {
        if (
            Number(payload?.schema) !== 1
            || payload?.type !== expectedType
            || payload?.format !== 'provider-map-delta'
        ) {
            throw new Error(`OpenDB ${expectedType} payload is not supported`);
        }
        if (expectedDate && payload?.date && payload.date !== expectedDate) {
            throw new Error(`OpenDB ${expectedType} date does not match the manifest`);
        }

        return {
            add: normalizeOpenDbProviderMap(payload.add, `${expectedType} add`),
            remove: normalizeOpenDbProviderMap(payload.remove, `${expectedType} remove`)
        };
    }

    function mergeOpenDbProviderMap(target, source, mode = 'add') {
        if (!source) return target;
        for (const [provider, list] of Object.entries(source)) {
            const items = new Set(Array.isArray(target[provider]) ? target[provider] : []);
            for (const isrc of list) {
                if (mode === 'remove') {
                    items.delete(isrc);
                } else {
                    items.add(isrc);
                }
            }
            target[provider] = Array.from(items).sort();
        }
        return target;
    }

    function applyOpenDbPayload(providerMap, payload) {
        if (!payload || typeof payload !== 'object') return providerMap;
        mergeOpenDbProviderMap(providerMap, payload.items, 'add');
        mergeOpenDbProviderMap(providerMap, payload.add, 'add');
        mergeOpenDbProviderMap(providerMap, payload.remove, 'remove');
        return providerMap;
    }

    function getOpenDbFileUrl(value) {
        const baseUrl = new URL(OPENDB_BASE_URL);
        const fileUrl = new URL(String(value || ''), baseUrl);
        if (fileUrl.origin !== baseUrl.origin || !fileUrl.pathname.startsWith(baseUrl.pathname)) {
            throw new Error('OpenDB manifest contains an invalid file URL');
        }
        return fileUrl.toString();
    }

    function getOpenDbManifestSignature(manifest) {
        const deltas = Array.isArray(manifest?.deltas) ? manifest.deltas : [];
        return JSON.stringify({
            schema: manifest?.schema || 0,
            base: manifest?.base?.sha256 || manifest?.base?.url || '',
            deltas: deltas.map(delta => delta?.sha256 || delta?.url || delta?.date || ''),
            current: manifest?.current?.sha256 || manifest?.current?.updatedAt || manifest?.current?.url || ''
        });
    }

    function getOpenDbManifestMetadata(manifest) {
        const deltas = Array.isArray(manifest?.deltas) ? manifest.deltas : [];
        const deltaDates = deltas
            .map(delta => typeof delta?.date === 'string' ? delta.date.trim() : '')
            .filter(Boolean)
            .sort();
        const generatedAt = typeof manifest?.generatedAt === 'string'
            ? manifest.generatedAt
            : '';
        const currentUpdatedAt = typeof manifest?.current?.updatedAt === 'string'
            ? manifest.current.updatedAt
            : '';
        const latestDeltaDate = deltaDates[deltaDates.length - 1] || '';
        const baseDate = typeof manifest?.base?.date === 'string'
            ? manifest.base.date
            : '';

        return {
            schemaVersion: Number(manifest?.schema) || 0,
            format: typeof manifest?.format === 'string' ? manifest.format : '',
            generatedAt,
            baseDate,
            baseCount: Number(manifest?.base?.count) || 0,
            baseDistinctIsrc: Number(manifest?.base?.distinctIsrc) || 0,
            latestDeltaDate,
            deltaCount: deltas.length,
            currentUpdatedAt,
            dataVersionAt: currentUpdatedAt || generatedAt || latestDeltaDate || baseDate
        };
    }

    function getOpenDbCacheInfo(stateValue = null) {
        const stored = stateValue?.providerMap
            ? stateValue
            : (_openDbState?.providerMap ? _openDbState : readOpenDbStorage());
        if (!stored?.providerMap) {
            return {
                available: false,
                unavailable: false,
                networkUnavailable: false,
                stale: false,
                fetchedAt: 0,
                lastCheckedAt: 0,
                rebuiltAt: 0,
                providerCount: 0,
                entryCount: 0,
                distinctIsrcCount: 0,
                schemaVersion: 0,
                format: '',
                generatedAt: '',
                baseDate: '',
                baseCount: 0,
                baseDistinctIsrc: 0,
                latestDeltaDate: '',
                deltaCount: 0,
                currentUpdatedAt: '',
                dataVersionAt: ''
            };
        }

        const providerMap = normalizeOpenDbProviderMap(stored.providerMap);
        const { entryCount, distinctIsrcCount, providerCount } = getOpenDbProviderMapStats(providerMap);
        return {
            available: Boolean(stored.signature) || entryCount > 0,
            unavailable: stored.unavailable === true,
            networkUnavailable: stored.networkUnavailable === true,
            stale: stored.stale === true,
            fetchedAt: Number(stored.lastCheckedAt ?? stored.fetchedAt) || 0,
            lastCheckedAt: Number(stored.lastCheckedAt ?? stored.fetchedAt) || 0,
            rebuiltAt: Number(stored.rebuiltAt) || 0,
            providerCount,
            entryCount,
            distinctIsrcCount,
            schemaVersion: Number(stored.schemaVersion) || 0,
            format: stored.format || '',
            generatedAt: stored.generatedAt || '',
            baseDate: stored.baseDate || '',
            baseCount: Number(stored.baseCount) || 0,
            baseDistinctIsrc: Number(stored.baseDistinctIsrc) || 0,
            latestDeltaDate: stored.latestDeltaDate || '',
            deltaCount: Number(stored.deltaCount) || 0,
            currentUpdatedAt: stored.currentUpdatedAt || '',
            dataVersionAt: stored.dataVersionAt
                || stored.currentUpdatedAt
                || stored.generatedAt
                || stored.latestDeltaDate
                || stored.baseDate
                || ''
        };
    }

    async function fetchOpenDbJson(url) {
        const response = await fetch(url, {
            cache: 'no-store',
            headers: { Accept: 'application/json' },
            signal: createTimeoutSignal(15 * 1000)
        });
        if (!response.ok) {
            throw new Error(`OpenDB request failed: ${response.status}`);
        }
        const payload = await response.json();
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
            throw new Error('OpenDB returned an invalid JSON payload');
        }
        return payload;
    }

    async function loadOpenDbState(force = false, rebuild = false) {
        if (!force && isOpenDbStateFresh(_openDbState)) {
            return _openDbState;
        }

        const cached = readOpenDbStorage();
        if (!force && isOpenDbStateFresh(cached)) {
            _openDbState = { ...cached, providerMap: normalizeOpenDbProviderMap(cached.providerMap) };
            return _openDbState;
        }

        if (_openDbLoadPromise) {
            const pendingState = await _openDbLoadPromise;
            if (!rebuild) return pendingState;
        }

        _openDbLoadPromise = (async () => {
            try {
                const manifest = await fetchOpenDbJson(OPENDB_MANIFEST_URL);
                if (
                    Number(manifest?.schema) !== 1
                    || manifest?.format !== 'provider-map'
                    || !manifest?.base?.url
                    || !Array.isArray(manifest?.deltas)
                    || manifest.deltas.some(delta => !delta?.url)
                    || !manifest?.current?.url
                ) {
                    throw new Error('OpenDB manifest is not supported');
                }
                const signature = getOpenDbManifestSignature(manifest);
                const manifestMetadata = getOpenDbManifestMetadata(manifest);
                const stored = readOpenDbStorage();
                if (!rebuild && stored?.signature === signature && stored?.providerMap) {
                    _openDbState = {
                        ...stored,
                        ...manifestMetadata,
                        fetchedAt: now(),
                        lastCheckedAt: now(),
                        stale: false,
                        unavailable: false,
                        networkUnavailable: false,
                        providerMap: normalizeOpenDbProviderMap(stored.providerMap)
                    };
                    writeOpenDbStorage(_openDbState);
                    return _openDbState;
                }

                const providerMap = {};
                if (manifest?.base?.url) {
                    const basePayload = await fetchOpenDbJson(getOpenDbFileUrl(manifest.base.url));
                    applyOpenDbPayload(
                        providerMap,
                        validateOpenDbBasePayload(basePayload, manifest.base)
                    );
                }
                for (const delta of Array.isArray(manifest?.deltas) ? manifest.deltas : []) {
                    if (delta?.url) {
                        const deltaPayload = await fetchOpenDbJson(getOpenDbFileUrl(delta.url));
                        applyOpenDbPayload(
                            providerMap,
                            validateOpenDbDeltaPayload(deltaPayload, 'delta', delta.date || '')
                        );
                    }
                }
                if (manifest?.current?.url) {
                    const currentPayload = await fetchOpenDbJson(getOpenDbFileUrl(manifest.current.url));
                    applyOpenDbPayload(
                        providerMap,
                        validateOpenDbDeltaPayload(currentPayload, 'delta-current')
                    );
                }

                _openDbState = {
                    fetchedAt: now(),
                    lastCheckedAt: now(),
                    rebuiltAt: now(),
                    signature,
                    ...manifestMetadata,
                    stale: false,
                    unavailable: false,
                    networkUnavailable: false,
                    providerMap
                };
                writeOpenDbStorage(_openDbState);
                return _openDbState;
            } catch (error) {
                log('opendb:load-failed', {
                    message: error?.message || String(error)
                }, 'warn');
                const stored = readOpenDbStorage();
                if (stored?.providerMap) {
                    _openDbState = {
                        ...stored,
                        fetchedAt: now(),
                        lastCheckedAt: now(),
                        stale: true,
                        unavailable: false,
                        networkUnavailable: true,
                        providerMap: normalizeOpenDbProviderMap(stored.providerMap)
                    };
                    return _openDbState;
                }
                _openDbState = {
                    fetchedAt: now(),
                    lastCheckedAt: now(),
                    stale: true,
                    unavailable: true,
                    networkUnavailable: true,
                    providerMap: {}
                };
                return _openDbState;
            } finally {
                _openDbLoadPromise = null;
            }
        })();

        return await _openDbLoadPromise;
    }

    async function refreshOpenDbCache() {
        if (_openDbRefreshPromise) {
            return await _openDbRefreshPromise;
        }

        const refreshPromise = (async () => {
            const state = await loadOpenDbState(true, true);
            const info = getOpenDbCacheInfo(state);
            if (state?.unavailable || state?.networkUnavailable) {
                const error = new Error('OpenDB cache refresh failed');
                error.cacheInfo = info;
                throw error;
            }

            onRebuilt();
            return info;
        })();
        _openDbRefreshPromise = refreshPromise;

        try {
            return await refreshPromise;
        } finally {
            if (_openDbRefreshPromise === refreshPromise) {
                _openDbRefreshPromise = null;
            }
        }
    }

    function getOpenDbProvidersFromState(state, isrcValue) {
        const isrc = normalizeIsrc(isrcValue);
        if (!isrc || !state?.providerMap) return [];
        return Object.entries(state.providerMap)
            .filter(([, list]) => hasOpenDbIsrc(list, isrc))
            .map(([provider]) => ({
                provider,
                trackId: null,
                createdAt: null,
                updatedAt: null,
                source: 'opendb'
            }));
    }

    async function getOpenDbProvidersForIsrc(isrcValue) {
        const state = await loadOpenDbState();
        if (state?.unavailable) return [];
        const providers = getOpenDbProvidersFromState(state, isrcValue);
        if (state?.stale && providers.length === 0) {
            return null;
        }
        return providers;
    }

    function openDbStateHasProvider(state, isrcValue, providerValue) {
        const isrc = normalizeIsrc(isrcValue);
        const provider = typeof providerValue === 'string' ? providerValue.trim() : '';
        if (!isrc || !provider || !state?.providerMap) return false;
        const hasExact = hasOpenDbIsrc(state.providerMap[provider], isrc);
        if (hasExact) return true;
        return provider.startsWith('spotify-')
            && hasOpenDbIsrc(state.providerMap.spotify, isrc);
    }

    async function hasOpenDbSyncDataEntry(isrcValue, providerValue) {
        const state = await loadOpenDbState();
        if (state?.unavailable) return false;
        const found = openDbStateHasProvider(state, isrcValue, providerValue);
        if (state?.stale && !found) return null;
        return found;
    }

    async function isOpenDbUnavailable() {
        const state = await loadOpenDbState();
        return !!state?.unavailable;
    }

    function rememberOpenDbSyncDataEntry(isrcValue, providerValue) {
        const isrc = normalizeIsrc(isrcValue);
        const provider = typeof providerValue === 'string' ? providerValue.trim() : '';
        if (!isrc || !provider) return;

        const state = _openDbState?.providerMap
            ? _openDbState
            : (readOpenDbStorage() || {
                fetchedAt: 0,
                lastCheckedAt: 0,
                signature: '',
                providerMap: {}
            });
        const providerMap = normalizeOpenDbProviderMap(state.providerMap);
        mergeOpenDbProviderMap(providerMap, normalizeOpenDbProviderMap({ [provider]: [isrc] }), 'add');
        const hasDownloadedIndex = Boolean(state.signature);
        _openDbState = {
            ...state,
            fetchedAt: Number(state.lastCheckedAt ?? state.fetchedAt) || 0,
            lastCheckedAt: Number(state.lastCheckedAt ?? state.fetchedAt) || 0,
            stale: !hasDownloadedIndex || state.stale === true,
            unavailable: false,
            providerMap
        };
        writeOpenDbStorage(_openDbState);
    }

    return {
        clearOpenDbStorage,
        getOpenDbCacheInfo,
        refreshOpenDbCache,
        getOpenDbProvidersForIsrc,
        hasOpenDbSyncDataEntry,
        isOpenDbUnavailable,
        rememberOpenDbSyncDataEntry,
    };
}
