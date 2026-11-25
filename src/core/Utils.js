import { createRuntimeDebugLogger } from "#ivlyrics/spicetify/runtimeDebug.mjs";
import { createDiscordAccountSession } from "#ivlyrics/features/account/discordAccountSession.mjs";
import { createCloudSettingsClient } from "#ivlyrics/features/account/cloudSettingsClient.mjs";
import { createCreatorProfileClient } from "#ivlyrics/features/account/creatorProfileClient.mjs";
import { createFileTransfer } from "#ivlyrics/core/fileTransfer.mjs";
import { createToastNotifications } from "#ivlyrics/core/toastNotifications.mjs";
import { createAppUpdateMethods } from "#ivlyrics/features/updates/appUpdates.mjs";
import { getVideoSkipSegmentAtTime, mapVideoTimeWithSkipSegments, normalizeVideoSkipSegments } from "#ivlyrics/features/video/communityVideoTimeline.mjs";
import { createCommunityVideoService } from "#ivlyrics/features/video/communityVideoService.mjs";
import { selectedVideoStore } from "#ivlyrics/features/video/selectedVideoStore.mjs";
import { createYouTubeVideoMetadata, extractYouTubeVideoId } from "#ivlyrics/features/video/youtubeVideoMetadata.mjs";
import { createFuriganaTextAdapter, parseFuriganaMapping, rubyTextToHTML } from "#ivlyrics/lyrics/lyricTextMarkup.mjs";
import {
  convertParsedToLRC, convertParsedToUnsynced, formatLyricLineToCopy, formatTextWithTimestamps, formatTime, parseLocalLyrics,
} from "#ivlyrics/lyrics/lyricFileFormats.mjs";
import { createSafeMarkdownRenderer } from "#ivlyrics/core/safeMarkdown.mjs";
import { createSyncOffsetControls } from "#ivlyrics/core/syncOffsetControls.mjs";
import { LRUCache } from "#ivlyrics/core/LRUCache.mjs";
import { createRuntimeTrackIdentity } from "#ivlyrics/core/trackIdentity.mjs";
import { readSettingsStorage as readUtilsSettingsStorage } from "#ivlyrics/core/settingsRuntime.mjs";
import {
  lyricsTextComparison as sharedLyricsTextComparison,
  isLyricsSectionHeader as sharedIsLyricsSectionHeader,
} from "#ivlyrics/lyrics/translationTextComparison.mjs";
import { createSpeakerColors } from "#ivlyrics/lyrics/speakerColors.mjs";
import {
  readRouteDetectedLyricLanguage as readUtilsLyricLanguage,
  setRouteDetectedLyricLanguage as setUtilsLyricLanguage,
  getLyricFuriganaConverter as getUtilsFuriganaConverter,
} from "#ivlyrics/lyrics/lyricsTextRuntime.mjs";
import { getRuntimeService as readUtilsRuntimeService, publishRuntimeService as publishUtilsRuntimeService } from "#ivlyrics/spicetify/runtimeServices.mjs";

const HAN_CHARACTER_REGEX = /\p{Script=Han}/u;

