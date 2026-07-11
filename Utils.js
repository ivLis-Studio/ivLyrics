// ============================================
// Utils.js - 유틸리티 함수들
// LyricsService Extension에서 제공하는 LyricsCache, ApiTracker를 사용
// ============================================

// LyricsService Extension에서 제공하는 객체들 참조
// Extension은 CustomApp보다 먼저 로드되므로 이미 window에 등록되어 있음

// LRUCache - Extension에서 제공하지 않으므로 여기서 정의
class LRUCache {
  constructor(maxSize = 100) {
    this.cache = new Map();
    this.maxSize = maxSize;
  }

  get(key) {
    if (!this.cache.has(key)) return undefined;
    const value = this.cache.get(key);
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  set(key, value) {
    if (this.cache.has(key)) this.cache.delete(key);
    this.cache.set(key, value);
    if (this.cache.size > this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
  }

  has(key) {
    return this.cache.has(key);
  }

  get size() {
    return this.cache.size;
  }

  clear() {
    this.cache.clear();
  }
}

// ============================================
// Extension에서 제공하는 객체들을 로컬 변수로 참조
// (하위 호환성 유지)
// ============================================

// ApiTracker - Extension에서 제공
// window.ApiTracker는 LyricsService.js에서 이미 정의됨

// LyricsCache - Extension에서 제공
// window.LyricsCache는 LyricsService.js에서 이미 정의됨

// Extension이 로드되지 않았을 경우를 위한 폴백 (드문 경우)
if (!window.LyricsCache) {
  console.warn("[Utils] LyricsCache not found from Extension, this should not happen!");
}

if (!window.ApiTracker) {
  console.warn("[Utils] ApiTracker not found from Extension, this should not happen!");
}

// 하위 호환성을 위해 LyricsCache 별칭 생성 (기존 코드에서 LyricsCache 직접 참조하는 경우)
const LyricsCache = window.LyricsCache;
const ApiTracker = window.ApiTracker;
const HAN_CHARACTER_REGEX = /\p{Script=Han}/u;
const KANJI_CHARACTER_REGEX = /[\u4E00-\u9FAF\u3400-\u4DBF]/;
const CLEAN_HTML_RT_REGEX = /<rt[^>]*>.*?<\/rt>/gi;
const CLEAN_HTML_RUBY_REGEX = /<\/?ruby[^>]*>/gi;
const CLEAN_HTML_TAG_REGEX = /<[^>]+>/g;
const YOUTUBE_ID_PATTERNS = [
  /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
  /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
];

const IV_LYRICS_DEFAULT_SPEAKER_TEXT_COLORS = {
  "MALE 1": "#a8ccff",
  "MALE 2": "#9ae8d4",
  "MALE 3": "#bfe8ff",
  "MALE 4": "#7fb5e6",
  "MALE 5": "#6cb8b8",
  "FEMALE 1": "#ffb8c7",
  "FEMALE 2": "#ffd6b3",
  "FEMALE 3": "#f6c8ff",
  "FEMALE 4": "#e6b4d4",
  "FEMALE 5": "#f6e5a5",
  "DUET 1": "#e4d8ff",
  "DUET 2": "#d6e4ff",
  "DUET 3": "#ffddf2",
  "DUET 4": "#bfaeff",
  "DUET 5": "#9d8cf2",
};
const IV_LYRICS_LEGACY_CUSTOM_SPEAKER_FALLBACKS = {
  "MALE CUSTOM": "MALE 1",
  "FEMALE CUSTOM": "FEMALE 1",
  "DUET CUSTOM": "DUET 1",
};
const IV_LYRICS_CUSTOM_SPEAKER_FALLBACK_OPTIONS = ["MALE 1", "FEMALE 1", "DUET 1"];
const IV_LYRICS_DEFAULT_CUSTOM_SPEAKER_FALLBACK = "MALE 1";
const IV_LYRICS_SPEAKER_COLOR_OPTIONS = Object.keys(IV_LYRICS_DEFAULT_SPEAKER_TEXT_COLORS);
const IV_LYRICS_SPEAKER_COLOR_KEY_PREFIX = "multi-vocal-speaker-color-";
const IV_LYRICS_SPEAKER_COLOR_STORAGE_PREFIX = "ivLyrics:visual:";
const IV_LYRICS_CREATOR_SPEAKER_COLOR_SETTING = "sync-data-custom-speaker-colors-enabled";

const normalizeIvLyricsSpeakerLabel = (value) => {
  const normalized = String(value || "")
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .toUpperCase();
  return IV_LYRICS_DEFAULT_SPEAKER_TEXT_COLORS[normalized]
    || normalized === "CUSTOM"
    || IV_LYRICS_LEGACY_CUSTOM_SPEAKER_FALLBACKS[normalized]
    ? normalized
    : "";
};

const normalizeIvLyricsSpeakerFallback = (fallback, sourceSpeaker = "") => {
  const normalized = String(fallback || "")
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .toUpperCase();
  if (IV_LYRICS_CUSTOM_SPEAKER_FALLBACK_OPTIONS.includes(normalized)) return normalized;
  const source = normalizeIvLyricsSpeakerLabel(sourceSpeaker);
  return IV_LYRICS_LEGACY_CUSTOM_SPEAKER_FALLBACKS[source] || "";
};

const getIvLyricsSpeakerFallback = (speaker, speakerFallback = "") => {
  const normalized = normalizeIvLyricsSpeakerLabel(speaker);
  if (normalized === "CUSTOM") {
    return normalizeIvLyricsSpeakerFallback(speakerFallback, speaker)
      || IV_LYRICS_DEFAULT_CUSTOM_SPEAKER_FALLBACK;
  }
  return IV_LYRICS_LEGACY_CUSTOM_SPEAKER_FALLBACKS[normalized] || normalized;
};

const isIvLyricsCustomSpeaker = (speaker) => (
  normalizeIvLyricsSpeakerLabel(speaker) === "CUSTOM"
  || !!IV_LYRICS_LEGACY_CUSTOM_SPEAKER_FALLBACKS[normalizeIvLyricsSpeakerLabel(speaker)]
);

const getIvLyricsSpeakerColorSettingKey = (speaker) => {
  const normalized = getIvLyricsSpeakerFallback(speaker);
  return normalized
    ? `${IV_LYRICS_SPEAKER_COLOR_KEY_PREFIX}${normalized.toLowerCase().replace(/\s+/g, "-")}`
    : "";
};

const getIvLyricsSpeakerColorCssVariable = (speaker) => {
  const settingKey = getIvLyricsSpeakerColorSettingKey(speaker);
  return settingKey ? `--ivlyrics-${settingKey}` : "";
};

const normalizeIvLyricsHexColor = (value) => {
  const color = String(value || "").trim();
  if (/^#[0-9a-f]{6}$/i.test(color)) return color.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(color)) {
    return `#${color.slice(1).split("").map((char) => char + char).join("")}`.toLowerCase();
  }
  return "";
};

const readIvLyricsSpeakerColorConfig = (speaker) => {
  const normalized = getIvLyricsSpeakerFallback(speaker);
  if (!normalized) return "";

  const settingKey = getIvLyricsSpeakerColorSettingKey(normalized);
  const configured = normalizeIvLyricsHexColor(window.CONFIG?.visual?.[settingKey]);
  if (configured) return configured;

  try {
    const stored = normalizeIvLyricsHexColor(localStorage.getItem(`${IV_LYRICS_SPEAKER_COLOR_STORAGE_PREFIX}${settingKey}`));
    if (stored) return stored;
  } catch (error) {
    // localStorage may be unavailable in restricted contexts.
  }

  return IV_LYRICS_DEFAULT_SPEAKER_TEXT_COLORS[normalized];
};

const setIvLyricsSpeakerColorConfig = (speaker, color) => {
  const normalized = getIvLyricsSpeakerFallback(speaker);
  const normalizedColor = normalizeIvLyricsHexColor(color);
  if (!normalized || !normalizedColor) return "";

  const settingKey = getIvLyricsSpeakerColorSettingKey(normalized);
  if (window.CONFIG?.visual) {
    window.CONFIG.visual[settingKey] = normalizedColor;
  }

  try {
    if (typeof StorageManager !== "undefined" && StorageManager?.saveConfig) {
      StorageManager.saveConfig(settingKey, normalizedColor);
    } else {
      localStorage.setItem(`${IV_LYRICS_SPEAKER_COLOR_STORAGE_PREFIX}${settingKey}`, normalizedColor);
    }
  } catch (error) {
    // Ignore persistence errors; the live CSS variable is still applied below.
  }

  return normalizedColor;
};

const isIvLyricsCreatorSpeakerColorEnabled = () => {
  const configured = window.CONFIG?.visual?.[IV_LYRICS_CREATOR_SPEAKER_COLOR_SETTING];
  if (typeof configured === "boolean") return configured;
  if (configured !== undefined && configured !== null) {
    return !["false", "0", "off", "no"].includes(String(configured).trim().toLowerCase());
  }

  try {
    const stored = localStorage.getItem(`${IV_LYRICS_SPEAKER_COLOR_STORAGE_PREFIX}${IV_LYRICS_CREATOR_SPEAKER_COLOR_SETTING}`);
    if (stored === null) return true;
    try {
      return JSON.parse(stored) !== false;
    } catch (error) {
      return !["false", "0", "off", "no"].includes(String(stored).trim().toLowerCase());
    }
  } catch (error) {
    return true;
  }
};

const getIvLyricsSpeakerPresentation = (speaker, speakerColor, speakerFallback = "") => {
  const normalized = normalizeIvLyricsSpeakerLabel(speaker);
  const effectiveSpeaker = getIvLyricsSpeakerFallback(normalized, speakerFallback);
  const creatorColor = isIvLyricsCustomSpeaker(normalized) && isIvLyricsCreatorSpeakerColorEnabled()
    ? normalizeIvLyricsHexColor(speakerColor)
    : "";
  const speakerClass = String(effectiveSpeaker || "")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-")
    .replace(/[^a-z0-9-]/g, "");

  return {
    speaker: normalized,
    effectiveSpeaker,
    speakerClass,
    creatorColor,
    color: creatorColor || readIvLyricsSpeakerColorConfig(effectiveSpeaker),
  };
};

const resetIvLyricsSpeakerColorConfig = () => {
  IV_LYRICS_SPEAKER_COLOR_OPTIONS.forEach((speaker) => {
    const settingKey = getIvLyricsSpeakerColorSettingKey(speaker);
    if (window.CONFIG?.visual) {
      window.CONFIG.visual[settingKey] = IV_LYRICS_DEFAULT_SPEAKER_TEXT_COLORS[speaker];
    }

    try {
      if (typeof StorageManager !== "undefined" && StorageManager?.removeItem) {
        StorageManager.removeItem(`${IV_LYRICS_SPEAKER_COLOR_STORAGE_PREFIX}${settingKey}`);
      } else {
        localStorage.removeItem(`${IV_LYRICS_SPEAKER_COLOR_STORAGE_PREFIX}${settingKey}`);
      }
    } catch (error) {
      // Ignore persistence errors.
    }
  });
};

const applyIvLyricsSpeakerColorCssVariables = (target = document.documentElement) => {
  if (!target?.style) return;
  IV_LYRICS_SPEAKER_COLOR_OPTIONS.forEach((speaker) => {
    const cssVariable = getIvLyricsSpeakerColorCssVariable(speaker);
    const color = readIvLyricsSpeakerColorConfig(speaker);
    if (cssVariable && color) {
      target.style.setProperty(cssVariable, color);
    }
  });
};

window.ivLyricsSpeakerColors = {
  defaultColors: IV_LYRICS_DEFAULT_SPEAKER_TEXT_COLORS,
  customFallbacks: IV_LYRICS_LEGACY_CUSTOM_SPEAKER_FALLBACKS,
  customFallbackOptions: IV_LYRICS_CUSTOM_SPEAKER_FALLBACK_OPTIONS,
  options: IV_LYRICS_SPEAKER_COLOR_OPTIONS,
  normalizeSpeaker: normalizeIvLyricsSpeakerLabel,
  normalizeFallback: normalizeIvLyricsSpeakerFallback,
  normalizeColor: normalizeIvLyricsHexColor,
  isCustomSpeaker: isIvLyricsCustomSpeaker,
  getFallbackSpeaker: getIvLyricsSpeakerFallback,
  isCreatorColorEnabled: isIvLyricsCreatorSpeakerColorEnabled,
  getPresentation: getIvLyricsSpeakerPresentation,
  getSettingKey: getIvLyricsSpeakerColorSettingKey,
  getCssVariableName: getIvLyricsSpeakerColorCssVariable,
  getTextColor: readIvLyricsSpeakerColorConfig,
  setTextColor(speaker, color) {
    const savedColor = setIvLyricsSpeakerColorConfig(speaker, color);
    if (savedColor) applyIvLyricsSpeakerColorCssVariables();
    return savedColor;
  },
  resetToDefaults() {
    resetIvLyricsSpeakerColorConfig();
    applyIvLyricsSpeakerColorCssVariables();
  },
  applyCssVariables: applyIvLyricsSpeakerColorCssVariables,
};

setTimeout(() => window.ivLyricsSpeakerColors?.applyCssVariables?.(), 0);

// Optimized Utils with performance improvements and caching
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
    if (!this._translatorInstance) this.translator = new Translator("zh", true);

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
  isSectionHeader(text) {
    if (!text || typeof text !== "string") return false;

    const normalizedText = text.trim();

    // 대괄호로 시작하고 끝나는 패턴 체크
    const bracketPattern = /^\s*\[.*\]\s*$/;
    if (!bracketPattern.test(normalizedText)) return false;

    // 일반적인 섹션 헤더 패턴들
    const sectionPatterns = [
      /^\s*\[\s*(verse|chorus|bridge|intro|outro|pre-?chorus|hook|refrain)\s*(\d+)?\s*(:|：)?\s*.*\]\s*$/i,
      /^\s*\[\s*(절|후렴|브릿지|인트로|아웃트로|간주|부분)\s*(\d+)?\s*(:|：)?\s*.*\]\s*$/i,
      /^\s*\[\s*(ヴァース|コーラス|ブリッジ|イントロ|アウトロ)\s*(\d+)?\s*(:|：)?\s*.*\]\s*$/i,
      /^\s*\[\s*(verse|chorus|bridge|intro|outro)\s*(\d+)?\s*(:|：)?\s*[^,\[\]]*\]\s*$/i,
    ];

    // 패턴 중 하나라도 매칭되면 섹션 헤더로 판단
    return sectionPatterns.some((pattern) => pattern.test(normalizedText));
  },

  /**
   * 언어 감지 함수 - LyricsService로 완전히 위임
   * LyricsService.js에 실제 구현이 있으며, 이 함수는 하위 호환성을 위한 래퍼입니다.
   * @param {Array} lyrics - 가사 배열
   * @returns {string|null} - 감지된 언어 코드 또는 null
   */
  detectLanguage(lyrics) {
    // LyricsService.detectLanguage 사용 (Extension에서 제공)
    if (window.LyricsService?.detectLanguage) {
      return window.LyricsService.detectLanguage(lyrics);
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
  rubyTextToHTML(s) {
    // React 310 방지: null/undefined/빈 문자열 체크
    if (!s || typeof s !== "string" || s.trim() === "") {
      return "";
    }
    // Allow only ruby-related tags we generate; escape others
    let out = s.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    // Re-enable allowed ruby tags
    out = out
      .replace(/&lt;ruby&gt;/g, "<ruby>")
      .replace(/&lt;\/ruby&gt;/g, "</ruby>")
      .replace(/&lt;rt&gt;/g, "<rt>")
      .replace(/&lt;\/rt&gt;/g, "</rt>")
      .replace(/&lt;rp&gt;/g, "<rp>")
      .replace(/&lt;\/rp&gt;/g, "</rp>");
    return out;
  },

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

  escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  },

  escapeAttribute(value) {
    return this.escapeHtml(value)
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  },

  sanitizeHttpUrl(url) {
    if (typeof url !== "string") return null;

    const trimmed = url.trim();
    if (!trimmed) return null;

    try {
      const parsed = new URL(trimmed, window.location.origin);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        return null;
      }
      return parsed.toString();
    } catch {
      return null;
    }
  },

  sanitizeCodeLanguage(lang) {
    return String(lang || "").toLowerCase().replace(/[^a-z0-9_-]/g, "");
  },

  formatCodeLanguageLabel(lang) {
    const safeLang = this.sanitizeCodeLanguage(lang);
    if (!safeLang) return "";

    const knownLabels = {
      js: "JavaScript",
      jsx: "JSX",
      ts: "TypeScript",
      tsx: "TSX",
      sh: "Shell",
      bash: "Bash",
      zsh: "Zsh",
      pwsh: "PowerShell",
      powershell: "PowerShell",
      ps1: "PowerShell",
      json: "JSON",
      yaml: "YAML",
      yml: "YAML",
      md: "Markdown",
      csharp: "C#",
      cpp: "C++",
      plaintext: "Plain Text",
      text: "Plain Text",
    };

    if (knownLabels[safeLang]) return knownLabels[safeLang];

    return safeLang
      .split(/[-_]/g)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  },

  renderSafeMarkdownToHTML(markdown, options = {}) {
    const escapeHtml = (value) => this.escapeHtml(value);
    const escapeAttribute = (value) => this.escapeAttribute(value);
    const sanitizeUrl = (url) => this.sanitizeHttpUrl(url);
    const sanitizeCodeLanguage = (lang) => this.sanitizeCodeLanguage(lang);
    const formatCodeLanguageLabel = (lang) => this.formatCodeLanguageLabel(lang);

    const linkStyle = options.linkStyle ? ` style="${escapeAttribute(options.linkStyle)}"` : "";
    const codeStyle = options.codeStyle ? ` style="${escapeAttribute(options.codeStyle)}"` : "";
    const paragraphStyle = options.paragraphStyle ? ` style="${escapeAttribute(options.paragraphStyle)}"` : "";
    const imageStyle = options.imageStyle || "max-width:100%;border-radius:8px;margin:8px 0;";
    const blockquoteStyle = options.blockquoteStyle || "";
    const hrStyle = options.hrStyle || "";
    const headingStyles = options.headingStyles || {};

    const renderLink = (url, label) => {
      const safeLabel = escapeHtml(label ?? url ?? "");
      const safeUrl = sanitizeUrl(url);
      if (!safeUrl) return safeLabel;
      return `<a href="${escapeAttribute(safeUrl)}" target="_blank" rel="noopener noreferrer"${linkStyle}>${safeLabel}</a>`;
    };

    const renderInline = (text) => {
      const tokens = [];
      const storeToken = (html) => {
        const token = `\uE000${tokens.length}\uE001`;
        tokens.push(html);
        return token;
      };

      let source = String(text ?? "");

      source = source.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src) => {
        const safeSrc = sanitizeUrl(src);
        if (!safeSrc) {
          return storeToken(alt ? escapeHtml(alt) : "");
        }
        return storeToken(
          `<img src="${escapeAttribute(safeSrc)}" alt="${escapeAttribute(alt)}" style="${escapeAttribute(imageStyle)}" loading="lazy" />`
        );
      });

      source = source.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) =>
        storeToken(renderLink(url, label))
      );

      source = source.replace(/`([^`]+)`/g, (_, code) =>
        storeToken(`<code${codeStyle}>${escapeHtml(code)}</code>`)
      );

      let html = escapeHtml(source);
      html = html
        .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.+?)\*/g, "<em>$1</em>")
        .replace(/~~(.+?)~~/g, "<del>$1</del>")
        .replace(/\n/g, "<br/>");

      return html.replace(/\uE000(\d+)\uE001/g, (_, index) => tokens[Number(index)] || "");
    };

    const renderCodeBlock = (code, lang) => {
      const safeLang = sanitizeCodeLanguage(lang);
      const className = safeLang ? ` class="language-${escapeAttribute(safeLang)}"` : "";
      const escapedCode = escapeHtml(String(code ?? "").trim());

      if (typeof options.codeBlockRenderer === "function") {
        return options.codeBlockRenderer({
          code: escapedCode,
          lang: safeLang,
          className,
          languageLabel: formatCodeLanguageLabel(lang),
          escapeHtml,
          escapeAttribute,
        });
      }

      const preStyle = options.preStyle ? ` style="${escapeAttribute(options.preStyle)}"` : "";
      const blockCodeStyle = options.blockCodeStyle ? ` style="${escapeAttribute(options.blockCodeStyle)}"` : "";
      return `<pre${preStyle}><code${className}${blockCodeStyle}>${escapedCode}</code></pre>`;
    };

    const renderList = (items, type) => {
      if (!items.length) return "";

      const isOrdered = type === "ordered";
      const isChecklist = type === "check";
      const tag = isOrdered ? "ol" : "ul";
      const listStyle = isChecklist
        ? options.checkListStyle || "margin: 8px 0 16px; padding-left: 8px; list-style: none;"
        : options.listStyle || `margin: 8px 0 16px; padding-left: 24px; list-style: ${isOrdered ? "decimal" : "disc"};`;
      const itemStyle = isChecklist
        ? options.checkListItemStyle || "margin: 6px 0; list-style: none;"
        : options.listItemStyle || "margin: 6px 0; padding-left: 4px;";
      const itemHtml = items
        .map((item) => {
          const marker = isChecklist
            ? `<span style="${escapeAttribute(item.checked ? options.checkedMarkerStyle || "color: #4ade80; margin-right: 6px;" : options.uncheckedMarkerStyle || "color: rgba(255,255,255,0.3); margin-right: 6px;")}">${item.checked ? "&#10003;" : "&#9633;"}</span>`
            : "";
          return `<li style="${escapeAttribute(itemStyle)}">${marker}${renderInline(item.text)}</li>`;
        })
        .join("");

      return `<${tag} style="${escapeAttribute(listStyle)}">${itemHtml}</${tag}>`;
    };

    const renderYoutubeEmbed = (line) => {
      if (!options.allowYouTubeEmbeds) return null;
      const match = line.match(/^(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)(?:[^\s]*)?$/);
      const safeVideoId = String(match?.[1] || "").replace(/[^\w-]/g, "");
      if (!safeVideoId) return null;
      return `<div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:8px;margin:8px 0;"><iframe src="https://www.youtube.com/embed/${safeVideoId}" style="position:absolute;top:0;left:0;width:100%;height:100%;border:none;" allowfullscreen></iframe></div>`;
    };

    const renderTable = (headers, rows) => {
      const headerHtml = headers.map((header) => `<th>${renderInline(header)}</th>`).join("");
      const rowHtml = rows
        .map((row) => `<tr>${row.map((cell) => `<td>${renderInline(cell)}</td>`).join("")}</tr>`)
        .join("");
      return `<table><thead><tr>${headerHtml}</tr></thead><tbody>${rowHtml}</tbody></table>`;
    };

    const lines = String(markdown ?? "").replace(/\r\n/g, "\n").split("\n");
    const html = [];
    let paragraph = [];
    let listItems = [];
    let listType = null;

    const flushParagraph = () => {
      if (!paragraph.length) return;
      html.push(`<p${paragraphStyle}>${renderInline(paragraph.join("\n"))}</p>`);
      paragraph = [];
    };

    const flushList = () => {
      if (!listItems.length) return;
      html.push(renderList(listItems, listType));
      listItems = [];
      listType = null;
    };

    const pushListItem = (type, item) => {
      flushParagraph();
      if (listType && listType !== type) flushList();
      listType = type;
      listItems.push(item);
    };

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const trimmed = line.trim();
      const fenceMatch = trimmed.match(/^```([^\s`]*)/);

      if (fenceMatch) {
        const codeLines = [];
        flushParagraph();
        flushList();
        i += 1;
        while (i < lines.length && !lines[i].trim().startsWith("```")) {
          codeLines.push(lines[i]);
          i += 1;
        }
        html.push(renderCodeBlock(codeLines.join("\n"), fenceMatch[1]));
        continue;
      }

      if (!trimmed) {
        flushParagraph();
        flushList();
        continue;
      }

      const youtubeEmbed = renderYoutubeEmbed(trimmed);
      if (youtubeEmbed) {
        flushParagraph();
        flushList();
        html.push(youtubeEmbed);
        continue;
      }

      if (options.allowTables && /^\|.+\|\s*$/.test(line) && /^\|[-| :]+\|\s*$/.test(lines[i + 1] || "")) {
        const headers = line.split("|").map((cell) => cell.trim()).filter(Boolean);
        const rows = [];
        i += 2;
        while (i < lines.length && /^\|.+\|\s*$/.test(lines[i])) {
          rows.push(lines[i].split("|").map((cell) => cell.trim()).filter(Boolean));
          i += 1;
        }
        i -= 1;
        flushParagraph();
        flushList();
        html.push(renderTable(headers, rows));
        continue;
      }

      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
      if (headingMatch) {
        const rawLevel = headingMatch[1].length;
        const mappedLevel = Math.min(rawLevel, 4);
        const heading = headingStyles[mappedLevel] || headingStyles[rawLevel] || {};
        const tag = heading.tag || `h${Math.min(rawLevel, 6)}`;
        const style = heading.style ? ` style="${escapeAttribute(heading.style)}"` : "";
        flushParagraph();
        flushList();
        html.push(`<${tag}${style}>${renderInline(headingMatch[2])}</${tag}>`);
        continue;
      }

      if (/^(-{3,}|\*{3,})$/.test(trimmed)) {
        flushParagraph();
        flushList();
        html.push(`<hr${hrStyle ? ` style="${escapeAttribute(hrStyle)}"` : ""} />`);
        continue;
      }

      const checkedMatch = line.match(/^\s*[-*+]\s+\[x\]\s+(.+)$/i);
      if (checkedMatch) {
        pushListItem("check", { text: checkedMatch[1], checked: true });
        continue;
      }

      const uncheckedMatch = line.match(/^\s*[-*+]\s+\[ \]\s+(.+)$/);
      if (uncheckedMatch) {
        pushListItem("check", { text: uncheckedMatch[1], checked: false });
        continue;
      }

      const unorderedMatch = line.match(/^\s*[-*+]\s+(.+)$/);
      if (unorderedMatch) {
        pushListItem("unordered", { text: unorderedMatch[1] });
        continue;
      }

      const orderedMatch = line.match(/^\s*\d+\.\s+(.+)$/);
      if (orderedMatch) {
        pushListItem("ordered", { text: orderedMatch[1] });
        continue;
      }

      const quoteMatch = line.match(/^>\s+(.+)$/);
      if (quoteMatch) {
        flushParagraph();
        flushList();
        html.push(`<blockquote${blockquoteStyle ? ` style="${escapeAttribute(blockquoteStyle)}"` : ""}>${renderInline(quoteMatch[1])}</blockquote>`);
        continue;
      }

      flushList();
      paragraph.push(line);
    }

    flushParagraph();
    flushList();

    return html.join("").trim();
  },
  /**
   * Parse furigana HTML to extract readings for each kanji (최적화 #3)
   * @param {string} processedText - HTML text with ruby tags
   * @returns {Map<number, string>} - Map of position to reading
   */
  parseFuriganaMapping(processedText) {
    const furiganaMap = new Map();
    if (!processedText || typeof processedText !== "string") return furiganaMap;

    const rubyRegex = /<ruby>([^<]+)<rt>([^<]+)<\/rt><\/ruby>/g;

    // Now parse the HTML and map positions
    let currentPos = 0;
    let lastMatchEnd = 0;
    let match;

    rubyRegex.lastIndex = 0;

    while ((match = rubyRegex.exec(processedText)) !== null) {
      const kanjiSequence = match[1];
      const reading = match[2];

      // Calculate position by counting plain text before this match
      const beforeMatch = processedText.substring(lastMatchEnd, match.index);
      const plainTextBefore = beforeMatch.replace(/<[^>]+>/g, '');
      currentPos += plainTextBefore.length;

      // Map each kanji to its reading
      if (kanjiSequence.length === 1) {
        furiganaMap.set(currentPos, reading);
      } else {
        // Multiple kanji - split the reading
        const kanjiChars = Array.from(kanjiSequence);
        const readingChars = Array.from(reading);
        const charsPerKanji = Math.floor(readingChars.length / kanjiChars.length);

        kanjiChars.forEach((kanji, idx) => {
          let kanjiReading;
          if (idx === kanjiChars.length - 1) {
            // Last kanji gets all remaining reading
            kanjiReading = readingChars.slice(idx * charsPerKanji).join('');
          } else {
            kanjiReading = readingChars.slice(idx * charsPerKanji, (idx + 1) * charsPerKanji).join('');
          }
          furiganaMap.set(currentPos + idx, kanjiReading);
        });
      }

      // Move position forward by the number of kanji
      currentPos += kanjiSequence.length;
      lastMatchEnd = match.index + match[0].length;
    }

    return furiganaMap;
  },

  // Store detected language globally for furigana check
  _currentDetectedLanguage: null,

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

  /**
   * Apply furigana to Japanese text if enabled in settings
   * Only applies when the detected language is Japanese ('ja')
   * @param {string} text - The text to process
   * @returns {string} - Text with furigana HTML tags if applicable
   */
  applyFuriganaIfEnabled(text) {
    // Check if furigana is enabled
    if (!CONFIG?.visual?.["furigana-enabled"]) {
      return text;
    }

    if (!text || typeof text !== "string") {
      return text;
    }

    // Only apply furigana when the detected language is Japanese
    // This prevents furigana from being applied to Chinese songs
    const detectedLang = this._currentDetectedLanguage;
    if (detectedLang !== "ja") {
      return text;
    }

    // Check if text contains kanji
    if (!KANJI_CHARACTER_REGEX.test(text)) {
      return text;
    }

    try {
      // Use FuriganaConverter if available

      if (typeof window.FuriganaConverter !== "undefined") {
        // Try to convert even if not fully initialized - it will return original text if not ready
        const result = window.FuriganaConverter.convertToFurigana(text);
        return result || text;
      } else {
      }
      return text;
    } catch (error) {
      return text;
    }
  },
  formatTime(timestamp) {
    if (Number.isNaN(timestamp)) return timestamp.toString();
    let minutes = Math.trunc(timestamp / 60000);
    let seconds = ((timestamp - minutes * 60000) / 1000).toFixed(2);

    if (minutes < 10) minutes = `0${minutes}`;
    if (seconds < 10) seconds = `0${seconds}`;

    return `${minutes}:${seconds}`;
  },
  formatTextWithTimestamps(text, startTime = 0) {
    if (text.props?.children) {
      return text.props.children
        .map((child) => {
          if (typeof child === "string") {
            return child;
          }
          if (child.props?.children) {
            return child.props?.children[0];
          }
        })
        .join("");
    }
    if (Array.isArray(text)) {
      let wordTime = startTime;
      return text
        .map((word) => {
          wordTime += word.time;
          return `${word.word}<${this.formatTime(wordTime)}>`;
        })
        .join("");
    }
    return text;
  },

  /**
   * 해당 줄의 활성화된 항목들만 복사하기 위한 텍스트 생성
   * @param {string|object} mainText - 메인 텍스트 (후리가나 HTML 포함 가능, 또는 객체)
   * @param {string} subText - 발음 (로마지 등)
   * @param {string} subText2 - 번역
   * @param {string} originalText - 원문 가사 (원본)
   * @returns {string} 복사할 텍스트
   */
  formatLyricLineToCopy(mainText, subText, subText2, originalText) {
    const lines = [];

    // HTML 태그 제거 헬퍼
    const cleanHtml = (text) => {
      if (!text || typeof text !== "string") return "";
      if (!text.includes("<")) return text.trim();
      return text
        .replace(CLEAN_HTML_RT_REGEX, "") // rt 태그 제거
        .replace(CLEAN_HTML_RUBY_REGEX, "") // ruby 태그 제거
        .replace(CLEAN_HTML_TAG_REGEX, "") // 기타 HTML 태그 제거
        .trim();
    };

    // 원문 처리 - originalText가 있으면 우선 사용, 없으면 mainText 사용
    let originalClean = "";
    if (originalText && typeof originalText === "string") {
      originalClean = cleanHtml(originalText);
    } else if (mainText && typeof mainText === "string") {
      originalClean = cleanHtml(mainText);
    } else if (mainText && typeof mainText === "object" && mainText.text) {
      // 카라오케 모드에서 line 객체인 경우
      originalClean = cleanHtml(mainText.text);
    }

    if (originalClean) {
      lines.push(originalClean);
    }

    // subText 처리 (발음)
    const subClean = cleanHtml(subText);
    if (subClean) {
      lines.push(subClean);
    }

    // subText2 처리 (번역)
    const sub2Clean = cleanHtml(subText2);
    if (sub2Clean) {
      lines.push(sub2Clean);
    }

    return lines.join("\n");
  },

  convertParsedToLRC(lyrics, isBelow) {
    let original = "";
    let conver = "";

    if (isBelow) {
      for (const line of lyrics) {
        if (line) {
          const startTime = line.startTime || 0;
          original += `[${this.formatTime(
            startTime
          )}]${this.formatTextWithTimestamps(
            line.originalText || "",
            startTime
          )}\n`;
          conver += `[${this.formatTime(
            startTime
          )}]${this.formatTextWithTimestamps(line.text || "", startTime)}\n`;
        }
      }
    } else {
      for (const line of lyrics) {
        if (line) {
          const startTime = line.startTime || 0;
          original += `[${this.formatTime(
            startTime
          )}]${this.formatTextWithTimestamps(line.text || "", startTime)}\n`;
        }
      }
    }

    return {
      original,
      conver,
    };
  },
  convertParsedToUnsynced(lyrics, isBelow) {
    let original = "";
    let conver = "";

    if (isBelow) {
      for (const line of lyrics) {
        if (typeof line.originalText === "object") {
          original += `${line.originalText?.props?.children?.[0]}\n`;
        } else {
          original += `${line.originalText}\n`;
        }

        if (typeof line.text === "object") {
          conver += `${line.text?.props?.children?.[0]}\n`;
        } else {
          conver += `${line.text}\n`;
        }
      }
    } else {
      for (const line of lyrics) {
        if (typeof line.text === "object") {
          original += `${line.text?.props?.children?.[0]}\n`;
        } else {
          original += `${line.text}\n`;
        }
      }
    }

    return {
      original,
      conver,
    };
  },
  parseLocalLyrics(lyrics) {
    // Preprocess lyrics by removing [tags] and empty lines
    const lines = lyrics
      .replaceAll(/\[[a-zA-Z]+:.+\]/g, "")
      .trim()
      .split("\n");

    const syncedTimestamp = /\[([0-9:.]+)\]/;
    const karaokeTimestamp = /<([0-9:.]+)>/;

    const unsynced = [];

    const isSynced = lines[0].match(syncedTimestamp);
    const synced = isSynced ? [] : null;

    const isKaraoke = lines[0].match(karaokeTimestamp);
    const karaoke = isKaraoke ? [] : null;

    function timestampToMs(timestamp) {
      const [minutes, seconds] = timestamp.replace(/\[\]<>/, "").split(":");
      return Number(minutes) * 60 * 1000 + Number(seconds) * 1000;
    }

    function parseKaraokeLine(line, startTime) {
      let wordTime = timestampToMs(startTime);
      const karaokeLine = [];
      const karaoke = line.matchAll(/(\S+ ?)<([0-9:.]+)>/g);
      for (const match of karaoke) {
        const word = match[1];
        const time = match[2];
        karaokeLine.push({ word, time: timestampToMs(time) - wordTime });
        wordTime = timestampToMs(time);
      }
      return karaokeLine;
    }

    for (const [i, line] of lines.entries()) {
      const time = line.match(syncedTimestamp)?.[1];
      let lyricContent = line.replace(syncedTimestamp, "").trim();
      const lyric = lyricContent.replaceAll(/<([0-9:.]+)>/g, "").trim();

      if (line.trim() !== "") {
        if (isKaraoke) {
          if (!lyricContent.endsWith(">")) {
            // For some reason there are a variety of formats for karaoke lyrics, Wikipedia is also inconsisent in their examples
            const endTime =
              lines[i + 1]?.match(syncedTimestamp)?.[1] ||
              this.formatTime(
                Number(Spicetify.Player.data.item.metadata.duration)
              );
            lyricContent += `<${endTime}>`;
          }
          const karaokeLine = parseKaraokeLine(lyricContent, time);
          karaoke.push({ text: karaokeLine, startTime: timestampToMs(time) });
        }
        isSynced &&
          time &&
          synced.push({ text: lyric || "♪", startTime: timestampToMs(time) });
        unsynced.push({ text: lyric || "♪" });
      }
    }

    return { synced, unsynced, karaoke };
  },
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
  currentVersion: "5.5.3",

  /**
   * Check for updates from remote repository
   * @returns {Promise<{hasUpdate: boolean, currentVersion: string, latestVersion: string}>}
   */
  async checkForUpdates() {
    try {
      // Try multiple CDN URLs to avoid CORS issues
      const urls = [
        "https://raw.githubusercontent.com/ivLis-Studio/ivLyrics/main/version.txt",
        "https://cdn.jsdelivr.net/gh/ivLis-Studio/ivLyrics@main/version.txt",
        //https://ghproxy.link/
        "https://ghfast.top/https://raw.githubusercontent.com/ivLis-Studio/ivLyrics/main/version.txt",
        "https://corsproxy.io/?url=https://raw.githubusercontent.com/ivLis-Studio/ivLyrics/main/version.txt",
      ];

      let latestVersion = null;
      let lastError = null;

      for (const url of urls) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout per attempt

          const response = await fetch(url, {
            signal: controller.signal,
            cache: "no-cache",
            headers: {
              Accept: "text/plain, */*",
            },
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          latestVersion = (await response.text()).trim();

          // If we successfully got a version, break the loop
          if (latestVersion && /^\d+\.\d+\.\d+$/.test(latestVersion)) {
            break;
          }
        } catch (error) {
          lastError = error;
          // Continue to next URL
          continue;
        }
      }

      if (!latestVersion) {
        throw (
          lastError || new Error(I18n.t("utils.allUrlsFailed"))
        );
      }

      // Validate version format (should be like "1.2.3")
      if (!/^\d+\.\d+\.\d+$/.test(latestVersion)) {
        throw new Error(`${I18n.t("utils.invalidVersionFormat")}: ${latestVersion}`);
      }

      const hasUpdate =
        this.compareVersions(latestVersion, this.currentVersion) > 0;

      return {
        hasUpdate,
        currentVersion: this.currentVersion,
        latestVersion,
      };
    } catch (error) {
      let errorMessage = I18n.t("utils.unknownError");
      if (error.name === "AbortError") {
        errorMessage = I18n.t("utils.requestTimeout");
      } else if (
        error.message.includes("fetch") ||
        error.message.includes("NetworkError")
      ) {
        errorMessage = I18n.t("utils.networkError");
      } else if (error.message.includes("CORS")) {
        errorMessage = I18n.t("utils.securityRestriction");
      } else if (error.message.includes("HTTP")) {
        errorMessage = I18n.t("utils.serverError");
      } else if (error.message.includes("URL") || error.message.includes("version")) {
        errorMessage = error.message;
      } else {
        errorMessage = error.message;
      }

      return {
        hasUpdate: false,
        currentVersion: this.currentVersion,
        latestVersion: this.currentVersion,
        error: errorMessage,
      };
    }
  },

  /**
   * Compare two version strings
   * @param {string} a - First version (e.g., "1.1.0")
   * @param {string} b - Second version (e.g., "1.0.9")
   * @returns {number} - 1 if a > b, -1 if a < b, 0 if equal
   */
  compareVersions(a, b) {
    const aParts = a.split(".").map(Number);
    const bParts = b.split(".").map(Number);

    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
      const aPart = aParts[i] || 0;
      const bPart = bParts[i] || 0;

      if (aPart > bPart) return 1;
      if (aPart < bPart) return -1;
    }

    return 0;
  },

  /**
   * Show update notification if available
   */
  async showUpdateNotificationIfAvailable() {
    try {
      const updateInfo = await this.checkForUpdates();

      window.__ivLyricsDebugLog?.("[ivLyrics] Update check result:", updateInfo);

      // Don't show notification if there was an error
      if (updateInfo.error) {
        window.__ivLyricsDebugLog?.("[ivLyrics] Update check error:", updateInfo.error);
        return updateInfo;
      }

      if (updateInfo.hasUpdate) {
        const updateKey = `ivLyrics:update-dismissed:${updateInfo.latestVersion}`;
        const isDismissed = StorageManager.getItem(updateKey);

        window.__ivLyricsDebugLog?.(
          "[ivLyrics] Update available:",
          updateInfo.latestVersion,
          "Dismissed:",
          isDismissed
        );

        if (!isDismissed) {
          // Store update info for the banner component
          window.ivLyrics_updateInfo = {
            available: true,
            currentVersion: updateInfo.currentVersion,
            latestVersion: updateInfo.latestVersion,
            releaseUrl: `https://github.com/ivLis-Studio/ivLyrics/releases/tag/v${updateInfo.latestVersion}`,
          };

          window.__ivLyricsDebugLog?.(
            "[ivLyrics] Update banner info stored:",
            window.ivLyrics_updateInfo
          );

          // Trigger re-render if lyrics container exists
          if (window.lyricContainer) {
            try {
              window.__ivLyricsDebugLog?.("[ivLyrics] Triggering lyricContainer re-render");
              window.lyricContainer.forceUpdate();
            } catch (e) {
              console.error("[ivLyrics] Failed to trigger re-render:", e);
            }
          } else {
            console.warn("[ivLyrics] lyricContainer not found");
          }
        }
      } else {
        window.__ivLyricsDebugLog?.("[ivLyrics] Already up to date");
      }

      return updateInfo;
    } catch (error) {
      // Silently fail for automatic update checks to avoid spam
      return {
        hasUpdate: false,
        currentVersion: this.currentVersion,
        latestVersion: this.currentVersion,
        error: error.message,
      };
    }
  },

  /**
   * Dismiss update notification
   */
  dismissUpdate(version) {
    const updateKey = `ivLyrics:update-dismissed:${version}`;
    StorageManager.setItem(updateKey, "dismissed");
    window.ivLyrics_updateInfo = null;

    // Trigger re-render
    if (window.lyricContainer) {
      try {
        window.lyricContainer.forceUpdate();
      } catch (e) { }
    }
  },

  /**
   * Copy to clipboard using Spicetify API
   */
  async copyToClipboard(text) {
    try {
      if (Spicetify?.Platform?.ClipboardAPI?.copy) {
        await Spicetify.Platform.ClipboardAPI.copy(text);
        return true;
      }
      // Fallback
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
      return false;
    } catch (error) {
      console.error("[Utils] Copy failed:", error);
      return false;
    }
  },

  async requestSaveFileTarget(fileName, options = {}) {
    if (typeof window.showSaveFilePicker !== "function") {
      return { handle: null, canceled: false };
    }

    const {
      description = "JSON",
      mimeType = "application/json",
      extensions = [".json"],
    } = options;

    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: fileName,
        types: [
          {
            description,
            accept: {
              [mimeType]: extensions,
            },
          },
        ],
      });
      return { handle, canceled: false };
    } catch (error) {
      if (error?.name === "AbortError") {
        return { handle: null, canceled: true };
      }

      console.warn("[Utils] Save file picker unavailable, falling back to download:", error);
      return { handle: null, canceled: false };
    }
  },

  async saveBlobAs(blob, fileName, saveTarget = null) {
    const handle = saveTarget?.handle || saveTarget;

    if (handle && typeof handle.createWritable === "function") {
      const writable = await handle.createWritable();
      try {
        await writable.write(blob);
      } finally {
        await writable.close();
      }
      return "picker";
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    return "download";
  },

  /**
   * Detect platform
   */
  detectPlatform() {
    const userAgent = navigator.userAgent.toLowerCase();
    if (userAgent.includes("win")) return "windows";
    if (userAgent.includes("mac")) return "mac";
    return "linux";
  },

  /**
   * Get install command for current platform
   */
  getInstallCommand() {
    const commands = {
      windows: "iwr -useb https://ivlis.kr/ivLyrics/install.ps1 | iex",
      mac: "curl -fsSL https://ivlis.kr/ivLyrics/install.sh | bash",
      linux: "curl -fsSL https://ivlis.kr/ivLyrics/install.sh | bash",
    };
    return commands[this.detectPlatform()];
  },

  /**
   * Whether the one-click local updater protocol is supported on this platform.
   * Windows uses HKCU URL protocol registration, macOS uses a local app bundle,
   * and Linux uses xdg-mime with a desktop entry.
   */
  canUseUpdaterProtocol() {
    return ["windows", "mac", "linux"].includes(this.detectPlatform());
  },

  /**
   * Open the public update bridge page. Spotify's internal webview can block
   * custom protocol navigation, so the browser page performs the protocol jump.
   */
  openUpdaterProtocol() {
    const url = "https://lyrics.ivl.is/update";

    try {
      const link = document.createElement("a");
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      link.remove();
      return true;
    } catch (error) {
      console.error("[Utils] Failed to open updater protocol:", error);
      return false;
    }
  },

  /**
   * Get platform name in Korean
   */
  getPlatformName() {
    const names = {
      windows: "Windows PowerShell",
      mac: I18n.t("utils.terminalMac"),
      linux: "Terminal",
    };
    return names[this.detectPlatform()];
  },

  getGlobalSyncOffset() {
    const fromConfig = window.CONFIG?.visual?.["global-sync-offset"];
    const fromStorage = (() => {
      try {
        return localStorage.getItem("ivLyrics:visual:global-sync-offset");
      } catch (error) {
        return null;
      }
    })();
    const numericValue = Number(fromConfig ?? fromStorage ?? 0);
    if (!Number.isFinite(numericValue)) return 0;
    return Math.max(-10000, Math.min(10000, Math.round(numericValue)));
  },

  setGlobalSyncOffset(offset) {
    const numericValue = Number(offset);
    const safeOffset = Number.isFinite(numericValue)
      ? Math.max(-10000, Math.min(10000, Math.round(numericValue)))
      : 0;

    if (window.CONFIG?.visual) {
      window.CONFIG.visual["global-sync-offset"] = safeOffset;
    }

    try {
      if (typeof StorageManager !== "undefined" && StorageManager?.saveConfig) {
        StorageManager.saveConfig("global-sync-offset", safeOffset);
      } else {
        localStorage.setItem("ivLyrics:visual:global-sync-offset", String(safeOffset));
      }
    } catch (error) {
      console.error("[ivLyrics] Failed to save global sync offset:", error);
    }

    window.dispatchEvent(new CustomEvent("ivLyrics:global-offset-changed", {
      detail: { offset: safeOffset }
    }));
    window.dispatchEvent(new CustomEvent("ivLyrics", {
      detail: { type: "config", name: "global-sync-offset", value: safeOffset }
    }));
  },

  // Track-specific sync offset management (using IndexedDB)
  async getTrackSyncOffset(trackUri) {
    if (!trackUri) return 0;
    try {
      return await TrackSyncDB.getOffset(trackUri);
    } catch (error) {
      console.error("[ivLyrics] Failed to get track sync offset:", error);
      return 0;
    }
  },

  async setTrackSyncOffset(trackUri, offset) {
    if (!trackUri) return;
    try {
      await TrackSyncDB.setOffset(trackUri, offset);
      // Dispatch custom event to notify offset change
      window.dispatchEvent(new CustomEvent('ivLyrics:offset-changed', {
        detail: { trackUri, offset }
      }));
    } catch (error) {
      console.error("[ivLyrics] Failed to set track sync offset:", error);
    }
  },

  async clearTrackSyncOffset(trackUri) {
    if (!trackUri) return;
    try {
      await TrackSyncDB.clearOffset(trackUri);
    } catch (error) {
      console.error("[ivLyrics] Failed to clear track sync offset:", error);
    }
  },

  // ==========================================
  // 커뮤니티 싱크 오프셋 시스템
  // ==========================================

  /**
   * 사용자 해시 가져오기 (없으면 생성)
   */
  getUserHash() {
    if (window.LyricsService && window.LyricsService.getUserHash) {
      return window.LyricsService.getUserHash();
    }
    // Fallback logic in case LyricsService is not available (should not happen usually)
    let hash = StorageManager.getPersisted("ivLyrics:user-hash");
    if (!hash) {
      hash = this.generateUserHash();
      StorageManager.setPersisted("ivLyrics:user-hash", hash);
    }
    return hash;
  },

  generateUserHash() {
    return crypto.randomUUID
      ? crypto.randomUUID()
      : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
          const r = Math.random() * 16 | 0;
          const v = c === 'x' ? r : (r & 0x3 | 0x8);
          return v.toString(16);
        });
  },

  isDiscordUserHash(userHash) {
    return typeof userHash === "string" && /^\d{15,22}$/.test(userHash.trim());
  },

  setUserHash(userHash) {
    if (!userHash || typeof userHash !== "string") return;

    try {
      Spicetify?.LocalStorage?.set?.("ivLyrics:user-hash", userHash);
    } catch (error) {
      console.error("[ivLyrics] Failed to update Spicetify user hash:", error);
    }

    try {
      if (window.StorageManager?.setPersisted) {
        window.StorageManager.setPersisted("ivLyrics:user-hash", userHash);
      }
    } catch (error) {
      console.error("[ivLyrics] Failed to update persisted user hash:", error);
    }
  },

  getAuthToken() {
    let token = null;

    try {
      token = Spicetify?.LocalStorage?.get?.("ivLyrics:auth-token") || null;
    } catch (error) {
      console.error("[ivLyrics] Failed to read auth token from Spicetify storage:", error);
    }

    if (!token) {
      try {
        token = window.StorageManager?.getPersisted?.("ivLyrics:auth-token") || null;
      } catch (error) {
        console.error("[ivLyrics] Failed to read auth token from persisted storage:", error);
      }
    }

    return typeof token === "string" && token.trim() ? token.trim() : null;
  },

  setAuthToken(token) {
    if (!token || typeof token !== "string") return;

    try {
      Spicetify?.LocalStorage?.set?.("ivLyrics:auth-token", token);
    } catch (error) {
      console.error("[ivLyrics] Failed to store auth token in Spicetify storage:", error);
    }

    try {
      window.StorageManager?.setPersisted?.("ivLyrics:auth-token", token);
    } catch (error) {
      console.error("[ivLyrics] Failed to store auth token in persisted storage:", error);
    }
  },

  clearAuthToken() {
    try {
      Spicetify?.LocalStorage?.remove?.("ivLyrics:auth-token");
    } catch (error) {
      console.error("[ivLyrics] Failed to clear auth token from Spicetify storage:", error);
    }

    try {
      window.StorageManager?.setPersisted?.("ivLyrics:auth-token", "");
    } catch (error) {
      console.error("[ivLyrics] Failed to clear auth token from persisted storage:", error);
    }
  },

  getApiHeaders(headers = {}) {
    const nextHeaders = { ...headers };
    const authToken = this.getAuthToken();
    if (authToken) {
      nextHeaders.Authorization = `Bearer ${authToken}`;
    }
    return nextHeaders;
  },

  queueReturnToSettings(options = {}) {
    try {
      localStorage.setItem(
        "ivLyrics:return-to-settings",
        JSON.stringify({
          initialTab: options.initialTab || "about",
          initialSettingKey: options.initialSettingKey || "about-account",
        })
      );
    } catch (error) {
      console.error("[ivLyrics] Failed to queue return-to-settings state:", error);
    }
  },

  restoreAccountSettings(options = {}) {
    const nextOptions = {
      initialTab: options.initialTab || "about",
      initialSettingKey: options.initialSettingKey || "about-account",
    };

    try {
      this.queueReturnToSettings(nextOptions);
      localStorage.setItem(
        "ivLyrics:restore-route-after-reload",
        JSON.stringify({
          path: "/ivLyrics",
          expiresAt: Date.now() + 15000,
        })
      );
    } catch (error) {
      console.error("[ivLyrics] Failed to queue ivLyrics route restore:", error);
    }

    try {
      Spicetify?.Platform?.History?.push?.("/ivLyrics");
    } catch (error) {
      console.error("[ivLyrics] Failed to navigate to ivLyrics before reload:", error);
    }

    window.setTimeout(() => {
      window.location.reload();
    }, Number(options.reloadDelay) || 300);

    return true;
  },

  resetUserHash() {
    const nextUserHash = this.generateUserHash();
    this.setUserHash(nextUserHash);
    this.clearAuthToken();
    window.__ivLyricsDiscordLoginToken = null;
    return nextUserHash;
  },

  getAccountApiBase() {
    return "https://lyrics.api.ivl.is/user";
  },

  async fetchAccountProfile(options = {}) {
    const includeUserHash = options.includeUserHash !== false;
    const currentUserHash = this.getUserHash();
    const authToken = this.getAuthToken();

    if (includeUserHash && this.isDiscordUserHash(currentUserHash) && !authToken) {
      return {
        success: true,
        authenticated: false,
        linked: false,
        account: null,
        nickname: null,
        userHash: currentUserHash,
        staleDiscordSession: true,
      };
    }

    const requestUrl = new URL(`${this.getAccountApiBase()}/profile`);
    if (includeUserHash) {
      requestUrl.searchParams.set("userHash", currentUserHash);
    }

    const response = await fetch(
      requestUrl.toString(),
      {
        cache: "no-store",
        headers: this.getApiHeaders({
          "Cache-Control": "no-cache, no-store, must-revalidate",
          Pragma: "no-cache",
        }),
      }
    );
    const data = await response.json();

    if (!response.ok) {
      const errorMessage =
        data.error ||
          I18n.t("settingsAdvanced.aboutTab.account.loadFailed") ||
          "Failed to load account information.";

      if (
        includeUserHash &&
        this.isDiscordUserHash(currentUserHash) &&
        (response.status === 400 || response.status === 401) &&
        /(?:valid userhash|discord login is required)/i.test(errorMessage)
      ) {
        this.clearAuthToken();
        return {
          success: true,
          authenticated: false,
          linked: false,
          account: null,
          nickname: null,
          userHash: currentUserHash,
          staleDiscordSession: true,
        };
      }

      const error = new Error(errorMessage);
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return data;
  },

  async requireDiscordAuth(message, options = {}) {
    const checkingMessage = options.checkingMessage;
    const showProgress = !!checkingMessage && !!Toast?.progress;
    const loginRequiredMessage =
      message || I18n.t("settingsAdvanced.aboutTab.account.loginRequired");

    if (showProgress) {
      Toast.progress(checkingMessage, 0);
    }

    try {
      if (!this.getAuthToken()) {
        throw new Error(loginRequiredMessage);
      }

      const profile = await this.fetchAccountProfile({ includeUserHash: false });
      if (!profile?.authenticated || !profile?.linked || !profile?.account) {
        throw new Error(loginRequiredMessage);
      }

      return profile;
    } catch (error) {
      if (error?.status === 400 || error?.status === 401 || error?.status === 404) {
        this.clearAuthToken();
        throw new Error(loginRequiredMessage);
      }
      throw error;
    } finally {
      if (showProgress && Toast?.dismissProgress) {
        Toast.dismissProgress();
      }
    }
  },

  promptDiscordLoginRequired(message, options = {}) {
    const text = message || I18n.t("settingsAdvanced.aboutTab.account.loginRequired");

    Toast?.error?.(text);
    this.restoreAccountSettings({
      initialTab: "about",
      initialSettingKey: "about-account",
      reloadDelay: options.reloadDelay || 900,
    });

    return text;
  },

  async startDiscordLogin(options = {}) {
    let currentUserHash = this.getUserHash();

    if (this.isDiscordUserHash(currentUserHash) && !this.getAuthToken()) {
      currentUserHash = this.resetUserHash();
      window.SyncDataService?.clearCache?.();
      window.dispatchEvent(
        new CustomEvent("ivLyrics:account-changed", {
          detail: {
            linked: false,
            userHash: currentUserHash,
            staleDiscordSession: true,
          },
        })
      );
    }

    const response = await fetch(`${this.getAccountApiBase()}/discord/start`, {
      method: "POST",
      headers: this.getApiHeaders({
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({ currentUserHash }),
    });
    const data = await response.json();

    if (!response.ok || !data.success || !data.authorizeUrl) {
      const errorMessage =
        data.error ||
          I18n.t("settingsAdvanced.aboutTab.account.failed") ||
          "Discord login failed.";

      if (
        options.retryOnStaleDiscordHash !== false &&
        response.status === 401 &&
        this.isDiscordUserHash(currentUserHash) &&
        /discord login is required.*discord account id/i.test(errorMessage)
      ) {
        const nextUserHash = this.resetUserHash();
        window.SyncDataService?.clearCache?.();
        window.dispatchEvent(
          new CustomEvent("ivLyrics:account-changed", {
            detail: {
              linked: false,
              userHash: nextUserHash,
              staleDiscordSession: true,
            },
          })
        );
        return this.startDiscordLogin({ ...options, retryOnStaleDiscordHash: false });
      }

      throw new Error(errorMessage);
    }

    window.open(data.authorizeUrl, "_blank", "noopener,noreferrer");
    return data;
  },

  async handleDiscordAuthCallback(loginToken) {
    if (!loginToken) return false;

    if (window.__ivLyricsDiscordLoginToken === loginToken) {
      return false;
    }
    window.__ivLyricsDiscordLoginToken = loginToken;

    try {
      const response = await fetch(
        `${this.getAccountApiBase()}/discord/session?loginToken=${encodeURIComponent(loginToken)}`,
        {
          cache: "no-store",
          headers: this.getApiHeaders({
            "Cache-Control": "no-cache, no-store, must-revalidate",
            Pragma: "no-cache",
          }),
        }
      );
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.error ||
            I18n.t("settingsAdvanced.aboutTab.account.failed") ||
            "Discord login failed."
        );
      }

      const newUserHash = data.data?.userHash || data.data?.discordId;
      const authToken = data.data?.authToken;
      if (!newUserHash) {
        throw new Error(
          I18n.t("settingsAdvanced.aboutTab.account.failed") ||
            "Discord login failed."
        );
      }

      this.setUserHash(newUserHash);
      if (authToken) {
        this.setAuthToken(authToken);
      }
      window.SyncDataService?.clearCache?.();
      window.dispatchEvent(
        new CustomEvent("ivLyrics:account-changed", { detail: data.data })
      );

      Toast?.success?.(
        I18n.t("settingsAdvanced.aboutTab.account.discordLoginSuccess") ||
          "Discord account linked successfully."
      );

      this.restoreAccountSettings({
        initialTab: "about",
        initialSettingKey: "about-account",
      });

      return true;
    } catch (error) {
      Toast?.error?.(
        error.message ||
          I18n.t("settingsAdvanced.aboutTab.account.failed") ||
          "Discord login failed."
      );
      window.__ivLyricsDiscordLoginToken = null;
      return false;
    }
  },

  async logoutDiscordSession() {
    const authToken = this.getAuthToken();
    if (!authToken) {
      return true;
    }

    try {
      await fetch(`${this.getAccountApiBase()}/logout`, {
        method: "POST",
        headers: this.getApiHeaders({
          "Content-Type": "application/json",
        }),
      });
    } catch (error) {
      console.error("[ivLyrics] Failed to revoke Discord session:", error);
    } finally {
      this.clearAuthToken();
    }

    return true;
  },

  async fetchSyncCreatorProfile(userHash, options = {}) {
    if (!userHash || typeof userHash !== "string") {
      throw new Error(
        I18n.t("creatorProfile.loadFailed") || "Failed to load creator profile."
      );
    }

    const params = new URLSearchParams({
      userHash,
    });

    if (Number.isFinite(options.limit) && options.limit > 0) {
      params.set("limit", String(Math.floor(options.limit)));
    }

    if (Number.isFinite(options.offset) && options.offset >= 0) {
      params.set("offset", String(Math.floor(options.offset)));
    }

    if (typeof options.sort === "string" && options.sort.trim()) {
      params.set("sort", options.sort.trim());
    }

    if (typeof options.artist === "string" && options.artist.trim()) {
      params.set("artist", options.artist.trim());
    }

    const response = await fetch(
      `${this.getAccountApiBase()}/creator-profile?${params.toString()}`,
      {
        cache: "no-store",
        headers: this.getApiHeaders({
          "Cache-Control": "no-cache, no-store, must-revalidate",
          Pragma: "no-cache",
        }),
      }
    );
    const data = await response.json();

    if (!response.ok || !data.success || !data.data) {
      throw new Error(
        data.error ||
          I18n.t("creatorProfile.loadFailed") ||
          "Failed to load creator profile."
      );
    }

    return data.data;
  },

  async fetchSyncCreatorGreetingTranslation(userHash, locale) {
    if (!userHash || typeof userHash !== "string") {
      throw new Error(
        I18n.t("creatorProfile.loadFailed") || "Failed to load creator profile."
      );
    }

    const params = new URLSearchParams({
      userHash,
    });

    if (typeof locale === "string" && locale.trim()) {
      params.set("locale", locale.trim());
    }

    const response = await fetch(
      `${this.getAccountApiBase()}/creator-profile/greeting-translation?${params.toString()}`,
      {
        cache: "no-store",
        headers: this.getApiHeaders({
          Accept: "application/json",
          "Cache-Control": "no-cache, no-store, must-revalidate",
          Pragma: "no-cache",
        }),
      }
    );
    const data = await response.json();

    if (!response.ok || !data.success || !data.data) {
      throw new Error(
        data.error ||
          I18n.t("creatorProfile.greetingTranslateFailed") ||
          "Failed to translate creator greeting."
      );
    }

    return data.data;
  },

  async setSyncCreatorGreeting(greeting, options = {}) {
    if (!this.getAuthToken()) {
      throw new Error(
        I18n.t("creatorProfile.greetingLoginRequired") ||
          "Discord login is required to edit your creator profile."
      );
    }

    const response = await fetch(`${this.getAccountApiBase()}/creator-profile/greeting`, {
      method: "POST",
      headers: this.getApiHeaders({
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({
        creatorUserHash: options.creatorUserHash || this.getUserHash(),
        greeting,
      }),
    });
    const data = await response.json();

    if (!response.ok || !data.success || !data.data) {
      throw new Error(
        data.error ||
          I18n.t("creatorProfile.greetingSaveFailed") ||
          "Failed to update creator greeting."
      );
    }

    return data.data;
  },

  async setSyncCreatorLike(creatorUserHash, liked) {
    if (!this.getAuthToken()) {
      throw new Error(
        I18n.t("creatorProfile.likeLoginRequired") ||
          "Discord login is required to like creators."
      );
    }

    const response = await fetch(`${this.getAccountApiBase()}/creator-like`, {
      method: "POST",
      headers: this.getApiHeaders({
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({
        creatorUserHash,
        liked: !!liked,
      }),
    });
    const data = await response.json();

    if (!response.ok || !data.success || !data.data) {
      throw new Error(
        data.error ||
          I18n.t("creatorProfile.likeActionFailed") ||
          "Failed to update creator like."
      );
    }

    return data.data;
  },

  /**
   * Spotify Track ID 여부 확인
   */
  isSpotifyTrackId(value) {
    const shared = window.LyricsService?.isSpotifyTrackId || window.ivLyricsTrackIdentity?.isSpotifyTrackId;
    if (typeof shared === "function") return shared(value);
    return typeof value === "string" && /^[A-Za-z0-9]{22}$/.test(value.trim());
  },

  /**
   * Spotify Track URI 여부 확인
   */
  isSpotifyTrackUri(uri) {
    const shared = window.LyricsService?.isSpotifyTrackUri || window.ivLyricsTrackIdentity?.isSpotifyTrackUri;
    if (typeof shared === "function") return shared(uri);
    return typeof uri === "string" && /^spotify:track:[A-Za-z0-9]{22}$/.test(uri.trim());
  },

  /**
   * Spotify 로컬 곡 URI 여부 확인
   */
  isLocalTrackUri(uri) {
    const shared = window.LyricsService?.isLocalTrackUri || window.ivLyricsTrackIdentity?.isLocalTrackUri;
    if (typeof shared === "function") return shared(uri);
    return typeof uri === "string" && uri.startsWith("spotify:local:");
  },

  /**
   * Track ID 추출 (spotify:track:xxx / open.spotify.com/track/xxx -> xxx)
   */
  extractTrackId(uri) {
    const shared = window.LyricsService?.extractTrackId || window.ivLyricsTrackIdentity?.extractTrackId;
    if (typeof shared === "function") return shared(uri);

    if (!uri || typeof uri !== "string") return null;
    const value = uri.trim();
    if (this.isSpotifyTrackId(value)) return value;

    const uriMatch = value.match(/^spotify:track:([A-Za-z0-9]{22})(?:$|[?#])/);
    if (uriMatch) return uriMatch[1];

    const webMatch = value.match(/open\.spotify\.com\/track\/([A-Za-z0-9]{22})(?:[/?#]|$)/);
    return webMatch ? webMatch[1] : null;
  },

  // ==========================================
  // 커뮤니티 영상 추천 시스템
  // ==========================================

  async getCommunityVideoIdentity(trackUri) {
    const trackId = this.extractTrackId(trackUri);
    if (!trackId) return null;

    const spotifyData = window.SpotifyDataHelper?.extractSpotifyData?.(trackUri) || null;
    const metadata = {
      trackId,
      trackName: spotifyData?.name || "",
      title: spotifyData?.name || "",
      artists: spotifyData?.artists || [],
      album: spotifyData?.album || spotifyData?.albumName || "",
      isrc: spotifyData?.isrc || spotifyData?.external_ids?.isrc || ""
    };
    const isrc = await window.SyncDataService?.resolveTrackIsrc?.(trackId, metadata)
      || window.SyncDataService?.getTrackIsrc?.(trackId, metadata)
      || "";
    if (!isrc) return null;

    return { isrc, trackId, metadata };
  },

  /**
   * 커뮤니티 영상 목록 조회
   * @param {string} trackUri - 트랙 URI
   * @param {boolean} skipCache - true면 캐시를 건너뛰고 서버에서 가져옴
   */
  async getCommunityVideos(trackUri, skipCache = false) {
    const identity = await this.getCommunityVideoIdentity(trackUri);
    if (!identity) return null;

    const userHash = this.getUserHash();

    try {
      // 브라우저 캐시 우회를 위해 타임스탬프 추가
      const url = new URL('https://ivlis.kr/ivLyrics/openvideo/community');
      url.searchParams.set('isrc', identity.isrc);
      url.searchParams.set('trackId', identity.trackId);
      url.searchParams.set('userId', userHash);
      if (identity.metadata?.title) url.searchParams.set('title', identity.metadata.title);
      if (identity.metadata?.artists?.length) url.searchParams.set('artist', identity.metadata.artists.join(', '));
      if (identity.metadata?.album) url.searchParams.set('album', identity.metadata.album);
      url.searchParams.set('_t', String(Date.now()));
      const response = await fetch(
        url.toString(),
        {
          cache: 'no-store',  // 브라우저 캐시 완전히 우회
          headers: this.getApiHeaders({
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache'
          })
        }
      );
      const data = await response.json();

      if (data.success) {
        return data.data;
      }
      return null;
    } catch (error) {
      console.error("[ivLyrics] Failed to get community videos:", error);
      return null;
    }
  },

  /**
   * 커뮤니티 영상 등록
   */
  async submitCommunityVideo(trackUri, videoId, videoTitle, startTime = 0) {
    const identity = await this.getCommunityVideoIdentity(trackUri);
    if (!identity) {
      throw new Error("이 곡의 ISRC를 확인할 수 없어 커뮤니티 영상을 등록할 수 없습니다.");
    }

    await this.requireDiscordAuth(
      I18n.t("communityVideo.loginRequired")
    );

    try {
      const response = await fetch('https://lyrics.api.ivl.is/lyrics/youtube/community', {
        method: 'POST',
        headers: this.getApiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          action: 'submit',
          isrc: identity.isrc,
          trackId: identity.trackId,
          title: identity.metadata?.title || '',
          artist: identity.metadata?.artists?.join(', ') || '',
          album: identity.metadata?.album || '',
          videoId,
          videoTitle,
          startTime
        })
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to submit community video');
      }

      window.__ivLyricsDebugLog?.(`[ivLyrics] Community video submitted: ${videoId}`);
      return data;
    } catch (error) {
      console.error("[ivLyrics] Failed to submit community video:", error);
      throw error;
    }
  },

  /**
   * 커뮤니티 영상 투표
   * @param {number} videoEntryId - 영상 엔트리 ID
   * @param {number} voteType - 1=like, -1=dislike, 0=remove
   * @param {string} trackUri - 트랙 URI (캐시 무효화용)
   */
  async voteCommunityVideo(videoEntryId, voteType, trackUri = null) {
    const userHash = this.getUserHash();

    try {
      const response = await fetch('https://lyrics.api.ivl.is/lyrics/youtube/community', {
        method: 'POST',
        headers: this.getApiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          action: 'vote',
          videoEntryId,
          voterId: userHash,
          voteType // 1=like, -1=dislike, 0=remove
        })
      });
      const data = await response.json();

      if (data.success) {
        window.__ivLyricsDebugLog?.(`[ivLyrics] Community vote submitted: ${voteType > 0 ? '👍' : voteType < 0 ? '👎' : '취소'}`);
        return data;
      }
      return null;
    } catch (error) {
      console.error("[ivLyrics] Failed to vote community video:", error);
      return null;
    }
  },

  /**
   * 커뮤니티 영상 삭제 (본인만 가능)
   * @param {number} videoEntryId - 영상 엔트리 ID
   * @param {string} trackUri - 트랙 URI (캐시 무효화용)
   */
  async deleteCommunityVideo(videoEntryId, trackUri = null) {
    const userHash = this.getUserHash();

    try {
      const response = await fetch(
        `https://lyrics.api.ivl.is/lyrics/youtube/community`,
        {
          method: 'POST',
          headers: this.getApiHeaders({
            'Content-Type': 'application/json'
          }),
          body: JSON.stringify({
            action: 'delete',
            id: videoEntryId,
            submitterId: userHash
          })
        }
      );
      const data = await response.json();

      if (data.success) {
        window.__ivLyricsDebugLog?.(`[ivLyrics] Community video deleted: ${videoEntryId}`);
        return data;
      }
      return null;
    } catch (error) {
      console.error("[ivLyrics] Failed to delete community video:", error);
      return null;
    }
  },

  /**
   * 현재 사용자의 해시 ID 가져오기
   */
  getCurrentUserHash() {
    return this.getUserHash();
  },

  // =========================================================================
  // IndexedDB 기반 선택한 커뮤니티 영상 저장/로드
  // =========================================================================

  /**
   * IndexedDB 데이터베이스 열기
   */
  async _openSelectedVideoDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('ivLyricsSelectedVideos', 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('selectedVideos')) {
          db.createObjectStore('selectedVideos', { keyPath: 'trackUri' });
        }
      };
    });
  },

  /**
   * 선택한 영상 정보 저장 (IndexedDB)
   * @param {string} trackUri - 트랙 URI
   * @param {object} videoInfo - 영상 정보 (youtubeVideoId, youtubeTitle, captionStartTime 등)
   */
  async saveSelectedVideo(trackUri, videoInfo) {
    try {
      const db = await this._openSelectedVideoDB();
      const tx = db.transaction('selectedVideos', 'readwrite');
      const store = tx.objectStore('selectedVideos');

      // 저장
      store.put({
        trackUri,
        ...videoInfo,
        savedAt: Date.now()
      });

      // 트랜잭션 완료 대기
      await new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });

      // 오래된 항목 정리 (30일 이상)
      this._cleanupOldSelectedVideos(db).catch(() => { });

      db.close();
      window.__ivLyricsDebugLog?.(`[ivLyrics] Saved selected video for ${trackUri}:`, videoInfo.youtubeVideoId);
      return true;
    } catch (error) {
      console.error('[ivLyrics] Failed to save selected video:', error);
      return false;
    }
  },

  /**
   * 오래된 선택 영상 정리 (30일 이상)
   */
  async _cleanupOldSelectedVideos(db) {
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    const tx = db.transaction('selectedVideos', 'readwrite');
    const store = tx.objectStore('selectedVideos');

    const request = store.openCursor();
    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        if (cursor.value.savedAt && cursor.value.savedAt < thirtyDaysAgo) {
          cursor.delete();
        }
        cursor.continue();
      }
    };
  },

  /**
   * 저장된 선택 영상 정보 로드 (IndexedDB)
   * @param {string} trackUri - 트랙 URI
   * @returns {object|null} 저장된 영상 정보 또는 null
   */
  async getSelectedVideo(trackUri) {
    try {
      const db = await this._openSelectedVideoDB();
      const tx = db.transaction('selectedVideos', 'readonly');
      const store = tx.objectStore('selectedVideos');

      const result = await new Promise((resolve, reject) => {
        const request = store.get(trackUri);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      db.close();

      if (result) {
        window.__ivLyricsDebugLog?.(`[ivLyrics] Loaded selected video for ${trackUri}:`, result.youtubeVideoId);
        return result;
      }
      return null;
    } catch (error) {
      console.error('[ivLyrics] Failed to load selected video:', error);
      return null;
    }
  },

  /**
   * 저장된 선택 영상 삭제 (기본 영상으로 되돌릴 때)
   * @param {string} trackUri - 트랙 URI
   */
  async removeSelectedVideo(trackUri) {
    try {
      const db = await this._openSelectedVideoDB();
      const tx = db.transaction('selectedVideos', 'readwrite');
      const store = tx.objectStore('selectedVideos');

      await new Promise((resolve, reject) => {
        const request = store.delete(trackUri);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });

      db.close();
      window.__ivLyricsDebugLog?.(`[ivLyrics] Removed selected video for ${trackUri}`);
      return true;
    } catch (error) {
      console.error('[ivLyrics] Failed to remove selected video:', error);
      return false;
    }
  },

  /**
   * YouTube URL에서 Video ID 추출
   */
  extractYouTubeVideoId(url) {
    if (!url) return null;

    // 이미 Video ID 형식인 경우 (11자리)
    if (/^[a-zA-Z0-9_-]{11}$/.test(url)) {
      return url;
    }

    for (const pattern of YOUTUBE_ID_PATTERNS) {
      const match = url.match(pattern);
      if (match) return match[1];
    }

    return null;
  },

  /**
   * YouTube 영상 제목 가져오기 (oEmbed API 사용)
   * @returns {Promise<string|null>} 영상 제목 또는 null (존재하지 않는 영상)
   */
  async getYouTubeVideoTitle(videoId) {
    if (!videoId) return null;

    try {
      // YouTube oEmbed API는 API 키 없이도 사용 가능
      const response = await fetch(
        `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
      );

      // 404 = 영상이 존재하지 않음, 401 = 비공개 영상
      if (response.status === 404 || response.status === 401) {
        window.__ivLyricsDebugLog?.("[ivLyrics] YouTube video not found or private:", videoId);
        return null;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      return data.title || null;
    } catch (error) {
      console.error("[ivLyrics] Failed to get YouTube title:", error);

      // 백업: noembed.com 사용
      try {
        const backupResponse = await fetch(
          `https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`
        );

        if (backupResponse.ok) {
          const backupData = await backupResponse.json();
          // noembed은 존재하지 않는 영상에 대해 error 필드를 반환함
          if (backupData.error) {
            window.__ivLyricsDebugLog?.("[ivLyrics] Video not found via noembed:", videoId);
            return null;
          }
          return backupData.title || null;
        }
      } catch (backupError) {
        console.error("[ivLyrics] Backup title fetch also failed:", backupError);
      }

      return null;
    }
  },

  /**
   * YouTube 영상이 실제로 존재하고 재생 가능한지 확인
   * @returns {Promise<{valid: boolean, title: string|null, error: string|null}>}
   */
  async validateYouTubeVideo(videoId) {
    if (!videoId) {
      return { valid: false, title: null, error: 'invalidId' };
    }

    // 기본적인 ID 형식 검증 (11자리, 영숫자 + 특수문자)
    if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
      return { valid: false, title: null, error: 'invalidFormat' };
    }

    try {
      // oEmbed API로 영상 존재 여부 확인
      const response = await fetch(
        `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
      );

      // 404 = 영상이 존재하지 않음
      if (response.status === 404) {
        return { valid: false, title: null, error: 'notFound' };
      }

      // 401 = 비공개 영상
      if (response.status === 401) {
        return { valid: false, title: null, error: 'private' };
      }

      if (!response.ok) {
        return { valid: false, title: null, error: 'httpError' };
      }

      const data = await response.json();

      if (!data.title) {
        return { valid: false, title: null, error: 'noTitle' };
      }

      return { valid: true, title: data.title, error: null };
    } catch (error) {
      console.error("[ivLyrics] YouTube validation error:", error);
      return { valid: false, title: null, error: 'networkError' };
    }
  },
};

// ============================================
// Custom Toast Notification System
// ============================================
const Toast = {
  _container: null,
  _toasts: [],
  _idCounter: 0,
  _progressToast: null, // progress 전용 토스트

  /**
   * Initialize toast container
   */
  _ensureContainer() {
    if (this._container && document.body.contains(this._container)) {
      document.body.appendChild(this._container);
      return this._container;
    }

    this._container = document.createElement('div');
    this._container.className = 'ivlyrics-toast-container';
    document.body.appendChild(this._container);
    return this._container;
  },

  /**
   * Show a toast notification
   * @param {string} message - The message to display
   * @param {boolean} isError - Whether this is an error message
   * @param {number} duration - Duration in ms (default: 3000)
   * @returns {number} Toast ID
   */
  show(message, isError = false, duration = 3000) {
    this._ensureContainer();

    const id = ++this._idCounter;
    const toast = document.createElement('div');
    toast.className = `ivlyrics-toast ${isError ? 'ivlyrics-toast-error' : 'ivlyrics-toast-success'}`;
    toast.dataset.toastId = id;

    // Icon
    const icon = document.createElement('span');
    icon.className = 'ivlyrics-toast-icon';
    icon.innerHTML = isError
      ? '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0-1A6 6 0 1 0 8 2a6 6 0 0 0 0 12zM7.25 5h1.5v4h-1.5V5zm0 5h1.5v1.5h-1.5V10z"/></svg>'
      : '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0-1A6 6 0 1 0 8 2a6 6 0 0 0 0 12zm3.146-8.854a.5.5 0 0 1 0 .708l-4 4a.5.5 0 0 1-.708 0l-2-2a.5.5 0 1 1 .708-.708L6.5 8.793l3.646-3.647a.5.5 0 0 1 .708 0z"/></svg>';

    // Message
    const text = document.createElement('span');
    text.className = 'ivlyrics-toast-message';
    text.textContent = message;

    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'ivlyrics-toast-close';
    closeBtn.innerHTML = '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/></svg>';
    closeBtn.onclick = (e) => {
      e.stopPropagation();
      this.dismiss(id);
    };

    toast.appendChild(icon);
    toast.appendChild(text);
    toast.appendChild(closeBtn);

    // Click anywhere to dismiss
    toast.onclick = () => this.dismiss(id);

    this._container.appendChild(toast);
    this._toasts.push({ id, element: toast, timeout: null });

    // Trigger animation
    requestAnimationFrame(() => {
      toast.classList.add('ivlyrics-toast-show');
    });

    // Auto dismiss
    if (duration > 0) {
      const toastData = this._toasts[this._toasts.length - 1];
      if (toastData) {
        toastData.timeout = setTimeout(() => this.dismiss(id), duration);
      }
    }

    return id;
  },

  /**
   * Show or update progress toast (single instance, reusable)
   * @param {string} message - The message to display
   * @param {number} percent - Progress percentage (0-100)
   */
  progress(message, percent = 0) {
    this._ensureContainer();

    // 이미 progress 토스트가 있으면 업데이트
    if (this._progressToast && document.body.contains(this._progressToast.element)) {
      const textEl = this._progressToast.element.querySelector('.ivlyrics-toast-message');
      const barEl = this._progressToast.element.querySelector('.ivlyrics-toast-progress-bar');
      if (textEl) textEl.textContent = message;
      if (barEl) barEl.style.width = `${Math.min(100, Math.max(0, percent))}%`;

      // 타임아웃 리셋 (활동이 있으면 연장)
      if (this._progressToast.timeout) {
        clearTimeout(this._progressToast.timeout);
      }
      this._progressToast.timeout = setTimeout(() => this.dismissProgress(), 60000);

      return this._progressToast.id;
    }

    // 새로운 progress 토스트 생성
    const id = ++this._idCounter;
    const toast = document.createElement('div');
    toast.className = 'ivlyrics-toast ivlyrics-toast-progress';
    toast.dataset.toastId = id;

    // Icon (다운로드 아이콘)
    const icon = document.createElement('span');
    icon.className = 'ivlyrics-toast-icon';
    icon.innerHTML = '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 12l-4-4h2.5V3h3v5H12L8 12z"/><path d="M14 14H2v-2h12v2z"/></svg>';

    // Message
    const text = document.createElement('span');
    text.className = 'ivlyrics-toast-message';
    text.textContent = message;

    // Progress bar container
    const progressContainer = document.createElement('div');
    progressContainer.className = 'ivlyrics-toast-progress-container';

    const progressBar = document.createElement('div');
    progressBar.className = 'ivlyrics-toast-progress-bar';
    progressBar.style.width = `${Math.min(100, Math.max(0, percent))}%`;

    progressContainer.appendChild(progressBar);

    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'ivlyrics-toast-close';
    closeBtn.innerHTML = '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/></svg>';
    closeBtn.onclick = (e) => {
      e.stopPropagation();
      this.dismissProgress();
    };

    toast.appendChild(icon);
    toast.appendChild(text);
    toast.appendChild(progressContainer);
    toast.appendChild(closeBtn);

    this._container.appendChild(toast);

    // 안전장치: 60초 후 자동 닫힘
    const timeout = setTimeout(() => this.dismissProgress(), 60000);
    this._progressToast = { id, element: toast, timeout };

    // Trigger animation
    requestAnimationFrame(() => {
      toast.classList.add('ivlyrics-toast-show');
    });

    return id;
  },

  /**
   * Dismiss progress toast
   */
  dismissProgress() {
    if (!this._progressToast) return;

    // 타임아웃 정리
    if (this._progressToast.timeout) {
      clearTimeout(this._progressToast.timeout);
    }

    const toast = this._progressToast.element;
    toast.classList.remove('ivlyrics-toast-show');
    toast.classList.add('ivlyrics-toast-hide');

    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
      this._progressToast = null;
    }, 300);
  },

  /**
   * Dismiss a toast
   * @param {number} id - Toast ID
   */
  dismiss(id) {
    const index = this._toasts.findIndex(t => t.id === id);
    if (index === -1) return;

    const toastData = this._toasts[index];

    // 중복 dismiss 방지: 이미 dismissing 중이면 무시
    if (toastData.dismissing) return;
    toastData.dismissing = true;

    if (toastData.timeout) {
      clearTimeout(toastData.timeout);
      toastData.timeout = null;
    }

    toastData.element.classList.remove('ivlyrics-toast-show');
    toastData.element.classList.add('ivlyrics-toast-hide');

    // 즉시 배열에서 제거 (index 불일치 문제 해결)
    this._toasts.splice(index, 1);

    // DOM 제거는 애니메이션 후 처리
    setTimeout(() => {
      if (toastData.element.parentNode) {
        toastData.element.parentNode.removeChild(toastData.element);
      }
    }, 300);
  },

  /**
   * Dismiss all toasts
   */
  dismissAll() {
    [...this._toasts].forEach(t => this.dismiss(t.id));
  },

  /**
   * Clean up orphaned toast elements in DOM that are not tracked in _toasts array
   * This handles edge cases where DOM elements persist but tracking was lost
   */
  _cleanupOrphanedToasts() {
    if (!this._container) return;

    const trackedIds = new Set(this._toasts.map(t => t.id));
    const domToasts = this._container.querySelectorAll('.ivlyrics-toast');

    domToasts.forEach(toast => {
      const id = parseInt(toast.dataset.toastId, 10);
      // progress toast는 별도 관리되므로 제외
      if (this._progressToast && this._progressToast.id === id) return;

      if (!trackedIds.has(id)) {
        // 추적되지 않는 toast 발견 - 제거
        console.debug(`[Toast] Cleaning up orphaned toast id=${id}`);
        toast.classList.add('ivlyrics-toast-hide');
        setTimeout(() => {
          if (toast.parentNode) {
            toast.parentNode.removeChild(toast);
          }
        }, 300);
      }
    });
  },

  /**
   * Start periodic cleanup (call once during initialization)
   */
  startPeriodicCleanup() {
    if (this._cleanupInterval) return;
    // 30초마다 고아 toast 정리
    this._cleanupInterval = setInterval(() => this._cleanupOrphanedToasts(), 30000);
  },

  /**
   * Success toast shorthand
   */
  success(message, duration = 3000) {
    return this.show(message, false, duration);
  },

  /**
   * Error toast shorthand
   */
  error(message, duration = 3000) {
    return this.show(message, true, duration);
  },

  /**
   * Warning toast shorthand
   */
  warning(message, duration = 3000) {
    return this.show(message, false, duration);
  }
};

// Export Toast globally
window.Toast = Toast;
