/**
 * Unison Lyrics Provider Addon
 * Read-only integration for https://unison.boidu.dev.
 *
 * @addon-type lyrics
 * @id unison
 * @name Unison
 * @version 1.0.2
 * @author default
 * @default-enabled false
 * @supports karaoke: true
 * @supports synced: true
 * @supports unsynced: true
 */

import { writeRuntimeDebug } from "#ivlyrics/spicetify/runtimeDebug.mjs";
import { registerLyricsAddon } from "./lyricsAddonRegistration.mjs";
import { getRuntimeService, publishRuntimeService } from "../../spicetify/runtimeServices.mjs";
import { createAttributedLyricsResult } from "./createAttributedLyricsResult.mjs";
import { renderLyricsAttributionSettings } from "./renderLyricsAttributionSettings.mjs";
import { createProviderText } from "../providerText.mjs";
import {
    parseTimeMs,
    parseTtmlLyrics,
    groupParallelVocalLines,
    parseLrcLyrics,
    parsePlainLyrics,
    stripBackgroundVocalParentheses
} from "./lyricsTextParsers.mjs";

export default function initializeUnisonLyricsAddon() {

    const API_BASE = 'https://unison.boidu.dev';
    const CACHE_VERSION = '2026-09-06-unison-5';
    const ATTRIBUTION = 'Lyrics from Unison (https://unison.boidu.dev).';

    const lyricsText = createProviderText(() => getRuntimeService("I18n", window), 'settings.lyricsProviders.');

    const REQUEST_TIMEOUT_MS = 10000;

    const ADDON_INFO = {
        id: 'unison',
        name: 'Unison',
        author: 'default',
        version: '1.0.2',
        cacheVersion: CACHE_VERSION,
        description: {
            ko: 'Unison 커뮤니티 가사 API를 사용하는 읽기 전용 제공자',
            en: 'Read-only provider backed by the Unison community lyrics API',
            ja: 'Unisonコミュニティ歌詞APIを使用する読み取り専用プロバイダー',
            'zh-CN': '基于 Unison 社区歌词 API 的只读提供商',
            'zh-TW': '採用 Unison 社群歌詞 API 的唯讀供應商',
            hi: 'Unison कम्युनिटी लिरिक्स API पर आधारित रीड-ओनली प्रदाता',
            es: 'Proveedor de solo lectura basado en la API comunitaria de letras de Unison',
            fr: 'Fournisseur en lecture seule reposant sur l’API communautaire de paroles Unison',
            ar: 'موفّر للقراءة فقط يعتمد على واجهة API المجتمعية لكلمات الأغاني من Unison',
            fa: 'ارائه‌دهنده فقط‌خواندنی مبتنی بر API متن ترانه جامعه Unison',
            de: 'Schreibgeschützter Anbieter auf Basis der Community-Songtext-API von Unison',
            ru: 'Провайдер только для чтения на базе API текстов песен сообщества Unison',
            sv: 'Skrivskyddad leverantör som bygger på Unisons community-API för låttexter',
            pt: 'Provedor somente leitura baseado na API comunitária de letras do Unison',
            bn: 'Unison কমিউনিটি লিরিক্স API-ভিত্তিক শুধু-পঠনযোগ্য প্রদানকারী',
            cs: 'Poskytovatel pouze pro čtení založený na komunitním API textů písní Unison',
            it: 'Provider di sola lettura basato sull’API della community di Unison per i testi',
            th: 'ผู้ให้บริการแบบอ่านอย่างเดียวที่ใช้ API เนื้อเพลงจากชุมชน Unison',
            vi: 'Nhà cung cấp chỉ đọc dựa trên API lời bài hát cộng đồng Unison',
            id: 'Penyedia hanya-baca berbasis API lirik komunitas Unison',
            ms: 'Penyedia baca sahaja yang disokong oleh API lirik komuniti Unison',
            tr: 'Unison topluluk şarkı sözü API’sini kullanan salt okunur sağlayıcı'
        },
        supports: {
            karaoke: true,
            karaokeCharacter: true,
            karaokeWord: true,
            synced: true,
            unsynced: true
        },
        supportsLocalTracks: true,
        // getLyrics(info, { signal }) stops its request ladder once the
        // manager retires the lookup (track change, provider settings change).
        supportsAbortSignal: true,
        defaultEnabled: false,
        icon: 'M9 3v10.55A4 4 0 1 0 11 17V7h6V3H9zm-2 16a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm8-6a2 2 0 1 1 0 4 2 2 0 0 1 0-4z'
    };

    function normalizeDurationSeconds(info) {
        const duration = Number(info?.durationMs ?? info?.duration_ms ?? info?.duration ?? 0);
        if (!Number.isFinite(duration) || duration <= 0) return 0;
        return duration > 10000 ? Math.round(duration / 1000) : Math.round(duration);
    }

    function getArtistCandidates(artistInput) {
        const artist = String(artistInput || '').trim();
        if (!artist) return [];
        const primary = artist
            .split(/\s*(?:,|;|\bfeat\.?\b|\bfeaturing\b|\s&\s)\s*/i)[0]
            ?.trim();
        return Array.from(new Set([artist, primary].filter(Boolean)));
    }

    function normalizeMetadata(value) {
        return String(value || '')
            .normalize('NFKC')
            .toLocaleLowerCase()
            .replace(/[^\p{L}\p{N}]+/gu, ' ')
            .trim();
    }

    function isExactMetadataMatch(data, info) {
        const expectedTitle = normalizeMetadata(info?.title);
        const actualTitle = normalizeMetadata(data?.song);
        if (!expectedTitle || actualTitle !== expectedTitle) return false;

        const actualArtist = normalizeMetadata(data?.artist);
        return getArtistCandidates(info?.artist)
            .map(normalizeMetadata)
            .filter(Boolean)
            .includes(actualArtist);
    }

    function buildLyricsUrl(info, includeAlbum = true, artistOverride = null, includeDuration = true) {
        const url = new URL(`${API_BASE}/lyrics`);
        url.searchParams.set('song', String(info?.title || '').trim());
        url.searchParams.set('artist', String(artistOverride || info?.artist || '').trim());

        const durationSeconds = normalizeDurationSeconds(info);
        if (includeDuration && durationSeconds > 0) url.searchParams.set('duration', String(durationSeconds));
        const album = String(info?.album || '').trim();
        if (includeAlbum && album && album !== 'undefined') url.searchParams.set('album', album);
        return url;
    }

    async function fetchJson(url, signal) {
        const controller = typeof AbortController === 'function' ? new AbortController() : null;
        const timer = controller ? setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS) : null;
        const abort = () => controller?.abort();
        if (signal?.aborted) abort();
        else signal?.addEventListener?.('abort', abort, { once: true });
        try {
            const response = await fetch(url.toString(), {
                headers: { Accept: 'application/json' },
                signal: controller?.signal
            });
            const body = await response.json().catch(() => null);
            return { response, body };
        } finally {
            if (timer) clearTimeout(timer);
            signal?.removeEventListener?.('abort', abort);
        }
    }

    async function fetchLyricsData(info, signal) {
        const album = String(info?.album || '').trim();
        const artistCandidates = getArtistCandidates(info?.artist);
        const includeAlbumOptions = album && album !== 'undefined' ? [true, false] : [false];
        const requests = [];
        includeAlbumOptions.forEach(includeAlbum => {
            artistCandidates.forEach(artist => {
                requests.push({
                    url: buildLyricsUrl(info, includeAlbum, artist, true),
                    exactMetadataRequired: false
                });
            });
        });
        if (normalizeDurationSeconds(info) > 0) {
            artistCandidates.forEach(artist => {
                requests.push({
                    url: buildLyricsUrl(info, false, artist, false),
                    exactMetadataRequired: true
                });
            });
        }
        const uniqueRequests = Array.from(new Map(
            requests.map(request => [request.url.toString(), request])
        ).values());

        for (const request of uniqueRequests) {
            const { response, body } = await fetchJson(request.url, signal);
            if (response.ok && body?.success !== false && body?.data?.lyrics) {
                if (!request.exactMetadataRequired || isExactMetadataMatch(body.data, info)) {
                    return body.data;
                }
                continue;
            }
            if (response.status !== 404) {
                throw new Error(body?.error || `Unison request failed (${response.status})`);
            }
        }
        return null;
    }

    function parseResponseLyrics(data, durationMs) {
        const format = String(data?.format || '').toLowerCase();
        if (format === 'ttml') return parseTtmlLyrics(data.lyrics, durationMs);
        if (format === 'lrc') return parseLrcLyrics(data.lyrics, durationMs);
        if (format === 'plain') return parsePlainLyrics(data.lyrics);
        throw new Error(`Unsupported Unison lyrics format: ${format || 'unknown'}`);
    }

    const UnisonLyricsAddon = {
        ...ADDON_INFO,

        async init() {
            writeRuntimeDebug(window, `[Unison Lyrics Addon] Initialized (v${ADDON_INFO.version})`);
        },

        getSettingsUI() {
            const React = Spicetify.React;
            return function UnisonLyricsSettings() {
                return renderLyricsAttributionSettings(React, {
                    className: 'unison-settings',
                    title: 'Unison',
                    attribution: lyricsText('attribution', ATTRIBUTION, { source: 'Unison (https://unison.boidu.dev)' }),
                    link: { href: 'https://github.com/better-lyrics/unison', text: 'github.com/better-lyrics/unison' }
                });
            };
        },

        async getLyrics(info, { signal } = {}) {
            const result = createAttributedLyricsResult(info, ADDON_INFO, ATTRIBUTION, { skipCache: true });

            const title = String(info?.title || '').trim();
            const artist = String(info?.artist || '').trim();
            if (!title || !artist) {
                result.error = 'Missing track metadata';
                return result;
            }

            try {
                const data = await fetchLyricsData(info, signal);
                if (!data) {
                    result.error = 'No lyrics';
                    return result;
                }

                const durationSeconds = normalizeDurationSeconds(info);
                const parsed = parseResponseLyrics(data, durationSeconds * 1000);
                result.karaoke = parsed.karaoke?.length ? parsed.karaoke : null;
                result.synced = parsed.synced?.length ? parsed.synced : null;
                result.unsynced = parsed.unsynced?.length ? parsed.unsynced : null;
                if (result.karaoke) result.karaokeSource = 'unison';
                result.unison = {
                    id: data.id ?? null,
                    videoId: data.videoId || null,
                    format: data.format || null,
                    syncType: data.syncType || null,
                    language: data.language || null,
                    score: data.score ?? null,
                    effectiveScore: data.effectiveScore ?? null,
                    voteCount: data.voteCount ?? null,
                    confidence: data.confidence || null,
                    sourceUrl: data.id ? `${API_BASE}/lyrics/${data.id}` : API_BASE
                };

                if (!result.karaoke && !result.synced && !result.unsynced) {
                    result.error = 'No usable lyrics';
                }

                writeRuntimeDebug(window, '[Unison Lyrics Addon] Loaded lyrics', {
                    id: result.unison.id,
                    format: result.unison.format,
                    syncType: result.unison.syncType,
                    karaokeLines: result.karaoke?.length || 0,
                    syncedLines: result.synced?.length || 0,
                    unsyncedLines: result.unsynced?.length || 0
                });
                return result;
            } catch (error) {
                const timedOut = error?.name === 'AbortError';
                result.error = timedOut ? 'Request timed out' : (error?.message || 'Request error');
                // A retired lookup is expected and its result is discarded.
                if (!signal?.aborted) console.warn('[Unison Lyrics Addon] Failed to load lyrics:', error);
                return result;
            }
        }
    };

    window.UnisonLyricsAddon = UnisonLyricsAddon;
    const sharedLyricsParser = Object.freeze({
        parseTimeMs,
        parseTtmlLyrics,
        groupParallelVocalLines,
        parseLrcLyrics,
        parsePlainLyrics,
        stripBackgroundVocalParentheses,
        buildLyricsUrl,
        fetchLyricsData
    });
    publishRuntimeService("ivLyricsLyricsParser", sharedLyricsParser, window);
    window.__ivLyricsUnisonDebug = sharedLyricsParser;

    registerLyricsAddon(UnisonLyricsAddon, window);
    writeRuntimeDebug(window, '[Unison Lyrics Addon] Module loaded');
}