export function createPageUtils({
  host: window, document, localStorage, spicetify: Spicetify, config: CONFIG,
  i18n: I18n, storage: StorageManager, trackSyncStore: TrackSyncDB,
}) {
  window.ivLyricsTextComparison = sharedLyricsTextComparison;

  const ivLyricsSpeakerColors = createSpeakerColors({
    getVisualSettings: () => readUtilsRuntimeService("CONFIG", window)?.visual,
    getStorage: () => localStorage,
    getStorageManager: () => readUtilsSettingsStorage(window),
    getDefaultTarget: () => document.documentElement,
  });
  publishUtilsRuntimeService("ivLyricsSpeakerColors", ivLyricsSpeakerColors, window);
  setTimeout(() => readUtilsRuntimeService("ivLyricsSpeakerColors", window)?.applyCssVariables?.(), 0);

  setUtilsLyricLanguage(window, null);

  const Toast = createToastNotifications(window);

  const Utils = {
    // LRU caches for frequently used operations (최적화 #10 - LRU 캐시 적용)
    _colorCache: new LRUCache(100),
    _normalizeCache: new LRUCache(200),

    addQueueListener(callback) {
      Spicetify.Player.origin._events.addListener("queue_update", callback);
    },

    removeQueueListener(callback) {
      Spicetify.Player.origin._events.removeListener("queue_update", callback);
    },

    convertIntToRGB(colorInt, div = 1) {
      const cacheKey = `${colorInt}_${div}`;
      const cached = this._colorCache.get(cacheKey);
      if (cached !== undefined) {
        return cached;
      }

      // Use bit operations for faster calculations
      const r = Math.round(((colorInt >>> 16) & 0xff) / div);
      const g = Math.round(((colorInt >>> 8) & 0xff) / div);
      const b = Math.round((colorInt & 0xff) / div);

      const result = `rgb(${r},${g},${b})`;

      this._colorCache.set(cacheKey, result);

      return result;
    },
    // 최적화 #11 - Character map for faster string normalization
    _charNormalizeMap: {
      '（': '(', '）': ')', '【': '[', '】': ']',
      '。': '. ', '；': '; ', '：': ': ', '？': '? ',
      '！': '! ', '、': ', ', '，': ', ', '\u2018': "'",
      '\u2019': "'", '′': "'", '＇': "'", '\u201c': '"',
      '\u201d': '"', '〜': '~', '·': '•', '・': '•'
    },
    _charNormalizePattern: null,

    /**
     * @param {string} s
     * @param {boolean} emptySymbol
     * @returns {string}
     */
    normalize(s, emptySymbol = true) {
      const cacheKey = `${s}_${emptySymbol}`;
      const cached = this._normalizeCache.get(cacheKey);
      if (cached !== undefined) {
        return cached;
      }

      // Lazy compile the pattern (최적화 #11 - 정규식 사전 컴파일)
      if (!this._charNormalizePattern) {
        const chars = Object.keys(this._charNormalizeMap).join('|').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        this._charNormalizePattern = new RegExp(chars, 'g');
      }

      // Single pass with character map (최적화 #11 - 단일 패스로 변경)
      let result = s.replace(this._charNormalizePattern, match => this._charNormalizeMap[match] || match);

      if (emptySymbol) {
        result = result.replace(/[-/]/g, " ");
      }

      result = result.replace(/\s+/g, " ").trim();

      // LRU cache automatically handles size
      this._normalizeCache.set(cacheKey, result);

      return result;
    },
    /**
     * Check if the specified string contains Han character.
     *
     * @param {string} s
     * @returns {boolean}
     */
    containsHanCharacter(s) {
      return HAN_CHARACTER_REGEX.test(s);
    },
    /**
     * Singleton Translator instance for {@link toSimplifiedChinese}.
     *
     * @type {Translator | null}
     */
    set translator(translator) {
      this._translatorInstance = translator;
    },
    _translatorInstance: null,
    /**
     * Convert all Han characters to Simplified Chinese.
     *
     * Choosing Simplified Chinese makes the converted result more accurate,
     * as the conversion from SC to TC may have multiple possibilities,
     * while the conversion from TC to SC usually has only one possibility.
     *
     * @param {string} s
     * @returns {Promise<string>}
     */
    async toSimplifiedChinese(s) {
      // create a singleton Translator instance
      if (!this._translatorInstance) {
        const Translator = readUtilsRuntimeService("Translator", window);
        this.translator = new Translator("zh", true);
      }

      // translate to Simplified Chinese
      // as Traditional Chinese differs between HK and TW, forcing to use OpenCC standard
      return this._translatorInstance.convertChinese(s, "t", "cn");
    },
    removeSongFeat(s) {
      return (
        s
          .replace(/-\s+(feat|with|prod).*/i, "")
          .replace(/(\(|\[)(feat|with|prod)\.?\s+.*(\)|\])$/i, "")
          .trim() || s
      );
    },
    removeExtraInfo(s) {
      return s.replace(/\s-\s.*/, "");
    },
    capitalize(s) {
      return s.replace(/^(\w)/, ($1) => $1.toUpperCase());
    },



    /**
     * 섹션 헤더를 감지하는 함수 (예: [Verse 1], [Chorus], [Bridge] 등)
     * @param {string} text - 검사할 텍스트
     * @returns {boolean} 섹션 헤더인지 여부
     */
    isSectionHeader: sharedIsLyricsSectionHeader,

    /**
     * 언어 감지 함수 - LyricsService로 완전히 위임
     * LyricsService.js에 실제 구현이 있으며, 이 함수는 하위 호환성을 위한 래퍼입니다.
     * @param {Array} lyrics - 가사 배열
     * @returns {string|null} - 감지된 언어 코드 또는 null
     */
    detectLanguage(lyrics) {
      // LyricsService.detectLanguage 사용 (Extension에서 제공)
      const service = readUtilsRuntimeService("LyricsService", window);
      if (service?.detectLanguage) {
        return service.detectLanguage(lyrics);
      }
      // LyricsService가 로드되지 않은 경우 (드문 경우)
      console.warn("[Utils] LyricsService.detectLanguage not available");
      return null;
    },
    processTranslatedLyrics(translated, original) {
      // Ensure both inputs are arrays
      if (!Array.isArray(original) || !Array.isArray(translated)) {
        return Array.isArray(original) ? original : [];
      }

      return original.map((lyric, index) => {
        // Safe property extraction
        const startTime =
          lyric && typeof lyric === "object" ? lyric.startTime || 0 : 0;
        const originalText =
          lyric && typeof lyric === "object"
            ? lyric.text || ""
            : String(lyric || "");
        const translatedText = translated[index];

        // Safe text conversion
        let safeTranslatedText = "";
        if (translatedText !== null && translatedText !== undefined) {
          if (typeof translatedText === "object" && translatedText.$$typeof) {
            // React element - extract text content
            safeTranslatedText = translatedText.props?.children || "";
          } else {
            safeTranslatedText = String(translatedText);
          }
        }

        return {
          startTime,
          // Keep as string so Pages can inject as HTML (furigana) or plain text
          text: safeTranslatedText,
          originalText,
        };
      });
    },
    /** It seems that this function is not being used, but I'll keep it just in case it's needed in the future.*/
    processTranslatedOriginalLyrics(lyrics, synced) {
      const data = [];
      const dataSouce = {};

      for (const item of lyrics) {
        if (item && typeof item.startTime !== "undefined") {
          dataSouce[item.startTime] = { translate: item.text || "" };
        }
      }

      for (const time in synced) {
        const syncedItem = synced[time];
        if (syncedItem && typeof time !== "undefined") {
          dataSouce[time] = {
            ...dataSouce[time],
            text: syncedItem.text || "",
          };
        }
      }

      for (const time in dataSouce) {
        const item = dataSouce[time];
        const lyric = {
          startTime: time || 0,
          text: this.rubyTextToOriginalReact(
            item.translate || item.text,
            item.text || item.translate
          ),
        };
        data.push(lyric);
      }

      return data;
    },
    rubyTextToOriginalReact(translated, syncedText) {
      const react = Spicetify.React;
      return react.createElement("p1", null, [
        react.createElement(
          "ruby",
          {},
          syncedText,
          react.createElement("rt", null, translated)
        ),
      ]);
    },
    rubyTextToReact(s) {
      const react = Spicetify.React;
      const rubyElems = s.split("<ruby>");
      const reactChildren = [];

      reactChildren.push(rubyElems[0]);
      for (let i = 1; i < rubyElems.length; i++) {
        const rubySegment = rubyElems[i];
        const rpIndex = rubySegment.indexOf("<rp>");
        const rtStart = rubySegment.indexOf("<rt>");
        const rtEnd = rubySegment.indexOf("</rt>", rtStart);
        const rubyEnd = rubySegment.indexOf("</ruby>");
        const kanji =
          rpIndex >= 0
            ? rubySegment.substring(0, rpIndex)
            : rtStart >= 0
              ? rubySegment.substring(0, rtStart)
              : rubySegment;
        const furigana =
          rtStart >= 0 && rtEnd >= 0
            ? rubySegment.substring(rtStart + 4, rtEnd)
            : "";
        reactChildren.push(
          react.createElement(
            "ruby",
            null,
            kanji,
            react.createElement("rt", null, furigana)
          )
        );

        reactChildren.push(rubyEnd >= 0 ? rubySegment.substring(rubyEnd + 7) : "");
      }
      return react.createElement("p1", null, reactChildren);
    },
    rubyTextToHTML,

    /**
     * 최적화 #9 - HTML props 생성 헬퍼 함수
     * @param {string} text - HTML로 렌더링할 텍스트
     * @returns {object} - dangerouslySetInnerHTML props 또는 빈 객체
     */
    createHTMLProps(text) {
      return typeof text === "string" && text
        ? { dangerouslySetInnerHTML: { __html: this.rubyTextToHTML(text) } }
        : {};
    },

    ...createSafeMarkdownRenderer(() => window.location.origin),
    parseFuriganaMapping,

    // Retain the classic property while sharing the route's current track language.
    get _currentDetectedLanguage() {
      return readUtilsLyricLanguage(window);
    },
    set _currentDetectedLanguage(language) {
      setUtilsLyricLanguage(window, language);
    },

    /**
     * Set the detected language for the current track
     * @param {string} language - The detected language code (e.g., 'ja', 'zh-hans', 'ko')
     */
    setDetectedLanguage(language) {
      this._currentDetectedLanguage = language;
    },

    /**
     * Get the current detected language
     * @returns {string|null} - The detected language code or null
     */
    getDetectedLanguage() {
      return this._currentDetectedLanguage;
    },

    applyFuriganaIfEnabled: createFuriganaTextAdapter({
      readEnabled: () => CONFIG?.visual?.["furigana-enabled"],
      readConverter: () => getUtilsFuriganaConverter(window),
    }),
    formatTime,
    formatTextWithTimestamps,
    formatLyricLineToCopy,
    convertParsedToLRC,
    convertParsedToUnsynced,
    parseLocalLyrics: (text) => parseLocalLyrics(text, () => Number(Spicetify.Player.data.item.metadata.duration)),
    processLyrics(lyrics) {
      return lyrics
        .replace(/　| /g, "") // Remove space
        .replace(/[!"#$%&'()*+,-./:;<=>?@[\]^_`{|}~？！，。、《》【】「」]/g, ""); // Remove punctuation
    },
    /**
     * Determines if a color is light or dark.
     * @param {string} color - The color in "rgb(r,g,b)" format.
     * @returns {boolean} - True if the color is light, false if dark.
     */
    isColorLight(color) {
      const [r, g, b] = color.match(/\d+/g).map(Number);
      // Using the luminance formula
      const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
      return luminance > 128;
    },

    /**
     * Current version of the ivLyrics app
     */
    currentVersion: window.ivLyricsVersion || "0.0.0",

    ...createAppUpdateMethods({
      host: window,
      t: (...args) => I18n.t(...args),
      getStorage: () => StorageManager,
    }),

    /**
     * Copy to clipboard using Spicetify API
     */
    ...createFileTransfer({ host: window, spicetify: Spicetify }),

    ...createSyncOffsetControls({
      host: window, localStorage, trackSyncStore: TrackSyncDB,
      readVisualSettings: () => readUtilsRuntimeService("CONFIG", window)?.visual,
      readStorage: () => readUtilsSettingsStorage(window),
    }),

    ...createDiscordAccountSession({
      host: window,
      spicetify: Spicetify,
      readStorage: () => StorageManager,
      readLocalStorage: () => window.localStorage,
      readLyricsService: () => readUtilsRuntimeService("LyricsService", window),
      invalidateSyncCache: () => readUtilsRuntimeService("SyncDataService", window)?.clearCache?.(),
      request: (...args) => fetch(...args),
      translate: (key) => I18n.t(key),
      toast: Toast,
    }),
    ...createCloudSettingsClient({
      readLocalStorage: () => window.localStorage,
      getCrypto: () => window.crypto,
      request: (...args) => fetch(...args),
    }),
    ...createCreatorProfileClient({
      readLocalStorage: () => window.localStorage,
      request: (...args) => fetch(...args),
      translate: (key) => I18n.t(key),
    }),

    ...createRuntimeTrackIdentity(window),

    normalizeVideoSkipSegments,
    mapVideoTimeWithSkipSegments,
    getVideoSkipSegmentAtTime,
    ...createCommunityVideoService({
      extractTrackId: (...args) => Utils.extractTrackId(...args),
      readSpotifyData: () => readUtilsRuntimeService("SpotifyDataHelper", window),
      readSyncData: () => readUtilsRuntimeService("SyncDataService", window),
      getUserHash: () => Utils.getUserHash(),
      getApiHeaders: (headers) => Utils.getApiHeaders(headers),
      requireDiscordAuth: (...args) => Utils.requireDiscordAuth(...args),
      translate: (key) => I18n.t(key),
      shouldHideDisliked: () => CONFIG?.visual?.["community-video-hide-disliked"] !== false,
      request: (...args) => fetch(...args),
      logDebug: createRuntimeDebugLogger(window),
    }),

    /**
     * 현재 사용자의 해시 ID 가져오기
     */
    getCurrentUserHash() {
      return this.getUserHash();
    },

    saveSelectedVideo: selectedVideoStore.saveSelectedVideo,
    getSelectedVideo: selectedVideoStore.getSelectedVideo,
    removeSelectedVideo: selectedVideoStore.removeSelectedVideo,
    updateSelectedVideoSyncOffset: selectedVideoStore.updateSelectedVideoSyncOffset,
    extractYouTubeVideoId,
    ...createYouTubeVideoMetadata({
      request: (...args) => fetch(...args),
      logDebug: createRuntimeDebugLogger(window),
    }),
  };

  publishUtilsRuntimeService("Toast", Toast, window);
  return { utils: Utils, toast: Toast, speakerColors: ivLyricsSpeakerColors };
}
