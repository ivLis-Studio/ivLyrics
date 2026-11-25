import { writeRuntimeDebug } from "#ivlyrics/spicetify/runtimeDebug.mjs";
import { createRuntimeTrackIdentity } from "../../core/trackIdentity.mjs";
/**
 * Spotify Lyrics Provider Addon
 * Spotify의 내장 가사 서비스를 통해 가사를 제공합니다.
 *
 * Original Code is from https://github.com/spicetify/cli/tree/main/CustomApps/lyrics-plus
 *
 * @addon-type lyrics
 * @id spotify
 * @name Spotify
 * @version 1.0.0
 * @author Spicetify
 * @supports karaoke: false (커뮤니티 sync-data를 통해 지원 가능)
 * @supports synced: true
 * @supports unsynced: true
 */

import { getRuntimeService } from "../../spicetify/runtimeServices.mjs";
import { registerLyricsAddon } from "./lyricsAddonRegistration.mjs";
import { createSpotifyLyricsTransport } from "./spotifyLyricsTransport.mjs";
import { createSpotifyLyricsResult, parseSpotifyLyrics } from "./spotifyLyricsResponse.mjs";
import { readSpotifyResponseStatus } from "../../core/spotifyPlatformRequest.mjs";

export default function initializeSpotifyLyricsAddon(host = window) {
    const readSpotify = () => host.Spicetify;
    const { extractTrackId } = createRuntimeTrackIdentity(host);
    const requestSpotifyLyrics = createSpotifyLyricsTransport({
        readSpotify,
        setTimer: (callback, delay) => host.setTimeout(callback, delay),
        clearTimer: (timer) => host.clearTimeout(timer),
    });

    // ============================================
    // Addon Metadata
    // ============================================

    const ADDON_INFO = {
        id: 'spotify',
        name: 'Spotify',
        author: 'default',
        version: '1.0.0',
        description: {
            ko: 'Spotify 내장 가사 서비스에서 가사를 가져옵니다',
            en: 'Get lyrics from Spotify\'s built-in lyrics service',
            ja: 'Spotify内蔵の歌詞サービスから歌詞を取得します',
            'zh-CN': '从 Spotify 内置歌词服务获取歌词',
            'zh-TW': '從 Spotify 內建歌詞服務取得歌詞',
            hi: 'Spotify की बिल्ट-इन लिरिक्स सेवा से गीत के बोल प्राप्त करें',
            es: 'Obtén las letras del servicio de letras integrado de Spotify',
            fr: 'Récupérer les paroles depuis le service de paroles intégré de Spotify',
            ar: 'جلب كلمات الأغاني من خدمة الكلمات المدمجة في Spotify',
            fa: 'دریافت متن آهنگ از سرویس متن ترانه داخلی Spotify',
            de: 'Songtexte aus dem integrierten Songtext-Dienst von Spotify abrufen',
            ru: 'Получать тексты песен из встроенного сервиса текстов Spotify',
            sv: 'Hämta låttexter från Spotifys inbyggda låttexttjänst',
            pt: 'Obtenha letras do serviço de letras integrado do Spotify',
            bn: 'Spotify-এর বিল্ট-ইন লিরিক্স পরিষেবা থেকে লিরিক্স আনুন',
            cs: 'Načítá texty písní z vestavěné textové služby Spotify',
            it: 'Ottieni i testi dal servizio di testi integrato di Spotify',
            th: 'ดึงเนื้อเพลงจากบริการเนื้อเพลงในตัวของ Spotify',
            vi: 'Lấy lời bài hát từ dịch vụ lời bài hát tích hợp của Spotify',
            id: 'Ambil lirik dari layanan lirik bawaan Spotify',
            ms: 'Dapatkan lirik daripada perkhidmatan lirik terbina dalam Spotify',
            tr: 'Şarkı sözlerini Spotify’ın yerleşik şarkı sözü hizmetinden getirir'
        },
        // 지원하는 가사 유형
        supports: {
            karaoke: false,   // 기본적으로 노래방 가사 미지원 (sync-data로 확장 가능)
            synced: true,     // 싱크 가사 지원
            unsynced: true    // 일반 가사 지원
        },
        // 아이콘 (SVG path)
        icon: 'M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z'
    };

    function lyricsText(key, fallback) {
        const path = `settings.lyricsProviders.${key}`;
        const value = getRuntimeService("I18n", host)?.t?.(path);
        return value && value !== path ? value : fallback;
    }

    // ============================================
    // Addon Implementation
    // ============================================

    const SpotifyLyricsAddon = {
        ...ADDON_INFO,

        /**
         * 초기화
         */
        async init() {
            writeRuntimeDebug(host, `[Spotify Lyrics Addon] Initialized (v${ADDON_INFO.version})`);
        },

        /**
         * 설정 UI
         */
        getSettingsUI() {
            const React = readSpotify().React;

            return function SpotifyLyricsSettings() {
                return React.createElement('div', { className: 'ai-addon-settings spotify-settings' },
                    React.createElement('div', { className: 'ai-addon-setting', style: { marginTop: '20px' } },
                        React.createElement('div', { className: 'ai-addon-info-box' },
                            React.createElement('p', { style: { fontWeight: 'bold', marginBottom: '8px' } }, lyricsText('spotifyInfo.title', 'Spotify Premium Features')),
                            React.createElement('p', null, lyricsText('spotifyInfo.desc', 'This addon retrieves lyrics directly from Spotify.')),
                            React.createElement('ul', { style: { paddingLeft: '20px', marginTop: '8px', opacity: 0.8 } },
                                React.createElement('li', null, lyricsText('spotifyInfo.premium', 'Requires Spotify Premium')),
                                React.createElement('li', null, lyricsText('spotifyInfo.providers', 'Supports multiple providers')),
                                React.createElement('li', null, lyricsText('spotifyInfo.quality', 'High accuracy & sync quality'))
                            )
                        )
                    )
                );
            };
        },

        /**
         * 가사 가져오기
         * @param {Object} info - 트랙 정보 { uri, title, artist, album, duration }
         * @returns {Promise<LyricsResult>}
         */
        async getLyrics(info) {
            const uri = info?.uri;
            const trackId = extractTrackId(uri);
            if (!trackId) return createSpotifyLyricsResult(uri, 'Missing Spotify track ID');

            try {
                return parseSpotifyLyrics(uri, await requestSpotifyLyrics(trackId));
            } catch (error) {
                const status = readSpotifyResponseStatus(error, null);
                const spotify = readSpotify();
                console.warn('[Spotify Lyrics Addon] Lyrics request failed:', {
                    trackId,
                    status,
                    requestBuilderAvailable: typeof spotify?.Platform?.RequestBuilder?.build === 'function',
                    cosmosAvailable: typeof spotify?.CosmosAsync?.get === 'function',
                });
                return createSpotifyLyricsResult(uri, status ? `Request error (${status})` : 'Request error');
            }
        }
    };

    // ============================================
    // Registration
    // ============================================

    registerLyricsAddon(SpotifyLyricsAddon, host);

    writeRuntimeDebug(host, '[Spotify Lyrics Addon] Module loaded');
}
