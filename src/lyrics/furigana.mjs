// Furigana Converter Module for ivLyrics
export function createFuriganaConverter(browser) {
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
    if (browser.XMLHttpRequest.prototype.__ivLyricsFuriganaPatched) return;

    const originalOpen = browser.XMLHttpRequest.prototype.open;
    browser.XMLHttpRequest.prototype.open = function patchedFuriganaOpen(method, url, ...args) {
      return originalOpen.call(this, method, normalizeKuromojiDictUrl(url), ...args);
    };
    browser.XMLHttpRequest.prototype.__ivLyricsFuriganaPatched = true;
  };

  patchKuromojiDictionaryRequests();

  const buildTokenizer = (dictPath) =>
    new Promise((resolve, reject) => {
      browser.kuromoji
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
      if (typeof browser.kuromoji === "undefined") {
        throw new Error("Kuromoji library not loaded");
      }

      let lastError = null;
      for (const dictPath of KUROMOJI_DICT_PATHS) {
        try {
          kuromojiInstance = await buildTokenizer(dictPath);
          isInitializing = false;

          browser.dispatchEvent(new browser.CustomEvent("furigana-ready"));

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
    // 々 (U+3005), 〻 (U+303B) and the kana iteration marks repeat the
    // previous character's reading, so they ride along with the kanji
    // sequence. Without this, 日々 splits into 日 + 々 and the whole
    // ひび reading lands on 日 while 々 gets no furigana.
    const kanjiRegex = /[\u4E00-\u9FAF\u3400-\u4DBF\u3005\u303B\u309D\u309E\u30FD\u30FE]/;
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
}

// Load Kuromoji library for furigana conversion
export function loadFuriganaDictionary({ browser, document, converter }) {
  const initializeFuriganaConverter = () => converter.init().catch(() => {});
  if (typeof browser.kuromoji !== "undefined") {
    initializeFuriganaConverter();
    return;
  }

  // Pinned to kuromoji@0.1.2 and verified by subresource integrity before the
  // bytes execute in the Spicetify renderer. Both mirrors serve identical
  // content, so one hash covers the fallback: a compromised mirror that
  // substituted different bytes would fail the check and fall through to
  // onerror instead of running. Regenerate with:
  //   node -e "const c=require('crypto'),h=require('https');
  //   h.get(u,r=>{const b=[];r.on('data',d=>b.push(d));r.on('end',()=>
  //   console.log('sha384-'+c.createHash('sha384').update(Buffer.concat(b)).digest('base64')))})"
  const KUROMOJI_INTEGRITY = "sha384-LCHxvFGxgpk9Bl+0+OaV6Rf24HQamJPrNHIo6VGkXkVgGWRvl68eqUwCW5PWqfwh";
  const kuromojiScriptUrls = [
    "https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/build/kuromoji.js",
    "https://unpkg.com/kuromoji@0.1.2/build/kuromoji.js",
  ];

  const loadKuromojiScript = (index = 0) => {
    if (index >= kuromojiScriptUrls.length) return;

    const kuromojiScript = document.createElement("script");
    kuromojiScript.src = kuromojiScriptUrls[index];
    // SRI is only enforced for cross-origin scripts when the request is made
    // in CORS mode, so crossorigin is required for the hash to be checked.
    kuromojiScript.integrity = KUROMOJI_INTEGRITY;
    kuromojiScript.crossOrigin = "anonymous";
    kuromojiScript.async = false; // Load synchronously to ensure it's available
    kuromojiScript.onload = initializeFuriganaConverter;
    kuromojiScript.onerror = () => {
      kuromojiScript.remove();
      loadKuromojiScript(index + 1);
    };
    document.head.appendChild(kuromojiScript);
  };

  loadKuromojiScript();
}
