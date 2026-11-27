import { AddonRegistry } from "../addonRegistry.mjs";
/**
 * AI Addon Manager
 * AI 제공자(Gemini, ChatGPT 등) Addon들을 관리하는 중앙 시스템
 *
 * @author ivLis STUDIO
 * @description 번역, 발음, 음악 Research 생성을 위한 AI Addon 등록 및 관리
 */

import {
    RESEARCH_CACHE_VERSION,
    RESEARCH_OUTPUT_VERSION,
    RESEARCH_MAX_LYRIC_CHARS,
    createResearchStreamProgressParser,
    collectResearchLyricLines,
    normalizeResearchResult,
    normalizeResearchSource,
} from './researchDocument.mjs';
import { buildResearchPrompt, buildTMIPrompt } from './researchPrompt.mjs';
import { requestResearch } from './researchRequests.mjs';

import {
    isChinesePronunciationTask,
    buildLyricsPhoneticPrompt,
    buildTimedPronunciationPrompt,
    buildPronunciationSlotPrompt,
    runParallelBatches,
    parsePronunciationSlotRow,
    buildCharacterPronunciationPrompt,
} from './pronunciationPolicy.mjs';
import {
    buildLyricsStudyPrompt,
} from './lyricsStudyPrompt.mjs';
import {
    buildCulturalAnnotationsPrompt,
} from './culturalAnnotations.mjs';
import { createAiAddonPreferences, normalizeProviderRetryCount } from "./aiAddonPreferences.mjs";
import {
    buildLyricsTranslationPrompt, buildMetadataTranslationPrompt, normalizeTranslationStyle, TRANSLATION_STYLES,
} from "./aiTranslationPrompts.mjs";
import { requestLyricsStudy, requestCulturalAnnotations, requestMotionDirection } from "./lyricEnrichmentRequests.mjs";
import { requestSettingsAssistant } from "./settingsAssistantRequests.mjs";
import { buildWordGlossPrompt, buildWordPronunciationPrompt, requestWordSupplement } from "./wordSupplementRequests.mjs";
import * as characterPronunciationResult from './characterPronunciationResult.mjs';
import * as characterPronunciationRequest from './characterPronunciationRequest.mjs';

import { callAiProvider, runAiProviderFallback } from './aiProviderRequests.mjs';
import { requestLyricsTranslation, requestMetadataTranslation } from './translationRequests.mjs';
import {
    buildPronunciationBatches,
    buildTimedPronunciationChunks,
    parseTimedPronunciationResult,
    requestPronunciationSlots,
    requestTimedPronunciation,
} from './pronunciationAlignment.mjs';

