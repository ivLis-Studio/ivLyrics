/**
 * Open Lyrics Addon
 * Connects to public lyrics servers on GitHub.
 *
 * @addon-type lyrics
 * @id open-lyrics
 * @name Open Lyrics
 * @version 1.1.0
 * @supports karaoke: true
 * @supports synced: true
 * @supports unsynced: true
 */

import { writeRuntimeDebug } from "#ivlyrics/spicetify/runtimeDebug.mjs";
import { getRuntimeService } from "../../spicetify/runtimeServices.mjs";
import { createProviderText } from "../providerText.mjs";
import { registerLyricsAddon } from "./lyricsAddonRegistration.mjs";
import { readLyricsTextParser } from "./lyricsParserRuntime.mjs";
import { normalizeDurationMilliseconds, normalizeComparable, normalizeTitleCore, scoreCandidate, selectBestCandidate } from "./openLyricsTrackMatch.mjs";
import {
    decodeLyricTextEntities, parseTimedTokens, parseStructuredReferenceLines,
    normalizeReferenceSpacingCharacters, getReferenceWhitespaceBoundaries,
} from "./openLyricsTokens.mjs";
import {
    measureLyricsDisplayWidth, isJapaneseLyricsPayload, getJapaneseLineSplitPlan, splitLongJapaneseLine, splitLongJapaneseLines,
} from "./openLyricsJapaneseWrap.mjs";
import {
    createOpenLyricsMetadataFilter, isTitleArtistMetadataHeader, isCreditMetadataText, isStrongCreditMetadataText,
    isCreditMetadataContinuationText, isCopyrightMetadataText, isNoLyricsPlaceholderText,
} from "./openLyricsMetadata.mjs";
import { createOpenLyricsStructuredParser } from "./openLyricsStructuredParser.mjs";
import { getCandidateQuality, parseOpenTrack, parseOpenResponse } from "./openLyricsRemoteResponse.mjs";
import { createOpenLyricsFetch, parseJinaReaderBody } from "./openLyricsFetch.mjs";

