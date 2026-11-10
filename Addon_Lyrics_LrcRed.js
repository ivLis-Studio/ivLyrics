/**
 * ================================================================================
 * lrc.red Lyrics Provider Addon
 * ================================================================================
 *
 * 이 파일은 lrc.red(https://lrc.red) 가사 데이터베이스에서
 * 가사를 검색하고 가져오는 Spicetify 애드온입니다.
 *
 * 【주요 기능】
 * - lrc.red 검색 API를 통한 구조화 검색(제목 + 가수)
 * - ISRC 기반 가사 상세 조회 및 TTML/LRC 가사 파싱
 * - 단어 수준 타이밍을 활용한 노래방/싱크/일반 가사 지원
 * - 네트워크 오류 시 자동 재시도 및 폴백
 *
 * 【검색 전략】
 * - /search.json?q={title} {artist} 검색 후 후보 매칭
 * - 제목/아티스트 유사도와 duration 기반으로 최적 후보 선택
 * - /s/{isrc}.ttml 우선 파싱, 실패 시 /s/{isrc}.lrc 폴백
 *
 * @addon-type lyrics        - 가사 제공자 타입의 애드온
 * @id lrcred               - 고유 식별자
 * @name lrc.red            - 표시 이름
 * @version 1.0.0           - 버전 정보
 * @author default          - 제작자
 * @default-enabled false   - 기본 비활성화 (신규 커뮤니티 소스)
 * @supports karaoke: true  - 단어 수준 노래방 모드 지원
 * @supports synced: true   - 시간 동기화된 가사 지원
 * @supports unsynced: true - 시간 동기화 없는 일반 가사 지원
 */

