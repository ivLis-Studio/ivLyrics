/**
 * Lyrics Addon Manager
 * 가사 제공자(Spotify, LRCLIB 등) Addon들을 관리하는 중앙 시스템
 *
 * @author ivLis STUDIO
 * @description 가사 제공자 Addon 등록 및 관리
 */

(() => {
    'use strict';

    // ============================================
    // Constants
    // ============================================

    const STORAGE_PREFIX = 'ivLyrics:lyrics:';
    const getStoredValue = (key) => window.ivLyricsStoragePersistence
        ? window.ivLyricsStoragePersistence.getItem(key)
        : Spicetify.LocalStorage.get(key);
    const setStoredValue = (key, value) => window.ivLyricsStoragePersistence
        ? window.ivLyricsStoragePersistence.setItem(key, value)
        : Spicetify.LocalStorage.set(key, value);
    const SYNC_DATA_RENDERER_VERSION = '2026-05-23-source-line-shape-1';

    // 가사 유형
    const LYRICS_TYPES = {
        KARAOKE: 'karaoke',     // 노래방 가사 (단어별 타이밍)
        SYNCED: 'synced',       // 싱크 가사 (줄별 타이밍)
        UNSYNCED: 'unsynced'    // 일반 가사 (타이밍 없음)
    };

    function hasLyricsContent(lines) {
        return Array.isArray(lines) && lines.length > 0;
    }

    // ============================================
    // LyricsAddonManager Class
    // ============================================

    class LyricsAddonManager {
        constructor() {
            this._addons = new Map();
            this._initialized = false;
            this._initPromise = null;
            this._events = new Map();
            this._onceEvents = new Map();
            this._marketplaceAddons = new Set(); // 마켓플레이스에서 설치된 에드온 추적
        }

        // ============================================
        // EventEmitter Methods
        // ============================================

        /**
         * 이벤트 리스너 등록
         * @param {string} event - 이벤트 이름
         * @param {Function} listener - 콜백 함수
         * @returns {Function} unsubscribe 함수
         */
        on(event, listener) {
            if (!this._events.has(event)) {
                this._events.set(event, new Set());
            }
            this._events.get(event).add(listener);
            return () => this.off(event, listener);
        }

        /**
         * 일회성 이벤트 리스너 등록
         */
        once(event, listener) {
            if (!this._onceEvents.has(event)) {
                this._onceEvents.set(event, new Set());
            }
            this._onceEvents.get(event).add(listener);
        }

        /**
         * 이벤트 리스너 제거
         */
        off(event, listener) {
            if (this._events.has(event)) {
                this._events.get(event).delete(listener);
            }
            if (this._onceEvents.has(event)) {
                this._onceEvents.get(event).delete(listener);
            }
        }

        /**
         * 이벤트 발생
         */
        emit(event, ...args) {
            // 디버그 로깅
            if (window.AddonDebug?.isEnabled()) {
                window.AddonDebug.log('events', `LyricsAddonManager.emit: ${event}`, args[0]);
            }

            if (this._events.has(event)) {
                for (const listener of this._events.get(event)) {
                    try {
                        listener(...args);
                    } catch (e) {
                        console.error(`[LyricsAddonManager] Error in listener for "${event}":`, e);
                    }
                }
            }

            if (this._onceEvents.has(event)) {
                const onceListeners = this._onceEvents.get(event);
                this._onceEvents.delete(event);
                for (const listener of onceListeners) {
                    try {
                        listener(...args);
                    } catch (e) {
                        console.error(`[LyricsAddonManager] Error in once listener for "${event}":`, e);
                    }
                }
            }
        }

        /**
         * 초기화
         */
        async init() {
            if (this._initialized) return;
            if (this._initPromise) return this._initPromise;

            this._initPromise = (async () => {
                window.__ivLyricsDebugLog?.('[LyricsAddonManager] Initializing...');

                // 등록된 모든 Addon 초기화
                for (const [id, addon] of this._addons) {
                    try {
                        if (typeof addon.init === 'function') {
                            await addon.init();
                        }
                        window.__ivLyricsDebugLog?.(`[LyricsAddonManager] Addon "${id}" initialized`);
                    } catch (e) {
                        console.error(`[LyricsAddonManager] Failed to initialize addon "${id}":`, e);
                    }
                }

                this._initialized = true;
                window.__ivLyricsDebugLog?.('[LyricsAddonManager] Initialization complete');
            })();

            return this._initPromise;
        }

        /**
         * Addon 등록
         * @param {Object} addon - Addon 객체
         *
         * 필수 필드:
         * - id: string (고유 ID)
         * - name: string (표시 이름)
         * - author: string (제작자)
         * - description: string | { en: string, ko: string, ... } (설명)
         * - version: string (버전)
         * - supports: { karaoke: boolean, synced: boolean, unsynced: boolean } (지원 가사 유형)
         * - supportsLocalTracks: boolean (선택, Spotify 트랙 ID 없이 조회 가능 여부)
         *
         * 필수 메서드:
         * - getLyrics(info): Promise<LyricsResult> (가사 가져오기)
         *
         * 선택 메서드:
         * - getSettingsUI(): React.Component (설정 UI)
         * - init(): Promise<void> (초기화)
         */
        register(addon) {
            if (!addon || !addon.id) {
                console.error('[LyricsAddonManager] Invalid addon: missing id');
                return false;
            }

            // 필수 필드 검증
            const requiredFields = ['id', 'name', 'author', 'description', 'version', 'supports'];
            for (const field of requiredFields) {
                if (!addon[field]) {
                    console.error(`[LyricsAddonManager] Invalid addon "${addon.id}": missing ${field}`);
                    return false;
                }
            }

            // supports 필드 검증
            if (typeof addon.supports !== 'object') {
                console.error(`[LyricsAddonManager] Invalid addon "${addon.id}": supports must be an object`);
                return false;
            }

            // 필수 메서드 검증
            if (typeof addon.getLyrics !== 'function') {
                console.error(`[LyricsAddonManager] Invalid addon "${addon.id}": missing getLyrics()`);
                return false;
            }

            this._addons.set(addon.id, addon);
            window.__ivLyricsDebugLog?.(`[LyricsAddonManager] Registered addon: ${addon.id} (${addon.name})`);
            window.__ivLyricsDebugLog?.(`[LyricsAddonManager] Supports: karaoke=${addon.supports.karaoke}, synced=${addon.supports.synced}, unsynced=${addon.supports.unsynced}`);

            // 이미 초기화 완료된 경우, 새 Addon도 초기화
            if (this._initialized && typeof addon.init === 'function') {
                addon.init().catch(e => {
                    console.error(`[LyricsAddonManager] Failed to late-init addon "${addon.id}":`, e);
                });
            }

            // 이벤트 발생
            this.emit('addon:registered', { id: addon.id, name: addon.name, type: 'lyrics' });

            return true;
        }

        /**
         * Addon 등록 검증 (상세 에러 메시지)
         * @param {Object} addon - 검증할 Addon 객체
         * @returns {{ valid: boolean, errors: string[] }}
         */
        validate(addon) {
            const errors = [];

            if (!addon) {
                errors.push('Addon object is null or undefined');
                return { valid: false, errors };
            }

            // 필수 필드 검증
            const requiredFields = ['id', 'name', 'author', 'description', 'version', 'supports'];
            for (const field of requiredFields) {
                if (!addon[field]) {
                    errors.push(`Missing required field: "${field}"`);
                }
            }

            // supports 객체 검증
            if (addon.supports) {
                if (typeof addon.supports !== 'object') {
                    errors.push('Field "supports" must be an object');
                } else {
                    const supportTypes = ['karaoke', 'synced', 'unsynced'];
                    for (const type of supportTypes) {
                        if (typeof addon.supports[type] !== 'boolean') {
                            errors.push(`Field "supports.${type}" must be a boolean`);
                        }
                    }
                }
            }

            // 필수 메서드 검증
            if (typeof addon.getLyrics !== 'function') {
                errors.push('Missing required method: getLyrics(info)');
            }

            // 선택 메서드 타입 검증
            if (addon.init && typeof addon.init !== 'function') {
                errors.push('Field "init" must be a function if provided');
            }
            if (addon.getSettingsUI && typeof addon.getSettingsUI !== 'function') {
                errors.push('Field "getSettingsUI" must be a function if provided');
            }

            return { valid: errors.length === 0, errors };
        }

        /**
         * Addon 해제
         * @param {string} addonId - Addon ID
         */
        unregister(addonId) {
            if (this._addons.has(addonId)) {
                const addon = this._addons.get(addonId);
                this._addons.delete(addonId);
                this._marketplaceAddons.delete(addonId);
                window.__ivLyricsDebugLog?.(`[LyricsAddonManager] Unregistered addon: ${addonId}`);

                // 이벤트 발생
                this.emit('addon:unregistered', { id: addonId, name: addon?.name });

                return true;
            }
            return false;
        }

        /**
         * 마켓플레이스 에드온으로 표시
         * @param {string} addonId - Addon ID
         */
        markAsMarketplaceAddon(addonId) {
            this._marketplaceAddons.add(addonId);
        }

        /**
         * 마켓플레이스 에드온 여부 확인
         * @param {string} addonId - Addon ID
         * @returns {boolean}
         */
        isMarketplaceAddon(addonId) {
            return this._marketplaceAddons.has(addonId);
        }

        /**
         * Addon 가져오기
         * @param {string} addonId - Addon ID
         * @returns {Object|null}
         */
        getAddon(addonId) {
            return this._addons.get(addonId) || null;
        }

        /**
         * 모든 Addon 목록 가져오기
         * @returns {Object[]}
         */
        getAddons() {
            return Array.from(this._addons.values());
        }

        /**
         * Addon ID 목록 가져오기
         * @returns {string[]}
         */
        getAddonIds() {
            return Array.from(this._addons.keys());
        }

        // ============================================
        // Provider Order Management
        // ============================================

        /**
         * Provider 순서 저장
         * @param {string[]} order - Provider ID 순서
         */
        setProviderOrder(order) {
            setStoredValue(STORAGE_PREFIX + 'provider-order', JSON.stringify(order));
            window.__ivLyricsDebugLog?.('[LyricsAddonManager] Provider order saved:', order);

            // 이벤트 발생
            this.emit('provider:order:changed', { order });

            // 가사 새로고침 트리거
            this._triggerLyricsRefresh();
        }

        /**
         * Provider 순서 가져오기
         * @returns {string[]}
         */
        getProviderOrder() {
            let order = [];
            const stored = getStoredValue(STORAGE_PREFIX + 'provider-order');

            if (stored) {
                try {
                    order = JSON.parse(stored);
                } catch {
                    // Ignore error
                }
            }

            // Get all currently registered addons
            const allAddonIds = this.getAddonIds();

            // If we have a stored order, we need to make sure it contains all current addons
            if (order.length > 0) {
                // Filter out any IDs that no longer exist (uninstalled)
                order = order.filter(id => allAddonIds.includes(id));

                // Add any new IDs that aren't in the order yet
                const orderedIds = new Set(order);
                const newIds = allAddonIds.filter(id => !orderedIds.has(id));
                order = [...order, ...newIds];

                return order;
            }

            // Default: validation order (registered order)
            return allAddonIds;
        }

        /**
         * Provider 활성화/비활성화
         * @param {string} addonId - Addon ID
         * @param {boolean} enabled - 활성화 여부
         */
        setProviderEnabled(addonId, enabled) {
            setStoredValue(STORAGE_PREFIX + `enabled:${addonId}`, enabled ? 'true' : 'false');

            // 이벤트 발생
            this.emit('provider:enabled:changed', { id: addonId, enabled });

            // 가사 새로고침 트리거
            this._triggerLyricsRefresh();
        }

        /**
         * Provider 활성화 여부 확인
         * @param {string} addonId - Addon ID
         * @returns {boolean}
         */
        isProviderEnabled(addonId) {
            const stored = getStoredValue(STORAGE_PREFIX + `enabled:${addonId}`);
            // 기본값은 true
            return stored !== 'false';
        }

        /**
         * 활성화된 Provider 목록 (순서대로)
         * @returns {Object[]}
         */
        getEnabledProviders() {
            const order = this.getProviderOrder();
            return order
                .filter(id => this.isProviderEnabled(id) && this._addons.has(id))
                .map(id => this._addons.get(id));
        }

        // ============================================
        // Addon Settings Storage
        // ============================================

        /**
         * Addon 설정 저장
         * @param {string} addonId - Addon ID
         * @param {string} key - 설정 키
         * @param {*} value - 설정 값
         */
        setAddonSetting(addonId, key, value) {
            const storageKey = `${STORAGE_PREFIX}addon:${addonId}:${key}`;
            const serialized = typeof value === 'string' ? value : JSON.stringify(value);
            setStoredValue(storageKey, serialized);

            // 이벤트 발생 (설정 변경 알림)
            this.emit('addon:setting:changed', { id: addonId, key, value });

            // 가사 관련 설정이 변경되면 가사 새로고침
            if (key.startsWith('enable_')) {
                this._triggerLyricsRefresh();
            }
        }

        /**
         * Addon 설정 가져오기
         * @param {string} addonId - Addon ID
         * @param {string} key - 설정 키
         * @param {*} defaultValue - 기본값
         * @returns {*}
         */
        getAddonSetting(addonId, key, defaultValue = null) {
            const storageKey = `${STORAGE_PREFIX}addon:${addonId}:${key}`;
            const value = getStoredValue(storageKey);

            if (value === null || value === undefined) {
                return defaultValue;
            }

            // JSON 파싱 시도
            try {
                return JSON.parse(value);
            } catch {
                return value;
            }
        }

        /**
         * 가사 새로고침 트리거 (내부 헬퍼)
         * 설정 변경 후 현재 재생 중인 트랙의 가사를 다시 불러옴
         */
        _triggerLyricsRefresh() {
            if (window.lyricContainer && typeof window.lyricContainer.fetchLyrics === 'function') {
                window.__ivLyricsDebugLog?.('[LyricsAddonManager] Triggering lyrics refresh for settings change');
                const currentTrack = Spicetify.Player.data?.item;
                if (currentTrack) {
                    // refresh=true 파라미터로 캐시 무시하고 새로 불러옴
                    window.lyricContainer.fetchLyrics(currentTrack, -1, true);
                }
            }
        }

        // ============================================
        // API Methods
        // ============================================

        /**
         * 가사 가져오기 (개선된 로직)
         * 
         * 흐름:
         * 1. Provider에서 가사 가져오기
         * 2. 사용자가 원하는 가사 유형 확인 (karaoke, synced, unsynced)
         * 3. karaoke가 필요한데 없으면 → sync-data 조회
         * 4. sync-data로 karaoke 생성
         * 5. 사용자 설정에 따라 필터링
         * 6. 허용된 가사가 있으면 반환, 없으면 다음 Provider
         * 
         * @param {Object} info - 트랙 정보 { uri, title, artist, album, duration }
         * @param {string|null} forcedProviderId - 이 요청에서 강제로 사용할 제공자 ID
         * @returns {Promise<LyricsResult|null>}
         */
        async getLyrics(info, forcedProviderId = null) {
            const trackId = window.LyricsService?.extractTrackId?.(info.uri)
                || window.ivLyricsTrackIdentity?.extractTrackId?.(info.uri)
                || '';
            const lyricsCacheId = trackId || (info?.uri ? `local-uri:${info.uri}` : '');
            const allEnabledProviders = this.getEnabledProviders();
            const availableProviders = trackId
                ? allEnabledProviders
                : allEnabledProviders.filter(provider => provider.supportsLocalTracks === true);
            const enabledProviders = forcedProviderId
                ? availableProviders.filter(provider => provider.id === forcedProviderId)
                : availableProviders;
            const trackIsrc = (trackId ? await window.SyncDataService?.resolveTrackIsrc?.(trackId, info) : null)
                || window.SyncDataService?.getTrackIsrc?.(trackId, info)
                || window.SyncDataService?.normalizeSyncDataIsrc?.(info?.isrc || info?.external_ids?.isrc || info?.externalIds?.isrc);
            console.info('[ivLyrics sync-data]', 'LyricsAddonManager:getLyrics:start', {
                uri: info.uri,
                trackId,
                resolvedIsrc: trackIsrc || null,
                forcedProviderId,
                enabledProviders: enabledProviders.map(provider => provider.id)
            });

            // 디버그 로깅
            if (window.AddonDebug?.isEnabled()) {
                window.AddonDebug.log('lyrics', 'getLyrics called', {
                    uri: info.uri,
                    title: info.title,
                    artist: info.artist,
                    providers: enabledProviders.map(p => p.id),
                    forcedProviderId
                });
                window.AddonDebug.time('lyrics', 'getLyrics:total');
            }

            // 이벤트 발생
            this.emit('lyrics:fetch:start', { uri: info.uri, title: info.title, artist: info.artist });

            if (enabledProviders.length === 0) {
                const error = {
                    error: forcedProviderId ? 'Selected lyrics provider is not available' : 'No lyrics providers enabled',
                    uri: info.uri,
                    provider: forcedProviderId || null
                };
                console.warn('[LyricsAddonManager]', error.error, forcedProviderId || '');
                this.emit('lyrics:fetch:error', { ...error, reason: forcedProviderId ? 'provider_unavailable' : 'no_providers' });
                return error;
            }

            for (const provider of enabledProviders) {
                try {
                    window.__ivLyricsDebugLog?.(`[LyricsAddonManager] Trying provider: ${provider.id}`);

                    // 사용자 설정 확인 (먼저 확인해서 최적화)
                    const allowKaraoke = this.getAddonSetting(provider.id, 'enable_karaoke', true);
                    const allowSynced = this.getAddonSetting(provider.id, 'enable_synced', true);
                    const allowUnsynced = this.getAddonSetting(provider.id, 'enable_unsynced', true);

                    window.__ivLyricsDebugLog?.(`[LyricsAddonManager] User settings for ${provider.id}: karaoke=${allowKaraoke}, synced=${allowSynced}, unsynced=${allowUnsynced}`);

                    // 모든 유형이 비활성화되면 이 provider 건너뜀
                    if (!allowKaraoke && !allowSynced && !allowUnsynced) {
                        window.__ivLyricsDebugLog?.(`[LyricsAddonManager] All lyrics types disabled for ${provider.id}, skipping`);
                        continue;
                    }

                    // 디버그 타이머
                    if (window.AddonDebug?.isEnabled()) {
                        window.AddonDebug.time('lyrics', `provider:${provider.id}`);
                    }

                    // 0. IndexedDB 캐시 확인
                    let result = null;
                    let cacheHit = false;
                    let providerFetched = false;
                    let syncDataAppliedThisCall = false;
                    let pseudoKaraokeChanged = false;
                    if (lyricsCacheId && window.LyricsService?.getCachedLyrics) {
                        try {
                            const cached = await window.LyricsService.getCachedLyrics(lyricsCacheId, provider.id);
                            const isProviderCacheCurrent = cached && (!provider.cacheVersion || cached.cacheVersion === provider.cacheVersion);
                            const isSyncDataRendererCurrent = !cached?.syncDataApplied
                                || cached.syncDataRendererVersion === SYNC_DATA_RENDERER_VERSION;
                            if (isProviderCacheCurrent && isSyncDataRendererCurrent) {
                                result = cached;
                                cacheHit = true;
                                window.__ivLyricsDebugLog?.(`[LyricsAddonManager] Cache hit for ${provider.id}`);
                            } else if (isProviderCacheCurrent && !isSyncDataRendererCurrent) {
                                window.__ivLyricsDebugLog?.(`[LyricsAddonManager] Sync-data renderer cache mismatch for ${provider.id}, refetching...`);
                            } else if (cached) {
                                window.__ivLyricsDebugLog?.(`[LyricsAddonManager] Cache version mismatch for ${provider.id}, refetching...`);
                            }
                        } catch (e) {
                            console.warn(`[LyricsAddonManager] Cache lookup failed for ${provider.id}:`, e);
                        }
                    }

                    // 1. 캐시 miss 시 Provider에서 가사 가져오기
                    if (!result) {
                        result = await provider.getLyrics(info);
                        providerFetched = true;
                    }

                    // 디버그 타이머 종료
                    if (window.AddonDebug?.isEnabled()) {
                        window.AddonDebug.timeEnd('lyrics', `provider:${provider.id}`);
                    }

                    if (!result || result.error) {
                        window.__ivLyricsDebugLog?.(`[LyricsAddonManager] Provider ${provider.id} returned error:`, result?.error);
                        continue;
                    }

                    const resultHasKaraoke = hasLyricsContent(result.karaoke);
                    const resultHasSynced = hasLyricsContent(result.synced);
                    const resultHasUnsynced = hasLyricsContent(result.unsynced);

                    window.__ivLyricsDebugLog?.(`[LyricsAddonManager] Got lyrics from: ${provider.id}`, {
                        hasKaraoke: resultHasKaraoke,
                        hasSynced: resultHasSynced,
                        hasUnsynced: resultHasUnsynced,
                        provider: result.provider
                    });

                    // 2. karaoke가 필요한데 없으면 sync-data 조회
                    const needsKaraoke = allowKaraoke && (
                        !resultHasKaraoke
                        || window.PseudoKaraokeService?.isPseudoSource?.(result.karaokeSource)
                    );
                    const hasBaseLyrics = resultHasSynced || resultHasUnsynced;
                    console.info('[ivLyrics sync-data]', 'LyricsAddonManager:sync-check', {
                        providerId: provider.id,
                        resultProvider: result.provider || null,
                        allowKaraoke,
                        hasKaraoke: resultHasKaraoke,
                        hasSynced: resultHasSynced,
                        hasUnsynced: resultHasUnsynced,
                        needsKaraoke,
                        hasBaseLyrics,
                        isrc: trackIsrc || null,
                        hasSyncDataService: !!window.SyncDataService?.getSyncData
                    });

                    if (needsKaraoke && hasBaseLyrics) {
                        window.__ivLyricsDebugLog?.(`[LyricsAddonManager] Karaoke needed but not available, checking sync-data for ${provider.id}...`);

                        // sync-data 조회 시도
                        if ((trackId || trackIsrc) && window.SyncDataService?.getSyncData) {
                            try {
                                const syncProvider = result.provider || provider.id;
                                window.__ivLyricsDebugLog?.(`[LyricsAddonManager] Fetching sync-data for isrc=${trackIsrc || 'missing'}, provider=${syncProvider}`);
                                console.info('[ivLyrics sync-data]', 'LyricsAddonManager:calling-getSyncData', {
                                    trackId,
                                    isrc: trackIsrc || null,
                                    provider: syncProvider
                                });

                                const syncData = await window.SyncDataService.getSyncData(trackId, syncProvider, { ...info, isrc: trackIsrc });
                                console.info('[ivLyrics sync-data]', 'LyricsAddonManager:getSyncData-result', {
                                    provider: syncProvider,
                                    found: !!syncData,
                                    hasSyncData: !!syncData?.syncData
                                });

                                if (syncData && syncData.syncData) {
                                    window.__ivLyricsDebugLog?.(`[LyricsAddonManager] Found sync-data, applying...`);

                                    // sync-data를 가사에 적용하여 karaoke 생성
                                    const baseLyrics = resultHasSynced ? result.synced : result.unsynced;
                                    const karaoke = window.SyncDataService.applySyncDataToLyrics(baseLyrics, syncData, {
                                        durationMs: info.durationMs || info.duration_ms || info.duration,
                                        trackInfo: info
                                    });

                                    if (hasLyricsContent(karaoke)) {
                                        result.karaoke = karaoke;
                                        result.karaokeSource = 'sync-data';
                                        delete result.pseudoKaraokeCacheVersion;
                                        result.syncDataApplied = true;
                                        result.syncDataProvider = syncProvider;
                                        result.syncDataRendererVersion = SYNC_DATA_RENDERER_VERSION;
                                        syncDataAppliedThisCall = true;

                                        // 기여자 정보 추가
                                        if (syncData.contributors || syncData.syncData?.contributors) {
                                            result.contributors = syncData.contributors || syncData.syncData.contributors;
                                        }
                                        // sync-data에서 synced도 업데이트 (더 정확한 타이밍)
                                        if (window.SyncDataService.convertKaraokeToSynced) {
                                            const syncedFromKaraoke = window.SyncDataService.convertKaraokeToSynced(karaoke);
                                            if (hasLyricsContent(syncedFromKaraoke)) {
                                                result.synced = syncedFromKaraoke;
                                            }
                                        }

                                        window.__ivLyricsDebugLog?.(`[LyricsAddonManager] Karaoke created from sync-data (${karaoke.length} lines)`);
                                    }
                                } else {
                                    window.__ivLyricsDebugLog?.(`[LyricsAddonManager] No sync-data found for ${syncProvider}`);
                                }
                            } catch (e) {
                                console.warn(`[LyricsAddonManager] Failed to get sync-data:`, e);
                            }
                        } else if (provider.useIvLyricsSync && window.LyricsService?.applyIvLyricsSyncData) {
                            // 레거시 방식: LyricsService.applyIvLyricsSyncData 사용
                            window.__ivLyricsDebugLog?.(`[LyricsAddonManager] Using legacy applyIvLyricsSyncData for ${provider.id}...`);
                            try {
                                const karaokeBeforeSyncData = result.karaoke;
                                const syncedBeforeSyncData = result.synced;
                                const syncDataAppliedBefore = result.syncDataApplied;
                                const syncResult = await window.LyricsService.applyIvLyricsSyncData(result);
                                if (syncResult) {
                                    Object.assign(result, syncResult);
                                    syncDataAppliedThisCall = !!result.syncDataApplied && (
                                        result.karaoke !== karaokeBeforeSyncData
                                        || result.synced !== syncedBeforeSyncData
                                        || result.syncDataApplied !== syncDataAppliedBefore
                                    );
                                    window.__ivLyricsDebugLog?.(`[LyricsAddonManager] Legacy sync-data applied, hasKaraoke: ${hasLyricsContent(result.karaoke)}`);
                                }
                            } catch (e) {
                                console.warn(`[LyricsAddonManager] Failed to apply legacy sync data:`, e);
                            }
                        }
                    }

                    // 3. line-synced 가사에 대한 pseudo karaoke를 중앙 서비스에서 합성
                    if (window.PseudoKaraokeService?.applyToResult) {
                        try {
                            const karaokeBeforePseudo = result.karaoke;
                            const karaokeSourceBeforePseudo = result.karaokeSource;
                            const pseudoCacheVersionBeforePseudo = result.pseudoKaraokeCacheVersion;
                            const pseudoResult = await window.PseudoKaraokeService.applyToResult(result, info);
                            if (pseudoResult) {
                                Object.assign(result, pseudoResult);
                            }
                            pseudoKaraokeChanged = result.karaoke !== karaokeBeforePseudo
                                || result.karaokeSource !== karaokeSourceBeforePseudo
                                || result.pseudoKaraokeCacheVersion !== pseudoCacheVersionBeforePseudo;
                        } catch (e) {
                            console.warn(`[LyricsAddonManager] Failed to apply pseudo karaoke:`, e);
                        }
                    }

                    // 4. 사용자 설정에 따라 필터링
                    const finalResult = { ...result };
                    if (finalResult.syncDataApplied) {
                        finalResult.syncDataRendererVersion = SYNC_DATA_RENDERER_VERSION;
                    }
                    if (!allowKaraoke) finalResult.karaoke = null;
                    if (!allowSynced) finalResult.synced = null;
                    if (!allowUnsynced) finalResult.unsynced = null;

                    const hasKaraoke = hasLyricsContent(finalResult.karaoke);
                    const hasSynced = hasLyricsContent(finalResult.synced);
                    const hasUnsynced = hasLyricsContent(finalResult.unsynced);

                    window.__ivLyricsDebugLog?.(`[LyricsAddonManager] After filtering for ${provider.id}:`, {
                        hasKaraoke,
                        hasSynced,
                        hasUnsynced
                    });

                    // 5. 허용된 가사가 있으면 반환
                    if (hasKaraoke || hasSynced || hasUnsynced) {
                        // 디버그 타이머 종료
                        if (window.AddonDebug?.isEnabled()) {
                            window.AddonDebug.timeEnd('lyrics', 'getLyrics:total');
                            window.AddonDebug.log('lyrics', 'getLyrics success', {
                                provider: finalResult.provider,
                                hasKaraoke,
                                hasSynced,
                                hasUnsynced,
                                syncDataApplied: finalResult.syncDataApplied || false
                            });
                        }

                        // 이벤트 발생
                        this.emit('lyrics:fetch:success', {
                            uri: info.uri,
                            provider: finalResult.provider,
                            hasKaraoke,
                            hasSynced,
                            hasUnsynced,
                            syncDataApplied: finalResult.syncDataApplied || false
                        });

                        // IndexedDB에 캐시 저장
                        const shouldUpdateCache = (!cacheHit && providerFetched)
                            || syncDataAppliedThisCall
                            || pseudoKaraokeChanged;
                        if (lyricsCacheId && window.LyricsService?.cacheLyrics && !result.skipCache && shouldUpdateCache) {
                            const cachePayload = { ...result };
                            if (cachePayload.syncDataApplied) {
                                cachePayload.syncDataRendererVersion = SYNC_DATA_RENDERER_VERSION;
                            }
                            delete cachePayload.skipCache;
                            window.LyricsService.cacheLyrics(lyricsCacheId, provider.id, cachePayload);
                        }

                        return finalResult;
                    }

                    // 6. 필터링 후 가사가 없으면 다음 provider 시도
                    window.__ivLyricsDebugLog?.(`[LyricsAddonManager] Lyrics from ${provider.id} filtered out by user settings or empty`);

                } catch (e) {
                    console.warn(`[LyricsAddonManager] Provider ${provider.id} failed:`, e);

                    // 디버그 로깅
                    if (window.AddonDebug?.isEnabled()) {
                        window.AddonDebug.error('lyrics', `Provider ${provider.id} error`, e);
                    }
                }
            }

            // 디버그 타이머 종료
            if (window.AddonDebug?.isEnabled()) {
                window.AddonDebug.timeEnd('lyrics', 'getLyrics:total');
                window.AddonDebug.warn('lyrics', 'No lyrics found from any provider');
            }

            // 이벤트 발생
            const errorResult = { error: 'No lyrics found', uri: info.uri };
            this.emit('lyrics:fetch:error', { ...errorResult, reason: 'not_found' });

            return errorResult;
        }

        /**
         * 특정 Provider에서 가사 가져오기
         * @param {string} providerId - Provider ID
         * @param {Object} info - 트랙 정보
         * @returns {Promise<LyricsResult|null>}
         */
        async getLyricsFrom(providerId, info) {
            const provider = this.getAddon(providerId);
            if (!provider) {
                console.error(`[LyricsAddonManager] Provider not found: ${providerId}`);
                return { error: 'Provider not found', uri: info.uri };
            }

            try {
                return await provider.getLyrics(info);
            } catch (e) {
                console.error(`[LyricsAddonManager] Provider ${providerId} failed:`, e);
                return { error: e.message, uri: info.uri };
            }
        }

        // ============================================
        // Utility Methods
        // ============================================

        /**
         * 특정 가사 유형을 지원하는 Provider 목록
         * @param {'karaoke'|'synced'|'unsynced'} type - 가사 유형
         * @returns {Object[]}
         */
        getProvidersSupporting(type) {
            return this.getAddons().filter(addon =>
                addon.supports && addon.supports[type] === true
            );
        }

        /**
         * 가사 유형 상수
         */
        get TYPES() {
            return LYRICS_TYPES;
        }
    }

    // ============================================
    // Global Registration
    // ============================================

    const manager = new LyricsAddonManager();
    window.LyricsAddonManager = manager;

    // Spicetify가 준비되면 초기화
    const initWhenReady = () => {
        if (Spicetify?.LocalStorage) {
            manager.init().catch(e => {
                console.error('[LyricsAddonManager] Init failed:', e);
            });
        } else {
            setTimeout(initWhenReady, 100);
        }
    };

    initWhenReady();

    window.__ivLyricsDebugLog?.('[LyricsAddonManager] Module loaded');
})();