export function createAIAddonManager({ getStoredValue, setStoredValue, getOwnStorage, getI18n, getAddonDebug, getMotionDirector, debug }) {

    // ============================================
    // Constants
    // ============================================

    const preferences = createAiAddonPreferences({ getStoredValue, setStoredValue, getOwnStorage });

    // 기능 유형
    const AI_CAPABILITIES = {
        TRANSLATE: 'translate',    // 가사 번역/발음
        METADATA: 'metadata',      // 메타데이터 번역
        RESEARCH: 'research',      // 장문 음악 리서치
        TMI: 'tmi',                // 기존 Addon 설정 호환용 별칭
        LYRICS_STUDY: 'lyricsStudy', // 가사 기반 학습 모드 생성
        CHARACTER_PRONUNCIATION: 'characterPronunciation', // 문자별 발음
        CULTURAL_ANNOTATIONS: 'culturalAnnotations', // 번역만으로 전달되지 않는 문화적 배경 설명
        MOTION_DIRECTION: 'motionDirection', // 모션 가사 연출
        SETTINGS_ASSISTANT: 'settingsAssistant' // 설정 도우미 채팅 (JSON 응답)
    };

    function buildMotionDirectionPrompt(params = {}) {
        const director = getMotionDirector();
        if (typeof director?.buildPrompt !== 'function') {
            throw new Error('[AIAddonManager] The motion lyrics director is unavailable.');
        }
        return director.buildPrompt(params);
    }

    // ============================================
    // AIAddonManager Class
    // ============================================

    class AIAddonManager extends AddonRegistry {
        constructor() {
            super({ name: "AIAddonManager", type: "ai", debug, readAddonDebug: getAddonDebug });
        }

        // ============================================
        // Helpers
        // ============================================

        _t(key, fallback) {
            const i18n = getI18n();
            if (typeof i18n?.t === 'function') {
                // Provider messages live under settings.aiProviders in the
                // language files; without this lookup they always fell back to English.
                return i18n.t(key) || i18n.t(`settings.${key}`) || fallback;
            }
            return fallback;
        }

        /**
         * 가사 번역 스타일 저장
         * @param {'natural'|'literal'|'adaptive'} style
         * @returns {string} 정규화된 스타일
         */
        setTranslationStyle(style) {
            const normalized = normalizeTranslationStyle(style);
            const previous = this.getTranslationStyle();
            preferences.writeTranslationStyle(normalized);

            if (previous !== normalized) {
                this.emit('translation:style:changed', { style: normalized, previous });
            }
            return normalized;
        }

        /**
         * 현재 가사 번역 스타일 가져오기
         * @returns {'natural'|'literal'|'adaptive'}
         */
        getTranslationStyle() {
            return preferences.getTranslationStyle();
        }

        /**
         * AI 제공자별 추가 재시도 횟수 저장
         * @param {number} retryCount - 최초 요청 실패 후 추가로 시도할 횟수
         * @returns {number} 0~5 범위로 정규화된 재시도 횟수
         */
        setProviderRetryCount(retryCount) {
            const normalized = normalizeProviderRetryCount(retryCount);
            const previous = this.getProviderRetryCount();
            preferences.writeProviderRetryCount(normalized);

            if (previous !== normalized) {
                this.emit('provider:retry-count:changed', {
                    retryCount: normalized,
                    previous
                });
            }
            return normalized;
        }

        /**
         * AI 제공자별 추가 재시도 횟수 가져오기
         * @returns {number} 0~5
         */
        getProviderRetryCount() {
            return preferences.getProviderRetryCount();
        }

        /**
         * Addon API 루프에서 사용할 총 요청 횟수
         * @returns {number} 최초 요청 1회 + 설정된 재시도 횟수
         */
        getProviderRequestAttempts() {
            return this.getProviderRetryCount() + 1;
        }

        _callProvider(addon, method, params) {
            return callAiProvider(addon, method, params);
        }

        _runProviderFallback(providers, method, type, attempt, onAllFailed = null, signal) {
            return runAiProviderFallback(this, providers, method, type, attempt, onAllFailed, signal);
        }

        /**
         * 모든 AI 제공자가 공유하는 가사 번역 시스템 프롬프트 생성
         * @param {Object} params - { text, lang, translationStyle }
         * @returns {{systemPrompt: string, userPrompt: string, style: string, lineCount: number}}
         */
        buildLyricsTranslationPrompt(params = {}) {
            return buildLyricsTranslationPrompt(params, () => this.getTranslationStyle());
        }

        buildLyricsPhoneticPrompt(params = {}) {
            return buildLyricsPhoneticPrompt(params);
        }

        buildCharacterPronunciationPrompt(params = {}) {
            return buildCharacterPronunciationPrompt(params);
        }

        buildPronunciationSlotPrompt(params = {}) {
            return buildPronunciationSlotPrompt(params);
        }

        isChinesePronunciationTask(sourceLang, text) {
            return isChinesePronunciationTask(sourceLang, text);
        }

        buildMetadataTranslationPrompt(params = {}) {
            return buildMetadataTranslationPrompt(params);
        }

        buildTMIPrompt(params = {}) {
            return buildTMIPrompt(params);
        }

        buildResearchPrompt(params = {}) {
            return buildResearchPrompt(params);
        }

        collectResearchLyricLines(lines, maxChars = RESEARCH_MAX_LYRIC_CHARS) {
            return collectResearchLyricLines(lines, maxChars);
        }

        normalizeResearchResult(raw, context = {}) {
            return normalizeResearchResult(raw, context);
        }

        normalizeResearchSource(source) {
            return normalizeResearchSource(source);
        }

        createResearchStreamProgressParser(onDocument) {
            return typeof onDocument === 'function'
                ? createResearchStreamProgressParser(onDocument, (error) => {
                    debug('[AIAddonManager] Research progress callback failed:', error?.message);
                })
                : null;
        }

        get RESEARCH_CACHE_VERSION() {
            return RESEARCH_CACHE_VERSION;
        }

        get RESEARCH_OUTPUT_VERSION() {
            return RESEARCH_OUTPUT_VERSION;
        }

        buildLyricsStudyPrompt(params = {}) {
            return buildLyricsStudyPrompt(params);
        }

        buildMotionDirectionPrompt(params = {}) {
            return buildMotionDirectionPrompt(params);
        }

        /**
         * Motion lyrics direction (활성화된 Provider 순서대로 시도). Returns the
         * provider's JSON direction; MotionLyricsDirector validates it.
         * @param {{title: string, artist: string, lines: Object[], vocabulary?: Object}} params
         */
        async generateMotionDirection(params = {}) {
            return requestMotionDirection(this, params, { debug });
        }

        /**
         * Settings assistant chat (활성화된 Provider 순서대로 시도). The prompt
         * is built by the Settings window; returns the provider's JSON object.
         * @param {{prompt: {systemPrompt: string, userPrompt: string}, signal?: AbortSignal}} params
         */
        async generateSettingsAssistant(params = {}) {
            return requestSettingsAssistant(this, params, { debug });
        }

        buildCulturalAnnotationsPrompt(params = {}) {
            return buildCulturalAnnotationsPrompt(params);
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
         * - supports: { translate: boolean, pronunciation: boolean, metadata: boolean, research|tmi: boolean, lyricsStudy: boolean, characterPronunciation: boolean, culturalAnnotations: boolean, wordSupplements: boolean, motionDirection: boolean, settingsAssistant: boolean } (지원 기능)
         *
         * 필수 메서드:
         * - getSettingsUI(): React.Component (설정 UI)
         *
         * 기능별 메서드:
         * - translateLyrics(params): Promise<Object> (supports.translate 또는 supports.pronunciation = true인 경우)
         * - translateMetadata(params): Promise<Object> (supports.metadata = true인 경우)
         * - generateResearch(params) 또는 generateTMI(params): Promise<Object> (Research 지원 시)
         * - generateLyricsStudy(params): Promise<Object> (supports.lyricsStudy = true인 경우)
         * - generateCharacterPronunciation(params): Promise<Object> (supports.characterPronunciation = true인 경우)
         * - generateCulturalAnnotations(params): Promise<Object> (supports.culturalAnnotations = true인 경우)
         * - generateMotionDirection(params): Promise<Object> (supports.motionDirection = true인 경우)
         * - generateSettingsAssistant(params): Promise<Object> (supports.settingsAssistant = true인 경우)
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
                    tmi: typeof addon.generateResearch === 'function' || typeof addon.generateTMI === 'function',
                    lyricsStudy: typeof addon.generateLyricsStudy === 'function',
                    characterPronunciation: typeof addon.generateCharacterPronunciation === 'function',
                    culturalAnnotations: typeof addon.generateCulturalAnnotations === 'function',
                    motionDirection: typeof addon.generateMotionDirection === 'function',
                    settingsAssistant: typeof addon.generateSettingsAssistant === 'function'
                };
            }
            // Addons written before motion direction or the settings assistant
            // keep their supports map; the method alone is enough to opt in.
            if (addon.supports.motionDirection === undefined) {
                addon.supports.motionDirection = typeof addon.generateMotionDirection === 'function';
            }
            if (addon.supports.settingsAssistant === undefined) {
                addon.supports.settingsAssistant = typeof addon.generateSettingsAssistant === 'function';
            }
            // Line pronunciation used to share the translate capability. Addons
            // written before it became its own capability keep generating it
            // when they can translate lyrics; translation-only services opt out
            // with supports.pronunciation = false.
            if (addon.supports.pronunciation === undefined
                && addon.supports.translate === true
                && typeof addon.translateLyrics === 'function') {
                addon.supports.pronunciation = true;
            }
            // Word-level gloss/pronunciation reuse translateLyrics, so any
            // translate-capable provider supports them unless opted out.
            if (addon.supports.wordSupplements === undefined) {
                addon.supports.wordSupplements = addon.supports.translate === true
                    && typeof addon.translateLyrics === 'function';
            }

            // 필수 메서드 검증
            const requiredMethods = ['getSettingsUI'];
            for (const method of requiredMethods) {
                if (typeof addon[method] !== 'function') {
                    console.error(`[AIAddonManager] Invalid addon "${addon.id}": missing ${method}()`);
                    return false;
                }
            }

            return this._registerAddon(addon,
                `translate=${addon.supports.translate}, pronunciation=${addon.supports.pronunciation}, metadata=${addon.supports.metadata}, tmi=${addon.supports.tmi}, lyricsStudy=${addon.supports.lyricsStudy}, characterPronunciation=${addon.supports.characterPronunciation}, culturalAnnotations=${addon.supports.culturalAnnotations}, wordSupplements=${addon.supports.wordSupplements}`);
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
            const featureMethods = ['translateLyrics', 'translateMetadata', 'generateResearch', 'generateTMI', 'generateLyricsStudy', 'generateCharacterPronunciation', 'generateCulturalAnnotations', 'generateMotionDirection', 'generateSettingsAssistant'];
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

        // ============================================
        // Provider Order Management
        // ============================================

        /**
         * Provider 순서 저장
         * @param {string[]} order - Provider ID 순서
         */
        setProviderOrder(order) {
            preferences.writeProviderOrder(order);
            debug('[AIAddonManager] Provider order saved:', order);

            // 이벤트 발생
            this.emit('provider:order:changed', { order });
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
        }

        /**
         * Provider 활성화 여부 확인
         * @param {string} addonId - Addon ID
         * @returns {boolean}
         */
        isProviderEnabled(addonId) {
            return preferences.isProviderEnabled(addonId);
        }

        /**
         * 특정 기능을 지원하는 활성화된 Provider 목록 (순서대로)
         * @param {'translate'|'pronunciation'|'metadata'|'research'|'tmi'|'lyricsStudy'|'characterPronunciation'|'culturalAnnotations'|'wordSupplements'|'motionDirection'|'settingsAssistant'} capability - 기능 유형
         * @returns {Object[]}
         */
        getEnabledProvidersFor(capability) {
            const allProviders = this.getEnabledProviders();
            const storedCapability = capability === 'research' ? 'tmi' : capability;

            return allProviders.filter(addon => {
                // 1. Addon 자체가 해당 기능을 지원하는지 확인
                const supportsCapability = capability === 'research'
                    ? addon.supports?.research === true || addon.supports?.tmi === true || typeof addon.generateResearch === 'function' || typeof addon.generateTMI === 'function'
                    : addon.supports?.[capability] === true;
                if (!supportsCapability) {
                    return false;
                }
                // 2. 사용자가 해당 기능을 활성화했는지 확인 (기본값 true)
                // perEndpointCapabilities Addon도 제공자 수준 스위치가 상한이므로
                // 제공자 수준 검사를 함께 통과해야 한다. 엔드포인트별 선택은 그
                // 아래에서 addon 내부가 추가로 거른다.
                // 메서드가 존재하지 않는 경우(구버전 캐시 등) 안전하게 true 처리
                return typeof this.isCapabilityEnabled !== 'function' || !!this.isCapabilityEnabled(addon.id, storedCapability);
            });
        }

        /**
         * 특정 Addon의 특정 기능 활성화 여부 확인
         */
        isCapabilityEnabled(addonId, capability) {
            if (capability === 'pronunciation') {
                const stored = this.getAddonSetting(addonId, 'capability:pronunciation', null);
                if (stored !== null) return stored;
                // One "translate" toggle used to cover translation and
                // pronunciation, so it still decides until pronunciation is set.
                return this.getAddonSetting(addonId, 'capability:translate', true);
            }
            return this.getAddonSetting(addonId, `capability:${capability}`, true);
        }

        /**
         * 특정 Addon의 특정 기능 활성화 설정 저장
         */
        setCapabilityEnabled(addonId, capability, enabled) {
            if (capability === 'translate'
                && this.getAddonSetting(addonId, 'capability:pronunciation', null) === null) {
                // Pin the inherited pronunciation choice first so changing
                // translation never flips pronunciation along with it.
                this.setAddonSetting(addonId, 'capability:pronunciation', this.isCapabilityEnabled(addonId, 'pronunciation'));
            }
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
            preferences.setAddonSetting(addonId, key, value);
            if (typeof key === 'string' && key.startsWith('capability:')) {
                this.emit('provider:capability:changed', { id: addonId, capability: key.slice('capability:'.length) });
            }
        }

        getAddonSetting(addonId, key, defaultValue = null) {
            return preferences.getAddonSetting(addonId, key, defaultValue);
        }

        getAddonSettings(addonId) {
            return preferences.getAddonSettings(addonId, (id, key) => this.getAddonSetting(id, key));
        }

        // ============================================
        // API Methods (Priority-based Fallback)
        // ============================================

        /**
         * 메타데이터 번역 (활성화된 Provider 순서대로 시도)
         * @param {Object} params - { trackId, title, artist, lang }
         * @returns {Promise<Object|null>}
         */
        translateMetadata(params) {
            return requestMetadataTranslation(this, params, { getAddonDebug, debug });
        }

        /**
         * 가사 번역 또는 발음 생성 (해당 기능이 켜진 Provider 순서대로 시도)
         * @param {Object} params - { trackId, artist, title, text, lang, wantSmartPhonetic }
         * @returns {Promise<Object|null>}
         */
        translateLyrics(params) {
            return requestLyricsTranslation(this, params, { getAddonDebug, debug });
        }

        _getCharacterPronunciationUnitMode(params, lines) {
            return characterPronunciationResult.getCharacterPronunciationUnitMode(params, lines);
        }

        _buildWordPronunciationUnits(text) {
            return characterPronunciationResult.buildWordPronunciationUnits(text);
        }

        _normalizeCharacterPronunciationLine(text, lineIndex, unitMode, resultLines, resultLinesByIndex) {
            return characterPronunciationResult.normalizeCharacterPronunciationLine(
                text, lineIndex, unitMode, resultLines, resultLinesByIndex, {
                    repairSlots: (source, slots) => this._repairCharacterPronunciationSlots(source, slots),
                    slotError: (index, got, expected, source) => this._characterPronunciationSlotError(index, got, expected, source),
                    buildWordUnits: (source) => this._buildWordPronunciationUnits(source),
                }
            );
        }

        _coerceCharacterPronunciationSlot(value) {
            return characterPronunciationResult.coerceCharacterPronunciationSlot(value);
        }

        _characterPronunciationSlotError(lineIndex, got, expected, text) {
            return characterPronunciationResult.characterPronunciationSlotError(lineIndex, got, expected, text);
        }

        _repairCharacterPronunciationSlots(text, rawArray) {
            return characterPronunciationResult.repairCharacterPronunciationSlots(text, rawArray);
        }

        _normalizeCharacterPronunciationResult(result, lines, options = {}) {
            const normalizeLine = (text, index, mode, resultLines, linesByIndex) =>
                this._normalizeCharacterPronunciationLine(text, index, mode, resultLines, linesByIndex);
            return characterPronunciationResult.normalizeCharacterPronunciationResult(normalizeLine, result, lines, options);
        }

        _validateCharacterPronunciationWritingSystem(result, options = {}) {
            return characterPronunciationResult.validateCharacterPronunciationWritingSystem(result, options);
        }

        _isCharacterPronunciationTruncationError(error) {
            return characterPronunciationResult.isCharacterPronunciationTruncationError(error);
        }

        _isCharacterPronunciationFormatError(error) {
            return characterPronunciationResult.isCharacterPronunciationFormatError(error);
        }

        _isCharacterPronunciationRetryableError(error) {
            return characterPronunciationResult.isCharacterPronunciationRetryableError(error, {
                isTruncationError: (error) => this._isCharacterPronunciationTruncationError(error),
                isFormatError: (error) => this._isCharacterPronunciationFormatError(error),
            });
        }

        _notifyCharacterPronunciationProgress(params, progress) {
            return characterPronunciationRequest.notifyCharacterPronunciationProgress(params, progress);
        }

        _buildCharacterPronunciationChunks(lines, options = {}) {
            return characterPronunciationRequest.buildCharacterPronunciationChunks(lines, options);
        }

        _buildCharacterPronunciationRepairNote(error) {
            return characterPronunciationRequest.buildCharacterPronunciationRepairNote(error);
        }

        _generateCharacterPronunciationChunk(addon, params, chunk) {
            return characterPronunciationRequest.generateCharacterPronunciationChunk(this, debug, addon, params, chunk);
        }

        _mergeCharacterPronunciationChunkResult(mergedLines, chunkResult, unitMode) {
            return characterPronunciationRequest.mergeCharacterPronunciationChunkResult(mergedLines, chunkResult, unitMode);
        }

        _generateCharacterPronunciationChunks(addon, params, chunks, unitMode, mergedLines, progressContext = {}) {
            return characterPronunciationRequest.generateCharacterPronunciationChunks(this, debug, addon, params, chunks, unitMode, mergedLines, progressContext);
        }

        generateCharacterPronunciation(params) {
            return characterPronunciationRequest.generateCharacterPronunciation(this, debug, params);
        }

        buildTimedPronunciationPrompt(params = {}) {
            return buildTimedPronunciationPrompt(params);
        }

        _buildTimedPronunciationChunks(items, limits) {
            return buildTimedPronunciationChunks(items, limits);
        }

        _buildPronunciationBatches(items) {
            return buildPronunciationBatches(items, (list, limits) => this._buildTimedPronunciationChunks(list, limits));
        }

        _parseTimedPronunciationResult(result, chunk) {
            return parseTimedPronunciationResult(result, chunk);
        }

        generateTimedPronunciation(params) {
            return requestTimedPronunciation(this, params);
        }

        parsePronunciationSlotRow(value, expected, notation = 'translation') {
            return parsePronunciationSlotRow(value, expected, notation);
        }

        _runParallelBatches(batches, run, options) {
            return runParallelBatches(batches, run, options);
        }

        generatePronunciationSlots(params) {
            return requestPronunciationSlots(this, params, debug);
        }

        /**
         * 가사 학습 모드 생성 (활성화된 Provider 순서대로 시도)
         * @param {Object} params - { trackId, title, artist, targetLang, sourceLang, lines }
         * @returns {Promise<Object>}
         */
        async generateLyricsStudy(params) {
            return requestLyricsStudy(this, params, { getAddonDebug, debug });
        }

        buildWordGlossPrompt(params = {}) {
            return buildWordGlossPrompt(params);
        }

        async generateWordGloss(params = {}) {
            return requestWordSupplement(this, params, 'wordGloss');
        }

        buildWordPronunciationPrompt(params = {}) {
            return buildWordPronunciationPrompt(params);
        }

        async generateWordPronunciation(params = {}) {
            return requestWordSupplement(this, params, 'wordPronunciation');
        }

        /**
         * 번역만으로 전달되지 않는 줄별 문화적 배경 설명 생성
         * @param {Object} params - { trackId, title, artist, targetLang, sourceLang, lines, provider, onProviderLoading }
         * @returns {Promise<{annotations: Array<{lineIndex: number, expression: string, note: string}>, provider: string|null}>}
         */
        async generateCulturalAnnotations(params) {
            return requestCulturalAnnotations(this, params, { debug });
        }

        /**
         * 장문 음악 Research 생성 (활성화된 Provider 순서대로 시도)
         * @param {Object} params - 곡/앨범 메타데이터와 현재 가사
         * @returns {Promise<Object|null>}
         */
        generateResearch(params) {
            return requestResearch(this, params, { getAddonDebug, debug });
        }

        // Public compatibility alias for integrations using the former name.
        async generateTMI(params) {
            return this.generateResearch(params);
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

        get TRANSLATION_STYLES() {
            return TRANSLATION_STYLES;
        }
    }

    return new AIAddonManager();
}
