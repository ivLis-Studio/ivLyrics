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
    const PREFER_SYNC_DATA_PROVIDER_SETTING = 'prefer-sync-data-provider';
    const PREFER_SYNC_DATA_PROVIDER_STORAGE_KEY = `ivLyrics:visual:${PREFER_SYNC_DATA_PROVIDER_SETTING}`;
    const LRCLIB_PROVIDER_ID = 'lrclib';
    const PREFER_LYRICS_TYPE_OVER_PROVIDER_ORDER_SETTING = 'prefer-lyrics-type-over-provider-order';
    const PREFER_LYRICS_TYPE_OVER_PROVIDER_ORDER_STORAGE_KEY = `ivLyrics:visual:${PREFER_LYRICS_TYPE_OVER_PROVIDER_ORDER_SETTING}`;
    const getStoredValue = (key) => window.ivLyricsStoragePersistence
        ? window.ivLyricsStoragePersistence.getItem(key)
        : Spicetify.LocalStorage.get(key);
    const setStoredValue = (key, value) => window.ivLyricsStoragePersistence
        ? window.ivLyricsStoragePersistence.setItem(key, value)
        : Spicetify.LocalStorage.set(key, value);
    const parseStoredProviderOrder = (storageKey) => {
        let stored = null;
        try {
            stored = getStoredValue(storageKey);
        } catch {
            return [];
        }
        if (!stored) return [];

        let parsed = null;
        try {
            parsed = JSON.parse(stored);
        } catch {
            // Invalid persisted data is repaired below.
        }

        if (!Array.isArray(parsed)) {
            try {
                setStoredValue(storageKey, '[]');
            } catch {
                // A safe default can still be returned when storage is read-only.
            }
            return [];
        }

        const normalized = Array.from(
            new Set(parsed.filter(id => typeof id === 'string' && id.length > 0))
        );
        if (normalized.length !== parsed.length) {
            try {
                setStoredValue(storageKey, JSON.stringify(normalized));
            } catch {
                // Keep the in-memory normalized value when storage is read-only.
            }
        }
        return normalized;
    };
    const SYNC_DATA_RENDERER_VERSION = '2026-05-23-source-line-shape-1';

    // 가사 유형. Karaoke 데이터는 타이밍의 최소 단위를 기준으로 다시
    // 나눈다. 렌더러는 같은 `result.karaoke` 배열을 사용하지만 선택 정책과
    // 제공자별 허용 설정은 두 종류를 독립적으로 다룬다.
    const LYRICS_TYPES = {
        CHARACTER: 'character', // 글자 단위 노래방 가사
        WORD: 'word',           // 단어 단위 노래방 가사
        KARAOKE: 'karaoke',     // 이전 Addon/설정 호환용 그룹 이름
        SYNCED: 'synced',       // 싱크 가사 (줄별 타이밍)
        UNSYNCED: 'unsynced'    // 일반 가사 (타이밍 없음)
    };
    const LYRICS_TYPE_PRIORITY_ORDER = [
        LYRICS_TYPES.CHARACTER,
        LYRICS_TYPES.WORD,
        LYRICS_TYPES.SYNCED,
        LYRICS_TYPES.UNSYNCED
    ];
    const KARAOKE_GRANULARITIES = new Set([
        LYRICS_TYPES.CHARACTER,
        LYRICS_TYPES.WORD
    ]);
    const PROVIDER_SELECTION_POLICIES = {
        PROVIDER_FIRST: 'provider-first-v1',
        TYPE_FIRST: 'type-first-v1'
    };
    const DEFAULT_PROVIDER_ORDER = [
        'spotify',
        'lrclib',
        'paxsenix',
        'lyricsplus',
        'unison'
    ];
    const PSEUDO_KARAOKE_SOURCES = new Set([
        'audio-analysis-pseudo',
        'spotify-audio-analysis',
        'line-timing-pseudo'
    ]);
    const CANONICAL_INSTRUMENTAL_BREAK_MARKER = '♪';
    const NOTE_INSTRUMENTAL_BREAK_CHARACTER_PATTERN = /[\u2669-\u266F\u{1D100}-\u{1D1FF}\u{1F3B5}-\u{1F3BC}]/u;
    const NOTE_ONLY_INSTRUMENTAL_BREAK_PATTERN = /^[\s\u00A0\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFE0E\uFE0F\uFEFF\u2669-\u266F\u{1D100}-\u{1D1FF}\u{1F3B5}-\u{1F3BC}·•・。.、,，…⋯~〜～\-–—_|/\\:：]+$/u;

    function hasLyricsContent(lines) {
        return Array.isArray(lines) && lines.length > 0;
    }

    function normalizeKaraokeGranularity(value) {
        const normalized = String(value || '').trim().toLowerCase();
        if (normalized === 'char' || normalized === 'character' || normalized === 'letter') {
            return LYRICS_TYPES.CHARACTER;
        }
        if (normalized === 'word' || normalized === 'token') {
            return LYRICS_TYPES.WORD;
        }
        return '';
    }

    function getDeclaredKaraokeGranularities(provider) {
        const declared = new Set(
            (Array.isArray(provider?.supports?.karaokeGranularities)
                ? provider.supports.karaokeGranularities
                : [])
                .map(normalizeKaraokeGranularity)
                .filter(Boolean)
        );
        if (provider?.supports?.character === true || provider?.supports?.karaokeCharacter === true) {
            declared.add(LYRICS_TYPES.CHARACTER);
        }
        if (provider?.supports?.word === true || provider?.supports?.karaokeWord === true) {
            declared.add(LYRICS_TYPES.WORD);
        }
        return declared;
    }

    function getKaraokeLineSyllables(line) {
        const syllables = [];
        if (Array.isArray(line?.syllables)) syllables.push(...line.syllables);
        if (Array.isArray(line?.vocals?.lead?.syllables)) syllables.push(...line.vocals.lead.syllables);
        if (Array.isArray(line?.vocals?.background)) {
            line.vocals.background.forEach(part => {
                if (Array.isArray(part?.syllables)) syllables.push(...part.syllables);
            });
        }
        return syllables;
    }

    function inferKaraokeGranularity(result) {
        const explicit = normalizeKaraokeGranularity(
            result?.karaokeGranularity
            || result?.karaokeTimingType
            || result?.karaokeType
        );
        if (explicit) return explicit;

        const source = String(result?.karaokeSource || '').trim().toLowerCase();
        if (source === 'sync-data' || source === 'ivlyrics-sync') {
            return LYRICS_TYPES.CHARACTER;
        }
        if (source === 'lrclib-lyricsfile' || source === 'lyricsplus') {
            return LYRICS_TYPES.WORD;
        }

        let singleCharacterUnits = 0;
        let multiCharacterUnits = 0;
        for (const line of (Array.isArray(result?.karaoke) ? result.karaoke : [])) {
            for (const syllable of getKaraokeLineSyllables(line)) {
                const text = String(syllable?.text || '').trim();
                if (!text) continue;
                const characterCount = Array.from(text).length;
                if (characterCount <= 1) singleCharacterUnits++;
                else multiCharacterUnits++;
            }
        }

        // A word-timed source normally exposes several multi-character tokens.
        // Keep borderline/CJK data in character mode unless multi-character units
        // clearly dominate; this avoids turning real per-character sync into a
        // coarse renderer because of one punctuation or whitespace token.
        if (multiCharacterUnits > 0
            && multiCharacterUnits >= Math.max(2, Math.ceil(singleCharacterUnits * 0.35))) {
            return LYRICS_TYPES.WORD;
        }
        return LYRICS_TYPES.CHARACTER;
    }

    function applyKaraokeGranularity(result, forcedGranularity = '') {
        if (!result || typeof result !== 'object' || !hasLyricsContent(result.karaoke)) {
            return result;
        }
        const granularity = normalizeKaraokeGranularity(forcedGranularity)
            || inferKaraokeGranularity(result);
        const karaoke = result.karaoke.map(line => (
            line && typeof line === 'object' && line.karaokeGranularity !== granularity
                ? { ...line, karaokeGranularity: granularity }
                : line
        ));
        return {
            ...result,
            karaoke,
            karaokeGranularity: granularity
        };
    }

    function decodeInstrumentalBreakEntities(value) {
        if (window.ivLyricsInstrumentalBreaks?.decodeEntities) {
            return window.ivLyricsInstrumentalBreaks.decodeEntities(value);
        }
        return String(value ?? '')
            .replace(/&lt;|&#0*60;|&#x0*3c;/giu, '<')
            .replace(/&gt;|&#0*62;|&#x0*3e;/giu, '>')
            .replace(/&nbsp;|&#0*160;|&#x0*a0;/giu, ' ');
    }

    function getInstrumentalBreakMarker(value) {
        if (window.ivLyricsInstrumentalBreaks?.getMarker) {
            return window.ivLyricsInstrumentalBreaks.getMarker(value);
        }
        const normalized = decodeInstrumentalBreakEntities(value).trim();
        if (!normalized) return null;
        if (NOTE_INSTRUMENTAL_BREAK_CHARACTER_PATTERN.test(normalized)
            && NOTE_ONLY_INSTRUMENTAL_BREAK_PATTERN.test(normalized)) {
            return CANONICAL_INSTRUMENTAL_BREAK_MARKER;
        }

        const wrapped = normalized.match(/^[<＜〈《]\s*(.*?)\s*[>＞〉》]$/u);
        if (!wrapped) return null;

        const label = wrapped[1].normalize('NFKC').trim();
        return NOTE_INSTRUMENTAL_BREAK_CHARACTER_PATTERN.test(label)
            && NOTE_ONLY_INSTRUMENTAL_BREAK_PATTERN.test(label)
            ? CANONICAL_INSTRUMENTAL_BREAK_MARKER
            : null;
    }

    function getSyllableText(syllables) {
        return Array.isArray(syllables)
            ? syllables.map((syllable) => syllable?.text || '').join('')
            : '';
    }

    function getLineInstrumentalBreakMarker(line) {
        const directTexts = [line?.originalText, line?.text]
            .filter((value) => decodeInstrumentalBreakEntities(value).trim());
        if (directTexts.length > 0) {
            return directTexts.every((value) => getInstrumentalBreakMarker(value))
                ? CANONICAL_INSTRUMENTAL_BREAK_MARKER
                : null;
        }

        const syllableText = getSyllableText(line?.syllables);
        if (syllableText.trim()) {
            return getInstrumentalBreakMarker(syllableText);
        }

        const vocalParts = [
            line?.vocals?.lead,
            ...(Array.isArray(line?.vocals?.background) ? line.vocals.background : [])
        ].filter((part) => part && (
            decodeInstrumentalBreakEntities(part.text).trim()
            || getSyllableText(part.syllables).trim()
        ));
        if (vocalParts.length === 0) return null;

        return vocalParts.every((part) => (
            getInstrumentalBreakMarker(part.text)
            || getInstrumentalBreakMarker(getSyllableText(part.syllables))
        ))
            ? CANONICAL_INSTRUMENTAL_BREAK_MARKER
            : null;
    }

    function toFiniteLyricsTime(value) {
        const numeric = Number(value);
        return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
    }

    function getLyricsDurationMs(info) {
        for (const value of [info?.durationMs, info?.duration_ms, info?.duration]) {
            const duration = toFiniteLyricsTime(value);
            if (duration !== null && duration > 0) return duration;
        }
        return null;
    }

    function normalizeInstrumentalBreakSyllables(syllables, marker, startTime, endTime) {
        if (!Array.isArray(syllables) || syllables.length === 0) {
            return { syllables, changed: false };
        }

        const first = syllables[0];
        const last = syllables[syllables.length - 1];
        const syllableStart = startTime ?? toFiniteLyricsTime(first?.startTime);
        const syllableEnd = endTime ?? toFiniteLyricsTime(last?.endTime);
        const normalizedSyllable = {
            ...first,
            text: marker
        };
        if (syllableStart !== null) {
            normalizedSyllable.startTime = syllableStart;
        }
        if (syllableEnd !== null && (syllableStart === null || syllableEnd > syllableStart)) {
            normalizedSyllable.endTime = syllableEnd;
        }

        const isAlreadyNormalized = syllables.length === 1
            && first?.text === normalizedSyllable.text
            && first?.startTime === normalizedSyllable.startTime
            && first?.endTime === normalizedSyllable.endTime;
        return {
            syllables: isAlreadyNormalized ? syllables : [normalizedSyllable],
            changed: !isAlreadyNormalized
        };
    }

    function normalizeInstrumentalVocalPart(part, startTime, endTime) {
        if (!part || typeof part !== 'object') {
            return { part, changed: false };
        }

        const marker = getInstrumentalBreakMarker(part.text)
            || getInstrumentalBreakMarker(getSyllableText(part.syllables));
        if (!marker) return { part, changed: false };

        const normalizedSyllables = normalizeInstrumentalBreakSyllables(
            part.syllables,
            marker,
            startTime,
            endTime
        );
        const textChanged = part.text !== marker;
        if (!textChanged && !normalizedSyllables.changed) {
            return { part, changed: false };
        }

        return {
            part: {
                ...part,
                text: marker,
                ...(normalizedSyllables.changed ? { syllables: normalizedSyllables.syllables } : {})
            },
            changed: true
        };
    }

    function normalizeInstrumentalBreakLines(lines, durationMs, timed) {
        if (!Array.isArray(lines)) return { lines, changed: false };

        let changed = false;
        const normalizedLines = lines.map((line, index) => {
            if (!line || typeof line !== 'object') return line;

            const startTime = toFiniteLyricsTime(line.startTime);
            const marker = getLineInstrumentalBreakMarker(line);
            if (!marker) return line;

            const nextStartTime = toFiniteLyricsTime(lines[index + 1]?.startTime);
            const directEndTime = toFiniteLyricsTime(line.endTime);
            const resolvedEndTime = timed && startTime !== null
                ? (
                    nextStartTime !== null && nextStartTime > startTime
                        ? nextStartTime
                        : (directEndTime !== null && directEndTime > startTime
                            ? directEndTime
                            : (durationMs !== null && durationMs > startTime ? durationMs : null))
                )
                : null;
            const textChanged = line.text !== marker
                || (line.originalText !== undefined && line.originalText !== marker);
            const endTimeChanged = resolvedEndTime !== null && line.endTime !== resolvedEndTime;
            const lineSyllableMarker = getInstrumentalBreakMarker(getSyllableText(line.syllables));
            const normalizedSyllables = lineSyllableMarker
                ? normalizeInstrumentalBreakSyllables(
                    line.syllables,
                    lineSyllableMarker,
                    startTime,
                    resolvedEndTime
                )
                : { syllables: line.syllables, changed: false };
            const normalizedLead = normalizeInstrumentalVocalPart(
                line.vocals?.lead,
                startTime,
                resolvedEndTime
            );
            const normalizedBackground = Array.isArray(line.vocals?.background)
                ? line.vocals.background.map((part) => (
                    normalizeInstrumentalVocalPart(part, startTime, resolvedEndTime)
                ))
                : [];
            const backgroundChanged = normalizedBackground.some((entry) => entry.changed);
            const vocalsChanged = normalizedLead.changed || backgroundChanged;
            if (!textChanged && !endTimeChanged && !normalizedSyllables.changed && !vocalsChanged) {
                return line;
            }

            changed = true;
            const normalizedLine = {
                ...line,
                text: marker,
                ...(normalizedSyllables.changed ? { syllables: normalizedSyllables.syllables } : {})
            };
            if (line.originalText !== undefined) {
                normalizedLine.originalText = marker;
            }
            if (resolvedEndTime !== null) {
                normalizedLine.endTime = resolvedEndTime;
            }
            if (vocalsChanged) {
                normalizedLine.vocals = {
                    ...line.vocals,
                    ...(normalizedLead.changed ? { lead: normalizedLead.part } : {}),
                    ...(backgroundChanged
                        ? { background: normalizedBackground.map((entry) => entry.part) }
                        : {})
                };
            }
            return normalizedLine;
        });

        return {
            lines: changed ? normalizedLines : lines,
            changed
        };
    }

    function normalizeProviderInstrumentalBreaks(result, info = {}) {
        if (!result || typeof result !== 'object') {
            return { result, changed: false };
        }

        const durationMs = getLyricsDurationMs(info);
        const normalizedResult = { ...result };
        let changed = false;

        for (const type of [LYRICS_TYPES.KARAOKE, LYRICS_TYPES.SYNCED, LYRICS_TYPES.UNSYNCED]) {
            const normalized = normalizeInstrumentalBreakLines(
                result[type],
                durationMs,
                type !== LYRICS_TYPES.UNSYNCED
            );
            if (normalized.changed) {
                normalizedResult[type] = normalized.lines;
                changed = true;
            }
        }

        return {
            result: changed ? normalizedResult : result,
            changed
        };
    }

    function getLyricsAddonIdForSyncProvider(providerValue) {
        const providerId = typeof providerValue === 'string'
            ? providerValue.trim().toLowerCase()
            : '';
        if (!providerId) return '';
        if (providerId === 'legacy' || providerId === 'spotify' || providerId.startsWith('spotify-')) {
            return 'spotify';
        }
        return providerId;
    }

    function getSyncProviderId(entry) {
        return typeof entry === 'string' ? entry : entry?.provider;
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
            this._activeLyricsSearchProgress = new Map();
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

        _getLyricsSearchProgressKey(uri, forcedProviderId = null) {
            return `${String(uri || '')}::${forcedProviderId || 'auto'}`;
        }

        _publishLyricsSearchProgress(info, forcedProviderId, detail = {}) {
            const uri = String(info?.uri || '');
            if (!uri) return null;

            const progress = {
                ...detail,
                uri,
                forcedProviderId: forcedProviderId || null
            };
            this._activeLyricsSearchProgress.set(
                this._getLyricsSearchProgressKey(uri, forcedProviderId),
                progress
            );
            this.emit('lyrics:search:progress', progress);
            return progress;
        }

        getActiveLyricsSearchProgress(uri, forcedProviderId = null) {
            const progress = this._activeLyricsSearchProgress.get(
                this._getLyricsSearchProgressKey(uri, forcedProviderId)
            );
            return progress ? { ...progress } : null;
        }

        replayActiveLyricsSearchProgress(uri, forcedProviderId = null) {
            const progress = this.getActiveLyricsSearchProgress(uri, forcedProviderId);
            if (!progress) return null;
            const replayedProgress = { ...progress, replayed: true };
            this.emit('lyrics:search:progress', replayedProgress);
            return replayedProgress;
        }

        clearActiveLyricsSearchProgress(uri, forcedProviderId = null) {
            this._activeLyricsSearchProgress.delete(
                this._getLyricsSearchProgressKey(uri, forcedProviderId)
            );
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
            let order = parseStoredProviderOrder(STORAGE_PREFIX + 'provider-order');

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

            // 기본 제공자는 품질과 안정성을 고려한 고정 순서를 사용하고,
            // 마켓플레이스 등에서 추가된 제공자는 등록 순서대로 뒤에 붙인다.
            const defaultIds = DEFAULT_PROVIDER_ORDER.filter(id => allAddonIds.includes(id));
            const defaultIdSet = new Set(defaultIds);
            return [
                ...defaultIds,
                ...allAddonIds.filter(id => !defaultIdSet.has(id))
            ];
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
            if (stored === 'true') return true;
            if (stored === 'false') return false;
            return this._addons.get(addonId)?.defaultEnabled !== false;
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
         * OpenDB에 sync-data가 등록된 가사 제공자를 곡별로 우선할지 여부.
         * 저장값이 없는 기존 사용자도 기능을 바로 사용할 수 있도록 기본값은 true다.
         */
        isPreferSyncDataProviderEnabled() {
            const configValue = window.CONFIG?.visual?.[PREFER_SYNC_DATA_PROVIDER_SETTING];
            if (configValue !== undefined && configValue !== null) {
                return configValue !== false && configValue !== 'false';
            }

            const storedValue = getStoredValue(PREFER_SYNC_DATA_PROVIDER_STORAGE_KEY);
            return storedValue !== false && storedValue !== 'false';
        }

        setPreferSyncDataProviderEnabled(enabled) {
            const nextValue = enabled !== false;
            if (window.CONFIG?.visual) {
                window.CONFIG.visual[PREFER_SYNC_DATA_PROVIDER_SETTING] = nextValue;
            }
            if (window.StorageManager?.saveConfig) {
                window.StorageManager.saveConfig(PREFER_SYNC_DATA_PROVIDER_SETTING, nextValue);
            } else {
                setStoredValue(PREFER_SYNC_DATA_PROVIDER_STORAGE_KEY, nextValue ? 'true' : 'false');
            }

            this.emit('provider:sync-data-priority:changed', { enabled: nextValue });
            this._triggerLyricsRefresh();
        }

        /**
         * 모든 제공자의 글자 단위 가사를 먼저 찾고, 이후 단어/줄/일반 가사를
         * 같은 제공자 우선순위로 탐색할지 여부. 새 설치의 기본값은 true다.
         */
        isPreferLyricsTypeOverProviderOrderEnabled() {
            const configValue = window.CONFIG?.visual?.[PREFER_LYRICS_TYPE_OVER_PROVIDER_ORDER_SETTING];
            if (configValue !== undefined && configValue !== null) {
                return configValue !== false && configValue !== 'false';
            }

            const storedValue = getStoredValue(PREFER_LYRICS_TYPE_OVER_PROVIDER_ORDER_STORAGE_KEY);
            return storedValue !== false && storedValue !== 'false';
        }

        setPreferLyricsTypeOverProviderOrderEnabled(enabled) {
            const nextValue = enabled !== false;
            if (window.CONFIG?.visual) {
                window.CONFIG.visual[PREFER_LYRICS_TYPE_OVER_PROVIDER_ORDER_SETTING] = nextValue;
            }
            if (window.StorageManager?.saveConfig) {
                window.StorageManager.saveConfig(PREFER_LYRICS_TYPE_OVER_PROVIDER_ORDER_SETTING, nextValue);
            } else {
                setStoredValue(PREFER_LYRICS_TYPE_OVER_PROVIDER_ORDER_STORAGE_KEY, nextValue ? 'true' : 'false');
            }

            this.emit('provider:lyrics-type-priority:changed', { enabled: nextValue });
            this._triggerLyricsRefresh();
        }

        async _getAvailableSyncDataProviderIds(trackId, trackIsrc, info) {
            if (!trackIsrc || !window.SyncDataService?.getAvailableProviders) {
                return new Set();
            }

            try {
                const syncProviders = await window.SyncDataService.getAvailableProviders(trackId, {
                    ...info,
                    isrc: trackIsrc
                });
                if (!Array.isArray(syncProviders)) return new Set();

                return new Set(
                    syncProviders
                        .map(entry => getLyricsAddonIdForSyncProvider(getSyncProviderId(entry)))
                        .filter(Boolean)
                );
            } catch (error) {
                console.warn('[LyricsAddonManager] Failed to read available sync-data providers:', error);
                return new Set();
            }
        }

        /**
         * OpenDB의 ISRC 인덱스에 현재 곡의 sync-data가 있으면 해당 가사 제공자들을
         * 사용자 지정 순서 안에서 안정적으로 앞으로 이동한다. 저장된 전역 순서는 바꾸지 않는다.
         */
        async _prioritizeProvidersWithSyncData(providers, trackId, trackIsrc, info, syncDataProviderIds = null) {
            if (!Array.isArray(providers) || providers.length < 2) return providers;
            if (!trackIsrc || !this.isPreferSyncDataProviderEnabled()) return providers;
            if (!window.SyncDataService?.getAvailableProviders) return providers;

            try {
                const preferredAddonIds = syncDataProviderIds instanceof Set
                    ? syncDataProviderIds
                    : await this._getAvailableSyncDataProviderIds(trackId, trackIsrc, info);
                if (preferredAddonIds.size === 0) return providers;

                const lrclibPreferred = [];
                const preferred = [];
                const remaining = [];
                for (const provider of providers) {
                    const addonId = getLyricsAddonIdForSyncProvider(provider?.id);
                    const typeSettings = this._getProviderTypeSettings(provider);
                    if (typeSettings[LYRICS_TYPES.CHARACTER] !== false && preferredAddonIds.has(addonId)) {
                        if (addonId === LRCLIB_PROVIDER_ID) {
                            lrclibPreferred.push(provider);
                        } else {
                            preferred.push(provider);
                        }
                    } else {
                        remaining.push(provider);
                    }
                }

                if (lrclibPreferred.length === 0 && preferred.length === 0) return providers;
                const prioritizedProviders = [...lrclibPreferred, ...preferred, ...remaining];
                console.info('[ivLyrics sync-data]', 'LyricsAddonManager:provider-priority', {
                    isrc: trackIsrc,
                    syncProviders: Array.from(preferredAddonIds),
                    configuredOrder: providers.map(provider => provider.id),
                    attemptOrder: prioritizedProviders.map(provider => provider.id)
                });
                return prioritizedProviders;
            } catch (error) {
                console.warn('[LyricsAddonManager] Failed to prioritize providers with sync-data:', error);
                return providers;
            }
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

        _getProviderTypeSettings(provider) {
            const legacyKaraoke = this.getAddonSetting(provider.id, 'enable_karaoke', null);
            const karaokeFallback = legacyKaraoke === null || legacyKaraoke === undefined
                ? true
                : legacyKaraoke !== false;
            const declaredGranularities = getDeclaredKaraokeGranularities(provider);
            const hasNativeCharacterLyrics = declaredGranularities.has(LYRICS_TYPES.CHARACTER)
                || (declaredGranularities.size === 0 && provider?.supports?.karaoke === true);
            return {
                [LYRICS_TYPES.CHARACTER]: hasNativeCharacterLyrics
                    ? this.getAddonSetting(provider.id, 'enable_character', karaokeFallback) !== false
                    : true,
                [LYRICS_TYPES.WORD]: this.getAddonSetting(
                    provider.id,
                    'enable_word',
                    karaokeFallback
                ) !== false,
                [LYRICS_TYPES.SYNCED]: this.getAddonSetting(provider.id, 'enable_synced', true) !== false,
                [LYRICS_TYPES.UNSYNCED]: this.getAddonSetting(provider.id, 'enable_unsynced', true) !== false
            };
        }

        _canProviderParticipateInType(provider, lyricsType, typeSettings, syncDataProviderIds) {
            if (!typeSettings?.[lyricsType]) return false;

            if (KARAOKE_GRANULARITIES.has(lyricsType)) {
                const addonId = getLyricsAddonIdForSyncProvider(provider?.id);
                const hasKnownSyncData = syncDataProviderIds instanceof Set
                    && syncDataProviderIds.has(addonId);
                if (lyricsType === LYRICS_TYPES.CHARACTER && hasKnownSyncData) {
                    return true;
                }
                const declaredGranularities = getDeclaredKaraokeGranularities(provider);
                return declaredGranularities.size > 0
                    ? declaredGranularities.has(lyricsType)
                    : provider?.supports?.karaoke === true;
            }

            return provider?.supports?.[lyricsType] === true;
        }

        _isPseudoKaraoke(result) {
            const source = result?.karaokeSource;
            if (!source) return false;
            return window.PseudoKaraokeService?.isPseudoSource?.(source) === true
                || PSEUDO_KARAOKE_SOURCES.has(source);
        }

        _selectProviderCandidateForType(candidate, lyricsType) {
            if (!candidate) return null;

            if (lyricsType === LYRICS_TYPES.CHARACTER) {
                return candidate.hasCharacterKaraoke && !candidate.isPseudoKaraoke
                    ? { ...candidate.result }
                    : null;
            }

            if (lyricsType === LYRICS_TYPES.WORD) {
                return candidate.hasWordKaraoke && !candidate.isPseudoKaraoke
                    ? { ...candidate.result }
                    : null;
            }

            if (lyricsType === LYRICS_TYPES.SYNCED) {
                const hasSyncedGradeResult = candidate.hasSynced
                    || (candidate.hasKaraoke && candidate.isPseudoKaraoke);
                if (!hasSyncedGradeResult) return null;
                const result = { ...candidate.result };
                if (candidate.hasKaraoke && !candidate.isPseudoKaraoke) {
                    result.karaoke = null;
                    result.karaokeSource = null;
                }
                return result;
            }

            if (lyricsType === LYRICS_TYPES.UNSYNCED && candidate.hasUnsynced) {
                return {
                    ...candidate.result,
                    karaoke: null,
                    karaokeSource: null,
                    synced: null
                };
            }

            return null;
        }

        _finalizeLyricsFetch(result, info, providerId, selectionPolicy, selectionType) {
            const finalResult = {
                ...result,
                providerSelectionPolicy: selectionPolicy,
                providerSelectionType: selectionType
            };
            const hasKaraoke = hasLyricsContent(finalResult.karaoke);
            const hasSynced = hasLyricsContent(finalResult.synced);
            const hasUnsynced = hasLyricsContent(finalResult.unsynced);
            const selectedProvider = finalResult.provider || providerId;

            if (window.AddonDebug?.isEnabled()) {
                window.AddonDebug.timeEnd('lyrics', 'getLyrics:total');
                window.AddonDebug.log('lyrics', 'getLyrics success', {
                    provider: selectedProvider,
                    selectionPolicy,
                    selectionType,
                    hasKaraoke,
                    hasSynced,
                    hasUnsynced,
                    syncDataApplied: finalResult.syncDataApplied || false
                });
            }

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

            return finalResult;
        }

        async _loadProviderCandidate(provider, info, context, typeSettings) {
            const { lyricsCacheId, trackId, trackIsrc } = context;
            const allowCharacter = typeSettings[LYRICS_TYPES.CHARACTER];
            const allowWord = typeSettings[LYRICS_TYPES.WORD];
            const allowKaraoke = allowCharacter || allowWord;
            const allowSynced = typeSettings[LYRICS_TYPES.SYNCED];
            const allowUnsynced = typeSettings[LYRICS_TYPES.UNSYNCED];

            if (!allowKaraoke && !allowSynced && !allowUnsynced) {
                window.__ivLyricsDebugLog?.(`[LyricsAddonManager] All lyrics types disabled for ${provider.id}, skipping`);
                return null;
            }

            window.__ivLyricsDebugLog?.(`[LyricsAddonManager] Trying provider: ${provider.id}`);
            window.__ivLyricsDebugLog?.(`[LyricsAddonManager] User settings for ${provider.id}: character=${allowCharacter}, word=${allowWord}, synced=${allowSynced}, unsynced=${allowUnsynced}`);

            let result = null;
            let cacheHit = false;
            let providerFetched = false;
            let syncDataAppliedThisCall = false;
            let pseudoKaraokeChanged = false;
            let instrumentalBreaksNormalized = false;
            const debugTiming = window.AddonDebug?.isEnabled();
            if (debugTiming) {
                window.AddonDebug.time('lyrics', `provider:${provider.id}`);
            }

            try {
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
                    } catch (error) {
                        console.warn(`[LyricsAddonManager] Cache lookup failed for ${provider.id}:`, error);
                    }
                }

                if (!result) {
                    result = await provider.getLyrics(info);
                    providerFetched = true;
                }
            } finally {
                if (debugTiming) {
                    window.AddonDebug.timeEnd('lyrics', `provider:${provider.id}`);
                }
            }

            if (!result || result.error) {
                window.__ivLyricsDebugLog?.(`[LyricsAddonManager] Provider ${provider.id} returned error:`, result?.error);
                return null;
            }

            const normalizedInstrumentalBreaks = normalizeProviderInstrumentalBreaks(result, info);
            result = normalizedInstrumentalBreaks.result;
            instrumentalBreaksNormalized = normalizedInstrumentalBreaks.changed;

            // Cached timing data intentionally contains anonymous contributor
            // placeholders. Rehydrate only the current identity metadata from
            // the server; an offline failure safely keeps those placeholders.
            const hasRedactedContributorIdentity = cacheHit
                && result.syncDataApplied
                && Array.isArray(result.contributors)
                && result.contributors.some((contributor) => (
                    contributor
                    && typeof contributor === 'object'
                    && contributor.identityRedacted === true
                ));
            if (hasRedactedContributorIdentity && (trackId || trackIsrc) && window.SyncDataService?.getSyncData) {
                try {
                    const syncProvider = result.syncDataProvider || result.provider || provider.id;
                    const refreshedSyncData = await window.SyncDataService.getSyncData(trackId, syncProvider, {
                        ...info,
                        isrc: trackIsrc,
                        forceContributorRefresh: true
                    });
                    if (refreshedSyncData) {
                        result = {
                            ...result,
							...(Array.isArray(refreshedSyncData.contributors)
								? { contributors: refreshedSyncData.contributors }
								: {}),
							syncType: refreshedSyncData.syncType || result.syncType || 'unknown',
							syncPoints: Number(refreshedSyncData.syncPoints ?? result.syncPoints ?? 2),
							syncTypeBreakdown: refreshedSyncData.syncTypeBreakdown || result.syncTypeBreakdown || null
                        };
                    }
                } catch (error) {
                    console.warn('[LyricsAddonManager] Failed to refresh contributor privacy metadata:', error);
                }
            }

            result = applyKaraokeGranularity(result);
            const resultHasKaraoke = hasLyricsContent(result.karaoke);
            const resultKaraokeGranularity = resultHasKaraoke
                ? inferKaraokeGranularity(result)
                : '';
            const resultHasCharacterKaraoke = resultHasKaraoke
                && resultKaraokeGranularity === LYRICS_TYPES.CHARACTER;
            const resultHasSynced = hasLyricsContent(result.synced);
            const resultHasUnsynced = hasLyricsContent(result.unsynced);
            const needsCharacterKaraoke = allowCharacter && (
                !resultHasCharacterKaraoke
                || this._isPseudoKaraoke(result)
            );
            const hasBaseLyrics = resultHasSynced || resultHasUnsynced;
            const shouldApplyRegisteredSyncData = needsCharacterKaraoke && hasBaseLyrics;

            window.__ivLyricsDebugLog?.(`[LyricsAddonManager] Got lyrics from: ${provider.id}`, {
                hasKaraoke: resultHasKaraoke,
                hasSynced: resultHasSynced,
                hasUnsynced: resultHasUnsynced,
                provider: result.provider
            });
            console.info('[ivLyrics sync-data]', 'LyricsAddonManager:sync-check', {
                providerId: provider.id,
                resultProvider: result.provider || null,
                shouldApplyRegisteredSyncData,
                allowCharacter,
                allowWord,
                hasKaraoke: resultHasKaraoke,
                karaokeGranularity: resultKaraokeGranularity || null,
                hasSynced: resultHasSynced,
                hasUnsynced: resultHasUnsynced,
                needsCharacterKaraoke,
                hasBaseLyrics,
                isrc: trackIsrc || null,
                hasSyncDataService: !!window.SyncDataService?.getSyncData
            });

            if (shouldApplyRegisteredSyncData) {
                if ((trackId || trackIsrc) && window.SyncDataService?.getSyncData) {
                    try {
                        const syncProvider = result.provider || provider.id;
                        const syncData = await window.SyncDataService.getSyncData(trackId, syncProvider, {
                            ...info,
                            isrc: trackIsrc
                        });

                        if (syncData?.syncData) {
                            const baseLyrics = resultHasSynced ? result.synced : result.unsynced;
                            const karaoke = window.SyncDataService.applySyncDataToLyrics(baseLyrics, syncData, {
                                durationMs: info.durationMs || info.duration_ms || info.duration,
                                trackInfo: info,
                                result
                            });

                            if (hasLyricsContent(karaoke)) {
                                result.karaoke = karaoke;
                                result.karaokeSource = 'sync-data';
                                result.karaokeGranularity = LYRICS_TYPES.CHARACTER;
                                delete result.pseudoKaraokeCacheVersion;
                                result.syncDataApplied = true;
                                result.syncDataProvider = syncProvider;
                                result.syncDataRendererVersion = SYNC_DATA_RENDERER_VERSION;
								result.syncType = syncData.syncType || 'unknown';
								result.syncPoints = Number(syncData.syncPoints ?? 2);
								result.syncTypeBreakdown = syncData.syncTypeBreakdown || null;
                                syncDataAppliedThisCall = true;

                                if (syncData.contributors || syncData.syncData?.contributors) {
                                    result.contributors = syncData.contributors || syncData.syncData.contributors;
                                }
                                if (window.SyncDataService.convertKaraokeToSynced) {
                                    const syncedFromKaraoke = window.SyncDataService.convertKaraokeToSynced(karaoke);
                                    if (hasLyricsContent(syncedFromKaraoke)) {
                                        result.synced = syncedFromKaraoke;
                                    }
                                }
                            }
                        }
                    } catch (error) {
                        console.warn('[LyricsAddonManager] Failed to get sync-data:', error);
                    }
                } else if (window.LyricsService?.applyIvLyricsSyncData) {
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
                        }
                    } catch (error) {
                        console.warn('[LyricsAddonManager] Failed to apply legacy sync data:', error);
                    }
                }
            }

            if (allowKaraoke && window.PseudoKaraokeService?.applyToResult) {
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
                } catch (error) {
                    console.warn('[LyricsAddonManager] Failed to apply pseudo karaoke:', error);
                }
            }

            // Sync-data and pseudo-karaoke can rebuild line objects after the
            // provider result was normalized. Normalize once more at the final
            // boundary so every provider and lyric type keeps the same marker.
            const finalInstrumentalBreaks = normalizeProviderInstrumentalBreaks(result, info);
            result = applyKaraokeGranularity(finalInstrumentalBreaks.result);
            instrumentalBreaksNormalized = instrumentalBreaksNormalized
                || finalInstrumentalBreaks.changed;

            const finalResult = { ...result };
            if (finalResult.syncDataApplied) {
                finalResult.syncDataRendererVersion = SYNC_DATA_RENDERER_VERSION;
            }
            const finalKaraokeGranularity = hasLyricsContent(finalResult.karaoke)
                ? inferKaraokeGranularity(finalResult)
                : '';
            const karaokeGranularityAllowed = finalKaraokeGranularity === LYRICS_TYPES.CHARACTER
                ? allowCharacter
                : finalKaraokeGranularity === LYRICS_TYPES.WORD
                    ? allowWord
                    : false;
            if (!allowKaraoke || !karaokeGranularityAllowed) {
                finalResult.karaoke = null;
                finalResult.karaokeGranularity = null;
            }
            if (!allowSynced) finalResult.synced = null;
            if (!allowUnsynced) finalResult.unsynced = null;

            const hasKaraoke = hasLyricsContent(finalResult.karaoke);
            const hasCharacterKaraoke = hasKaraoke
                && finalKaraokeGranularity === LYRICS_TYPES.CHARACTER;
            const hasWordKaraoke = hasKaraoke
                && finalKaraokeGranularity === LYRICS_TYPES.WORD;
            const hasSynced = hasLyricsContent(finalResult.synced);
            const hasUnsynced = hasLyricsContent(finalResult.unsynced);
            const isPseudoKaraoke = hasKaraoke && this._isPseudoKaraoke(finalResult);

            window.__ivLyricsDebugLog?.(`[LyricsAddonManager] After filtering for ${provider.id}:`, {
                hasKaraoke,
                karaokeGranularity: hasKaraoke ? finalKaraokeGranularity : null,
                hasSynced,
                hasUnsynced,
                isPseudoKaraoke
            });

            const shouldUpdateCache = (!cacheHit && providerFetched)
                || syncDataAppliedThisCall
                || pseudoKaraokeChanged
                || instrumentalBreaksNormalized;
            if (
                (hasKaraoke || hasSynced || hasUnsynced)
                && lyricsCacheId
                && window.LyricsService?.cacheLyrics
                && !result.skipCache
                && shouldUpdateCache
            ) {
                const cachePayload = { ...result };
                if (cachePayload.syncDataApplied) {
                    cachePayload.syncDataRendererVersion = SYNC_DATA_RENDERER_VERSION;
                }
                delete cachePayload.skipCache;
                window.LyricsService.cacheLyrics(lyricsCacheId, provider.id, cachePayload);
            }

            return {
                provider,
                result: finalResult,
                hasKaraoke,
                hasCharacterKaraoke,
                hasWordKaraoke,
                hasSynced,
                hasUnsynced,
                isPseudoKaraoke
            };
        }

        /**
         * 가사를 가져온다. 품질 우선 옵션에서는 각 제공자를 한 번만 요청하며,
         * 글자 → 단어 → 줄 → 일반 단계 안에서 사용자 지정 제공자 순서를 유지한다.
         */
        async getLyrics(info, forcedProviderId = null) {
            this.clearActiveLyricsSearchProgress(info?.uri, forcedProviderId);
            const trackId = window.LyricsService?.extractTrackId?.(info.uri)
                || window.ivLyricsTrackIdentity?.extractTrackId?.(info.uri)
                || '';
            const lyricsCacheId = trackId || (info?.uri ? `local-uri:${info.uri}` : '');
            const allEnabledProviders = this.getEnabledProviders();
            const availableProviders = trackId
                ? allEnabledProviders
                : allEnabledProviders.filter(provider => provider.supportsLocalTracks === true);
            let enabledProviders = forcedProviderId
                ? availableProviders.filter(provider => provider.id === forcedProviderId)
                : availableProviders;
            const typePriorityEnabled = !forcedProviderId
                && this.isPreferLyricsTypeOverProviderOrderEnabled();
            if (enabledProviders.length > 0) {
                const forcedProvider = forcedProviderId ? enabledProviders[0] : null;
                this._publishLyricsSearchProgress(info, forcedProviderId, {
                    stage: forcedProvider ? 'provider' : 'sync-data',
                    lyricsType: forcedProvider ? null : LYRICS_TYPES.CHARACTER,
                    providerId: forcedProvider?.id || 'ivlyrics-sync',
                    providerName: forcedProvider?.name || 'ivLyrics Sync',
                    attempt: forcedProvider ? 1 : 0
                });
            }
            const trackIsrc = (trackId ? await window.SyncDataService?.resolveTrackIsrc?.(trackId, info) : null)
                || window.SyncDataService?.getTrackIsrc?.(trackId, info)
                || window.SyncDataService?.normalizeSyncDataIsrc?.(info?.isrc || info?.external_ids?.isrc || info?.externalIds?.isrc);
            const shouldReadSyncDataProviders = !forcedProviderId
                && !!trackIsrc
                && (typePriorityEnabled || this.isPreferSyncDataProviderEnabled());
            const syncDataProviderIds = shouldReadSyncDataProviders
                ? await this._getAvailableSyncDataProviderIds(trackId, trackIsrc, info)
                : new Set();

            if (!forcedProviderId) {
                enabledProviders = await this._prioritizeProvidersWithSyncData(
                    enabledProviders,
                    trackId,
                    trackIsrc,
                    info,
                    syncDataProviderIds
                );
            }

            const typeSelectionPolicy = typePriorityEnabled
                ? PROVIDER_SELECTION_POLICIES.TYPE_FIRST
                : PROVIDER_SELECTION_POLICIES.PROVIDER_FIRST;
            const selectionPolicy = `${typeSelectionPolicy}:${
                this.isPreferSyncDataProviderEnabled()
                    ? 'sync-data-first'
                    : 'configured-order'
            }`;
            console.info('[ivLyrics sync-data]', 'LyricsAddonManager:getLyrics:start', {
                uri: info.uri,
                trackId,
                resolvedIsrc: trackIsrc || null,
                forcedProviderId,
                selectionPolicy,
                syncDataProviders: Array.from(syncDataProviderIds),
                enabledProviders: enabledProviders.map(provider => provider.id)
            });

            if (window.AddonDebug?.isEnabled()) {
                window.AddonDebug.log('lyrics', 'getLyrics called', {
                    uri: info.uri,
                    title: info.title,
                    artist: info.artist,
                    providers: enabledProviders.map(provider => provider.id),
                    forcedProviderId,
                    selectionPolicy
                });
                window.AddonDebug.time('lyrics', 'getLyrics:total');
            }

            this.emit('lyrics:fetch:start', {
                uri: info.uri,
                title: info.title,
                artist: info.artist,
                selectionPolicy
            });

            if (enabledProviders.length === 0) {
                const error = {
                    error: forcedProviderId ? 'Selected lyrics provider is not available' : 'No lyrics providers enabled',
                    uri: info.uri,
                    provider: forcedProviderId || null
                };
                console.warn('[LyricsAddonManager]', error.error, forcedProviderId || '');
                this.emit('lyrics:fetch:error', {
                    ...error,
                    reason: forcedProviderId ? 'provider_unavailable' : 'no_providers'
                });
                this.clearActiveLyricsSearchProgress(info.uri, forcedProviderId);
                return error;
            }

            const context = { lyricsCacheId, trackId, trackIsrc };
            const typeSettingsByProvider = new Map(
                enabledProviders.map(provider => [provider.id, this._getProviderTypeSettings(provider)])
            );
            const providerAttempts = new Map();
            const loadProviderOnce = async (provider, lyricsType = null) => {
                if (providerAttempts.has(provider.id)) {
                    return providerAttempts.get(provider.id);
                }

                const attemptDetail = {
                    uri: info.uri || '',
                    providerId: provider.id,
                    providerName: provider.name || provider.id,
                    attempt: providerAttempts.size + 1,
                    selectionPolicy,
                    stage: 'provider',
                    lyricsType
                };
                this._publishLyricsSearchProgress(info, forcedProviderId, attemptDetail);
                this.emit('lyrics:provider:attempt', attemptDetail);

                let candidate = null;
                try {
                    candidate = await this._loadProviderCandidate(
                        provider,
                        info,
                        context,
                        typeSettingsByProvider.get(provider.id)
                    );
                } catch (error) {
                    console.warn(`[LyricsAddonManager] Provider ${provider.id} failed:`, error);
                    if (window.AddonDebug?.isEnabled()) {
                        window.AddonDebug.error('lyrics', `Provider ${provider.id} error`, error);
                    }
                }
                providerAttempts.set(provider.id, candidate);
                return candidate;
            };

            if (typePriorityEnabled) {
                for (const lyricsType of LYRICS_TYPE_PRIORITY_ORDER) {
                    window.__ivLyricsDebugLog?.(`[LyricsAddonManager] Starting lyrics type phase: ${lyricsType}`);
                    for (const provider of enabledProviders) {
                        const typeSettings = typeSettingsByProvider.get(provider.id);
                        const existingCandidate = providerAttempts.get(provider.id);
                        const hasAllowedPseudoSyncedFallback = lyricsType === LYRICS_TYPES.SYNCED
                            && (
                                typeSettings?.[LYRICS_TYPES.CHARACTER]
                                || typeSettings?.[LYRICS_TYPES.WORD]
                            )
                            && existingCandidate?.hasKaraoke
                            && existingCandidate?.isPseudoKaraoke;
                        if (!hasAllowedPseudoSyncedFallback && !this._canProviderParticipateInType(
                            provider,
                            lyricsType,
                            typeSettings,
                            syncDataProviderIds
                        )) {
                            continue;
                        }

                        const candidate = await loadProviderOnce(provider, lyricsType);
                        const selectedResult = this._selectProviderCandidateForType(candidate, lyricsType);
                        if (selectedResult) {
                            const finalResult = this._finalizeLyricsFetch(
                                selectedResult,
                                info,
                                provider.id,
                                selectionPolicy,
                                lyricsType
                            );
                            this.clearActiveLyricsSearchProgress(info.uri, forcedProviderId);
                            return finalResult;
                        }
                    }
                }
            } else {
                for (const provider of enabledProviders) {
                    const candidate = await loadProviderOnce(provider, null);
                    if (!candidate) continue;

                    const selectionType = candidate.hasCharacterKaraoke
                        ? LYRICS_TYPES.CHARACTER
                        : candidate.hasWordKaraoke
                            ? LYRICS_TYPES.WORD
                            : candidate.hasSynced
                                ? LYRICS_TYPES.SYNCED
                                : candidate.hasUnsynced
                                    ? LYRICS_TYPES.UNSYNCED
                                    : null;
                    if (selectionType) {
                        const finalResult = this._finalizeLyricsFetch(
                            candidate.result,
                            info,
                            provider.id,
                            selectionPolicy,
                            selectionType
                        );
                        this.clearActiveLyricsSearchProgress(info.uri, forcedProviderId);
                        return finalResult;
                    }
                }
            }

            if (window.AddonDebug?.isEnabled()) {
                window.AddonDebug.timeEnd('lyrics', 'getLyrics:total');
                window.AddonDebug.warn('lyrics', 'No lyrics found from any provider');
            }

            const errorResult = { error: 'No lyrics found', uri: info.uri };
            this.emit('lyrics:fetch:error', { ...errorResult, reason: 'not_found', selectionPolicy });
            this.clearActiveLyricsSearchProgress(info.uri, forcedProviderId);
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
