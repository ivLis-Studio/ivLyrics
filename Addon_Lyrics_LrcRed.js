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
    const CACHE_VERSION = '2026-11-10-lrcred-5';
    const ATTRIBUTION = 'Lyrics from lrc.red (https://lrc.red).';
    const REQUEST_TIMEOUT_MS = 15000;

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

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    const fetchWithTimeout = async (url, init = {}) => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        try {
            const response = await fetch(url, {
                ...init,
                signal: controller.signal,
                headers: {
                    'Accept': 'application/json, application/ttml+xml, text/plain, */*',
                    ...init.headers,
                },
            });
            return response;
        } finally {
            clearTimeout(timeoutId);
        }
    };

    const normalizeString = (str) => String(str || '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const similarity = (a, b) => {
        const na = normalizeString(a);
        const nb = normalizeString(b);
        if (!na || !nb) return 0;
        const longer = na.length >= nb.length ? na : nb;
        const shorter = na.length >= nb.length ? nb : na;
        if (longer.length === 0) return 1;
        let matches = 0;
        for (let i = 0; i < shorter.length; i++) {
            if (longer.includes(shorter[i])) matches++;
        }
        return matches / Math.max(longer.length, 1);
    };

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

    const ISRC_PATTERN = /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/;

    const normalizeIsrc = (value) => {
        const isrc = String(value || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
        return ISRC_PATTERN.test(isrc) ? isrc : '';
    };

    const resolveIsrcFromInfo = (info) => {
        const playerItem = (typeof Spicetify !== 'undefined' && Spicetify?.Player?.data?.item) || null;
        const candidates = [
            info?.isrc,
            info?.external_ids?.isrc,
            info?.externalIds?.isrc,
            info?.external_id?.isrc,
            info?.metadata?.isrc,
            info?.metadata?.external_ids?.isrc,
            info?.track?.isrc,
            info?.track?.external_ids?.isrc,
            playerItem?.isrc,
            playerItem?.external_ids?.isrc,
            playerItem?.externalIds?.isrc,
            playerItem?.metadata?.isrc,
        ];
        for (const candidate of candidates) {
            const isrc = normalizeIsrc(candidate);
            if (isrc) return isrc;
        }
        return '';
    };

    const resolveTrackIsrc = async (info) => {
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

    const getTtmlLyrics = async (isrc) => {
        const url = `https://lrc.red/s/${encodeURIComponent(isrc)}.ttml`;
        const response = await fetchWithTimeout(url);
        if (!response.ok) throw new Error(`TTML fetch failed (${response.status})`);
        return response.text();
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

    // ================================================================================
    // Addon
    // ================================================================================

    const LrcRedLyricsAddon = {
        ...ADDON_INFO,

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
                    let searchData = null;
                    for (const query of buildSearchQueries(title, artist)) {
                        const data = await searchTracks(query).catch(() => null);
                        if (data && Array.isArray(data.hits) && data.hits.length > 0) {
                            searchData = data;
                            window.__ivLyricsDebugLog?.('[lrc.red Lyrics Addon] Search hit', { query, hits: data.hits.length });
                            break;
                        }
                    }
                    if (!searchData) {
                        result.error = 'No lyrics';
                        return result;
                    }

                    for (const hit of searchData.hits) {
                        const titleSim = similarity(hit.title, title);
                        const artistSim = similarity(hit.artist, artist);
                        const combinedSim = (titleSim * 0.6) + (artistSim * 0.4);

                        let durationScore = 0;
                        if (durationSeconds > 0 && hit.duration) {
                            const diff = Math.abs(durationSeconds - Number(hit.duration));
                            durationScore = Math.max(0, 1 - diff / 30);
                        }

                        const score = combinedSim * 0.7 + durationScore * 0.3;

                        if (score > bestScore) {
                            bestScore = score;
                            bestHit = hit;
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

                let ttml = null;
                try {
                    ttml = await getTtmlLyrics(isrc);
                } catch (ttmlError) {
                    window.__ivLyricsDebugLog?.('[lrc.red Lyrics Addon] TTML failed, trying LRC', { isrc, error: ttmlError.message });
                    try {
                        const lrc = await getLrcLyrics(isrc);
                        const parsed = normalizeParsedLyrics(
                            parseLrcLyrics(stripEnhancedLrcTags(lrc), durationSeconds * 1000)
                        );
                        result.synced = parsed.synced.length ? parsed.synced : null;
                        result.karaoke = parsed.karaoke.length ? parsed.karaoke : null;
                        result.unsynced = parsed.unsynced ? parsed.unsynced : null;
                        if (result.karaoke) result.karaokeSource = 'lrcred';
                        result.lrcred = {
                            id: isrc,
                            isrc,
                            title: bestHit.title,
                            artist: bestHit.artist,
                            album: bestHit.album || null,
                            duration: bestHit.duration ?? null,
                            syncType: 'line',
                            sourceUrl: `https://lrc.red/s/${isrc}`,
                        };
                        if (!result.karaoke && !result.synced && !result.unsynced) {
                            result.error = 'No usable lyrics';
                        }
                        return result;
                    } catch (lrcError) {
                        result.error = 'No lyrics';
                        return result;
                    }
                }

                const parsed = normalizeParsedLyrics(parseTtmlLyrics(ttml, durationSeconds * 1000));
                result.karaoke = parsed.karaoke.length ? parsed.karaoke : null;
                result.synced = parsed.synced.length ? parsed.synced : null;
                result.unsynced = parsed.unsynced ? parsed.unsynced : null;
                if (result.karaoke) result.karaokeSource = 'lrcred';
                result.lrcred = {
                    id: isrc,
                    isrc,
                    title: bestHit.title,
                    artist: bestHit.artist,
                    album: bestHit.album || null,
                    duration: bestHit.duration ?? null,
                    syncType: result.karaoke ? 'word' : 'line',
                    lines: parsed.synced.length,
                    sourceUrl: `https://lrc.red/s/${isrc}`,
                };

                if (!result.karaoke && !result.synced && !result.unsynced) {
                    result.error = 'No usable lyrics';
                }

                window.__ivLyricsDebugLog?.('[lrc.red Lyrics Addon] Loaded lyrics', {
                    isrc,
                    karaokeLines: result.karaoke?.length || 0,
                    syncedLines: result.synced?.length || 0,
                    unsyncedLines: Array.isArray(result.unsynced) ? result.unsynced.length : 0,
                });
                return result;
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
