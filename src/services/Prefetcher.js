// Prefetcher for next track elements (lyrics, phonetic, translation, video background)
const Prefetcher = {
  _prefetchCache: new Map(),
  _inflightRequests: new Map(),
  _lastPrefetchedUri: null,
  _prefetchDelay: 1500, // 1.5초 지연 후 프리페치 시작
  _prefetchTimer: null,
  _lyricsContainer: null, // LyricsContainer 참조

  /**
   * LyricsContainer 참조 설정
   */
  setLyricsContainer(container) {
    this._lyricsContainer = container;
  },

  /**
   * 다음 곡의 모든 요소를 미리 요청 (가사 → 번역/발음 → 영상 배경)
   * @param {Object} trackInfo - 트랙 정보 (uri, artist, title 등)
   * @param {number} mode - 가사 모드
   */
  async prefetchNextTrack(trackInfo, mode = -1) {
    if (!trackInfo?.uri) return;

    // 이미 프리페치된 곡이면 스킵
    if (this._lastPrefetchedUri === trackInfo.uri) return;

    // 이전 프리페치 타이머 취소
    if (this._prefetchTimer) {
      clearTimeout(this._prefetchTimer);
      this._prefetchTimer = null;
    }

    // 약간의 지연 후 프리페치 시작 (현재 곡 로딩에 영향을 주지 않도록)
    this._prefetchTimer = setTimeout(async () => {
      this._lastPrefetchedUri = trackInfo.uri;

      console.log(`[Prefetcher] Starting prefetch for: ${trackInfo.title}`);

      try {
        // 1단계: 가사 먼저 프리페치 (필수)
        const lyrics = await this._prefetchLyrics(trackInfo, mode);

        if (!lyrics || (!lyrics.synced && !lyrics.unsynced && !lyrics.karaoke)) {
          console.log(`[Prefetcher] No lyrics found for: ${trackInfo.title}`);
          return;
        }

        // 2단계: 가사 로드 완료 후 병렬로 번역/발음 및 영상 배경 프리페치
        const prefetchPromises = [];

        // 발음/번역 프리페치 (Gemini)
        if (CONFIG.visual["prefetch-enabled"] !== false) {
          prefetchPromises.push(this._prefetchTranslations(trackInfo, lyrics));
        }

        // 영상 배경 프리페치
        if (CONFIG.visual["video-background"] && CONFIG.visual["prefetch-video-enabled"] !== false) {
          prefetchPromises.push(this._prefetchVideoBackground(trackInfo.uri));
        }

        await Promise.allSettled(prefetchPromises);
        console.log(`[Prefetcher] Completed all prefetch for: ${trackInfo.title}`);
      } catch (error) {
        console.warn(`[Prefetcher] Prefetch failed:`, error);
      }
    }, this._prefetchDelay);
  },

  /**
   * 가사 프리페치
   */
  async _prefetchLyrics(trackInfo, mode) {
    const uri = trackInfo.uri;

    // 이미 CACHE에 있으면 반환
    if (window.CACHE && window.CACHE[uri]) {
      console.log(`[Prefetcher] Lyrics already cached for: ${trackInfo.title}`);
      return window.CACHE[uri];
    }

    // 이미 요청 중이면 기존 요청 반환
    const inflightKey = `lyrics:${uri}`;
    if (this._inflightRequests.has(inflightKey)) {
      return this._inflightRequests.get(inflightKey);
    }

    const prefetchPromise = (async () => {
      try {
        console.log(`[Prefetcher] Fetching lyrics for: ${trackInfo.title}`);

        // LyricsService Extension을 통해 가사 로드
        const providerOrder = CONFIG.providersOrder.filter(id => CONFIG.providers[id]?.on);
        const resp = await window.LyricsService.getLyricsFromProviders(trackInfo, providerOrder, mode);
        if (!resp.uri) resp.uri = trackInfo.uri;

        if (resp?.provider) {
          // 가사 캐시에 저장
          if (!window.CACHE) window.CACHE = {};
          window.CACHE[resp.uri] = resp;
          console.log(`[Prefetcher] Lyrics cached for: ${trackInfo.title} (provider: ${resp.provider})`);
          return resp;
        }

        return null;
      } catch (error) {
        console.warn(`[Prefetcher] Lyrics prefetch failed:`, error.message);
        return null;
      } finally {
        this._inflightRequests.delete(inflightKey);
      }
    })();

    this._inflightRequests.set(inflightKey, prefetchPromise);
    return prefetchPromise;
  },

  /**
   * Gemini 번역/발음 프리페치
   */
  async _prefetchTranslations(trackInfo, lyrics) {
    const uri = trackInfo.uri;
    const trackId = uri?.split(':')[2];  // spotify:track:XXXX -> XXXX
    const cacheKeyBase = `prefetch:translation:${uri}`;

    // 이미 캐시에 있으면 스킵
    if (this._prefetchCache.has(cacheKeyBase)) {
      console.log(`[Prefetcher] Translation already cached for: ${trackInfo.title}`);
      return;
    }

    // 이미 요청 중이면 기존 요청 반환
    if (this._inflightRequests.has(cacheKeyBase)) {
      return this._inflightRequests.get(cacheKeyBase);
    }

    const lyricsArray = lyrics.synced || lyrics.unsynced || lyrics.karaoke;
    if (!lyricsArray || lyricsArray.length === 0) return;

    // 언어 감지
    const detectedLanguage = window.LyricsService ? window.LyricsService.detectLanguage(lyricsArray) : Utils.detectLanguage(lyricsArray);
    if (!detectedLanguage) return;
    // Update Utils detected language for furigana check
    Utils.setDetectedLanguage(detectedLanguage);

    // 현재 설정된 display mode 확인
    let friendlyLanguage = null;
    try {
      friendlyLanguage = new Intl.DisplayNames(["en"], { type: "language" })
        .of(detectedLanguage.split("-")[0])
        ?.toLowerCase();
    } catch (error) {
      // ignore
    }

    const provider = CONFIG.visual["translate:translated-lyrics-source"];
    const modeKey = provider === "geminiKo" && !friendlyLanguage ? "gemini" : friendlyLanguage;
    const displayMode1 = CONFIG.visual[`translation-mode:${modeKey}`];
    const displayMode2 = CONFIG.visual[`translation-mode-2:${modeKey}`];

    // 번역/발음 모드가 설정되어 있지 않으면 스킵
    if ((!displayMode1 || displayMode1 === "none") && (!displayMode2 || displayMode2 === "none")) {
      return;
    }

    // Section header 제외한 텍스트 추출
    const allLines = lyricsArray.map((l) => l?.text || "").filter(Boolean);
    const nonSectionLines = allLines.filter((line) => !Utils.isSectionHeader(line));
    const text = nonSectionLines.join("\n");

    if (!text.trim()) return;

    // 발음이 필요한지, 번역이 필요한지 확인
    const needPhonetic = displayMode1 === "gemini_romaji" || displayMode2 === "gemini_romaji";
    const needTranslation = (displayMode1 && displayMode1 !== "none" && displayMode1 !== "gemini_romaji") ||
      (displayMode2 && displayMode2 !== "none" && displayMode2 !== "gemini_romaji");

    const prefetchPromise = (async () => {
      try {
        console.log(`[Prefetcher] Fetching translation for: ${trackInfo.title} (phonetic: ${needPhonetic}, translation: ${needTranslation})`);

        // CacheManager에도 저장 (getGeminiTranslation에서 사용)
        const processTranslationResult = (outText) => {
          if (!outText) return null;

          let lines;
          if (Array.isArray(outText)) {
            lines = outText;
          } else if (typeof outText === "string") {
            lines = outText.split("\n");
          } else {
            return null;
          }

          const originalNonSectionIndices = [];
          lyricsArray.forEach((line, i) => {
            const lineText = line?.text || "";
            if (!Utils.isSectionHeader(lineText) && lineText.trim() !== "") {
              originalNonSectionIndices.push(i);
            }
          });

          const cleanTranslationLines = lines.filter(
            (line) => line && line.trim() !== "" && !Utils.isSectionHeader(line.trim())
          );

          const mapped = lyricsArray.map((line, i) => {
            const originalText = line?.text || "";
            if (Utils.isSectionHeader(originalText)) {
              return { ...line, text: null, originalText };
            }
            if (originalText.trim() === "") {
              return { ...line, text: "", originalText };
            }
            const positionInNonSectionLines = originalNonSectionIndices.indexOf(i);
            const translatedText = cleanTranslationLines[positionInNonSectionLines]?.trim() || "";
            return { ...line, text: translatedText || line?.text || "", originalText };
          });

          return mapped;
        };

        // 발음 요청 (wantSmartPhonetic = true)
        if (needPhonetic) {
          try {
            const phoneticResponse = await window.Translator.callGemini({
              trackId,
              artist: trackInfo.artist,
              title: trackInfo.title,
              text,
              wantSmartPhonetic: true,
              provider: lyrics.provider,
              ignoreCache: false,
            });

            if (phoneticResponse.phonetic) {
              const mapped = processTranslationResult(phoneticResponse.phonetic);
              if (mapped) {
                CacheManager.set(`${uri}:${lyrics.provider}:gemini_romaji`, mapped);
                console.log(`[Prefetcher] Phonetic cached for: ${trackInfo.title} (provider: ${lyrics.provider})`);
              }
            }
          } catch (error) {
            console.warn(`[Prefetcher] Phonetic prefetch failed:`, error.message);
          }
        }

        // 번역 요청 (wantSmartPhonetic = false)
        if (needTranslation) {
          try {
            const translationResponse = await window.Translator.callGemini({
              trackId,
              artist: trackInfo.artist,
              title: trackInfo.title,
              text,
              wantSmartPhonetic: false,
              provider: lyrics.provider,
              ignoreCache: false,
            });

            if (translationResponse.vi) {
              const mapped = processTranslationResult(translationResponse.vi);
              if (mapped) {
                // mode1, mode2 중 번역이 필요한 것에 캐시 저장
                if (displayMode1 && displayMode1 !== "none" && displayMode1 !== "gemini_romaji") {
                  CacheManager.set(`${uri}:${lyrics.provider}:${displayMode1}`, mapped);
                }
                if (displayMode2 && displayMode2 !== "none" && displayMode2 !== "gemini_romaji") {
                  CacheManager.set(`${uri}:${lyrics.provider}:${displayMode2}`, mapped);
                }
                console.log(`[Prefetcher] Translation cached for: ${trackInfo.title} (provider: ${lyrics.provider})`);
              }
            }
          } catch (error) {
            console.warn(`[Prefetcher] Translation prefetch failed:`, error.message);
          }
        }

        // 결과를 프리페치 캐시에 저장 (완료 표시용)
        this._prefetchCache.set(cacheKeyBase, {
          lyricsArray,
          displayMode1,
          displayMode2,
          timestamp: Date.now(),
        });

        console.log(`[Prefetcher] Prefetch completed for: ${trackInfo.title}`);
        return true;
      } catch (error) {
        console.warn(`[Prefetcher] Translation prefetch failed:`, error.message);
        return null;
      } finally {
        this._inflightRequests.delete(cacheKeyBase);
      }
    })();

    this._inflightRequests.set(cacheKeyBase, prefetchPromise);
    return prefetchPromise;
  },

  /**
   * 영상 배경 정보 프리페치
   */
  async _prefetchVideoBackground(uri) {
    const trackId = uri.split(":")[2];
    const cacheKey = `prefetch:video:${trackId}`;

    // 이미 캐시에 있으면 스킵
    if (this._prefetchCache.has(cacheKey)) {
      console.log(`[Prefetcher] Video info already cached for trackId: ${trackId}`);
      return;
    }

    // 이미 요청 중이면 기존 요청 반환
    if (this._inflightRequests.has(cacheKey)) {
      return this._inflightRequests.get(cacheKey);
    }

    const prefetchPromise = (async () => {
      try {
        console.log(`[Prefetcher] Fetching video info for trackId: ${trackId}`);

        const userHash = Utils.getUserHash();
        const response = await fetch(`https://lyrics.api.ivl.is/lyrics/youtube?trackId=${trackId}&userHash=${userHash}`);
        const data = await response.json();

        if (data.success) {
          this._prefetchCache.set(cacheKey, {
            data: data.data,
            timestamp: Date.now(),
          });
          console.log(`[Prefetcher] Video info cached for trackId: ${trackId}`);
        }

        return data;
      } catch (error) {
        console.warn(`[Prefetcher] Video prefetch failed:`, error.message);
        return null;
      } finally {
        this._inflightRequests.delete(cacheKey);
      }
    })();

    this._inflightRequests.set(cacheKey, prefetchPromise);
    return prefetchPromise;
  },

  /**
   * 프리페치된 영상 배경 정보 가져오기
   */
  getVideoInfo(uri) {
    const trackId = uri.split(":")[2];
    const cacheKey = `prefetch:video:${trackId}`;
    const cached = this._prefetchCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < 30 * 60 * 1000) {
      return cached.data;
    }
    return null;
  },

  /**
   * 캐시 정리
   */
  clearCache() {
    this._prefetchCache.clear();
    this._inflightRequests.clear();
    this._lastPrefetchedUri = null;
  },

  /**
   * 오래된 캐시 항목 정리 (30분 이상)
   */
  cleanupOldEntries() {
    const now = Date.now();
    const maxAge = 30 * 60 * 1000;

    for (const [key, value] of this._prefetchCache) {
      if (now - value.timestamp > maxAge) {
        this._prefetchCache.delete(key);
      }
    }
  },
};

// 주기적으로 오래된 프리페치 캐시 정리 (10분마다)
setInterval(() => {
  Prefetcher.cleanupOldEntries();
}, 10 * 60 * 1000);

// Export to window for global access
window.Prefetcher = Prefetcher;
