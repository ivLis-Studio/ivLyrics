import { getLyricsTypographyStyleVariables } from "./lyricsTypography.mjs";
import { getLyricDisplayModes, getLyricLanguageMode, getSharedLyricPresentationKey } from "./lyricPresentationIdentity.mjs";
import { isKaraokeRenderMode, SYNCED, UNSYNCED } from "./lyricsRenderModes.mjs";
import { getPlainLyricsLines } from "./lyricDisplayText.mjs";

// Enhanced FAD container detection - try multiple selectors if main one fails.
// Reads/writes the passed domCache object's `fadContainer` field (same reference,
// same caching semantics) and returns the resolved container element (or null).
export const resolveFadLyricsContainer = (document, domCache) => {
  let fadLyricsContainer = domCache?.fadContainer;

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
    if (domCache) {
      domCache.fadContainer = fadLyricsContainer;
    }
  }

  return fadLyricsContainer;
};

export function getLyricsPageRenderStyles({
  visual, state, isSyncCreatorActive, isFADMode, effectiveBackgroundMode,
  computeBaseLyricsStyleVariables, computeLyricsBackgroundStyle, shouldReduceMotion,
}) {
  const baseLyricsStyleVariables = {
    "--lyrics-color-active": visual["active-color"],
    "--lyrics-color-inactive": visual["inactive-color"],
    "--lyrics-color-background": "transparent",
    "--lyrics-highlight-background": visual["highlight-color"],
    "--lyrics-background-noise": visual.noise
      ? "var(--background-noise)"
      : "unset",
  };

  const baseStyles = computeBaseLyricsStyleVariables({
    isSyncCreatorActive,
    isFADMode,
    effectiveBackgroundMode,
    colors: state.colors,
    baseLyricsStyleVariables,
  });

  const backgroundStyle = computeLyricsBackgroundStyle({
    isSyncCreatorActive,
    isFADMode,
    effectiveBackgroundMode,
    dynamicColors: state.dynamicColors,
    colors: state.colors,
  });

  const vinylTrackAccent = state.colors.background || "";

  const reduceMotion = shouldReduceMotion();
  let styleVariables = {
    ...baseStyles,
    ...getLyricsTypographyStyleVariables(visual),
    "--highlight-inactive-opacity":
      (100 - (visual["highlight-intensity"] || 70)) / 100,
    "--animation-tempo": state.tempo,
    "--fullscreen-tmi-font-size": (visual["fullscreen-tmi-font-size"] || 100) / 100,
    "--iv-motion-ease-standard": "cubic-bezier(0.22, 1, 0.36, 1)",
    "--iv-motion-duration-fast": reduceMotion ? "1ms" : "180ms",
    "--iv-motion-duration-medium": reduceMotion ? "1ms" : "280ms",
    "--iv-motion-duration-slow": reduceMotion ? "1ms" : "420ms",
    "--iv-lyrics-centering-duration": reduceMotion ? "1ms" : "280ms",
    "--iv-lyrics-centering-ease": "cubic-bezier(0.20, 0.70, 0.42, 0.96)",
    "--iv-motion-distance-sm": reduceMotion ? "0px" : "10px",
    "--iv-motion-distance-md": reduceMotion ? "0px" : "18px",
    ...(vinylTrackAccent ? {
      "--iv-vinyl-track-accent": vinylTrackAccent,
    } : {}),
  };
  if (isSyncCreatorActive) {
    styleVariables = {
      ...styleVariables,
      "--lyrics-color-active": "var(--spice-text, #ffffff)",
      "--lyrics-color-inactive": "var(--spice-subtext, rgba(255, 255, 255, 0.58))",
      "--lyrics-color-background": "var(--spice-main, #121212)",
      "--lyrics-highlight-background": "transparent",
      "--lyrics-background-noise": "unset",
      "--lyrics-original-opacity": 1,
      "--lyrics-translation-opacity": 0,
      "--lyrics-phonetic-opacity": 0,
      "--lyrics-text-shadow": "0 0 0 transparent",
      "--lyrics-shadow-enabled": 0,
      "--lyrics-text-drop-shadow": "none",
    };
  }
  return { styleVariables, backgroundStyle, vinylTrackAccent };
}

