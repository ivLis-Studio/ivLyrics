import {
  getLyricDisplayModes, getLyricLanguageMode, matchesLyricPresentation, getSharedLyricPresentationKey,
} from "./lyricPresentationIdentity.mjs";
import { getLyricsModeTypeKey } from "./lyricsRenderModes.mjs";
import { getCommittedLyricsTimingUpgrade } from "./pageLyricsTimingUpgrade.mjs";
import {
  prepareLyricSupplementResults, runProgressiveLyricSupplements, createStreamingLyricsBuffer,
} from "./lyricSupplementPipeline.mjs";

const DISPLAY_COMMIT = Symbol("lyrics display commit");

export function createPageLyricsPresenter({
  page, getVisualSettings, getLyricsService, getLanguagePrompt,
  getCurrentTranslationTargetLanguage, getCurrentLyricsPronunciationNotation,
  getTranslationStyle = () => "natural",
  getDisplayModeGenerationOptions, getSyncDataRendererCacheVersion,
  getLyricsProcessingShapeSignature, getNonSectionLyricsText,
  translate, notifyError, debug, scheduleTimer, cancelTimer, publishReady,
}) {
  let lastTrackUri;

  function publish(lyrics, context = {}, deliveryOptions) {
    const {
      uri = page.state.uri,
      provider = page.state.provider || null,
      karaokeSource = page.state.karaokeSource || null,
      mode = page.getCurrentMode(),
      lyricsType = getLyricsModeTypeKey(mode),
      displayMode1 = null,
      displayMode2 = null,
      detectedLanguage = null,
      translationTargetLanguage = page.getTranslationTargetLanguage(),
      pronunciationNotation = getCurrentLyricsPronunciationNotation(),
      translationStyle = getTranslationStyle(),
      translationSourceLyrics = null,
      translationSourceText,
      presentationComplete = true,
    } = context;

    if (!page.isCurrentLyricsUri(uri) || !page.isPlaybackUriCurrent(uri)) {
      return null;
    }

    const translatedMetadata = page.state.uri === uri && getVisualSettings?.()?.["translate-metadata"]
      ? page.state.translatedMetadata
      : null;
    const payload = {
      trackInfo: {
        uri,
        title: page.state.title,
        artist: page.state.artist,
        ...(page.trackLanguageOverride ? { languageOverride: page.trackLanguageOverride } : {}),
        ...(translatedMetadata ? { translatedMetadata } : {}),
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
      translationStyle,
      presentationComplete,
    };

    if (translationSourceText !== undefined) {
      payload.translationSourceText = translationSourceText;
    } else if (Array.isArray(translationSourceLyrics)) {
      payload.translationSourceText = getNonSectionLyricsText(translationSourceLyrics);
    }

    return publishReady(payload, deliveryOptions);
  }

  const stream = createStreamingLyricsBuffer({
    scheduleTimer,
    cancelTimer,
    onFlush(payload) {
      const isCurrent = () => page.isCurrentLyricsUri(payload.uri)
        && (payload.presentationSeq == null || payload.presentationSeq === page._lyricsPresentationSeq)
        && payload.canApply?.() !== false;
      if (!isCurrent()) return;
      applySupplements(payload, page.state.provider, isCurrent, finalLyrics =>
        publish(finalLyrics, {
          uri: payload.uri,
          displayMode1: payload.displayMode1,
          displayMode2: payload.displayMode2,
          detectedLanguage: page.provideLanguageCode(payload.lyrics),
          translationSourceLyrics: payload.lyrics,
          presentationComplete: false,
        })
      );
    },
  });

  function commitDisplayLyrics(lyrics, uri, provider, isCurrent, onCommit) {
    const commit = {};
    page.setState(previous => {
      if (!isCurrent() || previous.uri !== uri || previous.provider !== provider) return null;
      return {
        [DISPLAY_COMMIT]: commit,
        currentLyrics: page.mergeCurrentLyricsTiming?.(lyrics, uri, provider, previous) || lyrics,
      };
    }, () => {
      if (onCommit && page.state[DISPLAY_COMMIT] === commit && page.state.uri === uri
        && page.state.provider === provider && isCurrent()) {
        onCommit(page.state.currentLyrics);
      }
    });
  }

  function applySupplements({
    uri, lyrics, lyricsMode1, lyricsMode2, displayMode1, displayMode2,
  }, provider, isCurrent, onCommit) {
    const optimized = page.optimizeTranslations(
      lyrics, lyricsMode1, lyricsMode2,
      lyricsMode1 ? displayMode1 : null, lyricsMode2 ? displayMode2 : null,
    );
    commitDisplayLyrics(Array.isArray(optimized) ? optimized : [], uri, provider, isCurrent, onCommit);
  }

  function present(lyricsState, mode) {
    if (!lyricsState) return;
    if (!page.isCurrentLyricsState(lyricsState)) return;
    const presentationSeq = ++page._lyricsPresentationSeq;
    stream.clear();
    let generationSettingsCurrent = () => true;
    const isActivePresentation = () =>
      presentationSeq === page._lyricsPresentationSeq &&
      page.isCurrentLyricsState(lyricsState) &&
      generationSettingsCurrent();

    const lyrics = page.resolveLyricsForMode(lyricsState, mode);
    if (!lyrics) {
      if (lyricsState.isLoading) return;
      if (!isActivePresentation()) return;
      page.setState({
        currentLyrics: [],
        lyricsStatus: "empty",
        lyricsDisplayUri: lyricsState.uri || page.state.uri || null,
      });
      // 오버레이에 가사 없음 상태 전송 (트랙 정보 업데이트용)
      publish([], {
        uri: lyricsState.uri,
        provider: lyricsState.provider || null,
        karaokeSource: lyricsState.karaokeSource || null,
        mode,
      });
      return;
    }

    const currentUri = lyricsState.uri;
    if (lastTrackUri !== currentUri) {
      page._dmResults = {};
      page._inflightGemini = new Map();
      lastTrackUri = currentUri;
    }

    // Handle translation and display modes efficiently
    const originalLanguage = page.provideLanguageCode(lyrics);
    const modeKey = getLyricLanguageMode(originalLanguage);

    const firstLanguagePrompt = getLanguagePrompt()?.maybePrompt?.({
      sourceLang: originalLanguage,
      targetLang: getCurrentTranslationTargetLanguage(),
      modeKey,
    });
    if (firstLanguagePrompt) {
      const originalLyrics = page.optimizeTranslations(lyrics, null, null, null, null);
      if (isActivePresentation()) {
        commitDisplayLyrics(Array.isArray(originalLyrics) ? originalLyrics : [],
          currentUri, lyricsState.provider, isActivePresentation);
      }
      firstLanguagePrompt.finally(() => {
        if (isActivePresentation()) {
          page._dmResults = {};
          present(lyricsState, mode);
        }
      });
      return;
    }

    const modes = getLyricDisplayModes(getVisualSettings(), modeKey);
    const [displayMode1, displayMode2] = modes;
    const translationStyle = getTranslationStyle();
    const generationOptions = modes.map(getDisplayModeGenerationOptions);
    generationSettingsCurrent = () => getLyricDisplayModes(getVisualSettings(), modeKey).every(
      (mode, index) => mode === modes[index] && getDisplayModeGenerationOptions(mode) === generationOptions[index]
    );

    page.language = originalLanguage;
    page.displayMode = displayMode1; // Keep for legacy compatibility
    page.displayMode2 = displayMode2;

    const { uri } = lyricsState; // Capture the URI for this specific request
    const commitPresentation = (lyrics, complete, isCurrent = isActivePresentation) =>
      commitDisplayLyrics(lyrics, uri, lyricsState.provider, isCurrent, displayLyrics => publishCurrentPresentation(displayLyrics, complete));
    const publishCurrentPresentation = (displayLyrics, presentationComplete) => {
      const timingUpgrade = getCommittedLyricsTimingUpgrade(page.state);
      return publish(displayLyrics, {
        uri,
        provider: lyricsState.provider || null,
        karaokeSource: timingUpgrade ? page.state.karaokeSource : (lyricsState.karaokeSource || null),
        mode: timingUpgrade ? page.getCurrentMode() : mode,
        displayMode1,
        displayMode2,
        detectedLanguage: originalLanguage || null,
        translationStyle,
        translationSourceLyrics: lyrics,
        presentationComplete,
      });
    };

    page.requestCulturalAnnotations({
      lyricsState,
      lyrics,
      sourceLang: originalLanguage,
      uri,
    });
    if (!isActivePresentation()) return;
    const sharedSnapshot = getLyricsService()?.getLyricsSnapshot?.(uri);
    const currentProvider = lyricsState.provider || "";
    const rendererVersion = getSyncDataRendererCacheVersion(lyricsState);
    const pronunciationNotation = getCurrentLyricsPronunciationNotation();
    const sharedPresentationMatches = !!sharedSnapshot
      && !page._invalidatedSharedPresentationSnapshots?.has(sharedSnapshot)
      && Array.isArray(sharedSnapshot.displayLyrics)
      && sharedSnapshot.trackUri === uri
      && (sharedSnapshot.provider || "") === currentProvider
      && matchesLyricPresentation(sharedSnapshot, {
        lyricsType: getLyricsModeTypeKey(mode),
        displayMode1,
        displayMode2,
        detectedLanguage: originalLanguage,
        getTargetLanguage: () => page.getTranslationTargetLanguage(),
        getPronunciationNotation: () => pronunciationNotation,
        getTranslationStyle: () => translationStyle,
        getSourceText: () => getNonSectionLyricsText(lyrics),
      });
    if (sharedPresentationMatches) {
      page._sharedPresentationKeys.set(uri, getSharedLyricPresentationKey(
        currentProvider, modes, generationOptions, pronunciationNotation, rendererVersion,
      ));
      const sharedDisplayLyrics = page.applyCulturalAnnotations(
        sharedSnapshot.displayLyrics,
        uri
      );
      commitPresentation(sharedDisplayLyrics, true);
      return;
    }

    const processMode = async (mode, baseLyrics, onProgress = null) => {
      if (!mode || mode === "none") {
        debug("[processMode] Mode is none or empty:", mode);
        return null;
      }
      debug("[processMode] Processing mode:", mode);
      try {
        if (String(mode).startsWith("gemini")) {
          const result = await page.getGeminiTranslation(
            lyricsState,
            baseLyrics,
            mode,
            onProgress
          );
          debug("[processMode] Gemini result sample:", result?.[0]);
          return result;
        }
        return await page.getTraditionalConversion(
          lyricsState,
          baseLyrics,
          originalLanguage,
          mode
        );
      } catch (error) {
        if (!isActivePresentation()) {
          return null;
        }
        const modeDisplayName =
          mode === "gemini_romaji"
            ? translate("notifications.romajiTranslationFailed")
            : translate("notifications.koreanTranslationFailed");
        notifyError(`${modeDisplayName}: ${error.message || "Unknown error"}`);
        return null;
      }
    };

    // If no display modes are active, just optimize the original lyrics (e.g., to handle note lines)
    if (
      (!displayMode1 || displayMode1 === "none") &&
      (!displayMode2 || displayMode2 === "none")
    ) {
      const optimizedLyrics = page.optimizeTranslations(
        lyrics,
        null,
        null,
        null,
        null
      );
      const finalLyrics = Array.isArray(optimizedLyrics) ? optimizedLyrics : [];
      // 🔹 ivLyrics-overlay 앱으로 원문 가사 전송 (번역 모드 미사용)
      commitPresentation(finalLyrics, true);
      return;
    }

    // 즉시 원문 표시 - 번역이 로딩되는 동안에도 사용자가 가사를 볼 수 있도록
    // URI 체크: 곡이 변경되지 않았을 때만 표시
    if (isActivePresentation()) {
      const optimizedOriginal = page.optimizeTranslations(
        lyrics,
        null,
        null,
        null,
        null
      );
      const originalLyrics = Array.isArray(optimizedOriginal) ? optimizedOriginal : [];
      // 🔹 ivLyrics-overlay 앱으로 원문 가사 먼저 전송 (번역 로딩 전)
      // 발음/번역 생성이 오래 걸리더라도 오버레이는 원문을 즉시 표시해야 한다.
      commitPresentation(originalLyrics, false);
    }

    if (!isActivePresentation()) return;
    const results = prepareLyricSupplementResults(page._dmResults[currentUri], {
      modes,
      generationOptions,
      provider: currentProvider,
      rendererVersion,
      lyricsShapeSignature: getLyricsProcessingShapeSignature(lyrics),
      pronunciationNotation,
    });
    page._dmResults[currentUri] = results;
    const canApply = () => isActivePresentation() && page._dmResults?.[currentUri] === results;

    runProgressiveLyricSupplements({
      modes,
      results,
      isCurrent: canApply,
      request: (mode, onProgress) => processMode(mode, lyrics, onProgress),
      onProgress: (lyricsMode1, lyricsMode2) => stream.enqueue({
        uri, presentationSeq, lyrics, lyricsMode1, lyricsMode2, displayMode1, displayMode2, canApply,
      }),
      onCombined: (lyricsMode1, lyricsMode2, complete) => {
        stream.clearForPresentation(presentationSeq);
        applySupplements({
          uri: currentUri, lyrics, lyricsMode1, lyricsMode2, displayMode1, displayMode2,
        }, lyricsState.provider, canApply, finalLyrics => publishCurrentPresentation(finalLyrics, complete));
      },
      reportError: (slot, error) => console.error(`[Mode${slot}] Error:`, error),
    });
  }

  return { present, publish, enqueueStreamingTranslation: stream.enqueue, clear: stream.clear };
}
