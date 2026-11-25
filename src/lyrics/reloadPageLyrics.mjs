export async function reloadPageLyrics(page, clearCache, {
  readPlayerItem, extractTrackId, memoryCache, translationCache, getService, debug, expectedTrackUri,
}) {
  if (!page._isComponentMounted) return;
  const item = readPlayerItem();
  const trackUri = item?.uri;
  if (expectedTrackUri && (trackUri !== expectedTrackUri || !page.isPlaybackUriCurrent(trackUri))) return;
  debug("[ivLyrics] Reloading lyrics...", { trackId: item?.uri, clearCache });

  // Keep the cache object shared with integrations while removing its entries.
  if (expectedTrackUri) delete memoryCache[expectedTrackUri];
  else for (const key of Object.keys(memoryCache)) delete memoryCache[key];

  const spotifyTrackId = extractTrackId(trackUri);
  const lyricsCacheId = spotifyTrackId || (trackUri ? `local-uri:${trackUri}` : null);

  let request = null;
  if (trackUri && page.isPlaybackUriCurrent(trackUri)) {
    const reloadInfo = page.infoFromTrack(item) || { uri: trackUri };
    const reloadSeq = page.beginLyricsLoadRequest();
    request = { uri: trackUri, lyricsRequestSeq: reloadSeq };
    page.currentTrackUri = trackUri;
    page.pageLyricsDataLoader?.cancelForUri(trackUri);
    page.clearPendingLyricsUpdates();
    page.lastProcessedUri = null;
    page.lastProcessedMode = null;
    page.setState(page.getLoadingLyricsState(reloadInfo, reloadSeq));
  }

  // CacheManager (Gemini 번역 메모리 캐시)도 항상 현재 트랙에 대해 초기화
  if (trackUri) {
    translationCache.clearByUri(trackUri);
  }

  // _dmResults (번역/발음 결과 메모리 캐시)도 초기화
  if (page._dmResults) {
    if (trackUri) {
      delete page._dmResults[trackUri];
    } else {
      page._dmResults = {};
    }
  }

  // 진행 중인 Gemini 요청도 취소
  if (page._inflightGemini && trackUri) {
    for (const [key] of page._inflightGemini) {
      if (key.startsWith(`${trackUri}:`)) {
        page._inflightGemini.delete(key);
      }
    }
  }

  try {
    if ((clearCache || expectedTrackUri) && lyricsCacheId) {
      page.clearCulturalAnnotationsForTrack(trackUri);
      getService("Translator")?.clearMemoryCache?.(lyricsCacheId);
    }
    if (clearCache && lyricsCacheId) {
      debug("[ivLyrics] Clearing track cache for:", lyricsCacheId);
      getService("LyricsService")?.clearLyricsSnapshot?.(trackUri);
      await getService("LyricsCache")?.clearTrack(lyricsCacheId);
    }
    if (clearCache && spotifyTrackId) {
      const syncData = getService("SyncDataService");
      const clearSyncDataIsrc = syncData?.getTrackIsrc?.(spotifyTrackId, {
        item,
        title: item?.name,
        artist: item?.artists,
        album: item?.album?.name,
      }) || "";
      if (clearSyncDataIsrc) {
        syncData?.clearCache(clearSyncDataIsrc, { isrc: clearSyncDataIsrc });
      } else {
        syncData?.clearCache();
      }
    }
  } finally {
    // The UI may have moved to another song or to a different page during the disk clear.
    if (page._isComponentMounted && (!request || page.isCurrentLyricsState(request))) {
      page.forceUpdate();
      debug("[ivLyrics] Fetching new lyrics...");
      page.fetchLyrics(expectedTrackUri ? item : readPlayerItem(), page.state.explicitMode, !expectedTrackUri);
    }
  }
}
