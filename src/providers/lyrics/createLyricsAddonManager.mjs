import { AddonRegistry } from "../addonRegistry.mjs";
import {
    LYRICS_TYPES,
    hasLyricsContent, normalizeKaraokeGranularity, getDeclaredKaraokeGranularities,
    applyKaraokeGranularity,
} from "./lyricsProviderTypes.mjs";
import { createProviderInstrumentalBreakNormalizer } from "./normalizeProviderInstrumentalBreaks.mjs";
import { createLyricsProviderCandidateLoader } from "./loadLyricsProviderCandidate.mjs";

import { createLyricsAddonPreferences } from "./lyricsAddonPreferences.mjs";
import { getAvailableSyncDataProviderIds, prioritizeProvidersWithSyncData } from "./syncDataProviderPriority.mjs";
import {
    getProviderTypeSettings, canProviderParticipateInType, isPseudoKaraoke, selectProviderCandidateForType,
} from "./lyricsProviderSelection.mjs";
import { requestLyrics } from "./lyricsProviderRequest.mjs";
import { createLyricsSearchProgress } from "./lyricsSearchProgress.mjs";
import { supersededLyricsRequest } from "../../lyrics/lyricsProviderRequests.mjs";

export function createLyricsAddonManager({
    getStoredValue, setStoredValue, readTrackItem, readTrackIdentity, readVisualSettings, readAppStorage,
    readLyricsPage, readLyricsService, readSyncDataService, readPseudoKaraoke, readInstrumentalBreaks,
    readAddonDebug, debug,
}) {
    const normalizeProviderInstrumentalBreaks = createProviderInstrumentalBreakNormalizer(readInstrumentalBreaks);
    const loadProviderCandidate = createLyricsProviderCandidateLoader({
        readLyricsService, readSyncDataService, readPseudoKaraoke,
        normalizeProviderInstrumentalBreaks, readAddonDebug, debug,
    });

    const preferences = createLyricsAddonPreferences({ getStoredValue, setStoredValue, readVisualSettings, readAppStorage });
    const requestServices = { readLyricsService, readTrackIdentity, readSyncDataService, readAddonDebug, debug };

    class LyricsAddonManager extends AddonRegistry {
        constructor() {
            super({ name: "LyricsAddonManager", type: "lyrics", debug, readAddonDebug: readAddonDebug });
            this._lyricsSearchProgress = createLyricsSearchProgress(progress => this.emit('lyrics:search:progress', progress));
        }

        getActiveLyricsSearchProgress(uri, forcedProviderId = null) {
            return this._lyricsSearchProgress.get(uri, forcedProviderId);
        }

        replayActiveLyricsSearchProgress(uri, forcedProviderId = null) {
            return this._lyricsSearchProgress.replay(uri, forcedProviderId);
        }

        clearActiveLyricsSearchProgress(uri, forcedProviderId = null) {
            this._lyricsSearchProgress.clear(uri, forcedProviderId);
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
         * - supportsAbortSignal: boolean (선택, getLyrics(info, { signal }) 지원 여부)
         * - defaultEnabled: boolean (선택, 저장값이 없을 때의 기본 활성화 여부)
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

            return this._registerAddon(addon,
                `karaoke=${addon.supports.karaoke}, synced=${addon.supports.synced}, unsynced=${addon.supports.unsynced}`);
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

        // ============================================
        // Provider Order Management
        // ============================================

        /**
         * Provider 순서 저장
         * @param {string[]} order - Provider ID 순서
         */
        setProviderOrder(order, options) {
            preferences.writeProviderOrder(order);
            debug('[LyricsAddonManager] Provider order saved:', order);

            // 이벤트 발생
            this.emit('provider:order:changed', { order });

            // 가사 새로고침 트리거
            if (options?.refreshLyrics !== false) this._triggerLyricsRefresh();
        }

        /**
         * Provider 순서 가져오기
         * @returns {string[]}
         */
        getProviderOrder() {
            return preferences.getProviderOrder(() => this.getAddonIds());
        }

        /**
         * Provider 활성화/비활성화
         * @param {string} addonId - Addon ID
         * @param {boolean} enabled - 활성화 여부
         */
        setProviderEnabled(addonId, enabled) {
            preferences.writeProviderEnabled(addonId, enabled);

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
            return preferences.readProviderEnabled(addonId, id => this.getAddon(id));
        }

        /**
         * OpenDB에 sync-data가 등록된 가사 제공자를 곡별로 우선할지 여부.
         * 저장값이 없는 기존 사용자도 기능을 바로 사용할 수 있도록 기본값은 true다.
         */
        isPreferSyncDataProviderEnabled() {
            return preferences.isPreferSyncDataProviderEnabled();
        }

        setPreferSyncDataProviderEnabled(enabled) {
            const nextValue = preferences.writePreferSyncDataProvider(enabled);
            this.emit('provider:sync-data-priority:changed', { enabled: nextValue });
            this._triggerLyricsRefresh();
        }

        /**
         * 기본값은 글자, 단어, 줄, 일반 가사 순서로 조회하고
         * 각 단계 안에서 제공자 순서를 유지하는 방식이다.
         */
        isPreferLyricsTypeOverProviderOrderEnabled() {
            return preferences.isPreferLyricsTypeEnabled();
        }

        setPreferLyricsTypeOverProviderOrderEnabled(enabled) {
            const nextValue = preferences.writePreferLyricsType(enabled);
            this.emit('provider:lyrics-type-priority:changed', { enabled: nextValue });
            this._triggerLyricsRefresh();
        }

        _getAvailableSyncDataProviderIds(trackId, trackIsrc, info) {
            return getAvailableSyncDataProviderIds(readSyncDataService, trackId, trackIsrc, info);
        }

        /**
         * OpenDB의 ISRC 인덱스에 현재 곡의 sync-data가 있으면 해당 가사 제공자들을
         * 사용자 지정 순서 안에서 안정적으로 앞으로 이동한다. 저장된 전역 순서는 바꾸지 않는다.
         */
        _prioritizeProvidersWithSyncData(providers, trackId, trackIsrc, info, syncDataProviderIds = null) {
            return prioritizeProvidersWithSyncData(
                this, readSyncDataService, providers, trackId, trackIsrc, info, syncDataProviderIds
            );
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
            preferences.writeAddonSetting(addonId, key, value);

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
            return preferences.getAddonSetting(addonId, key, defaultValue);
        }

        /**
         * 가사 새로고침 트리거 (내부 헬퍼)
         * 설정 변경 후 현재 재생 중인 트랙의 가사를 다시 불러옴
         */
        _triggerLyricsRefresh() {
            const service = readLyricsService();
            if (typeof service?.refreshLyricsProviderSelection === 'function') {
                service.refreshLyricsProviderSelection();
                return;
            }
            const page = readLyricsPage();
            if (typeof page?.fetchLyrics === 'function') {
                debug('[LyricsAddonManager] Triggering lyrics refresh for settings change');
                const currentTrack = readTrackItem();
                if (currentTrack) {
                    // refresh=true 파라미터로 캐시 무시하고 새로 불러옴
                    page.fetchLyrics(currentTrack, -1, true);
                }
            }
        }

        // ============================================
        // API Methods
        // ============================================

        isAutomaticWordSyncFallbackEnabled() {
            const provider = this.getAddon('lrcred');
            return !!provider && this.isProviderEnabled('lrcred')
                && typeof provider.requestWordSync === 'function'
                && this._getProviderTypeSettings(provider)[LYRICS_TYPES.WORD];
        }

        _getProviderTypeSettings(provider) {
            return getProviderTypeSettings(provider, (...args) => this.getAddonSetting(...args));
        }

        _canProviderParticipateInType(provider, lyricsType, typeSettings, syncDataProviderIds) {
            return canProviderParticipateInType(provider, lyricsType, typeSettings, syncDataProviderIds);
        }

        _isPseudoKaraoke(result) {
            return isPseudoKaraoke(result, readPseudoKaraoke);
        }

        _selectProviderCandidateForType(candidate, lyricsType) {
            return selectProviderCandidateForType(candidate, lyricsType);
        }

        _finalizeLyricsFetch(result, info, providerId, selectionPolicy, selectionType, publish = true) {
            const finalResult = {
                ...result,
                providerSelectionPolicy: selectionPolicy,
                providerSelectionType: selectionType
            };
            const hasKaraoke = hasLyricsContent(finalResult.karaoke);
            const hasSynced = hasLyricsContent(finalResult.synced);
            const hasUnsynced = hasLyricsContent(finalResult.unsynced);
            const selectedProvider = finalResult.provider || providerId;

            if (readAddonDebug()?.isEnabled()) {
                readAddonDebug().timeEnd('lyrics', 'getLyrics:total');
                readAddonDebug().log('lyrics', 'getLyrics success', {
                    provider: selectedProvider,
                    selectionPolicy,
                    selectionType,
                    hasKaraoke,
                    hasSynced,
                    hasUnsynced,
                    syncDataApplied: finalResult.syncDataApplied || false
                });
            }

            if (publish) {
                this.emit('lyrics:fetch:success', {
                    uri: info.uri,
                    provider: selectedProvider,
                    selectionPolicy,
                    selectionType,
                    hasKaraoke,
                    hasSynced,
                    hasUnsynced,
                    syncDataApplied: finalResult.syncDataApplied || false
                });
            }

            return finalResult;
        }

        _loadProviderCandidate(provider, info, context, typeSettings) {
            return loadProviderCandidate(provider, info, context, typeSettings, (result) => this._isPseudoKaraoke(result));
        }

        /**
         * 가사를 가져온다. 품질 우선 옵션에서는 각 제공자를 한 번만 요청하며,
         * 글자 → 단어 → 줄 → 일반 단계 안에서 사용자 지정 제공자 순서를 유지한다.
         * 같은 단계의 조회는 최대 3개씩 병렬 실행하고 결과 선택은 기존 순서를 따른다.
         */
        async getLyrics(info, forcedProviderId = null, { isCurrent = () => true, signal } = {}) {
            const isOwned = () => !signal?.aborted && isCurrent();
            const retired = () => supersededLyricsRequest(info?.uri);
            if (!isOwned()) return retired();

            const progress = this._lyricsSearchProgress.begin(info?.uri, forcedProviderId, isOwned);
            const lookup = () => requestLyrics(this, info, forcedProviderId, requestServices, {
                isCurrent: isOwned, signal, publishProgress: progress.publish,
            });
            let onAbort;
            try {
                if (!signal) return await lookup();
                const cancelled = new Promise(resolve => {
                    onAbort = () => {
                        progress.close();
                        resolve(retired());
                    };
                    signal.addEventListener("abort", onAbort, { once: true });
                });
                // Metadata and legacy add-ons may still be awaiting work that
                // cannot be aborted. Their caller and progress can retire now.
                return await Promise.race([cancelled, lookup()]);
            } finally {
                if (onAbort) signal.removeEventListener("abort", onAbort);
                progress.close();
            }
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
                const result = await provider.getLyrics(info);
                return applyKaraokeGranularity(
                    normalizeProviderInstrumentalBreaks(result, info).result
                );
            } catch (e) {
                console.error(`[LyricsAddonManager] Provider ${providerId} failed:`, e);
                return { error: e.message, uri: info.uri };
            }
        }

        // ============================================
        // Utility Methods
        // ============================================

        normalizeResult(result, info = {}) {
            return applyKaraokeGranularity(
                normalizeProviderInstrumentalBreaks(result, info).result
            );
        }

        /**
         * 특정 가사 유형을 지원하는 Provider 목록
         * @param {'character'|'word'|'synced'|'unsynced'} type - 가사 유형
         * @returns {Object[]}
         */
        getProvidersSupporting(type) {
            const normalizedType = normalizeKaraokeGranularity(type) || type;
            return this.getAddons().filter(addon => {
                if (!addon.supports) return false;
                const declaredGranularities = getDeclaredKaraokeGranularities(addon);
                if (normalizedType === LYRICS_TYPES.CHARACTER) {
                    return declaredGranularities.has(LYRICS_TYPES.CHARACTER)
                        || (declaredGranularities.size === 0 && addon.supports.karaoke === true);
                }
                if (normalizedType === LYRICS_TYPES.WORD) {
                    return declaredGranularities.has(LYRICS_TYPES.WORD)
                        || (declaredGranularities.size === 0 && addon.supports.karaoke === true);
                }
                return addon.supports[normalizedType] === true;
            });
        }

        /**
         * 가사 유형 상수
         */
        get TYPES() {
            return LYRICS_TYPES;
        }
    }

    return new LyricsAddonManager();
}
