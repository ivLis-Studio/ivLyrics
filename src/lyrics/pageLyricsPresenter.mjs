import {
  getLyricDisplayModes, getLyricLanguageMode, matchesLyricPlaybackPreferences, matchesLyricPresentation, getSharedLyricPresentationKey, readLyricPlaybackPreferences,
} from "./lyricPresentationIdentity.mjs";
import { getLyricsModeTypeKey } from "./lyricsRenderModes.mjs";
import { getCommittedLyricsTimingUpgrade } from "./pageLyricsTimingUpgrade.mjs";
import { createPageLyricsDisplay } from "./pageLyricsDisplay.mjs";
import {
  prepareLyricSupplementResults, runProgressiveLyricSupplements, createStreamingLyricsBuffer,
} from "./lyricSupplementPipeline.mjs";

export function createPageLyricsPresenter({
  page, getVisualSettings, getLyricsService, getLanguagePrompt,
  getCurrentTranslationTargetLanguage, getCurrentLyricsPronunciationNotation,
  getTranslationStyle = () => "natural",
  getDisplayModeGenerationOptions, getSyncDataRendererCacheVersion,
  getLyricsProcessingShapeSignature, getNonSectionLyricsText,
  translate, notifyError, debug, scheduleTimer, cancelTimer, publishReady,
}) {
  const display = createPageLyricsDisplay(page);
  let lastTrackUri;

  function publish(lyrics, context = {}, deliveryOptions) {
    const { uri = page.state.uri } = context;
    if (!display.ownsTrack(uri)) return null;
    const {
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
      playbackPreferences: readLyricPlaybackPreferences(
        key => getVisualSettings?.()?.[key], page.trackLanguageOverride,
      ),
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
      const isCurrent = () => canShowStream(payload);
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

  function canShowStream({ uri, presentationSeq, canApply }) {
    return display.ownsTrack(uri)
      && (presentationSeq == null || presentationSeq === page._lyricsPresentationSeq)
      && canApply?.() !== false;
  }

  function enqueueStreamingTranslation(payload) {
    if (canShowStream(payload)) stream.enqueue(payload);
  }

  function applySupplements({
    uri, lyrics, lyricsMode1, lyricsMode2, displayMode1, displayMode2,
  }, provider, isCurrent, onCommit) {
    const optimized = page.optimizeTranslations(
      lyrics, lyricsMode1, lyricsMode2,
      lyricsMode1 ? displayMode1 : null, lyricsMode2 ? displayMode2 : null,
    );
    display.commit({ lyrics: Array.isArray(optimized) ? optimized : [], uri, provider, isCurrent }, onCommit);
  }

  function present(lyricsState, mode) {
    if (!lyricsState || !display.ownsTrack(lyricsState.uri) || !page.isCurrentLyricsState(lyricsState)) return;
    const { uri, provider } = lyricsState;
    const presentationSeq = ++page._lyricsPresentationSeq;
    stream.clear();
    let generationSettingsCurrent = () => true;
    const isActivePresentation = () =>
      presentationSeq === page._lyricsPresentationSeq &&
      page.isCurrentLyricsState(lyricsState) &&
      generationSettingsCurrent() && display.ownsTrack(uri);

    const lyrics = page.resolveLyricsForMode(lyricsState, mode);
    if (!lyrics) {
      if (lyricsState.isLoading || !isActivePresentation()) return;
      display.commit({
        lyrics: [], uri, provider, isCurrent: isActivePresentation,
        patch: { lyricsStatus: "empty", lyricsDisplayUri: uri },
      }, displayed => publish(displayed, {
        uri, provider: provider || null, karaokeSource: lyricsState.karaokeSource || null, mode,
      }));
      return;
    }

    if (lastTrackUri !== uri) {
      page._dmResults = {};
      page._inflightGemini = new Map();
      lastTrackUri = uri;
    }

    // Handle translation and display modes efficiently
    const originalLanguage = page.provideLanguageCode(lyrics);
    const sourceLanguage = originalLanguage || "auto";
    const sourcePreference = page.getSourceLanguagePreference?.();
    const readPlaybackPreferences = () => readLyricPlaybackPreferences(
      key => getVisualSettings()?.[key], page.trackLanguageOverride,
    );
    const playbackPreferences = readPlaybackPreferences();
    const isSourceCurrent = () => page.getSourceLanguagePreference?.() === sourcePreference
      && matchesLyricPlaybackPreferences(playbackPreferences, readPlaybackPreferences());
    generationSettingsCurrent = isSourceCurrent;
    const modeKey = getLyricLanguageMode(originalLanguage);

    const firstLanguagePrompt = getLanguagePrompt()?.maybePrompt?.({
      sourceLang: originalLanguage,
      targetLang: getCurrentTranslationTargetLanguage(),
      modeKey,
    });
    if (firstLanguagePrompt) {
      const originalLyrics = page.optimizeTranslations(lyrics, null, null, null, null);
      if (isActivePresentation()) {
        display.commit({ lyrics: Array.isArray(originalLyrics) ? originalLyrics : [], uri, provider, isCurrent: isActivePresentation });
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
    const generationOptions = modes.map(mode => getDisplayModeGenerationOptions(mode, sourceLanguage));
    generationSettingsCurrent = () => isSourceCurrent() && getLyricDisplayModes(getVisualSettings(), modeKey).every(
      (mode, index) => mode === modes[index] && getDisplayModeGenerationOptions(mode, sourceLanguage) === generationOptions[index]
    );

    page.language = originalLanguage;
    page.displayMode = displayMode1; // Keep for legacy compatibility
    page.displayMode2 = displayMode2;

    const commitPresentation = (lyrics, complete) => display.commit({
      lyrics, uri, provider, isCurrent: isActivePresentation,
    }, displayed => publishCurrentPresentation(displayed, complete));
    const publishCurrentPresentation = (displayLyrics, presentationComplete) => {
      const timingUpgrade = getCommittedLyricsTimingUpgrade(page.state);
      return publish(displayLyrics, {
        uri,
        provider: provider || null,
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
    const currentProvider = provider || "";
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
        playbackPreferences,
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
    const results = prepareLyricSupplementResults(page._dmResults[uri], {
      modes,
      generationOptions,
      provider: currentProvider,
      rendererVersion,
      lyricsShapeSignature: getLyricsProcessingShapeSignature(lyrics),
      pronunciationNotation,
    });
    page._dmResults[uri] = results;
    const canApply = () => isActivePresentation() && page._dmResults?.[uri] === results;

    runProgressiveLyricSupplements({
      modes,
      results,
      isCurrent: canApply,
      request: (mode, onProgress) => processMode(mode, lyrics, onProgress),
      onProgress: (lyricsMode1, lyricsMode2) => enqueueStreamingTranslation({
        uri, presentationSeq, lyrics, lyricsMode1, lyricsMode2, displayMode1, displayMode2, canApply,
      }),
      onCombined: (lyricsMode1, lyricsMode2, complete) => {
        stream.clearForPresentation(presentationSeq);
        applySupplements({
          uri, lyrics, lyricsMode1, lyricsMode2, displayMode1, displayMode2,
        }, provider, canApply, finalLyrics => publishCurrentPresentation(finalLyrics, complete));
      },
      reportError: (slot, error) => console.error(`[Mode${slot}] Error:`, error),
    });
  }

  return { present, publish, enqueueStreamingTranslation, clear: stream.clear };
}