export default function initializeOpenLyricsLyricsAddon() {

    const decodeEndpoint = encoded => atob(encoded);
    const ENDPOINTS = Object.freeze({
        homepage: decodeEndpoint('aHR0cHM6Ly9naXRodWIuY29tL2l2TGlzLVN0dWRpby9pdkx5cmljcw=='),
        aggregateOne: decodeEndpoint('aHR0cHM6Ly9hcGkubGlyaXFvLWFsZmFycml6aS5teS5pZC92MS9seXJpY3M='),
        aggregateTwo: decodeEndpoint('aHR0cHM6Ly9hcGkubHJjbXV4LmRldi9nZXQ='),
        catalogSearch: decodeEndpoint('aHR0cHM6Ly9pdHVuZXMuYXBwbGUuY29tL3NlYXJjaA=='),
        readerPrefix: decodeEndpoint('aHR0cHM6Ly9yLmppbmEuYWkvaHR0cDovLw=='),
        providerSearch: decodeEndpoint('aHR0cHM6Ly9seXJpY3MucGF4c2VuaXgub3JnL2t1Z291L3NlYXJjaA=='),
        providerLyrics: decodeEndpoint('aHR0cHM6Ly9seXJpY3MucGF4c2VuaXgub3JnL2t1Z291L2x5cmljcw=='),
        catalogLyrics: decodeEndpoint('aHR0cHM6Ly9seXJpY3MucGF4c2VuaXgub3JnL2FwcGxlLW11c2ljL2x5cmljcw==')
    });
    const STRUCTURED_PROVIDER_ID = atob('a3Vnb3U=');
    const ATTRIBUTION = 'Lyrics via Open Lyrics.';

    const lyricsText = createProviderText(() => getRuntimeService("I18n", window), 'settings.lyricsProviders.');

    const CACHE_VERSION = 'open-lyrics-v2';
    const REQUEST_TIMEOUT_MS = 25000;
    const PROVIDER_TIMEOUT_MS = 30000;
    const ADDON_INFO = {
        id: 'open-lyrics',
        name: 'Open Lyrics',
        author: 'default',
        version: '1.1.0',
        cacheVersion: CACHE_VERSION,
        description: {
            "ko": "GitHub의 여러 공개 가사 서버에 연결합니다.",
            "en": "Connects to public lyrics servers on GitHub.",
            "ja": "GitHub上の複数の公開歌詞サーバーに接続します。",
            "zh-CN": "连接 GitHub 上的多个公共歌词服务器。",
            "zh-TW": "連接 GitHub 上的多個公開歌詞伺服器。",
            "hi": "GitHub पर कई सार्वजनिक गीत सर्वरों से जुड़ता है।",
            "es": "Se conecta a varios servidores públicos de letras en GitHub.",
            "fr": "Se connecte à plusieurs serveurs publics de paroles sur GitHub.",
            "ar": "يتصل بعدة خوادم عامة لكلمات الأغاني على GitHub.",
            "fa": "به چندین سرور عمومی متن ترانه در GitHub متصل می‌شود.",
            "de": "Verbindet sich mit mehreren öffentlichen Liedtextservern auf GitHub.",
            "ru": "Подключается к нескольким публичным серверам текстов песен на GitHub.",
            "sv": "Ansluter till flera offentliga låttextservrar på GitHub.",
            "pt": "Conecta-se a vários servidores públicos de letras no GitHub.",
            "bn": "GitHub-এর একাধিক উন্মুক্ত লিরিক্স সার্ভারে সংযোগ করে।",
            "cs": "Připojuje se k několika veřejným serverům s texty na GitHubu.",
            "it": "Si collega a diversi server pubblici di testi su GitHub.",
            "th": "เชื่อมต่อกับเซิร์ฟเวอร์เนื้อเพลงสาธารณะหลายแห่งบน GitHub",
            "vi": "Kết nối với nhiều máy chủ lời bài hát công khai trên GitHub.",
            "id": "Terhubung ke beberapa server lirik publik di GitHub.",
            "ms": "Menyambung ke beberapa pelayan lirik awam di GitHub.",
            "tr": "GitHub üzerindeki çeşitli herkese açık şarkı sözü sunucularına bağlanır."
        },
        supports: {
            karaoke: true,
            karaokeCharacter: true,
            karaokeWord: true,
            synced: true,
            unsynced: true
        },
        supportsLocalTracks: true,
        supportsAbortSignal: true,
        icon: 'M5 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6zm14 0a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM5 14a3 3 0 1 0 0 6 3 3 0 0 0 0-6zm14 0a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM8 7h8v2H8V7zm0 8h8v2H8v-2z'
    };

    const metadataFilter = createOpenLyricsMetadataFilter(STRUCTURED_PROVIDER_ID);
    const { getLeadingMetadataLineIndexes, isLikelyMetadataCreditLine } = metadataFilter;
    const { parseStructuredLyrics, parsePayload } = createOpenLyricsStructuredParser({
        metadataFilter, readSharedParser: () => readLyricsTextParser(window),
    });
    const { fetchBestLyrics } = createOpenLyricsFetch({
        endpoints: ENDPOINTS, request: (...args) => fetch(...args), timeoutMs: REQUEST_TIMEOUT_MS, parsePayload,
        readSyncDataService: () => getRuntimeService("SyncDataService", window),
    });

    const OpenLyricsAddon = {
        ...ADDON_INFO,

        async init() {
            writeRuntimeDebug(window, `[Open Lyrics] Initialized (v${ADDON_INFO.version})`);
        },

        getSettingsUI() {
            const React = Spicetify.React;
            return function OpenLyricsSettings() {
                return React.createElement('div', { className: 'ai-addon-settings open-lyrics-settings' },
                    React.createElement('div', { className: 'ai-addon-setting', style: { marginTop: '16px' } },
                        React.createElement('div', { className: 'ai-addon-info-box' },
                            React.createElement('p', { style: { fontWeight: 700, marginBottom: '8px' } }, ADDON_INFO.name),
                            React.createElement('p', { style: { marginBottom: '8px' } }, lyricsText('attribution', ATTRIBUTION, { source: 'Open Lyrics' }))
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

            const title = String(info?.title || '').trim();
            const artist = String(info?.artist || '').trim();
            if (!title || !artist) {
                result.error = 'Missing track metadata';
                return result;
            }

            if (signal?.aborted) {
                result.error = 'Lyrics request superseded';
                return result;
            }

            const controller = typeof AbortController === 'function' ? new AbortController() : null;
            const abortLookup = () => controller?.abort();
            signal?.addEventListener('abort', abortLookup, { once: true });
            const timeout = controller ? setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS) : null;
            try {
                const candidate = await fetchBestLyrics(info, controller?.signal ?? signal);
                if (signal?.aborted) {
                    result.error = 'Lyrics request superseded';
                    return result;
                }
                if (!candidate) {
                    result.error = controller?.signal.aborted ? 'Request timed out' : 'No lyrics';
                    return result;
                }

                result.karaoke = candidate.parsed.karaoke?.length ? candidate.parsed.karaoke : null;
                result.synced = candidate.parsed.synced?.length ? candidate.parsed.synced : null;
                result.unsynced = candidate.parsed.unsynced?.length ? candidate.parsed.unsynced : null;
                result.karaokeSource = result.karaoke ? ADDON_INFO.id : null;
                result.openLyrics = {
                    upstream: candidate.source,
                    syncType: candidate.payload?.syncType || null,
                    matchedTitle: candidate.match?.candidate?.title || null,
                    matchedArtist: candidate.match?.candidate?.artist || null,
                    matchScore: candidate.match?.score ?? null,
                    sourceUrl: candidate.source === 'server-a' ? ENDPOINTS.aggregateOne
                        : candidate.source === 'server-b' ? ENDPOINTS.aggregateTwo : ENDPOINTS.homepage
                };
                return result;
            } catch (error) {
                const timedOut = error?.name === 'AbortError' || error?.name === 'TimeoutError';
                result.error = timedOut ? 'Request timed out' : (error?.message || 'Request error');
                console.warn('[Open Lyrics] Failed to load lyrics:', error);
                return result;
            } finally {
                if (timeout) clearTimeout(timeout);
                signal?.removeEventListener('abort', abortLookup);
            }
        }
    };

    window.OpenLyricsAddon = OpenLyricsAddon;
    window.__ivLyricsOpenLyricsDebug = Object.freeze({
        normalizeDurationMilliseconds,
        normalizeComparable,
        normalizeTitleCore,
        scoreCandidate,
        selectBestCandidate,
        parseJinaReaderBody,
        decodeLyricTextEntities,
        parseTimedTokens,
        parseStructuredReferenceLines,
        normalizeReferenceSpacingCharacters,
        getReferenceWhitespaceBoundaries,
        measureLyricsDisplayWidth,
        isJapaneseLyricsPayload,
        getJapaneseLineSplitPlan,
        splitLongJapaneseLine,
        splitLongJapaneseLines,
        isTitleArtistMetadataHeader,
        isCreditMetadataText,
        isStrongCreditMetadataText,
        isCreditMetadataContinuationText,
        isCopyrightMetadataText,
        isNoLyricsPlaceholderText,
        getLeadingMetadataLineIndexes,
        isLikelyMetadataCreditLine,
        parseStructuredLyrics,
        parsePayload,
        getCandidateQuality,
        parseOpenTrack,
        parseOpenResponse,
        fetchBestLyrics
    });

    registerLyricsAddon(OpenLyricsAddon, window);
    writeRuntimeDebug(window, '[Open Lyrics] Module loaded');
}
