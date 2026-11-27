import { createRuntimeDebugLogger } from "#ivlyrics/spicetify/runtimeDebug.mjs";
import { readTrackIdentityService } from "../../core/trackIdentity.mjs";
/**
 * LyricsPlus Lyrics Provider Addon
 *
 * The API origins are stored as double-Base64 literals and decoded only when
 * a request is built. The provider consumes LyricsPlus v2 JSON converted from
 * source TTML and exposes karaoke, line-synced, and plain lyrics to ivLyrics.
 *
 * @addon-type lyrics
 * @id lyricsplus
 * @name LyricsPlus
 * @version 1.0.0
 * @author default
 * @supports karaoke: true
 * @supports synced: true
 * @supports unsynced: true
 */

import { getRuntimeService } from "../../spicetify/runtimeServices.mjs";
import { createProviderText } from "../providerText.mjs";
import { registerLyricsAddon } from "./lyricsAddonRegistration.mjs";

import { normalizeDurationMs } from "./lyricsPlusInput.mjs";
import { createLyricsPlusTransport, decodeBase64Twice, getApiBases, buildLyricsUrl } from "./lyricsPlusTransport.mjs";
import { getSpeakerPresentation } from "./lyricsPlusSpeakers.mjs";
import { measureLyricsDisplayWidth, splitLongSoloVocalLine, splitLongSoloVocalLines } from "./lyricsPlusSoloLineLayout.mjs";
import { groupParallelVocalLines, parseLyricsPayload } from "./lyricsPlusPayload.mjs";

