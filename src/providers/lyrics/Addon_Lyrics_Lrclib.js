import { createRuntimeDebugLogger, writeRuntimeDebug } from "#ivlyrics/spicetify/runtimeDebug.mjs";
import { readTrackIdentityService } from "../../core/trackIdentity.mjs";
import { readSettingsStorage } from "../../core/settingsRuntime.mjs";
/**
 * ================================================================================
 * LRCLIB Lyrics Provider Addon
 * ================================================================================
 *
 * 이 파일은 LRCLIB(https://lrclib.net) 오픈소스 가사 데이터베이스에서
 * 가사를 검색하고 가져오는 Spicetify 애드온입니다.
 *
 * 【주요 기능】
 * - 구조화 검색 중심 LRCLIB 검색 흐름 적용
 * - 제목 + 가수 + 앨범 구조화 검색 후 필요 시 다단계 자유검색 폴백
 * - Jaro-Winkler 알고리즘 기반 아티스트 유사도 매칭
 * - duration 기반 최근접 후보 선택 및 노래방/싱크/일반 가사 지원
 * - 네트워크 오류 시 자동 재시도 메커니즘
 *
 * 【검색 전략】
 * - /api/search 구조화 검색(track_name + artist_name + album_name)
 * - 구조화 검색에서 적합한 후보가 없을 때 q=title+artist, q=title 순서로 자유검색 폴백
 * - 아티스트 유사도 또는 강한 제목 일치 + 정확한 duration 조건으로 후보 채택
 *
 * @addon-type lyrics        - 가사 제공자 타입의 애드온
 * @id lrclib               - 고유 식별자
 * @name LRCLIB             - 표시 이름
 * @version 1.0.0           - 버전 정보
 * @author default          - 제작자
 * @supports karaoke: true  - Lyricsfile word sync 기반 노래방 모드 지원
 * @supports synced: true   - 시간 동기화된 가사 지원
 * @supports unsynced: true - 시간 동기화 없는 일반 가사 지원
 */

import { readLocalLrclib } from "./localLrclibRuntime.mjs";
import { readLyricsAddonManager, registerLyricsAddon } from "./lyricsAddonRegistration.mjs";
import { createSpotifyTrackMetadataLookup } from "../../spicetify/spotifyTrackMetadata.mjs";
import { getRuntimeService, publishRuntimeService } from "../../spicetify/runtimeServices.mjs";
import { requestLyricsReload } from "../../spicetify/lyricsPageActions.mjs";
import { createLrclibReadTransport } from "./createLrclibReadTransport.mjs";
import { createLrclibTrackMatcher } from "./createLrclibTrackMatcher.mjs";
import {
    LRCLIB_PROVIDER_ID, analyzeLyricsLanguageMix, getCandidateLyricsText,
    getSyncDataLineCharCounts,
    getCandidateSyncLineMatch, getLyricsTextFingerprint, getSyncDataLrclibSource,
    getCandidateSourceMatch, getSyncDataLrclibId,
} from "./lrclibSourceMatching.mjs";
import {
    createLrclibSearch, LRCLIB_API_BASE,
} from "./createLrclibSearch.mjs";
import { createLrclibResults } from "./createLrclibResults.mjs";
import { ADDON_LOCALIZATION } from "./lrclibLocalization.mjs";
import { createLrclibCandidateSearch } from "./createLrclibCandidateSearch.mjs";
import { createLrclibSettings } from "./createLrclibSettings.mjs";
import { createLrclibPlayback } from "./createLrclibPlayback.mjs";

