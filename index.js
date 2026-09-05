// Run "npm i @types/react" to have this type package available in workspace
/// <reference types="react" />
/// <reference path="../../globals.d.ts" />

// Furigana Converter Module for ivLyrics
const FuriganaConverter = (() => {
  let kuromojiInstance = null;
  let isInitializing = false;
  let initPromise = null;
  const conversionCache = new Map();

  // Debug mode - set to false to reduce console logs
  const DEBUG_MODE = false;
  const MAX_CONVERSION_CACHE_SIZE = 1000;
  const KUROMOJI_DICT_PATHS = [
    "https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/dict",
    "https://unpkg.com/kuromoji@0.1.2/dict",
  ];
  let hasLoggedKuromojiWarning = false;

  const normalizeKuromojiDictUrl = (url) => {
    if (typeof url !== "string" || !url.includes(".dat.gz")) {
      return url;
    }

    const fileName = url.split("/").pop();
    if (!fileName) {
      return url;
    }

    if (url.includes("kuromoji@0.1.2/dict/") && url.startsWith("https:/") && !url.startsWith("https://")) {
      return url.replace(/^https:\//, "https://");
    }

    if (url.includes("/dict/") && (!url.startsWith("http://") && !url.startsWith("https://"))) {
      return `${KUROMOJI_DICT_PATHS[0]}/${fileName}`;
    }

    if (url.includes("xpui.app.spotify.com") && url.includes("/dict/")) {
      return `${KUROMOJI_DICT_PATHS[0]}/${fileName}`;
    }

    return url;
  };

  const patchKuromojiDictionaryRequests = () => {
    if (XMLHttpRequest.prototype.__ivLyricsFuriganaPatched) return;

    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function patchedFuriganaOpen(method, url, ...args) {
      return originalOpen.call(this, method, normalizeKuromojiDictUrl(url), ...args);
    };
    XMLHttpRequest.prototype.__ivLyricsFuriganaPatched = true;
  };

  patchKuromojiDictionaryRequests();

  const buildTokenizer = (dictPath) =>
    new Promise((resolve, reject) => {
      window.kuromoji
        .builder({
          dicPath: dictPath,
        })
        .build((err, tokenizer) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(tokenizer);
        });
    });

  const init = async () => {
    if (kuromojiInstance) {
      return Promise.resolve();
    }

    if (isInitializing) {
      return initPromise;
    }

    isInitializing = true;
    initPromise = (async () => {
      if (typeof window.kuromoji === "undefined") {
        throw new Error("Kuromoji library not loaded");
      }

      let lastError = null;
      for (const dictPath of KUROMOJI_DICT_PATHS) {
        try {
          kuromojiInstance = await buildTokenizer(dictPath);
          isInitializing = false;

          setTimeout(() => {
            window.dispatchEvent(new CustomEvent("furigana-ready"));
          }, 100);

          return;
        } catch (err) {
          lastError = err;
        }
      }

      isInitializing = false;
      throw lastError || new Error("Kuromoji dictionary load failed");
    })().catch((err) => {
      isInitializing = false;
      throw err;
    });

    return initPromise;
  };

  const containsKanji = (text) => {
    const kanjiRegex = /[\u4E00-\u9FAF\u3400-\u4DBF]/;
    return kanjiRegex.test(text);
  };

  const katakanaToHiragana = (katakana) => {
    if (!katakana) return "";

    return katakana
      .split("")
      .map((char) => {
        const code = char.charCodeAt(0);
        if (code >= 0x30a1 && code <= 0x30f6) {
          return String.fromCharCode(code - 0x60);
        }
        return char;
      })
      .join("");
  };

  const convertToFurigana = (text) => {
    if (!text || typeof text !== "string") {
      return text;
    }

    if (!containsKanji(text)) {
      return text;
    }

    if (conversionCache.has(text)) {
      return conversionCache.get(text);
    }

    if (!kuromojiInstance) {
      if (DEBUG_MODE && !hasLoggedKuromojiWarning) {
        console.warn("[ivLyrics] Kuromoji is not initialized yet.");
        hasLoggedKuromojiWarning = true;
      }
      return text;
    }

    try {
      const tokens = kuromojiInstance.tokenize(text);
      let result = "";

      for (const token of tokens) {
        const surface = token.surface_form;
        const reading = token.reading || token.pronunciation; // Fallback to pronunciation

        // Only add ruby if token has kanji AND reading
        if (reading && containsKanji(surface)) {
          const hiragana = katakanaToHiragana(reading);

          // Process character by character to handle mixed kanji/kana
          let tokenResult = "";
          let readingIndex = 0;
          let i = 0;

          while (i < surface.length) {
            const char = surface[i];

            if (containsKanji(char)) {
              // Found a kanji - collect consecutive kanji
              let kanjiSequence = char;
              i++;

              while (i < surface.length && containsKanji(surface[i])) {
                kanjiSequence += surface[i];
                i++;
              }

              // Find the reading for this kanji sequence
              // Look ahead in surface to find kana that matches reading
              let nextKanaInSurface = "";
              let tempI = i;
              while (tempI < surface.length && !containsKanji(surface[tempI])) {
                nextKanaInSurface += surface[tempI];
                tempI++;
              }

              // Find where this kana appears in the remaining reading
              let kanjiReading = "";
              if (nextKanaInSurface.length > 0) {
                // Find the kana in the reading
                const remainingReading = hiragana.substring(readingIndex);
                const kanaIndex = remainingReading.indexOf(nextKanaInSurface);

                if (kanaIndex > 0) {
                  // Reading up to the kana is for the kanji
                  kanjiReading = remainingReading.substring(0, kanaIndex);
                } else if (kanaIndex === 0) {
                  // No reading for this kanji? Shouldn't happen but handle it
                  kanjiReading = "";
                } else {
                  // Kana not found - take all remaining as kanji reading
                  kanjiReading = remainingReading;
                }
              } else {
                // No more kana in surface - rest of reading is for this kanji
                kanjiReading = hiragana.substring(readingIndex);
              }

              if (kanjiReading) {
                tokenResult += `<ruby>${kanjiSequence}<rt>${kanjiReading}</rt></ruby>`;
                readingIndex += kanjiReading.length;
              } else {
                tokenResult += kanjiSequence;
              }
            } else {
              // Regular kana - just add it
              tokenResult += char;
              readingIndex++;
              i++;
            }
          }

          result += tokenResult;
        } else {
          result += surface;
        }
      }

      if (conversionCache.size >= MAX_CONVERSION_CACHE_SIZE) {
        const firstKey = conversionCache.keys().next().value;
        conversionCache.delete(firstKey);
      }
      conversionCache.set(text, result);

      return result;
    } catch (error) {
      if (DEBUG_MODE) {
        console.error("[ivLyrics] Furigana conversion failed:", error);
      }
      return text;
    }
  };

  const isAvailable = () => {
    return kuromojiInstance !== null;
  };

  const clearCache = () => {
    conversionCache.clear();
  };

  return {
    init,
    convertToFurigana,
    containsKanji,
    isAvailable,
    clearCache,
  };
})();

window.FuriganaConverter = FuriganaConverter;

const initializeFuriganaConverter = () => {
  if (typeof window.FuriganaConverter === "undefined") return;

  window.FuriganaConverter.init()
    .then(() => {
      if (window.CONFIG?.visual?.["furigana-enabled"] && window.lyricContainer) {
        try {
          window.lyricContainer.forceUpdate();
        } catch (e) { }
      }
    })
    .catch((err) => { });
};

// Load Kuromoji library for furigana conversion
if (typeof window.kuromoji === "undefined") {
  const kuromojiScriptUrls = [
    "https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/build/kuromoji.js",
    "https://unpkg.com/kuromoji@0.1.2/build/kuromoji.js",
  ];

  const loadKuromojiScript = (index = 0) => {
    if (index >= kuromojiScriptUrls.length) return;

    const kuromojiScript = document.createElement("script");
    kuromojiScript.src = kuromojiScriptUrls[index];
    kuromojiScript.async = false; // Load synchronously to ensure it's available
    kuromojiScript.onload = initializeFuriganaConverter;
    kuromojiScript.onerror = () => {
      kuromojiScript.remove();
      loadKuromojiScript(index + 1);
    };
    document.head.appendChild(kuromojiScript);
  };

  loadKuromojiScript();
} else {
  initializeFuriganaConverter();
}

// === ivLyrics-overlay 전송 모듈 ===
// LyricsService Extension에서 제공하는 OverlaySender를 사용
// 이 파일에 있던 OverlaySender는 Extension으로 이동됨 (어떤 페이지에서든 작동)

// Extension에서 이미 OverlaySender가 로드되어 있으면 그것을 사용
// OverlaySender는 window.OverlaySender로 전역 접근 가능
if (!window.OverlaySender) {
  console.warn("[ivLyrics] OverlaySender not found from Extension, waiting...");
  if (!window.__ivLyricsOverlaySenderWaitTimer) {
    window.__ivLyricsOverlaySenderWaitTimer = setInterval(() => {
      if (window.OverlaySender) {
        clearInterval(window.__ivLyricsOverlaySenderWaitTimer);
        window.__ivLyricsOverlaySenderWaitTimer = null;
        ivLyricsDebug("[ivLyrics] OverlaySender loaded from Extension");
      }
    }, 100);

    setTimeout(() => {
      if (window.__ivLyricsOverlaySenderWaitTimer) {
        clearInterval(window.__ivLyricsOverlaySenderWaitTimer);
        window.__ivLyricsOverlaySenderWaitTimer = null;
      }
    }, 5000);
  }
}

// 하위 호환성을 위해 OverlaySender 별칭 생성
/** @type {React} */
const react = Spicetify.React;
const { useState, useEffect, useCallback, useMemo, useRef } = react;

const getCurrentTranslationTargetLanguage = () => {
  const targetLanguage =
    window.CONFIG?.visual?.["translate:target-language"] ||
    localStorage.getItem("ivLyrics:visual:translate:target-language");

  if (targetLanguage && targetLanguage !== "auto") {
    return targetLanguage;
  }

  return (
    window.I18n?.getCurrentLanguage?.() ||
    Spicetify.Locale?.getLocale?.()?.split("-")[0] ||
    "en"
  );
};

const LYRICS_PRONUNCIATION_NOTATION_STORAGE_KEY =
  "ivLyrics:visual:translate:pronunciation-notation";
const LYRICS_PHONETIC_PROMPT_CACHE_VERSION = 2;

const normalizeIvLyricsPronunciationNotation = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "latin" || normalized === "ipa"
    ? normalized
    : "translation";
};

const getCurrentLyricsPronunciationNotation = () =>
  normalizeIvLyricsPronunciationNotation(
    window.CONFIG?.visual?.["translate:pronunciation-notation"] ||
    localStorage.getItem(LYRICS_PRONUNCIATION_NOTATION_STORAGE_KEY)
  );

window.ivLyricsPronunciationNotation = Object.freeze({
  storageKey: LYRICS_PRONUNCIATION_NOTATION_STORAGE_KEY,
  normalize: normalizeIvLyricsPronunciationNotation,
  getCurrent: getCurrentLyricsPronunciationNotation,
});

const getTranslationPartText = (part) => {
  const directText = typeof part?.text === "string" ? part.text.trim() : "";
  if (directText) {
    return directText;
  }

  if (Array.isArray(part?.syllables)) {
    return part.syllables.map((syllable) => syllable?.text || "").join("").trim();
  }

  return "";
};

const getDisplayedVocalParts = (line) => {
  if (!Array.isArray(line?.vocals?.lead?.syllables) || line.vocals.lead.syllables.length === 0) {
    return null;
  }

  const parts = [];
  const leadText = getTranslationPartText(line.vocals.lead);
  if (leadText) {
    parts.push({
      role: "lead",
      index: -1,
      text: leadText,
    });
  }

  if (Array.isArray(line.vocals.background)) {
    line.vocals.background.forEach((part, index) => {
      if (!Array.isArray(part?.syllables) || part.syllables.length === 0) {
        return;
      }

      const text = getTranslationPartText(part);
      if (text) {
        parts.push({
          role: "background",
          index,
          text,
        });
      }
    });
  }

  return parts.length > 1 ? parts : null;
};

const buildTranslationLineRequests = (lyrics = [], options = {}) => {
  if (!Array.isArray(lyrics)) {
    return [];
  }

  const splitVocalParts = options?.splitVocalParts !== false;
  const requests = [];
  lyrics.forEach((line, lineIndex) => {
    const lineText = line?.originalText || line?.text || "";
    if (!lineText || Utils.isSectionHeader(lineText)) {
      return;
    }

    const trimmedLineText = String(lineText).trim();
    if (!trimmedLineText) {
      return;
    }

    const vocalParts = splitVocalParts ? getDisplayedVocalParts(line) : null;
    if (vocalParts) {
      vocalParts.forEach((vocalPart) => {
        requests.push({
          lineIndex,
          vocalPart,
          text: vocalPart.text,
        });
      });
      return;
    }

    requests.push({
      lineIndex,
      vocalPart: null,
      text: trimmedLineText,
    });
  });

  return requests;
};

const getNonSectionLyricsText = (lyrics = []) =>
  buildTranslationLineRequests(lyrics)
    .map((request) => request.text || "")
    .join("\n");

const getLegacyNonSectionLyricsText = (lyrics = []) =>
  lyrics
    .map((line) => line?.originalText || line?.text || "")
    .filter((line) => line && !Utils.isSectionHeader(line))
    .join("\n");

const getTranslationSourceCacheHash = (text) => {
  const value = String(text || "").normalize("NFC");
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.codePointAt(0) || 0;
    hash = Math.imul(hash, 16777619);
  }
  return `src-${(hash >>> 0).toString(36)}-${value.length.toString(36)}`;
};

const getTranslationResultCacheHash = (text, isPhonetic = false) => {
  const sourceHash = getTranslationSourceCacheHash(text);
  if (isPhonetic) {
    return `${sourceHash}:phonetic-prompt=${LYRICS_PHONETIC_PROMPT_CACHE_VERSION}:notation=${getCurrentLyricsPronunciationNotation()}`;
  }

  const translationStyle =
    window.AIAddonManager?.getTranslationStyle?.() || "natural";
  return translationStyle !== "natural"
    ? `${sourceHash}:style=${translationStyle}`
    : sourceHash;
};

const getLyricsProcessingShapeSignature = (lyrics = []) => {
  if (!Array.isArray(lyrics)) return "0:0:src-0-0:";
  const requests = buildTranslationLineRequests(lyrics);
  const sourceHash = getTranslationSourceCacheHash(
    requests.map((request) => request.text || "").join("\n")
  );
  const vocalShape = lyrics.map((line) => {
    if (!line?.vocals?.lead) return "s";
    const backgroundCount = Array.isArray(line.vocals.background)
      ? line.vocals.background.length
      : 0;
    return `v${backgroundCount + 1}`;
  }).join(".");
  return `${lyrics.length}:${requests.length}:${sourceHash}:${vocalShape}`;
};

const getCachedTranslationForText = async ({
  trackId,
  lang,
  isPhonetic = false,
  provider = null,
  text,
}) => {
  const cacheApi = window.LyricsCache || (typeof LyricsCache !== "undefined" ? LyricsCache : null);
  if (!cacheApi?.getTranslation || !trackId || !lang || !String(text || "").trim()) {
    return null;
  }

  try {
    const sourceHash = getTranslationResultCacheHash(text, isPhonetic);
    const cached = await cacheApi.getTranslation(trackId, lang, isPhonetic, provider, sourceHash);
    if (!cached) return null;

    const value = isPhonetic ? cached.phonetic : (cached.translation ?? cached.vi);
    const resultLines = Array.isArray(value)
      ? value.map((line) => String(line ?? ""))
      : (typeof value === "string" ? value.replace(/\r\n?/g, "\n").split("\n") : null);
    const sourceLines = String(text).replace(/\r\n?/g, "\n").split("\n");
    const structurallyValid = resultLines &&
      resultLines.length === sourceLines.length &&
      resultLines.some((line) => line.trim()) &&
      resultLines.every((line, index) => !sourceLines[index].trim() || !!line.trim());

    return structurallyValid ? cached : null;
  } catch (error) {
    return null;
  }
};

const getTranslationOutputFromCache = (cached, isPhonetic = false) => {
  if (!cached) {
    return null;
  }
  return isPhonetic ? cached.phonetic : cached.translation || cached.vi;
};

const normalizeTranslationOutputLines = (outText) => {
  if (Array.isArray(outText)) {
    return outText;
  }
  if (typeof outText === "string") {
    return outText.split("\n");
  }
  return null;
};

const buildTranslationCachePayload = (outText, isPhonetic = false) => {
  const field = isPhonetic ? "phonetic" : "translation";
  const lines = normalizeTranslationOutputLines(outText);
  return { [field]: lines || outText };
};

const setCachedTranslationForText = async ({
  trackId,
  lang,
  isPhonetic = false,
  provider = null,
  text,
  outText,
}) => {
  const cacheApi = window.LyricsCache || (typeof LyricsCache !== "undefined" ? LyricsCache : null);
  if (
    !cacheApi?.setTranslation ||
    !trackId ||
    !lang ||
    !String(text || "").trim() ||
    !outText
  ) {
    return false;
  }

  try {
    const sourceHash = getTranslationResultCacheHash(text, isPhonetic);
    return await cacheApi.setTranslation(
      trackId,
      lang,
      isPhonetic,
      buildTranslationCachePayload(outText, isPhonetic),
      provider,
      sourceHash
    );
  } catch (error) {
    return false;
  }
};

const cloneTranslationVocals = (vocals) => {
  if (!vocals?.lead) {
    return vocals;
  }

  return {
    ...vocals,
    lead: { ...vocals.lead },
    background: Array.isArray(vocals.background)
      ? vocals.background.map((part) => ({ ...part }))
      : vocals.background,
  };
};

const withoutVocalSupplementField = (vocals, field) => {
  if (!vocals?.lead || !field) {
    return vocals;
  }

  const nextVocals = cloneTranslationVocals(vocals);
  delete nextVocals.lead[field];
  if (Array.isArray(nextVocals.background)) {
    nextVocals.background.forEach((part) => delete part[field]);
  }
  return nextVocals;
};

const PRONUNCIATION_DISPLAY_MODES = new Set([
  "gemini_romaji",
  "romaji",
  "romaja",
  "pinyin",
  "hiragana",
  "katakana",
  "furigana",
]);

const isPronunciationDisplayMode = (mode) =>
  PRONUNCIATION_DISPLAY_MODES.has(String(mode || "").trim().toLowerCase());

const assignTranslationVocalResult = (vocals, vocalPart, targetField, value) => {
  if (!vocals || !vocalPart || !targetField || !value) {
    return;
  }

  const target = vocalPart.role === "lead"
    ? vocals.lead
    : vocals.background?.[vocalPart.index];
  if (!target) {
    return;
  }

  target[targetField] = value;
};

const mergeVocalTranslationFields = (baseVocals, modeVocals, targetField, transformValue = (value) => value) => {
  if (!baseVocals?.lead || !modeVocals?.lead || !targetField) {
    return baseVocals;
  }

  let nextVocals = baseVocals;
  const ensureVocals = () => {
    if (nextVocals === baseVocals) {
      nextVocals = cloneTranslationVocals(baseVocals);
    }
    return nextVocals;
  };
  const applyPart = (sourcePart, getTargetPart) => {
    const rawValue = sourcePart?.[targetField];
    const baseTargetPart = getTargetPart(baseVocals);
    const transformedValue = transformValue(
      typeof rawValue === "string" ? rawValue : String(rawValue || ""),
      baseTargetPart,
      sourcePart
    );
    const value = typeof transformedValue === "string" ? transformedValue.trim() : String(transformedValue || "").trim();
    if (!value) {
      if (baseTargetPart && Object.prototype.hasOwnProperty.call(baseTargetPart, targetField)) {
        const targetPart = getTargetPart(ensureVocals());
        if (targetPart) delete targetPart[targetField];
      }
      return;
    }

    const targetPart = getTargetPart(ensureVocals());
    if (targetPart) {
      targetPart[targetField] = value;
    }
  };

  applyPart(modeVocals.lead, (vocals) => vocals.lead);

  if (Array.isArray(modeVocals.background) && Array.isArray(baseVocals.background)) {
    modeVocals.background.forEach((part, index) => {
      applyPart(part, (vocals) => vocals.background?.[index]);
    });
  }

  return nextVocals;
};

const mapTranslationLinesToLyrics = (lyrics = [], linesInput = [], options = {}) => {
  if (!Array.isArray(lyrics) || !Array.isArray(linesInput)) {
    return null;
  }

  const targetField = options?.targetField || null;
  const splitVocalParts = options?.splitVocalParts !== false;
  const translationRequests = buildTranslationLineRequests(lyrics, { splitVocalParts });
  const requestResultsByLine = new Map();
  let resultLineIndex = 0;

  const readNextResultLine = () => {
    while (
      resultLineIndex < linesInput.length &&
      linesInput[resultLineIndex] !== undefined &&
      linesInput[resultLineIndex] !== null &&
      Utils.isSectionHeader(String(linesInput[resultLineIndex]).trim())
    ) {
      resultLineIndex++;
    }

    return String(linesInput[resultLineIndex++] ?? "").trim();
  };

  translationRequests.forEach((request) => {
    const entry = {
      ...request,
      resultText: readNextResultLine(),
    };
    const entries = requestResultsByLine.get(request.lineIndex) || [];
    entries.push(entry);
    requestResultsByLine.set(request.lineIndex, entries);
  });

  return lyrics.map((line, lineIndex) => {
    const originalText = line?.originalText || line?.text || "";

    if (Utils.isSectionHeader(originalText)) {
      return {
        ...line,
        text: null,
        originalText,
      };
    }

    if (originalText.trim() === "") {
      return {
        ...line,
        text: "",
        originalText,
      };
    }

    const requestEntries = requestResultsByLine.get(lineIndex) || [];
    const translatedText = requestEntries
      .map((entry) => window.ivLyricsTextComparison.areEquivalent(entry.resultText, entry.text)
        ? ""
        : entry.resultText)
      .filter(Boolean)
      .join(" / ");

    const vocalEntries = requestEntries.filter((entry) => entry.vocalPart);
    let vocals = line?.vocals;
    if (targetField && vocalEntries.length > 0 && line?.vocals?.lead) {
      vocals = cloneTranslationVocals(line.vocals);
      delete vocals.lead[targetField];
      if (Array.isArray(vocals.background)) {
        vocals.background.forEach((part) => delete part[targetField]);
      }
      vocalEntries.forEach((entry) => {
        const value = window.ivLyricsTextComparison.areEquivalent(entry.resultText, entry.text)
          ? ""
          : entry.resultText;
        assignTranslationVocalResult(vocals, entry.vocalPart, targetField, value);
      });
    }

    return {
      ...line,
      vocals,
      text: translatedText || line?.text || "",
      originalText,
    };
  });
};

const hasInstrumentalMarker = (lyrics = []) => {
  if (!lyrics || lyrics.length === 0 || lyrics.length > 3) return false;

  const firstLine = lyrics[0]?.text?.toLowerCase()?.trim() || "";
  if (firstLine.includes("no lyrics") || firstLine.includes("instrumental")) {
    return true;
  }

  for (const line of lyrics) {
    const text = line?.text?.toLowerCase() || "";
    if (text.includes("no lyrics") || text.includes("instrumental")) {
      return true;
    }
  }

  return false;
};

const getUpdateBannerTheme = () => {
  try {
    const storedTheme =
      window.ivLyricsStoragePersistence?.getItem?.("ivLyrics:settings-ui-theme") ??
      localStorage.getItem("ivLyrics:settings-ui-theme");
    return storedTheme === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
};

const UPDATE_BANNER_ICON_SHAPES = {
  update: [
    ["path", { d: "M20 6v5h-5" }],
    ["path", { d: "M4 18v-5h5" }],
    ["path", { d: "M6.1 9a7 7 0 0 1 11.7-2.6L20 11" }],
    ["path", { d: "M4 13l2.2 4.6A7 7 0 0 0 17.9 15" }],
  ],
  close: [
    ["path", { d: "m18 6-12 12" }],
    ["path", { d: "m6 6 12 12" }],
  ],
  arrow: [
    ["path", { d: "M5 12h14" }],
    ["path", { d: "m13 6 6 6-6 6" }],
  ],
  external: [
    ["path", { d: "M15 3h6v6" }],
    ["path", { d: "m10 14 11-11" }],
    ["path", { d: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" }],
  ],
  notes: [
    ["path", { d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" }],
    ["path", { d: "M14 2v6h6" }],
    ["path", { d: "M8 13h8" }],
    ["path", { d: "M8 17h6" }],
  ],
};

const createUpdateBannerIcon = (name, size = 20) => {
  const shapes = UPDATE_BANNER_ICON_SHAPES[name] || UPDATE_BANNER_ICON_SHAPES.update;

  return react.createElement(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 2,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      "aria-hidden": "true",
      focusable: "false",
    },
    shapes.map(([element, props], index) =>
      react.createElement(element, { ...props, key: `${name}-${index}` })
    )
  );
};

const formatUpdateVersion = (version) => {
  const value = String(version || "").trim();
  if (!value) return "-";
  return value.toLowerCase().startsWith("v") ? value : `v${value}`;
};

// Update notification dialog
const UpdateBanner = ({ updateInfo, onDismiss }) => {
  const updatePageUrl = "https://lyrics.ivl.is/update";
  const modalRef = react.useRef(null);
  const previouslyFocusedRef = react.useRef(document.activeElement);
  const onDismissRef = react.useRef(onDismiss);
  onDismissRef.current = onDismiss;

  react.useEffect(() => {
    const modal = modalRef.current;
    if (!modal) return undefined;

    const getFocusableElements = () => Array.from(modal.querySelectorAll(
      'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
    )).filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true");

    const handleKeydown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onDismissRef.current?.();
        return;
      }

      if (event.key !== "Tab") return;

      const focusable = getFocusableElements();
      if (!focusable.length) {
        event.preventDefault();
        modal.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === modal)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === modal) {
        event.preventDefault();
        first.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeydown);
    window.requestAnimationFrame(() => modal.focus());

    return () => {
      document.removeEventListener("keydown", handleKeydown);
      const previouslyFocused = previouslyFocusedRef.current;
      if (previouslyFocused instanceof HTMLElement && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
    };
  }, []);

  const closeLabel = I18n.t("settingsUi.close") || "Close";
  const currentVersion = formatUpdateVersion(updateInfo.currentVersion);
  const latestVersion = formatUpdateVersion(updateInfo.latestVersion);

  return react.createElement(
    "div",
    {
      className: "ivLyrics-update-banner",
      "data-ui-theme": getUpdateBannerTheme(),
      onClick: () => onDismissRef.current?.(),
    },
    react.createElement(
      "div",
      {
        className: "ivlyrics-update-dialog",
        ref: modalRef,
        role: "dialog",
        "aria-modal": "true",
        "aria-labelledby": "ivlyrics-update-title",
        "aria-describedby": "ivlyrics-update-description",
        tabIndex: -1,
        onClick: (event) => event.stopPropagation(),
      },
      react.createElement(
        "div",
        { className: "ivlyrics-update-dialog__header" },
        react.createElement(
          "div",
          { className: "ivlyrics-update-dialog__icon" },
          createUpdateBannerIcon("update", 22)
        ),
        react.createElement(
          "div",
          { className: "ivlyrics-update-dialog__heading" },
          react.createElement(
            "h2",
            { id: "ivlyrics-update-title" },
            I18n.t("notifications.updateAvailable")
          ),
          react.createElement(
            "div",
            {
              className: "ivlyrics-update-dialog__versions",
            },
            react.createElement("span", null, currentVersion),
            createUpdateBannerIcon("arrow", 14),
            react.createElement("strong", null, latestVersion)
          )
        ),
        react.createElement(
          "button",
          {
            type: "button",
            className: "ivlyrics-update-dialog__close",
            onClick: () => onDismissRef.current?.(),
            title: closeLabel,
            "aria-label": closeLabel,
          },
          createUpdateBannerIcon("close", 18)
        )
      ),
      react.createElement(
        "div",
        { className: "ivlyrics-update-dialog__body" },
        react.createElement(
          "p",
          {
            id: "ivlyrics-update-description",
            className: "ivlyrics-update-dialog__description",
          },
          I18n.t("settingsAdvanced.aboutTab.update.protocol.info")
        )
      ),
      react.createElement(
        "div",
        { className: "ivlyrics-update-dialog__footer" },
        react.createElement(
          "a",
          {
            href: updateInfo.releaseUrl,
            target: "_blank",
            rel: "noopener noreferrer",
            className: "ivlyrics-update-dialog__button ivlyrics-update-dialog__button--secondary",
          },
          createUpdateBannerIcon("notes", 16),
          react.createElement("span", null, I18n.t("update.releaseNotes"))
        ),
        react.createElement(
          "span",
          { className: "ivlyrics-update-dialog__footer-spacer" }
        ),
        react.createElement(
          "a",
          {
            href: updatePageUrl,
            target: "_blank",
            rel: "noopener noreferrer",
            className: "ivlyrics-update-dialog__button ivlyrics-update-dialog__button--primary",
          },
          react.createElement(
            "span",
            null,
            I18n.t("settingsAdvanced.aboutTab.update.protocol.button")
          ),
          createUpdateBannerIcon("external", 16)
        )
      )
    )
  );
};
/** @type {import("react").ReactDOM | null} */
let reactDOM = Spicetify.ReactDOM;

function ensureReactDOM() {
  if (
    reactDOM &&
    (typeof reactDOM.render === "function" ||
      typeof reactDOM.createPortal === "function")
  ) {
    return reactDOM;
  }

  const resolved = window?.Spicetify?.ReactDOM || window?.ReactDOM || null;
  if (resolved && resolved !== reactDOM) {
    reactDOM = resolved;
    window.reactDOM = resolved;
  }

  return reactDOM;
}

window.ivLyricsEnsureReactDOM = ensureReactDOM;
// Define a function called "render" to specify app entry point
// This function will be used to mount app to main view.
function render() {
  return react.createElement(LyricsContainer, null);
}

// Optimized utility functions with better error handling and performance
const APP_NAME = "ivLyrics";
const IVLYRICS_DEBUG = false;
if (typeof window.__IVLYRICS_DEBUG__ !== "boolean") {
  window.__IVLYRICS_DEBUG__ = IVLYRICS_DEBUG;
}
if (!window.__ivLyricsDebugLog) {
  window.__ivLyricsDebugLog = (...args) => {
    if (window.__IVLYRICS_DEBUG__) {
      console.log(...args);
    }
  };
}
const ivLyricsDebug = (...args) => {
  window.__ivLyricsDebugLog?.(...args);
};

const IVLYRICS_BACKGROUND_MODE_IDS = [
  "none",
  "colorful",
  "gradient-background",
  "blur-gradient-background",
  "solid-background",
  "video-background",
];
const IVLYRICS_BACKGROUND_FLAG_IDS = IVLYRICS_BACKGROUND_MODE_IDS.filter(
  (modeId) => modeId !== "none"
);
const IVLYRICS_FULLSCREEN_PRESENTATION_IDS = Object.freeze([
  "standard",
  "vinyl",
  "compact-vinyl",
  "video",
]);
const IVLYRICS_FULLSCREEN_PRESENTATION_STORAGE_KEY =
  "ivLyrics:visual:fullscreen-presentation";

function normalizeIvLyricsFullscreenPresentation(value, fallback = "standard") {
  const normalized = String(value || "").trim();
  return IVLYRICS_FULLSCREEN_PRESENTATION_IDS.includes(normalized)
    ? normalized
    : fallback;
}

function normalizeIvLyricsDefaultFullscreenPresentation(value) {
  const normalized = normalizeIvLyricsFullscreenPresentation(value, "vinyl");
  return normalized === "standard" ? "vinyl" : normalized;
}

function getRememberedIvLyricsFullscreenPresentation() {
  try {
    return normalizeIvLyricsFullscreenPresentation(
      StorageManager.getItem(IVLYRICS_FULLSCREEN_PRESENTATION_STORAGE_KEY)
    );
  } catch (error) {
    return "standard";
  }
}

function rememberIvLyricsFullscreenPresentation(value) {
  const normalized = normalizeIvLyricsFullscreenPresentation(value);
  try {
    StorageManager.setItem(
      IVLYRICS_FULLSCREEN_PRESENTATION_STORAGE_KEY,
      normalized
    );
  } catch (error) {
    ivLyricsDebug("[ivLyrics] Failed to remember fullscreen presentation:", error);
  }
  return normalized;
}

function getIvLyricsGlobalBackgroundMode(visual = window.CONFIG?.visual || {}) {
  if (visual["video-background"]) return "video-background";
  if (visual["solid-background"]) return "solid-background";
  if (visual["blur-gradient-background"]) return "blur-gradient-background";
  if (visual["gradient-background"]) return "gradient-background";
  if (visual.colorful) return "colorful";
  return "none";
}

function normalizeIvLyricsTrackBackgroundOverride(value) {
  if (!value) return null;
  const mode = typeof value === "string" ? value : value.mode;
  if (!IVLYRICS_BACKGROUND_MODE_IDS.includes(mode)) {
    return null;
  }
  return { mode };
}

function getIvLyricsTrackBackgroundMode(value) {
  return normalizeIvLyricsTrackBackgroundOverride(value)?.mode || null;
}

function shouldFetchIvLyricsBackgroundColors(mode) {
  return (
    mode === "colorful" ||
    mode === "gradient-background" ||
    mode === "blur-gradient-background"
  );
}

window.ivLyricsBackgroundModeIds = IVLYRICS_BACKGROUND_MODE_IDS;
window.ivLyricsBackgroundFlagIds = IVLYRICS_BACKGROUND_FLAG_IDS;
window.ivLyricsGetGlobalBackgroundMode = getIvLyricsGlobalBackgroundMode;
window.ivLyricsNormalizeTrackBackgroundOverride = normalizeIvLyricsTrackBackgroundOverride;

// IndexedDB for track sync offsets
const DB_NAME = "ivLyrics-db";
const DB_VERSION = 1;
const STORE_NAME = "track-sync-offsets";
const MAX_TRACK_SYNC_OFFSET = 10000;

let dbInstance = null;

const normalizeTrackSyncOffsets = (
  offsetsObj,
  { ignoreInvalidEntries = false } = {}
) => {
  const offsetsPrototype =
    offsetsObj && typeof offsetsObj === "object"
      ? Object.getPrototypeOf(offsetsObj)
      : null;
  const hasSupportedPrototype =
    offsetsPrototype === Object.prototype || offsetsPrototype === null;
  if (
    !offsetsObj ||
    typeof offsetsObj !== "object" ||
    Array.isArray(offsetsObj) ||
    (!ignoreInvalidEntries && !hasSupportedPrototype)
  ) {
    throw new TypeError("Invalid track sync offsets backup.");
  }

  const entries = Object.entries(offsetsObj);
  const normalizedOffsets = Object.create(null);
  let ignoredEntryCount = 0;

  entries.forEach(([trackUri, offset]) => {
    const numericOffset =
      typeof offset === "number"
        ? offset
        : typeof offset === "string" && offset.trim()
          ? Number(offset)
          : Number.NaN;

    if (!trackUri.startsWith("spotify:") || !Number.isFinite(numericOffset)) {
      if (ignoreInvalidEntries) {
        ignoredEntryCount += 1;
        return;
      }
      throw new TypeError("Track sync offsets backup has an invalid entry.");
    }

    normalizedOffsets[trackUri] = Math.max(
      -MAX_TRACK_SYNC_OFFSET,
      Math.min(MAX_TRACK_SYNC_OFFSET, Math.round(numericOffset))
    );
  });

  if (ignoredEntryCount > 0) {
    console.warn(
      `[ivLyrics] Ignored ${ignoredEntryCount} invalid stored track sync offset entr${ignoredEntryCount === 1 ? "y" : "ies"}.`
    );
  }

  return normalizedOffsets;
};

const trackSyncOffsetsMatchNormalized = (source, normalized) => {
  if (
    !source ||
    typeof source !== "object" ||
    Array.isArray(source) ||
    Object.getPrototypeOf(source) !== Object.prototype
  ) {
    return false;
  }

  const sourceEntries = Object.entries(source);
  const normalizedEntries = Object.entries(normalized);
  return (
    sourceEntries.length === normalizedEntries.length &&
    sourceEntries.every(([trackUri, offset], index) => {
      const normalizedEntry = normalizedEntries[index];
      return (
        normalizedEntry?.[0] === trackUri &&
        Object.is(normalizedEntry[1], offset)
      );
    })
  );
};

const initDB = () => {
  return new Promise((resolve, reject) => {
    if (dbInstance) {
      resolve(dbInstance);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error("[ivLyrics] IndexedDB error:", request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      ivLyricsDebug("[ivLyrics] IndexedDB initialized");
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
        ivLyricsDebug("[ivLyrics] IndexedDB object store created");
      }
    };
  });
};

const TrackSyncDB = {
  async getOffset(trackUri) {
    try {
      const db = await initDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], "readonly");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(trackUri);

        request.onsuccess = () => resolve(request.result || 0);
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error("[ivLyrics] Failed to get offset:", error);
      return 0;
    }
  },

  async setOffset(trackUri, offset) {
    try {
      const db = await initDB();
      await new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(offset, trackUri);

        request.onerror = () => reject(request.error);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(
          transaction.error || new Error("Track sync offset write aborted.")
        );
      });
      return true;
    } catch (error) {
      console.error("[ivLyrics] Failed to set offset:", error);
      return false;
    }
  },

  async clearOffset(trackUri) {
    try {
      const db = await initDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(trackUri);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error("[ivLyrics] Failed to clear offset:", error);
    }
  },

  async getAllOffsets() {
    try {
      const db = await initDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], "readonly");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAllKeys();

        request.onsuccess = () => {
          const keys = request.result;
          const getAllRequest = store.getAll();

          getAllRequest.onsuccess = () => {
            const values = getAllRequest.result;
            const result = {};
            keys.forEach((key, index) => {
              result[key] = values[index];
            });
            resolve(result);
          };

          getAllRequest.onerror = () => reject(getAllRequest.error);
        };

        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error("[ivLyrics] Failed to get all offsets:", error);
      return {};
    }
  },

  async importOffsets(offsetsObj) {
    try {
      const normalizedOffsets = normalizeTrackSyncOffsets(offsetsObj);
      const db = await initDB();
      await new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        let settled = false;
        const rejectOnce = (error) => {
          if (settled) return;
          settled = true;
          reject(error || new Error("Track sync offset transaction failed."));
        };

        // Clear existing data first
        const clearRequest = store.clear();

        clearRequest.onsuccess = () => {
          try {
            // Add all new offsets
            Object.entries(normalizedOffsets).forEach(([trackUri, offset]) => {
              store.put(offset, trackUri);
            });
          } catch (error) {
            try {
              transaction.abort();
            } catch {
              // Reject with the original write error below.
            }
            rejectOnce(error);
          }
        };
        clearRequest.onerror = () => rejectOnce(clearRequest.error);

        transaction.oncomplete = () => {
          if (settled) return;
          settled = true;
          resolve();
        };
        transaction.onerror = () => rejectOnce(transaction.error);
        transaction.onabort = () => rejectOnce(
          transaction.error || new Error("Track sync offset transaction aborted.")
        );
      });
      return true;
    } catch (error) {
      console.error("[ivLyrics] Failed to import offsets:", error);
      return false;
    }
  },
};

// TrackSyncDB를 window에 등록 (LyricsService와 다른 컴포넌트에서 사용 가능)
window.TrackSyncDB = TrackSyncDB;

// IndexedDB for track language overrides (곡별 언어 오버라이드)
const LANG_DB_NAME = "ivLyrics-lang-db";
const LANG_DB_VERSION = 1;
const LANG_STORE_NAME = "track-language-overrides";

let langDbInstance = null;

const initLangDB = () => {
  return new Promise((resolve, reject) => {
    if (langDbInstance) {
      resolve(langDbInstance);
      return;
    }

    const request = indexedDB.open(LANG_DB_NAME, LANG_DB_VERSION);

    request.onerror = () => {
      console.error("[ivLyrics] Language IndexedDB error:", request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      langDbInstance = request.result;
      ivLyricsDebug("[ivLyrics] Language IndexedDB initialized");
      resolve(langDbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(LANG_STORE_NAME)) {
        db.createObjectStore(LANG_STORE_NAME);
        ivLyricsDebug("[ivLyrics] Language IndexedDB object store created");
      }
    };
  });
};

const TrackLanguageDB = {
  async getLanguage(trackUri) {
    try {
      const db = await initLangDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([LANG_STORE_NAME], "readonly");
        const store = transaction.objectStore(LANG_STORE_NAME);
        const request = store.get(trackUri);

        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error("[ivLyrics] Failed to get language override:", error);
      return null;
    }
  },

  async setLanguage(trackUri, language) {
    try {
      const db = await initLangDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([LANG_STORE_NAME], "readwrite");
        const store = transaction.objectStore(LANG_STORE_NAME);
        const request = store.put(language, trackUri);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error("[ivLyrics] Failed to set language override:", error);
    }
  },

  async clearLanguage(trackUri) {
    try {
      const db = await initLangDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([LANG_STORE_NAME], "readwrite");
        const store = transaction.objectStore(LANG_STORE_NAME);
        const request = store.delete(trackUri);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error("[ivLyrics] Failed to clear language override:", error);
    }
  },

  async getAllOverrides() {
    try {
      const db = await initLangDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([LANG_STORE_NAME], "readonly");
        const store = transaction.objectStore(LANG_STORE_NAME);
        const request = store.getAllKeys();

        request.onsuccess = () => {
          const keys = request.result;
          const getAllRequest = store.getAll();

          getAllRequest.onsuccess = () => {
            const values = getAllRequest.result;
            const result = {};
            keys.forEach((key, index) => {
              result[key] = values[index];
            });
            resolve(result);
          };

          getAllRequest.onerror = () => reject(getAllRequest.error);
        };

        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error("[ivLyrics] Failed to get all language overrides:", error);
      return {};
    }
  },
};

// TrackLanguageDB를 window에 등록 (다른 컴포넌트에서 사용 가능)
window.TrackLanguageDB = TrackLanguageDB;

// IndexedDB for track lyrics provider overrides (곡별 가사 제공자 오버라이드)
const PROVIDER_DB_NAME = "ivLyrics-provider-db";
const PROVIDER_DB_VERSION = 1;
const PROVIDER_STORE_NAME = "track-lyrics-provider-overrides";

let providerDbInstance = null;

const initProviderDB = () => {
  return new Promise((resolve, reject) => {
    if (providerDbInstance) {
      resolve(providerDbInstance);
      return;
    }

    const request = indexedDB.open(PROVIDER_DB_NAME, PROVIDER_DB_VERSION);

    request.onerror = () => {
      console.error("[ivLyrics] Provider IndexedDB error:", request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      providerDbInstance = request.result;
      ivLyricsDebug("[ivLyrics] Provider IndexedDB initialized");
      resolve(providerDbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(PROVIDER_STORE_NAME)) {
        db.createObjectStore(PROVIDER_STORE_NAME);
        ivLyricsDebug("[ivLyrics] Provider IndexedDB object store created");
      }
    };
  });
};

const TrackLyricsProviderDB = {
  async getProvider(trackUri) {
    try {
      const db = await initProviderDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([PROVIDER_STORE_NAME], "readonly");
        const store = transaction.objectStore(PROVIDER_STORE_NAME);
        const request = store.get(trackUri);

        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error("[ivLyrics] Failed to get provider override:", error);
      return null;
    }
  },

  async setProvider(trackUri, providerId) {
    try {
      const db = await initProviderDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([PROVIDER_STORE_NAME], "readwrite");
        const store = transaction.objectStore(PROVIDER_STORE_NAME);
        const request = store.put(providerId, trackUri);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error("[ivLyrics] Failed to set provider override:", error);
    }
  },

  async clearProvider(trackUri) {
    try {
      const db = await initProviderDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([PROVIDER_STORE_NAME], "readwrite");
        const store = transaction.objectStore(PROVIDER_STORE_NAME);
        const request = store.delete(trackUri);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error("[ivLyrics] Failed to clear provider override:", error);
    }
  },

  async getAllOverrides() {
    try {
      const db = await initProviderDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([PROVIDER_STORE_NAME], "readonly");
        const store = transaction.objectStore(PROVIDER_STORE_NAME);
        const request = store.getAllKeys();

        request.onsuccess = () => {
          const keys = request.result;
          const getAllRequest = store.getAll();

          getAllRequest.onsuccess = () => {
            const values = getAllRequest.result;
            const result = {};
            keys.forEach((key, index) => {
              result[key] = values[index];
            });
            resolve(result);
          };

          getAllRequest.onerror = () => reject(getAllRequest.error);
        };

        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error("[ivLyrics] Failed to get all provider overrides:", error);
      return {};
    }
  },
};

window.TrackLyricsProviderDB = TrackLyricsProviderDB;

// IndexedDB for track background overrides (곡별 배경 오버라이드)
const BACKGROUND_DB_NAME = "ivLyrics-background-db";
const BACKGROUND_DB_VERSION = 1;
const BACKGROUND_STORE_NAME = "track-background-overrides";

let backgroundDbInstance = null;

const initBackgroundDB = () => {
  return new Promise((resolve, reject) => {
    if (backgroundDbInstance) {
      resolve(backgroundDbInstance);
      return;
    }

    const request = indexedDB.open(BACKGROUND_DB_NAME, BACKGROUND_DB_VERSION);

    request.onerror = () => {
      console.error("[ivLyrics] Background IndexedDB error:", request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      backgroundDbInstance = request.result;
      ivLyricsDebug("[ivLyrics] Background IndexedDB initialized");
      resolve(backgroundDbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(BACKGROUND_STORE_NAME)) {
        db.createObjectStore(BACKGROUND_STORE_NAME);
        ivLyricsDebug("[ivLyrics] Background IndexedDB object store created");
      }
    };
  });
};

const TrackBackgroundDB = {
  async getOverride(trackUri) {
    try {
      const db = await initBackgroundDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([BACKGROUND_STORE_NAME], "readonly");
        const store = transaction.objectStore(BACKGROUND_STORE_NAME);
        const request = store.get(trackUri);

        request.onsuccess = () =>
          resolve(normalizeIvLyricsTrackBackgroundOverride(request.result));
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error("[ivLyrics] Failed to get background override:", error);
      return null;
    }
  },

  async setOverride(trackUri, override) {
    try {
      const normalizedOverride = normalizeIvLyricsTrackBackgroundOverride(override);
      if (!normalizedOverride) {
        await this.clearOverride(trackUri);
        return;
      }

      const db = await initBackgroundDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([BACKGROUND_STORE_NAME], "readwrite");
        const store = transaction.objectStore(BACKGROUND_STORE_NAME);
        const request = store.put(normalizedOverride, trackUri);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error("[ivLyrics] Failed to set background override:", error);
    }
  },

  async clearOverride(trackUri) {
    try {
      const db = await initBackgroundDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([BACKGROUND_STORE_NAME], "readwrite");
        const store = transaction.objectStore(BACKGROUND_STORE_NAME);
        const request = store.delete(trackUri);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error("[ivLyrics] Failed to clear background override:", error);
    }
  },

  async getAllOverrides() {
    try {
      const db = await initBackgroundDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([BACKGROUND_STORE_NAME], "readonly");
        const store = transaction.objectStore(BACKGROUND_STORE_NAME);
        const request = store.getAllKeys();

        request.onsuccess = () => {
          const keys = request.result;
          const getAllRequest = store.getAll();

          getAllRequest.onsuccess = () => {
            const values = getAllRequest.result;
            const result = {};
            keys.forEach((key, index) => {
              const override = normalizeIvLyricsTrackBackgroundOverride(values[index]);
              if (override) {
                result[key] = override;
              }
            });
            resolve(result);
          };

          getAllRequest.onerror = () => reject(getAllRequest.error);
        };

        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error("[ivLyrics] Failed to get all background overrides:", error);
      return {};
    }
  },
};

window.TrackBackgroundDB = TrackBackgroundDB;

// Migrate from localStorage to IndexedDB
(async () => {
  try {
    const oldOffsets = localStorage.getItem("ivLyrics:track-sync-offsets");
    if (oldOffsets) {
      ivLyricsDebug("[ivLyrics] Migrating track-sync-offsets to IndexedDB");
      let offsetsObj;
      try {
        const parsedOffsets = JSON.parse(oldOffsets);
        offsetsObj = normalizeTrackSyncOffsets(parsedOffsets, {
          ignoreInvalidEntries: true,
        });
        if (
          Object.keys(parsedOffsets).length > 0 &&
          Object.keys(offsetsObj).length === 0
        ) {
          console.warn(
            "[ivLyrics] Legacy track offsets have no recoverable entries; keeping the original backup."
          );
          return;
        }
      } catch (error) {
        console.error("[ivLyrics] Keeping invalid legacy track offsets:", error);
        return;
      }
      const imported = await TrackSyncDB.importOffsets(offsetsObj);
      if (imported) {
        localStorage.removeItem("ivLyrics:track-sync-offsets");
        ivLyricsDebug("[ivLyrics] Migration complete");
      } else {
        console.warn("[ivLyrics] Keeping legacy track offsets for a later retry.");
      }
    }
  } catch (error) {
    console.error("[ivLyrics] Migration failed:", error);
  }
})();

const SettingsPersistence = window.ivLyricsStoragePersistence;
const readPersistentSetting = (key) =>
  SettingsPersistence?.getItem(key) ?? localStorage.getItem(key);
const writePersistentSetting = (key, value) => {
  if (SettingsPersistence) return SettingsPersistence.setItem(key, value);
  return localStorage.setItem(key, value);
};
const removePersistentSetting = (key) => {
  if (SettingsPersistence) return SettingsPersistence.removeItem(key);
  return localStorage.removeItem(key);
};

let __storageKeys = [];
const STORAGE_KEYS_METADATA_KEY = `${APP_NAME}:storage-keys`;
const TRACK_SYNC_OFFSETS_STORAGE_KEY = `${APP_NAME}:track-sync-offsets`;
const CURRENT_STORAGE_PREFIX = `${APP_NAME}:`;
const LEGACY_STORAGE_PREFIX = "lyrics-plus:";
const PRIVATE_OR_TRANSIENT_STORAGE_KEYS = new Set([
  STORAGE_KEYS_METADATA_KEY,
  `${APP_NAME}:user-hash`,
  `${APP_NAME}:client-id`,
  `${APP_NAME}:auth-token`,
  `${APP_NAME}:discord-login-pending`,
  `${APP_NAME}:return-to-settings`,
  `${APP_NAME}:restore-route-after-reload`,
  `${APP_NAME}:cloud-save-device-id`,
]);
const CLOUD_SYNC_EXCLUDED_STORAGE_KEYS = new Set([
  TRACK_SYNC_OFFSETS_STORAGE_KEY,
  `${APP_NAME}:settings-presets`,
]);
const CLOUD_SYNC_FORBIDDEN_KEY_PATTERN = /(apikey|token|password|secret|credential|clientid|userhash)/i;
const CLOUD_SYNC_SAFE_TOKEN_LIMIT_PATTERN = /max(?:output)?tokens?/gi;
const isCloudSyncCredentialLikeKey = (key) => {
  if (typeof key !== "string") return false;
  const normalized = key.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const credentialCandidate = normalized.replace(CLOUD_SYNC_SAFE_TOKEN_LIMIT_PATTERN, "");
  return CLOUD_SYNC_FORBIDDEN_KEY_PATTERN.test(credentialCandidate);
};
const isCloudSyncSettingKey = (key) => (
  typeof key === "string" &&
  key.startsWith(CURRENT_STORAGE_PREFIX) &&
  !CLOUD_SYNC_EXCLUDED_STORAGE_KEYS.has(key) &&
  !OBSOLETE_LEGACY_STORAGE_KEYS.has(key) &&
  !PRIVATE_OR_TRANSIENT_STORAGE_KEYS.has(key) &&
  !isCloudSyncCredentialLikeKey(key)
);
const OBSOLETE_LEGACY_STORAGE_KEYS = new Set([
  `${APP_NAME}:provider:lrclib:on`,
  `${APP_NAME}:provider:ivlyrics:on`,
  `${APP_NAME}:provider:spotify:on`,
  `${APP_NAME}:provider:local:on`,
  `${APP_NAME}:services-order`,
  `${APP_NAME}:lock-mode`,
  `${APP_NAME}:visual:global-delay`,
]);
try {
  const savedStorageKeys = readPersistentSetting(STORAGE_KEYS_METADATA_KEY);
  const parsedStorageKeys = savedStorageKeys ? JSON.parse(savedStorageKeys) : [];
  __storageKeys = Array.isArray(parsedStorageKeys)
    ? Array.from(new Set(parsedStorageKeys.filter(
      (key) =>
        typeof key === "string" &&
        key.startsWith(CURRENT_STORAGE_PREFIX) &&
        key !== TRACK_SYNC_OFFSETS_STORAGE_KEY &&
        !OBSOLETE_LEGACY_STORAGE_KEYS.has(key) &&
        !PRIVATE_OR_TRANSIENT_STORAGE_KEYS.has(key)
    )))
    : [];
  if (JSON.stringify(parsedStorageKeys) !== JSON.stringify(__storageKeys)) {
    writePersistentSetting(
      STORAGE_KEYS_METADATA_KEY,
      JSON.stringify(__storageKeys)
    );
  }
} catch (error) {
  console.warn("[ivLyrics] Ignoring invalid storage key metadata.", error);
  try {
    writePersistentSetting(STORAGE_KEYS_METADATA_KEY, "[]");
  } catch {
    // Keep the in-memory metadata safe when storage is read-only.
  }
}
const StorageKeys = new Set(__storageKeys);
const IMPORT_PROVIDER_ORDER_KEYS = new Set([
  `${APP_NAME}:ai:provider-order`,
  `${APP_NAME}:lyrics:provider-order`,
]);
const normalizeImportedConfig = (config) => {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new TypeError("Invalid ivLyrics settings backup.");
  }

  const normalizedConfig = {};
  const entries = Object.entries(config);

  // Keep current-format values when a backup contains both current and
  // pre-rebrand keys. This also prevents an older duplicate from overwriting
  // the value that was exported by a newer version.
  entries.forEach(([key, value]) => {
    if (key.startsWith(CURRENT_STORAGE_PREFIX)) {
      normalizedConfig[key] = value;
    }
  });
  entries.forEach(([key, value]) => {
    if (!key.startsWith(LEGACY_STORAGE_PREFIX)) return;
    const migratedKey = `${CURRENT_STORAGE_PREFIX}${key.slice(LEGACY_STORAGE_PREFIX.length)}`;
    if (
      !OBSOLETE_LEGACY_STORAGE_KEYS.has(migratedKey) &&
      !Object.prototype.hasOwnProperty.call(normalizedConfig, migratedKey)
    ) {
      normalizedConfig[migratedKey] = value;
    }
  });

  OBSOLETE_LEGACY_STORAGE_KEYS.forEach((key) => {
    delete normalizedConfig[key];
  });
  PRIVATE_OR_TRANSIENT_STORAGE_KEYS.forEach((key) => {
    delete normalizedConfig[key];
  });

  const languageKey = `${APP_NAME}:visual:language`;
  const quickSyncControlsKey =
    `${APP_NAME}:visual:quick-sync-controls-enabled`;

  if (Object.prototype.hasOwnProperty.call(normalizedConfig, languageKey)) {
    const importedLanguage = String(normalizedConfig[languageKey] ?? "").trim();
    let availableLanguages = [];

    try {
      availableLanguages = (window.I18n?.getAvailableLanguages?.() || [])
        .map((language) => language?.code)
        .filter((language) => typeof language === "string" && language);
    } catch (error) {
      console.warn("[ivLyrics] Failed to read the supported UI languages.", error);
    }

    if (availableLanguages.includes(importedLanguage)) {
      normalizedConfig[languageKey] = importedLanguage;
    } else {
      const currentLanguage = window.I18n?.getCurrentLanguage?.();
      normalizedConfig[languageKey] =
        availableLanguages.includes(currentLanguage)
          ? currentLanguage
          : availableLanguages[0] || "ko";
      console.warn(
        `[ivLyrics] Replaced unsupported imported language: ${importedLanguage || "(empty)"}`
      );
    }
  }

  if (
    Object.prototype.hasOwnProperty.call(
      normalizedConfig,
      quickSyncControlsKey
    )
  ) {
    const importedValue = normalizedConfig[quickSyncControlsKey];
    const normalizedValue =
      typeof importedValue === "boolean"
        ? String(importedValue)
        : typeof importedValue === "string" &&
          ["true", "false"].includes(importedValue.trim().toLowerCase())
          ? importedValue.trim().toLowerCase()
          : "true";
    normalizedConfig[quickSyncControlsKey] = normalizedValue;
  }

  IMPORT_PROVIDER_ORDER_KEYS.forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(normalizedConfig, key)) return;

    let order = normalizedConfig[key];
    if (typeof order === "string") {
      try {
        order = JSON.parse(order);
      } catch (error) {
        order = null;
      }
    }

    if (!Array.isArray(order)) {
      normalizedConfig[key] = "[]";
      console.warn(`[ivLyrics] Reset invalid imported provider order: ${key}`);
      return;
    }

    normalizedConfig[key] = JSON.stringify(
      Array.from(
        new Set(order.filter((id) => typeof id === "string" && id.length > 0))
      )
    );
  });

  Object.entries(normalizedConfig).forEach(([key, value]) => {
    if (key === TRACK_SYNC_OFFSETS_STORAGE_KEY) return;
    if (typeof value === "string") return;
    if (typeof value === "boolean" || (
      typeof value === "number" && Number.isFinite(value)
    )) {
      normalizedConfig[key] = String(value);
      return;
    }
    delete normalizedConfig[key];
    console.warn(`[ivLyrics] Ignored invalid imported setting: ${key}`);
  });

  return normalizedConfig;
};
/**
 *
 * @param {string} newKey
 */
const saveStorageKeys = (newKey) => {
  if (typeof newKey !== "string") return;
  if (
    !newKey.startsWith(CURRENT_STORAGE_PREFIX) ||
    newKey === TRACK_SYNC_OFFSETS_STORAGE_KEY ||
    OBSOLETE_LEGACY_STORAGE_KEYS.has(newKey) ||
    PRIVATE_OR_TRANSIENT_STORAGE_KEYS.has(newKey)
  ) return;
  StorageKeys.add(newKey);
  try {
    writePersistentSetting(
      STORAGE_KEYS_METADATA_KEY,
      JSON.stringify(Array.from(StorageKeys))
    );
  } catch (e) {
    console.error("Failed to save storage keys:", e);
  }
};
const StorageManager = {
  get(key, defaultVal = true) {
    saveStorageKeys(key);
    try {
      const value = readPersistentSetting(key);
      if (value === "true") return true;
      if (value === "false") return false;
      return defaultVal;
    } catch (error) {
      return defaultVal;
    }
  },

  getPersisted(key) {
    saveStorageKeys(key);
    try {
      return readPersistentSetting(key);
    } catch (error) {
      // Error ignored
    }

    return null;
  },

  /**
   *
   * @deprecated Use saveConfig instead for unified saving
   */
  setPersisted(key, value) {
    saveStorageKeys(key);
    const stringValue = String(value);
    let success = false;

    try {
      writePersistentSetting(key, stringValue);
      success = true;
    } catch (error) {
      // Error ignored
    }

    if (!success) {
      // Failed to persist data
    }
  },

  // Unified config save method to reduce duplication
  saveConfig(name, value) {
    saveStorageKeys(`${APP_NAME}:visual:${name}`);
    writePersistentSetting(`${APP_NAME}:visual:${name}`, value);
  },

  getItem(key) {
    saveStorageKeys(key);
    return readPersistentSetting(key);
  },
  setItem(key, value) {
    saveStorageKeys(key);
    return writePersistentSetting(key, value);
  },
  removeItem(key) {
    saveStorageKeys(key);
    return removePersistentSetting(key);
  },
  getItemRaw(key) {
    return localStorage.getItem(key);
  },
  setItemRaw(key, value) {
    return localStorage.setItem(key, value);
  },
  removeItemRaw(key) {
    return localStorage.removeItem(key);
  },
  SpicetifyLocalStorageGet(key) {
    saveStorageKeys(key);
    return Spicetify.LocalStorage.get(key);
  },
  SpicetifyLocalStorageGetRaw(key) {
    return Spicetify.LocalStorage.get(key);
  },

  async exportConfig() {
    const config = {};
    const exportKeys = new Set(StorageKeys);
    try {
      Object.keys(SettingsPersistence?.getSnapshot?.() || {}).forEach((key) => {
        exportKeys.add(key);
      });
    } catch (error) {
      console.warn("[ivLyrics] Failed to read the settings recovery snapshot.", error);
    }

    exportKeys.forEach((key) => {
      if (
        !key.startsWith(CURRENT_STORAGE_PREFIX) ||
        key === TRACK_SYNC_OFFSETS_STORAGE_KEY ||
        OBSOLETE_LEGACY_STORAGE_KEYS.has(key) ||
        PRIVATE_OR_TRANSIENT_STORAGE_KEYS.has(key)
      ) return;

      const val = readPersistentSetting(key);
      if (val !== null) config[key] = val;
    });

    // IndexedDB의 track-sync-offsets를 포함
    const trackSyncOffsets = await TrackSyncDB.getAllOffsets();
    const normalizedTrackSyncOffsets = normalizeTrackSyncOffsets(
      trackSyncOffsets,
      { ignoreInvalidEntries: true }
    );
    if (!trackSyncOffsetsMatchNormalized(
      trackSyncOffsets,
      normalizedTrackSyncOffsets
    )) {
      const repaired = await TrackSyncDB.importOffsets(
        normalizedTrackSyncOffsets
      );
      if (!repaired) {
        console.warn("[ivLyrics] Failed to repair stored track sync offsets.");
      }
    }
    if (Object.keys(normalizedTrackSyncOffsets).length > 0) {
      config[TRACK_SYNC_OFFSETS_STORAGE_KEY] =
        JSON.stringify(normalizedTrackSyncOffsets);
      ivLyricsDebug(
        "[ivLyrics] Exporting track-sync-offsets from IndexedDB:",
        normalizedTrackSyncOffsets
      );
    } else {
      ivLyricsDebug("[ivLyrics] No track-sync-offsets found in IndexedDB");
    }

    ivLyricsDebug("[ivLyrics] Exported config keys:", Object.keys(config));

    return config;
  },
  async exportCloudConfig() {
    const config = {};
    const exportKeys = new Set(StorageKeys);
    try {
      Object.keys(SettingsPersistence?.getSnapshot?.() || {}).forEach((key) => {
        exportKeys.add(key);
      });
    } catch (error) {
      console.warn("[ivLyrics] Failed to read the cloud settings snapshot.", error);
    }

    exportKeys.forEach((key) => {
      if (!isCloudSyncSettingKey(key)) return;
      const value = readPersistentSetting(key);
      if (value !== null) config[key] = value;
    });
    return config;
  },
  async importCloudConfig(config) {
    const normalized = normalizeImportedConfig(config);
    Object.entries(normalized).forEach(([key, value]) => {
      if (!isCloudSyncSettingKey(key)) return;
      StorageManager.setItem(key, value);
      saveStorageKeys(key);
    });
  },
  async importConfig(config) {
    const importedConfig = normalizeImportedConfig(config);

    // track-sync-offsets를 IndexedDB로 가져오기
    if (
      Object.prototype.hasOwnProperty.call(
        importedConfig,
        TRACK_SYNC_OFFSETS_STORAGE_KEY
      )
    ) {
      try {
        const importedOffsets = importedConfig[TRACK_SYNC_OFFSETS_STORAGE_KEY];
        const offsetsObj =
          typeof importedOffsets === "string"
            ? JSON.parse(importedOffsets)
            : importedOffsets;
        const imported = await TrackSyncDB.importOffsets(offsetsObj);
        if (!imported) {
          throw new TypeError("Invalid track sync offsets backup.");
        }
        ivLyricsDebug("[ivLyrics] Imported track-sync-offsets to IndexedDB");
      } finally {
        delete importedConfig[TRACK_SYNC_OFFSETS_STORAGE_KEY]; // localStorage에 저장하지 않음
      }
    }

    // 나머지 설정을 localStorage에 저장
    Object.entries(importedConfig).forEach(([key, value]) => {
      StorageManager.setItem(key, value);
      saveStorageKeys(key);
    });
  },
};

window.StorageManager = StorageManager;

const getStoredFiniteNumber = (
  key,
  defaultValue,
  min = Number.NEGATIVE_INFINITY,
  max = Number.POSITIVE_INFINITY
) => {
  const storedValue = StorageManager.getItem(key);
  if (
    storedValue === null ||
    storedValue === undefined ||
    (typeof storedValue === "string" && !storedValue.trim())
  ) {
    return defaultValue;
  }
  const value = Number(storedValue);
  return Number.isFinite(value)
    ? Math.max(min, Math.min(max, value))
    : defaultValue;
};

// DB Export/Import Manager - 모든 IndexedDB 데이터 내보내기/가져오기
const DB_EXPORT_TARGETS = [
  { name: "ivLyrics-db", version: 1, stores: ["track-sync-offsets"] },
  { name: "ivLyrics-lang-db", version: 1, stores: ["track-language-overrides"] },
  { name: "ivLyrics-background-db", version: 1, stores: ["track-background-overrides"] },
  { name: "ivLyricsCache", version: 6, stores: ["lyrics", "translations", "youtube", "metadata", "sync", "tmi"] },
  { name: "ivLyricsSelectedVideos", version: 1, stores: ["selectedVideos"] },
];

const DBExportManager = {
  _openDB(name, version, stores) {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(name, version);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        for (const storeName of stores) {
          if (!db.objectStoreNames.contains(storeName)) {
            db.createObjectStore(storeName);
          }
        }
      };
    });
  },

  _readStore(db, storeName) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readonly");
      const store = tx.objectStore(storeName);
      const records = [];

      const cursorReq = store.openCursor();
      cursorReq.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          records.push({ key: cursor.key, value: cursor.value });
          cursor.continue();
        } else {
          resolve(records);
        }
      };
      cursorReq.onerror = () => reject(cursorReq.error);
    });
  },

  _writeStore(db, storeName, records) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      store.clear();
      for (const record of records) {
        if (store.keyPath) {
          store.put(record.value);
        } else {
          store.put(record.value, record.key);
        }
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  async exportAllDBs() {
    const result = {};
    for (const target of DB_EXPORT_TARGETS) {
      try {
        const db = await this._openDB(target.name, target.version, target.stores);
      const existingStores = new Set(Array.from(db.objectStoreNames));
      result[target.name] = {};
      for (const storeName of target.stores) {
          if (existingStores.has(storeName)) {
            result[target.name][storeName] = await this._readStore(db, storeName);
          }
      }
        db.close();
      } catch (e) {
        console.warn(`[ivLyrics] Failed to export DB ${target.name}:`, e);
      }
    }
    return result;
  },

  async importAllDBs(data) {
    for (const target of DB_EXPORT_TARGETS) {
      if (!data[target.name]) continue;
      try {
        const db = await this._openDB(target.name, target.version, target.stores);
        const existingStores = new Set(Array.from(db.objectStoreNames));
        for (const storeName of target.stores) {
          if (existingStores.has(storeName) && data[target.name][storeName]) {
            await this._writeStore(db, storeName, data[target.name][storeName]);
          }
        }
        db.close();
      } catch (e) {
        console.error(`[ivLyrics] Failed to import DB ${target.name}:`, e);
      }
    }
  },
};

const KARAOKE = 0;
const SYNCED = 1;
const UNSYNCED = 2;
const WORD_KARAOKE = 3;
const LYRICS_MODE_TYPE_KEYS = ['karaoke', 'synced', 'unsynced'];
const IVLYRICS_RENDER_MODE_LOCK_STORAGE_KEY = "ivLyrics:visual:render-mode-lock";
const getLyricsDataMode = (mode) => mode === WORD_KARAOKE ? KARAOKE : mode;
const isKaraokeRenderMode = (mode) => mode === KARAOKE || mode === WORD_KARAOKE;
const getLyricsModeTypeKey = (mode) => LYRICS_MODE_TYPE_KEYS[getLyricsDataMode(mode)] || null;
const normalizeLyricsRenderModeLock = (value) => {
  if (value === null || value === undefined || value === "") return -1;
  const mode = Number(value);
  return [KARAOKE, WORD_KARAOKE, SYNCED, UNSYNCED].includes(mode) ? mode : -1;
};
const getRememberedLyricsRenderModeLock = () => {
  try {
    return normalizeLyricsRenderModeLock(
      StorageManager.getItem(IVLYRICS_RENDER_MODE_LOCK_STORAGE_KEY)
    );
  } catch (error) {
    return -1;
  }
};
const rememberLyricsRenderModeLock = (mode) => {
  const normalizedMode = normalizeLyricsRenderModeLock(mode);
  try {
    StorageManager.setItem(
      IVLYRICS_RENDER_MODE_LOCK_STORAGE_KEY,
      String(normalizedMode)
    );
  } catch (error) {
    ivLyricsDebug("[ivLyrics] Failed to remember lyrics render mode lock:", error);
  }
  return normalizedMode;
};

const VINYL_TYPOGRAPHY_DEFAULT_SCALE = 0.7;
const getOrSeedVinylTypographySetting = (
  vinylSettingName,
  baseSettingName,
  baseFallback,
  { numeric = false, scale = 1 } = {}
) => {
  const vinylStorageKey = `${APP_NAME}:visual:fullscreen-vinyl-${vinylSettingName}`;
  const baseStorageKey = `${APP_NAME}:visual:${baseSettingName}`;
  const normalize = (value) => {
    if (value === null || value === undefined || value === "") return null;
    if (!numeric) {
      const text = String(value).trim();
      return text || null;
    }
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  };

  const storedVinylValue = normalize(StorageManager.getItem(vinylStorageKey));
  if (storedVinylValue !== null) return storedVinylValue;

  const baseValue = normalize(StorageManager.getItem(baseStorageKey));
  const normalizedFallback = normalize(baseFallback);
  const sourceValue = baseValue !== null ? baseValue : normalizedFallback;
  const seededValue = numeric && scale !== 1
    ? Math.round(sourceValue * scale)
    : sourceValue;

  StorageManager.setItem(vinylStorageKey, seededValue);
  return seededValue;
};

const getOrSeedVideoStageTypographySetting = (
  settingName,
  fallback = "Pretendard Variable"
) => {
  const videoStageStorageKey = `${APP_NAME}:visual:fullscreen-video-stage-${settingName}`;
  const storedVideoStageValue = String(
    StorageManager.getItem(videoStageStorageKey) || ""
  ).trim();
  if (storedVideoStageValue) return storedVideoStageValue;

  const inheritedVinylValue = String(
    StorageManager.getItem(`${APP_NAME}:visual:fullscreen-vinyl-${settingName}`) ||
      fallback
  ).trim() || fallback;
  StorageManager.setItem(videoStageStorageKey, inheritedVinylValue);
  return inheritedVinylValue;
};

const CONFIG = {
  visual: {
    language:
      window.I18n?.getCurrentLanguage?.() ||
      StorageManager.getItem("ivLyrics:visual:language"),
    "playbar-button": StorageManager.get(
      "ivLyrics:visual:playbar-button",
      false
    ),
    "fullscreen-button": StorageManager.get(
      "ivLyrics:visual:fullscreen-button",
      false
    ),
    "panel-lyrics-enabled": StorageManager.get(
      "ivLyrics:visual:panel-lyrics-enabled",
      true
    ),
    "panel-font-scale":
      StorageManager.getItem("ivLyrics:visual:panel-font-scale") || "100",
    "panel-lyrics-font-family":
      StorageManager.getItem("ivLyrics:visual:panel-lyrics-font-family") ||
      "Pretendard Variable",
    "panel-lyrics-original-font":
      StorageManager.getItem("ivLyrics:visual:panel-lyrics-original-font") || "",
    "panel-lyrics-phonetic-font":
      StorageManager.getItem("ivLyrics:visual:panel-lyrics-phonetic-font") || "",
    "panel-lyrics-translation-font":
      StorageManager.getItem("ivLyrics:visual:panel-lyrics-translation-font") || "",
    "panel-lyrics-original-size":
      StorageManager.getItem("ivLyrics:visual:panel-lyrics-original-size") || "26",
    "panel-lyrics-phonetic-size":
      StorageManager.getItem("ivLyrics:visual:panel-lyrics-phonetic-size") || "13",
    "panel-lyrics-translation-size":
      StorageManager.getItem("ivLyrics:visual:panel-lyrics-translation-size") || "13",
    "panel-lyrics-original-outline-width":
      StorageManager.getItem("ivLyrics:visual:panel-lyrics-original-outline-width") || "0",
    "panel-lyrics-original-outline-color":
      StorageManager.getItem("ivLyrics:visual:panel-lyrics-original-outline-color") || "#000000",
    "panel-lyrics-phonetic-outline-width":
      StorageManager.getItem("ivLyrics:visual:panel-lyrics-phonetic-outline-width") || "0",
    "panel-lyrics-phonetic-outline-color":
      StorageManager.getItem("ivLyrics:visual:panel-lyrics-phonetic-outline-color") || "#000000",
    "panel-lyrics-translation-outline-width":
      StorageManager.getItem("ivLyrics:visual:panel-lyrics-translation-outline-width") || "0",
    "panel-lyrics-translation-outline-color":
      StorageManager.getItem("ivLyrics:visual:panel-lyrics-translation-outline-color") || "#000000",
    "panel-bg-type":
      StorageManager.getItem("ivLyrics:visual:panel-bg-type") || "album",
    "panel-bg-color":
      StorageManager.getItem("ivLyrics:visual:panel-bg-color") || "#6366f1",
    "panel-bg-gradient-1":
      StorageManager.getItem("ivLyrics:visual:panel-bg-gradient-1") || "#6366f1",
    "panel-bg-gradient-2":
      StorageManager.getItem("ivLyrics:visual:panel-bg-gradient-2") || "#a855f7",
    "panel-bg-opacity":
      StorageManager.getItem("ivLyrics:visual:panel-bg-opacity") || "30",
    "panel-border-enabled": StorageManager.get(
      "ivLyrics:visual:panel-border-enabled",
      false
    ),
    "panel-border-color":
      StorageManager.getItem("ivLyrics:visual:panel-border-color") || "#ffffff",
    "panel-border-opacity":
      StorageManager.getItem("ivLyrics:visual:panel-border-opacity") || "10",
    "multi-vocal-speaker-color-male-1":
      StorageManager.getItem("ivLyrics:visual:multi-vocal-speaker-color-male-1") || "#a8ccff",
    "multi-vocal-speaker-color-male-2":
      StorageManager.getItem("ivLyrics:visual:multi-vocal-speaker-color-male-2") || "#9ae8d4",
    "multi-vocal-speaker-color-male-3":
      StorageManager.getItem("ivLyrics:visual:multi-vocal-speaker-color-male-3") || "#bfe8ff",
    "multi-vocal-speaker-color-male-4":
      StorageManager.getItem("ivLyrics:visual:multi-vocal-speaker-color-male-4") || "#7fb5e6",
    "multi-vocal-speaker-color-male-5":
      StorageManager.getItem("ivLyrics:visual:multi-vocal-speaker-color-male-5") || "#6cb8b8",
    "multi-vocal-speaker-color-female-1":
      StorageManager.getItem("ivLyrics:visual:multi-vocal-speaker-color-female-1") || "#ffb8c7",
    "multi-vocal-speaker-color-female-2":
      StorageManager.getItem("ivLyrics:visual:multi-vocal-speaker-color-female-2") || "#ffd6b3",
    "multi-vocal-speaker-color-female-3":
      StorageManager.getItem("ivLyrics:visual:multi-vocal-speaker-color-female-3") || "#f6c8ff",
    "multi-vocal-speaker-color-female-4":
      StorageManager.getItem("ivLyrics:visual:multi-vocal-speaker-color-female-4") || "#e6b4d4",
    "multi-vocal-speaker-color-female-5":
      StorageManager.getItem("ivLyrics:visual:multi-vocal-speaker-color-female-5") || "#f6e5a5",
    "multi-vocal-speaker-color-duet-1":
      StorageManager.getItem("ivLyrics:visual:multi-vocal-speaker-color-duet-1") || "#e4d8ff",
    "multi-vocal-speaker-color-duet-2":
      StorageManager.getItem("ivLyrics:visual:multi-vocal-speaker-color-duet-2") || "#d6e4ff",
    "multi-vocal-speaker-color-duet-3":
      StorageManager.getItem("ivLyrics:visual:multi-vocal-speaker-color-duet-3") || "#ffddf2",
    "multi-vocal-speaker-color-duet-4":
      StorageManager.getItem("ivLyrics:visual:multi-vocal-speaker-color-duet-4") || "#bfaeff",
    "multi-vocal-speaker-color-duet-5":
      StorageManager.getItem("ivLyrics:visual:multi-vocal-speaker-color-duet-5") || "#9d8cf2",
    "sync-data-custom-speaker-colors-enabled": StorageManager.get(
      "ivLyrics:visual:sync-data-custom-speaker-colors-enabled",
      true
    ),
    colorful: StorageManager.get("ivLyrics:visual:colorful", false),
    "gradient-background": StorageManager.get(
      "ivLyrics:visual:gradient-background"
    ),
    "album-bg-blur":
      StorageManager.getItem("ivLyrics:visual:album-bg-blur") || "20",
    "reduce-motion": StorageManager.get(
      "ivLyrics:visual:reduce-motion",
      false
    ),
    "performance-frame-rate":
      Number(StorageManager.getItem("ivLyrics:visual:performance-frame-rate")) ||
      60,
    "instrumental-break-icon":
      StorageManager.getItem("ivLyrics:visual:instrumental-break-icon") ||
      "equalizer",
    "instrumental-break-show-label": StorageManager.get(
      "ivLyrics:visual:instrumental-break-show-label",
      false
    ),
    "instrumental-break-auto-detect": StorageManager.get(
      "ivLyrics:visual:instrumental-break-auto-detect",
      true
    ),
    "instrumental-break-label-font-family":
      StorageManager.getItem("ivLyrics:visual:instrumental-break-label-font-family") ||
      "",
    "instrumental-break-label-font-size":
      StorageManager.getItem("ivLyrics:visual:instrumental-break-label-font-size") ||
      "",
    "instrumental-break-label-font-weight":
      StorageManager.getItem("ivLyrics:visual:instrumental-break-label-font-weight") ||
      "",
    "instrumental-break-label-opacity":
      StorageManager.getItem("ivLyrics:visual:instrumental-break-label-opacity") ||
      "",
    "instrumental-break-label-outline-width":
      StorageManager.getItem("ivLyrics:visual:instrumental-break-label-outline-width") || "0",
    "instrumental-break-label-outline-color":
      StorageManager.getItem("ivLyrics:visual:instrumental-break-label-outline-color") || "#000000",
    "instrumental-break-animation-speed":
      Number(StorageManager.getItem("ivLyrics:visual:instrumental-break-animation-speed")) ||
      100,

    "blur-gradient-background": StorageManager.get(
      "ivLyrics:visual:blur-gradient-background",
      false
    ),
    "background-brightness":
      StorageManager.getItem("ivLyrics:visual:background-brightness") ||
      "30",
    "solid-background": StorageManager.get(
      "ivLyrics:visual:solid-background",
      false
    ),
    "video-background": StorageManager.get(
      "ivLyrics:visual:video-background",
      false
    ),
    "community-video-random": StorageManager.get(
      "ivLyrics:visual:community-video-random",
      false
    ),
    "community-video-hide-disliked": StorageManager.get(
      "ivLyrics:visual:community-video-hide-disliked",
      true
    ),
    "video-helper-enabled": StorageManager.get(
      "ivLyrics:visual:video-helper-enabled",
      false
    ),
    "lyrics-helper-enabled": StorageManager.get(
      "ivLyrics:visual:lyrics-helper-enabled",
      false
    ),
    "video-blur":
      StorageManager.getItem("ivLyrics:visual:video-blur") || "5",
    "video-cover": StorageManager.get(
      "ivLyrics:visual:video-cover",
      false
    ),
    "video-scale":
      StorageManager.getItem("ivLyrics:visual:video-scale") || "105",
    "solid-background-color":
      StorageManager.getItem("ivLyrics:visual:solid-background-color") ||
      "#1e3a8a",
    noise: StorageManager.get("ivLyrics:visual:noise"),
    "background-color":
      StorageManager.getItem("ivLyrics:visual:background-color") ||
      "var(--spice-main)",
    "active-color":
      StorageManager.getItem("ivLyrics:visual:active-color") ||
      "var(--spice-text)",
    "inactive-color":
      StorageManager.getItem("ivLyrics:visual:inactive-color") ||
      "rgba(var(--spice-rgb-subtext),0.5)",
    "highlight-color":
      StorageManager.getItem("ivLyrics:visual:highlight-color") ||
      "var(--spice-button)",
    alignment:
      StorageManager.getItem("ivLyrics:visual:alignment") || "center",
    "lines-before":
      StorageManager.getItem("ivLyrics:visual:lines-before") || "0",
    "lines-after":
      StorageManager.getItem("ivLyrics:visual:lines-after") || "2",
    "font-size": StorageManager.getItem("ivLyrics:visual:font-size") || "32",
    "font-family":
      StorageManager.getItem("ivLyrics:visual:font-family") ||
      "Pretendard Variable",
    "original-font-family":
      StorageManager.getItem("ivLyrics:visual:original-font-family") ||
      "Pretendard Variable",
    "phonetic-font-family":
      StorageManager.getItem("ivLyrics:visual:phonetic-font-family") ||
      "Pretendard Variable",
    "translation-font-family":
      StorageManager.getItem("ivLyrics:visual:translation-font-family") ||
      "Pretendard Variable",
    "cultural-annotations-font-family":
      StorageManager.getItem("ivLyrics:visual:cultural-annotations-font-family") ||
      "Pretendard Variable",
    "cultural-annotations-vinyl-font-family":
      StorageManager.getItem("ivLyrics:visual:cultural-annotations-vinyl-font-family") ||
      "Pretendard Variable",
    "original-outline-width":
      StorageManager.getItem("ivLyrics:visual:original-outline-width") || "0",
    "original-outline-color":
      StorageManager.getItem("ivLyrics:visual:original-outline-color") || "#000000",
    "phonetic-outline-width":
      StorageManager.getItem("ivLyrics:visual:phonetic-outline-width") || "0",
    "phonetic-outline-color":
      StorageManager.getItem("ivLyrics:visual:phonetic-outline-color") || "#000000",
    "translation-outline-width":
      StorageManager.getItem("ivLyrics:visual:translation-outline-width") || "0",
    "translation-outline-color":
      StorageManager.getItem("ivLyrics:visual:translation-outline-color") || "#000000",
    "furigana-outline-width":
      StorageManager.getItem("ivLyrics:visual:furigana-outline-width") || "0",
    "furigana-outline-color":
      StorageManager.getItem("ivLyrics:visual:furigana-outline-color") || "#000000",
    "cultural-annotations-outline-width":
      StorageManager.getItem("ivLyrics:visual:cultural-annotations-outline-width") || "0",
    "cultural-annotations-outline-color":
      StorageManager.getItem("ivLyrics:visual:cultural-annotations-outline-color") || "#000000",
    "cultural-annotations-vinyl-outline-width":
      StorageManager.getItem("ivLyrics:visual:cultural-annotations-vinyl-outline-width") || "0",
    "cultural-annotations-vinyl-outline-color":
      StorageManager.getItem("ivLyrics:visual:cultural-annotations-vinyl-outline-color") || "#000000",
    "original-font-weight":
      StorageManager.getItem("ivLyrics:visual:original-font-weight") ||
      "600",
    "original-font-size":
      StorageManager.getItem("ivLyrics:visual:original-font-size") || "44",
    "translation-font-weight":
      StorageManager.getItem("ivLyrics:visual:translation-font-weight") ||
      "300",
    "translation-font-size":
      StorageManager.getItem("ivLyrics:visual:translation-font-size") ||
      "22",
    "cultural-annotations-font-weight":
      StorageManager.getItem("ivLyrics:visual:cultural-annotations-font-weight") ||
      "300",
    "cultural-annotations-font-size":
      StorageManager.getItem("ivLyrics:visual:cultural-annotations-font-size") ||
      "14",
    "cultural-annotations-vinyl-font-weight":
      StorageManager.getItem("ivLyrics:visual:cultural-annotations-vinyl-font-weight") ||
      "300",
    "cultural-annotations-vinyl-font-size":
      StorageManager.getItem("ivLyrics:visual:cultural-annotations-vinyl-font-size") ||
      "12",
    "translation-spacing":
      StorageManager.getItem("ivLyrics:visual:translation-spacing") || "0",
    "phonetic-font-weight":
      StorageManager.getItem("ivLyrics:visual:phonetic-font-weight") ||
      "100",
    "phonetic-font-size":
      StorageManager.getItem("ivLyrics:visual:phonetic-font-size") || "16",
    "phonetic-opacity":
      StorageManager.getItem("ivLyrics:visual:phonetic-opacity") || "70",
    "phonetic-spacing":
      StorageManager.getItem("ivLyrics:visual:phonetic-spacing") || "-1",
    "phonetic-hyphen-replace":
      StorageManager.getItem("ivLyrics:visual:phonetic-hyphen-replace") || "keep",
    "original-letter-spacing":
      StorageManager.getItem("ivLyrics:visual:original-letter-spacing") || "0",
    "phonetic-letter-spacing":
      StorageManager.getItem("ivLyrics:visual:phonetic-letter-spacing") || "0",
    "translation-letter-spacing":
      StorageManager.getItem("ivLyrics:visual:translation-letter-spacing") || "0",
    "furigana-font-weight":
      StorageManager.getItem("ivLyrics:visual:furigana-font-weight") ||
      "300",
    "furigana-font-size":
      StorageManager.getItem("ivLyrics:visual:furigana-font-size") || "14",
    "furigana-opacity":
      StorageManager.getItem("ivLyrics:visual:furigana-opacity") || "80",
    "furigana-spacing":
      StorageManager.getItem("ivLyrics:visual:furigana-spacing") || "2",
    "text-shadow-enabled": StorageManager.get(
      "ivLyrics:visual:text-shadow-enabled",
      true
    ),
    "text-shadow-color":
      StorageManager.getItem("ivLyrics:visual:text-shadow-color") ||
      "#000000",
    "text-shadow-opacity":
      StorageManager.getItem("ivLyrics:visual:text-shadow-opacity") || "50",
    "text-shadow-blur":
      StorageManager.getItem("ivLyrics:visual:text-shadow-blur") || "2",
    "original-opacity":
      StorageManager.getItem("ivLyrics:visual:original-opacity") || "95",
    "translation-opacity":
      StorageManager.getItem("ivLyrics:visual:translation-opacity") || "85",
    "cultural-annotations-opacity":
      StorageManager.getItem("ivLyrics:visual:cultural-annotations-opacity") || "60",
    "cultural-annotations-vinyl-opacity":
      StorageManager.getItem("ivLyrics:visual:cultural-annotations-vinyl-opacity") || "60",
    "translate:translated-lyrics-source":
      StorageManager.getItem(
        "ivLyrics:visual:translate:translated-lyrics-source"
      ) || "auto",
    "translate:display-mode":
      StorageManager.getItem("ivLyrics:visual:translate:display-mode") ||
      "replace",
    "translate:target-language":
      StorageManager.getItem("ivLyrics:visual:translate:target-language") ||
      "auto",
    "translate:pronunciation-notation": normalizeIvLyricsPronunciationNotation(
      StorageManager.getItem(LYRICS_PRONUNCIATION_NOTATION_STORAGE_KEY)
    ),
    "cultural-annotations-enabled": StorageManager.get(
      "ivLyrics:visual:cultural-annotations-enabled",
      false
    ),
    "translate:detect-language-override":
      StorageManager.getItem(
        "ivLyrics:visual:translate:detect-language-override"
      ) || "off",
    "translation-mode:english":
      StorageManager.getItem("ivLyrics:visual:translation-mode:english") ||
      "none",
    "translation-mode:japanese":
      StorageManager.getItem("ivLyrics:visual:translation-mode:japanese") ||
      "none",
    "translation-mode:korean":
      StorageManager.getItem("ivLyrics:visual:translation-mode:korean") ||
      "none",
    "translation-mode:chinese":
      StorageManager.getItem("ivLyrics:visual:translation-mode:chinese") ||
      "none",
    "translation-mode:russian":
      StorageManager.getItem("ivLyrics:visual:translation-mode:russian") ||
      "none",
    "translation-mode:vietnamese":
      StorageManager.getItem(
        "ivLyrics:visual:translation-mode:vietnamese"
      ) || "none",
    "translation-mode:german":
      StorageManager.getItem("ivLyrics:visual:translation-mode:german") ||
      "none",
    "translation-mode:swedish":
      StorageManager.getItem("ivLyrics:visual:translation-mode:swedish") ||
      "none",
    "translation-mode:spanish":
      StorageManager.getItem("ivLyrics:visual:translation-mode:spanish") ||
      "none",
    "translation-mode:french":
      StorageManager.getItem("ivLyrics:visual:translation-mode:french") ||
      "none",
    "translation-mode:italian":
      StorageManager.getItem("ivLyrics:visual:translation-mode:italian") ||
      "none",
    "translation-mode:portuguese":
      StorageManager.getItem(
        "ivLyrics:visual:translation-mode:portuguese"
      ) || "none",
    "translation-mode:dutch":
      StorageManager.getItem("ivLyrics:visual:translation-mode:dutch") ||
      "none",
    "translation-mode:polish":
      StorageManager.getItem("ivLyrics:visual:translation-mode:polish") ||
      "none",
    "translation-mode:turkish":
      StorageManager.getItem("ivLyrics:visual:translation-mode:turkish") ||
      "none",
    "translation-mode:arabic":
      StorageManager.getItem("ivLyrics:visual:translation-mode:arabic") ||
      "none",
    "translation-mode:hindi":
      StorageManager.getItem("ivLyrics:visual:translation-mode:hindi") ||
      "none",
    "translation-mode:thai":
      StorageManager.getItem("ivLyrics:visual:translation-mode:thai") ||
      "none",
    "translation-mode:indonesian":
      StorageManager.getItem(
        "ivLyrics:visual:translation-mode:indonesian"
      ) || "none",
    "translation-mode:malay":
      StorageManager.getItem("ivLyrics:visual:translation-mode:malay") ||
      "none",
    "translation-mode:gemini":
      StorageManager.getItem("ivLyrics:visual:translation-mode:gemini") ||
      "none",
    "translation-mode-2:english":
      StorageManager.getItem("ivLyrics:visual:translation-mode-2:english") ||
      "none",
    "translation-mode-2:japanese":
      StorageManager.getItem(
        "ivLyrics:visual:translation-mode-2:japanese"
      ) || "none",
    "translation-mode-2:korean":
      StorageManager.getItem("ivLyrics:visual:translation-mode-2:korean") ||
      "none",
    "translation-mode-2:chinese":
      StorageManager.getItem("ivLyrics:visual:translation-mode-2:chinese") ||
      "none",
    "translation-mode-2:russian":
      StorageManager.getItem("ivLyrics:visual:translation-mode-2:russian") ||
      "none",
    "translation-mode-2:vietnamese":
      StorageManager.getItem(
        "ivLyrics:visual:translation-mode-2:vietnamese"
      ) || "none",
    "translation-mode-2:german":
      StorageManager.getItem("ivLyrics:visual:translation-mode-2:german") ||
      "none",
    "translation-mode-2:swedish":
      StorageManager.getItem("ivLyrics:visual:translation-mode-2:swedish") ||
      "none",
    "translation-mode-2:spanish":
      StorageManager.getItem("ivLyrics:visual:translation-mode-2:spanish") ||
      "none",
    "translation-mode-2:french":
      StorageManager.getItem("ivLyrics:visual:translation-mode-2:french") ||
      "none",
    "translation-mode-2:italian":
      StorageManager.getItem("ivLyrics:visual:translation-mode-2:italian") ||
      "none",
    "translation-mode-2:portuguese":
      StorageManager.getItem(
        "ivLyrics:visual:translation-mode-2:portuguese"
      ) || "none",
    "translation-mode-2:dutch":
      StorageManager.getItem("ivLyrics:visual:translation-mode-2:dutch") ||
      "none",
    "translation-mode-2:polish":
      StorageManager.getItem("ivLyrics:visual:translation-mode-2:polish") ||
      "none",
    "translation-mode-2:turkish":
      StorageManager.getItem("ivLyrics:visual:translation-mode-2:turkish") ||
      "none",
    "translation-mode-2:arabic":
      StorageManager.getItem("ivLyrics:visual:translation-mode-2:arabic") ||
      "none",
    "translation-mode-2:hindi":
      StorageManager.getItem("ivLyrics:visual:translation-mode-2:hindi") ||
      "none",
    "translation-mode-2:thai":
      StorageManager.getItem("ivLyrics:visual:translation-mode-2:thai") ||
      "none",
    "translation-mode-2:indonesian":
      StorageManager.getItem(
        "ivLyrics:visual:translation-mode-2:indonesian"
      ) || "none",
    "translation-mode-2:malay":
      StorageManager.getItem("ivLyrics:visual:translation-mode-2:malay") ||
      "none",
    "translation-mode-2:gemini":
      StorageManager.getItem("ivLyrics:visual:translation-mode-2:gemini") ||
      "none",
    "gemini-api-key":
      StorageManager.getPersisted("ivLyrics:visual:gemini-api-key") || "",
    "gemini-api-key-romaji":
      StorageManager.getPersisted("ivLyrics:visual:gemini-api-key-romaji") ||
      "",
    translate: StorageManager.get("ivLyrics:visual:translate", false),
    "furigana-enabled": StorageManager.get(
      "ivLyrics:visual:furigana-enabled",
      false
    ),
    "ja-detect-threshold":
      StorageManager.getItem("ivLyrics:visual:ja-detect-threshold") || "40",
    "hans-detect-threshold":
      StorageManager.getItem("ivLyrics:visual:hans-detect-threshold") ||
      "40",
    "fade-blur": StorageManager.get("ivLyrics:visual:fade-blur"),
    "highlight-mode": StorageManager.get("ivLyrics:visual:highlight-mode", false),
    "highlight-intensity":
      StorageManager.getItem("ivLyrics:visual:highlight-intensity") || "70",
    "karaoke-bounce": StorageManager.get(
      "ivLyrics:visual:karaoke-bounce",
      true
    ),
    "karaoke-line-transition": StorageManager.get(
      "ivLyrics:visual:karaoke-line-transition",
      true
    ),
    "karaoke-text-effects": StorageManager.get(
      "ivLyrics:visual:karaoke-text-effects",
      true
    ),
    "karaoke-mode-enabled": StorageManager.get(
      "ivLyrics:visual:karaoke-mode-enabled",
      true
    ),
    "sync-creator-auto-boundary-chars": StorageManager.get(
      "ivLyrics:visual:sync-creator-auto-boundary-chars",
      true
    ),
    "karaoke-fill-correction-curve":
      StorageManager.getItem("ivLyrics:visual:karaoke-fill-correction-curve") ||
      "[[0,0],[0.25,0.25],[0.5,0.5],[0.75,0.75],[1,1]]",
    "spotify-fake-karaoke-enabled": StorageManager.get(
      "ivLyrics:visual:spotify-fake-karaoke-enabled",
      false
    ),
    "pseudo-karaoke-render-advance": getStoredFiniteNumber(
      "ivLyrics:visual:pseudo-karaoke-render-advance",
      250,
      0,
      500
    ),
    "prefer-sync-data-provider": StorageManager.get(
      "ivLyrics:visual:prefer-sync-data-provider",
      true
    ),
    "prefer-lyrics-type-over-provider-order": StorageManager.get(
      "ivLyrics:visual:prefer-lyrics-type-over-provider-order",
      true
    ),
    // Prefetch settings
    "prefetch-enabled": StorageManager.get(
      "ivLyrics:visual:prefetch-enabled",
      true
    ),
    "prefetch-video-enabled": StorageManager.get(
      "ivLyrics:visual:prefetch-video-enabled",
      true
    ),
    "global-sync-offset":
      Number(StorageManager.getItem("ivLyrics:visual:global-sync-offset")) || 0,
    "quick-sync-controls-enabled": StorageManager.get(
      "ivLyrics:visual:quick-sync-controls-enabled",
      true
    ),
    "fullscreen-key":
      StorageManager.getItem("ivLyrics:visual:fullscreen-key") || "f12",
    "synced-compact": StorageManager.get("ivLyrics:visual:synced-compact"),
    // 메타데이터 번역 (제목/아티스트)
    "translate-metadata": StorageManager.get(
      "ivLyrics:visual:translate-metadata",
      false
    ),
    "translate-metadata-mode":
      StorageManager.getItem("ivLyrics:visual:translate-metadata-mode") || "translated",
    // Fullscreen settings
    "fullscreen-two-column": StorageManager.get(
      "ivLyrics:visual:fullscreen-two-column",
      true
    ),
    "fullscreen-layout-reverse": StorageManager.get(
      "ivLyrics:visual:fullscreen-layout-reverse",
      false
    ),
    "fullscreen-show-album": StorageManager.get(
      "ivLyrics:visual:fullscreen-show-album",
      true
    ),
    "fullscreen-show-info": StorageManager.get(
      "ivLyrics:visual:fullscreen-show-info",
      true
    ),
    "fullscreen-center-when-no-lyrics": StorageManager.get(
      "ivLyrics:visual:fullscreen-center-when-no-lyrics",
      true
    ),
    "fullscreen-album-size":
      StorageManager.getItem("ivLyrics:visual:fullscreen-album-size") ||
      "400",
    "fullscreen-album-radius":
      StorageManager.getItem("ivLyrics:visual:fullscreen-album-radius") ||
      "12",
    // Fullscreen vinyl mode
    "fullscreen-vinyl-album-size":
      Number(StorageManager.getItem("ivLyrics:visual:fullscreen-vinyl-album-size")) ||
      100,
    "fullscreen-vinyl-record-size":
      Number(StorageManager.getItem("ivLyrics:visual:fullscreen-vinyl-record-size")) ||
      100,
    "fullscreen-vinyl-background-blur":
      Number(StorageManager.getItem("ivLyrics:visual:fullscreen-vinyl-background-blur")) ||
      0,
    "fullscreen-vinyl-animations": StorageManager.get(
      "ivLyrics:visual:fullscreen-vinyl-animations",
      true
    ),
    "fullscreen-vinyl-center-rotation": StorageManager.get(
      "ivLyrics:visual:fullscreen-vinyl-center-rotation",
      true
    ),
    "fullscreen-vinyl-lyrics-enabled": StorageManager.get(
      "ivLyrics:visual:fullscreen-vinyl-lyrics-enabled",
      true
    ),
    "fullscreen-focus-presentation":
      normalizeIvLyricsDefaultFullscreenPresentation(
        StorageManager.getItem("ivLyrics:visual:fullscreen-focus-presentation")
      ),
    "fullscreen-vinyl-tonearm-style":
      StorageManager.getItem("ivLyrics:visual:fullscreen-vinyl-tonearm-style") ||
      "s",
    "fullscreen-vinyl-tonearm-finish":
      StorageManager.getItem("ivLyrics:visual:fullscreen-vinyl-tonearm-finish") ||
      "white",
    "fullscreen-vinyl-tonearm-size":
      Number(StorageManager.getItem("ivLyrics:visual:fullscreen-vinyl-tonearm-size")) ||
      100,
    "fullscreen-vinyl-original-font-family":
      getOrSeedVinylTypographySetting(
        "original-font-family",
        "original-font-family",
        "Pretendard Variable"
      ),
    "fullscreen-vinyl-original-font-size":
      getOrSeedVinylTypographySetting(
        "original-font-size",
        "original-font-size",
        44,
        { numeric: true, scale: VINYL_TYPOGRAPHY_DEFAULT_SCALE }
      ),
    "fullscreen-vinyl-original-font-weight":
      getOrSeedVinylTypographySetting(
        "original-font-weight",
        "original-font-weight",
        600,
        { numeric: true }
      ),
    "fullscreen-vinyl-original-opacity":
      getOrSeedVinylTypographySetting(
        "original-opacity",
        "original-opacity",
        95,
        { numeric: true }
      ),
    "fullscreen-vinyl-original-letter-spacing":
      getOrSeedVinylTypographySetting(
        "original-letter-spacing",
        "original-letter-spacing",
        0,
        { numeric: true }
      ),
    "fullscreen-vinyl-original-outline-width":
      StorageManager.getItem("ivLyrics:visual:fullscreen-vinyl-original-outline-width") || "0",
    "fullscreen-vinyl-original-outline-color":
      StorageManager.getItem("ivLyrics:visual:fullscreen-vinyl-original-outline-color") || "#000000",
    "fullscreen-vinyl-phonetic-font-family":
      getOrSeedVinylTypographySetting(
        "phonetic-font-family",
        "phonetic-font-family",
        "Pretendard Variable"
      ),
    "fullscreen-vinyl-phonetic-font-size":
      getOrSeedVinylTypographySetting(
        "phonetic-font-size",
        "phonetic-font-size",
        16,
        { numeric: true, scale: VINYL_TYPOGRAPHY_DEFAULT_SCALE }
      ),
    "fullscreen-vinyl-phonetic-font-weight":
      getOrSeedVinylTypographySetting(
        "phonetic-font-weight",
        "phonetic-font-weight",
        100,
        { numeric: true }
      ),
    "fullscreen-vinyl-phonetic-opacity":
      getOrSeedVinylTypographySetting(
        "phonetic-opacity",
        "phonetic-opacity",
        70,
        { numeric: true }
      ),
    "fullscreen-vinyl-phonetic-spacing":
      getOrSeedVinylTypographySetting(
        "phonetic-spacing",
        "phonetic-spacing",
        -1,
        { numeric: true }
      ),
    "fullscreen-vinyl-phonetic-letter-spacing":
      getOrSeedVinylTypographySetting(
        "phonetic-letter-spacing",
        "phonetic-letter-spacing",
        0,
        { numeric: true }
      ),
    "fullscreen-vinyl-phonetic-outline-width":
      StorageManager.getItem("ivLyrics:visual:fullscreen-vinyl-phonetic-outline-width") || "0",
    "fullscreen-vinyl-phonetic-outline-color":
      StorageManager.getItem("ivLyrics:visual:fullscreen-vinyl-phonetic-outline-color") || "#000000",
    "fullscreen-vinyl-translation-font-family":
      getOrSeedVinylTypographySetting(
        "translation-font-family",
        "translation-font-family",
        "Pretendard Variable"
      ),
    "fullscreen-vinyl-translation-font-size":
      getOrSeedVinylTypographySetting(
        "translation-font-size",
        "translation-font-size",
        22,
        { numeric: true, scale: VINYL_TYPOGRAPHY_DEFAULT_SCALE }
      ),
    "fullscreen-vinyl-translation-font-weight":
      getOrSeedVinylTypographySetting(
        "translation-font-weight",
        "translation-font-weight",
        300,
        { numeric: true }
      ),
    "fullscreen-vinyl-translation-opacity":
      getOrSeedVinylTypographySetting(
        "translation-opacity",
        "translation-opacity",
        85,
        { numeric: true }
      ),
    "fullscreen-vinyl-translation-spacing":
      getOrSeedVinylTypographySetting(
        "translation-spacing",
        "translation-spacing",
        0,
        { numeric: true }
      ),
    "fullscreen-vinyl-translation-letter-spacing":
      getOrSeedVinylTypographySetting(
        "translation-letter-spacing",
        "translation-letter-spacing",
        0,
        { numeric: true }
      ),
    "fullscreen-vinyl-translation-outline-width":
      StorageManager.getItem("ivLyrics:visual:fullscreen-vinyl-translation-outline-width") || "0",
    "fullscreen-vinyl-translation-outline-color":
      StorageManager.getItem("ivLyrics:visual:fullscreen-vinyl-translation-outline-color") || "#000000",
    "fullscreen-video-stage-original-font-family":
      getOrSeedVideoStageTypographySetting("original-font-family"),
    "fullscreen-video-stage-phonetic-font-family":
      getOrSeedVideoStageTypographySetting("phonetic-font-family"),
    "fullscreen-video-stage-translation-font-family":
      getOrSeedVideoStageTypographySetting("translation-font-family"),
    "fullscreen-video-stage-cultural-font-family":
      getOrSeedVideoStageTypographySetting(
        "cultural-font-family",
        StorageManager.getItem("ivLyrics:visual:cultural-annotations-vinyl-font-family") ||
          "Pretendard Variable"
      ),
    "fullscreen-video-stage-lyric-background-color":
      StorageManager.getItem("ivLyrics:visual:fullscreen-video-stage-lyric-background-color") ||
      "#000000",
    "fullscreen-video-stage-lyric-background-opacity": Number(
      StorageManager.get(
        "ivLyrics:visual:fullscreen-video-stage-lyric-background-opacity",
        46
      )
    ),
    "fullscreen-title-size":
      StorageManager.getItem("ivLyrics:visual:fullscreen-title-size") ||
      "48",
    "fullscreen-title-outline-width":
      StorageManager.getItem("ivLyrics:visual:fullscreen-title-outline-width") || "0",
    "fullscreen-title-outline-color":
      StorageManager.getItem("ivLyrics:visual:fullscreen-title-outline-color") || "#000000",
    "fullscreen-artist-size":
      StorageManager.getItem("ivLyrics:visual:fullscreen-artist-size") ||
      "24",
    "fullscreen-artist-outline-width":
      StorageManager.getItem("ivLyrics:visual:fullscreen-artist-outline-width") || "0",
    "fullscreen-artist-outline-color":
      StorageManager.getItem("ivLyrics:visual:fullscreen-artist-outline-color") || "#000000",
    "fullscreen-lyrics-right-padding":
      Number(StorageManager.getItem("ivLyrics:visual:fullscreen-lyrics-right-padding")) ||
      0,
    // Fullscreen UI elements
    "fullscreen-show-clock": StorageManager.get(
      "ivLyrics:visual:fullscreen-show-clock",
      true
    ),
    "fullscreen-clock-size":
      Number(StorageManager.getItem("ivLyrics:visual:fullscreen-clock-size")) ||
      48,
    "fullscreen-clock-outline-width":
      StorageManager.getItem("ivLyrics:visual:fullscreen-clock-outline-width") || "0",
    "fullscreen-clock-outline-color":
      StorageManager.getItem("ivLyrics:visual:fullscreen-clock-outline-color") || "#000000",
    "fullscreen-show-context": StorageManager.get(
      "ivLyrics:visual:fullscreen-show-context",
      true
    ),
    "fullscreen-show-next-track": StorageManager.get(
      "ivLyrics:visual:fullscreen-show-next-track",
      true
    ),
    "fullscreen-next-track-seconds":
      Number(StorageManager.getItem("ivLyrics:visual:fullscreen-next-track-seconds")) ||
      15,
    "fullscreen-show-controls": StorageManager.get(
      "ivLyrics:visual:fullscreen-show-controls",
      true
    ),
    "fullscreen-show-volume": StorageManager.get(
      "ivLyrics:visual:fullscreen-show-volume",
      true
    ),
    "fullscreen-show-progress": StorageManager.get(
      "ivLyrics:visual:fullscreen-show-progress",
      true
    ),
    "fullscreen-show-lyrics-progress": StorageManager.get(
      "ivLyrics:visual:fullscreen-show-lyrics-progress",
      false
    ),
    // Fullscreen control styles
    "fullscreen-control-button-size":
      Number(StorageManager.getItem("ivLyrics:visual:fullscreen-control-button-size")) ||
      36,
    "fullscreen-controls-background": StorageManager.get(
      "ivLyrics:visual:fullscreen-controls-background",
      false
    ),
    // Fullscreen auto-hide
    "fullscreen-auto-hide-ui": StorageManager.get(
      "ivLyrics:visual:fullscreen-auto-hide-ui",
      true
    ),
    "fullscreen-auto-hide-delay":
      Number(StorageManager.getItem("ivLyrics:visual:fullscreen-auto-hide-delay")) ||
      3,
    // Browser fullscreen (monitor fill)
    "fullscreen-browser-fullscreen": StorageManager.get(
      "ivLyrics:visual:fullscreen-browser-fullscreen",
      false
    ),
    "fullscreen-page-ui-only": StorageManager.get(
      "ivLyrics:visual:fullscreen-page-ui-only",
      false
    ),
    "fullscreen-hide-overlay": StorageManager.get(
      "ivLyrics:visual:fullscreen-hide-overlay",
      true
    ),
    // TMI font size
    "fullscreen-tmi-font-size":
      Number(StorageManager.getItem("ivLyrics:visual:fullscreen-tmi-font-size")) ||
      100,
    "fullscreen-tmi-outline-width":
      StorageManager.getItem("ivLyrics:visual:fullscreen-tmi-outline-width") || "0",
    "fullscreen-tmi-outline-color":
      StorageManager.getItem("ivLyrics:visual:fullscreen-tmi-outline-color") || "#000000",
    // TV Mode settings
    "fullscreen-tv-mode": StorageManager.get(
      "ivLyrics:visual:fullscreen-tv-mode",
      false
    ),
    "fullscreen-tv-album-size":
      Number(StorageManager.getItem("ivLyrics:visual:fullscreen-tv-album-size")) ||
      140,
    "fullscreen-tv-show-album-name": StorageManager.get(
      "ivLyrics:visual:fullscreen-tv-show-album-name",
      true
    ),
    "fullscreen-tv-show-controls": StorageManager.get(
      "ivLyrics:visual:fullscreen-tv-show-controls",
      false
    ),
    "fullscreen-tv-show-progress": StorageManager.get(
      "ivLyrics:visual:fullscreen-tv-show-progress",
      false
    ),
    // Normal mode album name display
    "fullscreen-show-album-name": StorageManager.get(
      "ivLyrics:visual:fullscreen-show-album-name",
      false
    ),
    // Title trim setting
    "fullscreen-trim-title": StorageManager.get(
      "ivLyrics:visual:fullscreen-trim-title",
      false
    ),
    // Context image setting
    "fullscreen-show-context-image": StorageManager.get(
      "ivLyrics:visual:fullscreen-show-context-image",
      true
    ),
    // Info gap setting
    "fullscreen-info-gap":
      Number(StorageManager.getItem("ivLyrics:visual:fullscreen-info-gap")) || 24,
    // Queue panel setting
    "fullscreen-show-queue": StorageManager.get(
      "ivLyrics:visual:fullscreen-show-queue",
      true
    ),

    delay: 0,
  },

  get modes() { return window.I18n ? [I18n.t("modes.karaoke"), I18n.t("modes.synced"), I18n.t("modes.unsynced")] : ["Karaoke", "Synced", "Unsynced"]; },
};



CONFIG.visual["lines-before"] = Number.parseInt(CONFIG.visual["lines-before"]);
CONFIG.visual["lines-after"] = Number.parseInt(CONFIG.visual["lines-after"]);
CONFIG.visual["font-size"] = Number.parseInt(CONFIG.visual["font-size"]);
CONFIG.visual["original-font-weight"] = Number.parseInt(
  CONFIG.visual["original-font-weight"]
);
CONFIG.visual["original-font-size"] = Number.parseInt(
  CONFIG.visual["original-font-size"]
);
CONFIG.visual["translation-font-weight"] = Number.parseInt(
  CONFIG.visual["translation-font-weight"]
);
CONFIG.visual["translation-font-size"] = Number.parseInt(
  CONFIG.visual["translation-font-size"]
);
CONFIG.visual["cultural-annotations-font-weight"] = Number.parseInt(
  CONFIG.visual["cultural-annotations-font-weight"]
);
CONFIG.visual["cultural-annotations-font-size"] = Number.parseInt(
  CONFIG.visual["cultural-annotations-font-size"]
);
CONFIG.visual["cultural-annotations-vinyl-font-weight"] = Number.parseInt(
  CONFIG.visual["cultural-annotations-vinyl-font-weight"]
);
CONFIG.visual["cultural-annotations-vinyl-font-size"] = Number.parseInt(
  CONFIG.visual["cultural-annotations-vinyl-font-size"]
);
CONFIG.visual["text-shadow-opacity"] = Number.parseInt(
  CONFIG.visual["text-shadow-opacity"]
);
CONFIG.visual["text-shadow-blur"] = Number.parseInt(
  CONFIG.visual["text-shadow-blur"]
);
CONFIG.visual["original-opacity"] = Number.parseInt(
  CONFIG.visual["original-opacity"]
);
CONFIG.visual["translation-opacity"] = Number.parseInt(
  CONFIG.visual["translation-opacity"]
);
CONFIG.visual["cultural-annotations-opacity"] = Number.parseInt(
  CONFIG.visual["cultural-annotations-opacity"]
);
CONFIG.visual["cultural-annotations-vinyl-opacity"] = Number.parseInt(
  CONFIG.visual["cultural-annotations-vinyl-opacity"]
);
CONFIG.visual["background-brightness"] = Number.parseInt(
  CONFIG.visual["background-brightness"]
);
CONFIG.visual["video-scale"] = Number.parseInt(CONFIG.visual["video-scale"]) || 105;
CONFIG.visual["ja-detect-threshold"] = Number.parseInt(
  CONFIG.visual["ja-detect-threshold"]
);
CONFIG.visual["hans-detect-threshold"] = Number.parseInt(
  CONFIG.visual["hans-detect-threshold"]
);
CONFIG.visual["highlight-intensity"] = Number.parseInt(
  CONFIG.visual["highlight-intensity"]
);

// Extension에서 접근 가능하도록 window에 노출
window.CONFIG = CONFIG;
window.ivLyricsSpeakerColors?.applyCssVariables?.();

let CACHE = {};

const emptyState = {
  karaoke: null,
  karaokeGranularity: null,
  synced: null,
  unsynced: null,
  currentLyrics: null,
  syncType: null,
  syncPoints: null,
  syncTypeBreakdown: null,
};

const getPlainLyricsLineText = (line) => {
  if (typeof line === "string") return line;
  if (!line || typeof line !== "object") return "";
  return String(
    line.originalText ??
    line.text ??
    line.mainText ??
    line.line ??
    ""
  ).trim();
};

const getPlainLyricsLines = (...sources) => {
  for (const source of sources) {
    if (typeof source === "string") {
      const lines = source
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((text) => ({ text }));
      if (lines.length > 0) return lines;
      continue;
    }

    if (!Array.isArray(source)) continue;
    const lines = source
      .map(getPlainLyricsLineText)
      .filter(Boolean)
      .map((text) => ({ text }));
    if (lines.length > 0) return lines;
  }

  return [];
};

const SYNC_DATA_RENDERER_VERSION = "2026-07-13-timestamp-cluster-v1";
const getLyricsProviderSelectionPolicy = () => (
  `${CONFIG.visual["prefer-lyrics-type-over-provider-order"] !== false
    && CONFIG.visual["prefer-lyrics-type-over-provider-order"] !== "false"
    ? "type-first-v1"
    : "provider-first-v1"}:${CONFIG.visual["prefer-sync-data-provider"] !== false
      && CONFIG.visual["prefer-sync-data-provider"] !== "false"
      ? "sync-data-first"
      : "configured-order"}`
);

const getLyricsTextCacheHash = (lyrics = []) => {
  const lines = Array.isArray(lyrics) ? lyrics : [];
  let hash = 2166136261;
  let length = 0;

  for (const line of lines) {
    const value = String(line?.text || "").normalize("NFC");
    length += value.length + 1;
    for (const char of `${value}\n`) {
      hash ^= char.codePointAt(0) || 0;
      hash = Math.imul(hash, 16777619);
    }
  }

  return `txt-${(hash >>> 0).toString(36)}-${length.toString(36)}`;
};

const getSyncDataRendererCacheVersion = (lyricsState = {}) => (
  lyricsState?.syncDataApplied
    ? `${lyricsState.syncDataRendererVersion || "legacy-sync-data-renderer"}:${getLyricsTextCacheHash(
      lyricsState.karaoke || lyricsState.synced || lyricsState.unsynced
    )}`
    : "base"
);

const isLyricsRenderCacheCurrent = (lyricsState = {}) => (
  (!lyricsState?.syncDataApplied ||
    lyricsState.syncDataRendererVersion === SYNC_DATA_RENDERER_VERSION)
  && (!lyricsState?.provider
    || lyricsState.provider === "local"
    || !!lyricsState?.trackLyricsProviderOverride
    || (lyricsState?.providerSelectionPolicy || "provider-first-v1:sync-data-first") === getLyricsProviderSelectionPolicy())
);

const getDisplayModeCacheKey = (lyricsState = {}, mode = "") => {
  const providerKey = lyricsState.provider || "";
  const providerCacheVersion = lyricsState.cacheVersion || "provider-cache-legacy";
  const sourceLyrics = lyricsState.currentLyrics
    || lyricsState.karaoke
    || lyricsState.synced
    || lyricsState.unsynced
    || [];
  const lyricsShape = getLyricsProcessingShapeSignature(sourceLyrics);
  const pronunciationNotation = mode === "gemini_romaji"
    ? `:${getCurrentLyricsPronunciationNotation()}`
    : "";
  return `${lyricsState.uri}:${providerKey}:${mode}${pronunciationNotation}:${getSyncDataRendererCacheVersion(lyricsState)}:${providerCacheVersion}:${lyricsShape}`;
};

// Enhanced cache system with memory-efficient LRU and automatic cleanup
const CacheManager = {
  _cache: new Map(),
  _maxSize: 100, // Limit cache to 100 songs
  _ttl: 30 * 60 * 1000, // 30 minutes TTL
  _cleanupTimer: null,
  _statsEnabled: false,

  // Performance statistics
  _stats: {
    hits: 0,
    misses: 0,
    evictions: 0,
    cleanups: 0,
  },

  init() {
    // Start periodic cleanup to prevent memory leaks
    this._startPeriodicCleanup();

    // Listen for memory pressure events
    if ("memory" in performance) {
      this._setupMemoryPressureListener();
    }
  },

  get(key) {
    const item = this._cache.get(key);
    if (!item) {
      if (this._statsEnabled) this._stats.misses++;
      return null;
    }

    // Check if expired
    if (Date.now() > item.expiry) {
      this._cache.delete(key);
      if (this._statsEnabled) this._stats.misses++;
      return null;
    }

    // Update access time for LRU (move to end)
    this._cache.delete(key);
    item.lastAccessed = Date.now();
    this._cache.set(key, item);

    if (this._statsEnabled) this._stats.hits++;
    return item.data;
  },

  set(key, data) {
    // Clean up if cache is getting too large
    if (this._cache.size >= this._maxSize) {
      this._cleanupOldEntries();
    }

    this._cache.set(key, {
      data,
      expiry: Date.now() + this._ttl,
      lastAccessed: Date.now(),
      size: this._estimateSize(data),
    });
  },

  _cleanupOldEntries() {
    // LRU eviction - remove oldest entries
    const entries = Array.from(this._cache.entries());
    const toRemove = Math.floor(entries.length * 0.3); // Remove 30% to reduce frequent cleanups

    // Sort by last accessed time (oldest first)
    entries.sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);

    for (let i = 0; i < toRemove; i++) {
      this._cache.delete(entries[i][0]);
    }

    if (this._statsEnabled) {
      this._stats.evictions += toRemove;
      this._stats.cleanups++;
    }
  },

  _startPeriodicCleanup() {
    // Clean up expired entries every 5 minutes
    this._cleanupTimer = setInterval(() => {
      const now = Date.now();
      const keysToDelete = [];

      for (const [key, item] of this._cache.entries()) {
        if (now > item.expiry) {
          keysToDelete.push(key);
        }
      }

      keysToDelete.forEach((key) => this._cache.delete(key));

      if (this._statsEnabled && keysToDelete.length > 0) {
        this._stats.cleanups++;
      }
    }, 5 * 60 * 1000);
  },

  _setupMemoryPressureListener() {
    // Aggressive cleanup on memory pressure
    if (typeof PerformanceObserver !== "undefined") {
      try {
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.name === "memory") {
              const { totalJSHeapSize, usedJSHeapSize, jsHeapSizeLimit } =
                entry;
              const memoryUsage = usedJSHeapSize / jsHeapSizeLimit;

              // If memory usage > 80%, clear half the cache
              if (memoryUsage > 0.8) {
                this._aggressiveCleanup();
              }
            }
          }
        });
        observer.observe({ entryTypes: ["measure"] });
      } catch (error) {
        // Performance Observer not available
      }
    }
  },

  _aggressiveCleanup() {
    const entries = Array.from(this._cache.entries());
    const toRemove = Math.floor(entries.length * 0.5);

    entries.sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);

    for (let i = 0; i < toRemove; i++) {
      this._cache.delete(entries[i][0]);
    }
  },

  _estimateSize(data) {
    // Rough estimation of object size in bytes
    try {
      return JSON.stringify(data).length * 2; // 2 bytes per character (UTF-16)
    } catch {
      return 1000; // Default estimate
    }
  },

  clear() {
    this._cache.clear();
    if (this._cleanupTimer) {
      clearInterval(this._cleanupTimer);
      this._cleanupTimer = null;
    }
  },

  // Clear cache entries for a specific URI
  clearByUri(uri) {
    const keysToDelete = [];
    for (const [key] of this._cache) {
      if (key.includes(uri)) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach((key) => this._cache.delete(key));
    return keysToDelete.length;
  },

  // Get cache statistics
  getStats() {
    const hitRate =
      (this._stats.hits / (this._stats.hits + this._stats.misses)) * 100;
    return {
      ...this._stats,
      hitRate: isNaN(hitRate) ? 0 : hitRate.toFixed(2),
      cacheSize: this._cache.size,
      maxSize: this._maxSize,
    };
  },

  enableStats() {
    this._statsEnabled = true;
  },
};

// window에 등록하여 Settings.js에서 접근 가능하도록 함
window.CacheManager = CacheManager;
window.CACHE = CACHE;

// Rate limiting utility
const RateLimiter = {
  _calls: new Map(),

  canMakeCall(key, maxCalls = 5, windowMs = 60000) {
    const now = Date.now();
    const calls = this._calls.get(key) || [];
    let firstValidIndex = 0;
    while (
      firstValidIndex < calls.length &&
      now - calls[firstValidIndex] >= windowMs
    ) {
      firstValidIndex++;
    }

    const validCalls =
      firstValidIndex === 0 ? calls : calls.slice(firstValidIndex);

    if (validCalls.length >= maxCalls) {
      return false;
    }

    validCalls.push(now);
    this._calls.set(key, validCalls);
    return true;
  },
};

// ============================================
// SpotifyDataHelper - Spotify 트랙 메타데이터 추출 유틸리티
// ============================================
const SpotifyDataHelper = {
  /**
   * Spotify 트랙 데이터를 추출
   * @param {string} uri - Spotify URI (spotify:track:XXXX)
   * @returns {Object|null} spotifyData
   */
  extractSpotifyData(uri) {
    try {
      const trackId = Utils.extractTrackId(uri);
      if (!trackId) return null;

      const playerData = Spicetify.Player?.data;
      const currentTrack = playerData?.item || playerData?.track?.metadata;

      if (!currentTrack) return null;

      const currentUri = currentTrack.uri || `spotify:track:${currentTrack.id}`;
      if (currentUri !== uri) {
        const queue = Spicetify.Queue?.nextTracks || [];
        const nextTrack = queue.find(t => {
          const tUri = t.contextTrack?.uri || t.uri;
          return tUri === uri;
        });
        if (nextTrack) {
          const metadata = nextTrack.contextTrack?.metadata || nextTrack.metadata || {};
          return {
            name: metadata.title || nextTrack.name,
            artists: this._parseArtists(metadata),
            album: metadata.album_title || metadata.album,
            isrc: metadata.isrc || null,
            duration_ms: parseInt(metadata.duration) || nextTrack.duration_ms || 0
          };
        }
        return null;
      }

      const metadata = currentTrack.metadata || currentTrack;
      return {
        name: metadata.title || currentTrack.name,
        artists: this._parseArtists(metadata),
        album: metadata.album_title || metadata.album?.name || metadata.album,
        isrc: metadata.isrc || currentTrack.external_ids?.isrc || null,
        duration_ms: parseInt(metadata.duration) || currentTrack.duration_ms || 0
      };
    } catch (error) {
      console.warn('[SpotifyDataHelper] Failed to extract Spotify data:', error);
      return null;
    }
  },

  _parseArtists(metadata) {
    if (metadata.artist_name) {
      return metadata.artist_name.split(', ');
    }
    if (metadata.artists) {
      if (Array.isArray(metadata.artists)) {
        return metadata.artists.map(a => a.name || a);
      }
      return [metadata.artists];
    }
    return [];
  }
};

window.SpotifyDataHelper = SpotifyDataHelper;

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
   * 다음 곡의 모든 요소를 미리 요청 (통합 데이터 → 가사 → 번역/발음 → 영상 배경)
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

      ivLyricsDebug(`[Prefetcher] Starting prefetch for: ${trackInfo.title}`);

      try {
        // 영상 배경 프리페치는 가사 유무와 무관하게 독립적으로 시작
        const prefetchPromises = [];
        if (
          CONFIG.visual["video-background"] &&
          CONFIG.visual["prefetch-video-enabled"] !== false &&
          CONFIG.visual["community-video-random"] !== true
        ) {
          prefetchPromises.push(this._prefetchVideoBackground(trackInfo.uri));
        }

        // 1단계: 가사 먼저 프리페치
        const lyrics = await this._prefetchLyrics(trackInfo, mode);

        if (!lyrics || (!lyrics.synced && !lyrics.unsynced && !lyrics.karaoke)) {
          ivLyricsDebug(`[Prefetcher] No lyrics found for: ${trackInfo.title}`);
        } else {
          // 2단계: 가사 로드 완료 후 번역/발음 프리페치
          if (CONFIG.visual["prefetch-enabled"] !== false) {
            prefetchPromises.push(this._prefetchTranslations(trackInfo, lyrics));
          }
        }

        if (prefetchPromises.length > 0) {
          await Promise.allSettled(prefetchPromises);
        }
        ivLyricsDebug(`[Prefetcher] Completed all prefetch for: ${trackInfo.title}`);
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
    if (CACHE[uri]) {
      ivLyricsDebug(`[Prefetcher] Lyrics already cached for: ${trackInfo.title}`);
      return CACHE[uri];
    }

    // 이미 요청 중이면 기존 요청 반환
    const inflightKey = `lyrics:${uri}`;
    if (this._inflightRequests.has(inflightKey)) {
      return this._inflightRequests.get(inflightKey);
    }

    const prefetchPromise = (async () => {
      try {
        ivLyricsDebug(`[Prefetcher] Fetching lyrics for: ${trackInfo.title}`);

        // 마켓플레이스 에드온 로드 대기
        if (window.MarketplaceManager?.readyPromise) {
          await window.MarketplaceManager.readyPromise;
        }

        // LyricsService Extension을 통해 가사 로드 (LyricsAddonManager 사용)
        const resp = await window.LyricsService.getLyricsFromProviders(trackInfo);
        if (!resp.uri) resp.uri = trackInfo.uri;

        if (resp?.provider) {
          // 가사 캐시에 저장
          CACHE[resp.uri] = resp;
          ivLyricsDebug(`[Prefetcher] Lyrics cached for: ${trackInfo.title} (provider: ${resp.provider})`);
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
    const trackId = Utils.extractTrackId(uri);  // spotify:track:XXXX -> XXXX
    const cacheKeyBase = `prefetch:translation:${uri}`;
    const versionedCacheKeyBase = `${cacheKeyBase}:${getSyncDataRendererCacheVersion(lyrics)}:pronunciation=${getCurrentLyricsPronunciationNotation()}`;

    // 이미 캐시에 있으면 스킵
    if (this._prefetchCache.has(versionedCacheKeyBase)) {
      ivLyricsDebug(`[Prefetcher] Translation already cached for: ${trackInfo.title}`);
      return;
    }

    // 이미 요청 중이면 기존 요청 반환
    if (this._inflightRequests.has(versionedCacheKeyBase)) {
      return this._inflightRequests.get(versionedCacheKeyBase);
    }

    const lyricsArray = lyrics.karaoke || lyrics.synced || lyrics.unsynced;
    if (!lyricsArray || lyricsArray.length === 0) return;

    // 언어 감지
    const detectedLanguage = LyricsService.detectLanguage(lyricsArray);
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

    const modeKey = friendlyLanguage || "gemini";
    const displayMode1 = CONFIG.visual[`translation-mode:${modeKey}`];
    const displayMode2 = CONFIG.visual[`translation-mode-2:${modeKey}`];

    // 번역/발음 모드가 설정되어 있지 않으면 스킵
    if ((!displayMode1 || displayMode1 === "none") && (!displayMode2 || displayMode2 === "none")) {
      return;
    }

    // Section header 제외한 텍스트 추출
    const text = getNonSectionLyricsText(lyricsArray);
    const legacyText = getLegacyNonSectionLyricsText(lyricsArray);
    const userLang = getCurrentTranslationTargetLanguage();

    if (!text.trim()) return;

    // 발음이 필요한지, 번역이 필요한지 확인
    const needPhonetic = displayMode1 === "gemini_romaji" || displayMode2 === "gemini_romaji";
    const needTranslation = (displayMode1 && displayMode1 !== "none" && displayMode1 !== "gemini_romaji") ||
      (displayMode2 && displayMode2 !== "none" && displayMode2 !== "gemini_romaji");

    const prefetchPromise = (async () => {
      try {
        ivLyricsDebug(`[Prefetcher] Fetching translation for: ${trackInfo.title} (phonetic: ${needPhonetic}, translation: ${needTranslation})`);

        // CacheManager에도 저장 (getGeminiTranslation에서 사용)
        const processTranslationResult = (outText, targetField, splitVocalParts = true) => {
          if (!outText) return null;

          const lines = normalizeTranslationOutputLines(outText);
          return mapTranslationLinesToLyrics(lyricsArray, lines, { targetField, splitVocalParts });
        };
        const getCachedMappedResult = async (isPhonetic, cacheText, splitVocalParts) => {
          const cached = await getCachedTranslationForText({
            trackId,
            lang: userLang,
            isPhonetic,
            provider: lyrics.provider,
            text: cacheText,
          });
          const outText = getTranslationOutputFromCache(cached, isPhonetic);
          return processTranslationResult(outText, isPhonetic ? "phonetic" : "translation", splitVocalParts);
        };
        const getSplitCachedResult = (isPhonetic) => getCachedMappedResult(isPhonetic, text, true);
        const getLegacyCachedResult = (isPhonetic) => getCachedMappedResult(isPhonetic, legacyText, false);

        // 발음 요청 (wantSmartPhonetic = true)
        if (needPhonetic) {
          try {
            const cachedMapped = (await getSplitCachedResult(true)) || (await getLegacyCachedResult(true));
            if (cachedMapped) {
              CacheManager.set(getDisplayModeCacheKey(lyrics, "gemini_romaji"), cachedMapped);
              ivLyricsDebug(`[Prefetcher] Phonetic loaded from existing cache for: ${trackInfo.title} (provider: ${lyrics.provider})`);
            } else {
              const phoneticResponse = await window.Translator.callGemini({
                trackId,
                artist: trackInfo.artist,
                title: trackInfo.title,
                text,
                wantSmartPhonetic: true,
                sourceLang: detectedLanguage || "auto",
                provider: lyrics.provider,
                ignoreCache: false,
              });

              if (phoneticResponse.phonetic) {
                const mapped = processTranslationResult(phoneticResponse.phonetic, "phonetic");
                if (mapped) {
                  CacheManager.set(getDisplayModeCacheKey(lyrics, "gemini_romaji"), mapped);
                  ivLyricsDebug(`[Prefetcher] Phonetic cached for: ${trackInfo.title} (provider: ${lyrics.provider})`);
                }
              }
            }
          } catch (error) {
            console.warn(`[Prefetcher] Phonetic prefetch failed:`, error.message);
          }
        }

        // 번역 요청 (wantSmartPhonetic = false)
        if (needTranslation) {
          try {
            const cachedMapped = (await getSplitCachedResult(false)) || (await getLegacyCachedResult(false));
            if (cachedMapped) {
              if (displayMode1 && displayMode1 !== "none" && displayMode1 !== "gemini_romaji") {
                CacheManager.set(getDisplayModeCacheKey(lyrics, displayMode1), cachedMapped);
              }
              if (displayMode2 && displayMode2 !== "none" && displayMode2 !== "gemini_romaji") {
                CacheManager.set(getDisplayModeCacheKey(lyrics, displayMode2), cachedMapped);
              }
              ivLyricsDebug(`[Prefetcher] Translation loaded from existing cache for: ${trackInfo.title} (provider: ${lyrics.provider})`);
            } else {
              const translationResponse = await window.Translator.callGemini({
                trackId,
                artist: trackInfo.artist,
                title: trackInfo.title,
                text,
                wantSmartPhonetic: false,
                provider: lyrics.provider,
                ignoreCache: false,
              });

              if (translationResponse.translation) {
                const mapped = processTranslationResult(translationResponse.translation, "translation");
                if (mapped) {
                  // mode1, mode2 중 번역이 필요한 것에 캐시 저장
                  if (displayMode1 && displayMode1 !== "none" && displayMode1 !== "gemini_romaji") {
                    CacheManager.set(getDisplayModeCacheKey(lyrics, displayMode1), mapped);
                  }
                  if (displayMode2 && displayMode2 !== "none" && displayMode2 !== "gemini_romaji") {
                    CacheManager.set(getDisplayModeCacheKey(lyrics, displayMode2), mapped);
                  }
                  ivLyricsDebug(`[Prefetcher] Translation cached for: ${trackInfo.title} (provider: ${lyrics.provider})`);
                }
              }
            }
          } catch (error) {
            console.warn(`[Prefetcher] Translation prefetch failed:`, error.message);
          }
        }

        // 결과를 프리페치 캐시에 저장 (완료 표시용)
        this._prefetchCache.set(versionedCacheKeyBase, {
          lyricsArray,
          displayMode1,
          displayMode2,
          timestamp: Date.now(),
        });

        ivLyricsDebug(`[Prefetcher] Prefetch completed for: ${trackInfo.title}`);
        return true;
      } catch (error) {
        console.warn(`[Prefetcher] Translation prefetch failed:`, error.message);
        return null;
      } finally {
        this._inflightRequests.delete(versionedCacheKeyBase);
      }
    })();

    this._inflightRequests.set(versionedCacheKeyBase, prefetchPromise);
    return prefetchPromise;
  },

  /**
   * 영상 배경 정보 프리페치
   */
  async _prefetchVideoBackground(uri) {
    if (CONFIG.visual["community-video-random"] === true) return null;

    const trackId = Utils.extractTrackId(uri);
    if (!trackId) return;
    const spotifyData = SpotifyDataHelper.extractSpotifyData(uri);
    const currentItem = Spicetify.Player?.data?.item || null;
    const fallbackArtists = Array.isArray(spotifyData?.artists) && spotifyData.artists.length
      ? spotifyData.artists
      : (currentItem?.artists || []).map(artist => typeof artist === "string" ? artist : artist?.name).filter(Boolean);
    const fallbackTrackName = spotifyData?.name || currentItem?.name || "";
    const fallbackAlbum = spotifyData?.album || spotifyData?.albumName || currentItem?.album?.name || currentItem?.metadata?.album_title || "";
    const metadata = {
      trackId,
      trackName: fallbackTrackName,
      title: fallbackTrackName,
      artists: fallbackArtists,
      album: fallbackAlbum,
      isrc: spotifyData?.isrc || spotifyData?.external_ids?.isrc || currentItem?.metadata?.isrc || ""
    };
    const isrc = await window.SyncDataService?.resolveTrackIsrc?.(trackId, metadata)
      || window.SyncDataService?.getTrackIsrc?.(trackId, metadata)
      || "";
    if (!isrc) {
      console.warn(`[Prefetcher] ISRC를 확인할 수 없어 영상 프리페치를 건너뜁니다: ${trackId}`);
      return null;
    }

    const identityKey = isrc;
    const cacheKey = `prefetch:video:${identityKey}`;

    // 이미 캐시에 있으면 스킵
    if (this._prefetchCache.has(cacheKey)) {
      ivLyricsDebug(`[Prefetcher] Video info already cached for: ${identityKey}`);
      const cached = this._prefetchCache.get(cacheKey);
      if (cached?.data?.youtubeVideoId) {
        this._prefetchVideoWithHelper(cached.data.youtubeVideoId);
      }
      return;
    }

    // 이미 요청 중이면 기존 요청 반환
    if (this._inflightRequests.has(cacheKey)) {
      return this._inflightRequests.get(cacheKey);
    }

    const prefetchPromise = (async () => {
      try {
        ivLyricsDebug(`[Prefetcher] Fetching video info for: ${identityKey} (fallback)`);

        const userHash = Utils.getUserHash();
        // 서버 캐시/추천 정확도를 위해 현재 가진 트랙 메타데이터를 함께 전달
        const youtubeApiUrlObject = new URL('https://ivlis.kr/ivLyrics/openvideo/youtube');
        youtubeApiUrlObject.searchParams.set('isrc', isrc);
        youtubeApiUrlObject.searchParams.set('trackId', trackId);
        youtubeApiUrlObject.searchParams.set('userHash', userHash);
        if (metadata.trackName) {
          youtubeApiUrlObject.searchParams.set('trackName', metadata.trackName);
        }
        if (metadata.artists?.length) {
          youtubeApiUrlObject.searchParams.set('trackArtists', metadata.artists.join(', '));
        }
        if (metadata.album) {
          youtubeApiUrlObject.searchParams.set('album', metadata.album);
        }
        if (isrc && window.SyncDataService?.shouldBypassServerCache?.(isrc)) {
          youtubeApiUrlObject.searchParams.set('bypassCache', '1');
        }
        const youtubeApiUrl = youtubeApiUrlObject.toString();
        const response = await fetch(youtubeApiUrl, { cache: "no-store" });
        const data = await response.json();
        if (response.headers.get('X-ivLyrics-Decoy') === '1') {
          console.warn(`[Prefetcher] Video prefetch returned decoy for: ${identityKey}`);
          return null;
        }

        if (data.success) {
          const resolvedIsrc = window.SyncDataService?.normalizeSyncDataIsrc?.(data.data?.isrc) || isrc;
          if (resolvedIsrc) {
            window.SyncDataService?.rememberTrackIsrc?.(trackId, resolvedIsrc);
          }
          this._prefetchCache.set(cacheKey, {
            data: data.data,
            timestamp: Date.now(),
          });
          if (resolvedIsrc) {
            this._prefetchCache.set(`prefetch:video:${resolvedIsrc}`, {
              data: data.data,
              timestamp: Date.now(),
            });
          }
          ivLyricsDebug(`[Prefetcher] Video info cached for: ${resolvedIsrc || identityKey}`);
          // 헬퍼를 통한 영상 미리 다운로드
          if (data.data?.youtubeVideoId) {
            this._prefetchVideoWithHelper(data.data.youtubeVideoId);
          }
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
   * 헬퍼 프로그램을 통한 영상 미리 다운로드
   * @param {string} videoId - YouTube 비디오 ID
   */
  async _prefetchVideoWithHelper(videoId) {
    // 헬퍼 프리페치 설정 확인
    if (CONFIG.visual["prefetch-video-enabled"] === false) return;
    if (CONFIG.visual["video-helper-enabled"] !== true && CONFIG.visual["video-helper-enabled"] !== "true") return;

    // VideoHelperService 존재 확인
    if (typeof VideoHelperService === "undefined") return;

    const helperCacheKey = `prefetch:helper:${videoId}`;

    // 이미 프리페치 요청 중이면 스킵
    if (this._inflightRequests.has(helperCacheKey)) {
      ivLyricsDebug(`[Prefetcher] Helper prefetch already in progress for: ${videoId}`);
      return;
    }

    // 이미 다운로드 완료된 영상이면 스킵
    if (this._prefetchCache.has(helperCacheKey)) {
      ivLyricsDebug(`[Prefetcher] Video already prefetched via helper: ${videoId}`);
      return;
    }

    try {
      // 헬퍼 연결 상태 확인
      const isAvailable = await VideoHelperService.isHelperAvailable();
      if (!isAvailable) {
        ivLyricsDebug(`[Prefetcher] Helper not available, skipping prefetch for: ${videoId}`);
        return;
      }

      ivLyricsDebug(`[Prefetcher] Starting helper prefetch for video: ${videoId}`);

      // 요청 중 표시
      this._inflightRequests.set(helperCacheKey, true);

      // 헬퍼에 영상 요청 (다운로드 시작)
      const abortFn = VideoHelperService.requestVideo(videoId, {
        onProgress: (percent, speed, eta, message, status) => {
          if (percent > 0 && percent < 100) {
            ivLyricsDebug(`[Prefetcher] Helper prefetch progress: ${percent}% for ${videoId}`);
          }
        },
        onComplete: (url) => {
          ivLyricsDebug(`[Prefetcher] Helper prefetch complete for: ${videoId}`);
          this._prefetchCache.set(helperCacheKey, {
            videoId: videoId,
            url: url,
            timestamp: Date.now(),
          });
          this._inflightRequests.delete(helperCacheKey);
        },
        onError: (message) => {
          console.warn(`[Prefetcher] Helper prefetch failed for ${videoId}:`, message);
          this._inflightRequests.delete(helperCacheKey);
        },
      });

      // 30초 후 자동 중단 (너무 오래 걸리면)
      setTimeout(() => {
        if (this._inflightRequests.has(helperCacheKey)) {
          ivLyricsDebug(`[Prefetcher] Helper prefetch timeout for: ${videoId}`);
          abortFn();
          this._inflightRequests.delete(helperCacheKey);
        }
      }, 30000);

    } catch (error) {
      console.warn(`[Prefetcher] Helper prefetch error:`, error.message);
      this._inflightRequests.delete(helperCacheKey);
    }
  },

  /**
   * 프리페치된 영상 배경 정보 가져오기
   */
  getVideoInfo(uri) {
    const trackId = Utils.extractTrackId(uri);
    if (!trackId) return null;
    const spotifyData = SpotifyDataHelper.extractSpotifyData(uri);
    const metadata = {
      trackId,
      trackName: spotifyData?.name || "",
      title: spotifyData?.name || "",
      artists: spotifyData?.artists || [],
      album: spotifyData?.album || spotifyData?.albumName || "",
      isrc: spotifyData?.isrc || spotifyData?.external_ids?.isrc || ""
    };
    const isrc = window.SyncDataService?.getTrackIsrc?.(trackId, metadata) || "";
    if (!isrc) return null;
    const cacheKey = `prefetch:video:${isrc}`;
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
if (!window.__ivLyricsPrefetchCleanupTimer) {
    window.__ivLyricsPrefetchCleanupTimer = setInterval(() => {
        Prefetcher.cleanupOldEntries();
    }, 10 * 60 * 1000);
}

let lyricContainerUpdate;
let reloadLyrics;

const fontSizeLimit = { min: 16, max: 256, step: 4 };

const thresholdSizeLimit = { min: 0, max: 100, step: 5 };

const LyricsCacheEditModal = ({
  isOpen,
  isLoading,
  isSaving,
  originalLines,
  pronunciationText,
  translationText,
  expectedLineCount,
  hasPronunciationCache,
  hasTranslationCache,
  trackTitle,
  trackArtist,
  provider,
  error,
  onClose,
  onSave,
  onPronunciationChange,
  onTranslationChange,
}) => {
  if (!isOpen) {
    return null;
  }

  const normalizeEditorLines = (text, count) => {
    const lines = String(text ?? "").replace(/\r\n?/g, "\n").split("\n");
    while (lines.length < count) {
      lines.push("");
    }
    return lines.slice(0, count);
  };

  const sanitizedOriginalLines = Array.isArray(originalLines)
    ? Array.from({ length: expectedLineCount }, (_, index) =>
      String(originalLines[index] ?? "")
    )
    : normalizeEditorLines("", expectedLineCount);
  const pronunciationLines = normalizeEditorLines(
    pronunciationText,
    expectedLineCount
  );
  const translationLines = normalizeEditorLines(
    translationText,
    expectedLineCount
  );

  const updateLine = (lines, index, nextValue, onChange) => {
    const nextLines = [...lines];
    nextLines[index] = String(nextValue ?? "").replace(/\r\n?/g, " ");
    onChange(nextLines.join("\n"));
  };

  const shiftLinesDownFrom = (lines, index, onChange) => {
    const nextLines = Array.from({ length: expectedLineCount }, (_, lineIndex) =>
      String(lines[lineIndex] ?? "")
    );
    for (let lineIndex = expectedLineCount - 1; lineIndex > index; lineIndex--) {
      nextLines[lineIndex] = nextLines[lineIndex - 1] ?? "";
    }
    nextLines[index] = "";
    onChange(nextLines.join("\n"));
  };

  const handleOverlayClick = (event) => {
    if (event.target === event.currentTarget && !isSaving) {
      onClose();
    }
  };

  return react.createElement(
    "div",
    {
      className: "ivlyrics-cache-edit-overlay",
      onClick: handleOverlayClick,
    },
    react.createElement(
      "div",
      {
        className: "ivlyrics-cache-edit-modal",
        role: "dialog",
        "aria-modal": true,
        "aria-label": I18n.t("lyricsCacheEditor.title"),
      },
      react.createElement(
        "div",
        { className: "ivlyrics-cache-edit-header" },
        react.createElement(
          "div",
          { className: "ivlyrics-cache-edit-header-copy" },
          react.createElement(
            "h2",
            { className: "ivlyrics-cache-edit-title" },
            I18n.t("lyricsCacheEditor.title")
          ),
          react.createElement(
            "p",
            { className: "ivlyrics-cache-edit-subtitle" },
            `${trackTitle || I18n.t("lyricsCacheEditor.unknownTrack")}${trackArtist ? ` · ${trackArtist}` : ""}`
          ),
          react.createElement(
            "p",
            { className: "ivlyrics-cache-edit-meta" },
            `${I18n.t("lyricsCacheEditor.lineCount")}: ${expectedLineCount}${provider ? ` · ${provider}` : ""}`
          )
        ),
        react.createElement(
          "button",
          {
            type: "button",
            className: "ivlyrics-cache-edit-close",
            onClick: onClose,
            disabled: isSaving,
            "aria-label": I18n.t("lyricsCacheEditor.close"),
          },
          "×"
        )
      ),
      react.createElement(
        "div",
        { className: "ivlyrics-cache-edit-body" },
        isLoading
          ? react.createElement(
            "div",
            { className: "ivlyrics-cache-edit-loading" },
            I18n.t("lyricsCacheEditor.loading")
          )
          : react.createElement(
            "div",
            { className: "ivlyrics-cache-edit-content" },
            react.createElement(
              "div",
              { className: "ivlyrics-cache-edit-status" },
              react.createElement(
                "div",
                { className: "ivlyrics-cache-edit-status-item" },
                react.createElement(
                  "span",
                  null,
                  I18n.t("menu.pronunciation")
                ),
                react.createElement(
                  "span",
                  { className: "ivlyrics-cache-edit-badge" },
                  hasPronunciationCache
                    ? I18n.t("lyricsCacheEditor.cached")
                    : I18n.t("lyricsCacheEditor.empty")
                )
              ),
              react.createElement(
                "div",
                { className: "ivlyrics-cache-edit-status-item" },
                react.createElement(
                  "span",
                  null,
                  I18n.t("menu.translationLabel")
                ),
                react.createElement(
                  "span",
                  { className: "ivlyrics-cache-edit-badge" },
                  hasTranslationCache
                    ? I18n.t("lyricsCacheEditor.cached")
                    : I18n.t("lyricsCacheEditor.empty")
                )
              )
            ),
            react.createElement(
              "div",
              { className: "ivlyrics-cache-edit-list" },
              ...sanitizedOriginalLines.map((originalLine, index) =>
                react.createElement(
                  "div",
                  {
                    key: `cache-edit-line-${index}`,
                    className: "ivlyrics-cache-edit-item",
                  },
                  react.createElement(
                    "div",
                    { className: "ivlyrics-cache-edit-item-index" },
                    index + 1
                  ),
                  react.createElement(
                    "div",
                    { className: "ivlyrics-cache-edit-item-fields" },
                    react.createElement(
                      "div",
                      { className: "ivlyrics-cache-edit-field" },
                      react.createElement(
                        "div",
                        { className: "ivlyrics-cache-edit-field-header" },
                        react.createElement(
                          "span",
                          null,
                          I18n.t("lyricsCacheEditor.original")
                        ),
                        react.createElement(
                          "span",
                          { className: "ivlyrics-cache-edit-badge" },
                          I18n.t("lyricsCacheEditor.reference")
                        )
                      ),
                      react.createElement(
                        "div",
                        { className: "ivlyrics-cache-edit-original-line" },
                        originalLine || " "
                      )
                    ),
                    react.createElement(
                      "div",
                      { className: "ivlyrics-cache-edit-field" },
                      react.createElement(
                        "div",
                        { className: "ivlyrics-cache-edit-field-header" },
                        react.createElement(
                          "span",
                          null,
                          I18n.t("menu.pronunciation")
                        ),
                        react.createElement(
                          "button",
                          {
                            type: "button",
                            className: "ivlyrics-cache-edit-shift-button",
                            onClick: () =>
                              shiftLinesDownFrom(
                                pronunciationLines,
                                index,
                                onPronunciationChange
                              ),
                            disabled: isSaving || index >= expectedLineCount - 1,
                            title: I18n.t("lyricsCacheEditor.shiftDown"),
                            "aria-label": I18n.t("lyricsCacheEditor.shiftDown"),
                          },
                          "↓"
                        )
                      ),
                      react.createElement("textarea", {
                        className: "ivlyrics-cache-edit-line-input",
                        rows: 2,
                        value: pronunciationLines[index] ?? "",
                        onChange: (event) =>
                          updateLine(
                            pronunciationLines,
                            index,
                            event.target.value,
                            onPronunciationChange
                          ),
                        onKeyDown: (event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                          }
                        },
                        spellCheck: false,
                        placeholder: I18n.t(
                          "lyricsCacheEditor.pronunciationPlaceholder"
                        ),
                      })
                    ),
                    react.createElement(
                      "div",
                      { className: "ivlyrics-cache-edit-field" },
                      react.createElement(
                        "div",
                        { className: "ivlyrics-cache-edit-field-header" },
                        react.createElement(
                          "span",
                          null,
                          I18n.t("menu.translationLabel")
                        ),
                        react.createElement(
                          "button",
                          {
                            type: "button",
                            className: "ivlyrics-cache-edit-shift-button",
                            onClick: () =>
                              shiftLinesDownFrom(
                                translationLines,
                                index,
                                onTranslationChange
                              ),
                            disabled: isSaving || index >= expectedLineCount - 1,
                            title: I18n.t("lyricsCacheEditor.shiftDown"),
                            "aria-label": I18n.t("lyricsCacheEditor.shiftDown"),
                          },
                          "↓"
                        )
                      ),
                      react.createElement("textarea", {
                        className: "ivlyrics-cache-edit-line-input",
                        rows: 2,
                        value: translationLines[index] ?? "",
                        onChange: (event) =>
                          updateLine(
                            translationLines,
                            index,
                            event.target.value,
                            onTranslationChange
                          ),
                        onKeyDown: (event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                          }
                        },
                        spellCheck: true,
                        placeholder: I18n.t(
                          "lyricsCacheEditor.translationPlaceholder"
                        ),
                      })
                    )
                  )
                )
              )
            )
          ),
        error &&
        react.createElement(
          "p",
          { className: "ivlyrics-cache-edit-error" },
          error
        )
      ),
      react.createElement(
        "div",
        { className: "ivlyrics-cache-edit-footer" },
        react.createElement(
          "button",
          {
            type: "button",
            className: "ivlyrics-cache-edit-button secondary",
            onClick: onClose,
            disabled: isSaving,
          },
          I18n.t("lyricsCacheEditor.cancel")
        ),
        react.createElement(
          "button",
          {
            type: "button",
            className: "ivlyrics-cache-edit-button primary",
            onClick: onSave,
            disabled: isLoading || isSaving,
          },
          isSaving
            ? I18n.t("lyricsCacheEditor.saving")
            : I18n.t("lyricsCacheEditor.save")
        )
      )
    )
  );
};

// Lyrics, translation, pronunciation, and video background pills share one timing contract.
const GENERATION_PILL_TIMING = Object.freeze({
  loadingDelayMs: 1000,
  completeHoldMs: 520,
  exitMs: 180,
});

const GENERATION_REQUEST_PILL_CONFIG = Object.freeze({
  lyrics: Object.freeze({
    tokensKey: "_activeLyricsLoadingTokens",
    sequenceKey: "_lyricsLoadingSeq",
    timerKey: "lyricsLoadingTimer",
    failureKey: "_lyricsLoadingHadFailure",
    loadingStateKey: null,
  }),
  pronunciation: Object.freeze({
    tokensKey: "_activePhoneticLoadingTokens",
    sequenceKey: "_phoneticLoadingSeq",
    timerKey: "phoneticLoadingTimer",
    failureKey: "_phoneticLoadingHadFailure",
    loadingStateKey: "isPhoneticLoading",
  }),
  translation: Object.freeze({
    tokensKey: "_activeTranslationLoadingTokens",
    sequenceKey: "_translationLoadingSeq",
    timerKey: "translationLoadingTimer",
    failureKey: "_translationLoadingHadFailure",
    loadingStateKey: "isTranslationLoading",
  }),
  "cultural-annotations": Object.freeze({
    tokensKey: "_activeCulturalAnnotationsLoadingTokens",
    sequenceKey: "_culturalAnnotationsLoadingSeq",
    timerKey: "culturalAnnotationsLoadingTimer",
    failureKey: "_culturalAnnotationsLoadingHadFailure",
    loadingStateKey: "isCulturalAnnotationsLoading",
    loadingDelayMs: 0,
  }),
});

class LyricsContainer extends react.Component {
  constructor() {
    super();
    this.state = {
      karaoke: null,
      karaokeGranularity: null,
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
      trackLyricsProviderOverride: null,
      trackBackgroundOverride: null,
      contributors: null,
	  syncType: null,
	  syncPoints: null,
	  syncTypeBreakdown: null,
      colors: {
        background: "",
        inactive: "",
      },
      colorsUri: "",
      dynamicColors: null,
      tempo: "0.25s",
      explicitMode: -1,
      lockedMode: getRememberedLyricsRenderModeLock(),
      mode: -1,
      isLoading: false,
      showMarketplace: false,
      versionIndex: 0,
      versionIndex2: 0,
      isFullscreen: false,
      fullscreenPresentation: getRememberedIvLyricsFullscreenPresentation(),
      fullscreenLyricsHidden: false,
      isFloatingMenuOpen: false,
      isFloatingMenuClosing: false,
      isFADMode: false,
      isCached: false,
      language: null,
      isPhoneticLoading: false,
      isTranslationLoading: false,
      isCulturalAnnotationsLoading: false,
      generationPills: {
        lyrics: { phase: "idle", revision: 0 },
        translation: { phase: "idle", revision: 0 },
        pronunciation: { phase: "idle", revision: 0 },
        "cultural-annotations": { phase: "idle", revision: 0 },
        "video-background": { phase: "idle", revision: 0 },
      },
      currentLyricIndex: 0,
      videoInfo: null,
      // 메타데이터 번역
      translatedMetadata: null,
      isLyricsEditModalOpen: false,
      isLyricsEditLoading: false,
      isLyricsEditSaving: false,
      lyricsEditOriginalLines: [],
      lyricsEditPronunciationText: "",
      lyricsEditTranslationText: "",
      lyricsEditPronunciationSourceHash: "",
      lyricsEditTranslationSourceHash: "",
      lyricsEditTrackUri: "",
      lyricsEditProvider: null,
      lyricsEditTargetLanguage: "",
      lyricsEditHasPronunciationCache: false,
      lyricsEditHasTranslationCache: false,
      lyricsEditError: "",
      isPlaybackPaused: true,
      lyricsRequestSeq: 0,
      isSyncCreatorActive: false,
    };
    this.currentTrackUri = "";
    this._lyricsFetchSeq = 0;
    this._activeLyricsFetchSeq = 0;
    this._lyricsPresentationSeq = 0;
    this._lyricsEditRequestSeq = 0;
    this._playbackTrackResolutionSeq = 0;
    this._playbackTrackResolutionTimer = null;
    this.nextTrackUri = "";
    this._cleanupFloatingMenuOutsideClick = null;
    this.availableModes = [];
    this.styleVariables = {};
    this.fullscreenContainer = document.createElement("div");
    this.fullscreenContainer.id = "lyrics-fullscreen-container";
    this.fullscreenUsesPageUi = false;
    this.mousetrap = null;
    this.containerRef = react.createRef(null);
    this.translator = null;
    this.initMoustrap();
    // Cache last state
    this.languageOverride = CONFIG.visual["translate:detect-language-override"];
    // 트랙별 언어 오버라이드 (IndexedDB에서 로드)
    this.trackLanguageOverride = null;
    this.trackLyricsProviderOverride = null;
    this.trackBackgroundOverride = null;
    this.reRenderLyricsPage = false;
    this.displayMode = null;

    // Prevent infinite render loops
    this.lastProcessedUri = null;
    this.lastProcessedMode = null;

    // Requests are tracked per kind; pill timing and visual lifecycle are shared.
    this.lyricsLoadingTimer = null;
    this.phoneticLoadingTimer = null;
    this.translationLoadingTimer = null;
    this.culturalAnnotationsLoadingTimer = null;
    this._lyricsLoadingSeq = 0;
    this._phoneticLoadingSeq = 0;
    this._translationLoadingSeq = 0;
    this._culturalAnnotationsLoadingSeq = 0;
    this._activeLyricsLoadingTokens = new Set();
    this._activePhoneticLoadingTokens = new Set();
    this._activeTranslationLoadingTokens = new Set();
    this._activeCulturalAnnotationsLoadingTokens = new Set();
    this._lyricsLoadingHadFailure = false;
    this._phoneticLoadingHadFailure = false;
    this._translationLoadingHadFailure = false;
    this._culturalAnnotationsLoadingHadFailure = false;
    this._generationPillTimers = new Map();
    this._generationPillRevisions = new Map();
    this._generationRequestDetails = new Map();
    this._visibleGenerationPills = new Set();
    this._videoBackgroundLoadingTimer = null;
    this._pendingVideoBackgroundStatus = null;
    this._videoBackgroundStatusTrackUri = "";
    this.streamingApplyTimer = null;
    this.pendingStreamingPayload = null;
    this.floatingMenuCloseTimer = null;
    this._sharedPresentationKeys = new Map();
    this._invalidatedSharedPresentationSnapshots = new WeakSet();
    this._culturalAnnotationResults = new Map();
    this._culturalAnnotationRequests = new Map();
    this._culturalAnnotationCacheEpoch = 0;
    this._isComponentMounted = false;

    // Portrait viewport detection
    this._isPortraitViewport = typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(orientation: portrait)").matches
      : false;

    // Mouse idle timer for auto-hiding controls
    this.mouseIdleTimer = null;
    this.isMouseActive = true;

    // Mouse event handlers for auto-hide controls (defined here so ref can use them)
    this._handleMouseMove = () => {
      this.isMouseActive = true;
      const container = this.containerRef.current;
      if (container) {
        container.classList.remove('controls-hidden');
        container.classList.remove('ui-hidden');
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
          container.classList.add('ui-hidden');
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
        container.classList.add('ui-hidden');
      }
    };

    // Bind regenerate translation method
    this.regenerateTranslation = this.regenerateTranslation.bind(this);
    this.regenerateCulturalAnnotations = this.regenerateCulturalAnnotations.bind(this);
    this.handleRegenerateTranslationRequest = this.handleRegenerateTranslationRequest.bind(this);
    this.selectLyricsProviderForCurrentTrack = this.selectLyricsProviderForCurrentTrack.bind(this);
    this.selectBackgroundForCurrentTrack = this.selectBackgroundForCurrentTrack.bind(this);
    this.toggleFullscreenLyricsHidden = this.toggleFullscreenLyricsHidden.bind(this);
    this.importLocalLyricsFile = this.importLocalLyricsFile.bind(this);
    this.applyLocalLyrics = this.applyLocalLyrics.bind(this);
    this.applyLocalLyricsFromLrclibCandidate = this.applyLocalLyricsFromLrclibCandidate.bind(this);
    this.handleLyricsProviderAttempt = this.handleLyricsProviderAttempt.bind(this);
    this.handleVideoBackgroundLoadingChange = this.handleVideoBackgroundLoadingChange.bind(this);
  }

  shouldReduceMotion() {
    return CONFIG.visual["reduce-motion"] === true;
  }

  getMotionDurationMs() {
    return this.shouldReduceMotion() ? 24 : 280;
  }

  clearGenerationPillTimers(kind) {
    const timers = this._generationPillTimers.get(kind);
    if (!timers) return;

    if (timers.exitTimer) clearTimeout(timers.exitTimer);
    if (timers.removeTimer) clearTimeout(timers.removeTimer);
    this._generationPillTimers.delete(kind);
  }

  nextGenerationPillRevision(kind) {
    const nextRevision = (this._generationPillRevisions.get(kind) || 0) + 1;
    this._generationPillRevisions.set(kind, nextRevision);
    return nextRevision;
  }

  showGenerationPillLoading(kind, details = {}) {
    this.clearGenerationPillTimers(kind);
    const revision = this.nextGenerationPillRevision(kind);
    if (!this._isComponentMounted) return;
    this._visibleGenerationPills.add(kind);

    this.setState((previousState) => ({
      generationPills: {
        ...previousState.generationPills,
        [kind]: {
          phase: "loading",
          revision,
          label: details.label || "",
          description: details.description || "",
        },
      },
    }));
  }

  hideGenerationPill(kind) {
    this.clearGenerationPillTimers(kind);
    const revision = this.nextGenerationPillRevision(kind);
    this._visibleGenerationPills.delete(kind);
    if (!this._isComponentMounted) return;

    this.setState((previousState) => ({
      generationPills: {
        ...previousState.generationPills,
        [kind]: { phase: "idle", revision },
      },
    }));
  }

  completeGenerationPill(kind) {
    if (!this._visibleGenerationPills.has(kind)) {
      this.hideGenerationPill(kind);
      return;
    }

    this.clearGenerationPillTimers(kind);
    const revision = this.nextGenerationPillRevision(kind);
    if (!this._isComponentMounted) return;

    this.setState((previousState) => ({
      generationPills: {
        ...previousState.generationPills,
        [kind]: {
          ...previousState.generationPills?.[kind],
          phase: "complete",
          revision,
        },
      },
    }));

    const exitTimer = setTimeout(() => {
      if (
        !this._isComponentMounted ||
        this._generationPillRevisions.get(kind) !== revision
      ) {
        return;
      }

      this.setState((previousState) => {
        const current = previousState.generationPills?.[kind];
        if (!current || current.revision !== revision || current.phase !== "complete") {
          return null;
        }
        return {
          generationPills: {
            ...previousState.generationPills,
            [kind]: { ...current, phase: "exiting" },
          },
        };
      });
    }, GENERATION_PILL_TIMING.completeHoldMs);

    const removeTimer = setTimeout(() => {
      if (
        !this._isComponentMounted ||
        this._generationPillRevisions.get(kind) !== revision
      ) {
        return;
      }

      this._generationPillTimers.delete(kind);
      this._visibleGenerationPills.delete(kind);
      this.setState((previousState) => {
        const current = previousState.generationPills?.[kind];
        if (!current || current.revision !== revision) return null;
        return {
          generationPills: {
            ...previousState.generationPills,
            [kind]: { phase: "idle", revision },
          },
        };
      });
    }, GENERATION_PILL_TIMING.completeHoldMs + GENERATION_PILL_TIMING.exitMs);

    this._generationPillTimers.set(kind, { revision, exitTimer, removeTimer });
  }

  clearVideoBackgroundLoadingDelay() {
    if (this._videoBackgroundLoadingTimer) {
      clearTimeout(this._videoBackgroundLoadingTimer);
      this._videoBackgroundLoadingTimer = null;
    }
    this._pendingVideoBackgroundStatus = null;
  }

  handleVideoBackgroundLoadingChange(status) {
    if (!this._isComponentMounted) return;

    const normalizedStatus = typeof status === "boolean"
      ? { phase: status ? "loading" : "idle" }
      : (status || { phase: "idle" });
    const statusTrackUri = normalizedStatus.trackUri || "";
    const currentTrackUri = this.currentTrackUri || this.state.uri || "";
    const isTrackedVideoCleanup = normalizedStatus.phase === "idle" &&
      !!statusTrackUri &&
      statusTrackUri === this._videoBackgroundStatusTrackUri;
    if (
      statusTrackUri &&
      currentTrackUri &&
      statusTrackUri !== currentTrackUri &&
      !isTrackedVideoCleanup
    ) {
      return;
    }

    if (isTrackedVideoCleanup && statusTrackUri !== currentTrackUri) {
      this.clearVideoBackgroundLoadingDelay();
      this._videoBackgroundStatusTrackUri = "";
      this.hideGenerationPill("video-background");
      return;
    }

    const effectiveTrackUri = statusTrackUri || currentTrackUri;

    if (normalizedStatus.phase === "loading") {
      const isNewTrack = !!effectiveTrackUri &&
        !!this._videoBackgroundStatusTrackUri &&
        effectiveTrackUri !== this._videoBackgroundStatusTrackUri;
      if (isNewTrack) {
        this.clearVideoBackgroundLoadingDelay();
        this.hideGenerationPill("video-background");
      }
      this._videoBackgroundStatusTrackUri = effectiveTrackUri;
      this._pendingVideoBackgroundStatus = {
        ...normalizedStatus,
        trackUri: effectiveTrackUri,
      };

      const currentPhase = this.state.generationPills?.["video-background"]?.phase;
      if (
        this._visibleGenerationPills.has("video-background") &&
        currentPhase === "loading"
      ) {
        this.showGenerationPillLoading("video-background", {
          label: normalizedStatus.label,
          description: normalizedStatus.description,
        });
        return;
      }

      if (this._visibleGenerationPills.has("video-background")) {
        this.hideGenerationPill("video-background");
      }
      if (!this._videoBackgroundLoadingTimer) {
        this._videoBackgroundLoadingTimer = setTimeout(() => {
          this._videoBackgroundLoadingTimer = null;
          const pendingStatus = this._pendingVideoBackgroundStatus;
          if (!pendingStatus || !this._isComponentMounted) return;

          const latestTrackUri = this.currentTrackUri || this.state.uri || "";
          if (
            pendingStatus.trackUri &&
            latestTrackUri &&
            pendingStatus.trackUri !== latestTrackUri
          ) {
            this._pendingVideoBackgroundStatus = null;
            return;
          }

          this.showGenerationPillLoading("video-background", {
            label: pendingStatus.label,
            description: pendingStatus.description,
          });
        }, GENERATION_PILL_TIMING.loadingDelayMs);
      }
      return;
    }

    this.clearVideoBackgroundLoadingDelay();
    if (normalizedStatus.phase === "complete") {
      if (this._visibleGenerationPills.has("video-background")) {
        this.completeGenerationPill("video-background");
      } else {
        this.hideGenerationPill("video-background");
      }
      return;
    }

    this._videoBackgroundStatusTrackUri = effectiveTrackUri;
    this.hideGenerationPill("video-background");
  }

  getFloatingMenuContentTopOffset() {
    if (!this.state?.isFullscreen || typeof document === "undefined") {
      return 0;
    }

    const isBrowserFullscreen =
      CONFIG.visual["fullscreen-browser-fullscreen"] === true ||
      !!document.fullscreenElement;
    return isBrowserFullscreen ? 0 : 130;
  }

  isShortcutInputFocused() {
    const activeElement = document.activeElement;
    const tagName = activeElement?.tagName?.toLowerCase();
    return (
      tagName === "input" ||
      tagName === "textarea" ||
      tagName === "select" ||
      activeElement?.isContentEditable
    );
  }

  toggleFullscreenLyricsHidden() {
    if (!this.state.isFullscreen) {
      return;
    }

    this.setState((prevState) => ({
      fullscreenLyricsHidden: !prevState.fullscreenLyricsHidden,
    }));
  }

  clearFloatingMenuCloseTimer() {
    if (this.floatingMenuCloseTimer) {
      clearTimeout(this.floatingMenuCloseTimer);
      this.floatingMenuCloseTimer = null;
    }
  }

  resetFloatingMenuScroll() {
    const reset = () => {
      if (this.floatingMenuContentRef) {
        this.floatingMenuContentRef.scrollTop = 0;
      }
    };
    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(reset);
    } else {
      setTimeout(reset, 0);
    }
  }

  openFloatingMenu() {
    this.clearFloatingMenuCloseTimer();
    this.setState({
      isFloatingMenuOpen: true,
      isFloatingMenuClosing: false,
    }, () => this.resetFloatingMenuScroll());
  }

  closeFloatingMenu() {
    if (!this.state.isFloatingMenuOpen && !this.state.isFloatingMenuClosing) {
      return;
    }

    this.clearFloatingMenuCloseTimer();
    this.setState({
      isFloatingMenuOpen: false,
      isFloatingMenuClosing: true,
    });

    this.floatingMenuCloseTimer = setTimeout(() => {
      this.setState({ isFloatingMenuClosing: false });
      this.floatingMenuCloseTimer = null;
    }, this.getMotionDurationMs());
  }

  toggleFloatingMenu() {
    if (this.state.isFloatingMenuOpen) {
      this.closeFloatingMenu();
      return;
    }

    this.openFloatingMenu();
  }

  getTranslationTargetLanguage() {
    const targetLanguage =
      window.CONFIG?.visual?.["translate:target-language"] ||
      localStorage.getItem("ivLyrics:visual:translate:target-language");

    if (targetLanguage && targetLanguage !== "auto") {
      return targetLanguage;
    }

    return (
      window.I18n?.getCurrentLanguage?.() ||
      Spicetify.Locale?.getLocale?.()?.split("-")[0] ||
      "en"
    );
  }

  isCulturalAnnotationsEnabled() {
    const value = CONFIG.visual["cultural-annotations-enabled"];
    return value === true || value === "true";
  }

  getCulturalAnnotationSourceLines(lyrics) {
    return buildTranslationLineRequests(lyrics, { splitVocalParts: false })
      .map(({ lineIndex, text }) => ({ lineIndex, text }));
  }

  getCurrentCulturalAnnotationLyrics() {
    const currentMode = this.getCurrentMode();
    if (isKaraokeRenderMode(currentMode) && Array.isArray(this.state.karaoke)) {
      return this.state.karaoke;
    }
    if (currentMode === SYNCED && Array.isArray(this.state.synced)) {
      return this.state.synced;
    }
    if (currentMode === UNSYNCED && Array.isArray(this.state.unsynced)) {
      return this.state.unsynced;
    }
    return Array.isArray(this.state.currentLyrics) ? this.state.currentLyrics : [];
  }

  clearCulturalAnnotationsForTrack(uri, { updateState = false } = {}) {
    if (!uri) return;

    this._culturalAnnotationCacheEpoch += 1;
    this._culturalAnnotationResults.delete(uri);
    for (const requestKey of this._culturalAnnotationRequests.keys()) {
      if (requestKey.startsWith(`${uri}:`)) {
        this._culturalAnnotationRequests.delete(requestKey);
      }
    }
    this.clearCulturalAnnotationsLoading();

    if (updateState && this._isComponentMounted && this.state.uri === uri) {
      this.setState(state => ({
        currentLyrics: this.applyCulturalAnnotations(state.currentLyrics, uri),
      }));
    }
  }

  clearAllCulturalAnnotations({ updateState = false } = {}) {
    this._culturalAnnotationCacheEpoch += 1;
    this._culturalAnnotationResults.clear();
    this._culturalAnnotationRequests.clear();
    this.clearCulturalAnnotationsLoading();

    if (updateState && this._isComponentMounted) {
      this.setState(state => ({
        currentLyrics: this.applyCulturalAnnotations(state.currentLyrics, state.uri),
      }));
    }
  }

  applyCulturalAnnotations(lyrics, uri = this.state.uri) {
    if (!Array.isArray(lyrics)) return [];

    const result = this.isCulturalAnnotationsEnabled()
      ? this._culturalAnnotationResults.get(uri)
      : null;
    const notesByIndex = result?.notesByIndex || null;

    return lyrics.map((line, index) => {
      if (!line || typeof line !== "object") return line;
      const note = notesByIndex?.get(index) || null;
      if (note) {
        return line.culturalNote === note ? line : { ...line, culturalNote: note };
      }
      if (!line.culturalNote) return line;
      const { culturalNote: _ignoredCulturalNote, ...lineWithoutCulturalNote } = line;
      return lineWithoutCulturalNote;
    });
  }

  requestCulturalAnnotations({
    lyricsState,
    lyrics,
    sourceLang,
    uri,
    ignoreCache = false,
    notifyOnError = true,
  }) {
    if (!this.isCulturalAnnotationsEnabled() || !window.Translator?.generateCulturalAnnotations) {
      return Promise.resolve(null);
    }

    const lines = this.getCulturalAnnotationSourceLines(lyrics);
    if (lines.length === 0) return Promise.resolve(null);

    const targetLang = this.getTranslationTargetLanguage();
    const sourceSignature = getTranslationSourceCacheHash(JSON.stringify(lines));
    const schemaVersion = 4;
    const resultKey = `v${schemaVersion}:${sourceLang || "auto"}:${targetLang}:${sourceSignature}`;
    if (!ignoreCache && this._culturalAnnotationResults.get(uri)?.key === resultKey) {
      return Promise.resolve(this._culturalAnnotationResults.get(uri));
    }

    const requestKey = `${uri}:${resultKey}`;
    if (!ignoreCache && this._culturalAnnotationRequests.has(requestKey)) {
      return this._culturalAnnotationRequests.get(requestKey);
    }

    const requestEpoch = this._culturalAnnotationCacheEpoch;
    const culturalAnnotationLabel =
      I18n.t("generationStatus.culturalAnnotations") || "문화적 설명";
    const culturalAnnotationLoadingDescription =
      I18n.t("generationStatus.culturalAnnotationsLoading") ||
      "문화적 설명을 생성하는 중...";
    const loadingToken = this.startCulturalAnnotationsLoading({
      label: culturalAnnotationLabel,
      description: culturalAnnotationLoadingDescription,
    });
    let completed = false;
    const request = window.Translator.generateCulturalAnnotations({
      trackId: Utils.extractTrackId(uri) || uri,
      title: lyricsState.title || this.state.title,
      artist: lyricsState.artist || this.state.artist,
      lines,
      sourceLang: sourceLang || "auto",
      schemaVersion,
      ignoreCache,
      onProviderLoading: ({ providerId, providerName }) => {
        const providerLabel = String(providerName || providerId || "").trim();
        if (!providerLabel) return;
        this.updateGenerationRequestLoading("cultural-annotations", {
          description: `${culturalAnnotationLoadingDescription}: ${providerLabel}`,
        });
      },
    }).then((result) => {
      if (requestEpoch !== this._culturalAnnotationCacheEpoch) {
        return null;
      }
      const notesByIndex = new Map();
      for (const annotation of Array.isArray(result?.annotations) ? result.annotations : []) {
        const lineIndex = Number(annotation.lineIndex);
        const expression = String(annotation.expression || "").trim();
        const note = String(annotation.note || "").trim();
        if (!Number.isInteger(lineIndex) || !expression || !note) continue;

        const lineAnnotations = notesByIndex.get(lineIndex) || [];
        lineAnnotations.push({
          marker: lineAnnotations.length + 1,
          expression,
          note,
        });
        notesByIndex.set(lineIndex, lineAnnotations);
      }
      this._culturalAnnotationResults.set(uri, {
        key: resultKey,
        notesByIndex,
        provider: result?.provider || null,
      });
      completed = true;

      if (this._isComponentMounted && this.state.uri === uri) {
        this.setState(state => ({
          currentLyrics: this.applyCulturalAnnotations(state.currentLyrics, uri),
        }));
      }
      return result;
    }).catch((error) => {
      if (requestEpoch !== this._culturalAnnotationCacheEpoch) {
        return null;
      }
      console.warn("[ivLyrics] Cultural annotation request failed:", error);
      if (notifyOnError && this._isComponentMounted && this.state.uri === uri) {
        Toast.error(
          `${I18n.t("notifications.culturalAnnotationsFailed") || "문화적 배경 설명을 불러오지 못했습니다."} ${error?.message || ""}`.trim()
        );
      }
      return null;
    }).finally(() => {
      if (this._culturalAnnotationRequests.get(requestKey) === request) {
        this._culturalAnnotationRequests.delete(requestKey);
      }
      this.clearCulturalAnnotationsLoading(loadingToken, { completed });
    });

    this._culturalAnnotationRequests.set(requestKey, request);
    return request;
  }

  getEditingBaseLyrics() {
    const currentMode = this.getCurrentMode();

    if (isKaraokeRenderMode(currentMode) && Array.isArray(this.state.karaoke)) {
      return this.state.karaoke;
    }
    if (currentMode === SYNCED && Array.isArray(this.state.synced)) {
      return this.state.synced;
    }
    if (currentMode === UNSYNCED && Array.isArray(this.state.unsynced)) {
      return this.state.unsynced;
    }

    return this.resolveLyricsForMode(this.state, currentMode) || [];
  }

  getEditableCacheSourceLines() {
    return buildTranslationLineRequests(this.getEditingBaseLyrics())
      .map((request) => request.text);
  }

  getCacheEditorResultLines(cache, isPhonetic) {
    const value = isPhonetic
      ? cache?.phonetic
      : (cache?.translation ?? cache?.vi);

    if (Array.isArray(value)) {
      return value.map((line) => String(line ?? ""));
    }
    if (typeof value === "string") {
      return value.replace(/\r\n?/g, "\n").split("\n");
    }
    return null;
  }

  mapLegacyCacheLinesToEditor(lines, baseLyrics, sourceRequests) {
    const legacyRequests = buildTranslationLineRequests(baseLyrics, {
      splitVocalParts: false,
    });
    if (!Array.isArray(lines) || lines.length !== legacyRequests.length) {
      return null;
    }

    const firstEditorIndexByLine = new Map();
    sourceRequests.forEach((request, index) => {
      if (!firstEditorIndexByLine.has(request.lineIndex)) {
        firstEditorIndexByLine.set(request.lineIndex, index);
      }
    });

    const editorLines = Array.from({ length: sourceRequests.length }, () => "");
    legacyRequests.forEach((request, index) => {
      const editorIndex = firstEditorIndexByLine.get(request.lineIndex);
      if (editorIndex !== undefined) {
        editorLines[editorIndex] = String(lines[index] ?? "");
      }
    });
    return editorLines;
  }

  async getCacheEditorTranslation({
    trackId,
    targetLanguage,
    isPhonetic,
    provider,
    baseLyrics,
    sourceRequests,
  }) {
    const sourceText = sourceRequests.map((request) => request.text).join("\n");
    const legacyText = getLegacyNonSectionLyricsText(baseLyrics);
    const sourceHash = getTranslationResultCacheHash(sourceText, isPhonetic);
    const legacyHash = getTranslationResultCacheHash(legacyText, isPhonetic);
    const plainSourceHash = getTranslationSourceCacheHash(sourceText);
    const plainLegacyHash = getTranslationSourceCacheHash(legacyText);
    const providers = provider ? [provider, null] : [null];
    const candidates = [];
    const seen = new Set();
    const addCandidate = (candidateProvider, hash, splitVocalParts) => {
      const key = `${candidateProvider || ""}:${hash || ""}:${splitVocalParts}`;
      if (seen.has(key)) return;
      seen.add(key);
      candidates.push({ provider: candidateProvider, hash, splitVocalParts });
    };

    providers.forEach((candidateProvider) =>
      addCandidate(candidateProvider, sourceHash, true)
    );
    // Recover entries saved by older cache editors that did not include the
    // pronunciation notation or translation style in the key.
    providers.forEach((candidateProvider) =>
      addCandidate(candidateProvider, plainSourceHash, true)
    );
    providers.forEach((candidateProvider) =>
      addCandidate(candidateProvider, legacyHash, false)
    );
    providers.forEach((candidateProvider) =>
      addCandidate(candidateProvider, plainLegacyHash, false)
    );
    providers.forEach((candidateProvider) =>
      addCandidate(candidateProvider, null, false)
    );

    for (const candidate of candidates) {
      const cache = await LyricsCache.getTranslation(
        trackId,
        targetLanguage,
        isPhonetic,
        candidate.provider,
        candidate.hash
      );
      const cacheLines = this.getCacheEditorResultLines(cache, isPhonetic);
      if (!cacheLines?.some((line) => line.trim() !== "")) {
        continue;
      }

      if (candidate.splitVocalParts) {
        if (cacheLines.length === sourceRequests.length) {
          return cacheLines;
        }
        continue;
      }

      const mappedLines = this.mapLegacyCacheLinesToEditor(
        cacheLines,
        baseLyrics,
        sourceRequests
      );
      if (mappedLines) {
        return mappedLines;
      }
    }

    return [];
  }

  buildCacheEditorText(lines, expectedCount) {
    const safeLines = Array.isArray(lines) ? lines : [];
    const normalizedLines = Array.from({ length: expectedCount }, (_, index) => {
      const line = safeLines[index];
      return typeof line === "string" ? line : String(line ?? "");
    });
    return normalizedLines.join("\n");
  }

  normalizeCacheEditorLines(text, expectedCount) {
    const normalizedText = String(text ?? "").replace(/\r\n?/g, "\n");
    const lines = normalizedText.split("\n");

    if (lines.length > expectedCount) {
      return null;
    }

    while (lines.length < expectedCount) {
      lines.push("");
    }

    return lines;
  }

  closeLyricsEditModal({ force = false } = {}) {
    if (this.state.isLyricsEditSaving && !force) {
      return;
    }

    this._lyricsEditRequestSeq += 1;

    this.setState({
      isLyricsEditModalOpen: false,
      isLyricsEditLoading: false,
      isLyricsEditSaving: false,
      lyricsEditError: "",
    });
  }

  async openLyricsEditModal() {
    const baseLyrics = this.getEditingBaseLyrics();
    const sourceRequests = buildTranslationLineRequests(baseLyrics);
    const sourceLines = sourceRequests.map((request) => request.text);
    const sourceText = sourceLines.join("\n");
    const trackUri = this.state.uri;
    const trackId = Utils.extractTrackId(trackUri);

    if (!trackId || sourceLines.length === 0) {
      Toast.error(I18n.t("notifications.noLyricsLoaded"));
      return;
    }

    const userLang = this.getTranslationTargetLanguage();
    const provider = this.state.provider || null;
    const requestSeq = ++this._lyricsEditRequestSeq;

    this.setState({
      isLyricsEditModalOpen: true,
      isLyricsEditLoading: true,
      isLyricsEditSaving: false,
      lyricsEditOriginalLines: sourceLines,
      lyricsEditPronunciationText: "",
      lyricsEditTranslationText: "",
      lyricsEditPronunciationSourceHash: getTranslationResultCacheHash(
        sourceText,
        true
      ),
      lyricsEditTranslationSourceHash: getTranslationResultCacheHash(
        sourceText,
        false
      ),
      lyricsEditTrackUri: trackUri,
      lyricsEditProvider: provider,
      lyricsEditTargetLanguage: userLang,
      lyricsEditHasPronunciationCache: false,
      lyricsEditHasTranslationCache: false,
      lyricsEditError: "",
    });

    try {
      const [phoneticLines, translationLines] = await Promise.all([
        this.getCacheEditorTranslation({
          trackId,
          targetLanguage: userLang,
          isPhonetic: true,
          provider,
          baseLyrics,
          sourceRequests,
        }),
        this.getCacheEditorTranslation({
          trackId,
          targetLanguage: userLang,
          isPhonetic: false,
          provider,
          baseLyrics,
          sourceRequests,
        }),
      ]);

      if (
        !this._isComponentMounted ||
        requestSeq !== this._lyricsEditRequestSeq ||
        !this.state.isLyricsEditModalOpen ||
        this.state.uri !== trackUri
      ) {
        return;
      }

      this.setState({
        isLyricsEditLoading: false,
        lyricsEditPronunciationText: this.buildCacheEditorText(
          phoneticLines,
          sourceLines.length
        ),
        lyricsEditTranslationText: this.buildCacheEditorText(
          translationLines,
          sourceLines.length
        ),
        lyricsEditHasPronunciationCache: phoneticLines.some(
          (line) => String(line ?? "").trim() !== ""
        ),
        lyricsEditHasTranslationCache: translationLines.some(
          (line) => String(line ?? "").trim() !== ""
        ),
      });
    } catch (error) {
      if (
        !this._isComponentMounted ||
        requestSeq !== this._lyricsEditRequestSeq ||
        this.state.uri !== trackUri
      ) {
        return;
      }
      this.setState({
        isLyricsEditLoading: false,
        lyricsEditError: I18n.t("lyricsCacheEditor.loadFailed"),
      });
    }
  }

  invalidateSharedLyricsPresentation(trackUri) {
    if (!trackUri) return;
    const snapshot = window.LyricsService?.getLyricsSnapshot?.(trackUri) || null;
    if (snapshot) {
      this._invalidatedSharedPresentationSnapshots?.add(snapshot);
    }
    this._sharedPresentationKeys?.delete(trackUri);
    window.LyricsService?.clearLyricsPresentationSnapshot?.(trackUri);
  }

  refreshLyricsAfterCacheEdit() {
    const trackUri = this.state.uri;
    if (trackUri) {
      CacheManager.clearByUri(trackUri);
      if (this._dmResults?.[trackUri]) {
        delete this._dmResults[trackUri];
      }
    }

    const trackId = Utils.extractTrackId(trackUri);
    if (trackId) {
      window.Translator?.clearMemoryCache?.(trackId);
      window.Translator?.clearInflightRequests?.(trackId);
    }

    this.invalidateSharedLyricsPresentation(trackUri);
    this.lastProcessedMode = null;
    this.lyricsSource(this.state, this.getCurrentMode());
  }

  async saveLyricsEditModal() {
    if (this.state.isLyricsEditLoading || this.state.isLyricsEditSaving) {
      return;
    }

    const expectedLineCount = this.state.lyricsEditOriginalLines.length;
    const pronunciationLines = this.normalizeCacheEditorLines(
      this.state.lyricsEditPronunciationText,
      expectedLineCount
    );
    const translationLines = this.normalizeCacheEditorLines(
      this.state.lyricsEditTranslationText,
      expectedLineCount
    );

    if (!pronunciationLines || !translationLines) {
      this.setState({
        lyricsEditError: I18n.t("lyricsCacheEditor.lineOverflow"),
      });
      return;
    }

    const editorTrackUri = this.state.lyricsEditTrackUri || this.state.uri;
    const trackId = Utils.extractTrackId(editorTrackUri);
    if (!trackId) {
      this.setState({
        lyricsEditError: I18n.t("lyricsCacheEditor.trackMissing"),
      });
      return;
    }

    const userLang =
      this.state.lyricsEditTargetLanguage || this.getTranslationTargetLanguage();
    const provider = this.state.lyricsEditProvider ?? this.state.provider ?? null;
    const pronunciationSourceHash =
      this.state.lyricsEditPronunciationSourceHash ||
      getTranslationResultCacheHash(
        getNonSectionLyricsText(this.getEditingBaseLyrics()),
        true
      );
    const translationSourceHash =
      this.state.lyricsEditTranslationSourceHash ||
      getTranslationResultCacheHash(
        getNonSectionLyricsText(this.getEditingBaseLyrics()),
        false
      );
    const requestSeq = this._lyricsEditRequestSeq;

    this.setState({
      isLyricsEditSaving: true,
      lyricsEditError: "",
    });

    try {
      await Promise.all([
        LyricsCache.setTranslation(
          trackId,
          userLang,
          true,
          { phonetic: pronunciationLines },
          provider,
          pronunciationSourceHash
        ),
        LyricsCache.setTranslation(
          trackId,
          userLang,
          false,
          { translation: translationLines },
          provider,
          translationSourceHash
        ),
      ]);

      if (
        !this._isComponentMounted ||
        requestSeq !== this._lyricsEditRequestSeq ||
        this.state.uri !== editorTrackUri
      ) {
        return;
      }

      this.setState({
        isLyricsEditModalOpen: false,
        isLyricsEditSaving: false,
        lyricsEditHasPronunciationCache: pronunciationLines.some(
          (line) => String(line ?? "").trim() !== ""
        ),
        lyricsEditHasTranslationCache: translationLines.some(
          (line) => String(line ?? "").trim() !== ""
        ),
        lyricsEditError: "",
      });

      this.refreshLyricsAfterCacheEdit();
      Toast.success(I18n.t("lyricsCacheEditor.saved"));
    } catch (error) {
      this.setState({
        isLyricsEditSaving: false,
        lyricsEditError: I18n.t("lyricsCacheEditor.saveFailed"),
      });
    }
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

    const trackId = Utils.extractTrackId(uri);
    if (!trackId || !title || !artist) {
      return;
    }

    const loadingToken = this.startTranslationLoading();
    let completed = false;

    try {
      const result = await window.Translator.translateMetadata({
        trackId,
        title,
        artist,
        ignoreCache: false,
      });

      // 현재 트랙이 여전히 같은지 확인
      if (this.currentTrackUri === uri && result) {
        completed = true;
        this.setState({ translatedMetadata: result });

        // 오버레이로 번역된 메타데이터 전송
        if (window.OverlaySender?.sendTranslatedMetadata) {
          window.OverlaySender.sendTranslatedMetadata(result);
        }
      }
    } catch (error) {
      console.warn('[ivLyrics] Metadata translation failed:', error);
    } finally {
      this.clearTranslationLoading(loadingToken, { completed });
    }
  }

  isCurrentLyricsUri(uri) {
    return !!uri && this.currentTrackUri === uri;
  }

  isCurrentLyricsState(lyricsState) {
    if (!lyricsState?.uri || !this.isCurrentLyricsUri(lyricsState.uri)) {
      return false;
    }

    const requestSeq = lyricsState.lyricsRequestSeq;
    return !requestSeq || requestSeq === this._activeLyricsFetchSeq;
  }

  clearPendingLyricsUpdates() {
    if (this.streamingApplyTimer) {
      clearTimeout(this.streamingApplyTimer);
      this.streamingApplyTimer = null;
    }
    this.pendingStreamingPayload = null;
    this.clearLyricsLoading();
    this.clearPhoneticLoading();
    this.clearTranslationLoading();
    this.clearCulturalAnnotationsLoading();
  }

  getLoadingLyricsState(info, requestSeq) {
    return {
      ...emptyState,
      uri: info?.uri || "",
      lyricsRequestSeq: requestSeq || 0,
      provider: "",
      contributors: null,
      currentLyrics: [],
      language: null,
      translatedMetadata: null,
      trackLyricsProviderOverride: null,
      trackBackgroundOverride: null,
      isLoading: true,
      isCached: false,
      error: null,
      artist: info?.artist || "",
      title: info?.title || "",
      coverUrl: info?.image || "",
      currentLyricIndex: 0,
    };
  }

  /**
   * 저장된 선택 영상 로드 (IndexedDB에서)
   * @param {string} trackUri - 트랙 URI
   */
  async loadSavedVideoForTrack(trackUri) {
    if (!trackUri) return;
    if (CONFIG.visual["community-video-random"] === true) return;

    try {
      const savedVideo = await Utils.getSelectedVideo(trackUri);
      if (this.currentTrackUri !== trackUri) {
        return;
      }
      if (savedVideo && savedVideo.youtubeVideoId) {
        let selectedVideo = savedVideo;
        if (
          CONFIG.visual["community-video-hide-disliked"] !== false &&
          savedVideo.communityEntryId
        ) {
          const resolution = await Utils.resolveHiddenCommunityVideo(
            trackUri,
            savedVideo,
            true
          );
          if (this.currentTrackUri !== trackUri) return;
          if (resolution.hidden) {
            if (resolution.replacement?.youtubeVideoId) {
              selectedVideo = resolution.replacement;
              await Utils.saveSelectedVideo(trackUri, selectedVideo);
            } else {
              await Utils.removeSelectedVideo(trackUri);
              this.setState({
                videoInfo: {
                  suppressVideoBackground: true,
                  reason: "no-visible-community-video",
                },
              });
              return;
            }
          }
        }

        ivLyricsDebug(`[ivLyrics] Loading saved video for track: ${selectedVideo.youtubeVideoId}`);
        this.setState({
          videoInfo: {
            youtubeVideoId: selectedVideo.youtubeVideoId,
            youtubeTitle: selectedVideo.youtubeTitle,
            captionStartTime: selectedVideo.captionStartTime,
            skipSegments: Utils.normalizeVideoSkipSegments(selectedVideo.skipSegments),
            communityEntryId: selectedVideo.communityEntryId,
            isAutoGenerated: selectedVideo.isAutoGenerated
          }
        });
      }
    } catch (error) {
      console.error('[ivLyrics] Failed to load saved video:', error);
    }
  }

  startGenerationRequestLoading(kind, details = {}) {
    const config = GENERATION_REQUEST_PILL_CONFIG[kind];
    if (!config) return null;

    const activeTokens = this[config.tokensKey];
    if (activeTokens.size === 0) {
      this[config.failureKey] = false;
      this._generationRequestDetails.delete(kind);
      this.hideGenerationPill(kind);
    }

    if (details && Object.keys(details).length > 0) {
      this._generationRequestDetails.set(kind, { ...details });
    }

    this[config.sequenceKey] += 1;
    const token = this[config.sequenceKey];
    activeTokens.add(token);

    if (this[config.timerKey]) {
      clearTimeout(this[config.timerKey]);
    }
    const showLoading = () => {
      this[config.timerKey] = null;
      if (activeTokens.size > 0 && this._isComponentMounted) {
        if (config.loadingStateKey) {
          this.setState({ [config.loadingStateKey]: true });
        }
        this.showGenerationPillLoading(
          kind,
          this._generationRequestDetails.get(kind) || {}
        );
      }
    };
    const loadingDelayMs = Number.isFinite(config.loadingDelayMs)
      ? Math.max(0, config.loadingDelayMs)
      : GENERATION_PILL_TIMING.loadingDelayMs;
    if (loadingDelayMs === 0) {
      showLoading();
    } else {
      this[config.timerKey] = setTimeout(showLoading, loadingDelayMs);
    }

    return token;
  }

  updateGenerationRequestLoading(kind, details = {}) {
    const config = GENERATION_REQUEST_PILL_CONFIG[kind];
    if (!config || this[config.tokensKey].size === 0) return;

    const nextDetails = {
      ...(this._generationRequestDetails.get(kind) || {}),
      ...details,
    };
    this._generationRequestDetails.set(kind, nextDetails);

    if (this._visibleGenerationPills.has(kind) && this._isComponentMounted) {
      this.showGenerationPillLoading(kind, nextDetails);
    }
  }

  clearGenerationRequestLoading(kind, token = null, { completed = false } = {}) {
    const config = GENERATION_REQUEST_PILL_CONFIG[kind];
    if (!config) return;

    const activeTokens = this[config.tokensKey];
    if (token !== null && !activeTokens.has(token)) return;

    if (token === null) {
      activeTokens.clear();
    } else {
      activeTokens.delete(token);
    }
    if (!completed) this[config.failureKey] = true;

    if (activeTokens.size === 0 && this[config.timerKey]) {
      clearTimeout(this[config.timerKey]);
      this[config.timerKey] = null;
    }

    if (activeTokens.size !== 0) return;

    const shouldComplete =
      completed &&
      !this[config.failureKey] &&
      this._visibleGenerationPills.has(kind);
    this[config.failureKey] = false;
    this._generationRequestDetails.delete(kind);
    if (this._isComponentMounted && config.loadingStateKey) {
      this.setState({ [config.loadingStateKey]: false });
    }
    if (shouldComplete) {
      this.completeGenerationPill(kind);
    } else {
      this.hideGenerationPill(kind);
    }
  }

  startLyricsLoading() {
    this._generationRequestDetails.delete("lyrics");
    if (
      this._activeLyricsLoadingTokens.size > 0 &&
      this._visibleGenerationPills.has("lyrics")
    ) {
      this.showGenerationPillLoading("lyrics");
    }
    return this.startGenerationRequestLoading("lyrics");
  }

  handleLyricsProviderAttempt(detail = {}) {
    if (this._activeLyricsLoadingTokens.size === 0) return;

    const requestUri = String(detail.uri || "");
    if (requestUri && requestUri !== this.currentTrackUri) return;

    const providerName = String(detail.providerName || detail.providerId || "").trim();
    if (!providerName) return;

    const loadingDescription = String(
      I18n.t("syncCreator.loadingLyrics") || "가사를 불러오는 중..."
    ).replace(/\s*[.…]+$/u, "");
    const lyricsType = String(detail.lyricsType || "").trim();
    const lyricsTypeLabel = lyricsType
      ? String(
        I18n.t(`settings.lyricsProviders.types.${lyricsType}`) || lyricsType
      ).trim()
      : "";
    this.updateGenerationRequestLoading("lyrics", {
      label: providerName,
      description: lyricsTypeLabel
        ? `${lyricsTypeLabel} · ${loadingDescription}`
        : `${loadingDescription}: ${providerName}`,
    });
  }

  clearLyricsLoading(token = null, options = {}) {
    this.clearGenerationRequestLoading("lyrics", token, options);
  }

  startPhoneticLoading() {
    return this.startGenerationRequestLoading("pronunciation");
  }

  clearPhoneticLoading(token = null, options = {}) {
    this.clearGenerationRequestLoading("pronunciation", token, options);
  }

  startTranslationLoading() {
    return this.startGenerationRequestLoading("translation");
  }

  clearTranslationLoading(token = null, options = {}) {
    this.clearGenerationRequestLoading("translation", token, options);
  }

  startCulturalAnnotationsLoading(details = {}) {
    return this.startGenerationRequestLoading("cultural-annotations", details);
  }

  clearCulturalAnnotationsLoading(token = null, options = {}) {
    this.clearGenerationRequestLoading("cultural-annotations", token, options);
  }

  publishLyricsPresentation(lyrics, context = {}) {
    const publisher = window.ivLyricsPresentationPublisher;
    if (!publisher?.publishLyricsReady) {
      throw new Error("LyricsPresentationPublisher is not loaded");
    }

    const {
      uri = this.state.uri,
      provider = this.state.provider || null,
      karaokeSource = this.state.karaokeSource || null,
      mode = this.getCurrentMode(),
      lyricsType = getLyricsModeTypeKey(mode),
      displayMode1 = null,
      displayMode2 = null,
      detectedLanguage = null,
      translationTargetLanguage = this.getTranslationTargetLanguage(),
      pronunciationNotation = getCurrentLyricsPronunciationNotation(),
      translationSourceLyrics = null,
      translationSourceText,
      presentationComplete = true,
    } = context;

    const payload = {
      trackInfo: {
        uri,
        title: this.state.title,
        artist: this.state.artist,
      },
      lyrics,
      provider,
      karaokeSource,
      lyricsType,
      displayMode1,
      displayMode2,
      detectedLanguage,
      translationTargetLanguage,
      pronunciationNotation,
      presentationComplete,
    };

    if (translationSourceText !== undefined) {
      payload.translationSourceText = translationSourceText;
    } else if (Array.isArray(translationSourceLyrics)) {
      payload.translationSourceText = getNonSectionLyricsText(translationSourceLyrics);
    }

    return publisher.publishLyricsReady(payload);
  }

  applyStreamingTranslation({
    uri,
    presentationSeq = null,
    lyrics,
    lyricsMode1,
    lyricsMode2,
    displayMode1,
    displayMode2,
  }) {
    this.pendingStreamingPayload = {
      uri,
      presentationSeq,
      lyrics,
      lyricsMode1,
      lyricsMode2,
      displayMode1,
      displayMode2,
    };

    if (this.streamingApplyTimer) {
      return;
    }

    this.streamingApplyTimer = setTimeout(() => {
      this.streamingApplyTimer = null;
      const payload = this.pendingStreamingPayload;
      this.pendingStreamingPayload = null;
      if (
        !payload ||
        !this.isCurrentLyricsUri(payload.uri) ||
        (payload.presentationSeq !== null && payload.presentationSeq !== this._lyricsPresentationSeq)
      ) {
        return;
      }

      const optimizedTranslations = this.optimizeTranslations(
        payload.lyrics,
        payload.lyricsMode1,
        payload.lyricsMode2,
        payload.lyricsMode1 ? payload.displayMode1 : null,
        payload.lyricsMode2 ? payload.displayMode2 : null
      );
      const finalLyrics = Array.isArray(optimizedTranslations)
        ? optimizedTranslations
        : [];

      this.setState({
        currentLyrics: finalLyrics,
      });

      this.publishLyricsPresentation(finalLyrics, {
        uri: payload.uri,
        displayMode1: payload.displayMode1,
        displayMode2: payload.displayMode2,
        detectedLanguage: this.provideLanguageCode(payload.lyrics),
        translationSourceLyrics: payload.lyrics,
        presentationComplete: false,
      });
    }, 50);
  }

  /**
   * 번역 재생성 메서드 - ignore_cache를 true로 설정하여 새로운 번역 요청
   */
  getRegenerationTargets() {
    const provider = CONFIG.visual["translate:translated-lyrics-source"];

    if (!provider || provider === "none") {
      return {
        provider,
        mode1: null,
        mode2: null,
        needPhonetic: false,
        needTranslation: false,
        isGeminiMode: false,
      };
    }

    const originalLanguage = this.provideLanguageCode(this.state.currentLyrics);
    const friendlyLanguage =
      originalLanguage &&
      new Intl.DisplayNames(["en"], { type: "language" })
        .of(originalLanguage.split("-")[0])
        ?.toLowerCase();
    const modeKey = friendlyLanguage || "gemini";
    const mode1 = CONFIG.visual[`translation-mode:${modeKey}`];
    const mode2 = CONFIG.visual[`translation-mode-2:${modeKey}`];

    // Gemini 번역인지 확인
    const isGeminiMode =
      mode1?.startsWith("gemini") || mode2?.startsWith("gemini");

    return {
      provider,
      mode1,
      mode2,
      needPhonetic: mode1 === "gemini_romaji" || mode2 === "gemini_romaji",
      needTranslation: mode1 === "gemini_ko" || mode2 === "gemini_ko",
      isGeminiMode,
    };
  }

  handleRegenerateTranslationRequest() {
    const targets = this.getRegenerationTargets();
    const includeCulturalAnnotations = this.isCulturalAnnotationsEnabled();
    if (
      (includeCulturalAnnotations || (targets.needPhonetic && targets.needTranslation)) &&
      typeof openRegenerateTranslationChoiceModal === "function"
    ) {
      openRegenerateTranslationChoiceModal({
        targets,
        includeCulturalAnnotations,
        onSelect: (target) => {
          if (target === "cultural-annotations") {
            this.regenerateCulturalAnnotations();
            return;
          }
          this.regenerateTranslation(target);
        },
      });
      return;
    }

    if (targets.needPhonetic) {
      this.regenerateTranslation("phonetic");
      return;
    }

    if (targets.needTranslation) {
      this.regenerateTranslation("translation");
      return;
    }

    this.regenerateTranslation("all");
  }

  async regenerateCulturalAnnotations() {
    if (!this.isCulturalAnnotationsEnabled()) return;

    const lyricsState = this.state;
    const uri = lyricsState.uri || Spicetify.Player.data?.item?.uri;
    const trackId = Utils.extractTrackId(uri) || uri;
    const lyrics = this.getCurrentCulturalAnnotationLyrics();
    if (!uri || !trackId) {
      Toast.error(I18n.t("notifications.noTrackPlaying"));
      return;
    }
    if (!Array.isArray(lyrics) || lyrics.length === 0) {
      Toast.error(I18n.t("notifications.noLyricsLoaded"));
      return;
    }

    Toast.show(
      I18n.t("generationStatus.culturalAnnotationsLoading") ||
        "문화적 배경 설명을 재생성하는 중...",
      false,
      2000
    );

    try {
      this.clearCulturalAnnotationsForTrack(uri, { updateState: true });
      const cacheCleared = await LyricsCache.clearCulturalAnnotationsForTrack(trackId);
      if (!cacheCleared) {
        throw new Error("Failed to clear cultural annotation cache.");
      }
      if (!this.isCurrentLyricsUri(uri)) return;

      const result = await this.requestCulturalAnnotations({
        lyricsState,
        lyrics,
        sourceLang: this.provideLanguageCode(lyrics),
        uri,
        ignoreCache: true,
        notifyOnError: false,
      });
      if (!result) {
        throw new Error("No cultural annotation result.");
      }
      if (this.isCurrentLyricsUri(uri)) {
        Toast.success(
          I18n.t("notifications.culturalAnnotationsRegenerated") ||
            "문화적 배경 설명이 재생성되었습니다."
        );
      }
    } catch (error) {
      if (this.isCurrentLyricsUri(uri)) {
        Toast.error(
          `${I18n.t("notifications.culturalAnnotationsRegenerateFailed") ||
            "문화적 배경 설명 재생성 실패"}: ${error.message}`
        );
      }
    }
  }

  async regenerateTranslation(target = "all") {
    // 번역이 활성화되어 있는지 확인
    const { provider, mode1, mode2, needPhonetic: configuredNeedPhonetic, needTranslation: configuredNeedTranslation, isGeminiMode } =
      this.getRegenerationTargets();

    if (!provider || provider === "none") {
      return;
    }

    // 현재 가사가 있는지 확인
    if (!this.state.currentLyrics || this.state.currentLyrics.length === 0) {
      Toast.error(I18n.t("notifications.noLyricsLoaded"));
      return;
    }

    if (!isGeminiMode) {
      Toast.error(I18n.t("notifications.translationRegenerateGeminiOnly"));
      return;
    }

    // 발음과 번역 중 어떤 것이 필요한지 확인
    const needPhonetic = configuredNeedPhonetic && (target === "all" || target === "phonetic");
    const needTranslation = configuredNeedTranslation && (target === "all" || target === "translation");

    if (!needPhonetic && !needTranslation) {
      Toast.error(I18n.t("notifications.translationRegenerateGeminiOnly"));
      return;
    }

    const requestUri = this.state.uri;
    // trackId 가져오기
    const trackId = Utils.extractTrackId(Spicetify.Player.data?.item?.uri);
    if (!trackId) {
      Toast.error(I18n.t("notifications.noTrackPlaying"));
      return;
    }

    let phoneticLoadingToken = null;
    let translationLoadingToken = null;
    let phoneticCompleted = false;
    let translationCompleted = false;
    const regenerationToastKind = needPhonetic && needTranslation
      ? "both"
      : needPhonetic
        ? "phonetic"
        : "translation";
    const regenerationToastStart = regenerationToastKind === "phonetic"
      ? I18n.t("notifications.requestingPronunciation")
      : regenerationToastKind === "both"
        ? `${I18n.t("notifications.requestingPronunciation")} ${I18n.t("notifications.requestingTranslation")}`
        : I18n.t("notifications.regeneratingTranslation");
    const regenerationToastSuccess = regenerationToastKind === "translation"
      ? I18n.t("notifications.translationRegenerated")
      : `${regenerationToastKind === "phonetic"
        ? I18n.t("menu.pronunciation")
        : I18n.t("menu.regenerateBoth")} · ${I18n.t("generationStatus.complete")}`;
    const regenerationToastFailure = regenerationToastKind === "phonetic"
      ? I18n.t("notifications.romajiTranslationFailed")
      : regenerationToastKind === "both"
        ? `${I18n.t("notifications.romajiTranslationFailed")} / ${I18n.t("notifications.translationRegenerateFailed")}`
        : I18n.t("notifications.translationRegenerateFailed");

    try {
      if (needPhonetic) {
        phoneticLoadingToken = this.startPhoneticLoading();
      }
      if (needTranslation) {
        translationLoadingToken = this.startTranslationLoading();
      }

      Toast.show(regenerationToastStart, false, 2000);

      // 진행 중인 동일 트랙 요청만 정리하고, 선택하지 않은 캐시 항목은 보존합니다.
      try {
        window.Translator.clearInflightRequests(trackId);
        ivLyricsDebug(`[regenerateTranslation] Cleared inflight requests for ${trackId}`);
      } catch (e) {
        console.warn('[regenerateTranslation] Failed to clear inflight requests:', e);
      }

      // 원본 가사 가져오기 (번역되지 않은 원문)
      const lyricsState = this.state;
      const currentMode = this.getCurrentMode();

      // 원본 가사를 가져오기 위해 synced, karaoke, unsynced 중 현재 모드에 해당하는 것 사용
      let originalLyrics = [];
      if (isKaraokeRenderMode(currentMode) && this.state.karaoke) {
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
      const text = getNonSectionLyricsText(originalLyrics);

      const currentUri = lyricsState.uri;
      const currentProvider = lyricsState.provider || "";

      if (!this._dmResults) {
        this._dmResults = {};
      }
      if (!this._dmResults[currentUri]) {
        this._dmResults[currentUri] = {};
      }

      this._dmResults[currentUri].lastMode1 = mode1;
      this._dmResults[currentUri].lastMode2 = mode2;
      this._dmResults[currentUri].lastProvider = currentProvider;
      this._dmResults[currentUri].lastRendererVersion = getSyncDataRendererCacheVersion(lyricsState);
      this._dmResults[currentUri].lastLyricsShapeSignature =
        getLyricsProcessingShapeSignature(originalLyrics);
      this._dmResults[currentUri].lastPronunciationNotation =
        getCurrentLyricsPronunciationNotation();

      const mapResultLinesToLyrics = (linesInput, targetField) => {
        return mapTranslationLinesToLyrics(originalLyrics, linesInput, { targetField });
      };

      const extractGeminiOutput = (response, wantSmartPhonetic) => {
        let outText = wantSmartPhonetic
          ? response?.phonetic
          : response?.translation || response?.vi;

        if (
          Array.isArray(outText) &&
          outText.length === 1 &&
          typeof outText[0] === "string"
        ) {
          try {
            if (outText[0].trim().startsWith("{")) {
              const parsed = JSON.parse(outText[0]);
              if (wantSmartPhonetic && Array.isArray(parsed.phonetic)) {
                outText = parsed.phonetic;
              } else if (
                !wantSmartPhonetic &&
                Array.isArray(parsed.translation)
              ) {
                outText = parsed.translation;
              } else if (
                !wantSmartPhonetic &&
                Array.isArray(parsed.vi)
              ) {
                outText = parsed.vi;
              }
            }
          } catch (e) {
            // Keep the original output when the streamed payload is not JSON-wrapped.
          }
        }

        return outText;
      };

      const initialStreamedLyrics1 = this._dmResults[currentUri].mode1 || null;
      const initialStreamedLyrics2 = this._dmResults[currentUri].mode2 || null;
      let streamedLyrics1 = initialStreamedLyrics1;
      let streamedLyrics2 = initialStreamedLyrics2;
      const streamedPhoneticLines = [];
      const streamedTranslationLines = [];

      const pushStreamingUpdate = () => {
        if (!this.isCurrentLyricsUri(currentUri)) {
          return;
        }

        this._dmResults[currentUri].mode1 = streamedLyrics1;
        this._dmResults[currentUri].mode2 = streamedLyrics2;

        this.applyStreamingTranslation({
          uri: currentUri,
          lyrics: originalLyrics,
          lyricsMode1: streamedLyrics1,
          lyricsMode2: streamedLyrics2,
          displayMode1: mode1,
          displayMode2: mode2,
        });
      };

      const handlePhoneticStreamLine = needPhonetic
        ? (lineIndex, lineText) => {
          if (typeof lineIndex !== "number" || lineIndex < 0) {
            return;
          }
          if (!this.isCurrentLyricsUri(currentUri)) {
            return;
          }

          streamedPhoneticLines[lineIndex] =
            typeof lineText === "string" ? lineText : String(lineText ?? "");

          const partialMapped = mapResultLinesToLyrics(streamedPhoneticLines, "phonetic");
          if (!partialMapped) {
            return;
          }

          if (mode1 === "gemini_romaji") {
            streamedLyrics1 = partialMapped;
          }
          if (mode2 === "gemini_romaji") {
            streamedLyrics2 = partialMapped;
          }
          pushStreamingUpdate();
        }
        : null;
      const handlePhoneticStreamReset = needPhonetic
        ? () => {
          streamedPhoneticLines.length = 0;
          if (mode1 === "gemini_romaji") streamedLyrics1 = initialStreamedLyrics1;
          if (mode2 === "gemini_romaji") streamedLyrics2 = initialStreamedLyrics2;
          pushStreamingUpdate();
        }
        : null;

      const handleTranslationStreamLine = needTranslation
        ? (lineIndex, lineText) => {
          if (typeof lineIndex !== "number" || lineIndex < 0) {
            return;
          }
          if (!this.isCurrentLyricsUri(currentUri)) {
            return;
          }

          streamedTranslationLines[lineIndex] =
            typeof lineText === "string" ? lineText : String(lineText ?? "");

          const partialMapped = mapResultLinesToLyrics(streamedTranslationLines, "translation");
          if (!partialMapped) {
            return;
          }

          if (mode1 === "gemini_ko") {
            streamedLyrics1 = partialMapped;
          }
          if (mode2 === "gemini_ko") {
            streamedLyrics2 = partialMapped;
          }
          pushStreamingUpdate();
        }
        : null;
      const handleTranslationStreamReset = needTranslation
        ? () => {
          streamedTranslationLines.length = 0;
          if (mode1 === "gemini_ko") streamedLyrics1 = initialStreamedLyrics1;
          if (mode2 === "gemini_ko") streamedLyrics2 = initialStreamedLyrics2;
          pushStreamingUpdate();
        }
        : null;

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
          sourceLang:
            this.trackLanguageOverride || this.provideLanguageCode(originalLyrics) || "auto",
          provider: lyricsState.provider,
          ignoreCache: true,
          onLine: handlePhoneticStreamLine,
          onStreamReset: handlePhoneticStreamReset,
        });
      }

      // 번역 요청 (gemini_ko)
      if (needTranslation) {
        if (!this.isCurrentLyricsUri(currentUri)) {
          return;
        }
        translationResponse = await window.Translator.callGemini({
          trackId,
          artist: this.state.artist || lyricsState.artist,
          title: this.state.title || lyricsState.title,
          text,
          wantSmartPhonetic: false,
          provider: lyricsState.provider,
          ignoreCache: true,
          onLine: handleTranslationStreamLine,
          onStreamReset: handleTranslationStreamReset,
        });
      }

      if (!this.isCurrentLyricsUri(currentUri) || requestUri !== currentUri) {
        return;
      }

      // 번역 결과를 getGeminiTranslation과 동일한 방식으로 처리하는 함수
      const processTranslationResult = (outText, lyrics, targetField) => {
        if (!outText) return null;

        const lines = normalizeTranslationOutputLines(outText);
        return mapTranslationLinesToLyrics(lyrics, lines, { targetField });
      };

      // mode1과 mode2 각각 처리 - 둘 다 활성화된 경우 각각의 결과를 올바르게 할당
      let translatedLyrics1 = this._dmResults[currentUri].mode1 || null;
      let translatedLyrics2 = this._dmResults[currentUri].mode2 || null;

      const phoneticOutput = extractGeminiOutput(phoneticResponse, true);
      const translationOutput = extractGeminiOutput(translationResponse, false);
      const mappedPhonetic = phoneticOutput
        ? processTranslationResult(phoneticOutput, originalLyrics, "phonetic")
        : null;
      const mappedTranslation = translationOutput
        ? processTranslationResult(translationOutput, originalLyrics, "translation")
        : null;

      await Promise.all([
        needPhonetic && phoneticOutput
          ? setCachedTranslationForText({
            trackId,
            lang: this.getTranslationTargetLanguage(),
            isPhonetic: true,
            provider: lyricsState.provider,
            text,
            outText: phoneticOutput,
          })
          : null,
        needTranslation && translationOutput
          ? setCachedTranslationForText({
            trackId,
            lang: this.getTranslationTargetLanguage(),
            isPhonetic: false,
            provider: lyricsState.provider,
            text,
            outText: translationOutput,
          })
          : null,
      ].filter(Boolean));

      // mode1 처리
      if (mode1 === "gemini_romaji" && mappedPhonetic) {
        translatedLyrics1 = mappedPhonetic;
      } else if (mode1 === "gemini_ko" && mappedTranslation) {
        translatedLyrics1 = mappedTranslation;
      }

      // mode2 처리 (mode1과 독립적으로)
      if (mode2 === "gemini_romaji" && mappedPhonetic) {
        translatedLyrics2 = mappedPhonetic;
      } else if (mode2 === "gemini_ko" && mappedTranslation) {
        translatedLyrics2 = mappedTranslation;
      }

      // _dmResults에 번역 결과 저장
      // mode1과 mode2 결과 저장
      if (!this._dmResults?.[currentUri]) {
        return;
      }
      this._dmResults[currentUri].mode1 = translatedLyrics1;
      this._dmResults[currentUri].mode2 = translatedLyrics2;
      this._dmResults[currentUri].lastMode1 = mode1;
      this._dmResults[currentUri].lastMode2 = mode2;
      this._dmResults[currentUri].lastPronunciationNotation =
        getCurrentLyricsPronunciationNotation();

      // CacheManager에도 새 결과 저장 (getGeminiTranslation에서 캐시 히트하도록)
      this._dmResults[currentUri].lastProvider = currentProvider;
      if (translatedLyrics1 && mode1) {
        CacheManager.set(getDisplayModeCacheKey(lyricsState, mode1), translatedLyrics1);
      }
      if (translatedLyrics2 && mode2) {
        CacheManager.set(getDisplayModeCacheKey(lyricsState, mode2), translatedLyrics2);
      }

      phoneticCompleted = needPhonetic && !!mappedPhonetic;
      translationCompleted = needTranslation && !!mappedTranslation;
      if (
        (needPhonetic && !phoneticCompleted) ||
        (needTranslation && !translationCompleted)
      ) {
        throw new Error("Failed to map one or more generated lyric fields.");
      }

      // 이전 완성 스냅샷이 새 결과를 가로채지 않도록 표시 캐시만 비운다.
      this.invalidateSharedLyricsPresentation(currentUri);
      // lyricsSource를 다시 호출하여 기존 로직으로 화면 및 오버레이 업데이트
      this.lyricsSource(this.state, currentMode);
      Toast.success(regenerationToastSuccess);
    } catch (error) {
      if (this.isCurrentLyricsUri(requestUri)) {
        Toast.error(`${regenerationToastFailure}: ${error.message}`);
      }
    } finally {
      if (needPhonetic) {
        this.clearPhoneticLoading(phoneticLoadingToken, { completed: phoneticCompleted });
      }
      if (needTranslation) {
        this.clearTranslationLoading(translationLoadingToken, { completed: translationCompleted });
      }
    }
  }

  async selectLyricsProviderForCurrentTrack(providerId) {
    const trackUri = this.state.uri || Spicetify.Player.data?.item?.uri;
    if (!trackUri) {
      Toast.error(I18n.t("notifications.noTrackPlaying"));
      return;
    }

    try {
      const normalizedProviderId = providerId || null;
      if (normalizedProviderId) {
        await TrackLyricsProviderDB.setProvider(trackUri, normalizedProviderId);
      } else {
        await TrackLyricsProviderDB.clearProvider(trackUri);
      }

      this.trackLyricsProviderOverride = normalizedProviderId;
      delete CACHE[trackUri];
      if (this._dmResults?.[trackUri]) {
        delete this._dmResults[trackUri];
      }
      CacheManager.clearByUri(trackUri);
      this.lastProcessedUri = null;
      this.lastProcessedMode = null;

      this.setState(
        { trackLyricsProviderOverride: normalizedProviderId, isLoading: true },
        () => {
          const item = Spicetify.Player.data?.item;
          if (item) {
            this.fetchLyrics(item, this.state.explicitMode, true);
          }
        }
      );

      Toast.success(I18n.t("notifications.lyricsProviderSaved"));
    } catch (error) {
      console.error("[ivLyrics] Failed to save lyrics provider override:", error);
      Toast.error(I18n.t("notifications.lyricsProviderSaveFailed"));
    }
  }

  getEffectiveBackgroundMode(override = this.trackBackgroundOverride) {
    return (
      getIvLyricsTrackBackgroundMode(override) ||
      getIvLyricsGlobalBackgroundMode(CONFIG.visual)
    );
  }

  async selectBackgroundForCurrentTrack(mode) {
    const trackUri = this.state.uri || this.currentTrackUri || Spicetify.Player.data?.item?.uri;
    if (!trackUri) {
      Toast.error(I18n.t("notifications.noTrackPlaying"));
      return;
    }

    try {
      const normalizedOverride = mode
        ? normalizeIvLyricsTrackBackgroundOverride({ mode })
        : null;

      if (normalizedOverride) {
        await TrackBackgroundDB.setOverride(trackUri, normalizedOverride);
      } else {
        await TrackBackgroundDB.clearOverride(trackUri);
      }

      this.trackBackgroundOverride = normalizedOverride;
      const nextMode = this.getEffectiveBackgroundMode(normalizedOverride);
      if (shouldFetchIvLyricsBackgroundColors(nextMode)) {
        this.fetchColors(trackUri);
      }

      this.setState({ trackBackgroundOverride: normalizedOverride }, () => {
        this.updateVisualOnConfigChange();
        this.forceUpdate();
      });

      window.dispatchEvent(new CustomEvent("ivLyrics:track-background-changed", {
        detail: { trackUri, override: normalizedOverride, effectiveMode: nextMode },
      }));
      Toast.success(I18n.t("messages.saved"));
    } catch (error) {
      console.error("[ivLyrics] Failed to save track background override:", error);
      Toast.error(I18n.t("messages.error"));
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
      artist: track.artists?.map((artist) => artist?.name).filter(Boolean).join(", ") || meta.artist_name,
      title: meta.title,
      uri: track.uri,
      image:
        meta.image_xlarge_url ||
        meta.image_large_url ||
        track?.album?.images?.[0]?.url ||
        meta.image_url,
    };
  }


  async fetchColors(uri) {
    let vibrant = 0;
    let dynamicColors = null;

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

    if (this.getEffectiveBackgroundMode() === "blur-gradient-background") {
      try {
        const coverUrl =
          Spicetify.Player.data?.item?.metadata?.image_xlarge_url ||
          Spicetify.Player.data?.item?.metadata?.image_large_url ||
          Spicetify.Player.data?.item?.metadata?.image_url;

        if (coverUrl && Spicetify.GraphQL?.Definitions?.getDynamicColorsByUris) {
          const colorQuery = await Spicetify.GraphQL.Request(
            Spicetify.GraphQL.Definitions.getDynamicColorsByUris,
            { imageUris: [coverUrl] }
          );

          const colorData = colorQuery?.data?.getDynamicColorsByUris?.[0];
          if (colorData) {
            const rgbaToHex = (rgba) => {
              if (!rgba) return null;
              const r = Math.round(rgba.red * 255);
              const g = Math.round(rgba.green * 255);
              const b = Math.round(rgba.blue * 255);
              return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
            };

            // 다양한 색상 레벨 추출
            const minContrast = colorData.minContrast?.backgroundBase
              ? rgbaToHex(colorData.minContrast.backgroundBase)
              : Utils.convertIntToRGB(vibrant);
            const highContrast = colorData.highContrast?.backgroundBase
              ? rgbaToHex(colorData.highContrast.backgroundBase)
              : Utils.convertIntToRGB(vibrant, 0.7);
            const overlayColor = colorData.higherContrast?.backgroundBase
              ? rgbaToHex(colorData.higherContrast.backgroundBase)
              : Utils.convertIntToRGB(vibrant, 0.5);

            dynamicColors = { minContrast, highContrast, overlayColor };
          }
        }
      } catch (e) {
        console.warn("[ivLyrics] Failed to fetch dynamic colors:", e);
      }

      // GraphQL 실패 시 vibrant 색상 기반 폴백 그라데이션
      if (!dynamicColors) {
        const baseColor = Utils.convertIntToRGB(vibrant);
        const darkerColor = Utils.convertIntToRGB(vibrant, 0.6);
        const darkestColor = Utils.convertIntToRGB(vibrant, 0.3);
        dynamicColors = {
          minContrast: baseColor,
          highContrast: darkerColor,
          overlayColor: darkestColor,
        };
      }
    }

    if (this.currentTrackUri !== uri) {
      return;
    }

    this.setState({
      colors: {
        background: Utils.convertIntToRGB(vibrant),
        inactive: Utils.convertIntToRGB(vibrant, 3),
      },
      colorsUri: uri,
      dynamicColors,
    });
  }

  async fetchTempo(uri) {
    const trackId = Utils.extractTrackId(uri);
    if (!trackId) return;
    let audio;
    try {
      audio = await Spicetify.CosmosAsync.get(
        `wg://audio-attributes/v1/audio-features/${trackId}?format=json`
      );
    } catch (error) {
      console.warn("[ivLyrics] Failed to fetch audio features:", error);
      return;
    }

    if (this.currentTrackUri !== uri) {
      return;
    }

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
    // LyricsService Extension을 통해 가사 로드 (LyricsAddonManager 사용)
    if (window.LyricsService?.getLyricsFromProviders) {
      const result = await window.LyricsService.getLyricsFromProviders(
        trackInfo,
        [],
        getLyricsDataMode(mode),
        this.trackLyricsProviderOverride || null
      );
      if (!result.uri) result.uri = trackInfo.uri;
      return result;
    }

    // LyricsService가 없으면 에러
    console.error('[LyricsContainer] LyricsService Extension이 로드되지 않았습니다.');
    return { ...emptyState, uri: trackInfo.uri, error: 'LyricsService not loaded' };
  }

  async fetchLyrics(track, mode = -1, refresh = false) {
    let isLatestLyricsRequest = () => true;
    let lyricsLoadingToken = null;
    let lyricsLoadingCompleted = false;

    try {
      const info = this.infoFromTrack(track);
      if (!info) {
        this.setState({ error: "No track info", isLoading: false });
        return;
      }

      const requestSeq = ++this._lyricsFetchSeq;
      const requestUri = info.uri;
      const hasSpotifyTrackId = !!Utils.extractTrackId(info.uri);
      this._activeLyricsFetchSeq = requestSeq;
      this.currentTrackUri = requestUri;
      isLatestLyricsRequest = () =>
        this._activeLyricsFetchSeq === requestSeq &&
        this.currentTrackUri === requestUri &&
        this.isPlaybackUriCurrent(requestUri);

      this.clearPendingLyricsUpdates();
      this.lastProcessedUri = null;
      this.lastProcessedMode = null;
      if (refresh) {
        window.LyricsService?.clearLyricsSnapshot?.(requestUri);
      }
      const sharedSnapshot = !refresh
        ? window.LyricsService?.getLyricsSnapshot?.(requestUri)
        : null;
      const sharedDisplayLyrics = Array.isArray(sharedSnapshot?.displayLyrics)
        ? sharedSnapshot.displayLyrics
        : null;
      const sharedPresentationIsComplete = sharedSnapshot?.presentationComplete === true;
      const sharedRawResult = sharedSnapshot?.rawResult;
      const loadingState = this.getLoadingLyricsState(info, requestSeq);
      this.setState(sharedDisplayLyrics ? {
        ...loadingState,
        ...(sharedRawResult || {}),
        uri: requestUri,
        lyricsRequestSeq: requestSeq,
        currentLyrics: sharedDisplayLyrics,
        provider: sharedSnapshot.provider || sharedRawResult?.provider || "",
        karaokeSource: sharedSnapshot.karaokeSource || sharedRawResult?.karaokeSource || null,
        // Track overrides are asynchronous. Keep processing paused until the
        // snapshot has been validated against them below.
        isLoading: true,
      } : loadingState);

      // 트랙별 언어 오버라이드 로드 (IndexedDB)
      let trackLanguageOverride = null;
      let trackLyricsProviderOverride = null;
      let trackBackgroundOverride = null;
      try {
        [trackLanguageOverride, trackLyricsProviderOverride, trackBackgroundOverride] = await Promise.all([
          window.LyricsService?.getTrackLanguageOverride?.(info.uri) ?? TrackLanguageDB.getLanguage(info.uri),
          window.LyricsService?.getTrackLyricsProviderOverride?.(info.uri) ?? TrackLyricsProviderDB.getProvider(info.uri),
          TrackBackgroundDB.getOverride(info.uri),
        ]);
      } catch (e) {
        console.warn("[ivLyrics] Failed to load track overrides:", e);
        trackLanguageOverride = null;
        trackLyricsProviderOverride = null;
        trackBackgroundOverride = null;
      }

      if (!isLatestLyricsRequest()) {
        return;
      }
      this.trackLanguageOverride = trackLanguageOverride;
      this.trackBackgroundOverride = trackBackgroundOverride;
      if (!hasSpotifyTrackId) {
        trackLyricsProviderOverride = null;
      }
      this.trackLyricsProviderOverride = trackLyricsProviderOverride;

      // keep artist/title for prompts
      this.setState({
        artist: info.artist,
        title: info.title,
        coverUrl: info.image,
        translatedMetadata: null,
        trackLyricsProviderOverride,
        trackBackgroundOverride,
      });

      // 메타데이터 번역 요청 (백그라운드에서 비동기로)
      this.fetchMetadataTranslation(info.uri, info.title, info.artist);

      // Refresh: Clear memory cache for this track to force re-fetch from providers
      if (refresh && CACHE[info.uri]) {
        delete CACHE[info.uri];
      }
      if (hasSpotifyTrackId && CACHE[info.uri] && (CACHE[info.uri].trackLyricsProviderOverride || null) !== (trackLyricsProviderOverride || null)) {
        delete CACHE[info.uri];
      }

      let isCached = this.lyricsSaved(info.uri);
      if (!hasSpotifyTrackId) {
        const savedLocalLyrics = this.getSavedLocalLyrics(info.uri);
        if (savedLocalLyrics) {
          const restoredLocalLyrics = {
            ...savedLocalLyrics,
            provider: "local",
            uri: info.uri,
            trackLyricsProviderOverride: null,
          };
          if (window.PseudoKaraokeService?.applyToResult) {
            await window.PseudoKaraokeService.applyToResult(restoredLocalLyrics, info);
          }
          CACHE[info.uri] = restoredLocalLyrics;
          isCached = true;
        }
      }

      // The extracted track color also drives LP label accents, so keep it
      // available even when the selected background is video or solid.
      this.fetchColors(info.uri);

      this.fetchTempo(info.uri);
      this.resetDelay();

      let tempState;
      const sharedProvider = sharedRawResult?.provider || sharedSnapshot?.provider || null;
      const sharedOverride = sharedSnapshot?.trackLyricsProviderOverride || null;
      const sharedHasLyrics = !!(
        sharedRawResult &&
        (
          (Array.isArray(sharedRawResult.karaoke) && sharedRawResult.karaoke.length > 0) ||
          (Array.isArray(sharedRawResult.synced) && sharedRawResult.synced.length > 0) ||
          (Array.isArray(sharedRawResult.unsynced) && sharedRawResult.unsynced.length > 0)
        )
      );
      const sharedOverrideMatches = trackLyricsProviderOverride
        ? sharedProvider === trackLyricsProviderOverride
        : !sharedOverride;
      const canReuseSharedRawResult = !refresh &&
        sharedHasLyrics &&
        sharedOverrideMatches &&
        isLyricsRenderCacheCurrent({
          ...sharedRawResult,
          trackLyricsProviderOverride: trackLyricsProviderOverride || null,
        });

      if (canReuseSharedRawResult) {
        CACHE[info.uri] = {
          ...sharedRawResult,
          uri: info.uri,
          trackLyricsProviderOverride: trackLyricsProviderOverride || null,
        };
      }
      if (CACHE[info.uri] && !isLyricsRenderCacheCurrent(CACHE[info.uri])) {
        delete CACHE[info.uri];
      }
      // if lyrics are cached
      if (
        (mode === -1 && CACHE[info.uri]) ||
        CACHE[info.uri]?.[CONFIG.modes?.[getLyricsDataMode(mode)]]
      ) {
        tempState = {
          provider: "",
          contributors: null,
          ...CACHE[info.uri],
          ...(canReuseSharedRawResult && sharedDisplayLyrics
            ? { currentLyrics: sharedDisplayLyrics }
            : {}),
          trackLyricsProviderOverride,
          trackBackgroundOverride,
          lyricsRequestSeq: requestSeq,
          isLoading: false,
          isCached,
        };
        const cachedMode = CACHE[info.uri]?.mode;
        if (typeof cachedMode === "number" && cachedMode !== -1) {
          tempState = { ...tempState, mode: cachedMode };
        }
      } else {
        // Save current mode before loading to maintain UI consistency
        const currentMode = this.getCurrentMode();
        this.lastModeBeforeLoading = currentMode !== -1 ? currentMode : SYNCED;
        lyricsLoadingToken = this.startLyricsLoading();
        this.setState({
          ...emptyState,
          uri: requestUri,
          lyricsRequestSeq: requestSeq,
          artist: info.artist,
          title: info.title,
          coverUrl: info.image,
          provider: "",
          contributors: null,
          trackLyricsProviderOverride,
          trackBackgroundOverride,
          isLoading: true,
          isCached: false,
        });

        // 마켓플레이스 에드온 로드 대기
        if (window.MarketplaceManager?.readyPromise) {
          await window.MarketplaceManager.readyPromise;
          if (!isLatestLyricsRequest()) {
            return;
          }
        }

        // LyricsService Extension을 통해 가사 로드 (LyricsAddonManager 사용)
        const resp = await window.LyricsService.getLyricsFromProviders(
          info,
          [],
          getLyricsDataMode(mode),
          trackLyricsProviderOverride
        );
        if (!resp.uri) resp.uri = info.uri;

        if (resp.provider) {
          // Cache lyrics
          CACHE[resp.uri] = {
            ...resp,
            trackLyricsProviderOverride: trackLyricsProviderOverride || null,
          };
        }

        // This True when the user presses the Cache Lyrics button and saves it to localStorage.
        isCached = this.lyricsSaved(resp.uri);

        // In case user skips tracks too fast and multiple callbacks
        // set wrong lyrics to current track.
        if (resp.uri === this.currentTrackUri && isLatestLyricsRequest()) {
          tempState = {
            provider: "",
            contributors: null,
            ...resp,
            trackLyricsProviderOverride,
            trackBackgroundOverride,
            lyricsRequestSeq: requestSeq,
            isLoading: false,
            isCached,
          };
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
        return hasInstrumentalMarker(lyrics);
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
        if (this.isModeAvailable(this.state.lockedMode, tempState)) {
          finalMode = this.state.lockedMode;
        } else if (this.isModeAvailable(this.state.explicitMode, tempState)) {
          finalMode = this.state.explicitMode;
        } else {
          finalMode = this.getAutomaticMode(tempState);
        }
      }

      const initialLyricsForMode = this.resolveLyricsForMode(tempState, finalMode);
      const canCompleteLyricsLoading = lyricsLoadingToken !== null &&
        isLatestLyricsRequest() &&
        Array.isArray(initialLyricsForMode) &&
        initialLyricsForMode.length > 0;
      const configuredLanguageOverride = CONFIG.visual["translate:detect-language-override"];
      const presentationLanguage = trackLanguageOverride ||
        (configuredLanguageOverride && configuredLanguageOverride !== 'off'
          ? configuredLanguageOverride
          : Utils.detectLanguage(initialLyricsForMode || []));
      let presentationModeKey = 'gemini';
      try {
        if (presentationLanguage) {
          presentationModeKey = new Intl.DisplayNames(['en'], { type: 'language' })
            .of(String(presentationLanguage).split('-')[0])
            ?.toLowerCase() || 'gemini';
        }
      } catch (error) {
        // Fall back to the generic Gemini mode key.
      }
      const expectedDisplayMode1 = CONFIG.visual[`translation-mode:${presentationModeKey}`] || 'none';
      const expectedDisplayMode2 = CONFIG.visual[`translation-mode-2:${presentationModeKey}`] || 'none';
      const sharedLyricsForMode = canReuseSharedRawResult &&
        sharedDisplayLyrics &&
        sharedPresentationIsComplete &&
        sharedSnapshot?.lyricsType === getLyricsModeTypeKey(finalMode) &&
        (sharedSnapshot.displayMode1 || 'none') === expectedDisplayMode1 &&
        (sharedSnapshot.displayMode2 || 'none') === expectedDisplayMode2 &&
        (sharedSnapshot.detectedLanguage || '') === (presentationLanguage || '') &&
        (sharedSnapshot.translationTargetLanguage || '') === getCurrentTranslationTargetLanguage() &&
        (sharedSnapshot.pronunciationNotation || 'translation') === getCurrentLyricsPronunciationNotation() &&
        (!sharedSnapshot.translationSourceText ||
          sharedSnapshot.translationSourceText === getNonSectionLyricsText(initialLyricsForMode || []))
        ? sharedDisplayLyrics
        : null;
      const { currentLyrics: _ignoredCurrentLyrics, ...rawLyricsSnapshot } = tempState;
      window.LyricsService?.publishLyricsSnapshot?.({
        trackUri: info.uri,
        trackInfo: info,
        rawResult: rawLyricsSnapshot,
        provider: tempState.provider || null,
        karaokeSource: tempState.karaokeSource || null,
        trackLyricsProviderOverride: trackLyricsProviderOverride || null,
        source: 'ivlyrics-page-base'
      });

      if (!isLatestLyricsRequest()) {
        return;
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
          currentLyrics: sharedLyricsForMode || initialLyricsForMode || [],
        });
        lyricsLoadingCompleted = canCompleteLyricsLoading && isLatestLyricsRequest();
        return;
      }

      // Preserve cached translations when not changing songs
      this.setState({
        ...tempState,
        ...this.applyTranslationStates(tempState),
        currentLyrics: sharedLyricsForMode || initialLyricsForMode || [],
      });
      lyricsLoadingCompleted = canCompleteLyricsLoading && isLatestLyricsRequest();
    } catch (error) {
      if (!isLatestLyricsRequest()) {
        return;
      }

      this.setState({
        error: `Failed to fetch lyrics: ${error.message}`,
        isLoading: false,
        ...emptyState,
        uri: this.currentTrackUri,
        lyricsRequestSeq: this._activeLyricsFetchSeq,
      });
    } finally {
      if (lyricsLoadingToken !== null) {
        this.clearLyricsLoading(lyricsLoadingToken, {
          completed: lyricsLoadingCompleted && isLatestLyricsRequest(),
        });
      }
    }
  }

  resolveLyricsForMode(lyricsState, mode) {
    if (!lyricsState) return null;

    const dataMode = getLyricsDataMode(mode);
    const preferredModeKey =
      typeof dataMode === "number" && dataMode >= 0 ? CONFIG.modes?.[dataMode] : null;
    const preferredLyrics =
      preferredModeKey && lyricsState[preferredModeKey]
        ? lyricsState[preferredModeKey]
        : null;

    return (
      preferredLyrics ||
      lyricsState.karaoke ||
      lyricsState.synced ||
      lyricsState.unsynced ||
      null
    );
  }

  lyricsSource(lyricsState, mode) {
    if (!lyricsState) return;
    if (!this.isCurrentLyricsState(lyricsState)) return;
    const presentationSeq = ++this._lyricsPresentationSeq;
    const isActivePresentation = () =>
      presentationSeq === this._lyricsPresentationSeq &&
      this.isCurrentLyricsState(lyricsState);

    const lyrics = this.resolveLyricsForMode(lyricsState, mode);
    if (!lyrics) {
      if (lyricsState.isLoading) return;
      if (!isActivePresentation()) return;
      this.setState({ currentLyrics: [] });
      // 오버레이에 가사 없음 상태 전송 (트랙 정보 업데이트용)
      this.publishLyricsPresentation([], {
        uri: lyricsState.uri,
        provider: lyricsState.provider || null,
        karaokeSource: lyricsState.karaokeSource || null,
        mode,
      });
      return;
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
      if (this.streamingApplyTimer) {
        clearTimeout(this.streamingApplyTimer);
        this.streamingApplyTimer = null;
      }
      this.pendingStreamingPayload = null;
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
    const modeKey = friendlyLanguage || "gemini";

    const firstLanguagePrompt = window.ivLyricsFirstLanguagePrompt?.maybePrompt?.({
      sourceLang: originalLanguage,
      targetLang: getCurrentTranslationTargetLanguage(),
      modeKey,
    });
    if (firstLanguagePrompt) {
      const originalLyrics = this.optimizeTranslations(lyrics, null, null, null, null);
      if (isActivePresentation()) {
        this.setState({
          currentLyrics: Array.isArray(originalLyrics) ? originalLyrics : [],
        });
      }
      firstLanguagePrompt.finally(() => {
        if (isActivePresentation()) {
          this._dmResults = {};
          this.lyricsSource(lyricsState, mode);
        }
      });
      return;
    }

    const displayMode1 = CONFIG.visual[`translation-mode:${modeKey}`];
    const displayMode2 = CONFIG.visual[`translation-mode-2:${modeKey}`];

    this.language = originalLanguage;
    this.displayMode = displayMode1; // Keep for legacy compatibility
    this.displayMode2 = displayMode2;

    const { uri } = lyricsState; // Capture the URI for this specific request
    const publishCurrentPresentation = (displayLyrics, presentationComplete) =>
      this.publishLyricsPresentation(displayLyrics, {
        uri,
        provider: lyricsState.provider || null,
        karaokeSource: lyricsState.karaokeSource || null,
        mode,
        displayMode1,
        displayMode2,
        detectedLanguage: originalLanguage || null,
        translationSourceLyrics: lyrics,
        presentationComplete,
      });

    this.requestCulturalAnnotations({
      lyricsState,
      lyrics,
      sourceLang: originalLanguage,
      uri,
    });
    const sharedSnapshot = window.LyricsService?.getLyricsSnapshot?.(uri);
    const sharedPresentationWasInvalidated = !!sharedSnapshot &&
      this._invalidatedSharedPresentationSnapshots?.has(sharedSnapshot);
    const sharedPresentationMatches =
      !sharedPresentationWasInvalidated &&
      sharedSnapshot?.presentationComplete === true &&
      Array.isArray(sharedSnapshot?.displayLyrics) &&
      sharedSnapshot.trackUri === uri &&
      (sharedSnapshot.provider || '') === (lyricsState.provider || '') &&
      sharedSnapshot.lyricsType === getLyricsModeTypeKey(mode) &&
      (sharedSnapshot.displayMode1 || 'none') === (displayMode1 || 'none') &&
      (sharedSnapshot.displayMode2 || 'none') === (displayMode2 || 'none') &&
      (sharedSnapshot.detectedLanguage || '') === (originalLanguage || '') &&
      (sharedSnapshot.translationTargetLanguage || '') === this.getTranslationTargetLanguage() &&
      (sharedSnapshot.pronunciationNotation || 'translation') === getCurrentLyricsPronunciationNotation() &&
      (!sharedSnapshot.translationSourceText ||
        sharedSnapshot.translationSourceText === getNonSectionLyricsText(lyrics));
    if (sharedPresentationMatches) {
      this._sharedPresentationKeys.set(
        uri,
        `${lyricsState.provider || ''}:${displayMode1 || 'none'}:${displayMode2 || 'none'}:${getCurrentLyricsPronunciationNotation()}:${getSyncDataRendererCacheVersion(lyricsState)}`
      );
      const sharedDisplayLyrics = this.applyCulturalAnnotations(
        sharedSnapshot.displayLyrics,
        uri
      );
      this.setState({ currentLyrics: sharedDisplayLyrics });
      publishCurrentPresentation(sharedDisplayLyrics, true);
      return;
    }

    const processMode = async (mode, baseLyrics, onProgress = null) => {
      if (!mode || mode === "none") {
        ivLyricsDebug("[processMode] Mode is none or empty:", mode);
        return null;
      }
      ivLyricsDebug("[processMode] Processing mode:", mode);
      try {
        if (String(mode).startsWith("gemini")) {
          const result = await this.getGeminiTranslation(
            lyricsState,
            baseLyrics,
            mode,
            onProgress
          );
          ivLyricsDebug("[processMode] Gemini result sample:", result?.[0]);
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
        if (!isActivePresentation()) {
          return null;
        }
        const modeDisplayName =
          mode === "gemini_romaji"
            ? I18n.t("notifications.romajiTranslationFailed")
            : I18n.t("notifications.koreanTranslationFailed");
        Toast.error(`${modeDisplayName}: ${error.message || "Unknown error"}`);
        return null; // Return null on failure
      }
    };

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
      publishCurrentPresentation(finalLyrics, true);
      return;
    }

    // 즉시 원문 표시 - 번역이 로딩되는 동안에도 사용자가 가사를 볼 수 있도록
    // URI 체크: 곡이 변경되지 않았을 때만 표시
    if (isActivePresentation()) {
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
      // 발음/번역 생성이 오래 걸리더라도 오버레이는 원문을 즉시 표시해야 한다.
      publishCurrentPresentation(originalLyrics, false);
    }

    // Progressive loading: keep results per track so Mode 1 does not disappear when Mode 2 finishes
    // Check if display modes or provider changed - if so, clear cached results
    const currentProvider = lyricsState.provider || '';
    const currentRendererVersion = getSyncDataRendererCacheVersion(lyricsState);
    const currentLyricsShapeSignature = getLyricsProcessingShapeSignature(lyrics);
    const currentPronunciationNotation = getCurrentLyricsPronunciationNotation();
    if (this._dmResults[currentUri]) {
      const cached = this._dmResults[currentUri];
      // If provider, renderer, or selected lyric shape changed, invalidate all cache for this track.
      if (cached.lastProvider !== currentProvider
        || cached.lastRendererVersion !== currentRendererVersion
        || cached.lastLyricsShapeSignature !== currentLyricsShapeSignature) {
        ivLyricsDebug('[processLyricsWithDisplayModes] Lyrics source shape changed, invalidating display-mode cache', {
          previousProvider: cached.lastProvider,
          currentProvider,
          previousShape: cached.lastLyricsShapeSignature,
          currentShape: currentLyricsShapeSignature,
        });
        cached.mode1 = null;
        cached.mode2 = null;
      }
      // If mode settings changed, invalidate cache for that mode
      if (cached.lastMode1 !== displayMode1) {
        cached.mode1 = null;
      }
      if (cached.lastMode2 !== displayMode2) {
        cached.mode2 = null;
      }
      if (cached.lastPronunciationNotation !== currentPronunciationNotation) {
        if (displayMode1 === "gemini_romaji") cached.mode1 = null;
        if (displayMode2 === "gemini_romaji") cached.mode2 = null;
      }
    }

    this._dmResults[currentUri] = this._dmResults[currentUri] || {
      mode1: null,
      mode2: null,
    };
    this._dmResults[currentUri].lastMode1 = displayMode1;
    this._dmResults[currentUri].lastMode2 = displayMode2;
    this._dmResults[currentUri].lastProvider = currentProvider;
    this._dmResults[currentUri].lastRendererVersion = currentRendererVersion;
    this._dmResults[currentUri].lastLyricsShapeSignature = currentLyricsShapeSignature;
    this._dmResults[currentUri].lastPronunciationNotation = currentPronunciationNotation;

    let lyricsMode1 = this._dmResults[currentUri].mode1;
    let lyricsMode2 = this._dmResults[currentUri].mode2;

    const updateCombinedLyrics = () => {
      // Guard clause to prevent race conditions from previous songs
      if (!isActivePresentation()) {
        return;
      }
      ivLyricsDebug(
        "[updateCombinedLyrics] Mode1 data:",
        lyricsMode1 ? "present" : "null"
      );
      ivLyricsDebug(
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
      publishCurrentPresentation(
        finalLyrics,
        (!mode1Active || !!lyricsMode1) && (!mode2Active || !!lyricsMode2)
      );
    };

    // 스마트 로딩 전략: 두 모드 모두 활성화된 경우 둘 다 완료될 때까지 기다림
    const mode1Active = displayMode1 && displayMode1 !== "none";
    const mode2Active = displayMode2 && displayMode2 !== "none";
    const applyModeStreamProgress = (slot, partialLyrics, detail = {}) => {
      if (!isActivePresentation() || !this._dmResults?.[currentUri]) return;

      if (slot === 1) {
        lyricsMode1 = detail?.reset === true ? null : partialLyrics;
        this._dmResults[currentUri].mode1 = lyricsMode1;
      } else {
        lyricsMode2 = detail?.reset === true ? null : partialLyrics;
        this._dmResults[currentUri].mode2 = lyricsMode2;
      }

      if (detail?.reset !== true && !partialLyrics) return;
      this.applyStreamingTranslation({
        uri,
        presentationSeq,
        lyrics,
        lyricsMode1,
        lyricsMode2,
        displayMode1,
        displayMode2,
      });
    };

    ivLyricsDebug(
      "[displayTranslations] Mode1:",
      displayMode1,
      "Active:",
      mode1Active
    );
    ivLyricsDebug(
      "[displayTranslations] Mode2:",
      displayMode2,
      "Active:",
      mode2Active
    );

    if (mode1Active && mode2Active) {
      // 두 개 모드 모두 활성화: 각각 완료되는 즉시 업데이트 (Progressive Loading)
      // 두 결과가 이미 캐시된 경우에는 동일한 완성 이벤트를 두 번 발행하지 않는다.
      if (lyricsMode1 && lyricsMode2) {
        updateCombinedLyrics();
        return;
      }

      // 캐시된 결과가 있으면 재사용, 없으면 새로 요청
      const promise1 = lyricsMode1
        ? Promise.resolve(lyricsMode1)
        : processMode(displayMode1, lyrics, (partialLyrics, detail) => {
          applyModeStreamProgress(1, partialLyrics, detail);
        });
      const promise2 = lyricsMode2
        ? Promise.resolve(lyricsMode2)
        : processMode(displayMode2, lyrics, (partialLyrics, detail) => {
          applyModeStreamProgress(2, partialLyrics, detail);
        });

      // 각 promise가 완료되는 즉시 업데이트
      promise1
        .then((result) => {
          // Guard clause: 다른 곡으로 변경되었는지 확인
          if (!isActivePresentation() || !this._dmResults?.[currentUri]) {
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
          if (!isActivePresentation() || !this._dmResults?.[currentUri]) {
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

      // 두 번역이 모두 실패/무결과로 끝나면 원문 가사라도 오버레이에 전송
      // (그렇지 않으면 lyrics-ready가 한 번도 발생하지 않아 오버레이가 빈 채로 남는다)
      Promise.allSettled([promise1, promise2]).then(() => {
        if (!isActivePresentation() || !this._dmResults?.[currentUri]) {
          return;
        }
        if (!lyricsMode1 && !lyricsMode2) {
          updateCombinedLyrics();
        }
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
        processMode(displayMode1, lyrics, (partialLyrics, detail) => {
          applyModeStreamProgress(1, partialLyrics, detail);
        })
          .then((result) => {
            if (!isActivePresentation() || !this._dmResults?.[currentUri]) {
              return;
            }
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
        processMode(displayMode2, lyrics, (partialLyrics, detail) => {
          applyModeStreamProgress(2, partialLyrics, detail);
        })
          .then((result) => {
            if (!isActivePresentation() || !this._dmResults?.[currentUri]) {
              return;
            }
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
    const mode1IsPhonetic = isPronunciationDisplayMode(displayMode1);
    const mode2IsPhonetic = isPronunciationDisplayMode(displayMode2);
    const phoneticModeEnabled = mode1IsPhonetic || mode2IsPhonetic;
    const translationModeEnabled = Boolean(
      (displayMode1 && displayMode1 !== "none" && !mode1IsPhonetic) ||
      (displayMode2 && displayMode2 !== "none" && !mode2IsPhonetic)
    );

    // Helper: note/placeholder-only line (e.g., ♪, …)
    const isNoteLine = (text) => {
      const t = String(text || "").trim();
      if (!t) return true;
      return /^[\s♪♩♫♬·•・。.、…~\-]+$/.test(t);
    };

    // Helper function to normalize text for comparison
    const normalizeForComparison = (text) =>
      window.ivLyricsTextComparison.normalize(text);
    const areTextsEquivalent = (text1, text2) =>
      window.ivLyricsTextComparison.areEquivalent(text1, text2);

    // Helper function to check if two translations are similar (>85% similarity)
    const areTranslationsSimilar = (text1, text2) => {
      if (!text1 || !text2) return false;
      const norm1 = normalizeForComparison(text1);
      const norm2 = normalizeForComparison(text2);
      if (!norm1 || !norm2) return false;
      if (areTextsEquivalent(text1, text2)) return true;
      const words1 = norm1.split(" ").filter((w) => w.length > 2);
      const words2 = norm2.split(" ").filter((w) => w.length > 2);
      if (words1.length === 0 || words2.length === 0) return false;
	      const words2Set = new Set(words2);
	      const commonWords = words1.filter((word) => words2Set.has(word));
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
        typeof line === "object" ? line.originalText || line.text || "" : String(line || "");
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
        let vocals = withoutVocalSupplementField(line?.vocals, "phonetic");
        vocals = withoutVocalSupplementField(vocals, "translation");
        const noteLine = {
          ...line,
          vocals,
          originalText,
          text: null,
          text2: null,
          phoneticText: null,
          translationText: null,
        };
        delete noteLine.phonetic;
        delete noteLine.pronunciationText;
        delete noteLine.pronText;
        delete noteLine.translation;
        delete noteLine.transText;
        return noteLine;
      }

      // Ignore translations that are notes-only
      if (isNoteLine(translation1)) translation1 = "";
      if (isNoteLine(translation2)) translation2 = "";

      const normalizedTrans1 = normalizeForComparison(translation1);
      const normalizedTrans2 = normalizeForComparison(translation2);

      const trans1SameAsOriginal =
        normalizedTrans1 && areTextsEquivalent(translation1, originalText);
      const trans2SameAsOriginal =
        normalizedTrans2 && areTextsEquivalent(translation2, originalText);
      const translationsSame =
        normalizedTrans1 &&
        normalizedTrans2 &&
        (areTextsEquivalent(translation1, translation2) ||
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
      let phoneticSameAsOriginal = false;
      let translationSameAsOriginal = false;

      if (mode1IsPhonetic) {
        phoneticText = processPhoneticHyphen(translation1);
        phoneticSameAsOriginal = Boolean(trans1SameAsOriginal);
      } else if (mode1) {
        translationText = translation1;
        translationSameAsOriginal = Boolean(trans1SameAsOriginal);
      }

      if (mode2IsPhonetic) {
        phoneticText = processPhoneticHyphen(translation2);
        phoneticSameAsOriginal = Boolean(trans2SameAsOriginal);
      } else if (mode2) {
        translationText = translation2;
        translationSameAsOriginal = Boolean(trans2SameAsOriginal);
      }

      // Deduplication logic
      if (translationsSame) {
        const combinedText = translation1 || translation2;
        const bothPhonetic = mode1IsPhonetic && mode2IsPhonetic;
        if (bothPhonetic) {
          if (!phoneticSameAsOriginal) {
            finalText = processPhoneticHyphen(combinedText);
          }
        } else if (!translationSameAsOriginal && !trans1SameAsOriginal && !trans2SameAsOriginal) {
          // When pronunciation and translation unexpectedly return identical text,
          // keep a single copy in the translation slot. This prevents translated
          // prose from being presented as pronunciation.
          finalText2 = combinedText;
        }
      } else {
        // Compare each semantic result with the original associated with that
        // same result. Mode order may be translation-first or pronunciation-first.
        if (!phoneticSameAsOriginal && phoneticText) finalText = phoneticText;
        if (!translationSameAsOriginal && translationText) finalText2 = translationText;
      }

      // Provider/cached lines may already contain supplement fields. The
      // language rule is authoritative: disabled supplements must not leak
      // back into the renderer from the base line or a previous presentation.
      let finalVocals = line?.vocals;
      if (!phoneticModeEnabled) {
        finalVocals = withoutVocalSupplementField(finalVocals, "phonetic");
      }
      if (!translationModeEnabled) {
        finalVocals = withoutVocalSupplementField(finalVocals, "translation");
      }
      const mergeModeVocalResults = (modeLine, isPhoneticMode) => {
        const targetField = isPhoneticMode ? "phonetic" : "translation";
        finalVocals = mergeVocalTranslationFields(
          finalVocals,
          modeLine?.vocals,
          targetField,
          (value, originalPart) => {
            const processedValue = isPhoneticMode
              ? processPhoneticHyphen(value)
              : value;
            const text = String(processedValue || "").trim();
            return isNoteLine(text)
              || areTextsEquivalent(text, getTranslationPartText(originalPart))
              ? ""
              : text;
          }
        );
      };

      if (mode1 && Array.isArray(mode1) && i < mode1.length && mode1[i]) {
        mergeModeVocalResults(mode1[i], mode1IsPhonetic);
      }
      if (mode2 && Array.isArray(mode2) && i < mode2.length && mode2[i]) {
        mergeModeVocalResults(mode2[i], mode2IsPhonetic);
      }

      // Create safe line object ensuring all properties are valid
      const finalPhoneticText = finalText ? String(finalText) : null;
      const finalTranslationText = finalText2 ? String(finalText2) : null;
      const safeLine = {
        ...(line && typeof line === "object" ? line : {}),
        vocals: finalVocals,
        originalText: String(originalText),
        phoneticText: finalPhoneticText,
        text: finalPhoneticText,
        text2: finalTranslationText,
        translationText: finalTranslationText,
      };

      if (!finalPhoneticText) {
        delete safeLine.phonetic;
        delete safeLine.pronunciationText;
        delete safeLine.pronText;
      }
      if (!finalTranslationText) {
        delete safeLine.translation;
        delete safeLine.transText;
      }

      return safeLine;
    });

    return this.applyCulturalAnnotations(processedLyrics, this.state.uri);
  }

  getGeminiTranslation(lyricsState, lyrics, mode, onProgress = null) {
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
      const cacheKey2 = getDisplayModeCacheKey(lyricsState, cacheKey);
      const cached = CacheManager.get(cacheKey2);

      if (cached) {
        // Fix cached items if they have double-encoded JSON structure
        let fixNeeded = false;
        let targetField = wantSmartPhonetic ? 'phonetic' : 'translation';

        if (cached[targetField] && Array.isArray(cached[targetField]) &&
          cached[targetField].length === 1 && typeof cached[targetField][0] === 'string' &&
          cached[targetField][0].trim().startsWith('{')) {
          try {
            const parsed = JSON.parse(cached[targetField][0]);
            if (wantSmartPhonetic && Array.isArray(parsed.phonetic)) {
              cached.phonetic = parsed.phonetic;
              fixNeeded = true;
            } else if (!wantSmartPhonetic && Array.isArray(parsed.translation)) {
              cached.translation = parsed.translation;
              fixNeeded = true;
            } else if (parsed.translation && Array.isArray(parsed.translation)) {
              // Fallback
              cached[targetField] = parsed.translation;
              fixNeeded = true;
            }
          } catch (e) { }
        }

        return resolve(cached);
      }

      // De-duplicate concurrent calls per (uri, type). Share the same promise for callers
      const inflightKey = cacheKey2;
      if (this._inflightGemini?.has(inflightKey)) {
        return this._inflightGemini
          .get(inflightKey)
          .then(resolve)
          .catch(reject);
      }

      // Filter out section headers before sending to Gemini for translation
      const text = getNonSectionLyricsText(lyrics);
      const legacyText = getLegacyNonSectionLyricsText(lyrics);
      const trackId = Utils.extractTrackId(lyricsState.uri || this.state.uri);
      const userLang = this.getTranslationTargetLanguage();

      const mapResultLinesToLyrics = (linesInput, splitVocalParts = true) => {
        return mapTranslationLinesToLyrics(lyrics, linesInput, {
          targetField: wantSmartPhonetic ? "phonetic" : "translation",
          splitVocalParts,
        });
      };

      const streamedLines = [];
      const handleStreamLine = onProgress
        ? (lineIndex, lineText) => {
          if (typeof lineIndex !== "number" || lineIndex < 0) return;
          streamedLines[lineIndex] = typeof lineText === "string" ? lineText : "";
          const partialMapped = mapResultLinesToLyrics(streamedLines);
          if (partialMapped && this.isCurrentLyricsState(lyricsState)) {
            onProgress(partialMapped);
          }
        }
        : null;
      const handleStreamReset = onProgress
        ? (detail = {}) => {
          streamedLines.length = 0;
          if (this.isCurrentLyricsState(lyricsState)) {
            onProgress(null, { ...detail, reset: true });
          }
        }
        : null;

      // Start appropriate loading indicator based on mode type (1초 후 표시)
      const loadingToken = wantSmartPhonetic
        ? this.startPhoneticLoading()
        : this.startTranslationLoading();
      let loadingCompleted = false;

      const inflightPromise = (async () => {
        let splitVocalParts = true;
        const getCachedOutput = async (cacheText) => {
          const cachedResult = await getCachedTranslationForText({
            trackId,
            lang: userLang,
            isPhonetic: wantSmartPhonetic,
            provider: lyricsState.provider,
            text: cacheText,
          });
          return getTranslationOutputFromCache(cachedResult, wantSmartPhonetic);
        };

        let outText = await getCachedOutput(text);
        if (!outText) {
          const legacyOutput = await getCachedOutput(legacyText);
          if (legacyOutput) {
            splitVocalParts = false;
            outText = legacyOutput;
          }
        }

        if (!outText) {
          // Use optimized rate limiter with separate keys only when a real AI call is needed.
          const rateLimitKey = mode.replace("gemini_", "gemini-");
          if (!RateLimiter.canMakeCall(rateLimitKey, 5, 2000)) {
            throw new Error(
              I18n.t("notifications.tooManyTranslationRequests")
            );
          }

          const response = await window.Translator.callGemini({
            apiKey,
            artist: this.state.artist || lyricsState.artist,
            title: this.state.title || lyricsState.title,
            text,
            wantSmartPhonetic,
            sourceLang:
              this.trackLanguageOverride || this.provideLanguageCode(lyrics) || "auto",
            provider: lyricsState.provider,
            onLine: handleStreamLine,
            onStreamReset: handleStreamReset,
          });

          if (wantSmartPhonetic) {
            outText = response.phonetic;
          } else {
            outText = response.translation || response.vi;
          }
        }

        if (!outText) throw new Error("Empty result from Gemini.");

        // Handle nested JSON packaging (API issue workaround)
        if (Array.isArray(outText) && outText.length === 1 && typeof outText[0] === 'string') {
          try {
            if (outText[0].trim().startsWith('{')) {
              const parsed = JSON.parse(outText[0]);
              if (wantSmartPhonetic && Array.isArray(parsed.phonetic)) {
                outText = parsed.phonetic;
              } else if (!wantSmartPhonetic && Array.isArray(parsed.translation)) {
                outText = parsed.translation;
              } else if (parsed.translation && Array.isArray(parsed.translation)) {
                // Fallback: request was phonetic but response came as translation?
                // or just general structure match
                outText = parsed.translation;
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
        const mapped = mapResultLinesToLyrics(lines, splitVocalParts);
        if (!mapped) {
          throw new Error("Failed to map streamed translation lines.");
        }
        CacheManager.set(cacheKey2, mapped);
        loadingCompleted = true;
        return mapped;
      })()
        .finally(() => {
          // Clear appropriate loading indicator based on mode type
          if (wantSmartPhonetic) {
            this.clearPhoneticLoading(loadingToken, { completed: loadingCompleted });
          } else {
            this.clearTranslationLoading(loadingToken, { completed: loadingCompleted });
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

      const cacheKey = `${lyricsState.uri}:trad:${language}:${displayMode}:${getSyncDataRendererCacheVersion(lyricsState)}`;
      const cached = CacheManager.get(cacheKey);
      if (cached) return resolve(cached);

      // De-duplicate concurrent calls per (uri, language, mode)
      this._inflightTrad = this._inflightTrad || new Map();
      const inflightKey = cacheKey;
      if (this._inflightTrad.has(inflightKey)) {
        return this._inflightTrad.get(inflightKey).then(resolve).catch(reject);
      }

      // Start translation loading indicator (1초 후 표시)
      const loadingToken = this.startTranslationLoading();
      let loadingCompleted = false;

      const inflightPromise = this.translateLyrics(
        language,
        lyrics,
        displayMode
      )
        .then((translated) => {
          if (translated !== undefined && translated !== null) {
            CacheManager.set(cacheKey, translated);
            loadingCompleted = true;
            return translated;
          }
          throw new Error("Empty result from conversion.");
        })
        .finally(() => {
          this.clearTranslationLoading(loadingToken, { completed: loadingCompleted });
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

  getText(key, fallback) {
    const value = I18n?.t?.(key);
    return value && value !== key ? value : fallback;
  }

  getLocalLyricsStore() {
    try {
      const localLyrics = JSON.parse(StorageManager.getItem(`${APP_NAME}:local-lyrics`) || "{}");
      return localLyrics && typeof localLyrics === "object" ? localLyrics : {};
    } catch (error) {
      console.warn("[ivLyrics] Failed to parse local lyrics store:", error);
      return {};
    }
  }

  getSavedLocalLyrics(uri) {
    if (!uri) {
      return null;
    }
    const localLyrics = this.getLocalLyricsStore();
    return localLyrics[uri] || null;
  }

  saveLocalLyrics(uri, lyrics) {
    // Include translations and phonetic conversions in cache
    const fullLyricsData = {
      ...lyrics,
      ...this.getTranslationStates(),
    };

    const localLyrics = this.getLocalLyricsStore();
    localLyrics[uri] = fullLyricsData;
    StorageManager.setItem(
      `${APP_NAME}:local-lyrics`,
      JSON.stringify(localLyrics)
    );
    this.setState({ isCached: true });
  }

  deleteLocalLyrics(uri) {
    const localLyrics = this.getLocalLyricsStore();
    delete localLyrics[uri];
    StorageManager.setItem(
      `${APP_NAME}:local-lyrics`,
      JSON.stringify(localLyrics)
    );
    this.setState({ isCached: false });
  }

  lyricsSaved(uri) {
    return !!this.getSavedLocalLyrics(uri);
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
        if (key.startsWith(`${uri}:`)) {
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

  getParsedLocalLyricsTypes(localLyrics) {
    return ["karaoke", "synced", "unsynced"]
      .filter((key) => Array.isArray(localLyrics?.[key]) && localLyrics[key].length > 0)
      .map((key) => key[0].toUpperCase() + key.slice(1));
  }

  async applyLocalLyrics(localLyrics, { sourceLabel = "local", successMessage = null } = {}) {
    const currentUri = this.currentTrackUri || this.state.uri;
    if (!currentUri) {
      Toast.error(this.getText("notifications.noTrackPlaying", "No track playing"));
      return false;
    }

    const parsedKeys = this.getParsedLocalLyricsTypes(localLyrics);
    if (!parsedKeys.length) {
      Toast.error(this.getText("notifications.noValidLyricsInFile", "No valid lyrics found"));
      return false;
    }

    const parsedLyrics = {
      karaoke: Array.isArray(localLyrics.karaoke) && localLyrics.karaoke.length ? localLyrics.karaoke : null,
      synced: Array.isArray(localLyrics.synced) && localLyrics.synced.length ? localLyrics.synced : null,
      unsynced: Array.isArray(localLyrics.unsynced) && localLyrics.unsynced.length ? localLyrics.unsynced : null,
      provider: "local",
      uri: currentUri,
      localLyricsSource: sourceLabel,
    };
    let nextLyrics = parsedLyrics;
    if (window.PseudoKaraokeService?.applyToResult) {
      await window.PseudoKaraokeService.applyToResult(nextLyrics, {
        uri: currentUri,
        duration: Spicetify.Player?.data?.item?.duration?.milliseconds,
      });
    }
    nextLyrics = window.LyricsAddonManager?.normalizeResult?.(nextLyrics, {
      uri: currentUri,
      duration: Spicetify.Player?.data?.item?.duration?.milliseconds,
    }) || nextLyrics;
    const resetTranslations = {
      romaji: null,
      furigana: null,
      hiragana: null,
      katakana: null,
      hangul: null,
      romaja: null,
      cn: null,
      hk: null,
      tw: null,
      currentLyrics: null,
      language: null,
    };

    this.lastProcessedUri = null;
    this.lastProcessedMode = null;
    CacheManager.clearByUri(currentUri);
    if (this._dmResults?.[currentUri]) {
      delete this._dmResults[currentUri];
    }

    CACHE[currentUri] = {
      ...nextLyrics,
      trackLyricsProviderOverride: null,
    };
    window.LyricsService?.clearLyricsSnapshot?.(currentUri);
    window.LyricsService?.publishLyricsSnapshot?.({
      trackUri: currentUri,
      trackInfo: {
        uri: currentUri,
        title: this.state.title,
        artist: this.state.artist,
      },
      rawResult: CACHE[currentUri],
      provider: 'local',
      karaokeSource: nextLyrics.karaokeSource || null,
      trackLyricsProviderOverride: null,
      source: 'ivlyrics-page-base',
    });

    this.setState(
      {
        ...resetTranslations,
        ...nextLyrics,
        ...this.applyTranslationStates(nextLyrics),
        isLoading: false,
        isCached: true,
        error: null,
      },
      () => {
        const mode = this.getCurrentMode();
        this.lyricsSource(this.state, mode);
        this.saveLocalLyrics(currentUri, nextLyrics);
        window.dispatchEvent(new CustomEvent("ivLyrics:local-lyrics-updated", {
          detail: { trackUri: currentUri },
        }));
      }
    );

    const defaultSuccessMessage = this
      .getText("notifications.lyricsLoadedFromFile", "Lyrics loaded: {types}")
      .replace("{types}", parsedKeys.join(", "));
    Toast.success(successMessage || defaultSuccessMessage);
    return true;
  }

  importLocalLyricsFile() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".lrc,.txt,text/plain";
    input.onchange = (event) => this.processLyricsFromFile(event);
    input.click();
  }

  async applyLocalLyricsFromLrclibCandidate(candidate, options = {}) {
    const rawLyrics = String(
      candidate?.syncedLyrics ||
      candidate?.plainLyrics ||
      candidate?.previewText ||
      (candidate?.instrumental ? "[00:00.00]♪" : "")
    )
      .replace(/\[(\d+:\d+),(\d+)\]/g, "[$1.$2]")
      .replace(/<(\d+:\d+),(\d+)>/g, "<$1.$2>")
      .trim();

    if (!rawLyrics) {
      throw new Error(this.getText("menu.localLyricsNoCandidateLyrics", "No lyrics available in this result"));
    }

    const localLyrics = Utils.parseLocalLyrics(rawLyrics);
    const applied = await this.applyLocalLyrics(localLyrics, {
      sourceLabel: options?.source || "lrclib",
      successMessage: this.getText("notifications.lyricsLoadedFromLrclib", "LRCLIB에서 가사를 가져왔습니다."),
    });

    if (!applied) {
      throw new Error(this.getText("notifications.lyricsLoadFailed", "Failed to load lyrics"));
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

    reader.onload = async (e) => {
      try {
        const localLyrics = Utils.parseLocalLyrics(e.target.result);
        await this.applyLocalLyrics(localLyrics, { sourceLabel: "file" });
      } catch (e) {
        Toast.error(I18n.t("notifications.lyricsLoadFailed"));
      }
    };

    reader.onerror = () => {
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

  getPlaybackPaused() {
    const paused = Spicetify.Player?.data?.isPaused;
    if (typeof paused === "boolean") {
      return paused;
    }
    return !(Spicetify.Player?.isPlaying?.() ?? false);
  }

  isPlaybackUriCurrent(uri) {
    if (!uri) return false;
    const snapshot = window.Utils?.getPlayerPlaybackSnapshot?.() || null;
    const liveUri = snapshot?.uri || Spicetify.Player?.data?.item?.uri || "";
    return !liveUri || liveUri === uri;
  }

  clearPlaybackTrackResolutionTimer() {
    if (this._playbackTrackResolutionTimer) {
      clearTimeout(this._playbackTrackResolutionTimer);
      this._playbackTrackResolutionTimer = null;
    }
  }

  beginPlaybackTrackTransition(candidateTrack = null) {
    const candidateUri = candidateTrack?.uri || "";
    if (candidateUri && candidateUri === this.currentTrackUri) return false;

    const transitionSeq = ++this._lyricsFetchSeq;
    this._activeLyricsFetchSeq = transitionSeq;
    this.clearPendingLyricsUpdates();
    if (this.state.isLyricsEditModalOpen) {
      this.closeLyricsEditModal({ force: true });
    }
    this.setState({
      karaoke: null,
      karaokeGranularity: null,
      synced: null,
      unsynced: null,
      currentLyrics: null,
      isLoading: true,
      lyricsRequestSeq: transitionSeq,
    });
    return true;
  }

  commitDjNarrationTrack(track, snapshot) {
    const uri = track?.uri || snapshot?.uri || "";
    if (this.state.isLyricsEditModalOpen) {
      this.closeLyricsEditModal({ force: true });
    }
    const transitionSeq = ++this._lyricsFetchSeq;
    this._activeLyricsFetchSeq = transitionSeq;
    this.currentTrackUri = uri;
    this.trackLanguageOverride = null;
    this.trackLyricsProviderOverride = null;
    this.trackBackgroundOverride = null;
    this.clearPendingLyricsUpdates();
    this.setState({
      ...emptyState,
      uri,
      title: track?.metadata?.title || track?.name || "Spotify DJ",
      artist: track?.metadata?.artist_name || "",
      coverUrl: track?.metadata?.image_xlarge_url || track?.metadata?.image_url || null,
      error: "DJ narration",
      isLoading: false,
      explicitMode: -1,
      lyricsRequestSeq: transitionSeq,
      videoInfo: null,
    });
  }

  commitResolvedPlaybackTrack(track, snapshot) {
    const newUri = track?.uri;
    if (!newUri) return;

    if (snapshot?.djNarration === true) {
      this.commitDjNarrationTrack(track, snapshot);
      return;
    }

    if (this.currentTrackUri === newUri) {
      window.Utils?.clearSafePlayerProgressCorrection?.();
      return;
    }

    if (this.state.isLyricsEditModalOpen) {
      this.closeLyricsEditModal({ force: true });
    }
    const previousTrackId = Utils.extractTrackId(this.currentTrackUri);
    if (previousTrackId) {
      window.Translator.clearInflightRequests(previousTrackId);
    }

    const transitionInfo = this.infoFromTrack(track) || { uri: newUri };
    const transitionSeq = ++this._lyricsFetchSeq;
    this._activeLyricsFetchSeq = transitionSeq;
    this.currentTrackUri = newUri;
    this.trackLanguageOverride = null;
    this.trackLyricsProviderOverride = null;
    this.trackBackgroundOverride = null;
    this.clearPendingLyricsUpdates();
    this.setState({
      ...this.getLoadingLyricsState(transitionInfo, transitionSeq),
      explicitMode: -1,
    }, () => {
      this.fetchLyrics(track, -1);
    });
    this.viewPort?.scrollTo?.(0, 0);

    this.setState({ videoInfo: null });
    this.loadSavedVideoForTrack(newUri);
  }

  schedulePlaybackTrackResolution(candidateTrack = null) {
    const resolutionSeq = ++this._playbackTrackResolutionSeq;
    const deadline = Date.now() + 4000;
    this.clearPlaybackTrackResolutionTimer();
    let transitionCleared = this.beginPlaybackTrackTransition(candidateTrack);

    const resolve = () => {
      if (!this._isComponentMounted || resolutionSeq !== this._playbackTrackResolutionSeq) {
        return;
      }

      const snapshot = window.Utils?.getPlayerPlaybackSnapshot?.() || null;
      const stableTrack = window.Utils?.resolveStablePlaybackTrack?.(candidateTrack, snapshot) || null;
      const trackChanged = !!stableTrack?.uri && stableTrack.uri !== this.currentTrackUri;

      if (!transitionCleared && snapshot?.uri && snapshot.uri !== this.currentTrackUri) {
        transitionCleared = this.beginPlaybackTrackTransition({ uri: snapshot.uri });
      }

      if (snapshot?.djNarration === true && snapshot.uri) {
        this.clearPlaybackTrackResolutionTimer();
        this.commitDjNarrationTrack(stableTrack, snapshot);
        return;
      }

      if (stableTrack && trackChanged) {
        this.clearPlaybackTrackResolutionTimer();
        this.commitResolvedPlaybackTrack(stableTrack, snapshot);
        return;
      }

      if (Date.now() >= deadline) {
        this.clearPlaybackTrackResolutionTimer();
        if (transitionCleared) {
          this.setState({ isLoading: false, error: "Playback transition unresolved" });
        }
        return;
      }

      this._playbackTrackResolutionTimer = setTimeout(resolve, 100);
    };

    resolve();
  }

  componentDidMount() {
    this._isComponentMounted = true;
    document.body.classList.add('ivlyrics-page-active');

    // Prevent duplicate global registration
    if (window.lyricContainer && window.lyricContainer !== this) {
      if (typeof window.lyricContainer.componentWillUnmount === "function") {
        window.lyricContainer.componentWillUnmount();
      }
    }

    // Register instance for external access
    window.lyricContainer = this;
    // Note: reloadLyrics will be exposed after it's defined below

    this._unsubscribeLyricsProviderAttempt = window.LyricsAddonManager?.on?.(
      "lyrics:search:progress",
      this.handleLyricsProviderAttempt
    ) || null;

    this.handleSyncCreatorVisibility = (event) => {
      const active = event?.detail?.active ?? !!document.getElementById("ivLyrics-sync-creator-overlay");
      if (this.state.isSyncCreatorActive !== active) {
        this.lastProcessedMode = null;
        this.setState({ isSyncCreatorActive: active });
      }
    };
    window.addEventListener("ivLyrics:sync-creator-visibility", this.handleSyncCreatorVisibility);
    this.handleSyncCreatorVisibility();

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
    if (!window.__ivLyricsUpdateCheckStarted && !window.__ivLyricsUpdateCheckTimer) {
      window.__ivLyricsUpdateCheckPending = true;
      window.__ivLyricsUpdateCheckTimer = setTimeout(() => {
        window.__ivLyricsUpdateCheckTimer = null;
        Utils.showUpdateNotificationIfAvailable().catch((error) => {
          // Error ignored
        }).finally(() => {
          window.__ivLyricsUpdateCheckStarted = true;
          window.__ivLyricsUpdateCheckPending = false;
          window.dispatchEvent(new CustomEvent("ivLyrics:update-check-complete"));
        });
      }, 3000); // Delay to avoid interfering with app startup
    }

    // Initialize enhanced cache system only once
    if (!CacheManager._initialized) {
      CacheManager.init();
      CacheManager._initialized = true;
    }

    this.updatePlaybackPausedState = () => {
      const isPlaybackPaused = this.getPlaybackPaused();
      if (this.state.isPlaybackPaused !== isPlaybackPaused) {
        this.setState({ isPlaybackPaused });
      }
    };
    this.updatePlaybackPausedState();
    Spicetify.Player?.addEventListener?.("onplaypause", this.updatePlaybackPausedState);
    Spicetify.Player?.addEventListener?.("songchange", this.updatePlaybackPausedState);

    this.onQueueChange = async ({ data: queue }) => {
      if (queue.current?.uri && queue.current.uri !== this.currentTrackUri) {
        this.schedulePlaybackTrackResolution(queue.current);
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

    this.handlePlaybackSongChange = (event) => {
      this.schedulePlaybackTrackResolution(event?.data?.item || null);
    };
    Spicetify.Player?.addEventListener?.("songchange", this.handlePlaybackSongChange);

    if (Spicetify.Player?.data?.item) {
      this.schedulePlaybackTrackResolution(Spicetify.Player.data.item);
    }

    this.updateVisualOnConfigChange();
    Utils.addQueueListener(this.onQueueChange);

    lyricContainerUpdate = () => {
      this.reRenderLyricsPage = !this.reRenderLyricsPage;
      this.updateVisualOnConfigChange();
      this.forceUpdate();
    };

    reloadLyrics = async (clearCache = true) => {
      ivLyricsDebug("[ivLyrics] Reloading lyrics...", { trackId: Spicetify.Player.data?.item?.uri, clearCache });

      // 메모리 캐시는 항상 초기화 (window.CACHE와의 참조를 유지하기 위해 객체의 키만 삭제)
      Object.keys(CACHE).forEach(key => delete CACHE[key]);

      // 현재 트랙 정보
      const item = Spicetify.Player.data?.item;
      const trackUri = item?.uri;
      const spotifyTrackId = Utils.extractTrackId(trackUri);
      const lyricsCacheId = spotifyTrackId || (trackUri ? `local-uri:${trackUri}` : null);

      if (item && trackUri) {
        const reloadInfo = this.infoFromTrack(item) || { uri: trackUri };
        const reloadSeq = ++this._lyricsFetchSeq;
        this.currentTrackUri = trackUri;
        this._activeLyricsFetchSeq = reloadSeq;
        this.clearPendingLyricsUpdates();
        this.lastProcessedUri = null;
        this.lastProcessedMode = null;
        this.setState(this.getLoadingLyricsState(reloadInfo, reloadSeq));
      }

      // CacheManager (Gemini 번역 메모리 캐시)도 항상 현재 트랙에 대해 초기화
      if (trackUri) {
        CacheManager.clearByUri(trackUri);
      }

      // _dmResults (번역/발음 결과 메모리 캐시)도 초기화
      if (this._dmResults) {
        if (trackUri) {
          delete this._dmResults[trackUri];
        } else {
          this._dmResults = {};
        }
      }

      // 진행 중인 Gemini 요청도 취소
      if (this._inflightGemini && trackUri) {
        for (const [key] of this._inflightGemini) {
          if (key.startsWith(`${trackUri}:`)) {
            this._inflightGemini.delete(key);
          }
        }
      }

      // clearCache가 true이고 트랙 정보가 있으면 가사 캐시도 삭제
      if (clearCache && lyricsCacheId) {
        ivLyricsDebug("[ivLyrics] Clearing track cache for:", lyricsCacheId);
        this.clearCulturalAnnotationsForTrack(trackUri);
        await LyricsCache.clearTrack(lyricsCacheId);
      }
      if (clearCache && spotifyTrackId) {
        window.Translator?.clearMemoryCache?.(spotifyTrackId);
        window.Translator?.clearInflightRequests?.(spotifyTrackId);
        const clearSyncDataIsrc = window.SyncDataService?.getTrackIsrc?.(spotifyTrackId, {
          item,
          title: item?.name,
          artist: item?.artists,
          album: item?.album?.name,
        }) || "";
        if (clearSyncDataIsrc) {
          window.SyncDataService?.clearCache(clearSyncDataIsrc, { isrc: clearSyncDataIsrc });
        } else {
          window.SyncDataService?.clearCache();
        }
      }

      this.updateVisualOnConfigChange();
      this.forceUpdate();
      ivLyricsDebug("[ivLyrics] Fetching new lyrics...");
      this.fetchLyrics(
        Spicetify.Player.data.item,
        this.state.explicitMode,
        true
      );
    };

    // Expose reloadLyrics for external calls (e.g. SyncDataCreator)
    this.reloadLyrics = reloadLyrics;
    window.reloadLyrics = reloadLyrics;

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

    this.setFullscreenPresentation = (nextPresentation) => {
      const normalized = rememberIvLyricsFullscreenPresentation(
        nextPresentation
      );
      this.setState({ fullscreenPresentation: normalized });
      return normalized;
    };

    this.exitFullscreenPresentation = () => {
      if (
        normalizeIvLyricsFullscreenPresentation(
          this.state.fullscreenPresentation
        ) === "standard"
      ) {
        return false;
      }

      this.setFullscreenPresentation("standard");
      return true;
    };

    this.toggleFullscreen = () => {
      const isEnabled = !this.state.isFullscreen;
      const rememberedPresentation = isEnabled
        ? getRememberedIvLyricsFullscreenPresentation()
        : rememberIvLyricsFullscreenPresentation(
          this.state.fullscreenPresentation
        );
      const usePageFullscreenUi = isEnabled
        ? CONFIG.visual["fullscreen-page-ui-only"] === true
        : this.fullscreenUsesPageUi === true;
      const useBrowserFullscreen =
        !usePageFullscreenUi && CONFIG.visual["fullscreen-browser-fullscreen"] === true;
      if (isEnabled) {
        this.fullscreenUsesPageUi = usePageFullscreenUi;
        // 기존 컨테이너가 DOM에 남아있으면 제거
        const existingContainer = document.getElementById("lyrics-fullscreen-container");
        if (existingContainer) {
          existingContainer.innerHTML = '';
          existingContainer.remove();
        }
        if (usePageFullscreenUi) {
          this.fullscreenContainer = null;
        } else {
          // 새로운 전체화면 컨테이너 생성
          this.fullscreenContainer = document.createElement("div");
          this.fullscreenContainer.id = "lyrics-fullscreen-container";
          // TMI 폰트 크기 CSS 변수 설정
          const tmiScale = (CONFIG.visual["fullscreen-tmi-font-size"] || 100) / 100;
          this.fullscreenContainer.style.setProperty("--fullscreen-tmi-font-size", tmiScale);
          document.body.append(this.fullscreenContainer);
        }
        const hasOpenIvLyricsDialog = () => Boolean(document.querySelector(
          '.ivlyrics-fluent-overlay:not([aria-hidden="true"]), .lyrics-sync-adjust-floating [role="dialog"], .ivlyrics-settings-overlay.is-open, .community-video-overlay, .ivlyrics-cache-edit-overlay'
        ));
        this.mousetrap.bind("esc", () => {
          if (hasOpenIvLyricsDialog()) return;
          if (this.exitFullscreenPresentation()) return;
          this.toggleFullscreen();
        });
        // 전체화면 키 직접 리스너 추가 (Mousetrap이 캡처하지 못할 경우 대비)
        this._escHandler = (e) => {
          if (e.key === "Escape" && this.state.isFullscreen) {
            if (hasOpenIvLyricsDialog()) return;
            e.preventDefault();
            e.stopPropagation();
            if (this.exitFullscreenPresentation()) return;
            this.toggleFullscreen();
            return;
          }

          const isLyricsHideToggleKey =
            e.code === "KeyL" ||
            String(e.key || "").toLowerCase() === "l";
          if (
            isLyricsHideToggleKey &&
            this.state.isFullscreen &&
            !e.repeat &&
            !e.metaKey &&
            !e.ctrlKey &&
            !e.altKey &&
            !this.isShortcutInputFocused()
          ) {
            e.preventDefault();
            e.stopPropagation();
            this.toggleFullscreenLyricsHidden();
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
        this.fullscreenUsesPageUi = false;
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
        fullscreenPresentation: rememberedPresentation,
        fullscreenLyricsHidden: isEnabled ? this.state.fullscreenLyricsHidden : false,
        justEnteredFullscreen: isEnabled, // 전체화면 진입 시 true로 설정하여 축소 아이콘 대신 메뉴 아이콘 표시
        isFloatingMenuOpen: isEnabled ? this.state.isFloatingMenuOpen : false,
        isFloatingMenuClosing: false,
      });
    };
    this.mousetrap.reset();
    // 전체화면 단축키는 GlobalShortcuts.js에서 전역으로 처리
    window.addEventListener("fad-request", lyricContainerUpdate);

    // 설정 변경 리스너 - 노래방 모드 토글 처리
    this.handleConfigChange = (event) => {
      if (event.detail?.name === "karaoke-mode-enabled") {
        // 노래방 모드 설정이 변경되면 현재 모드를 다시 계산
        this.setState({ explicitMode: -1 });
      } else if (event.detail?.name === "spotify-fake-karaoke-enabled") {
        this.reloadLyrics?.(false);
      } else if (event.detail?.name === "pseudo-karaoke-render-advance") {
        this.forceUpdate?.();
      } else if (
        event.detail?.type === "fullscreen-presentation"
        && this.state.isFullscreen
      ) {
        this.setFullscreenPresentation(event.detail.value);
      }
    };
    window.addEventListener("ivLyrics", this.handleConfigChange);

    this.handleFuriganaReady = () => {
      if (window.CONFIG?.visual?.["furigana-enabled"]) {
        this.forceUpdate();
      }
    };
    window.addEventListener("furigana-ready", this.handleFuriganaReady);

    // Listen for lyric index changes from Pages.js
    this.handleLyricIndexChange = (event) => {
      if (event.detail && typeof event.detail.index === 'number') {
        this.setState({ currentLyricIndex: event.detail.index });
      }
    };
    window.addEventListener("ivLyrics:lyric-index-changed", this.handleLyricIndexChange);

    // Portrait viewport detection listener
    if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
      this._portraitMql = window.matchMedia("(orientation: portrait)");
      this._portraitChangeHandler = (e) => {
        this._isPortraitViewport = e.matches;
        this.forceUpdate();
      };
      if (this._portraitMql.addEventListener) {
        this._portraitMql.addEventListener("change", this._portraitChangeHandler);
      } else if (this._portraitMql.addListener) {
        this._portraitMql.addListener(this._portraitChangeHandler);
      }
    }
  }

  componentWillUnmount() {
    this._isComponentMounted = false;
    this._lyricsEditRequestSeq += 1;
    document.body.classList.remove('ivlyrics-page-active');

    // Core cleanup
    Utils.removeQueueListener(this.onQueueChange);
    this.configButton?.deregister();
    this.mousetrap?.reset();
    window.removeEventListener("fad-request", lyricContainerUpdate);
    window.removeEventListener("ivLyrics", this.handleConfigChange);
    window.removeEventListener("furigana-ready", this.handleFuriganaReady);
    window.removeEventListener("ivLyrics:lyric-index-changed", this.handleLyricIndexChange);
    window.removeEventListener("ivLyrics:sync-creator-visibility", this.handleSyncCreatorVisibility);
    this._unsubscribeLyricsProviderAttempt?.();
    this._unsubscribeLyricsProviderAttempt = null;
    Spicetify.Player?.removeEventListener?.("onplaypause", this.updatePlaybackPausedState);
    Spicetify.Player?.removeEventListener?.("songchange", this.updatePlaybackPausedState);
    Spicetify.Player?.removeEventListener?.("songchange", this.handlePlaybackSongChange);
    this.updatePlaybackPausedState = null;
    this.handlePlaybackSongChange = null;
    this._playbackTrackResolutionSeq += 1;
    this.clearPlaybackTrackResolutionTimer();
    if (this._cleanupFloatingMenuOutsideClick) {
      this._cleanupFloatingMenuOutsideClick();
      this._cleanupFloatingMenuOutsideClick = null;
    }
    this.clearFloatingMenuCloseTimer();

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

    // Portrait viewport listener cleanup
    if (this._portraitMql && this._portraitChangeHandler) {
      if (this._portraitMql.removeEventListener) {
        this._portraitMql.removeEventListener("change", this._portraitChangeHandler);
      } else if (this._portraitMql.removeListener) {
        this._portraitMql.removeListener(this._portraitChangeHandler);
      }
      this._portraitMql = null;
      this._portraitChangeHandler = null;
    }

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

    // Clean up generation loading and completion timers
    this.clearLyricsLoading();
    this.clearPhoneticLoading();
    this.clearTranslationLoading();
    this.clearCulturalAnnotationsLoading();
    this.clearVideoBackgroundLoadingDelay();
    ["lyrics", "translation", "pronunciation", "cultural-annotations", "video-background"].forEach((kind) => {
      this.clearGenerationPillTimers(kind);
    });
    this._visibleGenerationPills.clear();
    this._generationRequestDetails.clear();
    if (this.streamingApplyTimer) {
      clearTimeout(this.streamingApplyTimer);
      this.streamingApplyTimer = null;
    }
    this.pendingStreamingPayload = null;

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
    this.availableModes = CONFIG.modes;

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
      ...getLyricsTypographyStyleVariables(CONFIG.visual),
      "--animation-tempo": this.state.tempo,
      "--lyrics-fullscreen-right-padding": `${CONFIG.visual["fullscreen-lyrics-right-padding"] || 40}px`,
      "--fullscreen-tmi-font-size": (CONFIG.visual["fullscreen-tmi-font-size"] || 100) / 100,
    };

    // mousetrap은 ESC 키 등 전체화면 내 단축키용으로만 사용
    // 전체화면 단축키는 GlobalShortcuts.js에서 전역으로 처리
  }

  isModeAvailable(mode, lyricsState = this.state) {
    if (!lyricsState || mode === -1) return false;
    if (isKaraokeRenderMode(mode)) {
      return !!lyricsState.karaoke && CONFIG.visual["karaoke-mode-enabled"];
    }
    if (mode === SYNCED) return !!lyricsState.synced;
    if (mode === UNSYNCED) return !!lyricsState.unsynced;
    return false;
  }

  getAutomaticMode(lyricsState = this.state) {
    // Prefer renderers independently of source timing granularity: word-timed
    // karaoke also supports character rendering.
    return [KARAOKE, WORD_KARAOKE, SYNCED, UNSYNCED]
      .find((mode) => this.isModeAvailable(mode, lyricsState)) ?? -1;
  }

  getCurrentMode() {
    if (this.isModeAvailable(this.state.lockedMode)) {
      return this.state.lockedMode;
    }
    if (this.isModeAvailable(this.state.explicitMode)) {
      return this.state.explicitMode;
    }
    return this.getAutomaticMode();
  }

  render() {
    // 미리보기 컴포넌트에서 사용할 수 있도록 첫 가사 시간을 전역으로 노출
    window.ivLyrics_firstLyricTime = this.state.currentLyrics && this.state.currentLyrics.length > 0
      ? this.state.currentLyrics[0].startTime
      : null;

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
    const isSyncCreatorOverlayPresent =
      typeof document !== "undefined" &&
      !!document.getElementById("ivLyrics-sync-creator-overlay");
    const isSyncCreatorActive =
      this.state.isSyncCreatorActive === true && isSyncCreatorOverlayPresent;
    const effectiveBackgroundMode = this.getEffectiveBackgroundMode(this.state.trackBackgroundOverride);
    const baseLyricsStyleVariables = {
      "--lyrics-color-active": CONFIG.visual["active-color"],
      "--lyrics-color-inactive": CONFIG.visual["inactive-color"],
      "--lyrics-color-background": "transparent",
      "--lyrics-highlight-background": CONFIG.visual["highlight-color"],
      "--lyrics-background-noise": CONFIG.visual.noise
        ? "var(--background-noise)"
        : "unset",
    };

    if (isSyncCreatorActive) {
      this.styleVariables = {
        "--lyrics-color-active": "var(--spice-text, #ffffff)",
        "--lyrics-color-inactive": "var(--spice-subtext, rgba(255, 255, 255, 0.58))",
        "--lyrics-color-background": "var(--spice-main, #121212)",
        "--lyrics-highlight-background": "transparent",
        "--lyrics-background-noise": "unset",
      };
    } else if (this.state.isFADMode) {
      // Text colors will be set by FAD extension
      // Disable colorful backgrounds in FAD mode
      this.styleVariables = {};
    } else if (effectiveBackgroundMode === "colorful" && this.state.colors.background) {
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
    } else if (effectiveBackgroundMode === "solid-background") {
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
    } else {
      this.styleVariables = baseLyricsStyleVariables;
    }

    const backgroundStyle = {};
    const compositedBackgroundStyle = {
      willChange: "filter, transform, opacity",
      backfaceVisibility: "hidden",
      WebkitBackfaceVisibility: "hidden",
      transform: "translateZ(0)",
      contain: "paint",
    };
    // Disable background features when in FAD mode (Full Screen extension)
    if (isSyncCreatorActive) {
      backgroundStyle.backgroundColor = "var(--spice-main, #121212)";
      backgroundStyle.filter = "none";
    } else if (!this.state.isFADMode && effectiveBackgroundMode === "video-background") {
      // Video background is handled by the component
    } else if (!this.state.isFADMode && effectiveBackgroundMode === "gradient-background") {
      const brightness = CONFIG.visual["background-brightness"] / 100;
      const blurAmount = CONFIG.visual["album-bg-blur"] ?? 20;
      // 앨범 커버 이미지 가져오기
      const albumArtUrl =
        Spicetify.Player.data?.item?.metadata?.image_xlarge_url ||
        Spicetify.Player.data?.item?.metadata?.image_large_url ||
        Spicetify.Player.data?.item?.metadata?.image_url;

      if (albumArtUrl) {
        Object.assign(backgroundStyle, compositedBackgroundStyle);
        backgroundStyle.backgroundImage = `url(${albumArtUrl})`;
        backgroundStyle.backgroundRepeat = "no-repeat";
        backgroundStyle.filter = `brightness(${brightness}) blur(${blurAmount}px)`;
        backgroundStyle.backgroundSize = "cover";
        backgroundStyle.backgroundPosition = "center";
      }
    } else if (!this.state.isFADMode && effectiveBackgroundMode === "blur-gradient-background") {
      const brightness = CONFIG.visual["background-brightness"] / 100;

      // hex/rgb 문자열에서 RGB 값 추출
      const parseColor = (color) => {
        if (!color) return { r: 30, g: 30, b: 40 };
        // hex 형식
        const hexMatch = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(color);
        if (hexMatch) {
          return { r: parseInt(hexMatch[1], 16), g: parseInt(hexMatch[2], 16), b: parseInt(hexMatch[3], 16) };
        }
        // rgb() 형식
        const rgbMatch = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(color);
        if (rgbMatch) {
          return { r: parseInt(rgbMatch[1]), g: parseInt(rgbMatch[2]), b: parseInt(rgbMatch[3]) };
        }
        return { r: 30, g: 30, b: 40 };
      };

      let c1 = { r: 30, g: 30, b: 40 };
      let c2 = { r: 60, g: 40, b: 70 };
      let c3 = { r: 20, g: 50, b: 60 };

      if (this.state.dynamicColors) {
        c1 = parseColor(this.state.dynamicColors.minContrast);
        c2 = parseColor(this.state.dynamicColors.highContrast);
        c3 = parseColor(this.state.dynamicColors.overlayColor);
      }

      backgroundStyle["--ivLyrics-c1"] = `${c1.r}, ${c1.g}, ${c1.b}`;
      backgroundStyle["--ivLyrics-c2"] = `${c2.r}, ${c2.g}, ${c2.b}`;
      backgroundStyle["--ivLyrics-c3"] = `${c3.r}, ${c3.g}, ${c3.b}`;
      Object.assign(backgroundStyle, compositedBackgroundStyle);
      backgroundStyle.filter = `brightness(${brightness}) saturate(2.5)`;
    } else if (
      !this.state.isFADMode &&
      effectiveBackgroundMode === "colorful" &&
      this.state.colors.background
    ) {
      const brightness = CONFIG.visual["background-brightness"] / 100;
      backgroundStyle.backgroundColor = this.state.colors.background;
      backgroundStyle.filter = `brightness(${brightness})`;
    } else if (!this.state.isFADMode && effectiveBackgroundMode === "solid-background") {
      const brightness = CONFIG.visual["background-brightness"] / 100;
      backgroundStyle.backgroundColor = CONFIG.visual["solid-background-color"];
      backgroundStyle.filter = `brightness(${brightness})`;
    }

    const vinylTrackAccent = this.state.colors.background || "";

    this.styleVariables = {
      ...this.styleVariables,
      ...getLyricsTypographyStyleVariables(CONFIG.visual),
      "--highlight-inactive-opacity":
        (100 - (CONFIG.visual["highlight-intensity"] || 70)) / 100,
      "--animation-tempo": this.state.tempo,
      "--lyrics-fullscreen-right-padding": `${CONFIG.visual["fullscreen-lyrics-right-padding"] || 40}px`,
      "--fullscreen-tmi-font-size": (CONFIG.visual["fullscreen-tmi-font-size"] || 100) / 100,
      "--iv-motion-ease-standard": "cubic-bezier(0.22, 1, 0.36, 1)",
      "--iv-motion-duration-fast": this.shouldReduceMotion() ? "1ms" : "180ms",
      "--iv-motion-duration-medium": this.shouldReduceMotion() ? "1ms" : "280ms",
      "--iv-motion-duration-slow": this.shouldReduceMotion() ? "1ms" : "420ms",
      "--iv-lyrics-centering-duration": this.shouldReduceMotion() ? "1ms" : "280ms",
      "--iv-lyrics-centering-ease": "cubic-bezier(0.20, 0.70, 0.42, 0.96)",
      "--iv-motion-distance-sm": this.shouldReduceMotion() ? "0px" : "10px",
      "--iv-motion-distance-md": this.shouldReduceMotion() ? "0px" : "18px",
      ...(vinylTrackAccent ? {
        "--iv-vinyl-track-accent": vinylTrackAccent,
      } : {}),
    };
    if (isSyncCreatorActive) {
      this.styleVariables = {
        ...this.styleVariables,
        "--lyrics-color-active": "var(--spice-text, #ffffff)",
        "--lyrics-color-inactive": "var(--spice-subtext, rgba(255, 255, 255, 0.58))",
        "--lyrics-color-background": "var(--spice-main, #121212)",
        "--lyrics-highlight-background": "transparent",
        "--lyrics-background-noise": "unset",
        "--lyrics-original-opacity": 1,
        "--lyrics-translation-opacity": 0,
        "--lyrics-phonetic-opacity": 0,
        "--lyrics-text-shadow": "none",
        "--lyrics-text-drop-shadow": "none",
      };
    }

    let mode = this.getCurrentMode();
    const syncCreatorPlainLyrics = isSyncCreatorActive
      ? getPlainLyricsLines(this.state.unsynced, this.state.currentLyrics, this.state.synced, this.state.karaoke)
      : [];
    if (isSyncCreatorActive && syncCreatorPlainLyrics.length > 0) {
      mode = UNSYNCED;
    }
    const firstTimedLyricStartTimeMs = Number(this.state.currentLyrics?.[0]?.startTime);
    const defaultCommunityVideoStartTime =
      (isKaraokeRenderMode(mode) || mode === SYNCED) &&
        Number.isFinite(firstTimedLyricStartTimeMs) &&
        firstTimedLyricStartTimeMs >= 0
        ? firstTimedLyricStartTimeMs / 1000
        : 0;

    let showTranslationButton;

    // Get current display modes to track changes
    const originalLanguage = this.provideLanguageCode(this.state.currentLyrics);
    const friendlyLanguage =
      originalLanguage &&
      new Intl.DisplayNames(["en"], { type: "language" })
        .of(originalLanguage.split("-")[0])
        ?.toLowerCase();

    // For Gemini mode, use generic keys if no specific language detected
    const modeKey = friendlyLanguage || "gemini";

    const displayMode1 = CONFIG.visual[`translation-mode:${modeKey}`];
    const displayMode2 = CONFIG.visual[`translation-mode-2:${modeKey}`];
    const culturalAnnotationsMode = this.isCulturalAnnotationsEnabled()
      ? `culture-${this.getTranslationTargetLanguage()}`
      : "culture-off";
    const currentModeKey = `${mode}_${displayMode1 || "none"}_${displayMode2 || "none"
      }_${culturalAnnotationsMode}`;

    // Only call lyricsSource on state/mode/translation changes, not every render
    if (
      !isSyncCreatorActive &&
      !this.state.isLoading &&
      (
        this.lastProcessedUri !== this.state.uri ||
        this.lastProcessedMode !== currentModeKey
      )
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
        : this.state.isLoading
          ? this.lastModeBeforeLoading || SYNCED
          : mode;

    showTranslationButton =
      isKaraokeRenderMode(potentialMode) ||
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
    const sharedPresentationKey = `${this.state.provider || ''}:${displayMode1 || 'none'}:${displayMode2 || 'none'}:${getSyncDataRendererCacheVersion(this.state)}`;
    const hasLoadedSharedPresentation =
      this._sharedPresentationKeys?.get(currentUri) === sharedPresentationKey;
    const hasLoadedGeminiTranslation = !!(
      hasGeminiTranslation &&
      (hasLoadedSharedPresentation || (
        this._dmResults &&
        this._dmResults[currentUri] &&
        ((displayMode1?.startsWith("gemini") &&
          this._dmResults[currentUri].mode1) ||
          (displayMode2?.startsWith("gemini") &&
            this._dmResults[currentUri].mode2))
      ))
    );

    const canRegenerateCulturalAnnotations =
      this.isCulturalAnnotationsEnabled() &&
      Array.isArray(this.state.currentLyrics) &&
      this.state.currentLyrics.length > 0;
    const canRegenerateTranslation =
      hasLoadedGeminiTranslation || canRegenerateCulturalAnnotations;
    const cacheEditModal =
      this.state.isLyricsEditModalOpen &&
      react.createElement(LyricsCacheEditModal, {
        isOpen: this.state.isLyricsEditModalOpen,
        isLoading: this.state.isLyricsEditLoading,
        isSaving: this.state.isLyricsEditSaving,
        originalLines: this.state.lyricsEditOriginalLines,
        pronunciationText: this.state.lyricsEditPronunciationText,
        translationText: this.state.lyricsEditTranslationText,
        expectedLineCount: this.state.lyricsEditOriginalLines.length,
        hasPronunciationCache: this.state.lyricsEditHasPronunciationCache,
        hasTranslationCache: this.state.lyricsEditHasTranslationCache,
        trackTitle: this.state.title,
        trackArtist: this.state.artist,
        provider: this.state.provider,
        error: this.state.lyricsEditError,
        onClose: () => this.closeLyricsEditModal(),
        onSave: () => this.saveLyricsEditModal(),
        onPronunciationChange: (value) =>
          this.setState({ lyricsEditPronunciationText: value, lyricsEditError: "" }),
        onTranslationChange: (value) =>
          this.setState({ lyricsEditTranslationText: value, lyricsEditError: "" }),
      });

    const renderedCurrentLyrics = isSyncCreatorActive && syncCreatorPlainLyrics.length > 0
      ? syncCreatorPlainLyrics
      : this.state.currentLyrics;
    const renderedUnsyncedLyrics = isSyncCreatorActive && syncCreatorPlainLyrics.length > 0
      ? syncCreatorPlainLyrics
      : this.state.unsynced;
    const syncCreatorPlainPage = isSyncCreatorActive
      ? react.createElement(
        "div",
        {
          className: "lyrics-lyricsContainer-UnsyncedLyricsPage ivlyrics-sync-creator-plain-page",
          style: {
            position: "relative",
            zIndex: 1,
            minHeight: "100%",
            padding: "96px 48px 120px",
            color: "var(--spice-text, #ffffff)",
            fontFamily: "var(--lyrics-font-family, var(--font-family))",
            fontSize: "18px",
            lineHeight: 1.8,
            opacity: 0.72,
            whiteSpace: "pre-wrap",
          },
        },
        syncCreatorPlainLyrics.length > 0
          ? syncCreatorPlainLyrics.map((line, index) => react.createElement(
            "div",
            { key: `sync-creator-plain-${index}` },
            line.text
          ))
          : react.createElement("div", null, I18n.t("messages.noLyrics"))
      )
      : null;
    const activeLyricsPage = syncCreatorPlainPage || (window.LyricsPageRenderer
      ? react.createElement(window.LyricsPageRenderer, {
        mode,
        karaokeMode: KARAOKE,
        wordMode: WORD_KARAOKE,
        syncedMode: SYNCED,
        unsyncedMode: UNSYNCED,
        trackUri: this.state.uri,
        currentLyrics: renderedCurrentLyrics,
        karaoke: isSyncCreatorActive ? null : this.state.karaoke,
        karaokeSource: isSyncCreatorActive ? null : this.state.karaokeSource,
        synced: isSyncCreatorActive ? null : this.state.synced,
        unsynced: renderedUnsyncedLyrics,
        provider: this.state.provider,
        contributors: this.state.contributors,
		syncType: this.state.syncType,
		syncPoints: this.state.syncPoints,
		syncTypeBreakdown: this.state.syncTypeBreakdown,
        copyright: this.state.copyright,
        isLoading: this.state.isLoading,
        showMarketplace: this.state.showMarketplace,
        onCloseMarketplace: () => this.setState({ showMarketplace: false }),
        reRenderLyricsPage: this.reRenderLyricsPage,
      })
      : (() => {
        const NoLyricsAnimationComponent = window.ivLyricsNoLyricsAnimation;
        const unavailableMessage = this.state.isLoading
          ? LoadingIcon
          : NoLyricsAnimationComponent
            ? react.createElement(NoLyricsAnimationComponent, null)
            : "(• _ • )";
        const unavailableMessageClass = [
          "lyrics-lyricsContainer-LyricsUnavailableMessage",
          !this.state.isLoading && NoLyricsAnimationComponent
            ? "lyrics-lyricsContainer-LyricsUnavailableMessage--motion"
            : "",
        ].filter(Boolean).join(" ");

        return react.createElement(
          "div",
          {
            className: "lyrics-lyricsContainer-LyricsUnavailablePage",
          },
          react.createElement(
            "span",
            {
              className: unavailableMessageClass,
            },
            unavailableMessage
          )
        );
      })());

    // Tab bar removed - modes are now auto-detected
    const topBarContent = null;

    // Update banner component
    const updateBannerContent =
      !isSyncCreatorActive &&
      !this.state.isFullscreen &&
      window.ivLyrics_updateInfo?.available
      ? react.createElement(UpdateBanner, {
        updateInfo: window.ivLyrics_updateInfo,
        onDismiss: () => Utils.dismissUpdate(window.ivLyrics_updateInfo?.latestVersion),
      })
      : null;
    const updateBannerDOM = updateBannerContent ? ensureReactDOM() : null;
    const updateBanner =
      updateBannerContent && updateBannerDOM?.createPortal
        ? updateBannerDOM.createPortal(updateBannerContent, document.body)
        : updateBannerContent;

    const hasLyrics = !!(this.state.karaoke || this.state.synced || this.state.unsynced);
    const isTwoColumn = CONFIG.visual["fullscreen-two-column"] !== false;
    const isLayoutReversed = CONFIG.visual["fullscreen-layout-reverse"] === true;
    const centerWhenNoLyrics = CONFIG.visual["fullscreen-center-when-no-lyrics"] !== false;
    const shouldHideFullscreenLyrics =
      this.state.isFullscreen &&
      this.state.fullscreenLyricsHidden &&
      hasLyrics &&
      !this.state.showMarketplace &&
      !isSyncCreatorActive;
    const shouldUseFullscreenNoLyricsLayout =
      shouldHideFullscreenLyrics ||
      (!hasLyrics && centerWhenNoLyrics);
    const shouldReduceMotion = this.shouldReduceMotion();
    const isFullscreenMarketplace = this.state.isFullscreen && this.state.showMarketplace;
    const isFullscreenPageUi = this.state.isFullscreen && this.fullscreenUsesPageUi === true;
    const shouldRenderFloatingMenu =
      !this.state.isFullscreen ||
      this.state.isFloatingMenuOpen ||
      this.state.isFloatingMenuClosing;
    const currentPlayerItem = Spicetify.Player.data?.item;
    const currentTrackInfo = this.infoFromTrack(currentPlayerItem) || {
      duration: Number(currentPlayerItem?.metadata?.duration || 0),
      album: currentPlayerItem?.metadata?.album_title || "",
      artist: this.state.artist || currentPlayerItem?.metadata?.artist_name || "",
      title: this.state.title || currentPlayerItem?.metadata?.title || "",
      uri: this.currentTrackUri || this.state.uri || currentPlayerItem?.uri || "",
      image: this.state.coverUrl || currentPlayerItem?.metadata?.image_url || "",
    };
    const renderTrackUri = currentTrackInfo?.uri || this.currentTrackUri || this.state.uri || "";
    const isLocalTrack = !!renderTrackUri && !Utils.extractTrackId(renderTrackUri);
    const fullscreenPresentation = this.state.isFullscreen
      ? normalizeIvLyricsFullscreenPresentation(
        this.state.fullscreenPresentation
      )
      : "standard";
    const isFocusedFullscreenPresentation =
      fullscreenPresentation === "vinyl"
      || fullscreenPresentation === "video";
    const isVideoStagePresentation =
      fullscreenPresentation === "video";
    const floatingToolbarStyle = this.state.isFullscreen
      ? { "--iv-floating-menu-content-top-offset": `${this.getFloatingMenuContentTopOffset()}px` }
      : undefined;
    const shouldUseVideoBackground =
      !isSyncCreatorActive &&
      !this.state.isFADMode &&
      (
        effectiveBackgroundMode === "video-background" ||
        fullscreenPresentation === "video"
      );
    const shouldRenderStaticBackground = !shouldUseVideoBackground;
    const renderFloatingToolbarIcon = (name, size = 18) =>
      window.IvLyricsToolbarIcon
        ? react.createElement(window.IvLyricsToolbarIcon, { name, size })
        : react.createElement("span", {
          className: "ivlyrics-toolbar-icon-fallback",
          "aria-hidden": "true",
        });
    const getModeButtonLabel = (modeId, labelKey) => {
      const modeLabel = I18n.t(labelKey);
      const lockHint = this.state.lockedMode === modeId
        ? I18n.t("modes.rightClickToUnlock")
        : I18n.t("modes.rightClickToLock");
      return `${modeLabel} · ${lockHint}`;
    };
    const modeButtons = [
      this.state.karaoke &&
      CONFIG.visual["karaoke-mode-enabled"] &&
      react.createElement(
        Spicetify.ReactComponent.TooltipWrapper,
        { key: "character", label: getModeButtonLabel(KARAOKE, "modes.character"), showDelay: 0 },
        react.createElement(
          "button",
          {
            type: "button",
            className: `lyrics-config-button lyrics-mode-button ${mode === KARAOKE ? "active" : ""}${this.state.lockedMode === KARAOKE ? " mode-locked" : ""}`,
            onClick: () => this.switchTo(KARAOKE),
            onContextMenu: (event) => this.toggleModeLock(KARAOKE, event),
            "aria-pressed": mode === KARAOKE,
            "aria-label": getModeButtonLabel(KARAOKE, "modes.character"),
            "data-mode-locked": this.state.lockedMode === KARAOKE,
          },
          renderFloatingToolbarIcon("character")
        )
      ),
      this.state.karaoke &&
      CONFIG.visual["karaoke-mode-enabled"] &&
      react.createElement(
        Spicetify.ReactComponent.TooltipWrapper,
        { key: "word", label: getModeButtonLabel(WORD_KARAOKE, "modes.word"), showDelay: 0 },
        react.createElement(
          "button",
          {
            type: "button",
            className: `lyrics-config-button lyrics-mode-button ${mode === WORD_KARAOKE ? "active" : ""}${this.state.lockedMode === WORD_KARAOKE ? " mode-locked" : ""}`,
            onClick: () => this.switchTo(WORD_KARAOKE),
            onContextMenu: (event) => this.toggleModeLock(WORD_KARAOKE, event),
            "aria-pressed": mode === WORD_KARAOKE,
            "aria-label": getModeButtonLabel(WORD_KARAOKE, "modes.word"),
            "data-mode-locked": this.state.lockedMode === WORD_KARAOKE,
          },
          renderFloatingToolbarIcon("word")
        )
      ),
      this.state.synced &&
      react.createElement(
        Spicetify.ReactComponent.TooltipWrapper,
        { key: "synced", label: getModeButtonLabel(SYNCED, "modes.synced"), showDelay: 0 },
        react.createElement(
          "button",
          {
            type: "button",
            className: `lyrics-config-button lyrics-mode-button ${mode === SYNCED ? "active" : ""}${this.state.lockedMode === SYNCED ? " mode-locked" : ""}`,
            onClick: () => this.switchTo(SYNCED),
            onContextMenu: (event) => this.toggleModeLock(SYNCED, event),
            "aria-pressed": mode === SYNCED,
            "aria-label": getModeButtonLabel(SYNCED, "modes.synced"),
            "data-mode-locked": this.state.lockedMode === SYNCED,
          },
          renderFloatingToolbarIcon("synced")
        )
      ),
      this.state.unsynced &&
      react.createElement(
        Spicetify.ReactComponent.TooltipWrapper,
        { key: "unsynced", label: getModeButtonLabel(UNSYNCED, "modes.unsynced"), showDelay: 0 },
        react.createElement(
          "button",
          {
            type: "button",
            className: `lyrics-config-button lyrics-mode-button ${mode === UNSYNCED ? "active" : ""}${this.state.lockedMode === UNSYNCED ? " mode-locked" : ""}`,
            onClick: () => this.switchTo(UNSYNCED),
            onContextMenu: (event) => this.toggleModeLock(UNSYNCED, event),
            "aria-pressed": mode === UNSYNCED,
            "aria-label": getModeButtonLabel(UNSYNCED, "modes.unsynced"),
            "data-mode-locked": this.state.lockedMode === UNSYNCED,
          },
          renderFloatingToolbarIcon("unsynced")
        )
      ),
    ].filter(Boolean);

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
      if (shouldUseFullscreenNoLyricsLayout) {
        fullscreenClasses += " fullscreen-no-lyrics";
      }
      // Portrait mode class (not in TV mode)
      if (this._isPortraitViewport && CONFIG.visual["fullscreen-tv-mode"] !== true) {
        fullscreenClasses += " portrait-mode";
      }
      // TV Mode class
      if (CONFIG.visual["fullscreen-tv-mode"] === true) {
        fullscreenClasses += " tv-mode-active";
      }
      if (this.state.showMarketplace) {
        fullscreenClasses += " marketplace-active";
      }
      if (isFullscreenPageUi) {
        fullscreenClasses += " fullscreen-page-ui";
      }
      if (isFocusedFullscreenPresentation) {
        fullscreenClasses += ` fullscreen-focus-active focus-presentation-${fullscreenPresentation}`;
      }
      // TMI 폰트 크기 CSS 변수 업데이트
      if (this.fullscreenContainer) {
        const tmiScale = (CONFIG.visual["fullscreen-tmi-font-size"] || 100) / 100;
        this.fullscreenContainer.style.setProperty("--fullscreen-tmi-font-size", tmiScale);
      }
    }

    const generationCompleteLabel = I18n.t("generationStatus.complete") || "완료!";
    const generationStatusDefinitions = [
      {
        key: "lyrics",
        label: I18n.t("syncCreator.loadLyrics") || "가사 불러오기",
        description: I18n.t("syncCreator.loadingLyrics") || "가사를 불러오는 중...",
      },
      {
        key: "translation",
        label: I18n.t("menu.translationLabel") || I18n.t("notifications.requestingTranslation"),
        description: I18n.t("notifications.requestingTranslation"),
      },
      {
        key: "pronunciation",
        label: I18n.t("menu.pronunciation") || I18n.t("notifications.requestingPronunciation"),
        description: I18n.t("notifications.requestingPronunciation"),
      },
      {
        key: "cultural-annotations",
        label: I18n.t("generationStatus.culturalAnnotations") || "문화적 설명",
        description: I18n.t("generationStatus.culturalAnnotationsLoading") || "문화적 설명을 생성하는 중...",
      },
      {
        key: "video-background",
        label: I18n.t("settings.videoBackground.label") || I18n.t("videoBackground.loading"),
        description: I18n.t("videoBackground.loadingMessage"),
      },
    ];
    const generationStatuses = generationStatusDefinitions
      .map((definition) => {
        const pill = this.state.generationPills?.[definition.key];
        if (!pill || pill.phase === "idle") return null;

        const isComplete = pill.phase === "complete" || pill.phase === "exiting";
        const label = pill.label || definition.label;
        return {
          ...definition,
          ...pill,
          label,
          completeLabel: generationCompleteLabel,
          description: isComplete
            ? `${label} ${generationCompleteLabel}`
            : (pill.description || definition.description),
        };
      })
      .filter(Boolean);
    const generationStatusStack = generationStatuses.length > 0 &&
      !isSyncCreatorActive &&
      !isFullscreenMarketplace
      ? react.createElement(
        "div",
        {
          className: "lyrics-generation-status-stack",
          role: "status",
          "aria-live": "polite",
          "aria-atomic": "false",
        },
        generationStatuses.map((status) => react.createElement(
          "div",
          {
            key: status.key,
            className: `lyrics-translation-loading-indicator is-${status.phase}`,
            "data-kind": status.key,
            "data-phase": status.phase,
            dir: "auto",
          },
          react.createElement(
            "span",
            {
              className: "lyrics-generation-status-icon",
              "aria-hidden": "true",
            },
            react.createElement("span", {
              className: "lyrics-translation-loading-spinner",
            }),
            react.createElement(
              "svg",
              {
                className: "lyrics-generation-status-check",
                viewBox: "0 0 16 16",
                fill: "none",
              },
              react.createElement("path", {
                d: "M3.25 8.25 6.5 11.25 12.75 4.75",
                stroke: "currentColor",
                strokeWidth: "2.2",
                strokeLinecap: "round",
                strokeLinejoin: "round",
              })
            )
          ),
          react.createElement(
            "span",
            {
              className: "lyrics-translation-loading-label",
              "aria-hidden": "true",
            },
            react.createElement(
              "span",
              { className: "lyrics-generation-status-loading-label" },
              status.label
            ),
            react.createElement(
              "span",
              { className: "lyrics-generation-status-complete-label" },
              status.completeLabel
            )
          ),
          react.createElement(
            "span",
            { className: "lyrics-generation-status-description" },
            status.description
          )
        ))
      )
      : null;
    const hasTrackSyncLyrics =
      (isKaraokeRenderMode(mode) && Array.isArray(this.state.karaoke) && this.state.karaoke.length > 0) ||
      (mode === SYNCED && Array.isArray(this.state.synced) && this.state.synced.length > 0);
    const canAdjustTrackSync = hasTrackSyncLyrics &&
      !this.state.showMarketplace &&
      !shouldHideFullscreenLyrics &&
      !isSyncCreatorActive &&
      Boolean(renderTrackUri);
    const quickSyncControlsEnabled =
      CONFIG.visual["quick-sync-controls-enabled"] !== false;
    const trackSyncAdjustPill = canAdjustTrackSync &&
      quickSyncControlsEnabled &&
      typeof TrackSyncAdjustPill !== "undefined"
      ? react.createElement(TrackSyncAdjustPill, {
        key: renderTrackUri,
        trackUri: renderTrackUri,
      })
      : null;

    const out = react.createElement(
      "div",
      {
        className: `lyrics-lyricsContainer-LyricsContainer${CONFIG.visual["fade-blur"] ? " blur-enabled" : ""
          }${CONFIG.visual["highlight-mode"] ? " highlight-mode-enabled" : ""}${fadLyricsContainer ? " fad-enabled" : ""}${fullscreenClasses}${shouldReduceMotion ? " motion-reduced" : ""}${this.state.isPlaybackPaused ? " playback-paused" : ""}${isSyncCreatorActive ? " sync-creator-minimal" : ""}`,
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
      this.state.isFullscreen && !this.state.showMarketplace && !isSyncCreatorActive && window.FullscreenOverlay && react.createElement(window.FullscreenOverlay, {
        coverUrl: this.state.coverUrl,
        title: this.state.title,
        artist: this.state.artist,
        isFullscreen: this.state.isFullscreen,
        currentLyricIndex: shouldHideFullscreenLyrics ? 0 : this.state.currentLyricIndex || 0,
        totalLyrics: shouldHideFullscreenLyrics
          ? 0
          : Array.isArray(this.state.currentLyrics)
            ? this.state.currentLyrics.length
            : 0,
        activeLyric: shouldHideFullscreenLyrics
          ? ""
          : getPlainLyricsLineText(
            Array.isArray(this.state.currentLyrics)
              ? this.state.currentLyrics[this.state.currentLyricIndex || 0]
              : null
          ),
        activeLyrics: shouldHideFullscreenLyrics || !Array.isArray(this.state.currentLyrics)
          ? []
          : this.state.currentLyrics,
        activeLyricsKaraoke: !shouldHideFullscreenLyrics && isKaraokeRenderMode(mode) && !!this.state.karaoke,
        karaokeSource: this.state.karaokeSource,
        lyricsSettingsRevision: this.reRenderLyricsPage,
        translatedMetadata: this.state.translatedMetadata,
        trackUri: this.state.uri,
        trackAccent: vinylTrackAccent,
        trackAccentUri: this.state.colorsUri || "",
        presentationMode: fullscreenPresentation,
        onPresentationModeChange: (nextPresentation) => {
          this.setFullscreenPresentation(nextPresentation);
        },
        onExitFullscreen: this.toggleFullscreen
      }),
      // Tab bar for mode switching
      topBarContent,
      // Update notification banner
      updateBanner,
      shouldRenderStaticBackground && react.createElement("div", {
        id: "ivLyrics-gradient-background",
        className: !isSyncCreatorActive && effectiveBackgroundMode === "blur-gradient-background" ? "color-gradient-bg" : "",
        style: backgroundStyle,
      },
        // 블러 그라데이션일 때 여러 블롭 생성
        !isSyncCreatorActive && effectiveBackgroundMode === "blur-gradient-background" && [
          react.createElement("div", { key: "blob1", className: "gradient-blob blob-1" }),
          react.createElement("div", { key: "blob2", className: "gradient-blob blob-2" }),
          react.createElement("div", { key: "blob3", className: "gradient-blob blob-3" }),
          react.createElement("div", { key: "blob4", className: "gradient-blob blob-4" }),
          react.createElement("div", { key: "blob5", className: "gradient-blob blob-5" }),
          react.createElement("div", { key: "blob6", className: "gradient-blob blob-6" }),
        ]
      ),
      shouldUseVideoBackground && window.VideoBackground && react.createElement(window.VideoBackground, {
        trackUri: this.state.uri,
        firstLyricTime: this.state.currentLyrics && this.state.currentLyrics.length > 0 ? this.state.currentLyrics[0].startTime : null,
        brightness: isVideoStagePresentation
          ? 100
          : CONFIG.visual["background-brightness"],
        blurAmount: isVideoStagePresentation
          ? 0
          : CONFIG.visual["video-blur"],
        coverMode: CONFIG.visual["video-cover"],
        videoScale: CONFIG.visual["video-scale"],
        externalVideoInfo: this.state.videoInfo,
        onLoadingChange: this.handleVideoBackgroundLoadingChange
      }),
      shouldRenderStaticBackground && react.createElement("div", {
        className: "lyrics-lyricsContainer-LyricsBackground",
      }),
      generationStatusStack,
      trackSyncAdjustPill,
      // ===== 플로팅 바 (일반 모드: 전체 표시, 전체화면: 메뉴 토글 방식) =====
      !isFullscreenMarketplace && !isSyncCreatorActive && react.createElement(
        "div",
        {
          className: "lyrics-config-button-container lyrics-fluent-floating-toolbar" +
            (this.state.isFullscreen ? " fullscreen-mode-container" : "") +
            (this.state.isFullscreen && this.state.isFloatingMenuOpen ? " menu-open" : "") +
            (this.state.isFullscreen && this.state.isFloatingMenuClosing ? " menu-closing" : ""),
          style: floatingToolbarStyle,
          ref: (el) => {
            if (this._cleanupFloatingMenuOutsideClick) {
              this._cleanupFloatingMenuOutsideClick();
              this._cleanupFloatingMenuOutsideClick = null;
            }

            if (el && this.state.isFullscreen) {
              // 전체화면에서 바깥 클릭 시 메뉴 닫기
              const handleClickOutside = (e) => {
                const target = e.target;
                const isExternalMenuSurface = target?.closest?.([
                  ".lyrics-sync-adjust-floating",
                  "#ivLyrics-sync-creator-overlay",
                  ".ivlyrics-fluent-overlay",
                  ".community-video-overlay",
                  "#ivLyrics-share-image-overlay",
                  ".ivlyrics-cache-edit-overlay",
                  ".lyrics-creator-profile-overlay",
                ].join(","));

                if (!el.contains(target) && !isExternalMenuSurface && (this.state.isFloatingMenuOpen || this.state.isFloatingMenuClosing)) {
                  this.closeFloatingMenu();
                }
              };
              document.addEventListener('click', handleClickOutside);
              this._cleanupFloatingMenuOutsideClick = () => {
                document.removeEventListener('click', handleClickOutside);
              };
            }
          },
        },
        // 전체화면에서만 보이는 메뉴 토글 버튼
        this.state.isFullscreen && react.createElement(
          "button",
          {
            className: "lyrics-config-button lyrics-floating-menu-toggle",
            type: "button",
            "aria-label": this.state.isFloatingMenuOpen
              ? (I18n.t("buttons.close") || "Close")
              : "ivLyrics menu",
            "aria-expanded": this.state.isFloatingMenuOpen,
            onClick: (e) => {
              e.stopPropagation();
              this.toggleFloatingMenu();
            },
          },
          renderFloatingToolbarIcon(this.state.isFloatingMenuOpen ? "close" : "menu")
        ),
        // 메뉴 내용 (일반 모드: 항상 표시, 전체화면: 열렸을 때만 표시)
        shouldRenderFloatingMenu && react.createElement(
          "div",
          {
            className: `lyrics-floating-menu-content${this.state.isFullscreen && this.state.isFloatingMenuOpen ? " menu-open" : ""}${this.state.isFullscreen && this.state.isFloatingMenuClosing ? " menu-closing" : ""}`,
            ref: (el) => {
              this.floatingMenuContentRef = el;
              if (el && !el.__ivLyricsScrollInitialized) {
                el.__ivLyricsScrollInitialized = true;
                this.resetFloatingMenuScroll();
              }
            },
          },
          react.createElement(
            "div",
            {
              className: "lyrics-floating-menu-group",
              "data-group": "lyrics",
            },
            showTranslationButton && react.createElement(TranslationMenu, {
              friendlyLanguage,
              hasTranslation: {},
            }),
            react.createElement(LyricsProviderSelectButton, {
              currentProvider: this.state.provider,
              selectedProvider: this.state.trackLyricsProviderOverride,
              isLoading: this.state.isLoading,
              onSelectProvider: this.selectLyricsProviderForCurrentTrack,
              isLocalTrack,
              trackInfo: currentTrackInfo,
              onImportLocalLyricsFile: this.importLocalLyricsFile,
              onApplyLocalLyrics: this.applyLocalLyricsFromLrclibCandidate,
            }),
            react.createElement(TrackBackgroundButton, {
              trackUri: this.currentTrackUri,
              overrideMode: getIvLyricsTrackBackgroundMode(this.state.trackBackgroundOverride),
              effectiveMode: effectiveBackgroundMode,
              onSelectBackground: this.selectBackgroundForCurrentTrack,
            }),
            react.createElement(RegenerateTranslationButton, {
              onRegenerate: this.handleRegenerateTranslationRequest,
              isEnabled: canRegenerateTranslation,
              isLoading:
                this.state.isTranslationLoading ||
                this.state.isPhoneticLoading ||
                this.state.isCulturalAnnotationsLoading,
            }),
            window.IvLyricsLearningMode?.StudyButton &&
            react.createElement(window.IvLyricsLearningMode.StudyButton, {
              disabled: !hasLyrics || this.state.isLoading,
            })
          ),
          react.createElement(
            "div",
            {
              className: "lyrics-floating-menu-group",
              "data-group": "playback",
            },
            react.createElement(SyncAdjustButtonFluent, {
              trackUri: renderTrackUri,
              includeTrackOffset:
                canAdjustTrackSync && !quickSyncControlsEnabled,
            }),
            react.createElement(CommunityVideoButton, {
              trackUri: this.currentTrackUri,
              enabled: shouldUseVideoBackground,
              videoInfo: this.state.videoInfo,
              defaultStartTime: defaultCommunityVideoStartTime,
              onVideoSelect: async (newVideoInfo) => {
                const selectionTrackUri = this.currentTrackUri;
                if (!selectionTrackUri) return;
                if (newVideoInfo?.youtubeVideoId) {
                  await Utils.saveSelectedVideo(selectionTrackUri, newVideoInfo);
                  if (this.currentTrackUri === selectionTrackUri) {
                    this.setState({ videoInfo: newVideoInfo });
                  }
                } else {
                  await Utils.removeSelectedVideo(selectionTrackUri);
                  if (this.currentTrackUri === selectionTrackUri) {
                    this.setState({
                      videoInfo: {
                        suppressVideoBackground: true,
                        reason: "no-visible-community-video",
                      },
                    });
                  }
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
            hasLyrics && react.createElement(
              Spicetify.ReactComponent.TooltipWrapper,
              {
                label: I18n.t("lyricsCacheEditor.button"),
                showDelay: 0,
              },
              react.createElement(
                "button",
                {
                  className: "lyrics-config-button lyrics-cache-edit-button",
                  type: "button",
                  onClick: () => this.openLyricsEditModal(),
                  disabled:
                    this.state.isLyricsEditLoading || this.state.isLyricsEditSaving,
                  "data-active": this.state.isLyricsEditModalOpen ? "true" : "false",
                  "aria-label": I18n.t("lyricsCacheEditor.button"),
                },
                renderFloatingToolbarIcon("editLyrics")
              )
            )
          ),
          react.createElement(
            "div",
            {
              className: "lyrics-floating-menu-group",
              "data-group": "app",
            },
            react.createElement(
              Spicetify.ReactComponent.TooltipWrapper,
              { label: I18n.t("marketplace.title"), showDelay: 0 },
              react.createElement(
                "button",
                {
                  className: `lyrics-config-button lyrics-marketplace-button${this.state.showMarketplace ? " active" : ""}`,
                  type: "button",
                  "aria-label": I18n.t("marketplace.title"),
                  onClick: () => {
                    this.clearFloatingMenuCloseTimer();
                    this.setState((prevState) => ({
                      showMarketplace: !prevState.showMarketplace,
                      isFloatingMenuOpen: false,
                      isFloatingMenuClosing: false,
                    }));
                  },
                },
                renderFloatingToolbarIcon("marketplace")
              )
            ),
            react.createElement(SettingsMenu),
            (() => !document.getElementById("fad-ivLyrics-container"))() && react.createElement(
              Spicetify.ReactComponent.TooltipWrapper,
              {
                label: this.state.isFullscreen ? I18n.t("menu.exitFullscreen") || "Exit Fullscreen" : I18n.t("menu.fullscreen"),
                showDelay: 0,
              },
              react.createElement(
                "button",
                {
                  className: "lyrics-config-button lyrics-fullscreen-toggle-button",
                  type: "button",
                  "aria-label": this.state.isFullscreen
                    ? (I18n.t("menu.exitFullscreen") || "Exit Fullscreen")
                    : I18n.t("menu.fullscreen"),
                  onClick: () => {
                    if (this.state.isFullscreen) {
                      this.closeFloatingMenu();
                    }
                    this.toggleFullscreen();
                  },
                },
                renderFloatingToolbarIcon(
                  this.state.isFullscreen ? "fullscreenExit" : "fullscreenEnter"
                )
              )
            )
          ),
          modeButtons.length > 0 && react.createElement(
            "div",
            {
              className: "lyrics-floating-menu-group lyrics-config-mode-section",
              "data-group": "modes",
            },
            react.createElement(
              "div",
              {
                className: "lyrics-config-mode-group",
                role: "group",
              },
              ...modeButtons
            )
          ),
          react.createElement(
            "div",
            {
              className: "lyrics-floating-menu-group",
              "data-group": "creator",
            },
            react.createElement(SyncDataCreatorButton, {
              trackInfo: {
                uri: this.currentTrackUri,
                name: Spicetify.Player.data?.item?.name || '',
                artists: Spicetify.Player.data?.item?.artists || [],
                album: Spicetify.Player.data?.item?.album || {},
                metadata: Spicetify.Player.data?.item?.metadata || {},
                external_ids: Spicetify.Player.data?.item?.external_ids || {},
                externalIds: Spicetify.Player.data?.item?.externalIds || {},
              },
              showHint: !this.state.isFullscreen || this.state.isFloatingMenuOpen,
              isFullscreen: this.state.isFullscreen
            })
          )
        )
      ),
      cacheEditModal,
      !shouldHideFullscreenLyrics && activeLyricsPage,
      !this.state.showMarketplace &&
      !shouldHideFullscreenLyrics &&
      window.IvLyricsLearningMode?.StudyPanel &&
      react.createElement(window.IvLyricsLearningMode.StudyPanel, {
        trackUri: this.state.uri,
        title: this.state.title,
        artist: this.state.artist,
        provider: this.state.provider,
        lyrics: this.state.currentLyrics || [],
        activeLineIndex: this.state.currentLyricIndex || 0,
      })
    );

    const dom = ensureReactDOM();
    if (
      this.state.isFullscreen &&
      !isFullscreenPageUi &&
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

  switchTo(mode) {
    this.lastProcessedMode = null;
    this.setState((prevState) => ({
      explicitMode: mode,
      currentLyrics:
        this.resolveLyricsForMode(prevState, mode) ||
        prevState.currentLyrics ||
        [],
    }));
  }

  toggleModeLock(mode, event = null) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    const nextLockedMode = this.state.lockedMode === mode ? -1 : mode;
    rememberLyricsRenderModeLock(nextLockedMode);
    this.lastProcessedMode = null;
    this.setState((prevState) => ({
      lockedMode: nextLockedMode,
      explicitMode: nextLockedMode === -1 ? -1 : mode,
      currentLyrics: nextLockedMode === -1
        ? prevState.currentLyrics
        : this.resolveLyricsForMode(prevState, mode) || prevState.currentLyrics || [],
    }), () => {
      this.lyricsSource(this.state, this.getCurrentMode());
    });
  }

}

// 초기화 시 저장된 Google Fonts 로드
(function loadGoogleFonts() {
  const GOOGLE_FONTS = [
    "Noto Sans KR",
    "Nanum Gothic",
    "Nanum Myeongjo",
    "Black Han Sans",
    "Do Hyeon",
    "Jua",
    "Nanum Gothic Coding",
    "Gowun Batang",
    "Gowun Dodum",
    "IBM Plex Sans KR",
    "Roboto",
    "Open Sans",
    "Lato",
    "Montserrat",
    "Poppins",
    "Inter",
    "Raleway",
    "Oswald",
    "Merriweather",
    "Playfair Display",
  ];
  const GOOGLE_FONT_SET = new Set(GOOGLE_FONTS);

  const fontsToLoad = new Set();

  // Helper to add fonts from comma-separated string
  const addFonts = (fontString) => {
    if (!fontString) return;
    const fonts = fontString.split(",").map((f) => f.trim().replace(/['"]/g, ""));
    fonts.forEach((font) => {
      if (font && GOOGLE_FONT_SET.has(font)) {
        fontsToLoad.add(font);
      }
    });
  };

  // 전체 폰트 (레거시)
  addFonts(CONFIG.visual["font-family"]);

  // 개별 폰트
  addFonts(CONFIG.visual["original-font-family"]);
  addFonts(CONFIG.visual["phonetic-font-family"]);
  addFonts(CONFIG.visual["translation-font-family"]);
  addFonts(CONFIG.visual["cultural-annotations-font-family"]);
  addFonts(CONFIG.visual["cultural-annotations-vinyl-font-family"]);
  addFonts(CONFIG.visual["instrumental-break-label-font-family"]);
  addFonts(CONFIG.visual["fullscreen-vinyl-original-font-family"]);
  addFonts(CONFIG.visual["fullscreen-vinyl-phonetic-font-family"]);
  addFonts(CONFIG.visual["fullscreen-vinyl-translation-font-family"]);
  addFonts(CONFIG.visual["fullscreen-video-stage-original-font-family"]);
  addFonts(CONFIG.visual["fullscreen-video-stage-phonetic-font-family"]);
  addFonts(CONFIG.visual["fullscreen-video-stage-translation-font-family"]);
  addFonts(CONFIG.visual["fullscreen-video-stage-cultural-font-family"]);

  // Google Fonts 로드
  fontsToLoad.forEach((font) => {
    const linkId = `ivLyrics-google-font-${font.replace(/ /g, "-")}`;
    if (!document.getElementById(linkId)) {
      const link = document.createElement("link");
      link.id = linkId;
      link.rel = "stylesheet";
      // Pretendard는 CDN에서 로드
      if (font === "Pretendard Variable") {
        link.href =
          "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css";
      } else {
        link.href = `https://fonts.googleapis.com/css2?family=${font.replace(
          / /g,
          "+"
        )}:wght@100;200;300;400;500;600;700;800;900&display=swap`;
      }
      document.head.appendChild(link);
    }
  });
})();

// URL Scheme 파라미터 처리
(function handleURLScheme() {
  const moduleState =
    window.__ivLyricsUrlSchemeModule ||
    (window.__ivLyricsUrlSchemeModule = {
      initialized: false,
      unlisten: null,
      lastRouteKey: null,
      lastLoginToken: null,
    });

  // 현재 URL의 파라미터를 확인
  const checkURLParams = () => {
    try {
      const currentPath = Spicetify.Platform.History.location.pathname;
      const currentSearch = Spicetify.Platform.History.location.search || "";
      const routeKey = `${currentPath}?${currentSearch}`;
      if (moduleState.lastRouteKey === routeKey) {
        return;
      }
      moduleState.lastRouteKey = routeKey;
      const searchParams = new URLSearchParams(currentSearch);

      // spotify://ivLyrics/ 콜백의 정확한 앱 경로만 처리한다.
      if (/^\/ivLyrics\/?$/i.test(currentPath)) {
        // alert 파라미터가 있으면 알림 표시
        const alertMessage = searchParams.get('alert');
        if (alertMessage) {
          Toast.show(decodeURIComponent(alertMessage), false, 3000);
        }

        // 다른 파라미터들도 처리 가능
        // 예: action, data 등
        const action = searchParams.get('action');
        if (action === 'discord-auth') {
          const loginToken = searchParams.get('loginToken');
          if (loginToken && moduleState.lastLoginToken !== loginToken) {
            moduleState.lastLoginToken = loginToken;
            if (typeof Utils !== 'undefined' && Utils.handleDiscordAuthCallback) {
              Utils.handleDiscordAuthCallback(loginToken);
            }
          }
        }
      }
    } catch (error) {
      console.error('[ivLyrics] URL Scheme error:', error);
    }
  };

  // 초기 체크
  if (Spicetify.Platform?.History) {
    if (moduleState.initialized) {
      return;
    }

    moduleState.initialized = true;
    checkURLParams();

    // History 변경 감지
    moduleState.unlisten = Spicetify.Platform.History.listen(() => {
      checkURLParams();
    });
  }
})();

// 공지사항 시스템 초기화
(function initNoticeSystem() {
  // 앱이 완전히 로드된 후 공지사항 확인
  if (!window.__ivLyricsNoticeInitTimer) {
    window.__ivLyricsNoticeInitTimer = setTimeout(() => {
      window.__ivLyricsNoticeInitTimer = null;
      if (typeof window.showNoticeIfNeeded === 'function') {
        window.showNoticeIfNeeded();
      }
    }, 3000); // 3초 후 실행 (앱 로드 완료 대기)
  }
})();

// Toast 주기적 정리 시작 (Utils.js 로드 후 실행되도록 지연)
if (!window.__ivLyricsToastCleanupInitTimer) {
  window.__ivLyricsToastCleanupInitTimer = setTimeout(() => {
    window.__ivLyricsToastCleanupInitTimer = null;
    if (window.Toast && window.Toast.startPeriodicCleanup) {
      window.Toast.startPeriodicCleanup();
    }
  }, 100);
}
