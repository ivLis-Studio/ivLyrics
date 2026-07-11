/**
 * AI Addon Manager
 * AI 제공자(Gemini, ChatGPT 등) Addon들을 관리하는 중앙 시스템
 * 
 * @author ivLis STUDIO
 * @description 번역, 발음, TMI 생성을 위한 AI Addon 등록 및 관리
 */

(() => {
    'use strict';

    // ============================================
    // Constants
    // ============================================

    const STORAGE_PREFIX = 'ivLyrics:ai:';
    const getStoredValue = (key) => window.ivLyricsStoragePersistence
        ? window.ivLyricsStoragePersistence.getItem(key)
        : Spicetify.LocalStorage.get(key);
    const setStoredValue = (key, value) => window.ivLyricsStoragePersistence
        ? window.ivLyricsStoragePersistence.setItem(key, value)
        : Spicetify.LocalStorage.set(key, value);

    // 기능 유형
    const AI_CAPABILITIES = {
        TRANSLATE: 'translate',    // 가사 번역/발음
        METADATA: 'metadata',      // 메타데이터 번역
        TMI: 'tmi',                // TMI 생성
        LYRICS_STUDY: 'lyricsStudy', // 가사 기반 학습 모드 생성
        CHARACTER_PRONUNCIATION: 'characterPronunciation' // 문자별 발음
    };

    // 기본 활성화 Addon (모든 AI Addon은 API 키 설정 후 활성화 권장)
    const DEFAULT_ENABLED_ADDONS = [];
    const CHARACTER_PRONUNCIATION_CJK_LANG_RE = /^(ja|jp|ko|kr|zh|zh-cn|zh-tw|cn|tw|yue|cmn)$/i;
    const CHARACTER_PRONUNCIATION_CJK_SCRIPT_RE = /[\u3040-\u30ff\uff66-\uff9f\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af\u1100-\u11ff\u3130-\u318f]/u;
    const CHARACTER_PRONUNCIATION_WORD_TEXT_RE = /[\p{L}\p{N}]/u;

    // ============================================
    // AIAddonManager Class
    // ============================================

    class AIAddonManager {
        constructor() {
            this._addons = new Map();
            this._initialized = false;
            this._initPromise = null;

            // EventEmitter 믹스인
            this._events = new Map();
            this._onceEvents = new Map();
            this._marketplaceAddons = new Set(); // 마켓플레이스에서 설치된 에드온 추적
        }

        // ============================================
        // Helpers
        // ============================================

        _t(key, fallback) {
            if (window.I18n && typeof window.I18n.t === 'function') {
                return window.I18n.t(key) || fallback;
            }
            return fallback;
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
                window.AddonDebug.log('events', `AIAddonManager.emit: ${event}`, args[0]);
            }

            if (this._events.has(event)) {
                for (const listener of this._events.get(event)) {
                    try {
                        listener(...args);
                    } catch (e) {
                        console.error(`[AIAddonManager] Error in listener for "${event}":`, e);
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
                        console.error(`[AIAddonManager] Error in once listener for "${event}":`, e);
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
                window.__ivLyricsDebugLog?.('[AIAddonManager] Initializing...');

                // 등록된 모든 Addon 초기화
                for (const [id, addon] of this._addons) {
                    try {
                        if (typeof addon.init === 'function') {
                            await addon.init();
                        }
                        window.__ivLyricsDebugLog?.(`[AIAddonManager] Addon "${id}" initialized`);
                    } catch (e) {
                        console.error(`[AIAddonManager] Failed to initialize addon "${id}":`, e);
                    }
                }

                this._initialized = true;
                window.__ivLyricsDebugLog?.('[AIAddonManager] Initialization complete');
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
         * - supports: { translate: boolean, metadata: boolean, tmi: boolean, lyricsStudy: boolean, characterPronunciation: boolean } (지원 기능)
         * 
         * 필수 메서드:
         * - getSettingsUI(): React.Component (설정 UI)
         * 
         * 기능별 메서드:
         * - translateLyrics(params): Promise<Object> (supports.translate = true인 경우)
         * - translateMetadata(params): Promise<Object> (supports.metadata = true인 경우)
         * - generateTMI(params): Promise<Object> (supports.tmi = true인 경우)
         * - generateLyricsStudy(params): Promise<Object> (supports.lyricsStudy = true인 경우)
         * - generateCharacterPronunciation(params): Promise<Object> (supports.characterPronunciation = true인 경우)
         */
        register(addon) {
            if (!addon || !addon.id) {
                console.error('[AIAddonManager] Invalid addon: missing id');
                return false;
            }

            // 필수 필드 검증
            const requiredFields = ['id', 'name', 'author', 'description', 'version'];
            for (const field of requiredFields) {
                if (!addon[field]) {
                    console.error(`[AIAddonManager] Invalid addon "${addon.id}": missing ${field}`);
                    return false;
                }
            }

            // supports 필드 기본값 설정 (기존 Addon 호환성)
            if (!addon.supports) {
                addon.supports = {
                    translate: typeof addon.translateLyrics === 'function',
                    metadata: typeof addon.translateMetadata === 'function',
                    tmi: typeof addon.generateTMI === 'function',
                    lyricsStudy: typeof addon.generateLyricsStudy === 'function',
                    characterPronunciation: typeof addon.generateCharacterPronunciation === 'function'
                };
            }

            // 필수 메서드 검증
            const requiredMethods = ['getSettingsUI'];
            for (const method of requiredMethods) {
                if (typeof addon[method] !== 'function') {
                    console.error(`[AIAddonManager] Invalid addon "${addon.id}": missing ${method}()`);
                    return false;
                }
            }

            this._addons.set(addon.id, addon);
            window.__ivLyricsDebugLog?.(`[AIAddonManager] Registered addon: ${addon.id} (${addon.name})`);
            window.__ivLyricsDebugLog?.(`[AIAddonManager] Supports: translate=${addon.supports.translate}, metadata=${addon.supports.metadata}, tmi=${addon.supports.tmi}, lyricsStudy=${addon.supports.lyricsStudy}, characterPronunciation=${addon.supports.characterPronunciation}`);

            // 이미 초기화 완료된 경우, 새 Addon도 초기화
            if (this._initialized && typeof addon.init === 'function') {
                addon.init().catch(e => {
                    console.error(`[AIAddonManager] Failed to late-init addon "${addon.id}":`, e);
                });
            }

            // 이벤트 발생
            this.emit('addon:registered', { id: addon.id, name: addon.name, type: 'ai' });

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
            const requiredFields = ['id', 'name', 'author', 'description', 'version'];
            for (const field of requiredFields) {
                if (!addon[field]) {
                    errors.push(`Missing required field: "${field}"`);
                }
            }

            // 필수 메서드 검증
            if (typeof addon.getSettingsUI !== 'function') {
                errors.push('Missing required method: getSettingsUI()');
            }

            // 기능 메서드 중 최소 하나는 있어야 함
            const featureMethods = ['translateLyrics', 'translateMetadata', 'generateTMI', 'generateLyricsStudy', 'generateCharacterPronunciation'];
            const hasAnyFeature = featureMethods.some(m => typeof addon[m] === 'function');
            if (!hasAnyFeature) {
                errors.push(`Must implement at least one of: ${featureMethods.join(', ')}`);
            }

            // 선택 메서드 타입 검증
            if (addon.init && typeof addon.init !== 'function') {
                errors.push('Field "init" must be a function if provided');
            }
            if (addon.testConnection && typeof addon.testConnection !== 'function') {
                errors.push('Field "testConnection" must be a function if provided');
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
                window.__ivLyricsDebugLog?.(`[AIAddonManager] Unregistered addon: ${addonId}`);

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
            window.__ivLyricsDebugLog?.('[AIAddonManager] Provider order saved:', order);

            // 이벤트 발생
            this.emit('provider:order:changed', { order });
        }

        /**
         * Provider 순서 가져오기
         * @returns {string[]}
         */
        getProviderOrder() {
            const stored = getStoredValue(STORAGE_PREFIX + 'provider-order');
            let order = [];

            if (stored) {
                try {
                    order = JSON.parse(stored);
                } catch {
                    // Fall through to default
                }
            }

            const allIds = this.getAddonIds();

            // 저장된 순서가 없으면 기본 순서 반환
            if (!order || order.length === 0) {
                return allIds;
            }

            // 1. 저장된 순서 중 현재 존재하는 Addon만 유지 (삭제된 Addon 제거)
            // 2. 저장된 순서에 없는 새로운 Addon을 뒤에 추가
            const validAttributes = new Set(allIds);
            const filteredOrder = order.filter(id => validAttributes.has(id));
            const orderedIds = new Set(order);
            const newIds = allIds.filter(id => !orderedIds.has(id));

            return [...filteredOrder, ...newIds];
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
        }

        /**
         * Provider 활성화 여부 확인
         * @param {string} addonId - Addon ID
         * @returns {boolean}
         */
        isProviderEnabled(addonId) {
            const stored = getStoredValue(STORAGE_PREFIX + `enabled:${addonId}`);
            // 저장된 값이 없으면 기본값 확인 (Pollinations만 기본 활성화)
            if (stored === null || stored === undefined) {
                return DEFAULT_ENABLED_ADDONS.includes(addonId);
            }
            return stored === 'true';
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

        /**
         * 특정 기능을 지원하는 활성화된 Provider 목록 (순서대로)
         * @param {'translate'|'metadata'|'tmi'|'lyricsStudy'|'characterPronunciation'} capability - 기능 유형
         * @returns {Object[]}
         */
        getEnabledProvidersFor(capability) {
            const allProviders = this.getEnabledProviders();
            // console.log(`[AIAddonManager] Checking providers for ${capability}. Enabled total: ${allProviders.length}`);

            return allProviders.filter(addon => {
                // 1. Addon 자체가 해당 기능을 지원하는지 확인
                if (!addon.supports || addon.supports[capability] !== true) {
                    // console.log(`[AIAddonManager] Filtered out ${addon.id}: does not support ${capability}`);
                    return false;
                }
                // 2. 사용자가 해당 기능을 활성화했는지 확인 (기본값 true)
                // 메서드가 존재하지 않는 경우(구버전 캐시 등) 안전하게 true 처리
                if (typeof this.isCapabilityEnabled !== 'function') {
                    return true;
                }

                const isEnabled = this.isCapabilityEnabled(addon.id, capability);
                if (!isEnabled) {
                    // console.log(`[AIAddonManager] Filtered out ${addon.id}: capability ${capability} disabled by user setting`);
                    return false;
                }
                return true;
            });
        }

        /**
         * 특정 Addon의 특정 기능 활성화 여부 확인
         */
        isCapabilityEnabled(addonId, capability) {
            return this.getAddonSetting(addonId, `capability:${capability}`, true);
        }

        /**
         * 특정 Addon의 특정 기능 활성화 설정 저장
         */
        setCapabilityEnabled(addonId, capability, enabled) {
            this.setAddonSetting(addonId, `capability:${capability}`, enabled);
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
         * Addon의 모든 설정 가져오기
         * @param {string} addonId - Addon ID
         * @returns {Object}
         */
        getAddonSettings(addonId) {
            const prefix = `${STORAGE_PREFIX}addon:${addonId}:`;
            const settings = {};

            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith(prefix)) {
                    const settingKey = key.substring(prefix.length);
                    settings[settingKey] = this.getAddonSetting(addonId, settingKey);
                }
            }

            return settings;
        }

        // ============================================
        // API Methods (Priority-based Fallback)
        // ============================================

        /**
         * 메타데이터 번역 (활성화된 Provider 순서대로 시도)
         * @param {Object} params - { trackId, title, artist, lang }
         * @returns {Promise<Object|null>}
         */
        async translateMetadata(params) {
            const providers = this.getEnabledProvidersFor('metadata');

            if (providers.length === 0) {
                console.warn('[AIAddonManager] No metadata providers enabled');
                throw new Error(this._t('aiProviders.noEnabledProviders', 'No AI providers enabled. Please enable at least one provider in settings.'));
            }

            // 디버그 로깅
            if (window.AddonDebug?.isEnabled()) {
                window.AddonDebug.log('ai', 'translateMetadata called', {
                    providers: providers.map(p => p.id),
                    ...params
                });
                window.AddonDebug.time('ai', 'translateMetadata');
            }

            // 이벤트 발생
            this.emit('ai:request:start', { type: 'metadata', providers: providers.map(p => p.id), params });

            let lastError = null;

            for (const addon of providers) {
                if (typeof addon.translateMetadata !== 'function') continue;

                try {
                    window.__ivLyricsDebugLog?.(`[AIAddonManager] Trying metadata provider: ${addon.id}`);
                    const result = await addon.translateMetadata(params);

                    // 디버그 타이머 종료
                    if (window.AddonDebug?.isEnabled()) {
                        window.AddonDebug.timeEnd('ai', 'translateMetadata');
                    }

                    // 이벤트 발생
                    this.emit('ai:request:success', { type: 'metadata', provider: addon.id });

                    return result;
                } catch (e) {
                    console.warn(`[AIAddonManager] Provider ${addon.id} failed for translateMetadata:`, e.message);
                    lastError = e;

                    // 다음 provider 시도
                    continue;
                }
            }

            // 모든 provider 실패
            console.error('[AIAddonManager] All metadata providers failed');

            if (window.AddonDebug?.isEnabled()) {
                window.AddonDebug.timeEnd('ai', 'translateMetadata');
                window.AddonDebug.error('ai', 'translateMetadata all providers failed');
            }

            const errorMsg = lastError?.message || this._t('aiProviders.allProvidersFailed', 'All AI providers failed to process the request.');
            this.emit('ai:request:error', { type: 'metadata', error: errorMsg });
            throw new Error(errorMsg);
        }

        /**
         * 가사 번역/발음 생성 (활성화된 Provider 순서대로 시도)
         * @param {Object} params - { trackId, artist, title, text, lang, wantSmartPhonetic }
         * @returns {Promise<Object|null>}
         */
        async translateLyrics(params) {
            const providers = this.getEnabledProvidersFor('translate');

            if (providers.length === 0) {
                console.warn('[AIAddonManager] No translate providers enabled');
                throw new Error(this._t('aiProviders.noEnabledProviders', 'No AI providers enabled. Please enable at least one provider in settings.'));
            }

            // 디버그 로깅
            if (window.AddonDebug?.isEnabled()) {
                window.AddonDebug.log('ai', 'translateLyrics called', {
                    providers: providers.map(p => p.id),
                    lang: params.lang,
                    wantSmartPhonetic: params.wantSmartPhonetic,
                    lineCount: params.text?.split('\n').length
                });
                window.AddonDebug.time('ai', 'translateLyrics');
            }

            // 이벤트 발생
            this.emit('ai:request:start', { type: 'translate', providers: providers.map(p => p.id), params: { ...params, text: '[...]' } });

            let lastError = null;

            for (const addon of providers) {
                if (typeof addon.translateLyrics !== 'function') continue;

                try {
                    window.__ivLyricsDebugLog?.(`[AIAddonManager] Trying translate provider: ${addon.id}`);
                    const result = await addon.translateLyrics(params);

                    // 디버그 타이머 종료
                    if (window.AddonDebug?.isEnabled()) {
                        window.AddonDebug.timeEnd('ai', 'translateLyrics');
                    }

                    // 이벤트 발생
                    this.emit('ai:request:success', { type: 'translate', provider: addon.id });

                    return result;
                } catch (e) {
                    console.warn(`[AIAddonManager] Provider ${addon.id} failed for translateLyrics:`, e.message);
                    lastError = e;

                    // 다음 provider 시도
                    continue;
                }
            }

            // 모든 provider 실패
            console.error('[AIAddonManager] All translate providers failed');

            if (window.AddonDebug?.isEnabled()) {
                window.AddonDebug.timeEnd('ai', 'translateLyrics');
                window.AddonDebug.error('ai', 'translateLyrics all providers failed');
            }

            const errorMsg = lastError?.message || this._t('aiProviders.allProvidersFailed', 'All AI providers failed to process the request.');
            this.emit('ai:request:error', { type: 'translate', error: errorMsg });
            throw new Error(errorMsg);
        }

        _getCharacterPronunciationUnitMode(params, lines) {
            const requested = params?.unitMode || params?.characterPronunciationUnitMode;
            if (requested === 'word' || requested === 'char') {
                return requested;
            }

            const sourceLang = String(params?.sourceLang || '').toLowerCase();
            if (CHARACTER_PRONUNCIATION_CJK_LANG_RE.test(sourceLang)) {
                return 'char';
            }

            const joinedLines = (Array.isArray(lines) ? lines : []).join('\n');
            return CHARACTER_PRONUNCIATION_CJK_SCRIPT_RE.test(joinedLines) ? 'char' : 'word';
        }

        _buildWordPronunciationUnits(text) {
            const chars = Array.from(String(text ?? ''));
            const units = [];
            let index = 0;

            while (index < chars.length) {
                while (index < chars.length && /\s/u.test(chars[index])) {
                    index++;
                }
                if (index >= chars.length) break;

                const start = index;
                while (index < chars.length && !/\s/u.test(chars[index])) {
                    index++;
                }
                const end = index - 1;
                const token = chars.slice(start, end + 1).join('');
                if (CHARACTER_PRONUNCIATION_WORD_TEXT_RE.test(token)) {
                    units.push({ start, end, text: token, pronunciation: '' });
                }
            }

            return units;
        }

        _normalizeCharacterPronunciationResult(result, lines, options = {}) {
            const sourceLines = (Array.isArray(lines) ? lines : [])
                .map(line => String(line ?? ''));
            const unitMode = options.unitMode === 'word' ? 'word' : 'char';
            const resultLines = Array.isArray(result?.l)
                ? result.l
                : (Array.isArray(result?.lines) ? result.lines : []);

            return {
                lines: sourceLines.map((text, lineIndex) => {
                    const sourceChars = Array.from(text);
                    const resultLine = resultLines.find(line => Number(line?.i ?? line?.index) === lineIndex) || resultLines[lineIndex] || {};
                    const resultChars = Array.isArray(resultLine?.c)
                        ? resultLine.c
                        : (Array.isArray(resultLine?.chars) ? resultLine.chars : []);
                    const hasResultPronunciationArray = Array.isArray(resultLine?.p) || Array.isArray(resultLine?.pronunciations);
                    const resultPronunciations = Array.isArray(resultLine?.p)
                        ? resultLine.p
                        : (Array.isArray(resultLine?.pronunciations) ? resultLine.pronunciations : []);
                    const resultUnits = Array.isArray(resultLine?.u)
                        ? resultLine.u
                        : (Array.isArray(resultLine?.units) ? resultLine.units : []);
                    const byIndex = new Map();

                    if (unitMode === 'char' && hasResultPronunciationArray) {
                        if (resultPronunciations.length !== sourceChars.length) {
                            throw new Error(`Character pronunciation response line ${lineIndex} returned ${resultPronunciations.length} slots, expected ${sourceChars.length}.`);
                        }

                        resultPronunciations.forEach((value, index) => {
                            const pronunciation = typeof value === 'string' ? value.trim() : '';
                            if (pronunciation) {
                                byIndex.set(index, { p: pronunciation });
                            }
                        });
                    } else {
                        if (unitMode === 'char') {
                            throw new Error(`Character pronunciation response line ${lineIndex} missing p array.`);
                        }
                        resultChars.forEach((item, fallbackIndex) => {
                            const index = Number.isInteger(Number(item?.i)) ? Number(item.i) : fallbackIndex;
                            const rawPronunciation = item?.p ?? item?.pronunciation;
                            const pronunciation = typeof rawPronunciation === 'string' ? rawPronunciation.trim() : '';
                            if (index < 0 || index >= sourceChars.length) {
                                if (unitMode === 'char' && pronunciation) {
                                    throw new Error(`Character pronunciation response used index ${index} outside line ${lineIndex} length ${sourceChars.length}.`);
                                }
                                return;
                            }
                            if (unitMode === 'char' && byIndex.has(index)) {
                                const existingPronunciation = byIndex.get(index)?.p ?? byIndex.get(index)?.pronunciation;
                                const existingText = typeof existingPronunciation === 'string' ? existingPronunciation.trim() : '';
                                if (pronunciation && existingText) {
                                    throw new Error(`Character pronunciation response duplicated index ${index} on line ${lineIndex}.`);
                                }
                                if (!pronunciation && existingText) return;
                            }
                            byIndex.set(index, item);
                        });
                    }

                    const sourceUnits = unitMode === 'word'
                        ? this._buildWordPronunciationUnits(text)
                        : [];
                    const normalizedUnits = [];
                    if (unitMode === 'word') {
                        resultUnits.forEach((item, fallbackIndex) => {
                            const unitIndex = Number.isInteger(Number(item?.i)) ? Number(item.i) : fallbackIndex;
                            const sourceUnit = sourceUnits[unitIndex] || null;
                            const start = Number.isInteger(Number(item?.s ?? item?.start))
                                ? Number(item?.s ?? item?.start)
                                : sourceUnit?.start;
                            const end = Number.isInteger(Number(item?.e ?? item?.end))
                                ? Number(item?.e ?? item?.end)
                                : sourceUnit?.end;
                            const pronunciation = typeof (item?.p ?? item?.pronunciation) === 'string'
                                ? (item.p ?? item.pronunciation).trim()
                                : '';

                            if (!pronunciation || !Number.isInteger(start) || !Number.isInteger(end)) return;
                            if (start < 0 || end < start || end >= sourceChars.length) return;
                            normalizedUnits.push({
                                start,
                                end,
                                text: sourceChars.slice(start, end + 1).join(''),
                                pronunciation
                            });
                        });
                        if (!normalizedUnits.length && byIndex.size > 0) {
                            sourceUnits.forEach(unit => {
                                const pronunciation = [];
                                for (let i = unit.start; i <= unit.end; i++) {
                                    const item = byIndex.get(i);
                                    const rawPronunciation = item?.p ?? item?.pronunciation;
                                    if (typeof rawPronunciation === 'string' && rawPronunciation.trim()) {
                                        pronunciation.push(rawPronunciation.trim());
                                    }
                                }
                                if (pronunciation.length) {
                                    normalizedUnits.push({
                                        ...unit,
                                        pronunciation: pronunciation.join('')
                                    });
                                }
                            });
                        }
                    }

                    return {
                        index: lineIndex,
                        unitMode,
                        units: normalizedUnits,
                        chars: sourceChars.map((char, charIndex) => {
                            const item = byIndex.get(charIndex) || {};
                            const rawPronunciation = item.p ?? item.pronunciation;
                            const pronunciation = unitMode === 'word'
                                ? ''
                                : (typeof rawPronunciation === 'string'
                                ? rawPronunciation.trim()
                                : '');

                            return {
                                i: charIndex,
                                char,
                                pronunciation
                            };
                        })
                    };
                })
            };
        }

        _isCharacterPronunciationTruncationError(error) {
            return /JSON response was truncated|output token limit|Unexpected end|unterminated/i.test(error?.message || '');
        }

        _isCharacterPronunciationFormatError(error) {
            return /Character pronunciation response .*returned \d+ slots, expected|Character pronunciation response .*outside line|Character pronunciation response duplicated index|Character pronunciation response .*missing p array/i.test(error?.message || '');
        }

        _isCharacterPronunciationRetryableError(error) {
            return this._isCharacterPronunciationTruncationError(error) || this._isCharacterPronunciationFormatError(error);
        }

        _notifyCharacterPronunciationProgress(params, progress) {
            if (typeof params?.onProgress !== 'function') return;
            try {
                params.onProgress(progress);
            } catch (e) {
                console.warn('[AIAddonManager] Character pronunciation progress callback failed:', e);
            }
        }

        _buildCharacterPronunciationChunks(lines, options = {}) {
            options = options || {};
            const unitMode = options.unitMode === 'word' ? 'word' : 'char';
            const sourceLines = (Array.isArray(lines) ? lines : [])
                .map(line => String(line ?? ''));
            const defaultMaxLines = unitMode === 'char' ? 4 : 16;
            const defaultMaxChars = unitMode === 'char' ? 240 : 1040;
            const defaultMaxSegmentChars = unitMode === 'char' ? 240 : 640;
            const maxChunkLines = Math.max(1, Number(options.maxLines) || defaultMaxLines);
            const maxChunkChars = Math.max(unitMode === 'char' ? 40 : 320, Number(options.maxChars) || defaultMaxChars);
            const maxSegmentChars = Math.max(unitMode === 'char' ? 40 : 160, Number(options.maxSegmentChars) || defaultMaxSegmentChars);
            const segments = [];

            sourceLines.forEach((text, sourceLineIndex) => {
                const chars = Array.from(text);
                if (chars.length <= maxSegmentChars) {
                    segments.push({ sourceLineIndex, charOffset: 0, text, charCount: chars.length });
                    return;
                }

                for (let offset = 0; offset < chars.length; offset += maxSegmentChars) {
                    const part = chars.slice(offset, offset + maxSegmentChars).join('');
                    segments.push({ sourceLineIndex, charOffset: offset, text: part, charCount: Array.from(part).length });
                }
            });

            const chunks = [];
            let current = { segments: [], charCount: 0 };
            const pushCurrent = () => {
                if (!current.segments.length) return;
                chunks.push(current);
                current = { segments: [], charCount: 0 };
            };

            segments.forEach(segment => {
                const wouldExceedLines = current.segments.length >= maxChunkLines;
                const wouldExceedChars = current.segments.length > 0 && current.charCount + segment.charCount > maxChunkChars;
                if (wouldExceedLines || wouldExceedChars) {
                    pushCurrent();
                }
                current.segments.push(segment);
                current.charCount += segment.charCount;
            });
            pushCurrent();

            return chunks;
        }

        async _generateCharacterPronunciationChunk(addon, params, chunk) {
            try {
                const chunkLines = chunk.segments.map(segment => segment.text);
                const {
                    onProgress,
                    _characterPronunciationProgress,
                    chunking,
                    characterPronunciationChunking,
                    characterPronunciationUnitMode,
                    unitMode,
                    ...providerParams
                } = params || {};
                const result = await addon.generateCharacterPronunciation({
                    ...providerParams,
                    unitMode: unitMode || characterPronunciationUnitMode || 'char',
                    lines: chunkLines
                });
                const normalized = this._normalizeCharacterPronunciationResult(result, chunkLines, {
                    unitMode: unitMode || characterPronunciationUnitMode || 'char'
                });
                return normalized.lines.map((line, index) => ({
                    segment: chunk.segments[index],
                    line
                }));
            } catch (error) {
                if (!this._isCharacterPronunciationRetryableError(error)) {
                    throw error;
                }

                this._notifyCharacterPronunciationProgress(params, {
                    ...(params?._characterPronunciationProgress || {}),
                    phase: 'retry-split',
                    retry: true,
                    reason: this._isCharacterPronunciationFormatError(error) ? 'format' : 'truncation',
                    error: error?.message || String(error),
                    percent: Math.max(1, Number(params?._characterPronunciationProgress?.percent) || 0)
                });

                if (chunk.segments.length > 1) {
                    const mid = Math.ceil(chunk.segments.length / 2);
                    const left = {
                        segments: chunk.segments.slice(0, mid),
                        charCount: chunk.segments.slice(0, mid).reduce((sum, segment) => sum + segment.charCount, 0)
                    };
                    const right = {
                        segments: chunk.segments.slice(mid),
                        charCount: chunk.segments.slice(mid).reduce((sum, segment) => sum + segment.charCount, 0)
                    };
                    const leftResult = await this._generateCharacterPronunciationChunk(addon, params, left);
                    const rightResult = await this._generateCharacterPronunciationChunk(addon, params, right);
                    return [...leftResult, ...rightResult];
                }

                const [segment] = chunk.segments;
                const chars = Array.from(segment?.text || '');
                const splitThreshold = this._isCharacterPronunciationFormatError(error) ? 40 : 160;
                if (chars.length > splitThreshold) {
                    const mid = Math.ceil(chars.length / 2);
                    const leftSegment = {
                        sourceLineIndex: segment.sourceLineIndex,
                        charOffset: segment.charOffset,
                        text: chars.slice(0, mid).join(''),
                        charCount: mid
                    };
                    const rightText = chars.slice(mid).join('');
                    const rightSegment = {
                        sourceLineIndex: segment.sourceLineIndex,
                        charOffset: segment.charOffset + mid,
                        text: rightText,
                        charCount: Array.from(rightText).length
                    };
                    const leftResult = await this._generateCharacterPronunciationChunk(addon, params, { segments: [leftSegment], charCount: leftSegment.charCount });
                    const rightResult = await this._generateCharacterPronunciationChunk(addon, params, { segments: [rightSegment], charCount: rightSegment.charCount });
                    return [...leftResult, ...rightResult];
                }

                throw error;
            }
        }

        _mergeCharacterPronunciationChunkResult(mergedLines, chunkResult, unitMode) {
            chunkResult.forEach(({ segment, line }) => {
                if (!segment || !line || !Array.isArray(line.chars)) return;
                const targetLine = mergedLines[segment.sourceLineIndex];
                if (!targetLine) return;

                if (unitMode === 'word' && Array.isArray(line.units)) {
                    line.units.forEach(unit => {
                        const pronunciation = typeof unit?.pronunciation === 'string' ? unit.pronunciation.trim() : '';
                        if (!pronunciation) return;

                        const start = segment.charOffset + Number(unit.start);
                        const end = segment.charOffset + Number(unit.end);
                        if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end >= targetLine.chars.length) return;

                        const existingUnit = targetLine.units.find(item => item.start === start && item.end === end);
                        if (existingUnit) {
                            existingUnit.pronunciation = pronunciation;
                        } else {
                            targetLine.units.push({
                                start,
                                end,
                                text: targetLine.chars.slice(start, end + 1).map(item => item.char).join(''),
                                pronunciation
                            });
                        }
                    });
                    return;
                }

                line.chars.forEach(item => {
                    if (!item?.pronunciation) return;
                    const itemIndex = Number(item.i ?? 0);
                    if (!Number.isInteger(itemIndex)) return;
                    const targetIndex = segment.charOffset + itemIndex;
                    if (targetIndex < 0 || targetIndex >= targetLine.chars.length) return;
                    targetLine.chars[targetIndex].pronunciation = item.pronunciation;
                });
            });
        }

        async _generateCharacterPronunciationChunks(addon, params, chunks, unitMode, mergedLines, progressContext = {}) {
            const total = chunks.length;
            const concurrency = Math.min(
                Math.max(1, total || 1),
                Math.max(1, Math.min(6, Number(progressContext.concurrency) || 3))
            );
            let nextChunkIndex = 0;
            let completedChunks = 0;
            let fatalChunkError = null;

            const createProgressBase = (chunkIndex) => ({
                provider: progressContext.provider,
                providerIndex: progressContext.providerIndex,
                providerTotal: progressContext.providerTotal,
                total,
                current: total > 0 ? Math.max(1, Math.min(total, completedChunks + 1)) : 0,
                completed: completedChunks,
                remaining: Math.max(0, total - completedChunks),
                percent: total > 0 ? Math.round((completedChunks / total) * 100) : 0,
                concurrency,
                chunkIndex: chunkIndex + 1
            });

            const runChunkWorker = async () => {
                while (!fatalChunkError) {
                    const chunkIndex = nextChunkIndex++;
                    if (chunkIndex >= total) {
                        return;
                    }

                    window.__ivLyricsDebugLog?.(`[AIAddonManager] Character pronunciation chunk ${chunkIndex + 1}/${total} via ${addon.id}`);
                    const progressBase = createProgressBase(chunkIndex);
                    this._notifyCharacterPronunciationProgress(params, {
                        ...progressBase,
                        phase: 'chunk-start',
                        percent: total > 0 ? Math.max(1, progressBase.percent) : progressBase.percent
                    });

                    try {
                        const chunkResult = await this._generateCharacterPronunciationChunk(addon, {
                            ...params,
                            unitMode,
                            _characterPronunciationProgress: progressBase
                        }, chunks[chunkIndex]);
                        this._mergeCharacterPronunciationChunkResult(mergedLines, chunkResult, unitMode);
                        completedChunks++;
                        this._notifyCharacterPronunciationProgress(params, {
                            ...createProgressBase(chunkIndex),
                            phase: 'chunk-complete',
                            current: completedChunks,
                            completed: completedChunks,
                            remaining: Math.max(0, total - completedChunks),
                            percent: total > 0 ? Math.round((completedChunks / total) * 100) : 100
                        });
                    } catch (error) {
                        this._notifyCharacterPronunciationProgress(params, {
                            ...createProgressBase(chunkIndex),
                            phase: 'chunk-error',
                            error: error?.message || String(error),
                            percent: total > 0 ? Math.max(1, Math.round((completedChunks / total) * 100)) : 0
                        });
                        fatalChunkError = error;
                        return;
                    }
                }
            };

            const workers = Array.from(
                { length: Math.min(concurrency, total) },
                () => runChunkWorker()
            );
            await Promise.all(workers);
            if (fatalChunkError) {
                throw fatalChunkError;
            }
        }

        async generateCharacterPronunciation(params) {
            const providers = this.getEnabledProvidersFor('characterPronunciation');

            if (providers.length === 0) {
                console.warn('[AIAddonManager] No character pronunciation providers enabled');
                throw new Error(this._t('aiProviders.noEnabledProviders', 'No AI providers enabled. Please enable at least one provider in settings.'));
            }

            const {
                onProgress,
                _characterPronunciationProgress,
                ...eventParams
            } = params || {};

            this.emit('ai:request:start', {
                type: 'characterPronunciation',
                providers: providers.map(p => p.id),
                params: { ...eventParams, lines: '[...]' }
            });

            let lastError = null;
            let truncationError = null;
            const sourceLines = (Array.isArray(params?.lines) ? params.lines : [])
                .map(line => String(line ?? ''));
            const unitMode = this._getCharacterPronunciationUnitMode(params, sourceLines);
            const chunkingOptions = params?.chunking || params?.characterPronunciationChunking || {};
            const effectiveChunkingOptions = { ...chunkingOptions, unitMode };
            const chunks = this._buildCharacterPronunciationChunks(sourceLines, effectiveChunkingOptions);
            const defaultChunkConcurrency = unitMode === 'char' ? 4 : 3;
            const chunkConcurrency = Math.min(
                Math.max(1, chunks.length || 1),
                Math.max(1, Math.min(6, Number(chunkingOptions.concurrency) || defaultChunkConcurrency))
            );

            this._notifyCharacterPronunciationProgress(params, {
                phase: 'prepared',
                providerTotal: providers.length,
                total: chunks.length,
                current: 0,
                completed: 0,
                remaining: chunks.length,
                percent: 0
            });

            for (let providerIndex = 0; providerIndex < providers.length; providerIndex++) {
                const addon = providers[providerIndex];
                if (typeof addon.generateCharacterPronunciation !== 'function') continue;

                try {
                    window.__ivLyricsDebugLog?.(`[AIAddonManager] Trying character pronunciation provider: ${addon.id}`);
                    window.__ivLyricsDebugLog?.(`[AIAddonManager] Character pronunciation chunks: ${chunks.length}, concurrency: ${chunkConcurrency}`);
                    this._notifyCharacterPronunciationProgress(params, {
                        phase: 'provider-start',
                        provider: addon.id,
                        providerIndex: providerIndex + 1,
                        providerTotal: providers.length,
                        total: chunks.length,
                        current: 0,
                        completed: 0,
                        remaining: chunks.length,
                        percent: 0
                    });

                    const mergedLines = sourceLines.map((text, lineIndex) => ({
                        index: lineIndex,
                        unitMode,
                        units: unitMode === 'word'
                            ? this._buildWordPronunciationUnits(text)
                            : [],
                        chars: Array.from(text).map((char, charIndex) => ({
                            i: charIndex,
                            char,
                            pronunciation: ''
                        }))
                    }));

                    await this._generateCharacterPronunciationChunks(addon, params, chunks, unitMode, mergedLines, {
                        provider: addon.id,
                        providerIndex: providerIndex + 1,
                        providerTotal: providers.length,
                        concurrency: chunkConcurrency
                    });

                    this._notifyCharacterPronunciationProgress(params, {
                        phase: 'complete',
                        provider: addon.id,
                        providerIndex: providerIndex + 1,
                        providerTotal: providers.length,
                        total: chunks.length,
                        current: chunks.length,
                        completed: chunks.length,
                        remaining: 0,
                        percent: 100
                    });
                    this.emit('ai:request:success', { type: 'characterPronunciation', provider: addon.id });
                    return { lines: mergedLines, provider: addon.id };
                } catch (e) {
                    console.warn(`[AIAddonManager] Provider ${addon.id} failed for generateCharacterPronunciation:`, e.message);
                    this._notifyCharacterPronunciationProgress(params, {
                        phase: 'provider-error',
                        provider: addon.id,
                        providerIndex: providerIndex + 1,
                        providerTotal: providers.length,
                        total: chunks.length,
                        error: e?.message || String(e)
                    });
                    lastError = e;
                    if (!truncationError && this._isCharacterPronunciationTruncationError(e)) {
                        truncationError = e;
                    }
                    continue;
                }
            }

            const errorMsg = truncationError?.message || lastError?.message || this._t('aiProviders.allProvidersFailed', 'All AI providers failed to process the request.');
            this.emit('ai:request:error', { type: 'characterPronunciation', error: errorMsg });
            throw new Error(errorMsg);
        }

        /**
         * 가사 학습 모드 생성 (활성화된 Provider 순서대로 시도)
         * @param {Object} params - { trackId, title, artist, targetLang, sourceLang, lines }
         * @returns {Promise<Object>}
         */
        async generateLyricsStudy(params) {
            const providers = this.getEnabledProvidersFor('lyricsStudy');

            if (providers.length === 0) {
                console.warn('[AIAddonManager] No lyrics study providers enabled');
                throw new Error(this._t('aiProviders.noEnabledProviders', 'No AI providers enabled. Please enable at least one provider in settings.'));
            }

            if (window.AddonDebug?.isEnabled()) {
                window.AddonDebug.log('ai', 'generateLyricsStudy called', {
                    providers: providers.map(p => p.id),
                    targetLang: params.targetLang,
                    sourceLang: params.sourceLang,
                    lineCount: Array.isArray(params.lines) ? params.lines.length : 0
                });
                window.AddonDebug.time('ai', 'generateLyricsStudy');
            }

            this.emit('ai:request:start', {
                type: 'lyricsStudy',
                providers: providers.map(p => p.id),
                params: { ...params, lines: '[...]' }
            });

            let lastError = null;

            for (const addon of providers) {
                if (typeof addon.generateLyricsStudy !== 'function') continue;

                try {
                    window.__ivLyricsDebugLog?.(`[AIAddonManager] Trying lyrics study provider: ${addon.id}`);
                    const result = await addon.generateLyricsStudy(params);

                    if (window.AddonDebug?.isEnabled()) {
                        window.AddonDebug.timeEnd('ai', 'generateLyricsStudy');
                    }

                    this.emit('ai:request:success', { type: 'lyricsStudy', provider: addon.id });
                    return result;
                } catch (e) {
                    console.warn(`[AIAddonManager] Provider ${addon.id} failed for generateLyricsStudy:`, e.message);
                    lastError = e;
                    continue;
                }
            }

            if (window.AddonDebug?.isEnabled()) {
                window.AddonDebug.timeEnd('ai', 'generateLyricsStudy');
                window.AddonDebug.error('ai', 'generateLyricsStudy all providers failed');
            }

            const errorMsg = lastError?.message || this._t('aiProviders.allProvidersFailed', 'All AI providers failed to process the request.');
            this.emit('ai:request:error', { type: 'lyricsStudy', error: errorMsg });
            throw new Error(errorMsg);
        }

        /**
         * TMI 생성 (활성화된 Provider 순서대로 시도)
         * @param {Object} params - { trackId, title, artist, lang }
         * @returns {Promise<Object|null>}
         */
        async generateTMI(params) {
            const providers = this.getEnabledProvidersFor('tmi');

            if (providers.length === 0) {
                console.warn('[AIAddonManager] No TMI providers enabled');
                return null;
            }

            // 디버그 로깅
            if (window.AddonDebug?.isEnabled()) {
                window.AddonDebug.log('ai', 'generateTMI called', {
                    providers: providers.map(p => p.id),
                    ...params
                });
                window.AddonDebug.time('ai', 'generateTMI');
            }

            // 이벤트 발생
            this.emit('ai:request:start', { type: 'tmi', providers: providers.map(p => p.id), params });

            let lastError = null;

            for (const addon of providers) {
                if (typeof addon.generateTMI !== 'function') continue;

                try {
                    window.__ivLyricsDebugLog?.(`[AIAddonManager] Trying TMI provider: ${addon.id}`);
                    const result = await addon.generateTMI(params);

                    // 디버그 타이머 종료
                    if (window.AddonDebug?.isEnabled()) {
                        window.AddonDebug.timeEnd('ai', 'generateTMI');
                    }

                    // 이벤트 발생
                    this.emit('ai:request:success', { type: 'tmi', provider: addon.id });

                    return result;
                } catch (e) {
                    console.warn(`[AIAddonManager] Provider ${addon.id} failed for generateTMI:`, e.message);
                    lastError = e;

                    // 다음 provider 시도
                    continue;
                }
            }

            // 모든 provider 실패
            console.error('[AIAddonManager] All TMI providers failed');

            if (window.AddonDebug?.isEnabled()) {
                window.AddonDebug.timeEnd('ai', 'generateTMI');
                window.AddonDebug.error('ai', 'generateTMI all providers failed');
            }

            const errorMsg = lastError?.message || 'All providers failed';
            this.emit('ai:request:error', { type: 'tmi', error: errorMsg });
            return null;  // TMI는 실패해도 null 반환 (중요도 낮음)
        }

        // ============================================
        // Utility Methods
        // ============================================

        /**
         * Addon이 특정 기능을 지원하는지 확인
         * @param {string} addonId - Addon ID
         * @param {'translate'|'metadata'|'tmi'} capability - 기능 유형
         * @returns {boolean}
         */
        supportsCapability(addonId, capability) {
            const addon = this.getAddon(addonId);
            return addon?.supports?.[capability] === true;
        }

        /**
         * 특정 기능을 지원하는 Addon 목록 가져오기
         * @param {'translate'|'metadata'|'tmi'} capability - 기능 유형
         * @returns {Object[]}
         */
        getAddonsWithCapability(capability) {
            return this.getAddons().filter(addon =>
                addon.supports && addon.supports[capability] === true
            );
        }

        /**
         * 기능 상수
         */
        get CAPABILITIES() {
            return AI_CAPABILITIES;
        }
    }

    // ============================================
    // Global Registration
    // ============================================

    const manager = new AIAddonManager();
    window.AIAddonManager = manager;

    // Spicetify가 준비되면 초기화
    const initWhenReady = () => {
        if (Spicetify?.LocalStorage) {
            manager.init().catch(e => {
                console.error('[AIAddonManager] Init failed:', e);
            });
        } else {
            setTimeout(initWhenReady, 100);
        }
    };

    initWhenReady();

    window.__ivLyricsDebugLog?.('[AIAddonManager] Module loaded');
})();