export default function initializeLrclibLyricsAddon() {

    function normalizeAddonLanguageCode(language) {
        const value = String(language || '').replace(/"/g, '').trim();
        if (!value) return 'en';

        const lower = value.toLowerCase();
        if (lower === 'zh' || lower.startsWith('zh-cn') || lower.startsWith('zh-hans')) return 'zh-CN';
        if (lower.startsWith('zh-tw') || lower.startsWith('zh-hant')) return 'zh-TW';

        const base = lower.split('-')[0];
        const supportedBase = ['en', 'ko', 'ja', 'id', 'pt', 'vi', 'th', 'ru', 'fr', 'hi', 'ar', 'bn', 'es', 'it', 'fa', 'de', 'sv', 'cs', 'tr', 'ms'];
        if (supportedBase.includes(base)) return base;

        return 'en';
    }

    function getAddonLanguage() {
        const language = getRuntimeService("I18n", window)?.getCurrentLanguage?.()
            || readSettingsStorage(window)?.getItem?.('ivLyrics:visual:language')
            || Spicetify.LocalStorage?.get?.('ivLyrics:visual:language')
            || Spicetify.Locale?.getLocale?.()
            || 'en';

        return normalizeAddonLanguageCode(language);
    }

    function getAddonText(path, fallback = '') {
        const language = getAddonLanguage();
        const languageTable = ADDON_LOCALIZATION[language] || ADDON_LOCALIZATION.en;
        const resolved = path.split('.').reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), languageTable);
        return resolved ?? fallback;
    }

    function buildAddonDescriptions() {
        return Object.fromEntries(
            Object.entries(ADDON_LOCALIZATION).map(([lang, messages]) => [lang, messages.description])
        );
    }

    // ============================================
    // Addon Metadata (애드온 메타데이터)
    // ============================================
    // LyricsAddonManager가 이 애드온을 식별하고 관리하는 데 사용하는 정보입니다.
    // UI에 표시되는 이름, 설명, 아이콘 등이 포함됩니다.

    const ADDON_INFO = {
        id: LRCLIB_PROVIDER_ID,           // 【고유 ID】 다른 애드온과 구분하기 위한 식별자
        name: 'LRCLIB',         // 【표시 이름】 UI에 표시되는 애드온 이름
        author: 'default',       // 【제작자】 애드온 개발자 정보
        version: '1.0.0',       // 【버전】 시맨틱 버저닝 (Major.Minor.Patch)
        cacheVersion: '2026-03-19-search-flow-rework-3',

        // 【다국어 설명】 사용자 언어 설정에 따라 표시
        description: buildAddonDescriptions(),

        // 【지원 가사 유형】 이 애드온이 제공할 수 있는 가사 형식
        supports: {
            karaoke: true,    // 노래방 모드 (Lyricsfile 단어별 하이라이트) - 지원
            karaokeWord: true,
            synced: true,     // 싱크 가사 (타임스탬프 포함 LRC 형식) - 지원
            unsynced: true    // 일반 가사 (텍스트만) - 지원
        },

        // Spotify 트랙 ID 없이 제목/아티스트/앨범/재생 시간으로 검색 가능
        supportsLocalTracks: true,
        supportsAbortSignal: true,

        // 【아이콘】 SVG path 데이터 - LRC 파일을 나타내는 문서 아이콘
        icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM8 12h8v2H8v-2zm0 4h8v2H8v-2zm0-8h3v2H8V8z'
    };

    // ============================================
    // API Endpoints (API 엔드포인트)
    // ============================================
    // 공식 LRCLIB API 주소입니다. 생성기의 수동 검색/싱크 제작은 항상 이 주소를 쓰며,
    // 일반 재생은 커스텀 서버의 조회/검색 전체를 끝낸 뒤 공식 서버로 넘어갑니다.
    //
    // 【사용 가능한 엔드포인트】
    // - GET /api/search?track_name=...&artist_name=... : 구조화된 검색
    // - GET /api/search?q=... : 자유 텍스트 검색
    // - GET /api/get?...      : 특정 가사 직접 조회

    const LRCLIB_CACHE_VERSION_BASE = '2026-10-16-same-song-title-1';
    const LRCLIB_SETTING_KEYS = {
        customApiEndpoint: 'custom_api_endpoint',
        fallbackTitleArtist: 'enable_fallback_title_artist',
        fallbackTitleOnly: 'enable_fallback_title_only'
    };
    const LRCLIB_DEFAULT_SETTINGS = {
        [LRCLIB_SETTING_KEYS.customApiEndpoint]: '',
        [LRCLIB_SETTING_KEYS.fallbackTitleArtist]: true,
        [LRCLIB_SETTING_KEYS.fallbackTitleOnly]: true
    };

    /**
     * LRCLIB 설정용 LocalStorage 키를 반환합니다.
     *
     * @param {string} key - 설정 키
     * @returns {string} 저장소 키
     */
    function getAddonStorageKey(key) {
        return `ivLyrics:lyrics:addon:${ADDON_INFO.id}:${key}`;
    }

    /**
     * LRCLIB 설정값을 읽습니다.
     * LyricsAddonManager가 있으면 그 경로를 우선 사용하고,
     * 없으면 LocalStorage에서 직접 읽습니다.
     *
     * @param {string} key - 설정 키
     * @param {*} defaultValue - 기본값
     * @returns {*} 저장된 값 또는 기본값
     */
    function getProviderSetting(key, defaultValue) {
        const manager = readLyricsAddonManager(window);
        if (manager?.getAddonSetting) {
            return manager.getAddonSetting(ADDON_INFO.id, key, defaultValue);
        }

        const value = Spicetify.LocalStorage?.get?.(getAddonStorageKey(key));
        if (value === null || value === undefined) return defaultValue;

        try {
            return JSON.parse(value);
        } catch {
            return value;
        }
    }

    /**
     * LRCLIB 설정값을 저장합니다.
     * LyricsAddonManager가 있으면 설정 변경 이벤트와 새로고침을 함께 활용합니다.
     *
     * @param {string} key - 설정 키
     * @param {*} value - 저장할 값
     */
    function setProviderSetting(key, value) {
        const manager = readLyricsAddonManager(window);
        if (manager?.setAddonSetting) {
            manager.setAddonSetting(ADDON_INFO.id, key, value);
            return;
        }

        const serialized = typeof value === 'string' ? value : JSON.stringify(value);
        Spicetify.LocalStorage?.set?.(getAddonStorageKey(key), serialized);
    }

    /**
     * 현재 활성화된 LRCLIB 자유검색 설정을 반환합니다.
     *
     * @returns {{ enableFallbackTitleArtist: boolean, enableFallbackTitleOnly: boolean }}
     */
    function getSearchSettings() {
        return {
            enableFallbackTitleArtist: getProviderSetting(
                LRCLIB_SETTING_KEYS.fallbackTitleArtist,
                LRCLIB_DEFAULT_SETTINGS[LRCLIB_SETTING_KEYS.fallbackTitleArtist]
            ) !== false,
            enableFallbackTitleOnly: getProviderSetting(
                LRCLIB_SETTING_KEYS.fallbackTitleOnly,
                LRCLIB_DEFAULT_SETTINGS[LRCLIB_SETTING_KEYS.fallbackTitleOnly]
            ) !== false
        };
    }

    function normalizeCustomApiEndpoint(value) {
        const input = String(value ?? '').trim();
        if (!input) return '';
        const url = new URL(input);
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password
            || input.includes('?') || input.includes('#')) {
            throw new Error('Invalid LRCLIB API base URL');
        }
        url.pathname = url.pathname.replace(/\/+$/, '') || '/api';
        return url.href.replace(/\/$/, '');
    }

    function getCustomApiEndpoint() {
        try {
            const endpoint = normalizeCustomApiEndpoint(getProviderSetting(LRCLIB_SETTING_KEYS.customApiEndpoint, ''));
            return endpoint === LRCLIB_API_BASE ? '' : endpoint;
        } catch {
            // An invalid imported/older value must never break official loading.
            return '';
        }
    }

    function getCustomApiText(name, fallback) {
        const key = `settings.lyricsProviders.lrclibCustomApi.${name}`;
        const translated = getRuntimeService("I18n", window)?.t?.(key);
        return translated && translated !== key ? translated : fallback;
    }

    /**
     * 현재 LRCLIB 설정을 반영한 캐시 버전을 생성합니다.
     *
     * @returns {string} 설정 상태가 포함된 캐시 버전 문자열
     */
    function buildCacheVersion() {
        const settings = getSearchSettings();
        const customApi = getCustomApiEndpoint();
        const localCacheVersion = readLocalLrclib(window)?.getCacheVersion?.();
        return `${LRCLIB_CACHE_VERSION_BASE}:fta=${settings.enableFallbackTitleArtist ? 1 : 0}:fto=${settings.enableFallbackTitleOnly ? 1 : 0}`
            + (customApi ? `:custom=${getLyricsTextFingerprint(customApi)}` : '')
            + (localCacheVersion
                ? `:local=${getLyricsTextFingerprint(localCacheVersion)}` : '');
    }

    /**
     * 애드온 객체와 결과에 사용할 캐시 버전을 최신 설정에 맞춰 갱신합니다.
     *
     * @returns {string} 최신 캐시 버전
     */
    function syncAddonCacheVersion() {
        const version = buildCacheVersion();
        ADDON_INFO.cacheVersion = version;
        if (typeof LrclibLyricsAddon !== 'undefined') {
            LrclibLyricsAddon.cacheVersion = version;
        }
        return version;
    }

    const debug = createRuntimeDebugLogger(window);
    const getTrackMetadataForAcceptLanguage = createSpotifyTrackMetadataLookup({
        readSpicetify: () => Spicetify,
        fetchHost: window,
        debug,
    });
    const matcher = createLrclibTrackMatcher();
    const { splitArtists, hasExactDurationMatch } = matcher;

    const lrclibReadTransport = createLrclibReadTransport({
        request: (...args) => fetch(...args),
        readProxyTemplate: () => window.localStorage?.getItem('spicetify:corsProxyTemplate'),
        readClientVersion: () => Spicetify.Config?.version,
        debug,
    });
    const fetchWithTimeout = lrclibReadTransport.fetch;
    const search = createLrclibSearch({
        matcher, request: fetchWithTimeout, getTrackMetadataForAcceptLanguage,
    });

    // Available before manager registration and independent of provider enablement.
    publishRuntimeService("IvLyricsLrclibTransport", lrclibReadTransport, window);

    const results = createLrclibResults({
        matcher,
        parseTrackMetadata: parseLrclibTrackMetadata,
        debug,
    });
    const { getLyricsForPlayback, getPlaybackFromApi } = createLrclibPlayback({
        search,
        results,
        fetchWithTimeout,
        rawRequest: (...args) => fetch(...args),
        readLocalDatabase: () => readLocalLrclib(window),
        getCustomApiEndpoint,
        resolveLrclibTrackContext,
        parseLrclibTrackMetadata,
        getTrackMetadataForAcceptLanguage,
        fetchLrclibCandidateById,
        decorateDirectCandidate,
        debug,
    });

    async function fetchLrclibCandidateById(source, headers, { baseUrl = LRCLIB_API_BASE, request = fetchWithTimeout, signal } = {}) {
        const lrclibId = getSyncDataLrclibId(source);
        if (!lrclibId) return null;

        const response = await request(`${baseUrl}/get/${encodeURIComponent(lrclibId)}`, { headers }, 35000);
        if (!response || !response.ok) {
            writeRuntimeDebug(window, `[LR-DEBUG] Direct LRCLIB get failed for id=${lrclibId}: ${response?.status || 'network'}`);
            return null;
        }

        const candidate = await response.json();
        signal?.throwIfAborted();
        if (!candidate || (!candidate.syncedLyrics && !candidate.plainLyrics && !candidate.instrumental)) {
            writeRuntimeDebug(window, `[LR-DEBUG] Direct LRCLIB get returned no lyrics for id=${lrclibId}`);
            return null;
        }

        return candidate;
    }

    function decorateDirectCandidate(candidate, source, trackDurationSec = 0) {
        if (!candidate) return null;
        const sourceLineCounts = Array.isArray(source?.lineCharCounts) ? source.lineCharCounts : null;
        const sourceLineMatch = getCandidateSyncLineMatch(candidate, sourceLineCounts);
        const preferredLyricsSource = sourceLineMatch.preferredLyricsSource
            || source?.preferredLyricsSource
            || (candidate.syncedLyrics ? 'synced' : (candidate.plainLyrics ? 'plain' : null));
        const lyricsText = getCandidateLyricsText(candidate, preferredLyricsSource);
        const lyricsMix = analyzeLyricsLanguageMix(lyricsText);
        const durationDiff = Math.abs(Number(candidate?.duration || 0) - trackDurationSec);
        const sourceMatch = getCandidateSourceMatch({
            ...candidate,
            preferredLyricsSource
        }, source);

        return {
            ...candidate,
            preferredLyricsSource,
            artistScore: 1,
            titleScore: 1,
            durationDiff,
            exactDurationMatch: hasExactDurationMatch(trackDurationSec, Number(candidate?.duration || 0)),
            artistMatched: true,
            titleDrivenMatch: false,
            syncLineExactMatch: sourceLineMatch.syncLineExactMatch,
            exactSyncedLineMatch: sourceLineMatch.exactSyncedLineMatch,
            exactPlainLineMatch: sourceLineMatch.exactPlainLineMatch,
            lyricsMix,
            hasInterleavedTranslations: lyricsMix.hasInterleavedTranslations,
            matchReason: 'sync-source',
            ...sourceMatch
        };
    }

    // ============================================
    // Addon Implementation (애드온 구현부)
    // ============================================
    // LyricsAddonManager에 등록될 실제 애드온 객체입니다.
    // ADDON_INFO를 스프레드하여 메타데이터를 포함하고,
    // init(), getSettingsUI(), getLyrics() 메서드를 구현합니다.

    // 트랙 컨텍스트(요청 헤더 + 기존 sync-data 기반 정보) 준비 로직은
    // searchCandidates()와 getLyrics()에서 동일하다. 동일 로직을 헬퍼로 공유하되
    // trackId/trackIsrc는 내부에서만 쓰이므로 그대로 지역 변수로 남긴다.
    const getHeaders = () => ({ 'x-user-agent': `spicetify v${Spicetify.Config?.version || 'unknown'}` });
    async function resolveLrclibTrackContext(info) {
        const headers = getHeaders();
        const trackId = getRuntimeService("LyricsService", window)?.extractTrackId?.(info?.uri)
            || readTrackIdentityService(window)?.extractTrackId?.(info?.uri)
            || '';
        let trackIsrc;
        try {
            trackIsrc = await getRuntimeService("SyncDataService", window)?.resolveTrackIsrc?.(trackId, info)
                || getRuntimeService("SyncDataService", window)?.getTrackIsrc?.(trackId, info)
                || getRuntimeService("SyncDataService", window)?.normalizeSyncDataIsrc?.(info?.isrc || info?.external_ids?.isrc || info?.externalIds?.isrc);
        } catch {
            // Missing community metadata must not skip both lyric hosts.
            writeRuntimeDebug(window, '[LR-DEBUG] ISRC context unavailable; using track metadata');
        }
        let syncDataLineCharCounts = null;
        let syncDataSource = null;

        const syncDataService = getRuntimeService("SyncDataService", window);
        if (trackId && syncDataService?.getSyncData) {
            try {
                const existingSyncData = await syncDataService.getSyncData(trackId, ADDON_INFO.id, { ...info, isrc: trackIsrc });
                syncDataLineCharCounts = getSyncDataLineCharCounts(existingSyncData);
                syncDataSource = getSyncDataLrclibSource(existingSyncData);
            } catch (e) {
                writeRuntimeDebug(window, '[LR-DEBUG] Failed to fetch sync-data for exact line matching:', e?.message || e);
            }
        }

        return { headers, syncDataLineCharCounts, syncDataSource };
    }
    // searchCandidates()와 getLyrics()의 트랙 메타데이터 파싱은 동일하다.
    // (getSearchSettings/splitArtists 호출은 원래처럼 호출당 1회씩만 수행된다.)
    function parseLrclibTrackMetadata(info) {
        const title = info?.title?.trim?.();
        const artist = info?.artist?.trim?.();
        const album = info?.album?.trim?.();
        const searchSettings = getSearchSettings();
        const trackDuration = Number(info?.duration || 0);
        const trackDurationSec = trackDuration > 0 ? trackDuration / 1000 : 0;
        const expectedArtists = splitArtists(artist);
        return { title, artist, album, searchSettings, trackDurationSec, expectedArtists };
    }
    const candidateSearch = createLrclibCandidateSearch({
        matcher, search, parseLrclibTrackMetadata, resolveLrclibTrackContext, getHeaders,
        fetchWithTimeout, fetchLrclibCandidateById, decorateDirectCandidate, debug,
    });

    const LrclibLyricsAddon = {
        ...ADDON_INFO,  // 메타데이터 병합 (id, name, version 등)

        /**
         * 【초기화 메서드】
         * 애드온이 로드될 때 호출됩니다.
         * 현재 설정 상태를 반영한 캐시 버전을 동기화합니다.
         */
        async init() {
            syncAddonCacheVersion();
        },

        async prepareLyricsLookup(info) {
            const local = readLocalLrclib(window);
            const state = local?.getState?.();
            if (!info?.lrclibOfficialOnly && typeof local?.connect === 'function'
                && !state?.available && !['ready', 'opening', 'importing'].includes(state?.phase)) {
                let timer;
                try {
                    // A multi-gigabyte import/restoration must never hold cached
                    // playback or online fallbacks behind its control queue.
                    await Promise.race([local.connect(), new Promise(resolve => { timer = setTimeout(resolve, 250); })]);
                } catch { /* Online fallbacks stay available. */ }
                finally { clearTimeout(timer); }
            }
            syncAddonCacheVersion();
        },

        ...candidateSearch,

        /**
         * 【설정 UI 메서드】
         * 사용자 설정 화면에 표시될 React 컴포넌트를 반환합니다.
         * 자유검색 폴백 단계를 개별적으로 켜고 끌 수 있습니다.
         *
         * @returns {Function} React 함수형 컴포넌트
         */
        getSettingsUI() {
            return createLrclibSettings({
                React: Spicetify.React,
                readLocalDatabase: () => readLocalLrclib(window),
                translate: (path) => getRuntimeService("I18n", window)?.t?.(path),
                getProviderSetting, setProviderSetting, normalizeCustomApiEndpoint,
                syncAddonCacheVersion, reloadLyrics: () => requestLyricsReload(window, false),
                getAddonText, getCustomApiText,
                settingKeys: LRCLIB_SETTING_KEYS, defaults: LRCLIB_DEFAULT_SETTINGS,
            });
        },

        /**
         * ────────────────────────────────────────────────────────────────────────────
         * 가사 가져오기 메서드 (getLyrics) - 핵심 메서드
         * ────────────────────────────────────────────────────────────────────────────
         *
         * 【목적】
         * Spotify에서 재생 중인 트랙의 가사를 LRCLIB API에서 검색하여 반환합니다.
         *
         * 【입력 파라미터】
         * @param {Object} info - 트랙 정보 객체
         *   - uri: Spotify URI (예: "spotify:track:abc123")
         *   - title: 곡 제목
         *   - artist: 아티스트 이름
         *   - album: 앨범 이름 (구조화 검색에 사용)
         *   - duration: 곡 길이 (밀리초)
         *
         * 【반환값】
         * @returns {Promise<LyricsResult>} 가사 결과 객체
         *   - uri: 트랙 URI
         *   - provider: 'lrclib'
         *   - karaoke: Lyricsfile에 word sync가 있으면 노래방 가사 배열, 아니면 null
         *   - synced: 싱크 가사 배열 또는 null
         *   - unsynced: 일반 가사 배열 또는 null
         *   - copyright: 저작권 정보 (현재 null)
         *   - error: 에러 메시지 또는 null
         *
         * 【검색 전략】
         * 구조화 검색 + 자유검색 폴백 + 아티스트/재생시간 검증
         */
        async getLyrics(info, { signal } = {}) {
            try {
                signal?.throwIfAborted();
                await LrclibLyricsAddon.prepareLyricsLookup(info);
                signal?.throwIfAborted();
                return await getLyricsForPlayback(info, syncAddonCacheVersion(), signal);
            } catch (error) {
                if (signal?.aborted) return { uri: info?.uri, provider: LRCLIB_PROVIDER_ID, error: 'Lyrics request superseded' };
                throw error;
            }
        },

        _getPlaybackFromApi: getPlaybackFromApi
    };

    syncAddonCacheVersion();

    registerLyricsAddon(LrclibLyricsAddon, window);
}