export default function initializeLyricsPlusLyricsAddon() {
    const debug = createRuntimeDebugLogger(window);
    const { normalizeIsrc, resolveTrackIsrc, fetchLyricsData } = createLyricsPlusTransport({
        readSyncDataService: () => getRuntimeService("SyncDataService", window),
        readTrackId: (uri) => getRuntimeService("LyricsService", window)?.extractTrackId?.(uri)
            || readTrackIdentityService(window)?.extractTrackId?.(uri),
        debug,
    });

    const CACHE_VERSION = '2026-09-06-lyricsplus-11';
    const ATTRIBUTION = 'Lyrics from LyricsPlus.';

    const lyricsText = createProviderText(() => getRuntimeService("I18n", window), 'settings.lyricsProviders.');

    const ADDON_INFO = {
        id: 'lyricsplus',
        name: 'LyricsPlus',
        author: 'default',
        version: '1.0.0',
        cacheVersion: CACHE_VERSION,
        description: {
            ko: 'LyricsPlus 커뮤니티 API에서 단어 단위 싱크 가사를 가져옵니다',
            en: 'Word-synced lyrics from the LyricsPlus community API',
            ja: 'LyricsPlusコミュニティAPIから単語単位で同期した歌詞を取得します',
            'zh-CN': '从 LyricsPlus 社区 API 获取逐字同步歌词',
            'zh-TW': '從 LyricsPlus 社群 API 取得逐字同步歌詞',
            hi: 'LyricsPlus कम्युनिटी API से शब्द-दर-शब्द सिंक किए गए गीत के बोल',
            es: 'Letras sincronizadas palabra por palabra desde la API comunitaria de LyricsPlus',
            fr: 'Paroles synchronisées mot à mot depuis l’API communautaire LyricsPlus',
            ar: 'كلمات أغانٍ متزامنة كلمةً بكلمة من واجهة API المجتمعية لـ LyricsPlus',
            fa: 'متن ترانه با همگام‌سازی کلمه‌به‌کلمه از API جامعه کاربری LyricsPlus',
            de: 'Wortgenau synchronisierte Songtexte aus der Community-API von LyricsPlus',
            ru: 'Тексты песен с пословной синхронизацией из API сообщества LyricsPlus',
            sv: 'Ordsynkroniserade låttexter från LyricsPlus community-API',
            pt: 'Letras sincronizadas palavra por palavra da API comunitária do LyricsPlus',
            bn: 'LyricsPlus কমিউনিটি API থেকে শব্দভিত্তিক সিঙ্ক করা লিরিক্স',
            cs: 'Texty písní synchronizované po slovech z komunitního API LyricsPlus',
            it: 'Testi sincronizzati parola per parola dall’API della community di LyricsPlus',
            th: 'เนื้อเพลงที่ซิงก์ทีละคำจาก API ชุมชนของ LyricsPlus',
            vi: 'Lời bài hát đồng bộ theo từng từ, lấy từ API cộng đồng LyricsPlus',
            id: 'Lirik tersinkron per kata dari API komunitas LyricsPlus',
            ms: 'Lirik disegerakkan mengikut perkataan daripada API komuniti LyricsPlus',
            tr: 'LyricsPlus topluluk API’sinden kelime kelime senkronize şarkı sözleri'
        },
        supports: {
            karaoke: true,
            karaokeWord: true,
            synced: true,
            unsynced: true
        },
        supportsLocalTracks: true,
        // getLyrics(info, { signal }) aborts both mirrors once the manager
        // retires the lookup (track change, provider settings change).
        supportsAbortSignal: true,
        icon: 'M9 3v10.55A4 4 0 1 0 11 17V7h6V3H9v10a4 4 0 1 0 2 3.45V7h4v6a4 4 0 1 0 2 3.45V3H9z'
    };

    const LyricsPlusLyricsAddon = {
        ...ADDON_INFO,

        async init() {
            debug(`[LyricsPlus Lyrics Addon] Initialized (v${ADDON_INFO.version})`);
        },

        getSettingsUI() {
            const React = Spicetify.React;
            return function LyricsPlusLyricsSettings() {
                return React.createElement('div', { className: 'ai-addon-settings lyricsplus-settings' },
                    React.createElement('div', { className: 'ai-addon-setting', style: { marginTop: '16px' } },
                        React.createElement('div', { className: 'ai-addon-info-box' },
                            React.createElement('p', { style: { fontWeight: 700, marginBottom: '8px' } }, 'LyricsPlus'),
                            React.createElement('p', { style: { marginBottom: '8px' } }, lyricsText('attribution', ATTRIBUTION, { source: 'LyricsPlus' })),
                            React.createElement('a', {
                                href: 'https://github.com/ibratabian17/lyricsplus',
                                target: '_blank',
                                rel: 'noreferrer'
                            }, 'github.com/ibratabian17/lyricsplus')
                        )
                    )
                );
            };
        },

        async getLyrics(info, { signal } = {}) {
            const result = {
                uri: info?.uri || '',
                provider: ADDON_INFO.id,
                cacheVersion: CACHE_VERSION,
                karaoke: null,
                synced: null,
                unsynced: null,
                karaokeSource: null,
                copyright: ATTRIBUTION,
                error: null
            };

            try {
                const fetched = await fetchLyricsData(info, signal);
                if (!fetched) {
                    result.error = 'No lyrics';
                    return result;
                }

                const parsed = parseLyricsPayload(fetched.data, normalizeDurationMs(info));
                result.karaoke = parsed.karaoke;
                result.karaokeGranularity = parsed.karaokeGranularity;
                result.synced = parsed.synced;
                result.unsynced = parsed.unsynced;
                result.karaokeSource = result.karaoke ? ADDON_INFO.id : null;
                result.isrc = fetched.isrc || null;
                result.lyricsPlus = {
                    mirror: fetched.mirror,
                    type: fetched.data?.type || null,
                    source: fetched.data?.metadata?.source || null,
                    language: fetched.data?.metadata?.language || null,
                    cached: fetched.data?.cached ?? null,
                    title: fetched.data?.metadata?.title || null,
                    songWriters: Array.isArray(fetched.data?.metadata?.songWriters)
                        ? fetched.data.metadata.songWriters
                        : [],
                    agents: fetched.data?.metadata?.agents || {},
                    songParts: Array.isArray(fetched.data?.metadata?.songParts)
                        ? fetched.data.metadata.songParts
                        : [],
                    totalDuration: fetched.data?.metadata?.totalDuration || null
                };

                if (!result.karaoke && !result.synced && !result.unsynced) {
                    result.error = 'No usable lyrics';
                }

                debug('[LyricsPlus Lyrics Addon] Loaded lyrics', {
                    mirror: result.lyricsPlus.mirror,
                    type: result.lyricsPlus.type,
                    source: result.lyricsPlus.source,
                    karaokeLines: result.karaoke?.length || 0,
                    syncedLines: result.synced?.length || 0,
                    unsyncedLines: result.unsynced?.length || 0
                });
                return result;
            } catch (error) {
                result.error = error?.name === 'AbortError' || error?.name === 'TimeoutError'
                    ? 'Request timed out'
                    : (error?.message || 'Request error');
                // A retired lookup is expected and its result is discarded.
                if (!signal?.aborted) console.warn('[LyricsPlus Lyrics Addon] Failed to load lyrics:', error);
                return result;
            }
        }
    };

    window.LyricsPlusLyricsAddon = LyricsPlusLyricsAddon;
    window.__ivLyricsPlusDebug = Object.freeze({
        decodeBase64Twice,
        getApiBases,
        buildLyricsUrl,
        normalizeIsrc,
        resolveTrackIsrc,
        getSpeakerPresentation,
        groupParallelVocalLines,
        measureLyricsDisplayWidth,
        splitLongSoloVocalLine,
        splitLongSoloVocalLines,
        parseLyricsPayload,
        fetchLyricsData
    });

    registerLyricsAddon(LyricsPlusLyricsAddon, window);
    debug('[LyricsPlus Lyrics Addon] Module loaded');
}
