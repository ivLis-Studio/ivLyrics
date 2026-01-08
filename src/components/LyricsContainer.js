// The main React component for lyrics display
// Run "npm i @types/react" to have this type package available in workspace
/// <reference types="react" />
/// <reference path="../../globals.d.ts" />

const react = Spicetify.React;
const { useState, useEffect, useCallback, useMemo, useRef } = react;

// Core dependencies
const CACHE = window.CACHE || {};
const emptyState = {
  karaoke: null,
  synced: null,
  unsynced: null,
  currentLyrics: null,
};

// ... copy the rest of LyricsContainer class from index.js but adapt it to be a standalone file
// We need to make sure CONFIG, StorageManager, etc are available. They are global.

// Update Banner Component - Fluent Design Style
const UpdateBanner = ({ updateInfo, onDismiss }) => {
  const [copied, setCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const installCommand = Utils.getInstallCommand();
  const platformName = Utils.getPlatformName();

  const handleCopy = async () => {
    const success = await Utils.copyToClipboard(installCommand);
    if (success) {
      setCopied(true);
      Toast.success(I18n.t("notifications.installCommandCopied"));
      setTimeout(() => setCopied(false), 2500);
    } else {
      Toast.error(I18n.t("notifications.copyFailed"));
    }
  };

  return react.createElement(
    "div",
    {
      className: "ivLyrics-update-banner",
      style: {
        background: "rgba(255, 255, 255, 0.05)",
        border: "1px solid rgba(255, 255, 255, 0.1)",
        borderRadius: "12px",
        margin: "12px 16px",
        backdropFilter: "blur(40px) saturate(180%)",
        WebkitBackdropFilter: "blur(40px) saturate(180%)",
        boxShadow:
          "0 8px 32px 0 rgba(0, 0, 0, 0.18), inset 0 1px 0 0 rgba(255, 255, 255, 0.05)",
        animation: "slideDown 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
        position: "relative",
        zIndex: 100,
        overflow: "hidden",
        transition: "all 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
      },
    },
    react.createElement(
      "div",
      {
        style: {
          padding: "16px 20px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "16px",
        },
      },
      react.createElement(
        "div",
        { style: { flex: 1, minWidth: 0 } },
        react.createElement(
          "div",
          {
            style: {
              fontSize: "15px",
              fontWeight: "600",
              color: "rgba(255, 255, 255, 0.95)",
              marginBottom: "6px",
              letterSpacing: "-0.01em",
            },
          },
          I18n.t("notifications.updateAvailable")
        ),
        react.createElement(
          "div",
          {
            style: {
              fontSize: "13px",
              color: "rgba(255, 255, 255, 0.6)",
              lineHeight: "1.5",
            },
          },
          `${I18n.t("update.versionChange")} ${updateInfo.currentVersion} → ${updateInfo.latestVersion}`
        )
      ),
      react.createElement(
        "div",
        { style: { display: "flex", gap: "8px", alignItems: "center" } },
        react.createElement(
          "button",
          {
            onClick: () => setIsExpanded(!isExpanded),
            className: "lyrics-update-button-primary",
            style: {
              background: "rgba(255, 255, 255, 0.15)",
              border: "1px solid rgba(255, 255, 255, 0.2)",
              color: "rgba(255, 255, 255, 0.95)",
              padding: "8px 16px",
              borderRadius: "8px",
              cursor: "pointer",
              fontSize: "13px",
              fontWeight: "600",
              transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
              backdropFilter: "blur(10px)",
              letterSpacing: "-0.01em",
            },
          },
          isExpanded ? I18n.t("update.collapse") : I18n.t("update.expand")
        ),
        react.createElement(
          "button",
          {
            onClick: onDismiss,
            className: "lyrics-update-button-close",
            style: {
              background: "transparent",
              border: "none",
              color: "rgba(255, 255, 255, 0.5)",
              cursor: "pointer",
              fontSize: "20px",
              padding: "4px 8px",
              borderRadius: "6px",
              transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
              lineHeight: "1",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            },
          },
          "×"
        )
      )
    ),
    isExpanded &&
    react.createElement(
      "div",
      {
        style: {
          padding: "0 20px 20px 20px",
          borderTop: "1px solid rgba(255, 255, 255, 0.06)",
          animation: "expandDown 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
        },
      },
      react.createElement(
        "div",
        { style: { marginTop: "16px" } },
        react.createElement(
          "div",
          {
            style: {
              fontSize: "13px",
              color: "rgba(255, 255, 255, 0.7)",
              marginBottom: "10px",
              fontWeight: "500",
            },
          },
          platformName
        ),
        react.createElement(
          "div",
          {
            style: {
              background: "rgba(0, 0, 0, 0.25)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: "8px",
              padding: "12px 14px",
              fontFamily: 'Consolas, Monaco, "Courier New", monospace',
              fontSize: "12px",
              color: "rgba(255, 255, 255, 0.85)",
              wordBreak: "break-all",
              lineHeight: "1.6",
              marginBottom: "12px",
              userSelect: "all",
            },
          },
          installCommand
        )
      ),
      react.createElement(
        "div",
        { style: { display: "flex", gap: "8px", marginTop: "12px" } },
        react.createElement(
          "button",
          {
            onClick: handleCopy,
            className: "lyrics-update-button-secondary",
            disabled: copied,
            style: {
              flex: 1,
              background: copied
                ? "rgba(16, 185, 129, 0.15)"
                : "rgba(255, 255, 255, 0.08)",
              border: copied
                ? "1px solid rgba(16, 185, 129, 0.3)"
                : "1px solid rgba(255, 255, 255, 0.15)",
              color: copied
                ? "rgba(16, 185, 129, 1)"
                : "rgba(255, 255, 255, 0.9)",
              padding: "10px 16px",
              borderRadius: "8px",
              cursor: copied ? "default" : "pointer",
              fontSize: "13px",
              fontWeight: "600",
              transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
              letterSpacing: "-0.01em",
            },
          },
          copied ? I18n.t("update.copied") : I18n.t("update.copyCommand")
        ),
        react.createElement(
          "a",
          {
            href: updateInfo.releaseUrl,
            target: "_blank",
            rel: "noopener noreferrer",
            style: {
              flex: 1,
              background: "rgba(255, 255, 255, 0.08)",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              color: "rgba(255, 255, 255, 0.9)",
              padding: "10px 16px",
              borderRadius: "8px",
              textDecoration: "none",
              fontSize: "13px",
              fontWeight: "600",
              transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              letterSpacing: "-0.01em",
            },
          },
          I18n.t("update.releaseNotes")
        )
      )
    )
  );
};

const fontSizeLimit = { min: 16, max: 256, step: 4 };

class LyricsContainer extends react.Component {
  constructor() {
    super();
    this.state = {
      karaoke: null,
      synced: null,
      unsynced: null,
      currentLyrics: null,
      romaji: null,
      furigana: null,
      hiragana: null,
      hangul: null,
      romaja: null,
      katakana: null,
      cn: null,
      hk: null,
      tw: null,
      uri: "",
      provider: "",
      colors: {
        background: "",
        inactive: "",
      },
      tempo: "0.25s",
      explicitMode: -1,
      lockMode: CONFIG.locked,
      mode: -1,
      isLoading: false,
      versionIndex: 0,
      versionIndex2: 0,
      isFullscreen: false,
      isFADMode: false,
      isCached: false,
      language: null,
      isPhoneticLoading: false,
      isTranslationLoading: false,
      currentLyricIndex: 0,
      videoInfo: null,
      // 메타데이터 번역
      translatedMetadata: null,
    };
    this.currentTrackUri = "";
    this.nextTrackUri = "";
    this.availableModes = [];
    this.styleVariables = {};
    this.fullscreenContainer = document.createElement("div");
    this.fullscreenContainer.id = "lyrics-fullscreen-container";
    this.mousetrap = null;
    this.containerRef = react.createRef(null);
    this.translator = null;
    this.initMoustrap();
    // Cache last state
    this.languageOverride = CONFIG.visual["translate:detect-language-override"];
    // 트랙별 언어 오버라이드 (IndexedDB에서 로드)
    this.trackLanguageOverride = null;
    this.reRenderLyricsPage = false;
    this.displayMode = null;

    // Prevent infinite render loops
    this.lastProcessedUri = null;
    this.lastProcessedMode = null;

    // Translation loading timers - separate for phonetic and translation
    this.phoneticLoadingTimer = null;
    this.translationLoadingTimer = null;

    // Mouse idle timer for auto-hiding controls
    this.mouseIdleTimer = null;
    this.isMouseActive = true;

    // Mouse event handlers for auto-hide controls (defined here so ref can use them)
    this._handleMouseMove = () => {
      this.isMouseActive = true;
      const container = this.containerRef.current;
      if (container) {
        container.classList.remove('controls-hidden');
      }

      // Clear existing timer
      if (this.mouseIdleTimer) {
        clearTimeout(this.mouseIdleTimer);
      }

      // Set new timer - hide after 3 seconds of inactivity
      this.mouseIdleTimer = setTimeout(() => {
        this.isMouseActive = false;
        const container = this.containerRef.current;
        if (container) {
          container.classList.add('controls-hidden');
        }
      }, 3000);
    };

    this._handleMouseLeave = () => {
      // Immediately hide when mouse leaves
      if (this.mouseIdleTimer) clearTimeout(this.mouseIdleTimer);
      this.isMouseActive = false;
      const container = this.containerRef.current;
      if (container) {
        container.classList.add('controls-hidden');
      }
    };

    // Bind regenerate translation method
    this.regenerateTranslation = this.regenerateTranslation.bind(this);
  }

  /**
   * 메타데이터 번역 요청 (제목/아티스트)
   * @param {string} uri - 트랙 URI
   * @param {string} title - 원본 제목
   * @param {string} artist - 원본 아티스트
   */
  async fetchMetadataTranslation(uri, title, artist) {
    // 메타데이터 번역 설정이 꺼져 있으면 스킵
    if (!CONFIG.visual["translate-metadata"]) {
      return;
    }

    const trackId = uri?.split(':')[2];
    if (!trackId || !title || !artist) {
      return;
    }

    try {
      const result = await window.Translator.translateMetadata({
        trackId,
        title,
        artist,
        ignoreCache: false,
      });

      // 현재 트랙이 여전히 같은지 확인
      if (this.currentTrackUri === uri && result) {
        this.setState({ translatedMetadata: result });
      }
    } catch (error) {
      console.warn('[ivLyrics] Metadata translation failed:', error);
    }
  }

  /**
   * 저장된 선택 영상 로드 (IndexedDB에서)
   * @param {string} trackUri - 트랙 URI
   */
  async loadSavedVideoForTrack(trackUri) {
    if (!trackUri) return;

    try {
      const savedVideo = await Utils.getSelectedVideo(trackUri);
      if (savedVideo && savedVideo.youtubeVideoId) {
        console.log(`[ivLyrics] Loading saved video for track: ${savedVideo.youtubeVideoId}`);
        this.setState({
          videoInfo: {
            youtubeVideoId: savedVideo.youtubeVideoId,
            youtubeTitle: savedVideo.youtubeTitle,
            captionStartTime: savedVideo.captionStartTime,
            communityEntryId: savedVideo.communityEntryId,
            isAutoGenerated: savedVideo.isAutoGenerated
          }
        });
      }
    } catch (error) {
      console.error('[ivLyrics] Failed to load saved video:', error);
    }
  }

  /**
   * 발음 로딩 상태를 시작합니다 (1초 후에 로딩 메시지 표시)
   */
  startPhoneticLoading() {
    this.clearPhoneticLoading();
    this.phoneticLoadingTimer = setTimeout(() => {
      this.setState({ isPhoneticLoading: true });
    }, 1000);
  }

  /**
   * 발음 로딩 상태를 종료합니다
   */
  clearPhoneticLoading() {
    if (this.phoneticLoadingTimer) {
      clearTimeout(this.phoneticLoadingTimer);
      this.phoneticLoadingTimer = null;
    }
    this.setState({ isPhoneticLoading: false });
  }

  /**
   * 번역 로딩 상태를 시작합니다 (1초 후에 로딩 메시지 표시)
   */
  startTranslationLoading() {
    this.clearTranslationLoading();
    this.translationLoadingTimer = setTimeout(() => {
      this.setState({ isTranslationLoading: true });
    }, 1000);
  }

  /**
   * 번역 로딩 상태를 종료합니다
   */
  clearTranslationLoading() {
    if (this.translationLoadingTimer) {
      clearTimeout(this.translationLoadingTimer);
      this.translationLoadingTimer = null;
    }
    this.setState({ isTranslationLoading: false });
  }

  /**
   * 번역 재생성 메서드 - ignore_cache를 true로 설정하여 새로운 번역 요청
   */
  async regenerateTranslation() {
    // 번역이 활성화되어 있는지 확인
    const provider = CONFIG.visual["translate:translated-lyrics-source"];

    if (!provider || provider === "none") {
      return;
    }

    // 현재 가사가 있는지 확인
    if (!this.state.currentLyrics || this.state.currentLyrics.length === 0) {
      Toast.error(I18n.t("notifications.noLyricsLoaded"));
      return;
    }

    const originalLanguage = this.provideLanguageCode(this.state.currentLyrics);
    const friendlyLanguage =
      originalLanguage &&
      new Intl.DisplayNames(["en"], { type: "language" })
        .of(originalLanguage.split("-")[0])
        ?.toLowerCase();
    const modeKey =
      provider === "geminiKo" && !friendlyLanguage
        ? "gemini"
        : friendlyLanguage;
    const mode1 = CONFIG.visual[`translation-mode:${modeKey}`];
    const mode2 = CONFIG.visual[`translation-mode-2:${modeKey}`];

    // Gemini 번역인지 확인
    const isGeminiMode =
      mode1?.startsWith("gemini") || mode2?.startsWith("gemini");

    if (!isGeminiMode) {
      Toast.error(I18n.t("notifications.translationRegenerateGeminiOnly"));
      return;
    }

    // 발음과 번역 중 어떤 것이 필요한지 확인
    const needPhonetic = mode1 === "gemini_romaji" || mode2 === "gemini_romaji";
    const needTranslation = mode1 === "gemini_ko" || mode2 === "gemini_ko";

    // trackId 가져오기
    const trackId = Spicetify.Player.data?.item?.uri?.split(':')[2];
    if (!trackId) {
      Toast.error(I18n.t("notifications.noTrackPlaying"));
      return;
    }

    try {
      this.startTranslationLoading();

      Toast.show(I18n.t("notifications.regeneratingTranslation"), false, 2000);

      // 먼저 로컬 캐시에서 해당 트랙의 번역 캐시 삭제
      const userLang = I18n.getCurrentLanguage();
      try {
        // 번역 캐시 삭제 (발음과 번역 모두)
        await Promise.all([
          LyricsCache.clearTranslationForTrack(trackId),
        ]);
        // 메모리 캐시도 초기화
        window.Translator.clearMemoryCache(trackId);
        window.Translator.clearInflightRequests(trackId);
        console.log(`[regenerateTranslation] Cleared local cache for ${trackId}`);
      } catch (e) {
        console.warn('[regenerateTranslation] Failed to clear cache:', e);
      }

      // 원본 가사 가져오기 (번역되지 않은 원문)
      const lyricsState = this.state;
      const currentMode = this.getCurrentMode();

      // 원본 가사를 가져오기 위해 synced, karaoke, unsynced 중 현재 모드에 해당하는 것 사용
      let originalLyrics = [];
      if (currentMode === KARAOKE && this.state.karaoke) {
        originalLyrics = this.state.karaoke;
      } else if (currentMode === SYNCED && this.state.synced) {
        originalLyrics = this.state.synced;
      } else if (currentMode === UNSYNCED && this.state.unsynced) {
        originalLyrics = this.state.unsynced;
      } else {
        // fallback: currentLyrics에서 originalText 사용
        originalLyrics = this.state.currentLyrics || [];
      }

      // Section line 제거하고 원문 텍스트만 추출 (getGeminiTranslation과 동일)
      const allLines = originalLyrics.map((l) => l?.text || "").filter(Boolean);
      const nonSectionLines = allLines.filter(
        (line) => !Utils.isSectionHeader(line)
      );
      const text = nonSectionLines.join("\n");

      // 발음과 번역을 별도로 요청 (둘 다 필요한 경우)
      let phoneticResponse = null;
      let translationResponse = null;

      // 발음 요청 (gemini_romaji)
      if (needPhonetic) {
        phoneticResponse = await window.Translator.callGemini({
          trackId,
          artist: this.state.artist || lyricsState.artist,
          title: this.state.title || lyricsState.title,
          text,
          wantSmartPhonetic: true,
          provider: lyricsState.provider,
          ignoreCache: true,
        });
      }

      // 번역 요청 (gemini_ko)
      if (needTranslation) {
        translationResponse = await window.Translator.callGemini({
          trackId,
          artist: this.state.artist || lyricsState.artist,
          title: this.state.title || lyricsState.title,
          text,
          wantSmartPhonetic: false,
          provider: lyricsState.provider,
          ignoreCache: true,
        });
      }

      // 번역 결과를 getGeminiTranslation과 동일한 방식으로 처리하는 함수
      const processTranslationResult = (outText, lyrics) => {
        if (!outText) return null;

        // Handle both array and string formats
        let lines;
        if (Array.isArray(outText)) {
          lines = outText;
        } else if (typeof outText === "string") {
          lines = outText.split("\n");
        } else {
          return null;
        }

        // Create mapping arrays for proper alignment
        const originalNonSectionLines = [];
        const originalNonSectionIndices = [];

        // Collect non-section lines from original lyrics (excluding empty lines)
        lyrics.forEach((line, i) => {
          const text = line?.text || "";
          if (!Utils.isSectionHeader(text) && text.trim() !== "") {
            originalNonSectionLines.push(text);
            originalNonSectionIndices.push(i);
          }
        });

        // Filter out section headers and empty lines from translation results
        const cleanTranslationLines = lines.filter(
          (line) =>
            line && line.trim() !== "" && !Utils.isSectionHeader(line.trim())
        );

        // Use the clean translation lines for mapping
        lines = cleanTranslationLines;

        // Smart mapping that accounts for section headers and empty lines
        const mapped = lyrics.map((line, i) => {
          const originalText = line?.text || "";

          // If this is a section header, keep original and don't show translation
          if (Utils.isSectionHeader(originalText)) {
            return {
              ...line,
              text: null,
              originalText: originalText,
            };
          }

          // If this is an empty line, keep it empty
          if (originalText.trim() === "") {
            return {
              ...line,
              text: "",
              originalText: originalText,
            };
          }

          // Find the translation index for this non-section, non-empty line
          const positionInNonSectionLines =
            originalNonSectionIndices.indexOf(i);
          const translatedText = lines[positionInNonSectionLines]?.trim() || "";

          return {
            ...line,
            text: translatedText || line?.text || "",
            originalText: originalText,
          };
        });

        return mapped;
      };

      // mode1과 mode2 각각 처리 - 둘 다 활성화된 경우 각각의 결과를 올바르게 할당
      let translatedLyrics1 = null;
      let translatedLyrics2 = null;

      // mode1 처리
      if (mode1 === "gemini_romaji" && phoneticResponse?.phonetic) {
        translatedLyrics1 = processTranslationResult(phoneticResponse.phonetic, originalLyrics);
      } else if (mode1 === "gemini_ko" && translationResponse?.vi) {
        translatedLyrics1 = processTranslationResult(translationResponse.vi, originalLyrics);
      }

      // mode2 처리 (mode1과 독립적으로)
      if (mode2 === "gemini_romaji" && phoneticResponse?.phonetic) {
        translatedLyrics2 = processTranslationResult(phoneticResponse.phonetic, originalLyrics);
      } else if (mode2 === "gemini_ko" && translationResponse?.vi) {
        translatedLyrics2 = processTranslationResult(translationResponse.vi, originalLyrics);
      }

      // _dmResults에 번역 결과 저장
      const currentUri = this.state.uri;
      if (!this._dmResults) {
        this._dmResults = {};
      }
      if (!this._dmResults[currentUri]) {
        this._dmResults[currentUri] = {};
      }

      // mode1과 mode2 결과 저장
      this._dmResults[currentUri].mode1 = translatedLyrics1;
      this._dmResults[currentUri].mode2 = translatedLyrics2;
      this._dmResults[currentUri].lastMode1 = mode1;
      this._dmResults[currentUri].lastMode2 = mode2;

      // CacheManager에도 새 결과 저장 (getGeminiTranslation에서 캐시 히트하도록)
      const currentProvider = lyricsState.provider || '';
      if (translatedLyrics1 && mode1) {
        CacheManager.set(`${currentUri}:${currentProvider}:${mode1}`, translatedLyrics1);
      }
      if (translatedLyrics2 && mode2) {
        CacheManager.set(`${currentUri}:${currentProvider}:${mode2}`, translatedLyrics2);
      }

      // lyricsSource를 다시 호출하여 기존 로직으로 화면 업데이트
      // 이렇게 하면 optimizeTranslations이 호출되어 사용자 설정에 따라 번역이 표시됨
      this.lyricsSource(this.state, currentMode);
      Toast.success(I18n.t("notifications.translationRegenerated"));
    } catch (error) {
      Toast.error(`${I18n.t("notifications.translationRegenerateFailed")}: ${error.message}`);
    } finally {
      this.clearTranslationLoading();
    }
  }

  infoFromTrack(track) {
    const meta = track?.metadata;
    if (!meta) {
      return null;
    }
    return {
      duration: Number(meta.duration),
      album: meta.album_title,
      artist: meta.artist_name,
      title: meta.title,
      uri: track.uri,
      image: meta.image_url,
    };
  }

  async fetchColors(uri) {
    let vibrant = 0;
    try {
      try {
        const { fetchExtractedColorForTrackEntity } =
          Spicetify.GraphQL.Definitions;
        const { data } = await Spicetify.GraphQL.Request(
          fetchExtractedColorForTrackEntity,
          { uri }
        );
        const { hex } =
          data.trackUnion.albumOfTrack.coverArt.extractedColors.colorDark;
        vibrant = Number.parseInt(hex.replace("#", ""), 16);
      } catch {
        const colors = await Spicetify.CosmosAsync.get(
          `https://spclient.wg.spotify.com/colorextractor/v1/extract-presets?uri=${uri}&format=json`
        );
        vibrant = colors.entries[0].color_swatches.find(
          (color) => color.preset === "VIBRANT_NON_ALARMING"
        ).color;
      }
    } catch {
      vibrant = 8747370;
    }

    this.setState({
      colors: {
        background: Utils.convertIntToRGB(vibrant),
        inactive: Utils.convertIntToRGB(vibrant, 3),
      },
    });
  }

  async fetchTempo(uri) {
    const audio = await Spicetify.CosmosAsync.get(
      `https://api.spotify.com/v1/audio-features/${uri.split(":")[2]}`
    );
    let tempo = audio.tempo;

    const MIN_TEMPO = 60;
    const MAX_TEMPO = 150;
    const MAX_PERIOD = 0.4;
    if (!tempo) tempo = 105;
    if (tempo < MIN_TEMPO) tempo = MIN_TEMPO;
    if (tempo > MAX_TEMPO) tempo = MAX_TEMPO;

    let period =
      MAX_PERIOD - ((tempo - MIN_TEMPO) / (MAX_TEMPO - MIN_TEMPO)) * MAX_PERIOD;
    period = Math.round(period * 100) / 100;

    this.setState({
      tempo: `${String(period)}s`,
    });
  }

  /**
   * @deprecated LyricsService.getLyricsFromProviders 사용 권장
   * 가사 로드는 Extension(LyricsService)을 통해 처리됨
   */
  async tryServices(trackInfo, mode = -1) {
    // LyricsService Extension을 통해 가사 로드
    if (window.LyricsService?.getLyricsFromProviders) {
      const providerOrder = CONFIG.providersOrder.filter(id => CONFIG.providers[id]?.on);
      const result = await window.LyricsService.getLyricsFromProviders(trackInfo, providerOrder, mode);
      if (!result.uri) result.uri = trackInfo.uri;
      return result;
    }

    // LyricsService가 없으면 에러
    console.error('[LyricsContainer] LyricsService Extension이 로드되지 않았습니다.');
    return { ...emptyState, uri: trackInfo.uri, error: 'LyricsService not loaded' };
  }

  async fetchLyrics(track, mode = -1, refresh = false) {
    try {
      const info = this.infoFromTrack(track);
      if (!info) {
        this.setState({ error: "No track info", isLoading: false });
        return;
      }

      // 트랙별 언어 오버라이드 로드 (IndexedDB)
      try {
        this.trackLanguageOverride = await TrackLanguageDB.getLanguage(info.uri);
      } catch (e) {
        console.warn("[ivLyrics] Failed to load track language override:", e);
        this.trackLanguageOverride = null;
      }

      // keep artist/title for prompts
      this.setState({ artist: info.artist, title: info.title, coverUrl: info.image, translatedMetadata: null });

      // 메타데이터 번역 요청 (백그라운드에서 비동기로)
      this.fetchMetadataTranslation(info.uri, info.title, info.artist);

      let isCached = this.lyricsSaved(info.uri);

      if (CONFIG.visual.colorful || CONFIG.visual["gradient-background"]) {
        this.fetchColors(info.uri);
      }

      this.fetchTempo(info.uri);
      this.resetDelay();

      let tempState;
      // if lyrics are cached
      if (
        (mode === -1 && CACHE[info.uri]) ||
        CACHE[info.uri]?.[CONFIG.modes?.[mode]]
      ) {
        tempState = { ...CACHE[info.uri], isCached };
        if (CACHE[info.uri]?.mode) {
          this.state.explicitMode = CACHE[info.uri]?.mode;
          tempState = { ...tempState, mode: CACHE[info.uri]?.mode };
        }
      } else {
        // Save current mode before loading to maintain UI consistency
        const currentMode = this.getCurrentMode();
        this.lastModeBeforeLoading = currentMode !== -1 ? currentMode : SYNCED;
        this.setState({ ...emptyState, isLoading: true, isCached: false });

        // LyricsService Extension을 통해 가사 로드
        const providerOrder = CONFIG.providersOrder.filter(id => CONFIG.providers[id]?.on);
        const resp = await window.LyricsService.getLyricsFromProviders(info, providerOrder, mode);
        if (!resp.uri) resp.uri = info.uri;

        if (resp.provider) {
          // Cache lyrics
          CACHE[resp.uri] = resp;
        }

        // This True when the user presses the Cache Lyrics button and saves it to localStorage.
        isCached = this.lyricsSaved(resp.uri);

        // In case user skips tracks too fast and multiple callbacks
        // set wrong lyrics to current track.
        if (resp.uri === this.currentTrackUri) {
          tempState = { ...resp, isLoading: false, isCached };
        } else {
          return;
        }
      }

      // Check if lyrics indicate no lyrics / instrumental
      // Conditions:
      // 1. Total lines <= 3
      // 2. First line contains "no lyrics" or "instrumental"
      const checkNoLyrics = (lyrics) => {
        if (!lyrics || lyrics.length === 0) return false;
        if (lyrics.length > 3) return false;

        // Check first non-empty line
        const firstLine = lyrics[0]?.text?.toLowerCase()?.trim() || '';
        if (firstLine.includes('no lyrics') || firstLine.includes('instrumental')) {
          return true;
        }

        // Also check if all lines combined contain these keywords
        const allText = lyrics.map(line => line.text || '').join(' ').toLowerCase();
        if (allText.includes('no lyrics') || allText.includes('instrumental')) {
          return true;
        }

        return false;
      };

      // If all lyrics types indicate no lyrics, treat as instrumental
      const isInstrumental =
        checkNoLyrics(tempState.karaoke) ||
        checkNoLyrics(tempState.synced) ||
        checkNoLyrics(tempState.unsynced);

      if (isInstrumental) {
        tempState = {
          ...tempState,
          karaoke: null,
          synced: null,
          unsynced: null,
          error: "Instrumental"
        };
      }

      let finalMode = mode;
      if (mode === -1) {
        if (this.state.explicitMode !== -1) {
          finalMode = this.state.explicitMode;
        } else if (this.state.lockMode !== -1) {
          finalMode = this.state.lockMode;
        } else {
          // Auto switch: prefer karaoke, then synced, then unsynced
          if (tempState.karaoke) {
            finalMode = KARAOKE;
          } else if (tempState.synced) {
            finalMode = SYNCED;
          } else if (tempState.unsynced) {
            finalMode = UNSYNCED;
          }
        }
      }

      // if song changed one time
      if (tempState.uri !== this.state.uri || refresh) {
        // Detect language from the new lyrics data
        let defaultLanguage = null;
        if (tempState.synced) {
          defaultLanguage = Utils.detectLanguage(tempState.synced);
        } else if (tempState.unsynced) {
          defaultLanguage = Utils.detectLanguage(tempState.unsynced);
        }

        // reset and apply - preserve cached translations if available
        this.setState({
          furigana: null,
          romaji: null,
          hiragana: null,
          katakana: null,
          hangul: null,
          romaja: null,
          cn: null,
          hk: null,
          tw: null,
          ...tempState,
          language: defaultLanguage,
          ...this.applyTranslationStates(tempState),
        });
        return;
      }

      // Preserve cached translations when not changing songs
      this.setState({
        ...tempState,
        ...this.applyTranslationStates(tempState),
      });
    } catch (error) {
      this.setState({
        error: `Failed to fetch lyrics: ${error.message}`,
        isLoading: false,
        ...emptyState,
      });
    }
  }

  lyricsSource(lyricsState, mode) {
    if (!lyricsState) return;

    let lyrics = lyricsState[CONFIG.modes[mode]];
    // Fallback: if the preferred mode has no lyrics, use any available lyrics
    if (!lyrics) {
      lyrics =
        lyricsState.karaoke ||
        lyricsState.synced ||
        lyricsState.unsynced ||
        null;
      if (!lyrics) {
        this.setState({ currentLyrics: [] });
        // 오버레이에 가사 없음 상태 전송 (트랙 정보 업데이트용)
        window.dispatchEvent(new CustomEvent('ivLyrics:lyrics-ready', {
          detail: {
            trackInfo: { uri: lyricsState.uri, title: this.state.title, artist: this.state.artist },
            lyrics: []
          }
        }));
        return;
      }
    }

    // Clean up any existing progress flags from previous songs
    const currentUri = lyricsState.uri;
    if (this.lastCleanedUri !== currentUri) {
      // Remove all progress flags
      Object.keys(this).forEach((key) => {
        if (key.includes(":inProgress")) {
          delete this[key];
        }
      });
      // Reset per-track progressive results and inflight maps
      this._dmResults = {};
      this._inflightGemini = new Map();
      this.lastCleanedUri = currentUri;
    }

    // Handle translation and display modes efficiently
    const originalLanguage = this.provideLanguageCode(lyrics);
    let friendlyLanguage = null;

    if (originalLanguage) {
      try {
        friendlyLanguage = new Intl.DisplayNames(["en"], { type: "language" })
          .of(originalLanguage.split("-")[0])
          ?.toLowerCase();
      } catch (error) {
        // Error ignored
      }
    }

    // For Gemini mode, use generic keys if no specific language detected
    const provider = CONFIG.visual["translate:translated-lyrics-source"];
    const modeKey =
      provider === "geminiKo" && !friendlyLanguage
        ? "gemini"
        : friendlyLanguage;

    const displayMode1 = CONFIG.visual[`translation-mode:${modeKey}`];
    const displayMode2 = CONFIG.visual[`translation-mode-2:${modeKey}`];

    this.language = originalLanguage;
    this.displayMode = displayMode1; // Keep for legacy compatibility
    this.displayMode2 = displayMode2;

    const processMode = async (mode, baseLyrics) => {
      if (!mode || mode === "none") {
        console.log("[processMode] Mode is none or empty:", mode);
        return null;
      }
      console.log("[processMode] Processing mode:", mode);
      try {
        if (String(mode).startsWith("gemini")) {
          const result = await this.getGeminiTranslation(
            lyricsState,
            baseLyrics,
            mode
          );
          console.log("[processMode] Gemini result sample:", result?.[0]);
          return result;
        } else {
          return await this.getTraditionalConversion(
            lyricsState,
            baseLyrics,
            originalLanguage,
            mode
          );
        }
      } catch (error) {
        const modeDisplayName =
          mode === "gemini_romaji"
            ? I18n.t("notifications.romajiTranslationFailed")
            : I18n.t("notifications.koreanTranslationFailed");
        Toast.error(`${modeDisplayName}: ${error.message || "Unknown error"}`);
        return null; // Return null on failure
      }
    };

    const { uri } = lyricsState; // Capture the URI for this specific request

    // If no display modes are active, just optimize the original lyrics (e.g., to handle note lines)
    if (
      (!displayMode1 || displayMode1 === "none") &&
      (!displayMode2 || displayMode2 === "none")
    ) {
      const optimizedLyrics = this.optimizeTranslations(
        lyrics,
        null,
        null,
        null,
        null
      );
      const finalLyrics = Array.isArray(optimizedLyrics) ? optimizedLyrics : [];
      this.setState({
        currentLyrics: finalLyrics,
      });
      // 🔹 ivLyrics-overlay 앱으로 원문 가사 전송 (번역 모드 미사용)
      window.dispatchEvent(new CustomEvent('ivLyrics:lyrics-ready', {
        detail: {
          trackInfo: { uri, title: this.state.title, artist: this.state.artist },
          lyrics: finalLyrics
        }
      }));
      return;
    }

    // 즉시 원문 표시 - 번역이 로딩되는 동안에도 사용자가 가사를 볼 수 있도록
    // URI 체크: 곡이 변경되지 않았을 때만 표시
    if (this.state.uri === uri) {
      const optimizedOriginal = this.optimizeTranslations(
        lyrics,
        null,
        null,
        null,
        null
      );
      const originalLyrics = Array.isArray(optimizedOriginal) ? optimizedOriginal : [];
      this.setState({
        currentLyrics: originalLyrics,
      });
      // 🔹 ivLyrics-overlay 앱으로 원문 가사 먼저 전송 (번역 로딩 전)
      // 단, 번역 모드가 켜져 있다면 번역이 준비될 때까지 기다림 (UI 깜빡임/레이아웃 변경 방지)
      const isTranslationEnabled = (displayMode1 && displayMode1 !== 'none') || (displayMode2 && displayMode2 !== 'none');

      if (!isTranslationEnabled) {
        window.dispatchEvent(new CustomEvent('ivLyrics:lyrics-ready', {
          detail: {
            trackInfo: { uri, title: this.state.title, artist: this.state.artist },
            lyrics: originalLyrics
          }
        }));
      }
    }

    // Progressive loading: keep results per track so Mode 1 does not disappear when Mode 2 finishes
    // Check if display modes changed - if so, clear cached results
    if (this._dmResults[currentUri]) {
      const cached = this._dmResults[currentUri];
      // If mode settings changed, invalidate cache for that mode
      if (cached.lastMode1 !== displayMode1) {
        cached.mode1 = null;
      }
      if (cached.lastMode2 !== displayMode2) {
        cached.mode2 = null;
      }
    }

    this._dmResults[currentUri] = this._dmResults[currentUri] || {
      mode1: null,
      mode2: null,
    };
    this._dmResults[currentUri].lastMode1 = displayMode1;
    this._dmResults[currentUri].lastMode2 = displayMode2;

    let lyricsMode1 = this._dmResults[currentUri].mode1;
    let lyricsMode2 = this._dmResults[currentUri].mode2;

    const updateCombinedLyrics = () => {
      // Guard clause to prevent race conditions from previous songs
      if (this.state.uri !== uri) {
        return;
      }
      console.log(
        "[updateCombinedLyrics] Mode1 data:",
        lyricsMode1 ? "present" : "null"
      );
      console.log(
        "[updateCombinedLyrics] Mode2 data:",
        lyricsMode2 ? "present" : "null"
      );
      // Smart deduplication and optimization - pass display modes
      const optimizedTranslations = this.optimizeTranslations(
        lyrics,
        lyricsMode1,
        lyricsMode2,
        lyricsMode1 ? displayMode1 : null,
        lyricsMode2 ? displayMode2 : null
      );
      const finalLyrics = Array.isArray(optimizedTranslations)
        ? optimizedTranslations
        : [];

      this.setState({
        currentLyrics: finalLyrics,
      });

      // 🔹 ivLyrics-overlay 앱으로 가사 전송
      window.dispatchEvent(new CustomEvent('ivLyrics:lyrics-ready', {
        detail: {
          trackInfo: { uri, title: this.state.title, artist: this.state.artist },
          lyrics: finalLyrics
        }
      }));
    };

    // 스마트 로딩 전략: 두 모드 모두 활성화된 경우 둘 다 완료될 때까지 기다림
    const mode1Active = displayMode1 && displayMode1 !== "none";
    const mode2Active = displayMode2 && displayMode2 !== "none";

    console.log(
      "[displayTranslations] Mode1:",
      displayMode1,
      "Active:",
      mode1Active
    );
    console.log(
      "[displayTranslations] Mode2:",
      displayMode2,
      "Active:",
      mode2Active
    );

    if (mode1Active && mode2Active) {
      // 두 개 모드 모두 활성화: 각각 완료되는 즉시 업데이트 (Progressive Loading)
      // 캐시된 결과가 있으면 재사용, 없으면 새로 요청
      const promise1 = lyricsMode1
        ? Promise.resolve(lyricsMode1)
        : processMode(displayMode1, lyrics);
      const promise2 = lyricsMode2
        ? Promise.resolve(lyricsMode2)
        : processMode(displayMode2, lyrics);

      // 각 promise가 완료되는 즉시 업데이트
      promise1
        .then((result) => {
          // Guard clause: 다른 곡으로 변경되었는지 확인
          if (this.state.uri !== uri) {
            return;
          }
          if (result) {
            lyricsMode1 = result;
            this._dmResults[currentUri].mode1 = result;
            updateCombinedLyrics(); // 첫 번째 결과가 나오면 즉시 표시
          }
        })
        .catch((error) => {
          console.error("[Mode1] Error:", error);
          // 실패해도 계속 진행
        });

      promise2
        .then((result) => {
          // Guard clause: 다른 곡으로 변경되었는지 확인
          if (this.state.uri !== uri) {
            return;
          }
          if (result) {
            lyricsMode2 = result;
            this._dmResults[currentUri].mode2 = result;
            updateCombinedLyrics(); // 두 번째 결과가 나오면 즉시 추가 표시
          }
        })
        .catch((error) => {
          console.error("[Mode2] Error:", error);
          // 실패해도 계속 진행
        });
    } else if (mode1Active) {
      // Mode1만 활성화: Mode1 완료 시 바로 업데이트
      // Mode2는 비활성화되었으므로 null로 설정
      lyricsMode2 = null;
      this._dmResults[currentUri].mode2 = null;

      // 캐시된 결과가 있으면 바로 업데이트, 없으면 새로 요청
      if (lyricsMode1) {
        updateCombinedLyrics();
      } else {
        processMode(displayMode1, lyrics)
          .then((result) => {
            lyricsMode1 = result;
            this._dmResults[currentUri].mode1 = result;
            updateCombinedLyrics();
          })
          .catch((error) => {
            // 실패해도 UI 업데이트 (원문은 이미 표시됨)
            updateCombinedLyrics();
          });
      }
    } else if (mode2Active) {
      // Mode2만 활성화: Mode2 완료 시 바로 업데이트
      // Mode1은 비활성화되었으므로 null로 설정
      lyricsMode1 = null;
      this._dmResults[currentUri].mode1 = null;

      // 캐시된 결과가 있으면 바로 업데이트, 없으면 새로 요청
      if (lyricsMode2) {
        updateCombinedLyrics();
      } else {
        processMode(displayMode2, lyrics)
          .then((result) => {
            lyricsMode2 = result;
            this._dmResults[currentUri].mode2 = result;
            updateCombinedLyrics();
          })
          .catch((error) => {
            // 실패해도 UI 업데이트 (원문은 이미 표시됨)
            updateCombinedLyrics();
          });
      }
    }
  }

  /**
   * Smart optimization for translations - removes duplicates and identical content
   * @param {Array} originalLyrics - Original lyrics
   * @param {Array} mode1 - Translation from Display Mode 1
   * @param {Array} mode2 - Translation from Display Mode 2
   * @param {String} displayMode1 - Mode type for mode1 (e.g., "gemini_romaji", "gemini_ko")
   * @param {String} displayMode2 - Mode type for mode2
   * @returns {Array} Optimized lyrics with smart deduplication
   */
  optimizeTranslations(
    originalLyrics,
    mode1,
    mode2,
    displayMode1,
    displayMode2
  ) {
    // React 31 방지: 배열 유효성 검사
    if (!originalLyrics || !Array.isArray(originalLyrics)) {
      return [];
    }

    // Determine which mode is phonetic (romaji) and which is translation
    const mode1IsPhonetic = displayMode1 === "gemini_romaji";
    const mode2IsPhonetic = displayMode2 === "gemini_romaji";

    // Helper: note/placeholder-only line (e.g., ♪, …)
    const isNoteLine = (text) => {
      const t = String(text || "").trim();
      if (!t) return true;
      return /^[\s♪♩♫♬·•・。.、…~\-]+$/.test(t);
    };

    // Helper function to normalize text for comparison
    const normalizeForComparison = (text) => {
      if (!text || typeof text !== "string") return "";
      return text
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, "") // remove punctuation/symbols but keep letters/numbers of any script
        .replace(/\s+/g, " ")
        .trim();
    };

    // Helper function to check if two translations are similar (>85% similarity)
    const areTranslationsSimilar = (text1, text2) => {
      if (!text1 || !text2) return false;
      const norm1 = normalizeForComparison(text1);
      const norm2 = normalizeForComparison(text2);
      if (!norm1 || !norm2) return false;
      if (norm1 === norm2) return true;
      const words1 = norm1.split(" ").filter((w) => w.length > 2);
      const words2 = norm2.split(" ").filter((w) => w.length > 2);
      if (words1.length === 0 || words2.length === 0) return false;
      const commonWords = words1.filter((word) => words2.includes(word));
      const similarity =
        commonWords.length / Math.max(words1.length, words2.length);
      return similarity > 0.85;
    };

    // Process each line to determine what to display
    const processedLyrics = originalLyrics.map((line, i) => {
      // React 31 방지: null/undefined 체크 및 안전한 텍스트 추출
      if (!line) {
        return { text: null, text2: null, originalText: "" };
      }

      // Safely extract original text
      const originalText =
        typeof line === "object" ? line.text || "" : String(line || "");
      let translation1 = "";
      let translation2 = "";

      // Safely extract translations with boundary check
      if (mode1 && Array.isArray(mode1) && i < mode1.length && mode1[i]) {
        translation1 =
          typeof mode1[i] === "object"
            ? mode1[i].text || ""
            : String(mode1[i] || "");
      }
      if (mode2 && Array.isArray(mode2) && i < mode2.length && mode2[i]) {
        translation2 =
          typeof mode2[i] === "object"
            ? mode2[i].text || ""
            : String(mode2[i] || "");
      }

      // If original is a note/placeholder line, never show sub-lines
      if (isNoteLine(originalText)) {
        return { ...line, originalText, text: null, text2: null };
      }

      // Ignore translations that are notes-only
      if (isNoteLine(translation1)) translation1 = "";
      if (isNoteLine(translation2)) translation2 = "";

      const normalizedOriginal = normalizeForComparison(originalText);
      const normalizedTrans1 = normalizeForComparison(translation1);
      const normalizedTrans2 = normalizeForComparison(translation2);

      const trans1SameAsOriginal =
        normalizedTrans1 && normalizedTrans1 === normalizedOriginal;
      const trans2SameAsOriginal =
        normalizedTrans2 && normalizedTrans2 === normalizedOriginal;
      const translationsSame =
        normalizedTrans1 &&
        normalizedTrans2 &&
        (normalizedTrans1 === normalizedTrans2 ||
          areTranslationsSimilar(translation1, translation2));

      let finalText = null; // This will be phonetic (romaji/발음)
      let finalText2 = null; // This will be translation (번역)

      // Helper function to process phonetic hyphen replacement
      const processPhoneticHyphen = (text) => {
        if (!text || typeof text !== "string") return text;
        const hyphenMode = CONFIG.visual["phonetic-hyphen-replace"] || "keep";
        if (hyphenMode === "keep") return text;
        if (hyphenMode === "space") return text.replace(/-/g, " ");
        if (hyphenMode === "remove") return text.replace(/-/g, "");
        return text;
      };

      // Assign to correct slots based on mode types
      let phoneticText = "";
      let translationText = "";

      if (mode1IsPhonetic) {
        phoneticText = processPhoneticHyphen(translation1);
      } else if (mode1) {
        translationText = translation1;
      }

      if (mode2IsPhonetic) {
        phoneticText = processPhoneticHyphen(translation2);
      } else if (mode2) {
        translationText = translation2;
      }

      // Deduplication logic
      if (translationsSame) {
        // Both are the same, always show in translation slot (not phonetic)
        const combinedText = translation1 || translation2;
        if (!trans1SameAsOriginal) {
          finalText2 = combinedText; // Always use translation slot when they're the same
        }
      } else {
        // Different results - assign to correct slots
        // finalText = phonetic, finalText2 = translation
        if (!trans1SameAsOriginal && phoneticText) finalText = phoneticText;
        if (!trans2SameAsOriginal && translationText)
          finalText2 = translationText;
        // Also handle case where trans1 is same but trans2 is not
        if (trans1SameAsOriginal && !trans2SameAsOriginal) {
          if (mode2IsPhonetic) {
            finalText = translation2;
          } else {
            finalText2 = translation2;
          }
        } else if (!trans1SameAsOriginal && trans2SameAsOriginal) {
          if (mode1IsPhonetic) {
            finalText = translation1;
          } else {
            finalText2 = translation1;
          }
        }
      }

      // Create safe line object ensuring all properties are valid
      const safeLine = {
        ...(line && typeof line === "object" ? line : {}),
        originalText: String(originalText),
        text: finalText ? String(finalText) : null,
        text2: finalText2 ? String(finalText2) : (line.text2 ? String(line.text2) : null),
      };

      return safeLine;
    });

    return processedLyrics;
  }

  getGeminiTranslation(lyricsState, lyrics, mode) {
    return new Promise((resolve, reject) => {
      const viKey = StorageManager.getPersisted(
        `${APP_NAME}:visual:gemini-api-key`
      );
      const romajiKey = StorageManager.getPersisted(
        `${APP_NAME}:visual:gemini-api-key-romaji`
      );

      // Determine mode type and API key
      let wantSmartPhonetic = false;
      let apiKey;

      if (mode === "gemini_romaji") {
        // Use Smart Phonetic logic for the unified Romaji, Romaja, Pinyin button
        wantSmartPhonetic = true;
        apiKey = "no";
      } else {
        // Default to Korean
        apiKey = "no";
      }

      if (!apiKey || !Array.isArray(lyrics) || lyrics.length === 0) {
        return reject(
          new Error(
            "Gemini API key missing. Please add at least one key in Settings."
          )
        );
      }

      const cacheKey = mode;
      const providerKey = lyricsState.provider || '';
      const cacheKey2 = `${lyricsState.uri}:${providerKey}:${cacheKey}`;
      const cached = CacheManager.get(cacheKey2);

      if (cached) {
        // Fix cached items if they have double-encoded JSON structure
        let fixNeeded = false;
        let targetField = wantSmartPhonetic ? 'phonetic' : 'vi';

        if (cached[targetField] && Array.isArray(cached[targetField]) &&
          cached[targetField].length === 1 && typeof cached[targetField][0] === 'string' &&
          cached[targetField][0].trim().startsWith('{')) {
          try {
            const parsed = JSON.parse(cached[targetField][0]);
            if (wantSmartPhonetic && Array.isArray(parsed.phonetic)) {
              cached.phonetic = parsed.phonetic;
              fixNeeded = true;
            } else if (!wantSmartPhonetic && Array.isArray(parsed.vi)) {
              cached.vi = parsed.vi;
              fixNeeded = true;
            } else if (parsed.vi && Array.isArray(parsed.vi)) {
              // Fallback
              cached[targetField] = parsed.vi;
              fixNeeded = true;
            }
          } catch (e) { }
        }

        return resolve(cached);
      }

      // De-duplicate concurrent calls per (uri, type). Share the same promise for callers
      const inflightKey = `${lyricsState.uri}:${providerKey}:${cacheKey}`;
      if (this._inflightGemini?.has(inflightKey)) {
        return this._inflightGemini
          .get(inflightKey)
          .then(resolve)
          .catch(reject);
      }

      // Use optimized rate limiter with separate keys for each translation type
      const rateLimitKey = mode.replace("gemini_", "gemini-");
      if (!RateLimiter.canMakeCall(rateLimitKey, 5, 2000)) {
        const modeName =
          mode === "gemini_romaji" ? "Romaji, Romaja, Pinyin" : "Korean";
        return reject(
          new Error(
            I18n.t("notifications.tooManyTranslationRequests")
          )
        );
      }

      // Filter out section headers before sending to Gemini for translation
      const allLines = lyrics.map((l) => l?.text || "").filter(Boolean);
      const nonSectionLines = allLines.filter(
        (line) => !Utils.isSectionHeader(line)
      );
      const text = nonSectionLines.join("\n");

      // Start appropriate loading indicator based on mode type (1초 후 표시)
      if (wantSmartPhonetic) {
        this.startPhoneticLoading();
      } else {
        this.startTranslationLoading();
      }

      const inflightPromise = window.Translator.callGemini({
        apiKey,
        artist: this.state.artist || lyricsState.artist,
        title: this.state.title || lyricsState.title,
        text,
        wantSmartPhonetic,
        provider: lyricsState.provider,
      })
        .then((response) => {
          let outText;
          if (wantSmartPhonetic) {
            outText = response.phonetic;
          } else {
            outText = response.vi;
          }

          if (!outText) throw new Error("Empty result from Gemini.");

          // Handle nested JSON packaging (API issue workaround)
          if (Array.isArray(outText) && outText.length === 1 && typeof outText[0] === 'string') {
            try {
              if (outText[0].trim().startsWith('{')) {
                const parsed = JSON.parse(outText[0]);
                if (wantSmartPhonetic && Array.isArray(parsed.phonetic)) {
                  outText = parsed.phonetic;
                } else if (!wantSmartPhonetic && Array.isArray(parsed.vi)) {
                  outText = parsed.vi;
                } else if (parsed.vi && Array.isArray(parsed.vi)) {
                  // Fallback: request was phonetic but response came as vi?
                  // or just general structure match
                  outText = parsed.vi;
                }
              }
            } catch (e) {
              // Not valid JSON, process as standard array
            }
          }

          // Handle both array and string formats
          let lines;
          if (Array.isArray(outText)) {
            lines = outText;
          } else if (typeof outText === "string") {
            lines = outText.split("\n");
          } else {
            throw new Error("Invalid translation format received from Gemini.");
          }

          // Create mapping arrays for proper alignment
          const originalNonSectionLines = [];
          const originalNonSectionIndices = [];

          // Collect non-section lines from original lyrics (excluding empty lines)
          lyrics.forEach((line, i) => {
            const text = line?.text || "";
            if (!Utils.isSectionHeader(text) && text.trim() !== "") {
              originalNonSectionLines.push(text);
              originalNonSectionIndices.push(i);
            }
          });

          // Filter out section headers and empty lines from translation results
          const cleanTranslationLines = lines.filter(
            (line) =>
              line && line.trim() !== "" && !Utils.isSectionHeader(line.trim())
          );

          // Use the clean translation lines for mapping
          lines = cleanTranslationLines;

          // Smart mapping that accounts for section headers and empty lines
          const mapped = lyrics.map((line, i) => {
            const originalText = line?.text || "";

            // If this is a section header, keep original and don't show translation
            if (Utils.isSectionHeader(originalText)) {
              return {
                ...line,
                text: null,
                originalText: originalText,
              };
            }

            // If this is an empty line, keep it empty
            if (originalText.trim() === "") {
              return {
                ...line,
                text: "",
                originalText: originalText,
              };
            }

            // Find the translation index for this non-section, non-empty line
            const positionInNonSectionLines =
              originalNonSectionIndices.indexOf(i);
            const translatedText =
              lines[positionInNonSectionLines]?.trim() || "";

            return {
              ...line,
              text: translatedText || line?.text || "",
              originalText: originalText,
            };
          });
          CacheManager.set(cacheKey2, mapped);
          return mapped;
        })
        .finally(() => {
          // Clear appropriate loading indicator based on mode type
          if (wantSmartPhonetic) {
            this.clearPhoneticLoading();
          } else {
            this.clearTranslationLoading();
          }
          this._inflightGemini = this._inflightGemini || new Map();
          this._inflightGemini?.delete(inflightKey);
        });

      this._inflightGemini = this._inflightGemini || new Map();
      this._inflightGemini.set(inflightKey, inflightPromise);
      inflightPromise.then(resolve).catch(reject);
    });
  }

  getTraditionalConversion(lyricsState, lyrics, language, displayMode) {
    return new Promise((resolve, reject) => {
      if (!Array.isArray(lyrics))
        return reject(new Error("Invalid lyrics format for conversion."));

      const cacheKey = `${lyricsState.uri}:trad:${language}:${displayMode}`;
      const cached = CacheManager.get(cacheKey);
      if (cached) return resolve(cached);

      // De-duplicate concurrent calls per (uri, language, mode)
      this._inflightTrad = this._inflightTrad || new Map();
      const inflightKey = `${lyricsState.uri}:trad:${language}:${displayMode}`;
      if (this._inflightTrad.has(inflightKey)) {
        return this._inflightTrad.get(inflightKey).then(resolve).catch(reject);
      }

      // Start translation loading indicator (1초 후 표시)
      this.startTranslationLoading();

      const inflightPromise = this.translateLyrics(
        language,
        lyrics,
        displayMode
      )
        .then((translated) => {
          if (translated !== undefined && translated !== null) {
            CacheManager.set(cacheKey, translated);
            return translated;
          }
          throw new Error("Empty result from conversion.");
        })
        .finally(() => {
          this.clearTranslationLoading();
          this._inflightTrad.delete(inflightKey);
        });

      this._inflightTrad.set(inflightKey, inflightPromise);
      inflightPromise.then(resolve).catch(reject);
    });
  }

  provideLanguageCode(lyrics) {
    if (!lyrics) return null;

    // 1. 트랙별 언어 오버라이드 우선 확인 (IndexedDB에서 로드된 값)
    if (this.trackLanguageOverride) {
      Utils.setDetectedLanguage(this.trackLanguageOverride);
      return this.trackLanguageOverride;
    }

    const provider = CONFIG.visual["translate:translated-lyrics-source"];

    // For Gemini API, always detect language from lyrics (no override needed)
    if (provider === "geminiKo") {
      // If we have a cached language in state, use it
      if (this.state.language) {
        // Update Utils detected language for furigana check
        Utils.setDetectedLanguage(this.state.language);
        return this.state.language;
      }

      // Otherwise, detect language from lyrics
      const detectedLanguage = Utils.detectLanguage(lyrics);
      // Update Utils detected language for furigana check
      Utils.setDetectedLanguage(detectedLanguage);
      return detectedLanguage;
    }

    // For Kuromoji mode, use language override if set
    if (CONFIG.visual["translate:detect-language-override"] !== "off") {
      const overrideLanguage =
        CONFIG.visual["translate:detect-language-override"];
      // Update Utils detected language for furigana check
      Utils.setDetectedLanguage(overrideLanguage);
      return overrideLanguage;
    }

    // If we have a cached language in state, use it
    if (this.state.language) {
      // Update Utils detected language for furigana check
      Utils.setDetectedLanguage(this.state.language);
      return this.state.language;
    }

    // Otherwise, detect language from lyrics
    const detectedLanguage = Utils.detectLanguage(lyrics);
    // Update Utils detected language for furigana check
    Utils.setDetectedLanguage(detectedLanguage);
    return detectedLanguage;
  }

  async translateLyrics(language, lyrics, targetConvert) {
    if (
      !language ||
      !Array.isArray(lyrics) ||
      String(targetConvert).startsWith("gemini")
    ) {
      return lyrics;
    }

    if (!this.translator) {
      this.translator = new window.Translator(language);
    }
    await this.translator.awaitFinished(language);

    let result;
    try {
      if (language === "ja") {
        // Japanese
        const map = {
          romaji: { target: "romaji", mode: "spaced" },
          furigana: { target: "hiragana", mode: "furigana" },
          hiragana: { target: "hiragana", mode: "normal" },
          katakana: { target: "katakana", mode: "normal" },
        };

        if (!map[targetConvert]) return lyrics;

        result = await Promise.all(
          lyrics.map(
            async (lyric) =>
              await this.translator.romajifyText(
                lyric?.text || "",
                map[targetConvert].target,
                map[targetConvert].mode
              )
          )
        );
      } else if (language === "ko") {
        // Korean
        if (targetConvert !== "romaja") return lyrics;
        result = await Promise.all(
          lyrics.map(
            async (lyric) =>
              await this.translator.convertToRomaja(
                lyric?.text || "",
                targetConvert
              )
          )
        );
      } else if (language === "zh-hans") {
        // Chinese (Simplified)
        if (targetConvert === "pinyin") {
          result = await Promise.all(
            lyrics.map(
              async (lyric) =>
                await this.translator.convertToPinyin(lyric?.text || "", {
                  toneType: "mark",
                  type: "string",
                })
            )
          );
          // Warn if pinyin conversion produced no visible changes (likely CDN blocked -> fallback)
          const anyChanged = lyrics.some(
            (lyric, i) => (result?.[i] ?? "") !== (lyric?.text || "")
          );
          if (!anyChanged) {
            Toast.error(I18n.t("notifications.pinyinLibraryUnavailable"));
          }
        } else {
          const map = {
            cn: { from: "cn", target: "cn" },
            tw: { from: "cn", target: "tw" },
            hk: { from: "cn", target: "hk" },
          };

          // prevent conversion between the same language.
          if (targetConvert === "cn") {
            Toast.show(I18n.t("notifications.conversionSkippedSimplified"));
            return lyrics;
          }

          result = await Promise.all(
            lyrics.map(
              async (lyric) =>
                await this.translator.convertChinese(
                  lyric?.text || "",
                  map[targetConvert].from,
                  map[targetConvert].target
                )
            )
          );
        }
      } else if (language === "zh-hant") {
        // Chinese (Traditional)
        if (targetConvert === "pinyin") {
          result = await Promise.all(
            lyrics.map(
              async (lyric) =>
                await this.translator.convertToPinyin(lyric?.text || "", {
                  toneType: "mark",
                  type: "string",
                })
            )
          );
          // Warn if pinyin conversion produced no visible changes (likely CDN blocked -> fallback)
          const anyChanged = lyrics.some(
            (lyric, i) => (result?.[i] ?? "") !== (lyric?.text || "")
          );
          if (!anyChanged) {
            Toast.error(I18n.t("notifications.pinyinLibraryUnavailable"));
          }
        } else {
          const map = {
            cn: { from: "t", target: "cn" },
            hk: { from: "t", target: "hk" },
            tw: { from: "t", target: "tw" },
          };

          if (!map[targetConvert]) return lyrics;

          // Allow conversion from Traditional Chinese to different variants/simplified
          result = await Promise.all(
            lyrics.map(
              async (lyric) =>
                await this.translator.convertChinese(
                  lyric?.text || "",
                  map[targetConvert].from,
                  map[targetConvert].target
                )
            )
          );
        }
      }

      const res = Utils.processTranslatedLyrics(result, lyrics);
      Toast.success(I18n.t("notifications.conversionCompleted"));
      return res;
    } catch (error) {
      Toast.error(`${I18n.t("notifications.conversionFailed")}: ${error.message || "Unknown error"}`
      );
    }
  }

  /**
   * 커뮤니티 싱크 오프셋 자동 적용
   */
  async applyCommunityOffset(trackUri) {
    try {
      // 이미 로컬에 저장된 오프셋이 있으면 스킵
      const localOffset = await Utils.getTrackSyncOffset(trackUri);
      if (localOffset && localOffset !== 0) {
        console.log(`[ivLyrics] Using local offset: ${localOffset}ms`);
        return;
      }

      // 커뮤니티 오프셋 조회
      const communityData = await Utils.getCommunityOffset(trackUri);
      if (!communityData) return;

      const minConfidence = CONFIG.visual["community-sync-min-confidence"] || 0.5;

      // 신뢰도가 최소값 이상인 경우에만 적용
      if ((communityData.confidence ?? 0) >= minConfidence) {
        const offsetToApply = communityData.medianOffsetMs ?? communityData.offsetMs ?? 0;

        if (offsetToApply !== 0) {
          await Utils.setTrackSyncOffset(trackUri, offsetToApply);
          console.log(`[ivLyrics] Applied community offset: ${offsetToApply}ms (confidence: ${communityData.confidence})`);

          // UI 업데이트를 위해 이벤트 발생
          window.dispatchEvent(new CustomEvent('ivLyrics:offset-changed', {
            detail: { trackUri, offset: offsetToApply }
          }));
        }
      }
    } catch (error) {
      console.error("[ivLyrics] Failed to apply community offset:", error);
    }
  }

  resetDelay() {
    CONFIG.visual.delay =
      Number(
        StorageManager.getItem(`lyrics-delay:${Spicetify.Player.data.item.uri}`)
      ) || 0;
  }

  // Helper method to get translation states for saving/restoring
  getTranslationStates() {
    return {
      romaji: this.state.romaji,
      furigana: this.state.furigana,
      hiragana: this.state.hiragana,
      katakana: this.state.katakana,
      hangul: this.state.hangul,
      romaja: this.state.romaja,
      cn: this.state.cn,
      hk: this.state.hk,
      tw: this.state.tw,
      currentLyrics: this.state.currentLyrics,
      language: this.state.language,
    };
  }

  // Helper method to apply translation states
  applyTranslationStates(states, additional = {}) {
    return {
      ...additional,
      ...(states.romaji && { romaji: states.romaji }),
      ...(states.furigana && { furigana: states.furigana }),
      ...(states.hiragana && { hiragana: states.hiragana }),
      ...(states.katakana && { katakana: states.katakana }),
      ...(states.hangul && { hangul: states.hangul }),
      ...(states.romaja && { romaja: states.romaja }),
      ...(states.cn && { cn: states.cn }),
      ...(states.hk && { hk: states.hk }),
      ...(states.tw && { tw: states.tw }),
      ...(states.currentLyrics && { currentLyrics: states.currentLyrics }),
      ...(states.language && { language: states.language }),
    };
  }

  saveLocalLyrics(uri, lyrics) {
    // Include translations and phonetic conversions in cache
    const fullLyricsData = {
      ...lyrics,
      ...this.getTranslationStates(),
    };

    const localLyrics =
      JSON.parse(StorageManager.getItem(`${APP_NAME}:local-lyrics`)) || {};
    localLyrics[uri] = fullLyricsData;
    StorageManager.setItem(
      `${APP_NAME}:local-lyrics`,
      JSON.stringify(localLyrics)
    );
    this.setState({ isCached: true });
  }

  deleteLocalLyrics(uri) {
    const localLyrics =
      JSON.parse(StorageManager.getItem(`${APP_NAME}:local-lyrics`)) || {};
    delete localLyrics[uri];
    StorageManager.setItem(
      `${APP_NAME}:local-lyrics`,
      JSON.stringify(localLyrics)
    );
    this.setState({ isCached: false });
  }

  lyricsSaved(uri) {
    const localLyrics =
      JSON.parse(StorageManager.getItem(`${APP_NAME}:local-lyrics`)) || {};
    return !!localLyrics[uri];
  }

  resetTranslationCache(uri) {
    // Clear translation cache for this URI
    const clearedCount = CacheManager.clearByUri(uri);

    // Clear progressive results for this track
    if (this._dmResults && this._dmResults[uri]) {
      delete this._dmResults[uri];
    }

    // Clear inflight Gemini requests for this track
    if (this._inflightGemini) {
      const keysToDelete = [];
      for (const [key] of this._inflightGemini) {
        if (key.includes(uri)) {
          keysToDelete.push(key);
        }
      }
      keysToDelete.forEach((key) => this._inflightGemini.delete(key));
    }

    // Check if there are any translations to reset
    const hasTranslations =
      this.state.romaji ||
      this.state.furigana ||
      this.state.hiragana ||
      this.state.katakana ||
      this.state.hangul ||
      this.state.romaja ||
      this.state.cn ||
      this.state.hk ||
      this.state.tw;

    // Reset translation states
    this.setState({
      romaji: null,
      furigana: null,
      hiragana: null,
      katakana: null,
      hangul: null,
      romaja: null,
      cn: null,
      hk: null,
      tw: null,
    });

    // Force re-process lyrics with current display modes
    const currentMode = this.getCurrentMode();
    this.lyricsSource(this.state, currentMode);

    if (hasTranslations) {
      Toast.success(I18n.t("notifications.translationCacheReset").replace("{count}", clearedCount));
    } else {
      Toast.success(I18n.t("notifications.translationCacheRemoved"));
    }
  }

  processLyricsFromFile(event) {
    const file = event.target.files;
    if (!file.length) return;
    const reader = new FileReader();

    if (file[0].size > 1024 * 1024) {
      Toast.error(I18n.t("notifications.fileTooLarge"));
      return;
    }

    reader.onload = (e) => {
      try {
        const localLyrics = Utils.parseLocalLyrics(e.target.result);
        const parsedKeys = Object.keys(localLyrics)
          .filter((key) => localLyrics[key])
          .map((key) => key[0].toUpperCase() + key.slice(1));

        if (!parsedKeys.length) {
          Toast.error(I18n.t("notifications.noValidLyricsInFile"));
          return;
        }

        this.setState({
          ...localLyrics,
          provider: "local",
          ...this.applyTranslationStates(localLyrics),
        });
        CACHE[this.currentTrackUri] = {
          ...localLyrics,
          provider: "local",
          uri: this.currentTrackUri,
        };
        this.saveLocalLyrics(this.currentTrackUri, localLyrics);

        Toast.success(I18n.t("notifications.lyricsLoadedFromFile").replace("{types}", parsedKeys.join(", ")));
      } catch (e) {
        Toast.error(I18n.t("notifications.lyricsLoadFailed"));
      }
    };

    reader.onerror = (e) => {
      Toast.error(I18n.t("notifications.fileReadFailed"));
    };

    reader.readAsText(file[0]);
    event.target.value = "";
  }
  initMoustrap() {
    if (!this.mousetrap && Spicetify.Mousetrap) {
      this.mousetrap = new Spicetify.Mousetrap();
    }
  }

  componentDidMount() {
    // Prevent duplicate global registration
    if (window.lyricContainer && window.lyricContainer !== this) {
      if (typeof window.lyricContainer.componentWillUnmount === "function") {
        window.lyricContainer.componentWillUnmount();
      }
    }

    // Register instance for external access
    window.lyricContainer = this;

    // Prefetcher에 LyricsContainer 참조 설정
    Prefetcher.setLyricsContainer(this);

    // Cache DOM elements to avoid repeated queries
    this._domCache = {
      viewport: null,
      fadContainer: null,
      fileInput: null,
    };

    // Check for first-run setup wizard
    if (typeof isSetupNeeded === "function" && isSetupNeeded()) {
      setTimeout(() => {
        if (typeof openSetupWizard === "function") {
          openSetupWizard();
        }
      }, 500); // Small delay to ensure all components are loaded
    }

    // Check for updates when app starts
    setTimeout(() => {
      Utils.showUpdateNotificationIfAvailable().catch((error) => {
        // Error ignored
      });
    }, 3000); // Delay to avoid interfering with app startup

    // Initialize enhanced cache system only once
    if (!CacheManager._initialized) {
      CacheManager.init();
      CacheManager._initialized = true;
    }

    this.onQueueChange = async ({ data: queue }) => {
      // 이전 트랙의 진행 중인 번역 요청 정리
      const previousTrackId = this.currentTrackUri?.split(':')[2];
      if (previousTrackId) {
        window.Translator.clearInflightRequests(previousTrackId);
      }

      this.state.explicitMode = this.state.lockMode;
      this.currentTrackUri = queue.current.uri;
      this.fetchLyrics(queue.current, this.state.explicitMode);
      this.viewPort.scrollTo(0, 0);

      // 트랙 변경 시 videoInfo 초기화 후 저장된 영상 확인
      this.setState({ videoInfo: null });
      this.loadSavedVideoForTrack(queue.current.uri);

      // 커뮤니티 싱크 오프셋 자동 적용
      if (CONFIG.visual["community-sync-enabled"] && CONFIG.visual["community-sync-auto-apply"]) {
        this.applyCommunityOffset(queue.current.uri);
      }

      // 다음 곡의 모든 요소 프리페치 (가사 → 번역/발음 → 영상 배경)
      const nextTrack = queue.queued?.[0] || queue.nextUp?.[0];
      const nextInfo = this.infoFromTrack(nextTrack);
      // Debounce next track fetch
      if (!nextInfo || nextInfo.uri === this.nextTrackUri) return;
      this.nextTrackUri = nextInfo.uri;

      // Prefetcher가 가사부터 번역/영상까지 순차적으로 처리
      Prefetcher.prefetchNextTrack(nextInfo, this.state.explicitMode);
    };

    if (Spicetify.Player?.data?.item) {
      this.state.explicitMode = this.state.lockMode;
      this.currentTrackUri = Spicetify.Player.data.item.uri;
      this.fetchLyrics(Spicetify.Player.data.item, this.state.explicitMode);
      // 초기 로드 시 저장된 영상 확인
      this.loadSavedVideoForTrack(Spicetify.Player.data.item.uri);
    }

    this.updateVisualOnConfigChange();
    Utils.addQueueListener(this.onQueueChange);

    lyricContainerUpdate = () => {
      this.reRenderLyricsPage = !this.reRenderLyricsPage;
      this.updateVisualOnConfigChange();
      this.forceUpdate();
    };

    reloadLyrics = async (clearCache = true) => {
      // 메모리 캐시는 항상 초기화
      CACHE = {};

      // 현재 트랙 정보
      const item = Spicetify.Player.data?.item;
      const trackUri = item?.uri;
      const trackId = trackUri?.split(":").pop();

      // CacheManager (Gemini 번역 메모리 캐시)도 항상 현재 트랙에 대해 초기화
      if (trackUri) {
        CacheManager.clearByUri(trackUri);
      }

      // clearCache가 true이고 트랙 정보가 있으면 로컬 캐시도 삭제
      if (clearCache && trackId) {
        await LyricsCache.clearTrack(trackId);
        window.Translator.clearMemoryCache(trackId);
        window.Translator.clearInflightRequests(trackId);
      }

      this.updateVisualOnConfigChange();
      this.forceUpdate();
      this.fetchLyrics(
        Spicetify.Player.data.item,
        this.state.explicitMode,
        true
      );
    };

    // Cache viewport element for better performance
    this.viewPort =
      this._domCache?.viewport ??
      (this._domCache &&
        (this._domCache.viewport =
          document.querySelector(".Root__main-view .os-viewport") ??
          document.querySelector(
            ".Root__main-view .main-view-container__scroll-node"
          )));

    this.configButton = new Spicetify.Menu.Item(
      "ivLyrics config",
      false,
      openConfig,
      "lyrics"
    );
    this.configButton.register();

    // Throttled font size change to improve performance
    let fontSizeChangeTimeout = null;
    this.onFontSizeChange = (event) => {
      if (!event.ctrlKey) return;

      // Prevent too frequent updates
      if (fontSizeChangeTimeout) return;

      fontSizeChangeTimeout = setTimeout(() => {
        fontSizeChangeTimeout = null;
      }, 50); // 50ms throttle

      const dir = event.deltaY < 0 ? 1 : -1;
      let temp = CONFIG.visual["font-size"] + dir * fontSizeLimit.step;
      if (temp < fontSizeLimit.min) {
        temp = fontSizeLimit.min;
      } else if (temp > fontSizeLimit.max) {
        temp = fontSizeLimit.max;
      }
      CONFIG.visual["font-size"] = temp;
      StorageManager.saveConfig("font-size", temp);
      lyricContainerUpdate();
    };

    this.toggleFullscreen = () => {
      const isEnabled = !this.state.isFullscreen;
      const useBrowserFullscreen = CONFIG.visual["fullscreen-browser-fullscreen"] === true;
      if (isEnabled) {
        // 기존 컨테이너가 DOM에 남아있으면 제거
        const existingContainer = document.getElementById("lyrics-fullscreen-container");
        if (existingContainer) {
          existingContainer.innerHTML = '';
          existingContainer.remove();
        }
        // 새로운 전체화면 컨테이너 생성
        this.fullscreenContainer = document.createElement("div");
        this.fullscreenContainer.id = "lyrics-fullscreen-container";
        // TMI 폰트 크기 CSS 변수 설정
        const tmiScale = (CONFIG.visual["fullscreen-tmi-font-size"] || 100) / 100;
        this.fullscreenContainer.style.setProperty("--fullscreen-tmi-font-size", tmiScale);
        document.body.append(this.fullscreenContainer);
        this.mousetrap.bind("esc", this.toggleFullscreen);
        // ESC 키 직접 리스너 추가 (Mousetrap이 캡처하지 못할 경우 대비)
        this._escHandler = (e) => {
          if (e.key === "Escape" && this.state.isFullscreen) {
            e.preventDefault();
            e.stopPropagation();
            this.toggleFullscreen();
          }
        };
        document.addEventListener("keydown", this._escHandler);

        // 브라우저 전체화면 변경 감지 리스너 추가
        this._fullscreenChangeHandler = () => {
          // 브라우저 전체화면이 종료되었고, ivLyrics 전체화면이 활성화된 상태라면
          if (!document.fullscreenElement && this.state.isFullscreen && useBrowserFullscreen) {
            this.toggleFullscreen();
          }
        };
        document.addEventListener("fullscreenchange", this._fullscreenChangeHandler);

        // 브라우저 전체화면 활성화
        if (useBrowserFullscreen && !document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch((err) => {
            console.debug("Fullscreen request failed:", err);
          });
        }
      } else {
        // 먼저 setState를 호출하여 React가 Portal 렌더링을 중단하도록 함
        // (이렇게 하면 React가 자연스럽게 컴포넌트를 언마운트함)

        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => { });
        }
        this.mousetrap.unbind("esc");
        // ESC 키 리스너 제거
        if (this._escHandler) {
          document.removeEventListener("keydown", this._escHandler);
          this._escHandler = null;
        }
        // 브라우저 전체화면 변경 리스너 제거
        if (this._fullscreenChangeHandler) {
          document.removeEventListener("fullscreenchange", this._fullscreenChangeHandler);
          this._fullscreenChangeHandler = null;
        }
        // 전체화면 종료 이벤트 발생 (GlobalShortcuts에서 이전 페이지로 이동하기 위해)
        window.dispatchEvent(new CustomEvent("ivLyrics:fullscreen-closed"));

        // 컨테이너는 setState 후 다음 렌더 사이클에서 React가 Portal을 렌더링하지 않으므로
        // 약간의 딜레이 후에 안전하게 제거
        const containerToRemove = this.fullscreenContainer;
        setTimeout(() => {
          if (containerToRemove && containerToRemove.parentNode) {
            containerToRemove.remove();
          }
          // 혹시 남아있는 컨테이너도 제거
          const leftover = document.getElementById("lyrics-fullscreen-container");
          if (leftover && leftover.parentNode) {
            leftover.remove();
          }
        }, 100); // React 렌더 사이클이 완료될 시간 확보
      }

      // 먼저 상태를 업데이트하여 React가 Portal 렌더링을 중단하게 함
      this.setState({
        isFullscreen: isEnabled,
      });
    };
    this.mousetrap.reset();
    // 전체화면 단축키는 GlobalShortcuts.js에서 전역으로 처리
    window.addEventListener("fad-request", lyricContainerUpdate);

    // 설정 변경 리스너 - 노래방 모드 토글 처리
    this.handleConfigChange = (event) => {
      if (event.detail?.name === "karaoke-mode-enabled") {
        // 노래방 모드 설정이 변경되면 현재 모드를 다시 계산
        this.state.explicitMode = -1; // 명시적 모드 초기화
        this.forceUpdate();
      }
    };
    window.addEventListener("ivLyrics", this.handleConfigChange);

    // Listen for lyric index changes from Pages.js
    this.handleLyricIndexChange = (event) => {
      if (event.detail && typeof event.detail.index === 'number') {
        this.setState({ currentLyricIndex: event.detail.index });
      }
    };
    window.addEventListener("ivLyrics:lyric-index-changed", this.handleLyricIndexChange);
  }

  componentWillUnmount() {
    // Core cleanup
    Utils.removeQueueListener(this.onQueueChange);
    this.configButton?.deregister();
    this.mousetrap?.reset();
    window.removeEventListener("fad-request", lyricContainerUpdate);
    window.removeEventListener("ivLyrics", this.handleConfigChange);
    window.removeEventListener("ivLyrics:lyric-index-changed", this.handleLyricIndexChange);

    // Mouse idle timer cleanup
    if (this.mouseIdleTimer) {
      clearTimeout(this.mouseIdleTimer);
      this.mouseIdleTimer = null;
    }
    // Remove mouse event listeners from container
    const container = this.containerRef.current;
    if (container && this._handleMouseMove) {
      container.removeEventListener('mousemove', this._handleMouseMove);
      container.removeEventListener('mouseleave', this._handleMouseLeave);
    }
    this._handleMouseMove = null;
    this._handleMouseLeave = null;

    // ESC 키 리스너 정리
    if (this._escHandler) {
      document.removeEventListener("keydown", this._escHandler);
      this._escHandler = null;
    }

    // 브라우저 전체화면 변경 리스너 정리
    if (this._fullscreenChangeHandler) {
      document.removeEventListener("fullscreenchange", this._fullscreenChangeHandler);
      this._fullscreenChangeHandler = null;
    }

    // Clean up translation loading timer
    this.clearTranslationLoading();

    // Clean up cache system
    CacheManager.clear();

    // Clear DOM cache
    if (this._domCache) {
      this._domCache = null;
    }

    // Clean up global references
    if (window.lyricContainer === this) {
      delete window.lyricContainer;
    }

    // Clean up performance monitoring
    if (window.lyricsPerformance) {
      delete window.lyricsPerformance;
    }

    // Clean up inflight requests
    if (this._inflightGemini) {
      this._inflightGemini.clear();
      this._inflightGemini = null;
    }

    if (this._inflightTrad) {
      this._inflightTrad.clear();
      this._inflightTrad = null;
    }

    // Clean up progressive results
    if (this._dmResults) {
      this._dmResults = null;
    }

    // Force garbage collection hint
    if (window.gc && typeof window.gc === "function") {
      setTimeout(() => window.gc(), 100);
    }
  }

  updateVisualOnConfigChange() {
    this.availableModes = CONFIG.modes.filter((_, id) => {
      return Object.values(CONFIG.providers).some(
        (p) => p.on && p.modes.includes(id)
      );
    });

    if (!CONFIG.visual.colorful) {
      this.styleVariables = {
        "--lyrics-color-active": CONFIG.visual["active-color"],
        "--lyrics-color-inactive": CONFIG.visual["inactive-color"],
        "--lyrics-highlight-background": CONFIG.visual["highlight-color"],
        "--lyrics-background-noise": CONFIG.visual.noise
          ? "var(--background-noise)"
          : "unset",
      };
    } else if (CONFIG.visual.colorful) {
      this.styleVariables = {
        "--lyrics-color-active": "white",
        "--lyrics-color-inactive": "rgba(255, 255, 255, 0.4)",
        "--lyrics-color-background":
          this.state.colors.background || "transparent",
        "--lyrics-highlight-background": this.state.colors.inactive,
        "--lyrics-background-noise": CONFIG.visual.noise
          ? "var(--background-noise)"
          : "unset",
      };
    }

    this.styleVariables = {
      ...this.styleVariables,
      "--lyrics-align-text": CONFIG.visual.alignment,
      "--lyrics-font-size": `${CONFIG.visual["font-size"]}px`,
      "--animation-tempo": this.state.tempo,
      "--lyrics-font-family":
        CONFIG.visual["font-family"] || "var(--font-family)",
      "--lyrics-original-font-family":
        CONFIG.visual["original-font-family"] || "var(--font-family)",
      "--lyrics-phonetic-font-family":
        CONFIG.visual["phonetic-font-family"] || "var(--font-family)",
      "--lyrics-translation-font-family":
        CONFIG.visual["translation-font-family"] || "var(--font-family)",
      "--lyrics-fullscreen-right-padding": `${CONFIG.visual["fullscreen-lyrics-right-padding"] || 40}px`,
      "--fullscreen-tmi-font-size": (CONFIG.visual["fullscreen-tmi-font-size"] || 100) / 100,
    };

    // mousetrap은 ESC 키 등 전체화면 내 단축키용으로만 사용
    // 전체화면 단축키는 GlobalShortcuts.js에서 전역으로 처리
  }

  getCurrentMode() {
    let mode = -1;
    if (this.state.explicitMode !== -1) {
      mode = this.state.explicitMode;
    } else if (this.state.lockMode !== -1) {
      mode = this.state.lockMode;
    } else {
      // Auto switch: prefer karaoke, then synced, then unsynced
      // 노래방 모드가 비활성화되어 있으면 karaoke를 건너뛰고 synced부터 시작
      if (this.state.karaoke && CONFIG.visual["karaoke-mode-enabled"]) {
        mode = KARAOKE;
      } else if (this.state.synced) {
        mode = SYNCED;
      } else if (this.state.unsynced) {
        mode = UNSYNCED;
      }
    }
    return mode;
  }

  render() {
    // 미리보기 컴포넌트에서 사용할 수 있도록 첫 가사 시간을 전역으로 노출
    window.ivLyrics_firstLyricTime = this.state.currentLyrics && this.state.currentLyrics.length > 0
      ? this.state.currentLyrics[0].startTime
      : 0;

    // Enhanced FAD container detection - try multiple selectors if main one fails
    let fadLyricsContainer = this._domCache?.fadContainer;

    if (!fadLyricsContainer || !document.contains(fadLyricsContainer)) {
      // Try main selector first
      fadLyricsContainer = document.getElementById("fad-ivLyrics-container");

      // If not found, try alternative selectors for FAD extension
      if (!fadLyricsContainer) {
        const altSelectors = ["[data-fad-lyrics]", ".fad-lyrics-container"];

        for (const selector of altSelectors) {
          const element = document.querySelector(selector);
          if (element) {
            fadLyricsContainer = element;
            break;
          }
        }
      }

      // Cache the result
      if (this._domCache) {
        this._domCache.fadContainer = fadLyricsContainer;
      }
    }

    this.state.isFADMode = !!fadLyricsContainer;

    if (this.state.isFADMode) {
      // Text colors will be set by FAD extension
      // Disable colorful backgrounds in FAD mode
      this.styleVariables = {};
    } else if (CONFIG.visual.colorful && this.state.colors.background) {
      const isLight = Utils.isColorLight(this.state.colors.background);
      this.styleVariables = {
        "--lyrics-color-active": isLight ? "black" : "white",
        "--lyrics-color-inactive": isLight
          ? "rgba(0, 0, 0, 0.4)"
          : "rgba(255, 255, 255, 0.4)",
        "--lyrics-color-background": this.state.colors.background,
        "--lyrics-highlight-background": this.state.colors.inactive,
        "--lyrics-background-noise": CONFIG.visual.noise
          ? "var(--background-noise)"
          : "unset",
      };
    } else if (CONFIG.visual["solid-background"]) {
      const isLight = Utils.isColorLight(
        CONFIG.visual["solid-background-color"]
      );
      this.styleVariables = {
        "--lyrics-color-active": isLight ? "black" : "white",
        "--lyrics-color-inactive": isLight
          ? "rgba(0, 0, 0, 0.4)"
          : "rgba(255, 255, 255, 0.4)",
        "--lyrics-color-background": CONFIG.visual["solid-background-color"],
        "--lyrics-highlight-background": isLight
          ? "rgba(0, 0, 0, 0.1)"
          : "rgba(255, 255, 255, 0.1)",
        "--lyrics-background-noise": CONFIG.visual.noise
          ? "var(--background-noise)"
          : "unset",
      };
    }

    const backgroundStyle = {};
    // Disable background features when in FAD mode (Full Screen extension)
    if (!this.state.isFADMode && CONFIG.visual["video-background"]) {
      // Video background is handled by the component
    } else if (!this.state.isFADMode && CONFIG.visual["gradient-background"]) {
      const brightness = CONFIG.visual["background-brightness"] / 100;
      // 앨범 커버 이미지 가져오기
      const albumArtUrl =
        Spicetify.Player.data?.item?.metadata?.image_xlarge_url ||
        Spicetify.Player.data?.item?.metadata?.image_large_url ||
        Spicetify.Player.data?.item?.metadata?.image_url;

      if (albumArtUrl) {
        backgroundStyle.backgroundImage = `url(${albumArtUrl})`;
        backgroundStyle.backgroundSize = "cover";
        backgroundStyle.backgroundPosition = "center";
        backgroundStyle.backgroundRepeat = "no-repeat";
        backgroundStyle.filter = `brightness(${brightness}) blur(20px)`;
        backgroundStyle.transform = "scale(1)"; // 블러 경계선 숨기기
      }
    } else if (
      !this.state.isFADMode &&
      CONFIG.visual.colorful &&
      this.state.colors.background
    ) {
      const brightness = CONFIG.visual["background-brightness"] / 100;
      backgroundStyle.backgroundColor = this.state.colors.background;
      backgroundStyle.filter = `brightness(${brightness})`;
    } else if (!this.state.isFADMode && CONFIG.visual["solid-background"]) {
      const brightness = CONFIG.visual["background-brightness"] / 100;
      backgroundStyle.backgroundColor = CONFIG.visual["solid-background-color"];
      backgroundStyle.filter = `brightness(${brightness})`;
    }

    // Helper function to convert hex color with opacity
    const hexToRgba = (hex, opacity) => {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      if (result) {
        const r = parseInt(result[1], 16);
        const g = parseInt(result[2], 16);
        const b = parseInt(result[3], 16);
        return `rgba(${r}, ${g}, ${b}, ${opacity / 100})`;
      }
      return hex;
    };

    // Build text shadow CSS value
    const shadowColor = hexToRgba(
      CONFIG.visual["text-shadow-color"],
      CONFIG.visual["text-shadow-opacity"]
    );
    const textShadow = CONFIG.visual["text-shadow-enabled"]
      ? `0 0 ${CONFIG.visual["text-shadow-blur"]}px ${shadowColor}`
      : "none";

    this.styleVariables = {
      ...this.styleVariables,
      "--lyrics-align-text": CONFIG.visual.alignment,
      "--lyrics-font-size": `${CONFIG.visual["font-size"]}px`,
      "--lyrics-font-family":
        CONFIG.visual["font-family"] || "var(--font-family)",
      "--lyrics-original-font-family":
        CONFIG.visual["original-font-family"] || "var(--font-family)",
      "--lyrics-phonetic-font-family":
        CONFIG.visual["phonetic-font-family"] || "var(--font-family)",
      "--lyrics-translation-font-family":
        CONFIG.visual["translation-font-family"] || "var(--font-family)",
      "--lyrics-original-font-weight": CONFIG.visual["original-font-weight"],
      "--lyrics-original-font-size": `${CONFIG.visual["original-font-size"]}px`,
      "--lyrics-translation-font-weight":
        CONFIG.visual["translation-font-weight"],
      "--lyrics-translation-font-size": `${CONFIG.visual["translation-font-size"]}px`,
      "--lyrics-translation-spacing": `${CONFIG.visual["translation-spacing"] || 8
        }px`,
      "--lyrics-phonetic-font-weight":
        CONFIG.visual["phonetic-font-weight"] || "400",
      "--lyrics-phonetic-font-size": `${CONFIG.visual["phonetic-font-size"] || 20
        }px`,
      "--lyrics-phonetic-opacity":
        (CONFIG.visual["phonetic-opacity"] || 70) / 100,
      "--lyrics-phonetic-spacing": `${CONFIG.visual["phonetic-spacing"] || 4
        }px`,
      "--lyrics-original-letter-spacing": `${CONFIG.visual["original-letter-spacing"] || 0}px`,
      "--lyrics-phonetic-letter-spacing": `${CONFIG.visual["phonetic-letter-spacing"] || 0}px`,
      "--lyrics-translation-letter-spacing": `${CONFIG.visual["translation-letter-spacing"] || 0}px`,
      "--lyrics-furigana-font-weight": CONFIG.visual["furigana-font-weight"],
      "--lyrics-furigana-font-size": `${CONFIG.visual["furigana-font-size"]}px`,
      "--lyrics-furigana-opacity": CONFIG.visual["furigana-opacity"] / 100,
      "--lyrics-furigana-spacing": `${CONFIG.visual["furigana-spacing"]}px`,
      "--lyrics-line-spacing": `${CONFIG.visual["line-spacing"] || 8}px`,
      "--lyrics-text-shadow": textShadow,
      "--lyrics-original-opacity": CONFIG.visual["original-opacity"] / 100,
      "--lyrics-translation-opacity":
        CONFIG.visual["translation-opacity"] / 100,
      "--highlight-inactive-opacity":
        (100 - (CONFIG.visual["highlight-intensity"] || 70)) / 100,
      "--animation-tempo": this.state.tempo,
      "--lyrics-fullscreen-right-padding": `${CONFIG.visual["fullscreen-lyrics-right-padding"] || 40}px`,
      "--fullscreen-tmi-font-size": (CONFIG.visual["fullscreen-tmi-font-size"] || 100) / 100,
    };

    let mode = this.getCurrentMode();

    let activeItem;
    let showTranslationButton;

    // Get current display modes to track changes
    const originalLanguage = this.provideLanguageCode(this.state.currentLyrics);
    const friendlyLanguage =
      originalLanguage &&
      new Intl.DisplayNames(["en"], { type: "language" })
        .of(originalLanguage.split("-")[0])
        ?.toLowerCase();

    // For Gemini mode, use generic keys if no specific language detected
    const provider = CONFIG.visual["translate:translated-lyrics-source"];
    const modeKey =
      provider === "geminiKo" && !friendlyLanguage
        ? "gemini"
        : friendlyLanguage;

    const displayMode1 = CONFIG.visual[`translation-mode:${modeKey}`];
    const displayMode2 = CONFIG.visual[`translation-mode-2:${modeKey}`];
    const currentModeKey = `${mode}_${displayMode1 || "none"}_${displayMode2 || "none"
      }`;

    // Only call lyricsSource on state/mode/translation changes, not every render
    if (
      this.lastProcessedUri !== this.state.uri ||
      this.lastProcessedMode !== currentModeKey
    ) {
      this.lastProcessedUri = this.state.uri;
      this.lastProcessedMode = currentModeKey;
      this.lyricsSource(this.state, mode);
    }
    const hasTranslation = false;

    // Always render the Conversions button on synced/unsynced pages.
    // Previously it was gated by detected language/loading state, causing it to
    // be hidden on initial load or for non-target languages (e.g., English).
    const potentialMode =
      this.state.explicitMode !== -1
        ? this.state.explicitMode
        : this.state.lockMode !== -1
          ? this.state.lockMode
          : this.state.isLoading
            ? this.lastModeBeforeLoading || SYNCED
            : mode;

    showTranslationButton =
      potentialMode === KARAOKE ||
      potentialMode === SYNCED ||
      potentialMode === UNSYNCED ||
      mode === -1;

    // 번역 재생성 버튼 활성화 조건 확인
    const translationProvider =
      CONFIG.visual["translate:translated-lyrics-source"];
    const hasTranslationEnabled =
      translationProvider && translationProvider !== "none";
    const hasGeminiTranslation =
      hasTranslationEnabled &&
      (displayMode1?.startsWith("gemini") ||
        displayMode2?.startsWith("gemini"));

    // Gemini 번역이 실제로 로드되었는지 확인 (_dmResults 확인)
    const currentUri = this.state.uri;
    const hasLoadedGeminiTranslation = !!(
      hasGeminiTranslation &&
      this._dmResults &&
      this._dmResults[currentUri] &&
      ((displayMode1?.startsWith("gemini") &&
        this._dmResults[currentUri].mode1) ||
        (displayMode2?.startsWith("gemini") &&
          this._dmResults[currentUri].mode2))
    );

    const canRegenerateTranslation = hasLoadedGeminiTranslation;

    if (mode !== -1) {
      if (mode === KARAOKE && this.state.karaoke) {
        activeItem = react.createElement(SyncedLyricsPage, {
          trackUri: this.state.uri,
          lyrics: Array.isArray(this.state.currentLyrics)
            ? this.state.currentLyrics
            : this.state.karaoke,
          provider: this.state.provider,
          copyright: this.state.copyright,
          isKara: true,
          reRenderLyricsPage: this.reRenderLyricsPage,
        });
      } else if (mode === SYNCED && this.state.synced) {
        activeItem = react.createElement(
          CONFIG.visual["synced-compact"]
            ? SyncedLyricsPage
            : SyncedExpandedLyricsPage,
          {
            trackUri: this.state.uri,
            lyrics: Array.isArray(this.state.currentLyrics)
              ? this.state.currentLyrics
              : [],
            provider: this.state.provider,
            copyright: this.state.copyright,
            reRenderLyricsPage: this.reRenderLyricsPage,
          }
        );
      } else if (mode === UNSYNCED && this.state.unsynced) {
        activeItem = react.createElement(UnsyncedLyricsPage, {
          trackUri: this.state.uri,
          lyrics: Array.isArray(this.state.currentLyrics)
            ? this.state.currentLyrics
            : [],
          provider: this.state.provider,
          copyright: this.state.copyright,
          reRenderLyricsPage: this.reRenderLyricsPage,
        });
      }
    }

    if (!activeItem) {
      activeItem = react.createElement(
        "div",
        {
          className: "lyrics-lyricsContainer-LyricsUnavailablePage",
        },
        react.createElement(
          "span",
          {
            className: "lyrics-lyricsContainer-LyricsUnavailableMessage",
          },
          this.state.isLoading ? LoadingIcon : "(• _ • )"
        )
      );
    }

    this.state.mode = mode;

    const topBarProps = {
      links: CONFIG.modes,
      activeLink: CONFIG.modes[mode] || CONFIG.modes[0],
      lockLink: CONFIG.locked !== -1 ? CONFIG.modes[CONFIG.locked] : null,
      switchCallback: (selectedMode) => {
        const modeIndex = CONFIG.modes.indexOf(selectedMode);
        if (modeIndex !== -1) {
          this.switchTo(modeIndex);
        }
      },
      lockCallback: (selectedMode) => {
        const modeIndex = CONFIG.modes.indexOf(selectedMode);
        if (modeIndex !== -1) {
          this.lockIn(modeIndex);
        }
      },
    };

    const topBarContent =
      typeof TopBarContent === "function"
        ? react.createElement(TopBarContent, topBarProps)
        : null;

    // Update banner component
    const updateBanner = window.ivLyrics_updateInfo?.available
      ? react.createElement(UpdateBanner, {
        updateInfo: window.ivLyrics_updateInfo,
        onDismiss: () =>
          Utils.dismissUpdate(window.ivLyrics_updateInfo.latestVersion),
      })
      : null;

    const hasLyrics = !!(this.state.karaoke || this.state.synced || this.state.unsynced);
    const isTwoColumn = CONFIG.visual["fullscreen-two-column"] !== false;
    const isLayoutReversed = CONFIG.visual["fullscreen-layout-reverse"] === true;
    const centerWhenNoLyrics = CONFIG.visual["fullscreen-center-when-no-lyrics"] !== false;

    // Build fullscreen class names
    let fullscreenClasses = "";
    if (this.state.isFullscreen) {
      fullscreenClasses = " fullscreen-active";
      if (!isTwoColumn) {
        fullscreenClasses += " fullscreen-single-column";
      }
      if (isLayoutReversed && isTwoColumn) {
        fullscreenClasses += " layout-reversed";
      }
      if (!hasLyrics && centerWhenNoLyrics) {
        fullscreenClasses += " fullscreen-no-lyrics";
      }
      // TV Mode class
      if (CONFIG.visual["fullscreen-tv-mode"] === true) {
        fullscreenClasses += " tv-mode-active";
      }
      // TMI 폰트 크기 CSS 변수 업데이트
      if (this.fullscreenContainer) {
        const tmiScale = (CONFIG.visual["fullscreen-tmi-font-size"] || 100) / 100;
        this.fullscreenContainer.style.setProperty("--fullscreen-tmi-font-size", tmiScale);
      }
    }

    const out = react.createElement(
      "div",
      {
        className: `lyrics-lyricsContainer-LyricsContainer${CONFIG.visual["fade-blur"] ? " blur-enabled" : ""
          }${CONFIG.visual["highlight-mode"] ? " highlight-mode-enabled" : ""}${fadLyricsContainer ? " fad-enabled" : ""}${fullscreenClasses}`,
        style: this.styleVariables,
        ref: (el) => {
          if (!el) return;
          this.containerRef.current = el;
          el.onmousewheel = this.onFontSizeChange;

          // Attach mouse event listeners for auto-hide controls
          if (!el._mouseEventsAttached) {
            el._mouseEventsAttached = true;
            el.addEventListener('mousemove', this._handleMouseMove);
            el.addEventListener('mouseleave', this._handleMouseLeave);
            // Start the idle timer
            this._handleMouseMove();
          }
        },
      },
      // Left panel for fullscreen mode
      this.state.isFullscreen && window.FullscreenOverlay && react.createElement(window.FullscreenOverlay, {
        coverUrl: this.state.coverUrl,
        title: this.state.title,
        artist: this.state.artist,
        isFullscreen: this.state.isFullscreen,
        currentLyricIndex: this.state.currentLyricIndex || 0,
        totalLyrics: Array.isArray(this.state.currentLyrics) ? this.state.currentLyrics.length : 0,
        translatedMetadata: this.state.translatedMetadata,
        trackUri: this.state.uri
      }),
      // Tab bar for mode switching
      topBarContent,
      // Update notification banner
      updateBanner,
      (!CONFIG.visual["video-background"] || this.state.isFADMode) && react.createElement("div", {
        id: "ivLyrics-gradient-background",
        style: backgroundStyle,
      }),
      !this.state.isFADMode && CONFIG.visual["video-background"] && window.VideoBackground && react.createElement(window.VideoBackground, {
        trackUri: this.state.uri,
        firstLyricTime: this.state.currentLyrics && this.state.currentLyrics.length > 0 ? this.state.currentLyrics[0].startTime : 0,
        brightness: CONFIG.visual["background-brightness"],
        blurAmount: CONFIG.visual["video-blur"],
        coverMode: CONFIG.visual["video-cover"],
        externalVideoInfo: this.state.videoInfo
      }),
      (!CONFIG.visual["video-background"] || this.state.isFADMode) && react.createElement("div", {
        className: "lyrics-lyricsContainer-LyricsBackground",
      }),
      // Phonetic loading indicator
      this.state.isPhoneticLoading &&
      react.createElement(
        "div",
        {
          className: "lyrics-translation-loading-indicator",
        },
        react.createElement(
          "div",
          {
            className: "lyrics-translation-loading-content",
          },
          react.createElement("div", {
            className: "lyrics-translation-loading-spinner",
          }),
          react.createElement(
            "span",
            null,
            I18n.t("notifications.requestingPronunciation")
          )
        )
      ),
      // Translation loading indicator
      this.state.isTranslationLoading &&
      react.createElement(
        "div",
        {
          className: "lyrics-translation-loading-indicator",
          style: { top: this.state.isPhoneticLoading ? "100px" : "20px" },
        },
        react.createElement(
          "div",
          {
            className: "lyrics-translation-loading-content",
          },
          react.createElement("div", {
            className: "lyrics-translation-loading-spinner",
          }),
          react.createElement(
            "span",
            null,
            I18n.t("notifications.requestingTranslation")
          )
        )
      ),
      react.createElement(
        "div",
        {
          className: "lyrics-config-button-container",
        },
        showTranslationButton &&
        react.createElement(TranslationMenu, {
          friendlyLanguage,
          hasTranslation: {},
        }),
        react.createElement(RegenerateTranslationButton, {
          onRegenerate: this.regenerateTranslation,
          isEnabled: canRegenerateTranslation,
          isLoading: this.state.isTranslationLoading,
        }),
        react.createElement(SyncAdjustButton, {
          trackUri: this.currentTrackUri,
          onOffsetChange: (offset) => {
            this.forceUpdate();
          },
        }),
        react.createElement(CommunityVideoButton, {
          trackUri: this.currentTrackUri,
          videoInfo: this.state.videoInfo,
          onVideoSelect: async (newVideoInfo) => {
            this.setState({ videoInfo: newVideoInfo });
            // 선택한 영상을 IndexedDB에 저장
            if (newVideoInfo && this.currentTrackUri) {
              await Utils.saveSelectedVideo(this.currentTrackUri, newVideoInfo);
            }
          },
        }),
        react.createElement(ShareImageButton, {
          lyrics: this.state.currentLyrics || [],
          trackInfo: {
            name: Spicetify.Player.data?.item?.name || Spicetify.Player.data?.item?.metadata?.title || '',
            artist: Spicetify.Player.data?.item?.artists?.map(a => a.name).join(', ') || Spicetify.Player.data?.item?.metadata?.artist_name || '',
            cover: Spicetify.Player.data?.item?.metadata?.image_xlarge_url ||
              Spicetify.Player.data?.item?.metadata?.image_large_url ||
              Spicetify.Player.data?.item?.metadata?.image_url ||
              Spicetify.Player.data?.item?.album?.images?.[0]?.url || '',
          },
        }),
        react.createElement(SettingsMenu),
        // Fullscreen toggle button
        (() => !document.getElementById("fad-ivLyrics-container"))() && react.createElement(
          Spicetify.ReactComponent.TooltipWrapper,
          {
            label: I18n.t("menu.fullscreen"),
          },
          react.createElement(
            "button",
            {
              className: "lyrics-config-button",
              onClick: () => {
                this.toggleFullscreen();
              },
            },
            react.createElement("svg", {
              width: 16,
              height: 16,
              viewBox: "0 0 16 16",
              fill: "currentColor",
              dangerouslySetInnerHTML: {
                __html:
                  Spicetify.SVGIcons["fullscreen"] ||
                  // Fullscreen icon fallback
                  '<path d="M6.064 10.229l-2.418 2.418L2 11v4h4l-1.647-1.646 2.418-2.418-.707-.707zM11 2l1.647 1.647-2.418 2.418.707.707 2.418-2.418L15 6V2h-4z"/>',
              },
            })
          )
        )
      ),
      activeItem
    );

    const dom = ensureReactDOM();
    if (
      this.state.isFullscreen &&
      dom?.createPortal &&
      this.fullscreenContainer
    ) {
      return dom.createPortal(out, this.fullscreenContainer);
    }
    if (fadLyricsContainer && dom?.createPortal) {
      return dom.createPortal(out, fadLyricsContainer);
    }
    return out;
  }
}

window.LyricsContainer = LyricsContainer;