(() => {
    'use strict';

    const API_BASE = 'https://lrc.red';
    const CACHE_VERSION = '2026-11-11-lrcred-auto-sync-1';
    const ATTRIBUTION = 'Lyrics from lrc.red (https://lrc.red).';
    const REQUEST_TIMEOUT_MS = 15000;
    const SYNC_TIMEOUT_MS = 75000;
    const SYNC_RETRY_MS = 10 * 60 * 1000;
    const CLIENT_ID = 'ivLyrics (+https://github.com/ivLis-Studio/ivLyrics; mailto:me@ivl.is)';

    function lyricsText(key, fallback, params) {
        const path = `settings.lyricsProviders.${key}`;
        const value = window.I18n?.t?.(path, params);
        if (value && value !== path) return value;
        return params ? String(fallback).replace(/\{(\w+)\}/g, (match, name) => params[name] ?? match) : fallback;
    }

    const ADDON_INFO = {
        id: 'lrcred',
        name: 'lrc.red',
        author: 'default',
        version: '1.0.0',
        cacheVersion: CACHE_VERSION,
        description: {
            ko: 'lrc.red 가사 데이터베이스를 사용하는 읽기 전용 제공자',
            en: 'Read-only provider backed by the lrc.red lyrics database',
            ja: 'lrc.redの歌詞データベースを使用する読み取り専用プロバイダー',
            'zh-CN': '基于 lrc.red 歌词数据库的只读提供商',
            'zh-TW': '採用 lrc.red 歌詞資料庫的唯讀供應商',
            hi: 'lrc.red गीत डेटाबेस पर आधारित रीड-ओनली प्रदाता',
            es: 'Proveedor de solo lectura basado en la base de datos de letras de lrc.red',
            fr: 'Fournisseur en lecture seule reposant sur la base de données de paroles lrc.red',
            ar: 'موفّر للقراءة فقط يعتمد على قاعدة بيانات كلمات الأغاني من lrc.red',
            fa: 'ارائه‌دهنده فقط‌خواندنی مبتنی بر پایگاه داده متن آهنگ lrc.red',
            de: 'Schreibgeschützter Anbieter auf Basis der lrc.red Songtext-Datenbank',
            ru: 'Провайдер только для чтения на базе базы данных текстов песен lrc.red',
            sv: 'Skrivskyddad leverantör som bygger på lrc.reds låttextdatabas',
            pt: 'Provedor somente leitura baseado no banco de dados de letras do lrc.red',
            bn: 'lrc.red গান ডেটাবেস-ভিত্তিক শুধু-পঠনযোগ্য প্রদানকারী',
            cs: 'Poskytovatel pouze pro čtení založený na databázi textů písní lrc.red',
            it: 'Provider di sola lettura basato sul database di testi di lrc.red',
            th: 'ผู้ให้บริการแบบอ่านอย่างเดียวที่ใช้ฐานข้อมูลเนื้อเพลงของ lrc.red',
            vi: 'Nhà cung cấp chỉ đọc dựa trên cơ sở dữ liệu lời bài hát của lrc.red',
            id: 'Penyedia hanya-baca berbasis database lirik lrc.red',
            ms: 'Penyedia baca sahaja yang disokong oleh pangkalan data lirik lrc.red',
            tr: 'lrc.red şarkı sözü veritabanını kullanan salt okunur sağlayıcı'
        },
        supports: {
            karaoke: true,
            karaokeCharacter: true,
            karaokeWord: true,
            synced: true,
            unsynced: true
        },
        supportsLocalTracks: true,
        defaultEnabled: false,
        icon: 'M2 11a9 9 0 1 0 9-9 9 9 0 0 0-9 9m-1 0h18V7H1zm12-4a1 1 0 1 1 2 0v5h1.586l-2.293-2.293a1 1 0 0 1 1.414-1.414l4 4a1 1 0 0 1 0 1.414l-4 4a1 1 0 0 1-1.414-1.414L11.586 13H11v-5z'
    };

    // ================================================================================
    // Helpers
    // ================================================================================

    const fetchWithTimeout = async (url, init = {}, timeoutMs = REQUEST_TIMEOUT_MS, read = response => response) => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetch(url, {
                ...init,
                signal: controller.signal,
                headers: {
                    'Accept': 'application/json, application/ttml+xml, text/plain, */*',
                    // The sync route does not implement OPTIONS. Keep its
                    // bodyless POST a simple CORS request; identify all reads.
                    ...(init.method === 'POST' ? {} : { 'X-Client-ID': CLIENT_ID }),
                    ...init.headers,
                },
            });
            return await read(response);
        } finally {
            clearTimeout(timeoutId);
        }
    };

    const normalizeString = (str) => String(str || '')
        .normalize('NFKC')
        .toLowerCase()
        // Fold Latin accents without dropping Japanese voicing or marks in
        // other scripts. Canonical spellings still compare identically.
        .normalize('NFD')
        .replace(/(\p{Script=Latin})\p{M}+/gu, '$1')
        .normalize('NFC')
        .replace(/['’‘`´]/g, '')
        .replace(/[^\p{L}\p{N}\p{M}]+/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const normalizeDurationSeconds = (info) => {
        const duration = Number(info?.durationMs ?? info?.duration_ms ?? info?.duration ?? 0);
        if (!Number.isFinite(duration) || duration <= 0) return 0;
        return duration > 10000 ? Math.round(duration / 1000) : Math.round(duration);
    };

    // lrc.red's search is literal: a title containing phrases such as
    // "Taylor's Version" or "(From The Vault)" can return zero hits even when
    // the song exists. Retry with progressively simpler queries.
    const stripTitleDecorations = (title) => String(title || '')
        .replace(/\s*[([][^)\]]*[)\]]/g, ' ')
        .replace(/\s+-\s+.*$/, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const buildSearchQueries = (title, artist) => {
        const baseTitle = stripTitleDecorations(title) || title;
        const queries = [];
        const push = (value) => {
            const query = String(value || '').replace(/\s+/g, ' ').trim();
            if (query && !queries.includes(query)) queries.push(query);
        };
        push(`${title} ${artist}`);
        push(title);
        push(`${baseTitle} ${artist}`);
        push(baseTitle);
        return queries;
    };

    const titleMatchScore = (actual, expected) => {
        const compact = (value) => normalizeString(value).replace(/ /g, '');
        const wanted = compact(expected);
        if (!wanted || !compact(actual)) return 0;
        if (compact(actual) === wanted) return 1;
        // Query simplification can remove any subtitle, but identity matching
        // may ignore only known version labels, never e.g. "Song (Part II)".
        const versionLabel = /\b(?:feat(?:uring)?|ft|version|remaster(?:ed)?|remix|mix|edit|edition|live|acoustic|mono|stereo)\b|\bfrom the vault\b/i;
        const core = (value) => compact(String(value || '')
            .replace(/\(([^()]*)\)|\[([^\[\]]*)\]/g,
                (whole, parentheses, brackets) => versionLabel.test(parentheses ?? brackets) ? ' ' : whole)
            .replace(/\s+-\s+(.+)$/, (whole, suffix) => versionLabel.test(suffix) ? '' : whole));
        const wantedCore = core(expected);
        const actualCore = core(actual);
        return wantedCore && actualCore === wantedCore ? 0.9 : 0;
    };

    const sameArtist = (actual, expected) => {
        const wanted = normalizeString(expected);
        const candidate = normalizeString(actual);
        if (!wanted || !candidate) return false;
        if (candidate === wanted) return true;
        // A catalog may include featured artists where Spotify supplies only
        // the lead. Do not accept arbitrary substrings such as tribute acts.
        const lead = (value) => normalizeString(String(value || '').split(
            /\s+(?:feat(?:uring)?\.?|ft\.?|with|[x×])\s+|[,;&]/iu
        )[0]);
        return Boolean(lead(expected)) && lead(actual) === lead(expected);
    };

    const scoreSearchHit = (hit, info, durationSeconds) => {
        const titleScore = titleMatchScore(hit?.title, info?.title);
        if (!normalizeIsrc(hit?.isrc) || !titleScore || !sameArtist(hit?.artist, info?.artist)) return null;
        const candidateDuration = Number(hit.duration);
        const durationScore = durationSeconds > 0 && candidateDuration > 0
            ? Math.max(0, 1 - Math.abs(durationSeconds - candidateDuration) / 30)
            : 0;
        // Duration ranks only candidates already identified as the same song.
        return titleScore * 0.6 + 0.3 + durationScore * 0.1;
    };

    const ISRC_PATTERN = /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/;

    const normalizeIsrc = (value) => {
        const isrc = String(value || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
        return ISRC_PATTERN.test(isrc) ? isrc : '';
    };

    const resolveIsrcFromInfo = (info) => {
        const candidates = [
            info?.isrc,
            info?.external_ids?.isrc,
            info?.externalIds?.isrc,
            info?.external_id?.isrc,
            info?.metadata?.isrc,
            info?.metadata?.external_ids?.isrc,
            info?.track?.isrc,
            info?.track?.external_ids?.isrc,
            info?.track?.externalIds?.isrc,
            info?.track?.metadata?.isrc,
            info?.item?.external_ids?.isrc,
            info?.item?.metadata?.isrc,
        ];
        for (const candidate of candidates) {
            const isrc = normalizeIsrc(candidate);
            if (isrc) return isrc;
        }
        return '';
    };

    const resolveTrackIsrc = async (info) => {
        // Player metadata can belong to a different song during prefetch or
        // a local-file lookup. The shared resolver guards that track identity.
        const direct = resolveIsrcFromInfo(info);
        if (direct) return direct;

        const trackId = String(info?.trackId || '').trim()
            || window.LyricsService?.extractTrackId?.(info?.uri)
            || window.ivLyricsTrackIdentity?.extractTrackId?.(info?.uri)
            || '';
        if (!trackId || typeof window.SyncDataService?.resolveTrackIsrc !== 'function') return '';

        try {
            return normalizeIsrc(await window.SyncDataService.resolveTrackIsrc(trackId, info));
        } catch {
            return '';
        }
    };

    // ================================================================================
    // lrc.red API
    // ================================================================================

    const searchTracks = async (query) => {
        const url = `https://lrc.red/search.json?q=${encodeURIComponent(query)}`;
        const response = await fetchWithTimeout(url);
        if (!response.ok) throw new Error(`Search failed (${response.status})`);
        return response.json();
    };

    const getTrackByIsrc = async (isrc) => {
        const url = `https://lrc.red/s/${encodeURIComponent(isrc)}.json`;
        const response = await fetchWithTimeout(url);
        if (!response.ok) throw new Error(`Track lookup failed (${response.status})`);
        return response.json();
    };

    const getTtmlLyrics = async (isrc, fresh = false) => {
        const url = `https://lrc.red/s/${encodeURIComponent(isrc)}.ttml${fresh ? `?t=${Date.now()}` : ''}`;
        return fetchWithTimeout(url, fresh ? { cache: 'no-store' } : {}, REQUEST_TIMEOUT_MS, async response => {
            if (!response.ok) throw new Error(`TTML fetch failed (${response.status})`);
            return response.text();
        });
    };

    const getLrcLyrics = async (isrc) => {
        const url = `https://lrc.red/s/${encodeURIComponent(isrc)}.lrc`;
        const response = await fetchWithTimeout(url);
        if (!response.ok) throw new Error(`LRC fetch failed (${response.status})`);
        return response.text();
    };

    // ================================================================================
    // Lyrics parsers (shared with the Unison addon)
    // ================================================================================

    const getSharedLyricsParser = () => window.ivLyricsLyricsParser || window.__ivLyricsUnisonDebug;

    const parseTtmlLyrics = (ttml, durationMs) => {
        const parser = getSharedLyricsParser();
        if (typeof parser?.parseTtmlLyrics !== 'function') {
            throw new Error('Shared TTML parser unavailable');
        }
        return parser.parseTtmlLyrics(ttml, durationMs);
    };

    const parseLrcLyrics = (lrc, durationMs) => {
        const parser = getSharedLyricsParser();
        if (typeof parser?.parseLrcLyrics !== 'function') {
            throw new Error('Shared LRC parser unavailable');
        }
        return parser.parseLrcLyrics(lrc, durationMs);
    };

    // lrc.red's LRC carries word timing as enhanced tags such as
    // "<00:35.91>". The shared LRC parser only consumes "[mm:ss.xx]" line
    // stamps, so unstripped tags would render as literal lyric text.
    const stripEnhancedLrcTags = (lrc) => String(lrc || '')
        .replace(/<(?:\d{1,3}:)?\d{1,2}:\d{1,2}(?:[.:]\d{1,3})?>/g, '');

    const normalizeParsedLyrics = (parsed) => {
        const karaoke = Array.isArray(parsed?.karaoke) ? parsed.karaoke : [];
        const synced = Array.isArray(parsed?.synced) ? parsed.synced : [];
        const unsynced = Array.isArray(parsed?.unsynced) && parsed.unsynced.length
            ? parsed.unsynced
            : synced.map(line => ({ text: line.text }));
        return { karaoke, synced, unsynced };
    };

    const withParsedLyrics = (result, parsed) => ({
        ...result,
        karaoke: parsed.karaoke.length ? parsed.karaoke : null,
        synced: parsed.synced.length ? parsed.synced : null,
        unsynced: parsed.unsynced.length ? parsed.unsynced : null,
        karaokeSource: parsed.karaoke.length ? 'lrcred' : null,
        error: parsed.karaoke.length || parsed.synced.length || parsed.unsynced.length ? null : 'No usable lyrics',
        lrcred: { ...result.lrcred, syncType: parsed.karaoke.length ? 'word' : 'line', lines: parsed.synced.length },
    });

    const wordSyncEnabled = () => {
        const manager = window.LyricsAddonManager;
        if (manager?.isProviderEnabled?.('lrcred') === false) return false;
        const legacy = manager?.getAddonSetting?.('lrcred', 'enable_karaoke', true) !== false;
        return manager?.getAddonSetting?.('lrcred', 'enable_word', legacy) !== false;
    };
    const sameLyricsLines = (left, right) => {
        const text = result => (result.synced?.length ? result.synced : result.unsynced || [])
            .map(line => String(line.originalText ?? line.text ?? '').normalize('NFC').trim()).filter(Boolean);
        const a = text(left), b = text(right);
        return a.length > 0 && a.length === b.length && a.every((line, index) => line === b[index]);
    };
    const cacheIdFor = info => window.LyricsService?.extractTrackId?.(info?.uri)
        || window.ivLyricsTrackIdentity?.extractTrackId?.(info?.uri)
        || (info?.uri ? `local-uri:${info.uri}` : '');

    // One generation at a time, at most four pending recordings. Repeated
    // playback, prefetch and cache lookups share the same job and cooldown.
    const wordSyncJobs = new Map();
    const wordSyncDeliveries = new Map();
    let syncQueue = Promise.resolve();
    let pendingSyncs = 0;
    let syncUnavailableUntil = 0;
    let wordSyncSequence = 0;

    const publishWordSyncStatus = (job, uri, phase) => {
        window.LyricsAddonManager?.emit?.('lyrics:word-sync:status', {
            uri, requestId: job.id, phase,
        });
    };

    const requestWordSync = (isrc, durationMs, checkFresh, info) => {
        const existing = wordSyncJobs.get(isrc);
        if (existing && (!existing.settled || Date.now() < existing.retryAt)) {
            if (!existing.uris.has(info.uri)) {
                existing.uris.add(info.uri);
                if (!existing.settled && existing.phase === 'generating') publishWordSyncStatus(existing, info.uri, 'generating');
            }
            return existing;
        }
        if (pendingSyncs >= 4 || Date.now() < syncUnavailableUntil) return null;
        wordSyncJobs.delete(isrc);
        for (const [key, job] of wordSyncJobs) {
            if (wordSyncJobs.size < 32) break;
            if (job.settled) wordSyncJobs.delete(key);
        }
        const job = {
            id: `lrcred-${++wordSyncSequence}`, uris: new Set([info.uri]), finishedUris: new Set(), phase: 'queued',
            settled: false, retryAt: Infinity, parsed: null, promise: null,
        };
        pendingSyncs++;
        job.promise = syncQueue.then(async () => {
            if (Date.now() < syncUnavailableUntil || !wordSyncEnabled()) return null;
            // A persisted line-only result may predate another client's sync.
            // Read the current TTML before spending another generation on it.
            if (checkFresh) {
                try {
                    const current = normalizeParsedLyrics(parseTtmlLyrics(await getTtmlLyrics(isrc, true), durationMs));
                    if (current.karaoke.length) return current;
                } catch { /* A missing/invalid TTML can still be generated. */ }
            }
            job.phase = 'generating';
            for (const uri of job.uris) publishWordSyncStatus(job, uri, 'generating');
            await fetchWithTimeout(`${API_BASE}/s/${encodeURIComponent(isrc)}/sync`, { method: 'POST' }, SYNC_TIMEOUT_MS, response => {
                if (!response.ok) {
                    if (response.status === 429 || response.status === 503) {
                        const retryAfter = response.headers?.get?.('Retry-After');
                        const seconds = Number(retryAfter);
                        const retryAt = retryAfter && !Number.isFinite(seconds) ? Date.parse(retryAfter) : Date.now() + (seconds || 0) * 1000;
                        syncUnavailableUntil = Math.max(Date.now() + SYNC_RETRY_MS, retryAt || 0);
                    }
                    throw new Error(`Word sync failed (${response.status})`);
                }
            });
            const parsed = normalizeParsedLyrics(parseTtmlLyrics(await getTtmlLyrics(isrc, true), durationMs));
            return parsed.karaoke.length ? parsed : null;
        }).catch(error => {
            window.__ivLyricsDebugLog?.('[lrc.red Lyrics Addon] Automatic word sync unavailable', { isrc, error: error.message });
            return null;
        }).then(parsed => {
            job.parsed = parsed;
            job.settled = true;
            job.retryAt = Date.now() + (parsed ? 60 * 60 * 1000 : SYNC_RETRY_MS);
            pendingSyncs--;
            return parsed;
        });
        syncQueue = job.promise;
        wordSyncJobs.set(isrc, job);
        return job;
    };

    const refreshSyncedTrack = (info, upgraded, attempts = 0) => {
        const playerItem = typeof Spicetify !== 'undefined' ? Spicetify.Player?.data?.item : null;
        const container = window.lyricContainer;
        const state = container?.state;
        if (!wordSyncEnabled() || playerItem?.uri !== info.uri || state?.uri !== info.uri || typeof container.applyLyricsTimingUpgrade !== 'function') return;
        // A quick generation may finish before the original fetch is displayed.
        if (state.isLoading) {
            if (attempts < 200) setTimeout(() => refreshSyncedTrack(info, upgraded, attempts + 1), 100);
            return;
        }
        const hasRealKaraoke = state.karaoke?.length && !window.PseudoKaraokeService?.isPseudoSource?.(state.karaokeSource);
        if (state.provider !== 'lrcred' || state.syncDataApplied || hasRealKaraoke) return;
        container.applyLyricsTimingUpgrade(upgraded);
    };

    const queueWordSync = (info, result, checkFresh = false) => {
        const isrc = normalizeIsrc(result.lrcred?.isrc);
        if (!wordSyncEnabled() || !isrc || result.karaoke?.length || result.syncDataApplied || result.error) return;
        const job = requestWordSync(isrc, normalizeDurationSeconds(info) * 1000, checkFresh, info);
        const deliveryKey = `${info.uri}:${isrc}`;
        if (!job || wordSyncDeliveries.get(deliveryKey) === job) return;
        wordSyncDeliveries.set(deliveryKey, job);
        while (wordSyncDeliveries.size > 64) wordSyncDeliveries.delete(wordSyncDeliveries.keys().next().value);
        job.promise.then(async parsed => {
            let completed = false;
            try {
                if (!parsed || !sameLyricsLines(result, parsed)) return;
                const upgraded = { ...withParsedLyrics(result, parsed), karaokeGranularity: 'word' };
                const cacheId = cacheIdFor(info);
                if (cacheId) await window.LyricsService?.cacheLyrics?.(cacheId, 'lrcred', upgraded);
                refreshSyncedTrack(info, upgraded);
                completed = true;
            } catch (error) {
                window.__ivLyricsDebugLog?.('[lrc.red Lyrics Addon] Could not cache word sync', { error: error.message });
            } finally {
                job.finishedUris.add(info.uri);
                if (job.phase === 'generating') publishWordSyncStatus(job, info.uri, completed ? 'complete' : 'failed');
            }
        });
    };

    // ================================================================================
    // Addon
    // ================================================================================

    const LrcRedLyricsAddon = {
        ...ADDON_INFO,

        // Only the manager may authorize generation after every enabled
        // provider has failed to supply real karaoke lyrics.
        requestWordSync(info, result) {
            queueWordSync(info, result, true);
        },

        getWordSyncStatuses(uri) {
            if (!wordSyncEnabled()) return [];
            return [...wordSyncJobs.values()]
                .filter(job => job.phase === 'generating' && job.uris.has(uri) && !job.finishedUris.has(uri))
                .map(job => ({ uri, requestId: job.id, phase: 'generating' }));
        },

        async prepareLyricsLookup(info) {
            if (!wordSyncEnabled()) return;
            const cacheId = cacheIdFor(info);
            if (!cacheId) return;
            const cached = await window.LyricsService?.getCachedLyrics?.(cacheId, 'lrcred');
            if (!cached || cached.cacheVersion !== CACHE_VERSION) return;
            const ready = wordSyncJobs.get(normalizeIsrc(cached.lrcred?.isrc))?.parsed;
            if (ready && sameLyricsLines(cached, ready) && !cached.karaoke?.length && !cached.syncDataApplied) {
                await window.LyricsService?.cacheLyrics?.(cacheId, 'lrcred', { ...withParsedLyrics(cached, ready), karaokeGranularity: 'word' });
            }
        },

        getSettingsUI() {
            const React = Spicetify.React;
            return function LrcRedLyricsSettings() {
                return React.createElement('div', { className: 'ai-addon-settings lrcred-settings' },
                    React.createElement('div', { className: 'ai-addon-setting', style: { marginTop: '16px' } },
                        React.createElement('div', { className: 'ai-addon-info-box' },
                            React.createElement('p', { style: { fontWeight: 700, marginBottom: '8px' } }, 'lrc.red'),
                            React.createElement('p', { style: { marginBottom: '8px' } }, lyricsText('attribution', ATTRIBUTION, { source: 'lrc.red' })),
                            React.createElement('a', {
                                href: 'https://lrc.red',
                                target: '_blank',
                                rel: 'noreferrer'
                            }, 'lrc.red')
                        )
                    )
                );
            };
        },

        async getLyrics(info) {
            const result = {
                uri: info?.uri || '',
                provider: ADDON_INFO.id,
                cacheVersion: CACHE_VERSION,
                karaoke: null,
                synced: null,
                unsynced: null,
                karaokeSource: null,
                copyright: ATTRIBUTION,
                error: null,
            };

            const title = String(info?.title || '').trim();
            const artist = String(info?.artist || '').trim();
            if (!title || !artist) {
                result.error = 'Missing track metadata';
                return result;
            }

            const durationSeconds = normalizeDurationSeconds(info);

            try {
                window.__ivLyricsDebugLog?.('[lrc.red Lyrics Addon] Searching', { title, artist });

                let bestHit = null;
                let bestScore = -1;

                const resolvedIsrc = await resolveTrackIsrc(info);
                if (resolvedIsrc) {
                    try {
                        const trackData = await getTrackByIsrc(resolvedIsrc);
                        if (trackData && (trackData.title || trackData.isrc)) {
                            bestHit = {
                                isrc: trackData.isrc || resolvedIsrc,
                                title: trackData.title || title,
                                artist: trackData.artist || artist,
                                album: trackData.album || null,
                                duration: trackData.duration ?? null,
                            };
                            window.__ivLyricsDebugLog?.('[lrc.red Lyrics Addon] ISRC match', { isrc: resolvedIsrc });
                        }
                    } catch (isrcError) {
                        window.__ivLyricsDebugLog?.('[lrc.red Lyrics Addon] ISRC lookup failed, falling back to search', {
                            isrc: resolvedIsrc,
                            error: isrcError.message,
                        });
                    }
                }

                if (!bestHit) {
                    for (const query of buildSearchQueries(title, artist)) {
                        const data = await searchTracks(query).catch(() => null);
                        for (const hit of Array.isArray(data?.hits) ? data.hits : []) {
                            const score = scoreSearchHit(hit, info, durationSeconds);
                            if (score !== null && score > bestScore) {
                                bestScore = score;
                                bestHit = { ...hit, isrc: normalizeIsrc(hit.isrc) };
                            }
                        }
                        if (bestHit) {
                            window.__ivLyricsDebugLog?.('[lrc.red Lyrics Addon] Search hit', { query, hits: data.hits.length });
                            break;
                        }
                    }
                }

                if (!bestHit) {
                    result.error = 'No lyrics';
                    return result;
                }

                const isrc = bestHit.isrc;
                if (!isrc) {
                    result.error = 'No lyrics';
                    return result;
                }

                window.__ivLyricsDebugLog?.('[lrc.red Lyrics Addon] Selected hit', {
                    isrc,
                    title: bestHit.title,
                    artist: bestHit.artist,
                    score: bestScore,
                    duration: bestHit.duration,
                });

                let parsed;
                try {
                    parsed = normalizeParsedLyrics(parseTtmlLyrics(await getTtmlLyrics(isrc), durationSeconds * 1000));
                    if (!parsed.karaoke.length && !parsed.synced.length && !parsed.unsynced.length) throw new Error('Empty TTML');
                } catch (ttmlError) {
                    window.__ivLyricsDebugLog?.('[lrc.red Lyrics Addon] TTML failed, trying LRC', { isrc, error: ttmlError.message });
                    try {
                        const lrc = await getLrcLyrics(isrc);
                        parsed = normalizeParsedLyrics(
                            parseLrcLyrics(stripEnhancedLrcTags(lrc), durationSeconds * 1000)
                        );
                    } catch (lrcError) {
                        result.error = 'No lyrics';
                        return result;
                    }
                }

                const ready = wordSyncJobs.get(isrc)?.parsed;
                if (ready && sameLyricsLines(parsed, ready)) parsed = ready;
                result.lrcred = {
                    id: isrc,
                    isrc,
                    title: bestHit.title,
                    artist: bestHit.artist,
                    album: bestHit.album || null,
                    duration: bestHit.duration ?? null,
                    sourceUrl: `https://lrc.red/s/${isrc}`,
                };
                const finalResult = withParsedLyrics(result, parsed);

                window.__ivLyricsDebugLog?.('[lrc.red Lyrics Addon] Loaded lyrics', {
                    isrc,
                    karaokeLines: finalResult.karaoke?.length || 0,
                    syncedLines: finalResult.synced?.length || 0,
                    unsyncedLines: finalResult.unsynced?.length || 0,
                });
                return finalResult;
            } catch (error) {
                const timedOut = error?.name === 'AbortError';
                result.error = timedOut ? 'Request timed out' : (error?.message || 'Request error');
                console.warn('[lrc.red Lyrics Addon] Failed to load lyrics:', error);
                return result;
            }
        },
    };

    const registerAddon = () => {
        if (window.LyricsAddonManager) {
            window.LyricsAddonManager.register(LrcRedLyricsAddon);
        } else {
            setTimeout(registerAddon, 100);
        }
    };

    window.LrcRedLyricsAddon = LrcRedLyricsAddon;
    registerAddon();
    window.__ivLyricsDebugLog?.('[lrc.red Lyrics Addon] Module loaded');
})();
