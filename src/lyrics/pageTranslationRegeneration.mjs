import { readTranslationOutput, normalizeTranslationOutputLines } from "./translationCache.mjs";
import { prepareLyricSupplementResults } from "./lyricSupplementPipeline.mjs";

const regenerationOwners = new WeakMap();

function createRegenerationStreams({
  modes, requestResults, owners, token, needPhonetic, needTranslation, isCurrentRequest, mapLines, publish,
}) {
  const readPreview = mode => {
    const owner = owners.get(mode);
    const preview = owner?.previews.get(mode);
    return preview && (owner === token || owner.isCurrent()) ? preview : null;
  };
  const push = () => publish(...modes.map((mode, index) => readPreview(mode) ?? requestResults[`mode${index + 1}`]));
  const canStream = mode => token.active && owners.get(mode) === token && isCurrentRequest();
  const createStream = (mode, field) => {
    const lines = [];
    return {
      onLine(lineIndex, lineText) {
        if (!Number.isInteger(lineIndex) || lineIndex < 0 || !canStream(mode)) return;
        lines[lineIndex] = typeof lineText === "string" ? lineText : String(lineText ?? "");
        const partial = mapLines(lines, field);
        if (!partial) return;
        token.previews.set(mode, partial);
        push();
      },
      onStreamReset() {
        if (!canStream(mode)) return;
        lines.length = 0;
        token.previews.delete(mode);
        push();
      },
    };
  };
  return {
    phoneticStream: needPhonetic ? createStream("gemini_romaji", "phonetic") : null,
    translationStream: needTranslation ? createStream("gemini_ko", "translation") : null,
    push,
    hasPreview: () => modes.some(readPreview),
  };
}

function getRegenerationToasts(translate, needPhonetic, needTranslation) {
  const regenerationToastKind = needPhonetic && needTranslation
    ? "both"
    : needPhonetic
      ? "phonetic"
      : "translation";
  const regenerationToastStart = regenerationToastKind === "phonetic"
    ? translate("notifications.requestingPronunciation")
    : regenerationToastKind === "both"
      ? `${translate("notifications.requestingPronunciation")} ${translate("notifications.requestingTranslation")}`
      : translate("notifications.regeneratingTranslation");
  const regenerationToastSuccess = regenerationToastKind === "translation"
    ? translate("notifications.translationRegenerated")
    : `${regenerationToastKind === "phonetic"
      ? translate("menu.pronunciation")
      : translate("menu.regenerateBoth")} · ${translate("generationStatus.complete")}`;
  const regenerationToastFailure = regenerationToastKind === "phonetic"
    ? translate("notifications.romajiTranslationFailed")
    : regenerationToastKind === "both"
      ? `${translate("notifications.romajiTranslationFailed")} / ${translate("notifications.translationRegenerateFailed")}`
      : translate("notifications.translationRegenerateFailed");
  return { regenerationToastStart, regenerationToastSuccess, regenerationToastFailure };
}