export function resolveLyricsPageRenderMode(page, {
  visual, isSyncCreatorActive, getDisplayModeGenerationOptions,
  getCurrentLyricsPronunciationNotation, getSyncDataRendererCacheVersion,
}) {
  const lyricsState = page.state;
  let mode = page.getCurrentMode();
  const syncCreatorPlainLyrics = isSyncCreatorActive
    ? getPlainLyricsLines(lyricsState.unsynced, lyricsState.currentLyrics, lyricsState.synced, lyricsState.karaoke)
    : [];
  if (isSyncCreatorActive && syncCreatorPlainLyrics.length > 0) {
    mode = UNSYNCED;
  }
  const firstTimedLyricStartTimeMs = Number(lyricsState.currentLyrics?.[0]?.startTime);
  const defaultCommunityVideoStartTime =
    (isKaraokeRenderMode(mode) || mode === SYNCED) &&
      Number.isFinite(firstTimedLyricStartTimeMs) &&
      firstTimedLyricStartTimeMs >= 0
      ? firstTimedLyricStartTimeMs / 1000
      : 0;

  const originalLanguage = page.provideLanguageCode(lyricsState.currentLyrics);
  const modeKey = getLyricLanguageMode(originalLanguage);
  const friendlyLanguage = modeKey === "gemini" ? null : modeKey;
  const displayModes = getLyricDisplayModes(visual, modeKey);
  const [displayMode1, displayMode2] = displayModes;
  const generationOptions = displayModes.map(getDisplayModeGenerationOptions);
  const culturalAnnotationsMode = page.isCulturalAnnotationsEnabled()
    ? `culture-${page.getTranslationTargetLanguage()}`
    : "culture-off";
  const requestKey = [
    mode,
    `${displayMode1 || "none"}${generationOptions[0]}`,
    `${displayMode2 || "none"}${generationOptions[1]}`,
    culturalAnnotationsMode,
  ].join("_");

  // Always render the Conversions button on synced/unsynced pages.
  // Previously it was gated by detected language/loading state, causing it to
  // be hidden on initial load or for non-target languages (e.g., English).
  const potentialMode =
    lyricsState.explicitMode !== -1
      ? lyricsState.explicitMode
      : lyricsState.isLoading
        ? page.lastModeBeforeLoading || SYNCED
        : mode;

  const showTranslationButton =
    isKaraokeRenderMode(potentialMode) ||
    potentialMode === SYNCED ||
    potentialMode === UNSYNCED ||
    mode === -1;

  // 번역 재생성 버튼 활성화 조건 확인
  const translationProvider =
    visual["translate:translated-lyrics-source"];
  const hasTranslationEnabled =
    translationProvider && translationProvider !== "none";
  const hasGeminiTranslation =
    hasTranslationEnabled &&
    (displayMode1?.startsWith("gemini") ||
      displayMode2?.startsWith("gemini"));

  // Gemini 번역이 실제로 로드되었는지 확인 (_dmResults 확인)
  const currentUri = lyricsState.uri;
  const sharedPresentationKey = getSharedLyricPresentationKey(
    lyricsState.provider,
    displayModes,
    generationOptions,
    getCurrentLyricsPronunciationNotation(),
    getSyncDataRendererCacheVersion(lyricsState),
  );
  const hasLoadedSharedPresentation =
    page._sharedPresentationKeys?.get(currentUri) === sharedPresentationKey;
  const hasLoadedGeminiTranslation = !!(
    hasGeminiTranslation &&
    (hasLoadedSharedPresentation || (
      page._dmResults &&
      page._dmResults[currentUri] &&
      ((displayMode1?.startsWith("gemini") &&
        page._dmResults[currentUri].mode1) ||
        (displayMode2?.startsWith("gemini") &&
          page._dmResults[currentUri].mode2))
    ))
  );

  const canRegenerateCulturalAnnotations =
    page.isCulturalAnnotationsEnabled() &&
    Array.isArray(lyricsState.currentLyrics) &&
    lyricsState.currentLyrics.length > 0;
  const canRegenerateTranslation =
    hasLoadedGeminiTranslation || canRegenerateCulturalAnnotations;
  return {
    mode, syncCreatorPlainLyrics, defaultCommunityVideoStartTime, originalLanguage, friendlyLanguage,
    displayMode1, displayMode2, showTranslationButton, canRegenerateTranslation,
    presentation: { lyricsState, mode, requestKey, isSyncCreatorActive },
  };
}
