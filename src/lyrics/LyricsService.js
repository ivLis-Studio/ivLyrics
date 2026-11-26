import { createRuntimeDebugLogger } from "#ivlyrics/spicetify/runtimeDebug.mjs";
import { readSettingsDatabaseRecovery, readSettingsPersistence, readSettingsStorage } from "../core/settingsRuntime.mjs";
import { readSyncDataCodec } from "../features/sync/syncDataCodecRuntime.mjs";
// ============================================
// LyricsService Extension for ivLyrics
// 가사, 번역, 발음을 불러오는 시스템을 Extension 형태로 분리
// Spotify의 모든 페이지에서 작동 가능
// ============================================

import { readPronunciationFirst, readPronunciationSlots, readPronunciationNotation } from "#ivlyrics/lyrics/pronunciationRuntime.mjs";
import { installPlaybackPositionService, isPlaybackLyricsTargetCurrent } from "../core/playbackPositionService.mjs";
import { isLyricsSectionHeader as sharedIsLyricsSectionHeader } from "./translationTextComparison.mjs";
import { getLocalTrackUriFromCacheId, installTrackIdentityService } from "../core/trackIdentity.mjs";
import { createApiTracker } from "../core/createApiTracker.mjs";
import { getRuntimeService, publishRuntimeService } from "../spicetify/runtimeServices.mjs";
import { getMountedLyricsPage } from "../spicetify/lyricsPageEffects.mjs";
import { getTranslationSourceCacheHash } from "./translationPresentation.mjs";
import { createLyricsServicePreferences } from "./lyricsServicePreferences.mjs";
import { createTranslator } from "./createTranslator.mjs";
import { createLocalLanguageConverter } from "./localLanguageConverter.mjs";
import { LRUCache } from "../core/LRUCache.mjs";
import { createOverlayPlaybackVisibility, resolveSpotifyImageUrl } from "../features/overlay/overlayPresentationHost.mjs";
import { createOverlayOffsetResolver } from "../features/overlay/overlayOffsets.mjs";
import { createOverlayLyricPayload } from "../features/overlay/overlayLyricPayload.mjs";
import { createOverlaySenders } from "../features/overlay/createOverlaySenders.mjs";
import { KaraokeWordTiming } from "./karaokeWordTiming.mjs";
import { SyncDataSourceCompatibility } from "./syncDataSourceCompatibility.mjs";
import { createSyncDataService } from "./createSyncDataService.mjs";
import { getSpotifyAccountKey } from "../core/spotifyFields.mjs";
import { createLyricsLanguageModel } from "./lyricsLanguageModel.mjs";
import { createLyricsLanguageDetector } from "./lyricsLanguageDetector.mjs";
import { createLyricsResearch } from "./createLyricsResearch.mjs";
import { createLyricsCache, LYRICS_CACHE_INVALIDATED_EVENT } from "./createLyricsCache.mjs";
import { installLyricsReadySnapshotListener } from "./installLyricsReadySnapshotListener.mjs";
import { createLyricsPresentationStore } from "./lyricsPresentationStore.mjs";
import { createLyricSupplementPresentation } from "./lyricSupplementPresentation.mjs";
import { createCommunityLyricsSync } from "./createCommunityLyricsSync.mjs";
import { createFullLyricsRequest } from "./createFullLyricsRequest.mjs";
import { createLyricTranslationModes } from "./lyricTranslationModes.mjs";
import {
    createLyricsProviderRequests, isLyricsProviderSelectionSetting, LYRICS_PROVIDER_SELECTION_CHANGED,
} from "./lyricsProviderRequests.mjs";
import { getTrackOverrideStores } from "../core/trackOverrideRuntime.mjs";
import { getTrackSyncOffsetStore } from "../core/trackSyncOffsetRuntime.mjs";
import { createPseudoKaraokeService } from "./pseudo-karaoke/createPseudoKaraokeService.mjs";
import { createLocalLyricsStore } from "./localLyricsStore.mjs";

export { KaraokeWordTiming, SyncDataSourceCompatibility };