export async function regeneratePageTranslation(page, target, {
  toast, translate, getTranslationCacheId, getTranslator,
  selectOriginalLyrics, getNonSectionLyricsText, getDisplayModeCacheKey, getDisplayModeGenerationOptions,
  getSyncDataRendererCacheVersion, getLyricsProcessingShapeSignature, getCurrentLyricsPronunciationNotation,
  mapTranslationLinesToLyrics, shouldRequestPronunciationSlots, memoryCache,
}) {
  const { provider, mode1, mode2, needPhonetic: configuredNeedPhonetic, needTranslation: configuredNeedTranslation, isGeminiMode } =
    page.getRegenerationTargets();

  if (!provider || provider === "none") {
    return;
  }

  if (!page.state.currentLyrics || page.state.currentLyrics.length === 0) {
    toast.error(translate("notifications.noLyricsLoaded"));
    return;
  }

  if (!isGeminiMode) {
    toast.error(translate("notifications.translationRegenerateGeminiOnly"));
    return;
  }

  const needPhonetic = configuredNeedPhonetic && (target === "all" || target === "phonetic");
  const needTranslation = configuredNeedTranslation && (target === "all" || target === "translation");

  if (!needPhonetic && !needTranslation) {
    toast.error(translate("notifications.translationRegenerateGeminiOnly"));
    return;
  }

  const requestUri = page.state.uri;
  const trackId = getTranslationCacheId(requestUri);
  if (!trackId) {
    toast.error(translate("notifications.noTrackPlaying"));
    return;
  }

  let phoneticLoadingToken = null;
  let translationLoadingToken = null;
  let phoneticCompleted = false;
  let translationCompleted = false;
  let isCurrentRequest = () => page.isCurrentLyricsUri(requestUri);
  let ownsMode = () => true;
  let publishPreview = null;
  const token = { active: true, previews: new Map() };
  const { regenerationToastStart, regenerationToastSuccess, regenerationToastFailure } =
    getRegenerationToasts(translate, needPhonetic, needTranslation);

  try {
    if (needPhonetic) {
      phoneticLoadingToken = page.startPhoneticLoading();
    }
    if (needTranslation) {
      translationLoadingToken = page.startTranslationLoading();
    }

    toast.show(regenerationToastStart, false, 2000);

    const lyricsState = page.state;
    const currentMode = page.getCurrentMode();
    const originalLyrics = selectOriginalLyrics(page.state, currentMode);
    const text = getNonSectionLyricsText(originalLyrics);
    const sourceLanguage = page.provideLanguageCode(originalLyrics, { publish: false }) || "auto";
    const sourcePreference = page.getSourceLanguagePreference?.();

    const currentUri = lyricsState.uri;
    const modes = [mode1, mode2];
    const displayModeCacheKeys = modes.map(mode => getDisplayModeCacheKey(lyricsState, mode, sourceLanguage));
    const generationOptions = modes.map(mode => getDisplayModeGenerationOptions(mode, sourceLanguage));
    const translator = getTranslator();
    const cacheRevision = translator.getCacheRevision?.(trackId);
    const resultCache = page._dmResults ||= {};
    const requestResults = prepareLyricSupplementResults(resultCache[currentUri], {
      modes, generationOptions, provider: lyricsState.provider || "",
      rendererVersion: getSyncDataRendererCacheVersion(lyricsState),
      lyricsShapeSignature: getLyricsProcessingShapeSignature(originalLyrics),
      pronunciationNotation: getCurrentLyricsPronunciationNotation(),
    });
    resultCache[currentUri] = requestResults;
    let owners = regenerationOwners.get(requestResults);
    if (!owners) regenerationOwners.set(requestResults, owners = new Map());
    if (needPhonetic) owners.set("gemini_romaji", token);
    if (needTranslation) owners.set("gemini_ko", token);
    ownsMode = mode => owners.get(mode) === token;
    isCurrentRequest = () => {
      if (!page.isCurrentLyricsState(lyricsState) || page.getSourceLanguagePreference?.() !== sourcePreference
          || page._dmResults?.[currentUri] !== requestResults
          || translator.getCacheRevision?.(trackId) !== cacheRevision || !modes.some(ownsMode)) return false;
      const settings = page.getRegenerationTargets({ publishLanguage: false });
      return settings.mode1 === mode1 && settings.mode2 === mode2 && settings.provider === provider
        && modes.every((mode, index) => getDisplayModeGenerationOptions(mode, sourceLanguage) === generationOptions[index]);
    };
    token.isCurrent = isCurrentRequest;

    // The prior foreground request must also lose ownership of memory and
    // streamed results when this slot is explicitly regenerated.
    modes.forEach((mode, index) => {
      if (ownsMode(mode)) page._inflightGemini?.delete(displayModeCacheKeys[index]);
    });
    const { phoneticStream, translationStream, push, hasPreview } = createRegenerationStreams({
      modes, requestResults, owners, token, needPhonetic, needTranslation,
      isCurrentRequest,
      mapLines: (lines, targetField) => mapTranslationLinesToLyrics(originalLyrics, lines, { targetField }),
      publish: (lyricsMode1, lyricsMode2) => page.applyStreamingTranslation({
        uri: currentUri, lyrics: originalLyrics, lyricsMode1, lyricsMode2,
        displayMode1: mode1, displayMode2: mode2, canApply: isCurrentRequest,
      }),
    });
    publishPreview = push;

    // Start both fields before waiting for either provider result.
    const generate = async (params) => translator.callGemini(params);
    const phoneticRequest = needPhonetic
      ? generate({
        trackId,
        artist: page.state.artist || lyricsState.artist,
        title: page.state.title || lyricsState.title,
        text,
        wantSmartPhonetic: true,
        sourceLang: sourceLanguage,
        provider: lyricsState.provider,
        ignoreCache: true,
        ...phoneticStream,
        pronunciationSlots: shouldRequestPronunciationSlots(originalLyrics, lyricsState.karaokeSource),
      })
      : null;
    const translationRequest = needTranslation
      ? generate({
        trackId,
        artist: page.state.artist || lyricsState.artist,
        title: page.state.title || lyricsState.title,
        text,
        wantSmartPhonetic: false,
        sourceLang: sourceLanguage,
        provider: lyricsState.provider,
        ignoreCache: true,
        ...translationStream,
      })
      : null;
    // Both settle before a failure is reported, so no stream updates the
    // page after the error is handled.
    const [phoneticSettled, translationSettled] = await Promise.allSettled([phoneticRequest, translationRequest]);
    if (!isCurrentRequest()) return;
    const phoneticOutput = readTranslationOutput(phoneticSettled.value, true);
    const translationOutput = readTranslationOutput(translationSettled.value, false);
    const mapFinal = (output, targetField) => {
      const lines = normalizeTranslationOutputLines(output);
      return lines ? mapTranslationLinesToLyrics(originalLyrics, lines, { targetField }) : null;
    };
    const mappedPhonetic = mapFinal(phoneticOutput, "phonetic");
    const mappedTranslation = mapFinal(translationOutput, "translation");

    phoneticCompleted = ownsMode("gemini_romaji") && !!mappedPhonetic;
    translationCompleted = ownsMode("gemini_ko") && !!mappedTranslation;
    const completed = new Map();
    if (phoneticCompleted) completed.set("gemini_romaji", mappedPhonetic);
    if (translationCompleted) completed.set("gemini_ko", mappedTranslation);
    modes.forEach((mode, index) => {
      if (!completed.has(mode)) return;
      const result = completed.get(mode);
      requestResults[`mode${index + 1}`] = result;
      memoryCache.set(displayModeCacheKeys[index], result);
    });
    token.active = false;
    token.previews.clear();
    if (completed.size) page.invalidateSharedLyricsPresentation(currentUri);

    if (
      (ownsMode("gemini_romaji") && !phoneticCompleted) ||
      (ownsMode("gemini_ko") && !translationCompleted)
    ) {
      push();
      if (ownsMode("gemini_romaji") && phoneticSettled.status === "rejected") throw phoneticSettled.reason;
      if (ownsMode("gemini_ko") && translationSettled.status === "rejected") throw translationSettled.reason;
      throw new Error("Failed to map one or more generated lyric fields.");
    }

    page.lyricsSource(page.state, currentMode);
    // A different regeneration may still be streaming another field.
    if (hasPreview()) push();
    toast.success(regenerationToastSuccess);
  } catch (error) {
    if (isCurrentRequest()) {
      if (token.previews.size) {
        token.previews.clear();
        publishPreview?.();
      }
      toast.error(`${regenerationToastFailure}: ${error?.message ?? String(error)}`);
    }
  } finally {
    token.active = false;
    token.previews.clear();
    const cancelled = !isCurrentRequest();
    if (needPhonetic) {
      page.clearPhoneticLoading(phoneticLoadingToken, {
        completed: phoneticCompleted, cancelled: cancelled || !ownsMode("gemini_romaji"),
      });
    }
    if (needTranslation) {
      page.clearTranslationLoading(translationLoadingToken, {
        completed: translationCompleted, cancelled: cancelled || !ownsMode("gemini_ko"),
      });
    }
  }
}
