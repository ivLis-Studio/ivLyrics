export function createPageTraditionalConversion({
  cache, getRendererCacheVersion, getTranslator, processTranslatedLyrics,
  startLoading, finishLoading, translate, notifyError, notifySuccess, notifyInfo,
}) {
  const inflight = new Map();
  let translator;

  async function request(lyricsState, lyrics, language, displayMode) {
    if (!Array.isArray(lyrics)) throw new Error("Invalid lyrics format for conversion.");

    const cacheKey = `${lyricsState.uri}:trad:${language}:${displayMode}:${getRendererCacheVersion(lyricsState)}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const existing = inflight.get(cacheKey);
    if (existing) return existing;

    const loadingToken = startLoading();
    let completed = false;
    const pending = convertLyrics(language, lyrics, displayMode)
      .then((converted) => {
        if (converted == null) throw new Error("Empty result from conversion.");
        if (inflight.get(cacheKey) === pending) cache.set(cacheKey, converted);
        completed = true;
        return converted;
      })
      .finally(() => {
        if (inflight.get(cacheKey) === pending) inflight.delete(cacheKey);
        finishLoading(loadingToken, { completed });
      });

    inflight.set(cacheKey, pending);
    return await pending;
  }

  function clear(uri) {
    if (!uri) {
      inflight.clear();
      return;
    }

    const prefix = `${uri}:trad:`;
    for (const key of inflight.keys()) {
      if (key.startsWith(prefix)) inflight.delete(key);
    }
  }

  async function convertLyrics(language, lyrics, targetConvert) {
    if (
      !language ||
      !Array.isArray(lyrics) ||
      String(targetConvert).startsWith("gemini")
    ) {
      return lyrics;
    }

    if (!translator) {
      const Translator = getTranslator();
      translator = new Translator(language);
    }
    await translator.awaitFinished(language);

    let result;
    // zh-hans and zh-hant share an identical pinyin conversion path; keep it in
    // one place so both Chinese branches stay in sync.
    const convertLyricsToPinyin = async () => {
      const converted = await Promise.all(
        lyrics.map(
          async (lyric) =>
            await translator.convertToPinyin(lyric?.text || "", {
              toneType: "mark",
              type: "string",
            })
        )
      );
      // Warn if pinyin conversion produced no visible changes (likely CDN blocked -> fallback)
      const anyChanged = lyrics.some(
        (lyric, i) => (converted?.[i] ?? "") !== (lyric?.text || "")
      );
      if (!anyChanged) {
        notifyError(translate("notifications.pinyinLibraryUnavailable"));
      }
      return converted;
    };
    // zh-hans and zh-hant also share the convertChinese mapping call; only the
    // from/target map differs, so pass it in.
    const convertLyricsChinese = async (map) =>
      await Promise.all(
        lyrics.map(
          async (lyric) =>
            await translator.convertChinese(
              lyric?.text || "",
              map[targetConvert].from,
              map[targetConvert].target
            )
        )
      );
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
              await translator.romajifyText(
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
              await translator.convertToRomaja(
                lyric?.text || "",
                targetConvert
              )
          )
        );
      } else if (language === "zh-hans") {
        // Chinese (Simplified)
        if (targetConvert === "pinyin") {
          result = await convertLyricsToPinyin();
        } else {
          const map = {
            cn: { from: "cn", target: "cn" },
            tw: { from: "cn", target: "tw" },
            hk: { from: "cn", target: "hk" },
          };

          // prevent conversion between the same language.
          if (targetConvert === "cn") {
            notifyInfo(translate("notifications.conversionSkippedSimplified"));
            return lyrics;
          }

          result = await convertLyricsChinese(map);
        }
      } else if (language === "zh-hant") {
        // Chinese (Traditional)
        if (targetConvert === "pinyin") {
          result = await convertLyricsToPinyin();
        } else {
          const map = {
            cn: { from: "t", target: "cn" },
            hk: { from: "t", target: "hk" },
            tw: { from: "t", target: "tw" },
          };

          if (!map[targetConvert]) return lyrics;

          // Allow conversion from Traditional Chinese to different variants/simplified
          result = await convertLyricsChinese(map);
        }
      }

      const res = processTranslatedLyrics(result, lyrics);
      notifySuccess(translate("notifications.conversionCompleted"));
      return res;
    } catch (error) {
      notifyError(`${translate("notifications.conversionFailed")}: ${error.message || "Unknown error"}`
      );
    }
  }

  return { request, clear };
}
