const matchesProvider = (storedProvider, provider) =>
    storedProvider === provider
    || (storedProvider === 'spotify' && typeof provider === 'string' && provider.startsWith('spotify-'));

export function createCommunityLyricsSync({
    syncDataService, extractTrackId, getSpotifyTrackData, request, reportWarning,
}) {
    return {
        /**
         * 커뮤니티 싱크 데이터 가져오기 (ivLyrics Sync)
         * @param {string} trackId - Spotify 트랙 ID
         * @param {string} provider - 가사 제공자 (예: spotify-abc, lrclib)
         * @returns {Promise<Object|null>}
         */
        async getIvLyricsSyncData(trackId, provider, metadata = {}) {
            if (!trackId || !provider) return null;

            const isrc = syncDataService?.normalizeSyncDataIsrc?.(metadata?.isrc)
                || await syncDataService?.resolveTrackIsrc?.(trackId, metadata)
                || syncDataService?.getTrackIsrc?.(trackId, metadata)
                || '';
            if (!isrc) {
                reportWarning(`[LyricsService] ISRC를 확인할 수 없어 sync data 요청을 건너뜁니다 (${provider})`);
                return null;
            }

            try {
                if (syncDataService?.getSyncData) {
                    return await syncDataService.getSyncData(trackId, provider, { ...metadata, isrc, trackId });
                }

                const url = new URL('https://lyrics.api.ivl.is/lyrics/sync-data');
                url.searchParams.set('isrc', isrc);
                url.searchParams.set('request-version', '20260701');
                url.searchParams.set('trackId', trackId);
                url.searchParams.set('provider', provider);
                if (metadata?.title || metadata?.trackName || metadata?.name) {
                    url.searchParams.set('title', metadata.title || metadata.trackName || metadata.name);
                }
                if (metadata?.artist || metadata?.artists) {
                    const artistText = Array.isArray(metadata.artists) ? metadata.artists.join(', ') : (metadata.artist || metadata.artists);
                    if (artistText) url.searchParams.set('artist', artistText);
                }
                if (metadata?.album || metadata?.albumName) {
                    url.searchParams.set('album', metadata.album || metadata.albumName);
                }
                let requestUrl = url.toString();
                if (isrc && syncDataService?.shouldBypassServerCache?.(isrc)) {
                    requestUrl += '&bypassCache=1';
                }

                const response = await request(requestUrl, { cache: 'no-store' });
                if (response.ok) {
                    const result = await response.json();
                    const data = result?.data || result;
                    if (data && matchesProvider(data.provider, provider)) {
                        return {
                            isrc: syncDataService?.normalizeSyncDataIsrc?.(data.isrc) || isrc,
                            trackId: data.trackId || trackId,
                            storedTrackId: data.storedTrackId || data.trackId || null,
                            ...data
                        };
                    }
                }
            } catch (e) {
                reportWarning(`[LyricsService] Failed to fetch sync data for ${isrc} (${provider}):`, e);
            }
            return null;
        },


        /**
         * 가사 결과에 ivLyrics Sync 데이터 적용
         * @param {Object} result - 가사 결과 객체 (uri, provider, synced, unsynced 등 포함)
         * @returns {Promise<Object>} - Sync 데이터가 적용된 결과
         */
        async applyIvLyricsSyncData(result) {
            if (!result?.uri || !result.provider || !syncDataService) {
                return result;
            }

            const trackId = extractTrackId(result.uri);
            const spotifyData = getSpotifyTrackData(result.uri);
            const metadata = {
                trackId,
                title: result.name || result.title || spotifyData?.name || '',
                artist: result.artist || result.artists || spotifyData?.artists || '',
                album: result.album || result.albumName || spotifyData?.album || spotifyData?.albumName || '',
            };
            let trackIsrc = syncDataService?.normalizeSyncDataIsrc?.(
                result.isrc ||
                result.external_ids?.isrc ||
                result.externalIds?.isrc ||
                result.track?.external_ids?.isrc ||
                spotifyData?.isrc
            );
            if (!trackIsrc) {
                trackIsrc = await syncDataService?.resolveTrackIsrc?.(trackId, {
                    ...result,
                    ...metadata,
                }) || '';
            }
            if (!trackIsrc) {
                return result;
            }
            const syncData = await this.getIvLyricsSyncData(trackId, result.provider, {
                ...metadata,
                isrc: trackIsrc,
            });

            if (syncData && matchesProvider(syncData.provider, result.provider)) {
                const baseLyrics = result.synced || result.unsynced;
                const karaoke = syncDataService.applySyncDataToLyrics(baseLyrics, syncData, {
                    durationMs: result.durationMs || result.duration_ms || result.duration,
                    result
                });

                if (karaoke) {
                    result.karaoke = karaoke;
                    result.syncDataApplied = true;
                    result.syncDataProvider = result.provider;
                    result.syncType = syncData.syncType || 'unknown';
                    result.syncPoints = Number(syncData.syncPoints ?? 2);
                    result.syncTypeBreakdown = syncData.syncTypeBreakdown || null;

                    // sync-data가 있으면 synced도 오버라이드
                    const syncedFromSyncData = syncDataService.convertKaraokeToSynced(karaoke);
                    if (syncedFromSyncData) {
                        result.synced = syncedFromSyncData;
                    }

                    // 기여자 정보 추가
                    if (syncData.contributors || syncData.syncData?.contributors) {
                        result.contributors = syncData.contributors || syncData.syncData.contributors;
                    }
                }
            }

            return result;
        },
    };
}
