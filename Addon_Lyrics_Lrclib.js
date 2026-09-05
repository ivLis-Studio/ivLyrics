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

// ================================================================================
// IIFE (Immediately Invoked Function Expression) 패턴
// ================================================================================
// 전역 스코프 오염을 방지하고, 모든 변수와 함수를 캡슐화합니다.
// 애드온 로드 시 즉시 실행되어 LyricsAddonManager에 자신을 등록합니다.
(() => {
    'use strict';  // 엄격 모드 활성화: 잠재적 오류를 사전에 방지

    const ADDON_LOCALIZATION = {
        en: {
            description: 'Get lyrics from LRCLIB open-source lyrics database',
            settings: {
                fallbackTitleArtistLabel: '1st Fallback (title + artist)',
                fallbackTitleArtistDesc: 'Use q=title+artist free-text search when structured search fails.',
                fallbackTitleOnlyLabel: '2nd Fallback (title only)',
                fallbackTitleOnlyDesc: 'Use q=title free-text search when the first fallback also fails.'
            }
        },
        ko: {
            description: 'LRCLIB 오픈소스 가사 데이터베이스에서 가사를 가져옵니다',
            settings: {
                fallbackTitleArtistLabel: '1차 폴백 (제목 + 아티스트)',
                fallbackTitleArtistDesc: '구조화 검색이 실패하면 q=title+artist 자유검색을 사용합니다.',
                fallbackTitleOnlyLabel: '2차 폴백 (제목만)',
                fallbackTitleOnlyDesc: '1차 폴백도 실패하면 q=title 자유검색을 사용합니다.'
            }
        },
        ja: {
            description: 'LRCLIBのオープンソース歌詞データベースから歌詞を取得します',
            settings: {
                fallbackTitleArtistLabel: '第1フォールバック (タイトル + アーティスト)',
                fallbackTitleArtistDesc: '構造化検索に失敗した場合、q=title+artist の自由検索を使用します。',
                fallbackTitleOnlyLabel: '第2フォールバック (タイトルのみ)',
                fallbackTitleOnlyDesc: '第1フォールバックも失敗した場合、q=title の自由検索を使用します。'
            }
        },
        id: {
            description: 'Ambil lirik dari basis data lirik open-source LRCLIB',
            settings: {
                fallbackTitleArtistLabel: 'Fallback ke-1 (judul + artis)',
                fallbackTitleArtistDesc: 'Gunakan pencarian bebas q=title+artist saat pencarian terstruktur gagal.',
                fallbackTitleOnlyLabel: 'Fallback ke-2 (judul saja)',
                fallbackTitleOnlyDesc: 'Gunakan pencarian bebas q=title saat fallback pertama juga gagal.'
            }
        },
        pt: {
            description: 'Obtenha letras do banco de dados open-source de letras do LRCLIB',
            settings: {
                fallbackTitleArtistLabel: '1º fallback (título + artista)',
                fallbackTitleArtistDesc: 'Use a busca livre q=title+artist quando a busca estruturada falhar.',
                fallbackTitleOnlyLabel: '2º fallback (somente título)',
                fallbackTitleOnlyDesc: 'Use a busca livre q=title quando o primeiro fallback também falhar.'
            }
        },
        vi: {
            description: 'Lấy lời bài hát từ cơ sở dữ liệu lời bài hát mã nguồn mở LRCLIB',
            settings: {
                fallbackTitleArtistLabel: 'Fallback 1 (tên bài + nghệ sĩ)',
                fallbackTitleArtistDesc: 'Dùng tìm kiếm tự do q=title+artist khi tìm kiếm có cấu trúc thất bại.',
                fallbackTitleOnlyLabel: 'Fallback 2 (chỉ tên bài)',
                fallbackTitleOnlyDesc: 'Dùng tìm kiếm tự do q=title khi fallback đầu tiên cũng thất bại.'
            }
        },
        th: {
            description: 'ดึงเนื้อเพลงจากฐานข้อมูลเนื้อเพลงโอเพนซอร์สของ LRCLIB',
            settings: {
                fallbackTitleArtistLabel: 'Fallback ขั้นที่ 1 (ชื่อเพลง + ศิลปิน)',
                fallbackTitleArtistDesc: 'ใช้การค้นหาแบบอิสระ q=title+artist เมื่อการค้นหาแบบมีโครงสร้างล้มเหลว',
                fallbackTitleOnlyLabel: 'Fallback ขั้นที่ 2 (ชื่อเพลงเท่านั้น)',
                fallbackTitleOnlyDesc: 'ใช้การค้นหาแบบอิสระ q=title เมื่อ fallback ขั้นแรกยังล้มเหลว'
            }
        },
        ru: {
            description: 'Получать тексты песен из открытой базы данных LRCLIB',
            settings: {
                fallbackTitleArtistLabel: '1-й fallback (название + артист)',
                fallbackTitleArtistDesc: 'Использовать свободный поиск q=title+artist, если структурированный поиск не дал результата.',
                fallbackTitleOnlyLabel: '2-й fallback (только название)',
                fallbackTitleOnlyDesc: 'Использовать свободный поиск q=title, если первый fallback тоже не дал результата.'
            }
        },
        'zh-CN': {
            description: '从 LRCLIB 开源歌词数据库获取歌词',
            settings: {
                fallbackTitleArtistLabel: '第 1 级回退（标题 + 艺术家）',
                fallbackTitleArtistDesc: '结构化搜索失败时，使用 q=title+artist 自由搜索。',
                fallbackTitleOnlyLabel: '第 2 级回退（仅标题）',
                fallbackTitleOnlyDesc: '第 1 级回退也失败时，使用 q=title 自由搜索。'
            }
        },
        'zh-TW': {
            description: '從 LRCLIB 開源歌詞資料庫取得歌詞',
            settings: {
                fallbackTitleArtistLabel: '第 1 層回退（標題 + 藝術家）',
                fallbackTitleArtistDesc: '結構化搜尋失敗時，使用 q=title+artist 自由搜尋。',
                fallbackTitleOnlyLabel: '第 2 層回退（僅標題）',
                fallbackTitleOnlyDesc: '第 1 層回退也失敗時，使用 q=title 自由搜尋。'
            }
        },
        fr: {
            description: 'Récupérer les paroles depuis la base de données open source LRCLIB',
            settings: {
                fallbackTitleArtistLabel: '1er fallback (titre + artiste)',
                fallbackTitleArtistDesc: 'Utiliser la recherche libre q=title+artist lorsque la recherche structurée échoue.',
                fallbackTitleOnlyLabel: '2e fallback (titre seul)',
                fallbackTitleOnlyDesc: 'Utiliser la recherche libre q=title lorsque le premier fallback échoue aussi.'
            }
        },
        hi: {
            description: 'LRCLIB ओपन-सोर्स गीत डेटाबेस से गीत के बोल प्राप्त करें',
            settings: {
                fallbackTitleArtistLabel: 'पहला fallback (शीर्षक + कलाकार)',
                fallbackTitleArtistDesc: 'स्ट्रक्चर्ड सर्च विफल होने पर q=title+artist फ्री-टेक्स्ट सर्च का उपयोग करें।',
                fallbackTitleOnlyLabel: 'दूसरा fallback (केवल शीर्षक)',
                fallbackTitleOnlyDesc: 'पहला fallback भी विफल होने पर q=title फ्री-टेक्स्ट सर्च का उपयोग करें।'
            }
        },
        ar: {
            description: 'جلب كلمات الأغاني من قاعدة بيانات LRCLIB المفتوحة المصدر',
            settings: {
                fallbackTitleArtistLabel: 'الرجوع الأول (العنوان + الفنان)',
                fallbackTitleArtistDesc: 'استخدم البحث الحر q=title+artist عندما يفشل البحث المنظم.',
                fallbackTitleOnlyLabel: 'الرجوع الثاني (العنوان فقط)',
                fallbackTitleOnlyDesc: 'استخدم البحث الحر q=title عندما يفشل الرجوع الأول أيضًا.'
            }
        },
        bn: {
            description: 'LRCLIB ওপেন-সোর্স গানের লিরিক্স ডাটাবেস থেকে লিরিক্স আনুন',
            settings: {
                fallbackTitleArtistLabel: '১ম fallback (শিরোনাম + শিল্পী)',
                fallbackTitleArtistDesc: 'স্ট্রাকচার্ড সার্চ ব্যর্থ হলে q=title+artist ফ্রি-টেক্সট সার্চ ব্যবহার করুন।',
                fallbackTitleOnlyLabel: '২য় fallback (শুধু শিরোনাম)',
                fallbackTitleOnlyDesc: 'প্রথম fallback-ও ব্যর্থ হলে q=title ফ্রি-টেক্সট সার্চ ব্যবহার করুন।'
            }
        },
        es: {
            description: 'Obtén letras desde la base de datos de letras de código abierto LRCLIB',
            settings: {
                fallbackTitleArtistLabel: '1.er fallback (título + artista)',
                fallbackTitleArtistDesc: 'Usa la búsqueda libre q=title+artist cuando falle la búsqueda estructurada.',
                fallbackTitleOnlyLabel: '2.º fallback (solo título)',
                fallbackTitleOnlyDesc: 'Usa la búsqueda libre q=title cuando también falle el primer fallback.'
            }
        },
        it: {
            description: 'Ottieni i testi dal database open source di LRCLIB',
            settings: {
                fallbackTitleArtistLabel: '1° fallback (titolo + artista)',
                fallbackTitleArtistDesc: 'Usa la ricerca libera q=title+artist quando la ricerca strutturata fallisce.',
                fallbackTitleOnlyLabel: '2° fallback (solo titolo)',
                fallbackTitleOnlyDesc: 'Usa la ricerca libera q=title quando fallisce anche il primo fallback.'
            }
        },
        fa: {
            description: 'دریافت متن آهنگ از پایگاه داده متن ترانه متن باز LRCLIB',
            settings: {
                fallbackTitleArtistLabel: 'fallback اول (عنوان + هنرمند)',
                fallbackTitleArtistDesc: 'وقتی جستجوی ساختاریافته ناموفق است، از جستجوی آزاد q=title+artist استفاده شود.',
                fallbackTitleOnlyLabel: 'fallback دوم (فقط عنوان)',
                fallbackTitleOnlyDesc: 'وقتی fallback اول هم ناموفق است، از جستجوی آزاد q=title استفاده شود.'
            }
        },
        de: {
            description: 'Liedtexte aus der Open-Source-Lyrikdatenbank LRCLIB abrufen',
            settings: {
                fallbackTitleArtistLabel: '1. Fallback (Titel + Interpret)',
                fallbackTitleArtistDesc: 'Verwende die Freitextsuche q=title+artist, wenn die strukturierte Suche fehlschlägt.',
                fallbackTitleOnlyLabel: '2. Fallback (nur Titel)',
                fallbackTitleOnlyDesc: 'Verwende die Freitextsuche q=title, wenn auch der erste Fallback fehlschlägt.'
            }
        }
    };

    function normalizeAddonLanguageCode(language) {
        const value = String(language || '').replace(/"/g, '').trim();
        if (!value) return 'en';

        const lower = value.toLowerCase();
        if (lower === 'zh' || lower.startsWith('zh-cn') || lower.startsWith('zh-hans')) return 'zh-CN';
        if (lower.startsWith('zh-tw') || lower.startsWith('zh-hant')) return 'zh-TW';

        const base = lower.split('-')[0];
        const supportedBase = ['en', 'ko', 'ja', 'id', 'pt', 'vi', 'th', 'ru', 'fr', 'hi', 'ar', 'bn', 'es', 'it', 'fa', 'de'];
        if (supportedBase.includes(base)) return base;

        return 'en';
    }

    function getAddonLanguage() {
        const language = window.I18n?.getCurrentLanguage?.()
            || window.StorageManager?.getItem?.('ivLyrics:visual:language')
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
        id: 'lrclib',           // 【고유 ID】 다른 애드온과 구분하기 위한 식별자
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

        // 【아이콘】 SVG path 데이터 - LRC 파일을 나타내는 문서 아이콘
        icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM8 12h8v2H8v-2zm0 4h8v2H8v-2zm0-8h3v2H8V8z'
    };

    // ============================================
    // API Endpoints (API 엔드포인트)
    // ============================================
    // LRCLIB 서버의 기본 API 주소입니다.
    // 모든 API 요청은 이 주소를 기반으로 구성됩니다.
    // 
    // 【사용 가능한 엔드포인트】
    // - GET /api/search?track_name=...&artist_name=... : 구조화된 검색
    // - GET /api/search?q=... : 자유 텍스트 검색
    // - GET /api/get?...      : 특정 가사 직접 조회

    const LRCLIB_API_BASE = 'https://lrclib.net/api';
    const LRCLIB_DURATION_TOLERANCE_SEC = 15;
    const LRCLIB_ARTIST_MATCH_THRESHOLD = 0.9;
    const LRCLIB_FALLBACK_TITLE_MATCH_THRESHOLD = 0.98;
    const LRCLIB_ENABLE_INEXACT_SEARCH = true;
    const LRCLIB_CACHE_VERSION_BASE = '2026-08-11-sync-source-identity-1';
    const LRCLIB_ENGLISH_ACCEPT_LANGUAGE = 'en-US,en;q=0.9';
    const LRCLIB_LYRICSFILE_VERSION = '1.0';
    const LRCLIB_LYRICSFILE_MAX_LENGTH = 2 * 1024 * 1024;
    const LRCLIB_LYRICSFILE_MAX_DEPTH = 12;
    const LRCLIB_LYRICSFILE_MAX_NODES = 20000;
    const LRCLIB_LYRICSFILE_DEFAULT_LINE_DURATION_MS = 3000;
    const LRCLIB_ORIGINAL_SCRIPT_REGEX = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]/;
    const LRCLIB_MEANINGFUL_TEXT_REGEX = /\p{L}|\p{N}/u;
    const LRCLIB_METADATA_LINE_REGEX = /^\s*\[(?:ar|al|ti|au|length|by|offset|re|ve):[^\]]*\]\s*$/i;
    const LRCLIB_SETTING_KEYS = {
        fallbackTitleArtist: 'enable_fallback_title_artist',
        fallbackTitleOnly: 'enable_fallback_title_only'
    };
    const LRCLIB_DEFAULT_SETTINGS = {
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
        if (window.LyricsAddonManager?.getAddonSetting) {
            return window.LyricsAddonManager.getAddonSetting(ADDON_INFO.id, key, defaultValue);
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
        if (window.LyricsAddonManager?.setAddonSetting) {
            window.LyricsAddonManager.setAddonSetting(ADDON_INFO.id, key, value);
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

    /**
     * 현재 LRCLIB 설정을 반영한 캐시 버전을 생성합니다.
     *
     * @returns {string} 설정 상태가 포함된 캐시 버전 문자열
     */
    function buildCacheVersion() {
        const settings = getSearchSettings();
        return `${LRCLIB_CACHE_VERSION_BASE}:fta=${settings.enableFallbackTitleArtist ? 1 : 0}:fto=${settings.enableFallbackTitleOnly ? 1 : 0}`;
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

    // ============================================
    // Helper Functions (헬퍼 함수)
    // ============================================
    // 가사 검색 및 매칭에 필요한 유틸리티 함수들입니다.
    // 문자열 정규화, 유사도 계산, 네트워크 요청, 가사 파싱 등을 담당합니다.

    /**
     * ────────────────────────────────────────────────────────────────────────────
     * 문자열 정규화 함수 (normalize)
     * ────────────────────────────────────────────────────────────────────────────
     * 
     * 【목적】
     * 서로 다른 형식의 문자열을 비교하기 위해 통일된 형태로 변환합니다.
     * 예: "Hello  World" vs "hello world" → 동일하게 처리
     * 
     * 【정규화 단계】
     * 1. NFKC 유니코드 정규화 - 호환 문자를 표준 형태로 통일
     *    예: ＡＢＣ(전각) → ABC(반각), ｶﾅ(반각) → カナ(전각)
     * 2. 소문자 변환 - 대소문자 구분 제거
     * 3. 양끝 공백 제거 (trim)
     * 4. 스마트 따옴표를 일반 따옴표로 변환
     *    예: '' "" → ' "
     * 5. 모든 종류의 괄호 제거 - 부가 정보(feat., remix 등) 무시
     * 6. 연속 공백을 단일 공백으로 치환
     * 
     * @param {string} s - 정규화할 원본 문자열
     * @returns {string} 정규화된 문자열 (비어있으면 빈 문자열 반환)
     */
    const NORMALIZE_CACHE_MAX_SIZE = 512;
    const NORMALIZE_CACHE_MAX_KEY_LENGTH = 512;
    let normalizeCache = null;

    function normalize(s) {
        if (!s) return '';  // null/undefined 처리

        const canCache = typeof s === 'string' && s.length <= NORMALIZE_CACHE_MAX_KEY_LENGTH;
        const cached = canCache ? normalizeCache?.get(s) : undefined;
        if (cached !== undefined) {
            return cached;
        }

        const normalized = s.normalize('NFKC')       // 유니코드 NFKC 정규화
            .toLowerCase()               // 소문자 변환
            .trim()                      // 앞뒤 공백 제거
            .replace(/[\u2018\u2019]/g, "'")   // ''(스마트 작은따옴표) → '
            .replace(/[\u201c\u201d]/g, '"')   // ""(스마트 큰따옴표) → "
            .replace(/[()[\]{}]/g, '')   // 모든 괄호류 제거: () [] {}
            .replace(/\s+/g, ' ');       // 연속 공백 → 단일 공백

        if (canCache && typeof normalized === 'string') {
            const cache = normalizeCache || (normalizeCache = new Map());
            if (cache.size >= NORMALIZE_CACHE_MAX_SIZE) {
                cache.delete(cache.keys().next().value);
            }
            cache.set(s, normalized);
        }

        return normalized;
    }

    /**
     * ────────────────────────────────────────────────────────────────────────────
     * Jaro-Winkler 유사도 계산 함수
     * ────────────────────────────────────────────────────────────────────────────
     * 
     * 【알고리즘 개요】
     * Jaro-Winkler는 두 문자열 간의 유사도를 0.0 ~ 1.0 사이 값으로 반환합니다.
     * 특히 짧은 문자열이나 오타 검출에 효과적이며, 제목/아티스트 매칭에 적합합니다.
     * 
     * 【계산 과정】
     * 1단계: Jaro 유사도 (dj) 계산
     *   - 일치 윈도우 = max(len1, len2) / 2 - 1
     *   - 윈도우 내에서 일치하는 문자 수 계산
     *   - 순서가 다른 일치(transposition) 계산
     *   - dj = (m/l1 + m/l2 + (m-t)/m) / 3
     * 
     * 2단계: Winkler 보정
     *   - 공통 접두사(최대 4자)에 가중치 부여
     *   - 최종 점수 = dj + prefix * 0.1 * (1 - dj)
     * 
     * 【예시】
     * - "MARTHA" vs "MARHTA" → 약 0.96 (철자 오류에도 높은 유사도)
     * - "DWAYNE" vs "DUANE" → 약 0.84
     * - "ABC" vs "XYZ" → 0.0 (완전 불일치)
     * 
     * @param {string} s1 - 비교할 첫 번째 문자열
     * @param {string} s2 - 비교할 두 번째 문자열
     * @returns {number} 유사도 점수 (0.0 = 완전 불일치, 1.0 = 완전 일치)
     */
    function jaroWinkler(s1, s2) {
        // 먼저 두 문자열을 정규화하여 공정한 비교 수행
        s1 = normalize(s1);
        s2 = normalize(s2);

        // Edge case 처리
        if (!s1 || !s2) return 0;  // 빈 문자열은 유사도 0
        if (s1 === s2) return 1;   // 완전 일치는 유사도 1

        const l1 = s1.length;  // 첫 번째 문자열 길이
        const l2 = s2.length;  // 두 번째 문자열 길이

        // 【일치 윈도우 계산】
        // 두 문자가 "일치"로 간주되려면 위치 차이가 윈도우 이내여야 함
        const matchWindow = Math.floor(Math.max(l1, l2) / 2) - 1;

        // 각 문자열에서 어떤 문자가 일치로 표시되었는지 추적
        const s1Matches = new Array(l1).fill(false);
        const s2Matches = new Array(l2).fill(false);

        // 【1단계: 일치하는 문자 찾기】
        let matches = 0;
        for (let i = 0; i < l1; i++) {
            // 현재 문자 s1[i]와 일치할 수 있는 s2의 범위 계산
            const start = Math.max(0, i - matchWindow);
            const end = Math.min(i + matchWindow + 1, l2);

            for (let j = start; j < end; j++) {
                if (s2Matches[j]) continue;  // 이미 매칭된 문자는 스킵
                if (s1[i] === s2[j]) {
                    s1Matches[i] = true;
                    s2Matches[j] = true;
                    matches++;
                    break;  // 이 문자에 대한 매칭 완료
                }
            }
        }

        // 일치하는 문자가 하나도 없으면 유사도 0
        if (matches === 0) return 0;

        // 【2단계: Transposition(순서 차이) 계산】
        // 일치한 문자들의 순서가 다른 경우를 계산
        let t = 0;  // transposition 카운트
        let k = 0;  // s2에서의 현재 위치
        for (let i = 0; i < l1; i++) {
            if (!s1Matches[i]) continue;  // 일치하지 않은 문자는 스킵
            while (!s2Matches[k]) k++;     // s2에서 다음 일치 문자 찾기
            if (s1[i] !== s2[k]) t++;       // 순서가 다르면 transposition
            k++;
        }
        t /= 2;  // transposition은 쌍으로 계산되므로 2로 나눔

        // 【3단계: Jaro 유사도 계산】
        // dj = (일치율_s1 + 일치율_s2 + 순서일치율) / 3
        const dj = (matches / l1 + matches / l2 + (matches - t) / matches) / 3;

        // 【4단계: Winkler 보정 - 공통 접두사 가중치】
        // 앞부분이 같으면 추가 점수 (최대 4자까지만 고려)
        let prefix = 0;
        for (let i = 0; i < Math.min(l1, l2, 4); i++) {
            if (s1[i] === s2[i]) prefix++;
            else break;  // 첫 불일치에서 중단
        }

        // 최종 Jaro-Winkler 점수 반환
        // 접두사가 같을수록 점수가 높아짐 (최대 0.1 * 4 = 0.4 보너스)
        return dj + prefix * 0.1 * (1 - dj);
    }

    /**
     * 아티스트 문자열을 비교 가능한 단위로 분리합니다.
     * 예: "Artist A, Artist B & Artist C" -> ["Artist A", "Artist B", "Artist C"]
     *
     * @param {string} artistText - 원본 아티스트 문자열
     * @returns {string[]} 정리된 아티스트 배열
     */
    function splitArtists(artistText) {
        if (!artistText || typeof artistText !== 'string') return [];
        return artistText
            .split(/[&,]/g)
            .map(part => part.trim())
            .filter(Boolean);
    }

    /**
     * 제목 문자열 사이의 비교 점수를 계산합니다.
     * 완전 일치나 포함 관계가 있으면 높은 점수를 주고,
     * 그 외에는 Jaro-Winkler 점수를 사용합니다.
     *
     * @param {string} expectedTitle - 현재 트랙 제목
     * @param {string} candidateTitle - LRCLIB 후보 제목
     * @returns {number} 제목 유사도 점수
     */
    function getTitleScore(expectedTitle, candidateTitle) {
        const normalizedExpected = normalize(expectedTitle);
        const normalizedCandidate = normalize(candidateTitle);

        if (!normalizedExpected || !normalizedCandidate) return 0;
        if (normalizedExpected === normalizedCandidate) return 1;
        if (normalizedCandidate.includes(normalizedExpected) || normalizedExpected.includes(normalizedCandidate)) return 0.99;

        return jaroWinkler(normalizedExpected, normalizedCandidate);
    }

    /**
     * 자유검색에서 제목 기반으로 후보를 허용할 수 있을 만큼
     * 재생 시간이 충분히 정확하게 일치하는지 확인합니다.
     * LRCLIB와 Spotify의 길이 표기가 초 단위인 경우가 많아 반올림 후 비교합니다.
     *
     * @param {number} expectedDurationSec - 현재 트랙 길이(초)
     * @param {number} candidateDurationSec - LRCLIB 후보 길이(초)
     * @returns {boolean} 초 단위 반올림 기준 정확히 일치하면 true
     */
    function hasExactDurationMatch(expectedDurationSec, candidateDurationSec) {
        if (!Number.isFinite(expectedDurationSec) || !Number.isFinite(candidateDurationSec)) return false;
        return Math.round(expectedDurationSec) === Math.round(candidateDurationSec);
    }

    /**
     * 기대 아티스트 목록과 후보 아티스트 목록 사이의 최고 Jaro-Winkler 점수를 계산합니다.
     *
     * @param {string[]} expectedArtists - 현재 트랙의 아티스트 목록
     * @param {string[]} candidateArtists - LRCLIB 후보의 아티스트 목록
     * @returns {number} 최고 유사도 점수
     */
    function getBestArtistScore(expectedArtists, candidateArtists) {
        if (!Array.isArray(expectedArtists) || !Array.isArray(candidateArtists)) return 0;
        if (expectedArtists.length === 0 || candidateArtists.length === 0) return 0;

        let bestScore = 0;
        for (const expectedArtist of expectedArtists) {
            for (const candidateArtist of candidateArtists) {
                bestScore = Math.max(bestScore, jaroWinkler(expectedArtist, candidateArtist));
            }
        }
        return bestScore;
    }

    /**
     * ────────────────────────────────────────────────────────────────────────────
     * 타임아웃 및 재시도 지원 Fetch 함수
     * ────────────────────────────────────────────────────────────────────────────
     * 
     * 【목적】
     * 네트워크 요청에 타임아웃을 적용하고, 실패 시 자동으로 1회 재시도합니다.
     * LRCLIB 서버의 간헐적 장애나 네트워크 불안정에 대응합니다.
     * 
     * 【동작 방식】
     * 1. AbortController를 사용하여 타임아웃 구현
     * 2. 첫 번째 시도 실패 시 500ms 대기 후 재시도
     * 3. 재시도도 실패하면 null 반환 (에러 throw 대신)
     * 
     * 【설계 결정】
     * - null 반환: UI에 에러 메시지를 노출하지 않기 위함
     * - 500ms 대기: 서버 부하 완화 및 네트워크 복구 시간 확보
     * - 35초 타임아웃: LRCLIB 서버 응답 시간을 고려한 값
     * 
     * @param {string} url - 요청할 URL
     * @param {Object} options - fetch 옵션 (headers 등)
     * @param {number} timeoutMs - 타임아웃 시간 (기본 35초)
     * @returns {Promise<Response|null>} Response 객체 또는 실패 시 null
     */
    async function fetchWithTimeout(url, options = {}, timeoutMs = 35000) {
        // 최대 2회 시도 (첫 시도 + 1회 재시도)
        for (let attempt = 0; attempt < 2; attempt++) {
            // AbortController: fetch 요청을 강제 중단할 수 있게 해주는 Web API
            const controller = new AbortController();

            // 타임아웃 설정: timeoutMs 후 요청 강제 중단
            const id = setTimeout(() => controller.abort(), timeoutMs);

            try {
                // fetch 요청 실행 (signal 연결로 abort 가능하게 함)
                const response = await fetch(url, { ...options, signal: controller.signal });
                clearTimeout(id);  // 성공 시 타임아웃 타이머 정리
                return response;   // 응답 반환 (성공)
            } catch (error) {
                clearTimeout(id);  // 실패 시에도 타이머 정리

                if (attempt === 0) {
                    // 첫 번째 시도 실패: 500ms 대기 후 재시도
                    await new Promise(r => setTimeout(r, 500));
                    window.__ivLyricsDebugLog?.(`[LR-DEBUG] 네트워크 오류, 재시도 중...`);
                }
                // attempt === 1이면 재시도도 실패 → 루프 종료
            }
        }

        // 모든 재시도 실패 → null 반환 (에러 메시지 노출 방지)
        window.__ivLyricsDebugLog?.(`[LR-DEBUG] 네트워크 재시도 실패, 스킵`);
        return null;
    }

    let lrclibMetadataLookupQueue = Promise.resolve();

    async function withLrclibMetadataLookupLock(task) {
        const previous = lrclibMetadataLookupQueue.catch(() => {});
        let release;
        lrclibMetadataLookupQueue = new Promise(resolve => {
            release = resolve;
        });

        await previous;

        try {
            return await task();
        } finally {
            release();
        }
    }

    async function getTrackMetadataForAcceptLanguage(uri, acceptLanguage) {
        return withLrclibMetadataLookupLock(async () => {
            const lookupEntity = Spicetify.GraphQL?.Definitions?.lookupEntity;
            const graphQLRequest = Spicetify.GraphQL?.Request;
            const originalFetch = window.fetch;

            if (!uri || !lookupEntity || typeof graphQLRequest !== 'function' || typeof originalFetch !== 'function') {
                return null;
            }

            window.fetch = async (input, init = {}) => {
                const url = typeof input === 'string' ? input : input?.url || '';
                const body = typeof init?.body === 'string' ? init.body : '';
                const isLookupEntityRequest = /graphql|pathfinder/i.test(url) && /lookupEntity/.test(body);

                if (!isLookupEntityRequest) {
                    return originalFetch(input, init);
                }

                const headers = new Headers(init?.headers || {});
                headers.set('accept-language', acceptLanguage);

                return originalFetch(input, {
                    ...init,
                    headers
                });
            };

            try {
                const response = await graphQLRequest(lookupEntity, { uri });
                const track = response?.data?.lookup?.[0]?.data;

                if (track?.__typename !== 'Track') {
                    return null;
                }

                return {
                    title: track?.name?.trim?.() || '',
                    artist: track?.artists?.items?.map(item => item?.profile?.name).filter(Boolean).join(', ') || ''
                };
            } catch (error) {
                window.__ivLyricsDebugLog?.(`[LR-DEBUG] 영어 메타데이터 조회 실패: ${error?.message || error}`);
                return null;
            } finally {
                window.fetch = originalFetch;
            }
        });
    }

    function parsePlainLyrics(plainLyrics) {
        if (!plainLyrics || typeof plainLyrics !== 'string') return null;

        const lines = plainLyrics
            .split('\n')
            .map(line => ({ text: line.trim() }))
            .filter(line => line.text);

        return lines.length > 0 ? lines : null;
    }

    /**
     * Lyricsfile은 YAML 기반이지만 ivLyrics 애드온은 별도 번들/의존성 없이 로드됩니다.
     * 아래 파서는 Lyricsfile 1.0이 허용하는 안전한 YAML 하위 집합만 읽습니다.
     * 커스텀 태그, anchor/alias, 중복 키, 다중 문서 및 과도한 크기/깊이는 거부합니다.
     */
    function parseLyricsfileDoubleQuotedScalar(value) {
        if (value.length < 2 || value.at(-1) !== '"') {
            throw new Error('Unterminated double-quoted YAML scalar');
        }

        let output = '';
        for (let index = 1; index < value.length - 1; index += 1) {
            const character = value[index];
            if (character !== '\\') {
                output += character;
                continue;
            }

            index += 1;
            if (index >= value.length - 1) {
                throw new Error('Invalid YAML escape sequence');
            }

            const escaped = value[index];
            const simpleEscapes = {
                '0': '\0',
                a: '\x07',
                b: '\b',
                t: '\t',
                n: '\n',
                v: '\v',
                f: '\f',
                r: '\r',
                e: '\x1b',
                ' ': ' ',
                '"': '"',
                '/': '/',
                '\\': '\\',
                N: '\u0085',
                _: '\u00a0',
                L: '\u2028',
                P: '\u2029'
            };
            if (Object.prototype.hasOwnProperty.call(simpleEscapes, escaped)) {
                output += simpleEscapes[escaped];
                continue;
            }

            const hexLength = escaped === 'x' ? 2 : (escaped === 'u' ? 4 : (escaped === 'U' ? 8 : 0));
            if (!hexLength) {
                throw new Error(`Unsupported YAML escape: \\${escaped}`);
            }

            const hex = value.slice(index + 1, index + 1 + hexLength);
            if (hex.length !== hexLength || !/^[0-9a-f]+$/i.test(hex)) {
                throw new Error('Invalid YAML Unicode escape');
            }

            const codePoint = Number.parseInt(hex, 16);
            if (codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
                throw new Error('Invalid YAML Unicode code point');
            }
            output += String.fromCodePoint(codePoint);
            index += hexLength;
        }

        return output;
    }

    function stripLyricsfilePlainScalarComment(value) {
        for (let index = 0; index < value.length; index += 1) {
            if (value[index] === '#' && (index === 0 || /\s/.test(value[index - 1]))) {
                return value.slice(0, index).trimEnd();
            }
        }
        return value.trimEnd();
    }

    function parseLyricsfileYamlScalar(rawValue) {
        const value = String(rawValue || '').trim();
        if (!value) return null;

        if (value.startsWith("'")) {
            if (value.length < 2 || value.at(-1) !== "'") {
                throw new Error('Unterminated single-quoted YAML scalar');
            }
            return value.slice(1, -1).replace(/''/g, "'");
        }

        if (value.startsWith('"')) {
            return parseLyricsfileDoubleQuotedScalar(value);
        }

        const plain = stripLyricsfilePlainScalarComment(value);
        if (!plain || plain === '~' || /^(?:null|Null|NULL)$/.test(plain)) return null;
        if (/^(?:true|True|TRUE)$/.test(plain)) return true;
        if (/^(?:false|False|FALSE)$/.test(plain)) return false;
        if (plain === '[]') return [];
        if (plain === '{}') return {};
        if (/^[-+]?(?:0|[1-9]\d*)$/.test(plain)) {
            const number = Number(plain);
            if (!Number.isSafeInteger(number)) {
                throw new Error('YAML integer exceeds the safe range');
            }
            return number;
        }
        if (/^[&*!]/.test(plain)) {
            throw new Error('YAML anchors, aliases, and tags are not supported');
        }

        return plain;
    }

    function getLyricsfileYamlIndent(line) {
        let indent = 0;
        while (line[indent] === ' ') indent += 1;
        if (line[indent] === '\t') {
            throw new Error('Tabs are not allowed for YAML indentation');
        }
        return indent;
    }

    function parseLyricsfileYaml(lyricsfile) {
        if (typeof lyricsfile !== 'string' || !lyricsfile.trim()) return null;
        if (lyricsfile.length > LRCLIB_LYRICSFILE_MAX_LENGTH) {
            throw new Error('Lyricsfile exceeds the size limit');
        }
        if (lyricsfile.includes('\0')) {
            throw new Error('Lyricsfile contains a null byte');
        }

        const lines = lyricsfile.replace(/\r\n?/g, '\n').split('\n');
        let nodeCount = 0;

        const isIgnorableLine = (line) => {
            const trimmed = line.trim();
            return !trimmed || trimmed.startsWith('#');
        };

        const skipIgnorableLines = (startIndex) => {
            let index = startIndex;
            while (index < lines.length && isIgnorableLine(lines[index])) index += 1;
            return index;
        };

        const parseMappingEntry = (content) => {
            const match = content.match(/^([A-Za-z_][A-Za-z0-9_-]*):(?:[ \t]*(.*))?$/);
            if (!match) {
                throw new Error(`Unsupported YAML mapping entry: ${content}`);
            }
            return {
                key: match[1],
                rawValue: match[2] ?? ''
            };
        };

        const parseBlockScalar = (startIndex, parentIndent, header) => {
            const headerMatch = header.match(/^([|>])([+-]?)([1-9]?)(?:\s+#.*)?$/);
            if (!headerMatch) {
                throw new Error(`Unsupported YAML block scalar header: ${header}`);
            }

            const style = headerMatch[1];
            const chomping = headerMatch[2] || '';
            const explicitIndent = headerMatch[3] ? Number(headerMatch[3]) : null;
            let contentIndent = explicitIndent === null ? null : parentIndent + explicitIndent;
            let index = startIndex;

            if (contentIndent === null) {
                let probe = startIndex;
                while (probe < lines.length && !lines[probe].trim()) probe += 1;
                if (probe < lines.length) {
                    const probeIndent = getLyricsfileYamlIndent(lines[probe]);
                    if (probeIndent > parentIndent) contentIndent = probeIndent;
                }
            }

            if (contentIndent === null) {
                return ['', startIndex];
            }

            const contentLines = [];
            while (index < lines.length) {
                const rawLine = lines[index];
                if (!rawLine.trim()) {
                    contentLines.push('');
                    index += 1;
                    continue;
                }

                const indent = getLyricsfileYamlIndent(rawLine);
                if (indent <= parentIndent) break;
                if (indent < contentIndent) {
                    throw new Error('Invalid YAML block scalar indentation');
                }

                contentLines.push(rawLine.slice(contentIndent));
                index += 1;
            }

            let value;
            if (style === '|') {
                value = contentLines.join('\n');
            } else {
                value = '';
                contentLines.forEach((line, lineIndex) => {
                    if (lineIndex === 0) {
                        value = line;
                        return;
                    }
                    const previous = contentLines[lineIndex - 1];
                    value += line && previous ? ` ${line}` : `\n${line}`;
                });
            }

            if (chomping === '-') {
                value = value.replace(/\n+$/g, '');
            } else if (chomping === '+') {
                value += '\n';
            } else {
                value = `${value.replace(/\n+$/g, '')}\n`;
            }

            return [value, index];
        };

        const assertDepthAndCount = (depth) => {
            if (depth > LRCLIB_LYRICSFILE_MAX_DEPTH) {
                throw new Error('Lyricsfile nesting is too deep');
            }
            nodeCount += 1;
            if (nodeCount > LRCLIB_LYRICSFILE_MAX_NODES) {
                throw new Error('Lyricsfile contains too many nodes');
            }
        };

        const parseNode = (startIndex, indent, depth) => {
            assertDepthAndCount(depth);
            const index = skipIgnorableLines(startIndex);
            if (index >= lines.length) return [null, index];

            const actualIndent = getLyricsfileYamlIndent(lines[index]);
            if (actualIndent !== indent) {
                throw new Error('Unexpected YAML indentation');
            }

            const content = lines[index].slice(indent);
            return content === '-' || content.startsWith('- ')
                ? parseSequence(index, indent, depth)
                : parseMapping(index, indent, depth);
        };

        const parseMappingValue = (rawValue, currentIndex, indent, depth) => {
            if (rawValue) {
                if (/^[|>]/.test(rawValue)) {
                    return parseBlockScalar(currentIndex + 1, indent, rawValue);
                }
                return [parseLyricsfileYamlScalar(rawValue), currentIndex + 1];
            }

            const nextIndex = skipIgnorableLines(currentIndex + 1);
            if (nextIndex >= lines.length) return [null, currentIndex + 1];

            const nextIndent = getLyricsfileYamlIndent(lines[nextIndex]);
            const nextContent = lines[nextIndex].slice(nextIndent);
            const isIndentlessSequence = nextIndent === indent
                && (nextContent === '-' || nextContent.startsWith('- '));
            if (nextIndent > indent || isIndentlessSequence) {
                return parseNode(nextIndex, nextIndent, depth + 1);
            }

            return [null, currentIndex + 1];
        };

        const parseMapping = (startIndex, indent, depth) => {
            const output = {};
            let index = startIndex;

            while (index < lines.length) {
                index = skipIgnorableLines(index);
                if (index >= lines.length) break;

                const actualIndent = getLyricsfileYamlIndent(lines[index]);
                if (actualIndent < indent) break;
                if (actualIndent > indent) {
                    throw new Error('Unexpected YAML mapping indentation');
                }

                const content = lines[index].slice(indent);
                if (content === '-' || content.startsWith('- ')) break;
                if (content === '---' || content === '...') break;

                const { key, rawValue } = parseMappingEntry(content);
                if (Object.prototype.hasOwnProperty.call(output, key)) {
                    throw new Error(`Duplicate YAML key: ${key}`);
                }

                const [value, nextIndex] = parseMappingValue(rawValue, index, indent, depth);
                output[key] = value;
                index = nextIndex;
            }

            return [output, index];
        };

        const parseSequence = (startIndex, indent, depth) => {
            const output = [];
            let index = startIndex;

            while (index < lines.length) {
                index = skipIgnorableLines(index);
                if (index >= lines.length) break;

                const actualIndent = getLyricsfileYamlIndent(lines[index]);
                if (actualIndent !== indent) break;

                const content = lines[index].slice(indent);
                if (content !== '-' && !content.startsWith('- ')) break;

                const itemContent = content.slice(1).trimStart();
                if (!itemContent) {
                    const nextIndex = skipIgnorableLines(index + 1);
                    if (nextIndex >= lines.length) {
                        output.push(null);
                        index += 1;
                        continue;
                    }
                    const nextIndent = getLyricsfileYamlIndent(lines[nextIndex]);
                    if (nextIndent <= indent) {
                        output.push(null);
                        index += 1;
                        continue;
                    }
                    const [value, afterItem] = parseNode(nextIndex, nextIndent, depth + 1);
                    output.push(value);
                    index = afterItem;
                    continue;
                }

                if (/^[A-Za-z_][A-Za-z0-9_-]*:/.test(itemContent)) {
                    const itemIndex = index;
                    const originalLine = lines[index];
                    const mappingIndent = indent + 2;
                    lines[index] = `${' '.repeat(mappingIndent)}${itemContent}`;
                    try {
                        const [value, afterItem] = parseMapping(index, mappingIndent, depth + 1);
                        output.push(value);
                        index = afterItem;
                    } finally {
                        lines[itemIndex] = originalLine;
                    }
                    continue;
                }

                output.push(parseLyricsfileYamlScalar(itemContent));
                index += 1;
            }

            return [output, index];
        };

        let startIndex = skipIgnorableLines(0);
        if (lines[startIndex]?.trim() === '---') {
            startIndex = skipIgnorableLines(startIndex + 1);
        }
        if (startIndex >= lines.length) return null;

        const rootIndent = getLyricsfileYamlIndent(lines[startIndex]);
        const [document, endIndex] = parseNode(startIndex, rootIndent, 0);
        let trailingIndex = skipIgnorableLines(endIndex);
        if (lines[trailingIndex]?.trim() === '...') {
            trailingIndex = skipIgnorableLines(trailingIndex + 1);
        }
        if (trailingIndex < lines.length) {
            throw new Error('Lyricsfile must contain exactly one YAML document');
        }

        return document;
    }

    function isLyricsfileObject(value) {
        return !!value && typeof value === 'object' && !Array.isArray(value);
    }

    function isLyricsfileTimestamp(value) {
        return Number.isSafeInteger(value) && value >= 0;
    }

    function parseLyricsfileKaraoke(lyricsfile, fallbackDurationMs = 0) {
        let document;
        try {
            document = parseLyricsfileYaml(lyricsfile);
        } catch (error) {
            window.__ivLyricsDebugLog?.(`[LR-DEBUG] Ignoring invalid Lyricsfile: ${error?.message || error}`);
            return null;
        }

        if (!isLyricsfileObject(document)
            || document.version !== LRCLIB_LYRICSFILE_VERSION
            || !isLyricsfileObject(document.metadata)
            || !Array.isArray(document.lines)
            || document.lines.length === 0) {
            return null;
        }

        const durationMs = isLyricsfileTimestamp(document.metadata.duration_ms)
            ? document.metadata.duration_ms
            : (isLyricsfileTimestamp(fallbackDurationMs) ? fallbackDurationMs : 0);
        const parsedLines = [];
        let hasWordSync = false;

        document.lines.forEach((line, sourceIndex) => {
            if (!isLyricsfileObject(line)
                || typeof line.text !== 'string'
                || !isLyricsfileTimestamp(line.start_ms)
                || (line.end_ms !== null
                    && line.end_ms !== undefined
                    && (!isLyricsfileTimestamp(line.end_ms) || line.end_ms < line.start_ms))) {
                return;
            }

            const words = [];
            let wordsAreValid = Array.isArray(line.words) && line.words.length > 0;
            if (wordsAreValid) {
                line.words.forEach((word, wordIndex) => {
                    if (!isLyricsfileObject(word)
                        || typeof word.text !== 'string'
                        || !isLyricsfileTimestamp(word.start_ms)
                        || (word.end_ms !== null
                            && word.end_ms !== undefined
                            && (!isLyricsfileTimestamp(word.end_ms) || word.end_ms < word.start_ms))) {
                        wordsAreValid = false;
                        return;
                    }
                    words.push({
                        text: word.text,
                        startTime: word.start_ms,
                        explicitEndTime: word.end_ms,
                        sourceIndex: wordIndex
                    });
                });
            }

            if (!wordsAreValid) words.length = 0;
            if (words.length > 0) hasWordSync = true;
            parsedLines.push({
                text: line.text,
                startTime: line.start_ms,
                explicitEndTime: line.end_ms,
                words,
                sourceIndex
            });
        });

        if (!hasWordSync || parsedLines.length === 0) return null;

        parsedLines.sort((left, right) => (
            left.startTime - right.startTime || left.sourceIndex - right.sourceIndex
        ));

        return parsedLines
            .filter(line => line.text.length > 0 || line.words.length > 0)
            .map((line, lineIndex) => {
                const sortedWords = [...line.words].sort((left, right) => (
                    left.startTime - right.startTime || left.sourceIndex - right.sourceIndex
                ));
                const latestExplicitWordEnd = sortedWords.reduce((latest, word) => (
                    isLyricsfileTimestamp(word.explicitEndTime)
                        ? Math.max(latest, word.explicitEndTime)
                        : latest
                ), 0);
                const nextLineStart = parsedLines[lineIndex + 1]?.startTime;
                const inferredLineEnd = isLyricsfileTimestamp(line.explicitEndTime)
                    ? line.explicitEndTime
                    : (latestExplicitWordEnd > line.startTime
                        ? latestExplicitWordEnd
                        : (nextLineStart > line.startTime
                            ? nextLineStart
                            : (durationMs > line.startTime
                                ? durationMs
                                : line.startTime + LRCLIB_LYRICSFILE_DEFAULT_LINE_DURATION_MS)));
                const lineEndTime = Math.max(line.startTime + 1, inferredLineEnd);

                const syllables = sortedWords.length > 0
                    ? sortedWords.map((word, wordIndex) => {
                        const nextWordStart = sortedWords[wordIndex + 1]?.startTime;
                        const inferredWordEnd = isLyricsfileTimestamp(word.explicitEndTime)
                            ? word.explicitEndTime
                            : (nextWordStart >= word.startTime ? nextWordStart : lineEndTime);
                        return {
                            text: word.text,
                            startTime: word.startTime,
                            endTime: Math.max(word.startTime + 1, inferredWordEnd)
                        };
                    })
                    : [{
                        text: line.text,
                        startTime: line.startTime,
                        endTime: lineEndTime
                    }];

                return {
                    text: line.text,
                    startTime: line.startTime,
                    endTime: Math.max(lineEndTime, ...syllables.map(syllable => syllable.endTime)),
                    syllables
                };
            });
    }

    function applyLyricsfileKaraokeToResult(result, candidate) {
        if (!result || !candidate?.lyricsfile) return false;

        const fallbackDurationMs = Number.isFinite(Number(candidate.duration))
            ? Math.max(0, Math.round(Number(candidate.duration) * 1000))
            : 0;
        const karaoke = parseLyricsfileKaraoke(candidate.lyricsfile, fallbackDurationMs);
        if (!Array.isArray(karaoke) || karaoke.length === 0) return false;

        // Lyricsfile은 karaoke 표현만 보강합니다. 기존 sync-data의 줄 매칭 기준인
        // syncedLyrics/plainLyrics 결과를 이 데이터로 교체하면 안 됩니다.
        result.karaoke = karaoke;
        result.karaokeSource = 'lrclib-lyricsfile';
        result.karaokeGranularity = 'word';
        return true;
    }

    function stripLrcTimestamps(text) {
        if (!text || typeof text !== 'string') return '';
        return text.replace(/^\[\d+:\d+(?:[.,]\d+)?\]\s*/gm, '').trim();
    }

    function stripLeadingLrcTimestamp(text) {
        if (!text || typeof text !== 'string') return '';
        return text.replace(/^\[\d+:\d+(?:[.,]\d+)?\]\s*/, '').trim();
    }

    function hasOriginalLyricsScript(text) {
        if (!text || typeof text !== 'string') return false;

        return LRCLIB_ORIGINAL_SCRIPT_REGEX.test(text);
    }

    function hasMeaningfulLyricsText(text) {
        if (!text || typeof text !== 'string') return false;
        return LRCLIB_MEANINGFUL_TEXT_REGEX.test(text);
    }

    function getMeaningfulLyricsLines(text) {
        if (!text || typeof text !== 'string') return [];

        return text
            .split('\n')
            .map(line => stripLeadingLrcTimestamp(line))
            .filter(line => hasMeaningfulLyricsText(line));
    }

    function analyzeLyricsLanguageMix(text) {
        const lines = getMeaningfulLyricsLines(text);
        if (lines.length === 0) {
            return {
                meaningfulLineCount: 0,
                originalScriptLineCount: 0,
                nonOriginalLineCount: 0,
                alternatingScriptPairs: 0,
                comparablePairs: 0,
                hasInterleavedTranslations: false
            };
        }

        let originalScriptLineCount = 0;
        let nonOriginalLineCount = 0;
        let alternatingScriptPairs = 0;
        let comparablePairs = 0;

        const lineKinds = lines.map(line => {
            if (hasOriginalLyricsScript(line)) {
                originalScriptLineCount += 1;
                return 'original';
            }

            nonOriginalLineCount += 1;
            return 'other';
        });

        for (let index = 1; index < lineKinds.length; index += 1) {
            comparablePairs += 1;
            if (lineKinds[index] !== lineKinds[index - 1]) {
                alternatingScriptPairs += 1;
            }
        }

        const hasInterleavedTranslations = lines.length >= 6
            && originalScriptLineCount >= 2
            && nonOriginalLineCount >= 2
            && (originalScriptLineCount / lines.length) >= 0.25
            && (nonOriginalLineCount / lines.length) >= 0.25
            && comparablePairs > 0
            && (alternatingScriptPairs / comparablePairs) >= 0.6;

        return {
            meaningfulLineCount: lines.length,
            originalScriptLineCount,
            nonOriginalLineCount,
            alternatingScriptPairs,
            comparablePairs,
            hasInterleavedTranslations
        };
    }

    function getCandidateLyricsText(candidate, preferredSource = null) {
        if (preferredSource === 'synced' && candidate?.syncedLyrics) {
            return stripLrcTimestamps(candidate.syncedLyrics);
        }
        if (preferredSource === 'plain' && candidate?.plainLyrics) {
            return candidate.plainLyrics;
        }
        if (candidate?.plainLyrics) return candidate.plainLyrics;
        if (candidate?.syncedLyrics) return stripLrcTimestamps(candidate.syncedLyrics);
        return '';
    }

    function getComparableLyricsLines(text, { stripTimestamps = false } = {}) {
        if (!text || typeof text !== 'string') return [];

        return text
            .split('\n')
            .map(line => stripTimestamps ? stripLeadingLrcTimestamp(line) : line.trim())
            .filter(line => !LRCLIB_METADATA_LINE_REGEX.test(line))
            .filter(line => line.length > 0)
            .map(line => line.normalize('NFC'));
    }

    function getLineCharCounts(lines) {
        return lines.map(line => {
            if (typeof line !== 'string') {
                return Array.from(line).length;
            }

            let count = line.length;
            for (let index = 1; index < line.length; index += 1) {
                const codeUnit = line.charCodeAt(index);
                if (codeUnit < 0xDC00 || codeUnit > 0xDFFF) continue;

                const previousCodeUnit = line.charCodeAt(index - 1);
                if (previousCodeUnit >= 0xD800 && previousCodeUnit <= 0xDBFF) {
                    count -= 1;
                }
            }
            return count;
        });
    }

    function getSyncDataLineCharCounts(syncData) {
        if (!Array.isArray(syncData?.syncData?.lines) || syncData.syncData.lines.length === 0) {
            return null;
        }

        return syncData.syncData.lines.map(line => Array.isArray(line?.chars) ? line.chars.length : -1);
    }

    function hasExactLineCharCountMatch(expectedCounts, actualCounts) {
        if (!Array.isArray(expectedCounts) || !Array.isArray(actualCounts)) return false;
        if (expectedCounts.length === 0 || expectedCounts.length !== actualCounts.length) return false;
        return expectedCounts.every((count, index) => count === actualCounts[index]);
    }

    function getCandidateSyncLineMatch(candidate, expectedCounts) {
        if (!Array.isArray(expectedCounts) || expectedCounts.length === 0) {
            return {
                syncLineExactMatch: false,
                exactSyncedLineMatch: false,
                exactPlainLineMatch: false,
                preferredLyricsSource: null
            };
        }

        const syncedLineCounts = candidate?.syncedLyrics
            ? getLineCharCounts(getComparableLyricsLines(candidate.syncedLyrics, { stripTimestamps: true }))
            : null;
        const plainLineCounts = candidate?.plainLyrics
            ? getLineCharCounts(getComparableLyricsLines(candidate.plainLyrics))
            : null;
        const exactSyncedLineMatch = hasExactLineCharCountMatch(expectedCounts, syncedLineCounts);
        const exactPlainLineMatch = hasExactLineCharCountMatch(expectedCounts, plainLineCounts);
        const preferredLyricsSource = exactSyncedLineMatch
            ? 'synced'
            : (exactPlainLineMatch
                ? 'plain'
                : null);

        return {
            syncLineExactMatch: exactSyncedLineMatch || exactPlainLineMatch,
            exactSyncedLineMatch,
            exactPlainLineMatch,
            preferredLyricsSource
        };
    }

    function buildLrclibCandidateSignature(candidate) {
        const text = getComparableCandidateText(candidate, candidate?.preferredLyricsSource);
        return [
            candidate?.id ?? '',
            normalize(candidate?.trackName || candidate?.name || ''),
            normalize(candidate?.artistName || ''),
            Number(candidate?.duration || 0).toFixed(3),
            getLyricsTextFingerprint(text)
        ].join('|');
    }

    function buildLrclibCandidateKey(candidate, sourceLabel, index) {
        return `${sourceLabel}:${index}:${buildLrclibCandidateSignature(candidate)}`;
    }

    function getLyricsTextFingerprint(text) {
        const value = String(text || '').normalize('NFC');
        let hash = 2166136261;
        let codePointLength = 0;
        for (const char of value) {
            hash ^= char.codePointAt(0) || 0;
            hash = Math.imul(hash, 16777619);
            codePointLength += 1;
        }
        return `lrclib-${(hash >>> 0).toString(36)}-${codePointLength.toString(36)}`;
    }

    function buildLrclibSyncSource(candidate) {
        if (!candidate) return null;

        const lrclibId = candidate.id === undefined || candidate.id === null
            ? ''
            : String(candidate.id).trim();
        if (!/^[1-9]\d*$/.test(lrclibId)) return null;

        const preferredLyricsSource = candidate.preferredLyricsSource
            || (candidate.syncedLyrics ? 'synced' : (candidate.plainLyrics ? 'plain' : 'unknown'));
        const comparableLines = getComparableLyricsLines(
            getCandidateLyricsText(candidate, preferredLyricsSource)
        );
        if (comparableLines.length === 0) return null;

        const comparableText = comparableLines.join('\n');
        const lineCharCounts = getLineCharCounts(comparableLines);

        return {
            provider: ADDON_INFO.id,
            lrclibId,
            searchSource: candidate.searchSource || '',
            preferredLyricsSource,
            trackName: candidate.trackName || candidate.name || '',
            artistName: candidate.artistName || '',
            albumName: candidate.albumName || '',
            duration: Number(candidate.duration || 0) || 0,
            lyricsFingerprint: getLyricsTextFingerprint(comparableText),
            lineCharCounts,
            lineCount: lineCharCounts.length,
            textCharCount: lineCharCounts.reduce((sum, count) => sum + count, 0)
        };
    }

    function getSyncDataLrclibSource(syncData) {
        const body = syncData?.syncData || syncData;
        const source = body?.source || body?.lyricsSource || null;
        if (!source || source.provider !== ADDON_INFO.id) return null;
        return source;
    }

    function getComparableCandidateText(candidate, preferredSource) {
        return getComparableLyricsLines(getCandidateLyricsText(candidate, preferredSource)).join('\n');
    }

    function getCandidateSourceMatch(candidate, source) {
        if (!source) {
            return {
                syncSourceMatchScore: 0,
                syncSourceIdMatch: false,
                syncSourceTextMatch: false,
                syncSourceLineCountMatch: false
            };
        }

        const candidateId = candidate?.id === undefined || candidate?.id === null ? '' : String(candidate.id);
        const sourceId = source.lrclibId === undefined || source.lrclibId === null ? '' : String(source.lrclibId);
        const preferredSource = candidate?.preferredLyricsSource || source.preferredLyricsSource || null;
        const candidateText = getComparableCandidateText(candidate, preferredSource);
        const candidateFingerprint = getLyricsTextFingerprint(candidateText);
        const candidateLineCounts = getLineCharCounts(getComparableLyricsLines(candidateText));
        const sourceLineCounts = Array.isArray(source.lineCharCounts) ? source.lineCharCounts : null;
        const sourceIdMatch = !!sourceId && !!candidateId && sourceId === candidateId;
        const sourceTextMatch = !!source.lyricsFingerprint && source.lyricsFingerprint === candidateFingerprint;
        const sourceLineCountMatch = hasExactLineCharCountMatch(sourceLineCounts, candidateLineCounts);
        const score = sourceIdMatch
            ? 100
            : (sourceTextMatch
                ? 90
                : (sourceLineCountMatch ? 60 : 0));

        return {
            syncSourceMatchScore: score,
            syncSourceIdMatch: sourceIdMatch,
            syncSourceTextMatch: sourceTextMatch,
            syncSourceLineCountMatch: sourceLineCountMatch
        };
    }

    function getSyncDataLrclibId(source) {
        if (!source || source.provider !== ADDON_INFO.id) return '';
        const id = source.lrclibId ?? source.id;
        if (id === undefined || id === null) return '';
        return String(id).trim();
    }

    async function fetchLrclibCandidateById(source, headers) {
        const lrclibId = getSyncDataLrclibId(source);
        if (!lrclibId) return null;

        const response = await fetchWithTimeout(`${LRCLIB_API_BASE}/get/${encodeURIComponent(lrclibId)}`, { headers }, 35000);
        if (!response || !response.ok) {
            window.__ivLyricsDebugLog?.(`[LR-DEBUG] Direct LRCLIB get failed for id=${lrclibId}: ${response?.status || 'network'}`);
            return null;
        }

        const candidate = await response.json();
        if (!candidate || (!candidate.syncedLyrics && !candidate.plainLyrics && !candidate.instrumental)) {
            window.__ivLyricsDebugLog?.(`[LR-DEBUG] Direct LRCLIB get returned no lyrics for id=${lrclibId}`);
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

    function buildDirectPreviewCandidate(candidate) {
        if (!candidate) return null;
        const previewText = getCandidateLyricsText(candidate, candidate.preferredLyricsSource);
        const previewLines = getComparableLyricsLines(previewText);
        return {
            ...candidate,
            candidateKey: buildLrclibCandidateKey(candidate, 'source', 0),
            searchSource: 'source',
            previewText,
            previewLineCount: previewLines.length,
            hasSyncedLyrics: !!candidate?.syncedLyrics,
            hasPlainLyrics: !!candidate?.plainLyrics,
            isSelectedByDefault: true
        };
    }

    function applyCandidateLyricsToResult(result, candidate) {
        if (!result || !candidate) return false;

        if (candidate.id !== undefined && candidate.id !== null && String(candidate.id).trim()) {
            result.lrclibId = String(candidate.id).trim();
        }
        const syncSource = buildLrclibSyncSource(candidate);
        if (syncSource) {
            result.lrclibSource = syncSource;
        }

        if (candidate.instrumental) {
            result.synced = [{ startTime: 0, text: '♪ Instrumental ♪' }];
            result.unsynced = [{ text: '♪ Instrumental ♪' }];
            return true;
        }

        if (candidate.preferredLyricsSource === 'plain' && candidate.plainLyrics) {
            result.unsynced = parsePlainLyrics(candidate.plainLyrics);
        }
        else if (candidate.syncedLyrics) {
            const parsed = parseLRC(candidate.syncedLyrics);
            result.synced = parsed.synced;
            if (!result.unsynced) {
                result.unsynced = parsed.unsynced;
            }
        }
        else if (candidate.plainLyrics) {
            result.unsynced = parsePlainLyrics(candidate.plainLyrics);
        }

        if (!result.synced && candidate.plainLyrics && !result.unsynced) {
            result.unsynced = parsePlainLyrics(candidate.plainLyrics);
        }

        applyLyricsfileKaraokeToResult(result, candidate);

        return !!(result.karaoke || result.synced || result.unsynced);
    }

    function buildPreviewCandidateList(primarySearchFlow, englishSearchFlow, selectedCandidate) {
        const selectedSignature = selectedCandidate ? buildLrclibCandidateSignature(selectedCandidate) : null;
        const seen = new Set();
        const output = [];
        let selectedCandidateKey = null;

        const pushCandidates = (candidates, sourceLabel) => {
            if (!Array.isArray(candidates)) return;

            candidates.forEach((candidate, index) => {
                const signature = buildLrclibCandidateSignature(candidate);
                if (seen.has(signature)) return;
                seen.add(signature);

                const previewText = getCandidateLyricsText(candidate, candidate?.preferredLyricsSource);
                const previewLines = getComparableLyricsLines(previewText);
                const candidateKey = buildLrclibCandidateKey(candidate, sourceLabel, index);
                const previewCandidate = {
                    ...candidate,
                    candidateKey,
                    searchSource: sourceLabel,
                    previewText,
                    previewLineCount: previewLines.length,
                    hasSyncedLyrics: !!candidate?.syncedLyrics,
                    hasPlainLyrics: !!candidate?.plainLyrics,
                    isSelectedByDefault: selectedSignature !== null && signature === selectedSignature
                };

                if (previewCandidate.isSelectedByDefault && !selectedCandidateKey) {
                    selectedCandidateKey = candidateKey;
                }

                output.push(previewCandidate);
            });
        };

        if (selectedSignature) {
            const selectedFirst = (primarySearchFlow?.rankedCandidates || []).concat(englishSearchFlow?.rankedCandidates || []);
            const selectedMatch = selectedFirst.find(candidate => buildLrclibCandidateSignature(candidate) === selectedSignature);
            if (selectedMatch) {
                pushCandidates([selectedMatch], 'selected');
            }
        }

        pushCandidates(primarySearchFlow?.rankedCandidates || [], 'primary');
        pushCandidates(englishSearchFlow?.rankedCandidates || [], 'english');

        if (!selectedCandidateKey && output.length > 0) {
            output[0].isSelectedByDefault = true;
            selectedCandidateKey = output[0].candidateKey;
        }

        return {
            candidates: output,
            selectedCandidateKey
        };
    }

    /**
     * ────────────────────────────────────────────────────────────────────────────
     * LRC 형식 파싱 함수 (Ultra-Flexible)
     * ────────────────────────────────────────────────────────────────────────────
     * 
     * 【목적】
     * LRC(Lyrics) 형식의 문자열을 파싱하여 구조화된 가사 객체로 변환합니다.
     * 
     * 【LRC 형식 예시】
     * [00:12.34]첫 번째 가사
     * [00:15.67]두 번째 가사
     * [01:00,89]쉼표 구분자도 지원
     * 
     * 【지원하는 형식】
     * - [MM:SS.xx] 또는 [MM:SS,xx]: 밀리초 포함
     * - [MM:SS]: 밀리초 없는 형식
     * - 타임스탬프 없는 일반 텍스트도 unsynced에 포함
     * 
     * 【반환 객체 구조】
     * {
     *   synced: [{ startTime: 12340, text: "첫 번째 가사" }, ...] 또는 null,
     *   unsynced: [{ text: "첫 번째 가사" }, ...]
     * }
     * 
     * @param {string} lrc - LRC 형식의 가사 문자열
     * @returns {Object} { synced: Array|null, unsynced: Array }
     */
    function parseLRC(lrc) {
        // 입력 유효성 검사
        if (!lrc || typeof lrc !== 'string') return { synced: null, unsynced: [] };

        const lines = lrc.split('\n');  // 줄 단위로 분리
        const synced = [];    // 타임스탬프가 있는 가사
        const unsynced = [];  // 텍스트만 있는 가사

        for (const line of lines) {
            // LRC 타임스탬프 패턴 매칭
            // 그룹: [1]=분, [2]=초, [3]=밀리초(선택), [4]=가사 텍스트
            const match = line.match(/\[(\d+):(\d+)(?:[.,](\d+))?\](.*)/);

            if (match) {
                // 타임스탬프가 있는 경우
                const minutes = parseInt(match[1], 10);    // 분
                const seconds = parseInt(match[2], 10);    // 초
                const msPart = match[3] ? parseFloat('0.' + match[3]) : 0;  // 밀리초 부분

                // 시작 시간을 밀리초로 변환
                const startTime = Math.floor((minutes * 60 + seconds + msPart) * 1000);
                const text = match[4].trim();  // 가사 텍스트 (공백 제거)

                synced.push({ startTime, text });  // 싱크 가사에 추가
                unsynced.push({ text });           // 일반 가사에도 추가
            } else if (line.trim() && !line.startsWith('[')) {
                // 타임스탬프 없는 일반 텍스트 (메타데이터 태그 제외)
                unsynced.push({ text: line.trim() });
            }
        }

        // synced가 비어있으면 null로 반환
        return { synced: synced.length > 0 ? synced : null, unsynced };
    }

    // ============================================
    // Addon Implementation (애드온 구현부)
    // ============================================
    // LyricsAddonManager에 등록될 실제 애드온 객체입니다.
    // ADDON_INFO를 스프레드하여 메타데이터를 포함하고,
    // init(), getSettingsUI(), getLyrics() 메서드를 구현합니다.

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

        async searchCandidates(info) {
            try {
                const title = info?.title?.trim?.();
                const artist = info?.artist?.trim?.();
                const album = info?.album?.trim?.();
                const searchSettings = getSearchSettings();
                const trackDuration = Number(info?.duration || 0);
                const trackDurationSec = trackDuration > 0 ? trackDuration / 1000 : 0;
                const expectedArtists = splitArtists(artist);

                if (!title || !artist || !trackDurationSec) {
                    return {
                        success: false,
                        error: 'Missing track metadata',
                        candidates: [],
                        selectedCandidateKey: null
                    };
                }

                const headers = { 'x-user-agent': `spicetify v${Spicetify.Config?.version || 'unknown'}` };
                const trackId = window.LyricsService?.extractTrackId?.(info?.uri)
                    || window.ivLyricsTrackIdentity?.extractTrackId?.(info?.uri)
                    || '';
                const trackIsrc = await window.SyncDataService?.resolveTrackIsrc?.(trackId, info)
                    || window.SyncDataService?.getTrackIsrc?.(trackId, info)
                    || window.SyncDataService?.normalizeSyncDataIsrc?.(info?.isrc || info?.external_ids?.isrc || info?.externalIds?.isrc);
                let syncDataLineCharCounts = null;
                let syncDataSource = null;

                if (trackId && window.SyncDataService?.getSyncData) {
                    try {
                        const existingSyncData = await window.SyncDataService.getSyncData(trackId, ADDON_INFO.id, { ...info, isrc: trackIsrc });
                        syncDataLineCharCounts = getSyncDataLineCharCounts(existingSyncData);
                        syncDataSource = getSyncDataLrclibSource(existingSyncData);
                    } catch (e) {
                        window.__ivLyricsDebugLog?.('[LR-DEBUG] Failed to fetch sync-data for exact line matching:', e?.message || e);
                    }
                }

                let sourceDirectLookupAttempted = false;
                let cachedSourceDirectPreviewCandidate = null;
                const getSourceDirectPreviewCandidate = async () => {
                    if (sourceDirectLookupAttempted) return cachedSourceDirectPreviewCandidate;
                    sourceDirectLookupAttempted = true;

                    if (!getSyncDataLrclibId(syncDataSource)) return null;

                    try {
                        const directCandidate = decorateDirectCandidate(
                            await fetchLrclibCandidateById(syncDataSource, headers),
                            syncDataSource,
                            trackDurationSec
                        );
                        cachedSourceDirectPreviewCandidate = buildDirectPreviewCandidate(directCandidate);
                    } catch (e) {
                        window.__ivLyricsDebugLog?.('[LR-DEBUG] Failed to restore LRCLIB sync-data source:', e?.message || e);
                        cachedSourceDirectPreviewCandidate = null;
                    }
                    return cachedSourceDirectPreviewCandidate;
                };

                const buildSourceDirectSearchResult = (directPreviewCandidate) => ({
                    success: true,
                    error: null,
                    candidates: [directPreviewCandidate],
                    selectedCandidateKey: directPreviewCandidate.candidateKey,
                    selectedSource: 'source-direct',
                    searchMode: 'source-direct',
                    totalResults: 1,
                    usedFallbackQuery: false,
                    syncDataLineCount: syncDataLineCharCounts?.length || 0,
                    directLrclibId: getSyncDataLrclibId(syncDataSource),
                    englishTitle: null,
                    englishArtist: null
                });

                const sourceDirectPreviewCandidate = await getSourceDirectPreviewCandidate();
                if (sourceDirectPreviewCandidate) {
                    return buildSourceDirectSearchResult(sourceDirectPreviewCandidate);
                }
                const runSearch = async (params, label) => {
                    const query = new URLSearchParams();
                    if (params.track_name) query.set('track_name', params.track_name);
                    if (params.artist_name) query.set('artist_name', params.artist_name);
                    if (params.album_name && params.album_name !== 'undefined') query.set('album_name', params.album_name);
                    if (params.q) query.set('q', params.q);

                    const searchUrl = `${LRCLIB_API_BASE}/search?${query.toString()}`;
                    const response = await fetchWithTimeout(searchUrl, { headers }, 35000);

                    if (!response) {
                        return {
                            fatal: true,
                            error: 'Network request failed',
                            searchLabel: label,
                            totalResults: 0,
                            candidates: []
                        };
                    }

                    if (!response.ok) {
                        if (response.status === 429) {
                            return {
                                fatal: true,
                                error: 'Rate limit exceeded (429)',
                                searchLabel: label,
                                totalResults: 0,
                                candidates: []
                            };
                        }
                        if (response.status === 404) {
                            return {
                                fatal: false,
                                error: 'No lyrics found',
                                searchLabel: label,
                                totalResults: 0,
                                candidates: []
                            };
                        }
                        return {
                            fatal: true,
                            error: `API error: ${response.status}`,
                            searchLabel: label,
                            totalResults: 0,
                            candidates: []
                        };
                    }

                    const data = await response.json();
                    if (!Array.isArray(data)) {
                        return {
                            fatal: true,
                            error: 'Invalid LRCLIB response',
                            searchLabel: label,
                            totalResults: 0,
                            candidates: []
                        };
                    }

                    return {
                        fatal: false,
                        error: data.length === 0 ? 'No lyrics found' : null,
                        searchLabel: label,
                        totalResults: data.length,
                        candidates: data
                    };
                };

                const rankCandidates = (candidates, metadata, { allowTitleDrivenMatch = false } = {}) => {
                    const metadataTitle = metadata?.title || '';
                    const metadataArtists = metadata?.expectedArtists || [];

                    return candidates
                        .map(item => {
                            const candidateArtists = splitArtists(item?.artistName || '');
                            const candidateTitle = item?.trackName || item?.name || '';
                            const syncLineMatch = getCandidateSyncLineMatch(item, syncDataLineCharCounts);
                            const lyricsText = getCandidateLyricsText(item, syncLineMatch.preferredLyricsSource);
                            const lyricsMix = analyzeLyricsLanguageMix(lyricsText);
                            const titleScore = getTitleScore(metadataTitle, candidateTitle);
                            const artistScore = getBestArtistScore(metadataArtists, candidateArtists);
                            const durationDiff = Math.abs(Number(item?.duration || 0) - trackDurationSec);
                            const exactDurationMatch = hasExactDurationMatch(trackDurationSec, Number(item?.duration || 0));
                            const artistMatched = artistScore > LRCLIB_ARTIST_MATCH_THRESHOLD;
                            const titleDrivenMatch = allowTitleDrivenMatch
                                && titleScore >= LRCLIB_FALLBACK_TITLE_MATCH_THRESHOLD
                                && exactDurationMatch;
                            const rankedItem = {
                                ...item,
                                artistScore,
                                titleScore,
                                durationDiff,
                                exactDurationMatch,
                                artistMatched,
                                titleDrivenMatch,
                                syncLineExactMatch: syncLineMatch.syncLineExactMatch,
                                exactSyncedLineMatch: syncLineMatch.exactSyncedLineMatch,
                                exactPlainLineMatch: syncLineMatch.exactPlainLineMatch,
                                preferredLyricsSource: syncLineMatch.preferredLyricsSource,
                                lyricsMix,
                                hasInterleavedTranslations: lyricsMix.hasInterleavedTranslations,
                                matchReason: artistMatched ? 'artist' : (titleDrivenMatch ? 'title' : 'rejected')
                            };
                            const sourceMatch = getCandidateSourceMatch(rankedItem, syncDataSource);

                            return {
                                ...rankedItem,
                                ...sourceMatch
                            };
                        })
                        .filter(item => {
                            if (!item?.syncedLyrics && !item?.plainLyrics && !item?.instrumental) return false;
                            if (item.artistMatched) return true;
                            if (allowTitleDrivenMatch && item.titleDrivenMatch) return true;
                            return false;
                        })
                        .sort((a, b) => {
                            if (a.syncSourceMatchScore !== b.syncSourceMatchScore) {
                                return Number(b.syncSourceMatchScore || 0) - Number(a.syncSourceMatchScore || 0);
                            }
                            if (a.syncLineExactMatch !== b.syncLineExactMatch) {
                                return Number(b.syncLineExactMatch) - Number(a.syncLineExactMatch);
                            }
                            if (a.exactSyncedLineMatch !== b.exactSyncedLineMatch) {
                                return Number(b.exactSyncedLineMatch) - Number(a.exactSyncedLineMatch);
                            }
                            if (a.artistMatched !== b.artistMatched) {
                                return Number(b.artistMatched) - Number(a.artistMatched);
                            }
                            if (a.hasInterleavedTranslations !== b.hasInterleavedTranslations) {
                                return Number(a.hasInterleavedTranslations) - Number(b.hasInterleavedTranslations);
                            }
                            if (b.titleScore !== a.titleScore) {
                                return b.titleScore - a.titleScore;
                            }
                            if (a.durationDiff !== b.durationDiff) {
                                return a.durationDiff - b.durationDiff;
                            }
                            return b.artistScore - a.artistScore;
                        });
                };

                const runSearchFlow = async (metadata, { includeAlbum = true } = {}) => {
                    const structuredSearch = await runSearch({
                        track_name: metadata.title,
                        artist_name: metadata.artist,
                        album_name: includeAlbum ? metadata.album : ''
                    }, includeAlbum ? 'structured' : 'structured:no-album');

                    if (structuredSearch.fatal) {
                        return {
                            fatal: true,
                            error: structuredSearch.error,
                            resolvedSearch: structuredSearch,
                            rankedCandidates: [],
                            usedFallbackQuery: false,
                            bestSyncedCandidate: null,
                            bestPlainCandidate: null
                        };
                    }

                    let resolvedSearch = structuredSearch;
                    let rankedCandidates = rankCandidates(structuredSearch.candidates, metadata);
                    let usedFallbackQuery = false;

                    if (rankedCandidates.length === 0 && LRCLIB_ENABLE_INEXACT_SEARCH) {
                        const fallbackAttempts = [];
                        if (searchSettings.enableFallbackTitleArtist && metadata.title && metadata.artist) {
                            fallbackAttempts.push({ params: { q: `${metadata.title} ${metadata.artist}` }, label: 'q:title+artist' });
                        }
                        if (searchSettings.enableFallbackTitleOnly && metadata.title) {
                            fallbackAttempts.push({ params: { q: metadata.title }, label: 'q:title' });
                        }

                        for (const attempt of fallbackAttempts) {
                            const fallbackSearch = await runSearch(attempt.params, attempt.label);
                            usedFallbackQuery = true;

                            if (fallbackSearch.fatal) {
                                return {
                                    fatal: true,
                                    error: fallbackSearch.error,
                                    resolvedSearch: fallbackSearch,
                                    rankedCandidates: [],
                                    usedFallbackQuery,
                                    bestSyncedCandidate: null,
                                    bestPlainCandidate: null
                                };
                            }

                            resolvedSearch = fallbackSearch;
                            rankedCandidates = rankCandidates(fallbackSearch.candidates, metadata, { allowTitleDrivenMatch: true });

                            if (rankedCandidates.length > 0) {
                                break;
                            }
                        }
                    }

                    const withinTolerance = item => item?.durationDiff <= LRCLIB_DURATION_TOLERANCE_SEC;
                    const sourceMatchedCandidates = rankedCandidates.filter(item => Number(item?.syncSourceMatchScore || 0) > 0);
                    const exactMatchCandidates = rankedCandidates.filter(item => item.syncLineExactMatch);
                    const nativeScriptCandidates = rankedCandidates.filter(item => hasOriginalLyricsScript(getCandidateLyricsText(item, item.preferredLyricsSource)));
                    const fallbackScriptCandidates = rankedCandidates.filter(item => !hasOriginalLyricsScript(getCandidateLyricsText(item, item.preferredLyricsSource)));
                    const exactNativeScriptCandidates = nativeScriptCandidates.filter(item => item.syncLineExactMatch);
                    const exactFallbackScriptCandidates = fallbackScriptCandidates.filter(item => item.syncLineExactMatch);
                    const preferredNativeScriptCandidates = nativeScriptCandidates.filter(item => !item.hasInterleavedTranslations);
                    const interleavedNativeScriptCandidates = nativeScriptCandidates.filter(item => item.hasInterleavedTranslations);
                    const orderedNativeScriptCandidates = preferredNativeScriptCandidates.concat(interleavedNativeScriptCandidates);

                    return {
                        fatal: false,
                        error: null,
                        resolvedSearch,
                        rankedCandidates,
                        hasExactSyncLineMatch: exactMatchCandidates.length > 0,
                        usedFallbackQuery,
                        bestSourceSyncedCandidate: sourceMatchedCandidates.find(item => withinTolerance(item) && item.syncedLyrics)
                            || sourceMatchedCandidates.find(item => item.syncedLyrics)
                            || null,
                        bestSourcePlainCandidate: sourceMatchedCandidates.find(item => withinTolerance(item) && item.plainLyrics)
                            || sourceMatchedCandidates.find(item => item.plainLyrics)
                            || null,
                        bestSourceInstrumentalCandidate: sourceMatchedCandidates.find(item => withinTolerance(item) && item.instrumental)
                            || sourceMatchedCandidates.find(item => item.instrumental)
                            || null,
                        bestExactNativeSyncedCandidate: exactNativeScriptCandidates.find(item => withinTolerance(item) && item.preferredLyricsSource === 'synced')
                            || exactNativeScriptCandidates.find(item => item.preferredLyricsSource === 'synced')
                            || null,
                        bestExactNativePlainCandidate: exactNativeScriptCandidates.find(item => withinTolerance(item) && item.preferredLyricsSource === 'plain')
                            || exactNativeScriptCandidates.find(item => item.preferredLyricsSource === 'plain')
                            || null,
                        bestExactFallbackSyncedCandidate: exactFallbackScriptCandidates.find(item => withinTolerance(item) && item.preferredLyricsSource === 'synced')
                            || exactFallbackScriptCandidates.find(item => item.preferredLyricsSource === 'synced')
                            || null,
                        bestExactFallbackPlainCandidate: exactFallbackScriptCandidates.find(item => withinTolerance(item) && item.preferredLyricsSource === 'plain')
                            || exactFallbackScriptCandidates.find(item => item.preferredLyricsSource === 'plain')
                            || null,
                        bestNativeSyncedCandidate: orderedNativeScriptCandidates.find(item => withinTolerance(item) && item.syncedLyrics)
                            || orderedNativeScriptCandidates.find(item => item.syncedLyrics)
                            || null,
                        bestNativePlainCandidate: orderedNativeScriptCandidates.find(item => withinTolerance(item) && item.plainLyrics)
                            || orderedNativeScriptCandidates.find(item => item.plainLyrics)
                            || null,
                        bestFallbackSyncedCandidate: fallbackScriptCandidates.find(item => withinTolerance(item) && item.syncedLyrics)
                            || fallbackScriptCandidates.find(item => item.syncedLyrics)
                            || null,
                        bestFallbackPlainCandidate: fallbackScriptCandidates.find(item => withinTolerance(item) && item.plainLyrics)
                            || fallbackScriptCandidates.find(item => item.plainLyrics)
                            || null,
                        bestInstrumentalCandidate: rankedCandidates.find(item => withinTolerance(item) && item.instrumental)
                            || rankedCandidates.find(item => item.instrumental)
                            || null
                    };
                };

                const primaryMetadata = {
                    title,
                    artist,
                    album,
                    expectedArtists
                };

                const primarySearchFlow = await runSearchFlow(primaryMetadata, { includeAlbum: true });
                if (primarySearchFlow.fatal) {
                    return {
                        success: false,
                        error: primarySearchFlow.error,
                        candidates: [],
                        selectedCandidateKey: null
                    };
                }

                let body = null;
                let selectedFlow = primarySearchFlow;
                let selectedSource = 'primary-none';
                let englishSearchFlow = null;
                let englishMetadata = null;
                let englishSearchError = null;
                let englishSearchAttempted = false;
                const shouldPreferExactSyncLineMatch = Array.isArray(syncDataLineCharCounts) && syncDataLineCharCounts.length > 0;

                const ensureEnglishSearchFlow = async () => {
                    if (englishSearchAttempted) return englishSearchFlow;
                    englishSearchAttempted = true;
                    englishMetadata = await getTrackMetadataForAcceptLanguage(info?.uri, LRCLIB_ENGLISH_ACCEPT_LANGUAGE);

                    if (englishMetadata?.title && englishMetadata?.artist) {
                        englishMetadata = {
                            title: englishMetadata.title.trim(),
                            artist: englishMetadata.artist.trim(),
                            album: '',
                            expectedArtists: splitArtists(englishMetadata.artist)
                        };

                        englishSearchFlow = await runSearchFlow(englishMetadata, { includeAlbum: false });

                        if (englishSearchFlow.fatal) {
                            englishSearchError = englishSearchFlow.error;
                            englishSearchFlow = null;
                        }
                    }

                    return englishSearchFlow;
                };

                if (syncDataSource) {
                    if (primarySearchFlow.bestSourceSyncedCandidate) {
                        body = primarySearchFlow.bestSourceSyncedCandidate;
                        selectedFlow = primarySearchFlow;
                        selectedSource = 'primary-source-synced';
                    }

                    if (!body) {
                        await ensureEnglishSearchFlow();
                        if (englishSearchFlow?.bestSourceSyncedCandidate) {
                            body = englishSearchFlow.bestSourceSyncedCandidate;
                            selectedFlow = englishSearchFlow;
                            selectedSource = 'english-source-synced';
                        }
                    }

                    if (!body && primarySearchFlow.bestSourcePlainCandidate) {
                        body = primarySearchFlow.bestSourcePlainCandidate;
                        selectedFlow = primarySearchFlow;
                        selectedSource = 'primary-source-plain';
                    }

                    if (!body && englishSearchFlow?.bestSourcePlainCandidate) {
                        body = englishSearchFlow.bestSourcePlainCandidate;
                        selectedFlow = englishSearchFlow;
                        selectedSource = 'english-source-plain';
                    }

                    if (!body && primarySearchFlow.bestSourceInstrumentalCandidate) {
                        body = primarySearchFlow.bestSourceInstrumentalCandidate;
                        selectedFlow = primarySearchFlow;
                        selectedSource = 'primary-source-instrumental';
                    }

                    if (!body && englishSearchFlow?.bestSourceInstrumentalCandidate) {
                        body = englishSearchFlow.bestSourceInstrumentalCandidate;
                        selectedFlow = englishSearchFlow;
                        selectedSource = 'english-source-instrumental';
                    }
                }

                if (shouldPreferExactSyncLineMatch) {
                    if (!body && primarySearchFlow.bestExactNativeSyncedCandidate) {
                        body = primarySearchFlow.bestExactNativeSyncedCandidate;
                        selectedFlow = primarySearchFlow;
                        selectedSource = 'primary-exact-native-synced';
                    }

                    if (!body) {
                        await ensureEnglishSearchFlow();
                        if (englishSearchFlow?.bestExactNativeSyncedCandidate) {
                            body = englishSearchFlow.bestExactNativeSyncedCandidate;
                            selectedFlow = englishSearchFlow;
                            selectedSource = 'english-exact-native-synced';
                        }
                    }

                    if (!body && primarySearchFlow.bestExactNativePlainCandidate) {
                        body = primarySearchFlow.bestExactNativePlainCandidate;
                        selectedFlow = primarySearchFlow;
                        selectedSource = 'primary-exact-native-plain';
                    }

                    if (!body && englishSearchFlow?.bestExactNativePlainCandidate) {
                        body = englishSearchFlow.bestExactNativePlainCandidate;
                        selectedFlow = englishSearchFlow;
                        selectedSource = 'english-exact-native-plain';
                    }

                    if (!body && primarySearchFlow.bestExactFallbackSyncedCandidate) {
                        body = primarySearchFlow.bestExactFallbackSyncedCandidate;
                        selectedFlow = primarySearchFlow;
                        selectedSource = 'primary-exact-fallback-synced';
                    }

                    if (!body && englishSearchFlow?.bestExactFallbackSyncedCandidate) {
                        body = englishSearchFlow.bestExactFallbackSyncedCandidate;
                        selectedFlow = englishSearchFlow;
                        selectedSource = 'english-exact-fallback-synced';
                    }

                    if (!body && primarySearchFlow.bestExactFallbackPlainCandidate) {
                        body = primarySearchFlow.bestExactFallbackPlainCandidate;
                        selectedFlow = primarySearchFlow;
                        selectedSource = 'primary-exact-fallback-plain';
                    }

                    if (!body && englishSearchFlow?.bestExactFallbackPlainCandidate) {
                        body = englishSearchFlow.bestExactFallbackPlainCandidate;
                        selectedFlow = englishSearchFlow;
                        selectedSource = 'english-exact-fallback-plain';
                    }
                }

                if (!body) {
                    body = primarySearchFlow.bestNativeSyncedCandidate;
                    if (body) {
                        selectedFlow = primarySearchFlow;
                        selectedSource = 'primary-native-synced';
                    }
                }

                if (!body) {
                    await ensureEnglishSearchFlow();
                    if (englishSearchFlow?.bestNativeSyncedCandidate) {
                        body = englishSearchFlow.bestNativeSyncedCandidate;
                        selectedFlow = englishSearchFlow;
                        selectedSource = 'english-native-synced';
                    }
                }

                if (!body) {
                    if (primarySearchFlow.bestNativePlainCandidate) {
                        body = primarySearchFlow.bestNativePlainCandidate;
                        selectedFlow = primarySearchFlow;
                        selectedSource = 'primary-native-plain';
                    }
                    else if (englishSearchFlow?.bestNativePlainCandidate) {
                        body = englishSearchFlow.bestNativePlainCandidate;
                        selectedFlow = englishSearchFlow;
                        selectedSource = 'english-native-plain';
                    }
                    else if (primarySearchFlow.bestFallbackSyncedCandidate) {
                        body = primarySearchFlow.bestFallbackSyncedCandidate;
                        selectedFlow = primarySearchFlow;
                        selectedSource = 'primary-fallback-synced';
                    }
                    else if (englishSearchFlow?.bestFallbackSyncedCandidate) {
                        body = englishSearchFlow.bestFallbackSyncedCandidate;
                        selectedFlow = englishSearchFlow;
                        selectedSource = 'english-fallback-synced';
                    }
                    else if (primarySearchFlow.bestFallbackPlainCandidate) {
                        body = primarySearchFlow.bestFallbackPlainCandidate;
                        selectedFlow = primarySearchFlow;
                        selectedSource = 'primary-fallback-plain';
                    }
                    else if (englishSearchFlow?.bestFallbackPlainCandidate) {
                        body = englishSearchFlow.bestFallbackPlainCandidate;
                        selectedFlow = englishSearchFlow;
                        selectedSource = 'english-fallback-plain';
                    }
                    else if (primarySearchFlow.bestInstrumentalCandidate) {
                        body = primarySearchFlow.bestInstrumentalCandidate;
                        selectedFlow = primarySearchFlow;
                        selectedSource = 'primary-instrumental';
                    }
                    else if (englishSearchFlow?.bestInstrumentalCandidate) {
                        body = englishSearchFlow.bestInstrumentalCandidate;
                        selectedFlow = englishSearchFlow;
                        selectedSource = 'english-instrumental';
                    }
                }

                if (!body && getSyncDataLrclibId(syncDataSource)) {
                    const directPreviewCandidate = await getSourceDirectPreviewCandidate();

                    if (directPreviewCandidate) {
                        return {
                            ...buildSourceDirectSearchResult(directPreviewCandidate),
                            usedFallbackQuery: !!(englishSearchFlow || primarySearchFlow)?.usedFallbackQuery,
                            englishTitle: englishMetadata?.title || null,
                            englishArtist: englishMetadata?.artist || null
                        };
                    }
                }

                if (!body) {
                    const finalFlow = englishSearchFlow || primarySearchFlow;
                    return {
                        success: false,
                        error: englishSearchError || (finalFlow.resolvedSearch.totalResults > 0
                            ? 'Low confidence metadata match'
                            : (finalFlow.resolvedSearch.error || 'No lyrics found')),
                        candidates: [],
                        selectedCandidateKey: null,
                        searchMode: finalFlow.resolvedSearch?.searchLabel,
                        totalResults: finalFlow.resolvedSearch?.totalResults || 0,
                        usedFallbackQuery: finalFlow.usedFallbackQuery || false
                    };
                }

                const previewList = buildPreviewCandidateList(primarySearchFlow, englishSearchFlow, body);
                return {
                    success: true,
                    error: null,
                    candidates: previewList.candidates,
                    selectedCandidateKey: previewList.selectedCandidateKey,
                    selectedSource,
                    searchMode: selectedFlow.resolvedSearch?.searchLabel || 'structured',
                    totalResults: previewList.candidates.length,
                    usedFallbackQuery: !!selectedFlow.usedFallbackQuery,
                    syncDataLineCount: syncDataLineCharCounts?.length || 0,
                    englishTitle: englishMetadata?.title || null,
                    englishArtist: englishMetadata?.artist || null
                };
            } catch (e) {
                return {
                    success: false,
                    error: e?.message || 'LRCLIB candidate search failed',
                    candidates: [],
                    selectedCandidateKey: null
                };
            }
        },

        async searchCandidatesByQuery(queryText, info = {}) {
            try {
                const queryValue = String(queryText || '').trim();
                if (!queryValue) {
                    return {
                        success: false,
                        error: 'Missing search query',
                        candidates: [],
                        selectedCandidateKey: null
                    };
                }

                const headers = { 'x-user-agent': `spicetify v${Spicetify.Config?.version || 'unknown'}` };
                const query = new URLSearchParams({ q: queryValue });
                const response = await fetchWithTimeout(`${LRCLIB_API_BASE}/search?${query.toString()}`, { headers }, 35000);

                if (!response) {
                    return {
                        success: false,
                        error: 'Network request failed',
                        candidates: [],
                        selectedCandidateKey: null,
                        searchMode: 'manual',
                        totalResults: 0
                    };
                }

                if (!response.ok) {
                    return {
                        success: false,
                        error: response.status === 404 ? 'No lyrics found' : `API error: ${response.status}`,
                        candidates: [],
                        selectedCandidateKey: null,
                        searchMode: 'manual',
                        totalResults: 0
                    };
                }

                const data = await response.json();
                if (!Array.isArray(data)) {
                    return {
                        success: false,
                        error: 'Invalid LRCLIB response',
                        candidates: [],
                        selectedCandidateKey: null,
                        searchMode: 'manual',
                        totalResults: 0
                    };
                }

                const trackDuration = Number(info?.duration || 0);
                const trackDurationSec = trackDuration > 0 ? trackDuration / 1000 : 0;
                const candidates = data
                    .filter(candidate => candidate?.syncedLyrics || candidate?.plainLyrics || candidate?.instrumental)
                    .map((candidate, index) => {
                        const preferredLyricsSource = candidate?.syncedLyrics ? 'synced' : (candidate?.plainLyrics ? 'plain' : 'instrumental');
                        const previewText = getCandidateLyricsText(candidate, preferredLyricsSource);
                        const previewLines = getComparableLyricsLines(previewText);
                        return {
                            ...candidate,
                            candidateKey: buildLrclibCandidateKey(candidate, 'manual', index),
                            searchSource: 'manual',
                            preferredLyricsSource,
                            previewText,
                            previewLineCount: previewLines.length,
                            hasSyncedLyrics: !!candidate?.syncedLyrics,
                            hasPlainLyrics: !!candidate?.plainLyrics,
                            artistScore: info?.artist ? getBestArtistScore(splitArtists(info.artist), splitArtists(candidate?.artistName || '')) : 0,
                            titleScore: info?.title ? getTitleScore(info.title, candidate?.trackName || candidate?.name || '') : 0,
                            durationDiff: trackDurationSec > 0 ? Math.abs(Number(candidate?.duration || 0) - trackDurationSec) : 0,
                            isSelectedByDefault: index === 0
                        };
                    });

                return {
                    success: candidates.length > 0,
                    error: candidates.length > 0 ? null : 'No lyrics found',
                    candidates,
                    selectedCandidateKey: candidates[0]?.candidateKey || null,
                    selectedSource: 'manual',
                    searchMode: 'manual',
                    totalResults: candidates.length,
                    usedFallbackQuery: false
                };
            } catch (e) {
                return {
                    success: false,
                    error: e?.message || 'LRCLIB candidate search failed',
                    candidates: [],
                    selectedCandidateKey: null
                };
            }
        },

        /**
         * 【설정 UI 메서드】
         * 사용자 설정 화면에 표시될 React 컴포넌트를 반환합니다.
         * 자유검색 폴백 단계를 개별적으로 켜고 끌 수 있습니다.
         * 
         * @returns {Function} React 함수형 컴포넌트
         */
        getSettingsUI() {
            const React = Spicetify.React;  // Spicetify 내장 React 사용
            const { useState, useCallback } = React;

            return function LrclibLyricsSettings() {
                const [enableFallbackTitleArtist, setEnableFallbackTitleArtist] = useState(() =>
                    getProviderSetting(
                        LRCLIB_SETTING_KEYS.fallbackTitleArtist,
                        LRCLIB_DEFAULT_SETTINGS[LRCLIB_SETTING_KEYS.fallbackTitleArtist]
                    ) !== false
                );
                const [enableFallbackTitleOnly, setEnableFallbackTitleOnly] = useState(() =>
                    getProviderSetting(
                        LRCLIB_SETTING_KEYS.fallbackTitleOnly,
                        LRCLIB_DEFAULT_SETTINGS[LRCLIB_SETTING_KEYS.fallbackTitleOnly]
                    ) !== false
                );

                const handleToggle = useCallback((key, setter) => (e) => {
                    const checked = !!e.target.checked;
                    setter(checked);
                    setProviderSetting(key, checked);
                    syncAddonCacheVersion();
                }, []);

                return React.createElement('div', { className: 'lyrics-addon-settings ai-addon-settings lrclib-settings' },
                    React.createElement('div', { className: 'ai-addon-setting' },
                        React.createElement('div', {
                            style: {
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '12px'
                            }
                        },
                            React.createElement('div', { style: { flex: '1 1 auto' } },
                                React.createElement('label', null, getAddonText('settings.fallbackTitleArtistLabel', '1st Fallback (title + artist)')),
                                React.createElement('small', null, getAddonText('settings.fallbackTitleArtistDesc', 'Use q=title+artist free-text search when structured search fails.'))
                            ),
                            React.createElement('input', {
                                type: 'checkbox',
                                checked: enableFallbackTitleArtist,
                                onChange: handleToggle(LRCLIB_SETTING_KEYS.fallbackTitleArtist, setEnableFallbackTitleArtist)
                            })
                        )
                    ),
                    React.createElement('div', { className: 'ai-addon-setting' },
                        React.createElement('div', {
                            style: {
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '12px'
                            }
                        },
                            React.createElement('div', { style: { flex: '1 1 auto' } },
                                React.createElement('label', null, getAddonText('settings.fallbackTitleOnlyLabel', '2nd Fallback (title only)')),
                                React.createElement('small', null, getAddonText('settings.fallbackTitleOnlyDesc', 'Use q=title free-text search when the first fallback also fails.'))
                            ),
                            React.createElement('input', {
                                type: 'checkbox',
                                checked: enableFallbackTitleOnly,
                                onChange: handleToggle(LRCLIB_SETTING_KEYS.fallbackTitleOnly, setEnableFallbackTitleOnly)
                            })
                        )
                    )
                );
            };
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
        async getLyrics(info) {
            const startTotal = performance.now();
            const cacheVersion = syncAddonCacheVersion();
            const result = {
                uri: info.uri,
                provider: 'lrclib',
                cacheVersion,
                karaoke: null,
                synced: null,
                unsynced: null,
                copyright: null,
                error: null
            };

            const logDebug = (status, extra = {}) => {
                const endTotal = performance.now();
                window.__ivLyricsDebugLog?.(`[LR-DEBUG] ========================================`);
                window.__ivLyricsDebugLog?.(`[LR-DEBUG] Track: ${info.title} - ${info.artist}`);
                window.__ivLyricsDebugLog?.(`[LR-DEBUG] Status: ${status}`);
                Object.entries(extra).forEach(([key, value]) => {
                    if (value !== undefined && value !== null) {
                        window.__ivLyricsDebugLog?.(`[LR-DEBUG] ${key}: ${value}`);
                    }
                });
                window.__ivLyricsDebugLog?.(`[LR-DEBUG] Time - Total: ${(endTotal - startTotal).toFixed(2)}ms`);
                window.__ivLyricsDebugLog?.(`[LR-DEBUG] ========================================`);
            };

            try {
                const title = info?.title?.trim?.();
                const artist = info?.artist?.trim?.();
                const album = info?.album?.trim?.();
                const searchSettings = getSearchSettings();
                const trackDuration = Number(info?.duration || 0);
                const trackDurationSec = trackDuration > 0 ? trackDuration / 1000 : 0;
                const expectedArtists = splitArtists(artist);

                if (!title || !artist || !trackDurationSec) {
                    result.error = 'Missing track metadata';
                    logDebug('Failed', { error: result.error });
                    return result;
                }

                const headers = { 'x-user-agent': `spicetify v${Spicetify.Config?.version || 'unknown'}` };
                const trackId = window.LyricsService?.extractTrackId?.(info?.uri)
                    || window.ivLyricsTrackIdentity?.extractTrackId?.(info?.uri)
                    || '';
                const trackIsrc = await window.SyncDataService?.resolveTrackIsrc?.(trackId, info)
                    || window.SyncDataService?.getTrackIsrc?.(trackId, info)
                    || window.SyncDataService?.normalizeSyncDataIsrc?.(info?.isrc || info?.external_ids?.isrc || info?.externalIds?.isrc);
                let syncDataLineCharCounts = null;
                let syncDataSource = null;

                if (trackId && window.SyncDataService?.getSyncData) {
                    try {
                        const existingSyncData = await window.SyncDataService.getSyncData(trackId, ADDON_INFO.id, { ...info, isrc: trackIsrc });
                        syncDataLineCharCounts = getSyncDataLineCharCounts(existingSyncData);
                        syncDataSource = getSyncDataLrclibSource(existingSyncData);
                    } catch (e) {
                        window.__ivLyricsDebugLog?.('[LR-DEBUG] Failed to fetch sync-data for exact line matching:', e?.message || e);
                    }
                }

                if (getSyncDataLrclibId(syncDataSource)) {
                    const directCandidate = decorateDirectCandidate(
                        await fetchLrclibCandidateById(syncDataSource, headers),
                        syncDataSource,
                        trackDurationSec
                    );

                    if (directCandidate && applyCandidateLyricsToResult(result, directCandidate)) {
                        logDebug('Success', {
                            directLrclibId: getSyncDataLrclibId(syncDataSource),
                            hasSynced: !!result.synced,
                            hasUnsynced: !!result.unsynced,
                            durationDiff: directCandidate.durationDiff.toFixed(2),
                            exactDurationMatch: directCandidate.exactDurationMatch,
                            syncDataLineCount: syncDataLineCharCounts?.length || 0,
                            syncSourceMatchScore: directCandidate.syncSourceMatchScore,
                            preferredLyricsSource: directCandidate.preferredLyricsSource,
                            selectedSource: 'source-direct'
                        });
                        return result;
                    }
                }

                const runSearch = async (params, label) => {
                    const query = new URLSearchParams();
                    if (params.track_name) query.set('track_name', params.track_name);
                    if (params.artist_name) query.set('artist_name', params.artist_name);
                    if (params.album_name && params.album_name !== 'undefined') query.set('album_name', params.album_name);
                    if (params.q) query.set('q', params.q);

                    const searchUrl = `${LRCLIB_API_BASE}/search?${query.toString()}`;
                    const response = await fetchWithTimeout(searchUrl, { headers }, 35000);

                    if (!response) {
                        return {
                            fatal: true,
                            error: 'Network request failed',
                            searchLabel: label,
                            totalResults: 0,
                            candidates: []
                        };
                    }

                    if (!response.ok) {
                        if (response.status === 429) {
                            return {
                                fatal: true,
                                error: 'Rate limit exceeded (429)',
                                searchLabel: label,
                                totalResults: 0,
                                candidates: []
                            };
                        }
                        if (response.status === 404) {
                            return {
                                fatal: false,
                                error: 'No lyrics found',
                                searchLabel: label,
                                totalResults: 0,
                                candidates: []
                            };
                        }
                        return {
                            fatal: true,
                            error: `API error: ${response.status}`,
                            searchLabel: label,
                            totalResults: 0,
                            candidates: []
                        };
                    }

                    const data = await response.json();
                    if (!Array.isArray(data)) {
                        return {
                            fatal: true,
                            error: 'Invalid LRCLIB response',
                            searchLabel: label,
                            totalResults: 0,
                            candidates: []
                        };
                    }

                    return {
                        fatal: false,
                        error: data.length === 0 ? 'No lyrics found' : null,
                        searchLabel: label,
                        totalResults: data.length,
                        candidates: data
                    };
                };

                const rankCandidates = (candidates, metadata, { allowTitleDrivenMatch = false } = {}) => {
                    const metadataTitle = metadata?.title || '';
                    const metadataArtists = metadata?.expectedArtists || [];

                    return candidates
                        .map(item => {
                            const candidateArtists = splitArtists(item?.artistName || '');
                            const candidateTitle = item?.trackName || item?.name || '';
                            const syncLineMatch = getCandidateSyncLineMatch(item, syncDataLineCharCounts);
                            const lyricsText = getCandidateLyricsText(item, syncLineMatch.preferredLyricsSource);
                            const lyricsMix = analyzeLyricsLanguageMix(lyricsText);
                            const titleScore = getTitleScore(metadataTitle, candidateTitle);
                            const artistScore = getBestArtistScore(metadataArtists, candidateArtists);
                            const durationDiff = Math.abs(Number(item?.duration || 0) - trackDurationSec);
                            const exactDurationMatch = hasExactDurationMatch(trackDurationSec, Number(item?.duration || 0));
                            const artistMatched = artistScore > LRCLIB_ARTIST_MATCH_THRESHOLD;
                            const titleDrivenMatch = allowTitleDrivenMatch
                                && titleScore >= LRCLIB_FALLBACK_TITLE_MATCH_THRESHOLD
                                && exactDurationMatch;
                            const rankedItem = {
                                ...item,
                                artistScore,
                                titleScore,
                                durationDiff,
                                exactDurationMatch,
                                artistMatched,
                                titleDrivenMatch,
                                syncLineExactMatch: syncLineMatch.syncLineExactMatch,
                                exactSyncedLineMatch: syncLineMatch.exactSyncedLineMatch,
                                exactPlainLineMatch: syncLineMatch.exactPlainLineMatch,
                                preferredLyricsSource: syncLineMatch.preferredLyricsSource,
                                lyricsMix,
                                hasInterleavedTranslations: lyricsMix.hasInterleavedTranslations,
                                matchReason: artistMatched ? 'artist' : (titleDrivenMatch ? 'title' : 'rejected')
                            };
                            const sourceMatch = getCandidateSourceMatch(rankedItem, syncDataSource);

                            return {
                                ...rankedItem,
                                ...sourceMatch
                            };
                        })
                        .filter(item => {
                            if (!item?.syncedLyrics && !item?.plainLyrics && !item?.instrumental) return false;
                            if (item.artistMatched) return true;
                            if (allowTitleDrivenMatch && item.titleDrivenMatch) return true;
                            return false;
                        })
                        .sort((a, b) => {
                            if (a.syncSourceMatchScore !== b.syncSourceMatchScore) {
                                return Number(b.syncSourceMatchScore || 0) - Number(a.syncSourceMatchScore || 0);
                            }
                            if (a.syncLineExactMatch !== b.syncLineExactMatch) {
                                return Number(b.syncLineExactMatch) - Number(a.syncLineExactMatch);
                            }
                            if (a.exactSyncedLineMatch !== b.exactSyncedLineMatch) {
                                return Number(b.exactSyncedLineMatch) - Number(a.exactSyncedLineMatch);
                            }
                            if (a.artistMatched !== b.artistMatched) {
                                return Number(b.artistMatched) - Number(a.artistMatched);
                            }
                            if (a.hasInterleavedTranslations !== b.hasInterleavedTranslations) {
                                return Number(a.hasInterleavedTranslations) - Number(b.hasInterleavedTranslations);
                            }
                            if (b.titleScore !== a.titleScore) {
                                return b.titleScore - a.titleScore;
                            }
                            if (a.durationDiff !== b.durationDiff) {
                                return a.durationDiff - b.durationDiff;
                            }
                            return b.artistScore - a.artistScore;
                        });
                };

                const runSearchFlow = async (metadata, { includeAlbum = true } = {}) => {
                    const structuredSearch = await runSearch({
                        track_name: metadata.title,
                        artist_name: metadata.artist,
                        album_name: includeAlbum ? metadata.album : ''
                    }, includeAlbum ? 'structured' : 'structured:no-album');

                    if (structuredSearch.fatal) {
                        return {
                            fatal: true,
                            error: structuredSearch.error,
                            resolvedSearch: structuredSearch,
                            rankedCandidates: [],
                            usedFallbackQuery: false,
                            bestSyncedCandidate: null,
                            bestPlainCandidate: null
                        };
                    }

                    let resolvedSearch = structuredSearch;
                    let rankedCandidates = rankCandidates(structuredSearch.candidates, metadata);
                    let usedFallbackQuery = false;

                    if (rankedCandidates.length === 0 && LRCLIB_ENABLE_INEXACT_SEARCH) {
                        const fallbackAttempts = [];
                        if (searchSettings.enableFallbackTitleArtist && metadata.title && metadata.artist) {
                            fallbackAttempts.push({ params: { q: `${metadata.title} ${metadata.artist}` }, label: 'q:title+artist' });
                        }
                        if (searchSettings.enableFallbackTitleOnly && metadata.title) {
                            fallbackAttempts.push({ params: { q: metadata.title }, label: 'q:title' });
                        }

                        for (const attempt of fallbackAttempts) {
                            const fallbackSearch = await runSearch(attempt.params, attempt.label);
                            usedFallbackQuery = true;

                            if (fallbackSearch.fatal) {
                                return {
                                    fatal: true,
                                    error: fallbackSearch.error,
                                    resolvedSearch: fallbackSearch,
                                    rankedCandidates: [],
                                    usedFallbackQuery,
                                    bestSyncedCandidate: null,
                                    bestPlainCandidate: null
                                };
                            }

                            resolvedSearch = fallbackSearch;
                            rankedCandidates = rankCandidates(fallbackSearch.candidates, metadata, { allowTitleDrivenMatch: true });

                            if (rankedCandidates.length > 0) {
                                break;
                            }
                        }
                    }

                    const withinTolerance = item => item?.durationDiff <= LRCLIB_DURATION_TOLERANCE_SEC;
                    const sourceMatchedCandidates = rankedCandidates.filter(item => Number(item?.syncSourceMatchScore || 0) > 0);
                    const exactMatchCandidates = rankedCandidates.filter(item => item.syncLineExactMatch);
                    const nativeScriptCandidates = rankedCandidates.filter(item => hasOriginalLyricsScript(getCandidateLyricsText(item, item.preferredLyricsSource)));
                    const fallbackScriptCandidates = rankedCandidates.filter(item => !hasOriginalLyricsScript(getCandidateLyricsText(item, item.preferredLyricsSource)));
                    const exactNativeScriptCandidates = nativeScriptCandidates.filter(item => item.syncLineExactMatch);
                    const exactFallbackScriptCandidates = fallbackScriptCandidates.filter(item => item.syncLineExactMatch);
                    const preferredNativeScriptCandidates = nativeScriptCandidates.filter(item => !item.hasInterleavedTranslations);
                    const interleavedNativeScriptCandidates = nativeScriptCandidates.filter(item => item.hasInterleavedTranslations);
                    const orderedNativeScriptCandidates = preferredNativeScriptCandidates.concat(interleavedNativeScriptCandidates);

                    return {
                        fatal: false,
                        error: null,
                        resolvedSearch,
                        rankedCandidates,
                        hasExactSyncLineMatch: exactMatchCandidates.length > 0,
                        usedFallbackQuery,
                        bestSourceSyncedCandidate: sourceMatchedCandidates.find(item => withinTolerance(item) && item.syncedLyrics)
                            || sourceMatchedCandidates.find(item => item.syncedLyrics)
                            || null,
                        bestSourcePlainCandidate: sourceMatchedCandidates.find(item => withinTolerance(item) && item.plainLyrics)
                            || sourceMatchedCandidates.find(item => item.plainLyrics)
                            || null,
                        bestSourceInstrumentalCandidate: sourceMatchedCandidates.find(item => withinTolerance(item) && item.instrumental)
                            || sourceMatchedCandidates.find(item => item.instrumental)
                            || null,
                        bestExactNativeSyncedCandidate: exactNativeScriptCandidates.find(item => withinTolerance(item) && item.preferredLyricsSource === 'synced')
                            || exactNativeScriptCandidates.find(item => item.preferredLyricsSource === 'synced')
                            || null,
                        bestExactNativePlainCandidate: exactNativeScriptCandidates.find(item => withinTolerance(item) && item.preferredLyricsSource === 'plain')
                            || exactNativeScriptCandidates.find(item => item.preferredLyricsSource === 'plain')
                            || null,
                        bestExactFallbackSyncedCandidate: exactFallbackScriptCandidates.find(item => withinTolerance(item) && item.preferredLyricsSource === 'synced')
                            || exactFallbackScriptCandidates.find(item => item.preferredLyricsSource === 'synced')
                            || null,
                        bestExactFallbackPlainCandidate: exactFallbackScriptCandidates.find(item => withinTolerance(item) && item.preferredLyricsSource === 'plain')
                            || exactFallbackScriptCandidates.find(item => item.preferredLyricsSource === 'plain')
                            || null,
                        bestNativeSyncedCandidate: orderedNativeScriptCandidates.find(item => withinTolerance(item) && item.syncedLyrics)
                            || orderedNativeScriptCandidates.find(item => item.syncedLyrics)
                            || null,
                        bestNativePlainCandidate: orderedNativeScriptCandidates.find(item => withinTolerance(item) && item.plainLyrics)
                            || orderedNativeScriptCandidates.find(item => item.plainLyrics)
                            || null,
                        bestFallbackSyncedCandidate: fallbackScriptCandidates.find(item => withinTolerance(item) && item.syncedLyrics)
                            || fallbackScriptCandidates.find(item => item.syncedLyrics)
                            || null,
                        bestFallbackPlainCandidate: fallbackScriptCandidates.find(item => withinTolerance(item) && item.plainLyrics)
                            || fallbackScriptCandidates.find(item => item.plainLyrics)
                            || null,
                        bestInstrumentalCandidate: rankedCandidates.find(item => withinTolerance(item) && item.instrumental)
                            || rankedCandidates.find(item => item.instrumental)
                            || null
                    };
                };

                const primaryMetadata = {
                    title,
                    artist,
                    album,
                    expectedArtists
                };

                const primarySearchFlow = await runSearchFlow(primaryMetadata, { includeAlbum: true });

                if (primarySearchFlow.fatal) {
                    result.error = primarySearchFlow.error;
                    logDebug('Failed', {
                        error: result.error,
                        searchMode: primarySearchFlow.resolvedSearch?.searchLabel
                    });
                    return result;
                }

                let body = null;
                let selectedFlow = primarySearchFlow;
                let selectedSource = 'primary-none';
                let englishSearchFlow = null;
                let englishMetadata = null;
                let englishSearchError = null;
                let englishSearchAttempted = false;
                const shouldPreferExactSyncLineMatch = Array.isArray(syncDataLineCharCounts) && syncDataLineCharCounts.length > 0;

                const ensureEnglishSearchFlow = async () => {
                    if (englishSearchAttempted) return englishSearchFlow;
                    englishSearchAttempted = true;
                    englishMetadata = await getTrackMetadataForAcceptLanguage(info?.uri, LRCLIB_ENGLISH_ACCEPT_LANGUAGE);

                    if (englishMetadata?.title && englishMetadata?.artist) {
                        englishMetadata = {
                            title: englishMetadata.title.trim(),
                            artist: englishMetadata.artist.trim(),
                            album: '',
                            expectedArtists: splitArtists(englishMetadata.artist)
                        };

                        englishSearchFlow = await runSearchFlow(englishMetadata, { includeAlbum: false });

                        if (englishSearchFlow.fatal) {
                            englishSearchError = englishSearchFlow.error;
                            englishSearchFlow = null;
                        }
                    }

                    return englishSearchFlow;
                };

                if (syncDataSource) {
                    if (primarySearchFlow.bestSourceSyncedCandidate) {
                        body = primarySearchFlow.bestSourceSyncedCandidate;
                        selectedFlow = primarySearchFlow;
                        selectedSource = 'primary-source-synced';
                    }

                    if (!body) {
                        await ensureEnglishSearchFlow();
                        if (englishSearchFlow?.bestSourceSyncedCandidate) {
                            body = englishSearchFlow.bestSourceSyncedCandidate;
                            selectedFlow = englishSearchFlow;
                            selectedSource = 'english-source-synced';
                        }
                    }

                    if (!body && primarySearchFlow.bestSourcePlainCandidate) {
                        body = primarySearchFlow.bestSourcePlainCandidate;
                        selectedFlow = primarySearchFlow;
                        selectedSource = 'primary-source-plain';
                    }

                    if (!body && englishSearchFlow?.bestSourcePlainCandidate) {
                        body = englishSearchFlow.bestSourcePlainCandidate;
                        selectedFlow = englishSearchFlow;
                        selectedSource = 'english-source-plain';
                    }

                    if (!body && primarySearchFlow.bestSourceInstrumentalCandidate) {
                        body = primarySearchFlow.bestSourceInstrumentalCandidate;
                        selectedFlow = primarySearchFlow;
                        selectedSource = 'primary-source-instrumental';
                    }

                    if (!body && englishSearchFlow?.bestSourceInstrumentalCandidate) {
                        body = englishSearchFlow.bestSourceInstrumentalCandidate;
                        selectedFlow = englishSearchFlow;
                        selectedSource = 'english-source-instrumental';
                    }
                }

                if (shouldPreferExactSyncLineMatch) {
                    if (!body && primarySearchFlow.bestExactNativeSyncedCandidate) {
                        body = primarySearchFlow.bestExactNativeSyncedCandidate;
                        selectedFlow = primarySearchFlow;
                        selectedSource = 'primary-exact-native-synced';
                    }

                    if (!body) {
                        await ensureEnglishSearchFlow();
                        if (englishSearchFlow?.bestExactNativeSyncedCandidate) {
                            body = englishSearchFlow.bestExactNativeSyncedCandidate;
                            selectedFlow = englishSearchFlow;
                            selectedSource = 'english-exact-native-synced';
                        }
                    }

                    if (!body && primarySearchFlow.bestExactNativePlainCandidate) {
                        body = primarySearchFlow.bestExactNativePlainCandidate;
                        selectedFlow = primarySearchFlow;
                        selectedSource = 'primary-exact-native-plain';
                    }

                    if (!body && englishSearchFlow?.bestExactNativePlainCandidate) {
                        body = englishSearchFlow.bestExactNativePlainCandidate;
                        selectedFlow = englishSearchFlow;
                        selectedSource = 'english-exact-native-plain';
                    }

                    if (!body && primarySearchFlow.bestExactFallbackSyncedCandidate) {
                        body = primarySearchFlow.bestExactFallbackSyncedCandidate;
                        selectedFlow = primarySearchFlow;
                        selectedSource = 'primary-exact-fallback-synced';
                    }

                    if (!body && englishSearchFlow?.bestExactFallbackSyncedCandidate) {
                        body = englishSearchFlow.bestExactFallbackSyncedCandidate;
                        selectedFlow = englishSearchFlow;
                        selectedSource = 'english-exact-fallback-synced';
                    }

                    if (!body && primarySearchFlow.bestExactFallbackPlainCandidate) {
                        body = primarySearchFlow.bestExactFallbackPlainCandidate;
                        selectedFlow = primarySearchFlow;
                        selectedSource = 'primary-exact-fallback-plain';
                    }

                    if (!body && englishSearchFlow?.bestExactFallbackPlainCandidate) {
                        body = englishSearchFlow.bestExactFallbackPlainCandidate;
                        selectedFlow = englishSearchFlow;
                        selectedSource = 'english-exact-fallback-plain';
                    }
                }

                if (!body) {
                    body = primarySearchFlow.bestNativeSyncedCandidate;
                    if (body) {
                        selectedFlow = primarySearchFlow;
                        selectedSource = 'primary-native-synced';
                    }
                }

                if (!body) {
                    await ensureEnglishSearchFlow();
                    if (englishSearchFlow?.bestNativeSyncedCandidate) {
                        body = englishSearchFlow.bestNativeSyncedCandidate;
                        selectedFlow = englishSearchFlow;
                        selectedSource = 'english-native-synced';
                    }
                }

                if (!body) {
                    if (primarySearchFlow.bestNativePlainCandidate) {
                        body = primarySearchFlow.bestNativePlainCandidate;
                        selectedFlow = primarySearchFlow;
                        selectedSource = 'primary-native-plain';
                    }
                    else if (englishSearchFlow?.bestNativePlainCandidate) {
                        body = englishSearchFlow.bestNativePlainCandidate;
                        selectedFlow = englishSearchFlow;
                        selectedSource = 'english-native-plain';
                    }
                    else if (primarySearchFlow.bestFallbackSyncedCandidate) {
                        body = primarySearchFlow.bestFallbackSyncedCandidate;
                        selectedFlow = primarySearchFlow;
                        selectedSource = 'primary-fallback-synced';
                    }
                    else if (englishSearchFlow?.bestFallbackSyncedCandidate) {
                        body = englishSearchFlow.bestFallbackSyncedCandidate;
                        selectedFlow = englishSearchFlow;
                        selectedSource = 'english-fallback-synced';
                    }
                    else if (primarySearchFlow.bestFallbackPlainCandidate) {
                        body = primarySearchFlow.bestFallbackPlainCandidate;
                        selectedFlow = primarySearchFlow;
                        selectedSource = 'primary-fallback-plain';
                    }
                    else if (englishSearchFlow?.bestFallbackPlainCandidate) {
                        body = englishSearchFlow.bestFallbackPlainCandidate;
                        selectedFlow = englishSearchFlow;
                        selectedSource = 'english-fallback-plain';
                    }
                    else if (primarySearchFlow.bestInstrumentalCandidate) {
                        body = primarySearchFlow.bestInstrumentalCandidate;
                        selectedFlow = primarySearchFlow;
                        selectedSource = 'primary-instrumental';
                    }
                    else if (englishSearchFlow?.bestInstrumentalCandidate) {
                        body = englishSearchFlow.bestInstrumentalCandidate;
                        selectedFlow = englishSearchFlow;
                        selectedSource = 'english-instrumental';
                    }
                }

                if (!body) {
                    if (englishSearchError) {
                        result.error = englishSearchError;
                    }
                    else {
                        const finalFlow = englishSearchFlow || primarySearchFlow;
                        result.error = finalFlow.resolvedSearch.totalResults > 0
                            ? 'Low confidence metadata match'
                            : (finalFlow.resolvedSearch.error || 'No lyrics found');
                    }
                    logDebug('Failed', {
                        error: result.error,
                        searchMode: (englishSearchFlow || primarySearchFlow).resolvedSearch?.searchLabel,
                        totalResults: (englishSearchFlow || primarySearchFlow).resolvedSearch?.totalResults,
                        usedFallbackQuery: (englishSearchFlow || primarySearchFlow).usedFallbackQuery,
                        selectedSource,
                        englishTitle: englishMetadata?.title,
                        englishArtist: englishMetadata?.artist
                    });
                    return result;
                }

                if (body.durationDiff > LRCLIB_DURATION_TOLERANCE_SEC && !body.syncLineExactMatch) {
                    result.error = `No LRCLIB results within ±${LRCLIB_DURATION_TOLERANCE_SEC}s`;
                    logDebug('Failed', {
                        error: result.error,
                        durationDiff: body.durationDiff.toFixed(2),
                        searchMode: selectedFlow.resolvedSearch.searchLabel,
                        usedFallbackQuery: selectedFlow.usedFallbackQuery,
                        selectedSource
                    });
                    return result;
                }

                if (body.id !== undefined && body.id !== null && String(body.id).trim()) {
                    result.lrclibId = String(body.id).trim();
                }
                const syncSource = buildLrclibSyncSource(body);
                if (syncSource) {
                    result.lrclibSource = syncSource;
                }

                if (body.instrumental) {
                    result.synced = [{ startTime: 0, text: '♪ Instrumental ♪' }];
                    result.unsynced = [{ text: '♪ Instrumental ♪' }];
                    logDebug('Success', {
                        instrumental: true,
                        matchedCandidates: selectedFlow.rankedCandidates.length,
                        durationDiff: body.durationDiff.toFixed(2),
                        exactDurationMatch: body.exactDurationMatch,
                        artistScore: body.artistScore.toFixed(3),
                        titleScore: body.titleScore.toFixed(3),
                        matchReason: body.matchReason,
                        syncLineExactMatch: !!body.syncLineExactMatch,
                        preferredLyricsSource: body.preferredLyricsSource,
                        searchMode: selectedFlow.resolvedSearch.searchLabel,
                        usedFallbackQuery: selectedFlow.usedFallbackQuery,
                        selectedSource,
                        englishTitle: englishMetadata?.title,
                        englishArtist: englishMetadata?.artist
                    });
                    return result;
                }

                if (body.preferredLyricsSource === 'plain' && body.plainLyrics) {
                    result.unsynced = parsePlainLyrics(body.plainLyrics);
                }
                else if (body.syncedLyrics) {
                    const parsed = parseLRC(body.syncedLyrics);
                    result.synced = parsed.synced;
                    if (!result.unsynced) {
                        result.unsynced = parsed.unsynced;
                    }
                }
                else if (body.plainLyrics) {
                    result.unsynced = parsePlainLyrics(body.plainLyrics);
                }

                if (!result.synced && body.plainLyrics && !result.unsynced) {
                    result.unsynced = parsePlainLyrics(body.plainLyrics);
                }

                applyLyricsfileKaraokeToResult(result, body);

                if (!result.karaoke && !result.synced && !result.unsynced) {
                    result.error = 'No lyrics';
                    logDebug('Failed', {
                        error: result.error,
                        matchedCandidates: selectedFlow.rankedCandidates.length,
                        searchMode: selectedFlow.resolvedSearch.searchLabel,
                        usedFallbackQuery: selectedFlow.usedFallbackQuery,
                        selectedSource
                    });
                    return result;
                }

                logDebug('Success', {
                    totalResults: selectedFlow.resolvedSearch.totalResults,
                    matchedCandidates: selectedFlow.rankedCandidates.length,
                    artistScore: body.artistScore.toFixed(3),
                    titleScore: body.titleScore.toFixed(3),
                    durationDiff: body.durationDiff.toFixed(2),
                    exactDurationMatch: body.exactDurationMatch,
                    hasKaraoke: !!result.karaoke,
                    hasSynced: !!result.synced,
                    hasUnsynced: !!result.unsynced,
                    hasInterleavedTranslations: !!body.hasInterleavedTranslations,
                    matchReason: body.matchReason,
                    syncDataLineCount: syncDataLineCharCounts?.length || 0,
                    syncLineExactMatch: !!body.syncLineExactMatch,
                    preferredLyricsSource: body.preferredLyricsSource,
                    searchMode: selectedFlow.resolvedSearch.searchLabel,
                    usedFallbackQuery: selectedFlow.usedFallbackQuery,
                    selectedSource,
                    englishTitle: englishMetadata?.title,
                    englishArtist: englishMetadata?.artist
                });
                return result;

            } catch (e) {
                result.error = e.message;
                logDebug('Fatal Error', { error: e.message });
                return result;
            }

        }
    };

    syncAddonCacheVersion();

    // ============================================
    // Registration (애드온 등록)
    // ============================================
    // LyricsAddonManager에 이 애드온을 등록합니다.
    // Spicetify 로딩 순서에 따라 Manager가 아직 준비되지 않았을 수 있으므로
    // 준비될 때까지 100ms 간격으로 재시도합니다.

    /**
     * 【애드온 등록 함수】
     * window.LyricsAddonManager가 존재하면 애드온을 등록하고,
     * 없으면 100ms 후에 다시 시도합니다 (Polling 패턴).
     */
    const registerAddon = () => {
        if (window.LyricsAddonManager) {
            // Manager 준비됨 → 애드온 등록
            window.LyricsAddonManager.register(LrclibLyricsAddon);
        } else {
            // Manager 미준비 → 100ms 후 재시도
            setTimeout(registerAddon, 100);
        }
    };

    // IIFE 실행 시 즉시 등록 시도 시작
    registerAddon();
})();