export default function LyricsServiceExtension() {

    const TrackIdentity = installTrackIdentityService(window);

    const MODULE_KEY = "__ivLyricsLyricsServiceModule";
    const moduleState = window[MODULE_KEY] || (window[MODULE_KEY] = {
        initialized: false,
        waitTimer: null
    });

    // Spicetify가 준비될 때까지 대기
    if (!window.Spicetify || !Spicetify.LocalStorage) {
        if (!moduleState.waitTimer) {
            moduleState.waitTimer = setTimeout(() => {
                moduleState.waitTimer = null;
                LyricsServiceExtension();
            }, 300);
        }
        return;
    }

    moduleState.waitTimer = null;
    if (moduleState.initialized) {
        return;
    }
    moduleState.initialized = true;

    const LYRICS_SERVICE_DEBUG = false;
    const serviceDebug = (...args) => {
        if (LYRICS_SERVICE_DEBUG) {
            console.log(...args);
        }
    };
    serviceDebug("[LyricsService] Initializing LyricsService Extension...");

    // ============================================
    // ============================================
    // Utils - 유틸리티 함수들 (Extension 전용)
    // ============================================
    const playbackPosition = installPlaybackPositionService(window, Spicetify, (error) => {
        serviceDebug("[PlaybackClock] precise position sample failed:", error);
    });

    const LanguageModel = createLyricsLanguageModel({
        onReady: () => window.dispatchEvent(new CustomEvent("ivLyrics:language-model-ready")),
    });

    const { detectLanguage, detectLanguageByRules, ...languageCache } = createLyricsLanguageDetector({
        languageModel: LanguageModel,
        readSetting: (key) => Spicetify.LocalStorage.get(key),
    });
    const Utils = {
        ...languageCache,
        ...playbackPosition,

        isSpotifyTrackId(value) {
            return TrackIdentity.isSpotifyTrackId(value);
        },

        isSpotifyTrackUri(uri) {
            return TrackIdentity.isSpotifyTrackUri(uri);
        },

        isLocalTrackUri(uri) {
            return TrackIdentity.isLocalTrackUri(uri);
        },

        extractTrackId(uri) {
            return TrackIdentity.extractTrackId(uri);
        },

        getTranslationCacheId(uri) {
            return TrackIdentity.getTranslationCacheId(uri);
        },

        isSectionHeader: sharedIsLyricsSectionHeader,

        detectLanguage,
        detectLanguageByRules,
    };

    publishRuntimeService("Utils", Utils, window);

    // ============================================
    // API 요청/응답 추적 시스템 (Debug용)
    // ============================================
    const ApiTracker = publishRuntimeService("ApiTracker", createApiTracker(), window);

    // ============================================
    const getLyricsSourceScope = value => TrackIdentity.extractTrackId(value) || getLocalTrackUriFromCacheId(value) || value;

    const lyricPresentation = createLyricSupplementPresentation({
        getDisplayComparison: () => getRuntimeService("ivLyricsTextComparison", window)?.areEquivalent,
        hashSourceText: getTranslationSourceCacheHash,
    });
    const lyricsPresentations = createLyricsPresentationStore({
        getPresentationKey: lyricPresentation.getPresentationKey,
        preserveAuxiliaryLyrics: lyricPresentation.preserveAuxiliaryLyrics,
        onPublish: (snapshot) => {
            window.dispatchEvent(new CustomEvent('ivLyrics:shared-lyrics-updated', {
                detail: snapshot
            }));
        },
    });
    const providerRequests = createLyricsProviderRequests(
        () => getRuntimeService("LyricsAddonManager", window),
        () => lyricsPresentations.clear(),
        getLyricsSourceScope,
    );
    function invalidateLyricsSourceForCache(trackId) {
        if (!trackId) {
            lyricsPresentations.clear();
        } else {
            const scope = getLyricsSourceScope(trackId);
            lyricsPresentations.clearMatching(uri => getLyricsSourceScope(uri) === scope);
        }
        // A provider's abort handler can immediately start a replacement lookup.
        providerRequests.invalidate(trackId);
    }
    let selectionNotificationQueued = false;
    function refreshLyricsProviderSelection() {
        invalidateLyricsSourceForCache();
        if (selectionNotificationQueued) return;
        selectionNotificationQueued = true;
        queueMicrotask(() => {
            selectionNotificationQueued = false;
            window.dispatchEvent(new CustomEvent(LYRICS_PROVIDER_SELECTION_CHANGED));
        });
    }
    window.addEventListener("ivLyrics", event => {
        if (isLyricsProviderSelectionSetting(event.detail?.name)) refreshLyricsProviderSelection();
    });

    const LyricsCache = createLyricsCache({
        getIndexedDB: () => indexedDB,
        waitForDatabaseRecovery: () => readSettingsDatabaseRecovery(window),
        getKeyRange: () => IDBKeyRange,
        getPersistentStorage: () => globalThis.navigator?.storage,
        onInvalidating: invalidateLyricsSourceForCache,
        onInvalidated: (trackId) => window.dispatchEvent(new CustomEvent(LYRICS_CACHE_INVALIDATED_EVENT, { detail: { trackId } })),
        debug: serviceDebug,
    });

    // 시작 시 만료된 캐시 정리 (5초 후 백그라운드에서)
    setTimeout(() => LyricsCache.cleanup(), 5000);

    // 전역에 등록
    publishRuntimeService("LyricsCache", LyricsCache, window);


    // ============================================
    // SyncDataService - 커뮤니티 싱크 데이터 서비스
    // 가사 없이 타이밍 정보만 저장/적용하는 시스템
    // ============================================
    const SyncDataService = createSyncDataService({
        extractTrackId: (uri) => TrackIdentity.extractTrackId(uri),
        getPlayer: () => Spicetify.Player,
        getPlatform: () => Spicetify.Platform,
        readSpotifyAccountKey: () => getSpotifyAccountKey(Spicetify),
        getUriApi: () => Spicetify.URI,
        getCosmosApi: () => Spicetify.CosmosAsync,
        getSpotifyTrackData: (uri) => getRuntimeService("SpotifyDataHelper", window)?.extractSpotifyData?.(uri),
        getStorage: () => window.localStorage || localStorage || null,
        request: (...args) => fetch(...args),
        schedule: (callback, delay) => setTimeout(callback, delay),
        cancelScheduled: (timer) => clearTimeout(timer),
        getCodec: () => readSyncDataCodec(window),
        getUserHash,
        getAuthUtils: () => Utils,
        readStoredAuthToken: () => Spicetify.LocalStorage.get("ivLyrics:auth-token"),
        getClientVersion: () => Spicetify.Config.version,
        translate: (...args) => getRuntimeService("I18n", window).t(...args),
        log: (message, details = null, level = "info") => {
            const logger = level === "warn" ? console.warn : console.info;
            if (details == null) logger("[ivLyrics sync-data]", message);
            else logger("[ivLyrics sync-data]", message, details);
        },
        reportWarning: (...args) => console.warn(...args),
        debug: createRuntimeDebugLogger(window),
    });

    publishRuntimeService("SyncDataService", SyncDataService, window);

    const PseudoKaraokeService = createPseudoKaraokeService({
        getSetting: (key) => localStorage.getItem(key),
        getAudioDataFetcher: () => typeof Spicetify.getAudioData === 'function'
            ? (uri) => Spicetify.getAudioData(uri)
            : null,
        extractTrackId: (uri) => Utils.extractTrackId(uri),
        getPlaybackDuration: () => Spicetify.Player?.data?.item?.duration?.milliseconds,
        debug: createRuntimeDebugLogger(window),
    });

    publishRuntimeService("PseudoKaraokeService", PseudoKaraokeService, window);



    // ============================================
    // LyricsService - 통합 API
    // 다른 모듈에서 가사/번역/발음을 가져오는 통합 인터페이스
    // ============================================
    const trackOverrides = getTrackOverrideStores(window);
    const localLyrics = createLocalLyricsStore({
        readStorage: () => localStorage,
        onReadError: error => console.warn("[LyricsService] Failed to read local lyrics:", error),
    });

    const communityLyricsSync = createCommunityLyricsSync({
        syncDataService: SyncDataService,
        extractTrackId: (uri) => Utils.extractTrackId(uri),
        getSpotifyTrackData: (uri) => getRuntimeService("SpotifyDataHelper", window)?.extractSpotifyData?.(uri),
        request: (...args) => fetch(...args),
        reportWarning: (...args) => console.warn(...args),
    });

    const getResearch = createLyricsResearch({
        cache: LyricsCache,
        getAIManager: () => getRuntimeService("AIAddonManager", window),
        getSpotifyLocale: () => Spicetify.Locale?.getLocale(),
        debug: serviceDebug,
    });

    const sendLyricsToConsumers = ({
        trackInfo,
        lyrics,
        sendToOverlay = true,
        forceResend = false,
        sendReason = 'normal',
        presentationContext = null
    }) => {
        const sends = [];
        const queueSend = (sender) => {
            if (!sender?.sendLyrics) return;
            try {
                sends.push(sender.sendLyrics(
                    trackInfo,
                    lyrics,
                    forceResend,
                    sendReason,
                    presentationContext
                ));
            } catch (error) {
                sends.push(Promise.reject(error));
            }
        };

        if (sendToOverlay) {
            queueSend(getRuntimeService("OverlaySender", window));
        }
        queueSend(getRuntimeService("lyricsHelperSender", window));
        return Promise.allSettled(sends);
    };

    const LyricsService = {
        // 버전 정보
        version: "1.0.0",

        // 원본 글자별 싱크를 보존하면서 렌더링용 단어 구간만 파생한다.
        hasContinuousKaraokeWordRun: KaraokeWordTiming.hasContinuousWordRun,
        buildKaraokeWordSegments: KaraokeWordTiming.buildTimedSegments,
        applyLatinKaraokeFillTiming: KaraokeWordTiming.applyLatinWordFillTiming,

        // 캐시 접근
        cache: LyricsCache,

        // API 트래커 접근
        tracker: ApiTracker,

        publishLyricsSnapshot: lyricsPresentations.publish,
        getLyricsSnapshot(trackUri) {
            providerRequests.getRevision(trackUri);
            return lyricsPresentations.get(trackUri);
        },

        async sendLyricsSnapshotToConsumers(trackInfo, snapshot, options = {}) {
            const lyrics = snapshot?.displayLyrics;
            if (!trackInfo?.uri || snapshot?.trackUri !== trackInfo.uri
                || !Array.isArray(lyrics) || lyrics.length === 0) {
                return false;
            }

            await sendLyricsToConsumers({
                trackInfo: {
                    ...(snapshot.trackInfo || {}),
                    ...trackInfo,
                    uri: trackInfo.uri
                },
                lyrics,
                sendToOverlay: options.sendToOverlay !== false,
                forceResend: options.forceResend === true,
                sendReason: options.sendReason || 'shared-snapshot',
                presentationContext: {
                    provider: snapshot.provider,
                    lyricsType: snapshot.lyricsType,
                    displayMode1: snapshot.displayMode1,
                    displayMode2: snapshot.displayMode2,
                    detectedLanguage: snapshot.detectedLanguage === null ? 'auto' : snapshot.detectedLanguage,
                    pronunciationNotation: snapshot.pronunciationNotation,
                    translationTargetLanguage: snapshot.translationTargetLanguage,
                    translationStyle: snapshot.translationStyle,
                    translationSourceText: snapshot.translationSourceText,
                    presentationComplete: snapshot.presentationComplete
                }
            });
            return true;
        },

        clearLyricsPresentationSnapshot: lyricsPresentations.clear,

        clearLyricsSnapshot(trackUri) {
            const cleared = this.clearLyricsPresentationSnapshot(trackUri);
            providerRequests.invalidate(trackUri);
            return cleared;
        },
        getLyricsRequestRevision: providerRequests.getRevision,
        getCacheRevision: LyricsCache.getRevision,
        refreshLyricsProviderSelection,

        getTrackLanguageOverride: trackOverrides.readLanguage,
        async getTrackLyricsProviderOverride(uri) {
            if (!TrackIdentity.extractTrackId(uri)) return null;
            const provider = await trackOverrides.readProvider(uri);
            const manager = getRuntimeService("LyricsAddonManager", window);
            return provider && manager?.getAddon && !manager.getAddon(provider) ? null : provider;
        },

        async getTrackSyncOffset(trackUri) {
            return Number(await getTrackSyncOffsetStore(window).getOffset(trackUri)) || 0;
        },

        // Track ID / local track 판별
        trackIdentity: TrackIdentity,

        getTrackArtwork(track) {
            return TrackIdentity.getTrackArtwork(track);
        },

        isSpotifyTrackId(value) {
            return TrackIdentity.isSpotifyTrackId(value);
        },

        isSpotifyTrackUri(uri) {
            return TrackIdentity.isSpotifyTrackUri(uri);
        },

        isLocalTrackUri(uri) {
            return TrackIdentity.isLocalTrackUri(uri);
        },

        extractTrackId(uri) {
            return TrackIdentity.extractTrackId(uri);
        },

        getTranslationCacheId(uri) {
            return TrackIdentity.getTranslationCacheId(uri);
        },

        // 언어 감지 (Extension 내 Utils에서 직접 참조)
        detectLanguage(lyrics) {
            return Utils.detectLanguage(lyrics);
        },

        // Waits (at most timeoutMs) for the language model before a first
        // detection, so the opening song is not judged by the rules alone.
        whenLanguageModelReady(timeoutMs = 0) {
            return LanguageModel.whenReady(timeoutMs);
        },

        /**
         * 사용자 해시 가져오기 (없으면 생성)
         * Utils에서 이동됨
         */
        getUserHash() {

            let hash = Spicetify.LocalStorage.get("ivLyrics:user-hash");
            if (!hash) {
                // Generate UUID
                hash = crypto.randomUUID ? crypto.randomUUID() :
                    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
                        const r = Math.random() * 16 | 0;
                        const v = c === 'x' ? r : (r & 0x3 | 0x8);
                        return v.toString(16);
                    });
                Spicetify.LocalStorage.set("ivLyrics:user-hash", hash);
            }
            return hash;
        },



        /**
         * 설정된 우선순위로 여러 제공자의 가사 조회
         * @param {Object} info - 트랙 정보
         * @param {string[]} providerOrder - (deprecated) LyricsAddonManager의 순서 사용
         * @param {number} mode - (deprecated) 가사 모드
         * @param {string|null} forcedProviderId - 이 트랙에서 강제로 사용할 제공자 ID
         * @param {{signal?: AbortSignal}} options - 이 호출자의 조회 취소
         * @returns {Promise<Object>} - 가사 결과
         */
        async getLyricsFromProviders(info, providerOrder = [], mode = 1, forcedProviderId = null, { signal } = {}) {
            return providerRequests.request({
                info,
                forcedProviderId,
                signal,
                getSnapshot: (uri) => this.getLyricsSnapshot(uri),
                publishSnapshot: (update) => this.publishLyricsSnapshot(update),
            });
        },

        /**
         * 싱크 데이터 서비스 접근
         */
        syncData: SyncDataService,

        /**
         * 캐시된 가사 가져오기
         * @param {string} trackId - 트랙 ID
         * @param {string} provider - 제공자 이름
         * @returns {Promise<Object|null>} - 캐시된 가사 또는 null
         */
        async getCachedLyrics(trackId, provider = 'spotify') {
            return await LyricsCache.getLyrics(trackId, provider);
        },

        /**
         * 가사 캐시 저장
         * @param {string} trackId - 트랙 ID
         * @param {string} provider - 제공자 이름
         * @param {Object} data - 가사 데이터
         * @returns {Promise<boolean>}
         */
        async cacheLyrics(trackId, provider, data, canWrite) {
            return await LyricsCache.setLyrics(trackId, provider, data, canWrite);
        },

        updateCachedLyrics(trackId, provider, update) {
            return LyricsCache.updateLyrics(trackId, provider, update);
        },

        /**
         * 번역 가져오기 (캐시 우선)
         * @param {string} trackId - 트랙 ID
         * @param {string} lang - 언어 코드
         * @param {boolean} isPhonetic - 발음 여부
         * @param {string} provider - 가사 제공자
         * @returns {Promise<Object|null>}
         */
        async getTranslation(trackId, lang, isPhonetic = false, provider = null, sourceHash = null) {
            return await LyricsCache.getTranslation(trackId, lang, isPhonetic, provider, sourceHash);
        },

        /**
         * 번역 저장
         * @param {string} trackId - 트랙 ID
         * @param {string} lang - 언어 코드
         * @param {boolean} isPhonetic - 발음 여부
         * @param {Object} data - 번역 데이터
         * @param {string} provider - 가사 제공자
         * @returns {Promise<boolean>}
         */
        async cacheTranslation(trackId, lang, isPhonetic, data, provider = null, sourceHash = null) {
            return await LyricsCache.setTranslation(trackId, lang, isPhonetic, data, provider, sourceHash);
        },

        /**
         * 단어별 보조 가사(줄별 gloss/reading) 가져오기 (캐시 우선)
         */
        async getWordSupplements(trackId, targetLang, sourceLang, kind, sourceHash) {
            return await LyricsCache.getWordSupplements(trackId, targetLang, sourceLang, kind, sourceHash);
        },

        /**
         * 단어별 보조 가사 저장
         */
        async cacheWordSupplements(trackId, targetLang, sourceLang, kind, sourceHash, data, canWrite) {
            return await LyricsCache.setWordSupplements(trackId, targetLang, sourceLang, kind, sourceHash, data, canWrite);
        },

        /**
         * 특정 트랙의 모든 캐시 삭제
         * @param {string} trackId - 트랙 ID
         * @returns {Promise<boolean>}
         */
        async clearTrackCache(trackId) {
            readPronunciationFirst(window)?.clearTrack?.(trackId);
            return await LyricsCache.clearTrack(trackId);
        },

        /**
         * 특정 트랙의 번역 캐시만 삭제
         * @param {string} trackId - 트랙 ID
         * @returns {Promise<boolean>}
         */
        async clearTranslationCache(trackId) {
            readPronunciationFirst(window)?.clearTrack?.(trackId);
            return await LyricsCache.clearTranslationForTrack(trackId);
        },

        /**
         * 특정 트랙의 단어별 보조 가사 캐시만 삭제
         */
        async clearWordSupplementsCache(trackId) {
            return await LyricsCache.clearWordSupplementsForTrack(trackId);
        },

        /**
         * 모든 캐시 삭제
         * @returns {Promise<boolean>}
         */
        async clearAllCache() {
            readPronunciationFirst(window)?.clearTrack?.();
            return await LyricsCache.clearAll();
        },

        /**
         * 캐시 통계 가져오기
         * @returns {Promise<Object>}
         */
        async getCacheStats() {
            return await LyricsCache.getStats();
        },

        /**
         * 현재 재생 중인 트랙 정보 가져오기
         * @returns {Object|null}
         */
        getCurrentTrackInfo() {
            const snapshot = Utils.getPlayerPlaybackSnapshot();
            const item = Utils.resolveStablePlaybackTrack(null, snapshot);
            if (!item) return null;

            return {
                uri: item.uri,
                title: item.name,
                artist: item.artists?.map(a => a.name).join(', ') || '',
                album: item.album?.name || '',
                duration: snapshot.duration || item.duration?.milliseconds || 0,
                playbackId: snapshot.playbackId || null,
                trackId: Utils.extractTrackId(item.uri)
            };
        },

        /**
         * 이벤트 발생 (가사 로드 완료 등)
         * @param {string} eventName - 이벤트 이름
         * @param {Object} data - 이벤트 데이터
         */
        emit(eventName, data) {
            window.dispatchEvent(new CustomEvent(`LyricsService:${eventName}`, { detail: data }));
        },

        /**
         * 이벤트 리스너 등록
         * @param {string} eventName - 이벤트 이름
         * @param {Function} callback - 콜백 함수
         * @returns {Function} - 리스너 해제 함수
         */
        on(eventName, callback) {
            const handler = (e) => callback(e.detail);
            window.addEventListener(`LyricsService:${eventName}`, handler);
            return () => window.removeEventListener(`LyricsService:${eventName}`, handler);
        },

        /**
         * 가사와 발음/번역을 한 번에 가져오기 (통합 API)
         * @param {Object} info - 트랙 정보 { uri, title, artist, duration }
         * @param {Object} options - 옵션
         * @param {string} options.displayMode1 - 첫 번째 표시 모드 (발음 등)
         * @param {string} options.displayMode2 - 두 번째 표시 모드 (번역 등)
         * @param {boolean} options.sendToOverlay - 오버레이로 전송 여부 (기본: true)
         * @param {boolean} options.skipTranslation - 다른 표시 경로가 번역 중일 때 원문만 전송
         * @param {string[]} options.providerOrder - provider 순서
         * @returns {Promise<Object>} - { lyrics, provider, error }
         */
        getFullLyrics(info, options = {}) {
            return requestFullLyrics(this, info, options);
        },

        ...communityLyricsSync,

        /**
         * 장문 음악 Research 가져오기
         * @param {Object} info - 곡/앨범 메타데이터, 현재 가사, 언어와 캐시 옵션
         * @returns {Promise<Object|null>}
         */
        getResearch,

        // Existing extensions may still call this name.
        async getTMI(info) {
            return this.getResearch(info);
        }
    };

    const { getServicePronunciationNotation, getTranslatorErrorMessage, getStorageItem, getTranslationTargetLanguage } =
        createLyricsServicePreferences({
            readNotation: () => readPronunciationNotation(window),
            getVisualSettings: () => getRuntimeService("CONFIG", window)?.visual,
            getI18n: () => getRuntimeService("I18n", window),
            getSettingsStorage: () => readSettingsStorage(window),
            getStoragePersistence: () => readSettingsPersistence(window),
            readSpotifySetting: (key) => Spicetify.LocalStorage.get(key),
            readLocalSetting: (key) => localStorage.getItem(key),
            getSpotifyLocale: () => Spicetify.Locale?.getLocale(),
        });

    const getTranslator = () => Translator;
    const translationModes = createLyricTranslationModes({
        getTranslator,
        checkSectionHeader: (text) => Utils.isSectionHeader(text),
    });
    const requestFullLyrics = createFullLyricsRequest({
        getProviderGeneration: providerRequests.getRevision,
        isPlaybackCurrent: (uri) => isPlaybackLyricsTargetCurrent(
            playbackPosition.getPlayerPlaybackSnapshot(), Spicetify.Player.data?.item?.uri, uri
        ),
        detectLanguage: (lyrics) => Utils.detectLanguage(lyrics),
        readSetting: (key) => getRuntimeService("CONFIG", window)?.visual?.[key.slice("ivLyrics:visual:".length)]
            ?? getStorageItem(key),
        isSectionHeader: (text) => Utils.isSectionHeader(text),
        getTranslationTargetLanguage,
        getPronunciationNotation: getServicePronunciationNotation,
        getTranslationStyle: () => getRuntimeService("AIAddonManager", window)?.getTranslationStyle?.() || "natural",
        readSavedLocalLyrics: (info) => {
            if (!TrackIdentity.isLocalTrackUri(info.uri)) return null;
            const saved = localLyrics.get(info.uri);
            return saved ? PseudoKaraokeService.applyToResult({ ...saved, uri: info.uri, provider: "local" }, info) : null;
        },
        getTranslationCacheId: (uri) => Utils.getTranslationCacheId(uri),
        translationModes,
        getTranslator,
        isPronunciationSyncRequested: (lyrics, source) =>
            !!readPronunciationSlots(window)?.isRequested?.(lyrics, source),
        sendLyricsToConsumers,
        debug: serviceDebug,
        reportWarning: (...args) => console.warn(...args),
        reportError: (...args) => console.error(...args),
    });

    publishRuntimeService("LyricsService", LyricsService, window);

    // Utils가 없을 경우 대체
    function getUserHash() {
        return LyricsService.getUserHash();
    }

    const Translator = createTranslator({
        LocalLanguageConverter: createLocalLanguageConverter({
            getDocument: () => document,
            getLibrary: (name) => window[name],
            getXMLHttpRequest: () => XMLHttpRequest,
            schedule: (callback, delay) => setTimeout(callback, delay),
        }),
        cache: LyricsCache,
        getActiveTranslationCacheId: () => Utils.getTranslationCacheId(Spicetify.Player.data?.item?.uri),
        getTargetLanguage: getTranslationTargetLanguage,
        getPronunciationNotation: getServicePronunciationNotation,
        getAIManager: () => getRuntimeService("AIAddonManager", window),
        getPronunciationSlots: () => readPronunciationSlots(window),
        getPronunciationTiming: () => readPronunciationFirst(window),
        getApiTracker: () => ApiTracker,
        detectLyricsLanguage: (lines) => LyricsService.detectLanguage(lines),
        errorMessage: getTranslatorErrorMessage,
        debug: serviceDebug,
    });

    // 전역에 Translator 등록
    publishRuntimeService("Translator", Translator, window);

    const getOverlayProgressIsPlaying = createOverlayPlaybackVisibility({
        document,
        getVisualSettings: () => getRuntimeService("CONFIG", window)?.visual,
        getStorageItem,
        isPlayerPlaying: () => Spicetify.Player.isPlaying(),
    });

    // Both senders operate across Spotify routes and reuse the same playback
    // and offset readers as the lyrics service.
    const getOverlaySyncOffset = createOverlayOffsetResolver({
        readSettingSources: [
            (key) => typeof getStorageItem === 'function' ? getStorageItem(key) : null,
            (key) => readSettingsStorage(window)?.getItem?.(key),
            (key) => readSettingsPersistence(window)?.getItem?.(key),
            (key) => Spicetify.LocalStorage.get(key),
            (key) => typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null,
        ],
        getVisualSettings: () => getRuntimeService("CONFIG", window)?.visual,
        getMountedLyricsPage: () => getMountedLyricsPage(window),
        getPageGlobalOffset: () => getRuntimeService("Utils", window)?.getGlobalSyncOffset?.(),
        readTrackOffset: (uri) => getTrackSyncOffsetStore(window).getOffset(uri),
    });

    const { OverlaySender, lyricsHelperSender } = createOverlaySenders({
        host: window,
        getSpicetify: () => Spicetify,
        getSyncOffset: getOverlaySyncOffset,
        playback: playbackPosition,
        getOverlayProgressIsPlaying,
        resolveSpotifyImageUrl,
        scheduleSenderBootstrap: (delay = 1200, previousUri = null) => {
            getRuntimeService("ivLyricsOverlayService", window)?.schedule?.(delay, previousUri);
        },
        debug: serviceDebug,
        lyricPresentation,
        mapLyricsForSender: createOverlayLyricPayload(lyricPresentation),
    });

    installLyricsReadySnapshotListener(window, (snapshot) => LyricsService.publishLyricsSnapshot(snapshot));

    // OverlayService extension이 초기화 중 sender를 즉시 찾을 수 있도록 먼저 등록한다.
    publishRuntimeService("OverlaySender", OverlaySender, window);
    publishRuntimeService("lyricsHelperSender", lyricsHelperSender, window);

    OverlaySender.init();
    lyricsHelperSender.init();

    serviceDebug("[LyricsService] LyricsService Extension initialized successfully!");
    serviceDebug("[LyricsService] Available APIs: window.LyricsService, window.LyricsCache, window.ApiTracker, window.Translator, window.OverlaySender, window.lyricsHelperSender");
}
